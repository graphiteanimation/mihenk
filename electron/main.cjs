// AtolyeCAD Electron ana süreci: tek pencere, app:// protokolü, yerel dosya diyalogları.
const { app, BrowserWindow, Menu, protocol, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const DIST = path.join(__dirname, '..', 'dist');
const SELFTEST = process.env.ATOLYE_SELFTEST === '1';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// Kök (root) kullanıcıda ya da sınama ortamında Chromium kum havuzu çalışmayabilir.
if (SELFTEST || process.env.ATOLYE_NO_SANDBOX === '1' || (process.getuid && process.getuid() === 0)) app.commandLine.appendSwitch('no-sandbox');
if (SELFTEST) {
  // ekransız ortamda WebGL için yazılım çizimi
  app.commandLine.appendSwitch('use-gl', 'angle');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}

// Kendi kullanıcı verisi klasörü (sınama sırasında gerçek ayarları bozmamak için ayrı klasör)
if (process.env.ATOLYE_USERDATA) app.setPath('userData', path.resolve(process.env.ATOLYE_USERDATA));
else if (SELFTEST) app.setPath('userData', path.join(os.tmpdir(), 'atolyecad-selftest-' + process.pid));

let win = null;
let dirty = false;

// ---- ayarlar: userData/settings.json (dil tercihi vb.). Yalnız düz anahtar → sayı/metin/mantıksal değer.
const settings = {};
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const validKey = (k) => typeof k === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,39}$/.test(k);
const validVal = (v) => v === null || typeof v === 'boolean' || typeof v === 'number' || (typeof v === 'string' && v.length <= 200);
function loadSettings() {
  try {
    const j = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (j && typeof j === 'object' && !Array.isArray(j)) for (const [k, v] of Object.entries(j)) if (validKey(k) && validVal(v)) settings[k] = v;
  } catch (e) { /* dosya yok ya da bozuk: varsayılanlarla başla */ }
}
function saveSettings() {
  try {
    const f = settingsFile(); fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + '.tmp', JSON.stringify(settings, null, 2)); fs.renameSync(f + '.tmp', f);
  } catch (e) { console.error('settings write failed:', e.message); }
}

// Arayüzün gönderdiği diyalog metinleri (tek sözlük arayüz tarafında; dil değişince yenilenir)
const strings = {};
const STRING_KEYS = ['closeMsg', 'closeDetail', 'closeCancel', 'closeDiscard'];
const dlgTitle = (t) => (typeof t === 'string' && t ? t.slice(0, 120) : undefined);

function argvAcad(argv) {
  const f = argv.slice(1).find((a) => /\.acad$/i.test(a) && !a.startsWith('--'));
  return f ? path.resolve(f) : null;
}

function readDoc(p) {
  const buf = fs.readFileSync(p);
  return { path: p, name: path.basename(p), data: new Uint8Array(buf) };
}

function registerProtocol() {
  protocol.handle('app', async (req) => {
    try {
      const u = new URL(req.url);
      let rel = decodeURIComponent(u.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const file = path.normalize(path.join(DIST, rel));
      if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
      const data = await fs.promises.readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      return new Response(data, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } });
    } catch (e) {
      return new Response('Not Found', { status: 404 });
    }
  });
}

