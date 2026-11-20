# Sketcher testi: gerçek fare/klavye olaylarıyla (Playwright, chrome). Çalıştır: python3 test/sketcher.test.py
import json, os, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'test', 'shots'); os.makedirs(SHOTS, exist_ok=True)
passed = failed = 0

def check(name, cond, detail=''):
    global passed, failed
    if cond: passed += 1; print('  ok   ', name)
    else: failed += 1; print('  FAIL ', name, detail)


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _srv
PORT, server = _srv.start(ROOT, ['--config', 'test/vite.harness.config.js'])  # her koşu kendi boş portunda kendi sunucusunu açar (test/_srv.py)

try:
  with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    # Durum/ipucu metinleri Türkçe beklenir: dil tercihi sabitlenir (varsayılan dil işletim sisteminden gelir).
    ctx = br.new_context(viewport={'width': 1400, 'height': 860}, locale='tr-TR')
    ctx.add_init_script("const _ce = console.error; console.error = (...a) => { _ce(a.join(' ') + ' @@ ' + new Error().stack.split('\\n').slice(2,8).join(' | ')); };")
    ctx.add_init_script("try { localStorage.setItem('mihenk.lang', 'tr'); } catch (e) {}")
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
    check('budama: kırmızı çizgi sahnede', ev('sk.gPrev.children.some(c => c.material && c.material.color.getHexString() === getComputedStyle(document.documentElement).getPropertyValue("--vp-sk-error").trim().replace("#", "").toLowerCase())'))
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

    def fresh():
        ev('begin("XY")'); page.wait_for_timeout(80); idle()
    def line(a, b):
        tool('line'); click(*a); click(*b); key('Escape')
    def ents(t): return [e for e in S()['ents'] if e['type'] == t]
    def real(t): return [e for e in ents(t) if not e.get('cons')]
    def P_(s, pid): return (s['points'][pid]['x'], s['points'][pid]['y'])

    print('Kimlik kalıcılığı')
    fresh(); line((-30, 0), (10, 0))
    id1 = ents('line')[0]['id']
    ev('sk._setSel([{kind:"ent", id:"%s"}])' % id1); idle(); key('Delete')
    check('çizgi silindi', len(ents('line')) == 0)
    line((-30, 0), (10, 0))
    id2 = ents('line')[0]['id']
    check('sil -> yeniden çiz: kimlik farklı (yeniden kullanılmaz)', id1 != id2, (id1, id2))
    s_ = S(); seq0 = s_.get('seq')
    check('sayaç sketch içinde saklanıyor', ev('typeof sk.sk.seq') == 'number', seq0)

    print('Uzat')
    fresh(); line((-30, 0), (10, 0)); line((30, -20), (30, 20))
    tool('extend'); click(8, 0)
    s = S(); l = ents('line')[0]
    check('uzat: uç dikey çizgiye ulaştı', near(P_(s, l['b'])[0], 30, 1e-3), P_(s, l['b']))

    print('Böl')
    fresh(); line((-20, 0), (20, 0))
    tool('break'); click(5, 0)
    check('böl: iki çizgi', len(ents('line')) == 2, len(ents('line')))

    print('Ofset')
    fresh(); line((-20, 0), (20, 0))
    tool('offset'); click(-10, 0)
    check('ofset: iletişim kutusu açıldı', ev("!!document.querySelector('.sk-dlg')"))
    page.fill('.sk-dlg [data-k=dist]', '5'); page.wait_for_timeout(80)
    click(0, 12)
    s = S(); ls = ents('line')
    ys = sorted(round(P_(s, e['a'])[1], 4) for e in ls)
    check('ofset: 5 mm yukarıda yeni çizgi', len(ls) == 2 and ys == [0, 5], ys)
    check('ofset: paralel + mesafe ölçüsü bağlı', any(c['type'] == 'parallel' for c in s['cons']) and any(c['type'] == 'pldist' for c in s['cons']), s['cons'])

    print('Köşe yuvarlat / Pah')
    fresh(); tool('line'); click(-30, 0); click(0, 0); click(0, 30); key('Escape')
    tool('fillet'); page.fill('.sk-dlg [data-k=val]', '5'); click(0, 0)
    s = S(); check('yuvarlat: yay + yarıçap ölçüsü', len(ents('arc')) == 1 and any(c['type'] == 'radius' for c in s['cons']), s['cons'])
    fresh(); tool('line'); click(-30, 0); click(0, 0); click(0, 30); key('Escape')
    tool('chamfer'); page.fill('.sk-dlg [data-k=val]', '5'); click(0, 0)
    check('pah: üçüncü çizgi', len(ents('line')) == 3, len(ents('line')))

    print('Ayna')
    fresh(); line((0, -30), (0, 30)); tool('circle'); click(20, 0); click(25, 0)
    tool('mirror'); click(25, 0)
    page.click('.sk-dlg [data-act=sk-dlg-ok]'); page.wait_for_timeout(60)
    click(0, 20)
    s = S(); cs = ents('circle')
    check('ayna: ikinci daire karşı tarafta', len(cs) == 2 and sorted(round(P_(s, c['c'])[0], 3) for c in cs) == [-20, 20], [P_(s, c['c']) for c in cs])
    check('ayna: simetri kısıtı', any(c['type'] == 'symmetric' for c in s['cons']))

    print('Dikdörtgen desen')
    fresh(); tool('circle'); click(-30, 0); click(-25, 0)
    tool('patrect'); click(-25, 0)
    page.fill('.sk-dlg [data-k=n1]', '3'); page.fill('.sk-dlg [data-k=s1]', '20'); page.click('.sk-dlg [data-act=sk-dlg-ok]'); idle(); page.wait_for_timeout(200); idle()
    s = S(); xs = sorted(round(P_(s, c['c'])[0], 3) for c in ents('circle'))
    check('desen: 3 daire 20 mm aralıkla', xs == [-30, -10, 10], xs)

    print('Taşı / Döndür')
    fresh(); line((10, 5), (30, 5))
    tool('move'); click(20, 5); page.fill('.sk-dlg [data-k=dx]', '10'); page.fill('.sk-dlg [data-k=dy]', '5'); page.click('.sk-dlg [data-act=sk-dlg-ok]'); idle(); page.wait_for_timeout(120)
    s = S(); l = ents('line')[0]
    check('taşı: (20,10)', near(P_(s, l['a'])[0], 20, 1e-3) and near(P_(s, l['a'])[1], 10, 1e-3), P_(s, l['a']))

    print('Kutuyla seçim, Ctrl+A/C/V')
    fresh(); line((-40, 0), (-20, 0)); line((20, 0), (40, 0))
    tool('select')
    x0, y0 = P(-50, 10); x1, y1 = P(-10, -10)
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=6); page.mouse.up(); idle()
    check('soldan sağa: tamamen içindeki 1 çizgi', len([x for x in ev('sk.selection') if x['kind'] == 'ent']) == 1, ev('sk.selection'))
    x0, y0 = P(10, 10); x1, y1 = P(30, -10)
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=6); page.mouse.up(); idle()
    check('soldan sağa: kısmen içindeki seçilmez', len([x for x in ev('sk.selection') if x['kind'] == 'ent']) == 0, ev('sk.selection'))
    x0, y0 = P(30, 10); x1, y1 = P(10, -10)
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=6); page.mouse.up(); idle()
    check('sağdan sola: değen çizgi seçilir', len([x for x in ev('sk.selection') if x['kind'] == 'ent']) == 1, ev('sk.selection'))
    key('Control+a'); check('Ctrl+A: hepsi seçili', len([x for x in ev('sk.selection') if x['kind'] == 'ent']) == 2)
    key('Control+c'); key('Control+v'); page.wait_for_timeout(200); idle()
    check('Ctrl+C/V: 4 çizgi', len(ents('line')) == 4, len(ents('line')))
    key('Control+a'); key('Control+x'); page.wait_for_timeout(100); idle()
    check('Ctrl+X: kesildi', len(ents('line')) == 0, len(ents('line')))
    key('Control+v'); page.wait_for_timeout(200); idle()
    check('kesilen yapıştırıldı', len(ents('line')) == 4, len(ents('line')))

    print('Yeni çizim komutları')
    fresh(); tool('rectc'); click(10, 10); click(30, 20)
    s = S(); xs = sorted(P_(s, e['a'])[0] for e in ents('line'))
    check('merkez dikdörtgen: 4 çizgi (+ yapı köşegeni), x aralığı -10..30', len(real('line')) == 4 and near(min(xs), -10, 1e-3) and near(max(xs), 30, 1e-3), xs)
    fresh(); tool('rect3'); click(-20, 0); click(20, 0); click(20, 20)
    check('3 nokta dikdörtgen: 4 çizgi', len(ents('line')) == 4, len(ents('line')))
    fresh(); tool('circle2'); click(-20, 0); click(20, 0)
    c = ents('circle'); check('2 nokta daire: r=20', len(c) == 1 and near(c[0]['r'], 20, 1e-3), c)
    fresh(); tool('circle3'); click(-10, 0); click(10, 0); click(0, 10)
    c = ents('circle'); check('3 nokta daire: r=10', len(c) == 1 and near(c[0]['r'], 10, 1e-3), c)
    fresh(); tool('arc3'); click(-20, 0); click(0, 20); click(20, 0)
    check('3 nokta yay', len(ents('arc')) == 1)
    fresh(); line((-30, 0), (0, 0)); tool('arct'); click(0, 0); click(20, 20)
    s = S(); check('teğet yay + teğet kısıtı', len(ents('arc')) == 1 and any(c['type'] == 'tangent' for c in s['cons']), s['cons'])
    fresh(); ev('sk.opts.polySides = 6'); tool('polygon'); click(0, 0); click(20, 0)
    check('çokgen: 6 kenar', len(ents('line')) == 6, len(ents('line')))
    fresh(); tool('slot'); click(-20, 0); click(20, 0); click(20, 5)
    check('kanal: 2 çizgi + 2 yay', len(real('line')) == 2 and len(ents('arc')) == 2, (len(real('line')), len(ents('arc'))))
    fresh(); tool('ellipse'); click(0, 0); click(20, 0); click(0, 10)
    check('elips', len(ents('ellipse')) == 1)
    check('elips profil bölgesi', regions() == 1, regions())
    fresh(); tool('spline'); click(-30, 0); click(-10, 15); click(10, -15); click(30, 0); key('Enter')
    check('eğri: 4 noktalı spline', len(ents('spline')) == 1 and len(ents('spline')[0]['pts']) == 4, ents('spline'))
    fresh(); tool('line'); click(-30, 0); click(0, 0); key('a'); click(20, 20); key('l'); click(40, 20); key('Escape')
    check('zincirde çizgi↔yay geçişi: 2 çizgi + 1 yay', len(ents('line')) == 2 and len(ents('arc')) == 1, (len(ents('line')), len(ents('arc'))))
    shot('sk-new-tools.png')

    print('Sayısal giriş ve bağlam menüsü')
    fresh(); tool('line'); click(-30, 0); move(0, 5)
    page.keyboard.type('25'); page.keyboard.press('Tab'); page.keyboard.type('90'); page.keyboard.press('Enter'); idle(); page.wait_for_timeout(300); idle()
    s = S(); l = ents('line')
    check('sayısal giriş: 25 mm dikey çizgi + ölçü kısıtı', len(l) == 1 and near(lens(s, l[0]['id']), 25, 1e-3) and any(c['type'] == 'dist' for c in s['cons']), (l, s['cons']))
    key('Escape')
    fresh(); tool('select'); line((-20, 0), (20, 0)); tool('select'); click(10, 0)
    x, y = P(10, 0); page.mouse.click(x, y, button='right'); page.wait_for_timeout(100)
    check('sağ tık menüsü açıldı', ev("!!document.querySelector('.sk-ctx')"))
    labels = ev("[...document.querySelectorAll('.sk-ctx button')].map(b => b.dataset.act)")
    check('menüde bitir/sil/yapı/kısıtlar', all(a in labels for a in ['ctx-finish', 'ctx-delete', 'ctx-construction', 'ctx-constraints']), labels)
    page.click('.sk-ctx [data-act=ctx-construction]'); idle()
    check('sağ tık: yapı geometrisi yapıldı', ents('line')[0].get('cons') is True)
    page.mouse.click(*P(10, 0), button='right'); page.wait_for_timeout(100)
    page.click('.sk-ctx [data-act=ctx-delete]'); idle()
    check('sağ tık: silindi', len(ents('line')) == 0)

    print('Kısıt ve ölçüler')
    def apply_c(t_):
        ev(f"sk.applyConstraint('{t_}')"); idle(); page.wait_for_timeout(120); idle()
    def sel_ids(ids):
        ev('(l) => sk._setSel(l)', [{'kind': 'ent', 'id': i} for i in ids])
    fresh(); line((-30, 10), (-10, 12)); line((10, 8), (30, 20))
    ids = [e['id'] for e in ents('line')]; sel_ids(ids); apply_c('collinear')
    s = S(); check('doğrusal kısıt eklendi ve çözüldü', any(c['type'] == 'collinear' for c in s['cons']) and ev('sk.lastSolve.ok'), s['cons'])
    fresh(); tool('circle'); click(-20, 0); click(-10, 0); tool('circle'); click(20, 0); click(30, 0)
    ids = [e['id'] for e in ents('circle')]; sel_ids(ids); apply_c('concentric')
    s = S(); cs = ents('circle'); check('eş merkez: daire merkezleri çakıştı', P_(s, cs[0]['c']) == P_(s, cs[1]['c']) or near(P_(s, cs[0]['c'])[0], P_(s, cs[1]['c'])[0], 1e-6))
    fresh(); tool('ellipse'); click(0, 0); click(30, 0); click(0, 10); line((-40, 25), (40, 25))
    e = ents('ellipse')[0]['id']; l = ents('line')[0]['id']; sel_ids([e, l]); apply_c('tangent')
    s = S(); check('çizgi-elips teğet kısıtı çözüldü', any(c['type'] == 'tangent' for c in s['cons']) and ev('sk.lastSolve.ok'), s['cons'])
    fresh(); tool('circle'); click(-20, 0); click(-10, 0); tool('circle'); click(20, 0); click(25, 0)
    ids = [e['id'] for e in ents('circle')]; sel_ids(ids); apply_c('equal')
    s = S(); cs = ents('circle'); check('eşit daire yarıçapı', near(cs[0]['r'], cs[1]['r'], 1e-4), [c['r'] for c in cs])
    # ölçü: yarıçap aracı (gerçek fare + klavye)
    tool('rdim'); click(-10, 0); page.keyboard.type('7'); page.keyboard.press('Enter'); idle(); page.wait_for_timeout(250); idle()
    s = S(); cs = ents('circle'); check('yarıçap ölçüsü: iki daire de r=7 (eşit kısıt)', all(near(c['r'], 7, 1e-3) for c in cs) and any(c['type'] == 'radius' for c in s['cons']), [c['r'] for c in cs])
    # çap ölçüsü
    fresh(); tool('circle'); click(0, 20); click(10, 20)
    tool('ddim'); click(10, 20); page.keyboard.type('30'); page.keyboard.press('Enter'); idle(); page.wait_for_timeout(250); idle()
    check('çap ölçüsü: r=15', near(ents('circle')[0]['r'], 15, 1e-3), ents('circle')[0]['r'])
    # iki paralel çizgi arası ölçü
    fresh(); line((-30, 0), (30, 0)); line((-30, 20), (30, 20))
    ids = [e['id'] for e in ents('line')]; sel_ids(ids); apply_c('parallel')
    tool('dim'); click(10, 0); click(10, 20); page.wait_for_timeout(150)
    page.keyboard.type('12'); page.keyboard.press('Enter'); idle(); page.wait_for_timeout(250); idle()
    s = S(); check('paralel çizgi arası ölçü (lldist) = 12', any(c['type'] == 'lldist' for c in s['cons']), s['cons'])
    # daire merkezleri arası
    fresh(); tool('circle'); click(-20, 0); click(-10, 0); tool('circle'); click(20, 0); click(25, 0)
    tool('dim'); click(-10, 0); click(25, 0); page.wait_for_timeout(150)
    page.keyboard.type('60'); page.keyboard.press('Enter'); idle(); page.wait_for_timeout(250); idle()
    s = S(); cs = ents('circle'); check('merkezler arası ölçü (ccdist)', any(c['type'] == 'ccdist' for c in s['cons']) and near(abs(P_(s, cs[0]['c'])[0] - P_(s, cs[1]['c'])[0]), 60, 1e-3), s['cons'])
    # referans ölçü ve çelişen kısıt listesi
    cid = next(c['id'] for c in S()['cons'] if c['type'] == 'ccdist')
    ev(f"sk.toggleReference('{cid}')"); idle(); page.wait_for_timeout(200)
    check('referans ölçü: sürücü değil (ref bayrağı) ve çözüm tamam', next(c for c in S()['cons'] if c['id'] == cid).get('ref') is True and ev('sk.lastSolve.ok'))
    check('referans etiket parantezli', ev("[...document.querySelectorAll('.dim.ref')].some(d => /^\\(.*\\)$/.test(d.textContent))"))
    # nesne başına serbestlik
    fresh(); line((-30, 0), (30, 0))
    tool('select'); l_ = ents('line')[0]['id']; sel_ids([l_]); apply_c('horizontal')
    ev("sk.applyConstraint('fix')") if False else None
    page.wait_for_timeout(500); idle()
    fr = ev('sk.free ? {pts: [...sk.free.freePts], ents: [...sk.free.freeEnts]} : null')
    check('nesne başına serbestlik bilgisi hesaplandı (serbest çizgi mavi)', fr is not None and l_ in fr['ents'], fr)
    sel_ids([l_]); ev("sk.applyConstraint('fix')"); idle(); page.wait_for_timeout(600); idle()
    fr = ev('sk.free ? {pts: [...sk.free.freePts], ents: [...sk.free.freeEnts]} : null')
    check('sabitlenince çizgi tam tanımlı (koyu)', fr is not None and l_ not in fr['ents'], fr)

    print('DXF (arayüz bağlantısı)')
    fresh(); tool('rect'); click(-30, -10); click(10, 10); tool('circle'); click(30, 0); click(36, 0); tool('ellipse'); click(-20, 30); click(-5, 30); click(-20, 38)
    exp = ev("sk.exportDxf('2000')")
    check('DXF dışa aktarma: nesne sayısı ve ELLIPSE', exp['count'] == 6 and 'ELLIPSE' in exp['text'], exp['count'])
    exp12 = ev("sk.exportDxf('R12')"); check('DXF R12: ELLIPSE yok, POLYLINE var', 'ELLIPSE' not in exp12['text'] and 'POLYLINE' in exp12['text'])
    before = ev('findRegions(sk.sk).regions.reduce((a, r) => a + r.net, 0)')
    fresh()
    r = ev("(async (txt) => { const rep = await sk.importDxf(parseDxf(txt), 1); return {ok: rep.ok, n: rep.rep.count}; })", exp['text'])
    idle(); page.wait_for_timeout(200); idle()
    after = ev('findRegions(sk.sk).regions.reduce((a, r) => a + r.net, 0)')
    check('DXF içe aktarma sonrası alan aynı', r['ok'] and abs(before - after) < 1e-3, (before, after, r))
    check('DXF içe aktarma çözüldü (kısıtsız, serbest)', ev('sk.lastSolve && sk.lastSolve.ok'))

    print('WP-04 dilim 2: C-01, C-02, C-07, C-08, pah ölçüsü')
    # C-01: daireyi çizerken yazılan yarıçap ölçü kısıtı ekler
    fresh(); tool('circle'); click(0, 0); move(10, 0); page.keyboard.type('8'); page.keyboard.press('Enter'); idle(); page.wait_for_timeout(300); idle()
    s = S(); ci = ents('circle'); rc = [c for c in s['cons'] if c['type'] == 'radius']
    check('C-01: yazılan yarıçap ölçü kısıtı ekledi (radius, ifade 8)', len(ci) == 1 and near(ci[0]['r'], 8, 1e-3) and len(rc) == 1 and str(rc[0].get('expr')) == '8', (ci, s['cons']))
    check('C-01: yarıçap yazılınca başarısızlık iletisi yok', 'sk.num.failed' not in str(status()) and 'başarısız' not in (status() or '').lower(), status())
    # C-02: ölçü etiketi bir noktanın üstünde dururken o noktaya tıklamak noktayı seçer
    fresh(); line((-20, 0), (20, 0)); tool('select')
    ev("(() => { const l = sk.sk.ents.find((e) => e.type === 'line'); sk._apply(() => { sk._addCon('dist', l.a, l.b, { expr: '40' }); }, { kind: 'x' }); })()"); idle(); page.wait_for_timeout(250); idle()
    dc = next((c for c in S()['cons'] if c['type'] == 'dist'), None)
    check('C-02 önkoşul: çizgiye uzunluk ölçüsü eklendi', dc is not None, S()['cons'])
    if dc:
        ln = ents('line')[0]; pa = S()['points'][ln['b']]
        ev("(a) => { const id = a[0], p = a[1]; const el = sk._ovEls.find((e) => e.dataset.con === id); const b = el._base; sk._apply((q) => { const k = q.cons.find((x) => x.id === id); k.lo = [p.x - b[0], p.y - b[1]]; }, { kind: 'x' }); }", [dc['id'], pa]); idle(); page.wait_for_timeout(200); idle()
        tool('select'); x, y = P(pa['x'], pa['y'])
        on_label = ev(f"(() => {{ const e = document.elementFromPoint({x}, {y}); return e && e.dataset ? (e.dataset.con || null) : null; }})()")
        check('C-02 önkoşul: etiket noktanın tam üstünde', on_label == dc['id'], on_label)
        page.mouse.move(x, y); page.mouse.click(x, y); idle()
        sel = ev('sk.selection.map((s) => s.kind + ":" + s.id)')
        check('C-02: etiketin altındaki noktaya tıklamak noktayı seçer', ('point:' + ln['b']) in sel, sel)
        lo0 = next(c for c in S()['cons'] if c['id'] == dc['id'])['lo']
        page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + 30, y + 30, steps=4); page.mouse.up(); idle(); page.wait_for_timeout(150)
        lo1 = next(c for c in S()['cons'] if c['id'] == dc['id'])['lo']
        check('C-02: etiket yine sürüklenebilir', lo1 != lo0, (lo0, lo1))
    # C-07: p kısayolu (küçük/büyük harf ve Latin olmayan düzende fiziksel tuş)
    fresh(); key('p'); check('C-07: küçük "p" nokta aracını seçer', ev('sk.tool') == 'point', ev('sk.tool'))
    tool('select'); key('Shift+P'); check('C-07: Shift+P nokta aracını seçer', ev('sk.tool') == 'point', ev('sk.tool'))
    tool('select'); r = ev("sk.handleKey({ key: 'з', code: 'KeyP', target: document.body, preventDefault() {} })")
    check('C-07: Latin olmayan düzende (KeyP) nokta aracı seçilir', r is True and ev('sk.tool') == 'point', (r, ev('sk.tool')))
    # C-08: sağ tık menüsünde yapı geçişi her zaman var; açık profil uyarısı yapı çizgisini saymaz
    fresh(); tool('select'); page.mouse.click(*P(0, 30), button='right'); page.wait_for_timeout(100)
    labels = ev("[...document.querySelectorAll('.sk-ctx button')].map(b => b.dataset.act)")
    check('C-08: hiçbir şey seçili değilken de menüde yapı geçişi var (etkin)', 'ctx-construction' in labels and ev("!document.querySelector('.sk-ctx [data-act=ctx-construction]').disabled"), labels)
    page.click('.sk-ctx [data-act=ctx-construction]'); idle()
    check('C-08: boş alanda yapı geçişi yapı çizim kipini açar', ev('sk.consMode') is True)
    ev('sk.consMode = false')
    fresh(); tool('rect'); click(-20, -10); click(20, 10); line((30, 30), (50, 40))
    rep = ev('sk.exitReport()')
    check('C-08 önkoşul: dışarıda duran serbest çizgi açık profil uyarısı verir', any('açık profil' in r for r in rep), rep)
    tool('select'); click(40, 35); page.mouse.click(*P(40, 35), button='right'); page.wait_for_timeout(100)
    page.click('.sk-ctx [data-act=ctx-construction]'); idle()
    rep = ev('sk.exitReport()')
    check('C-08: çizgi yapıya çevrilince açık profil uyarısı kalkar', not any('açık profil' in r for r in rep), rep)
    # pah ölçü kısıtı (iletişim kutusundaki varsayılan kol 5 mm)
    fresh(); tool('rect'); click(-20, -10); click(20, 10)
    tool('chamfer'); idle(); click(20, 10); idle(); page.wait_for_timeout(300); idle()
    s = S(); dc = [c for c in s['cons'] if c['type'] == 'dist']
    plain = [e for e in s['ents'] if e['type'] == 'line' and not any(c.get('a') == e['id'] for c in s['cons'] if c['type'] in ('horizontal', 'vertical'))]
    check('pah: köşeye tıklayınca pah çizgisi + uzunluk ölçüsü (dist) eklendi', len(plain) == 1 and len(dc) == 1, (len(plain), s['cons']))
    if plain and dc: check('pah ölçüsü pah çizgisi uzunluğuna eşit (5 mm kol → 7,0711)', near(lens(s, plain[0]['id']), 5 * 2 ** 0.5, 1e-3) and near(lens(s, plain[0]['id']), float(dc[0]['expr']), 1e-3), (lens(s, plain[0]['id']), dc[0]))

    # ---------------------------------------------------------------- WP-09 dilim 1: yakalama
    print('WP-09 dilim 1: hizalama izi, çeyrek nokta, yakalama filtresi, ızgara aralığı')
    def snap_reset(): ev("(() => { ['end','center','origin','mid','quad','int','tan','perp','ent','align','grid'].forEach((k) => sk.setSnapKind(k, true)); sk.setGridStep(1); })()")
    def hover(u, v, dx=0, dy=0): x, y = P(u, v); page.mouse.move(x + dx, y + dy); page.wait_for_timeout(40)
    def cur(): return ev('sk.cursor ? { kind: sk.cursor.kind, x: sk.cursor.x, y: sk.cursor.y, qi: sk.cursor.qi, n: (sk.cursor.refs || []).length } : null')
    def dashed(): return ev("sk.gPrev.children.filter((c) => c.material.type === 'LineDashedMaterial').map((c) => Array.from(c.geometry.attributes.position.array))")
    snap_reset(); fresh()
    ev("sk._apply((q) => { const p = sk._newPt(20.5, 10.25); sk._addEnt({ type: 'point', p }); const r = sk._newPt(-40.5, -30.25); sk._addEnt({ type: 'point', p: r }); })"); idle()
    tool('line'); click(-30, -40)
    hover(20.5, -22.37, 2, 0); c = cur()
    check('hizalama: başka noktayla dikey hizada imleç o x değerine oturur (20.5, ızgara 21 değil)', c and c['kind'] == 'align' and c['x'] == 20.5 and c['y'] == -22, c)
    d = dashed()
    check('hizalama: referans noktadan imlece kesikli iz çizilir', any(len(v) == 6 and v[0] == 20.5 and v[1] == 10.25 and v[3] == 20.5 and v[4] == -22 for v in d), d)
    hover(-60.4, 10.25, 0, 2); c = cur()
    check('hizalama: yatay hizada y değerine oturur (10.25)', c and c['kind'] == 'align' and c['y'] == 10.25 and c['x'] == -60, c)
    hover(20.5, -30.25, 1, 1); c = cur()
    check('hizalama: iki noktayla aynı anda hizalanınca (x biri, y diğeri) iki iz ve kesişim noktası', c and c['kind'] == 'align' and c['x'] == 20.5 and c['y'] == -30.25 and c['n'] == 2 and len(dashed()) == 2, (c, dashed()))
    click(20.5, -22.37, ) if False else None
    x, y = P(20.5, -22.37); page.mouse.move(x + 2, y); page.mouse.click(x + 2, y); idle()
    ln = ents('line')[-1]; pb = S()['points'][ln['b']]
    check('hizalama: tıklanan uç nokta tam hizada (x=20.5, y=-22)', pb['x'] == 20.5 and pb['y'] == -22, pb)
    key('Escape')
    ev("sk.setSnapKind('align', false)"); tool('line'); click(-30, -40); hover(20.5, -8.37, 2, 0); c = cur()
    check('hizalama kapalıyken ızgaraya düşer (x=21)', c and c['kind'] == 'grid' and c['x'] == 21 and not dashed(), (c, dashed()))
    key('Escape'); snap_reset()
    # çeyrek nokta
    fresh(); tool('circle'); click(-50, 30); click(-35, 30); tool('line'); click(-80, -40)
    hover(-50, 45, 2, 2); c = cur()
    check('çeyrek nokta: dairenin 90° noktası yakalanır', c and c['kind'] == 'quad' and c['qi'] == 1 and near(c['x'], -50) and near(c['y'], 45), c)
    hover(-65, 30, -2, 1); c = cur()
    check('çeyrek nokta: 180° noktası', c and c['kind'] == 'quad' and c['qi'] == 2 and near(c['x'], -65) and near(c['y'], 30), c)
    hover(-50 + 15 * 0.7071, 30 + 15 * 0.7071, 1, 1); c = cur()
    check('çeyrek nokta: 45° konumunda çeyrek nokta yok (nesne üstü)', c and c['kind'] == 'ent', c)
    hover(-50, 45, 2, 2); x, y = P(-50, 45); page.mouse.click(x + 2, y + 2); idle()
    s = S(); ln = ents('line')[-1]; pid = ln['b'] if ln['b'] in s['points'] and abs(s['points'][ln['b']]['y'] - 45) < 1e-6 else None
    circ = ents('circle')[0]
    cq = [c for c in s['cons'] if c['type'] == 'pointOn' and c['b'] == circ['id']]
    cv = [c for c in s['cons'] if c['type'] == 'vertical_pp' and circ['c'] in (c.get('a'), c.get('b'))]
    check('çeyrek nokta: tıklanan nokta daire üstünde ve merkezle dikey hizalı kısıtlandı', pid is not None and any(c['a'] == pid for c in cq) and any(pid in (c.get('a'), c.get('b')) for c in cv), (pid, cq, cv))
    key('Escape')
    ev("sk._apply((q) => { sk._addCon('radius', '%s', undefined, { expr: '20' }); }, { strict: true })" % circ['id']); idle()
    s2 = S(); p2 = s2['points'].get(pid); cc = s2['points'][circ['c']]; r2 = next(e for e in s2['ents'] if e['id'] == circ['id'])['r']
    check('çeyrek nokta: yarıçap 20 olunca nokta hâlâ daire üstünde ve merkezle dikey hizalı', near(r2, 20) and near(p2['x'], cc['x'], 1e-4) and near(((p2['x'] - cc['x']) ** 2 + (p2['y'] - cc['y']) ** 2) ** 0.5, 20, 1e-4) and p2['y'] > cc['y'], (p2, cc, r2))
    # yarım yay: yalnız süpürme içindeki çeyrek nokta
    fresh(); tool('arc'); click(0, -20); click(30, -20); click(-30, -20); tool('line'); click(60, 40)
    hover(0, 10, 2, -1); c = cur()
    check('çeyrek nokta: yarım yayın 90° noktası yakalanır', c and c['kind'] == 'quad' and c['qi'] == 1 and near(c['y'], 10), c)
    hover(0, -50, 2, 0); c = cur()
    check('çeyrek nokta: yayın süpürmesi dışındaki 270° noktası yakalanmaz', not c or c['kind'] != 'quad', c)
    key('Escape')
    # yakalama filtresi (arayüz) ve kalıcılık
    fresh(); snap_reset(); tool('circle'); click(-50, 30); click(-35, 30); tool('line'); click(-80, -40)
    page.click('.sk-cf .cf-btn'); page.wait_for_timeout(50)
    check('ayarlar paneli açılır (aria-expanded)', ev("document.querySelector('.sk-cf .cf-btn').getAttribute('aria-expanded')") == 'true' and ev("!!document.querySelector('.sk-cf .pop [data-cf=snap-quad]')"))
    page.click('.sk-cf [data-cf=snap-quad]'); page.wait_for_timeout(50)
    hover(-50, 45, 2, 2); c = cur()
    check('yakalama filtresi: çeyrek nokta kapatılınca yakalanmaz', c and c['kind'] != 'quad', c)
    page.click('.sk-cf [data-cf=snap-quad]'); page.wait_for_timeout(50); hover(-50, 45, 2, 1); c = cur()
    check('yakalama filtresi: yeniden açılınca yakalanır', c and c['kind'] == 'quad', c)
    page.click('.sk-cf [data-cf=snap-ent]'); hover(-50 + 15 * 0.7071, 30 + 15 * 0.7071, 1, 1); c = cur()
    check('yakalama filtresi: nesne üstü kapalıyken daire üzerinde ızgaraya düşer', c and c['kind'] == 'grid', c)
    page.click('.sk-cf [data-cf=snap-ent]'); key('Escape')
    # klavye erişimi: düğmeye odak, Enter ile aç, Tab ile onay kutusu, Boşluk ile değiştir
    page.focus('.sk-cf .cf-btn'); page.keyboard.press('Enter'); page.keyboard.press('Enter'); page.wait_for_timeout(30)
    page.keyboard.press('Enter'); page.wait_for_timeout(30)
    check('klavye: Enter ayarlar panelini açar', ev("document.querySelector('.sk-cf .cf-btn').getAttribute('aria-expanded')") == 'true')
    page.keyboard.press('Tab'); first = ev("document.activeElement.dataset.cf"); page.keyboard.press('Space'); page.wait_for_timeout(30)
    check('klavye: Tab ile ilk onay kutusuna gidilir, Boşluk ile kapatılır', first == 'snap-end' and ev("sk.skOpts().snapOff.has('end')"), (first, ev('[...sk.skOpts().snapOff]')))
    page.keyboard.press('Space'); page.keyboard.press('Escape'); page.wait_for_timeout(30)
    check('klavye: Esc paneli kapatır ve düğmeye odak döner', ev("document.querySelector('.sk-cf .cf-btn').getAttribute('aria-expanded')") == 'false' and ev("document.activeElement.className") == 'cf-btn')
    # ızgara aralığı
    page.click('.sk-cf .cf-btn'); page.select_option('.sk-cf [data-cf=grid-step]', '0.5'); page.wait_for_timeout(50)
    tool('point'); click(10.3, 5.8)
    pts = [p for k, p in S()['points'].items() if k != 'O' and abs(p['x'] - 10.5) < 1e-9]
    check('ızgara aralığı 0,5 mm: nokta (10.3; 5.8) → (10.5; 6)', len(pts) == 1 and pts[0]['y'] == 6, S()['points'])
    page.select_option('.sk-cf [data-cf=grid-step]', '10'); click(23, 37); click(-47, 52)
    pts = sorted((p['x'], p['y']) for k, p in S()['points'].items() if k != 'O' and k not in ('p1',) and p['x'] % 10 == 0 and p['y'] % 10 == 0)
    check('ızgara aralığı 10 mm: (23; 37) → (20; 40), (-47; 52) → (-50; 50)', (20, 40) in pts and (-50, 50) in pts, pts)
    # kalıcılık: sayfa yenilense de ayar korunur
    ev("sk.setSnapKind('mid', false)")
    stored = ev("localStorage.getItem('mihenk.skopt_snapoff')"), ev("localStorage.getItem('mihenk.skopt_grid')")
    check('ayarlar kalıcı depoya yazılır', stored[0] and 'mid' in stored[0] and 'end' not in stored[0] and stored[1] == '10', stored)
    page.reload(); page.wait_for_function('window.ready === true', timeout=60000)
    check('ayarlar sayfa yenilenince geri yüklenir', ev("sk.skOpts().snapOff.has('mid') && sk.skOpts().grid === 10"), ev('[...sk.skOpts().snapOff]'))
    snap_reset(); check('ayarlar sıfırlanınca varsayılan (ızgara 1)', ev('sk.skOpts().grid') == 1 and ev('sk.skOpts().snapOff.size') == 0)
    fresh()

    # ---------------------------------------------------------------- WP-09 dilim 2: giriş
    print('WP-09 dilim 2: koordinat girişi, komut tekrarı, seçim filtresi')
    def cbox(): return ev("!!document.querySelector('.sk-num [data-k=x]')")
    def coord(x, y, rel=None, tabs=2):
        key('n'); page.wait_for_timeout(30)
        if rel is not None:
            for _ in range(2): page.keyboard.press('Tab')
            page.keyboard.press('Space')   # kip değişince odak x alanına döner
        page.keyboard.type(str(x)); page.keyboard.press('Tab'); page.keyboard.type(str(y)); page.keyboard.press('Enter'); idle(); page.wait_for_timeout(60)
    snap_reset(); fresh(); tool('line')
    key('n'); check('N: çizgi aracında koordinat kutusu açılır', cbox())
    check('N: ilk noktada bağıl seçeneği kapalı (başvuru noktası yok)', ev("document.querySelector('.sk-num [data-k=rel]').disabled") is True)
    page.keyboard.type('12.5'); page.keyboard.press('Tab'); page.keyboard.type('7.25'); page.keyboard.press('Enter'); idle()
    st = ev('sk._ln && { x: sk._ln.start.x, y: sk._ln.start.y }')
    check('mutlak koordinat: çizgi başlangıcı (12,5; 7,25) tam değerde (ızgaraya yuvarlanmaz)', st and st['x'] == 12.5 and st['y'] == 7.25, st)
    check('koordinat girişi sonrası kutu kapanır', not cbox())
    key('n')
    check('ikinci noktada bağıl seçeneği açık ve varsayılan bağıl (ΔX etiketi)', ev("document.querySelector('.sk-num [data-k=rel]').checked") is True and 'ΔX' in ev("document.querySelector('.sk-num').innerText"))
    page.keyboard.type('10'); page.keyboard.press('Tab'); page.keyboard.type('0'); page.keyboard.press('Enter'); idle(); page.wait_for_timeout(100); idle()
    s = S(); ln = ents('line')
    check('bağıl koordinat: (ΔX 10; ΔY 0) çizgi (12,5; 7,25) → (22,5; 7,25)', len(ln) == 1 and P_(s, ln[0]['b']) == (22.5, 7.25), [P_(s, l['b']) for l in ln])
    check('tam yatay yazılan bağıl koordinat yatay kısıt ekler', any(c['type'] == 'horizontal' and c['a'] == ln[0]['id'] for c in s['cons']), s['cons'])
    # ifade + bağıl dikey hareket (L = 60 değişkeni)
    coord('L/2', '-4')
    s = S(); ln = ents('line')
    check('ifade ve değişken: ΔX = L/2 = 30, ΔY = -4', len(ln) == 2 and P_(s, ln[1]['b']) == (52.5, 3.25), [P_(s, l['b']) for l in ln])
    # bağıl → mutlak geçiş (onay kutusu Tab+Boşluk) ve kalan alanlar yeniden dolar
    coord(40, 30, rel=False)
    s = S(); ln = ents('line')
    check('mutlak kipe geçince koordinat dünya değeri (40; 30)', len(ln) == 3 and P_(s, ln[2]['b']) == (40, 30), [P_(s, l['b']) for l in ln])
    # başlangıç noktasının koordinatını yazmak zinciri kapatır, yinelenen nokta oluşmaz
    n0 = len(S()['points']); coord(12.5, 7.25, rel=False)
    s = S(); ln = ents('line')
    check('mevcut noktanın koordinatı yazılınca o nokta kullanılır (zincir kapanır, yeni nokta yok)', len(s['points']) == n0 and ln[3]['b'] == ln[0]['a'] and ev('sk._ln') is None, (n0, len(s['points'])))
    # Esc vazgeçer
    tool('line'); key('n'); page.keyboard.type('99'); page.keyboard.press('Escape'); idle()
    check('koordinat kutusunda Esc: kutu kapanır, nokta eklenmez', not cbox() and ev('sk._ln') is None and len(ents('line')) == 4)
    key('Escape')
    # hatalı ifade kutuyu açık tutar
    tool('line'); key('n'); page.keyboard.type('abc+'); page.keyboard.press('Tab'); page.keyboard.type('1'); page.keyboard.press('Enter'); idle()
    check('hatalı ifade: kutu açık kalır ve hata gösterilir', cbox() and ev("document.querySelector('.sk-num').classList.contains('bad')"))
    page.keyboard.press('Escape'); key('Escape')
    # dikdörtgen ve daire
    fresh(); tool('rect'); coord(-10, -5); coord(20, 15)
    s = S(); xs = sorted({round(p['x'], 6) for k, p in s['points'].items() if k != 'O'}); ys = sorted({round(p['y'], 6) for k, p in s['points'].items() if k != 'O'})
    check('dikdörtgen: köşe (-10;-5) + bağıl (20;15) → (-10..10, -5..10)', xs == [-10, 10] and ys == [-5, 10] and len(ents('line')) == 4, (xs, ys))
    fresh(); tool('circle'); coord(5, 5); coord(0, 7)
    c = ents('circle')[0]; s = S()
    check('daire: merkez (5;5), bağıl nokta (0;7) → r = 7', near(c['r'], 7) and P_(s, c['c']) == (5, 5), (c, P_(s, c['c'])))
    key('Escape')
    # komut tekrarı
    fresh(); tool('rect'); click(-20, -10); click(20, 10); key('Escape'); key('Escape')
    check('Esc ile Seç aracına dönüldü', ev('sk.tool') == 'select')
    key('Enter'); check('Enter son komutu (dikdörtgen) yineler', ev('sk.tool') == 'rect', ev('sk.tool'))
    click(40, -10); click(60, 10)
    check('yinelenen komut çalışır: ikinci dikdörtgen çizildi', len(ents('line')) == 8, len(ents('line')))
    key('Escape'); key('Escape'); tool('select'); key('Space'); check('Boşluk da son komutu yineler', ev('sk.tool') == 'rect', ev('sk.tool'))
    tool('circle'); key('Escape'); key('Enter'); check('son komut güncellenir (daire)', ev('sk.tool') == 'circle', ev('sk.tool'))
    key('Escape'); key('Escape')
    # seçim filtresi
    fresh(); snap_reset(); tool('rect'); click(-30, -10); click(-10, 10); tool('circle'); click(30, 0); click(40, 0); tool('select')
    page.click('.sk-cf .cf-btn'); page.wait_for_timeout(30)
    click(-20, -10); line_sel = ev('sk.selection.map((s) => s.kind + ":" + s.id)')
    check('önkoşul: filtre kapalıyken kenara tıklayınca çizgi seçilir', len(line_sel) == 1 and line_sel[0].startswith('ent:l'), line_sel)
    page.click('.sk-cf [data-cf=sel-line]'); ev('sk._setSel([])'); click(-20, -10)
    check('seçim filtresi: Çizgiler kapalıyken çizgi seçilmez', ev('sk.selection.length') == 0, ev('sk.selection'))
    click(30, 10); sel = ev('sk.selection.map((s) => s.kind + ":" + s.id)')
    check('seçim filtresi: daire hâlâ seçilir', len(sel) == 1 and sel[0].startswith('ent:c'), sel)
    ev('sk._setSel([])'); click(-30, -10); sel = ev('sk.selection.map((s) => s.kind + ":" + s.id)')
    check('seçim filtresi: Çizgiler kapalıyken köşe noktası seçilir', len(sel) == 1 and sel[0].startswith('point:'), sel)
    page.click('.sk-cf [data-cf=sel-point]'); ev('sk._setSel([])'); click(-30, -10)
    check('seçim filtresi: Noktalar ve Çizgiler kapalıyken köşe hiçbir şey seçmez', ev('sk.selection.length') == 0, ev('sk.selection'))
    page.click('.sk-cf [data-cf=sel-point]')
    ev('sk.selectAll()')
    check('Tümünü seç (Ctrl+A) filtreye uyar: yalnız daire', ev('sk.selection.length') == 1 and ev("sk.selection[0].id.startsWith('c')"), ev('sk.selection'))
    ev('sk._setSel([])'); x0, y0 = P(-35, -15); x1, y1 = P(45, 15); page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=4); page.mouse.up(); idle()
    sel = ev('sk.selection.map((s) => s.kind + ":" + s.id)')
    check('kutuyla seçim filtreye uyar: çizgi yok, daire + noktalar var', sel and not any(x.startswith('ent:l') for x in sel) and any(x.startswith('ent:c') for x in sel), sel)
    tool('dim'); click(-20, -10)
    check('filtre ölçü aracını etkilemez: çizgi ölçülebilir', ev('!!sk._input'), None)
    key('Escape'); tool('select')
    page.click('.sk-cf [data-cf=sel-line]'); ev('sk._setSel([])'); click(-20, -10)
    check('filtre yeniden açılınca çizgi seçilir', ev('sk.selection.length') == 1)
    # ---------------------------------------------------------------- WP-09 dilim 3: kısıt
    print('WP-09 dilim 3: otomatik kısıtlandırma (bugünkü davranış korunur, kapatılabilir), referans ölçü')
    import math
    def cf(k):
        if not ev("!!document.querySelector('.sk-cf .pop')"): page.click('.sk-cf .cf-btn')
        page.click(f'.sk-cf [data-cf={k}]')
    def con_types(s): return sorted(c['type'] for c in s['cons'])
    def auto_reset(): ev("(() => { sk.setAuto(true); ['hv','tan','perp','coin','on','mid'].forEach((k) => sk.setAutoKind(k, true)); sk.setAutoRef(false); })()")
    def hv_line():
        fresh(); tool('line'); click(-40, -40); click(20, -39); click(20, 10); key('Escape')   # 1/60 ~ 1 derece, sonra ~ -1,2 derece dikeye
        return S()
    auto_reset(); snap_reset()
    s = hv_line(); ln = ents('line')
    check('[bugünkü davranış] çizgi ~1° eğik çizilince yatay kısıtlanır ve y eşitlenir', len(ln) == 2 and any(c['type'] == 'horizontal' and c['a'] == ln[0]['id'] for c in s['cons']) and near(P_(s, ln[0]['b'])[1], -40), (s['cons'], ))
    check('[bugünkü davranış] ikinci çizgi dikey kısıtlanır', any(c['type'] == 'vertical' and c['a'] == ln[1]['id'] for c in s['cons']), s['cons'])
    # teğet: (30,60) noktasından r=10 daireye
    fresh(); tool('circle'); click(30, 20); click(40, 20); tool('line'); click(30, 60)
    ph = 0.25; T = (30 + 10 * math.sqrt(1 - ph * ph), 20 + 10 * ph)
    hover(T[0], T[1], 1, 0); c = cur(); check('[bugünkü davranış] teğet noktası yakalanır', c and c['kind'] == 'tan', c)
    x, y = P(T[0], T[1]); page.mouse.click(x + 1, y); idle(); s = S(); circ = ents('circle')[0]
    check('[bugünkü davranış] çizgi daireye teğet kısıtlanır', any(c['type'] == 'tangent' and circ['id'] in (c['a'], c['b']) for c in s['cons']), s['cons'])
    key('Escape')
    # dik
    fresh(); tool('line'); click(-40, 10); click(40, 10); key('Escape'); tool('line'); click(13, 40); hover(13, 10, 1, 1); c = cur()
    check('[bugünkü davranış] dik ayak noktası yakalanır', c and c['kind'] == 'perp', c)
    page.mouse.click(*[v + 1 for v in P(13, 10)]); idle(); s = S()
    check('[bugünkü davranış] dik kısıtı eklenir', 'perpendicular' in con_types(s), s['cons']); key('Escape')
    # çakışık (nokta paylaşımı), nesne üstü, orta nokta
    fresh(); tool('rect'); click(-20, -10); click(20, 10); tool('line'); click(20, 10); click(50, 30); key('Escape'); s = S()
    ln = [e for e in s['ents'] if e['type'] == 'line'][-1]; corner = [e for e in s['ents'] if e['type'] == 'line'][1]['b']
    check('[bugünkü davranış] mevcut köşeye başlayan çizgi o noktayı paylaşır (çakışık)', ln['a'] in [e[k] for e in s['ents'] if e['type'] == 'line' and e is not ln for k in ('a', 'b')] and len(s['points']) == 1 + 4 + 1, (len(s['points']), ln))
    tool('line'); click(7, -10); click(7, -40); key('Escape'); s = S()
    check('[bugünkü davranış] çizgi üstüne başlayan çizgi pointOn kısıtı alır', 'pointOn' in con_types(s), s['cons'])
    tool('line'); click(0, 10); click(0, 40); key('Escape'); s = S()
    check('[bugünkü davranış] orta noktadan başlayan çizgi midpoint kısıtı alır', 'midpoint' in con_types(s), s['cons'])
    # --- kapatma
    cf('auto-hv'); s = hv_line(); ln = ents('line')
    check('otomatik yatay/dikey kapalı: eğik çizgi eğik kalır, kısıt yok', not any(c['type'] in ('horizontal', 'vertical') for c in s['cons']) and not near(P_(s, ln[0]['b'])[1], -40), s['cons'])
    cf('auto-hv')
    cf('auto-tan'); fresh(); tool('circle'); click(30, 20); click(40, 20); tool('line'); click(30, 60); hover(T[0], T[1], 1, 0); page.mouse.click(*[v + d for v, d in zip(P(T[0], T[1]), (1, 0))]); idle(); s = S()
    check('otomatik teğet kapalı: teğet kısıtı eklenmez', 'tangent' not in con_types(s) and len(ents('line')) == 1, s['cons']); key('Escape')
    cf('auto-tan')
    cf('auto-coin'); fresh(); tool('rect'); click(-20, -10); click(20, 10); tool('line'); click(20, 10); click(50, 30); key('Escape'); s = S()
    check('otomatik çakışık kapalı: köşede yeni nokta açılır (paylaşım yok), aynı konumda', len(s['points']) == 1 + 4 + 2 and sum(1 for p in s['points'].values() if p['x'] == 20 and p['y'] == 10) == 2, (len(s['points']), s['points']))
    cf('auto-coin')
    cf('auto-on'); fresh(); tool('rect'); click(-20, -10); click(20, 10); tool('line'); click(7, -10); click(7, -40); key('Escape'); s = S()
    check('otomatik nesne üstünde kapalı: pointOn eklenmez', 'pointOn' not in con_types(s), s['cons']); cf('auto-on')
    cf('auto-mid'); fresh(); tool('rect'); click(-20, -10); click(20, 10); tool('line'); click(0, 10); click(0, 40); key('Escape'); s = S()
    check('otomatik orta nokta kapalı: midpoint eklenmez', 'midpoint' not in con_types(s), s['cons']); cf('auto-mid')
    cf('auto-all'); s = hv_line()
    check('ana anahtar kapalı: hiçbir otomatik kısıt eklenmez', con_types(s) == [], s['cons'])
    cf('auto-all'); s = hv_line()
    check('ana anahtar açılınca eski davranış geri gelir', 'horizontal' in con_types(s) and 'vertical' in con_types(s), s['cons'])
    # --- aşırı kısıtta referans ölçü
    fresh(); line((-20, 5), (20, 5)); rl = ents('line')[0]
    tool('hdim'); click(0, 5); page.keyboard.type('40'); page.keyboard.press('Enter'); idle(); page.wait_for_timeout(200); idle()
    dims0 = [c for c in S()['cons'] if c['type'] == 'hdist']
    check('önkoşul: 40 mm yatay ölçü sürücü olarak eklendi', len(dims0) == 1 and not dims0[0].get('ref'), S()['cons'])
    tool('dim'); click(0, 5); page.keyboard.type('25'); page.keyboard.press('Enter'); idle(); page.wait_for_timeout(200); idle()
    st = status() or ''
    check('çelişen ölçü yine reddedilir; durum satırı Ctrl+Enter ipucunu verir', len([c for c in S()['cons'] if c['type'] in ('hdist', 'dist')]) == 1 and 'çelişiyor' in st and 'Ctrl+Enter' in st, st)
    check('ret sonrası ölçü kutusu açık kalır', ev("!!document.querySelector('.sk-input')"))
    page.keyboard.press('Control+Enter'); idle(); page.wait_for_timeout(250); idle()
    ds = [c for c in S()['cons'] if c['type'] in ('hdist', 'dist')]
    refs = [c for c in ds if c.get('ref')]
    check('Ctrl+Enter: aşırı kısıtlayan ölçü referans (sürülen) ölçü olarak eklenir', len(ds) == 2 and len(refs) == 1 and near(float(refs[0]['expr']), 40, 1e-4), ds)
    check('referans ölçü geometriyi etkilemez (uzunluk 40) ve çözüm geçerli', near(lens(S(), rl['id']), 40, 1e-4) and ev('sk.lastSolve.ok'), None)
    check('referans ölçü etiketi parantezli', ev("[...document.querySelectorAll('.dim.ref')].some((e) => e.textContent.trim() === '(40)')"), ev("[...document.querySelectorAll('.dim')].map((e) => e.textContent)"))
    # gereksiz (aynı değer) ölçü de aynı yolla referans olabilir; otomatik ayar sormadan çevirir
    cf('auto-ref'); page.keyboard.press('Escape')
    fresh(); line((-20, 5), (20, 5)); rl = ents('line')[0]
    tool('hdim'); click(0, 5); page.keyboard.type('40'); page.keyboard.press('Enter'); idle(); page.wait_for_timeout(200); idle()
    tool('dim'); click(0, 5); page.keyboard.type('40'); page.keyboard.press('Enter'); idle(); page.wait_for_timeout(250); idle()
    ds = [c for c in S()['cons'] if c['type'] in ('hdist', 'dist')]
    check('otomatik referans açıkken gereksiz ölçü sormadan referans olur', len(ds) == 2 and sum(1 for c in ds if c.get('ref')) == 1 and not ev("!!document.querySelector('.sk-input')") and 'referans' in (status() or ''), (len(ds), status()))
    tool('select'); ev('sk.setAutoRef(false)')
    ev("(() => { sk.setAuto(true); })()")
    # ---------------------------------------------------------------- WP-09 dilim 4: ilişkisel izdüşüm
    print('WP-09 dilim 4: ilişkisel izdüşüm (gövde kenarı eskize bağlı, model değişince güncellenir)')
    ev("""(() => { window.mkBody = (segs) => { const lines = new Float32Array(segs.flatMap((s) => s.pts.flat())); let off = 0; const eg = segs.map((s) => { const g = { idx: s.idx, start: off, count: s.pts.length }; off += s.pts.length; return g; }); return { id: 'b1', lines, edgeGroups: eg }; }; })()""")
    ev("window.body = mkBody([{ idx: 0, pts: [[10, 5, 0], [50, 5, 0]] }, { idx: 1, pts: [[50, 5, 0], [50, 25, 0]] }]); sk.getBodies = () => [window.body];")
    fresh()
    r = ev("sk._projectGo({ mode: 'all' })"); idle(); s = S()
    pl = [e for e in s['ents'] if e['type'] == 'line' and e.get('proj')]
    check('izdüşüm: iki kenar bağlı (proj) çizgi olarak geldi', len(pl) == 2 and all(e['proj']['b'] == 'b1' for e in pl) and sorted(e['proj']['g'] for e in pl) == [0, 1], s['ents'])
    check('izdüşüm çizgileri sabit noktalı yapı geometrisi', all(e.get('cons') for e in pl) and all(s['points'][e['a']].get('fixed') for e in pl), None)
    # izdüşüm ucundan çizgi çiz (çakışık), sonra gövde değişsin
    tool('line'); click(50, 25); click(80, 40); key('Escape'); s = S()
    own = [e for e in s['ents'] if e['type'] == 'line' and not e.get('proj')][0]
    shared = own['a']
    ev("window.body.lines.set([10, 5, 0, 70, 25, 0, 70, 25, 0, 70, 45, 0])")
    r = ev("sk.refreshProjections()"); idle(); page.wait_for_timeout(150); idle(); s = S()
    p0 = [e for e in s['ents'] if e.get('proj') and e['proj']['g'] == 0][0]; p1 = [e for e in s['ents'] if e.get('proj') and e['proj']['g'] == 1][0]
    check('model değişince izdüşüm yeni kenara taşınır: (10;5)→(70;25)', P_(s, p0['a']) == (10, 5) and P_(s, p0['b']) == (70, 25), (P_(s, p0['a']), P_(s, p0['b'])))
    check('ikinci kenar (70;25)→(70;45)', P_(s, p1['a']) == (70, 25) and P_(s, p1['b']) == (70, 45), (P_(s, p1['a']), P_(s, p1['b'])))
    check('izdüşüm ucunu paylaşan kendi çizgisi uçla birlikte taşınır (50;25 → 70;45)', P_(s, shared) == (70, 45) and ev('sk.lastSolve.ok'), P_(s, shared))
    check('güncelleme geri alınabilir', ev('sk._undo.length') > 0 and (ev('sk.undo()') is None or True) and (idle() or True) and P_(S(), p0['b']) == (50, 5), P_(S(), p0['b']))
    ev("sk.redo()"); idle()
    # düğme (arayüz) ve değişmemiş durum
    page.click('.sk-cf .cf-btn') if not ev("!!document.querySelector('.sk-cf .pop')") else None
    page.click('.sk-cf [data-cf=proj-refresh]'); idle(); st = status() or ''
    check('değişiklik yokken güncelle düğmesi "zaten güncel" der', 'güncel' in st, st)
    # eskiz yeniden açılırken otomatik güncelleme (kaydet-kapat-aç)
    feat = ev("sk.stop()")
    ev("window.body.lines.set([10, 5, 0, 90, 5, 0, 90, 5, 0, 90, 30, 0])")
    ev("(f) => begin('XY', f)", feat); idle(); s = S()
    p0 = [e for e in s['ents'] if e.get('proj') and e['proj']['g'] == 0][0]
    check('eskiz yeniden açılınca bağlı izdüşüm gövdeden güncellenir', P_(s, p0['b']) == (90, 5), P_(s, p0['b']))
    check('açılışta güncelleme bildirilir', 'güncellendi' in ' '.join(ev('window.statusLog.slice(-6)')), ev('window.statusLog.slice(-6)'))
    # kenar numarası değişti: ağırlık merkezine en yakın kenar bulunur
    ev("window.body = mkBody([{ idx: 7, pts: [[10, 5, 0], [94, 5, 0]] }, { idx: 9, pts: [[94, 5, 0], [94, 30, 0]] }]); sk.getBodies = () => [window.body];")
    ev("sk.refreshProjections()"); idle(); s = S(); p0 = [e for e in s['ents'] if e.get('proj') and e['proj']['g'] == 7][0]
    check('kenar numarası değişince ağırlık merkezine en yakın kenar izlenir (0 → 7, bağ güncellenir)', P_(s, p0['b']) == (94, 5) and not p0['proj'].get('lost') and p0['proj']['g'] == 7, (P_(s, p0['b']), p0['proj']))
    # kenar yok olursa: nesne korunur, bağ kopuk işaretlenir
    ev("window.body = mkBody([{ idx: 0, pts: [[300, 300, 0], [320, 300, 0]] }]); sk.getBodies = () => [window.body];")
    ev("sk.refreshProjections()"); idle(); s = S(); p1 = [e for e in s['ents'] if e.get('proj') and e['proj']['g'] == 9][0]
    check('kaynak kenar yoksa nesne olduğu gibi kalır, bağ korunur ve kullanıcı uyarılır', 'bulunamadı' in (status() or '') and P_(s, p1['a']) == (94, 5) and p1['proj']['g'] == 9, (status(), p1))
    # yapı değişimi: doğru → daire (yeniden kurulur, bağ korunur)
    ev("window.body = mkBody([{ idx: 7, pts: Array.from({ length: 73 }, (_, i) => [52 + 10 * Math.cos(i * Math.PI / 36), 5 + 10 * Math.sin(i * Math.PI / 36), 0]).flatMap((p, i, a) => i < a.length - 1 ? [p, a[i + 1]] : []) }]); sk.getBodies = () => [window.body];")
    ev("sk.refreshProjections()"); idle(); s = S()
    circ = [e for e in s['ents'] if e['type'] == 'circle' and e.get('proj')]
    check('doğru kenar daireye dönünce izdüşüm yeniden kurulur (daire, bağ korunur)', len(circ) == 1 and near(circ[0]['r'], 10, 1e-3) and circ[0]['proj']['g'] == 7, [e for e in s['ents'] if e.get('proj')])
    ev("sk.getBodies = () => []"); fresh()
    real_errs = [e for e in errs if 'favicon' not in e]
    check('konsolda hata yok', not real_errs, real_errs[:3])
    br.close()
finally:
    _srv.stop(server)
print(f'\n{passed} geçti, {failed} kaldı')
sys.exit(1 if failed else 0)
