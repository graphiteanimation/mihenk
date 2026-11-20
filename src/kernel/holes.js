// Delik tanima (B-rep) ve delik ekseni cikis sorgusu (T-05b, T-14). Saf hesap + cekirdek govdesi (shape + gorunum agi).
// Yontem: ic (malzeme disarida) silindirik yuzler -> eksen, yaricap, eksen boyunca kapsam [t0,t1]; ayni eksenli yuzler
// gruplanir (bolunmus yuzler, kademeler); eksene oturan koniler (matkap ucu, havsa) gruba eklenir. Grup uclarinin hemen
// otesindeki eksen noktasi govde disindaysa o uc ACIK. Iki uc acik = boydan boya; tek uc = kor delik (o uctan delinir).
// Sinirlar (muhafazakar): acisal kapsami < MIN_COVER olan ic silindirler (cep kose yuvarlatmasi, kismi delik) delik sayilmaz;
// silindir/koni disi yuzler (BSPLINE, torus) yok sayilir; govde ici kapali bosluk delik degildir.
import * as TP from './topo.js';

const MIN_COVER = 300;     // derece: delik sayilmak icin eksen cevresinde dolu acisal kapsam
const BINS = 72;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a); return [a[0] / l, a[1] / l, a[2] / l]; };

// Moller-Trumbore: dogru (p + t d) ile ucgen kesisimi t (t > 1e-9), yoksa null
function rayTri(p, d, A, B, C) {
  const e1 = sub(B, A), e2 = sub(C, A), h = cross(d, e2), a = dot(e1, h);
  if (Math.abs(a) < 1e-12) return null;
  const f = 1 / a, s = sub(p, A), u = f * dot(s, h); if (u < 0 || u > 1) return null;
  const q = cross(s, e1), v = f * dot(d, q); if (v < 0 || u + v > 1) return null;
  const t = f * dot(e2, q); return t > 1e-9 ? t : null;
}
// gorunum agi (kapali) icinde mi: uc egik isinda parite, cogunluk
function insideMesh(mesh, p) {
  const V3 = mesh.vertices, T = mesh.triangles; const P = (i) => [V3[3 * i], V3[3 * i + 1], V3[3 * i + 2]];
  const dirs = [unit([0.5773, 0.5774, 0.5775]), unit([-0.6, 0.3, 0.74]), unit([0.21, -0.83, -0.52])];
  let ins = 0;
  for (const d of dirs) { let n = 0; for (let k = 0; k < T.length; k += 3) if (rayTri(p, d, P(T[k]), P(T[k + 1]), P(T[k + 2])) != null) n++; if (n % 2) ins++; }
  return ins >= 2;
}

// Govdenin eksenli yuzleri: [{fi, kind:'cyl'|'cone', ...}] (yalniz ic silindirler; koniler eksen sonra eslenir)
function axialFaces(b, mesh) {
  const T = TP.topoOf(b.shape); const V3 = mesh.vertices, Tr = mesh.triangles;
  const groups = new Map(); for (const g of mesh.faceGroups) { if (g.idx < 0) continue; if (!groups.has(g.idx)) groups.set(g.idx, []); groups.get(g.idx).push(g); }
  const vertsOf = (fi) => { const out = []; for (const g of groups.get(fi) || []) for (let k = g.start; k < g.start + g.count; k++) { const i = Tr[k]; out.push([V3[3 * i], V3[3 * i + 1], V3[3 * i + 2]]); } return out; };
  const trisOf = (fi) => { const out = []; for (const g of groups.get(fi) || []) for (let k = g.start; k + 2 < g.start + g.count; k += 3) out.push([Tr[k], Tr[k + 1], Tr[k + 2]].map((i) => [V3[3 * i], V3[3 * i + 1], V3[3 * i + 2]])); return out; };
  const cyl = [], cone = [];
  for (const [fi, raw] of T.faces.list.entries()) {
    const f = TP.faceWrap(raw); const g = f.geomType;
    if (g === 'CYLINDRE') {
      let ax;
      try { const c = f.surface.wrapped.Cylinder(); const a = c.Axis(); const l = a.Location(), d = a.Direction(); ax = { o: [l.X(), l.Y(), l.Z()], d: unit([d.X(), d.Y(), d.Z()]), r: c.Radius() }; } catch (e) { continue; }
      const tris = trisOf(fi); if (!tris.length) continue;
      // ic/dis: ucgen normali (ag yonu disari) eksene dogru mu
      let s = 0;
      for (const [A, B, C] of tris) { const n = cross(sub(B, A), sub(C, A)); const m = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3]; const w = sub(m, ax.o); const rad = sub(w, ax.d.map((x) => x * dot(w, ax.d))); s += dot(n, rad); }
      if (!(s < 0)) continue;
      cyl.push({ fi, ...ax, verts: vertsOf(fi) });
    } else if (g === 'CONE') cone.push({ fi, verts: vertsOf(fi) });
  }
  return { cyl, cone };
}

