// OCCT yardımcıları: alt şekil dizinleri, geçmiş (history) ile boolean / yuvarlatma / pah / kabuk / dönüşüm,
// prizma ve dönel süpürme, geçerlilik kapısı. Ham OCCT nesneleri ya açıkça silinir ya bir sarmalayıcıya bağlanıp
// FinalizationRegistry ile silinir (F-20). replicad'in kaynak şekli silen yöntemleri (translate/rotate/mirror/fillet…)
// burada KULLANILMAZ: önbellekteki şekiller değişmez kalır (F-09).
import * as R from 'replicad';

const HMAX = 2147483647;
const oc = () => R.getOC();
const fin = new FinalizationRegistry((arr) => { for (const o of arr) { try { o.delete(); } catch (e) { /* zaten silinmiş */ } } });

// Geçici OCCT nesneleri için kapsam: r(x) kaydeder, done() hepsini siler.
export function scope() {
  const list = [];
  const r = (x) => { if (x && typeof x.delete === 'function') list.push(x); return x; };
  r.done = () => { for (let i = list.length - 1; i >= 0; i--) { try { list[i].delete(); } catch (e) { /* */ } } list.length = 0; };
  return r;
}

const KIND = () => { const E = oc().TopAbs_ShapeEnum; return { face: E.TopAbs_FACE, edge: E.TopAbs_EDGE, vertex: E.TopAbs_VERTEX, solid: E.TopAbs_SOLID, shell: E.TopAbs_SHELL, shape: E.TopAbs_SHAPE }; };
export const hashOf = (s) => oc().ReplicadShapeHasher.HashCode(s, HMAX);

// Benzersiz alt şekillerin keşif sırasındaki dizini (replicad .faces/.edges ile aynı sıra).
export class SubIndex {
  constructor(shape, kind, avoid) {
    const K = KIND(); this.list = []; this.h = new Map();
    const ex = avoid ? new (oc().TopExp_Explorer)(shape, K[kind], K[avoid]) : new (oc().TopExp_Explorer)(shape, K[kind], K.shape);
    for (; ex.More(); ex.Next()) { const c = ex.Current(); if (this.add(c) < 0) c.delete(); }
    ex.delete();
  }
  add(c) { const k = hashOf(c); let b = this.h.get(k); if (!b) { b = []; this.h.set(k, b); } for (const i of b) if (this.list[i].IsSame(c)) return -1; b.push(this.list.length); this.list.push(c); return this.list.length - 1; }
  find(s) { const b = this.h.get(hashOf(s)); if (!b) return -1; for (const i of b) if (this.list[i].IsSame(s)) return i; return -1; }
  get size() { return this.list.length; }
}

// Gövde topolojisi (önbellekli): yüz/kenar/köşe dizinleri ve komşuluklar.
const topoCache = new WeakMap();
export function topoOf(w) {
  let T = topoCache.get(w); if (T) return T;
  const sh = w.wrapped;
  const faces = new SubIndex(sh, 'face'), edges = new SubIndex(sh, 'edge'), verts = new SubIndex(sh, 'vertex');
  const edgeFaces = edges.list.map(() => []), faceEdges = faces.list.map(() => []), edgeVerts = edges.list.map(() => []);
  faces.list.forEach((f, i) => { const sub = new SubIndex(f, 'edge'); for (const e of sub.list) { const j = edges.find(e); if (j >= 0) { if (!edgeFaces[j].includes(i)) edgeFaces[j].push(i); faceEdges[i].push(j); } } sub.list.forEach((x) => x.delete()); });
  edges.list.forEach((e, j) => { const sub = new SubIndex(e, 'vertex'); for (const v of sub.list) { const k = verts.find(v); if (k >= 0) edgeVerts[j].push(k); } sub.list.forEach((x) => x.delete()); });
  const vertFaces = verts.list.map(() => new Set());
  edgeVerts.forEach((vs, j) => { for (const k of vs) for (const f of edgeFaces[j]) vertFaces[k].add(f); });
  T = { faces, edges, verts, edgeFaces, faceEdges, edgeVerts, vertFaces: vertFaces.map((s) => [...s]) };
  fin.register(w, [...faces.list, ...edges.list, ...verts.list]);
  topoCache.set(w, T);
  return T;
}

