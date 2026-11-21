// WP-22b testleri: tri-dexel kipinde modele 3B oyma ve sap/tutucu yanal carpmasi, G87 yukari kesimde oyma, sarma sim'inde
// modele oyma ve baglama govdesi, G-code sim eszamanli A (G93/G94), post okuyucusu G68.2/G53.1/G69 + B/C, WP-16 bulgulari.
// Tum makine degerleri TEST degeridir; NC yalniz test ciktisidir (tezgahta dogrulanmadi). Calistir: node test/wp22b.test.mjs
import * as CAM from '../src/cam/index.js';
import * as G from '../src/shared/geom2d.js';
import { mk, compareToolpaths, splitWrapMoves } from '../src/cam/ir.js';
import { simulate, heightmapFromFn, boxMesh, mergeMeshes, triFromMesh, meshRadialRays, createWrapStock, triFromBox, stockHeightmap } from '../src/cam/sim/index.js';
import { gcodeToProgram } from '../src/cam/sim/gcode.js';
import { gates } from '../src/cam/gates.js';
import { postProgram, readNC } from '../src/cam/post/index.js';
import { runPost, resolveProps, resolveRotary, wrapAMode } from '../src/cam/post/engine.js';
import { getPost } from '../src/cam/post/registry.js';
import { builtinMachines, copyMachine } from '../src/cam/machines/builtin.js';
import { normalizeTool } from '../src/cam/tools.js';
import * as SM from './cam-samples/samples.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const codes = (r) => [...new Set(r.issues.map((i) => i.code))].sort().join(',');
const errs = (r) => r.issues.filter((i) => i.level === 'error');
const has = (r, code, lvl = 'error') => r.issues.some((i) => i.code === code && i.level === lvl);
const TP = (tool, moves, extra = {}) => mk.toolpath({ opId: 'op', opName: 'op', opType: 'contour', tool, rpm: 5000, spindleDir: 'cw', coolant: 'off', clearanceZ: moves[0].z, retractZ: moves[0].z, moves, ...extra });
const pct = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) * 100;

console.log('1. tri kip: modele yanal oyma (yukseklik haritasinda gorunmez) ve gecerli yol');
const f6 = { number: 1, H: 1, type: 'flat', dia: 6, fluteLen: 20, bodyLen: 30 };
const BOX = { min: [0, -10, -10], max: [20, 10, 0] };
// model: x >= 10 tam yukseklik duvar + x < 10 tabani z = -5 (cep x 0..10, z -5..0)
const stepMesh = mergeMeshes([boxMesh([10, -10, -10], [20, 10, 0]), boxMesh([0, -10, -10], [10, 10, -5])]);
const stepHm = heightmapFromFn([0, -10], [20, 10], 0.5, (x) => (x < 10 ? -5 : 0));
const slot = (xc) => TP(f6, [mk.rapid(xc, -15, 5), mk.feed(xc, -15, -5, 200, 'plunge'), mk.feed(xc, 15, -5, 500), mk.rapid(xc, 15, 5)]);
{
  const o = { stockBox: BOX, res: 0.5, modelHeightmap: stepHm, freePieces: false };
  const bad = slot(7.2), good = slot(7); // takim kenari x = 10,2 (0,2 mm duvara) / x = 10 (teget)
  const h = simulate(bad, o), t = simulate(bad, { ...o, dexel: 'tri', modelMeshes: { default: stepMesh } });
  ok(!has(h, 'cam.sim.gouge'), 'yukseklik haritasi: 0,2 mm yanal oyma gorunmez (hucre merkezi 10,25; eskisi gibi): ' + codes(h));
  const gq = t.issues.find((i) => i.code === 'cam.sim.gouge');
  ok(gq && gq.level === 'error' && Math.abs(gq.params.depth - 0.2) < 0.02, 'tri + model agi: 0,2 mm yanal oyma engel, derinlik ' + gq?.params?.depth);
  const tg = simulate(good, { ...o, dexel: 'tri', modelMeshes: { default: stepMesh } });
  ok(!errs(tg).length, 'tri: duvara teget yol temiz: ' + codes(tg));
  const tn = simulate(bad, { ...o, dexel: 'tri' });
  ok(!has(tn, 'cam.sim.gouge'), 'tri kip ag verilmeden eski yukseklik haritasi denetimi: ' + codes(tn));
  ok(Math.abs(t.removedVolume - h.removedVolume) / h.removedVolume < 0.02, 'tri/harita kaldirilan hacim tutarli ' + t.removedVolume.toFixed(1) + ' / ' + h.removedVolume.toFixed(1));
  // taban oymasi: 0,1 mm derin
  const deep = TP(f6, [mk.rapid(5, -15, 5), mk.feed(5, -15, -5.1, 200, 'plunge'), mk.feed(5, 15, -5.1, 500), mk.rapid(5, 15, 5)]);
  const td = simulate(deep, { ...o, dexel: 'tri', modelMeshes: { default: stepMesh } }), hd = simulate(deep, o);
  const gd = td.issues.find((i) => i.code === 'cam.sim.gouge');
  ok(gd && Math.abs(gd.params.depth - 0.1) < 0.01 && Math.abs(gd.params.vertical - 0.1) < 0.01 && has(hd, 'cam.sim.gouge'), 'taban oymasi 0,1 mm: tri derinlik ' + gd?.params?.depth + ', harita da engel');
  // model isinlari: birlesim (dokunan kutular) tek aralik
  const T = triFromBox(BOX, stockHeightmap(BOX, 0.5)); const M = triFromMesh(stepMesh, T);
  const xr = M.xr[Math.floor((-5.25 + 10) / 0.5) * M.ny + 10], xr2 = M.xr[Math.floor((-2.25 + 10) / 0.5) * M.ny + 10];
  ok(JSON.stringify(xr) === '[0,20]' && JSON.stringify(xr2) === '[10,20]', 'model X isinlari: birlesim [0,20], duvar [10,20]: ' + JSON.stringify([xr, xr2]));
}

