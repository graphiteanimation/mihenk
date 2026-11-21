// WP-16 testleri: 4. eksen sarma (wrap). Calistir: node test/wp16.test.mjs
// Tum makine degerleri TEST degeridir; NC yalniz test ciktisidir (tezgahta dogrulanmadi).
import * as CAM from '../src/cam/index.js';
import * as G from '../src/shared/geom2d.js';
import { validateToolpath, compareToolpaths, splitWrapMoves, wrapMoveLen, mk } from '../src/cam/ir.js';
import { postProgram, readNC } from '../src/cam/post/index.js';
import { simulate, wrapRadiiAt, wrapTheta } from '../src/cam/sim/index.js';
import { gates } from '../src/cam/gates.js';
import { builtinMachines, copyMachine } from '../src/cam/machines/builtin.js';
import * as SM from './cam-samples/samples.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const throwsCode = (fn, code, m) => { try { fn(); ok(false, `${m}: hata bekleniyordu (${code})`); } catch (e) { ok(e.code === code, `${m}: ${e.code} != ${code} ${JSON.stringify(e.params || {})}`); } };
const near = (a, b, t) => Math.abs(a - b) <= t;
const OPTS = { date: '2026-01-01', appVersion: '0.6.0', gates: [] };
const DEG = 180 / Math.PI;

// --- test makineleri (genel sablonlarin kopyasi; sayilar test icin)
const BM = builtinMachines();
const fill = (m) => { for (const k of ['X', 'Y', 'Z']) m.axes[k].travel = 800; m.spindle.maxRpm = 12000; m.feed.maxCut = 5000; m.toolChange.maxTools = 20; return m; };
const FANUC4 = fill(copyMachine(BM.find((m) => m.id === 'builtin-generic-4axis-a-fanuc'), 'test-fanuc4', 'TEST Fanuc 4A'));
const MITS4 = (() => { const m = fill(copyMachine(BM.find((x) => x.id === 'builtin-generic-3axis-mitsubishi'), 'test-mits4', 'TEST Mitsubishi 4A')); m.axes.A = JSON.parse(JSON.stringify(FANUC4.axes.A)); m.post.props = { safeRetract: 'G28' }; return m; })();
const TESTM = SM.testMachine(); // M80V + A dir -1, kilit M10/M11

// --- parca: Ø50 x 120 silindir stok, model Ø48 kutusu (eksen X), orijin model (eksen uzerinde)
const body = (() => { const v = []; for (const x of [0, 100]) for (const y of [-17, 17]) for (const z of [-17, 17]) v.push(x, y, z); return { id: 'b', vertices: new Float32Array(v) }; })();
const setupDef = (over = {}) => ({ id: 'w', name: 'Sarma', bodies: ['b'], frame: { origin: { kind: 'model' } }, stock: { kind: 'cyl', dia: 50, len: 120 }, workOffset: { kind: 'G54' }, wrap: { enabled: true }, ...over });
const resolve = (M, over) => CAM.resolveSetup(setupDef(over), { bodies: [body] }, M);
const tool10 = { id: 't10', number: 4, lengthOffset: 4, diaOffset: 4, type: 'flat', dia: 10, fluteLen: 20, bodyLen: 45, flutes: 3, centerCutting: true };
const tool6 = { id: 't6', number: 2, lengthOffset: 2, diaOffset: 2, type: 'flat', dia: 6, fluteLen: 15, bodyLen: 40, flutes: 3, centerCutting: true };
const drill5 = { id: 'd5', number: 7, lengthOffset: 7, diaOffset: 7, type: 'drill', dia: 5, tipAngle: 118, fluteLen: 30, bodyLen: 50, flutes: 2, centerCutting: true };
const chain = (a, b) => ({ items: [{ segs: [{ ...G.mkLine(a, b), fwd: true }], closed: false, z: null }] });
const base = { rpm: 6000, feedCut: 500, feedPlunge: 200, coolant: 'flood' };
const groove = (geom, S, M, tool = tool10, over = {}) => CAM.computeOp({ id: 'g', name: 'Kanal', type: 'wrapContour', ...base, geom: [{ kind: 'chain' }], side: 'on', stepdown: 2, heights: { clearance: 10, retract: 2, bottom: { from: 'stockTop', off: -2 } }, ...over }, { setup: S, tool, geom, machine: M });
const prog1 = (S, tps, M, name = 'WRAP') => CAM.buildProgram({ name, number: 160, machine: M, sections: [{ setup: S, toolpaths: tps }] });

