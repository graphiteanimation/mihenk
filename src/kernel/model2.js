// WP-19: modelleme ikinci tur — sweep (yol boyunca tarama), loft, draft (koniklik), rib (kaburga), değişken yarıçaplı yuvarlatma,
// helis (coil) ve modellenmiş diş. İlke çekirdekle aynı: ya doğru sonuç ya açık hata ({code, params}); sessiz yaklaşıklama yok.
// Yüz adları (topolojik ad kökenleri) her işlemde yazılır: geçmişte ortadan düzenleme sonraki seçimleri koruyabilsin.
import * as R from 'replicad';
import { KErr, tk } from '../shared/errors.js';
import * as V from '../shared/vec.js';
import * as TP from './topo.js';
import { sketchFaces, matchSeg, MAX_COORD } from './sketch.js';
import { edgeName } from './naming.js';

const oc = () => R.getOC();
const OPS = new Set(['new', 'join', 'cut', 'intersect']);
const TAU = Math.PI * 2;
const isEmpty = (s) => { try { return !s || TP.topoOf(s).faces.size === 0; } catch (e) { return true; } };
const progress = (r) => r(new (oc().Message_ProgressRange)());
const P3 = (r, p) => r(new (oc().gp_Pnt)(p[0], p[1], p[2]));
const D3 = (r, d) => r(new (oc().gp_Dir)(d[0], d[1], d[2]));

export const M2_TYPES = ['sweep', 'loft', 'draft', 'rib', 'vfillet', 'thread', 'coil'];

export function runModel2(K, f, state, N, ctx) {
  switch (f.type) {
    case 'sweep': return sweep(K, f, state, N);
    case 'loft': return loft(K, f, state, N);
    case 'draft': return draft(K, f, state, N, ctx);
    case 'rib': return rib(K, f, state, N);
    case 'vfillet': return vfillet(K, f, state, N, ctx);
    case 'thread': return thread(K, f, state, N, ctx);
    case 'coil': return coil(K, f, state, N);
  }
  throw new KErr('feature.unknown', { type: String(f.type) });
}

// ------------------------------------------------------------------ eskizden yol (açık ya da kapalı tek zincir)
// Yapı çizgisi (cons) ve nokta varlıkları yok sayılır. Döner {wire, start, end, closed, edges:[{edge, ent}]}; zincir sırası yolun başından.
// near: dünya noktası; verilirse yolun bu noktaya yakın ucu baş olur.
function pathOf(S, near, code = 'sweep') {
  const P = S.sk.points; const segs = [];
  for (const e of S.sk.ents || []) {
    if (!e || e.cons || e.type === 'point') continue;
    if (e.type === 'line') { const a = P[e.a], b = P[e.b]; if (!a || !b) continue; segs.push({ ent: String(e.id), type: 'line', p0: [a.x, a.y], p1: [b.x, b.y] }); }
    else if (e.type === 'arc') {
      const c = P[e.c], a = P[e.a], b = P[e.b]; if (!c || !a || !b) continue;
      const r = Math.hypot(a.x - c.x, a.y - c.y); const a0 = Math.atan2(a.y - c.y, a.x - c.x); let sw = Math.atan2(b.y - c.y, b.x - c.x) - a0; while (sw <= 1e-12) sw += TAU; while (sw > TAU) sw -= TAU;
      const am = a0 + sw / 2; segs.push({ ent: String(e.id), type: 'arc', p0: [a.x, a.y], p1: [b.x, b.y], mid: [c.x + r * Math.cos(am), c.y + r * Math.sin(am)], r, c: [c.x, c.y] });
    } else if (e.type === 'circle') { const c = P[e.c]; if (!c) continue; const r = +e.r; segs.push({ ent: String(e.id), type: 'circle', c: [c.x, c.y], r }); }
    else if (e.type === 'spline') { const pts = (e.pts || []).map((id) => P[id]).filter(Boolean).map((p) => [p.x, p.y]); if (pts.length >= 2) segs.push({ ent: String(e.id), type: 'spline', pts, p0: pts[0], p1: pts[pts.length - 1], closed: !!e.closed }); }
    else throw new KErr(code + '.path_unsupported', { type: String(e.type) });
  }
  if (!segs.length) throw new KErr(code + '.path_empty');
  for (const s of segs) for (const p of [s.p0, s.p1, s.c, s.mid].filter(Boolean)) if (!(Math.abs(p[0]) <= MAX_COORD && Math.abs(p[1]) <= MAX_COORD)) throw new KErr('value.out_of_range', { field: 'ef.sketch', value: p[0], min: -MAX_COORD, max: MAX_COORD });
  const W = (p) => V.toWorld(S.plane, p[0], p[1]);
  let sc = 1; for (const s of segs) for (const p of [s.p0, s.p1, s.c].filter(Boolean)) sc = Math.max(sc, Math.abs(p[0]), Math.abs(p[1]));
  const eps = 1e-7 * sc; const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= eps;
  // kapalı tek varlık (daire / kapalı eğri)
  const closedOne = (s) => s.type === 'circle' || (s.type === 'spline' && s.closed);
  if (segs.some(closedOne)) {
    if (segs.length !== 1) throw new KErr(code + '.path_chain');
    const s = segs[0]; const edge = s.type === 'circle' ? R.makeCircle(s.r, W(s.c), S.plane.n) : splineEdge(s.pts.map(W), true);
    return { wire: R.assembleWire([edge]), closed: true, edges: [{ edge, ent: s.ent }], start: edge.startPoint.toTuple(), end: edge.startPoint.toTuple() };
  }
  // zincir: her uç en çok iki parçada buluşmalı, tek bileşen
  const nodes = []; const nodeOf = (p) => { let i = nodes.findIndex((q) => same(q.p, p)); if (i < 0) { nodes.push({ p, segs: [] }); i = nodes.length - 1; } return i; };
  segs.forEach((s, k) => { s.n0 = nodeOf(s.p0); s.n1 = nodeOf(s.p1); if (s.n0 === s.n1) throw new KErr(code + '.path_chain'); nodes[s.n0].segs.push(k); nodes[s.n1].segs.push(k); });
  if (nodes.some((n) => n.segs.length > 2)) throw new KErr(code + '.path_branch');
  const ends = nodes.map((n, i) => (n.segs.length === 1 ? i : -1)).filter((i) => i >= 0);
  const closed = ends.length === 0; if (!closed && ends.length !== 2) throw new KErr(code + '.path_chain');
  let startNode = closed ? segs[0].n0 : ends[0];
  if (!closed && near) { const d0 = V.dist(W(nodes[ends[0]].p), near), d1 = V.dist(W(nodes[ends[1]].p), near); if (d1 < d0 - eps) startNode = ends[1]; }
  const order = []; const used = new Set(); let cur = startNode;
  for (let guard = 0; guard < segs.length; guard++) {
    const k = nodes[cur].segs.find((x) => !used.has(x)); if (k == null) break;
    used.add(k); const s = segs[k]; const fwd = s.n0 === cur; order.push({ s, fwd }); cur = fwd ? s.n1 : s.n0;
  }
  if (used.size !== segs.length) throw new KErr(code + '.path_chain');
  const edges = order.map(({ s, fwd }) => {
    const a = fwd ? s.p0 : s.p1, b = fwd ? s.p1 : s.p0;
    let edge;
    if (s.type === 'line') edge = TP.makeLine(W(a), W(b));
    else if (s.type === 'arc') edge = TP.makeArc3(W(a), W(s.mid), W(b));
    else edge = splineEdge((fwd ? s.pts : s.pts.slice().reverse()).map(W), false);
    return { edge, ent: s.ent };
  });
  let wire; try { wire = R.assembleWire(edges.map((x) => x.edge)); } catch (e) { throw new KErr(code + '.path_chain'); }
  return { wire, closed, edges, start: W(nodes[startNode].p), end: W(nodes[cur].p) };
}
function splineEdge(pts, closed) {
  const O = oc(); const r = TP.scope();
  try {
    if (closed && pts.length > 2 && V.dist(pts[0], pts[pts.length - 1]) < 1e-9) pts = pts.slice(0, -1);
    const a1 = r(new O.NCollection_Array1_gp_Pnt(1, pts.length)); pts.forEach((p, i) => a1.SetValue(i + 1, P3(r, p)));
    const ip = r(new O.GeomAPI_Interpolate(r(new O.NCollection_HArray1_gp_Pnt(a1)), !!closed, 1e-9)); ip.Perform();
    if (!ip.IsDone()) throw new KErr('sketch.bad_segment', { type: 'spline' });
    return new R.Edge(r(new O.BRepBuilderAPI_MakeEdge(r(ip.Curve()))).Edge());
  } finally { r.done(); }
}

