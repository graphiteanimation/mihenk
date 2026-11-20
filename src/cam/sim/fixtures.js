// WP-13: baglama govdeleri (fikstur / mengene / divizor). Montaj yerine setup'a bagli basit govdeler: kutu, silindir, ice aktarilan
// (STEP) govdenin ag modeli. Saf JS.
// Belge bicimi (setup.fixtures[]), koordinatlar setup'in TABAN cercevesinde (A = 0; WCS orijinine gore; A acili setup'ta parca ile
// birlikte doner = divizore bagli), govde ise model uzayinda:
//   {id?, name?, kind:'box', min:[x,y,z], max:[x,y,z]}
//   {id?, name?, kind:'cyl', axis:'X'|'Y'|'Z', center:[x,y,z] (bir uc yuzunun merkezi), dia, len}   (eksen +yonde len)
//   {id?, name?, kind:'body', body:'<govde kimligi>'}                                              (islenmeyen belge govdesi)
// Cozulmus kati (sim girdisi; setup cercevesinde, program bolumu setup.fixtures):
//   {kind:'box', name, c:[3], u:[[3],[3],[3]] (birim eksenler), h:[3] (yari olculer)} | {kind:'cyl', name, a:[3], b:[3], r} |
//   {kind:'mesh', name, v:Float32Array (xyz), t:Uint32Array (uclu dizin)}
// Sim girdisi olarak kolaylik: {kind:'box', min, max} (setup cercevesinde eksen hizali) ve {kind:'cyl', axis, center, dia, len} de olur.
// Denetim: fikstur Z yonunde dexel izgarasina (hucre merkezinden dusey isin, aralik listesi) donusturulur; her sim orneginde takim
// zarfi (kesici [uc profili..flut boyu], sap [flut..govde boyu], tutucu profili) bu araliklarla kesisirse carpma. Hucre ayriklastirmasi
// icin takim yaricapi hucre yari kosegeni kadar BUYUTULUR (muhafazakar: yanal temas kacmaz, en cok 0,71*res erken uyari).
// SINIR: dusey yonde hucre merkezindeki deger (egik/yuvarlak ustte hucre icindeki egim kadar eksik olabilir); tutucu ustu (fener mili)
// modellenmez; fikstur tabla yerine parca ile doner (A acili setup'larda tablaya bagli mengene ayrica tanimlanmali).
import { KErr } from '../../shared/errors.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const bad = (i, field) => new KErr('cam.setup.bad_field', { field: `fixtures[${i}].${field}` });
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const AX = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
export const FIXTURE_KINDS = ['box', 'cyl', 'body'];
export const FIXTURE_MAX = 50;

const ID = { p: (q) => q.slice(), d: (v) => v.slice() };
// cerceve: model = o + x*q0 + y*q1 + z*q2
const fromF = (F, q) => [0, 1, 2].map((k) => F.o[k] + F.x[k] * q[0] + F.y[k] * q[1] + F.z[k] * q[2]);
const toF = (F, p) => { const d = sub(p, F.o); return [dot(d, F.x), dot(d, F.y), dot(d, F.z)]; };
const dirF = (F, v) => [0, 1, 2].map((k) => F.x[k] * v[0] + F.y[k] * v[1] + F.z[k] * v[2]);
const dirToF = (F, v) => [dot(v, F.x), dot(v, F.y), dot(v, F.z)];

// Belge listesini dogrular (kopya). Hata: KErr cam.setup.bad_field {field}.
export function normalizeFixtures(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > FIXTURE_MAX) throw new KErr('cam.setup.bad_field', { field: 'fixtures' });
  const v3 = (a) => Array.isArray(a) && a.length === 3 && a.every(isNum);
  return list.map((f, i) => {
    if (!f || typeof f !== 'object' || !FIXTURE_KINDS.includes(f.kind)) throw bad(i, 'kind');
    const o = { id: typeof f.id === 'string' && f.id ? f.id : 'fx' + (i + 1), name: typeof f.name === 'string' && f.name ? f.name.slice(0, 200) : null, kind: f.kind };
    if (f.kind === 'box') {
      if (!v3(f.min) || !v3(f.max) || !f.min.every((v, k) => f.max[k] > v)) throw bad(i, 'min/max');
      o.min = f.min.slice(); o.max = f.max.slice();
    } else if (f.kind === 'cyl') {
      const axis = f.axis ?? 'Z'; if (!AX[axis]) throw bad(i, 'axis');
      if (!v3(f.center)) throw bad(i, 'center');
      if (!(isNum(f.dia) && f.dia > 0)) throw bad(i, 'dia');
      if (!(isNum(f.len) && f.len > 0)) throw bad(i, 'len');
      Object.assign(o, { axis, center: f.center.slice(), dia: f.dia, len: f.len });
    } else {
      if (typeof f.body !== 'string' || !f.body) throw bad(i, 'body');
      o.body = f.body;
    }
    return o;
  });
}

