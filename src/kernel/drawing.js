// WP-17 teknik resim: cekirdek tarafi. Son rebuild sonucundaki govdelerden gizli cizgi kaldirmali (OCCT HLRBRep_Algo, kesin B-rep)
// izdusum, duzlemle kesit (yari uzay ile ortak kisim + kesit yuzu donguleri) ve gorunus kenarinin model kenarina esleme anahtari.
// Gorunus tanimi: {id, d:[3] (bakana dogru gorus yonu), x:[3] (gorunusun saga yonu), sec?: {p:[3]} (kesit duzlemi p'den gecer, normali d;
// d tarafindaki malzeme kaldirilir)}. Cikti koordinatlari gorunus duzleminde (model mm): u = dot(q, x), v = dot(q, y), y = d x x.
// Hata: KErr ('drw.' onekli).
import { KErr } from '../shared/errors.js';
import * as V from '../shared/vec.js';
import * as R from 'replicad';
import * as TP from './topo.js';
import { edgeKey } from './naming.js';
import { cleanView, mergeLines, chainLoops, boxOf, probe, primDist, CHORD } from '../drawing/geom.js';

const oc = () => R.getOC();
const E = (code, params = {}) => new KErr(code, params);
const P3 = (g) => [g.X(), g.Y(), g.Z()];
const MAX_VIEWS = 24;
const cache = new WeakMap(); // K.last -> Map(anahtar -> sonuc)

function basis(spec) {
  if (!spec || !Array.isArray(spec.d) || !Array.isArray(spec.x) || spec.d.length !== 3 || spec.x.length !== 3 || ![...spec.d, ...spec.x].every(Number.isFinite)) throw E('drw.view_bad');
  const d = V.norm(spec.d); let x = V.sub(spec.x, V.mul(d, V.dot(spec.x, d)));
  if (V.len(x) < 1e-9) throw E('drw.view_bad');
  x = V.norm(x); const y = V.cross(d, x);
  return { d, x, y };
}
const to2 = (B, q) => [V.dot(q, B.x), V.dot(q, B.y)];

// Kenari (3B egri) gorunus duzleminde ilkele cevir. HLR ciktisi zaten duzlemdedir (z ~ 0, yerel eksenler); model kenari icin B ile izdusurulur.
function edgePrim(edgeRaw, B, tol) {
  const O = oc(); const r = TP.scope();
  try {
    const e = r(O.TopoDS.Edge(edgeRaw)); if (O.BRep_Tool.Degenerated(e)) return null;
    const c = r(new O.BRepAdaptor_Curve(e)); const t0 = c.FirstParameter(), t1 = c.LastParameter();
    const at = (t) => { const p = r(c.Value(t)); const q = P3(p); return B ? to2(B, q) : [q[0], q[1]]; };
    const T = c.GetType(); const CT = O.GeomAbs_CurveType;
    if (T === CT.GeomAbs_Line) { const a = at(t0), b = at(t1); return Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-12 ? null : { t: 'l', a, b }; }
    if (T === CT.GeomAbs_Circle) {
      const circ = r(c.Circle()); const ax = r(circ.Axis()); const dz = P3(r(ax.Direction())); const loc = P3(r(circ.Location()));
      const k = B ? V.dot(dz, B.d) : dz[2];
      if (Math.abs(Math.abs(k) - 1) <= 1e-7) {
        const cc = B ? to2(B, loc) : [loc[0], loc[1]]; const rad = circ.Radius(); const sw = t1 - t0;
        if (sw >= Math.PI * 2 - 1e-9) return { t: 'c', c: cc, r: rad };
        const pa = at(t0), pb = at(t1); const ang = (q) => Math.atan2(q[1] - cc[1], q[0] - cc[0]);
        return k > 0 ? { t: 'a', c: cc, r: rad, a0: ang(pa), sw } : { t: 'a', c: cc, r: rad, a0: ang(pb), sw };
      }
    }
    // genel: uyarlamali kiris bolme
    const pts = [[t0, at(t0)]]; const stack = [[t0, t1, at(t1)]]; let guard = 0;
    while (stack.length) {
      const [a, b, pb] = stack.pop(); const pa = pts[pts.length - 1][1]; let ok = true;
      for (const f of [0.25, 0.5, 0.75]) { const q = at(a + (b - a) * f); if (chordDist(q, pa, pb) > tol) { ok = false; break; } }
      if (!ok && b - a > 1e-12 && ++guard < 20000) { const m = (a + b) / 2; stack.push([m, b, pb], [a, m, at(m)]); continue; }
      pts.push([b, pb]);
    }
    return { t: 'p', pts: pts.map((x) => x[1]) };
  } finally { r.done(); }
}
function chordDist(q, a, b) { const d = [b[0] - a[0], b[1] - a[1]], l2 = d[0] * d[0] + d[1] * d[1]; let t = l2 > 0 ? ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(q[0] - a[0] - d[0] * t, q[1] - a[1] - d[1] * t); }

