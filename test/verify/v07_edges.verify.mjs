// V-16..: uc girdiler. Beklenti: ya dogru sonuc ya acik hata (sessiz yanlis yok). Her satir: girdi -> sonuc.
// Calistir: node test/verify/v07_edges.verify.mjs
import * as CAM from '../../src/cam/index.js';
import { postProgram } from '../../src/cam/post/index.js';
import { createFormat } from '../../src/cam/post/engine.js';
import * as V from './lib.mjs';
import { lintNC } from './nc.mjs';
import { S0, tool, base, machineM80V, machineGeneric, section, program, reporter } from './ctx.mjs';
const rep = reporter('v07_edges'); const M = machineM80V(); const S = S0();
const rect = (x0, y0, x1, y1) => V.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
const P = { id: 'p', type: 'pocket', name: 'p', ...base, geom: [{ kind: 'face', ref: {} }], stepover: 4, stepdown: 3, entry: { kind: 'helix', angle: 3, helixDia: 6 } };
const C = { id: 'c', type: 'contour', name: 'c', ...base, geom: [{ kind: 'face', ref: {}, loops: 'outer' }], side: 'outside', stepdown: 4 };
const tryOp = (op, t, faces) => { try { return { tp: CAM.computeOp(op, { setup: S, tool: t, geom: { faces } }) }; } catch (e) { return { err: e.code || String(e) }; } };
const row = (label, r) => { const s = r.err ? 'HATA ' + r.err : `yol (${r.tp.moves.length} hareket, uyari ${r.tp.warnings.map((w) => w.code).join(',') || '-'})`; rep.info(`${label}: ${s}`); return r; };

rep.info('-- acik hata beklenenler');
const fR = V.face({ outer: rect(10, 10, 50, 40), holes: [] }, -10);
const exp = [
  ['cep stepdown 0', { ...P, stepdown: 0 }], ['cep stepdown -1', { ...P, stepdown: -1 }], ['cep stepover = cap', { ...P, stepover: 10 }],
  ['cep takim > cep (d40, 40x30)', { ...P }, tool(40)], ['cep derinlik 0 (bottom=top)', { ...P, heights: { ...base.heights, top: { from: 'selection', off: 0 } } }],
  ['cep eksenel pay > derinlik', { ...P, stockToLeave: { radial: 0, axial: 20 } }], ['cep yanal pay yarim genislikten buyuk', { ...P, stockToLeave: { radial: 12, axial: 0 } }],
  ['retract > clearance', { ...P, heights: { clearance: 2, retract: 5 } }], ['retract 0', { ...P, heights: { clearance: 5, retract: 0 } }],
  ['rpm NaN', { ...P, rpm: NaN }], ['feedCut "800" (metin)', { ...P, feedCut: '800' }], ['helis capi 0', { ...P, entry: { kind: 'helix', angle: 3, helixDia: 0 } }],
  ['helis aci 0', { ...P, entry: { kind: 'helix', angle: 0, helixDia: 6 } }], ['kontur stepdown 1e9', { ...C, stepdown: 1e9 }, tool(10), 'ok-tek-paso'],
];
for (const [label, op, t = tool(10), note] of exp) { const r = row(label, tryOp(op, t, [fR])); if (!r.err && note !== 'ok-tek-paso') rep.finding('V-16', true, `${label}: hata beklenirken yol uretildi`); }