console.log('1. setup sarma kipi');
{
  const S = resolve(FANUC4);
  ok(S.wrap && S.wrap.r === 25 && S.wrap.R === 25 && S.wrap.sign === 1, 'wrap r/R/isaret: ' + JSON.stringify(S.wrap));
  ok(S.stockCyl.yc === 0 && S.stockCyl.zc === 0, 'silindir ekseni orijinde');
  ok(resolve(FANUC4, { wrap: { enabled: true, dia: 40 } }).wrap.r === 20, 'sarma capi elle (Ø40)');
  ok(resolve(TESTM).wrap.sign === -1, 'A.dir -1 -> isaret -1');
  throwsCode(() => resolve(FANUC4, { stock: { kind: 'boxOffset', side: 1, top: 1, bottom: 1 } }), 'cam.wrap.needs_cyl', 'kutu stokta sarma yok');
  throwsCode(() => resolve(FANUC4, { rotary: { enabled: true, aAngle: 90 } }), 'cam.wrap.rotary_conflict', 'sarma + 3+1 birlikte olmaz');
  throwsCode(() => resolve(SM.fanucMachine()), 'cam.setup.no_rotary', 'A ekseni olmayan makinede sarma yok');
  throwsCode(() => resolve(FANUC4, { wrap: { enabled: true, dia: -5 } }), 'cam.setup.bad_field', 'gecersiz sarma capi');
  throwsCode(() => groove(chain([50, -50], [50, 50]), resolve(FANUC4, { wrap: undefined }), FANUC4), 'cam.wrap.no_wrap_setup', 'sarma islemi sarma olmayan setup\'ta');
}

console.log('2. sarilmis kanal (cevresel): A donusu = 100/25 rad, taban yaricapi 23');
const S = resolve(FANUC4);
const tpG = groove(chain([50, -50], [50, 50]), S, FANUC4);
{
  ok(validateToolpath(tpG) === true && tpG.wrap?.axis === 'X' && tpG.wrap.r === 25, 'IR gecerli, tp.wrap');
  const cuts = tpG.moves.filter((m) => m.t === 'feed' && m.kind === 'cut');
  const aSpan = Math.abs(cuts[cuts.length - 1].a - tpG.moves.find((m) => m.t === 'feed').a);
  ok(near(aSpan, (100 / 25) * DEG, 1e-9), `A donusu ${aSpan} = ${(100 / 25) * DEG} derece (100/25 rad)`);
  ok(tpG.moves.every((m) => m.t !== 'rapid' && m.t !== 'feed' || (m.y === 0 && Number.isFinite(m.a))), 'tum hareketler Y=0, a tasir');
  ok(tpG.moves.filter((m) => m.t === 'feed').every((m) => near(m.z, 23, 1e-9)), 'kesme yaricapi Z = 23');
  ok(tpG.moves.filter((m) => m.t === 'rapid').every((m) => m.z > 25), 'hizlilar stok yaricapi disinda');
  ok(near(tpG.stats.cutLen, 4 + 23 * 4, 1e-9), 'kesim boyu = dalma 4 + 23 x 4 rad: ' + tpG.stats.cutLen);
  // sim
  const r = simulate(prog1(S, [tpG], FANUC4), { res: 0.1 });
  ok(r.issues.filter((i) => i.level === 'error').length === 0, 'sim engel yok: ' + JSON.stringify(r.issues.slice(0, 3)));
  const W = r.wrapBySetup.w; ok(!!W && W.R === 25, 'silindirik stok sonucu');
  const rad = wrapRadiiAt(W, 50); let fl = [Infinity, -Infinity], cutN = 0;
  for (let j = 0; j < W.nt; j++) { let th = wrapTheta(W, j); th -= 2 * Math.PI * Math.round(th / (2 * Math.PI)); if (rad[j] < 25 - 1e-6) cutN++; if (Math.abs(th) < 1.9) { fl[0] = Math.min(fl[0], rad[j]); fl[1] = Math.max(fl[1], rad[j]); } }
  ok(near(fl[0], 23, 0.02) && near(fl[1], 23, 0.02), `kanal tabani yaricapi 23 +-0,02: ${fl[0].toFixed(4)}..${fl[1].toFixed(4)}`);
  const angW = cutN * W.dt, expW = 4 + 2 * Math.asin(5 / 25);
  ok(near(angW, expW, 2 * W.dt), `yuzeyde acisal kapsam ${angW.toFixed(4)} = 4 rad + 2 asin(5/25) = ${expW.toFixed(4)} (+-2 hucre)`);
  // eksenel genislik: A = 0 isini boyunca yuzeyde kesilen x araligi
  const j0 = Math.floor((2 * Math.PI) / W.dt / 2) % W.nt; let xs = []; for (let i = 0; i < W.nx; i++) if (W.top[0 * W.nx + i] < 25 - 1e-6) xs.push(W.x0 + (i + 0.5) * W.res); void j0;
  ok(xs.length && near(xs[xs.length - 1] - xs[0] + W.res, 10, 2 * W.res), 'kanal eksenel genisligi 10 mm: ' + (xs.length ? (xs[xs.length - 1] - xs[0] + W.res).toFixed(3) : '-'));
  const vol = ((25 ** 2 - 23 ** 2) / 2) * 4 * 10; ok(r.removedVolume > vol && r.removedVolume < vol + 2 * Math.PI * 25 * 2 * 1.2, 'kaldirilan hacim (kanal + uc yuvarlaklari): ' + r.removedVolume.toFixed(1));
}

