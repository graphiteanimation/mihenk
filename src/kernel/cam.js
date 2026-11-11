// CAM geometri sorgulari (cekirdek tarafi): duzlemsel yuz donguleri, kesit, ust yukseklik haritasi.
// Tum ciktilar setup uzayindadir: frame = {o, x, y, z} (model uzayinda; x,y,z birim ve dik). Nokta p icin
// setup koordinati = [dot(p-o, x), dot(p-o, y), dot(p-o, z)].
// Parca bicimi: geom2d 'line'/'arc' (kanonik: yay CCW) + fwd (gidis yonu kanonik mi) + open (acik kenar) + edge (kenar dizini).
// Cizgi/yay olmayan egriler kiris hatasi <= CHORD_TOL ile cizgilere bolunur. Hata: KErr {code, params} ('cam.' onekli).
import { KErr } from '../shared/errors.js';
import * as V from '../shared/vec.js';
import * as G from '../shared/geom2d.js';
import * as TP from './topo.js';
import * as R from 'replicad';

export const CHORD_TOL = 0.005;  // mm
export const OPEN_TOL = 1e-4;    // mm: komsu yuz bu kadar yukselmiyorsa kenar acik
export const ABOVE_DZ = 0.01;    // mm: acik kenar denetimi icin taban ustu kesit yuksekligi
const HM_MAX_CELLS = 4_000_000;
const E = (code, params = {}) => new KErr(code, params);
const oc = () => R.getOC();

export function checkFrame(frame) {
  if (!frame || typeof frame !== 'object') throw E('cam.frame_bad');
  for (const k of ['o', 'x', 'y', 'z']) if (!Array.isArray(frame[k]) || frame[k].length !== 3 || !frame[k].every(Number.isFinite)) throw E('cam.frame_bad');
  const { x, y, z } = frame;
  if (Math.abs(V.len(x) - 1) > 1e-6 || Math.abs(V.len(y) - 1) > 1e-6 || Math.abs(V.len(z) - 1) > 1e-6 || Math.abs(V.dot(x, y)) > 1e-6 || Math.abs(V.dot(x, z)) > 1e-6 || V.dist(V.cross(x, y), z) > 1e-6) throw E('cam.frame_bad');
  return frame;
}
const toF = (f, p) => { const d = V.sub(p, f.o); return [V.dot(d, f.x), V.dot(d, f.y), V.dot(d, f.z)]; };
const P3 = (g) => [g.X(), g.Y(), g.Z()];