// ------------------------------------------------------------------ boru taraması (BRepOffsetAPI_MakePipeShell)
// wires: profil telleri (sırayla); mode: 'path' (düzeltilmiş Frenet: profil yola göre döner) | 'fixed' (profil yönü sabit) | 'frenet'
// | {binormal:[x,y,z]} (helis/diş: eksene göre sabit). Döner {shape, gen(edgeRaw)→[yüz dizini], first, last} ya da null.
function pipeShell(spine, wires, mode, solid = true, tol = 0) {
  const O = oc(); const r = TP.scope();
  try {
    const b = r(new O.BRepOffsetAPI_MakePipeShell(spine.wrapped));
    if (mode === 'fixed') b.SetMode(r(new O.gp_Ax2(P3(r, [0, 0, 0]), D3(r, [0, 0, 1]), D3(r, [1, 0, 0]))));
    else if (mode === 'frenet') b.SetMode(true);
    else if (mode && mode.binormal) b.SetMode(D3(r, mode.binormal));
    else b.SetMode(false);
    // helis taramalarında varsayılan yaklaşık yüzey toleransı (1e-4) uç düzlemleriyle boolean'da yanlış hacim veriyordu (M10: +%3,5); sıkı tolerans
    if (tol > 0) b.SetTolerance(tol, tol, 1e-3);
    for (const w of wires) b.Add(w.wrapped, false, false);
    b.Build(progress(r)); if (!b.IsDone()) return null;
    if (solid && !b.MakeSolid()) return null;
    const raw = b.Shape(); if (raw.IsNull()) { raw.delete(); return null; }
    const shape = TP.wrap(raw); const T = TP.topoOf(shape);
    const gen = (e) => { try { return TP.listArr(b.Generated(e)).map((g) => { const k = T.faces.find(g); g.delete(); return k; }).filter((k) => k >= 0); } catch (x) { return []; } };
    const cap = (fnm) => { try { const s = b[fnm](); const k = T.faces.find(s); s.delete(); return k; } catch (x) { return -1; } };
    // adlar Build'den hemen sonra okunur (kurucu silinmeden)
    const wiresEdges = wires.map((w) => { const ei = new TP.SubIndex(w.wrapped, 'edge'); const out = ei.list.map((e) => ({ e, faces: gen(e) })); return out; });
    const first = solid ? cap('FirstShape') : -1, last = solid ? cap('LastShape') : -1;
    return { shape, wiresEdges, first, last };
  } catch (e) { return null; } finally { r.done(); }
}
// profil telindeki kenarlar → kaynak eskiz varlığı (orta nokta eşlemesi)
const nameSides = (fn, wiresEdges, segs, sc, side) => { for (const we of wiresEdges) for (const { e, faces } of we) { const s = matchSeg(segs, TP.edgeMid(e), sc); if (!s || s.ent == null) continue; for (const k of faces) fn[k] = [side(s.ent)]; } };
const sketchScale = (S) => { let m = 1; for (const p of Object.values(S.sk.points || {})) if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) m = Math.max(m, Math.abs(p.x), Math.abs(p.y)); return m; };
const opOf = (f) => { const op = f.op ?? 'new'; if (!OPS.has(op)) throw new KErr('op.unknown', { op: String(op) }); return op; };
const finish = (K, f, state, parts, op) => { state.tools.set(f.id, { parts, op, targets: f.targets }); return K.applyOp(state, parts, op, { id: f.id, name: f.bodyName, targets: f.targets }); };

