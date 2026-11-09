// Electron güvenlik sondası. Kaynağı DEĞİŞTİRMEZ; uygulamanın bir kopyasını (APPDIR) başlatır.
// Hazırlık:  mkdir -p /tmp/aud/app2 && cp -r dist electron package.json /tmp/aud/app2 && ln -s $PWD/node_modules /tmp/aud/app2/node_modules
//            mkdir /tmp/aud/app2/dist-secret && echo SIR > /tmp/aud/app2/dist-secret/x.txt && echo SIR > /tmp/aud/app2/secret.txt
// Çalıştır:  xvfb-run -a node test/security/electron_probe.mjs /tmp/aud/app2
import { _electron as electron } from 'playwright';
import http from 'node:http'; import fs from 'node:fs';
const APP = process.argv[2] || '/tmp/aud/app2';
const OUT = '/tmp/aud/electron_probe_result';
fs.mkdirSync(OUT, { recursive: true });
const hits = [];
const srv = http.createServer((req, res) => {
  hits.push(req.method + ' ' + req.url);
  res.setHeader('Content-Type', 'text/html');
  if (req.url.startsWith('/evil')) {
    return res.end(`<!doctype html><title>evil</title><script>
    const o={native:typeof window.native, keys: window.native?Object.keys(window.native):[]};
    (async()=>{ try{ o.write = await window.native.saveFile({path:${JSON.stringify(OUT + '/WRITTEN_BY_REMOTE_PAGE.txt')}, data:Array.from(new TextEncoder().encode('uzak sayfa yazdi'))}); }catch(e){o.write='ERR '+e.message}
      fetch('/result?'+encodeURIComponent(JSON.stringify(o))); })();</script>`);
  }
  res.end('ok');
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r)); const PORT = srv.address().port;

const app = await electron.launch({ args: [APP, '--no-sandbox'], env: { ...process.env, ATOLYE_SHOW: '1' } });
const page = await app.firstWindow();
await page.waitForFunction(() => window.app && window.app.ready, null, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(1500);
const R = {};
R.webPreferences = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { contextIsolation: w.contextIsolation, nodeIntegration: w.nodeIntegration, sandbox: w.sandbox, webSecurity: w.webSecurity, nodeIntegrationInWorker: w.nodeIntegrationInWorker, allowRunningInsecureContent: w.allowRunningInsecureContent }; });
R.url = page.url();
R.renderer = await page.evaluate(async (PORT) => {
  const o = {};
  o.nodeGlobals = { require: typeof require, process: typeof process, Buffer: typeof Buffer };
  o.nativeKeys = Object.keys(window.native || {});
  o.cspMeta = !!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  try { const r = await fetch(location.href); o.cspHeader = r.headers.get('content-security-policy'); } catch (e) { o.cspHeader = 'ERR'; }
  try { o.newFunction = new Function('return 40+2')(); } catch (e) { o.newFunction = 'ENGELLENDI ' + e.message; }
  try { window.__x = 0; const s = document.createElement('div'); s.innerHTML = '<img src=x onerror="window.__x=1">'; document.body.append(s); await new Promise(r => setTimeout(r, 300)); o.inlineHandlerRan = window.__x === 1; } catch (e) { o.inlineHandlerRan = 'ERR'; }
  const probe = async (u) => { try { const r = await fetch(u); return r.status + ' ' + (await r.text()).slice(0, 30).replace(/\n/g, ' '); } catch (e) { return 'ERR ' + e.message; } };
  o.traversal = {};
  for (const u of ['app://atolye/../package.json', 'app://atolye/%2e%2e/package.json', 'app://atolye/%252e%252e/package.json', 'app://atolye/%252e%252e/secret.txt', 'app://atolye/%252e%252e/dist-secret/x.txt', 'app://atolye/%2e%2e%2fdist-secret/x.txt', 'app://atolye/%252e%252e%252fdist-secret%252fx.txt', 'app://atolye/..%5c..%5cpackage.json', 'app://atolye/index.html%00.txt', 'app://atolye//etc/passwd', 'app://atolye/%252fetc%252fpasswd'])
    o.traversal[u] = await probe(u);
  try { await fetch('http://127.0.0.1:' + PORT + '/beacon-fetch', { mode: 'no-cors' }); o.netFetchNoCors = 'gitti'; } catch (e) { o.netFetchNoCors = 'ERR ' + e.message; }
  try { await new Promise((res) => { const i = new Image(); i.onload = i.onerror = res; i.src = 'http://127.0.0.1:' + PORT + '/beacon-img'; }); } catch (e) {}
  try { navigator.sendBeacon('http://127.0.0.1:' + PORT + '/beacon-sb', 'x'); } catch (e) {}
  o.notification = await Notification.requestPermission().catch((e) => 'ERR ' + e.message);
  for (const n of ['geolocation', 'notifications', 'camera', 'microphone', 'clipboard-read', 'midi']) { try { o['perm_' + n] = (await navigator.permissions.query({ name: n })).state; } catch (e) { o['perm_' + n] = 'ERR'; } }
  o.geolocationCall = await new Promise((res) => { navigator.geolocation.getCurrentPosition(() => res('izin verildi'), (e) => res('kod ' + e.code + ' ' + e.message), { timeout: 4000 }); });
  try { o.arbitraryWrite = await window.native.saveFile({ path: '/tmp/aud/electron_probe_result/ARBITRARY_WRITE.txt', defaultName: 'x', data: Array.from(new TextEncoder().encode('diyalogsuz yazma')) }); } catch (e) { o.arbitraryWrite = 'ERR ' + e.message; }
  return o;
}, PORT);
R.fileWritten = fs.existsSync(OUT + '/ARBITRARY_WRITE.txt') ? fs.readFileSync(OUT + '/ARBITRARY_WRITE.txt', 'utf8') : null;
await page.keyboard.press('F12'); await page.waitForTimeout(1500);
R.devtoolsOpenedByF12 = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.isDevToolsOpened());
const before = app.windows().length;
await page.evaluate((u) => { window.open(u, '_blank'); }, 'http://127.0.0.1:' + PORT + '/evil?popup');
await new Promise((r) => setTimeout(r, 4000));
R.windowsAfterWindowOpen = app.windows().length - before;
await page.evaluate((u) => { location.href = u; }, 'http://127.0.0.1:' + PORT + '/evil?nav');
await new Promise((r) => setTimeout(r, 4000));
R.allWindowUrls = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.webContents.getURL()));
R.serverHits = hits;
R.filesInOut = fs.readdirSync(OUT);
console.log(JSON.stringify(R, null, 1));
await app.close().catch(() => {}); srv.close(); process.exit(0);
