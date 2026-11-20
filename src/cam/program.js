// Program kurucu: cozulmus setup'lar + takim yollari -> Program IR; ve uctan uca uretici (cekirdek sorgulariyla).
import { cerr, issue } from './geom/err.js';
import { gates as runGates, blocked } from './gates.js';
import { validateProgram } from './ir.js';
import { sketchFaces, silhouetteFace, midLevels } from './geom/select.js';
import { simulate, createHeightmap } from './sim/index.js';

// buildProgram({name, number?, machine, sections:[{setup: resolveSetup sonucu, toolpaths:[Toolpath]}]}) -> Program
export function buildProgram({ name, number = null, machine, sections }) {
  if (typeof name !== 'string' || !name) throw cerr('cam.program.no_name');
  const out = [];
  for (const sec of sections || []) for (const tp of sec.toolpaths || []) {
    const S = sec.setup;
    out.push({ setup: { id: S.id, name: S.name, workOffset: { ...S.workOffset }, aAngle: S.aAngle ?? null, stockBox: S.stockBox, machinePos: S.machinePos ?? null }, toolpath: tp });
  }
  if (!out.length) throw cerr('cam.program.empty');
  const p = { name, number, machine: machine ? { id: machine.id, name: machine.name, rev: machine.rev ?? null, control: machine.control } : null, units: 'mm', sections: out };
  validateProgram(p);
  return p;
}

// Secimleri (face | sketch | silhouette) yuz nesnelerine cozer. Bir sketch secimi birden cok bolge verebilir: secim
// listesi buna gore genisletilir. Donus { sels, faces } (ayni sira).
export async function resolveGeom(op, S, { rebuild, doc, query }) {
  const sels = [], faces = [];
  for (const sel of op.geom || []) {
    if (sel.kind === 'face') { sels.push(sel); faces.push(await query('camFaceLoops', { ref: sel.ref, frame: S.frame })); }
    else if (sel.kind === 'sketch') {
      const sk = (doc?.features || []).find((f) => f && f.type === 'sketch' && f.id === sel.sketch);
      const plane = rebuild?.sketches?.[sel.sketch]?.plane;
      for (const f of sketchFaces(sel, sk, plane, S.frame)) { sels.push({ ...sel, kind: 'face' }); faces.push(f); }
    } else if (sel.kind === 'silhouette') {
      if (!S.bodies.includes(sel.body)) throw cerr('cam.setup.body_missing', { body: String(sel.body) });
      const zl = await query('camZLevels', { body: sel.body, frame: S.frame });
      const secs = []; for (const z of midLevels(zl.levels)) secs.push(await query('camSection', { body: sel.body, frame: S.frame, z }));
      sels.push({ ...sel, kind: 'face', loops: sel.loops ?? 'outer' }); faces.push(silhouetteFace(zl, secs));
    } else throw cerr('cam.geom.sel_unsupported', { kind: String(sel.kind) });
  }
  return { sels, faces };
}

