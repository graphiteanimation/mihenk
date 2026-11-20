// WP-13 sim testleri: baglama govdeleri, tutucu profili, uc yonlu dexel, worker/asenkron sim, G-code uzerinden sim.
// Calistir: node test/sim3d.test.mjs
import { mk } from '../src/cam/ir.js';
import { simulate, createSim, toolGeom, heightmapFromFn, fixtureGrid, resolveFixtures, normalizeFixtures, triVolume, subRay } from '../src/cam/sim/index.js';
import { normalizeTool } from '../src/cam/tools.js';
import { resolveSetup } from '../src/cam/index.js';
import { gates } from '../src/cam/gates.js';
import * as S from './cam-samples/samples.mjs';
import { gcodeToProgram } from '../src/cam/sim/gcode.js';
import { simulateAsync } from '../src/cam/sim/async.js';
import { gatesAsync } from '../src/cam/gates.js';
import { Worker as NodeWorker } from 'node:worker_threads';
import { postProgram } from '../src/cam/post/index.js';
import { resolveProps } from '../src/cam/post/engine.js';
import { getPost } from '../src/cam/post/registry.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const throwsCode = (fn, code, msg) => { try { fn(); ok(false, (msg || code) + ' (hata beklenirdi)'); } catch (e) { ok(e.code === code, `${msg || code}: ${e.code} ${JSON.stringify(e.params)}`); } };
const codes = (r) => [...new Set(r.issues.map((i) => i.code))].sort();
const TP = (tool, moves, over = {}) => mk.toolpath({ tool, rpm: 5000, spindleDir: 'cw', coolant: 'off', clearanceZ: 30, retractZ: 5, moves, ...over });
const BOX = { min: [-20, -20, -30], max: [20, 20, 0] };
const flat6 = { number: 2, H: 2, D: 2, type: 'flat', dia: 6, fluteLen: 15, bodyLen: 30, holder: { dia: 40, len: 50 } };

console.log('1. tutucu profili (kademeli silindir/koni)');
{
  const gc = toolGeom(flat6);
  ok(gc.holderU(10) === 0 && gc.holderU(20) === 0 && gc.holderU(20.5) === Infinity && gc.holderR === 20 && gc.holderLen === 50, 'tek silindir (eski bicim): u=0, zarf R20');
  const cone = { ...flat6, holder: { segments: [{ len: 10, d0: 20, d1: 40 }, { len: 40, d0: 40 }] } };
  const g = toolGeom(cone);
  ok(g.holderR === 20 && g.holderLen === 50, 'profil zarfi: R20, boy 50');
  ok(g.holderU(8) === 0 && Math.abs(g.holderU(15) - 5) < 1e-12 && Math.abs(g.holderU(20) - 10) < 1e-12 && g.holderU(21) === Infinity, 'koni: r15 -> u5, r20 -> u10');
  const st = { ...flat6, holder: { segments: [{ len: 20, d0: 32 }, { len: 30, d0: 50 }] } };
  ok(toolGeom(st).holderU(20) === 20 && toolGeom(st).holderU(10) === 0, 'kademe: r20 ikinci kademede (u=20)');
  throwsCode(() => toolGeom({ ...flat6, holder: { segments: [{ len: 0, d0: 20 }] } }), 'cam.sim.tool_geom', 'bos boylu kademe');
  // tools.js: veri modeli
  const base = { id: 't', number: 1, lengthOffset: 1, type: 'flat', dia: 6, fluteLen: 15, bodyLen: 30, flutes: 3, centerCutting: true };
  const n = normalizeTool({ ...base, holder: { segments: [{ len: 10, d0: 20, d1: 40 }, { len: 40, d0: 40 }] } });
  ok(n.holder.dia === 40 && n.holder.len === 50 && n.holder.segments.length === 2, 'normalizeTool: dia/len profilden turetilir');
  throwsCode(() => normalizeTool({ ...base, holder: { segments: [] } }), 'cam.tool.bad_field', 'bos profil');
  throwsCode(() => normalizeTool({ ...base, holder: { segments: [{ len: 5, d0: -1 }] } }), 'cam.tool.bad_field', 'negatif cap');
  ok(normalizeTool({ ...base, holder: { dia: 40, len: 50 } }).holder.dia === 40, 'eski bicim gecerli');
  // sim: x >= 16 bolgesinde stok ust 0, gerisi -40. Takim (0,0,-33): tutucu tabani -3; r 16..20 malzeme 3 mm ustte.
  const init = heightmapFromFn([-30, -30], [30, 30], 0.25, (x) => (x >= 16 ? 0 : -40));
  const bx = { min: [-30, -30, -45], max: [30, 30, 0] };
  const run = (tool) => simulate(TP(tool, [mk.rapid(0, 0, 30), mk.rapid(0, 0, 1), mk.feed(0, 0, -33, 100, 'plunge'), mk.rapid(0, 0, 30)]), { stockBox: bx, initialHeightmaps: { default: init }, res: 0.25 });
  ok(codes(run(flat6)).includes('cam.sim.holder_collision'), 'silindir tutucu D40: carpma');
  const rc = run(cone);
  ok(!codes(rc).some((c) => /holder_(collision|contact)/.test(c)), 'koni tutucu (D20 -> D40 / 10 mm): carpma yok: ' + codes(rc));
  const cl = rc.sections[0].holderClearance; ok(cl != null && cl > 0 && cl < 10, 'koni: tutucu boslugu profile gore pozitif: ' + cl);
  const r2 = run({ ...cone, holder: { segments: [{ len: 2, d0: 20, d1: 40 }, { len: 48, d0: 40 }] } });
  ok(codes(r2).includes('cam.sim.holder_collision'), 'kisa koni (2 mm): r16 u=1,2 -> carpma kalir');
}

