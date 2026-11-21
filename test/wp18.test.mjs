// WP-18 (K-029): cok eksen altyapisi ve 3+2 konumlu isleme kabul testi.
//  1. eski profiller (3 eksen, 3+1 A) yeni semaya kayipsiz doner ve ayni NC'yi uretir; yeni genel sablonlar gecerli
//  2. ters kinematik: rastgele 100 birim vektorde ileri kinematikle geri donus hatasi < 1e-9 (A/C, B/C tabla-tabla, kafa-tabla, kafa-kafa)
//  3. IR takim ekseni (3 eksende [0,0,1]); egik setup cercevesi = yuz normali
//  4. 45 derece egik yuzde cep: G68.2 ve acilmis cikti G-code sim'de ayni hacmi kaldirir (fark < %1), IR sim ile uyumlu
//  5. sinir disi aci engel; acilmis cikista eksik merkez engel
//  6. egik setup'ta baglama govdesi carpismasi (WP-13 altyapisi)
// Post ciktilari TEST CIKTISIDIR: tezgahta dogrulanmadi.
// Calistir: node test/wp18.test.mjs
import fs from 'node:fs';
import * as CAM from '../src/cam/index.js';
import * as K from '../src/cam/kinematics.js';
import { builtinMachines, checkMachine } from '../src/cam/machines/builtin.js';
import { exportMachines, importMachines } from '../src/cam/machines/io.js';
import { runPost } from '../src/cam/post/engine.js';
import { getPost } from '../src/cam/post/registry.js';
import { gates as runGates } from '../src/cam/gates.js';
import { simulate } from '../src/cam/sim/index.js';
import { gcodeToProgram } from '../src/cam/sim/gcode.js';
import { normalizeTool } from '../src/cam/tools.js';
import { mk, validateProgram } from '../src/cam/ir.js';
import * as G from '../src/shared/geom2d.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const section = (s) => console.log(s);
const throwsCode = (fn, code, m) => { try { fn(); ok(false, m + ' (hata yok)'); } catch (e) { ok(e.code === code, m + ' (' + e.code + ')'); } };
const clone = (x) => JSON.parse(JSON.stringify(x));

// ------------------------------------------------------------------ ortak veri
const boxBody = (id, [x0, y0, z0], [x1, y1, z1]) => { const v = []; for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) v.push(x, y, z); return { id, vertices: new Float32Array(v) }; };
const rb = { bodies: [boxBody('b1', [0, 0, 0], [100, 60, 40])] };
const toolDoc = { id: 't6', number: 5, lengthOffset: 5, diaOffset: 5, type: 'flat', dia: 6, fluteLen: 25, bodyLen: 50, flutes: 3, centerCutting: true };
const sq = (x0, y0, x1, y1) => [G.mkLine([x0, y0], [x1, y0]), G.mkLine([x1, y0], [x1, y1]), G.mkLine([x1, y1], [x0, y1]), G.mkLine([x0, y1], [x0, y0])].map((s) => ({ ...s, fwd: true }));
const pocketOp = { id: 'p', type: 'pocket', name: 'Cep', rpm: 8000, feedCut: 800, feedPlunge: 300, coolant: 'flood', heights: { clearance: 10, retract: 2 }, geom: [{ kind: 'face' }], stepover: 2.5, stepdown: 2, entry: { kind: 'helix', angle: 3, helixDia: 3 } };
const baseSetup = (extra = {}) => ({ id: 's1', name: 'S1', bodies: ['b1'], workOffset: { kind: 'G54' }, frame: { origin: { kind: 'stockCorner', corner: 'x-y-z-' }, zAxis: { kind: 'base', dir: '+Z' }, xAxis: { kind: 'base', dir: '+X' } }, stock: { kind: 'boxOffset', side: 0, top: 0, bottom: 0 }, clearanceZ: 10, ...extra });
const filled = (m) => { const c = clone(m); for (const k of ['X', 'Y', 'Z']) c.axes[k].travel = 1000; c.spindle.maxRpm = 12000; c.feed.maxCut = 5000; c.toolChange.maxTools = 20; c.id = 'test-' + c.id; delete c.builtin; return c; };
const B = builtinMachines();
const by = (id) => B.find((m) => m.id === id);
const AC = filled(by('builtin-generic-5axis-ac-table')); AC.axes.A.limits = [-120, 120];
const BC = filled(by('builtin-generic-5axis-bc-table')); BC.axes.B.limits = [-120, 120];
const post = (prog, M) => runPost(getPost(M.control), prog, M, { gates: [], date: '2026-11-21', generatedAt: 'T' }).text;

