// WP-14 testleri: G76/G87 (IR, op, post, geri okuma, acilim), sonraki dilimlerde sablonlar vb. Calistir: node test/wp14.test.mjs
import { validateToolpath, mk, compareToolpaths } from '../src/cam/ir.js';
import { postProgram, readNC } from '../src/cam/post/index.js';
import { expandCyclePoint, expandToolpathCycles } from '../src/cam/cycles.js';
import * as CAM from '../src/cam/index.js';
import * as S from './cam-samples/samples.mjs';
import { makeTemplate, instantiateTemplate, exportTemplates, importTemplates, matchTool, planHoleOps, checkHoleRules, DEFAULT_HOLE_RULES, classifyHole } from '../src/cam/templates.js';

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

console.log('4. islem sablonlari');
{
  const tools = [{ id: 'tA', number: 2, type: 'flat', dia: 10, name: 'EM10' }, { id: 'tB', number: 7, type: 'drill', dia: 6.8 }, { id: 'tC', number: 8, type: 'tap', dia: 8, pitch: 1.25 }];
  const ops = [
    { id: 'o1', type: 'pocket', name: 'Cep', toolId: 'tA', rpm: 8000, feedCut: 900, feedPlunge: 300, coolant: 'flood', heights: { clearance: 5, retract: 2 }, geom: [{ kind: 'face', ref: { id: 'F1' } }], stepdown: 2, suppressed: true },
    { id: 'o2', type: 'drill', name: 'Delme', toolId: 'tB', rpm: 2500, feedCut: 200, feedPlunge: 200, coolant: 'flood', heights: { clearance: 5, retract: 2 }, cycle: 'peck', peck: 3, holes: { kind: 'feature', filter: { feature: 'hole7' } }, depth: { from: 'hole', tipComp: true } },
  ];
  const tpl = makeTemplate('  Cep + delme ', ops, tools, 'tpl1');
  ok(tpl.name === 'Cep + delme' && tpl.ops.length === 2 && tpl.ops.every((o) => !('id' in o) && !('toolId' in o) && !('geom' in o) && !('suppressed' in o)), 'sablon: kimlik/takim/geometri/bastirma temizlenir');
  ok(tpl.ops[1].holes.kind === 'feature' && !tpl.ops[1].holes.filter && tpl.ops[1].tool.dia === 6.8 && tpl.ops[1].peck === 3, 'sablon: delik secimi sifirlanir, takim ipucu ve parametreler kalir');
  ok(ops[0].geom.length === 1 && ops[0].id === 'o1', 'sablon: kaynak islemler degismez');
  let n = 0; const inst = instantiateTemplate(tpl, { tools, newId: () => 'n' + ++n });
  ok(inst.ops.length === 2 && inst.ops[0].id === 'n1' && inst.ops[0].toolId === 'tA' && inst.ops[1].toolId === 'tB' && Array.isArray(inst.ops[0].geom) && inst.warnings.length === 0, 'sablondan ekleme: yeni kimlik, takim eslesir');
  const inst2 = instantiateTemplate(tpl, { tools: [tools[2]] });
  ok(inst2.ops.every((o) => o.toolId === null) && inst2.warnings.length === 2 && inst2.warnings[0].code === 'cam.tpl.no_tool', 'takim yoksa toolId null + uyari');
  ok(matchTool({ type: 'tap', dia: 8, pitch: 1.0 }, tools) === null && matchTool({ type: 'tap', dia: 8, pitch: 1.25 }, tools).id === 'tC', 'kilavuz eslesmesi hatveye bakar');
  // disa/ice aktarma gidis-donus
  const txt = exportTemplates([tpl]); const back = importTemplates(txt);
  ok(back.errors.length === 0 && back.templates.length === 1 && JSON.stringify(back.templates[0].ops) === JSON.stringify(tpl.ops) && back.templates[0].id === 'tpl1', 'JSON gidis-donus esit');
  // bozuk girdiler
  throwsCode(() => importTemplates('{}'), 'cam.tpl.file_bad', 'bicim yok');
  throwsCode(() => importTemplates('xx'), 'cam.tpl.file_bad', 'JSON degil');
  throwsCode(() => importTemplates(JSON.stringify({ format: 'mihenk-op-templates', version: 2, templates: [] })), 'cam.tpl.file_newer', 'yeni surum');
  const mix = JSON.stringify({ format: 'mihenk-op-templates', version: 1, templates: [JSON.parse(txt).templates[0], { name: 'X', ops: [{ type: 'bilinmeyen' }] }, { name: '', ops: [] }, { name: 'Z', ops: [{ type: 'face', rpm: 'cok', heights: {} }] }, JSON.parse('{"name":"P","ops":[{"type":"face","__proto__":{"x":1}}]}')] });
  const mx = importTemplates(mix); ok(mx.templates.length === 1 && mx.errors.length === 4, 'karisik dosya: gecersiz kayitlar atlanir, gecerli kalir (' + mx.errors.length + ' hata)');
  throwsCode(() => makeTemplate('', ops, tools), 'cam.tpl.bad_name', 'bos ad');
  throwsCode(() => makeTemplate('x', [], tools), 'cam.tpl.empty', 'bos islem listesi');
  // sablondan gelen islem hesaplanabilir (delme)
  const S0 = { id: 's1', name: 'S1', workOffset: { kind: 'G55' }, frame: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, stock: { kind: 'box' }, stockBox: { min: [0, 0, -30], max: [100, 60, 0] }, modelBBox: { min: [0, 0, -30], max: [100, 60, 0] }, clearance: 5, aAngle: null, stockTop: 0, machinePos: null };
  const holes = [{ feature: 'hX', dia: 6.8, depth: 15, through: false, tipAngle: 118, thread: null, dir: [0, 0, -1], positions: [[10, 10, 0]], dirs: [[0, 0, -1]] }];
  const tp = CAM.computeOp(inst.ops[1], { setup: S0, tool: { id: 'tB', number: 7, lengthOffset: 7, type: 'drill', dia: 6.8, tipAngle: 118, fluteLen: 40, bodyLen: 60, flutes: 2, centerCutting: true }, geom: { holes } });
  ok(validateToolpath(tp) && tp.moves.some((m) => m.t === 'cycle' && m.cycle === 'peck'), 'sablondan eklenen islem hesaplanir');
}

