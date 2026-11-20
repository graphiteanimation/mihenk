// WP-12 testleri: uyarlanir kaba (temas acisi siniri, acik kenar, giris), kalan malzeme (rest: onceki takim / onceki islem stogu, program
// zinciri), yatay temizleme, asagida kal, koseda ve cikista ilerleme dusurme, ince duvar. Malzeme kaldirma ve duvar ihlali simulasyonla
// (yalniz sim API'si) denetlenir; temas acisi takim yolundan BAGIMSIZ ince izgarada (0,1 mm) yeniden olculur.
// Calistir: node test/wp12.test.mjs
import * as CAM from '../src/cam/index.js';
import * as P from '../src/cam/geom/path2d.js';
import * as G from '../src/shared/geom2d.js';
import { walk, sampleArc, validateToolpath } from '../src/cam/ir.js';
import { simulate, heightmapFromFn, sampleHeightmap } from '../src/cam/sim/index.js';
import { engageAngle } from '../src/cam/ops/adaptive.js';
import { validateDoc } from '../src/shared/schema.js';
import { postProgram } from '../src/cam/post/index.js';
import * as SMP from './cam-samples/samples.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const throwsCode = (fn, code, m) => { try { fn(); ok(false, `${m}: hata bekleniyordu (${code})`); } catch (e) { ok(e.code === code, `${m}: ${e.code} != ${code} ${JSON.stringify(e.params || {})}`); } };
const sq = (x0, y0, x1, y1, open = []) => [G.mkLine([x0, y0], [x1, y0]), G.mkLine([x1, y0], [x1, y1]), G.mkLine([x1, y1], [x0, y1]), G.mkLine([x0, y1], [x0, y0])].map((s, i) => ({ ...s, fwd: true, open: open.includes(i) }));
const circ = (c, r, fwd) => [{ ...G.mkArc(c, r, 0, 2 * Math.PI), fwd, open: false }];
const kloop = (items) => items.flatMap((it) => P.fromGeom2d(it, it.fwd, it.open ? { open: true } : null));
const flat = (dia, extra = {}) => ({ id: 't' + dia, number: 5, lengthOffset: 5, diaOffset: 5, type: 'flat', dia, fluteLen: 25, bodyLen: 50, flutes: 3, centerCutting: true, ...extra });
const base = { rpm: 8000, feedCut: 800, feedPlunge: 300, coolant: 'flood', heights: { clearance: 10, retract: 2 } };
const setupOf = (min, max, extra = {}) => ({ id: 's1', name: 'S1', workOffset: { kind: 'G55' }, frame: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, stock: { kind: 'box' }, stockBox: { min, max }, modelBBox: { min, max }, clearance: 5, aAngle: null, stockTop: max[2], machinePos: null, ...extra });
const deg = (a) => (a * 180) / Math.PI;
const t0 = Date.now();

