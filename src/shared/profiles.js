// Sketch'ten kapalı bölgeleri (profil) çıkarır: düzlemsel düzenleme (planar arrangement).
// Adımlar: varlıkları eğri parçalarına çevir → tüm çiftlerin kesişimlerini bul → kesişimlerde böl →
// çakışık parçaları ayıkla → düğümleri toleransla birleştir → yarım-kenar yüz dolaşımı → köprü/sarkan kenar ayıklama →
// delik atama. Çözülemeyen ya da tutarsız durum `issues`/`open` ile bildirilir; sessiz yanlış alan üretilmez.
import * as G from './geom2d.js';

const TAU = Math.PI * 2;
const angNorm = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };
export const NODE_TOL = 1e-6;

export function arcGeom(sk, e) {
  const c = sk.points[e.c], a = sk.points[e.a], b = sk.points[e.b];
  const r = Math.hypot(a.x - c.x, a.y - c.y);
  const a0 = Math.atan2(a.y - c.y, a.x - c.x);
  const a1 = Math.atan2(b.y - c.y, b.x - c.x);
  let sweep = angNorm(a1 - a0); if (sweep < 1e-9) sweep = TAU;
  return { c, r, a0, sweep };
}
// elips varlığı: merkez c, odak f, küçük yarıçap rmin (PlaneGCS gösterimi) → {c, rx, ry, rot}
export function ellipseGeom(sk, e) {
  const c = sk.points[e.c], f = sk.points[e.f]; const fx = f.x - c.x, fy = f.y - c.y, lf = Math.hypot(fx, fy);
  const ry = Math.abs(e.rmin); const rx = Math.sqrt(ry * ry + lf * lf);
  return { c: [c.x, c.y], rx, ry, rot: lf < 1e-12 ? 0 : Math.atan2(fy, fx) };
}
const ellParam = (g, p) => { const dx = p[0] - g.c[0], dy = p[1] - g.c[1], cr = Math.cos(g.rot), sr = Math.sin(g.rot); return Math.atan2((-dx * sr + dy * cr) / g.ry, (dx * cr + dy * sr) / g.rx); };

// Sketch varlığını geom2d parçasına çevirir (yoksa null). Parçaya kaynak kimliği `ent` yazılmaz (çağıran ekler).
export function entSeg(sk, e) {
  const P = sk.points;
  switch (e.type) {
    case 'line': { const a = P[e.a], b = P[e.b]; return a && b ? G.mkLine([a.x, a.y], [b.x, b.y]) : null; }
    case 'circle': { const c = P[e.c]; return c && e.r > 0 ? G.mkCircle([c.x, c.y], e.r) : null; }
    case 'arc': { if (!P[e.a] || !P[e.b] || !P[e.c]) return null; const g = arcGeom(sk, e); return G.mkArc([g.c.x, g.c.y], g.r, g.a0, g.sweep); }
    case 'ellipse': { if (!P[e.c] || !P[e.f]) return null; const g = ellipseGeom(sk, e); return g.ry > 0 ? G.mkEllipse(g.c, g.rx, g.ry, g.rot) : null; }
    case 'ellarc': {
      if (!P[e.c] || !P[e.f] || !P[e.a] || !P[e.b]) return null; const g = ellipseGeom(sk, e); if (!(g.ry > 0)) return null;
      const t0 = ellParam(g, [P[e.a].x, P[e.a].y]), t1 = ellParam(g, [P[e.b].x, P[e.b].y]); let sw = angNorm(t1 - t0); if (sw < 1e-9) sw = TAU;
      return G.mkEllArc(g.c, g.rx, g.ry, g.rot, t0, sw);
    }
    case 'spline': { const pts = (e.pts || []).map((id) => P[id]).filter(Boolean).map((p) => [p.x, p.y]); return pts.length >= 2 ? G.mkSpline(pts, e.closed) : null; }
  }
  return null;
}
export const KINDS = new Set(['line', 'circle', 'arc', 'ellipse', 'ellarc', 'spline']);

export const polyArea = G.polyArea;
export const pointInPoly = G.pointInPoly;

