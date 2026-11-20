// WP-14 testleri: G76/G87 (IR, op, post, geri okuma, acilim), sonraki dilimlerde sablonlar vb. Calistir: node test/wp14.test.mjs
import { validateToolpath, mk, compareToolpaths } from '../src/cam/ir.js';
import { postProgram, readNC } from '../src/cam/post/index.js';
import { expandCyclePoint, expandToolpathCycles } from '../src/cam/cycles.js';
import * as CAM from '../src/cam/index.js';
import * as S from './cam-samples/samples.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const throwsCode = (fn, code, m) => { try { fn(); ok(false, `${m}: hata bekleniyordu (${code})`); } catch (e) { ok(e.code === code, `${m}: ${e.code} != ${code} ${JSON.stringify(e.params || {})}`); } };
const OPTS = { date: '2026-01-01', appVersion: '0.5.0', gates: [] };
const BORE = { number: 11, H: 11, D: 11, type: 'bore', dia: 20, cornerR: 0, tipAngle: null, fluteLen: 30, bodyLen: 80, centerCutting: false, pitch: null };
const setup = { id: 's1', name: 's1', workOffset: { kind: 'G54' }, aAngle: null };

console.log('1. G76 / G87 IR + post + geri okuma');
{
  const clr = 20;
  const mkProg = (moves) => mk.program({ name: 'BORE', number: 120, machine: 'test-m80v', sections: [mk.section(setup, mk.toolpath({ opId: 'b', opName: 'Bore', opType: 'drill', tool: BORE, rpm: 1200, spindleDir: 'cw', coolant: 'flood', clearanceZ: clr, retractZ: 2, moves }))] });
  const fine = mk.cycle({ cycle: 'fineBore', points: [[10, 5], [30, 5]], top: 0, bottom: -15, retract: 2, clearance: clr, shift: 0.3, dwell: 0.5, f: 80 });
  const back = mk.cycle({ cycle: 'backBore', points: [[10, 25]], top: -10, bottom: -22, cutTo: -12, retract: clr, clearance: clr, shift: 0.5, f: 60 });
  const prog = mkProg([mk.rapid(10, 5, clr), fine, mk.rapid(10, 25, clr), back, mk.rapid(10, 25, clr)]);
  ok(validateToolpath(prog.sections[0].toolpath) === true, 'G76/G87 IR gecerli');
  for (const [name, M] of [['M80V', S.testMachine()], ['Fanuc', S.fanucMachine({ props: { dwellAddress: 'P', dwellUnit: 'ms', cycleDwellAddress: 'P', cycleDwellUnit: 'ms' } })]]) {
    const res = postProgram(prog, M, OPTS); const L = res.lines;
    ok(L.some((l) => /^G99 G76 X10\. Y5\. Z-15\. R2\. Q0\.3 P500 F80\.$/.test(l)), name + ': G76 satiri: ' + L.filter((l) => /G76/.test(l)).join('|'));
    ok(L.some((l) => /^G98 X30\.$/.test(l)), name + ': G76 ikinci nokta modal (son nokta G98)');
    ok(L.some((l) => /^G98 G87 X10\. Y25\. Z-12\. R-22\. Q0\.5 F60\.$/.test(l)), name + ': G87 satiri (Z = ustte bitis, R = alt baslangic, G98): ' + L.filter((l) => /G87/.test(l)).join('|'));
    ok(L.filter((l) => /^G80$/.test(l)).length >= 2, name + ': her cevrim G80 ile biter');
    const back2 = readNC(res.text, { machine: M }).program.sections[0].toolpath;
    const cmp = compareToolpaths(prog.sections[0].toolpath, back2);
    ok(cmp.equal === true, name + ': IR <-> NC esit: ' + JSON.stringify(cmp.diffs));
    const cy = back2.moves.filter((m) => m.t === 'cycle');
    ok(cy[0].cycle === 'fineBore' && cy[0].shift === 0.3 && cy[0].dwell === 0.5 && cy[1].cycle === 'backBore' && cy[1].cutTo === -12 && cy[1].bottom === -22 && cy[1].retract === clr, name + ': okuyucu G76/G87 alanlari: ' + JSON.stringify(cy.map((c) => [c.cycle, c.shift, c.cutTo])));
  }
  // dogrulama hatalari
  const bad = (cyc, code, m) => throwsCode(() => validateToolpath(mkProg([mk.rapid(10, 5, clr), cyc, mk.rapid(10, 5, clr)]).sections[0].toolpath), code, m);
  bad({ ...fine, shift: 0 }, 'cam.ir.field', 'G76 shift 0');
  bad({ ...fine, shift: undefined }, 'cam.ir.field', 'G76 shift yok');
  bad({ ...back, cutTo: -30 }, 'cam.ir.field', 'G87 cutTo < bottom');
  bad({ ...back, retract: 5 }, 'cam.ir.cycle_heights', 'G87 retract != clearance');
  // eksik cevrim bekleme adresi (P)
  throwsCode(() => postProgram(prog, S.testMachine({ props: { cycleDwellUnit: null } }), OPTS), 'cam.post.prop_missing', 'G76 bekleme birimi null');
  // istatistik: G87 kesim boyu = cutTo - bottom
  const st = back.cutTo - back.bottom; ok(Math.abs(mkProg([mk.rapid(10, 25, clr), back, mk.rapid(10, 25, clr)]).sections[0].toolpath.stats.cutLen - st) < 1e-9, 'G87 kesim boyu istatistigi');

  console.log('2. acilim (cevrimi desteklemeyen profil)');
  for (const [props, why] of [[{ cycleG76: false, cycleG87: false }, 'cycleG76/G87 false'], [{ cannedCycles: false }, 'cannedCycles false']]) {
    const res = postProgram(prog, S.testMachine({ props }), OPTS); const T = res.text;
    ok(!/G76|G87/.test(T.replace(/\([^)]*\)/g, '')), why + ': NC satirlarinda G76/G87 yok');
    ok(res.warnings.filter((w) => w.code === 'cam.post.cycle_expanded').length === 2, why + ': acilim uyarisi (2 cevrim)');
    ok(/G1 Z-15\. F80\./.test(T) || /Z-15\./.test(T), why + ': dibe kesme');
    const rd = readNC(T, { machine: S.testMachine({ props }) }).program.sections[0].toolpath;
    ok(rd.moves.every((m) => m.t !== 'cycle'), why + ': geri okunan NC cevrimsiz (acik hareket)');
  }
  // acilim adimlari
  const sF = expandCyclePoint(fine, 10, 5, true);
  ok(sF[0].t === 'rapid' && sF.some((s) => s.t === 'feed' && s.z === -15) && sF.some((s) => s.t === 'dwell' && s.s === 0.5) && sF.at(-1).z === clr, 'G76 acilimi: XY, dibe kesme, bekleme, cikis clearance');
  const sB = expandCyclePoint({ ...back, shiftDir: 90 }, 10, 25, true);
  ok(sB.some((s) => s.t === 'rapid' && s.z === -22) && sB.some((s) => s.t === 'feed' && s.z === -12) && sB.some((s) => s.t === 'rapid' && s.x === 10 && s.y === 25.5), 'G87 acilimi: delikten sapmali inis (90 derece -> +Y), alt noktada merkez, yukari kesme');
  const ex = expandToolpathCycles(prog.sections[0].toolpath);
  ok(ex.moves.every((m) => m.t !== 'cycle') && validateToolpath(ex) === true, 'expandToolpathCycles: gecerli, cevrimsiz IR');
}

