// Çizim araçları tablosu: her araç n tıklamalıdır (spline hariç). geom(pts) saf geometri üretir; preview ve commit bunu kullanır.
// commit(S, pts): S._apply içinde çağrılır; S.sk'yi değiştirir (S yardımcıları: _ptFor, _addEnt, _addCon).
import { G, TAU } from './core.js';
import { fmtNum, t } from '../../shared/i18n.js';

const fmt = (v) => fmtNum(Number(v), 3);
const DEG = Math.PI / 180;
const arcPolyline = (c, r, a0, sweep) => G.sample(G.mkArc(c, r, a0, sweep), 0.02);
const circ3 = (a, b, c) => { // üç noktadan çember
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-9) return null;
  const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d;
  const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d;
  return { c: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) };
};
export const circumcircle = circ3;
const xy = (s) => [s.x, s.y];

// 3 noktalı dikdörtgen geometrisi
function rect3Geom(p) {
  const A = xy(p[0]), B = xy(p[1]); const L = G.dist(A, B); if (L < 1e-9) return null;
  const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], n = [-u[1], u[0]]; const C = xy(p[2]);
  const h = (C[0] - A[0]) * n[0] + (C[1] - A[1]) * n[1]; if (Math.abs(h) < 1e-9) return null;
  return { pts: [A, B, [B[0] + n[0] * h, B[1] + n[1] * h], [A[0] + n[0] * h, A[1] + n[1] * h]], w: L, h: Math.abs(h) };
}
function polyGeom(S, p) {
  const c = xy(p[0]), v = xy(p[1]); const N = S.opts.polySides, circum = S.opts.polyCircum; const d = G.dist(c, v); if (d < 1e-9) return null;
  const R = circum ? d / Math.cos(Math.PI / N) : d; const a0 = Math.atan2(v[1] - c[1], v[0] - c[0]) + (circum ? Math.PI / N : 0);
  const verts = []; for (let i = 0; i < N; i++) verts.push([c[0] + R * Math.cos(a0 + (i * TAU) / N), c[1] + R * Math.sin(a0 + (i * TAU) / N)]);
  return { verts, R, rho: d, c };
}
function slotGeom(p) {
  const c1 = xy(p[0]), c2 = xy(p[1]); const L = G.dist(c1, c2); if (L < 1e-9) return null;
  const d = [(c2[0] - c1[0]) / L, (c2[1] - c1[1]) / L], n = [-d[1], d[0]];
  const w = p[2] ? Math.abs((p[2].x - c1[0]) * n[0] + (p[2].y - c1[1]) * n[1]) : 0; if (p[2] && w < 1e-9) return null;
  return { c1, c2, d, n, r: w };
}
function ellipseGeomFrom(p) {
  const c = xy(p[0]), m = xy(p[1]); const a = G.dist(c, m); if (a < 1e-9) return null;
  const u = [(m[0] - c[0]) / a, (m[1] - c[1]) / a], n = [-u[1], u[0]];
  const t = p[2] ? Math.abs((p[2].x - c[0]) * n[0] + (p[2].y - c[1]) * n[1]) : 0; if (p[2] && t < 1e-9) return null;
  let rx = a, ry = t, dir = u; if (p[2] && t > a) { rx = t; ry = a; dir = n; }
  const lf = Math.sqrt(Math.max(0, rx * rx - ry * ry));
  return { c, rx, ry, dir, f: [c[0] + dir[0] * lf, c[1] + dir[1] * lf], rot: Math.atan2(dir[1], dir[0]) };
}
export function tangentArcGeom(S, p) { // başlangıç noktası mevcut bir eğrinin ucu olmalı
  const st = p[0]; if (!st.pid) return null; const users = S.sk.ents.filter((e) => (e.type === 'line' && (e.a === st.pid || e.b === st.pid)) || (e.type === 'arc' && (e.a === st.pid || e.b === st.pid)));
  if (users.length !== 1) return null; const e = users[0]; let T;
  if (e.type === 'line') { const other = S.sk.points[e.a === st.pid ? e.b : e.a], me = S.sk.points[st.pid]; const l = Math.hypot(me.x - other.x, me.y - other.y) || 1; T = [(me.x - other.x) / l, (me.y - other.y) / l]; }
  else { const c = S.sk.points[e.c], me = S.sk.points[st.pid]; const ang = Math.atan2(me.y - c.y, me.x - c.x); T = e.b === st.pid ? [-Math.sin(ang), Math.cos(ang)] : [Math.sin(ang), -Math.cos(ang)]; }
  return { ent: e, S: [S.sk.points[st.pid].x, S.sk.points[st.pid].y], T };
}
function tangentArcFrom(S, p) {
  const g = tangentArcGeom(S, p); if (!g || !p[1]) return g ? { ...g, bad: true } : null;
  const n = [-g.T[1], g.T[0]], Q = xy(p[1]); const dq = [Q[0] - g.S[0], Q[1] - g.S[1]]; const den = 2 * (n[0] * dq[0] + n[1] * dq[1]);
  if (Math.abs(den) < 1e-9) return { ...g, bad: true };
  // C-43: S._arctRev açıksa yay aynı çemberin tümleyen parçasıdır: uçtan doğrunun devamının TERSİ yönünde çıkar (sivri uç; teğetlik korunur)
  const k = (dq[0] ** 2 + dq[1] ** 2) / den; const c = [g.S[0] + n[0] * k, g.S[1] + n[1] * k]; const rev = !!S._arctRev; return { ...g, c, r: Math.abs(k), ccw: rev ? !(k > 0) : k > 0, E: Q, rev };
}

