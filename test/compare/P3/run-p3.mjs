// Fusion-Mihenk CAM karsilastirma testi, P3 (NIST FTC-06 blok, 4 setup / 18 islem) - MIHENK tarafi.
// Calistir:  node test/compare/P3/run-p3.mjs      (env: P3_STEP, P3_FUSION_JSON, P3_OUT, P3_RES, P3_BAND, P3_ONLY="S2,S3", P3_NOSIM=1)
// Kurallar: src/** degistirilmez (yalniz public API); NC dosyalari TEZGAHA GITMEZ.
// Cikti: test/compare/P3/out/*.nc ve out/p3-mihenk-sonuc.json (rapor bu JSON'dan yazilir).
// Plan: in/P3-PLAN.md (Fusion tarafiyla ayni girdiler). Plan'da OLMAYAN her deger ASSUME listesine yazilir.
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
const OUT = process.env.P3_OUT || path.join(here, 'out'); fs.mkdirSync(OUT, { recursive: true });
const STEP = process.env.P3_STEP || path.join(here, 'in', 'P3_NIST_FTC06_blok.stp');
const FUSION_JSON = process.env.P3_FUSION_JSON || path.join(here, 'in', 'P3_fusion_rapor.json');
const RES = Number(process.env.P3_RES || 1.0);
const BAND = Number(process.env.P3_BAND || 1.0);          // 3D kontur karsiligi z-seviye bandi (mm)
const ONLY = (process.env.P3_ONLY || 'S1,S2,S3,S4').split(',');
const NOSIM = !!process.env.P3_NOSIM;
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
const doc = { params: [], features: [{ id: 'imp', type: 'import', format: 'step', data: fs.readFileSync(STEP).toString('base64'), name: 'P3_NIST_FTC06_blok' }] };
const t0 = now();
const rb0 = await K.rebuild(doc);
R.import = { sure_s: r3(now() - t0), durum: rb0.status, govde: rb0.bodies.map((b) => ({ id: b.id, yuz: b.nFaces, bbox: b.bbox, hacim: r3(b.volume) })), docErrors: rb0.docErrors, rebuild_holes_sayisi: (rb0.holes || []).length };
const bid = rb0.bodies[0]?.id; if (!bid) { log('STEP ice aktarma basarisiz', JSON.stringify(R.import)); process.exit(1); }
{ const [mn, mx] = rb0.bodies[0].bbox; R.import.bbox_plan = { beklenen: [[-152.4, 0, -247.65], [152.4, 97.79, 0]], bulunan: [mn.map(r3), mx.map(r3)], hacim_plan: 3323546 }; }
log('import', JSON.stringify(R.import).slice(0, 400));