console.log('2. baglama govdeleri: mengene, divizor, ag govde');
{
  const vise = [{ kind: 'box', name: 'cene-sol', min: [-20, -40, -30], max: [20, -20, 5] }, { kind: 'box', name: 'cene-sag', min: [-20, 20, -30], max: [20, 40, 5] }];
  const sim = (moves, o = {}) => simulate(TP(flat6, moves), { stockBox: BOX, res: 0.5, fixtures: { default: vise }, ...o });
  // a) mengene cenesine dalan hizli -> engel
  let r = sim([mk.rapid(0, 0, 30), mk.rapid(0, -30, 30), mk.rapid(0, -30, 2), mk.rapid(0, 0, 30)]);
  let fx = r.issues.filter((i) => i.code === 'cam.sim.fixture_collision');
  ok(fx.length >= 1 && fx[0].level === 'error' && fx[0].params.rapid === true && fx[0].params.part === 'tool' && fx[0].params.fixture === 'cene-sol' && fx[0].moveIndex === 2, 'mengene cenesine dalan hizli engel: ' + JSON.stringify(fx[0]?.params));
  ok(Math.abs(fx[0].params.depth - 3) < 1e-6, 'giris derinligi 3 mm (cene ustu 5, uc 2)');
  // b) cene ustunden gecen hizli (uc z 6): temiz
  r = sim([mk.rapid(0, 0, 30), mk.rapid(0, -30, 30), mk.rapid(0, -30, 6), mk.rapid(0, 0, 6), mk.rapid(0, 0, 30)]);
  ok(!codes(r).some((c) => /fixture/.test(c)), 'cene ustunden 1 mm gecen hizli temiz: ' + codes(r));
  // c) cenelerin arasinda kesme: temiz; cene kenarina yanasan kesme: engel (kesme hareketi)
  r = sim([mk.rapid(0, 0, 30), mk.rapid(-10, 0, 1), mk.feed(-10, 0, -3, 100, 'plunge'), mk.feed(10, 0, -3, 300), mk.rapid(10, 0, 30)]);
  ok(r.issues.length === 0, 'ceneler arasinda kesme temiz: ' + codes(r));
  r = sim([mk.rapid(0, 0, 30), mk.rapid(-10, 0, 1), mk.feed(-10, 0, -3, 100, 'plunge'), mk.feed(-10, -18.5, -3, 300), mk.rapid(-10, -18.5, 30)]);
  fx = r.issues.filter((i) => i.code === 'cam.sim.fixture_collision');
  ok(fx.length >= 1 && fx[0].params.rapid === false && fx[0].moveIndex === 3, 'ceneye 1,5 mm giren kesme engel (hizli degil): ' + JSON.stringify(fx[0]?.params));
  // d) tutucu: derin kesme cene yaninda, kisa takimda tutucu ceneye iner
  const shortT = { ...flat6, fluteLen: 22, bodyLen: 22 };
  const deep = (tool) => simulate(TP(tool, [mk.rapid(0, 16, 30), mk.rapid(0, 16, 1), mk.feed(0, 16, -20, 100, 'plunge'), mk.rapid(0, 16, 30)]), { stockBox: BOX, res: 0.5, fixtures: { default: vise } });
  r = deep(shortT);
  ok(r.issues.some((i) => i.code === 'cam.sim.fixture_holder' && i.params.part === 'holder' && i.level === 'error'), 'tutucu ceneye iner: fixture_holder engel: ' + codes(r));
  r = deep(flat6);
  ok(!codes(r).some((c) => /fixture/.test(c)), 'uzun takim (govde 30): tutucu cene ustunde: ' + codes(r));
  // e) kapali denetim
  r = simulate(TP(flat6, [mk.rapid(0, 0, 30), mk.rapid(0, -30, 30), mk.rapid(0, -30, 2), mk.rapid(0, 0, 30)]), { stockBox: BOX, res: 0.5, fixtures: false });
  ok(!codes(r).some((c) => /fixture/.test(c)), 'fixtures:false kapatir');
  // f) divizor aynasi: X ekseni silindir (merkez -70..-50, D60) — ustunden 1 mm gecen hizli temiz, 2 mm asagisi engel
  const chuck = [{ kind: 'cyl', name: 'ayna', axis: 'X', center: [-70, 0, -15], dia: 60, len: 20 }];
  const ch = (z) => simulate(TP(flat6, [mk.rapid(-60, 0, 30), mk.rapid(-60, 0, z), mk.rapid(-60, 0, 30)]), { stockBox: BOX, res: 0.5, fixtures: { default: chuck } });
  ok(!codes(ch(16)).some((c) => /fixture/.test(c)), 'ayna ustu (15) 1 mm uzak hizli temiz');
  r = ch(13); fx = r.issues.filter((i) => i.code === 'cam.sim.fixture_collision');
  ok(fx.length >= 1 && Math.abs(fx[0].params.depth - 2) < 0.05 && fx[0].params.fixture === 'ayna' && fx[0].moveIndex === 1, 'ayna ustune 2 mm dalis engel: ' + JSON.stringify(fx[0]?.params));
  // g) ag (STEP govdesi) olarak ayni kutu: kutu ile ayni sonuc
  const boxMesh = (mn, mx) => {
    const v = []; for (const z of [mn[2], mx[2]]) for (const y of [mn[1], mx[1]]) for (const x of [mn[0], mx[0]]) v.push(x, y, z);
    const t = [0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5];
    return { kind: 'mesh', name: 'mesh-cene', v: new Float32Array(v), t: new Uint32Array(t) };
  };
  const mv = [mk.rapid(0, 0, 30), mk.rapid(0, -30, 30), mk.rapid(0, -30, 2), mk.rapid(0, 0, 30)];
  const rm = simulate(TP(flat6, mv), { stockBox: BOX, res: 0.5, fixtures: { default: [boxMesh([-20, -40, -30], [20, -20, 5])] } });
  const rb = simulate(TP(flat6, mv), { stockBox: BOX, res: 0.5, fixtures: { default: [vise[0]] } });
  const a = rm.issues.find((i) => i.code === 'cam.sim.fixture_collision'), b = rb.issues.find((i) => i.code === 'cam.sim.fixture_collision');
  ok(a && b && Math.abs(a.params.depth - b.params.depth) < 1e-6 && a.params.fixture === 'mesh-cene', 'ag govde = kutu: ' + JSON.stringify([a?.params.depth, b?.params.depth]));
  const fg = fixtureGrid([boxMesh([0, 0, 0], [10, 10, 10])], 0.5); const k = Math.floor((5 - fg.y0) / fg.res) * fg.nx + Math.floor((5 - fg.x0) / fg.res);
  ok(fg.off[k + 1] - fg.off[k] === 1 && Math.abs(fg.iv[fg.off[k] * 3] - 0) < 1e-6 && Math.abs(fg.iv[fg.off[k] * 3 + 1] - 10) < 1e-6, 'ag isini: [0, 10]');
  // h) yanal: takim kenari ceneye 0,2 mm yaklasir (temas yok) -> hucre buyutmesi nedeniyle erken uyari olabilir ama 1 mm uzak temiz
  r = sim([mk.rapid(0, 0, 30), mk.rapid(0, -16, 30), mk.rapid(0, -16, 0), mk.rapid(0, 0, 0), mk.rapid(0, 0, 30)]);
  ok(!codes(r).some((c) => /fixture/.test(c)), 'ceneye 1 mm yanal mesafede hizli temiz: ' + codes(r));
}

