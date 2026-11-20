// Stok simulasyonu testi. Calistir: node test/sim.test.mjs
import { mk, normalizeRapids } from '../src/cam/ir.js';
import { simulate, createSim, heightmapFromFn, sampleHeightmap, createHeightmap, toolGeom } from '../src/cam/sim/index.js';
import { tapMinorDia } from '../src/cam/sim/tool.js';
import { gates } from '../src/cam/gates.js';
import { postProgram, readNC } from '../src/cam/post/index.js';
import * as S from './cam-samples/samples.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, tolRel, m) => ok(Math.abs(a - b) <= tolRel * Math.abs(b), `${m}: ${a.toFixed(3)} beklenen ${b.toFixed(3)} (+-%${tolRel * 100})`);
const throwsCode = (fn, code, msg) => { try { fn(); ok(false, (msg || code) + ' (hata beklenirdi)'); } catch (e) { ok(e.code === code, `${msg || code}: ${e.code} ${JSON.stringify(e.params)}`); } };
const codes = (r) => [...new Set(r.issues.map((i) => i.code))].sort();

// kucuk yardimci: tek takim yolu
const TP = (tool, moves, over = {}) => mk.toolpath({ tool, rpm: 5000, spindleDir: 'cw', coolant: 'off', clearanceZ: 10, retractZ: 5, moves, ...over });
const BOX = { min: [-20, -20, -30], max: [20, 20, 0] };

console.log('1. bilinen hacimler');
{
  const smp = S.pocketHelixSample();
  const r = simulate(smp.program, { stockBox: smp.stockBox, res: 0.25 });
  near(r.removedVolume, smp.expectedVolume, 0.02, '20x20x5 cep (D6 takim, kose yaricapi 3 -> analitik)');
  near(r.removedVolume, 2000, 0.04, '20x20x5 = 2000 mm3 civari');
  ok(r.issues.length === 0, 'cep sorunsuz: ' + codes(r));
  const hm = r.remainHeightmap;
  ok(Math.abs(sampleHeightmap(hm, 0, 0) - -5) < 1e-4 && Math.abs(sampleHeightmap(hm, 9, 0) - -5) < 1e-4, 'cep tabani -5');
  ok(sampleHeightmap(hm, 12, 0) === 0 && sampleHeightmap(hm, 0, 12) === 0, 'cep disi dokunulmamis');
  ok(sampleHeightmap(hm, 9.9, 9.9) === 0, 'kose yuvarlak kalir (takim kose yaricapi)');

  // geri okunan yol (IR') ayni hacmi verir; takim geometrisi asil IR'den
  const machine = S.testMachine();
  const nc = postProgram(smp.program, machine, { date: 'x', gates: [] });
  const back = readNC(nc.text, { machine }).program;
  back.sections[0].toolpath.tool = { ...smp.program.sections[0].toolpath.tool };
  const r2 = simulate(back, { stockBox: smp.stockBox, res: 0.25 });
  near(r2.removedVolume, r.removedVolume, 0.002, 'geri okunan yol ayni hacim');
  ok(r2.issues.length === 0, 'geri okunan yol sorunsuz');

  // ball: yarim kure 2/3 pi R^3
  const ball = { number: 9, H: 9, D: 9, type: 'ball', dia: 6, fluteLen: 12, bodyLen: 40 };
  let rb = simulate(TP(ball, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -3, 100, 'plunge'), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.1 });
  near(rb.removedVolume, (2 / 3) * Math.PI * 27, 0.03, 'ball yarim kure');
  // matkap: R=3, 118 derece, uc z=-10: pi R^2 10 - 2 pi R^3/3/tan(59)
  const dr = { number: 7, H: 7, D: 7, type: 'drill', dia: 6, tipAngle: 118, fluteLen: 30, bodyLen: 50 };
  const rd = simulate(TP(dr, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -10, 100, 'plunge'), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.1 });
  near(rd.removedVolume, Math.PI * 9 * 10 - 2 * Math.PI * 27 / 3 / Math.tan(59 * Math.PI / 180), 0.03, 'matkap konik uc hacmi');
  // bullnose D10 r2 dalma -3: silindir - kose boslugu (sayisal)
  const bn = { number: 4, H: 4, D: 4, type: 'bullnose', dia: 10, cornerR: 2, fluteLen: 20, bodyLen: 45 };
  let corner = 0; { const R = 5, c = 2, n = 20000; for (let k = 0; k < n; k++) { const r = (R - c) + (c * (k + 0.5)) / n; const p = c - Math.sqrt(Math.max(0, c * c - (r - (R - c)) ** 2)); corner += 2 * Math.PI * r * p * (c / n); } }
  const rn = simulate(TP(bn, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -3, 100, 'plunge'), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.1 });
  near(rn.removedVolume, Math.PI * 25 * 3 - corner, 0.02, 'bullnose uc profili');
  // duz uc: silindir
  const fl = { number: 2, H: 2, D: 2, type: 'flat', dia: 10, fluteLen: 20, bodyLen: 45 };
  const rf = simulate(TP(fl, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -3, 100, 'plunge'), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.1 });
  near(rf.removedVolume, Math.PI * 25 * 3, 0.02, 'flat silindir');
}

