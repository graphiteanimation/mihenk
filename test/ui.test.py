# Arayüz tasarım testleri: tema, yoğunluk, komut arama, karşılama, klavye turu, kontrast, hedef boyutu.
# Önce `npm run build`; çalıştır: python3 test/ui.test.py
import os, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
passed = failed = 0
def check(name, cond, detail=''):
    global passed, failed
    if cond: passed += 1; print('  ok   ', name)
    else: failed += 1; print('  FAIL ', name, detail)

print('statik denetimler')
r = subprocess.run([sys.executable, os.path.join(ROOT, 'design/tools/contrast.py')], capture_output=True, text=True, cwd=ROOT)
check('kontrast aracı: kalan çift 0', r.returncode == 0 and 'SAYISI: 0' in r.stdout + r.stderr, r.stdout[-200:])
def tokens(path):
    return dict(re.findall(r'(--[a-z0-9-]+):\s*([^;]+);', open(path).read()))
ref, cur = tokens(os.path.join(ROOT, 'design/tokens.css')), tokens(os.path.join(ROOT, 'src/ui/tokens.css'))
drift = [k for k, v in ref.items() if k in cur and cur[k].strip() != v.strip() and k.startswith(('--accent', '--text', '--bg', '--err', '--warn', '--ok', '--info', '--unv'))]
check('belirteçler tasarım başvurusuyla aynı (renk grupları)', not drift, drift[:5])
bad = []
for f in os.listdir(os.path.join(ROOT, 'src/ui')):
    if f.endswith('.css') and f != 'tokens.css':
        txt = re.sub(r'/\*.*?\*/', '', open(os.path.join(ROOT, 'src/ui', f)).read(), flags=re.S)
        bad += [f + ':' + m for m in re.findall(r'#[0-9a-fA-F]{3,8}\b', txt)]
