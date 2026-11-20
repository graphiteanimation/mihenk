// Fusion-Mihenk CAM karsilastirma testi, P2 (NIST FTC-08 tepsi) - MIHENK tarafi.
// Calistir:  node test/compare/P2/run-p2.mjs        (env: P2_STEP, P2_FUSION_JSON, P2_OUT, P2_RES)
// Kurallar: src/** degistirilmez (yalniz public API kullanilir); NC dosyalari TEZGAHA GITMEZ.
// Cikti: test/compare/P2/out/*.nc ve out/p2-mihenk-sonuc.json (rapor bu JSON'dan yazilir).
// Plan: P2-PLAN.md (Fusion tarafiyla ayni girdiler). Plan'da OLMAYAN her deger ASSUMPTIONS listesine yazilir.
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import * as CAM from '../../../src/cam/index.js';
import { copyMachine, checkMachine } from '../../../src/cam/machines/builtin.js';
import { NEWAY_FIXTURE } from '../../fixtures/machine-neway.mjs';
import { postProgram } from '../../../src/cam/post/index.js';
import { initKernel } from '../../../src/kernel/kernel.js';
import { validateDoc } from '../../../src/shared/schema.js';
import { simulate } from '../../../src/cam/sim/index.js';
import { findRegions } from '../../../src/shared/profiles.js';

const here = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(here, '..', '..', '..');
const OUT = process.env.P2_OUT || path.join(here, 'out'); fs.mkdirSync(OUT, { recursive: true });
const STEP = process.env.P2_STEP || path.join(here, 'in', 'P2_NIST_FTC08_tepsi.stp');
const FUSION_JSON = process.env.P2_FUSION_JSON || path.join(here, 'in', 'P2_fusion_rapor.json');
const RES = Number(process.env.P2_RES || 1.0);
const SUF = '_KARSILASTIRMA_TEZGAHA_GITMEZ';
const R = { baslangic: new Date().toISOString(), varsayim: [], import: {}, makine: {}, setups: [], notlar: [], esleme: [] };
const now = () => Number(process.hrtime.bigint()) / 1e9;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clone = (x) => JSON.parse(JSON.stringify(x));
const ASSUME = (k, v, why) => R.varsayim.push({ alan: k, deger: v, neden: why });
const log = (...a) => console.log(...a);

// ------------------------------------------------------------------ 1. cekirdek + STEP
const wasm = path.join(ROOT, 'node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
const K = await initKernel(opencascade, () => wasm);
const stepB64 = fs.readFileSync(STEP).toString('base64');
const doc = { params: [], features: [{ id: 'imp', type: 'import', format: 'step', data: stepB64, name: 'P2_NIST_FTC08_tepsi' }] };
const t0 = now();
const rb0 = await K.rebuild(doc);
R.import = { sure_s: r3(now() - t0), durum: rb0.status, govde: rb0.bodies.map((b) => ({ id: b.id, yuz: b.nFaces, bbox: b.bbox, hacim: r3(b.volume) })), docErrors: rb0.docErrors };
const bid = rb0.bodies[0]?.id; if (!bid) { log('STEP icerisi basarisiz', JSON.stringify(R.import)); process.exit(1); }
{ const [mn, mx] = rb0.bodies[0].bbox; R.import.bbox_plan = { beklenen: [[-155.8, -111.35, 0], [155.8, 111.35, 48.26]], bulunan: [mn.map(r3), mx.map(r3)], hacim_plan: 503592 }; }
R.import.rebuild_holes_sayisi = (rb0.holes || []).length;

// ------------------------------------------------------------------ 2. geometri: kernel kesitlerinden (camSection) eskiz uretimi
// Sketch (Plan "Geometri"si kernel kesitleriyle okundu: model uzayinda kimlik cerceve; z = kesit yuksekligi).
const ID = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const section = (z) => K.camSection({ body: bid, frame: ID, z }).loops;
const bbox = (loop) => { let mn = [1e9, 1e9], mx = [-1e9, -1e9]; for (const g of loop) { const ps = g.type === 'arc' ? [[g.c[0] - g.r, g.c[1] - g.r], [g.c[0] + g.r, g.c[1] + g.r]] : [g.p0, g.p1]; for (const p of ps) { mn = [Math.min(mn[0], p[0]), Math.min(mn[1], p[1])]; mx = [Math.max(mx[0], p[0]), Math.max(mx[1], p[1])]; } } return { mn, mx, w: mx[0] - mn[0], h: mx[1] - mn[1] }; };
const near = (v, t, tol = 0.15) => Math.abs(v - t) <= tol;
const bySize = (loops, w, h, tol) => loops.filter((l) => { const b = bbox(l); return (near(b.w, w, tol) && near(b.h, h, tol)) || (near(b.w, h, tol) && near(b.h, w, tol)); });
function mkSketch(id, z, loops, extra = []) {
  const points = {}; const ents = []; const key = (p) => p.map((v) => Math.round(v * 1e5)).join(','); const pid = new Map(); let n = 0;
  const P = (p) => { const k = key(p); if (!pid.has(k)) { const i = 'p' + (++n); pid.set(k, i); points[i] = { x: p[0], y: p[1] }; } return pid.get(k); };
  let ei = 0;
  for (const loop of loops) {
    const arcs = loop.filter((g) => g.type === 'arc');
    if (loop.length === 2 && arcs.length === 2 && Math.abs(arcs[0].r - arcs[1].r) < 1e-6) { ents.push({ id: 'e' + (ei++), type: 'circle', c: P(arcs[0].c), r: arcs[0].r }); continue; }
    for (const g of loop) {
      if (g.type === 'line') ents.push({ id: 'e' + (ei++), type: 'line', a: P(g.p0), b: P(g.p1) });
      else ents.push({ id: 'e' + (ei++), type: 'arc', c: P(g.c), a: P(g.p0), b: P(g.p1) });
    }
  }
  for (const it of extra) ents.push({ id: 'e' + (ei++), type: 'line', a: P(it[0]), b: P(it[1]) });
  return { id, type: 'sketch', plane: { kind: 'base', name: 'XY', offset: String(z) }, points, ents };
}
const rectLoop = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]];
const STOCK = { x: 157.8, y: 113.35 }; const MARGIN = 11; // stok yarim olculeri (315,6 x 226,7) ve dis bosaltma cebi payi
const OUTR = rectLoop(-(STOCK.x + MARGIN), -(STOCK.y + MARGIN), STOCK.x + MARGIN, STOCK.y + MARGIN);