// ---- parça → döngü öğesi (gidiş yönünde)
function loopSeg(piece, ent, fwd) {
  const s = piece;
  switch (s.type) {
    case 'line': return fwd ? { type: 'line', ent, p0: s.p0, p1: s.p1 } : { type: 'line', ent, p0: s.p1, p1: s.p0 };
    case 'arc': {
      const mid = G.ptAt(s, s.sweep / 2);
      return fwd ? { type: 'arc', ent, p0: s.p0, p1: s.p1, mid, c: s.c, r: s.r, ccw: true } : { type: 'arc', ent, p0: s.p1, p1: s.p0, mid, c: s.c, r: s.r, ccw: false };
    }
    case 'circle': return { type: 'circle', ent, c: s.c, r: s.r };
    case 'ellipse': return { type: 'ellipse', ent, c: s.c, rx: s.rx, ry: s.ry, rot: s.rot };
    case 'ellarc': return fwd
      ? { type: 'ellarc', ent, p0: s.p0, p1: s.p1, c: s.c, rx: s.rx, ry: s.ry, rot: s.rot, a0: s.a0, a1: s.a0 + s.sweep, ccw: true }
      : { type: 'ellarc', ent, p0: s.p1, p1: s.p0, c: s.c, rx: s.rx, ry: s.ry, rot: s.rot, a0: s.a0 + s.sweep, a1: s.a0, ccw: false };
    case 'spline': {
      if (s.closed) return { type: 'spline', ent, p0: s.pts[0], p1: s.pts[0], pts: fwd ? s.pts : s.pts.slice().reverse(), closed: true };
      return fwd ? { type: 'spline', ent, p0: s.p0, p1: s.p1, pts: s.pts } : { type: 'spline', ent, p0: s.p1, p1: s.p0, pts: s.pts.slice().reverse() };
    }
  }
}
// döngü öğesini geom2d parçasına geri çevirir (alan/örnekleme için); fwd: geometrik gidiş yönü
function toSeg(ls) {
  switch (ls.type) {
    case 'line': return G.mkLine(ls.p0, ls.p1);
    case 'arc': { const a0 = Math.atan2((ls.ccw ? ls.p0 : ls.p1)[1] - ls.c[1], (ls.ccw ? ls.p0 : ls.p1)[0] - ls.c[0]); const a1 = Math.atan2((ls.ccw ? ls.p1 : ls.p0)[1] - ls.c[1], (ls.ccw ? ls.p1 : ls.p0)[0] - ls.c[0]); let sw = angNorm(a1 - a0); if (sw < 1e-9) sw = TAU; return G.mkArc(ls.c, ls.r, a0, sw); }
    case 'circle': return G.mkCircle(ls.c, ls.r);
    case 'ellipse': return G.mkEllipse(ls.c, ls.rx, ls.ry, ls.rot);
    case 'ellarc': { const lo = ls.ccw ? ls.a0 : ls.a1, hi = ls.ccw ? ls.a1 : ls.a0; return G.mkEllArc(ls.c, ls.rx, ls.ry, ls.rot, lo, hi - lo); }
    case 'spline': return G.mkSpline(ls.closed ? ls.pts : ls.pts, ls.closed);
  }
}
// döngü (yönlü) yüzey alanı ve çokgeni
function loopMetrics(loop, tol = 0.01) {
  let area = 0; const poly = [];
  for (const ls of loop) {
    if (ls.type === 'circle' || ls.type === 'ellipse') { const s = toSeg(ls); area += G.areaContribution(s, true); const pts = G.sample(s, tol); for (let i = 0; i < pts.length - 1; i++) poly.push(pts[i]); continue; }
    const s = toSeg(ls); const fwdGeom = ls.type === 'arc' ? ls.ccw : ls.type === 'ellarc' ? ls.ccw : true;
    if (ls.type === 'arc' || ls.type === 'ellarc') {
      const a = G.areaContribution(s, true); area += fwdGeom ? a : -a;
      const pts = G.sample(s, tol); const ord = fwdGeom ? pts : pts.slice().reverse(); for (let i = 0; i < ord.length - 1; i++) poly.push(ord[i]);
    } else if (ls.type === 'spline') {
      const pts = G.sample(s, tol); for (let i = 0; i < pts.length - 1; i++) poly.push(pts[i]); area += G.areaContribution(s, true);
      if (!ls.closed) area += 0;
    } else { area += G.areaContribution(s, true); poly.push(ls.p0); }
  }
  return { area, poly };
}
const reverseLoop = (loop) => loop.slice().reverse().map((s) => {
  switch (s.type) {
    case 'line': return { ...s, p0: s.p1, p1: s.p0 };
    case 'arc': return { ...s, p0: s.p1, p1: s.p0, ccw: !s.ccw };
    case 'ellarc': return { ...s, p0: s.p1, p1: s.p0, a0: s.a1, a1: s.a0, ccw: !s.ccw };
    case 'spline': return s.closed ? { ...s, pts: s.pts.slice().reverse() } : { ...s, p0: s.p1, p1: s.p0, pts: s.pts.slice().reverse() };
    default: return s; // circle/ellipse: yönsüz
  }
});