// NCollection_List → dizi (öğeler çağıranındır; silinmeli)
export function listArr(l) {
  const c = new (oc().NCollection_List_TopoDS_Shape)(l); const out = [];
  while (c.Size() > 0) { out.push(c.First()); c.RemoveFirst(); }
  c.delete(); l.delete();
  return out;
}
// NCollection_List.Append eklenen öğenin kopya tutamacını döndürür: silinmezse şekli bellekte tutar (F-20)
const app = (list, s) => { const x = list.Append(s); if (x && typeof x.delete === 'function') x.delete(); };
export const wrap = (raw) => { const w = R.cast(raw); raw.delete(); return w; };
const P = (r, p) => r(new (oc().gp_Pnt)(p[0], p[1], p[2]));
const Dv = (r, d) => r(new (oc().gp_Dir)(d[0], d[1], d[2]));
const Vv = (r, d) => r(new (oc().gp_Vec)(d[0], d[1], d[2]));
const progress = (r) => r(new (oc().Message_ProgressRange)());

// Geçmişten isim aktarımı. inputs: [{shape(wrapper), fn: string[][]}], map: isim dönüştürücü (desen önekleri için)
// Döner: sonuç yüzlerinin ad kümeleri (sıralı dizi), sonuç yüz sırasıyla.
export function propagate(b, inputs, res, opt = {}) {
  const T = topoOf(res); const out = T.faces.list.map(() => new Set());
  for (const inp of inputs) {
    const Ti = topoOf(inp.shape); const map = inp.map || ((x) => x);
    Ti.faces.list.forEach((f, i) => {
      const names = (inp.fn[i] || []).map(map); if (!names.length) return;
      let del = false; try { del = b.IsDeleted(f); } catch (e) { del = false; }
      if (del) return;
      const mods = listArr(b.Modified(f));
      if (!mods.length) { const k = T.faces.find(f); if (k >= 0) names.forEach((n) => out[k].add(n)); }
      else for (const m of mods) { const k = T.faces.find(m); if (k >= 0) names.forEach((n) => out[k].add(n)); m.delete(); }
    });
    if (opt.generated) opt.generated(Ti, (src, nameOf) => { const gs = listArr(b.Generated(src)); for (const g of gs) { const k = T.faces.find(g); if (k >= 0) out[k].add(nameOf); g.delete(); } });
  }
  return out.map((s) => [...s].sort());
}

// Boolean: args/tools = [{shape, fn, map?}]. Tek BOP çağrısı (çok takım = O(n), F-11).
export function boolean(op, args, tools) {
  const O = oc(); const r = scope();
  try {
    const b = r(op === 'fuse' ? new O.BRepAlgoAPI_Fuse() : op === 'cut' ? new O.BRepAlgoAPI_Cut() : new O.BRepAlgoAPI_Common());
    const la = r(new O.NCollection_List_TopoDS_Shape()), lt = r(new O.NCollection_List_TopoDS_Shape());
    for (const a of args) app(la, a.shape.wrapped); for (const t of tools) app(lt, t.shape.wrapped);
    b.SetArguments(la); b.SetTools(lt); b.Build(progress(r));
    if (!b.IsDone() || b.HasErrors()) return null;
    b.SimplifyResult(true, true, 1e-3);
    const raw = b.Shape(); if (raw.IsNull()) { raw.delete(); return null; }
    const shape = wrap(raw);
    const fn = propagate(b, [...args, ...tools], shape);
    return { shape, fn };
  } finally { r.done(); }
}