console.log('2. wear telafisi kontur');
{
  const smp = S.contourWearSample();
  const r = simulate(smp.program, { stockBox: smp.stockBox, res: 0.25 });
  ok(r.issues.length === 0, 'kontur sorunsuz: ' + JSON.stringify(r.issues.slice(0, 2)));
  const hm = r.remainHeightmap;
  const at = (x, y) => sampleHeightmap(hm, x, y);
  ok(at(0, -22.5) === -6 && at(22.5, 0) === -6 && at(0, 22.5) === -6, 'kanal parca disinda (takim yaricapi ofseti uygulandi): ' + [at(0, -22.5), at(22.5, 0)]);
  ok(at(0, -15) === 0 && at(0, 0) === 0 && at(15, 15) === 0, 'parca ici kesilmedi');
  ok(at(0, -31) === 0, 'kanal disi dokunulmadi');
}

console.log('3. kasitli hatali yollar');
{
  const flat6 = S.TOOLS.flat6;
  // a) hizli hareket stok icinde
  let r = simulate(TP(flat6, [mk.rapid(0, 0, 10), mk.rapid(0, 0, -5), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.25 });
  ok(codes(r).includes('cam.sim.rapid_in_stock') && r.issues.find((i) => i.code === 'cam.sim.rapid_in_stock').moveIndex === 1 && r.issues[0].level === 'error', 'hizli stok icine girdi: ' + JSON.stringify(r.issues.map((i) => [i.code, i.moveIndex])));
  // yatay hizli stok icinde
  r = simulate(TP(flat6, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -3, 100, 'plunge'), mk.rapid(10, 0, -3), mk.rapid(10, 0, 10)]), { stockBox: BOX, res: 0.25 });
  ok(r.issues.some((i) => i.code === 'cam.sim.rapid_in_stock' && i.moveIndex === 3), 'yatay hizli stok icinde');
  // hizli yuzeyde (z = ust) sorun degil
  r = simulate(TP(flat6, [mk.rapid(-30, 0, 10), mk.rapid(-30, 0, 0), mk.rapid(30, 0, 0), mk.rapid(30, 0, 10)]), { stockBox: BOX, res: 0.25 });
  ok(r.issues.length === 0, 'stok yuzeyinde hizli sorunsuz: ' + codes(r));
  // b) oyma: model tabla z=-5; yol -6'ya iner
  const model = heightmapFromFn([-20, -20], [20, 20], 0.25, () => -5);
  r = simulate(TP(flat6, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -6, 100, 'plunge'), mk.feed(8, 0, -6, 200), mk.rapid(8, 0, 10)]), { stockBox: BOX, res: 0.25, modelHeightmap: model });
  const g = r.issues.filter((i) => i.code === 'cam.sim.gouge');
  ok(g.length === 2 && near(g[0].params.depth, 1, 0.01, 'oyma derinligi') !== false, 'oyma yakalandi: ' + g.length);
  r = simulate(TP(flat6, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -5.005, 100, 'plunge'), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.25, modelHeightmap: model });
  ok(!codes(r).includes('cam.sim.gouge'), 'tolerans icinde (0,005) oyma sayilmaz');
  r = simulate(TP(flat6, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -5.2, 100, 'plunge'), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.25, modelHeightmap: { ...model, err: 0.5 } });
  ok(!codes(r).includes('cam.sim.gouge'), 'harita hatasi toleransa eklenir');
  // c) kesici boy asimi (fluteLen 15; -20 derin)
  r = simulate(TP(flat6, [mk.rapid(30, 0, 10), mk.rapid(30, 0, -20), mk.feed(0, 0, -20, 200), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.25 });
  ok(codes(r).includes('cam.sim.flute_exceeded'), 'kesici boy asimi: ' + codes(r));
  // d) tutucu carpmasi: bodyLen 8, tutucu D40
  const short = { ...flat6, fluteLen: 5, bodyLen: 8 };
  r = simulate(TP(short, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -10, 100, 'plunge'), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.25 });
  ok(codes(r).includes('cam.sim.holder_collision'), 'tutucu carpmasi: ' + codes(r));
  const ok1 = simulate(TP(short, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -4.5, 100, 'plunge'), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.25 });
  ok(ok1.issues.length === 0, 'sinir icinde derinlik sorunsuz: ' + codes(ok1));
  // e) saft carpmasi: saft D12 > kesici D6
  const neck = { ...flat6, fluteLen: 5, bodyLen: 40, shaftDia: 12, holder: null };
  r = simulate(TP(neck, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -8, 100, 'plunge'), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.25 });
  ok(codes(r).includes('cam.sim.shaft_collision'), 'saft carpmasi: ' + codes(r));
  // f) tutucu yandan carpma: derin kanalin kenarina yanasma (komsu stok)
  r = simulate(TP(short, [mk.rapid(-30, 0, 10), mk.rapid(-30, 0, -3), mk.rapid(-10, 0, -3), mk.rapid(-10, 0, 10)]), { stockBox: BOX, res: 0.25 });
  ok(codes(r).includes('cam.sim.rapid_in_stock'), 'yanal hizli kenar');
  // g) stok tabani altina inis
  r = simulate(TP(flat6, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -31, 100, 'plunge'), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.25, tool: { fluteLen: 40, bodyLen: 60 } });
  // V-12: bildirilmis pay yoksa stok tabani alti ENGEL (error); islem payi bildirdiyse (boydan boya) uyari; payi asan yine engel
  ok(r.issues.some((i) => i.code === 'cam.sim.below_stock' && i.level === 'error'), 'V-12: paysiz stok tabani altina inis engel: ' + codes(r));
  { const tpA = TP(flat6, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -31, 100, 'plunge'), mk.rapid(0, 0, 10)]); tpA.meta = { belowStock: 1 };
    const rA = simulate(tpA, { stockBox: BOX, res: 0.25, tool: { fluteLen: 40, bodyLen: 60 } });
    ok(rA.issues.some((i) => i.code === 'cam.sim.below_stock' && i.level === 'warn') && !rA.issues.some((i) => i.code === 'cam.sim.below_stock' && i.level === 'error'), 'V-12: bildirilmis boydan boya pay icinde yalniz uyari');
    tpA.meta = { belowStock: 0.5 }; const rB = simulate(tpA, { stockBox: BOX, res: 0.25, tool: { fluteLen: 40, bodyLen: 60 } });
    ok(rB.issues.some((i) => i.code === 'cam.sim.below_stock' && i.level === 'error'), 'V-12: payi asan inis engel'); }
  // V-13: tabana kadar delinmis hucreye geri cekilme/hizli 'stok icinde' sayilmaz
  { const rC = simulate(TP(flat6, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -31, 100, 'plunge'), mk.rapid(0, 0, -30.5), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.25, tool: { fluteLen: 40, bodyLen: 60 } });
    ok(!codes(rC).includes('cam.sim.rapid_in_stock'), 'V-13: delinmis (h=taban) hucrede hizli temiz: ' + codes(rC)); }
  // sorun ust siniri
  const many = []; for (let k = 0; k < 40; k++) many.push(mk.rapid(0, 0, -5), mk.rapid(0, 0, 10));
  r = simulate(TP(flat6, [mk.rapid(0, 0, 10), ...many]), { stockBox: BOX, res: 0.5, maxIssuesPerCode: 5 });
  ok(r.issues.length === 5 && r.suppressed > 0, 'sorun ust siniri ' + r.issues.length + '/' + r.suppressed);
}

