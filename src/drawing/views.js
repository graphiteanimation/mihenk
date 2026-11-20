// WP-17: gorunus yonelimleri, izdusum yontemi (birinci/ucuncu aci), turetilmis gorunus tabanlari ve cekirdek istek listesi.
// Model kurali: Z yukari; on gorunus -Y tarafindan bakar (Fusion/ISO ile ayni). Taban = {d (bakana dogru), x (saga), y (yukari) = d x x}.
import * as V from '../shared/vec.js';

export const ORIENT = {
  front: { d: [0, -1, 0], x: [1, 0, 0] },
  back: { d: [0, 1, 0], x: [-1, 0, 0] },
  top: { d: [0, 0, 1], x: [1, 0, 0] },
  bottom: { d: [0, 0, -1], x: [1, 0, 0] },
  right: { d: [1, 0, 0], x: [0, 1, 0] },
  left: { d: [-1, 0, 0], x: [0, -1, 0] },
  iso: { d: [1, -1, 1], x: [1, 1, 0] },
};
export const ORIENT_KEYS = Object.keys(ORIENT);
export const SIDES = ['right', 'left', 'above', 'below'];
export const STD_SCALES = [1 / 50, 1 / 20, 1 / 10, 1 / 5, 1 / 2, 1, 2, 5, 10, 20];

export function mkBasis(d, x) { const dn = V.norm(d); let xx = V.sub(x, V.mul(dn, V.dot(x, dn))); xx = V.norm(xx); return { d: dn, x: xx, y: V.cross(dn, xx) }; }
// Ana gorunusun yanina izdusum: ucuncu acida saga konan gorunus sagdan gorulendir; birinci acida soldan (ISO 128-30 / ISO 5456-2).
export function childBasis(P, side, angle) {
  const neg = (v) => V.mul(v, -1);
  let s = side; if (angle === 'first') s = { right: 'left', left: 'right', above: 'below', below: 'above' }[side];
  if (s === 'right') return { d: P.x, x: neg(P.d), y: P.y };
  if (s === 'left') return { d: neg(P.x), x: P.d, y: P.y };
  if (s === 'above') return { d: P.y, x: P.x, y: neg(P.d) };
  return { d: neg(P.y), x: P.x, y: P.d }; // below: alttan gorulen
}
// Kesit: ana gorunusteki kesme cizgisi (p noktasi, ang derece) ve bakis oku yonu (flip). Bakis yonu ok yonudur; gorunus tabani
// kesme cizgisi yataysa ana gorunusun x'ini, dikeyse y'sini korur.
export function sectionBasis(P, cut) {
  const a = ((cut.ang || 0) * Math.PI) / 180;
  const L = V.norm(V.add(V.mul(P.x, Math.cos(a)), V.mul(P.y, Math.sin(a))));
  let A = V.norm(V.add(V.mul(P.x, Math.sin(a)), V.mul(P.y, -Math.cos(a)))); // ok yonu (bakis): varsayilan cizginin saginda (yatay cizgide asagi)
  if (cut.flip) A = V.mul(A, -1);
  const d = V.mul(A, -1);
  if (Math.abs(V.dot(L, P.y)) > Math.abs(V.dot(L, P.x))) { const y = V.mul(L, Math.sign(V.dot(L, P.y)) || 1); return { d, x: V.cross(y, d), y }; }
  const x = V.mul(L, Math.sign(V.dot(L, P.x)) || 1); return { d, x, y: V.cross(d, x), arrow: A };
}
export const sectionPoint = (P, cut) => V.add(V.mul(P.x, cut.p[0]), V.mul(P.y, cut.p[1]));
export function arrowDir2(cut) { const a = ((cut.ang || 0) * Math.PI) / 180; const s = cut.flip ? -1 : 1; return [Math.sin(a) * s, -Math.cos(a) * s]; }