// ------------------------------------------------------------------ sweep
// f: {sketch (profil), profiles, path (yol eskizi), orient: 'path'|'fixed'|'frenet', op, targets}
function sweep(K, f, state) {
  const S = state.sketches.get(f.sketch); if (!S) throw new KErr('sketch.not_found');
  if (!f.path) throw new KErr('sweep.no_path'); if (f.path === f.sketch) throw new KErr('sweep.same_sketch');
  const SP = state.sketches.get(f.path); if (!SP) throw new KErr('sweep.no_path');
  const orient = f.orient ?? 'path'; if (!['path', 'fixed', 'frenet'].includes(orient)) throw new KErr('sweep.orient_unknown');
  const op = opOf(f);
  const regs = sketchFaces(S.sk, S.plane, f.profiles, 0); const sc = sketchScale(S);
  // yolun profile yakın ucu baş olur
  const ctr = regs[0].poly.reduce((a, p) => [a[0] + p[0] / regs[0].poly.length, a[1] + p[1] / regs[0].poly.length], [0, 0]);
  const path = pathOf(SP, V.toWorld(S.plane, ctr[0], ctr[1]), 'sweep');
  const multi = regs.length > 1;
  const parts = regs.map((rg) => {
    const suf = multi && rg.sig ? ':' + rg.sig : '';
    const wires = rg.loops.map((loop) => R.assembleWire(loop.map((s) => rg.segs.find((b) => b.s === s).edge)));
    const outer = pipeShell(path.wire, [wires[0]], orient); if (!outer || isEmpty(outer.shape)) throw new KErr('sweep.failed');
    const fn0 = Array.from({ length: TP.topoOf(outer.shape).faces.size }, () => []);
    if (outer.first >= 0) fn0[outer.first] = [`${f.id}:start${suf}`]; if (outer.last >= 0) fn0[outer.last] = [`${f.id}:end${suf}`];
    nameSides(fn0, outer.wiresEdges, rg.segs, sc, (ent) => `${f.id}:side:${ent}`);
    let part = { shape: outer.shape, fn: fn0 };
    if (wires.length > 1) {
      const holes = wires.slice(1).map((w) => { const h = pipeShell(path.wire, [w], orient); if (!h || isEmpty(h.shape)) throw new KErr('sweep.failed'); const fh = Array.from({ length: TP.topoOf(h.shape).faces.size }, () => []); nameSides(fh, h.wiresEdges, rg.segs, sc, (ent) => `${f.id}:side:${ent}`); return { shape: h.shape, fn: fh }; });
      const res = TP.boolean('cut', [part], holes); if (!res || isEmpty(res.shape)) throw new KErr('sweep.failed'); part = res;
    }
    const why = TP.validity(part.shape); if (why) throw new KErr('sweep.self_intersect', { reason: why });
    return part;
  });
  return finish(K, f, state, parts, op);
}

