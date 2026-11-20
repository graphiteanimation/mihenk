// CAM 2B yol geometrisi (saf JS): YONLU dogru/yay parcalari, kesisim, bolme, alan, nokta-icinde, bolge ofseti.
// Ofset yontemi (kesin, tahminsiz): ham ofset egrisi (her parcanin ofseti + bosluk kosesinde koseyi merkez alan yay),
// tum ham parcalarin karsilikli kesisimlerinde bolunmesi, her parcanin ORIJINAL sinira uzakligiyla suzulmesi
// (uzaklik >= |d| ve dogru tarafta olanlar kalir) ve kalanlarin kapali halkalara zincirlenmesi. Dar bogazda bolgeler
// kendiliginden ayrilir; adalar ayni hesaba girer. Zincir kapanmazsa acik hata (cam.geom.offset_failed).
//
// Parca bicimleri:
//   {k:'L', a:[x,y], b:[x,y]}
//   {k:'A', c:[x,y], r, a0, sw, a:[x,y], b:[x,y]}   a0: baslangic acisi (rad), sw: isaretli tarama (+ = CCW), |sw| < 2*PI
// Ek alanlar (ornegin open:true) parcayla birlikte tasinir (bolmede korunur).
// Halka (loop) = uc uca bagli parca dizisi (son.b == ilk.a). Bolge = {outer: loop (CCW), holes: [loop (CW)]};
// yonlendirme kurali: bolge her zaman gidis yonunun SOLUNDADIR.
import { cerr } from './err.js';

export const TAU = Math.PI * 2;
export const EPS = 1e-9;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const crs = (a, b) => a[0] * b[1] - a[1] * b[0];
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const wrapPos = (x) => { x %= TAU; return x < 0 ? x + TAU : x; };

// ------------------------------------------------------------------ kurucular
const extraOf = (s) => { const o = {}; for (const k of Object.keys(s)) if (!['k', 'a', 'b', 'c', 'r', 'a0', 'sw'].includes(k)) o[k] = s[k]; return o; };
export const line = (a, b, extra) => ({ k: 'L', a: [a[0], a[1]], b: [b[0], b[1]], ...(extra || {}) });
export function arc(c, r, a0, sw, extra, pa, pb) {
  const a = pa ? [pa[0], pa[1]] : [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)];
  const b = pb ? [pb[0], pb[1]] : [c[0] + r * Math.cos(a0 + sw), c[1] + r * Math.sin(a0 + sw)];
  return { k: 'A', c: [c[0], c[1]], r, a0, sw, a, b, ...(extra || {}) };
}
// tam daire: iki yarim yay (yonlu)
export function circle(c, r, ccw = true, a0 = 0, extra) {
  const s = ccw ? Math.PI : -Math.PI;
  return [arc(c, r, a0, s, extra), arc(c, r, a0 + s, s, extra)];
}
// geom2d parcasindan (kanonik: yay CCW) yonlu parcalar. fwd=false ise ters yon.
export function fromGeom2d(seg, fwd = true, extra) {
  const ex = extra || {};
  if (seg.type === 'line') return [fwd ? line(seg.p0, seg.p1, ex) : line(seg.p1, seg.p0, ex)];
  if (seg.type === 'arc' || seg.type === 'circle') {
    const a0 = seg.type === 'arc' ? seg.a0 : 0, sweep = seg.type === 'arc' ? seg.sweep : TAU;
    const parts = sweep > Math.PI + 1e-12 ? [[a0, sweep / 2], [a0 + sweep / 2, sweep / 2]] : [[a0, sweep]];
    const out = parts.map(([s0, sw]) => arc(seg.c, seg.r, s0, sw, ex));
    return fwd ? out : out.reverse().map(reverse);
  }
  throw cerr('cam.geom.unsupported_curve', { type: String(seg.type) });
}