console.log('3. setup fiksturleri: belge bicimi, cerceve, kapi');
{
  const boxV = (mn, mx) => { const v = []; for (const z of [mn[2], mx[2]]) for (const y of [mn[1], mx[1]]) for (const x of [mn[0], mx[0]]) v.push(x, y, z); return new Float32Array(v); };
  const tri = new Uint32Array([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5]);
  const rebuild = { bodies: [{ id: 'part', vertices: boxV([0, 0, 0], [40, 40, 20]), triangles: tri }, { id: 'vise', vertices: boxV([-10, -30, -10], [50, -5, 15]), triangles: tri }] };
  const M = S.testMachine();
  const su = { id: 's1', name: 'S1', bodies: ['part'], workOffset: { kind: 'G54' }, stock: { kind: 'boxOffset', side: 0, top: 0, bottom: 0 }, frame: { origin: { kind: 'stockCorner', corner: 'x-y-z+' } },
    fixtures: [{ kind: 'box', name: 'kutu', min: [0, -20, -30], max: [40, -2, -5] }, { kind: 'body', body: 'vise', name: 'mengene' }] };
  const Sx = resolveSetup(su, rebuild, M);
  ok(Sx.fixtures.length === 2 && Sx.fixtures[0].kind === 'box' && Sx.fixtures[1].kind === 'mesh', 'resolveSetup: kutu + ag');
  // orijin stok kosesi (0,0,20): model govdesi z in [-10,15] -> setup z in [-30,-5]
  let zmn = Infinity, zmx = -Infinity; const v = Sx.fixtures[1].v; for (let i = 2; i < v.length; i += 3) { zmn = Math.min(zmn, v[i]); zmx = Math.max(zmx, v[i]); }
  ok(Math.abs(zmn + 30) < 1e-5 && Math.abs(zmx + 5) < 1e-5, 'govde model -> setup cercevesi: z ' + [zmn, zmx]);
  throwsCode(() => resolveSetup({ ...su, fixtures: [{ kind: 'body', body: 'part' }] }, rebuild, M), 'cam.setup.fixture_is_part', 'islenen govde fikstur olamaz');
  throwsCode(() => resolveSetup({ ...su, fixtures: [{ kind: 'body', body: 'yok' }] }, rebuild, M), 'cam.setup.body_missing', 'olmayan govde');
  throwsCode(() => normalizeFixtures([{ kind: 'box', min: [0, 0, 0], max: [0, 1, 1] }]), 'cam.setup.bad_field', 'bos hacimli kutu');
  throwsCode(() => normalizeFixtures([{ kind: 'cyl', axis: 'W', center: [0, 0, 0], dia: 1, len: 1 }]), 'cam.setup.bad_field', 'gecersiz eksen');
  // A acisi (3+1, divizore bagli): taban cercevede y<0 kutu, A=90 setup'ta parca ile doner
  const MA = { ...M, axes: { ...M.axes, A: { ...(M.axes?.A || {}), kind: 'rotary', about: 'X', dir: [1, 0, 0] } } };
  const sA = resolveSetup({ ...su, fixtures: [su.fixtures[0]], rotary: { enabled: true, aAngle: 90 } }, rebuild, MA);
  const f0 = resolveFixtures([su.fixtures[0]], { frame: Sx.frame, frame0: Sx.frame0 })[0], fA = sA.fixtures[0];
  ok(Math.abs(Math.hypot(...f0.c) - Math.hypot(...fA.c)) < 1e-9 && Math.abs(f0.c[1] - fA.c[1]) > 1, 'A=90: kutu merkezi orijin etrafinda doner: ' + JSON.stringify([f0.c, fA.c]));
  // kapi: program uzerinden (setup.fixtures) mengene carpmasi engel
  const tp = mk.toolpath({ tool: { ...S.TOOLS.flat6, number: 2, H: 2 }, rpm: 5000, spindleDir: 'cw', coolant: 'off', clearanceZ: 30, retractZ: 5, opId: 'o1', opName: 'o1', moves: [mk.rapid(20, -10, 30), mk.rapid(20, -10, -8), mk.rapid(20, -10, 30)] });
  const prog = mk.program({ name: 'FX', number: 1, machine: M.id, sections: [mk.section({ id: 's1', name: 'S1', workOffset: { kind: 'G54' }, aAngle: null, stockBox: Sx.stockBox, fixtures: Sx.fixtures }, tp)] });
  const model = heightmapFromFn([0, 0], [40, 40], 0.5, () => -20);
  const gl = gates(prog, M, { sim: { res: 0.5, modelHeightmaps: { s1: model } } });
  const g1 = gl.find((g) => g.code === 'cam.sim.fixture_collision');
  ok(g1 && g1.level === 'block' && g1.params.fixture === 'kutu', 'kapi: fikstur carpmasi BLOCK: ' + JSON.stringify(g1?.params));
}

