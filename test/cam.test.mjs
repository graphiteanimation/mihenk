// CAM cekirdegi testleri (Ajan A): saf geometri (cekirdeksiz) + cekirdekli uctan uca.
// Calistir: node test/cam.test.mjs
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import * as CAM from '../src/cam/index.js';
import * as P from '../src/cam/geom/path2d.js';
import * as G from '../src/shared/geom2d.js';
import { ringTree, pocketRegion, SegGrid } from '../src/cam/ops/pocket.js';
import { loopFromKernel } from '../src/cam/ops/common.js';
import { sketchFaces } from '../src/cam/geom/select.js';
import { NEWAY_FIXTURE } from './fixtures/machine-neway.mjs';
import { exportMachines, importMachines, MACHINE_FORMAT } from '../src/cam/machines/io.js';
import { builtinMachines, checkMachine, copyMachine } from '../src/cam/machines/builtin.js';
import { normalizeTool, importLibrary, exportLibrary, applyPreset, toolListIssues } from '../src/cam/tools.js';
import { validateToolpath, validateProgram, walk, sampleArc } from '../src/cam/ir.js';
import { blocked } from '../src/cam/gates.js';
import { heightmapFromFn } from '../src/cam/sim/index.js';
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
  const nw = structuredClone(NEWAY_FIXTURE), [gen, gen4a, genMit] = builtinMachines();
  const c1 = checkMachine(nw), c2 = checkMachine(gen);
  ok(!c1.errors.length && c1.missing.includes('spindle.maxRpm') && c1.missing.includes('feed.maxCut') && !c1.missing.includes('axes.X.travel'), 'Neway: kurslar dolu, maxRpm/maxCut null');
  ok(!c2.errors.length && c2.missing.includes('axes.X.travel'), 'Genel: tum sayilar null');
  ok(JSON.stringify(nw.protected.T) === '[1,3,12]' && nw.protected.wcs.includes('G54') && nw.protected.wcs.includes('G56') && !nw.protected.wcs.includes('G58'), 'Neway korunan liste on dolu');
  ok(nw.axes.A.dir[0] === -1 && nw.axes.A.limits === null && nw.axes.A.shortest === true && nw.post.props.safeRetract === null && nw.post.props.tapMode === 'pitch', 'Neway A ekseni ve post ozellikleri');
  ok(checkMachine({ ...nw, axes: { ...nw.axes, A: { ...nw.axes.A, dir: [0, 1, 0] } } }).errors.length > 0, 'A dir X e paralel degil: hata');
  const cp = copyMachine(nw, 'm2', 'Benim'); ok(cp.id === 'm2' && !cp.builtin && builtinMachines()[0].builtin && cp.name === 'Benim', 'kopya');
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
  // T-23: R stok kutusu altinda; islem basi stok + model haritasiyla G99 gecisi dogrulanirsa tek cevrim, engel varsa bolunur
  {
    const hp = [{ feature: 'p', dia: 6.8, depth: 5, through: false, tipAngle: 118, thread: null, dir: [0, 0, -1], positions: [[20, 30, -10], [35, 30, -10], [80, 30, -10]], dirs: [[0, 0, -1], [0, 0, -1], [0, 0, -1]] }];
    const op23 = { ...dop, depth: { from: 'hole', tipComp: false }, order: 'asis' };
    const flatMap = (rib) => heightmapFromFn([0, 0], [100, 60], 0.5, (x) => (rib && x > 45 && x < 55 ? 0 : -10));
    const cyc = (ctx) => CAM.computeOp(op23, { setup: S0, tool: drill, geom: { holes: hp }, ...ctx }).moves.filter((m) => m.t === 'cycle');
    const n0 = cyc({}), n1 = cyc({ stockMap: flatMap(false), modelMap: flatMap(false) }), n2 = cyc({ stockMap: flatMap(true), modelMap: flatMap(false) }), n3 = cyc({ stockMap: flatMap(false) });
    const n4 = cyc({ stockMap: flatMap(false), modelMap: flatMap(true) });
    ok(n0.length === 3, 'T-23: harita yok + R stok altinda -> her nokta ayri cevrim (eski muhafazakar): ' + n0.length);
    ok(n1.length === 1 && n1[0].points.length === 3 && n1[0].retract < n1[0].clearance, 'T-23: islenmis yuzey (stok + model R altinda) -> tek G99 cevrimi: ' + n1.length);
    ok(n2.length === 2 && n2[0].points.length === 2 && n2[1].points.length === 1, 'T-23: stokta kaburga gecisi keser -> bolunur (2+1): ' + n2.map((c) => c.points.length));
    ok(n3.length === 3, 'T-23: model haritasi yok -> gecis guvenli sayilmaz');
    ok(n4.length === 2, 'T-23: model haritasinda kaburga (ince duvar guvencesi) -> bolunur');
    const { simulate } = await import('../src/cam/sim/index.js');
    const tp1 = CAM.computeOp(op23, { setup: S0, tool: drill, geom: { holes: hp }, stockMap: flatMap(false), modelMap: flatMap(false) });
    const sr = simulate(tp1, { res: 0.5, stockBox: S0.stockBox, stockHeightmap: flatMap(false) });
    ok(!sr.issues.some((i) => i.code === 'cam.sim.rapid_in_stock'), 'T-23: tek cevrim G99 gecisleri sim\'de stok icinden gecmiyor');
    const tp2 = CAM.computeOp(op23, { setup: S0, tool: drill, geom: { holes: hp }, stockMap: flatMap(true), modelMap: flatMap(true) });
    const sr2 = simulate(tp2, { res: 0.5, stockBox: S0.stockBox, stockHeightmap: flatMap(true) });
    ok(!sr2.issues.some((i) => i.code === 'cam.sim.rapid_in_stock'), 'T-23: kaburgali stokta bolunmus cevrim sim\'de temiz');
    const tpBad = { ...tp2, moves: tp2.moves.map((m) => (m.t === 'cycle' && m.points.length === 2 ? { ...m, points: [...m.points, [80, 30]] } : m)).filter((m) => !(m.t === 'cycle' && m.points.length === 1)) };
    const sr3 = simulate(tpBad, { res: 0.5, stockBox: S0.stockBox, stockHeightmap: flatMap(true) });
    ok(sr3.issues.some((i) => i.code === 'cam.sim.rapid_in_stock'), 'T-23 kontrol: kaburgayi R\'de gecen birlesik cevrim sim\'de rapid_in_stock (gecis denetimi gercek)');
  }
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