// Belge fiksturlerini setup cercevesindeki katilara cevirir. ctx: {frame, frame0, bodies (rebuild govdeleri), partBodies}
export function resolveFixtures(list, ctx) {
  const fx = normalizeFixtures(list); if (!fx.length) return [];
  const F = ctx.frame, F0 = ctx.frame0 || ctx.frame;
  const base = { p: (q) => toF(F, fromF(F0, q)), d: (v) => dirToF(F, dirF(F0, v)) };
  return fx.map((f, i) => {
    const name = f.name ?? f.id;
    if (f.kind === 'body') {
      if ((ctx.partBodies || []).includes(f.body)) throw new KErr('cam.setup.fixture_is_part', { body: f.body });
      const b = (ctx.bodies || []).find((x) => x.id === f.body); if (!b) throw new KErr('cam.setup.body_missing', { body: f.body });
      if (!b.vertices?.length || !b.triangles?.length) throw bad(i, 'body');
      const v = new Float32Array(b.vertices.length);
      for (let k = 0; k < v.length; k += 3) { const q = toF(F, [b.vertices[k], b.vertices[k + 1], b.vertices[k + 2]]); v[k] = q[0]; v[k + 1] = q[1]; v[k + 2] = q[2]; }
      return { kind: 'mesh', id: f.id, name, v, t: new Uint32Array(b.triangles) };
    }
    return { ...toSolid(f, base), id: f.id, name };
  });
}

// Basit (kutu/silindir) tanimi kati bicimine cevirir; xf: taban -> hedef cerceve donusumu (nokta p, yon d)
function toSolid(f, xf = ID) {
  if (f.kind === 'box' && f.min) {
    const c0 = [0, 1, 2].map((k) => (f.min[k] + f.max[k]) / 2), h = [0, 1, 2].map((k) => (f.max[k] - f.min[k]) / 2);
    return { kind: 'box', c: xf.p(c0), u: [xf.d([1, 0, 0]), xf.d([0, 1, 0]), xf.d([0, 0, 1])].map(nrm), h };
  }
  if (f.kind === 'cyl' && f.center) {
    const ax = AX[f.axis ?? 'Z']; const b0 = [0, 1, 2].map((k) => f.center[k] + ax[k] * f.len);
    return { kind: 'cyl', a: xf.p(f.center), b: xf.p(b0), r: f.dia / 2 };
  }
  return f; // zaten cozulmus
}

// Sim girdisi: cozulmus ya da kolay bicim -> kati listesi (dogrulamali)
export function normalizeSolids(list) {
  if (!Array.isArray(list)) return [];
  return list.map((f, i) => {
    const s = { ...toSolid(f), id: f.id ?? 'fx' + (i + 1), name: f.name ?? f.id ?? 'fx' + (i + 1) };
    const v3 = (a) => Array.isArray(a) && a.length === 3 && a.every(isNum);
    if (s.kind === 'box') { if (!v3(s.c) || !Array.isArray(s.u) || !s.u.every(v3) || !v3(s.h) || !s.h.every((v) => v > 0)) throw bad(i, 'box'); }
    else if (s.kind === 'cyl') { if (!v3(s.a) || !v3(s.b) || !(isNum(s.r) && s.r > 0) || !(Math.hypot(...sub(s.b, s.a)) > 1e-9)) throw bad(i, 'cyl'); }
    else if (s.kind === 'mesh') { if (!s.v?.length || !s.t?.length || s.v.length % 3 || s.t.length % 3) throw bad(i, 'mesh'); }
    else throw bad(i, 'kind');
    return s;
  });
}

function solidBBox(s) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const add = (p) => { for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; } };
  if (s.kind === 'box') { for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) add([0, 1, 2].map((k) => s.c[k] + a * s.h[0] * s.u[0][k] + b * s.h[1] * s.u[1][k] + c * s.h[2] * s.u[2][k])); }
  else if (s.kind === 'cyl') { for (const p of [s.a, s.b]) { add(p.map((v) => v - s.r)); add(p.map((v) => v + s.r)); } }
  else for (let k = 0; k < s.v.length; k += 3) add([s.v[k], s.v[k + 1], s.v[k + 2]]);
  return { mn, mx };
}