// Bagimsiz temas acisi olcumu: ince izgara (gt), hucre merkezi; yol 0,1 mm adimla yurur; 'cut' adimlarinda on yarim cemberde (180 ornek)
// malzemeli yay acisi olculur, sonra disk temizlenir. Giris (ramp/plunge) adimlari yalniz temizler. Donus {max, p99, n}
function engagement(tp, inMat, bb, r, zCut, gt = 0.1) {
  const nx = Math.ceil((bb[2] - bb[0]) / gt), ny = Math.ceil((bb[3] - bb[1]) / gt); const mat = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (inMat(bb[0] + (i + 0.5) * gt, bb[1] + (j + 0.5) * gt)) mat[j * nx + i] = 1;
  const at = (x, y) => { const i = Math.floor((x - bb[0]) / gt), j = Math.floor((y - bb[1]) / gt); return i < 0 || j < 0 || i >= nx || j >= ny ? 0 : mat[j * nx + i]; };
  const clear = (x, y) => { const i0 = Math.max(0, Math.floor((x - r - bb[0]) / gt)), i1 = Math.min(nx - 1, Math.floor((x + r - bb[0]) / gt)), j0 = Math.max(0, Math.floor((y - r - bb[1]) / gt)), j1 = Math.min(ny - 1, Math.floor((y + r - bb[1]) / gt));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = bb[0] + (i + 0.5) * gt - x, dy = bb[1] + (j + 0.5) * gt - y; if (dx * dx + dy * dy <= r * r) mat[j * nx + i] = 0; } };
  const NS = 180; let max = 0; const hist = [];
  const step = (p, q, cutK) => {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 1e-9) { clear(q[0], q[1]); return; }
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]); const k = Math.max(1, Math.ceil(L / 0.1));
    for (let s = 1; s <= k; s++) {
      const x = p[0] + ((q[0] - p[0]) * s) / k, y = p[1] + ((q[1] - p[1]) * s) / k;
      if (cutK) { let c = 0; for (let t = 0; t < NS; t++) { const ph = a - Math.PI / 2 + ((t + 0.5) * Math.PI) / NS; if (at(x + r * Math.cos(ph), y + r * Math.sin(ph))) c++; } const th = (c * 180) / NS; if (th > max) max = th; if (th > 0) hist.push(th); }
      clear(x, y);
    }
  };
  walk(tp, (m, k, from) => {
    if (!from || (m.t !== 'feed' && m.t !== 'arc') || m.z > zCut + 1e-6) return;
    const cutK = m.kind === 'cut' && Math.abs(from.z - zCut) < 1e-6;
    if (m.t === 'feed') step([from.x, from.y], [m.x, m.y], cutK); else { let p = [from.x, from.y]; for (const q of sampleArc(from, m, 0.01)) { step(p, [q[0], q[1]], cutK); p = q; } }
  });
  hist.sort((a, b) => a - b);
  return { max, p99: hist.length ? hist[Math.floor(hist.length * 0.99)] : 0, n: hist.length };
}
// kesme hareketlerinin takim merkezi ornekleri (z <= zMax)
function centers(tp, zMax, step = 0.25) {
  const out = [];
  walk(tp, (m, k, from) => {
    if (!from || (m.t !== 'feed' && m.t !== 'arc') || m.z > zMax + 1e-9) return;
    if (m.t === 'feed') { const L = Math.hypot(m.x - from.x, m.y - from.y); const n = Math.max(1, Math.ceil(L / step)); for (let i = 1; i <= n; i++) out.push([from.x + ((m.x - from.x) * i) / n, from.y + ((m.y - from.y) * i) / n, from.z + ((m.z - from.z) * i) / n]); }
    else for (const q of sampleArc(from, m, 0.01)) out.push(q);
  });
  return out;
}
const simErrors = (r) => r.issues.filter((i) => i.level === 'error');
const codes = (r) => r.issues.map((i) => i.code);

