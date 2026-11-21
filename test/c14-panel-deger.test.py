# C-14 yeniden üretme: panelde GÖRÜNEN sayısal değer = UYGULANAN parametre (tek kaynak).
# Senaryo: eskiz + Extrude 18 uygula; ikinci Extrude aç; Mesafe alanındaki görünen değeri oku; DEĞİŞTİRMEDEN onayla.
# Önce `npx vite build`; çalıştır: python3 test/c14-panel-deger.test.py
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _srv
passed = failed = 0
def check(name, cond, detail=''):
    global passed, failed
    if cond: passed += 1; print('  ok   ', name)
    else: failed += 1; print('  FAIL ', name, detail)
PORT, server = _srv.start(ROOT, ['preview'])
def rect(sid, w, h, ox=0, oy=0):
    P = {f'{sid}p{i}': {'x': x, 'y': y} for i, (x, y) in enumerate([(ox, oy), (ox + w, oy), (ox + w, oy + h), (ox, oy + h)], 1)}
    return {'id': sid, 'type': 'sketch', 'name': sid, 'plane': {'kind': 'base', 'name': 'XY', 'offset': '0'}, 'points': P,
            'ents': [{'id': f'{sid}l{i}', 'type': 'line', 'a': f'{sid}p{i}', 'b': f'{sid}p{i % 4 + 1}'} for i in range(1, 5)], 'cons': []}
try:
  with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    ctx = br.new_context(viewport={'width': 1400, 'height': 860}, locale='tr-TR')
    ctx.add_init_script("try { localStorage.setItem('mihenk.lang', 'tr'); localStorage.setItem('mihenk.recoveryMs', '0'); localStorage.setItem('mihenk.welcome', 'off'); } catch (e) {}")
    page = ctx.new_page(); errs = []; page.on('pageerror', lambda e: errs.append(str(e))); ev = page.evaluate
    page.goto(f'http://127.0.0.1:{PORT}/'); page.wait_for_function('() => (window.app)', timeout=30000); ev('app.ready')
    def idle(): ev('app.whenIdle()')
    def tb(a): page.click(f'#toolbar button[data-cmd="{a}"]'); page.wait_for_selector('#panel:not(.hidden) #p-ok'); idle()
    def shown(k): return page.input_value(f'#panel input[data-k="{k}"]')
    def feats(t): return ev('(t) => app.doc.features.filter((f) => f.type === t).map((f) => f.dist)', t)
    def vol(i=0): return ev(f'app.result.bodies[{i}] ? app.result.bodies[{i}].volume : null')
    for variant in ('ayni-eskiz-tamam', 'farkli-eskiz-tamam', 'ayni-eskiz-enter', 'klavye-yazim', 'iptal-sonrasi', 'duzenle-sonrasi', 'olaysiz-deger'):
        print('senaryo:', variant)
        ev('app.markDirty(false)'); ev('(d) => app.loadDoc(d, { reset: true })', {'params': [], 'features': [rect('s1', 40, 30), rect('s2', 20, 20, 100, 0)]}); idle()
        tb('extrude')
        if variant == 'klavye-yazim':
            page.click('#panel input[data-k="dist"]'); page.keyboard.press('Control+A'); page.keyboard.type('18'); page.keyboard.press('Tab'); idle()
        else: page.fill('#panel input[data-k="dist"]', '18'); idle()
        page.click('#p-ok'); idle()
        check(f'[{variant}] ilk extrude 18 uygulandı', feats('extrude') == ['18'], str(feats('extrude')))
        if variant == 'iptal-sonrasi':
            tb('extrude'); page.fill('#panel input[data-k="dist"]', '25'); idle(); page.click('#p-cancel'); idle()
        if variant == 'duzenle-sonrasi':
            ev('app.editFeature(app.doc.features.length - 1)'); page.wait_for_selector('#panel:not(.hidden) #p-ok'); idle(); page.click('#p-ok'); idle()
        tb('extrude')
        if variant == 'farkli-eskiz-tamam': page.select_option('#panel select[data-k="sketch"]', 's2'); idle()
        if variant == 'olaysiz-deger':
            # alanın değeri input/change olayı OLMADAN değişir (tarayıcı geri yükleme/otomatik doldurma/betik): görünen değer yine de uygulanmalı
            ev('document.querySelector(\'#panel input[data-k="dist"]\').value = "18"')
        g = shown('dist'); d = ev('app.edit.draft.dist')
        if variant != 'olaysiz-deger': check(f'[{variant}] görünen Mesafe = taslak parametre', float(g.replace(',', '.')) == float(d), f'görünen={g} taslak={d}')
        if variant == 'ayni-eskiz-enter': page.focus('#panel input[data-k="dist"]'); page.keyboard.press('Enter')
        else: page.click('#p-ok')
        idle()
        fs = feats('extrude'); applied = fs[-1] if fs else None
        check(f'[{variant}] uygulanan mesafe (belge) = görünen {g}', applied is not None and float(applied) == float(g.replace(',', '.')), f'belge={fs}')
    check('sayfa hatası yok', not errs, str(errs[:3]))
    br.close()
finally:
    _srv.stop(server)
print(f'\n{passed} geçti, {failed} kaldı'); sys.exit(1 if failed else 0)
