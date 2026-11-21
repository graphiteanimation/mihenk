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
function gougeAnalytic(tp, f, t, { step = 0.15, gs = 0.1, every = 1 } = {}) {
  const C = makeCutter(t, 0); const R = C.R0; let worst = -Infinity, at = null;
  const pts = samples(tp, step);
  for (let q = 0; q < pts.length; q += every) {
    const [x, y, z] = pts[q];
    const i0 = Math.ceil((x - R) / gs), i1 = Math.floor((x + R) / gs), j0 = Math.ceil((y - R) / gs), j1 = Math.floor((y + R) / gs);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = i * gs, py = j * gs; const d = Math.hypot(px - x, py - y); if (d > R - 1e-4) continue; // sinirda degme oyma degil
      const fz = f(px, py); if (fz === -Infinity) continue; const v = fz - (z + C.prof(d)); if (v > worst) { worst = v; at = [x, y, z]; }
    }
  }
  return { worst, at, n: pts.length };
}
// (1) uc dexel simulasyon: oyma bulgusu (cam.sim.gouge) sayisi ve en derin
function simGouge(tp, S, f, res = 0.25) {
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
  const KS = process.env.WP15_PART ? process.env.WP15_PART.split(',') : ['hemi', 'incl', 'free'];
  for (const k of KS) {
    const M = modelOf(k), S = setupFor(k);
    for (const op of FIN) for (const t of [tool('ball', 6), tool('bullnose', 8, 1.5), tool('flat', 6)]) {
      if (process.env.WP15_OP && process.env.WP15_OP !== op.type) continue;
      if (op.type === 'scallop' && t.type === 'flat') continue;
      if (op.type === 'zlevel' && k === 'incl' && t.type !== 'ball') continue; // duzlemde kontur egrisi dogrusal: bir takim yeter
      const tc = Date.now(); const tp = compute({ ...op, tag: k + '/' + t.type }, S, t, M); const tg = Date.now();
      validateToolpath(tp);
      const ga = gougeAnalytic(tp, PARTS[k].f, t, { every: op.type === 'scallop' ? 3 : 1 }); const tA = Date.now();
      ok(ga.worst <= 0.01, `oyma (analitik) ${k} ${op.type} ${t.type}: ${ga.worst.toFixed(4)} <= 0,01 @${ga.at?.map((v) => v.toFixed(2))}`);
      if (t.type !== 'flat' || op.type !== 'zlevel') {
        const sg = simGouge(tp, S, PARTS[k].f);
        ok(sg.n === 0, `oyma (uc dexel sim) ${k} ${op.type} ${t.type}: ${sg.n} bulgu ${JSON.stringify(sg.issues.filter((x) => x.code === 'cam.sim.gouge').slice(0, 1).map((x) => x.params))}`);
      }
      if (process.env.WP15_V) console.log(k, op.type, t.type, 'hesap', tg - tc, 'analitik', tA - tg, 'sim', Date.now() - tA, 'ms', 'oyma', ga.worst.toFixed(4));
    }
  }
}

// ------------------------------------------------------------------ 4. scallop yuksekligi (hedef +-%20; takim zarfi ince izgarada)
// Kalinti (yuzeye dik yaklasik) = (zarf - f) * cos(egim); zarf(p) = min takim alt yuzeyi (yol ornekleri). Yamada en buyuk = tepe.
function cuspMax(tp, f, t, cx, cy, half = 1, gs = 0.02) {
  const C = makeCutter(t, 0); const R = C.R0; const pts = samples(tp, 0.04).filter((q) => Math.abs(q[0] - cx) <= half + R && Math.abs(q[1] - cy) <= half + R);
  let worst = -Infinity;
  for (let y = cy - half; y <= cy + half + 1e-9; y += gs) for (let x = cx - half; x <= cx + half + 1e-9; x += gs) {
    let env = Infinity; for (const q of pts) { const d = Math.hypot(q[0] - x, q[1] - y); if (d <= R) { const z = q[2] + C.prof(d); if (z < env) env = z; } }
    if (env === Infinity) continue; const fz = f(x, y); const h = 1e-4; const gx = (f(x + h, y) - f(x - h, y)) / (2 * h), gy = (f(x, y + h) - f(x, y - h)) / (2 * h);
    const v = (env - fz) / Math.sqrt(1 + gx * gx + gy * gy); if (v > worst) worst = v;
  }
  return worst;
}
// Not: noktalar sinirdan ilerleyen cephelerin bulustugu ortanca eksenden (kosegenler) uzak secildi; orada tepe buyur (bkz. WP-15.md acik).
if (sec('scallop')) {
  const hs = 0.02; const t = tool('ball', 6);
  for (const [k, spots] of [['hemi', [[7, 2], [-4, -9], [2, 11]]], ['incl', [[-12, 3], [5, -13]]], ['free', [[-12, 4], [3, 13], [-4, -12]]]]) {
    const tp = compute({ type: 'scallop', scallopHeight: hs, tag: k }, setupFor(k), t, modelOf(k));
    for (const [cx, cy] of spots) { const c = cuspMax(tp, PARTS[k].f, t, cx, cy); ok(c >= 0.8 * hs && c <= 1.2 * hs, `scallop ${k} (${cx},${cy}): tepe ${c.toFixed(4)} hedef ${hs} +-%20`); }
  }
}

