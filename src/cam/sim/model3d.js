// WP-22b: model aginin (ucgen ag, setup cercevesinde) isin kesisimleri. Saf JS.
// Amac: oyma (gouge) denetimini yukseklik haritasi yerine gercek 3B modele karsi yapmak:
//   - tri-dexel kipi (opts.dexel 'tri'): stok izgarasiyla AYNI X/Y/Z isin aglarinda model malzeme araliklari (triFromMesh)
//   - G87 (yukari kesim) yukseklik haritasi kipinde: yalniz Z isinlari (meshZGrid)
//   - sarma (wrap): silindirik izgarada A ekseninden disari isinlar (meshRadialRays)
// Ag girdisi (opts.modelMeshes[setupId]): { v: xyz (Float32Array|dizi), t: uclu dizin (Uint32Array|dizi), err?: mm }
//   err: ag kiris hatasi (ic bukey yuzeylerde ag gercek yuzeyin DISINDA kalir; oyma toleransina eklenir).
// Aralik secimi (O onerisi): sarim sayisi (winding) -- ucgen normali isin yonune karsiysa giris (+1), ayni yondeyse cikis (-1);
// malzeme = sarim > 0. Ust uste binen kapali kabuklarin birlesimi (kutu birlesimi) dogru cozulur. Ayni isaretli ve ayni
// konumdaki vuruslar (ortak kenar/kose) bir sayilir. Sarim tutarsizsa (yon karisik ag) eslik (parity) yedegi: tek sayida
// vurusta [ilk, son] (muhafazakar: fazla model = fazla oyma uyarisi).
import { KErr } from '../../shared/errors.js';

