# WP-19 arayüz testi: şeritteki "Form"/"Diğer" menülerinden sweep, loft, draft, kaburga, değişken yuvarlatma, diş, helis panelden
# uygulanır; geçmişte görünür; çift tıkla düzenlenir; geri alınır; belge kaydet/aç gidiş-dönüşü (JSON) parametreleri korur.
# Önce `npx vite build`; çalıştır: python3 test/modelleme2-ui.test.py
import json, math, os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
passed = failed = 0
def check(name, cond, detail=''):
    global passed, failed
    if cond: passed += 1; print('  ok   ', name)
    else: failed += 1; print('  FAIL ', name, detail)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _srv
PORT, server = _srv.start(ROOT, ['preview'])
def rel(a, b, tol): return a is not None and abs(a - b) <= tol * abs(b)

def sq(sid, w, z=0, plane='XY'):
    P = {f'{sid}p{i}': {'x': x, 'y': y} for i, (x, y) in enumerate([(-w / 2, -w / 2), (w / 2, -w / 2), (w / 2, w / 2), (-w / 2, w / 2)])}
    k = list(P.keys())
    return {'id': sid, 'type': 'sketch', 'name': sid, 'plane': {'kind': 'base', 'name': plane, 'offset': str(z)}, 'points': P, 'ents': [{'id': f'{sid}l{i}', 'type': 'line', 'a': k[i], 'b': k[(i + 1) % 4]} for i in range(4)], 'cons': []}
def circ(sid, r, plane='XY', z=0):
    return {'id': sid, 'type': 'sketch', 'name': sid, 'plane': {'kind': 'base', 'name': plane, 'offset': str(z)}, 'points': {'c': {'x': 0, 'y': 0}}, 'ents': [{'id': 'c1', 'type': 'circle', 'c': 'c', 'r': r}], 'cons': []}
def line_sk(sid, a, b, plane='XZ', z=0):
    return {'id': sid, 'type': 'sketch', 'name': sid, 'plane': {'kind': 'base', 'name': plane, 'offset': str(z)}, 'points': {'a': {'x': a[0], 'y': a[1]}, 'b': {'x': b[0], 'y': b[1]}}, 'ents': [{'id': 'l1', 'type': 'line', 'a': 'a', 'b': 'b'}], 'cons': []}
def box(bid, w, d, h, x=0, y=0, z=0, op='new'):
    return {'id': bid, 'type': 'primitive', 'kind': 'box', 'name': bid, 'x': str(x), 'y': str(y), 'z': str(z), 'w': str(w), 'd': str(d), 'h': str(h), 'op': op}