// ================================================================== 2b. yerlesik sablonlar ve tezgah dosyasi (K-026)
section('2b. yerlesik genel sablonlar ve tezgah ice/disa aktarma');
{
  const B = builtinMachines();
  ok(B.map((m) => m.id).join() === 'builtin-generic-3axis-fanuc,builtin-generic-4axis-a-fanuc,builtin-generic-3axis-mitsubishi', 'yerlesikler yalniz uc genel sablon');
  ok(!JSON.stringify(B).match(/neway|vm1160|gsa/i), 'yerlesiklerde tezgah markasi yok');
  ok(B.every((m) => m.builtin && m.nameKey), 'yerlesik: builtin bayragi ve ad anahtari');
  const g4 = B[1], gm = B[2], c4 = checkMachine(g4), cm = checkMachine(gm);
  ok(!c4.errors.length && c4.missing.includes('axes.X.travel') && c4.missing.includes('spindle.maxRpm'), '3+1 sablon: hatasiz, eksikler missing');
  ok(g4.axes.A.about === 'X' && JSON.stringify(g4.axes.A.dir) === '[1,0,0]' && g4.axes.A.shortest === true && g4.axes.A.rapid === null && g4.axes.A.clamp.output === false && g4.axes.A.clamp.lock === null, '3+1 sablon: A ekseni bos');
  ok(!cm.errors.length && gm.control === 'mitsubishi-m80v' && gm.protected.T.length === 0 && gm.protected.wcs.length === 0 && gm.spindle.maxRpm === null, 'Mitsubishi sablon: bos degerler, korunan liste bos');
  ok(!checkMachine(NEWAY_FIXTURE).errors.length && NEWAY_FIXTURE.id === 'user-neway-vm1160h-m80v-gsa' && !NEWAY_FIXTURE.builtin && !NEWAY_FIXTURE.nameKey, 'fixture gecerli kullanici profili');
  // disa/ice aktar gidis-donus
  const txt = exportMachines([NEWAY_FIXTURE, B[1]]); const j = JSON.parse(txt);
  ok(j.format === MACHINE_FORMAT && j.version === 1 && j.machines.length === 2 && !('builtin' in j.machines[1]) && !('nameKey' in j.machines[1]), 'disa aktar: bicim, builtin/nameKey atilir');
  const im = importMachines(txt, []); ok(im.machines.length === 2 && !im.errors.length && JSON.stringify(im.machines[0]) === JSON.stringify(NEWAY_FIXTURE), 'gecerli dosya: gidis-donus ayni');
  // ornek dosya
  const ex = importMachines(fs.readFileSync(path.join(ROOT, 'ornekler/tezgahlar/Neway-VM1160H-M80V-GSA.mhnk-tezgah.json'), 'utf8'), []);
  ok(ex.machines.length === 1 && !ex.errors.length && JSON.stringify(ex.machines[0]) === JSON.stringify(NEWAY_FIXTURE), 'ornek dosya fixture ile ayni');
  // bozuk JSON, yanlis bicim, surum, sinirlar
  throwsCode(() => importMachines('{bozuk'), 'cam.machine.file_bad', 'bozuk JSON');
  throwsCode(() => importMachines(JSON.stringify({ format: 'baska', version: 1, machines: [] })), 'cam.machine.file_bad', 'yanlis format');
  throwsCode(() => importMachines(JSON.stringify({ format: MACHINE_FORMAT, version: 1, machines: {} })), 'cam.machine.file_bad', 'machines dizi degil');
  throwsCode(() => importMachines(JSON.stringify({ format: MACHINE_FORMAT, version: 2, machines: [] })), 'cam.machine.file_newer', 'daha yeni surum');
  throwsCode(() => importMachines('x'.repeat(6 * 1024 * 1024)), 'cam.machine.file_too_big', 'cok buyuk dosya');
  throwsCode(() => importMachines(JSON.stringify({ format: MACHINE_FORMAT, version: 1, machines: new Array(201).fill(0) })), 'cam.machine.file_too_many', 'cok profil');
  // yapi hatali profil reddedilir, digerleri alinir
  const badM = { ...structuredClone(NEWAY_FIXTURE), id: 'bad', axes: { ...structuredClone(NEWAY_FIXTURE.axes), A: { ...structuredClone(NEWAY_FIXTURE.axes.A), dir: [0, 1, 0] } } };
  const r1 = importMachines(JSON.stringify({ format: MACHINE_FORMAT, version: 1, machines: [badM, 5, NEWAY_FIXTURE] }), []);
  ok(r1.machines.length === 1 && r1.errors.length === 2 && r1.errors[0].index === 0 && r1.errors[0].code === 'cam.machine.bad_field' && r1.errors[1].index === 1, 'yapi hatali profil reddedilir, gecerli alinir');
  // builtin bayragi ve nameKey atilir
  const r2 = importMachines(JSON.stringify({ format: MACHINE_FORMAT, version: 1, machines: [{ ...structuredClone(NEWAY_FIXTURE), id: 'x1', builtin: true, nameKey: 'cam.machine.generic3' }] }), []);
  ok(r2.machines.length === 1 && !('builtin' in r2.machines[0]) && !('nameKey' in r2.machines[0]), 'builtin ve nameKey atilir');
  // kimlik cakismasi
  const r3 = importMachines(txt, [NEWAY_FIXTURE.id, 'builtin-generic-3axis-fanuc'], () => 'yeni-1');
  ok(r3.machines[0].id === 'yeni-1' && r3.machines[0].name === NEWAY_FIXTURE.name + ' (2)' && r3.machines[1].id === B[1].id && r3.machines[1].name === B[1].name, 'kimlik cakismasinda yeni kimlik ve " (2)"');
  const r4 = importMachines(JSON.stringify({ format: MACHINE_FORMAT, version: 1, machines: [NEWAY_FIXTURE, NEWAY_FIXTURE] }), []);
  ok(r4.machines.length === 2 && r4.machines[0].id !== r4.machines[1].id, 'dosya icinde cift kimlik de ayrilir');
  // prototip kirlenmesi
  const pol = '{"format":"mihenk-machine","version":1,"machines":[' + JSON.stringify(NEWAY_FIXTURE).replace('{', '{"__proto__":{"polluted":1},') + ']}';
  const r5 = importMachines(pol, []); ok(r5.machines.length === 0 && r5.errors[0].code === 'cam.machine.file_bad_field' && ({}).polluted === undefined, '__proto__ anahtari reddedilir');
  for (const key of ['constructor', 'prototype']) {
    const o = structuredClone(NEWAY_FIXTURE); o.post.props[key] = { x: 1 };
    const r = importMachines(JSON.stringify({ format: MACHINE_FORMAT, version: 1, machines: [o] }), []); ok(r.machines.length === 0 && r.errors[0].code === 'cam.machine.file_bad_field', key + ' anahtari reddedilir');
  }
  // derinlik
  let deep = {}; let cur = deep; for (let i = 0; i < 30; i++) { cur.a = {}; cur = cur.a; }
  const o6 = structuredClone(NEWAY_FIXTURE); o6.post.props.deep = deep;
  const r6 = importMachines(JSON.stringify({ format: MACHINE_FORMAT, version: 1, machines: [o6] }), []); ok(r6.machines.length === 0 && r6.errors[0].code === 'cam.machine.file_too_deep', 'derinlik siniri');
  throwsCode(() => exportMachines([{ id: 1 }]), 'cam.machine.bad_field', 'gecersiz profil disa aktarilamaz');
}