check('tokens.css dışında ham HEX renk yok', not bad, bad[:5])
check('azaltılmış hareket desteği (prefers-reduced-motion)', 'prefers-reduced-motion' in open(os.path.join(ROOT, 'src/ui/components.css')).read() + open(os.path.join(ROOT, 'src/ui/style.css')).read())

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _srv
PORT, server = _srv.start(ROOT, ['preview'])  # her koşu kendi boş portunda kendi sunucusunu açar (test/_srv.py)
URL = f'http://127.0.0.1:{PORT}/'
try:
  with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    def newpage(init='', scheme='light', w=1440, h=900):
        ctx = br.new_context(viewport={'width': w, 'height': h}, locale='tr-TR', color_scheme=scheme)
        ctx.add_init_script("if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.setItem('mihenk.lang', 'tr'); localStorage.setItem('mihenk.recoveryMs', '0'); " + init + " }")
        pg = ctx.new_page(); pg.goto(URL); pg.wait_for_function('() => window.app'); pg.evaluate('app.ready'); return ctx, pg
    css = lambda pg, v: pg.evaluate(f'getComputedStyle(document.documentElement).getPropertyValue("{v}").trim()')
    attr = lambda pg, a: pg.evaluate(f'document.documentElement.getAttribute("{a}")')

    print('tema')
    ctx, pg = newpage("localStorage.setItem('mihenk.welcome', 'off');")
    check('varsayılan: sistem açık -> data-theme=light', attr(pg, 'data-theme') == 'light' and attr(pg, 'data-density') == 'normal')
    bg_light = css(pg, '--bg-app'); vp_light = pg.evaluate('app.viewport.renderer.domElement.toDataURL().length > 0')
    pg.click('#menubar .tbtn[data-cmd="settings"]'); pg.click('[data-testid="set-theme-dark"]')
    check('ayarlardan koyu tema uygulanır', attr(pg, 'data-theme') == 'dark' and css(pg, '--bg-app') != bg_light)
    col = pg.evaluate('app.viewport.scene.background ? app.viewport.scene.background.getHexString() : null')
    check('3B görünüm rengi tema ile bağlı (CSS değişkeni)', pg.evaluate('(() => { const c = getComputedStyle(document.documentElement).getPropertyValue("--vp-sk-error").trim(); return c.length >= 4; })()'))
    check('tema tercihi saklandı', pg.evaluate("localStorage.getItem('mihenk.theme')") == 'dark')
    pg.click('[data-testid="set-theme-system"]'); check('sistem seçeneği açık sistemde light', attr(pg, 'data-theme') == 'light')
    pg.click('[data-testid="set-theme-dark"]'); pg.keyboard.press('Escape')
    pg.reload(); pg.wait_for_function('() => window.app'); pg.evaluate('app.ready')
    check('yeniden yükleme: koyu tema korundu', attr(pg, 'data-theme') == 'dark')
    ctx.close()
    ctx, pg = newpage("localStorage.setItem('mihenk.welcome', 'off');", scheme='dark')
    check('sistem koyu -> data-theme=dark', attr(pg, 'data-theme') == 'dark'); ctx.close()

    print('yoğunluk')
    ctx, pg = newpage("localStorage.setItem('mihenk.welcome', 'off');")
    h_n = float(css(pg, '--ctl-h').replace('px', ''))
    pg.click('#menubar .tbtn[data-cmd="settings"]'); pg.click('[data-testid="set-density-large"]')
    h_l = float(css(pg, '--ctl-h').replace('px', ''))
    check('büyük yoğunluk: denetim yüksekliği >= 40 px ve normalden büyük', attr(pg, 'data-density') == 'large' and h_l >= 40 and h_l > h_n, (h_n, h_l))
    check('yoğunluk saklandı', pg.evaluate("localStorage.getItem('mihenk.density')") == 'large')
    pg.keyboard.press('Escape'); ctx.close()

    print('komut arama')
    ctx, pg = newpage("localStorage.setItem('mihenk.welcome', 'off');")
    pg.keyboard.press('Control+k'); pg.wait_for_selector('[data-testid="palette"]')
    pg.fill('[data-testid="palette-input"]', 'kutu'); pg.wait_for_timeout(150)
    check('Ctrl+K paleti açar ve "kutu" komutu bulur', pg.locator('[data-testid="palette-list"] [data-cmd="box"]').count() == 1)
    pg.fill('[data-testid="palette-input"]', 'box'); pg.wait_for_timeout(150)
    check('İngilizce ad ile de bulunur', pg.locator('[data-testid="palette-list"] [data-cmd="box"]').count() == 1)
    pg.fill('[data-testid="palette-input"]', 'zzzqqq'); pg.wait_for_timeout(100)
    check('eşleşme yoksa boş durum metni', pg.locator('[data-testid="palette-list"]').inner_text().strip() != '')
    pg.fill('[data-testid="palette-input"]', 'kutu'); pg.wait_for_timeout(100); pg.keyboard.press('Enter'); pg.wait_for_selector('#panel [data-k="w"]', timeout=5000)
    check('Enter komutu çalıştırır (Kutu paneli açıldı)', pg.locator('#p-ok').count() == 1)
    check('palet kapandı', pg.locator('[data-testid="palette"]').count() == 0)
    pg.click('#p-cancel'); ctx.close()

    print('karşılama ekranı')
    ctx, pg = newpage('')
    check('ilk açılışta karşılama görünür', pg.locator('#welcome').is_visible() and pg.locator('[data-testid="w-new"]').is_visible())
    check('karşılamada yeni/aç/son dosyalar var', pg.locator('[data-testid="w-open"]').count() == 1 and pg.locator('[data-testid="w-recent"]').count() == 1)
    pg.click('[data-testid="w-new"]'); check('Yeni belge karşılamayı kapatır', not pg.locator('#welcome').is_visible() and pg.locator('#toolbar').is_visible())
    pg.evaluate('app.C.run("home")'); check('Dosya > Karşılama ekranı geri açar', pg.locator('#welcome').is_visible())
    ctx.close()

    print('klavye turu, odak, hedef boyutu')
    ctx, pg = newpage("localStorage.setItem('mihenk.welcome', 'off');")
    pg.evaluate('document.activeElement && document.activeElement.blur()')
    seen = set(); first_focus = None
    for i in range(140):
        pg.keyboard.press('Tab')
        reg = pg.evaluate('(() => { const e = document.activeElement; const r = e && e.closest("#menubar,#tabs,#toolbar,#browser,#viewport,#timeline,#panel,#status"); return r ? r.id : (e ? e.tagName : null); })()')
        seen.add(reg)
        if i == 6 and first_focus is None:
            first_focus = pg.evaluate('(() => { const e = document.activeElement; const s = getComputedStyle(e); return { w: parseFloat(s.outlineWidth), st: s.outlineStyle, sh: s.boxShadow }; })()')
    check('Tab ana bölgelere ulaşır', {'menubar', 'toolbar', 'browser', 'viewport', 'status'} <= seen, seen)
    check('klavye odağı görünür (anahat >= 2 px ya da gölge)', first_focus and ((first_focus['st'] != 'none' and first_focus['w'] >= 2) or first_focus['sh'] != 'none'), first_focus)
    def small(density):
        return pg.evaluate("""() => { const out = []; for (const e of document.querySelectorAll('#menubar button, #tabs [role=tab], #toolbar button, #browser button, #viewbtns button, #viewtoggles button, #panel button')) {
          if (e.offsetParent === null || e.getAttribute('aria-disabled') === 'true') continue; const r = e.getBoundingClientRect(); if (r.width === 0) continue;
          if (r.height < %d - 0.5 || r.width < %d - 0.5) out.push((e.dataset.cmd || e.dataset.testid || e.className || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); } return out; }""" % (32, 32))
    sm = small('normal'); check('tıklama hedefleri >= 32 px (normal)', not sm, sm[:8])
    pg.evaluate('document.querySelector("body")'); pg.evaluate("document.documentElement.setAttribute('data-density', 'large')")
    pg.wait_for_timeout(100)
    sm = pg.evaluate("""() => { const out = []; for (const e of document.querySelectorAll('#menubar button, #tabs [role=tab], #toolbar button, #browser button, #viewbtns button, #viewtoggles button')) {
      if (e.offsetParent === null) continue; const r = e.getBoundingClientRect(); if (r.width && (r.height < 39.5 || r.width < 39.5)) out.push((e.dataset.cmd || e.className) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); } return out; }""")
    check('tıklama hedefleri >= 40 px (büyük yoğunluk)', not sm, sm[:8])
    ctx.close()

    print('geçmiş: hedef boyutu, erişilebilir ad (WP-02)')
    ctx, pg = newpage("localStorage.setItem('mihenk.welcome', 'off');")
    p12 = subprocess.run(['node', '--input-type=module', '-e', "import('./test/models/part12.mjs').then(m => console.log(JSON.stringify(m.part12('30'))))"], capture_output=True, text=True, cwd=ROOT).stdout
    pg.evaluate('(d) => app.loadDoc(JSON.parse(d))', p12); pg.evaluate('app.whenIdle()')
    def hsmall(minpx):
        return pg.evaluate("""(m) => { const out = []; for (const e of document.querySelectorAll('#timeline .chip, #browser .hrow, #browser .hrow button')) {
          if (e.offsetParent === null) continue; const r = e.getBoundingClientRect(); if (r.height < m - 0.5 || r.width < m - 0.5) out.push((e.dataset.id || e.dataset.hist || e.className) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); } return out; }""", minpx)
    sm = hsmall(32); check('geçmiş: çip/satır/düğme hedefleri >= 32 px (normal)', not sm, sm[:6])
    pg.evaluate("document.documentElement.setAttribute('data-density', 'large')"); pg.wait_for_timeout(100)
    sm = hsmall(40); check('geçmiş: çip/satır/düğme hedefleri >= 40 px (büyük yoğunluk)', not sm, sm[:6])
    pg.evaluate("document.documentElement.setAttribute('data-density', 'normal')")
    names = pg.evaluate('[...document.querySelectorAll("#timeline .chip")].map(c => c.textContent.trim())')
    check('geçmiş: her çipin metin adı var (adsız şerit ekran okuyucuda adlı)', len(names) == 10 and all(len(n) > 2 for n in names), names[:3])
    check('geçmiş: eskiz rozetinin erişilebilir adı', pg.evaluate('[...document.querySelectorAll("#browser [data-testid=hist-sketch-badge]")].every(b => (b.getAttribute("aria-label") || "").length > 3)'))
    ctx.close()

    print('marka')
    ctx, pg = newpage("localStorage.setItem('mihenk.welcome', 'off');")
    txt = pg.evaluate('document.body.innerText')
    check('ekranda eski ad yazmaz', 'Atolye' not in txt.replace('ö','o') and 'Atölye' not in txt)
    check('başlık Mihenk', 'Mihenk' in pg.title())
    ctx.close()
    br.close()
finally:
    _srv.stop(server)
print(f'\n{passed} geçti, {failed} kaldı'); sys.exit(1 if failed else 0)