rep.info('-- dejenere / ters yonlu profiller');
// kendi kendini kesen (papyon) dis sinir
const bow = { z: -10, normalOk: true, outer: V.toKernel(V.poly([[0, 0], [40, 30], [40, 0], [0, 30]])), inners: [], open: false, above: null };
const rb = row('cep papyon (kendini kesen)', tryOp(P, tool(6), [bow]));
const rbc = row('kontur papyon', tryOp(C, tool(6), [bow]));
if (rb.tp) { const t1 = V.prepRegion({ outer: V.poly([[0, 0], [20, 15], [0, 30]]), holes: [] }), t2 = V.prepRegion({ outer: V.poly([[40, 0], [40, 30], [20, 15]]), holes: [] }); let out = 0, n1 = 0, n2 = 0; V.walkSamples(rb.tp, (q) => { if (q.m.t === 'rapid' || q.z > -1e-6) return; const p = [q.x, q.y]; if (V.inRegion(p, t1)) n1++; else if (V.inRegion(p, t2)) n2++; else out++; }); rep.info(`  papyon cep: sol ucgende ${n1}, sag ucgende ${n2}, ikisinin DISINDA ${out} kesme ornegi`); }
rep.finding('V-17', !rb.err || !rbc.err, `kendini kesen dis sinir: cep ${rb.err || 'YOL'}, kontur ${rbc.err || 'YOL'} (acik hata beklenir)`);
// sifir alanli (geri donen) dongu
const flat = { z: -10, normalOk: true, outer: V.toKernel([V.L([0, 0], [40, 0]), V.L([40, 0], [0, 0])]), inners: [], open: false, above: null };
row('cep sifir alan', tryOp(P, tool(6), [flat])); row('kontur sifir alan', tryOp(C, tool(6), [flat]));
// CW verilen dis dongu (cekirdek sozlesmesi CCW; sketch/aynalama hatasi ya da ileride baska kaynak)
const cwFace = { z: -10, normalOk: true, outer: V.toKernel(V.reverseLoop(rect(10, 10, 50, 40))), inners: [], open: false, above: null };
{
  const r = row('kontur DIS, dongu CW verilmis', tryOp(C, tool(10), [cwFace]));
  if (r.tp) { let inside = 0; const PR = V.prepRegion({ outer: rect(10, 10, 50, 40), holes: [] }); V.walkSamples(r.tp, (s) => { if (s.m.t !== 'rapid' && s.z < -1e-6 && V.inRegion([s.x, s.y], PR)) inside++; }); rep.finding('V-18', inside > 0, `CW dis dongu: 'outside' kontur ${inside} kesme orneginde PARCA ICINDE (oyma), hata yok. Cep alani yonu normallestiriyor (pocket.js:21), kontur normallestirmiyor (contour.js:19)`); }
  const rp = row('cep, dongu CW verilmis', tryOp(P, tool(10), [cwFace]));
  rep.info(`  (cep CW: ${rp.err || 'yol'} — normallestirme var)`);
}
// cok yuzlu kontur, farkli z: secim tabani yalniz ilk yuzden
{
  const f1 = V.face({ outer: rect(0, 0, 30, 30), holes: [] }, -20), f2 = V.face({ outer: rect(60, 0, 90, 30), holes: [] }, -5);
  const op = { ...C, geom: [{ kind: 'face', ref: {}, loops: 'outer' }, { kind: 'face', ref: {}, loops: 'outer' }] };
  const r = row('kontur iki yuz z=-20 ve z=-5', tryOp(op, tool(10), [f1, f2]));
  if (r.tp) { let deep2 = Infinity; V.walkSamples(r.tp, (s) => { if (s.m.t !== 'rapid' && s.x > 50) deep2 = Math.min(deep2, s.z); }); rep.finding('V-19', deep2 < -5 - 1e-6, `ikinci yuzun (z=-5) konturu z=${deep2}'e kadar kesiliyor; hata/uyari yok (cep bunu cam.pocket.faces_differ_z ile reddediyor). Ikinci profil kendi tabaninin ${(-5 - deep2).toFixed(1)} mm altina iner`); }
  const r2 = row('kontur iki yuz ters sira (z=-5 once)', tryOp(op, tool(10), [f2, f1]));
  if (r2.tp) { let deep1 = Infinity; V.walkSamples(r2.tp, (s) => { if (s.m.t !== 'rapid' && s.x < 40) deep1 = Math.min(deep1, s.z); }); rep.info(`  ters sira: z=-20 yuzunun konturu yalniz z=${deep1}'e iniyor (eksik islenir, sessiz)`); }
}

