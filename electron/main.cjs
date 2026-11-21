// Mihenk CAD/CAM Electron ana süreci: tek pencere, app:// protokolü, yerel dosya diyalogları.
// Güvenlik ilkesi: renderer güvenilmeyen kabul edilir. Dosya yolu yalnız ana süreçte, kullanıcının diyalogla
// seçtiği ya da açtığı yoldan gelir; tüm IPC işleyicileri göndereni doğrular; ağ tümden kapalıdır.
const { app, BrowserWindow, Menu, protocol, dialog, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { atomicWrite, isInside } = require('./safe-write.cjs');
const { CSP, WORKER_CSP, isWorkerScript } = require('./csp.cjs');
const { createLogger } = require('./log.cjs');
const { examplesDir, listExamples, readExample } = require('./examples.cjs');

const DIST = path.join(__dirname, '..', 'dist');
const DEV = !app.isPackaged;                                  // geliştirme: paketlenmemiş
const SELFTEST = DEV && process.env.MIHENK_SELFTEST === '1';  // öz-test yalnız geliştirmede
const ORIGIN = 'app://mihenk/';
const MAX_FILE = 200 * 1024 * 1024;                           // dosya boyutu üst sınırı (200 MB)
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};
// Dosya türü → izinli uzantılar (yazma ve okuma ana süreçte bu listeyle sınırlanır)
// 'doc' = Mihenk belgesi: okuma ve yazma .mhnk.
const KINDS = { doc: ['.mhnk'], step: ['.step', '.stp'], stl: ['.stl'], iges: ['.igs', '.iges'], dxf: ['.dxf'], nc: ['.nc', '.txt'], json: ['.json'], html: ['.html'], pdf: ['.pdf'], csv: ['.csv'], underlay: ['.png', '.jpg', '.jpeg', '.pdf'], ncread: ['.nc', '.tap', '.txt'] }; // WP-17: teknik resim PDF, ilk parça formu CSV
const SAVE_ONLY = new Set(['nc', 'html', 'pdf', 'csv']);
const OPEN_ONLY = new Set(['underlay', 'ncread']);                   // WP-22a: eskiz altlığı (PNG/JPEG/PDF) yalnız okunur; yazma reddedilir   // NC çıktısı ve kurulum föyü (WP-07) yalnız yazılır; arayüz bu türde dosya açtıramaz
const DOC_EXT = '.mhnk';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// Kum havuzu (sandbox) AÇIK kalır. Kök kullanıcıda gereken --no-sandbox yalnız komut satırından verilir.
if (SELFTEST) {
  // ekransız ortamda WebGL için yazılım çizimi
  app.commandLine.appendSwitch('use-gl', 'angle');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}
// Ağ kapalı: DNS çözümü de kapatılır (savunma katmanı; asıl engel webRequest)
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');

// Kendi kullanıcı verisi klasörü (sınama sırasında gerçek ayarları bozmamak için; yalnız geliştirmede)
if (DEV && process.env.MIHENK_USERDATA) app.setPath('userData', path.resolve(process.env.MIHENK_USERDATA));
else if (SELFTEST) app.setPath('userData', path.join(os.tmpdir(), 'mihenk-selftest-' + process.pid));