// ================================================================== 1
section('1. profil semasi: eski profiller kayipsiz, ayni NC');
{
  for (const m of B) { const r = checkMachine(m); ok(!r.errors.length, 'yerlesik gecerli: ' + m.id + ' ' + JSON.stringify(r.errors[0] || '')); }
  ok(!JSON.stringify(B).match(/neway|vm1160|gsa|fanuc 0i|haas|dmg/i), 'yeni sablonlarda marka yok');
  const ac = by('builtin-generic-5axis-ac-table'), bc = by('builtin-generic-5axis-bc-table');
  ok(ac.kinematics.chain === 'table-table' && ac.kinematics.order.join() === 'A,C' && ac.axes.A.on === 'table' && ac.axes.C.center === null, 'A/C sablon: tabla-tabla, sira A,C, merkez bos');
  ok(bc.kinematics.order.join() === 'B,C' && bc.axes.B.about === 'Y', 'B/C sablon');
  const g3 = by('builtin-generic-3axis-fanuc'), g4 = by('builtin-generic-4axis-a-fanuc');
  const n4 = K.normalizeMachine(g4);
  ok(n4.kinematics.chain === 'table' && n4.kinematics.order.join() === 'A' && n4.axes.A.on === 'table' && n4.kinematics.tiltOutput === 'plane', '3+1 profil: tek tabla zincirine donusur');
  const strip = (m) => { const c = clone(m); delete c.kinematics; for (const k of ['A', 'B', 'C']) if (c.axes[k]) { delete c.axes[k].on; delete c.axes[k].center; } return c; };
  ok(JSON.stringify(strip(n4)) === JSON.stringify(g4), 'donusum kayipsiz: eski alanlar birebir');
  ok(!checkMachine(n4).errors.length && !checkMachine(K.normalizeMachine(g3)).errors.length, 'donusmus profiller gecerli');
  // eski bicim (kinematics yok) ice aktarilir
  const old = clone(g4); old.id = 'eski1'; delete old.builtin; delete old.nameKey;
  const im = importMachines(JSON.stringify({ format: 'mihenk-machine', version: 1, machines: [old] }));
  ok(im.machines.length === 1 && !im.errors.length, 'eski bicim ice aktarma kabul');
  const ex = importMachines(exportMachines([filled(ac)]));
  ok(ex.machines[0].kinematics.order.join() === 'A,C' && !ex.errors.length, 'yeni alanlar disa/ice aktarmada korunur');
  ok(checkMachine({ ...ac, kinematics: { ...ac.kinematics, chain: 'head-head' } }).errors.some((e) => e.params.path === 'kinematics.chain'), 'tutarsiz zincir hata');
  ok(checkMachine({ ...ac, axes: { ...ac.axes, A: { ...ac.axes.A, on: 'tabla' } } }).errors.length > 0, 'gecersiz on hata');
  ok(checkMachine({ ...ac, kinematics: { ...ac.kinematics, tiltOutput: 'x' } }).errors.length > 0, 'gecersiz tiltOutput hata');
  // ayni NC: 3 eksen + 3+1 program eski ve donusmus profille
  const M4 = filled(g4), M3 = filled(g3);
  const S1 = CAM.resolveSetup(baseSetup(), rb, M4), S2 = CAM.resolveSetup(baseSetup({ id: 's2', name: 'S2', rotary: { enabled: true, aAngle: 90 } }), rb, M4);
  const tp1 = CAM.computeOp(pocketOp, { setup: S1, tool: toolDoc, geom: { faces: [{ z: 35, normalOk: true, outer: sq(20, 15, 60, 45), inners: [] }] } });
  const tp2 = CAM.computeOp({ ...pocketOp, id: 'p2' }, { setup: S2, tool: toolDoc, geom: { faces: [{ z: S2.stockTop - 4, normalOk: true, outer: sq(20, -30, 60, -10), inners: [] }] } });
  const P4 = CAM.buildProgram({ name: 'O1', machine: M4, sections: [{ setup: S1, toolpaths: [tp1] }, { setup: S2, toolpaths: [tp2] }] });
  ok(post(P4, M4) === post(P4, K.normalizeMachine(M4)), '3+1 program: eski ve donusmus profil ayni NC');
  const P3 = CAM.buildProgram({ name: 'O1', machine: M3, sections: [{ setup: CAM.resolveSetup(baseSetup(), rb, M3), toolpaths: [tp1] }] });
  ok(post(P3, M3) === post(P3, K.normalizeMachine(M3)), '3 eksen program: eski ve donusmus profil ayni NC');
  const M3m = filled(by('builtin-generic-3axis-mitsubishi')); M3m.post = { props: { safeRetract: 'G28', dwellAddress: 'P', dwellUnit: 'ms', cycleDwellAddress: 'P', cycleDwellUnit: 'ms' } };
  ok(post(P3, M3m) === post(P3, K.normalizeMachine(M3m)), 'Mitsubishi genel 3 eksen: ayni NC');
  ok(!/G68\.2|G53\.1|G69/.test(post(P4, M4)), 'egimsiz programda egik duzlem kodu yok');
}