const sec5 = section(5), sec20 = section(20), secCeil = section(44.828), sec48 = section(48);
const flangeLoop = bySize(sec5, 311.6, 222.7, 0.2)[0];
const cavLoop = bySize(sec20, 279.34, 192.22, 0.2)[0];
const wallLoop = bySize(sec20, 292.04, 204.92, 0.2)[0];
const ceilLoop = [...secCeil].sort((a, b) => bbox(a).w - bbox(b).w)[0];
const winLoop = bySize(sec48, 151.9, 126.5, 0.2)[0]; const circLoop = bySize(sec48, 32.74, 30.56, 0.2)[0];
const sqLoop = bySize(sec48, 27.94, 27.94, 0.2)[0]; const key1 = bySize(sec48, 25.4, 31.75, 0.2)[0]; const key2 = bySize(sec48, 20.32, 31.75, 0.2)[0];
const chLoop = bySize(sec48, 12.7, 158.76, 0.2)[0];
const holeLoops = sec48.filter((l) => { const b = bbox(l); return b.w < 7 && b.h < 7 && l.length === 2; });
if (!flangeLoop || !cavLoop || !wallLoop || !ceilLoop || !winLoop || !circLoop || !sqLoop || !key1 || !key2 || !chLoop || holeLoops.length !== 16) { log('GEOMETRI SINIFLANDIRMA BASARISIZ', { flangeLoop: !!flangeLoop, cavLoop: !!cavLoop, wallLoop: !!wallLoop, ceilLoop: !!ceilLoop, winLoop: !!winLoop, circLoop: !!circLoop, sqLoop: !!sqLoop, key1: !!key1, key2: !!key2, chLoop: !!chLoop, holes: holeLoops.length }); process.exit(1); }
R.geometri = { flans: bbox(flangeLoop), bosluk_duvar: bbox(cavLoop), dis_duvar: bbox(wallLoop), tavan_duz_sinir: { w: r3(bbox(ceilLoop).w), h: r3(bbox(ceilLoop).h) }, pencere: bbox(winLoop), yuvarlak_kama: bbox(circLoop), kare: bbox(sqLoop), anahtar1: bbox(key1), anahtar2: bbox(key2), kanal: bbox(chLoop), delik16: holeLoops.length, delik_capi: [...new Set(holeLoops.map((l) => r3(2 * l[0].r)))].sort() };
ASSUME('geometri/eskizler', 'kernel camSection kesitlerinden (z=5 flans, z=20 duvarlar, z=44,828 tavan duz bolgesi, z=48 pencere/delik/kanal) otomatik sinif', 'Mihenk\'te STEP\'ten yuz/dongu secimi yuz adi (ref) ister; STEP iceri aktarmada ad yok -> kesit eskizi');
ASSUME('tavan duz sinir (sCeil)', 'z=44,828 kesiti (tavan 44,83\'un 0,002 alti): boslugun R3,05 tavan yuvarlatmasi basladigi yerde duz bolge siniri; hata yatay ~0,1 mm, yukseklik ~0,002 mm', 'camFaceLoops yuz ref gerektirir; kesitle yaklasik');

doc.features.push(
  mkSketch('sRing1', 0, [flangeLoop], OUTR),                 // S1 dis bosaltma: stok+11 dikdortgen, ada = flans siluet
  mkSketch('sRing2', 20, [wallLoop], OUTR),                  // S2 dis bosaltma: ada = ust duvar siluet
  mkSketch('sCav', 20, [cavLoop]),                           // ic bosluk duvar siniri
  mkSketch('sCeil', 44.828, [ceilLoop]),                     // tavan duz bolgesi
  mkSketch('sFlange', 5, [flangeLoop]),                      // flans siluet (yan kontur)
  mkSketch('sWall', 20, [wallLoop]),                         // ust duvar siluet (kontur)
  mkSketch('sWinCirc', 48, [winLoop, circLoop]),             // pencere + Ø30,56/kama
  mkSketch('sCh', 48, [chLoop]),                             // kanal
  mkSketch('sKeys', 48, [sqLoop, key1, key2]),               // kare + 2 anahtar deligi
  mkSketch('sHoles', 48, holeLoops),                         // 16 delik
);
const ringIdx = (id) => { const sk = doc.features.find((f) => f.id === id); const reg = findRegions({ points: sk.points, ents: sk.ents }).regions; return { idx: reg.findIndex((x) => x.holes.length), n: reg.length }; };
const rg1 = ringIdx('sRing1'), rg2 = ringIdx('sRing2'); R.notlar.push(`sRing1 bolge sayisi ${rg1.n}, halka idx ${rg1.idx}; sRing2 bolge sayisi ${rg2.n}, halka idx ${rg2.idx}`);
const tR = now(); const rb = await K.rebuild(doc); R.import.rebuild_eskizlerle_s = r3(now() - tR); R.import.docErrors2 = rb.docErrors;
// delik tanima: ice aktarilan govdede 'holes' yok -> 4 flans deligi elle sentezlenir
const FH = [[142.875, 98.425], [-142.875, 98.425], [-142.875, -98.425], [142.875, -98.425]];
const rbX = { ...rb, holes: [{ feature: 'P2flansDelik', kind: 'simple', dia: 6.045, depth: 11.16, through: false, tipAngle: 118, thread: null, dir: [0, 0, 1], positions: FH.map((p) => [p[0], p[1], 0]), dirs: FH.map(() => [0, 0, 1]), bodies: FH.map(() => [bid]), count: 4, lost: 0 }] };
// T-05b: elle girilen delik kayitlari ile B-rep taniyicinin (rb.holes, recognized) eslesmesi: ayni eksen (<0,05 mm), cap farki <= 0,1
{
  const recH = (rb.holes || []).filter((h) => h.recognized); const unit = (d) => { const l = Math.hypot(...d); return d.map((x) => x / l); };
  const same = (p, d, q, e) => { const u = unit(d), v = unit(e); if (Math.abs(Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) - 1) > 1e-6) return false; const w = [p[0] - q[0], p[1] - q[1], p[2] - q[2]]; const t = w[0] * v[0] + w[1] * v[1] + w[2] * v[2]; return Math.hypot(w[0] - v[0] * t, w[1] - v[1] * t, w[2] - v[2] * t) < 0.05; };
  const kayit = rbX.holes.map((m) => { const bul = m.positions.map((p, i) => recH.find((r) => Math.abs(r.dia - m.dia) <= 0.1 && r.positions.some((q, j) => same(p, m.dirs[i] || m.dir, q, r.dirs[j] || r.dir)))); return { feature: m.feature, dia: m.dia, konum: m.positions.length, bulunan: bul.filter(Boolean).length, taninan: [...new Set(bul.filter(Boolean).map((r) => `${r.feature} ${r.kind} D${r.dia} ${r.through ? 'thru' : 'd' + r.depth}`))] }; });
  R.delik_tanima = { taninan_kayit: recH.length, taninan_konum: recH.reduce((a, h) => a + h.count, 0), elle_kayit: kayit.length, elle_konum: kayit.reduce((a, k) => a + k.konum, 0), bulunan_konum: kayit.reduce((a, k) => a + k.bulunan, 0), bulunan_kayit: kayit.filter((k) => k.bulunan === k.konum).length, kayit };
  log('delik tanima', JSON.stringify(R.delik_tanima));
}
ASSUME('rebuild.holes (S1 flans delikleri)', '4x Ø6,045 (X +-142,875, Y +-98,425), giris Z=0, yon +Z (S1 takim ekseni -Z), derinlik 11,16 = flans 10,16 + 1 mm kirilma (blind kaydi; breakThrough yalniz through deliklerde isler, drill.js:82-83)', 'STEP ice aktarmada delik ozelligi tanimaz; through:true olsaydi Mihenk model tabanina kadar (Z48,26) deler (deney asagida)');