// ---------------------------------------------------------------- 1. kapali cep + ada
console.log('1. uyarlanir kaba: kapali cep (ada), temas acisi, duvar, sim');
const S0 = setupOf([0, 0, -30], [100, 60, 0]);
const face1 = { z: -10, normalOk: true, outer: sq(20, 10, 80, 50), inners: [circ([50, 30], 3, false)] };
const R1 = { outer: kloop(face1.outer), holes: [P.reverseLoop(kloop(face1.inners[0]))] };
const in1 = (x, y) => x > 20 && x < 80 && y > 10 && y < 50 && Math.hypot(x - 50, y - 30) > 3; // R1 analitik
const tool10 = flat(10); const r = 5;
const adOp = { id: 'a1', name: 'AD1', type: 'adaptive', ...base, geom: [{ kind: 'face' }], optimalLoad: 1.5, stepdown: 5, stockToLeave: { radial: 0.3, axial: 0 }, entry: { kind: 'helix', angle: 3, helixDia: 8 } };
let ta = Date.now(); const tp1 = CAM.computeOp(adOp, { setup: S0, tool: tool10, geom: { faces: [face1] } }); const ms1 = Date.now() - ta;
ok(validateToolpath(tp1) && tp1.opType === 'adaptive', 'IR gecerli');
const ad1 = tp1.meta.adaptive; const thMax = deg(engageAngle(1.5, r));
ok(Math.abs(ad1.thetaMax - thMax) < 0.01, `theta siniri acos(1 - ae/r) = ${thMax.toFixed(2)}`);
ok(ad1.entries >= 2 && tp1.moves.some((m) => m.kind === 'ramp'), `hava yok: her seviyede helis girisi (${ad1.entries})`);
ok(ad1.maxTheta <= thMax + 1e-6, 'ic olcum siniri asmadi');
{
  const e = engagement(tp1, in1, [15, 5, 85, 55], r, -10);
  const tol = deg(engageAngle(1.5 + ad1.cell, r)); // bir izgara hucresi radyal belirsizlik
  ok(e.p99 <= thMax + 0.5, `bagimsiz olcum p99 ${e.p99.toFixed(1)} <= ${thMax.toFixed(1)}`);
  ok(e.max <= tol + 1, `bagimsiz olcum en buyuk ${e.max.toFixed(1)} <= ${tol.toFixed(1)} (siniri + 1 hucre)`);
  const pk = CAM.computeOp({ ...adOp, id: 'p1', type: 'pocket', stepover: 1.5, entry: { kind: 'helix', angle: 3, helixDia: 8 } }, { setup: S0, tool: tool10, geom: { faces: [face1] } });
  const ep = engagement(pk, in1, [15, 5, 85, 55], r, -10);
  ok(ep.max > e.max + 30, `karsilastirma: ayni yuklu cep yolunda en buyuk temas ${ep.max.toFixed(0)} derece (uyarlanir ${e.max.toFixed(0)})`);
  console.log(`   sure ${ms1} ms, paso ${ad1.passes}, baglanti ${ad1.links}, kalkis ${ad1.lifts}, hucre ${ad1.cell}; temas uyarlanir max ${e.max.toFixed(1)} p99 ${e.p99.toFixed(1)} / cep max ${ep.max.toFixed(1)} p99 ${ep.p99.toFixed(1)}`);
}
{ // takim merkezi izinli bolgede: duvara uzaklik >= r + yanal pay
  const walls = P.regionSegs(R1); let minD = Infinity, out = 0;
  for (const c of centers(tp1, -5 + 1e-9)) { const d = P.distTo([c[0], c[1]], walls); minD = Math.min(minD, d); if (!P.inRegion([c[0], c[1]], R1)) out++; }
  ok(out === 0 && minD >= r + 0.3 - 0.01, `merkezler bolgede, duvara en az ${minD.toFixed(3)} (>= ${r + 0.3})`);
}
{ // sim: parca modeli = bolge disi ve ada ust z=0, bolge ici taban -10
  const res = 0.25; const model = heightmapFromFn([0, 0], [100, 60], res, (x, y) => (in1(x, y) ? -10 : 0));
  const sr = simulate(tp1, { res, stockBox: S0.stockBox, modelHeightmap: model });
  ok(simErrors(sr).length === 0, 'sim hatasiz (oyma/hizli stok yok): ' + [...new Set(codes(sr))].join(','));
  const rem = sr.remainHeightmap; let tot = 0, left = 0;
  const walls = P.regionSegs(R1);
  for (let x = 20.5; x < 80; x += 0.5) for (let y = 10.5; y < 50; y += 0.5) { if (!P.inRegion([x, y], R1) || P.distTo([x, y], walls) < 0.3 + 2 * res) continue; tot++; if (sampleHeightmap(rem, x, y) > -10 + 0.02) left++; }
  ok(tot > 0 && left / tot < 0.03, `bolge ici kalan oran ${(100 * left / tot).toFixed(2)}% (< %3; koseler ve ada ustu dar bant)`);
  let outside = 0; for (let x = 1; x < 100; x += 1) for (let y = 1; y < 60; y += 1) if (!in1(x, y) && P.distTo([x, y], walls) > res * 2 && sampleHeightmap(rem, x, y) < -1e-6) outside++;
  ok(outside === 0, `bolge disi (parca) kesilmedi: ${outside}`);
}
throwsCode(() => CAM.computeOp({ ...adOp, optimalLoad: 12 }, { setup: S0, tool: tool10, geom: { faces: [face1] } }), 'cam.adaptive.load_too_big', 'yuk >= cap');
throwsCode(() => CAM.computeOp({ ...adOp, entry: { kind: 'plunge' } }, { setup: S0, tool: tool10, geom: { faces: [face1] } }), 'cam.op.bad_field', 'dalma girisi yok');
throwsCode(() => CAM.computeOp({ ...adOp, entry: { kind: 'helix', angle: 3, helixDia: 12 } }, { setup: S0, tool: tool10, geom: { faces: [face1] } }), 'cam.adaptive.helix_big', 'helis > takim');