// Kenar işlemleri: kind 'fillet'|'chamfer'; edges = ham kenar dizini; nameOfEdge(j), nameOfVert(k) → üretilen yüz adı
// WP-08: spec(j) → {d1, d2, face} (iki mesafe; face: d1'in ölçüldüğü komşu yüz dizini) ya da {d, angle, face} (mesafe + açı, derece)
export function edgeBlend(kind, body, edgeIdx, val, nameOfEdge, nameOfVert, spec = null) {
  const O = oc(); const r = scope(); const T = topoOf(body.shape);
  try {
    const b = r(kind === 'fillet' ? new O.BRepFilletAPI_MakeFillet(body.shape.wrapped, O.ChFi3d_FilletShape.ChFi3d_Rational) : new O.BRepFilletAPI_MakeChamfer(body.shape.wrapped));
    for (const j of edgeIdx) {
      const e = r(O.TopoDS.Edge(T.edges.list[j])); const sp = spec ? spec(j) : null;
      if (!sp) { b.Add(val, e); continue; }
      const F = r(O.TopoDS.Face(T.faces.list[sp.face]));
      if (sp.angle != null) b.AddDA(sp.d, (sp.angle * Math.PI) / 180, e, F); else b.Add(sp.d1, sp.d2, e, F);
    }
    b.Build(progress(r));
    if (!b.IsDone()) return null;
    const raw = b.Shape(); if (raw.IsNull()) { raw.delete(); return null; }
    const shape = wrap(raw);
    const fn = propagate(b, [{ shape: body.shape, fn: body.fn }], shape, {
      generated: (Ti, gen) => {
        for (const j of edgeIdx) gen(Ti.edges.list[j], nameOfEdge(j));
        const vs = new Set(); for (const j of edgeIdx) for (const k of Ti.edgeVerts[j]) vs.add(k);
        for (const k of vs) gen(Ti.verts.list[k], nameOfVert(k));
      },
    });
    return { shape, fn };
  } finally { r.done(); }
}

// Kabuk: faceIdx kaldırılacak yüzler; nameOfFace(i) iç yüz adı kökü
export function shell(body, faceIdx, t, nameGen) {
  const O = oc(); const r = scope(); const T = topoOf(body.shape);
  try {
    const rem = r(new O.NCollection_List_TopoDS_Shape()); for (const i of faceIdx) app(rem, T.faces.list[i]);
    const b = r(new O.BRepOffsetAPI_MakeThickSolid());
    b.MakeThickSolidByJoin(body.shape.wrapped, rem, -t, 1e-3, O.BRepOffset_Mode.BRepOffset_Skin, false, false, O.GeomAbs_JoinType.GeomAbs_Arc, false, progress(r));
    if (!b.IsDone()) return null;
    const raw = b.Shape(); if (raw.IsNull()) { raw.delete(); return null; }
    const shape = wrap(raw);
    const fn = propagate(b, [{ shape: body.shape, fn: body.fn }], shape, {
      generated: (Ti, gen) => {
        Ti.faces.list.forEach((f, i) => gen(f, nameGen('f', i)));
        Ti.edges.list.forEach((e, j) => gen(e, nameGen('e', j)));
        Ti.verts.list.forEach((v, k) => gen(v, nameGen('v', k)));
      },
    });
    return { shape, fn };
  } finally { r.done(); }
}

// Dönüşüm: m = {t:[x,y,z]} | {rot:{c,ax,deg}} | {mirror:{o,n}} dizisi (sırayla uygulanır)
export function makeTrsf(steps, r) {
  const O = oc(); const tr = r(new O.gp_Trsf());
  for (const s of steps) {
    const x = r(new O.gp_Trsf());
    if (s.t) x.SetTranslation(Vv(r, s.t));
    else if (s.rot) x.SetRotation(r(new O.gp_Ax1(P(r, s.rot.c), Dv(r, s.rot.ax))), (s.rot.deg * Math.PI) / 180);
    else if (s.mirror) x.SetMirror(r(new O.gp_Ax2(P(r, s.mirror.o), Dv(r, s.mirror.n))));
    tr.PreMultiply(x);
  }
  return tr;
}
export function transform(item, steps, map) {
  const O = oc(); const r = scope();
  try {
    const tr = makeTrsf(steps, r);
    const b = r(new O.BRepBuilderAPI_Transform(item.shape.wrapped, tr, true, false));
    const raw = b.Shape(); const shape = wrap(raw);
    const fn = propagate(b, [{ shape: item.shape, fn: item.fn, map }], shape);
    return { shape, fn };
  } finally { r.done(); }
}
// Noktayı/yönü aynı dönüşümle taşı (delik verisi için)
export function xformPoint(steps, p, isDir) {
  const O = oc(); const r = scope();
  try {
    const tr = makeTrsf(steps, r);
    if (isDir) { const v = Vv(r, p); v.Transform(tr); return [v.X(), v.Y(), v.Z()]; }
    const q = P(r, p); q.Transform(tr); return [q.X(), q.Y(), q.Z()];
  } finally { r.done(); }
}