console.log('4. orneklerin tamami (sorunsuz, 3+1, cevrimler)');
{
  for (const smp of S.ALL()) {
    const r = simulate(smp.program, { stockBox: smp.stockBox, res: 0.5 });
    ok(r.issues.length === 0, `${smp.name}: sorunsuz ${JSON.stringify(r.issues.slice(0, 2).map((i) => [i.code, i.section, i.moveIndex]))}`);
    ok(r.removedVolume > 0 || smp.name === 'xx', `${smp.name}: hacim > 0 (${r.removedVolume.toFixed(1)})`);
  }
  const ix = S.indexedSample();
  const r = simulate(ix.program, { stockBox: ix.stockBox, res: 0.5 });
  ok(Object.keys(r.remainBySetup).length === 4, '3+1: her A acisi kendi setup stoku: ' + Object.keys(r.remainBySetup));
  const ds = S.drillSample(); const rd = simulate(ds.program, { stockBox: ds.stockBox, res: 0.25 });
  const hm = rd.remainBySetup.s1;
  ok(Math.abs(sampleHeightmap(hm, -30, 0) - -20) < 0.8 && sampleHeightmap(hm, 30, -15) < -14, 'delikler acildi: ' + [sampleHeightmap(hm, -30, 0), sampleHeightmap(hm, 30, -15)]);
  // ayni setup bolumleri stoku tasir
  ok(rd.removedVolume > 600, 'delik hacmi toplami ' + rd.removedVolume.toFixed(0));
  // G99 ara gecis stok ustunde: bozuk R (stok icinde) yakalanir
  const bad = JSON.parse(JSON.stringify(ds.program)); bad.sections = [bad.sections[1]];
  bad.sections[0].toolpath.moves[1].retract = -3; // peck: R stok icinde
  bad.sections[0].toolpath.moves[1].clearance = 20;
  const rb = simulate(bad, { stockBox: ds.stockBox, res: 0.5 });
  ok(rb.issues.some((i) => i.code === 'cam.sim.rapid_in_stock'), 'R duzlemi stok icinde -> hizli stok ici: ' + codes(rb));
}