// ---- çökme/hata günlüğü (yerel; ağ yok; kişisel veri maskelenir): userData/logs/mihenk-log.txt, döner (5 × 1 MB)
let logger = null;
function log(kind, message, stack) {
  try { if (!logger) logger = createLogger({ dir: path.join(app.getPath('userData'), 'logs'), version: app.getVersion(), electron: process.versions.electron, platform: process.platform, roots: { appPath: app.getAppPath(), userData: app.getPath('userData'), temp: app.getPath('temp') } }); logger.write(kind, message, stack); } catch (e) { /* günlük hatası uygulamayı etkilemez */ }
}
// Yakalanmamış ana süreç hatası: günlüğe yaz, kullanıcıya hata kutusu göster, kontrollü çık (bozuk durumda sürdürme). Kurtarma dosyası
// (userData/recovery) silinmez; sonraki açılışta kurtarma sorulur.
const FATAL = {
  tr: { t: 'Mihenk beklenmedik bir hatayla karşılaştı', m: 'Uygulama kapatılacak. Son otomatik kayıt varsa bir sonraki açılışta size sunulur. Hata, Yardım menüsündeki günlük klasörüne yazıldı.' }, // i18n-ignore: ana süreç hata kutusu, iki dilli
  en: { t: 'Mihenk hit an unexpected error', m: 'The application will close. If an automatic recovery copy exists it is offered on the next launch. The error was written to the log folder.' },
};
let fatalHandled = false;
process.on('uncaughtException', (e) => {
  log('main-uncaught', e && e.message, e && e.stack);
  if (fatalHandled) return; fatalHandled = true;
  let lang = 'tr'; try { if (settings && settings.lang === 'en') lang = 'en'; } catch (x) { /* ayar henüz yok */ }
  try { dialog.showErrorBox(FATAL[lang].t, FATAL[lang].m); } catch (x) { /* kutu gösterilemezse de çık */ }
  app.exit(1);
});
process.on('unhandledRejection', (e) => { log('main-rejection', e && e.message ? e.message : String(e), e && e.stack); });
app.on('render-process-gone', (ev, wc, d) => log('render-gone', 'reason=' + (d && d.reason) + ' exit=' + (d && d.exitCode)));
app.on('child-process-gone', (ev, d) => log('child-gone', 'type=' + (d && d.type) + ' reason=' + (d && d.reason) + ' exit=' + (d && d.exitCode)));

let win = null;
let dirty = false;
let blockedCount = 0;                // webRequest ile iptal edilen istek sayısı (öz-test kanıtı)
let currentPath = null;              // bu oturumda diyalogla açılmış/kaydedilmiş geçerli belge yolu
let pendingPath = null;              // açılmış ama arayüz yüklemeyi henüz onaylamamış belge yolu

// ---- ayarlar: userData/settings.json (dil tercihi vb.). Yalnız düz anahtar → sayı/metin/mantıksal değer.
const settings = {};
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const validKey = (k) => typeof k === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,39}$/.test(k);
// CAM tezgâh profilleri ve takım kütüphanesi JSON metni olarak saklanır: bu iki anahtar için üst sınır daha büyüktür.
const BIG_KEYS = { machines: 1 << 20, toolLibrary: 4 << 20 };
const validVal = (v, k) => v === null || typeof v === 'boolean' || typeof v === 'number' || (typeof v === 'string' && v.length <= (BIG_KEYS[k] || 200));
function loadSettings() {
  try {
    const j = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (j && typeof j === 'object' && !Array.isArray(j)) for (const [k, v] of Object.entries(j)) if (validKey(k) && validVal(v, k)) settings[k] = v;
  } catch (e) { /* dosya yok ya da bozuk: varsayılanlarla başla */ }
}
function saveSettings() {
  try {
    const f = settingsFile(); fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + '.tmp', JSON.stringify(settings, null, 2)); fs.renameSync(f + '.tmp', f);
  } catch (e) { console.error('settings write failed:', e.message); }
}
// Kurulumun yazdığı dil dosyası (kurulum dizinindeki `lang`: "tr" ya da "en"). Yalnız ilk açılışta (kayıtlı tercih yokken) okunur.
function applyInstallLang() {
  if ('lang' in settings) return;
  const f = DEV ? process.env.MIHENK_LANGFILE : path.join(path.dirname(app.getPath('exe')), 'lang');
  if (!f) return;
  try {
    const v = fs.readFileSync(f, 'utf8').trim().toLowerCase();
    if (v === 'tr' || v === 'en') { settings.lang = v; saveSettings(); }
  } catch (e) { /* dosya yok: işletim sistemi dili kullanılır */ }
}