// ------------------------------------------------------------------ 5. 3D uyarlanir kaba: kalan stok = bitirme payi + kademe tepesi
const RES_R = 0.25;
function excessHemi(remain, x0, y0) { // kalan stok yuzeye dik kalinligi (yarim kure + plaka)
  const out = []; const { nx, ny, res } = remain;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = remain.x0 + (i + 0.5) * res, y = remain.y0 + (j + 0.5) * res; if (Math.abs(x) > 23 || Math.abs(y) > 23) continue;
    const z = remain.data[j * nx + i]; const r = Math.hypot(x, y);
    const dS = Math.hypot(r, z) - Rs; const dP = z; // kure ya da plaka (en yakin)
    out.push({ x, y, z, d: r < Rs ? dS : Math.min(dS, dP) }); // kure ustunde yalniz kure; disinda kure (radyal izdusum) ya da plaka
  }
  return out;
}
if (sec('rough')) {
  const M = modelOf('hemi'), S = setupFor('hemi', 3); const t = tool('flat', 10); const leave = 0.3, fill = 1;
  const op = { type: 'adaptive3d', optimalLoad: 2, stepdown: 4, fillStepdown: fill, stockToLeave: leave, entry: { kind: 'helix', angle: 3, helixDia: 8 }, heights: { clearance: 10, retract: 2 } };
  const tp = compute(op, S, t, M); validateToolpath(tp);
  ok(tp.meta.surf.levels >= 4 && tp.meta.surf.fillLevels >= 8, `3D kaba seviyeler: ana ${tp.meta.surf.levels}, ara ${tp.meta.surf.fillLevels}`);
  const r = simulate(tp, { res: RES_R, stockBox: S.stockBox, modelHeightmap: heightmapFromFn([S.stockBox.min[0], S.stockBox.min[1]], [S.stockBox.max[0], S.stockBox.max[1]], RES_R, (x, y) => Math.max(0, PARTS.hemi.f(x, y))), gougeTol: 0.01, freePieces: false });
  ok(!r.issues.some((x) => x.code === 'cam.sim.gouge'), '3D kaba sim: modele oyma yok');
  const ex = excessHemi(r.remainHeightmap); let mn = Infinity, mx = -Infinity, at = null; for (const e of ex) { if (e.d < mn) mn = e.d; if (e.d > mx) { mx = e.d; at = e; } }
  if (process.env.WP15_V) { const hist = {}; for (const e of ex) { const b = Math.round(e.d * 4) / 4; hist[b] = (hist[b] || 0) + 1; } console.log('kalan', JSON.stringify(at), JSON.stringify(hist)); }
  // ust sinir: pay + ara seviye adimi (kademe tepesi, dusey) + takim kenarindaki izgara/kuantalama payi (0,25 sim hucresi)
  ok(mn >= leave - 0.03, `3D kaba: kalan stok >= bitirme payi (en az ${mn.toFixed(3)}, pay ${leave})`);
  ok(mx <= leave + fill + RES_R, `3D kaba: kalan stok <= pay + kademe tepesi (en cok ${mx.toFixed(3)} <= ${(leave + fill + RES_R).toFixed(2)})`);
  // 3D rest kaba: kucuk takim onceki islemin stogundan yalniz kalan malzemeyi alir
  const t2 = tool('flat', 4); const op2 = { ...op, type: 'adaptive3d', optimalLoad: 0.8, stepdown: 2, fillStepdown: 0.5, entry: { kind: 'helix', angle: 3, helixDia: 3 }, rest: { source: 'stock' }, tag: 'rest' };
  throwsCode(() => CAM.computeOp({ id: 'r', name: 'r', ...base, ...op2 }, { setup: S, tool: t2, geom: { surface: M }, machine: null }), 'cam.adaptive.rest_no_stock', '3D rest kaba: stok haritasi yoksa hata');
  const tp2 = compute(op2, S, t2, M, { stockMap: r.remainHeightmap });
  const r2 = simulate(tp2, { res: RES_R, stockBox: S.stockBox, stockHeightmap: r.remainHeightmap, modelHeightmap: heightmapFromFn([S.stockBox.min[0], S.stockBox.min[1]], [S.stockBox.max[0], S.stockBox.max[1]], RES_R, (x, y) => Math.max(0, PARTS.hemi.f(x, y))), gougeTol: 0.01, freePieces: false });
  ok(!r2.issues.some((x) => x.code === 'cam.sim.gouge'), '3D rest kaba sim: oyma yok');
  const ex2 = excessHemi(r2.remainHeightmap); let mx2 = -Infinity; for (const e of ex2) if (e.d > mx2) mx2 = e.d;
  ok(mx2 <= leave + 0.5 + RES_R && mx2 < mx, `3D rest kaba: en buyuk kalinlik azaldi ${mx.toFixed(3)} -> ${mx2.toFixed(3)}`);
  ok(r2.removedVolume < 0.5 * r.removedVolume, `3D rest kaba yalniz kalani keser (hacim ${r2.removedVolume.toFixed(0)} << ${r.removedVolume.toFixed(0)})`);
}

