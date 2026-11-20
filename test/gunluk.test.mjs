// Yerel çökme/hata günlüğü (WP-10 dilim 4): maskeleme + döndürme (birim) ve Electron'da gerçek hata → dosya (uçtan uca). Önce: npm run build.
// Çıktı: "N geçti, M kaldı". Kurulu exe'ye karşı koşulamaz (Playwright _electron --inspect ister; bkz. electron.test.mjs).
import { _electron as electron } from 'playwright';
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const req = createRequire(import.meta.url);
if (process.platform === 'linux' && !process.env.DISPLAY) { const r = spawnSync('xvfb-run', ['-a', process.execPath, ...process.argv.slice(1)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
const { createLogger, MAX_BYTES, KEEP } = req(path.join(ROOT, 'electron/log.cjs'));
let pass = 0, fail = 0; const ok = (c, m, d = '') => { if (c) pass++; else { fail++; console.log('  FAIL ' + m + ' ' + d); } };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mihenk-gunluk-'));
let user = 'kullanici'; try { user = os.userInfo().username; } catch (e) { /* yok */ }

// ---- birim: maskeleme
{
  const dir = path.join(TMP, 'u1'); const L = createLogger({ dir, version: '9.9.9', electron: '1', platform: 'test' });
  const sirli = 'Ayse-Yilmaz-gizli';
  L.write('main-uncaught', `ENOENT: C:\\Users\\${sirli}\\Belgelerim\\musteri-teklif.mhnk ve /home/${sirli}/is/parca.step bulunamadı`, `Error: x\n    at f (C:\\Users\\${sirli}\\AppData\\Local\\Programs\\Mihenk\\resources\\app.asar\\electron\\main.cjs:10:5)\n    at g (/Users/${sirli}/x/y.js:1:1)`);
  L.write('console-error', 'JSON hatası "' + 'A'.repeat(80) + 'GİZLİ-İÇERİK" konumunda');
  L.write('console-error', `host ${os.hostname()} kullanıcı ${user} ev ${os.homedir()}/belge.mhnk`);
  L.write('console-error', 'worker hatası app://mihenk/assets/worker-abc.js:12:3');
  L.write('GECERSIZ-TUR', 'bu yazılmamalı');
  const t = fs.readFileSync(path.join(dir, 'mihenk-log.txt'), 'utf8');
  ok(!t.includes(sirli) && !/C:\\Users|\/home\//.test(t), 'kullanıcı adı ve mutlak yol günlükte yok', t.slice(0, 300));
  ok(t.includes('musteri-teklif.mhnk') && t.includes('main.cjs'), 'yol yalnız dosya adına iner (hata ayıklanabilir kalır)');
  ok(!t.includes('GİZLİ-İÇERİK') && !t.includes('A'.repeat(40)), 'uzun tırnaklı içerik atılır');
  ok(!t.includes(os.hostname() + ' ') || os.hostname().length < 3, 'bilgisayar adı maskelenir');
  ok(!(user.length >= 3 && t.toLowerCase().includes(user.toLowerCase())), 'sistem kullanıcı adı maskelenir');
  ok(t.includes('app://mihenk/assets/worker-abc.js'), 'uygulama adresi (kişisel değil) korunur');
  ok(!t.includes('bu yazılmamalı') && t.trim().split('\n').length === 4, 'geçersiz tür yazılmaz; 4 kayıt');
  ok(t.trim().split('\n').every((l) => l.length <= 600), 'kayıt başına en çok 600 karakter');
}
// ---- birim: döndürme (5 × 1 MB) ve oturum sınırı
{
  const dir = path.join(TMP, 'u2'); fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, 'mihenk-log.txt');
  for (let i = 0; i < 7; i++) { fs.writeFileSync(f, 'x'.repeat(MAX_BYTES) + '\n'); const L = createLogger({ dir, version: '1', electron: '1', platform: 't' }); L.write('main-uncaught', 'tur ' + i); }
  const files = fs.readdirSync(dir).sort();
  ok(files.length <= KEEP && files.includes('mihenk-log.txt.1') && !files.includes('mihenk-log.txt.' + KEEP), 'döndürme: en çok ' + KEEP + ' dosya', files.join(','));
  ok(files.every((n) => fs.statSync(path.join(dir, n)).size <= MAX_BYTES + 1024), 'her dosya ~1 MB sınırında');
  const L = createLogger({ dir: path.join(TMP, 'u3'), version: '1', electron: '1', platform: 't' }); let yazilan = 0; for (let i = 0; i < 400; i++) if (L.write('console-error', 'ayrı ileti ' + i)) yazilan++;
  ok(yazilan === 300, 'oturum başına en çok 300 kayıt: ' + yazilan);
  const L2 = createLogger({ dir: path.join(TMP, 'u4'), version: '1', electron: '1', platform: 't' }); L2.write('console-error', 'aynı'); ok(!L2.write('console-error', 'aynı'), 'ardışık özdeş kayıt (1 sn içinde) yazılmaz');
}
// ---- uçtan uca: Electron
const userData = path.join(TMP, 'ud'); const logDir = path.join(userData, 'logs'); const logFile = path.join(logDir, 'mihenk-log.txt');
const SANDBOX_ARGS = process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [];
const app = await electron.launch({ args: [ROOT, ...SANDBOX_ARGS], env: { ...process.env, MIHENK_USERDATA: userData } });
const page = await app.firstWindow(); await page.waitForFunction(() => window.app && window.app.ready, null, { timeout: 90000 }); await page.evaluate(() => window.app.ready);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const read = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '');
const gizliYol = path.join(userData, 'gizli-musteri-belgesi.mhnk');
await app.evaluate((_, y) => { setTimeout(() => { throw new Error('YAPAY-ANA-HATA dosya ' + y + ' açılamadı'); }, 0); }, gizliYol);
await sleep(600); ok(/main-uncaught .*YAPAY-ANA-HATA/.test(read()), 'ana süreç yakalanmamış hata dosyaya yazıldı', read().slice(0, 300));
await page.evaluate(() => { setTimeout(() => { throw new Error('YAPAY-CIZICI-HATA'); }, 0); }); await sleep(600);
ok(/console-error .*YAPAY-CIZICI-HATA/.test(read()), 'çizici süreç yakalanmamış hata dosyaya yazıldı', read().slice(-300));
await page.evaluate(() => { Promise.reject(new Error('YAPAY-RED-HATA')); }); await sleep(600);
ok(/console-error .*YAPAY-RED-HATA/.test(read()), 'çizici süreç yakalanmamış söz reddi dosyaya yazıldı');
await page.evaluate(() => window.app.worker.onerror(new ErrorEvent('error', { message: 'YAPAY-ISCI-HATA' }))); await sleep(800);
ok(/console-error .*(worker hatası|YAPAY-ISCI-HATA)/.test(read()), 'çekirdek işçisi hatası dosyaya yazıldı', read().slice(-300));
const t = read();
ok(!t.includes(userData) && !t.includes(os.tmpdir() + path.sep) && t.includes('gizli-musteri-belgesi.mhnk'), 'günlükte kullanıcı veri yolu yok (yalnız dosya adı)');
ok(!(user.length >= 3 && t.toLowerCase().includes(user.toLowerCase())), 'günlükte sistem kullanıcı adı yok');
// Yardım → günlük klasörünü aç: köprü ana sürece gider, shell.openPath günlük klasörüyle çağrılır (gerçek dosya yöneticisi açılmaz)
await app.evaluate(({ shell }) => { globalThis.__opened = null; shell.openPath = async (p) => { globalThis.__opened = p; return ''; }; });
const acildi = await page.evaluate(() => window.native.openLogFolder()); const yol = await app.evaluate(() => globalThis.__opened);
ok(acildi === true && path.resolve(yol) === path.resolve(logDir), 'openLogFolder günlük klasörünü açar', String(yol));
ok(await page.evaluate(() => typeof window.native.logError === 'undefined' && typeof window.native.writeLog === 'undefined'), 'köprüde keyfi günlük yazma işlevi yok');
await app.close();
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`gunluk: ${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
