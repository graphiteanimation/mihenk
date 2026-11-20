// Bagimsiz dogrulama yardimcilari (CAM-VERIFY). Yazarlarin path2d/ir yardimcilari KULLANILMAZ: kendi parca temsili,
// kendi nokta-egri uzakligi, kendi IR yay ornekleyicisi. Yalniz GIRDI uretmek icin geom2d kurucularina (mkLine/mkArc) baglanir.
import * as G from '../../src/shared/geom2d.js';

export const TAU = Math.PI * 2;
let pass = 0, fail = 0; const fails = [];
export const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); if (fails.length <= 60) console.log('  FAIL:', m); } };
export const summary = () => { console.log(`\n${pass} gecti, ${fail} kaldi`); return { pass, fail }; };
export const section = (s) => console.log(s);

// ------------------------------------------------------------------ parca temsili: {k:'L',a,b} | {k:'A',c,r,a0,sw} (sw isaretli)
export const L = (a, b) => ({ k: 'L', a, b });
export const A = (c, r, a0, sw) => ({ k: 'A', c, r, a0, sw });
export const segStart = (s) => (s.k === 'L' ? s.a : [s.c[0] + s.r * Math.cos(s.a0), s.c[1] + s.r * Math.sin(s.a0)]);
export const segEnd = (s) => (s.k === 'L' ? s.b : [s.c[0] + s.r * Math.cos(s.a0 + s.sw), s.c[1] + s.r * Math.sin(s.a0 + s.sw)]);
export const poly = (pts) => pts.map((p, i) => L(p, pts[(i + 1) % pts.length]));
export const circleLoop = (c, r, ccw = true) => [A(c, r, 0, ccw ? Math.PI : -Math.PI), A(c, r, Math.PI, ccw ? Math.PI : -Math.PI)];
export const reverseLoop = (loop) => loop.slice().reverse().map((s) => (s.k === 'L' ? L(s.b, s.a) : A(s.c, s.r, s.a0 + s.sw, -s.sw)));
// dikdortgen, koseleri rc yaricapli (CCW)
export function roundRect(x0, y0, x1, y1, rc) {
  if (!(rc > 0)) return poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const H = Math.PI / 2;
  return [L([x0 + rc, y0], [x1 - rc, y0]), A([x1 - rc, y0 + rc], rc, -H, H), L([x1, y0 + rc], [x1, y1 - rc]), A([x1 - rc, y1 - rc], rc, 0, H),
    L([x1 - rc, y1], [x0 + rc, y1]), A([x0 + rc, y1 - rc], rc, H, H), L([x0, y1 - rc], [x0, y0 + rc]), A([x0 + rc, y0 + rc], rc, Math.PI, H)];
}
export function sampleSeg(s, h = 0.02) {
  if (s.k === 'L') { const n = Math.max(1, Math.ceil(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / h)); const o = []; for (let i = 0; i <= n; i++) o.push([s.a[0] + (s.b[0] - s.a[0]) * i / n, s.a[1] + (s.b[1] - s.a[1]) * i / n]); return o; }
  const n = Math.max(2, Math.ceil(Math.abs(s.sw) * s.r / h)); const o = [];
  for (let i = 0; i <= n; i++) { const a = s.a0 + s.sw * i / n; o.push([s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)]); }
  return o;
}
export const loopPoly = (loop, h = 0.02) => { const o = []; for (const s of loop) { const p = sampleSeg(s, h); p.pop(); o.push(...p); } return o; };
export function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export const loopArea = (loop) => polyArea(loopPoly(loop, 0.05));
function pip(pt, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
// bolge: {outer:loop, holes:[loop]} -> on hesaplanmis cokgenler
export function prepRegion(R) { return { R, outer: loopPoly(R.outer, 0.01), holes: R.holes.map((h) => loopPoly(h, 0.01)), segs: [...R.outer, ...R.holes.flat()] }; }
export const inRegion = (p, PR) => pip(p, PR.outer) && !PR.holes.some((h) => pip(p, h));
// nokta-parca uzakligi (kendi)
export function distSeg(p, s) {
  if (s.k === 'L') {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - s.a[0] - t * dx, p[1] - s.a[1] - t * dy);
  }
  const ang = Math.atan2(p[1] - s.c[1], p[0] - s.c[0]);
  let d = s.sw > 0 ? ang - s.a0 : s.a0 - ang; d = ((d % TAU) + TAU) % TAU;
  if (d <= Math.abs(s.sw) + 1e-12) return Math.abs(Math.hypot(p[0] - s.c[0], p[1] - s.c[1]) - s.r);
  const e0 = segStart(s), e1 = segEnd(s); return Math.min(Math.hypot(p[0] - e0[0], p[1] - e0[1]), Math.hypot(p[0] - e1[0], p[1] - e1[1]));
}
// en yakin sinir noktasi (yaklasik: parca uzerinde)
export function nearestOn(p, segs) {
  let best = null;
  for (const s of segs) {
    let q;
    if (s.k === 'L') { const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L2 = dx * dx + dy * dy; let t = L2 > 0 ? ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); q = [s.a[0] + t * dx, s.a[1] + t * dy]; }
    else {
      const ang = Math.atan2(p[1] - s.c[1], p[0] - s.c[0]); let d = s.sw > 0 ? ang - s.a0 : s.a0 - ang; d = ((d % TAU) + TAU) % TAU;
      if (d <= Math.abs(s.sw)) q = [s.c[0] + s.r * Math.cos(ang), s.c[1] + s.r * Math.sin(ang)];
      else { const e0 = segStart(s), e1 = segEnd(s); q = Math.hypot(p[0] - e0[0], p[1] - e0[1]) < Math.hypot(p[0] - e1[0], p[1] - e1[1]) ? e0 : e1; }
    }
    const dd = Math.hypot(p[0] - q[0], p[1] - q[1]); if (!best || dd < best.d) best = { d: dd, q };
  }
  return best;
}
// Duvar yonu olcutu (V-29, WP-21): takim merkezi p, hareket teget birim vektoru t, hedef uzaklik rr (r+pay).
// Donus: null (duvar ornegi degil ya da belirsiz), aksi halde { cr, w } (cr = t x w; climb: cr<0, conv: cr>0 beklenir).
// Belirsiz: p rr uzakliginda IKI AYRI temas noktasina degiyorsa (ofset bolgesinin sivri ucu / kistirilmis gecit). Orada
// hareketin baslangic tegeti onceki duvardan ayrilir; yon tek duvara gore tanimsizdir (annulus#16: hilal ucu).
// Duvar izleme: hareket temas noktasinda duvara teget olmali (|t x w| >= minT*|w|). Duvardan ayrilan/yaklasan hareketin tek temas
// ornegi (ada kosesinden cikan baglanti, sqisland#18) yon olcusu degildir. Gercek duvar izleme tam tegettir (cizgi: dik, kose: yuvarlanma).
export function wallDir(p, t, segs, rr, eps = 1e-3, minT = 0.9) {
  const hits = [];
  for (const s of segs) { if (Math.abs(distSeg(p, s) - rr) < eps) { const q = nearestOn(p, [s]).q; if (!hits.some((h) => Math.hypot(h[0] - q[0], h[1] - q[1]) < 1e-3)) hits.push(q); } }
  if (hits.length !== 1) return null;
  const q = hits[0], w = [q[0] - p[0], q[1] - p[1]], cr = t[0] * w[1] - t[1] * w[0];
  return Math.abs(cr) >= minT * Math.hypot(...w) ? { cr, w } : null;
}
// hizli uzaklik dizini (izgara)
export class Grid {
  constructor(segs, cell) { this.c = cell; this.m = new Map(); this.segs = segs; segs.forEach((s, i) => { const pts = sampleSeg(s, cell / 2); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) { const k = gx + ',' + gy; if (!this.m.has(k)) this.m.set(k, []); this.m.get(k).push(i); } }); }
  // rmax icinde en kisa uzaklik (yoksa Infinity)
  near(p, rmax) { let b = Infinity; const c = this.c; for (let gx = Math.floor((p[0] - rmax) / c); gx <= Math.floor((p[0] + rmax) / c); gx++) for (let gy = Math.floor((p[1] - rmax) / c); gy <= Math.floor((p[1] + rmax) / c); gy++) for (const i of this.m.get(gx + ',' + gy) || []) { const d = distSeg(p, this.segs[i]); if (d < b) b = d; } return b; }
}
// nokta bulutu dizini
export class PGrid {
  constructor(pts, cell) { this.c = cell; this.m = new Map(); for (const p of pts) { const k = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell); if (!this.m.has(k)) this.m.set(k, []); this.m.get(k).push(p); } }
  near(p, rmax) { let b = Infinity; const c = this.c; for (let gx = Math.floor((p[0] - rmax) / c); gx <= Math.floor((p[0] + rmax) / c); gx++) for (let gy = Math.floor((p[1] - rmax) / c); gy <= Math.floor((p[1] + rmax) / c); gy++) for (const q of this.m.get(gx + ',' + gy) || []) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < b) b = d; } return b; }
}