// Dusey isin (x, y, t) ile katinin kesisim araliklari -> out'a [lo, hi] ciftleri ekler
function rayBox(s, x, y, out) {
  let lo = -Infinity, hi = Infinity;
  for (let k = 0; k < 3; k++) {
    const u = s.u[k], dz = u[2], w = (x - s.c[0]) * u[0] + (y - s.c[1]) * u[1] - s.c[2] * u[2]; // (p - c).u = w + t dz
    if (Math.abs(dz) < 1e-12) { if (Math.abs(w) > s.h[k]) return; continue; }
    let a = (-s.h[k] - w) / dz, b = (s.h[k] - w) / dz; if (a > b) { const q = a; a = b; b = q; }
    if (a > lo) lo = a; if (b < hi) hi = b; if (lo >= hi) return;
  }
  out.push(lo, hi);
}
function rayCyl(s, x, y, out) {
  const d0 = sub(s.b, s.a), L = Math.hypot(d0[0], d0[1], d0[2]), d = d0.map((v) => v / L);
  const w = [x - s.a[0], y - s.a[1], -s.a[2]]; const wd = dot(w, d), dz = d[2];
  const wp = [w[0] - wd * d[0], w[1] - wd * d[1], w[2] - wd * d[2]], ep = [-dz * d[0], -dz * d[1], 1 - dz * d[2]];
  const A = dot(ep, ep), B = 2 * dot(wp, ep), C = dot(wp, wp) - s.r * s.r;
  let lo, hi;
  if (A < 1e-12) { if (C > 0) return; lo = -Infinity; hi = Infinity; }
  else { const D = B * B - 4 * A * C; if (D < 0) return; const q = Math.sqrt(D); lo = (-B - q) / (2 * A); hi = (-B + q) / (2 * A); }
  if (Math.abs(dz) < 1e-12) { if (wd < 0 || wd > L) return; }
  else { let a = -wd / dz, b = (L - wd) / dz; if (a > b) { const t = a; a = b; b = t; } lo = Math.max(lo, a); hi = Math.min(hi, b); }
  if (lo < hi) out.push(lo, hi);
}

// Ag (mesh) icin dusey isin: XY'de ucgen icindeki noktalarin z degerleri, sirali ciftler (cift sayida degilse [min, max]: muhafazakar)
function meshBins(s, g) {
  const bins = new Map(); const v = s.v, t = s.t;
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
    const x0 = Math.min(v[a], v[b], v[c]), x1 = Math.max(v[a], v[b], v[c]), y0 = Math.min(v[a + 1], v[b + 1], v[c + 1]), y1 = Math.max(v[a + 1], v[b + 1], v[c + 1]);
    const i0 = Math.max(0, Math.floor((x0 - g.x0) / g.res - 0.5)), i1 = Math.min(g.nx - 1, Math.ceil((x1 - g.x0) / g.res - 0.5));
    const j0 = Math.max(0, Math.floor((y0 - g.y0) / g.res - 0.5)), j1 = Math.min(g.ny - 1, Math.ceil((y1 - g.y0) / g.res - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const key = j * g.nx + i; let l = bins.get(key); if (!l) bins.set(key, l = []); l.push(k); }
  }
  return bins;
}
function rayMesh(s, bins, key, x, y, out) {
  const l = bins.get(key); if (!l) return; const v = s.v, t = s.t; const zs = [];
  for (const k of l) {
    const a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
    const ax = v[a], ay = v[a + 1], bx = v[b], by = v[b + 1], cx = v[c], cy = v[c + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-14) continue;
    const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, l3 = 1 - l1 - l2;
    const e = -1e-9; if (l1 < e || l2 < e || l3 < e) continue;
    zs.push(l1 * v[a + 2] + l2 * v[b + 2] + l3 * v[c + 2]);
  }
  if (!zs.length) return;
  zs.sort((p, q) => p - q);
  const u = []; for (const z of zs) if (!u.length || z - u[u.length - 1] > 1e-7) u.push(z); // kenarda iki ucgenden gelen ayni nokta
  if (u.length % 2) { out.push(u[0], u[u.length - 1]); return; }
  for (let k = 0; k < u.length; k += 2) out.push(u[k], u[k + 1]);
}

