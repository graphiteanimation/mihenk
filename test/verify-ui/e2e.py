# Bağımsız doğrulama: uçtan uca kullanıcı akışı (gerçek tıklamalar). Kullanım:
#   python3 test/verify-ui/e2e.py <tr|en> <light|dark> [url]
# Çıktı: shots/<dil>-<tema>-NN-ad.png, logs/e2e-<dil>-<tema>.json (adımlar, bulgu adayları, konsol).
# Not: önce `npm run build` + `npx vite preview --port 4310 --strictPort` (ya da MIHENK_URL).
import os, sys, time, json, re
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)
LOGS = os.path.join(HERE, 'logs'); os.makedirs(LOGS, exist_ok=True)
LANG = sys.argv[1] if len(sys.argv) > 1 else 'tr'
THEME = sys.argv[2] if len(sys.argv) > 2 else 'light'
URL = sys.argv[3] if len(sys.argv) > 3 else os.environ.get('MIHENK_URL', 'http://127.0.0.1:4310/')
PFX = f'{LANG}-{THEME}'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
STEPS, CAND, NOTES = [], [], []
_n = [0]
RAWKEY = re.compile(r'\b(?:cam|err|tb|menu|msg|dlg|tip|sk|grp|common|status|st|panel|op|nc|vf|sim|issue)\.[a-z0-9_]+(?:\.[a-z0-9_]+)+\b')
TR_CH = re.compile(r'[ğüşıöçĞÜŞİÖÇ]')
JS_AUDIT = r"""() => {
  const out = {clipped: [], text: ''};
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  for (const e of document.querySelectorAll('button, .btn, label, .tab, [role=tab], .tt, .brow, .bsec, td, th, .fld, .callout, .tb-btn, [data-cmd], .chip, .badge, .rb, span, div')) {
    if (!vis(e) || e.children.length > 2) continue;
    const tx = (e.innerText || '').trim(); if (!tx || tx.length < 3) continue;
    const s = getComputedStyle(e);
    if ((e.scrollWidth > e.clientWidth + 2) && (s.overflow !== 'visible' || s.overflowX !== 'visible' || s.textOverflow === 'ellipsis')) out.clipped.push([e.className || e.tagName, tx.slice(0, 60), e.scrollWidth, e.clientWidth, (e.dataset && (e.dataset.testid || e.dataset.cmd)) || '']);
    else if (e.scrollHeight > e.clientHeight + 3 && s.overflowY !== 'visible' && s.overflowY !== 'auto' && s.overflowY !== 'scroll') out.clipped.push([e.className || e.tagName, tx.slice(0, 60), 'h' + e.scrollHeight, e.clientHeight, (e.dataset && (e.dataset.testid || e.dataset.cmd)) || '']);
  }
  const vt = []; for (const e of document.querySelectorAll('body *')) { if (!vis(e) || e.children.length) continue; const t = (e.innerText || e.value || '').trim(); if (t) vt.push(t); if (e.title) vt.push(e.title); if (e.getAttribute && e.getAttribute('aria-label')) vt.push(e.getAttribute('aria-label')); if (e.placeholder) vt.push(e.placeholder); }
  out.text = vt.join(' ¦ ');
  return out;
}"""

def log(*a):
    print(*a, flush=True)

class Ctx: pass
C = Ctx()

def shot(pg, name):
    _n[0] += 1
    p = os.path.join(SHOTS, f'{PFX}-{_n[0]:02d}-{name}.png'); pg.screenshot(path=p); return os.path.relpath(p, os.path.join(HERE, '..', '..'))

