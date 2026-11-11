// CAM-VERIFY 1: takim yolu dogrulugu (cep + kontur), yuzlerce rastgele/zor geometri, BAGIMSIZ olcut.
// Calistir: node test/verify/toolpath.verify.mjs [adet]
import * as CAM from '../../src/cam/index.js';
import * as V from './lib.mjs';
const { ok, section, L, A, poly, circleLoop, reverseLoop, roundRect } = V;

const N = Number(process.argv[2] || 220);
const TOL = 2e-3;
const stockTop = 0, zFloor = -6;
const S = { id: 's1', name: 'S1', workOffset: { kind: 'G55' }, frame: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, stock: { kind: 'box' }, stockBox: { min: [-100, -100, -30], max: [300, 300, 0] }, modelBBox: { min: [-100, -100, -30], max: [300, 300, 0] }, clearance: 5, aAngle: null, stockTop: 0, machinePos: null };
const tool = (dia, extra = {}) => ({ id: 't', number: 5, lengthOffset: 5, diaOffset: 25, type: 'flat', dia, fluteLen: 30, bodyLen: 60, flutes: 3, centerCutting: true, ...extra });
const base = { rpm: 8000, feedCut: 800, feedPlunge: 300, coolant: 'flood', heights: { clearance: 10, retract: 2 } };

// ------------------------------------------------------------------ sekil ureticileri (bolge: dis CCW, delikler CW)
function shapes(R) {
  const u = (a, b) => a + (b - a) * R();
  const list = [];
  const W = u(25, 90), H = u(20, 70);
  list.push(['rect', { outer: poly([[0, 0], [W, 0], [W, H], [0, H]]), holes: [] }]);
  const a = u(8, W / 2), b = u(8, H / 2);
  list.push(['L', { outer: poly([[0, 0], [W, 0], [W, b], [a, b], [a, H], [0, H]]), holes: [] }]);
  const g = u(6, W / 3);
  list.push(['U', { outer: poly([[0, 0], [W, 0], [W, H], [W - a / 2, H], [W - a / 2, b], [a / 2, b], [a / 2, H], [0, H]]), holes: [] }]);
  list.push(['T', { outer: poly([[0, H - b], [W / 2 - g / 2, H - b], [W / 2 - g / 2, 0], [W / 2 + g / 2, 0], [W / 2 + g / 2, H - b], [W, H - b], [W, H], [0, H]]), holes: [] }]);
  const rc = u(0.3, 8);
  list.push(['roundrect', { outer: roundRect(0, 0, W, H, Math.min(rc, W / 2 - 0.1, H / 2 - 0.1)), holes: [] }]);
  const ir = u(2, Math.min(W, H) / 4);
  list.push(['island', { outer: poly([[0, 0], [W, 0], [W, H], [0, H]]), holes: [circleLoop([W * u(0.35, 0.65), H * u(0.35, 0.65)], ir, false)] }]);
  list.push(['sqisland', { outer: poly([[0, 0], [W, 0], [W, H], [0, H]]), holes: [reverseLoop(poly([[W * 0.3, H * 0.3], [W * 0.55, H * 0.3], [W * 0.55, H * 0.6], [W * 0.3, H * 0.6]]))] }]);
  const neck = u(2, 14), nl = u(2, 20);
  list.push(['dumbbell', { outer: poly([[0, 0], [30, 0], [30, 15 - neck / 2], [30 + nl, 15 - neck / 2], [30 + nl, 0], [60 + nl, 0], [60 + nl, 30], [30 + nl, 30], [30 + nl, 15 + neck / 2], [30, 15 + neck / 2], [30, 30], [0, 30]]), holes: [] }]);
  // yildiz (basit, aci sirali)
  const n = 5 + Math.floor(R() * 8); const pts = []; for (let i = 0; i < n; i++) { const t = (i / n) * V.TAU; const rr = u(12, 40) * (i % 2 ? u(0.4, 1) : 1); pts.push([50 + rr * Math.cos(t), 50 + rr * Math.sin(t)]); }
  list.push(['star', { outer: poly(pts), holes: [] }]);
  const ro = u(8, 40), ri = u(1, ro - 3);
  list.push(['annulus', { outer: circleLoop([0, 0], ro, true), holes: [circleLoop([u(-1, 1), u(-1, 1)], ri, false)] }]);
  const sw = u(4, 20);
  list.push(['slot', { outer: [L([0, 0], [40, 0]), A([40, sw / 2], sw / 2, -Math.PI / 2, Math.PI), L([40, sw], [0, sw]), A([0, sw / 2], sw / 2, Math.PI / 2, Math.PI)], holes: [] }]);
  return list;
}