console.log('2. tri kip: tutucu yan duvara surtunur (X/Y isinlari)');
{
  const tl = { number: 2, H: 2, type: 'flat', dia: 6, fluteLen: 12, bodyLen: 15, holder: { dia: 20, len: 30 } };
  const bx = { min: [-15, -10, -20], max: [30, 10, 0] };
  const pre = heightmapFromFn([-15, -10], [30, 10], 0.5, (x) => (x < 10 ? -20 : 0)); // derin cep x < 10, duvar x >= 10
  const mh = heightmapFromFn([-15, -10], [30, 10], 0.5, (x) => (x < 10 ? -20 : 0));
  const path = (xc) => TP(tl, [mk.rapid(xc, -15, 20), mk.rapid(xc, -15, -18), mk.feed(xc, 15, -18, 500), mk.rapid(xc, 15, 20)]);
  const o = { stockBox: bx, res: 0.5, initialHeightmaps: { default: pre }, modelHeightmap: mh, freePieces: false };
  const h = simulate(path(0.2), o), t = simulate(path(0.2), { ...o, dexel: 'tri' });
  ok(!has(h, 'cam.sim.holder_collision'), 'yukseklik haritasi: tutucu 0,2 mm surtunmesi gorunmez (eskisi gibi): ' + codes(h));
  const hq = t.issues.find((i) => i.code === 'cam.sim.holder_collision');
  ok(hq && Math.abs(hq.params.depth - 0.2) < 0.02, 'tri: tutucu yanal carpmasi engel, derinlik ' + hq?.params?.depth);
  ok(!errs(simulate(path(-0.1), { ...o, dexel: 'tri' })).length, 'tri: tutucu duvardan 0,1 mm uzak -> temiz');
  // sap (shaftDia 8 > kesici 6): flut ustunde sap duvara
  const ts = { number: 3, H: 3, type: 'flat', dia: 6, shaftDia: 8, fluteLen: 5, bodyLen: 40 };
  const ps = TP(ts, [mk.rapid(5.8, -15, 20), mk.rapid(5.8, -15, -18), mk.feed(5.8, 15, -18, 500), mk.rapid(5.8, 15, 20)]); // sap kenari 9,8; kesici 8,8
  const ps2 = TP(ts, [mk.rapid(6.2, -15, 20), mk.rapid(6.2, -15, -18), mk.feed(6.2, 15, -18, 500), mk.rapid(6.2, 15, 20)]); // sap kenari 10,2
  ok(!errs(simulate(ps, { ...o, dexel: 'tri' })).length, 'tri: sap duvara 0,2 mm uzak temiz');
  const ts2 = simulate(ps2, { ...o, dexel: 'tri' }); const sq = ts2.issues.find((i) => i.code === 'cam.sim.shaft_collision');
  ok(sq && Math.abs(sq.params.depth - 0.2) < 0.02 && !has(simulate(ps2, o), 'cam.sim.shaft_collision'), 'tri: sap yanal carpmasi 0,2 mm (harita gormez): ' + sq?.params?.depth);
}

