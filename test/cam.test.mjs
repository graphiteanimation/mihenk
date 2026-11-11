// CAM cekirdegi testleri (Ajan A): saf geometri (cekirdeksiz) + cekirdekli uctan uca.
// Calistir: node test/cam.test.mjs
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import * as CAM from '../src/cam/index.js';
import * as P from '../src/cam/geom/path2d.js';
import * as G from '../src/shared/geom2d.js';
import { ringTree, pocketRegion, SegGrid } from '../src/cam/ops/pocket.js';
import { builtinMachines, checkMachine, copyMachine } from '../src/cam/machines/builtin.js';
import { normalizeTool, importLibrary, exportLibrary, applyPreset, toolListIssues } from '../src/cam/tools.js';
import { validateToolpath, validateProgram, walk, sampleArc } from '../src/cam/ir.js';
import { blocked } from '../src/cam/gates.js';
import { validateDoc } from '../src/shared/schema.js';
import { initKernel } from '../src/kernel/kernel.js';
import { findRegions } from '../src/shared/profiles.js';

const here = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(here, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const section = (s) => console.log(s);
const throwsCode = (fn, code, m) => { try { fn(); ok(false, `${m}: hata bekleniyordu (${code})`); } catch (e) { ok(e.code === code, `${m}: ${e.code} != ${code} ${JSON.stringify(e.params || {})}`); } };

// ------------------------------------------------------------------ yardimcilar
const sq = (x0, y0, x1, y1, open = []) => [G.mkLine([x0, y0], [x1, y0]), G.mkLine([x1, y0], [x1, y1]), G.mkLine([x1, y1], [x0, y1]), G.mkLine([x0, y1], [x0, y0])].map((s, i) => ({ ...s, fwd: true, open: open.includes(i) }));
const circ = (c, r, fwd) => [{ ...G.mkArc(c, r, 0, 2 * Math.PI), fwd, open: false }];
const poly = (pts) => pts.map((p, i) => ({ ...G.mkLine(p, pts[(i + 1) % pts.length]), fwd: true, open: false }));
const kloop = (items) => items.flatMap((it) => P.fromGeom2d(it, it.fwd, it.open ? { open: true } : null));
const flat = (dia, extra = {}) => ({ id: 't' + dia, number: 5, lengthOffset: 5, diaOffset: 5, type: 'flat', dia, fluteLen: 25, bodyLen: 50, flutes: 3, centerCutting: true, ...extra });
const base = { rpm: 8000, feedCut: 800, feedPlunge: 300, coolant: 'flood', heights: { clearance: 10, retract: 2 } };
const setupOf = (min, max, extra = {}) => ({ id: 's1', name: 'S1', workOffset: { kind: 'G55' }, frame: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, stock: { kind: 'box' }, stockBox: { min, max }, modelBBox: { min, max }, clearance: 5, aAngle: null, stockTop: max[2], machinePos: null, ...extra });
const S0 = setupOf([0, 0, -30], [100, 60, 0]);
// IR'yi XY noktalarina ornekle (yalniz kesme hareketleri; z filtresi)
function cutPoints(tp, zFilter = () => true, step = 0.2) {
  const out = [];
  walk(tp, (m, k, from) => {
    if (!from) return;
    if (m.t === 'feed' && m.kind !== 'plunge') { const n = Math.max(1, Math.ceil(Math.hypot(m.x - from.x, m.y - from.y) / step)); for (let i = 1; i <= n; i++) { const t = i / n; const p = [from.x + (m.x - from.x) * t, from.y + (m.y - from.y) * t, from.z + (m.z - from.z) * t]; if (zFilter(p[2])) out.push(p); } }
    if (m.t === 'arc') for (const p of sampleArc(from, m, 0.001)) if (zFilter(p[2])) out.push(p);
  });
  return out;
}
const rapidsOk = (tp, stockTop) => { let bad = 0; walk(tp, (m, k, from) => { if (m.t !== 'rapid' || !from) return; const horiz = Math.hypot(m.x - from.x, m.y - from.y) > 1e-9; if (horiz && (m.z < stockTop + 1e-9 || from.z < stockTop + 1e-9)) bad++; if (m.z < stockTop + 1e-9) bad++; }); return bad === 0; };
// cep kapsama: bolgede (D >= stR + e) olup kesme izine r'den uzak ornekler (mm2)
function uncutArea(Rg, tp, r, stR, zCut, h = 0.25) {
  const pts = cutPoints(tp, (z) => Math.abs(z - zCut) < 1e-6, 0.1).map((p) => [p[0], p[1]]);
  const segs = []; for (let i = 1; i < pts.length; i++) if (P.dist(pts[i - 1], pts[i]) < 0.5) segs.push(P.line(pts[i - 1], pts[i]));
  const grid = new SegGrid(segs, r); const walls = P.regionSegs(Rg); const bb = P.loopBBox([Rg.outer]); let un = 0;
  for (let x = bb[0] + h / 2; x < bb[2]; x += h) for (let y = bb[1] + h / 2; y < bb[3]; y += h) { const p = [x, y]; if (!P.inRegion(p, Rg)) continue; if (P.distTo(p, walls) < stR + 0.02) continue; if (grid.nearest(p, r + 0.05) > r + 0.02) un += h * h; }
  return un;
}

// ================================================================== 1. path2d temel
section('1. 2B geometri ve ofset');
{
  const L = P.line([0, 0], [10, 0]), A = P.arc([5, 0], 5, Math.PI, -Math.PI); // ust yarim (CW: pi -> 0)
  ok(Math.abs(P.length(A) - 5 * Math.PI) < 1e-12, 'yay boyu');
  const X = P.intersect(P.line([0, 2], [10, 2]), A); ok(X.length === 2 && X.every((h) => Math.abs(P.dist(h.p, [5, 0]) - 5) < 1e-9), 'cizgi-yay kesisimi 2 nokta');
  ok(P.intersect(L, P.line([5, -1], [5, 1])).length === 1, 'cizgi-cizgi');
  const sqL = kloop(sq(0, 0, 100, 60)); ok(Math.abs(P.area(sqL) - 6000) < 1e-9, 'kare alani');
  const hole = kloop(circ([50, 30], 10, false)); ok(Math.abs(P.area(hole) + Math.PI * 100) < 1e-9, 'CW daire alani negatif');
  const R = { outer: sqL, holes: [hole] };
  const o5 = P.offsetRegions([R], 5); ok(o5.length === 1 && Math.abs(P.area(o5[0].outer) - 4500) < 1e-6 && Math.abs(P.area(o5[0].holes[0]) + Math.PI * 225) < 1e-6, 'ice ofset 5: alanlar analitik');
  const o15 = P.offsetRegions([R], 15); ok(o15.length === 2, 'ada + duvar arasi daralinca iki bolge (dar bogaz): ' + o15.length);
  ok(P.offsetRegions([R], 22).length === 0, 'cok buyuk ofset bos');
  const oo = P.offsetRegions([{ outer: sqL, holes: [] }], -5); ok(Math.abs(P.area(oo[0].outer) - (110 * 70 - (4 - Math.PI) * 25)) < 1e-6, 'dis ofset: koseler yuvarlak');
  // ofset dogrulugu: her parca her noktada sinirdan tam d uzakta
  let maxErr = 0; for (const g of o5) for (const l of [g.outer, ...g.holes]) for (const s of l) for (let k = 0; k <= 20; k++) maxErr = Math.max(maxErr, Math.abs(P.distTo(P.pointAt(s, k / 20), P.regionSegs(R)) - 5));
  ok(maxErr < 1e-9, 'ofset noktalari sinirdan tam 5 mm: hata ' + maxErr);
  // ic bukey kose (L sekli) ve yay sinir
  const Ls = kloop(poly([[0, 0], [60, 0], [60, 20], [20, 20], [20, 50], [0, 50]]));
  const oL = P.offsetRegions([{ outer: Ls, holes: [] }], 4); let e2 = 0; for (const s of oL[0].outer) for (let k = 0; k <= 20; k++) e2 = Math.max(e2, Math.abs(P.distTo(P.pointAt(s, k / 20), Ls) - 4));
  ok(oL.length === 1 && e2 < 1e-9, 'L sekli ice ofset tam: ' + e2);
  const oLo = P.offsetRegions([{ outer: Ls, holes: [] }], -4); ok(oLo[0].outer.some((s) => s.k === 'A'), 'L sekli disa ofset yay koseler');
  const st = P.startAt(o5[0].outer, [50, 5]); ok(P.dist(st[0].a, [50, 5]) < 1e-9 && P.isClosedLoop(st), 'startAt');
}

// ================================================================== 2. makine ve takim
section('2. makine profili ve takim');
{
  const [nw, gen] = builtinMachines();
  const c1 = checkMachine(nw), c2 = checkMachine(gen);
  ok(!c1.errors.length && c1.missing.includes('spindle.maxRpm') && c1.missing.includes('feed.maxCut') && !c1.missing.includes('axes.X.travel'), 'Neway: kurslar dolu, maxRpm/maxCut null');
  ok(!c2.errors.length && c2.missing.includes('axes.X.travel'), 'Genel: tum sayilar null');
  ok(JSON.stringify(nw.protected.T) === '[1,3,12]' && nw.protected.wcs.includes('G54') && nw.protected.wcs.includes('G56') && !nw.protected.wcs.includes('G58'), 'Neway korunan liste on dolu');
  ok(nw.axes.A.dir[0] === -1 && nw.axes.A.limits === null && nw.axes.A.shortest === true && nw.post.props.safeRetract === null && nw.post.props.tapMode === 'pitch', 'Neway A ekseni ve post ozellikleri');
  ok(checkMachine({ ...nw, axes: { ...nw.axes, A: { ...nw.axes.A, dir: [0, 1, 0] } } }).errors.length > 0, 'A dir X e paralel degil: hata');
  const cp = copyMachine(nw, 'm2', 'Benim'); ok(cp.id === 'm2' && !cp.builtin && nw.builtin, 'kopya');
  const t = normalizeTool({ id: 'a', number: 2, lengthOffset: 2, type: 'ball', dia: 6, fluteLen: 10, bodyLen: 30, flutes: 2, centerCutting: true, presets: [{ name: 'Al', rpm: 9000, feedCut: 900, feedPlunge: 300, coolant: 'mist', stepdown: 1 }] });
  ok(t.cornerR === 3, 'ball cornerR = dia/2');
  throwsCode(() => normalizeTool({ ...t, type: 'tap' }), 'cam.tool.bad_field', 'kilavuzda pitch zorunlu');
  throwsCode(() => normalizeTool({ ...t, bodyLen: 5 }), 'cam.tool.bad_field', 'bodyLen < fluteLen');
  throwsCode(() => normalizeTool({ ...t, type: 'drill', tipAngle: 118, centerCutting: false }), 'cam.tool.bad_field', 'matkap merkezden keser');
  const lib = exportLibrary([t, flat(10)]); const im = importLibrary(lib); ok(im.tools.length === 2 && !im.errors.length && im.tools[0].presets[0].name === 'Al', 'kutuphane disa/ice aktar');
  const im2 = importLibrary(JSON.stringify({ format: 'mihenk-tool-library', version: 1, tools: [t, { id: 'x' }, t] })); ok(im2.tools.length === 1 && im2.errors.length === 2 && im2.errors[1].code === 'cam.tool.dup_id', 'kutuphane: hatali ogeler ayri raporlanir');
  throwsCode(() => importLibrary('{bozuk'), 'cam.tool.lib_bad', 'bozuk JSON');
  const op = applyPreset({ type: 'pocket', stepdown: 3 }, t, 'Al'); ok(op.rpm === 9000 && op.stepdown === 1 && op.coolant === 'mist', 'preset uygulama');
  throwsCode(() => applyPreset({}, t, 'yok'), 'cam.tool.no_preset', 'olmayan preset');
  ok(toolListIssues([flat(6), { ...flat(8), id: 'z' }]).some((x) => x.code === 'cam.tool.dup_number'), 'ayni T iki takim');
}

// ================================================================== 3. yuzey ve delme
section('3. yuzey frezeleme ve delme');
{
  const tool = flat(50);
  const tp = CAM.computeOp({ id: 'f', type: 'face', ...base, stepover: 35, stepdown: 1, heights: { clearance: 10, retract: 2, top: { from: 'abs', off: 0 }, bottom: { from: 'abs', off: -2.5 } } }, { setup: S0, tool });
  ok(validateToolpath(tp) && rapidsOk(tp, 0), 'yuzey: IR gecerli, hizlilar stok ustunde');
  ok(tp.meta.passDepth <= 1 + 1e-9 && Math.abs(tp.stats.zMin + 2.5) < 1e-9, 'yuzey: paso <= stepdown, son paso yuzeyde');
  const pts = cutPoints(tp, (z) => Math.abs(z + 2.5) < 1e-9, 1).map((p) => [p[0], p[1]]);
  let un = 0; for (let x = 0.5; x < 100; x += 1) for (let y = 0.5; y < 60; y += 1) if (!pts.some((p) => Math.hypot(p[0] - x, p[1] - y) <= 25 + 1e-6)) un++;
  ok(un === 0, 'yuzey: stok tamamen kapsandi (' + un + ' bos hucre)');
  // plunge noktalari stok disinda
  let inside = 0; walk(tp, (m, k, f) => { if (m.t === 'feed' && m.kind === 'plunge' && m.x > 0 && m.x < 100 && m.y > 0 && m.y < 60) inside++; }); ok(inside === 0, 'yuzey: dalma stok disinda');
  const tp45 = CAM.computeOp({ id: 'f2', type: 'face', ...base, stepover: 30, direction: 45, heights: { clearance: 10, retract: 2, top: { from: 'abs', off: 0 }, bottom: { from: 'abs', off: -1 } } }, { setup: S0, tool }); ok(validateToolpath(tp45), 'yuzey 45 derece');
  throwsCode(() => CAM.computeOp({ id: 'f', type: 'face', ...base, stepover: 60 }, { setup: S0, tool }), 'cam.op.stepover_too_big', 'stepover >= cap');
  throwsCode(() => CAM.computeOp({ id: 'f', type: 'face', ...base, rpm: undefined, stepover: 30 }, { setup: S0, tool }), 'cam.op.missing', 'rpm eksik');
  throwsCode(() => CAM.computeOp({ id: 'f', type: 'face', ...base, stepover: 30, heights: { clearance: 10, retract: 2, bottom: { from: 'abs', off: 1 } } }, { setup: S0, tool }), 'cam.face.nothing', 'alinacak malzeme yok');
  // delme
  const holes = [{ feature: 'h', dia: 6.8, depth: 15, through: false, tipAngle: 118, thread: null, dir: [0, 0, -1], positions: [[10, 10, 0], [90, 50, 0], [10, 50, 0], [50, 30, -10]], dirs: [[0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, -1]] }, { feature: 'side', dia: 5, depth: 5, through: false, tipAngle: 118, thread: null, positions: [[0, 30, -5]], dirs: [[1, 0, 0]] }];
  const drill = { id: 'd', number: 7, lengthOffset: 7, type: 'drill', dia: 6.8, tipAngle: 118, fluteLen: 40, bodyLen: 60, flutes: 2, centerCutting: true };
  const dop = { id: 'd', type: 'drill', ...base, holes: { kind: 'feature' }, cycle: 'peck', peck: 3, depth: { from: 'hole', tipComp: true }, order: 'shortest' };
  const dt = CAM.computeOp(dop, { setup: S0, tool: drill, geom: { holes } });
  const cyc = dt.moves.filter((m) => m.t === 'cycle'); const tipL = 3.4 / Math.tan((59 * Math.PI) / 180);
  ok(validateToolpath(dt), 'delme IR gecerli');
  ok(cyc.length === 2 && cyc[0].points.length === 3 && Math.abs(cyc[0].bottom - (-15 - tipL)) < 1e-9 && cyc[0].retract === 2, 'ust z ayni + R stok ustunde -> tek cevrim; uc telafisi');
  ok(Math.abs(cyc[1].top + 10) < 1e-9 && cyc[1].points.length === 1 && cyc[1].clearance >= 0, 'cep tabanindaki delik ayri cevrim (R stok altinda), baslangic stok ustunde');
  ok(dt.warnings.some((w) => w.code === 'cam.drill.skipped_axis' && w.params.n === 1), 'yana bakan delik atlandi (uyari)');
  const dt2 = CAM.computeOp(dop, { setup: S0, tool: { ...drill, dia: 6.5 }, geom: { holes } }); ok(dt2.warnings.some((w) => w.code === 'cam.drill.dia_mismatch'), 'cap uyusmazligi uyarisi');
  const tap = { id: 'k', number: 8, lengthOffset: 8, type: 'tap', dia: 8, pitch: 1.25, fluteLen: 20, bodyLen: 60, flutes: 3, centerCutting: false };
  const tt = CAM.computeOp({ ...dop, cycle: 'tap', rpm: 400, depth: { from: 'abs', z: -12 } }, { setup: S0, tool: tap, geom: { holes } });
  ok(tt.moves.filter((m) => m.t === 'cycle').every((m) => m.f === 400 * 1.25 && m.pitch === 1.25), 'kilavuz: F = devir x hatve');
  throwsCode(() => CAM.computeOp({ ...dop, cycle: 'tap' }, { setup: S0, tool: drill, geom: { holes } }), 'cam.drill.tool_cycle', 'kilavuz cevrimi matkapla olmaz');
  throwsCode(() => CAM.computeOp({ ...dop, cycle: 'peck', peck: undefined }, { setup: S0, tool: drill, geom: { holes } }), 'cam.op.missing', 'gagalama derinligi zorunlu');
  throwsCode(() => CAM.computeOp(dop, { setup: S0, tool: drill, geom: { holes: [holes[1]] } }), 'cam.drill.no_holes', 'eksen uyumsuz tek delik -> delik yok');
}

// ================================================================== 4. kontur
section('4. kontur');
{
  const tool = flat(10); const r = 5;
  const part = sq(20, 15, 80, 45);
  const g = { faces: [{ z: -10, outer: part, inners: [] }] };
  const cop = { id: 'c', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'outer' }], stepdown: 4, stockToLeave: { radial: 0.3, axial: 0 }, leadIn: { kind: 'arc', r: 3 }, leadOut: { kind: 'arc', r: 3 } };
  const tp = CAM.computeOp(cop, { setup: S0, tool, geom: g });
  ok(validateToolpath(tp) && rapidsOk(tp, 0), 'kontur IR gecerli, hizlilar stok ustunde');
  const base2 = kloop(part); const all = cutPoints(tp, (z) => z < 0, 0.1);
  let minD = Infinity, inside = 0; for (const p of all) { const d = P.distTo([p[0], p[1]], base2); minD = Math.min(minD, d); if (P.inRegion([p[0], p[1]], { outer: base2, holes: [] })) inside++; }
  ok(Math.abs(minD - (r + 0.3)) < 1e-6 && inside === 0, `disari: hicbir nokta parcaya r+pay'dan yakin degil (min ${minD})`);
  // ana dongu tam r+pay uzaklikta (girisler haric: lead hareketleri)
  const loopPts = []; walk(tp, (m, k, from) => { if (!from || m.kind !== 'cut' || m.z > -9.99) return; if (m.t === 'arc') loopPts.push(...sampleArc(from, m)); else loopPts.push([m.x, m.y, m.z]); });
  ok(loopPts.length > 0 && loopPts.every((p) => Math.abs(P.distTo([p[0], p[1]], base2) - 5.3) < 1e-6), 'son derinlik dongusu her noktada tam 5,3 mm');
  ok(tp.meta.passDepth <= 4 + 1e-9 && Math.abs(tp.stats.zMin + 10) < 1e-9, 'derinlik pasolari');
  // tirmanma: disari kontur CW (malzeme sagda)
  let sgn = 0; walk(tp, (m) => { if (m.t === 'arc' && m.kind === 'cut') sgn += m.dir === 'cw' ? 1 : -1; }); ok(sgn > 0, 'disari tirmanma: kose yaylari CW');
  // ic kontur (delik bosluk) + kalan malzeme uyarisi (keskin koseler)
  const pocketLoop = sq(30, 20, 70, 40);
  const ti = CAM.computeOp({ ...cop, geom: [{ kind: 'face', loops: 'inner' }], leadIn: { kind: 'line', len: 2 }, leadOut: { kind: 'line', len: 2 } }, { setup: S0, tool, geom: { faces: [{ z: -10, outer: sq(0, 0, 100, 60), inners: [pocketLoop.slice().reverse().map((s) => ({ ...s, fwd: false }))] }] } });
  const cav = kloop(pocketLoop); const ip = cutPoints(ti, (z) => z < 0, 0.1);
  ok(ip.every((p) => P.distTo([p[0], p[1]], cav) >= 5.3 - 1e-6 && P.inRegion([p[0], p[1]], { outer: cav, holes: [] })), 'iceri kontur: ihlal yok');
  ok(ti.warnings.some((w) => w.code === 'cam.contour.rest_corner' && w.params.n === 4), 'keskin ic koseler: kalan malzeme uyarisi');
  throwsCode(() => CAM.computeOp({ ...cop, geom: [{ kind: 'face', loops: 'inner' }] }, { setup: S0, tool: flat(30), geom: { faces: [{ z: -10, outer: sq(0, 0, 100, 60), inners: [sq(40, 25, 60, 35).reverse().map((s) => ({ ...s, fwd: false }))] }] } }), 'cam.contour.tool_too_big', 'takim bosluga sigmiyor');
  throwsCode(() => CAM.computeOp({ ...cop, geom: [{ kind: 'face', loops: 'inner' }], leadIn: { kind: 'arc', r: 30 } }, { setup: S0, tool, geom: { faces: [{ z: -10, outer: sq(0, 0, 100, 60), inners: [pocketLoop.slice().reverse().map((s) => ({ ...s, fwd: false }))] }] } }), 'cam.contour.lead_no_fit', 'giris yayi duvara carpar');
  // kopruler
  const tt = CAM.computeOp({ ...cop, tabs: { n: 4, width: 5, height: 2 } }, { setup: S0, tool, geom: g });
  let atTab = 0; walk(tt, (m) => { if ((m.t === 'feed' || m.t === 'arc') && Math.abs(m.z + 8) < 1e-9) atTab++; }); ok(validateToolpath(tt) && atTab > 0, 'kopru: son derinlikte kopru ustunde gecis');
  // wear telafisi: programlanan yol = parca + pay, G41/G42 ve zorunlu dogrusal giris
  const tw = CAM.computeOp({ ...cop, comp: 'wear', stockToLeave: { radial: 0, axial: 0 }, leadIn: { kind: 'line', len: 8 }, leadOut: { kind: 'line', len: 8 } }, { setup: S0, tool, geom: g });
  const wp = []; walk(tw, (m, k, from) => { if (from && m.kind === 'cut' && m.t === 'feed' && m.z < -9.99) wp.push([m.x, m.y]); });
  ok(validateToolpath(tw) && tw.comp === 'wear' && tw.compSide === 'left' && wp.every((p) => P.distTo(p, base2) < 1e-6), 'wear: yol parca konturunda, tirmanma G41');
  throwsCode(() => CAM.computeOp({ ...cop, comp: 'wear' }, { setup: S0, tool, geom: g }), 'cam.contour.wear_needs_line_lead', 'wear yay giris reddi');
  throwsCode(() => CAM.computeOp({ ...cop, comp: 'wear', leadIn: { kind: 'line', len: 3 }, leadOut: { kind: 'line', len: 3 } }, { setup: S0, tool, geom: g }), 'cam.contour.wear_lead_short', 'wear kisa giris');
  // kaba yanal pasolar ve rampa
  const tr = CAM.computeOp({ ...cop, roughPasses: { n: 2, stepover: 3 } }, { setup: S0, tool, geom: g }); ok(validateToolpath(tr) && tr.moves.length > tp.moves.length, 'kaba yanal pasolar');
  const trp = CAM.computeOp({ ...cop, leadIn: { kind: 'none' }, leadOut: { kind: 'none' }, ramp: { kind: 'ramp', angle: 3 } }, { setup: S0, tool, geom: g });
  ok(validateToolpath(trp) && trp.moves.some((m) => m.kind === 'ramp'), 'rampa ile derinlik');
  // acik zincir 'on'
  const ch = CAM.computeOp({ id: 'ch', type: 'contour', ...base, geom: [{ kind: 'chain' }], stepdown: 1, side: 'on', heights: { clearance: 10, retract: 2, bottom: { from: 'abs', off: -1 } } }, { setup: S0, tool: flat(3), geom: { items: [{ segs: [G.mkLine([10, 10], [50, 10]), G.mkArc([50, 20], 10, -Math.PI / 2, Math.PI)].map((s) => ({ ...s, fwd: true })), closed: false, z: null }] } });
  ok(validateToolpath(ch), 'acik zincir uzerinde');
  throwsCode(() => CAM.computeOp({ id: 'ch', type: 'contour', ...base, geom: [{ kind: 'chain' }], stepdown: 1, side: 'outside', heights: { clearance: 10, retract: 2, bottom: { from: 'abs', off: -1 } } }, { setup: S0, tool, geom: { items: [{ segs: [{ ...G.mkLine([0, 0], [10, 0]), fwd: true }], closed: false }] } }), 'cam.contour.open_needs_on', 'acik zincir disari olmaz');
}

