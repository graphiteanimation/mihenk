// WP-17 teknik resim testi: HLR gorunusleri (gorunur/gizli kenar), kesit (kapali kontur, tarama alani), ISO 286, olcu yeniden esleme,
// PDF yapisi (xref ofsetleri, sayfa sayisi; varsa qpdf --check), DXF geri okuma (mevcut okuyucu), ilk parca formu, sema ve eski belge.
// Calistir: node test/resim.test.mjs
import path from 'node:path'; import { fileURLToPath } from 'node:url'; import fs from 'node:fs'; import os from 'node:os'; import { spawnSync } from 'node:child_process';
import opencascade from 'replicad-opencascadejs';
import { initKernel } from '../src/kernel/kernel.js';
import { parseDxf } from '../src/shared/dxf.js';
import { validateDoc } from '../src/shared/schema.js';
import { setLang, t } from '../src/shared/i18n.js';
import { fitDeviations, itValue } from '../src/drawing/iso286.js';
import { cleanView, chainLoops, regionArea, hatch, clipCircle, mergeLines } from '../src/drawing/geom.js';
import { ORIENT, childBasis, mkBasis, sectionBasis, kernelSpecs, viewBasis } from '../src/drawing/views.js';
import { mkRef, evalDim, dimText, tolDev } from '../src/drawing/dims.js';
import { newDrawing, addStdViews, computeDrawing, validateDrawings } from '../src/drawing/model.js';
import { toPdf } from '../src/drawing/pdf.js';
import { toDxf } from '../src/drawing/dxfout.js';
import { toSvg } from '../src/drawing/svg.js';
import { faiRows, faiCsv, faiPages } from '../src/drawing/fai.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const wasm = path.join(here, '../node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, m, tl = 1e-6) => ok(Math.abs(a - b) <= tl, `${m}: ${a} != ${b}`);
const sec = (s) => console.log(s);
setLang('tr', false);
const T = (k, p) => t(k, p);

// ------------------------------------------------------------------ 1. ISO 286
sec('1. ISO 286');
{
  const h7 = fitDeviations('H7', 20); near(h7.upper, 0.021, 'H7 O20 ust'); near(h7.lower, 0, 'H7 O20 alt');
  ok(itValue(7, 20) === 21 && itValue(6, 20) === 13 && itValue(7, 18) === 18 && itValue(7, 18.01) === 21, 'IT7/IT6 aralik sinirlari');
  const cases = [['h6', 20, 0, -0.013], ['g6', 20, -0.007, -0.020], ['f7', 20, -0.020, -0.041], ['k6', 20, 0.015, 0.002], ['m6', 20, 0.021, 0.008], ['n6', 20, 0.028, 0.015], ['p6', 20, 0.035, 0.022],
    ['K7', 20, 0.006, -0.015], ['M7', 20, 0, -0.021], ['N7', 20, -0.007, -0.028], ['P7', 20, -0.014, -0.035], ['JS7', 20, 0.010, -0.010], ['e8', 20, -0.040, -0.073], ['d9', 20, -0.065, -0.117],
    ['H7', 50, 0.025, 0], ['H7', 50.01, 0.030, 0], ['h6', 3, 0, -0.006], ['K7', 3, 0, -0.010], ['M7', 2, -0.002, -0.012], ['H8', 100, 0.054, 0], ['G7', 10, 0.020, 0.005], ['F8', 30, 0.053, 0.020]];
  for (const [c, s, u, l] of cases) { const d = fitDeviations(c, s); ok(d && Math.abs(d.upper - u) < 1e-9 && Math.abs(d.lower - l) < 1e-9, `${c} O${s}: ${JSON.stringify(d)} != ${u}/${l}`); }
  ok(fitDeviations('P8', 20) === null && fitDeviations('Z7', 20) === null && fitDeviations('H7', 600) === null && fitDeviations('H7', 0) === null, 'kapsam disi: null (uydurma yok)');
  const tx = dimText({ type: 'dia', tol: { k: 'fit', fit: 'H7', show: true } }, 20, { prec: 2, dec: ',' });
  ok(tx.main === 'Ø20 H7' && tx.devs[0] === '+0,021' && tx.devs[1] === '0', 'metin: ' + JSON.stringify(tx));
  const td = tolDev({ k: 'fit', fit: 'H7' }, 20); near(20 + td.upper, 20.021, 'ust sinir'); near(20 + td.lower, 20, 'alt sinir');
}