const DEDUP = 1e-7;
const EMPTY = Object.freeze([]); // model isinlari salt okunur: bos isinlar tek nesneyi paylasir (bellek)
export function normalizeMesh(m) {
  if (!m || !m.v || !m.t || !m.v.length || !m.t.length || m.v.length % 3 || m.t.length % 3) throw new KErr('cam.sim.bad_model_mesh', {});
  const err = Number.isFinite(m.err) && m.err > 0 ? m.err : 0;
  return { v: m.v, t: m.t, err };
}
// hits: [deger, isaret, ...] (isaret +1 giris, -1 cikis). start: isin basinda sarim (yaricapsal isinlarda eksen icerde olabilir)
function intervals(hits, start = null) {
  const n = hits.length / 2; if (!n && !start) return [];
  const idx = new Array(n); for (let k = 0; k < n; k++) idx[k] = k;
  idx.sort((a, b) => hits[2 * a] - hits[2 * b] || hits[2 * a + 1] - hits[2 * b + 1]);
  const vs = [], ss = [];
  for (const k of idx) { const v = hits[2 * k], s = hits[2 * k + 1]; let dup = false; for (let q = vs.length - 1; q >= 0 && v - vs[q] <= DEDUP; q--) if (ss[q] === s) { dup = true; break; } if (!dup) { vs.push(v); ss.push(s); } }
  // sarim
  let w0 = 0; if (start != null) { let sum = 0; for (const s of ss) sum += s; w0 = -sum; } // yaricapsal: bastaki sarim = -toplam
  let w = w0, okW = w0 >= 0 && w0 <= 1; const out = []; let open = w > 0 ? (start ?? 0) : null;
  for (let q = 0; q < vs.length && okW; q++) {
    const pw = w; w += ss[q]; if (w < 0) { okW = false; break; }
    if (pw <= 0 && w > 0) open = vs[q];
    else if (pw > 0 && w <= 0) { if (out.length && open - out[out.length - 1] <= DEDUP) out[out.length - 1] = vs[q]; else out.push(open, vs[q]); open = null; }
  }
  if (okW && w === 0) return out;
  // eslik yedegi
  const u = []; for (const v of vs) if (!u.length || v - u[u.length - 1] > DEDUP) u.push(v);
  if (start != null && u.length % 2) u.unshift(start);
  if (u.length % 2) return u.length ? [u[0], u[u.length - 1]] : [];
  return u;
}
// Eksene paralel isin agi: isin yonu eksen ax (0 x, 1 y, 2 z); dik koordinatlar pa, pb. Isin (i, j): pa = a0 + (i+0.5) res,
// pb = b0 + (j+0.5) res; cikti out[j*na + i] = aralik listesi.
function axisRays(mesh, ax, pa, pb, a0, na, b0, nb, res) {
  const v = mesh.v, t = mesh.t; const hits = new Array(na * nb);
  for (let k = 0; k < t.length; k += 3) {
    const A = t[k] * 3, B = t[k + 1] * 3, C = t[k + 2] * 3;
    const ax_ = v[A + pa], ay = v[A + pb], bx = v[B + pa], by = v[B + pb], cx = v[C + pa], cy = v[C + pb];
    const den = (by - cy) * (ax_ - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-14) continue; // isina paralel ucgen
    // normalin isin bileseni: (B-A)x(C-A) . e_ax; dik duzlemde (pa, pb, ax) sag el sirasi icin isaret
    const cr = (bx - ax_) * (cy - ay) - (by - ay) * (cx - ax_); // (pa,pb) duzleminde capraz carpim = normal . e_ax (dongusel sira)
    const s = cr > 0 ? -1 : 1; // normal +ax yonunde: isin (+ax) ucgenden cikar
    const i0 = Math.max(0, Math.ceil((Math.min(ax_, bx, cx) - a0) / res - 0.5)), i1 = Math.min(na - 1, Math.floor((Math.max(ax_, bx, cx) - a0) / res - 0.5));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - b0) / res - 0.5)), j1 = Math.min(nb - 1, Math.floor((Math.max(ay, by, cy) - b0) / res - 0.5));
    if (i1 < i0 || j1 < j0) continue;
    const az = v[A + ax], bz = v[B + ax], cz = v[C + ax];
    for (let j = j0; j <= j1; j++) {
      const y = b0 + (j + 0.5) * res;
      for (let i = i0; i <= i1; i++) {
        const x = a0 + (i + 0.5) * res;
        const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax_ - cx) * (y - cy)) / den, l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const key = j * na + i; const h = hits[key] || (hits[key] = []); h.push(l1 * az + l2 * bz + l3 * cz, s);
      }
    }
  }
  const out = new Array(na * nb);
  for (let q = 0; q < out.length; q++) { const r = hits[q] ? intervals(hits[q]) : EMPTY; out[q] = r.length ? r.slice() : EMPTY; hits[q] = undefined; }
  return out;
}
// (pa, pb, ax) sag el sirasi: z isini (x, y) icin (0,1,2); x isini (y, z): (1,2,0); y isini (z, x): (2,0,1). Izgara dizini icin
// y isinlarinda dik koordinatlar (x, z) sirasiyla istenir: isaret tersine doner (sol el) -> ayri ele alinir.
function raysFor(mesh, axis, T) {
  if (axis === 'z') return axisRays(mesh, 2, 0, 1, T.x0, T.nx, T.y0, T.ny, T.res);
  if (axis === 'x') return axisRays(mesh, 0, 1, 2, T.y0, T.ny, T.z0, T.nz, T.res);
  // y: (pa, pb) = (x, z) sol el: isaretleri ters cevir
  const flip = { v: mesh.v, t: flipTris(mesh.t) };
  return axisRays(flip, 1, 0, 2, T.x0, T.nx, T.z0, T.nz, T.res);
}
function flipTris(t) { const o = new Uint32Array(t.length); for (let k = 0; k < t.length; k += 3) { o[k] = t[k]; o[k + 1] = t[k + 2]; o[k + 2] = t[k + 1]; } return o; }