console.log('4. G-code uzerinden simulasyon');
{
  const M = S.testMachine(); const props = resolveProps(getPost(M.control), M);
  for (const smp of S.ALL()) {
    const nc = postProgram(smp.program, M, { date: 'x', gates: [] });
    const tools = {}; for (const sc of smp.program.sections) tools[sc.toolpath.tool.number] = sc.toolpath.tool;
    const setups = []; for (const sc of smp.program.sections) if (!setups.find((q) => q.id === sc.setup.id)) setups.push(sc.setup);
    const g = gcodeToProgram(nc.text, { tools, setups, tapMode: props.tapMode });
    const o = { res: 0.25, stockBox: smp.stockBox };
    const r1 = simulate(smp.program, o), r2 = simulate(g.program, o);
    ok(Math.abs(r1.removedVolume - r2.removedVolume) <= 1e-6 * Math.max(1, r1.removedVolume) && r2.issues.length === r1.issues.length, `${smp.name}: NC sim = IR sim (${r1.removedVolume.toFixed(3)} / ${r2.removedVolume.toFixed(3)})`);
    ok(Object.keys(r2.remainBySetup).sort().join() === Object.keys(r1.remainBySetup).sort().join(), `${smp.name}: setup eslesmesi (WCS + A): ` + Object.keys(r2.remainBySetup));
  }
  const T = { 1: { number: 1, H: 1, type: 'flat', dia: 6, fluteLen: 20, bodyLen: 40 } };
  const run = (txt, o = {}) => gcodeToProgram(txt, { tools: T, ...o });
  const box = { min: [-30, -30, -20], max: [30, 30, 0] };
  // tam daire (G17, I): halka hacmi pi (8^2 - 2^2) 2
  let g = run('T1 M6\nS5000 M3\nG0 G90 G54 X5. Y0.\nZ5.\nG1 Z-2. F100\nG2 X5. Y0. I-5. J0. F300\nG0 Z5.\nM30');
  let r = simulate(g.program, { stockBox: box, res: 0.1 });
  ok(Math.abs(r.removedVolume - Math.PI * 60 * 2) / (Math.PI * 120) < 0.02 && r.issues.length === 0, 'tam daire G2 I: halka hacmi ' + r.removedVolume.toFixed(1) + ' ~ ' + (Math.PI * 120).toFixed(1));
  ok(g.program.sections[0].toolpath.moves.filter((m) => m.t === 'arc').length === 2, 'tam daire iki yarim yaya bolunur');
  // R bicimi: (0,0) -> (5,5) R5 CW kucuk yay: merkez (5,0)
  g = run('T1 M6\nS5000 M3\nG0 X0 Y0\nZ5\nG1 Z1 F100\nG2 X5 Y5 R5 F300\nG0 Z5\nM30');
  let a = g.program.sections[0].toolpath.moves.find((m) => m.t === 'arc');
  ok(a && Math.abs(a.i - 5) < 1e-9 && Math.abs(a.j) < 1e-9 && a.dir === 'cw', 'R5 CW kucuk yay merkezi (5,0): ' + JSON.stringify(a && [a.i, a.j]));
  g = run('T1 M6\nS5000 M3\nG0 X0 Y0\nZ5\nG1 Z1 F100\nG2 X5 Y5 R-5 F300\nG0 Z5\nM30'); a = g.program.sections[0].toolpath.moves.find((m) => m.t === 'arc');
  ok(a && Math.abs(a.i) < 1e-9 && Math.abs(a.j - 5) < 1e-9, 'R-5 buyuk yay merkezi (0,5)');
  // G18 yay: X0 Z0 -> X10 Z0, merkez X5 (I5): G2 +Y'den bakista saat yonu -> Z -5'ten gecer
  g = run('T1 M6\nS5000 M3\nG0 X0 Y0\nZ10\nG1 Z0 F100\nG18 G2 X10. Z0. I5. K0. F300\nG17\nG0 Z10\nM30');
  const fz = g.program.sections[0].toolpath.moves.filter((m) => m.t === 'feed'); const zmin = Math.min(...fz.map((m) => m.z));
  ok(fz.length > 10 && Math.abs(zmin + 5) < 0.01 && fz.every((m) => Math.abs(Math.hypot(m.x - 5, m.z) - 5) < 0.003 || (m.x === 0 && m.z === 0)), 'G18 G2 XZ yayi dogru parcalara: en dusuk Z ' + zmin.toFixed(3));
  // G91 artimli + G20 inc
  g = run('T1 M6\nS5000 M3\nG0 G90 X0 Y0\nZ5\nG1 Z-1 F100\nG91 G1 X10. Y-5.\nG90\nG0 Z5\nM30');
  ok(g.program.sections[0].toolpath.moves.some((m) => m.t === 'feed' && m.x === 10 && m.y === -5 && m.z === -1), 'G91 artimli dogrusal');
  g = run('G20\nT1 M6\nS5000 M3\nG0 X1. Y0\nZ0.2\nG1 Z-0.04 F4.\nX2.\nG0 Z0.2\nM30');
  ok(g.program.sections[0].toolpath.moves.some((m) => m.t === 'feed' && Math.abs(m.x - 50.8) < 1e-9 && Math.abs(m.f - 101.6) < 1e-9), 'G20 inc -> mm (konum ve ilerleme)');
  // G99: cevrim sonrasi tezgah R duzleminde; sonraki hizli R yuksekliginde
  g = run('T1 M6\nS5000 M3\nG0 X0 Y0\nZ20\nG99 G81 X0 Y0 Z-5. R2. F100\nX10.\nG80\nG0 X20.\nG0 Z20\nM30');
  const mv = g.program.sections[0].toolpath.moves; const k = mv.findIndex((m) => m.t === 'rapid' && m.x === 20);
  ok(k > 0 && mv[k].z === 2 && mv.filter((m) => m.t === 'cycle').length === 2, 'G99: sonraki hizli R=2 yuksekliginde: ' + JSON.stringify(mv[k]));
  // G98 cevrimi baslangic duzlemine doner
  g = run('T1 M6\nS5000 M3\nG0 X0 Y0\nZ20\nG98 G81 X0 Y0 Z-5. R2. F100\nX10.\nG80\nG0 X20.\nM30');
  ok(g.program.sections[0].toolpath.moves.find((m) => m.t === 'rapid' && m.x === 20).z === 20, 'G98: sonraki hizli baslangic Z=20');
  // G99 cevrimi stok icinde R -> hizli stok icinde yakalanir (yanlis R)
  r = simulate(run('T1 M6\nS5000 M3\nG0 X0 Y0\nZ20\nG99 G81 X0 Y0 Z-5. R-1. F100\nX10.\nG80\nG0 Z20\nM30').program, { stockBox: box, res: 0.25 });
  ok(r.issues.some((i) => i.code === 'cam.sim.rapid_in_stock'), 'G-code sim: stok icindeki R yakalanir: ' + codes(r));
  // satir eslemesi
  g = run('T1 M6\nS5000 M3\nG0 X0 Y0\nZ5\nG1 Z-1 F100\nX10.\nG0 Z5\nM30');
  ok(g.lineMap[5]?.section === 0 && g.program.sections[0].toolpath.moves[g.lineMap[5].move].x === 10, 'satir -> hareket eslemesi');
  // A indeksleme: yeni bolum + setup
  g = run('T1 M6\nS5000 M3\nG0 A0.\nG0 G90 G58 X0 Y0\nZ5\nG1 Z-1 F100\nX5\nG0 Z5\nG0 A90.\nG0 X0 Y0\nG1 Z-1 F100\nX5\nG0 Z5\nM30');
  ok(g.program.sections.length === 2 && g.program.sections[1].setup.aAngle === 90 && g.program.sections[1].setup.id === 'G58@A90', 'A indeksleme: ayri bolum/setup: ' + g.program.sections.map((q) => q.setup.id));
  // hatalar (sessiz atlama yok)
  const bad = [['T1 M6\nS5000 M3\n#1=5\nM30', 'cam.gcode.unsupported', 'makro'], ['T1 M6\nS5000 M3\nM98 P100\nM30', 'cam.gcode.unsupported', 'alt program'], ['T1 M6\nS5000 M3\nG68 X0 Y0 R45\nM30', 'cam.gcode.unsupported', 'G68'],
    ['T1 M6\nS5000 M3\nG0 X0 Y0 Z5\nG1 X10 A5 F100\nM30', 'cam.gcode.a_simultaneous', 'eszamanli A'], ['T9 M6\nS5000 M3\nG0 X0 Y0\nM30', 'cam.gcode.tool_unknown', 'bilinmeyen takim'],
    ['T1 M6\nS5000 M3\nG0 X0 Y0\nZ5\nG1 Z0 F100\nG1 X5 Y0 ,R2\nM30', 'cam.gcode.unsupported', ',R kose'], ['T1 M6\nS5000 M3\nG1 X0 Y0 Z0 F100\nM30', 'cam.gcode.no_position', 'konum bilinmeden G1'],
    ['T1 M6\nS5000 M3\nG0 X0 Y0\nZ5\nG1 Z0 F100\nG2 X10 Y0 I3 J0\nM30', 'cam.gcode.arc_radius', 'yaricap uyusmazligi'], ['T1 M6\nS5000 M3\nG0 X0 Y0\nZ5\nG1 Z0 F100\nG1 G41 D1 X10\nG0 Z5\nM30', 'cam.gcode.rapid_in_comp', 'telafi acikken hizli']];
  for (const [txt, code, m] of bad) throwsCode(() => run(txt), code, 'hata: ' + m);
}