// ================================================================== 2
section('2. ters kinematik (100 rastgele vektor)');
{
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const mkM = (axes) => ({ axes: { X: {}, Y: {}, Z: {}, ...axes } });
  const cases = [
    ['A/C tabla-tabla', K.kinOf(AC)], ['B/C tabla-tabla', K.kinOf(BC)],
    ['B kafa / C tabla', K.kinOf(mkM({ B: { kind: 'rotary', about: 'Y', dir: [0, 1, 0], on: 'head', limits: null }, C: { kind: 'rotary', about: 'Z', dir: [0, 0, 1], limits: null } }))],
    ['C/A kafa-kafa', K.kinOf(mkM({ A: { kind: 'rotary', about: 'X', dir: [1, 0, 0], on: 'head', limits: null }, C: { kind: 'rotary', about: 'Z', dir: [0, 0, 1], on: 'head', limits: null } }))],
    ['A/C ters yon (-X)', K.kinOf(mkM({ A: { kind: 'rotary', about: 'X', dir: [-1, 0, 0], limits: null }, C: { kind: 'rotary', about: 'Z', dir: [0, 0, -1], limits: null } }))],
  ];
  for (const [nm, kin] of cases) {
    let mx = 0, nf = 0;
    for (let i = 0; i < 100; i++) {
      let v = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]; const l = Math.hypot(...v); v = v.map((x) => x / l); if (v[2] < 0) v[2] = -v[2]; // ust yarikure (tabla icin erisilebilir)
      try { const s = K.solveAngles(kin, v); const e = K.toolAxisOf(kin, s.angles); mx = Math.max(mx, Math.hypot(e[0] - v[0], e[1] - v[1], e[2] - v[2])); } catch (e) { nf++; }
    }
    ok(nf === 0 && mx < 1e-9, `${nm}: cozumsuz ${nf}, en buyuk geri donus hatasi ${mx.toExponential(2)} < 1e-9`);
  }
  const kin = K.kinOf(AC);
  const t = [0.5, 0.5, Math.SQRT1_2]; const all = K.solveAll(kin, t);
  ok(all.length === 2 && all.every((s) => s.inLimits), 'A/C: iki cozum (A+ / A-)');
  ok(K.solveAngles(kin, t).angles.A > 0, 'secim: egme |A| esit -> C mutlak kucuk olan (A+45 C45)');
  const pn = K.kinOf({ ...AC, kinematics: { ...AC.kinematics, prefer: 'negative' } });
  ok(K.solveAngles(pn, t).angles.A < 0, 'profil tercihi negative: A- cozum');
  const z = K.solveAngles(kin, [0, 0, 1]); ok(z.angles.A === 0 && z.angles.C === 0, 'dik eksen: A0 C0 (serbest C = 0)');
  throwsCode(() => K.solveAngles(K.kinOf({ ...AC, axes: { ...AC.axes, A: { ...AC.axes.A, limits: [-30, 30] } } }), t), 'cam.kin.limits', 'sinir disi cozum: cam.kin.limits');
  throwsCode(() => K.solveAngles(K.kinOf(filled(by('builtin-generic-4axis-a-fanuc'))), t), 'cam.kin.unreachable', 'tek A ile erisilemez yon: cam.kin.unreachable');
  const W = K.workFrame(kin, { A: 45, C: 45 }), e = K.eulerZXZ(W), W2 = K.eulerMat(...e);
  ok(W.flat().every((v, i) => Math.abs(v - W2.flat()[i]) < 1e-12), 'Euler ZXZ ayristirma geri donusu');
  ok(K.eulerZXZ([[1, 0, 0], [0, 1, 0], [0, 0, 1]]).every((v) => v === 0), 'birim cerceve: I0 J0 K0');
}

