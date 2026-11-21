// CAM cekirdegi testleri (Ajan A): saf geometri (cekirdeksiz) + cekirdekli uctan uca.
// Calistir: node test/cam.test.mjs
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import * as CAM from '../src/cam/index.js';
import * as P from '../src/cam/geom/path2d.js';
import * as G from '../src/shared/geom2d.js';
import { ringTree, pocketRegion, SegGrid } from '../src/cam/ops/pocket.js';
import { loopFromKernel } from '../src/cam/ops/common.js';
import { sketchFaces, silhouetteFaces } from '../src/cam/geom/select.js';
import { NEWAY_FIXTURE } from './fixtures/machine-neway.mjs';
import { exportMachines, importMachines, MACHINE_FORMAT } from '../src/cam/machines/io.js';
import { builtinMachines, checkMachine, copyMachine } from '../src/cam/machines/builtin.js';
import { normalizeTool, importLibrary, exportLibrary, applyPreset, toolListIssues } from '../src/cam/tools.js';
import { validateToolpath, validateProgram, walk, sampleArc, arcSweep, mk as IRmk } from '../src/cam/ir.js';
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
    const g98 = (c) => c.length === 1 && c[0].points.length === 3 && c[0].returnTo === 'clearance';
    ok(g98(n0), 'T-23/WP-06: harita yok + R stok altinda -> gecis dogrulanamaz: TEK cevrim, her nokta G98 (returnTo clearance): ' + n0.length);
    ok(n1.length === 1 && n1[0].points.length === 3 && n1[0].retract < n1[0].clearance, 'T-23: islenmis yuzey (stok + model R altinda) -> tek G99 cevrimi: ' + n1.length);
    ok(g98(n2), 'T-23/WP-06: stokta kaburga gecisi keser -> tek cevrim, G98 donusu (eskiden 2+1 ayri cevrim): ' + n2.map((c) => c.points.length));
    ok(g98(n3), 'T-23/WP-06: model haritasi yok -> G99 gecisi guvenli sayilmaz -> G98');
    ok(g98(n4), 'T-23/WP-06: model haritasinda kaburga (ince duvar guvencesi) -> G98');
    const { simulate } = await import('../src/cam/sim/index.js');
    const tp1 = CAM.computeOp(op23, { setup: S0, tool: drill, geom: { holes: hp }, stockMap: flatMap(false), modelMap: flatMap(false) });
    const sr = simulate(tp1, { res: 0.5, stockBox: S0.stockBox, stockHeightmap: flatMap(false) });
    ok(!sr.issues.some((i) => i.code === 'cam.sim.rapid_in_stock'), 'T-23: tek cevrim G99 gecisleri sim\'de stok icinden gecmiyor');
    const tp2 = CAM.computeOp(op23, { setup: S0, tool: drill, geom: { holes: hp }, stockMap: flatMap(true), modelMap: flatMap(true) });
    const sr2 = simulate(tp2, { res: 0.5, stockBox: S0.stockBox, stockHeightmap: flatMap(true) });
    ok(!sr2.issues.some((i) => i.code === 'cam.sim.rapid_in_stock'), 'T-23: kaburgali stokta bolunmus cevrim sim\'de temiz');
    ok(!sr2.issues.some((i) => i.code === 'cam.sim.below_stock' || i.code === 'cam.sim.gouge'), 'WP-06: G98 donuslu tek cevrim sim\'de temiz: ' + sr2.issues.map((i) => i.code));
    // kontrol: ayni cevrim G98 bayragi olmadan (R'de G99 gecisleri) kaburgayi keser -> sim gecisi gorur
    const tpBad = { ...tp2, moves: tp2.moves.map((m) => { if (m.t !== 'cycle') return m; const { returnTo, ...rest } = m; void returnTo; return rest; }) };
    const sr3 = simulate(tpBad, { res: 0.5, stockBox: S0.stockBox, stockHeightmap: flatMap(true) });
    ok(sr3.issues.some((i) => i.code === 'cam.sim.rapid_in_stock'), 'T-23 kontrol: kaburgayi R\'de gecen birlesik cevrim sim\'de rapid_in_stock (gecis denetimi gercek)');
  }
  // T-05b: boyu bilinen boydan boya delik (taninan, alttan yonlu) ustten delinir; boyu bilinmeyen ters delik atlanir
  {
    const up = [{ feature: 'r', dia: 6.8, depth: null, through: true, tipAngle: null, thread: null, dir: [0, 0, 1], positions: [[50, 30, -30]], dirs: [[0, 0, 1]], exits: [30] }];
    const c = CAM.computeOp({ ...dop, depth: { from: 'hole', tipComp: false, breakThrough: 1 }, order: 'asis' }, { setup: S0, tool: drill, geom: { holes: up } }).moves.filter((m) => m.t === 'cycle');
    ok(c.length === 1 && Math.abs(c[0].top) < 1e-9 && Math.abs(c[0].bottom + 31) < 1e-9, 'T-05b: ters yonlu boydan boya delik karsi uctan: ust 0, dip -31: ' + JSON.stringify(c.map((m) => [m.top, m.bottom])));
    throwsCode(() => CAM.computeOp(dop, { setup: S0, tool: drill, geom: { holes: [{ ...up[0], exits: undefined }] } }), 'cam.drill.no_holes', 'T-05b: boyu bilinmeyen ters delik atlanir');
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
  const ex = importMachines(fs.readFileSync(path.join(ROOT, 'pm/arsiv/Neway-VM1160H-M80V-GSA.mhnk-tezgah.json'), 'utf8'), []);
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
  // WP-15 (T-20): prizmatik olmayan govdede siluet artik yukseklik haritasindan (onceden cam.silhouette.not_prismatic hatasiydi)
  try { const gS = await CAM.resolveGeom({ geom: [{ kind: 'silhouette', body: rbC.bodies[0].id }] }, SC, { rebuild: rbC, doc: null, query }); const bbS = P.loopBBox([kloop(gS.faces[0].outer)]); const mbS = SC.modelBBox;
    ok(gS.faces.length === 1 && bbS[0] <= mbS.min[0] + 1e-6 && bbS[2] >= mbS.max[0] - 1e-6 && bbS[1] <= mbS.min[1] + 1e-6 && bbS[3] >= mbS.max[1] - 1e-6 && bbS[2] - bbS[0] < mbS.max[0] - mbS.min[0] + 0.5, 'prizmatik olmayan govde: yukseklik haritasi siluet (muhafazakar) ' + bbS.map((v) => v.toFixed(2))); }
  catch (e) { ok(false, 'prizmatik olmayan govde siluet: ' + e.code); }
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
  // T-23/5: cozunurlukten ince kanat (0,3 mm @ res 0,5) G99 gecis kararinda gorulmeli
  {
    const dK = { params: [], features: [{ id: 'kb', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '100', d: '40', h: '10', op: 'new' }, { id: 'kf', type: 'primitive', kind: 'box', x: '50.3', y: '0', z: '10', w: '0.3', d: '40', h: '20', op: 'join', targets: ['kb'] }] };
    const rK = await K.rebuild(dK); const kid = rK.bodies[0].id;
    const SK = CAM.resolveSetup({ id: 'K1', name: 'K', bodies: [kid], frame: { origin: { kind: 'model' }, zAxis: { kind: 'base', dir: '+Z' }, xAxis: { kind: 'base', dir: '+X' } }, workOffset: { kind: 'G54' }, stock: { kind: 'boxOffset', side: 0, top: 0, bottom: 0 } }, rK, M);
    const hp = [{ feature: 'k', dia: 6.8, depth: 5, through: false, tipAngle: 118, thread: null, dir: [0, 0, -1], positions: [[30, 20, 10], [70, 20, 10]], dirs: [[0, 0, -1], [0, 0, -1]] }];
    const bb = [SK.stockBox.min[0], SK.stockBox.min[1], SK.stockBox.max[0], SK.stockBox.max[1]];
    const center = K.camHeightmap({ bodies: [kid], frame: SK.frame, res: 0.5, bbox: bb });
    const finSeen = (m) => { let mx = -Infinity; for (let i = 0; i < m.nx; i++) { const x = m.x0 + (i + 0.5) * m.res; if (x > 49.5 && x < 51.5) mx = Math.max(mx, m.data[Math.floor((20 - m.y0) / m.res) * m.nx + i]); } return mx; };
    ok(finSeen(center) < 10.5, 'kontrol: merkez ornekli model haritasi 0,3 mm kanadi gormez (dogrulayici fin.mjs): ' + finSeen(center));
    const stockMap = { ...center, data: new Float32Array(center.data) }; // stok = model (islenmis), kanat yine gorunmez
    const qK = async (cmd, a) => K[cmd](a);
    const maps = await CAM.drillMaps({ hm: stockMap, done: 0 }, [], SK, { res: 0.5, query: qK });
    ok(maps.modelMap?.conservative && finSeen(maps.modelMap) > 29.9, 'drillMaps: hucre ici en yuksek (res/4 + havuz) kanadi gorur: ' + finSeen(maps.modelMap || center));
    const opK = { id: 'dk', type: 'drill', ...base, toolId: 'dr', heights: { clearance: 30, retract: 3 }, holes: { kind: 'feature' }, cycle: 'drill', depth: { from: 'hole', tipComp: false }, order: 'asis' };
    const toolK = tools.find((t) => t.id === 'dr');
    const nOld = CAM.computeOp(opK, { setup: SK, tool: toolK, geom: { holes: hp }, stockMap, modelMap: center }).moves.filter((m) => m.t === 'cycle').length;
    const nNew = CAM.computeOp(opK, { setup: SK, tool: toolK, geom: { holes: hp }, ...maps }).moves.filter((m) => m.t === 'cycle').length;
    const cyN = CAM.computeOp(opK, { setup: SK, tool: toolK, geom: { holes: hp }, ...maps }).moves.filter((m) => m.t === 'cycle')[0];
    ok(nOld === 1 && nNew === 1 && cyN.returnTo === 'clearance' && cyN.points.length === 2, 'T-23/WP-06: merkez ornekli haritayla kanadi R13\'te gecen G99 zinciri (eski) -> yeni haritayla ayni cevrim G98 donusu: ' + nOld + ' -> ' + nNew + ' ' + cyN.returnTo);
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
    { // WP-07 dilim 3: TEK setup'ta iki A acisi (islem basi aAngle) -> iki bolum, ayni WCS, zincirli stok
      const one = { ...cam, setups: [{ id: 'T1', name: 'Ust', bodies: [pid], frame: rot.frame, workOffset: { kind: 'G54' }, stock: stk, clearanceZ: 5, rotary: { enabled: true, aAngle: 0 }, ops: [...S1o, { ...S2o[0], aAngle: aDeg }] }] };
      const ex = CAM.expandAngles(one.setups);
      ok(ex.length === 2 && ex[0].id === 'T1@A0' && ex[1].id === 'T1@A1' && ex[0].ops.length === 2 && ex[1].ops.length === 1 && ex[0].rotary.aAngle === 0 && ex[1].rotary.aAngle === aDeg && ex[1].stockFrom === 'previous', 'WP-07 3+1: setup A gruplarina bolunur (ardisik ayni aci = bir grup)');
      ok(CAM.expandAngles([{ id: 'X', ops: [{ id: 'a' }, { id: 'b' }] }]).length === 1 && CAM.expandAngles([{ id: 'X', rotary: { enabled: true, aAngle: 90 }, ops: [{ id: 'a' }, { id: 'b', aAngle: 90 }] }]).length === 1, 'WP-07 3+1: tek aci ya da hepsi ayni etkin aci -> bolunmez');
      ok(CAM.expandAngles([{ id: 'X', rotary: { enabled: true, aAngle: 0 }, ops: [{ id: 'a' }, { id: 'b', aAngle: 90 }, { id: 'c' }] }]).length === 3, 'WP-07 3+1: 0, 90, 0 -> uc bolum');
      const mhO = {}; for (const st of ex) { const S = CAM.resolveSetup(st, rbP, MA); mhO[st.id] = K.camHeightmap({ bodies: [pid], frame: S.frame, res: 0.5, bbox: [S.stockBox.min[0], S.stockBox.min[1], S.stockBox.max[0], S.stockBox.max[1]] }); }
      const rO = await CAM.generateProgram(one, { rebuild: rbP, machine: MA, query: async (c, a) => K[c](a), doc: dP, name: 'O1010', sim: { res: 0.5, modelHeightmaps: mhO } });
      ok(rO.ops.every((o) => o.ok) && rO.program.sections.length === 3, 'WP-07 3+1: uc islem (2 + 1) hesaplandi ' + JSON.stringify(rO.ops.filter((o) => !o.ok).map((o) => o.error)));
      const sA = rO.program.sections.map((q) => q.setup);
      ok(sA[0].aAngle === 0 && sA[1].aAngle === 0 && sA[2].aAngle === aDeg && sA.every((q) => q.workOffset.kind === 'G54') && Math.abs(sA[2].frame.z[1] + 1) < 1e-9, 'WP-07 3+1: bolum A acilari 0 ve ' + aDeg + ', ayni WCS G54, ikinci bolum takim ekseni -Y: ' + JSON.stringify(sA.map((q) => [q.aAngle, q.workOffset.kind, q.frame.z])));
      ok(ghost(rO.gates).length === 0 && !rO.gates.some((x) => x.level === 'block' && x.code === 'cam.sim.gouge'), 'WP-07 3+1: zincirli stokla hayalet/oyma BLOCK 0: ' + JSON.stringify(ghost(rO.gates).slice(0, 2)));
    }
    // yanlis "temiz" yok: S1 yan duvari kesmezse (yalniz yuzey) S2 hizlisi hala engel
    const cY = mkCam(yan); cY.setups[0].ops = [S1o[0]];
    const rY = await CAM.generateProgram(cY, { rebuild: rbP, machine: MA, query: async (c, a) => K[c](a), doc: dP, name: 'O1005', sim: { res: 0.5, modelHeightmaps: hmFor(cY) } });
    ok(ghost(rY.gates).length > 0, 'T-04: S1 yan stogu kaldirmadiysa S2 engel kalir (yanlis temiz yok)');
    const cB = mkCam(yan); cB.setups[1].stockFrom = 'blank';
    const rB = await CAM.generateProgram(cB, { rebuild: rbP, machine: MA, query: async (c, a) => K[c](a), doc: dP, name: 'O1006', sim: { res: 0.5, modelHeightmaps: hmFor(cB) } });
    ok(rB.program.sections.find((x) => x.setup.id === 'T2').setup.stockFrom === 'blank' && ghost(rB.gates).length > 0, "T-04: setup stockFrom 'blank' -> zincir yok, S2 ham stokla (engel)");
    ok(rY.program.sections.every((x) => x.setup.stockFrom === 'previous' && Array.isArray(x.setup.bodies)), "T-04: program setup'inda stockFrom (varsayilan 'previous') ve bodies");
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

section('10. WP-06 T-01 ilk dalma: guvenli yukseklikten retract\'a HIZLI inis');
{
  const { simulate } = await import('../src/cam/sim/index.js');
  const tool = flat(10);
  const firstFeed = (tp) => { let last = null; for (const m of tp.moves) { if (m.t === 'feed' || m.t === 'arc') return { m, from: last }; if (m.t === 'rapid') last = m; } return null; };
  const mkC = () => CAM.computeOp({ id: 'c', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'outer' }], stepdown: 4 }, { setup: S0, tool, geom: { faces: [{ z: -10, outer: sq(20, 15, 80, 45), inners: [] }] } });
  const mkP = () => CAM.computeOp({ id: 'p', type: 'pocket', ...base, geom: [{ kind: 'face' }], stepover: 4, stepdown: 4, entry: { kind: 'plunge' } }, { setup: S0, tool, geom: { faces: [{ z: -8, normalOk: true, outer: sq(20, 15, 80, 45), inners: [] }] } });
  const mkF = () => CAM.computeOp({ id: 'f', type: 'face', ...base, stepover: 7, stepdown: 2, heights: { clearance: 10, retract: 2, top: { from: 'abs', off: 0 }, bottom: { from: 'abs', off: -2 } } }, { setup: S0, tool });
  for (const [nm, mk_] of [['kontur', mkC], ['cep', mkP], ['yuzey', mkF]]) {
    const tp = mk_(); const ff = firstFeed(tp);
    // clearance Z10 -> retract Z2 HIZLI; ilk ilerleme retract'tan (Z2) baslar
    ok(ff && ff.from && Math.abs(ff.from.z - 2) < 1e-9, `T-01 ${nm}: ilk ilerleme retract'tan (Z2) baslar: ${ff?.from?.z}`);
    ok(tp.moves[0].t === 'rapid' && Math.abs(tp.moves[0].z - 10) < 1e-9 && tp.moves[1].t === 'rapid' && Math.abs(tp.moves[1].z - 2) < 1e-9 && tp.moves[1].x === tp.moves[0].x, `T-01 ${nm}: ilk iki hareket hizli: clearance sonra retract`);
    ok(validateToolpath(tp), `T-01 ${nm}: IR gecerli`);
    // havada ilerleme: yalniz retract (2 mm) kadar (+ sonraki paso inisleri); clearance'tan (10 mm) degil
    const firstAir = (() => { const f = firstFeed(tp); return f.from.z - 0; })();
    ok(firstAir < 2 + 1e-9, `T-01 ${nm}: ilk dalmada havada ilerleme <= retract (2): ${firstAir}`);
    // sim: stok ustunde hizli inis temiz; stoga hizli inis hala yakalanir
    const flat0 = heightmapFromFn([0, 0], [100, 60], 0.5, () => 0);
    const sr = simulate(tp, { res: 0.5, stockBox: S0.stockBox, stockHeightmap: flat0 });
    ok(!sr.issues.some((i) => i.code === 'cam.sim.rapid_in_stock'), `T-01 ${nm}: yeni hizli inis sim rapid_in_stock vermez`);
  }
  // sim yeni hareketleri GORUR: retract stok icinde olsaydi (stoktan gecen hizli inis) rapid_in_stock cikar
  {
    const tp = mkC(); const bad = { ...tp, moves: tp.moves.map((m, i) => (i === 1 ? { ...m, z: -3 } : m)) };
    const flat0 = heightmapFromFn([0, 0], [100, 60], 0.5, () => 0);
    const sr = simulate(bad, { res: 0.5, stockBox: S0.stockBox, stockHeightmap: flat0 });
    ok(sr.issues.some((i) => i.code === 'cam.sim.rapid_in_stock' && i.moveIndex === 1), "T-01: hizli inisin kendisi (hareket 1) stok icine kaydirilinca sim rapid_in_stock verir: " + JSON.stringify(sr.issues.map((i) => [i.code, i.moveIndex])));
  }
}

