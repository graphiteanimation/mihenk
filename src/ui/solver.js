// Sketch kısıt çözücüsü: FreeCAD PlaneGCS (WASM). Sketch modelini planegcs ilkel listesine çevirir.
import { init_planegcs_module, GcsWrapper } from '@salusoft89/planegcs';
import { evalExpr } from '../shared/expr.js';
import { toErr } from '../shared/errors.js';
import { ellipseGeom } from '../shared/profiles.js';

let modPromise = null;
export function initSolver(locate) { if (!modPromise) modPromise = init_planegcs_module(locate ? { locateFile: locate } : undefined); return modPromise; }

const TAU = Math.PI * 2;
// sk: {points:{id:{x,y,fixed}}, ents:[], cons:[]}
// Döner: {ok, dof, conflicting:[ids], redundant:[ids], errors:[{id?, code, params}]}
// Sketch modelini PlaneGCS ilkellerine çevirir. Döner {prims, entById, errs}
function buildPrims(sk, vars) {
  const errs = [];
    const prims = [];
    for (const [id, p] of Object.entries(sk.points)) prims.push({ id, type: 'point', x: p.x, y: p.y, fixed: !!p.fixed });
    const entById = {};
    for (const e of sk.ents || []) {
      entById[e.id] = e;
      if (e.type === 'line') { if (sk.points[e.a] && sk.points[e.b]) prims.push({ id: e.id, type: 'line', p1_id: e.a, p2_id: e.b }); }
      else if (e.type === 'circle') prims.push({ id: e.id, type: 'circle', c_id: e.c, radius: e.r });
      else if (e.type === 'arc') {
        const c = sk.points[e.c], a = sk.points[e.a], b = sk.points[e.b];
        const r = Math.hypot(a.x - c.x, a.y - c.y);
        let a0 = Math.atan2(a.y - c.y, a.x - c.x), a1 = Math.atan2(b.y - c.y, b.x - c.x);
        if (a1 <= a0) a1 += TAU;
        prims.push({ id: e.id, type: 'arc', c_id: e.c, radius: r, start_angle: a0, end_angle: a1, start_id: e.a, end_id: e.b });
        prims.push({ id: e.id + '_rules', type: 'arc_rules', a_id: e.id });
      }
      else if (e.type === 'ellipse' && sk.points[e.c] && sk.points[e.f]) prims.push({ id: e.id, type: 'ellipse', c_id: e.c, focus1_id: e.f, radmin: Math.abs(e.rmin) || 1 });
      else if (e.type === 'ellarc' && sk.points[e.c] && sk.points[e.f] && sk.points[e.a] && sk.points[e.b]) {
        const g = ellipseGeom(sk, e); const par = (id) => { const p = sk.points[id], dx = p.x - g.c[0], dy = p.y - g.c[1], cr = Math.cos(g.rot), sr = Math.sin(g.rot); return Math.atan2((-dx * sr + dy * cr) / g.ry, (dx * cr + dy * sr) / g.rx); };
        let t0 = par(e.a), t1 = par(e.b); if (t1 <= t0) t1 += TAU;
        prims.push({ id: e.id, type: 'arc_of_ellipse', c_id: e.c, focus1_id: e.f, radmin: Math.abs(e.rmin) || 1, start_angle: t0, end_angle: t1, start_id: e.a, end_id: e.b });
        prims.push({ id: e.id + '_rules', type: 'arc_of_ellipse_rules', a_id: e.id });
      }
    }
    const val = (c) => { try { return evalExpr(c.expr, vars); } catch (err) { errs.push({ id: c.id, ...toErr(err) }); return null; } };
    const T = (id) => entById[id]?.type;
    const ctr = (id) => { const e = entById[id]; return e && (e.type === 'circle' || e.type === 'arc' || e.type === 'ellipse' || e.type === 'ellarc') ? e.c : null; };
    const isArcLike = (t) => t === 'arc';
    for (const c of sk.cons || []) {
      if (c.ref) continue; // referans (sürülen) ölçü: çözücüye girmez
      const base = { id: c.id };
      const miss = (ids) => ids.some((i) => i && !sk.points[i] && !entById[i]);
      if (miss([c.a, c.b, c.c].filter(Boolean))) continue;
      switch (c.type) {
        case 'horizontal': prims.push({ ...base, type: 'horizontal_l', l_id: c.a }); break;
        case 'vertical': prims.push({ ...base, type: 'vertical_l', l_id: c.a }); break;
        case 'horizontal_pp': prims.push({ ...base, type: 'horizontal_pp', p1_id: c.a, p2_id: c.b }); break;
        case 'vertical_pp': prims.push({ ...base, type: 'vertical_pp', p1_id: c.a, p2_id: c.b }); break;
        case 'coincident': prims.push({ ...base, type: 'p2p_coincident', p1_id: c.a, p2_id: c.b }); break;
        case 'parallel': prims.push({ ...base, type: 'parallel', l1_id: c.a, l2_id: c.b }); break;
        case 'perpendicular': prims.push({ ...base, type: 'perpendicular_ll', l1_id: c.a, l2_id: c.b }); break;
        case 'collinear': { // b çizgisinin iki ucu a çizgisinin taşıyıcısında
          const lb = entById[c.b]; if (!lb || T(c.a) !== 'line' || lb.type !== 'line') break;
          prims.push({ ...base, type: 'point_on_line_pl', p_id: lb.a, l_id: c.a }, { id: c.id + '_b', type: 'point_on_line_pl', p_id: lb.b, l_id: c.a }); break;
        }
        case 'equal':
          if (T(c.a) === 'line' && T(c.b) === 'line') prims.push({ ...base, type: 'equal_length', l1_id: c.a, l2_id: c.b });
          else if (T(c.a) === 'circle' && T(c.b) === 'circle') prims.push({ ...base, type: 'equal_radius_cc', c1_id: c.a, c2_id: c.b });
          else if (T(c.a) === 'arc' && T(c.b) === 'arc') prims.push({ ...base, type: 'equal_radius_aa', a1_id: c.a, a2_id: c.b });
          else if (T(c.a) === 'circle' && T(c.b) === 'arc') prims.push({ ...base, type: 'equal_radius_ca', c_id: c.a, a_id: c.b });
          else if (T(c.a) === 'arc' && T(c.b) === 'circle') prims.push({ ...base, type: 'equal_radius_ca', c_id: c.b, a_id: c.a });
          else if (T(c.a) === 'ellipse' && T(c.b) === 'ellipse') prims.push({ ...base, type: 'difference', param1: { o_id: c.a, prop: 'radmin' }, param2: { o_id: c.b, prop: 'radmin' }, difference: 0 });
          break;
        case 'tangent': {
          let l = c.a, o = c.b; if (T(l) !== 'line') { l = c.b; o = c.a; }
          if (T(l) === 'line' && T(o) === 'circle') prims.push({ ...base, type: 'tangent_lc', l_id: l, c_id: o });
          else if (T(l) === 'line' && T(o) === 'arc') prims.push({ ...base, type: 'tangent_la', l_id: l, a_id: o });
          else if (T(l) === 'line' && T(o) === 'ellipse') prims.push({ ...base, type: 'tangent_le', l_id: l, e_id: o });
          else if (T(c.a) === 'circle' && T(c.b) === 'circle') prims.push({ ...base, type: 'tangent_cc', c1_id: c.a, c2_id: c.b });
          else if (T(c.a) === 'arc' && T(c.b) === 'arc') prims.push({ ...base, type: 'tangent_aa', a1_id: c.a, a2_id: c.b });
          else if (T(c.a) === 'circle' && T(c.b) === 'arc') prims.push({ ...base, type: 'tangent_ca', c_id: c.a, a_id: c.b });
          else if (T(c.a) === 'arc' && T(c.b) === 'circle') prims.push({ ...base, type: 'tangent_ca', c_id: c.b, a_id: c.a });
          break;
        }
        case 'pointOn': // a: nokta, b: çizgi/daire/yay/elips
          if (T(c.b) === 'line') prims.push({ ...base, type: 'point_on_line_pl', p_id: c.a, l_id: c.b });
          else if (T(c.b) === 'circle') prims.push({ ...base, type: 'point_on_circle', p_id: c.a, c_id: c.b });
          else if (T(c.b) === 'arc') prims.push({ ...base, type: 'point_on_arc', p_id: c.a, a_id: c.b });
          else if (T(c.b) === 'ellipse') prims.push({ ...base, type: 'point_on_ellipse', p_id: c.a, e_id: c.b });
          break;
        case 'midpoint':
          prims.push({ ...base, type: 'point_on_line_pl', p_id: c.a, l_id: c.b });
          prims.push({ id: c.id + '_b', type: 'point_on_perp_bisector_pl', p_id: c.a, l_id: c.b });
          break;
        case 'symmetric': prims.push({ ...base, type: 'p2p_symmetric_ppl', p1_id: c.a, p2_id: c.b, l_id: c.c }); break;
        case 'dist': { const v = val(c); if (v != null) prims.push({ ...base, type: 'p2p_distance', p1_id: c.a, p2_id: c.b, distance: Math.abs(v) }); break; }
        case 'hdist': { const v = val(c); if (v != null) prims.push({ ...base, type: 'difference', param1: { o_id: c.a, prop: 'x' }, param2: { o_id: c.b, prop: 'x' }, difference: v }); break; }
        case 'vdist': { const v = val(c); if (v != null) prims.push({ ...base, type: 'difference', param1: { o_id: c.a, prop: 'y' }, param2: { o_id: c.b, prop: 'y' }, difference: v }); break; }
        case 'pldist': { const v = val(c); if (v != null) prims.push({ ...base, type: 'p2l_distance', p_id: c.a, l_id: c.b, distance: Math.abs(v) }); break; }
        case 'lldist': { // iki çizgi arası uzaklık = a'nın iki ucunun b'ye uzaklığı (paralellik de sağlanır)
          const v = val(c); const la = entById[c.a]; if (v == null || !la || la.type !== 'line' || T(c.b) !== 'line') break;
          const has = (ty, id) => sk.cons.some((k) => k.type === ty && k.a === id);
          const par = sk.cons.some((k) => k.type === 'parallel' && ((k.a === c.a && k.b === c.b) || (k.a === c.b && k.b === c.a))) || (has('horizontal', c.a) && has('horizontal', c.b)) || (has('vertical', c.a) && has('vertical', c.b));
          prims.push({ ...base, type: 'p2l_distance', p_id: la.a, l_id: c.b, distance: Math.abs(v) });
          if (!par) prims.push({ id: c.id + '_b', type: 'p2l_distance', p_id: la.b, l_id: c.b, distance: Math.abs(v) }); // paralellik zaten kısıtlıysa ikinci uç gereksiz (fazlalık olur)
          break;
        }
        case 'ccdist': { const v = val(c); const ca = ctr(c.a), cb = ctr(c.b); if (v != null && ca && cb) prims.push({ ...base, type: 'p2p_distance', p1_id: ca, p2_id: cb, distance: Math.abs(v) }); break; }
        case 'radius': { const v = val(c); if (v == null) break; if (T(c.a) === 'ellipse') prims.push({ ...base, type: 'difference', param1: 0, param2: { o_id: c.a, prop: 'radmin' }, difference: v }); else prims.push(T(c.a) === 'arc' ? { ...base, type: 'arc_radius', a_id: c.a, radius: v } : { ...base, type: 'circle_radius', c_id: c.a, radius: v }); break; }
        case 'diameter': { const v = val(c); if (v != null) prims.push(T(c.a) === 'arc' ? { ...base, type: 'arc_radius', a_id: c.a, radius: v / 2 } : { ...base, type: 'circle_radius', c_id: c.a, radius: v / 2 }); break; }
        case 'radiusdiff': { // b'nin yarıçapı − a'nın yarıçapı = ifade (daire/yay ofseti)
          const v = val(c); if (v == null) break; const A = entById[c.a], B = entById[c.b]; if (!A || !B) break;
          prims.push({ ...base, type: 'difference', param1: { o_id: c.a, prop: 'radius' }, param2: { o_id: c.b, prop: 'radius' }, difference: v }); break;
        }
        case 'angle': { const v = val(c); if (v != null) prims.push({ ...base, type: 'l2l_angle_ll', l1_id: c.a, l2_id: c.b, angle: (v * Math.PI) / 180 }); break; }
      }
    }
    return { prims, entById, errs };
}

