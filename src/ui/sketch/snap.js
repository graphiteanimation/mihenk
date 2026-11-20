// Yakalama: uç/merkez/orijin noktaları, kesişim, orta nokta, teğet, dik, nesne üstü, ızgara.
import { G, entPts, segOf, getEnt } from './core.js';
import { arcGeom, ellipseGeom } from '../../shared/profiles.js';
import { SKO, snapOn } from './opts.js';

const SNAP_PX = 8;
export const SNAP_LABEL = { align: 'snap.align', quad: 'snap.quad', end: 'snap.end', center: 'snap.center', origin: 'snap.origin', mid: 'snap.mid', int: 'snap.int', tan: 'snap.tan', perp: 'snap.perp', ent: 'snap.on', grid: 'snap.grid' };

// S: Sketcher; loc: [u,v]; ev: fare olayı; from: [x,y] (çizgi başlangıcı: teğet/dik hesabı için) ya da null
export function snapAt(S, loc, ev, from) {
  const sk = S.sk, tol = SNAP_PX * S.vp.worldPerPixel();
  // 1) mevcut noktalar (kapatılan türler atlanır)
  let best = null;
  const ptKind = (id) => (id === 'O' ? 'origin' : sk.ents.some((e) => (e.type === 'circle' || e.type === 'arc' || e.type === 'ellipse' || e.type === 'ellarc') && e.c === id) ? 'center' : 'end');
  for (const [id, p] of Object.entries(sk.points)) { const d = Math.hypot(p.x - loc[0], p.y - loc[1]); if (d <= tol && (!best || d < best.d) && snapOn(ptKind(id))) best = { id, d }; }
  if (best) { const id = best.id, p = sk.points[id]; return { x: p.x, y: p.y, pid: id, kind: ptKind(id) }; }
  // yakındaki varlıklar
  const near = [];
  for (const e of sk.ents) { if (e.type === 'point') continue; const r = S._entDist(e, loc); if (r && r.d <= tol * 1.5) near.push({ e, r }); }
  // 2) kesişim
  if (near.length >= 2 && snapOn('int')) {
    let bi = null;
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
      const a = segOf(sk, near[i].e), b = segOf(sk, near[j].e); if (!a || !b) continue;
      let r; try { r = G.intersect(a, b); } catch (err) { continue; }
      for (const h of r.pts) { const d = G.dist(h.p, loc); if (d <= tol * 1.2 && (!bi || d < bi.d)) bi = { d, p: h.p, ents: [near[i].e.id, near[j].e.id] }; }
    }
    if (bi) return { x: bi.p[0], y: bi.p[1], kind: 'int', ents: bi.ents, ent: bi.ents[0] };
  }
  // 3) teğet / dik (başlangıç noktası varsa)
  if (from && (snapOn('tan') || snapOn('perp'))) {
    for (const { e } of near) {
      const sg = segOf(sk, e); if (!sg) continue;
      if ((e.type === 'circle' || e.type === 'arc') && snapOn('tan')) {
        for (const tp of G.tangentPoints(from, sg.c, sg.r)) { if (G.dist(tp, loc) <= tol * 1.2 && G.dist(tp, from) > 1e-6) { const cp = G.closestPoint(sg, tp); if (cp.d < 1e-6) return { x: tp[0], y: tp[1], kind: 'tan', ent: e.id }; } }
      } else if (e.type === 'line' && snapOn('perp')) {
        const cp = G.closestPoint(G.mkLine(sg.p0, sg.p1), from); const q = cp.p;
        if (G.dist(q, loc) <= tol * 1.2 && G.dist(q, from) > 1e-6 && cp.u > 1e-9 && cp.u < 1 - 1e-9) return { x: q[0], y: q[1], kind: 'perp', ent: e.id };
      }
    }
  }
  // 3b) çeyrek nokta (daire/yay/elips: eksen yönündeki 4 nokta)
  if (snapOn('quad')) {
    for (const { e } of near) {
      const q = quadPts(sk, e); let bq = null;
      for (const c of q) { const d = G.dist(c.p, loc); if (d <= tol && (!bq || d < bq.d)) bq = { d, c }; }
      if (bq) return { x: bq.c.p[0], y: bq.c.p[1], kind: 'quad', ent: e.id, qi: bq.c.i };
    }
  }
  // 4) orta nokta
  if (snapOn('mid')) {
    for (const { e } of near) {
      const sg = segOf(sk, e); if (!sg) continue; let m = null;
      if (e.type === 'line') m = [(sg.p0[0] + sg.p1[0]) / 2, (sg.p0[1] + sg.p1[1]) / 2]; else if (e.type === 'arc') m = G.ptAt(sg, sg.sweep / 2);
      if (m && G.dist(m, loc) <= tol) return { x: m[0], y: m[1], kind: 'mid', ent: e.id };
    }
  }
  // 5) nesne üstü
  if (near.length && snapOn('ent')) { near.sort((a, b) => a.r.d - b.r.d); const n = near[0]; return { x: n.r.x, y: n.r.y, ent: n.e.id, kind: 'ent' }; }
  if (ev && ev.ctrlKey) return { x: loc[0], y: loc[1], kind: 'free' };
  // 6) hizalama (çıkarım): mevcut noktalarla yatay/dikey hiza; kesikli iz çizilir
  const gridOn = snapOn('grid');
  if (snapOn('align')) { const a = alignSnap(sk, loc, tol, gridOn); if (a) return a; }
  if (!gridOn) return { x: loc[0], y: loc[1], kind: 'free' };
  const g = SKO.grid, rg = (v) => (g === 1 ? Math.round(v) : Math.round(Math.round(v / g) * g * 1e9) / 1e9);
  return { x: rg(loc[0]), y: rg(loc[1]), grid: true, kind: 'grid' };
}

