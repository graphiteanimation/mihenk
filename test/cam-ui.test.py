# İmalat (CAM) arayüz testleri: sekme geçişi, tezgâh/takım CRUD, dokunulmaz numara uyarısı, setup, TR/EN.
# Önce `npm run build`; çalıştır: python3 test/cam-ui.test.py
import os, socket, subprocess, sys, time, json
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
    check('yönetici: 2 yerleşik şablon, eksik değer sayısı görünür', count(pg, '#modal [data-testid=mc-row]') == 2 and '2 alan boş' in txt(pg, '#modal'))
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

    br.close()
finally:
    if server: server.terminate()
print(f'\n{passed} geçti, {failed} kaldı'); sys.exit(1 if failed else 0)
