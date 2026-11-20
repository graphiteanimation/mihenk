// T-24 (WP-03): P4 dolgu govdesi kesitlerinde camSection zincir acikligi ve kapanis denetimi. NC uretmez.
// Calistir: node test/compare/P4/t24-kesit.mjs
// 1) cekirdek camSection artik kapali dongu verir: ardisik uc acikligi 0 (duzeltme oncesi 5,85e-4 mm, Y29,05; 6,8e-4, Y27,05),
// 2) src/cam/geom/path2d.js closeSectionLoops etkisiz (zaten kapali) ve aciklik 0,
// 3) uclari BIREBIR paylasan eskiz (birlestirme yok, NODE_TOL) kapatilmis dongulerde betigin 2e-3 mm birlestirmeli
//    eskiziyle ayni bolge sayisini verir; ham donguler daha az (ada kaybi).
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import { initKernel } from '../../../src/kernel/kernel.js';
import { closeSectionLoops } from '../../../src/cam/geom/path2d.js';
import { findRegions } from '../../../src/shared/profiles.js';

const here = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(here, '..', '..', '..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const K = await initKernel(opencascade, () => path.join(ROOT, 'node_modules/replicad-opencascadejs/dist/replicad_single.wasm'));
const IMP = { id: 'imp', type: 'import', format: 'step', data: fs.readFileSync(path.join(here, 'in', 'P4_NIST_FTC10_kapak.stp')).toString('base64'), name: 'P4' };
// run-p4.mjs ile ayni dolgu (yalniz ada kesitleri icin)
const box = (id, x0, y0, z0, x1, y1, z1) => ({ id, type: 'primitive', kind: 'box', x: x0, y: y0, z: z0, w: x1 - x0, d: y1 - y0, h: z1 - z0, op: 'join', targets: ['imp'] });
const cyl = (id, x) => ({ id, type: 'primitive', kind: 'cylinder', x, y: 23, z: -37.5, dia: 10, h: 75, axis: 'Z', op: 'join', targets: ['imp'] });
const cylX = (id, y, z) => ({ id, type: 'primitive', kind: 'cylinder', x: 27, y, z, dia: 5.5, h: 35.5, axis: 'X', op: 'join', targets: ['imp'] });
const FILL = [...[-52, -30, -8, 14].map((x, i) => cyl('fc' + i, x)), box('fV', -52, 23, -37.5, 14, 29.5, 37.5), box('fB1', 16, 23, -18, 59, 27, -2), box('fB2', 16, 23, 2, 59, 29, 16.5), box('fB3', 14, 23, -32, 30, 27, -18), cylX('fx1', 15, -25), cylX('fx2', 18, 23.5)];
await K.rebuild({ params: [], features: [IMP, ...FILL] });
const F1 = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0] };
const e = (g) => (g.fwd === false ? g.p0 : g.p1), s = (g) => (g.fwd === false ? g.p1 : g.p0);
const worstGap = (loops) => { let w = 0; for (const l of loops) { if (l.some((g) => g.type === 'circle')) continue; for (let i = 0; i < l.length; i++) { const a = e(l[i]), b = s(l[(i + 1) % l.length]); w = Math.max(w, Math.hypot(a[0] - b[0], a[1] - b[1])); } } return w; };
// eskiz: SN birlestirme toleransi (0 = yalniz birebir ayni nokta)
function regions(loops, SN) {
  const points = {}; const ents = []; let n = 0, ei = 0; const list = [];
  const P = (q) => { for (const [id, pt] of list) if (SN > 0 ? Math.hypot(pt[0] - q[0], pt[1] - q[1]) <= SN : pt[0] === q[0] && pt[1] === q[1]) return id; const i = 'p' + (++n); points[i] = { x: q[0], y: q[1] }; list.push([i, q]); return i; };
  for (const l of loops) for (const g of l) {
    if (g.type === 'circle') { ents.push({ id: 'e' + (ei++), type: 'circle', c: P(g.c), r: g.r }); continue; }
    const a = P(g.p0), b = P(g.p1);
    if (g.type === 'line') { if (a !== b) ents.push({ id: 'e' + (ei++), type: 'line', a, b }); } else ents.push({ id: 'e' + (ei++), type: 'arc', c: P(g.c), a, b });
  }
  return findRegions({ points, ents }).regions.length;
}
for (const y of [29.05, 27.05]) {
  const raw = K.camSection({ body: 'imp', frame: F1, z: y }).loops;
  const fixed = closeSectionLoops(raw);
  const g0 = worstGap(raw), g1 = worstGap(fixed);
  const rRaw = regions(raw, 0), rFix = regions(fixed, 0), rRef = regions(raw, 2e-3);
  console.log(`Y${y}: dongu ${raw.length}, ham aciklik ${g0.toExponential(3)} mm, kapatilmis ${g1}; bolge ham ${rRaw} / kapatilmis ${rFix} / betik (2e-3) ${rRef}`);
  ok(g0 === 0, `Y${y}: cekirdek kesitinde aciklik 0 (once ${y === 29.05 ? '5,85e-4' : '6,8e-4'} mm)`);
  ok(rRaw === rRef, `Y${y}: cekirdek kesiti birlestirmesiz eskizde ada kaybetmez (${rRaw} = ${rRef})`);
  ok(g1 === 0, `Y${y}: kapanis sonrasi aciklik 0`);
  ok(rFix === rRef, `Y${y}: kapatilmis donguler betik birlestirmesiyle ayni bolge sayisi (${rFix} = ${rRef})`);
}
console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
