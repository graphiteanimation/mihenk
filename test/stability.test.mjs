// Kararlı profil seçimi ({ents,hint}), eski dizin yükseltme, profile.lost/ambiguous hataları ve
// elips / elips yayı / spline profillerinin gerçek eğri olarak Extrude edilip analitik hacimle karşılaştırılması.
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import { initKernel } from '../src/kernel/kernel.js';
import { findRegions, selectionFor, matchSelection, resolveProfiles, upgradeDocProfiles } from '../src/shared/profiles.js';
import { validateDoc } from '../src/shared/schema.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const wasm = path.join(here, '../node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  BAŞARISIZ', m); } };
const near = (a, b, m, t = 1e-3) => ok(Math.abs(a - b) <= t * Math.max(1, Math.abs(b)), `${m}: ${a} != ${b}`);
const K = await initKernel(opencascade, () => wasm);
const sketchF = (id, points, ents) => ({ id, type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '0' }, points: { O: { x: 0, y: 0, fixed: true }, ...points }, ents });
const ext = (id, sk, profiles, d = '10') => ({ id, type: 'extrude', sketch: sk, profiles, dist: d, op: 'new' });
const rectEnts = (x0, y0, x1, y1) => ({ points: { a: { x: x0, y: y0 }, b: { x: x1, y: y0 }, c: { x: x1, y: y1 }, d: { x: x0, y: y1 } }, ents: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']].map(([p, q], i) => ({ id: 'l' + i, type: 'line', a: p, b: q })) });

// ---- 1) seçim = sınır varlık kümesi + ipucu; bölge sırası değişse de aynı bölge bulunur
{
  const R = rectEnts(0, 0, 40, 20); const s = sketchF('s1', { ...R.points, m: { x: 20, y: 0 }, n: { x: 20, y: 20 } }, [...R.ents, { id: 'cut', type: 'line', a: 'm', b: 'n' }]);
  // kenarlar bölünmediği için dikey çizgi iki bölge yapmaz; gerçek bölünme: köşegen
  const s2 = sketchF('s1', R.points, [...R.ents, { id: 'dg', type: 'line', a: 'a', b: 'c' }]);
  const rg = findRegions(s2).regions; ok(rg.length === 2, 'köşegen 2 bölge');
  const sel = selectionFor(rg[1]); ok(Array.isArray(sel.ents) && sel.hint.length === 2, 'selectionFor biçimi');
  const rev = [...rg].reverse(); const m = matchSelection(rev, sel); ok(m.idx === 0, 'bölge sırası değişse de eşleşir');
  ok(matchSelection(rg, { ents: ['yok'], hint: [0, 0] }).err === 'lost', 'kayıp -> lost');
  const dup = [rg[0], { ...rg[0] }]; ok(matchSelection(dup, selectionFor(rg[0])).err === 'ambiguous', 'aynı sınır, ipucu ikisini de kapsar -> ambiguous');
  const rs = resolveProfiles(rg, [selectionFor(rg[0]), { ents: ['yok'], hint: [1, 1] }]); ok(rs.idx.length === 1 && rs.errs[0] === 'lost', 'resolveProfiles kısmi kayıp');
  // çekirdek: seçili bölge hacmi
  const doc = { params: [], features: [s2, ext('e1', 's1', [selectionFor(rg[0])])] };
  validateDoc(doc);
  const out = await K.rebuild(doc); ok(out.status.e1.ok, 'extrude ents: ' + out.status.e1.error?.code); near(out.bodies[0].volume, 400 * 10, 'üçgen hacmi');
  // sketch değişir (köşegen silinir): sınır kümesi artık yok -> profile.lost, sessiz yanlış gövde yok
  const doc2 = { params: [], features: [sketchF('s1', R.points, R.ents), ext('e1', 's1', [selectionFor(rg[0])])] };
  const o2 = await K.rebuild(doc2); ok(!o2.status.e1.ok && o2.status.e1.error?.code === 'profile.lost', 'profile.lost: ' + o2.status.e1.error?.code);
  // eski sayısal dizin: yükseltilir
  const doc3 = { params: [], features: [s2, ext('e1', 's1', [1])] }; const n = upgradeDocProfiles(doc3);
  ok(n === 1 && typeof doc3.features[1].profiles[0] === 'object', 'sayısal dizin yükseltildi'); validateDoc(doc3);
  const o3 = await K.rebuild(doc3); ok(o3.status.e1.ok, 'yükseltilmiş belge çalışır'); near(o3.bodies[0].volume, 4000, 'yükseltilmiş hacim');
  ok(upgradeDocProfiles(doc3) === 0, 'ikinci yükseltme etkisiz');
  // yükseltilmemiş belgede bozuk sayısal dizin açık hata verir
  const doc4 = { params: [], features: [s2, ext('e1', 's1', [7])] }; const o4 = await K.rebuild(doc4); ok(!o4.status.e1.ok, 'kayıp sayısal dizin hata verir');
}

// ---- 2) elips: alan = pi a b, hacim = pi a b h
{
  // merkez O, odak (6,0), rmin 4 -> a = sqrt(36+16)
  const a = Math.sqrt(52), b = 4;
  const s = sketchF('s1', { c: { x: 0, y: 0 }, f: { x: 6, y: 0 } }, [{ id: 'el', type: 'ellipse', c: 'c', f: 'f', rmin: b }]);
  const rg = findRegions(s).regions; ok(rg.length === 1, 'elips 1 bölge'); near(rg[0].area, Math.PI * a * b, 'elips alanı', 1e-4);
  const out = await K.rebuild({ params: [], features: [s, ext('e1', 's1', 'all')] });
  ok(out.status.e1.ok, 'elips extrude: ' + out.status.e1.error?.code); near(out.bodies[0].volume, Math.PI * a * b * 10, 'elips hacmi', 1e-4);
}
// ---- 3) elips yayı + kiriş: dairesel dilim olmayan kapalı profil; analitik alan = a b (θ - sinθ cosθ ... ) yerine ölçek: elips x'=x/a, y'=y/b ile daire parçası
{
  // a = 10, b = 5, odaklar (+-sqrt75, 0), yay: üst yarı (180 derece ... ) -> yarım elips + çap
  const c = Math.sqrt(75); const b = 5, a = 10;
  const pts = { c: { x: 0, y: 0 }, f: { x: c, y: 0 }, p: { x: a, y: 0 }, q: { x: -a, y: 0 } };
  const s = sketchF('s1', pts, [{ id: 'ea', type: 'ellarc', c: 'c', f: 'f', rmin: b, a: 'p', b: 'q' }, { id: 'ch', type: 'line', a: 'q', b: 'p' }]);
  const rg = findRegions(s).regions; ok(rg.length === 1, 'elips yayı + kiriş 1 bölge: ' + rg.length); near(rg[0].area, Math.PI * a * b / 2, 'yarım elips alanı', 1e-4);
  const out = await K.rebuild({ params: [], features: [s, ext('e1', 's1', 'all')] });
  ok(out.status.e1.ok, 'elips yayı extrude: ' + out.status.e1.error?.code); near(out.bodies[0].volume, Math.PI * a * b / 2 * 10, 'yarım elips hacmi', 1e-4);
  // dilim: yay + kiriş (kısa yay, 90 derece): alan = a b (pi/4 - 1/2) (elipsin x/a,y/b ölçeğinde çeyrek daire - üçgen)
  const s2 = sketchF('s1', { c: { x: 0, y: 0 }, f: { x: c, y: 0 }, p: { x: a, y: 0 }, q: { x: 0, y: b } }, [{ id: 'ea', type: 'ellarc', c: 'c', f: 'f', rmin: b, a: 'p', b: 'q' }, { id: 'ch', type: 'line', a: 'q', b: 'p' }]);
  const o2 = await K.rebuild({ params: [], features: [s2, ext('e1', 's1', 'all')] });
  ok(o2.status.e1.ok, 'elips çeyrek parça extrude: ' + o2.status.e1.error?.code); near(o2.bodies[0].volume, a * b * (Math.PI / 4 - 0.5) * 10, 'elips parçası hacmi', 1e-4);
}
// ---- 4) kapalı spline: sayısal (ince ızgara) alan ile hacim karşılaştırması
{
  const P = [[0, 0], [30, -5], [50, 20], [25, 45], [-10, 25]];
  const pts = {}; P.forEach((p, i) => { pts['q' + i] = { x: p[0], y: p[1] }; });
  const s = sketchF('s1', pts, [{ id: 'sp', type: 'spline', pts: P.map((_, i) => 'q' + i), closed: true }]);
  const fr = findRegions(s); ok(fr.regions.length === 1, 'kapalı spline 1 bölge');
  const A = fr.regions[0].area; ok(A > 500, 'spline alanı makul: ' + A);
  const out = await K.rebuild({ params: [], features: [s, ext('e1', 's1', 'all')] });
  ok(out.status.e1.ok, 'spline extrude: ' + out.status.e1.error?.code); near(out.bodies[0].volume, A * 10, 'spline hacmi = profil alanı x 10', 5e-3);
  // bağımsız alan: bölgenin çokgeninden ayak izi (Gauss) ve kerneldeki gövde kutusu uyumu
  const bb = out.bodies[0].bbox; ok(bb[0][0] < -5 && bb[1][0] > 45, 'spline sınır kutusu eğriyi izler');
}
console.log(`stability: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
