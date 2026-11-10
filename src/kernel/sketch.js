// Sketch → profil yüzleri. Bölge bulma profiles.js'tedir (findRegions); burada yalnız seçim, girdi doğrulama
// (F-05, F-10, F-04/F-16'nın çekirdek tarafı), OCCT eğrisi kurulumu ve her kenarın kaynak sketch varlığına eşlenmesi.
import * as R from 'replicad';
import { KErr } from '../shared/errors.js';
import { findRegions } from '../shared/profiles.js';
import * as V from '../shared/vec.js';
import { scope, edgeMid, faceValid, SubIndex } from './topo.js';
import * as TP from './topo.js';

export const MIN_EDGE = 1e-4; // mm
export const MAX_COORD = 1e5; // mm
const TAU = Math.PI * 2;
const angN = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Yinelenen (aynı geometri) varlıkları bul
function entGeomKey(sk, e) {
  const P = sk.points; const q = (id) => { const p = P[id]; return p ? `${+p.x.toFixed(9)},${+p.y.toFixed(9)}` : '?'; };
  if (e.type === 'line') { const a = q(e.a), b = q(e.b); return 'L' + (a < b ? a + '|' + b : b + '|' + a); }
  if (e.type === 'circle') return `C${q(e.c)}|${e.r}`;
  if (e.type === 'arc') return `A${q(e.c)}|${q(e.a)}|${q(e.b)}`;
  return null;
}
function dedupe(sk) {
  const seen = new Map(); const ents = []; let dup = 0;
  for (const e of sk.ents || []) {
    if (e.cons || e.type === 'point') { ents.push(e); continue; }
    const k = entGeomKey(sk, e); if (k && seen.has(k)) { dup++; continue; }
    if (k) seen.set(k, e); ents.push(e);
  }
  return { sk: { ...sk, ents }, dup };
}

