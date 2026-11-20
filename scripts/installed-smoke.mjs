// Kurulu Mihenk'e karşı kısa duman testi (Windows koşucusu; sürüm kapısı, CALISMA-DUZENI §8).
// Akış: kurulumu sessiz kur (/S) → kurulum sonrası denetimler → uygulamayı belge argümanıyla aç → arayüze DevTools protokolüyle bağlan
//       → belge açıldı mı, geometri hesaplanıyor mu, Kaydet, NC ve DXF kaydet (gerçek kayıt diyaloğuna yol yazılır) → kapat → sessiz kaldır.
// Playwright `_electron` KULLANILAMAZ: paketli sürümde enableNodeCliInspectArguments fuse'u kapalı (güvenlik duruşu). Bu yüzden
// --remote-debugging-port (Chromium anahtarı) + connectOverCDP kullanılır; ana süreç içi diyalog taklidi yok, diyalog gerçekten açılır.
// Ortam: MIHENK_SETUP (kurulum exe yolu; varsayılan release/Mihenk-Kurulum-<sürüm>.exe), MIHENK_KEEP=1 (sonda kaldırma).
import { spawn, spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (process.platform !== 'win32') { console.error('installed-smoke yalnız Windows\'ta koşar (NSIS kurulumu).'); process.exit(2); }
const SETUP = path.resolve(process.env.MIHENK_SETUP || path.join(ROOT, 'release', `Mihenk-Kurulum-${pkg.version}.exe`));
const WORK = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'mihenk-smoke-'));
const DEST = path.join(WORK, 'kurulum');              // /D= ; kurucu sonuna \Mihenk ekler
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, failN = 0;
const check = (name, cond, detail = '') => { if (cond) { pass++; console.log('  ok   ', name); } else { failN++; console.log('  FAIL ', name, detail); } return !!cond; };
const ps = (cmd) => spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8' });
let child = null;
const killApp = () => { if (child && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); child = null; };
const finish = (code) => { killApp(); console.log(`\n${pass} geçti, ${failN} kaldı`); process.exit(code); };

console.log('1: sessiz kurulum');
if (!check('kurulum dosyası var: ' + path.basename(SETUP), fs.existsSync(SETUP))) finish(1);
const t0 = Date.now();
const inst = spawnSync(SETUP, ['/S', '/D=' + DEST], { timeout: 300000, encoding: 'utf8' });
check(`kurulum çıkış kodu 0 (${((Date.now() - t0) / 1000).toFixed(1)} sn)`, inst.status === 0, `status=${inst.status} err=${inst.error && inst.error.message}`);
const APPDIR = [path.join(DEST, 'Mihenk'), DEST].find((d) => fs.existsSync(path.join(d, 'Mihenk.exe')));
if (!check('Mihenk.exe kurulum klasöründe: ' + (APPDIR || '(yok)'), !!APPDIR)) finish(1);
const EXE = path.join(APPDIR, 'Mihenk.exe');
check('kaldırıcı Kaldir.exe yazıldı', fs.existsSync(path.join(APPDIR, 'Kaldir.exe')));
check('kurulum dili dosyası (lang) tr|en', /^(tr|en)$/.test((fs.existsSync(path.join(APPDIR, 'lang')) ? fs.readFileSync(path.join(APPDIR, 'lang'), 'utf8') : '').trim()));
const pv = ps(`(Get-Item '${EXE}').VersionInfo.ProductVersion`).stdout.trim();
check(`exe sürüm bilgisi = package.json (${pkg.version})`, pv === pkg.version, pv);
const reg = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Mihenk', '/v', 'DisplayVersion'], { encoding: 'utf8' });
check('kayıt defteri: DisplayVersion = ' + pkg.version, reg.status === 0 && reg.stdout.includes(pkg.version), reg.stdout + reg.stderr);
const asc = spawnSync('reg', ['query', 'HKCU\\Software\\Classes\\.mhnk', '/ve'], { encoding: 'utf8' });
check('.mhnk ilişkilendirmesi yazıldı', asc.status === 0 && /Mihenk\.Belge/.test(asc.stdout), asc.stdout);

