// WP-16: sarma (4. eksen, eszamanli X/A) simulasyonu icin silindirik (yaricapsal) dexel stok. Saf JS.
// Secim (O onerisi): tri-dexel (setup cercevesinde X/Y/Z isinlari) takim ekseni +Z varsayar; sarmada takim ekseni parcaya gore
// A ile surekli doner. Silindirik izgarada isinlar A ekseninden disari (x_i, theta_j) yonundedir: yaricapsal takimin tabani bu
// isinlari dik keser, taban yaricapi isin boyunca SUREKLI (hucreye yuvarlanmaz) olcülür; aci cozunurlugu res / R.
// Isin = malzeme araliklari (yaricap). Bellek: tek aralikli isin yalniz dis yaricap (top) olarak tutulur; ic bosluk olusursa
// (alt kesme) isin aralik listesine (gaps) gecer.
// Parca cercevesi = setup cercevesi A = 0'da (WCS orijini eksen uzerinde). A kelimesi a'da takim ekseni parcada
// phi = a * isaret (derece -> radyan) yonunde (+Z'den +Y'ye; index.js resolveSetup F = Rx(phi) F0 ile ayni).
// SINIRLAR: takim yalniz Y = 0 (eksen uzerinden) yaricapsal; takim ucu profili konveks (duz/kure/bogaz/koni); sap/tutucu denetimi
// isinin dis noktasiyla (bosluklar dolu sayilir: muhafazakar); model (oyma) denetimi ve baglama govdesi denetimi YOK.
import { subRay, rayOverlap } from './tridexel.js';

const TAU = 2 * Math.PI;
export function createWrapStock(setup, res) {
  const b = setup.stockBox, cyl = setup.stockCyl;
  const R = cyl.R, x0 = b.min[0], nx = Math.max(1, Math.ceil((b.max[0] - x0) / res));
  const nt = Math.max(64, Math.ceil(TAU * R / res)), dt = TAU / nt;
  const top = new Float64Array(nx * nt).fill(R);
  return { x0, res, nx, nt, dt, R, top, gaps: new Map(), removed: 0, sign: setup.wrap?.sign ?? 1 };
}
// (i, j) isini: aralik listesi (kopya degil; gaps yoksa [0, top])
export function wrapRay(W, k) { return W.gaps.get(k) ?? (W.top[k] > 0 ? [0, W.top[k]] : []); }
export const wrapTheta = (W, j) => (j + 0.5) * W.dt;
// isinin acisi j icin: parca acisi theta (radyan, +Z'den +Y'ye)
function sub(W, k, lo, hi) {
  const t = W.top[k]; if (lo >= t) return 0;
  const g = W.gaps.get(k);
  if (!g && hi >= t) { const s1 = Math.max(0, lo); W.top[k] = s1; return (t * t - s1 * s1) / 2; }
  const r = g ?? [0, t];
  const before = r.slice(); const rem = subRay(r, lo, hi); if (!(rem > 0)) return 0;
  let a2 = 0; for (let q = 0; q < before.length; q += 2) { const a = Math.max(before[q], lo), bb = Math.min(before[q + 1], hi); if (bb > a) a2 += (bb * bb - a * a) / 2; }
  if (r.length === 2 && r[0] <= 1e-12) { W.gaps.delete(k); W.top[k] = r[1]; } else { W.gaps.set(k, r); W.top[k] = r.length ? r[r.length - 1] : 0; }
  return a2;
}
// Takim konumu: x (eksenel), rho = uc yaricapi (setup Z), phi (radyan). mode 0 hizli (denetim), 1 kesme. note(code, depth).
// g = toolGeom(tool). Donus: kaldirilan hacim (mm3).
export function wrapTouch(W, g, x, rho, phi, mode, note, tol = 0.001) {
  const R = g.R, Rmax = Math.max(R, g.shaftR, g.holderR);
  const i0 = Math.max(0, Math.floor((x - Rmax - W.x0) / W.res)), i1 = Math.min(W.nx - 1, Math.floor((x + Rmax - W.x0) / W.res));
  if (i1 < i0) return 0;
  const win = rho > 1e-6 ? Math.atan2(Rmax, rho) : Math.PI / 2;
  const jc = phi / W.dt - 0.5, jn = Math.ceil(win / W.dt) + 1;
  const L = g.fluteLen, B = g.bodyLen; let vol = 0;
  for (let dj = -jn; dj <= jn; dj++) {
    const j = ((Math.round(jc) + dj) % W.nt + W.nt) % W.nt;
    let D = wrapTheta(W, j) - phi; D -= TAU * Math.round(D / TAU);
    const c = Math.cos(D), sn = Math.abs(Math.sin(D)); if (c <= 1e-9) continue;
    const sLo0 = rho / c;
    for (let i = i0; i <= i1; i++) {
      const k = j * W.nx + i, top = W.top[k];
      if (sLo0 >= top - tol) continue; // isin malzemesi takim ucunun altinda
      const dx = W.x0 + (i + 0.5) * W.res - x;
      // sap / tutucu (kesmeyen kisim): isinin dis noktasina kadar dolu sayilir
      const sF = (rho + L) / c;
      if (top > sF + tol) {
        const lf = Math.hypot(dx, sF * sn);
        if (lf <= R) note('flute_exceeded', (top - sF) * c);
        else if (lf <= g.shaftR) note('shaft_collision', (top - sF) * c);
        const sB = (rho + B) / c;
        if (g.holderR > 0 && top > sB + tol && Math.hypot(dx, sB * sn) <= g.holderR) note('holder_collision', (top - sB) * c);
      }
      if (Math.abs(dx) > R) continue;
      const w = Math.sqrt(R * R - dx * dx); const sLat = sn > 1e-12 ? w / sn : Infinity;
      let sHi = Math.min(sLat, sF); if (!(sHi > sLo0)) continue;
      // taban (uc profili): f(s) = s c - rho - profile(l(s)) >= 0 olan ilk s (konveks uc: tek aralik)
      const f = (s) => s * c - rho - g.profile(Math.min(R, Math.hypot(dx, s * sn)));
      let sLo = sLo0;
      if (f(sLo0) < -1e-12) {
        if (f(sHi) < 0) continue;
        let a = sLo0, b = sHi; for (let it = 0; it < 40; it++) { const m = (a + b) / 2; if (f(m) >= 0) b = m; else a = m; } sLo = b;
      }
      if (sLo >= top - tol) continue;
      if (mode === 0) { const o = rayOverlap(wrapRay(W, k), sLo, sHi); if (o > 0.01) note('rapid_in_stock', o); continue; }
      vol += sub(W, k, sLo, sHi) * W.res * W.dt;
    }
  }
  W.removed += vol;
  return vol;
}
// Olcum yardimcisi (testler, arayuz): x'teki isinlarin dis yaricapi dizisi [nt]
export function wrapRadiiAt(W, x) { const i = Math.min(W.nx - 1, Math.max(0, Math.floor((x - W.x0) / W.res))); const out = new Float64Array(W.nt); for (let j = 0; j < W.nt; j++) out[j] = W.top[j * W.nx + i]; return out; }