const safeBool = (f) => { try { return !!f(); } catch (e) { console.warn('solver: bayrak okunamadı', e && e.message); return false; } };
// tarayıcıda (CSP) yerleşik liste okuması kapalı; Node'da (testler, CSP yok) açık. Hata olursa günlüğe yazılır ve yerel tanılamaya geçilir.
let listBroken = typeof document !== 'undefined';
function readList(f, what) {
  if (listBroken) return null;
  try { return f(); } catch (e) { listBroken = true; console.warn(`solver: ${what} kısıt listesi okunamadı (${e && e.name}: ${e && e.message}); yerel tanılamaya geçildi`); return null; }
}
// kendi tanılamamız: her sketch kısıtını (aynı kimlikli ilkellerin hepsi) çıkararak yeniden kur; bayrak kalkıyorsa o kısıt listeye girer
export function culprits(mod, prims, sk, kind, max = 300) {
  const conIds = new Set((sk.cons || []).map((c) => c.id)); const ids = [...new Set(prims.filter((p) => conIds.has(p.id)).map((p) => p.id))].slice(0, max);
  const out = [];
  for (const id of ids) {
    const g = new GcsWrapper(new mod.GcsSystem());
    try {
      g.push_primitives_and_params(prims.filter((p) => p.id !== id)); g.solve();
      const still = kind === 'redundant' ? g.has_gcs_redundant_constraints() : g.has_gcs_conflicting_constraints();
      if (!still) out.push(id);
    } catch (e) { console.warn('solver: tanılama çözümü başarısız', e && e.message); } finally { try { g.destroy_gcs_module(); } catch (e) { /* */ } }
  }
  return out;
}
export const _solverDiag = { forceLocal(v) { listBroken = !!v; } }; // test: yerel tanılamayı zorla
export async function solveSketch(sk, vars = {}, drag = null) {
  const mod = await initSolver();
  const gcs = new GcsWrapper(new mod.GcsSystem());
  try {
    const { prims, entById, errs } = buildPrims(sk, vars);
    if (drag) {
      for (const d of drag) {
        prims.push({ id: '_dx' + d.id, type: 'coordinate_x', p_id: d.id, x: d.x, temporary: true });
        prims.push({ id: '_dy' + d.id, type: 'coordinate_y', p_id: d.id, y: d.y, temporary: true });
      }
    }
    gcs.push_primitives_and_params(prims);
    const status = gcs.solve();
    const ok = status === 0 || status === 1;
    let dof = null; try { dof = gcs.gcs.dof(); } catch (e) {}
    let conflicting = [], redundant = [];
    // WP-08 (CSP): planegcs'in liste okuması (embind IntVector.get) sıkı CSP'de Function() ile EvalError atıyordu ve sessizce
    // yutuluyordu (gereksiz/çelişen kısıt uyarısı kayboluyordu). Denemenin kendisi CSP ihlali raporu ürettiği için tarayıcıda
    // yerleşik okuma hiç denenmez: liste kendi tarafımızda bulunur (kısıt çıkarılınca bayrak kalkıyorsa o kısıt listeye girer).
    // Bayrak okuması (has_*) düz bool döndürür, CSP'ye takılmaz.
    const hasC = safeBool(() => gcs.has_gcs_conflicting_constraints()), hasR = safeBool(() => gcs.has_gcs_redundant_constraints());
    if (hasC) conflicting = readList(() => gcs.get_gcs_conflicting_constraints(), 'conflicting') ?? culprits(mod, prims, sk, 'conflicting');
    if (hasR) redundant = readList(() => gcs.get_gcs_redundant_constraints(), 'redundant') ?? culprits(mod, prims, sk, 'redundant');
    if (ok) {
      gcs.apply_solution();
      for (const p of gcs.sketch_index.get_primitives()) {
        if (p.type === 'point' && sk.points[p.id]) { sk.points[p.id].x = p.x; sk.points[p.id].y = p.y; }
        else if (p.type === 'circle' && entById[p.id]) entById[p.id].r = p.radius;
        else if ((p.type === 'ellipse' || p.type === 'arc_of_ellipse') && entById[p.id]) entById[p.id].rmin = p.radmin;
      }
    }
    return { ok: ok && !errs.length, dof, conflicting, redundant, errors: errs };
  } catch (e) {
    return { ok: false, dof: null, conflicting: [], redundant: [], errors: [toErr(e)] };
  } finally { try { gcs.destroy_gcs_module(); } catch (e) {} }
}