// Arayüzün gönderdiği diyalog metinleri (tek sözlük arayüz tarafında; dil değişince yenilenir)
const strings = {};
const STRING_KEYS = ['closeMsg', 'closeDetail', 'closeCancel', 'closeDiscard', 'filterDoc', 'filterStep', 'filterStl', 'filterDxf', 'filterNc', 'filterJson', 'tSave', 'tOpen', 'tImport', 'tExport'];

// ---- son kullanılan belgeler: userData/recent.json (yol + zaman); arayüze yalnız ad/klasör/zaman gider, açma dizinle yapılır
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
function loadRecent() {
  try { const j = JSON.parse(fs.readFileSync(recentFile(), 'utf8')); return Array.isArray(j) ? j.filter((x) => x && typeof x.path === 'string' && Number.isFinite(x.ms)).slice(0, 8) : []; } catch (e) { return []; }
}
function addRecent(p) {
  try {
    const list = [{ path: p, ms: Date.now() }, ...loadRecent().filter((x) => x.path !== p)].slice(0, 8);
    fs.mkdirSync(path.dirname(recentFile()), { recursive: true }); fs.writeFileSync(recentFile(), JSON.stringify(list));
  } catch (e) { console.error('recent write failed:', e.message); }
}
const liveRecent = () => loadRecent().filter((x) => { try { return fs.statSync(x.path).isFile(); } catch (e) { return false; } });

// ---- kurtarma dosyası (S-06): userData/recovery/autosave.mhnk
const recoveryFile = () => path.join(app.getPath('userData'), 'recovery', 'autosave.mhnk');
function clearRecovery() { try { fs.rmSync(recoveryFile(), { force: true }); } catch (e) { /* yoksa sorun değil */ } }

// ---- gönderen doğrulaması (S-01/S-03): yalnız ana pencerenin ana çerçevesi ve app://mihenk/ kökeni
function okSender(ev) {
  try {
    const f = ev.senderFrame;
    return !!(f && win && !win.isDestroyed() && ev.sender === win.webContents && f === ev.sender.mainFrame && typeof f.url === 'string' && f.url.startsWith(ORIGIN));
  } catch (e) { return false; }
}
const guarded = (fn) => async (ev, ...a) => { if (!okSender(ev)) throw new Error('forbidden'); return fn(ev, ...a); };

function argvDoc(argv) {
  const f = argv.slice(1).find((a) => /\.mhnk$/i.test(a) && !a.startsWith('--'));
  if (!f || f.startsWith('\\\\') || f.startsWith('//')) return null;   // UNC (ağ) yolu: kimlik doğrulama sızdırabilir, açılmaz
  return path.resolve(f);
}

function readLimited(p) {
  const st = fs.statSync(p);
  if (!st.isFile() || st.size > MAX_FILE) throw new Error('file too large or not a file');
  return new Uint8Array(fs.readFileSync(p));
}

