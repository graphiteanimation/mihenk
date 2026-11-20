// Fusion-Mihenk CAM karsilastirma testi, P4 (NIST FTC-10 kapak, 4 setup / 25 islem) - MIHENK tarafi.
// Calistir:  node test/compare/P4/run-p4.mjs      (env: P4_STEP, P4_FUSION_JSON, P4_OUT, P4_RES, P4_BAND, P4_ONLY="S2,S3", P4_NOSIM=1, P4_NOEXP=1, P4_DUMP=<opId>)
// Kurallar: src/** degistirilmez (yalniz public API); NC dosyalari TEZGAHA GITMEZ.
// Cikti: test/compare/P4/out/*.nc ve out/p4-mihenk-sonuc.json (rapor bu JSON'dan yazilir).
// Plan: in/P4-PLAN.md (Fusion tarafiyla ayni girdiler). Plan'da OLMAYAN her deger ASSUME listesine yazilir.
// Yontem P3 ile ayni (test/compare/P3/run-p3.mjs): kernel camSection kesitlerinden eskiz, 2,5D karsiliklar, delik kayitlari elle.
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
const OUT = process.env.P4_OUT || path.join(here, 'out'); fs.mkdirSync(OUT, { recursive: true });
const STEP = process.env.P4_STEP || path.join(here, 'in', 'P4_NIST_FTC10_kapak.stp');
const FUSION_JSON = process.env.P4_FUSION_JSON || path.join(here, 'in', 'P4_fusion_rapor.json');
const RES = Number(process.env.P4_RES || 0.5);
const BAND = Number(process.env.P4_BAND || 1.0);          // S1 3D kontur karsiligi z-seviye bandi (mm)
const ONLY = (process.env.P4_ONLY || 'S1,S2,S3,S4').split(',');
const NOSIM = !!process.env.P4_NOSIM; const NOEXP = !!process.env.P4_NOEXP;
const SUF = '_KARSILASTIRMA_TEZGAHA_GITMEZ';
const R = { baslangic: new Date().toISOString(), varsayim: [], import: {}, makine: {}, setups: [], notlar: [], deneyler: {} };
const now = () => Number(process.hrtime.bigint()) / 1e9;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clone = (x) => JSON.parse(JSON.stringify(x));
const ASSUME = (k, v, why) => R.varsayim.push({ alan: k, deger: v, neden: why });
const log = (...a) => console.log(...a);
const opError = (e) => ({ code: e.code || 'internal', params: e.params || { message: String(e?.message ?? e) } });

