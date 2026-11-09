# Kötü niyetli .acad ile XSS / prototip kirliliği / DoS denemesi. Kaynağı DEĞİŞTİRMEZ.
# Önce:  npx vite --port 5210 &      Çalıştır:  python3 -I test/security/xss_poc.py
import json, sys, time
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:5210/'
P = lambda tag: f'<img src=x onerror="window.__pwn=(window.__pwn||[]).concat([\'{tag}\'])">'
# Her alana farklı etiketli yük konur; hangisi çalışırsa window.__pwn'de görünür.
doc = {
  'params': [{'name': 'L', 'expr': '50', 'note': P('param.note')}, {'name': P('param.name'), 'expr': '1'}, {'name': '__proto__', 'expr': '5'}, {'name': 'constructor', 'expr': '7'},
             {'name': 'q', 'expr': P('param.expr')}],
  'bodyNames': {'b1': P('bodyNames.b1'), '__proto__': {'polluted': 'bodyNames-proto'}},
  '__proto__': {'polluted_root': 1}, 'constructor': {'prototype': {'polluted_ctor': 1}},
  'rollback': None,
  'features': [
    {'id': 'b1', 'type': 'primitive', 'kind': 'box', 'name': P('feat.name.box'), 'bodyName': P('feat.bodyName'), 'x': '0', 'y': '0', 'z': '0', 'w': 'L', 'd': '30', 'h': '20', 'op': 'new', '__proto__': {'polluted_feat': 1}},
    {'id': P('feat.id'), 'type': 'primitive', 'kind': 'cylinder', 'name': 'c', 'dia': '10', 'h': '10', 'x': '100', 'y': '0', 'z': '0', 'op': 'new'},
    {'id': 'u1', 'type': P('feat.type'), 'name': P('feat.name.unknown'), 'kind': P('feat.kind')},
    {'id': 'u2', 'type': '__proto__', 'name': 'proto-type'}, {'id': 'u3', 'type': 'constructor', 'name': 'ctor-type'},
    {'id': 'sk1', 'type': 'sketch', 'name': P('sketch.name'), 'plane': {'name': 'XY', 'offset': P('plane.offset')}, 'points': {'a': {'x': 0, 'y': 0}, 'b': {'x': 10, 'y': 0}}, 'ents': [{'id': 'l1', 'type': 'line', 'a': 'a', 'b': 'b'}], 'cons': [{'id': 'd1', 'type': P('con.type'), 'a': 'l1', 'expr': P('con.expr')}]},
    {'id': 'i1', 'type': 'import', 'name': P('import.name'), 'format': 'step', 'data': P('import.data')},
    {'id': 'f1', 'type': 'fillet', 'name': P('fillet.name'), 'edges': [{'body': 'b1', 'idx': 0}], 'r': P('fillet.r')},
  ],
}
bytes_ = json.dumps({'app': 'AtolyeCAD', 'version': 1, 'doc': doc}).encode()
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    page = br.new_context(viewport={'width': 1400, 'height': 860}).new_page()
    net = []; errs = []; dialogs = []
    page.on('request', lambda r: net.append(r.url[:110]))
    page.on('pageerror', lambda e: errs.append(str(e)[:140]))
    page.on('dialog', lambda d: (dialogs.append(d.message), d.dismiss()))
    page.goto(URL); page.wait_for_function('window.app && window.app.ready', timeout=90000)
    page.evaluate('async () => await window.app.ready')
    # gerçek "Dosya > Aç" akışının ikinci yarısı (diyalogdan sonra çağrılan işlev)
    page.evaluate('''async (arr) => { await window.app.openBytes(new Uint8Array(arr), '<img src=x onerror="window.__pwn=(window.__pwn||[]).concat([\\'filename\\'])">.acad', null); }''', list(bytes_))
    page.evaluate('async () => { await window.app.whenIdle(); }')
    time.sleep(1.5)
    # tüm panelleri aç/kapat: özellik düzenleme, parametre penceresi, yeniden adlandırma, bağlam menüsü
    n = page.evaluate('window.app.doc.features.length')
    for i in range(n):
        page.evaluate(f'''() => {{ const a = window.app; try {{ a.editFeature({i}); }} catch (e) {{}} }}''')
        time.sleep(0.25)
        page.evaluate('''() => { const a = window.app; try { if (a.edit) a.edit.cancel(); if (a.sketchSession) a.cancelSketch(); } catch (e) {} }''')
        time.sleep(0.15)
    page.evaluate('''async () => { try { window.app.openParams(); } catch (e) {} }'''); time.sleep(0.4)
    page.keyboard.press('Escape'); time.sleep(0.2)
    for call in ["window.app.showAbout()", "window.app.showShortcuts()"]:
        page.evaluate(f"() => {{ try {{ {call}; }} catch (e) {{}} }}"); time.sleep(0.3); page.keyboard.press('Escape')
    page.evaluate('''async () => { const a = window.app; const id = a.result && a.result.bodies[0] && a.result.bodies[0].id; if (id) { try { await a.selectBody(id); } catch (e) {} } }''')
    for sel in ['.chip', '#browser .row']:
        for el in page.query_selector_all(sel)[:12]:
            try: el.click(timeout=800); el.dblclick(timeout=800); page.keyboard.press('Escape'); page.evaluate('() => { try { if (window.app.edit) window.app.edit.cancel(); if (window.app.sketchSession) window.app.cancelSketch(); } catch (e) {} }')
            except Exception: pass
    # özellikler ve girişim kutuları (gövde adı basılan yerler)
    page.evaluate('''async () => { const a = window.app; try { const m = await import(new URL('/src/ui/panels.js', location.href).href); const id = a.result.bodies[0].id; await m.showProps(a, id); } catch (e) { window.__showPropsErr = String(e); } }'''); time.sleep(0.5)
    res = page.evaluate('''() => ({
      pwn: window.__pwn || null,
      injectedImgs: document.querySelectorAll('img[src="x"]').length,
      polluted: [({}).polluted, ({}).polluted_root, ({}).polluted_feat, ({}).polluted_ctor, (Object.prototype).polluted],
      protoClean: Object.keys(Object.prototype).length === 0,
      bodies: window.app.result && window.app.result.bodies.map(b => b.name),
      status: Object.fromEntries(Object.entries(window.app.result.status).map(([k, v]) => [k.slice(0, 20), v.ok ? 'ok' : String(v.error).slice(0, 60)])),
      title: document.title.slice(0, 50),
      boxText: (document.querySelector('#measurebox') || {}).textContent,
    })''')
    print(json.dumps(res, ensure_ascii=False, indent=1))
    print('ağ istekleri (yerel dışı):', [u for u in net if not u.startswith('http://127.0.0.1:5210') and not u.startswith('data:') and not u.startswith('blob:')])
    print('pageerror:', errs[:6]); print('dialog:', dialogs)
    page.screenshot(path='/tmp/aud/xss_after.png')
    br.close()
    sys.exit(1 if res['pwn'] or res['injectedImgs'] else 0)