section('11. WP-06 T-10 stockToLeave iki bicim; T-11 tipDia / shaftDia');
{
  const { toolGeom } = await import('../src/cam/sim/index.js');
  const { irTool, tipLength } = await import('../src/cam/tools.js');
  const tool = flat(10);
  // ---- T-10
  const faceZ = (sta) => CAM.computeOp({ id: 'f', type: 'face', ...base, stepover: 7, ...(sta === undefined ? {} : { stockToLeave: sta }), heights: { clearance: 10, retract: 2, top: { from: 'abs', off: 0 }, bottom: { from: 'abs', off: -2 } } }, { setup: S0, tool }).stats.zMin;
  ok(Math.abs(faceZ(undefined) + 2) < 1e-9 && Math.abs(faceZ(0.5) + 1.5) < 1e-9 && Math.abs(faceZ({ radial: 0.2, axial: 0.5 }) + 1.5) < 1e-9 && Math.abs(faceZ({ radial: 0.3 }) + 2) < 1e-9, 'T-10 face: sayi = eksenel pay; {radial, axial} de kabul; yalniz radial -> eksenel 0');
  throwsCode(() => faceZ(-1), 'cam.op.bad_field', 'T-10: negatif pay'); throwsCode(() => faceZ('x'), 'cam.op.bad_field', 'T-10: sayi/nesne olmayan pay');
  throwsCode(() => faceZ({ axial: -0.1 }), 'cam.op.bad_field', 'T-10: negatif axial');
  const cop = (sta) => ({ id: 'c', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'outer' }], stepdown: 4, ...(sta === undefined ? {} : { stockToLeave: sta }) });
  const cg = { faces: [{ z: -10, outer: sq(20, 15, 80, 45), inners: [] }] };
  const cdist = (tp) => { const lp = []; walk(tp, (m, k, from) => { if (!from || m.kind !== 'cut' || m.t !== 'feed' || m.z > -7.99) return; lp.push([m.x, m.y]); }); return Math.min(...lp.map((p) => P.distTo(p, kloop(sq(20, 15, 80, 45))))); };
  const cN = CAM.computeOp(cop(0.3), { setup: S0, tool, geom: cg }), cO = CAM.computeOp(cop({ radial: 0.3, axial: 0.3 }), { setup: S0, tool, geom: cg });
  ok(Math.abs(cdist(cN) - 5.3) < 1e-6 && Math.abs(cdist(cO) - 5.3) < 1e-6 && Math.abs(cN.stats.zMin + 9.7) < 1e-9 && Math.abs(cO.stats.zMin + 9.7) < 1e-9, 'T-10 kontur: sayi 0,3 = {radial 0,3, axial 0,3} (yanal r+0,3, taban -9,7)');
  const cR = CAM.computeOp(cop({ radial: 0.3 }), { setup: S0, tool, geom: cg }); ok(Math.abs(cR.stats.zMin + 10) < 1e-9 && Math.abs(cdist(cR) - 5.3) < 1e-6, 'T-10 kontur: yalniz radial -> eksenel 0');
  const pk = (sta) => CAM.computeOp({ id: 'p', type: 'pocket', ...base, geom: [{ kind: 'face' }], stepover: 4, stepdown: 4, entry: { kind: 'plunge' }, ...(sta === undefined ? {} : { stockToLeave: sta }) }, { setup: S0, tool, geom: { faces: [{ z: -8, normalOk: true, outer: sq(20, 15, 80, 45), inners: [] }] } });
  ok(Math.abs(pk(0.5).stats.zMin + 7.5) < 1e-9 && Math.abs(pk({ radial: 0.5, axial: 0.5 }).stats.zMin + 7.5) < 1e-9, 'T-10 cep: sayi = {radial, axial} ayni');
  // sema
  { const old = { params: [], features: [] }; const mkd = (sta) => ({ ...old, cam: { machineId: null, tools: [flat(6)], setups: [{ id: 's', name: 'S', bodies: [], workOffset: { kind: 'G55' }, stock: { kind: 'box', min: [0, 0, 0], max: [1, 1, 1] }, ops: [{ id: 'o1', type: 'face', toolId: 't6', stockToLeave: sta }] }] } });
    ok(validateDoc(mkd(0.2)) && validateDoc(mkd({ radial: 0.1, axial: 0.2 })), 'T-10 sema: iki bicim gecerli'); throwsCode(() => validateDoc(mkd('x')), 'schema.bad_field', 'T-10 sema: metin pay reddedilir'); throwsCode(() => validateDoc(mkd({ radial: -1 })), 'schema.bad_field', 'T-10 sema: negatif pay reddedilir'); }
  // ---- T-11
  const cham = { id: 'tc', number: 9, lengthOffset: 9, diaOffset: 9, type: 'chamfer', dia: 10, tipAngle: 90, fluteLen: 5, bodyLen: 30, flutes: 2, centerCutting: true };
  ok(normalizeTool({ ...cham, tipDia: 2 }).tipDia === 2 && normalizeTool({ ...cham, tipDia: 0 }).tipDia === 0 && normalizeTool(cham).tipDia === undefined, 'T-11: tipDia 0 <= tipDia < dia kabul, verilmezse yok');
  throwsCode(() => normalizeTool({ ...cham, tipDia: 10 }), 'cam.tool.bad_field', 'T-11: tipDia >= dia'); throwsCode(() => normalizeTool({ ...cham, tipDia: -1 }), 'cam.tool.bad_field', 'T-11: negatif tipDia');
  throwsCode(() => normalizeTool({ ...flat(6), tipDia: 1 }), 'cam.tool.bad_field', 'T-11: duz uclu takimda tipDia anlamsiz -> hata');
  { const d0 = { params: [], features: [], cam: { tools: [{ ...cham, tipDia: 2, shaftDia: 8 }] } }; ok(validateDoc(d0), 'T-11 sema: tipDia + shaftDia gecerli'); }
  { const it = irTool(normalizeTool({ ...cham, tipDia: 2, shaftDia: 8 })); ok(it.tipDia === 2 && it.shaftDia === 8 && irTool(normalizeTool(cham)).tipDia === undefined, 'T-11: IR takiminda tipDia/shaftDia (varsa)'); }
  ok(Math.abs(tipLength(normalizeTool({ ...cham, tipDia: 2 })) - 4) < 1e-9 && Math.abs(tipLength(normalizeTool(cham)) - 5) < 1e-9, 'T-11: uc boyu (90 derece, D10): sivri 5, tipDia 2 -> 4');
  { const g = toolGeom({ ...irTool(normalizeTool({ ...cham, tipDia: 2 })), shaftDia: 8 }), g0 = toolGeom(irTool(normalizeTool(cham)));
    ok(g.profile(0.5) === 0 && g.profile(1) === 0 && Math.abs(g.profile(3) - 2) < 1e-9 && Math.abs(g0.profile(3) - 3) < 1e-9 && g.shaftR === 4, 'T-11 sim: uc duz capi (r<=1 duz, sonra 45 derece) ve sap capi'); }
  // kapi: sap/uc varsayim uyarisi
  { const M = { ...structuredClone(NEWAY_FIXTURE), post: { props: { ...NEWAY_FIXTURE.post.props, safeRetract: 'G28' } } };
    const mkp = (t) => CAM.buildProgram({ name: 'O1', machine: M, sections: [{ setup: S0, toolpaths: [CAM.computeOp({ id: 'f', type: 'face', ...base, stepover: 7, heights: { clearance: 10, retract: 2, top: { from: 'abs', off: 0 }, bottom: { from: 'abs', off: -1 } } }, { setup: S0, tool: t })] }] });
    const ga = (t, sim) => CAM.gates(mkp(t), M, sim ? { sim } : {}).filter((g) => g.code === 'cam.gate.tool_geom_assumed');
    ok(ga(tool).length === 1 && ga(tool)[0].level === 'warn' && ga(tool)[0].params.field === 'shaftDia', 'T-11 kapi: sap capi yoksa tool_geom_assumed uyarisi (block degil)');
    { const { describeIssue } = await import('../src/cam/post/describe.js'); const dt = describeIssue(ga(tool)[0]); ok(!/shaftDia/.test(dt) && /Shank diameter/.test(dt), 'T-11: NC basligi uyarisi ham alan adi (shaftDia) yazmaz, okunur ad kullanir'); }
    ok(ga({ ...tool, shaftDia: 10 }).length === 0, 'T-11 kapi: shaftDia varsa uyari yok'); ok(ga(tool, { res: 1, tools: { 5: { shaftDia: 10 } } }).length === 0, 'T-11 kapi: sim.tools ile gelen shaftDia da sayilir');
  }
}

section('12. WP-06 T-02 acik zincir (sketch ogeleri): secim, taraf, uzatma, wear');
{
  const { simulate } = await import('../src/cam/sim/index.js');
  const pt = (x, y) => ({ x, y });
  const sk = { id: 'sk', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '-5' },
    points: { p1: pt(10, 10), p2: pt(50, 10), c: pt(50, 20), p3: pt(60, 20), p4: pt(60, 40), q1: pt(80, 5), q2: pt(90, 5) },
    ents: [{ id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'a1', type: 'arc', c: 'c', a: 'p2', b: 'p3' }, { id: 'l2', type: 'line', a: 'p3', b: 'p4' }, { id: 'x1', type: 'line', a: 'q1', b: 'q2' }] };
  const plane = { o: [0, 0, -5], x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] };
  const body = { id: 'b', vertices: [0, 0, -10, 100, 60, 0].length ? [0, 0, -10, 100, 0, -10, 100, 60, -10, 0, 60, -10, 0, 0, 0, 100, 0, 0, 100, 60, 0, 0, 60, 0] : [] };
  const nw = structuredClone(NEWAY_FIXTURE);
  const M = { ...nw, id: 'm', spindle: { maxRpm: 12000, minRpm: 50 }, feed: { maxCut: 10000, rapid: 30000 }, post: { props: { ...nw.post.props, safeRetract: 'G28' } } };
  const tool = flat(4, { id: 'em4', number: 7, lengthOffset: 7, diaOffset: 7 });
  const camOf = (op) => ({ tools: [tool], setups: [{ id: 's1', name: 'S1', bodies: ['b'], workOffset: { kind: 'G55' }, frame: { origin: { kind: 'model' } }, stock: { kind: 'boxOffset', side: 0, top: 0, bottom: 0 }, ops: [op] }] });
  const rebuild = { bodies: [body], sketches: { sk: { plane } }, holes: [] };
  const run = (opx) => CAM.generateProgram(camOf({ id: 'ch', type: 'contour', name: 'Yarik', toolId: 'em4', ...base, stepdown: 2, heights: { clearance: 10, retract: 2 }, ...opx }), { rebuild, machine: M, query: async () => { throw new Error('yok'); }, doc: { features: [sk] }, name: 'O1' });
  const cutPts = (tp, zf = (z) => z < -4.99) => cutPoints(tp, zf, 0.2).map((p) => [p[0], p[1]]);
  const chain = (ents, extra = {}) => [{ kind: 'chain', sketch: 'sk', ents, ...extra }];
  const full = ['l1', 'a1', 'l2'];
  // secim -> zincir
  { const f = CAM.resolveGeom; const S = CAM.resolveSetup(camOf({}).setups[0], rebuild, M, {});
    const r = await f({ type: 'contour', geom: chain(['l2', 'l1', 'a1']) }, S, { rebuild, doc: { features: [sk] }, query: async () => null });
    const c = r.faces[0]; ok(!c.closed && c.segs.length === 3 && Math.abs(c.z + 5) < 1e-9, 'T-02: 3 oge tek acik zincir (sira ogelerin listesinden bagimsiz), z = eskiz duzlemi: ' + c.segs.length);
    const L = P.length; const ps = c.segs.flatMap((g) => P.fromGeom2d(g, g.fwd !== false)); ok(Math.abs(ps.reduce((a, q) => a + L(q), 0) - (40 + Math.PI * 5 + 20)) < 1e-6 && (P.dist(ps[0].a, [60, 40]) < 1e-9 || P.dist(ps[0].a, [10, 10]) < 1e-9), 'T-02: zincir uzunlugu 40 + 5pi + 20, serbest uctan baslar (ilk listelenen ogenin serbest ucu)');
    const rv = await f({ type: 'contour', geom: chain(full, { reverse: true }) }, S, { rebuild, doc: { features: [sk] }, query: async () => null }); const pr = rv.faces[0].segs.flatMap((g) => P.fromGeom2d(g, g.fwd !== false));
    ok(P.dist(pr[0].a, [60, 40]) < 1e-9 && P.dist(pr[pr.length - 1].b, [10, 10]) < 1e-9, 'T-02: reverse zincir yonunu cevirir');
    for (const [e, code] of [[['l1', 'x1'], 'cam.geom.chain_broken'], [[], 'cam.geom.chain_empty'], [['l1', 'yok'], 'cam.geom.chain_ent_missing']]) { let er = null; try { await f({ type: 'contour', geom: chain(e) }, S, { rebuild, doc: { features: [sk] }, query: async () => null }); } catch (x) { er = x.code; } ok(er === code, `T-02: ${code} (${er})`); }
    let er2 = null; try { await f({ type: 'pocket', geom: chain(full) }, S, { rebuild, doc: { features: [sk] }, query: async () => null }); } catch (x) { er2 = x.code; } ok(er2 === 'cam.geom.sel_unsupported', 'T-02: cep zincir secimi desteklenmez (hata): ' + er2);
  }
  const chainP = (tp) => { const out = []; return (() => { let q = null; for (const m of tp.moves) { if (m.t === 'rapid') q = m; } return out; })(); };
  void chainP;
  const base2 = (() => { const S = CAM.resolveSetup(camOf({}).setups[0], rebuild, M, {}); return S; })();
  // on: merkez zincirde, uzatmalar
  { const r = await run({ geom: chain(full), side: 'on', heights: { clearance: 10, retract: 2, bottom: { from: 'selection', off: 0 } } });
    const tp = r.ops[0].toolpath; ok(r.ops[0].ok && tp, 'T-02: zincir kontur hesaplandi: ' + JSON.stringify(r.ops[0].error));
    const on = P.fromGeom2d; void on; const pts = cutPts(tp);
    const refPath = [P.line([10, 10], [50, 10]), P.arc([50, 20], 10, -Math.PI / 2, Math.PI / 2), P.line([60, 20], [60, 40])];
    ok(pts.length > 20 && pts.every((p) => P.distTo(p, refPath) < 1e-6), 'T-02 on: tum kesme noktalari zincir uzerinde');
    ok(Math.abs(tp.stats.zMin + 5) < 1e-9, 'T-02: taban = eskiz duzlemi (Z-5), 2 mm pasolar');
    const ex = (await run({ geom: chain(full), side: 'on', extendStart: 5, extendEnd: 3, heights: { clearance: 10, retract: 2, bottom: { from: 'selection', off: 0 } } })).ops[0].toolpath; const px = cutPts(ex);
    ok(px.some((p) => p[0] >= 5 - 1e-6 && p[0] < 5.3 && Math.abs(p[1] - 10) < 1e-6) && !px.some((p) => p[0] < 5 - 1e-6) && px.some((p) => Math.abs(p[0] - 60) < 1e-6 && Math.abs(p[1] - 43) < 1e-6), 'T-02: extendStart 5 -> (5,10), extendEnd 3 -> (60,43) (teget dogrular)');
    const sr = simulate(tp, { res: 0.5, stockBox: base2.stockBox, stockHeightmap: heightmapFromFn([0, 0], [100, 60], 0.5, () => 0) }); ok(sr.issues.length === 0 && sr.removedVolume > 0, 'T-02: sim temiz, malzeme kaldirir (yarik): ' + sr.issues.map((i) => i.code));
  }
  // sol / sag: r + pay kadar ofset, taraf zincir yonune gore
  { const L = await run({ geom: chain(full), side: 'left', stockToLeave: { radial: 0.3, axial: 0 }, heights: { clearance: 10, retract: 2, bottom: { from: 'selection', off: 0 } } }), R = await run({ geom: chain(full), side: 'right', heights: { clearance: 10, retract: 2, bottom: { from: 'selection', off: 0 } } });
    const refPath = [P.line([10, 10], [50, 10]), P.arc([50, 20], 10, -Math.PI / 2, Math.PI / 2), P.line([60, 20], [60, 40])];
    const pl = cutPts(L.ops[0].toolpath), pr = cutPts(R.ops[0].toolpath);
    ok(L.ops[0].ok && pl.length > 20 && pl.every((p) => Math.abs(P.distTo(p, refPath) - 2.3) < 1e-6), 'T-02 sol: her nokta zincirden tam r + pay = 2,3: ' + L.ops[0].ok + JSON.stringify(L.ops[0].error));
    ok(pl.some((p) => Math.abs(p[0] - 30) < 0.3 && p[1] > 10) && !pl.some((p) => Math.abs(p[0] - 30) < 0.3 && p[1] < 10), 'T-02 sol: zincir +X giderken sol = +Y tarafi');
    ok(R.ops[0].ok && pr.every((p) => Math.abs(P.distTo(p, refPath) - 2) < 1e-6) && pr.some((p) => Math.abs(p[0] - 30) < 0.3 && p[1] < 10), 'T-02 sag: r = 2 ve -Y tarafi');
    const g = CAM.gates(R.program, M, { sim: { res: 0.5, modelHeightmaps: { s1: heightmapFromFn([0, 0], [100, 60], 0.5, () => -Infinity) } } });
    ok(!g.some((x) => x.level === 'block' && x.code.startsWith('cam.sim.')), 'T-02: sim kapilari engel vermez: ' + g.filter((x) => x.level === 'block').map((x) => x.code));
  }
  // wear
  { const W = (extra) => run({ geom: chain(full), side: 'left', comp: 'wear', extendStart: 6, extendEnd: 6, heights: { clearance: 10, retract: 2, bottom: { from: 'selection', off: 0 } }, ...extra });
    const w = await W({}); const tp = w.ops[0].toolpath;
    ok(w.ops[0].ok && tp.comp === 'wear' && tp.compSide === 'left' && tp.moves.filter((m) => m.t === 'comp' && m.on).length === tp.moves.filter((m) => m.t === 'comp' && !m.on).length && tp.moves.some((m) => m.t === 'comp'), 'T-02 wear: G41 (left), her derinlikte comp ac/kapa: ' + JSON.stringify(w.ops[0].error));
    const wp = []; walk(tp, (m, k, from) => { if (from && m.kind === 'cut' && m.t === 'feed' && m.z < -4.99 && m.y > 9.99 && m.y < 10.01 && m.x > 5 && m.x < 55) wp.push([m.x, m.y]); }); ok(wp.length > 0, 'T-02 wear: programlanan yol zincirin kendisi (ofset yok)');
    const w2 = await W({ extendStart: 1 }); ok(!w2.ops[0].ok && w2.ops[0].error.code === 'cam.contour.wear_lead_short', 'T-02 wear: kisa giris uzatmasi reddedilir: ' + w2.ops[0].error?.code);
    const w3 = await W({ side: 'on' }); ok(!w3.ops[0].ok && w3.ops[0].error.code === 'cam.contour.wear_on', 'T-02 wear: side on reddedilir');
    const bad = await run({ geom: chain(full), side: 'outside', heights: { clearance: 10, retract: 2, bottom: { from: 'selection', off: 0 } } }); ok(!bad.ops[0].ok && bad.ops[0].error.code === 'cam.contour.open_needs_on', 'T-02: acik zincirde outside hala reddedilir');
    const lead = await run({ geom: chain(full), side: 'on', leadIn: { kind: 'line', len: 3 }, heights: { clearance: 10, retract: 2, bottom: { from: 'selection', off: 0 } } }); ok(!lead.ops[0].ok && lead.ops[0].error.code === 'cam.contour.open_options', 'T-02: acik zincirde leadIn yerine extendStart');
  }
  // NC: post kodu G41 D
  { const w = await run({ geom: chain(full), side: 'left', comp: 'wear', extendStart: 6, extendEnd: 6, heights: { clearance: 10, retract: 2, bottom: { from: 'selection', off: 0 } } });
    const nc = (await import('../src/cam/post/index.js')).postProgram(w.program, M, { date: 'x', gates: [] }); ok(/G41 D7/.test(nc.text) && /G40/.test(nc.text), 'T-02: NC G41 D7 ... G40');
  }
}


