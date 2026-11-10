// Sketch modeli yardımcıları (saf; DOM yok). sk = {points:{id:{x,y,fixed?}}, ents:[], cons:[]}
import * as G from '../../shared/geom2d.js';
import { entSeg, ellipseGeom } from '../../shared/profiles.js';

export const TAU = Math.PI * 2;
export const DIM_TYPES = new Set(['dist', 'hdist', 'vdist', 'pldist', 'lldist', 'ccdist', 'radius', 'diameter', 'radiusdiff', 'angle']);
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const entPts = (e) => (e.type === 'line' ? [e.a, e.b] : e.type === 'circle' ? [e.c] : e.type === 'arc' ? [e.c, e.a, e.b] : e.type === 'point' ? [e.p]
  : e.type === 'ellipse' ? [e.c, e.f] : e.type === 'ellarc' ? [e.c, e.f, e.a, e.b] : e.type === 'spline' ? [...(e.pts || [])] : []);
export const conRefs = (c) => [c.a, c.b, c.c].filter(Boolean);
export const isCurve = (e) => e && e.type !== 'point';
export const segOf = (sk, e) => entSeg(sk, e);
export const getEnt = (sk, id) => sk.ents.find((e) => e.id === id);
export const P2 = (sk, id) => [sk.points[id].x, sk.points[id].y];

// Kalıcı artan sayaç (sk.seq): silinen bir kimlik asla yeni nesneye verilmez (adlandırma/profil seçimi buna dayanır).
const suffixOf = (id) => { const m = /(\d+)(?:_[a-z]+)?$/.exec(String(id)); return m ? +m[1] : 0; };
export function seqOf(sk) {
  if (!Number.isFinite(sk.seq)) { let m = 0; for (const id of Object.keys(sk.points)) m = Math.max(m, suffixOf(id)); for (const e of sk.ents) m = Math.max(m, suffixOf(e.id)); for (const c of sk.cons) m = Math.max(m, suffixOf(c.id)); sk.seq = m; }
  return sk.seq;
}
export function newId(sk, prefix) {
  seqOf(sk);
  const used = (id) => id in sk.points || sk.ents.some((e) => e.id === id) || sk.cons.some((c) => c.id === id);
  let id; do { id = prefix + (++sk.seq); } while (used(id) || used(id + '_b') || used(id + '_c') || used(id + '_rules'));
  return id;
}
const PREFIX = { line: 'l', circle: 'c', arc: 'a', point: 'n', ellipse: 'e', ellarc: 'ea', spline: 's' };
export function addPoint(sk, x, y, fixed) { const id = newId(sk, 'p'); sk.points[id] = { x, y }; if (fixed) sk.points[id].fixed = true; return id; }
export function addEnt(sk, ent) { const id = newId(sk, PREFIX[ent.type] || 'x'); const e = { id, ...ent }; sk.ents.push(e); return id; }
export function addCon(sk, type, a, b, extra = {}) { const id = newId(sk, DIM_TYPES.has(type) ? 'd' : 'k'); const c = { id, type }; if (a !== undefined) c.a = a; if (b !== undefined) c.b = b; Object.assign(c, extra); sk.cons.push(c); return id; }