// Gorunusun 3B tabani (ozyinelemeli; dongu korumali). Ayrintida ana gorunusunki.
export function viewBasis(dr, v, seen = new Set()) {
  if (!v || seen.has(v.id)) return null; seen.add(v.id);
  if (v.kind === 'base') { const o = ORIENT[v.orient] || ORIENT.front; return mkBasis(o.d, o.x); }
  const P = viewBasis(dr, dr.views.find((w) => w.id === v.parent), seen); if (!P) return null;
  if (v.kind === 'proj') return childBasis(P, v.side, dr.sheet.angle);
  if (v.kind === 'sec') return sectionBasis(P, v.cut);
  return P; // det
}
export const parentOf = (dr, v) => (v && v.parent ? dr.views.find((w) => w.id === v.parent) || null : null);
// Gorunusun olcegi (ayrinti kendi olcegini tasir; izdusum ve kesit ana gorunusten alir)
export function viewScale(dr, v, seen = new Set()) {
  if (!v || seen.has(v.id)) return dr.sheet.scale || 1; seen.add(v.id);
  if (v.kind === 'det') return v.scale || 2 * viewScale(dr, parentOf(dr, v), seen);
  if (v.kind === 'base') return v.scale || dr.sheet.scale || 1;
  return viewScale(dr, parentOf(dr, v), seen);
}
// Cekirdek istek listesi (ayrinti gorunusu ana gorunusun sonucunu kullanir)
export function kernelSpecs(dr) {
  const out = [];
  for (const v of dr.views) {
    if (v.kind === 'det') continue;
    const B = viewBasis(dr, v); if (!B) continue;
    const s = { id: v.id, d: B.d, x: B.x };
    if (v.kind === 'sec') { const P = viewBasis(dr, parentOf(dr, v)); if (!P) continue; s.sec = { p: sectionPoint(P, v.cut) }; }
    out.push(s);
  }
  return out;
}
// Sayfa yerlesimi: gorunus koordinati q -> sayfa = o + s*q (ayrinti: o + s*(q - c)). Izdusum gorunusu ana gorunusle hizalidir:
// sag/sol yatay eksende (o.y), ust/alt dusey eksende (o.x) ana gorunusunkini alir.
export function placement(dr, v) {
  const s = viewScale(dr, v);
  if (v.kind === 'det') return { o: v.o, s, c: v.c };
  if (v.kind === 'proj') {
    const P = parentOf(dr, v); const pp = P ? placement(dr, P) : null;
    if (pp) { if (v.side === 'right' || v.side === 'left') return { o: [v.o[0], pp.o[1]], s }; return { o: [pp.o[0], v.o[1]], s }; }
  }
  return { o: v.o, s };
}
export const toSheet = (pl, q) => (pl.c ? [pl.o[0] + pl.s * (q[0] - pl.c[0]), pl.o[1] + pl.s * (q[1] - pl.c[1])] : [pl.o[0] + pl.s * q[0], pl.o[1] + pl.s * q[1]]);
export const fromSheet = (pl, p) => (pl.c ? [(p[0] - pl.o[0]) / pl.s + pl.c[0], (p[1] - pl.o[1]) / pl.s + pl.c[1]] : [(p[0] - pl.o[0]) / pl.s, (p[1] - pl.o[1]) / pl.s]);

// Modelin kutusuna gore standart olcek (ISO 5455): uc gorunus + bosluk sayfanin cerceve icine sigar
export function autoScale(bbox, sheetW, sheetH) {
  if (!bbox) return 1;
  const [lo, hi] = bbox; const w = hi[0] - lo[0], dpt = hi[1] - lo[1], h = hi[2] - lo[2];
  const needW = w + dpt, needH = h + dpt; const availW = (sheetW - 30) * 0.7, availH = (sheetH - 20 - 60) * 0.85;
  const k = Math.min(availW / Math.max(needW, 1e-6), availH / Math.max(needH, 1e-6));
  let best = STD_SCALES[0]; for (const s of STD_SCALES) if (s <= k) best = s; return best;
}