// eksen cercevesi: t = (p - o).d, aci ve yaricap
function axisCoords(ax, p) { const w = sub(p, ax.o); const t = dot(w, ax.d); const rv = sub(w, ax.d.map((x) => x * t)); return { t, r: len(rv), rv }; }
function basis(d) { const a = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const u = unit(cross(d, a)); return [u, cross(d, u)]; }

// recognize(b, mesh) -> [{ axis:{o,d}, segs:[{kind:'cyl'|'cone', r0, r1, t0, t1}], t0, t1, open0, open1 }]  (cache: shape)
const CACHE = new WeakMap();
export function recognizeBody(b, mesh) {
  const hit = CACHE.get(b.shape); if (hit) return hit;
  const bb = b.shape.boundingBox; const scale = Math.max(1, Math.hypot(bb.width, bb.height, bb.depth));
  const ptol = 1e-4 * scale, atol = 1e-6;
  const { cyl, cone } = axialFaces(b, mesh);
  const G = [];
  for (const c of cyl) {
    let g = G.find((x) => Math.abs(Math.abs(dot(x.axis.d, c.d)) - 1) < atol && axisCoords(x.axis, c.o).r < ptol);
    if (!g) { g = { axis: { o: c.o, d: c.d }, faces: [] }; G.push(g); }
    g.faces.push(c);
  }
  const out = [];
  for (const g of G) {
    const ax = g.axis; const [u, v] = basis(ax.d);
    // yaricapa gore kapsam ve acisal doluluk
    const byR = [];
    for (const c of g.faces) {
      let e = byR.find((x) => Math.abs(x.r - c.r) < Math.max(1e-6, 1e-4 * c.r)); if (!e) { e = { r: c.r, bins: new Uint8Array(BINS), t0: Infinity, t1: -Infinity }; byR.push(e); }
      for (const p of c.verts) { const q = axisCoords(ax, p); e.t0 = Math.min(e.t0, q.t); e.t1 = Math.max(e.t1, q.t); }
      // ucgen orta noktalari aci kutulari (kenar koseleri degil: kismi yuzun komsu kutuyu doldurmamasi icin)
      for (let k = 0; k + 2 < c.verts.length; k += 3) { const m = [0, 1, 2].map((i) => (c.verts[k][i] + c.verts[k + 1][i] + c.verts[k + 2][i]) / 3); const q = axisCoords(ax, m); const a = Math.atan2(dot(q.rv, v), dot(q.rv, u)); const bi = Math.floor(((a + Math.PI) / (2 * Math.PI)) * BINS) % BINS; e.bins[bi] = 1; }
    }
    const segs = [];
    for (const e of byR) { let n = 0; for (const x of e.bins) n += x; if (n * 360 / BINS >= MIN_COVER) segs.push({ kind: 'cyl', r0: e.r, r1: e.r, t0: e.t0, t1: e.t1 }); }
    if (!segs.length) continue;
    // eksene oturan koniler: koseler r = a + b t (dogrusal) ve cevre boyunca dolu
    for (const c of cone) {
      if (!c.verts.length) continue;
      const qs = c.verts.map((p) => axisCoords(ax, p));
      let st = 0, sr = 0, stt = 0, str = 0; for (const q of qs) { st += q.t; sr += q.r; stt += q.t * q.t; str += q.t * q.r; }
      const n = qs.length, den = n * stt - st * st; if (Math.abs(den) < 1e-12) continue;
      const bk = (n * str - st * sr) / den, ak = (sr - bk * st) / n;
      if (!qs.every((q) => Math.abs(ak + bk * q.t - q.r) < Math.max(ptol, 1e-3))) continue;
      const tmin = Math.min(...qs.map((q) => q.t)), tmax = Math.max(...qs.map((q) => q.t));
      // grubun silindirlerine bitisik olmali (uzak bir ayni eksenli koni baska bir ozellik)
      if (!segs.some((s) => s.kind === 'cyl' && (Math.abs(s.t0 - tmax) < 1e-3 || Math.abs(s.t1 - tmin) < 1e-3 || Math.abs(s.t0 - tmin) < 1e-3 || Math.abs(s.t1 - tmax) < 1e-3))) continue;
      segs.push({ kind: 'cone', r0: ak + bk * tmin, r1: ak + bk * tmax, t0: tmin, t1: tmax });
    }
    segs.sort((a, c) => a.t0 - c.t0);
    const t0 = Math.min(...segs.map((s) => s.t0)), t1 = Math.max(...segs.map((s) => s.t1));
    const rEnd = (t) => Math.max(...segs.filter((s) => Math.abs(s.t0 - t) < 1e-6 || Math.abs(s.t1 - t) < 1e-6).map((s) => (Math.abs(s.t0 - t) < 1e-6 ? s.r0 : s.r1)));
    const dl = Math.max(0.05, 0.02 * Math.max(...segs.map((s) => Math.max(s.r0, s.r1))));
    const open0 = !insideMesh(mesh, add(ax.o, ax.d, t0 - dl)), open1 = !insideMesh(mesh, add(ax.o, ax.d, t1 + dl));
    out.push({ axis: ax, segs, t0, t1, r0: rEnd(t0), r1: rEnd(t1), open0, open1 });
  }
  CACHE.set(b.shape, out); return out;
}