// T-24: cekirdek kesit donguleri (geom2d ogeleri + fwd) zincir toleransiyla (1e-5 x olcek) birlestirilir; ardisik uclar arasinda
// eskiz NODE_TOL'undan (1e-6) buyuk acik kalabilir. closeItemLoop ardisik uclari BIREBIR cakistirir: iki dogru -> orta nokta,
// dogru-yay -> dogrunun ucu yayin ucuna, iki yay -> araya kisa dogru. maxGap'ten buyuk acikliklara dokunulmaz (gercek acik uc
// sessizce kapatilmaz; asagidaki kapilar loop_open ile yakalar).
const itEnd = (g) => (g.fwd === false ? g.p0 : g.p1), itStart = (g) => (g.fwd === false ? g.p1 : g.p0);
const setEnd = (g, p) => { if (g.fwd === false) g.p0 = p; else g.p1 = p; };
const setStart = (g, p) => { if (g.fwd === false) g.p1 = p; else g.p0 = p; };
export const CHAIN_GAP_MAX = 0.02;
export function closeItemLoop(loop, maxGap = CHAIN_GAP_MAX) {
  if (!Array.isArray(loop) || loop.length < 2 || loop.some((g) => g.type === 'circle')) return loop;
  const L = loop.map((g) => ({ ...g, ...(g.p0 ? { p0: g.p0.slice() } : {}), ...(g.p1 ? { p1: g.p1.slice() } : {}) }));
  const out = [];
  for (let i = 0; i < L.length; i++) {
    const g = L[i], h = L[(i + 1) % L.length]; out.push(g);
    const a = itEnd(g), b = itStart(h); const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (!(d > 0) || d > maxGap) continue;
    if (g.type === 'line' && h.type === 'line') { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; setEnd(g, m); setStart(h, m.slice()); }
    else if (g.type === 'line') setEnd(g, b.slice());
    else if (h.type === 'line') setStart(h, a.slice());
    else if (d > 1e-9) out.push({ type: 'line', p0: a.slice(), p1: b.slice(), fwd: true, open: !!(g.open && h.open), edge: null }); // kayan nokta farki icin dogru eklenmez
  }
  // ilk ogenin baslangici son dogru tarafindan degistirilmis olabilir (out[0] === L[0], ayni nesne)
  return out;
}
export const closeSectionLoops = (loops, maxGap) => (loops || []).map((l) => closeItemLoop(l, maxGap));

// ------------------------------------------------------------------ temel sorgular
export function length(s) { return s.k === 'L' ? dist(s.a, s.b) : s.r * Math.abs(s.sw); }
export function pointAt(s, t) {
  if (s.k === 'L') return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
  if (t <= 0) return s.a.slice(); if (t >= 1) return s.b.slice();
  const th = s.a0 + s.sw * t; return [s.c[0] + s.r * Math.cos(th), s.c[1] + s.r * Math.sin(th)];
}
export function tangentAt(s, t) {
  if (s.k === 'L') { const d = sub(s.b, s.a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; }
  const th = s.a0 + s.sw * t, g = Math.sign(s.sw); return [-Math.sin(th) * g, Math.cos(th) * g];
}
export function reverse(s) {
  if (s.k === 'L') return { ...s, a: s.b.slice(), b: s.a.slice() };
  return { ...s, a0: s.a0 + s.sw, sw: -s.sw, a: s.b.slice(), b: s.a.slice() };
}
export const reverseLoop = (loop) => loop.slice().reverse().map(reverse);
// yay uzerindeki acinin baslangictan (gidis yonunde) uzakligi [0, 2PI)
function arcPhi(s, ang) { return wrapPos((ang - s.a0) * Math.sign(s.sw)); }
// p noktasinin parca parametresi (p parca uzerinde varsayilir)
export function paramOf(s, p) {
  if (s.k === 'L') { const d = sub(s.b, s.a), l2 = dot(d, d); return l2 > 0 ? dot(sub(p, s.a), d) / l2 : 0; }
  let ph = arcPhi(s, Math.atan2(p[1] - s.c[1], p[0] - s.c[0]));
  const asw = Math.abs(s.sw); if (ph > asw && ph > (asw + TAU) / 2) ph -= TAU; // baslangictan hemen once
  return ph / asw;
}
export function closest(s, p) { // {d, t, p}
  if (s.k === 'L') {
    const d = sub(s.b, s.a), l2 = dot(d, d); let t = l2 > 0 ? dot(sub(p, s.a), d) / l2 : 0; t = Math.min(1, Math.max(0, t));
    const q = pointAt(s, t); return { d: dist(p, q), t, p: q };
  }
  const dc = dist(p, s.c); const asw = Math.abs(s.sw);
  if (dc > 1e-15) { const ph = arcPhi(s, Math.atan2(p[1] - s.c[1], p[0] - s.c[0])); if (ph <= asw) { const t = ph / asw; return { d: Math.abs(dc - s.r), t, p: pointAt(s, t) }; } }
  const d0 = dist(p, s.a), d1 = dist(p, s.b); return d0 <= d1 ? { d: d0, t: 0, p: s.a.slice() } : { d: d1, t: 1, p: s.b.slice() };
}
export function bbox(s) {
  if (s.k === 'L') return [Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1])];
  let x0 = Math.min(s.a[0], s.b[0]), y0 = Math.min(s.a[1], s.b[1]), x1 = Math.max(s.a[0], s.b[0]), y1 = Math.max(s.a[1], s.b[1]);
  const asw = Math.abs(s.sw);
  for (let q = 0; q < 4; q++) { const ang = (q * Math.PI) / 2; if (arcPhi(s, ang) <= asw) { const x = s.c[0] + s.r * Math.cos(ang), y = s.c[1] + s.r * Math.sin(ang); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  return [x0, y0, x1, y1];
}
export function loopBBox(loops) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const l of loops) for (const s of l) { const q = bbox(s); b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])]; }
  return b;
}
// cizim/ornekleme: kiris hatasi <= tol (ilk nokta dahil, son nokta dahil)
export function sample(s, tol = 1e-3) {
  if (s.k === 'L') return [s.a.slice(), s.b.slice()];
  const step = s.r > tol ? 2 * Math.acos(Math.max(-1, 1 - tol / s.r)) : Math.PI / 2;
  const n = Math.max(2, Math.ceil(Math.abs(s.sw) / Math.max(step, 1e-4)));
  const out = []; for (let i = 0; i <= n; i++) out.push(pointAt(s, i / n)); out[0] = s.a.slice(); out[n] = s.b.slice();
  return out;
}
export function polygon(loop, tol = 1e-3) { const out = []; for (const s of loop) { const p = sample(s, tol); p.pop(); out.push(...p); } return out; }
// yonlu alan (CCW +), yaylar analitik
export function area(loop) {
  let A = 0;
  for (const s of loop) {
    if (s.k === 'L') A += crs(s.a, s.b) / 2;
    else { const t0 = s.a0, t1 = s.a0 + s.sw, r = s.r, c = s.c; A += 0.5 * (r * r * (t1 - t0) + c[0] * r * (Math.sin(t1) - Math.sin(t0)) - c[1] * r * (Math.cos(t1) - Math.cos(t0))); }
  }
  return A;
}
export const loopLength = (loop) => loop.reduce((s, x) => s + length(x), 0);
export function isClosedLoop(loop, tol = 1e-6) {
  if (!loop.length) return false;
  for (let i = 0; i < loop.length; i++) if (dist(loop[i].b, loop[(i + 1) % loop.length].a) > tol) return false;
  return true;
}
// sargi sayisi (cokgenlestirilmis; noktanin sinira uzakligi tol'dan buyuk olmalidir)
export function winding(p, poly) {
  let w = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    if (a[1] <= p[1]) { if (b[1] > p[1] && crs(sub(b, a), sub(p, a)) > 0) w++; }
    else if (b[1] <= p[1] && crs(sub(b, a), sub(p, a)) < 0) w--;
  }
  return w;
}
// sinira (parca listesine) en kisa uzaklik
export function distTo(p, segs) { let m = Infinity; for (const s of segs) { const d = closest(s, p).d; if (d < m) m = d; } return m; }
export function closestOnLoops(p, loops) { let best = null; loops.forEach((l, li) => l.forEach((s, si) => { const c = closest(s, p); if (!best || c.d < best.d) best = { ...c, li, si }; })); return best; }

