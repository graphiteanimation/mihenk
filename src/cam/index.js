// Mihenk CAM cekirdegi (saf JS): setup cozumu, islem hesabi, kapilar, program kurucu. API: docs/CAM.md.
import { cerr } from './geom/err.js';
import { normalizeTool } from './tools.js';
import { resolveFixtures } from './sim/fixtures.js';
import { computeFace } from './ops/face.js';
import { computeDrill } from './ops/drill.js';
import { computeContour } from './ops/contour.js';
import { computePocket } from './ops/pocket.js';
import { computeChamfer } from './ops/chamfer.js';
import { computeCircular } from './ops/circular.js';
import { computeSlot, computeTrace } from './ops/slot.js';
import { computeThread } from './ops/thread.js';
export { gates, gatesAsync } from './gates.js';
export { simulateAsync } from './sim/async.js';
export { gcodeToProgram } from './sim/gcode.js';
import { computeAdaptive } from './ops/adaptive.js'; // WP-12
import { computeFlat } from './ops/flat.js'; // WP-12
import { applyFeedOpt } from './ops/feedopt.js'; // WP-12
import { computeSurface } from './ops/surface.js'; // WP-15
import { applyArcFit } from './ops/arcfit.js'; // WP-15
export { SURF3D_TYPES } from './ops/surface.js';
export { computeOpAsync } from './surf/async.js'; // WP-15
export { buildProgram, generateProgram, expandAngles, axisPlane, freePiecePolicy, resolveGeom, annotateHoleExits, sketchPoints, drillMaps, advanceStock, chainStock } from './program.js';
export { CamErr } from './geom/err.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const AXES = { '+X': [1, 0, 0], '-X': [-1, 0, 0], '+Y': [0, 1, 0], '-Y': [0, -1, 0], '+Z': [0, 0, 1], '-Z': [0, 0, -1] };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
export const WCS = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59', 'G54.1'];

function axisDir(spec, plane, which) {
  if (!spec || typeof spec !== 'object') throw cerr('cam.setup.bad_field', { field: `frame.${which}Axis` });
  if (spec.kind === 'base') { const d = AXES[spec.dir]; if (!d) throw cerr('cam.setup.bad_field', { field: `frame.${which}Axis.dir` }); return d; }
  if (spec.kind === 'face' || spec.kind === 'edge') {
    // yuz normali cekirdekten (facePlane) onceden alinip opts.planes ile verilir; saklanmis normal KULLANILMAZ (eskiyebilir)
    if (!plane || !Array.isArray(plane.n)) throw cerr('cam.setup.face_axis_unresolved', { axis: which });
    return nrm(spec.flip ? plane.n.map((x) => -x) : plane.n);
  }
  throw cerr('cam.setup.bad_field', { field: `frame.${which}Axis.kind` });
}
// gövdelerin goruntu agi koselerinden yonlu kutu (eksenler F satirlari; dunya orijinine gore)
function orientedBBox(bodies, F) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const b of bodies) { const v = b.vertices; for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { const q = v[i] * F[k][0] + v[i + 1] * F[k][1] + v[i + 2] * F[k][2]; if (q < mn[k]) mn[k] = q; if (q > mx[k]) mx[k] = q; } }
  if (!Number.isFinite(mn[0])) throw cerr('cam.setup.no_bodies');
  return { min: mn, max: mx };
}