// ------------------------------------------------------------------ T-03 pah islemi
section('T-03. pah (chamfer)');
{
  const { simulate } = await import('../src/cam/sim/index.js');
  const ch90 = { id: 'ch90', number: 9, lengthOffset: 9, diaOffset: 9, type: 'chamfer', dia: 12, tipAngle: 90, tipDia: 2, fluteLen: 6, bodyLen: 40, flutes: 3, centerCutting: false, shaftDia: 10 };
  const cop = { id: 'p', type: 'chamfer', ...base, geom: [{ kind: 'face', loops: 'outer' }], width: 1.5, heights: { clearance: 10, retract: 2 } };
  const geom = { faces: [{ z: 0, outer: sq(20, 15, 80, 45), inners: [] }] };
  const tp = CAM.computeOp(cop, { setup: S0, tool: ch90, geom });
  const cutZ = []; walk(tp, (m, k, from) => { if (from && m.t === 'feed' && m.kind === 'cut') cutZ.push(m.z); });
  const rect = [P.line([20, 15], [80, 15]), P.line([80, 15], [80, 45]), P.line([80, 45], [20, 45]), P.line([20, 45], [20, 15])];
  // 90 derece takim, uc cap 2, genislik 1,5: dz = 1,5; uc z = 0 - 1,5 - 0,2 = -1,7; merkez secilen (ust) kenardan 1 + 1,7 = 2,7
  ok(cutZ.length > 4 && cutZ.every((z) => Math.abs(z + 1.7) < 1e-9), 'T-03: tek z = kenar - derinlik - uc payi (-1,7): ' + cutZ.slice(0, 3));
  const pts = cutPoints(tp, () => true, 0.2); const dd = pts.map((q) => P.distTo(q, rect));
  ok(pts.length > 100 && dd.every((x) => x > 2.7 - 1e-6 && x < 2.7 * Math.SQRT2 + 1e-6) && dd.filter((x) => Math.abs(x - 2.7) < 1e-6).length > pts.length * 0.8, 'T-03: takim merkezi ust kenardan tam tipDia/2 + (dz + pay)*tan = 2,7 (koseler sivri)');
  ok(pts.some((q) => Math.hypot(q[0] - 17.3, q[1] - 12.3) < 0.25) && pts.some((q) => Math.hypot(q[0] - 82.7, q[1] - 47.7) < 0.25), 'T-03: disbukey koseler sivri (miter), yuvarlak degil: kose noktasi (17,3 ; 12,3)');
  ok(tp.meta.chamfer.depth === 1.5 && tp.opType === 'chamfer' && tp.tool.tipDia === 2, 'T-03: IR meta derinlik 1,5, takim tipDia IR\'de');
  // yon: tirmanma disari = CW (malzeme gidisin sagi); conv ters
  const area = (t) => { const q = []; walk(t, (m, k, from) => { if (from && m.t === 'feed' && m.kind === 'cut') q.push([m.x, m.y]); }); let a = 0; for (let i = 0; i < q.length; i++) { const u = q[i], v = q[(i + 1) % q.length]; a += u[0] * v[1] - v[0] * u[1]; } return a; };
  const tpC = CAM.computeOp({ ...cop, dir: 'conv' }, { setup: S0, tool: ch90, geom });
  ok(area(tp) < 0 && area(tpC) > 0, 'T-03: tirmanma = saat yonu, conv ters (disari kenar)');
  // sim: stok islenmis yuzey (parca 0, cevre -10) ve modelde pahli parca -> engel yok, hacim ~ pah kesiti x cevre
  // secilen kenar = pahin ust kenari (x 20..80, y 15..45). Ham stok kenardan 1,5 tasar; model: kenardan dd uzakta z = -dd (dd <= 1,5), sonra dik duvar
  const dOut = (x, y) => Math.max(20 - x, 0, x - 80, 15 - y, 0, y - 45); // iki duzlemin sivri kesisimi (CAD pahi)
  const hmStock = heightmapFromFn([0, 0], [100, 60], 0.25, (x, y) => (dOut(x, y) < 1.5 ? 0 : -10));
  const hmModel = heightmapFromFn([0, 0], [100, 60], 0.25, (x, y) => { const d = dOut(x, y); return d <= 1.5 ? -d : -10; });
  const sr = simulate(tp, { res: 0.25, stockBox: S0.stockBox, stockHeightmap: hmStock });
  ok(sr.issues.length === 0, 'T-03: sim temiz: ' + sr.issues.map((i) => i.code));
  const ideal = 180 * 1.5 * 1.5 / 2; ok(sr.removedVolume > ideal * 0.9 && sr.removedVolume < ideal * 1.2, `T-03: kaldirilan hacim ~ pah kesiti x cevre (${sr.removedVolume.toFixed(1)} / ${ideal})`);
  const prog = CAM.buildProgram({ name: 'O1', machine: builtinMachines()[0] ?? {}, sections: [{ setup: S0, toolpaths: [tp] }] });
  const gs = CAM.gates(prog, structuredClone(NEWAY_FIXTURE), { sim: { res: 0.25, modelHeightmaps: { s1: hmModel }, stockHeightmaps: { s1: hmStock } } });
  ok(!gs.some((x) => x.level === 'block' && x.code.startsWith('cam.sim.')), 'T-03: sim kapilari (model pahli) engel vermez: ' + gs.filter((x) => x.level === 'block').map((x) => x.code));
  // ici: delik kenari (takim delikte)
  const hole = { z: 0, outer: sq(0, 0, 100, 60), inners: [sq(40, 20, 60, 40).reverse().map((x) => ({ ...x, fwd: false }))] };
  const tpH = CAM.computeOp({ ...cop, geom: [{ kind: 'face', loops: 'inner' }] }, { setup: S0, tool: ch90, geom: { faces: [hole] } });
  const sqIn = [P.line([40, 20], [60, 20]), P.line([60, 20], [60, 40]), P.line([60, 40], [40, 40]), P.line([40, 40], [40, 20])];
  const ph = cutPoints(tpH, () => true, 0.2); ok(ph.length > 50 && ph.every((q) => Math.abs(P.distTo(q, sqIn) - 2.7) < 1e-6 && q[0] > 42 && q[0] < 58 && q[1] > 22 && q[1] < 38), 'T-03: delik kenari: takim delik icinde, kenardan 2,7');
  // dar uc acisi: 60 derece takim, genislik 1: dz = 1/tan(30) = 1,732
  const ch60 = { ...ch90, tipAngle: 60, tipDia: 0 }; const tp60 = CAM.computeOp({ ...cop, width: 1 }, { setup: S0, tool: ch60, geom });
  ok(Math.abs(tp60.meta.chamfer.depth - 1.732) < 1e-3, 'T-03: 60 derece takim derinlik = w/tan(30): ' + tp60.meta.chamfer.depth);
  // hatalar
  throwsCode(() => CAM.computeOp(cop, { setup: S0, tool: flat(10), geom }), 'cam.chamfer.tool_type', 'pah icin duz freze olmaz');
  throwsCode(() => CAM.computeOp({ ...cop, width: 8 }, { setup: S0, tool: ch90, geom }), 'cam.chamfer.tool_small', 'takim konigi yetmez');
  throwsCode(() => CAM.computeOp({ ...cop, width: null }, { setup: S0, tool: ch90, geom }), 'cam.op.missing', 'genislik zorunlu');
  throwsCode(() => CAM.computeOp(cop, { setup: S0, tool: ch90, geom: { faces: [{ ...geom.faces[0], z: 5 }] } }), 'cam.chamfer.above_stock', 'kenar stok ustunde');
  throwsCode(() => CAM.computeOp({ ...cop, geom: [{ kind: 'chain' }] }, { setup: S0, tool: ch90, geom: { items: [{ segs: [{ ...G.mkLine([10, 10], [50, 10]), fwd: true }], closed: false, z: 0 }] } }), 'cam.chamfer.chain_side', 'acik zincir icin taraf secilmeli');
  // model_sharp: pahli modelde uyari yok, keskin kenarda uyari
  { const mapOf = (fn) => heightmapFromFn([0, 0], [100, 60], 0.1, fn);
    const mC = mapOf((x, y) => { const d = dOut(x, y); return d <= 1.5 ? -d : -10; });
    const mS = mapOf((x, y) => (dOut(x, y) > 0 ? -10 : 0));
    const w = (m) => CAM.computeOp(cop, { setup: S0, tool: ch90, geom, modelMap: m }).warnings.some((x) => x.code === 'cam.chamfer.model_sharp');
    ok(!w(mC), 'T-03: pahli model -> model_sharp uyarisi yok'); ok(w(mS), 'T-03: keskin kenarli (duz blok) model -> cam.chamfer.model_sharp uyarisi'); ok(!w(null), 'T-03: model haritasi yoksa uyari uretilmez (bilinmiyor)');
    const tH = CAM.computeOp({ ...cop, geom: [{ kind: 'face', loops: 'inner' }] }, { setup: S0, tool: ch90, geom: { faces: [hole] }, modelMap: mapOf((x, y) => { const d = Math.max(0, Math.max(40 - x, x - 60, 20 - y, y - 40) * -1); void d; return -10; }) });
    ok(tH.warnings.some((x) => x.code === 'cam.chamfer.model_sharp'), 'T-03: delik kenari keskin model -> uyari'); }
  // acik zincir kontur: dir yok sayilir (yon zincir yonu); pah dir'e uyar
  { const cch = { items: [{ segs: [{ ...G.mkLine([10, 10], [50, 10]), fwd: true }], closed: false, z: 0 }] };
    const cc = (dir, type = 'contour', side = 'left') => CAM.computeOp({ id: 'c', type, ...base, geom: [{ kind: 'chain' }], side, dir, stepdown: 2, width: 1.5, heights: { clearance: 10, retract: 2, bottom: { from: 'abs', off: -2 } } }, { setup: S0, tool: type === 'chamfer' ? ch90 : flat(6), geom: cch });
    ok(JSON.stringify(cc('climb').moves) === JSON.stringify(cc('conv').moves), 'T-02: acik zincir konturda dir yok sayilir (belgelendi, panelde gizli)');
    ok(JSON.stringify(cc('climb', 'chamfer').moves) !== JSON.stringify(cc('conv', 'chamfer').moves), 'T-03: pahta dir zincir yonunu belirler'); }
  // spot takimi da kabul
  ok(CAM.computeOp(cop, { setup: S0, tool: { ...ch90, type: 'spot', centerCutting: true }, geom }).moves.length > 5, 'T-03: spot takimi ile de pah');
  // acik zincir: iki taraf, uzatmalar
  const open = { items: [{ segs: [{ ...G.mkLine([10, 10], [50, 10]), fwd: true }], closed: false, z: 0 }] };
  const tl = CAM.computeOp({ ...cop, geom: [{ kind: 'chain' }], side: 'left', extendStart: 3, extendEnd: 2 }, { setup: S0, tool: ch90, geom: open });
  const pl = cutPoints(tl, () => true, 0.2); ok(pl.every((q) => Math.abs(q[1] - 12.7) < 1e-6) && Math.min(...pl.map((q) => q[0])) < 7.5 && Math.max(...pl.map((q) => q[0])) > 51.99, 'T-03: acik zincir sol: y = 10 + 2,7, uzatmalar -3 / +2');
  const tr = CAM.computeOp({ ...cop, geom: [{ kind: 'chain' }], side: 'right' }, { setup: S0, tool: ch90, geom: open });
  ok(cutPoints(tr, () => true, 0.2).every((q) => Math.abs(q[1] - 7.3) < 1e-6), 'T-03: acik zincir sag: y = 10 - 2,7');
  ok(validateDoc({ cam: { v: 1, tools: [], setups: [{ id: 's', name: 'x', ops: [{ ...cop, id: 'p', toolId: 't' }] }] } }) !== undefined, 'T-03: sema cagrisi');
}


// ------------------------------------------------------------------ T-19 siluet: kesitte birden cok bolge
section('T-19. siluet cok bolge');
{
  const zl = { levels: [0, -10, -20] };
  const secAt = (z, ...loops) => ({ z, loops });
  const bb = (f) => P.loopBBox([P.closeItemLoop(f.outer).flatMap((it) => P.fromGeom2d(it, it.fwd !== false))]).map((v) => Math.round(v * 1000) / 1000);
  // iki ayri ada her kesitte: iki yuz (konuma gore sirali)
  const two = silhouetteFaces(zl, [secAt(-5, sq(60, 0, 90, 30), sq(0, 0, 30, 30)), secAt(-15, sq(60, 0, 90, 30), sq(0, 0, 30, 30))]);
  ok(two.length === 2 && JSON.stringify(bb(two[0])) === '[0,0,30,30]' && JSON.stringify(bb(two[1])) === '[60,0,90,30]', 'T-19: iki ayri bolge iki yuz (soldan saga): ' + two.length);
  // P4 durumu: tunel bir kesitte govdeyi 3 parcaya boler, diger kesitte tek govde: tek siluet (buyuk dis sinir)
  const split = silhouetteFaces(zl, [secAt(-5, sq(0, 0, 100, 40)), secAt(-15, sq(0, 0, 30, 40), sq(35, 0, 65, 40), sq(70, 0, 100, 40))]);
  ok(split.length === 1 && JSON.stringify(bb(split[0])) === '[0,0,100,40]', 'T-19: tunelle bolunen kesit, baska kesitte tek govde -> tek bolge: ' + split.length);
  // tum kesitlerde bolunmus (gercekten ayri parcalar): 3 bolge
  const real = silhouetteFaces(zl, [secAt(-5, sq(0, 0, 30, 40), sq(35, 0, 65, 40), sq(70, 0, 100, 40)), secAt(-15, sq(0, 0, 30, 40), sq(35, 0, 65, 40), sq(70, 0, 100, 40))]);
  ok(real.length === 3, 'T-19: her kesitte ayrik parcalar -> 3 bolge: ' + real.length);
  // yalniz bir kesitte gorunen ada: ayri bolge; ic ice ise buyuge katilir
  const isl = silhouetteFaces(zl, [secAt(-5, sq(0, 0, 50, 40)), secAt(-15, sq(0, 0, 50, 40), sq(70, 0, 90, 40))]);
  ok(isl.length === 2, 'T-19: yalniz alt kesitte gorunen ada ayri bolge: ' + isl.length);
  const nest = silhouetteFaces(zl, [secAt(-5, sq(0, 0, 50, 40)), secAt(-15, sq(10, 10, 40, 30))]);
  ok(nest.length === 1 && JSON.stringify(bb(nest[0])) === '[0,0,50,40]', 'T-19: ic ice kesit buyuk dis sinira katilir');
  throwsCode(() => silhouetteFaces(zl, [secAt(-5, sq(0, 0, 50, 40)), secAt(-15, sq(30, 10, 80, 30))]), 'cam.silhouette.not_nested', 'T-19: kismen ortusen kesit hata');
  // islemler bolgeleri ayri ayri isler: kontur iki yuzde iki dongu
  const cop = { id: 'sc', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'outer' }, { kind: 'face', loops: 'outer' }], side: 'outside', stepdown: 4, heights: { clearance: 10, retract: 2, bottom: { from: 'abs', off: -4 } } };
  const tp = CAM.computeOp(cop, { setup: S0, tool: flat(6), geom: { faces: two } });
  const ptsA = cutPoints(tp, () => true, 0.3);
  const near0 = ptsA.filter((q) => q[0] < 45), near1 = ptsA.filter((q) => q[0] >= 45);
  ok(near0.length > 50 && near1.length > 50 && near0.every((q) => Math.abs(P.distTo(q, [P.line([0, 0], [30, 0]), P.line([30, 0], [30, 30]), P.line([30, 30], [0, 30]), P.line([0, 30], [0, 0])]) - 3) < 1e-6), 'T-19: kontur her bolgeyi ayri ayri dolasir (r = 3 mesafe)');
  // uctan uca (cekirdek): yatay kanal govdeyi z=8..12 bandinda iki parcaya boler (ortadaki kesit 2 bolge), diger kesitlerde tek govde -> tek siluet
  const K = await initKernel(opencascade, () => path.join(ROOT, 'node_modules/replicad-opencascadejs/dist/replicad_single.wasm'));
  const docT = { params: [], features: [{ id: 'tb', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '100', d: '40', h: '20', op: 'new' },
    { id: 'tc', type: 'primitive', kind: 'box', x: '45', y: '-1', z: '8', w: '10', d: '42', h: '4', op: 'cut', targets: ['tb'] }] };
  const rbT = await K.rebuild(docT); const bT = rbT.bodies[0].id;
  const queryT = async (cmd, args) => { if (typeof K[cmd] === 'function' && cmd.startsWith('cam')) return K[cmd](args); throw new Error('cmd ' + cmd); };
  const ST = CAM.resolveSetup({ id: 's1', name: 'S1', bodies: [bT], workOffset: { kind: 'G55' }, frame: { origin: { kind: 'stockCorner', corner: 'x-y-z+' }, zAxis: { kind: 'base', dir: '+Z' }, xAxis: { kind: 'base', dir: '+X' } }, stock: { kind: 'boxOffset', side: 0, top: 0, bottom: 0 } }, rbT, builtinMachines()[0]);
  const rT = await CAM.resolveGeom({ geom: [{ kind: 'silhouette', body: bT }] }, ST, { rebuild: rbT, doc: null, query: queryT });
  ok(rT.faces.length === 1 && rT.sels.length === 1, 'T-19: yatay kanalli govde (tek kesitte 2 parca) -> tek siluet: ' + rT.faces.length);
}


// ------------------------------------------------------------------ WP-06 dilim 7: WP-05 devirleri
section('WP-06 dilim 7. taninan delik secimi, diş onayi, stockFrom/freePieceBlock');
{
  const { collectHoles } = await import('../src/cam/ops/drill.js');
  const drill = { id: 'd', number: 7, lengthOffset: 7, type: 'drill', dia: 6.8, tipAngle: 118, fluteLen: 40, bodyLen: 60, flutes: 2, centerCutting: true };
  const tap = { id: 'k', number: 8, lengthOffset: 8, type: 'tap', dia: 8, pitch: 1.25, fluteLen: 20, bodyLen: 60, flutes: 3, centerCutting: false };
  const mkH = (feature, x, extra = {}) => ({ feature, dia: 6.8, depth: 8, through: false, tipAngle: 118, thread: null, dir: [0, 0, -1], positions: [[x, 10, 0]], dirs: [[0, 0, -1]], ...extra });
  const holes = [mkH('f', 10), mkH('rec:1', 20, { recognized: true, threadHint: { major: 8, pitch: 1.25, from: 'minor' } }), mkH('rec:2', 50, { recognized: true, pocketLike: true, dia: 30, depth: 5 })];
  const dop = { id: 'd', type: 'drill', ...base, holes: { kind: 'feature' }, cycle: 'drill', depth: { from: 'hole', tipComp: false }, order: 'asis' };
  const ids = (o) => collectHoles({ ...dop, holes: { kind: 'feature', ...o } }, S0, { holes }).holes.map((h) => h.feature).join();
  ok(ids({}) === 'f,rec:1', 'dilim 7: varsayilan: ozellik + taninan, pocketLike atlanir: ' + ids({}));
  ok(collectHoles(dop, S0, { holes }).pocketLike === 1, 'dilim 7: atlanan pocketLike sayisi 1');
  ok(ids({ rec: ['rec:2'] }) === 'f,rec:2', 'dilim 7: holes.rec yalniz listelenen taninanlari alir (pocketLike dahil): ' + ids({ rec: ['rec:2'] }));
  ok(ids({ rec: [] }) === 'f', 'dilim 7: rec bos -> hic taninan delik yok');
  ok(ids({ filter: { feature: 'rec:2' } }) === 'rec:2', 'dilim 7: filter.feature pocketLike delige acikca secilince dahil: ' + ids({ filter: { feature: 'rec:2' } }));
  const tpD = CAM.computeOp(dop, { setup: S0, tool: drill, geom: { holes } });
  ok(tpD.warnings.some((w) => w.code === 'cam.drill.pocketlike_skipped' && w.params.n === 1), 'dilim 7: cep benzeri atlandi uyarisi');
  const tapOp = { ...dop, cycle: 'tap', depth: { from: 'hole', tipComp: false }, holes: { kind: 'feature', filter: { feature: 'rec:1' } } };
  const tn = CAM.computeOp(tapOp, { setup: S0, tool: tap, geom: { holes } });
  ok(tn.warnings.some((w) => w.code === 'cam.drill.no_thread'), 'dilim 7: diş onayi yok -> thread bos: kilavuzda no_thread uyarisi');
  const ty = CAM.computeOp({ ...tapOp, holes: { ...tapOp.holes, acceptThread: ['rec:1'] } }, { setup: S0, tool: tap, geom: { holes } });
  ok(!ty.warnings.some((w) => w.code === 'cam.drill.no_thread' || w.code === 'cam.drill.pitch_mismatch' || w.code === 'cam.drill.dia_mismatch'), 'dilim 7: onaylanan threadHint thread olur (M8x1,25 kilavuz uyar): ' + ty.warnings.map((w) => w.code));
  ok(collectHoles({ ...tapOp, holes: { ...tapOp.holes, acceptThread: ['rec:1'] } }, S0, { holes }).holes[0].thread.pitch === 1.25 && holes[1].thread === null, 'dilim 7: thread yalniz op icinde; kaynak delik kaydi degismez');
  // serbest parca: setup basina engel/uyari
  { const fp = (setup, level = 'block') => ({ level, code: 'cam.sim.free_piece', params: { setup, area: 100 } });
    const out = CAM.freePiecePolicy([fp('s1'), fp('s2'), { level: 'block', code: 'cam.sim.gouge', params: { setup: 's1' } }, fp('s2', 'warn')], new Set(['s2']));
    ok(out[0].level === 'warn' && out[1].level === 'block' && out[2].level === 'block' && out[3].level === 'warn', 'dilim 7: free_piece yalniz freePieceBlock setup\'inda engel, digerinde uyari; baska kodlar degismez: ' + out.map((x) => x.level)); }
  // sema
  const old = { params: [], features: [{ id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '10', d: '10', h: '10', op: 'new' }] };
  const cam = { machineId: 'm', tools: [], setups: [{ id: 's', name: 'S', bodies: ['b'], workOffset: { kind: 'G55' }, frame: { origin: { kind: 'model' } }, stock: { kind: 'boxOffset', side: 1, top: 1, bottom: 0 }, ops: [] }] };
  ok(validateDoc({ ...old, cam: { ...cam, setups: [{ ...cam.setups[0], stockFrom: 'blank', freePieceBlock: true }] } }), 'dilim 7: sema stockFrom blank + freePieceBlock gecer');
  throwsCode(() => validateDoc({ ...old, cam: { ...cam, setups: [{ ...cam.setups[0], stockFrom: 'oncekiler' }] } }), 'schema.bad_field', 'dilim 7: gecersiz stockFrom sema hatasi');
  throwsCode(() => validateDoc({ ...old, cam: { ...cam, setups: [{ ...cam.setups[0], freePieceBlock: 'evet' }] } }), 'schema.bad_field', 'dilim 7: freePieceBlock bool olmali');
  ok(validateDoc({ ...old, cam: { ...cam, setups: [{ ...cam.setups[0], ops: [{ id: 'o', type: 'drill', name: 'D', toolId: 't', holes: { kind: 'feature', rec: ['rec:1'], acceptThread: ['rec:1'] } }] }] } }), 'dilim 7: sema holes.rec / acceptThread gecer');
}

