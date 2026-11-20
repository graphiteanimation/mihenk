// GeomSel cozumu (saf): sketch bolgesi ve silhouette -> camFaceLoops benzeri "yuz" nesnesi
// { z, normalOk:true, outer:[geom2d+fwd], inners:[[geom2d+fwd]], open:false, src } (setup uzayi).
import { cerr } from './err.js';
import * as P from './path2d.js';
import * as G from '../../shared/geom2d.js';
import { findRegions, resolveProfiles } from '../../shared/profiles.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// path2d yonlu dongu -> cekirdek ogeleri (geom2d kanonik + fwd)
export function toItems(loop) {
  return loop.map((s) => {
    if (s.k === 'L') return { ...G.mkLine(s.a, s.b), fwd: true, open: false };
    return s.sw > 0 ? { ...G.mkArc(s.c, s.r, s.a0, s.sw), fwd: true, open: false } : { ...G.mkArc(s.c, s.r, s.a0 + s.sw, -s.sw), fwd: false, open: false };
  });
}
const wrapPos = (x) => { x %= 2 * Math.PI; return x < 0 ? x + 2 * Math.PI : x; };
// profiles.js dongu ogesi (yonlu) -> path2d parcalari (sketch 2B)
function itemSegs(it) {
  if (it.type === 'line') return [P.line(it.p0, it.p1)];
  if (it.type === 'arc') {
    const a0 = Math.atan2(it.p0[1] - it.c[1], it.p0[0] - it.c[0]), a1 = Math.atan2(it.p1[1] - it.c[1], it.p1[0] - it.c[0]);
    let sw = wrapPos(it.ccw ? a1 - a0 : a0 - a1); if (sw < 1e-12) sw = 2 * Math.PI; sw = it.ccw ? sw : -sw;
    const parts = Math.abs(sw) > Math.PI + 1e-12 ? [[a0, sw / 2], [a0 + sw / 2, sw / 2]] : [[a0, sw]];
    return parts.map(([s0, w]) => P.arc(it.c, it.r, s0, w));
  }
  if (it.type === 'circle') return P.circle(it.c, it.r, true);
  throw cerr('cam.geom.unsupported_curve', { type: String(it.type) });
}
// sketch 2B -> setup 2B (dik duzlemde rijit donusum; normal -Z ise ayna)
function mapLoop(segs, T, mirror) {
  return segs.map((s) => {
    if (s.k === 'L') return P.line(T(s.a), T(s.b));
    const c = T(s.c), a = T(s.a), b = T(s.b); const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
    return P.arc(c, s.r, a0, mirror ? -s.sw : s.sw, null, a, b);
  });
}

// sketchFaces(sel, sketchFeature, plane, frame) -> [yuz]  (her secili bolge bir yuz; delikler = adalar/ic donguler)
export function sketchFaces(sel, sk, plane, frame) {
  if (!sk || !Array.isArray(sk.ents) || !sk.points) throw cerr('cam.geom.sketch_missing', { sketch: String(sel.sketch) });
  if (!plane || !Array.isArray(plane.n)) throw cerr('cam.geom.sketch_missing', { sketch: String(sel.sketch) });
  const k = dot(plane.n, frame.z);
  if (Math.abs(Math.abs(k) - 1) > 1e-7) throw cerr('cam.geom.sketch_not_perpendicular');
  const T3 = (u, v) => [plane.o[0] + plane.x[0] * u + plane.y[0] * v, plane.o[1] + plane.x[1] * u + plane.y[1] * v, plane.o[2] + plane.x[2] * u + plane.y[2] * v];
  const toS = (p) => { const d = [p[0] - frame.o[0], p[1] - frame.o[1], p[2] - frame.o[2]]; return [dot(d, frame.x), dot(d, frame.y), dot(d, frame.z)]; };
  const z = toS(T3(0, 0))[2];
  const T = (p) => { const q = toS(T3(p[0], p[1])); return [q[0], q[1]]; };
  const mirror = k < 0;
  const { regions } = findRegions({ points: sk.points, ents: sk.ents });
  const { idx, errs } = resolveProfiles(regions, sel.profiles ?? 'all');
  if (errs.length) throw cerr('cam.geom.sketch_profile_lost', { n: errs.length });
  if (!idx.length) throw cerr('cam.geom.sketch_no_profile');
  return idx.map((i) => {
    const r = regions[i];
    const norm = (segs) => { const l = mapLoop(segs, T, mirror); if (!P.isClosedLoop(l, 1e-6)) throw cerr('cam.geom.loop_open'); return l; };
    let outer = norm(r.loop.flatMap(itemSegs)); if (P.area(outer) < 0) outer = P.reverseLoop(outer);
    const inners = r.holes.map((h) => { let l = norm(h.loop.flatMap(itemSegs)); if (P.area(l) > 0) l = P.reverseLoop(l); return toItems(l); });
    return { z, normalOk: true, outer: toItems(outer), inners, open: false, above: null, src: 'sketch' };
  });
}

// silhouette(zl, sections) -> yuz (dis sinir, z = govde tabani)
//   zl: camZLevels sonucu; sections: seviyeler arasi orta z'lerdeki camSection sonuclari
//   Prizmatik olmayan yuzler (ornegin delik ucu konisi) yalniz XY kutulari dis sinirin KESIN icindeyse kabul edilir:
//   boyle bir yuz dis siniri (kesitlerin birlesimini) genisletemez.
export function silhouetteFace(zl, sections) {
  if (zl.levels.length < 2 || !sections.length) throw cerr('cam.silhouette.not_prismatic', { n: 0 });
  const outs = [];
  for (const sec of sections) {
    const loops = sec.loops.map((l) => P.closeItemLoop(l).flatMap((it) => P.fromGeom2d(it, it.fwd !== false))); // T-24: zincir acikliklari kapatilir
    const o = loops.filter((l) => P.area(l) > 1e-9);
    // her kesitte tek dis sinir ve o sinirin icinde olmayan baska dis halka olmamali
    const regs = P.regionsFromLoops(loops);
    const top = regs.filter((g) => !regs.some((h) => h !== g && P.inRegion(P.probePoint(g.outer), { outer: h.outer, holes: [] })));
    if (top.length !== 1) throw cerr('cam.silhouette.multiple', { n: top.length, z: Math.round(sec.z * 1000) / 1000 });
    void o; outs.push(top[0].outer);
  }
  let big = outs[0]; for (const l of outs) if (P.area(l) > P.area(big)) big = l;
  const R = { outer: big, holes: [] };
  for (const l of outs) for (const s of l) for (const t of [0, 0.5]) { const p = P.pointAt(s, t); if (!P.inRegion(p, R) && P.distTo(p, big) > 1e-6) throw cerr('cam.silhouette.not_nested'); }
  for (const b of zl.badBoxes || (zl.bad ? [null] : [])) {
    if (!b) throw cerr('cam.silhouette.not_prismatic', { n: zl.bad });
    const cs = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
    const edges = cs.map((c, i) => P.line(c, cs[(i + 1) % 4]));
    const inside = cs.every((c) => P.inRegion(c, R)) && !edges.some((e) => big.some((s) => P.intersect(e, s, 1e-9).length));
    if (!inside) throw cerr('cam.silhouette.not_prismatic', { n: zl.bad });
  }
  return { z: zl.levels[0], normalOk: true, outer: toItems(P.mergeLoop(big)), inners: [], open: false, above: null, src: 'silhouette' };
}
export const midLevels = (levels) => { const out = []; for (let i = 1; i < levels.length; i++) out.push((levels[i - 1] + levels[i]) / 2); return out; };