console.log('5. uc yonlu dexel: geriye uyum, yan yuz, alt kesme');
{
  // a) geriye uyum: tum orneklerde ayni sorunlar, ayni hacim, birebir ayni ust yuzey; X/Y hacmi Z hacmiyle %0,1 icinde
  for (const smp of S.ALL()) {
    const o = { res: 0.25, stockBox: smp.stockBox };
    const a = simulate(smp.program, o), b = simulate(smp.program, { ...o, dexel: 'tri' });
    let md = 0; for (const id of Object.keys(a.remainBySetup)) { const A = a.remainBySetup[id].data, B = b.remainBySetup[id].data; for (let k = 0; k < A.length; k++) md = Math.max(md, Math.abs(A[k] - B[k])); }
    ok(md === 0 && Math.abs(a.removedVolume - b.removedVolume) < 1e-6 * Math.max(1, a.removedVolume) && JSON.stringify(codes(a)) === JSON.stringify(codes(b)) && a.issues.length === b.issues.length, `${smp.name}: tri = yukseklik haritasi (hacim, sorun, ust yuzey; fark ${md})`);
    const vd = Object.values(b.triBySetup).map((T) => Math.max(Math.abs(triVolume(T, 'x') - triVolume(T, 'z')), Math.abs(triVolume(T, 'y') - triVolume(T, 'z'))) / triVolume(T, 'z'));
    ok(Math.max(...vd) < 1e-3, `${smp.name}: X/Y/Z dexel hacimleri tutarli (en buyuk bagil fark ${Math.max(...vd).toExponential(2)})`);
  }
  // b) yan yuz: D6,2 kanal (Y boyunca, x=0); X isinlari duvari +-3,1'de surekli konumda verir (harita hucreye yuvarlar)
  const t62 = { number: 3, H: 3, type: 'flat', dia: 6.2, fluteLen: 20, bodyLen: 40 };
  const slot = TP(t62, [mk.rapid(0, -30, 30), mk.rapid(0, -30, 1), mk.feed(0, -30, -5, 100, 'plunge'), mk.feed(0, 30, -5, 300), mk.rapid(0, 30, 30)]);
  let r = simulate(slot, { stockBox: BOX, res: 0.5, dexel: 'tri' }); const T = r.triBySetup.default;
  const k = Math.floor((-2.5 - T.z0) / T.res), j = Math.floor((0 - T.y0) / T.res), ray = T.xr[k * T.ny + j];
  ok(ray.length === 4 && Math.abs(ray[1] + 3.1) < 1e-6 && Math.abs(ray[2] - 3.1) < 1e-6, 'X isini duvarlari -3,1 / 3,1: ' + JSON.stringify(ray.map((v) => +v.toFixed(4))));
  // c) V-24: duvar hucre sinirinda (D6 -> +-3,0; res 0,5), ayni takimla 0,2 mm yana kaymis hizli inis: harita gormez, tri yakalar
  const f6 = { number: 2, H: 2, type: 'flat', dia: 6, fluteLen: 20, bodyLen: 40 };
  const lat = TP(f6, [mk.rapid(0, -30, 30), mk.rapid(0, -30, 1), mk.feed(0, -30, -5, 100, 'plunge'), mk.feed(0, 30, -5, 300), mk.rapid(0, 30, 30), mk.rapid(0.2, 0, 30), mk.rapid(0.2, 0, -4), mk.rapid(0.2, 0, 30)]);
  const rh = simulate(lat, { stockBox: BOX, res: 0.5 }), rt = simulate(lat, { stockBox: BOX, res: 0.5, dexel: 'tri' });
  const hit = rt.issues.find((i) => i.code === 'cam.sim.rapid_in_stock');
  ok(!codes(rh).includes('cam.sim.rapid_in_stock'), 'yukseklik haritasi 0,2 mm yanal girisi gormez (V-24 siniri, belgeli)');
  ok(hit && hit.moveIndex === 6 && Math.abs(hit.params.depth - 0.2) < 0.02, 'tri dexel 0,2 mm yanal hizli girisi yakalar: ' + JSON.stringify(hit?.params));
  const rt2 = simulate(TP(f6, [...lat.moves.slice(0, 5), mk.rapid(0, 0, 30), mk.rapid(0, 0, -4), mk.rapid(0, 0, 30)]), { stockBox: BOX, res: 0.5, dexel: 'tri' });
  ok(!codes(rt2).includes('cam.sim.rapid_in_stock'), 'kanal ekseninde hizli inis temiz (teget duvar yanlis engel degil): ' + codes(rt2));
  // d) alt kesme: B (+X yanindan) X 10..20, Z -18..-12 kanal; C (ustten, zincir) Z isininda bosluk; dalma hacmi boslugu atlar
  const FB = { o: [20, 0, 0], x: [0, 1, 0], y: [0, 0, 1], z: [1, 0, 0] }, FC = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const boxB = { min: [-20, -30, -40], max: [20, 0, 0] }, boxC = { min: [-20, -20, -30], max: [20, 20, 0] };
  const f6l = { ...f6, fluteLen: 40, bodyLen: 60 };
  const secB = mk.section({ id: 'B', workOffset: { kind: 'G55' }, aAngle: null, frame: FB, stockBox: boxB }, TP(f6l, [mk.rapid(-30, -15, 30), mk.rapid(-30, -15, -10), mk.feed(30, -15, -10, 300), mk.rapid(30, -15, 30)]));
  const secC = mk.section({ id: 'C', workOffset: { kind: 'G54' }, aAngle: null, frame: FC, stockBox: boxC }, TP(f6l, [mk.rapid(15, 0, 30), mk.rapid(15, 0, 1), mk.feed(15, 0, -20, 100, 'plunge'), mk.rapid(15, 0, 30)]));
  const prog = mk.program({ name: 'UC', sections: [secB, secC] });
  const so = { res: 0.5, stockBoxes: { B: boxB, C: boxC } };
  const ph = simulate(prog, so), pt = simulate(prog, { ...so, dexel: 'tri' });
  const TC = pt.triBySetup.C, zc = TC.zr[Math.floor((10 - TC.y0) / TC.res) * TC.nx + Math.floor((15 - TC.x0) / TC.res)];
  ok(pt.chainedSetups.includes('C') && zc.length === 4 && Math.abs(zc[1] + 18) <= 0.5 && Math.abs(zc[2] + 12) <= 0.5, 'C Z isininda alt kesme boslugu (iki aralik): ' + JSON.stringify(zc));
  const cH = ph.removedVolume, cT = pt.removedVolume;
  const bOnly = simulate(mk.program({ name: 'UC', sections: [secB] }), so).removedVolume;
  const dH = cH - bOnly, dT = cT - bOnly; // C dalmasinin hacmi
  ok(Math.abs(dH - Math.PI * 9 * 20) / (Math.PI * 9 * 20) < 0.03, 'harita: C dalmasi 20 mm dolu sayilir: ' + dH.toFixed(1));
  // zincir uyeligi muhafazakar (kaynak isinlari res/2 genisletilir): bosluk en cok 1 res daralir -> 14..15,5 mm
  ok(dT > Math.PI * 9 * 13.9 && dT < Math.PI * 9 * 15.6, 'tri: C dalmasi boslugu atlar (14..15,5 mm): ' + (dT / (Math.PI * 9)).toFixed(2) + ' mm');
  // e) isin araligi cikarma
  const q = [0, 10]; ok(subRay(q, 2, 3) === 1 && JSON.stringify(q) === '[0,2,3,10]' && subRay(q, -5, 2.5) === 2 && JSON.stringify(q) === '[3,10]', 'subRay');
}