// Profil segmentinin 2B geometrisi (kesişim denetimi için)
function segGeom(s) {
  if (s.type === 'line') return { t: 'L', p0: s.p0, p1: s.p1, len: d2(s.p0, s.p1) };
  if (s.type === 'circle') return { t: 'C', c: s.c, r: s.r, len: TAU * s.r };
  if (s.type === 'arc' && d2(s.p0, s.p1) < 1e-9 * Math.max(1, s.r)) return { t: 'C', c: s.c, r: s.r, len: TAU * s.r }; // kapalı yay = daire
  if (s.type === 'arc') {
    const a0 = Math.atan2(s.p0[1] - s.c[1], s.p0[0] - s.c[0]), a1 = Math.atan2(s.p1[1] - s.c[1], s.p1[0] - s.c[0]);
    // ccw: p0→p1 saat yönü tersi; değilse p1→p0 saat yönü tersi
    const [from, to] = s.ccw === false ? [a1, a0] : [a0, a1];
    let sw = angN(to - from); if (sw < 1e-12) sw = TAU;
    return { t: 'C', c: s.c, r: s.r, a0: from, sw, p0: s.p0, p1: s.p1, len: s.r * sw };
  }
  return null; // elips/spline: örneklenmiş çoklu çizgi ile ayrıca ele alınır
}
function entGeom(sk, e) {
  const P = sk.points;
  if (e.type === 'line') { const a = P[e.a], b = P[e.b]; if (!a || !b) return null; return { t: 'L', p0: [a.x, a.y], p1: [b.x, b.y], id: e.id }; }
  if (e.type === 'circle') { const c = P[e.c]; if (!c) return null; return { t: 'C', c: [c.x, c.y], r: e.r, id: e.id }; }
  if (e.type === 'arc') {
    const c = P[e.c], a = P[e.a], b = P[e.b]; if (!c || !a || !b) return null;
    const r = Math.hypot(a.x - c.x, a.y - c.y); const a0 = Math.atan2(a.y - c.y, a.x - c.x); let sw = angN(Math.atan2(b.y - c.y, b.x - c.x) - a0); if (sw < 1e-12) sw = TAU;
    return { t: 'C', c: [c.x, c.y], r, a0, sw, p0: [a.x, a.y], p1: [b.x, b.y], id: e.id };
  }
  return null;
}
const onArc = (g, p, eps) => { if (g.sw == null || g.sw >= TAU - 1e-12) return true; const a = angN(Math.atan2(p[1] - g.c[1], p[0] - g.c[0]) - g.a0); return a <= g.sw + eps / Math.max(g.r, 1e-12) || a >= TAU - eps / Math.max(g.r, 1e-12); };
const ends = (g) => (g.t === 'L' ? [g.p0, g.p1] : g.sw != null && g.sw < TAU - 1e-12 ? [g.p0, g.p1] : g.t === 'P' ? [g.pts[0], g.pts[g.pts.length - 1]] : []);
// iki geometrinin kesişim noktaları; 'overlap' = eşdoğrusal/eş daire örtüşme
function intersect(A, B, eps) {
  if (A.t === 'P' || B.t === 'P') {
    const la = A.t === 'P' ? A.pts : null, lb = B.t === 'P' ? B.pts : null; const out = [];
    const segsA = la ? la.slice(1).map((p, i) => ({ t: 'L', p0: la[i], p1: p })) : [A];
    const segsB = lb ? lb.slice(1).map((p, i) => ({ t: 'L', p0: lb[i], p1: p })) : [B];
    for (const a of segsA) for (const b of segsB) { const r = intersect(a, b, eps); if (r === 'overlap') return 'overlap'; out.push(...r); }
    return out;
  }
  if (A.t === 'L' && B.t === 'L') {
    const r = [A.p1[0] - A.p0[0], A.p1[1] - A.p0[1]], s = [B.p1[0] - B.p0[0], B.p1[1] - B.p0[1]]; const den = r[0] * s[1] - r[1] * s[0];
    const qp = [B.p0[0] - A.p0[0], B.p0[1] - A.p0[1]]; const la = Math.hypot(...r), lb = Math.hypot(...s);
    if (Math.abs(den) < 1e-12 * la * lb) {
      // paralel: eşdoğrusal mı?
      const dist = Math.abs(qp[0] * r[1] - qp[1] * r[0]) / la; if (dist > eps) return [];
      const t0 = (qp[0] * r[0] + qp[1] * r[1]) / (la * la), t1 = t0 + (s[0] * r[0] + s[1] * r[1]) / (la * la);
      const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
      if ((hi - lo) * la > eps) return 'overlap';
      if (hi - lo > -eps / la) { const t = (lo + hi) / 2; return [[A.p0[0] + r[0] * t, A.p0[1] + r[1] * t]]; }
      return [];
    }
    const t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
    if (t < -eps / la || t > 1 + eps / la || u < -eps / lb || u > 1 + eps / lb) return [];
    return [[A.p0[0] + r[0] * t, A.p0[1] + r[1] * t]];
  }
  if (A.t === 'C' && B.t === 'L') return intersect(B, A, eps);
  if (A.t === 'L' && B.t === 'C') {
    const d = [A.p1[0] - A.p0[0], A.p1[1] - A.p0[1]]; const f = [A.p0[0] - B.c[0], A.p0[1] - B.c[1]]; const L = Math.hypot(...d);
    const a = d[0] * d[0] + d[1] * d[1], b = 2 * (f[0] * d[0] + f[1] * d[1]), c = f[0] * f[0] + f[1] * f[1] - B.r * B.r;
    // doğrunun merkeze uzaklığı ile teğetlik toleransı
    const tc = -b / (2 * a); const pc = [A.p0[0] + d[0] * tc, A.p0[1] + d[1] * tc]; const h = d2(pc, B.c);
    let ts = [];
    if (Math.abs(h - B.r) <= eps) ts = [tc];
    else if (h < B.r) { const disc = Math.sqrt(Math.max(0, b * b - 4 * a * c)); ts = [(-b - disc) / (2 * a), (-b + disc) / (2 * a)]; }
    return ts.filter((t) => t >= -eps / L && t <= 1 + eps / L).map((t) => [A.p0[0] + d[0] * t, A.p0[1] + d[1] * t]).filter((p) => onArc(B, p, eps));
  }
  // daire-daire
  const dd = d2(A.c, B.c);
  if (dd < eps && Math.abs(A.r - B.r) < eps) {
    if (A.sw == null || B.sw == null) return 'overlap';
    // iki yay: ortak açı aralığı var mı (örnekle)
    for (let i = 1; i < 16; i++) { const t = A.a0 + (A.sw * i) / 16; const p = [A.c[0] + A.r * Math.cos(t), A.c[1] + A.r * Math.sin(t)]; if (onArc(B, p, -eps)) return 'overlap'; }
    return [];
  }
  if (dd > A.r + B.r + eps || dd < Math.abs(A.r - B.r) - eps || dd < 1e-15) return [];
  const a = (A.r * A.r - B.r * B.r + dd * dd) / (2 * dd); const h = Math.sqrt(Math.max(0, A.r * A.r - a * a));
  const m = [A.c[0] + (a * (B.c[0] - A.c[0])) / dd, A.c[1] + (a * (B.c[1] - A.c[1])) / dd];
  const pts = h < eps ? [m] : [[m[0] + (h * (B.c[1] - A.c[1])) / dd, m[1] - (h * (B.c[0] - A.c[0])) / dd], [m[0] - (h * (B.c[1] - A.c[1])) / dd, m[1] + (h * (B.c[0] - A.c[0])) / dd]];
  return pts.filter((p) => onArc(A, p, eps) && onArc(B, p, eps));
}
const sameGeom = (A, B, eps) => {
  if (A.t !== B.t) return false;
  if (A.t === 'L') return (d2(A.p0, B.p0) < eps && d2(A.p1, B.p1) < eps) || (d2(A.p0, B.p1) < eps && d2(A.p1, B.p0) < eps);
  if (A.t === 'C') { if (d2(A.c, B.c) > eps || Math.abs(A.r - B.r) > eps) return false; if (A.sw == null && B.sw == null) return true; if (A.sw == null || B.sw == null) return false; return Math.abs(A.sw - B.sw) * A.r < eps && ((d2(A.p0, B.p0) < eps && d2(A.p1, B.p1) < eps) || (d2(A.p0, B.p1) < eps && d2(A.p1, B.p0) < eps)); }
  return false;
};