// Prizma: face (wrapper), vec. Döner {shape, first, last, gen(edgeRaw)→[yüz dizini]}
export function prism(face, vec) {
  const O = oc(); const r = scope();
  try {
    const b = r(new O.BRepPrimAPI_MakePrism(face.wrapped, Vv(r, vec), false, true)); b.Build(progress(r));
    if (!b.IsDone()) return null;
    return sweepResult(b, face, r, true);
  } finally { r.done(); }
}
export function revol(face, c, dir, deg) {
  const O = oc(); const r = scope();
  try {
    const b = r(new O.BRepPrimAPI_MakeRevol(face.wrapped, r(new O.gp_Ax1(P(r, c), Dv(r, dir))), (deg * Math.PI) / 180, false)); b.Build(progress(r));
    if (!b.IsDone()) return null;
    return sweepResult(b, face, r, Math.abs(Math.abs(deg) - 360) > 1e-9);
  } finally { r.done(); }
}
// caps=false: tam dönüşte kapak yok; FirstShape/LastShape çağrılmaz (OCCT istisnası JS'e geçince bellekte kalır)
function sweepResult(b, face, r, caps) {
  const shape = wrap(b.Shape()); const T = topoOf(shape);
  const fe = new SubIndex(face.wrapped, 'edge');
  const gens = fe.list.map((e) => listArr(b.Generated(e)).map((g) => { const k = T.faces.find(g); g.delete(); return k; }).filter((k) => k >= 0));
  let first = -1, last = -1;
  if (caps) {
    try { const f = b.FirstShape(); first = T.faces.find(f); f.delete(); } catch (e) { /* */ }
    try { const l = b.LastShape(); last = T.faces.find(l); l.delete(); } catch (e) { /* */ }
  }
  // OCCT bazı süpürmelerde (eksene dik kenar → düzlem) Generated() boş döner: geometrik yedek.
  // Kenarın orta noktası yüzün üzerindeyse ve tek aday varsa o yüz; değilse ad verilmez (seçilemez, sessiz yanlış yok).
  const claimed = new Set(gens.flat()); if (first >= 0) claimed.add(first); if (last >= 0) claimed.add(last);
  fe.list.forEach((e, k) => {
    if (gens[k].length) return;
    const m = edgeMid(e); const cands = [];
    T.faces.list.forEach((f, i) => { if (claimed.has(i)) return; if (pointFaceDist(f, m) < 1e-7 * Math.max(1, Math.hypot(...m))) cands.push(i); });
    if (cands.length === 1) { gens[k] = cands; claimed.add(cands[0]); }
  });
  const edges = fe.list; fin.register(shape, edges);
  return { shape, edges, gens, first, last };
}

// nokta-yüz uzaklığı (replicad measureDistanceBetween çağrı başına bellek bırakıyor; burada açıkça silinir)
export function pointFaceDist(faceRaw, p) {
  const O = oc(); const r = scope();
  try { const v = r(new O.BRepBuilderAPI_MakeVertex(P(r, p))); const vs = r(v.Vertex()); const d = r(new O.BRepExtrema_DistShapeShape(vs, faceRaw)); return d.IsDone() ? d.Value() : Infinity; }
  catch (e) { return Infinity; } finally { r.done(); }
}
// Kenarın orta noktası (parametrik)
export function edgeMid(edgeRaw) {
  const O = oc(); const r = scope();
  try { const e = r(O.TopoDS.Edge(edgeRaw)); const c = r(new O.BRepAdaptor_Curve(e)); const t = (c.FirstParameter() + c.LastParameter()) / 2; const p = r(c.Value(t)); return [p.X(), p.Y(), p.Z()]; }
  finally { r.done(); }
}
// Kenar kurucuları: replicad makeLine/makeThreePointArc kurucu nesneyi silmiyor (kenar ve onu paylaşan şekiller bellekte kalıyor, F-20)
export function makeLine(a, b) { const O = oc(); const r = scope(); try { const m = r(new O.BRepBuilderAPI_MakeEdge(P(r, a), P(r, b))); return new R.Edge(m.Edge()); } finally { r.done(); } }
export function makeArc3(a, m, b) { const O = oc(); const r = scope(); try { const g = r(new O.GC_MakeArcOfCircle(P(r, a), P(r, m), P(r, b))); const c = r(g.Value()); const e = r(new O.BRepBuilderAPI_MakeEdge(c)); return new R.Edge(e.Edge()); } finally { r.done(); } }
export function makePolygon(pts) { return R.makeFace(R.assembleWire(pts.map((p, i) => makeLine(p, pts[(i + 1) % pts.length])))); }
export function faceWrap(raw) { const O = oc(); return new R.Face(O.TopoDS.Face(raw)); }
export function edgeWrap(raw) { const O = oc(); return new R.Edge(O.TopoDS.Edge(raw)); }

