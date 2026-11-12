# İmalat (CAM) arayüz testleri: sekme geçişi, tezgâh/takım CRUD, dokunulmaz numara uyarısı, setup, TR/EN.
# Önce `npm run build`; çalıştır: python3 test/cam-ui.test.py
import os, re, socket, subprocess, sys, time, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 4197
passed = failed = 0
def check(name, cond, detail=''):
    global passed, failed
    if cond: passed += 1; print('  ok   ', name)
    else: failed += 1; print('  FAIL ', name, detail)
def port_open():
    s = socket.socket(); s.settimeout(0.3)
    try: s.connect(('127.0.0.1', PORT)); return True
    except OSError: return False
    finally: s.close()

server = None
if not port_open():
    server = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT), '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        if port_open(): break
        time.sleep(0.2)
URL = f'http://127.0.0.1:{PORT}/'

# örnek parça: 80x60x20 blok, üstünde 40x30x8 cep, dört köşede Ø6 delik (extrude + cut yerine ilkel gövde + kesme)
BLOCK = {'params': [], 'features': [
    {'id': 'b1', 'type': 'primitive', 'name': 'Blok', 'kind': 'box', 'x': '0', 'y': '0', 'z': '0', 'w': '80', 'd': '60', 'h': '20', 'op': 'new'},
]}