// ------------------------------------------------------------------ kesisim
// Donus: [{p, t1, t2}] (t: parca parametresi 0..1). Ortusen (eslesen) parcalarda ortusme uclari nokta olarak doner.
export function intersect(s1, s2, tol = 1e-9) {
  if (s1.k === 'L' && s2.k === 'L') return llX(s1, s2, tol);
  if (s1.k === 'L') return laX(s1, s2, tol);
  if (s2.k === 'L') return laX(s2, s1, tol).map((h) => ({ p: h.p, t1: h.t2, t2: h.t1 }));
  return aaX(s1, s2, tol);
}
function onArc(s, p, tol) { // p yay cemberinde; yay araliginda mi (uclarda tol)
  const ph = arcPhi(s, Math.atan2(p[1] - s.c[1], p[0] - s.c[0])); const asw = Math.abs(s.sw); const et = tol / Math.max(s.r, 1e-12);
  if (ph <= asw + et) return Math.min(ph, asw) / asw;
  if (ph >= TAU - et) return 0;
  return null;
}
function llX(s1, s2, tol) {
  const d1 = sub(s1.b, s1.a), d2 = sub(s2.b, s2.a), l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
  if (l1 < EPS || l2 < EPS) return [];
  const den = crs(d1, d2), w = sub(s2.a, s1.a);
  if (Math.abs(den) <= 1e-12 * l1 * l2) { // paralel
    if (Math.abs(crs(w, d1)) / l1 > tol) return [];
    const out = []; const pr = (p, s, d, l) => dot(sub(p, s.a), d) / (l * l);
    for (const p of [s2.a, s2.b]) { const t = pr(p, s1, d1, l1); if (t > -tol / l1 && t < 1 + tol / l1) out.push({ p: p.slice(), t1: Math.min(1, Math.max(0, t)), t2: p === s2.a ? 0 : 1 }); }
    for (const p of [s1.a, s1.b]) { const t = pr(p, s2, d2, l2); if (t > -tol / l2 && t < 1 + tol / l2) out.push({ p: p.slice(), t1: p === s1.a ? 0 : 1, t2: Math.min(1, Math.max(0, t)) }); }
    return dedupe(out, tol);
  }
  const t1 = crs(w, d2) / den, t2 = crs(w, d1) / den, e1 = tol / l1, e2 = tol / l2;
  if (t1 < -e1 || t1 > 1 + e1 || t2 < -e2 || t2 > 1 + e2) return [];
  const u = Math.min(1, Math.max(0, t1)), v = Math.min(1, Math.max(0, t2));
  return [{ p: pointAt(s1, u), t1: u, t2: v }];
}
function laX(l, a, tol) {
  const d = sub(l.b, l.a), L = Math.hypot(...d); if (L < EPS) return [];
  const n = [-d[1] / L, d[0] / L]; const h = dot(sub(a.c, l.a), n); const ah = Math.abs(h);
  if (ah > a.r + tol) return [];
  const foot = dot(sub(a.c, l.a), d) / (L * L);
  const ts = ah >= a.r - tol * 1e-3 ? [foot] : (() => { const hh = Math.sqrt(Math.max(0, a.r * a.r - h * h)) / L; return [foot - hh, foot + hh]; })();
  const out = [];
  for (const t of ts) {
    if (t < -tol / L || t > 1 + tol / L) continue; const tt = Math.min(1, Math.max(0, t)); const p = pointAt(l, tt);
    const ta = onArc(a, p, tol); if (ta === null) continue; out.push({ p, t1: tt, t2: ta });
  }
  return dedupe(out, tol);
}
function aaX(a, b, tol) {
  const d = dist(a.c, b.c);
  if (d < tol && Math.abs(a.r - b.r) < tol) { // ayni cember: ortusme uclari
    const out = [];
    for (const p of [b.a, b.b]) { const t = onArc(a, p, tol); if (t !== null) out.push({ p: p.slice(), t1: t, t2: p === b.a ? 0 : 1 }); }
    for (const p of [a.a, a.b]) { const t = onArc(b, p, tol); if (t !== null) out.push({ p: p.slice(), t1: p === a.a ? 0 : 1, t2: t }); }
    return dedupe(out, tol);
  }
  if (d < EPS) return [];
  if (d > a.r + b.r + tol || d < Math.abs(a.r - b.r) - tol) return [];
  const ex = mul(sub(b.c, a.c), 1 / d), ey = [-ex[1], ex[0]];
  const x = (d * d + a.r * a.r - b.r * b.r) / (2 * d); const y2 = a.r * a.r - x * x;
  const ys = y2 <= (tol * 1e-3) ** 2 ? [0] : [Math.sqrt(y2), -Math.sqrt(y2)];
  const out = [];
  for (const y of ys) { const p = add(add(a.c, mul(ex, x)), mul(ey, y)); const t1 = onArc(a, p, tol), t2 = onArc(b, p, tol); if (t1 === null || t2 === null) continue; out.push({ p, t1, t2 }); }
  return dedupe(out, tol);
}
function dedupe(hs, tol) { const out = []; for (const h of hs) if (!out.some((o) => dist(o.p, h.p) <= Math.max(tol, 1e-12))) out.push(h); return out; }