// ------------------------------------------------------------------ 3. makine (Neway fixture KOPYASI)
const NEWAY = structuredClone(NEWAY_FIXTURE); // K-026: Neway artik yerlesik degil; kullanici profili ornegi (test/fixtures)
const M = copyMachine(NEWAY, 'test-p2-neway-kopya', 'P2 TEST Neway kopyasi (varsayimli)');
M.spindle.maxRpm = 8000; ASSUME('machine.spindle.maxRpm', 8000, 'Plan: devir <= 8000');
M.feed.maxCut = 5000; ASSUME('machine.feed.maxCut', 5000, 'Plan: kesme ilerlemesi <= 5000');
M.feed.rapid = 24000; ASSUME('machine.feed.rapid', 24000, 'Plan\'da yok; yalniz sure tahmini icin test degeri (P1 ile ayni)');
M.post = { props: { ...M.post.props, safeRetract: 'G28' } }; ASSUME('machine.post.props.safeRetract', 'G28', 'Fusion post: safePositionMethod = G28');
R.makine = { kopya_id: M.id, yerlesik_degismedi: JSON.stringify(NEWAY_FIXTURE) === JSON.stringify(NEWAY), checkMachine: checkMachine(M) };

// ------------------------------------------------------------------ 4. takimlar
const HOLDER = { dia: 40, len: 50 }; ASSUME('tool.holder', 'O40 x 50 (P1 ile ayni)', 'Plan: BT40 O40 silindir; tutucu boyu planda yok');
const tl = (n, o) => ({ id: 'T' + n, number: n, lengthOffset: n, diaOffset: n, centerCutting: true, holder: HOLDER, ...o });
const tools = [
  tl(20, { type: 'face', name: 'T20 D50 yuz frezesi 5 agiz', dia: 50, flutes: 5, fluteLen: 10, bodyLen: 40 }),
  tl(22, { type: 'flat', name: 'T22 D6 parmak 3 agiz', dia: 6, flutes: 3, fluteLen: 16, bodyLen: 25 }),
  tl(24, { type: 'spot', name: 'T24 D10 punta 90', dia: 10, tipAngle: 90, flutes: 2, fluteLen: 35, bodyLen: 35 }),
  tl(28, { type: 'flat', name: 'T28 D3 parmak 2 agiz', dia: 3, flutes: 2, fluteLen: 9, bodyLen: 15 }),
  tl(31, { type: 'flat', name: 'T31 D12 parmak 3 agiz UZUN', dia: 12, flutes: 3, fluteLen: 30, bodyLen: 55 }),
  tl(32, { type: 'bullnose', name: 'T32 D12 R3 koseli 3 agiz UZUN', dia: 12, cornerR: 3, flutes: 3, fluteLen: 30, bodyLen: 55 }),
  tl(33, { type: 'drill', name: 'T33 D6,1 matkap 140', dia: 6.1, tipAngle: 140, flutes: 2, fluteLen: 40, bodyLen: 40 }),
];
ASSUME('T20 / T22 / T24', 'P1 ile ayni (T20 agiz boyu 10/gövde 40; T22 16/25; T24 2 agiz 35/35)', 'Plan: "ortak listeden"; P1 degerleri');
ASSUME('T28 (D3 parmak)', '2 agiz, agiz boyu 9, gövde 15', 'Plan\'da yalniz D3; boy/agiz sayisi yok (tasma >= 5,93 derinlik icin yeterli secildi)');
ASSUME('T31/T32/T33', 'Plan tablosu: agiz 30, tasma 55 (T31/T32); T33 agiz 40 = tasma 40, 2 agiz; T32 cornerR 3 (bullnose)', 'T33 agiz boyu planda yok (tasma 40 alindi)');
ASSUME('shaftDia', 'verilmedi (= kesici capi)', 'Plan\'da sap capi yok');
const simTools = Object.fromEntries(tools.map((t) => [t.number, { holder: HOLDER }]));

// ------------------------------------------------------------------ 5. setup'lar ve islemler
const H = { clearance: 15, retract: 5 }; ASSUME('heights.clearance/retract', '15 / 5 (stok ustunden)', 'Plan\'da yok (P1 ile ayni)');
const hts = (top, bottom) => ({ ...H, top, bottom });
const T = (f, off = 0) => ({ from: f, off }); const ABS = (z) => ({ from: 'abs', off: z });
const cutd = (rpm, feedCut, feedPlunge) => ({ rpm, feedCut, feedPlunge, coolant: 'flood' });
const sk = (id, profiles = 'all', loops) => ({ kind: 'sketch', sketch: id, profiles, ...(loops ? { loops } : {}) });
const LEAD = { kind: 'arc', r: 3 }; ASSUME('contour leadIn/leadOut', 'yay r=3 (T28 islerinde r=1)', 'Plan\'da yok');
const z1 = (Zm) => r3(-(Zm + 2));      // S1 (takim ekseni -Z, orijin stok ustu = model Z -2)
const z2 = (Zm) => r3(Zm - 50.26);     // S2 (takim ekseni +Z, orijin stok ustu = model Z 50,26)

const S1 = { id: 'S1', name: 'P2-S1 Ic', bodies: [bid], workOffset: { kind: 'G55' }, clearanceZ: 5,
  frame: { zAxis: { kind: 'base', dir: '-Z' }, xAxis: { kind: 'base', dir: '+X' }, origin: { kind: 'stockTopCenter' } },
  stock: { kind: 'boxOffset', side: 2, top: 2, bottom: 2 }, ops: [] };
const S2 = { id: 'S2', name: 'P2-S2 Ust', bodies: [bid], workOffset: { kind: 'G57' }, clearanceZ: 5,
  frame: { zAxis: { kind: 'base', dir: '+Z' }, xAxis: { kind: 'base', dir: '+X' }, origin: { kind: 'stockTopCenter' } },
  stock: { kind: 'boxOffset', side: 2, top: 2, bottom: 2 }, ops: [] };
ASSUME('S1/S2 clearanceZ', 5, 'setup.clearanceZ planda yok');
ASSUME('S2 stok', 'S1 ile ayni kutu (315,6 x 226,7 x 52,26); Fusion "onceki setup\'tan stok" kullandi', 'Mihenk\'te "onceki setup\'tan stok" yok (alt kesme/tek degerli harita); S1 kesimleri S2 simulasyonunda yoktur');
ASSUME('S2 yonu', 'zAxis +Z, xAxis +X, orijin stok ust merkezi; G57', 'Plan: G57, takim ekseni +Z');
ASSUME('S1 yonu', 'zAxis -Z, xAxis +X, orijin stok ust merkezi; G55', 'Plan: G55, takim ekseni model -Z');

const OP = (id, type, name, toolId, rest, alts = []) => ({ id, type, name, toolId, alts, ...rest });
const POCKET_LEAVE = { radial: 0.3, axial: 0.2 }, NOLEAVE = { radial: 0, axial: 0 };
// --- S1 (setup z = -(modelZ + 2))
S1.ops.push(OP('o1', 'face', '1 Yuzey T20', 'T20', { ...cutd(4500, 2250, 750), heights: hts(T('stockTop'), T('modelTop')), stepover: 40, stepdown: 1, stockToLeave: 0, direction: 0, extend: 2 }));
S1.ops.push(OP('o2', 'pocket', '2a Adaptive karsiligi: flans cevresi + stok kabugu T31 (cep, Z45e)', 'T31', { ...cutd(8000, 1500, 500), heights: hts(T('modelTop'), ABS(z1(45))), geom: [sk('sRing1', [rg1.idx])], stepover: 1.2, stepdown: 12, stockToLeave: { radial: 0.3, axial: 0 }, entry: { kind: 'ramp', angle: 3 } },
  [{ entry: { kind: 'plunge' } }]));