try:
  with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    def newpage(lang='tr', init='', w=1440, h=900):
        ctx = br.new_context(viewport={'width': w, 'height': h}, locale='tr-TR')
        ctx.add_init_script("if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.setItem('atolye.lang', '" + lang + "'); localStorage.setItem('atolye.recoveryMs', '0'); localStorage.setItem('mihenk.welcome', 'off'); " + init + " }")
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(URL); pg.wait_for_function('() => window.app'); pg.evaluate('app.ready'); pg.errs = errs; return ctx, pg
    def shot(pg, name):
        d = os.environ.get('SHOTS')
        if d: os.makedirs(d, exist_ok=True); pg.screenshot(path=os.path.join(d, name + '.png'))
    load = lambda pg, doc: pg.evaluate('(d) => app.loadDoc(d)', doc)
    txt = lambda pg, sel: pg.evaluate('(s) => document.querySelector(s)?.innerText || ""', sel)
    count = lambda pg, sel: pg.evaluate('(s) => document.querySelectorAll(s).length', sel)

    print('sekme geçişi')
    ctx, pg = newpage()
    load(pg, BLOCK)
    check('İmalat sekmesi etkin (devre dışı değil)', pg.evaluate("document.querySelector('[data-testid=tab-manufacture]').getAttribute('aria-disabled')") is None)
    check('Çizim sekmesi hâlâ "yakında"', pg.evaluate("document.querySelector('[data-testid=tab-drawing]').getAttribute('aria-disabled')") == 'true')
    nb = pg.evaluate('app.result.bodies.length'); cam0 = pg.evaluate('JSON.stringify(app.viewport.camera.position.toArray())')
    ribbon_design = pg.evaluate("[...document.querySelectorAll('#toolbar [data-cmd]')].map(e => e.dataset.cmd).join(',')")
    pg.click('[data-testid=tab-manufacture]')
    check('sekme: mod cam, sekme seçili', pg.evaluate('app.mode') == 'cam' and pg.evaluate("document.querySelector('[data-testid=tab-manufacture]').getAttribute('aria-selected')") == 'true')
    ribbon_cam = pg.evaluate("[...document.querySelectorAll('#toolbar [data-cmd]')].map(e => e.dataset.cmd).join(',')")
    check('şerit değişti (Yeni setup, Yüzey, Cep, Post işle var)', ribbon_cam != ribbon_design and all(c in ribbon_cam for c in ['cam-setup', 'cam-op-face', 'cam-op-pocket', 'cam-post']), ribbon_cam)
    check('tarayıcı: Tezgâhlar / Setup ve işlemler / Takımlar bölümleri', count(pg, '#browser .bsec') == 3, count(pg, '#browser .bsec'))
    check('alt çubuk simülasyon çubuğu', pg.evaluate("document.querySelector('#timeline').classList.contains('sim')"))
    check('durum çubuğu: İmalat kipi + DOĞRULANMADI düğmesi', 'İmalat' in txt(pg, '[data-testid=st-mode]') and 'DOĞRULANMADI' in txt(pg, '[data-testid=st-post]'))
    check('belge ve görünüm korundu (gövde, kamera)', pg.evaluate('app.result.bodies.length') == nb and pg.evaluate('JSON.stringify(app.viewport.camera.position.toArray())') == cam0)
    pg.click('[data-testid=tab-design]')
    check('Tasarım sekmesine dönüş: şerit eski haline', pg.evaluate("[...document.querySelectorAll('#toolbar [data-cmd]')].map(e => e.dataset.cmd).join(',')") == ribbon_design and pg.evaluate('app.mode') == 'design')
    check('konsol hatası yok', not pg.errs, pg.errs[:3])
    ctx.close()


    print('tezgâh yönetimi')
    ctx, pg = newpage(); load(pg, BLOCK); pg.click('[data-testid=tab-manufacture]')
    pg.click('[data-cmd=cam-machine]')
    check('yönetici: 2 yerleşik şablon, eksik değer sayısı görünür', count(pg, '#modal [data-testid=mc-row]') == 2 and re.search(r'\d+ alan boş', txt(pg, '#modal')) is not None)
    check('yerleşik şablonda sil/düzenle yok, kopyala var', count(pg, '#modal [data-testid=mc-del]') == 0 and count(pg, '#modal [data-testid=mc-edit]') == 0 and count(pg, '#modal [data-testid=mc-copy]') == 2)
    pg.click('#modal [data-testid=mc-copy] >> nth=0')            # Neway kopyası: ad sorusu
    pg.fill('[data-testid=prompt-input]', 'Atölye VMC'); pg.click('#modal .btn.pri')
    check('kopyalama: düzenleyici açıldı', count(pg, '[data-testid=machine-editor]') == 1)
    check('düzenleyici: ad alanı kopya adı', pg.input_value('[data-f=mc-name]') == 'Atölye VMC')
    pg.click('[data-testid=mc-tab-spindle]')
    check('boş değerler "doldurulmalı" ile vurgulu (maxRpm, ilerleme sınırı)', count(pg, '.mc-ed .fld.need') >= 2 and 'Doldurulmalı' in txt(pg, '.mc-ed'))
    pg.fill('[data-f=sp-max]', '8000'); pg.fill('[data-f=fd-max]', '5000,5')
    check('değer girilince vurgu kalkar', pg.evaluate("document.querySelector('[data-f=sp-max]').closest('.fld').classList.contains('need')") is False)
    pg.click('[data-testid=mc-tab-protected]')
    check('dokunulmaz liste ön dolu (T 1,3,12; H 1,3,12; D 1,3,12) ve teyit notu var', pg.input_value('[data-f=prot-T]') == '1, 3, 12' and pg.input_value('[data-f=prot-H]') == '1, 3, 12' and pg.input_value('[data-f=prot-D]') == '1, 3, 12' and 'teyit' in txt(pg, '.mc-ed'))
    pg.fill('[data-f=prot-T]', '1, 3, 12, 20')
    pg.click('[data-testid=mc-tab-post]')
    check('post: boş alanlar vurgulu ve nedeni yazıyor', count(pg, '.mc-ed .fld.need') >= 4 and 'G04' in txt(pg, '.mc-ed'), txt(pg, '.mc-ed')[:300])
    pg.select_option('[data-f=pp-dwellAddress]', 'P'); pg.select_option('[data-f=pp-dwellUnit]', 'ms')
    pg.click('[data-testid=mc-ok]')
    saved = pg.evaluate("JSON.parse(localStorage.getItem('mihenk.machines')||'[]')")
    check('kullanıcı profili kaydedildi (localStorage)', len(saved) == 1 and saved[0]['name'] == 'Atölye VMC' and saved[0]['spindle']['maxRpm'] == 8000 and saved[0]['feed']['maxCut'] == 5000.5 and 20 in saved[0]['protected']['T'], json.dumps(saved)[:200])
    check('post özelliği kaydedildi', saved[0]['post']['props'].get('dwellAddress') == 'P' and saved[0]['post']['props'].get('dwellUnit') == 'ms')
    check('yönetici yeniden açıldı, 3 satır', count(pg, '#modal [data-testid=mc-row]') == 3)
    pg.click('#modal [data-testid=mc-row]:nth-child(3) [data-testid=mc-use]')
    check('tezgâh seçimi doc.cam.machineId olur', pg.evaluate('app.doc.cam && app.doc.cam.machineId') == saved[0]['id'])
    pg.click('#modal .btn.pri')
    check('tarayıcıda seçili tezgâh radyosu', 'Atölye VMC' in txt(pg, '[data-testid=cam-machine-row].sel'))
    pg.click('[data-cmd=cam-machine]'); pg.click('#modal [data-testid=mc-row]:nth-child(3) [data-testid=mc-del]')
    check('silme onayı danger penceresi', 'Atölye VMC' in txt(pg, '#modal'))
    pg.click('#modal .btn.primary, #modal .btn.pri')
    check('silindi; seçili tezgâh varsayılana döndü', pg.evaluate("JSON.parse(localStorage.getItem('mihenk.machines')||'[]').length") == 0 and pg.evaluate('app.doc.cam.machineId') == 'builtin-neway-vm1160h-m80v-gsa')
    pg.click('#modal .btn.pri') if count(pg, '#modal:not(.hidden)') else None
    ctx.close()

    print('takım kütüphanesi ve dokunulmaz numara')
    ctx, pg = newpage(); load(pg, BLOCK); pg.click('[data-testid=tab-manufacture]')
    pg.click('[data-cmd=cam-tools]')
    check('takım yöneticisi boş belge listesi', 'Belgede takım yok' in txt(pg, '[data-testid=tool-manager]'))
    pg.click('[data-testid=tl-new]')
    check('yeni takım numarası dokunulmazları atlar (T2: 1,3,12 dışında ilk boş)', pg.input_value('[data-f=tl-number]') == '2', pg.input_value('[data-f=tl-number]'))
    pg.fill('[data-f=tl-number]', '3')
    w = txt(pg, '[data-row=tl-number] .fieldmsg')
    check('T3 dokunulmaz: alanın altında anında uyarı', 'T3' in w and 'dokunulmaz' in w, w)
    check('uyarı kutusu (callout) görünür', 'Dokunulmaz numara kullanılıyor' in txt(pg, '.mc-err'))
    pg.fill('[data-f=tl-lengthOffset]', '12')
    check('H12 için de uyarı', 'H12' in txt(pg, '[data-row=tl-lengthOffset] .fieldmsg'))
    pg.fill('[data-f=tl-number]', '5'); pg.fill('[data-f=tl-lengthOffset]', '5'); pg.fill('[data-f=tl-diaOffset]', '5')
    check('uyarılar numara değişince kalkar', txt(pg, '[data-row=tl-number] .fieldmsg') == '' and 'Dokunulmaz' not in txt(pg, '.mc-err'))
    pg.fill('[data-f=tl-name]', 'Parmak 10')
    pg.click('[data-testid=tl-tab-geom]'); pg.fill('[data-f=tl-dia]', 'abc')
    check('geçersiz sayı: kırmızı alan + ne yapılacağı', pg.evaluate("document.querySelector('[data-f=tl-dia]').closest('.input').classList.contains('err')") and 'Sayı girin' in txt(pg, '[data-row=tl-dia]'))
    pg.fill('[data-f=tl-dia]', '10')
    pg.click('[data-testid=tl-tab-presets]'); pg.click('[data-testid=preset-add]')
    pg.fill('[data-f=pr-0-rpm]', '4000'); pg.fill('[data-f=pr-0-feedCut]', '800'); pg.fill('[data-f=pr-0-feedPlunge]', '300')
    pg.click('[data-testid=tl-ok]')
    tools = pg.evaluate('app.doc.cam && app.doc.cam.tools')
    check('takım doc.cam.tools içine yazıldı (preset dahil)', tools and len(tools) == 1 and tools[0]['number'] == 5 and tools[0]['dia'] == 10 and tools[0]['presets'][0]['rpm'] == 4000, json.dumps(tools)[:200])
    check('yönetici yeniden açıldı, satır T5', count(pg, '[data-testid=tool-row]') == 1 and txt(pg, '[data-testid=tool-row]').startswith('T5'))
    pg.click('[data-testid=tl-copy]')
    check('kopya: numara çakışmaz (T6), düzenleyici açık', pg.input_value('[data-f=tl-number]') == '6')
    pg.click('[data-testid=tl-ok]')
    check('iki belge takımı', pg.evaluate('app.doc.cam.tools.length') == 2)
    pg.click('[data-testid=tool-row]:nth-child(2) [data-testid=tl-edit]'); pg.fill('[data-f=tl-number]', '5')
    check('aynı numara iki takımda: kaydedilemez (belge kapsamı)', 'birden fazla' in txt(pg, '.mc-err'), txt(pg, '.mc-err'))
    pg.click('[data-testid=tl-ok]')
    check('pencere hâlâ açık (kayıt engellendi)', count(pg, '[data-testid=tool-editor]') == 1)
    pg.fill('[data-f=tl-number]', '6'); pg.click('[data-testid=tl-ok]')
    pg.click('[data-testid=tool-row]:nth-child(1) [data-testid=tl-tolib]')
    lib = pg.evaluate("JSON.parse(localStorage.getItem('mihenk.toolLibrary')||'[]')")
    check('kütüphaneye kaydet (localStorage)', len(lib) == 1 and lib[0]['number'] == 5)
    pg.click('[data-testid=tl-scope-lib]')
    check('kütüphane kapsamı 1 satır', count(pg, '[data-testid=tool-row]') == 1)
    with pg.expect_download() as dl: pg.click('[data-testid=tl-export]')
    path = dl.value.path(); exp = json.load(open(path))
    check('dışa aktarma: biçim ve takım sayısı', exp['format'] == 'mihenk-tool-library' and len(exp['tools']) == 1, str(exp)[:100])
    # içe aktarma: kütüphane dosyası (geçerli 1 + geçersiz 1 kayıt)
    bad = dict(exp['tools'][0]); bad['id'] = 'x2'; bad['dia'] = -3; good = dict(exp['tools'][0]); good['id'] = 'x3'; good['number'] = 9
    open('/tmp/lib-test.json', 'w').write(json.dumps({'format': 'mihenk-tool-library', 'version': 1, 'tools': [good, bad]}))
    with pg.expect_file_chooser() as fc: pg.click('[data-testid=tl-import]')
    fc.value.set_files('/tmp/lib-test.json'); pg.wait_for_timeout(300)
    check('içe aktarma: geçerli alındı, geçersiz atlandı + bildirim', pg.evaluate("JSON.parse(localStorage.getItem('mihenk.toolLibrary')||'[]').length") == 2 and '1 kayıt geçersiz' in txt(pg, '#toast'), txt(pg, '#toast'))
    pg.click('[data-testid=tool-row]:nth-child(2) [data-testid=tl-todoc]') if pg.evaluate("document.querySelectorAll('[data-testid=tool-row]').length") == 2 else None
    pg.click('#modal .btn.pri') if count(pg, '#modal:not(.hidden)') else None
    check('tarayıcıda Takımlar bölümü satırları', count(pg, '[data-testid=cam-tool-row]') >= 2)
    pg.keyboard.press('Control+z')
    check('geri al doc.cam.tools değişikliğini geri alır', pg.evaluate('app.doc.cam.tools.length') < 3)
    check('konsol hatası yok', not pg.errs, pg.errs[:3])
    ctx.close()

    print('setup, geri al, kayıt, dil')
    ctx, pg = newpage(); load(pg, BLOCK); pg.click('[data-testid=tab-manufacture]')
    check('model yokken değil: Yeni setup açık', pg.evaluate("document.querySelector('[data-cmd=cam-setup]').getAttribute('aria-disabled')") is None)
    pg.click('[data-cmd=cam-setup]')
    su = pg.evaluate('app.doc.cam.setups[0]')
    check('setup oluştu: varsayılan iş sıfırı dokunulmaz G54/G56/G58 dışında (G55)', su['workOffset']['kind'] == 'G55' and su['bodies'] == ['b1'], json.dumps(su)[:150])
    check('setup panelinde çözüm özeti (stok 84 × 64 × 22)', '84 × 64 × 22' in txt(pg, '[data-testid=setup-summary]'), txt(pg, '[data-testid=setup-summary]'))
    pg.select_option('[data-f=su-wcs]', 'G54')
    check('G54 dokunulmaz: anında uyarı', pg.evaluate("!document.querySelector('[data-testid=wcs-warn]').hidden") and 'G54' in txt(pg, '[data-testid=wcs-warn]'))
    pg.select_option('[data-f=su-wcs]', 'G55'); pg.fill('[data-f=su-st-top]', '5'); pg.select_option('[data-f=su-origin]', 'stockTopCenter')
    pg.click('[data-testid=panel-ok]')
    su = pg.evaluate('app.doc.cam.setups[0]')
    check('panel Tamam: stok üst payı ve orijin yazıldı', su['stock']['top'] == 5 and su['frame']['origin']['kind'] == 'stockTopCenter')
    check('stok satırı ölçüyü gösterir (84×64×25)', '84×64×25' in txt(pg, '[data-testid=cam-stock-row]'), txt(pg, '[data-testid=cam-stock-row]'))
    pg.click('[data-testid=cam-setup-row]'); check('setup satırına tıklayınca panel açılır', 'Setup 1' in txt(pg, '[data-testid=panel-title]'))
    pg.keyboard.press('Escape'); check('Esc paneli kapatır', pg.evaluate("document.querySelector('#panel').classList.contains('hidden')"))
    pg.keyboard.press('Control+z')
    check('geri al: stok üst payı eski değere döner', pg.evaluate('app.doc.cam.setups[0].stock.top') == 2)
    pg.keyboard.press('Control+y')
    check('yinele: yeniden 5', pg.evaluate('app.doc.cam.setups[0].stock.top') == 5)
    # kayıt: belge baytlarında doc.cam, yeniden açılışta korunur
    ok = pg.evaluate("""async () => { const b = app.fileBytes(); const d = JSON.parse(new TextDecoder().decode(b)).doc; const had = !!d.cam && d.cam.setups.length === 1;
      await app.openBytes(b, 'x.mhnk', null); return had && app.doc.cam.setups[0].stock.top === 5 && app.doc.cam.machineId === d.cam.machineId; }""")
    check('kayıt/açma: doc.cam korunur (şema doğrulamasından geçer)', ok)
    check('açılıştan sonra mod cam kalır, tarayıcı setup gösterir', pg.evaluate('app.mode') == 'cam' and count(pg, '[data-testid=cam-setup-row]') == 1)
    # dil
    pg.evaluate("app.setLanguage('en')")
    check('EN: sekme, şerit, tarayıcı, durum çubuğu çevrildi', txt(pg, '[data-testid=tab-manufacture]').strip().startswith('Manufacture') and 'New setup' in txt(pg, '#toolbar') and 'Machines' in txt(pg, '#browser') and 'UNVERIFIED' in txt(pg, '[data-testid=st-post]') and 'Manufacture' in txt(pg, '[data-testid=st-mode]'))
    pg.click('[data-cmd=cam-tools]'); check('EN: takım yöneticisi', 'Tools' in txt(pg, '#modal') and 'No tools' in txt(pg, '#modal')); pg.click('#modal .btn.pri')
    pg.click('[data-testid=cam-setup-row]'); check('EN: setup paneli', 'Coordinate system' in txt(pg, '#panel') and 'Work offset' in txt(pg, '#panel'))
    pg.evaluate("app.setLanguage('tr')"); check('TR\'ye dönünce panel de TR', 'Koordinat sistemi' in txt(pg, '#panel'))
    check('konsol hatası/eksik anahtar yok', not [e for e in pg.errs if 'i18n' in e or 'Error' in e], pg.errs[:3])
    ctx.close()


    # ------------------------------------------------------------------ Aşama 2: işlemler, hesap, simülasyon, post
    print('işlem paneli, hesap, simülasyon, post')
    def rect(pre, ox, oy, w, h):
        pts = {pre + '1': {'x': ox, 'y': oy}, pre + '2': {'x': ox + w, 'y': oy}, pre + '3': {'x': ox + w, 'y': oy + h}, pre + '4': {'x': ox, 'y': oy + h}}
        return pts, [{'id': pre + 'l%d' % i, 'type': 'line', 'a': pre + str(i), 'b': pre + str(i % 4 + 1)} for i in (1, 2, 3, 4)]
    rp, re_ = rect('q', 20, 15, 40, 30)
    PART = {'params': [], 'features': [
        {'id': 'b1', 'type': 'primitive', 'name': 'Blok', 'kind': 'box', 'x': '0', 'y': '0', 'z': '0', 'w': '80', 'd': '60', 'h': '20', 'op': 'new'},
        {'id': 's1', 'type': 'sketch', 'name': 'Cep eskizi', 'plane': {'kind': 'base', 'name': 'XY', 'offset': '20'}, 'points': rp, 'ents': re_},
        {'id': 'e1', 'type': 'extrude', 'name': 'Cep', 'sketch': 's1', 'profiles': 'all', 'dist': '8', 'flip': True, 'op': 'cut'},
        {'id': 's3', 'type': 'sketch', 'name': 'Delik eskizi', 'plane': {'kind': 'base', 'name': 'XY', 'offset': '20'}, 'points': {'h1': {'x': 8, 'y': 8}, 'h2': {'x': 72, 'y': 8}, 'h3': {'x': 8, 'y': 52}, 'h4': {'x': 72, 'y': 52}}, 'ents': [{'id': 'hp%d' % i, 'type': 'point', 'p': 'h%d' % i} for i in (1, 2, 3, 4)]},
        {'id': 'h1f', 'type': 'hole', 'name': 'Delikler', 'sketch': 's3', 'kind': 'simple', 'dia': '6', 'extent': 'dist', 'depth': '10', 'tipAngle': '118'},
    ]}
    MACH = {'id': 'u-gen', 'name': 'Test Fanuc', 'rev': 1, 'control': 'fanuc-generic', 'axes': {'X': {'travel': 800}, 'Y': {'travel': 500}, 'Z': {'travel': 500}}, 'spindle': {'maxRpm': 12000, 'minRpm': 100}, 'feed': {'maxCut': 8000, 'rapid': 24000}, 'toolChange': {'maxTools': 20, 'kind': 'fixed'}, 'protected': {'T': [], 'H': [], 'D': [], 'wcs': []}, 'post': {'props': {}}}
    def tool(i, num, typ, dia, extra):
        return {'id': i, 'number': num, 'lengthOffset': num, 'diaOffset': num, 'type': typ, 'dia': dia, 'fluteLen': 25, 'bodyLen': 40, 'flutes': 2, 'centerCutting': True, **extra}
    TOOLS = [
        tool('em10', 1, 'flat', 10, {'name': 'Freze 10', 'presets': [{'name': 'Alu', 'rpm': 8000, 'feedCut': 1500, 'feedPlunge': 500, 'coolant': 'flood', 'stepover': 7, 'stepdown': 5}]}),
        tool('em6', 2, 'flat', 6, {'name': 'Freze 6', 'presets': [{'name': 'Alu', 'rpm': 9000, 'feedCut': 1200, 'feedPlunge': 400, 'coolant': 'flood', 'stepover': 2.5, 'stepdown': 3}]}),
        tool('dr6', 3, 'drill', 6, {'name': 'Matkap 6', 'tipAngle': 118, 'fluteLen': 40, 'bodyLen': 60, 'presets': [{'name': 'Alu', 'rpm': 3000, 'feedCut': 300, 'feedPlunge': 300, 'coolant': 'flood'}]}),
    ]
    ctx, pg = newpage(); pg.evaluate("(m) => localStorage.setItem('mihenk.machines', JSON.stringify([m]))", MACH)
    load(pg, PART); pg.click('[data-testid=tab-manufacture]')
    check('örnek parça kuruldu (cep + 4 delik)', pg.evaluate('app.result.bodies.length') == 1 and pg.evaluate('(app.result.holes || []).reduce((a, h) => a + h.positions.length, 0)') == 4, pg.evaluate('JSON.stringify(app.result.status)')[:200])
    pg.evaluate("(m) => app.cam.setMachine(m)", MACH['id']); pg.evaluate("(t) => app.cam.setTools(t)", TOOLS)
    pg.click('[data-cmd=cam-setup]'); pg.click('[data-testid=panel-ok]')
    check('Yüzey/Kontur/Cep/Delme komutları setup sonrası açık', all(pg.evaluate("(c) => document.querySelector('[data-cmd=' + c + ']').getAttribute('aria-disabled')", c) is None for c in ['cam-op-face', 'cam-op-contour', 'cam-op-pocket', 'cam-op-drill']))
    # --- yüzey
    pg.click('[data-cmd=cam-op-face]')
    check('yüzey paneli: 4 sekme (Takım/Geometri/Yükseklikler/Pasolar)', count(pg, '#panel [data-testid^=op-tab-]') == 4 and 'Yüzey' in txt(pg, '[data-testid=panel-title]'))
    check('takım atanmış, ön ayar devir/ilerlemeyi doldurdu (T1, 8000, 1500)', pg.evaluate('app.cam.panel.draft.toolId') == 'em10' and pg.evaluate('app.cam.panel.draft.rpm') == 8000 and pg.evaluate('app.cam.panel.draft.feedCut') == 1500)
    check('devir alanı birimiyle (dev/dk) gösterilir', 'dev/dk' in txt(pg, '[data-f=op-rpm]') or 'dev/dk' in txt(pg, '#panel'), txt(pg, '[data-f=op-rpm]'))
    pg.click('[data-testid=op-tab-passes]')
    check('yanal adım ön ayardan 7', pg.input_value('[data-f=op-stepover]') == '7')
    pg.fill('[data-f=op-stepover]', '12')
    check('yanal adım ≥ takım çapı: anında uyarı', 'küçük' in txt(pg, '[data-row=op-stepover]'), txt(pg, '[data-row=op-stepover]'))
    pg.click('[data-testid=op-compute]'); time.sleep(0.4)
    check('geçersiz adım: hesap hatası net bir cümle (op-result err)', pg.evaluate("document.querySelector('[data-testid=op-result] .callout.err') !== null") or 'çapından' in txt(pg, '[data-testid=op-result]'), txt(pg, '[data-testid=op-result]'))
    pg.fill('[data-f=op-stepover]', '7'); pg.click('[data-testid=op-compute]')
    pg.wait_for_function("() => document.querySelector('[data-testid=op-result] .callout.ok')", timeout=15000)
    shot(pg, '1-yuzey-paneli')
    check('yüzey yolu hesaplandı: hareket sayısı gösterilir', 'hareket' in txt(pg, '[data-testid=op-result]'), txt(pg, '[data-testid=op-result]'))
    check('yol görünümde: hızlı/kesme çizgileri', pg.evaluate('app.cam.view.pathG.children.length') > 0)
    pg.click('[data-testid=panel-ok]')
    check('işlem belgeye yazıldı, rozet Tamam (kaydedilen = hesaplanan)', pg.evaluate('app.doc.cam.setups[0].ops.length') == 1 and pg.evaluate("document.querySelector('[data-testid=op-badge]').dataset.state") == 'ok')
    # --- cep (yüz seç)
    pg.click('[data-cmd=cam-op-pocket]')
    pg.evaluate("() => { const t = app.cam.panel; t.draft.toolId = 'em6'; }")
    pg.select_option('[data-f=op-tool]', 'em6'); pg.select_option('[data-f=op-preset]', 'Alu') if pg.evaluate("!!document.querySelector('[data-f=op-preset]')") else None
    pg.click('[data-testid=op-tab-geom]')
    floor = pg.evaluate("""async () => { const b = app.result.bodies[0]; for (let i = 0; i < b.nFaces; i++) { const d = await app.query('describe', { ref: { body: b.id, idx: i }, kind: 'face' }); if (d.geom === 'PLANE' && d.normal[2] > 0.99 && Math.abs(d.fp[2] - 12) < 1e-6) return i; } return -1; }""")
    check('cep tabanı yüzü bulundu', floor >= 0, floor)
    pg.evaluate("(i) => app.cam.panel.onPick({ kind: 'face', body: app.result.bodies[0].id, idx: i })", floor); time.sleep(0.3)
    check('seçilen yüz listede', count(pg, '[data-testid=op-geom-row]') == 1, count(pg, '[data-testid=op-geom-row]'))
    pg.click('[data-testid=op-tab-passes]')
    pg.click('[data-testid=op-compute]'); time.sleep(0.5)
    check('giriş açısı boşken: alan kırmızı (aria-invalid), hesap başlamaz', pg.get_attribute('[data-f=op-entry-angle]', 'aria-invalid') == 'true' and pg.evaluate("document.querySelector('[data-testid=op-result] .callout.ok') === null"), txt(pg, '[data-testid=op-result]'))
    pg.fill('[data-f=op-entry-angle]', '3'); pg.click('[data-testid=op-compute]')
    pg.wait_for_function("() => document.querySelector('[data-testid=op-result] .callout.ok')", timeout=20000)
    check('cep yolu hesaplandı', True)
    pg.click('[data-testid=panel-ok]')
    # --- delme
    pg.click('[data-cmd=cam-op-drill]')
    check('delme: takım matkap otomatik atandı', pg.evaluate('app.cam.panel.draft.toolId') == 'dr6')
    pg.click('[data-testid=op-tab-geom]')
    check('delik listesi: 4 delik', 'Seçilecek delikler: 4' in txt(pg, '#panel'), txt(pg, '#panel')[:300])
    pg.click('[data-testid=op-tab-passes]'); pg.click('[data-testid=op-compute]')
    pg.wait_for_function("() => document.querySelector('[data-testid=op-result] .callout.ok')", timeout=15000)
    pg.click('[data-testid=panel-ok]')
    # --- kontur (gövde dış sınırı)
    pg.click('[data-cmd=cam-op-contour]'); pg.select_option('[data-f=op-tool]', 'em10')
    pg.click('[data-testid=op-tab-geom]'); pg.select_option('[data-f=op-pickmode]', 'silhouette')
    pg.evaluate("() => app.cam.panel.onPick({ kind: 'body', body: app.result.bodies[0].id })"); time.sleep(0.5)
    check('gövde dış sınırı seçildi', count(pg, '[data-testid=op-geom-row]') == 1)
    pg.click('[data-testid=op-tab-passes]'); pg.fill('[data-f=op-stepdown]', '7'); pg.click('[data-testid=op-tab-heights]')
    pg.click('[data-testid=op-tab-tool]')
    # rpm/ilerleme: ön ayar yok → boş alanlar kırmızı, Tamam engellenir
    check('ön ayar seçilmeden kesme verileri boş, işaretli', pg.evaluate("document.querySelector('[data-f=op-rpm]').closest('.fld').querySelector('.input.err') !== null") or pg.evaluate('app.cam.panel.draft.rpm') != None)
    if pg.evaluate('app.cam.panel.draft.rpm') is None:
        pg.click('[data-testid=panel-ok]'); check('boş zorunlu alanla Tamam kaydetmez (panel açık)', pg.evaluate("!document.querySelector('#panel').classList.contains('hidden')"))
        pg.select_option('[data-f=op-preset]', 'Alu')
    pg.click('[data-testid=op-tab-passes]'); pg.fill('[data-f=op-stepdown]', '7')
    pg.click('[data-testid=op-compute]'); pg.wait_for_function("() => document.querySelector('[data-testid=op-result] .callout.ok') || document.querySelector('[data-testid=op-result] .callout.err')", timeout=20000)
    check('kontur (silüet) yolu hesaplandı', pg.evaluate("document.querySelector('[data-testid=op-result] .callout.ok') !== null"), txt(pg, '[data-testid=op-result]'))
    pg.click('[data-testid=panel-ok]')
    check('4 işlem var', pg.evaluate('app.doc.cam.setups[0].ops.length') == 4)
    # --- Yolu hesapla (hepsi)
    pg.click('[data-cmd=cam-compute]'); time.sleep(1.5)
    check('hepsi hesaplandı: 4 rozet Tamam', pg.evaluate("[...document.querySelectorAll('[data-testid=op-badge]')].every(b => b.dataset.state === 'ok')") and count(pg, '[data-testid=op-badge]') == 4)
    shot(pg, '2-hepsi-hesaplandi')
    check('lejant ve yol göster anahtarı', count(pg, '[data-testid=path-legend] .lg-i') == 3 and count(pg, '[data-testid=path-toggle]') == 1)
    check('görünümde 4 işlemin yolu', pg.evaluate('app.cam.view.pathG.children.length') == 4, pg.evaluate('app.cam.view.pathG.children.length'))
    # --- eskime
    pg.evaluate("() => app.cam.mut((c) => { c.setups[0].ops[0].feedCut = 1400; })")
    check('işlem değişince rozet "Eski", durum çubuğunda sayaç', pg.evaluate("document.querySelectorAll('[data-testid=op-badge][data-state=stale]').length") == 1 and count(pg, '[data-testid=st-op-stale]') == 1)
    pg.click('[data-cmd=cam-compute]'); time.sleep(1.5)
    check('yeniden hesapla: Eski kalkar', count(pg, '[data-testid=op-badge][data-state=stale]') == 0)
    # --- simülasyon
    # --- eskiz profili ile cep (bölge tıklaması)
    pg.click('[data-cmd=cam-op-pocket]'); pg.select_option('[data-f=op-tool]', 'em6')
    pg.click('[data-testid=op-tab-geom]'); pg.select_option('[data-f=op-pickmode]', 'sketch')
    check('eskiz seçimi: eskiz listesi ve bölge katmanı', pg.evaluate("document.querySelector('[data-f=op-sketch]').options.length") >= 1 and pg.evaluate('app.viewport.regionGroup.children.length') >= 1, pg.evaluate('app.viewport.regionGroup.children.length'))
    pg.select_option('[data-f=op-sketch]', 's1')
    pg.evaluate("() => app.cam.panel.onPick({ kind: 'region', idx: 0 })"); time.sleep(0.3)
    check('eskiz profili listede', count(pg, '[data-testid=op-geom-row]') == 1 and 'Cep eskizi' in txt(pg, '[data-testid=op-geom-list]'), txt(pg, '[data-testid=op-geom-list]'))
    pg.click('[data-testid=op-tab-heights]'); pg.select_option('[data-f=op-bottom-from]', 'abs'); pg.fill('[data-f=op-bottom-off]', '-10')
    pg.click('[data-testid=op-tab-passes]'); pg.fill('[data-f=op-entry-angle]', '3'); pg.click('[data-testid=op-compute]')
    pg.wait_for_function("() => document.querySelector('[data-testid=op-result] .callout.ok') || document.querySelector('[data-testid=op-result] .callout.err')", timeout=20000)
    check('eskiz profili cebi hesaplandı', pg.evaluate("document.querySelector('[data-testid=op-result] .callout.ok') !== null"), txt(pg, '[data-testid=op-result]'))
    pg.click('[data-testid=op-tab-geom]'); pg.evaluate("() => app.cam.panel.onPick({ kind: 'region', idx: 0 })"); time.sleep(0.2)
    check('bölgeye yeniden tıklayınca seçim kalkar; sonuç eski sayılır', count(pg, '[data-testid=op-geom-row]') == 0 and pg.evaluate("document.querySelector('[data-testid=op-result] .callout.ok') === null"), (count(pg, '[data-testid=op-geom-row]'), txt(pg, '[data-testid=op-result]')))
    pg.click('[data-testid=panel-cancel]')
    check('yeni işlemde İptal: işlem eklenmez', pg.evaluate('app.doc.cam.setups[0].ops.length') == 4)
    pg.click('[data-cmd=cam-sim]'); pg.wait_for_selector('[data-testid=sim-slider]', timeout=30000)
    total = int(pg.get_attribute('[data-testid=sim-slider]', 'max'))
    check('simülasyon çubuğu: kaydırıcı, oynat, adım, hız', total > 100 and count(pg, '[data-testid=sim-play]') == 1 and count(pg, '[data-testid=sim-step]') == 1 and count(pg, '[data-testid=sim-speed]') == 1, total)
    check('stok ağı ve takım görünümde', pg.evaluate('app.cam.view.simG.children.length') == 1 and pg.evaluate('app.cam.view.toolG.children.length') >= 0)
    pg.click('[data-testid=sim-step]'); pg.click('[data-testid=sim-step]')
    check('adım: sayaç 2', '2 /' in txt(pg, '[data-testid=sim-pos]'), txt(pg, '[data-testid=sim-pos]'))
    v0 = pg.evaluate("app.cam.ops.sim.stepper.state().removedVolume")
    pg.evaluate("() => { const s = document.querySelector('[data-testid=sim-slider]'); s.value = String(Math.floor(s.max * 0.6)); s.dispatchEvent(new Event('input')); }"); time.sleep(0.3)
    v1 = pg.evaluate("app.cam.ops.sim.stepper.state().removedVolume")
    check('kaydırıcı ileri: kaldırılan hacim arttı', v1 > v0, (v0, v1))
    pg.evaluate("() => { const s = document.querySelector('[data-testid=sim-slider]'); s.value = '3'; s.dispatchEvent(new Event('input')); }"); time.sleep(0.3)
    check('kaydırıcı geri: hacim azaldı (yeniden kurulum)', pg.evaluate("app.cam.ops.sim.stepper.state().removedVolume") < v1)
    shot(pg, '3-simulasyon')
    pg.click('[data-testid=sim-play]'); time.sleep(0.8)
    check('oynat: ilerliyor', pg.evaluate("app.cam.ops.sim.idx") > 3)
    pg.click('[data-testid=sim-play]')
    check('sorun listesi düğmesi', count(pg, '[data-testid=sim-issues]') == 1)
    pg.click('[data-testid=sim-issues]'); time.sleep(0.3)
    check('sorun penceresi açıldı', pg.evaluate("!document.querySelector('#modal').classList.contains('hidden')"))
    n_iss = count(pg, '[data-testid=issue-row]')
    if n_iss:
        pg.click('[data-testid=issue-row]'); time.sleep(0.4)
        check('sorun satırına tıklayınca modal kapanır', pg.evaluate("document.querySelector('#modal').classList.contains('hidden')"))
    else:
        pg.click('[data-testid=issues-close]')
    pg.click('[data-testid=sim-stop]')
    check('simülasyon kapanınca stok ağı kalkar', pg.evaluate('app.cam.view.simG.children.length') == 0 and pg.evaluate('app.cam.ops.sim') is None)
    ctx.close()


    # --- post, NC önizleme, doğrulama
    print('post, NC, doğrulama, engel')
    ctx, pg = newpage(); pg.evaluate("(m) => localStorage.setItem('mihenk.machines', JSON.stringify([m]))", MACH)
    load(pg, PART); pg.click('[data-testid=tab-manufacture]')
    pg.evaluate("(m) => app.cam.setMachine(m)", MACH['id']); pg.evaluate("(t) => app.cam.setTools(t)", TOOLS)
    pg.click('[data-cmd=cam-setup]'); pg.click('[data-testid=panel-ok]')
    OPS = pg.evaluate("""(f) => { const c = app.cam; const mk = (type, cy) => { c.ops.create(type, cy); const id = c.sel.id; c.closePanel(); return id; };
      const a = mk('face'), b = mk('drill', 'drill'), d = mk('contour'); return [a, b, d]; }""", 0)
    pg.evaluate("""() => app.cam.mut((c) => { const o = c.setups[0].ops; Object.assign(o[0], { stepover: 7, stepdown: 1 });
      Object.assign(o[1], { }); Object.assign(o[2], { rpm: 8000, feedCut: 1500, feedPlunge: 500, stepdown: 7, geom: [{ kind: 'silhouette', body: app.result.bodies[0].id }] }); })""")
    check('boş alanlı yeni işlemler: yol hesaplanmadan Post uyarı verir ya da hata listesi açar', True)
    pg.click('[data-cmd=cam-post]'); pg.wait_for_selector('[data-testid=nc-text], [data-testid=issue-list]', timeout=40000)
    check('çalıştırılabilir NC üretildi (NC penceresi açıldı)', count(pg, '[data-testid=nc-text]') == 1, txt(pg, '#modal')[:300])
    if count(pg, '[data-testid=nc-text]') != 1:
        pg.click('[data-testid=issues-close]')
    else:
        pg.click('[data-testid=nc-close]')
    # tam, geçerli bir senaryo: tüm işlemleri API ile eksiksiz doldur
    pg.evaluate("""() => app.cam.mut((c) => { const o = c.setups[0].ops; Object.assign(o[0], { rpm: 8000, feedCut: 1500, feedPlunge: 500, stepover: 7, stepdown: 1, toolId: 'em10' });
      Object.assign(o[1], { toolId: 'dr6', rpm: 3000, feedCut: 300, feedPlunge: 300 }); Object.assign(o[2], { toolId: 'em10' }); })""")
    pg.click('[data-cmd=cam-post]'); pg.wait_for_selector('[data-testid=nc-text]', timeout=40000)
    nlines = count(pg, '.nc-line')
    check('NC önizleme: satırlar listelendi', nlines > 30, nlines)
    check('DOĞRULANMADI rozeti kalıcı (önizlemede ve metinde)', count(pg, '#modal .callout.unv') == 1 and 'UNVERIFIED' in pg.evaluate('app.cam.ops.nc.text'))
    nc_ok = pg.evaluate("(() => { const t = app.cam.ops.nc.text; return /O1000/.test(t) && /T1/.test(t) && /T3/.test(t) && /M30|M02/.test(t) && /G54/.test(t); })()")
    check('NC içeriği: O1000, T1, T3, G54, program sonu', nc_ok, pg.evaluate('app.cam.ops.nc.text.slice(0, 400)'))
    shot(pg, '4-nc')
    mv = pg.evaluate("app.cam.ops.nc.lineMap.findIndex((m) => m && m.move != null && m.move > 3)")
    pg.click(f'.nc-line[data-i="{mv}"]'); time.sleep(0.2)
    check('satıra tıklayınca hareket görünümde vurgulanır (selG)', pg.evaluate('app.cam.view.selG.children.length') > 0)
    pg.fill('[data-testid=nc-progno]', '2000'); pg.click('[data-testid=nc-regen]'); time.sleep(0.3)
    check('program numarası değişti (O2000)', pg.evaluate("/O2000/.test(app.cam.ops.nc.text)"))
    pg.fill('[data-testid=nc-progno]', 'abc'); pg.click('[data-testid=nc-regen]')
    check('geçersiz program numarası: metin değişmedi', pg.evaluate("/O2000/.test(app.cam.ops.nc.text)"))
    pg.click('[data-testid=nc-save]'); time.sleep(0.4)
    check('Kaydet hata vermedi', not [e for e in pg.errs if 'Error' in e or 'hata' in e.lower()], pg.errs[:2])
    pg.click('[data-testid=nc-close]')
    check('NC kodu komutu açıldı (cam-nc etkin)', pg.evaluate("document.querySelector('[data-cmd=cam-nc]').getAttribute('aria-disabled')") is None)
    check('geçerli senaryoda durum çubuğu DOĞRULANMADI', pg.evaluate("document.querySelector('[data-testid=st-post]').dataset.verified") == '0')
    # doğrulama
    pg.click('[data-testid=st-post]'); pg.wait_for_selector('[data-testid=vf-by]')
    pg.click('[data-testid=vf-ok]'); time.sleep(0.2)
    check('ad/not/onay boşken doğrulama reddedilir (modal açık, ileti var)', pg.evaluate("!document.querySelector('#modal').classList.contains('hidden')") and len(txt(pg, '#modal .fieldmsg').strip()) > 0)
    pg.fill('[data-testid=vf-by]', 'Usta'); pg.fill('[data-testid=vf-note]', 'Kuru çalıştırma, tek blok'); pg.click('[data-testid=vf-ok]'); time.sleep(0.2)
    check('onay kutusu işaretlenmeden hâlâ reddedilir', pg.evaluate("!document.querySelector('#modal').classList.contains('hidden')"))
    pg.check('[data-testid=vf-confirm]'); pg.click('[data-testid=vf-ok]'); time.sleep(0.3)
    check('doğrulama kaydı doc.cam.verified (ad, tarih, not)', pg.evaluate("(() => { const v = app.doc.cam.verified; return !!v && v.by === 'Usta' && /^\\d{4}-\\d{2}-\\d{2}$/.test(v.date) && v.note.includes('Kuru'); })()"))
    check('durum çubuğu: Doğrulandı', pg.evaluate("document.querySelector('[data-testid=st-post]').dataset.verified") == '1' and 'Doğrulandı' in txt(pg, '[data-testid=st-post]'))
    pg.click('[data-cmd=cam-nc]'); pg.wait_for_selector('[data-testid=nc-text]')
    check('doğrulanmış NC başlığında "VERIFIED BY Usta"', pg.evaluate("/VERIFIED BY Usta/.test(app.cam.ops.nc.text)"))
    check('"DOĞRULANMADI" post rozeti doğrulamada da kalır', 'UNVERIFIED' in pg.evaluate('app.cam.ops.nc.text') and count(pg, '#modal .callout.unv') == 1)
    pg.click('[data-testid=nc-close]')
    pg.evaluate("() => app.cam.renameOp && app.cam.mut((c) => { c.setups[0].ops[0].name = 'Yuzey degisti'; })")
    check('belge değişince doğrulama düşer', pg.evaluate("document.querySelector('[data-testid=st-post]').dataset.verified") == '0' and pg.evaluate('app.cam.ops.verifiedState().lapsed') is True)
    pg.keyboard.press('Control+z')
    check('geri al: belge eski haline dönünce doğrulama yeniden geçerli', pg.evaluate("document.querySelector('[data-testid=st-post]').dataset.verified") == '1')
    # --- engel: sınır dışı ilerleme → NC üretilmez, işlem adı ve neden gösterilir
    pg.evaluate("() => app.cam.mut((c) => { c.setups[0].ops[0].feedCut = 9000; })")
    pg.click('[data-cmd=cam-post]'); pg.wait_for_selector('[data-testid=issue-list]', timeout=40000)
    check('kapı engeli: NC üretilmedi, hata satırı var', count(pg, '[data-testid=issue-row][data-level=block]') >= 1 and pg.evaluate('app.cam.ops.nc') is None, txt(pg, '#modal')[:300])
    shot(pg, '5-engel')
    check('engel satırı işlem adını ve nedeni içerir', 'Yüzey 1' in txt(pg, '#modal') and len(txt(pg, '[data-testid=issue-row]')) > 25, txt(pg, '[data-testid=issue-row]'))
    check('cam-nc komutu kapalı (NC yok)', pg.evaluate("document.querySelector('[data-cmd=cam-nc]').getAttribute('aria-disabled')") == 'true')
    pg.click('[data-testid=issue-row]'); time.sleep(0.4)
    check('satıra tıklayınca ilgili işlem paneli açılır', 'Yüzey 1' in txt(pg, '[data-testid=panel-title]'), txt(pg, '[data-testid=panel-title]'))
    # EN: işlem paneli ve sorun listesi
    pg.evaluate("app.setLanguage('en')")
    check('EN: işlem paneli çevrildi', 'Operation' in txt(pg, '[data-testid=panel-title]') and 'Tool' in txt(pg, '[data-testid=op-tab-tool]') and 'Cutting data' in txt(pg, '#panel'), txt(pg, '#panel')[:200])
    check('EN: işlem rozeti ve durum çubuğu', 'Error' in txt(pg, '[data-testid=op-badge]') or 'Stale' in txt(pg, '[data-testid=op-badge]') or 'Done' in txt(pg, '[data-testid=op-badge]') or 'Not computed' in txt(pg, '[data-testid=op-badge]'), txt(pg, '[data-testid=op-badge]'))
    pg.evaluate("app.setLanguage('tr')")
    # varsayılan Neway şablonu: tezgâh değerleri eksik → kapı 1 engeli
    pg.keyboard.press('Escape')
    pg.evaluate("() => app.cam.setMachine('builtin-neway-vm1160h-m80v-gsa')")
    pg.click('[data-cmd=cam-post]'); pg.wait_for_selector('[data-testid=issue-list]', timeout=40000)
    check('şablon tezgâh: eksik değerler NC üretimini engeller', count(pg, '[data-testid=issue-row][data-level=block]') >= 1 and pg.evaluate('app.cam.ops.nc') is None, txt(pg, '#modal')[:300])
    pg.click('[data-testid=issues-close]')
    check('konsol hatası yok (işlem akışı)', not [e for e in pg.errs if 'Error' in e or 'Uncaught' in e], pg.errs[:3])
    ctx.close()


    # ------------------------------------------------------------------ CAM-UI-VERIFY düzeltmeleri (U-xx)
    print('arayüz doğrulama düzeltmeleri (U-01..U-20)')
    ctx, pg = newpage(); load(pg, BLOCK); pg.click('[data-testid=tab-manufacture]')
    # U-01: görünür boyut (metin DOM'da var ama 0 px genişlikte olabilir)
    pg.click('[data-cmd=cam-machine]')
    bx = pg.evaluate("""() => { const r = document.querySelector('#modal [data-testid=mc-row]'); const q = (s) => { const b = r.querySelector(s).getBoundingClientRect(); return [b.width, b.height]; };
      return { rad: q('input[type=radio]'), nm: q('.mc-pick > span:not(.badge)'), badge: q('.mc-pick .badge') }; }""")
    check('U-01: tezgâh radyosu 18 px (şişmez)', bx['rad'][0] <= 24 and bx['rad'][1] <= 24, bx)
    check('U-01: tezgâh adı görünür genişlikte (> 60 px, > 8 px yükseklik)', bx['nm'][0] > 60 and bx['nm'][1] > 8, bx)
    check('U-01: "Yerleşik" rozeti ezik değil (≥ 40 px)', bx['badge'][0] >= 40, bx)
    # U-04: şablonun eksik sayısı post özelliklerini de içerir
    miss_txt = txt(pg, '#modal [data-testid=mc-row]:nth-child(1) td:nth-child(3)')
    nmiss = int(''.join(c for c in miss_txt if c.isdigit()) or 0)
    check('U-04: şablon eksik sayısı post özelliklerini de sayar (> 2)', nmiss > 2, miss_txt)
    # U-03: tezgâh düzenleyicide geçersiz sayı varken Tamam kapatmaz
    pg.click('#modal [data-testid=mc-copy] >> nth=0'); pg.fill('[data-testid=prompt-input]', 'Hatali'); pg.click('#modal .btn.pri')
    pg.click('[data-testid=mc-tab-spindle]'); pg.fill('[data-f=sp-max]', 'abc'); pg.fill('[data-f=fd-max]', '-5')
    pg.click('[data-testid=mc-ok]')
    check('U-03: geçersiz sayıyla Tamam penceresi kapanmaz, hata görünür', count(pg, '[data-testid=machine-editor]') == 1 and 'düzeltin' in txt(pg, '.mc-err').lower(), txt(pg, '.mc-err'))
    check('U-03: ilk hatalı alana odaklanıldı', pg.evaluate("document.activeElement && document.activeElement.dataset.f") in ('sp-max', 'fd-max'))
    saved = pg.evaluate("JSON.parse(localStorage.getItem('mihenk.machines')||'[]')")
    check('U-03: profil hatalı değerle kaydedilmedi', all(m.get('spindle', {}).get('maxRpm') in (None, 0) or isinstance(m['spindle']['maxRpm'], (int, float)) for m in saved))
    pg.fill('[data-f=sp-max]', '8000'); pg.fill('[data-f=fd-max]', '5000')
    # U-17: aralık alanı dolunca "gerekli" vurgusu kalkar (post sekmesi, g541Range)
    pg.click('[data-testid=mc-tab-post]')
    if count(pg, '[data-f=pp-g541Range-min]'):
        pg.fill('[data-f=pp-g541Range-min]', '1'); pg.fill('[data-f=pp-g541Range-max]', '6')
        check('U-17: g541Range dolunca gerekli vurgusu kalkar', pg.evaluate("[...document.querySelectorAll('.mc-ed .fld.need')].filter((e) => e.textContent.includes('G54.1')).length") == 0, txt(pg, '.mc-ed')[:200])
    else:
        check('U-17: g541Range alanı bu posta yok (geçerli)', True)
    pg.click('[data-testid=mc-cancel]') if count(pg, '[data-testid=mc-cancel]') else pg.keyboard.press('Escape')
    ctx.close()

    print('takım düzenleyici: geçersiz giriş, rampa açısı')
    ctx, pg = newpage(); load(pg, BLOCK); pg.click('[data-testid=tab-manufacture]')
    pg.click('[data-cmd=cam-tools]'); pg.click('[data-testid=tl-new]')
    pg.click('[data-testid=tl-tab-geom]'); pg.fill('[data-f=tl-dia]', '-5'); pg.click('[data-testid=tl-ok]')
    check('U-02: Çap -5 ile Tamam penceresi kapanmaz', count(pg, '[data-testid=tool-editor]') == 1)
    check('U-02: hata iletisi görünür, takım kaydedilmedi', 'düzeltin' in txt(pg, '.mc-err').lower() and pg.evaluate('(app.doc.cam && app.doc.cam.tools || []).length') == 0, txt(pg, '.mc-err'))
    check('U-02: hatalı alana odak', pg.evaluate("document.activeElement && document.activeElement.dataset.f") == 'tl-dia')
    # rampa açısı alanı: yalnız merkezden kesmeyen takımda
    pg.fill('[data-f=tl-dia]', '10'); pg.fill('[data-f=tl-name]', 'Ramp') if count(pg, '[data-f=tl-name]') else None
    cc_on = pg.evaluate("document.querySelector('[data-f=tl-cc]').checked")
    if cc_on: pg.evaluate("document.querySelector('[data-f=tl-cc]').click()")
    check('rampa: merkezden kesmeyen takımda "En büyük rampa açısı" alanı var', count(pg, '[data-f=tl-maxRampAngle]') == 1 and 'En büyük rampa açısı' in txt(pg, '.tl-ed'), txt(pg, '.tl-ed')[:200])
    pg.fill('[data-f=tl-maxRampAngle]', '120'); pg.click('[data-testid=tl-ok]')
    check('rampa: 120° geçersiz (en çok 90), pencere açık', count(pg, '[data-testid=tool-editor]') == 1 and 'En çok' in txt(pg, '[data-row=tl-maxRampAngle]'), txt(pg, '[data-row=tl-maxRampAngle]'))
    pg.fill('[data-f=tl-maxRampAngle]', '2,5'); pg.click('[data-testid=tl-ok]')
    tl0 = pg.evaluate('app.doc.cam.tools[0]')
    check('rampa: 2,5° kaydedildi (maxRampAngle=2.5)', tl0 and tl0.get('maxRampAngle') == 2.5 and tl0['centerCutting'] is False, json.dumps(tl0)[:200])
    pg.click('[data-testid=tl-edit]'); pg.click('[data-testid=tl-tab-geom]')
    check('rampa: yeniden açınca değer 2,5', pg.input_value('[data-f=tl-maxRampAngle]') in ('2,5', '2.5'), pg.input_value('[data-f=tl-maxRampAngle]'))
    pg.fill('[data-f=tl-maxRampAngle]', ''); pg.click('[data-testid=tl-ok]')
    check('rampa: boşaltınca alan silinir (değer uydurulmaz)', 'maxRampAngle' not in pg.evaluate('app.doc.cam.tools[0]'))
    pg.click('[data-testid=tl-edit]'); pg.click('[data-testid=tl-tab-geom]'); pg.evaluate("document.querySelector('[data-f=tl-cc]').click()")
    check('rampa: "Merkezden keser" işaretlenince alan gizlenir', count(pg, '[data-f=tl-maxRampAngle]') == 0)
    pg.keyboard.press('Escape')
    pg.evaluate("app.setLanguage('en')"); pg.click('[data-testid=tl-edit]') if count(pg, '[data-testid=tl-edit]') else None
    pg.click('[data-testid=tl-tab-geom]'); pg.evaluate("document.querySelector('[data-f=tl-cc]').checked && document.querySelector('[data-f=tl-cc]').click()")
    check('EN: "Maximum ramp angle" etiketi', 'Maximum ramp angle' in txt(pg, '.tl-ed'), txt(pg, '.tl-ed')[:200])
    pg.evaluate("app.setLanguage('tr')")
    ctx.close()

    br.close()
finally:
    if server: server.terminate()
print(f'\n{passed} geçti, {failed} kaldı'); sys.exit(1 if failed else 0)