function compoundEdges(shape) {
  if (!shape || shape.IsNull()) { try { shape?.delete(); } catch (e) { /* */ } return []; }
  const O = oc(); const out = [];
  const ex = new O.TopExp_Explorer(shape, O.TopAbs_ShapeEnum.TopAbs_EDGE, O.TopAbs_ShapeEnum.TopAbs_SHAPE);
  for (; ex.More(); ex.Next()) out.push(ex.Current());
  ex.delete(); out.push({ delete: () => shape.delete() }); // son oge: bilesik tutamaci
  return out;
}

// HLR: govde sekillerinin bilesigi -> gorunur/gizli ilkeller (gorunus duzleminde)
function hlr(shapes, B) {
  const O = oc(); const r = TP.scope();
  try {
    const comp = shapes.length === 1 ? shapes[0] : R.makeCompound(shapes);
    const algo = r(new O.HLRBRep_Algo()); algo.Add(comp.wrapped, 0);
    const ax = r(new O.gp_Ax2(r(new O.gp_Pnt(0, 0, 0)), r(new O.gp_Dir(...B.d)), r(new O.gp_Dir(...B.x))));
    algo.Projector(r(new O.HLRAlgo_Projector(ax))); algo.Update(); algo.Hide();
    const H = r(new O.HLRBRep_HLRToShape(algo));
    const out = [];
    const take = (s, vis, k) => {
      const list = compoundEdges(s);
      for (const e of list.slice(0, -1)) { try { O.BRepLib.BuildCurves3d(e); const p = edgePrim(e, null, CHORD); if (p) out.push({ ...p, vis, k }); } finally { e.delete(); } }
      list[list.length - 1]?.delete();
    };
    take(H.VCompound(), true, 's'); take(H.Rg1LineVCompound(), true, 'g'); take(H.OutLineVCompound(), true, 'o');
    take(H.HCompound(), false, 's'); take(H.Rg1LineHCompound(), false, 'g'); take(H.OutLineHCompound(), false, 'o');
    return out;
  } finally { r.done(); }
}

// Model kenarlari: izdusum (eslestirme icin) + dikis kenari bilgisi
function modelEdges(bodies, B, tol) {
  const out = [];
  for (const [id, b] of bodies) {
    const T = TP.topoOf(b.shape);
    T.edges.list.forEach((raw, j) => {
      const p = edgePrim(raw, B, tol); if (!p) return;
      const seam = T.edgeFaces[j].length === 1;
      // derinlik (bakana yakinlik): kenar orta noktasi
      const O = oc(); const r = TP.scope(); let depth = 0, mid = null;
      try { const e = r(O.TopoDS.Edge(raw)); const c = r(new O.BRepAdaptor_Curve(e)); const m = P3(r(c.Value((c.FirstParameter() + c.LastParameter()) / 2))); depth = V.dot(m, B.d); mid = m; } finally { r.done(); }
      out.push({ body: id, j, b, prim: p, seam, depth, mid, face: T.edgeFaces[j][0], box: boxOf([p]) });
    });
  }
  return out;
}
// dikis kenari siluet uzerinde mi (yuzey normali gorus yonune dik)?
function seamOnSilhouette(me, B) {
  try { const T = TP.topoOf(me.b.shape); const f = TP.faceWrap(T.faces.list[me.face]); const n = f.normalAt(me.mid); const nn = [n.x, n.y, n.z]; return Math.abs(V.dot(V.norm(nn), B.d)) < 1e-4; } catch (e) { return true; }
}

function assign(prims, medges, B, tol) {
  const keyOf = new Map(); const kept = [];
  for (const p of prims) {
    const pr = probe(p, [0.15, 0.5, 0.85]); const bx = boxOf([p]);
    let best = null;
    for (const me of medges) {
      if (me.box[0] > bx[2] + tol || me.box[2] < bx[0] - tol || me.box[1] > bx[3] + tol || me.box[3] < bx[1] - tol) continue;
      if (!pr.every((q) => primDist(q, me.prim) <= tol)) continue;
      // tercih: dikis olmayan; ayni turde; bakana en yakin
      const score = (me.seam ? 0 : 1e9) + me.depth;
      if (!best || score > best.score) best = { me, score };
    }
    if (best && best.me.seam && !seamOnSilhouette(best.me, B)) continue; // yalniz dikis kenari (silindir birlesimi) ve siluet degil: cizilmez
    let src = null;
    if (best && !best.me.seam) {
      const k = best.me.body + '#' + best.me.j;
      if (!keyOf.has(k)) { const nk = edgeKey(best.me.b, best.me.j); keyOf.set(k, nk ? best.me.body + '/' + nk : null); }
      src = keyOf.get(k);
    }
    kept.push({ ...p, src });
  }
  return kept;
}