S1.ops.push(OP('o3', 'pocket', '2b Adaptive karsiligi: bosluk kaba (duvar, Z41,78e) T31', 'T31', { ...cutd(8000, 1500, 500), heights: hts(T('modelTop'), ABS(z1(41.78))), geom: [sk('sCav')], stepover: 1.2, stepdown: 12, stockToLeave: POCKET_LEAVE, entry: { kind: 'helix', helixDia: 10, angle: 3 } },
  [{ entry: { kind: 'ramp', angle: 3 } }, { entry: { kind: 'plunge' } }]));
S1.ops.push(OP('o3b', 'pocket', '2c Adaptive karsiligi: bosluk kaba (tavan duz bolge, Z44,83e) T31', 'T31', { ...cutd(8000, 1500, 500), heights: hts(ABS(r3(z1(41.78) + 0.2)), ABS(z1(44.83))), geom: [sk('sCeil')], stepover: 1.2, stepdown: 12, stockToLeave: POCKET_LEAVE, entry: { kind: 'helix', helixDia: 10, angle: 3 } },
  [{ entry: { kind: 'ramp', angle: 3 } }, { entry: { kind: 'plunge' } }]));
S1.ops.push(OP('o4', 'pocket', '3 Yatay temizleme karsiligi: tavan duz bolge T32 (cep)', 'T32', { ...cutd(8000, 1500, 500), heights: hts(ABS(r3(z1(44.83) + 0.2)), ABS(z1(44.83))), geom: [sk('sCeil')], stepover: 5, stepdown: 1, stockToLeave: NOLEAVE, entry: { kind: 'helix', helixDia: 10, angle: 3 } },
  [{ entry: { kind: 'ramp', angle: 3 } }, { entry: { kind: 'plunge' } }]));
S1.ops.push(OP('o5a', 'contour', '4a 3D kontur karsiligi: bosluk duvarlari T32 (2,5D kontur ic, Z41,78e)', 'T32', { ...cutd(8000, 1500, 500), heights: hts(T('modelTop'), ABS(z1(41.78))), geom: [sk('sCav', 'all', 'outer')], side: 'inside', dir: 'climb', stepdown: 1, stockToLeave: NOLEAVE, leadIn: LEAD, leadOut: LEAD }));
S1.ops.push(OP('o5b', 'contour', '4b 3D kontur karsiligi: flans yani T32 (2,5D kontur dis, Z10,16ya)', 'T32', { ...cutd(8000, 1500, 500), heights: hts(T('modelTop'), ABS(z1(10.16))), geom: [sk('sFlange', 'all', 'outer')], side: 'outside', dir: 'climb', stepdown: 1, stockToLeave: NOLEAVE, leadIn: LEAD, leadOut: LEAD }));
S1.ops.push(OP('o6', 'drill', '5 Punta T24 (4x flans deligi, 1,5 derin)', 'T24', { ...cutd(3000, 300, 300), heights: H, holes: { kind: 'feature', filter: { feature: 'P2flansDelik' } }, cycle: 'spot', depth: { from: 'abs', tipComp: false, z: z1(1.5) }, order: 'asis' }));
S1.ops.push(OP('o7', 'drill', '6 Delme T33 G83 Q3 (4x, boydan boya +1)', 'T33', { ...cutd(3500, 420, 420), heights: H, holes: { kind: 'feature', filter: { feature: 'P2flansDelik' } }, cycle: 'peck', peck: 3, depth: { from: 'hole', tipComp: true, breakThrough: 1 }, order: 'asis' }));
ASSUME('o2 ring (S1)', 'pocket: dis duvar = stok+11 mm dikdortgen, ada = flans silueti; taban Z45 (setup z -47); radyal pay 0,3, eksenel 0; stepdown 12, stepover 1,2; rampa 3 derece', 'Fusion adaptive alt Z45 / optimal yuk 1,2 / paso 12 / pay 0,3-0,2; Mihenk\'te adaptive yok; flans cevresi icin eksenel pay anlamsiz (model yok) -> 0');
ASSUME('o3 / o3b (S1 bosluk kaba)', 'iki kademeli 2,5D: duvar bolgesi Z41,78e (tavan R3,05 yuvarlatmasi baslangici), tavan duz bolgesi (sCeil) Z44,83e; pay 0,3 radyal / 0,2 eksenel; helis dia 10 (merkez), aci 3', 'Mihenk 3D yuzey izlemez; R3,05 tavan yuvarlatmasi tek-z cep ile oyulmasin diye iki kademe');
ASSUME('o4 (yatay temizleme)', 'T32 cep, sCeil, Z44,83, stepover 5 (duz yaricap 3 -> cap 6 icinde), stepdown 1, pay 0', 'Fusion yatay temizleme parametresi planda yok');
ASSUME('o5a/o5b (3D kontur karsiligi)', 'kontur ic (bosluk, Z41,78e) / dis (flans, Z10,16ya), paso 1 mm, yay lead r3, pay 0', 'Plan: 3D kontur paso 1; tavan R3,05 yuvarlatmasi Mihenk\'te yapilamaz');
ASSUME('o6 punta', 'cycle spot, abs z (tipComp false) = setup z -3,5 (stok ustunden 3,5; flans yuzu -2\'den 1,5 derin)', 'Fusion: bottom -3,5 stok ustunden');
ASSUME('o7 delme', 'cycle peck 3; depth from hole tipComp true breakThrough 1; delik kaydi blind (depth 11,16 = 10,16 + 1; breakThrough alani blind delikte etkisiz)', 'Fusion: deep-drilling, peck 3, drillTipThroughBottom, breakThrough 1; through:true olsa model tabanina (Z48,26) iner (deney asagida)');

// --- S2 (setup z = modelZ - 50,26)
S2.ops.push(OP('o8', 'face', '7 Yuzey T20 (ust)', 'T20', { ...cutd(4500, 2250, 750), heights: hts(T('stockTop'), T('modelTop')), stepover: 40, stepdown: 1, stockToLeave: 0, direction: 0, extend: 2 }));
S2.ops.push(OP('o9', 'pocket', '8a Adaptive karsiligi: duvar disi T31 (cep, flans ustune Z10,16)', 'T31', { ...cutd(8000, 1500, 500), heights: hts(T('modelTop'), ABS(z2(10.16))), geom: [sk('sRing2', [rg2.idx])], stepover: 1.2, stepdown: 12, stockToLeave: POCKET_LEAVE, entry: { kind: 'ramp', angle: 3 } },
  [{ entry: { kind: 'plunge' } }]));
S2.ops.push(OP('o9b', 'pocket', '8b Adaptive karsiligi: pencere + O30,56 kaba T31 (cep, Z44,33e)', 'T31', { ...cutd(8000, 1500, 500), heights: hts(T('modelTop'), ABS(z2(44.33))), geom: [sk('sWinCirc', 'all')], stepover: 1.2, stepdown: 4, stockToLeave: { radial: 0.3, axial: 0 }, entry: { kind: 'helix', helixDia: 10, angle: 3 } },
  [{ entry: { kind: 'ramp', angle: 3 } }, { entry: { kind: 'plunge' } }]));