console.log('6. G76 ince delik / G87 arka havsa (WP-14 IR cevrimleri)');
{
  const bx = { min: [-20, -20, -30], max: [20, 20, 0] };
  const pre = heightmapFromFn([-20, -20], [20, 20], 0.25, (x, y) => (Math.hypot(x, y) <= 5 ? -30 : 0)); // O10 boydan boya on delik
  const bore14 = { number: 5, H: 5, type: 'bore', dia: 14, fluteLen: 5, bodyLen: 60 };
  const bb = (shift, cutTo = -25) => TP(bore14, [mk.rapid(0, 0, 30), mk.rapid(0, 0, 10), mk.cycle({ cycle: 'backBore', points: [[0, 0]], top: cutTo, bottom: -32, cutTo, retract: 10, clearance: 10, f: 80, shift }), mk.rapid(0, 0, 30)]);
  const run = (tp, o = {}) => simulate(tp, { stockBox: bx, initialHeightmaps: { default: pre }, res: 0.25, ...o });
  let r = run(bb(2.5), { dexel: 'tri' });
  const want = Math.PI * (49 - 25) * 5;
  ok(Math.abs(r.removedVolume - want) / want < 0.04, 'G87 tri: alttan havsa hacmi ' + r.removedVolume.toFixed(1) + ' ~ ' + want.toFixed(1));
  ok(!r.issues.some((i) => i.level === 'error'), 'G87: kaydirilmis inis delige degmez (R7 - 2,5 < 5): ' + codes(r));
  ok(r.issues.some((i) => i.code === 'cam.sim.below_stock' && i.level === 'warn'), 'G87: stok tabani alti baslangic uyari (engel degil)');
  const T = r.triBySetup.default, zr = T.zr[Math.floor((0 - T.y0) / T.res) * T.nx + Math.floor((6 - T.x0) / T.res)];
  ok(zr.length === 2 && Math.abs(zr[0] + 25) < 1e-6 && zr[1] === 0, 'G87 tri: r=6 sutununda malzeme yalniz [-25, 0] (alttan acilan havsa): ' + JSON.stringify(zr));
  r = run(bb(2.5));
  ok(r.removedVolume === 0 && !r.issues.some((i) => i.level === 'error'), 'G87 yukseklik haritasi: alttan kesim temsil edilemez -> malzeme kalir (muhafazakar)');
  r = run(bb(1));
  ok(r.issues.some((i) => i.code === 'cam.sim.rapid_in_stock' && i.level === 'error'), 'G87: kayma yetersiz (R7 - 1 > 5): hizli inis delige carpar: ' + codes(r));
  // G76: kesme D10 ile, dipte kaydirilip hizli cikis
  const fb = TP({ ...bore14, dia: 10 }, [mk.rapid(0, 0, 30), mk.rapid(0, 0, 10), mk.cycle({ cycle: 'fineBore', points: [[0, 0]], top: 0, bottom: -20, retract: 2, clearance: 10, f: 80, shift: 0.3 }), mk.rapid(0, 0, 30)]);
  const pre4 = heightmapFromFn([-20, -20], [20, 20], 0.25, (x, y) => (Math.hypot(x, y) <= 4 ? -30 : 0));
  r = simulate(fb, { stockBox: bx, initialHeightmaps: { default: pre4 }, res: 0.25 });
  const w2 = Math.PI * (25 - 16) * 20;
  ok(Math.abs(r.removedVolume - w2) / w2 < 0.04 && !r.issues.some((i) => i.level === 'error'), 'G76: delik buyutme hacmi ve temiz cikis: ' + r.removedVolume.toFixed(1) + ' ~ ' + w2.toFixed(1) + ' ' + codes(r));
  // G-code: G76 / G87 okunur
  const g = gcodeToProgram('T5 M6\nS800 M3\nG0 G90 G54 X0 Y0\nZ10.\nG98 G76 X0 Y0 Z-20. R2. Q0.3 F80.\nG80\nG98 G87 X0 Y0 Z-25. R-32. Q2.5 F80.\nG80\nG0 Z30.\nM30', { tools: { 5: bore14 } });
  const cy = g.program.sections[0].toolpath.moves.filter((m) => m.t === 'cycle');
  ok(cy.length === 2 && cy[0].cycle === 'fineBore' && cy[0].shift === 0.3 && cy[1].cycle === 'backBore' && cy[1].bottom === -32 && cy[1].cutTo === -25 && cy[1].retract === cy[1].clearance && cy[1].shift === 2.5, 'G-code G76/G87 -> IR fineBore/backBore: ' + JSON.stringify(cy.map((c) => [c.cycle, c.bottom, c.cutTo, c.shift])));
  const r2 = simulate(g.program, { stockBox: bx, initialHeightmaps: { 'G54': pre }, res: 0.25, dexel: 'tri' });
  ok(r2.removedVolume > 0 && !r2.issues.some((i) => i.level === 'error'), 'G-code G76+G87 sim: ' + codes(r2));
}