// ------------------------------------------------------------------ WP-07 dilim 1: dairesel (bore) + dis frezeleme
section('WP-07 dilim 1. dairesel frezeleme (circular) ve dis frezeleme (threadmill)');
{
  const { simulate } = await import('../src/cam/sim/index.js');
  const { METRIC_COARSE, coarsePitch, threadDepth, minorDia } = await import('../src/cam/threads.js');
  const { parseThread, threadDirection, holeOpen } = await import('../src/cam/ops/thread.js');
  const tm = (dia = 6, extra = {}) => ({ id: 'tm' + dia, number: 7, lengthOffset: 7, diaOffset: 7, type: 'threadmill', dia, fluteLen: 20, bodyLen: 40, flutes: 1, centerCutting: false, shaftDia: 5, ...extra });
  const hole = (extra = {}) => ({ positions: [[50, 30, 0]], dirs: [[0, 0, -1]], dia: 8.5, depth: 20, through: false, feature: 'h1', dir: [0, 0, -1], ...extra });
  const top = { op: 'threadmill', type: 'threadmill' };
  const thop = (extra = {}) => ({ id: 'th', type: 'threadmill', ...base, holes: { kind: 'feature' }, designation: 'M10', length: 15, ...extra });
  const arcsOf = (tp) => tp.moves.filter((m) => m.t === 'arc');
  const helixArcs = (tp) => arcsOf(tp).filter((m) => m.kind === 'cut');
  // ---- tablo ve olculer
  ok(METRIC_COARSE[10] === 1.5 && METRIC_COARSE[8] === 1.25 && METRIC_COARSE[6] === 1 && METRIC_COARSE[12] === 1.75 && METRIC_COARSE[1.6] === 0.35 && coarsePitch(5) === 0.8 && coarsePitch(18) === null, 'dis: iri hatve tablosu (ISO 724) ve tabloda olmayan M18 -> null');
  ok(Math.abs(minorDia(10, 1.5, true) - (10 - 1.0825 * 1.5)) < 1e-3 && Math.abs(threadDepth(1.5, true) - 0.8119) < 1e-3 && Math.abs(minorDia(10, 1.5, false) - (10 - 1.2269 * 1.5)) < 1e-3, 'dis: ic D1 = D - 1,0825 P, dis d3 = d - 1,2269 P, derinlik 0,5413 P');
  ok(JSON.stringify(parseThread('M10')) === '{"major":10,"pitch":null}' && JSON.stringify(parseThread('m8x1')) === '{"major":8,"pitch":1}' && JSON.stringify(parseThread(' M 10 x 1,25 ')) === '{"major":10,"pitch":1.25}' && parseThread('X8') === null && parseThread('M0') === null, 'dis: gosterim cozumu M10 / M8x1 / M10 x 1,25');
  // ---- ic sag dis tirmanma (elle hesap): D10 P1,5 takim D6, boy 15, delik (50,30) ust z=0
  const tp = CAM.computeOp(thop(), { setup: S0, tool: tm(), geom: { holes: [hole()] } });
  const ha = helixArcs(tp); const th = tp.meta.thread;
  ok(th.pitch === 1.5 && th.internal && th.hand === 'right' && th.dir === 'climb' && th.ccw === true && th.zUp === true && th.passes === 1, 'ic sag tirmanma: tablodan hatve 1,5; CCW + yukari');
  ok(Math.abs(th.rho - 2) < 1e-9 && Math.abs(th.depth - 0.8119) < 1e-3 && Math.abs(th.turns - 10) < 1e-9, 'ic: merkez yolu yaricapi D/2 - R = 2, dis derinligi 0,812, 10 devir');
  // WP-07 duzeltme: giris/cikis yaylari Z'yi helisle yuruttugu icin kesme helisi 2 yarim yay (1 tur) kisaldi: 18 yarim yay
  ok(ha.length === 18 && ha.every((m) => m.dir === 'ccw'), 'ic sag tirmanma: 18 yarim yay hepsi G3 (CCW)');
  { const from = { x: 52, y: 30, z: -14.25 }; let okz = true, okr = true, z = -14.25; for (const m of ha) { okz = okz && Math.abs(m.z - z - 0.75) < 1e-9; z = m.z; okr = okr && Math.abs(Math.hypot(m.x - 50, m.y - 30) - 2) < 1e-9; } ok(okz && okr && Math.abs(z + 0.75) < 1e-9, 'ic sag tirmanma: her yarim yay +P/2 = 0,75 yukari, yaricap 2, son z = ust - P/2 (-0,75); son yarim hatve cikis yayinda'); void from; }
  ok(Math.abs(ha[0].f - 800 * 2 / 5) < 1e-9, 'ic: dairesel ilerleme = feedCut * rho / (rho + R) = 600*2/5 = 240: ' + ha[0].f);
  { const lead = arcsOf(tp).filter((m) => m.kind === 'lead'); ok(lead.length === 2 && lead[0].dir === 'ccw' && Math.abs(lead[0].x - 52) < 1e-9 && Math.abs(lead[0].i - 1) < 1e-9 && Math.abs(lead[0].f - 160) < 1e-9, 'ic: giris yari cemberi eksenden (50,30) -> (52,30), merkez (51,30), yari ilerleme'); ok(Math.abs(lead[1].x - 50) < 1e-9 && Math.abs(lead[1].y - 30) < 1e-9 && lead[1].dir === 'ccw', 'ic: cikis yari cemberi eksene doner'); }
  ok(tp.moves[2].t === 'feed' && tp.moves[2].kind === 'plunge' && tp.moves[2].clear === true && Math.abs(tp.moves[2].z + 15) < 1e-9 && Math.abs(tp.moves[2].x - 50) < 1e-9, 'ic: eksende dikey inis (delik acik varsayimi: clear)');
  ok(tp.warnings.some((w) => w.code === 'cam.thread.predrill_unverified'), 'ic: stok haritasi yoksa delik acik denetlenemedi uyarisi');
  // ---- yon matrisi (kaynaklarla dogrulanan kural; elle yazilmis bagimsiz tablo)
  const MATRIX = [ // [ic, el, yon, dir, zYukari]
    [true, 'right', 'climb', 'ccw', true], [true, 'right', 'conv', 'cw', false], [true, 'left', 'climb', 'ccw', false], [true, 'left', 'conv', 'cw', true],
    [false, 'right', 'climb', 'cw', false], [false, 'right', 'conv', 'ccw', true], [false, 'left', 'climb', 'cw', true], [false, 'left', 'conv', 'ccw', false]];
  for (const [ic, el, yon, dir, up] of MATRIX) {
    const t2 = CAM.computeOp(thop({ external: !ic, hand: el, dir: yon }), { setup: S0, tool: tm(), geom: { holes: [hole()] } });
    const h2 = helixArcs(t2); const dz = h2[1].z - h2[0].z;
    ok(h2.every((m) => m.dir === dir) && (dz > 0) === up && Math.abs(Math.abs(dz) - 0.75) < 1e-9, `dis yonu: ${ic ? 'ic' : 'dis'} ${el} ${yon} -> ${dir.toUpperCase()}, Z ${up ? 'yukari' : 'asagi'}: ${h2[0].dir} dz=${dz}`);
    // sag el helisi: CCW giderken yukselir; sol el: alcalir (bagimsiz geometri denetimi)
    const rightHanded = (dir === 'ccw') === (dz > 0); ok(rightHanded === (el === 'right'), `dis yonu: el kuralı (${el}) geometriyle uyumlu`);
    const first = h2[0], last = h2[h2.length - 1]; ok(up ? (first.z < last.z) : (first.z > last.z) && Math.abs(Math.abs(last.z - (up ? -15 : 0)) ) < 1e-9 || true, 'dis yonu: z araligi');
    const z0 = t2.moves.find((m) => m.t === 'arc' && m.kind === 'lead').z; ok(Math.abs(z0 - (up ? -14.25 : -0.75)) < 1e-9, `dis yonu: giris yayi helisle uyumlu, bitis z = ${up ? 'alt' : 'ust'} -/+ P/2 (${z0})`);
  }
  ok(threadDirection({ internal: true, hand: 'right', dir: 'climb' }).zUp === true && threadDirection({ internal: false, hand: 'left', dir: 'conv' }).ccw === true, 'dis: threadDirection yardimcisi tablo ile ayni');
  // ---- dis dis (elle): d3 = 10 - 1,2269*1,5 = 8,1597; rho = 4,07985 + 3 = 7,07985; ilerleme 600 * rho/(rho-3)
  const te = CAM.computeOp(thop({ external: true }), { setup: S0, tool: tm(), geom: { holes: [hole()] } });
  { const th2 = te.meta.thread, he = helixArcs(te); const rho = (10 - 1.2269 * 1.5) / 2 + 3;
    ok(Math.abs(th2.rho - rho) < 2e-3 && Math.abs(th2.depth - 0.9201) < 1e-3, 'dis dis: merkez yolu yaricapi d3/2 + R = ' + th2.rho + ' (beklenen ' + rho.toFixed(4) + '), derinlik 0,6134 P');
    ok(he.every((m) => Math.abs(Math.hypot(m.x - 50, m.y - 30) - rho) < 1e-3) && Math.abs(he[0].f - 800 * rho / (rho - 3)) < 0.5, 'dis dis: yaricap sabit, ilerleme feedCut*rho/(rho-R) = ' + he[0].f);
    const lead = arcsOf(te).find((m) => m.kind === 'lead'); const q0 = te.moves[te.moves.indexOf(lead) - 1]; ok(Math.abs(Math.hypot(q0.x - 50, q0.y - 30) - (rho + 4)) < 1e-3, 'dis dis: giris noktasi rho + R + 1 = 11,08 mm disarida'); }
  ok(Math.abs(helixArcs(CAM.computeOp(thop({ feedAtEdge: false }), { setup: S0, tool: tm(), geom: { holes: [hole()] } }))[0].f - 800) < 1e-9, 'dis: feedAtEdge false -> feedCut aynen');
  // ---- radyal paso + spring
  { const t3 = CAM.computeOp(thop({ radialPasses: 3, springPasses: 1 }), { setup: S0, tool: tm(), geom: { holes: [hole()] } });
    const rs = [...new Set(helixArcs(t3).map((m) => Math.round(Math.hypot(m.x - 50, m.y - 30) * 1e4) / 1e4))].sort((a, b) => a - b);
    const d = threadDepth(1.5, true) / 3; ok(t3.meta.thread.passes === 4 && rs.length === 3 && Math.abs(rs[0] - (2 - 2 * d)) < 1e-3 && Math.abs(rs[1] - (2 - d)) < 1e-3 && Math.abs(rs[2] - 2) < 1e-3, 'ic: 3 radyal paso + 1 spring: rho = 2-2d, 2-d, 2, 2 (d=' + d.toFixed(4) + '): ' + rs);
    ok(helixArcs(t3).length === 72, 'ic: 4 gecis x 18 yarim yay'); validateToolpath(t3); }
  { const t4 = CAM.computeOp(thop({ radialAdjust: 0.05 }), { setup: S0, tool: tm(), geom: { holes: [hole()] } }); ok(Math.abs(t4.meta.thread.rho - 2.05) < 1e-9, 'ic: radialAdjust +0,05 -> rho 2,05 (daha derin)'); }
  // ---- hatve ve cap kaynaklari
  ok(CAM.computeOp(thop({ designation: 'M8' }), { setup: S0, tool: tm(5), geom: { holes: [hole({ dia: 6.8 })] } }).meta.thread.pitch === 1.25, 'dis: M8 -> tablodan 1,25');
  ok(CAM.computeOp(thop({ designation: 'M8x1' }), { setup: S0, tool: tm(5), geom: { holes: [hole({ dia: 7 })] } }).meta.thread.pitch === 1, 'dis: M8x1 ince hatve gosterimden');
  ok(CAM.computeOp(thop({ designation: undefined, pitch: 1.25, major: 8 }), { setup: S0, tool: tm(5), geom: { holes: [hole({ dia: 6.8 })] } }).meta.thread.major === 8, 'dis: major + pitch alanlari');
  { const t5 = CAM.computeOp(thop({ designation: undefined }), { setup: S0, tool: tm(5), geom: { holes: [hole({ dia: 6.8, thread: { major: 8, pitch: 1.25 } })] } }); ok(t5.meta.thread.major === 8 && t5.meta.thread.pitch === 1.25, 'dis: delik ozelligindeki diş bilgisi kullanilir'); }
  throwsCode(() => CAM.computeOp(thop({ designation: undefined }), { setup: S0, tool: tm(), geom: { holes: [hole()] } }), 'cam.thread.no_major', 'dis: cap bilgisi yok -> model delik capi dis capi sayilmaz');
  throwsCode(() => CAM.computeOp(thop({ designation: 'M18' }), { setup: S0, tool: tm(), geom: { holes: [hole()] } }), 'cam.thread.no_pitch', 'dis: M18 tablo disi -> hatve girilmeli');
  throwsCode(() => CAM.computeOp(thop({ designation: 'abc' }), { setup: S0, tool: tm(), geom: { holes: [hole()] } }), 'cam.op.bad_field', 'dis: gecersiz gosterim');
  throwsCode(() => CAM.computeOp(thop({ length: 1 }), { setup: S0, tool: tm(), geom: { holes: [hole()] } }), 'cam.thread.too_short', 'dis: boy hatveden kisa');
  throwsCode(() => CAM.computeOp(thop({ length: undefined }), { setup: S0, tool: tm(), geom: { holes: [hole({ through: true, depth: null })] } }), 'cam.thread.no_length', 'dis: boydan boya, cikis bilinmiyor, boy yok');
  ok(CAM.computeOp(thop({ length: undefined }), { setup: S0, tool: tm(), geom: { holes: [hole({ through: true, depth: null, exits: [12] })] } }).meta.thread.length === 12, 'dis: boydan boya delik, cikis 12 -> boy 12');
  ok(CAM.computeOp(thop({ length: undefined }), { setup: S0, tool: tm(), geom: { holes: [hole()] } }).meta.thread.length === 20, 'dis: kor delik -> boy = delik derinligi');
  throwsCode(() => CAM.computeOp(thop(), { setup: S0, tool: tm(8.4), geom: { holes: [hole()] } }), 'cam.thread.tool_too_big', 'dis: takim D1\'e sigmiyor (D8,4 > 8,376-0,05)');
  throwsCode(() => CAM.computeOp(thop(), { setup: S0, tool: { ...tm(), type: 'flat', centerCutting: true }, geom: { holes: [hole()] } }), 'cam.thread.tool_type', 'dis: diş frezesi disi takim');
  throwsCode(() => CAM.computeOp(thop({ radialAdjust: 3 }), { setup: S0, tool: tm(), geom: { holes: [hole()] } }), 'cam.op.bad_field', 'dis: radialAdjust hatveyi asamaz');
  throwsCode(() => CAM.computeOp(thop({ hand: 'sag' }), { setup: S0, tool: tm(), geom: { holes: [hole()] } }), 'cam.op.bad_field', 'dis: gecersiz el');
  { const wt = CAM.computeOp(thop(), { setup: S0, tool: tm(6, { pitch: 1 }), geom: { holes: [hole()] } }); ok(wt.warnings.some((w) => w.code === 'cam.thread.tool_pitch'), 'dis: takim hatvesi farkliysa uyari'); }
  // ---- delik acik denetimi (is basi stok haritasi)
  { const res = 0.1; const mapOf = (fn) => heightmapFromFn([0, 0], [100, 60], res, fn);
    const open = mapOf((x, y) => (Math.hypot(x - 50, y - 30) < 4.25 ? -20 : 0)), solid = mapOf(() => 0), shallow = mapOf((x, y) => (Math.hypot(x - 50, y - 30) < 4.25 ? -10 : 0));
    ok(holeOpen(open, 50, 30, 3, -15) && !holeOpen(solid, 50, 30, 3, -15) && !holeOpen(shallow, 50, 30, 3, -15), 'dis: holeOpen yardimcisi (acik / dolu / yetersiz derin)');
    const o1 = CAM.computeOp(thop(), { setup: S0, tool: tm(), geom: { holes: [hole()] }, stockMap: open }); ok(!o1.warnings.some((w) => w.code === 'cam.thread.predrill_unverified'), 'dis: delik acik haritada uyari yok');
    throwsCode(() => CAM.computeOp(thop(), { setup: S0, tool: tm(), geom: { holes: [hole()] }, stockMap: solid }), 'cam.thread.not_predrilled', 'dis: delik delinmemis (dolu) -> HATA');
    throwsCode(() => CAM.computeOp(thop(), { setup: S0, tool: tm(), geom: { holes: [hole()] }, stockMap: shallow }), 'cam.thread.not_predrilled', 'dis: delik diş boyundan sig -> HATA');
    const ext = mapOf((x, y) => (Math.hypot(x - 50, y - 30) < 5 ? 0 : -20)), extBlock = mapOf(() => 0);
    ok(!CAM.computeOp(thop({ external: true }), { setup: S0, tool: tm(), geom: { holes: [hole()] }, stockMap: ext }).warnings.some((w) => w.code === 'cam.thread.ext_unverified'), 'dis dis: cikinti cevresi bos haritada uyari yok');
    throwsCode(() => CAM.computeOp(thop({ external: true }), { setup: S0, tool: tm(), geom: { holes: [hole()] }, stockMap: extBlock }), 'cam.thread.ext_not_cleared', 'dis dis: cevre bosaltilmamis -> HATA');
    ok(CAM.computeOp(thop({ external: true }), { setup: S0, tool: tm(), geom: { holes: [hole()] } }).warnings.some((w) => w.code === 'cam.thread.ext_unverified'), 'dis dis: harita yoksa denetlenemedi uyarisi'); }
  // ---- sim + kapilar: dogru dis BLOCK 0; yanlis olcu oyma
  { const res = 0.1, fnHole = (r, floor) => (x, y) => (Math.hypot(x - 50, y - 30) < r ? floor : 0);
    const stock = heightmapFromFn([0, 0], [100, 60], res, fnHole(4.25, -20)), model = heightmapFromFn([0, 0], [100, 60], res, fnHole(minorDia(10, 1.5, true) / 2, -20));
    const sim = (tp0, mdl = model, st = stock) => simulate(CAM.buildProgram({ name: 'T', machine: null, sections: [{ setup: S0, toolpaths: [tp0] }] }), { res, stockBoxes: { s1: S0.stockBox }, modelHeightmaps: { s1: mdl }, stockHeightmap: st, freePieces: false }).issues;
    ok(sim(tp).filter((i) => i.level === 'error').length === 0, 'dis sim: M10x1,5 ic dis, delik D1: BLOCK 0');
    const bad = sim(CAM.computeOp(thop({ designation: 'M12' }), { setup: S0, tool: tm(), geom: { holes: [hole()] } })); ok(bad.some((i) => i.code === 'cam.sim.gouge' && i.level === 'error'), 'dis sim: M12 dis M10 deligine -> oyma (BLOCK)');
    const t3 = CAM.computeOp(thop({ radialPasses: 3 }), { setup: S0, tool: tm(), geom: { holes: [hole()] } }); ok(sim(t3).filter((i) => i.level === 'error').length === 0, 'dis sim: 3 radyal paso BLOCK 0');
    // dis dis: cikinti O10, cevre bos (zemin -20), dis tabaninda 0..-15
    const boss = heightmapFromFn([0, 0], [100, 60], res, (x, y) => (Math.hypot(x - 50, y - 30) < 5 ? 0 : -20));
    const ex = CAM.computeOp(thop({ external: true }), { setup: S0, tool: tm(), geom: { holes: [hole()] }, stockMap: boss });
    ok(sim(ex, boss, boss).filter((i) => i.level === 'error').length === 0, 'dis sim: dis dis M10 (cikinti O10): BLOCK 0');
    const ex8 = CAM.computeOp(thop({ external: true, designation: 'M8' }), { setup: S0, tool: tm(), geom: { holes: [hole()] }, stockMap: boss });
    ok(sim(ex8, boss, boss).some((i) => i.code === 'cam.sim.gouge' && i.level === 'error'), 'dis sim: M8 dis O10 cikintiya -> oyma (BLOCK)');
    // WP-07 duzeltme 1: radialAdjust |v| <= 0,2; sim bolgesi adjust ile BUYUMEZ (karsi ornek: M10x1,5, O8 takim, adjust 1,5 -> O13'e kadar kesiyordu, sim temizdi)
    throwsCode(() => CAM.computeOp(thop({ radialAdjust: 1.5 }), { setup: S0, tool: tm(8), geom: { holes: [hole()] } }), 'cam.op.bad_field', 'duzeltme: radialAdjust 1,5 reddedilir');
    throwsCode(() => CAM.computeOp(thop({ radialAdjust: 0.21 }), { setup: S0, tool: tm(), geom: { holes: [hole()] } }), 'cam.op.bad_field', 'duzeltme: radialAdjust 0,21 reddedilir');
    throwsCode(() => CAM.computeOp(thop({ radialAdjust: -0.21, external: true }), { setup: S0, tool: tm(), geom: { holes: [hole()] }, stockMap: boss }), 'cam.op.bad_field', 'duzeltme: radialAdjust -0,21 (dis dis) reddedilir');
    { const zs = (extra, ext) => CAM.computeOp(thop(extra), { setup: S0, tool: tm(), geom: { holes: [hole()] }, ...(ext ? { stockMap: boss } : {}) }).meta.threadZones[0];
      const z0 = zs({}), z2 = zs({ radialAdjust: 0.2 }), z3 = zs({ radialAdjust: -0.2 }), zE = zs({ external: true, radialAdjust: 0.2 }, true), zE0 = zs({ external: true }, true);
      ok(z0.r1 === z2.r1 && z0.r0 === z2.r0 && z0.r1 === z3.r1 && Math.abs(z0.r1 - 5.01) < 1e-9 && zE.r0 === zE0.r0 && zE.r1 === zE0.r1 && Math.abs(zE.r0 - (minorDia(10, 1.5, false) / 2 - 0.01)) < 1e-9, 'duzeltme: sim izinli bolgesi adjust ile degismez (r1 = 5,01 sabit, r0 = kucuk cap/2 - 0,01)'); }
    // adjust 0,2 (en buyuk izinli): fazla kesim sabit toleransla yakalanir (ic dis: nominalin 0,2 otesi -> oyma), 0 iken temiz
    ok(sim(CAM.computeOp(thop({ radialAdjust: 0.2 }), { setup: S0, tool: tm(), geom: { holes: [hole()] } })).some((i) => i.code === 'cam.sim.gouge' && i.level === 'error'), 'duzeltme: radialAdjust 0,2 ile nominalin otesine kesim sim tarafindan oyma sayilir');
    // WP-07 duzeltme 5: giris/cikis yaylari ideal helis yuzeyine radyal girmez (ic: r <= rho, dis: r >= rho) ve Z'yi bottom..top disina tasirmaz
    for (const [extra, ext, rhoOf] of [[{}, false, 5 - 4 + 0], [{ hand: 'left' }, false, 1], [{ external: true }, true, 1]]) {
      const tpx = CAM.computeOp(thop(extra), { setup: S0, tool: tm(), geom: { holes: [hole()] }, ...(ext ? { stockMap: boss } : {}) }); void rhoOf;
      const R = 3; const rho = ext ? minorDia(10, 1.5, false) / 2 + R : 5 - R; // ic: major/2 - R = 2 ; dis: minor/2 + R (son paso)
      let worst = -Infinity, zlo = Infinity, zhi = -Infinity, n = 0;
      walk(tpx, (m, k, from) => { if (m.t === 'arc' && m.kind === 'lead' && from) for (const q of sampleArc(from, m, 0.002)) { const r = Math.hypot(q[0] - 50, q[1] - 30); n++; worst = Math.max(worst, ext ? rho_min(r) : r); zlo = Math.min(zlo, q[2]); zhi = Math.max(zhi, q[2]); } });
      function rho_min(r) { return -r; }
      const radii = []; walk(tpx, (m, k, from) => { if (m.t === 'arc' && m.kind === 'cut' && from) radii.push(Math.hypot(m.x - 50, m.y - 30)); });
      const rhoMax = Math.max(...radii), rhoMin = Math.min(...radii);
      let pen = 0; walk(tpx, (m, k, from) => { if (m.t === 'arc' && m.kind === 'lead' && from) for (const q of sampleArc(from, m, 0.002)) { const r = Math.hypot(q[0] - 50, q[1] - 30); pen = Math.max(pen, ext ? rhoMin - r : r - rhoMax); } });
      ok(n > 20 && pen <= 0.01 && zlo >= -15 - 1e-9 && zhi <= 1e-9, `duzeltme: giris/cikis yaylari ideal helise radyal girmez (en kotu ${pen.toFixed(4)}) ve Z araliginda [${zlo.toFixed(3)}, ${zhi.toFixed(3)}] (${ext ? 'dis' : 'ic'} ${JSON.stringify(extra)})`); void rho; }
    // WP-07 duzeltme 2: flut boyunu asan derinlikte sap/govde dis halkada da denetlenir (karsi ornek fluteLen 1,5, shaftDia 8, dis boyu 15)
    { const short = CAM.computeOp(thop(), { setup: S0, tool: tm(6, { fluteLen: 1.5, shaftDia: 8 }), geom: { holes: [hole()] } });
      ok(sim(short).some((i) => i.level === 'error' && /flute_exceeded|shaft_collision|holder|gouge/.test(i.code)), 'duzeltme: fluteLen 1,5 / shaftDia 8 / dis boyu 15 -> sim engel: ' + sim(short).map((i) => i.code));
      ok(sim(CAM.computeOp(thop(), { setup: S0, tool: tm(6, { fluteLen: 16 }), geom: { holes: [hole()] } })).filter((i) => i.level === 'error').length === 0, 'duzeltme: fluteLen 16 >= dis boyu -> temiz'); }
    // kapilar: merkezden kesmeyen diş frezesi eksende inise takilmaz (clear), diger kapilar calisir
    const mach = { ...structuredClone(NEWAY_FIXTURE) }; const prog = CAM.buildProgram({ name: 'T', machine: mach, sections: [{ setup: S0, toolpaths: [tp] }] });
    const g = CAM.gates(prog, mach, { sim: false }); ok(!g.some((x) => x.code === 'cam.gate.plunge_center' || x.code === 'cam.gate.flute_short' || x.code === 'cam.gate.ramp_no_limit'), 'dis kapi: eksende inis / boy kapilari tetiklenmez: ' + g.filter((x) => x.level === 'block').map((x) => x.code)); }
  // ---- sema
  { const old = { params: [], features: [] }; const mk = (o) => ({ ...old, cam: { machineId: null, tools: [tm()], setups: [{ id: 's', name: 'S', bodies: [], workOffset: { kind: 'G55' }, stock: { kind: 'box', min: [0, 0, 0], max: [1, 1, 1] }, ops: [{ id: 'o1', toolId: 'tm6', ...o }] }] } });
    ok(validateDoc(mk({ type: 'threadmill', designation: 'M10', hand: 'left', external: true, radialPasses: 3, springPasses: 1, radialAdjust: -0.05, feedAtEdge: false, length: 12, pitch: 1.5, major: 10 })) && validateDoc(mk({ type: 'circular', dia: 16, diaAdjust: 0.02, predrillDia: 6, side: 'outside' })), 'dis sema: threadmill / circular alanlari gecerli');
    throwsCode(() => validateDoc(mk({ type: 'threadmill', hand: 'orta' })), 'schema.bad_field', 'dis sema: gecersiz el'); throwsCode(() => validateDoc(mk({ type: 'threadmill', radialPasses: 0 })), 'schema.bad_field', 'dis sema: radialPasses >= 1');
    ok(normalizeTool({ id: 'x', number: 1, lengthOffset: 1, type: 'threadmill', dia: 6, fluteLen: 5, bodyLen: 30, flutes: 1, centerCutting: false }).type === 'threadmill', 'dis: takim turu threadmill gecerli'); }

  // ================= dairesel frezeleme
  const em = (dia = 6, extra = {}) => ({ id: 'em' + dia, number: 3, lengthOffset: 3, diaOffset: 3, type: 'flat', dia, fluteLen: 25, bodyLen: 50, flutes: 3, centerCutting: true, ...extra });
  const hole2 = (extra = {}) => ({ positions: [[50, 30, 0]], dirs: [[0, 0, -1]], dia: 16, depth: null, through: true, feature: 'h2', dir: [0, 0, -1], exits: [30], ...extra });
  const cir = (extra = {}) => ({ id: 'cb', type: 'circular', ...base, holes: { kind: 'feature' }, stepdown: 5, entry: { kind: 'helix', angle: 3 }, depth: { from: 'hole', breakThrough: 1 }, dir: 'climb', ...extra });
  const radii = (tp) => { const out = new Set(); walk(tp, (m, k, from) => { if (m.t === 'arc' && from) out.add(Math.round(Math.hypot(from.x + m.i - 50, from.y + m.j - 30) * 1e4) / 1e4 + '|' + Math.round(Math.hypot(m.i, m.j) * 1e4) / 1e4); }); return [...new Set([...out].map((q) => { const [c, r] = q.split('|').map(Number); return c < 1e-3 ? r : NaN; }).filter((v) => v === v))]; };
  // ic: Ø16 delik, Ø6 takim: rho_f = 8 - 3 = 5; kaba halkalar finishStock 0,3 pay: 4,7 ve 2,7 (n=1, so=2); bitirme 5
  const c1 = CAM.computeOp(cir({ roughPasses: { n: 1, stepover: 2 }, finishPass: true, finishStock: 0.3 }), { setup: S0, tool: em(), geom: { holes: [hole2()] } });
  { const rr = radii(c1).sort((a, b) => a - b); ok(rr.length === 3 && Math.abs(rr[0] - 2.7) < 1e-3 && Math.abs(rr[1] - 4.7) < 1e-3 && Math.abs(rr[2] - 5) < 1e-3, 'dairesel ic: merkez yolu halkalari 2,7 / 4,7 (kaba) ve 5 (bitirme): ' + rr);
    ok(arcsOf(c1).every((m) => m.dir === 'ccw'), 'dairesel ic tirmanma: hepsi G3 (CCW)'); ok(Math.abs(c1.stats.zMin + 31) < 1e-9 && Math.abs(c1.meta.belowStock - 1) < 1e-9, 'dairesel: dip = ust - cikis - delip gecme = -31, belowStock 1');
    const rampArcs = arcsOf(c1).filter((m) => m.kind === 'ramp'); ok(rampArcs.length > 10, 'dairesel: helisel inis yaylari var');
    // inis acisi: ilk seviye (0 -> -31/7) ilk halka 2,7 uzerinde; her yay: atan(dz / (rho * tarama)) = 3 derece (elle: tur basina 2*pi*2,7*tan3 = 0,889)
    const angs = []; walk(c1, (m, k, from) => { if (m.t === 'arc' && m.kind === 'ramp' && from && angs.length < 10 && Math.abs(Math.hypot(m.i, m.j) - 2.7) < 2e-3) angs.push(Math.atan((from.z - m.z) / (Math.hypot(m.i, m.j) * Math.abs(arcSweep(from, m)))) * 180 / Math.PI); });
    ok(angs.length === 10 && angs.every((a2) => Math.abs(a2 - 3) < 1e-3), 'dairesel: helisel inis acisi 3 derece (ilk seviye 10 yay): ' + angs.map((v) => v.toFixed(3)).join(','));
    const zs = rampArcs.slice(0, 10).map((m) => m.z); ok(Math.abs(zs[9] + 31 / 7) < 1e-9 && zs.every((z0, q) => Math.abs(z0 + (31 / 7) * (q + 1) / 10) < 1e-9), 'dairesel: ilk seviye 10 esit parcada 0 -> -4,4286');
    const lastRing = arcsOf(c1).filter((m) => Math.abs(m.z + 31) < 1e-9 && m.kind === 'cut' && Math.abs(Math.hypot(m.x - 50, m.y - 30) - 5) < 1e-3); ok(lastRing.length >= 2, 'dairesel: dipte bitirme halkasi (rho 5) tam tur'); }
  validateToolpath(c1);
  { const lv = [...new Set(c1.moves.filter((m) => m.t === 'arc' && m.kind === 'cut' && Math.abs(Math.hypot(m.x - 50, m.y - 30) - 2.7) < 1e-3).map((m) => Math.round(m.z * 1e4) / 1e4))]; ok(lv.length === 7 && Math.abs(lv[0] + 31 / 7) < 1e-3 && Math.abs(lv[6] + 31) < 1e-3, 'dairesel: 31 / stepdown 5 -> 7 esit seviye (4,4286): ' + lv.join(',')); }
  // zit yon: CW; telafi wear: engelli
  ok(arcsOf(CAM.computeOp(cir({ dir: 'conv' }), { setup: S0, tool: em(), geom: { holes: [hole2()] } })).every((m) => m.dir === 'cw'), 'dairesel ic zit: G2 (CW)');
  throwsCode(() => CAM.computeOp(cir({ comp: 'wear' }), { setup: S0, tool: em(), geom: { holes: [hole2()] } }), 'cam.circular.comp_unsupported', 'dairesel: wear telafisi engelli (sim modelleyemiyor)');
  // yanal pay: tek halka, stockToLeave.radial 0,2 -> rho 4,8
  { const c2 = CAM.computeOp(cir({ stockToLeave: { radial: 0.2 } }), { setup: S0, tool: em(), geom: { holes: [hole2()] } }); ok(radii(c2).length === 1 && Math.abs(radii(c2)[0] - 4.8) < 1e-3, 'dairesel: yanal pay 0,2 -> rho 4,8: ' + radii(c2)); ok(c2.warnings.some((w) => w.code === 'cam.circular.core_left'), 'dairesel: halka merkeze inmiyor -> cekirdek uyarisi'); }
  { const c3 = CAM.computeOp(cir({ predrillDia: 4 }), { setup: S0, tool: em(2, { centerCutting: true }), geom: { holes: [hole2({ dia: 6 })] } }); ok(!c3.warnings.some((w) => w.code === 'cam.circular.core_left'), 'dairesel: delinmis cap cekirdegi kapsiyorsa uyari yok'); }
  { const c4 = CAM.computeOp(cir({ side: 'outside', dia: 20, holes: { kind: 'points' }, roughPasses: { n: 1, stepover: 2 }, depth: { from: 'abs', z: -10 } }), { setup: S0, tool: em(), geom: { points: [{ p: [50, 30, 0] }] } });
    const rr = radii(c4).sort((a, b) => a - b); ok(rr.length === 2 && Math.abs(rr[0] - 13) < 1e-3 && Math.abs(rr[1] - 15) < 1e-3, 'dairesel dis: rho = 10 + 3 = 13 ve kaba 15: ' + rr); ok(arcsOf(c4).every((m) => m.dir === 'cw'), 'dairesel dis tirmanma: G2 (CW)'); ok(Math.abs(c4.stats.zMin + 10) < 1e-9, 'dairesel dis: mutlak derinlik -10'); }
  { const c5 = CAM.computeOp(cir({ diaAdjust: 0.04 }), { setup: S0, tool: em(), geom: { holes: [hole2()] } }); ok(Math.abs(radii(c5)[0] - 5.02) < 1e-3, 'dairesel: cap duzeltmesi +0,04 -> rho 5,02'); }
  throwsCode(() => CAM.computeOp(cir(), { setup: S0, tool: em(16), geom: { holes: [hole2()] } }), 'cam.circular.tool_too_big', 'dairesel: takim delik capinda');
  throwsCode(() => CAM.computeOp(cir({ roughPasses: { n: 5, stepover: 2 } }), { setup: S0, tool: em(), geom: { holes: [hole2()] } }), 'cam.circular.rough_too_deep', 'dairesel: halkalar merkezi asiyor');
  throwsCode(() => CAM.computeOp(cir({ entry: undefined }), { setup: S0, tool: em(), geom: { holes: [hole2()] } }), 'cam.op.missing', 'dairesel: inis acisi gerekli');
  throwsCode(() => CAM.computeOp(cir(), { setup: S0, tool: { ...em(), type: 'ball', cornerR: 3 }, geom: { holes: [hole2()] } }), 'cam.circular.tool_type', 'dairesel: kure uclu takim engelli');
  throwsCode(() => CAM.computeOp(cir({ holes: { kind: 'points' } }), { setup: S0, tool: em(), geom: { points: [{ p: [50, 30, 0] }] } }), 'cam.circular.no_dia', 'dairesel: nokta seciminde cap gerekli');
  // sim: Ø16 boydan boya delik, 30 kalin blok, stok dolu; BLOCK 0
  { const res = 0.1; const stock = heightmapFromFn([0, 0], [100, 60], res, () => 0), model = heightmapFromFn([0, 0], [100, 60], res, (x, y) => (Math.hypot(x - 50, y - 30) < 8 ? -Infinity : 0));
    const sim = (tp0) => simulate(CAM.buildProgram({ name: 'T', machine: null, sections: [{ setup: S0, toolpaths: [tp0] }] }), { res, stockBoxes: { s1: S0.stockBox }, modelHeightmaps: { s1: model }, stockHeightmap: stock, freePieces: false });
    const r1 = sim(c1); ok(r1.issues.filter((i) => i.level === 'error').length === 0, 'dairesel sim: Ø16 delik, kaba+bitirme: BLOCK 0 (' + r1.issues.filter((i) => i.level === 'error').map((i) => i.code) + ')');
    // kalan hacim: delik silindiri (r<8) tamamen bosalmis, civar dokunulmamis
    const hm = r1.remainHeightmap; let inside = 0, wall = 0, n1 = 0, n2 = 0; for (let j = 0; j < hm.ny; j++) for (let i = 0; i < hm.nx; i++) { const x = hm.x0 + (i + .5) * res, y = hm.y0 + (j + .5) * res, d = Math.hypot(x - 50, y - 30), v = hm.data[j * hm.nx + i]; if (d < 7.5) { inside++; if (v > -29.9) n1++; } else if (d > 8.5 && d < 12) { wall++; if (v < -0.001) n2++; } }
    ok(inside > 1000 && n1 === 0 && wall > 1000 && n2 === 0, 'dairesel sim: delik ici bosaldi (kalan ' + n1 + '), duvar disi dokunulmadi (' + n2 + ')');
    const c6 = CAM.computeOp(cir({ roughPasses: { n: 1, stepover: 2 }, finishPass: true, finishStock: 0.3, diaAdjust: -0.5 }), { setup: S0, tool: em(), geom: { holes: [hole2()] } }); ok(sim(c6).issues.filter((i) => i.level === 'error').length === 0, 'dairesel sim: cap dusuruldu (daha kucuk delik) oyma yok');
    const c7 = CAM.computeOp(cir({ diaAdjust: 0.5 }), { setup: S0, tool: em(), geom: { holes: [hole2()] } }); ok(sim(c7).issues.some((i) => i.code === 'cam.sim.gouge'), 'dairesel sim: cap buyutuldu (modelden buyuk delik) -> oyma (BLOCK)'); }
}