// Tri-dexel stok izgarasinda (T: x0,y0,z0,res,nx,ny,nz) model araliklari: { ...izgara, zr, xr, yr, err, zTop }
export function triFromMesh(mesh0, T) {
  const mesh = normalizeMesh(mesh0);
  const M = { x0: T.x0, y0: T.y0, z0: T.z0, res: T.res, nx: T.nx, ny: T.ny, nz: T.nz, err: mesh.err };
  M.zr = raysFor(mesh, 'z', M); M.xr = raysFor(mesh, 'x', M); M.yr = raysFor(mesh, 'y', M);
  let top = -Infinity; for (let k = 2; k < mesh.v.length; k += 3) if (mesh.v[k] > top) top = mesh.v[k]; M.zTop = top;
  return M;
}
// Yalniz Z isinlari (yukseklik haritasi izgarasi hm): { x0, y0, res, nx, ny, zr, err }
export function meshZGrid(mesh0, hm) {
  const mesh = normalizeMesh(mesh0);
  return { x0: hm.x0, y0: hm.y0, res: hm.res, nx: hm.nx, ny: hm.ny, err: mesh.err, zr: axisRays(mesh, 2, 0, 1, hm.x0, hm.nx, hm.y0, hm.ny, hm.res) };
}
// [lo, hi] ile araliklarin en buyuk ortusmesi (hi Infinity olabilir); ortusen parcanin [a, b] sinirlari
export function overlapIv(r, lo, hi) {
  let best = 0, a = 0, b = 0;
  for (let k = 0; k < r.length; k += 2) { const l = Math.max(r[k], lo), h = Math.min(r[k + 1], hi); if (h - l > best) { best = h - l; a = l; b = h; } }
  return best > 0 ? { ov: best, a, b } : null;
}

