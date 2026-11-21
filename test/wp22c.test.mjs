// WP-22c testleri: (1) yay uydurma sarma/doner eksenli yolda atlanir, (2) WP-12 uyarlanir kaba verim maddeleri, (3) 3B kaba suresi
// (yalniz kisa olcum; P2 tepsi olcumu test/wp15/p-sure.mjs), (4) node'da ayni is parcaciginda iptal (olay dongusune yer verilir).
// Calistir: node test/wp22c.test.mjs   (WP22C_ONLY=1,2 gibi: yalniz secili bolumler)
import * as CAM from '../src/cam/index.js';
import * as G from '../src/shared/geom2d.js';
import { validateToolpath } from '../src/cam/ir.js';
import { builtinMachines, copyMachine } from '../src/cam/machines/builtin.js';
import { postProgram } from '../src/cam/post/index.js';
import { simulate, sampleHeightmap } from '../src/cam/sim/index.js';
import { computeOpAsync } from '../src/cam/surf/async.js';
import { KErr } from '../src/shared/errors.js';

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

// ---------------------------------------------------------------- 2a. rest: ince artik icin havadan helis yok
if (sec('2a')) {
  console.log('2a. rest (onceki islem stogu): ince kose artigi icin helis acilmaz, yandan girilir');
  const S0 = setupOf([0, 0, -30], [100, 60, 0]);
  const face3 = { z: -8, normalOk: true, outer: sq(20, 15, 80, 45), inners: [] };
  const pk16 = CAM.computeOp({ ...adBase, id: 'p16', type: 'pocket', stepover: 6, stepdown: 8, entry: { kind: 'helix', angle: 3, helixDia: 8 } }, { setup: S0, tool: { ...flat(16), number: 7, lengthOffset: 7, diaOffset: 7 }, geom: { faces: [face3] } });
  const s1 = simulate(pk16, { res: 0.5, stockBox: S0.stockBox });
  const rs = CAM.computeOp({ ...adBase, id: 'r2', optimalLoad: 0.8, stepdown: 8, entry: { kind: 'helix', angle: 3, helixDia: 3 }, rest: { source: 'stock' } }, { setup: S0, tool: { ...flat(4), number: 6, lengthOffset: 6, diaOffset: 6 }, geom: { faces: [face3] }, stockMap: s1.remainHeightmap });
  const ramps = rs.moves.filter((m) => m.kind === 'ramp').length;
  ok(rs.meta.adaptive.entries === 0 && ramps === 0, `helis girisi yok (giris ${rs.meta.adaptive.entries}, ramp ${ramps}; WP-12'de 1 helis, 0 mm'den 8 mm havada)`);
  ok(rs.stats.cutLen < 620, `kesme yolu ${rs.stats.cutLen.toFixed(0)} mm (WP-12: 653 mm)`);
  const s25 = simulate(pk16, { res: 0.25, stockBox: S0.stockBox }).remainHeightmap;
  const s2 = simulate(rs, { res: 0.25, stockBox: S0.stockBox, stockHeightmap: s25 });
  ok(!s2.issues.some((i) => i.level === 'error'), 'rest sim hatasiz');
  const corners = [[21.5, 16.5], [78.5, 16.5], [21.5, 43.5], [78.5, 43.5]].map(([x, y]) => sampleHeightmap(s2.remainHeightmap, x, y));
  ok(corners.every((v) => v <= -8 + 0.01), 'dort kose tabanda: ' + corners.map((v) => v.toFixed(2)).join(' '));
  console.log(`   kesme ${rs.stats.cutLen.toFixed(0)} mm, paso ${rs.meta.adaptive.passes}, kalkis ${rs.meta.adaptive.lifts} (${el()})`);
}

// ---------------------------------------------------------------- 4. node: ayni is parcaciginda iptal (belgelenen davranis)
if (sec(4)) {
  console.log('4. computeOpAsync, worker yok (node): iptal hesaptan once / sonra; ctx.shouldStop suren hesabi keser');
  const S0 = setupOf([0, 0, -30], [100, 60, 0]);
  const face1 = { z: -10, normalOk: true, outer: sq(20, 10, 55, 35), inners: [] };
  const op = { ...adBase, stepdown: 10, stockToLeave: { radial: 0.3, axial: 0 } };
  const ctx = { setup: S0, tool: flat(10), geom: { faces: [face1] } };
  const codeOf = async (p) => { try { await p; return 'ok'; } catch (e) { return e.code; } };
  const ac0 = new AbortController(); ac0.abort();
  ok(await codeOf(computeOpAsync(op, ctx, { signal: ac0.signal, worker: false })) === 'cam.op.cancelled', 'onceden iptal');
  // cagridan hemen sonra (ayni senkron blokta) iptal: hesaba baslamadan once bir olay dongusu turu verilir -> hesap yapilmaz
  { const ac = new AbortController(); const t1 = Date.now(); const pr = computeOpAsync(op, ctx, { signal: ac.signal, worker: false }); ac.abort();
    const c = await codeOf(pr); ok(c === 'cam.op.cancelled' && Date.now() - t1 < 1000, `cagridan hemen sonra iptal: hesap baslamaz (${c}, ${Date.now() - t1} ms)`); }
  // hesap surerken zamanlanan abort: hesap kesilmez (senkron), bitince sonuc atilir -> cam.op.cancelled
  { const ac = new AbortController(); const t1 = Date.now(); const pr = computeOpAsync(op, ctx, { signal: ac.signal, worker: false }); setTimeout(() => ac.abort(), 50);
    const c = await codeOf(pr); const ms = Date.now() - t1; ok(c === 'cam.op.cancelled', `suren hesapta abort: sonuc atilir (${c}, ${ms} ms; hesap kesilmeden bitti)`); }
  // ctx.shouldStop (sure siniri) suren hesabi keser: uyarlanir motor paso arasinda denetler
  { const t1 = Date.now(); const dl = t1 + 300; const c = await codeOf(computeOpAsync(op, { ...ctx, shouldStop: () => { if (Date.now() > dl) throw new KErr('cam.op.cancelled', {}); } }, { worker: false }));
    const ms = Date.now() - t1; ok(c === 'cam.op.cancelled' && ms < 3000, `ctx.shouldStop sure siniri (300 ms) hesabi kesti: ${c}, ${ms} ms`); }
  // iptalsiz: sonuc ayni
  { const a = CAM.computeOp(op, ctx); const b = await computeOpAsync(op, ctx, { worker: false }); ok(a.moves.length === b.moves.length, 'iptalsiz sonuc satir ici ile ayni'); }
  console.log(`   (${el()})`);
}

console.log(`\n${pass} gecti, ${fail} kaldi (${el()})`);
process.exit(fail ? 1 : 0);