// ================================================================== 6. kapilar
{ // T-21b: A.wrap dogrulamasi
  const g4 = builtinMachines().find((q) => q.axes.A);
  const withWrap = (w) => ({ ...g4, axes: { ...g4.axes, A: { ...g4.axes.A, wrap: w } } });
  ok(!checkMachine(withWrap(null)).errors.length && ['shortest', 'signed', '0-360'].every((w) => !checkMachine(withWrap(w)).errors.length), 'A.wrap gecerli degerler (null, shortest, signed, 0-360)');
  const bw = checkMachine(withWrap('ters')).errors; ok(bw.length === 1 && JSON.stringify(bw[0]).includes('axes.A.wrap'), 'A.wrap gecersiz deger hata: ' + JSON.stringify(bw));
  ok(checkMachine(withWrap('none')).errors.length === 1, "A.wrap 'none' profil degeri degil");
}
section('6. guvenlik kapilari');
{
  const nw = structuredClone(NEWAY_FIXTURE);
  // M-03: kapi artik programin kullandigi bos post ozelliklerini de engeller; safeRetract her programda kullanilir (fikstürde bos)
  const M = { ...nw, id: 'm', spindle: { maxRpm: 12000, minRpm: 50 }, feed: { maxCut: 10000, rapid: 30000 }, toolChange: { ...nw.toolChange, maxTools: 24 }, axes: { ...nw.axes, A: { ...nw.axes.A, limits: [-360, 360] } }, post: { props: { ...nw.post.props, safeRetract: 'G28' } } };
  ok(CAM.gates(CAM.buildProgram({ name: 'O1', machine: nw, sections: [{ setup: S0, toolpaths: [CAM.computeOp({ id: 'f', type: 'face', ...base, stepover: 7, stepdown: 1, heights: { clearance: 10, retract: 2, top: { from: 'abs', off: 0 }, bottom: { from: 'abs', off: -1 } } }, { setup: S0, tool: flat(10, { number: 5, lengthOffset: 5, diaOffset: 5 }), machine: nw })] }] }), nw).some((g) => g.code === 'cam.gate.post_prop_missing' && g.params.prop === 'safeRetract'), 'M-03: kullanilan bos safeRetract kapida engel');
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
  const gm = codes(CAM.gates(prog(tp), structuredClone(NEWAY_FIXTURE))); ok(gm.includes('cam.gate.missing:machine.spindle.maxRpm') && gm.includes('cam.gate.missing:machine.feed.maxCut'), 'eksik makine verisi block: ' + gm);
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
  const hmNone = heightmapFromFn([S0.stockBox.min[0], S0.stockBox.min[1]], [S0.stockBox.max[0], S0.stockBox.max[1]], 1, () => -Infinity);
  const gs = CAM.gates(prog(tp), M, { sim: { res: 1, modelHeightmaps: { s1: hmNone } } }); ok(!blocked(gs) && !codes(gs, 'warn').includes('cam.gate.sim_not_run'), 'sim calisti, temiz yol: ' + codes(gs));
  const bad = { ...tp, moves: [...tp.moves.slice(0, -1), { t: 'rapid', x: 50, y: 30, z: tp.clearanceZ }, { t: 'rapid', x: 50, y: 30, z: -5 }, { t: 'rapid', x: 60, y: 30, z: -5 }, { t: 'rapid', x: 60, y: 30, z: tp.clearanceZ }] };
  const gsb = CAM.gates(prog(bad), M, { sim: { res: 1, modelHeightmaps: { s1: hmNone } } }); ok(codes(gsb).includes('cam.sim.rapid_in_stock'), 'sim: stok icinde hizli block');
  // V-06: model haritasi yoksa oyma denetlenemez -> block
  ok(codes(CAM.gates(prog(tp), M, { sim: { res: 1 } })).includes('cam.gate.sim_no_model'), 'V-06: model haritasiz sim block');
  // V-11: sim cozunurlugu en kucuk takim yaricapindan kaba -> block; V-24: yanal tolerans acikca uyarilir
  { const g11 = CAM.gates(prog(tp), M, { sim: { res: 6, modelHeightmaps: { s1: hmNone } } }); ok(codes(g11).includes('cam.gate.sim_res_coarse') && codes(g11, 'warn').includes('cam.gate.sim_lateral_tol'), 'V-11: res > r block + yanal tolerans uyarisi'); }
  // V-08: korunan WCS yazimi normalize
  ok(codes(CAM.gates(prog(tp, { ...S0, workOffset: { kind: 'G54.1', p: 1 } }), { ...M, protected: { ...M.protected, wcs: ['G54.1P1'] } })).includes('cam.gate.protected:WCS'), 'V-08: G54.1P1 (bosluksuz) korunur');
  // V-09: kesmeyen uclu takim + kopru: kopru sonu inisi 'plunge' ve kapi 4 geometriye bakar (tur 'cut' olsa da)
  { const ncT = flat(10, { centerCutting: false, maxRampAngle: 5 });
    const ct = CAM.computeOp({ id: 'ct', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'outer' }], side: 'outside', stepdown: 4, ramp: { kind: 'ramp', angle: 3 }, tabs: { n: 4, width: 6, height: 3 } }, { setup: S0, tool: ncT, geom: { faces: [{ z: -10, outer: sq(20, 15, 80, 45), inners: [] }] } });
    let vcut = 0; walk(ct, (m, k, f) => { if (f && m.t === 'feed' && m.kind === 'cut' && m.z < f.z - 1e-9 && Math.hypot(m.x - f.x, m.y - f.y) < 1e-9) vcut++; });
    ok(vcut === 0, 'V-09: kopru inisi cut degil plunge');
    ok(codes(CAM.gates(prog(ct), M)).includes('cam.gate.plunge_center'), 'V-09: kopru inisi kesmeyen ucta block');
    const relabeled = { ...ct, moves: ct.moves.map((m) => (m.t === 'feed' && m.kind === 'plunge' && !m.clear ? { ...m, kind: 'cut' } : m)) };
    ok(codes(CAM.gates(prog(relabeled), M)).includes('cam.gate.plunge_center'), 'V-09: dikey asagi cut da dalma sayilir');
    // V-10: kesmeyen uc + rampa: maxRampAngle yoksa block, asilirsa block, icindeyse serbest
    const rampOp = { id: 'cr', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'outer' }], side: 'outside', stepdown: 4, ramp: { kind: 'ramp', angle: 45 } };
    const geomR = { faces: [{ z: -10, outer: sq(20, 15, 80, 45), inners: [] }] };
    const r45 = CAM.computeOp(rampOp, { setup: S0, tool: flat(10, { centerCutting: false }), geom: geomR }); ok(codes(CAM.gates(prog(r45), M)).includes('cam.gate.ramp_no_limit'), 'V-10: rampa acisi siniri tanimsiz -> block');
    const r45b = CAM.computeOp(rampOp, { setup: S0, tool: flat(10, { centerCutting: false, maxRampAngle: 5 }), geom: geomR }); ok(codes(CAM.gates(prog(r45b), M)).includes('cam.gate.ramp_center'), 'V-10: 45 > 5 derece block');
    const r3 = CAM.computeOp({ ...rampOp, ramp: { kind: 'ramp', angle: 3 } }, { setup: S0, tool: flat(10, { centerCutting: false, maxRampAngle: 5 }), geom: geomR }); const c3 = codes(CAM.gates(prog(r3), M)); ok(!c3.includes('cam.gate.ramp_center') && !c3.includes('cam.gate.plunge_center') && !c3.includes('cam.gate.ramp_no_limit'), 'V-10: 3 derece <= 5 serbest: ' + c3); }
  // V-15: 50 mm kenarda 0,001 mm kirik -> dis ofset kapanir, her nokta sinirdan d uzakta
  { const ln = (a, b) => ({ ...G.mkLine(a, b), fwd: true, open: false });
    const outerK = [ln([0, 0], [50, 1e-3]), ln([50, 1e-3], [100, 0]), ln([100, 0], [100, 50]), ln([100, 50], [0, 50]), ln([0, 50], [0, 0])];
    let e15 = null, ct15 = null; try { ct15 = CAM.computeOp({ id: 'k', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'outer' }], side: 'outside', stepdown: 20 }, { setup: setupOf([-20, -20, -30], [120, 70, 0]), tool: flat(10), geom: { faces: [{ z: -10, outer: outerK, inners: [] }] } }); } catch (e) { e15 = e.code; }
    ok(ct15 && !e15, 'V-15: neredeyse dogrusal kirikta ofset basarili: ' + e15);
    const loopP = outerK.flatMap((x) => P.fromGeom2d(x, true)); const regs = P.offsetRegions([{ outer: loopP, holes: [] }], -5);
    let worst = 0; for (const sg of regs[0].outer) for (const t of [0, 0.25, 0.5, 0.75, 1]) worst = Math.max(worst, Math.abs(P.distTo(P.pointAt(sg, t), loopP) - 5));
    ok(regs.length === 1 && regs[0].holes.length === 0 && worst < 1e-6, 'V-15: ofset tam d (hata ' + worst + ')'); }
  // V-17: kendini kesen dis sinir -> acik hata (cep ve kontur)
  { const ln = (a, b) => ({ ...G.mkLine(a, b), fwd: true, open: false }); const bow = [ln([0, 0], [40, 30]), ln([40, 30], [40, 0]), ln([40, 0], [0, 30]), ln([0, 30], [0, 0])];
    throwsCode(() => CAM.computeOp({ id: 'pb', type: 'pocket', ...base, geom: [{ kind: 'face' }], stepover: 2, stepdown: 3, entry: { kind: 'plunge' } }, { setup: S0, tool: flat(6), geom: { faces: [{ z: -10, normalOk: true, outer: bow, inners: [] }] } }), 'cam.geom.self_intersect', 'V-17: papyon cep hata');
    throwsCode(() => CAM.computeOp({ id: 'cb', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'outer' }], stepdown: 3 }, { setup: S0, tool: flat(6), geom: { faces: [{ z: -10, outer: bow, inners: [] }] } }), 'cam.geom.self_intersect', 'V-17: papyon kontur hata'); }
  // V-19: farkli z'deki yuzlerden secim tabanli kontur -> hata
  throwsCode(() => CAM.computeOp({ id: 'c19', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'outer' }, { kind: 'face', loops: 'outer' }], stepdown: 4 }, { setup: S0, tool: flat(6), geom: { faces: [{ z: -20, outer: sq(0, 0, 30, 30), inners: [] }, { z: -5, outer: sq(60, 0, 90, 30), inners: [] }] } }), 'cam.contour.faces_differ_z', 'V-19: farkli z profiller');
  // V-05: islem yolunda kirisi < 0,001 mm yay yok (Builder dogruya cevirir)
  { const ln = (a, b) => ({ ...G.mkLine(a, b), fwd: true, open: false }); const outerK = [ln([0, 0], [50, 1e-5]), ln([50, 1e-5], [100, 0]), ln([100, 0], [100, 50]), ln([100, 50], [0, 50]), ln([0, 50], [0, 0])];
    const ct = CAM.computeOp({ id: 'k5', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'outer' }], side: 'outside', stepdown: 20 }, { setup: setupOf([-20, -20, -30], [120, 70, 0]), tool: flat(10), geom: { faces: [{ z: -10, outer: outerK, inners: [] }] } });
    let tiny = 0; walk(ct, (m, k, f) => { if (f && m.t === 'arc' && Math.hypot(m.x - f.x, m.y - f.y) < 1e-3) tiny++; }); ok(tiny === 0, 'V-05: islemde dejenere yay yok'); }
  // V-27: kesmeyen uclu kilavuz/rayba/bara cevrimi (onceden delinmis delik) dalma sayilmaz; delme cevrimi sayilir
  { const cyc = (cycle) => ({ ...tp, tool: { ...tp.tool, centerCutting: false }, moves: [tp.moves[0], { t: 'cycle', cycle, points: [[10, 10]], top: 0, bottom: -10, retract: 2, clearance: tp.moves[0].z, f: tp.rpm * 1.25, pitch: 1.25, peck: 2 }, tp.moves[tp.moves.length - 1]] });
    ok(!codes(CAM.gates(prog(cyc('tap')), M)).includes('cam.gate.plunge_center') && !codes(CAM.gates(prog(cyc('ream')), M)).includes('cam.gate.plunge_center'), 'V-27: kilavuz/rayba cevrimi kesmeyen uc engeli yok');
    ok(codes(CAM.gates(prog(cyc('peck')), M)).includes('cam.gate.plunge_center'), 'V-27: delme cevrimi kesmeyen ucta block'); }
  // V-23b: S0'a yuvarlanan devir block
  ok(codes(CAM.gates(prog({ ...tp, rpm: 0.4 }), M)).includes('cam.gate.rpm_low'), 'V-23b: rpm 0.4 block');
  // V-01: 3+1 bolumde A yonu dogrulanmadi uyarisi
  ok(codes(CAM.gates(prog(tp, { ...S0, aAngle: 90 }), M), 'warn').includes('cam.gate.a_dir_unverified'), 'V-01: A yonu teyit uyarisi');
}

