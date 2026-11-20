// Tüm testleri sırayla koşar (Windows, Linux, macOS). `npm run test:all` bunu çağırır.
// Her adımın adı, süresi, sonucu ve özet satırı (varsa "N geçti, M kaldı") yazılır; hangi dosyanın kaldığı görünür.
// Bir adım kalırsa sonrakiler yine koşar (yalnız `npm run build` kalırsa tarayıcı testleri atlanır); çıkış kodu tümü geçmişse 0'dır.
// Günlükler release/test-logs/ altına (release/ git'te yok sayılır) yazılır. Ortam: PYTHON (python komutu), TEST_ONLY (virgülle ayrılmış ad parçaları, yalnız eşleşen adımlar).
import { spawn, spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32', CI = !!process.env.GITHUB_ACTIONS;
const PY = process.env.PYTHON || (WIN ? 'python' : 'python3');
const LOGS = path.join(ROOT, 'release', 'test-logs'); fs.mkdirSync(LOGS, { recursive: true });
const env = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };

// Windows: Python testleri `Popen(['npx', ...])` ile kabuksuz başlatır; Windows'ta "npx" yalnız npx.exe olarak çözülür (npx.cmd değil).
// Küçük bir npx.exe (scripts/npx-shim.cs) derlenip PATH başına konur; vite'ı doğrudan çalıştırır, kapanınca alt süreçleri de öldürür.
if (WIN) {
  const dir = path.join(os.tmpdir(), 'mihenk-npx-shim'); fs.mkdirSync(dir, { recursive: true });
  const csc = path.join(process.env.windir || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  const r = spawnSync(csc, ['/nologo', '/platform:x64', '/out:' + path.join(dir, 'npx.exe'), path.join(ROOT, 'scripts', 'npx-shim.cs')], { encoding: 'utf8' });
  if (r.status !== 0) console.log('UYARI: npx.exe kabuğu derlenemedi (Python tarayıcı testleri sunucu başlatamayabilir): ' + (r.stdout || '') + (r.stderr || '') + (r.error ? r.error.message : ''));
  else { env.PATH = dir + path.delimiter + (env.PATH || env.Path || ''); env.Path = env.PATH; env.MIHENK_NODE = process.execPath; env.MIHENK_VITE = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'); }
  // test/cam-ui.test.py '/tmp/...' yolu kullanır: geçerli sürücünün kökünde \tmp
  try { fs.mkdirSync(path.join(path.parse(ROOT).root, 'tmp'), { recursive: true }); } catch (e) { /* yoksa test kendi hatasını verir */ }
}

// Windows: mutlak yolla `import()` eden testler için sürücü harfini file:// URL'ye çeviren kanca (scripts/win-esm-hook.mjs)
const HOOK = WIN ? ['--import', pathToFileURL(path.join(ROOT, 'scripts', 'win-esm-hook.mjs')).href] : [];
const node = (f) => ({ name: f, cmd: process.execPath, args: [...HOOK, path.join(ROOT, f)] });
const py = (f, extra = {}) => ({ name: f, cmd: PY, args: [path.join(ROOT, f)], ...extra });
const STEPS = [
  ...['test/i18n.test.mjs', 'test/security.test.mjs', 'test/kernel.test.mjs', 'test/solver.test.mjs', 'test/geom2d.test.mjs', 'test/profiles.test.mjs', 'test/sketchops.test.mjs', 'test/dxf.test.mjs', 'test/stability.test.mjs', 'test/models/run-all.mjs', 'test/cam.test.mjs', 'test/post.test.mjs', 'test/wp04-devir.test.mjs', 'test/sim.test.mjs', 'test/altin.test.mjs', 'test/ornekler.test.mjs', 'test/nc-baslik.test.mjs', 'test/wp21.test.mjs', 'test/altin/kos.mjs'].map(node),
  { name: 'vite build', cmd: process.execPath, args: [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], build: true },
  py('test/sketcher.test.py', { needsBuild: true }),
  // WP-04 dilim 1: "konsolda sayfa hatası yok" kararsızlığı giderildi (testin kendi CSP sınaması ayrı listeye alınıyor); yeniden deneme kaldırıldı.
  py('test/app.test.py', { needsBuild: true }),
  py('test/ui.test.py', { needsBuild: true }),
  py('test/cam-ui.test.py', { needsBuild: true }),
  py('test/iptal.test.py', { needsBuild: true }),
  node('test/electron.test.mjs'),
  { ...node('test/gunluk.test.mjs'), needsBuild: true }, // dist gerektirir: vite build'den SONRA
];

const only = (process.env.TEST_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const steps = only.length ? STEPS.filter((s) => only.some((o) => s.name.includes(o))) : STEPS;
const fmt = (ms) => (ms / 1000).toFixed(1) + ' sn';

function run(step, attempt) {
  return new Promise((resolve) => {
    const t0 = Date.now(); const chunks = [];
    const logFile = path.join(LOGS, step.name.replace(/[\\/ ]/g, '_') + (attempt > 1 ? '.deneme' + attempt : '') + '.log');
    const p = spawn(step.cmd, step.args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => chunks.push(d)); p.stderr.on('data', (d) => chunks.push(d));
    const done = (code, err) => { const out = Buffer.concat(chunks).toString('utf8'); fs.writeFileSync(logFile, out); resolve({ code, out, ms: Date.now() - t0, err }); };
    p.on('error', (e) => done(-1, e.message)); p.on('close', (code) => done(code));
  });
}
function summary(out) {
  const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const m = [...lines].reverse().map((l) => /(\d+)\s*(?:geçti|gecti|passed)\D+(\d+)\s*(?:kaldı|kaldi|failed)/i.exec(l)).find(Boolean);
  if (m) return { pass: +m[1], fail: +m[2], line: m[0] };
  return { line: lines.length ? lines[lines.length - 1].slice(0, 160) : '(çıktı yok)' };
}

// WP-10: test:all izlenen (ya da yeni, yok sayılmayan) dosya bırakmamalı. Koşu öncesi ve sonrası `git status --porcelain` karşılaştırılır.
const gitState = () => { const r = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }); return r.status === 0 ? new Set(r.stdout.split(/\r?\n/).filter(Boolean)) : null; };
const gitBefore = gitState();
const results = []; let buildOk = true;
console.log(`test:all — ${steps.length} adım (${process.platform}, node ${process.version})`);
for (const [i, step] of steps.entries()) {
  const tag = `[${i + 1}/${steps.length}] ${step.name}`;
  if (step.needsBuild && !buildOk) { console.log(`${tag} ... ATLANDI (vite build kaldı)`); results.push({ name: step.name, status: 'ATLANDI' }); continue; }
  if (CI) console.log(`::group::${tag}`);
  let r = await run(step, 1), attempts = 1, retried = null;
  if (r.code !== 0 && step.retry) {
    console.log(`${tag}: 1. deneme kaldı (${summary(r.out).line}); ${step.retryLabel} — yeniden deneniyor`);
    retried = { line: summary(r.out).line, ms: r.ms }; r = await run(step, 2); attempts = 2;
  }
  const s = summary(r.out); const ok = r.code === 0;
  if (!ok) { const fl = r.out.split(/\r?\n/).filter((l) => /FAIL|KALDI|Error/.test(l)).slice(0, 60); if (fl.length) console.log('-- kalan denetimler --\n' + fl.join('\n') + '\n-- çıktının son 40 satırı --'); console.log(r.out.split(/\r?\n/).slice(-40).join('\n')); if (r.err) console.log('başlatma hatası: ' + r.err); }
  if (CI) console.log('::endgroup::');
  console.log(`${tag} ... ${ok ? 'GEÇTİ' : 'KALDI'} (${fmt(r.ms)}${attempts > 1 ? `, ${attempts}. denemede${ok ? ' geçti' : ' de kaldı'} — ${step.retryLabel}` : ''}) | ${s.line}`);
  const known = (r.out.match(/BİLİNEN AÇIK/g) || []).length, skipped = [...r.out.matchAll(/^\s*ATLANDI \((\d+)\)/gm)].reduce((a, m) => a + +m[1], 0);
  results.push({ name: step.name, status: ok ? 'GEÇTİ' : 'KALDI', pass: s.pass, fail: s.fail, attempts, retried, known, skipped });
  if (step.build && !ok) buildOk = false;
}

console.log('\n==== ÖZET ====');
let tp = 0, tf = 0;
for (const r of results) { if (r.pass != null) { tp += r.pass; tf += r.fail; } console.log(`${r.status.padEnd(7)} ${r.name}${r.pass != null ? `  (${r.pass} geçti, ${r.fail} kaldı)` : ''}${r.attempts > 1 ? '  [yeniden denendi]' : ''}${r.known ? `  [${r.known} bilinen açık]` : ''}${r.skipped ? `  [ATLANDI (${r.skipped})]` : ''}`); }
const knownN = results.reduce((a, r) => a + (r.known || 0), 0), skipN = results.reduce((a, r) => a + (r.skipped || 0), 0);
const gitAfter = gitState();
if (gitBefore && gitAfter) { const dirty = [...gitAfter].filter((l) => !gitBefore.has(l)); results.push({ name: 'izlenen dosya değişmedi (git status)', status: dirty.length ? 'KALDI' : 'GEÇTİ' }); if (dirty.length) console.log('test:all şu dosyaları değiştirdi/oluşturdu:\n  ' + dirty.join('\n  ')); }
const bad = results.filter((r) => r.status !== 'GEÇTİ');
console.log(`${results.length - bad.length}/${results.length} adım geçti; sayılan denetim: ${tp} geçti, ${tf} kaldı`);
if (knownN) console.log(`${knownN} bilinen açık (yeşil sayılmaz; ayrıntı ilgili adımın çıktısında: BİLİNEN AÇIK)`);
if (skipN) console.log(`ATLANDI (${skipN}): koşulmayan denetim adımı (ayrıntı: models/run-all çıktısı)`);
if (bad.length) console.log('KALAN/ATLANAN: ' + bad.map((r) => r.name + ' (' + r.status + ')').join(', '));
process.exit(bad.length ? 1 : 0);