// ------------------------------------------------------------------ girdi: kendi dongu -> cekirdek ogeleri (geom2d + fwd)
export function toKernel(loop, open = []) {
  return loop.map((s, i) => {
    const o = open.includes(i);
    if (s.k === 'L') return { ...G.mkLine(s.a, s.b), fwd: true, open: o };
    return s.sw > 0 ? { ...G.mkArc(s.c, s.r, s.a0, s.sw), fwd: true, open: o } : { ...G.mkArc(s.c, s.r, s.a0 + s.sw, -s.sw), fwd: false, open: o };
  });
}
export const face = (R, z = -10, extra = {}) => ({ z, normalOk: true, outer: toKernel(R.outer), inners: R.holes.map((h) => toKernel(h)), open: false, above: null, ...extra });

// ------------------------------------------------------------------ IR ornekleyici (kendi)
// arc: merkez = baslangic + (i,j); dir cw/ccw; tarama (0, 2pi]
export function arcSweepOwn(from, m) {
  const cx = from.x + m.i, cy = from.y + m.j; const a0 = Math.atan2(from.y - cy, from.x - cx), a1 = Math.atan2(m.y - cy, m.x - cx);
  let d = m.dir === 'ccw' ? a1 - a0 : a0 - a1; d = ((d % TAU) + TAU) % TAU; if (d < 1e-12) d = TAU;
  return { cx, cy, r: Math.hypot(m.i, m.j), a0, sw: m.dir === 'ccw' ? d : -d };
}
// her hareket icin ornekler: cb({x,y,z, t:yon vektoru [tx,ty], m, k, from})
export function walkSamples(tp, cb, h = 0.05) {
  let pos = null;
  tp.moves.forEach((m, k) => {
    if (m.t === 'rapid' || m.t === 'feed') {
      if (pos) { const dx = m.x - pos.x, dy = m.y - pos.y, dz = m.z - pos.z; const len = Math.hypot(dx, dy, dz); const n = Math.max(1, Math.ceil(len / h)); const Lxy = Math.hypot(dx, dy); const t = Lxy > 1e-12 ? [dx / Lxy, dy / Lxy] : null; for (let i = 0; i <= n; i++) cb({ x: pos.x + dx * i / n, y: pos.y + dy * i / n, z: pos.z + dz * i / n, t, m, k, from: pos }); }
      pos = { x: m.x, y: m.y, z: m.z };
    } else if (m.t === 'arc') {
      const A_ = arcSweepOwn(pos, m); const n = Math.max(2, Math.ceil(Math.abs(A_.sw) * A_.r / h));
      for (let i = 0; i <= n; i++) { const a = A_.a0 + A_.sw * i / n; const sg = A_.sw > 0 ? 1 : -1; cb({ x: A_.cx + A_.r * Math.cos(a), y: A_.cy + A_.r * Math.sin(a), z: pos.z + (m.z - pos.z) * i / n, t: [-Math.sin(a) * sg, Math.cos(a) * sg], m, k, from: pos }); }
      pos = { x: m.x, y: m.y, z: m.z };
    } else if (m.t === 'cycle') { const p = m.points[m.points.length - 1]; pos = { x: p[0], y: p[1], z: m.clearance }; }
  });
}
// hizli hareket kurali: yatay bileseni olan hizli her iki ucunda stok ustunun uzerinde; hicbir hizli stok ustunun altina inmez
export function rapidViolations(tp, stockTop) {
  let bad = []; let pos = null;
  tp.moves.forEach((m, k) => {
    if (m.t === 'rapid') { if (m.z < stockTop + 1e-9) bad.push({ k, why: 'z<stockTop', z: m.z }); if (pos && Math.hypot(m.x - pos.x, m.y - pos.y) > 1e-9 && pos.z < stockTop + 1e-9) bad.push({ k, why: 'horiz-from-low', z: pos.z }); }
    if (m.t === 'rapid' || m.t === 'feed' || m.t === 'arc') pos = { x: m.x, y: m.y, z: m.z }; else if (m.t === 'cycle') { const p = m.points[m.points.length - 1]; pos = { x: p[0], y: p[1], z: m.clearance }; }
  });
  return bad;
}
// basit tekrarlanabilir rastgele
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