export const DEFS = {
  rectc: {
    n: 2, hints: ['hint.rectc', 'hint.rectc_next'], kind: 'sk.kind.rect',
    preview(S, pts, cur) { const c = xy(pts[0]), q = [cur.x, cur.y]; const dx = Math.abs(q[0] - c[0]), dy = Math.abs(q[1] - c[1]); return { polys: [{ pts: [[c[0] - dx, c[1] - dy], [c[0] + dx, c[1] - dy], [c[0] + dx, c[1] + dy], [c[0] - dx, c[1] + dy], [c[0] - dx, c[1] - dy]] }], tip: `${fmt(2 * dx)} × ${fmt(2 * dy)} mm` }; },
    valid(S, pts) { return Math.abs(pts[1].x - pts[0].x) > 1e-6 && Math.abs(pts[1].y - pts[0].y) > 1e-6 ? null : 'sk.rect_zero'; },
    commit(S, pts) {
      const c = xy(pts[0]), dx = Math.abs(pts[1].x - c[0]), dy = Math.abs(pts[1].y - c[1]);
      const cp = S._ptFor(pts[0]); const P = [S._newPt(c[0] - dx, c[1] - dy), S._newPt(c[0] + dx, c[1] - dy), pts[1].pid && pts[1].x > c[0] && pts[1].y > c[1] ? pts[1].pid : S._newPt(c[0] + dx, c[1] + dy), S._newPt(c[0] - dx, c[1] + dy)];
      const l = P.map((p, i) => S._addEnt({ type: 'line', a: p, b: P[(i + 1) % 4] }));
      S._addCon('horizontal', l[0]); S._addCon('vertical', l[1]); S._addCon('horizontal', l[2]); S._addCon('vertical', l[3]);
      const diag = S._addEntCons({ type: 'line', a: P[0], b: P[2] }); S._addCon('midpoint', cp, diag);
    },
  },
  rect3: {
    n: 3, hints: ['hint.rect3', 'hint.rect3_b', 'hint.rect3_c'], kind: 'sk.kind.rect',
    preview(S, pts, cur) {
      if (pts.length === 1) return { polys: [{ pts: [xy(pts[0]), [cur.x, cur.y]] }], tip: fmt(G.dist(xy(pts[0]), [cur.x, cur.y])) + ' mm' };
      const g = rect3Geom([pts[0], pts[1], cur]); if (!g) return { polys: [{ pts: [xy(pts[0]), xy(pts[1])] }], tip: '' };
      return { polys: [{ pts: [...g.pts, g.pts[0]] }], tip: `${fmt(g.w)} × ${fmt(g.h)} mm` };
    },
    valid(S, pts) { return rect3Geom(pts) ? null : 'sk.rect_zero'; },
    commit(S, pts) {
      const g = rect3Geom(pts); const P = [S._ptFor(pts[0]), S._ptFor(pts[1]), S._newPt(...g.pts[2]), S._newPt(...g.pts[3])];
      const l = P.map((p, i) => S._addEnt({ type: 'line', a: p, b: P[(i + 1) % 4] }));
      S._addCon('perpendicular', l[0], l[1]); S._addCon('perpendicular', l[1], l[2]); S._addCon('perpendicular', l[2], l[3]);
    },
  },
  circle2: {
    n: 2, hints: ['hint.circle2', 'hint.circle2_next'], kind: 'sk.kind.circle',
    preview(S, pts, cur) { const a = xy(pts[0]), b = [cur.x, cur.y]; const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r = G.dist(a, b) / 2; return { polys: [{ pts: arcPolyline(c, Math.max(r, 1e-6), 0, TAU) }, { pts: [a, b], dashed: true }], tip: 'Ø ' + fmt(2 * r) + ' mm' }; },
    valid(S, pts) { return G.dist(xy(pts[0]), xy(pts[1])) > 1e-6 ? null : 'sk.radius_zero'; },
    commit(S, pts) {
      const a = xy(pts[0]), b = xy(pts[1]); const p1 = S._ptFor(pts[0]), p2 = S._ptFor(pts[1]); const cp = S._newPt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      const diam = S._addEntCons({ type: 'line', a: p1, b: p2 }); const circ = S._addEnt({ type: 'circle', c: cp, r: G.dist(a, b) / 2 });
      S._addCon('pointOn', p1, circ); S._addCon('midpoint', cp, diam);
    },
  },
  circle3: {
    n: 3, hints: ['hint.circle3', 'hint.circle3_b', 'hint.circle3_c'], kind: 'sk.kind.circle',
    preview(S, pts, cur) {
      if (pts.length === 1) return { polys: [{ pts: [xy(pts[0]), [cur.x, cur.y]], dashed: true }], tip: '' };
      const c = circ3(xy(pts[0]), xy(pts[1]), [cur.x, cur.y]); if (!c) return { polys: [], tip: '' }; return { polys: [{ pts: arcPolyline(c.c, c.r, 0, TAU) }], tip: 'R ' + fmt(c.r) + '  Ø ' + fmt(2 * c.r) + ' mm' };
    },
    valid(S, pts) { return circ3(xy(pts[0]), xy(pts[1]), xy(pts[2])) ? null : 'sk.three_collinear'; },
    commit(S, pts) {
      const c = circ3(xy(pts[0]), xy(pts[1]), xy(pts[2])); const ps = pts.map((p) => S._ptFor(p)); const cp = S._newPt(c.c[0], c.c[1]); const circ = S._addEnt({ type: 'circle', c: cp, r: c.r });
      ps.forEach((p) => S._addCon('pointOn', p, circ));
    },
  },
  arc3: {
    n: 3, hints: ['hint.arc3', 'hint.arc3_b', 'hint.arc3_c'], kind: 'sk.kind.arc',
    preview(S, pts, cur) {
      if (pts.length === 1) return { polys: [{ pts: [xy(pts[0]), [cur.x, cur.y]], dashed: true }], tip: '' };
      const A = xy(pts[0]), B = xy(pts[1]), M = [cur.x, cur.y]; const c = circ3(A, B, M); if (!c) return { polys: [], tip: '' };
      const aA = Math.atan2(A[1] - c.c[1], A[0] - c.c[0]), aB = Math.atan2(B[1] - c.c[1], B[0] - c.c[0]), aM = Math.atan2(M[1] - c.c[1], M[0] - c.c[0]);
      const onCcw = G.wrap(aM - aA) < G.wrap(aB - aA); const [s, e] = onCcw ? [aA, aB] : [aB, aA]; const sw = G.wrap(e - s) || TAU;
      return { polys: [{ pts: arcPolyline(c.c, c.r, s, sw) }], tip: 'R ' + fmt(c.r) + '  ' + fmt(sw / DEG) + '°' };
    },
    valid(S, pts) { return circ3(xy(pts[0]), xy(pts[1]), xy(pts[2])) ? null : 'sk.three_collinear'; },
    commit(S, pts) {
      const A = xy(pts[0]), B = xy(pts[1]), M = xy(pts[2]); const c = circ3(A, B, M);
      const aA = Math.atan2(A[1] - c.c[1], A[0] - c.c[0]), aB = Math.atan2(B[1] - c.c[1], B[0] - c.c[0]), aM = Math.atan2(M[1] - c.c[1], M[0] - c.c[0]);
      const onCcw = G.wrap(aM - aA) < G.wrap(aB - aA); const pa = S._ptFor(pts[0]), pb = S._ptFor(pts[1]); const cp = S._newPt(c.c[0], c.c[1]);
      const arc = S._addEnt({ type: 'arc', c: cp, a: onCcw ? pa : pb, b: onCcw ? pb : pa });
      const mp = pts[2].pid || S._newPt(M[0], M[1]); if (!pts[2].pid) S._addCon('pointOn', mp, arc);
    },
  },
  arct: {
    n: 2, hints: ['hint.arct', 'hint.arct_next'], kind: 'sk.kind.arc',
    first(S, s) { return tangentArcGeom(S, [s]) ? null : 'sk.arct_start'; },
    preview(S, pts, cur) {
      const g = tangentArcFrom(S, [pts[0], cur]); if (!g || g.bad) return { polys: [{ pts: [xy(pts[0]), [cur.x, cur.y]], dashed: true }], tip: '' };
      const a0 = Math.atan2(g.S[1] - g.c[1], g.S[0] - g.c[0]), a1 = Math.atan2(g.E[1] - g.c[1], g.E[0] - g.c[0]); const [s, e] = g.ccw ? [a0, a1] : [a1, a0]; const sw = G.wrap(e - s) || TAU;
      return { polys: [{ pts: arcPolyline(g.c, g.r, s, sw) }], tip: 'R ' + fmt(g.r) + '  ' + fmt(sw / DEG) + '°' };
    },
    valid(S, pts) { const g = tangentArcFrom(S, pts); return g && !g.bad ? null : 'sk.arct_bad'; },
    commit(S, pts) {
      const g = tangentArcFrom(S, pts); S._arctRev = false; const pa = pts[0].pid, pb = S._ptFor(pts[1]); S._lastPid = pb; const cp = S._newPt(g.c[0], g.c[1]);
      const arc = S._addEnt({ type: 'arc', c: cp, a: g.ccw ? pa : pb, b: g.ccw ? pb : pa }); S._addCon('tangent', g.ent.id, arc);
    },
  },
  polygon: {
    n: 2, hints: ['hint.polygon', 'hint.polygon_next'], kind: 'sk.kind.polygon',
    preview(S, pts, cur) { const g = polyGeom(S, [pts[0], cur]); if (!g) return { polys: [], tip: '' }; return { polys: [{ pts: [...g.verts, g.verts[0]] }, { pts: arcPolyline(g.c, g.rho, 0, TAU), dashed: true }], tip: `${S.opts.polySides}  R ${fmt(g.R)} mm` }; },
    valid(S, pts) { return polyGeom(S, pts) ? null : 'sk.radius_zero'; },
    commit(S, pts) {
      const g = polyGeom(S, pts); const cp = S._ptFor(pts[0]); const V = g.verts.map((v) => S._newPt(v[0], v[1]));
      const guide = S._addEntCons({ type: 'circle', c: cp, r: g.rho }); const ls = V.map((p, i) => S._addEnt({ type: 'line', a: p, b: V[(i + 1) % V.length] }));
      for (let i = 1; i < ls.length; i++) S._addCon('equal', ls[0], ls[i]);
      if (S.opts.polyCircum) ls.forEach((l) => S._addCon('tangent', l, guide)); else V.forEach((p) => S._addCon('pointOn', p, guide));
    },
  },
  slot: {
    n: 3, hints: ['hint.slot', 'hint.slot_b', 'hint.slot_c'], kind: 'sk.kind.slot',
    preview(S, pts, cur) {
      if (pts.length === 1) return { polys: [{ pts: [xy(pts[0]), [cur.x, cur.y]], dashed: true }], tip: fmt(G.dist(xy(pts[0]), [cur.x, cur.y])) + ' mm' };
      const g = slotGeom([pts[0], pts[1], cur]); if (!g || !(g.r > 1e-9)) return { polys: [{ pts: [xy(pts[0]), xy(pts[1])], dashed: true }], tip: '' };
      const a1 = Math.atan2(g.n[1], g.n[0]); const p = [...arcPolyline(g.c1, g.r, a1, Math.PI), ...arcPolyline(g.c2, g.r, a1 + Math.PI, Math.PI)]; p.push(p[0]);
      return { polys: [{ pts: p }], tip: `${t('sk.slot_w')} ${fmt(2 * g.r)}  ${t('sk.slot_l')} ${fmt(G.dist(g.c1, g.c2))} mm` };
    },
    valid(S, pts) { return slotGeom(pts) ? null : 'sk.radius_zero'; },
    commit(S, pts) {
      const g = slotGeom(pts); const c1 = S._ptFor(pts[0]), c2 = S._ptFor(pts[1]); const at = (c, k, s) => S._newPt(c[0] + g.n[0] * g.r * s + g.d[0] * g.r * k, c[1] + g.n[1] * g.r * s + g.d[1] * g.r * k);
      const t1 = at(g.c1, 0, 1), b1 = at(g.c1, 0, -1), t2 = at(g.c2, 0, 1), b2 = at(g.c2, 0, -1);
      S._addEntCons({ type: 'line', a: c1, b: c2 });
      const A1 = S._addEnt({ type: 'arc', c: c1, a: t1, b: b1 }), A2 = S._addEnt({ type: 'arc', c: c2, a: b2, b: t2 });
      const lt = S._addEnt({ type: 'line', a: t1, b: t2 }), lb = S._addEnt({ type: 'line', a: b1, b: b2 });
      S._addCon('tangent', lt, A1); S._addCon('tangent', lt, A2); S._addCon('tangent', lb, A1); S._addCon('tangent', lb, A2); S._addCon('equal', A1, A2);
    },
  },
  ellipse: {
    n: 3, hints: ['hint.ellipse', 'hint.ellipse_b', 'hint.ellipse_c'], kind: 'sk.kind.ellipse',
    preview(S, pts, cur) {
      if (pts.length === 1) return { polys: [{ pts: [xy(pts[0]), [cur.x, cur.y]], dashed: true }], tip: fmt(G.dist(xy(pts[0]), [cur.x, cur.y])) + ' mm' };
      const g = ellipseGeomFrom([pts[0], pts[1], cur]); if (!g || !(g.ry > 1e-9)) return { polys: [{ pts: [xy(pts[0]), xy(pts[1])], dashed: true }], tip: '' };
      return { polys: [{ pts: G.sample(G.mkEllipse(g.c, g.rx, g.ry, g.rot), 0.02) }], tip: `${fmt(g.rx)} × ${fmt(g.ry)} mm` };
    },
    valid(S, pts) { return ellipseGeomFrom(pts) ? null : 'sk.radius_zero'; },
    commit(S, pts) {
      const g = ellipseGeomFrom(pts); const cp = S._ptFor(pts[0]); const fp = S._newPt(g.f[0], g.f[1]);
      S._addEnt({ type: 'ellipse', c: cp, f: fp, rmin: g.ry });
    },
  },
};
export const DRAW_TOOLS = Object.keys(DEFS).concat(['spline']);