console.log('5. adim adim API, kareler, hatalar');
{
  const smp = S.pocketHelixSample();
  const sim = createSim(smp.program, { stockBox: smp.stockBox, res: 0.5, frames: 10 });
  ok(sim.total === smp.program.sections[0].toolpath.moves.length && !sim.done, 'createSim toplam ' + sim.total);
  let r1 = sim.step(5); ok(r1.index === 5 && !r1.done, 'step(5)');
  const st = sim.state(); ok(st.index === 5 && st.position && st.moveIndex === 4 && st.removedVolume >= 0, 'state()');
  const v5 = st.removedVolume;
  sim.step(1000); ok(sim.done, 'done');
  const res = sim.result();
  const full = simulate(smp.program, { stockBox: smp.stockBox, res: 0.5 });
  ok(Math.abs(res.removedVolume - full.removedVolume) < 1e-9 && res.removedVolume > v5, 'adim adim = tek seferde');
  ok(Array.isArray(res.frames) && res.frames.length === Math.floor(sim.total / 10) && res.frames[0].heightmap instanceof Float32Array, 'kareler');
  sim.reset(); ok(sim.state().index === 0 && sim.state().removedVolume === 0, 'reset');
  ok(sim.heightmap() === null, 'reset sonrasi harita yok');
  // hatalar
  throwsCode(() => simulate(smp.program, { res: 0.5 }), 'cam.sim.no_stock', 'stok yok');
  throwsCode(() => simulate(smp.program, { stockBox: smp.stockBox }), 'cam.sim.bad_res', 'cozunurluk yok');
  const dr = { number: 7, H: 7, D: 7, type: 'drill', dia: 6, fluteLen: 30, bodyLen: 50 };
  throwsCode(() => simulate(TP(dr, [mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 1 }), 'cam.sim.tool_geom', 'matkap uc acisi yok');
  throwsCode(() => toolGeom({ type: 'bullnose', dia: 10, fluteLen: 5, bodyLen: 10 }), 'cam.sim.tool_geom', 'bullnose kose yaricapi yok');
  throwsCode(() => simulate({ ...TP(S.TOOLS.flat6, [mk.rapid(0, 0, 5)]) }, { stockBox: BOX, res: 1 }), 'cam.ir.first_not_clearance', 'gecersiz IR simule edilmez');
  // takim ekstra bilgisi opts.tools ile
  const plain = { ...S.TOOLS.flat6 }; delete plain.holder;
  const r3 = simulate(TP(plain, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -10, 100, 'plunge'), mk.rapid(0, 0, 10)]), { stockBox: BOX, res: 0.5, tools: { 2: { fluteLen: 5, bodyLen: 8, holder: { dia: 40, len: 50 } } } });
  ok(codes(r3).includes('cam.sim.holder_collision'), 'opts.tools ile tutucu eklendi');
}

