// WP-19 modelleme ikinci tur: sweep, loft, draft, rib, değişken yuvarlatma, helis (coil), modellenmiş diş, IGES.
// Her özellik: hacim/yüz sayısı elle hesaplanan değerle; geçmişte ortadan düzenleme; kaydet/aç gidiş-dönüşü; hatalı girdide açık hata.
// Çalıştır: node test/modelleme2.test.mjs
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import { initKernel } from '../src/kernel/kernel.js';
import { validateDoc, checkEnvelope } from '../src/shared/schema.js';
import { errText, setLang } from '../src/shared/i18n.js';
setLang('tr', false);
import * as TP from '../src/kernel/topo.js';
import { findRegions, selectionFor } from '../src/shared/profiles.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const wasm = path.join(here, '../node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const rel = (a, b, tol, m) => ok(Number.isFinite(a) && Math.abs(a - b) <= tol * Math.abs(b), `${m}: ${a} ≉ ${b} (±${tol * 100}%)`);
const section = (s) => console.log(s);
const K = await initKernel(opencascade, () => wasm);

// --- eskiz yardımcıları
const base = (name, offset = '0') => ({ kind: 'base', name, offset });
const poly = (id, plane, pts, extra = {}) => {
  const points = {}; pts.forEach((p, i) => { points['p' + i] = { x: p[0], y: p[1] }; });
  const ents = pts.map((_, i) => ({ id: 'l' + i, type: 'line', a: 'p' + i, b: 'p' + ((i + 1) % pts.length) }));
  return { id, type: 'sketch', plane, points, ents, ...extra };
};
const openPoly = (id, plane, pts) => {
  const points = {}; pts.forEach((p, i) => { points['p' + i] = { x: p[0], y: p[1] }; });
  return { id, type: 'sketch', plane, points, ents: pts.slice(1).map((_, i) => ({ id: 'l' + i, type: 'line', a: 'p' + i, b: 'p' + (i + 1) })) };
};
const circle = (id, plane, cx, cy, r) => ({ id, type: 'sketch', plane, points: { c: { x: cx, y: cy } }, ents: [{ id: 'c1', type: 'circle', c: 'c', r }] });
const sq = (id, plane, s, cx = 0, cy = 0) => poly(id, plane, [[cx - s / 2, cy - s / 2], [cx + s / 2, cy - s / 2], [cx + s / 2, cy + s / 2], [cx - s / 2, cy + s / 2]]);
const box = (id, w, d, h, x = 0, y = 0, z = 0, op = 'new') => ({ id, type: 'primitive', kind: 'box', x: String(x), y: String(y), z: String(z), w: String(w), d: String(d), h: String(h), op });
const vol = (out, id) => out.bodies.find((b) => !id || b.id === id)?.volume;
const roundTrip = (doc) => { const txt = JSON.stringify({ app: 'Mihenk', version: 1, doc }); const j = JSON.parse(txt); checkEnvelope(j); validateDoc(j.doc, { byteLength: txt.length }); return j.doc; };
const errOf = (out, id) => out.status[id]?.error?.code;
const faceBy = (bid, pred) => { const out = []; const n = K.last.bodies.get(bid) ? TP.topoOf(K.last.bodies.get(bid).shape).faces.size : 0; for (let i = 0; i < n; i++) { const d = K.describe({ body: bid, idx: i }, 'face'); if (pred(d)) out.push(d); } return out; };
const edgeBy = (bid, pred) => { const out = []; const n = TP.topoOf(K.last.bodies.get(bid).shape).edges.size; for (let i = 0; i < n; i++) { const d = K.describe({ body: bid, idx: i }, 'edge'); if (pred(d)) out.push(d); } return out; };