// ================================================================== 3
section('3. IR takim ekseni ve egik setup cercevesi');
const n45 = [0.5, 0.5, Math.SQRT1_2]; // 45 derece egik yuz normali (tabla koordinati)
{
  const S0 = CAM.resolveSetup(baseSetup(), rb, AC);
  ok(S0.toolAxis.every((v, i) => Math.abs(v - [0, 0, 1][i]) < 1e-12) && !S0.rot, '3 eksen setup: toolAxis [0,0,1], rot yok');
  const SA = CAM.resolveSetup(baseSetup({ rotary: { enabled: true, aAngle: 90 } }), rb, filled(by('builtin-generic-4axis-a-fanuc')));
  ok(Math.abs(SA.toolAxis[1] - 1) < 1e-12, '3+1 A90: toolAxis [0,1,0]');
  const SF = CAM.resolveSetup(baseSetup({ tilt: { enabled: true, kind: 'face', ref: { id: 'F' } } }), rb, AC, { planes: { tilt: { n: n45 } } });
  ok(SF.frame.z.every((v, i) => Math.abs(v - n45[i]) < 1e-12) && SF.toolAxis.every((v, i) => Math.abs(v - n45[i]) < 1e-12), 'yuzden egim: takim ekseni = yuz normali');
  ok(Math.abs(SF.rot.A - 45) < 1e-9 && Math.abs(SF.rot.C - 45) < 1e-9 && SF.tilt.mode === 'plane', 'hesaplanan acilar A45 C45');
  const SV = CAM.resolveSetup(baseSetup({ tilt: { enabled: true, kind: 'vector', v: [1, 1, Math.SQRT2] } }), rb, AC);
  const SG = CAM.resolveSetup(baseSetup({ tilt: { enabled: true, kind: 'angles', angles: { A: 45, C: 45 } } }), rb, AC);
  ok(JSON.stringify(SV.frame) === JSON.stringify(SF.frame) && SG.frame.z.every((v, i) => Math.abs(v - n45[i]) < 1e-12), 'elle vektor ve elle aci ayni cerceve');
  const fl = CAM.resolveSetup(baseSetup({ tilt: { enabled: true, kind: 'face', ref: { id: 'F' }, flip: true } }), rb, AC, { planes: { tilt: { n: n45.map((x) => -x) } } });
  ok(fl.frame.z.every((v, i) => Math.abs(v - n45[i]) < 1e-12), 'ters normal + flip');
  // stok kutusu tum koseleri kapsar
  const F = SF.frame; let inside = true;
  for (const x of [0, 100]) for (const y of [0, 60]) for (const zz of [0, 40]) { const q = [F.x, F.y, F.z].map((a) => a[0] * x + a[1] * y + a[2] * zz); for (let k = 0; k < 3; k++) if (q[k] < SF.stockBox.min[k] - 1e-6 || q[k] > SF.stockBox.max[k] + 1e-6) inside = false; }
  ok(inside, 'egik stok kutusu model koselerini kapsar');
  throwsCode(() => CAM.resolveSetup(baseSetup({ tilt: { enabled: true, kind: 'vector', v: [1, 1, Math.SQRT2] }, rotary: { enabled: true, aAngle: 10 } }), rb, AC), 'cam.kin.tilt_with_rotary', '3+1 ve 3+2 birlikte reddi');
  throwsCode(() => CAM.resolveSetup(baseSetup({ tilt: { enabled: true, kind: 'vector', v: [1, 1, 1] } }), rb, filled(by('builtin-generic-3axis-fanuc'))), 'cam.kin.no_rotary', '3 eksen tezgahta egim reddi');
  // IR dogrulamasi: hareket toolAxis istege bagli birim vektor
  const tp = mk.toolpath({ tool: { number: 1, H: 1, type: 'flat', dia: 6 }, rpm: 1000, clearanceZ: 10, moves: [mk.rapid(0, 0, 10), { ...mk.feed(0, 0, 5, 100), toolAxis: [0, 0, 1] }, mk.rapid(0, 0, 10)] });
  const P = { name: 'X', units: 'mm', sections: [{ setup: { id: 's', workOffset: { kind: 'G54' }, toolAxis: [0, 0, 1] }, toolpath: tp }] };
  ok(validateProgram(P), 'IR: setup ve hareket toolAxis gecerli');
  const bad = clone(P); bad.sections[0].toolpath.moves[1].toolAxis = [0, 0, 2]; let th = null; try { validateProgram(bad); } catch (e) { th = e; } ok(th?.params?.field === 'toolAxis', 'IR: birim olmayan toolAxis reddi');
}