// resolveSetup(setup, rebuildResult, machine, opts?) -> cozulmus setup (setup uzayi; A acisinda etkin cerceve)
// opts.planes: { z?: {n:[..]}, x?: {n:[..]} }  (zAxis/xAxis kind 'face' ise cekirdek facePlane sonucu; 'edge' ise dogru kenar yonu {n})
export function resolveSetup(setup, rebuild, machine, opts = {}) {
  if (!setup || typeof setup !== 'object') throw cerr('cam.setup.bad_field', { field: 'setup' });
  const ids = Array.isArray(setup.bodies) ? setup.bodies : []; if (!ids.length) throw cerr('cam.setup.no_bodies');
  const bodies = ids.map((id) => { const b = (rebuild?.bodies || []).find((x) => x.id === id); if (!b) throw cerr('cam.setup.body_missing', { body: String(id) }); return b; });
  const fr = setup.frame || {};
  const z = axisDir(fr.zAxis ?? { kind: 'base', dir: '+Z' }, opts.planes?.z, 'z');
  const x0 = axisDir(fr.xAxis ?? { kind: 'base', dir: '+X' }, opts.planes?.x, 'x');
  let xv = x0;
  if (Math.abs(dot(z, x0)) > 1e-9) {
    // WP-07: xAxis.auto -> verilen taban yonun Z'ye dik izdusumu (egik yuz/kenar Z icin); yoksa hata
    if (fr.xAxis?.auto === true) { const k = dot(z, x0); xv = [x0[0] - k * z[0], x0[1] - k * z[1], x0[2] - k * z[2]]; if (!(Math.hypot(...xv) > 1e-6)) throw cerr('cam.setup.axes_not_perpendicular'); }
    else throw cerr('cam.setup.axes_not_perpendicular');
  }
  const x = nrm(xv), y = cross(z, x); const F0 = [x, y, z];
  // stok (yonlu, dunya orijinli koordinatlarda)
  const mb = orientedBBox(bodies, F0); const st = setup.stock || {};
  let sb; let stock;
  const org = fr.origin || { kind: 'stockCorner', corner: 'x-y-z+' };
  if (st.kind === 'boxOffset') {
    for (const k of ['side', 'top', 'bottom']) if (!(isNum(st[k]) && st[k] >= 0)) throw cerr('cam.setup.bad_field', { field: 'stock.' + k });
    sb = { min: [mb.min[0] - st.side, mb.min[1] - st.side, mb.min[2] - st.bottom], max: [mb.max[0] + st.side, mb.max[1] + st.side, mb.max[2] + st.top] }; stock = { kind: 'box' };
  } else if (st.kind === 'box') {
    if (!Array.isArray(st.min) || !Array.isArray(st.max) || ![...st.min, ...st.max].every(isNum) || !st.min.every((v, i) => st.max[i] > v)) throw cerr('cam.setup.bad_field', { field: 'stock.min/max' });
    sb = { min: st.min.slice(), max: st.max.slice() }; stock = { kind: 'box' };
    for (let k = 0; k < 3; k++) if (mb.min[k] < sb.min[k] - 1e-6 || mb.max[k] > sb.max[k] + 1e-6) throw cerr('cam.setup.stock_small');
  } else if (st.kind === 'cyl') {
    if (!(isNum(st.dia) && st.dia > 0 && isNum(st.len) && st.len > 0) || (st.axis ?? 'X') !== 'X') throw cerr('cam.setup.bad_field', { field: 'stock' });
    if (org.kind !== 'point' && org.kind !== 'model') throw cerr('cam.setup.cyl_origin');
    const o = org.kind === 'point' ? F0.map((a) => dot(a, org.p)) : [0, 0, 0]; const R = st.dia / 2; const cx = (mb.min[0] + mb.max[0]) / 2;
    sb = { min: [cx - st.len / 2, o[1] - R, o[2] - R], max: [cx + st.len / 2, o[1] + R, o[2] + R] }; stock = { kind: 'cyl', dia: st.dia, len: st.len };
    // model silindirin icinde mi (yonlu kutu koseleri, muhafazakar)
    for (const yy of [mb.min[1], mb.max[1]]) for (const zz of [mb.min[2], mb.max[2]]) if (Math.hypot(yy - o[1], zz - o[2]) > R + 1e-6) throw cerr('cam.setup.stock_small');
    if (mb.min[0] < sb.min[0] - 1e-6 || mb.max[0] > sb.max[0] + 1e-6) throw cerr('cam.setup.stock_small');
  } else throw cerr('cam.setup.bad_field', { field: 'stock.kind' });
  // orijin (yonlu koordinatlarda)
  let oR;
  if (org.kind === 'model') oR = [0, 0, 0];
  else if (org.kind === 'point') { if (!Array.isArray(org.p) || org.p.length !== 3 || !org.p.every(isNum)) throw cerr('cam.setup.bad_field', { field: 'frame.origin.p' }); oR = F0.map((a) => dot(a, org.p)); }
  else if (org.kind === 'stockTopCenter') oR = [(sb.min[0] + sb.max[0]) / 2, (sb.min[1] + sb.max[1]) / 2, sb.max[2]];
  else if (org.kind === 'stockCorner') {
    const m = /^x([+-])y([+-])z([+-])$/.exec(org.corner ?? 'x-y-z+'); if (!m) throw cerr('cam.setup.bad_field', { field: 'frame.origin.corner' });
    oR = [0, 1, 2].map((k) => (m[k + 1] === '+' ? sb.max[k] : sb.min[k]));
  } else throw cerr('cam.setup.bad_field', { field: 'frame.origin.kind' });
  const o = [0, 1, 2].map((k) => oR[0] * F0[0][k] + oR[1] * F0[1][k] + oR[2] * F0[2][k]);
  // A ekseni (3+1): phi = aAngle * isaret(A.dir . +X); etkin cerceve F = Rx(phi) * F0
  let aAngle = null; let F = F0;
  if (setup.rotary?.enabled) {
    const A = machine?.axes?.A; if (!A || A.kind !== 'rotary' || A.about !== 'X') throw cerr('cam.setup.no_rotary');
    aAngle = setup.rotary.aAngle; if (!isNum(aAngle)) throw cerr('cam.setup.bad_field', { field: 'rotary.aAngle' });
    const phi = (aAngle * Math.PI / 180) * Math.sign(A.dir[0]); const c = Math.cos(phi), s = Math.sin(phi);
    F = [x, [c * y[0] - s * z[0], c * y[1] - s * z[1], c * y[2] - s * z[2]], [s * y[0] + c * z[0], s * y[1] + c * z[1], s * y[2] + c * z[2]]];
  }
  const sub3 = (a) => [a[0] - oR[0], a[1] - oR[1], a[2] - oR[2]];
  let stockBox = { min: sub3(sb.min), max: sub3(sb.max) };
  if (aAngle !== null) { // donmus stok: silindir simetrik; kutu icin koselerin kutusu (muhafazakar)
    const phi = (aAngle * Math.PI / 180) * Math.sign(machine.axes.A.dir[0]); const c = Math.cos(phi), s = Math.sin(phi);
    if (stock.kind !== 'cyl') {
      const mn = [stockBox.min[0], Infinity, Infinity], mx = [stockBox.max[0], -Infinity, -Infinity];
      for (const yy of [stockBox.min[1], stockBox.max[1]]) for (const zz of [stockBox.min[2], stockBox.max[2]]) { const y2 = c * yy - s * zz, z2 = s * yy + c * zz; mn[1] = Math.min(mn[1], y2); mx[1] = Math.max(mx[1], y2); mn[2] = Math.min(mn[2], z2); mx[2] = Math.max(mx[2], z2); }
      stockBox = { min: mn, max: mx };
    }
  }
  const frame = { o, x: F[0], y: F[1], z: F[2] };
  const mbe = orientedBBox(bodies, F); const oe = F.map((a) => dot(a, o));
  const modelBBox = { min: mbe.min.map((v, k) => v - oe[k]), max: mbe.max.map((v, k) => v - oe[k]) };
  const wo = setup.workOffset; if (!wo || !WCS.includes(wo.kind)) throw cerr('cam.setup.bad_field', { field: 'workOffset' });
  if (wo.kind === 'G54.1' && !(Number.isInteger(wo.p) && wo.p >= 1)) throw cerr('cam.setup.bad_field', { field: 'workOffset.p' });
  const clr = setup.clearanceZ ?? 0; if (!(isNum(clr) && clr >= 0)) throw cerr('cam.setup.bad_field', { field: 'clearanceZ' });
  // WP-07: silindir stok (eksen X): sim baslangic haritasi kesit merkezi/yaricapla yuvarlak ust yuzeyi kurar
  const stockCyl = stock.kind === 'cyl' ? { yc: (stockBox.min[1] + stockBox.max[1]) / 2, zc: (stockBox.min[2] + stockBox.max[2]) / 2, R: stock.dia / 2 } : null;
  // WP-13: baglama govdeleri (taban setup cercevesi / model uzayi -> setup cercevesi; sim carpma denetimi + gorunum)
  const fixtures = resolveFixtures(setup.fixtures, { frame, frame0: { o, x, y, z }, bodies: rebuild?.bodies || [], partBodies: ids });
  return { id: setup.id, name: setup.name ?? setup.id, bodies: ids, workOffset: { ...wo }, frame, frame0: { o, x, y, z }, aAngle, stock, stockCyl, stockBox, modelBBox, clearance: clr, stockTop: stockBox.max[2], machinePos: setup.machinePos ?? null, ...(fixtures.length ? { fixtures } : {}) };
}