rep.info('-- sayi bicimi ve program numarasi');
{
  const f = createFormat({ prefix: 'X', decimals: 3 });
  const vals = [1e21, -1e-7, -0.0004, 123456789.12345, 0.0005, -0.0005];
  const outs = vals.map((v) => { try { return f.format(v); } catch (e) { return 'HATA ' + e.code; } });
  rep.info('  ' + vals.map((v, i) => `${v} -> ${outs[i]}`).join(' | '));
  rep.finding('V-20', outs.some((s) => /e\+|e-/.test(s)), `cok buyuk deger bilimsel gosterime kaciyor: ${outs[0]} (IR yalniz sonluluk denetliyor; kurs kapisi kurs biliniyorsa yakalar)`);
  const tp = CAM.computeOp({ id: 'F', type: 'face', name: 'f', ...base, stepover: 30 }, { setup: S, tool: tool(50, { type: 'face' }), geom: {} });
  const nums = [0, 12345, 9000];
  const heads = nums.map((n) => postProgram(program([section(S, tp)], { number: n }), M, { date: '2026-11-11' }).lines[0]);
  rep.finding('V-21', heads.some((h) => h === 'O0000' || h.length > 5), `program no 0/12345/9000 -> ${heads.join(', ')} (O0 gecersiz; 4 haneyi asan no ve 8000/9000 korumali aralik denetlenmiyor)`);
  const lnM = machineM80V(); lnM.post.props.lineNumbers = true;
  const big = { ...tp, moves: [tp.moves[0], ...Array.from({ length: 11000 }, (_, k) => ({ t: 'feed', x: k % 2 ? 10 : 0, y: k * 0.01, z: -1, f: 500, kind: 'cut' })), { t: 'rapid', x: 0, y: 59.99, z: tp.clearanceZ }] };
  big.stats = tp.stats;
  const out = postProgram(program([section(S, big)]), lnM, { date: '2026-11-11' });
  const lastN = Math.max(...out.lines.map((l) => (/^N(\d+)/.exec(l) || [0, 0])[1] * 1));
  rep.finding('V-22', lastN > 99999, `satir numarali 11000 hareket: son N=${lastN} (M80V/Fanuc N ust siniri 99999 [genel kural, teyit edilmedi]); sarma/uyari yok`);
}
rep.info('-- kilavuz: kesirli devir (Fanuc genel, F=devir*adim kipi)');
{
  const G = machineGeneric(); const holes = [{ feature: 'h', dia: 6.8, depth: 12, through: false, tipAngle: 118, thread: { major: 8, pitch: 1.25 }, dir: [0, 0, -1], positions: [[10, 10, 0]], dirs: [[0, 0, -1]] }];
  const tp = CAM.computeOp({ id: 'T', type: 'drill', name: 't', ...base, rpm: 333.4, holes: { kind: 'feature' }, cycle: 'tap', depth: { from: 'hole' } }, { setup: S, tool: tool(8, { type: 'tap', pitch: 1.25, centerCutting: false }), geom: { holes } });
  const txt = postProgram(program([section(S, tp)]), G, { date: '2026-11-11' }).text; const l = txt.split('\n').find((x) => /G84/.test(x)); const s = Number(/^S(\d+) M3/m.exec(txt)[1]); const fw = Number(/G84.*F([\d.]+)/.exec(l)[1]);
  rep.finding('V-23', Math.abs(fw / s - 1.25) > 1e-6, `rpm 333.4 -> "S${s}" ama G84 "F${fw}" (F/S = ${(fw / s).toFixed(5)} != adim 1.25); senkron kilavuzda adim hatasi. M80V (F=adim kipi) etkilenmez`);
  const tz = CAM.computeOp({ id: 'F', type: 'face', name: 'f', ...base, rpm: 0.4, stepover: 30 }, { setup: S, tool: tool(50, { type: 'face' }), geom: {} });
  const t2 = postProgram(program([section(S, tz)]), M, { date: '2026-11-11' }).text;
  rep.finding('V-23b', /S0 M3/.test(t2), `rpm 0.4 gecerli sayiliyor, NC "S0 M3" (mil donmeden kesme; kapi 3 minRpm null ise yakalamaz)`);
}
rep.done();