// T-05a: holes.kind 'points' -> sketch noktalari (model uzayi) [{p:[x,y,z]}]. sel = {kind:'points', sketch, ents?}.
// ents verilmezse sketch'in nokta ogeleri (yoksa yapi cizgisi olmayan daire merkezleri; cekirdek 'hole' kurali ile ayni);
// ents verilirse yalniz o ogeler: nokta -> konumu, daire/yay -> merkezi. Bulunmayan oge sessizce atlanmaz: hata.
export function sketchPoints(sel, { rebuild, doc }) {
  const sk = (doc?.features || []).find((f) => f && f.type === 'sketch' && f.id === sel.sketch);
  const plane = rebuild?.sketches?.[sel.sketch]?.plane;
  if (!sk || !Array.isArray(sk.ents) || !sk.points || !plane || !Array.isArray(plane.o)) throw cerr('cam.geom.sketch_missing', { sketch: String(sel.sketch) });
  const P = sk.points; const at = (k) => { const q = P[k]; return q && Number.isFinite(q.x) && Number.isFinite(q.y) ? q : null; };
  const of = (e) => (e.type === 'point' ? at(e.p) : (e.type === 'circle' || e.type === 'arc') ? at(e.c) : null);
  let src;
  if (Array.isArray(sel.ents) && sel.ents.length) {
    src = sel.ents.map((id) => { const e = sk.ents.find((x) => x.id === id); const q = e ? of(e) : null; if (!q) throw cerr('cam.drill.point_missing', { ent: String(id), sketch: String(sel.sketch) }); return q; });
  } else {
    src = sk.ents.filter((e) => e.type === 'point').map(of).filter(Boolean);
    if (!src.length) src = sk.ents.filter((e) => e.type === 'circle' && !e.cons).map(of).filter(Boolean);
  }
  return src.map((q) => ({ p: [0, 1, 2].map((k) => plane.o[k] + plane.x[k] * q.x + plane.y[k] * q.y) }));
}

// T-14: boydan boya (through / derinliksiz) deliklerin her konumu icin delik ekseninde modelden son cikis (cekirdek
// 'camHoleExit'). Yalniz model iki ucu da acik (gercekten boydan boya) ayni eksenli delik duvari bulursa h.exits[i] = uzunluk;
// aksi halde null: drill eski muhafazakar kurala (model tabani) doner ve uyarir. Sorgu hatasi da null (yanlis "kisa" dip yok).
export async function annotateHoleExits(holes, query, fallbackBodies = []) {
  const out = [];
  for (const h of holes || []) {
    if (!h || !(h.through || h.depth == null) || Array.isArray(h.exits) || !Array.isArray(h.positions)) { out.push(h); continue; }
    const exits = [];
    for (let i = 0; i < h.positions.length; i++) {
      const bodies = h.bodies?.[i]?.length ? h.bodies[i] : fallbackBodies; let t = null;
      if (bodies.length) {
        try { const r = await query('camHoleExit', { bodies, p: h.positions[i], d: h.dirs?.[i] || h.dir, r: h.dia > 0 ? h.dia / 2 : null }); if (r && r.through && r.deepOpen && Number.isFinite(r.t) && r.t > 0) t = r.t; } catch (e) { t = null; }
      }
      exits.push(t);
    }
    out.push({ ...h, exits });
  }
  return out;
}

// T-23: delme gecislerinin (G99) dogrulanmasi icin islem basi stok haritasi. st = {hm, done, failed}: setup'in o ana kadarki
// takim yollari sim ile BIR KEZ (artimli) islenir. Sim hatasi -> null (drill eski muhafazakar kurala doner).
export function advanceStock(st, tps, S, res) {
  if (st.failed) return null;
  try {
    for (; st.done < tps.length; st.done++) st.hm = simulate(tps[st.done], { res, stockBox: S.stockBox, ...(st.hm ? { stockHeightmap: st.hm } : {}) }).remainHeightmap;
    return st.hm;
  } catch (e) { st.failed = true; return null; }
}
// T-23: drill baglami icin harita cifti: stok (sim) + model ust haritasi (ince duvar guvencesi). Biri yoksa ikisi de null.
export async function drillMaps(st, tps, S, { res, model, query }) {
  let hm = st.hm && st.done === tps.length ? st.hm : advanceStock(st, tps, S, res);
  if (!hm) { if (st.failed) return {}; const b = S.stockBox; hm = st.hm0 || (st.hm0 = createHeightmap([b.min[0], b.min[1]], [b.max[0], b.max[1]], res, b.max[2])); }
  let mm = model || st.model || null;
  if (!mm && query && !st.modelFailed) {
    try { mm = st.model = await query('camHeightmap', { bodies: S.bodies, frame: S.frame, res, bbox: [S.stockBox.min[0], S.stockBox.min[1], S.stockBox.max[0], S.stockBox.max[1]] }); } catch (e) { st.modelFailed = true; mm = null; }
  }
  return hm && mm ? { stockMap: hm, modelMap: mm } : {};
}