// ---------------------------------------------------------------- 2. acik kenar + asagida kal
console.log(`   (${((Date.now() - t0) / 1000).toFixed(0)} sn)`); console.log('2. acik kenar (havadan giris), asagida kal');
const S2 = setupOf([0, 0, -30], [80, 60, 0]);
const face2 = { z: -6, normalOk: true, outer: sq(20, 15, 80, 45, [1]), inners: [], above: [] };
const R2 = { outer: kloop(face2.outer), holes: [] };
const op2 = { ...adOp, id: 'a2', stepdown: 6, stockToLeave: 0, optimalLoad: 2 };
const tp2 = CAM.computeOp(op2, { setup: S2, tool: tool10, geom: { faces: [face2] } });
ok(tp2.meta.adaptive.entries === 0 && !tp2.moves.some((m) => m.kind === 'ramp'), 'acik kenar: helis yok, takim stok disindan girer');
{
  const e = engagement(tp2, (x, y) => x > 20 && x < 80 && y > 15 && y < 45, [15, 10, 100, 50], r, -6);
  const th = deg(engageAngle(2, r)), tol = deg(engageAngle(2 + tp2.meta.adaptive.cell, r));
  ok(e.p99 <= th + 0.5 && e.max <= tol + 1, `acik kenar temas p99 ${e.p99.toFixed(1)} / max ${e.max.toFixed(1)} (sinir ${th.toFixed(1)}, +hucre ${tol.toFixed(1)})`);
  const res = 0.25; const model = heightmapFromFn([0, 0], [80, 60], res, (x, y) => ((x > 20 && y > 15 && y < 45) ? -6 : 0));
  const sr = simulate(tp2, { res, stockBox: S2.stockBox, modelHeightmap: model });
  ok(simErrors(sr).length === 0, 'acik kenar sim hatasiz: ' + [...new Set(codes(sr))].join(','));
  let tot = 0, left = 0; const walls = [kloop(face2.outer)[0], kloop(face2.outer)[2], kloop(face2.outer)[3]];
  for (let x = 20.5; x < 80; x += 0.5) for (let y = 15.5; y < 45; y += 0.5) { if (P.distTo([x, y], walls) < 2 * res) continue; tot++; if (sampleHeightmap(sr.remainHeightmap, x, y) > -6 + 0.02) left++; }
  ok(left / tot < 0.02, `acik kenar kalan oran ${(100 * left / tot).toFixed(2)}%`);
  const xs = centers(tp2, -6 + 1e-9).map((c) => c[0]); ok(Math.max(...xs) <= 80 + 2 * 1.25 * r - r + 1e-6, 'takim merkezi sanal bandin icinde');
}
{
  const up = CAM.computeOp({ ...op2, stayDown: false }, { setup: S2, tool: tool10, geom: { faces: [face2] } });
  const a = tp2.meta.adaptive, b = up.meta.adaptive;
  ok(a.links > 0 && b.links === 0 && b.lifts > a.lifts, `asagida kal: baglanti ${a.links}/kalkis ${a.lifts} — kapali: kalkis ${b.lifts}`);
  ok(tp2.stats.rapidLen < up.stats.rapidLen, `asagida kal hizli yolu kisaltir (${tp2.stats.rapidLen.toFixed(0)} < ${up.stats.rapidLen.toFixed(0)} mm)`);
  // baglanti (link) hareketleri bos alandan: sim sirali kosuda baglanti hareketleri malzeme kaldirmamali
  const linkOnly = { ...tp2, moves: tp2.moves }; let linkCut = 0;
  const sr = simulate(linkOnly, { res: 0.25, stockBox: S2.stockBox }); void sr;
  const e = engagement({ moves: tp2.moves.map((m) => (m.link ? { ...m, kind: 'cut' } : m.kind === 'cut' ? { ...m, kind: 'lead' } : m)) }, (x, y) => x > 20 && x < 80 && y > 15 && y < 45, [15, 10, 100, 50], r, -6);
  linkCut = e.max; ok(linkCut <= 12, `baglanti hareketlerinde temas en cok ${linkCut.toFixed(1)} derece (bos alan; izgara payi)`);
}