function checkPocket(tp, PR, r, stR, op, label) {
  const grid = new V.Grid(PR.segs, Math.max(2, r));
  let worst = Infinity, outside = 0; const finalZ = zFloor + (op.stockToLeave?.axial ?? 0);
  const finalPts = []; let dirBad = 0, dirN = 0, slopeBad = 0;
  const tanA = Math.tan(((op.entry?.angle ?? 45) * Math.PI) / 180);
  V.walkSamples(tp, (s) => {
    if (s.m.t === 'rapid' || s.z >= stockTop - 1e-6) return;
    const p = [s.x, s.y]; const D = grid.near(p, r + stR + 2);
    if (D < worst) worst = D;
    if (!V.inRegion(p, PR)) outside++;
    if (Math.abs(s.z - finalZ) < 1e-6) finalPts.push(p);
    if (s.t && Math.abs(D - (r + stR)) < 1e-3 && s.m.kind === 'cut' && s.m.z === s.from.z) {
      const nq = V.nearestOn(p, PR.segs); const w = [nq.q[0] - p[0], nq.q[1] - p[1]]; const cr = s.t[0] * w[1] - s.t[1] * w[0];
      if (Math.abs(cr) > 0.5 * Math.hypot(...w)) { dirN++; if (op.dir === 'conv' ? cr < 0 : cr > 0) dirBad++; }
    }
  });
  // rampa egimi
  let pos = null; for (const m of tp.moves) { if ((m.t === 'feed' || m.t === 'arc') && m.kind === 'ramp' && pos) { const dz = pos.z - m.z; let hl; if (m.t === 'feed') hl = Math.hypot(m.x - pos.x, m.y - pos.y); else { const a = V.arcSweepOwn(pos, m); hl = Math.abs(a.sw) * a.r; } if (dz > 1e-9 && dz / hl > tanA * (1 + 1e-6) + 1e-9) slopeBad++; } if (m.t !== 'cycle' && m.t !== 'dwell' && m.t !== 'comp') pos = { x: m.x, y: m.y, z: m.z }; }
  ok(worst >= r + stR - TOL, `${label}: takim merkezi duvara ${worst.toFixed(4)} < r+pay ${(r + stR).toFixed(4)}`);
  ok(outside === 0, `${label}: ${outside} kesme ornegi bolge disinda (ada icinde/dis sinir disinda)`);
  ok(V.rapidViolations(tp, stockTop).length === 0, `${label}: hizli hareket stok icinde`);
  ok(dirBad === 0, `${label}: ${dirBad}/${dirN} duvar ornegi istenen yonun (${op.dir}) tersinde`);
  ok(slopeBad === 0, `${label}: ${slopeBad} rampa/helis hareketi aci sinirini asiyor`);
  // derinlik seviyeleri: kesme z'leri
  const zs = [...new Set(tp.moves.filter((m) => (m.t === 'feed' || m.t === 'arc') && m.kind === 'cut').map((m) => Math.round(m.z * 1e6) / 1e6))].sort((a, b) => b - a);
  let gap = stockTop - zs[0]; for (let i = 1; i < zs.length; i++) gap = Math.max(gap, zs[i - 1] - zs[i]);
  ok(Math.abs(zs[zs.length - 1] - finalZ) < 1e-6 && gap <= op.stepdown + 1e-6, `${label}: derinlik seviyeleri (son ${zs[zs.length - 1]}, beklenen ${finalZ}; en buyuk adim ${gap} > ${op.stepdown})`);
  // kapsama: takim merkezinin girebilecegi her nokta (D >= r+stR+e) son derinlikte r icinde kesilmis olmali
  const pg = new V.PGrid(finalPts, Math.max(1, r)); let un = 0, tot = 0; const h = Math.max(0.25, r / 6);
  const xs = PR.outer.map((p) => p[0]), ys = PR.outer.map((p) => p[1]);
  let firstUn = null;
  for (let x = Math.min(...xs) + h / 2; x < Math.max(...xs); x += h) for (let y = Math.min(...ys) + h / 2; y < Math.max(...ys); y += h) {
    const p = [x, y]; if (!V.inRegion(p, PR)) continue; const D = grid.near(p, r + stR + 0.5); if (D < r + stR + 0.05) continue; tot++;
    if (pg.near(p, r + 0.05) > r + 0.02) { un++; if (!firstUn) firstUn = p; }
  }
  ok(un === 0, `${label}: kapsama: takim merkezinin ulasabildigi ${un}/${tot} nokta islenmemis (ilk ${firstUn && firstUn.map((v) => v.toFixed(2))})`);
  return { worst };
}

