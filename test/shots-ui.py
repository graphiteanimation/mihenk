# Ekran görüntüsü matrisi: {açık/TR, koyu/EN} x {1440, 1920} x {karşılama, model, eskiz, ayarlar}. Çıktı: test/shots/ui/
# Önce `npm run build` (vite preview dist/ sunar). Sabit port ve sabit yol yok: depo kökü bu dosyadan türetilir, sunucu boş portta açılıp kapatılır (test/_srv.py).
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _srv
from playwright.sync_api import sync_playwright
OUT = os.path.join(ROOT, 'test', 'shots', 'ui') + os.sep; os.makedirs(OUT, exist_ok=True)
PORT, srv = _srv.start(ROOT, ['preview'])
try:
  with sync_playwright() as p:
      br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
      for theme, lang, scheme in [('light', 'tr', 'light'), ('dark', 'en', 'dark')]:
          for w, h in [(1440, 900), (1920, 1080)]:
              tag = f'{w}_{theme}_{lang}'
              ctx = br.new_context(viewport={'width': w, 'height': h}, locale='tr-TR', color_scheme=scheme)
              ctx.add_init_script(f"if (!sessionStorage.getItem('__i')) {{ sessionStorage.setItem('__i','1'); localStorage.setItem('mihenk.lang','{lang}'); localStorage.setItem('mihenk.theme','{theme}'); localStorage.setItem('mihenk.recoveryMs','0'); }}")
              pg = ctx.new_page(); pg.goto(f'http://127.0.0.1:{PORT}/'); pg.wait_for_function('() => window.app'); pg.evaluate('app.ready'); pg.wait_for_timeout(600)
              pg.screenshot(path=OUT + f'01-karsilama_{tag}.png')
              pg.click('[data-testid="w-new"]')
              pg.click('#toolbar button[data-cmd="dd-prim"]'); pg.click('#ddpop [data-cmd="box"]'); pg.wait_for_timeout(300); pg.click('#p-ok'); pg.evaluate('app.whenIdle()')
              pg.click('#toolbar button[data-cmd="fillet"]'); pg.wait_for_timeout(500)
              pg.screenshot(path=OUT + f'02-tasarim-model_{tag}.png')
              pg.click('#p-cancel'); pg.wait_for_timeout(200)
              pg.click('#toolbar button[data-cmd="sketch"]'); pg.wait_for_timeout(300)
              pg.mouse.click(w // 2, h // 2 + 40); pg.wait_for_function('() => app.sketchSession', timeout=10000); pg.evaluate('app.sketcher.idle()')
              pg.click('#toolbar button[data-cmd="rect"]'); pg.mouse.click(w // 2 - 80, h // 2); pg.mouse.click(w // 2 + 80, h // 2 + 60); pg.wait_for_timeout(300)
              pg.screenshot(path=OUT + f'03-sketch_{tag}.png')
              pg.click('#sk-cancel'); pg.wait_for_timeout(200)
              pg.click('#menubar .tbtn[data-cmd="settings"]'); pg.wait_for_timeout(300)
              pg.screenshot(path=OUT + f'04-ayarlar_{tag}.png'); pg.keyboard.press('Escape')
              ctx.close()
      br.close()
finally:
  _srv.stop(srv)