console.log('3. G87 yukari kesimde modele oyma');
{
  const bx = { min: [-20, -20, -30], max: [20, 20, 0] };
  const pre = heightmapFromFn([-20, -20], [20, 20], 0.25, (x, y) => (Math.hypot(x, y) <= 5 ? -30 : 0)); // O10 on delik
  // model: kare delik (yari 5) z -25..0; alttan kare havsa (yari 8) z -30..-25
  const frame = (h, z0, z1) => [boxMesh([-20, -20, z0], [-h, 20, z1]), boxMesh([h, -20, z0], [20, 20, z1]), boxMesh([-h, -20, z0], [h, -h, z1]), boxMesh([-h, h, z0], [h, 20, z1])];
  const mesh = mergeMeshes([...frame(5, -25, 0), ...frame(8, -30, -25)]);
  const mh = heightmapFromFn([-20, -20], [20, 20], 0.25, (x, y) => (Math.max(Math.abs(x), Math.abs(y)) < 5 ? -30 : 0));
  const bore14 = { number: 5, H: 5, type: 'bore', dia: 14, fluteLen: 5, bodyLen: 60 };
  const bb = (cutTo) => TP(bore14, [mk.rapid(0, 0, 30), mk.rapid(0, 0, 10), mk.cycle({ cycle: 'backBore', points: [[0, 0]], top: cutTo, bottom: -32, cutTo, retract: 10, clearance: 10, f: 80, shift: 2.5 }), mk.rapid(0, 0, 30)]);
  const o = { stockBox: bx, initialHeightmaps: { default: pre }, res: 0.25, modelHeightmap: mh, freePieces: false };
  const okT = simulate(bb(-25), { ...o, dexel: 'tri', modelMeshes: { default: mesh } });
  ok(!errs(okT).length, 'G87 tri: havsa model icinde (z -25) temiz: ' + codes(okT));
  const bad = simulate(bb(-23), { ...o, dexel: 'tri', modelMeshes: { default: mesh } }); const gq = bad.issues.find((i) => i.code === 'cam.sim.gouge');
  ok(gq && gq.level === 'error' && Math.abs(gq.params.depth - 2) < 0.1, 'G87 tri: govdeye 2 mm giren yukari kesim engel, derinlik ' + gq?.params?.depth);
  const badH = simulate(bb(-23), { ...o, modelMeshes: { default: mesh } });
  ok(has(badH, 'cam.sim.gouge') && !errs(simulate(bb(-25), { ...o, modelMeshes: { default: mesh } })).length, 'G87 yukseklik haritasi + model agi: Z isinlariyla engel / temiz');
  ok(!has(simulate(bb(-23), o), 'cam.sim.gouge'), 'G87 ag verilmeden (eskisi gibi) oyma denetimi yok');
}

// WP-16 sarma parcasi
const BM = builtinMachines();
const fill = (m) => { for (const k of ['X', 'Y', 'Z']) m.axes[k].travel = 800; m.spindle.maxRpm = 12000; m.feed.maxCut = 5000; m.toolChange.maxTools = 20; return m; };
const FANUC4 = fill(copyMachine(BM.find((m) => m.id === 'builtin-generic-4axis-a-fanuc'), 'test-fanuc4', 'TEST Fanuc 4A'));
const boxBody = (h) => { const m = boxMesh([0, -h, -h], [100, h, h]); return { id: 'b', vertices: m.v, triangles: m.t }; };
const setupDef = (over = {}) => ({ id: 'w', name: 'Sarma', bodies: ['b'], frame: { origin: { kind: 'model' } }, stock: { kind: 'cyl', dia: 50, len: 120 }, workOffset: { kind: 'G54' }, wrap: { enabled: true }, ...over });
const tool10 = { id: 't10', number: 4, lengthOffset: 4, diaOffset: 4, type: 'flat', dia: 10, fluteLen: 20, bodyLen: 45, flutes: 3, centerCutting: true };
const chain = (a, b) => ({ items: [{ segs: [{ ...G.mkLine(a, b), fwd: true }], closed: false, z: null }] });
const groove = (geom, S, M, over = {}) => CAM.computeOp({ id: 'g', name: 'Kanal', type: 'wrapContour', rpm: 6000, feedCut: 500, feedPlunge: 200, coolant: 'flood', geom: [{ kind: 'chain' }], side: 'on', stepdown: 2, heights: { clearance: 10, retract: 2, bottom: { from: 'stockTop', off: -2 } }, ...over }, { setup: S, tool: tool10, geom, machine: M });
const prog1 = (S, tps, M, name = 'WRAP') => CAM.buildProgram({ name, number: 160, machine: M, sections: [{ setup: S, toolpaths: tps }] });