// ------------------------------------------------------------------ sweep
section('sweep');
{
  const doc = { params: [{ name: 'L', expr: '100' }], features: [
    circle('s1', base('XY'), 0, 0, 5),
    openPoly('s2', base('XZ'), [[0, 0], [0, 100]]),
    { id: 'sw', type: 'sweep', sketch: 's1', profiles: 'all', path: 's2', orient: 'path', op: 'new' },
  ] };
  let out = await K.rebuild(doc);
  ok(out.status.sw.ok, 'sweep düz yol: ' + errOf(out, 'sw'));
  rel(vol(out), Math.PI * 25 * 100, 0.005, 'Ø10 × 100 sweep hacmi');
  ok(out.bodies[0].nFaces === 3, 'sweep yüz sayısı 3: ' + out.bodies[0].nFaces);
  const names = [...K.last.bodies.get('sw').fn.flat()]; ok(names.includes('sw:start') && names.includes('sw:end') && names.includes('sw:side:c1'), 'sweep yüz adları: ' + names.join(','));
  // L yol (çizgi + yay + çizgi): hacim = alan × yol uzunluğu (profil yola dik, Pappus)
  doc.features[1] = { id: 's2', type: 'sketch', plane: base('XZ'), points: { a: { x: 0, y: 0 }, b: { x: 0, y: 50 }, c: { x: 20, y: 50 }, d: { x: 20, y: 70 }, e: { x: 70, y: 70 } },
    ents: [{ id: 'la', type: 'line', a: 'a', b: 'b' }, { id: 'ar', type: 'arc', c: 'c', a: 'd', b: 'b' }, { id: 'lb', type: 'line', a: 'd', b: 'e' }] };
  out = await K.rebuild(doc);
  ok(out.status.sw.ok, 'sweep yaylı yol: ' + errOf(out, 'sw'));
  rel(vol(out), Math.PI * 25 * (50 + Math.PI * 20 / 2 + 50), 0.005, 'yaylı yol sweep hacmi');
  // sabit yön: profil dönmez (düz yolda aynı hacim)
  doc.features[1] = openPoly('s2', base('XZ'), [[0, 0], [0, 100]]); doc.features[2].orient = 'fixed';
  out = await K.rebuild(doc); ok(out.status.sw.ok, 'sweep sabit yön'); rel(vol(out), Math.PI * 25 * 100, 0.005, 'sabit yön hacim');
  // delikli profil (halka)
  doc.features[0] = { id: 's1', type: 'sketch', plane: base('XY'), points: { c: { x: 0, y: 0 } }, ents: [{ id: 'c1', type: 'circle', c: 'c', r: 5 }, { id: 'c2', type: 'circle', c: 'c', r: 3 }] };
  doc.features[2].profiles = [selectionFor(findRegions(doc.features[0]).regions.find((r) => r.holes.length))]; doc.features[2].orient = 'path';
  out = await K.rebuild(doc); ok(out.status.sw.ok, 'halka sweep: ' + errOf(out, 'sw')); rel(vol(out), Math.PI * 16 * 100, 0.005, 'halka sweep hacmi');
  // geçmişte ortadan düzenleme: yol uzayınca sonraki delik hâlâ geçerli
  doc.features[2].profiles = 'all';
  doc.features[1] = openPoly('s2', base('XZ'), [[0, 0], [0, 'L']].map(([x, y]) => [x, y === 'L' ? 100 : y]));
  doc.features.push(box('b1', 4, 4, 10, -2, -2, 40, 'cut'));
  out = await K.rebuild(doc); ok(out.status.b1.ok, 'sweep sonrası kesme: ' + errOf(out, 'b1'));
  const v1 = vol(out);
  doc.features[1] = openPoly('s2', base('XZ'), [[0, 0], [0, 120]]);
  out = await K.rebuild(doc); ok(out.status.sw.ok && out.status.b1.ok, 'yol düzenlenince gerisi güncellendi');
  rel(vol(out) - v1, Math.PI * 25 * 20, 0.01, 'yol uzaması hacme yansıdı');
  // kaydet/aç
  const d2 = roundTrip(doc); ok(d2.features[2].path === 's2' && d2.features[2].orient === 'path', 'sweep parametreleri dosyada');
  const K2 = await initKernel(opencascade, () => wasm); const o2 = await K2.rebuild(d2); rel(vol(o2), vol(out), 1e-9, 'aç sonrası aynı hacim');
  // hatalar
  const bad = JSON.parse(JSON.stringify(doc)); bad.features.splice(3); bad.features[2].path = '';
  out = await K.rebuild(bad); ok(errOf(out, 'sw') === 'sweep.no_path', 'yolsuz sweep hatası: ' + errOf(out, 'sw'));
  ok(/yol/i.test(errText(out.status.sw.error)), 'Türkçe hata metni: ' + errText(out.status.sw.error));
  bad.features[1] = { id: 's2', type: 'sketch', plane: base('XZ'), points: { a: { x: 0, y: 0 }, b: { x: 0, y: 50 }, c: { x: 10, y: 50 }, d: { x: -10, y: 50 } }, ents: [{ id: 'l1', type: 'line', a: 'a', b: 'b' }, { id: 'l2', type: 'line', a: 'b', b: 'c' }, { id: 'l3', type: 'line', a: 'b', b: 'd' }] };
  bad.features[2].path = 's2'; out = await K.rebuild(bad); ok(errOf(out, 'sw') === 'sweep.path_branch', 'dallanan yol hatası: ' + errOf(out, 'sw'));
  bad.features[2].path = 's1'; bad.features[2].sketch = 's1'; out = await K.rebuild(bad); ok(errOf(out, 'sw') === 'sweep.same_sketch', 'aynı eskiz hatası');
}