// ------------------------------------------------------------------ 2. geometri: kernel kesitleri (camSection) -> eskiz
// Her setup icin "model" cerceveleri (o = 0): kesit (u,v) = setup ekseni uzayinda.  S1: z=+Y, y=-Z; S2: z=-Z, y=-Y; S3: z=+Z, y=+Y.
const F1 = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0] };
const F2 = { o: [0, 0, 0], x: [1, 0, 0], y: [0, -1, 0], z: [0, 0, -1] };
const F3 = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const sec = (fr, z) => K.camSection({ body: bid, frame: fr, z }).loops;
// (u,v) -> eskiz yerel (a,b); plan = eskiz duzlemi
const MAPS = {
  M1: { map: (p) => [p[0], -p[1]], mirror: true, plane: (lvl) => ({ kind: 'base', name: 'XZ', offset: String(lvl) }) },     // lvl = Y
  M2: { map: (p) => [p[0], -p[1]], mirror: true, plane: (s) => ({ kind: 'base', name: 'XY', offset: String(-s) }) },         // lvl = s (Z = -s)
  M3: { map: (p) => [p[0], p[1]], mirror: false, plane: (s) => ({ kind: 'base', name: 'XY', offset: String(s) }) },          // lvl = s (Z = s)
};
const polyOf = (loop) => { const pts = []; for (const g of loop) { let q; if (g.type === 'arc') { const n = Math.max(8, Math.ceil(Math.abs(g.sweep) / 0.2)); q = []; for (let i = 0; i <= n; i++) { const a = g.a0 + g.sweep * i / n; q.push([g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)]); } } else q = [g.p0, g.p1]; if (g.fwd === false) q = q.slice().reverse(); pts.push(...q.slice(0, -1)); } return pts; };
const sarea = (loop) => { const p = polyOf(loop); let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
const bbox = (loop) => { let mn = [1e9, 1e9], mx = [-1e9, -1e9]; for (const g of loop) { const ps = g.type === 'arc' ? [[g.c[0] - g.r, g.c[1] - g.r], [g.c[0] + g.r, g.c[1] + g.r]] : [g.p0, g.p1]; for (const p of ps) { mn = [Math.min(mn[0], p[0]), Math.min(mn[1], p[1])]; mx = [Math.max(mx[0], p[0]), Math.max(mx[1], p[1])]; } } return { mn, mx, w: mx[0] - mn[0], h: mx[1] - mn[1], c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2] }; };
const isCircle = (l) => l.length === 1 && l[0].type === 'arc' && Math.abs(l[0].sweep) >= 2 * Math.PI - 1e-6;
const circ = (c, r) => [{ type: 'arc', c, r, a0: 0, sweep: 2 * Math.PI, p0: [c[0] + r, c[1]], p1: [c[0] + r, c[1]], fwd: true }];
const poly = (pts) => pts.map((p, i) => ({ type: 'line', p0: p, p1: pts[(i + 1) % pts.length], fwd: true }));
const rect = (u0, v0, u1, v1) => poly([[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
function mkSketch(id, M, lvl, loops) {
  const points = {}; const ents = []; const key = (p) => p.map((v) => Math.round(v * 1e5)).join(','); const pid = new Map(); let n = 0, ei = 0;
  const P = (p) => { const q = M.map(p); const k = key(q); if (!pid.has(k)) { const i = 'p' + (++n); pid.set(k, i); points[i] = { x: q[0], y: q[1] }; } return pid.get(k); };
  for (const loop of loops) {
    if (isCircle(loop)) { ents.push({ id: 'e' + (ei++), type: 'circle', c: P(loop[0].c), r: loop[0].r }); continue; }
    for (const g of loop) {
      if (g.type === 'line') ents.push({ id: 'e' + (ei++), type: 'line', a: P(g.p0), b: P(g.p1) });
      else if (g.type === 'arc') { const a = P(g.p0), b = P(g.p1); ents.push({ id: 'e' + (ei++), type: 'arc', c: P(g.c), a: M.mirror ? b : a, b: M.mirror ? a : b }); }
      else throw new Error('desteklenmeyen kesit parcasi ' + g.type);
    }
  }
  return { id, type: 'sketch', plane: M.plane(lvl), points, ents };
}
const BOXOUT = (M) => rect(-165.4, -13, 165.4, 260.65);   // S1: stok (308,8 x 251,65 [v -2..249,65]) + 11 mm (u,v)
const sketches = []; const addSk = (id, M, lvl, loops) => { sketches.push(mkSketch(id, M, lvl, loops)); return id; };

// ---- S1 ham geometri parcalari
const STOCK_X = 154.4, STOCK_Y0 = -2, STOCK_Y1 = 99.79, STOCK_S0 = -2, STOCK_S1 = 249.65; // stok (model)
// maksimum silüet: plaka dikdortgeni + 4 boss dikdortgeni (ekvator genisligi 2*22,225, v 247,65'e kadar)
const BOSSX = [-108.59, -36.2, 36.2, 108.59], BR = 22.225;
const FRONT_PLATE = poly([[-152.4, 0], [152.4, 0], [152.4, 234.95], ...[...BOSSX].reverse().flatMap((cx) => [[cx + BR, 234.95], [cx + BR, 247.65], [cx - BR, 247.65], [cx - BR, 234.95]]), [-152.4, 234.95]]);
// on duvar (v 209,55..234,95) + boss dikdortgenleri; dolgu ofseti verilebilir (v alt siniri)
const frontWall = (vLo) => poly([[-152.4, vLo], [152.4, vLo], [152.4, 234.95], ...[...BOSSX].reverse().flatMap((cx) => [[cx + BR, 234.95], [cx + BR, 247.65], [cx - BR, 247.65], [cx - BR, 234.95]]), [-152.4, 234.95]]);
const pick = (loops, f) => loops.filter((l) => f(l, bbox(l)));
const SPH = [[-114.3, 107.95], [114.3, 107.95]], POST = [[-76.2, 158.75], [76.2, 158.75]];
const near2 = (c, t, tol = 3) => Math.hypot(c[0] - t[0], c[1] - t[1]) < tol;
const backLoops = (ls) => pick(ls, (l, b) => b.mn[1] < 1 && sarea(l) > 0);
const frontLoops = (ls) => pick(ls, (l, b) => b.mn[1] > 205 && sarea(l) > 0);
const postLoops = (ls) => pick(ls, (l, b) => isCircle(l) && POST.some((p) => near2(b.c, p)) && sarea(l) > 0);
const sphLoops = (ls) => pick(ls, (l, b) => isCircle(l) && SPH.some((p) => near2(b.c, p)) && sarea(l) > 0);
// "tavan" sorunu: Y kesitinde delik/tunel (ustte malzeme = tavan) yarik gibi gorunur -> 2,5D'de takim tavana carpar.
// Onlem: on boss seritleri (delik ile bolunmus yarilar dahil) bbox dikdortgeni; arka duvar uc parcalari (v 0..31,75; O14,29 tunel + O20,64 havsa) bbox dikdortgeni.
const fixFront = (ls) => { const fl = frontLoops(ls); const out = []; for (const cx of BOSSX) { const g = fl.filter((l) => Math.abs(bbox(l).c[0] - cx) < BR); if (!g.length) continue; const bs = g.map(bbox); out.push(rect(Math.min(...bs.map((b) => b.mn[0])), Math.min(...bs.map((b) => b.mn[1])), Math.max(...bs.map((b) => b.mx[0])), Math.max(...bs.map((b) => b.mx[1])))); } return out; };
const fixBack = (ls) => { const bl = backLoops(ls); const ends = bl.filter((l) => { const b = bbox(l); return b.mx[1] <= 31.8 && Math.abs(b.c[0]) > 60; }); const rest = bl.filter((l) => !ends.includes(l)); const out = [...rest];
  for (const sg of [-1, 1]) { const g = ends.filter((l) => Math.sign(bbox(l).c[0]) === sg); if (!g.length) continue; const bs = g.map(bbox); out.push(rect(Math.min(...bs.map((b) => b.mn[0])), 0, Math.max(...bs.map((b) => b.mx[0])), Math.max(...bs.map((b) => b.mx[1])))); }
  return out; };
const sphEq = () => SPH.map((c) => circ(c, 15.875));
const pitLoops = (ls) => pick(ls, (l, b) => sarea(l) < 0 && Math.abs(b.c[0]) < 1 && b.c[1] > 8 && b.c[1] < 24);

const sec318 = sec(F1, 31.8), sec25 = sec(F1, 25);
R.geometri = { sec31_8: sec318.length, back318: backLoops(sec318).length, front318: frontLoops(sec318).length, post318: postLoops(sec318).length, sph318: sphLoops(sec318).length };
// ham islem bantlari (yukaridan asagi): bant alt kesiti = ada (yukari daralan sekil); ozellik tepelerinde (direk 85,09; kure 79,375; boss 73,03) bant sinirlari
const RB = [
  { id: 'R1a', top: null, bot: 91.4, secY: 91.45 }, { id: 'R1b', top: 91.6, bot: 85.09, secY: 85.14 }, { id: 'R2', top: 85.29, bot: 79.375, secY: 79.43 },
  { id: 'R3', top: 79.575, bot: 73.03, secY: 73.08 }, { id: 'R4', top: 73.23, bot: 66.0, secY: 66.0 }, { id: 'R5a', top: 66.2, bot: 59.0, secY: 59.0 },
  { id: 'R5b', top: 59.2, bot: 52.1, secY: 52.1 }, { id: 'R6', top: 52.3, bot: 31.75, secY: 31.8 },
];
const islands = (b) => {
  const ls = sec(F1, b.secY); const out = [...fixBack(ls)];
  if (b.bot >= 50.8) out.push(...fixFront(ls)); else out.push(frontWall(206.375));
  out.push(...postLoops(ls));
  if (b.bot >= 63.5) out.push(...sphLoops(ls)); else if (b.bot < 79.375) out.push(...sphEq());
  return out;
};
for (const b of RB) { b.sk = addSk('s' + b.id, MAPS.M1, b.secY, [BOXOUT(), ...islands(b)]); }
const sRing = addSk('sRing', MAPS.M1, 31.95, [BOXOUT(), FRONT_PLATE]);
const sLow = RB[RB.length - 1].sk;   // R6 = plaka ustu kesiti (Y=31,8)
const sOut = addSk('sOut', MAPS.M1, 36, [FRONT_PLATE]);                                                  // 2D kontur dis silueti (elle)
{
  const gaps = [[-152.4, -134.0], [-83.19, -61.6], [-10.8, 10.8], [61.6, 83.19], [134.0, 152.4]];
  addSk('sHFront', MAPS.M1, 50.8, gaps.map(([a, b]) => rect(a, 209.55, b, 234.95)));
}
const sHSlot = addSk('sHSlot', MAPS.M1, 52.07, [rect(82.55 - 6.35, -6, 82.55 + 6.35, 38), rect(-82.55 - 6.35, -6, -82.55 + 6.35, 38)]);
const sHPost = addSk('sHPost', MAPS.M1, 85.09, POST.map((c) => circ(c, 9.525)));
const cbLoops = pick(sec25, (l, b) => isCircle(l) && Math.abs(b.w - 15.875) < 0.1);
const sCB = addSk('sCB', MAPS.M1, 25, cbLoops);
const postHole = pick(sec(F1, 80), (l, b) => isCircle(l) && Math.abs(b.w - 6.35) < 0.1);
const sPostHole = addSk('sPostHole', MAPS.M1, 80, postHole);
R.geometri.cb = cbLoops.length; R.geometri.postHole = postHole.length;
// 3D kontur karsiligi z-seviye bantlari (S1): her bant icin eskiz (bant alt kesiti)
const bands = [];
{
  const yTop = 97.79, yBot = 34.925;
  for (let y = yTop; y > yBot + 1e-6; y -= BAND) {
    const yl = Math.max(yBot, y - BAND); const ls = sec(F1, yl + 1e-3); const loops = [];
    loops.push(...fixBack(ls));
    if (yl >= 50.8) loops.push(...fixFront(ls)); else loops.push(frontWall(209.55));
    loops.push(...postLoops(ls));
    if (yl >= 63.5) loops.push(...sphLoops(ls));
    const id = `sB${bands.length}`; addSk(id, MAPS.M1, yl, loops);
    const pit = pitLoops(ls); let pid = null; if (pit.length) { pid = `sP${bands.length}`; addSk(pid, MAPS.M1, yl, pit.map((l) => l.slice())); }
    bands.push({ id, pid, top: r3(y), bot: r3(yl), nLoop: loops.length, nPit: pit.length });
  }
}
R.geometri.bantlar = bands.length;
addSk('sRaw', MAPS.M1, 70.79, backLoops(sec(F1, 70.791)));   // E6: ham kesit (tavan duzeltmesiz) deneyi icin
// ---- S2 / S3 geometri
const s2a = sec(F2, 238.2), s2c = sec(F2, 245);
const bossCirc = (ls) => pick(ls, (l, b) => isCircle(l) && b.w > 40 && sarea(l) > 0);
const cbBoss = pick(s2c, (l, b) => isCircle(l) && Math.abs(b.w - 10.16) < 0.1);
R.geometri.s2 = { boss238: bossCirc(s2a).length, cb245: cbBoss.length };
const BOX2 = rect(-165.4, -13, 165.4, 110.79).map((g) => ({ ...g })); // S2 stok: X +-154,4, Y -2..99,79, (u,v)=(X,-Y) -> v -99,79..2 -> kutu 11 mm
const BOX2uv = rect(-165.4, -110.79, 165.4, 13);
addSk('sS2a', MAPS.M2, 238.2, [BOX2uv, ...bossCirc(s2a)]);
addSk('sS2hf', MAPS.M2, 234.95, [rect(-160, -80, 160, 6), ...BOSSX.map((cx) => circ([cx, -50.8], BR))]);
addSk('sS2hb', MAPS.M2, 247.65, bossCirc(s2a).map((l) => circ(bbox(l).c, BR)));
addSk('sS2ct', MAPS.M2, 240, bossCirc(s2a).map((l) => circ(bbox(l).c, BR)));
addSk('sS2cb', MAPS.M2, 245, cbBoss);
const sec3f = sec(F3, -0.17), sec3h = sec(F3, -10);
const holes14 = pick(sec3h, (l, b) => isCircle(l) && Math.abs(b.w - 14.288) < 0.05);
addSk('sS3f', MAPS.M3, -0.17, sec3f);
addSk('sS3h', MAPS.M3, -10, holes14);
R.geometri.s3 = { sec_back: sec3f.length, holes14: holes14.length };
doc.features.push(...sketches);
const ringIdx = (id) => { const sk = doc.features.find((f) => f.id === id); const reg = findRegions({ points: sk.points, ents: sk.ents }).regions; return { idx: reg.findIndex((x) => x.holes.length), n: reg.length, holes: reg.map((x) => x.holes.length) }; };
const RG = Object.fromEntries(['sRing', ...RB.map((b) => b.sk), 'sS2a', 'sS2hf', 'sS3f'].map((k) => [k, ringIdx(k)]));
R.geometri.bolge = RG; log('bolgeler', JSON.stringify(RG));
for (const k of ['sRing', ...RB.map((b) => b.sk), 'sS2a', 'sS2hf', 'sS3f']) if (RG[k].idx < 0) { log('BOLGE (delikli) YOK', k); process.exit(1); }
ASSUME('geometri/eskizler', 'kernel camSection kesitlerinden (setup eksenine dik duzlemler) eskiz; elle: maksimum silüet (plaka + 4 boss dikdortgeni), on duvar dolgusu, kure ekvator daireleri (R15,875), V yarik / direk ustu / on duvar ustu yatay bolgeleri', 'STEP\'ten yuz secimi yuz adi ister (ice aktarimda yok, T-09 P2)');
ASSUME('adaptive karsiligi', 'ham islem z-bantlari (ozellik tepelerinde bolunmus): R1a 97,79-91,4 / R1b 91,6-85,09 / R2 85,29-79,375 / R3 79,575-73,03 / R4 73,23-66 / R5a 66,2-59 / R5b 59,2-52,1 / R6 52,3-31,75 (ada = bant alt kesiti; kure alt yarisi icin ekvator dairesi R15,875; Y<50,8 on duvar dolgusu; delik/tunel tavani icin on boss ve arka uc parcalari bbox dikdortgeni) + halka 31,95..-0,2; her bant tek 2,5D pocket', 'Mihenk tek-z cep: yukari daralan seklin (kaburga egimi, direk konisi, V yanaklari, kure ust yarisi) basamaklari kalir; kure alt yarisi/boyun alt-kesim (Fusion plani ile ayni: R15,9 silindirik artik)');
ASSUME('3D kontur karsiligi', `z-seviye bantlari ${BAND} mm (kesit = bant altinda), her bant ayri contour islemi (stepdown = bant), bantlar Y97,79 -> 34,925 (R3,175 fileleri 34,925 altinda); kure yalniz Y>=63,5 bantlarinda (alt yarisi alt-kesim); kure cukuru ic kontur`, 'Plan: paso 1; Mihenk\'te 3D yuzey izleme yok, kesit eskizli bant = en yakin 2,5D');

// ------------------------------------------------------------------ 3. makine (Neway fixture KOPYASI)
const NEWAY = structuredClone(NEWAY_FIXTURE); // K-026: Neway artik yerlesik degil; kullanici profili ornegi (test/fixtures)
const M = copyMachine(NEWAY, 'test-p3-neway-kopya', 'P3 TEST Neway kopyasi (varsayimli)');
M.spindle.maxRpm = 8000; ASSUME('machine.spindle.maxRpm', 8000, 'Plan: devir <= 8000');
M.feed.maxCut = 5000; ASSUME('machine.feed.maxCut', 5000, 'Plan: ilerleme <= 5000');
M.feed.rapid = 24000; ASSUME('machine.feed.rapid', 24000, 'Plan\'da yok; yalniz sure tahmini icin test degeri (P1/P2 ile ayni)');
M.post = { props: { ...M.post.props, safeRetract: 'G28' } }; ASSUME('machine.post.props.safeRetract', 'G28', 'Fusion post: safePositionMethod = G28');
R.makine = { kopya_id: M.id, yerlesik_degismedi: JSON.stringify(NEWAY_FIXTURE) === JSON.stringify(NEWAY), checkMachine: checkMachine(M), A: M.axes?.A ?? null };

// ------------------------------------------------------------------ 4. takimlar
const HOLDER = { dia: 40, len: 50 }; ASSUME('tool.holder', 'O40 x 50 (P1/P2 ile ayni)', 'Plan: BT40 O40 silindir; tutucu boyu planda yok');
const tl = (n, o) => ({ id: 'T' + n, number: n, lengthOffset: n, diaOffset: n, centerCutting: true, holder: HOLDER, ...o });
const tools = [
  tl(20, { type: 'face', name: 'T20 D50 yuz frezesi 5 agiz', dia: 50, flutes: 5, fluteLen: 10, bodyLen: 40 }),
  tl(21, { type: 'flat', name: 'T21 D12 parmak 3 agiz', dia: 12, flutes: 3, fluteLen: 26, bodyLen: 40 }),
  tl(22, { type: 'flat', name: 'T22 D6 parmak 3 agiz', dia: 6, flutes: 3, fluteLen: 16, bodyLen: 25 }),
  tl(24, { type: 'spot', name: 'T24 D10 punta 90', dia: 10, tipAngle: 90, flutes: 2, fluteLen: 35, bodyLen: 35 }),
  tl(34, { type: 'flat', name: 'T34 D12 parmak 3 agiz EKSTRA UZUN', dia: 12, flutes: 3, fluteLen: 40, bodyLen: 105 }),
  tl(35, { type: 'bullnose', name: 'T35 D12 R3 koseli 3 agiz UZUN', dia: 12, cornerR: 3, flutes: 3, fluteLen: 35, bodyLen: 80 }),
  tl(36, { type: 'drill', name: 'T36 D10,5 matkap 140', dia: 10.5, tipAngle: 140, flutes: 2, fluteLen: 60, bodyLen: 60 }),
  tl(37, { type: 'drill', name: 'T37 D7,1 matkap 140', dia: 7.1, tipAngle: 140, flutes: 2, fluteLen: 50, bodyLen: 50 }),
];
ASSUME('T20/T21/T22/T24', 'P1/P2 degerleri (T20 agiz 10/govde 40; T21 26/40; T22 16/25; T24 2 agiz 35/35)', 'Plan: "ortak listeden"; P1 degerleri');
ASSUME('T34/T35/T36/T37', 'T34 agiz 40/tasma 105; T35 bullnose R3, agiz 35/tasma 80; T36 agiz=tasma=60 (2 agiz); T37 agiz=tasma=50 (2 agiz)', 'Plan tablosu: tasma; T36/T37 agiz boyu planda yok (tasma alindi, P2 T33 gibi)');
ASSUME('shaftDia', 'verilmedi (= kesici capi)', 'Plan\'da sap capi yok');
const simTools = Object.fromEntries(tools.map((t) => [t.number, { holder: HOLDER }]));

// ------------------------------------------------------------------ 5. setup'lar ve islemler
const H = { clearance: 15, retract: 5 }; ASSUME('heights.clearance/retract', '15 / 5 (stok ustunden)', 'Plan\'da yok (P1/P2 ile ayni)');
const hts = (top, bottom) => ({ ...H, top, bottom });
const T = (f, off = 0) => ({ from: f, off }); const ABS = (z) => ({ from: 'abs', off: z });
const cutd = (rpm, feedCut, feedPlunge) => ({ rpm, feedCut, feedPlunge, coolant: 'flood' });
const sk = (id, profiles = 'all', loops) => ({ kind: 'sketch', sketch: id, profiles, ...(loops ? { loops } : {}) });
const LEAD = { kind: 'arc', r: 3 }; const NOLEAD = { kind: 'none' }; ASSUME('contour leadIn/leadOut', 'yay r=3 (alternatif: none)', 'Plan\'da yok');
const z1 = (Y) => r3(Y - STOCK_Y1);        // S1: z=+Y, orijin stok ustu merkezi (Y 99,79)
const z2 = (s) => r3(s - STOCK_S1);        // S2: tasima ekseni -Z, s=-Z, stok ustu s=249,65
const z3 = (s) => r3(s - 2);               // S3: tasima ekseni +Z, s=Z, stok ustu s=2
const z4 = (Y) => r3(-Y - 2);              // S4: tasima ekseni -Y, stok ustu Y=-2
const baseFrame = (dir) => ({ zAxis: { kind: 'base', dir }, xAxis: { kind: 'base', dir: '+X' }, origin: { kind: 'stockTopCenter' } });
const STK = { kind: 'boxOffset', side: 2, top: 2, bottom: 2 };
const S1 = { id: 'S1', name: 'P3-S1 Ust', bodies: [bid], workOffset: { kind: 'G55' }, clearanceZ: 5, frame: baseFrame('+Y'), stock: STK, ops: [] };
// S2/S3: base cerceve z=+Y, A (rotary) ile etkin eksen; orijin = A ekseni uzerinde, donuk yonelimde stok ust merkezi (P1-S3 yontemi)
const S2 = { id: 'S2', name: 'P3-S2 On A', bodies: [bid], workOffset: { kind: 'G57' }, clearanceZ: 5,
  frame: { zAxis: { kind: 'base', dir: '+Y' }, xAxis: { kind: 'base', dir: '+X' }, origin: { kind: 'point', p: [0, 48.895, -249.65] } }, rotary: { enabled: true, aAngle: -90 }, stock: STK, ops: [] };
const S3 = { id: 'S3', name: 'P3-S3 Arka A', bodies: [bid], workOffset: { kind: 'G58' }, clearanceZ: 5,
  frame: { zAxis: { kind: 'base', dir: '+Y' }, xAxis: { kind: 'base', dir: '+X' }, origin: { kind: 'point', p: [0, 48.895, 2] } }, rotary: { enabled: true, aAngle: 90 }, stock: STK, ops: [] };
const S4 = { id: 'S4', name: 'P3-S4 Alt', bodies: [bid], workOffset: { kind: 'G59' }, clearanceZ: 5, frame: baseFrame('-Y'), stock: STK, ops: [] };
ASSUME('S1 yonu', 'zAxis +Y, xAxis +X, orijin stok ust merkezi (model Y=99,79); G55', 'Plan: S1 takim ekseni +Y');
ASSUME('S2 yonu / A', 'base z=+Y, rotary.aAngle = -90 -> etkin z = model -Z (A.dir=[-1,0,0] ile phi=+90); orijin = model (0, 48,895, -249,65) = stok ust merkezi (Fusion WCS orijini (0, 48,895, -249,65)); G57', 'Plan: S2 takim ekseni -Z, A ~ +-90; Fusion log: WCS orijin (0,488.95,-2496.5) Fusion birimi/10');
ASSUME('S3 yonu / A', 'base z=+Y, rotary.aAngle = +90 -> etkin z = model +Z; orijin = model (0, 48,895, 2); G58', 'Plan: S3 takim ekseni +Z; Fusion WCS orijin (0,488.95,20.00)/10');
ASSUME('S4 yonu', 'zAxis -Y, xAxis +X, orijin stok ust merkezi (model Y=-2); G59', 'Plan: S4 takim ekseni -Y');
ASSUME('S2/S3/S4 stok', 'S1 ile ayni kutu (308,8 x 101,79 x 251,65); Fusion "onceki setup\'tan stok" kullandi', 'Mihenk\'te "onceki setup\'tan stok" yok (T-04)');
ASSUME('S1/S2/S3/S4 clearanceZ', 5, 'setup.clearanceZ planda yok');

const OP = (id, type, name, toolId, rest, alts = []) => ({ id, type, name, toolId, alts, fop: null, ...rest });
const F = (fop, o) => ({ ...o, fop });    // Fusion islem no ile etiketle
const LEAVE = { radial: 0.3, axial: 0.2 }, NOLEAVE = { radial: 0, axial: 0 };
const ENTRY_H = { entry: { kind: 'helix', helixDia: 10, angle: 3 } };
const ALT_ENTRY = [{ entry: { kind: 'ramp', angle: 3 } }, { entry: { kind: 'plunge' } }];
const adaptive = (id, name, fop, tool, sketch, top, bottom, leave, idx, stepdown = 12) => F(fop, OP(id, 'pocket', name, tool, { ...cutd(8000, 1500, 500), heights: hts(top, bottom), geom: [sk(sketch, [idx])], stepover: 1.2, stepdown, stockToLeave: leave, ...ENTRY_H }, ALT_ENTRY));

// --- S1
S1.ops.push(F(1, OP('o1', 'face', '1 Yuzey T20', 'T20', { ...cutd(4500, 2250, 750), heights: hts(T('stockTop'), T('modelTop')), stepover: 40, stepdown: 1, stockToLeave: 0, direction: 0, extend: 2 })));
{
  let prevBot = null;
  for (const b of RB) {
    const top = prevBot == null ? T('modelTop') : ABS(z1(prevBot + 0.2));
    S1.ops.push(adaptive('o' + b.id, `2 Adaptive karsiligi ${b.id}: Y${b.top ?? 97.79}-${b.bot} (kesit Y=${b.secY}) T34`, 2, 'T34', b.sk, top, ABS(z1(b.bot)), LEAVE, RG[b.sk].idx));
    prevBot = b.bot;
  }
}
S1.ops.push(adaptive('oRing', '2 Adaptive karsiligi oRing: dis halka Y31,95--0,2 (maks. siluet) T34', 2, 'T34', 'sRing', ABS(z1(31.95)), ABS(z1(-0.2)), { radial: 0.3, axial: 0 }, RG.sRing.idx));
const FLOOR = (id, name, fop, sketchId, floorY, top, region = 'all', extra = {}) => F(fop, OP(id, 'pocket', name, 'T35', { ...cutd(8000, 1500, 500), heights: hts(ABS(z1(top ?? floorY + 0.2)), ABS(z1(floorY))), geom: [sk(sketchId, region)], stepover: 5, stepdown: 1, stockToLeave: NOLEAVE, entry: { kind: 'plunge' }, ...extra }, [{ entry: { kind: 'ramp', angle: 3 } }, ENTRY_H]));
S1.ops.push(FLOOR('o3a', '3a Yatay temizleme karsiligi: plaka ustu Y31,75 T35', 3, sLow, 31.75, null, [RG[sLow].idx]));
S1.ops.push(FLOOR('o3b', '3b Yatay temizleme karsiligi: on duvar ustu Y50,8 T35', 3, 'sHFront', 50.8));
S1.ops.push(FLOOR('o3c', '3c Yatay temizleme karsiligi: V yarik tabani Y52,07 T35', 3, 'sHSlot', 52.07));
S1.ops.push(FLOOR('o3d', '3d Yatay temizleme karsiligi: direk ustu Y85,09 T35', 3, 'sHPost', 85.09));
for (const b of bands) {
  S1.ops.push(F(4, OP('c' + b.id.slice(2), 'contour', `4 3D kontur karsiligi bant Y${b.bot}-${b.top} T35`, 'T35', { ...cutd(8000, 1500, 500), heights: hts(ABS(z1(b.top)), ABS(z1(b.bot))), geom: [sk(b.id, 'all', 'outer')], side: 'outside', dir: 'climb', stepdown: BAND, stockToLeave: NOLEAVE, leadIn: LEAD, leadOut: LEAD }, [{ leadIn: NOLEAD, leadOut: NOLEAD }])));
  if (b.pid) S1.ops.push(F(4, OP('p' + b.id.slice(2), 'contour', `4 3D kontur karsiligi kure cukuru bant Y${b.bot}-${b.top} T35`, 'T35', { ...cutd(8000, 1500, 500), heights: hts(ABS(z1(b.top)), ABS(z1(b.bot))), geom: [sk(b.pid, 'all', 'outer')], side: 'inside', dir: 'climb', stepdown: BAND, stockToLeave: NOLEAVE, leadIn: LEAD, leadOut: LEAD }, [{ leadIn: NOLEAD, leadOut: NOLEAD }])));
}
S1.ops.push(F(5, OP('o5', 'contour', '5 2D kontur dis siluet T34 (silhouette secici denemesi: yoksa elle maks. siluet)', 'T34', { ...cutd(8000, 1500, 500), heights: hts(ABS(z1(36)), ABS(z1(-0.2))), geom: [sk('sOut', 'all', 'outer')], side: 'outside', dir: 'climb', stepdown: 12, stockToLeave: NOLEAVE, leadIn: LEAD, leadOut: LEAD }, [{ leadIn: NOLEAD, leadOut: NOLEAD }])));
S1.ops.push(F(6, OP('o6', 'pocket', '6 Bore T21: 4x O15,875 havsa (cep + helis giris)', 'T21', { ...cutd(8000, 1800, 600), heights: hts(ABS(z1(31.75)), ABS(z1(19.05))), geom: [sk('sCB', 'all')], stepover: 4, stepdown: 1, stockToLeave: NOLEAVE, entry: { kind: 'helix', helixDia: 3, angle: 3 } }, [{ entry: { kind: 'ramp', angle: 3 } }, { entry: { kind: 'plunge' } }])));
S1.ops.push(F(7, OP('o7', 'drill', '7 Punta T24 (4x O10,54, 1,5 derin)', 'T24', { ...cutd(3000, 300, 300), heights: H, holes: { kind: 'feature', filter: { feature: 'P3plakaDelik' } }, cycle: 'spot', depth: { from: 'abs', tipComp: false, z: z1(17.55) }, order: 'asis' })));
S1.ops.push(F(8, OP('o8', 'drill', '8 Delme T36 G83 Q5 (4x O10,54, boydan boya +1)', 'T36', { ...cutd(3500, 500, 500), heights: H, holes: { kind: 'feature', filter: { feature: 'P3plakaDelik' } }, cycle: 'peck', peck: 5, depth: { from: 'hole', tipComp: true, breakThrough: 1 }, order: 'asis' })));
S1.ops.push(F(9, OP('o9', 'pocket', '9 Bore T22: 2x O6,35 direk deligi (cep + dalma)', 'T22', { ...cutd(8000, 960, 320), heights: hts(ABS(z1(85.09)), ABS(z1(72.39))), geom: [sk('sPostHole', 'all')], stepover: 1, stepdown: 1, stockToLeave: NOLEAVE, entry: { kind: 'plunge' } }, [{ entry: { kind: 'ramp', angle: 4 } }])));
// --- S2
S2.ops.push(adaptive('o10', '10 Adaptive karsiligi: boss disi s249,65-234,95 T34', 10, 'T34', 'sS2a', T('stockTop'), ABS(z2(234.95)), LEAVE, RG.sS2a.idx));
S2.ops.push(F(11, OP('o11a', 'pocket', '11a Yatay temizleme karsiligi: on yuz s234,95 T35', 'T35', { ...cutd(8000, 1500, 500), heights: hts(ABS(z2(235.15)), ABS(z2(234.95))), geom: [sk('sS2hf', [RG.sS2hf.idx])], stepover: 5, stepdown: 1, stockToLeave: NOLEAVE, entry: { kind: 'plunge' } }, [{ entry: { kind: 'ramp', angle: 3 } }, ENTRY_H])));
S2.ops.push(F(11, OP('o11b', 'pocket', '11b Yatay temizleme karsiligi: boss uc yuzleri s247,65 T35', 'T35', { ...cutd(8000, 1500, 500), heights: hts(T('stockTop'), ABS(z2(247.65))), geom: [sk('sS2hb', 'all')], stepover: 5, stepdown: 1, stockToLeave: NOLEAVE, entry: { kind: 'plunge' } }, [{ entry: { kind: 'ramp', angle: 3 } }, ENTRY_H])));
S2.ops.push(F(12, OP('o12', 'contour', '12 2D kontur T21: 4x boss dis cemberi (s247,65-234,95)', 'T21', { ...cutd(8000, 1800, 600), heights: hts(T('modelTop'), ABS(z2(234.95))), geom: [sk('sS2ct', 'all', 'outer')], side: 'outside', dir: 'climb', stepdown: 6.4, stockToLeave: NOLEAVE, leadIn: LEAD, leadOut: LEAD }, [{ leadIn: NOLEAD, leadOut: NOLEAD }])));
S2.ops.push(F(13, OP('o13', 'pocket', '13 Bore T22: 4x O10,16 havsa (cep, s247,65-239,71)', 'T22', { ...cutd(8000, 960, 320), heights: hts(T('modelTop'), ABS(z2(239.71))), geom: [sk('sS2cb', 'all')], stepover: 1, stepdown: 1, stockToLeave: NOLEAVE, entry: { kind: 'plunge' } }, [{ entry: { kind: 'ramp', angle: 4 } }])));
S2.ops.push(F(14, OP('o14', 'drill', '14 Punta T24 (4x O7,14, 1,5 derin)', 'T24', { ...cutd(3000, 300, 300), heights: H, holes: { kind: 'feature', filter: { feature: 'P3bossDelik' } }, cycle: 'spot', depth: { from: 'abs', tipComp: false, z: z2(238.21) }, order: 'asis' })));
S2.ops.push(F(15, OP('o15', 'drill', '15 Delme T37 G83 Q5 (4x O7,14, boydan boya +1)', 'T37', { ...cutd(3500, 420, 420), heights: H, holes: { kind: 'feature', filter: { feature: 'P3bossDelik' } }, cycle: 'peck', peck: 5, depth: { from: 'hole', tipComp: true, breakThrough: 1 }, order: 'asis' })));
// --- S3
S3.ops.push(F(16, OP('o16', 'pocket', '16 Yatay temizleme karsiligi: arka yuz s0 T35', 'T35', { ...cutd(8000, 1500, 500), heights: hts(T('stockTop'), ABS(z3(0))), geom: [sk('sS3f', [RG.sS3f.idx])], stepover: 5, stepdown: 1, stockToLeave: NOLEAVE, entry: { kind: 'plunge' } }, [{ entry: { kind: 'ramp', angle: 3 } }, ENTRY_H])));
S3.ops.push(F(17, OP('o17', 'pocket', '17 Bore T34: 2x O14,29 arka duvar deligi (cep, s0..-32,75)', 'T34', { ...cutd(8000, 1500, 500), heights: hts(ABS(z3(0)), ABS(z3(-32.75))), geom: [sk('sS3h', 'all')], stepover: 1, stepdown: 2, stockToLeave: NOLEAVE, entry: { kind: 'plunge' } }, [{ entry: { kind: 'ramp', angle: 4 } }])));
// --- S4
S4.ops.push(F(18, OP('o18', 'face', '18 Yuzey T20 (alt, Y-2 -> 0)', 'T20', { ...cutd(4500, 2250, 750), heights: hts(T('stockTop'), T('modelTop')), stepover: 40, stepdown: 1, stockToLeave: 0, direction: 0, extend: 2 })));
ASSUME('o10 (S2 adaptive karsiligi)', 'pocket T34, ada = 4 boss dairesi (r22,225, s=238,2 kesiti), dis = stok+11 dikdortgen; s249,65 -> 234,95 (pay 0,3 / 0,2); stepdown 12', 'Plan: alt s234,95; boss alti/yanindaki stok');
ASSUME('o2a-o2d', 'pocket T34: stepover 1,2, stepdown 12, radyal pay 0,3 / eksenel 0,2 (halka: eksenel 0), giris helis dia 10 / 3 derece', 'Plan: optimal yuk 1,2, paso 12, pay 0,3/0,2, alt Y-0,2');
ASSUME('o3a-o3d (yatay)', 'T35 pocket, stepover 5, paso 1, pay 0, dalma; plaka ustu: Y=31,8 kesiti + kure ekvatoru + on duvar dolgusu (fileler 31,75-34,9 arasi atlandi: R3,175 fileyi Mihenk 2,5D yapamaz); on duvar ustu: boss/fileli araliklar (fileyi atlamak icin boss +-25,4); V yarik: 12,7 genislik, v -6..38', 'Plan: T35 alt Y31,5 (plaka ustu, on duvar ustu, arka duvar ustu, V yarik tabani, direk ustu); arka duvar ustu Y97,79 yuzey islemiyle kesildi');
ASSUME('o5 (2D kontur dis siluet)', 'elle maksimum silüet (plaka + 4 boss dikdortgeni), Y36 -> -0,2, paso 12, sag/dis, climb', 'Plan: yalniz dis halka; Mihenk silhouette secicisi prizmatik gerektirir, bu parca prizmatik degil (deney asagida)');
ASSUME('o6 bore havsa', 'pocket (4 x O15,875), helis giris dia 3 / 3 derece, stepover 4, paso 1', 'Fusion bore threadPitch 1; Mihenk bore islemi yok (T-xx P2: pocket + helis)');
ASSUME('o9 bore O6,35', 'pocket r=3,175, T22 (O6): dalma, paso 1', 'Fusion bore threadPitch 1; ic bosluk 0,35 mm: helis sigmaz');
ASSUME('o12 boss dis kontur', 'dis, s247,65 -> 234,95, paso 6,4 (plan degeri)', 'Plan: boss-duvar R3,175 fileti belirtilmis; STEP kesitleri (s234,96..238,2) tam r22,225 daire veriyor: fileti YOK');
ASSUME('o13 bore havsa', 'pocket (4 x O10,16), T22, dalma, paso 1', 'Fusion bore threadPitch 1');
ASSUME('o16 arka yuz', 'pocket: Z=-0,17 kesiti dis siniri (V yarik/R12,7 koselerle) + 2 delik ada; ust = stok ustu (s2) cunku onceki setup stoku yok, taban s0', 'Plan: alt s-0,17; Fusion stok ustu onceki-setup stoku s2');
ASSUME('o17 bore O14,29', 'pocket 2 daire, T34, dalma, paso 2, s0 -> -32,75', 'Fusion bore threadPitch 2');

// delik kayitlari (STEP ice aktarma delik tanimaz, T-05)
const PH = [[133.35, -57.15], [133.35, -184.15], [-133.35, -57.15], [-133.35, -184.15]];
const BH = BOSSX.map((x) => [x, 50.8]);
const tR = now(); const rb = await K.rebuild(doc); R.import.rebuild_eskizlerle_s = r3(now() - tR); R.import.docErrors2 = rb.docErrors; log('rebuild eskizlerle', R.import.rebuild_eskizlerle_s, JSON.stringify(rb.docErrors));
const rbX = { ...rb, holes: [
  { feature: 'P3plakaDelik', kind: 'simple', dia: 10.54, depth: null, through: true, tipAngle: 118, thread: null, dir: [0, -1, 0], positions: PH.map((p) => [p[0], 19.05, p[1]]), dirs: PH.map(() => [0, -1, 0]), bodies: PH.map(() => [bid]), count: 4, lost: 0 },
  { feature: 'P3bossDelik', kind: 'simple', dia: 7.14, depth: 31.16, through: false, tipAngle: 118, thread: null, dir: [0, 0, 1], positions: BH.map((p) => [p[0], p[1], -239.71]), dirs: BH.map(() => [0, 0, 1]), bodies: BH.map(() => [bid]), count: 4, lost: 0 },
] };
ASSUME('rebuild.holes S1 plaka deligi', '4x O10,54 (X +-133,35, Z -57,15/-184,15), giris Y=19,05 (havsa tabani), yon -Y, through:true (model tabani Y=0 = plaka alti: T-14 burada dogru calisir)', 'STEP ice aktarmada delik ozelligi tanimaz');
ASSUME('rebuild.holes S2 boss deligi', '4x O7,14 (X +-36,2/+-108,59, Y 50,8), giris Z=-239,71 (havsa tabani), yon +Z, blind derinlik 31,16 = (239,71-209,55)+1', 'through:true olsaydi model tabanina (Z0) kadar iner (T-14); blind kayitta breakThrough etkisiz (P2 ile ayni yontem)');

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
  log(`\n== ${setup.id} cozuldu, stok ${rec.cozulmus.stockBoyut.join('x')} frame.z ${rec.cozulmus.frame.z} aAngle ${S.aAngle}`);
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
        if (op0.type === 'drill') o.delme = { cycles: tp.moves.filter((m) => m.t === 'cycle').map((m) => ({ cycle: m.cycle, n: m.points.length, top: m.top, bottom: m.bottom, retract: m.retract, clearance: m.clearance })) };
        tps.push(tp); break;
      } catch (e) { o.denemeler.push({ varyant: vi ? JSON.stringify(op0.alts[vi - 1]) : 'birincil', hata: opError(e) }); if (vi === nv - 1) { o.hesap_s = r3(now() - ta); o.ok = false; o.hata = opError(e); } }
    }
    rec.islemler.push(o);
    if (!o.ok || o.denemeler.length || !/^c|^p/.test(o.id)) log(`  ${o.id} ${o.ad}: ${o.ok ? `ok ${o.hesap_s}s kesme ${o.kesme_mm} hizli ${o.hizli_mm} sure ${o.sure_s}s [${o.varyant_deger}] uyari ${o.uyarilar.map((w) => w.code).join(',')}` : 'HATA ' + o.hata.code + ' ' + JSON.stringify(o.hata.params)}${o.denemeler.length ? ' | onceki: ' + o.denemeler.map((d) => d.varyant + '->' + d.hata.code).join('; ') : ''}`);
  }
  rec.S = S; rec.tps = tps; progs.push(rec); R.setups.push(rec);
  if (process.env.P3_DUMP) { const tp = tps.find((t) => t.opId === process.env.P3_DUMP); if (tp) { log('DUMP', tp.opId, JSON.stringify(tp.moves.slice(0, Number(process.env.P3_DUMPN || 40)))); process.exit(0); } }
}

