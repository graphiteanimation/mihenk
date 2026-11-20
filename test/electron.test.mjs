// Electron güvenlik/davranış testi (Playwright _electron). Linux'ta ekran yoksa xvfb-run ile kendini yeniden başlatır (Windows'ta gerekmez).
// Kurulu exe'ye karşı koşulamaz: paketli sürümde enableNodeCliInspectArguments fuse'u kapalı (Playwright --inspect ister); kurulu sürüm için scripts/installed-smoke.mjs.
// Çalıştır: node test/electron.test.mjs     (önce: npm run build)
// Kök kullanıcıda --no-sandbox YALNIZ komut satırından verilir; uygulama kodu kum havuzunu hiçbir zaman kapatmaz.
import { _electron as electron } from 'playwright';
import { spawnSync } from 'node:child_process'; import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform === 'linux' && !process.env.DISPLAY) { const r = spawnSync('xvfb-run', ['-a', process.execPath, ...process.argv.slice(1)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
const { CSP } = createRequire(import.meta.url)(path.join(ROOT, 'electron/csp.cjs'));
const SANDBOX_ARGS = process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [];

let pass = 0, failN = 0;
const check = (name, cond, detail = '') => { if (cond) { pass++; console.log('  ok   ', name); } else { failN++; console.log('  FAIL ', name, detail); } };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'acad-el-'));
const BOX = { params: [], features: [{ id: 'b1', type: 'primitive', name: 'Kutu 1', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '30', h: '20', op: 'new' }] };

async function launch(userData, env = {}) {
  const app = await electron.launch({ args: [ROOT, ...SANDBOX_ARGS], env: { ...process.env, MIHENK_USERDATA: userData, ...env } });
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.app && window.app.ready, null, { timeout: 90000 });
  await page.evaluate(() => window.app.ready);
  return { app, page };
}
const stubDialogs = (app, o) => app.evaluate(({ dialog }, o) => {
  globalThis.__dlg = { save: 0, open: 0, box: 0 };
  dialog.showSaveDialog = async () => { globalThis.__dlg.save++; return o.save ? { canceled: false, filePath: o.save } : { canceled: true }; };
  dialog.showOpenDialog = async () => { globalThis.__dlg.open++; return o.open ? { canceled: false, filePaths: [o.open] } : { canceled: true, filePaths: [] }; };
  dialog.showMessageBoxSync = () => { globalThis.__dlg.box++; return 1; }; // kapatma onayı: "kaydetmeden kapat"
}, o);
const dlgCounts = (app) => app.evaluate(() => ({ ...globalThis.__dlg }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- dış sunucu (hiçbir istek ulaşmamalı)
const hits = [];
const srv = http.createServer((q, r) => { hits.push(q.url); r.setHeader('Content-Type', 'text/html'); r.end('<!doctype html><title>x</title>'); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r)); const PORT = srv.address().port;

// ================================================================ 1. güvenlik duruşu
console.log('1: güvenlik duruşu (sandbox, CSP, ağ, izinler, gezinti, IPC)');
const ud1 = path.join(TMP, 'ud1');
let { app, page } = await launch(ud1);
const wp = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { sandbox: w.sandbox, ci: w.contextIsolation, ni: w.nodeIntegration, ws: w.webSecurity, wv: w.webviewTag }; });
check('webPreferences: sandbox:true, contextIsolation, nodeIntegration kapalı', wp.sandbox === true && wp.ci === true && wp.ni === false && wp.ws === true && wp.wv === false, JSON.stringify(wp));
check('sayfa app://mihenk/ kökeninde', page.url().startsWith('app://mihenk/'));
const ASSETS = (() => { const l = fs.readdirSync(path.join(ROOT, 'dist/assets')); return { worker: l.find((n) => /^worker-.*\.js$/.test(n)), main: l.find((n) => /^index-.*\.js$/.test(n)) }; })();
const R = await page.evaluate(async ([PORT, ASSETS]) => {
  const o = {};
  o.nodeGlobals = [typeof require, typeof process, typeof Buffer].join(',');
  o.nativeKeys = Object.keys(window.native).sort().join(',');
  const r = await fetch(location.href); o.csp = r.headers.get('content-security-policy');
  o.cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content;
  o.workerCsp = (await fetch('app://mihenk/assets/' + ASSETS.worker)).headers.get('content-security-policy');
  o.mainJsCsp = (await fetch('app://mihenk/assets/' + ASSETS.main)).headers.get('content-security-policy');
  window.__x = 0; const s = document.createElement('script'); s.textContent = 'window.__x = 1'; document.body.append(s);
  const d = document.createElement('div'); d.innerHTML = '<img src=x onerror="window.__x=2">'; document.body.append(d);
  await new Promise((r) => setTimeout(r, 400)); o.inlineRan = window.__x;
  const tryNet = async (f) => { try { await f(); return 'gitti'; } catch (e) { return 'engel'; } };
  o.fetchExt = await tryNet(() => fetch('http://127.0.0.1:' + PORT + '/fetch', { mode: 'no-cors' }));
  o.fetchExt2 = await tryNet(() => fetch('https://example.com/', { mode: 'no-cors' }));
  await new Promise((res) => { const i = new Image(); i.onload = i.onerror = res; i.src = 'http://127.0.0.1:' + PORT + '/img'; });
  try { navigator.sendBeacon('http://127.0.0.1:' + PORT + '/beacon', 'x'); } catch (e) {}
  o.ws = await new Promise((res) => { try { const s = new WebSocket('ws://127.0.0.1:' + PORT + '/ws'); s.onopen = () => res('acildi'); s.onerror = () => res('engel'); } catch (e) { res('engel'); } });
  o.notification = await Notification.requestPermission();
  o.permGeo = (await navigator.permissions.query({ name: 'geolocation' })).state;
  o.permCam = (await navigator.permissions.query({ name: 'camera' })).state;
  o.geoCall = await new Promise((res) => navigator.geolocation.getCurrentPosition(() => res('izin'), (e) => res('ret' + e.code), { timeout: 4000 }));
  const win = window.open('http://127.0.0.1:' + PORT + '/popup', '_blank'); o.windowOpen = win === null ? 'null' : 'pencere';
  // sürükle-bırak: dosya bırakma varsayılan eylemi (gezinme) iptal edilir
  const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.html', { type: 'text/html' }));
  const ev = new DragEvent('drop', { dataTransfer: dt, cancelable: true, bubbles: true }); window.dispatchEvent(ev); o.dropPrevented = ev.defaultPrevented;
  return o;
}, [PORT, ASSETS]);
check('Node globalleri renderer\'da yok', R.nodeGlobals === 'undefined,undefined,undefined', R.nodeGlobals);
check('köprü yüzeyi: yol parametreli işlev yok, beklenen üyeler', R.nativeKeys === 'argvFile,docState,getSetting,openFile,openRecent,recentList,recoveryClear,recoveryLoad,recoverySave,saveFile,setDirty,setSetting,setStrings,setTitle,versions', R.nativeKeys);
check('CSP yanıt başlığı = electron/csp.cjs', R.csp === CSP, R.csp);
check('CSP meta etiketi = başlık', R.cspMeta === CSP);
check('ana betik de aynı sıkı CSP\'yi alır (unsafe-eval yok)', R.mainJsCsp === CSP && !/'unsafe-eval'/.test(R.mainJsCsp || ''), String(R.mainJsCsp));
check('yalnız çekirdek işçisi betiği unsafe-eval alır', !!R.workerCsp && /'unsafe-eval'/.test(R.workerCsp) && !/'unsafe-inline'/.test(R.workerCsp), String(R.workerCsp));
check('satır içi betik / olay işleyicisi ÇALIŞMADI', R.inlineRan === 0, String(R.inlineRan));
check('dış fetch (127.0.0.1 ve https) engellendi', R.fetchExt === 'engel' && R.fetchExt2 === 'engel', R.fetchExt + R.fetchExt2);
check('WebSocket engellendi', R.ws === 'engel', R.ws);
const viaSess = await app.evaluate(({ session }, p) => session.defaultSession.fetch('http://127.0.0.1:' + p + '/session').then(() => 'gitti', () => 'engel'), PORT);
check('webRequest: CSP\'den bağımsız (ana süreç oturumu) dış istek iptal', viaSess === 'engel', viaSess);
const viaSessFile = await app.evaluate(({ session }) => session.defaultSession.fetch('file:///etc/hostname').then(() => 'gitti', () => 'engel'));
check('webRequest: file:// isteği iptal', viaSessFile === 'engel', viaSessFile);
check('sunucuya hiçbir istek ulaşmadı', hits.length === 0, hits.join(','));
check('izinler reddedildi (bildirim, konum, kamera)', R.notification === 'denied' && R.permGeo !== 'granted' && R.permCam !== 'granted' && R.geoCall.startsWith('ret'), JSON.stringify([R.notification, R.permGeo, R.permCam, R.geoCall]));
check('window.open reddedildi, yeni pencere yok', R.windowOpen === 'null' && (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 1, R.windowOpen);
check('drop olayı varsayılan eylemi iptal edildi', R.dropPrevented === true);
// gezinti: dış adres, file://, javascript:
for (const u of ['http://127.0.0.1:' + PORT + '/evil', 'file:///etc/hostname', 'https://example.com/']) {
  await page.evaluate((u) => { location.href = u; }, u).catch(() => {});
  await sleep(1200);
  check('gezinti engellendi: ' + u.slice(0, 30), page.url().startsWith('app://mihenk/'), page.url());
}
check('gezinti sonrası sunucuya istek yok', hits.length === 0, hits.join(','));
// webview etiketi
const wv = await page.evaluate(() => { const w = document.createElement('webview'); w.src = 'data:text/html,x'; document.body.append(w); return typeof w.getURL; });
check('<webview> işlevsiz', wv !== 'function', wv);
// IPC: renderer yol GÖNDEREMEZ
const evilPath = path.join(TMP, 'EVIL.txt');
const ipc = await page.evaluate(async (evilPath) => {
  const o = {}; const data = new Uint8Array([1, 2, 3]);
  const tryIt = async (f) => { try { await f(); return 'KABUL'; } catch (e) { return 'RET'; } };
  o.pathKey = await tryIt(() => window.native.saveFile({ path: evilPath, saveAs: false, data, defaultName: 'x', kind: 'acad' }));
  o.pathOnly = await tryIt(() => window.native.saveFile({ path: evilPath, data }));
  o.badKind = await tryIt(() => window.native.saveFile({ saveAs: false, data, defaultName: 'x', kind: 'exe' }));
  o.protoKind = await tryIt(() => window.native.saveFile({ saveAs: false, data, defaultName: 'x', kind: 'toString' }));
  o.strData = await tryIt(() => window.native.saveFile({ saveAs: false, data: 'metin', defaultName: 'x', kind: 'acad' }));
  o.arrData = await tryIt(() => window.native.saveFile({ saveAs: false, data: [1, 2, 3], defaultName: 'x', kind: 'acad' }));
  o.saveAsStr = await tryIt(() => window.native.saveFile({ saveAs: 'yes', data, defaultName: 'x', kind: 'acad' }));
  o.badOpen = await tryIt(() => window.native.openFile('exe'));
  o.recBad = await tryIt(() => window.native.recoverySave('metin'));
  return o;
}, evilPath);
check('IPC: yol anahtarlı / geçersiz tür / geçersiz veri çağrıları REDDEDİLDİ', Object.values(ipc).every((v) => v === 'RET'), JSON.stringify(ipc));
check('IPC: yol gönderilerek dosya YAZILAMADI', !fs.existsSync(evilPath));
// gönderen doğrulaması: app:// dışı bir çerçeveden (data:) ham ipcRenderer ile çağrı
const sender = await app.evaluate(async ({ BrowserWindow }) => {
  const w = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false } });
  await w.loadURL('data:text/html,<title>evil</title>');
  const r = await w.webContents.executeJavaScript(`(async () => { const { ipcRenderer } = require('electron'); const o = {};
    const t = async (f) => { try { await f(); return 'KABUL'; } catch (e) { return 'RET'; } };
    o.save = await t(() => ipcRenderer.invoke('native:save', { saveAs: true, data: new Uint8Array(1), defaultName: 'x', kind: 'acad' }));
    o.open = await t(() => ipcRenderer.invoke('native:open', 'acad'));
    o.argv = await t(() => ipcRenderer.invoke('native:argv'));
    o.rsave = await t(() => ipcRenderer.invoke('native:recoverySave', new Uint8Array(1)));
    o.rload = await t(() => ipcRenderer.invoke('native:recoveryLoad'));
    o.rclr = await t(() => ipcRenderer.invoke('native:recoveryClear'));
    ipcRenderer.send('native:setSetting', 'zehir', 'x'); ipcRenderer.send('native:title', 'ele gecirildi');
    o.get = ipcRenderer.sendSync('native:getSetting', 'lang');
    return o; })()`);
  w.destroy(); return r;
});
check('IPC gönderen doğrulaması: app:// dışı çerçeve tüm invoke çağrılarında reddedildi', ['save', 'open', 'argv', 'rsave', 'rload', 'rclr'].every((k) => sender[k] === 'RET') && sender.get === null, JSON.stringify(sender));
await sleep(300);
check('IPC gönderen doğrulaması: yetkisiz setSetting / setTitle etkisiz', !fs.existsSync(path.join(ud1, 'settings.json')) || !/zehir/.test(fs.readFileSync(path.join(ud1, 'settings.json'), 'utf8')), '');
check('IPC gönderen doğrulaması: başlık değişmedi', (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())) !== 'ele gecirildi');
// preload köprüsü başka kökende işlev vermez
const bridge = await app.evaluate(async ({ BrowserWindow }, preload) => {
  const w = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, sandbox: true } });
  await w.loadURL('data:text/html,<title>x</title>');
  const r = await w.webContents.executeJavaScript('typeof window.native'); w.destroy(); return r;
}, path.join(ROOT, 'electron', 'preload.cjs'));
check('preload köprüsü app:// dışında kurulmaz (data: sayfada window.native yok)', bridge === 'undefined', bridge);
// yol kaçışı (S-13): dist ile başlayan kardeş dizin
fs.mkdirSync(path.join(ROOT, 'dist-secret'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'dist-secret', 'x.txt'), 'SIR-DIST-KARDES');
const trav = await page.evaluate(async () => { const o = {}; for (const u of ['app://mihenk/%2e%2e%2fdist-secret/x.txt', 'app://mihenk/..%2fdist-secret%2fx.txt', 'app://mihenk/%252e%252e/package.json', 'app://mihenk/%2e%2e/package.json', 'app://mihenk/index.html%00.txt']) { try { const r = await fetch(u); o[u] = r.status + ':' + (await r.text()).slice(0, 15); } catch (e) { o[u] = 'ERR'; } } return o; });
fs.rmSync(path.join(ROOT, 'dist-secret'), { recursive: true, force: true });
check('app:// yol kaçışı: dist-secret kardeş dizini ve üst dizin okunamaz', Object.values(trav).every((v) => !/SIR|"name"/.test(v) && !v.startsWith('200:')), JSON.stringify(trav));
check('F12 geliştirmede çalışır (paketlenmemiş); paketliyken devTools:false + F12 işleyicisi yok (kaynak denetimi)', await (async () => {
  const src = fs.readFileSync(path.join(ROOT, 'electron/main.cjs'), 'utf8');
  return /devTools: DEV/.test(src) && /if \(DEV\) win\.webContents\.on\('before-input-event'/.test(src);
})());
await app.close();

// ================================================================ 2. dosya: kaydet/aç/dışa aktar, atomik + .bak
console.log('2: dosya akışı (diyalog yolu, geçerli belge yolu, .bak, hata)');
const ud2 = path.join(TMP, 'ud2'); ({ app, page } = await launch(ud2));
const f1 = path.join(TMP, 'is1.mhnk'), f2 = path.join(TMP, 'is2.mhnk');
await stubDialogs(app, { save: f1 });
await page.evaluate(async (d) => { await window.app.loadDoc(d); await window.app.whenIdle(); window.app.markDirty(true); }, BOX);
await page.evaluate(() => window.app.save());
check('ilk Kaydet: diyalog açıldı, dosya yazıldı', (await dlgCounts(app)).save === 1 && fs.existsSync(f1) && JSON.parse(fs.readFileSync(f1, 'utf8')).app === 'Mihenk');
const v1 = fs.readFileSync(f1, 'utf8');
await page.evaluate(() => { window.app.doc.features[0].w = '55'; window.app.markDirty(true); return window.app.save(); });
const c2 = await dlgCounts(app);
check('ikinci Kaydet: diyalog YOK (ana süreçteki geçerli belge yolu), dosya güncellendi', c2.save === 1 && JSON.parse(fs.readFileSync(f1, 'utf8')).doc.features[0].w === '55');
check('.bak = bir önceki sürüm', fs.existsSync(f1 + '.bak') && fs.readFileSync(f1 + '.bak', 'utf8') === v1);
check('kayıt sonrası geçici dosya kalmadı', fs.readdirSync(TMP).every((n) => !n.endsWith('.tmp')));
await stubDialogs(app, { save: f2 });
await page.evaluate(() => window.app.save(true));
check('Farklı Kaydet: diyalog açıldı, yeni yola yazıldı', (await dlgCounts(app)).save === 1 && fs.existsSync(f2));
await page.evaluate(() => { window.app.doc.features[0].w = '66'; window.app.markDirty(true); return window.app.save(); });
check('Farklı Kaydet sonrası Kaydet yeni yola yazar (diyaloğ yok)', (await dlgCounts(app)).save === 1 && JSON.parse(fs.readFileSync(f2, 'utf8')).doc.features[0].w === '66' && JSON.parse(fs.readFileSync(f1, 'utf8')).doc.features[0].w === '55');
// Yeni belge: geçerli yol sıfırlanır → önceki dosya ezilmez
await page.evaluate(() => { window.app.markDirty(false); return window.app.newDoc(); });
await page.evaluate(async (d) => { await window.app.loadDoc(d); window.app.markDirty(true); }, BOX);
await stubDialogs(app, { save: null });
await page.evaluate(() => window.app.save());
const sz = fs.statSync(f2).size;
check('Yeni belgeden sonra Kaydet diyalog açar (önceki dosyanın üzerine yazmaz)', (await dlgCounts(app)).save === 1 && JSON.parse(fs.readFileSync(f2, 'utf8')).doc.features[0].w === '66' && fs.statSync(f2).size === sz);
// Aç: geçerli belge yolu = açılan dosya
await stubDialogs(app, { open: f1 });
await page.evaluate(() => { window.app.markDirty(false); return window.app.openFile(); });
check('Aç: dosya yüklendi', (await page.evaluate(() => window.app.doc.features[0].w)) === '55');
await page.evaluate(() => { window.app.doc.features[0].w = '77'; window.app.markDirty(true); return window.app.save(); });
check('Aç sonrası Kaydet açılan dosyaya yazar (diyalog yok)', (await dlgCounts(app)).save === 0 && JSON.parse(fs.readFileSync(f1, 'utf8')).doc.features[0].w === '77');
// bozuk (şema geçersiz) dosya: mevcut belge korunur, kayıt hedefi değişmez
const badF = path.join(TMP, 'bad.mhnk'); fs.writeFileSync(badF, JSON.stringify({ app: 'Mihenk', version: 1, doc: { params: [null], features: [] } }));
await stubDialogs(app, { open: badF });
const before = await page.evaluate(() => JSON.stringify(window.app.doc));
await page.evaluate(() => { window.app.markDirty(false); return window.app.openFile(); });
const toastBad = await page.evaluate(() => document.querySelector('#toast').textContent);
check('şema geçersiz dosya: anlaşılır uyarı, mevcut belge DEĞİŞMEDİ', (await page.evaluate(() => JSON.stringify(window.app.doc))) === before && /geçersiz|invalid/i.test(toastBad), toastBad);
await page.evaluate(() => { window.app.markDirty(true); return window.app.save(); });
check('şema geçersiz dosya açılamayınca Kaydet o dosyanın üstüne yazmaz', JSON.parse(fs.readFileSync(badF, 'utf8')).doc.params[0] === null);
// hata: yazılamayan hedef → anlaşılır hata, hedefe dokunulmaz, mevcut dosya aynı
await stubDialogs(app, { save: path.join(TMP, 'yok-dizin', 'x.mhnk') });
await page.evaluate(() => window.app.save(true));
const toastErr = await page.evaluate(() => document.querySelector('#toast').textContent);
check('yazma hatası: toast gösterildi, dizin/dosya oluşmadı', !fs.existsSync(path.join(TMP, 'yok-dizin')) && toastErr.length > 5 && toastErr !== '', toastErr);
// dışa aktarma: her zaman diyalog; tür uzantısı zorlanır
const stepOut = path.join(TMP, 'parca'); await stubDialogs(app, { save: stepOut });
await page.evaluate(async (d) => { await window.app.loadDoc(d); await window.app.whenIdle(); return window.app.exportFile('step'); }, BOX);
check('STEP dışa aktar: diyalog + uzantı zorlandı + geçerli STEP', fs.existsSync(stepOut + '.step') && /ISO-10303-21/.test(fs.readFileSync(stepOut + '.step', 'latin1').slice(0, 40)));
await app.close();


// ---- .mhnk belgesi: aç → Kaydet aynı dosyaya yazar (diyalog yok), app alanı Mihenk
console.log('2b: .mhnk açılır, Kaydet aynı dosyaya yazar');
const udA = path.join(TMP, 'udA'); ({ app, page } = await launch(udA));
const docF = path.join(TMP, 'acik.mhnk'); fs.writeFileSync(docF, JSON.stringify({ app: 'Mihenk', version: 1, doc: BOX }));
await stubDialogs(app, { open: docF });
await page.evaluate(() => window.app.openFile());
await page.evaluate(() => window.app.whenIdle());
check('.mhnk (app: Mihenk) açıldı', (await page.evaluate(() => Math.abs(window.app.result.bodies[0].volume - 24000) < 1)));
await page.evaluate(() => { window.app.markDirty(true); return window.app.save(); });
const jn = JSON.parse(fs.readFileSync(docF, 'utf8'));
check('.mhnk açıkken Kaydet: diyalog açılmadan aynı dosyaya yazıldı (app=Mihenk)', (await dlgCounts(app)).save === 0 && jn.app === 'Mihenk');
const noExt = path.join(TMP, 'uzantisiz'); await stubDialogs(app, { save: noExt });
await page.evaluate(() => window.app.save(true));
check('uzantısız kayıt adına .mhnk eklenir', fs.existsSync(noExt + '.mhnk') && !fs.existsSync(noExt));
const recent = await page.evaluate(() => window.native.recentList());
check('son kullanılanlar: kaydedilen .mhnk listede, açma dizinle', Array.isArray(recent) && recent.length >= 1 && recent[0].name === 'uzantisiz.mhnk' && (await page.evaluate(async () => { const r = await window.native.openRecent(0); return r && r.name; })) === 'uzantisiz.mhnk' && (await page.evaluate(() => window.native.openRecent(99))) === null);
const dxfOut = path.join(TMP, 'cizim.dxf'); await stubDialogs(app, { save: dxfOut });
const dxfRes = await page.evaluate(async () => { const r = await window.native.saveFile({ saveAs: true, data: new TextEncoder().encode('0\nSECTION\n0\nEOF\n'), defaultName: 'cizim.dxf', kind: 'dxf' }); return r; });
check('DXF dosya türü: kayıt diyaloğu .dxf yazar', typeof dxfRes === 'string' && fs.existsSync(dxfOut) && fs.readFileSync(dxfOut, 'utf8').includes('SECTION'));
await stubDialogs(app, { open: dxfOut });
const dxfIn = await page.evaluate(async () => { const r = await window.native.openFile('dxf'); return r && r.name; });
check('DXF dosya türü: açma diyaloğu .dxf kabul eder', dxfIn === 'cizim.dxf');
await app.close();
// ================================================================ 3. otomatik kurtarma
console.log('3: otomatik kurtarma (temiz kapanış, çökme, sor)');
const ud3 = path.join(TMP, 'ud3'); const recF = path.join(ud3, 'recovery', 'autosave.mhnk');
({ app, page } = await launch(ud3));
await stubDialogs(app, {});
await page.evaluate(async (d) => { await window.app.loadDoc(d); await window.app.whenIdle(); }, BOX);
check('temiz belgede kurtarma yazılmaz', (await page.evaluate(() => window.app.recoveryTick())) === false && !fs.existsSync(recF));
check('60 sn zamanlayıcı kurulu', (await page.evaluate(() => window.app.recoveryMs)) === 60000);
await page.evaluate(() => { window.app.doc.features[0].w = '88'; window.app.markDirty(true); return window.app.recoveryTick(); });
check('değişiklik varken kurtarma dosyası yazıldı', fs.existsSync(recF) && JSON.parse(fs.readFileSync(recF, 'utf8')).doc.features[0].w === '88');
await app.close();
check('temiz kapanışta kurtarma dosyası SİLİNDİ', !fs.existsSync(recF));
({ app, page } = await launch(ud3)); await stubDialogs(app, {});
check('temiz kapanıştan sonra açılışta soru çıkmaz', !(await page.evaluate(() => !document.querySelector('#modal').classList.contains('hidden'))));
await page.evaluate(async (d) => { await window.app.loadDoc(d); await window.app.whenIdle(); window.app.doc.features[0].w = '99'; window.app.markDirty(true); return window.app.recoveryTick(); }, BOX);
check('kurtarma yeniden yazıldı', fs.existsSync(recF));
app.process().kill('SIGKILL'); await sleep(800);
check('çökme (SIGKILL) sonrası kurtarma dosyası kaldı', fs.existsSync(recF));
({ app, page } = await launch(ud3)); await stubDialogs(app, {});
await page.waitForSelector('#modal:not(.hidden)', { timeout: 15000 });
const recTxt = await page.innerText('#modal');
check('açılışta kullanıcıya soruldu (iki dilli metin)', /Kurtarma dosyası bulundu|Recovery file found/.test(recTxt), recTxt.slice(0, 80));
await page.click('#modal button.pri'); await page.waitForFunction(() => window.app.doc.features.length === 1 && window.app.doc.features[0].w === '99');
await page.evaluate(() => window.app.whenIdle());
check('Kurtar: belge geri geldi, değişmiş (dirty) durumda, geometri hesaplandı', (await page.evaluate(() => window.app.dirty && Math.abs(window.app.result.bodies[0].volume - 99 * 30 * 20) < 1)));
check('kurtarma dosyası kaydedilene kadar saklanır', fs.existsSync(recF));
await stubDialogs(app, { save: path.join(TMP, 'kurtarilan.mhnk') });
await page.evaluate(() => window.app.save());
await sleep(300);
check('kaydedince kurtarma dosyası silindi', !fs.existsSync(recF) && fs.existsSync(path.join(TMP, 'kurtarilan.mhnk')));
// reddetme yolu
await page.evaluate(() => { window.app.doc.features[0].w = '11'; window.app.markDirty(true); return window.app.recoveryTick(); });
app.process().kill('SIGKILL'); await sleep(800);
({ app, page } = await launch(ud3)); await stubDialogs(app, {});
await page.waitForSelector('#modal:not(.hidden)', { timeout: 15000 });
await page.click('#modal button:not(.pri)'); await sleep(500);
check('Sil: kurtarma dosyası silindi, boş belgeyle açıldı', !fs.existsSync(recF) && (await page.evaluate(() => window.app.doc.features.length)) === 0);
await app.close();

// ================================================================ 4. kurulum dili → ilk açılış dili
console.log('4: kurulum dili aktarımı');
for (const [lang, menu] of [['en', 'File'], ['tr', 'Dosya']]) {
  const lf = path.join(TMP, 'lang-' + lang); fs.writeFileSync(lf, lang + '\n');
  ({ app, page } = await launch(path.join(TMP, 'udl-' + lang), { MIHENK_LANGFILE: lf }));
  const got = await page.evaluate(() => ({ s: window.native.getSetting('lang'), m: document.querySelector('#menubar button[data-menu=file]').textContent, l: document.documentElement.lang }));
  check(`kurulum dili ${lang}: ilk açılış dili ${lang}`, got.s === lang && got.m === menu && got.l === lang, JSON.stringify(got));
  await app.close();
}
fs.mkdirSync(path.join(TMP, 'udl-pref'), { recursive: true }); fs.writeFileSync(path.join(TMP, 'udl-pref', 'settings.json'), '{"lang":"tr"}');
({ app, page } = await launch(path.join(TMP, 'udl-pref'), { MIHENK_LANGFILE: path.join(TMP, 'lang-en') }));
check('kayıtlı kullanıcı tercihi kurulum dilini ezer', (await page.evaluate(() => window.native.getSetting('lang'))) === 'tr');
await app.close();

// ================================================================ 5. öz-test (sandbox:true) alt süreç olarak
console.log('5: öz-test');
const st = spawnSync('npx', ['electron', ...SANDBOX_ARGS, '.'], { cwd: ROOT, env: { ...process.env, MIHENK_SELFTEST: '1' }, encoding: 'utf8', timeout: 150000, shell: process.platform === 'win32' });
const line = (st.stdout || '').split('\n').find((l) => l.startsWith('SELFTEST')) || '(çıktı yok)';
check('Electron öz-testi (sandbox:true) GEÇTI', /^SELFTEST GEÇTI/.test(line) && /sandbox=true/.test(line) && /serverHits=0/.test(line), line.slice(0, 300));

srv.close(); try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch (e) { console.log('  (geçici klasör silinemedi, yok sayıldı: ' + e.code + ')'); } // Windows: Chromium birkaç yüz ms dosya tutabilir
console.log(`\n${pass} geçti, ${failN} kaldı`); process.exit(failN ? 1 : 0);