// ------------------------------------------------------------------ 1. cekirdek + STEP
const wasm = path.join(ROOT, 'node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
const K = await initKernel(opencascade, () => wasm);
const IMP = { id: 'imp', type: 'import', format: 'step', data: fs.readFileSync(STEP).toString('base64'), name: 'P4_NIST_FTC10_kapak' };
const t0 = now();
// 1a. "dolgu" govdesi (YALNIZ ada kesitleri icin; sim/heightmap gercek govdeyle): O7 capraz tuneller + O10 havsalar (eksen Z) doldurulur,
//     takimin (O12) giremedigi dar araliklar (dalga vadileri Y<29,5; kaburga-kaide, kaburga-boss, dalga-kaide arasi) kopru kutularla kapatilir;
//     +X yuzune acilan X yonlu O5,5 delikler (Plan: kapsam disi) doldurulur (tek kesitte yan yuz centigi olarak gorunur, T-20).
//     Neden: tek-Y camSection, ustu kapali tuneli yarik gosterir (T-20); dar araliklar konturda komsu adaya oyar.
const box = (id, x0, y0, z0, x1, y1, z1) => ({ id, type: 'primitive', kind: 'box', x: x0, y: y0, z: z0, w: x1 - x0, d: y1 - y0, h: z1 - z0, op: 'join', targets: ['imp'] });
const cyl = (id, x) => ({ id, type: 'primitive', kind: 'cylinder', x, y: 23, z: -37.5, dia: 10, h: 75, axis: 'Z', op: 'join', targets: ['imp'] });
const CX = [-52, -30, -8, 14];
const cylX = (id, y, z) => ({ id, type: 'primitive', kind: 'cylinder', x: 27, y, z, dia: 5.5, h: 35.5, axis: 'X', op: 'join', targets: ['imp'] });
// kopru kutulari (komsu ozelliklere 0,5 mm bindirmeli; es duzlemli yuzlerden kacinmak icin): B1 kaide-kaburga X16..59 Z-18..-2 Y<=27, B2 kaburga-boss X16..59 Z2..16,5 Y<=29, B3 dalga-kaide X14..30 Z-32..-18 Y<=27; X yonlu O5,5 delikler (kapsam disi) dolgu
const FILL = [...CX.map((x, i) => cyl('fc' + i, x)), box('fV', -52, 23, -37.5, 14, 29.5, 37.5), box('fB1', 16, 23, -18, 59, 27, -2), box('fB2', 16, 23, 2, 59, 29, 16.5), box('fB3', 14, 23, -32, 30, 27, -18), cylX('fx1', 15, -25), cylX('fx2', 18, 23.5)];
const rbF = await K.rebuild({ params: [], features: [IMP, ...FILL] });
R.import.dolgu = { sure_s: r3(now() - t0), docErrors: rbF.docErrors, hacim: r3(rbF.bodies[0]?.volume ?? NaN) };
const F1 = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0] };   // S1: (u,v) = (X, -Z), z = +Y
const F2 = { o: [0, 0, 0], x: [1, 0, 0], y: [0, -1, 0], z: [0, 0, -1] };  // S2: (u,v) = (X, -Y), z = -Z
const F3 = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };    // S3: (u,v) = (X, Y),  z = +Z
const secRaw = (fr, z) => K.camSection({ body: 'imp', frame: fr, z }).loops;
const sec = (fr, z) => { for (const dz of [0, 0.01, -0.01, 0.03, -0.03]) { try { return { z: z + dz, loops: secRaw(fr, z + dz) }; } catch (e) { if (dz === -0.03) throw e; } } return null; };
// dolgu govdesi kesitleri (S1 adalari) - ana rebuild'den ONCE alinir
const FSEC = {}; const fsec = (y) => { const k = String(y); if (!FSEC[k]) FSEC[k] = sec(F1, y); return FSEC[k]; };
const polyOf = (loop) => { const pts = []; for (const g of loop) { let q; if (g.type === 'arc') { const n = Math.max(8, Math.ceil(Math.abs(g.sweep) / 0.2)); q = []; for (let i = 0; i <= n; i++) { const a = g.a0 + g.sweep * i / n; q.push([g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)]); } } else q = [g.p0, g.p1]; if (g.fwd === false) q = q.slice().reverse(); pts.push(...q.slice(0, -1)); } return pts; };
const sarea = (loop) => { const p = polyOf(loop); let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
const bbox = (loop) => { let mn = [1e9, 1e9], mx = [-1e9, -1e9]; for (const g of loop) { const ps = g.type === 'arc' ? [[g.c[0] - g.r, g.c[1] - g.r], [g.c[0] + g.r, g.c[1] + g.r]] : [g.p0, g.p1]; for (const p of ps) { mn = [Math.min(mn[0], p[0]), Math.min(mn[1], p[1])]; mx = [Math.max(mx[0], p[0]), Math.max(mx[1], p[1])]; } } return { mn, mx, w: mx[0] - mn[0], h: mx[1] - mn[1], c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2] }; };
const isCircle = (l) => l.length === 1 && l[0].type === 'arc' && Math.abs(l[0].sweep) >= 2 * Math.PI - 1e-6;
const circ = (c, r) => [{ type: 'arc', c, r, a0: 0, sweep: 2 * Math.PI, p0: [c[0] + r, c[1]], p1: [c[0] + r, c[1]], fwd: true }];
const poly = (pts) => pts.map((p, i) => ({ type: 'line', p0: p, p1: pts[(i + 1) % pts.length], fwd: true }));
const rect = (u0, v0, u1, v1) => poly([[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
const outerLoops = (ls) => ls.filter((l) => sarea(l) > 0);
const islandsAt = (y) => outerLoops(fsec(y).loops);

// S1 bant/bolge kesit seviyeleri (dolgu govdesi)
const RB = [
  { id: 'R1', top: null, bot: 29.6, secY: 29.65 }, { id: 'R2', top: 29.8, bot: 29.0, secY: 29.05 }, { id: 'R3', top: 29.2, bot: 27.0, secY: 27.05 },
  { id: 'R4', top: 27.2, bot: 23.0, secY: 23.05 }, { id: 'R5', top: 23.2, bot: 8.0, secY: 8.05 }, { id: 'R6', top: 8.2, bot: -0.2, secY: 0.05 },
];
for (const b of RB) b.loops = islandsAt(b.secY);
const C4 = []; // 3D kontur karsiligi bantlari (S1): Y31 -> 22 BAND mm; duvar 22 -> 9 tek islem (kesit Y15); ayak 9 -> 8 (kesit 8,05)
for (let y = 31; y > 22 + 1e-6; y -= BAND) { const yl = Math.max(22, r3(y - BAND)); C4.push({ top: r3(y), bot: yl, secY: r3(yl + 0.05), sd: BAND }); }
C4.push({ top: 22, bot: 9, secY: 15, sd: 1, ad: 'duvar' }); C4.push({ top: 9, bot: 8, secY: 8.05, sd: 1, ad: 'ayak' });
for (const c of C4) c.loops = islandsAt(c.secY);
R.geometri = { dolgu_kesit: Object.fromEntries(Object.entries(FSEC).map(([k, v]) => [k, { z: r3(v.z), dongu: v.loops.length, dis: outerLoops(v.loops).length }])) };

// 1b. ana rebuild (gercek govde)
const doc = { params: [], features: [IMP] };
const tI = now(); const rb0 = await K.rebuild(doc);
R.import = { ...R.import, sure_s: r3(now() - tI), durum: rb0.status, govde: rb0.bodies.map((b) => ({ id: b.id, yuz: b.nFaces, bbox: b.bbox, hacim: r3(b.volume) })), docErrors: rb0.docErrors, rebuild_holes_sayisi: (rb0.holes || []).length };
const bid = rb0.bodies[0]?.id; if (!bid) { log('STEP ice aktarma basarisiz', JSON.stringify(R.import)); process.exit(1); }
{ const [mn, mx] = rb0.bodies[0].bbox; R.import.bbox_plan = { beklenen: [[-79, 0, -37.5], [79, 31, 37.5]], bulunan: [mn.map(r3), mx.map(r3)], hacim_plan: 188318 }; }
log('import', JSON.stringify(R.import).slice(0, 500));

// ------------------------------------------------------------------ 2. eskizler
const MAPS = {
  M1: { map: (p) => [p[0], -p[1]], mirror: true, plane: (lvl) => ({ kind: 'base', name: 'XZ', offset: String(lvl) }) },     // lvl = Y
  M2: { map: (p) => [p[0], -p[1]], mirror: true, plane: (s) => ({ kind: 'base', name: 'XY', offset: String(-s) }) },         // lvl = s (Z = -s)
  M3: { map: (p) => [p[0], p[1]], mirror: false, plane: (s) => ({ kind: 'base', name: 'XY', offset: String(s) }) },          // lvl = s (Z = s)
};
function mkSketch(id, M, lvl, loops) {
  // nokta birlestirme toleransi 2e-3 mm: camSection donguleri zincirleme toleransiyla (cam.js chainLoops 1e-5*olcek) ~6e-4 mm acik uc verebilir; eskiz NODE_TOL 1e-6
  const points = {}; const ents = []; const SN = 2e-3; const grid = new Map(); let n = 0, ei = 0;
  const P = (p) => { const q = M.map(p); const cx = Math.floor(q[0] / SN), cy = Math.floor(q[1] / SN);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const [id, pt] of grid.get((cx + dx) + ',' + (cy + dy)) || []) if (Math.hypot(pt[0] - q[0], pt[1] - q[1]) <= SN) return id;
    const i = 'p' + (++n); points[i] = { x: q[0], y: q[1] }; const k = cx + ',' + cy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push([i, q]); return i; };
  for (const loop of loops) {
    if (isCircle(loop)) { ents.push({ id: 'e' + (ei++), type: 'circle', c: P(loop[0].c), r: loop[0].r }); continue; }
    for (const g of loop) {
      if (g.type === 'line') { const a = P(g.p0), b = P(g.p1); if (a !== b) ents.push({ id: 'e' + (ei++), type: 'line', a, b }); }
      else if (g.type === 'arc') { const a = P(g.p0), b = P(g.p1); ents.push({ id: 'e' + (ei++), type: 'arc', c: P(g.c), a: M.mirror ? b : a, b: M.mirror ? a : b }); }
      else throw new Error('desteklenmeyen kesit parcasi ' + g.type);
    }
  }
  return { id, type: 'sketch', plane: M.plane(lvl), points, ents };
}
const sketches = []; const addSk = (id, M, lvl, loops) => { sketches.push(mkSketch(id, M, lvl, loops)); return id; };
const BOXOUT = () => rect(-92, -50.5, 92, 50.5);   // S1 stok (X +-81, Z +-39,5) + 11 mm, (u,v) = (X,-Z)
for (const b of RB) b.sk = addSk('s' + b.id, MAPS.M1, b.secY, [BOXOUT(), ...b.loops]);
C4.forEach((c, i) => { c.id = 'sC' + i; addSk(c.id, MAPS.M1, c.secY, c.loops); });
// yatay temizleme (o3) bolgeleri: kutu - ada
const H3 = [{ id: 'sH8', floor: 8, secY: 8.05 }, { id: 'sH23', floor: 23, secY: 23.05 }, { id: 'sH27', floor: 27, secY: 27.05 }];
for (const h of H3) addSk(h.id, MAPS.M1, h.secY, [BOXOUT(), ...islandsAt(h.secY)]);
// o5 dis siluet: gercek govde Y=0,05 kesiti dis dongusu (flans + kulak loblari; gövde X+-62,5 bu silüetin icinde)
const s005 = sec(F1, 0.05); const silLoop = outerLoops(s005.loops).sort((a, b) => sarea(b) - sarea(a))[0];
addSk('sOut', MAPS.M1, 0.05, [silLoop]);
addSk('sRaw15', MAPS.M1, 15, outerLoops(sec(F1, 15).loops));   // E1: gercek govde Y15 kesiti (X yonlu O5,5 delik +X yuzunde centik)
// o6 kaide kanallari (Fusion eskizi 'kanal_bolge': X 37,5..40,5 / 48,5..51,5, Z -33..-17)
addSk('sKanal', MAPS.M1, 27, [rect(37.5, 17, 40.5, 33), rect(48.5, 17, 51.5, 33)]);
// o7 kulak havsasi O10 (merkez (+-70, +-28,5))
const EAR = [[70, 28.5], [70, -28.5], [-70, 28.5], [-70, -28.5]];
addSk('sEarCB', MAPS.M1, 8, EAR.map(([x, z]) => circ([x, -z], 5)));
// S2/S3 havsa O10 (eksen Z, merkez (X, Y=23))
addSk('sS2cb', MAPS.M2, 37.5, CX.map((x) => circ([x, -23], 5)));
addSk('sS3cb', MAPS.M3, 37.5, CX.map((x) => circ([x, 23], 5)));
// S3 yarik: tam genislik X 40..55, Y 0..24; iki 5 mm cep X 40..45 / 50..55
addSk('sS3y1', MAPS.M3, 37.5, [rect(40, 0, 55, 24)]);
addSk('sS3y2', MAPS.M3, 36.5, [rect(40, 0, 45, 24), rect(50, 0, 55, 24)]);
// S4 cep: gercek govde Y=10 kesitindeki cep dongusu (R2 dikey koseli) ; taban duz bolgesi; 3D kontur bantlari (Y15..17 taban filesi)
const s10 = sec(F1, 10); const pocketLoop = s10.loops.filter((l) => sarea(l) < 0 && bbox(l).w > 70)[0];
addSk('sS4cep', MAPS.M1, 10, [pocketLoop]);
addSk('sS4taban', MAPS.M1, 17, [rect(-56, -23, 18, 23)]);
const C23 = [{ top: 0, bot: 15, secY: 10, sd: 0.5, ad: 'duvar' }]; for (let y = 15; y < 17 - 1e-6; y += 0.5) C23.push({ top: r3(y), bot: r3(y + 0.5), secY: r3(y + 0.5 - 0.01), sd: 0.5 });
for (const c of C23) { const s = sec(F1, c.secY); c.secZ = r3(s.z); c.loops = s.loops.filter((l) => sarea(l) < 0 && bbox(l).w > 70); c.id = 'sK23_' + C23.indexOf(c); addSk(c.id, MAPS.M1, c.secY, c.loops); }
R.geometri.s4 = { cep_dongu: !!pocketLoop, cep_bbox: pocketLoop ? bbox(pocketLoop) : null, k23: C23.map((c) => ({ secY: c.secZ, n: c.loops.length, bb: c.loops[0] ? bbox(c.loops[0]) : null })) };
R.geometri.silhouette_elle = { dongu_parca: silLoop.length, bbox: bbox(silLoop) };
doc.features.push(...sketches);
const regInfo = (id) => { const sk = doc.features.find((f) => f.id === id); const fr = findRegions({ points: sk.points, ents: sk.ents }); const reg = fr.regions; return { idx: reg.findIndex((x) => x.holes.length), n: reg.length, holes: reg.map((x) => x.holes.length), sorun: (fr.issues || []).slice(0, 5).map((i) => i.code + ":" + (i.ents || []).length) }; };
const RG = Object.fromEntries([...RB.map((b) => b.sk), ...H3.map((h) => h.id)].map((k) => [k, regInfo(k)]));
R.geometri.bolge = RG; log('bolgeler', JSON.stringify(RG));
R.geometri.kontur_eskiz_sorun = Object.fromEntries([...C4, ...C23].map((c) => [c.id, regInfo(c.id)]).filter(([, v]) => v.sorun.length)); log('kontur eskiz sorunlari', JSON.stringify(R.geometri.kontur_eskiz_sorun));
for (const k of Object.keys(RG)) if (RG[k].idx < 0) { log('BOLGE (delikli) YOK', k); process.exit(1); }
ASSUME('geometri/eskizler', 'kernel camSection kesitlerinden (setup eksenine dik duzlemler) eskiz; S1 adalari "dolgu" govdesinden: O10 silindirler (4 capraz tunel+havsa, eksen Z, Y=23), vadi kutusu X-52..14 Y23..29,5, kopru kutulari B1 (X16..59 Z-18..-2 Y<=27), B2 (X16..59 Z2..16,5 Y<=29), B3 (X14..30 Z-32..-18 Y<=27), X yonlu O5,5 delik dolgusu (Y15/Z-25, Y18/Z23,5)', 'STEP\'ten yuz secimi yuz adi ister (T-09 P2); tek-Y kesit tunelleri yarik gosterir (T-20); O12 takimin giremedigi <12 mm araliklar konturda komsu adaya oyar');
ASSUME('adaptive karsiligi (op2)', 'z-bantlari (ada = dolgu govdesinin bant alti kesiti): R1 31-29,6 / R2 29,8-29 / R3 29,2-27 / R4 27,2-23 / R5 23,2-8 / R6 8,2--0,2; her bant tek 2,5D pocket T34', 'Mihenk\'te adaptive yok (T-09); yukari daralan dalga/kaburga yanaklarinda basamak kalir');
ASSUME('3D kontur karsiligi (op4)', `Y31->22 ${BAND} mm bantlar (kesit bant alti +0,05), Y22->9 tek duvar islemi (kesit Y15, paso 1), Y9->8 ayak bandi (kesit 8,05); dis/climb`, 'Plan: paso 1, alt Y7,8; Mihenk\'te 3D yuzey izleme yok');

// ------------------------------------------------------------------ 3. makine (Neway fixture KOPYASI)
const NEWAY = structuredClone(NEWAY_FIXTURE); // K-026: Neway artik yerlesik degil; kullanici profili ornegi (test/fixtures)
const M = copyMachine(NEWAY, 'test-p4-neway-kopya', 'P4 TEST Neway kopyasi (varsayimli)');
M.spindle.maxRpm = 8000; ASSUME('machine.spindle.maxRpm', 8000, 'Plan: devir <= 8000');
M.feed.maxCut = 5000; ASSUME('machine.feed.maxCut', 5000, 'Plan: ilerleme <= 5000');
M.feed.rapid = 24000; ASSUME('machine.feed.rapid', 24000, 'Plan\'da yok; yalniz sure tahmini icin test degeri (P1-P3 ile ayni)');
M.post = { props: { ...M.post.props, safeRetract: 'G28' } }; ASSUME('machine.post.props.safeRetract', 'G28', 'Fusion post: safePositionMethod = G28');
R.makine = { kopya_id: M.id, yerlesik_degismedi: JSON.stringify(NEWAY_FIXTURE) === JSON.stringify(NEWAY), checkMachine: checkMachine(M), A: M.axes?.A ?? null, post_props: M.post.props };

// ------------------------------------------------------------------ 4. takimlar
const HOLDER = { dia: 40, len: 50 }; ASSUME('tool.holder', 'O40 x 50 (P1-P3 ile ayni)', 'Plan: BT40; tutucu boyu planda yok');
const tl = (n, o) => ({ id: 'T' + n, number: n, lengthOffset: n, diaOffset: n, centerCutting: true, holder: HOLDER, ...o });
const tools = [
  tl(20, { type: 'face', name: 'T20 D50 yuz frezesi 5 agiz', dia: 50, flutes: 5, fluteLen: 10, bodyLen: 40 }),
  tl(21, { type: 'flat', name: 'T21 D12 parmak 3 agiz', dia: 12, flutes: 3, fluteLen: 26, bodyLen: 40 }),
  tl(22, { type: 'flat', name: 'T22 D6 parmak 3 agiz', dia: 6, flutes: 3, fluteLen: 16, bodyLen: 25 }),
  tl(24, { type: 'spot', name: 'T24 D10 punta 90', dia: 10, tipAngle: 90, flutes: 2, fluteLen: 35, bodyLen: 35 }),
  tl(28, { type: 'flat', name: 'T28 D3 parmak 2 agiz', dia: 3, flutes: 2, fluteLen: 9, bodyLen: 15 }),
  tl(29, { type: 'flat', name: 'T29 D2 parmak 2 agiz', dia: 2, flutes: 2, fluteLen: 6, bodyLen: 16 }),
  tl(33, { type: 'drill', name: 'T33 D6,1 matkap 140', dia: 6.1, tipAngle: 140, flutes: 2, fluteLen: 40, bodyLen: 40 }),
  tl(34, { type: 'flat', name: 'T34 D12 parmak 3 agiz EKSTRA UZUN', dia: 12, flutes: 3, fluteLen: 40, bodyLen: 105 }),
  tl(35, { type: 'bullnose', name: 'T35 D12 R3 koseli 3 agiz UZUN', dia: 12, cornerR: 3, flutes: 3, fluteLen: 35, bodyLen: 80 }),
  tl(37, { type: 'drill', name: 'T37 D7,1 matkap 140', dia: 7.1, tipAngle: 140, flutes: 2, fluteLen: 50, bodyLen: 50 }),
  tl(38, { type: 'ball', name: 'T38 D4 kure uc R2 2 agiz UZUN', dia: 4, flutes: 2, fluteLen: 20, bodyLen: 25 }),
  tl(39, { type: 'drill', name: 'T39 D2,5 matkap 140', dia: 2.5, tipAngle: 140, flutes: 2, fluteLen: 25, bodyLen: 25 }),
  tl(40, { type: 'tap', name: 'T40 M3x0,5 kilavuz sag', dia: 3, pitch: 0.5, flutes: 3, fluteLen: 20, bodyLen: 20, centerCutting: false }),
  tl(41, { type: 'drill', name: 'T41 D3,5 matkap 140', dia: 3.5, tipAngle: 140, flutes: 2, fluteLen: 22, bodyLen: 22 }),
];
ASSUME('T20/T21/T22/T24/T28/T29/T33/T34/T35/T37', 'P1-P3 betik degerleri birebir (T28 9/15, T29 6/16, T33 40/40)', 'Plan: "mevcut olanlar, tanimlar birebir ayni"');
ASSUME('T38', 'type ball (R2 = dia/2), agiz 20, tasma 25, 2 agiz', 'Plan: O4 kure uc (Fusion\'da bull nose RE=2); Mihenk bullnose cornerR < dia/2 ister -> ball');
ASSUME('T39/T41', 'agiz = tasma (25 / 22), 2 agiz', 'Plan\'da agiz boyu yok (P3 T36/T37 kurali)');
ASSUME('T40', 'type tap, dia 3, pitch 0,5, agiz = tasma 20, 3 agiz, centerCutting false', 'Plan: M3x0,5 sag, tasma 20; agiz sayisi/boyu planda yok');
ASSUME('shaftDia', 'verilmedi (= kesici capi)', 'Plan\'da sap capi yok');
const simTools = Object.fromEntries(tools.map((t) => [t.number, { holder: HOLDER }]));

// ------------------------------------------------------------------ 5. setup'lar ve islemler
const H = { clearance: 15, retract: 5 }; ASSUME('heights.clearance/retract', '15 / 5 (stok ustunden)', 'Plan\'da yok (P1-P3 ile ayni)');
const hts = (top, bottom) => ({ ...H, top, bottom });
const T = (f, off = 0) => ({ from: f, off }); const ABS = (z) => ({ from: 'abs', off: z });
const cutd = (rpm, feedCut, feedPlunge) => ({ rpm, feedCut, feedPlunge, coolant: 'flood' });
const sk = (id, profiles = 'all', loops) => ({ kind: 'sketch', sketch: id, profiles, ...(loops ? { loops } : {}) });
const LEAD = { kind: 'arc', r: 3 }; const NOLEAD = { kind: 'none' }; ASSUME('contour leadIn/leadOut', 'yay r=3 (T38: r=1; alternatif: none)', 'Plan\'da yok');
const z1 = (Y) => r3(Y - 33);              // S1: z=+Y, orijin stok ustu merkezi (Y 33)
const z2 = (s) => r3(s - 39.5);            // S2: s=-Z, stok ustu s=39,5
const z3 = (s) => r3(s - 39.5);            // S3: s=Z,  stok ustu s=39,5
const z4 = (Y) => r3(-Y - 2);              // S4: s=-Y, stok ustu Y=-2 (s=2)
const baseFrame = (dir) => ({ zAxis: { kind: 'base', dir }, xAxis: { kind: 'base', dir: '+X' }, origin: { kind: 'stockTopCenter' } });
const STK = { kind: 'boxOffset', side: 2, top: 2, bottom: 2 };
const S1 = { id: 'S1', name: 'P4-S1 Ust', bodies: [bid], workOffset: { kind: 'G55' }, clearanceZ: 5, frame: baseFrame('+Y'), stock: STK, ops: [] };
const S2 = { id: 'S2', name: 'P4-S2 Z-', bodies: [bid], workOffset: { kind: 'G57' }, clearanceZ: 5,
  frame: { zAxis: { kind: 'base', dir: '+Y' }, xAxis: { kind: 'base', dir: '+X' }, origin: { kind: 'point', p: [0, 15.5, -39.5] } }, rotary: { enabled: true, aAngle: -90 }, stock: STK, ops: [] };
const S3 = { id: 'S3', name: 'P4-S3 Z+', bodies: [bid], workOffset: { kind: 'G58' }, clearanceZ: 5,
  frame: { zAxis: { kind: 'base', dir: '+Y' }, xAxis: { kind: 'base', dir: '+X' }, origin: { kind: 'point', p: [0, 15.5, 39.5] } }, rotary: { enabled: true, aAngle: 90 }, stock: STK, ops: [] };
const S4 = { id: 'S4', name: 'P4-S4 Alt', bodies: [bid], workOffset: { kind: 'G59' }, clearanceZ: 5, frame: baseFrame('-Y'), stock: STK, ops: [] };
ASSUME('S1 yonu', 'zAxis +Y, xAxis +X, orijin stok ust merkezi (model Y=33); G55', 'Plan: S1 takim ekseni +Y; Fusion WCS (0,330,0)/10');
ASSUME('S2 yonu / A', 'base z=+Y, rotary.aAngle = -90 -> etkin z = model -Z (P3-S2 ile ayni kural, A.dir=[-1,0,0]); orijin model (0, 15,5, -39,5); G57', 'Plan: "takim ekseni -Z (A +90)"; Plan A isareti Mihenk A.dir kuralina gore ters (Mihenk\'te +90 = +Z yuzu yukari, P3 dersi); Fusion WCS (0,155,-395)/10');
ASSUME('S3 yonu / A', 'base z=+Y, rotary.aAngle = +90 -> etkin z = model +Z; orijin model (0, 15,5, 39,5); G58', 'Plan: "takim ekseni +Z (A -90)"; Fusion WCS (0,155,395)/10');
ASSUME('S4 yonu', 'zAxis -Y, xAxis +X, orijin stok ust merkezi (model Y=-2); G59', 'Plan: S4 takim ekseni -Y');
ASSUME('S2/S3/S4 stok', 'S1 ile ayni kutu (162 x 35 x 79); Fusion "onceki setup\'tan stok" kullandi', 'Mihenk\'te yok (T-04)');
ASSUME('setup.clearanceZ', 5, 'planda yok');

const OP = (id, type, name, toolId, rest, alts = []) => ({ id, type, name, toolId, alts, fop: null, ...rest });
const F = (fop, o) => ({ ...o, fop });
const LEAVE = { radial: 0.3, axial: 0.2 }, NOLEAVE = { radial: 0, axial: 0 };
const ENTRY_H = { entry: { kind: 'helix', helixDia: 10, angle: 3 } };
const ALT_ENTRY = [{ entry: { kind: 'ramp', angle: 3 } }, { entry: { kind: 'plunge' } }];
const FLOOR_ALTS = [{ entry: { kind: 'ramp', angle: 3 } }, ENTRY_H];
const drillOp = (id, name, fop, tool, rest) => F(fop, OP(id, 'drill', name, tool, { heights: H, order: 'asis', ...rest }));

// --- S1
S1.ops.push(F(1, OP('o1', 'face', '1 Yuzey T20 (Y33 -> 31)', 'T20', { ...cutd(4500, 2250, 750), heights: hts(T('stockTop'), T('modelTop')), stepover: 40, stepdown: 1, stockToLeave: 0, direction: 0, extend: 2 })));
for (const b of RB) {
  const top = b.top == null ? T('modelTop') : ABS(z1(b.top));
  S1.ops.push(F(2, OP('o2' + b.id, 'pocket', `2 Adaptive karsiligi ${b.id}: Y${b.top ?? 31}-${b.bot} (ada kesit Y=${b.secY}) T34`, 'T34', { ...cutd(8000, 1500, 500), heights: hts(top, ABS(z1(b.bot))), geom: [sk(b.sk, [RG[b.sk].idx])], stepover: 1.2, stepdown: 12, stockToLeave: b.id === 'R6' ? { radial: 0.3, axial: 0 } : LEAVE, ...ENTRY_H }, ALT_ENTRY)));
}
for (const h of H3) S1.ops.push(F(3, OP('o3_' + h.floor, 'pocket', `3 Yatay temizleme karsiligi Y${h.floor} T35`, 'T35', { ...cutd(8000, 1500, 500), heights: hts(ABS(z1(h.floor + 0.2)), ABS(z1(h.floor))), geom: [sk(h.id, [RG[h.id].idx])], stepover: 5, stepdown: 1, stockToLeave: NOLEAVE, entry: { kind: 'plunge' } }, FLOOR_ALTS)));
C4.forEach((c, i) => S1.ops.push(F(4, OP('c4_' + i, 'contour', `4 3D kontur karsiligi ${c.ad ? c.ad + ' ' : ''}Y${c.bot}-${c.top} (kesit ${c.secY}) T35`, 'T35', { ...cutd(8000, 1500, 500), heights: hts(ABS(z1(c.top)), ABS(z1(c.bot))), geom: [sk(c.id, 'all', 'outer')], side: 'outside', dir: 'climb', stepdown: c.sd, stockToLeave: NOLEAVE, leadIn: LEAD, leadOut: LEAD }, [{ leadIn: NOLEAD, leadOut: NOLEAD }]))));
S1.ops.push(F(5, OP('o5', 'contour', '5 2D kontur dis siluet T34 (elle silüet: Y0,05 kesiti)', 'T34', { ...cutd(8000, 1500, 500), heights: hts(T('stockTop'), ABS(z1(-0.2))), geom: [sk('sOut', 'all', 'outer')], side: 'outside', dir: 'climb', stepdown: 12, stockToLeave: NOLEAVE, leadIn: LEAD, leadOut: LEAD }, [{ leadIn: NOLEAD, leadOut: NOLEAD }])));
S1.ops.push(F(6, OP('o6', 'pocket', '6 Kaide kanallari T29 (2D cep, dalma, Y27 -> 25,5, paso 0,5)', 'T29', { ...cutd(8000, 160, 60), heights: hts(ABS(z1(27)), ABS(z1(25.5))), geom: [sk('sKanal', 'all')], stepover: 0.4, stepdown: 0.5, stockToLeave: NOLEAVE, entry: { kind: 'plunge' } }, [{ entry: { kind: 'ramp', angle: 3 } }])));
S1.ops.push(F(7, OP('o7', 'pocket', '7 Bore T22: 4x O10 kulak havsasi Y8 -> 6 (cep + helis)', 'T22', { ...cutd(8000, 960, 320), heights: hts(ABS(z1(8)), ABS(z1(6))), geom: [sk('sEarCB', 'all')], stepover: 1, stepdown: 1, stockToLeave: NOLEAVE, entry: { kind: 'helix', helixDia: 3, angle: 3 } }, [{ entry: { kind: 'ramp', angle: 3 } }, { entry: { kind: 'plunge' } }])));
S1.ops.push(drillOp('o8', '8 Punta T24 4x O6 (Y4,5)', 8, 'T24', { ...cutd(3000, 300, 300), holes: { kind: 'feature', filter: { feature: 'P4kulak' } }, cycle: 'spot', depth: { from: 'abs', tipComp: false, z: z1(4.5) } }));
S1.ops.push(drillOp('o9', '9 Delme T33 O6,1 G83 Q3 boydan boya +1', 9, 'T33', { ...cutd(3500, 420, 420), holes: { kind: 'feature', filter: { feature: 'P4kulak' } }, cycle: 'peck', peck: 3, depth: { from: 'hole', tipComp: true, breakThrough: 1 } }));
S1.ops.push(drillOp('o10', '10 Delme T41 6x O3,5 G83 Q3 (dip +1)', 10, 'T41', { ...cutd(5000, 350, 350), holes: { kind: 'feature', filter: { dia: 3.5 } }, cycle: 'peck', peck: 3, depth: { from: 'hole', tipComp: true, breakThrough: 1 } }));
S1.ops.push(drillOp('o11', '11 Delme T39 6x M3 on delik O2,5 G83 Q3 (uc Y14,3)', 11, 'T39', { ...cutd(6000, 360, 360), holes: { kind: 'feature', filter: { feature: 'P4m3' } }, cycle: 'peck', peck: 3, depth: { from: 'abs', tipComp: false, z: z1(14.3) } }));
S1.ops.push(drillOp('o12', '12 Kilavuz T40 6x M3x0,5 G84 (Y17)', 12, 'T40', { ...cutd(1000, 500, 500), holes: { kind: 'feature', filter: { feature: 'P4m3' } }, cycle: 'tap', depth: { from: 'abs', tipComp: false, z: z1(17) } }));
// --- S2 (-Z)
const S23ops = (S, sfx, z, skcb, fop0) => {
  S.ops.push(F(fop0, OP('o' + fop0, 'pocket', `${fop0} Bore T22: 4x O10 havsa ${sfx} s37,5 -> 27,5 (cep + helis)`, 'T22', { ...cutd(8000, 960, 320), heights: hts(ABS(z(37.5)), ABS(z(27.5))), geom: [sk(skcb, 'all')], stepover: 1, stepdown: 1, stockToLeave: NOLEAVE, entry: { kind: 'helix', helixDia: 3, angle: 3 } }, [{ entry: { kind: 'ramp', angle: 3 } }, { entry: { kind: 'plunge' } }])));
  S.ops.push(drillOp('o' + (fop0 + 1), `${fop0 + 1} Punta T24 4x O7 ${sfx} (s26)`, fop0 + 1, 'T24', { ...cutd(3000, 300, 300), holes: { kind: 'feature', filter: { feature: 'P4capraz' + sfx } }, cycle: 'spot', depth: { from: 'abs', tipComp: false, z: z(26) } }));
  S.ops.push(drillOp('o' + (fop0 + 2), `${fop0 + 2} Delme T37 4x O7,1 ${sfx} G83 Q5 (uc s-2)`, fop0 + 2, 'T37', { ...cutd(3500, 420, 420), holes: { kind: 'feature', filter: { feature: 'P4capraz' + sfx } }, cycle: 'peck', peck: 5, depth: { from: 'abs', tipComp: false, z: z(-2) } }));
};
S23ops(S2, 'Zeksi', z2, 'sS2cb', 13);
S23ops(S3, 'Zarti', z3, 'sS3cb', 16);
S3.ops.push(F(19, OP('o19', 'pocket', '19 Yarik taban T28: X40..55 Y0..24, Z37,5 -> 36,5', 'T28', { ...cutd(8000, 320, 100), heights: hts(ABS(z3(37.5)), ABS(z3(36.5))), geom: [sk('sS3y1', 'all')], stepover: 0.6, stepdown: 1, stockToLeave: NOLEAVE, entry: { kind: 'ramp', angle: 3 } }, [{ entry: { kind: 'plunge' } }])));
S3.ops.push(F(20, OP('o20', 'pocket', '20 Yarik 2x5 mm T28: Z36,5 -> 34,5', 'T28', { ...cutd(8000, 320, 100), heights: hts(ABS(z3(36.5)), ABS(z3(34.5))), geom: [sk('sS3y2', 'all')], stepover: 0.6, stepdown: 1, stockToLeave: NOLEAVE, entry: { kind: 'ramp', angle: 3 } }, [{ entry: { kind: 'plunge' } }])));
// --- S4 (-Y)
S4.ops.push(F(21, OP('o21', 'pocket', '21 2D Adaptive karsiligi T21: cep agzi Y-2 -> 14,8', 'T21', { ...cutd(8000, 1800, 600), heights: hts(T('stockTop'), ABS(z4(14.8))), geom: [sk('sS4cep', 'all')], stepover: 1.2, stepdown: 8, stockToLeave: { radial: 0.3, axial: 0 }, ...ENTRY_H }, ALT_ENTRY)));
S4.ops.push(F(22, OP('o22', 'pocket', '22 Yatay temizleme karsiligi T21: cep tabani Y17 (tek paso 14,8 -> 17)', 'T21', { ...cutd(8000, 1800, 600), heights: hts(ABS(z4(14.8)), ABS(z4(17))), geom: [sk('sS4taban', 'all')], stepover: 5, stepdown: 2.2, stockToLeave: NOLEAVE, entry: { kind: 'plunge' } }, FLOOR_ALTS)));
C23.forEach((c, i) => S4.ops.push(F(23, OP('c23_' + i, 'contour', `23 3D kontur karsiligi T38 ${c.ad ? c.ad + ' ' : ''}Y${c.top}-${c.bot} (kesit ${c.secZ}) paso ${c.sd}`, 'T38', { ...cutd(8000, 440, 150), heights: hts(ABS(z4(c.top)), ABS(z4(c.bot))), geom: [sk(c.id, 'all', 'outer')], side: 'inside', dir: 'climb', stepdown: c.sd, stockToLeave: NOLEAVE, leadIn: { kind: 'arc', r: 1 }, leadOut: { kind: 'arc', r: 1 } }, [{ leadIn: NOLEAD, leadOut: NOLEAD }]))));
S4.ops.push(drillOp('o24', '24 Delme T39 8x O2,5 cep tabani G83 Q1,5 (+1)', 24, 'T39', { ...cutd(6000, 360, 360), holes: { kind: 'feature', filter: { feature: 'P4taban25' } }, cycle: 'peck', peck: 1.5, depth: { from: 'hole', tipComp: true, breakThrough: 1 } }));
S4.ops.push(F(25, OP('o25', 'face', '25 Yuzey alt T20 (Y-2 -> 0)', 'T20', { ...cutd(4500, 2250, 750), heights: hts(T('stockTop'), T('modelTop')), stepover: 40, stepdown: 1, stockToLeave: 0, direction: 0, extend: 2 })));
ASSUME('o2R1-R6', 'pocket T34: stepover 1,2, paso 12, pay 0,3/0,2 (R6: eksenel 0), helis O10/3 derece (alternatif rampa/dalma)', 'Plan: optimal yuk 1,2, paso 12, pay 0,3/0,2, alt Y-0,2');
ASSUME('o3 (yatay)', 'T35 pocket, Y8 / Y23 / Y27 tabanlari (ust +0,2), stepover 5, paso 1, pay 0, dalma; Y31 yuzey islemiyle (o1), Y25,5 kanal tabani o6 ile', 'Plan: T35 alt Y7,8 (Y8, 23, 25,5/27, 31)');
ASSUME('o5 (2D kontur dis siluet)', 'elle silüet = gercek govde Y0,05 kesiti dis dongusu; stok ustu -> Y-0,2, paso 12, dis, climb', 'Plan: yalniz dis halka; silüet secici deneyi asagida');
ASSUME('o6 kanallar', 'pocket T29, 2 dikdortgen (Fusion kanal_bolge), stepover 0,4, paso 0,5, dalma, Y27 -> 25,5', 'Fusion log: maximumStepdown 0,5, top -6 / bottom -7,5 (Plan metnindeki "paso 1,5" yerine log degeri)');
ASSUME('o7/o13/o16 bore O10', 'pocket daire r5, T22, helis O3/3 derece, stepover 1, paso 1', 'Fusion bore threadPitch 1; Mihenk\'te bore islemi yok');
ASSUME('o10 O3,5 delikler', 'tek islem (filtre dia 3,5): kaide 3x ust Y27 kor derinlik 10,88 (=27-17,12+1), boss 3x ust Y31 kor derinlik 11,88 (=31-20,12+1); tipComp', 'Fusion: drillTipThroughBottom + breakThrough 1; blind kayitta breakThrough etkisiz -> derinlige eklendi (P2/P3 yontemi)');
ASSUME('o11 M3 on delik', 'abs uc Y14,3, tipComp false', 'Fusion bottom -18,7 (stok ustu 33) = Y14,3');
ASSUME('o12 kilavuz', 'cycle tap, abs Y17 (tipComp false), rpm 1000 -> F = 1000 x 0,5 = 500', 'Fusion: tapping, bottom -16 = Y17, F500');
ASSUME('o15/o18 O7,1', 'abs uc s-2 (tipComp false), G83 Q5', 'Fusion bottom -41,5 (stok ustu 39,5), drillTipThroughBottom false');
ASSUME('o19/o20 yarik', 'pocket T28, stepover 0,6, paso 1, rampa 3 derece (alternatif dalma); Y0..24 bolge', 'Fusion adaptive2d optimal yuk 0,6; Mihenk adaptive yok');
ASSUME('o21 cep', 'pocket T21 bolge = gercek Y10 kesitindeki cep dongusu (R2 koseler), stok ustu -> Y14,8, stepover 1,2, paso 8, pay 0,3/0, helis O10', 'Plan op21');
ASSUME('o22 taban', 'pocket T21 dikdortgen X-56..18 Z+-23 (2 mm taban filesi teget cizgileri), tek paso Y14,8 -> 17', 'Plan: yatay temizleme taban Y17 (ust s-10); Mihenk pocket ilk pasoyu ustten baslatir -> ust = kaba alt sinir');
ASSUME('o23 3D kontur karsiligi', 'T38 ball: duvar Y0 -> 15 tek islem (kesit Y10), filet bantlari 15 -> 17 her 0,5 mm (kesit bant dibi -0,01); ic, climb, lead r1', 'Plan: paso 0,5, alt s-17');
ASSUME('o24 O2,5', 'kor kayit ust Y17, derinlik 3,73 (=19,73-17+1), tipComp, G83 Q1,5', 'Fusion drillTipThroughBottom + breakThrough 1');

// delik kayitlari (STEP ice aktarma delik tanimaz, T-05)
const hrec = (feature, dia, pos, dir, o = {}) => ({ feature, kind: 'simple', dia, depth: null, through: false, tipAngle: 118, thread: null, dir, positions: pos, dirs: pos.map(() => dir), bodies: pos.map(() => [bid]), count: pos.length, lost: 0, ...o });
const tR = now(); const rb = await K.rebuild(doc); R.import.rebuild_eskizlerle_s = r3(now() - tR); R.import.docErrors2 = rb.docErrors; log('rebuild eskizlerle', R.import.rebuild_eskizlerle_s, JSON.stringify(rb.docErrors));
const M3P = [[31.9, -30], [42.9, -30], [53.9, -30], [35.1, -20], [46.1, -20], [57.1, -20]];
const rbX = { ...rb, holes: [
  hrec('P4kulak', 6, EAR.map(([x, z]) => [x, 6, z]), [0, -1, 0], { through: true }),
  hrec('P4d35kaide', 3.5, [33.5, 44.5, 55.5].map((x) => [x, 27, -25]), [0, -1, 0], { depth: 10.88 }),
  hrec('P4d35boss', 3.5, [40.5, 47.5, 54.5].map((x) => [x, 31, 23.5]), [0, -1, 0], { depth: 11.88 }),
  hrec('P4m3', 2.459, M3P.map(([x, z]) => [x, 27, z]), [0, -1, 0], { depth: 12, thread: { major: 3, pitch: 0.5 } }),
  hrec('P4caprazZeksi', 7, CX.map((x) => [x, 23, -27.5]), [0, 0, 1], { through: true }),
  hrec('P4caprazZarti', 7, CX.map((x) => [x, 23, 27.5]), [0, 0, -1], { through: true }),
  hrec('P4taban25', 2.5, CX.flatMap((x) => [[x, 17, 15.5], [x, 17, -15.5]]), [0, 1, 0], { depth: 3.73 }),
] };
ASSUME('rebuild.holes', 'P4kulak 4x O6 (+-70,Y6,+-28,5) through yon -Y; P4d35kaide/boss 3+3x O3,5 kor; P4m3 6x O2,459 (dis M3x0,5) ust Y27 derinlik 12; P4capraz 4+4x O7 (X-52/-30/-8/14, Y23) ust Z-+27,5 yon +-Z; P4taban25 8x O2,5 ust Y17 yon +Y derinlik 3,73', 'STEP ice aktarmada delik ozelligi tanimaz (T-05); konumlar Plan + kesit olcumu');

const cam = { machineId: M.id, tools, setups: [S1, S2, S3, S4].filter((s) => ONLY.includes(s.id)), verified: null };
{ const vd = (() => { try { validateDoc({ ...doc, cam }); return 'gecerli'; } catch (e) { return 'GECERSIZ ' + (e.code || e.message) + ' ' + JSON.stringify(e.params || {}); } })(); R.sema = vd; log('sema', vd); }

// ------------------------------------------------------------------ 6. uretim
const query = async (cmd, args) => { if (cmd === 'facePlane') return K.facePlane(args.ref); if (typeof K[cmd] === 'function' && cmd.startsWith('cam')) return K[cmd](args); throw new Error('cmd ' + cmd); };
// T-14: boydan boya delik cikislari (generateProgram ile ayni yol); ortam P_NOEXIT=1 -> eski kural (karsilastirma)
const holesX = process.env.P_NOEXIT ? rbX.holes : await CAM.annotateHoleExits(rbX.holes, query, rbX.bodies.map((b) => b.id));
async function computeOne(S, op0, toolOverride, variant = 0, mctx = null) {
  const { alts, fop, ...base } = op0; const op = variant ? { ...base, ...(alts?.[variant - 1] || {}) } : base; const tool = toolOverride || tools.find((t) => t.id === op.toolId); const geom = {}; let opx = op;
  if (op.type === 'drill') geom.holes = holesX;
  // T-23: islem basi stok + model haritasi (generateProgram ile ayni yol; ortam P_NODMAP=1 -> eski muhafazakar gruplama)
  if (op.type === 'drill' && mctx && !process.env.P_NODMAP && !process.env.P_NOCHAIN) CAM.chainStock(mctx.recs, mctx.ri, 0.5); // T-04
  const maps = op.type === 'drill' && mctx && !process.env.P_NODMAP ? await CAM.drillMaps(mctx.stk, mctx.tps, S, { res: 0.5, query }) : {};
  if (op.type === 'contour' || op.type === 'pocket') { const g = await CAM.resolveGeom(op, S, { rebuild: rbX, doc, query }); geom.faces = g.faces; opx = { ...op, geom: g.sels }; }
  return CAM.computeOp(opx, { setup: S, tool, geom, machine: M, ...maps });
}
const progs = []; const RECS = [];
for (const setup of cam.setups) {
  const rec = { id: setup.id, ad: setup.name, wcs: setup.workOffset.kind, islemler: [], gates: [] };
  let S; try { S = CAM.resolveSetup(setup, rbX, M); } catch (e) { rec.setup_hata = opError(e); R.setups.push(rec); log('SETUP HATA', setup.id, JSON.stringify(rec.setup_hata)); continue; }
  rec.cozulmus = { frame: { o: S.frame.o.map(r3), x: S.frame.x.map(r3), y: S.frame.y.map(r3), z: S.frame.z.map(r3) }, aAngle: S.aAngle, stockBox: { min: S.stockBox.min.map(r3), max: S.stockBox.max.map(r3) }, modelBBox: { min: S.modelBBox.min.map(r3), max: S.modelBBox.max.map(r3) }, stockBoyut: S.stockBox.max.map((v, i) => r3(v - S.stockBox.min[i])) };
  log(`\n== ${setup.id} cozuldu, stok ${rec.cozulmus.stockBoyut.join('x')} frame.z ${rec.cozulmus.frame.z} aAngle ${S.aAngle} model ${JSON.stringify(rec.cozulmus.modelBBox)}`);
  const tps = []; const stk = { hm: null, done: 0 }; const ri = RECS.push({ S, tps, stk }) - 1;
  for (const op0 of setup.ops) {
    const o = { id: op0.id, fop: op0.fop, ad: op0.name, tur: op0.type, takim: 'T' + tools.find((t) => t.id === op0.toolId).number, denemeler: [] };
    const ta = now(); const nv = 1 + (op0.alts?.length || 0);
    for (let vi = 0; vi < nv; vi++) {
      try {
        const tp = await computeOne(S, op0, null, vi, { stk, tps, recs: RECS, ri });
        o.hesap_s = r3(now() - ta); o.ok = true; o.varyant = vi; o.varyant_deger = vi ? JSON.stringify(op0.alts[vi - 1]) : 'birincil';
        o.uyarilar = (tp.warnings || []).map((w) => ({ code: w.code, params: w.params }));
        o.kesme_mm = r3(tp.stats.cutLen); o.hizli_mm = r3(tp.stats.rapidLen); o.sure_s = r3(tp.stats.timeMin * 60); o.zMin = tp.stats.zMin; o.hareket = tp.moves.length; o.passDepth = tp.meta?.passDepth ?? null;
        if (op0.type === 'drill') o.delme = { cycles: tp.moves.filter((m) => m.t === 'cycle').map((m) => ({ cycle: m.cycle, n: m.points.length, top: r3(m.top), bottom: r3(m.bottom), retract: r3(m.retract), clearance: r3(m.clearance), f: m.f, pitch: m.pitch ?? null })) };
        tps.push(tp); break;
      } catch (e) { o.denemeler.push({ varyant: vi ? JSON.stringify(op0.alts[vi - 1]) : 'birincil', hata: opError(e) }); if (vi === nv - 1) { o.hesap_s = r3(now() - ta); o.ok = false; o.hata = opError(e); } }
    }
    rec.islemler.push(o);
    log(`  ${o.id} ${o.ad}: ${o.ok ? `ok ${o.hesap_s}s kesme ${o.kesme_mm} hizli ${o.hizli_mm} sure ${o.sure_s}s [${o.varyant_deger}] uyari ${o.uyarilar.map((w) => w.code).join(',')}` : 'HATA ' + o.hata.code + ' ' + JSON.stringify(o.hata.params)}${o.denemeler.length ? ' | onceki: ' + o.denemeler.map((d) => d.varyant + '->' + d.hata.code).join('; ') : ''}`);
  }
  rec.S = S; rec.tps = tps; progs.push(rec); R.setups.push(rec);
  if (process.env.P4_DUMP) { const tp = tps.find((t) => t.opId === process.env.P4_DUMP); if (tp) { log('DUMP', tp.opId, JSON.stringify(tp.moves.slice(0, Number(process.env.P4_DUMPN || 40)))); process.exit(0); } }
}

// silhouette secici denemesi (S1 op5 icin)
if (progs.find((r) => r.id === 'S1')) {
  const s1 = progs.find((r) => r.id === 'S1');
  try { const g = await CAM.resolveGeom({ geom: [{ kind: 'silhouette', body: bid, loops: 'outer' }] }, s1.S, { rebuild: rbX, doc, query }); R.deney_silhouette = { ok: true, yuz_say: g.faces.length, dis_parca: g.faces[0]?.outer?.length ?? null, bbox: null }; }
  catch (e) { R.deney_silhouette = { ok: false, hata: opError(e) }; }
  log('deney silhouette', JSON.stringify(R.deney_silhouette));
}

// ------------------------------------------------------------------ 7. kapilar (sim acik) + post + kalan stok analizi
ASSUME('sim.res', RES, 'en kucuk takim yaricapi 1 (T29 O2) -> res <= 1; P4 kucuk parca, 0,5 secildi');
// artik bolgesi: S2/S3 yalniz havsa/delik ici (r<=4,8) ve S3 yarik (X40..55, Y0..23); stok kabugu (T-04 hayalet stok) haric. S1/S4 tum.
const nearCB = (x, yS, sgn) => CX.some((c) => Math.hypot(x - c, yS - sgn * 7.5) <= 4.8);
const ZONE = { S2: { ad: 'havsa r<=4,8', f: (x, y) => nearCB(x, y, -1) }, S3: { ad: 'havsa r<=4,8 + yarik X40..55 Y0..23', f: (x, y) => nearCB(x, y, 1) || (x >= 40 && x <= 55 && y >= -15.5 && y <= 7.5) } };
function analyze(S, hm, sr) {
  const zf = ZONE[S.id]?.f || (() => true);
  const rem = sr.remainBySetup?.[S.id] || sr.remainHeightmap; const RS = rem?.res ?? RES; const out = { res: RS, bolge: ZONE[S.id]?.ad || 'tum' };
  if (!rem || !hm || rem.nx !== hm.nx) return { hata: 'harita uyumsuz' };
  const cell = RS * RS; const nx = rem.nx; const cx = (i) => rem.x0 + (i + 0.5) * RS, cy = (j) => rem.y0 + (j + 0.5) * RS;
  const bins = [0.05, 0.3, 1, 3, 10]; const area = [0, 0, 0, 0, 0]; let vol = 0, mx = 0; const pts = [];
  for (let k = 0; k < rem.data.length; k++) { const m = hm.data[k]; const rv = rem.data[k]; if (!Number.isFinite(m) || !Number.isFinite(rv) || !zf(cx(k % nx), cy(Math.floor(k / nx)))) continue; const ex = rv - m; if (ex > 0.05) { vol += ex * cell; bins.forEach((b, bi) => { if (ex > b) area[bi] += cell; }); if (ex > mx) mx = ex; pts.push([r3(cx(k % nx)), r3(cy(Math.floor(k / nx))), r3(ex)]); } }
  out.model_ustu_artik = { esik_mm: bins, alan_mm2: area.map(r3), hacim_mm3: r3(vol), max_mm: r3(mx), en_buyuk: pts.sort((a, b) => b[2] - a[2]).slice(0, 10) };
  out.kaldirilan_hacim_mm3 = r3(sr.removedVolume);
  { const tiles = {}; for (const [x, y, e] of pts) if (e > 1) { const k = `${Math.floor(x / 10) * 10},${Math.floor(y / 10) * 10}`; const t = (tiles[k] ||= { kare_x_y: k, alan_mm2: 0, max_mm: 0 }); t.alan_mm2 += cell; t.max_mm = Math.max(t.max_mm, e); }
    out.artik_10mm_kareler_gt1mm = Object.values(tiles).sort((a, b) => b.alan_mm2 - a.alan_mm2).slice(0, 14).map((t) => ({ ...t, alan_mm2: r3(t.alan_mm2), max_mm: r3(t.max_mm) })); }
  let under = 0, umax = 0; for (let k = 0; k < rem.data.length; k++) { const m = hm.data[k]; const rv = rem.data[k]; if (Number.isFinite(m) && Number.isFinite(rv) && zf(cx(k % nx), cy(Math.floor(k / nx))) && m - rv > 0.05) { under += cell; umax = Math.max(umax, m - rv); } }
  out.oyma_alan_mm2 = r3(under); out.oyma_max_mm = r3(umax);
  return out;
}
function ncStats(text) {
  const lines = text.split(/\r?\n/); const code = lines.map((l) => l.replace(/\([^)]*\)/g, '')).join('\n'); const cnt = (re) => (code.match(re) || []).length;
  const A = [...code.matchAll(/(?:^|\s)A(-?\d+(?:\.\d+)?)/gm)].map((m) => m[1]);
  const aLines = []; lines.forEach((l, i) => { if (/(?:^|\s)A-?\d/.test(l.replace(/\([^)]*\)/g, ''))) aLines.push({ satir: i + 1, metin: l.trim() }); });
  const g84 = []; lines.forEach((l, i) => { if (/\bG84\b|\bG74\b/.test(l)) g84.push({ satir: i + 1, metin: l.trim() }); });
  return { satir: lines.length, bayt: Buffer.byteLength(text), G81: cnt(/\bG81\b/g), G83: cnt(/\bG83\b/g), G84: cnt(/\bG84\b/g), G41: cnt(/\bG41\b/g), G42: cnt(/\bG42\b/g), A: A.length, A_degerleri: [...new Set(A)], A_satirlari: aLines.slice(0, 12), G84_satirlari: g84.slice(0, 6), M6: cnt(/\bM0?6\b/g), M8: cnt(/\bM0?8\b/g), M5: cnt(/\bM0?5\b/g), G2G3: cnt(/\bG0?[23]\b/g), G1: cnt(/\bG0?1\b/g) };
}
const NUM = { S1: 2007, S2: 2008, S3: 2009, S4: 2010 };
const FNAME = { S1: 'S1_Ust', S2: 'S2_Zeksi', S3: 'S3_Zarti', S4: 'S4_Alt' };
for (const rec of progs) {
  const S = rec.S; const num = NUM[rec.id];
  if (!rec.tps.length) { rec.program = null; continue; }
  let program; try { program = CAM.buildProgram({ name: 'O' + num, number: num, machine: M, sections: [{ setup: S, toolpaths: rec.tps }] }); } catch (e) { rec.build_hata = opError(e); log('build hata', JSON.stringify(rec.build_hata)); continue; }
  const bb = [S.stockBox.min[0], S.stockBox.min[1], S.stockBox.max[0], S.stockBox.max[1]];
  const ts = now(); let hm; try { hm = K.camHeightmap({ bodies: [bid], frame: S.frame, res: RES, bbox: bb }); } catch (e) { rec.hm_hata = opError(e); }
  rec.hm_s = r3(now() - ts); rec.hm = hm;
  const tg = now();
  const gl = CAM.gates(program, M, { sim: NOSIM ? false : { res: RES, modelHeightmaps: hm ? { [S.id]: hm } : undefined, tools: simTools } });
  rec.gates_s = r3(now() - tg);
  rec.gates = gl.map((g) => ({ level: g.level, code: g.code, params: g.params, opId: g.opId ?? null, moveIndex: g.moveIndex ?? null }));
  rec.blocked = gl.some((g) => g.level === 'block'); rec.program = program;
  const kodlar = {}; for (const g of gl) { const k = `${g.level} ${g.code}`; kodlar[k] = (kodlar[k] || 0) + 1; } rec.kapi_ozet = kodlar;
  log(`${rec.id} kapilar ${rec.gates_s}s: block ${gl.filter((g) => g.level === 'block').length}, warn ${gl.filter((g) => g.level === 'warn').length}`, JSON.stringify(kodlar));
  if (!NOSIM) {
    const tsm = now();
    try {
      const sr = simulate(program, { res: RES, stockBoxes: { [S.id]: S.stockBox }, modelHeightmaps: hm ? { [S.id]: hm } : undefined, tools: simTools });
      rec.sim_s = r3(now() - tsm); rec.sim_issue_say = sr.issues.length; rec.sim_issue_kod = Object.fromEntries([...new Set(sr.issues.map((i) => i.code))].map((c) => [c, sr.issues.filter((i) => i.code === c).length])); rec.sim_suppressed = sr.suppressed; rec.kalan = analyze(S, hm, sr);
      rec.sim_issues = sr.issues.slice(0, 80).map((i) => ({ level: i.level, code: i.code, op: i.params?.op ?? null, x: r3(i.params?.x), y: r3(i.params?.y), z: r3(i.params?.z), depth: r3(i.params?.depth), cells: i.params?.cells, moveIndex: i.moveIndex }));
      rec.sr = sr;
    } catch (e) { rec.kalan = { hata: opError(e) }; }
  }
  const tp0 = now(); const base = `P4_${FNAME[rec.id]}_mihenk`;
  try { const nc = postProgram(program, M, { gates: gl, date: '2026-11-19' }); rec.post = { ok: true, s: r3(now() - tp0), dosya: path.join('out', base + SUF + '.nc') }; fs.writeFileSync(path.join(OUT, base + SUF + '.nc'), nc.text); rec.nc = ncStats(nc.text); rec.post.uyarilar = nc.warnings; }
  catch (e) {
    rec.post = { ok: false, s: r3(now() - tp0), hata: opError(e) };
    try {
      const warnOnly = gl.filter((g) => g.level !== 'block');
      const nc = postProgram(program, M, { gates: warnOnly, date: '2026-11-19' });
      const hdr = ['(*** BLOKLU: kapilar block verdi -> normalde NC URETILMEZ; yalniz yapi karsilastirmasi icin zorla uretildi ***)', ...gl.filter((g) => g.level === 'block').slice(0, 40).map((g) => `(BLOCK ${g.code} ${JSON.stringify(g.params).replace(/[()]/g, '')})`)].join('\n') + '\n';
      const f = `${base}_BLOKLU${SUF}.nc`; fs.writeFileSync(path.join(OUT, f), hdr + nc.text); rec.nc_bloklu = { dosya: path.join('out', f), baslik_satir: hdr.split('\n').length - 1, ...ncStats(nc.text) };
    } catch (e2) { rec.nc_bloklu = { hata: opError(e2) }; }
  }
}

