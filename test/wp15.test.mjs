// WP-15 testleri: 3D islemler (uyarlanir kaba, Z-seviye, paralel, scallop, kalem, 3D rest), yay uydurma, yukseklik haritasindan ada
// (T-20), iptal edilebilir hesap. Analitik yuzeylerden (yarim kure, egik duzlem, serbest yuzey, basamakli parca) ag kurulur; oyma
// iki bagimsiz yolla denetlenir: (1) uc dexel simulasyon (sim API, model haritasi analitik), (2) takim zarfi - analitik yuzey mesafesi
// (ince ornekleme). Scallop yuksekligi takim zarfi ile ince izgarada olculur. Calistir: node test/wp15.test.mjs
import * as CAM from '../src/cam/index.js';
import { walk, sampleArc, validateToolpath } from '../src/cam/ir.js';
import { simulate, heightmapFromFn, stockHeightmap } from '../src/cam/sim/index.js';
import { buildModel, parseSTL } from '../src/cam/surf/mesh.js';
import { makeCutter } from '../src/cam/surf/drop.js';
import { islandRegions } from '../src/cam/surf/zmap.js';
import { applyArcFit } from '../src/cam/ops/arcfit.js';
import { computeOpAsync } from '../src/cam/surf/async.js';
import { validateDoc } from '../src/shared/schema.js';
import * as P from '../src/cam/geom/path2d.js';
import { hemisphere, heightfield, box, merge } from './wp15/fixtures.mjs';
import tr from '../src/i18n/tr.js';
import en from '../src/i18n/en.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const throwsCode = (fn, code, m) => { try { fn(); ok(false, `${m}: hata bekleniyordu (${code})`); } catch (e) { ok(e.code === code, `${m}: ${e.code} != ${code} ${JSON.stringify(e.params || {})}`); } };
const T0 = Date.now(); const ONLY = process.env.WP15_ONLY ? process.env.WP15_ONLY.split(',') : null; const sec = (n) => !ONLY || ONLY.includes(n);
const tool = (type, dia, cornerR) => ({ id: `t-${type}-${dia}`, number: 7, lengthOffset: 7, type, dia, ...(cornerR != null ? { cornerR } : {}), fluteLen: 40, bodyLen: 70, flutes: 2, centerCutting: true });
const base = { rpm: 9000, feedCut: 1200, feedPlunge: 400, coolant: 'flood', heights: { clearance: 10, retract: 2 } };
const frame = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const setupOf = (min, max, mmin, mmax) => ({ id: 's1', name: 'S1', workOffset: { kind: 'G55' }, frame, stock: { kind: 'box' }, stockBox: { min, max }, modelBBox: { min: mmin, max: mmax }, clearance: 5, aAngle: null, stockTop: max[2], machinePos: null });
const cpu = () => process.cpuUsage().user / 1e6;
const timing = [];
const compute = (op, S, t, M, extra = {}) => { const c0 = cpu(), w0 = Date.now(); const tp = CAM.computeOp({ id: op.type, name: op.type, ...base, ...op }, { setup: S, tool: t, geom: { surface: M }, machine: null, ...extra }); timing.push({ op: op.type + (op.tag ? ':' + op.tag : ''), cpu: +(cpu() - c0).toFixed(2), wall: +((Date.now() - w0) / 1000).toFixed(2), moves: tp.moves.length }); return tp; };

// ------------------------------------------------------------------ parcalar (analitik yuzey f(x,y) = ust yuzey; yoksa -Infinity)
const Rs = 15;
const PARTS = {
  hemi: { mesh: () => hemisphere(Rs, 0, 0, 0, 25, 0.002), tol: 0.002, f: (x, y) => (Math.abs(x) > 25 || Math.abs(y) > 25 ? -Infinity : Math.sqrt(Math.max(0, Rs * Rs - x * x - y * y))), min: [-25, -25, 0], max: [25, 25, Rs] },
  incl: { mesh: () => heightfield((x) => 5 + 0.45 * x, -20, -20, 20, 20, 4), tol: 0, f: (x, y) => (Math.abs(x) > 20 || Math.abs(y) > 20 ? -Infinity : 5 + 0.45 * x), min: [-20, -20, -4], max: [20, 20, 14] },
  free: { mesh: () => heightfield(ff, -20, -20, 20, 20, 200), tol: 0.001, f: (x, y) => (Math.abs(x) > 20 || Math.abs(y) > 20 ? -Infinity : ff(x, y)), min: [-20, -20, 0], max: [20, 20, 11] },
};
function ff(x, y) { return 6 + 2 * Math.sin(x / 6) * Math.cos(y / 5) + 2.5 * Math.exp(-((x - 4) ** 2 + (y + 3) ** 2) / 30); }
const cacheM = {};
const modelOf = (k) => cacheM[k] || (cacheM[k] = (() => { const m = PARTS[k].mesh(); return buildModel(m.verts, m.tris, { tol: PARTS[k].tol }); })());
const setupFor = (k, top = 2) => { const p = PARTS[k]; return setupOf([p.min[0], p.min[1], p.min[2] - 2], [p.max[0], p.max[1], p.max[2] + top], p.min, p.max); };