S2.ops.push(OP('o10', 'pocket', '9 Yatay temizleme karsiligi: flans ustu T32 (cep, Z10,16)', 'T32', { ...cutd(8000, 1500, 500), heights: hts(ABS(r3(z2(10.16) + 0.2)), ABS(z2(10.16))), geom: [sk('sRing2', [rg2.idx])], stepover: 5, stepdown: 1, stockToLeave: { radial: 0.3, axial: 0 }, entry: { kind: 'plunge' } },
  [{ entry: { kind: 'ramp', angle: 3 } }]));
S2.ops.push(OP('o11', 'contour', '10 3D kontur karsiligi: dis duvarlar T32 (2,5D kontur dis, Z10,16ya)', 'T32', { ...cutd(8000, 1500, 500), heights: hts(T('modelTop'), ABS(z2(10.16))), geom: [sk('sWall', 'all', 'outer')], side: 'outside', dir: 'climb', stepdown: 1, stockToLeave: NOLEAVE, leadIn: LEAD, leadOut: LEAD }));
S2.ops.push(OP('o12', 'contour', '11 2D kontur pencere + yuvarlak T22 (ic, Z44,33)', 'T22', { ...cutd(8000, 960, 320), heights: hts(T('modelTop'), ABS(z2(44.33))), geom: [sk('sWinCirc', 'all', 'outer')], side: 'inside', dir: 'climb', stepdown: 4, stockToLeave: NOLEAVE, leadIn: LEAD, leadOut: LEAD }));
S2.ops.push(OP('o13', 'contour', '12 2D kontur kanal T22 (ic, Z46,99)', 'T22', { ...cutd(8000, 960, 320), heights: hts(T('modelTop'), ABS(z2(46.99))), geom: [sk('sCh', 'all', 'outer')], side: 'inside', dir: 'climb', stepdown: 2, stockToLeave: NOLEAVE, leadIn: LEAD, leadOut: LEAD }));
S2.ops.push(OP('o14', 'contour', '13 2D kontur kare + anahtar T28 (ic, Z44,33, paso 2)', 'T28', { ...cutd(8000, 320, 100), heights: hts(T('modelTop'), ABS(z2(44.33))), geom: [sk('sKeys', 'all', 'outer')], side: 'inside', dir: 'climb', stepdown: 2, stockToLeave: NOLEAVE, leadIn: { kind: 'arc', r: 1 }, leadOut: { kind: 'arc', r: 1 } },
  [{ leadIn: { kind: 'none' }, leadOut: { kind: 'none' } }]));
S2.ops.push(OP('o15', 'pocket', '14 Bore (helis) 16 delik T28 (cep + helis giris, Z44,33)', 'T28', { ...cutd(8000, 320, 100), heights: hts(T('modelTop'), ABS(z2(44.33))), geom: [sk('sHoles', 'all')], stepover: 1, stepdown: 4, stockToLeave: NOLEAVE, entry: { kind: 'helix', helixDia: 2.2, angle: 4 } },
  [{ entry: { kind: 'ramp', angle: 4 } }]));
ASSUME('o9 ring (S2)', 'pocket: dis duvar stok+11, ada = ust duvar silueti (z=20 kesiti), taban flans ustu Z10,16; pay 0,3/0,2; rampa 3 derece', 'Fusion adaptive alt Z9,5 (flans ustu 10,16\'nin 0,66 alti, flans disinda); Mihenk tek-z cep -> flans ustu + pay');
ASSUME('o9b pencere kaba', 'pocket T31, pencere + Ø30,56/kama bolgeleri, Z44,33e kadar, pay 0,3 radyal; helis dia 10', 'Plan: "pencereler kaba" (Fusion adaptive pencere bosluklarini da boşaltır varsayimi); kare + anahtar delikleri yalniz T28 konturuna birakildi (Fusion op 13 ile ayni)');
ASSUME('o10', 'T32 cep, flans ustu, stepover 5, radyal pay 0,3 (duvar o11 konturuna birakildi), dalma', 'Fusion yatay temizleme parametresi planda yok. Ilk denemede radyal pay 0 idi: o9\'un biraktigi 0,3 mm duvar payi 38 mm boyunca kesildi -> cam.sim.flute_exceeded x7 (block); pay 0,3 yapildi');
ASSUME('o11 (3D kontur karsiligi)', 'kontur dis, sWall, Z10,16ya (Plan alt Z7 flans icine inerdi), paso 1, pay 0', 'Mihenk 2,5D: Z7 flansa oyar; 3D yuzey izleme yok -> flans ustunde durdu. Plan notu: Z7');
ASSUME('o12/o13/o14', 'kontur ic (side inside), tek derinlikte pas (stepdown 4 / 2 / 2 -> o14 paso 2), pay 0, bilgisayar telafisi (Fusion compensation=left, onizleme "in computer" varsayildi)', 'Fusion log: compensation=left; Mihenk comp varsayilani computer');
ASSUME('o15 bore', 'pocket + helis giris (merkez dia 2,2, aci 4 derece ~ 0,5 mm adim), stepover 1, stepdown 4 (tek paso), pay 0', 'Fusion bore threadPitch 0,5; Mihenk\'te bore islemi yok, kontur helis desteklemez (cam.op.unsupported)');

const cam = { machineId: M.id, tools, setups: [S1, S2], verified: null };
const vd = (() => { try { validateDoc({ ...doc, cam }); return 'gecerli'; } catch (e) { return 'GECERSIZ ' + (e.code || e.message) + ' ' + JSON.stringify(e.params || {}); } })();
R.sema = vd; log('sema', vd);

