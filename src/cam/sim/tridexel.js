// WP-13: uc yonlu dexel (tri-dexel) stok. X, Y ve Z yonlerinde paralel isin aglari; her isin malzeme ARALIKLARI listesi tutar
// (tek degerli yukseklik haritasinin aksine alt kesme / bosluk ve yan yuzler temsil edilir). Saf JS.
// T = { x0, y0, z0, res, nx, ny, nz, box, zr: Array(nx*ny), xr: Array(ny*nz), yr: Array(nx*nz) }
//   zr[j*nx+i]: (x_i, y_j) hucre merkezinden Z yonunde; xr[k*ny+j]: (y_j, z_k) X yonunde; yr[k*nx+i]: (x_i, z_k) Y yonunde.
//   Isin = duz dizi [a0, b0, a1, b1, ...] (artan, ayrik). Izgara yukseklik haritasiyla ayni (x0, y0, res, nx, ny); z_k = z0 + (k+0.5) res.
// Z isinlari yukseklik haritasiyla AYNI orneklemeyle (hucre merkezi, takim ornegi) kesilir: ust yuzey haritayla birebir (geriye uyum).
// X ve Y isinlari takim orneklerinin ardisik ciftinden kapsul (iki ornek arasi supurulen disk) ile kesilir: yan duvar konumu
// isin yonunde surekli (hucreye yuvarlanmaz; V-24 yanal cozunurluk siniri bu iki yonde kalkar).
// SINIRLAR: takim ekseni +Z (setup cercevesi); egimli hareketlerde kapsul yaricapi iki ucun KUCUGU (ic yaklasim: az kaldirma, fazla
// malzeme = muhafazakar); zincirde kaynak uyeligi uc isinin VEYA'si (muhafazakar).
// WP-22b: model (oyma) denetimi opts.modelMeshes verilince model aginin ayni izgaradaki X/Y/Z araliklarina karsi (model3d.js);
// sap/tutucu yanal carpmasi X/Y isinlarinda bant ortusmesiyle (triBandHit).
import { createHeightmap } from './heightmap.js';

const EPS = 1e-9;
// [lo, hi] araligini isindan cikarir (yerinde); kaldirilan uzunluk
export function subRay(r, lo, hi) {
  if (!r.length || hi <= r[0] || lo >= r[r.length - 1]) return 0;
  let rem = 0; const out = [];
  for (let k = 0; k < r.length; k += 2) {
    const a = r[k], b = r[k + 1];
    if (b <= lo || a >= hi) { out.push(a, b); continue; }
    rem += Math.min(b, hi) - Math.max(a, lo);
    if (a < lo - EPS) out.push(a, lo);
    if (b > hi + EPS) out.push(hi, b);
  }
  if (rem > 0) { r.length = 0; for (const v of out) r.push(v); }
  return rem;
}
// [lo, hi] ile isinin en buyuk ortusmesi
export function rayOverlap(r, lo, hi) {
  let best = 0; if (!r.length || hi <= r[0] || lo >= r[r.length - 1]) return 0;
  for (let k = 0; k < r.length; k += 2) { const o = Math.min(r[k + 1], hi) - Math.max(r[k], lo); if (o > best) best = o; }
  return best;
}
export const rayTop = (r, floor) => (r.length ? r[r.length - 1] : floor);
export function rayContains(r, v, eps = 1e-6) { for (let k = 0; k < r.length; k += 2) if (v >= r[k] - eps && v <= r[k + 1] + eps) return true; return false; }