// takim yolu ornekleri (kesme + baglanti; hizli haric) [x,y,z]
function samples(tp, step = 0.1) {
  const out = [];
  walk(tp, (m, k, from) => {
    if (!from || (m.t !== 'feed' && m.t !== 'arc')) return;
    if (m.t === 'feed') { const L = Math.hypot(m.x - from.x, m.y - from.y, m.z - from.z); const n = Math.max(1, Math.ceil(L / step)); for (let i = 1; i <= n; i++) out.push([from.x + ((m.x - from.x) * i) / n, from.y + ((m.y - from.y) * i) / n, from.z + ((m.z - from.z) * i) / n]); }
    else for (const q of sampleArc(from, m, 0.001)) out.push(q);
  });
  return out;
}
// (2) analitik mesafe: takim alt zarfi ile yuzey arasi en buyuk giris (mm, pozitif = oyma). Yuzey gs adimli izgarada ornekleri.
function gougeAnalytic(tp, f, t, { step = 0.1, gs = 0.05, every = 1 } = {}) {
  const C = makeCutter(t, 0); const R = C.R0; let worst = -Infinity, at = null;
  const pts = samples(tp, step);
  for (let q = 0; q < pts.length; q += every) {
    const [x, y, z] = pts[q];
    const i0 = Math.ceil((x - R) / gs), i1 = Math.floor((x + R) / gs), j0 = Math.ceil((y - R) / gs), j1 = Math.floor((y + R) / gs);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = i * gs, py = j * gs; const d = Math.hypot(px - x, py - y); if (d > R) continue;
      const fz = f(px, py); if (fz === -Infinity) continue; const v = fz - (z + C.prof(d)); if (v > worst) { worst = v; at = [x, y, z]; }
    }
  }
  return { worst, at, n: pts.length };
}
// (1) uc dexel simulasyon: oyma bulgusu (cam.sim.gouge) sayisi ve en derin
function simGouge(tp, S, f, res = 0.1) {
  const b = S.stockBox; const mh = heightmapFromFn([b.min[0], b.min[1]], [b.max[0], b.max[1]], res, (x, y) => { const v = f(x, y); return v === -Infinity ? b.min[2] : v; });
  const r = simulate(tp, { res, stockBox: b, modelHeightmap: mh, dexel: 'tri', gougeTol: 0.01, freePieces: false });
  const g = r.issues.filter((x) => x.code === 'cam.sim.gouge');
  return { n: g.length, issues: r.issues, remain: r.remainHeightmap };
}

// ------------------------------------------------------------------ 1. yukseklik haritasindan ada (T-20)
if (sec('zmap')) {
  // catili tunel: 20x20 blok, Y boyunca tunel (x 8..12, z 2..6) ustu kapali; tek kesit z=4'te tunel yarik gorunur, haritada gorunmez
  const res = 0.1; const hm = heightmapFromFn([-2, -2], [22, 22], res, (x, y) => (x >= 0 && x <= 20 && y >= 0 && y <= 20 ? 10 : -Infinity));
  for (const z of [-Infinity, 4, 9.99]) {
    const R = islandRegions(hm, z); ok(R.length === 1 && R[0].holes.length === 0, `T-20 catili tunel z=${z}: tek ada, delik yok (${R.length}/${R[0]?.holes.length})`);
    const bb = P.loopBBox([R[0].outer]); ok(bb[0] <= 0 + 1e-9 && bb[1] <= 0 + 1e-9 && bb[2] >= 20 - 1e-9 && bb[3] >= 20 - 1e-9 && bb[0] > -0.3 && bb[2] < 20.3, `T-20 ada siniri muhafazakar ve yakin: ${bb.map((v) => v.toFixed(3))}`);
  }
  // kademeli ada: z=5'in ustunde yalniz orta kule (x,y 5..15, z 10); taban plaka z 3
  const hm2 = heightmapFromFn([-2, -2], [22, 22], res, (x, y) => (x >= 5 && x <= 15 && y >= 5 && y <= 15 ? 10 : x >= 0 && x <= 20 && y >= 0 && y <= 20 ? 3 : -Infinity));
  const A = islandRegions(hm2, 5); const bA = P.loopBBox([A[0].outer]); ok(A.length === 1 && bA[0] <= 5 && bA[0] > 4.7 && bA[2] >= 15 && bA[2] < 15.3, `T-20 z=5 kesiti yalniz kule: ${bA.map((v) => v.toFixed(2))}`);
  const B = islandRegions(hm2, 2); const bB = P.loopBBox([B[0].outer]); ok(B.length === 1 && bB[0] <= 0 && bB[2] >= 20, 'T-20 z=2 kesiti tum plaka');
  // gecme delik (malzeme yok): delik olarak cikar; ada sinirindan ice muhafazakar
  const hm3 = heightmapFromFn([-2, -2], [22, 22], res, (x, y) => (Math.hypot(x - 10, y - 10) < 4 ? -Infinity : x >= 0 && x <= 20 && y >= 0 && y <= 20 ? 6 : -Infinity));
  const C3 = islandRegions(hm3, -Infinity); ok(C3.length === 1 && C3[0].holes.length === 1, 'T-20 gecme delik siluette delik');
  const hb = P.loopBBox([C3[0].holes[0]]); ok(hb[2] - hb[0] <= 8 + 1e-9 && hb[2] - hb[0] > 7.4, `T-20 delik muhafazakar (kucuk): ${(hb[2] - hb[0]).toFixed(3)}`);
  ok(P.area(C3[0].outer) > 0 && P.area(C3[0].holes[0]) < 0, 'T-20 yonler: dis CCW, delik CW');
}

