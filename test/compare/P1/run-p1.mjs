// Fusion-Mihenk CAM karsilastirma testi, P1 (SK8 mil destegi) - MIHENK tarafi.
// Calistir:  node test/compare/P1/run-p1.mjs
// Kurallar: src/** degistirilmez (yalniz public API kullanilir); NC dosyalari TEZGAHA GITMEZ.
// Cikti: test/compare/P1/out/*.nc ve out/p1-mihenk-sonuc.json (rapor bu JSON'dan yazilir).
// Plan: P1-PLAN.md (Fusion tarafiyla ayni girdiler). Plan'da OLMAYAN her deger ASSUMPTIONS listesine yazilir.
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import * as CAM from '../../../src/cam/index.js';
import * as G from '../../../src/shared/geom2d.js';
import { copyMachine, checkMachine } from '../../../src/cam/machines/builtin.js';
import { NEWAY_FIXTURE } from '../../fixtures/machine-neway.mjs';
import { postProgram } from '../../../src/cam/post/index.js';
import { initKernel } from '../../../src/kernel/kernel.js';
import { validateDoc } from '../../../src/shared/schema.js';
import { simulate, heightmapFromFn } from '../../../src/cam/sim/index.js';
import { stockFromPrevious } from '../../../src/cam/sim/chain.js';

const here = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(here, '..', '..', '..');
const OUT = process.env.P1_OUT || path.join(here, 'out'); fs.mkdirSync(OUT, { recursive: true });
const STEP = process.env.P1_STEP || path.join(here, 'in', 'P1_SK8_mil_destegi.step');
const FUSION_JSON = process.env.P1_FUSION_JSON || path.join(here, 'in', 'P1_fusion_rapor.json');
const SUF = '_KARSILASTIRMA_TEZGAHA_GITMEZ';
const R = { baslangic: new Date().toISOString(), varsayim: [], import: {}, makine: {}, setups: [], notlar: [], deneyler: {} };
const now = () => Number(process.hrtime.bigint()) / 1e9;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clone = (x) => JSON.parse(JSON.stringify(x));
const log = (...a) => console.log(...a);
const ASSUME = (k, v, why) => R.varsayim.push({ alan: k, deger: v, neden: why });

// ------------------------------------------------------------------ 1. cekirdek + STEP
const wasm = path.join(ROOT, 'node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
const K = await initKernel(opencascade, () => wasm);
const stepB64 = fs.readFileSync(STEP).toString('base64');

// Sketch yardimcilari (XZ duzlemi: sketch (u,v) = model (X,Z); normal -Y)
function mkSketch(id, items) {
  const points = {}; const ents = []; const key = (p) => p.map((v) => Math.round(v * 1e6)).join(',');
  const pid = new Map(); let n = 0;
  const P = (p) => { const k = key(p); if (!pid.has(k)) { const i = 'p' + (++n); pid.set(k, i); points[i] = { x: p[0], y: p[1] }; } return pid.get(k); };
  items.forEach((it, i) => {
    if (it.t === 'line') ents.push({ id: 'e' + i, type: 'line', a: P(it.a), b: P(it.b) });
    else if (it.t === 'arc') ents.push({ id: 'e' + i, type: 'arc', c: P(it.c), a: P(it.a), b: P(it.b) });
    else if (it.t === 'circle') ents.push({ id: 'e' + i, type: 'circle', c: P(it.c), r: it.r });
  });
  return { id, type: 'sketch', plane: { kind: 'base', name: 'XZ', offset: '0' }, points, ents };
}
const L = (a, b) => ({ t: 'line', a, b }); const A = (c, a, b) => ({ t: 'arc', c, a, b });
// P1 dis siluet (XZ): flans + kule, ust kose R1 (Plan "Geometri")
const OUTLINE = [
  L([-21, 0], [21, 0]), L([21, 0], [21, 5]), A([20, 5], [21, 5], [20, 6]), L([20, 6], [9, 6]), L([9, 6], [9, 31.8]),
  A([8, 31.8], [9, 31.8], [8, 32.8]), L([8, 32.8], [-8, 32.8]), A([-8, 31.8], [-8, 32.8], [-9, 31.8]), L([-9, 31.8], [-9, 6]),
  L([-9, 6], [-20, 6]), A([-20, 5], [-20, 6], [-21, 5]), L([-21, 5], [-21, 0]),
];
const MARGIN = 11; // dis boşaltma cebi: stok dikdortgeni + MARGIN (takim merkezi stok disina erisebilsin)
const STOCK = { x0: -23, x1: 23, z0: -2, z1: 34.8 };
const RECT = [
  L([STOCK.x0 - MARGIN, STOCK.z0 - MARGIN], [STOCK.x1 + MARGIN, STOCK.z0 - MARGIN]), L([STOCK.x1 + MARGIN, STOCK.z0 - MARGIN], [STOCK.x1 + MARGIN, STOCK.z1 + MARGIN]),
  L([STOCK.x1 + MARGIN, STOCK.z1 + MARGIN], [STOCK.x0 - MARGIN, STOCK.z1 + MARGIN]), L([STOCK.x0 - MARGIN, STOCK.z1 + MARGIN], [STOCK.x0 - MARGIN, STOCK.z0 - MARGIN]),
];
const doc = { params: [], features: [
  { id: 'imp', type: 'import', format: 'step', data: stepB64, name: 'P1_SK8_mil_destegi' },
  mkSketch('sOut', OUTLINE),
  mkSketch('sPocket', [...OUTLINE, ...RECT]),
  mkSketch('sBore', [{ t: 'circle', c: [0, 20], r: 4 }]),
  mkSketch('sChamf', [{ t: 'circle', c: [0, 20], r: 3.75 }]),
] };
const t0 = now();
const rb = await K.rebuild(doc);
R.import = { sure_s: r3(now() - t0), durum: rb.status, govde: rb.bodies.map((b) => ({ id: b.id, yuz: b.nFaces, bbox: b.bbox, hacim: r3(b.volume) })), docErrors: rb.docErrors };
const bid = rb.bodies[0]?.id; if (!bid) { console.log('STEP icerisi basarisiz', JSON.stringify(R.import)); process.exit(1); }
{ const [mn, mx] = rb.bodies[0].bbox; R.import.bbox_plan = { beklenen: [[-21, -14, 0], [21, 0, 32.8]], bulunan: [mn.map(r3), mx.map(r3)] }; }
// delik tanima: ice aktarilan govdede 'holes' yok -> elle sentezlenir (Eksik bulgusu)
R.import.rebuild_holes_sayisi = (rb.holes || []).length;
const rbX = { ...rb, holes: [{ feature: 'P1holes', kind: 'simple', dia: 5.5, depth: null, through: true, tipAngle: 118, thread: null, dir: [0, 0, -1], positions: [[16, -7, 6], [-16, -7, 6]], dirs: [[0, 0, -1], [0, 0, -1]], bodies: [[bid], [bid]], count: 2, lost: 0 }] };
// T-05b: elle girilen delik kayitlari ile B-rep taniyicinin (rb.holes, recognized) eslesmesi: ayni eksen (<0,05 mm), cap farki <= 0,1
{
  const recH = (rb.holes || []).filter((h) => h.recognized); const unit = (d) => { const l = Math.hypot(...d); return d.map((x) => x / l); };
  const same = (p, d, q, e) => { const u = unit(d), v = unit(e); if (Math.abs(Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) - 1) > 1e-6) return false; const w = [p[0] - q[0], p[1] - q[1], p[2] - q[2]]; const t = w[0] * v[0] + w[1] * v[1] + w[2] * v[2]; return Math.hypot(w[0] - v[0] * t, w[1] - v[1] * t, w[2] - v[2] * t) < 0.05; };
  const kayit = rbX.holes.map((m) => { const bul = m.positions.map((p, i) => recH.find((r) => Math.abs(r.dia - m.dia) <= 0.1 && r.positions.some((q, j) => same(p, m.dirs[i] || m.dir, q, r.dirs[j] || r.dir)))); return { feature: m.feature, dia: m.dia, konum: m.positions.length, bulunan: bul.filter(Boolean).length, taninan: [...new Set(bul.filter(Boolean).map((r) => `${r.feature} ${r.kind} D${r.dia} ${r.through ? 'thru' : 'd' + r.depth}`))] }; });
  R.delik_tanima = { taninan_kayit: recH.length, taninan_konum: recH.reduce((a, h) => a + h.count, 0), elle_kayit: kayit.length, elle_konum: kayit.reduce((a, k) => a + k.konum, 0), bulunan_konum: kayit.reduce((a, k) => a + k.bulunan, 0), bulunan_kayit: kayit.filter((k) => k.bulunan === k.konum).length, kayit };
  log('delik tanima', JSON.stringify(R.delik_tanima));
}
ASSUME('rebuild.holes (S3 delikleri)', '2x D5.5 (X +-16, Y -7, Z ust 6, yon -Z) elle sentezlendi', 'STEP ice aktarmada delik ozelligi tanimaz; Plan koordinatlari kullanildi');