// ---------------------------------------------------------------- 3. kalan malzeme
console.log(`   (${((Date.now() - t0) / 1000).toFixed(0)} sn)`); console.log('3. kalan malzeme (rest): onceki takim ve onceki islem stogu');
const face3 = { z: -8, normalOk: true, outer: sq(20, 15, 80, 45), inners: [] };
const R3 = { outer: kloop(face3.outer), holes: [] };
const tool4 = flat(4, { number: 6, lengthOffset: 6, diaOffset: 6 });
const restT = CAM.computeOp({ ...adOp, id: 'r1', geom: [{ kind: 'face' }], optimalLoad: 0.8, stepdown: 8, stockToLeave: 0, entry: { kind: 'helix', angle: 3, helixDia: 3 }, rest: { source: 'tool', toolDia: 16 } }, { setup: S0, tool: tool4, geom: { faces: [face3] } });
const fullT = CAM.computeOp({ ...adOp, id: 'r0', geom: [{ kind: 'face' }], optimalLoad: 0.8, stepdown: 8, stockToLeave: 0, entry: { kind: 'helix', angle: 3, helixDia: 3 } }, { setup: S0, tool: tool4, geom: { faces: [face3] } });
ok(restT.stats.cutLen < 0.2 * fullT.stats.cutLen, `onceki takim (D16) rest: kesme ${restT.stats.cutLen.toFixed(0)} mm << tam ${fullT.stats.cutLen.toFixed(0)} mm`);
{ // rest yolu yalniz kose bolgesinde: merkezler kosenin 8 mm (R prev) yakininda
  const far = centers(restT, -8 + 1e-9).filter((c) => { const dx = Math.min(c[0] - 20, 80 - c[0]), dy = Math.min(c[1] - 15, 45 - c[1]); return dx > 8 + 0.5 && dy > 8 + 0.5; }).length;
  ok(far === 0, `rest merkezleri yalniz koselerde (uzakta ${far})`);
}
throwsCode(() => CAM.computeOp({ ...adOp, rest: { source: 'tool', toolDia: 8 } }, { setup: S0, tool: tool10, geom: { faces: [face1] } }), 'cam.adaptive.rest_tool_small', 'onceki takim kucuk');
throwsCode(() => CAM.computeOp({ ...adOp, rest: { source: 'stock' } }, { setup: S0, tool: tool10, geom: { faces: [face1] } }), 'cam.adaptive.rest_no_stock', 'rest stok haritasi yok');
{ // onceki islem stogu: D16 cep -> sim -> D4 rest stock
  const pk16 = CAM.computeOp({ ...adOp, id: 'p16', type: 'pocket', stepover: 6, stepdown: 8, stockToLeave: 0, entry: { kind: 'helix', angle: 3, helixDia: 8 } }, { setup: S0, tool: flat(16, { number: 7, lengthOffset: 7, diaOffset: 7 }), geom: { faces: [face3] } });
  const s1 = simulate(pk16, { res: 0.5, stockBox: S0.stockBox });
  const rs = CAM.computeOp({ ...adOp, id: 'r2', optimalLoad: 0.8, stepdown: 8, stockToLeave: 0, entry: { kind: 'helix', angle: 3, helixDia: 3 }, rest: { source: 'stock' } }, { setup: S0, tool: tool4, geom: { faces: [face3] }, stockMap: s1.remainHeightmap });
  ok(rs.stats.cutLen < 0.3 * fullT.stats.cutLen && rs.meta.adaptive.entries === 0, `onceki islem stogu rest: kesme ${rs.stats.cutLen.toFixed(0)} mm, helis yok (bosaltilmis yerden girer)`);
  const model = heightmapFromFn([0, 0], [100, 60], 0.25, (x, y) => ((x > 20 && x < 80 && y > 15 && y < 45) ? -8 : 0));
  const s2 = simulate(rs, { res: 0.25, stockBox: S0.stockBox, modelHeightmap: model, stockHeightmap: simulate(pk16, { res: 0.25, stockBox: S0.stockBox }).remainHeightmap });
  ok(simErrors(s2).length === 0, 'rest sim (onceki stoktan) hatasiz: ' + [...new Set(codes(s2))].join(','));
  // kose kalanlari: D16 sonrasi kose dibi (21,16) yuksek, rest sonrasi tabanda
  const before = sampleHeightmap(simulate(pk16, { res: 0.25, stockBox: S0.stockBox }).remainHeightmap, 21.5, 16.5), after = sampleHeightmap(s2.remainHeightmap, 21.5, 16.5);
  ok(before > -7.9 && after <= -8 + 0.01, `kose (21,5; 16,5): D16 sonrasi ${before.toFixed(2)}, rest sonrasi ${after.toFixed(2)}`);
  const e = engagement(rs, (x, y) => x > 20 && x < 80 && y > 15 && y < 45 && sampleHeightmap(s1.remainHeightmap, x, y) > -8 + 1e-3, [15, 10, 85, 50], 2, -8);
  const th = deg(engageAngle(0.8, 2)), tol = deg(engageAngle(0.8 + rs.meta.adaptive.cell + 0.5, 2));
  ok(e.p99 <= tol && e.max <= tol + 5, `rest temas p99 ${e.p99.toFixed(1)} / max ${e.max.toFixed(1)} (sinir ${th.toFixed(1)}, stok harita payi ile ${tol.toFixed(1)})`);
}
{ // program zinciri (generateProgram): cep D16 + rest uyarlanir D4 ayni setup'ta
  const body = { id: 'b1', vertices: new Float32Array([0, 0, -30, 100, 60, 0]) };
  const cam = { tools: [{ ...flat(16), id: 'T16', number: 7, lengthOffset: 7, diaOffset: 7 }, { ...tool4, id: 'T4' }], setups: [{ id: 's1', name: 'S1', bodies: ['b1'], workOffset: { kind: 'G54' }, stock: { kind: 'box', min: [0, 0, -30], max: [100, 60, 0] }, frame: { origin: { kind: 'model' } }, ops: [
    { ...adOp, id: 'p16', name: 'C16', type: 'pocket', toolId: 'T16', geom: [{ kind: 'face', ref: { body: 'b1', idx: 0 } }], stepover: 6, stepdown: 8, stockToLeave: 0, entry: { kind: 'helix', angle: 3, helixDia: 8 } },
    { ...adOp, id: 'r4', name: 'R4', toolId: 'T4', geom: [{ kind: 'face', ref: { body: 'b1', idx: 0 } }], optimalLoad: 0.8, stepdown: 8, stockToLeave: 0, entry: { kind: 'helix', angle: 3, helixDia: 3 }, rest: { source: 'stock' } }] }] };
  const query = async (cmd) => { if (cmd === 'camFaceLoops') return face3; throw new Error('sorgu yok: ' + cmd); };
  const g = await CAM.generateProgram(cam, { rebuild: { bodies: [body] }, machine: SMP.testMachine(), query, name: 'O1' });
  const o2 = g.ops.find((x) => x.opId === 'r4');
  ok(o2?.ok && o2.toolpath.stats.cutLen < 0.3 * fullT.stats.cutLen, 'program: rest islemi onceki islemin stogunu kullandi: ' + JSON.stringify(o2?.error || o2?.toolpath?.stats?.cutLen));
}