// ================================================================== 4
section('4. 45 derece egik yuzde cep: G68.2 / acilmis / IR sim');
{
  const mkProg = (M, extra = {}) => {
    const S = CAM.resolveSetup(baseSetup({ tilt: { enabled: true, kind: 'face', ref: { id: 'F' } }, ...extra }), rb, M, { planes: { tilt: { n: n45 } } });
    const F = S.frame, c = [F.x, F.y, F.z].map((a) => a[0] * 100 + a[1] * 60 + a[2] * 40); // model kosesi (100,60,40) yerelde
    const face = { z: c[2] - 5, normalOk: true, outer: sq(c[0] - 9, c[1] - 9, c[0] + 9, c[1] + 9), inners: [] };
    const tp = CAM.computeOp(pocketOp, { setup: S, tool: toolDoc, geom: { faces: [face] } });
    return { S, prog: CAM.buildProgram({ name: 'O1', machine: M, sections: [{ setup: S, toolpaths: [tp] }] }) };
  };
  const { S, prog } = mkProg(AC);
  ok(Math.abs(S.stockTop - (50 + 30 + 40 * Math.SQRT1_2)) < 1e-9, 'stok ustu = kosenin normal boyunca yuksekligi');
  const ncP = post(prog, AC);
  ok(/G68\.2 X0\. Y0\. Z0\. I/.test(ncP) && /\nG53\.1\n/.test(ncP) && /\nG69\n/.test(ncP), 'egik duzlem: G68.2 + G53.1 + G69');
  ok(/TEST OUTPUT/.test(ncP) && /UNVERIFIED POST/.test(ncP), 'NC basligi: test ciktisi / dogrulanmadi');
  ok(ncP.indexOf('G68.2') < ncP.indexOf('G43 H5') && ncP.indexOf('G53.1') < ncP.indexOf('G43 H5'), 'G68.2/G53.1 takim boy telafisinden once');
  ok(!/G0 G90 G54 X/.test(ncP.slice(ncP.indexOf('G68.2'))), 'G68.2 etkinken WCS yeniden secilmez');
  const ncM = runPost(getPost('mitsubishi-m80v'), prog, { ...AC, control: 'mitsubishi-m80v', post: { props: { safeRetract: 'G28', dwellAddress: 'P', dwellUnit: 'ms', cycleDwellAddress: 'P', cycleDwellUnit: 'ms' } } }, { gates: [], date: '2026-11-21' }).text;
  ok(/G68\.2 X0\. Y0\. Z0\./.test(ncM) && /G53\.1/.test(ncM), 'Mitsubishi genel: ayni egik duzlem soz dizimi');
  // acilmis: eksen merkezleri ve is sifirinin makine konumu
  const ACu = clone(AC); ACu.kinematics.tiltOutput = 'unwound'; ACu.axes.A.center = [0, 250, -300]; ACu.axes.C.center = [400, 250, -260];
  const machinePos = [350, 230, -260];
  const U = mkProg(ACu, { machinePos });
  const d = U.S.tilt.shift; ok(Array.isArray(d) && d.some((v) => Math.abs(v) > 1), 'acilmis: sabit oteleme hesaplandi ' + JSON.stringify(d?.map((v) => Math.round(v * 1000) / 1000)));
  const ncU = post(U.prog, ACu);
  ok(/\nG0 A45\. C45\.\n/.test(ncU) && !/G68\.2/.test(ncU), 'acilmis: G0 A45. C45., G68.2 yok');
  ok(/\nG0 A0\. C0\.\n/.test(ncU), 'program sonu doner eksenler sifira');
  // ileri dogrulama: acilmis XYZ = tabla donusumu(yerel nokta)
  const kin = K.kinOf(ACu); const W = U.S.tilt.W;
  const T = (q) => { let p = q; for (const k of ['C', 'A']) { const c = kin.ax[k].center.map((v, i) => v - machinePos[i]); const R = K.rotMat(kin.ax[k].u, U.S.rot[k]); const r = K.matVec(R, p.map((v, i) => v - c[i])); p = r.map((v, i) => v + c[i]); } return p; };
  const pl = [3, -7, 11]; const mach = T(K.matVec(W, pl)); ok(mach.every((v, i) => Math.abs(v - (pl[i] + d[i])) < 1e-9), 'acilmis oteleme ileri kinematikle tutarli');
  // sim karsilastirmasi
  const tools = { 5: { ...normalizeTool(toolDoc) } };
  const so = { res: 0.25, stockBoxes: { [S.id]: S.stockBox }, tools, freePieces: false };
  const ir = simulate(prog, so).removedVolume;
  const g1 = gcodeToProgram(ncP, { tools, setups: prog.sections.map((s) => s.setup) });
  const g2 = gcodeToProgram(ncU, { tools, setups: U.prog.sections.map((s) => s.setup) });
  ok(g1.program.sections.length === 1 && g1.program.sections[0].setup.tilt?.mode === 'plane', 'G-code sim: G68.2 bolumu egik setup ile eslesti');
  ok(g2.program.sections.length === 1 && g2.program.sections[0].setup.tilt?.mode === 'unwound', 'G-code sim: acilmis bolum A/C acilariyla eslesti');
  const v1 = simulate(g1.program, so).removedVolume, v2 = simulate(g2.program, { ...so, stockBoxes: { [U.S.id]: U.S.stockBox } }).removedVolume;
  const pct = (a, b) => Math.abs(a - b) / Math.max(a, b) * 100;
  console.log('HACIM', ir, v1, v2); if (process.env.WP18_NC) { fs.writeFileSync('/tmp/wp18-g682.nc', ncP); fs.writeFileSync('/tmp/wp18-unw.nc', ncU); }
  ok(ir > 100 && pct(v1, v2) < 1 && pct(v1, ir) < 1 && pct(v2, ir) < 1, `kaldirilan hacim IR ${ir.toFixed(1)}, G68.2 ${v1.toFixed(1)}, acilmis ${v2.toFixed(1)} mm3 (fark < %1)`);
  const xs = g1.program.sections[0].toolpath.moves.filter((m) => m.t !== 'cycle'), ys = prog.sections[0].toolpath.moves;
  ok(Math.abs(Math.min(...xs.map((m) => m.z)) - Math.min(...ys.map((m) => m.z))) < 1e-3, 'G-code sim en derin nokta IR ile ayni');
  const um = g2.program.sections[0].toolpath.moves; ok(Math.abs(Math.min(...um.map((m) => m.z)) - Math.min(...ys.map((m) => m.z))) < 1e-3, 'acilmis NC geri yerel cerceveye cevrildi');
  // B/C sablonu da ayni cebi uretir
  const B1 = mkProg(BC); const vb = simulate(B1.prog, { ...so, stockBoxes: { [B1.S.id]: B1.S.stockBox } }).removedVolume;
  const gb = gcodeToProgram(post(B1.prog, BC), { tools, setups: B1.prog.sections.map((s) => s.setup) });
  ok(pct(simulate(gb.program, { ...so, stockBoxes: { [B1.S.id]: B1.S.stockBox } }).removedVolume, vb) < 1, 'B/C: G68.2 G-code sim = IR sim');
  // generateProgram yolu (cekirdek sorgusu taklidi): egik setup engel vermez, IR'de rot/tilt/toolAxis
  const cam = { tools: [toolDoc], setups: [{ ...baseSetup({ tilt: { enabled: true, kind: 'face', ref: { id: 'F' } } }), ops: [] }] };
  const q = async (cmd) => { if (cmd === 'facePlane') return { n: n45, o: [100, 60, 40] }; throw new Error(cmd); };
  const r = await CAM.generateProgram(cam, { rebuild: rb, machine: AC, query: q, name: 'O1' });
  ok(r.gates.every((g) => g.code !== 'cam.setup.face_axis_unresolved'), 'generateProgram: yuz duzlemi sorgulanir (bos setup)');
}