console.log('6. T-22 kilavuz: dis dibi capi (gercek hatalar hala yakalanir)');
{
  ok(Math.abs(tapMinorDia({ dia: 3, pitch: 0.5 }) - 2.459) < 1e-3, 'M3x0,5 dip 2,459: ' + tapMinorDia({ dia: 3, pitch: 0.5 }));
  ok(Math.abs(tapMinorDia({ dia: 6, pitch: 1 }) - 4.9175) < 1e-3, 'M6x1 dip 4,918');
  ok(Math.abs(tapMinorDia({ dia: 10, pitch: 1.5 }) - 8.376) < 1e-3, 'M10x1,5 dip 8,376');
  ok(tapMinorDia({ dia: 3, pitch: 0.5, minorDia: 2.5 }) === 2.5, 'takimda minorDia varsa o');
  ok(toolGeom({ type: 'tap', dia: 3, fluteLen: 10, bodyLen: 30 }).cutR === 1.5, 'hatve yoksa majör cap (muhafazakar)');
  ok(toolGeom({ type: 'tap', dia: 3, pitch: 0.5, fluteLen: 10, bodyLen: 30 }).R === 1.5, 'zarf (hizli/saft/tutucu) majör capla');
  const RM = 2.459 / 2;
  // model: (0,0)'da Ø2,459 x 10 delik (STEP dis dibi capinda), gerisi z=0 dolu
  const model = heightmapFromFn([-10, -10], [10, 10], 0.05, (x, y) => (Math.hypot(x, y) <= RM ? -10 : 0));
  // stok: Ø2,5 on delik delinmis
  const pre = heightmapFromFn([-10, -10], [10, 10], 0.05, (x, y) => (Math.hypot(x, y) <= 1.25 ? -10 : 0));
  const bx = { min: [-10, -10, -30], max: [10, 10, 0] };
  const tapT = (dia, pitch, x = 0, bottom = -8, retract = 5) => TP({ number: 8, H: 8, type: 'tap', dia, pitch, fluteLen: 12, bodyLen: 40 },
    [mk.rapid(x, 0, 10), mk.cycle({ cycle: 'tap', points: [[x, 0]], top: 0, bottom, retract, clearance: 10, pitch, f: 5000 * pitch }), mk.rapid(x, 0, 10)]);
  const run = (tp, o = {}) => simulate(tp, { stockBox: bx, stockHeightmap: pre, modelHeightmap: model, res: 0.05, ...o });
  let r = run(tapT(3, 0.5));
  ok(r.issues.length === 0, 'M3 kilavuz Ø2,459 model deliginde oyma yok: ' + codes(r));
  r = run(tapT(4, 0.7));
  ok(codes(r).includes('cam.sim.gouge'), 'M4 kilavuz M3 deliginde: oyma yakalanir: ' + codes(r));
  r = run(tapT(3, 0.5, 5));
  ok(codes(r).includes('cam.sim.gouge'), 'kilavuz deliksiz yerde: oyma yakalanir: ' + codes(r));
  r = run(tapT(3, 0.5, 0, -12));
  ok(codes(r).includes('cam.sim.gouge'), 'kilavuz delik dibinden derin: oyma yakalanir: ' + codes(r));
  r = run(tapT(3, 0.5, 0, -8, -3));
  ok(codes(r).includes('cam.sim.rapid_in_stock'), 'R duzlemi delik icinde: majör capla hizli stok icinde yakalanir: ' + codes(r));
  r = run(tapT(3, 0.5), { tools: { 8: { minorDia: 2.8 } } });
  ok(codes(r).includes('cam.sim.gouge'), 'takim minorDia (2,8) model deliginden buyuk: oyma: ' + codes(r));
}