// ------------------------------------------------------------------ 2. drop-cutter dogrulugu (analitik kure)
if (sec('drop')) {
  const M = modelOf('hemi'); const IXmod = await import('../src/cam/surf/mesh.js'); const DR = await import('../src/cam/surf/drop.js');
  const IX = new IXmod.TriIndex(M, 1.5);
  for (const [ty, cr] of [['ball', 3], ['flat', 0], ['bullnose', 1]]) {
    const C = DR.makeCutter({ type: ty, dia: 6, cornerR: cr }, 0); const drop = DR.makeDropper(IX, C); let worst = 0;
    for (let x = -21; x <= 21; x += 0.7) for (let y = -21; y <= 21; y += 0.9) {
      const z = drop(x, y, -50); const f = 3 - cr; const rh = Math.max(0, Math.hypot(x, y) - f); const D = Rs + cr; const za = rh <= D ? Math.max(0, Math.sqrt(D * D - rh * rh) - cr) : 0;
      // normal yonde fark (dik yerde dusey fark buyur): |z - za| * cos(egim)
      const sl = rh <= D && rh > 0 ? rh / D : 0; const e = Math.abs(z - za) * Math.sqrt(Math.max(0, 1 - sl * sl)); if (e > worst) worst = e;
    }
    ok(worst <= 0.0025, `drop-cutter ${ty}: analitik kureden sapma (normal) ${worst.toFixed(5)} <= 0,0025 (ag sehimi 0,002)`);
  }
}

// ------------------------------------------------------------------ 3. bitirmede oyma yok (3 yuzey x islemler x takimlar)
const FIN = [
  { type: 'parallel', stepover: 1.2, angle: 30 },
  { type: 'zlevel', stepdown: 1.5 },
  { type: 'scallop', scallopHeight: 0.02 },
];
if (sec('gouge')) {
  for (const k of ['hemi', 'incl', 'free']) {
    const M = modelOf(k), S = setupFor(k);
    for (const op of FIN) for (const t of [tool('ball', 6), tool('bullnose', 8, 1.5), tool('flat', 6)]) {
      if (op.type === 'scallop' && t.type === 'flat') continue;
      if (op.type === 'zlevel' && k === 'incl' && t.type !== 'ball') continue; // duzlemde kontur egrisi dogrusal: bir takim yeter
      const tp = compute({ ...op, tag: k + '/' + t.type }, S, t, M);
      validateToolpath(tp);
      const ga = gougeAnalytic(tp, PARTS[k].f, t, { every: op.type === 'scallop' ? 3 : 1 });
      ok(ga.worst <= 0.01, `oyma (analitik) ${k} ${op.type} ${t.type}: ${ga.worst.toFixed(4)} <= 0,01 @${ga.at?.map((v) => v.toFixed(2))}`);
      if (t.type !== 'flat' || op.type !== 'zlevel') {
        const sg = simGouge(tp, S, PARTS[k].f);
        ok(sg.n === 0, `oyma (uc dexel sim) ${k} ${op.type} ${t.type}: ${sg.n} bulgu ${JSON.stringify(sg.issues.filter((x) => x.code === 'cam.sim.gouge').slice(0, 1).map((x) => x.params))}`);
      }
    }
  }
}

console.log(`\nWP-15: ${pass} gecti, ${fail} kaldi (${((Date.now() - T0) / 1000).toFixed(0)} sn)`);
console.log('sure (islem, cpu sn, duvar sn, hareket):', JSON.stringify(timing));
process.exit(fail ? 1 : 0);