// Nesne başına serbestlik: her noktayı (ve daire/elips yarıçaplarını) tek tek sabitleyip serbestlik derecesinin
// düşüp düşmediğine bakar (PlaneGCS bağımlı-parametre bilgisini WASM arayüzünde sunmuyor).
// Döner {dof, freePts:Set, freeEnts:Set} ya da çözülemezse null. dof===0 ise hiçbir sınama yapılmaz.
export async function probeFree(sk, vars = {}, maxPts = 400) {
  const mod = await initSolver();
  const { prims, entById, errs } = buildPrims(sk, vars); if (errs.length) return null;
  const run = (extra) => {
    const g = new GcsWrapper(new mod.GcsSystem());
    try { g.push_primitives_and_params([...prims, ...extra]); const st = g.solve(); if (!(st === 0 || st === 1)) return null; return g.gcs.dof(); } finally { try { g.destroy_gcs_module(); } catch (e) {} }
  };
  const d0 = run([]); if (d0 == null) return null;
  const freePts = new Set(), freeEnts = new Set();
  if (d0 === 0) return { dof: 0, freePts, freeEnts };
  const ids = Object.keys(sk.points).filter((id) => !sk.points[id].fixed);
  if (ids.length > maxPts) return { dof: d0, freePts: null, freeEnts: null };
  for (const id of ids) {
    const p = sk.points[id];
    const d = run([{ id: '_px', type: 'coordinate_x', p_id: id, x: p.x}, { id: '_py', type: 'coordinate_y', p_id: id, y: p.y}]);
    if (d == null || d < d0) freePts.add(id);
  }
  for (const e of sk.ents || []) {
    let free = false;
    const pts = e.type === 'line' ? [e.a, e.b] : e.type === 'circle' ? [e.c] : e.type === 'arc' ? [e.c, e.a, e.b] : e.type === 'ellipse' ? [e.c, e.f] : e.type === 'ellarc' ? [e.c, e.f, e.a, e.b] : e.type === 'spline' ? e.pts : e.type === 'point' ? [e.p] : [];
    if (pts.some((id) => freePts.has(id))) free = true;
    else if (e.type === 'circle') { const d = run([{ id: '_r', type: 'circle_radius', c_id: e.id, radius: e.r}]); if (d == null || d < d0) free = true; }
    else if (e.type === 'ellipse' || e.type === 'ellarc') { const d = run([{ id: '_r', type: 'difference', param1: 0, param2: { o_id: e.id, prop: 'radmin' }, difference: Math.abs(e.rmin)}]); if (d == null || d < d0) free = true; }
    if (free) freeEnts.add(e.id);
  }
  return { dof: d0, freePts, freeEnts };
}