console.log('7. asenkron / worker simulasyon, iptal');
{
  const smp = S.pocketHelixSample(); const o = { stockBox: smp.stockBox, res: 0.25 };
  const ref = simulate(smp.program, o);
  // gercek is parcacigi (node worker_threads; tarayicidaki Worker ile ayni protokol worker-core.js)
  const nodeWorker = () => { const w = new NodeWorker(new URL('../src/cam/sim/worker-node.mjs', import.meta.url)); const o2 = { postMessage: (m) => w.postMessage(m), terminate: () => w.terminate(), onmessage: null, onerror: null }; w.on('message', (m) => o2.onmessage?.({ data: m })); w.on('error', (e) => o2.onerror?.(e)); return o2; };
  let prog = 0; const rw = await simulateAsync(smp.program, o, { worker: nodeWorker, chunk: 5, onProgress: () => prog++ });
  ok(Math.abs(rw.removedVolume - ref.removedVolume) < 1e-9 && rw.issues.length === ref.issues.length && prog > 1, 'worker sonucu = simulate (ilerleme ' + prog + ')');
  ok(rw.remainHeightmap && rw.remainHeightmap === rw.remainBySetup[Object.keys(rw.remainBySetup)[0]] && rw.remainHeightmap.data instanceof Float32Array, 'worker: kalan harita aktarildi');
  const ri = await simulateAsync(smp.program, o, { worker: false, chunk: 50 });
  ok(Math.abs(ri.removedVolume - ref.removedVolume) < 1e-9, 'worker yok (node): dilimli ayni is parcaciginda ayni sonuc');
  // iptal: worker ve dilimli yol
  for (const wk of [nodeWorker, false]) {
    const ac = new AbortController(); let n = 0;
    try { await simulateAsync(smp.program, o, { worker: wk, chunk: 5, signal: ac.signal, onProgress: () => { if (++n === 3) ac.abort(); } }); ok(false, 'iptal beklenirdi'); }
    catch (e) { ok(e.code === 'cam.sim.cancelled' && n >= 3, 'iptal (' + (wk ? 'worker' : 'dilimli') + '): ' + e.code); }
  }
  // worker icinde hata kodu korunur
  try { await simulateAsync(smp.program, { res: 0.5 }, { worker: nodeWorker }); ok(false, 'hata beklenirdi'); } catch (e) { ok(e.code === 'cam.sim.no_stock', 'worker hata kodu: ' + e.code); }
  // gatesAsync = gates
  const M = S.testMachine(); const model = heightmapFromFn([smp.stockBox.min[0], smp.stockBox.min[1]], [smp.stockBox.max[0], smp.stockBox.max[1]], 0.5, () => -30);
  const so = { sim: { res: 0.5, modelHeightmaps: { [smp.program.sections[0].setup.id]: model } } };
  const g1 = gates(smp.program, M, so), g2 = await gatesAsync(smp.program, M, so, { worker: nodeWorker });
  ok(JSON.stringify(g1) === JSON.stringify(g2), 'gatesAsync (worker) = gates: ' + g1.length);
  const ac = new AbortController(); ac.abort();
  try { await gatesAsync(smp.program, M, so, { signal: ac.signal }); ok(false, 'iptal'); } catch (e) { ok(e.code === 'cam.sim.cancelled', 'gatesAsync iptal'); }
}

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