// ------------------------------------------------------------------ 2. makine (Neway fixture KOPYASI)
const NEWAY = structuredClone(NEWAY_FIXTURE); // K-026: Neway artik yerlesik degil; kullanici profili ornegi (test/fixtures)
const M = copyMachine(NEWAY, 'test-p1-neway-kopya', 'P1 TEST Neway kopyasi (varsayimli)');
const before = clone(M);
M.spindle.maxRpm = 8000; ASSUME('machine.spindle.maxRpm', 8000, 'Plan: devir <= 8000');
M.feed.maxCut = 5000; ASSUME('machine.feed.maxCut', 5000, 'Plan: kesme ilerlemesi <= 5000');
M.feed.rapid = 24000; ASSUME('machine.feed.rapid', 24000, 'Plan\'da yok; yalniz sure tahmini icin test degeri (test/cam-samples ile ayni)');
M.post = { props: { ...M.post.props, safeRetract: 'G28' }}; ASSUME('machine.post.props.safeRetract', 'G28', 'Plan: guvenli cekilme G28 Z');
const mc = checkMachine(M);
R.makine = { kopya_id: M.id, yerlesik_degismedi: JSON.stringify(NEWAY_FIXTURE) === JSON.stringify(NEWAY), checkMachine: mc, hala_null: (() => { const o = []; const walk = (x, p) => { if (x && typeof x === 'object' && !Array.isArray(x)) for (const [k, v] of Object.entries(x)) walk(v, p ? p + '.' + k : k); else if (x === null) o.push(p); }; walk({ spindle: M.spindle, feed: M.feed, toolChange: M.toolChange, post: M.post, axes: M.axes }, ''); return o; })() };

