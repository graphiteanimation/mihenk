// WP-13 sim testleri: baglama govdeleri, tutucu profili, uc yonlu dexel, worker/asenkron sim, G-code uzerinden sim.
// Calistir: node test/sim3d.test.mjs
import { mk } from '../src/cam/ir.js';
import { simulate, createSim, toolGeom, heightmapFromFn, fixtureGrid, resolveFixtures, normalizeFixtures } from '../src/cam/sim/index.js';
import { normalizeTool } from '../src/cam/tools.js';
import { resolveSetup } from '../src/cam/index.js';
import { gates } from '../src/cam/gates.js';
import * as S from './cam-samples/samples.mjs';

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

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