console.log('4. sarma: modele oyma (silindirik izgarada model yaricap isinlari) ve baglama govdesi');
{
  const S = CAM.resolveSetup(setupDef(), { bodies: [boxBody(17)] }, FANUC4);
  const tp = groove(chain([50, -50], [50, 50]), S, FANUC4); const P = prog1(S, [tp], FANUC4);
  const m17 = boxMesh([0, -17, -17], [100, 17, 17]), m15 = boxMesh([0, -15, -15], [100, 15, 15]);
  const r0 = simulate(P, { res: 0.2 });
  ok(!errs(r0).length, 'model agi verilmeden (eskisi gibi) engel yok');
  const r17 = simulate(P, { res: 0.2, modelMeshes: { w: m17 } }); const gq = r17.issues.find((i) => i.code === 'cam.sim.gouge');
  // kose yaricapi 17 sqrt2 = 24,04 > kanal tabani 23 -> ~1 mm oyma
  ok(gq && gq.level === 'error' && gq.params.depth > 0.8 && gq.params.depth < 1.1, 'sarma: kanal tabani (r 23) kutu koselerini (r 24,04) oyar -> engel, derinlik ' + gq?.params?.depth);
  const r15 = simulate(P, { res: 0.2, modelMeshes: { w: m15 } });
  ok(!errs(r15).length, 'sarma: model kosesi r 21,2 < 23 temiz: ' + codes(r15));
  ok(Math.abs(r15.removedVolume - r0.removedVolume) < 1e-9, 'model denetimi kaldirilan hacmi degistirmez');
  // model yaricap isinlari: kutu ±15, theta = 0 isininda dis yaricap 15, 45 derecede 15 sqrt2
  const W = createWrapStock(S, 0.2); const MR = meshRadialRays(m15, W).rays;
  const at = (x, th) => MR[Math.floor(th / W.dt) * W.nx + Math.floor((x - W.x0) / W.res)];
  const a0 = at(50, 0.5 * W.dt), a45 = at(50, Math.PI / 4), tc = (Math.floor((Math.PI / 4) / W.dt) + 0.5) * W.dt;
  ok(a0.length === 2 && a0[0] === 0 && Math.abs(a0[1] - 15 / Math.cos(0.5 * W.dt)) < 1e-4 && Math.abs(a45[1] - 15 / Math.max(Math.abs(Math.sin(tc)), Math.abs(Math.cos(tc)))) < 1e-4, 'yaricap isinlari eksenden basliyor (eksen model icinde): ' + JSON.stringify([a0, a45]));
  // baglama govdesi: A = 0 yonunde (ust) parca ustune basan kutu (x 54..70, r 24..30)
  const fx = [{ kind: 'box', min: [54, -5, 24], max: [70, 5, 30], name: 'Pabuc' }];
  const rf = simulate(P, { res: 0.2, fixtures: { w: fx } }); const fq = rf.issues.find((i) => i.code === 'cam.sim.fixture_collision');
  ok(fq && fq.level === 'error' && fq.params.fixture === 'Pabuc', 'sarma: kesici baglama govdesine -> fixture_collision engel: ' + codes(rf));
  const fx2 = [{ kind: 'box', min: [56, -5, 24], max: [70, 5, 30], name: 'Pabuc' }]; // takim kenari x 55; buyutme payi 0,19 < 1
  ok(!errs(simulate(P, { res: 0.2, fixtures: { w: fx2 } })).length, 'sarma: govdeden 1 mm uzak temiz');
  const fx3 = [{ kind: 'cyl', axis: 'X', center: [-10, 0, 0], dia: 60, len: 12, name: 'Ayna' }]; // ayna x -10..2 (stok basi -10)
  ok(!errs(simulate(P, { res: 0.2, fixtures: { w: fx3 } })).length, 'sarma: aynadan uzak kanal temiz');
  // kapi: model agi verilince wrap_sim_limits kalkar
  const mhd = { data: new Float32Array(1), x0: 0, y0: 0, res: 1, nx: 1, ny: 1 };
  const g1 = gates(P, FANUC4, { sim: { res: 0.25, modelHeightmaps: { w: mhd } } }), g2 = gates(P, FANUC4, { sim: { res: 0.25, modelHeightmaps: { w: mhd }, modelMeshes: { w: m15 } } });
  ok(g1.some((g) => g.code === 'cam.gate.wrap_sim_limits') && !g2.some((g) => g.code === 'cam.gate.wrap_sim_limits'), 'kapi: wrap_sim_limits yalniz model agi yokken');
  const g3 = gates(P, FANUC4, { sim: { res: 0.25, modelMeshes: { w: m15 } } });
  ok(!g3.some((g) => g.code === 'cam.gate.sim_no_model'), 'kapi: sarma setup\'inda model agi model sayilir');
  globalThis.__wrap = { S, tp, P };
}

