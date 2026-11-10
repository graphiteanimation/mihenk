#!/usr/bin/env python3
"""Kullanım: shot.py <html> <çıktı.png> [genişlik yükseklik] [sorgu]  — headless Chrome ile ekran görüntüsü (tam sayfa değil, pencere boyu)."""
import sys, pathlib
from playwright.sync_api import sync_playwright
src=pathlib.Path(sys.argv[1]).resolve(); out=sys.argv[2]; w=int(sys.argv[3]) if len(sys.argv)>3 else 1440; h=int(sys.argv[4]) if len(sys.argv)>4 else 900; q=sys.argv[5] if len(sys.argv)>5 else ''
full = '--full' in sys.argv
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']); pg=b.new_page(viewport={'width':w,'height':h})
    pg.goto('file://'+str(src)+q); pg.wait_for_timeout(500); pg.evaluate('document.fonts.ready'); pg.screenshot(path=out,full_page=full); b.close()