// ------------------------------------------------------------------ 7b. ek deneyler (birincil sonuclari DEGISTIRMEZ)
const sumG = (gl) => { const b = {}; for (const g of gl.filter((x) => x.level === 'block')) { const k = `${g.code}${g.params?.op ? ' ' + g.params.op : ''}`; b[k] = (b[k] || 0) + 1; } return { block: b, block_say: gl.filter((x) => x.level === 'block').length, warn_say: gl.filter((x) => x.level === 'warn').length }; };
const exp = async (label, fn) => { try { const t = now(); R.deneyler[label] = await fn(); R.deneyler[label].s = r3(now() - t); log('deney', label, JSON.stringify(R.deneyler[label]).slice(0, 900)); } catch (e) { R.deneyler[label] = { hata: opError(e) }; log('deney HATA', label, JSON.stringify(opError(e))); } };
const gatesNoSim = (rec, tps) => { const program = CAM.buildProgram({ name: 'OX', number: 1, machine: M, sections: [{ setup: rec.S, toolpaths: tps }] }); return CAM.gates(program, M, { sim: false }); };
const gatesSim = (rec, tps, res = RES) => { const S = rec.S; const program = CAM.buildProgram({ name: 'OX', number: 1, machine: M, sections: [{ setup: S, toolpaths: tps }] }); const bb = [S.stockBox.min[0], S.stockBox.min[1], S.stockBox.max[0], S.stockBox.max[1]]; const hm = res === RES ? rec.hm : K.camHeightmap({ bodies: [bid], frame: S.frame, res, bbox: bb }); return CAM.gates(program, M, { sim: { res, modelHeightmaps: { [S.id]: hm }, tools: simTools } }); };
const swap = (rec, id, tp) => rec.tps.map((t) => (t.opId === id ? tp : t));
const tool = (n, o) => ({ ...tools.find((q) => q.number === n), ...o });
{
  const r1 = progs.find((r) => r.id === 'S1');
  if (r1 && !NOSIM && !NOEXP) {
    await exp('E1_S1_c4_9_ham_kesit_Y15', async () => { const op = clone(S1.ops.find((o) => o.id === 'c4_9')); op.geom = [sk('sRaw15', 'all', 'outer')]; const tp = await computeOne(r1.S, op); return { aciklama: 'duvar konturu gercek govde Y15 kesitiyle (dolgusuz): +X yuzunde X yonlu O5,5 delik (Y12,25..17,75, Z-25) tek kesitte centik -> takim Y9..22 boyunca centige girer', kesme_mm: r3(tp.stats.cutLen), ...sumG(gatesSim(r1, swap(r1, 'c4_9', tp))) }; });
    await exp('E2_S1_o9_T33_D6.0', async () => { const tp = await computeOne(r1.S, S1.ops.find((o) => o.id === 'o9'), tool(33, { dia: 6.0 })); return { aciklama: 'o9 matkap O6,1 -> O6,0 (model deligi O6): gouge kalkar mi', ...sumG(gatesSim(r1, swap(r1, 'o9', tp))) }; });
    await exp('E3a_S1_o11_T39_D2.45', async () => { const tp = await computeOne(r1.S, S1.ops.find((o) => o.id === 'o11'), tool(39, { dia: 2.45 })); return { aciklama: 'o11 matkap O2,5 -> O2,45 (model M3 kucuk capi O2,459): gouge kalkar mi', ...sumG(gatesSim(r1, swap(r1, 'o11', tp))) }; });
    await exp('E3b_S1_o11_uc_Y14.6', async () => { const op = clone(S1.ops.find((o) => o.id === 'o11')); op.depth = { from: 'abs', tipComp: false, z: z1(14.6) }; const tp = await computeOne(r1.S, op); return { aciklama: 'o11 uc Y14,3 -> 14,6 (140 derece matkap, modelde 118 derece delik ucu Y14,26): gouge kalkar mi', ...sumG(gatesSim(r1, swap(r1, 'o11', tp))) }; });
    await exp('E6_S1_o12_T40_D2.45', async () => { const tp = await computeOne(r1.S, S1.ops.find((o) => o.id === 'o12'), tool(40, { dia: 2.45 })); return { aciklama: 'o12 kilavuz sim capi O3 -> O2,45 (model deligi dis kucuk capinda O2,459): kilavuz gouge kok nedeni', ...sumG(gatesSim(r1, swap(r1, 'o12', tp))) }; });
    await exp('E4_S1_T22_bodyLen_30', async () => { const tp = await computeOne(r1.S, S1.ops.find((o) => o.id === 'o7'), tool(22, { bodyLen: 30 })); return { aciklama: 'o7 T22 govde 25 -> 30 (body_short ilk stok ustunu esas alir, T-08)', ...sumG(gatesNoSim(r1, swap(r1, 'o7', tp))) }; });
    await exp('E7_S1_o7_T22_bodyLen_24', async () => { const T22b = tool(22, { bodyLen: 24 }); const tp = await computeOne(r1.S, S1.ops.find((o) => o.id === 'o7'), T22b); const S = r1.S; const program = CAM.buildProgram({ name: 'OX', number: 1, machine: M, sections: [{ setup: S, toolpaths: swap(r1, 'o7', tp) }] }); const sr = simulate(program, { res: RES, stockBoxes: { [S.id]: S.stockBox }, modelHeightmaps: { [S.id]: r1.hm }, tools: simTools }); const hc = sr.issues.filter((i) => i.code === 'cam.sim.holder_collision'); return { aciklama: 'Plan uyarisi: T22 tasma 25 ile kulak havsasinda (Y6) tutucu alt kenari Y31 = boss ustu. Govde 24 alinirsa tutucu 1 mm asagida: sim tutucu carpmasini goruyor mu', holder_collision: hc.length, ornek: hc.slice(0, 2).map((i) => ({ op: i.params?.op, x: r3(i.params?.x), y: r3(i.params?.y), z: r3(i.params?.z), depth: r3(i.params?.depth) })) }; });
    await exp('E5_S1_res_0.25', async () => ({ aciklama: 'ayni S1 programi, sim res 0,25', ...sumG(gatesSim(r1, r1.tps, 0.25)) }));
  }
}