function safeFilters(filters, kind, save) {
  const exts = (kind === 'doc' && !save ? KINDS.doc : kind === 'doc' ? [DOC_EXT] : KINDS[kind]).map((e) => e.slice(1));
  const names = { doc: strings.filterDoc, step: strings.filterStep, stl: strings.filterStl, dxf: strings.filterDxf, nc: strings.filterNc, json: strings.filterJson, underlay: 'PNG / JPEG / PDF', ncread: strings.filterNc };
  return [{ name: String(names[kind] || kind.toUpperCase()).slice(0, 60), extensions: exts }];
}
function safeName(n, kind) {
  let b = typeof n === 'string' ? path.basename(n.replace(/\\/g, '/')) : '';
  b = b.replace(/[<>:"|?*\u0000-\u001f]/g, '_').slice(0, 120);
  if (!b || /^\.+$/.test(b)) b = 'Belge'; // i18n-ignore: yedek dosya adı
  return b;
}
const titleFor = (kind, open) => (open ? (kind === 'doc' ? strings.tOpen : strings.tImport) : (kind === 'doc' ? strings.tSave : strings.tExport)) || undefined;

function registerProtocol() {
  protocol.handle('app', async (req) => {
    try {
      const u = new URL(req.url);
      if (u.host !== 'mihenk') return new Response('Forbidden', { status: 403 });
      let rel = decodeURIComponent(u.pathname);
      if (rel.includes('\0')) return new Response('Not Found', { status: 404 });
      if (rel === '/' || rel === '') rel = '/index.html';
      const file = path.normalize(path.join(DIST, rel));
      if (file === DIST || !isInside(DIST, file)) return new Response('Forbidden', { status: 403 });
      const data = await fs.promises.readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      // CSP her yanıtta: worker betikleri de kendi ilkesini yanıt başlığından alır
      return new Response(data, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Content-Security-Policy': isWorkerScript(rel) ? WORKER_CSP : CSP, 'X-Content-Type-Options': 'nosniff' } });
    } catch (e) {
      return new Response('Not Found', { status: 404 });
    }
  });
}

// ---- ağ, izin ve gezinti kilitleri
function lockdownSession(ses) {
  // app://, blob:, data: (ve yalnız geliştirmede devtools:) dışındaki her istek iptal edilir
  ses.webRequest.onBeforeRequest((d, cb) => {
    const u = d.url;
    const ok = u.startsWith(ORIGIN) || u.startsWith('blob:') || u.startsWith('data:') || (DEV && u.startsWith('devtools:'));
    if (!ok) blockedCount++;
    cb({ cancel: !ok });
  });
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  if (ses.setDevicePermissionHandler) ses.setDevicePermissionHandler(() => false);
}
function lockdownContents(wc) {
  const isOurs = (u) => typeof u === 'string' && u.startsWith(ORIGIN);
  wc.on('will-navigate', (e, url) => { if (!isOurs(url)) e.preventDefault(); });
  wc.on('will-frame-navigate', (e) => { if (!isOurs(e.url)) e.preventDefault(); });
  wc.on('will-redirect', (e, url) => { if (!isOurs(url)) e.preventDefault(); });
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  // çizici ve çekirdek işçisi hataları: konsol 'error' düzeyi (yakalanmamış istisnalar ve app.js'in 'worker hatası' kaydı dahil)
  wc.on('console-message', (ev) => { try { if (ev.level === 'error' || ev.level === 3) log('console-error', ev.message); } catch (e) { /* yoksay */ } });
  wc.on('unresponsive', () => log('unresponsive', 'pencere yanit vermiyor'));
}

function registerIpc() {
  // Yardım menüsü: günlük klasörünü işletim sistemi dosya yöneticisinde açar (yolu arayüz vermez, görmez)
  ipcMain.handle('native:openLogFolder', guarded(async () => { const dir = path.join(app.getPath('userData'), 'logs'); fs.mkdirSync(dir, { recursive: true }); const err = await shell.openPath(dir); return err === ''; }));
  // WP-21: örnek belgeler (kurulu: resources/ornekler; geliştirme: depo ornekler/). Yalnız ad listesi; açılan örnek belge yolu olmaz (Kaydet farklı kaydet diyaloğu açar)
  const exDir = () => examplesDir({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, appRoot: path.join(__dirname, '..') });
  ipcMain.handle('native:examples', guarded(async () => listExamples(exDir())));
  ipcMain.handle('native:openExample', guarded(async (ev, name) => { const r = readExample(exDir(), name); if (r) pendingPath = null; return r; }));
  ipcMain.handle('native:open', guarded(async (ev, kind) => {
    if (!Object.hasOwn(KINDS, kind) || SAVE_ONLY.has(kind)) throw new Error('bad kind');
    const r = await dialog.showOpenDialog(win, { title: titleFor(kind, true), properties: ['openFile'], filters: safeFilters(null, kind, false) });
    if (r.canceled || !r.filePaths.length) return null;
    const p = r.filePaths[0];
    if (!KINDS[kind].includes(path.extname(p).toLowerCase())) throw new Error('bad extension');
    const data = readLimited(p);
    if (kind === 'doc') pendingPath = p;        // yükleme başarılı olunca arayüz 'opened' ile onaylar
    return { name: path.basename(p), data };
  }));

  ipcMain.handle('native:save', guarded(async (ev, opts) => {
    // renderer yol GÖNDEREMEZ: yalnız bu dört anahtar kabul edilir
    if (!opts || typeof opts !== 'object' || Object.keys(opts).some((k) => !['saveAs', 'data', 'defaultName', 'kind'].includes(k))) throw new Error('bad args');
    const { saveAs, data, defaultName, kind } = opts;
    if (typeof saveAs !== 'boolean' || !Object.hasOwn(KINDS, kind) || OPEN_ONLY.has(kind) || !(data instanceof Uint8Array) || data.byteLength > MAX_FILE) throw new Error('bad args');
    // açık dosya .mhnk ise Kaydet üzerine yazar; değilse (yeni belge) diyalog açılır
    let p = kind === 'doc' && !saveAs && currentPath && path.extname(currentPath).toLowerCase() === DOC_EXT ? currentPath : null;
    let fromDialog = false;
    if (!p) {
      const dir = kind === 'doc' && currentPath ? path.dirname(currentPath) : app.getPath('documents');
      const r = await dialog.showSaveDialog(win, { title: titleFor(kind, false), defaultPath: path.join(dir, safeName(defaultName, kind)), filters: safeFilters(null, kind, true) });
      if (r.canceled || !r.filePath) return null;
      p = r.filePath; fromDialog = true;
      if (!(kind === 'doc' ? [DOC_EXT] : KINDS[kind]).includes(path.extname(p).toLowerCase())) p += kind === 'doc' ? DOC_EXT : KINDS[kind][0];
    }
    await atomicWrite(p, Buffer.from(data.buffer, data.byteOffset, data.byteLength), { backup: kind === 'doc' });
    if (kind === 'doc') { currentPath = p; addRecent(p); }
    return p;
  }));

  // Arayüz belgeyi yükledi / yeni belge açtı: geçerli belge yolunu ana süreç günceller (yolu renderer vermez)
  ipcMain.on('native:docState', (ev, state) => {
    if (!okSender(ev)) return;
    if (state === 'opened') { if (pendingPath) { currentPath = pendingPath; addRecent(currentPath); } pendingPath = null; }
    else if (state === 'new') { currentPath = null; pendingPath = null; }
  });
  ipcMain.on('native:title', (ev, t) => { if (okSender(ev) && win && !win.isDestroyed() && typeof t === 'string') win.setTitle(t.slice(0, 300)); });
  ipcMain.on('native:dirty', (ev, d) => { if (okSender(ev)) dirty = !!d; });
  // ayarlar: okuma eşzamanlı (arayüz ilk çizimden önce dili bilmeli)
  ipcMain.on('native:getSetting', (ev, k) => { ev.returnValue = okSender(ev) && validKey(k) && Object.hasOwn(settings, k) ? settings[k] : null; });
  ipcMain.on('native:setSetting', (ev, k, v) => { if (okSender(ev) && validKey(k) && validVal(v, k)) { settings[k] = v; saveSettings(); } });
  ipcMain.on('native:strings', (ev, o) => { if (okSender(ev) && o && typeof o === 'object') for (const k of STRING_KEYS) if (typeof o[k] === 'string') strings[k] = o[k].slice(0, 400); });
  ipcMain.handle('native:recentList', guarded(async () => liveRecent().map((x) => ({ name: path.basename(x.path), dir: path.dirname(x.path), ms: x.ms }))));
  ipcMain.handle('native:openRecent', guarded(async (ev, i) => {
    const list = liveRecent(); if (!Number.isInteger(i) || i < 0 || i >= list.length) return null;
    const p = list[i].path; if (!KINDS.doc.includes(path.extname(p).toLowerCase())) return null;
    const data = readLimited(p); pendingPath = p; return { name: path.basename(p), data };
  }));
  ipcMain.handle('native:argv', guarded(async () => {
    const p = argvDoc(process.argv);
    try { if (!p || !fs.existsSync(p)) return null; const data = readLimited(p); pendingPath = p; return { name: path.basename(p), data }; } catch (e) { return null; }
  }));
  // otomatik kurtarma
  ipcMain.handle('native:recoverySave', guarded(async (ev, data) => {
    if (!(data instanceof Uint8Array) || data.byteLength > MAX_FILE) throw new Error('bad args');
    const f = recoveryFile(); fs.mkdirSync(path.dirname(f), { recursive: true });
    await atomicWrite(f, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    return true;
  }));
  ipcMain.handle('native:recoveryLoad', guarded(async () => { try { return readLimited(recoveryFile()); } catch (e) { return null; } }));
  ipcMain.handle('native:recoveryClear', guarded(async () => { clearRecovery(); return true; }));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1200, minHeight: 700, title: 'Mihenk CAD/CAM', icon: path.join(__dirname, 'icon.png'), show: !SELFTEST || process.env.MIHENK_SHOW === '1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      allowRunningInsecureContent: false, webviewTag: false, spellcheck: false, devTools: DEV,
    },
  });
  Menu.setApplicationMenu(null);
  // F12 / DevTools yalnız paketlenmemişken
  if (DEV) win.webContents.on('before-input-event', (e, input) => { if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools(); });
  // Kaydedilmemiş değişiklik varsa kapatmadan önce sor
  win.on('close', (e) => {
    if (!dirty || SELFTEST) return;
    // metinler arayüzden gelir (iki dilli sözlük); gelmediyse (arayüz henüz açılmadıysa) sormadan kapanır
    if (!strings.closeCancel || !strings.closeDiscard) return;
    const c = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: [strings.closeCancel, strings.closeDiscard], defaultId: 0, cancelId: 0, title: 'Mihenk CAD/CAM',
      message: strings.closeMsg || '', detail: strings.closeDetail || '',
    });
    if (c === 0) e.preventDefault();
  });
  // temiz kapanış: kurtarma dosyası silinir (çökme/öldürme durumunda kalır ve açılışta sorulur)
  win.on('closed', () => { win = null; clearRecovery(); });
  win.loadURL(ORIGIN + 'index.html');
  if (SELFTEST) runSelfTest(win);
}