// ------------------------------------------------------------------ 3. takimlar (Plan tablosu; planda olmayan alanlar ASSUME)
const HOLDER = { dia: 40, len: 50 }; ASSUME('tool.holder.len', 50, 'Plan: BT40 O40 silindir; tutucu boyu planda yok -> 50 (test degeri)');
const tl = (n, o) => ({ id: 'T' + n, number: n, lengthOffset: n, diaOffset: n, centerCutting: true, holder: HOLDER, ...o });
const tools = [
  tl(20, { type: 'face', name: 'T20 D50 yuz frezesi 5 agiz', dia: 50, flutes: 5, fluteLen: 10, bodyLen: 40 }),
  tl(21, { type: 'flat', name: 'T21 D12 parmak 3 agiz', dia: 12, flutes: 3, fluteLen: 26, bodyLen: 40 }),
  tl(22, { type: 'flat', name: 'T22 D6 parmak 3 agiz', dia: 6, flutes: 3, fluteLen: 16, bodyLen: 25 }),
  tl(24, { type: 'spot', name: 'T24 D10 punta 90', dia: 10, tipAngle: 90, flutes: 2, fluteLen: 35, bodyLen: 35 }),
  tl(27, { type: 'chamfer', name: 'T27 D10 pah frezesi 90 (uc O0.5 modellenemez)', dia: 10, tipAngle: 90, flutes: 3, fluteLen: 30, bodyLen: 30 }),
  tl(29, { type: 'flat', name: 'T29 D2 parmak 2 agiz', dia: 2, flutes: 2, fluteLen: 6, bodyLen: 16 }),
  tl(30, { type: 'drill', name: 'T30 D5.5 matkap 140', dia: 5.5, tipAngle: 140, flutes: 2, fluteLen: 35, bodyLen: 35 }),
];
ASSUME('T20.fluteLen/bodyLen', '10 / 40', 'Plan: tasma 40; agiz boyu yok -> 10 (test degeri)');
ASSUME('T24.flutes/fluteLen/bodyLen', '2 / 35 / 35', 'Plan: tasma 35; agiz sayisi/boyu yok -> tasma kadar');
ASSUME('T27.flutes/fluteLen/bodyLen', '3 / 30 / 30', 'Plan: tasma 30; agiz sayisi/boyu yok; uc O0.5 icin alan yok (sivri uc varsayilir)');
ASSUME('T30.flutes/fluteLen/bodyLen', '2 / 35 / 35', 'Plan: tasma 35; agiz sayisi/boyu yok -> tasma kadar');
ASSUME('T20/T21/T22/T24/T27/T29/T30 shaftDia', 'verilmedi (= kesici capi, Mihenk varsayilani)', 'Plan\'da sap capi yok');
const simTools = Object.fromEntries(tools.map((t) => [t.number, { holder: HOLDER }]));

// ------------------------------------------------------------------ 4. setup'lar ve islemler
const H = { clearance: 15, retract: 5 }; ASSUME('heights.clearance/retract', '15 / 5 (stok ustunden)', 'Plan\'da yok; Fusion NC\'sindeki Z15/Z5 ile ayni');
const hts = (top, bottom) => ({ ...H, top, bottom });
const T = (f, off = 0) => ({ from: f, off });
const cutd = (rpm, feedCut, feedPlunge) => ({ rpm, feedCut, feedPlunge, coolant: 'flood' });
const sketchSel = (sk, profiles = 'all', loops) => ({ kind: 'sketch', sketch: sk, profiles, ...(loops ? { loops } : {}) });

const S1 = { id: 'S1', name: 'P1-S1 Ust', bodies: [bid], workOffset: { kind: 'G55' }, clearanceZ: 5,
  frame: { zAxis: { kind: 'base', dir: '+Y' }, xAxis: { kind: 'base', dir: '+X' }, origin: { kind: 'stockTopCenter' } },
  stock: { kind: 'boxOffset', side: 2, top: 2, bottom: 2 }, ops: [] };
const S2 = { id: 'S2', name: 'P1-S2 Alt', bodies: [bid], workOffset: { kind: 'G57' }, clearanceZ: 5,
  frame: { zAxis: { kind: 'base', dir: '-Y' }, xAxis: { kind: 'base', dir: '+X' }, origin: { kind: 'stockTopCenter' } },
  stock: { kind: 'boxOffset', side: 2, top: 2, bottom: 2 }, ops: [] };
// S3: A=90 3+1; WCS orijini = dondurulmus yonelimde stok ust merkezi (model (0,-7,34.8)); A ekseni bu noktadan gecer (Mihenk modeli)
const S3 = { id: 'S3', name: 'P1-S3 A90', bodies: [bid], workOffset: { kind: 'G58' }, clearanceZ: 5,
  frame: { zAxis: { kind: 'base', dir: '+Y' }, xAxis: { kind: 'base', dir: '+X' }, origin: { kind: 'point', p: [0, -7, 34.8] } },
  rotary: { enabled: true, aAngle: 90 },
  stock: { kind: 'boxOffset', side: 2, top: 2, bottom: 2 }, ops: [] };
ASSUME('S2 stok', 'S1 ile ayni kutu (46x18x36.8)', 'Mihenk\'te "onceki setup\'tan stok" yok');
ASSUME('S3 stok/orijin', 'ayni kutu; WCS orijini model (0,-7,34.8) = A90 yonelimde stok ust merkezi; A ekseni orijinden gecer', 'Fusion NC\'si de (Z0 = donuk stok ustu) bu sekilde; Mihenk\'te "onceki setup\'tan stok" yok');
ASSUME('S3 aAngle', 'A=+90 (NC A kelimesi)', 'Mihenk A.dir=[-1,0,0] icin etkin eksen +Z model');
ASSUME('S1/S2/S3 clearanceZ', 5, 'setup.clearanceZ planda yok');