def audit(pg, tag):
    """Ham anahtar, kırpılan etiket, dil karışması taraması."""
    try: r = pg.evaluate(JS_AUDIT)
    except Exception as e: NOTES.append(f'audit hata {tag}: {e}'); return
    raw = sorted(set(RAWKEY.findall(r['text'])))
    if raw: CAND.append({'tag': tag, 'kind': 'ham-anahtar', 'detail': raw[:8]}); log('  !! ham anahtar', tag, raw[:5])
    if r['clipped']: CAND.append({'tag': tag, 'kind': 'kırpılma', 'detail': r['clipped'][:6]}); log('  !! kırpılan', tag, r['clipped'][:3])
    if LANG == 'en':
        tr = sorted(set(w for w in re.findall(r'\S*[ğüşıöçĞÜŞİÖÇ]\S*', r['text'])))
        if tr: CAND.append({'tag': tag, 'kind': 'TR/EN karışma (EN modunda TR harf)', 'detail': tr[:10]}); log('  !! EN içinde TR', tag, tr[:5])

def step(name, fn, shots=True):
    t0 = time.time(); ok = True; err = ''
    try: fn()
    except Exception as e: ok = False; err = (str(e).splitlines() or [''])[0][:300]
    img = ''
    try:
        if shots: img = shot(C.pg, name); audit(C.pg, name)
    except Exception as e: err += ' | shot: ' + str(e)[:100]
    STEPS.append({'step': name, 'ok': ok, 'err': err, 'sec': round(time.time() - t0, 1), 'shot': img})
    log(('OK   ' if ok else 'FAIL ') + name + (' -> ' + err if err else ''))
    return ok

def js(expr, arg=None):
    return C.pg.evaluate(expr, arg) if arg is not None else C.pg.evaluate(expr)
def txt(sel):
    return js('(s) => document.querySelector(s)?.innerText || ""', sel)
def cnt(sel):
    return js('(s) => document.querySelectorAll(s).length', sel)
def click(sel, **k): C.pg.click(sel, timeout=8000, **k)
def fill(sel, v): C.pg.fill(sel, str(v), timeout=8000)
def wait(ms=400): C.pg.wait_for_timeout(ms)
def pt(world):
    """Dünya noktası -> sayfa pikseli (tuval ofseti dahil)."""
    r = js('(w) => { const p = app.viewport.project(w); const b = app.viewport.renderer.domElement.getBoundingClientRect(); return [p[0] + b.left, p[1] + b.top]; }', world)
    return r
def mclick(world): x, y = pt(world); C.pg.mouse.click(x, y); wait(250)
def waitok(timeout=60000):
    C.pg.wait_for_function("() => document.querySelector('[data-testid=op-result] .callout.ok') || document.querySelector('[data-testid=op-result] .callout.err')", timeout=timeout)
def nc_text(): return js('app.cam.ops.nc ? app.cam.ops.nc.text : null')
def closemodal():
    for _ in range(3):
        if cnt('#modal:not(.hidden)'):
            C.pg.keyboard.press('Escape'); wait(200)

# ------------------------------------------------------------------ parça
def spx(u, v):
    return js('([u,v]) => { const p = app.sketcher._px([u,v]); const b = app.viewport.renderer.domElement.getBoundingClientRect(); return [p[0]+b.left, p[1]+b.top]; }', [u, v])
def hover_click(x, y):
    C.pg.mouse.move(x - 12, y - 7); C.pg.mouse.move(x, y, steps=4); C.pg.mouse.down(); C.pg.mouse.up(); wait(250)
def sclick(u, v): hover_click(*spx(u, v))
def overlay_rect():
    return js('() => { const r = document.querySelector(".vp-overlay-tr").getBoundingClientRect(); return [r.x, r.y, r.right, r.bottom]; }')
def zoom_fit_sketch(pts):
    """Gerçek kullanıcı gibi tekerlekle uzaklaş; çizilecek noktalar sağ üst katmanın (görünüm küpü) altında kalmasın."""
    for _ in range(8):
        ov = overlay_rect(); ok = True
        for (u, v) in pts:
            x, y = spx(u, v)
            if x > ov[0] - 20 and y < ov[3] + 20: ok = False
            if x < 280 or y < 190 or x > 1100 or y > 800: ok = False
        if ok: return
        C.pg.mouse.move(700, 520); C.pg.mouse.wheel(0, 250); wait(350)

