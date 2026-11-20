// Tüm bağımsız model testlerini ayrı süreçlerde koşturur. Kullanım: node test/models/run-all.mjs [filtre]
// MIHENK_SRC=/yol/src ile farklı bir kaynak ağacı denenebilir.
// WP-10: test/models/results.json izlenen KARŞILAŞTIRMA TABANIDIR ve koşuda değişmez (salt okunur). Koşu çıktısı release/model-sonuclari.json'a (izlenmez) yazılır
// ve tabanla karşılaştırılır. Tabanı bilerek yenilemek için ayrı, açık komut: node test/models/run-all.mjs --taban-guncelle [filtre]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const files = [
  ['part-a.mjs', 120], ['part-b.mjs', 120], ['part-c.mjs', 120], ['part-d.mjs', 120], ['part-e.mjs', 120], ['part-f.mjs', 120], ['part-g.mjs', 180], ['part-h.mjs', 450],
  ['param-sweep.mjs', 900], ['param-random.mjs', 900], ['ref-adversarial.mjs', 300], ['naming.mjs', 600], ['edge-cases.mjs', 1500], ['measure.mjs', 120], ['profiles.mjs', 120], ['feature-geo.mjs', 180], ['state-bugs.mjs', 120], ['history12.mjs', 300], ['perf.mjs', 1800, ['--expose-gc']],
];
const UPDATE = process.argv.includes('--taban-guncelle'); const filter = process.argv.slice(2).find((a) => !a.startsWith('--'));
const run = ([f, limit, flags = []]) => new Promise((resolve) => {
  const t0 = Date.now(); const env = { ...process.env, N: process.env.N || '40', CASE_TIMEOUT: process.env.CASE_TIMEOUT || '40000' };
  const p = spawn(process.execPath, [...flags, path.join(here, f)], { env }); let out = '';
  // Zaman sınırı yüke duyarlı: paralel koşular (başka ajan/CI) sırasında dosyalar duvar saatiyle SIGKILL'e düşüyordu (part-h ~150 sn, yük altında >300 sn).
  // Çarpan = 1 dk yük ortalaması / çekirdek sayısı (en az 1, en çok 4); MODEL_LIMIT_SCALE ile elle verilebilir.
  const scale = Number(process.env.MODEL_LIMIT_SCALE) || Math.min(4, Math.max(1, Math.ceil(os.loadavg()[0] / Math.max(1, os.cpus().length))));
  let timedOut = false; const timer = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, limit * scale * 1000);
  p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
  p.on('exit', (code, sig) => {
    clearTimeout(timer); const results = [...out.matchAll(/^@@RESULT (.*)$/gm)].map((m) => JSON.parse(m[1]));
    resolve({ file: f, code, sig, timedOut, limit: limit * scale, secs: Math.round((Date.now() - t0) / 100) / 10, results, skips: out.split('\n').filter((l) => /^ATLANDI \(\d+\)/.test(l)), tail: results.length ? '' : out.split('\n').slice(-8).join('\n') });
  });
});
const all = [];
for (const spec of files) { if (filter && !spec[0].includes(filter)) continue; const r = await run(spec); all.push(r); for (const l of r.skips) console.log('  ' + l); const pass = r.results.reduce((s, x) => s + x.pass, 0), fail = r.results.reduce((s, x) => s + x.fail, 0); console.log(`${r.file.padEnd(22)} ${String(pass).padStart(4)} geçti ${String(fail).padStart(4)} kaldı  ${r.secs}s${r.results.length ? '' : '  SONUÇ YOK (' + (r.timedOut ? 'ZAMAN AŞIMI, sınır ' + r.limit + ' sn' : (r.sig || 'kod ' + r.code)) + ')\n' + r.tail}`); }
let regress = 0;
const baseF = path.join(here, 'results.json'); let prev = { files: [] }; try { prev = JSON.parse(fs.readFileSync(baseF, 'utf8')); } catch (e) { /* taban yok */ }
const merged = [...prev.files.filter((p) => !all.some((a) => a.file === p.file)), ...all].sort((a, b) => files.findIndex((f) => f[0] === a.file) - files.findIndex((f) => f[0] === b.file));
const snap = { src: process.env.MIHENK_SRC || 'src', at: new Date().toISOString(), files: merged };
if (UPDATE) { fs.writeFileSync(baseF, JSON.stringify(snap, null, 1)); console.log('TABAN GÜNCELLENDİ: ' + baseF); }
else {
  const outDir = path.resolve(here, '../../release'); fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, 'model-sonuclari.json'), JSON.stringify(snap, null, 1));
  // tabana göre kötüleşme: geçen sayısı azalan ya da kalan sayısı artan dosyalar (bilgi; çıkış kodunu yalnız kalan/sonuçsuz belirler)
  const sum = (r, k) => r.results.reduce((a, x) => a + x[k], 0);
  const worse = all.map((a) => { const b = prev.files.find((p) => p.file === a.file); return b && (sum(a, 'pass') < sum(b, 'pass') || sum(a, 'fail') > sum(b, 'fail')) ? `${a.file}: taban ${sum(b, 'pass')}/${sum(b, 'fail')} → ${sum(a, 'pass')}/${sum(a, 'fail')}` : null; }).filter(Boolean);
  regress = worse.length;
  if (worse.length) console.log('TABANA GÖRE KÖTÜLEŞME:\n  ' + worse.join('\n  '));
}
const P = merged.reduce((s, r) => s + r.results.reduce((a, x) => a + x.pass, 0), 0), F = merged.reduce((s, r) => s + r.results.reduce((a, x) => a + x.fail, 0), 0), crashed = merged.filter((r) => !r.results.length).length;
console.log(`\nTOPLAM: ${P + F} denetim, ${P} geçti, ${F} kaldı, ${crashed} dosya sonuç üretmedi`);
process.exit(F || crashed || regress ? 1 : 0);