// T-04 zincir deneyi: tum setup'lar tek programda, sim setup n+1 baslangic stogunu setup n'in son stogundan kurar
// (ana kapi sayilari setup basina ayri program: karsilastirma icin degismez). P_NOCHAIN=1 ile atlanir.
if (!NOSIM && !process.env.P_NOCHAIN) {
  const okr = progs.filter((r) => r.program && r.hm);
  try {
    const tz = now(); const pz = CAM.buildProgram({ name: 'OZ', number: 1, machine: M, sections: okr.map((r) => ({ setup: r.S, toolpaths: r.tps })) });
    const gz = CAM.gates(pz, M, { sim: { res: RES, modelHeightmaps: Object.fromEntries(okr.map((r) => [r.S.id, r.hm])), tools: simTools } });
    const by = {}; for (const g of gz) { const id = g.section != null ? pz.sections[g.section].setup.id : 'genel'; const k = `${g.level} ${g.code}`; (by[id] ||= { block: 0, kod: {} }); if (g.level === 'block') by[id].block++; by[id].kod[k] = (by[id].kod[k] || 0) + 1; }
    R.deneyler.T04_zincir = { aciklama: 'tek program, setup zinciri (sim chain)', s: r3(now() - tz), setup: Object.fromEntries(Object.entries(by).map(([id, v]) => [id, { block: v.block, kod: Object.fromEntries(Object.entries(v.kod).filter(([k]) => k.startsWith('block') || k.includes('sim'))) }])) };
  } catch (e) { R.deneyler.T04_zincir = { hata: opError(e) }; }
  log('deney T04_zincir', JSON.stringify(R.deneyler.T04_zincir));
}
// ------------------------------------------------------------------ cikti
R.sure_s = r3(now() - t0);
{ // Fusion islem no -> Mihenk islem ozeti (+ Fusion sayilari, JSON'dan)
  const fus = {}; try { const fj = JSON.parse(fs.readFileSync(FUSION_JSON, 'utf8')); for (const st of fj.setups) st.islemler.forEach((o) => { const no = Number(o.ad.split(' ')[0]); fus[no] = { setup: st.kod, ad: o.ad, strateji: o.strateji, isleme_s: o.isleme_s, kesme_mm: o.kesme_yolu_mm, hizli_mm: o.hizli_yolu_mm, hesap_s: o.hesap_s }; }); } catch { /* yok */ }
  const g = {}; for (const rec of R.setups) for (const o of rec.islemler) { const k = o.fop; g[k] ||= { fop: k, setup: rec.id, mihenk_islem_say: 0, ok_say: 0, hata_say: 0, mihenk_sure_s: 0, mihenk_kesme_mm: 0, mihenk_hizli_mm: 0, mihenk_hesap_s: 0, hatalar: [], uyari_kodlari: {} }; const e = g[k]; e.mihenk_islem_say++; if (o.ok) { e.ok_say++; e.mihenk_sure_s += o.sure_s; e.mihenk_kesme_mm += o.kesme_mm; e.mihenk_hizli_mm += o.hizli_mm; for (const w of o.uyarilar) e.uyari_kodlari[w.code] = (e.uyari_kodlari[w.code] || 0) + 1; } else { e.hata_say++; e.hatalar.push({ id: o.id, ad: o.ad, hata: o.hata }); } e.mihenk_hesap_s += o.hesap_s || 0; }
  for (const e of Object.values(g)) { for (const k of ['mihenk_sure_s', 'mihenk_kesme_mm', 'mihenk_hizli_mm', 'mihenk_hesap_s']) e[k] = r3(e[k]); e.fusion = fus[e.fop] || null; }
  R.fop_ozet = Object.values(g).sort((a, b) => a.fop - b.fop);
}
for (const rec of R.setups) { delete rec.S; delete rec.tps; delete rec.hm; delete rec.sr; if (rec.program) { rec.tahmini_sure_s = r3(rec.islemler.filter((o) => o.ok).reduce((a, o) => a + o.sure_s, 0)); } delete rec.program; }
R.fusion = fs.existsSync(FUSION_JSON) ? JSON.parse(fs.readFileSync(FUSION_JSON, 'utf8')) : null;
if (R.fusion) delete R.fusion.nc_tam;
fs.writeFileSync(path.join(OUT, 'p4-mihenk-sonuc.json'), JSON.stringify(R, null, 1));
for (const rec of R.setups) {
  log(`\n== ${rec.id} ${rec.ad} (${rec.wcs}) tahmini ${rec.tahmini_sure_s}s`);
  if (rec.setup_hata) { log('  SETUP HATA', JSON.stringify(rec.setup_hata)); continue; }
  log('  kapi', JSON.stringify(rec.kapi_ozet));
  log('  sim', rec.sim_s, JSON.stringify(rec.sim_issue_kod));
  log('  post', JSON.stringify(rec.post).slice(0, 300), JSON.stringify(rec.nc ? { satir: rec.nc.satir, A: rec.nc.A_satirlari } : rec.nc_bloklu ? { satir: rec.nc_bloklu.satir, A: rec.nc_bloklu.A_satirlari } : {}));
  log('  kalan', JSON.stringify(rec.kalan ?? null).slice(0, 600));
}
log('\ntoplam s', R.sure_s, 'JSON:', path.join(OUT, 'p4-mihenk-sonuc.json'));