// ------------------------------------------------------------------ loft
section('loft');
{
  const doc = { features: [sq('a', base('XY'), 20), sq('b', base('XY', '30'), 10), { id: 'lf', type: 'loft', sections: ['a', 'b'], ruled: false, op: 'new' }] };
  let out = await K.rebuild(doc);
  ok(out.status.lf.ok, 'loft iki kare: ' + errOf(out, 'lf'));
  const fr = (A1, A2, h) => (h / 3) * (A1 + A2 + Math.sqrt(A1 * A2));
  rel(vol(out), fr(400, 100, 30), 0.01, 'kesik piramit hacmi');
  ok(out.bodies[0].nFaces === 6, 'loft yüz sayısı 6: ' + out.bodies[0].nFaces);
  const nm = K.last.bodies.get('lf').fn.flat(); ok(nm.includes('lf:start') && nm.includes('lf:end') && nm.filter((x) => x.startsWith('lf:side:')).length === 4, 'loft adları: ' + nm.join(','));
  // daire → kare
  doc.features.splice(2, 0, circle('c', base('XY', '60'), 0, 0, 4)); const LF = () => doc.features.find((x) => x.id === 'lf');
  LF().sections = ['a', 'b', 'c'];
  out = await K.rebuild(doc); ok(out.status.lf.ok, 'üç kesitli loft: ' + errOf(out, 'lf')); ok(vol(out) > fr(400, 100, 30), 'üç kesit hacmi büyüdü');
  // kurallı (ruled) iki kesit: aynı kesik piramit
  LF().sections = ['a', 'b']; LF().ruled = true;
  out = await K.rebuild(doc); rel(vol(out), fr(400, 100, 30), 0.01, 'kurallı loft hacmi');
  // noktaya loft: piramit
  doc.features.splice(2, 0, { id: 'pt', type: 'sketch', plane: base('XY', '30'), points: { q: { x: 0, y: 0 } }, ents: [{ id: 'q1', type: 'point', p: 'q' }] });
  LF().sections = ['a', 'pt']; LF().ruled = true;
  out = await K.rebuild(doc); ok(out.status.lf.ok, 'noktaya loft: ' + errOf(out, 'lf')); rel(vol(out), 400 * 30 / 3, 0.01, 'piramit hacmi');
  // ray (merkez çizgisi) boyunca
  doc.features.splice(2, 0, openPoly('rl', base('XZ'), [[0, 0], [0, 30]])); LF().sections = ['a', 'b']; LF().rail = 'rl'; LF().ruled = false;
  out = await K.rebuild(doc); ok(out.status.lf.ok, 'raylı loft: ' + errOf(out, 'lf')); rel(vol(out), fr(400, 100, 30), 0.02, 'raylı loft hacmi');
  delete LF().rail;
  // ortadan düzenleme: alt kare büyüyünce sonraki kesme işlemi yeniden hesaplanır
  doc.features.push(box('cut1', 4, 4, 100, -2, -2, -10, 'cut'));
  out = await K.rebuild(doc); ok(out.status.cut1.ok, 'loft sonrası kesme: ' + errOf(out, 'cut1'));
  doc.features[0] = sq('a', base('XY'), 30);
  out = await K.rebuild(doc); ok(out.status.lf.ok && out.status.cut1.ok, 'kesit düzenlenince gerisi güncellendi');
  rel(vol(out), fr(900, 100, 30) - 16 * 30, 0.01, 'düzenleme sonrası hacim');
  const d2 = roundTrip(doc); const L2 = d2.features.find((x) => x.id === 'lf'); ok(JSON.stringify(L2.sections) === '["a","b"]' && L2.ruled === false, 'loft parametreleri dosyada');
  // hatalar
  LF().sections = ['a']; out = await K.rebuild(doc); ok(errOf(out, 'lf') === 'loft.min_sections', 'tek kesit hatası');
  LF().sections = ['a', 'a']; out = await K.rebuild(doc); ok(errOf(out, 'lf') === 'loft.same_sketch', 'yinelenen kesit hatası');
  doc.features.splice(2, 0, { id: 'h', type: 'sketch', plane: base('XY', '40'), points: { c: { x: 0, y: 0 } }, ents: [{ id: 'c1', type: 'circle', c: 'c', r: 5 }, { id: 'c2', type: 'circle', c: 'c', r: 2 }] });
  LF().sections = ['a', 'h']; out = await K.rebuild(doc); ok(['loft.section_regions', 'loft.section_holes'].includes(errOf(out, 'lf')), 'delikli kesit hatası: ' + errOf(out, 'lf'));
  ok(errText(out.status.lf.error).length > 10, 'loft hata metni');
}