console.log('3. eksenel kanal ve sarilmis cep: acisal genislik');
{
  const tpA = groove(chain([20, 0], [80, 0]), S, FANUC4);
  ok(tpA.moves.filter((m) => m.t === 'feed').every((m) => near(m.a, 0, 1e-12)), 'eksenel kanal sabit A = 0');
  const r = simulate(prog1(S, [tpA], FANUC4), { res: 0.1 }); const W = r.wrapBySetup.w;
  const rad = wrapRadiiAt(W, 50); let n = 0; for (let j = 0; j < W.nt; j++) if (rad[j] < 25 - 1e-6) n++;
  const exp = 2 * Math.asin(5 / 25); // yaricapsal duz takim: duvarlar takim eksenine paralel (5 mm), yuzeyde 2 asin(5/25)
  ok(near(n * W.dt, exp, 2 * W.dt), `eksenel kanal yuzey acisi ${(n * W.dt).toFixed(4)} = 2 asin(5/25) = ${exp.toFixed(4)}`);
  let mn = Infinity; for (const v of rad) mn = Math.min(mn, v); ok(near(mn, 23, 0.02), 'eksenel kanal orta taban 23: ' + mn.toFixed(4));
  // sarilmis cep: acilmis 10 mm genis (v -5..5), 40 mm uzun; Ø6 takim
  const sq = (x0, y0, x1, y1) => [G.mkLine([x0, y0], [x1, y0]), G.mkLine([x1, y0], [x1, y1]), G.mkLine([x1, y1], [x0, y1]), G.mkLine([x0, y1], [x0, y0])].map((s) => ({ ...s, fwd: true }));
  const tpP = CAM.computeOp({ id: 'p', name: 'Cep', type: 'wrapPocket', ...base, geom: [{ kind: 'face' }], stepover: 2.5, stepdown: 1, entry: { kind: 'helix', angle: 3, helixDia: 3 }, heights: { clearance: 10, retract: 2, bottom: { from: 'stockTop', off: -2 } } }, { setup: S, tool: tool6, geom: { faces: [{ z: 23, normalOk: true, outer: sq(30, -5, 70, 5), inners: [] }] }, machine: FANUC4 });
  ok(validateToolpath(tpP) === true && !tpP.moves.some((m) => m.t === 'arc'), 'sarilmis cep IR (yay yok, helis dogrulara bolundu)');
  const r2 = simulate(prog1(S, [tpP], FANUC4), { res: 0.1 }); const W2 = r2.wrapBySetup.w; const rad2 = wrapRadiiAt(W2, 50);
  let n2 = 0, mn2 = Infinity; for (let j = 0; j < W2.nt; j++) { if (rad2[j] < 25 - 1e-6) n2++; mn2 = Math.min(mn2, rad2[j]); }
  const exp2 = 2 * (2 / 25 + Math.asin(3 / 25)); // takim merkezi v = +-2 (acilmis), kenar yaricapsal takimla
  ok(near(n2 * W2.dt, exp2, 2 * W2.dt) && near(n2 * W2.dt, 10 / 25, 0.01), `cep acisal genislik ${(n2 * W2.dt).toFixed(4)} ~ 10/25 = 0,4 rad (beklenen ${exp2.toFixed(4)})`);
  ok(near(mn2, 23, 0.02), 'cep taban yaricapi 23: ' + mn2.toFixed(4));
  ok(r2.issues.filter((i) => i.level === 'error').length === 0, 'cep sim engel yok');
}