// MIHENK_SELFTEST=1 (yalnız paketlenmemişken): pencere içinde kutu oluşturup hacmi, güvenlik denetimlerini stdout'a yazar ve çıkar.
function runSelfTest(w) {
  const done = (code, msg) => { console.log(msg); setTimeout(() => app.exit(code), 100); };
  const timer = setTimeout(() => done(2, 'SELFTEST ZAMAN AŞIMI'), 90000); // i18n-ignore: geliştirici çıktısı
  w.webContents.on('console-message', (ev) => { const m = ev.message ?? ''; if (/error|hata|Content Security/i.test(String(m))) console.log('[konsol]', m); });
  w.webContents.on('did-fail-load', (e, code, desc) => done(3, 'SELFTEST YÜKLEME HATASI ' + desc)); // i18n-ignore: geliştirici çıktısı
  w.webContents.on('did-finish-load', async () => {
    try {
      // dış istek denemesi için yerel sunucu: hiçbir istek ulaşmamalı
      const http = require('node:http'); const hits = [];
      const srv = http.createServer((q, r) => { hits.push(q.url); r.end('x'); }).listen(0, '127.0.0.1');
      await new Promise((r) => srv.on('listening', r)); const port = srv.address().port;
      const js = `(async () => {
        for (let i = 0; i < 600 && !(window.app && window.app.ready); i++) await new Promise(r => setTimeout(r, 100));
        if (!window.app || !window.app.ready) throw new Error('app not ready');
        await window.app.ready;
        const d = { params: [], features: [{ id: 'b1', type: 'primitive', name: 'Kutu 1', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '30', h: '20', op: 'new' }] };
        await window.app.loadDoc(d);
        await window.app.whenIdle();
        const b = window.app.result.bodies;
        const menu = () => document.querySelector('#menubar button[data-menu=file]').textContent;
        const lang0 = window.native.getSetting('lang');
        // language round trip: switch to en, menu changes, back to tr (persisted to the settings file)
        window.app.setLanguage('en'); const en = menu();
        window.app.setLanguage('tr'); const tr = menu();
        let ext = 'GITTI'; try { await fetch('http://127.0.0.1:${port}/fetch', { mode: 'no-cors' }); } catch (e) { ext = 'ENGELLENDI'; }
        let pathWrite = 'YAZDI'; try { await window.native.saveFile({ path: '/tmp/mihenk-selftest-forbidden', saveAs: false, data: new Uint8Array(1), defaultName: 'x', kind: 'doc' }); } catch (e) { pathWrite = 'REDDEDILDI'; }
        return JSON.stringify({ url: location.href, bodies: b.length, volume: b[0] && b[0].volume, native: typeof window.native, ok: window.app.result.status.b1.ok, lang0, en, tr, saved: window.native.getSetting('lang'), ext, pathWrite });
      })()`;
      const out = await w.webContents.executeJavaScript(js);
      clearTimeout(timer);
      const r = JSON.parse(out);
      // ana süreç tarafı kanıtları: kum havuzu, CSP, webRequest ile ağ engeli (renderer CSP'sinden bağımsız), izinler
      const wp = w.webContents.getLastWebPreferences();
      const viaSession = await session.defaultSession.fetch('http://127.0.0.1:' + port + '/session-fetch').then(() => 'GITTI', () => 'ENGELLENDI');
      const cspHdr = await w.webContents.executeJavaScript("fetch(location.href).then(r => r.headers.get('content-security-policy'))");
      await new Promise((res) => setTimeout(res, 300)); // gönderilen ayarın yazılmasını bekle
      let fileLang = null;
      try { fileLang = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).lang; } catch (e) { fileLang = null; }
      srv.close();
      const langOk = r.en === 'File' && r.tr === 'Dosya' && r.saved === 'tr' && fileLang === 'tr'; // i18n-ignore: Türkçe menü adı beklenen değer
      const secOk = wp.sandbox === true && wp.contextIsolation === true && wp.nodeIntegration === false && cspHdr === CSP && r.ext === 'ENGELLENDI' && viaSession === 'ENGELLENDI' && blockedCount >= 1 && hits.length === 0 && r.pathWrite === 'REDDEDILDI'; // i18n-ignore: beklenen değer
      const pass = r.url.startsWith('app://') && r.bodies === 1 && Math.abs(r.volume - 24000) < 1 && r.native === 'object' && langOk && secOk;
      done(pass ? 0 : 1, 'SELFTEST ' + (pass ? 'GEÇTI' : 'KALDI') + ' ' + out + ' settingsFile.lang=' + fileLang + ' sandbox=' + wp.sandbox + ' csp=' + (cspHdr === CSP) + ' webRequestBlocked=' + blockedCount + ' viaSession=' + viaSession + ' serverHits=' + hits.length); // i18n-ignore: geliştirici çıktısı
    } catch (e) { clearTimeout(timer); done(1, 'SELFTEST KALDI ' + (e && (e.stack || e.message))); } // i18n-ignore: geliştirici çıktısı
  });
}

app.on('web-contents-created', (e, wc) => lockdownContents(wc));
app.whenReady().then(() => {
  loadSettings();
  applyInstallLang();
  lockdownSession(session.defaultSession);
  registerProtocol();
  registerIpc();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
