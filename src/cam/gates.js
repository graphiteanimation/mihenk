// Guvenlik kapilari (CAM-DESIGN.md): 'block' varken NC uretilmez. Sonuc: [{level:'block'|'warn', code, params, opId?, section?}]
// 1 eksik veri, 2 dokunulmaz numara, 3 sinirlar, 4 dalma/boy, 5 simulasyon (B: src/cam/sim), 6 doner eksen.
// Ayrica islem uyarilari (toolpath.warnings) 'warn' olarak eklenir.
import { checkMachine, axisTravel } from './machines/builtin.js';
import { walk } from './ir.js';
import { simulate } from './sim/index.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const G = (level, c, params, extra) => ({ level, code: c, params: params || {}, ...(extra || {}) });
export const wcsName = (w) => (w ? (w.kind === 'G54.1' ? `G54.1 P${w.p}` : w.kind) : null);

// opts.sim: { res, modelHeightmaps?:{[setupId]}, tools?:{[number]:{shaftDia, holder}}, ...diger simulate secenekleri } | false
export function gates(program, machine, opts = {}) {
  const out = [];
  const secs = program?.sections || [];
  // ---- 1: makine profili
  const mc = checkMachine(machine);
  for (const e of mc.errors) out.push(G('block', 'cam.gate.machine_invalid', e.params));
  for (const f of mc.missing) out.push(G('block', 'cam.gate.missing', { field: 'machine.' + f }));
  const prot = machine?.protected || { T: [], H: [], D: [], wcs: [] };
  const maxRpm = machine?.spindle?.maxRpm, minRpm = machine?.spindle?.minRpm, maxF = machine?.feed?.maxCut, maxTools = machine?.toolChange?.maxTools;
  const absWarned = new Set();
  secs.forEach((s, si) => {
    const tp = s.toolpath || {}; const opId = tp.opId; const T = tp.tool || {}; const X = { opId, section: si };
    // ---- 1: eksik veri
    if (!Number.isInteger(T.number) || T.number < 1) out.push(G('block', 'cam.gate.missing', { field: 'tool.number', op: tp.opName }, X));
    if (!Number.isInteger(T.H) || T.H < 1) out.push(G('block', 'cam.gate.missing', { field: 'tool.H', op: tp.opName }, X));
    if (tp.comp === 'wear' && !(Number.isInteger(T.D) && T.D >= 1)) out.push(G('block', 'cam.gate.missing', { field: 'tool.D', op: tp.opName }, X));
    if (!(isNum(tp.rpm) && tp.rpm > 0)) out.push(G('block', 'cam.gate.missing', { field: 'rpm', op: tp.opName }, X));
    const wo = s.setup?.workOffset; if (!wo || !wo.kind) out.push(G('block', 'cam.gate.missing', { field: 'workOffset', op: tp.opName }, X));
    let fMax = 0; let fBad = false;
    walk(tp, (m) => { if (m.t === 'feed' || m.t === 'arc' || m.t === 'cycle') { if (!(isNum(m.f) && m.f > 0)) fBad = true; else fMax = Math.max(fMax, m.f); } });
    if (fBad) out.push(G('block', 'cam.gate.missing', { field: 'feed', op: tp.opName }, X));
    // ---- 2: dokunulmaz numaralar
    if ((prot.T || []).includes(T.number)) out.push(G('block', 'cam.gate.protected', { kind: 'T', value: T.number, op: tp.opName }, X));
    if ((prot.H || []).includes(T.H)) out.push(G('block', 'cam.gate.protected', { kind: 'H', value: T.H, op: tp.opName }, X));
    if (tp.comp === 'wear' && (prot.D || []).includes(T.D)) out.push(G('block', 'cam.gate.protected', { kind: 'D', value: T.D, op: tp.opName }, X));
    const wn = wcsName(wo); if (wn && (prot.wcs || []).map((w) => w.replace(/\s+/g, ' ')).includes(wn)) out.push(G('block', 'cam.gate.protected', { kind: 'WCS', value: wn, op: tp.opName }, X));
    // ---- 3: sinirlar
    if (isNum(maxRpm) && tp.rpm > maxRpm) out.push(G('block', 'cam.gate.rpm_high', { rpm: tp.rpm, max: maxRpm, op: tp.opName }, X));
    if (isNum(minRpm) && tp.rpm < minRpm) out.push(G('block', 'cam.gate.rpm_low', { rpm: tp.rpm, min: minRpm, op: tp.opName }, X));
    if (isNum(maxF) && fMax > maxF) out.push(G('block', 'cam.gate.feed_high', { f: fMax, max: maxF, op: tp.opName }, X));
    if (isNum(maxTools) && T.number > maxTools) out.push(G('block', 'cam.gate.tool_number_high', { number: T.number, max: maxTools, op: tp.opName }, X));
    const bb = tp.stats?.bbox;
    if (bb) ['X', 'Y', 'Z'].forEach((k, i) => { const tr = axisTravel(machine, k); const span = bb.max[i] - bb.min[i]; if (isNum(tr) && span > tr + 1e-9) out.push(G('block', 'cam.gate.travel', { axis: k, span: Math.round(span * 1000) / 1000, travel: tr, op: tp.opName }, X)); });
    const sid = s.setup?.id; if (!s.setup?.machinePos && !absWarned.has(sid)) { absWarned.add(sid); out.push(G('warn', 'cam.gate.travel_abs_unchecked', { setup: s.setup?.name ?? sid }, { section: si })); }
    // ---- 4: dalma, kesici boyu, govde boyu
    const box = s.setup?.stockBox; const stockTop = box ? box.max[2] : tp.meta?.stockTop;
    if (T.centerCutting === false) {
      let bad = false;
      walk(tp, (m, k, from) => {
        if (bad || !from) return;
        if (m.t === 'cycle') { bad = true; return; }
        if (m.t === 'feed' && m.kind === 'plunge' && !m.clear && m.z < from.z - 1e-9 && Math.hypot(m.x - from.x, m.y - from.y) < 1e-9 && isNum(stockTop) && m.z < stockTop - 1e-6) {
          const inside = !box || (m.x > box.min[0] + 1e-6 && m.x < box.max[0] - 1e-6 && m.y > box.min[1] + 1e-6 && m.y < box.max[1] - 1e-6);
          if (inside) bad = true;
        }
      });
      if (bad) out.push(G('block', 'cam.gate.plunge_center', { tool: T.number, op: tp.opName }, X));
    }
    const pd = tp.meta?.passDepth; if (isNum(pd) && isNum(T.fluteLen) && pd > T.fluteLen + 1e-9) out.push(G('block', 'cam.gate.flute_short', { depth: Math.round(pd * 1000) / 1000, fluteLen: T.fluteLen, op: tp.opName }, X));
    const zMin = tp.stats?.zMin; if (isNum(zMin) && isNum(stockTop) && isNum(T.bodyLen) && stockTop - zMin > T.bodyLen + 1e-9) out.push(G('block', 'cam.gate.body_short', { depth: Math.round((stockTop - zMin) * 1000) / 1000, bodyLen: T.bodyLen, op: tp.opName }, X));
    // ---- 6: doner eksen
    const a = s.setup?.aAngle;
    if (a != null && a !== 0) {
      const A = machine?.axes?.A;
      if (!A || A.kind !== 'rotary') out.push(G('block', 'cam.gate.no_rotary', { op: tp.opName }, X));
      else if (Array.isArray(A.limits) && (a < A.limits[0] - 1e-9 || a > A.limits[1] + 1e-9)) out.push(G('block', 'cam.gate.a_limit', { a, min: A.limits[0], max: A.limits[1], op: tp.opName }, X));
    }
    // islem uyarilari
    for (const w of tp.warnings || []) out.push(G('warn', w.code, { ...w.params, op: tp.opName }, X));
  });
  // ---- 5: simulasyon (yalniz once gelen kapilar engellemiyorsa anlamli; yine de calistirilir)
  if (opts.sim === false || !opts.sim) out.push(G('warn', 'cam.gate.sim_not_run', {}));
  else if (secs.length) {
    const stockBoxes = {}; for (const s of secs) if (s.setup?.stockBox) stockBoxes[s.setup.id] = s.setup.stockBox;
    try {
      const res = simulate(program, { stockBoxes, ...opts.sim });
      for (const it of res.issues) out.push(G(it.level === 'error' ? 'block' : 'warn', it.code, it.params, { opId: secs[it.section]?.toolpath?.opId, section: it.section, moveIndex: it.moveIndex }));
      if (res.suppressed) out.push(G('warn', 'cam.gate.sim_suppressed', { n: res.suppressed }));
    } catch (e) { out.push(G('block', 'cam.gate.sim_failed', { code: e.code || 'internal', ...(e.params || {}) })); }
  }
  return out;
}
export const blocked = (list) => list.some((g) => g.level === 'block');