// V-17: kapali dongu kendini kesiyor mu (komsu olmayan parcalar arasinda kesisim; x-supurmeli aday eleme)
export function selfIntersects(loop, tol = 1e-7) {
  const n = loop.length; if (n < 3) return false;
  const bb = loop.map(bbox); const order = [...loop.keys()].sort((i, j) => bb[i][0] - bb[j][0]);
  for (let a = 0; a < n; a++) {
    const i = order[a];
    for (let b = a + 1; b < n; b++) {
      const j = order[b]; if (bb[j][0] > bb[i][2] + tol) break;
      if (bb[j][1] > bb[i][3] + tol || bb[i][1] > bb[j][3] + tol) continue;
      const adj = (j === (i + 1) % n) || (i === (j + 1) % n);
      for (const h of intersect(loop[i], loop[j], tol)) {
        if (adj) { // komsu: yalniz ortak uc disindaki kesisim (geri donus/ortusme) sayilir
          const shared = j === (i + 1) % n ? loop[i].b : loop[j].b;
          if (dist(h.p, shared) <= Math.max(tol * 10, 1e-6)) continue;
        }
        return true;
      }
    }
  }
  return false;
}
// parcayi verilen noktalarda bol (noktalar parca uzerinde). Uclari tam verilen noktalar olur.
export function splitAt(s, pts, tol = 1e-9) {
  const L = length(s); if (!pts.length || L < EPS) return [s];
  const list = pts.map((p) => ({ p, t: paramOf(s, p) })).filter((q) => q.t * L > tol && (1 - q.t) * L > tol).sort((x, y) => x.t - y.t);
  const uniq = []; for (const q of list) if (!uniq.length || dist(uniq[uniq.length - 1].p, q.p) > tol) uniq.push(q);
  if (!uniq.length) return [s];
  const ex = extraOf(s); const out = []; let prev = { p: s.a, t: 0 };
  for (const q of [...uniq, { p: s.b, t: 1 }]) { out.push(piece(s, prev, q, ex)); prev = q; }
  return out;
}
function piece(s, from, to, ex) {
  if (s.k === 'L') return line(from.p, to.p, ex);
  const a0 = Math.atan2(from.p[1] - s.c[1], from.p[0] - s.c[0]);
  return arc(s.c, s.r, a0, s.sw * (to.t - from.t), ex, from.p, to.p);
}

