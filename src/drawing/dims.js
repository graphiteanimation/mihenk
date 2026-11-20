// WP-17: olculendirme. Olcu, bir gorunusteki ilkellere (kenar izdusumu) basvurur; basvuru = {src (model kenar anahtari | null),
// t (ilkel turu), g (olusturuldugu andaki geometri imzasi), pt ('a'|'b'|'m'|'c' | null: nokta secimi), q (secilen noktanin konumu)}.
// Yeniden esleme (model degisince): once kenar anahtari (kalici topolojik ad); yoksa/bulunamazsa geometri imzasi ve YALNIZ tek ve acik
// bir aday varsa. Aksi durumda olcu "kopuk" isaretlenir ve son bilinen degeri tasir (O-042 ilkesi: emin degilsen dokunma).
import { dist, primDist, ends, TAU } from './geom.js';
import { fitDeviations, parseFit } from './iso286.js';

export const DIM_TYPES = ['lin', 'dia', 'rad', 'ang', 'ord'];
const lineLike = (t) => t === 'l';
const circLike = (t) => t === 'c' || t === 'a';
const compat = (a, b) => a === b || (circLike(a) && circLike(b)) || (a === 'p' && b === 'p');

export function sigOf(p) {
  if (p.t === 'l') return { a: p.a.slice(), b: p.b.slice() };
  if (p.t === 'c' || p.t === 'a') return { c: p.c.slice(), r: p.r };
  const n = p.pts.length; return { a: p.pts[0].slice(), b: p.pts[n - 1].slice(), m: p.pts[n >> 1].slice() };
}
export function sigDist(t, g, p) {
  if (!compat(t, p.t)) return Infinity;
  if (lineLike(t)) { const d1 = Math.max(dist(g.a, p.a), dist(g.b, p.b)), d2 = Math.max(dist(g.a, p.b), dist(g.b, p.a)); return Math.min(d1, d2); }
  if (circLike(t)) return dist(g.c, p.c) + Math.abs(g.r - p.r);
  const e = ends(p); return Math.max(Math.min(dist(g.a, e[0]), dist(g.a, e[1])), Math.min(dist(g.b, e[0]), dist(g.b, e[1])));
}
// basvuru olustur (secilen ilkel ve tiklanan nokta)
export function mkRef(p, pt = null, click = null) {
  const r = { src: p.src || null, t: p.t, g: sigOf(p), pt };
  const q = pickPoint(p, pt, click); if (q) r.q = q; return r;
}
// ilkel uzerinde nokta: 'a'/'b' uc (click'e en yakin ucu da secer), 'm' orta, 'c' merkez
export function pickPoint(p, pt, near) {
  if (!pt) return null;
  if (pt === 'c') return circLike(p.t) ? p.c.slice() : null;
  if (pt === 'm') { if (p.t === 'l') return [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2]; if (circLike(p.t)) return p.c.slice(); const n = p.pts.length; return p.pts[n >> 1].slice(); }
  const e = ends(p); if (!e) return null;
  if (near) return dist(e[0], near) <= dist(e[1], near) ? e[0].slice() : e[1].slice();
  return (pt === 'a' ? e[0] : e[1]).slice();
}

// Basvuruyu yeni ilkel listesinde coz. Donus {prim, how:'key'|'sig'} ya da null (kopuk)
export function resolveRef(ref, prims, tol = 0.01) {
  if (!ref || !Array.isArray(prims)) return null;
  const pick = (cands, how) => {
    if (cands.length === 1) return { prim: cands[0], how };
    if (!cands.length) return null;
    const s = cands.map((p) => ({ p, d: sigDist(ref.t, ref.g, p) })).sort((x, y) => x.d - y.d);
    // anahtarla bolunmus parcalar (ayni kenarin gorunur/gizli kisimlari): imzaya en yakini
    if (how === 'key') return { prim: s[0].p, how };
    return s[0].d < 0.5 * s[1].d ? { prim: s[0].p, how } : null;
  };
  if (ref.src) { const k = prims.filter((p) => p.src === ref.src && compat(ref.t, p.t)); const r = pick(k, 'key'); if (r) return r; }
  const near = prims.filter((p) => sigDist(ref.t, ref.g, p) <= tol);
  if (near.length) return pick(near, 'sig');
  // anahtarsiz (siluet vb.) ve yer degistirmis: yalniz tek aday varsa ve ayni turde baska ilkel yoksa kabul edilmez -> kopuk
  return null;
}
export function refPoint(ref, prim) {
  if (!ref.pt) return null;
  if (ref.pt === 'a' || ref.pt === 'b') { const e = ends(prim); if (!e) return null; if (ref.q) return dist(e[0], ref.q) <= dist(e[1], ref.q) ? e[0] : e[1]; return ref.pt === 'a' ? e[0] : e[1]; }
  return pickPoint(prim, ref.pt);
}

