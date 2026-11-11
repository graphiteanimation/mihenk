# Arayüz testi: gerçek fare/klavye ile (Playwright, chrome). Önce `npm run build`; çalıştır: python3 test/app.test.py
import json, math, os, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'test', 'shots'); os.makedirs(SHOTS, exist_ok=True)
TMP = os.path.join(ROOT, 'test', 'tmp'); os.makedirs(TMP, exist_ok=True)
PORT = 4190
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
    server = subprocess.Popen(['npx', 'vite', 'preview', '--port', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        if port_open(): break
        time.sleep(0.2)

def near(a, b, tol=2e-3): return a is not None and abs(a - b) <= tol * max(1, abs(b))

try:
  with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    # Arayüz dili: Türkçe sabitlenir (kayıtlı tercih yoksa); dil testi en sonda (bölüm H) tercihin saklanmasını da sınar.
    ctx = br.new_context(viewport={'width': 1400, 'height': 860}, accept_downloads=True, locale='tr-TR')
    # otomatik kurtarma zamanlayıcısı bu testte kapalı (60 sn'lik zamanlayıcı bölüm S'de ayrı bağlamda sınanır)
    ctx.add_init_script("try { if (!localStorage.getItem('atolye.lang')) localStorage.setItem('atolye.lang', 'tr'); localStorage.setItem('atolye.recoveryMs', '0'); localStorage.setItem('mihenk.welcome', 'off'); } catch (e) {}")
    # CSP ihlali dinleyicisi: sıkı CSP (meta) altında uygulama hiçbir ihlal olmadan çalışmalı
    ctx.add_init_script("window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sample || '') + ' @' + e.sourceFile + ':' + e.lineNumber));")
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e) + ' ' + str(getattr(e,'stack','') or '')[:400]))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    ev = page.evaluate

    def idle(): ev('app.whenIdle()')
    def shot(n): page.screenshot(path=os.path.join(SHOTS, n + '.png'))
    def vol(i=0): return ev(f'app.result.bodies[{i}] ? app.result.bodies[{i}].volume : null')
    def nbodies(): return ev('app.result.bodies.length')
    def tb(act):
        if act in ('box', 'cylinder', 'sphere'): page.click('#toolbar button[data-cmd="dd-prim"]'); page.click(f'#ddpop [data-cmd="{act}"]')
        else: page.click(f'#toolbar button[data-cmd="{act}"]')
    def fill(k, v): page.fill(f'#panel [data-k="{k}"]', str(v)); 
    def select(k, v): page.select_option(f'#panel select[data-k="{k}"]', v)
    def ok(): page.click('#p-ok'); idle()
    FILE_ID = {'Yeni': 'new', 'Kaydet': 'save', 'Aç…': 'open', 'STEP Dışa Aktar…': 'export-step', 'STL Dışa Aktar…': 'export-stl', 'STEP İçe Aktar…': 'import-step'}
    def menu(m, item):
        page.click('#menubar button[data-menu="file"]')
        page.click(f'#menubar .drop [data-cmd="{FILE_ID[item]}"]')
    def px(w):
        x, y = ev('(w) => { const [x, y] = app.viewport.project(w); const r = app.viewport.renderer.domElement.getBoundingClientRect(); return [r.left + x, r.top + y]; }', w)
        return x, y
    def click_world(w):
        page.wait_for_timeout(350)  # panel açılınca görünüm yeniden boyutlanır
        x, y = px(w); page.mouse.move(x, y); page.wait_for_timeout(120); page.mouse.click(x, y)
    def chip(i): return page.locator(f'#timeline .chip[data-i="{i}"]')
    def feats(): return ev('app.doc.features.map(f => f.id)')
    def toast_text(): return ev('document.querySelector("#toast").classList.contains("hidden") ? "" : document.querySelector("#toast").textContent')

    page.goto(f'http://127.0.0.1:{PORT}/')
    page.wait_for_function('() => (window.app)', timeout=30000)
    ev('app.ready')
    check('uygulama açıldı, çekirdek yüklendi', ev('document.querySelector("#loading").classList.contains("hidden")'))
    check('menü başlıkları', ev('[...document.querySelectorAll("#menubar [data-menu=file]")].map(b => b.textContent.trim()).join(",")') == 'Dosya')
    groups = ev('[...document.querySelectorAll("#toolbar .glabel")].map(g => g.textContent).join(",")')
    check('araç çubuğu grupları', groups.lower() == 'oluştur,düzenle,i̇ncele' or groups.replace('İ', 'i').lower().startswith('oluştur,düzenle,'), groups)
    check('görünüm düğmeleri', ev('document.querySelectorAll("#viewbtns button").length') == 5)
    shot('01_acilis')

    # ---------------------------------------------------------------- A: Kutu, Yuvarla, Kabuk
    print('A: kutu / yuvarlat / kabuk')
    tb('box'); page.wait_for_selector('#panel:not(.hidden) [data-k="w"]')
    for k, v in [('x', 0), ('y', 0), ('z', 0), ('w', 100), ('d', 60), ('h', 20)]: fill(k, v)
    idle()
    check('önizleme: taslak kutu gövdesi görünür (Tamam öncesi)', nbodies() == 1 and near(vol(), 120000))
    check('önizlemede belge henüz değişmedi', ev('app.doc.features.length') == 0)
    shot('02_kutu_paneli')
    ok()
    check('kutu: gövde sayısı 1, hacim 120000', nbodies() == 1 and near(vol(), 120000), str(vol()))
    check('kutu: zaman çizelgesinde chip', chip(0).count() == 1 and 'Kutu' in chip(0).inner_text())
    check('panel kapandı', ev('document.querySelector("#panel").classList.contains("hidden")'))
    check('değişiklik göstergesi başlıkta', ev('document.title').startswith('•'))

    # kenar seç (sol-ön dikey kenar) gerçek tıklama ile
    tb('fillet'); page.wait_for_selector('#panel [data-k="edges"]')
    click_world([0, 0, 10])
    page.wait_for_function('() => (document.querySelector("#panel .selbox[data-k=edges]").dataset.count === "1")', timeout=8000)
    fill('r', 5); idle()
    shot('03_yuvarlat_secim')
    ok()
    st = ev('app.result.status[app.doc.features[1].id]')
    expect = 120000 - 25 * (1 - math.pi / 4) * 20
    check('yuvarlat: kenar seçimiyle uygulandı, hacim doğru', st['ok'] and near(vol(), expect, 1e-4), f"{vol()} vs {expect} {st}")

    # yüz seç: üst yüz, kabuk
    tb('shell'); page.wait_for_selector('#panel [data-k="faces"]')
    click_world([50, 30, 20])
    page.wait_for_function('() => (document.querySelector("#panel .selbox[data-k=faces]").dataset.count === "1")', timeout=8000)
    fill('t', 2); idle()
    ok()
    st = ev('app.result.status[app.doc.features[2].id]')
    check('kabuk: yüz seçimiyle uygulandı', st['ok'] and 20000 < vol() < 26000, f'{vol()} {st}')
    shot('04_kabuk')

    # ---------------------------------------------------------------- hata: çok büyük yuvarlatma
    print('hata: büyük yuvarlatma')
    tb('fillet'); page.wait_for_selector('#panel [data-k="edges"]')
    # kabuktan önceki kutu yerine yeni belgede deneyelim: kutu üzerinde dış alt kenar
    click_world([50, 0, 0]); page.wait_for_function('() => (document.querySelector("#panel .selbox[data-k=edges]").dataset.count === "1")', timeout=8000)
    fill('r', 500); idle(); page.wait_for_timeout(300)
    errtxt = ev('document.querySelector("#p-err").textContent')
    check('hatalı özellik panelde kırmızı hata gösterir', len(errtxt) > 5, errtxt)
    shot('05_hata_paneli')
    ok()
    bad = ev('app.doc.features.length - 1')
    check('hatalı özellik zaman çizelgesinde kırmızı', chip(bad).get_attribute('class').find('err') >= 0 and len(chip(bad).get_attribute('title') or '') > 5)
    check('hata sonrası uygulama çalışıyor, gövde duruyor', nbodies() == 1 and page.title() != '')
    shot('06_hata_cizelge')
    # geri al: hatalı özelliği kaldırır
    page.keyboard.press('Control+z'); idle()
    check('geri al: son özellik kalktı', ev('app.doc.features.length') == 3)
    page.keyboard.press('Control+y'); idle()
    check('yinele: geri geldi', ev('app.doc.features.length') == 4)
    page.keyboard.press('Control+z'); idle()

    # ---------------------------------------------------------------- B: parametre, silindir kes, desen
    print('B: parametre / silindir / desen')
    page.once('dialog', lambda d: d.accept())
    menu('Dosya', 'Yeni')
    page.wait_for_selector('#modal:not(.hidden)')
    page.click('#modal button[data-v="true"]'); idle()
    check('yeni belge: boş', ev('app.doc.features.length') == 0 and nbodies() == 0)
    page.click('#br-params'); page.wait_for_selector('#modal:not(.hidden) #par-add')
    page.click('#par-add')
    page.fill('#modal tr:last-child input[data-k="name"]', 'L'); page.fill('#modal tr:last-child input[data-k="expr"]', '80'); page.fill('#modal tr:last-child input[data-k="note"]', 'kutu boyu')
    check('parametre tablosu: değer sütunu', page.inner_text('#modal tr:last-child .pv').strip() == '80')
    # hatalı ad: tablo hata göstermeli
    page.fill('#modal tr:last-child input[data-k="name"]', '1x'); check('parametre adı doğrulama', 'rakamla' in page.inner_text('#modal tr:last-child .pe'))
    page.fill('#modal tr:last-child input[data-k="name"]', 'L')
    shot('07_parametre_tablosu')
    page.click('#modal button[data-v="ok"]'); idle()
    check('parametre eklendi L=80', ev('app.doc.params[0].name') == 'L' and ev('app.vars().L') == 80)
    check('tarayıcıda parametre satırı', 'L' in page.inner_text('#browser [data-param="L"]') and '80' in page.inner_text('#browser [data-param="L"]'))
    tb('box'); page.wait_for_selector('#panel [data-k="w"]')
    for k, v in [('w', 'L'), ('d', 60), ('h', 20)]: fill(k, v)
    ok(); check('kutu genişliği parametreyle: 80x60x20', near(vol(), 96000), vol())
    tb('cylinder'); page.wait_for_selector('#panel [data-k="dia"]')
    for k, v in [('x', 20), ('y', 30), ('z', 0), ('dia', 10), ('h', 40)]: fill(k, v)
    select('op', 'cut'); ok()
    v1 = 96000 - math.pi * 25 * 20
    check('silindir Kes işlemiyle eklendi', near(vol(), v1), vol())
    tb('pattern'); page.wait_for_selector('#panel [data-k="kind"]')
    select('kind', 'circ'); page.wait_for_selector('#panel [data-k="count"]')
    fill('count', 4); fill('total', 360); fill('cx', 40); fill('cy', 30); ok()
    v2 = 96000 - 4 * math.pi * 25 * 20
    st = ev('app.result.status[app.doc.features[2].id]')
    check('dairesel desen (özellik kaynağı) uygulandı', st['ok'] and near(vol(), v2), f'{vol()} {v2} {st}')
    shot('08_desen')
    # parametre değişimi
    page.click('#br-params'); page.wait_for_selector('#modal #par-add')
    page.fill('#modal tr:first-child input[data-k="expr"]', '100'); page.click('#modal button[data-v="ok"]'); idle()
    check('parametre değişince model güncellendi (L=100)', near(vol(), 100 * 60 * 20 - 4 * math.pi * 25 * 20), vol())
    check('bbox genişlik 100', near(ev('app.result.bodies[0].bbox[1][0]'), 100))

    # zaman çizelgesi: düzenle, bastır, geri sar, sil
    print('B2: zaman çizelgesi')
    chip(2).dblclick(); page.wait_for_selector('#panel [data-k="count"]')
    check('çift tık özelliği düzenleme paneliyle açtı', ev('app.edit && app.edit.idx') == 2 and page.input_value('#panel [data-k="count"]') == '4')
    fill('count', 3); idle(); ok()
    check('özellik düzenlendi (3 adet)', near(vol(), 100 * 60 * 20 - 3 * math.pi * 25 * 20), vol())
    chip(2).click(button='right'); page.click('#ctx button:has-text("Bastır")'); idle()
    check('bastır: desen yok sayıldı', near(vol(), 100 * 60 * 20 - math.pi * 25 * 20), vol())
    check('bastırılmış chip çizgili', 'sup' in chip(2).get_attribute('class'))
    chip(2).click(button='right'); page.click('#ctx button:has-text("Etkinleştir")'); idle()
    check('etkinleştir', near(vol(), 100 * 60 * 20 - 3 * math.pi * 25 * 20))
    chip(0).click(button='right'); page.click('#ctx button:has-text("Buraya geri sar")'); idle()
    check('geri sar: yalnız kutu', near(vol(), 120000) and ev('app.doc.rollback') == 1)
    check('geri sarma işaretçisi görünür', page.locator('#tl-marker').count() == 1 and page.locator('#tl-end').count() == 1)
    shot('09_geri_sar')
    page.click('#tl-end'); idle()
    check('Sona git', ev('app.doc.rollback') is None and near(vol(), 100 * 60 * 20 - 3 * math.pi * 25 * 20))
    chip(1).click(button='right'); page.click('#ctx button:has-text("Yeniden adlandır")')
    page.fill('#modal input', 'Gövde deliği'); page.click('#modal button[data-v="ok"]'); idle()
    check('yeniden adlandır', 'Gövde deliği' in chip(1).inner_text())
    # bağımlı özellik silme uyarısı
    chip(1).click(button='right'); page.click('#ctx button:has-text("Sil")'); page.wait_for_selector('#modal:not(.hidden)')
    check('bağımlılık uyarısı (desen)', 'Desen' in page.inner_text('#modal .content'))
    page.click('#modal button[data-v="false"]'); idle()
    check('vazgeç: silinmedi', ev('app.doc.features.length') == 3)
    chip(2).click(button='right'); page.click('#ctx button:has-text("Sil")'); idle()
    check('desen silindi', ev('app.doc.features.length') == 2 and near(vol(), 100 * 60 * 20 - math.pi * 25 * 20))
    page.keyboard.press('Control+z'); idle()
    check('silmeyi geri al', ev('app.doc.features.length') == 3 and near(vol(), 100 * 60 * 20 - 3 * math.pi * 25 * 20))


    # ---------------------------------------------------------------- C: dosya
    print('C: dosya (kaydet / aç / STEP)')
    vsaved = vol()
    with page.expect_download() as dl: menu('Dosya', 'Kaydet')
    d = dl.value; path = os.path.join(TMP, 'deneme.mhnk'); d.save_as(path)
    j = json.load(open(path))
    check('kaydet: .mhnk indirildi (app/version/doc)', j['app'] == 'Mihenk' and j['version'] == 1 and len(j['doc']['features']) == 3 and d.suggested_filename.endswith('.mhnk'), d.suggested_filename)
    check('kayıttan sonra başlıkta • yok', not ev('document.title').startswith('•'))
    menu('Dosya', 'Yeni'); idle()
    check('yeni: boş belge (kayıtlı olduğu için onaysız)', nbodies() == 0 and ev('app.doc.features.length') == 0)
    with page.expect_file_chooser() as fc: menu('Dosya', 'Aç…')
    fc.value.set_files(path); page.wait_for_timeout(300); idle()
    check('aç: aynı hacim geri yüklendi', near(vol(), vsaved), f'{vol()} vs {vsaved}')
    check('aç: parametre ve özellikler', ev('app.doc.params.length') == 1 and ev('app.doc.features.length') == 3)
    # eski biçim: .acad (app = AtolyeCAD) açılır, kaydedince .mhnk (app = Mihenk) yazılır
    old = os.path.join(TMP, 'eski.acad'); jo = json.load(open(path)); jo['app'] = 'AtolyeCAD'; json.dump(jo, open(old, 'w'))
    with page.expect_file_chooser() as fc: menu('Dosya', 'Aç…')
    fc.value.set_files(old); page.wait_for_timeout(300); idle()
    check('.acad (app: AtolyeCAD) açıldı', near(vol(), vsaved) and ev('app.fileName') == 'eski.acad', f'{vol()} {ev("app.fileName")}')
    with page.expect_download() as dl: menu('Dosya', 'Kaydet')
    d2 = dl.value; p2 = os.path.join(TMP, 'eski-kayit.mhnk'); d2.save_as(p2)
    check('.acad açıkken Kaydet: öneri eski.mhnk, içerik app=Mihenk, özgün .acad aynı', d2.suggested_filename == 'eski.mhnk' and json.load(open(p2))['app'] == 'Mihenk' and json.load(open(old))['app'] == 'AtolyeCAD', d2.suggested_filename)
    with page.expect_download() as dl: menu('Dosya', 'STEP Dışa Aktar…')
    stp = os.path.join(TMP, 'deneme.step'); dl.value.save_as(stp)
    check('STEP dışa aktar: dosya boyutu > 0', os.path.getsize(stp) > 1000, str(os.path.getsize(stp)))
    with page.expect_download() as dl: menu('Dosya', 'STL Dışa Aktar…')
    stl = os.path.join(TMP, 'deneme.stl'); dl.value.save_as(stl)
    check('STL dışa aktar: dosya boyutu > 0', os.path.getsize(stl) > 500)
    menu('Dosya', 'Yeni'); idle()
    with page.expect_file_chooser() as fc: menu('Dosya', 'STEP İçe Aktar…')
    fc.value.set_files(stp); page.wait_for_timeout(500); idle()
    check('STEP içe aktar: aynı hacim', nbodies() >= 1 and near(vol(), vsaved, 5e-3), f'{nbodies()} {vol()}')
    check('içe aktarılan özellik çizelgede', ev('app.doc.features[0].type') == 'import')
    bad = os.path.join(TMP, 'bozuk.acad'); open(bad, 'w').write('{kötü')
    menu('Dosya', 'Aç…'); page.wait_for_selector('#modal:not(.hidden)')  # kaydedilmemiş (import) uyarısı
    with page.expect_file_chooser() as fc: page.click('#modal button[data-v="true"]')
    fc.value.set_files(bad); page.wait_for_timeout(400)
    check('bozuk dosya: anlaşılır uyarı, çökmez', 'okunamadı' in toast_text() or 'değil' in toast_text(), toast_text())

    # ---------------------------------------------------------------- D: sketch'li belge: Extrude / Revolve / Delik
    print('D: sketch panelleri (loadDoc)')
    def rect(w, h, pre='p', ox=0, oy=0):
        pts = {f'{pre}{i}': {'x': x, 'y': y} for i, (x, y) in enumerate([(ox, oy), (ox + w, oy), (ox + w, oy + h), (ox, oy + h)], 1)}
        ents = [{'id': f'{pre}l{i}', 'type': 'line', 'a': f'{pre}{i}', 'b': f'{pre}{i % 4 + 1}'} for i in range(1, 5)]
        return pts, ents
    pts, ents = rect(100, 60); pts['O'] = {'x': 0, 'y': 0, 'fixed': True}; pts['c'] = {'x': 50, 'y': 30}; ents.append({'id': 'c1', 'type': 'circle', 'c': 'c', 'r': 10})
    docD = {'params': [], 'features': [{'id': 's1', 'type': 'sketch', 'name': 'Sketch 1', 'plane': {'kind': 'base', 'name': 'XY', 'offset': '0'}, 'points': pts, 'ents': ents, 'cons': []}]}
    ev('(d) => app.loadDoc(d)', docD); idle()
    tb('extrude'); page.wait_for_selector('#panel [data-k="sketch"]'); idle()
    check('extrude: sketch otomatik seçildi, profil bölgeleri 2', ev('app.edit.draft.sketch') == 's1' and ev('app.regionCount') == 2)
    shot('10_extrude_paneli')
    fill('dist', 20); idle()
    check('extrude önizleme: tüm profiller (dolu) 100x60x20', near(vol(), 120000), vol())
    # profile gerçek tıklama: delikli bölgeyi (daire içi) kapat -> yalnızca halka
    page.wait_for_timeout(300)
    click_world([50, 30, 0]); idle(); page.wait_for_timeout(300)
    check('profil tıklaması: seçim güncellendi', ev('JSON.stringify(app.edit.draft.profiles)') != '"all"', ev('JSON.stringify(app.edit.draft.profiles)'))
    idle()
    check('profil seçimi: yalnız bir bölge (daire ya da halka)', ev('Array.isArray(app.edit.draft.profiles) && app.edit.draft.profiles.length === 1'))
    shot('11_profil_secimi')
    page.click('#panel button:has-text("Tümü")'); idle()
    check('Tümü düğmesi', ev('app.edit.draft.profiles') == 'all')
    ok()
    check('extrude kaydedildi: yeni gövde', nbodies() == 1 and near(vol(), 120000))
    # delikli profil yalnız halka (dairenin içi olmadan)
    chip(1).dblclick(); page.wait_for_selector('#panel [data-k="dist"]')
    ring = ev('(() => { const r = app.regionCount; return r; })()')
    ev('app.edit.draft.profiles = [app.viewport.regions.findIndex(r => r.holes.length > 0)]; app.edit.updateViewport(); app.edit.changed()'); idle()
    check('yalnız delikli profil: hacim (6000-π100)*20', near(vol(), (6000 - math.pi * 100) * 20), vol())
    page.keyboard.press('Escape'); idle()
    check('Esc: düzenleme iptal edildi, belge değişmedi', ev('app.edit') is None and near(vol(), 120000))

    # Revolve
    ptsr, entsr = rect(10, 30, 'r', 5, 0); ptsr['O'] = {'x': 0, 'y': 0, 'fixed': True}
    docR = {'params': [], 'features': [{'id': 's', 'type': 'sketch', 'name': 'Sketch 1', 'plane': {'kind': 'base', 'name': 'XZ', 'offset': '0'}, 'points': ptsr, 'ents': entsr, 'cons': []}]}
    ev('(d) => app.loadDoc(d)', docR); idle()
    tb('revolve'); page.wait_for_selector('#panel [data-k="axis"]')
    select('axis', 'sketchY'); fill('angle', 360); idle(); ok()
    check('revolve: halka hacmi', near(vol(), math.pi * (15 * 15 - 5 * 5) * 30), vol())
    chip(1).dblclick(); page.wait_for_selector('#panel [data-k="angle"]'); select('axis', 'line:rl2'); idle()
    check('revolve: eksen olarak sketch çizgisi seçilebilir', ev('app.edit.draft.axis.kind') == 'line')
    page.click('#p-cancel'); idle()

    # Delik
    ptsh, entsh = rect(100, 60); ptsh['O'] = {'x': 0, 'y': 0, 'fixed': True}
    docH = {'params': [], 'features': [
        {'id': 'b', 'type': 'primitive', 'name': 'Kutu 1', 'kind': 'box', 'x': '0', 'y': '0', 'z': '0', 'w': '100', 'd': '60', 'h': '20', 'op': 'new'},
        {'id': 's3', 'type': 'sketch', 'name': 'Konumlar', 'plane': {'kind': 'base', 'name': 'XY', 'offset': '20'}, 'points': {'O': {'x': 0, 'y': 0, 'fixed': True}, 'h1': {'x': 30, 'y': 30}, 'h2': {'x': 70, 'y': 30}}, 'ents': [{'id': 'hp1', 'type': 'point', 'p': 'h1'}, {'id': 'hp2', 'type': 'point', 'p': 'h2'}], 'cons': []}]}
    ev('(d) => app.loadDoc(d)', docH); idle()
    tb('hole'); page.wait_for_selector('#panel [data-k="thread"]')
    select('thread', 'M6'); idle()
    check('delik: diş M6 seçilince çap 5 (matkap)', page.input_value('#panel [data-k="dia"]') == '5' and ev('app.edit.draft.thread.pitch') == 1)
    select('extent', 'all'); idle()
    ok()
    check('delik: 2 delik, hacim', near(vol(), 120000 - 2 * math.pi * 6.25 * 20), vol())
    check('delik verisi (thread) saklandı', ev('app.doc.features[2].thread.designation') == 'M6' and ev('app.result.holes.length') == 1 and ev('app.result.holes[0].positions.length') == 2)
    tb('hole'); page.wait_for_selector('#panel [data-k="kind"]'); select('kind', 'cbore'); page.wait_for_selector('#panel [data-k="cboreDia"]')
    shot('12_delik_havsa'); page.click('#p-cancel'); idle()

    # ---------------------------------------------------------------- E: incele
    print('E: ölç / özellikler / girişim / kesit')
    docE = {'params': [], 'features': [
        {'id': 'b1', 'type': 'primitive', 'name': 'Kutu 1', 'kind': 'box', 'x': '0', 'y': '0', 'z': '0', 'w': '100', 'd': '60', 'h': '20', 'op': 'new'},
        {'id': 'b2', 'type': 'primitive', 'name': 'Kutu 2', 'kind': 'box', 'x': '80', 'y': '10', 'z': '0', 'w': '40', 'd': '40', 'h': '30', 'op': 'new'}]}
    ev('(d) => app.loadDoc(d)', docE); idle()
    tb('measure'); page.wait_for_selector('#measurebox:not(.hidden)')
    click_world([50, 0, 10]); page.wait_for_function('() => (document.querySelector("#measurebox").textContent.includes("Alan"))', timeout=8000)
    check('ölç: tek yüz (tür, alan)', '2.000' in page.inner_text('#measurebox').replace(',', '.') or '2000' in page.inner_text('#measurebox').replace('.', ''), page.inner_text('#measurebox'))
    click_world([0, 30, 10]); page.wait_for_function('() => (document.querySelector("#measurebox").textContent.includes("En kısa mesafe"))', timeout=8000)
    bx = page.inner_text('#measurebox')
    check('ölç: iki yüz (mesafe, açı, ΔX/ΔY/ΔZ)', 'Açı' in bx and 'ΔX' in bx and '90' in bx, bx)
    shot('13_olc')
    page.keyboard.press('Escape')
    check('Esc ölçüyü kapatır', ev('document.querySelector("#measurebox").classList.contains("hidden")') and ev('app.tool') is None)
    ev('app.selection = [{kind: "body", body: "b1"}]')
    tb('props'); page.wait_for_function('() => (document.querySelector("#measurebox").textContent.includes("Hacim"))', timeout=8000)
    page.fill('#dens', '7,85'); pt = page.inner_text('#measurebox')
    check('özellikler: hacim, alan, ağırlık merkezi, kutu, kütle', all(w in pt for w in ['Hacim', 'Yüzey alanı', 'Ağırlık merkezi', 'Kutu ölçüleri']) and ('942' in pt or '942,0' in pt), pt)
    shot('14_ozellikler'); page.click('#mb-close')
    tb('interf'); page.wait_for_function('() => (document.querySelector("#measurebox").textContent.includes("mm³"))', timeout=10000)
    ti = page.inner_text('#measurebox')
    check('girişim: iki kutu kesişiyor (20x40x20=16000)', '16.000' in ti.replace(' ', '') or '16000' in ti.replace('.', ''), ti)
    page.click('#mb-close')
    tb('section'); page.wait_for_selector('#sec-axis')
    page.select_option('#sec-axis', 'Y'); page.fill('#sec-val', '30'); page.press('#sec-val', 'Enter'); page.wait_for_timeout(300)
    check('kesit: kesme düzlemi etkin', ev('!!app.viewport.clip'))
    shot('15_kesit')
    page.click('#sec-close')
    check('kesit kapatılabilir', ev('app.viewport.clip') is None)

    # ---------------------------------------------------------------- F: tümleşik sketch akışı (gerçek fare)
    print('F: sketch akışı')
    menu('Dosya', 'Yeni'); idle()
    tb('sketch'); page.wait_for_timeout(300)
    check('sketch: düzlem seç ipucu', 'düzlem' in ev('document.querySelector("#hint").textContent'))
    click_world([50, 55, 0]); page.wait_for_function('() => (app.sketchSession)', timeout=10000); ev('app.sketcher.idle()')
    check('sketch kipine girildi (XY düzlemi)', ev('app.sketcher.active') and ev('app.sketchSession.draft.plane.name') == 'XY', ev('JSON.stringify([app.sketcher.active, app.sketchSession.draft.plane])'))
    check('sketch araç çubuğu: ÇİZ, ÖLÇÜ, KISIT', page.locator('#toolbar button[data-cmd="rect"]').count() == 1 and page.locator('#toolbar button[data-cmd="c-parallel"]').count() == 1 and page.locator('#sk-finish').count() >= 1)
    def sk_px(u, v):
        return ev('([u, v]) => { const V = app.sketcher.plane; const w = [V.o[0] + V.x[0]*u + V.y[0]*v, V.o[1] + V.x[1]*u + V.y[1]*v, V.o[2] + V.x[2]*u + V.y[2]*v]; const [x, y] = app.viewport.project(w); const r = app.viewport.renderer.domElement.getBoundingClientRect(); return [r.left + x, r.top + y]; }', [u, v])
    def sk_click(u, v):
        x, y = sk_px(u, v); page.mouse.move(x, y); page.wait_for_timeout(60); page.mouse.click(x, y); ev('app.sketcher.idle()'); page.wait_for_timeout(60)
    tb('rect'); page.wait_for_timeout(300)
    sk_click(0, 0); sk_click(40, 30); page.wait_for_timeout(200)
    check('dikdörtgen çizildi (4 çizgi)', ev('app.sketcher.sk.ents.filter(e => e.type === "line").length') == 4)
    shot('16_sketch_dikdortgen')
    # ölçü: alt çizgiye ölç aracıyla tıkla, 50 yaz
    tb('dim'); page.wait_for_timeout(200)
    sk_click(20, 0); page.wait_for_selector('input.sk-input', timeout=5000)
    page.fill('input.sk-input', '50'); page.press('input.sk-input', 'Enter'); ev('app.sketcher.idle()'); page.wait_for_timeout(400)
    xs = ev('Object.values(app.sketcher.sk.points).map(p => p.x)')
    check('ölçü verildi: genişlik 50', max(xs) - min(xs) > 49.9 and max(xs) - min(xs) < 50.1, str(xs))
    shot('17_sketch_olcu')
    page.click('#toolbar button[data-cmd="sk-finish"]'); idle()
    check('Sketch\'i Bitir: belgede sketch', ev('app.doc.features.length') == 1 and ev('app.doc.features[0].type') == 'sketch' and ev('app.sketcher.active') is False)
    tb('extrude'); page.wait_for_selector('#panel [data-k="dist"]'); fill('dist', 10); ok()
    check('extrude: 50x30x10 gövde', near(vol(), 15000), vol())
    # üst yüzde ikinci sketch -> kes
    tb('sketch'); page.wait_for_timeout(300)
    click_world([25, 15, 10]); page.wait_for_function('() => (app.sketchSession)', timeout=10000); ev('app.sketcher.idle()')
    check('yüz üstüne sketch (düzlem yüzden)', ev('app.sketchSession.draft.plane.kind') == 'face' and near(ev('app.sketchSession.plane.o[2]'), 10))
    tb('circle'); page.wait_for_timeout(200)
    sk_click(25, 15); sk_click(30, 15); page.wait_for_timeout(200)
    check('daire çizildi', ev('app.sketcher.sk.ents.filter(e => e.type === "circle").length') == 1)
    page.click('#toolbar button[data-cmd="sk-finish"]'); idle()
    tb('extrude'); page.wait_for_selector('#panel [data-k="dist"]')
    check('yüz sketch\'i + gövde var: varsayılan Kes + ters çevir', ev('app.edit.draft.op') == 'cut' and ev('app.edit.draft.flip') is True)
    fill('dist', 4); ok()
    check('kesme: cep hacmi', near(vol(), 15000 - math.pi * 25 * 4, 5e-3), vol())
    shot('18_sketch_kes')
    # sketch düzenle (tarayıcıdan çift tık), iptal
    page.locator('#browser [data-sketch]').first.dblclick(); page.wait_for_function('() => (app.sketchSession)', timeout=8000); ev('app.sketcher.idle()')
    check('sketch düzenleme kipi', ev('app.sketchSession.idx') == 0 and ev('app.sketcher.active'))
    page.click('#toolbar button[data-cmd="sk-cancel"]'); idle()
    check('sketch iptali', ev('!app.sketchSession') and nbodies() == 1)

    # ---------------------------------------------------------------- G: kısıtlar (araç çubuğu düğmeleri)
    print('G: sketch kısıtları')
    ev('app.loadDoc({params: [], features: []})'); idle(); ev('app.viewport.view("iso", true)'); page.wait_for_timeout(300)
    tb('sketch'); page.wait_for_timeout(300)
    click_world([50, 55, 0]); page.wait_for_function('() => (app.sketchSession)', timeout=10000); ev('app.sketcher.idle()')
    def sk_px(u, v):
        return ev('([u, v]) => { const V = app.sketcher.plane; const w = [V.o[0] + V.x[0]*u + V.y[0]*v, V.o[1] + V.x[1]*u + V.y[1]*v, V.o[2] + V.x[2]*u + V.y[2]*v]; const [x, y] = app.viewport.project(w); const r = app.viewport.renderer.domElement.getBoundingClientRect(); return [r.left + x, r.top + y]; }', [u, v])
    def sk_click(u, v):
        x, y = sk_px(u, v); page.mouse.move(x, y); page.wait_for_timeout(50); page.mouse.click(x, y); ev('app.sketcher.idle()'); page.wait_for_timeout(50)
    def draw_line(a, b):
        tb('line'); page.wait_for_timeout(100); sk_click(*a); sk_click(*b); page.keyboard.press('Escape'); page.wait_for_timeout(80)
        return ev('app.sketcher.sk.ents.filter(e => e.type === "line").slice(-1)[0].id')
    def sel(items):
        ev('(l) => app.sketcher._setSel(l)', items); page.wait_for_timeout(60)
    E = lambda i: {'kind': 'ent', 'id': i}; Pt = lambda i: {'kind': 'point', 'id': i}
    def cons(t): return ev('(t) => app.sketcher.sk.cons.filter(c => c.type === t).length', t)
    def apply(btn, t, label):
        sel_ = f'#toolbar button[data-cmd="c-{btn}"]'
        if page.locator(sel_).count() == 0:  # seyrek kısıtlar "Kısıt ▾" açılır grubunda
            page.click('#toolbar button[data-cmd="dd-cons"]'); sel_ = f'#ddpop button[data-cmd="c-{btn}"]'
        page.click(sel_); ev('app.sketcher.idle()'); page.wait_for_timeout(250); ev('app.sketcher.idle()')
        solved = ev('app.sketcher.lastSolve && app.sketcher.lastSolve.ok')
        check(f'kısıt düğmesi: {label}', cons(t) >= 1 and solved, f'cons={cons(t)} solve={ev("JSON.stringify(app.sketcher.lastSolve)")} status={ev("document.querySelector(\"#st-left\").textContent")}')
    A = draw_line((-40, -40), (-10, -36)); B = draw_line((-40, -28), (-10, -20))
    sel([E(A), E(B)]); apply('parallel', 'parallel', 'Paralel')
    C = draw_line((0, -40), (30, -37)); D = draw_line((10, -26), (14, -6))
    sel([E(C), E(D)]); apply('perpendicular', 'perpendicular', 'Dik')
    F1 = draw_line((-40, -10), (-20, -8)); F2 = draw_line((-40, 6), (-10, 9))
    sel([E(F1), E(F2)]); apply('equal', 'equal', 'Eşit')
    # yatay / dikey düğmeleri
    G1 = draw_line((20, -10), (40, -2))
    sel([E(G1)]); apply('horizontal', 'horizontal', 'Yatay')
    # daire + çizgi: teğet
    tb('circle'); page.wait_for_timeout(100); sk_click(20, 22); sk_click(27, 22); page.wait_for_timeout(100)
    Ci = ev('app.sketcher.sk.ents.filter(e => e.type === "circle").slice(-1)[0].id')
    T1 = draw_line((5, 40), (40, 43))
    sel([E(Ci), E(T1)]); apply('tangent', 'tangent', 'Teğet')
    # orta nokta: K çizgisinin ucu L çizgisinin orta noktası
    L1 = draw_line((-40, 20), (-10, 24)); K1 = draw_line((-35, 38), (-20, 44))
    pk = ev('(id) => app.sketcher.sk.ents.find(e => e.id === id).b', K1)
    sel([Pt(pk), E(L1)]); apply('midpoint', 'midpoint', 'Orta nokta')
    # simetri: iki nokta + eksen çizgisi
    ax = draw_line((-8, 14), (-8, 40)); p1 = ev('(id) => app.sketcher.sk.ents.find(e => e.id === id).a', F2); p2 = ev('(id) => app.sketcher.sk.ents.find(e => e.id === id).a', G1)
    sel([Pt(p1), Pt(p2), E(ax)]); apply('symmetric', 'symmetric', 'Simetri')
    # sabitle
    sel([Pt(ev('(id) => app.sketcher.sk.ents.find(e => e.id === id).a', C))]); page.click('#toolbar button[data-cmd="c-fix"]'); ev('app.sketcher.idle()'); page.wait_for_timeout(250)
    check('kısıt düğmesi: Sabitle', ev('(id) => !!app.sketcher.sk.points[id].fixed', ev('(id) => app.sketcher.sk.ents.find(e => e.id === id).a', C)))
    # yapı kipi düğmesi aktif görünür
    page.click('#toolbar button[data-cmd="c-construct"]'); page.wait_for_timeout(200)
    check('Yapı kipi düğmesi etkin görünür', ' on' in ' ' + page.get_attribute('#toolbar button[data-cmd="c-construct"]', 'class'))
    page.click('#toolbar button[data-cmd="c-construct"]'); page.wait_for_timeout(100)
    # açı ölçüsü: iki çizgi seç, Ölçü aracı
    sel([E(A), E(D)]); page.click('#toolbar button[data-cmd="dim"]'); page.wait_for_selector('input.sk-input', timeout=5000)
    page.fill('input.sk-input', '25'); page.press('input.sk-input', 'Enter'); ev('app.sketcher.idle()'); page.wait_for_timeout(300)
    check('açı ölçüsü', cons('angle') == 1 and ev('app.sketcher.lastSolve.ok'), ev('JSON.stringify(app.sketcher.sk.cons.slice(-2))'))
    # nokta-çizgi ölçüsü
    sel([Pt(ev('(id) => app.sketcher.sk.ents.find(e => e.id === id).a', T1)), E(L1)]); page.click('#toolbar button[data-cmd="dim"]')
    try:
        page.wait_for_selector('input.sk-input', timeout=5000); page.fill('input.sk-input', '20'); page.press('input.sk-input', 'Enter'); ev('app.sketcher.idle()'); page.wait_for_timeout(300)
    except Exception as e: pass
    check('nokta-çizgi mesafe ölçüsü', cons('pldist') == 1, ev('JSON.stringify(app.sketcher.sk.cons.slice(-2))'))
    shot('19_kisitlar')
    check('kısıt listesi panelde (✕ düğmeli)', page.locator('#sk-cons .row').count() >= 8 and page.locator('#sk-cons .row button').count() >= 8)
    n0 = page.locator('#sk-cons .row').count(); page.locator('#sk-cons .row button').first.click(); page.wait_for_timeout(300)
    check('panelden kısıt silme', page.locator('#sk-cons .row').count() == n0 - 1)
    page.click('#sk-cancel'); idle()

    # ---------------------------------------------------------------- S: güvenlik (S-02 içe aktarma önbelleği, S-12 şema, S-05 CSP, S-06 kurtarma)
    print('S: güvenlik')
    import base64, hashlib
    def step_b64(w):
        return ev('''async (w) => { await app.loadDoc({ params: [], features: [{ id: 'b1', type: 'primitive', name: 'K', kind: 'box', x: '0', y: '0', z: '0', w: String(w), d: String(w), h: String(w), op: 'new' }] });
            await app.whenIdle(); const d = await app.query('export', { format: 'step', ids: [app.result.bodies[0].id] }); let s = ''; for (const c of d) s += String.fromCharCode(c); return btoa(s); }''', w)
    stepA = os.path.join(TMP, 'sec_A.step'); stepB = os.path.join(TMP, 'sec_B.step')
    open(stepA, 'wb').write(base64.b64decode(step_b64(10))); open(stepB, 'wb').write(base64.b64decode(step_b64(20)))
    ev('app.markDirty(false)')
    def do_import(path):
        with page.expect_file_chooser() as fc: menu('Dosya', 'STEP İçe Aktar…')
        fc.value.set_files(path); page.wait_for_timeout(400); idle()
    # S-02: Yeni -> A içe aktar -> Yeni -> B içe aktar (hacim 8000 beklenir)
    menu('Dosya', 'Yeni'); idle(); ev('window.__w0 = app.worker'); do_import(stepA)
    idA = ev('app.doc.features[0].id'); hashA = ev('app.doc.features[0].hash'); volA = vol()
    check('S-02: A (10 mm küp) içe aktarıldı, hacim 1000', near(volA, 1000, 5e-3), str(volA))
    ev('app.markDirty(false)'); menu('Dosya', 'Yeni'); idle()
    check('S-02: Yeni belgede çekirdek işçisi sıfırlandı (yeniden başlatıldı)', ev('app.worker !== window.__w0'))
    do_import(stepB)
    idB = ev('app.doc.features[0].id'); hashB = ev('app.doc.features[0].hash'); volB = vol()
    check('S-02: B (20 mm küp) içe aktarıldı, hacim 8000 (eski önbellekteki A DEĞİL)', near(volB, 8000, 5e-3), str(volB))
    check('S-02: içe aktarma kimlikleri benzersiz (imp1 değil)', idA != idB and idA != 'imp1' and idB != 'imp1' and idA.startswith('imp_'), f'{idA} {idB}')
    dataB = ev('app.doc.features[0].data')
    check('S-02: hash = verinin SHA-256\'sı', hashB == hashlib.sha256(base64.b64decode(dataB)).hexdigest() and hashA != hashB and len(hashB) == 64, hashB)
    # içe aktar -> geri al -> başka dosya içe aktar
    ev('app.markDirty(false)'); menu('Dosya', 'Yeni'); idle(); do_import(stepA); ev('app.undo()'); idle(); do_import(stepB)
    check('S-02: içe aktar, geri al, başka dosya içe aktar: B geometrisi', near(vol(), 8000, 5e-3), str(vol()))
    # eski biçim: iki .acad dosyasında aynı kimlik (imp1) + farklı veri
    def legacy(path, stp):
        d = base64.b64encode(open(stp, 'rb').read()).decode()
        json.dump({'app': 'AtolyeCAD', 'version': 1, 'doc': {'params': [], 'features': [{'id': 'imp1', 'type': 'import', 'name': 'x', 'format': 'step', 'data': d}]}}, open(path, 'w'))
    accA = os.path.join(TMP, 'sec_A.acad'); accB = os.path.join(TMP, 'sec_B.acad'); legacy(accA, stepA); legacy(accB, stepB)
    def open_acad(path):
        ev('app.markDirty(false)')
        with page.expect_file_chooser() as fc: menu('Dosya', 'Aç…')
        fc.value.set_files(path); page.wait_for_timeout(500); idle()
    open_acad(accA); v1 = vol(); open_acad(accB); v2 = vol()
    check('S-02: A.acad aç, B.acad aç (ikisinde de imp1): 1000 sonra 8000', near(v1, 1000, 5e-3) and near(v2, 8000, 5e-3), f'{v1} {v2}')

    # S-12: şema doğrulaması, mevcut belge korunur
    ev('(d) => app.loadDoc(d)', {'params': [], 'features': [{'id': 'b1', 'type': 'primitive', 'name': 'K', 'kind': 'box', 'x': '0', 'y': '0', 'z': '0', 'w': '40', 'd': '30', 'h': '20', 'op': 'new'}]}); idle()
    snap = ev('JSON.stringify(app.doc)')
    box0 = json.loads(snap)['features'][0]
    deep = None
    for _ in range(300): deep = [deep]
    bads = {
        'doc sayı': 5, 'params=[null]': {'params': [None], 'features': []}, 'features=[null]': {'params': [], 'features': [None]},
        'bilinmeyen tür': {'params': [], 'features': [{'id': 'x', 'type': 'warp'}]}, 'ents=5': {'params': [], 'features': [{'id': 's', 'type': 'sketch', 'ents': 5}]},
        'desen 200000': {'params': [], 'features': [box0, {'id': 'p1', 'type': 'pattern', 'kind': 'rect', 'source': {'kind': 'feature', 'id': 'b1'}, 'count1': '200000', 'count2': '1'}]},
        'iç içe 300': {'params': [], 'features': [dict(box0, note=deep)]}, 'rollback=-5': dict({'params': [], 'features': [box0]}, rollback=-5),
        'yinelenen kimlik': {'params': [], 'features': [box0, box0]}, 'içe aktarma özeti yanlış': {'params': [], 'features': [{'id': 'imp_1', 'type': 'import', 'name': 'x', 'format': 'step', 'data': base64.b64encode(open(stepA, 'rb').read()).decode(), 'hash': '0' * 64}]},
    }
    for nm, doc in bads.items():
        pth = os.path.join(TMP, 'sec_bad.acad'); json.dump({'app': 'AtolyeCAD', 'version': 1, 'doc': doc}, open(pth, 'w'))
        ev('app.markDirty(false)'); ev('document.querySelector("#toast").classList.add("hidden")')
        with page.expect_file_chooser() as fc: menu('Dosya', 'Aç…')
        fc.value.set_files(pth); page.wait_for_timeout(500); idle()
        check(f'şema: "{nm}" reddedildi, uyarı gösterildi, mevcut belge aynen korundu', ev('JSON.stringify(app.doc)') == snap and 'açılamadı' in toast_text() and not page.is_visible('#modal:not(.hidden)'), toast_text())
    # daha yeni sürüm: uyarı penceresi; vazgeç = yüklenmez, "Yine de Aç" = yüklenir
    pth = os.path.join(TMP, 'sec_new.acad'); json.dump({'app': 'AtolyeCAD', 'version': 2, 'doc': {'params': [], 'features': [dict(box0, id='nb1', w='77')]}}, open(pth, 'w'))
    ev('app.markDirty(false)')
    with page.expect_file_chooser() as fc: menu('Dosya', 'Aç…')
    fc.value.set_files(pth); page.wait_for_selector('#modal:not(.hidden)')
    check('daha yeni sürüm dosyası: "daha yeni bir sürümle kaydedilmiş" uyarısı', 'daha yeni bir sürümle kaydedilmiş' in page.inner_text('#modal'), page.inner_text('#modal'))
    page.click('#modal button[data-v="false"]'); page.wait_for_timeout(300); idle()
    check('daha yeni sürüm: vazgeçince yüklenmedi', ev('JSON.stringify(app.doc)') == snap)
    ev('app.markDirty(false)')
    with page.expect_file_chooser() as fc: menu('Dosya', 'Aç…')
    fc.value.set_files(pth); page.wait_for_selector('#modal:not(.hidden)'); page.click('#modal button[data-v="true"]'); page.wait_for_timeout(500); idle()
    check('daha yeni sürüm: "Yine de Aç" ile yüklendi', ev('app.doc.features[0].id') == 'nb1')
    # S-08 (arayüz tarafı): desen adedi üst sınırı panelde (Tamam engellenir; çekirdek tarafı ayrıca düzeltilecek)
    ev('(d) => app.loadDoc(d)', {'params': [], 'features': [box0]}); idle()
    ev("app.startFeature('pattern')"); page.wait_for_selector('#panel [data-k="count1"]'); fill('count1', 200000); idle()
    page.click('#p-ok'); page.wait_for_timeout(300)
    check('desen adedi 200000: panelde hata, Tamam engellendi (çekirdek kilitlenmedi)', ev('!!app.edit') and '2000' in toast_text() and ev('app.doc.features.length') == 1, toast_text())
    ev('app.edit.cancel()'); idle()
    # sürükle-bırak: sayfa gezinmez (varsayılan eylem iptal)
    check('sürükle-bırak: drop olayı varsayılan eylemi iptal edildi', ev('(() => { const dt = new DataTransfer(); dt.items.add(new File(["x"], "a.html")); const e = new DragEvent("drop", { dataTransfer: dt, cancelable: true, bubbles: true }); window.dispatchEvent(e); return e.defaultPrevented; })()'))

    # S-05: CSP meta etiketi ve ihlal yok (satır içi stil dahil: style-src'de unsafe-inline yok)
    csp_meta = ev('document.querySelector(\'meta[http-equiv="Content-Security-Policy"]\').content')
    check('CSP meta etiketi: sıkı ilke (unsafe-eval / unsafe-inline yok, default-src none)', "default-src 'none'" in csp_meta and "'unsafe-eval'" not in csp_meta and "'unsafe-inline'" not in csp_meta and "form-action 'none'" in csp_meta, csp_meta)
    # not: CDP "evaluate" CSP eval engelini atlar; Playwright'ın dizge ifadeli wait_for_function sorgusu ise sayfa bağlamında eval kullanır ve engellenir
    csp_before = ev('window.__csp.slice()')
    try: page.wait_for_function('document.querySelector("#viewport").dataset.zzz === "1"', timeout=3000); evalblocked = False
    except Exception as e: evalblocked = 'unsafe-eval' in str(e) and 'Content Security Policy' in str(e)
    check('CSP: sayfada eval (dizgeden betik) engelli: EvalError üretildi', evalblocked)
    page.evaluate("() => { const s = document.createElement('script'); s.textContent = 'window.__inl = 1'; document.body.append(s); }")
    check('CSP: satır içi <script> çalışmadı', ev('window.__inl') is None)
    check('CSP: uygulama tüm akış boyunca (kasıtlı sınamalar öncesi) HİÇ CSP ihlali üretmedi', len(csp_before) == 0, str(csp_before[:3]))
    ev('window.__csp = []')


    # S-06: otomatik kurtarma (tarayıcı kipi: IndexedDB). Varsayılan ayarlı ayrı bağlam (60 sn zamanlayıcı açık)
    print('S: otomatik kurtarma (tarayıcı)')
    c3 = br.new_context(viewport={'width': 1300, 'height': 800}, accept_downloads=True, locale='tr-TR')
    c3.add_init_script("try { if (!localStorage.getItem('atolye.lang')) localStorage.setItem('atolye.lang', 'tr'); } catch (e) {} window.__ints = []; const si = window.setInterval.bind(window); window.setInterval = (f, ms, ...a) => { window.__ints.push([f, ms]); return si(f, ms, ...a); };")
    p3 = c3.new_page(); p3.on('dialog', lambda d: d.accept()); ev3 = p3.evaluate
    p3.goto(f'http://127.0.0.1:{PORT}/'); p3.wait_for_function('() => window.app', timeout=30000); ev3('app.ready')
    def idb_has(): return ev3("""() => new Promise((res) => { const r = indexedDB.open('atolyecad-recovery', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('autosave'); g.onsuccess = () => { r.result.close(); res(g.result ? g.result.byteLength : 0); }; }; r.onerror = () => res(-1); })""")
    p3.wait_for_function('() => window.app._recTimer'); check('kurtarma: zamanlayıcı 60 sn aralıkla kuruldu', ev3('app.recoveryMs') == 60000 and ev3('window.__ints.some(([f, ms]) => ms === 60000)'))
    ev3('(d) => app.loadDoc(d)', {'params': [], 'features': [box0]}); ev3('app.whenIdle()')
    ev3('window.__ints.find(([f, ms]) => ms === 60000)[0]()'); p3.wait_for_timeout(300)
    check('kurtarma: temiz belgede zamanlayıcı bir şey yazmaz', idb_has() == 0)
    ev3('app.doc.features[0].w = "91"; app.markDirty(true)'); ev3('window.__ints.find(([f, ms]) => ms === 60000)[0]()'); p3.wait_for_timeout(500)
    check('kurtarma: değişiklik varken zamanlayıcı geri çağrısı yedeği yazdı', idb_has() > 100, str(idb_has()))
    p3.reload(); p3.wait_for_function('() => window.app', timeout=30000); ev3('app.ready'); p3.wait_for_selector('#modal:not(.hidden)', timeout=10000)
    check('kurtarma: yeniden açılışta kullanıcıya soruldu', 'Kurtarma dosyası bulundu' in p3.inner_text('#modal h3') or 'Kurtarma dosyası bulundu' in p3.inner_text('#modal'), p3.inner_text('#modal')[:80])
    p3.click('#modal button.pri'); p3.wait_for_function('() => window.app.doc.features.length === 1'); ev3('app.whenIdle()')
    check('kurtarma: Kurtar -> belge geri geldi (w=91), değişmiş durumda, hacim hesaplandı', ev3('app.doc.features[0].w') == '91' and ev3('app.dirty') and abs(ev3('app.result.bodies[0].volume') - 91*30*20) < 1)
    check('kurtarma: kaydedilene kadar yedek durur', idb_has() > 100)
    with p3.expect_download() as dl: ev3('app.save()')
    p3.wait_for_timeout(500)
    check('kurtarma: kaydedince yedek silindi', idb_has() == 0 and not ev3('app.dirty'))
    ev3('app.doc.features[0].w = "92"; app.markDirty(true)'); ev3('window.__ints.find(([f, ms]) => ms === 60000)[0]()'); p3.wait_for_timeout(400)
    p3.reload(); p3.wait_for_function('() => window.app', timeout=30000); ev3('app.ready'); p3.wait_for_selector('#modal:not(.hidden)', timeout=10000)
    p3.click('#modal button:not(.pri)'); p3.wait_for_timeout(500)
    check('kurtarma: "Sil" -> yedek silindi, boş belge', idb_has() == 0 and ev3('app.doc.features.length') == 0)
    ev3('(d) => app.loadDoc(d)', {'params': [], 'features': [box0]}); ev3('app.whenIdle()'); ev3('app.markDirty(true)'); ev3('window.__ints.find(([f, ms]) => ms === 60000)[0]()'); p3.wait_for_timeout(400)
    ev3('app.markDirty(false)'); ev3('app.newDoc()'); p3.wait_for_timeout(1500)
    check('kurtarma: Yeni belge yedeği siler', idb_has() == 0)
    c3.close()

    # ---------------------------------------------------------------- H: dil değiştirme (Türkçe -> English -> Türkçe)
    print('H: dil değiştirme')
    def menu_titles(): return ev('[...document.querySelectorAll("#menubar [data-menu=file]")].map(b => b.textContent.trim()).join(",")')
    def group_titles(): return ev('[...document.querySelectorAll("#toolbar .glabel")].map(g => g.textContent).join(",")')
    def btn_text(act):
        if act in ('box', 'cylinder', 'sphere'):
            page.click('#toolbar button[data-cmd="dd-prim"]'); r = page.locator(f'#ddpop [data-cmd="{act}"]').inner_text().strip(); page.keyboard.press('Escape'); page.mouse.click(700, 500) if False else None; page.evaluate('document.querySelector("#ddpop")?.remove(); app.C.ddOpen = null'); return r
        b = page.locator(f'#toolbar button[data-cmd="{act}"]').first; return b.inner_text().strip() or (b.get_attribute('aria-label') or '')
    def lang_menu(code):
        page.click('#menubar .tbtn[data-cmd="settings"]'); page.click(f'[data-testid="set-lang-{code}"]'); page.keyboard.press('Escape')
        idle(); page.wait_for_timeout(200)
    def stored_lang(): return ev("localStorage.getItem('atolye.lang')")
    def left_text(): return page.inner_text('#st-left').strip()

    # ilk açılış dili: işletim sistemi dili (kayıtlı tercih yok)
    for loc, want, word in [('en-US', 'en', 'File'), ('de-DE', 'en', 'File'), ('tr-TR', 'tr', 'Dosya')]:
        c2 = br.new_context(viewport={'width': 1200, 'height': 800}, locale=loc)
        p2 = c2.new_page(); p2.goto(f'http://127.0.0.1:{PORT}/'); p2.wait_for_function('() => (window.app && document.querySelector("#menubar button"))', timeout=30000)
        got = p2.evaluate('document.querySelector("#menubar [data-menu=file]").textContent.trim()')
        check(f'ilk açılış ({loc}): menü "{word}", tercih yazılmadı', got == word and p2.evaluate("localStorage.getItem('atolye.lang')") is None and p2.evaluate('document.documentElement.lang') == want, got)
        c2.close()

    ev('app.loadDoc({params: [], features: []})'); idle(); ev('app.viewport.view("iso", true)')
    check('H başlangıç: Türkçe', menu_titles() == 'Dosya' and stored_lang() == 'tr')
    tb('sketch'); page.wait_for_timeout(300)
    click_world([50, 55, 0]); page.wait_for_function('() => (app.sketchSession)', timeout=10000); ev('app.sketcher.idle()')
    tb('rect'); page.wait_for_timeout(300)
    sk_click(0, 0); sk_click(40, 30); page.wait_for_timeout(300)
    check('H: sketch kipi Türkçe (kısıt, durum)', btn_text('c-perpendicular') == 'Dik' and 'Serbestlik' in left_text(), left_text())
    lang_menu('en')
    check('İngilizce: menü başlıkları', menu_titles() == 'File', menu_titles())
    check('İngilizce: html lang, tercih saklandı', ev('document.documentElement.lang') == 'en' and stored_lang() == 'en')
    check('İngilizce: sketch araç çubuğu grupları', group_titles() == 'Draw,Edit,Dimensions and constraints,Sketch', group_titles())
    check('İngilizce: sketch düğmeleri', btn_text('rect') == 'Rectangle' and btn_text('c-perpendicular') == 'Perpendicular' and btn_text('c-tangent') == 'Tangent' and btn_text('c-parallel') == 'Parallel' and btn_text('sk-finish') == 'Finish Sketch' and btn_text('c-construct') == 'Construction')
    check('İngilizce: sketch paneli (düzlem, kısıtlar)', page.inner_text('#panel h3').startswith('Sketch:') and 'Plane: XY' in page.inner_text('#panel') and 'Constraints' in page.inner_text('#panel'), page.inner_text('#panel'))
    check('İngilizce: sketch durumu', 'Degrees of freedom' in left_text() or 'Fully defined' in left_text(), left_text())
    check('İngilizce: sketch ipucu', ev('document.querySelector("#hint").textContent').startswith('Rectangle:'), ev('document.querySelector("#hint").textContent'))
    shot('en_01_sketch')
    # İngilizce sketch çizimi sürer: ölçü kutusu, kısıt rozeti başlıkları
    tb('dim'); page.wait_for_timeout(200)
    sk_click(20, 0); page.wait_for_selector('input.sk-input', timeout=5000)
    check('İngilizce: ölçü giriş kutusu başlığı', ev('document.querySelector("input.sk-input").title') == 'Distance', ev('document.querySelector("input.sk-input").title'))
    check('İngilizce: ölçü durumu', 'type a value' in left_text(), left_text())
    page.fill('input.sk-input', '50'); page.press('input.sk-input', 'Enter'); ev('app.sketcher.idle()'); page.wait_for_timeout(400)
    check('İngilizce: kısıt listesi', 'Distance: 50' in page.inner_text('#sk-cons'), page.inner_text('#sk-cons'))
    page.click('#toolbar button[data-cmd="sk-finish"]'); idle()
    check('İngilizce: sketch kaydedildi', ev('app.doc.features.length') == 1 and ev('app.doc.features[0].name') == 'Sketch 1', ev('app.doc.features.map(f => f.name)'))

    tb('extrude'); page.wait_for_selector('#panel [data-k="dist"]')
    labels = page.locator('#panel .fld > label').all_inner_texts()
    check('İngilizce: Extrude paneli', page.inner_text('#panel h3') == 'New Extrude' and labels[:3] == ['Sketch', 'Profiles', 'Operation'] and 'Distance' in labels and 'Flip' in labels, str(labels))
    check('İngilizce: Extrude seçenekleri', page.inner_text('#panel select[data-k="op"]').split() == ['New', 'body', 'Join', 'Cut', 'Intersect'] and 'Symmetric' in page.inner_text('#panel select[data-k="dir"]'), page.inner_text('#panel select[data-k="op"]'))
    check('İngilizce: Tamam/İptal', page.inner_text('#p-ok').startswith('OK') and page.inner_text('#p-cancel').startswith('Cancel'))
    shot('en_02_extrude_panel')
    fill('dist', 10); ok()
    check('İngilizce: extrude gövdesi', nbodies() == 1 and near(vol(), 50 * 30 * 10), vol())
    check('İngilizce: araç çubuğu grupları', group_titles().startswith('Create,Modify,Inspect'), group_titles())
    check('İngilizce: araç çubuğu düğmeleri', [btn_text(a) for a in ['sketch', 'extrude', 'revolve', 'hole', 'box', 'cylinder', 'sphere', 'fillet', 'chamfer', 'shell', 'combine', 'move', 'pattern', 'mirror', 'measure', 'props', 'interf', 'section']] ==
          ['Sketch', 'Extrude', 'Revolve', 'Hole', 'Box', 'Cylinder', 'Sphere', 'Fillet', 'Chamfer', 'Shell', 'Combine', 'Move/Copy', 'Pattern', 'Mirror', 'Measure', 'Properties', 'Interference', 'Section'])
    check('İngilizce: görünüm düğmeleri', ev('[...document.querySelectorAll("#viewbtns button")].map(b => b.getAttribute("aria-label")).join(",")') == 'Front,Top,Right,Iso,Fit')
    check('İngilizce: zaman çizelgesi ve tarayıcı', page.inner_text('#timeline .tl-label').lower() == 'timeline' and all(w in page.inner_text('#browser').lower() for w in ['bodies', 'sketches', 'parameters']), page.inner_text('#timeline')+'|'+page.inner_text('#browser'))
    check('İngilizce: durum çubuğu', all(w in page.inner_text('#statusbar-main') for w in ['1 bodies', '0 selected', 'Compute']), page.inner_text('#statusbar-main'))
    check('İngilizce: gövde adı (varsayılan)', 'Body 1' in page.inner_text('#browser'), page.inner_text('#browser'))

    # çekirdek hatası: çok büyük fillet, İngilizce panel + zaman çizelgesi
    tb('fillet'); page.wait_for_selector('#panel [data-k="edges"]')
    click_world([0, 0, 5]); page.wait_for_function('() => (document.querySelector("#panel .selbox[data-k=edges]").dataset.count === "1")', timeout=8000)
    fill('r', 500); idle(); page.wait_for_timeout(300)
    err_en = ev('document.querySelector("#p-err").textContent')
    check('İngilizce: çekirdek hatası panelde (fillet.too_big)', err_en == 'Fillet failed: the value may be too large for these edges', err_en)
    check('İngilizce: seçim alanı sayacı', 'Edges selected: 1' in page.inner_text('#panel .selbox'), page.inner_text('#panel .selbox'))
    shot('en_03_fillet_error')
    # panel açıkken Türkçeye geç: başlık, etiketler, hata metni anında Türkçe olur; geri İngilizce
    lang_menu('tr')
    err_tr = ev('document.querySelector("#p-err").textContent')
    check('açık panel dil değişince Türkçe (başlık, etiket, hata)', page.inner_text('#panel h3') == 'Yeni Yuvarlat' and 'Kenarlar' in page.inner_text('#panel') and err_tr.startswith('Yuvarlatma başarısız') and page.inner_text('#p-ok').startswith('Tamam'), page.inner_text('#panel h3')+'|'+page.inner_text('#panel')[:200]+'|'+page.inner_text('#p-ok'))
    check('panel taslağı dil değişince korundu (r=500, kenar seçili)', page.input_value('#panel [data-k="r"]') == '500' and ev('document.querySelector("#panel .selbox[data-k=edges]").dataset.count') == '1')
    lang_menu('en')
    check('açık panel tekrar İngilizce', page.inner_text('#panel h3') == 'New Fillet' and ev('document.querySelector("#p-err").textContent') == err_en)
    ok()
    bad = ev('app.doc.features.length - 1')
    check('İngilizce: hatalı özellik çizelgede kırmızı + İngilizce başlık', 'err' in chip(bad).get_attribute('class') and (chip(bad).get_attribute('title') or '') == err_en, chip(bad).get_attribute('title'))
    check('İngilizce: durum çubuğu hata metni', left_text().startswith('Error: "Fillet 1": Fillet failed'), left_text())
    check('İngilizce: toast', 'The feature was saved but has an error' in toast_text(), toast_text())
    shot('en_04_timeline_error')
    chip(bad).click(button='right')
    check('İngilizce: zaman çizelgesi menüsü', [x.split('\n')[0] for x in page.locator('#ctx button').all_inner_texts()] == ['Edit', 'Rename', 'Suppress', 'Roll back to here', 'Delete'], str(page.locator('#ctx button').all_inner_texts()))
    page.keyboard.press('Escape'); page.mouse.click(700, 400)
    lang_menu('tr')
    check('Türkçeye dönüş: zaman çizelgesi hata başlığı Türkçe', (chip(bad).get_attribute('title') or '').startswith('Yuvarlatma başarısız') and left_text().startswith('Hata: "Fillet 1"') and page.inner_text('#timeline .tl-label') in ('Zaman çizelgesi', 'ZAMAN ÇİZELGESİ'), left_text()+'|'+page.inner_text('#timeline .tl-label'))
    check('Türkçeye dönüş: belge içeriği çevrilmedi (özellik adı aynı)', ev('app.doc.features[app.doc.features.length - 1].name') == 'Fillet 1')
    lang_menu('en')

    # menüler (İngilizce) ve açık kip pencereler
    page.click('#menubar button[data-menu="file"]')
    check('İngilizce: Dosya menüsü', [x.split('\n')[0] for x in page.locator('#menubar .menu.open .drop > button').all_inner_texts()][:6] == ['New', 'Open…', 'Save', 'Save As…', 'Import STEP…', 'Import STL…'], str(page.locator('#menubar .menu.open .drop > button').all_inner_texts()))
    page.keyboard.press('Escape'); page.mouse.click(700, 500)
    page.click('#menubar button[data-menu="help"]'); page.click('#menubar [data-cmd="about"]'); page.wait_for_selector('#modal:not(.hidden)')
    check('İngilizce: Hakkında penceresi', page.inner_text('#modal h3') == 'About Mihenk CAD/CAM' and 'Parametric solid modeling' in page.inner_text('#modal'), page.inner_text('#modal h3'))
    page.keyboard.press('Escape')
    tb('measure'); page.wait_for_timeout(300)
    check('İngilizce: Ölç kutusu + ipucu', page.inner_text('#measurebox').startswith('Measure') and 'Select an edge or a face' in page.inner_text('#measurebox') and ev('document.querySelector("#hint").textContent').startswith('Click an edge'))
    lang_menu('tr')
    check('Ölç kutusu dil değişince Türkçe', 'Bir kenar ya da yüz seçin' in page.inner_text('#measurebox') and ev('document.querySelector("#hint").textContent').startswith('Ölçmek için'))
    lang_menu('en'); page.keyboard.press('Escape'); page.wait_for_timeout(150)
    page.click('#br-params'); page.wait_for_selector('#modal #par-add')
    page.click('#par-add'); page.fill('#modal tr:last-child input[data-k="name"]', '1x')
    check('İngilizce: parametre tablosu', page.inner_text('#modal h3') == 'Parameters' and page.locator('#modal th').all_inner_texts()[:4] == ['Name', 'Expression', 'Value', 'Note'] and 'cannot start with a digit' in page.inner_text('#modal tr:last-child .pe'), page.inner_text('#modal tr:last-child .pe'))
    page.fill('#modal tr:last-child input[data-k="name"]', 'W'); page.fill('#modal tr:last-child input[data-k="expr"]', 'Q+1')
    check('İngilizce: parametre ifade hatası', page.inner_text('#modal tr:last-child .pe') == 'Unknown parameter: Q', page.inner_text('#modal tr:last-child .pe'))
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    shot('en_05_model')

    # tercih saklanır: sayfayı yeniden yükle
    ev('app.markDirty(false)')
    page.reload(); page.wait_for_function('() => (window.app)', timeout=30000); ev('app.ready')
    check('yeniden yükleme: İngilizce korundu', menu_titles() == 'File' and ev('document.documentElement.lang') == 'en' and stored_lang() == 'en', menu_titles())
    check('yeniden yükleme: yükleme metni/ayarlar İngilizce', group_titles().startswith('Create,Modify,Inspect') and page.inner_text('#st-left').strip() == 'Ready', group_titles())
    lang_menu('tr')
    check('Türkçeye dön: menü, araç çubuğu, tercih', menu_titles() == 'Dosya' and group_titles().lower().startswith('oluştur,düzenle,') and stored_lang() == 'tr' and ev('document.documentElement.lang') == 'tr', menu_titles())
    page.reload(); page.wait_for_function('() => (window.app)', timeout=30000); ev('app.ready')
    check('yeniden yükleme: Türkçe korundu', menu_titles() == 'Dosya' and page.inner_text('#st-left').strip() == 'Hazır', menu_titles())

    # ---------------------------------------------------------------- K-018: uygulama düzeyi (dikdörtgen + daire -> Buda -> Extrude)
    print('K-018: uygulama düzeyinde buda ve extrude')
    import math
    menu('Dosya', 'Yeni'); page.wait_for_timeout(200)
    if page.locator('#modal:not(.hidden)').count(): page.click('#modal button[data-v="true"]')
    idle()
    tb('sketch'); page.wait_for_timeout(300)
    click_world([50, 55, 0]); page.wait_for_function('() => (app.sketchSession)', timeout=10000); ev('app.sketcher.idle()')
    def sk_px(u, v):
        return ev('([u, v]) => { const V = app.sketcher.plane; const w = [V.o[0] + V.x[0]*u + V.y[0]*v, V.o[1] + V.x[1]*u + V.y[1]*v, V.o[2] + V.x[2]*u + V.y[2]*v]; const [x, y] = app.viewport.project(w); const r = app.viewport.renderer.domElement.getBoundingClientRect(); return [r.left + x, r.top + y]; }', [u, v])
    def sk_click(u, v):
        x, y = sk_px(u, v); page.mouse.move(x, y); page.wait_for_timeout(60); page.mouse.click(x, y); ev('app.sketcher.idle()'); page.wait_for_timeout(60)
    # görünümü eskize göre ayarla (sığdır)
    tb('rect'); page.wait_for_timeout(200); sk_click(-40, -10); sk_click(0, 10)
    tb('circle'); page.wait_for_timeout(100); sk_click(0, 0); sk_click(8, 0)
    regs = lambda: ev('app.sketcher.sk.ents.length')
    check('K-018: dikdörtgen ve daire çizildi', ev('app.sketcher.sk.ents.filter(e => e.type === "circle").length') == 1 and ev('app.sketcher.sk.ents.filter(e => e.type === "line").length') == 4)
    tb('trim'); page.wait_for_timeout(150)
    x, y = sk_px(-8, 0); page.mouse.move(x, y); page.wait_for_timeout(120)
    check('K-018: Buda hover kırmızı önizleme', ev('app.sketcher.gPrev.children.some(c => c.material && c.material.color.getHexString() === getComputedStyle(document.documentElement).getPropertyValue("--vp-sk-error").trim().replace("#", "").toLowerCase())'))
    page.mouse.click(x, y); ev('app.sketcher.idle()'); page.wait_for_timeout(120)
    sk_click(0, 6)
    ev('app.sketcher.idle()'); page.wait_for_timeout(200)
    check('K-018: budamadan sonra çözüm tamam', ev('app.sketcher.lastSolve && app.sketcher.lastSolve.ok'))
    shot('k018_buda')
    tb('sk-finish'); page.wait_for_function('() => !app.sketchSession', timeout=10000); idle()
    tb('extrude'); page.wait_for_selector('#panel [data-k="dist"]'); fill('dist', 10); ok()
    expect = (800 + 32 * math.pi) * 10
    check('K-018: extrude hacmi = (800+32π)×10 = %.3f' % expect, near(vol(), expect, 1e-3), vol())
    shot('k018_extrude')

    # ---------------------------------------------------------------- sketch araç çubuğu: taşma denetimi (TR/EN, dar pencerede)
    print('Araç çubuğu taşması')
    page.set_viewport_size({'width': 1200, 'height': 800}); page.wait_for_timeout(200)
    ev('app.markDirty(false)'); menu('Dosya', 'Yeni'); page.wait_for_timeout(200)
    if page.locator('#modal:not(.hidden)').count(): page.click('#modal button[data-v="true"]')
    idle()
    tb('sketch'); page.wait_for_timeout(300)
    click_world([50, 55, 0]); page.wait_for_function('() => (app.sketchSession)', timeout=10000); ev('app.sketcher.idle()')
    def overflow():
        return ev("() => { const b = document.querySelector('#toolbar'); const r = b.getBoundingClientRect(); const out = [...b.querySelectorAll('button')].filter(x => x.offsetParent !== null).filter(x => { const q = x.getBoundingClientRect(); return q.right > r.right + 0.5 || q.left < r.left - 0.5; }).map(x => x.dataset.cmd); return {scroll: b.scrollWidth - b.clientWidth, out}; }")
    o = overflow(); check('TR: sketch araç çubuğu taşmıyor (1200 px)', o['scroll'] <= 1 and not o['out'], o)
    shot('toolbar_tr_sketch')
    for dd in ['draw', 'edit', 'cons']:
        if not page.locator(f'#toolbar button[data-cmd="dd-{dd}"]').is_visible():
            check(f'TR: "{dd}" grubu taşma menüsünde (»)', page.locator('#toolbar [data-cmd="ribbon-overflow"]').count() == 1); continue
        page.click(f'#toolbar button[data-cmd="dd-{dd}"]'); page.wait_for_timeout(150)
        pr = ev("() => { const p = document.querySelector('#ddpop'); if (!p) return null; const r = p.getBoundingClientRect(); return {l: r.left, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight, n: p.querySelectorAll('button').length}; }")
        check(f'TR: "{dd}" açılır grubu ekrana sığıyor', pr and pr['l'] >= 0 and pr['r'] <= pr['w'] and pr['b'] <= pr['h'], pr)
        shot(f'toolbar_tr_{dd}'); page.mouse.click(5, 5); page.wait_for_timeout(100)
    lang_menu('en')
    o = overflow(); check('EN: sketch araç çubuğu taşmıyor (1200 px)', o['scroll'] <= 1 and not o['out'], o)
    shot('toolbar_en_sketch')
    for dd in ['draw', 'edit', 'cons']:
        if not page.locator(f'#toolbar button[data-cmd="dd-{dd}"]').is_visible():
            check(f'EN: "{dd}" grubu taşma menüsünde (»)', page.locator('#toolbar [data-cmd="ribbon-overflow"]').count() == 1); continue
        page.click(f'#toolbar button[data-cmd="dd-{dd}"]'); page.wait_for_timeout(150)
        pr = ev("() => { const p = document.querySelector('#ddpop'); if (!p) return null; const r = p.getBoundingClientRect(); return {l: r.left, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight}; }")
        check(f'EN: "{dd}" açılır grubu ekrana sığıyor', pr and pr['l'] >= 0 and pr['r'] <= pr['w'] and pr['b'] <= pr['h'], pr)
        shot(f'toolbar_en_{dd}'); page.mouse.click(5, 5); page.wait_for_timeout(100)
    # düğme etiketleri kırpılmıyor mu: her düğmenin metni genişliğine sığıyor
    clipped = ev("[...document.querySelectorAll('#toolbar .tool .l')].filter(s => s.offsetParent !== null && s.scrollWidth > s.clientWidth + 1).map(s => s.textContent)")
    check('EN: toolbar etiketleri kırpılmıyor', not clipped, clipped)
    lang_menu('tr')
    clipped = ev("[...document.querySelectorAll('#toolbar .tool .l')].filter(s => s.offsetParent !== null && s.scrollWidth > s.clientWidth + 1).map(s => s.textContent)")
    check('TR: toolbar etiketleri kırpılmıyor', not clipped, clipped)
    tb('sk-cancel'); page.wait_for_timeout(200)
    page.set_viewport_size({'width': 1400, 'height': 860}); page.wait_for_timeout(200)

    check('CSP: dil değiştirme dahil son aşamada da ihlal yok', ev('window.__csp.length') == 0, str(ev('window.__csp')[:3]))
    print('\nkonsol hataları:', [e for e in errs if 'GL Driver' not in e][:5])
    check('konsolda sayfa hatası yok', not [e for e in errs if e.startswith('pageerror')], str([e for e in errs if e.startswith('pageerror')][:3]))
    br.close()
finally:
    if server: server.terminate()
print(f'\n{passed} geçti, {failed} kaldı'); sys.exit(1 if failed else 0)