console.log('4. post (Fanuc / Mitsubishi genel sablonlari) + geri okuma');
const stepIR = (tp) => splitWrapMoves(tp, 90);
for (const [name, M] of [['Fanuc genel 4A', FANUC4], ['Mitsubishi genel + A', MITS4], ['test M80V A-', TESTM]]) {
  const Sx = resolve(M); const tp = groove(chain([50, -50], [50, 50]), Sx, M);
  const res = postProgram(prog1(Sx, [tp], M), M, OPTS); const L = res.lines;
  ok(L.includes('G93') && L.some((l) => /^G94$/.test(l)), name + ': G93 ... G94');
  ok(L.some((l) => /^G1 Z23\. A[\d.]+ F[\d.]+$/.test(l)), name + ': eszamanli A satiri: ' + L.filter((l) => / A/.test(l)).slice(0, 2).join('|'));
  ok(/WARNING A AXIS DIRECTION NOT VERIFIED/.test(res.text), name + ': A yonu dogrulanmadi uyarisi');
  const back = readNC(res.text, { machine: M }); const tb = back.program.sections[0].toolpath;
  const cmp = compareToolpaths(stepIR(tp), tb);
  ok(cmp.equal && tb.wrap?.axis === 'X', name + ': IR <-> NC esit (A dahil): ' + JSON.stringify(cmp.diffs.slice(0, 4)));
  // G93: her G1 F = 1 / sure
  const ir = stepIR(tp); let prev = null, k = 0, okF = true, nF = 0, sumT = 0;
  const feeds = []; for (const m of ir.moves) { if (m.t === 'feed') feeds.push({ m, L: wrapMoveLen(prev, m) }); if (m.t === 'rapid' || m.t === 'feed') prev = { ...m, a: m.a ?? prev?.a }; }
  let in93 = false;
  for (const l of L) { if (l === 'G93') { in93 = true; continue; } if (l === 'G94') in93 = false; if (in93 && /^G1 /.test(l)) { const F = Number(/F([\d.]+)/.exec(l)[1]); const e = feeds[k++]; const T = e.L / e.m.f; sumT += 1 / F; nF++; if (!near(F, 1 / T, 0.00006 + 1e-5 / T)) okF = false; } }
  ok(okF && nF === feeds.length && nF >= 3, `${name}: G93 F = 1/sure (${nF} blok)`);
  ok(near(sumT, tp.stats.timeMin, 1e-4), `${name}: sure toplami ${sumT.toFixed(5)} = istatistik ${tp.stats.timeMin.toFixed(5)} dk`);
  if (M === TESTM) {
    ok(L.indexOf('M11') >= 0 && L.indexOf('M10') > L.indexOf('M11'), name + ': A indeks kilit acma/kilitleme');
    const tpF = groove(chain([50, -50], [50, 50]), resolve(FANUC4), FANUC4);
    ok(near(tp.moves[3].a, -tpF.moves[3].a, 1e-9), name + ': A.dir -1 -> ters isaretli A');
  }
}