// ------------------------------------------------------------------ ofset
// Parcanin gidis yonunun SOLUNA d kadar ofseti (d<0: saga). Yay yok olursa null.
export function offsetSeg(s, d) {
  if (s.k === 'L') { const t = tangentAt(s, 0); const n = [-t[1] * d, t[0] * d]; return line(add(s.a, n), add(s.b, n), extraOf(s)); }
  const r2 = s.sw > 0 ? s.r - d : s.r + d;
  if (Math.abs(r2) < 1e-9) return null;
  if (r2 > 0) return arc(s.c, r2, s.a0, s.sw, extraOf(s));
  return arc(s.c, -r2, s.a0 + Math.PI, s.sw, extraOf(s));
}
// Kapali halkanin ham ofseti (sol d). Bosluk koselerinde koseyi merkez alan |d| yaricapli yay.
function rawOffsetLoop(loop, d, src) {
  const out = []; const n = loop.length; const offs = loop.map((s) => offsetSeg(s, d));
  for (let i = 0; i < n; i++) {
    if (offs[i]) out.push({ ...offs[i], _src: src });
    const s = loop[i], nx = loop[(i + 1) % n]; const V = s.b;
    const t0 = tangentAt(s, 1), t1 = tangentAt(nx, 0); const cr = crs(t0, t1), dt = dot(t0, t1);
    const n0 = [-t0[1], t0[0]], n1 = [-t1[1], t1[0]];
    const E = add(V, mul(n0, d)), S = add(V, mul(n1, d));
    if (dist(E, S) < 1e-12) continue;
    const cusp = Math.abs(cr) < 1e-12 && dt < 0;
    const gap = cusp || (d > 0 ? cr < 0 : cr > 0);
    if (!gap) continue;
    let sw = Math.atan2(crs(sub(E, V), sub(S, V)), dot(sub(E, V), sub(S, V)));
    if (cusp) sw = d > 0 ? -Math.PI : Math.PI;
    const a0 = Math.atan2(E[1] - V[1], E[0] - V[0]);
    out.push({ ...arc(V, Math.abs(d), a0, sw, {}, E, S), _src: src, _join: true });
  }
  return out;
}
// Acik zincirin ham ofseti (sol d): uclarda yarim daire baslik YOK (yalniz tek tarafli ofset)
function rawOffsetChain(chain, d) {
  const out = []; const n = chain.length; const offs = chain.map((s) => offsetSeg(s, d));
  for (let i = 0; i < n; i++) {
    if (offs[i]) out.push(offs[i]);
    if (i === n - 1) break;
    const s = chain[i], nx = chain[i + 1]; const V = s.b;
    const t0 = tangentAt(s, 1), t1 = tangentAt(nx, 0); const cr = crs(t0, t1), dt = dot(t0, t1);
    const n0 = [-t0[1], t0[0]], n1 = [-t1[1], t1[0]]; const E = add(V, mul(n0, d)), S = add(V, mul(n1, d));
    if (dist(E, S) < 1e-12) continue;
    const cusp = Math.abs(cr) < 1e-12 && dt < 0; if (!(cusp || (d > 0 ? cr < 0 : cr > 0))) continue;
    let sw = Math.atan2(crs(sub(E, V), sub(S, V)), dot(sub(E, V), sub(S, V))); if (cusp) sw = d > 0 ? -Math.PI : Math.PI;
    out.push(arc(V, Math.abs(d), Math.atan2(E[1] - V[1], E[0] - V[0]), sw, {}, E, S));
  }
  return out;
}
// tum ham parcalari karsilikli kesisimlerinde bol (x ekseninde supurme ile aday eleme)
function splitAll(raw, tol) {
  const n = raw.length; const cuts = raw.map(() => []); const bb = raw.map(bbox);
  const order = [...raw.keys()].sort((i, j) => bb[i][0] - bb[j][0]);
  for (let a = 0; a < n; a++) {
    const i = order[a];
    for (let b = a + 1; b < n; b++) {
      const j = order[b]; if (bb[j][0] > bb[i][2] + tol) break;
      if (bb[j][1] > bb[i][3] + tol || bb[i][1] > bb[j][3] + tol) continue;
      for (const h of intersect(raw[i], raw[j], tol)) { cuts[i].push(h.p); cuts[j].push(h.p); }
    }
  }
  const out = []; raw.forEach((s, i) => { for (const p of splitAt(s, cuts[i], tol)) if (length(p) > tol) out.push(p); });
  return out;
}
// parcalari uc uca kapali halkalara zincirle. Kapanmayan zincir: hata.
function chainLoops(pieces, tol) {
  const used = new Array(pieces.length).fill(false); const loops = [];
  const starts = new Map(); const key = (p) => `${Math.round(p[0] / (tol * 10))},${Math.round(p[1] / (tol * 10))}`;
  const near = (p) => { const out = []; const kx = Math.round(p[0] / (tol * 10)), ky = Math.round(p[1] / (tol * 10)); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const b = starts.get(`${kx + dx},${ky + dy}`); if (b) out.push(...b); } return out; };
  pieces.forEach((s, i) => { const k = key(s.a); if (!starts.has(k)) starts.set(k, []); starts.get(k).push(i); });
  for (let i0 = 0; i0 < pieces.length; i0++) {
    if (used[i0]) continue;
    const loop = [pieces[i0]]; used[i0] = true; let cur = pieces[i0]; let guard = 0;
    while (dist(cur.b, loop[0].a) > tol) {
      if (++guard > pieces.length + 2) throw cerr('cam.geom.offset_failed', { reason: 'loop' });
      const cands = near(cur.b).filter((j) => !used[j] && dist(pieces[j].a, cur.b) <= tol);
      if (!cands.length) throw cerr('cam.geom.offset_failed', { reason: 'open' });
      let pick = cands[0];
      if (cands.length > 1) { // en saga donen (bolgeyi solda tutan halkalar ayrik kalir)
        const tin = tangentAt(cur, 1); let best = Infinity;
        for (const j of cands) { const tj = tangentAt(pieces[j], 0); const ang = Math.atan2(crs(tin, tj), dot(tin, tj)); if (ang < best) { best = ang; pick = j; } }
      }
      used[pick] = true; cur = pieces[pick]; loop.push(cur);
    }
    loops.push(loop);
  }
  return loops;
}
// ardisik es-dogrusal cizgileri ve es-cemberli yaylari birlestir
export function mergeLoop(loop, tol = 1e-9, closed = true) {
  const out = [];
  for (const s of loop) {
    const p = out[out.length - 1];
    if (p && p.k === 'L' && s.k === 'L' && !!p.open === !!s.open) {
      const d1 = sub(p.b, p.a), d2 = sub(s.b, s.a); const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
      if (Math.abs(crs(d1, d2)) <= 1e-10 * l1 * l2 && dot(d1, d2) > 0 && Math.abs(crs(sub(s.b, p.a), d1)) / l1 <= tol) { out[out.length - 1] = line(p.a, s.b, extraOf(p)); continue; }
    }
    if (p && p.k === 'A' && s.k === 'A' && !!p.open === !!s.open && dist(p.c, s.c) <= tol && Math.abs(p.r - s.r) <= tol && Math.sign(p.sw) === Math.sign(s.sw) && Math.abs(p.sw + s.sw) <= Math.PI + 1e-12) {
      out[out.length - 1] = arc(p.c, p.r, p.a0, p.sw + s.sw, extraOf(p), p.a, s.b); continue;
    }
    out.push(s);
  }
  if (closed && out.length > 1) { // dongu kapanisi: son + ilk
    const p = out[out.length - 1], s = out[0];
    if (p.k === 'L' && s.k === 'L' && !!p.open === !!s.open) { const d1 = sub(p.b, p.a), d2 = sub(s.b, s.a); const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2); if (Math.abs(crs(d1, d2)) <= 1e-10 * l1 * l2 && dot(d1, d2) > 0) { out[0] = line(p.a, s.b, extraOf(s)); out.pop(); } }
    else if (p.k === 'A' && s.k === 'A' && !!p.open === !!s.open && dist(p.c, s.c) <= tol && Math.abs(p.r - s.r) <= tol && Math.sign(p.sw) === Math.sign(s.sw) && Math.abs(p.sw + s.sw) <= Math.PI + 1e-12) { out[0] = arc(p.c, p.r, p.a0, p.sw + s.sw, extraOf(s), p.a, s.b); out.pop(); }
  }
  return out;
}
const clean = (s) => { const o = { ...s }; delete o._src; delete o._join; return o; };

