// Stok simulasyonu testi. Calistir: node test/sim.test.mjs
import { mk, normalizeRapids } from '../src/cam/ir.js';
import { simulate, createSim, heightmapFromFn, sampleHeightmap, createHeightmap, toolGeom } from '../src/cam/sim/index.js';
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

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