console.log('5. birlesik ilerleme (degmm), surekli A, kisa yol bolme');
{
  const Mdeg = { ...FANUC4, post: { props: { wrapFeedMode: 'degmm' } } };
  const res = postProgram(prog1(S, [tpG], Mdeg), Mdeg, OPTS); const L = res.lines;
  ok(!L.includes('G93'), 'degmm: G93 yok');
  const fl = L.filter((l) => /^(G1 )?Z23\. A/.test(l)); const F = Number(/F([\d.]+)/.exec(fl[0])[1]);
  const st = stepIR(tpG).moves.filter((m) => m.t === 'feed' && m.kind === 'cut'); const dA = (100 / 25) * DEG / 3, Lm = 23 * (4 / 3);
  ok(near(F, 500 * dA / Lm, 0.001), `degmm: F = f * dA / L = ${F} (${(500 * dA / Lm).toFixed(3)})`); void st;
  const cmp = compareToolpaths(stepIR(tpG), readNC(res.text, { machine: Mdeg }).program.sections[0].toolpath);
  ok(cmp.equal, 'degmm geri okuma esit: ' + JSON.stringify(cmp.diffs.slice(0, 3)));
  // surekli A (makine A sarmaz: shortest false, wrap null) -> kelimeler birikimli, 360 sarmasi yok
  const Mc = JSON.parse(JSON.stringify(FANUC4)); Mc.axes.A.shortest = false;
  const rc = postProgram(prog1(resolve(Mc), [groove(chain([50, -50], [50, 50]), resolve(Mc), Mc)], Mc), Mc, OPTS);
  const aw = rc.lines.filter((l) => /^G1 .*A/.test(l)).map((l) => Number(/A(-?[\d.]+)/.exec(l)[1]));
  ok(aw.length === 3 && near(aw[2], 114.592, 0.001) && aw[0] < aw[1] && aw[1] < aw[2], 'surekli A artan: ' + aw.join(','));
  ok(rc.lines.some((l) => /^G0 A-114\.592$/.test(l)), 'surekli: ilk indeks -114.592: ' + rc.lines.filter((l) => /^G0 A/.test(l)).join('|'));
  ok(compareToolpaths(stepIR(groove(chain([50, -50], [50, 50]), resolve(Mc), Mc)), readNC(rc.text, { machine: Mc }).program.sections[0].toolpath).equal, 'surekli A geri okuma esit');
  // kisa yol: 360 sarmasi; her blok |dA| <= 90
  const aws = res.lines.filter((l) => /^(G1 )?Z23\. A/.test(l)).map((l) => Number(/A(-?[\d.]+)/.exec(l)[1]));
  ok(aws.every((a) => a >= 0 && a < 360) && aws.some((a, i) => i && a < aws[i - 1]), 'kisa yol: kelimeler 0..360, 360 gecisi: ' + aws.join(','));
  const Mstep = { ...FANUC4, post: { props: { wrapMaxAStep: 30 } } }; const rs = postProgram(prog1(S, [tpG], Mstep), Mstep, OPTS);
  ok(rs.lines.filter((l) => /^G1 Z23\. A/.test(l)).length === Math.ceil((100 / 25) * DEG / 30), 'wrapMaxAStep 30: blok sayisi');
  ok(compareToolpaths(splitWrapMoves(tpG, 30), readNC(rs.text, { machine: Mstep }).program.sections[0].toolpath).equal, 'wrapMaxAStep 30 geri okuma');
  throwsCode(() => postProgram(prog1(S, [tpG], FANUC4), { ...FANUC4, post: { props: { wrapMaxAStep: 200 } } }, OPTS), 'cam.post.bad_prop', 'wrapMaxAStep >= 180 hata');
  const M0360 = JSON.parse(JSON.stringify(FANUC4)); M0360.axes.A.wrap = '0-360';
  throwsCode(() => postProgram(prog1(S, [tpG], M0360), M0360, OPTS), 'cam.post.wrap_a_format', "A.wrap '0-360' + auto: bicim secilmeli");
  ok(postProgram(prog1(S, [tpG], M0360), { ...M0360, post: { props: { wrapAWord: 'shortest' } } }, OPTS).lines.includes('G93'), "A.wrap '0-360' + wrapAWord shortest calisir");
  throwsCode(() => postProgram(prog1(S, [tpG], FANUC4), { ...FANUC4, post: { props: { rotaryMode: '6b' } } }, OPTS), 'cam.post.wrap_needs_nc_a', '6b (elle indeks) ile sarma yok');
  throwsCode(() => postProgram(prog1(S, [tpG], FANUC4), FANUC4, { ...OPTS, units: 'inch' }), 'cam.post.wrap_inch', 'inc cikisinda sarma yok');
  const Mlim = JSON.parse(JSON.stringify(Mc)); Mlim.axes.A.limits = [-100, 100];
  throwsCode(() => postProgram(prog1(resolve(Mlim), [groove(chain([50, -50], [50, 50]), resolve(Mlim), Mlim)], Mlim), Mlim, OPTS), 'cam.post.a_out_of_limits', 'surekli A sinir disi');
}