// Geçerlilik kapısı (F-05): BRepCheck + kapalı katı + sonlu kutu + hacim > 0
const validCache = new WeakMap();
export function validity(w) { if (validCache.has(w)) return validCache.get(w); const v = validity0(w); validCache.set(w, v); return v; }
function validity0(w) {
  const O = oc(); const r = scope();
  try {
    const sh = w.wrapped; if (sh.IsNull()) return 'null';
    const an = r(new O.BRepCheck_Analyzer(sh, true, false)); if (!an.IsValid()) return 'brepcheck';
    const solids = new SubIndex(sh, 'solid'); const ns = solids.size; solids.list.forEach((x) => x.delete()); if (!ns) return 'no_solid';
    const free = new SubIndex(sh, 'face', 'solid'); const nf = free.size; free.list.forEach((x) => x.delete()); if (nf) return 'free_faces';
    const bb = w.boundingBox; const b = bb.bounds; if (b.flat().some((x) => !Number.isFinite(x))) return 'bbox';
    const v = R.measureVolume(w); if (!(v > 0) || !Number.isFinite(v)) return 'volume';
    return null;
  } catch (e) { return 'exception'; }
  finally { r.done(); }
}
// eş düzlemli/eş yüzeyli komşu yüzleri birleştir (STL içe aktarma)
export function unify(w) { const O = oc(); const r = scope(); try { const u = r(new O.ShapeUpgrade_UnifySameDomain(w.wrapped, true, true, false)); u.Build(); return wrap(u.Shape()); } finally { r.done(); } }
export function faceValid(w) { const O = oc(); const r = scope(); try { return r(new O.BRepCheck_Analyzer(w.wrapped, true, false)).IsValid(); } catch (e) { return false; } finally { r.done(); } }
export function solidsOf(w) { const s = new SubIndex(w.wrapped, 'solid'); const out = s.list.map((x) => wrap(x)); return out; }
export const volume = (w) => { try { return R.measureVolume(w); } catch (e) { return NaN; } };

