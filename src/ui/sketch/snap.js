// Yakalama: uç/merkez/orijin noktaları, kesişim, orta nokta, teğet, dik, nesne üstü, ızgara.
import { G, entPts, segOf, getEnt } from './core.js';

const SNAP_PX = 8;
export const SNAP_LABEL = { end: 'snap.end', center: 'snap.center', origin: 'snap.origin', mid: 'snap.mid', int: 'snap.int', tan: 'snap.tan', perp: 'snap.perp', ent: 'snap.on', grid: 'snap.grid' };

// S: Sketcher; loc: [u,v]; ev: fare olayı; from: [x,y] (çizgi başlangıcı: teğet/dik hesabı için) ya da null
export function snapAt(S, loc, ev, from) {
  const sk = S.sk, tol = SNAP_PX * S.vp.worldPerPixel();
  // 1) mevcut noktalar
  let best = null;
  for (const [id, p] of Object.entries(sk.points)) { const d = Math.hypot(p.x - loc[0], p.y - loc[1]); if (d <= tol && (!best || d < best.d)) best = { id, d }; }
  if (best) { const id = best.id, p = sk.points[id]; const isC = sk.ents.some((e) => (e.type === 'circle' || e.type === 'arc' || e.type === 'ellipse' || e.type === 'ellarc') && e.c === id); return { x: p.x, y: p.y, pid: id, kind: id === 'O' ? 'origin' : isC ? 'center' : 'end' }; }
  // yakındaki varlıklar
  const near = [];
  for (const e of sk.ents) { if (e.type === 'point') continue; const r = S._entDist(e, loc); if (r && r.d <= tol * 1.5) near.push({ e, r }); }
  // 2) kesişim
  if (near.length >= 2) {
    let bi = null;
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
      const a = segOf(sk, near[i].e), b = segOf(sk, near[j].e); if (!a || !b) continue;
      let r; try { r = G.intersect(a, b); } catch (err) { continue; }
      for (const h of r.pts) { const d = G.dist(h.p, loc); if (d <= tol * 1.2 && (!bi || d < bi.d)) bi = { d, p: h.p, ents: [near[i].e.id, near[j].e.id] }; }
    }
    if (bi) return { x: bi.p[0], y: bi.p[1], kind: 'int', ents: bi.ents, ent: bi.ents[0] };
  }
  // 3) teğet / dik (başlangıç noktası varsa)
  if (from) {
    for (const { e } of near) {
      const sg = segOf(sk, e); if (!sg) continue;
      if (e.type === 'circle' || e.type === 'arc') {
        for (const tp of G.tangentPoints(from, sg.c, sg.r)) { if (G.dist(tp, loc) <= tol * 1.2 && G.dist(tp, from) > 1e-6) { const cp = G.closestPoint(sg, tp); if (cp.d < 1e-6) return { x: tp[0], y: tp[1], kind: 'tan', ent: e.id }; } }
      } else if (e.type === 'line') {
        const cp = G.closestPoint(G.mkLine(sg.p0, sg.p1), from); const q = cp.p;
        if (G.dist(q, loc) <= tol * 1.2 && G.dist(q, from) > 1e-6 && cp.u > 1e-9 && cp.u < 1 - 1e-9) return { x: q[0], y: q[1], kind: 'perp', ent: e.id };
      }
    }
  }
  // 4) orta nokta
  for (const { e } of near) {
    const sg = segOf(sk, e); if (!sg) continue; let m = null;
    if (e.type === 'line') m = [(sg.p0[0] + sg.p1[0]) / 2, (sg.p0[1] + sg.p1[1]) / 2]; else if (e.type === 'arc') m = G.ptAt(sg, sg.sweep / 2);
    if (m && G.dist(m, loc) <= tol) return { x: m[0], y: m[1], kind: 'mid', ent: e.id };
  }
  // 5) nesne üstü
  if (near.length) { near.sort((a, b) => a.r.d - b.r.d); const n = near[0]; return { x: n.r.x, y: n.r.y, ent: n.e.id, kind: 'ent' }; }
  if (ev && ev.ctrlKey) return { x: loc[0], y: loc[1], kind: 'free' };
  return { x: Math.round(loc[0]), y: Math.round(loc[1]), grid: true, kind: 'grid' };
}