// silhouette secici denemesi (S1 op5 icin): prizmatik degil -> hata beklenir
if (progs.find((r) => r.id === 'S1')) {
  const s1 = progs.find((r) => r.id === 'S1');
  try { const g = await CAM.resolveGeom({ geom: [{ kind: 'silhouette', body: bid, loops: 'outer' }] }, s1.S, { rebuild: rbX, doc, query }); R.deney_silhouette = { ok: true, loop_say: g.faces.length }; }
  catch (e) { R.deney_silhouette = { ok: false, hata: opError(e) }; }
  log('deney silhouette', JSON.stringify(R.deney_silhouette));
}

// ------------------------------------------------------------------ 7. kapilar (sim acik) + post + kalan stok analizi
ASSUME('sim.res', RES, 'en kucuk takim yaricapi 3 (T22 D6) -> res <= 3 kapi sarti; sure/hassasiyet dengesi icin ' + RES);
const ZONE = { S2: [z2(234.9), Infinity], S3: [z3(-0.2), Infinity], S4: [-2.05, -1.95] };
function analyze(S, hm, sr) {
  const zn = ZONE[S.id] || [-Infinity, Infinity];
  const rem = sr.remainBySetup?.[S.id] || sr.remainHeightmap; const RS = rem?.res ?? RES; const out = { res: RS, bolge_z: ZONE[S.id] ? ZONE[S.id].map((v) => (Number.isFinite(v) ? r3(v) : String(v))) : 'tum' };
  if (!rem || !hm || rem.nx !== hm.nx) return { hata: 'harita uyumsuz' };
  const cell = RS * RS; const nx = rem.nx; const cx = (i) => rem.x0 + (i + 0.5) * RS, cy = (j) => rem.y0 + (j + 0.5) * RS;
  const bins = [0.05, 0.3, 1, 3, 10]; const area = [0, 0, 0, 0, 0]; let vol = 0, mx = 0; const pts = [];
  for (let k = 0; k < rem.data.length; k++) { const m = hm.data[k]; const rv = rem.data[k]; if (!Number.isFinite(m) || !Number.isFinite(rv) || m < zn[0] || m > zn[1]) continue; const ex = rv - m; if (ex > 0.05) { vol += ex * cell; bins.forEach((b, bi) => { if (ex > b) area[bi] += cell; }); if (ex > mx) mx = ex; pts.push([r3(cx(k % nx)), r3(cy(Math.floor(k / nx))), r3(ex)]); } }
  out.model_ustu_artik = { esik_mm: bins, alan_mm2: area.map(r3), hacim_mm3: r3(vol), max_mm: r3(mx), en_buyuk: pts.sort((a, b) => b[2] - a[2]).slice(0, 8) };
  out.kaldirilan_hacim_mm3 = r3(sr.removedVolume);
  // model altina inen (oyma) hucre alani: kalan < model
  let under = 0, umax = 0; for (let k = 0; k < rem.data.length; k++) { const m = hm.data[k]; const rv = rem.data[k]; if (Number.isFinite(m) && Number.isFinite(rv) && m >= zn[0] && m <= zn[1] && m - rv > 0.05) { under += cell; umax = Math.max(umax, m - rv); } }
  out.oyma_alan_mm2 = r3(under); out.oyma_max_mm = r3(umax);
  return out;
}
function ncStats(text) {
  const lines = text.split(/\r?\n/); const code = lines.map((l) => l.replace(/\([^)]*\)/g, '')).join('\n'); const cnt = (re) => (code.match(re) || []).length;
  const A = [...code.matchAll(/(?:^|\s)A(-?\d+(?:\.\d+)?)/gm)].map((m) => m[1]);
  const aLines = []; lines.forEach((l, i) => { if (/(?:^|\s)A-?\d/.test(l.replace(/\([^)]*\)/g, ''))) aLines.push({ satir: i + 1, metin: l.trim() }); });
  return { satir: lines.length, bayt: Buffer.byteLength(text), G81: cnt(/\bG81\b/g), G83: cnt(/\bG83\b/g), G84: cnt(/\bG84\b/g), G41: cnt(/\bG41\b/g), G42: cnt(/\bG42\b/g), A: A.length, A_degerleri: [...new Set(A)], A_satirlari: aLines.slice(0, 12), M6: cnt(/\bM0?6\b/g), M8: cnt(/\bM0?8\b/g), M5: cnt(/\bM0?5\b/g), G2G3: cnt(/\bG0?[23]\b/g), G1: cnt(/\bG0?1\b/g) };
}
const NUM = { S1: 2003, S2: 2004, S3: 2005, S4: 2006 };
const FNAME = { S1: 'S1_Ust', S2: 'S2_On_A', S3: 'S3_Arka_A', S4: 'S4_Alt' };
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
    } catch (e) { rec.kalan = { hata: opError(e) }; }
  }
  const tp0 = now(); const base = `P3_${FNAME[rec.id]}_mihenk`;
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