const OP = (id, type, name, toolId, rest) => ({ id, type, name, toolId, ...rest });
// --- S1
S1.ops.push(OP('o1', 'face', '1 Yuzey T20', 'T20', { ...cutd(4500, 2250, 750), heights: hts(T('stockTop'), T('modelTop')), stepover: 40, stepdown: 1, stockToLeave: 0, direction: 0, extend: 2 }));
ASSUME('o1 face stepover/direction/extend', '40 / 0 / 2', 'Plan: paso 1 mm (2 paso); stepover/yon/extend planda yok');
S1.ops.push(OP('o2', 'pocket', '2 Dis bosaltma (adaptive karsiligi) T21', 'T21', { ...cutd(8000, 1800, 600), heights: hts(T('modelTop'), T('abs', -16.2)), geom: [sketchSel('sPocket', 'ring')], stepover: 1.2, stepdown: 7.1, stockToLeave: { radial: 0.3, axial: 0 }, entry: { kind: 'ramp', angle: 3 } }));
ASSUME('o2 pocket entry', 'rampa 3 derece', 'Mihenk pocket giris: helix icin alan yok (dar bant); Fusion adaptive helisel/rampa; aci planda yok');
ASSUME('o2 pocket dis duvar', 'stok dikdortgeni + 11 mm (sketch sPocket)', 'Mihenk\'te "stok disinda serbest/acik kenar" yok; ada = parca silueti');
S1.ops.push(OP('o3', 'contour', '3 Kontur bitirme T22', 'T22', { ...cutd(8000, 960, 320), heights: hts(T('modelTop'), T('abs', -16.2)), geom: [sketchSel('sOut', 'all', 'outer')], side: 'outside', dir: 'climb', stepdown: 7.1, stockToLeave: { radial: 0, axial: 0 }, leadIn: { kind: 'arc', r: 3 }, leadOut: { kind: 'arc', r: 3 } }));
ASSUME('o3 lead', 'yay r=3 giris/cikis', 'Plan\'da yok');
S1.ops.push(OP('o4', 'pocket', '4 Bore D8 (helisel) T22', 'T22', { ...cutd(8000, 960, 320), heights: hts(T('modelTop'), T('abs', -16.5)), geom: [sketchSel('sBore', 'all')], stepover: 1, stepdown: 7.25, stockToLeave: { radial: 0, axial: 0 }, entry: { kind: 'helix', helixDia: 2, angle: 9 } }));
ASSUME('o4 helix', 'merkez cap 2 mm, aci 9 derece (~1 mm adim), stepdown 7.25', 'Plan: helis adimi 1 mm; D6 takim D8 delikte merkez yolu r=1');
S1.ops.push(OP('o5', 'contour', '5 Yarik T29 (acik zincir)', 'T29', { ...cutd(8000, 160, 60), heights: hts(T('modelTop'), T('abs', -16.2)), geom: [{ kind: 'chain' }], side: 'on', dir: 'climb', stepdown: 0.5, stockToLeave: { radial: 0, axial: 0 }, ramp: { kind: 'plunge' } }));
S1.ops.push(OP('o6', 'contour', '6 Pah ust T27 (GECICI COZUM: kontur on, r=3.75)', 'T27', { ...cutd(6000, 600, 200), heights: hts(T('modelTop'), T('abs', -2.5)), geom: [sketchSel('sChamf', 'all', 'outer')], side: 'on', dir: 'climb', stepdown: 3, stockToLeave: { radial: 0, axial: 0 }, ramp: { kind: 'plunge' } }));
ASSUME('o6/o8 pah gecici cozum', 'T27 sivri koni; yol: daire r=3.75, uc derinligi 0.5 (gercek uc O0.5 icin 0.5x45)', 'Mihenk\'te pah islemi yok; kontur "on" ile denendi');
// --- S2 (z = -Y; stok ustu Y=-16 -> setup z 0; model ust Y=-14 -> z -2)
S2.ops.push(OP('o7', 'face', '7 Yuzey T20 (alt)', 'T20', { ...cutd(4500, 2250, 750), heights: hts(T('stockTop'), T('modelTop')), stepover: 40, stepdown: 1, stockToLeave: 0, direction: 0, extend: 2 }));
S2.ops.push(OP('o8', 'contour', '8 Pah alt T27 (GECICI COZUM)', 'T27', { ...cutd(6000, 600, 200), heights: hts(T('modelTop'), T('abs', -2.5)), geom: [sketchSel('sChamf', 'all', 'outer')], side: 'on', dir: 'climb', stepdown: 3, stockToLeave: { radial: 0, axial: 0 }, ramp: { kind: 'plunge' } }));
// --- S3 (z = +Z; model flans ustu Z=6 -> setup z = 6-34.8 = -28.8)
S3.ops.push(OP('o9', 'drill', '9 Punta T24', 'T24', { ...cutd(3000, 300, 300), heights: H, holes: { kind: 'feature', filter: { feature: 'P1holes' } }, cycle: 'spot', depth: { from: 'abs', tipComp: false, z: -32.05 }, order: 'asis' }));
S3.ops.push(OP('o10', 'drill', '10 Delme D5.5 T30', 'T30', { ...cutd(3500, 400, 400), heights: H, holes: { kind: 'feature', filter: { feature: 'P1holes' } }, cycle: 'peck', peck: 2, depth: { from: 'abs', tipComp: false, z: -36.801 }, order: 'asis' }));
ASSUME('o9/o10 derinlik', 'abs z -32.05 (punta) / -36.801 (matkap)', 'Fusion NC\'sindeki Z degerleri (stok ustu=0 referansi) ile ayni: 28.8+3.25 / 34.8+1+tip 1.0');

const cam = { machineId: M.id, tools, setups: [S1, S2, S3], verified: null };
// profil indeksi: sPocket'te delikli bolge (halka)
{ const { findRegions } = await import('../../../src/shared/profiles.js'); const sk = doc.features.find((f) => f.id === 'sPocket');
  const reg = findRegions({ points: sk.points, ents: sk.ents }).regions; const ri = reg.findIndex((x) => x.holes.length);
  S1.ops.find((o) => o.id === 'o2').geom = [sketchSel('sPocket', [ri])]; R.notlar.push(`sPocket bolgeleri: ${reg.length}, halka indeksi: ${ri}`); }
const vd = (() => { try { validateDoc({ ...doc, cam }); return 'gecerli'; } catch (e) { return 'GECERSIZ ' + (e.code || e.message) + ' ' + JSON.stringify(e.params || {}); } })();
R.sema = vd;