// ================================================================== 7. setup cozumu, sema, i18n
section('7. setup, sema, metinler');
{
  const verts = new Float32Array([0, -10, -10, 100, 10, 10, 0, 10, -10, 100, -10, 10]);
  const rb = { bodies: [{ id: 'b', vertices: verts }], holes: [] };
  const M = structuredClone(NEWAY_FIXTURE);
  const st = { id: 's', name: 'S', bodies: ['b'], frame: { origin: { kind: 'stockCorner', corner: 'x-y-z+' } }, workOffset: { kind: 'G55' }, stock: { kind: 'boxOffset', side: 2, top: 1, bottom: 0 }, clearanceZ: 5 };
  const S = CAM.resolveSetup(st, rb, M);
  ok(S.stockBox.max[2] === 0 && S.stockBox.min[0] === 0 && Math.abs(S.stockBox.max[0] - 104) < 1e-9 && S.frame.o[2] === 11, 'kutu stok + kose orijini');
  const Sr = CAM.resolveSetup({ ...st, frame: { origin: { kind: 'point', p: [0, 0, 0] } }, stock: { kind: 'cyl', dia: 40, len: 110, axis: 'X' }, rotary: { enabled: true, aAngle: 90 } }, rb, M);
  const q = (p) => [0, 1, 2].map((k) => (p[0] - Sr.frame.o[0]) * [Sr.frame.x, Sr.frame.y, Sr.frame.z][k][0] + (p[1] - Sr.frame.o[1]) * [Sr.frame.x, Sr.frame.y, Sr.frame.z][k][1] + (p[2] - Sr.frame.o[2]) * [Sr.frame.x, Sr.frame.y, Sr.frame.z][k][2]);
  const qp = q([0, 5, 0]); // A kelimesi 90, dir -X: Rot(-X, 90) = Rx(-90) -> +Y noktasi -Z'ye
  ok(Sr.aAngle === 90 && Math.abs(qp[2] + 5) < 1e-9 && Math.abs(qp[1]) < 1e-9 && Sr.stockBox.max[2] === 20, '3+1: A=90 etkin cerceve (A.dir isareti) ve silindir stok');
  throwsCode(() => CAM.resolveSetup({ ...st, rotary: { enabled: true, aAngle: 90 } }, rb, builtinMachines()[0]), 'cam.setup.no_rotary', 'A ekseni olmayan makinede 3+1');
  // V-01: bagimsiz fizik: parca noktasi tezgahta Rot(A.dir, A kelimesi)·p; setup koordinati bununla AYNI olmali; post A'yi aAngle olarak yazar
  { const rot = (u, deg) => { const t = deg * Math.PI / 180, c = Math.cos(t), s2 = Math.sin(t), [x, y, z] = u; return [[c + x * x * (1 - c), x * y * (1 - c) - z * s2, x * z * (1 - c) + y * s2], [y * x * (1 - c) + z * s2, c + y * y * (1 - c), y * z * (1 - c) - x * s2], [z * x * (1 - c) - y * s2, z * y * (1 - c) + x * s2, c + z * z * (1 - c)]]; };
    for (const dx of [-1, 1]) for (const a of [30, 90, 270]) {
      const Md = JSON.parse(JSON.stringify(M)); Md.axes.A.dir = [dx, 0, 0];
      const Sd = CAM.resolveSetup({ ...st, frame: { origin: { kind: 'model' } }, stock: { kind: 'cyl', dia: 40, len: 110, axis: 'X' }, rotary: { enabled: true, aAngle: a } }, rb, Md);
      const p = [3, 5, 3]; const qd = [Sd.frame.x, Sd.frame.y, Sd.frame.z].map((ax) => ax[0] * (p[0] - Sd.frame.o[0]) + ax[1] * (p[1] - Sd.frame.o[1]) + ax[2] * (p[2] - Sd.frame.o[2]));
      const ph = rot([dx, 0, 0], a).map((row) => row[0] * p[0] + row[1] * p[1] + row[2] * p[2]);
      ok(Math.hypot(qd[0] - ph[0], qd[1] - ph[1], qd[2] - ph[2]) < 1e-9, `V-01: dir=${dx} A=${a}: cerceve fiziksel donusle ayni`);
    } }
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
  const M = { ...builtinMachines()[0], id: 'gen', axes: { X: { travel: 800 }, Y: { travel: 500 }, Z: { travel: 500 } }, spindle: { maxRpm: 12000, minRpm: 100 }, feed: { maxCut: 8000, rapid: 24000 }, toolChange: { maxTools: 20, kind: 'fixed' } };
  const tools = [flat(6, { id: 'em6', number: 2, lengthOffset: 2, diaOffset: 2 }), flat(10, { id: 'em10', number: 4, lengthOffset: 4, diaOffset: 4, fluteLen: 35, bodyLen: 50 }), { id: 'dr', number: 6, lengthOffset: 6, type: 'drill', dia: 6.8, tipAngle: 118, fluteLen: 40, bodyLen: 60, flutes: 2, centerCutting: true }];
  const floor = faceAt(20), step = faceAt(25), top = faceAt(30, 2000), bottom = faceAt(0, 2000, -1);
  ok(floor && step && top, 'taban, basamak ve ust yuz bulundu');
  const hh = { clearance: 15, retract: 3 };
  const cam = { machineId: M.id, tools, setups: [{ id: 'S1', name: 'Ust', bodies: [bid], frame: { origin: { kind: 'stockCorner', corner: 'x-y-z+' }, zAxis: { kind: 'base', dir: '+Z' }, xAxis: { kind: 'base', dir: '+X' } }, workOffset: { kind: 'G55' }, stock: { kind: 'boxOffset', side: 2, top: 1, bottom: 0 }, clearanceZ: 10, ops: [
    { id: 'o1', type: 'face', name: 'Yuzey', toolId: 'em10', ...base, heights: { ...hh, top: { from: 'stockTop', off: 0 }, bottom: { from: 'modelTop', off: 0 } }, stepover: 7, stepdown: 1, extend: 1 },
    { id: 'o2', type: 'pocket', name: 'Cep', toolId: 'em6', ...base, heights: { ...hh, top: { from: 'modelTop', off: 0 }, bottom: { from: 'selection', off: 0 } }, geom: [{ kind: 'face', ref: floor }], stepover: 2.5, stepdown: 3, stockToLeave: { radial: 0, axial: 0 }, entry: { kind: 'helix', angle: 3, helixDia: 3 } },
    { id: 'o3', type: 'pocket', name: 'Basamak', toolId: 'em6', ...base, heights: { ...hh, top: { from: 'modelTop', off: 0 }, bottom: { from: 'selection', off: 0 } }, geom: [{ kind: 'face', ref: step }], stepover: 2.5, stepdown: 5, entry: { kind: 'ramp', angle: 3 } },
    { id: 'o4', type: 'contour', name: 'Dis', toolId: 'em10', ...base, heights: { ...hh, top: { from: 'modelTop', off: 0 }, bottom: { from: 'abs', off: -31 } }, geom: [{ kind: 'face', ref: bottom, loops: 'outer' }], stepdown: 4, leadIn: { kind: 'arc', r: 4 }, leadOut: { kind: 'arc', r: 4 } },
    { id: 'o6', type: 'contour', name: 'Siluet', toolId: 'em10', ...base, heights: { ...hh, top: { from: 'modelTop', off: 0 }, bottom: { from: 'selection', off: -0.5 } }, geom: [{ kind: 'silhouette', body: bid }], stepdown: 6, stockToLeave: { radial: 0.5, axial: 0 }, leadIn: { kind: 'arc', r: 4 }, leadOut: { kind: 'arc', r: 4 } },
    { id: 'o7', type: 'pocket', name: 'SketchCep', toolId: 'em6', ...base, heights: { ...hh, top: { from: 'modelTop', off: 0 }, bottom: { from: 'abs', off: -11 } }, geom: [{ kind: 'sketch', sketch: 's2', profiles: [ring] }], stepover: 2.5, stepdown: 3, stockToLeave: { radial: 0.1, axial: 0.05 }, entry: { kind: 'helix', angle: 3, helixDia: 3 } },
    { id: 'o5', type: 'drill', name: 'Delik', toolId: 'dr', ...base, heights: hh, holes: { kind: 'feature' }, cycle: 'peck', peck: 3, depth: { from: 'hole', tipComp: false }, order: 'shortest' },
  ] }] };
  ok(validateDoc({ ...doc, cam }), 'uctan uca belge semadan gecer');
  const query = async (cmd, args) => { if (cmd === 'facePlane') return K.facePlane(args.ref); if (typeof K[cmd] === 'function' && cmd.startsWith('cam')) return K[cmd](args); throw new Error('cmd ' + cmd); };
  const S = CAM.resolveSetup(cam.setups[0], rb, M);
  const fl = K.camFaceLoops({ ref: floor, frame: S.frame }); const sl = K.camFaceLoops({ ref: step, frame: S.frame });
  ok(Math.abs(fl.z + 11) < 1e-9 && fl.inners.length === 1 && !fl.open && fl.outer.length === 4, 'camFaceLoops taban: z, ada, kapali duvarlar');
  ok(sl.open && sl.outer.filter((s) => s.open).length === 3 && Array.isArray(sl.above) && sl.above.length >= 1, 'camFaceLoops basamak: uc acik kenar + taban ustu kesit');
  throwsCode(() => K.camFaceLoops({ ref: top, frame: { ...S.frame, z: [1, 0, 0], x: [0, 0, -1] } }), 'cam.face_not_flat', 'takim eksenine dik olmayan yuz');
  const sec = K.camSection({ body: bid, frame: S.frame, z: -5 }); ok(sec.loops.length >= 5, 'kesit donguleri: ' + sec.loops.length);
  const hm = K.camHeightmap({ bodies: [bid], frame: S.frame, res: 0.5, bbox: [S.stockBox.min[0], S.stockBox.min[1], S.stockBox.max[0], S.stockBox.max[1]] });
  const at = (x, y) => hm.data[Math.floor((y - hm.y0) / hm.res) * hm.nx + Math.floor((x - hm.x0) / hm.res)];
  ok(Math.abs(at(32, 22) + 11) < 1e-3 && Math.abs(at(52, 32) + 1) < 1e-3 && at(0.5, 0.5) === -Infinity, 'yukseklik haritasi: taban/ada/bos');
  const res = await CAM.generateProgram(cam, { rebuild: rb, machine: M, query, doc, name: 'O1000', sim: { res: 0.5, modelHeightmaps: { S1: hm } } });
  ok(res.ops.every((o) => o.ok), 'tum islemler hesaplandi: ' + JSON.stringify(res.ops.filter((o) => !o.ok).map((o) => [o.opId, o.error])));
  const blocks = res.gates.filter((g) => g.level === 'block'); ok(res.program && !blocks.length, 'kapilar temiz (sim + oyma dahil): ' + JSON.stringify(blocks.slice(0, 5)));
  ok(res.program && res.program.sections.every((s) => rapidsOk(s.toolpath, S.stockTop)), 'hicbir hizli stok icinde yatay gitmiyor');
  const pk = res.ops.find((o) => o.opId === 'o2')?.toolpath;
  if (pk) {
    const Rg = { outer: kloop(fl.outer), holes: fl.inners.map(kloop) }; const pts = cutPoints(pk, (z) => z < S.stockTop - 1, 0.1);
    ok(pts.every((p) => P.distTo([p[0], p[1]], P.regionSegs(Rg)) >= 3 - 1e-6), 'cekirdek cebi: duvar/adaya ihlal yok');
  }
  const stp = res.ops.find((o) => o.opId === 'o3')?.toolpath; if (stp) ok(Math.max(...cutPoints(stp, (z) => z < S.stockTop - 1).map((p) => p[0])) >= 102 + 3 - 1e-6, 'acik basamak: takim acik kenarin otesine tasar');
  // silhouette: dis kontur tam r + pay, hicbir nokta govde ayak izinde degil
  const so = res.ops.find((o) => o.opId === 'o6')?.toolpath;
  if (so) {
    const fp = kloop(sq(2, 2, 102, 62)); const pts = cutPoints(so, (z) => z < S.stockTop - 1, 0.1);
    const md = Math.min(...pts.map((p) => P.distTo([p[0], p[1]], fp)));
    ok(Math.abs(md - 5.5) < 1e-6 && pts.every((p) => !P.inRegion([p[0], p[1]], { outer: fp, holes: [] })) && Math.abs(so.stats.zMin - (S.modelBBox.min[2] - 0.5)) < 1e-6, `silhouette kontur: en yakin ${md} = r+pay, govde tabani - 0,5`);
  } else ok(false, 'silhouette islemi yok');
  // sketch cebi: yuz secimli cep ile ayni sinirlar (duvar/ada) -> r + pay
  const sp = res.ops.find((o) => o.opId === 'o7')?.toolpath;
  if (sp) {
    const Rg = { outer: kloop(fl.outer), holes: fl.inners.map(kloop) }; const pts = cutPoints(sp, (z) => z < S.stockTop - 1, 0.1);
    const md = Math.min(...pts.map((p) => P.distTo([p[0], p[1]], P.regionSegs(Rg))));
    ok(Math.abs(md - 3.1) < 1e-6 && pts.every((p) => P.inRegion([p[0], p[1]], Rg)) && Math.abs(sp.stats.zMin + 10.95) < 1e-6, `sketch cebi: en yakin ${md} = r+pay, bolge icinde, eksenel pay`);
  } else ok(false, 'sketch cebi yok');
  // sketch duzlemi takim eksenine dik degil -> hata; aynali (normal -Z) sketch dogru tarafta
  throwsCode(() => sketchFaces({ kind: 'sketch', sketch: 's2', profiles: 'all' }, sk2, { o: [0, 0, 0], x: [1, 0, 0], y: [0, 0, 1], n: [0, -1, 0] }, S.frame), 'cam.geom.sketch_not_perpendicular', 'dik olmayan sketch');
  const mir = sketchFaces({ kind: 'sketch', sketch: 's2', profiles: [ring] }, sk2, { o: [0, 0, 30], x: [-1, 0, 0], y: [0, 1, 0], n: [0, 0, -1] }, S.frame)[0];
  const mo = kloop(mir.outer); const mb = P.loopBBox([mo]);
  ok(P.area(mo) > 0 && Math.abs(mb[0] - (2 - 80)) < 1e-9 && Math.abs(mb[2] - (2 - 20)) < 1e-9 && mir.inners.length === 1, 'aynali sketch: dis CCW, x ters, ada var');
  // B postu ile NC (makine profilindeki null post ozellikleri olmadan)
  try { const { postProgram } = await import('../src/cam/post/index.js'); const nc = postProgram(res.program, M, { gates: res.gates, date: '2026-11-11' }); ok(typeof nc.text === 'string' && /UNVERIFIED/.test(nc.text) && nc.text.includes('G83'), 'B postu ile NC uretildi'); }
  catch (e) { ok(false, 'post: ' + (e.code || e.message)); }
  // prizmatik olmayan govde (X eksenli silindir) -> silhouette acik hata
  const rbC = await K.rebuild({ params: [], features: [{ id: 'cy', type: 'primitive', kind: 'cylinder', x: '0', y: '30', z: '20', dia: '20', h: '100', axis: 'X', op: 'new' }] });
  const SC = CAM.resolveSetup({ ...cam.setups[0], bodies: [rbC.bodies[0].id] }, rbC, M);
  try { await CAM.resolveGeom({ geom: [{ kind: 'silhouette', body: rbC.bodies[0].id }] }, SC, { rebuild: rbC, doc: null, query }); ok(false, 'silindir silhouette hata vermeliydi'); }
  catch (e) { ok(e.code === 'cam.silhouette.not_prismatic', 'prizmatik olmayan govde: ' + e.code); }
  await K.rebuild(doc);
  // eksik veri: genel makine sablonu -> block
  const r2b = await CAM.generateProgram(cam, { rebuild: rb, machine: builtinMachines()[0], query, name: 'O1' }); ok(r2b.blocked && r2b.gates.some((g) => g.code === 'cam.gate.missing'), 'sablon makine: eksik veri block');
  // T-05a: holes.kind 'points' (sketch noktalari) ve 'feature' (filtreli) generateProgram'da calisir
  {
    const dbase = { toolId: 'dr', ...base, heights: hh, cycle: 'peck', peck: 3, order: 'asis' };
    const pOps = [
      { id: 'p1', type: 'drill', name: 'Nokta', ...dbase, holes: { kind: 'points', sketch: 's3' }, depth: { from: 'abs', tipComp: false, z: -10 } },
      { id: 'p2', type: 'drill', name: 'Nokta2', ...dbase, holes: { kind: 'points', sketch: 's3', ents: ['hp2'] }, depth: { from: 'abs', tipComp: false, z: -10 } },
      { id: 'p3', type: 'drill', name: 'Ozellik', ...dbase, holes: { kind: 'feature', filter: { feature: 'h' } }, depth: { from: 'hole', tipComp: false } },
      { id: 'p4', type: 'drill', name: 'Yok', ...dbase, holes: { kind: 'points', sketch: 's3', ents: ['yok'] }, depth: { from: 'abs', tipComp: false, z: -10 } },
      { id: 'p5', type: 'drill', name: 'YokSk', ...dbase, holes: { kind: 'points', sketch: 'yok' }, depth: { from: 'abs', tipComp: false, z: -10 } },
    ];
    const camP = { ...cam, setups: [{ ...cam.setups[0], ops: pOps }] };
    ok(validateDoc({ ...doc, cam: camP }), 'T-05a: points/feature secimli belge semadan gecer');
    const rp = await CAM.generateProgram(camP, { rebuild: rb, machine: M, query, doc, name: 'O1001' });
    const opR = (id) => rp.ops.find((o) => o.opId === id);
    const cyPts = (id) => (opR(id)?.toolpath?.moves || []).filter((m) => m.t === 'cycle').flatMap((m) => m.points.map((q) => [q[0], q[1], m.top]));
    const want = [[12, 12, -1], [12, 52, -1], [52, 7, -1]]; // sketch z=30, setup orijini (-2,-2,31)
    const same = (a, b) => a.length === b.length && b.every((w) => a.some((q) => Math.hypot(q[0] - w[0], q[1] - w[1], q[2] - w[2]) < 1e-9));
    ok(opR('p1')?.ok && same(cyPts('p1'), want), 'T-05a points: uc sketch noktasi setup uzayinda: ' + JSON.stringify(cyPts('p1')) + ' ' + JSON.stringify(opR('p1')?.error));
    ok(opR('p2')?.ok && same(cyPts('p2'), [want[1]]), 'T-05a points + ents: yalniz secilen nokta');
    ok(opR('p3')?.ok && same(cyPts('p3'), want), 'T-05a feature filtresi: delik ozelligi konumlari');
    ok(opR('p4') && !opR('p4').ok && opR('p4').error.code === 'cam.drill.point_missing', 'T-05a: bulunmayan oge acik hata: ' + JSON.stringify(opR('p4')?.error));
    ok(opR('p5') && !opR('p5').ok && opR('p5').error.code === 'cam.geom.sketch_missing', 'T-05a: bulunmayan sketch acik hata');
    ok(rp.gates.some((g) => g.level === 'block' && g.opId === 'p4'), 'T-05a: basarisiz islem kapida engel');
  }
  // T-14: boydan boya delik dibi = delik ekseninde modelden son cikis (P2 benzeri: flans altinda bosluk, altinda plaka)
  {
    const pt = (id, x, y) => ({ id, type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '30' }, points: { a: { x, y } }, ents: [{ id: id + 'p', type: 'point', p: 'a' }] });
    const dF = { params: [], features: [
      { id: 'fb', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '100', d: '60', h: '10', op: 'new' },
      { id: 'fw', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '5', d: '60', h: '30', op: 'join', targets: ['fb'] },
      { id: 'ff', type: 'primitive', kind: 'box', x: '0', y: '0', z: '25', w: '40', d: '60', h: '5', op: 'join', targets: ['fb'] },
      pt('fs', 20, 30), { id: 'fh', type: 'hole', sketch: 'fs', kind: 'simple', dia: '6.8', extent: 'dist', depth: '5', tipAngle: '118' },
    ] };
    const rF = await K.rebuild(dF); const fbid = rF.bodies[0].id;
    const thr = (pos) => ({ feature: 'T', kind: 'simple', dia: 6.8, depth: null, through: true, tipAngle: 118, thread: null, dir: [0, 0, -1], positions: pos, dirs: pos.map(() => [0, 0, -1]), bodies: pos.map(() => [fbid]), count: pos.length, lost: 0 });
    const rbF = { ...rF, holes: [thr([[20, 30, 30], [30, 50, 30]])] }; // ikincisi: modelde delik yok (eksen eslesmez) -> eski kural
    const camF = { ...cam, setups: [{ ...cam.setups[0], bodies: [fbid], ops: [{ id: 't1', type: 'drill', name: 'Boydan', toolId: 'dr', ...base, heights: hh, holes: { kind: 'feature' }, cycle: 'peck', peck: 3, depth: { from: 'hole', tipComp: false, breakThrough: 1 }, order: 'asis' }] }] };
    const queryF = async (cmd, args) => { if (typeof K[cmd] === 'function' && cmd.startsWith('cam')) return K[cmd](args); throw new Error('cmd ' + cmd); };
    const rT = await CAM.generateProgram(camF, { rebuild: rbF, machine: M, query: queryF, doc: dF, name: 'O1002' });
    const tp = rT.ops[0]?.toolpath; const cy = (tp?.moves || []).filter((m) => m.t === 'cycle');
    const botAt = (x, y) => cy.find((m) => m.points.some((q) => Math.abs(q[0] - x) < 1e-6 && Math.abs(q[1] - y) < 1e-6))?.bottom;
    // stok ust Z31 (top 1), orijin x-y-z+ (side 2): flans alti Z25 -> setup -6, -1 delip gecme -> -7; model tabani Z0 -> -31 - 1 = -32
    ok(rT.ops[0]?.ok && Math.abs(botAt(22, 32) + 7) < 1e-6, 'T-14: flans deligi dibi flans alti - 1 (-7), plaka degil: ' + botAt(22, 32) + ' ' + JSON.stringify(rT.ops[0]?.error));
    ok(Math.abs(botAt(32, 52) + 32) < 1e-6 && tp.warnings.some((w) => w.code === 'cam.drill.through_to_model_bottom' && w.params.n === 1), 'T-14: cikisi bulunamayan delik eski muhafazakar kural (model tabani) + uyari (n=1)');
    const rQ = await CAM.generateProgram(camF, { rebuild: rbF, machine: M, query: async () => { throw new Error('yok'); }, doc: dF, name: 'O1003' });
    ok(rQ.ops[0]?.ok && rQ.ops[0].toolpath.warnings.some((w) => w.code === 'cam.drill.through_to_model_bottom' && w.params.n === 2), 'T-14: cekirdek sorgusu basarisiz -> tum delikler eski kural + uyari');
    await K.rebuild(doc);
  }
  // T-04: setup n'in son stogu setup n+1'in baslangic stogu (P1 S3 hayalet stok durumunu kuran sentetik cok-setup testi)
  {
    const dP = { params: [], features: [{ id: 'pb', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '60', d: '40', h: '20', op: 'new' }, ...[15, 45].map((x, i) => ({ id: 'pc' + i, type: 'primitive', kind: 'cylinder', x, y: 0, z: 10, dia: 6.8, h: 10, axis: 'Y', op: 'cut', targets: ['pb'] }))] };
    const rP = await K.rebuild(dP); const pid = rP.bodies[0].id; ok(Object.values(rP.status).every((x) => x.ok) && Math.abs(rP.bodies[0].volume - (60 * 40 * 20 - 2 * Math.PI * 3.4 * 3.4 * 10)) < 1, 'T-04 modeli: kutu + 2 yan delik');
    const side = { feature: 'S', kind: 'simple', dia: 6.8, depth: 10, through: false, tipAngle: 118, thread: null, dir: [0, 1, 0], positions: [[15, 0, 10], [45, 0, 10]], dirs: [[0, 1, 0], [0, 1, 0]], bodies: [[pid], [pid]], count: 2, lost: 0 };
    const rbP = { ...rP, holes: [side] };
    let pBot = null; for (let i = 0; i < rP.bodies[0].nFaces; i++) { const d = K.describe({ body: pid, idx: i }, 'face'); if (d.geom === 'PLANE' && d.normal[2] < -0.99 && Math.abs(d.fp[2]) < 1e-6) pBot = d; }
    const MA = { ...M, axes: { ...M.axes, A: { ...NEWAY_FIXTURE.axes.A } } }; const aDeg = -90 * Math.sign(MA.axes.A.dir[0]);
    const stk = { kind: 'boxOffset', side: 5, top: 5, bottom: 0 };
    const S1o = [{ id: 'q1', type: 'face', name: 'Yuzey', toolId: 'em10', ...base, heights: { ...hh, top: { from: 'stockTop', off: 0 }, bottom: { from: 'modelTop', off: 0 } }, stepover: 7, stepdown: 2.5, extend: 1 },
      { id: 'q2', type: 'contour', name: 'Dis', toolId: 'em10', ...base, heights: { ...hh, top: { from: 'modelTop', off: 0 }, bottom: { from: 'abs', off: -20 } }, geom: [{ kind: 'face', ref: pBot, loops: 'outer' }], stepdown: 5, leadIn: { kind: 'arc', r: 4 }, leadOut: { kind: 'arc', r: 4 } }];
    const S2o = [{ id: 'q3', type: 'drill', name: 'Yan', toolId: 'dr', ...base, heights: hh, holes: { kind: 'feature' }, cycle: 'peck', peck: 3, depth: { from: 'hole', tipComp: false }, order: 'asis' }];
    const mkCam = (s2) => ({ ...cam, setups: [
      { id: 'T1', name: 'Ust', bodies: [pid], frame: { origin: { kind: 'stockTopCenter' }, zAxis: { kind: 'base', dir: '+Z' }, xAxis: { kind: 'base', dir: '+X' } }, workOffset: { kind: 'G54' }, stock: stk, clearanceZ: 5, ops: S1o },
      { id: 'T2', name: 'Yan', bodies: [pid], workOffset: { kind: 'G55' }, stock: stk, clearanceZ: 5, ops: S2o, ...s2 }] });
    const yan = { frame: { origin: { kind: 'stockTopCenter' }, zAxis: { kind: 'base', dir: '-Y' }, xAxis: { kind: 'base', dir: '+X' } } };
    const rot = { frame: { origin: { kind: 'stockTopCenter' }, zAxis: { kind: 'base', dir: '+Z' }, xAxis: { kind: 'base', dir: '+X' } }, rotary: { enabled: true, aAngle: aDeg } };
    const hmFor = (camX) => { const out = {}; for (const st of camX.setups) { const S = CAM.resolveSetup(st, rbP, MA); out[st.id] = K.camHeightmap({ bodies: [pid], frame: S.frame, res: 0.5, bbox: [S.stockBox.min[0], S.stockBox.min[1], S.stockBox.max[0], S.stockBox.max[1]] }); } return out; };
    const ghost = (g) => g.filter((x) => x.level === 'block' && ['cam.sim.rapid_in_stock', 'cam.sim.holder_collision', 'cam.sim.shaft_collision', 'cam.sim.flute_exceeded'].includes(x.code));
    for (const [nm, s2] of [['yan (-Y)', yan], ['3+1 A' + aDeg, rot]]) {
      const cX = mkCam(s2); const mh = hmFor(cX);
      const S2 = CAM.resolveSetup(cX.setups[1], rbP, MA); ok(Math.abs(S2.frame.z[1] + 1) < 1e-9, `T-04 ${nm}: S2 takim ekseni -Y`);
      const qP = async (cmd, args) => { if (typeof K[cmd] === 'function' && cmd.startsWith('cam')) return K[cmd](args); throw new Error('cmd ' + cmd); };
      const r1 = await CAM.generateProgram(cX, { rebuild: rbP, machine: MA, query: qP, doc: dP, name: 'O1004', sim: { res: 0.5, modelHeightmaps: mh } });
      const r0 = await CAM.generateProgram(cX, { rebuild: rbP, machine: MA, query: qP, doc: dP, name: 'O1004', sim: { res: 0.5, modelHeightmaps: mh, chain: false } });
      ok(r1.ops.every((o) => o.ok), `T-04 ${nm}: islemler hesaplandi ` + JSON.stringify(r1.ops.filter((o) => !o.ok).map((o) => o.error)));
      const g0 = ghost(r0.gates).filter((x) => x.params.op === 'q3' || x.opId === 'q3'), g1 = ghost(r1.gates);
      ok(g0.length > 0, `T-04 ${nm} kontrol: zincirsiz S2 hayalet stok engeli var (${g0.map((x) => x.code)})`);
      ok(g1.length === 0, `T-04 ${nm}: zincirle hayalet BLOCK 0: ` + JSON.stringify(g1.slice(0, 3)));
      ok(!r1.gates.some((x) => x.level === 'block' && x.code === 'cam.sim.gouge'), `T-04 ${nm}: oyma yok ` + JSON.stringify(r1.gates.filter((x) => x.code === 'cam.sim.gouge').map((x) => [x.params.op, x.params.depth, x.params.vertical, x.params.x, x.params.y, x.params.z])));
    }
    // yanlis "temiz" yok: S1 yan duvari kesmezse (yalniz yuzey) S2 hizlisi hala engel
    const cY = mkCam(yan); cY.setups[0].ops = [S1o[0]];
    const rY = await CAM.generateProgram(cY, { rebuild: rbP, machine: MA, query: async (c, a) => K[c](a), doc: dP, name: 'O1005', sim: { res: 0.5, modelHeightmaps: hmFor(cY) } });
    ok(ghost(rY.gates).length > 0, 'T-04: S1 yan stogu kaldirmadiysa S2 engel kalir (yanlis temiz yok)');
    await K.rebuild(doc);
  }
}