// ------------------------------------------------------------------ draft
section('draft');
{
  const doc = { features: [box('b', 20, 20, 20, -10, -10, 0)] };
  let out = await K.rebuild(doc);
  const sides = faceBy('b', (d) => d.geom === 'PLANE' && Math.abs(d.normal[2]) < 1e-9);
  ok(sides.length === 4, 'dört yan yüz');
  doc.features.push({ id: 'df', type: 'draft', faces: sides, tool: base('XY'), angle: '5', flip: false });
  out = await K.rebuild(doc);
  ok(out.status.df.ok, 'draft: ' + errOf(out, 'df'));
  const after = faceBy('b', (d) => d.geom === 'PLANE' && Math.abs(d.normal[2]) < 0.5);
  ok(after.length === 4, 'draft sonrası dört yan yüz: ' + after.length);
  const angs = after.map((d) => (Math.asin(Math.min(1, Math.abs(d.normal[2]))) * 180) / Math.PI);
  ok(angs.every((a) => Math.abs(a - 5) <= 0.1), 'yan yüz normali 5° ±0,1: ' + angs.map((a) => a.toFixed(4)).join(','));
  // gövde çekme yönünde (+Z) daralır: üst yüz alanı < 400
  const top = faceBy('b', (d) => d.geom === 'PLANE' && d.normal[2] > 0.99)[0]; const t5 = Math.tan((5 * Math.PI) / 180);
  rel(top.area, (20 - 2 * 20 * t5) ** 2, 1e-4, 'üst yüz alanı (daralma)');
  rel(vol(out), (20 / 3) * (400 + (20 - 40 * t5) ** 2 + 20 * (20 - 40 * t5)), 1e-4, 'draft hacmi (kesik piramit)');
  // ortadan düzenleme: açı değişince sonraki işlem (delik kesme) güncellenir
  doc.features.push(box('k', 2, 2, 30, -1, -1, -5, 'cut'));
  out = await K.rebuild(doc); ok(out.status.k.ok, 'draft sonrası kesme');
  doc.features[1].angle = '3'; out = await K.rebuild(doc); ok(out.status.df.ok && out.status.k.ok, 'açı düzenlenince gerisi güncellendi');
  const t3 = Math.tan((3 * Math.PI) / 180); rel(vol(out), (20 / 3) * (400 + (20 - 40 * t3) ** 2 + 20 * (20 - 40 * t3)) - 4 * 20, 1e-3, 'düzenleme sonrası hacim');
  // ters çekme yönü: genişler
  doc.features[1].flip = true; out = await K.rebuild(doc); ok(out.status.df.ok && vol(out) > 8000, 'ters yön genişler');
  const d2 = roundTrip(doc); ok(d2.features[1].angle === '3' && d2.features[1].flip === true && d2.features[1].tool.name === 'XY', 'draft parametreleri dosyada');
  // hatalar
  doc.features[1].angle = '95'; out = await K.rebuild(doc); ok(errOf(out, 'df') === 'draft.angle_range', 'açı aralığı hatası');
  doc.features[1].angle = '5'; doc.features[1].faces = []; out = await K.rebuild(doc); ok(errOf(out, 'df') === 'draft.no_faces', 'yüzsüz draft hatası');
  doc.features[1].faces = faceBy('b', (d) => d.geom === 'PLANE' && d.normal[2] > 0.9).slice(0, 1); out = await K.rebuild(doc); ok(errOf(out, 'df') === 'draft.face_perpendicular', 'çekme yönüne dik yüz hatası: ' + errOf(out, 'df'));
}

