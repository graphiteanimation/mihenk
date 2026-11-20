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
import { alignTraceCons, hvSame, autoHvRedundantAfterFix } from '../src/ui/sketch/autoalign.js';
import { solveSketch } from '../src/ui/solver.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
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
  const skSrc = src('src/ui/sketcher.js');
  ok(/s\.kind === 'align'\) \{ if \(autoOn\('hv'\)\) for \(const \[ty, a, b\] of alignTraceCons/.test(skSrc), 'sketcher _ptFor hizalama izinden kısıt ekler (otomatik H/V ayarına bağlı)');
  ok(/autoHvRedundantAfterFix\(s, ids\)/.test(skSrc) && /sk\.fix_auto_dropped/.test(skSrc), 'sketcher Sabitle otomatik kısıtları düşürür ve bildirir');
  for (const l of ['tr', 'en']) ok(tLang(l, 'sk.fix_auto_dropped') !== 'sk.fix_auto_dropped', `${l}: sk.fix_auto_dropped`);
});

console.log(`${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