export function usersOf(sk, pid) { return sk.ents.filter((e) => entPts(e).includes(pid)); }
// referansı kalmayan kısıtları, kullanılmayan noktaları temizler. Döner: silinen kısıt sayısı
export function cleanup(sk, extraKeep = new Set()) {
  const used = new Set(['O', ...extraKeep]); for (const e of sk.ents) entPts(e).forEach((p) => used.add(p));
  for (const id of Object.keys(sk.points)) if (!used.has(id)) delete sk.points[id];
  const ids = new Set([...sk.ents.map((e) => e.id), ...Object.keys(sk.points)]);
  const before = sk.cons.length;
  sk.cons = sk.cons.filter((c) => conRefs(c).every((r) => ids.has(r)));
  const removed = before - sk.cons.length;
  // uç noktası zaten o nesnenin ucu olan "nokta üstünde" kısıtı yapısal olarak sağlanır; kalırsa fazlalık (redundant) olur
  const endOf = (id) => { const e = sk.ents.find((x) => x.id === id); return e && (e.type === 'line' || e.type === 'arc' || e.type === 'ellarc') ? [e.a, e.b] : []; };
  sk.cons = sk.cons.filter((c) => !(c.type === 'pointOn' && endOf(c.b).includes(c.a)));
  return removed;
}
export function deleteItems(sk, items) {
  const delEnts = new Set(), delPts = new Set();
  for (const i of items) { if (i.kind === 'ent') delEnts.add(i.id); else if (i.id !== 'O') delPts.add(i.id); }
  for (const e of sk.ents) if (entPts(e).some((p) => delPts.has(p))) delEnts.add(e.id);
  const cand = new Set(delPts); for (const e of sk.ents) if (delEnts.has(e.id)) entPts(e).forEach((p) => cand.add(p));
  sk.ents = sk.ents.filter((e) => !delEnts.has(e.id));
  const used = new Set(); for (const e of sk.ents) entPts(e).forEach((p) => used.add(p));
  const gone = new Set([...delEnts]);
  for (const p of cand) if (p !== 'O' && !used.has(p)) { delete sk.points[p]; gone.add(p); }
  sk.cons = sk.cons.filter((c) => !conRefs(c).some((r) => gone.has(r)));
}
// bir noktanın (x,y) konumundaki mevcut noktayı bul (tolerans)
export function findPointAt(sk, p, tol = 1e-6, except = null) {
  for (const [id, q] of Object.entries(sk.points)) if (id !== except && Math.hypot(q.x - p[0], q.y - p[1]) <= tol) return id;
  return null;
}

// ölçü (kısıt) için güncel geometrik değer (referans ölçüler ve etiketler için)
export function measureDim(sk, c) {
  const P = (id) => sk.points[id], E = (id) => getEnt(sk, id);
  const center = (e) => P(e.c);
  try {
    switch (c.type) {
      case 'dist': return Math.hypot(P(c.a).x - P(c.b).x, P(c.a).y - P(c.b).y);
      case 'hdist': return P(c.b).x - P(c.a).x;
      case 'vdist': return P(c.b).y - P(c.a).y;
      case 'pldist': { const l = E(c.b), p = P(c.a), a = P(l.a), b = P(l.b); const dx = b.x - a.x, dy = b.y - a.y; return Math.abs(((p.x - a.x) * dy - (p.y - a.y) * dx) / (Math.hypot(dx, dy) || 1)); }
      case 'lldist': { const l1 = E(c.a), l2 = E(c.b); const p1 = P(l1.a), p2 = P(l1.b), a = P(l2.a), b = P(l2.b); const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; const d = (p) => Math.abs(((p.x - a.x) * dy - (p.y - a.y) * dx) / L); return (d(p1) + d(p2)) / 2; }
      case 'ccdist': { const a = center(E(c.a)), b = center(E(c.b)); return Math.hypot(a.x - b.x, a.y - b.y); }
      case 'radius': { const e = E(c.a); if (e.type === 'circle') return e.r; if (e.type === 'arc') return Math.hypot(P(e.a).x - P(e.c).x, P(e.a).y - P(e.c).y); if (e.type === 'ellipse' || e.type === 'ellarc') return Math.abs(e.rmin); return NaN; }
      case 'diameter': { const e = E(c.a); return 2 * (e.type === 'circle' ? e.r : Math.hypot(P(e.a).x - P(e.c).x, P(e.a).y - P(e.c).y)); }
      case 'radiusdiff': { const r = (e) => (e.type === 'circle' ? e.r : Math.hypot(P(e.a).x - P(e.c).x, P(e.a).y - P(e.c).y)); return r(E(c.b)) - r(E(c.a)); }
      case 'angle': { const a = E(c.a), b = E(c.b); const ang = (l) => Math.atan2(P(l.b).y - P(l.a).y, P(l.b).x - P(l.a).x); let v = ((ang(b) - ang(a)) * 180) / Math.PI; v %= 360; if (v < 0) v += 360; return v; }
    }
  } catch (e) { /* eksik başvuru */ }
  return NaN;
}
export { G, entSeg, ellipseGeom };