// ------------------------------------------------------------------ helis (coil)
section('coil');
{
  const doc = { features: [{ id: 'co', type: 'coil', plane: 'XY', offset: '0', cx: '0', cy: '0', dia: '20', pitch: '5', turns: '4', sdia: '2', hand: 'right', op: 'new' }] };
  let out = await K.rebuild(doc);
  ok(out.status.co.ok, 'coil: ' + errOf(out, 'co'));
  const hl = 4 * Math.hypot(Math.PI * 20, 5);
  rel(vol(out), Math.PI * 1 * hl, 0.01, 'yay hacmi = kesit alanı × helis boyu');
  const bb = out.bodies[0].bbox; rel(bb[1][2] - bb[0][2], 20 + 2, 0.02, 'yay boyu');
  doc.features[0].hand = 'left'; out = await K.rebuild(doc); ok(out.status.co.ok, 'sol el coil'); rel(vol(out), Math.PI * hl, 0.01, 'sol el hacim');
  doc.features[0].sdia = '6'; out = await K.rebuild(doc); ok(errOf(out, 'co') === 'coil.self_intersect', 'kendini kesen yay hatası');
  const d2 = roundTrip(doc); ok(d2.features[0].hand === 'left', 'coil parametreleri dosyada');
}

// ------------------------------------------------------------------ diş (thread)
section('thread');
{
  const doc = { features: [{ id: 'cy', type: 'primitive', kind: 'cylinder', x: '0', y: '0', z: '0', dia: '10', h: '20', axis: 'Z', op: 'new' }] };
  let out = await K.rebuild(doc);
  const side = faceBy('cy', (d) => d.geom === 'CYLINDRE')[0];
  doc.features.push({ id: 'th', type: 'thread', face: side, thread: { designation: 'M10', pitch: 1.5, major: 10, family: 'iso' }, length: '', hand: 'right', flip: false });
  const t0 = Date.now(); out = await K.rebuild(doc);
  ok(out.status.th.ok, 'M10 dış diş: ' + errOf(out, 'th'));
  const sh = K.last.bodies.get('cy').shape; ok(TP.validity(sh) === null, 'dişli gövde geçerli katı (isValid)');
  // kaldırılan hacim: yiv kesitinin silindir içinde kalan kısmı × 2πr (Pappus) × boy / adım
  const P = 1.5, R0 = 5, h3 = 0.61343 * P, t30 = Math.tan(Math.PI / 6), rr = R0 - h3, hw = (r) => P / 12 + (r - rr) * t30;
  let rem = 0; const n = 2000; for (let i = 0; i < n; i++) { const r = rr + ((i + 0.5) * h3) / n; rem += 2 * hw(r) * 2 * Math.PI * r * (h3 / n); }
  rem *= 20 / P;
  rel(Math.PI * 25 * 20 - vol(out), rem, 0.03, 'M10 diş yivi hacmi');
  console.log('  (diş süresi ' + (Date.now() - t0) + ' ms)');
  const nm = K.last.bodies.get('cy').fn.flat(); ok(nm.includes('th:root') && nm.includes('th:flank+'), 'diş yüz adları');
  // ortadan düzenleme: silindir uzayınca diş tam boy kalır
  doc.features.push(box('kk', 2, 2, 4, -1, -1, 18, 'cut'));
  out = await K.rebuild(doc); ok(out.status.kk.ok, 'diş sonrası kesme');
  doc.features[0].h = '24'; out = await K.rebuild(doc); ok(out.status.th.ok && out.status.kk.ok, 'silindir düzenlenince diş ve gerisi güncellendi: ' + (errOf(out, 'th') || errOf(out, 'kk')));
  ok(TP.validity(K.last.bodies.get('cy').shape) === null, 'düzenleme sonrası geçerli');
  doc.features[0].h = '20'; doc.features.pop();
  // kısmi boy + sol el
  doc.features[1].length = '10'; doc.features[1].hand = 'left'; out = await K.rebuild(doc); ok(out.status.th.ok, 'kısmi sol el diş: ' + errOf(out, 'th'));
  rel(Math.PI * 25 * 20 - vol(out), rem * 10 / 20, 0.01, 'kısmi diş hacmi (10 mm)');
  const d2 = roundTrip(doc); ok(d2.features[1].thread.designation === 'M10' && d2.features[1].length === '10' && d2.features[1].hand === 'left', 'diş parametreleri dosyada');
  // iç diş: Ø8,5 delikli blok
  const doc2 = { features: [box('bl', 20, 20, 12, -10, -10, 0), { id: 'hs', type: 'sketch', plane: base('XY', '12'), points: { c: { x: 0, y: 0 } }, ents: [{ id: 'pp', type: 'point', p: 'c' }] }, { id: 'h1', type: 'hole', sketch: 'hs', kind: 'simple', dia: '8.5', extent: 'all', flip: false }] };
  out = await K.rebuild(doc2); ok(out.status.h1.ok, 'delik');
  const hf = faceBy('bl', (d) => d.geom === 'CYLINDRE')[0];
  doc2.features.push({ id: 'it', type: 'thread', face: hf, thread: { designation: 'M10', pitch: 1.5, major: 10, family: 'iso' }, length: '', hand: 'right' });
  out = await K.rebuild(doc2); ok(out.status.it.ok, 'M10 iç diş: ' + errOf(out, 'it'));
  ok(TP.validity(K.last.bodies.get('bl').shape) === null, 'iç dişli gövde geçerli');
  ok(vol(out) < 20 * 20 * 12 - Math.PI * 4.25 * 4.25 * 12 - 50, 'iç diş hacmi azalttı');
  // hatalar
  doc.features[1].thread = { designation: 'M12', pitch: 1.75, major: 12, family: 'iso' }; doc.features[1].length = '';
  out = await K.rebuild(doc); ok(errOf(out, 'th') === 'thread.dia_mismatch', 'çap uyumsuzluğu hatası: ' + errOf(out, 'th'));
  ok(/çap/i.test(errText(out.status.th.error)), 'diş hata metni: ' + errText(out.status.th.error));
  doc.features[1].face = faceBy('cy', (d) => d.geom === 'PLANE')[0]; out = await K.rebuild(doc); ok(errOf(out, 'th') === 'thread.not_cylinder', 'düzlem yüze diş hatası');
}

