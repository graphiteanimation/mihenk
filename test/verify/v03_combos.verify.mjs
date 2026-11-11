// V-03..: parca/islem kombinasyonlari -> computeOp (IR) -> M80V postu -> BAGIMSIZ NC ayrıştırıcı (nc.mjs) ile:
//  * NC lint (modal durum, G43/H, S/M3, F, yay, cevrim, program sonu, sayi bicimi, korunan numaralar)
//  * NC'nin tarif ettigi takim merkezi yolunun GEOMETRIK denetimi (oyma: duvar/ada mesafesi >= r+pay; dogru taraf;
//    son derinlik = hedef; en buyuk kademe <= stepdown; tirmanma/konvansiyonel yonu)
//  * "taze dalma": dikey iniste altindaki malzeme o derinlige daha once kesilmemis (helis/rampa istendiyse olmamali)
// Calistir: node test/verify/v03_combos.verify.mjs [--quiet]
import * as CAM from '../../src/cam/index.js';
import { postProgram } from '../../src/cam/post/index.js';
import * as V from './lib.mjs';
import { lintNC, ncSamples } from './nc.mjs';
import { S0, tool, base, machineM80V, section, program, reporter } from './ctx.mjs';
const { poly, circleLoop, reverseLoop, roundRect, L, A } = V;

const rep = reporter('v03_combos'); const QUIET = process.argv.includes('--quiet');
const M = machineM80V(); const S = S0(); const zF = -10; const TOL = 2e-3;
const P = (o) => postProgram(program([section(S, o)]), M, { date: '2026-11-11' });
const agg = {}; const add = (k, v) => { (agg[k] ||= []).push(v); };

const rect = (x0, y0, x1, y1) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
const SH = {
  rectIsland: { outer: rect(10, 10, 90, 60), holes: [circleLoop([50, 35], 10, false)] },
  L: { outer: poly([[10, 10], [90, 10], [90, 30], [40, 30], [40, 80], [10, 80]]), holes: [] },
  dumbbell: { outer: poly([[0, 0], [30, 0], [30, 12], [45, 12], [45, 0], [75, 0], [75, 30], [45, 30], [45, 18], [30, 18], [30, 30], [0, 30]]), holes: [] },
  annulus: { outer: circleLoop([50, 50], 30, true), holes: [circleLoop([55, 50], 12, false)] },
  rrSqIsland: { outer: roundRect(5, 5, 95, 75, 8), holes: [reverseLoop(rect(30, 25, 60, 50))] },
  twoIslands: { outer: rect(0, 0, 100, 60), holes: [circleLoop([30, 30], 8, false), reverseLoop(rect(60, 20, 75, 45))] },
  star: { outer: poly(Array.from({ length: 10 }, (_, i) => { const t = i / 10 * V.TAU; const rr = i % 2 ? 18 : 40; return [50 + rr * Math.cos(t), 50 + rr * Math.sin(t)]; })), holes: [] },
  slot: { outer: [L([20, 40], [70, 40]), A([70, 50], 10, -Math.PI / 2, Math.PI), L([70, 60], [20, 60]), A([20, 50], 10, Math.PI / 2, Math.PI)], holes: [] },
  hole: { outer: circleLoop([50, 50], 15, true), holes: [] },
  rectOpen: { outer: rect(20, 20, 80, 60), holes: [] },
};