// ================================================================== 5. cep
section('5. cep');
{
  const tool = flat(6); const r = 3;
  const face = { z: -10, normalOk: true, outer: sq(20, 15, 80, 45), inners: [circ([50, 30], 5, false)] };
  const pop = { id: 'p', type: 'pocket', ...base, geom: [{ kind: 'face' }], stepover: 2.5, stepdown: 4, stockToLeave: { radial: 0.2, axial: 0.1 }, entry: { kind: 'helix', angle: 3, helixDia: 3 } };
  const tp = CAM.computeOp(pop, { setup: S0, tool, geom: { faces: [face] } });
  ok(validateToolpath(tp) && rapidsOk(tp, 0), 'cep IR gecerli, hizlilar stok ustunde');
  const Rg = { outer: kloop(face.outer), holes: [kloop(face.inners[0])] }; const walls = P.regionSegs(Rg);
  const pts = cutPoints(tp, (z) => z < 0, 0.1);
  let minD = Infinity, out = 0; for (const p of pts) { const q = [p[0], p[1]]; minD = Math.min(minD, P.distTo(q, walls)); if (!P.inRegion(q, Rg)) out++; }
  ok(Math.abs(minD - 3.2) < 1e-6 && out === 0, `ofset dogrulugu: en yakin nokta duvar/adadan tam r+pay (${minD}), bolge disi ${out}`);
  ok(Math.abs(tp.stats.zMin + 9.9) < 1e-9 && tp.meta.passDepth <= 4 + 1e-9, 'eksenel pay ve paso derinligi');
  const un = uncutArea(Rg, tp, r, 0.2, -9.9);
  const corner = 4 * (1 - Math.PI / 4) * r * r; // dort keskin kosede dogal kalan
  ok(un <= corner + 2.0, `kapsama: islenmemis ${un.toFixed(2)} mm2 <= kose kalintisi ${corner.toFixed(2)} + ornekleme payi`);
  ok(tp.warnings.some((w) => w.code === 'cam.pocket.rest_material'), 'kalan malzeme uyarisi (keskin koseler)');
  // helis cevreleri ve giris tipleri
  ok(tp.moves.some((m) => m.t === 'arc' && m.kind === 'ramp'), 'helis giris');
  throwsCode(() => CAM.computeOp({ ...pop, entry: { kind: 'helix', angle: 3, helixDia: 4 } }, { setup: S0, tool: flat(10), geom: { faces: [{ z: -10, normalOk: true, outer: sq(0, 0, 12, 12), inners: [] }] } }), 'cam.pocket.helix_no_fit', 'helis sigmiyor: hata');
  const tr = CAM.computeOp({ ...pop, entry: { kind: 'ramp', angle: 2 } }, { setup: S0, tool, geom: { faces: [face] } }); ok(validateToolpath(tr) && tr.moves.some((m) => m.kind === 'ramp'), 'rampa girisi');
  throwsCode(() => CAM.computeOp({ ...pop, entry: { kind: 'plunge' } }, { setup: S0, tool: flat(6, { centerCutting: false }), geom: { faces: [face] } }), 'cam.entry.plunge_not_center_cutting', 'kesmeyen uc dalamaz');
  throwsCode(() => CAM.computeOp(pop, { setup: S0, tool: flat(40), geom: { faces: [face] } }), 'cam.pocket.tool_too_big', 'takim cebe sigmiyor');
  // dar bogaz: iki kare + dar kanal -> halka agaci ikiye ayrilir, kapsama tam
  const neck = { z: -5, normalOk: true, outer: poly([[0, 0], [30, 0], [30, 8], [40, 8], [40, 0], [70, 0], [70, 30], [40, 30], [40, 22], [30, 22], [30, 30], [0, 30]]), inners: [] };
  const tn = CAM.computeOp({ ...pop, stockToLeave: { radial: 0, axial: 0 }, stepdown: 5, entry: { kind: 'helix', angle: 3, helixDia: 3 } }, { setup: S0, tool: flat(10), geom: { faces: [neck] } });
  const Rn = { outer: kloop(neck.outer), holes: [] }; const tree = ringTree(Rn, 5, 2.5);
  ok(tree.some((lv) => lv.length >= 2), 'dar bogaz: bir seviyede bolge ikiye ayrildi');
  const pn = cutPoints(tn, (z) => z < 0, 0.1); ok(pn.every((p) => P.distTo([p[0], p[1]], kloop(neck.outer)) >= 5 - 1e-6), 'dar bogaz: ihlal yok');
  const unN = uncutArea(Rn, tn, 5, 0, -5); const cornerN = (4 + 4) * (1 - Math.PI / 4) * 25 * 0 + 8 * (1 - Math.PI / 4) * 25; // 8 keskin dis kose
  ok(unN <= cornerN + 3, `dar bogaz kapsama: ${unN.toFixed(2)} <= ${cornerN.toFixed(2)}`);
  // acik kenar: sag kenar acik -> takim kenarin r otesine tasar, kenara kadar kapsar
  const openF = { z: -10, normalOk: true, outer: sq(20, 15, 80, 45, [1]), inners: [], above: [] };
  const to = CAM.computeOp({ ...pop, stockToLeave: { radial: 0, axial: 0 } }, { setup: S0, tool, geom: { faces: [openF] } });
  const po = cutPoints(to, (z) => z < 0, 0.1); const maxX = Math.max(...po.map((p) => p[0]));
  ok(validateToolpath(to) && maxX >= 80 + r - 1e-6, `acik kenar: takim merkezi kenarin ${r} mm otesine (${maxX.toFixed(3)})`);
  const wallsO = kloop(openF.outer).filter((s) => !s.open);
  ok(po.every((p) => P.distTo([p[0], p[1]], wallsO) >= r - 1e-6), 'acik kenar: kapali duvarlarda ihlal yok');
  const unO = uncutArea({ outer: kloop(openF.outer), holes: [] }, to, r, 0, -10); ok(unO <= 2 * (1 - Math.PI / 4) * r * r + 2.0, `acik kenar kapsama ${unO.toFixed(2)} (yalniz iki kapali kose)`);
  const blockedF = { ...openF, above: [circ([84, 30], 1.5, true)] };
  throwsCode(() => CAM.computeOp(pop, { setup: S0, tool, geom: { faces: [blockedF] } }), 'cam.pocket.open_edge_blocked', 'acik kenar disinda malzeme: hata');
  throwsCode(() => CAM.computeOp(pop, { setup: S0, tool, geom: { faces: [{ ...openF, above: undefined }] } }), 'cam.pocket.open_needs_section', 'acik kenarda kesit yoksa hata');
  // tabanda asagi inen delik (tum kenarlari acik ic dongu) ada sayilmaz
  const reg = pocketRegion({ ...face, inners: [[{ ...face.inners[0][0], open: true }]] }, r, 0); ok(reg.region.holes.length === 0, 'tabandaki delik ada degil');
  // bitirme pasosu
  const tf = CAM.computeOp({ ...pop, finishPass: true, finishStock: 0.5 }, { setup: S0, tool, geom: { faces: [face] } });
  const pf = cutPoints(tf, (z) => z < 0, 0.1); const mf = Math.min(...pf.map((p) => P.distTo([p[0], p[1]], walls)));
  ok(validateToolpath(tf) && Math.abs(mf - 3.2) < 1e-6, 'bitirme pasosu duvarda r+pay');
  throwsCode(() => CAM.computeOp({ ...pop, finishPass: true }, { setup: S0, tool, geom: { faces: [face] } }), 'cam.op.missing', 'bitirme payi zorunlu');
}