console.log('7. T-17 oyma olcusu (yuzeye dik) + T-16 koruma (gercek oymalar hala engel)');
{
  const bx = { min: [-20, -20, -30], max: [20, 20, 0] };
  const drill = (dia, tipAngle) => ({ number: 7, H: 7, type: 'drill', dia, tipAngle, fluteLen: 30, bodyLen: 50 });
  const cyc = (x, bottom) => [mk.rapid(x, 0, 10), mk.cycle({ cycle: 'drill', points: [[x, 0]], top: 0, bottom, retract: 5, clearance: 10, f: 200 }), mk.rapid(x, 0, 10)];
  const gouges = (r) => r.issues.filter((i) => i.code === 'cam.sim.gouge');
  // a) O6,1 matkap O6 model deliginde (P2 o7 / P4 o9 tipi): engel kalir, olcu ~0,05 (dusey fark degil)
  const hole6 = heightmapFromFn([-20, -20], [20, 20], 0.05, (x, y) => (Math.hypot(x, y) <= 3 ? -20 : 0));
  let r = simulate(TP(drill(6.1, 118), cyc(0, -15)), { stockBox: bx, modelHeightmap: hole6, res: 0.05 });
  let g = gouges(r);
  ok(g.length === 1 && g[0].level === 'error', 'O6,1 > O6: oyma hala engel: ' + codes(r));
  ok(g.length && g[0].params.depth > 0 && g[0].params.depth <= 0.06, 'oyma olcusu yuzeye dik ~0,05: ' + (g[0]?.params.depth));
  ok(g.length && g[0].params.vertical > 5, 'dusey fark ayrica raporlanir: ' + (g[0]?.params.vertical));
  r = simulate(TP(drill(6.0, 118), cyc(0, -15)), { stockBox: bx, modelHeightmap: hole6, res: 0.05 });
  ok(!codes(r).includes('cam.sim.gouge'), 'O6 matkap O6 delikte temiz: ' + codes(r));
  // b) kati modele dalma: olcu buyuk kalir (kucuk gosterilmez)
  const solid = heightmapFromFn([-20, -20], [20, 20], 0.25, () => 0);
  r = simulate(TP(S.TOOLS.flat6, [mk.rapid(0, 0, 10), mk.rapid(0, 0, 1), mk.feed(0, 0, -10, 100, 'plunge'), mk.rapid(0, 0, 10)]), { stockBox: bx, modelHeightmap: solid, res: 0.25 });
  g = gouges(r);
  ok(g.length === 1 && g[0].level === 'error' && g[0].params.depth >= 3 && Math.abs(g[0].params.vertical - 10) < 1e-6, 'kati modele 10 mm dalma: olcu >= R, dusey 10: ' + JSON.stringify(g[0]?.params));
  // c) T-16: duvar dibi yuvarlatmasi (R1,52 ve R0,76): duz uclu takim yuvarlatmaya girer -> engel
  const fillet = (rf) => heightmapFromFn([-20, -20], [20, 20], 0.05, (x) => {
    if (x >= 10) return 0; const c = 10 - rf; if (x <= c) return -10; return -10 + rf - Math.sqrt(Math.max(0, rf * rf - (x - c) * (x - c)));
  });
  const wallPass = (xc, z) => TP(S.TOOLS.flat6, [mk.rapid(xc, -15, 10), mk.rapid(xc, -15, 1), mk.feed(xc, -15, z, 100, 'plunge'), mk.feed(xc, 15, z, 300), mk.rapid(xc, 15, 10)]);
  const deep = { min: [-20, -20, -30], max: [20, 20, 0] };
  for (const rf of [1.52, 0.76]) {
    r = simulate(wallPass(10 - 3 - 0.3, -10 + 0.05), { stockBox: deep, modelHeightmap: fillet(rf), res: 0.05, tool: { fluteLen: 15, bodyLen: 40 } });
    g = gouges(r);
    ok(g.length >= 1 && g.every((i) => i.level === 'error'), `T-16: R${rf} yuvarlatma oymasi engel: ` + codes(r));
    ok(g.length && g[0].params.depth > 0.01 && g[0].params.depth < 1, `R${rf}: olcu kucuk ve pozitif: ` + (g[0]?.params.depth));
  }
  r = simulate(wallPass(10 - 3 - 1.6, -10 + 0.05), { stockBox: deep, modelHeightmap: fillet(1.52), res: 0.05, tool: { fluteLen: 15, bodyLen: 40 } });
  ok(!codes(r).includes('cam.sim.gouge'), 'radyal pay 1,6 ile R1,52 temiz: ' + codes(r));
  // d) T-16: uc acisi uyusmazligi: 140 derece matkap 118 derece model delik dibine (ayni uc z) -> engel; 118 -> temiz
  const cone = heightmapFromFn([-20, -20], [20, 20], 0.05, (x, y) => { const q = Math.hypot(x, y); return q <= 1.25 ? -15 + q / Math.tan(59 * Math.PI / 180) : 0; });
  r = simulate(TP(drill(2.5, 140), cyc(0, -15)), { stockBox: bx, modelHeightmap: cone, res: 0.05 });
  g = gouges(r);
  ok(g.length === 1 && g[0].level === 'error', 'T-16: 140/118 uc acisi oymasi engel: ' + codes(r));
  ok(g.length && g[0].params.depth > 0.1 && g[0].params.depth < 0.3, '140/118 olcu (koniye dik) ~0,1-0,3: ' + (g[0]?.params.depth));
  r = simulate(TP(drill(2.5, 118), cyc(0, -15)), { stockBox: bx, modelHeightmap: cone, res: 0.05 });
  ok(!codes(r).includes('cam.sim.gouge'), '118 matkap 118 delikte temiz: ' + codes(r));
  // e) T-16: flute asimi hala engel (yukseklik haritasi stok)
  r = simulate(TP({ ...S.TOOLS.flat6, fluteLen: 5, bodyLen: 40, holder: null }, [mk.rapid(30, 0, 10), mk.rapid(30, 0, -8), mk.feed(0, 0, -8, 200), mk.rapid(0, 0, 10)]), { stockBox: bx, res: 0.25 });
  ok(r.issues.some((i) => i.code === 'cam.sim.flute_exceeded' && i.level === 'error'), 'T-16: flute asimi engel: ' + codes(r));
}