// ------------------------------------------------------------------ 6. kalem izi yalniz ic koselerde; 3D rest bitirme
const tower = merge(box([-20, -20, 0], [20, 20, 5]), box([-6, -6, 5], [6, 6, 15]));
const towerF = (x, y) => (Math.abs(x) <= 6 && Math.abs(y) <= 6 ? 15 : Math.abs(x) <= 20 && Math.abs(y) <= 20 ? 5 : -Infinity);
const dRect = (x, y, a) => { const dx = Math.max(Math.abs(x) - a, 0), dy = Math.max(Math.abs(y) - a, 0); return Math.abs(x) <= a && Math.abs(y) <= a ? -Math.min(a - Math.abs(x), a - Math.abs(y)) : Math.hypot(dx, dy); };
if (sec('pencil')) {
  const M = buildModel(tower.verts, tower.tris, { tol: 0 }); const S = setupOf([-20, -20, -2], [20, 20, 17], [-20, -20, 0], [20, 20, 15]); const t = tool('ball', 6);
  const tp = compute({ type: 'pencil' }, S, t, M); const pts = samples(tp, 0.2).filter((q) => q[2] < 16);
  const cutPts = []; walk(tp, (m, k, from) => { if ((m.t === 'feed' || m.t === 'arc') && m.kind === 'cut' && !m.link) cutPts.push([m.x, m.y, m.z]); });
  const bad = cutPts.filter((q) => Math.abs(dRect(q[0], q[1], 6) - 3) > 0.35 || Math.abs(q[2] - 5) > 0.05);
  ok(cutPts.length > 10 && bad.length === 0, `kalem: noktalar yalniz ic kosede (kule tabani, R uzakta, z=5): ${bad.length}/${cutPts.length} disarida ${JSON.stringify(bad[0] || null)}`);
  const sides = [0, 0, 0, 0]; for (const q of pts) if (Math.abs(dRect(q[0], q[1], 6) - 3) < 0.4) { if (q[0] > 8.5) sides[0]++; else if (q[0] < -8.5) sides[1]++; else if (q[1] > 8.5) sides[2]++; else if (q[1] < -8.5) sides[3]++; }
  ok(sides.every((n) => n * 0.2 > 0.9 * 12), `kalem: dort kenar da izlendi ${sides.join(',')}`);
  ok(gougeAnalytic(tp, towerF, t).worst <= 0.01, 'kalem: oyma yok (analitik)');
  // kosesiz parcada (egik duzlem) kalem izi yok
  throwsCode(() => CAM.computeOp({ id: 'p', name: 'p', ...base, type: 'pencil' }, { setup: setupFor('incl'), tool: t, geom: { surface: modelOf('incl') }, machine: null }), 'cam.surf.no_pencil', 'kalem: ic kose yoksa yol yok');
  // 3D rest bitirme: onceki D12 kure takimin erisemedigi yer (kule tabani) disinda yol yok
  const tr4 = tool('ball', 4); const tpr = compute({ type: 'parallel', stepover: 0.5, rest: { toolDia: 12 }, tag: 'rest' }, S, tr4, M);
  const far = []; walk(tpr, (m, k, from) => { if (m.t === 'feed' && m.kind === 'cut' && !m.link) { const d = dRect(m.x, m.y, 6); if (d > 6 + 2 + 0.6 || d < 0) far.push([m.x, m.y, m.z]); } });
  ok(far.length === 0, `3D rest bitirme: yol yalniz kalan malzeme bandinda (${far.length} disarida) ${JSON.stringify(far.slice(0, 3))}`);
  ok(gougeAnalytic(tpr, towerF, tr4).worst <= 0.01, '3D rest bitirme: oyma yok');
  throwsCode(() => CAM.computeOp({ id: 'q', name: 'q', ...base, type: 'parallel', stepover: 0.5, rest: { toolDia: 3 } }, { setup: S, tool: tr4, geom: { surface: M }, machine: null }), 'cam.surf.rest_tool_small', '3D rest: onceki takim kucukse hata');
  // Z-seviye: dik duvarlar (kule), duz takimla oyma yok
  const tz = compute({ type: 'zlevel', stepdown: 2, tag: 'tower' }, S, tool('flat', 6), M);
  ok(gougeAnalytic(tz, towerF, tool('flat', 6)).worst <= 0.01, 'Z-seviye duz takim dik duvar: oyma yok');
}