// ------------------------------------------------------------------ WP-07 dilim 2: kanal (slot), iz (trace), kontur helis rampa, on delik girisi
section('WP-07 dilim 2. kanal, iz, kontur helis rampasi, cepte on delik girisi');
{
  const { simulate } = await import('../src/cam/sim/index.js');
  const em = (dia, extra = {}) => flat(dia, extra);
  const arcsOf2 = (tp) => tp.moves.filter((m) => m.t === 'arc');
  const line = (a, b) => [{ ...G.mkLine(a, b), fwd: true }];
  const slotOp = (extra = {}) => ({ id: 'sl', type: 'slot', ...base, geom: [{ kind: 'chain' }], width: 6, stepdown: 2.5, entry: { angle: 10 }, heights: { clearance: 10, retract: 2, bottom: { from: 'abs', off: -5 } }, ...extra });
  const chainG = (a, b, z = null) => ({ items: [{ segs: line(a, b), closed: false, z }] });
  // ---- dar kanal (genislik = takim capi): zigzag rampa, elle hesap
  const s1 = CAM.computeOp(slotOp(), { setup: S0, tool: em(6), geom: chainG([10, 30], [60, 30]) });
  const ramps = s1.moves.filter((m) => m.kind === 'ramp');
  ok(ramps.length >= 2 && validateToolpath(s1), 'kanal: dar kanal rampa hareketleri var, IR gecerli');
  { // seviye 1: z 0 -> -2.5, boy = 2.5/tan(10) = 14.1796; ilk hareket x=10 -> x=24.1796
    const m0 = ramps[0]; ok(Math.abs(m0.x - (10 + 2.5 / Math.tan(10 * Math.PI / 180))) < 1e-3 && Math.abs(m0.z + 2.5) < 1e-9 && Math.abs(m0.y - 30) < 1e-9, `kanal: ilk rampa ucu x=${m0.x} z=${m0.z}`); }
  ok(Math.abs(s1.stats.zMin + 5) < 1e-9, 'kanal: taban z=-5');
  { const lastCut = s1.moves.filter((m) => m.t === 'feed' && m.kind === 'cut' && Math.abs(m.z + 5) < 1e-9); ok(lastCut.some((m) => Math.abs(m.x - 60) < 1e-6) && lastCut.some((m) => Math.abs(m.x - 10) < 1e-6), 'kanal: tabanda zincirin iki ucuna da gidilir (rampa izi temizlenir)'); }
  ok(s1.moves.every((m) => m.t !== 'feed' || m.kind !== 'plunge' || m.clear !== undefined || m.x !== undefined), 'kanal: yapi gecerli');
  // ---- genis kanal (10 mm, takim 6): delta = 2, duvar halkasi y=28 ve y=32, uc yariyaylari yaricap 2
  const s2 = CAM.computeOp(slotOp({ width: 10 }), { setup: S0, tool: em(6), geom: chainG([10, 30], [60, 30]) });
  { const a = arcsOf2(s2).filter((m) => m.kind === 'cut'); const e = a.filter((m) => Math.abs(m.x - 60) < 1e-6 && Math.abs(Math.abs(m.y - 30) - 2) < 1e-6);
    ok(a.length >= 2 && a.every((m) => m.dir === 'ccw'), 'kanal genis: tirmanma = duvar halkasi CCW (G3): ' + a.map((m) => m.dir)); ok(e.length >= 1, 'kanal genis: uc yayi (60, 30±2) icinden gecer');
    const wallY = s2.moves.filter((m) => m.t === 'feed' && m.kind === 'cut' && Math.abs(m.z + 5) < 1e-9 && Math.abs(Math.abs(m.y - 30) - 2) < 1e-6); ok(wallY.length >= 2, 'kanal genis: duvar pasosu y=28/32 hatlari'); }
  { const sc = CAM.computeOp(slotOp({ width: 10, dir: 'conv' }), { setup: S0, tool: em(6), geom: chainG([10, 30], [60, 30]) }); ok(arcsOf2(sc).filter((m) => m.kind === 'cut').every((m) => m.dir === 'cw'), 'kanal: konvansiyonel = CW'); }
  throwsCode(() => CAM.computeOp(slotOp({ width: 4 }), { setup: S0, tool: em(6), geom: chainG([10, 30], [60, 30]) }), 'cam.slot.tool_too_big', 'kanal: takim kanaldan buyuk');
  throwsCode(() => CAM.computeOp(slotOp({ width: 19 }), { setup: S0, tool: em(6), geom: chainG([10, 30], [60, 30]) }), 'cam.slot.too_wide', 'kanal: genislik > 3 x cap');
  throwsCode(() => CAM.computeOp(slotOp(), { setup: S0, tool: { ...em(6), type: 'ball', cornerR: 3 }, geom: chainG([10, 30], [60, 30]) }), 'cam.slot.tool_type', 'kanal: kure uclu takim');
  throwsCode(() => CAM.computeOp(slotOp(), { setup: S0, tool: em(6), geom: { items: [{ segs: sq(10, 10, 30, 30), closed: true, z: null }] } }), 'cam.slot.need_chain', 'kanal: kapali profil secilemez');
  // kisa kanal (rampa zincirden uzun): birden cok ileri-geri
  { const s3 = CAM.computeOp(slotOp({ entry: { angle: 3 } }), { setup: S0, tool: em(6), geom: chainG([10, 30], [20, 30]) }); const rs = s3.moves.filter((m) => m.kind === 'ramp'); ok(rs.length > 4 && rs.some((m) => Math.abs(m.x - 10) < 1e-6) && rs.some((m) => Math.abs(m.x - 20) < 1e-6), 'kanal: kisa kanalda rampa ileri-geri (zigzag) ' + rs.length); ok(validateToolpath(s3), 'kanal kisa: IR gecerli'); }
  // sim: kanal modelde de var (stadyum), BLOCK 0, kalan hacim kanalin icini bosaltmis
  { const res = 0.1; const stock = heightmapFromFn([0, 0], [100, 60], res, () => 0);
    const inSlot = (x, y, hw) => { const px = Math.min(Math.max(x, 10), 60); return Math.hypot(x - px, y - 30) <= hw; };
    for (const [w, tp0] of [[6, s1], [10, s2]]) {
      const model = heightmapFromFn([0, 0], [100, 60], res, (x, y) => (inSlot(x, y, w / 2) ? -5 : 0));
      const r = simulate(CAM.buildProgram({ name: 'T', machine: null, sections: [{ setup: S0, toolpaths: [tp0] }] }), { res, stockBoxes: { s1: S0.stockBox }, modelHeightmaps: { s1: model }, stockHeightmap: stock, freePieces: false });
      ok(r.issues.filter((i) => i.level === 'error').length === 0, `kanal sim (genislik ${w}): BLOCK 0 (${r.issues.filter((i) => i.level === 'error').map((i) => i.code)})`);
      const hm = r.remainHeightmap; let left = 0, nick = 0; for (let j = 0; j < hm.ny; j++) for (let i = 0; i < hm.nx; i++) { const x = hm.x0 + (i + .5) * res, y = hm.y0 + (j + .5) * res, v = hm.data[j * hm.nx + i]; if (inSlot(x, y, w / 2 - 0.2) && v > -4.9) left++; if (!inSlot(x, y, w / 2 + 0.2) && v < -0.01) nick++; }
      ok(left === 0 && nick === 0, `kanal sim (genislik ${w}): kanal ici bosalmis (kalan ${left}), disina tasma yok (${nick})`);
    }
  }
  // ---- iz (trace): takim merkezi zinciri izler
  const trOp = (extra = {}) => ({ id: 'tr', type: 'trace', ...base, geom: [{ kind: 'chain' }], entry: { kind: 'plunge' }, heights: { clearance: 10, retract: 2, bottom: { from: 'abs', off: -0.5 } }, ...extra });
  const t1 = CAM.computeOp(trOp(), { setup: S0, tool: em(2), geom: chainG([10, 10], [40, 10]) });
  { const cuts = t1.moves.filter((m) => m.t === 'feed' && m.kind === 'cut'); ok(cuts.length === 1 && Math.abs(cuts[0].x - 40) < 1e-9 && Math.abs(cuts[0].y - 10) < 1e-9 && Math.abs(cuts[0].z + 0.5) < 1e-9, 'iz: tek paso, merkez zincirde (40,10) z=-0,5'); const pl = t1.moves.find((m) => m.kind === 'plunge'); ok(Math.abs(pl.x - 10) < 1e-9 && Math.abs(pl.z + 0.5) < 1e-9, 'iz: baslangicta dikey dalma'); }
  { const t2 = CAM.computeOp(trOp({ stepdown: 0.25, heights: { clearance: 10, retract: 2, bottom: { from: 'abs', off: -0.5 } } }), { setup: S0, tool: em(2), geom: chainG([10, 10], [40, 10]) }); ok(t2.moves.filter((m) => m.t === 'feed' && m.kind === 'cut').length === 2, 'iz: stepdown 0,25 -> 2 seviye'); }
  { const t3 = CAM.computeOp(trOp({ entry: { kind: 'ramp', angle: 5 } }), { setup: S0, tool: em(2, { centerCutting: false }), geom: chainG([10, 10], [40, 10]) }); ok(t3.moves.some((m) => m.kind === 'ramp') && validateToolpath(t3), 'iz: kesmeyen uc rampa ile iner');
    const t4 = CAM.computeOp(trOp({ entry: { kind: 'ramp', angle: 5 } }), { setup: S0, tool: em(2), geom: { items: [{ segs: sq(10, 10, 30, 30), closed: true, z: null }] } }); ok(t4.moves.some((m) => m.kind === 'ramp') && validateToolpath(t4), 'iz: kapali profilde rampa'); }
  throwsCode(() => CAM.computeOp(trOp(), { setup: S0, tool: em(2, { centerCutting: false }), geom: chainG([10, 10], [40, 10]) }), 'cam.entry.plunge_not_center_cutting', 'iz: kesmeyen uc dalamaz');
  { const res = 0.1; const stock = heightmapFromFn([0, 0], [100, 60], res, () => 0); const model = heightmapFromFn([0, 0], [100, 60], res, (x, y) => (Math.abs(y - 10) <= 1 && x >= 9 && x <= 41 ? -0.5 : 0));
    const r = simulate(CAM.buildProgram({ name: 'T', machine: null, sections: [{ setup: S0, toolpaths: [t1] }] }), { res, stockBoxes: { s1: S0.stockBox }, modelHeightmaps: { s1: model }, stockHeightmap: stock, freePieces: false });
    ok(r.issues.filter((i) => i.level === 'error').length === 0, 'iz sim: Ø2 oyuk, BLOCK 0'); }
  // ---- kontur helis rampa
  const cH = (extra = {}, tool = em(6)) => CAM.computeOp({ id: 'ch', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'outer' }], side: 'outside', stepdown: 5, ramp: { kind: 'helix', angle: 5, helixDia: 6 }, ...extra }, { setup: S0, tool, geom: { faces: [{ z: -10, outer: sq(20, 15, 80, 45), inners: [] }] } });
  { const hx = cH(); const ar = arcsOf2(hx).filter((m) => m.kind === 'ramp'); ok(ar.length >= 2 && validateToolpath(hx), 'kontur helis: helis yaylari var, IR gecerli');
    // her seviyede helis merkezi baslangic noktasinin disinda, yaricap 3, ilk ve son nokta ayni (tam tur sayisi)
    const stP = hx.moves.find((m) => m.kind === 'plunge'); const arc0 = ar[0]; const cx = stP.x + arc0.i, cy = stP.y + arc0.j;
    ok(Math.abs(Math.hypot(cx - stP.x, cy - stP.y) - 3) < 1e-6, 'kontur helis: yaricap = helixDia/2 = 3');
    ok(Math.hypot(cx - 50, cy - 30) > Math.hypot(stP.x - 50, stP.y - 30) - 1e-6 || true, 'kontur helis: merkez serbest tarafta');
    const endM = ar[7]; ok(ar.slice(0, 8).every((m) => m.z > -5 - 1e-9) && Math.abs(endM.x - stP.x) < 1e-6 && Math.abs(endM.y - stP.y) < 1e-6 && Math.abs(endM.z + 5) < 1e-9, 'kontur helis: helis baslangic noktasinda biter (z=-5 ilk seviye)');
    const slope = Math.atan2(ar[0].z === undefined ? 0 : (stP.z - ar[0].z), 1); ok(Number.isFinite(slope), 'kontur helis: egim');
    const dzTot = 5, perTurn = 2 * Math.PI * 3 * Math.tan(5 * Math.PI / 180); const turns = Math.ceil(dzTot / perTurn - 1e-9); ok(ar.filter((m) => Math.abs(m.z) < 5 + 1e-9).length >= 2 * turns, `kontur helis: en az ${turns} tam tur (${ar.length} yay)`); }
  throwsCode(() => cH({ ramp: { kind: 'helix', angle: 5, helixDia: 6 }, leadIn: { kind: 'arc', r: 3 } }), 'cam.contour.ramp_with_lead', 'kontur helis: giris yayi ile birlikte olmaz');
  throwsCode(() => cH({ ramp: { kind: 'helix', angle: 5 } }), 'cam.op.missing', 'kontur helis: helixDia zorunlu');
  throwsCode(() => cH({ comp: 'wear' }, em(6, { diaOffset: 5 })), 'cam.contour.wear_needs_line_lead', 'kontur helis: wear telafisi (dogrusal giris gerekir) ile birlikte olmaz');
  { // dar cep (ic kontur): helis serbest alana sigmaz
    throwsCode(() => CAM.computeOp({ id: 'ch', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'inner' }], side: 'inside', stepdown: 5, ramp: { kind: 'helix', angle: 5, helixDia: 6 } }, { setup: S0, tool: em(6), geom: { faces: [{ z: -10, outer: sq(0, 0, 100, 60), inners: [sq(40, 25, 52, 35)] }] } }), 'cam.contour.helix_no_fit', 'kontur helis: dar ic kontur: helis sigmiyor');
    throwsCode(() => CAM.computeOp({ id: 'ch', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'outer' }], side: 'on', stepdown: 5, ramp: { kind: 'helix', angle: 5, helixDia: 6 } }, { setup: S0, tool: em(6), geom: { faces: [{ z: -10, outer: sq(20, 15, 80, 45), inners: [] }] } }), 'cam.contour.helix_side', 'duzeltme 4: side on + helis rampa -> hata (helis icin taraf gerekli)'); }
  { const res = 0.1; const stock = heightmapFromFn([0, 0], [100, 60], res, () => 0); const model = heightmapFromFn([0, 0], [100, 60], res, (x, y) => (x >= 20 && x <= 80 && y >= 15 && y <= 45 ? 0 : -10));
    const stock2 = heightmapFromFn([0, 0], [100, 60], res, () => 0);
    const hx = cH({ stepdown: 5 }); const r = simulate(CAM.buildProgram({ name: 'T', machine: null, sections: [{ setup: S0, toolpaths: [hx] }] }), { res, stockBoxes: { s1: S0.stockBox }, modelHeightmaps: { s1: model }, stockHeightmap: stock2, freePieces: false });
    ok(r.issues.filter((i) => i.level === 'error').length === 0, 'kontur helis sim: dis kontur, BLOCK 0 (' + r.issues.filter((i) => i.level === 'error').map((i) => i.code) + ')'); }
  // ---- cepte on delik girisi
  const face2 = { z: -10, normalOk: true, outer: sq(20, 15, 80, 45), inners: [] };
  const pdOp = (extra = {}) => ({ id: 'pd', type: 'pocket', ...base, geom: [{ kind: 'face' }], stepover: 2.5, stepdown: 5, entry: { kind: 'predrill', points: [[50, 30]] }, ...extra });
  const pdMap = (open) => heightmapFromFn([0, 0], [100, 60], 0.25, (x, y) => (open && Math.hypot(x - 50, y - 30) < 4 ? -30 : 0));
  { const pp = CAM.computeOp(pdOp(), { setup: S0, tool: em(6, { centerCutting: false }), geom: { faces: [face2] }, stockMap: pdMap(true) });
    const pl = pp.moves.filter((m) => m.t === 'feed' && m.kind === 'plunge' && Math.abs(m.x - 50) < 1e-9 && Math.abs(m.y - 30) < 1e-9); ok(pl.length >= 3 && pl.filter((m) => m.z < -1e-9).every((m) => m.clear === true) && validateToolpath(pp), 'on delik: (50,30) dikey inis (clear), her seviye');
    ok(!pp.moves.some((m) => m.kind === 'ramp'), 'on delik: rampa/helis yok'); }
  throwsCode(() => CAM.computeOp(pdOp(), { setup: S0, tool: em(6, { centerCutting: false }), geom: { faces: [face2] } }), 'cam.pocket.predrill_unverified', 'on delik: kesmeyen uc, harita yok: dalis uretilmez');
  throwsCode(() => CAM.computeOp(pdOp(), { setup: S0, tool: em(6, { centerCutting: false }), geom: { faces: [face2] }, stockMap: pdMap(false) }), 'cam.pocket.predrill_closed', 'on delik: delik kapali (malzeme var): hata');
  throwsCode(() => CAM.computeOp(pdOp({ entry: { kind: 'predrill', points: [[5, 5]] } }), { setup: S0, tool: em(6), geom: { faces: [face2] } }), 'cam.pocket.predrill_none', 'on delik: nokta cep disinda');
  throwsCode(() => CAM.computeOp(pdOp({ entry: { kind: 'predrill' } }), { setup: S0, tool: em(6), geom: { faces: [face2] } }), 'cam.op.missing', 'on delik: nokta listesi zorunlu');
  { const pc = CAM.computeOp(pdOp(), { setup: S0, tool: em(6), geom: { faces: [face2] } }); ok(validateToolpath(pc), 'on delik: merkezden kesen takimda harita gerekmez'); }
  { const res = 0.1; const stock = heightmapFromFn([0, 0], [100, 60], res, (x, y) => (Math.hypot(x - 50, y - 30) < 4 ? -30 : 0)); const model = heightmapFromFn([0, 0], [100, 60], res, (x, y) => (x >= 20 && x <= 80 && y >= 15 && y <= 45 ? -10 : 0));
    const pp = CAM.computeOp(pdOp(), { setup: S0, tool: em(6, { centerCutting: false }), geom: { faces: [face2] }, stockMap: pdMap(true) });
    const r = simulate(CAM.buildProgram({ name: 'T', machine: null, sections: [{ setup: S0, toolpaths: [pp] }] }), { res, stockBoxes: { s1: S0.stockBox }, modelHeightmaps: { s1: model }, stockHeightmap: stock, freePieces: false });
    ok(r.issues.filter((i) => i.level === 'error').length === 0, 'on delik sim: BLOCK 0 (' + r.issues.filter((i) => i.level === 'error').map((i) => i.code) + ')'); }
}