// Bolge(ler) normalizasyonu: dis halka CCW, delikler CW
export function normRegion(R) {
  const outer = area(R.outer) < 0 ? reverseLoop(R.outer) : R.outer;
  const holes = (R.holes || []).map((h) => (area(h) > 0 ? reverseLoop(h) : h));
  return { outer, holes };
}
// halkalardan bolgeler: CCW = dis, CW = delik; her delik onu iceren en kucuk dis halkaya
export function regionsFromLoops(loops, tol = 1e-3) {
  const outs = [], holes = [];
  for (const l of loops) { const A = area(l); if (Math.abs(A) < 1e-10) continue; (A > 0 ? outs : holes).push({ l, A, poly: polygon(l, tol) }); }
  const regs = outs.map((o) => ({ outer: o.l, holes: [], _A: o.A, _poly: o.poly }));
  for (const h of holes) {
    const p = probePoint(h.l); let best = null;
    for (const r of regs) if (winding(p, r._poly) !== 0 && (!best || r._A < best._A)) best = r;
    if (best) best.holes.push(h.l); // bir dis halkaya ait olmayan delik (bos alan) atilir
  }
  return regs.map((r) => ({ outer: r.outer, holes: r.holes }));
}
// halkanin uzerinde (sayisal olarak) temsilci nokta: ilk parcanin ortasi
export const probePoint = (loop) => pointAt(loop.reduce((a, s) => (length(s) > length(a) ? s : a), loop[0]), 0.5);

