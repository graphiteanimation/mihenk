// Delik islemleri: rebuild holes[] (O-008) ya da verilen noktalar -> cevrim hareketleri (IR 'cycle').
// Ekseni takim eksenine (setup -Z) paralel olmayan delik bu setup'ta listelenmez (uyari). Takim capi/hatvesi denetlenir.
// R duzlemi = delik ustu + heights.retract. Noktalar ayni cevrimde yalniz R duzlemi stok ustundeyse birlesir (G99 ile
// noktalar arasi gecis stok icinden gecmesin); degilse her nokta kendi cevrimidir (ustteki duzleme doner).
import { cerr } from '../geom/err.js';
import { tipLength } from '../tools.js';
import { need, opt, posNum, nonNeg, anyNum, cutting, Builder, finishToolpath, warn, r3 } from './common.js';

export const CYCLE_TOOLS = { drill: ['drill'], peck: ['drill'], chipbreak: ['drill'], spot: ['spot', 'drill', 'chamfer'], tap: ['tap'], ream: ['reamer'], bore: ['bore'] };
const DIA_TOL = 0.01;

// model uzayi -> setup uzayi
const toS = (F, p) => { const d = [p[0] - F.o[0], p[1] - F.o[1], p[2] - F.o[2]]; return [d[0] * F.x[0] + d[1] * F.x[1] + d[2] * F.x[2], d[0] * F.y[0] + d[1] * F.y[1] + d[2] * F.y[2], d[0] * F.z[0] + d[1] * F.z[1] + d[2] * F.z[2]]; };
const toSd = (F, d) => [d[0] * F.x[0] + d[1] * F.x[1] + d[2] * F.x[2], d[0] * F.y[0] + d[1] * F.y[1] + d[2] * F.y[2], d[0] * F.z[0] + d[1] * F.z[1] + d[2] * F.z[2]];

// Delikleri setup uzayinda topla: [{x, y, top, dia, depth, through, thread, tipAngle, feature}], atlanan sayisi
export function collectHoles(op, S, geom) {
  const sel = op.holes; if (!sel || typeof sel !== 'object') throw cerr('cam.op.missing', { field: 'holes', op: op.name || op.id });
  const out = []; let skipped = 0;
  if (sel.kind === 'feature') {
    const f = sel.filter || {};
    for (const h of geom?.holes || []) {
      if (f.feature != null && h.feature !== f.feature && h.patternOf !== f.feature && h.copyOf !== f.feature) continue;
      if (f.dia != null && Math.abs(h.dia - f.dia) > 1e-6) continue;
      h.positions.forEach((p, i) => {
        const d = toSd(S.frame, h.dirs[i] || h.dir); const q = toS(S.frame, p);
        if (Math.abs(d[2] + 1) > 1e-6) { skipped++; return; }
        out.push({ x: q[0], y: q[1], top: q[2], dia: h.dia, depth: h.depth, through: !!h.through, thread: h.thread || null, tipAngle: h.tipAngle, feature: h.feature });
      });
    }
  } else if (sel.kind === 'points') {
    for (const p of geom?.points || []) { const q = toS(S.frame, p.p); out.push({ x: q[0], y: q[1], top: q[2], dia: null, depth: null, through: false, thread: null, tipAngle: null, feature: null }); }
  } else throw cerr('cam.op.bad_field', { field: 'holes.kind', expect: 'feature/points', op: op.name || op.id });
  // ayni konum (yinelenen) tek delik
  const uniq = []; for (const h of out) if (!uniq.some((u) => Math.hypot(u.x - h.x, u.y - h.y) < 1e-6 && Math.abs(u.top - h.top) < 1e-6)) uniq.push(h);
  return { holes: uniq, skipped };
}

// en kisa yol: en yakin komsu + 2-opt
export function orderPoints(pts, start) {
  if (pts.length < 3) return pts.slice();
  const rest = pts.slice(); const out = []; let cur = start || [rest[0].x, rest[0].y];
  while (rest.length) { let bi = 0, bd = Infinity; rest.forEach((p, i) => { const d = Math.hypot(p.x - cur[0], p.y - cur[1]); if (d < bd) { bd = d; bi = i; } }); const p = rest.splice(bi, 1)[0]; out.push(p); cur = [p.x, p.y]; }
  const D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  for (let it = 0, improved = true; improved && it < 50; it++) {
    improved = false;
    for (let i = 0; i < out.length - 2; i++) for (let j = i + 2; j < out.length - 1; j++) {
      if (D(out[i], out[j]) + D(out[i + 1], out[j + 1]) < D(out[i], out[i + 1]) + D(out[j], out[j + 1]) - 1e-9) { out.splice(i + 1, j - i, ...out.slice(i + 1, j + 1).reverse()); improved = true; }
    }
  }
  return out;
}