// ------------------------------------------------------------------ 7b. ek deneyler (birincil sonuclari DEGISTIRMEZ)
const sumG = (gl) => { const b = {}; for (const g of gl.filter((x) => x.level === 'block')) { const k = `${g.code}${g.opId ? ' ' + g.opId : (g.params?.op ? ' ' + g.params.op : '')}`; b[k] = (b[k] || 0) + 1; } return { block: b, block_say: gl.filter((x) => x.level === 'block').length, warn_say: gl.filter((x) => x.level === 'warn').length }; };
const exp = async (label, fn) => { try { const t = now(); R.deneyler[label] = await fn(); R.deneyler[label].s = r3(now() - t); log('deney', label, JSON.stringify(R.deneyler[label]).slice(0, 700)); } catch (e) { R.deneyler[label] = { hata: opError(e) }; log('deney HATA', label, JSON.stringify(opError(e))); } };
const gatesNoSim = (rec, tps) => { const program = CAM.buildProgram({ name: 'OX', number: 1, machine: M, sections: [{ setup: rec.S, toolpaths: tps }] }); return CAM.gates(program, M, { sim: false }); };
const gatesSim = (rec, tps, res = RES) => { const S = rec.S; const program = CAM.buildProgram({ name: 'OX', number: 1, machine: M, sections: [{ setup: S, toolpaths: tps }] }); const bb = [S.stockBox.min[0], S.stockBox.min[1], S.stockBox.max[0], S.stockBox.max[1]]; const hm = res === RES ? rec.hm : K.camHeightmap({ bodies: [bid], frame: S.frame, res, bbox: bb }); return CAM.gates(program, M, { sim: { res, modelHeightmaps: { [S.id]: hm }, tools: simTools } }); };
{
  const r1 = progs.find((r) => r.id === 'S1'), r2 = progs.find((r) => r.id === 'S2');
  if (r1 && !NOSIM) {
    await exp('E6_S1_c26_ham_kesit_tavan_sorunu', async () => { const bd = bands[26]; const op = OP('c26', 'contour', 'E6 ham kesit bant', 'T35', { ...cutd(8000, 1500, 500), heights: hts(ABS(z1(bd.top)), ABS(z1(bd.bot))), geom: [sk('sRaw', 'all', 'outer')], side: 'outside', dir: 'climb', stepdown: BAND, stockToLeave: NOLEAVE, leadIn: LEAD, leadOut: LEAD }); const tp = await computeOne(r1.S, op); return { aciklama: `bant Y${bd.bot}-${bd.top}: arka duvar uc parcalari duzeltmesiz (Y kesiti: O20,64 havsa yarigi tavanli) -> takim yarik icine girer`, kesme_mm: r3(tp.stats.cutLen), ...sumG(gatesSim(r1, r1.tps.map((t) => (t.opId === 'c26' ? tp : t)))) }; });
    await exp('E3_S1_res_0.5', async () => ({ aciklama: 'ayni program, sim res 0,5 (heightmap 0,5)', ...sumG(gatesSim(r1, r1.tps, 0.5)) }));
    await exp('E5_S1_o3a_radyal_pay_0.3', async () => { const op = clone(S1.ops.find((o) => o.id === 'o3a')); op.stockToLeave = { radial: 0.3, axial: 0 }; const tp = await computeOne(r1.S, op); return { aciklama: 'o3a (plaka ustu yatay temizleme) radyal pay 0 -> 0,3 (kure ekvator kolonu 0,3 deri birakir)', ...sumG(gatesSim(r1, r1.tps.map((t) => (t.opId === 'o3a' ? tp : t)))) }; });
    await exp('E1_S1_bodyLen_buyuk', async () => { // body_short (T-08) kaldirilirsa geriye kalan block'lar
      const big = (n) => ({ ...tools.find((q) => q.number === n), bodyLen: 200, fluteLen: Math.max(tools.find((q) => q.number === n).fluteLen, 60) });
      const tps = []; for (const tp of r1.tps) { const op0 = S1.ops.find((o) => o.id === tp.opId); if (op0 && ['T21', 'T22', 'T24', 'T36'].includes(op0.toolId)) { const nv = 1 + (op0.alts?.length || 0); let t2 = null; for (let vi = 0; vi < nv && !t2; vi++) { try { t2 = await computeOne(r1.S, op0, big(Number(op0.toolId.slice(1))), vi); } catch { /* sonraki */ } } tps.push(t2 || tp); } else tps.push(tp); }
      return { aciklama: 'T21/T22/T24/T36 govde boyu 200 (body_short kosulu kaldirilarak); diger kapilar ayni', ...sumG(gatesNoSim(r1, tps)) };
    });
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
for (const rec of R.setups) { delete rec.S; delete rec.tps; delete rec.hm; if (rec.program) { rec.tahmini_sure_s = r3(rec.islemler.filter((o) => o.ok).reduce((a, o) => a + o.sure_s, 0)); } delete rec.program; }
R.fusion = fs.existsSync(FUSION_JSON) ? JSON.parse(fs.readFileSync(FUSION_JSON, 'utf8')) : null;
if (R.fusion) delete R.fusion.nc;
fs.writeFileSync(path.join(OUT, 'p3-mihenk-sonuc.json'), JSON.stringify(R, null, 1));
for (const rec of R.setups) {
  log(`\n== ${rec.id} ${rec.ad} (${rec.wcs}) tahmini ${rec.tahmini_sure_s}s`);
  if (rec.setup_hata) { log('  SETUP HATA', JSON.stringify(rec.setup_hata)); continue; }
  log('  kapi', JSON.stringify(rec.kapi_ozet));
  log('  post', JSON.stringify(rec.post), JSON.stringify(rec.nc ? { satir: rec.nc.satir, A: rec.nc.A_degerleri } : rec.nc_bloklu ? { satir: rec.nc_bloklu.satir, A: rec.nc_bloklu.A_degerleri } : {}));
  log('  kalan', JSON.stringify(rec.kalan));
}
log('\ntoplam s', R.sure_s, 'JSON:', path.join(OUT, 'p3-mihenk-sonuc.json'));