function grid(hm, zLo, zHi) {
  const nz = Math.max(1, Math.round((zHi - zLo) / hm.res));
  return { x0: hm.x0, y0: hm.y0, z0: zLo, res: hm.res, nx: hm.nx, ny: hm.ny, nz, box: { min: [hm.x0, hm.y0, zLo], max: [hm.x0 + hm.nx * hm.res, hm.y0 + hm.ny * hm.res, zHi] } };
}
// Ham stok: kutu ya da X eksenli silindir (cyl: {yc, zc, R}). hm yalniz izgara olculeri icin (stockHeightmap ile ayni).
export function triFromBox(box, hm, cyl = null) {
  const T = grid(hm, box.min[2], box.max[2]); const { nx, ny, nz, res } = T;
  const xa = box.min[0], xb = box.max[0], ya = box.min[1], yb = box.max[1];
  T.zr = new Array(nx * ny); T.xr = new Array(ny * nz); T.yr = new Array(nx * nz);
  for (let j = 0; j < ny; j++) {
    const y = T.y0 + (j + 0.5) * res;
    for (let i = 0; i < nx; i++) {
      if (!cyl) { T.zr[j * nx + i] = [box.min[2], box.max[2]]; continue; }
      const q = cyl.R * cyl.R - (y - cyl.yc) * (y - cyl.yc); T.zr[j * nx + i] = q > 0 ? [Math.max(box.min[2], cyl.zc - Math.sqrt(q)), Math.min(box.max[2], cyl.zc + Math.sqrt(q))] : [];
    }
  }
  for (let k = 0; k < nz; k++) {
    const z = T.z0 + (k + 0.5) * res;
    for (let j = 0; j < ny; j++) { const y = T.y0 + (j + 0.5) * res; T.xr[k * ny + j] = !cyl || (y - cyl.yc) ** 2 + (z - cyl.zc) ** 2 <= cyl.R * cyl.R ? [xa, xb] : []; }
    let yl = ya, yh = yb; if (cyl) { const q = cyl.R * cyl.R - (z - cyl.zc) ** 2; if (q <= 0) { yl = 0; yh = 0; } else { yl = Math.max(ya, cyl.yc - Math.sqrt(q)); yh = Math.min(yb, cyl.yc + Math.sqrt(q)); } }
    for (let i = 0; i < nx; i++) T.yr[k * nx + i] = yh > yl ? [yl, yh] : [];
  }
  return T;
}
// Dolu hucre izgarasindan (occ(i, j, k) -> bool; voksel = [x0+i res, ..] kupu) isinlar: sinirlar voksel yuzlerinde
function triFromOcc(T, occ) {
  const { nx, ny, nz, res } = T; T.zr = new Array(nx * ny); T.xr = new Array(ny * nz); T.yr = new Array(nx * nz);
  const run = (n, at, base) => { const r = []; let s = -1; for (let q = 0; q <= n; q++) { const f = q < n && at(q); if (f && s < 0) s = q; if (!f && s >= 0) { r.push(base + s * res, base + q * res); s = -1; } } return r; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) T.zr[j * nx + i] = run(nz, (k) => occ(i, j, k), T.z0);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) T.xr[k * ny + j] = run(nx, (i) => occ(i, j, k), T.x0);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) T.yr[k * nx + i] = run(ny, (j) => occ(i, j, k), T.y0);
  return T;
}
// Yukseklik haritasindan (yalniz ustten bilgi: yuzeyin alti dolu)
export function triFromHeightmap(hm, zFloor, zTop) {
  const T = grid(hm, zFloor, zTop); const hmax = zTop;
  T.zr = new Array(hm.nx * hm.ny); const { nx, ny, nz, res } = T;
  for (let k = 0; k < nx * ny; k++) { const h = Math.min(hm.data[k], hmax); T.zr[k] = h > zFloor + EPS ? [zFloor, h] : []; }
  T.xr = new Array(ny * nz); T.yr = new Array(nx * nz);
  const run = (n, at, base) => { const r = []; let s = -1; for (let q = 0; q <= n; q++) { const f = q < n && at(q); if (f && s < 0) s = q; if (!f && s >= 0) { r.push(base + s * res, base + q * res); s = -1; } } return r; };
  for (let k = 0; k < nz; k++) {
    const z = T.z0 + (k + 0.5) * res;
    for (let j = 0; j < ny; j++) T.xr[k * ny + j] = run(nx, (i) => hm.data[j * nx + i] > z, T.x0);
    for (let i = 0; i < nx; i++) T.yr[k * nx + i] = run(ny, (j) => hm.data[j * nx + i] > z, T.y0);
  }
  return T;
}
// Noktanin malzeme icinde olup olmadigi (uc isinin VEYA'si: muhafazakar)
export function triContains(T, q, eps = 1e-6) {
  const cl = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);
  const i = cl(Math.floor((q[0] - T.x0) / T.res), T.nx), j = cl(Math.floor((q[1] - T.y0) / T.res), T.ny), k = cl(Math.floor((q[2] - T.z0) / T.res), T.nz);
  return rayContains(T.zr[j * T.nx + i], q[2], eps) || rayContains(T.xr[k * T.ny + j], q[0], eps) || rayContains(T.yr[k * T.nx + i], q[1], eps);
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const toF = (F, p) => { const d = [p[0] - F.o[0], p[1] - F.o[1], p[2] - F.o[2]]; return [dot(d, F.x), dot(d, F.y), dot(d, F.z)]; };
const fromF = (F, q) => [0, 1, 2].map((k) => F.o[k] + F.x[k] * q[0] + F.y[k] * q[1] + F.z[k] * q[2]);
// T-04 (uc dexel): onceki setup'larin uc dexel stoklari (kendi cercevelerinde) -> yeni setup. Malzeme = bu setup'in ham stogu ∩ her
// kaynak k icin (k'nin kutusu icindeyse k'de malzeme). Voksel merkezi orneklenir; sinirlar voksel yuzlerinde (res'e yuvarlanir).
export function triFromSources(src, target, hm) {
  const tb = target.box; const T = grid(hm, tb.min[2], tb.max[2]); const { nx, ny, nz, res } = T; const eps = 1e-6; const cyl = target.cyl;
  const occ = new Uint8Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = T.x0 + (i + 0.5) * res, y = T.y0 + (j + 0.5) * res, z = T.z0 + (k + 0.5) * res;
    if (cyl && (y - cyl.yc) ** 2 + (z - cyl.zc) ** 2 > cyl.R * cyl.R) continue;
    const P = fromF(target.frame, [x, y, z]); let inside = true;
    for (const s of src) {
      const q = toF(s.frame, P), B = s.box;
      if (q[0] < B.min[0] - eps || q[0] > B.max[0] + eps || q[1] < B.min[1] - eps || q[1] > B.max[1] + eps || q[2] < B.min[2] - eps || q[2] > B.max[2] + eps) continue;
      if (!triContains(s.tri, q, res / 2)) { inside = false; break; }
    }
    if (inside) occ[(k * ny + j) * nx + i] = 1;
  }
  return triFromOcc(T, (i, j, k) => occ[(k * ny + j) * nx + i] === 1);
}
// Z isinlarinin ust degerleri -> yukseklik haritasi (bos = taban)
export function triHeightmap(T, hm = null) {
  const out = hm || createHeightmap([T.x0, T.y0], [T.x0 + T.nx * T.res, T.y0 + T.ny * T.res], T.res, T.z0);
  for (let k = 0; k < T.nx * T.ny; k++) out.data[k] = rayTop(T.zr[k], T.z0);
  return out;
}
// Hacim (mm3) bir isin agindan: 'z' | 'x' | 'y'
export function triVolume(T, axis = 'z') {
  const rays = axis === 'z' ? T.zr : axis === 'x' ? T.xr : T.yr; let s = 0;
  for (const r of rays) for (let k = 0; k < r.length; k += 2) s += r[k + 1] - r[k];
  return s * T.res * T.res;
}

