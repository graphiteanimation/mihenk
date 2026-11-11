// V-fuzz: rastgele adali cepler (adalar duvara/birbirine yakin, kucuk takim), yalniz OYMA ve ADA ICINE GIRME olcusu.
// Hakem: kendi uzaklik hesabi (lib.mjs). Calistir: node test/verify/v10_fuzz.verify.mjs [adet=12] [tohum=7]
import * as CAM from '../../src/cam/index.js';
import * as V from './lib.mjs';
import { S0, tool, base, reporter } from './ctx.mjs';
const rep = reporter('v10_fuzz'); const N = Number(process.argv[2] || 12); const R = V.rng(Number(process.argv[3] || 7));
const S = S0(); const u = (a, b) => a + (b - a) * R();
let worstRel = Infinity, runs = 0, errs = {}; const bad = [];
for (let it = 0; it < N; it++) {
  const W = u(40, 90), H = u(30, 70); const holes = []; const k = 1 + Math.floor(R() * 3);
  for (let j = 0; j < k; j++) {
    const rr = u(2, 8), cx = u(rr + 1, W - rr - 1), cy = u(rr + 1, H - rr - 1);
    if (holes.some((h) => Math.hypot(h.c[0] - cx, h.c[1] - cy) < h.r + rr + 0.5)) continue;
    holes.push({ c: [cx, cy], r: rr, sq: R() < 0.4 });
  }
  const reg = { outer: V.poly([[0, 0], [W, 0], [W, H], [0, H]]), holes: holes.map((h) => (h.sq ? V.reverseLoop(V.poly([[h.c[0] - h.r, h.c[1] - h.r], [h.c[0] + h.r, h.c[1] - h.r], [h.c[0] + h.r, h.c[1] + h.r], [h.c[0] - h.r, h.c[1] + h.r]])) : V.circleLoop(h.c, h.r, false))) };
  const dia = [3, 4, 6, 8][Math.floor(R() * 4)], r = dia / 2, stR = R() < 0.5 ? 0 : 0.25;
  const ek = ['helix', 'ramp', 'plunge'][Math.floor(R() * 3)];
  const op = { id: 'f', type: 'pocket', name: 'f', ...base, geom: [{ kind: 'face', ref: {} }], stepover: dia * u(0.3, 0.8), stepdown: 10, dir: R() < 0.5 ? 'climb' : 'conv', stockToLeave: { radial: stR, axial: 0 }, entry: { kind: ek, angle: 5, helixDia: dia * 0.6 } };
  let tp; runs++;
  try { tp = CAM.computeOp(op, { setup: S, tool: tool(dia), geom: { faces: [V.face(reg, -10)] } }); } catch (e) { errs[e.code] = (errs[e.code] || 0) + 1; continue; }
  const PR = V.prepRegion(reg); const grid = new V.Grid(PR.segs, Math.max(2, r)); let worst = Infinity, out = 0;
  V.walkSamples(tp, (s) => { if (s.m.t === 'rapid' || s.z > -1e-6) return; const p = [s.x, s.y]; const D = grid.near(p, r + stR + 3); if (D < worst) worst = D; if (!V.inRegion(p, PR)) out++; });
  worstRel = Math.min(worstRel, worst - (r + stR));
  if (worst < r + stR - 2e-3 || out) bad.push(`#${it} W${W.toFixed(1)} H${H.toFixed(1)} adalar ${holes.length} d${dia} ${ek}: min ${worst.toFixed(4)} < ${(r + stR).toFixed(3)}, disarida ${out}`);
}
rep.info(`kosu ${runs}, hata kodlari ${JSON.stringify(errs)}, en kotu (min uzaklik - (r+pay)) = ${worstRel.toFixed(5)} mm`);
rep.finding('fuzz-gouge', bad.length, bad.slice(0, 5).join(' | ') || 'oyma yok');
rep.done();
