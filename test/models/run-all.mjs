// Tüm bağımsız model testlerini ayrı süreçlerde koşturur. Kullanım: node test/models/run-all.mjs [filtre]
// ATOLYE_SRC=/yol/src ile farklı bir kaynak ağacı denenebilir. Sonuçlar test/models/results.json içine yazılır.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const files = [
  ['part-a.mjs', 120], ['part-b.mjs', 120], ['part-c.mjs', 120], ['part-d.mjs', 120], ['part-e.mjs', 120], ['part-f.mjs', 120], ['part-g.mjs', 180], ['part-h.mjs', 300],
  ['param-sweep.mjs', 900], ['param-random.mjs', 900], ['ref-adversarial.mjs', 300], ['naming.mjs', 600], ['edge-cases.mjs', 1500], ['measure.mjs', 120], ['profiles.mjs', 120], ['feature-geo.mjs', 180], ['state-bugs.mjs', 120], ['perf.mjs', 1800, ['--expose-gc']],
];
const filter = process.argv[2];
const run = ([f, limit, flags = []]) => new Promise((resolve) => {
  const t0 = Date.now(); const env = { ...process.env, N: process.env.N || '40', CASE_TIMEOUT: process.env.CASE_TIMEOUT || '40000' };
  const p = spawn(process.execPath, [...flags, path.join(here, f)], { env }); let out = '';
  const timer = setTimeout(() => p.kill('SIGKILL'), limit * 1000);
  p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
  p.on('exit', (code, sig) => {
    clearTimeout(timer); const results = [...out.matchAll(/^@@RESULT (.*)$/gm)].map((m) => JSON.parse(m[1]));
    resolve({ file: f, code, sig, secs: Math.round((Date.now() - t0) / 100) / 10, results, tail: results.length ? '' : out.split('\n').slice(-8).join('\n') });
  });
});
const all = [];
for (const spec of files) { if (filter && !spec[0].includes(filter)) continue; const r = await run(spec); all.push(r); const pass = r.results.reduce((s, x) => s + x.pass, 0), fail = r.results.reduce((s, x) => s + x.fail, 0); console.log(`${r.file.padEnd(22)} ${String(pass).padStart(4)} geçti ${String(fail).padStart(4)} kaldı  ${r.secs}s${r.results.length ? '' : '  SONUÇ YOK (' + (r.sig || 'kod ' + r.code) + ')\n' + r.tail}`); }
const rf = path.join(here, 'results.json'); let prev = { files: [] }; try { prev = JSON.parse(fs.readFileSync(rf, 'utf8')); } catch (e) { /* ilk koşu */ }
const merged = [...prev.files.filter((p) => !all.some((a) => a.file === p.file)), ...all].sort((a, b) => files.findIndex((f) => f[0] === a.file) - files.findIndex((f) => f[0] === b.file));
fs.writeFileSync(rf, JSON.stringify({ src: process.env.ATOLYE_SRC || 'src', at: new Date().toISOString(), files: merged }, null, 1));
const P = merged.reduce((s, r) => s + r.results.reduce((a, x) => a + x.pass, 0), 0), F = merged.reduce((s, r) => s + r.results.reduce((a, x) => a + x.fail, 0), 0), crashed = merged.filter((r) => !r.results.length).length;
console.log(`\nTOPLAM: ${P + F} denetim, ${P} geçti, ${F} kaldı, ${crashed} dosya sonuç üretmedi`);
process.exit(F || crashed ? 1 : 0);
