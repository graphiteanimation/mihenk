# Bozuk/kötü niyetli .acad belgelerinin yüklenmesi (şema doğrulaması yok). Kaynağı DEĞİŞTİRMEZ.
# Önce: (kaynak ağacında) npx vite --port 5210 &     Çalıştır: python3 -I test/security/malformed_doc_poc.py
import json, time
from playwright.sync_api import sync_playwright
good = {'params': [], 'features': [{'id': 'b1', 'type': 'primitive', 'name': 'K', 'kind': 'box', 'x': '0', 'y': '0', 'z': '0', 'w': '40', 'd': '30', 'h': '20', 'op': 'new'}]}
cases = {
 'doc=5': 5, 'doc="str"': 'str', 'doc=[]': [], 'doc=true': True,
 'features=[null]': {'params': [], 'features': [None]}, 'features=[1]': {'params': [], 'features': [1]}, 'features=[{}]': {'params': [], 'features': [{}]},
 'features=[{type:sketch,ents:5}]': {'params': [], 'features': [{'id': 's', 'type': 'sketch', 'ents': 5}]},
 'params=[null]': {'params': [None], 'features': []}, 'params=[{name:1,expr:{}}]': {'params': [{'name': 1, 'expr': {}}], 'features': []},
 'dup ids': {'params': [], 'features': [good['features'][0], good['features'][0]]},
 'rollback=-5': dict(good, rollback=-5), 'rollback="x"': dict(good, rollback='x'),
 'features=[{id:b1,w:"1e308*10"}]': {'params': [], 'features': [dict(good['features'][0], w='1e308*10')]},
 'box w=1e300': {'params': [], 'features': [dict(good['features'][0], w='1e300', d='1e300', h='1e300')]},
 'deep nest 5000': {'params': [], 'features': [dict(good['features'][0], x={'a': None})]},
}
deep = None
for _ in range(4000): deep = [deep]
cases['deep nest 4000 (array)'] = {'params': [], 'features': [dict(good['features'][0], note=deep)]}
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    page = br.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)[:110])); page.on('dialog', lambda d: d.dismiss())
    page.goto('http://127.0.0.1:5210/'); page.wait_for_function('window.app && window.app.ready', timeout=90000); page.evaluate('async()=>await window.app.ready')
    for name, doc in cases.items():
        errs.clear()
        b = json.dumps({'app': 'AtolyeCAD', 'version': 1, 'doc': doc}).encode()
        t0 = time.time()
        r = page.evaluate('''async (arr) => { const a = window.app; let thrown = null;
            try { await Promise.race([a.openBytes(new Uint8Array(arr), 't.acad', null), new Promise((_, rej) => setTimeout(() => rej(new Error('ZAMAN AŞIMI 20sn')), 20000))]); } catch (e) { thrown = String(e.message || e).slice(0, 90); }
            let usable = true; try { await a.loadDoc({ params: [], features: [] }); a.C.renderAll(); } catch (e) { usable = 'ONARILAMADI ' + String(e.message).slice(0, 60); }
            return { thrown, docType: Array.isArray(a.doc) ? 'array' : typeof a.doc, usableAfter: usable }; }''', list(b))
        print(f'{name:36s} thrown={r["thrown"]!s:60.60s} recover={r["usableAfter"]} t={time.time()-t0:.1f}s uncaught={errs[:1]}')
    br.close()
