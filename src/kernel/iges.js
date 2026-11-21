// WP-19: IGES (5.3) içe/dışa aktarma. Kullanılan OCCT derlemesinde IGES okuyucu/yazıcı yok; biçim burada okunur ve yazılır.
// İçe aktarma: kırpılmış yüzeyler (144 + 142) ve sınırlı düzlem (108 biçim 1), yüzeyler 108 / 128 (rasyonel B-spline) / 120 (dönel) /
// 122 (çekilmiş silindir) / 118 (kurallı), eğriler 110 / 100 / 102 / 104 (yalnız daire-elips değil: hata) / 106 (12, 11, 1, 2) / 126,
// dönüşüm 124. Yüzler model uzayı eğrileriyle kurulur, eksik pcurve'ler ShapeFix ile tamamlanır, dikilir (sewing) ve kapalı kabuklar
// katıya çevrilir. 186 (B-rep katı) ve diğer varlıklar okunmaz (açık hata ya da yok sayılır). Birim: G bölümündeki birim bayrağı → mm.
// Dışa aktarma: her yüz 144 (kırpılmış yüzey) olarak; düzlemsel yüz 108 (sınırsız düzlem), diğerleri 128 (UV ızgarasından B-spline
// yaklaşımı — O önerisi: tam NURBS dönüşümü bu derlemede yok); sınırlar 142 + 102 + 110/126 (model uzayı, PREF=2).
import * as R from 'replicad';
import { KErr } from '../shared/errors.js';
import * as TP from './topo.js';

const oc = () => R.getOC();
const UNIT_MM = { 1: 25.4, 2: 1, 3: 25.4, 4: 304.8, 5: 1609344, 6: 1000, 7: 1e6, 8: 0.0254, 9: 0.001, 10: 10, 11: 0.0000254 };

