// WP-08: gövde bölme, yüz bölme ve doğrudan düzenleme (yüz ofsetle / taşı / sil). İçe aktarılan (STEP) gövdelerde de çalışır.
// İlke: ya doğru sonuç ya açık hata. Desteklenmeyen geometri (ör. düzlemsel olmayan kapak) sessizce yaklaşıklanmaz.
import * as R from 'replicad';
import { KErr } from '../shared/errors.js';
import * as V from '../shared/vec.js';
import * as TP from './topo.js';

const oc = () => R.getOC();
const volTol = (v) => 1e-7 * Math.max(1, Math.abs(v));
const empty = (s) => { try { return !s || TP.topoOf(s).faces.size === 0; } catch (e) { return true; } };

// Gövdeyi düzlemle ikiye böl. Döner {pos, neg} (pos: düzlem normali tarafı). Kesik yüzler `<id>:cut` adını alır.
export function splitBody(body, pl, id, big) {
  const hs = TP.halfSpace(pl.o, pl.n, pl.n, 4 * big, 8 * big, `${id}:cut`); if (!hs) throw new KErr('split.failed');
  const pos = TP.boolean('common', [body], [hs]), neg = TP.boolean('cut', [body], [hs]);
  if (!pos || !neg) throw new KErr('split.failed');
  if (empty(pos.shape) || empty(neg.shape)) throw new KErr('split.no_effect');
  return { pos, neg };
}

// Seçili yüzleri düzlemle böl (gövde tek parça kalır). Parçalar özgün adları + `<id>:+` / `<id>:-` (düzlemin hangi tarafı) taşır.
export function splitFaces(body, faceIdx, pl, id) {
  const O = oc(); const r = TP.scope(); const T = TP.topoOf(body.shape);
  try {
    const pln = r(new O.gp_Pln(r(new O.gp_Pnt(...pl.o)), r(new O.gp_Dir(...pl.n))));
    const tools = r(new O.NCollection_List_TopoDS_Shape()); let ne = 0;
    for (const i of faceIdx) {
      const sec = r(new O.BRepAlgoAPI_Section(T.faces.list[i], pln, false)); sec.Build(r(new O.Message_ProgressRange()));
      if (!sec.IsDone()) continue;
      const sh = r(sec.Shape()); const es = new TP.SubIndex(sh, 'edge');
      for (const e of es.list) { const x = tools.Append(e); if (x && x.delete) x.delete(); ne++; }
      es.list.forEach((x) => x.delete());
    }
    if (!ne) throw new KErr('split.face_miss');
    const sp = r(new O.BRepAlgoAPI_Splitter());
    const args = r(new O.NCollection_List_TopoDS_Shape()); { const x = args.Append(body.shape.wrapped); if (x && x.delete) x.delete(); }
    sp.SetArguments(args); sp.SetTools(tools); sp.Build(r(new O.Message_ProgressRange()));
    if (!sp.IsDone() || sp.HasErrors()) throw new KErr('split.failed');
    const solids = TP.solidsOf(TP.wrap(sp.Shape())); if (solids.length !== 1) throw new KErr('split.failed');
    const shape = solids[0];
    const fn = TP.propagate(sp, [{ shape: body.shape, fn: body.fn }], shape);
    const RT = TP.topoOf(shape); let pieces = 0;
    for (const i of faceIdx) {
      const mods = TP.listArr(sp.Modified(T.faces.list[i]));
      for (const m of mods) { const k = RT.faces.find(m); m.delete(); if (k < 0) continue; pieces++; const c = TP.faceWrap(RT.faces.list[k]).center.toTuple(); fn[k] = [...new Set([...fn[k], `${id}:${V.dot(V.sub(c, pl.o), pl.n) >= 0 ? '+' : '-'}`])].sort(); }
    }
    if (pieces < 2) throw new KErr('split.face_miss');
    return { shape, fn };
  } finally { r.done(); }
}

const faceInfo = (T, i) => { const F = TP.faceWrap(T.faces.list[i]); return { F, geom: F.geomType, n: F.geomType === 'PLANE' ? V.norm(F.normalAt(F.center).toTuple()) : null, c: F.center.toTuple() }; };
const cylAxis = (F) => { try { const a = F.surface.wrapped.Cylinder().Axis().Direction(); return [a.X(), a.Y(), a.Z()]; } catch (e) { return null; } };