// ------------------------------------------------------------------ değişken yarıçaplı yuvarlatma
section('vfillet');
{
  const doc = { features: [box('b', 50, 40, 30)] };
  let out = await K.rebuild(doc);
  const e = edgeBy('b', (d) => d.geom === 'LINE' && Math.abs(d.length - 50) < 1e-6 && d.start[1] < 1e-9 && d.end[1] < 1e-9 && d.start[2] > 29)[0];
  ok(!!e, 'üst ön kenar');
  doc.features.push({ id: 'vf', type: 'vfillet', edges: [e], r1: '2', r2: '5' });
  out = await K.rebuild(doc);
  ok(out.status.vf.ok, 'değişken yuvarlatma: ' + errOf(out, 'vf'));
  const L = 50, k = 1 - Math.PI / 4;
  rel(60000 - vol(out), L * k * (4 + 10 + 25) / 3, 0.03, 'doğrusal değişen yarıçap hacmi');
  ok(TP.validity(K.last.bodies.get('b').shape) === null, 'geçerli');
  // ara nokta: 2 → 6 → 2
  doc.features[1].r2 = '2'; doc.features[1].rm = '6'; doc.features[1].tm = '0.5';
  out = await K.rebuild(doc); ok(out.status.vf.ok, 'ara noktalı yuvarlatma: ' + errOf(out, 'vf'));
  const rem = 60000 - vol(out); ok(rem > L * k * 4 * 1.5 && rem < L * k * 36, 'ara nokta hacmi aralıkta: ' + rem.toFixed(2));
  // ortadan düzenleme: kutu yüksekliği değişince seçim korunur
  doc.features.push(box('k', 4, 4, 4, 23, 18, -1, 'cut'));
  out = await K.rebuild(doc); ok(out.status.k.ok, 'sonraki kesme');
  doc.features[0].h = '35'; out = await K.rebuild(doc); ok(out.status.vf.ok && out.status.k.ok, 'kutu düzenlenince yuvarlatma güncellendi: ' + errOf(out, 'vf'));
  const d2 = roundTrip(doc); ok(d2.features[1].rm === '6' && d2.features[1].tm === '0.5', 'değişken yuvarlatma parametreleri dosyada');
  doc.features[1].tm = '1.2'; out = await K.rebuild(doc); ok(errOf(out, 'vf') === 'vfillet.pos_range', 'konum aralığı hatası');
  doc.features[1].tm = '0.5'; doc.features[1].rm = '40'; out = await K.rebuild(doc); ok(errOf(out, 'vf') === 'vfillet.too_big', 'büyük yarıçap hatası: ' + errOf(out, 'vf'));
}