console.log('6. sarilmis delme (yaricapsal, A indeksli)');
{
  const op = { id: 'd', name: 'Radyal', type: 'wrapDrill', ...base, feedCut: 120, cycle: 'drill', points: [{ x: 30, a: 0 }, { x: 30, a: 90 }, { x: 30, a: 180 }, { x: 70, a: 270 }], depth: { from: 'top', d: 6 }, heights: { clearance: 10, retract: 2 } };
  const tp = CAM.computeOp(op, { setup: S, tool: drill5, geom: {}, machine: FANUC4 });
  const cyc = tp.moves.filter((m) => m.t === 'cycle');
  ok(cyc.length === 4 && cyc.every((c) => c.points.length === 1 && c.points[0][1] === 0 && near(c.bottom, 25 - 6, 1e-9)), 'dort cevrim, Y=0, dip 19');
  const res = postProgram(prog1(S, [tp], FANUC4), FANUC4, OPTS);
  ok(res.lines.filter((l) => /G81/.test(l)).length === 4 && !res.lines.includes('G93'), 'G81 x4, G93 yok');
  ok(res.lines.some((l) => /^G0 Z35\. A90\.$/.test(l) || /^G0 X30\. Z35\. A90\.$/.test(l)) || res.lines.some((l) => / A90\.$/.test(l)), 'A90 indeks clearance\'ta: ' + res.lines.filter((l) => / A/.test(l)).join('|'));
  const back = readNC(res.text, { machine: FANUC4 }).program.sections[0].toolpath;
  const cmp = compareToolpaths(stepIR(tp), back); ok(cmp.equal, 'delme geri okuma esit: ' + JSON.stringify(cmp.diffs.slice(0, 3)));
  const r = simulate(prog1(S, [tp], FANUC4), { res: 0.1 }); const W = r.wrapBySetup.w;
  ok(r.issues.filter((i) => i.level === 'error').length === 0, 'delme sim engel yok: ' + JSON.stringify(r.issues.slice(0, 2)));
  const at = (x, aDeg) => { const rad = wrapRadiiAt(W, x); let th = aDeg / DEG; th = ((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); return rad[Math.min(W.nt - 1, Math.floor(th / W.dt))]; };
  const tipL = 2.5 / Math.tan(59 / DEG);
  ok([[30, 0], [30, 90], [30, 180], [70, 270]].every(([x, a]) => near(at(x, a), 19, 0.05)), 'delik diplerinde yaricap 19: ' + [[30, 0], [30, 90], [30, 180], [70, 270]].map(([x, a]) => at(x, a).toFixed(3)).join(','));
  ok(near(at(30, 270), 25, 1e-9) && near(at(30, 45), 25, 1e-9), 'delik olmayan acilarda stok tam'); void tipL;
}

console.log('7. IR / kapi / sim denetimleri');
{
  const base0 = { opId: 'x', opName: 'x', opType: 'contour', tool: SM.TOOLS.flat6, rpm: 5000, spindleDir: 'cw', coolant: 'off', clearanceZ: 35, retractZ: 27 };
  throwsCode(() => validateToolpath(mk.toolpath({ ...base0, moves: [{ ...mk.rapid(0, 0, 35), a: 10 }, mk.feed(0, 0, 23, 100), mk.rapid(0, 0, 35)] })), 'cam.ir.a_without_wrap', 'wrap olmadan a');
  throwsCode(() => validateToolpath(mk.toolpath({ ...base0, wrap: { axis: 'X' }, moves: [{ ...mk.rapid(10, 0, 35), a: 0 }, mk.arc(0, 0, 35, -5, 0, 'cw', 100), { ...mk.rapid(0, 0, 35), a: 0 }] })), 'cam.ir.wrap_move', 'wrap yolunda yay yok');
  throwsCode(() => validateToolpath(mk.toolpath({ ...base0, wrap: { axis: 'X' }, moves: [mk.rapid(0, 0, 35), mk.rapid(0, 0, 35)] })), 'cam.ir.field', 'wrap yolunun ilk hareketi a ister');
  // hizli stok icinden: A donerken uc 24 yaricapta
  const bad = mk.toolpath({ ...base0, wrap: { axis: 'X', r: 25 }, moves: [{ ...mk.rapid(50, 0, 35), a: 0 }, { ...mk.rapid(50, 0, 24), a: 0 }, { ...mk.rapid(50, 0, 24), a: 40 }, { ...mk.rapid(50, 0, 35), a: 40 }] });
  const rb = simulate(prog1(S, [bad], FANUC4), { res: 0.2 });
  ok(rb.issues.some((i) => i.code === 'cam.sim.rapid_in_stock' && i.level === 'error'), 'stok icinden A hizlisi -> rapid_in_stock engel');
  // derin kesim: kesici boyu asilir (flute 15, uc 5 yaricapta: 20 mm derin)
  const deep = mk.toolpath({ ...base0, tool: { ...SM.TOOLS.flat6, fluteLen: 15, bodyLen: 40 }, wrap: { axis: 'X', r: 25 }, moves: [{ ...mk.rapid(50, 0, 35), a: 0 }, { ...mk.feed(50, 0, 5, 100, 'plunge'), a: 0 }, { ...mk.feed(50, 0, 5, 100), a: 30 }, { ...mk.rapid(50, 0, 35), a: 30 }] });
  const rd = simulate(prog1(S, [deep], FANUC4), { res: 0.2 });
  ok(rd.issues.some((i) => i.code === 'cam.sim.flute_exceeded'), 'kesici boyu asimi (sarma): ' + rd.issues.map((i) => i.code).join(','));
  // kapilar
  const g1 = gates(prog1(S, [tpG], FANUC4), FANUC4, { sim: false });
  ok(g1.some((g) => g.code === 'cam.gate.a_dir_unverified'), 'kapi: A yonu dogrulanmadi uyarisi (sarma)');
  ok(!g1.some((g) => g.level === 'block' && /rotary|a_limit/.test(g.code)), 'kapi: A ekseni var, engel yok');
  const M3 = { ...FANUC4, axes: { X: FANUC4.axes.X, Y: FANUC4.axes.Y, Z: FANUC4.axes.Z } };
  ok(gates(prog1(S, [tpG], FANUC4), M3, { sim: false }).some((g) => g.code === 'cam.gate.no_rotary' && g.level === 'block'), 'kapi: A yok -> no_rotary engel');
  const Ml = JSON.parse(JSON.stringify(FANUC4)); Ml.axes.A.limits = [-90, 90];
  ok(gates(prog1(S, [tpG], FANUC4), Ml, { sim: false }).some((g) => g.code === 'cam.gate.a_limit'), 'kapi: surekli A sinir disi');
  const gs = gates(prog1(S, [tpG], FANUC4), FANUC4, { sim: { res: 0.25, modelHeightmaps: { w: { data: new Float32Array(1), x0: 0, y0: 0, res: 1, nx: 1, ny: 1 } } } });
  ok(gs.some((g) => g.code === 'cam.gate.wrap_sim_limits') && !gs.some((g) => g.code === 'cam.gate.sim_failed'), 'kapi sim: sarma sim calisti, sinir uyarisi: ' + gs.filter((g) => g.level === 'block').map((g) => g.code).join(','));
}

console.log('8. karisik program: 3 eksen bolum + sarma bolumu');
{
  const SM5 = SM.surfaceSample();
  const p = { ...prog1(S, [tpG], FANUC4) }; p.sections = [SM5.program.sections[0], ...p.sections];
  const res = postProgram(p, FANUC4, OPTS);
  const i93 = res.lines.indexOf('G93'), iA = res.lines.findIndex((l) => /^G0 A/.test(l));
  ok(i93 > iA && iA > 0, 'sarma bolumu: once A indeksi, sonra G93');
  const back = readNC(res.text, { machine: FANUC4 }).program.sections;
  ok(back.length === 2 && !back[0].toolpath.wrap && back[1].toolpath.wrap, 'okuyucu: ilk bolum duz, ikinci sarma');
  ok(compareToolpaths(SM5.program.sections[0].toolpath, back[0].toolpath).equal && compareToolpaths(stepIR(tpG), back[1].toolpath).equal, 'iki bolum geri okuma esit');
}

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