// Kenari setup duzleminde 2B parcalara cevir. zExpect verilirse kenarin bu duzlemde oldugu denetlenir.
function edgeSegs(edgeRaw, frame, zExpect, ztol) {
  const O = oc(); const r = TP.scope();
  try {
    const e = r(O.TopoDS.Edge(edgeRaw));
    if (O.BRep_Tool.Degenerated(e)) return [];
    const c = r(new O.BRepAdaptor_Curve(e)); const t0 = c.FirstParameter(), t1 = c.LastParameter();
    const at = (t) => { const p = r(c.Value(t)); return toF(frame, P3(p)); };
    const chkZ = (q) => { if (zExpect != null && Math.abs(q[2] - zExpect) > ztol) throw E('cam.face_not_flat'); return q; };
    const T = c.GetType(); const CT = O.GeomAbs_CurveType;
    if (T === CT.GeomAbs_Line) { const a = chkZ(at(t0)), b = chkZ(at(t1)); if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) return []; return [{ seg: G.mkLine(a, b), fwd: true }]; }
    if (T === CT.GeomAbs_Circle) {
      const circ = r(c.Circle()); const ax = r(circ.Axis()); const dz = P3(r(ax.Direction())); const loc = P3(r(circ.Location()));
      const k = V.dot(dz, frame.z);
      if (Math.abs(Math.abs(k) - 1) <= 1e-7) {
        const cc = chkZ(toF(frame, loc)); const pa = chkZ(at(t0)), pb = chkZ(at(t1)); const rad = circ.Radius(); const sweep = t1 - t0;
        if (sweep > G.TAU + 1e-9 || sweep <= 0) throw E('cam.curve_bad');
        const ang = (q) => Math.atan2(q[1] - cc[1], q[0] - cc[0]);
        if (k > 0) return [{ seg: G.mkArc(cc, rad, ang(pa), Math.min(sweep, G.TAU)), fwd: true }];
        return [{ seg: G.mkArc(cc, rad, ang(pb), Math.min(sweep, G.TAU)), fwd: false }];
      }
      // eksen egik: duzlemde elips gorunumu; asagidaki genel orneklemeye duser
    }
    // genel egri: uyarlamali kiris bolme (kiris hatasi <= CHORD_TOL)
    const pts = [[t0, at(t0)]]; const stack = [[t0, t1, at(t1)]]; let guard = 0;
    while (stack.length) {
      const [a, b, pb] = stack.pop(); const pa = pts[pts.length - 1][1];
      let okSeg = true;
      for (const f of [0.25, 0.5, 0.75]) { const q = at(a + (b - a) * f); const dd = distToChord(q, pa, pb); if (dd > CHORD_TOL) { okSeg = false; break; } }
      if (!okSeg && b - a > 1e-12 && ++guard < 200000) { const m = (a + b) / 2; const pm = at(m); stack.push([m, b, pb], [a, m, pm]); continue; }
      pts.push([b, pb]);
    }
    for (const [, q] of pts) chkZ(q);
    const out = []; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1][1], b = pts[i][1]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) out.push({ seg: G.mkLine(a, b), fwd: true, chord: true }); }
    return out;
  } finally { r.done(); }
}
function distToChord(q, a, b) { const d = [b[0] - a[0], b[1] - a[1]], l2 = d[0] * d[0] + d[1] * d[1]; let t = l2 > 0 ? ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(q[0] - a[0] - d[0] * t, q[1] - a[1] - d[1] * t); }

const itemStart = (it) => (it.fwd ? G.startEnd(it.seg)[0] : G.startEnd(it.seg)[1]);
const itemEnd = (it) => (it.fwd ? G.startEnd(it.seg)[1] : G.startEnd(it.seg)[0]);
const itemArea = (loop) => loop.reduce((s, it) => s + G.areaContribution(it.seg, it.fwd), 0);
const flipLoop = (loop) => loop.slice().reverse().map((it) => ({ ...it, fwd: !it.fwd }));
// yonlu parcalari kapali dongulere zincirle (uclar tol icinde)
function chainLoops(items, tol) {
  const used = new Array(items.length).fill(false); const loops = [];
  for (let i = 0; i < items.length; i++) {
    if (used[i]) continue; used[i] = true; const loop = [items[i]]; let guard = 0;
    while (G.dist(itemEnd(loop[loop.length - 1]), itemStart(loop[0])) > tol) {
      if (++guard > items.length + 1) throw E('cam.loop_open');
      const end = itemEnd(loop[loop.length - 1]); let found = -1, flip = false;
      for (let j = 0; j < items.length; j++) {
        if (used[j]) continue;
        if (G.dist(itemStart(items[j]), end) <= tol) { found = j; break; }
        if (G.dist(itemEnd(items[j]), end) <= tol) { found = j; flip = true; break; }
      }
      if (found < 0) throw E('cam.loop_open');
      used[found] = true; loop.push(flip ? { ...items[found], fwd: !items[found].fwd } : items[found]);
    }
    loops.push(loop);
  }
  return loops;
}
const cleanItem = (it) => ({ ...it.seg, fwd: it.fwd, open: !!it.open, edge: it.edge ?? null });
// dongu ic-icelik derinligine gore yonlendir (derinlik cift: CCW, tek: CW) -> malzeme/bolge solda
function orientNested(loops) {
  const polys = loops.map((l) => l.flatMap((it) => { const p = G.sample(it.seg, 0.01); return it.fwd ? p.slice(0, -1) : p.reverse().slice(0, -1); }));
  return loops.map((l, i) => {
    const probe = itemMid(l); let depth = 0;
    loops.forEach((m, j) => { if (j !== i && G.pointInPoly(probe, polys[j])) depth++; });
    const A = itemArea(l); const want = depth % 2 === 0 ? 1 : -1;
    return { loop: Math.sign(A) === want ? l : flipLoop(l), depth, area: Math.abs(A) };
  });
}
function itemMid(loop) { const it = loop[0]; return G.ptAt(it.seg, G.endU(it.seg) / 2); }