console.log('5. G-code sim: eszamanli A (sarma, G93/G94) -- IR sim ile hacim');
{
  const { S, tp, P } = globalThis.__wrap;
  const tools = { 4: normalizeTool(tool10) };
  const R = resolveRotary(FANUC4), props = resolveProps(getPost(FANUC4.control), FANUC4);
  const nc = postProgram(P, FANUC4, { date: '2026-01-01', appVersion: '0.6.0', gates: [] }).text;
  const g = gcodeToProgram(nc, { tools, setups: P.sections.map((s) => s.setup), aMode: wrapAMode(props, R) });
  const sec = g.program.sections;
  ok(sec.length === 1 && sec[0].toolpath.wrap?.axis === 'X' && sec[0].setup.id === 'w', 'G-code: tek sarma bolumu, sarma setup\'i: ' + sec.map((s) => s.setup.id).join(','));
  const ir = simulate(P, { res: 0.2 }), gs = simulate(g.program, { res: 0.2 });
  ok(ir.removedVolume > 100 && pct(ir.removedVolume, gs.removedVolume) < 1 && !errs(gs).length, `sarma G-code sim hacmi ${gs.removedVolume.toFixed(1)} ~ IR ${ir.removedVolume.toFixed(1)} (< %1): ` + codes(gs));
  const cutsI = splitWrapMoves(tp, 90).moves.filter((m) => m.t === 'feed'), cutsG = sec[0].toolpath.moves.filter((m) => m.t === 'feed');
  ok(cutsI.length === cutsG.length && cutsI.every((m, k) => Math.abs(m.a - cutsG[k].a) < 1e-3 && Math.abs(m.f - cutsG[k].f) < 0.05 * m.f + 0.5), 'G93 F -> ilerleme ve surekli A IR ile ayni: ' + cutsG.map((m) => m.a.toFixed(2) + '@' + m.f.toFixed(1)).join(' '));
  // surekli A kelimesi (kisa yol olmayan makine)
  const Mc = JSON.parse(JSON.stringify(FANUC4)); Mc.axes.A.shortest = false;
  const Sc = CAM.resolveSetup(setupDef(), { bodies: [boxBody(17)] }, Mc), Pc = prog1(Sc, [groove(chain([50, -50], [50, 50]), Sc, Mc)], Mc);
  const gc = gcodeToProgram(postProgram(Pc, Mc, { date: '2026-01-01', appVersion: '0.6.0', gates: [] }).text, { tools, setups: Pc.sections.map((s) => s.setup), aMode: wrapAMode(resolveProps(getPost(Mc.control), Mc), resolveRotary(Mc)) });
  ok(pct(simulate(gc.program, { res: 0.2 }).removedVolume, simulate(Pc, { res: 0.2 }).removedVolume) < 1, 'surekli A kelimesi: G-code sim = IR sim');
  // sarma + 3 eksen karisik program (farkli is koordinati)
  const SM5 = SM.surfaceSample(); const mix = { ...P, sections: [SM5.program.sections[0], ...P.sections] };
  const ncm = postProgram(mix, FANUC4, { date: '2026-01-01', appVersion: '0.6.0', gates: [] }).text;
  const toolsM = { ...tools }; for (const s0 of SM5.program.sections) toolsM[s0.toolpath.tool.number] = s0.toolpath.tool;
  let gm = null; try { gm = gcodeToProgram(ncm, { tools: toolsM, setups: mix.sections.map((s) => s.setup), aMode: wrapAMode(props, R) }); } catch (e) { ok(false, 'karisik G-code okunamadi: ' + e.code + ' ' + JSON.stringify(e.params)); }
  if (gm) ok(gm.program.sections.length === 2 && !gm.program.sections[0].toolpath.wrap && gm.program.sections[1].toolpath.wrap, 'karisik: ilk bolum duz, ikinci sarma');
  // sarma setup'i olmadan eszamanli A: eskisi gibi hata
  let th = null; try { gcodeToProgram(nc, { tools }); } catch (e) { th = e; } ok(th?.code === 'cam.gcode.a_simultaneous', 'sarma setup\'i yok: a_simultaneous hatasi (' + th?.code + ')');
  th = null; try { gcodeToProgram('T4 M6\nS1000 M3\nG0 G90 G54 X0 Y0\nZ30.\nG93\nG2 X10. Y0. R5. F2.\nM30', { tools, setups: P.sections.map((s) => s.setup) }); } catch (e) { th = e; } ok(th?.code === 'cam.gcode.inverse_arc', 'G93 yay: hata (' + th?.code + ')');
}

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