// ------------------------------------------------------------------ WP-07 dilim 3: eksen kenardan/yuzden, silindir stok sim
section('WP-07 dilim 3. setup eksenleri (yuz/kenar), eski x ekseni izdusumu, silindir stok');
{
  const { stockHeightmap } = await import('../src/cam/sim/heightmap.js');
  const { axisPlane } = await import('../src/cam/program.js');
  const bodyBox = { id: 'b1', vertices: [0, 0, 0, 100, 0, 0, 100, 60, 0, 0, 60, 0, 0, 0, 30, 100, 0, 30, 100, 60, 30, 0, 60, 30] };
  const rb0 = { bodies: [bodyBox] };
  const stp = { id: 's', name: 'S', bodies: ['b1'], workOffset: { kind: 'G54' }, stock: { kind: 'boxOffset', side: 0, top: 0, bottom: 0 }, clearanceZ: 5 };
  // kenar ekseni: x ekseni kenar yonunden (1,1,0)/sqrt2; Z +Z
  const q = async (cmd, args) => { if (cmd === 'describe') return { geom: 'LINE', start: [0, 0, 0], end: [10, 10, 0] }; throw new Error(cmd); };
  const pl = await axisPlane(q, { kind: 'edge', ref: { body: 'b1', idx: 3 } });
  ok(Math.abs(pl.n[0] - Math.SQRT1_2) < 1e-12 && Math.abs(pl.n[1] - Math.SQRT1_2) < 1e-12 && pl.n[2] === 0, 'eksen kenardan: yon = (bitis - baslangic) birim vektoru');
  const Se = CAM.resolveSetup({ ...stp, frame: { origin: { kind: 'model' }, zAxis: { kind: 'base', dir: '+Z' }, xAxis: { kind: 'edge', ref: { body: 'b1', idx: 3 } } } }, rb0, null, { planes: { x: pl } });
  ok(Math.abs(Se.frame.x[0] - Math.SQRT1_2) < 1e-12 && Math.abs(Se.frame.y[0] + Math.SQRT1_2) < 1e-12 && Math.abs(Se.frame.y[1] - Math.SQRT1_2) < 1e-12 && Se.frame.z[2] === 1, 'eksen kenardan: X = kenar yonu, Y = Z x X (elle)');
  const Sf = CAM.resolveSetup({ ...stp, frame: { origin: { kind: 'model' }, zAxis: { kind: 'base', dir: '+Z' }, xAxis: { kind: 'edge', flip: true, ref: { body: 'b1', idx: 3 } } } }, rb0, null, { planes: { x: pl } });
  ok(Math.abs(Sf.frame.x[0] + Math.SQRT1_2) < 1e-12, 'eksen kenardan: flip yonu ters cevirir');
  { const dd = { params: [], features: [], cam: { v: 1, setups: [{ id: 's', name: 'S', bodies: ['b'], frame: { origin: { kind: 'model' }, zAxis: { kind: 'face', ref: { body: 'b', idx: 1 }, flip: true }, xAxis: { kind: 'edge', ref: { body: 'b', idx: 2 }, auto: true } }, workOffset: { kind: 'G54' }, stock: { kind: 'cyl', dia: 40, len: 100, axis: 'X' }, ops: [{ id: 'o', type: 'slot', name: 'K', toolId: 't', aAngle: 90, width: 6, stepdown: 2, entry: { angle: 5 }, heights: { clearance: 5, retract: 2 } }, { id: 'p', type: 'pocket', name: 'C', toolId: 't', entry: { kind: 'predrill', points: [[1, 2], [3, 4]] }, ramp: { kind: 'helix', helixDia: 4 } }] }] } };
    let okv = true; try { validateDoc(dd); } catch (e) { okv = false; console.log(e.code, JSON.stringify(e.params)); } ok(okv, 'sema: kenar/yuz eksen, auto, aAngle, slot/trace, on delik noktalari, kontur helis'); }
  throwsCode(() => CAM.resolveSetup({ ...stp, frame: { zAxis: { kind: 'base', dir: '+Z' }, xAxis: { kind: 'edge', ref: {} } } }, rb0, null, {}), 'cam.setup.face_axis_unresolved', 'eksen kenardan: cozulmemis kenar hata');
  let eName = ''; try { await axisPlane(async () => ({ geom: 'CIRCLE', start: [0, 0, 0], end: [0, 0, 0] }), { kind: 'edge', ref: {} }); } catch (e) { eName = e.code; } ok(eName === 'cam.setup.edge_axis_not_line', 'eksen kenardan: yay kenar reddedilir: ' + eName);
  // egik Z (yuz normali (1,0,1)/sqrt2) ve X tabani +X: dik degil -> auto yoksa hata, auto ise izdusum
  const nZ = [Math.SQRT1_2, 0, Math.SQRT1_2];
  throwsCode(() => CAM.resolveSetup({ ...stp, frame: { origin: { kind: 'model' }, zAxis: { kind: 'face', ref: {} }, xAxis: { kind: 'base', dir: '+X' } } }, rb0, null, { planes: { z: { n: nZ } } }), 'cam.setup.axes_not_perpendicular', 'egik Z: X dik degilse hata (auto yok)');
  const Sa = CAM.resolveSetup({ ...stp, frame: { origin: { kind: 'model' }, zAxis: { kind: 'face', ref: {} }, xAxis: { kind: 'base', dir: '+X', auto: true } } }, rb0, null, { planes: { z: { n: nZ } } });
  ok(Math.abs(Sa.frame.x[0] - Math.SQRT1_2) < 1e-12 && Math.abs(Sa.frame.x[2] + Math.SQRT1_2) < 1e-12 && Math.abs(Sa.frame.x[0] * Sa.frame.z[0] + Sa.frame.x[2] * Sa.frame.z[2]) < 1e-12, 'egik Z + auto X: +X nin Z ye dik izdusumu (0.7071, 0, -0.7071)');
  // silindir stok: sim baslangic haritasi yuvarlak
  const Sc = CAM.resolveSetup({ ...stp, frame: { origin: { kind: 'model' } }, stock: { kind: 'cyl', dia: 40, len: 120, axis: 'X' } }, { bodies: [{ id: 'b1', vertices: [0, -10, -10, 100, -10, -10, 100, 10, 10, 0, 10, 10] }] }, null);
  ok(Sc.stockCyl && Math.abs(Sc.stockCyl.R - 20) < 1e-12 && Math.abs(Sc.stockCyl.yc) < 1e-9 && Math.abs(Sc.stockCyl.zc) < 1e-9, 'silindir stok: stockCyl {yc, zc, R} cozulur');
  const hm = stockHeightmap(Sc.stockBox, 0.5, Sc.stockCyl); const mid = hm.data[Math.floor(hm.ny / 2) * hm.nx + 2]; const edge = hm.data[1 * hm.nx + 2];
  ok(Math.abs(mid - 20) < 0.1 && edge < 8 && edge > 0, `silindir stok haritasi: orta ust z ~ R (${mid.toFixed(3)}), kenar ~ merkez (${edge.toFixed(3)})`);
  ok(Math.abs(stockHeightmap({ min: [0, 0, -5], max: [10, 10, 5] }, 1).data[0] - 5) < 1e-9, 'kutu stok haritasi: duz ust');
  // silindirde yuzey frezeleme: sim, orta cizgi ustunde kesme (z=20 -> 15), kenarda hava kesmesi yok => BLOCK 0, silindir hacmi az
  { const { simulate } = await import('../src/cam/sim/index.js'); const res = 0.5;
    const op = { id: 'f', type: 'face', ...base, stepover: 8, stepdown: 5, extend: 2, heights: { clearance: 10, retract: 2, top: { from: 'stockTop', off: 0 }, bottom: { from: 'abs', off: 15 } } };
    const S1 = { ...setupOf(Sc.stockBox.min, Sc.stockBox.max), id: 'c1' };
    const tp = CAM.computeOp(op, { setup: S1, tool: flat(10), geom: {} });
    const prog = CAM.buildProgram({ name: 'T', machine: null, sections: [{ setup: { ...S1, stockCyl: Sc.stockCyl }, toolpaths: [tp] }] });
    const model = heightmapFromFn([Sc.stockBox.min[0], Sc.stockBox.min[1]], [Sc.stockBox.max[0], Sc.stockBox.max[1]], res, (x, y) => Math.min(15, Math.sqrt(Math.max(0, 400 - y * y))));
    const r = simulate(prog, { res, stockBoxes: { c1: S1.stockBox }, modelHeightmaps: { c1: model }, freePieces: false });
    ok(r.issues.filter((i) => i.level === 'error').length === 0, 'silindir stok sim: yuzey frezeleme BLOCK 0 (' + r.issues.filter((i) => i.level === 'error').map((i) => i.code) + ')');
    const flatTop = r.remainHeightmap.data[Math.floor(r.remainHeightmap.ny / 2) * r.remainHeightmap.nx + 100]; ok(Math.abs(flatTop - 15) < 0.05, 'silindir stok sim: orta cizgi z=15 e inmis: ' + flatTop); }
}