// holeExit(groups, p, d, r) -> { t, through } | null : (p, d) eksenli delik (yaricap ~ r) grubunun d yonunde p'den en derin ucu
// (son cikis). Eksen + yaricap eslesmezse null (cagiran eski muhafazakar kurala doner).
export function holeExit(groups, p, d, r, scale = 1) {
  const ptol = Math.max(1e-3, 1e-4 * scale); const dd = unit(d);
  let best = null;
  for (const g of groups) {
    const ax = g.axis; if (Math.abs(Math.abs(dot(ax.d, dd)) - 1) > 1e-6 || axisCoords(ax, p).r > ptol) continue;
    // eslesme: grupta delik capina yakin (en cok +0,5 mm / %10 genis, en az %50) bir silindir olmali
    if (r != null && !g.segs.some((s) => s.kind === 'cyl' && s.r0 <= r + Math.max(0.5, 0.1 * r) && s.r0 >= 0.5 * r)) continue;
    const sgn = dot(ax.d, dd) > 0 ? 1 : -1; const tp = dot(sub(p, ax.o), ax.d);
    const ends = [g.t0, g.t1].map((t) => (t - tp) * sgn); const t = Math.max(...ends);
    if (!(t > 0)) continue;
    const deepOpen = sgn > 0 ? g.open1 : g.open0; const through = g.open0 && g.open1;
    if (!best || t > best.t) best = { t, through, deepOpen };
  }
  return best;
}