def panel_ok(): click('[data-testid=panel-ok]'); wait(900)
def nbodies(): return js('app.result.bodies.length')
def feat_types(): return js('app.doc.features.map(f => f.type + ":" + f.id).join(",")')

def new_sketch_on_plane(name='XY'):
    click('#toolbar [data-cmd=sketch]'); wait(300)
    xy = js("""(n) => { const m = app.viewport.planeMeshes.find(m => m.userData.basePlane === n); const v = m.position.clone(); v.set(18, 18, 0); m.localToWorld(v); const p = app.viewport.project(v.toArray()); const b = app.viewport.renderer.domElement.getBoundingClientRect(); return [p[0]+b.left, p[1]+b.top]; }""", name)
    C.pg.mouse.move(xy[0] - 5, xy[1] - 5); C.pg.mouse.click(*xy); wait(1500)
    assert js('!!app.sketchSession'), 'eskiz oturumu açılmadı'

def new_sketch_on_face(world_pt):
    click('#toolbar [data-cmd=sketch]'); wait(300)
    x, y = pt(world_pt); C.pg.mouse.move(x - 4, y - 4); C.pg.mouse.click(x, y); wait(1500)
    assert js('!!app.sketchSession'), 'yüzde eskiz oturumu açılmadı'

def finish_sketch(): click('#toolbar [data-cmd=sk-finish]'); wait(900)

def loc(wx, wy):
    """Dünya (x,y) -> etkin eskiz düzlemi yerel koordinatı (düzlem z'ye dik kabul)."""
    return js('([x, y]) => { const pl = app.sketchSession.plane; const d = [x - pl.o[0], y - pl.o[1], 0 - pl.o[2] + (pl.o[2])]; const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; return [dot(d, pl.x), dot(d, pl.y)]; }', [wx, wy])
def wclick(wx, wy): u, v = loc(wx, wy); sclick(u, v)