// ================================================================== 6. kapilar
section('6. guvenlik kapilari');
{
  const nw = builtinMachines()[0];
  const M = { ...nw, id: 'm', spindle: { maxRpm: 12000, minRpm: 50 }, feed: { maxCut: 10000, rapid: 30000 }, toolChange: { ...nw.toolChange, maxTools: 24 }, axes: { ...nw.axes, A: { ...nw.axes.A, limits: [-360, 360] } } };
  const tool = flat(10, { number: 5, lengthOffset: 5, diaOffset: 5 });
  const fop = { id: 'f', type: 'face', ...base, stepover: 7, stepdown: 1, heights: { clearance: 10, retract: 2, top: { from: 'abs', off: 0 }, bottom: { from: 'abs', off: -1 } } };
  const prog = (tp, S = S0) => CAM.buildProgram({ name: 'O1', machine: M, sections: [{ setup: S, toolpaths: [tp] }] });
  const codes = (g, lv = 'block') => g.filter((x) => x.level === lv).map((x) => x.code + (x.params.kind ? ':' + x.params.kind : '') + (x.params.field ? ':' + x.params.field : ''));
  const tp = CAM.computeOp(fop, { setup: S0, tool, machine: M });
  const g0 = CAM.gates(prog(tp), M); ok(!blocked(g0) && codes(g0, 'warn').includes('cam.gate.travel_abs_unchecked') && codes(g0, 'warn').includes('cam.gate.sim_not_run'), 'temiz program: block yok; kurs ve sim uyarisi: ' + codes(g0));
  ok(validateProgram(prog(tp)), 'Program IR gecerli');
  const tpT = CAM.computeOp(fop, { setup: S0, tool: { ...tool, number: 3, lengthOffset: 12 }, machine: M }); const gT = codes(CAM.gates(prog(tpT), M));
  ok(gT.includes('cam.gate.protected:T') && gT.includes('cam.gate.protected:H'), 'dokunulmaz T3/H12: ' + gT);
  const gW = codes(CAM.gates(prog(tp, { ...S0, workOffset: { kind: 'G54' } }), M)); ok(gW.includes('cam.gate.protected:WCS'), 'dokunulmaz G54');
  const g4 = codes(CAM.gates(prog(tp, { ...S0, workOffset: { kind: 'G54.1', p: 3 } }), { ...M, protected: { ...M.protected, wcs: ['G54.1 P3'] } })); ok(g4.includes('cam.gate.protected:WCS'), 'dokunulmaz G54.1 P3');
  const twear = CAM.computeOp({ id: 'c', type: 'contour', ...base, geom: [{ kind: 'face' }], stepdown: 5, comp: 'wear', leadIn: { kind: 'line', len: 8 }, leadOut: { kind: 'line', len: 8 } }, { setup: S0, tool: { ...tool, diaOffset: 1 }, geom: { faces: [{ z: -5, outer: sq(20, 15, 80, 45), inners: [] }] } });
  ok(codes(CAM.gates(prog(twear), M)).includes('cam.gate.protected:D'), 'dokunulmaz D1 (wear)');
  const gm = codes(CAM.gates(prog(tp), builtinMachines()[0])); ok(gm.includes('cam.gate.missing:machine.spindle.maxRpm') && gm.includes('cam.gate.missing:machine.feed.maxCut'), 'eksik makine verisi block: ' + gm);
  const raw = (t) => ({ name: 'O1', units: 'mm', machine: null, sections: [{ setup: { id: 's1', name: 'S1', workOffset: { kind: 'G55' }, aAngle: null, stockBox: S0.stockBox }, toolpath: t }] });
  const gm2 = codes(CAM.gates(raw({ ...tp, tool: { ...tp.tool, H: null } }), M)); ok(gm2.includes('cam.gate.missing:tool.H'), 'eksik H block');
  const gm3 = codes(CAM.gates(raw({ ...twear, tool: { ...twear.tool, D: null } }), M)); ok(gm3.includes('cam.gate.missing:tool.D'), 'wear D eksik block');
  const gr = codes(CAM.gates(prog({ ...tp, rpm: 20000 }), M)); ok(gr.includes('cam.gate.rpm_high'), 'devir siniri');
  const gf = codes(CAM.gates(prog(tp), { ...M, feed: { maxCut: 500, rapid: null } })); ok(gf.includes('cam.gate.feed_high'), 'ilerleme siniri');
  const gx = codes(CAM.gates(prog(tp), { ...M, axes: { ...M.axes, X: { travel: 50 } } })); ok(gx.includes('cam.gate.travel') , 'kurs asimi (yol acikligi)');
  const gn = codes(CAM.gates(prog({ ...tp, tool: { ...tp.tool, number: 30 } }), M)); ok(gn.includes('cam.gate.tool_number_high'), 'magazin kapasitesi');
  // dalma: kesmeyen uc malzemeye duz dalarsa
  const nc = flat(10, { centerCutting: false });
  const tin = CAM.computeOp({ id: 'c2', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'inner' }], stepdown: 3 }, { setup: S0, tool: nc, geom: { faces: [{ z: -6, outer: sq(0, 0, 100, 60), inners: [sq(30, 20, 70, 40).reverse().map((s) => ({ ...s, fwd: false }))] }] } });
  ok(codes(CAM.gates(prog(tin), M)).includes('cam.gate.plunge_center'), 'kesmeyen uc malzemeye dalma block');
  const fopNC = CAM.computeOp(fop, { setup: S0, tool: nc, machine: M }); ok(!codes(CAM.gates(prog(fopNC), M)).includes('cam.gate.plunge_center'), 'stok disinda dalma serbest');
  const pkNC = CAM.computeOp({ id: 'p', type: 'pocket', ...base, geom: [{ kind: 'face' }], stepover: 4, stepdown: 2, entry: { kind: 'helix', angle: 3, helixDia: 6 } }, { setup: S0, tool: nc, geom: { faces: [{ z: -6, normalOk: true, outer: sq(20, 15, 80, 45), inners: [] }] } });
  ok(!codes(CAM.gates(prog(pkNC), M)).includes('cam.gate.plunge_center'), 'helisli cep (bosaltilmis inisler) dalma sayilmaz');
  const gfl = codes(CAM.gates(prog(CAM.computeOp({ ...fop, stepdown: undefined, heights: { ...fop.heights, bottom: { from: 'abs', off: -8 } } }, { setup: S0, tool: { ...tool, fluteLen: 5 } })), M)); ok(gfl.includes('cam.gate.flute_short'), 'kesici boyundan derin paso block');
  const Shi = setupOf([0, 0, -30], [100, 60, 40]); const gbl = codes(CAM.gates(prog(CAM.computeOp(fop, { setup: Shi, tool: { ...tool, fluteLen: 20, bodyLen: 20 } }), Shi), M)); ok(gbl.includes('cam.gate.body_short'), 'govde boyundan derin inis block');
  const ga = codes(CAM.gates(prog(tp, { ...S0, aAngle: 400 }), M)); ok(ga.includes('cam.gate.a_limit'), 'A siniri');
  const ga2 = codes(CAM.gates(prog(tp, { ...S0, aAngle: 90 }), { ...M, axes: { X: M.axes.X, Y: M.axes.Y, Z: M.axes.Z } })); ok(ga2.includes('cam.gate.no_rotary'), 'A ekseni yok');
  // kapi 5: B simulasyonu bagli
  const gs = CAM.gates(prog(tp), M, { sim: { res: 1 } }); ok(!blocked(gs) && !codes(gs, 'warn').includes('cam.gate.sim_not_run'), 'sim calisti, temiz yol: ' + codes(gs));
  const bad = { ...tp, moves: [...tp.moves.slice(0, -1), { t: 'rapid', x: 50, y: 30, z: tp.clearanceZ }, { t: 'rapid', x: 50, y: 30, z: -5 }, { t: 'rapid', x: 60, y: 30, z: -5 }, { t: 'rapid', x: 60, y: 30, z: tp.clearanceZ }] };
  const gsb = CAM.gates(prog(bad), M, { sim: { res: 1 } }); ok(codes(gsb).includes('cam.sim.rapid_in_stock'), 'sim: stok icinde hizli block');
}