// ------------------------------------------------------------------ 6. uretim
const query = async (cmd, args) => { if (cmd === 'facePlane') return K.facePlane(args.ref); if (typeof K[cmd] === 'function' && cmd.startsWith('cam')) return K[cmd](args); throw new Error('cmd ' + cmd); };
// T-14: boydan boya delik cikislari (generateProgram ile ayni yol); ortam P_NOEXIT=1 -> eski kural (karsilastirma)
const holesX = process.env.P_NOEXIT ? rbX.holes : await CAM.annotateHoleExits(rbX.holes, query, rbX.bodies.map((b) => b.id));
const opError = (e) => ({ code: e.code || 'internal', params: e.params || { message: String(e?.message ?? e) } });
const progs = [];
for (const setup of cam.setups) {
  const rec = { id: setup.id, ad: setup.name, wcs: setup.workOffset.kind, islemler: [], gates: [] };
  let S; try { S = CAM.resolveSetup(setup, rbX, M); } catch (e) { rec.setup_hata = opError(e); R.setups.push(rec); continue; }
  rec.cozulmus = { frame: { o: S.frame.o.map(r3), x: S.frame.x.map(r3), y: S.frame.y.map(r3), z: S.frame.z.map(r3) }, stockBox: { min: S.stockBox.min.map(r3), max: S.stockBox.max.map(r3) }, modelBBox: { min: S.modelBBox.min.map(r3), max: S.modelBBox.max.map(r3) }, stockBoyut: S.stockBox.max.map((v, i) => r3(v - S.stockBox.min[i])) };
  log(`\n== ${setup.id} cozuldu, stok ${rec.cozulmus.stockBoyut.join('x')}`);
  const tps = [];
  for (const op0 of setup.ops) {
    const o = { id: op0.id, ad: op0.name, tur: op0.type, takim: 'T' + tools.find((t) => t.id === op0.toolId).number, denemeler: [] };
    const ta = now();
    const variants = [{}, ...op0.alts];
    for (let vi = 0; vi < variants.length; vi++) {
      const { alts, ...base } = op0; const op = { ...base, ...variants[vi] };
      try {
        const tool = tools.find((t) => t.id === op.toolId); const geom = {}; let opx = op;
        if (op.type === 'drill') geom.holes = holesX;
        if (op.type === 'contour' || op.type === 'pocket') { const g = await CAM.resolveGeom(op, S, { rebuild: rbX, doc, query }); geom.faces = g.faces; opx = { ...op, geom: g.sels }; }
        const tp = CAM.computeOp(opx, { setup: S, tool, geom, machine: M });
        o.hesap_s = r3(now() - ta); o.ok = true; o.varyant = vi; o.varyant_deger = vi ? JSON.stringify(variants[vi]) : 'birincil';
        o.uyarilar = (tp.warnings || []).map((w) => ({ code: w.code, params: w.params }));
        o.kesme_mm = r3(tp.stats.cutLen); o.hizli_mm = r3(tp.stats.rapidLen); o.sure_s = r3(tp.stats.timeMin * 60); o.zMin = tp.stats.zMin; o.hareket = tp.moves.length; o.passDepth = tp.meta?.passDepth ?? null;
        if (op.type === 'drill') o.delme = { cycles: tp.moves.filter((m) => m.t === 'cycle').map((m) => ({ cycle: m.cycle, n: m.points.length, top: m.top, bottom: m.bottom, retract: m.retract, clearance: m.clearance })) };
        tps.push(tp); break;
      } catch (e) { o.denemeler.push({ varyant: vi ? JSON.stringify(variants[vi]) : 'birincil', hata: opError(e) }); if (vi === variants.length - 1) { o.hesap_s = r3(now() - ta); o.ok = false; o.hata = opError(e); } }
    }
    rec.islemler.push(o);
    log(`  ${o.id} ${o.ad}: ${o.ok ? `ok ${o.hesap_s}s kesme ${o.kesme_mm} hizli ${o.hizli_mm} sure ${o.sure_s}s [${o.varyant_deger}] uyari ${o.uyarilar.map((w) => w.code).join(',')}` : 'HATA ' + o.hata.code + ' ' + JSON.stringify(o.hata.params)}${o.denemeler.length ? ' | onceki denemeler: ' + o.denemeler.map((d) => d.varyant + '->' + d.hata.code).join('; ') : ''}`);
  }
  rec.S = S; rec.tps = tps; progs.push(rec); R.setups.push(rec);
}

// deney: through:true flans deligi (model tabanina kadar mi iniyor?)
{
  const s1 = progs.find((r) => r.id === 'S1');
  if (s1) {
    const holesT = [{ ...rbX.holes[0], through: true, depth: null }];
    const op = { ...clone(S1.ops.find((o) => o.id === 'o7')), alts: undefined, depth: { from: 'hole', tipComp: true, breakThrough: 1 } };
    try { const tp = CAM.computeOp(op, { setup: s1.S, tool: tools.find((t) => t.number === 33), geom: { holes: holesT }, machine: M }); const c = tp.moves.find((m) => m.t === 'cycle'); R.deney_through = { bottom: c.bottom, model_tabani_z: r3(s1.S.modelBBox.min[2]), stok_tabani_z: r3(s1.S.stockBox.min[2]), uyarilar: tp.warnings.map((w) => ({ code: w.code, params: w.params })), belowStock: tp.meta?.belowStock }; }
    catch (e) { R.deney_through = { hata: opError(e) }; }
  }
}