export function computeDrill(op, ctx) {
  const { setup: S, tool, geom, machine } = ctx;
  const cut = cutting(op);
  const cycle = need(op, 'cycle', (v) => Object.hasOwn(CYCLE_TOOLS, v), Object.keys(CYCLE_TOOLS).join('/'));
  if (!CYCLE_TOOLS[cycle].includes(tool.type)) throw cerr('cam.drill.tool_cycle', { cycle, type: tool.type });
  const warnings = [];
  const { holes, skipped } = collectHoles(op, S, geom);
  if (skipped) warnings.push(warn('cam.drill.skipped_axis', { n: skipped }));
  if (!holes.length) throw cerr('cam.drill.no_holes');
  const dep = op.depth; if (!dep || typeof dep !== 'object') throw cerr('cam.op.missing', { field: 'depth', op: op.name || op.id });
  const tipComp = dep.tipComp === true; const brk = opt(op, 'depth.breakThrough', nonNeg, 'number >= 0', 0);
  const tipL = tipComp ? tipLength(tool) : 0;
  const clr = need(op, 'heights.clearance'), ret = need(op, 'heights.retract');
  if (ret > clr + 1e-9) throw cerr('cam.heights.retract_above_clearance', { retract: ret, clearance: clr });
  const stockTop = S.stockBox.max[2]; const zClr = stockTop + Math.max(clr, S.clearance ?? 0); const zSafe = stockTop + ret;
  let peck = null, dwell = null, pitch = null, f = cut.feedCut;
  if (cycle === 'peck' || cycle === 'chipbreak') peck = need(op, 'peck');
  if (op.dwell != null) dwell = need(op, 'dwell', nonNeg, 'number >= 0');
  if (cycle === 'tap') {
    if (!(tool.pitch > 0)) throw cerr('cam.drill.tap_no_pitch', { tool: tool.number });
    pitch = tool.pitch; f = cut.rpm * pitch; // senkron kilavuz: ilerleme = devir x hatve
  }
  let thru = 0, mism = 0, pmism = 0, nothread = 0;
  const pts = holes.map((h) => {
    let bottom;
    if (dep.from === 'abs') bottom = need(op, 'depth.z', anyNum, 'number');
    else if (dep.from === 'hole') {
      if (h.dia == null) throw cerr('cam.drill.depth_from_hole_needs_feature');
      if (h.through || h.depth == null) { bottom = S.modelBBox.min[2] - brk - tipL; thru++; }
      else bottom = h.top - h.depth - tipL;
    } else throw cerr('cam.op.bad_field', { field: 'depth.from', expect: 'hole/abs', op: op.name || op.id });
    if (h.dia != null) {
      if (cycle === 'tap') {
        if (!h.thread) nothread++;
        else { if (h.thread.major != null && Math.abs(h.thread.major - tool.dia) > DIA_TOL) mism++; if (h.thread.pitch != null && Math.abs(h.thread.pitch - tool.pitch) > 1e-6) pmism++; }
      } else if (cycle !== 'spot' && Math.abs(h.dia - tool.dia) > DIA_TOL) mism++;
    }
    const R = h.top + ret;
    if (!(bottom < R - 1e-9)) throw cerr('cam.drill.bottom_above_r', { bottom: r3(bottom), r: r3(R) });
    return { ...h, bottom, R };
  });
  if (thru) warnings.push(warn('cam.drill.through_to_model_bottom', { n: thru, z: r3(S.modelBBox.min[2]) }));
  if (mism) warnings.push(warn('cam.drill.dia_mismatch', { n: mism, dia: tool.dia }));
  if (pmism) warnings.push(warn('cam.drill.pitch_mismatch', { n: pmism, pitch: tool.pitch }));
  if (nothread) warnings.push(warn('cam.drill.no_thread', { n: nothread }));
  const order = op.order ?? 'asis'; if (!['asis', 'shortest'].includes(order)) throw cerr('cam.op.bad_field', { field: 'order', expect: 'asis/shortest', op: op.name || op.id });
  const seq = order === 'shortest' ? orderPoints(pts) : pts;
  // gruplama: ayni ust z, ayni dip ve R stok ustunde -> tek cevrim; aksi halde her nokta ayri cevrim
  const groups = [];
  for (const p of seq) {
    const g = groups[groups.length - 1];
    if (g && p.R >= stockTop - 1e-9 && g.R >= stockTop - 1e-9 && Math.abs(g.top - p.top) < 1e-6 && Math.abs(g.bottom - p.bottom) < 1e-6) g.points.push([p.x, p.y]);
    else groups.push({ top: p.top, bottom: p.bottom, R: p.R, points: [[p.x, p.y]] });
  }
  const zCyc = Math.max(zSafe, ...groups.map((g) => g.R)); // cevrim baslangic (ilk) duzlemi: stok ustu ve tum R'lerin ustu
  if (zCyc > zClr + 1e-9) throw cerr('cam.heights.retract_above_clearance', { retract: r3(zCyc - stockTop), clearance: clr });
  const b = new Builder({ zClr, zRet: zCyc, feed: f, tool });
  for (const g of groups) {
    const [x, y] = g.points[0];
    if (!b.pos) b.start(x, y);
    else if (Math.abs(b.pos[2] - zCyc) > 1e-9) b.rapid(b.pos[0], b.pos[1], zCyc);
    if (Math.hypot(b.pos[0] - x, b.pos[1] - y) > 1e-9) b.rapid(x, y, zCyc);
    if (Math.abs(b.pos[2] - zCyc) > 1e-9) b.rapid(x, y, zCyc);
    const m = { t: 'cycle', cycle, points: g.points, top: g.top, bottom: g.bottom, retract: g.R, clearance: zCyc, f };
    if (peck != null) m.peck = peck; if (dwell != null) m.dwell = dwell; if (pitch != null) m.pitch = pitch;
    b.moves.push(m); const lp = g.points[g.points.length - 1]; b.pos = [lp[0], lp[1], zCyc];
  }
  const passDepth = Math.max(...pts.map((p) => p.top - p.bottom));
  const hh = { zClr, zRet: zCyc, zTop: Math.max(...pts.map((p) => p.top)), zBot: Math.min(...pts.map((p) => p.bottom)), stockTop };
  return finishToolpath(op, tool, { ...cut }, hh, b, { warnings, passDepth, rapidFeed: machine?.feed?.rapid ?? undefined, meta: { holes: pts.length, cycles: groups.length } });
}
