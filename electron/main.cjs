// AtolyeCAD Electron ana süreci: tek pencere, app:// protokolü, yerel dosya diyalogları.
const { app, BrowserWindow, Menu, protocol, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

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

let win = null;
let dirty = false;

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
      if (!file.startsWith(DIST)) return new Response('Yasak', { status: 403 });
      const data = await fs.promises.readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      return new Response(data, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } });
    } catch (e) {
      return new Response('Bulunamadı', { status: 404 });
    }
  });
}

function registerIpc() {
  ipcMain.handle('native:open', async (ev, filters) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: filters || [] });
    if (r.canceled || !r.filePaths.length) return null;
    return readDoc(r.filePaths[0]);
  });
  ipcMain.handle('native:save', async (ev, opts) => {
    let p = opts.path;
    if (!p) {
      const r = await dialog.showSaveDialog(win, { defaultPath: opts.defaultName, filters: opts.filters || [] });
      if (r.canceled || !r.filePath) return null;
      p = r.filePath;
    }
    await fs.promises.writeFile(p, Buffer.from(opts.data));
    return p;
  });
  ipcMain.on('native:title', (ev, t) => { if (win && !win.isDestroyed()) win.setTitle(t); });
  ipcMain.on('native:dirty', (ev, d) => { dirty = !!d; });
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
    const c = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Vazgeç', 'Kaydetmeden Kapat'], defaultId: 0, cancelId: 0, title: 'AtolyeCAD',
      message: 'Kaydedilmemiş değişiklikler var.', detail: 'Kapatırsanız son kaydettiğinizden sonraki değişiklikler kaybolur.',
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
  const timer = setTimeout(() => done(2, 'SELFTEST ZAMAN AŞIMI'), 90000);
  w.webContents.on('console-message', (ev) => { const m = ev.message ?? ''; if (/error|hata/i.test(String(m))) console.log('[konsol]', m); });
  w.webContents.on('did-fail-load', (e, code, desc) => done(3, 'SELFTEST YÜKLEME HATASI ' + desc));
  w.webContents.on('did-finish-load', async () => {
    try {
      const js = `(async () => {
        for (let i = 0; i < 600 && !(window.app && window.app.ready); i++) await new Promise(r => setTimeout(r, 100));
        if (!window.app || !window.app.ready) throw new Error('app hazır olmadı');
        await window.app.ready;
        const d = { params: [], features: [{ id: 'b1', type: 'primitive', name: 'Kutu 1', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '30', h: '20', op: 'new' }] };
        await window.app.loadDoc(d);
        await window.app.whenIdle();
        const b = window.app.result.bodies;
        return JSON.stringify({ url: location.href, bodies: b.length, volume: b[0] && b[0].volume, native: typeof window.native, ok: window.app.result.status.b1.ok });
      })()`;
      const out = await w.webContents.executeJavaScript(js);
      clearTimeout(timer);
      const r = JSON.parse(out);
      const pass = r.url.startsWith('app://') && r.bodies === 1 && Math.abs(r.volume - 24000) < 1 && r.native === 'object';
      done(pass ? 0 : 1, 'SELFTEST ' + (pass ? 'GEÇTI' : 'KALDI') + ' ' + out);
    } catch (e) { clearTimeout(timer); done(1, 'SELFTEST KALDI ' + (e && e.message)); }
  });
}

app.whenReady().then(() => {
  registerProtocol();
  registerIpc();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