// ------------------------------------------------------------------ loft
// f: {sections:[eskiz kimliği, ...] (≥2, sırayla), ruled, rail (isteğe bağlı merkez çizgisi eskizi), op, targets}
// Kesit eskizi tek kapalı bölge (deliksiz) ya da tek nokta (uçta sivrilme) olabilir.
function loft(K, f, state) {
  const ids = Array.isArray(f.sections) ? f.sections.filter((x) => typeof x === 'string' && x) : [];
  if (ids.length < 2) throw new KErr('loft.min_sections');
  if (new Set(ids).size !== ids.length) throw new KErr('loft.same_sketch');
  const op = opOf(f);
  const secs = ids.map((id, k) => {
    const S = state.sketches.get(id); if (!S) throw new KErr('loft.section_missing', { n: k + 1 });
    const geo = (S.sk.ents || []).filter((e) => e && !e.cons && e.type !== 'point');
    if (!geo.length) {
      const pts = (S.sk.ents || []).filter((e) => e && e.type === 'point' && S.sk.points[e.p]);
      if (pts.length !== 1 || (k !== 0 && k !== ids.length - 1)) throw new KErr('loft.section_empty', { n: k + 1 });
      const p = S.sk.points[pts[0].p]; return { vertex: V.toWorld(S.plane, p.x, p.y) };
    }
    const regs = sketchFaces(S.sk, S.plane, 'all', 0);
    if (regs.length !== 1) throw new KErr('loft.section_regions', { n: k + 1, count: regs.length });
    if (regs[0].loops.length > 1) throw new KErr('loft.section_holes', { n: k + 1 });
    const rg = regs[0]; const wire = R.assembleWire(rg.segs.map((b) => b.edge));
    return { S, rg, wire, sc: sketchScale(S) };
  });
  if (secs.filter((s) => s.wire).length < 2 && !(secs.filter((s) => s.wire).length === 1 && secs.some((s) => s.vertex))) throw new KErr('loft.min_sections');
  let shape, fn;
  const firstW = secs.find((s) => s.wire);
  if (f.rail) {
    const SR = state.sketches.get(f.rail); if (!SR) throw new KErr('loft.rail_missing');
    if (secs.some((s) => s.vertex)) throw new KErr('loft.rail_point');
    const c0 = firstW.rg.poly.reduce((a, p) => [a[0] + p[0] / firstW.rg.poly.length, a[1] + p[1] / firstW.rg.poly.length], [0, 0]);
    const path = pathOf(SR, V.toWorld(firstW.S.plane, c0[0], c0[1]), 'loft');
    const res = pipeShell(path.wire, secs.map((s) => s.wire), 'path'); if (!res || isEmpty(res.shape)) throw new KErr('loft.failed');
    shape = res.shape; fn = Array.from({ length: TP.topoOf(shape).faces.size }, () => []);
    if (res.first >= 0) fn[res.first] = [`${f.id}:start`]; if (res.last >= 0) fn[res.last] = [`${f.id}:end`];
    nameSides(fn, [res.wiresEdges[0]], firstW.rg.segs, firstW.sc, (ent) => `${f.id}:side:${ent}`);
  } else {
    const O = oc(); const r = TP.scope();
    try {
      const b = r(new O.BRepOffsetAPI_ThruSections(true, !!f.ruled, 1e-6));
      for (const s of secs) { if (s.vertex) b.AddVertex(r(new O.BRepBuilderAPI_MakeVertex(P3(r, s.vertex))).Vertex()); else b.AddWire(s.wire.wrapped); }
      b.Build(progress(r)); if (!b.IsDone()) throw new KErr('loft.failed');
      const raw = b.Shape(); if (raw.IsNull()) { raw.delete(); throw new KErr('loft.failed'); }
      shape = TP.wrap(raw); const T = TP.topoOf(shape); fn = Array.from({ length: T.faces.size }, () => []);
      const cap = (nm) => { try { const s = b[nm](); const k = s.ShapeType() === O.TopAbs_ShapeEnum.TopAbs_FACE ? T.faces.find(s) : -1; s.delete(); return k; } catch (e) { return -1; } };
      const fi = cap('FirstShape'), la = cap('LastShape');
      if (fi >= 0) fn[fi] = [`${f.id}:start`]; if (la >= 0) fn[la] = [`${f.id}:end`];
      const ei = new TP.SubIndex(firstW.wire.wrapped, 'edge');
      for (const e of ei.list) { let k = -1; try { const g = b.GeneratedFace(e); k = T.faces.find(g); g.delete(); } catch (x) { k = -1; } if (k < 0) continue; const s = matchSeg(firstW.rg.segs, TP.edgeMid(e), firstW.sc); if (s && s.ent != null) fn[k] = [`${f.id}:side:${s.ent}`]; }
      ei.list.forEach((x) => x.delete());
    } catch (e) { if (e instanceof KErr) throw e; throw new KErr('loft.failed'); } finally { r.done(); }
  }
  const why = TP.validity(shape); if (why) throw new KErr('loft.twisted', { reason: why });
  return finish(K, f, state, [{ shape, fn }], op);
}

// ------------------------------------------------------------------ draft (yüzlere koniklik)
// f: {faces:[Ref], tool: {kind:'base', name, offset} | {kind:'face', ref} (nötr düzlem), angle (°), flip (çekme yönünü ters çevir)}
// Çekme yönü nötr düzlemin normalidir. Pozitif açı: yüz çekme yönünde malzemeye doğru eğilir (gövde çekme yönünde daralır).
function draft(K, f, state, N, ctx) {
  const ang = N(f.angle ?? 1, tk('ef.angle'));
  if (!Number.isFinite(ang) || Math.abs(ang) < 1e-9 || Math.abs(ang) >= 89) throw new KErr('draft.angle_range', { value: ang });
  if (!Array.isArray(f.faces) || !f.faces.length) throw new KErr('draft.no_faces');
  const pl = K.toolPlane(f.tool || { kind: 'base', name: 'XY', offset: '0' }, state, N, ctx);
  const pull = V.mul(pl.n, f.flip ? -1 : 1);
  const byBody = new Map();
  f.faces.forEach((r, k) => { const { body, i } = K.resolveIdx(r, state, 'face', { ...ctx, field: 'faces', index: k }); if (!byBody.has(r.body)) byBody.set(r.body, { body, sel: new Set() }); byBody.get(r.body).sel.add(i); });
  for (const [bid, { body, sel }] of byBody) {
    const T = TP.topoOf(body.shape);
    for (const i of sel) {
      const F = TP.faceWrap(T.faces.list[i]); const g = F.geomType;
      if (!['PLANE', 'CYLINDRE', 'CONE'].includes(g)) throw new KErr('draft.face_type', { type: g });
      if (g === 'PLANE' && Math.abs(Math.abs(V.dot(V.norm(F.normalAt(F.center).toTuple()), pull)) - 1) < 1e-6) throw new KErr('draft.face_perpendicular');
    }
    const res = TP.draft(body, [...sel], pull, ang, pl);
    if (!res || isEmpty(res.shape) || TP.validity(res.shape)) throw new KErr('draft.failed');
    state.bodies.set(bid, { ...body, shape: res.shape, fn: res.fn });
  }
  return [...byBody.keys()];
}