// Olcu degerini hesapla: {value (mm ya da derece), pts (gorunus koordinati), ok, how[], lost}
export function evalDim(dim, prims, tol) {
  const R = (dim.refs || []).map((r) => resolveRef(r, prims, tol));
  const lost = R.some((x) => !x);
  const how = R.map((x) => (x ? x.how : null));
  if (lost) {
    // kopuk: olusturuldugu andaki imzadan hayalet geometri (son bilinen konumda kirmizi cizilir; deger tahmin edilmez)
    let geo = null; try { geo = geomOf(dim, (dim.refs || []).map(ghost)); } catch (e) { geo = null; }
    return { lost: true, how, value: dim.last ?? (geo ? geo.value : null), geo };
  }
  const P = R.map((x) => x.prim);
  try {
    const geo = geomOf(dim, P);
    return { lost: false, how, value: geo.value, geo };
  } catch (e) { return { lost: true, how: how.map(() => null), value: dim.last ?? null, geo: null }; }
}
const ghost = (r) => (r.t === 'l' ? { t: 'l', a: r.g.a, b: r.g.b } : r.t === 'c' || r.t === 'a' ? { t: 'c', c: r.g.c, r: r.g.r } : { t: 'p', pts: [r.g.a, r.g.m || r.g.a, r.g.b] });
function geomOf(dim, P) {
  const refs = dim.refs;
  if (dim.type === 'lin' || dim.type === 'ord') {
    const p1 = refPoint(refs[0], P[0]), p2 = refPoint(refs[1], P[1]); if (!p1 || !p2) throw new Error('pt');
    if (dim.type === 'ord') { const ax = dim.axis === 'y' ? 1 : 0; return { p1, p2, value: p2[ax] - p1[ax] }; }
    const dir = dim.dir || 'h';
    const value = dir === 'h' ? Math.abs(p2[0] - p1[0]) : dir === 'v' ? Math.abs(p2[1] - p1[1]) : dist(p1, p2);
    return { p1, p2, value };
  }
  if (dim.type === 'dia' || dim.type === 'rad') {
    const c = P[0]; if (!circLike(c.t)) throw new Error('circ');
    return { c: c.c, r: c.r, value: dim.type === 'dia' ? 2 * c.r : c.r };
  }
  if (dim.type === 'ang') {
    const [A, B] = P; if (A.t !== 'l' || B.t !== 'l') throw new Error('line');
    const X = lineX(A, B); if (!X) throw new Error('parallel');
    const fa = farEnd(A, X), fb = farEnd(B, X); const u = [fa[0] - X[0], fa[1] - X[1]], w = [fb[0] - X[0], fb[1] - X[1]];
    let ang = Math.abs(Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1])); if (dim.sup) ang = Math.PI - ang;
    return { A, B, vertex: X, fa, fb, value: (ang * 180) / Math.PI };
  }
  throw new Error('type');
}
export const farEnd = (L, X) => (dist(L.a, X) >= dist(L.b, X) ? L.a : L.b);
function lineX(A, B) {
  const d1 = [A.b[0] - A.a[0], A.b[1] - A.a[1]], d2 = [B.b[0] - B.a[0], B.b[1] - B.a[1]]; const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((B.a[0] - A.a[0]) * d2[1] - (B.a[1] - A.a[1]) * d2[0]) / den; return [A.a[0] + d1[0] * t, A.a[1] + d1[1] * t];
}

// Tolerans: {k:'none'|'sym'|'dev'|'fit', up, lo, fit} -> {upper, lower} (mm) ya da null
export function tolDev(tol, nominal) {
  if (!tol || !tol.k || tol.k === 'none') return null;
  if (tol.k === 'sym') { const v = Math.abs(+tol.up || 0); return { upper: v, lower: -v }; }
  if (tol.k === 'dev') return { upper: +tol.up || 0, lower: +tol.lo || 0 };
  if (tol.k === 'fit') return fitDeviations(tol.fit, nominal);
  return null;
}
export const fitOk = (code) => !!parseFit(code);

// Sayi bicimi: dec ayirici, en cok prec ondalik, sondaki sifirlar atilir
export function fmtN(v, prec = 2, dec = ',') {
  if (v == null || !Number.isFinite(v)) return '?';
  let s = (Math.round(v * 10 ** prec) / 10 ** prec).toFixed(prec);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return dec === ',' ? s.replace('.', ',') : s;
}
export function fmtDev(v, dec = ',') { if (Math.abs(v) < 1e-9) return '0'; const s = fmtN(Math.abs(v), 4, dec); return (v > 0 ? '+' : '-') + s; }

// Olcu metni parcalari: {main, devs:[ust, alt] | null, sym}
export function dimText(dim, value, { prec = 2, dec = ',' } = {}) {
  const pre = dim.type === 'dia' ? 'Ø' : dim.type === 'rad' ? 'R' : '';
  let main = pre + (dim.type === 'ang' ? fmtN(value, Math.min(prec, 2), dec) + '°' : fmtN(value, prec, dec));
  if (dim.prefix) main = dim.prefix + main; if (dim.suffix) main += dim.suffix;
  const tol = dim.tol; let devs = null;
  if (tol && tol.k === 'sym') main += ' ±' + fmtN(Math.abs(+tol.up || 0), 4, dec);
  else if (tol && tol.k === 'dev') devs = [fmtDev(+tol.up || 0, dec), fmtDev(+tol.lo || 0, dec)];
  else if (tol && tol.k === 'fit') { main += ' ' + String(tol.fit || '').trim(); if (tol.show) { const d = fitDeviations(tol.fit, value); if (d) devs = [fmtDev(d.upper, dec), fmtDev(d.lower, dec)]; } }
  return { main, devs };
}
void TAU;