console.log('8. T-08 yerel stok yuksekligi (govde boyu) + tutucu boslugu uyarisi');
{
  const M = S.testMachine();
  const box = { min: [-30, -30, -40], max: [30, 30, 10] };
  const su = { id: 's1', name: 's1', workOffset: { kind: 'G54' }, aAngle: null, stockBox: box };
  const T = (o) => mk.toolpath({ tool: o.tool, rpm: 3000, spindleDir: 'cw', coolant: 'off', clearanceZ: 30, retractZ: 15, moves: o.moves, opId: o.id, opName: o.id, opType: 'x' });
  const f10 = { ...S.TOOLS.flat10, fluteLen: 20, bodyLen: 45 };
  // yuzeyleme: z=10 -> 0, xMax'a kadar (adim 8, D10)
  const face = (xMax) => { const mv = [mk.rapid(-36, -30, 30), mk.rapid(-36, -30, 12), mk.feed(-36, -30, 0, 300, 'plunge')]; let d = 1;
    for (let y = -30; y <= 30.001; y += 8) { mv.push(mk.feed(d > 0 ? -36 : xMax, y, 0, 800)); mv.push(mk.feed(d > 0 ? xMax : -36, y, 0, 800)); d = -d; }
    mv.push(mk.rapid(mv[mv.length - 1].x, mv[mv.length - 1].y, 30)); return T({ id: 'face', tool: f10, moves: mv }); };
  const t6 = (bodyLen, holder = { dia: 40, len: 50 }) => ({ ...S.TOOLS.flat6, number: 3, H: 3, D: 3, fluteLen: 25, bodyLen, holder });
  const plunge = (x, z, tool) => T({ id: 'pl', tool, moves: [mk.rapid(x, 0, 30), mk.rapid(x, 0, 12), mk.feed(x, 0, z, 100, 'plunge'), mk.rapid(x, 0, 30)] });
  const prog = (...tps) => mk.program({ name: 'T08', number: 1, machine: M.id, sections: tps.map((tp) => mk.section(su, tp)) });
  const model = heightmapFromFn([-30, -30], [30, 30], 0.5, () => -40);
  const simO = (o = {}) => ({ res: 0.5, modelHeightmaps: { s1: model }, ...o });
  const gc = (gl) => gl.map((g) => g.level + ' ' + g.code);
  const has = (gl, c) => gl.some((g) => g.code === c && g.level === 'block');
  // a) yuzeylenmis bolgede -18: ilk stok ustune gore 28 > 25 (eski) ama yerel 18 <= 25
  const pA = prog(face(36), plunge(0, -18, t6(25)));
  let gl = gates(pA, M, { sim: false });
  ok(has(gl, 'cam.gate.body_short') && gl.some((g) => g.code === 'cam.gate.body_short_conservative'), 'sim yok: muhafazakar body_short + uyari: ' + gc(gl).filter((x) => /body/.test(x)));
  gl = gates(pA, M, { sim: simO() });
  ok(!gl.some((g) => /body_short/.test(g.code)), 'T-08: yuzeylenmis yuzeyde yerel derinlik 18 <= 25, engel yok: ' + gc(gl).filter((x) => /block/.test(x)));
  // b) hala yakalanan: yuzeyli bolgede -27 (yerel 27 > 25)
  gl = gates(prog(face(36), plunge(0, -27, t6(25))), M, { sim: simO() });
  ok(has(gl, 'cam.gate.body_short') && gl.find((g) => g.code === 'cam.gate.body_short').params.depth === 27, 'yerel 27 > 25 engel: ' + JSON.stringify(gl.find((g) => g.code === 'cam.gate.body_short')?.params));
  // c) hala yakalanan: yuzeylenmemis bolgede (x>0 yuzeylenmedi) -18 -> yerel 28 > 25
  gl = gates(prog(face(-12), plunge(15, -18, t6(25))), M, { sim: simO() });
  ok(has(gl, 'cam.gate.body_short'), 'yuzeylenmemis yerde (stok 10) engel kalir: ' + gc(gl).filter((x) => /block/.test(x)));
  // d) tutucu olcusu yok: muhafazakar hesap (bant takim capi kadar olurdu)
  gl = gates(prog(face(36), plunge(0, -18, t6(25, null))), M, { sim: simO() });
  ok(has(gl, 'cam.gate.body_short') && gl.some((g) => g.code === 'cam.gate.body_short_conservative'), 'tutucu yok: muhafazakar engel + uyari');
  // e) tutucu boslugu: yuzeyli yuzeyde -24,8 (tutucu alti 0,2 mm) -> uyari; -20 -> uyari yok; -25,5 -> tutucu carpmasi engel
  let r = simulate(prog(face(36), plunge(0, -24.8, t6(25))), { res: 0.5, stockBoxes: { s1: box } });
  let w = r.issues.filter((i) => i.code === 'cam.sim.holder_clearance_low');
  ok(w.length === 1 && w[0].level === 'warn' && Math.abs(w[0].params.clearance - 0.2) < 0.02 && w[0].params.min === 0.5, 'tutucu boslugu 0,2 < 0,5 uyari: ' + JSON.stringify(w[0]?.params));
  ok(Math.abs(r.sections[1].localTop - 0) < 1e-6 && r.sections[0].localTop === 10, 'islem basi yerel stok: yuzeyleme 10, sonraki 0: ' + r.sections.map((q) => q.localTop));
  r = simulate(prog(face(36), plunge(0, -20, t6(25))), { res: 0.5, stockBoxes: { s1: box } });
  ok(!r.issues.some((i) => i.code === 'cam.sim.holder_clearance_low'), 'bosluk 5 mm: uyari yok');
  r = simulate(prog(face(36), plunge(0, -24.8, t6(25))), { res: 0.5, stockBoxes: { s1: box }, holderClearanceLow: 0.1 });
  ok(!r.issues.some((i) => i.code === 'cam.sim.holder_clearance_low'), 'esik secenekle (0,1) degisir');
  gl = gates(prog(face(36), plunge(0, -25.5, t6(25))), M, { sim: simO() });
  ok(has(gl, 'cam.sim.holder_collision') && has(gl, 'cam.gate.body_short'), 'tutucu carpmasi + govde boyu engel kalir: ' + gc(gl).filter((x) => /block/.test(x)));
  // O-035: bosluk 0 (temas) -> engel; 0,3 -> uyari; 1 -> sessiz
  const clrRun = (z) => simulate(prog(face(36), plunge(0, z, t6(25))), { res: 0.5, stockBoxes: { s1: box } }).issues.filter((i) => /holder_/.test(i.code));
  let hc = clrRun(-25);
  ok(hc.length === 1 && hc[0].code === 'cam.sim.holder_contact' && hc[0].level === 'error', 'O-035: bosluk 0 -> holder_contact engel: ' + JSON.stringify(hc.map((i) => [i.code, i.level, i.params.clearance])));
  hc = clrRun(-24.995);
  ok(hc.length === 1 && hc[0].code === 'cam.sim.holder_contact', 'bosluk 0,005 (<= 0,01 eps) -> temas engel');
  hc = clrRun(-24.7);
  ok(hc.length === 1 && hc[0].code === 'cam.sim.holder_clearance_low' && hc[0].level === 'warn', 'bosluk 0,3 -> uyari: ' + JSON.stringify(hc.map((i) => i.code)));
  hc = clrRun(-24);
  ok(hc.length === 0, 'bosluk 1 mm -> sessiz: ' + JSON.stringify(hc.map((i) => i.code)));
  gl = gates(prog(face(36), plunge(0, -25, t6(25))), M, { sim: simO() });
  ok(has(gl, 'cam.sim.holder_contact') && !has(gl, 'cam.gate.body_short'), 'kapi: temas engel (govde boyu tam sinirda, body_short yok)');
  hc = clrRun(-25.5);
  ok(hc.some((i) => i.code === 'cam.sim.holder_collision') && !hc.some((i) => i.code === 'cam.sim.holder_contact'), 'carpma varken ayrica temas yazilmaz');
  // f) adim adim oynatici: uyari son adimda da gelir
  const sim2 = createSim(prog(face(36), plunge(0, -24.8, t6(25))), { res: 0.5, stockBoxes: { s1: box } });
  const seen = []; while (!sim2.done) seen.push(...sim2.step(50).newIssues);
  ok(seen.some((i) => i.code === 'cam.sim.holder_clearance_low'), 'adim adim: tutucu boslugu uyarisi gorulur');
}

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
