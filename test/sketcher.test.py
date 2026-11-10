# Sketcher testi: gerçek fare/klavye olaylarıyla (Playwright, chrome). Çalıştır: python3 test/sketcher.test.py
import json, os, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'test', 'shots'); os.makedirs(SHOTS, exist_ok=True)
PORT = 5199
passed = failed = 0

def check(name, cond, detail=''):
    global passed, failed
    if cond: passed += 1; print('  ok   ', name)
    else: failed += 1; print('  FAIL ', name, detail)

def port_open():
    s = socket.socket(); s.settimeout(0.3)
    try: s.connect(('127.0.0.1', PORT)); return True
    except OSError: return False
    finally: s.close()

server = None
if not port_open():
    server = subprocess.Popen(['npx', 'vite', '--config', 'test/vite.harness.config.js', '--port', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        if port_open(): break
        time.sleep(0.2)

try:
  with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    # Durum/ipucu metinleri Türkçe beklenir: dil tercihi sabitlenir (varsayılan dil işletim sisteminden gelir).
    ctx = br.new_context(viewport={'width': 1100, 'height': 760}, locale='tr-TR')
    ctx.add_init_script("try { localStorage.setItem('atolye.lang', 'tr'); } catch (e) {}")
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e) + ' ' + str(getattr(e, 'stack', ''))[:300]))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('response', lambda r: errs.append('HTTP %d %s' % (r.status, r.url)) if r.status >= 400 and 'favicon' not in r.url else None)
    page.goto(f'http://127.0.0.1:{PORT}/test/sketcher-harness.html')
    page.wait_for_function('window.ready === true', timeout=60000)
    ev = page.evaluate
    def idle(): ev('sk.idle()'); page.wait_for_timeout(60); ev('sk.idle()')
    def P(u, v): return ev(f'px({u},{v})')
    def move(u, v): x, y = P(u, v); page.mouse.move(x, y); 
    def click(u, v, **kw): x, y = P(u, v); page.mouse.move(x, y); page.mouse.click(x, y, **kw); idle()
    def dbl(u, v): x, y = P(u, v); page.mouse.move(x, y); page.mouse.dblclick(x, y); idle()
    def tool(t): ev(f"sk.setTool('{t}')")
    def key(k): page.keyboard.press(k); idle()
    def S(): return ev('JSON.parse(JSON.stringify(sk.sk))')
    def status(): return ev('window.statusLog[window.statusLog.length-1]')
    def regions(): return ev('findRegions(sk.sk).regions.length')
    def near(a, b, t=1e-4): return abs(a - b) < t
    def mid(lid):
        s = S(); l = next(e for e in s['ents'] if e['id'] == lid); a, b = s['points'][l['a']], s['points'][l['b']]
        return ((a['x'] + b['x']) / 2, (a['y'] + b['y']) / 2)
    def shot(n): page.screenshot(path=os.path.join(SHOTS, n))
    def lens(s, lid):
        l = next(e for e in s['ents'] if e['id'] == lid); a, b = s['points'][l['a']], s['points'][l['b']]
        return ((a['x'] - b['x']) ** 2 + (a['y'] - b['y']) ** 2) ** 0.5

    print('Sketch başlat')
    ev('begin("XY")'); idle()
    check('start: aktif ve O noktası var', ev('sk.active') and 'O' in S()['points'] and S()['points']['O']['fixed'])
    check('hooklar bağlı', ev('typeof vp.onPointer') == 'function' and ev('typeof vp.onCamera') == 'function')
    check('editGroup altında grup var', ev('vp.editGroup.children.length') == 1)

    print('Dikdörtgen')
    key('r'); check('R kısayolu dikdörtgen aracını seçer', ev('sk.tool') == 'rect')
    click(20, 10); move(80, 50); page.wait_for_timeout(100); shot('sk-rect-preview.png'); click(80, 50)
    s = S(); lines = [e for e in s['ents'] if e['type'] == 'line']
    hc = [c for c in s['cons'] if c['type'] == 'horizontal']; vc = [c for c in s['cons'] if c['type'] == 'vertical']
    check('4 çizgi', len(lines) == 4, len(lines)); check('2 yatay + 2 dikey kısıt', len(hc) == 2 and len(vc) == 2, s['cons'])
    xs = sorted(round(p['x']) for k, p in s['points'].items() if k != 'O'); ys = sorted(round(p['y']) for k, p in s['points'].items() if k != 'O')
    check('köşe koordinatları (20..80, 10..50)', xs == [20, 20, 80, 80] and ys == [10, 10, 50, 50], (xs, ys))
    check('kapalı 1 bölge', regions() == 1, regions())
    check('serbestlik derecesi bildirildi', 'Serbestlik' in (status() or ''), status())
    ids = [*s['points'].keys(), *[e['id'] for e in s['ents']], *[c['id'] for c in s['cons']]]
    check('kimlikler benzersiz', len(ids) == len(set(ids)), ids)

    print('Çizgi zinciri ve kapanma')
    key('l'); click(-60, -20); click(-20, -20); click(-40, -50); x, y = P(-60, -20); page.mouse.move(x, y); page.wait_for_timeout(50); page.mouse.click(x, y); idle()
    s = S(); ln = [e for e in s['ents'] if e['type'] == 'line'][4:]
    check('zincir 3 çizgi', len(ln) == 3, len(ln))
    check('son çizgi başlangıç noktasını paylaşır (kapandı)', len(ln) == 3 and ln[2]['b'] == ln[0]['a'])
    check('zincir kapanınca bitti', ev('sk._ln') is None)
    check('ilk çizgi otomatik yatay', any(c['type'] == 'horizontal' and c['a'] == ln[0]['id'] for c in s['cons']))
    check('3 nokta + O (yinelenen nokta yok)', len(s['points']) == 1 + 4 + 3, len(s['points']))
    check('2 kapalı bölge', regions() == 2, regions())
    # çift tıkla bitirme
    click(-90, 20); click(-80, 40); dbl(-70, 20)
    s = S(); check('çift tık zinciri bitirir', ev('sk._ln') is None and len([e for e in s['ents'] if e['type'] == 'line']) == 9, len([e for e in s['ents'] if e['type'] == 'line']))
    # sağ tık ile bitirme
    click(-90, 60); click(-70, 62); x, y = P(-50, 62); page.mouse.move(x, y); page.mouse.click(x, y, button='right'); idle()
    check('sağ tık zinciri bitirir', ev('sk._ln') is None)
    check('Esc ile zincir iptal', (click(-90, 80), key('Escape'), ev('sk._ln') is None)[2])

    print('Daire')
    key('c'); click(-30, 30); click(-20, 30)
    s = S(); ci = [e for e in s['ents'] if e['type'] == 'circle']
    check('daire r=10', len(ci) == 1 and near(ci[0]['r'], 10, 1e-3), ci)
    check('merkez noktası var', ci and ci[0]['c'] in s['points'])

    print('Yay')
    key('a'); click(-60, -70); click(-50, -70); click(-60, -60)
    s = S(); ar = [e for e in s['ents'] if e['type'] == 'arc']
    check('1 yay', len(ar) == 1)
    if ar:
        a = ar[0]; c, pa, pb = s['points'][a['c']], s['points'][a['a']], s['points'][a['b']]
        ra, rb = ((pa['x'] - c['x']) ** 2 + (pa['y'] - c['y']) ** 2) ** .5, ((pb['x'] - c['x']) ** 2 + (pb['y'] - c['y']) ** 2) ** .5
        check('yay yarıçapı 10, uçlar çember üstünde', near(ra, 10, 1e-3) and near(rb, 10, 1e-3), (ra, rb))
        check('yay saat yönü tersi (a=(-50,-70), b=(-60,-60))', near(pa['x'], -50, 1e-3) and near(pb['y'], -60, 1e-3), (pa, pb))

    print('Nokta ve snap')
    tool('point'); click(40, -60)
    s = S(); check('nokta ent', any(e['type'] == 'point' for e in s['ents']))
    key('l'); click(40, -20)  # satır başı: daireye değil; pointOn testi: dikdörtgenin alt kenarına (50,10)
    key('Escape'); tool('line'); click(42, 10); click(42, -10); key('Escape')
    s = S(); check('çizgi kenar üstünde başlayınca pointOn eklenir', any(c['type'] == 'pointOn' for c in s['cons']), s['cons'])
    ev('sk.undo()'); idle()

    print('Ölçü: çizgiye 40 mm')
    s0 = S(); rl = [e for e in s0['ents'] if e['type'] == 'line'][0]  # dikdörtgen alt kenarı (60 mm)
    before = {k: dict(v) for k, v in s0['points'].items()}
    tool('dim'); click(50, 10)
    check('ölçü giriş kutusu açıldı', ev("!!document.querySelector('.sk-input')"))
    check('kutu mevcut değerle dolu (60)', ev("document.querySelector('.sk-input').value") == '60', ev("document.querySelector('.sk-input')?.value"))
    page.keyboard.type('40'); page.keyboard.press('Enter'); idle()
    s = S(); check('ölçü kısıtı eklendi (dist)', any(c['type'] == 'dist' and c['expr'] == '40' for c in s['cons']))
    check('çizgi uzunluğu 40', near(lens(s, rl['id']), 40, 1e-3), lens(s, rl['id']))
    moved = [k for k in s['points'] if k in before and (abs(s['points'][k]['x'] - before[k]['x']) > 1e-6 or abs(s['points'][k]['y'] - before[k]['y']) > 1e-6)]
    check('nokta koordinatları değişti', len(moved) >= 1, moved)
    check('.dim etiketi görünür', ev("[...document.querySelectorAll('.dim')].some(e=>e.textContent==='40')"))
    check('kutu kapandı', ev("!document.querySelector('.sk-input')"))

    print('İfade ölçüsü')
    left = [e for e in s['ents'] if e['type'] == 'line'][3]  # sol kenar
    click(S()['points'][left['a']]['x'], (S()['points'][left['a']]['y'] + S()['points'][left['b']]['y']) / 2)
    page.keyboard.type('L/2'); page.keyboard.press('Enter'); idle()
    s = S(); check('ifade kısıtı saklandı', any(c['type'] == 'dist' and c['expr'] == 'L/2' for c in s['cons']))
    check('L=60 iken L/2 -> 30', near(lens(s, left['id']), 30, 1e-3), lens(s, left['id']))
    check('etiket "L/2 = 30"', ev("[...document.querySelectorAll('.dim')].some(e=>e.textContent==='L/2 = 30')"), ev("[...document.querySelectorAll('.dim')].map(e=>e.textContent)"))
    ev('window.vars.L = 80'); ev("sk._apply(()=>{}, {})"); idle()
    s = S(); check('parametre değişince (L=80) yeniden çözüm -> 40', near(lens(s, left['id']), 40, 1e-3), lens(s, left['id']))
    ev('window.vars.L = 60'); ev("sk._apply(()=>{}, {})"); idle()
    shot('sk-dims.png')

    print('Çelişen ölçü')
    ncons = len(S()['cons'])
    tool('hdim'); click(*mid(rl['id']))
    page.keyboard.type('25'); page.keyboard.press('Enter'); idle()
    st = status() or ''
    check('çelişen ölçü eklenmedi', len(S()['cons']) == ncons, len(S()['cons']))
    check('neden söylendi (çelişiyor)', 'çelişiyor' in st, st)
    check('geometri bozulmadı', near(lens(S(), rl['id']), 40, 1e-3))
    page.keyboard.press('Escape'); idle()
    tool('hdim'); click(*mid(rl['id'])); page.keyboard.type('40'); page.keyboard.press('Enter'); idle()
    st = status() or ''; check('gereksiz (zaten tanımlı) ölçü reddedildi', len(S()['cons']) == ncons and 'gereksiz' in st, st)
    page.keyboard.press('Escape'); idle(); tool('select')
    check('geçersiz ifade', (tool('dim'), click(*mid(rl['id'])), page.keyboard.type('abc+'), page.keyboard.press('Enter'), idle(), 'ifade' in (status() or '').lower())[-1], status())
    page.keyboard.press('Escape'); tool('select')

    print('Sürükleme')
    s = S(); tri = [e for e in s['ents'] if e['type'] == 'line'][4:7]
    cid = tri[1]['b']; cpt = s['points'][cid]  # üçgenin serbest köşesi (-40,-50)
    x, y = P(cpt['x'], cpt['y']); page.mouse.move(x, y); page.mouse.down(); idle()
    x2, y2 = P(cpt['x'] + 10, cpt['y'] - 8)
    page.mouse.move(x + 3, y + 1); page.mouse.move((x + x2) / 2, (y + y2) / 2, steps=4); page.mouse.move(x2, y2, steps=4); page.mouse.up(); idle(); idle()
    s2 = S(); np_ = s2['points'][cid]
    check('nokta sürüklendi', abs(np_['x'] - cpt['x'] - 10) < 0.5 and abs(np_['y'] - cpt['y'] + 8) < 0.5, (cpt, np_))
    check('sürükleme geri alınabilir', (ev('sk.undo()'), idle(), near(S()['points'][cid]['x'], cpt['x'], 1e-3))[2]); ev('sk.redo()'); idle()
    # çizgi sürükle: yatay kısıtlı üçgen tabanı
    base = tri[0]; pa0 = dict(S()['points'][base['a']])
    mx, my = (S()['points'][base['a']]['x'] + S()['points'][base['b']]['x']) / 2, S()['points'][base['a']]['y']
    x, y = P(mx, my); page.mouse.move(x, y); page.mouse.down(); x2, y2 = P(mx, my + 6); page.mouse.move(x2, y2, steps=5); page.mouse.up(); idle(); idle()
    pa1 = S()['points'][base['a']]
    check('çizgi sürüklendi (y +6, yatay korunur)', abs(pa1['y'] - pa0['y'] - 6) < 0.5 and near(S()['points'][base['a']]['y'], S()['points'][base['b']]['y'], 1e-3), (pa0, pa1))
    # tam tanımlı nokta sürüklenemez
    ev('sk.undo()'); idle()
    shot('sk-drag.png')

    print('Kısıt uygulama')
    ev("sk.selection=[]"); ev("sk.applyConstraint('parallel')"); idle()
    check('geçersiz seçimde Türkçe yönlendirme', 'iki çizgi' in (status() or ''), status())
    tool('select'); s = S(); ci = next(e for e in s['ents'] if e['type'] == 'circle')
    # ikinci daire + eş merkez
    tool('circle'); click(30, -50); click(38, -50); tool('select')
    s = S(); cs = [e for e in s['ents'] if e['type'] == 'circle']
    click(-20, 30); page.keyboard.down('Shift'); click(38, -50); page.keyboard.up('Shift')
    check('iki daire seçili', len(ev('sk.selection')) == 2, ev('sk.selection'))
    ev("sk.applyConstraint('concentric')"); idle(); s = S()
    check('eş merkez = merkezler çakışık', any(c['type'] == 'coincident' for c in s['cons']))
    c1, c2 = (s['points'][e['c']] for e in [e for e in s['ents'] if e['type'] == 'circle'][:2])
    check('merkezler aynı konumda', near(c1['x'], c2['x'], 1e-3) and near(c1['y'], c2['y'], 1e-3), (c1, c2))
    # fix
    click(-60, -20); ev("sk.applyConstraint('fix')"); idle()
    fixed = [k for k, p in S()['points'].items() if p.get('fixed') and k != 'O']
    check('fix: nokta sabitlendi', len(fixed) == 1, fixed)
    click(-60, -20); ev("sk.applyConstraint('fix')"); idle()
    check('fix: ikinci kez bayrağı kaldırır', not [k for k, p in S()['points'].items() if p.get('fixed') and k != 'O'])
    # eşit
    tool('select'); lns = [e for e in S()['ents'] if e['type'] == 'line']
    check('constraintsList dolu', len(ev('sk.constraintsList()')) == len(S()['cons']))
    n0 = len(S()['cons']); cl = ev('sk.constraintsList()'); victim = next(c for c in cl if c['label'].startswith('Eş') or c['label'].startswith('Çakışık'))
    # rozete tıkla silinir
    badge = f".cbadge[data-con='{victim['id']}']"
    check('rozet var', ev(f"!!document.querySelector(\"{badge}\")"))
    page.click(badge); idle()
    check('rozete tıklayınca kısıt silindi', len(S()['cons']) == n0 - 1)
    check('removeConstraint', (ev(f"sk.removeConstraint('{cl[0]['id']}')"), idle(), len(S()['cons']) == n0 - 2)[2])
    ev('sk.undo()'); ev('sk.undo()'); idle()

    print('Yapı geometrisi')
    before_r = regions(); tl = tri[0]
    mxp = (S()['points'][tl['a']]['x'] + S()['points'][tl['b']]['x']) / 2; myp = S()['points'][tl['a']]['y']
    click(mxp, myp); ev('sk.toggleConstruction()'); idle()
    s = S(); check('yapı bayrağı kondu', next(e for e in s['ents'] if e['id'] == tl['id']).get('cons') is True)
    check('yapı çizgisi profil bölgesini kapatmaz', regions() == before_r - 1, (before_r, regions()))
    page.wait_for_timeout(100); shot('sk-cons.png')
    ev('sk.toggleConstruction()'); idle()
    check('yapı geri alınır', not next(e for e in S()['ents'] if e['id'] == tl['id']).get('cons'))

    print('Silme / geri al / yinele')
    tool('select'); n_ent = len(S()['ents']); n_pt = len(S()['points'])
    cirs = [e for e in S()['ents'] if e['type'] == 'circle']; c0 = cirs[-1]; cpt0 = S()['points'][c0['c']]
    click(cpt0['x'] + c0['r'], cpt0['y'])  # sağ ucundan
    check('daire seçildi', ev('sk.selection.length') == 1 and ev('sk.selection[0].kind') == 'ent', ev('sk.selection'))
    key('Delete'); s = S()
    check('daire silindi', len(s['ents']) == n_ent - 1)
    check('yetim merkez noktası temizlendi', len(s['points']) == n_pt - 1 and c0['c'] not in s['points'], (n_pt, len(s['points'])))
    check('bağlı kısıtlar temizlendi', all(c0['id'] not in [c.get('a'), c.get('b'), c.get('c')] for c in s['cons']))
    page.keyboard.press('Control+z'); idle(); check('Ctrl+Z geri alır', len(S()['ents']) == n_ent)
    page.keyboard.press('Control+y'); idle(); check('Ctrl+Y yineler', len(S()['ents']) == n_ent - 1)
    ev('sk.undo()'); idle()
    # O silinemez
    click(0, 0); key('Delete'); check('O silinemez', 'O' in S()['points'] and 'Orijin' in (status() or ''), status())
    # dikdörtgeni sil (bir kenarı seçip sil: bağlı H/V gider, uç noktalar komşularla paylaşıldığı için kalır)
    s = S(); r2 = [e for e in s['ents'] if e['type'] == 'line'][1]; mid = ((s['points'][r2['a']]['x'] + s['points'][r2['b']]['x']) / 2, (s['points'][r2['a']]['y'] + s['points'][r2['b']]['y']) / 2)
    n_l = len([e for e in s['ents'] if e['type'] == 'line']); click(*mid); key('Delete'); s = S()
    check('çizgi silindi, komşu çizgiler duruyor', len([e for e in s['ents'] if e['type'] == 'line']) == n_l - 1)
    check('silinen çizgiye bağlı kısıtlar gitti', all(r2['id'] not in [c.get('a'), c.get('b'), c.get('c')] for c in s['cons']))
    ev('sk.undo()'); idle()

    print('Düzlem ve görsel')
    page.wait_for_timeout(150); shot('sk-final.png')
    n_ovl = ev("document.querySelectorAll('.cbadge').length"); check('rozetler gösteriliyor', n_ovl >= 3, n_ovl)

    print('stop() şeması')
    snap = S()
    out = ev('sk.stop()')
    check('stop: feature alanları korundu', out['id'] == 's1' and out['type'] == 'sketch' and out['plane']['name'] == 'XY')
    ok = True; msg = ''
    pts, ents, cons = out['points'], out['ents'], out['cons']
    if not (pts.get('O') and pts['O']['x'] == 0 and pts['O']['y'] == 0 and pts['O'].get('fixed') is True): ok = False; msg = 'O'
    for k, v in pts.items():
        if not (isinstance(v['x'], (int, float)) and isinstance(v['y'], (int, float))): ok = False; msg = 'xy ' + k
    allids = list(pts.keys()) + [e['id'] for e in ents] + [c['id'] for c in cons]
    if len(allids) != len(set(allids)): ok = False; msg = 'kimlik çakışması'
    for e in ents:
        if e['type'] == 'line' and not (e['a'] in pts and e['b'] in pts): ok = False; msg = 'line ' + e['id']
        if e['type'] == 'circle' and not (e['c'] in pts and e['r'] > 0): ok = False; msg = 'circle'
        if e['type'] == 'arc' and not all(e[k] in pts for k in 'cab'): ok = False; msg = 'arc'
        if e['type'] == 'point' and e['p'] not in pts: ok = False; msg = 'point'
        if e['type'] not in ('line', 'circle', 'arc', 'point'): ok = False; msg = 'tip'
    refs = set(pts) | {e['id'] for e in ents}
    for c in cons:
        if not all(c.get(k) in refs for k in 'abc' if c.get(k)): ok = False; msg = 'kısıt ref ' + c['id']
    allowed = {'horizontal','vertical','horizontal_pp','vertical_pp','coincident','parallel','perpendicular','equal','tangent','pointOn','midpoint','symmetric','dist','hdist','vdist','pldist','radius','diameter','angle'}
    if any(c['type'] not in allowed for c in cons): ok = False; msg = 'kısıt tipi'
    if any(c['type'] in ('dist','hdist','vdist','pldist','radius','diameter','angle') and not c.get('expr') for c in cons): ok = False; msg = 'expr'
    check('şema geçerli', ok, msg)
    check('JSON serileşebilir', json.loads(json.dumps(out)) == out)
    check('stop sonrası temiz: aktif değil, hooklar bırakıldı', not ev('sk.active') and ev('vp.onPointer') is None and ev('vp.onCamera') is None)
    check('stop sonrası editGroup ve overlay temiz', ev('vp.editGroup.children.length') == 0 and ev("document.querySelectorAll('.cbadge,.dim,.sk-ovl').length") == 0)
    check('stop null döner (etkin değilken)', ev('sk.stop()') is None)

    print('cancel() ve yeniden başlatma (XZ düzlemi, mevcut veri)')
    ev('begin("XZ", {id:"s9",type:"sketch",plane:{kind:"base",name:"XZ",offset:"0"},points:%s,ents:%s,cons:%s})' % (json.dumps(out['points']), json.dumps(out['ents']), json.dumps(out['cons']))); idle()
    page.wait_for_timeout(150); shot('sk-xz.png')
    check('mevcut sketch yüklendi', len(S()['ents']) == len(out['ents']))
    check('yüklenen sketch tam/serbest durum bildirdi', 'Serbestlik' in (status() or '') or 'Tam' in (status() or ''), status())
    ev('sk.setTool("line")'); click(0, 0); click(30, 0); ev('sk.cancel()'); idle()
    check('cancel: temiz', not ev('sk.active') and ev('vp.editGroup.children.length') == 0)

    print('K-018: dikdörtgen + daire -> Buda -> tek profil')
    ev('begin("XY")'); page.wait_for_timeout(100); idle()
    tool('rect'); click(-40, -10); click(0, 10)
    tool('circle'); click(0, 0); click(8, 0)
    s = S(); check('dikdörtgen (4 çizgi) + daire çizildi', len([e for e in s['ents'] if e['type'] == 'line']) == 4 and len([e for e in s['ents'] if e['type'] == 'circle']) == 1)
    check('üst üste çizimde 3 ayrı bölge', regions() == 3, regions())
    tool('trim'); move(-8, 0); page.wait_for_timeout(80)
    check('budama: kırmızı önizleme aralığı hesaplandı', ev('!!(sk._ed && sk._ed.span && sk._ed.span.pts.length > 1)'))
    check('budama: kırmızı çizgi sahnede', ev('sk.gPrev.children.some(c => c.material && c.material.color.getHex() === 0xd32f2f)'))
    click(-8, 0)
    s = S(); check('daire yaya dönüştü', any(e['type'] == 'arc' for e in s['ents']) and not any(e['type'] == 'circle' for e in s['ents']))
    move(0, 3); click(0, 3)
    s = S(); a = ev('findRegions(sk.sk).regions.map(r => r.net)')
    import math
    check('tek kapalı profil', len(a) == 1, a)
    check('alan = 800 + 32π', len(a) == 1 and abs(a[0] - (800 + 32 * math.pi)) < 1e-3, a)
    check('budama sonrası çözüm tamam', ev('sk.lastSolve && sk.lastSolve.ok'))
    check('durum satırı kaldırılan kısıtı bildiriyor ya da çözüm bilgisi var', bool(status()))
    shot('sk-trim-k018.png')
    ev('sk.undo()'); idle(); ev('sk.undo()'); idle()
    check('iki geri alma: 3 bölgeye döner', regions() == 3, regions())
    # sürükleyerek çoklu budama
    ev('begin("XY")'); page.wait_for_timeout(100); idle()
    tool('rect'); click(-30, -20); click(30, 20)
    tool('line'); click(-40, 0); click(40, 0); key('Escape')
    tool('line'); click(0, -30); click(0, 30); key('Escape')
    tool('trim'); x0, y0 = P(-35, 0); page.mouse.move(x0, y0); page.mouse.down()
    for (u, v) in [(-15, 0), (-5, 0), (0, 10), (0, 25), (0, 35)]:
        x, y = P(u, v); page.mouse.move(x, y, steps=4)
    page.mouse.up(); idle(); page.wait_for_timeout(200); idle()
    n_lines = len([e for e in S()['ents'] if e['type'] == 'line'])
    check('sürükleyerek budama birden çok parçayı sildi', n_lines < 10, n_lines)

    real_errs = [e for e in errs if 'favicon' not in e]
    check('konsolda hata yok', not real_errs, real_errs[:3])
    br.close()
finally:
    if server: server.terminate()
print(f'\n{passed} geçti, {failed} kaldı')
sys.exit(1 if failed else 0)