// ---------------------------------------------------------------- 4. yatay temizleme
console.log(`   (${((Date.now() - t0) / 1000).toFixed(0)} sn)`); console.log('4. yatay (duz alan) temizleme');
{
  const fa = { z: -5, normalOk: true, outer: sq(10, 10, 40, 40), inners: [] }, fb = { z: -12, normalOk: true, outer: sq(55, 10, 90, 50, [1]), inners: [], above: [] };
  const fop = { id: 'f1', name: 'YT', type: 'flat', ...base, geom: [{ kind: 'face' }, { kind: 'face' }], stepover: 6, flatTop: 0.5, entry: { kind: 'ramp', angle: 2 } };
  const tf = CAM.computeOp(fop, { setup: S0, tool: tool10, geom: { faces: [fa, fb] } });
  ok(validateToolpath(tf) && tf.opType === 'flat' && tf.meta.flat.levels === 2, 'iki farkli z yuzu tek islemde');
  const zs = [...new Set(tf.moves.filter((m) => m.t === 'feed' && m.kind === 'cut').map((m) => m.z))].sort((a, b) => a - b);
  ok(zs.length === 2 && Math.abs(zs[0] + 12) < 1e-9 && Math.abs(zs[1] + 5) < 1e-9, 'kesme yalniz yuz z\'lerinde: ' + zs);
  ok(Math.max(...tf.moves.filter((m) => m.kind === 'ramp').map((m) => m.z)) <= -5 + 0.5 + 1e-9, 'giris flatTop yuksekliginden');
  // sim: onceki kaba islem yuzlerin 0,5 ustunu birakmis
  const res = 0.25; const inA = (x, y) => x > 10 && x < 40 && y > 10 && y < 40, inB = (x, y) => x > 55 && y > 10 && y < 50;
  const pre = heightmapFromFn([0, 0], [100, 60], res, (x, y) => (inA(x, y) ? -4.5 : inB(x, y) ? -11.5 : 0));
  const model = heightmapFromFn([0, 0], [100, 60], res, (x, y) => (inA(x, y) ? -5 : inB(x, y) ? -12 : 0));
  const sr = simulate(tf, { res, stockBox: S0.stockBox, stockHeightmap: pre, modelHeightmap: model });
  ok(simErrors(sr).length === 0, 'yatay sim hatasiz: ' + [...new Set(codes(sr))].join(','));
  ok(Math.abs(sampleHeightmap(sr.remainHeightmap, 25, 25) + 5) < 1e-6 && Math.abs(sampleHeightmap(sr.remainHeightmap, 70, 30) + 12) < 1e-6, 'yuzler tam olcude');
  throwsCode(() => CAM.computeOp({ ...fop, geom: [{ kind: 'face' }] }, { setup: S0, tool: tool10, geom: { faces: [{ ...fa, z: 0 }] } }), 'cam.flat.nothing', 'stok ustundeki yuz');
}