// ================================================================== 7. setup cozumu, sema, i18n
section('7. setup, sema, metinler');
{
  const verts = new Float32Array([0, -10, -10, 100, 10, 10, 0, 10, -10, 100, -10, 10]);
  const rb = { bodies: [{ id: 'b', vertices: verts }], holes: [] };
  const M = builtinMachines()[0];
  const st = { id: 's', name: 'S', bodies: ['b'], frame: { origin: { kind: 'stockCorner', corner: 'x-y-z+' } }, workOffset: { kind: 'G55' }, stock: { kind: 'boxOffset', side: 2, top: 1, bottom: 0 }, clearanceZ: 5 };
  const S = CAM.resolveSetup(st, rb, M);
  ok(S.stockBox.max[2] === 0 && S.stockBox.min[0] === 0 && Math.abs(S.stockBox.max[0] - 104) < 1e-9 && S.frame.o[2] === 11, 'kutu stok + kose orijini');
  const Sr = CAM.resolveSetup({ ...st, frame: { origin: { kind: 'point', p: [0, 0, 0] } }, stock: { kind: 'cyl', dia: 40, len: 110, axis: 'X' }, rotary: { enabled: true, aAngle: 90 } }, rb, M);
  const q = (p) => [0, 1, 2].map((k) => (p[0] - Sr.frame.o[0]) * [Sr.frame.x, Sr.frame.y, Sr.frame.z][k][0] + (p[1] - Sr.frame.o[1]) * [Sr.frame.x, Sr.frame.y, Sr.frame.z][k][1] + (p[2] - Sr.frame.o[2]) * [Sr.frame.x, Sr.frame.y, Sr.frame.z][k][2]);
  const qp = q([0, 5, 0]); // A=90, dir -X: phi = -90 -> +Y noktasi -Z'ye
  ok(Sr.aAngle === 90 && Math.abs(qp[2] + 5) < 1e-9 && Math.abs(qp[1]) < 1e-9 && Sr.stockBox.max[2] === 20, '3+1: A=90 etkin cerceve (A.dir isareti) ve silindir stok');
  throwsCode(() => CAM.resolveSetup({ ...st, rotary: { enabled: true, aAngle: 90 } }, rb, builtinMachines()[1]), 'cam.setup.no_rotary', 'A ekseni olmayan makinede 3+1');
  throwsCode(() => CAM.resolveSetup({ ...st, stock: { kind: 'cyl', dia: 10, len: 110 }, frame: { origin: { kind: 'model' } } }, rb, M), 'cam.setup.stock_small', 'silindir stok kucuk');
  throwsCode(() => CAM.resolveSetup({ ...st, frame: { zAxis: { kind: 'face', ref: {} } } }, rb, M), 'cam.setup.face_axis_unresolved', 'yuz ekseni cozulmeden');
  // sema
  const old = { params: [], features: [] }; ok(validateDoc(old), 'eski belge (cam yok) acilir');
  const cam = { machineId: M.id, tools: [flat(6)], setups: [{ ...st, ops: [{ id: 'o1', type: 'pocket', toolId: 't6', rpm: 1000, feedCut: 100, feedPlunge: 50, coolant: 'flood', heights: { clearance: 10, retract: 2, top: { from: 'stockTop', off: 0 }, bottom: { from: 'selection', off: 0 } }, geom: [{ kind: 'face', ref: { body: 'b' } }], stepover: 2, stepdown: 2, entry: { kind: 'helix', angle: 3, helixDia: 3 } }] }], verified: null };
  ok(validateDoc({ ...old, cam }), 'cam iceren belge gecerli');
  throwsCode(() => validateDoc({ ...old, cam: { ...cam, tools: [{ ...flat(6), type: 'laser' }] } }), 'schema.bad_field', 'bilinmeyen takim turu');
  throwsCode(() => validateDoc({ ...old, cam: { ...cam, tools: [flat(6), flat(6)] } }), 'schema.dup_id', 'ayni takim kimligi');
  throwsCode(() => validateDoc({ ...old, cam: { ...cam, setups: [{ ...cam.setups[0], workOffset: { kind: 'G60' } }] } }), 'schema.bad_field', 'gecersiz is sifiri');
  // metinler: kaynakta gecen her cam kodu cam-core sozlugunde (tr/en), yer tutucular esit
  const { default: tr } = await import('../src/i18n/cam-core-tr.js'); const { default: en } = await import('../src/i18n/cam-core-en.js');
  ok(JSON.stringify(Object.keys(tr).sort()) === JSON.stringify(Object.keys(en).sort()), 'cam-core tr/en anahtarlari ayni');
  const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  ok(Object.keys(tr).every((k) => ph(tr[k]) === ph(en[k])), 'yer tutucular esit');
  ok(!Object.values(en).some((v) => /[ğüşıöçĞÜŞİÖÇ]/.test(v)), 'ingilizcede turkce karakter yok');
  const files = ['src/cam/index.js', 'src/cam/gates.js', 'src/cam/program.js', 'src/cam/tools.js', 'src/cam/machines/builtin.js', 'src/kernel/cam.js', ...fs.readdirSync(path.join(ROOT, 'src/cam/ops')).map((f) => 'src/cam/ops/' + f), ...fs.readdirSync(path.join(ROOT, 'src/cam/geom')).map((f) => 'src/cam/geom/' + f)];
  const used = new Set(); for (const f of files) { const s = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, ''); for (const m of s.matchAll(/'(cam\.[a-z0-9_]+(?:\.[a-z0-9_]+)*)'/g)) used.add(m[1]); }
  const miss = [...used].filter((c) => !(('err.' + c) in tr) && !(c in tr));
  ok(!miss.length, 'kaynaktaki kodlar sozlukte: eksik ' + miss.join(', '));
  ok(!files.some((f) => /[ğüşıöçĞÜŞİÖÇ]/.test(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))), 'cekirdek kaynaginda Turkce sabit metin yok');
}