// computeOp(op, ctx) -> Toolpath (IR) | throw CamErr.  ctx = { setup: resolveSetup sonucu, tool: belge takimi, geom, machine }
export function computeOp(op, ctx) {
  if (!op || typeof op !== 'object') throw cerr('cam.op.bad_field', { field: 'op', expect: 'object', op: '' });
  if (op.suppressed) throw cerr('cam.op.suppressed', { op: op.name || op.id });
  if (!ctx?.setup) throw cerr('cam.op.no_setup');
  if (!ctx.tool) throw cerr('cam.op.no_tool', { op: op.name || op.id });
  const tool = normalizeTool(ctx.tool);
  const c = { ...ctx, tool };
  let tp = runOp(op, c);
  if (op.arcFit) tp = applyArcFit(tp, op, ctx.machine); // WP-15: yay uydurma / dogru azaltma (IR duzeyi)
  return op.feedOpt ? applyFeedOpt(tp, op, ctx.machine) : tp; // WP-12: koseda / cikista ilerleme dusurme
}
function runOp(op, c) {
  switch (op.type) {
    case 'face': return computeFace(op, c);
    case 'drill': return computeDrill(op, c);
    case 'contour': return computeContour(op, c);
    case 'pocket': return computePocket(op, c);
    case 'chamfer': return computeChamfer(op, c);
    case 'circular': return computeCircular(op, c);
    case 'slot': return computeSlot(op, c);
    case 'trace': return computeTrace(op, c);
    case 'threadmill': return computeThread(op, c);
    case 'adaptive': return computeAdaptive(op, c);
    case 'flat': return computeFlat(op, c);
    case 'adaptive3d': case 'zlevel': case 'parallel': case 'scallop': case 'pencil': return computeSurface(op, c); // WP-15
    default: throw cerr('cam.op.unsupported', { what: String(op.type) });
  }
}