// ------------------------------------------------------------------ 2. 2B yardimcilar
sec('2. 2B geometri');
{
  const c = cleanView([{ t: 'l', a: [0, 0], b: [10, 0], vis: true }, { t: 'l', a: [2, 0], b: [12, 0], vis: false }, { t: 'l', a: [0, 0], b: [10, 0], vis: true }, { t: 'p', pts: [[0, 5], [5, 5.00000001], [10, 5]], vis: false }]);
  ok(c.filter((p) => p.vis).length === 1, 'gorunur kopya tekil');
  const hl = c.filter((p) => !p.vis && p.t === 'l'); ok(hl.length === 2 && hl.some((p) => Math.abs(Math.max(p.a[0], p.b[0]) - 12) < 1e-9 && Math.abs(Math.min(p.a[0], p.b[0]) - 10) < 1e-9), 'gizli cizginin gorunurle ortusen kismi silindi: ' + JSON.stringify(hl));
  const m = mergeLines([{ t: 'l', a: [0, 0], b: [5, 0], vis: true }, { t: 'l', a: [5, 0], b: [9, 0], vis: true }]); ok(m.length === 1 && Math.abs(m[0].b[0] - 9) < 1e-9, 'es dogrusal birlesim');
  const sq = [[[0, 0], [10, 0]], [[10, 0], [10, 10]], [[0, 10], [10, 10]], [[0, 10], [0, 0]]];
  const ch = chainLoops(sq); ok(ch.loops.length === 1 && ch.open === 0, 'zincir: kapali dongu');
  const hole = [[[3, 3], [7, 3]], [[7, 3], [7, 7]], [[7, 7], [3, 7]], [[3, 7], [3, 3]]];
  const ch2 = chainLoops([...sq, ...hole]); near(regionArea(ch2.loops), 100 - 16, 'cift-tek alan', 1e-9);
  const hs = hatch(ch2.loops, 1); ok(hs.length > 5 && hs.every(([a, b]) => { const m2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; return !(m2[0] > 3.01 && m2[0] < 6.99 && m2[1] > 3.01 && m2[1] < 6.99); }), 'tarama delige girmez');
  const cl = clipCircle([{ t: 'l', a: [-10, 0], b: [10, 0], vis: true }], [0, 0], 5); ok(cl.length === 1 && Math.abs(Math.hypot(cl[0].b[0] - cl[0].a[0], cl[0].b[1] - cl[0].a[1]) - 10) < 1e-6, 'daireye kirpma');
}

// ------------------------------------------------------------------ 3. gorunus tabanlari
sec('3. gorunus yonelimi / izdusum yontemi');
{
  const F = mkBasis(ORIENT.front.d, ORIENT.front.x);
  const eq = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-12);
  ok(eq(F.y, [0, 0, 1]), 'on gorunus yukari +Z');
  // ucuncu aci: sagdaki gorunus sagdan gorulen (d=+X); birinci aci: sagdaki gorunus soldan gorulen (d=-X)
  ok(eq(childBasis(F, 'right', 'third').d, [1, 0, 0]) && eq(childBasis(F, 'right', 'first').d, [-1, 0, 0]), 'sag yerlesim d');
  ok(eq(childBasis(F, 'below', 'first').d, [0, 0, 1]) && eq(childBasis(F, 'above', 'third').d, [0, 0, 1]), 'ust gorunus yerlesimi');
  const R = childBasis(F, 'right', 'third'); ok(eq(R.x, [0, 1, 0]) && eq(R.y, [0, 0, 1]), 'sag gorunus ekseni');
  const S = sectionBasis(F, { p: [50, 10], ang: 0 }); ok(eq(S.d, [0, 0, 1]) && eq(S.x, [1, 0, 0]) && eq(S.y, [0, 1, 0]), 'yatay kesme cizgisi: ustten bakis');
}