// ------------------------------------------------------------------ 5. uretim (generateProgram'a esdeger; zincir ve sentetik delik icin kendi donguler)
const query = async (cmd, args) => { if (cmd === 'facePlane') return K.facePlane(args.ref); if (typeof K[cmd] === 'function' && cmd.startsWith('cam')) return K[cmd](args); throw new Error('cmd ' + cmd); };
// T-14: boydan boya delik cikislari (generateProgram ile ayni yol); ortam P_NOEXIT=1 -> eski kural (karsilastirma)
const holesX = process.env.P_NOEXIT ? rbX.holes : await CAM.annotateHoleExits(rbX.holes, query, rbX.bodies.map((b) => b.id));
const toS = (F, p) => { const d = [p[0] - F.o[0], p[1] - F.o[1], p[2] - F.o[2]]; return [0, 1, 2].map((k) => { const a = [F.x, F.y, F.z][k]; return d[0] * a[0] + d[1] * a[1] + d[2] * a[2]; }); };
function chainItem(S) { // yarik: model (0,Y,22) -> (0,Y,35), setup uzayina cevrilmis acik zincir
  const a = toS(S.frame, [0, 0, 22]), b = toS(S.frame, [0, 0, 35]);
  return { segs: [{ ...G.mkLine([a[0], a[1]], [b[0], b[1]]), fwd: true }], closed: false, z: a[2] };
}
const opError = (e) => ({ code: e.code || 'internal', params: e.params || { message: String(e?.message ?? e) } });
const progs = [];
for (const setup of cam.setups) {
  const rec = { id: setup.id, ad: setup.name, wcs: setup.workOffset.kind, islemler: [], gates: [] };
  let S; try { S = CAM.resolveSetup(setup, rbX, M); } catch (e) { rec.setup_hata = opError(e); R.setups.push(rec); continue; }
  rec.cozulmus = { frame: { o: S.frame.o.map(r3), x: S.frame.x.map(r3), y: S.frame.y.map(r3), z: S.frame.z.map(r3) }, aAngle: S.aAngle, stockBox: { min: S.stockBox.min.map(r3), max: S.stockBox.max.map(r3) }, modelBBox: { min: S.modelBBox.min.map(r3), max: S.modelBBox.max.map(r3) }, stockBoyut: S.stockBox.max.map((v, i) => r3(v - S.stockBox.min[i])) };
  const tps = [];
  for (const op of setup.ops) {
    const o = { id: op.id, ad: op.name, tur: op.type, takim: 'T' + tools.find((t) => t.id === op.toolId).number };
    const ta = now();
    try {
      const tool = tools.find((t) => t.id === op.toolId); const geom = {}; let opx = op;
      if (op.type === 'drill') geom.holes = holesX;
      if (op.type === 'contour' || op.type === 'pocket') {
        if (op.geom?.[0]?.kind === 'chain') { // generateProgram/resolveGeom 'chain' desteklemez: once onu dene ve kaydet
          try { await CAM.resolveGeom(op, S, { rebuild: rbX, doc, query }); o.chain_resolveGeom = 'kabul'; } catch (e) { o.chain_resolveGeom = 'REDDETTI ' + (e.code || e.message); }
          geom.items = [chainItem(S)];
        } else { const g = await CAM.resolveGeom(op, S, { rebuild: rbX, doc, query }); geom.faces = g.faces; opx = { ...op, geom: g.sels }; }
      }
      const tp = CAM.computeOp(opx, { setup: S, tool, geom, machine: M });
      o.hesap_s = r3(now() - ta); o.ok = true; o.uyarilar = (tp.warnings || []).map((w) => ({ code: w.code, params: w.params }));
      o.kesme_mm = r3(tp.stats.cutLen); o.hizli_mm = r3(tp.stats.rapidLen); o.sure_s = r3(tp.stats.timeMin * 60); o.zMin = tp.stats.zMin; o.hareket = tp.moves.length; o.passDepth = tp.meta?.passDepth ?? null;
      tps.push(tp);
    } catch (e) { o.hesap_s = r3(now() - ta); o.ok = false; o.hata = opError(e); }
    rec.islemler.push(o);
  }
  rec.S = S; rec.tps = tps; progs.push(rec); R.setups.push(rec);
}