// Nokta bolgede mi (dis icinde, deliklerin disinda). Sinira cok yakin nokta icin sonuc anlamsizdir.
export function inRegion(p, R, tol = 1e-3) {
  const polys = R._polys || (R._polys = [polygon(R.outer, tol), ...R.holes.map((h) => polygon(h, tol))]);
  if (winding(p, polys[0]) === 0) return false;
  for (let i = 1; i < polys.length; i++) if (winding(p, polys[i]) !== 0) return false;
  return true;
}
export const regionSegs = (R) => [...R.outer, ...R.holes.flat()];

// Bolgenin (ya da bolgelerin) ofseti. d > 0: ice (daralt), d < 0: disa (genislet).
// walls: uzaklik olculecek sinir parcalari (varsayilan: bolge sinirinin tamami).
// Donus: bolgeler [{outer, holes}]; bos dizi = ofset bolge yok (takim sigmiyor).
export function offsetRegions(regions, d, opts = {}) {
  const regs = regions.map(normRegion);
  if (Math.abs(d) < 1e-12) return regs;
  const segsAll = regs.flatMap(regionSegs);
  const walls = opts.walls || segsAll;
  const bb = loopBBox(regs.flatMap((r) => [r.outer, ...r.holes]));
  const scale = Math.max(1, Math.abs(bb[0]), Math.abs(bb[1]), Math.abs(bb[2]), Math.abs(bb[3]), Math.abs(d));
  const tol = 1e-9 * scale, ctol = 1e-6 * scale, dtol = 1e-7 * scale;
  const raw = [];
  regs.forEach((r, ri) => { [r.outer, ...r.holes].forEach((l, li) => raw.push(...rawOffsetLoop(l, d, `${ri}.${li}`))); });
  const pieces = splitAll(raw, tol);
  const ptol = Math.min(1e-3, Math.abs(d) / 20);
  const sideRegs = regs.map((r) => ({ ...r }));
  const inside = (p) => sideRegs.some((r) => inRegion(p, r, ptol));
  const ad = Math.abs(d);
  const keep = [];
  for (const s of pieces) {
    let ok = true;
    for (const t of [0.5, 0.2, 0.8]) {
      const p = pointAt(s, t); const dd = distTo(p, walls);
      if (dd < ad - dtol) { ok = false; break; }
      if (t === 0.5 && (d > 0) !== inside(p)) { ok = false; break; }
    }
    if (ok) keep.push(s);
  }
  // ayni yonde cakisan kopyalar tek; ters yonde cakisan cift (sifir genislik) ikisi birden atilir
  const artLen = 2 * Math.sqrt(ad * dtol) + ctol; // yapay (tolerans kaynakli) parca/halka boyu siniri (V-15)
  const pk = pruneDangling(dropDuplicates(keep, ctol), ctol, artLen);
  if (!pk.length) return [];
  const diag = (l) => { const b = loopBBox([l]); return Math.hypot(b[2] - b[0], b[3] - b[1]); };
  const loops = chainLoops(pk, ctol).map((l) => mergeLoop(l.map(clean), tol)).filter((l) => Math.abs(area(l)) > 1e-9 * scale * scale && diag(l) > artLen);
  return regionsFromLoops(loops, ptol);
}
// V-15: neredeyse dogrusal kirikta (orn. 50 mm kenarda 0,001 mm) iki ofset cizgisi cok kucuk acida kesisir; kesisim
// otesindeki kisa uclarin uzakligi d'den yalniz ~1e-8 kisa oldugu icin suzgecten gecer ve zincirde sarkan uc kalir.
// Ucu baska parcaya baglanmayan parcalar yalniz bu yapay uzunlugun altindaysa (maxLen = 2*sqrt(d*dtol)) atilir;
// daha uzun sarkan parca gercek hatadir ve zincirleme acik hata verir (sessiz parca kaybi yok).
function pruneDangling(list, tol, maxLen) {
  let cur = list.slice();
  for (let guard = 0; guard < 50; guard++) {
    const drop = new Set();
    cur.forEach((s, i) => {
      if (length(s) > maxLen) return;
      const hasIn = cur.some((q, j) => j !== i && dist(q.b, s.a) <= tol), hasOut = cur.some((q, j) => j !== i && dist(q.a, s.b) <= tol);
      if (!hasIn || !hasOut) drop.add(i);
    });
    if (!drop.size) return cur;
    cur = cur.filter((s, i) => !drop.has(i));
  }
  return cur;
}
function dropDuplicates(list, tol) {
  const out = []; const dead = new Set();
  for (let i = 0; i < list.length; i++) {
    if (dead.has(i)) continue; const s = list[i]; const m = pointAt(s, 0.5); let drop = false;
    for (let j = i + 1; j < list.length; j++) {
      if (dead.has(j)) continue; const q = list[j]; if (q.k !== s.k) continue;
      if (dist(pointAt(q, 0.5), m) > tol) continue;
      if (dist(q.a, s.a) <= tol && dist(q.b, s.b) <= tol) { dead.add(j); continue; }
      if (dist(q.a, s.b) <= tol && dist(q.b, s.a) <= tol) { dead.add(j); drop = true; break; }
    }
    if (!drop) out.push(s);
  }
  return out;
}
// Acik zincirin tek tarafli ofseti (sol d>0 / sag d<0): uzaklik suzgecli. Tek parcali zincir doner ya da hata.
export function offsetChainOpen(chain, d) {
  const bb = loopBBox([chain]); const scale = Math.max(1, ...bb.map(Math.abs), Math.abs(d));
  const tol = 1e-9 * scale, ctol = 1e-6 * scale, dtol = 1e-7 * scale;
  const pieces = splitAll(rawOffsetChain(chain, d), tol);
  const keep = pieces.filter((s) => [0.5, 0.2, 0.8].every((t) => distTo(pointAt(s, t), chain) >= Math.abs(d) - dtol));
  if (!keep.length) throw cerr('cam.geom.offset_failed', { reason: 'empty' });
  // zincir: baslangici, hicbir parcanin bitisine denk gelmeyen parca
  const used = new Array(keep.length).fill(false); let i0 = keep.findIndex((s) => !keep.some((q) => dist(q.b, s.a) <= ctol));
  if (i0 < 0) throw cerr('cam.geom.offset_failed', { reason: 'closed' });
  const out = [keep[i0]]; used[i0] = true;
  for (;;) { const cur = out[out.length - 1]; const j = keep.findIndex((s, k) => !used[k] && dist(s.a, cur.b) <= ctol); if (j < 0) break; used[j] = true; out.push(keep[j]); }
  if (used.some((u) => !u)) throw cerr('cam.geom.offset_split', {});
  return mergeLoop(out, tol, false);
}