// ---- WP-08 yardımcıları
// İki şekil arası en kısa uzaklık (BRepExtrema; geçici nesneler silinir)
export function shapeDist(a, b) {
  const O = oc(); const r = scope();
  try { const d = r(new O.BRepExtrema_DistShapeShape(a, b)); return d.IsDone() ? d.Value() : NaN; }
  catch (e) { return NaN; } finally { r.done(); }
}
// Düzlem üzerinde, merkezi c olan 2B×2B kare yüz (birim normal n)
export function planeSquare(c, n, B) {
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = norm3(cross3(a, n)), y = cross3(n, x);
  const q = (s, t) => [c[0] + x[0] * s + y[0] * t, c[1] + x[1] * s + y[1] * t, c[2] + x[2] * s + y[2] * t];
  return makePolygon([q(-B, -B), q(B, -B), q(B, B), q(-B, B)]);
}
// Yarım uzay katısı: düzlem (c, n) üzerindeki kareden `toward` yönüne L kadar prizma. Düzlemdeki kapak `capName` adını alır.
export function halfSpace(c, n, toward, B, L, capName) {
  const sq = planeSquare(c, n, B);
  const p = prism(sq, [toward[0] * L, toward[1] * L, toward[2] * L]); if (!p) return null;
  const fn = Array.from({ length: topoOf(p.shape).faces.size }, () => []);
  if (p.first >= 0) fn[p.first] = [capName];
  return { shape: p.shape, fn };
}
// Konik (taper) yüzler: BRepOffsetAPI_DraftAngle; adlar Modified geçmişiyle aktarılır. Başarısızsa null.
export function draft(item, faceIdx, dir, deg, plane) {
  const O = oc(); const r = scope(); const T = topoOf(item.shape);
  try {
    const b = r(new O.BRepOffsetAPI_DraftAngle(item.shape.wrapped));
    const pln = r(new O.gp_Pln(P(r, plane.o), Dv(r, plane.n)));
    for (const i of faceIdx) {
      const F = r(O.TopoDS.Face(T.faces.list[i]));
      b.Add(F, Dv(r, dir), (deg * Math.PI) / 180, pln, true);
      if (!b.AddDone()) return null;
    }
    b.Build(progress(r)); if (!b.IsDone()) return null;
    const raw = b.Shape(); if (raw.IsNull()) { raw.delete(); return null; }
    const shape = wrap(raw);
    return { shape, fn: propagate(b, [{ shape: item.shape, fn: item.fn }], shape) };
  } catch (e) { return null; } finally { r.done(); }
}
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// WP-08: teğet zincir. Kenar j'den başlayıp ortak köşelerde teğeti sürekli (G1) tek komşu kenar varsa ilerler.
// Döner: zincirdeki kenar dizinleri (j dahil, sıralı). Belirsiz (birden çok teğet aday) köşede durur.
export function tangentChain(w, j0, tolAng = 1e-3) {
  const O = oc(); const T = topoOf(w);
  const vk = (k) => T.verts.list[k];
  const tanAt = (j, k) => { // kenar j'nin köşe k'deki, köşeden DIŞARI bakan birim teğeti
    const r = scope();
    try {
      const e = r(O.TopoDS.Edge(T.edges.list[j])); const c = r(new O.BRepAdaptor_Curve(e));
      const v = r(O.TopoDS.Vertex(vk(k))); const p0 = r(O.BRep_Tool.Pnt(v));
      const t0 = c.FirstParameter(), t1 = c.LastParameter(); const a = r(c.Value(t0)), b = r(c.Value(t1));
      const atStart = a.Distance(p0) <= b.Distance(p0); const t = atStart ? t0 : t1;
      const P = r(new O.gp_Pnt(0, 0, 0)), D = r(new O.gp_Vec(0, 0, 0)); c.D1(t, P, D);
      const L = D.Magnitude(); if (!(L > 1e-12)) return null;
      const s = atStart ? 1 : -1; return [s * D.X() / L, s * D.Y() / L, s * D.Z() / L];
    } catch (e) { return null; } finally { r.done(); }
  };
  const vertEdges = new Map(); T.edgeVerts.forEach((vs, j) => { for (const k of vs) { if (!vertEdges.has(k)) vertEdges.set(k, []); vertEdges.get(k).push(j); } });
  const seen = new Set([j0]); const order = [j0];
  const walk = (j, kFrom, push) => {
    let cur = j, from = kFrom;
    for (let guard = 0; guard < 10000; guard++) {
      const vs = T.edgeVerts[cur]; if (!vs || vs.length !== 2) return; // kapalı (tek köşeli) kenar: zincir kendisi
      const k = vs[0] === from ? vs[1] : vs[0];
      const tc = tanAt(cur, k); if (!tc) return;
      const cands = (vertEdges.get(k) || []).filter((x) => x !== cur && T.edgeFaces[x].length === 2).filter((x) => { const tx = tanAt(x, k); return tx && tc[0] * tx[0] + tc[1] * tx[1] + tc[2] * tx[2] < -1 + tolAng; });
      if (cands.length !== 1 || seen.has(cands[0])) return;
      seen.add(cands[0]); push(cands[0]); from = k; cur = cands[0];
    }
  };
  const vs0 = T.edgeVerts[j0] || [];
  if (vs0.length === 2) { walk(j0, vs0[0], (x) => order.push(x)); walk(j0, vs0[1], (x) => order.unshift(x)); }
  return order;
}