// ------------------------------------------------------------------ 6. kapilar (sim acik) + post
const RES = 0.5; ASSUME('sim.res', RES, 'en kucuk takim yaricapi 1 (T29) -> res <= 1; yarik 2 mm icin 0.5');
for (const rec of progs) {
  const S = rec.S; const num = { S1: 1001, S2: 1002, S3: 1003 }[rec.id];
  if (!rec.tps.length) { rec.program = null; continue; }
  let program; try { program = CAM.buildProgram({ name: 'O' + num, number: num, machine: M, sections: [{ setup: S, toolpaths: rec.tps }] }); } catch (e) { rec.build_hata = opError(e); continue; }
  const bb = [S.stockBox.min[0], S.stockBox.min[1], S.stockBox.max[0], S.stockBox.max[1]];
  const ts = now(); let hm; try { hm = K.camHeightmap({ bodies: [bid], frame: S.frame, res: RES, bbox: bb }); } catch (e) { rec.hm_hata = opError(e); }
  rec.hm_s = r3(now() - ts); rec.hm = hm;
  const tg = now();
  const failed = rec.islemler.filter((o) => !o.ok);
  const gl = CAM.gates(program, M, { sim: { res: RES, modelHeightmaps: hm ? { [S.id]: hm } : undefined, tools: simTools } });
  rec.gates_s = r3(now() - tg);
  rec.gates = gl.map((g) => ({ level: g.level, code: g.code, params: g.params, opId: g.opId ?? null, moveIndex: g.moveIndex ?? null }));
  rec.blocked = CAM.gates && gl.some((g) => g.level === 'block');
  rec.program = program;
  // ek: kalan stok (simulasyon) - model + taban payi ustunde kalan malzeme (kesilmemis alan)
  try {
    const sr = simulate(program, { res: RES, stockBoxes: { [S.id]: S.stockBox }, modelHeightmaps: hm ? { [S.id]: hm } : undefined, tools: simTools });
    const rem = sr.remainBySetup?.[S.id] || sr.remainHeightmap; const floorZ = { S1: -16.2, S2: -2 }[S.id];
    if (floorZ !== undefined && rem && hm && rem.nx === hm.nx) {
      let n = 0, mx = 0, tot = 0; const cell = RES * RES; const pts = [];
      for (let k = 0; k < rem.data.length; k++) { const mz = Math.max(hm.data[k], floorZ); const ex = rem.data[k] - (Number.isFinite(mz) ? mz : -Infinity); if (Number.isFinite(rem.data[k]) && ex > 0.05) { n++; tot += ex * cell; mx = Math.max(mx, ex); pts.push([rem.x0 + ((k % rem.nx) + 0.5) * RES, rem.y0 + (Math.floor(k / rem.nx) + 0.5) * RES, r3(ex)]); } }
      rec.kalan_stok = { floorZ, hucre: n, alan_mm2: r3(n * cell), hacim_mm3: r3(tot), max_fazla_mm: r3(mx), kaldirilan_hacim_mm3: r3(sr.removedVolume), sim_issue_say: sr.issues.length, en_buyuk_fazla_konum: pts.sort((a, b) => b[2] - a[2]).slice(0, 12) };
    }
  } catch (e) { rec.kalan_stok = { hata: opError(e) }; }
  // ek deney (yalniz S3): onceki setup stogu elle (initialHeightmaps) = parca Y-ekstruzyon siluet (flans delikleri henuz yok)
  if (S.id === 'S3' && hm) {
    const top = (X) => { const a = Math.abs(X); if (a < 8) return 32.8; if (a < 9) return 31.8 + Math.sqrt(Math.max(0, 1 - (a - 8) ** 2)); if (a <= 20) return 6; if (a <= 21) return 5 + Math.sqrt(Math.max(0, 1 - (a - 20) ** 2)); return -Infinity; };
    const o = S.frame.o; const stk = heightmapFromFn([bb[0], bb[1]], [bb[2], bb[3]], RES, (x, y) => (Math.abs(y) <= 7 ? top(x) - 34.8 : -Infinity));
    const g2 = CAM.gates(program, M, { sim: { res: RES, modelHeightmaps: { [S.id]: hm }, initialHeightmaps: { [S.id]: stk }, tools: simTools } });
    rec.ek_deney_onceki_setup_stok = g2.map((g) => ({ level: g.level, code: g.code, params: g.params, opId: g.opId ?? null }));
  }
  // post
  const tp0 = now();
  const base = `P1_${{ S1: 'S1_Ust', S2: 'S2_Alt', S3: 'S3_A90' }[rec.id]}_mihenk`;
  try { const nc = postProgram(program, M, { gates: gl, date: '2026-11-19' }); rec.post = { ok: true, s: r3(now() - tp0), dosya: path.join('out', base + SUF + '.nc') }; fs.writeFileSync(path.join(OUT, base + SUF + '.nc'), nc.text); rec.nc = ncStats(nc.text); rec.post.uyarilar = nc.warnings; }
  catch (e) {
    rec.post = { ok: false, s: r3(now() - tp0), hata: opError(e) };
    // Karsilastirma icin: block'lu halin NC yapisini gormek amaciyla block'lar HARIC tutularak uretilir (kod degistirilmez; dosya adi BLOKLU)
    try {
      const warnOnly = gl.filter((g) => g.level !== 'block');
      const nc = postProgram(program, M, { gates: warnOnly, date: '2026-11-19' });
      const hdr = ['(*** BLOKLU: kapilar block verdi -> normalde NC URETILMEZ; yalniz yapi karsilastirmasi icin zorla uretildi ***)', ...gl.filter((g) => g.level === 'block').map((g) => `(BLOCK ${g.code} ${JSON.stringify(g.params).replace(/[()]/g, '')})`)].join('\n') + '\n';
      const f = `${base}_BLOKLU${SUF}.nc`; fs.writeFileSync(path.join(OUT, f), hdr + nc.text); rec.nc_bloklu = { dosya: path.join('out', f), ...ncStats(nc.text) };
    } catch (e2) { rec.nc_bloklu = { hata: opError(e2) }; }
  }
}
function ncStats(text) {
  const lines = text.split(/\r?\n/); const code = lines.map((l) => l.replace(/\([^)]*\)/g, '')).join('\n'); const cnt = (re) => (code.match(re) || []).length;
  const A = [...code.matchAll(/(?:^|\s)A(-?\d+(?:\.\d+)?)/gm)].map((m) => m[1]);
  return { satir: lines.length, G81: cnt(/\bG81\b/g), G83: cnt(/\bG83\b/g), G84: cnt(/\bG84\b/g), G41: cnt(/\bG41\b/g), G42: cnt(/\bG42\b/g), A: A.length, A_degerleri: [...new Set(A)], M6: cnt(/\bM0?6\b/g), M8: cnt(/\bM0?8\b/g) };
}