// ---------------------------------------------------------------- 5. ilerleme iyilestirme
console.log(`   (${((Date.now() - t0) / 1000).toFixed(0)} sn)`); console.log('5. koseda / cikista ilerleme dusurme');
{
  const pop = { id: 'p5', name: 'C5', type: 'pocket', ...base, geom: [{ kind: 'face' }], stepover: 4, stepdown: 5, entry: { kind: 'helix', angle: 3, helixDia: 6 } };
  const face = { z: -5, normalOk: true, outer: sq(20, 15, 80, 45), inners: [] };
  const a = CAM.computeOp(pop, { setup: S0, tool: tool10, geom: { faces: [face] } });
  const b = CAM.computeOp({ ...pop, feedOpt: { corner: { angle: 45, dist: 2, factor: 0.5 } } }, { setup: S0, tool: tool10, geom: { faces: [face] } });
  ok(validateToolpath(b) && b.meta.feedOpt.corners > 0, `kose sayisi ${b.meta.feedOpt.corners}`);
  ok(Math.abs(a.stats.cutLen - b.stats.cutLen) < 1e-6, 'yol uzunlugu degismedi');
  ok(b.stats.timeMin > a.stats.timeMin, 'sure artti (dusuk ilerleme)');
  // dusurulmus hareketler kose noktalarina 2 mm'den yakin; kose noktalarinda ilerleme dusuk
  let farSlow = 0, slow = 0; const cor = [];
  walk(a, (m, k, from) => { if (!from || m.t !== 'feed' || m.kind !== 'cut') return; const nx = a.moves[k + 1]; if (nx && nx.t === 'feed' && nx.kind === 'cut') { const d1 = [m.x - from.x, m.y - from.y], d2 = [nx.x - m.x, nx.y - m.y]; const c = (d1[0] * d2[0] + d1[1] * d2[1]) / (Math.hypot(...d1) * Math.hypot(...d2) || 1); if (c < Math.cos(Math.PI / 4)) cor.push([m.x, m.y]); } });
  walk(a, (m, k, from) => { if (!from || m.t !== 'arc' || m.kind !== 'cut') return; const R = Math.hypot(m.i, m.j); if (R <= 10) for (const q of sampleArc(from, m, 0.01)) cor.push([q[0], q[1]]); });
  walk(b, (m, k, from) => { if (!from || (m.t !== 'feed' && m.t !== 'arc') || m.kind !== 'cut' || !(m.f < 800)) return; slow++; const mid = [(m.x + from.x) / 2, (m.y + from.y) / 2]; if (!cor.some((q) => Math.hypot(q[0] - mid[0], q[1] - mid[1]) <= 2 + 1e-6)) farSlow++; });
  ok(slow > 0 && farSlow === 0, `yavas parca ${slow}, kose disinda ${farSlow}`);
  const ex = CAM.computeOp({ ...pop, feedOpt: { exit: { dist: 3, factor: 0.4 } } }, { setup: S0, tool: tool10, geom: { faces: [face] } });
  // her kalkistan (hizli yukari) once son 3 mm 320 ile
  let okExit = true, nEx = 0;
  ex.moves.forEach((m, k) => { if (m.t === 'rapid' && k > 0 && ex.moves[k - 1].t !== 'rapid' && ex.moves[k - 1].kind === 'cut') { nEx++; if (!(ex.moves[k - 1].f === 320)) okExit = false; } });
  ok(nEx > 0 && okExit, `cikista son hareket F320 (${nEx} cikis)`);
  throwsCode(() => CAM.computeOp({ ...pop, feedOpt: { exit: { dist: 3, factor: 1.5 } } }, { setup: S0, tool: tool10, geom: { faces: [face] } }), 'cam.op.bad_field', 'carpan > 1');
  // post: dusuk F NC'de
  const m = SMP.testMachine(); const prog = CAM.buildProgram({ name: 'O5', machine: m, sections: [{ setup: S0, toolpaths: [b] }] });
  const nc = postProgram(prog, m, { date: '2026-01-01', appVersion: '0.5.0', gates: [] }).text;
  ok(/F400\b/.test(nc) && /F800\b/.test(nc), 'NC hem F800 hem F400 iceriyor');
  // uyarlanir + kose: yay olmayan cok kisa parcalar; uzunluk korunur
  const ad = CAM.computeOp({ ...op2, feedOpt: { corner: { angle: 30, factor: 0.6 }, exit: { dist: 2, factor: 0.5 } } }, { setup: S2, tool: tool10, geom: { faces: [face2] } });
  ok(validateToolpath(ad) && Math.abs(ad.stats.cutLen - tp2.stats.cutLen) < 1e-6 && ad.meta.feedOpt.exits > 0, 'uyarlanir yolda ilerleme iyilestirme');
}

