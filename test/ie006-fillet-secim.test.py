# İE-006 C-47 (C-35 ile aynı kök): Fillet/Pah panelinde değer alanına yazmak ya da odaklanmak "Edges" seçim alanını kapatmamalı;
# görünümdeki GERÇEK fare tıklaması kenarı seçmeli ve işlem uygulanmalı.
# Önce `npx vite build`; çalıştır: python3 test/ie006-fillet-secim.test.py
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
BOX = {'id': 'b1', 'type': 'primitive', 'kind': 'box', 'name': 'b1', 'x': '-20', 'y': '-15', 'z': '0', 'w': '40', 'd': '30', 'h': '20', 'op': 'new'}
SCAN = '''() => { const vp = app.viewport; const r = vp.renderer.domElement.getBoundingClientRect();
  for (let y = r.top + 5; y < r.bottom - 5; y += 3) for (let x = r.left + 5; x < r.right - 5; x += 3) { const h = vp.pickAt({ clientX: x, clientY: y }); if (h && h.kind === 'edge') return [x, y]; }
  return null; }'''
try:
  with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    ctx = br.new_context(viewport={'width': 1400, 'height': 860}, locale='tr-TR')
    ctx.add_init_script("try { localStorage.setItem('mihenk.lang', 'tr'); localStorage.setItem('mihenk.recoveryMs', '0'); localStorage.setItem('mihenk.welcome', 'off'); } catch (e) {}")
    page = ctx.new_page(); errs = []; page.on('pageerror', lambda e: errs.append(str(e))); ev = page.evaluate
    page.goto(f'http://127.0.0.1:{PORT}/'); page.wait_for_function('() => (window.app)', timeout=30000); ev('app.ready')
    def idle(): ev('app.whenIdle()')
    def vol(): return ev('app.result.bodies[0] ? app.result.bodies[0].volume : null')
    for tool, key, val, mode in (('fillet', 'r', '3', 'yazim'), ('fillet', 'r', '3', 'odak'), ('chamfer', 'd', '2', 'yazim'), ('chamfer', 'd', '2', 'odak')):
        tag = f'[{tool}/{mode}]'; print('senaryo:', tool, mode)
        ev('app.markDirty(false)'); ev('(d) => app.loadDoc(d, { reset: true })', {'params': [], 'features': [BOX]}); idle()
        v0 = vol()
        page.click(f'#toolbar button[data-cmd="{tool}"]'); page.wait_for_selector('#panel:not(.hidden) #p-ok'); idle()
        check(f'{tag} açılışta Edges alanı etkin', ev('app.edit.activeSel') == 'edges')
        pt = ev(SCAN); check(f'{tag} görünümde tıklanabilir kenar bulundu', pt is not None)
        if pt is None: continue
        if mode == 'yazim': page.fill(f'#panel input[data-k="{key}"]', val)
        else: page.click(f'#panel input[data-k="{key}"]')
        idle()
        check(f'{tag} değer alanı sonrası Edges hâlâ etkin', ev('app.edit.activeSel') == 'edges', ev('app.edit.activeSel'))
        page.mouse.click(pt[0], pt[1]); idle()
        n = ev('app.edit.draft.edges.length')
        check(f'{tag} gerçek tıklama kenarı seçti', n >= 1, f'seçili={n}')
        if mode == 'odak': page.fill(f'#panel input[data-k="{key}"]', val); idle()
        check(f'{tag} yazılan değer korundu', page.input_value(f'#panel input[data-k="{key}"]') == val and ev('(k) => app.edit.draft[k]', key) == val)
        page.click('#p-ok'); idle()
        f = ev('app.doc.features[app.doc.features.length - 1]')
        check(f'{tag} işlem belgeye uygulandı', f['type'] == tool and len(f['edges']) >= 1 and ev('(id) => app.result.status[id].ok', f['id']), f)
        v1 = vol(); check(f'{tag} hacim azaldı', v1 is not None and v0 is not None and v1 < v0, f'{v0} -> {v1}')
    check('sayfa hatası yok', not errs, str(errs[:3]))
    br.close()
finally:
    _srv.stop(server)
print(f'\n{passed} geçti, {failed} kaldı'); sys.exit(1 if failed else 0)
