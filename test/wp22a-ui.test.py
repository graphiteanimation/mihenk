# WP-22a ekran testi: eskiz altlığı (PNG + vektör PDF) ekle, iki noktayla ölçekle, oturt, özellikler/kilit, geri al, kaydet/aç; bozuk PDF.
# Önce `npx vite build`; çalıştır: python3 test/wp22a-ui.test.py
# Sunucu, ana sürecin (electron/main.cjs) yaptığı gibi CSP başlığını DOSYA BAŞINA verir: çekirdek işçi (worker-*.js) WORKER_CSP, diğerleri CSP.
# Böylece pdf.js işçisinin 'unsafe-eval' OLMADAN çalıştığı gerçek ilkeyle doğrulanır.
import base64, http.server, json, math, os, socketserver, subprocess, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
SHOTS = os.path.join(ROOT, 'test', 'shots'); os.makedirs(SHOTS, exist_ok=True)
passed = failed = 0
def check(name, cond, detail=''):
    global passed, failed
    if cond: passed += 1; print('  ok   ', name)
    else: failed += 1; print('  FAIL ', name, detail)

csp = json.loads(subprocess.check_output(['node', '-e', "const c=require('./electron/csp.cjs');console.log(JSON.stringify({CSP:c.CSP,W:c.WORKER_CSP,re:c.isWorkerScript.toString()}))"], cwd=ROOT))
import re
def is_worker(rel): return re.match(r'^/assets/worker-[\w-]+\.js$', rel) is not None
seen_hdr = {}
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=DIST, **k)
    def end_headers(self):
        rel = self.path.split('?')[0]
        c = csp['W'] if is_worker(rel) else csp['CSP']
        seen_hdr[rel] = c
        self.send_header('Content-Security-Policy', c); self.send_header('X-Content-Type-Options', 'nosniff'); self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def log_message(self, *a): pass
class S(socketserver.ThreadingTCPServer): allow_reuse_address = True; daemon_threads = True
srv = S(('127.0.0.1', 0), H); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

def mk_pdf(pages):
    objs = []
    def add(s): objs.append(s); return len(objs)
    add('<< /Type /Catalog /Pages 2 0 R >>'); add('<< /Type /Pages /Kids [%s] /Count %d >>' % (' '.join('%d 0 R' % (4 + i * 2) for i in range(len(pages))), len(pages))); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    for i, (w, h) in enumerate(pages):
        c = '4 w 20 20 %d %d re S 0 0 m %d %d l S BT /F1 24 Tf 60 60 Td (Sayfa %d) Tj ET' % (w - 40, h - 40, w, h, i + 1)
        add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] /Contents %d 0 R /Resources << /Font << /F1 3 0 R >> >> >>' % (w, h, 5 + i * 2)); add('<< /Length %d >>\nstream\n%s\nendstream' % (len(c), c))
    out = '%PDF-1.4\n'; off = []
    for i, o in enumerate(objs): off.append(len(out)); out += '%d 0 obj\n%s\nendobj\n' % (i + 1, o)
    x = len(out); out += 'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + ''.join('%010d 00000 n \n' % o for o in off) + 'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, x)
    return out.encode('latin1')