// generateProgram(cam, {rebuild, machine, query, doc?, name, number?, sim?, onlyOps?})
//   doc: sketch secimleri icin belge (sketch ozellikleri); query komutlari: camFaceLoops, camSection, camZLevels, facePlane
//   query(cmd, args) -> Promise: cekirdek worker komutu ('camFaceLoops', 'facePlane')
//   sim: gates(...) opts.sim (yoksa kapi 5 'sim_not_run' uyarisi)
// -> { program|null, ops:[{opId, setupId, ok, error?, toolpath?}], gates:[...], blocked }
export async function generateProgram(cam, { rebuild, machine, query, doc = null, name, number = null, sim = null, onlyOps = null }) {
  const { resolveSetup, computeOp } = await import('./index.js');
  const ops = []; const sections = []; const pre = [];
  const tools = cam?.tools || [];
  let holesX = null; // T-14: delik cikislari bir kez (tum setup'lar icin ayni model uzayi verisi)
  for (const setup of cam?.setups || []) {
    let S;
    try {
      const planes = {};
      for (const [k, f] of [['z', 'zAxis'], ['x', 'xAxis']]) { const ax = setup.frame?.[f]; if (ax?.kind === 'face') { const pl = await query('facePlane', { ref: ax.ref }); planes[k] = pl; } }
      S = resolveSetup(setup, rebuild, machine, { planes });
    } catch (e) { pre.push({ level: 'block', code: e.code || 'internal', params: e.params || {}, setupId: setup.id }); continue; }
    const tps = []; const stk = { hm: null, done: 0 }; const mres = Math.min(sim?.res > 0 ? sim.res : 0.5, 0.5);
    for (const op of setup.ops || []) {
      if (op.suppressed) continue; if (onlyOps && !onlyOps.includes(op.id)) continue;
      try {
        const tool = tools.find((t) => t.id === op.toolId); if (!tool) throw cerr('cam.op.no_tool', { op: op.name || op.id });
        const geom = {};
        if (op.type === 'drill') { if (op.holes?.kind === 'points') geom.points = sketchPoints(op.holes, { rebuild, doc }); else { if (!holesX) holesX = await annotateHoleExits(rebuild?.holes || [], query, S.bodies); geom.holes = holesX; } }
        let opx = op;
        if (op.type === 'contour' || op.type === 'pocket') { const r = await resolveGeom(op, S, { rebuild, doc, query }); geom.faces = r.faces; opx = { ...op, geom: r.sels }; }
        const maps = op.type === 'drill' ? await drillMaps(stk, tps, S, { res: mres, model: sim?.modelHeightmaps?.[S.id]?.res <= mres ? sim.modelHeightmaps[S.id] : null, query }) : {};
        const tp = computeOp(opx, { setup: S, tool, geom, machine, ...maps });
        tps.push(tp); ops.push({ opId: op.id, setupId: setup.id, ok: true, toolpath: tp });
      } catch (e) { ops.push({ opId: op.id, setupId: setup.id, ok: false, error: { code: e.code || 'internal', params: e.params || { message: String(e?.message ?? e) } } }); pre.push(issue('cam.gate.op_failed', { op: op.name || op.id, code: e.code || 'internal' }, { level: 'block', opId: op.id })); }
    }
    if (tps.length) sections.push({ setup: S, toolpaths: tps });
  }
  let program = null;
  if (sections.length) { try { program = buildProgram({ name: name || 'PROG', number, machine, sections }); } catch (e) { pre.push({ level: 'block', code: e.code || 'internal', params: e.params || {} }); } }
  else pre.push(issue('cam.program.empty', {}, { level: 'block' }));
  const g = [...pre, ...(program ? runGates(program, machine, { sim }) : [])];
  return { program, ops, gates: g, blocked: blocked(g) };
}