// ------------------------------------------------------------------ okuma
export function parseIges(text) {
  let lines = text.split(/\r?\n/).filter((l) => l.length >= 73);
  // satır sonu olmadan art arda 80 sütunluk kayıtlar (bazı yazıcılar): 80'lik parçalara böl
  if (lines.length < 2 && text.length >= 160) { const flat = text.replace(/[\r\n]/g, ''); if (flat.length % 80 === 0) lines = flat.match(/.{80}/g); }
  const sec = { S: [], G: [], D: [], P: [] };
  for (const l of lines) { const c = l[72]; if (sec[c]) sec[c].push(l); }
  if (!sec.D.length || !sec.P.length) throw new KErr('import.iges_parse');
  const gtext = sec.G.map((l) => l.slice(0, 72)).join('');
  let pd = ',', rd = ';';
  const g = (() => { // G bölümü: ilk iki alan sınırlayıcılar (1Hx biçimi)
    let s = gtext; const rdH = (str) => { const m = /^\s*(\d+)H/.exec(str); if (!m) return null; const n = +m[1]; return { v: str.substr(m[0].length, n), rest: str.slice(m[0].length + n) }; };
    const a = rdH(s); if (a) { pd = a.v; s = a.rest.slice(1); } else s = s.slice(s.indexOf(pd) + 1);
    const b = rdH(s); if (b) { rd = b.v; s = b.rest.slice(1); }
    return splitParams(s, pd, rd);
  })();
  const unitFlag = Math.round(+g[11] || 2); const scale = UNIT_MM[unitFlag] ?? 1; // birim bayrağı: G alan 14 (sınırlayıcılar çıkarılmış dizide 11)
  const D = new Map();
  for (let i = 0; i + 1 < sec.D.length; i += 2) {
    const a = sec.D[i], b = sec.D[i + 1]; const fld = (l, k) => l.slice(k * 8, k * 8 + 8).trim();
    const seq = +a.slice(73, 80); D.set(seq, { seq, type: +fld(a, 0), pptr: +fld(a, 1), xform: +fld(a, 6) || 0, status: fld(a, 8), form: +fld(b, 4) || 0 });
  }
  const P = new Map();
  for (const l of sec.P) { const de = +l.slice(64, 72); P.set(de, (P.get(de) || '') + l.slice(0, 64)); }
  for (const e of D.values()) { const raw = P.get(e.seq); if (raw == null) continue; const ps = splitParams(raw, pd, rd); e.p = ps.slice(1); if (+ps[0] !== e.type) throw new KErr('import.iges_parse'); }
  return { D, scale };
}
function splitParams(s, pd, rd) {
  const out = []; let cur = ''; let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const hm = /^\s*(\d+)H/.exec(s.slice(i)); if (hm && cur.trim() === '') { const n = +hm[1]; out.push(s.substr(i + hm[0].length, n)); i += hm[0].length + n; while (i < s.length && s[i] === ' ') i++; if (s[i] === pd) i++; else if (s[i] === rd) break; cur = ''; continue; }
    if (ch === pd) { out.push(cur.trim()); cur = ''; i++; continue; }
    if (ch === rd) { out.push(cur.trim()); return out; }
    cur += ch; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const num = (x) => { const v = parseFloat(String(x ?? '').replace(/[dD]/, 'e')); return Number.isFinite(v) ? v : 0; };

// Dönüşüm matrisi (124) zinciri
function xformOf(ctx, de) {
  const M = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
  let cur = de, guard = 0;
  const mats = [];
  while (cur && guard++ < 32) { const e = ctx.D.get(cur); if (!e || e.type !== 124) break; const p = e.p.map(num); mats.push([[p[0], p[1], p[2], p[3]], [p[4], p[5], p[6], p[7]], [p[8], p[9], p[10], p[11]]]); cur = e.xform; }
  // en içteki önce: T = T1 · T2 · ... (IGES: varlığın matrisi, matrisin kendi matrisiyle önce çarpılır)
  let T = M;
  for (const m of mats) T = mul34(T, m);
  return T;
}
const mul34 = (a, b) => [0, 1, 2].map((i) => [0, 1, 2, 3].map((j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j] + (j === 3 ? a[i][3] : 0)));
const apply = (T, p) => [0, 1, 2].map((i) => T[i][0] * p[0] + T[i][1] * p[1] + T[i][2] * p[2] + T[i][3]);
const applyV = (T, v) => [0, 1, 2].map((i) => T[i][0] * v[0] + T[i][1] * v[1] + T[i][2] * v[2]);

// Eğri → OCCT kenar listesi (dünya, mm)
function curveEdges(ctx, de, T0, depth = 0) {
  if (depth > 16) throw new KErr('import.iges_parse'); // döngüsel ya da çok derin 102 bileşik eğri
  const e = ctx.D.get(de); if (!e || !e.p) throw new KErr('import.iges_parse');
  const T = mul34(T0, xformOf(ctx, e.xform)); const s = ctx.scale; const P = e.p.map(num);
  const W = (p) => apply(T, p).map((x) => x * s);
  const O = oc(); const r = TP.scope();
  try {
    switch (e.type) {
      case 110: { const a = W(P.slice(0, 3)), b = W(P.slice(3, 6)); if (dist(a, b) < 1e-9) return []; return [TP.makeLine(a, b)]; }
      case 100: {
        const [zt, cx, cy, sx, sy, ex, ey] = P; const rr = Math.hypot(sx - cx, sy - cy);
        const a0 = Math.atan2(sy - cy, sx - cx); let a1 = Math.atan2(ey - cy, ex - cx); while (a1 <= a0 + 1e-12) a1 += 2 * Math.PI;
        const full = Math.hypot(ex - sx, ey - sy) < 1e-9 * Math.max(1, rr);
        if (full) { const c = W([cx, cy, zt]); const n = applyV(T, [0, 0, 1]); return [R.makeCircle(rr * s * norm3len(applyV(T, [1, 0, 0])), c, n)]; }
        const am = (a0 + a1) / 2;
        return [TP.makeArc3(W([sx, sy, zt]), W([cx + rr * Math.cos(am), cy + rr * Math.sin(am), zt]), W([ex, ey, zt]))];
      }
      case 102: { const n = P[0]; const out = []; for (let k = 0; k < n; k++) out.push(...curveEdges(ctx, P[1 + k], T0Combined(T0, ctx, e), depth + 1)); return out; }
      case 106: {
        const ip = P[0], n = P[1]; const out = []; let pts = [];
        if (ip === 1) { const zt = P[2]; for (let k = 0; k < n; k++) pts.push(W([P[3 + 2 * k], P[4 + 2 * k], zt])); }
        else if (ip === 2) { for (let k = 0; k < n; k++) pts.push(W(P.slice(2 + 3 * k, 5 + 3 * k))); }
        else if (ip === 3) { for (let k = 0; k < n; k++) pts.push(W(P.slice(2 + 6 * k, 5 + 6 * k))); }
        else throw new KErr('import.iges_unsupported', { type: '106/' + ip });
        for (let k = 1; k < pts.length; k++) if (dist(pts[k - 1], pts[k]) > 1e-9) out.push(TP.makeLine(pts[k - 1], pts[k]));
        return out;
      }
      case 126: {
        const K = P[0], M = P[1]; const N = 1 + K - M, A = N + 2 * M; let o = 6;
        const knots = P.slice(o, o + A + 1); o += A + 1; const w = P.slice(o, o + K + 1); o += K + 1;
        const poles = []; for (let k = 0; k <= K; k++) poles.push(W(P.slice(o + 3 * k, o + 3 * k + 3))); o += 3 * (K + 1);
        const v0 = P[o], v1 = P[o + 1];
        const { kn, mu } = knotMults(knots);
        const ap = r(new O.NCollection_Array1_gp_Pnt(1, poles.length)); poles.forEach((p, k) => ap.SetValue(k + 1, r(new O.gp_Pnt(p[0], p[1], p[2]))));
        const aw = r(new O.NCollection_Array1_double(1, w.length)); w.forEach((x, k) => aw.SetValue(k + 1, x));
        const ak = r(new O.NCollection_Array1_double(1, kn.length)); kn.forEach((x, k) => ak.SetValue(k + 1, x));
        const am = r(new O.NCollection_Array1_int(1, mu.length)); mu.forEach((x, k) => am.SetValue(k + 1, x));
        const crv = new O.Geom_BSplineCurve(ap, aw, ak, am, M, false, false);
        const lo = Math.max(v0, kn[0]), hi = Math.min(v1, kn[kn.length - 1]);
        const me = r(new O.BRepBuilderAPI_MakeEdge(crv, lo, hi)); if (!me.IsDone()) throw new KErr('import.iges_parse');
        return [new R.Edge(me.Edge())];
      }
      default: throw new KErr('import.iges_unsupported', { type: String(e.type) });
    }
  } finally { r.done(); }
}
const T0Combined = (T0, ctx, e) => mul34(T0, xformOf(ctx, e.xform));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm3len = (v) => Math.hypot(v[0], v[1], v[2]);
function knotMults(knots) {
  const kn = [], mu = []; const tol = 1e-12 * Math.max(1, ...knots.map(Math.abs));
  for (const k of knots) { if (kn.length && Math.abs(k - kn[kn.length - 1]) <= tol) mu[mu.length - 1]++; else { kn.push(k); mu.push(1); } }
  return { kn, mu };
}

// Yüzey → {surf (Geom_Surface) | plane:{n,o}}
function surfaceOf(ctx, de, T0) {
  const e = ctx.D.get(de); if (!e || !e.p) throw new KErr('import.iges_parse');
  const T = mul34(T0, xformOf(ctx, e.xform)); const s = ctx.scale; const P = e.p.map(num);
  const W = (p) => apply(T, p).map((x) => x * s);
  const O = oc(); const r = TP.scope();
  try {
    switch (e.type) {
      case 108: {
        const [A, B, C, Dd] = P; const L = Math.hypot(A, B, C); if (!(L > 0)) throw new KErr('import.iges_parse');
        const n0 = [A / L, B / L, C / L]; const p0 = n0.map((x) => (x * Dd) / L);
        const n = applyV(T, n0); const nl = norm3len(n); return { plane: { n: n.map((x) => x / nl), o: W(p0) }, bound: e.form !== 0 ? P[4] : 0 };
      }
      case 128: {
        const K1 = P[0], K2 = P[1], M1 = P[2], M2 = P[3]; const N1 = 1 + K1 - M1, N2 = 1 + K2 - M2, A = N1 + 2 * M1, B = N2 + 2 * M2;
        let o = 9; const ku = P.slice(o, o + A + 1); o += A + 1; const kv = P.slice(o, o + B + 1); o += B + 1;
        const w = P.slice(o, o + (K1 + 1) * (K2 + 1)); o += (K1 + 1) * (K2 + 1);
        const ap = r(new O.NCollection_Array2_gp_Pnt(1, K1 + 1, 1, K2 + 1)); const aw = r(new O.NCollection_Array2_double(1, K1 + 1, 1, K2 + 1));
        for (let j = 0; j <= K2; j++) for (let i = 0; i <= K1; i++) { const q = W(P.slice(o, o + 3)); o += 3; ap.SetValue(i + 1, j + 1, r(new O.gp_Pnt(q[0], q[1], q[2]))); aw.SetValue(i + 1, j + 1, w[j * (K1 + 1) + i]); }
        const U = knotMults(ku), V = knotMults(kv);
        const mk1 = (arr, T2) => { const a = r(new T2(1, arr.length)); arr.forEach((x, k) => a.SetValue(k + 1, x)); return a; };
        const surf = new O.Geom_BSplineSurface(ap, aw, mk1(U.kn, O.NCollection_Array1_double), mk1(V.kn, O.NCollection_Array1_double), mk1(U.mu, O.NCollection_Array1_int), mk1(V.mu, O.NCollection_Array1_int), M1, M2, false, false);
        return { surf };
      }
      case 120: case 122: case 118: {
        // süpürme ile yüzeyi kur, yüzün taşıyıcı yüzeyini al
        let face;
        if (e.type === 120) {
          const axis = curveEdges(ctx, P[0], T)[0]; const gen = curveEdges(ctx, P[1], T); const sa = P[2], ta = P[3];
          const a = axis.startPoint.toTuple(), b = axis.endPoint.toTuple(); const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          const w = R.assembleWire(gen); const rv = r(new O.BRepPrimAPI_MakeRevol(w.wrapped, r(new O.gp_Ax1(r(new O.gp_Pnt(a[0], a[1], a[2])), r(new O.gp_Dir(d[0], d[1], d[2])))), ta - sa, false));
          face = firstFace(rv.Shape());
        } else if (e.type === 122) {
          const gen = curveEdges(ctx, P[0], T); const tp = W(P.slice(1, 4)); const st = gen[0].startPoint.toTuple();
          const w = R.assembleWire(gen); const pr = r(new O.BRepPrimAPI_MakePrism(w.wrapped, r(new O.gp_Vec(tp[0] - st[0], tp[1] - st[1], tp[2] - st[2])), false, true));
          face = firstFace(pr.Shape());
        } else {
          const c1 = R.assembleWire(curveEdges(ctx, P[0], T)), c2 = R.assembleWire(curveEdges(ctx, P[1], T));
          const ts = r(new O.BRepOffsetAPI_ThruSections(false, true, 1e-6)); ts.AddWire(c1.wrapped); ts.AddWire(c2.wrapped); ts.Build(r(new O.Message_ProgressRange()));
          face = firstFace(ts.Shape());
        }
        if (!face) throw new KErr('import.iges_parse');
        return { surf: O.BRep_Tool.Surface(O.TopoDS.Face(face)), keep: face };
      }
      default: throw new KErr('import.iges_unsupported', { type: String(e.type) });
    }
  } finally { r.done(); }
}
function firstFace(sh) { const f = new TP.SubIndex(sh, 'face'); const x = f.list[0] || null; f.list.slice(1).forEach((y) => y.delete()); return x; }

// sınır eğrisi (142 ya da düz eğri) → tel
function boundaryWire(ctx, de, T) {
  const e = ctx.D.get(de); if (!e) throw new KErr('import.iges_parse');
  if (e.type === 142) { const P = e.p.map(num); const cptr = P[3]; if (!cptr) throw new KErr('import.iges_unsupported', { type: '142/uv' }); return R.assembleWire(curveEdges(ctx, cptr, T)); }
  return R.assembleWire(curveEdges(ctx, de, T));
}
function makeFace(S, outer, inner) {
  const O = oc(); const r = TP.scope();
  try {
    let mf;
    if (S.plane) mf = r(new O.BRepBuilderAPI_MakeFace(r(new O.gp_Pln(r(new O.gp_Pnt(...S.plane.o)), r(new O.gp_Dir(...S.plane.n)))), outer.wrapped, true));
    else {
      for (const [cl, pe, set] of [['IsUClosed', 'IsUPeriodic', 'SetUPeriodic'], ['IsVClosed', 'IsVPeriodic', 'SetVPeriodic']]) { try { if (typeof S.surf[cl] === 'function' && S.surf[cl]() && !S.surf[pe]()) S.surf[set](); } catch (e) { /* */ } }
      mf = r(new O.BRepBuilderAPI_MakeFace(S.surf, outer.wrapped, true));
    }
    if (!mf.IsDone()) throw new KErr('import.iges_face');
    for (const w of inner) mf.Add(w.wrapped);
    let face = mf.Face();
    // eksik pcurve/yön düzeltmesi
    const fx = r(new O.ShapeFix_Face(face)); fx.Perform(); face = fx.Face();
    return face;
  } finally { r.done(); }
}

export function igesToShape(text) {
  let ctx; try { ctx = parseIges(text); } catch (e) { if (e instanceof KErr) throw e; throw new KErr('import.iges_parse'); }
  const I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
  const faces = []; const used = new Set();
  const sub = (e) => (+String(e.status).slice(2, 4) || 0); // alt ast. 01: fiziksel bağımlı (yalnız bir üst varlık yoluyla)
  for (const e of ctx.D.values()) {
    if (!e.p) continue;
    if (e.type === 144) {
      const P = e.p.map(num); const T = xformOf(ctx, e.xform); const S = surfaceOf(ctx, P[0], T); used.add(P[0]);
      const n1 = P[1], n2 = P[2]; const outer = n1 ? boundaryWire(ctx, P[3], T) : null; const inner = []; for (let k = 0; k < n2; k++) inner.push(boundaryWire(ctx, P[4 + k], T));
      if (!outer) { faces.push(naturalFace(S)); continue; }
      faces.push(makeFace(S, outer, inner));
    } else if (e.type === 108 && e.form !== 0 && sub(e) === 0) {
      const S = surfaceOf(ctx, e.seq, I); if (!S.bound) continue; faces.push(makeFace(S, boundaryWire(ctx, S.bound, xformOf(ctx, e.xform)), []));
    } else if (e.type === 186) throw new KErr('import.iges_unsupported', { type: '186' });
  }
  // kırpılmamış, bağımsız serbest yüzeyler (ör. yalnız 128 içeren dosyalar)
  for (const e of ctx.D.values()) if (e.p && e.type === 128 && !used.has(e.seq) && sub(e) === 0) faces.push(naturalFace(surfaceOf(ctx, e.seq, I)));
  if (!faces.length) throw new KErr('import.iges_empty');
  const O = oc(); const r = TP.scope();
  try {
    const sew = r(new O.BRepBuilderAPI_Sewing(1e-4 * Math.max(1, ctx.scale), true, true, true, false));
    for (const f of faces) sew.Add(f);
    sew.Perform(r(new O.Message_ProgressRange()));
    const sewn = TP.wrap(sew.SewedShape());
    let shells = new TP.SubIndex(sewn.wrapped, 'shell');
    if (!shells.size) {
      // tek kapalı yüz (küre, simit): dikiş tek yüz döndürür; yüzeyin kendi sınırlarıyla kabuk kurulur
      const fs = new TP.SubIndex(sewn.wrapped, 'face'); if (fs.size !== 1) { fs.list.forEach((x) => x.delete()); throw new KErr('import.iges_open'); }
      const srf = O.BRep_Tool.Surface(r(O.TopoDS.Face(fs.list[0]))); fs.list.forEach((x) => x.delete());
      const mk = r(new O.BRepBuilderAPI_MakeShell(srf, false)); if (!mk.IsDone()) throw new KErr('import.iges_open');
      shells = { list: [mk.Shell()], size: 1 };
    }
    const solids = [];
    for (const sh of shells.list) {
      const ms = r(new O.BRepBuilderAPI_MakeSolid(r(O.TopoDS.Shell(sh)))); let solid = TP.wrap(ms.Solid());
      const fx = r(new O.ShapeFix_Solid(solid.wrapped)); fx.Perform(r(new O.Message_ProgressRange())); solid = TP.wrap(fx.Solid());
      if (!(TP.volume(solid) > 0)) solid = TP.wrap(solid.wrapped.Reversed());
      solids.push(solid);
    }
    shells.list.forEach((x) => x.delete());
    return solids.length === 1 ? solids[0] : R.makeCompound(solids);
  } finally { r.done(); }
}
function naturalFace(S) {
  const O = oc(); const r = TP.scope();
  try {
    if (S.plane) throw new KErr('import.iges_unbounded');
    // kapalı (ama periyodik yazılmış) B-spline: periyodik yapılır, böylece tek yüz dikişli kapalı kabuk olur (küre, simit)
    for (const [cl, pe, set] of [['IsUClosed', 'IsUPeriodic', 'SetUPeriodic'], ['IsVClosed', 'IsVPeriodic', 'SetVPeriodic']]) { try { if (typeof S.surf[cl] === 'function' && S.surf[cl]() && !S.surf[pe]()) S.surf[set](); } catch (e) { /* periyodik yapılamazsa olduğu gibi */ } }
    const mf = r(new O.BRepBuilderAPI_MakeFace(S.surf, 1e-7)); if (!mf.IsDone()) throw new KErr('import.iges_face'); return mf.Face(); }
  finally { r.done(); }
}

// ------------------------------------------------------------------ yazma
// shapes: [{shape, name}] → IGES metni (mm)
export function shapesToIges(shapes, { tol = 1e-3 } = {}) {
  const ents = []; // {type, form, params:[...], status}
  const add = (type, params, form = 0, status = '00000000') => { ents.push({ type, params, form, status }); return 2 * ents.length - 1; };
  const O = oc();
  for (const { shape } of shapes) {
    const T = TP.topoOf(shape);
    T.faces.list.forEach((raw, fi) => {
      const r = TP.scope(); const mark = ents.length;
      try {
        const F = TP.faceWrap(raw); const face = r(O.TopoDS.Face(raw));
        // sınır telleri (dış tel önce)
        const outer = r(O.BRepTools.OuterWire(face));
        const ws = { list: [] }; { const ex = new O.TopExp_Explorer(raw, O.TopAbs_ShapeEnum.TopAbs_WIRE, O.TopAbs_ShapeEnum.TopAbs_SHAPE); for (; ex.More(); ex.Next()) ws.list.push(ex.Current()); ex.delete(); }
        const ordered = [outer, ...ws.list.filter((w) => !w.IsSame(outer))];
        let sptr;
        // doğal sınırlı yüz (küre, simit, tam silindir yanı…): yüzey tam UV aralığında yaklaşılır, 144 N1=0 (sınır = yüzeyin kendi sınırı)
        let natural = false;
        try {
          natural = F.geomType !== 'PLANE' && (O.BRep_Tool.NaturalRestriction(face) || (() => { const ee = new TP.SubIndex(raw, 'edge'); const all = ee.list.every((x) => { const ed = r(O.TopoDS.Edge(x)); return O.BRep_Tool.Degenerated(ed) || O.BRep_Tool.IsClosed(ed, face); }); ee.list.forEach((x) => x.delete()); return all; })());
        } catch (x) { natural = false; }
        if (F.geomType === 'PLANE') {
          const n = F.normalAt(F.center).toTuple(), c = F.center.toTuple(); const d = n[0] * c[0] + n[1] * c[1] + n[2] * c[2];
          sptr = add(108, [n[0], n[1], n[2], d, 0, 0, 0, 0], 0, '00010000');
        } else sptr = add(128, approxSurface(F, raw, tol, natural), 0, '00010000');
        if (natural) { add(144, [sptr, 0, 0, 0]); ws.list.forEach((x) => x.delete()); return; }
        const loops = ordered.map((w) => { const cs = wireCurves(w, add); const cc = add(102, [cs.length, ...cs], 0, '00010000'); return add(142, [0, sptr, 0, cc, 2], 0, '00010000'); });
        add(144, [sptr, 1, loops.length - 1, loops[0], ...loops.slice(1)]);
        ws.list.forEach((x) => x.delete());
      } catch (e) {
        ents.length = mark; let g = '?'; try { g = TP.faceWrap(raw).geomType; } catch (x) { /* */ }
        throw new KErr('import.iges_export', { n: fi + 1, type: g });
      } finally { r.done(); }
    });
  }
  return writeFile(ents);
}
function wireCurves(w, add) {
  const O = oc(); const out = [];
  // tel kenarları yinelemeli (dikiş kenarı iki kez, ters yönlerde) okunur
  const es = { list: [] }; { const ex = new O.TopExp_Explorer(w, O.TopAbs_ShapeEnum.TopAbs_EDGE, O.TopAbs_ShapeEnum.TopAbs_SHAPE); for (; ex.More(); ex.Next()) es.list.push(ex.Current()); ex.delete(); }
  // dejenere kenarlar (küre kutbu vb.: 3B eğrisi yok) yazılmaz; tel uçları aynı noktada buluştuğu için döngü kapalı kalır
  const isDeg = (e) => { const r = TP.scope(); try { return O.BRep_Tool.Degenerated(r(O.TopoDS.Edge(e))); } catch (x) { return false; } finally { r.done(); } };
  es.list = es.list.filter((e) => !isDeg(e));
  const items = es.list.map((e) => { const E = TP.edgeWrap(e); const fw = e.Orientation() === O.TopAbs_Orientation.TopAbs_FORWARD; const a = E.startPoint.toTuple(), b = E.endPoint.toTuple(); return { e, E, a: fw ? a : b, b: fw ? b : a, fw }; });
  // kenarları uç uca sırala (102 bileşik eğri bağlı olmalı); gerekirse ters çevir
  const ordered = []; const left = items.slice();
  if (left.length) ordered.push(left.shift());
  while (left.length) {
    const end = ordered[ordered.length - 1].b; let k = left.findIndex((x) => dist(x.a, end) < 1e-6); let rev = false;
    if (k < 0) { k = left.findIndex((x) => dist(x.b, end) < 1e-6); rev = k >= 0; }
    if (k < 0) { ordered.push(left.shift()); continue; }
    const it = left.splice(k, 1)[0]; if (rev) { [it.a, it.b] = [it.b, it.a]; it.fw = !it.fw; } ordered.push(it);
  }
  for (const it of ordered) {
    if (it.E.geomType === 'LINE') { out.push(add(110, [...it.a, ...it.b], 0, '00010000')); continue; }
    out.push(add(126, bsplineCurveParams(it.e, it.fw), 0, '00010000'));
  }
  es.list.forEach((x) => x.delete());
  return out;
}
function bsplineCurveParams(edgeRaw, fw) {
  const O = oc(); const r = TP.scope();
  try {
    const e = r(O.TopoDS.Edge(edgeRaw)); const res = O.BRep_Tool.Curve(e, 0, 0); const c = res && res.returnValue !== undefined ? res.returnValue : res; const f = res.First, l = res.Last;
    if (!c || (typeof c.IsNull === 'function' && c.IsNull()) || !Number.isFinite(f) || !Number.isFinite(l)) throw new KErr('import.iges_export', { n: 0, type: 'curve' });
    const tc = new O.Geom_TrimmedCurve(c, f, l, true, true); const bs = O.GeomConvert.CurveToBSplineCurve(tc, O.Convert_ParameterisationType.Convert_TgtThetaOver2);
    if (!fw) bs.Reverse();
    const np = bs.NbPoles(), deg = bs.Degree(); const knots = []; for (let i = 1; i <= bs.NbKnots(); i++) for (let m = 0; m < bs.Multiplicity(i); m++) knots.push(bs.Knot(i));
    const w = [], P = []; for (let i = 1; i <= np; i++) { w.push(bs.Weight(i)); const q = bs.Pole(i); P.push(q.X(), q.Y(), q.Z()); }
    const rational = w.some((x) => Math.abs(x - 1) > 1e-12);
    return [np - 1, deg, 0, 0, rational ? 0 : 1, 0, ...knots, ...w, ...P, knots[deg], knots[knots.length - 1 - deg], 0, 0, 0];
  } finally { r.done(); }
}
// Düzlemsel olmayan yüz: UV sınırları içinde 13×13 ızgaradan B-spline yaklaşımı (GeomAPI_PointsToBSplineSurface), kenar sınırlarının biraz dışına uzatılır
function approxSurface(F, raw, tol, natural = false) {
  const O = oc(); const r = TP.scope();
  try {
    const face = r(O.TopoDS.Face(raw)); const surf = O.BRep_Tool.Surface(face);
    const ad = r(new O.BRepAdaptor_Surface(face, true)); let u0 = ad.FirstUParameter(), u1 = ad.LastUParameter(), v0 = ad.FirstVParameter(), v1 = ad.LastVParameter();
    const du = (u1 - u0) * 0.02, dv = (v1 - v0) * 0.02; const hasDeg = (() => { const ee = new TP.SubIndex(raw, 'edge'); const d = ee.list.some((x) => O.BRep_Tool.Degenerated(r(O.TopoDS.Edge(x)))); ee.list.forEach((x) => x.delete()); return d; })();
    if (!natural && !hasDeg) { if (!ad.IsUPeriodic()) { u0 -= du; u1 += du; } if (!ad.IsVPeriodic()) { v0 -= dv; v1 += dv; } }
    const n = 17; const arr = r(new O.NCollection_Array2_gp_Pnt(1, n, 1, n));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const p = r(surf.Value(u0 + ((u1 - u0) * i) / (n - 1), v0 + ((v1 - v0) * j) / (n - 1))); arr.SetValue(i + 1, j + 1, p); }
    const ap = r(new O.GeomAPI_PointsToBSplineSurface(arr, 3, 8, O.GeomAbs_Shape.GeomAbs_C2, tol * 0.1));
    const bs = ap.Surface();
    const nu = bs.NbUPoles(), nv = bs.NbVPoles(), du_ = bs.UDegree(), dv_ = bs.VDegree();
    const ku = [], kv = []; for (let i = 1; i <= bs.NbUKnots(); i++) for (let m = 0; m < bs.UMultiplicity(i); m++) ku.push(bs.UKnot(i)); for (let i = 1; i <= bs.NbVKnots(); i++) for (let m = 0; m < bs.VMultiplicity(i); m++) kv.push(bs.VKnot(i));
    const w = [], P = []; for (let j = 1; j <= nv; j++) for (let i = 1; i <= nu; i++) { w.push(1); const q = bs.Pole(i, j); P.push(q.X(), q.Y(), q.Z()); }
    return [nu - 1, nv - 1, du_, dv_, 0, 0, 1, 0, 0, ...ku, ...kv, ...w, ...P, ku[du_], ku[ku.length - 1 - du_], kv[dv_], kv[kv.length - 1 - dv_]];
  } finally { r.done(); }
}
const fmtN = (x) => { if (Number.isInteger(x)) return String(x); const s = x.toPrecision(15).replace(/\.?0+(e|$)/, '$1'); return s.includes('.') || s.includes('e') ? s.replace('e', 'D') : s + '.'; };
function writeFile(ents) {
  const pad = (s, n) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
  const rpad = (s, n) => (s.length >= n ? s.slice(-n) : ' '.repeat(n - s.length) + s);
  const S = ['Mihenk IGES'];
  const hs = (t) => `${t.length}H${t}`;
  const now = new Date(); const ds = `${String(now.getUTCFullYear()).padStart(4, '0')}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}.000000`;
  const gp = [hs(','), hs(';'), hs('mihenk'), hs('mihenk.igs'), hs('Mihenk'), hs('Mihenk'), 32, 38, 6, 308, 15, hs('mihenk'), 1, 2, hs('MM'), 1, 0.01, hs(ds), 1e-6, 1e5, hs(''), hs(''), 11, 0, hs(ds)];
  const G = chunk(gp.map((x) => (typeof x === 'number' ? fmtN(x) : x)).join(',') + ';', 72);
  const Dl = [], Pl = [];
  ents.forEach((e, k) => {
    const de = 2 * k + 1; const body = [e.type, ...e.params].map((x) => (typeof x === 'number' ? fmtN(x) : x)).join(',') + ';';
    const lines = chunk(body, 64); const p0 = Pl.length + 1;
    lines.forEach((l) => Pl.push(pad(l, 64) + ' ' + rpad(String(de), 7) + 'P' + rpad(String(Pl.length + 1), 7)));
    const f8 = (x) => rpad(String(x), 8);
    Dl.push(f8(e.type) + f8(p0) + f8(0) + f8(0) + f8(0) + f8(0) + f8(0) + f8(0) + pad(e.status, 8) + 'D' + rpad(String(de), 7));
    Dl.push(f8(e.type) + f8(0) + f8(0) + f8(lines.length) + f8(e.form) + pad('', 8) + pad('', 8) + pad('', 8) + f8(0) + 'D' + rpad(String(de + 1), 7));
  });
  const out = [...S.map((l, i) => pad(l, 72) + 'S' + rpad(String(i + 1), 7)), ...G.map((l, i) => pad(l, 72) + 'G' + rpad(String(i + 1), 7)), ...Dl, ...Pl];
  out.push(pad(`S${rpad(String(S.length), 7)}G${rpad(String(G.length), 7)}D${rpad(String(Dl.length), 7)}P${rpad(String(Pl.length), 7)}`, 72) + 'T' + rpad('1', 7));
  return out.join('\n') + '\n';
}
function chunk(s, n) {
  const out = []; let cur = '';
  for (const tok of s.split(/(?<=[,;])/)) { if (cur && cur.length + tok.length > n) { out.push(cur); cur = ''; } cur += tok; }
  if (cur) out.push(cur);
  return out;
}