// ---------------------------------------------------------------- bagimsiz denetciler
function wallsOf(reg, openIdx = []) { return [...reg.outer.filter((_, i) => !openIdx.includes(i)), ...reg.holes.flat()]; }
function geomCheck(label, nc, { reg, kind, r, stR = 0, stA = 0, dir = 'climb', stepdown, inside = false, openIdx = [], entry = null, rampAng: o_rampAng = null }) {
  const PR = V.prepRegion(reg); const walls = wallsOf(reg, openIdx); const grid = new V.Grid(walls, Math.max(2, r));
  let worst = Infinity, wrong = 0, dirBad = 0, dirN = 0, worstAt = null; const zs = new Set();
  const cutPts = []; let fresh = 0, freshAt = null;
  ncSamples(nc.moves, (s) => {
    if (s.m.t === 'rapid' || s.z >= S.stockTop - 1e-6) return;
    const p = [s.x, s.y]; const D = grid.near(p, r + stR + 3); if (D < worst) { worst = D; worstAt = [s.x.toFixed(3), s.y.toFixed(3), s.z.toFixed(3), 'NC satir ' + s.m.line]; }
    const inn = V.inRegion(p, PR);
    if (kind === 'pocket' && !inn && !openIdx.length) wrong++;
    if (kind === 'contour' && (inside ? !inn : inn)) wrong++;
    if (s.m.t !== 'rapid' && Math.abs(s.m.z - s.m.from.z) < 1e-9) zs.add(Math.round(s.z * 1e5) / 1e5);
    if (s.t && Math.abs(D - (r + stR)) < 1e-3 && Math.abs(s.m.z - s.m.from.z) < 1e-9) {
      const nq = V.nearestOn(p, walls); const w = [nq.q[0] - p[0], nq.q[1] - p[1]]; const cr = s.t[0] * w[1] - s.t[1] * w[0];
      if (Math.abs(cr) > 0.5 * Math.hypot(...w)) { dirN++; if (dir === 'conv' ? cr < 0 : cr > 0) dirBad++; }
    }
  });
  // taze dalma (dikey ilerleme inisi) — onceki kesme orneklerine gore
  const pg = []; for (const m of nc.moves) {
    if (m.t === 'feed' || m.t === 'arc') {
      if (m.t === 'feed' && m.from.x != null && Math.hypot(m.x - m.from.x, m.y - m.from.y) < 1e-9 && m.z < m.from.z - 1e-9 && m.z < S.stockTop - 1e-6) {
        const cleared = pg.some((q) => Math.hypot(q[0] - m.x, q[1] - m.y) < 0.5 * r && q[2] <= m.z + 1e-6);
        const outsideStock = m.x < S.stockBox.min[0] - r || m.x > S.stockBox.max[0] + r || m.y < S.stockBox.min[1] - r || m.y > S.stockBox.max[1] + r;
        if (!cleared && !outsideStock) { fresh++; freshAt ||= `NC satir ${m.line} (${m.x.toFixed(2)},${m.y.toFixed(2)}) z ${m.from.z}->${m.z}`; }
      }
      ncSamples([m], (s) => { if (s.z < S.stockTop) pg.push([s.x, s.y, s.z]); }, Math.max(0.5, r / 2));
    }
  }
  // rampa/helis egimi: inen ve yatay bileseni olan her ilerleme, istenen aciyi (ent.angle) asmamali
  let slopeBad = 0, slopeMax = 0; const ang = entry?.angle ?? o_rampAng;
  if (ang) for (const m of nc.moves) { if ((m.t === 'feed' || m.t === 'arc') && m.from.x != null && m.z < m.from.z - 1e-9) { let hl; if (m.t === 'feed') hl = Math.hypot(m.x - m.from.x, m.y - m.from.y); else { const a0 = Math.atan2(m.from.y - m.cy, m.from.x - m.cx), a1 = Math.atan2(m.y - m.cy, m.x - m.cx); let sw = m.cw ? a0 - a1 : a1 - a0; sw = ((sw % V.TAU) + V.TAU) % V.TAU || V.TAU; hl = sw * m.r; } if (hl > 1e-6) { const sl = Math.atan2(m.from.z - m.z, hl) * 180 / Math.PI; slopeMax = Math.max(slopeMax, sl); if (sl > ang + 0.05) slopeBad++; } } }
  const zl = [...zs].sort((a, b) => b - a); const finalZ = zF + stA; let gap = S.stockTop - zl[0]; for (let i = 1; i < zl.length; i++) gap = Math.max(gap, zl[i - 1] - zl[i]);
  const levelsZ = zl; // tum z'ler (rampa dahil); kademe icin yalniz duz kesme z'leri yeterli degil -> en buyuk bosluk
  return { worst, worstAt, wrong, dirBad, dirN, finalOk: Math.abs(zl[zl.length - 1] - finalZ) < 1e-3, finalZ: zl[zl.length - 1], expFinal: finalZ, gap, fresh, freshAt, nLevels: levelsZ.length, slopeBad, slopeMax };
}
function lint(label, txt, extra = {}) {
  const res = lintNC(txt, { stockTop: S.stockTop, protectedT: M.protected.T, protectedH: M.protected.H, protectedD: M.protected.D, protectedWcs: M.protected.wcs, ...extra });
  for (const i of res.issues) add('lint:' + i.code, `${label} L${i.line} ${i.msg}`);
  return res;
}