// A parçası B geometrisinin içinde mi (yinelenen/örtüşen varlığın parçası)
function contains(B, A, eps) {
  const onSeg = (p, g) => { if (g.t === 'L') { const r = [g.p1[0] - g.p0[0], g.p1[1] - g.p0[1]]; const L2 = r[0] * r[0] + r[1] * r[1]; const t = ((p[0] - g.p0[0]) * r[0] + (p[1] - g.p0[1]) * r[1]) / L2; const q = [g.p0[0] + r[0] * t, g.p0[1] + r[1] * t]; return t >= -eps && t <= 1 + eps && d2(p, q) < eps * 10; } if (g.t === 'C') return Math.abs(d2(p, g.c) - g.r) < eps * 10 && onArc(g, p, eps * 10); return false; };
  if (A.t === 'L') return onSeg(A.p0, B) && onSeg(A.p1, B) && onSeg([(A.p0[0] + A.p1[0]) / 2, (A.p0[1] + A.p1[1]) / 2], B);
  if (A.t === 'C' && B.t === 'C') { if (A.sw == null) return B.sw == null; const m = A.a0 + A.sw / 2; return onSeg(A.p0, B) && onSeg(A.p1, B) && onSeg([A.c[0] + A.r * Math.cos(m), A.c[1] + A.r * Math.sin(m)], B); }
  return false;
}
// Segment → kaynak varlık kimliği (profiles.js 'ent' alanı yoksa geometriden)
function segEnt(sk, s, eps) {
  if (s.ent != null) return String(s.ent);
  const g = segGeom(s); if (!g) return null;
  const c = [];
  for (const e of sk.ents || []) { if (e.cons) continue; const h = entGeom(sk, e); if (!h) continue; if (g.t === 'C' && h.t === 'C' && g.sw == null && h.sw != null && h.sw >= TAU - 1e-9) { if (d2(g.c, h.c) < eps && Math.abs(g.r - h.r) < eps) c.push(e.id); continue; } if (sameGeom(g, h, eps)) c.push(e.id); }
  c.sort(); return c.length ? String(c[0]) : null;
}

