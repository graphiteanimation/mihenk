// WP-02: geçmiş izi (featInfo) — 12 işlemli örnek parça + işlem başına changed/warn/ms ve son başarılı sonuç.
// Parça hem bu testte hem arayüz testinde (test/app.test.py, aynı tanım) kullanılır.
import { runMain, newKernel } from './lib.mjs';
export const name = 'gecmis-izi';

const rect = (w, h) => ({ O: { x: 0, y: 0, fixed: true }, p1: { x: 0, y: 0 }, p2: { x: w, y: 0 }, p3: { x: w, y: h }, p4: { x: 0, y: h } });
const rectEnts = [1, 2, 3, 4].map((i) => ({ id: 'l' + i, type: 'line', a: 'p' + i, b: 'p' + ((i % 4) + 1) }));
const cyl = (id, x, y, dia, target) => ({ id, type: 'primitive', kind: 'cylinder', x: String(x), y: String(y), z: '-1', dia: String(dia), h: '100', axis: 'Z', op: 'cut', targets: [target] });
const edge = (body, a, b) => ({ body, kind: 'edge', name: { a, b } });
// 12 işlem. 3. işlem (bx, ayrı gövde) ölçüsü H3; etkiledikleri: fb, cy, cz (bx gövdesi). Diğerleri e1 gövdesinde.
export function part12(H3 = '30') {
  return { params: [], rollback: null, features: [
    { id: 's1', type: 'sketch', name: 'Sketch 1', plane: { kind: 'base', name: 'XY', offset: '0' }, points: rect(100, 60), ents: rectEnts, cons: [] },
    { id: 'e1', type: 'extrude', name: 'Extrude 1', sketch: 's1', profiles: 'all', dist: '20', extent: 'dist', dir: 'one', op: 'new' },
    { id: 'bx', type: 'primitive', name: 'Kutu 1', kind: 'box', x: '130', y: '0', z: '0', w: '30', d: '30', h: H3, op: 'new' },
    cyl('k1', 20, 20, 8, 'e1'),
    cyl('k2', 80, 40, 8, 'e1'),
    { id: 's2', type: 'sketch', name: 'Sketch 2', plane: { kind: 'base', name: 'XY', offset: '20' }, points: { O: { x: 0, y: 0, fixed: true }, c: { x: 50, y: 30 } }, ents: [{ id: 'c1', type: 'circle', c: 'c', r: 10 }], cons: [] },
    { id: 'e2', type: 'extrude', name: 'Extrude 2', sketch: 's2', profiles: 'all', dist: '10', extent: 'dist', dir: 'one', op: 'join', targets: ['e1'] },
    { id: 'fb', type: 'fillet', name: 'Fillet 1', edges: [edge('bx', 'bx:x+', 'bx:z+')], r: '3' },
    cyl('k3', 20, 45, 6, 'e1'),
    { id: 'ch', type: 'chamfer', name: 'Chamfer 1', edges: [edge('e1', 'e1:side:l1', 'e1:start')], d: '1' },
    cyl('cy', 140, 10, 6, 'bx'),
    cyl('cz', 150, 20, 6, 'bx'),
  ] };
}