try:
  with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    ctx = br.new_context(viewport={'width': 1400, 'height': 860}, locale='tr-TR')
    ctx.add_init_script("try { localStorage.setItem('mihenk.lang', 'tr'); localStorage.setItem('mihenk.recoveryMs', '0'); localStorage.setItem('mihenk.welcome', 'off'); } catch (e) {}")
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    ev = page.evaluate
    page.goto(f'http://127.0.0.1:{PORT}/'); page.wait_for_function('() => (window.app)', timeout=30000); ev('app.ready')
    def idle(): ev('app.whenIdle()')
    def load(feats): ev('app.markDirty(false)'); ev('(d) => app.loadDoc(d, { reset: true })', {'params': [], 'features': feats}); idle()
    def vol(): return ev('app.result.bodies[0] ? app.result.bodies[0].volume : null')
    def dd(menu, cmd): page.click(f'#toolbar button[data-cmd="dd-{menu}"]'); page.click(f'#ddpop [data-cmd="{cmd}"]'); page.wait_for_selector('#panel:not(.hidden) #p-ok'); idle()
    def ok(): page.click('#p-ok'); idle()
    def fill(k, v): page.fill(f'#panel input[data-k="{k}"]', str(v)); idle()
    def select(k, v): page.select_option(f'#panel select[data-k="{k}"]', v); idle()
    def last(): return ev('app.doc.features[app.doc.features.length - 1]')
    def status(fid): return ev('(id) => app.result.status[id]', fid)
    def chip_count(): return ev('document.querySelectorAll("#timeline .chip").length')
    def edit_last(): ev('app.editFeature(app.doc.features.length - 1)'); page.wait_for_selector('#panel:not(.hidden) #p-ok'); idle()
    def undo(): ev('app.undo()'); idle()
    def pick(sel, bid, pred):
        # seçim alanını etkinleştir, koşulu tutan yüz/kenarları çekirdekten bul ve panelin seçim yoluyla ekle
        page.click(f'#panel [data-testid="sel-{sel}"]')
        kind = ev('(k) => app.edit.selKind(k)', sel)
        n = ev('([b, k]) => { const x = app.result.bodies.find((q) => q.id === b); return k === "face" ? x.nFaces : x.nEdges; }', [bid, kind])
        hits = []
        for i in range(n):
            d = ev('([b, i, k]) => app.describe({ body: b, idx: i }, k)', [bid, i, kind])
            if pred(d): hits.append(i)
        for i in hits: ev('([b, i, k]) => app.edit.onPick({ kind: k, body: b, idx: i })', [bid, i, kind]); idle()
        return len(hits)

    # ---- sweep
    print('sweep')
    load([circ('s1', 5), line_sk('s2', (0, 0), (0, 100))])
    n0 = chip_count(); dd('form', 'sweep')
    select('sketch', 's1'); select('path', 's2'); ok()
    f = last(); check('sweep geçmişe girdi', f['type'] == 'sweep' and status(f['id'])['ok'] and chip_count() >= n0, f)
    check('sweep hacmi π·25·100', rel(vol(), math.pi * 2500, 0.005), vol())
    edit_last(); select('orient', 'fixed'); ok(); check('sweep düzenlendi (sabit yön)', last()['orient'] == 'fixed' and status(last()['id'])['ok'])
    undo(); check('geri al düzenlemeyi kaldırır', last()['orient'] == 'path')

    # ---- loft
    print('loft')
    load([sq('a', 20), sq('b', 10, 30)])
    dd('form', 'loft'); ok()
    f = last(); check('loft geçmişe girdi', f['type'] == 'loft' and f['sections'] == ['a', 'b'] and status(f['id'])['ok'], [f, status(f['id'])])
    check('loft hacmi kesik piramit', rel(vol(), 10 * (400 + 100 + 200), 0.01), vol())
    edit_last(); page.click('#panel [data-testid="section-remove-1"]'); idle()
    check('tek kesitte açık hata', ev('!document.querySelector("#p-err").hidden') and 'kesit' in ev('document.querySelector("#p-err").textContent'), ev('document.querySelector("#p-err").textContent'))
    page.click('#panel [data-testid="section-add"]'); idle(); ok(); check('kesit yeniden eklendi', status(last()['id'])['ok'])

    # ---- draft
    print('draft')
    load([box('b', 20, 20, 20, -10, -10, 0)])
    dd('form', 'draft')
    k = pick('faces', 'b', lambda d: d['geom'] == 'PLANE' and abs(d['normal'][2]) < 1e-9)
    fill('angle', 5); ok()
    f = last(); check('draft 4 yüz, geçmişte', f['type'] == 'draft' and len(f['faces']) == 4 and status(f['id'])['ok'], [k, status(f['id'])])
    t5 = math.tan(math.radians(5)); exp = 20 / 3 * (400 + (20 - 40 * t5) ** 2 + 20 * (20 - 40 * t5))
    check('draft hacmi', rel(vol(), exp, 1e-4), [vol(), exp])

    # ---- kaburga
    print('rib')
    load([box('b', 100, 40, 10), box('w', 10, 40, 60, 0, 0, 0, 'join'), line_sk('rs', (10, 50), (90, 10), 'XZ', 20)])
    dd('form', 'rib'); fill('t', 5); ok()
    check('kaburga hacmi', rel(vol(), 40000 + 20000 + 8000, 1e-3), vol())

    # ---- değişken yuvarlatma
    print('vfillet')
    load([box('b', 50, 40, 30)])
    dd('form', 'vfillet'); page.click('#panel input[data-k="chain"]') if ev('document.querySelector("#panel input[data-k=chain]").checked') else None
    pick('edges', 'b', lambda d: d['geom'] == 'LINE' and abs(d['length'] - 50) < 1e-6 and d['start'][1] < 1e-9 and d['end'][1] < 1e-9 and d['start'][2] > 29)
    fill('r1', 2); fill('r2', 5); ok()
    check('değişken yuvarlatma', status(last()['id'])['ok'] and rel(60000 - vol(), 50 * (1 - math.pi / 4) * 13, 0.03), [status(last()['id']), vol()])
    edit_last(); fill('rm', 4); check('ara yarıçap girilince konum alanı açılır', ev('!!document.querySelector("#panel input[data-k=tm]")')); ok()
    check('ara noktalı yuvarlatma', status(last()['id'])['ok'] and last()['rm'] == '4')

    # ---- diş
    print('thread')
    load([{'id': 'cy', 'type': 'primitive', 'kind': 'cylinder', 'name': 'cy', 'x': '0', 'y': '0', 'z': '0', 'dia': '10', 'h': '12', 'axis': 'Z', 'op': 'new'}])
    v0 = vol(); dd('form', 'thread')
    pick('face', 'cy', lambda d: d['geom'] == 'CYLINDRE')
    check('diş ölçüsü varsayılan M10', ev('document.querySelector("#panel select[data-k=thread]").value') == 'M10')
    ok(); page.wait_for_function('() => app.result && app.result.status[app.doc.features[app.doc.features.length-1].id]', timeout=120000); idle()
    st = status(last()['id']); check('M10 dış diş', st['ok'] and vol() < v0 - 100, [st, vol(), v0])
    edit_last(); select('thread', 'M12'); idle()
    check('yanlış ölçüde Türkçe hata', 'çap' in ev('document.querySelector("#p-err").textContent'), ev('document.querySelector("#p-err").textContent'))
    page.click('#p-cancel'); idle()

    # ---- helis
    print('coil')
    load([])
    dd('form', 'coil'); fill('turns', 3); ok()
    hl = 3 * math.hypot(math.pi * 20, 5)
    check('helis yayı hacmi', status(last()['id'])['ok'] and rel(vol(), math.pi * hl, 0.01), vol())

    # ---- kaydet/aç gidiş-dönüşü (belge JSON'u)
    txt = ev('JSON.stringify({ app: "Mihenk", version: 1, doc: app.doc })')
    load([]); ev('(t) => app.loadDoc(JSON.parse(t).doc, { reset: true })', txt); idle()
    check('aç sonrası helis parametreleri ve hacim', last()['turns'] == '3' and rel(vol(), math.pi * hl, 0.01))

    check('sayfa hatası yok', not errs, errs[:3])
    br.close()
finally:
    _srv.stop(server)
print(f'\n{passed} geçti, {failed} kaldı'); sys.exit(1 if failed else 0)