// ------------------------------------------------------------------ 4. cekirdek: kup-delikli parca
sec('4. HLR gorunusleri (kup + delik)');
const K = await initKernel(opencascade, () => wasm);
const rect = (w, h) => ({ pts: { p1: { x: 0, y: 0 }, p2: { x: 'W', y: 0 }, p3: { x: 'W', y: h }, p4: { x: 0, y: h } }, ents: [1, 2, 3, 4].map((i) => ({ id: 'l' + i, type: 'line', a: 'p' + i, b: 'p' + ((i % 4) + 1) })) });
void rect;
function partDoc(L = 100, withHole = true) {
  const pts = { p1: { x: 0, y: 0 }, p2: { x: L, y: 0 }, p3: { x: L, y: 60 }, p4: { x: 0, y: 60 } };
  const ents = [1, 2, 3, 4].map((i) => ({ id: 'l' + i, type: 'line', a: 'p' + i, b: 'p' + ((i % 4) + 1) }));
  const f = [{ id: 's1', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '0' }, points: pts, ents }, { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', dist: '20', op: 'new' }];
  if (withHole) f.push({ id: 's2', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '20' }, points: { c: { x: 50, y: 30 } }, ents: [{ id: 'pt', type: 'point', p: 'c' }] }, { id: 'h1', type: 'hole', sketch: 's2', kind: 'simple', dia: '20', extent: 'all', flip: false });
  return { params: [], features: f };
}
let out = await K.rebuild(partDoc());
ok(out.status.h1.ok && out.bodies.length === 1, 'parca kuruldu');
const call = async (cmd, args) => { if (cmd !== 'drawProject') throw new Error(cmd); return K.drawProject(args); };
const rv = K.drawProject({ views: [{ id: 'f', ...ORIENT.front }, { id: 't', ...ORIENT.top }, { id: 's', ...ORIENT.front, sec: { p: [50, 30, 10] } }] }).views;
{
  const f = rv.f; const vis = f.prims.filter((p) => p.vis), hid = f.prims.filter((p) => !p.vis);
  ok(vis.length === 4 && vis.every((p) => p.t === 'l'), 'on gorunus: 4 gorunur kenar (dis dikdortgen): ' + vis.length);
  ok(hid.length === 2 && hid.every((p) => p.t === 'l' && Math.abs(p.a[0] - p.b[0]) < 1e-6) && hid.map((p) => Math.round(p.a[0])).sort((a, b) => a - b).join() === '40,60', 'on gorunus: delik siluetleri gizli (x=40, x=60): ' + JSON.stringify(hid.map((p) => [p.a, p.b])));
  ok(vis.every((p) => p.src && p.src.startsWith('e1/')), 'gorunur kenarlar model kenar anahtarli');
  const tp = rv.t; ok(tp.prims.filter((p) => p.vis).length === 5 && tp.prims.some((p) => p.vis && p.t === 'c' && Math.abs(p.r - 10) < 1e-9), 'ust gorunus: 4 kenar + O20 daire gorunur');
  ok(tp.prims.filter((p) => !p.vis).length === 0, 'ust gorunus: alt daire gorunur daireyle ortustugu icin gizli cizilmez');
  const s = rv.s; ok(!s.error && s.loops.length === 2 && s.open === 0, 'kesit: iki kapali kontur (delik ikiye boler): ' + s.loops?.length + '/' + s.open);
  near(regionArea(s.loops), 2 * 40 * 20, 'kesit alani (2 x 40 x 20)', 1e-3);
  ok(s.prims.filter((p) => !p.vis).length === 0 && s.prims.filter((p) => p.vis).length === 6, 'kesit gorunusu: 6 gorunur kenar, gizli yok');
}

