# Gerçek uygulamada: Yeni belge -> STEP A içe aktar -> Yeni belge -> STEP B içe aktar. B geometrisi görünmeli.
# Önce kaynak ağacında: npx vite --port 5210 &     Çalıştır: python3 -I test/security/import_cache_ui_poc.py
from playwright.sync_api import sync_playwright
JS = '''async () => {
  const a = window.app; const b64 = (u) => { let s=''; for (const c of u) s += String.fromCharCode(c); return btoa(s); };
  const box = (w) => ({ params: [], features: [{ id: 'b1', type: 'primitive', name: 'K', kind: 'box', x: '0', y: '0', z: '0', w: String(w), d: String(w), h: String(w), op: 'new' }] });
  await a.loadDoc(box(10)); await a.whenIdle(); const A = await a.query('export', { format: 'step', ids: [a.result.bodies[0].id] });
  await a.loadDoc(box(20)); await a.whenIdle(); const B = await a.query('export', { format: 'step', ids: [a.result.bodies[0].id] });
  const out = {};
  for (const [lbl, data] of [['A(10mm küp)', A], ['B(20mm küp)', B]]) {
    a.markDirty(false); await a.newDoc();                                   // belgeyi sıfırla (aynı çekirdek/işçi kalır)
    const id = (await import('/src/ui/features.js')).newId(a.doc, 'import');
    await a.commit((d) => { d.features.push({ id, type: 'import', name: lbl, format: 'step', data: b64(data) }); }); await a.whenIdle();
    out[lbl] = { id, hacim: Math.round(a.result.bodies[0].volume), durum: a.result.status[id].ok };
  }
  return out; }'''
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    pg = br.new_page(); pg.on('dialog', lambda d: d.accept())
    pg.goto('http://127.0.0.1:5210/'); pg.wait_for_function('window.app && window.app.ready', timeout=90000); pg.evaluate('async()=>await window.app.ready')
    print(pg.evaluate(JS), '\nbeklenen: A=1000, B=8000'); br.close()