// T-04 zincir deneyi: tum setup'lar tek programda, sim setup n+1 baslangic stogunu setup n'in son stogundan kurar
// (ana kapi sayilari setup basina ayri program: karsilastirma icin degismez). P_NOCHAIN=1 ile atlanir.
if (!process.env.P_NOCHAIN) {
  const okr = progs.filter((r) => r.program && r.hm);
  try {
    const tz = now(); const pz = CAM.buildProgram({ name: 'OZ', number: 1, machine: M, sections: okr.map((r) => ({ setup: r.S, toolpaths: r.tps })) });
    const gz = CAM.gates(pz, M, { sim: { res: RES, modelHeightmaps: Object.fromEntries(okr.map((r) => [r.S.id, r.hm])), tools: simTools } });
    const by = {}; for (const g of gz) { const id = g.section != null ? pz.sections[g.section].setup.id : 'genel'; const k = `${g.level} ${g.code}`; (by[id] ||= { block: 0, kod: {} }); if (g.level === 'block') by[id].block++; by[id].kod[k] = (by[id].kod[k] || 0) + 1; }
    R.deneyler.T04_zincir = { aciklama: 'tek program, setup zinciri (sim chain)', s: r3(now() - tz), setup: Object.fromEntries(Object.entries(by).map(([id, v]) => [id, { block: v.block, kod: Object.fromEntries(Object.entries(v.kod).filter(([k]) => k.startsWith('block') || k.includes('sim'))) }])) };
  } catch (e) { R.deneyler.T04_zincir = { hata: opError(e) }; }
  log('deney T04_zincir', JSON.stringify(R.deneyler.T04_zincir));
}
// ------------------------------------------------------------------ 7. ek: generateProgram dogrudan (API kullanilabilirligi kaydi)
{
  const gp = {};
  for (const s of cam.setups) {
    const one = { ...cam, setups: [s] };
    const ta = now(); let r;
    try { r = await CAM.generateProgram(one, { rebuild: rbX, machine: M, query, doc, name: 'O' + s.id, sim: false }); gp[s.id] = { s: r3(now() - ta), ops: r.ops.map((o) => ({ id: o.opId, ok: o.ok, hata: o.error ? o.error.code : null })), bloklu: r.blocked }; }
    catch (e) { gp[s.id] = { hata: opError(e) }; }
  }
  R.generateProgram_dogrudan = gp;
}

// ------------------------------------------------------------------ 8. kontrol deneyleri (eksik makine verisi nasil davraniyor)
{
  const k = {}; const s2 = progs.find((r) => r.id === 'S2');
  if (s2?.program) {
    const M2 = clone(M); M2.post.props.safeRetract = null;
    try { postProgram(s2.program, M2, { gates: [], date: '2026-11-19' }); k.safeRetract_null = 'NC uretildi (beklenmedik)'; } catch (e) { k.safeRetract_null = (e.code || e.message) + ' ' + JSON.stringify(e.params || {}); }
    const gl = CAM.gates(s2.program, NEWAY, { sim: false }); k.yerlesik_sablon_kapilari = gl.filter((g) => g.level === 'block').map((g) => g.code + ' ' + JSON.stringify(g.params));
  }
  const s1 = progs.find((r) => r.id === 'S1');
  if (s1?.tps?.length) { // T29 yarik YUZEY islemi olmadan (stok ustu Y=+2): tutucu stoga carpar mi?
    const tp5 = s1.tps.find((t) => t.opId === 'o5'); const P5 = CAM.buildProgram({ name: 'O1', number: 1, machine: M, sections: [{ setup: s1.S, toolpaths: [tp5] }] });
    const bb1 = [s1.S.stockBox.min[0], s1.S.stockBox.min[1], s1.S.stockBox.max[0], s1.S.stockBox.max[1]];
    const hm1 = K.camHeightmap({ bodies: [bid], frame: s1.S.frame, res: RES, bbox: bb1 });
    const g5 = CAM.gates(P5, M, { sim: { res: RES, modelHeightmaps: { S1: hm1 }, tools: simTools } });
    k.T29_yarik_tek_basina = g5.filter((g) => g.level === 'block').map((g) => g.code + ' ' + JSON.stringify(g.params)).filter((v, i, a) => a.findIndex((x) => x.split(' ')[0] === v.split(' ')[0]) === i);
    k.T29_yarik_tek_basina_kod_say = Object.fromEntries([...new Set(g5.map((g) => g.code))].map((c) => [c, g5.filter((g) => g.code === c).length]));
  }
  { // generateProgram ile 'points' delik secimi (STEP'te delik tanima yok): geom.points aktarilmiyor mu?
    const op9 = clone(S3.ops[0]); op9.holes = { kind: 'points' }; op9.depth = { from: 'abs', tipComp: false, z: -32.05 };
    const camP = { ...cam, setups: [{ ...S3, ops: [op9] }] };
    try { const rp = await CAM.generateProgram(camP, { rebuild: rbX, machine: M, query, doc, name: 'O3', sim: false }); k.generateProgram_points_delik = rp.ops.map((o) => (o.ok ? 'ok' : o.error.code)).join(','); }
    catch (e) { k.generateProgram_points_delik = 'istisna ' + (e.code || e.message); }
  }
  R.kontroller = k;
}