function registerIpc() {
  ipcMain.handle('native:open', async (ev, filters, title) => {
    const r = await dialog.showOpenDialog(win, { title: dlgTitle(title), properties: ['openFile'], filters: filters || [] });
    if (r.canceled || !r.filePaths.length) return null;
    return readDoc(r.filePaths[0]);
  });
  ipcMain.handle('native:save', async (ev, opts) => {
    let p = opts.path;
    if (!p) {
      const r = await dialog.showSaveDialog(win, { title: dlgTitle(opts.title), defaultPath: opts.defaultName, filters: opts.filters || [] });
      if (r.canceled || !r.filePath) return null;
      p = r.filePath;
    }
    await fs.promises.writeFile(p, Buffer.from(opts.data));
    return p;
  });
  ipcMain.on('native:title', (ev, t) => { if (win && !win.isDestroyed()) win.setTitle(t); });
  ipcMain.on('native:dirty', (ev, d) => { dirty = !!d; });
  // ayarlar: okuma eşzamanlı (arayüz ilk çizimden önce dili bilmeli)
  ipcMain.on('native:getSetting', (ev, k) => { ev.returnValue = validKey(k) && k in settings ? settings[k] : null; });
  ipcMain.on('native:setSetting', (ev, k, v) => { if (validKey(k) && validVal(v)) { settings[k] = v; saveSettings(); } });
  ipcMain.on('native:strings', (ev, o) => { if (o && typeof o === 'object') for (const k of STRING_KEYS) if (typeof o[k] === 'string') strings[k] = o[k].slice(0, 400); });
  ipcMain.handle('native:argv', () => {
    const p = argvAcad(process.argv);
    try { return p && fs.existsSync(p) ? readDoc(p) : null; } catch (e) { return null; }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600, title: 'AtolyeCAD', show: !SELFTEST || process.env.ATOLYE_SHOW === '1',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  // Kaydedilmemiş değişiklik varsa kapatmadan önce sor
  win.on('close', (e) => {
    if (!dirty || SELFTEST) return;
    // metinler arayüzden gelir (iki dilli sözlük); gelmediyse (arayüz henüz açılmadıysa) sormadan kapanır
    if (!strings.closeCancel || !strings.closeDiscard) return;
    const c = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: [strings.closeCancel, strings.closeDiscard], defaultId: 0, cancelId: 0, title: 'AtolyeCAD',
      message: strings.closeMsg || '', detail: strings.closeDetail || '',
    });
    if (c === 0) e.preventDefault();
  });
  win.on('closed', () => { win = null; });
  win.loadURL('app://atolye/index.html');
  if (SELFTEST) runSelfTest(win);
}

// ATOLYE_SELFTEST=1: pencere içinde kutu oluşturup hacmi stdout'a yazar ve çıkar.
function runSelfTest(w) {
  const done = (code, msg) => { console.log(msg); setTimeout(() => app.exit(code), 100); };
  const timer = setTimeout(() => done(2, 'SELFTEST ZAMAN AŞIMI'), 90000); // i18n-ignore: geliştirici çıktısı
  w.webContents.on('console-message', (ev) => { const m = ev.message ?? ''; if (/error|hata/i.test(String(m))) console.log('[konsol]', m); });
  w.webContents.on('did-fail-load', (e, code, desc) => done(3, 'SELFTEST YÜKLEME HATASI ' + desc)); // i18n-ignore: geliştirici çıktısı
  w.webContents.on('did-finish-load', async () => {
    try {
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
        return JSON.stringify({ url: location.href, bodies: b.length, volume: b[0] && b[0].volume, native: typeof window.native, ok: window.app.result.status.b1.ok, lang0, en, tr, saved: window.native.getSetting('lang') });
      })()`;
      const out = await w.webContents.executeJavaScript(js);
      clearTimeout(timer);
      const r = JSON.parse(out);
      // ayar dosyası gerçekten yazıldı mı (ana süreçten kontrol)
      await new Promise((res) => setTimeout(res, 300)); // gönderilen ayarın yazılmasını bekle
      let fileLang = null;
      try { fileLang = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).lang; } catch (e) { fileLang = null; }
      const langOk = r.en === 'File' && r.tr === 'Dosya' && r.saved === 'tr' && fileLang === 'tr'; // i18n-ignore: Türkçe menü adı beklenen değer
      const pass = r.url.startsWith('app://') && r.bodies === 1 && Math.abs(r.volume - 24000) < 1 && r.native === 'object' && langOk;
      done(pass ? 0 : 1, 'SELFTEST ' + (pass ? 'GEÇTI' : 'KALDI') + ' ' + out + ' settingsFile.lang=' + fileLang); // i18n-ignore: geliştirici çıktısı
    } catch (e) { clearTimeout(timer); done(1, 'SELFTEST KALDI ' + (e && e.message)); } // i18n-ignore: geliştirici çıktısı
  });
}

app.whenReady().then(() => {
  loadSettings();
  registerProtocol();
  registerIpc();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
