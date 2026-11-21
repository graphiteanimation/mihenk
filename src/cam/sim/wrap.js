// WP-16: sarma (4. eksen, eszamanli X/A) simulasyonu icin silindirik (yaricapsal) dexel stok. Saf JS.
// Secim (O onerisi): tri-dexel (setup cercevesinde X/Y/Z isinlari) takim ekseni +Z varsayar; sarmada takim ekseni parcaya gore
// A ile surekli doner. Silindirik izgarada isinlar A ekseninden disari (x_i, theta_j) yonundedir: yaricapsal takimin tabani bu
// isinlari dik keser, taban yaricapi isin boyunca SUREKLI (hucreye yuvarlanmaz) olcülür; aci cozunurlugu res / R.
// Isin = malzeme araliklari (yaricap). Bellek: tek aralikli isin yalniz dis yaricap (top) olarak tutulur; ic bosluk olusursa
// (alt kesme) isin aralik listesine (gaps) gecer.
// Parca cercevesi = setup cercevesi A = 0'da (WCS orijini eksen uzerinde). A kelimesi a'da takim ekseni parcada
// phi = a * isaret (derece -> radyan) yonunde (+Z'den +Y'ye; index.js resolveSetup F = Rx(phi) F0 ile ayni).
// SINIRLAR: takim yalniz Y = 0 (eksen uzerinden) yaricapsal; takim ucu profili konveks (duz/kure/bogaz/koni); sap/tutucu denetimi
// isinin dis noktasiyla (bosluklar dolu sayilir: muhafazakar).
// WP-22b: modele oyma denetimi W.model (model3d.js meshRadialRays: ayni silindirik izgarada model yaricap araliklari) varsa;
// baglama govdesi denetimi wrapFixtureHit (takim zarfi yuzey noktalari parca cercevesinde govdelere karsi).
import { subRay, rayOverlap } from './tridexel.js';
import { overlapIv } from './model3d.js';

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
// ext (WP-22b): { gtol } modele oyma toleransi (W.model varsa).
export function wrapTouch(W, g, x, rho, phi, mode, note, tol = 0.001, ext = null) {
  const MR = W.model ? W.model.rays : null, gtol = ext?.gtol ?? 0.01;
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
      const k = j * W.nx + i, top = W.top[k], mr = MR ? MR[k] : null, eTop = mr && mr.length ? Math.max(top, mr[mr.length - 1]) : top;
      if (sLo0 >= eTop - tol) continue; // isin malzemesi (stok ve model) takim ucunun altinda
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
      if (mr && mr.length) { // WP-22b: kesici [sLo, min(sLat, flut ustu)] ile model araliklari (stok kalkmis olsa da). Derinlik: takim
        // ekseni boyunca ortusme ya da yanal sinira degiyorsa yanal giris (R - giris noktasinin eksenden uzakligi); kucuk olani.
        // Kesmede oyma, hizlida modele giris = carpma (rapid_in_stock, engel).
        const o = overlapIv(mr, sLo, sHi);
        if (o) { let dep = (o.b - o.a) * c; if (o.b >= sLat - 1e-9) dep = Math.min(dep, R - Math.hypot(dx, o.a * sn)); if (dep > gtol) note(mode === 1 ? 'gouge' : 'rapid_in_stock', dep); }
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

// WP-22b: sarma setup'inda baglama govdeleri (fixtures.js fixtureGrid: katilar setup cercevesinde A = 0; parca ile doner).
// Takim zarfi yuzeyi (kesici [uc..flut] R, sap [flut..govde] shaftR, tutucu profili; uc diski) en cok h araliklarla noktalanir,
// noktalar parca cercevesine cevrilip katiya giris derinligi olculur (kutu/silindir: en yakin yuzeye uzaklik; ag: Z dexel
// araligi). Noktalama araligi kadar zarf BUYUTULUR (muhafazakar: arada kalan temas kacmaz, en cok ~h erken uyari).
// Sinir: zarfin tamamen icinde kalan kucuk govde (yuzeyi kesmeyen) gorulmez.
export function wrapFixtureHit(F, g, x, rho, phi, tol = 0.01, h = null) {
  const sp = h ?? Math.max(F.res, 0.25), infl = sp * 0.75;
  const ca = Math.cos(phi), sa = Math.sin(phi); // takim ekseni a = (0, sa, ca); yanal e1 = X, e2 = (0, ca, -sa)
  const top = rho + g.bodyLen + (g.holderLen || 0), Rm = Math.max(g.R, g.shaftR, g.holderR) + infl;
  // kaba eleme: takim zarfi kutusu (parca cercevesi) ile govdeler kutusu
  const ys = [rho * sa, top * sa], zs = [rho * ca, top * ca];
  if (x + Rm < F.xmin || x - Rm > F.x1 || Math.min(...ys) - Rm > F.y1 || Math.max(...ys) + Rm < F.ymin || Math.min(...zs) - Rm > F.zmax || Math.max(...zs) + Rm < F.zmin) return null;
  const parts = [{ part: 'tool', u0: 0, u1: g.fluteLen, r: (u) => g.R }, { part: 'shaft', u0: g.fluteLen, u1: g.bodyLen, r: () => g.shaftR }];
  if (g.holderSegs && g.holderR > 0) for (const q of g.holderSegs) parts.push({ part: 'holder', u0: g.bodyLen + q.u0, u1: g.bodyLen + q.u1, r: (u) => q.r0 + (q.u1 > q.u0 ? (u - g.bodyLen - q.u0) / (q.u1 - q.u0) : 0) * (q.r1 - q.r0) });
  let best = null;
  const test = (u, r, psi, part) => {
    const lx = r * Math.cos(psi), l2 = r * Math.sin(psi), s = rho + u;
    const p = [x + lx, s * sa + l2 * ca, s * ca - l2 * sa];
    const d = fixDepth(F, p); if (d > tol && (!best || d > best.depth)) best = { depth: d, part, fixture: F.names[fixDepthLast] };
  };
  for (const P of parts) {
    const n = Math.max(1, Math.ceil((P.u1 - P.u0) / sp));
    for (let q = 0; q <= n; q++) {
      const u = P.u0 + (P.u1 - P.u0) * q / n; let r = P.r(u); if (P.part === 'tool') r = Math.max(0, Math.min(g.R, g.rhoEnv(u))); r += infl;
      // kaba eleme (halka): halka merkezi govdeler kutusundan r'den uzaksa atla
      const cs = [x, (rho + u) * sa, (rho + u) * ca];
      if (cs[0] + r < F.xmin || cs[0] - r > F.x1 || cs[1] + r < F.ymin || cs[1] - r > F.y1 || cs[2] + r < F.zmin || cs[2] - r > F.zmax) continue;
      const m = Math.max(8, Math.ceil(2 * Math.PI * r / sp));
      for (let t = 0; t < m; t++) test(u, r, 2 * Math.PI * t / m, P.part);
      if (q === 0 && P.part === 'tool') for (let rr = sp; rr < r; rr += sp) { const mm = Math.max(8, Math.ceil(2 * Math.PI * rr / sp)); for (let t = 0; t < mm; t++) test(u, rr, 2 * Math.PI * t / mm, 'tool'); } // uc diski
    }
  }
  return best;
}
// nokta p'nin govdelere giris derinligi (en buyuk); 0 = disarida. Govde dizini fixDepthLast'ta
function fixDepth(F, p) {
  let best = 0, bn = -1;
  F.solids.forEach((s, n) => {
    let d = -Infinity;
    if (s.kind === 'box') { d = Infinity; for (let k = 0; k < 3; k++) { const w = (p[0] - s.c[0]) * s.u[k][0] + (p[1] - s.c[1]) * s.u[k][1] + (p[2] - s.c[2]) * s.u[k][2]; d = Math.min(d, s.h[k] - Math.abs(w)); } }
    else if (s.kind === 'cyl') {
      const ax = [s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]], L = Math.hypot(...ax), u = ax.map((v) => v / L);
      const w = [p[0] - s.a[0], p[1] - s.a[1], p[2] - s.a[2]], t = w[0] * u[0] + w[1] * u[1] + w[2] * u[2];
      const rr = Math.hypot(w[0] - t * u[0], w[1] - t * u[1], w[2] - t * u[2]); d = Math.min(t, L - t, s.r - rr);
    } else {
      const i = Math.floor((p[0] - F.x0) / F.res), j = Math.floor((p[1] - F.y0) / F.res); if (i < 0 || j < 0 || i >= F.nx || j >= F.ny) return;
      const key = j * F.nx + i; for (let q = F.off[key]; q < F.off[key + 1]; q++) if (F.iv[q * 3 + 2] === n) { const lo = F.iv[q * 3], hi = F.iv[q * 3 + 1]; if (p[2] > lo && p[2] < hi) d = Math.max(d, Math.min(p[2] - lo, hi - p[2])); }
    }
    if (d > best) { best = d; bn = n; }
  });
  fixDepthLast = bn; return best;
}
let fixDepthLast = -1;