// ------------------------------------------------------------------ cikti
R.sure_s = r3(now() - t0);
// WP-21 madde 7: S3 holder_collision x2 siniflamasi. o10 delik dibinde tutucu alti (z dip + T30 tasma) ile tutucu dairesindeki en yuksek
// malzeme uc stok modelinde karsilastirilir: (a) ayri setup (ham kutu, ana kapi sayilari), (b) sim zinciri (stockFromPrevious:
// komsu hucre genisletmesi + yarim hucre yukari yuvarlama), (c) ayni zincir kurali GENISLETMESIZ ve 0,05 mm isin adimiyla
// (onceki setup'larin gercekte biraktigi malzemeye en yakin tahmin), (d) model ust haritasi. P_NOCHAIN=1 ile atlanir.
if (!process.env.P_NOCHAIN) {
  try {
    const ok3 = progs.filter((r) => r.program && r.hm); const i3 = ok3.findIndex((r) => r.S.id === 'S3');
    if (i3 > 0) {
      const S = ok3[i3].S, hm3 = ok3[i3].hm;
      const fin = ok3.slice(0, i3).map((p) => ({ frame: p.S.frame, hm: CAM.advanceStock({ done: 0 }, p.tps, p.S, RES), box: p.S.stockBox }));
      const zin = stockFromPrevious(fin, { frame: S.frame, box: S.stockBox }, RES);
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const toF = (F, q) => { const d = [q[0] - F.o[0], q[1] - F.o[1], q[2] - F.o[2]]; return [dot(d, F.x), dot(d, F.y), dot(d, F.z)]; };
      const fromF = (F, q) => [0, 1, 2].map((k) => F.o[k] + F.x[k] * q[0] + F.y[k] * q[1] + F.z[k] * q[2]);
      const dolu = (P) => { for (const f of fin) { const q = toF(f.frame, P), H = f.hm, B = f.box, e = 1e-6; if (q[0] < B.min[0] - e || q[0] > B.max[0] + e || q[1] < B.min[1] - e || q[1] > B.max[1] + e || q[2] < B.min[2] - e || q[2] > B.max[2] + e) continue; const i = Math.min(H.nx - 1, Math.max(0, Math.floor((q[0] - H.x0) / H.res))), j = Math.min(H.ny - 1, Math.max(0, Math.floor((q[1] - H.y0) / H.res))); const h = H.data[j * H.nx + i]; if (h <= B.min[2] + e || q[2] > h + e) return false; } return true; };
      const ham = (x, y) => { for (let z = S.stockBox.max[2]; z > S.stockBox.min[2]; z -= 0.05) if (dolu(fromF(S.frame, [x, y, z]))) return z; return S.stockBox.min[2]; };
      const o10 = S3.ops.find((o) => o.id === 'o10'), T30 = tools.find((t) => t.id === o10.toolId); const alt = o10.depth.z + T30.bodyLen; const HR = HOLDER.dia / 2;
      const delik = {};
      for (const hx of [16, -16]) {
        const en = { ayri: S.stockBox.max[2], zincir: -Infinity, zincir_genisletmesiz: -Infinity, model: -Infinity };
        for (let j = 0; j < zin.ny; j++) for (let i = 0; i < zin.nx; i++) {
          const x = zin.x0 + (i + 0.5) * RES, y = zin.y0 + (j + 0.5) * RES; if (Math.hypot(x - hx, y) > HR) continue;
          en.zincir = Math.max(en.zincir, zin.data[j * zin.nx + i]); en.zincir_genisletmesiz = Math.max(en.zincir_genisletmesiz, ham(x, y));
          const mi = Math.floor((x - hm3.x0) / hm3.res), mj = Math.floor((y - hm3.y0) / hm3.res); if (mi >= 0 && mj >= 0 && mi < hm3.nx && mj < hm3.ny) en.model = Math.max(en.model, hm3.data[mj * hm3.nx + mi]);
        }
        delik[hx] = Object.fromEntries(Object.entries(en).map(([k, v]) => [k, { en_yuksek: r3(v), bosluk: r3(alt - v) }]));
      }
      R.deneyler.WP21_S3_tutucu = { aciklama: 'o10 dibinde tutucu alti ile tutucu dairesindeki en yuksek malzeme (bosluk < 0: carpisma)', tutucu_alti: r3(alt), tasma: T30.bodyLen, delik };
      log('deney WP21_S3_tutucu', JSON.stringify(R.deneyler.WP21_S3_tutucu));
    }
  } catch (e) { R.deneyler.WP21_S3_tutucu = { hata: opError(e) }; }
}
for (const rec of R.setups) { delete rec.S; delete rec.tps; delete rec.hm; if (rec.program) { rec.tahmini_sure_s = r3(rec.islemler.filter((o) => o.ok).reduce((a, o) => a + o.sure_s, 0)); delete rec.program; } else delete rec.program; }
R.fusion = fs.existsSync(FUSION_JSON) ? JSON.parse(fs.readFileSync(FUSION_JSON, 'utf8')) : null;
if (R.fusion) delete R.fusion.nc;
fs.writeFileSync(path.join(OUT, 'p1-mihenk-sonuc.json'), JSON.stringify(R, null, 1));
// ozet
for (const rec of R.setups) {
  console.log(`\n== ${rec.id} ${rec.ad} (${rec.wcs})`);
  if (rec.setup_hata) { console.log('  SETUP HATA', JSON.stringify(rec.setup_hata)); continue; }
  console.log('  stok', rec.cozulmus.stockBoyut.join('x'), 'frame.z', rec.cozulmus.frame.z.join(','), 'aAngle', rec.cozulmus.aAngle);
  for (const o of rec.islemler) console.log(`  ${o.id} ${o.ad}: ${o.ok ? `ok ${o.hesap_s}s kesme ${o.kesme_mm} hizli ${o.hizli_mm} sure ${o.sure_s}s uyari ${o.uyarilar.map((w) => w.code).join(',')}` : 'HATA ' + o.hata.code + ' ' + JSON.stringify(o.hata.params)}${o.chain_resolveGeom ? ' [chain/resolveGeom: ' + o.chain_resolveGeom + ']' : ''}`);
  for (const g of rec.gates) console.log(`  KAPI ${g.level} ${g.code} ${g.opId || ''} ${JSON.stringify(g.params)}`);
  console.log('  post', JSON.stringify(rec.post), JSON.stringify(rec.nc || rec.nc_bloklu || {}));
}
console.log('\ntoplam s', R.sure_s, 'JSON:', path.join(OUT, 'p1-mihenk-sonuc.json'));