// ------------------------------------------------------------------ 5. resim sayfasi, olculer, model degisimi
sec('5. sayfa, olcu, yeniden esleme');
const bb = (await K.rebuild(partDoc())).bodies.length ? K.drawProject({ views: [] }).bbox : null;
const dr = newDrawing({ bbox: bb, dec: ',' });
ok(dr.sheet.angle === 'first' && dr.sheet.tb.company === '', 'varsayilan: birinci aci, sirket adi bos');
addStdViews(dr, bb);
ok(dr.views.length === 4 && kernelSpecs(dr).length === 4, 'standart uc gorunus + izometrik');
const vF = dr.views[0], vT = dr.views[1];
ok(viewBasis(dr, vT).d[2] === 1, 'birinci aci: alttaki gorunus ustten gorulen');
dr.views.push({ id: 'vs', kind: 'sec', parent: vT.id, cut: { p: [0, 30], ang: 0 }, label: 'A', o: [300, 80] });
dr.views.push({ id: 'vd', kind: 'det', parent: vF.id, c: [100, 20], r: 8, scale: 4, label: 'B', o: [330, 200] });
let C = await computeDrawing(dr, call, T, out.holes);
ok(!C.issues.length, 'sayfa sorunsuz: ' + JSON.stringify(C.issues));
const fp = C.views[vF.id].prims; const tpv = C.views[vT.id].prims;
const left = fp.find((p) => p.vis && p.t === 'l' && Math.abs(p.a[0]) < 1e-6 && Math.abs(p.b[0]) < 1e-6), right = fp.find((p) => p.vis && p.t === 'l' && Math.abs(p.a[0] - 100) < 1e-6 && Math.abs(p.b[0] - 100) < 1e-6);
const circ = tpv.find((p) => p.t === 'c');
const silh = fp.find((p) => !p.vis && Math.abs(p.a[0] - 40) < 1e-6);
dr.dims.push({ id: 'd1', type: 'lin', view: vF.id, dir: 'h', refs: [mkRef(left, 'a', [0, 0]), mkRef(right, 'a', [100, 0])], off: 12 });
dr.dims.push({ id: 'd2', type: 'dia', view: vT.id, refs: [mkRef(circ)], tol: { k: 'fit', fit: 'H7', show: true }, ang: 45 });
dr.dims.push({ id: 'd3', type: 'lin', view: vF.id, dir: 'v', refs: [mkRef(right, 'a', [100, 0]), mkRef(right, 'b', [100, 20])], off: 10, tol: { k: 'sym', up: 0.1 } });
dr.dims.push({ id: 'd4', type: 'lin', view: vF.id, dir: 'h', refs: [mkRef(left, 'a', [0, 0]), mkRef(silh, 'a', [40, 0])], off: -8 });
dr.rough.push({ id: 'r1', view: vF.id, p: [30, 20], proc: 'remove', param: 'Ra', val: 1.6 });
dr.holeTable = { view: vT.id, p: [30, 280] };
dr.fai = true;
C = await computeDrawing(dr, call, T, out.holes);
const D = (id) => C.dims.find((d) => d.id === id);
ok(!D('d1').lost && Math.abs(D('d1').value - 100) < 1e-9, 'yatay olcu 100: ' + D('d1').value);
ok(!D('d2').lost && Math.abs(D('d2').value - 20) < 1e-9 && D('d2').text.main === 'Ø20 H7', 'cap O20 H7');
ok(Math.abs(D('d2').dev.upper - 0.021) < 1e-12 && D('d2').dev.lower === 0, 'H7 sapmalari +0,021/0');
ok(Math.abs(D('d3').value - 20) < 1e-9, 'dusey olcu 20');
ok(Math.abs(D('d4').value - 40) < 1e-9 && D('d4').how.includes('sig'), 'siluete olcu (anahtarsiz, imza ile): ' + JSON.stringify(D('d4').how));
ok(C.holeRows.length === 1 && C.holeRows[0].tag === 'A1' && Math.abs(C.holeRows[0].x - 50) < 1e-9 && Math.abs(C.holeRows[0].y - 30) < 1e-9 && /Ø20/.test(C.holeRows[0].desc), 'delik tablosu: ' + JSON.stringify(C.holeRows));
const secV = C.views.vs; ok(secV.loops.length === 2 && C.list.filter((x) => x.ly === 'hat').length > 3, 'kesit taramasi cizildi');
ok(C.views.vd.prims.length > 0 && C.views.vd.prims.every((p) => (p.t === 'l' ? [p.a, p.b] : p.t === 'p' ? p.pts : []).every((q) => Math.hypot(q[0] - 100, q[1] - 20) <= 8 + 1e-6)), 'ayrinti gorunusu daireye kirpildi');
// model degisimi: L 100 -> 120 (delik sabit)
out = await K.rebuild(partDoc(120));
const C2 = await computeDrawing(dr, call, T, out.holes);
const D2 = (id) => C2.dims.find((d) => d.id === id);
ok(!D2('d1').lost && Math.abs(D2('d1').value - 120) < 1e-9 && D2('d1').how.every((h) => h === 'key'), 'L=120: olcu yeni degeri (anahtarla esledi): ' + D2('d1').value + ' ' + JSON.stringify(D2('d1').how));
ok(C2.views[vF.id].box[2] > 119.99, 'gorunus guncellendi (kutu 120)');
ok(!D2('d2').lost && Math.abs(D2('d2').value - 20) < 1e-9, 'cap korunur');
ok(!D2('d4').lost && Math.abs(D2('d4').value - 40) < 1e-9, 'siluet olcusu yerinde kaldi');
// delik kaldirildi: delige bagli olcu kopuk isaretlenir, digerleri durur
out = await K.rebuild(partDoc(120, false));
dr.dims.find((d) => d.id === 'd2').last = 20;
const C3 = await computeDrawing(dr, call, T, out.holes);
const D3 = (id) => C3.dims.find((d) => d.id === id);
ok(D3('d2').lost && D3('d2').value === 20, 'delik silindi: cap olcusu kopuk, son deger korunur');
ok(D3('d4').lost, 'silinen siluete bagli olcu kopuk (tahmin edilmez)');
ok(!D3('d1').lost && Math.abs(D3('d1').value - 120) < 1e-9, 'diger olcu etkilenmez');
ok(C3.list.some((x) => x.ly === 'lost'), 'kopuk olcu gorunur bicimde isaretli');
out = await K.rebuild(partDoc());
C = await computeDrawing(dr, call, T, out.holes);