// Komsu yuzun setup z'sindeki en yuksek noktasi (goruntu agi kose noktalarindan)
function faceMaxZ(mesh, faceIdx, frame) {
  let m = -Infinity; const V3 = mesh.vertices, T = mesh.triangles;
  for (const g of mesh.faceGroups) {
    if (g.idx !== faceIdx) continue;
    for (let k = g.start; k < g.start + g.count; k++) { const vi = T[k] * 3; const z = (V3[vi] - frame.o[0]) * frame.z[0] + (V3[vi + 1] - frame.o[1]) * frame.z[1] + (V3[vi + 2] - frame.o[2]) * frame.z[2]; if (z > m) m = z; }
  }
  return m;
}

// camFaceLoops {ref, frame} -> { z, normalOk, outer:[seg], inners:[[seg]], open:bool, body }
export function camFaceLoops(K, { ref, frame }) {
  checkFrame(frame);
  const st = K.last; if (!st) throw E('cam.no_model');
  const { body, i } = K.resolveIdx(ref, st, 'face', {});
  const T = TP.topoOf(body.shape); const face = TP.faceWrap(T.faces.list[i]);
  if (face.geomType !== 'PLANE') throw E('cam.face_not_flat');
  const n = face.normalAt(face.center).toTuple(); const k = V.dot(n, frame.z);
  if (Math.abs(Math.abs(k) - 1) > 1e-7) throw E('cam.face_not_flat');
  const z = toF(frame, face.center.toTuple())[2];
  const bb = body.shape.boundingBox; const scale = Math.max(1, Math.hypot(bb.width, bb.height, bb.depth));
  const mesh = K.mesh(body); if (mesh.error) throw E('cam.mesh_failed');
  const items = [];
  for (const j of T.faceEdges[i]) {
    const segs = edgeSegs(T.edges.list[j], frame, z, 1e-6 * scale);
    const nb = T.edgeFaces[j].filter((f) => f !== i);
    const open = !nb.length || nb.every((f) => faceMaxZ(mesh, f, frame) <= z + OPEN_TOL);
    for (const s of segs) items.push({ ...s, open, edge: j });
  }
  if (!items.length) throw E('cam.loop_open');
  const loops = orientNested(chainLoops(items, 1e-5 * scale));
  loops.sort((a, b) => b.area - a.area);
  const outerL = loops[0]; if (outerL.depth !== 0) throw E('cam.loop_open');
  const inners = loops.slice(1).map((l) => l.loop.map(cleanItem));
  const open = items.some((it) => it.open);
  // acik kenar varsa: tabanin hemen ustundeki malzeme kesiti (acik kenar uzatmasinin modele carpmadigini denetlemek icin)
  const above = open ? camSection(K, { body: ref.body, frame, z: z + ABOVE_DZ }).loops : null;
  return { z, normalOk: k > 0, outer: outerL.loop.map(cleanItem), inners, open, above, aboveDz: open ? ABOVE_DZ : null, body: ref.body };
}

// camSection {body, frame, z} -> { z, loops:[[seg]] } (malzeme gidis yonunun solunda; dis donguler CCW)
export function camSection(K, { body: bodyId, frame, z }) {
  checkFrame(frame); if (!Number.isFinite(z)) throw E('cam.frame_bad');
  const st = K.last; const b = st?.bodies.get(bodyId); if (!b) throw E('cam.body_missing', { body: String(bodyId) });
  const O = oc(); const r = TP.scope();
  const items = [];
  try {
    const p0 = V.add(frame.o, V.mul(frame.z, z));
    const pln = r(new O.gp_Pln(r(new O.gp_Pnt(p0[0], p0[1], p0[2])), r(new O.gp_Dir(frame.z[0], frame.z[1], frame.z[2]))));
    const sec = r(new O.BRepAlgoAPI_Section(b.shape.wrapped, pln, true));
    if (!sec.IsDone()) throw E('cam.section_failed');
    const shp = r(sec.Shape());
    const sub = new TP.SubIndex(shp, 'edge');
    try { for (const e of sub.list) for (const s of edgeSegs(e, frame, null, 0)) items.push(s); }
    finally { sub.list.forEach((x) => x.delete()); }
  } finally { r.done(); }
  if (!items.length) return { z, loops: [] };
  const bb = b.shape.boundingBox; const scale = Math.max(1, Math.hypot(bb.width, bb.height, bb.depth));
  const loops = orientNested(chainLoops(items, 1e-5 * scale));
  return { z, loops: loops.map((l) => l.loop.map(cleanItem)) };
}