// ------------------------------------------------------------------ halka islemleri
// halkayi p'ye en yakin noktadan baslat (o noktada bolunur)
export function startAt(loop, p) {
  let best = null; loop.forEach((s, i) => { const c = closest(s, p); if (!best || c.d < best.d - 1e-12) best = { ...c, i }; });
  const s = loop[best.i]; const L = length(s);
  if (best.t * L < 1e-9) return [...loop.slice(best.i), ...loop.slice(0, best.i)];
  if ((1 - best.t) * L < 1e-9) return [...loop.slice(best.i + 1), ...loop.slice(0, best.i + 1)];
  const [p1, p2] = splitAt(s, [best.p]);
  return [p2, ...loop.slice(best.i + 1), ...loop.slice(0, best.i), p1];
}
// a-b dogru parcasi halkalarin hicbirini (uclar haric) kesmiyor mu
export function segmentClear(a, b, loops, tol = 1e-7) {
  const L = line(a, b); const len = dist(a, b); if (len < tol) return true;
  for (const l of loops) for (const s of l) for (const h of intersect(L, s, tol)) { if (h.t1 * len > tol && (1 - h.t1) * len > tol) return false; }
  return true;
}
// parca dizisi icin uzunluk boyunca t (0..1) noktasi
export function chainPointAtLen(chain, sLen) {
  let acc = 0;
  for (let i = 0; i < chain.length; i++) { const l = length(chain[i]); if (acc + l >= sLen - 1e-12) return { i, t: l > 0 ? (sLen - acc) / l : 0 }; acc += l; }
  return { i: chain.length - 1, t: 1 };
}
