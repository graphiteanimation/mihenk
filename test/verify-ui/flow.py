# Uçtan uca kullanıcı akışı (gerçek tıklamalarla). Kullanım: python3 flow.py <tr|en> <light|dark> [url]
from build import *
import re
LANG = sys.argv[1] if len(sys.argv) > 1 else 'tr'
THEME = sys.argv[2] if len(sys.argv) > 2 else 'light'
if len(sys.argv) > 3: os.environ['MIHENK_URL'] = sys.argv[3]
import lib; lib.URL = os.environ.get('MIHENK_URL', lib.URL)
PFX = f'{LANG}-{THEME}'
R = []          # gözlemler
def note(*a):
    s = ' '.join(str(x) for x in a); R.append(s); print(s, flush=True)
def sh(pg, n): return shot(pg, f'{PFX}-{n}')
T0 = time.time()

def fill_machine(pg):
    pg.click('[data-cmd=cam-machine]'); time.sleep(.4)
    pg.click('#modal [data-testid=mc-copy] >> nth=0'); pg.fill('[data-testid=prompt-input]', 'Atölye Neway'); pg.click('#modal .btn.pri'); time.sleep(.4)
    sh(pg, '10-tezgah-kopya')
    pg.click('[data-testid=mc-tab-spindle]'); pg.fill('[data-f=sp-max]', '10000'); pg.fill('[data-f=fd-max]', '5000'); sh(pg, '11-tezgah-mil')
    pg.click('[data-testid=mc-tab-post]')
    sel = {'pp-safeRetract': 'G53', 'pp-dwellAddress': 'P', 'pp-dwellUnit': 'ms', 'pp-cycleDwellAddress': 'P', 'pp-cycleDwellUnit': 'ms'}
    for k, v in sel.items(): pg.select_option(f'[data-f={k}]', v)
    for k, v in {'pp-safeRetractZ': '0', 'pp-cool-mist': 'M7', 'pp-cool-air': 'M51', 'pp-cool-through': 'M88', 'pp-rigidTapM': 'M29', 'pp-highSpeedOn': 'G5.1 Q1', 'pp-highSpeedOff': 'G5.1 Q0', 'pp-g541Range-min': '1', 'pp-g541Range-max': '48'}.items(): pg.fill(f'[data-f={k}]', v)
    left = pg.evaluate("[...document.querySelectorAll('.mc-ed .fld.need')].map(e=>e.dataset.row)")
    note('tezgah: doldurulduktan sonra kalan zorunlu alan:', left)
    if left: note('  kalan alan HTML:', pg.evaluate("[...document.querySelectorAll('.mc-ed .fld.need')].map(e=>e.innerText.slice(0,160)).join(' ## ')"))
    sh(pg, '12-tezgah-post')
    pg.click('[data-testid=mc-ok]'); time.sleep(.4)
    # seç
    rows = pg.locator('#modal [data-testid=mc-row]'); n = rows.count()
    rows.nth(n - 1).locator('[data-testid=mc-use]').click(); time.sleep(.3); sh(pg, '13-tezgah-secildi')
    pg.click('#modal .btn.pri'); time.sleep(.3)

def add_tool(pg, typ, name, num, dia, preset=None, extra=None):
    pg.click('[data-testid=tl-new]'); time.sleep(.3)
    pg.select_option('[data-f=tl-type]', typ); pg.fill('[data-f=tl-name]', name); pg.fill('[data-f=tl-number]', str(num)); pg.fill('[data-f=tl-lengthOffset]', str(num)); pg.fill('[data-f=tl-diaOffset]', str(num))
    pg.click('[data-testid=tl-tab-geom]'); pg.fill('[data-f=tl-dia]', str(dia))
    for k, v in (extra or {}).items(): pg.fill(f'[data-f={k}]', str(v))
    if preset:
        pg.click('[data-testid=tl-tab-presets]'); pg.click('[data-testid=preset-add]'); time.sleep(.2)
        for k, v in preset.items(): pg.fill(f'[data-f=pr-0-{k}]', str(v))
    pg.click('[data-testid=tl-ok]'); time.sleep(.3)

def add_tools(pg):
    pg.click('[data-cmd=cam-tools]'); time.sleep(.3); sh(pg, '20-takim-yonetici-bos')
    add_tool(pg, 'face', 'Yüzey frezesi Ø50', 2, 50, {'rpm': 3000, 'feedCut': 900, 'feedPlunge': 300, 'stepdown': 1, 'stepover': 35}, {'tl-flutes': 5, 'tl-fluteLen': 10, 'tl-bodyLen': 40})
    add_tool(pg, 'flat', 'Parmak freze Ø8', 4, 8, {'rpm': 8000, 'feedCut': 1200, 'feedPlunge': 400, 'stepdown': 3, 'stepover': 3}, {'tl-flutes': 3, 'tl-fluteLen': 20, 'tl-bodyLen': 45})
    add_tool(pg, 'drill', 'Matkap Ø5', 5, 5, {'rpm': 3000, 'feedCut': 300, 'feedPlunge': 300}, {'tl-flutes': 2, 'tl-fluteLen': 40, 'tl-bodyLen': 60})
    add_tool(pg, 'tap', 'Kılavuz M6', 6, 6, {'rpm': 400, 'feedCut': 400, 'feedPlunge': 400}, {'tl-pitch': '1', 'tl-flutes': 3, 'tl-fluteLen': 15, 'tl-bodyLen': 50})
    sh(pg, '21-takim-yonetici-dolu')
    note('takim satirlari:', pg.evaluate("[...document.querySelectorAll('[data-testid=tool-row]')].map(e=>e.innerText.replace(/\\n/g,' / ')).join(' || ')"))
    pg.click('#modal .btn.pri'); time.sleep(.3)


def do_setup(pg):
    pg.click('[data-cmd=cam-setup]'); time.sleep(.5)
    pg.select_option('[data-f=su-origin]', 'stockTopCenter'); time.sleep(.2); sh(pg, '30-setup-paneli')
    note('setup ozet:', pg.evaluate("document.querySelector('[data-testid=setup-summary]')?.innerText"))
    pg.click('[data-testid=panel-ok]'); time.sleep(.5); sh(pg, '31-setup-tamam')

def compute_op(pg, label, timeout=60000):
    t0 = time.time()
    pg.click('[data-testid=op-tab-passes]') if pg.locator('[data-testid=op-tab-passes]').count() else None
    pg.click('[data-testid=op-compute]')
    try:
        pg.wait_for_function("() => document.querySelector('[data-testid=op-result] .callout.ok') || document.querySelector('[data-testid=op-result] .callout.err')", timeout=timeout)
    except Exception as e:
        note(f'{label}: HESAP SONUCU GELMEDI (zaman asimi)'); return None
    dt = time.time() - t0
    res = pg.evaluate("document.querySelector('[data-testid=op-result]')?.innerText")
    note(f'{label}: hesap {dt:.1f} sn ->', res.replace('\n', ' / ')[:200]); return res

def op_face(pg):
    pg.click('[data-cmd=cam-op-face]'); time.sleep(.4)
    pg.click('[data-testid=op-tab-tool]'); pg.select_option('[data-f=op-preset]', 'Preset 1') if pg.evaluate("document.querySelector('[data-f=op-preset]').value") == '' else None
    compute_op(pg, 'Yüzey'); sh(pg, '40-yuzey-hesaplandi')
    pg.click('[data-testid=panel-ok]'); time.sleep(.4)