// ------------------------------------------------------------------ rib (kaburga)
// f: {sketch, t (kalınlık, eskiz düzlemine simetrik), flip (kaburganın büyüme tarafı), targets}
// Eskizdeki her açık doğru, eskiz düzleminde doğruya dik yönde gövdeye ulaşana kadar uzatılır; doğru ile gövde arasındaki
// kapalı bölge t kalınlığında doldurulup gövdeye eklenir. Bölge kapanmıyorsa (doğru gövdeye değmiyor) açık hata.
function rib(K, f, state, N) {
  const S = state.sketches.get(f.sketch); if (!S) throw new KErr('sketch.not_found');
  const t = N(f.t, tk('ef.thickness')); if (!(t > 0)) throw new KErr('rib.thickness_positive'); K.dim(t, tk('ef.thickness'));
  const P = S.sk.points; const geo = (S.sk.ents || []).filter((e) => e && !e.cons && e.type !== 'point');
  if (!geo.length) throw new KErr('rib.no_lines'); if (geo.some((e) => e.type !== 'line')) throw new KErr('rib.lines_only');
  const targets = Array.isArray(f.targets) && f.targets.length ? f.targets : [...state.bodies.keys()];
  if (!targets.length || targets.some((id) => !state.bodies.has(id))) throw new KErr('rib.no_body');
  const bodies = targets.map((id) => state.bodies.get(id));
  const L = K.bigLen(state, S.plane.o); const { n } = S.plane; const half = V.mul(n, -t / 2);
  const pieces = [];
  for (const e of geo) {
    const a = P[e.a], b = P[e.b]; if (!a || !b) throw new KErr('rib.no_lines');
    const p0 = [a.x, a.y], p1 = [b.x, b.y]; const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); if (!(len >= 1e-4)) throw new KErr('sketch.edge_too_short', { len, min: 1e-4 });
    const nr = [-(p1[1] - p0[1]) / len, (p1[0] - p0[0]) / len];
    const W = (p) => V.add(V.toWorld(S.plane, p[0], p[1]), half);
    const tryside = (s) => {
      const q0 = [p0[0] + s * nr[0] * L, p0[1] + s * nr[1] * L], q1 = [p1[0] + s * nr[0] * L, p1[1] + s * nr[1] * L];
      const face = TP.makePolygon([W(p0), W(p1), W(q1), W(q0)]);
      const pr = TP.prism(face, V.mul(n, t)); if (!pr) throw new KErr('rib.failed');
      const fn = Array.from({ length: TP.topoOf(pr.shape).faces.size }, () => []);
      if (pr.first >= 0) fn[pr.first] = [`${f.id}:face-:${e.id}`]; if (pr.last >= 0) fn[pr.last] = [`${f.id}:face+:${e.id}`];
      pr.edges.forEach((ed, k) => { for (const gi of pr.gens[k]) fn[gi] = [`${f.id}:${k === 0 ? 'top' : 'wall' + k}:${e.id}`]; });
      const cut = TP.boolean('cut', [{ shape: pr.shape, fn }], bodies.map((x) => ({ shape: x.shape, fn: [] })), false);
      if (!cut || isEmpty(cut.shape)) return null;
      const mid = V.toWorld(S.plane, (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); // doğrunun ortası parçanın sınır yüzünde
      const solids = TP.solidsOf(cut.shape);
      const mk = TP.scope();
      try {
        const vx = mk(new (oc().BRepBuilderAPI_MakeVertex)(P3(mk, mid))).Vertex(); mk(vx);
        const touching = solids.filter((so) => TP.shapeDist(so.wrapped, vx) < 1e-6 * Math.max(1, L));
        if (touching.length !== 1) return null;
        const so = touching[0]; const bb = so.boundingBox; if (Math.max(bb.width, bb.height, bb.depth) > 0.5 * L) return null; // gövdeyle kapanmadı
        // parça kesme sonucundan ayrılınca adlar: kesme sonucunun adları yüz eşlemesiyle aktarılır
        const Tc = TP.topoOf(cut.shape), Ts = TP.topoOf(so); const sfn = Ts.faces.list.map((x) => { const k = Tc.faces.find(x); return k >= 0 ? cut.fn[k] || [] : []; });
        return { shape: so, fn: sfn };
      } finally { mk.done(); }
    };
    const s0 = f.flip ? -1 : 1; const pc = tryside(s0) || tryside(-s0);
    if (!pc) throw new KErr('rib.unbounded', { ent: String(e.id) });
    pieces.push(pc);
  }
  state.tools.set(f.id, { parts: pieces, op: 'join', targets });
  return K.applyOp(state, pieces, 'join', { id: f.id, targets });
}