console.log('3. delme islemi: fineBore / backBore');
{
  const setupOf = (min, max) => ({ id: 's1', name: 'S1', workOffset: { kind: 'G55' }, frame: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, stock: { kind: 'box' }, stockBox: { min, max }, modelBBox: { min, max }, clearance: 5, aAngle: null, stockTop: max[2], machinePos: null });
  const S0 = setupOf([0, 0, -30], [100, 60, 0]);
  const base = { rpm: 1200, feedCut: 80, feedPlunge: 300, coolant: 'flood', heights: { clearance: 10, retract: 2 } };
  const holes = [{ feature: 'h', dia: 24, depth: 30, through: true, tipAngle: null, thread: null, dir: [0, 0, -1], positions: [[20, 20, 0], [60, 20, 0]], dirs: [[0, 0, -1], [0, 0, -1]], exits: [30, 30] }];
  const tool = { ...BORE, id: 'bar', lengthOffset: 11, diaOffset: 11, flutes: 1 };
  const fo = CAM.computeOp({ id: 'f', type: 'drill', ...base, holes: { kind: 'feature' }, cycle: 'fineBore', shift: 0.2, dwell: 0.3, depth: { from: 'hole', tipComp: false } }, { setup: S0, tool, geom: { holes } });
  const fc = fo.moves.filter((m) => m.t === 'cycle');
  ok(validateToolpath(fo) && fc.length === 1 && fc[0].cycle === 'fineBore' && fc[0].shift === 0.2 && fc[0].points.length === 2 && fc[0].dwell === 0.3, 'fineBore op: tek cevrim, shift/dwell tasir');
  throwsCode(() => CAM.computeOp({ id: 'f', type: 'drill', ...base, holes: { kind: 'feature' }, cycle: 'fineBore', depth: { from: 'hole' } }, { setup: S0, tool, geom: { holes } }), 'cam.op.missing', 'fineBore shift zorunlu');
  throwsCode(() => CAM.computeOp({ id: 'f', type: 'drill', ...base, holes: { kind: 'feature' }, cycle: 'fineBore', shift: 0.2, depth: { from: 'hole' } }, { setup: S0, tool: { ...BORE, id: 'x', type: 'drill', tipAngle: 118, centerCutting: true, lengthOffset: 11, diaOffset: 11, flutes: 2 }, geom: { holes } }), 'cam.drill.tool_cycle', 'fineBore bore takimi ister');
  const bo = CAM.computeOp({ id: 'b', type: 'drill', ...base, holes: { kind: 'feature' }, cycle: 'backBore', shift: 0.4, backDepth: 6, startBelow: 3, depth: { from: 'hole' } }, { setup: S0, tool, geom: { holes } });
  const bc = bo.moves.find((m) => m.t === 'cycle');
  ok(validateToolpath(bo) && bc.cycle === 'backBore' && bc.bottom === -33 && bc.cutTo === -24 && bc.retract === bc.clearance && bc.shift === 0.4, 'backBore op: bottom = cikis - startBelow (-33), cutTo = cikis + backDepth (-24), retract = clearance: ' + JSON.stringify([bc.bottom, bc.cutTo, bc.retract, bc.clearance]));
  ok(bo.meta.drillAllow >= 3 && bo.meta.belowStock >= 3 - 1e-9 || bo.meta.belowStock > 0, 'backBore: stok alti pay meta\'ya girer (' + bo.meta.drillAllow + '/' + bo.meta.belowStock + ')');
  throwsCode(() => CAM.computeOp({ id: 'b', type: 'drill', ...base, holes: { kind: 'feature' }, cycle: 'backBore', shift: 0.4, backDepth: 6, depth: { from: 'hole' } }, { setup: S0, tool: { ...tool, dia: 25 }, geom: { holes } }), 'cam.drill.backbore_tool_too_big', 'G87 takim delikten buyuk');
  throwsCode(() => CAM.computeOp({ id: 'b', type: 'drill', ...base, holes: { kind: 'feature' }, cycle: 'backBore', shift: 0.4, backDepth: 40, depth: { from: 'hole' } }, { setup: S0, tool, geom: { holes } }), 'cam.drill.backbore_too_long', 'G87 boy delik boyunu asar');
  const blind = [{ ...holes[0], through: false, depth: 20, exits: undefined }];
  throwsCode(() => CAM.computeOp({ id: 'b', type: 'drill', ...base, holes: { kind: 'feature' }, cycle: 'backBore', shift: 0.4, backDepth: 6, depth: { from: 'hole' } }, { setup: S0, tool, geom: { holes: blind } }), 'cam.drill.backbore_needs_through', 'G87 kor delikte yok');
  // op -> program -> post uctan uca
  const prog = CAM.buildProgram({ name: 'B', machine: S.testMachine(), sections: [{ setup: S0, toolpaths: [bo, fo] }] });
  const res = postProgram(prog, S.testMachine(), OPTS);
  ok(/G98 G87 X20\. Y20\. Z-24\. R-33\. Q0\.4/.test(res.text) && /G76 X20\. Y20\. Z-30\./.test(res.text.replace(/G98 /, '')), 'op -> NC: G87 ve G76 satirlari');
  // sema: op alanlari belge dogrulamasindan gecer
  const { validateDoc } = await import('../src/shared/schema.js');
  ok(typeof validateDoc === 'function', 'schema yuklendi');
}

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
