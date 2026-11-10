// 4. Ölçüm işlevleri: describe / measure / bodyProps / interference bilinen geometrilerle doğrulanır
import { runMain, newKernel, rb, Sk, basePl, facesOf, edgesOf, PI, R } from './lib.mjs';
export const name = 'olcum';
const prim = (o = {}) => ({ id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '30', h: '20', op: 'new', ...o });
const D = (...f) => ({ params: [], features: f });
const sortN = (a) => a.slice().sort((x, y) => x - y);
export async function checks(t) {
  const K = newKernel();
  // --- kutu: yüzler / kenarlar
  await K.rebuild(D(prim()));
  const F = facesOf(K, 'b'), E = edgesOf(K, 'b');
  t.ok(F.length === 6 && E.length === 12, 'M1: kutu 6 yüz 12 kenar');
  t.ok(JSON.stringify(sortN(F.map((f) => +f.area.toFixed(6)))) === JSON.stringify([600, 600, 800, 800, 1200, 1200]), 'M1: yüz alanları 600/800/1200 x2: ' + F.map((f) => f.area.toFixed(3)));
  t.ok(F.every((f) => f.geom === 'PLANE' && Math.abs(Math.hypot(...f.normal) - 1) < 1e-9), 'M1: yüzler düzlem, birim normal');
  const ctr = [20, 15, 10]; t.ok(F.every((f) => f.normal.reduce((s, n, i) => s + n * (f.fp[i] - ctr[i]), 0) > 0), 'M1: tüm yüz normalleri dışa bakıyor');
  const L = sortN(E.map((e) => +e.length.toFixed(6))); t.ok(JSON.stringify(L) === JSON.stringify([...Array(4).fill(20), ...Array(4).fill(30), ...Array(4).fill(40)]), 'M1: kenar uzunlukları 4x20, 4x30, 4x40: ' + L);
  t.ok(E.every((e) => e.geom === 'LINE' && Math.abs(Math.hypot(...e.start.map((s, i) => e.end[i] - s)) - e.length) < 1e-9), 'M1: kenar başlangıç-bitiş uzaklığı = uzunluk');
  t.ok(E.every((e) => e.fp.every((c, i) => Math.abs(c - (e.start[i] + e.end[i]) / 2) < 1e-6)), 'M1: kenar fp = orta nokta');
  const fx0 = F.find((f) => f.normal[0] < -0.99), fx1 = F.find((f) => f.normal[0] > 0.99), fy0 = F.find((f) => f.normal[1] < -0.99), fz1 = F.find((f) => f.normal[2] > 0.99);
  let m = K.measure({ body: 'b', idx: fx0.idx, kind: 'face' }, { body: 'b', idx: fx1.idx, kind: 'face' });
  t.near(m.distance, 40, 'M2: paralel yüzler arası mesafe', 1e-9); t.near(m.angle, 0, 'M2: paralel yüz açısı', 1e-6, 1e-6); t.near(m.centerDistance, 40, 'M2: merkez mesafesi', 1e-9); t.vec(m.delta, [40, 0, 0], 'M2: delta', 1e-9);
  m = K.measure({ body: 'b', idx: fx0.idx, kind: 'face' }, { body: 'b', idx: fy0.idx, kind: 'face' }); t.near(m.angle, 90, 'M2: dik yüz açısı', 1e-9); t.near(m.distance, 0, 'M2: komşu yüzler mesafe 0', 1e-9, 1e-9);
  const e1 = E.find((e) => Math.abs(e.start[2] - e.end[2]) > 19 && Math.abs(e.start[0]) < 1e-9 && Math.abs(e.start[1]) < 1e-9), e2 = E.find((e) => Math.abs(e.start[2] - e.end[2]) > 19 && Math.abs(e.start[0] - 40) < 1e-9 && Math.abs(e.start[1] - 30) < 1e-9);
  m = K.measure({ body: 'b', idx: e1.idx, kind: 'edge' }, { body: 'b', idx: e2.idx, kind: 'edge' }); t.near(m.distance, 50, 'M2: karşı dikey kenarlar arası mesafe (√(40²+30²))', 1e-9);
  m = K.measure({ body: 'b', idx: e1.idx, kind: 'edge' }, { body: 'b', idx: fx1.idx, kind: 'face' }); t.near(m.distance, 40, 'M2: kenar-yüz mesafesi', 1e-9);
  // gövde-gövde ölçüm (arayüzde "Ölç" gövde filtresiyle kullanılabilir)
  await K.rebuild(D(prim(), prim({ id: 'c', x: '100' })));
  try { m = K.measure({ body: 'b', kind: 'body' }, { body: 'c', kind: 'body' }); t.near(m.distance, 60, 'M2: gövde-gövde mesafe', 1e-9); } catch (e) { t.ok(false, 'M2: measure(gövde, gövde) istisna: ' + (e.message || e)); }
  // --- silindir
  await K.rebuild(D(prim({ kind: 'cylinder', dia: '20', h: '30', axis: 'Y', x: '10', y: '5', z: '-3' })));
  const CF = facesOf(K, 'b'); const side = CF.find((f) => f.geom === 'CYLINDRE'); t.ok(!!side, 'M3: silindir yüzü CYLINDRE');
  if (side) { t.near(side.area, 2 * PI * 10 * 30, 'M3: yan alan', 1e-9); t.near(side.radius, 10, 'M3: yarıçap', 1e-9); t.ok(side.axis && Math.abs(Math.abs(side.axis.d[1]) - 1) < 1e-9, 'M3: eksen yönü Y'); t.ok(side.axis && Math.abs(side.axis.o[0] - 10) < 1e-6 && Math.abs(side.axis.o[2] + 3) < 1e-6, 'M3: eksen konumu x=10,z=-3: ' + JSON.stringify(side.axis?.o)); }
  const CE = edgesOf(K, 'b').filter((e) => e.geom === 'CIRCLE'); t.ok(CE.length === 2, 'M3: iki daire kenarı'); for (const c of CE) { t.near(c.radius, 10, 'M3: daire kenar yarıçapı', 1e-9); t.near(c.length, 2 * PI * 10, 'M3: daire uzunluğu', 1e-9); t.ok(Math.abs(c.center[0] - 10) < 1e-6 && Math.abs(c.center[2] + 3) < 1e-6 && (Math.abs(c.center[1] - 5) < 1e-6 || Math.abs(c.center[1] - 35) < 1e-6), 'M3: daire merkezi ' + JSON.stringify(c.center)); }
  let P = K.bodyProps('b'); t.near(P.volume, PI * 100 * 30, 'M3: silindir hacmi', 1e-9); t.near(P.area, 2 * PI * 10 * 30 + 2 * PI * 100, 'M3: silindir alanı', 1e-9); t.vec(P.com, [10, 20, -3], 'M3: silindir ağırlık merkezi', 1e-6);
  // --- küre
  await K.rebuild(D(prim({ kind: 'sphere', dia: '40', x: '1', y: '2', z: '3' }))); P = K.bodyProps('b');
  t.near(P.volume, 4 / 3 * PI * 8000, 'M4: küre hacmi', 1e-6); t.near(P.area, 4 * PI * 400, 'M4: küre alanı', 1e-6); t.vec(P.com, [1, 2, 3], 'M4: küre merkezi', 1e-6); t.vec(P.bbox[0], [-19, -18, -17], 'M4: küre bbox min', 1e-5);
  // --- delikli plaka: iki delik arası mesafe, daire kenar
  const s = new Sk(); s.point(20, 15); s.point(60, 15);
  await K.rebuild(D(prim({ w: '80', d: '30', h: '10' }), { id: 'sk', type: 'sketch', plane: basePl('XY', 10), points: s.points, ents: s.ents, cons: [] }, { id: 'h', type: 'hole', sketch: 'sk', kind: 'simple', dia: '10', extent: 'all' }));
  const HF = facesOf(K, 'b').filter((f) => f.geom === 'CYLINDRE'); t.ok(HF.length === 2, 'M5: iki delik silindiri'); if (HF.length === 2) {
    m = K.measure({ body: 'b', idx: HF[0].idx, kind: 'face' }, { body: 'b', idx: HF[1].idx, kind: 'face' }); t.near(m.distance, 30, 'M5: iki delik yüzeyi arası mesafe (40-10)', 1e-9); t.near(m.centerDistance, 40, 'M5: delik yüzü merkez mesafesi', 1e-9);
    t.near(HF[0].radius, 5, 'M5: delik yarıçapı', 1e-9); t.near(HF[0].area, 2 * PI * 5 * 10, 'M5: delik yan alanı', 1e-9);
  }
  P = K.bodyProps('b'); const V = 80 * 30 * 10 - 2 * PI * 25 * 10; t.near(P.volume, V, 'M5: delikli plaka hacmi', 1e-9); t.near(P.com[0], 40, 'M5: simetrik delikli plaka com x', 1e-6); t.near(P.com[2], 5, 'M5: com z', 1e-6);
  // --- eğik yüz açısı (kama): prizmatik 30° eğim
  const w = new Sk(); w.poly([[0, 0], [40, 0], [0, 40 * Math.tan(30 * PI / 180)]]);
  await K.rebuild(D({ id: 'sk', type: 'sketch', plane: basePl('XZ'), points: w.points, ents: w.ents, cons: [] }, { id: 'e', type: 'extrude', sketch: 'sk', profiles: 'all', dist: '10', extent: 'dist', dir: 'one', op: 'new' }));
  const WF = facesOf(K, 'e').filter((f) => f.geom === 'PLANE'); const incl = WF.find((f) => f.normal[0] > 0.1 && f.normal[2] > 0.1), bot = WF.find((f) => f.normal[2] < -0.99), back = WF.find((f) => f.normal[0] < -0.99);
  t.ok(!!incl && !!bot, 'M6: kama yüzleri bulundu'); if (incl && bot) { m = K.measure({ body: 'e', idx: incl.idx, kind: 'face' }, { body: 'e', idx: bot.idx, kind: 'face' }); t.near(m.angle, 30, 'M6: eğik yüz-taban açısı (normaller arası 30° = dış açı 150°; iç açı 30°)', 1e-6); t.near(m.angle, 30, 'M6: aynı', 1e-6);
    // iç açı 30° -> normal açısı 150°; abs(dot) ile 30° bildirildi. Yüzler arası dış 150° iç açı 30° (aynı değer değil!) belgelenmeli
    m = K.measure({ body: 'e', idx: incl.idx, kind: 'face' }, { body: 'e', idx: back.idx, kind: 'face' }); t.near(m.angle, 60, 'M6: eğik yüz-arka dik yüz: dihedral iç açı 60° (normal açısı 120°)', 1e-6);
    t.note('M6-not', 'measure.angle = acos(|n1·n2|) ∈ [0,90]: 120° ya da 150° dihedral açıları 60°/30° bildirilir (tümler ayırt edilemez)'); }
  // --- altıgen prizma: komşu yüzler arası iç (dihedral) açı 120°
  const hx = new Sk(); hx.poly(Array.from({ length: 6 }, (_, i) => [20 * Math.cos(i * PI / 3), 20 * Math.sin(i * PI / 3)]));
  await K.rebuild(D({ id: 'sk', type: 'sketch', plane: basePl('XY'), points: hx.points, ents: hx.ents, cons: [] }, { id: 'e', type: 'extrude', sketch: 'sk', profiles: 'all', dist: '10', extent: 'dist', dir: 'one', op: 'new' }));
  const hs = facesOf(K, 'e').filter((f) => Math.abs(f.normal[2]) < 1e-6); const f0 = hs[0], f1 = hs.find((f) => f !== f0 && Math.abs(f.normal[0] * f0.normal[0] + f.normal[1] * f0.normal[1] - 0.5) < 1e-6);
  m = K.measure({ body: 'e', idx: f0.idx, kind: 'face' }, { body: 'e', idx: f1.idx, kind: 'face' }); t.near(m.angle, 120, 'M6b: altıgen komşu yüzler arası iç açı 120° (normaller 60°); acos(|n1·n2|) 60° bildirir');
  // --- girişim
  const bxs = (id, x, y, z, w_, d_, h_) => prim({ id, x: String(x), y: String(y), z: String(z), w: String(w_), d: String(d_), h: String(h_) });
  await K.rebuild(D(bxs('a', 0, 0, 0, 10, 10, 10), bxs('c', 5, 0, 0, 10, 10, 10)));
  let I = K.interference(['a', 'c']); t.ok(I.length === 1 && Math.abs(I[0].volume - 500) < 1e-6, 'M7: iki kutu girişimi 500: ' + JSON.stringify(I.map((i) => i.volume)));
  await K.rebuild(D(bxs('a', 0, 0, 0, 10, 10, 10), bxs('c', 10, 0, 0, 10, 10, 10))); I = K.interference(['a', 'c']); t.ok(I.length === 0, 'M7: yüz yüze değen kutular girişim değil');
  await K.rebuild(D(bxs('a', 0, 0, 0, 10, 10, 10), bxs('c', 20, 0, 0, 10, 10, 10))); I = K.interference(['a', 'c']); t.ok(I.length === 0, 'M7: ayrık kutular girişim yok');
  await K.rebuild(D(bxs('a', 0, 0, 0, 10, 10, 10), bxs('c', 2, 2, 2, 3, 3, 3))); I = K.interference(['a', 'c']); t.ok(I.length === 1 && Math.abs(I[0].volume - 27) < 1e-6, 'M7: içinde küçük kutu: 27');
  await K.rebuild(D(bxs('a', 0, 0, 0, 10, 10, 10), bxs('c', 0, 0, 0, 10, 10, 10))); I = K.interference(['a', 'c']); t.ok(I.length === 1 && Math.abs(I[0].volume - 1000) < 1e-6, 'M7: özdeş kutular: 1000');
  await K.rebuild(D(prim({ id: 'a', kind: 'cylinder', dia: '10', h: '100', axis: 'X', x: '-50', y: '0', z: '0' }), prim({ id: 'c', kind: 'cylinder', dia: '10', h: '100', axis: 'Y', x: '0', y: '-50', z: '0' })));
  I = K.interference(['a', 'c']); t.ok(I.length === 1 && Math.abs(I[0].volume - 16 / 3 * 125) / (16 / 3 * 125) < 1e-4, 'M7: dik kesişen silindirler (Steinmetz 16r³/3=666.67): ' + JSON.stringify(I.map((i) => i.volume)));
  await K.rebuild(D(prim({ id: 'a', kind: 'sphere', dia: '20' }), bxs('c', 0, 0, 0, 20, 20, 20))); I = K.interference(['a', 'c']); t.ok(I.length === 1 && Math.abs(I[0].volume - PI * 1000 / 6) / (PI * 1000 / 6) < 1e-4, 'M7: küre-kutu oktant ' + (PI * 1000 / 6).toFixed(2) + ': ' + JSON.stringify(I.map((i) => i.volume)));
  await K.rebuild(D(bxs('a', 0, 0, 0, 10, 10, 10), bxs('c', 5, 0, 0, 10, 10, 10), bxs('d', 8, 0, 0, 10, 10, 10))); I = K.interference(['a', 'c', 'd']); t.ok(I.length === 3, 'M7: üç gövde → 3 çift: ' + I.length);
  try { K.interference(['a', 'yok']); t.ok(false, 'M7: bilinmeyen gövde kimliği sessizce yutuldu mu?'); } catch (e) { t.ok(true, 'M7: bilinmeyen gövde → istisna (kabul)'); }
  // --- bodyProps: delikli + içi boş (kabuk)
  const base = D(prim({ w: '50', d: '40', h: '30' }));
  await K.rebuild(base); const tf = facesOf(K, 'b').find((f) => f.normal[2] > 0.99); base.features.push({ id: 'sh', type: 'shell', faces: [tf], t: '2' }); const o = await K.rebuild(base);
  P = K.bodyProps('b'); t.near(P.volume, 50 * 40 * 30 - 46 * 36 * 28, 'M8: kabuk hacmi', 1e-6); const Vin = 46 * 36 * 28, Vout = 50 * 40 * 30; t.near(P.com[2], (Vout * 15 - Vin * (2 + 14)) / (Vout - Vin), 'M8: kabuk ağırlık merkezi z', 1e-6); t.near(P.area, 2 * (50 * 40 + 50 * 30 + 40 * 30) - 46 * 36 + 2 * (46 * 28 + 36 * 28) + 46 * 36 - 0 + 0 - 46 * 36 + 46 * 36 + (50 * 40 + 0 - 0) * 0 + 0, 'M8: kabuk alanı (yaklaşık formül, yalnız gösterim)', 1, 1) || true;
  // kabuk yüzey alanı: dış 5 yüz + açık üst halka + iç 5 yüz
  const Aout = 2 * (50 * 40) - 0 + 2 * (50 * 30) + 2 * (40 * 30) - 46 * 36 + 0; /* dış: alt+dış yan 4 + üst halka(50*40-46*36) */ const Ain = 46 * 36 + 2 * (46 * 28) + 2 * (36 * 28);
  const Aexp = (50 * 40) + 2 * (50 * 30) + 2 * (40 * 30) + (50 * 40 - 46 * 36) + Ain; t.near(P.area, Aexp, 'M8: kabuk toplam alanı', 1e-6);
}
await runMain(import.meta.url, name, async (t) => { await checks(t); });