function checkContour(tp, PR, r, stR, op, label, inside) {
  const grid = new V.Grid(PR.segs, Math.max(2, r)); let worst = Infinity, wrongSide = 0, dirBad = 0, dirN = 0; const finalPts = [];
  V.walkSamples(tp, (s) => {
    if (s.m.t === 'rapid' || s.z >= stockTop - 1e-6) return;
    const p = [s.x, s.y]; const D = grid.near(p, r + stR + 2); if (D < worst) worst = D;
    const inn = V.inRegion(p, PR); if (inside ? !inn : inn) wrongSide++;
    if (Math.abs(s.z - zFloor) < 1e-6) finalPts.push(p);
    if (s.t && Math.abs(D - (r + stR)) < 1e-3 && s.m.kind === 'cut') { const nq = V.nearestOn(p, PR.segs); const w = [nq.q[0] - p[0], nq.q[1] - p[1]]; const cr = s.t[0] * w[1] - s.t[1] * w[0]; if (Math.abs(cr) > 0.5 * Math.hypot(...w)) { dirN++; if (op.dir === 'conv' ? cr < 0 : cr > 0) dirBad++; } }
  });
  ok(worst >= r + stR - TOL, `${label}: takim merkezi parcaya ${worst.toFixed(4)} < ${(r + stR).toFixed(4)}`);
  ok(wrongSide === 0, `${label}: ${wrongSide} ornek yanlis tarafta`);
  ok(dirBad === 0 && dirN > 0, `${label}: yon ${dirBad}/${dirN} ters (${op.dir})`);
  ok(V.rapidViolations(tp, stockTop).length === 0, `${label}: hizli hareket stok icinde`);
  // sinir kapsamasi: disaridan (iceriden) r+stR yaricapli disk sigan her sinir noktasina takim ulasmali
  const pg = new V.PGrid(finalPts, Math.max(1, r)); let miss = 0, tot = 0;
  for (const s of PR.R.outer.concat(PR.R.holes.flat())) for (const q of V.sampleSeg(s, 0.5)) {
    // dis normal: bolge solda (CCW) -> sag normal disari
    const e = 1e-4; const t0 = V.nearestOn([q[0] + e, q[1]], [s]); void t0;
    const sp = V.sampleSeg(s, 0.01); let bi = 0, bd = Infinity; sp.forEach((x, i) => { const d = Math.hypot(x[0] - q[0], x[1] - q[1]); if (d < bd) { bd = d; bi = i; } });
    const a = sp[Math.max(0, bi - 1)], b = sp[Math.min(sp.length - 1, bi + 1)]; const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty); if (tl < 1e-9) continue;
    const nOut = [ty / tl, -tx / tl]; const sg = inside ? -1 : 1; const c = [q[0] + sg * nOut[0] * (r + stR), q[1] + sg * nOut[1] * (r + stR)];
    if (grid.near(c, r + stR + 0.1) < r + stR - 1e-3) continue; tot++;
    if (pg.near(q, r + stR + 0.1) > r + stR + 0.01) miss++;
  }
  ok(miss === 0, `${label}: ${miss}/${tot} erisilebilir sinir noktasina takim ulasmiyor`);
  return { worst };
}