// ------------------------------------------------------------------ rib
section('rib');
{
  // L köşebent: taban 100×40×10, duvar 10×40×60; kaburga XZ düzleminde (y = 20), duvardan tabana çapraz doğru
  const doc = { features: [box('b', 100, 40, 10), box('w', 10, 40, 60, 0, 0, 0, 'join'),
    openPoly('rs', base('XZ', '20'), [[10, 50], [90, 10]]),
    { id: 'rb', type: 'rib', sketch: 'rs', t: '5' }] };
  let out = await K.rebuild(doc);
  ok(out.status.w.ok, 'köşebent');
  const v0 = 100 * 40 * 10 + 10 * 40 * 50;
  ok(out.status.rb.ok, 'kaburga: ' + errOf(out, 'rb'));
  rel(vol(out) - v0, 0.5 * 80 * 40 * 5, 0.005, 'kaburga hacmi = üçgen × kalınlık');
  ok(out.bodies.length === 1, 'tek gövde');
  doc.features[3].t = '8'; out = await K.rebuild(doc); rel(vol(out) - v0, 0.5 * 80 * 40 * 8, 0.005, 'kalınlık düzenlendi');
  // ortadan düzenleme: duvar yükselince (doğru uçları hâlâ gövdede) kaburga yeniden hesaplanır
  doc.features[1].h = '70'; out = await K.rebuild(doc); ok(out.status.rb.ok, 'duvar düzenlenince kaburga: ' + errOf(out, 'rb'));
  const d2 = roundTrip(doc); ok(d2.features[3].t === '8', 'kaburga parametreleri dosyada');
  // gövdeye değmeyen doğru
  doc.features[2] = openPoly('rs', base('XZ', '20'), [[150, 50], [180, 50]]); out = await K.rebuild(doc);
  ok(errOf(out, 'rb') === 'rib.unbounded', 'kapanmayan kaburga hatası: ' + errOf(out, 'rb'));
  doc.features[2] = circle('rs', base('XZ', '20'), 50, 50, 5); out = await K.rebuild(doc); ok(errOf(out, 'rb') === 'rib.lines_only', 'daire kaburga hatası');
}