// ---- ana işlev
// Döner: { regions:[{loop, poly, holes:[{loop,poly}], area (dış sınır), net (delikler düşülmüş), inside, ents:[id]}], open:boolean, issues:[{code, ents?, pt?}] }
// Döngü öğesi: line {p0,p1} | arc {p0,p1,mid,c,r,ccw} | circle {c,r} | ellipse {c,rx,ry,rot} | ellarc {p0,p1,c,rx,ry,rot,a0,a1,ccw} | spline {p0,p1,pts,closed?}; hepsinde `ent`.
export function findRegions(sk) {
  const issues = []; let open = false;
  const items = [];
  for (const e of sk.ents || []) {
    if (e.cons || !KINDS.has(e.type)) continue;
    const s = entSeg(sk, e); if (!s) continue;
    if ((s.type === 'line' && G.dist(s.p0, s.p1) < NODE_TOL)) continue;
    items.push({ ent: e.id, seg: s, bb: G.bbox(s), us: [] });
  }
  // 1) kesişimler
  const pad = 1e-6;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      if (A.bb.x1 < B.bb.x0 - pad || B.bb.x1 < A.bb.x0 - pad || A.bb.y1 < B.bb.y0 - pad || B.bb.y1 < A.bb.y0 - pad) continue;
      let r; try { r = G.intersect(A.seg, B.seg); } catch (e) { issues.push({ code: 'intersect_failed', ents: [A.ent, B.ent] }); open = true; continue; }
      for (const h of r.pts) { A.us.push(h.ua); B.us.push(h.ub); }
      for (const o of r.overlap) { A.us.push(o.a0, o.a1); B.us.push(o.b0, o.b1); issues.push({ code: 'overlap', ents: [A.ent, B.ent] }); }
    }
  }
  // 2) bölme
  let pieces = [];
  const closedWhole = [];
  for (const it of items) {
    const parts = G.splitAt(it.seg, it.us);
    for (const p of parts) {
      if (p.whole && G.isClosed(it.seg)) { closedWhole.push({ ent: it.ent, seg: it.seg }); continue; }
      const s = p.seg; const L = G.length(s); if (L < NODE_TOL && s.type !== 'circle') continue;
      pieces.push({ ent: it.ent, seg: s });
    }
  }
  // 3) çakışık parçaları ayıkla (aynı uç noktalar + aynı orta nokta)
  const mid = (s) => G.ptAt(s, G.endU(s) / 2);
  const kept = []; const buckets = new Map();
  const bk = (p) => Math.round(p[0] / 1e-4) + ':' + Math.round(p[1] / 1e-4);
  for (const pc of pieces) {
    const m = mid(pc.seg); const k = bk(m); let dup = null;
    for (let dx = -1; dx <= 1 && !dup; dx++) for (let dy = -1; dy <= 1 && !dup; dy++) {
      const kk = (Math.round(m[0] / 1e-4) + dx) + ':' + (Math.round(m[1] / 1e-4) + dy);
      for (const q of buckets.get(kk) || []) {
        if (G.dist(q.m, m) > 1e-5) continue;
        const ends = (a, b) => (G.dist(a.p0, b.p0) < 1e-5 && G.dist(a.p1, b.p1) < 1e-5) || (G.dist(a.p0, b.p1) < 1e-5 && G.dist(a.p1, b.p0) < 1e-5);
        if (ends(q.seg, pc.seg)) { dup = q; break; }
      }
    }
    if (dup) { if (dup.ent !== pc.ent) issues.push({ code: 'duplicate', ents: [dup.ent, pc.ent] }); else issues.push({ code: 'duplicate', ents: [pc.ent] }); continue; }
    pc.m = m; kept.push(pc); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(pc);
  }
  pieces = kept;
  // 4) düğümler (toleranslı birleştirme)
  const nodes = []; const grid = new Map(); const gk = (x, y) => Math.floor(x / (NODE_TOL * 4)) + ':' + Math.floor(y / (NODE_TOL * 4));
  const nodeOf = (p) => {
    const cx = Math.floor(p[0] / (NODE_TOL * 4)), cy = Math.floor(p[1] / (NODE_TOL * 4));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const n of grid.get((cx + dx) + ':' + (cy + dy)) || []) if (G.dist(n.p, p) <= NODE_TOL) return n;
    const n = { id: nodes.length, p: [p[0], p[1]], out: [] }; nodes.push(n); const k = gk(p[0], p[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(n); return n;
  };
  const OFF = 0.7123456;
  const hes = [];
  for (const pc of pieces) {
    const s = pc.seg; const U = G.endU(s);
    const n0 = nodeOf(s.p0), n1 = nodeOf(s.p1);
    if (n0 === n1 && G.length(s) < 10 * NODE_TOL) continue; // sıfıra yakın döngü
    const t0 = G.tangentAt(s, 0), t1 = G.tangentAt(s, U);
    const k0 = G.curvatureAt(s, 0), k1 = G.curvatureAt(s, U);
    const h1 = { from: n0, to: n1, pc, fwd: true, ang: angNorm(Math.atan2(t0[1], t0[0]) + OFF), kap: k0, used: false, dead: false };
    const h2 = { from: n1, to: n0, pc, fwd: false, ang: angNorm(Math.atan2(-t1[1], -t1[0]) + OFF), kap: -k1, used: false, dead: false };
    h1.twin = h2; h2.twin = h1; hes.push(h1, h2); n0.out.push(h1); n1.out.push(h2);
  }
  const sortOut = () => {
    for (const n of nodes) {
      n.live = n.out.filter((h) => !h.dead);
      n.live.sort((a, b) => (Math.abs(a.ang - b.ang) < 1e-9 ? a.kap - b.kap : a.ang - b.ang));
      // sarma kenarı: 2π'ye çok yakın ve 0'a çok yakın eşleri düzelt
      if (n.live.length > 1) {
        const f = n.live[0], l = n.live[n.live.length - 1];
        if (TAU - l.ang + f.ang < 1e-9 && l.kap < f.kap) { n.live.pop(); n.live.unshift(l); }
      }
    }
  };
  // 5) yüz dolaşımı + köprü ayıklama
  let loops = [];
  for (let iter = 0; iter < 200; iter++) {
    sortOut(); for (const h of hes) h.used = false; loops = []; let bad = false;
    for (const h0 of hes) {
      if (h0.dead || h0.used) continue;
      const loop = []; let h = h0, guard = 0;
      while (!h.used && guard++ < 1e6) {
        h.used = true; loop.push(h);
        const list = h.to.live, idx = list.indexOf(h.twin);
        if (idx < 0) { bad = true; break; }
        h = list[(idx - 1 + list.length) % list.length];
      }
      if (h === h0 && !bad) { loop.forEach((x) => (x.loop = loop)); loops.push(loop); } else { bad = true; issues.push({ code: 'unclosed', ents: loop.map((x) => x.pc.ent) }); open = true; }
    }
    // köprü: iki yönü de aynı döngüde
    let removed = 0;
    for (const h of hes) if (!h.dead && h.loop && h.twin.loop === h.loop) { h.dead = true; h.twin.dead = true; removed++; if (!issues.some((i) => i.code === 'dangling' && i.ents[0] === h.pc.ent)) issues.push({ code: 'dangling', ents: [h.pc.ent], pt: h.pc.m }); }
    if (!removed) break;
    open = true; for (const h of hes) h.loop = null;
  }
  const live = hes.filter((h) => !h.dead);
  // 6) bileşenler
  const par = new Map(); const find = (k) => { let r = k; while (par.get(r) !== r) r = par.get(r); while (par.get(k) !== r) { const nx = par.get(k); par.set(k, r); k = nx; } return r; };
  for (const h of live) { if (!par.has(h.from.id)) par.set(h.from.id, h.from.id); if (!par.has(h.to.id)) par.set(h.to.id, h.to.id); }
  for (const h of live) { const a = find(h.from.id), b = find(h.to.id); if (a !== b) par.set(a, b); }
  // 7) döngüleri bölge / dış sınır olarak ayır
  const regions = [], outers = [];
  const compSum = new Map();
  for (const l of loops) {
    if (l[0].dead) continue;
    const loop = l.map((h) => loopSeg(h.pc.seg, h.pc.ent, h.fwd));
    const comp = find(l[0].from.id); const m = loopMetrics(loop);
    compSum.set(comp, (compSum.get(comp) || 0) + m.area);
    const ents = [...new Set(l.map((h) => h.pc.ent))];
    const L = { loop, poly: m.poly, area: m.area, comp, ents };
    if (m.area > 1e-9) regions.push(L); else if (m.area < -1e-9) outers.push({ ...L, poly: m.poly.slice().reverse(), loop: reverseLoop(loop), area: -m.area });
  }
  // tutarlılık: bağlı bileşende yüzlerin işaretli alan toplamı 0 olmalıdır
  const badComp = new Set();
  for (const [comp, s] of compSum) { const scale = Math.max(1, ...[...regions, ...outers].filter((r) => r.comp === comp).map((r) => r.area)); if (Math.abs(s) > 1e-6 * scale + 1e-6) { badComp.add(comp); issues.push({ code: 'inconsistent' }); open = true; } }
  closedWhole.forEach((w, i) => {
    const loop = [loopSeg(w.seg, w.ent, true)]; const m = loopMetrics(loop); const comp = 'c' + i;
    const L = { loop, poly: m.poly, area: Math.abs(m.area), comp, ents: [w.ent] };
    if (m.area < 0) { L.area = -m.area; }
    regions.push(L); outers.push({ ...L });
  });
  const good = regions.filter((r) => !badComp.has(r.comp));
  good.forEach((r) => (r.holes = []));
  for (const o of outers.filter((x) => !badComp.has(x.comp))) {
    const pt = o.poly[0]; let best = null;
    for (const r of good) { if (r.comp === o.comp) continue; if (r.area <= o.area) continue; if (pointInPoly(pt, r.poly) && (!best || r.area < best.area)) best = r; }
    if (best) best.holes.push({ loop: o.loop, poly: o.poly, area: o.area });
  }
  good.forEach((r) => { delete r.comp; r.net = r.area - r.holes.reduce((s, h) => s + h.area, 0); r.inside = interiorPointWithHoles(r); });
  return { regions: good, open, issues };
}
// Bölge içinde, sınıra olabildiğince uzak bir nokta (en büyük açıklık). Sınıra uzaklık gerçek eğrilerle ölçülür.
function interiorPointWithHoles(r) {
  const segs = [...r.loop, ...r.holes.flatMap((h) => h.loop)].map((l) => { try { return toSeg(l); } catch (e) { return null; } }).filter(Boolean);
  const clear = (p) => { let m = Infinity; for (const s of segs) { const d = G.closestPoint(s, p).d; if (d < m) m = d; } return m; };
  const inside = (p) => pointInPoly(p, r.poly) && !r.holes.some((h) => pointInPoly(p, h.poly));
  let best = null, bestC = -1;
  const tryP = (p) => { if (!inside(p)) return; const c = clear(p); if (c > bestC) { bestC = c; best = p; } };
  const A = r.poly; const step = Math.max(1, Math.floor(A.length / 40));
  for (let i = 0; i < A.length; i += step) {
    const a = A[i], b = A[(i + 1) % A.length]; const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy); if (l < 1e-9) continue;
    const nx = -dy / l, ny = dx / l;
    for (const f of [0.4, 0.2, 0.1, 0.03, 0.01, 0.003, 0.001]) for (const sg of [1, -1]) for (const t of [0.5, 0.2, 0.8]) {
      const e = Math.min(f * l, 40) * sg; tryP([a[0] + dx * t + nx * e, a[1] + dy * t + ny * e]);
    }
    if (bestC > 0.5) break;
  }
  return best || A[0];
}
export function regionContains(r, pt) { return pointInPoly(pt, r.poly) && !r.holes.some((h) => pointInPoly(pt, h.poly)); }