const AFFECTED = ['bx', 'fb', 'cy', 'cz'];
export async function checks(t) {
  const K = newKernel();
  const ids = part12().features.map((f) => f.id);
  let r = await K.rebuild(part12('30'));
  const bad = Object.entries(r.status).filter(([, s]) => !s.ok);
  t.ok(!bad.length, 'H1: 12 işlemli parça hatasız: ' + JSON.stringify(bad));
  const fi = r.featInfo || {};
  t.ok(ids.every((id) => fi[id]), 'H1: 12 işlemin her birinin izi var');
  t.ok(ids.every((id) => typeof fi[id].ms === 'number' && fi[id].ms >= 0 && !fi[id].cached && Array.isArray(fi[id].warn) && typeof fi[id].sum === 'string'), 'H1: iz alanları (ms, cached, warn[], sum)');
  t.ok(ids.every((id) => fi[id].changed === false), 'H1: ilk hesapta "değişti" yok (karşılaştıracak önceki sonuç yok)');
  t.ok(ids.every((id) => fi[id].lastOk && fi[id].lastOk.rev === r.rev), 'H1: son başarılı sonuç kaydı');
  const sum0 = Object.fromEntries(ids.map((id) => [id, fi[id].sum]));
  // aynı belge: hepsi önbellekten, değişen yok
  r = await K.rebuild(part12('30'));
  t.ok(ids.every((id) => r.featInfo[id].cached && !r.featInfo[id].changed && r.featInfo[id].sum === sum0[id]), 'H2: aynı belge → hepsi önbellekten, değişti=false, özet aynı');
  t.ok(ids.every((id) => r.featInfo[id].ms === fi[id].ms), 'H2: önbellekteki işlem son hesap süresini taşır');
  // 3. işlemin ölçüsü değişir: yalnız ona bağlı işlemler "değişti"
  r = await K.rebuild(part12('40'));
  const ch = ids.filter((id) => r.featInfo[id].changed);
  t.ok(JSON.stringify(ch) === JSON.stringify(AFFECTED), 'H3: H 30→40 → değişenler ' + AFFECTED.join(',') + ': ' + ch.join(','));
  t.ok(ids.slice(0, 2).every((id) => r.featInfo[id].cached) && ids.slice(2).every((id) => !r.featInfo[id].cached), 'H3: önbellek değişen işlemden itibaren yeniden hesaplar');
  t.ok(ids.filter((id) => !AFFECTED.includes(id)).every((id) => r.featInfo[id].sum === sum0[id]), 'H3: etkilenmeyenlerin özeti aynı');
  t.ok(Object.values(r.status).every((s) => s.ok), 'H3: parça hatasız');
  // geri dönüş: yine aynı dört işlem değişti
  r = await K.rebuild(part12('30'));
  t.ok(JSON.stringify(ids.filter((id) => r.featInfo[id].changed)) === JSON.stringify(AFFECTED) && ids.every((id) => r.featInfo[id].sum === sum0[id]), 'H3: 40→30 geri: aynı dört işlem değişti, özetler ilk hâline döndü');
  // geri sarma → sona git: önek aynıysa sağdaki önbellek korunur
  const d3 = part12('30'); d3.rollback = 3; r = await K.rebuild(d3);
  t.ok(Object.keys(r.featInfo).length === 3 && ['s1', 'e1', 'bx'].every((id) => r.featInfo[id].cached), 'H4: geri sarma (3): yalnız 3 iz, hepsi önbellekten');
  r = await K.rebuild(part12('30'));
  t.ok(ids.every((id) => r.featInfo[id].cached && !r.featInfo[id].changed), 'H4: sona git: işaretçinin sağı önbellekten (yeniden hesap yok)');
  // geri sarılmışken önek değişirse sağ taraf yeniden hesaplanır (bayat önbellek yok)
  const d5 = part12('40'); d5.rollback = 3; r = await K.rebuild(d5);
  r = await K.rebuild(part12('40'));
  t.ok(ids.slice(3).every((id) => !r.featInfo[id].cached) && Math.abs(r.bodies.find((b) => b.id === 'bx').bbox[1][2] - 40) < 1e-6, 'H5: geri sarılıyken önek değişti → sona gidince sağ taraf yeniden hesaplandı (bx üstü z=40)');
  const fresh = await newKernel().rebuild(part12('40'));
  t.ok(r.bodies.length === fresh.bodies.length && r.bodies.every((b, i) => Math.abs(b.volume - fresh.bodies[i].volume) < 1e-6) && JSON.stringify(r.status) === JSON.stringify(fresh.status), 'H5: önbellekli sonuç = temiz çekirdek (hacim + status)');
  // hata: kenarı yok eden değişiklik → hata, son başarılı sonuç korunur, changed işaretlenir
  const hole = (h) => ({ params: [], features: [
    { id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '40', h: '20', op: 'new' },
    { id: 'c', type: 'primitive', kind: 'cylinder', x: '20', y: '20', z: '-1', dia: '10', h, axis: 'Z', op: 'cut', targets: ['b'] },
    { id: 'f', type: 'fillet', edges: [{ body: 'b', kind: 'edge', name: { a: 'b:z+', b: 'c:side' } }], r: '1' }] });
  const KH = newKernel(); r = await KH.rebuild(hole('100'));
  t.ok(r.status.f.ok, 'H6: delik ağzı yuvarlatma ok: ' + JSON.stringify(r.status.f)); const rev0 = r.featInfo.f.lastOk?.rev;
  r = await KH.rebuild(hole('10'));
  t.ok(!r.status.f.ok && r.status.f.error.code === 'ref.lost_edge', 'H6: kör delik (h 100→10) → yuvarlatmanın kenarı yok: ref.lost_edge: ' + JSON.stringify(r.status.f));
  t.ok(r.featInfo.f.changed && r.featInfo.c.changed, 'H6: hata veren ve değişen işlem "değişti"');
  t.ok(r.featInfo.f.lastOk && r.featInfo.f.lastOk.rev === rev0 && KH.lastGoodState('f')?.bodies.has('b'), 'H6: hatalı işlemin son başarılı sonucu (girdi durumu) saklı');
  // uyarı: eski biçim referans yeniden eşlendi → warn[ref.remapped]
  const KW = newKernel(); const base = { params: [], features: [{ id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '40', h: '20', op: 'new' }] };
  await KW.rebuild(base); const d = KW.describe({ body: 'b', idx: 0 }, 'edge');
  const legacy = { body: 'b', idx: d.idx, n: d.n, fp: d.fp, geom: d.geom };
  r = await KW.rebuild({ params: [], features: [...base.features, { id: 'f', type: 'fillet', edges: [legacy], r: '1' }] });
  t.ok(r.status.f.ok && r.featInfo.f.warn.some((w) => w.code === 'ref.remapped' && w.params.n === 1), 'H7: eski biçim kenar referansı → uyarı ref.remapped: ' + JSON.stringify(r.featInfo.f.warn));
  // belgeden silinen işlemin izi tutulmaz
  r = await KW.rebuild(base); t.ok(!KW.lastGoodState('f') && !r.featInfo.f, 'H8: silinen işlemin son sonucu bırakıldı');
}
await runMain(import.meta.url, name, checks);