// Düzlemsel yüzü normali boyunca d kadar ötele (d>0 dışa). Komşular yüze dik olmalı (o zaman prizma ekleme/çıkarma tam ofsettir).
function offsetFace(body, i, d, id) {
  const T = TP.topoOf(body.shape); const { F, geom, n } = faceInfo(T, i);
  if (geom !== 'PLANE') throw new KErr('faceop.offset_planar');
  for (const e of T.faceEdges[i]) for (const g of T.edgeFaces[e]) {
    if (g === i) continue; const G = faceInfo(T, g);
    // dik komşu ya da aynı düzlemdeki komşu (yüz bölme parçası): prizma ekleme/çıkarma tam ofsettir
    if (G.geom === 'PLANE') { const coplanar = V.dot(G.n, n) > 1 - 1e-9 && Math.abs(V.dot(V.sub(G.c, faceInfo(T, i).c), n)) < 1e-7 * Math.max(1, Math.hypot(...G.c)); if (Math.abs(V.dot(G.n, n)) > 1e-6 && !coplanar) throw new KErr('faceop.neighbors'); }
    else if (G.geom === 'CYLINDRE') { const a = cylAxis(G.F); if (!a || Math.abs(Math.abs(V.dot(a, n)) - 1) > 1e-6) throw new KErr('faceop.neighbors'); }
    else throw new KErr('faceop.neighbors');
  }
  const p = TP.prism(F, V.mul(n, d)); if (!p) throw new KErr('faceop.failed');
  const fn = Array.from({ length: TP.topoOf(p.shape).faces.size }, () => []);
  if (p.last >= 0) fn[p.last] = [...new Set([...(body.fn[i] || []), `${id}:off`])].sort();
  const v0 = TP.volume(body.shape);
  const res = TP.boolean(d > 0 ? 'fuse' : 'cut', [body], [{ shape: p.shape, fn }]);
  if (!res || empty(res.shape)) throw new KErr('faceop.failed');
  const solids = TP.solidsOf(res.shape); if (solids.length !== 1) throw new KErr('faceop.failed');
  const dv = Math.abs(TP.volume(res.shape) - v0); if (!(dv > volTol(v0))) throw new KErr('faceop.no_effect');
  // WP-08 doğrulama: dik komşularda değişen hacim tam alan × |d| olmalı; farklıysa içe ofset gövdeyi delip geçti ya da dışa ofset
  // başka malzemeye çarptı (sonuç sessiz kalmaz: uyarı)
  const exp = R.measureArea(F) * Math.abs(d);
  if (Math.abs(dv - exp) > 1e-6 * Math.max(1, exp)) res.warn = [{ code: d < 0 ? 'faceop.through' : 'faceop.collide', params: {} }];
  return res;
}

// Seçili yüz kümesinin sınırladığı hacim: seçili yüzler + her sınır döngüsü için düzlemsel kapak → kapalı kabuk → katı.
// Yüz adları korunur (eşleşen özgün yüzün adları), kapaklar `<id>:fill`.
function faceVolume(body, faceIdx, id) {
  const O = oc(); const T = TP.topoOf(body.shape); const S = new Set(faceIdx);
  const bnd = []; for (const i of S) for (const e of T.faceEdges[i]) if (T.edgeFaces[e].some((g) => !S.has(g)) && !bnd.includes(e)) bnd.push(e);
  if (!bnd.length) throw new KErr('faceop.no_boundary');
  // sınır kenarlarını köşe paylaşımıyla döngülere ayır
  const par = new Map(); const find = (x) => { while (par.get(x) !== x) x = par.get(x); return x; };
  for (const e of bnd) par.set(e, e);
  for (const a of bnd) for (const b of bnd) if (a < b && T.edgeVerts[a].some((k) => T.edgeVerts[b].includes(k))) par.set(find(a), find(b));
  const loops = new Map(); for (const e of bnd) { const k = find(e); if (!loops.has(k)) loops.set(k, []); loops.get(k).push(e); }
  const r = TP.scope();
  try {
    const caps = [];
    for (const L of loops.values()) {
      let w; try { w = R.assembleWire(L.map((e) => TP.edgeWrap(T.edges.list[e]))); } catch (e) { throw new KErr('faceop.cap_failed'); }
      const mf = r(new O.BRepBuilderAPI_MakeFace(w.wrapped, true)); if (!mf.IsDone()) throw new KErr('faceop.cap_not_planar');
      caps.push(r(mf.Face()));
    }
    const sew = r(new O.BRepBuilderAPI_Sewing(1e-5, true, true, true, false));
    for (const i of S) sew.Add(T.faces.list[i]); for (const c of caps) sew.Add(c);
    sew.Perform(r(new O.Message_ProgressRange()));
    const sewn = TP.wrap(sew.SewedShape());
    const shells = new TP.SubIndex(sewn.wrapped, 'shell'); if (shells.size !== 1) { shells.list.forEach((x) => x.delete()); throw new KErr('faceop.not_closed'); }
    const ms = r(new O.BRepBuilderAPI_MakeSolid(r(O.TopoDS.Shell(shells.list[0])))); shells.list.forEach((x) => x.delete());
    let solid = TP.wrap(ms.Solid());
    if (!(TP.volume(solid) > 0)) solid = TP.wrap(solid.wrapped.Reversed());
    const v = TP.volume(solid); if (!(v > 1e-9) || TP.validity(solid)) throw new KErr('faceop.not_closed');
    // adlar: özgün yüzle aynı merkez + alan → o yüzün adları; değilse kapak
    const src = [...S].map((i) => { const F = TP.faceWrap(T.faces.list[i]); return { i, c: F.center.toTuple(), a: R.measureArea(F) }; });
    const sc = Math.max(1, ...src.map((x) => Math.hypot(...x.c)));
    const fn = TP.topoOf(solid).faces.list.map((raw) => { const F = TP.faceWrap(raw); const c = F.center.toTuple(), a = R.measureArea(F); const m = src.find((x) => V.dist(x.c, c) < 1e-6 * sc && Math.abs(x.a - a) <= 1e-6 * Math.max(1, a)); return m ? [...(body.fn[m.i] || [])] : [`${id}:fill`]; });
    return { shape: solid, fn, v };
  } finally { r.done(); }
}