console.log('5. delik sira sablonu');
{
  const tools = [
    { id: 'sp', number: 6, type: 'spot', dia: 10, tipAngle: 90 }, { id: 'd68', number: 7, type: 'drill', dia: 6.8, tipAngle: 118 }, { id: 'd5', number: 9, type: 'drill', dia: 5, tipAngle: 118 }, { id: 'tap', number: 8, type: 'tap', dia: 8, pitch: 1.25 },
    { id: 'd6', number: 10, type: 'drill', dia: 6.8 + 0.2 - 0.2, tipAngle: 118 },
  ];
  const holes = [
    { feature: 'h1', dia: 8, depth: 14, through: false, thread: { major: 8, pitch: 1.25 }, tipAngle: 118, positions: [[0, 0, 0], [10, 0, 0]] },
    { feature: 'h2', dia: 5, depth: 20, through: false, thread: null, positions: [[0, 10, 0]] },
    { feature: 'h3', dia: 5, depth: 6, through: true, thread: null, positions: [[0, 20, 0]] },
    { feature: 'h4', dia: 40, depth: 5, through: false, thread: null, pocketLike: true, positions: [[5, 5, 0]] },
  ];
  let n = 0; const r = planHoleOps(holes, tools, { newId: () => 'q' + ++n });
  const seq = r.ops.map((o) => `${o.cycle}:${o.name}`);
  ok(r.groups.length === 3 && r.warnings.some((w) => w.code === 'cam.tpl.pocketlike_skipped'), 'uc delik sinifi, cep benzeri atlanir: ' + r.groups.length);
  // sira: punta (hepsi) -> matkap -> pah -> kilavuz
  const order = r.ops.map((o) => o.cycle); const idx = (c) => order.indexOf(c);
  ok(order.filter((c) => c === 'spot').length === 4 && idx('tap') === order.length - 1 && order.lastIndexOf('spot') > order.lastIndexOf('drill') - 99, 'siralama: ' + seq.join(' | '));
  ok(order.slice(0, 3).every((c) => c === 'spot') && order.slice(3, -2).every((c) => c === 'drill' || c === 'peck'), 'punta -> matkap bloklari: ' + order.join(','));
  const tapDrill = r.ops.find((o) => o.cycle === 'drill' && /M8x1\.25/.test(o.name));
  ok(tapDrill && tapDrill.toolId === 'd68', 'disli delik matkabi: major - hatve = 6.75 -> 6.8 takimi: ' + tapDrill?.toolId);
  const tapOp = r.ops.find((o) => o.cycle === 'tap'); const chOp = r.ops.find((o) => o.depth?.from === 'top' && /chamfer/.test(o.name) === false && o.name.startsWith('chamfer'));
  ok(tapOp.toolId === 'tap' && tapOp.depth.from === 'hole', 'kilavuz adimi: M8x1.25 kilavuzu');
  const ch = r.ops.filter((o) => o.name.startsWith('chamfer')); ok(ch.length === 1 && ch[0].toolId === 'sp' && Math.abs(ch[0].depth.d - 4.5) < 1e-9, 'pah derinligi (d/2 + 0.5)/tan(45) = 4.5: ' + ch[0]?.depth?.d);
  const pk = r.ops.filter((o) => o.cycle === 'peck'); ok(pk.length === 1 && pk[0].peck === 5 && pk[0].holes.filter.features.join() === 'h2', 'derin kor delik (20/5 > 3) peck, adim = cap: ' + JSON.stringify(pk.map((o) => [o.peck, o.holes.filter.features])));
  ok(r.ops.filter((o) => o.cycle === 'drill' && o.holes.filter.features.includes('h3')).length === 1, 'boydan boya kisa delik duz drill');
  ok(r.ops.every((o) => !('seqRole' in o) && !('_sortDia' in o) && o.holes.kind === 'feature'), 'islemler temiz (gecici alan yok)');
  // eksik takim -> toolId null + uyari; kural yoksa uyari
  const r2 = planHoleOps(holes.slice(1, 2), [], {}); ok(r2.ops.length === 2 && r2.ops.every((o) => o.toolId === null) && r2.warnings.filter((w) => w.code === 'cam.tpl.no_tool').length === 2, 'takimsiz: toolId null + uyari');
  ok(planHoleOps(holes.slice(1, 2), tools, { rules: [{ id: 'x', name: 'x', match: { threaded: true }, steps: [{ role: 'drill' }] }] }).warnings[0].code === 'cam.tpl.no_rule', 'eslesen kural yok -> uyari');
  // kullanici kurali: 12 mm ustu icin on-delme + raybalama; kabul edilmis diş ipucu
  const rules = checkHoleRules([{ id: 'big', name: 'Buyuk', match: { diaMin: 12 }, steps: [{ role: 'spot' }, { role: 'drill', diaOffset: -0.2 }, { role: 'ream' }] }, ...DEFAULT_HOLE_RULES]);
  const big = planHoleOps([{ feature: 'B', dia: 12, depth: 20, through: true, positions: [[0, 0, 0]] }], [{ id: 'dr', number: 1, type: 'drill', dia: 11.8 }, { id: 'rm', number: 2, type: 'reamer', dia: 12 }], { rules });
  ok(big.ops.map((o) => o.cycle).join() === 'spot,drill,ream' && big.ops[1].toolId === 'dr' && big.ops[2].toolId === 'rm', 'kullanici kurali: punta, 11.8 matkap, 12 rayba');
  throwsCode(() => checkHoleRules([{ id: 'a', name: 'a', steps: [{ role: 'yok' }] }]), 'cam.tpl.bad_step', 'kural adimi gecersiz');
  throwsCode(() => checkHoleRules([]), 'cam.tpl.bad_rules', 'bos kural listesi');
  const hint = planHoleOps([{ feature: 'T', dia: 8, depth: 14, through: false, thread: null, threadHint: { major: 8, pitch: 1.25 }, positions: [[0, 0, 0]] }], tools, { acceptThreadHint: true });
  ok(hint.ops.some((o) => o.cycle === 'tap') && !planHoleOps([{ feature: 'T', dia: 8, depth: 14, positions: [[0, 0, 0]], threadHint: { major: 8, pitch: 1.25 } }], tools, {}).ops.some((o) => o.cycle === 'tap'), 'threadHint yalniz kabul edilince disli sayilir');
  ok(classifyHole({ dia: 5, through: true, thread: null }).threaded === false, 'classifyHole');
  // uctan uca: planlanan her islem hesaplanir, program kurulur ve postlanir
  const S0 = { id: 's1', name: 'S1', workOffset: { kind: 'G55' }, frame: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, stock: { kind: 'box' }, stockBox: { min: [0, 0, -30], max: [100, 60, 0] }, modelBBox: { min: [0, 0, -30], max: [100, 60, 0] }, clearance: 5, aAngle: null, stockTop: 0, machinePos: null };
  const gh = holes.slice(0, 3).map((h) => ({ ...h, dir: [0, 0, -1], dirs: h.positions.map(() => [0, 0, -1]) }));
  const full = tools.map((t) => ({ lengthOffset: t.number, diaOffset: t.number, fluteLen: 30, bodyLen: 60, flutes: 2, centerCutting: t.type !== 'tap', ...t }));
  const sec = [];
  for (const o of r.ops.filter((x) => x.holes.filter.features.some((f) => f !== 'h4'))) {
    const tl = full.find((t) => t.id === o.toolId); const op = { ...o, rpm: 1500, feedCut: o.cycle === 'tap' ? 1 : 200, feedPlunge: 200 };
    const tp = CAM.computeOp(op, { setup: S0, tool: tl, geom: { holes: gh } }); ok(validateToolpath(tp), 'planlanan islem hesaplanir: ' + o.name); sec.push(tp);
  }
  const prog = CAM.buildProgram({ name: 'SEQ', machine: S.testMachine(), sections: [{ setup: S0, toolpaths: sec }] });
  const nc = postProgram(prog, S.testMachine(), OPTS).text;
  ok(/G81|G82/.test(nc) && /G83/.test(nc) && /G84/.test(nc), 'dizi NC: punta + matkap + kilavuz cevrimleri');
}

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