// Çeyrek noktalar: [{p:[x,y], i:0..3}] (0:+x 1:+y 2:-x 3:-y; elipste asal eksenler). Yayda yalnız süpürme içindekiler.
export function quadPts(sk, e) {
  const P = sk.points, out = [];
  if (e.type === 'circle' && P[e.c]) { const c = P[e.c]; for (let i = 0; i < 4; i++) out.push({ i, p: [c.x + e.r * Math.cos(i * Math.PI / 2), c.y + e.r * Math.sin(i * Math.PI / 2)].map((v) => Math.round(v * 1e12) / 1e12) }); }
  else if (e.type === 'arc' && P[e.a] && P[e.b] && P[e.c]) {
    const g = arcGeom(sk, e); const TAU = Math.PI * 2;
    for (let i = 0; i < 4; i++) { const ang = i * Math.PI / 2; let d = (ang - g.a0) % TAU; if (d < 0) d += TAU; if (d > 1e-9 && d < g.sweep - 1e-9) out.push({ i, p: [g.c.x + g.r * Math.cos(ang), g.c.y + g.r * Math.sin(ang)].map((v) => Math.round(v * 1e12) / 1e12) }); }
  } else if (e.type === 'ellipse' && P[e.c] && P[e.f]) {
    const g = ellipseGeom(sk, e), cr = Math.cos(g.rot), sr = Math.sin(g.rot);
    [[g.rx, 0], [0, g.ry], [-g.rx, 0], [0, -g.ry]].forEach(([u, v], i) => out.push({ i, p: [g.c[0] + u * cr - v * sr, g.c[1] + u * sr + v * cr] }));
  }
  return out;
}

// Hizalama: x ya da y değeri mevcut bir noktayla (en fazla tol) çakışıyorsa o değere oturur. Döner {x,y,kind:'align',refs:[[x,y],...]} ya da null
export function alignSnap(sk, loc, tol, gridOn) {
  let vx = null, hy = null;
  for (const [id, p] of Object.entries(sk.points)) {
    const dx = Math.abs(p.x - loc[0]), dy = Math.abs(p.y - loc[1]);
    if (dx <= tol && (!vx || dx < vx.d)) vx = { d: dx, p, id };
    if (dy <= tol && (!hy || dy < hy.d)) hy = { d: dy, p, id };
  }
  if (!vx && !hy) return null;
  const g = SKO.grid, rg = (v) => (g === 1 ? Math.round(v) : Math.round(Math.round(v / g) * g * 1e9) / 1e9);
  const x = vx ? vx.p.x : gridOn ? rg(loc[0]) : loc[0], y = hy ? hy.p.y : gridOn ? rg(loc[1]) : loc[1];
  const refs = []; if (vx) refs.push({ id: vx.id, p: [vx.p.x, vx.p.y], axis: 'v' }); if (hy) refs.push({ id: hy.id, p: [hy.p.x, hy.p.y], axis: 'h' });
  return { x, y, kind: 'align', refs, alignV: !!vx, alignH: !!hy };
}
