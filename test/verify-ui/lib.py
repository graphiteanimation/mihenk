# Ortak yardımcılar: tarayıcı, ekran görüntüsü, konsol toplama. Kullanım: from lib import *
import os, sys, time, json
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)
URL = os.environ.get('MIHENK_URL', 'http://127.0.0.1:4310/')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
FINDINGS = []
def newpage(br, lang='tr', theme='light', w=1440, h=900, init='', welcome=False):
    ctx = br.new_context(viewport={'width': w, 'height': h}, locale='tr-TR' if lang == 'tr' else 'en-US', accept_downloads=True)
    ctx.add_init_script("if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i','1'); localStorage.setItem('atolye.lang','%s'); localStorage.setItem('atolye.recoveryMs','0'); %s %s }" % (lang, '' if welcome else "localStorage.setItem('mihenk.welcome','off');", init))
    pg = ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: pg.errs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
    pg.goto(URL); pg.wait_for_function('() => window.app'); pg.evaluate('app.ready')
    return ctx, pg
def shot(pg, name):
    p = os.path.join(SHOTS, name + '.png'); pg.screenshot(path=p); return p