// a x + b in [lo, hi] olan x araligi; null = bos
function linIv(a, b, lo, hi) {
  if (Math.abs(a) < 1e-12) return b >= lo && b <= hi ? [-Infinity, Infinity] : null;
  let x1 = (lo - b) / a, x2 = (hi - b) / a; if (x1 > x2) { const t = x1; x1 = x2; x2 = t; } return [x1, x2];
}
// y = c dogrusunun (x degiskeni) disk (cx, cy, r) ve kapsul (a -> b, r) ile kesisimi
function discChord(cx, cy, r, c) { const d = c - cy; const q = r * r - d * d; if (q <= 0) return null; const w = Math.sqrt(q); return [cx - w, cx + w]; }
function capsuleChord(ax, ay, bx, by, r, c) {
  let lo = Infinity, hi = -Infinity;
  for (const p of [discChord(ax, ay, r, c), discChord(bx, by, r, c)]) if (p) { if (p[0] < lo) lo = p[0]; if (p[1] > hi) hi = p[1]; }
  const L = Math.hypot(bx - ax, by - ay);
  if (L > 1e-12) {
    const dx = (bx - ax) / L, dy = (by - ay) / L;
    const t = linIv(dx, -ax * dx + (c - ay) * dy, 0, L), s = linIv(-dy, ax * dy + (c - ay) * dx, -r, r);
    if (t && s) { const l = Math.max(t[0], s[0]), h = Math.min(t[1], s[1]); if (l < h) { if (l < lo) lo = l; if (h > hi) hi = h; } }
  }
  return lo < hi ? [lo, hi] : null;
}
// p0 -> p1 takim ornek cifti (p0 null: tek disk); rho(u): uctan u yukseklikte yaricap. fn(ray, lo, hi) her X/Y isin parcasina.
function sweepRays(T, rho, p0, p1, zTop, fn, uMin = 0) {
  const { res, nx, ny, nz } = T; const zlo = (p0 ? Math.min(p0.z, p1.z) : p1.z) + uMin;
  const k0 = Math.max(0, Math.ceil((zlo - T.z0) / res - 0.5)), k1 = Math.min(nz - 1, Math.floor((zTop - T.z0) / res - 0.5));
  for (let k = k0; k <= k1; k++) {
    const z = T.z0 + (k + 0.5) * res;
    const r1 = z >= p1.z ? rho(z - p1.z) : 0, r0 = p0 && z >= p0.z ? rho(z - p0.z) : 0;
    if (!(r1 > 0) && !(r0 > 0)) continue;
    const rc = p0 && r0 > 0 && r1 > 0 ? Math.min(r0, r1) : 0, rm = Math.max(r0, r1);
    const xs = p0 ? [p0.x, p1.x] : [p1.x], ys = p0 ? [p0.y, p1.y] : [p1.y];
    // X isinlari: satirlar j
    const ylo = Math.min(...ys) - rm, yhi = Math.max(...ys) + rm;
    for (let j = Math.max(0, Math.ceil((ylo - T.y0) / res - 0.5)); j <= Math.min(ny - 1, Math.floor((yhi - T.y0) / res - 0.5)); j++) {
      const c = T.y0 + (j + 0.5) * res, ray = T.xr[k * ny + j]; if (!ray.length) continue;
      if (r1 > 0) { const p = discChord(p1.x, p1.y, r1, c); if (p) fn(ray, p[0], p[1], 'x', c, z); }
      if (r0 > 0) { const p = discChord(p0.x, p0.y, r0, c); if (p) fn(ray, p[0], p[1], 'x', c, z); }
      if (rc > 0) { const p = capsuleChord(p0.x, p0.y, p1.x, p1.y, rc, c); if (p) fn(ray, p[0], p[1], 'x', c, z); }
    }
    // Y isinlari: sutunlar i (x <-> y)
    const xlo = Math.min(...xs) - rm, xhi = Math.max(...xs) + rm;
    for (let i = Math.max(0, Math.ceil((xlo - T.x0) / res - 0.5)); i <= Math.min(nx - 1, Math.floor((xhi - T.x0) / res - 0.5)); i++) {
      const c = T.x0 + (i + 0.5) * res, ray = T.yr[k * nx + i]; if (!ray.length) continue;
      if (r1 > 0) { const p = discChord(p1.y, p1.x, r1, c); if (p) fn(ray, p[0], p[1], 'y', c, z); }
      if (r0 > 0) { const p = discChord(p0.y, p0.x, r0, c); if (p) fn(ray, p[0], p[1], 'y', c, z); }
      if (rc > 0) { const p = capsuleChord(p0.y, p0.x, p1.y, p1.x, rc, c); if (p) fn(ray, p[0], p[1], 'y', c, z); }
    }
  }
}
// kesme: X/Y isinlarindan takim supurmesini cikarir
export function triCut(T, rho, p0, p1, zTop) { sweepRays(T, rho, p0, p1, zTop, (ray, lo, hi) => { subRay(ray, lo, hi); }); }
// hizli: X/Y isinlarinda takim zarfinin malzemeyle en buyuk yanal ortusmesi (mm)
// WP-22b: genel supurme (fn(ray, lo, hi, eksen 'x'|'y', isin dik koordinati, z)); uMin: uctan bu yuksekligin altindaki katmanlar atlanir
export function triSweep(T, rho, p0, p1, zTop, fn, uMin = 0) { sweepRays(T, rho, p0, p1, zTop, fn, uMin); }
// WP-22b: [u0, u1] bandinda (uctan yukseklik) X/Y isinlarinda en buyuk yanal ortusme; rho(u) bant disinda 0 dondurmeli
export function triBandHit(T, rho, p0, p1, u0, zTop) { let best = 0; sweepRays(T, rho, p0, p1, zTop, (ray, lo, hi) => { const o = rayOverlap(ray, lo, hi); if (o > best) best = o; }, u0); return best; }
export function triHit(T, rho, p0, p1, zTop) { let best = 0; sweepRays(T, rho, p0, p1, zTop, (ray, lo, hi) => { const o = rayOverlap(ray, lo, hi); if (o > best) best = o; }); return best; }
