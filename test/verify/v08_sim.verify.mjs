// V-24..: simulasyon hakem mi? Bilerek bozulmus yollar verilir; sim (ve kapi 5) yakalamali.
// Model: 0..60 x 0..40 cep (taban z=-10), cevresi z=0'a kadar dolu. Takim d10 flat. Cep duvarina e mm yandan oyma.
// Calistir: node test/verify/v08_sim.verify.mjs
import { simulate, heightmapFromFn } from '../../src/cam/sim/index.js';
import { mk } from '../../src/cam/ir.js';
import { reporter } from './ctx.mjs';
const rep = reporter('v08_sim');
const T = (o = {}) => ({ number: 5, H: 5, D: null, type: 'flat', dia: 10, cornerR: 0, tipAngle: null, fluteLen: 30, bodyLen: 60, centerCutting: true, pitch: null, ...o });
const stockBox = { min: [-20, -20, -30], max: [80, 60, 0] };
const model = (res) => heightmapFromFn([-20, -20], [80, 60], res, (x, y) => (x > 0 && x < 60 && y > 0 && y < 40 ? -10 : 0));
// cep: once tam bosalt (yasal), sonra duvar boyunca e kadar fazla
function path(e, zf = -10) {
  const r = 5; const mv = [mk.rapid(30, 20, 10), mk.feed(30, 20, zf, 200, 'plunge')];
  for (let y = r; y <= 40 - r + 1e-9; y += 4) { mv.push(mk.feed(r, y, zf, 800)); mv.push(mk.feed(60 - r, y, zf, 800)); }
  mv.push(mk.feed(60 - r, 40 - r, zf, 800));
  // oyan duvar pasosu: x = 60 - r + e (sag duvar), y 10..30
  mv.push(mk.feed(60 - r + e, 10, zf, 800)); mv.push(mk.feed(60 - r + e, 30, zf, 800)); mv.push(mk.feed(30, 20, zf, 800));
  mv.push(mk.rapid(30, 20, 10));
  return mk.toolpath({ tool: T(), rpm: 8000, coolant: 'flood', clearanceZ: 10, moves: mv });
}
const gouged = (r) => r.issues.some((i) => i.code === 'cam.sim.gouge');
for (const res of [0.5, 1.3]) {
  const mh = model(res); const out = [];
  for (const e of [0.05, 0.1, 0.2, 0.3, 0.5, 1.0]) { const r = simulate(path(e), { res, stockBox, modelHeightmap: mh }); out.push(`${e}:${gouged(r) ? 'YAKALANDI' : 'kacti'}`); }
  const ctrl = simulate(path(0), { res, stockBox, modelHeightmap: mh });
  rep.info(`res ${res}: yandan oyma e(mm) -> ${out.join(' ')} | kontrol e=0: ${gouged(ctrl) ? 'YANLIS ALARM' : 'temiz'}`);
  const missed = out.filter((s) => s.endsWith('kacti')).map((s) => s.split(':')[0]);
  rep.finding(res === 0.5 ? 'V-24' : 'V-24-ui', missed.length > 0, `res ${res} mm: ${missed.join(', ')} mm yandan oyma KACIRILDI (kapi 5 'oyma -> block' iddiasi cozunurlukle sinirli; duvar hucre siniriyla hizaliyken res/2'ye kadar oyma gorunmez)`);
}
// taban oyma (eksenel): 0.02 mm
{ const mh = model(0.5); const r = simulate(path(0, -10.02), { res: 0.5, stockBox, modelHeightmap: mh }); rep.finding('sim-floor', !gouged(r), `taban 0,02 mm oyma: ${gouged(r) ? 'yakalandi' : 'KACTI'}`); }
// stok icinden hizli (yatay, z=-5)
{ const tp = mk.toolpath({ tool: T(), rpm: 8000, coolant: 'off', clearanceZ: 10, moves: [mk.rapid(-15, 20, 10), mk.rapid(-15, 20, -5), mk.rapid(75, 20, -5), mk.rapid(75, 20, 10)] }); const r = simulate(tp, { res: 0.5, stockBox }); rep.finding('sim-rapid', !r.issues.some((i) => i.code === 'cam.sim.rapid_in_stock'), 'stok icinden yatay hizli: ' + r.issues.map((i) => i.code).join(',')); }
// tutucu carpmasi: bodyLen 12, cep derinligi 10 + tutucu d40 -> stok ustune (z=0) tutucu z = -10+12 = 2: carpmaz; bodyLen 8 -> carpar
{ for (const bl of [12, 8]) { const tp = { ...path(0), tool: T({ fluteLen: 6, bodyLen: bl }) }; const r = simulate(tp, { res: 0.5, stockBox, tools: { 5: { holder: { dia: 40, len: 50 } } } }); rep.info(`bodyLen ${bl}: ${[...new Set(r.issues.map((i) => i.code))].join(',') || 'temiz'}`); } }
// V-25: geri okuyucu A isaretini postla AYNI kuraldan cozer (aAngle = sign*A) -> V-01 hatasi geri okumada gorunmez (totoloji)
rep.finding('V-25', true, 'reader.js makeSection: aAngle = R.sign * A (postla ayni isaret kurali); IR -> NC -> IR esitligi A isaret hatasini tanimi geregi yakalayamaz (bkz. V-01)');
rep.done();
