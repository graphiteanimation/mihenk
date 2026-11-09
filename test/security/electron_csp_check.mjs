// Önerilen CSP'nin (meta etiketi, dist/index.html içine eklenmiş kopyada) uygulamayı bozmadan saldırıları kestiğini doğrular.
// Çalıştır: xvfb-run -a node test/security/electron_csp_check.mjs /tmp/aud/app2   (APPDIR/dist/index.html'de CSP meta'sı olmalı)
import { _electron as electron } from 'playwright'; import http from 'node:http';
const hits = []; const srv = http.createServer((q, r) => { hits.push(q.url); r.end('x'); }).listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
const PORT = srv.address().port;
const app = await electron.launch({ args: [process.argv[2] || '/tmp/aud/app2', '--no-sandbox'] });
const page = await app.firstWindow(); const viol = []; page.on('console', (m) => { if (/Content Security Policy|Refused/i.test(m.text())) viol.push(m.text().slice(0, 110)); });
await page.waitForFunction(() => window.app && window.app.ready, null, { timeout: 90000 }); await page.evaluate(() => window.app.ready);
const o = await page.evaluate(async (PORT) => {
  const r = {}; r.cspMeta = !!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  try { r.newFunction = new Function('return 1')(); } catch (e) { r.newFunction = 'ENGEL'; }
  window.__x = 0; const d = document.createElement('div'); d.innerHTML = '<img src=x onerror="window.__x=1">'; document.body.append(d); await new Promise((s) => setTimeout(s, 300)); r.inlineHandler = window.__x === 1 ? 'ÇALIŞTI' : 'ENGEL';
  try { await fetch('http://127.0.0.1:' + PORT + '/fetch', { mode: 'no-cors' }); r.fetchExternal = 'GİTTİ'; } catch (e) { r.fetchExternal = 'ENGEL'; }
  await new Promise((s) => { const i = new Image(); i.onload = i.onerror = s; i.src = 'http://127.0.0.1:' + PORT + '/img'; });
  await window.app.loadDoc({ params: [], features: [{ id: 'b1', type: 'primitive', name: 'K', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '30', h: '20', op: 'new' }] }); await window.app.whenIdle();
  r.appWorks = window.app.result.bodies[0].volume; return r; }, PORT);
console.log(JSON.stringify({ ...o, serverHits: hits, cspViolations: viol.length, sample: viol.slice(0, 3) }, null, 1)); await app.close(); process.exit(0);