// ------------------------------------------------------------------ IGES
section('iges');
{
  // elle yazılmış küçük IGES: 10×20×30 kutu, 6 × (108 düzlem + 110 çizgiler + 102 bileşik + 142 + 144). Testteki bağımsız yazıcı
  // (src/kernel/iges.js kullanılmaz), birim inç (bayrak 1) → mm'ye ölçek de sınanır.
  const handIges = (W, H, D, unitFlag) => {
    const P = [[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0], [0, 0, D], [W, 0, D], [W, H, D], [0, H, D]];
    const faces = [[[0, 3, 2, 1], [0, 0, -1, 0]], [[4, 5, 6, 7], [0, 0, 1, D]], [[0, 1, 5, 4], [0, -1, 0, 0]], [[2, 3, 7, 6], [0, 1, 0, H]], [[1, 2, 6, 5], [1, 0, 0, W]], [[0, 4, 7, 3], [-1, 0, 0, 0]]];
    const ents = []; const add = (type, params, sub = '00010000') => { ents.push({ type, params, sub }); return 2 * ents.length - 1; };
    for (const [loop, pl] of faces) {
      const s = add(108, [...pl, 0, 0, 0, 0]);
      const ls = loop.map((a, k) => add(110, [...P[a], ...P[loop[(k + 1) % 4]]]));
      const c = add(102, [4, ...ls]); const b = add(142, [0, s, 0, c, 2]); add(144, [s, 1, 0, b], '00000000');
    }
    const pad = (x, n) => (x + ' '.repeat(n)).slice(0, n), rp = (x, n) => (' '.repeat(n) + x).slice(-n);
    const G = `1H,,1H;,4Htest,6Ht1.igs,4Htest,4Htest,32,38,6,308,15,4Htest,1,${unitFlag},2HIN,1,0.01,15H20260101.000000,0.0001,100,0H,0H,11,0,15H20260101.000000;`;
    const out = [pad('elle yazilmis kutu', 72) + 'S      1'];
    const gl = G.match(/.{1,72}/g); gl.forEach((l, i) => out.push(pad(l, 72) + 'G' + rp(String(i + 1), 7)));
    const Dl = [], Pl = [];
    ents.forEach((e, k) => { const de = 2 * k + 1; const txt = [e.type, ...e.params].join(',') + ';'; const parts = txt.match(/.{1,64}(,|;|$)/g).filter(Boolean); const p0 = Pl.length + 1;
      parts.forEach((x) => Pl.push(pad(x, 64) + ' ' + rp(String(de), 7) + 'P' + rp(String(Pl.length + 1), 7)));
      const f = (x) => rp(String(x), 8); Dl.push(f(e.type) + f(p0) + f(0) + f(0) + f(0) + f(0) + f(0) + f(0) + e.sub + 'D' + rp(String(de), 7)); Dl.push(f(e.type) + f(0) + f(0) + f(parts.length) + f(0) + ' '.repeat(24) + f(0) + 'D' + rp(String(de + 1), 7)); });
    out.push(...Dl, ...Pl, pad(`S      1G${rp(String(gl.length), 7)}D${rp(String(Dl.length), 7)}P${rp(String(Pl.length), 7)}`, 72) + 'T      1');
    return out.join('\n') + '\n';
  };
  const b64 = (txt) => Buffer.from(txt, 'latin1').toString('base64');
  const imp = (txt) => ({ features: [{ id: 'ig', type: 'import', format: 'iges', name: 'kutu', data: b64(txt) }] });
  let out = await K.rebuild(imp(handIges(10, 20, 30, 2)));
  ok(out.status.ig.ok, 'IGES içe (mm): ' + errOf(out, 'ig') + ' ' + JSON.stringify(out.status.ig.error?.params || ''));
  rel(vol(out), 6000, 1e-9, 'IGES kutu hacmi');
  ok(out.bodies[0]?.nFaces === 6 && TP.validity(K.last.bodies.get(out.bodies[0].id).shape) === null, 'IGES gövdesi geçerli, 6 yüz');
  out = await K.rebuild(imp(handIges(1, 2, 3, 1)));
  ok(out.status.ig.ok, 'IGES içe (inç)'); rel(vol(out), 6 * 25.4 ** 3, 1e-9, 'inç → mm ölçeği');
  // içe alınan gövdede sonraki işlem (yüzü delik) ve kaydet/aç
  const d = imp(handIges(10, 20, 30, 2)); d.features.push({ id: 'cc', type: 'primitive', kind: 'cylinder', x: '5', y: '10', z: '-1', dia: '4', h: '40', axis: 'Z', op: 'cut' });
  out = await K.rebuild(d); ok(out.status.cc.ok, 'IGES gövdesinde kesme'); rel(vol(out), 6000 - Math.PI * 4 * 30, 1e-6, 'kesme sonrası hacim');
  const d2 = roundTrip(d); ok(d2.features[0].format === 'iges', 'IGES içe aktarma belgeyle saklanır');
  // bozuk dosya: açık hata
  out = await K.rebuild(imp('bu bir IGES dosyasi degil\n')); ok(!out.status.ig.ok && out.status.ig.error.code === 'import.load_failed', 'bozuk IGES açık hata: ' + errOf(out, 'ig'));
  // dışa → içe gidiş-dönüş (yazıcı: düzlem 108 tam, diğer yüzeyler 128 yaklaşımı)
  const doc = { features: [box('bx', 30, 20, 10), { id: 'cy', type: 'primitive', kind: 'cylinder', x: '15', y: '10', z: '-5', dia: '8', h: '30', axis: 'Z', op: 'cut' }] };
  out = await K.rebuild(doc); const v0 = vol(out);
  const bytes = await K.exportFile('iges', null, null);
  ok(bytes.length > 1000 && new TextDecoder().decode(bytes.subarray(72, 73)) === 'S', 'IGES dışa aktarıldı (80 sütun)');
  out = await K.rebuild(imp(new TextDecoder().decode(bytes))); ok(out.status.ig.ok, 'dışa aktarılan IGES geri okunur: ' + errOf(out, 'ig'));
  rel(vol(out), v0, 1e-4, 'IGES gidiş-dönüş hacmi (delikli blok)');
}

console.log(`modelleme2: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