// ================================================================== cep
section('1. cep: rastgele sekiller x takim/stepover/pay/giris');
const R = V.rng(20261111);
const errCodes = {}; let runs = 0, t0 = Date.now();
for (let it = 0; it < N; it++) {
  for (const [name, reg] of shapes(R)) {
    if (R() > 0.35) continue;
    const dia = [2, 3, 4, 6, 8, 10, 12, 16][Math.floor(R() * 8)]; const r = dia / 2;
    const soF = R() < 0.15 ? 0.06 + R() * 0.1 : 0.2 + R() * 0.75;
    const stR = R() < 0.5 ? 0 : Math.round(R() * 50) / 100; const stA = R() < 0.6 ? 0 : 0.2;
    const ek = ['helix', 'ramp', 'plunge'][Math.floor(R() * 3)]; const dir = R() < 0.5 ? 'climb' : 'conv';
    const fin = R() < 0.3;
    const op = { id: 'p', type: 'pocket', name: `${name}`, ...base, geom: [{ kind: 'face', ref: {} }], stepover: dia * soF, stepdown: 1 + R() * 4, stockToLeave: { radial: stR, axial: stA }, dir, entry: { kind: ek, angle: 2 + R() * 10, helixDia: dia * (0.5 + R()) }, finishPass: fin, finishStock: fin ? Math.min(0.3, dia * soF / 3) : undefined };
    const label = `${name}#${it} d${dia} so${op.stepover.toFixed(2)} st${stR} ${ek} ${dir}${fin ? ' fin' : ''}`;
    let tp; runs++;
    try { tp = CAM.computeOp(op, { setup: S, tool: tool(dia), geom: { faces: [V.face(reg, zFloor)] } }); } catch (e) { errCodes[e.code || e.message] = (errCodes[e.code || e.message] || 0) + 1; continue; }
    checkPocket(tp, V.prepRegion(reg), r, stR, op, 'cep ' + label);
  }
}
console.log(`  cep kosu ${runs}, hata kodlari ${JSON.stringify(errCodes)}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// ================================================================== kontur
section('2. kontur: dis/ic, tirmanma/konvansiyonel, giris/cikis, kaba pasolar');
const errC = {}; let runsC = 0; t0 = Date.now();
for (let it = 0; it < N; it++) {
  for (const [name, reg] of shapes(R)) {
    if (R() > 0.3) continue;
    const dia = [3, 6, 8, 10, 12][Math.floor(R() * 5)]; const r = dia / 2; const stR = R() < 0.5 ? 0 : 0.3; const dir = R() < 0.5 ? 'climb' : 'conv';
    const inside = R() < 0.4; const lead = R() < 0.5 ? { kind: 'arc', r: 2 + R() * 4 } : R() < 0.5 ? { kind: 'line', len: 3 + R() * 5 } : { kind: 'none' };
    const rough = R() < 0.3 ? { n: 1 + Math.floor(R() * 3), stepover: dia * 0.4 } : undefined;
    const op = { id: 'c', type: 'contour', name, ...base, geom: [{ kind: 'face', ref: {}, loops: 'outer' }], side: inside ? 'inside' : 'outside', dir, stepdown: 2 + R() * 4, stockToLeave: { radial: stR, axial: 0 }, leadIn: lead, leadOut: lead, roughPasses: rough };
    // ic kontur: bolgenin dis sinirini delik gibi kullan (cekirdek: ic donguler CW, loops:'inner')
    let fc, PR;
    if (inside) { fc = { z: zFloor, normalOk: true, outer: V.toKernel(poly([[-200, -200], [400, -200], [400, 400], [-200, 400]])), inners: [V.toKernel(reverseLoop(reg.outer))], open: false, above: null }; op.geom = [{ kind: 'face', ref: {}, loops: 'inner' }]; PR = V.prepRegion({ outer: reg.outer, holes: [] }); }
    else { fc = V.face({ outer: reg.outer, holes: [] }, zFloor); PR = V.prepRegion({ outer: reg.outer, holes: [] }); }
    const label = `kontur ${name}#${it} ${inside ? 'ic' : 'dis'} d${dia} st${stR} ${dir} ${lead.kind}${rough ? ' kaba' + rough.n : ''}`;
    let tp; runsC++;
    try { tp = CAM.computeOp(op, { setup: S, tool: tool(dia), geom: { faces: [fc] } }); } catch (e) { errC[e.code || e.message] = (errC[e.code || e.message] || 0) + 1; continue; }
    checkContour(tp, PR, r, stR, op, label, inside);
  }
}
console.log(`  kontur kosu ${runsC}, hata kodlari ${JSON.stringify(errC)}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
V.summary();
