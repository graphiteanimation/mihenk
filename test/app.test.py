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
    ctx = br.new_context(viewport={'width': 1400, 'height': 860}, accept_downloads=True)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    ev = page.evaluate

    def idle(): ev('app.whenIdle()')
    def shot(n): page.screenshot(path=os.path.join(SHOTS, n + '.png'))
    def vol(i=0): return ev(f'app.result.bodies[{i}] ? app.result.bodies[{i}].volume : null')
    def nbodies(): return ev('app.result.bodies.length')
    def tb(act): page.click(f'#toolbar button[data-act="{act}"]')
    def fill(k, v): page.fill(f'#panel [data-k="{k}"]', str(v)); 
    def select(k, v): page.select_option(f'#panel select[data-k="{k}"]', v)
    def ok(): page.click('#p-ok'); idle()
    def menu(m, item):
        page.click(f'#menubar button[data-menu="{m}"]')
        page.locator('#menubar .drop button').filter(has=page.get_by_text(item, exact=True)).first.click()
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
    page.wait_for_function('window.app', timeout=30000)
    ev('app.ready')
    check('uygulama açıldı, çekirdek yüklendi', ev('document.querySelector("#loading").classList.contains("hidden")'))
    check('menü başlıkları', ev('[...document.querySelectorAll("#menubar .menu > button")].map(b => b.textContent).join(",")') == 'Dosya,Düzen,Görünüm,Yardım')
    groups = ev('[...document.querySelectorAll("#toolbar .gl")].map(g => g.textContent).join(",")')
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
    page.wait_for_function('document.querySelector("#panel .selbox[data-k=edges]").dataset.count === "1"', timeout=8000)
    fill('r', 5); idle()
    shot('03_yuvarlat_secim')
    ok()
    st = ev('app.result.status[app.doc.features[1].id]')
    expect = 120000 - 25 * (1 - math.pi / 4) * 20
    check('yuvarlat: kenar seçimiyle uygulandı, hacim doğru', st['ok'] and near(vol(), expect, 1e-4), f"{vol()} vs {expect} {st}")

    # yüz seç: üst yüz, kabuk
    tb('shell'); page.wait_for_selector('#panel [data-k="faces"]')
    click_world([50, 30, 20])
    page.wait_for_function('document.querySelector("#panel .selbox[data-k=faces]").dataset.count === "1"', timeout=8000)
    fill('t', 2); idle()
    ok()
    st = ev('app.result.status[app.doc.features[2].id]')
    check('kabuk: yüz seçimiyle uygulandı', st['ok'] and 20000 < vol() < 26000, f'{vol()} {st}')
    shot('04_kabuk')

    # ---------------------------------------------------------------- hata: çok büyük yuvarlatma
    print('hata: büyük yuvarlatma')
    tb('fillet'); page.wait_for_selector('#panel [data-k="edges"]')
    # kabuktan önceki kutu yerine yeni belgede deneyelim: kutu üzerinde dış alt kenar
    click_world([50, 0, 0]); page.wait_for_function('document.querySelector("#panel .selbox[data-k=edges]").dataset.count === "1"', timeout=8000)
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
    d = dl.value; path = os.path.join(TMP, 'deneme.acad'); d.save_as(path)
    j = json.load(open(path))
    check('kaydet: .acad indirildi (app/version/doc)', j['app'] == 'AtolyeCAD' and j['version'] == 1 and len(j['doc']['features']) == 3 and d.suggested_filename.endswith('.acad'), d.suggested_filename)
    check('kayıttan sonra başlıkta • yok', not ev('document.title').startswith('•'))
    menu('Dosya', 'Yeni'); idle()
    check('yeni: boş belge (kayıtlı olduğu için onaysız)', nbodies() == 0 and ev('app.doc.features.length') == 0)
    with page.expect_file_chooser() as fc: menu('Dosya', 'Aç…')
    fc.value.set_files(path); page.wait_for_timeout(300); idle()
    check('aç: aynı hacim geri yüklendi', near(vol(), vsaved), f'{vol()} vs {vsaved}')
    check('aç: parametre ve özellikler', ev('app.doc.params.length') == 1 and ev('app.doc.features.length') == 3)
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
    click_world([50, 0, 10]); page.wait_for_function('document.querySelector("#measurebox").textContent.includes("Alan")', timeout=8000)
    check('ölç: tek yüz (tür, alan)', '2.000' in page.inner_text('#measurebox').replace(',', '.') or '2000' in page.inner_text('#measurebox').replace('.', ''), page.inner_text('#measurebox'))
    click_world([0, 30, 10]); page.wait_for_function('document.querySelector("#measurebox").textContent.includes("En kısa mesafe")', timeout=8000)
    bx = page.inner_text('#measurebox')
    check('ölç: iki yüz (mesafe, açı, ΔX/ΔY/ΔZ)', 'Açı' in bx and 'ΔX' in bx and '90' in bx, bx)
    shot('13_olc')
    page.keyboard.press('Escape')
    check('Esc ölçüyü kapatır', ev('document.querySelector("#measurebox").classList.contains("hidden")') and ev('app.tool') is None)
    ev('app.selection = [{kind: "body", body: "b1"}]')
    tb('props'); page.wait_for_function('document.querySelector("#measurebox").textContent.includes("Hacim")', timeout=8000)
    page.fill('#dens', '7,85'); pt = page.inner_text('#measurebox')
    check('özellikler: hacim, alan, ağırlık merkezi, kutu, kütle', all(w in pt for w in ['Hacim', 'Yüzey alanı', 'Ağırlık merkezi', 'Kutu ölçüleri']) and ('942' in pt or '942,0' in pt), pt)
    shot('14_ozellikler'); page.click('#mb-close')
    tb('interf'); page.wait_for_function('document.querySelector("#measurebox").textContent.includes("mm³")', timeout=10000)
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
    click_world([50, 55, 0]); page.wait_for_function('app.sketchSession', timeout=10000); ev('app.sketcher.idle()')
    check('sketch kipine girildi (XY düzlemi)', ev('app.sketcher.active') and ev('app.sketchSession.draft.plane.name') == 'XY', ev('JSON.stringify([app.sketcher.active, app.sketchSession.draft.plane])'))
    check('sketch araç çubuğu: ÇİZ, ÖLÇÜ, KISIT', page.locator('#toolbar button[data-act="rect"]').count() == 1 and page.locator('#toolbar button[data-act="c-parallel"]').count() == 1 and page.locator('#sk-finish').count() >= 1)
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
    page.click('#toolbar button[data-act="sk-finish"]'); idle()
    check('Sketch\'i Bitir: belgede sketch', ev('app.doc.features.length') == 1 and ev('app.doc.features[0].type') == 'sketch' and ev('app.sketcher.active') is False)
    tb('extrude'); page.wait_for_selector('#panel [data-k="dist"]'); fill('dist', 10); ok()
    check('extrude: 50x30x10 gövde', near(vol(), 15000), vol())
    # üst yüzde ikinci sketch -> kes
    tb('sketch'); page.wait_for_timeout(300)
    click_world([25, 15, 10]); page.wait_for_function('app.sketchSession', timeout=10000); ev('app.sketcher.idle()')
    check('yüz üstüne sketch (düzlem yüzden)', ev('app.sketchSession.draft.plane.kind') == 'face' and near(ev('app.sketchSession.plane.o[2]'), 10))
    tb('circle'); page.wait_for_timeout(200)
    sk_click(25, 15); sk_click(30, 15); page.wait_for_timeout(200)
    check('daire çizildi', ev('app.sketcher.sk.ents.filter(e => e.type === "circle").length') == 1)
    page.click('#toolbar button[data-act="sk-finish"]'); idle()
    tb('extrude'); page.wait_for_selector('#panel [data-k="dist"]')
    check('yüz sketch\'i + gövde var: varsayılan Kes + ters çevir', ev('app.edit.draft.op') == 'cut' and ev('app.edit.draft.flip') is True)
    fill('dist', 4); ok()
    check('kesme: cep hacmi', near(vol(), 15000 - math.pi * 25 * 4, 5e-3), vol())
    shot('18_sketch_kes')
    # sketch düzenle (tarayıcıdan çift tık), iptal
    page.locator('#browser [data-sketch]').first.dblclick(); page.wait_for_function('app.sketchSession', timeout=8000); ev('app.sketcher.idle()')
    check('sketch düzenleme kipi', ev('app.sketchSession.idx') == 0 and ev('app.sketcher.active'))
    page.click('#toolbar button[data-act="sk-cancel"]'); idle()
    check('sketch iptali', ev('!app.sketchSession') and nbodies() == 1)

    # ---------------------------------------------------------------- G: kısıtlar (araç çubuğu düğmeleri)
    print('G: sketch kısıtları')
    ev('app.loadDoc({params: [], features: []})'); idle(); ev('app.viewport.view("iso", true)'); page.wait_for_timeout(300)
    tb('sketch'); page.wait_for_timeout(300)
    click_world([50, 55, 0]); page.wait_for_function('app.sketchSession', timeout=10000); ev('app.sketcher.idle()')
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
        page.click(f'#toolbar button[data-act="c-{btn}"]'); ev('app.sketcher.idle()'); page.wait_for_timeout(250); ev('app.sketcher.idle()')
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
    sel([Pt(ev('(id) => app.sketcher.sk.ents.find(e => e.id === id).a', C))]); page.click('#toolbar button[data-act="c-fix"]'); ev('app.sketcher.idle()'); page.wait_for_timeout(250)
    check('kısıt düğmesi: Sabitle', ev('(id) => !!app.sketcher.sk.points[id].fixed', ev('(id) => app.sketcher.sk.ents.find(e => e.id === id).a', C)))
    # yapı kipi düğmesi aktif görünür
    page.click('#toolbar button[data-act="c-construct"]'); page.wait_for_timeout(200)
    check('Yapı kipi düğmesi etkin görünür', 'active' in page.get_attribute('#toolbar button[data-act="c-construct"]', 'class'))
    page.click('#toolbar button[data-act="c-construct"]'); page.wait_for_timeout(100)
    # açı ölçüsü: iki çizgi seç, Ölçü aracı
    sel([E(A), E(D)]); page.click('#toolbar button[data-act="dim"]'); page.wait_for_selector('input.sk-input', timeout=5000)
    page.fill('input.sk-input', '25'); page.press('input.sk-input', 'Enter'); ev('app.sketcher.idle()'); page.wait_for_timeout(300)
    check('açı ölçüsü', cons('angle') == 1 and ev('app.sketcher.lastSolve.ok'), ev('JSON.stringify(app.sketcher.sk.cons.slice(-2))'))
    # nokta-çizgi ölçüsü
    sel([Pt(ev('(id) => app.sketcher.sk.ents.find(e => e.id === id).a', T1)), E(L1)]); page.click('#toolbar button[data-act="dim"]')
    try:
        page.wait_for_selector('input.sk-input', timeout=5000); page.fill('input.sk-input', '20'); page.press('input.sk-input', 'Enter'); ev('app.sketcher.idle()'); page.wait_for_timeout(300)
    except Exception as e: pass
    check('nokta-çizgi mesafe ölçüsü', cons('pldist') == 1, ev('JSON.stringify(app.sketcher.sk.cons.slice(-2))'))
    shot('19_kisitlar')
    check('kısıt listesi panelde (✕ düğmeli)', page.locator('#sk-cons .row').count() >= 8 and page.locator('#sk-cons .row button').count() >= 8)
    n0 = page.locator('#sk-cons .row').count(); page.locator('#sk-cons .row button').first.click(); page.wait_for_timeout(300)
    check('panelden kısıt silme', page.locator('#sk-cons .row').count() == n0 - 1)
    page.click('#sk-cancel'); idle()

    print('\nkonsol hataları:', [e for e in errs if 'GL Driver' not in e][:5])
    check('konsolda sayfa hatası yok', not [e for e in errs if e.startswith('pageerror')], str([e for e in errs if e.startswith('pageerror')][:3]))
    br.close()
finally:
    if server: server.terminate()
print(f'\n{passed} geçti, {failed} kaldı'); sys.exit(1 if failed else 0)