// ------------------------------------------------------------------ değişken yarıçaplı yuvarlatma
// f: {edges:[Ref], r1 (başta), r2 (sonda), rm/tm (isteğe bağlı ara nokta), pts:[{t, r}] (ek ara noktalar)}; t ∈ (0,1) kenar boyunca oran.
// Seçili her kenar (ya da teğet zincir) aynı yarıçap yasasını alır; kenarın yönü OCCT kenar parametresiyle belirlenir.
function vfillet(K, f, state, N, ctx) {
  const r1 = N(f.r1, tk('ef.radius1')), r2 = N(f.r2 ?? f.r1, tk('ef.radius2'));
  for (const [v, l] of [[r1, 'ef.radius1'], [r2, 'ef.radius2']]) { if (!(v > 0)) throw new KErr('fc.value_positive'); K.dim(v, tk(l)); }
  const pts = [[0, r1]];
  const extra = Array.isArray(f.pts) ? f.pts.slice() : [];
  if (f.rm != null && String(f.rm).trim() !== '') extra.push({ t: f.tm ?? '0.5', r: f.rm });
  for (const q of extra) {
    const tt = N(q.t, tk('ef.vf_pos')), rr = N(q.r, tk('ef.radius'));
    if (!(tt > 0 && tt < 1)) throw new KErr('vfillet.pos_range', { value: tt });
    if (!(rr > 0)) throw new KErr('fc.value_positive'); K.dim(rr, tk('ef.radius')); pts.push([tt, rr]);
  }
  pts.push([1, r2]); pts.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < pts.length; i++) if (pts[i][0] - pts[i - 1][0] < 1e-6) throw new KErr('vfillet.pos_duplicate');
  if (!Array.isArray(f.edges) || !f.edges.length) throw new KErr('fc.no_edges');
  const byBody = new Map();
  f.edges.forEach((rf, k) => { const { body, i } = K.resolveIdx(rf, state, 'edge', { ...ctx, field: 'edges', index: k }); if (!byBody.has(rf.body)) byBody.set(rf.body, { body, sel: [] }); const b = byBody.get(rf.body); if (!b.sel.includes(i)) b.sel.push(i); });
  for (const [bid, { body, sel }] of byBody) {
    const O = oc(); const r = TP.scope(); const T = TP.topoOf(body.shape); let res = null;
    try {
      const b = r(new O.BRepFilletAPI_MakeFillet(body.shape.wrapped, O.ChFi3d_FilletShape.ChFi3d_Rational));
      for (const j of sel) {
        const e = r(O.TopoDS.Edge(T.edges.list[j])); b.Add(pts[0][1], e);
        const ic = b.NbContours();
        const arr = r(new O.NCollection_Array1_gp_Pnt2d(1, pts.length)); pts.forEach(([u, rr], k) => arr.SetValue(k + 1, r(new O.gp_Pnt2d(u, rr))));
        b.SetRadius(arr, ic, 1);
      }
      b.Build(progress(r));
      if (b.IsDone()) {
        const raw = b.Shape(); const shape = TP.wrap(raw);
        const nmE = (j) => { const nm = edgeName(body, j); return nm.error ? `#${j}` : `<${nm.a}&${nm.b}${nm.nb ? '|' + nm.nb.join('|') : ''}>`; };
        const fn = TP.propagate(b, [{ shape: body.shape, fn: body.fn }], shape, { generated: (Ti, gen) => { for (const j of sel) gen(Ti.edges.list[j], `${f.id}:vblend${nmE(j)}`); } });
        res = { shape, fn };
      }
    } catch (e) { res = null; } finally { r.done(); }
    if (!res || isEmpty(res.shape) || TP.validity(res.shape)) throw new KErr('vfillet.too_big');
    state.bodies.set(bid, { ...body, shape: res.shape, fn: res.fn });
  }
  return [...byBody.keys()];
}

// ------------------------------------------------------------------ helis ve diş
// Helis teli: eksen (c, d), yarıçap r, adım, boy; başlangıç noktası verilen radyal yönde (u). Sağ el varsayılan.
function helixWire(c, d, u, r, pitch, height, left) {
  const O = oc(); const rr = TP.scope();
  try {
    const ax = rr(new O.gp_Ax3(P3(rr, c), D3(rr, d), D3(rr, u)));
    const k = left ? -TAU : TAU;
    const line = rr(new O.Geom2d_Line(rr(new O.gp_Pnt2d(0, 0)), rr(new O.gp_Dir2d(k, pitch))));
    const turns = height / pitch; const s1 = turns * Math.hypot(TAU, pitch);
    const seg = rr(new O.GC_MakeSegment2d(rr(line.Value(0)), rr(line.Value(s1))));
    const surf = new O.Geom_CylindricalSurface(ax, r);
    const e = rr(new O.BRepBuilderAPI_MakeEdge(rr(seg.Value()), surf)).Edge();
    const w = rr(new O.BRepBuilderAPI_MakeWire(e)).Wire(); O.BRepLib.BuildCurves3d(w);
    return new R.Wire(w);
  } finally { rr.done(); }
}
function vertexPoint(v) { const O = oc(); const r = TP.scope(); try { const q = r(O.BRep_Tool.Pnt(r(O.TopoDS.Vertex(v)))); return [q.X(), q.Y(), q.Z()]; } finally { r.done(); } }
const polyWire = (pts) => R.assembleWire(pts.map((p, i) => TP.makeLine(p, pts[(i + 1) % pts.length])));
const perp = (d) => V.norm(V.cross(Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], d));