console.log('2: aç');
const BOX = { params: [], features: [{ id: 'b1', type: 'primitive', name: 'Kutu 1', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '30', h: '20', op: 'new' }] };
const DOC = path.join(WORK, 'smoke.mhnk'); fs.writeFileSync(DOC, JSON.stringify({ app: 'Mihenk', version: 1, doc: BOX }));
child = spawn(EXE, [`--remote-debugging-port=${PORT}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', DOC], { stdio: 'ignore', detached: false });
let exited = null; child.on('exit', (c) => { exited = c; });
let browser = null, page = null;
for (let i = 0; i < 90 && !browser && exited === null; i++) {
  await sleep(1000);
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 5000 }); } catch (e) { browser = null; }
}
if (!check('kurulu uygulama başladı ve DevTools protokolüne bağlanıldı', !!browser, 'çıkış kodu: ' + exited)) finish(1);
for (let i = 0; i < 60 && !page; i++) {
  page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('app://mihenk/')) || null;
  if (!page) await sleep(500);
}
if (!check('ana pencere app://mihenk/ kökeninde', !!page, browser.contexts().flatMap((c) => c.pages()).map((p) => p.url()).join(',')) ) finish(1);
const errors = []; page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
try { await page.waitForFunction(() => window.app && window.app.ready, null, { timeout: 120000 }); await page.evaluate(() => window.app.ready); await page.evaluate(() => window.app.whenIdle()); }
catch (e) { check('arayüz hazır (window.app.ready)', false, String(e.message).slice(0, 200)); finish(1); }
check('arayüz hazır (window.app.ready)', true);
const info = await page.evaluate(async () => ({
  node: [typeof require, typeof process, typeof Buffer].join(','), electron: !!(window.native && window.native.versions && window.native.versions.electron),
  feats: window.app.doc.features.length, vol: window.app.result && window.app.result.bodies && window.app.result.bodies[0] && window.app.result.bodies[0].volume,
  csp: (await fetch(location.href)).headers.get('content-security-policy') || '', title: document.title,
}));
check('Electron köprüsü var, renderer\'da Node globalleri yok', info.electron && info.node === 'undefined,undefined,undefined', JSON.stringify(info));
check('CSP var ve unsafe-eval içermiyor', info.csp.length > 20 && !/'unsafe-eval'/.test(info.csp), info.csp);
check('.mhnk argümanıyla açıldı (1 özellik)', info.feats === 1, String(info.feats));
check('geometri çekirdeği kurulu sürümde çalışıyor (kutu hacmi 24000)', Math.abs((info.vol || 0) - 24000) < 1, String(info.vol));

console.log('3: kaydet');
const bak = DOC + '.bak';
await page.evaluate(() => { window.app.doc.features[0].w = '55'; window.app.markDirty(true); return window.app.save(); });
const saved = JSON.parse(fs.readFileSync(DOC, 'utf8'));
check('Kaydet: açılan dosyaya yazıldı (diyaloğa gerek kalmadan), w=55', saved.doc.features[0].w === '55' && saved.app === 'Mihenk');
check('Kaydet: .bak önceki sürüm', fs.existsSync(bak) && JSON.parse(fs.readFileSync(bak, 'utf8')).doc.features[0].w === '40');

// Gerçek kayıt diyaloğu: writeOut() ürün kodunun kullandığı yoldur; yolu diyaloğa Windows tuş gönderimiyle yazarız.
const viaDialog = async (label, name, kind, text, outFile) => {
  const pr = page.evaluate(([n, k, t]) => window.app.writeOut(new TextEncoder().encode(t), n, k, true), [name, kind, text]);
  const drv = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', 'win-dialog-type.ps1'), '-ProcId', String(child.pid), '-Path', outFile], { encoding: 'utf8', timeout: 90000 });
  const out = (drv.stdout || '').trim();
  if (drv.status !== 0) { check(`${label}: kayıt diyaloğu bulundu ve yol yazıldı`, false, `${out} ${drv.stderr || ''}`.trim()); return; }
  let ret; try { ret = await Promise.race([pr, sleep(20000).then(() => '__zaman_asimi__')]); } catch (e) { ret = '__hata__ ' + e.message; }
  check(`${label}: ana süreç dosyayı yazdı ve yolu döndürdü`, ret === outFile && fs.existsSync(outFile) && fs.readFileSync(outFile, 'utf8') === text, `dönen: ${ret}`);
};
console.log('4: NC kaydet (kayıt diyaloğu)');
await viaDialog('NC', 'smoke.nc', 'nc', '%\nO0001 (MIHENK DUMAN TESTI)\nG21 G90 G17\nM30\n%\n', path.join(WORK, 'cikti.nc'));
console.log('5: DXF kaydet (kayıt diyaloğu)');
await viaDialog('DXF', 'smoke.dxf', 'dxf', '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n', path.join(WORK, 'cikti.dxf'));
check('sayfa hatası yok (pageerror)', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log('6: kapat ve sessiz kaldır');
await browser.close().catch(() => {});
killApp(); await sleep(1500);
if (process.env.MIHENK_KEEP !== '1') {
  // `_?=` kaldırıcının kendini temp'e kopyalayıp hemen dönmesini önler (bitene kadar bekler)
  const un = spawnSync(path.join(APPDIR, 'Kaldir.exe'), ['/S', '_?=' + APPDIR], { timeout: 120000 });
  check('sessiz kaldırma çıkış kodu 0', un.status === 0, `status=${un.status}`);
  check('kaldırma: Mihenk.exe silindi', !fs.existsSync(EXE));
  check('kaldırma: kullanıcı belgesi (smoke.mhnk) dokunulmadı', fs.existsSync(DOC));
}
finish(failN ? 1 : 0);