// Katilar -> Z dexel izgarasi. {x0,y0,res,nx,ny, off:Int32Array(nx*ny+1), iv:Float32Array (lo,hi,katiDizini)*, zmin,zmax, x1,y1, infl, names}
export function fixtureGrid(solids, res, { maxCells = 4e6 } = {}) {
  const S = normalizeSolids(solids); if (!S.length) return null;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const bbs = S.map(solidBBox); for (const b of bbs) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b.mn[k]); mx[k] = Math.max(mx[k], b.mx[k]); }
  let r = res; const area = (mx[0] - mn[0] + 2 * res) * (mx[1] - mn[1] + 2 * res); if (area / (r * r) > maxCells) r = Math.sqrt(area / maxCells);
  const g = { x0: mn[0] - r, y0: mn[1] - r, res: r }; g.nx = Math.max(1, Math.ceil((mx[0] - mn[0]) / r) + 2); g.ny = Math.max(1, Math.ceil((mx[1] - mn[1]) / r) + 2);
  const bins = S.map((s) => (s.kind === 'mesh' ? meshBins(s, g) : null));
  const off = new Int32Array(g.nx * g.ny + 1); const vals = []; const tmp = [];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const key = j * g.nx + i; off[key] = vals.length / 3; const x = g.x0 + (i + 0.5) * r, y = g.y0 + (j + 0.5) * r;
    S.forEach((s, n) => {
      const b = bbs[n]; if (x < b.mn[0] - 1e-9 || x > b.mx[0] + 1e-9 || y < b.mn[1] - 1e-9 || y > b.mx[1] + 1e-9) return;
      tmp.length = 0;
      if (s.kind === 'box') rayBox(s, x, y, tmp); else if (s.kind === 'cyl') rayCyl(s, x, y, tmp); else rayMesh(s, bins[n], key, x, y, tmp);
      for (let k = 0; k < tmp.length; k += 2) vals.push(tmp[k], tmp[k + 1], n);
    });
  }
  off[g.nx * g.ny] = vals.length / 3;
  return { ...g, off, iv: new Float32Array(vals), zmin: mn[2], zmax: mx[2], x1: mx[0], y1: mx[1], xmin: mn[0], ymin: mn[1], infl: 0.7072 * r, names: S.map((s) => s.name), solids: S };
}

// Takim zarfi (geom: sim/tool.js toolGeom) ucu (px,py,pz) iken fikstur kesisimi: en derin {depth, part, fixture, x, y} ya da null.
export function fixtureHit(F, g, px, py, pz, tol = 1e-3) {
  const top = pz + g.bodyLen + (g.holderLen || 0);
  if (pz > F.zmax + tol || top < F.zmin - tol) return null;
  const Rm = Math.max(g.R, g.shaftR, g.holderR) + F.infl;
  if (px + Rm < F.xmin || px - Rm > F.x1 || py + Rm < F.ymin || py - Rm > F.y1) return null;
  const rs = F.res, i0 = Math.max(0, Math.floor((px - Rm - F.x0) / rs)), i1 = Math.min(F.nx - 1, Math.floor((px + Rm - F.x0) / rs));
  const j0 = Math.max(0, Math.floor((py - Rm - F.y0) / rs)), j1 = Math.min(F.ny - 1, Math.floor((py + Rm - F.y0) / rs));
  let best = null; const zf = pz + g.fluteLen, zb = pz + g.bodyLen;
  for (let j = j0; j <= j1; j++) {
    const dy = F.y0 + (j + 0.5) * rs - py;
    for (let i = i0; i <= i1; i++) {
      const key = j * F.nx + i, a = F.off[key], b = F.off[key + 1]; if (a === b) continue;
      const dx = F.x0 + (i + 0.5) * rs - px; const r = Math.max(0, Math.hypot(dx, dy) - F.infl); if (r > Rm - F.infl) continue;
      // takimin bu yaricaptaki dolu yukseklik araliklari
      const rng = [];
      if (r <= g.R) rng.push(pz + g.profile(r), zf, 'tool');
      if (r <= g.shaftR) rng.push(zf, zb, 'shaft');
      if (g.holderR > 0 && r <= g.holderR) { const u = g.holderU(r); if (u < Infinity) rng.push(zb + u, top, 'holder'); }
      if (!rng.length) continue;
      for (let k = a; k < b; k++) {
        const lo = F.iv[k * 3], hi = F.iv[k * 3 + 1];
        for (let q = 0; q < rng.length; q += 3) {
          const ov = Math.min(hi, rng[q + 1]) - Math.max(lo, rng[q]);
          if (ov > tol && (!best || ov > best.depth)) best = { depth: ov, part: rng[q + 2], fixture: F.names[F.iv[k * 3 + 2]], x: px, y: py, z: pz };
        }
      }
    }
  }
  return best;
}