// ------------------------------------------------------------------ 7. egim araligi
if (sec('slope')) {
  const t = tool('ball', 6); const M = modelOf('hemi'), S = setupFor('hemi'); const D = Rs + 3;
  const ang = (q) => { const r = Math.hypot(q[0], q[1]); return r >= D ? 0 : (Math.asin(r / D) * 180) / Math.PI; };
  const pz = []; walk(compute({ type: 'zlevel', stepdown: 1, slope: { min: 45, max: 90 }, tag: 'slope' }, S, t, M), (m) => { if (m.t === 'feed' && m.kind === 'cut' && !m.link) pz.push([m.x, m.y]); });
  ok(pz.length > 0 && pz.every((q) => ang(q) >= 43), `Z-seviye egim >= 45: en kucuk ${Math.min(...pz.map(ang)).toFixed(1)}`);
  const pp = []; walk(compute({ type: 'parallel', stepover: 1, slope: { min: 0, max: 30 }, tag: 'slope' }, S, t, M), (m) => { if (m.t === 'feed' && m.kind === 'cut' && !m.link) pp.push([m.x, m.y]); });
  const sph = pp.filter((q) => Math.hypot(q[0], q[1]) < D - 0.5);
  ok(sph.length > 0 && sph.every((q) => ang(q) <= 32), `paralel egim <= 30: en buyuk ${Math.max(...sph.map(ang)).toFixed(1)}`);
}