// OCCT kenarı (dünya koordinatı)
export function segEdge(s, W, plane, sc) {
  if (s.type === 'line') return TP.makeLine(W(s.p0), W(s.p1));
  if (s.type === 'arc') { if (d2(s.p0, s.p1) < 1e-9 * sc) return R.makeCircle(s.r, W(s.c), plane.n); return TP.makeArc3(W(s.p0), W(s.mid), W(s.p1)); }
  if (s.type === 'circle') return R.makeCircle(s.r, W(s.c), plane.n);
  if (s.type === 'ellipse' || s.type === 'ellarc') {
    const rot = s.rot || 0; const u = V.add(V.mul(plane.x, Math.cos(rot)), V.mul(plane.y, Math.sin(rot))); const v = V.cross(plane.n, u);
    let rx = s.rx, ry = s.ry; if (!(rx > 0 && ry > 0)) throw new KErr('sketch.bad_segment', { type: s.type });
    const swap = ry > rx; const major = swap ? ry : rx, minor = swap ? rx : ry; const xDir = swap ? v : u; const shift = swap ? -Math.PI / 2 : 0;
    if (s.type === 'ellipse') return R.makeEllipse(major, minor, W(s.c), plane.n, xDir);
    let a0 = s.a0, a1 = s.a1;
    if (s.ccw === false) { while (a1 >= a0) a1 -= TAU; while (a1 < a0 - TAU) a1 += TAU; [a0, a1] = [a1, a0]; } else { while (a1 <= a0) a1 += TAU; while (a1 > a0 + TAU) a1 -= TAU; }
    const e = R.makeEllipseArc(major, minor, a0 + shift, a1 + shift, W(s.c), plane.n, xDir);
    // uç noktaları sketch'teki p0/p1 ile tutmalı
    const ps = [e.startPoint.toTuple(), e.endPoint.toTuple()], want = [W(s.p0), W(s.p1)];
    const okEnds = (V.dist(ps[0], want[0]) < 1e-6 * sc && V.dist(ps[1], want[1]) < 1e-6 * sc) || (V.dist(ps[0], want[1]) < 1e-6 * sc && V.dist(ps[1], want[0]) < 1e-6 * sc);
    if (!okEnds) throw new KErr('sketch.bad_segment', { type: s.type });
    return e;
  }
  if (s.type === 'spline') return splineEdge(s, W);
  throw new KErr('sketch.unknown_segment', { type: String(s.type) });
}
function splineEdge(s, W) {
  const oc = R.getOC(); const r = scope();
  try {
    let pts = (s.pts || []).map((p) => W(p));
    if (s.closed && pts.length > 2 && V.dist(pts[0], pts[pts.length - 1]) < 1e-9) pts = pts.slice(0, -1);
    if (pts.length < 2) throw new KErr('sketch.bad_segment', { type: 'spline' });
    const a1 = r(new oc.NCollection_Array1_gp_Pnt(1, pts.length));
    pts.forEach((p, i) => a1.SetValue(i + 1, r(new oc.gp_Pnt(p[0], p[1], p[2]))));
    const arr = r(new oc.NCollection_HArray1_gp_Pnt(a1));
    const ip = r(new oc.GeomAPI_Interpolate(arr, !!s.closed, 1e-9)); ip.Perform();
    if (!ip.IsDone()) throw new KErr('sketch.bad_segment', { type: 'spline' });
    const curve = r(ip.Curve());
    return new R.Edge(r(new oc.BRepBuilderAPI_MakeEdge(curve)).Edge());
  } catch (e) { if (e instanceof KErr) throw e; throw new KErr('sketch.bad_segment', { type: 'spline' }); }
  finally { r.done(); }
}
// kenarı örnekle (eğri türleri için çoklu çizgi)
function sampleEdge(edge, plane, n = 64) {
  const oc = R.getOC(); const r = scope();
  try {
    const c = r(new oc.BRepAdaptor_Curve(edge.wrapped)); const t0 = c.FirstParameter(), t1 = c.LastParameter(); const out = [];
    for (let i = 0; i <= n; i++) { const p = r(c.Value(t0 + ((t1 - t0) * i) / n)); const l = V.toLocal(plane, [p.X(), p.Y(), p.Z()]); out.push([l[0], l[1]]); }
    return out;
  } finally { r.done(); }
}
const polyLen = (pts) => pts.slice(1).reduce((s, p, i) => s + d2(p, pts[i]), 0);