// ------------------------------------------------------------------ 7. kapilar (sim acik) + post + kalan stok / serbest parca analizi
ASSUME('sim.res', RES, 'en kucuk takim yaricapi 1,5 (T28 D3) -> res <= 1,5 kapi sarti (cam.gate.sim_res_coarse); sure/hassasiyet dengesi icin ' + RES);
function analyze(S, hm, sr, label) {
  const rem = sr.remainBySetup?.[S.id] || sr.remainHeightmap; const RS = rem?.res ?? RES; const out = { res: RS };
  if (!rem || !hm || rem.nx !== hm.nx) return { hata: 'harita uyumsuz' };
  const cell = RS * RS; const nx = rem.nx, ny = rem.ny; const cx = (i) => rem.x0 + (i + 0.5) * RS, cy = (j) => rem.y0 + (j + 0.5) * RS;
  const bins = [0.05, 0.3, 1, 3, 10]; const area = [0, 0, 0, 0, 0]; let vol = 0, mx = 0; const pts = [];
  for (let k = 0; k < rem.data.length; k++) { const m = hm.data[k]; const rv = rem.data[k]; if (!Number.isFinite(m) || !Number.isFinite(rv)) continue; const ex = rv - m; if (ex > 0.05) { vol += ex * cell; bins.forEach((b, bi) => { if (ex > b) area[bi] += cell; }); if (ex > mx) mx = ex; pts.push([r3(cx(k % nx)), r3(cy(Math.floor(k / nx))), r3(ex)]); } }
  out.model_ustu_artik = { esik_mm: bins, alan_mm2: area.map(r3), hacim_mm3: r3(vol), max_mm: r3(mx), en_buyuk: pts.sort((a, b) => b[2] - a[2]).slice(0, 8) };
  out.kaldirilan_hacim_mm3 = r3(sr.removedVolume);
  if (label === 'S2') { // serbest parca: model bos (-Inf) + kalan stok tabandan (Z44,33 -> -5,93) yuksek + etrafi yalniz kesilmis bos hucre
    const floor = z2(44.33) + 0.15; const mask = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (Math.abs(cx(i)) < 140 && Math.abs(cy(j)) < 97 && !Number.isFinite(hm.data[k]) && rem.data[k] > floor) mask[k] = 1; }
    const lab = new Int32Array(nx * ny); let nl = 0; const comps = [];
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || lab[s]) continue; nl++; const st = [s]; lab[s] = nl; let n = 0, sx = 0, sy = 0, touchModel = 0, mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, hmax = -1e9;
      while (st.length) { const k = st.pop(); const i = k % nx, j = (k - i) / nx; n++; sx += cx(i); sy += cy(j); mnx = Math.min(mnx, cx(i)); mxx = Math.max(mxx, cx(i)); mny = Math.min(mny, cy(j)); mxy = Math.max(mxy, cy(j)); hmax = Math.max(hmax, rem.data[k]);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const kk = jj * nx + ii; if (mask[kk] && !lab[kk]) { lab[kk] = nl; st.push(kk); } else if (!mask[kk] && Number.isFinite(hm.data[kk])) touchModel++; } }
      comps.push({ hucre: n, alan_mm2: r3(n * cell), merkez: [r3(sx / n), r3(sy / n)], bbox: [r3(mnx), r3(mny), r3(mxx), r3(mxy)], ust_z: r3(hmax), modele_degen_komsu_hucre: touchModel, serbest: touchModel === 0 });
    }
    comps.sort((a, b) => b.alan_mm2 - a.alan_mm2);
    out.serbest_parca = { bilesen_say: comps.length, serbest_say: comps.filter((c) => c.serbest).length, bilesenler: comps.slice(0, 12) };
  }
  return out;
}
for (const rec of progs) {
  const S = rec.S; const num = { S1: 2001, S2: 2002 }[rec.id];
  if (!rec.tps.length) { rec.program = null; continue; }
  let program; try { program = CAM.buildProgram({ name: 'O' + num, number: num, machine: M, sections: [{ setup: S, toolpaths: rec.tps }] }); } catch (e) { rec.build_hata = opError(e); log('build hata', JSON.stringify(rec.build_hata)); continue; }
  const bb = [S.stockBox.min[0], S.stockBox.min[1], S.stockBox.max[0], S.stockBox.max[1]];
  const ts = now(); let hm; try { hm = K.camHeightmap({ bodies: [bid], frame: S.frame, res: RES, bbox: bb }); } catch (e) { rec.hm_hata = opError(e); }
  rec.hm_s = r3(now() - ts); rec.hm = hm;
  const tg = now();
  const gl = CAM.gates(program, M, { sim: { res: RES, modelHeightmaps: hm ? { [S.id]: hm } : undefined, tools: simTools } });
  rec.gates_s = r3(now() - tg);
  rec.gates = gl.map((g) => ({ level: g.level, code: g.code, params: g.params, opId: g.opId ?? null, moveIndex: g.moveIndex ?? null }));
  rec.blocked = gl.some((g) => g.level === 'block'); rec.program = program;
  log(`${rec.id} kapilar ${rec.gates_s}s: block ${gl.filter((g) => g.level === 'block').length}, warn ${gl.filter((g) => g.level === 'warn').length}`);
  const tsm = now();
  try { const sr = simulate(program, { res: RES, stockBoxes: { [S.id]: S.stockBox }, modelHeightmaps: hm ? { [S.id]: hm } : undefined, tools: simTools }); rec.sim_s = r3(now() - tsm); rec.sim_issue_say = sr.issues.length; rec.sim_issue_kod = Object.fromEntries([...new Set(sr.issues.map((i) => i.code))].map((c) => [c, sr.issues.filter((i) => i.code === c).length])); rec.sim_suppressed = sr.suppressed; rec.kalan = analyze(S, hm, sr, rec.id);
    const remH = sr.remainBySetup?.[S.id] || sr.remainHeightmap; const at = (h, x, y) => { if (!h) return null; const i = Math.floor((x - h.x0) / h.res), j = Math.floor((y - h.y0) / h.res); if (i < 0 || j < 0 || i >= h.nx || j >= h.ny) return null; const v = h.data[j * h.nx + i]; return Number.isFinite(v) ? r3(v) : null; };
    rec.sim_issues = sr.issues.map((i) => ({ level: i.level, code: i.code, op: i.params?.op ?? null, x: r3(i.params?.x), y: r3(i.params?.y), z: r3(i.params?.z), depth: r3(i.params?.depth), cells: i.params?.cells, moveIndex: i.moveIndex, model_z: at(hm, i.params?.x, i.params?.y), kalan_z: at(remH, i.params?.x, i.params?.y) })); }
  catch (e) { rec.kalan = { hata: opError(e) }; }
  const tp0 = now();
  const base = `P2_${{ S1: 'S1_Ic', S2: 'S2_Ust' }[rec.id]}_mihenk`;
  try { const nc = postProgram(program, M, { gates: gl, date: '2026-11-19' }); rec.post = { ok: true, s: r3(now() - tp0), dosya: path.join('out', base + SUF + '.nc') }; fs.writeFileSync(path.join(OUT, base + SUF + '.nc'), nc.text); rec.nc = ncStats(nc.text); rec.post.uyarilar = nc.warnings; }
  catch (e) {
    rec.post = { ok: false, s: r3(now() - tp0), hata: opError(e) };
    try {
      const warnOnly = gl.filter((g) => g.level !== 'block');
      const nc = postProgram(program, M, { gates: warnOnly, date: '2026-11-19' });
      const hdr = ['(*** BLOKLU: kapilar block verdi -> normalde NC URETILMEZ; yalniz yapi karsilastirmasi icin zorla uretildi ***)', ...gl.filter((g) => g.level === 'block').slice(0, 40).map((g) => `(BLOCK ${g.code} ${JSON.stringify(g.params).replace(/[()]/g, '')})`)].join('\n') + '\n';
      const f = `${base}_BLOKLU${SUF}.nc`; fs.writeFileSync(path.join(OUT, f), hdr + nc.text); rec.nc_bloklu = { dosya: path.join('out', f), ...ncStats(nc.text) };
    } catch (e2) { rec.nc_bloklu = { hata: opError(e2) }; }
  }
}
function ncStats(text) {
  const lines = text.split(/\r?\n/); const code = lines.map((l) => l.replace(/\([^)]*\)/g, '')).join('\n'); const cnt = (re) => (code.match(re) || []).length;
  const A = [...code.matchAll(/(?:^|\s)A(-?\d+(?:\.\d+)?)/gm)].map((m) => m[1]);
  return { satir: lines.length, bayt: Buffer.byteLength(text), G81: cnt(/\bG81\b/g), G83: cnt(/\bG83\b/g), G84: cnt(/\bG84\b/g), G41: cnt(/\bG41\b/g), G42: cnt(/\bG42\b/g), A: A.length, M6: cnt(/\bM0?6\b/g), M8: cnt(/\bM0?8\b/g), G2G3: cnt(/\bG0?[23]\b/g), G1: cnt(/\bG0?1\b/g) };
}