// ================================================================== 8. cekirdekli uctan uca
section('8. cekirdek + uctan uca (blok: cep + ada + delik)');
{
  const wasm = path.join(ROOT, 'node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
  const K = await initKernel(opencascade, () => wasm);
  const rect = (w, h, pre, ox = 0, oy = 0) => ({ pts: { [pre + 1]: { x: ox, y: oy }, [pre + 2]: { x: ox + w, y: oy }, [pre + 3]: { x: ox + w, y: oy + h }, [pre + 4]: { x: ox, y: oy + h } }, ents: [1, 2, 3, 4].map((i) => ({ id: pre + 'l' + i, type: 'line', a: pre + i, b: pre + ((i % 4) + 1) })) });
  const r2 = rect(60, 30, 'q', 20, 15);
  const sk2 = { points: { ...r2.pts, ic: { x: 50, y: 30 } }, ents: [...r2.ents, { id: 'isl', type: 'circle', c: 'ic', r: 5 }] };
  const ring = findRegions(sk2).regions.findIndex((x) => x.holes.length);
  const r3 = rect(15, 60, 'w', 85, 0); // sag kenarda boydan boya basamak: uc kenari acik, bir duvar
  const doc = { params: [], features: [
    { id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '100', d: '60', h: '30', op: 'new' },
    { id: 's2', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '30' }, ...sk2 },
    { id: 'p', type: 'extrude', sketch: 's2', profiles: [ring], dist: '10', flip: true, op: 'cut' },
    { id: 's4', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '30' }, points: r3.pts, ents: r3.ents },
    { id: 'st', type: 'extrude', sketch: 's4', profiles: 'all', dist: '5', flip: true, op: 'cut' },
    { id: 's3', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '30' }, points: { h1: { x: 10, y: 10 }, h2: { x: 10, y: 50 }, h3: { x: 50, y: 5 } }, ents: [{ id: 'hp1', type: 'point', p: 'h1' }, { id: 'hp2', type: 'point', p: 'h2' }, { id: 'hp3', type: 'point', p: 'h3' }] },
    { id: 'h', type: 'hole', sketch: 's3', kind: 'simple', dia: '6.8', extent: 'dist', depth: '15', tipAngle: '118' },
  ] };
  const rb = await K.rebuild(doc);
  ok(Object.values(rb.status).every((s) => s.ok), 'model kuruldu: ' + JSON.stringify(Object.fromEntries(Object.entries(rb.status).filter(([, s]) => !s.ok).map(([k, s]) => [k, s.error]))));
  const bid = rb.bodies[0].id; const faceAt = (z, minA = 0, nz = 1) => { for (let i = 0; i < rb.bodies[0].nFaces; i++) { const d = K.describe({ body: bid, idx: i }, 'face'); if (d.geom === 'PLANE' && d.normal[2] * nz > 0.99 && Math.abs(d.fp[2] - z) < 1e-6 && d.area > minA) return d; } return null; };
  const M = { ...builtinMachines()[1], id: 'gen', axes: { X: { travel: 800 }, Y: { travel: 500 }, Z: { travel: 500 } }, spindle: { maxRpm: 12000, minRpm: 100 }, feed: { maxCut: 8000, rapid: 24000 }, toolChange: { maxTools: 20, kind: 'fixed' } };
  const tools = [flat(6, { id: 'em6', number: 2, lengthOffset: 2, diaOffset: 2 }), flat(10, { id: 'em10', number: 4, lengthOffset: 4, diaOffset: 4, fluteLen: 35, bodyLen: 50 }), { id: 'dr', number: 6, lengthOffset: 6, type: 'drill', dia: 6.8, tipAngle: 118, fluteLen: 40, bodyLen: 60, flutes: 2, centerCutting: true }];
  const floor = faceAt(20), step = faceAt(25), top = faceAt(30, 2000), bottom = faceAt(0, 2000, -1);
  ok(floor && step && top, 'taban, basamak ve ust yuz bulundu');
  const hh = { clearance: 15, retract: 3 };
  const cam = { machineId: M.id, tools, setups: [{ id: 'S1', name: 'Ust', bodies: [bid], frame: { origin: { kind: 'stockCorner', corner: 'x-y-z+' }, zAxis: { kind: 'base', dir: '+Z' }, xAxis: { kind: 'base', dir: '+X' } }, workOffset: { kind: 'G55' }, stock: { kind: 'boxOffset', side: 2, top: 1, bottom: 0 }, clearanceZ: 10, ops: [
    { id: 'o1', type: 'face', name: 'Yuzey', toolId: 'em10', ...base, heights: { ...hh, top: { from: 'stockTop', off: 0 }, bottom: { from: 'modelTop', off: 0 } }, stepover: 7, stepdown: 1, extend: 1 },
    { id: 'o2', type: 'pocket', name: 'Cep', toolId: 'em6', ...base, heights: { ...hh, top: { from: 'modelTop', off: 0 }, bottom: { from: 'selection', off: 0 } }, geom: [{ kind: 'face', ref: floor }], stepover: 2.5, stepdown: 3, stockToLeave: { radial: 0, axial: 0 }, entry: { kind: 'helix', angle: 3, helixDia: 3 } },
    { id: 'o3', type: 'pocket', name: 'Basamak', toolId: 'em6', ...base, heights: { ...hh, top: { from: 'modelTop', off: 0 }, bottom: { from: 'selection', off: 0 } }, geom: [{ kind: 'face', ref: step }], stepover: 2.5, stepdown: 5, entry: { kind: 'ramp', angle: 3 } },
    { id: 'o4', type: 'contour', name: 'Dis', toolId: 'em10', ...base, heights: { ...hh, top: { from: 'modelTop', off: 0 }, bottom: { from: 'abs', off: -31 } }, geom: [{ kind: 'face', ref: bottom, loops: 'outer' }], stepdown: 4, leadIn: { kind: 'arc', r: 4 }, leadOut: { kind: 'arc', r: 4 } },
    { id: 'o5', type: 'drill', name: 'Delik', toolId: 'dr', ...base, heights: hh, holes: { kind: 'feature' }, cycle: 'peck', peck: 3, depth: { from: 'hole', tipComp: false }, order: 'shortest' },
  ] }] };
  ok(validateDoc({ ...doc, cam }), 'uctan uca belge semadan gecer');
  const query = async (cmd, args) => (cmd === 'camFaceLoops' ? K.camFaceLoops(args) : cmd === 'facePlane' ? K.facePlane(args.ref) : null);
  const S = CAM.resolveSetup(cam.setups[0], rb, M);
  const fl = K.camFaceLoops({ ref: floor, frame: S.frame }); const sl = K.camFaceLoops({ ref: step, frame: S.frame });
  ok(Math.abs(fl.z + 11) < 1e-9 && fl.inners.length === 1 && !fl.open && fl.outer.length === 4, 'camFaceLoops taban: z, ada, kapali duvarlar');
  ok(sl.open && sl.outer.filter((s) => s.open).length === 3 && Array.isArray(sl.above) && sl.above.length >= 1, 'camFaceLoops basamak: uc acik kenar + taban ustu kesit');
  throwsCode(() => K.camFaceLoops({ ref: top, frame: { ...S.frame, z: [1, 0, 0], x: [0, 0, -1] } }), 'cam.face_not_flat', 'takim eksenine dik olmayan yuz');
  const sec = K.camSection({ body: bid, frame: S.frame, z: -5 }); ok(sec.loops.length >= 5, 'kesit donguleri: ' + sec.loops.length);
  const hm = K.camHeightmap({ bodies: [bid], frame: S.frame, res: 0.5, bbox: [S.stockBox.min[0], S.stockBox.min[1], S.stockBox.max[0], S.stockBox.max[1]] });
  const at = (x, y) => hm.data[Math.floor((y - hm.y0) / hm.res) * hm.nx + Math.floor((x - hm.x0) / hm.res)];
  ok(Math.abs(at(32, 22) + 11) < 1e-3 && Math.abs(at(52, 32) + 1) < 1e-3 && at(0.5, 0.5) === -Infinity, 'yukseklik haritasi: taban/ada/bos');
  const res = await CAM.generateProgram(cam, { rebuild: rb, machine: M, query, name: 'O1000', sim: { res: 0.5, modelHeightmaps: { S1: hm } } });
  ok(res.ops.every((o) => o.ok), 'tum islemler hesaplandi: ' + JSON.stringify(res.ops.filter((o) => !o.ok).map((o) => [o.opId, o.error])));
  const blocks = res.gates.filter((g) => g.level === 'block'); ok(res.program && !blocks.length, 'kapilar temiz (sim + oyma dahil): ' + JSON.stringify(blocks.slice(0, 5)));
  ok(res.program && res.program.sections.every((s) => rapidsOk(s.toolpath, S.stockTop)), 'hicbir hizli stok icinde yatay gitmiyor');
  const pk = res.ops.find((o) => o.opId === 'o2')?.toolpath;
  if (pk) {
    const Rg = { outer: kloop(fl.outer), holes: fl.inners.map(kloop) }; const pts = cutPoints(pk, (z) => z < S.stockTop - 1, 0.1);
    ok(pts.every((p) => P.distTo([p[0], p[1]], P.regionSegs(Rg)) >= 3 - 1e-6), 'cekirdek cebi: duvar/adaya ihlal yok');
  }
  const stp = res.ops.find((o) => o.opId === 'o3')?.toolpath; if (stp) ok(Math.max(...cutPoints(stp, (z) => z < S.stockTop - 1).map((p) => p[0])) >= 102 + 3 - 1e-6, 'acik basamak: takim acik kenarin otesine tasar');
  // B postu ile NC (makine profilindeki null post ozellikleri olmadan)
  try { const { postProgram } = await import('../src/cam/post/index.js'); const nc = postProgram(res.program, M, { gates: res.gates, date: '2026-11-11' }); ok(typeof nc.text === 'string' && /UNVERIFIED/.test(nc.text) && nc.text.includes('G83'), 'B postu ile NC uretildi'); }
  catch (e) { ok(false, 'post: ' + (e.code || e.message)); }
  // eksik veri: genel makine sablonu -> block
  const r2b = await CAM.generateProgram(cam, { rebuild: rb, machine: builtinMachines()[1], query, name: 'O1' }); ok(r2b.blocked && r2b.gates.some((g) => g.code === 'cam.gate.missing'), 'sablon makine: eksik veri block');
}

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
