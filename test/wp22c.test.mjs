// WP-22c testleri: (1) yay uydurma sarma/doner eksenli yolda atlanir, (2) WP-12 uyarlanir kaba verim maddeleri, (3) 3B kaba suresi
// (yalniz kisa olcum; P2 tepsi olcumu test/wp15/p-sure.mjs), (4) node'da ayni is parcaciginda iptal (olay dongusune yer verilir).
// Calistir: node test/wp22c.test.mjs   (WP22C_ONLY=1,2 gibi: yalniz secili bolumler)
import * as CAM from '../src/cam/index.js';
import * as G from '../src/shared/geom2d.js';
import { validateToolpath } from '../src/cam/ir.js';
import { builtinMachines, copyMachine } from '../src/cam/machines/builtin.js';
import { postProgram } from '../src/cam/post/index.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const ONLY = (process.env.WP22C_ONLY || '').split(',').filter(Boolean);
const sec = (k) => !ONLY.length || ONLY.includes(String(k));
const t0 = Date.now();
const el = () => `${((Date.now() - t0) / 1000).toFixed(0)} sn`;

// --- WP-12 ortak (2. bolum)
const circ = (c, r, fwd) => [{ ...G.mkArc(c, r, 0, 2 * Math.PI), fwd, open: false }];
const sq = (x0, y0, x1, y1) => [G.mkLine([x0, y0], [x1, y0]), G.mkLine([x1, y0], [x1, y1]), G.mkLine([x1, y1], [x0, y1]), G.mkLine([x0, y1], [x0, y0])].map((s) => ({ ...s, fwd: true, open: false }));
const flat = (dia) => ({ id: 't' + dia, number: 5, lengthOffset: 5, diaOffset: 5, type: 'flat', dia, fluteLen: 25, bodyLen: 50, flutes: 3, centerCutting: true });
const setupOf = (min, max) => ({ id: 's1', name: 'S1', workOffset: { kind: 'G55' }, frame: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, stock: { kind: 'box' }, stockBox: { min, max }, modelBBox: { min, max }, clearance: 5, aAngle: null, stockTop: max[2], machinePos: null });
const adBase = { id: 'a', name: 'AD', type: 'adaptive', rpm: 8000, feedCut: 800, feedPlunge: 300, coolant: 'flood', heights: { clearance: 10, retract: 2 }, geom: [{ kind: 'face' }], optimalLoad: 1.5, stepdown: 6, stockToLeave: 0, entry: { kind: 'helix', angle: 3, helixDia: 8 } };
const errOf = (fn) => { try { fn(); return null; } catch (e) { return e; } };