// ------------------------------------------------------------------ 7b. ek deneyler (birincil sonuclari DEGISTIRMEZ; yalniz neden/cozum denemeleri)
R.deneyler = {};
async function computeOne(S, op0, toolOverride) {
  const { alts, ...op } = op0; const tool = toolOverride || tools.find((t) => t.id === op.toolId); const geom = {}; let opx = op;
  if (op.type === 'drill') geom.holes = holesX;
  if (op.type === 'contour' || op.type === 'pocket') { const g = await CAM.resolveGeom(op, S, { rebuild: rbX, doc, query }); geom.faces = g.faces; opx = { ...op, geom: g.sels }; }
  return CAM.computeOp(opx, { setup: S, tool, geom, machine: M });
}
function gatesFor(rec, tps, res) {
  const S = rec.S; const program = CAM.buildProgram({ name: 'OX', number: 1, machine: M, sections: [{ setup: S, toolpaths: tps }] });
  const bb = [S.stockBox.min[0], S.stockBox.min[1], S.stockBox.max[0], S.stockBox.max[1]];
  const hm = res === RES ? rec.hm : K.camHeightmap({ bodies: [bid], frame: S.frame, res, bbox: bb });
  return CAM.gates(program, M, { sim: { res, modelHeightmaps: { [S.id]: hm }, tools: simTools } });
}
const sumG = (gl) => { const b = {}; for (const g of gl.filter((x) => x.level === 'block')) { const k = `${g.code}${g.opId ? ' ' + g.opId : (g.params?.op ? ' ' + g.params.op : '')}`; b[k] = (b[k] || 0) + 1; } return { block: b, block_say: gl.filter((x) => x.level === 'block').length, warn_say: gl.filter((x) => x.level === 'warn').length }; };
const exp = async (label, fn) => { try { const t = now(); R.deneyler[label] = await fn(); R.deneyler[label].s = r3(now() - t); log('deney', label, JSON.stringify(R.deneyler[label]).slice(0, 700)); } catch (e) { R.deneyler[label] = { hata: opError(e) }; log('deney HATA', label, JSON.stringify(opError(e))); } };
{
  const r1 = progs.find((r) => r.id === 'S1'), r2 = progs.find((r) => r.id === 'S2');
  if (r2) {
    await exp('E1_S2_o9_radyal_pay_1.6', async () => { const op = clone(S2.ops.find((o) => o.id === 'o9')); op.stockToLeave = { radial: 1.6, axial: 0.2 }; const tp = await computeOne(r2.S, op); return { aciklama: 'yalniz o9 radyal pay 0,3 -> 1,6 (duvar dibi R1,52 yuvarlatmasi icin)', ...sumG(gatesFor(r2, r2.tps.map((t) => (t.opId === 'o9' ? tp : t)), RES)) }; });
    await exp('E1b_S2_o9_ve_o10_radyal_pay_1.6', async () => { const o9 = clone(S2.ops.find((o) => o.id === 'o9')); o9.stockToLeave = { radial: 1.6, axial: 0.2 }; const o10 = clone(S2.ops.find((o) => o.id === 'o10')); o10.stockToLeave = { radial: 1.6, axial: 0 }; const t9 = await computeOne(r2.S, o9), t10 = await computeOne(r2.S, o10); return { aciklama: 'o9 ve o10 radyal pay 1,6 (o11 duvar konturu 1,6 mm temizler)', ...sumG(gatesFor(r2, r2.tps.map((t) => (t.opId === 'o9' ? t9 : t.opId === 'o10' ? t10 : t)), RES)) }; });
    await exp('E2_S2_o10_radyal_pay_0', async () => { const op = clone(S2.ops.find((o) => o.id === 'o10')); op.stockToLeave = { radial: 0, axial: 0 }; const tp = await computeOne(r2.S, op); return { aciklama: 'o10 radyal pay 0,3 -> 0 (ilk deneme)', ...sumG(gatesFor(r2, r2.tps.map((t) => (t.opId === 'o10' ? tp : t)), RES)) }; });
    await exp('E3_S2_res_0.5', async () => ({ aciklama: 'ayni program, sim res 0,5 (T28 yaricapi 1,5 >= 0,5)', ...sumG(gatesFor(r2, r2.tps, 0.5)) }));
    await exp('E4_S2_o9b_olmadan_serbest_parca', async () => { const tps = r2.tps.filter((t) => t.opId !== 'o9b'); const program = CAM.buildProgram({ name: 'OX', number: 1, machine: M, sections: [{ setup: r2.S, toolpaths: tps }] }); const sr = simulate(program, { res: RES, stockBoxes: { S2: r2.S.stockBox }, modelHeightmaps: { S2: r2.hm }, tools: simTools }); const a = analyze(r2.S, r2.hm, sr, 'S2'); return { aciklama: 'pencere + O30,56 kaba boşaltma (o9b) kaldirilirsa serbest parcalar', sim_issue_kod: Object.fromEntries([...new Set(sr.issues.map((i) => i.code))].map((c) => [c, sr.issues.filter((i) => i.code === c).length])), serbest_parca: a.serbest_parca }; });
    await exp('E5_S2_res_0.5_serbest_parca', async () => { const S = r2.S; const bb = [S.stockBox.min[0], S.stockBox.min[1], S.stockBox.max[0], S.stockBox.max[1]]; const hm5 = K.camHeightmap({ bodies: [bid], frame: S.frame, res: 0.5, bbox: bb }); const program = CAM.buildProgram({ name: 'OX', number: 1, machine: M, sections: [{ setup: S, toolpaths: r2.tps }] }); const sr = simulate(program, { res: 0.5, stockBoxes: { S2: S.stockBox }, modelHeightmaps: { S2: hm5 }, tools: simTools }); const a = analyze(S, hm5, { ...sr }, 'S2'); return { aciklama: 'birincil program, res 0,5 ile serbest parca', serbest_parca: a.serbest_parca }; });
  }
  if (r1) {
    await exp('E6_S1_res_0.5', async () => ({ aciklama: 'ayni program, sim res 0,5', ...sumG(gatesFor(r1, r1.tps, 0.5)) }));
    await exp('E7_S1_T33_dia_6.0', async () => { const t = { ...tools.find((q) => q.number === 33), dia: 6.0 }; const tp = await computeOne(r1.S, S1.ops.find((o) => o.id === 'o7'), t); return { aciklama: 'T33 Ø6,1 -> Ø6,0 (model deligi Ø6,045)', ...sumG(gatesFor(r1, r1.tps.map((q) => (q.opId === 'o7' ? tp : q)), RES)) }; });
  }
}

// ------------------------------------------------------------------ 8. generateProgram dogrudan (API kullanilabilirligi)
{
  const gp = {};
  for (const s of cam.setups) {
    const one = { ...cam, setups: [{ ...s, ops: s.ops.map(({ alts, ...o }) => ({ ...o, ...(progs.find((r) => r.id === s.id)?.islemler.find((x) => x.id === o.id)?.varyant ? s.ops.find((q) => q.id === o.id).alts[progs.find((r) => r.id === s.id).islemler.find((x) => x.id === o.id).varyant - 1] : {}) })) }] };
    const ta = now(); let r;
    try { r = await CAM.generateProgram(one, { rebuild: rbX, machine: M, query, doc, name: 'O' + s.id, sim: false }); gp[s.id] = { s: r3(now() - ta), ops: r.ops.map((o) => ({ id: o.opId, ok: o.ok, hata: o.error ? o.error.code : null })), bloklu: r.blocked }; }
    catch (e) { gp[s.id] = { hata: opError(e) }; }
  }
  R.generateProgram_dogrudan = gp;
}

// ------------------------------------------------------------------ cikti
R.sure_s = r3(now() - t0);
for (const rec of R.setups) { delete rec.S; delete rec.tps; delete rec.hm; if (rec.program) { rec.tahmini_sure_s = r3(rec.islemler.filter((o) => o.ok).reduce((a, o) => a + o.sure_s, 0)); } delete rec.program; }
R.fusion = fs.existsSync(FUSION_JSON) ? JSON.parse(fs.readFileSync(FUSION_JSON, 'utf8')) : null;
if (R.fusion) delete R.fusion.nc;
fs.writeFileSync(path.join(OUT, 'p2-mihenk-sonuc.json'), JSON.stringify(R, null, 1));
for (const rec of R.setups) {
  log(`\n== ${rec.id} ${rec.ad} (${rec.wcs}) tahmini ${rec.tahmini_sure_s}s`);
  if (rec.setup_hata) { log('  SETUP HATA', JSON.stringify(rec.setup_hata)); continue; }
  for (const g of rec.gates) log(`  KAPI ${g.level} ${g.code} ${g.opId || ''} ${JSON.stringify(g.params)}`);
  log('  post', JSON.stringify(rec.post), JSON.stringify(rec.nc || rec.nc_bloklu || {}));
  log('  kalan', JSON.stringify(rec.kalan));
}
log('\ntoplam s', R.sure_s, 'JSON:', path.join(OUT, 'p2-mihenk-sonuc.json'));