// ------------------------------------------------------------------ 6. PDF / DXF / SVG
sec('6. PDF ve DXF disa aktarma');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mihenk-resim-'));
{
  const pdf = toPdf([{ W: C.W, H: C.H, list: C.list }], { title: 'Deneme şağı' });
  const s = Buffer.from(pdf).toString('latin1');
  ok(s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF'), 'PDF baslik/son');
  ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(s), 'PDF 7 bit ASCII');
  const sx = +/startxref\n(\d+)/.exec(s)[1]; ok(s.slice(sx, sx + 4) === 'xref', 'startxref ofseti');
  const xr = s.slice(sx).split('\n'); const n = +xr[1].split(' ')[1]; let good = 0;
  for (let i = 1; i < n; i++) { const off = +xr[2 + i].slice(0, 10); if (s.slice(off).startsWith(`${i} 0 obj`)) good++; }
  ok(good === n - 1, `xref ofsetleri dogru (${good}/${n - 1})`);
  ok((s.match(/\/Type \/Page\b/g) || []).length === 1, 'tek sayfa');
  for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) { const st = m.index + m[0].length; ok(s.slice(st + +m[1], st + +m[1] + 10) === '\nendstream', 'akis uzunlugu'); }
  ok(/\\375|\\376|\\360/.test(s), 'Turkce harfler Latin-5 konumlarinda (sekizli)');
  const f = path.join(tmp, 'r.pdf'); fs.writeFileSync(f, pdf);
  const q = spawnSync('qpdf', ['--check', f], { encoding: 'utf8' });
  if (q.error) console.log('   (qpdf yok: harici PDF denetimi atlandi)'); else ok(q.status === 0, 'qpdf --check: ' + (q.stdout + q.stderr).split('\n').slice(-3).join(' '));
  const pt = spawnSync('pdftotext', [f, '-'], { encoding: 'utf8' });
  if (!pt.error) ok(/Ø20 H7/.test(pt.stdout) && pt.stdout.includes(t('drw.tb.title')), 'pdftotext metni okur (O20 H7, antet)');
}
{
  const dx = toDxf({ W: C.W, H: C.H, list: C.list });
  const P = parseDxf(dx.text);
  const cnt = (ty) => P.ents.filter((e) => e.type === ty).length;
  ok(cnt('line') === dx.counts.LINE && cnt('circle') === dx.counts.CIRCLE && cnt('arc') === dx.counts.ARC, `DXF geri okuma: cizgi ${cnt('line')}/${dx.counts.LINE}, daire ${cnt('circle')}/${dx.counts.CIRCLE}, yay ${cnt('arc')}/${dx.counts.ARC}`);
  ok((P.skipped.TEXT || 0) === dx.counts.TEXT && dx.counts.TEXT > 20, 'TEXT varliklari (okuyucu atlar, sayi tutar): ' + P.skipped.TEXT);
  ok(/\nHIDDEN\n/.test(dx.text) && /\nCENTER\n/.test(dx.text) && /%%c20 H7/.test(dx.text), 'DXF cizgi turleri ve cap metni');
  ok(/^[\x0a\x20-\x7e]*$/.test(dx.text), 'DXF ASCII (\\U+ kacisli)');
  // 100 mm'lik on gorunus alt kenari sayfada olcekle (1:1) 100 mm
  const s = dr.sheet.scale; const lines = P.ents.filter((e) => e.type === 'line' && Math.abs(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) - 100 * s) < 1e-6);
  ok(lines.length >= 2, 'olcekli kenar uzunlugu DXF\'te korunur');
  const svg = toSvg({ W: C.W, H: C.H, list: C.list }); ok(svg.startsWith('<svg') && !/<script/i.test(svg) && svg.includes('Ø20 H7'), 'SVG onizleme');
  const svgInj = toSvg({ W: 10, H: 10, list: [{ k: 't', p: [1, 1], s: '<script>x</script>', h: 3, ly: 'txt' }] }); ok(!svgInj.includes('<script'), 'SVG metin kacislanir');
}

