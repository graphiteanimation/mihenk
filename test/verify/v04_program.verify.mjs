// V-04..: cok bolumlu program (yuzey + cep + punta + gagali delme + kilavuz + kontur), M80V postu, bagimsiz NC lint.
// Ayrica: takim degisimi sirasi, G43/H, S/M3, F modal tasinmasi, cevrim kurallari, program sonu.
// Calistir: node test/verify/v04_program.verify.mjs
import * as CAM from '../../src/cam/index.js';
import { postProgram, readNC } from '../../src/cam/post/index.js';
import * as V from './lib.mjs';
import { lintNC } from './nc.mjs';
import { S0, tool, base, machineM80V, section, program, reporter } from './ctx.mjs';
const rep = reporter('v04_program');
const M = machineM80V(); const S = S0({ modelBBox: { min: [-15, -15, -30], max: [115, 115, -1] } });
const rect = (x0, y0, x1, y1) => V.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
const T = {
  face: tool(50, { id: 'tf', number: 2, lengthOffset: 2, type: 'face' }),
  em: tool(10, { id: 'te', number: 6, lengthOffset: 6, diaOffset: 26 }),
  spot: tool(10, { id: 'ts', number: 7, lengthOffset: 7, type: 'spot', tipAngle: 90 }),
  drill: tool(6.8, { id: 'td', number: 8, lengthOffset: 8, type: 'drill', tipAngle: 118 }),
  tap: tool(8, { id: 'tt', number: 9, lengthOffset: 9, type: 'tap', pitch: 1.25, centerCutting: false }),
};
const holes = [{ feature: 'h', dia: 6.8, depth: 15, through: false, tipAngle: 118, thread: { major: 8, pitch: 1.25 }, dir: [0, 0, -1], positions: [[0, 0, -1], [100, 0, -1], [100, 100, -1], [0, 100, -1], [50, 30, -10]], dirs: Array(5).fill([0, 0, -1]) }];
const pocketFace = V.face({ outer: rect(20, 20, 80, 50), holes: [] }, -10);
const ops = [
  [{ id: 'F', type: 'face', name: 'yuzey', ...base, stepover: 30, stepdown: 1 }, T.face, {}],
  [{ id: 'P', type: 'pocket', name: 'cep', ...base, geom: [{ kind: 'face', ref: {} }], stepover: 4, stepdown: 3, entry: { kind: 'helix', angle: 3, helixDia: 8 } }, T.em, { faces: [pocketFace] }],
  [{ id: 'SP', type: 'drill', name: 'punta', ...base, holes: { kind: 'feature' }, cycle: 'spot', depth: { from: 'abs', z: -2.5 }, dwell: 0.3 }, T.spot, { holes }],
  [{ id: 'D', type: 'drill', name: 'gagali', ...base, holes: { kind: 'feature' }, cycle: 'peck', depth: { from: 'hole', tipComp: true }, peck: 2 }, T.drill, { holes }],
  [{ id: 'TP', type: 'drill', name: 'kilavuz', ...base, rpm: 500, holes: { kind: 'feature' }, cycle: 'tap', depth: { from: 'hole' } }, T.tap, { holes }],
  [{ id: 'C', type: 'contour', name: 'kontur', ...base, geom: [{ kind: 'face', ref: {}, loops: 'outer' }], side: 'outside', stepdown: 5, leadIn: { kind: 'arc', r: 3 }, leadOut: { kind: 'arc', r: 3 } }, T.em, { faces: [V.face({ outer: rect(-10, -10, 110, 110), holes: [] }, -20)] }],
];
const tps = []; for (const [op, t, g] of ops) { try { tps.push(CAM.computeOp(op, { setup: S, tool: t, geom: g, machine: M })); } catch (e) { console.log('op hata', op.id, e.code, JSON.stringify(e.params)); } }
const prog = program(tps.map((tp) => section(S, tp)));
const out = postProgram(prog, M, { date: '2026-11-11' });
const L = lintNC(out.text, { stockTop: 0, protectedT: M.protected.T, protectedH: M.protected.H, protectedD: M.protected.D, protectedWcs: M.protected.wcs, allowLowR: false });
const by = {}; for (const i of L.issues) (by[i.code] ||= []).push(i);
for (const [k, v] of Object.entries(by)) { console.log(`- ${k}: ${v.length}`); for (const x of v.slice(0, 3)) console.log(`    L${x.line}: ${x.msg}`); }
rep.finding('V-04', by.feed_f_from_prev_section, 'yeni bolumun (takim degisimi sonrasi) ilk G1/G2 satiri F icermiyor: F onceki takimdan modal kaliyor');
// deliklerin cep tabanindaki noktasi (z=-10): R = -8 < stok ustu; ayri cevrim beklenir, init duzlemi R ustunde
const cyc = L.moves.filter((m) => m.t === 'cycle');
const low = cyc.filter((m) => m.R < 0);
rep.finding('drill-lowR', low.some((m) => m.init < m.R), `cep tabanindaki delik: R ${low.map((m) => m.R)} init ${low.map((m) => m.init)}`);
// G84: F = adim (M80V), S onceden; G74 yok
const tapLines = out.lines.filter((l) => /G84/.test(l));
rep.finding('tap-form', !tapLines.every((l) => /F1\.25 ,R1/.test(l)), `kilavuz satirlari: ${tapLines.slice(0, 2).join(' | ')}`);
// G82 bekleme P (ms) — punta dwell 0.3 s -> P300
const g82 = out.lines.filter((l) => /G82/.test(l));
rep.finding('g82-dwell', !g82.every((l) => /P300\b/.test(l)), `G82: ${g82.join(' | ')}`);
// geri okuma esitligi
const rd = readNC(out.text, { machine: M });
const eq = rd.program.sections.map((s, i) => CAM && tps[i] ? (s.toolpath.moves.length) : 0);
rep.info(`geri okunan bolum ${rd.program.sections.length} / ${tps.length}; hareket sayilari ${eq.join(',')}`);
rep.finding('lint-diger', Object.keys(by).some((k) => k !== 'feed_f_from_prev_section'), 'diger lint sorunlari: ' + Object.keys(by).filter((k) => k !== 'feed_f_from_prev_section').join(','));
// F tasinmasi: iki islem, feedCut = feedPlunge = 500 (yaygin basit ayar) -> 2. bolumun ilk G1'i F'siz mi?
{
  const o1 = { id: 'F1', type: 'face', name: 'y1', ...base, feedCut: 500, feedPlunge: 500, stepover: 30, stepdown: 1 };
  const o2 = { ...o1, id: 'F2', name: 'y2' };
  const t2 = tool(40, { id: 'tf2', number: 4, lengthOffset: 4, type: 'face' });
  const pr = program([section(S, CAM.computeOp(o1, { setup: S, tool: T.face, geom: {} })), section(S, CAM.computeOp(o2, { setup: S, tool: t2, geom: {} }))]);
  const txt = postProgram(pr, M, { date: '2026-11-11' }).text;
  const sec2 = txt.split('(OP 2')[1].split('\n'); const firstG1 = sec2.find((l) => /^G1\b/.test(l));
  rep.finding('V-04', !/F/.test(firstG1), `2. bolum (T4) ilk kesme satiri: "${firstG1}" — F yok; F, T2 bolumunden modal. Bolumden baslatma (restart) ya da F'i degistiren elle duzenleme halinde yanlis ilerleme`);
}
if (process.argv.includes('--nc')) console.log(out.text);
rep.done();