// Sarma: silindirik izgara W (x0, res, nx, nt, dt) uzerinde, (x_i, theta_j) isini A ekseninden (Y = Z = 0) disari, yon
// (0, sin theta, cos theta). Cikti: Array(nt*nx) yaricap araliklari (k = j*nx + i), err.
export function meshRadialRays(mesh0, W) {
  const mesh = normalizeMesh(mesh0); const v = mesh.v, t = mesh.t; const TAU = 2 * Math.PI;
  const hits = new Array(W.nx * W.nt);
  for (let k = 0; k < t.length; k += 3) {
    const P = [t[k] * 3, t[k + 1] * 3, t[k + 2] * 3];
    const xs = P.map((p) => v[p]), ys = P.map((p) => v[p + 1]), zs = P.map((p) => v[p + 2]);
    const i0 = Math.max(0, Math.ceil((Math.min(...xs) - W.x0) / W.res - 0.5)), i1 = Math.min(W.nx - 1, Math.floor((Math.max(...xs) - W.x0) / W.res - 0.5));
    if (i1 < i0) continue;
    // aci araligi (theta = atan2(y, z)); izdusumu ekseni iceriyorsa ya da eksene cok yakinsa tum acilar
    const th = [0, 1, 2].map((q) => Math.atan2(ys[q], zs[q])); const rr = [0, 1, 2].map((q) => Math.hypot(ys[q], zs[q]));
    let jl, jh, all = Math.min(...rr) < 1e-9;
    if (!all) {
      const d = th.map((a) => { let x = a - th[0]; x -= TAU * Math.round(x / TAU); return x; });
      const lo = th[0] + Math.min(...d), hi = th[0] + Math.max(...d);
      if (hi - lo > Math.PI - 1e-9 || origInTri(ys, zs)) all = true;
      else { jl = Math.ceil(lo / W.dt - 0.5); jh = Math.floor(hi / W.dt - 0.5); if (jh < jl) continue; if (jh - jl + 1 >= W.nt) all = true; }
    }
    if (all) { jl = 0; jh = W.nt - 1; }
    // ucgen duzlemi: n = (B-A) x (C-A)
    const e1 = [xs[1] - xs[0], ys[1] - ys[0], zs[1] - zs[0]], e2 = [xs[2] - xs[0], ys[2] - ys[0], zs[2] - zs[0]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (let jj = jl; jj <= jh; jj++) {
      const j = ((jj % W.nt) + W.nt) % W.nt, a = (j + 0.5) * W.dt, dy = Math.sin(a), dz = Math.cos(a);
      const nd = n[1] * dy + n[2] * dz; if (Math.abs(nd) < 1e-14) continue;
      const s = nd > 0 ? -1 : 1;
      for (let i = i0; i <= i1; i++) {
        const x = W.x0 + (i + 0.5) * W.res;
        // Moller-Trumbore: O = (x, 0, 0), D = (0, dy, dz)
        const pv = [dy * e2[2] - dz * e2[1], dz * e2[0], -dy * e2[0]]; // D x e2
        const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2]; if (Math.abs(det) < 1e-14) continue;
        const tv = [x - xs[0], -ys[0], -zs[0]]; const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det; if (u < -1e-9 || u > 1 + 1e-9) continue;
        const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
        const w = (dy * qv[1] + dz * qv[2]) / det; if (w < -1e-9 || u + w > 1 + 1e-9) continue;
        const r = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det; if (!(r > 0)) continue;
        const key = j * W.nx + i; const h = hits[key] || (hits[key] = []); h.push(r, s);
      }
    }
  }
  const out = new Array(W.nx * W.nt);
  for (let q = 0; q < out.length; q++) { const r = hits[q] ? intervals(hits[q], 0) : EMPTY; out[q] = r.length ? r.slice() : EMPTY; hits[q] = undefined; }
  return { rays: out, err: mesh.err };
}
function origInTri(ys, zs) {
  const s = (a, b) => ys[a] * zs[b] - zs[a] * ys[b]; // (P_b - 0) x (P_a - 0) yon
  const d1 = s(0, 1), d2 = s(1, 2), d3 = s(2, 0);
  return (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
}

// Test/arayuz yardimcisi: eksen hizali kutu agi (disa yonlu 12 ucgen)
export function boxMesh(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const v = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1];
  const t = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { v: new Float32Array(v), t: new Uint32Array(t) };
}
// Aglari birlestirir (ayni cercevede kapali kabuklar; sarim kurali birlesimi cozer)
export function mergeMeshes(list) {
  let nv = 0, nt = 0; for (const m of list) { nv += m.v.length; nt += m.t.length; }
  const v = new Float32Array(nv), t = new Uint32Array(nt); let ov = 0, ot = 0;
  for (const m of list) { v.set(m.v, ov); for (let k = 0; k < m.t.length; k++) t[ot + k] = m.t[k] + ov / 3; ov += m.v.length; ot += m.t.length; }
  return { v, t, err: Math.max(0, ...list.map((m) => m.err || 0)) };
}
// Rebuild govdeleri (model uzayi; vertices/triangles) -> setup cercevesi agi (frame: {o, x, y, z})
export function bodiesMeshInFrame(bodies, frame, err = 0) {
  const list = [];
  for (const b of bodies || []) {
    if (!b?.vertices?.length || !b?.triangles?.length) continue;
    const v = new Float32Array(b.vertices.length);
    for (let k = 0; k < v.length; k += 3) {
      const d = [b.vertices[k] - frame.o[0], b.vertices[k + 1] - frame.o[1], b.vertices[k + 2] - frame.o[2]];
      v[k] = d[0] * frame.x[0] + d[1] * frame.x[1] + d[2] * frame.x[2]; v[k + 1] = d[0] * frame.y[0] + d[1] * frame.y[1] + d[2] * frame.y[2]; v[k + 2] = d[0] * frame.z[0] + d[1] * frame.z[1] + d[2] * frame.z[2];
    }
    list.push({ v, t: new Uint32Array(b.triangles) });
  }
  if (!list.length) return null;
  const m = mergeMeshes(list); m.err = err; return m;
}
