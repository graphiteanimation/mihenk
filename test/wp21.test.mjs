// WP-21 (0.4 kapanış) maddelerinin node düzeyi testleri. Çıktı: "N geçti, M kaldı".
// Arayüz dosyaları (DOM, three.js, vite json içe aktarımı) node'da yüklenemediği için arayüz kararları saf modüllere alındı ve burada sınanır.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from './cam-samples/samples.mjs';
import { postProgram, getPost, listPosts } from '../src/cam/post/index.js';
import { PP, PP_ORDER, postRunOpts, modelBBoxOf } from '../src/ui/cam/postopts.js';
import { CAM_RIBBON } from '../src/ui/cam/ribbon.js';
import { tLang } from '../src/shared/i18n.js';
import { alignTraceCons, hvSame, autoHvRedundantAfterFix, autoYield } from '../src/ui/sketch/autoalign.js';
import { solveSketch } from '../src/ui/solver.js';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import opencascade from 'replicad-opencascadejs';
import { initKernel } from '../src/kernel/kernel.js';
import { parseFont, textOutlines, cleanSegments, writeText, pruneTexts, textOfEnt } from '../src/ui/sketch/text.js';
import { validateDoc } from '../src/shared/schema.js';
import * as CAM from '../src/cam/index.js';
import * as VL from './verify/lib.mjs';
import { findRegions } from '../src/shared/profiles.js';
import { exampleEntries, wrapExample } from '../src/ui/examples.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const r3 = (v) => Math.round(v * 1000) / 1000;
const only = process.argv.find((a) => a.startsWith('--madde='))?.slice(8);
const madde = (n, title, fn) => { if (only && only !== String(n)) return; console.log(n + '. ' + title); return fn(); };