// ================================================================== 5
section('5. sinir disi aci ve eksik veri engeli');
{
  const ACl = clone(AC); ACl.axes.A.limits = [-30, 30];
  throwsCode(() => CAM.resolveSetup(baseSetup({ tilt: { enabled: true, kind: 'vector', v: n45 } }), rb, ACl), 'cam.kin.limits', 'sinir disi: setup cozulmez');
  throwsCode(() => CAM.resolveSetup(baseSetup({ tilt: { enabled: true, kind: 'angles', angles: { A: 45, C: 0 } } }), rb, ACl), 'cam.kin.limits', 'elle aci sinir disi');
  const cam = { tools: [toolDoc], setups: [{ ...baseSetup({ tilt: { enabled: true, kind: 'vector', v: n45 } }), ops: [{ ...pocketOp }] }] };
  const r = await CAM.generateProgram(cam, { rebuild: rb, machine: ACl, query: async () => ({}), name: 'O1' });
  ok(r.blocked && r.gates.some((g) => g.code === 'cam.kin.limits' && g.level === 'block'), 'generateProgram: sinir disi aci ENGEL');
  // kapi savunmasi: programda sinir disi rot
  const S = CAM.resolveSetup(baseSetup({ tilt: { enabled: true, kind: 'vector', v: n45 } }), rb, AC);
  const tp = CAM.computeOp(pocketOp, { setup: S, tool: toolDoc, geom: { faces: [{ z: S.stockTop - 3, normalOk: true, outer: sq(0, 0, 10, 10), inners: [] }] } });
  const prog = CAM.buildProgram({ name: 'O1', machine: AC, sections: [{ setup: S, toolpaths: [tp] }] });
  const gl = runGates(prog, ACl, { sim: false }); ok(gl.some((g) => g.code === 'cam.gate.rot_limit' && g.level === 'block'), 'kapi: rot_limit ENGEL');
  ok(!runGates(prog, AC, { sim: false }).some((g) => g.code === 'cam.gate.rot_limit'), 'sinir icinde kapi temiz');
  const ACu = clone(AC); ACu.kinematics.tiltOutput = 'unwound';
  const Su = CAM.resolveSetup(baseSetup({ tilt: { enabled: true, kind: 'vector', v: n45 } }), rb, ACu);
  const pu = CAM.buildProgram({ name: 'O1', machine: ACu, sections: [{ setup: Su, toolpaths: [tp] }] });
  ok(runGates(pu, ACu, { sim: false }).some((g) => g.code === 'cam.gate.missing' && g.level === 'block' && g.params.field === 'setup.machinePos'), 'acilmis: makine konumu yoksa ENGEL');
  const Su2 = CAM.resolveSetup(baseSetup({ machinePos: [0, 0, 0], tilt: { enabled: true, kind: 'vector', v: n45 } }), rb, ACu);
  ok(runGates(CAM.buildProgram({ name: 'O1', machine: ACu, sections: [{ setup: Su2, toolpaths: [tp] }] }), ACu, { sim: false }).some((g) => g.level === 'block' && /^axes\.[AC]\.center$/.test(g.params.field)), 'acilmis: eksen merkezi yoksa ENGEL');
  const head = { ...clone(AC), axes: { ...clone(AC).axes, A: { ...clone(AC).axes.A, on: 'head' } }, kinematics: { chain: 'head-table', order: ['C', 'A'], prefer: null, tiltOutput: 'unwound' } };
  ok(!checkMachine(head).errors.length, 'kafa-tabla profil gecerli');
  const Sh = CAM.resolveSetup(baseSetup({ machinePos: [0, 0, 0], tilt: { enabled: true, kind: 'vector', v: n45 } }), rb, head);
  ok(runGates(CAM.buildProgram({ name: 'O1', machine: head, sections: [{ setup: Sh, toolpaths: [tp] }] }), head, { sim: false }).some((g) => g.code === 'cam.gate.unwound_head'), 'kafa ekseninde acilmis cikis ENGEL');
  const m6b = clone(AC); m6b.post = { props: { rotaryMode: '6b' } };
  let th = null; try { post(prog, m6b); } catch (e) { th = e; } ok(th?.code === 'cam.post.tilt_needs_nc_rotary', 'elle indeksleme kipinde egik setup post hatasi');
}

