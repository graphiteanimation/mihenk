# İE-007 arayüz testi: yapı düzlemi araç çubuğundan oluşturulur (açıyla, üç noktadan), üzerine eskiz çizilip extrude edilir,
# açı düzenlenince gövde güncellenir, belge kaydet/aç gidiş-dönüşünde düzlem ve eskiz durur, düzlem görünümde tıklanarak eskiz düzlemi seçilir.
# Önce `npx vite build`; çalıştır: python3 test/yapi-duzlemi-ui.test.py
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
def near(a, b, tol=1e-3): return a is not None and len(a) == len(b) and all(abs(x - y) <= tol for x, y in zip(a, b))

def rect(sid, plane, x0, y0, x1, y1):
    P = {f'{sid}p{i}': {'x': x, 'y': y} for i, (x, y) in enumerate([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])}
    k = list(P.keys())
    return {'id': sid, 'type': 'sketch', 'name': sid, 'plane': plane, 'points': P, 'ents': [{'id': f'{sid}l{i}', 'type': 'line', 'a': k[i], 'b': k[(i + 1) % 4]} for i in range(4)], 'cons': []}
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
    def body(): return ev('app.result.bodies[0] ? { v: app.result.bodies[0].volume, bb: app.result.bodies[0].bbox } : null')
    def ok(): page.click('#p-ok'); idle()
    def fill(k, v): page.fill(f'#panel input[data-k="{k}"]', str(v)); idle()
    def select(k, v): page.select_option(f'#panel select[data-k="{k}"]', v); idle()
    def feat(fid): return ev('(id) => app.doc.features.find((f) => f.id === id) || null', fid)
    def status(fid): return ev('(id) => app.result.status[id]', fid)
    def plane_of(fid): return ev('(id) => (app.result.planes && app.result.planes[id]) ? app.result.planes[id].plane : null', fid)
    def tool(cmd):
        if cmd == 'cplane': page.click('#toolbar button[data-cmd="dd-form"]'); page.click('#ddpop [data-cmd="cplane"]')
        else: page.click(f'#toolbar button[data-cmd="{cmd}"]')
        page.wait_for_selector('#panel:not(.hidden) #p-ok'); idle()
    def add_feats(feats): ev('async (fs) => { await app.commit((d) => { for (const f of fs) d.features.push(f); }); }', feats); idle()

    # ---- araç ve panel
    print('araç ve panel')
    load([])
    page.click('#toolbar button[data-cmd="dd-form"]')
    check('Oluştur grubunda (Form menüsünde) "Yapı düzlemi" aracı var', ev('!!document.querySelector("#ddpop [data-cmd=cplane]")'))
    page.click('#toolbar button[data-cmd="dd-form"]')
    tool('cplane')
    check('panel başlığı Yapı düzlemi', 'Yapı düzlemi' in ev('document.querySelector("#panel h3").textContent'), ev('document.querySelector("#panel h3").textContent'))
    check('kip seçenekleri Açıyla / Üç noktadan / Ofset', ev('[...document.querySelectorAll("#panel select[data-k=mode] option")].map((o) => o.textContent)') == ['Açıyla düzlem', 'Üç noktadan düzlem', 'Ofset düzlem'])
    check('varsayılan: açıyla, taban XY', ev('app.edit.draft.mode') == 'angle' and ev('app.edit.draft.base.name') == 'XY')
    for k in ('base', 'axis', 'angle'):
        check(f'açıyla kipinde "{k}" alanı var', ev('(k) => !!document.querySelector(`#panel [data-k="${k}"]`)', k))
    select('axis', 'Y'); fill('angle', 45)
    d = ev('app.edit.draft')
    check('taslak: eksen Y, açı 45', d['axis'] == {'kind': 'axis', 'name': 'Y'} and d['angle'] == '45', d)
    select('mode', 'offset')
    d = ev('app.edit.draft')
    check('ofset kipine geçince yalnız ofset alanları kalır', d['mode'] == 'offset' and 'axis' not in d and 'angle' not in d and 'offset' in d and ev('!!document.querySelector("#panel input[data-k=offset]")'), d)
    select('mode', 'angle'); select('axis', 'Y'); fill('angle', 45)
    ok()
    f = ev('app.doc.features[0]'); pid = f['id']
    check('düzlem özelliği geçmişe girdi (plane)', f['type'] == 'plane' and f['mode'] == 'angle' and f['axis'] == {'kind': 'axis', 'name': 'Y'} and f['angle'] == '45' and f['base'] == {'kind': 'base', 'name': 'XY', 'offset': '0'}, f)
    check('çekirdek düzlemi hesapladı', status(pid) and status(pid)['ok'], status(pid))
    pl = plane_of(pid)
    s2 = math.sqrt(0.5)
    check('düzlem: x = Y ekseni, n = (sin45, 0, cos45)', pl and near(pl['x'], [0, 1, 0]) and near(pl['n'], [s2, 0, s2]) and near(pl['o'], [0, 0, 0]), pl)
    check('geçmiş özeti açıyı gösterir', '45°' in ev('document.querySelector("#timeline .chip .sum, #timeline .chip").textContent') or '45°' in ev('document.body.innerText'))
    check('görünümde yapı düzlemi çizildi', ev('app.viewport.cplaneGroup.children.length') == 1)
    ev('app.togglePlanes()')
    check('"düzlemler" düğmesi yapı düzlemini gizler', ev('app.viewport.cplaneGroup.visible') is False)
    ev('app.togglePlanes()')
    check('"düzlemler" düğmesi yapı düzlemini geri getirir', ev('app.viewport.cplaneGroup.visible') is True)

    # ---- düzlemde eskiz -> extrude -> hacim
    print('eskiz ve extrude')
    add_feats([rect('sk1', {'kind': 'plane', 'id': pid}, -15, 0, 15, 20)])
    check('düzlem üzerindeki eskiz hesaplandı', status('sk1') and status('sk1')['ok'], status('sk1'))
    tool('extrude'); ok()
    ext = ev('app.doc.features[app.doc.features.length - 1]')
    check('extrude eklendi', ext['type'] == 'extrude' and ext['sketch'] == 'sk1', ext)
    b = body()
    check('gövde hacmi 30×20×10', b and rel(b['v'], 6000, 1e-3), b)
    def bb_expect(deg):
        c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
        # X = -v·cos + w·sin ; Y = u ; Z = v·sin + w·cos ; u∈[-15,15], v∈[0,20], w∈[0,10]
        xs = [-v * c + w * s for v in (0, 20) for w in (0, 10)]; zs = [v * s + w * c for v in (0, 20) for w in (0, 10)]
        return [min(xs), -15, min(zs)], [max(xs), 15, max(zs)]
    lo, hi = bb_expect(45)
    check('sınır kutusu 45° için beklenen', b and near(b['bb'][0], lo, 0.05) and near(b['bb'][1], hi, 0.05), [b['bb'], lo, hi])

    # ---- açı düzenle
    print('açı düzenleme')
    ev('(id) => app.editFeature(app.doc.features.findIndex((f) => f.id === id))', pid); page.wait_for_selector('#panel:not(.hidden) #p-ok'); idle()
    fill('angle', 30); ok()
    check('açı 30 olarak kaydedildi', feat(pid)['angle'] == '30')
    b2 = body(); lo, hi = bb_expect(30)
    check('gövde sınır kutusu değişti (30°)', b2 and near(b2['bb'][0], lo, 0.05) and near(b2['bb'][1], hi, 0.05) and not near(b2['bb'][1], b['bb'][1], 0.5), [b2['bb'], lo, hi])
    check('hacim değişmedi', rel(b2['v'], 6000, 1e-3), b2)

    # ---- üç noktadan düzlem
    print('üç noktadan düzlem')
    load([box('bx', 50, 40, 30)])
    bb = body()['bb']; A = bb[0]; Bp = [bb[1][0], bb[0][1], bb[0][2]]; C = [bb[0][0], bb[1][1], bb[1][2]]
    tool('cplane'); select('mode', 'three')
    check('üç nokta kipinde üç seçim alanı', ev('document.querySelectorAll("#panel .selbox[data-k^=pt]").length') == 3)
    nE = ev('app.result.bodies[0].nEdges')
    def edge_with(p, q):
        for i in range(nE):
            d = ev('(i) => app.describe({ body: "bx", idx: i }, "edge")', i)
            s, e = d.get('start'), d.get('end')
            if s and e and ((near(s, p) and near(e, q)) or (near(s, q) and near(e, p))): return i, d
        return None, None
    # A ve B: alt ön kenarın uçları; C: üst sol kenarın arka ucu
    Ctop_front = [bb[0][0], bb[0][1], bb[1][2]]
    iAB, dAB = edge_with(A, Bp); iC, dC = edge_with(Ctop_front, C)
    check('kutunun kenarları bulundu', iAB is not None and iC is not None, [iAB, iC])
    def lerp(p, q, t): return [p[k] + (q[k] - p[k]) * t for k in range(3)]
    ev('async ([i, pt]) => { await app.edit.onPick({ kind: "edge", body: "bx", idx: i, point: pt }); }', [iAB, lerp(A, Bp, 0.1)]); idle()
    ev('async ([i, pt]) => { await app.edit.onPick({ kind: "edge", body: "bx", idx: i, point: pt }); }', [iAB, lerp(A, Bp, 0.9)]); idle()
    ev('async ([i, pt]) => { await app.edit.onPick({ kind: "edge", body: "bx", idx: i, point: pt }); }', [iC, lerp(Ctop_front, C, 0.85)]); idle()
    pts = ev('app.edit.draft.points')
    check('üç nokta kaydedildi ({kind:vertex, edge, hint})', len(pts) == 3 and all(q['kind'] == 'vertex' and 'edge' in q and len(q['hint']) == 3 for q in pts), pts)
    check('tıklamaya en yakın uçlar: A, B, C', len(pts) == 3 and near(pts[0]['hint'], A) and near(pts[1]['hint'], Bp) and near(pts[2]['hint'], C), [q['hint'] for q in pts])
    check('seçilen noktalar görünümde işaretli', ev('app.viewport.markGroup.children.length') == 1 and ev('app.viewport.markGroup.children[0].geometry.getAttribute("position").count') == 3)
    ok()
    f3 = ev('app.doc.features[app.doc.features.length - 1]'); p3 = f3['id']
    check('üç nokta düzlemi kaydedildi', f3['type'] == 'plane' and f3['mode'] == 'three' and len(f3['points']) == 3 and 'angle' not in f3, f3)
    check('çekirdek üç nokta düzlemini hesapladı', status(p3) and status(p3)['ok'], status(p3))
    pl3 = plane_of(p3)
    ey = (C[1] - A[1], C[2] - A[2]); nrm = math.hypot(*ey)
    check('düzlem: o = A, x = +X, n = (0, -0.6, 0.8)', pl3 and near(pl3['o'], A) and near(pl3['x'], [1, 0, 0]) and near(pl3['n'], [0, -ey[1] / nrm, ey[0] / nrm]), pl3)
    check('geçmiş özeti "üç nokta"', 'üç nokta' in ev('document.querySelector("#timeline").textContent') or 'üç nokta' in ev('document.body.innerText'))

    # ---- kaydet / aç
    print('kaydet ve aç')
    load([])
    tool('cplane'); select('axis', 'Y'); fill('angle', 45); ok()
    pid = ev('app.doc.features[0].id')
    add_feats([rect('sk1', {'kind': 'plane', 'id': pid}, -15, 0, 15, 20)])
    tool('extrude'); ok()
    v0 = body()['v']; doc0 = ev('JSON.parse(JSON.stringify(app.doc))')
    raw = json.loads(ev('new TextDecoder().decode(app.fileBytes())'))
    check('kaydedilen belgede plane özelliği ve düzlemdeki eskiz var', any(f['type'] == 'plane' for f in raw['doc']['features']) and any(f.get('plane', {}).get('kind') == 'plane' for f in raw['doc']['features'] if f['type'] == 'sketch'))
    check('düzlemli belge sürümü >= 2', raw['version'] >= 2, raw['version'])
    load([])
    check('boş belgede düzlem yok', ev('app.doc.features.length') == 0)
    ev('async (t) => { await app.openBytes(new TextEncoder().encode(t), "yd.mhnk", null); }', json.dumps(raw)); idle()
    check('açınca düzlem, eskiz ve extrude duruyor', [f['type'] for f in ev('app.doc.features')] == ['plane', 'sketch', 'extrude'], ev('app.doc.features.map((f) => f.type)'))
    check('açınca düzlem hesaplandı ve çiziliyor', plane_of(pid) is not None and ev('app.viewport.cplaneGroup.children.length') == 1)
    check('açınca gövde hacmi aynı', rel(body()['v'], v0, 1e-6), [body(), v0])
    d1 = json.loads(ev('JSON.stringify(app.doc)'))  # açılış eskize sabit 'O' noktasını ekler (eski davranış); onun dışında belge aynı olmalı
    for f in d1['features']:
        if f['type'] == 'sketch' and 'O' not in doc0['features'][d1['features'].index(f)].get('points', {}): f['points'].pop('O', None)
    check('açınca belge aynı (düzlem özelliği ve eskiz düzlemi dahil)', d1 == doc0)

    # ---- görünümde düzleme tıklayarak eskiz
    print('düzlemde eskiz seçimi')
    load([{'id': 'plane1', 'type': 'plane', 'name': 'Düzlem A', 'mode': 'angle', 'base': {'kind': 'base', 'name': 'XY', 'offset': '0'}, 'axis': {'kind': 'axis', 'name': 'Y'}, 'angle': '45', 'flip': False}])
    ev('app.viewport.view("iso", true)'); idle()
    page.click('#toolbar button[data-cmd="sketch"]'); idle()
    check('eskiz aracı düzlem seçimi bekliyor', ev('app.tool') == 'newsketch' and ev('app.viewport.pickPlanes') is True)
    # düzlemin 3B bir noktasını ekrana yansıtıp tıkla
    pl = plane_of('plane1')
    wp = [pl['o'][k] + pl['x'][k] * 8 + pl['y'][k] * 12 for k in range(3)]
    sx, sy = ev('(w) => { const r = app.viewport.renderer.domElement.getBoundingClientRect(); const p = app.viewport.project(w); return [r.left + p[0], r.top + p[1]]; }', wp)
    page.mouse.click(sx, sy); idle()
    page.wait_for_function('() => !!app.sketchSession', timeout=15000)
    sp = ev('app.sketchSession.draft.plane')
    check('yeni eskiz yapı düzlemi üzerinde', sp == {'kind': 'plane', 'id': 'plane1'}, sp)
    check('eskiz paneli düzlemin adını gösterir', 'Düzlem A' in ev('document.querySelector("#panel .sk-body .note").textContent'), ev('document.querySelector("#panel .sk-body .note").textContent'))
    ev('app.cancelSketch()'); idle()

    # ---- ayna panelinde yapı düzlemi seçeneği
    print('ayna ve yapı düzlemi')
    load([box('bx', 20, 20, 20, 30, 0, 0), {'id': 'plane1', 'type': 'plane', 'name': 'Düzlem A', 'mode': 'offset', 'base': {'kind': 'base', 'name': 'YZ', 'offset': '0'}, 'offset': '0', 'flip': False}])
    tool('mirror')
    check('ayna düzlemi seçeneklerinde yapı düzlemi var', 'plane' in ev('[...document.querySelectorAll("#panel select[data-k=plane] option")].map((o) => o.value)'))
    select('plane', 'plane')
    check('yapı düzlemi listesi açıldı', ev('!!document.querySelector("#panel select[data-k=planeId]")') and ev('app.edit.draft.planeId') == 'plane1', ev('app.edit.draft'))
    ok()
    m = ev('app.doc.features[app.doc.features.length - 1]')
    check('ayna yapı düzlemini kullanıyor', m['type'] == 'mirror' and m['plane'] == 'plane' and m['planeId'] == 'plane1', m)

    check('sayfa hatası yok', not errs, errs[:3])
    br.close()
finally:
    _srv.stop(server)
print(f'\n{passed} geçti, {failed} kaldı'); sys.exit(1 if failed else 0)