// mode: 'offset' (d), 'move' (t), 'delete'. Döner {shape, fn}.
export function faceOp(body, faceIdx, mode, { d = 0, t = [0, 0, 0] } = {}, id) {
  const T = TP.topoOf(body.shape);
  const planar = faceIdx.every((i) => faceInfo(T, i).geom === 'PLANE');
  const adjacent = faceIdx.some((i) => faceIdx.some((j) => j !== i && T.faceEdges[i].some((e) => T.edgeFaces[e].includes(j))));
  if (mode === 'offset' || (mode === 'move' && planar && !adjacent)) {
    if (!planar) throw new KErr('faceop.offset_planar');
    let cur = body; const warns = [];
    // her yüz kendi normali boyunca (taşıma: öteleme vektörünün normal bileşeni). Dizinler her adımda adla yeniden bulunur.
    const keys = faceIdx.map((i) => ({ names: body.fn[i] || [], n: faceInfo(T, i).n, c: faceInfo(T, i).c }));
    for (const k of keys) {
      const dd = mode === 'offset' ? d : V.dot(t, k.n); if (Math.abs(dd) < 1e-9) continue;
      const CT = TP.topoOf(cur.shape); let idx = -1;
      for (let i = 0; i < CT.faces.size && idx < 0; i++) { const fi = faceInfo(CT, i); if (fi.geom === 'PLANE' && V.dot(fi.n, k.n) > 1 - 1e-9 && Math.abs(V.dot(V.sub(fi.c, k.c), k.n)) < 1e-7 * Math.max(1, Math.hypot(...k.c)) && k.names.every((x) => (cur.fn[i] || []).includes(x))) idx = i; }
      if (idx < 0) throw new KErr('faceop.failed');
      const o = offsetFace(cur, idx, dd, id); if (o.warn) warns.push(...o.warn); cur = { ...cur, shape: o.shape, fn: o.fn };
    }
    if (cur === body) throw new KErr('faceop.no_effect');
    return { shape: cur.shape, fn: cur.fn, warn: warns };
  }
  if (mode !== 'move' && mode !== 'delete') throw new KErr('faceop.mode_unknown');
  const Vf = faceVolume(body, faceIdx, id);
  const com = TP.boolean('common', [{ shape: body.shape, fn: [] }], [{ shape: Vf.shape, fn: [] }]);
  const vc = !com || empty(com.shape) ? 0 : TP.volume(com.shape);
  const pocket = vc < 1e-6 * Vf.v; const boss = Math.abs(vc - Vf.v) < 1e-6 * Vf.v;
  if (!pocket && !boss) throw new KErr('faceop.ambiguous');
  let res = TP.boolean(pocket ? 'fuse' : 'cut', [body], [Vf]); if (!res || empty(res.shape)) throw new KErr('faceop.failed');
  if (mode === 'move') {
    if (V.len(t) < 1e-9) throw new KErr('faceop.no_effect');
    const moved = TP.transform(Vf, [{ t }]);
    res = TP.boolean(pocket ? 'cut' : 'fuse', [res], [moved]); if (!res || empty(res.shape)) throw new KErr('faceop.failed');
  }
  if (TP.solidsOf(res.shape).length !== 1) throw new KErr('faceop.failed');
  return res;
}