// ================================================================== 6
section('6. egik setup carpisma (baglama govdesi)');
{
  const fx = [{ kind: 'box', id: 'mengene', name: 'Mengene', min: [-20, -30, -40], max: [120, 0, 20] }];
  const S = CAM.resolveSetup(baseSetup({ tilt: { enabled: true, kind: 'vector', v: n45 }, fixtures: fx }), rb, AC);
  ok(S.fixtures?.length === 1 && S.fixtures[0].kind === 'box', 'fikstur egik cerceveye cevrildi');
  const c = S.fixtures[0].c; // yerel merkez
  const tp = mk.toolpath({ opId: 'x', opName: 'x', tool: { number: 5, H: 5, type: 'flat', dia: 6, fluteLen: 25, bodyLen: 50 }, rpm: 8000, clearanceZ: S.stockTop + 10, moves: [mk.rapid(c[0], c[1], S.stockTop + 10), mk.rapid(c[0], c[1], c[2]), mk.rapid(c[0], c[1], S.stockTop + 10)] });
  const prog = CAM.buildProgram({ name: 'O1', machine: AC, sections: [{ setup: S, toolpaths: [tp] }] });
  const r = simulate(prog, { res: 0.5, stockBoxes: { [S.id]: S.stockBox }, freePieces: false });
  ok(r.issues.some((i) => i.code === 'cam.sim.fixture_collision' && i.level === 'error'), 'egik setup: fikstura dalan hizli carpisma ENGEL');
  const far = mk.toolpath({ ...tp, moves: [mk.rapid(c[0], c[1], S.stockTop + 10), mk.rapid(c[0] + 1, c[1], S.stockTop + 10)] });
  const r2 = simulate(CAM.buildProgram({ name: 'O1', machine: AC, sections: [{ setup: S, toolpaths: [far] }] }), { res: 0.5, stockBoxes: { [S.id]: S.stockBox }, freePieces: false });
  ok(!r2.issues.some((i) => i.code === 'cam.sim.fixture_collision'), 'guvenli yukseklikte carpisma yok');
}

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
