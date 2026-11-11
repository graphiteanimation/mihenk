// V-06..: guvenlik kapilarinin atlatilabildigi girdiler. Her denetim "kapi BLOCK vermeli" beklentisiyle yazildi.
// Calistir: node test/verify/v06_gates.verify.mjs
import * as CAM from '../../src/cam/index.js';
import { gates, blocked } from '../../src/cam/gates.js';
import { postProgram } from '../../src/cam/post/index.js';
import { simulate, heightmapFromFn } from '../../src/cam/sim/index.js';
import { mk } from '../../src/cam/ir.js';
import * as V from './lib.mjs';
import { S0, tool, base, machineM80V, section, program, reporter } from './ctx.mjs';
const rep = reporter('v06_gates'); const M = machineM80V(); const S = S0();
const codes = (g) => g.filter((x) => x.level === 'block').map((x) => x.code);

// model: z=-1'de ust yuzey, 0..100 kare; (ayni setup)
const modelHM = heightmapFromFn([-20, -20], [120, 120], 0.5, (x, y) => (x >= -15 && x <= 115 && y >= -15 && y <= 115 ? -1 : -Infinity));
// bilerek oyan yuzey islemi: taban model ustunun 2 mm altinda
const faceGouge = CAM.computeOp({ id: 'F', type: 'face', name: 'oyan yuzey', ...base, stepover: 30, stepdown: 3, heights: { ...base.heights, bottom: { from: 'modelTop', off: -2 } } }, { setup: S, tool: tool(50, { type: 'face' }), geom: {} });
const prog = program([section(S, faceGouge)]);
{
  const gNo = gates(prog, M, { sim: { res: 0.5 } });
  const gYes = gates(prog, M, { sim: { res: 0.5, modelHeightmaps: { s1: modelHM } } });
  rep.finding('V-06', !blocked(gNo) && blocked(gYes), `model haritasi verilmeden sim: BLOCK ${JSON.stringify(codes(gNo))}, uyari ${gNo.filter((x) => x.level === 'warn').map((x) => x.code).join(',')} | haritayla: ${JSON.stringify([...new Set(codes(gYes))])}. Oyma denetimi sessizce kapali; arayuz camHeightmap hatasini 'warn' (cam.ui.sim_no_model) yapip posta izin veriyor (src/ui/cam/ops.js:141)`);
}
// V-07: postProgram kendi basina kapi uygulamaz: korunan T1/H1/G54 + makine maxRpm null + BLOCK'lu kapi listesiyle NC uretir
{
  const M2 = machineM80V(); M2.spindle.maxRpm = null;
  const S2 = S0({ workOffset: { kind: 'G54' } });
  const tp = CAM.computeOp({ id: 'F', type: 'face', name: 'f', ...base, rpm: 99999, stepover: 30 }, { setup: S2, tool: tool(50, { type: 'face', number: 1, lengthOffset: 1 }), geom: {} });
  const pr = program([section(S2, tp)]); const g = gates(pr, M2, { sim: false });
  let txt = null; try { txt = postProgram(pr, M2, { gates: g, date: '2026-11-11' }).text; } catch (e) { txt = 'HATA ' + e.code; }
  rep.finding('V-07', blocked(g) && /T1 M6/.test(txt), `kapi BLOCK=${[...new Set(codes(g))].join(',')} iken postProgram yine NC uretiyor ("T1 M6", "G54", "S99999" iceriyor: ${/S99999/.test(txt)}); engel yalniz arayuzde (ops.js post()). Baska cagiran (betik/CLI/gelecek API) icin savunma yok`);
}
// V-08: korunan WCS 'G54.1P1' (bosluksuz; checkMachine kabul ediyor) -> kapi yakalamiyor
{
  const M3 = machineM80V(); M3.protected.wcs = ['G54', 'G56', 'G54.1P1']; M3.post.props.g541Range = [1, 48];
  const S3 = S0({ workOffset: { kind: 'G54.1', p: 1 } });
  const tp = CAM.computeOp({ id: 'F', type: 'face', name: 'f', ...base, stepover: 30 }, { setup: S3, tool: tool(50, { type: 'face' }), geom: {} });
  const g = gates(program([section(S3, tp)]), M3, { sim: false });
  const mc = (await import('../../src/cam/machines/builtin.js')).checkMachine(M3);
  rep.finding('V-08', mc.errors.length === 0 && !codes(g).includes('cam.gate.protected'), `protected.wcs 'G54.1P1' profil dogrulamasindan geciyor (hata ${mc.errors.length}) ama G54.1 P1 kullanan islem ENGELLENMIYOR (kapilar: ${codes(g).join(',') || 'yok'})`);
}
// V-09: kesmeyen uclu takim + kopru: koprudan inis dikey 'cut' hareketi -> kapi 4 gormuyor
{
  const outer = V.poly([[0, 0], [80, 0], [80, 60], [0, 60]]);
  const op = { id: 'C', type: 'contour', name: 'kopru', ...base, geom: [{ kind: 'face', ref: {}, loops: 'outer' }], side: 'outside', stepdown: 4, ramp: { kind: 'ramp', angle: 3 }, tabs: { n: 4, width: 6, height: 3 } };
  const tnc = tool(10, { centerCutting: false });
  const tp = CAM.computeOp(op, { setup: S, tool: tnc, geom: { faces: [V.face({ outer, holes: [] }, -10)] } });
  let vert = 0, pos = null; for (const m of tp.moves) { if (m.t === 'feed' && pos && m.kind === 'cut' && Math.hypot(m.x - pos.x, m.y - pos.y) < 1e-9 && m.z < pos.z - 1e-9 && m.z < 0) vert++; if (m.x != null) pos = m; }
  const g = gates(program([section(S, tp)]), M, { sim: false });
  rep.finding('V-09', vert > 0 && !codes(g).includes('cam.gate.plunge_center'), `centerCutting=false, rampali kontur + kopru: ${vert} dikey asagi 'cut' hareketi (koprunun sonunda tab yuksekliginden kesim derinligine), kapi 4 engel yok`);
  // V-10: kesmeyen uclu takimla 45 derece rampa -> engel yok
  const op2 = { ...op, tabs: undefined, ramp: { kind: 'ramp', angle: 45 } };
  const tp2 = CAM.computeOp(op2, { setup: S, tool: tnc, geom: { faces: [V.face({ outer, holes: [] }, -10)] } });
  const g2 = gates(program([section(S, tp2)]), M, { sim: false });
  rep.finding('V-10', !blocked(g2.filter((x) => x.code !== 'cam.gate.travel_abs_unchecked')), `centerCutting=false + 45 derece rampa: kapi engeli yok (${[...new Set(codes(g2))].join(',') || '-'}); kesmeyen uc icin rampa acisi siniri yok`);
}
// V-11: simulasyon cozunurlugu takim yaricapindan buyuk -> stok icinden hizli kacirilir (arayuz res'i stok alanindan secer)
{
  const t1 = { number: 5, H: 5, D: null, type: 'flat', dia: 1, cornerR: 0, tipAngle: null, fluteLen: 5, bodyLen: 30, centerCutting: true, pitch: null };
  const big = { min: [0, 0, -30], max: [1000, 600, 0] };
  const uiRes = Math.max(0.5, Math.ceil(Math.sqrt((1000 * 600) / 400000) * 10) / 10); // src/ui/cam/ops.js simRes
  const yLine = 2 * uiRes; // hucre sinirinda
  const tp = mk.toolpath({ tool: t1, rpm: 10000, coolant: 'off', clearanceZ: 10, moves: [mk.rapid(5, yLine, 10), mk.feed(5, yLine, -5, 100, 'plunge'), mk.rapid(500, yLine, -5), mk.rapid(500, yLine, 10)] });
  const r1 = simulate(tp, { res: uiRes, stockBox: big });
  const r2 = simulate(tp, { res: 0.2, stockBox: big });
  const has = (r) => r.issues.some((i) => i.code === 'cam.sim.rapid_in_stock');
  rep.finding('V-11', !has(r1) && has(r2), `1000x600 stok: arayuz res=${uiRes} mm, d1 takim z=-5'te 495 mm hizli: res ${uiRes} -> ${has(r1) ? 'yakalandi' : 'KACIRILDI'}, res 0.2 -> ${has(r2) ? 'yakalandi' : 'kacirildi'}`);
}
// V-12: stok tabaninin altina (tabla/mengene) kesme yalniz UYARI
{
  const outer = V.poly([[0, 0], [80, 0], [80, 60], [0, 60]]);
  const op = { id: 'C', type: 'contour', name: 'derin', ...base, geom: [{ kind: 'face', ref: {}, loops: 'outer' }], side: 'outside', stepdown: 10, heights: { ...base.heights, bottom: { from: 'abs', off: -45 } } };
  const tp = CAM.computeOp(op, { setup: S, tool: tool(10, { fluteLen: 50, bodyLen: 80 }), geom: { faces: [V.face({ outer, holes: [] }, -10)] } });
  const g = gates(program([section(S, tp)]), M, { sim: { res: 0.5, modelHeightmaps: { s1: modelHM } } });
  const below = g.filter((x) => x.code === 'cam.sim.below_stock');
  rep.finding('V-12', below.length && below.every((x) => x.level === 'warn'), `stok tabani -30, kontur tabani -45 (15 mm tabla/fikstur icine): kapi seviyesi ${below.map((x) => x.level).join(',')}, BLOCK ${[...new Set(codes(g))].join(',') || 'yok'}`);
}
// V-13: boydan boya delik (stok tabani = model tabani, breakThrough 1): cevrim donusu 'rapid_in_stock' YANLIS ENGEL
{
  const S4 = S0({ modelBBox: { min: [-15, -15, -30], max: [115, 115, 0] } });
  const holes = [{ feature: 'h', dia: 6.8, depth: null, through: true, tipAngle: 118, thread: null, dir: [0, 0, -1], positions: [[10, 10, 0]], dirs: [[0, 0, -1]] }];
  const tp = CAM.computeOp({ id: 'D', type: 'drill', name: 'thru', ...base, holes: { kind: 'feature' }, cycle: 'drill', depth: { from: 'hole', tipComp: true, breakThrough: 1 } }, { setup: S4, tool: tool(6.8, { type: 'drill', tipAngle: 118, fluteLen: 50, bodyLen: 80 }), geom: { holes } });
  const g = gates(program([section(S4, tp)]), M, { sim: { res: 0.5 } });
  rep.finding('V-13', codes(g).includes('cam.sim.rapid_in_stock'), `boydan boya G81 (dip stok tabaninin 3 mm alti): kapilar ${[...new Set(codes(g))].join(',')} — sim, tabana kirpilan haritayi geri cekilmede 'stok icinde hizli' sayiyor (sim/index.js:79 nz=zFloor). Ayni yanlis engel stok tabanini asan her konturda da cikiyor`);
}
// V-14: hizli hareket denetimi stok kutusu ile; kutu disinda modelin ustunde (ornegin mengene cenesi) bilgi yok — kapsam disi, kaydedilir
rep.done();