try:
  with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    ctx = br.new_context(viewport={'width': 1760, 'height': 900}, accept_downloads=True, locale='tr-TR')
    ctx.add_init_script("try { localStorage.setItem('mihenk.lang', 'tr'); localStorage.setItem('mihenk.recoveryMs', '0'); localStorage.setItem('mihenk.welcome', 'off'); } catch (e) {}")
    ctx.add_init_script("window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI + ' @' + e.sourceFile));")
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)[:300]))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('response', lambda r: errs.append('HTTP %d %s' % (r.status, r.url)) if r.status >= 400 and 'favicon' not in r.url else None)
    ev = page.evaluate
    def idle(): ev('app.whenIdle()')
    def sidle(): ev('app.sketcher.idle()'); page.wait_for_timeout(80); ev('app.sketcher.idle()')
    def shot(n): page.screenshot(path=os.path.join(SHOTS, n + '.png'))
    def sk_px(u, v): return ev('([u, v]) => { const V = app.sketcher.plane; const w = [V.o[0] + V.x[0]*u + V.y[0]*v, V.o[1] + V.x[1]*u + V.y[1]*v, V.o[2] + V.x[2]*u + V.y[2]*v]; const [x, y] = app.viewport.project(w); const r = app.viewport.renderer.domElement.getBoundingClientRect(); return [r.left + x, r.top + y]; }', [u, v])
    def sk_click(u, v):
        x, y = sk_px(u, v); page.mouse.move(x, y); page.wait_for_timeout(60); page.mouse.click(x, y); sidle()
    def UL(): return ev('app.sketcher.underlay ? JSON.parse(JSON.stringify({...app.sketcher.underlay, data: app.sketcher.underlay.data.length})) : null')
    def px2sk(u, x, y):  # piksel (sol-üst, y aşağı) -> eskiz mm
        X = x * u['mmPerPx']; Y = (u['hPx'] - y) * u['mmPerPx']; a = math.radians(u['angle']); c, s = math.cos(a), math.sin(a)
        return [u['origin'][0] + X * c - Y * s, u['origin'][1] + X * s + Y * c]
    def toast_text(): return ev('document.querySelector("#toast").classList.contains("hidden") ? "" : document.querySelector("#toast").textContent')
    def dd_cmd(cmd):
        page.click('#toolbar button[data-cmd="dd-ul"]'); page.click(f'#ddpop [data-cmd="{cmd}"]'); sidle()
    def stub_file(name, b64): ev('([n, b]) => { app.pickFile = async () => ({ name: n, path: null, data: Uint8Array.from(atob(b), (c) => c.charCodeAt(0)) }); }', [name, b64])

    page.goto(f'http://127.0.0.1:{PORT}/'); page.wait_for_function('() => (window.app)', timeout=30000); ev('app.ready')
    doc = {'params': [], 'features': [{'id': 's1', 'type': 'sketch', 'name': 'Sketch 1', 'plane': {'kind': 'base', 'name': 'XY', 'offset': '0'}, 'points': {'O': {'x': 0, 'y': 0, 'fixed': True}}, 'ents': [], 'cons': []}]}
    ev('(d) => app.loadDoc(d)', doc); idle()
    ev('app.editSketch(0)'); page.wait_for_function('() => (app.sketchSession && app.sketcher.active)', timeout=15000); sidle()
    check('eskiz açıldı; Altlık grubu şeritte', page.locator('#toolbar button[data-cmd="dd-ul"]').count() == 1)
    page.click('#toolbar button[data-cmd="dd-ul"]'); page.click('#ddpop [data-cmd="sk-ul-scale"]'); page.wait_for_timeout(200)
    check('altlık yokken Ölçekle çalışmaz, neden bildirilir', ev('app.sketcher.tool') == 'select' and 'altlık yok' in toast_text(), toast_text())

    # ---------------------------------------------------------------- A. PNG altlık ekle
    print('A: PNG altlık')
    png_b64 = ev("""async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,400,200); x.strokeStyle = '#d00'; x.lineWidth = 6; x.strokeRect(50, 50, 300, 100);
      const b = await new Promise((r) => c.toBlob(r, 'image/png')); const a = new Uint8Array(await b.arrayBuffer()); let s = ''; a.forEach((v) => s += String.fromCharCode(v)); return btoa(s); }""")
    stub_file('plan.png', png_b64)
    dd_cmd('sk-ul-add'); page.wait_for_function('() => app.sketcher.underlay', timeout=10000); page.wait_for_function('() => app.sketcher._ulMesh', timeout=10000); sidle()
    u = UL(); check('altlık eklendi: 400x200 px, yarı saydam, görünür, kilitsiz', u and u['wPx'] == 400 and u['hPx'] == 200 and u['opacity'] == 0.5 and u['visible'] and not u['locked'], str(u))
    check('altlık eskiz düzleminde doku olarak çizildi (yarı saydam)', ev('(() => { const m = app.sketcher._ulMesh; return !!m && m.material.transparent && Math.abs(m.material.opacity - 0.5) < 1e-9 && m.material.map && m.renderOrder < 0; })()'))
    page.wait_for_timeout(300); shot('wp22a-1-altlik')
    with_ul = page.screenshot()
    ev('app.sketcher.underlayProps({ visible: false })'); sidle(); page.wait_for_timeout(300); hidden = page.screenshot()
    check('gizlenince ekran değişir (altlık gerçekten çiziliyor)', with_ul != hidden)
    ev('app.sketcher.undo()'); sidle(); page.wait_for_timeout(200)
    check('geri al: görünürlük tek adımda geri geldi', UL()['visible'] is True)
    check('bu adım altlık eklemeden sonraki ilk adım; ekleme de tek geri al adımı', ev('app.sketcher._undo.length') == 1)

    # ---------------------------------------------------------------- B. iki noktayla ölçekle
    print('B: iki noktayla ölçekle')
    u = UL(); A_px, B_px = (50, 150), (350, 150)   # dikdörtgenin alt kenarı: 300 px
    A = px2sk(u, *A_px); B = px2sk(u, *B_px)
    dd_cmd('sk-ul-scale'); check('Ölçekle aracı seçildi', ev('app.sketcher.tool') == 'ulscale')
    sk_click(*A); sk_click(*B)
    page.wait_for_selector('.sk-input', timeout=5000); page.fill('.sk-input', '120'); page.keyboard.press('Enter'); sidle(); page.wait_for_timeout(200)
    u2 = UL(); d = math.dist(px2sk(u2, *A_px), px2sk(u2, *B_px))
    check('ölçek: iki nokta arası gerçek 120 mm', abs(d - 120) < 0.05, str(d))
    check('A noktası yerinde kaldı', math.dist(px2sk(u2, *A_px), A) < 0.05)
    check('ölçek mm/px = 120/300', abs(u2['mmPerPx'] - 0.4) < 1e-6, str(u2['mmPerPx']))
    ev('app.sketcher.undo()'); sidle()
    check('geri al: ölçek tek adımda eski değere döndü', abs(UL()['mmPerPx'] - 1) < 1e-9, str(UL()['mmPerPx']))
    ev('app.sketcher.redo()'); sidle(); check('yinele: ölçek yine 0.4', abs(UL()['mmPerPx'] - 0.4) < 1e-6)
    shot('wp22a-2-olcekli')

    # ---------------------------------------------------------------- C. iki noktaya oturt
    print('C: iki noktaya oturt')
    u = UL(); P1, P2 = (50, 150), (350, 150)
    pa, pb = px2sk(u, *P1), px2sk(u, *P2)
    Q1, Q2 = [10, 10], [10, 70]   # hedef: altlığın alt kenarı dikey 60 mm olsun (90 derece döner, ölçek 0.2)
    dd_cmd('sk-ul-fit'); check('Oturt aracı seçildi', ev('app.sketcher.tool') == 'ulfit')
    sk_click(*pa); sk_click(*Q1); sk_click(*pb); sk_click(*Q2); page.wait_for_timeout(200)
    u3 = UL(); a1, a2 = px2sk(u3, *P1), px2sk(u3, *P2)
    check('oturt: iki nokta hedeflere geldi', math.dist(a1, Q1) < 0.1 and math.dist(a2, Q2) < 0.1, f'{a1} {a2}')
    check('oturt: ölçek 60/300 = 0.2 mm/px, 90 derece', abs(u3['mmPerPx'] - 0.2) < 1e-6 and abs(abs(u3['angle']) - 90) < 1e-6, str((u3['mmPerPx'], u3['angle'])))
    ev('app.sketcher.undo()'); sidle(); check('geri al: oturtma tek adım (ölçek 0.4)', abs(UL()['mmPerPx'] - 0.4) < 1e-6 and abs(UL()['angle']) < 1e-9)
    ev('app.sketcher.setTool("select")')

    # ---------------------------------------------------------------- D. özellikler penceresi, saydamlık, kilit
    print('D: özellikler ve kilit')
    page.click('#toolbar button[data-cmd="dd-ul"]'); page.click('#ddpop [data-cmd="sk-ul-props"]'); page.wait_for_selector('[data-testid="ul-opacity"]')
    ev("(() => { const r = document.querySelector('[data-testid=ul-opacity]'); r.value = 25; r.dispatchEvent(new Event('input')); })()")
    page.check('[data-testid="ul-locked"]'); page.click('#modal button.pri'); sidle(); page.wait_for_timeout(200)
    u4 = UL(); check('saydamlık 0.25, kilitli', abs(u4['opacity'] - 0.25) < 1e-9 and u4['locked'] is True, str(u4))
    check('doku saydamlığı güncellendi', abs(ev('app.sketcher._ulMesh.material.opacity') - 0.25) < 1e-9)
    dd_cmd('sk-ul-scale'); sk_click(0, 0); page.wait_for_timeout(150)
    check('kilitliyken ölçekleme araçtan reddedilir', ev('app.sketcher.tool') == 'select' and abs(UL()['mmPerPx'] - 0.4) < 1e-6)
    stub_file('plan2.png', png_b64); dd_cmd('sk-ul-add'); page.wait_for_timeout(300)
    check('kilitliyken altlık değiştirilemez', UL()['name'] == 'plan.png' and 'kilit' in toast_text().lower(), toast_text())
    page.click('#toolbar button[data-cmd="dd-ul"]'); page.click('#ddpop [data-cmd="sk-ul-props"]'); page.wait_for_selector('[data-testid="ul-locked"]')
    page.uncheck('[data-testid="ul-locked"]'); page.click('#modal button.pri'); sidle(); check('kilit açıldı', UL()['locked'] is False)
    ev('app.sketcher.underlayProps({ opacity: 0.5 })'); sidle()

    # ---------------------------------------------------------------- E. bitir, kaydet, yeniden aç
    print('E: kaydet / aç')
    uBefore = UL(); dataBefore = ev('app.sketcher.underlay.data')
    ev('app.finishSketch()'); page.wait_for_function('() => !app.sketchSession', timeout=15000); idle()
    saved = ev('app.doc.features[0].underlay'); check('belgede sketch.underlay var', saved and saved['wPx'] == 400 and abs(saved['mmPerPx'] - 0.4) < 1e-6 and saved['data'] == dataBefore)
    b64 = ev("(() => { const a = app.fileBytes(); let s = ''; a.forEach((v) => s += String.fromCharCode(v)); return btoa(s); })()")
    ev('(d) => app.loadDoc(d)', {'params': [], 'features': []}); idle()
    ok = ev("async (b) => { const a = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); return await app.openBytes(a, 'deneme.mhnk', 'deneme.mhnk'); }", b64); idle()
    check('belge açıldı', ok is not False)
    u5 = ev('app.doc.features[0].underlay'); check('açılan belgede altlık aynı (ölçek, veri)', u5 and abs(u5['mmPerPx'] - 0.4) < 1e-6 and u5['data'] == dataBefore and u5['visible'] is True)
    ev('app.editSketch(0)'); page.wait_for_function('() => (app.sketchSession && app.sketcher.active)', timeout=15000); page.wait_for_function('() => app.sketcher._ulMesh', timeout=10000); sidle()
    check('yeniden düzenlenen eskizde altlık çiziliyor', UL() and abs(UL()['mmPerPx'] - 0.4) < 1e-6)
    # eski biçim (locked yok) belge de açılır
    old = {k: v for k, v in saved.items() if k != 'locked'}
    ev('app.cancelSketch && app.cancelSketch()'); page.wait_for_timeout(300)
    d2 = {'params': [], 'features': [{'id': 's1', 'type': 'sketch', 'name': 'S', 'plane': {'kind': 'base', 'name': 'XY', 'offset': '0'}, 'points': {'O': {'x': 0, 'y': 0, 'fixed': True}}, 'ents': [], 'cons': [], 'underlay': old}]}
    ev('(d) => app.loadDoc(d)', d2); idle(); check('WP-14 biçimli (locked yok) belge açıldı', abs(ev('app.doc.features[0].underlay.mmPerPx') - 0.4) < 1e-6, str(ev('JSON.stringify([app.doc.features.length, app.doc.features[0] && app.doc.features[0].underlay && app.doc.features[0].underlay.mmPerPx, !!app.sketchSession])')) + toast_text())

    # ---------------------------------------------------------------- F. vektör PDF (pdf.js, gerçek CSP)
    print('F: vektör PDF')
    ev('app.editSketch(0)'); page.wait_for_function('() => (app.sketchSession && app.sketcher.active)', timeout=15000); sidle()
    ev('app.sketcher.setUnderlay(null)'); sidle()
    pdf = base64.b64encode(mk_pdf([(595, 842), (842, 595)])).decode()
    stub_file('cizim.pdf', pdf); t0 = time.time()
    page.click('#toolbar button[data-cmd="dd-ul"]'); page.click('#ddpop [data-cmd="sk-ul-add"]')
    page.wait_for_selector('#ul-page', timeout=30000); check('çok sayfalı PDF: sayfa seçimi sorulur', 'sayfa' in page.inner_text('#modal').lower())
    page.fill('#ul-page', '2'); page.click('#modal button.pri')
    page.wait_for_function('() => app.sketcher.underlay', timeout=60000); page.wait_for_function('() => app.sketcher._ulMesh', timeout=15000); sidle()
    u6 = UL(); w_mm = u6['wPx'] * u6['mmPerPx']; h_mm = u6['hPx'] * u6['mmPerPx']
    check('PDF sayfa 2 (yatay 842x595 pt) altlık oldu: gerçek boyut 297x210 mm', abs(w_mm - 297.04) < 0.3 and abs(h_mm - 209.9) < 0.3, f'{w_mm} x {h_mm}')
    check('PDF görüntü PNG ve ad sayfa numarası taşır', u6['mime'] == 'image/png' and '(2)' in u6['name'], u6['name'])
    dark = ev("""async () => { const u = app.sketcher.underlay; const im = new Image(); im.src = 'data:' + u.mime + ';base64,' + u.data; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0, w = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] < 60) n++; else if (d[i] > 240) w++; } return [n, w, c.width * c.height]; }""")
    check('sayfa gerçekten çizildi (koyu çizgi pikselleri ve beyaz zemin)', dark[0] > 1000 and dark[1] > dark[2] * 0.5, str(dark))
    check('pdf.js süresi makul (<30 sn): %.1f sn' % (time.time() - t0), time.time() - t0 < 30)
    check('motor yedeğe düşmedi (pdf.js çalıştı)', 'okuyucu başlatılamadı' not in toast_text())
    check('CSP ihlali yok (işçi unsafe-eval olmadan çalıştı)', ev('window.__csp.length') == 0, str(ev('window.__csp')))
    wk = [k for k in seen_hdr if '/assets/pdfworker-' in k]; check('pdf işçisi ana CSP ile sunuldu (WORKER_CSP/unsafe-eval YOK)', wk and all("'unsafe-eval'" not in seen_hdr[k] for k in wk), str([(k, 'unsafe-eval' in seen_hdr[k]) for k in wk]))
    ck = [k for k in seen_hdr if '/assets/worker-' in k]; check('çekirdek işçi WORKER_CSP ile sunuldu (karşılaştırma)', ck and all("'unsafe-eval'" in seen_hdr[k] for k in ck))
    shot('wp22a-3-pdf')

    # ---------------------------------------------------------------- G. bozuk PDF: anlaşılır hata, takılma yok
    print('G: bozuk PDF')
    before = UL(); t0 = time.time()
    bad = base64.b64encode(b'%PDF-1.4\nbu bozuk bir dosya, nesne yok\n%%EOF').encode() if False else base64.b64encode(b'%PDF-1.4\nbu bozuk bir dosya, nesne yok\n%%EOF').decode()
    stub_file('bozuk.pdf', bad); page.click('#toolbar button[data-cmd="dd-ul"]'); page.click('#ddpop [data-cmd="sk-ul-add"]')
    page.wait_for_selector('#toast .toast.err', timeout=40000)
    tt = ev('document.querySelector("#toast .toast.err").textContent'); check('bozuk PDF: Türkçe hata iletisi', 'PDF' in tt and ('bozuk' in tt or 'okunamadı' in tt), tt)
    check('bozuk PDF: süre makul, altlık değişmedi', time.time() - t0 < 40 and UL()['data'] == before['data'], '%.1f' % (time.time() - t0))
    shot('wp22a-4-bozuk-pdf')

    # ---------------------------------------------------------------- H. teknik resim: kopuk ölçüyü yeni kenara bağla
    print('H: kopuk ölçü -> yeni kenar')
    ev('app.cancelSketch && app.cancelSketch()'); page.wait_for_timeout(300)
    pts = {'O': {'x': 0, 'y': 0, 'fixed': True}, 'a': {'x': 0, 'y': 0}, 'b': {'x': 50, 'y': 0}, 'c': {'x': 50, 'y': 30}, 'd': {'x': 0, 'y': 30}}
    ents = [{'id': 'l1', 'type': 'line', 'a': 'a', 'b': 'b'}, {'id': 'l2', 'type': 'line', 'a': 'b', 'b': 'c'}, {'id': 'l3', 'type': 'line', 'a': 'c', 'b': 'd'}, {'id': 'l4', 'type': 'line', 'a': 'd', 'b': 'a'}]
    docH = {'params': [], 'rollback': None, 'features': [{'id': 's1', 'type': 'sketch', 'name': 'S', 'plane': {'kind': 'base', 'name': 'XY', 'offset': '0'}, 'points': pts, 'ents': ents, 'cons': []},
        {'id': 'e1', 'type': 'extrude', 'name': 'E', 'sketch': 's1', 'profiles': 'all', 'dist': '10', 'extent': 'dist', 'dir': 'one', 'op': 'new'}]}
    ev('(d) => app.loadDoc(d)', docH); idle(); page.wait_for_function('() => app.result && app.result.bodies && app.result.bodies.length === 1', timeout=30000)
    ev('app.setMode("drawing")'); page.wait_for_timeout(300); ev('app.drawing.newSheet()')
    page.wait_for_function('() => app.drawing.C && Object.keys(app.drawing.C.views).length >= 1', timeout=60000)
    info = ev("""() => { const D = app.drawing; const vid = Object.keys(D.C.views).find((k) => D.C.views[k].v.orient === 'front'); const V = D.C.views[vid];
      return { vid, prims: V.prims.filter((p) => p.t === 'l' && p.vis && p.src).map((p) => ({ src: p.src, a: p.a, b: p.b })) }; }""")
    vert = [q for q in info['prims'] if abs(q['a'][0] - q['b'][0]) < 1e-6]
    check('önden görünüşte iki dikey kenar var', len(vert) >= 2, str(len(vert)))
    left = min(vert, key=lambda q: q['a'][0]); right = max(vert, key=lambda q: q['a'][0])
    # ölçüyü belgeye yaz (iki dikey kenar arası yatay ölçü), sonra sağ kenarın bağını kopar
    ev("""([vid, l, r]) => { const D = app.drawing; const V = D.C.views[vid]; const P = (src) => V.prims.find((p) => p.src === src);
      const ref = (p) => ({ src: p.src, t: 'l', g: { a: p.a.slice(), b: p.b.slice() }, pt: 'a', q: p.a.slice() });
      D.mut((d) => { d.dims.push({ id: 'dH1', view: vid, type: 'lin', dir: 'h', refs: [ref(P(l)), ref(P(r))], off: 8 }); }); }""", [info['vid'], left['src'], right['src']])
    page.wait_for_function('() => app.drawing.C && app.drawing.C.dims.length === 1 && !app.drawing.C.dims[0].lost', timeout=30000)
    v0 = ev('app.drawing.C.dims[0].value'); check('ölçü 50 mm, kopuk değil', abs(v0 - 50) < 1e-6, str(v0))
    ev("""() => { app.drawing.mut((d) => { const r = d.dims[0].refs[1]; r.src = 'yok-kenar'; r.g = { a: [999, 999], b: [999, 1005] }; }); }""")
    page.wait_for_function('() => app.drawing.C && app.drawing.C.dims[0] && app.drawing.C.dims[0].lost', timeout=30000)
    check('ölçü kopuk (kırmızı) işaretlendi', ev('app.drawing.C.dims[0].lost') is True)
    ev("app.drawing.select({ kind: 'dim', id: 'dH1' })"); page.wait_for_selector('[data-testid="drw-dim-relink"]', timeout=5000)
    page.click('[data-testid="drw-dim-relink"]'); check('bağlama aracı etkin', ev('app.drawing.tool && app.drawing.tool.kind') == 'relink')
    # sağ kenarın ortasına gerçek fare tıklaması (sayfa -> ekran: SVG matrisi)
    scr = ev("""([vid, r]) => { const D = app.drawing; const V = D.C.views[vid]; const p = V.prims.find((q) => q.src === r); const m = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2]; const pl = V.pl;
      const sp = pl.c ? [pl.o[0] + pl.s * (m[0] - pl.c[0]), pl.o[1] + pl.s * (m[1] - pl.c[1])] : [pl.o[0] + pl.s * m[0], pl.o[1] + pl.s * m[1]];
      const s = D.svg; const pt = s.createSVGPoint(); pt.x = sp[0]; pt.y = D.C.H - sp[1]; const q = pt.matrixTransform(s.getScreenCTM()); return [q.x, q.y]; }""", [info['vid'], right['src']])
    page.mouse.move(scr[0], scr[1]); page.wait_for_timeout(80); page.mouse.click(scr[0], scr[1])
    page.wait_for_function('() => app.drawing.C && app.drawing.C.dims[0] && !app.drawing.C.dims[0].lost', timeout=30000)
    check('bağ yenilendi: ölçü kopuk değil, 50 mm', abs(ev('app.drawing.C.dims[0].value') - 50) < 1e-6, str(ev('app.drawing.C.dims[0].value')))
    check('yeni bağ gerçek kenar anahtarını taşır; araç kapandı', ev('app.drawing.current().dims[0].refs[1].src') == right['src'] and ev('app.drawing.tool') is None)
    # model değişince (50 -> 60) yenilenen bağ anahtarla izlenir
    ev("(d) => app.loadDoc(d)", {**docH, 'features': [{**docH['features'][0], 'points': {**pts, 'b': {'x': 60, 'y': 0}, 'c': {'x': 60, 'y': 30}}}, docH['features'][1]], 'drawings': ev('app.doc.drawings')}); idle()
    page.wait_for_function('() => app.drawing.C && app.drawing.C.dims[0] && !app.drawing.C.dims[0].lost && Math.abs(app.drawing.C.dims[0].value - 60) < 1e-6', timeout=30000)
    check('model 60 mm olunca bağlanan ölçü 60 mm izler', True)
    shot('wp22a-5-relink')
    check('konsolda sayfa hatası yok', not errs, str(errs[:3]))
    br.close()
finally:
    srv.shutdown()
print(f'\nwp22a-ui: {passed} geçti, {failed} kaldı'); sys.exit(1 if failed else 0)