// ------------------------------------------------------------------ 8. yay uydurma: sapma <= tol, satir sayisi belirgin azalir
function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const L2 = dx * dx + dy * dy + dz * dz; const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy + (p[2] - a[2]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy, p[2] - a[2] - t * dz); }
function polySegs(tp) { const S = []; walk(tp, (m, k, from) => { if (!from || (m.t !== 'feed' && m.t !== 'arc')) return; if (m.t === 'feed') S.push([[from.x, from.y, from.z], [m.x, m.y, m.z]]); else { let p = [from.x, from.y, from.z]; for (const q of sampleArc(from, m, 0.0002)) { S.push([p, q]); p = q; } } }); return S; }
function hausdorff(A, B) { // A'nin kose noktalarindan B parcalarina en buyuk uzaklik (izgara kovasi)
  const H = new Map(); const key = (x, y) => Math.floor(x) + ',' + Math.floor(y);
  for (const s of B) { const x0 = Math.floor(Math.min(s[0][0], s[1][0])) - 1, x1 = Math.floor(Math.max(s[0][0], s[1][0])) + 1, y0 = Math.floor(Math.min(s[0][1], s[1][1])) - 1, y1 = Math.floor(Math.max(s[0][1], s[1][1])) + 1; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; if (!H.has(k)) H.set(k, []); H.get(k).push(s); } }
  let worst = 0; for (const s of A) for (const p of [s[1]]) { let m = Infinity; for (const q of H.get(key(p[0], p[1])) || []) m = Math.min(m, segDist(p, q[0], q[1])); if (m > worst) worst = m; }
  return worst;
}
if (sec('arcfit')) {
  const t = tool('ball', 6); const tol = 0.005;
  for (const [k, op] of [['hemi', { type: 'zlevel', stepdown: 1.5 }], ['free', { type: 'zlevel', stepdown: 2 }], ['free', { type: 'parallel', stepover: 1.5 }]]) {
    const tp0 = compute({ ...op, tag: k + '/fit0' }, setupFor(k), t, modelOf(k)); const tp1 = applyArcFit(tp0, { arcFit: { tol } });
    const n0 = tp0.moves.length, n1 = tp1.moves.length; const arcs = tp1.moves.filter((m) => m.t === 'arc').length;
    const dAB = hausdorff(polySegs(tp0), polySegs(tp1)), dBA = hausdorff(polySegs(tp1), polySegs(tp0));
    ok(Math.max(dAB, dBA) <= tol + 1e-6, `yay uydurma ${k} ${op.type}: sapma ${Math.max(dAB, dBA).toFixed(5)} <= ${tol}`);
    ok(n1 <= (op.type === 'zlevel' ? 0.5 : 0.75) * n0, `yay uydurma ${k} ${op.type}: satir ${n0} -> ${n1} (yay ${arcs})`);
    if (op.type === 'zlevel') ok(arcs > 0, `yay uydurma ${k} zlevel: G2/G3 uretildi (${arcs})`);
    if (k === 'hemi') ok(gougeAnalytic(tp1, PARTS[k].f, t).worst <= 0.01, 'yay uydurma sonrasi oyma yok (yarim kure)');
  }
  // computeOp yolu (op.arcFit) ve gecersiz tolerans
  const tpc = compute({ type: 'zlevel', stepdown: 3, arcFit: { tol }, tag: 'fitop' }, setupFor('hemi'), t, modelOf('hemi'));
  ok(tpc.meta.arcFit && tpc.meta.arcFit.after < tpc.meta.arcFit.before, 'op.arcFit computeOp icinde uygulanir');
  throwsCode(() => applyArcFit(tpc, { arcFit: { tol: 0 } }), 'cam.op.bad_field', 'yay uydurma: gecersiz tolerans');
}

