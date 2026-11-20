# Hesap iptali ve bayat sonuç (WP-10 dilim 6), uçtan uca (gerçek çekirdek işçisi, gerçek uzun hesap): önce `npm run build`; çalıştır: python3 test/iptal.test.py
# Uzun hesap: 100 delikli plaka (işçide saniyeler sürer). 1) İptal: sonuç eski kalır, bayat işaretlenir, geç gelen sonuç yazılmaz, sonra çalışır.
# 2) Uzun hesap sürerken yeni düzenleme: son durum yeni düzenlemedir; uzun (eski) hesabın sonucu hiç yazılmaz (applyResult'a gelmez).
#    WP-10 bulgusu (_rebuildTask seq denetimi) master'da düzeltildi; WP-21'den beri bu denetim varsayılanda katıdır (kalır).
#    Yalnız tanı için IPTAL_KATI=0 ile 'bilinen açık' olarak yazdırılabilir.
import json, os, sys, time
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _srv
passed = failed = 0
def check(name, cond, detail=''):
    global passed, failed
    if cond: passed += 1; print('  ok   ', name)
    else: failed += 1; print('  FAIL ', name, detail)

def box(w, d, h): return {'params': [], 'features': [{'id': 'b1', 'type': 'primitive', 'name': 'Kutu', 'kind': 'box', 'x': '0', 'y': '0', 'z': '0', 'w': str(w), 'd': str(d), 'h': str(h), 'op': 'new'}]}
def plate(n=10):
    pts, ents, k = {}, [], 0
    for i in range(n):
        for j in range(n): pts[f'p{k}'] = {'x': 5 + i * 8, 'y': 5 + j * 8}; ents.append({'id': f'e{k}', 'type': 'point', 'p': f'p{k}'}); k += 1
    s = n * 8 + 2
    return {'params': [], 'features': [{'id': 'b1', 'type': 'primitive', 'name': 'Plaka', 'kind': 'box', 'x': '0', 'y': '0', 'z': '0', 'w': str(s), 'd': str(s), 'h': '20', 'op': 'new'},
        {'id': 's1', 'type': 'sketch', 'plane': {'kind': 'base', 'name': 'XY', 'offset': '20'}, 'points': pts, 'ents': ents},
        {'id': 'h1', 'type': 'hole', 'sketch': 's1', 'kind': 'simple', 'dia': '3', 'extent': 'all'}]}
HEAVY, A, B = plate(10), box(40, 30, 20), box(50, 30, 20)   # hacimler: A 24000, B 30000, plaka ~ 82*82*20 - 100 delik
vol = 'app.result && app.result.bodies[0] ? Math.round(app.result.bodies[0].volume) : null'

PORT, server = _srv.start(ROOT, ['preview'])
try:
  with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    ctx = br.new_context(viewport={'width': 1440, 'height': 900}, locale='tr-TR')
    ctx.add_init_script("if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.setItem('mihenk.lang', 'tr'); localStorage.setItem('mihenk.recoveryMs', '0'); }")
    pg = ctx.new_page(); pg.goto(f'http://127.0.0.1:{PORT}/'); pg.wait_for_function('() => window.app'); pg.evaluate('app.ready')
    # uygulanan her sonucun ilk gövde hacmini kaydet
    pg.evaluate("""() => { window.__applied = []; const o = app.applyResult.bind(app); app.applyResult = (res, prev) => { window.__applied.push(res.bodies[0] ? Math.round(res.bodies[0].volume) : null); return o(res, prev); }; }""")
    pg.evaluate(f'app.loadDoc({json.dumps(A)}, {{ name: "a.mhnk" }})'); pg.evaluate('app.whenIdle()')
    check('başlangıç: küçük belge hesaplandı (24000)', pg.evaluate(vol) == 24000, str(pg.evaluate(vol)))

    print('1: iptal')
    pg.evaluate('window.__applied = []')
    pg.evaluate(f'void (window.__p = app.loadDoc({json.dumps(HEAVY)}, {{ name: "plaka.mhnk" }}))')
    pg.wait_for_function('() => app.busy === true', timeout=20000)
    check('uzun hesap sürerken meşgul göstergesi açık', pg.evaluate('app.busy') is True)
    t0 = time.time(); pg.evaluate('app.cancelCompute()')
    check('iptal: meşgul kapandı, sonuç bayat işaretli', pg.evaluate('app.busy') is False and pg.evaluate('app.stale') is True)
    check('iptal: sonuç eski kaldı (24000)', pg.evaluate(vol) == 24000, str(pg.evaluate(vol)))
    time.sleep(8)   # uzun hesabın (yeni işçide yeniden başlamamış) geç sonuç yazması için yeterli süre
    check('iptalden sonra uzun hesabın sonucu hiç yazılmadı', pg.evaluate('window.__applied').count(None) == 0 and all(v == 24000 for v in pg.evaluate('window.__applied')), str(pg.evaluate('window.__applied')))
    check('iptalden sonra sonuç hâlâ eski', pg.evaluate(vol) == 24000)
    pg.evaluate(f'app.loadDoc({json.dumps(B)}, {{ name: "b.mhnk" }})'); pg.evaluate('app.whenIdle()')
    check('iptalden sonra yeni düzenleme çalışır (30000)', pg.evaluate(vol) == 30000, str(pg.evaluate(vol)))
    check('iptal sonrası bayat işareti kalktı', pg.evaluate('app.stale') is False)

    print('2: uzun hesap sürerken yeni düzenleme')
    pg.evaluate('window.__applied = []')
    pg.evaluate(f'void (window.__p = app.loadDoc({json.dumps(HEAVY)}, {{ name: "plaka.mhnk" }}))')
    pg.wait_for_function('() => app.busy === true', timeout=20000)
    pg.evaluate(f'app.loadDoc({json.dumps(A)}, {{ name: "a.mhnk" }})'); pg.evaluate('app.whenIdle()')
    ap = pg.evaluate('window.__applied')
    check('son durum yeni düzenleme (24000)', pg.evaluate(vol) == 24000, str(pg.evaluate(vol)))
    temiz = len(ap) > 0 and all(v == 24000 for v in ap)
    if temiz or os.environ.get('IPTAL_KATI', '1') != '0': check('uzun (eski) hesabın sonucu yazılmadı: yazılan sonuçlar yalnız yeni belge', temiz, str(ap))
    else: print('  BİLİNEN AÇIK (IPTAL_KATI=0 tanı kipi, src/ui/app.js _rebuildTask): eski uzun hesabın sonucu geçici olarak yazıldı', ap)
    br.close()
finally:
  _srv.stop(server)
print(f'iptal: {passed} geçti, {failed} kaldı'); sys.exit(1 if failed else 0)