// ------------------------------------------------------------------ 7. ilk parca kontrol formu
sec('7. ilk parca kontrol formu');
{
  const rows = faiRows(dr, C, T);
  ok(rows.length === 4 && rows.map((r) => r.n).join() === '1,2,3,4', 'balon numaralari 1..4');
  const r2 = rows[1]; ok(r2.nominal === 'Ø20 H7' && r2.upper === '+0,021' && r2.lower === '0' && r2.min === '20' && r2.max === '20,021' && r2.measured === '' && r2.result === '', 'satir: ' + JSON.stringify(r2));
  ok(C.list.filter((x) => x.k === 'c' && x.ly === 'dim').length >= 4, 'balonlar cizildi');
  const csv = faiCsv(rows, T, ','); const ln = csv.replace(/^﻿/, '').trim().split('\r\n');
  ok(ln.length === 5 && ln[0].split(';').length === 10 && ln[2].split(';')[8] === '', 'CSV: baslik + 4 satir, olculen bos');
  const pages = faiPages(dr, rows, T); const pdf = Buffer.from(toPdf(pages)).toString('latin1'); ok(pdf.includes('%%EOF') && (pdf.match(/\/Type \/Page\b/g) || []).length === 1, 'FAI PDF');
  const many = Array.from({ length: 70 }, (_, i) => ({ ...rows[0], n: i + 1 })); ok(faiPages(dr, many, T).length === 3, 'FAI coklu sayfa');
}

// ------------------------------------------------------------------ 8. belge semasi, eski belge
sec('8. belge semasi ve eski belge');
{
  const doc = { ...partDoc(), drawings: [dr] };
  let e = null; try { validateDoc(JSON.parse(JSON.stringify(doc))); } catch (x) { e = x; } ok(!e, 'resimli belge gecerli: ' + (e && e.code + ' ' + JSON.stringify(e.params)));
  e = null; try { validateDoc(partDoc()); } catch (x) { e = x; } ok(!e, 'eski belge (drawings yok) gecerli');
  for (const f of fs.readdirSync(path.join(here, '../ornekler')).filter((x) => x.endsWith('.mhnk'))) { const j = JSON.parse(fs.readFileSync(path.join(here, '../ornekler', f), 'utf8')); let er = null; try { validateDoc(j.doc || j); } catch (x) { er = x; } ok(!er, 'ornek belge acilir: ' + f); }
  const bad = JSON.parse(JSON.stringify(dr)); bad.views[0].kind = 'zz'; e = null; try { validateDrawings([bad]); } catch (x) { e = x; } ok(e && e.code === 'schema.bad_field', 'gecersiz gorunus turu reddedilir');
  const bad2 = JSON.parse(JSON.stringify(dr)); bad2.views[1].parent = 'yok'; e = null; try { validateDrawings([bad2]); } catch (x) { e = x; } ok(e && e.code === 'schema.bad_field', 'olmayan ana gorunus reddedilir');
  const bad3 = JSON.parse(JSON.stringify(dr)); bad3.sheet.tb.evil = 'x'; e = null; try { validateDrawings([bad3]); } catch (x) { e = x; } ok(!!e, 'bilinmeyen antet alani reddedilir');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`resim: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