// ---------------------------------------------------------------- kombinasyonlar
const combos = [];
const pk = (name, shape, dia, o) => combos.push({ name, kind: 'pocket', shape, dia, op: { id: name, type: 'pocket', name, ...base, geom: [{ kind: 'face', ref: {} }], stepover: dia * 0.45, stepdown: 3, dir: 'climb', entry: { kind: 'helix', angle: 3, helixDia: dia * 0.8 }, ...o } });
const ct = (name, shape, dia, o, inside = false) => combos.push({ name, kind: 'contour', shape, dia, inside, op: { id: name, type: 'contour', name, ...base, geom: [{ kind: 'face', ref: {}, loops: inside ? 'inner' : 'outer' }], side: inside ? 'inside' : 'outside', dir: 'climb', stepdown: 4, ...o } });
pk('P1 ada+helis d10', 'rectIsland', 10, {});
pk('P2 L rampa conv pay', 'L', 6, { dir: 'conv', entry: { kind: 'ramp', angle: 4 }, stockToLeave: { radial: 0.3, axial: 0.2 } });
pk('P3 dar bogaz d8', 'dumbbell', 8, {});
pk('P4 bitirme dalma d8', 'rrSqIsland', 8, { entry: { kind: 'plunge' }, finishPass: true, finishStock: 0.2 });
pk('P5 halka d4 helis', 'annulus', 4, { stepdown: 2.5 });
pk('P6 iki ada d12 rampa', 'twoIslands', 12, { entry: { kind: 'ramp', angle: 5 }, stepover: 5 });
pk('P7 yildiz d6 helis kucuk so', 'star', 6, { stepover: 0.6, stepdown: 10 });
pk('P8 kanal d16 (r=8 < 10)', 'slot', 16, { entry: { kind: 'ramp', angle: 3 } });
pk('P9 stepdown 3.33 (10/3)', 'L', 6, { stepdown: 10 / 3 });
combos.push({ name: 'P10 acik kenarli cep (ust kenar acik)', kind: 'pocket', shape: 'rectOpen', dia: 10, openIdx: [2], op: { id: 'P10', type: 'pocket', name: 'P10', ...base, geom: [{ kind: 'face', ref: {} }], stepover: 4, stepdown: 3, dir: 'climb', entry: { kind: 'ramp', angle: 3 } } });
ct('C1 dis yuvarlak kose yay giris kopru', 'rrSqIsland', 10, { leadIn: { kind: 'arc', r: 4 }, leadOut: { kind: 'arc', r: 4 }, tabs: { n: 3, width: 5, height: 2 } });
ct('C2 dis yildiz conv cizgi kaba', 'star', 6, { dir: 'conv', leadIn: { kind: 'line', len: 5 }, leadOut: { kind: 'line', len: 5 }, roughPasses: { n: 2, stepover: 2 }, stockToLeave: { radial: 0.3, axial: 0 } });
ct('C3 ic delik d8 yay', 'hole', 8, { leadIn: { kind: 'arc', r: 3 }, leadOut: { kind: 'arc', r: 3 } }, true);
ct('C4 ic kanal wear', 'slot', 6, { comp: 'wear', leadIn: { kind: 'line', len: 5 }, leadOut: { kind: 'line', len: 5 } }, true);
ct('C5 dis L rampa', 'L', 8, { ramp: { kind: 'ramp', angle: 5 } });
ct('C6 dis L varsayilan (ramp yok)', 'L', 8, {});