// camHeightmap {bodies, frame, res, bbox:[x0,y0,x1,y1]} -> { x0, y0, res, nx, ny, data: Float32Array (data[j*nx+i]), err }
// B'nin (src/cam/sim/heightmap.js) bicimi: hucre (i,j) MERKEZI (x0+(i+0.5)res, y0+(j+0.5)res) noktasinda takim ekseni
// boyunca en ust model yuzeyi; malzeme yoksa -Infinity. err = ucgen agi sapmasi (mm; hucre ici ornekleme hatasi DAHIL DEGIL).
export function camHeightmap(K, { bodies, frame, res, bbox }) {
  checkFrame(frame);
  if (!Array.isArray(bodies) || !bodies.length) throw E('cam.body_missing', { body: '' });
  if (!(Number.isFinite(res) && res > 0)) throw E('cam.heightmap_bad');
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite) || !(bbox[2] > bbox[0] && bbox[3] > bbox[1])) throw E('cam.heightmap_bad');
  const nx = Math.max(1, Math.round((bbox[2] - bbox[0]) / res)), ny = Math.max(1, Math.round((bbox[3] - bbox[1]) / res));
  if (nx * ny > HM_MAX_CELLS) throw E('cam.heightmap_too_big', { cells: nx * ny, max: HM_MAX_CELLS });
  const Z = new Float32Array(nx * ny).fill(-Infinity);
  const meshTol = Math.min(0.01, res / 4);
  for (const id of bodies) {
    const b = K.last?.bodies.get(id); if (!b) throw E('cam.body_missing', { body: String(id) });
    const m = b.shape.mesh({ tolerance: meshTol, angularTolerance: 0.1 });
    const Vt = m.vertices, Tr = m.triangles; const nv = Vt.length / 3; const P = new Float64Array(nv * 3);
    for (let v = 0; v < nv; v++) { const q = toF(frame, [Vt[3 * v], Vt[3 * v + 1], Vt[3 * v + 2]]); P[3 * v] = q[0]; P[3 * v + 1] = q[1]; P[3 * v + 2] = q[2]; }
    for (let t = 0; t < Tr.length; t += 3) rasterTri(P, Tr[t], Tr[t + 1], Tr[t + 2], Z, nx, ny, bbox[0], bbox[1], res);
  }
  return { x0: bbox[0], y0: bbox[1], res, nx, ny, data: Z, err: meshTol };
}
function rasterTri(P, a, b, c, Z, nx, ny, x0, y0, res) {
  const ax = P[3 * a], ay = P[3 * a + 1], az = P[3 * a + 2], bx = P[3 * b], by = P[3 * b + 1], bz = P[3 * b + 2], cx = P[3 * c], cy = P[3 * c + 1], cz = P[3 * c + 2];
  const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(den) < 1e-14) return; // dik ucgen (izdusumu cizgi): yukseklik komsu ucgenlerden gelir
  const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / res - 0.5 - 1e-9)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / res - 0.5 + 1e-9));
  const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - y0) / res - 0.5 - 1e-9)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - y0) / res - 0.5 + 1e-9));
  const e = -1e-9;
  for (let j = j0; j <= j1; j++) {
    const y = y0 + (j + 0.5) * res;
    for (let i = i0; i <= i1; i++) {
      const x = x0 + (i + 0.5) * res;
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < e || l2 < e || l3 < e) continue;
      const z = l1 * az + l2 * bz + l3 * cz; const k = j * nx + i; if (z > Z[k]) Z[k] = z;
    }
  }
}