await madde(1, 'src/ui/cam devirleri: belge adı + model kutusu post seçeneklerinde, modelSummary düzenleyicide, Kesme verisi şeritte', () => {
  const sm = S.indexedSample(); const prog = structuredClone(sm.program);
  for (const s of prog.sections) s.setup.bodies = ['b1'];
  const result = { bodies: [{ id: 'b1', vertices: new Float32Array([0, 0, 0, 60, 30, 40, 10, 5, 2]) }, { id: 'baska', vertices: new Float32Array([-500, -500, -500, 900, 900, 900]) }] };
  const now = new Date('2026-11-20T10:11:12.000Z');
  const o = postRunOpts({ program: prog, fileName: 'Şaft (rev-2).mhnk', result, gates: [], appVersion: '9.8.7', now });
  ok(o.modelSummary.doc === 'Şaft (rev-2).mhnk', 'belge adı geçer');
  ok(JSON.stringify(o.modelSummary.bbox) === JSON.stringify({ min: [0, 0, 0], max: [60, 30, 40] }), 'model kutusu yalnız programdaki setup gövdelerinden: ' + JSON.stringify(o.modelSummary.bbox));
  ok(o.generatedAt === '2026-11-20T10:11:12.000Z' && o.date === '2026-11-20', 'tam üretim zamanı ve tarih');
  ok(!('verified' in o), 'doğrulama kaydı yoksa alan yok');
  const v = postRunOpts({ program: prog, fileName: null, result, appVersion: 'x', now, verified: { by: 'A', date: '2026-11-19', note: '' } });
  ok(!('doc' in v.modelSummary) && v.verified.by === 'A', 'kaydedilmemiş belge: MODEL satırı için ad yok; doğrulama kaydı geçer');
  ok(modelBBoxOf([]) === null && modelBBoxOf([{ vertices: new Float32Array(0) }]) === null, 'gövdesiz kutu null');
  const M = S.testMachine();
  const nc = postProgram(prog, M, o).text.split('\n').slice(0, 30);
  ok(nc.includes('(MODEL Saft [rev-2].mhnk)'), 'NC başlığında belge adı: ' + nc.find((l) => /MODEL/.test(l)));
  ok(nc.includes('(PART SIZE 60.0 x 30.0 x 40.0 MM)'), 'NC başlığında parça kutusu');
  ok(nc.includes('(GENERATED 2026-11-20T10:11:12.000Z)'), 'NC başlığında tam üretim zamanı');
  ok(!postProgram(prog, M, v).text.includes('(MODEL '), 'adsız belgede MODEL satırı yok');
  // ops.js gerçekten bu seçenekleri kullanıyor (vite json içe aktarımı yüzünden node'da yüklenemez; kaynak denetimi)
  const ops = src('src/ui/cam/ops.js');
  ok(/postProgram\(program, this\.cam\.machine\(\), postRunOpts\(\{ program, fileName: this\.app\.fileName, result: this\.app\.result/.test(ops), 'ops.js runPost postRunOpts ile belge adı ve sonucu verir');
  // post özellik düzenleyicisi: her post'un her varsayılan özelliği düzenleyicide (modelSummary dahil), etiketli
  ok(PP.modelSummary?.kind === 'bool' && PP_ORDER.includes('modelSummary'), 'modelSummary düzenleyici tanımında');
  for (const p of listPosts()) {
    const defs = getPost(p.id ?? p).defaultProps;
    // safeStartExtra (dizi) ve lineNumberMax bugün yalnız profil dosyasından düzenlenir (WP-21 notu: açık); yenisi eklenirse test kalır
    const eksik = Object.keys(defs).filter((k) => !['safeStartExtra', 'lineNumberMax'].includes(k) && (!PP_ORDER.includes(k) || !PP[k]));
    ok(!eksik.length, `${p.id ?? p}: düzenleyicide olmayan özellik yok: ${eksik.join(',')}`);
  }
  ok(PP_ORDER.every((k) => PP[k]) && new Set(PP_ORDER).size === PP_ORDER.length, 'PP_ORDER tekrar yok, hepsi tanımlı');
  for (const l of ['tr', 'en']) ok(tLang(l, 'cam.pp.modelSummary') !== 'cam.pp.modelSummary', `${l} etiketi var`);
  ok(src('src/ui/cam/machines.js').includes("import { PP, PP_ORDER } from './postopts.js'"), 'machines.js tanımları postopts.js’den alır');
  // şerit
  const all = CAM_RIBBON.flatMap((g) => g[2]);
  ok(CAM_RIBBON.find((g) => g[0] === 'cam-setup')[2].includes('cam-cutdata'), 'Kesme verisi Hazırlık grubunda');
  ok(new Set(all).size === all.length, 'şeritte tekrar komut yok');
  const idx = src('src/ui/cam/index.js');
  const regs = new Set([...idx.matchAll(/reg\('([a-z0-9-]+)'/g)].map((m) => m[1]));
  const kayitsiz = all.filter((id) => !regs.has(id) && !/^cam-op-/.test(id));
  ok(!kayitsiz.length, 'şeritteki her komut kayıtlı: ' + kayitsiz.join(','));
  ok(/CAM_RIBBON\.map/.test(idx), 'index.js ribbon() CAM_RIBBON’dan kurar');
  ok(CAM_RIBBON[CAM_RIBBON.length - 1][3]?.cls === 'end', 'eylem grubu sonda ve sabit (end)');
});

await madde(2, 'V-29 annulus#16 ters yay: kök neden (ölçüt), regresyon', () => {
  // toolpath.verify 21 tohumundaki annulus#16 durumu (geometri ve işlem birebir; test/verify/toolpath.verify.mjs)
  const reg = { outer: VL.circleLoop([0, 0], 33.71460323780775, true), holes: [VL.circleLoop([0.8638382432982326, -0.08384060440585017], 17.353826069320643, false)] };
  const S0 = { id: 's1', name: 'S1', workOffset: { kind: 'G55' }, frame: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, stock: { kind: 'box' }, stockBox: { min: [-100, -100, -30], max: [300, 300, 0] }, modelBBox: { min: [-100, -100, -30], max: [300, 300, 0] }, clearance: 5, aAngle: null, stockTop: 0, machinePos: null };
  const tool = { id: 't', number: 5, lengthOffset: 5, diaOffset: 25, type: 'flat', dia: 16, fluteLen: 30, bodyLen: 60, flutes: 3, centerCutting: true };
  const opOf = (dir) => ({ id: 'p', type: 'pocket', name: 'annulus', rpm: 8000, feedCut: 800, feedPlunge: 300, coolant: 'flood', heights: { clearance: 10, retract: 2 }, geom: [{ kind: 'face', ref: {} }], stepover: 4.663744404725731, stepdown: 3.988544177263975, stockToLeave: { radial: 0, axial: 0.2 }, dir, entry: { kind: 'ramp', angle: 10.951324080117047, helixDia: 11.655029941350222 }, finishPass: false });
  const PR = VL.prepRegion(reg), r = 8, grid = new VL.Grid(PR.segs, r);
  const scan = (tp, dir) => { const o = { oldBad: [], newBad: 0, newN: 0 };
    VL.walkSamples(tp, (s) => {
      if (s.m.t === 'rapid' || s.z >= -1e-6 || !s.t || s.m.kind !== 'cut' || s.m.z !== s.from.z) return;
      const p = [s.x, s.y]; if (Math.abs(grid.near(p, r + 2) - r) >= 1e-3) return;
      const nq = VL.nearestOn(p, PR.segs); const w = [nq.q[0] - p[0], nq.q[1] - p[1]]; const cr = s.t[0] * w[1] - s.t[1] * w[0];
      if (Math.abs(cr) > 0.5 * Math.hypot(...w) && (dir === 'conv' ? cr < 0 : cr > 0)) o.oldBad.push({ k: s.k, p, start: Math.hypot(p[0] - s.from.x, p[1] - s.from.y) < 1e-9 });
      const wd = VL.wallDir(p, s.t, PR.segs, r); if (wd) { o.newN++; if (dir === 'conv' ? wd.cr < 0 : wd.cr > 0) o.newBad++; }
    }); return o; };
  const tp = CAM.computeOp(opOf('conv'), { setup: S0, tool, geom: { faces: [VL.face(reg, -6)] } });
  const A = scan(tp, 'conv');
  // kök neden: eski ölçütün işaretlediği tek örnek her derinlikte hilal ucundaki (iki ofset dairesinin kesişimi) hareket BAŞLANGICI
  ok(A.oldBad.length === 2 && A.oldBad.every((b) => b.start), 'eski ölçüt: yalnız hareket başlangıcı örnekleri (2 derinlik × 1): ' + JSON.stringify(A.oldBad));
  for (const b of A.oldBad) { const dO = Math.abs(Math.hypot(...b.p) - (33.71460323780775 - r)), dI = Math.abs(Math.hypot(b.p[0] - 0.8638382432982326, b.p[1] + 0.08384060440585017) - (17.353826069320643 + r)); ok(dO < 1e-6 && dI < 1e-6, 'işaretlenen nokta iki duvara birden r uzaklıkta (sivri uç): ' + dO + ' ' + dI); }
  // takım yolu doğru: dış duvar yayları (merkez 0,0) konvansiyonelde saat yönünde, ada yayları saat yönü tersinde
  let pos = null; const arcs = { out: new Set(), isl: new Set() };
  for (const m of tp.moves) { if (m.t === 'arc' && m.kind === 'cut' && pos) { const c = [pos.x + m.i, pos.y + m.j]; if (Math.hypot(...c) < 1e-6) arcs.out.add(m.dir); else if (Math.hypot(c[0] - 0.8638382432982326, c[1] + 0.08384060440585017) < 1e-6) arcs.isl.add(m.dir); } if (m.t !== 'cycle' && m.t !== 'dwell' && m.t !== 'comp') pos = m; }
  ok([...arcs.out].join() === 'cw' && [...arcs.isl].join() === 'ccw', 'konvansiyonel: dış duvar yayları cw, ada yayları ccw: ' + JSON.stringify({ out: [...arcs.out], isl: [...arcs.isl] }));
  ok(A.newBad === 0 && A.newN > 1000, `yeni ölçüt (sivri uç belirsiz, duvara teğet hareket): 0 ters / ${A.newN} duvar örneği`);
  // duyarlılık: aynı yol tırmanma beklenseydi yeni ölçüt duvar örneklerinin hepsini ters bulur (ölçüt kör değil)
  const B = scan(tp, 'climb'); ok(B.newBad === B.newN && B.newN > 1000, `duyarlılık: konvansiyonel yol tırmanma ölçüsüyle ${B.newBad}/${B.newN} ters`);
  const tpc = CAM.computeOp(opOf('climb'), { setup: S0, tool, geom: { faces: [VL.face(reg, -6)] } }); const C = scan(tpc, 'climb');
  ok(C.newBad === 0 && C.newN > 1000, `tırmanma yolu: 0 ters / ${C.newN}`);
  // sivri uç ve teğetlik kuralı birim düzeyde
  ok(VL.wallDir([0, 0], [1, 0], [VL.L([-5, 1], [5, 1]), VL.L([-5, -1], [5, -1])], 1) === null, 'iki ayrı duvara değen nokta belirsiz (null)');
  ok(VL.wallDir([0, 0], [1, 0], [VL.L([-5, 1], [5, 1])], 1)?.cr > 0, 'tek duvar, teğet hareket: ölçülür');
  ok(VL.wallDir([0, 0], [Math.SQRT1_2, -Math.SQRT1_2], [VL.L([-5, 1], [5, 1])], 1) === null, 'duvardan 45° ayrılan hareket ölçülmez');
  ok(/V\.wallDir\(p, s\.t, PR\.segs, r \+ stR\)/.test(src('test/verify/toolpath.verify.mjs')), 'toolpath.verify aynı ölçütü kullanır');
});

await madde(3, 'hizalama izinden otomatik H/V kısıtı; Sabitle ile fazla kısıt çatışması (7g)', async () => {
  const base = () => ({ points: { O: { x: 0, y: 0, fixed: true }, A: { x: 10, y: 5 }, B: { x: 10, y: 20 }, C: { x: 40, y: 20 } }, ents: [{ id: 'l1', type: 'line', a: 'B', b: 'C' }], cons: [] });
  let sk = base();
  ok(JSON.stringify(alignTraceCons(sk, 'B', { kind: 'align', refs: [{ id: 'A', p: [10, 5], axis: 'v' }] })) === '[["vertical_pp","B","A"]]', 'dikey hiza izi → vertical_pp(yeni, referans)');
  ok(JSON.stringify(alignTraceCons(sk, 'C', { kind: 'align', refs: [{ id: 'B', p: [10, 20], axis: 'h' }, { id: 'A', p: [10, 5], axis: 'v' }] })) === '[["horizontal_pp","C","B"]]', 'iki iz: yalnız konumu hâlâ hizalı olan referans (C.x≠A.x)');
  ok(alignTraceCons(sk, 'B', { kind: 'end', refs: [{ id: 'A', axis: 'v' }] }).length === 0, 'hizalama dışı yakalama kısıt eklemez');
  sk.cons.push({ id: 'k0', type: 'horizontal', a: 'l1' });
  ok(alignTraceCons(sk, 'C', { kind: 'align', refs: [{ id: 'B', axis: 'h' }] }).length === 0 && hvSame(sk, 'B', 'C', 'h'), 'zaten yatay çizgiyle belirli hiza tekrar eklenmez (gereksiz kısıt yok)');
  // çözücü: otomatik kısıt geometriyi bozmaz, fazla kısıt üretmez
  sk = base(); for (const [ty, a, b] of alignTraceCons(sk, 'B', { kind: 'align', refs: [{ id: 'A', axis: 'v' }] })) sk.cons.push({ id: 'k1', type: ty, a, b, auto: true });
  let r = await solveSketch(sk, {});
  ok(r.ok && !r.redundant.length && !r.conflicting.length && Math.abs(sk.points.B.x - 10) < 1e-9, 'hiza kısıtıyla çözüm temiz: ' + JSON.stringify({ ok: r.ok, red: r.redundant }));
  // 7g: A sabitken B'yi Sabitle → eskiden vertical_pp gereksiz (fazla kısıt) → katı uygulamada reddedilirdi
  const fixCase = () => { const s2 = JSON.parse(JSON.stringify(sk)); s2.points.A.fixed = true; return s2; };
  { const s2 = fixCase(); s2.points.B.fixed = true; const r2 = await solveSketch(s2, {}); ok(r2.redundant.includes('k1'), 'kök neden yeniden üretildi: düşürmeden Sabitle → k1 gereksiz (' + JSON.stringify(r2.redundant) + ')'); }
  { const s2 = fixCase(); const ids = new Set(['B']); const drop = autoHvRedundantAfterFix(s2, ids);
    ok(JSON.stringify(drop) === '["k1"]', 'Sabitle: tüm noktaları sabitlenen otomatik kısıt düşer: ' + JSON.stringify(drop));
    s2.cons = s2.cons.filter((c) => !drop.includes(c.id)); s2.points.B.fixed = true; const r2 = await solveSketch(s2, {});
    ok(r2.ok && !r2.redundant.length && !r2.conflicting.length, 'düşürünce Sabitle temiz çözülür (katı kip reddetmez)'); }
  { const s2 = fixCase(); s2.cons[0].auto = undefined; ok(autoHvRedundantAfterFix(s2, new Set(['B'])).length === 0, 'kullanıcının elle eklediği kısıta dokunulmaz'); }
  { const s2 = JSON.parse(JSON.stringify(sk)); ok(autoHvRedundantAfterFix(s2, new Set(['B'])).length === 0, 'yalnız bir ucu sabitlenen kısıt kalır (gereksiz değil)'); }
  { const s3 = base(); s3.cons.push({ id: 'k2', type: 'horizontal', a: 'l1', auto: true }); ok(JSON.stringify(autoHvRedundantAfterFix(s3, new Set(['B', 'C']))) === '["k2"]', 'çizginin otomatik yatay kısıtı: iki ucu birden sabitlenince düşer'); }
  ok(alignTraceCons(base(), 'B', { kind: 'align', refs: [{ id: 'A', axis: 'v' }] }, 'A').length === 0, 'çizginin kendi başlangıcıyla hiza atlanır (skipRef: çizginin H/V kısıtı yeter)');
  // genel çatışma: kullanıcının katı kısıtı otomatik kısıtla fazla kısıt verirse ilgili otomatik kısıtlar geri çekilir (eş merkez senaryosu)
  { const before = { points: { O: { x: 0, y: 0, fixed: true }, c1: { x: -20, y: 0 }, c2: { x: 20, y: 0 }, z: { x: 5, y: 9 }, w: { x: 50, y: 9 } }, ents: [{ id: 'ci1', type: 'circle', c: 'c1', r: 10 }, { id: 'ci2', type: 'circle', c: 'c2', r: 10 }], cons: [{ id: 'k1', type: 'horizontal_pp', a: 'c1', b: 'O', auto: true }, { id: 'k2', type: 'horizontal_pp', a: 'c2', b: 'c1', auto: true }, { id: 'k3', type: 'horizontal_pp', a: 'w', b: 'z', auto: true }] };
    const after = JSON.parse(JSON.stringify(before)); after.cons.push({ id: 'k9', type: 'coincident', a: 'c1', b: 'c2' });
    let r0 = await solveSketch(JSON.parse(JSON.stringify(after)), {}); ok(!r0.ok || r0.redundant.length || r0.conflicting.length, 'kök: eş merkez otomatik hizalarla fazla kısıt (' + JSON.stringify({ red: r0.redundant, con: r0.conflicting }) + ')');
    const drop = autoYield(before, after); ok(JSON.stringify(drop.sort()) === '["k1","k2"]', 'yalnız ilgili noktalara (c1, c2) dokunan otomatik kısıtlar geri çekilir: ' + JSON.stringify(drop));
    after.cons = after.cons.filter((c) => !drop.includes(c.id)); r0 = await solveSketch(after, {}); ok(r0.ok && !r0.redundant.length && !r0.conflicting.length, 'geri çekince eş merkez temiz çözülür');
    const fx = JSON.parse(JSON.stringify(before)); fx.points.c2.fixed = true; ok(JSON.stringify(autoYield(before, fx).sort()) === '["k2"]', 'Sabitle: sabitlik durumu değişen noktanın otomatik kısıtları adaydır');
    const usr = JSON.parse(JSON.stringify(before)); usr.cons[0].auto = undefined; usr.cons[1].auto = undefined; const ua = JSON.parse(JSON.stringify(usr)); ua.cons.push({ id: 'k9', type: 'coincident', a: 'c1', b: 'c2' }); ok(autoYield(usr, ua).length === 0, 'kullanıcı kısıtları geri çekilmez (eskisi gibi reddedilir)'); }
  const skSrc = src('src/ui/sketcher.js');
  ok(/const drop = autoYield\(JSON\.parse\(before\), this\.sk\)/.test(skSrc) && /sk\.auto_yield/.test(skSrc), 'sketcher katı uygulamada otomatik kısıtları bir kez geri çekip yeniden çözer');
  ok(/bId = this\._ptFor\(s, aId\)/.test(skSrc), 'çizgi ucu kendi başlangıcına hizalanınca nokta-nokta kısıtı eklenmez');
  ok(/s\.kind === 'align'\) \{ if \(autoOn\('hv'\)\) for \(const \[ty, a, b\] of alignTraceCons/.test(skSrc), 'sketcher _ptFor hizalama izinden kısıt ekler (otomatik H/V ayarına bağlı)');
  ok(/autoHvRedundantAfterFix\(s, ids\)/.test(skSrc) && /sk\.fix_auto_dropped/.test(skSrc), 'sketcher Sabitle otomatik kısıtları düşürür ve bildirir');
  for (const l of ['tr', 'en']) ok(tLang(l, 'sk.fix_auto_dropped') !== 'sk.fix_auto_dropped', `${l}: sk.fix_auto_dropped`);
});

await madde(4, 'kurulu sürümde Örnekler resources/ornekler’den', () => {
  const EX = createRequire(import.meta.url)('../electron/examples.cjs');
  ok(EX.examplesDir({ isPackaged: true, resourcesPath: path.join('K', 'resources'), appRoot: 'X' }) === path.join('K', 'resources', 'ornekler'), 'paketli: resources/ornekler');
  ok(EX.examplesDir({ isPackaged: false, resourcesPath: 'K', appRoot: ROOT }) === path.join(ROOT, 'ornekler'), 'geliştirme: depo ornekler/');
  const tmp = path.join(ROOT, 'test', 'tmp', 'wp21-ornek'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(path.join(tmp, 'alt.mhnk'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'b-iki.mhnk'), '{"features":[]}'); fs.writeFileSync(path.join(tmp, 'a-bir.mhnk'), '{"app":"Mihenk","version":1,"doc":{}}'); fs.writeFileSync(path.join(tmp, 'not.txt'), 'x');
  const names = EX.listExamples(tmp);
  ok(JSON.stringify(names) === '["a-bir.mhnk","b-iki.mhnk"]', 'yalnız *.mhnk dosyaları, sıralı (klasör ve başka uzantı yok): ' + JSON.stringify(names));
  ok(EX.listExamples(path.join(tmp, 'yok')).length === 0, 'klasör yoksa boş liste');
  ok(EX.readExample(tmp, 'b-iki.mhnk')?.name === 'b-iki.mhnk' && new TextDecoder().decode(EX.readExample(tmp, 'b-iki.mhnk').data) === '{"features":[]}', 'listedeki ad okunur');
  for (const bad of ['../package.json', 'alt.mhnk', 'not.txt', path.join(tmp, 'a-bir.mhnk'), 'yok.mhnk', 5]) ok(EX.readExample(tmp, bad) === null, 'listede olmayan ad reddedilir: ' + bad);
  fs.rmSync(tmp, { recursive: true, force: true });
  // gerçek depo örnekleri: kabuk listesi ile gömülü liste aynı anahtarları verir (menü komut kimlikleri değişmez)
  const real = EX.listExamples(path.join(ROOT, 'ornekler'));
  const nat = exampleEntries(real, 'native'), emb = exampleEntries(real.map((f) => '../../ornekler/' + f), 'embed');
  ok(real.length >= 3 && JSON.stringify(nat.map((x) => x.key)) === JSON.stringify(emb.map((x) => x.key)), 'kabuk ve gömülü listede aynı anahtarlar: ' + nat.map((x) => x.key).join(','));
  ok(nat.every((x) => x.file.endsWith('.mhnk') && !/[\\/]/.test(x.file)) && emb.every((x) => x.path.startsWith('../../ornekler/')), 'kabuk girdisi yalnız dosya adı taşır');
  ok(JSON.parse(wrapExample('{"features":[]}', 'Mihenk', 1)).doc.features.length === 0 && wrapExample('{"doc":{"a":1}}', 'M', 1) === '{"doc":{"a":1}}', 'çıplak belge zarflanır, zarflı olduğu gibi');
  // paketleme yapılandırması ve köprü
  const pk = JSON.parse(src('package.json')); const er = (pk.build.extraResources || []).find((x) => x.from === 'ornekler');
  ok(er && er.to === 'ornekler' && er.filter.includes('*.mhnk'), 'build.extraResources ornekler → resources/ornekler');
  ok((pk.build.files || []).includes('electron/**'), 'electron/examples.cjs pakete girer (electron/**)');
  const main = src('electron/main.cjs'), pre = src('electron/preload.cjs'), app = src('src/ui/app.js');
  ok(/ipcMain\.handle\('native:examples', guarded\(/.test(main) && /ipcMain\.handle\('native:openExample', guarded\(/.test(main), 'IPC işleyicileri gönderen doğrulamalı (guarded)');
  ok(/examplesList: \(\) => ipcRenderer\.invoke\('native:examples'\)/.test(pre) && /openExample: \(name\) => ipcRenderer\.invoke\('native:openExample', String\(name\)\)/.test(pre), 'köprüde yol parametresi yok (yalnız ad)');
  ok(app.indexOf('await this.loadExamples()') > 0 && app.indexOf('await this.loadExamples()') < app.indexOf('this.C = initChrome(this)'), 'liste menü kurulmadan önce yüklenir');
});

await madde(5, 'eğri (silindirik, küresel) hedef yüze extrude ("yüze kadar")', async () => {
  const K = await initKernel(opencascade, () => path.join(ROOT, 'node_modules/replicad-opencascadejs/dist/replicad_single.wasm'));
  const rect = (id, w, h, ox, oy, z = 0) => { const P = { [id + 1]: { x: ox, y: oy }, [id + 2]: { x: ox + w, y: oy }, [id + 3]: { x: ox + w, y: oy + h }, [id + 4]: { x: ox, y: oy + h } };
    return { id, type: 'sketch', plane: { kind: 'base', name: 'XY', offset: String(z) }, points: P, ents: [1, 2, 3, 4].map((i) => ({ id: id + 'l' + i, type: 'line', a: id + i, b: id + ((i % 4) + 1) })) }; };
  const near = (a, b, m, tol = 1e-6) => ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m}: ${a} != ${b}`);
  // yatay silindir (eksen X, Ø40, merkez y=10 z=50); 20×20 kare z=0'da, x∈[0,20] y∈[0,20]
  const cyl = { id: 'c', type: 'primitive', kind: 'cylinder', x: '-10', y: '10', z: '50', dia: '40', h: '60', axis: 'X', op: 'new' };
  await K.rebuild({ features: [cyl] }); const side = K.describe({ body: 'c', idx: 0 }, 'face');
  ok(side.geom === 'CYLINDRE', 'hedef silindirik yüz');
  const ex = (sk, x = {}) => ({ id: 'e1', type: 'extrude', sketch: sk.id, profiles: 'all', extent: 'face', toFace: side, op: 'new', ...x });
  const Sint = 10 * Math.sqrt(300) + 400 * Math.PI / 6; // ∫_{-10}^{10} sqrt(400 - s²) ds
  let sk = rect('s1', 20, 20, 0, 0), r = await K.rebuild({ features: [cyl, sk, ex(sk)] });
  const e1 = () => r.bodies.find((b) => b.id === 'e1');
  ok(r.status.e1.ok, 'silindire kadar: ' + JSON.stringify(r.status.e1.error)); near(e1()?.volume, 20 * (20 * 50 - Sint), 'silindir alt yüzüne kadar hacim (analitik)', 1e-6);
  ok(e1()?.nFaces === 6, 'silindire kadar: 6 yüz (5 düzlem + 1 silindir parçası)');
  { const names = []; for (let i = 0; i < 6; i++) { const d = K.describe({ body: 'e1', idx: i }, 'face'); names.push([d.geom, d.name?.k ?? d.name]); }
    const cf = names.filter(([g]) => g === 'CYLINDRE'); ok(cf.length === 1 && String(cf[0][1]).includes('e1:end'), 'kesik eğri yüz <id>:end adını alır: ' + JSON.stringify(names)); }
  r = await K.rebuild({ features: [cyl, sk, ex(sk, { flip: true })] }); near(e1()?.volume, 20 * (20 * 50 - Sint), 'Ters çevir yönü değiştirmez (hedef belirler)', 1e-6);
  r = await K.rebuild({ features: [cyl, sk, ex(sk, { op: 'join' })] }); ok(r.bodies.length === 1, 'Birleştir: tek gövde'); near(r.bodies[0].volume, Math.PI * 400 * 60 + 20 * (20 * 50 - Sint), 'Birleştir hacmi', 1e-6);
  sk = rect('s1', 20, 60, 0, -20); r = await K.rebuild({ features: [cyl, sk, ex(sk)] });
  ok(r.status.e1.error?.code === 'extrude.to_face_curve_miss' && r.bodies.length === 1, 'yüz profili örtmüyorsa açık hata, belge bozulmaz: ' + JSON.stringify(r.status.e1));
  // borunun içinden duvara: sketch eksen düzleminde (z=50), yön +normal
  sk = rect('s1', 20, 20, 0, 0, 50); r = await K.rebuild({ features: [cyl, sk, ex(sk)] });
  near(e1()?.volume, 20 * Sint, 'silindirin içinden üst duvara kadar hacim', 1e-6);
  // küre (Ø40, merkez 5,5,50); 10×10 kare altında: hacim = ∫∫ (50 - sqrt(400 - (x-5)² - (y-5)²))
  const sph = { id: 'k', type: 'primitive', kind: 'sphere', x: '5', y: '5', z: '50', dia: '40', op: 'new' };
  await K.rebuild({ features: [sph] }); const sf = K.describe({ body: 'k', idx: 0 }, 'face'); ok(sf.geom === 'SPHERE', 'hedef küresel yüz');
  sk = rect('s1', 10, 10, 0, 0); r = await K.rebuild({ features: [sph, sk, { ...ex(sk), toFace: sf }] });
  let V = 0; const n = 400; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = (i + 0.5) * 10 / n - 5, y = (j + 0.5) * 10 / n - 5; V += (50 - Math.sqrt(400 - x * x - y * y)) * (10 / n) ** 2; }
  ok(r.status.e1.ok, 'küreye kadar: ' + JSON.stringify(r.status.e1.error)); near(e1()?.volume, V, 'küre alt yüzüne kadar hacim (sayısal tümlev)', 1e-5);
  // düzlemsel hedef davranışı değişmedi (kernel.test kapsar); konik açı eğri hedefte desteklenmez
  sk = rect('s1', 20, 20, 0, 0); r = await K.rebuild({ features: [cyl, sk, ex(sk, { taper: '3' })] }); ok(r.status.e1.error?.code === 'extrude.taper_mode', 'eğri hedef + konik açı açık hata: ' + r.status.e1.error?.code);
});

await madde(6, 'eskiz metnini metin olarak yeniden düzenleme', () => {
  const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ROOT, 'src/ui/sketch/fonts/Inter-Regular.ttf'))));
  const segsOf = (txt, o) => cleanSegments(textOutlines(font, txt, o), Math.max(1e-4, o.height * 2e-5));
  const sk = { points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [] }; let seq = 0; const nid = (p) => p + ++seq;
  // kullanıcının kendi çizgisi (metin dışı) korunmalı
  sk.points.u1 = { x: -50, y: -50 }; sk.points.u2 = { x: -40, y: -50 }; sk.ents.push({ id: 'ul', type: 'line', a: 'u1', b: 'u2' });
  const P1 = { text: 'AB', height: 10, x: 0, y: 0, angle: 0 };
  writeText(sk, segsOf('AB', P1), P1, nid, 2e-4);
  ok(sk.texts?.length === 1 && sk.texts[0].text === 'AB' && sk.texts[0].ents.length > 10, 'metin kaydı: parametreler + çizgi kimlikleri');
  const tid = sk.texts[0].id, firstLine = sk.texts[0].ents[0];
  ok(textOfEnt(sk, firstLine)?.id === tid && textOfEnt(sk, 'ul') === null, 'çizgiden metin kaydı bulunur; kullanıcı çizgisi metin değil');
  const regsAB = findRegions(sk).regions.length;
  const P2 = { text: 'O', height: 20, x: 5, y: 5, angle: 15 };
  const nPts0 = Object.keys(sk.points).length;
  writeText(sk, segsOf('O', P2), P2, nid, 4e-4, tid);
  ok(sk.texts.length === 1 && sk.texts[0].id === tid && sk.texts[0].text === 'O' && sk.texts[0].height === 20 && sk.texts[0].angle === 15, 'yerine yazma: aynı kayıt kimliği, yeni parametreler');
  ok(!sk.ents.some((e) => e.id === firstLine), 'eski metin çizgileri silindi');
  ok(sk.ents.some((e) => e.id === 'ul') && sk.points.u1 && sk.points.u2, 'metin dışı çizgi ve noktaları korunur');
  ok(sk.texts[0].ents.every((id) => sk.ents.some((e) => e.id === id)), 'kayıttaki her kimlik eskizde var');
  const used = new Set(sk.ents.flatMap((e) => [e.a, e.b])); ok(Object.keys(sk.points).every((k) => k === 'O' || used.has(k)), 'öksüz nokta kalmadı');
  ok(findRegions(sk).regions.length === 2 && regsAB > 2, '"O" iki kapalı bölge (dış + iç) verir: ' + findRegions(sk).regions.length);
  // kopyalanan çizgi metne ait sayılmaz; tek tek silinen parça listeden düşer; hepsi silinince kayıt kalkar
  const one = sk.texts[0].ents[0]; const e1 = sk.ents.find((e) => e.id === one); sk.ents.push({ ...e1, id: 'kopya' });
  ok(textOfEnt(sk, 'kopya') === null, 'kopya çizgi metin kaydına girmez');
  sk.ents = sk.ents.filter((e) => e.id !== one); pruneTexts(sk); ok(!sk.texts[0].ents.includes(one), 'silinen çizgi kayıttan düşer');
  sk.ents = sk.ents.filter((e) => !sk.texts[0].ents.includes(e.id)); pruneTexts(sk); ok(sk.texts === undefined, 'tüm çizgileri silinen metnin kaydı kalkar');
  // şema: texts alanı isteğe bağlı ve doğrulanır
  const sk2 = { points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [] }; writeText(sk2, segsOf('Mi', P1), { ...P1, text: 'Mi' }, nid, 2e-4);
  const doc = { params: [], features: [{ id: 's1', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '0' }, ...sk2 }] };
  let okv = true; try { validateDoc(doc); } catch (e) { okv = false; console.log(e); } ok(okv, 'metin kayıtlı eskiz şemadan geçer');
  const bad = JSON.parse(JSON.stringify(doc)); bad.features[0].texts[0].height = 'x'; let rej = false; try { validateDoc(bad); } catch (e) { rej = true; } ok(rej, 'bozuk metin kaydı reddedilir');
  const old = JSON.parse(JSON.stringify(doc)); delete old.features[0].texts; let okOld = true; try { validateDoc(old); } catch (e) { okOld = false; } ok(okOld, 'texts alanı olmayan eski belge değişmeden geçer');
  // arayüz bağlantısı (DOM'lu dosyalar; kaynak denetimi)
  const app = src('src/ui/app.js'), skr = src('src/ui/sketcher.js'), txs = src('src/ui/sketch/text.js');
  ok(/const editing = this\.sketcher\.selectedText\(\)/.test(app) && /replace: editing \? editing\.id : null/.test(app), 'Metin komutu seçili metni düzenleme kipinde açar');
  ok(/if \(f\.texts\) merged\.texts = f\.texts/.test(app) && /out\.texts = clone\(this\.sk\.texts\)/.test(skr) && /texts: this\.sk\.texts/.test(skr), 'metin kayıtları belgeye ve geri alma anlık görüntüsüne girer');
  ok(/writeText\(sk, segs, \{ text, height, x, y, angle \}, \(pre\) => this\._id\(pre\), snap, replace\)/.test(txs), 'insertText tek geri alma adımında yerine yazar');
});

await madde(7, 'P1 S3 holder_collision ×2 sınıflaması', () => {
  const out = path.join(ROOT, 'test', 'tmp', 'wp21-p1'); fs.mkdirSync(out, { recursive: true });
  const r = spawnSync(process.execPath, [path.join(ROOT, 'test/compare/P1/run-p1.mjs')], { cwd: ROOT, env: { ...process.env, P1_OUT: out }, encoding: 'utf8', maxBuffer: 256 << 20 });
  ok(r.status === 0, 'run-p1 koştu: ' + (r.stderr || '').slice(-300));
  if (r.status !== 0) return;
  const R = JSON.parse(fs.readFileSync(path.join(out, 'p1-mihenk-sonuc.json'), 'utf8'));
  const s3 = R.setups.find((s) => s.id === 'S3'); const hc = s3.gates.filter((g) => g.code === 'cam.sim.holder_collision');
  ok(hc.length === 2 && hc.every((g) => g.opId === 'o10'), 'ana kapı (ayrı setup): o10 iki delikte holder_collision');
  const D = R.deneyler.WP21_S3_tutucu; ok(D && D.delik, 'deney sonucu var: ' + JSON.stringify(D?.hata));
  if (!D?.delik) return;
  for (const hx of ['16', '-16']) {
    const d = D.delik[hx];
    ok(hc.some((g) => Math.abs(g.params.depth - (-d.ayri.bosluk)) < 0.01), `${hx}: kapı derinliği = ham kutu stoğuyla boşluk açığı (${-d.ayri.bosluk}); çarpılan malzeme stok kutusunun üstü (z=${d.ayri.en_yuksek})`);
    ok(d.zincir.bosluk < 0 && d.zincir.en_yuksek > d.model.en_yuksek, `${hx}: zincirde de çarpışma (${d.zincir.bosluk}) ama zincir stoğu modelin ${r3(d.zincir.en_yuksek - d.model.en_yuksek)} mm üstünde (genişletme + yukarı yuvarlama)`);
    ok(d.zincir_genisletmesiz.bosluk > 0 && Math.abs(d.zincir_genisletmesiz.en_yuksek - d.model.en_yuksek) < 0.06, `${hx}: önceki setup'ların gerçekte bıraktığı malzeme = model kule üstü; boşluk ${d.zincir_genisletmesiz.bosluk} mm > 0 (çarpışma yok)`);
  }
  ok(s3.gates.some((g) => g.code === 'cam.gate.body_short' && g.level === 'block'), 'asıl gerçek bulgu ayrıca duruyor: T30 taşma boyu kısa (body_short)');
  ok(fs.existsSync(path.join(ROOT, 'test/altin/SINIFLAMA.md')) && /holder_collision/.test(src('test/altin/SINIFLAMA.md')), 'sınıflama raporu test/altin/SINIFLAMA.md');
});

await madde(8, 'iptal testi: IPTAL_KATI varsayılanı katı (bilinen açık kalktı)', () => {
  const py = src('test/iptal.test.py'), app = src('src/ui/app.js'), all = src('scripts/test-all.mjs');
  ok(/os\.environ\.get\('IPTAL_KATI', '1'\) != '0'/.test(py), 'varsayılan katı; yalnız IPTAL_KATI=0 tanı kipinde bilinen açık yazılır');
  ok(!/IPTAL_KATI=1 ile kalır/.test(py), 'eski "IPTAL_KATI=1 ile kalır" kipi kalktı');
  ok(/const res = await this\.rebuildDoc\(doc[^\n]*\n\s*if \(seq !== this\._seq\) \{ this\.staleDropped/.test(app), 'düzeltme yerinde: _rebuildTask eski sonucu uygulamadan atar (seq denetimi)');
  ok(/py\('test\/iptal\.test\.py'/.test(all) && /wp21\.test\.mjs/.test(all), 'test:all iptal ve wp21 testlerini koşar');
});

console.log(`${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