// Modellenmiş diş: silindirik yüzde (dış: mil, iç: delik) ISO 68-1 temel profiline yakın 60° yiv helis boyunca kesilir.
// f: {face: Ref, thread: {designation, pitch, major, family}, length ('' = yüzün tamamı), flip (diğer uçtan başla), hand: 'right'|'left'}
// Dış diş yivi: tepe çapında genişlik 7P/8, derinlik h3 = 0,61343·P (kök düz 0,1667·P). İç diş yivi: diş dibi (D1) genişliği 3P/4,
// büyük çapta (D) P/8 düz. Kaynak: ISO 68-1 temel profil oranları (H = 0,866·P); kök yuvarlatması modellenmez (O önerisi).
function thread(K, f, state, N, ctx) {
  const th = f.thread; if (!th || typeof th !== 'object') throw new KErr('thread.no_spec');
  const P = +th.pitch, D = +th.major; if (!(P > 0 && D > P)) throw new KErr('thread.bad_spec');
  if (!f.face) throw new KErr('thread.no_face');
  const hand = f.hand ?? 'right'; if (!['right', 'left'].includes(hand)) throw new KErr('thread.hand_unknown');
  const { body, i } = K.resolveIdx(f.face, state, 'face', { ...ctx, field: 'face' });
  const T = TP.topoOf(body.shape); const F = TP.faceWrap(T.faces.list[i]);
  if (F.geomType !== 'CYLINDRE') throw new KErr('thread.not_cylinder');
  let c, d, Rc, ux;
  { const cyl = F.surface.wrapped.Cylinder(); Rc = cyl.Radius(); const ax = cyl.Axis(); const l = ax.Location(), dd = ax.Direction(); c = [l.X(), l.Y(), l.Z()]; d = V.norm([dd.X(), dd.Y(), dd.Z()]); const xd = cyl.XAxis().Direction(); ux = V.norm([xd.X(), xd.Y(), xd.Z()]); }
  // yüzün eksen boyunca uzanımı ve dış/iç ayrımı (yüz normali eksenden dışarı bakıyorsa mil)
  const vs = new TP.SubIndex(T.faces.list[i], 'vertex'); let s0 = Infinity, s1 = -Infinity;
  for (const v of vs.list) { const p = vertexPoint(v); const s = V.dot(V.sub(p, c), d); s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
  vs.list.forEach((x) => x.delete());
  if (!(s1 - s0 > P)) throw new KErr('thread.too_short', { len: s1 - s0, pitch: P });
  const pS = F.pointOnSurface(0.5, 0.5); const ctr = pS.toTuple(); const nrm = V.norm(F.normalAt(pS).toTuple()); const rad = V.sub(ctr, V.add(c, V.mul(d, V.dot(V.sub(ctr, c), d))));
  const external = V.dot(nrm, rad) > 0;
  // çap uyumu: mil ≈ D (−0,25P … +0,1P); delik: D1 = D − 1,0825P ile D − 0,9P arası (kılavuz matkabı D − P dahil)
  const dc = 2 * Rc;
  if (external && (dc < D - 0.25 * P || dc > D + 0.1 * P)) throw new KErr('thread.dia_mismatch', { dia: +dc.toFixed(4), want: D });
  if (!external && (dc < D - 1.15 * P || dc > D - 0.85 * P)) throw new KErr('thread.hole_mismatch', { dia: +dc.toFixed(4), lo: +(D - 1.0825 * P).toFixed(3), hi: +(D - 0.9 * P).toFixed(3) });
  const full = s1 - s0; let len = full;
  if (f.length != null && String(f.length).trim() !== '') { len = N(f.length, tk('ef.length')); K.dim(len, tk('ef.length')); if (len > full + 1e-6) throw new KErr('thread.too_long', { len, max: +full.toFixed(4) }); if (len < P) throw new KErr('thread.too_short', { len, pitch: P }); }
  const dir = f.flip ? V.mul(d, -1) : d; const start = f.flip ? s1 : s0;
  // yiv takımı: başlangıç ucunun P dışından başlar; tam boyda diğer ucu da P aşar
  const z0 = -P; const height = len + P + (len >= full - 1e-6 ? P : 0);
  const base = V.add(c, V.mul(d, start)); const hc = V.add(base, V.mul(dir, z0));
  const e = 0.1 * P, t30 = Math.tan(Math.PI / 6);
  let prof, rh;
  if (external) {
    const R0 = D / 2, rRoot = R0 - 0.61343 * P, hwR = P / 12, rOut = Math.max(Rc, R0) + e, hwO = hwR + (rOut - rRoot) * t30;
    if (!(hwO < P / 2)) throw new KErr('thread.bad_spec');
    prof = [[rRoot, -hwR], [rOut, -hwO], [rOut, hwO], [rRoot, hwR]]; rh = rRoot;
  } else {
    const R0 = D / 2, rIn = Rc - e, hwM = P / 16, hwI = hwM + (R0 - rIn) * t30;
    if (!(hwI < P / 2) || !(rIn > 0)) throw new KErr('thread.bad_spec');
    prof = [[rIn, -hwI], [R0, -hwM], [R0, hwM], [rIn, hwI]]; rh = rIn; // dış dişle aynı dolanım yönü (içten dışa)
  }
  const roles = external ? ['flank-', 'crest', 'flank+', 'root'] : ['flank-', 'root', 'flank+', 'crest'];
  const v0 = TP.volume(body.shape);
  // Üst sınır (denetim): yivin malzeme tarafındaki kesiti × 2πr (Pappus) × boy / adım. Gövde tam silindir değilse (düz yüz,
  // ince cidar) kaldırılan daha az olur; fazlası boolean hatasıdır (helis–yüzey kesişiminde görüldü) ve kabul edilmez.
  const [ra, rb] = external ? [prof[0][0], Rc] : [Rc, prof[1][0]]; const hwAt = (r) => { const [[r0, z0], [r1, z1]] = [prof[0], prof[1]]; return Math.abs(z0 + ((z1 - z0) * (r - r0)) / (r1 - r0)); };
  let vmax = 0; { const n = 400; for (let k = 0; k < n; k++) { const rr = ra + ((k + 0.5) * (rb - ra)) / n; vmax += 2 * hwAt(rr) * TAU * rr * ((rb - ra) / n); } vmax *= len / P; }
  // Yiv başlangıcı önce silindirin dikiş (seam) çizgisinde; OCCT boolean'ı helis taramasında bazı başlangıç açılarında boş ya da
  // yanlış sonuç veriyor. Sonuç (geçerlilik + hacim aralığı) tutmazsa başlangıç açısı kaydırılarak yeniden denenir; diş geometrisi
  // açıdan bağımsızdır, yalnız giriş noktası döner.
  const u0 = Math.abs(V.dot(ux, dir)) < 1e-9 ? ux : perp(dir); const v1 = V.cross(dir, u0);
  let res = null;
  for (const a of [0, 2, 0.5, 4, 1.3, 3]) {
    const u = V.norm(V.add(V.mul(u0, Math.cos(a)), V.mul(v1, Math.sin(a))));
    const W = (rr, z) => V.add(V.add(hc, V.mul(u, rr)), V.mul(dir, z));
    const pw = polyWire(prof.map(([rr, z]) => W(rr, z)));
    const hx = helixWire(hc, dir, u, rh, P, height, hand === 'left');
    const tool = pipeShell(hx, [pw], { binormal: dir }, true, 1e-6 * Math.max(1, D)); if (!tool || isEmpty(tool.shape) || TP.validity(tool.shape)) continue;
    const fn = Array.from({ length: TP.topoOf(tool.shape).faces.size }, () => []);
    tool.wiresEdges[0].forEach(({ faces }, k) => { for (const q of faces) fn[q] = [`${f.id}:${roles[k] || 'g' + k}`]; });
    if (tool.first >= 0) fn[tool.first] = [`${f.id}:runout0`]; if (tool.last >= 0) fn[tool.last] = [`${f.id}:runout1`];
    res = TP.boolean('cut', [body], [{ shape: tool.shape, fn }]);
    if (res && !isEmpty(res.shape) && !TP.validity(res.shape)) { const dv = v0 - TP.volume(res.shape); if (dv > 1e-9 * v0 && dv <= vmax * 1.002 + 1e-9) break; }
    res = null;
  }
  if (!res) throw new KErr('thread.failed');
  state.bodies.set(f.face.body, { ...body, shape: res.shape, fn: res.fn });
  return [f.face.body];
}

// Helis gövdesi (yay): f: {plane: 'XY'|'XZ'|'YZ', offset, cx, cy (düzlemde eksen konumu), dia (helis çapı), pitch, turns, sdia (kesit çapı),
// hand, flip (eksen düzlem normalinin tersine), op}
function coil(K, f, state, N) {
  const pn = f.plane ?? 'XY'; if (!V.BASE_PLANES[pn]) throw new KErr('sketch.plane_unknown');
  const pl = V.basePlane(pn, K.coord(N(f.offset ?? 0, tk('ef.offset')), tk('ef.offset')));
  const cx = K.coord(N(f.cx ?? 0, tk('ef.x')), tk('ef.x')), cy = K.coord(N(f.cy ?? 0, tk('ef.y')), tk('ef.y'));
  const dia = N(f.dia, tk('ef.dia')), pitch = N(f.pitch, tk('ef.pitch')), turns = N(f.turns, tk('ef.turns')), sd = N(f.sdia, tk('ef.sdia'));
  for (const [v, l] of [[dia, 'ef.dia'], [pitch, 'ef.pitch'], [sd, 'ef.sdia']]) { if (!(v > 0)) throw new KErr('value.positive', { field: tk(l), value: v }); K.dim(v, tk(l)); }
  if (!(turns > 0 && turns <= 500)) throw new KErr('coil.turns_range', { value: turns });
  if (!(sd < dia)) throw new KErr('coil.section_big');
  if (!(sd < pitch * 0.999)) throw new KErr('coil.self_intersect', { sdia: sd, pitch });
  const hand = f.hand ?? 'right'; if (!['right', 'left'].includes(hand)) throw new KErr('thread.hand_unknown');
  const op = opOf(f);
  const d = V.mul(pl.n, f.flip ? -1 : 1); const c = V.toWorld(pl, cx, cy); const u = pl.x; const r = dia / 2;
  const hx = helixWire(c, d, u, r, pitch, turns * pitch, hand === 'left');
  const st = V.add(c, V.mul(u, r)); const v = V.cross(d, u); const tan = V.norm(V.add(V.mul(v, (hand === 'left' ? -1 : 1) * TAU * r), V.mul(d, pitch)));
  const circ = R.assembleWire([R.makeCircle(sd / 2, st, tan)]);
  const res = pipeShell(hx, [circ], { binormal: d }, true, 1e-6 * Math.max(1, dia)); if (!res || isEmpty(res.shape)) throw new KErr('coil.failed');
  const why = TP.validity(res.shape); if (why) throw new KErr('coil.failed');
  const fn = Array.from({ length: TP.topoOf(res.shape).faces.size }, () => [`${f.id}:side`]);
  if (res.first >= 0) fn[res.first] = [`${f.id}:start`]; if (res.last >= 0) fn[res.last] = [`${f.id}:end`];
  return finish(K, f, state, [{ shape: res.shape, fn }], op);
}