// ------------------------------------------------------------------ 9. iptal edilebilir hesap (worker) ve ag kaynagi
if (sec('async')) {
  const { Worker } = await import('node:worker_threads');
  const nodeWorker = () => { const w = new Worker(new URL('./wp15/opworker-node.mjs', import.meta.url)); const o = { postMessage: (m) => w.postMessage(m), terminate: () => w.terminate(), onmessage: null, onerror: null }; w.on('message', (m) => o.onmessage?.({ data: m })); w.on('error', (e) => o.onerror?.(e)); return o; };
  const op = { id: 'z', name: 'z', ...base, type: 'zlevel', stepdown: 2 }; const ctx = { setup: setupFor('hemi'), tool: tool('ball', 6), geom: { surface: modelOf('hemi') }, machine: null };
  const ac0 = new AbortController(); ac0.abort(); let e0 = null; try { await computeOpAsync(op, ctx, { signal: ac0.signal, worker: false }); } catch (e) { e0 = e; } ok(e0?.code === 'cam.op.cancelled', 'iptal: onceden iptal edilmis istek');
  const inl = CAM.computeOp(op, ctx); const wk = await computeOpAsync(op, ctx, { worker: nodeWorker }); ok(wk.moves.length === inl.moves.length, `worker sonucu ayni (${wk.moves.length})`);
  const ac = new AbortController(); const t1 = Date.now(); const pr = computeOpAsync({ ...op, type: 'scallop', scallopHeight: 0.005 }, ctx, { signal: ac.signal, worker: nodeWorker }); setTimeout(() => ac.abort(), 300);
  let e1 = null; try { await pr; } catch (e) { e1 = e; } ok(e1?.code === 'cam.op.cancelled' && Date.now() - t1 < 5000, `iptal: suren worker hesabi durdu (${Date.now() - t1} ms)`);
  // STL okuma (ikili)
  const m = box([0, 0, 0], [1, 2, 3]); const buf = new Uint8Array(84 + 12 * 50); const dv = new DataView(buf.buffer); dv.setUint32(80, 12, true);
  for (let tI = 0; tI < 12; tI++) for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) dv.setFloat32(84 + tI * 50 + 12 + (v * 3 + c) * 4, m.verts[m.tris[tI * 3 + v] * 3 + c], true);
  const st = parseSTL(buf); const Mb = buildModel(st.verts, null, { tol: 0.001 }); ok(Mb.T.length === 36 && Mb.P.length === 24 && Mb.E.length === 36, `STL: 12 ucgen, 8 kose, 18 kenar (${Mb.T.length / 3}/${Mb.P.length / 3}/${Mb.E.length / 2})`);
  throwsCode(() => CAM.computeOp({ ...op }, { ...ctx, geom: {} }), 'cam.surf.no_model', 'yuzey modeli yoksa hata');
  throwsCode(() => CAM.computeOp({ ...op }, { ...ctx, tool: { ...ctx.tool, type: 'drill', tipAngle: 118, id: 'd' } }), 'cam.surf.tool_type', 'uygun olmayan takim');
}

// ------------------------------------------------------------------ 10. sema, i18n, serit
if (sec('ui')) {
  const doc = { params: [], features: [], cam: { tools: [], setups: [{ id: 's', name: 'S', bodies: [], ops: [
    { id: 'a', type: 'adaptive3d', optimalLoad: 2, stepdown: 4, fillStepdown: 1, flatLevels: true, rest: { source: 'stock' }, boundary: { kind: 'stock', offset: 0 }, tolerance: 0.01 },
    { id: 'z', type: 'zlevel', stepdown: 1, slope: { min: 30, max: 90 }, arcFit: { tol: 0.005, arcs: true } }, { id: 'p', type: 'parallel', stepover: 1, angle: 45, pattern: 'zigzag', rest: { toolDia: 10, cornerR: 0 } },
    { id: 'c', type: 'scallop', scallopHeight: 0.01, sampling: 0.1 }, { id: 'k', type: 'pencil', minAngle: 20, minLength: 2 }], geomX: null }] } };
  let err = null; try { validateDoc(doc); } catch (e) { err = e; } ok(!err || !String(err.params?.path || '').includes('ops'), 'WP-15 alanlari semada: ' + (err ? err.code + JSON.stringify(err.params) : ''));
  let e2 = null; try { validateDoc({ ...doc, cam: { ...doc.cam, setups: [{ ...doc.cam.setups[0], ops: [{ id: 'a', type: 'parallel', pattern: 'spiral' }] }] } }); } catch (e) { e2 = e; } ok(e2?.code === 'schema.bad_field', 'gecersiz desen reddedilir');
  for (const ty of CAM.SURF3D_TYPES) for (const [nm, d] of [['tr', tr], ['en', en]]) ok(typeof d['cam.op.type.' + ty] === 'string' && typeof d['cam.cmd.' + ty] === 'string' && typeof d['cam.tip.op-' + ty] === 'string', `i18n ${nm}: ${ty} adlari`);
  const { CAM_RIBBON } = await import('../src/ui/cam/ribbon.js'); const g3 = CAM_RIBBON.find((g) => g[0] === 'cam-3d'); const all = [...g3[2], ...(g3[3]?.extra || [])];
  ok(CAM.SURF3D_TYPES.every((ty) => all.includes('cam-op-' + ty)) && g3[2].length <= 2, `serit 3D grubu: ${g3[2].join(',')} + tasma ${(g3[3]?.extra || []).join(',')}`);
}

console.log(`\nWP-15: ${pass} gecti, ${fail} kaldi (${((Date.now() - T0) / 1000).toFixed(0)} sn)`);
console.log('sure (islem, cpu sn, duvar sn, hareket):', JSON.stringify(timing));
process.exit(fail ? 1 : 0);
