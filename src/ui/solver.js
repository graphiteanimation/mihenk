// Sketch kısıt çözücüsü: FreeCAD PlaneGCS (WASM). Sketch modelini planegcs ilkel listesine çevirir.
import { init_planegcs_module, GcsWrapper } from '@salusoft89/planegcs';
import { evalExpr } from '../shared/expr.js';

let modPromise = null;
export function initSolver(locate) { if (!modPromise) modPromise = init_planegcs_module(locate ? { locateFile: locate } : undefined); return modPromise; }

const TAU = Math.PI * 2;
// sk: {points:{id:{x,y,fixed}}, ents:[], cons:[]}
// Döner: {ok, dof, conflicting:[ids], redundant:[ids], error}
export async function solveSketch(sk, vars = {}, drag = null) {
  const mod = await initSolver();
  const gcs = new GcsWrapper(new mod.GcsSystem());
  const errs = [];
  try {
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
    }
    const val = (c) => { try { return evalExpr(c.expr, vars); } catch (err) { errs.push({ id: c.id, msg: err.message }); return null; } };
    const T = (id) => entById[id]?.type;
    for (const c of sk.cons || []) {
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
        case 'equal':
          if (T(c.a) === 'line' && T(c.b) === 'line') prims.push({ ...base, type: 'equal_length', l1_id: c.a, l2_id: c.b });
          else if (T(c.a) === 'circle' && T(c.b) === 'circle') prims.push({ ...base, type: 'equal_radius_cc', c1_id: c.a, c2_id: c.b });
          else if (T(c.a) === 'arc' && T(c.b) === 'arc') prims.push({ ...base, type: 'equal_radius_aa', a1_id: c.a, a2_id: c.b });
          else if (T(c.a) === 'circle' && T(c.b) === 'arc') prims.push({ ...base, type: 'equal_radius_ca', c_id: c.a, a_id: c.b });
          else if (T(c.a) === 'arc' && T(c.b) === 'circle') prims.push({ ...base, type: 'equal_radius_ca', c_id: c.b, a_id: c.a });
          break;
        case 'tangent': {
          let l = c.a, o = c.b; if (T(l) !== 'line') { l = c.b; o = c.a; }
          if (T(l) === 'line' && T(o) === 'circle') prims.push({ ...base, type: 'tangent_lc', l_id: l, c_id: o });
          else if (T(l) === 'line' && T(o) === 'arc') prims.push({ ...base, type: 'tangent_la', l_id: l, a_id: o });
          else if (T(c.a) === 'circle' && T(c.b) === 'circle') prims.push({ ...base, type: 'tangent_cc', c1_id: c.a, c2_id: c.b });
          else if (T(c.a) === 'arc' && T(c.b) === 'arc') prims.push({ ...base, type: 'tangent_aa', a1_id: c.a, a2_id: c.b });
          else if (T(c.a) === 'circle' && T(c.b) === 'arc') prims.push({ ...base, type: 'tangent_ca', c_id: c.a, a_id: c.b });
          else if (T(c.a) === 'arc' && T(c.b) === 'circle') prims.push({ ...base, type: 'tangent_ca', c_id: c.b, a_id: c.a });
          break;
        }
        case 'pointOn': // a: nokta, b: çizgi/daire/yay
          if (T(c.b) === 'line') prims.push({ ...base, type: 'point_on_line_pl', p_id: c.a, l_id: c.b });
          else if (T(c.b) === 'circle') prims.push({ ...base, type: 'point_on_circle', p_id: c.a, c_id: c.b });
          else if (T(c.b) === 'arc') prims.push({ ...base, type: 'point_on_arc', p_id: c.a, a_id: c.b });
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
        case 'radius': { const v = val(c); if (v != null) prims.push(T(c.a) === 'arc' ? { ...base, type: 'arc_radius', a_id: c.a, radius: v } : { ...base, type: 'circle_radius', c_id: c.a, radius: v }); break; }
        case 'diameter': { const v = val(c); if (v != null) prims.push(T(c.a) === 'arc' ? { ...base, type: 'arc_radius', a_id: c.a, radius: v / 2 } : { ...base, type: 'circle_radius', c_id: c.a, radius: v / 2 }); break; }
        case 'angle': { const v = val(c); if (v != null) prims.push({ ...base, type: 'l2l_angle_ll', l1_id: c.a, l2_id: c.b, angle: (v * Math.PI) / 180 }); break; }
      }
    }
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
    try { if (gcs.has_gcs_conflicting_constraints()) conflicting = gcs.get_gcs_conflicting_constraints(); } catch (e) {}
    try { if (gcs.has_gcs_redundant_constraints()) redundant = gcs.get_gcs_redundant_constraints(); } catch (e) {}
    if (ok) {
      gcs.apply_solution();
      for (const p of gcs.sketch_index.get_primitives()) {
        if (p.type === 'point' && sk.points[p.id]) { sk.points[p.id].x = p.x; sk.points[p.id].y = p.y; }
        else if (p.type === 'circle' && entById[p.id]) entById[p.id].r = p.radius;
      }
    }
    return { ok: ok && !errs.length, dof, conflicting, redundant, errors: errs };
  } catch (e) {
    return { ok: false, dof: null, conflicting: [], redundant: [], errors: [{ msg: e.message || String(e) }] };
  } finally { try { gcs.destroy_gcs_module(); } catch (e) {} }
}