// ---------------------------------------------------------------- 6. ince duvar
console.log(`   (${((Date.now() - t0) / 1000).toFixed(0)} sn)`); console.log('6. ince duvar (kademeli yan paso)');
{
  // 2 mm duvar: dis 40x30, ic bosluk 36x26; dis kontur disaridan, ic kontur iceriden ('all')
  const wall = { z: -9, outer: sq(30, 15, 70, 45), inners: [sq(32, 17, 68, 43).reverse().map((s) => ({ ...s, fwd: false }))] };
  const cop = { id: 'c6', name: 'K6', type: 'contour', ...base, geom: [{ kind: 'face', loops: 'all' }], stepdown: 3, roughPasses: { n: 1, stepover: 1 }, stockToLeave: 0, heights: { clearance: 10, retract: 2, top: { from: 'abs', off: 0 }, bottom: { from: 'abs', off: -9 } } };
  const t6 = flat(6, { number: 8, lengthOffset: 8, diaOffset: 8 });
  const n = CAM.computeOp(cop, { setup: S0, tool: t6, geom: { faces: [wall] } });
  const w = CAM.computeOp({ ...cop, thinWall: { enabled: true } }, { setup: S0, tool: t6, geom: { faces: [wall] } });
  const zSeq = (tp) => tp.moves.filter((m) => m.t === 'feed' && m.kind === 'cut').map((m) => m.z);
  const mono = (a) => a.every((z, i) => i === 0 || z <= a[i - 1] + 1e-9);
  ok(!mono(zSeq(n)) && mono(zSeq(w)), 'ince duvar: kesme z\'si hic yukari donmez (seviye oncelikli); normalde doner');
  ok(Math.abs(n.stats.cutLen - w.stats.cutLen) < 1e-6, 'ayni pasolar, yalniz sira');
  // her seviyede iki yan (dis ve ic) sirayla
  const lv = [-3, -6, -9]; let alt = true;
  for (const z of lv) { const pts = w.moves.filter((m) => m.t === 'feed' && m.kind === 'cut' && Math.abs(m.z - z) < 1e-9); const out = pts.some((m) => m.x < 30 || m.x > 70), inn = pts.some((m) => m.x > 32 && m.x < 68 && m.y > 17 && m.y < 43); if (!(out && inn)) alt = false; }
  ok(alt, 'her kademede duvarin iki yani');
  const ws = CAM.computeOp({ ...cop, thinWall: { enabled: true, axialStep: 1.5 } }, { setup: S0, tool: t6, geom: { faces: [wall] } });
  ok(ws.meta.passDepth <= 1.5 + 1e-9, 'eksenel kademe paso derinligini belirler');
  const inW = (x, y) => x > 30 && x < 70 && y > 15 && y < 45 && !(x > 32 && x < 68 && y > 17 && y < 43);
  const model = heightmapFromFn([0, 0], [100, 60], 0.1, (x, y) => (inW(x, y) ? 0 : -9));
  const sr = simulate(w, { res: 0.1, stockBox: S0.stockBox, modelHeightmap: model });
  ok(simErrors(sr).length === 0, 'ince duvar sim: duvara girilmedi: ' + [...new Set(codes(sr))].join(','));
  ok(sampleHeightmap(sr.remainHeightmap, 31, 30) === 0 && sampleHeightmap(sr.remainHeightmap, 69, 30) === 0, 'duvar ayakta (2 mm)');
}

// ---------------------------------------------------------------- 7. sema
console.log('7. belge semasi');
{
  const doc = { params: [], features: [], cam: { tools: [], setups: [{ id: 's', name: 'S', bodies: [], ops: [
    { id: 'a', type: 'adaptive', optimalLoad: 1, stayDown: true, rest: { source: 'tool', toolDia: 10 }, feedOpt: { corner: { angle: 45, dist: 2, factor: 0.5 }, exit: { dist: 2, factor: 0.5 } } },
    { id: 'f', type: 'flat', flatTop: 1 }, { id: 'c', type: 'contour', thinWall: { enabled: true, axialStep: 1 } }] }] } };
  let err = null; try { validateDoc(doc); } catch (e) { err = e; } ok(!err || !String(err.params?.path || '').includes('ops'), 'yeni alanlar semada: ' + (err ? err.code + JSON.stringify(err.params) : ''));
  let e2 = null; try { validateDoc({ ...doc, cam: { ...doc.cam, setups: [{ ...doc.cam.setups[0], ops: [{ id: 'a', type: 'adaptive', rest: { source: 'yok' } }] }] } }); } catch (e) { e2 = e; } ok(e2 && e2.code === 'schema.bad_field', 'gecersiz rest.source reddedilir');
}

console.log(`\n${pass} gecti, ${fail} kaldi (${((Date.now() - t0) / 1000).toFixed(0)} sn)`);
process.exit(fail ? 1 : 0);