// ---------------------------------------------------------------- 1. yay uydurma + sarma
if (sec(1)) {
  console.log('1. yay uydurma: sarma (A) yolunda atlanir');
  const BM = builtinMachines();
  const M = copyMachine(BM.find((m) => m.id === 'builtin-generic-4axis-a-fanuc'), 'test-f4', 'TEST F4');
  for (const k of ['X', 'Y', 'Z']) M.axes[k].travel = 800; M.spindle.maxRpm = 12000; M.feed.maxCut = 5000; M.toolChange.maxTools = 20;
  const body = (() => { const v = []; for (const x of [0, 100]) for (const y of [-17, 17]) for (const z of [-17, 17]) v.push(x, y, z); return { id: 'b', vertices: new Float32Array(v) }; })();
  const S = CAM.resolveSetup({ id: 'w', name: 'Sarma', bodies: ['b'], frame: { origin: { kind: 'model' } }, stock: { kind: 'cyl', dia: 50, len: 120 }, workOffset: { kind: 'G54' }, wrap: { enabled: true } }, { bodies: [body] }, M);
  const tool10 = { id: 't10', number: 4, lengthOffset: 4, diaOffset: 4, type: 'flat', dia: 10, fluteLen: 20, bodyLen: 45, flutes: 3, centerCutting: true };
  // acilmis duzlemde yay: sarmada X ve A birlikte degisen bircok kisa feed hareketi (eski kod bunlari ilk hareketin A'siyla birlestiriyordu)
  const geom = { items: [{ segs: [{ ...G.mkArc([50, 0], 20, 0, Math.PI), fwd: true }], closed: false, z: null }] };
  const op = { id: 'g', name: 'Kanal', type: 'wrapContour', rpm: 6000, feedCut: 500, feedPlunge: 200, coolant: 'flood', geom: [{ kind: 'chain' }], side: 'on', stepdown: 2, heights: { clearance: 10, retract: 2, bottom: { from: 'stockTop', off: -2 } } };
  const a = CAM.computeOp(op, { setup: S, tool: tool10, geom, machine: M });
  const nA = a.moves.filter((m) => m.a != null).length;
  ok(nA > 50, `sarma yolu A'li hareketler (${nA})`);
  let b = null, err = null;
  try { b = CAM.computeOp({ ...op, arcFit: { tol: 0.005 } }, { setup: S, tool: tool10, geom, machine: M }); } catch (e) { err = e; }
  ok(!err, 'arcFit + sarma: hata yok (cam.internal_ir yok): ' + (err && err.code));
  if (b) {
    ok(b.moves.length === a.moves.length, `hareket sayisi korunur (${b.moves.length} = ${a.moves.length})`);
    ok(a.moves.every((m, k) => m.a === b.moves[k].a && m.x === b.moves[k].x && m.t === b.moves[k].t), 'A (ve X) degerleri aynen korunur');
    ok(!b.moves.some((m) => m.t === 'arc'), 'sarma yolunda G2/G3 uretilmez');
    ok(b.meta.arcFit?.skipped === 'rotary', 'meta.arcFit.skipped = rotary');
    ok(b.warnings.some((w) => w.code === 'cam.arcfit.skipped_rotary'), 'uyari: cam.arcfit.skipped_rotary');
    ok(validateToolpath(b) === true, 'IR gecerli');
    let nc = null; try { nc = postProgram(CAM.buildProgram({ name: 'W', number: 22, machine: M, sections: [{ setup: S, toolpaths: [b] }] }), M, { date: '2026-01-01', appVersion: '0.6.0', gates: [] }); } catch (e) { nc = e; }
    const txt = typeof nc === 'string' ? nc : nc?.text ?? nc?.nc; ok(typeof txt === 'string' && /A-?\d/.test(txt) && !/G0?[23][^0-9]/.test(txt.replace(/\(.*?\)/g, '')), 'post: sarma yolu NC (A kelimeli, G2/G3 yok): ' + (nc?.code || ''));
  }
  console.log(`   (${el()})`);
}

// ---------------------------------------------------------------- 2c. dar halka: girissiz alan kaybolmaz
if (sec('2c')) {
  console.log('2c. dar halka: hic yol yoksa girissiz alan hata metninde');
  const S0 = setupOf([0, 0, -30], [100, 100, 0]);
  const ring = (W) => ({ z: -6, normalOk: true, outer: circ([50, 50], 20 + W, true), inners: [circ([50, 50], 20, false)] });
  const A12 = Math.PI * (32 * 32 - 20 * 20);
  const e = errOf(() => CAM.computeOp(adBase, { setup: S0, tool: flat(10), geom: { faces: [ring(12)] } }));
  ok(e && e.code === 'cam.adaptive.no_entry_left', 'D10, helis 8, halka 12 mm: hata cam.adaptive.no_entry_left (eskiden cam.adaptive.nothing): ' + (e && e.code));
  ok(e && e.params.area > 0.7 * A12 && e.params.area <= A12 + 1, `hata alani ${e?.params?.area} mm2 ~ halka alani ${A12.toFixed(0)}`);
  const tp = CAM.computeOp({ ...adBase, entry: { kind: 'helix', angle: 3, helixDia: 1.5 } }, { setup: S0, tool: flat(10), geom: { faces: [ring(14)] } });
  ok(tp.moves.length > 0 && validateToolpath(tp) === true, 'halka 14 mm, helis 1,5: yol uretilir');
  const e2 = errOf(() => CAM.computeOp(adBase, { setup: S0, tool: flat(10), geom: { faces: [{ z: -6, normalOk: true, outer: sq(40, 40, 49, 70), inners: [] }] } }));
  ok(e2 && e2.code === 'cam.pocket.rest_material' && e2.params.area > 200 && e2.params.area <= 271, 'takimdan dar cep (9x30, D10): hata cam.pocket.rest_material, alan ~270: ' + (e2 && e2.code + JSON.stringify(e2.params)));
  console.log(`   (${el()})`);
}

console.log(`\n${pass} gecti, ${fail} kaldi (${el()})`);
process.exit(fail ? 1 : 0);