def build_part():
    # 1) taban: eskiz dikdörtgen 100x60 -> extrude 20
    step('t01-eskiz-duzlem-sec', lambda: new_sketch_on_plane('XY'))
    def draw():
        zoom_fit_sketch([(0, 0), (100, 60)])
        click('#toolbar [data-cmd=rect]'); sclick(0, 0); sclick(100, 60)
        sk = js('JSON.parse(JSON.stringify(app.sketcher.sk))')
        assert len(sk['ents']) == 4, 'beklenen 4 çizgi, bulunan ' + str(len(sk['ents']))
    step('t02-dikdortgen-ciz', draw)
    step('t03-eskiz-bitir', finish_sketch)
    def ext():
        click('#toolbar [data-cmd=extrude]'); wait(700); fill('#panel [data-k=dist]', '20'); wait(300)
    step('t04-extrude-paneli', ext)
    step('t05-extrude-tamam', lambda: panel_ok())
    assert nbodies() == 1, 'gövde oluşmadı'
    # 2) üst yüzde eskiz: cep dikdörtgeni 40x30 (20..60 x 15..45) + daire Ø16 (merkez 80,30) -> extrude KES 8
    def sk2():
        new_sketch_on_face([50, 30, 20])
        NOTES.append('eskiz2 düzlemi: ' + js('JSON.stringify(app.sketchSession.plane)'))
        zoom_fit_sketch([loc(20, 15), loc(60, 45), loc(80, 30)])
        click('#toolbar [data-cmd=rect]'); wclick(20, 15); wclick(60, 45)
        click('#toolbar [data-cmd=circle]'); wclick(80, 30); wclick(88, 30)
        sk = js('JSON.parse(JSON.stringify(app.sketcher.sk))')
        NOTES.append('eskiz2 noktalar: ' + json.dumps([[round(p['x'], 2), round(p['y'], 2)] for p in sk['points'].values()]))
        assert len(sk['ents']) == 5, 'eskiz2 varlık sayısı ' + str(len(sk['ents']))
    step('t06-cep-eskizi-ust-yuzde', sk2)
    step('t07-eskiz2-bitir', finish_sketch)
    def ext2():
        click('#toolbar [data-cmd=extrude]'); wait(700)
        info = js("[...document.querySelectorAll('#panel [data-k]')].map(e => e.dataset.k + '=' + (e.value || '')).join(' ')")
        NOTES.append('extrude2 paneli alanları: ' + info)
        fill('#panel [data-k=dist]', '8')
        op = js("document.querySelector('#panel [data-k=op]') ? [...document.querySelector('#panel [data-k=op]').options].map(o => o.value).join('/') : null")
        NOTES.append('extrude2 op seçenekleri: ' + str(op))
        C.pg.select_option('#panel [data-k=op]', 'cut'); wait(300)
    step('t08-extrude-kes-paneli', ext2)
    step('t09-extrude-kes-tamam', lambda: panel_ok())
    vol = js('app.result.bodies[0] && app.result.bodies[0].volume'); NOTES.append('hacim cepten sonra: ' + str(vol) + ' (beklenen ' + str(120000 - 40*30*8 - 3.14159265*64*8) + ')')
    # 3) 4 delik: üst yüzde nokta eskizi -> Delik özelliği (Ø6, derinlik 10)
    def sk3():
        new_sketch_on_face([50, 30, 20])
        zoom_fit_sketch([loc(8, 8), loc(92, 52)])
        click('#toolbar [data-cmd=dd-draw]'); wait(200); click('[data-cmd=point]')
        for (x, y) in [(8, 8), (92, 8), (8, 52), (92, 52)]: wclick(x, y)
        n = js('Object.keys(app.sketcher.sk.points).length'); assert n == 5, 'nokta sayısı ' + str(n)
    step('t10-delik-eskizi-4-nokta', sk3)
    step('t11-eskiz3-bitir', finish_sketch)
    def hole():
        click('#toolbar [data-cmd=hole]'); wait(700)
        fill('#panel [data-k=dia]', '6'); fill('#panel [data-k=depth]', '10'); wait(300)
    step('t12-delik-paneli', hole)
    step('t13-delik-tamam', lambda: panel_ok())
    NOTES.append('parça: ' + feat_types() + ' delik=' + js('JSON.stringify((app.result.holes||[]).map(h => [h.dia, h.positions.length]))') + ' hacim=' + str(js('app.result.bodies[0].volume')))
    def iso(): click('[data-cmd=view-iso]'); wait(800)
    step('t14-parca-izometrik', iso)

def run():
    build_part()

def main():
    with sync_playwright() as p:
        br = p.chromium.launch(channel='chrome', args=ARGS)
        ctx = br.new_context(viewport={'width': 1440, 'height': 900}, locale='tr-TR' if LANG == 'tr' else 'en-US', accept_downloads=True)
        ctx.add_init_script("if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i','1'); localStorage.setItem('atolye.lang','%s'); localStorage.setItem('atolye.recoveryMs','0'); localStorage.setItem('mihenk.welcome','off'); localStorage.setItem('atolye.theme','%s'); localStorage.setItem('mihenk.theme','%s'); }" % (LANG, THEME, THEME))
        pg = ctx.new_page(); C.pg = pg; C.br = br; C.ctx = ctx
        C.errs = []
        pg.on('pageerror', lambda e: C.errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: C.errs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        pg.goto(URL); pg.wait_for_function('() => window.app'); pg.evaluate('app.ready')
        run()
        json.dump({'lang': LANG, 'theme': THEME, 'steps': STEPS, 'cand': CAND, 'notes': NOTES, 'console': C.errs}, open(os.path.join(LOGS, f'e2e-{PFX}.json'), 'w'), ensure_ascii=False, indent=1)
        br.close()

if __name__ == '__main__':
    sys.path.insert(0, HERE)
    main()