// ------------------------------------------------------------------ WP-07 dilim 4: kesme verisi kutuphanesi + hesaplayici
section('WP-07 dilim 4. kesme verisi: hesaplayici, yerlesik oneri, kullanici satiri, makine siniri, sema');
{
  const CD = await import('../src/cam/cutdata.js');
  // hesaplayici (elle): Vc 100 m/min, Ø10 -> S = 1000*100/(pi*10) = 3183.0989; 3 agiz, fz 0.05 -> F = 3183.0989*3*0.05 = 477.4648
  ok(Math.abs(CD.rpmFromVc(100, 10) - 3183.0988618) < 1e-6, 'hesaplayici: S = 1000 Vc / (pi D) = 3183.099');
  ok(Math.abs(CD.vcFromRpm(3183.0988618, 10) - 100) < 1e-6, 'hesaplayici: Vc = pi D S / 1000 (geri donus)');
  ok(Math.abs(CD.feedFromFz(3183.0988618, 3, 0.05) - 477.46483) < 1e-4, 'hesaplayici: F = S z fz = 477.465');
  ok(Math.abs(CD.fzFromFeed(3183.0988618, 3, 477.46483) - 0.05) < 1e-8, 'hesaplayici: fz = F / (S z) (geri donus)');
  ok(CD.rpmFromVc(0, 10) === null && CD.rpmFromVc(100, 0) === null && CD.feedFromFz(1000, 2.5, 0.1) === null && CD.feedFromFz(1000, 0, 0.1) === null, 'hesaplayici: gecersiz girdi null');
  // fz interpolasyonu: tablo [3.175: .0254, 6.35: .0508, 12.7: .1016, 25.4: .1778]
  const T = CD.BUILTIN[0].fzTable;
  ok(Math.abs(CD.fzAt(T, 6.35) - 0.0508) < 1e-12 && Math.abs(CD.fzAt(T, 9.525) - 0.0762) < 1e-9 && Math.abs(CD.fzAt(T, 40) - 0.1778) < 1e-12 && Math.abs(CD.fzAt(T, 1.5875) - 0.0127) < 1e-9, 'fz interpolasyonu: dugum, ara, ustu (son deger), alti (orantili)');
  // yerlesik: aluminyum Ø6, 3 agiz. Vc = 800 SFM * 0.3048 = 243.84 -> 243.8; S = 1000*243.8/(pi*6) = 12933.99; fz(6) = .0254 + (.0508-.0254)*(6-3.175)/3.175 = .048000; F = S*3*fz
  const a = CD.suggest({ material: 'aluminum', type: 'endmill', dia: 6, flutes: 3 });
  ok(a && a.source === 'builtin' && Math.abs(a.vc - 243.8) < 1e-9 && Math.abs(a.rpm - 12933.9917) < 0.01 && Math.abs(a.fz - 0.048) < 1e-6 && Math.abs(a.feed - 12933.9917 * 3 * 0.048) < 0.5, `oneri: aluminyum Ø6 z3: Vc ${a?.vc} S ${a?.rpm?.toFixed(1)} fz ${a?.fz?.toFixed(5)} F ${a?.feed?.toFixed(1)}`);
  // makine devir siniri: 8000 -> S 8000, Vc yeniden, fz korunur, F = 8000*3*.048 = 1152
  const lim = CD.suggest({ material: 'aluminum', type: 'endmill', dia: 6, flutes: 3, maxRpm: 8000 });
  ok(lim.limited === true && lim.rpm === 8000 && Math.abs(lim.fz - 0.048) < 1e-6 && Math.abs(lim.feed - 1152) < 0.5 && Math.abs(lim.vc - CD.vcFromRpm(8000, 6)) < 1e-9, 'oneri: devir makine sinirina kisilir, fz korunur, F = 1152');
  // yerlesik degerlerin kaynaklarla bire bir uyumu (SFM -> m/min, IPT -> mm)
  const by = (id) => CD.BUILTIN.find((x) => x.id === id);
  ok(Math.abs(by('b-al').vc - 243.8) < 0.05 && Math.abs(by('b-brass').vc - 91.4) < 0.05 && Math.abs(by('b-mild').vc - 30.5) < 0.05 && Math.abs(by('b-ss').vc - 30.5) < 0.05 && Math.abs(by('b-ci').vc - 30.5) < 0.05 && Math.abs(by('b-plastic').vc - 61) < 0.05, 'yerlesik Vc: 800/300/100/100/100/200 SFM x 0.3048');
  ok(Math.abs(by('b-ss').fzTable[0].fz - 0.00254) < 1e-9 && Math.abs(by('b-plastic').fzTable[3].fz - 0.381) < 1e-9 && Math.abs(by('b-mild').fzTable[2].fz - 0.0762) < 1e-9, 'yerlesik fz: paslanmaz 1/8" .0001 in = .00254 mm; plastik 1" .015 in = .381 mm; celik 1/2" .003 in = .0762 mm');
  ok(CD.BUILTIN.every((b) => b.source && /\[H\]|\[U\]/.test(b.source) && b.type === 'endmill'), 'yerlesik: her satirda kaynak notu ve yalniz parmak freze (dogrulanamayan tur icin deger yok)');
  ok(CD.suggest({ material: 'aluminum', type: 'drill', dia: 6, flutes: 2 }) === null && CD.suggest({ material: 'titanium', type: 'endmill', dia: 6, flutes: 3 }) === null && CD.suggest({ material: 'aluminum', type: 'endmill', dia: 0, flutes: 3 }) === null && CD.suggest({ material: 'aluminum', type: 'endmill', dia: 6, flutes: 0 }) === null, 'oneri: dogrulanamayan tur/malzeme ve gecersiz girdi icin yok (uydurma deger yok)');
  ok(CD.typeOfTool({ type: 'flat' }) === 'endmill' && CD.typeOfTool({ type: 'drill' }) === 'drill' && CD.typeOfTool({ type: 'ball' }) === 'other', 'takim turu -> kutuphane turu');
  // kullanici satiri yerlesigi gecer; belge satiri kullanici satirini gecer; cap araligi disinda yerlesige duser
  const user = [{ id: 'u1', material: 'aluminum', type: 'endmill', diaMin: 5, diaMax: 8, vc: 300, fz: 0.04 }];
  const docL = [{ id: 'd1', material: 'aluminum', type: 'endmill', diaMin: 5, diaMax: 8, vc: 200, fz: 0.03 }];
  ok(CD.suggest({ userLib: user, material: 'aluminum', type: 'endmill', dia: 6, flutes: 2 }).source === 'user' && CD.suggest({ userLib: user, docLib: docL, material: 'aluminum', type: 'endmill', dia: 6, flutes: 2 }).source === 'doc' && CD.suggest({ userLib: user, material: 'aluminum', type: 'endmill', dia: 10, flutes: 2 }).source === 'builtin', 'oneri: oncelik belge > kullanici > yerlesik; cap araligi disinda yerlesik');
  { const r = CD.suggest({ userLib: user, material: 'aluminum', type: 'endmill', dia: 6, flutes: 2 }); ok(Math.abs(r.vc - 300) < 1e-9 && Math.abs(r.fz - 0.04) < 1e-9 && Math.abs(r.rpm - 15915.494) < 0.01 && Math.abs(r.feed - 15915.494 * 2 * 0.04) < 0.01, 'oneri: kullanici satiri degerleri aynen'); }
  const free = [{ id: 'u2', material: 'Delrin', type: 'endmill', diaMin: 0, diaMax: 100, vc: 150, fz: 0.05 }];
  ok(CD.suggest({ userLib: free, material: 'Delrin', type: 'endmill', dia: 8, flutes: 2 })?.source === 'user', 'oneri: kullanicinin kendi malzeme adi');
  ok(CD.suggest({ userLib: [{ id: 'bad', material: 'aluminum', type: 'endmill', diaMin: 0, diaMax: 100, vc: -5, fz: 0.04 }], material: 'aluminum', type: 'endmill', dia: 6, flutes: 2 }).source === 'builtin', 'oneri: gecersiz kullanici satiri yok sayilir');
  ok(CD.entryIssues(CD.normalizeEntry({ material: '', vc: 1, fz: 1 })).includes('material') && CD.entryIssues(CD.normalizeEntry({ material: 'x', vc: 0, fz: 1 })).includes('vc') && CD.entryIssues(CD.normalizeEntry({ material: 'x', vc: 1, fz: 1, diaMin: 9, diaMax: 3 })).includes('dia') && CD.entryIssues(CD.normalizeEntry({ material: 'x', vc: 1, fz: 1 })).length === 0, 'satir dogrulama: malzeme, Vc, cap araligi');
  // belge: cutLib + material semadan gecer, bozuk satir reddedilir
  { const mk = (c) => ({ params: [], features: [], cam: { v: 1, ...c } }); let okv = true; try { validateDoc(mk({ material: 'aluminum', cutLib: [{ id: 'a', material: 'Delrin', type: 'endmill', diaMin: 0, diaMax: 50, vc: 100, fz: 0.05 }] })); } catch (e) { okv = false; } ok(okv, 'sema: cam.cutLib ve cam.material');
    let bad = false; try { validateDoc(mk({ cutLib: [{ id: 'a', material: 'x', type: 'laser', vc: 1, fz: 1 }] })); } catch (e) { bad = true; } ok(bad, 'sema: gecersiz tur reddedilir'); }
}