for (const c of combos) {
  const reg = SH[c.shape]; const r = c.dia / 2; const stR = c.op.stockToLeave?.radial ?? 0, stA = c.op.stockToLeave?.axial ?? 0;
  let fc;
  if (c.kind === 'contour' && c.inside) fc = { z: zF, normalOk: true, outer: V.toKernel(rect(-15, -15, 115, 115)), inners: [V.toKernel(reverseLoop(reg.outer))], open: false, above: null };
  else if (c.kind === 'contour') fc = V.face({ outer: reg.outer, holes: [] }, zF);
  else if (c.openIdx) fc = { z: zF, normalOk: true, outer: V.toKernel(reg.outer, c.openIdx), inners: [], open: true, above: [] };
  else fc = V.face(reg, zF);
  const T = tool(c.dia);
  let tp; try { tp = CAM.computeOp(c.op, { setup: S, tool: T, geom: { faces: [fc] }, machine: M }); } catch (e) { add('op_error', `${c.name}: ${e.code} ${JSON.stringify(e.params)}`); if (!QUIET) console.log(`  ${c.name}: HATA ${e.code}`); continue; }
  let nc; try { nc = P(tp); } catch (e) { add('post_error', `${c.name}: ${e.code}`); continue; }
  const L_ = lint(c.name, nc.text);
  if (c.op.comp === 'wear') { // programlanan yol = parca konturu + stR; G41 (tirmanma, ic) beklenir
    const walls = [...reg.outer]; let on = 0, n = 0, inside = 0; const side = new Set();
    ncSamples(L_.moves, (s) => { if (s.m.t !== 'rapid' && s.m.comp !== 40 && s.z < -1e-6 && Math.abs(s.m.z - s.m.from.z) < 1e-9) { const nq = V.nearestOn([s.x, s.y], walls); n++; if (Math.abs(nq.d - stR) < 1e-3) on++; if (!V.inRegion([s.x, s.y], V.prepRegion({ outer: reg.outer, holes: [] })) && nq.d > 1e-3) inside++; side.add(s.m.comp); } });
    const tag = `${c.name}: telafili orneklerin %${(100 * on / n).toFixed(1)}'i parca konturunda (+stR); kontur disinda (malzemede) ${inside}; telafi ${[...side].map((g) => 'G' + g)}`;
    if (!QUIET) console.log('  ' + tag); if (on / n < 0.8 || inside || ![...side].every((g) => g === 41)) add('wear_path', tag); continue;
  }
  const gr = c.kind === 'contour' && c.inside ? { outer: reg.outer, holes: [] } : (c.kind === 'contour' ? { outer: reg.outer, holes: [] } : reg);
  const g = geomCheck(c.name, L_, { reg: gr, kind: c.kind, r, stR, stA, dir: c.op.dir, stepdown: c.op.stepdown, inside: c.inside, entry: c.kind === 'pocket' && c.op.entry.kind !== 'plunge' ? c.op.entry : null, rampAng: c.op.ramp?.angle ?? null, openIdx: c.openIdx || [] });
  if (g.slopeBad) add('ramp_slope', `${c.name}: ${g.slopeBad} hareket aciyi asiyor (en cok ${g.slopeMax.toFixed(2)} derece)`);
  { let pos = null; for (const m of tp.moves) { if (m.t === 'arc' && pos) { const ch = Math.hypot(m.x - pos.x, m.y - pos.y); if (ch < (agg.minChord?.[0] ?? Infinity)) agg.minChord = [ch, c.name]; } if (m.x != null) pos = m; } }
  if (c.openIdx) { let over = -Infinity; ncSamples(L_.moves, (q) => { if (q.m.t !== 'rapid' && q.z < -1e-6) over = Math.max(over, q.y); }); if (!QUIET) console.log(`  ${c.name}: acik kenar (y=60) otesine takim merkezi en cok y=${over.toFixed(3)} (beklenen >= 60+r=65 civari)`); if (over < 60 + r - 1e-3) add('open_edge_short', `${c.name}: ${over}`); }
  const tag = `${c.name}: duvar min ${g.worst.toFixed(4)} (r+pay ${(r + stR).toFixed(3)}) @${g.worstAt}; yanlis taraf ${g.wrong}; yon ters ${g.dirBad}/${g.dirN}; son z ${g.finalZ} (hedef ${g.expFinal}); en buyuk kademe ${g.gap.toFixed(3)} (sd ${c.op.stepdown.toFixed(3)}); taze dalma ${g.fresh} ${g.freshAt || ''}; en dik inis ${g.slopeMax.toFixed(2)} der; uyarilar ${tp.warnings.map((w) => w.code).join(',')}`;
  if (!QUIET) console.log('  ' + tag);
  if (g.worst < r + stR - TOL) add('gouge', tag);
  if (g.wrong) add('wrong_side', tag);
  if (g.dirBad > 0.01 * g.dirN) add('direction', tag); // tek tuk uc-nokta ornekleri (yildiz ucu) sezgisel artefakt
  if (!g.finalOk) add('final_depth', tag);
  if (g.gap > c.op.stepdown + 1.5e-3) add('stepdown_exceeded', tag); // 0,001 NC yuvarlama payi
  if (g.fresh && c.kind === 'pocket' && c.op.entry.kind !== 'plunge') add('fresh_plunge_with_helix_ramp', tag);
  if (g.fresh && c.kind === 'contour') add('contour_fresh_plunge', tag);
}

console.log('\nOZET'); console.log(`- en kisa yay kirisi (IR): ${agg.minChord?.[0]?.toExponential(3)} mm (${agg.minChord?.[1]})`); delete agg.minChord;
for (const [k, v] of Object.entries(agg)) { console.log(`- ${k}: ${v.length}`); for (const x of v.slice(0, 4)) console.log('    ' + x); }
rep.finding('V-03a feed_f_from_prev_section', agg['lint:feed_f_from_prev_section'], 'ikinci+ bolumde ilk G1 F yazmadan onceki takimin F degerine dayaniyor (bkz. v04)');
rep.finding('gouge', agg.gouge, 'NC yolunda r+pay ihlali');
rep.finding('fresh_plunge_with_helix_ramp', agg.fresh_plunge_with_helix_ramp, 'helis/rampa istenen cepte dikey taze dalma');
rep.finding('contour_fresh_plunge', agg.contour_fresh_plunge, 'konturda malzemeye dikey taze dalma (ramp yok/kopru donusu)');
rep.finding('final_depth', agg.final_depth, 'son derinlik hedefe esit degil');
rep.finding('stepdown_exceeded', agg.stepdown_exceeded, 'kademe stepdown asiyor');
rep.finding('ramp_slope', agg.ramp_slope, 'rampa/helis istenen aciyi asiyor');
rep.finding('direction', agg.direction, 'tirmanma/konvansiyonel yon ters');
rep.done();