section('9. T-24 kesit dongusu kapanisi (zincir acikligi)');
{
  const ln = (p0, p1, fwd = true) => ({ type: 'line', p0, p1, fwd, open: false, edge: null });
  const gapOf = (loop) => { let w = 0; const e = (g) => (g.fwd === false ? g.p0 : g.p1), b = (g) => (g.fwd === false ? g.p1 : g.p0); for (let i = 0; i < loop.length; i++) { const a = e(loop[i]), c = b(loop[(i + 1) % loop.length]); w = Math.max(w, Math.hypot(a[0] - c[0], a[1] - c[1])); } return w; };
  // P4 Y29,05'teki gibi 5,85e-4 mm acik (iki dogru; biri ters yonlu)
  const sqGap = [ln([0, 0], [10, 0]), ln([10, 0], [10, 10]), ln([0, 10], [9.999415, 10], false), ln([0, 10], [0, 0])];
  ok(gapOf(sqGap) > 5e-4, 'ham dongu acik (5,85e-4)');
  const c1 = P.closeItemLoop(sqGap);
  ok(gapOf(c1) === 0 && c1.length === 4, 'iki dogru: orta noktada birebir kapanir: ' + gapOf(c1));
  ok(P.isClosedLoop(c1.flatMap((it) => P.fromGeom2d(it, it.fwd !== false)), 1e-9), 'path2d dongusu kapali (1e-9)');
  ok(sqGap[2].p1[0] === 9.999415, 'girdi degistirilmez');
  // dogru-yay: dogru ucu yay ucuna
  const arc = { ...G.mkArc([10, 5], 5, -Math.PI / 2, Math.PI), fwd: true, open: false };
  const da = [ln([0, 0], [10.0004, 0]), arc, ln([10, 10], [0, 10]), ln([0, 10], [0, 0])];
  const c2 = P.closeItemLoop(da); ok(gapOf(c2) < 1e-12 && c2.length === 4, 'dogru-yay: dogru ucu yaya tasinir: ' + gapOf(c2));
  // yay-yay: araya kisa dogru
  const a1 = { ...G.mkArc([0, 0], 5, 0, Math.PI), fwd: true, open: false }, a2 = { ...G.mkArc([0, 0], 5, Math.PI + 1e-4, Math.PI - 1e-4), fwd: true, open: false };
  const c3 = P.closeItemLoop([a1, a2]); ok(gapOf(c3) < 1e-12 && c3.length === 3 && c3.some((g) => g.type === 'line'), 'yay-yay: kisa dogru eklenir: ' + c3.length);
  // ops/common.js loopFromKernel (camFaceLoops yolu): 5,85e-4 acik dongu artik loop_open degil, birebir kapali
  { let lp = null, er = null; try { lp = loopFromKernel(sqGap); } catch (e) { er = e.code; } ok(lp && P.isClosedLoop(lp, 1e-12), 'loopFromKernel: zincir acikligi kapanir (loop_open yok): ' + er); }
  { let er = null; try { loopFromKernel([ln([0, 0], [10, 0]), ln([10, 0.5], [10, 10]), ln([10, 10], [0, 10]), ln([0, 10], [0, 0])]); } catch (e) { er = e.code; } ok(er === 'cam.geom.loop_open', 'loopFromKernel: 0,5 mm gercek aciklik hala loop_open: ' + er); }
  // buyuk aciklik (gercek acik uc) sessizce kapatilmaz
  const big = [ln([0, 0], [10, 0]), ln([10, 0.5], [10, 10]), ln([10, 10], [0, 10]), ln([0, 10], [0, 0])];
  ok(gapOf(P.closeItemLoop(big)) >= 0.5, 'maxGap ustu aciklik birakilir (kapilar yakalar)');
  // eskiz NODE_TOL ile ada kaybi yok: kapatilmis dongu findRegions'da tek bolge
  const toSketch = (loop) => { const pts = {}, ents = []; const key = (p) => p[0].toFixed(9) + ',' + p[1].toFixed(9); const id = (p) => { const k = key(p); if (!pts['p' + k]) pts['p' + k] = { x: p[0], y: p[1] }; return 'p' + k; }; loop.forEach((g, i) => ents.push({ id: 'e' + i, type: 'line', a: id(g.p0), b: id(g.p1) })); return { points: pts, ents }; };
  ok(findRegions(toSketch(sqGap)).regions.length === 0, 'ham acik dongu eskizde bolge vermez (ada kaybi, T-24)');
  ok(findRegions(toSketch(c1)).regions.length === 1, 'kapatilmis dongu eskizde bir bolge');
}

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