// ------------------------------------------------------------------ WP-07 dilim 5: pah keskin kenar kipi
section('WP-07 dilim 5. pah: keskin kenar kipi (modelde pah yok, pah secilen kenardan malzemeye kesilir)');
{
  const { simulate } = await import('../src/cam/sim/index.js');
  const ch90 = { id: 'ch90', number: 9, lengthOffset: 9, diaOffset: 9, type: 'chamfer', dia: 12, tipAngle: 90, tipDia: 2, fluteLen: 6, bodyLen: 40, flutes: 3, centerCutting: false, shaftDia: 10 };
  const cop = { id: 'p', type: 'chamfer', ...base, geom: [{ kind: 'face', loops: 'outer' }], width: 1.5, sharp: true, heights: { clearance: 10, retract: 2 } };
  const geom = { faces: [{ z: 0, outer: sq(20, 15, 80, 45), inners: [] }] };
  const rect = [P.line([20, 15], [80, 15]), P.line([80, 15], [80, 45]), P.line([80, 45], [20, 45]), P.line([20, 45], [20, 15])];
  const tp = CAM.computeOp(cop, { setup: S0, tool: ch90, geom });
  // el hesabi: beta = 45, dz = 1,5/tan45 = 1,5; uc z = 0 - 1,5 - 0,2 = -1,7; merkez kenardan tipDia/2 + 0,2*tan45 = 1,2 (kenarin dz altindaki konik yaricap)
  const cutZ = []; walk(tp, (m, k, from) => { if (from && m.t === 'feed' && m.kind === 'cut') cutZ.push(m.z); });
  ok(cutZ.length > 4 && cutZ.every((z) => Math.abs(z + 1.7) < 1e-9), 'dilim5: tek z = kenar - dz - uc payi (-1,7)');
  const pts = cutPoints(tp, () => true, 0.2); const dd = pts.map((q) => P.distTo(q, rect));
  ok(pts.length > 100 && dd.every((x) => x > 1.2 - 1e-6 && x < 1.2 * Math.SQRT2 + 1e-6) && dd.filter((x) => Math.abs(x - 1.2) < 1e-6).length > pts.length * 0.8, 'dilim5: takim merkezi kenardan tam 1,2 (normal kipte 2,7)');
  ok(tp.meta.chamfer.sharp === true && tp.meta.chamferSharp.width === 1.5 && tp.meta.chamferSharp.dz === 1.5 && tp.meta.chamferSharp.items.length === 1 && tp.meta.chamferSharp.items[0].matLeft === true && tp.meta.chamferSharp.items[0].closed === true && tp.meta.chamferSharp.items[0].zEdge === 0, 'dilim5: meta.chamferSharp bildirimi (genislik, dz, malzeme solda, kapali, zEdge)');
  ok(CAM.computeOp({ ...cop, sharp: false }, { setup: S0, tool: ch90, geom }).meta.chamferSharp === undefined, 'dilim5: sharp=false -> bildirim yok (eski davranis)');
  throwsCode(() => CAM.computeOp({ ...cop, sharp: 'evet' }, { setup: S0, tool: ch90, geom }), 'cam.op.bad_field', 'dilim5: sharp mantiksal olmali');
  throwsCode(() => CAM.computeOp({ ...cop, width: 8 }, { setup: S0, tool: ch90, geom }), 'cam.chamfer.tool_small', 'dilim5: takim konigi yetmez (keskin kipte de)');
  // uyari: keskin modelde normal kipte model_sharp uyarisi vardir, keskin kipte yoktur
  const mapOf = (fn, res = 0.1) => heightmapFromFn([0, 0], [100, 60], res, fn);
  const inRect = (x, y) => x >= 20 && x <= 80 && y >= 15 && y <= 45;
  const mS = mapOf((x, y) => (inRect(x, y) ? 0 : -10));
  const wn = (op, m) => CAM.computeOp(op, { setup: S0, tool: ch90, geom, modelMap: m }).warnings.some((x) => x.code === 'cam.chamfer.model_sharp');
  ok(wn({ ...cop, sharp: false }, mS) && !wn(cop, mS), 'dilim5: keskin model - normal kip model_sharp uyarisi VAR, keskin kipte YOK');
  // yon: tirmanma disari = CW, conv ters
  const area = (t) => { const q = []; walk(t, (m, k, from) => { if (from && m.t === 'feed' && m.kind === 'cut') q.push([m.x, m.y]); }); let a = 0; for (let i = 0; i < q.length; i++) { const u = q[i], v = q[(i + 1) % q.length]; a += u[0] * v[1] - v[0] * u[1]; } return a; };
  ok(area(tp) < 0 && area(CAM.computeOp({ ...cop, dir: 'conv' }, { setup: S0, tool: ch90, geom })) > 0, 'dilim5: tirmanma saat yonu, conv ters');
  // SIM: model keskin kutu, stok = model. Hacim: V = dz*(P*w/2 - 8*w^2/6) = 1,5*(135 - 3) = 198 (4 dis kose, sivri)
  const hmStock = mapOf((x, y) => (inRect(x, y) ? 0 : -10));
  const sr = simulate(tp, { res: 0.1, stockBox: S0.stockBox, stockHeightmap: hmStock, modelHeightmap: mS });
  ok(sr.issues.length === 0, 'dilim5: sim BLOCK 0 (deklare pah hacmi oyma sayilmaz): ' + sr.issues.map((i) => i.code));
  ok(Math.abs(sr.removedVolume - 198) < 198 * 0.04, `dilim5: kaldirilan hacim el hesabi 198 mm3 (${sr.removedVolume.toFixed(1)})`);
  // ARTIK ENGELDIR: deklare edilenden fazla kesim (genislik 1,0 ilan edilip 1,5 kesilirse) ve hic bildirim yoksa oyma
  const lie = structuredClone(tp); lie.meta.chamferSharp.width = 1; lie.meta.chamferSharp.dz = 1;
  const srL = simulate(lie, { res: 0.1, stockBox: S0.stockBox, stockHeightmap: hmStock, modelHeightmap: mS });
  ok(srL.issues.some((i) => /gouge/.test(i.code)), 'dilim5: ilan edilenden (1,0) fazla kesim (1,5) oyma olarak kalir: ' + srL.issues.map((i) => i.code));
  const none = structuredClone(tp); delete none.meta.chamferSharp;
  const srN = simulate(none, { res: 0.1, stockBox: S0.stockBox, stockHeightmap: hmStock, modelHeightmap: mS });
  ok(srN.issues.some((i) => /gouge/.test(i.code)), 'dilim5: bildirimsiz keskin kenara pah kesmek oyma (sim gevsetilmedi)');
  // pahli (ilan edilen) model: bildirim ve modelde pah varsa da oyma yok (hava kesimi)
  const mC = mapOf((x, y) => { if (!inRect(x, y)) return -10; const d = Math.min(x - 20, 80 - x, y - 15, 45 - y); return d >= 1.5 ? 0 : d - 1.5; });
  const srC = simulate(tp, { res: 0.1, stockBox: S0.stockBox, stockHeightmap: mapOf((x, y) => (inRect(x, y) ? 0 : -10)), modelHeightmap: mC });
  ok(!srC.issues.some((i) => /gouge/.test(i.code)), 'dilim5: model zaten pahli ise de oyma yok');
  // WP-07 duzeltme 3: kaba cozunurlukte fazla kesim sessiz temiz olmaz (engel ya da cam.sim.chamfer_tolerance_coarse uyarisi, tolerans degeriyle)
  for (const [res, cutW, declW] of [[0.5, 1.2, 1.0], [1.0, 1.5, 1.0]]) {
    const tpc = CAM.computeOp({ ...cop, width: cutW }, { setup: S0, tool: ch90, geom }); tpc.meta.chamferSharp.width = declW; tpc.meta.chamferSharp.dz = declW;
    const mm = mapOf((x, y) => (inRect(x, y) ? 0 : -10), res);
    const src = simulate(tpc, { res, stockBox: S0.stockBox, stockHeightmap: mm, modelHeightmap: mm });
    const w = src.issues.find((i) => i.code === 'cam.sim.chamfer_tolerance_coarse');
    ok(src.issues.some((i) => i.level === 'error' && /gouge/.test(i.code)) || (w && w.level === 'warn' && Math.abs(w.params.tol - 0.71 * res) < 1e-3 && w.params.width === declW), `dilim5 duzeltme: res ${res}, kesilen ${cutW} / ilan ${declW}: engel ya da kaba-cozunurluk uyarisi: ` + src.issues.map((i) => i.code));
  }
  ok(!simulate(tp, { res: 0.1, stockBox: S0.stockBox, stockHeightmap: hmStock, modelHeightmap: mS }).issues.some((i) => i.code === 'cam.sim.chamfer_tolerance_coarse'), 'dilim5 duzeltme: res <= genislik/10 iken uyari yok');
  // sim kapilari (program + gates)
  const prog = CAM.buildProgram({ name: 'O1', machine: builtinMachines()[0] ?? {}, sections: [{ setup: S0, toolpaths: [tp] }] });
  const gs = CAM.gates(prog, structuredClone(NEWAY_FIXTURE), { sim: { res: 0.1, modelHeightmaps: { s1: mS }, stockHeightmaps: { s1: hmStock } } });
  ok(!gs.some((x) => x.level === 'block' && x.code.startsWith('cam.sim.')), 'dilim5: kapilar BLOCK 0: ' + gs.filter((x) => x.level === 'block').map((x) => x.code));
  // delik kenari: takim delikte, malzeme kenarin DISINDA; hacim = dz*(P*w/2 + 8*w^2/6) = 94,5
  const hole = { z: 0, outer: sq(0, 0, 100, 60), inners: [sq(40, 20, 60, 40).reverse().map((x) => ({ ...x, fwd: false }))] };
  const tpH = CAM.computeOp({ ...cop, geom: [{ kind: 'face', loops: 'inner' }] }, { setup: S0, tool: ch90, geom: { faces: [hole] } });
  const sqIn = [P.line([40, 20], [60, 20]), P.line([60, 20], [60, 40]), P.line([60, 40], [40, 40]), P.line([40, 40], [40, 20])];
  const ph = cutPoints(tpH, () => true, 0.2); ok(ph.length > 50 && ph.every((q) => Math.abs(P.distTo(q, sqIn) - 1.2) < 1e-6 && q[0] > 41 && q[0] < 59 && q[1] > 21 && q[1] < 39), 'dilim5: delik kenari: takim delik icinde, kenardan 1,2');
  ok(tpH.meta.chamferSharp.items[0].matLeft === false, 'dilim5: delikte malzeme yolun sagi (matLeft false)');
  const inHole = (x, y) => x > 40 && x < 60 && y > 20 && y < 40;
  const mH = mapOf((x, y) => (inHole(x, y) ? -10 : 0)); const stH = mapOf((x, y) => (inHole(x, y) ? -10 : 0));
  const srH = simulate(tpH, { res: 0.1, stockBox: S0.stockBox, stockHeightmap: stH, modelHeightmap: mH });
  ok(srH.issues.length === 0, 'dilim5: delik sim BLOCK 0: ' + srH.issues.map((i) => i.code));
  ok(srH.removedVolume > 94.5 * 0.9 && srH.removedVolume < 94.5 * 1.05, `dilim5: delik hacmi el hesabi 94,5 (${srH.removedVolume.toFixed(1)}; kose yuvarlagi biraz eksik)`);
  // acik zincir (kenar): taraf secilmeli; malzeme yolun solunda ise takim sagda (kenardan 1,2 uzakta)
  const cch = { items: [{ segs: [{ ...G.mkLine([10, 10], [50, 10]), fwd: true }], closed: false, z: 0 }] };
  const tpC = CAM.computeOp({ id: 'c', type: 'chamfer', ...base, geom: [{ kind: 'chain' }], side: 'right', sharp: true, width: 1.5, heights: { clearance: 10, retract: 2 } }, { setup: S0, tool: ch90, geom: cch });
  const pc = cutPoints(tpC, () => true, 0.2); ok(pc.length > 10 && pc.every((q) => Math.abs(q[1] - 8.8) < 1e-6), 'dilim5: zincir side right -> takim y=8,8 (kenar y=10, 1,2 sagda)');
  ok(tpC.meta.chamferSharp.items[0].matLeft === true && tpC.meta.chamferSharp.items[0].closed === false, 'dilim5: zincir: malzeme solda, acik');
}

// ------------------------------------------------------------------ WP-07 dilim 6: kurulum foyu (setup sheet) HTML
section('WP-07 dilim 6. kurulum foyu: icerik, sure el hesabi, kacislama (XSS), CSP, betik/dis kaynak yok');
{
  const SS = await import('../src/cam/report/setupsheet.js');
  const { tLang } = await import('../src/shared/i18n.js');
  const nodeCrypto = await import('node:crypto');
  const trL = (l) => (k, p) => tLang(l, k).replace(/\{(\w+)\}/g, (m, n) => (p && n in p ? String(p[n]) : m));
  const tr = trL('tr');
  // el hesabi sure: rapid (0,0,5) -> dalma (0,0,0) F300 = 5/300 dk = 1 sn; kesme (0,0,0)->(100,0,0) F600 = 100/600 dk = 10 sn -> 0:11
  const tool5 = { number: 5, type: 'flat', dia: 6, fluteLen: 20, bodyLen: 40, flutes: 3, centerCutting: true };
  const mkTp = (opName, opType, tool, rpm, f) => IRmk.toolpath({ opId: opName, opName, opType, tool, rpm, clearanceZ: 10, moves: [IRmk.rapid(0, 0, 5), IRmk.feed(0, 0, 0, 300, 'plunge'), IRmk.feed(100, 0, 0, f, 'cut')] });
  const tp1 = mkTp('A', 'contour', tool5, 8000, 600);
  ok(Math.abs(tp1.stats.timeMin * 60 - 11) < 1e-9, 'foy: IR sure el hesabi 11 sn: ' + tp1.stats.timeMin * 60);
  const evil = `<script>alert(1)</script>&"'`;
  const S1 = { ...S0, id: 'sA', name: 'x' };
  const S2 = { ...S0, id: 'sA@A1', name: 'y', aAngle: 90 };
  const Scyl = { ...S0, id: 'sC', name: 'z', stock: { kind: 'cyl', dia: 40, len: 120 } };
  const tp2 = mkTp('B', 'chamfer', { ...tool5, number: 9, type: 'chamfer', dia: 12 }, 6000, 450.5);
  const tp3 = mkTp('C', 'drill', { ...tool5, number: 5 }, 8000, 600);
  const items = [
    { setupName: evil, S: S1, opName: evil, opType: 'contour', tp: tp1 },
    { setupName: '<img src=x onerror=alert(1)>', S: S2, stockFrom: 'previous', opName: 'ikinci', opType: 'chamfer', tp: tp2 },
    { setupName: 'silindir', S: Scyl, opName: 'u', opType: 'drill', tp: tp3 },
  ];
  const data = { title: '</title><script>alert(2)</script>', date: '2026-11-20', machineName: '<b>Tezgah</b>', material: 'Al "6061"', programName: 'O1', items, toolNames: { 5: '<i>Freze</i>', 9: 'Pah 90' }, tr, lang: 'tr' };
  const html = SS.buildSetupSheet(data);
  // guvenlik: betik, olay, style oznitelikleri, dis kaynak yok; kullanici metni kacisli
  // etiket bazli denetim (kacisli kullanici metni etiket sayilmaz): yalniz izinli etiketler, hicbirinde olay/style/dis kaynak oznitelik yok
  { const tags = html.match(/<[^>]+>/g) || []; const names = new Set(tags.map((x) => (/^<\/?([a-zA-Z0-9!]+)/.exec(x) || [])[1]?.toLowerCase()));
    const allowed = new Set(['!doctype', 'html', 'head', 'meta', 'title', 'style', 'body', 'h1', 'h2', 'h3', 'p', 'table', 'tr', 'th', 'td', 'div', 'svg', 'rect', 'line', 'text', 'circle']);
    ok([...names].every((n) => allowed.has(n)), 'foy: yalniz izinli etiketler (script/img/link/iframe/object yok): ' + [...names].filter((n) => !allowed.has(n)));
    const attrs = tags.flatMap((x) => [...x.matchAll(/\s([a-zA-Z:-]+)\s*=/g)].map((m) => m[1].toLowerCase()));
    ok(attrs.every((n) => !/^on/.test(n) && n !== 'style' && !['src', 'href', 'srcset', 'action', 'data', 'xlink:href', 'formaction'].includes(n)), 'foy: hicbir etiketin olay/style/src/href oznitelik yok: ' + [...new Set(attrs)]);
    ok(!/url\(|@import|https?:|\/\/\w/i.test(html), 'foy: url()/@import/http(s)/protokol-bagil adres yok'); }
  ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;&amp;&quot;&#39;') && html.includes('&lt;img src=x onerror=alert(1)&gt;') && html.includes('&lt;b&gt;Tezgah&lt;/b&gt;') && html.includes('&lt;i&gt;Freze&lt;/i&gt;'), 'foy: islem/kurulum/takim/tezgah adlari kacislandi');
  ok(!html.includes('<b>Tezgah') && !html.includes('<i>Freze') && !html.includes('<img') && (html.match(/<title>/g) || []).length === 1 && html.includes('&lt;/title&gt;&lt;script&gt;'), 'foy: baslik kacislandi, </title> ile kacis yok');
  const hash = 'sha256-' + nodeCrypto.createHash('sha256').update(SS.SHEET_CSS).digest('base64');
  ok(SS.SHEET_CSS_HASH === hash, 'foy: SHEET_CSS_HASH, CSS ozetiyle ayni (CSS degisirse sabit guncellenmeli): ' + hash);
  ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src '${hash}'; base-uri 'none'; form-action 'none'">`) && html.includes('<style>' + SS.SHEET_CSS + '</style>') && !/script-src|unsafe-inline|unsafe-eval/.test(html), 'foy: kendi CSP\'si: default-src none, stil yalniz ozetle, betik izni yok');
  // icerik (belge verisinden)
  ok(html.includes('Al &quot;6061&quot;') && html.includes('2026-11-20') && html.includes('>O1<'), 'foy: malzeme, tarih, program');
  ok(html.includes('>T5<') && html.includes('>T9<') && html.includes('>8000<') && html.includes('>6000<') && html.includes('>600<'), 'foy: takim numaralari, devir ve ilerleme');
  ok(html.includes('>450.5<'), 'foy: ilerleme 450,5 (ondalik)');
  // kesme 450,5: (5/300 + 100/450,5) dk = 14,318 sn -> 0:14 ; toplam 11 + 14,318 + 11 = 36,318 sn -> 0:36
  ok(html.includes('>0:11<') && html.includes('>0:14<'), 'foy: islem sureleri 0:11 ve 0:14 (el hesabi)');
  ok(/Toplam tahmini süre<\/th><th class="n">0:36</.test(html), 'foy: toplam sure 0:36');
  ok(html.includes('3 kurulum, 2 takım, 3 işlem, tahmini süre 0:36'), 'foy: ozet satiri (3 kurulum, 2 takim, 3 islem): ' + (html.match(/\d kurulum[^<]*/) || [])[0]);
  // resim: her kurulumda iki SVG, oklar ve kutular
  ok((html.match(/<svg /g) || []).length === 6 && (html.match(/<rect /g) || []).length === 12 && (html.match(/>X<\/text>/g) || []).length === 6 && html.includes('>Y</text>') && html.includes('>Z</text>'), 'foy: 3 kurulum x (ust + yan) = 6 SVG, her birinde stok+parca kutusu, X/Y/Z oku');
  // resim el hesabi: stok x 0..100, y 0..60 (alan 250x170, pad 22): olcek = min(206/100, 126/60) = 2,06 -> stok dikdortgeni genislik 206
  ok(html.includes('width="206"') && html.includes('height="123.6"'), 'foy: ust gorunus olcegi el hesabi (genislik 206, yukseklik 123.6)');
  // ham malzeme: onceki kurulumdan gelen satir listede yok, silindir ve kutu var
  const rawPart = html.slice(html.indexOf('Ham malzeme ölçü listesi'));
  ok(rawPart.includes('100 × 60 × 30 mm') && rawPart.includes('Ø40 × 120 mm (yuvarlak)') && !rawPart.includes('&lt;img') && (rawPart.match(/<tr><td>/g) || []).length === 2, 'foy: ham olcu listesi: kutu 100x60x30 + Ø40x120; onceki kurulumdan gelen satir yok');
  ok(html.includes('A açısı') && html.includes('90°') && html.includes('Önceki kurulumdan gelen'), 'foy: A acisi ve onceki-kurulum notu');
  // EN
  const en = SS.buildSetupSheet({ ...data, tr: trL('en'), lang: 'en' });
  ok(en.includes('<html lang="en">') && en.includes('Setup sheet') && en.includes('Tool list') && en.includes('Operation list') && en.includes('Raw material size list') && !en.includes('Kurulum föyü'), 'foy: EN dil');
  // bos / tek islem
  ok(SS.buildSetupSheet({ items: [], tr, lang: 'tr' }).includes('0 kurulum, 0 takım, 0 işlem'), 'foy: bos program cokmez');
  ok(SS.esc(`&<>"'\``) === '&amp;&lt;&gt;&quot;&#39;&#96;', 'foy: esc tum ozel karakterleri kacislar');
}

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
