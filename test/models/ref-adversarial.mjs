// 2c. Ref (kalıcı adlandırma) için hedefli kötü senaryolar: sketch varlık sırası değişimi, ters yön, eş merkezli eş düzlemli yüzler, silme/geri sarma
import { runMain, newKernel, rb, Sk, basePl, B, facesOf, edgesOf, occupied, setMods, props } from './lib.mjs';
export const name = 'ref-kotu-senaryo';
const boxDoc = (rotate = 0, flip = false) => {
  const s = new Sk(); s.rect(0, 0, 100, 60);
  const ents = s.ents.slice(); for (let i = 0; i < rotate; i++) ents.push(ents.shift());
  return { params: [], features: [{ id: 's1', type: 'sketch', plane: basePl('XY'), points: s.points, ents, cons: [] }, { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', dist: '20', extent: 'dist', dir: 'one', flip, op: 'new' }] };
};
export async function checks(t) {
  const K = newKernel(); setMods({});
  // R1: sketch varlıklarının sırası değişir (kullanıcı bir çizgiyi silip yeniden çizer): aynı geometri, aynı n
  let d = boxDoc(0); await K.rebuild(d);
  const vert = edgesOf(K, 'e1').filter((e) => e.geom === 'LINE' && Math.abs(e.start[2] - e.end[2]) > 19 && Math.abs(e.start[0] - 100) < 1e-6 && Math.abs(e.start[1]) < 1e-6)[0];
  d.features.push({ id: 'f1', type: 'fillet', edges: [vert], r: '5' });
  let o = await K.rebuild(d); t.ok(o.status.f1.ok, 'R1: temel fillet ok'); const empty0 = occupied(K, 'e1', [99.7, 0.3, 10]); t.ok(empty0 === 0, 'R1: (100,0) köşesi yuvarlatıldı');
  for (const rot of [1, 2, 3]) {
    const d2 = boxDoc(rot); d2.features.push({ id: 'f1', type: 'fillet', edges: [vert], r: '5' });
    const o2 = await K.rebuild(d2);
    if (!o2.status.f1.ok) { t.ok(true, `R1: sketch sırası kaydırma ${rot}: ok:false (kabul)`); continue; }
    const rounded = [[99.7, 0.3], [0.3, 0.3], [0.3, 59.7], [99.7, 59.7]].map(([x, y]) => occupied(K, 'e1', [x, y, 10]) === 0);
    t.ok(rounded[0] && rounded.filter(Boolean).length === 1, `R1: sketch varlık sırası ${rot} kaydırıldı (aynı geometri): yuvarlatılan köşe değişmemeli; yuvarlatılan köşeler [(100,0),(0,0),(0,60),(100,60)] = ${rounded}`);
  }
  // R2: extrude yönü (flip) değişir: aynı n; üst kenar halkası seçili
  d = boxDoc(0); await K.rebuild(d);
  const topEdge = edgesOf(K, 'e1').filter((e) => e.geom === 'LINE' && Math.abs(e.start[2] - 20) < 1e-6 && Math.abs(e.end[2] - 20) < 1e-6 && Math.abs(e.start[1]) < 1e-6 && Math.abs(e.end[1]) < 1e-6)[0];
  d.features.push({ id: 'f1', type: 'chamfer', edges: [topEdge], d: '3' });
  o = await K.rebuild(d); t.ok(o.status.f1.ok, 'R2: temel pah ok');
  // yüksekliği 20->30 yap: üst kenar z=30'a taşınmalı (topolojik izleme)
  d.features[1].dist = '30'; o = await K.rebuild(d);
  if (o.status.f1.ok) { const v = props(K, 'e1').volume; t.near(v, 100 * 60 * 30 - 0.5 * 9 * 100, 'R2: dist 20→30 sonrası pah hacmi (üst ön kenar 3mm pah)', 1e-4); } else t.ok(true, 'R2: dist değişince ok:false (kabul)');
  // R3: ters yön: flip=true -> gövde z∈[-20,0]; "üst" kenar semantik olarak z=0 yüzünde mi z=-20'de mi? Bayat Ref bir yerde olmalı (kaybolmalı ya da z=0'a gitmeli)
  d.features[1].dist = '20'; d.features[1].flip = true; o = await K.rebuild(d);
  if (o.status.f1.ok) { const pr = props(K, 'e1'); const chamferedTop = occupied(K, 'e1', [50, 0.3, -0.3]) === 0, chamferedBottom = occupied(K, 'e1', [50, 0.3, -19.7]) === 0; t.note('R3-flip', { chamferedTop, chamferedBottom, bbox: pr.bbox }); t.ok(chamferedTop !== chamferedBottom, 'R3: flip sonrası pah tam olarak bir kenarda'); }
  // R4: eş merkezli, eş düzlemli iki yüz (dış halka üst yüzü + ada üst yüzü): fp çakışması; n değişince hangisi seçilir
  const s = new Sk(); s.rect(0, 0, 100, 100); const s2 = new Sk(); s2.circle(50, 50, 30); s2.circle(50, 50, 20); const s3 = new Sk(); s3.circle(20, 20, 3); s3.circle(80, 80, 3);
  const base = () => ({ params: [], features: [
    { id: 's1', type: 'sketch', plane: basePl('XY'), points: s.points, ents: s.ents, cons: [] }, { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', dist: '30', extent: 'dist', dir: 'one', op: 'new' },
    { id: 's2', type: 'sketch', plane: basePl('XY', 30), points: s2.points, ents: s2.ents, cons: [] }, { id: 'e2', type: 'extrude', sketch: 's2', profiles: [(() => 0)()], dist: '10', extent: 'dist', dir: 'one', flip: true, op: 'cut' }] });
  d = base();
  // halka bölgesini bul
  const { findRegions } = await import('./lib.mjs'); const regs = findRegions({ points: s2.points, ents: s2.ents }).regions; d.features[3].profiles = [regs.findIndex((r) => r.holes.length === 1)];
  o = await K.rebuild(d); t.ok(o.status.e2.ok, 'R4: halka oluk ok');
  const faces = facesOf(K, 'e1').filter((f) => f.geom === 'PLANE' && f.normal[2] > 0.99 && Math.abs(f.fp[2] - 30) < 1e-6);
  t.ok(faces.length === 2, 'R4: iki eş düzlemli üst yüz ' + faces.length); t.note('R4-fp', faces.map((f) => ({ idx: f.idx, fp: f.fp, area: f.area })));
  if (faces.length === 2) {
    const dist = Math.hypot(...faces[0].fp.map((x, i) => x - faces[1].fp[i])); t.ok(dist < 1e-4, 'R4: iki yüzün ağırlık merkezi aynı (fp çakışması) fark=' + dist);
    const big = faces.find((f) => f.area > 5000); const bigRef = { ...big };
    // n değişsin: simetrik iki delik ekle (merkezi kaydırmaz)
    const d4 = base(); d4.features[3].profiles = d.features[3].profiles; d4.features.push({ id: 's3', type: 'sketch', plane: basePl('XY', 30), points: s3.points, ents: [{ id: 'q1', type: 'point', p: s3.ents[0].c }, { id: 'q2', type: 'point', p: s3.ents[1].c }], cons: [] }, { id: 'h1', type: 'hole', sketch: 's3', kind: 'simple', dia: '6', extent: 'all', depth: '0' });
    o = await K.rebuild(d4); t.ok(o.status.h1.ok, 'R4: simetrik delikler ok');
    const nNew = K.last.bodies.get('e1').shape.faces.length; t.ok(nNew !== bigRef.n, 'R4: n değişti ' + bigRef.n + '→' + nNew);
    try { const got = K.resolveRef(bigRef, K.last, 'face'); const area = props ? null : null; const ga = (await import('./lib.mjs')).R.measureArea(got); t.ok(ga > 5000, `R4: dış üst yüz Ref'i, n değişince DIŞ yüze çözülmeli (ada yüzüne değil); çözülen alan ${ga.toFixed(1)} (dış ≈ ${big.area.toFixed(1)}, ada ≈ ${(Math.PI * 400).toFixed(1)})`); }
    catch (e) { t.ok(true, 'R4: Ref kayboldu (kabul)'); }
  }
  // R5: geri sarma + bastırma sonrası aynı Kernel örneği ile önbellek tutarlılığı
  const K2 = newKernel(); const A = (await import('./part-a.mjs')); const b = await A.build(K2, A.defaults); const nF = b.doc.features.length;
  const seq = [nF, 3, 8, nF, 5, nF, 1, 10, nF];
  for (const rb_ of seq) {
    b.doc.rollback = rb_ >= nF ? null : rb_; const r1 = await rb(K2, b.doc);
    const KF = newKernel(); const dd = JSON.parse(JSON.stringify(b.doc)); const r2 = await rb(KF, dd);
    const v1 = r1.out?.bodies[0]?.volume, v2 = r2.out?.bodies[0]?.volume;
    t.ok(!r1.exc && v1 === v2 && r1.out.bodies.length === r2.out.bodies.length && JSON.stringify(Object.keys(r1.out.status)) === JSON.stringify(Object.keys(r2.out.status)), `R5: rollback=${rb_} önbellekli = temiz çekirdek (hacim ${v1} / ${v2})`);
  }
  // R6: bastır / geri aç döngüsü aynı sonuca dönmeli
  const f0 = (await rb(K2, (() => { b.doc.rollback = null; return b.doc; })())).out.bodies[0].volume;
  for (const id of ['pat', 'bore', 'bolt']) { const f = b.doc.features.find((x) => x.id === id); f.suppressed = true; await K2.rebuild(b.doc); f.suppressed = false; }
  const f1 = (await rb(K2, b.doc)).out.bodies[0].volume; t.near(f1, f0, 'R6: bastır/aç döngüsü sonrası hacim aynı', 1e-12);
}
await runMain(import.meta.url, name, async (t) => { await checks(t); });