// Kesit: d tarafini kaldiran yari uzay ile ortak kisim; kesit duzlemindeki yuzlerin donguleri (gorunus duzleminde)
function sectionShapes(bodies, B, p, diag) {
  const O = oc(); const S = Math.max(10, diag * 4); const out = []; const faces = [];
  const c = V.sub(p, V.mul(B.d, S / 2));
  const r = TP.scope();
  try {
    const corner = (u, v, w) => V.add(V.add(V.add(p, V.mul(B.x, u)), V.mul(B.y, v)), V.mul(B.d, w));
    const pts = [corner(-S, -S, 0), corner(S, -S, 0), corner(S, S, 0), corner(-S, S, 0)];
    const face = TP.makePolygon(pts);
    const pr = r(new O.BRepPrimAPI_MakePrism(face.wrapped, r(new O.gp_Vec(...V.mul(B.d, -S * 2))), false, true)); pr.Build(r(new O.Message_ProgressRange()));
    if (!pr.IsDone()) throw E('drw.section_failed');
    const half = TP.wrap(pr.Shape());
    for (const [, b] of bodies) {
      const op = r(new O.BRepAlgoAPI_Common(b.shape.wrapped, half.wrapped, r(new O.Message_ProgressRange())));
      if (!op.IsDone()) throw E('drw.section_failed');
      const res = TP.wrap(op.Shape()); if (TP.topoOf(res).faces.size === 0) continue;
      out.push(res);
      for (const fr of TP.topoOf(res).faces.list) {
        const f = TP.faceWrap(fr);
        if (f.geomType !== 'PLANE') continue;
        const n = f.normalAt(); const nn = V.norm([n.x, n.y, n.z]);
        if (Math.abs(Math.abs(V.dot(nn, B.d)) - 1) > 1e-7) continue;
        const q = f.center; if (Math.abs(V.dot(V.sub([q.x, q.y, q.z], p), B.d)) > 1e-6 * Math.max(1, diag)) continue;
        faces.push(f);
      }
    }
  } finally { r.done(); }
  void c;
  const polys = [];
  for (const f of faces) for (const raw of TP.topoOf(f).edges.list) { const pp = edgePrim(raw, B, CHORD); if (!pp) continue; const pts = pp.t === 'l' ? [pp.a, pp.b] : pp.t === 'p' ? pp.pts : circlePts(pp); polys.push(pts); }
  const ch = chainLoops(polys, 1e-4 * Math.max(1, diag));
  return { shapes: out, loops: ch.loops, open: ch.open };
}
function circlePts(p) {
  const sw = p.t === 'c' ? Math.PI * 2 : p.sw, a0 = p.t === 'c' ? 0 : p.a0; const n = Math.max(24, Math.ceil(sw / (2 * Math.acos(Math.max(-1, 1 - CHORD / Math.max(p.r, CHORD))))));
  const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (sw * i) / n; out.push([p.c[0] + p.r * Math.cos(a), p.c[1] + p.r * Math.sin(a)]); } return out;
}

export function drawProject(K, args) {
  const last = K.last; if (!last || !last.bodies || !last.bodies.size) throw E('drw.no_model');
  const views = Array.isArray(args?.views) ? args.views : []; if (views.length > MAX_VIEWS) throw E('drw.too_many_views', { max: MAX_VIEWS });
  const want = Array.isArray(args?.bodies) ? new Set(args.bodies) : null;
  const bodies = [...last.bodies].filter(([id]) => !want || want.has(id));
  if (!bodies.length) throw E('drw.no_model');
  let C = cache.get(last); if (!C) { C = new Map(); cache.set(last, C); }
  const bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (const [, b] of bodies) { const [lo, hi] = b.shape.boundingBox.bounds; for (let i = 0; i < 3; i++) { bb[0][i] = Math.min(bb[0][i], lo[i]); bb[1][i] = Math.max(bb[1][i], hi[i]); } }
  const diag = V.dist(bb[0], bb[1]);
  const tol = Math.max(1e-4, 2e-6 * diag), mtol = Math.max(2 * CHORD + 1e-3, 2e-5 * diag); // esleme: iki kiris hatasi + pay
  const out = {};
  for (const spec of views) {
    const id = String(spec?.id ?? '');
    const key = JSON.stringify([want ? [...want].sort() : null, spec?.d, spec?.x, spec?.sec?.p || null]);
    if (C.has(key)) { out[id] = C.get(key); continue; }
    let res;
    try {
      const B = basis(spec);
      let shapes = bodies.map(([, b]) => b.shape), loops = [], open = 0;
      if (spec.sec) {
        const p = spec.sec.p; if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) throw E('drw.view_bad');
        const s = sectionShapes(bodies, B, p, diag); if (!s.shapes.length) throw E('drw.section_empty');
        shapes = s.shapes; loops = s.loops; open = s.open;
      }
      const raw = hlr(shapes, B);
      const me = modelEdges(bodies, B, CHORD);
      const prims = mergeLines(cleanView(assign(raw, me, B, mtol), tol), tol);
      const box = boxOf(prims);
      res = { prims, loops, open, box, basis: B };
    } catch (e) { res = { error: e instanceof KErr ? { code: e.code, params: e.params } : { code: 'drw.project_failed', params: {} } }; }
    C.set(key, res); out[id] = res;
  }
  return { views: out, bbox: bb };
}