// Döner: [{face, segs:[{edge, ent, mid(world)}], sig, loops}] seçili bölgeler
export function sketchFaces(sk, plane, profileSel, offset = 0) {
  if (!sk || typeof sk !== 'object' || !sk.points || !Array.isArray(sk.ents)) throw new KErr('sketch.no_profile');
  // nokta koordinatları
  for (const [id, p] of Object.entries(sk.points)) if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) { if (sk.ents.some((e) => !e.cons && [e.a, e.b, e.c, e.p].includes(id))) throw new KErr('sketch.bad_point', { id }); }
  const all = profileSel === 'all' || profileSel == null;
  // Bölgeler arayüzle AYNI işlevle ve AYNI girdiyle bulunur (profil dizinleri tutarlı kalsın).
  const S = sk;
  const fr = findRegions(S); const { regions } = fr;
  // findRegions güvenilmez sonuç bildirirse (kapanmayan dolaşım, tutarsız alan, kesişim hesaplanamadı) açık hata
  const bad = (fr.issues || []).find((x) => ['inconsistent', 'intersect_failed', 'unclosed'].includes(x.code));
  if (bad) throw new KErr('sketch.unreliable', { issue: bad.code });
  // eski findRegions (yineleme ayıklamayan) için: yinelenen varlık varsa dizinli seçim güvenilmez
  if (!fr.issues && dedupe(sk).dup) throw new KErr('sketch.duplicate_geometry', { n: dedupe(sk).dup });
  let idxs;
  if (all) idxs = regions.map((_, i) => i);
  else {
    if (!Array.isArray(profileSel)) throw new KErr('sketch.profile_gone');
    if (!profileSel.length) throw new KErr('sketch.no_profile_selected');
    if (profileSel.some((i) => !Number.isInteger(i) || i < 0 || i >= regions.length)) throw new KErr('sketch.profile_gone');
    idxs = [...new Set(profileSel)];
  }
  // ölçek ve tolerans
  let ext = 0; for (const i of idxs) for (const p of regions[i].poly) ext = Math.max(ext, Math.abs(p[0]), Math.abs(p[1]));
  if (!(ext <= MAX_COORD)) throw new KErr('value.out_of_range', { field: 'ef.sketch', value: ext, min: -MAX_COORD, max: MAX_COORD });
  const sc = Math.max(1, ext); const eps = 1e-7 * sc;
  const on = V.mul(plane.n, offset);
  const W = (p) => V.add(V.toWorld(plane, p[0], p[1]), on);
  const entGs = (S.ents || []).filter((e) => !e.cons && e.type !== 'point').map((e) => entGeom(S, e)).filter(Boolean);
  const out = [];
  for (const i of idxs) {
    const reg = regions[i]; const loops = [reg.loop, ...reg.holes.map((h) => h.loop)];
    const built = loops.map((loop) => loop.map((s) => {
      const edge = segEdge(s, W, plane, sc); const ent = segEnt(S, s, eps);
      let g = segGeom(s); if (!g) { const pts = sampleEdge(edge, { ...plane, o: V.add(plane.o, on) }); g = { t: 'P', pts, len: polyLen(pts) }; }
      return { s, edge, ent, g, mid: edgeMid(edge.wrapped) };
    }));
    // girdi doğrulama: kısa kenar
    for (const L of built) for (const b of L) if (!(b.g.len >= MIN_EDGE)) throw new KErr('sketch.edge_too_short', { len: b.g.len, min: MIN_EDGE });
    // kesişim / T-kavşak / örtüşme: bölge sınırındaki her segment, diğer her varlıkla yalnız kendi uç noktalarında buluşabilir
    const segAll = built.flat();
    for (const A of segAll) {
      const endsA = ends(A.g);
      const others = [...entGs, ...segAll.filter((x) => x !== A && x.g.t === 'P').map((x) => x.g)];
      for (const B of others) {
        if (B === A.g || (B.id != null && A.ent != null && String(B.id) === A.ent) || sameGeom(A.g, B, eps)) continue;
        const X = intersect(A.g, B, eps);
        if (X === 'overlap') { if (contains(B, A.g, eps)) continue; throw new KErr('sketch.overlap'); }
        for (const p of X) if (!endsA.some((q) => d2(p, q) < Math.max(eps * 10, 1e-6))) throw new KErr('sketch.self_intersect', { x: +p[0].toFixed(4), y: +p[1].toFixed(4) });
      }
    }
    let face;
    try {
      const wires = built.map((L) => R.assembleWire(L.map((b) => b.edge)));
      face = R.makeFace(wires[0]); if (wires.length > 1) face = R.addHolesInFace(face, wires.slice(1));
    } catch (e) { throw new KErr('sketch.invalid_profile'); }
    if (!faceValid(face)) throw new KErr('sketch.invalid_profile');
    const outerEnts = built[0].map((b) => b.ent);
    const sig = outerEnts.every((x) => x != null) ? [...new Set(outerEnts)].sort().join(',') : null;
    out.push({ face, segs: built.flat(), sig, loops, poly: reg.poly, holes: reg.holes });
  }
  return out;
}
// yüz kenarı → segment (orta nokta eşlemesi)
export function matchSeg(segs, mid, sc) {
  let best = null, bd = 1e-6 * Math.max(1, sc);
  for (const s of segs) { const d = V.dist(s.mid, mid); if (d < bd) { bd = d; best = s; } }
  return best;
}
export { SubIndex };
