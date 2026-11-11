// Program kurucu: cozulmus setup'lar + takim yollari -> Program IR; ve uctan uca uretici (cekirdek sorgulariyla).
import { cerr } from './geom/err.js';
import { gates as runGates, blocked } from './gates.js';
import { validateProgram } from './ir.js';

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

// generateProgram(cam, {rebuild, machine, query, name, number?, sim?, onlyOps?})
//   query(cmd, args) -> Promise: cekirdek worker komutu ('camFaceLoops', 'facePlane')
//   sim: gates(...) opts.sim (yoksa kapi 5 'sim_not_run' uyarisi)
// -> { program|null, ops:[{opId, setupId, ok, error?, toolpath?}], gates:[...], blocked }
export async function generateProgram(cam, { rebuild, machine, query, name, number = null, sim = null, onlyOps = null }) {
  const { resolveSetup, computeOp } = await import('./index.js');
  const ops = []; const sections = []; const pre = [];
  const tools = cam?.tools || [];
  for (const setup of cam?.setups || []) {
    let S;
    try {
      const planes = {};
      for (const k of ['z', 'x']) { const ax = setup.frame?.[k + 'Axis']; if (ax?.kind === 'face') { const pl = await query('facePlane', { ref: ax.ref }); planes[k] = pl; } }
      S = resolveSetup(setup, rebuild, machine, { planes });
    } catch (e) { pre.push({ level: 'block', code: e.code || 'internal', params: e.params || {}, setupId: setup.id }); continue; }
    const tps = [];
    for (const op of setup.ops || []) {
      if (op.suppressed) continue; if (onlyOps && !onlyOps.includes(op.id)) continue;
      try {
        const tool = tools.find((t) => t.id === op.toolId); if (!tool) throw cerr('cam.op.no_tool', { op: op.name || op.id });
        const geom = {};
        if (op.type === 'drill') { geom.holes = rebuild?.holes || []; }
        if (op.type === 'contour' || op.type === 'pocket') {
          geom.faces = [];
          for (const sel of op.geom || []) {
            if (sel.kind !== 'face') throw cerr('cam.geom.sel_unsupported', { kind: String(sel.kind) });
            geom.faces.push(await query('camFaceLoops', { ref: sel.ref, frame: S.frame }));
          }
        }
        const tp = computeOp(op, { setup: S, tool, geom, machine });
        tps.push(tp); ops.push({ opId: op.id, setupId: setup.id, ok: true, toolpath: tp });
      } catch (e) { ops.push({ opId: op.id, setupId: setup.id, ok: false, error: { code: e.code || 'internal', params: e.params || { message: String(e?.message ?? e) } } }); pre.push({ level: 'block', code: 'cam.gate.op_failed', params: { op: op.name || op.id, code: e.code || 'internal' }, opId: op.id }); }
    }
    if (tps.length) sections.push({ setup: S, toolpaths: tps });
  }
  let program = null;
  if (sections.length) { try { program = buildProgram({ name: name || 'PROG', number, machine, sections }); } catch (e) { pre.push({ level: 'block', code: e.code || 'internal', params: e.params || {} }); } }
  else pre.push({ level: 'block', code: 'cam.program.empty', params: {} });
  const g = [...pre, ...(program ? runGates(program, machine, { sim }) : [])];
  return { program, ops, gates: g, blocked: blocked(g) };
}
