// İE-007 (O-057): yapı düzlemi (construction plane). Sözleşme: pm/tasarim/IE-007-yapi-duzlemi.md
// Açı (orijin ekseni / kenar ekseni), üç nokta (vertex / sketch / xyz), ofset, zincir; parametrik güncelleme; düzlem üzerinde
// eskiz → extrude hacmi; ayna ve bölme düzlemi; kaydet/aç ve dosya sürümü; hata kodları; başvuru onarımı; T04 (ppp0109) açılı düzlemle.
// Çalıştır: node test/yapi-duzlemi.test.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import { initKernel } from '../src/kernel/kernel.js';
import { validateDoc, checkEnvelope, docFileVersion, FILE_VERSION } from '../src/shared/schema.js';
import { errText, setLang } from '../src/shared/i18n.js';
import * as TP from '../src/kernel/topo.js';
import tr from '../src/i18n/tr.js';
import en from '../src/i18n/en.js';
setLang('tr', false);
const here = path.dirname(fileURLToPath(import.meta.url));
const wasm = path.join(here, '../node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const rel = (a, b, tol, m) => ok(Number.isFinite(a) && Math.abs(a - b) <= tol * Math.abs(b), `${m}: ${a} ≉ ${b} (±${tol * 100}%)`);
const vnear = (a, b, m, tol = 1e-9) => ok(Array.isArray(a) && a.length === 3 && a.every((x, i) => Math.abs(x - b[i]) <= tol), `${m}: [${a}] ≉ [${b}]`);
const section = (s) => console.log(s);
const K = await initKernel(opencascade, () => wasm);
const D = Math.PI / 180;

const base = (name, offset = '0') => ({ kind: 'base', name, offset });
const pref = (id) => ({ kind: 'plane', id });
const rect = (id, plane, w, h, cx = 0, cy = 0) => ({ id, type: 'sketch', plane,
  points: { a: { x: cx - w / 2, y: cy - h / 2 }, b: { x: cx + w / 2, y: cy - h / 2 }, c: { x: cx + w / 2, y: cy + h / 2 }, d: { x: cx - w / 2, y: cy + h / 2 } },
  ents: [{ id: 'l1', type: 'line', a: 'a', b: 'b' }, { id: 'l2', type: 'line', a: 'b', b: 'c' }, { id: 'l3', type: 'line', a: 'c', b: 'd' }, { id: 'l4', type: 'line', a: 'd', b: 'a' }] });
const ext = (id, sketch, dist, extra = {}) => ({ id, type: 'extrude', sketch, profiles: 'all', dist: String(dist), extent: 'dist', dir: 'one', op: 'new', ...extra });
const box = (id, w, d, h, x = 0, y = 0, z = 0) => ({ id, type: 'primitive', kind: 'box', x: String(x), y: String(y), z: String(z), w: String(w), d: String(d), h: String(h), op: 'new' });
const errOf = (out, id) => out.status[id]?.error?.code;
const PL = (out, id) => out.planes?.[id]?.plane;
const unitOk = (p) => p && [p.x, p.y, p.n].every((v) => Math.abs(Math.hypot(...v) - 1) < 1e-12) && Math.abs(p.x[0] * p.y[0] + p.x[1] * p.y[1] + p.x[2] * p.y[2]) < 1e-12;
const crossOk = (p) => { const c = [p.x[1] * p.y[2] - p.x[2] * p.y[1], p.x[2] * p.y[0] - p.x[0] * p.y[2], p.x[0] * p.y[1] - p.x[1] * p.y[0]]; return c.every((x, i) => Math.abs(x - p.n[i]) < 1e-12); };
const edgeBy = (bid, pred) => { const out = []; const n = TP.topoOf(K.last.bodies.get(bid).shape).edges.size; for (let i = 0; i < n; i++) { const d = K.describe({ body: bid, idx: i }, 'edge'); if (pred(d)) out.push(d); } return out; };
const faceBy = (bid, pred) => { const out = []; const n = TP.topoOf(K.last.bodies.get(bid).shape).faces.size; for (let i = 0; i < n; i++) { const d = K.describe({ body: bid, idx: i }, 'face'); if (pred(d)) out.push(d); } return out; };
const near3 = (a, b, t = 1e-6) => a && b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= t;
const strip = ({ body, kind, name, hint }) => ({ body, kind, name, hint });
const envelope = (doc) => { const txt = JSON.stringify({ app: 'Mihenk', version: docFileVersion(doc), doc }); const j = JSON.parse(txt); const env = checkEnvelope(j); validateDoc(j.doc, { byteLength: txt.length }); return { j, env }; };

// ------------------------------------------------------------------ açı: orijin ekseni
section('açı düzlemi: orijin ekseni');
{
  const doc = { params: [{ name: 'a', expr: '45' }], features: [
    { id: 'pl1', type: 'plane', mode: 'angle', base: base('XY'), axis: { kind: 'axis', name: 'Y' }, angle: 'a' },
    rect('s1', pref('pl1'), 20, 10), ext('e1', 's1', 5),
  ] };
  let out = await K.rebuild(doc);
  ok(out.status.pl1?.ok, 'pl1 ok: ' + errOf(out, 'pl1'));
  let p = PL(out, 'pl1');
  ok(unitOk(p) && crossOk(p), 'düzlem dik birim ve sağ el (n = x × y)');
  vnear(p?.n, [Math.sin(45 * D), 0, Math.cos(45 * D)], 'n = Z, Y etrafında +45°');
  vnear(p?.x, [0, 1, 0], 'x = eksen yönü (Y)'); vnear(p?.o, [0, 0, 0], 'o = orijinin eksen üzerine izdüşümü');
  ok(out.status.s1?.ok && out.status.e1?.ok, 'düzlem üzerinde eskiz + extrude: ' + errOf(out, 's1') + ' ' + errOf(out, 'e1'));
  rel(out.bodies[0]?.volume, 20 * 10 * 5, 1e-9, 'extrude hacmi 20×10×5');
  let com = K.bodyProps('e1').com; vnear(com, p.n.map((x) => x * 2.5), 'ağırlık merkezi o + n·h/2', 1e-6);
  ok(JSON.stringify(out.sketches.s1.plane) === JSON.stringify(p), 'eskiz düzlemi = yapı düzlemi');
  // önbellek: aynı belge yeniden → hepsi önbellekten
  out = await K.rebuild(doc);
  ok(out.featInfo.pl1.cached && out.featInfo.e1.cached, 'değişmeyen belge önbellekten');
  // parametrik: değişken değişince düzlem, eskiz ve extrude güncellenir
  doc.params[0].expr = '30';
  out = await K.rebuild(doc); p = PL(out, 'pl1');
  vnear(p?.n, [Math.sin(30 * D), 0, Math.cos(30 * D)], 'a = 30 → n');
  ok(!out.featInfo.pl1.cached && out.featInfo.pl1.changed && out.featInfo.s1.changed && out.featInfo.e1.changed, 'açı değişti: pl1, s1, e1 "değişti" ' + JSON.stringify([out.featInfo.pl1, out.featInfo.s1.changed, out.featInfo.e1.changed]));
  com = K.bodyProps('e1').com; vnear(com, p.n.map((x) => x * 2.5), 'a = 30: ağırlık merkezi güncellendi', 1e-6);
  const bb = out.bodies[0].bbox; rel(bb[1][2] - bb[0][2], 10 * Math.sin(30 * D) + 5 * Math.cos(30 * D), 1e-6, 'a = 30: z yüksekliği');
  // ifade doğrudan (alan içinde) ve angle = 0 → taban yönelimi
  doc.features[0].angle = '0'; out = await K.rebuild(doc); p = PL(out, 'pl1');
  vnear(p?.n, [0, 0, 1], 'açı 0 → n = taban normali'); vnear(p?.x, [0, 1, 0], 'açı 0 → x = eksen');
  // negatif açı ve flip
  doc.features[0].angle = '-90'; doc.features[0].flip = true; out = await K.rebuild(doc); p = PL(out, 'pl1');
  vnear(p?.n, [1, 0, 0], 'açı −90 + flip → n = +X'); vnear(p?.x, [0, 1, 0], 'flip x korunur'); ok(unitOk(p) && crossOk(p), 'flip sonrası sağ el');
  // XZ tabanı, X ekseni: n_b = −Y; X etrafında +90 → n = −Z? (Rodrigues: (1,0,0)×(0,−1,0) = (0,0,−1))
  doc.features[0] = { id: 'pl1', type: 'plane', mode: 'angle', base: base('XZ', '5'), axis: { kind: 'axis', name: 'X' }, angle: '90' };
  out = await K.rebuild(doc); p = PL(out, 'pl1');
  vnear(p?.n, [0, 0, -1], 'XZ (ofset 5), X ekseni, 90° → n'); vnear(p?.o, [0, 0, 0], 'o: XZ orijini (0,5,0) X eksenine izdüşüm → (0,0,0)');
}

// ------------------------------------------------------------------ açı: kenar ekseni
section('açı düzlemi: kenar ekseni');
let topRef, backTopEdge, vertEdge;
{
  const doc = { params: [], features: [box('b', 20, 10, 10)] };
  await K.rebuild(doc);
  topRef = strip(faceBy('b', (d) => d.geom === 'PLANE' && d.normal[2] > 0.99)[0]);
  backTopEdge = strip(edgeBy('b', (d) => d.geom === 'LINE' && Math.abs(d.start[1] - 10) < 1e-9 && Math.abs(d.end[1] - 10) < 1e-9 && Math.abs(d.start[2] - 10) < 1e-9 && Math.abs(d.end[2] - 10) < 1e-9)[0]);
  vertEdge = strip(edgeBy('b', (d) => d.geom === 'LINE' && near3(d.start, [20, 10, 0]) !== near3(d.end, [20, 10, 0]) && Math.abs(d.start[0] - d.end[0]) < 1e-9 && Math.abs(d.start[1] - d.end[1]) < 1e-9)[0]);
  ok(topRef?.name && backTopEdge?.name && vertEdge?.name, 'kutu yüz/kenar başvuruları');
  doc.features.push({ id: 'pl', type: 'plane', mode: 'angle', base: { kind: 'face', ref: topRef }, axis: { kind: 'edge', ref: backTopEdge }, angle: '90' });
  let out = await K.rebuild(doc); let p = PL(out, 'pl');
  ok(out.status.pl?.ok, 'kenar eksenli düzlem: ' + errOf(out, 'pl'));
  vnear(p?.x, [1, 0, 0], 'd işareti sabit: en büyük bileşen pozitif (x = +X)');
  vnear(p?.n, [0, -1, 0], 'üst yüz normali +Z, +X etrafında 90° → −Y');
  vnear(p?.o, [0, 10, 10], 'o: yüz düzlemi orijininin kenar doğrusuna izdüşümü', 1e-9);
  // kenar üzerindeki düzlemde eskiz + extrude (kutunun arka yüzüne bitişik yeni gövde): hacim analitik
  doc.features.push(rect('sk', pref('pl'), 10, 6, 10, 3), ext('ex', 'sk', 4, { op: 'new' }));
  out = await K.rebuild(doc);
  ok(out.status.ex?.ok, 'kenar düzleminde extrude: ' + errOf(out, 'ex'));
  rel(out.bodies.find((b) => b.id === 'ex')?.volume, 10 * 6 * 4, 1e-9, 'extrude hacmi 10×6×4');
  const bb = out.bodies.find((b) => b.id === 'ex')?.bbox; ok(bb && Math.abs(bb[0][1] - 6) < 1e-6 && Math.abs(bb[1][1] - 10) < 1e-6, 'extrude −Y yönünde (y ∈ [6,10]) ' + JSON.stringify(bb));
  // kenar tabana paralel değil
  doc.features[1].axis = { kind: 'edge', ref: vertEdge }; out = await K.rebuild(doc);
  ok(errOf(out, 'pl') === 'plane.axis_not_parallel', 'dik kenar → plane.axis_not_parallel: ' + errOf(out, 'pl'));
  ok(errOf(out, 'sk') === 'plane.not_found', 'hatalı düzleme bağlı eskiz → plane.not_found: ' + errOf(out, 'sk'));
  // orijin ekseni tabana paralel değil
  doc.features[1] = { id: 'pl', type: 'plane', mode: 'angle', base: base('XY'), axis: { kind: 'axis', name: 'Z' }, angle: '10' }; out = await K.rebuild(doc);
  ok(errOf(out, 'pl') === 'plane.axis_not_parallel', 'XY + Z ekseni → plane.axis_not_parallel: ' + errOf(out, 'pl'));
  // doğrusal olmayan kenar
  const cdoc = { params: [], features: [{ id: 'c', type: 'primitive', kind: 'cylinder', x: '0', y: '0', z: '0', dia: '10', h: '10', axis: 'Z', op: 'new' }] };
  await K.rebuild(cdoc);
  const circ = strip(edgeBy('c', (d) => d.geom === 'CIRCLE' && Math.abs(d.center[2] - 10) < 1e-9)[0]);
  cdoc.features.push({ id: 'pc', type: 'plane', mode: 'angle', base: base('XY'), axis: { kind: 'edge', ref: circ }, angle: '10' });
  out = await K.rebuild(cdoc);
  ok(errOf(out, 'pc') === 'plane.axis_not_linear', 'dairesel kenar ekseni → plane.axis_not_linear: ' + errOf(out, 'pc'));
  // üç nokta: dairesel kenarda merkez (hint merkeze yakın)
  cdoc.features[1] = { id: 'pc', type: 'plane', mode: 'three', points: [{ kind: 'vertex', edge: circ, hint: [0.1, 0, 10] }, { kind: 'xyz', x: '5', y: '0', z: '10' }, { kind: 'xyz', x: '0', y: '5', z: '10' }] };
  out = await K.rebuild(cdoc); p = PL(out, 'pc');
  ok(out.status.pc?.ok, 'üç nokta (dairesel kenar merkezi): ' + errOf(out, 'pc'));
  vnear(p?.o, [0, 0, 10], 'dairesel kenar: hint merkeze yakın → merkez', 1e-9); vnear(p?.n, [0, 0, 1], 'n = +Z');
}

// ------------------------------------------------------------------ üç nokta
section('üç nokta düzlemi (vertex / sketch / xyz)');
{
  const doc = { params: [{ name: 'zz', expr: '7' }], features: [
    box('b', 20, 10, 10),
    { id: 'sp', type: 'sketch', plane: base('XY'), points: { q: { x: 20, y: 0 } }, ents: [{ id: 'n1', type: 'point', p: 'q' }] },
    { id: 'p3', type: 'plane', mode: 'three', points: [
      { kind: 'vertex', edge: backTopEdge, hint: [0.2, 9.9, 10.1] }, // kenarın (0,10,10) ucu
      { kind: 'sketch', sketch: 'sp', point: 'q' }, // (20,0,0)
      { kind: 'xyz', x: '0', y: '0', z: 'zz' }] }, // (0,0,7)
  ] };
  let out = await K.rebuild(doc); let p = PL(out, 'p3');
  ok(out.status.p3?.ok, 'üç nokta ok: ' + errOf(out, 'p3'));
  const P1 = [0, 10, 10], P2 = [20, 0, 0], P3 = [0, 0, 7];
  const sub = (a, b) => a.map((x, i) => x - b[i]); const nrm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const X = nrm(sub(P2, P1)), N = nrm(cr(X, sub(P3, P1)));
  vnear(p?.o, P1, 'o = p1 (vertex)', 1e-9); vnear(p?.x, X, 'x = birim(p2 − p1)', 1e-12); vnear(p?.n, N, 'n = birim(x × (p3 − p1))', 1e-12);
  ok(unitOk(p) && crossOk(p), 'üç nokta: sağ el');
  // düzlem üzerinde daire → silindir hacmi
  doc.features.push({ id: 'sc', type: 'sketch', plane: pref('p3'), points: { c: { x: 5, y: -3 } }, ents: [{ id: 'c1', type: 'circle', c: 'c', r: 2 }] }, ext('ec', 'sc', 3));
  out = await K.rebuild(doc);
  rel(out.bodies.find((b) => b.id === 'ec')?.volume, Math.PI * 4 * 3, 1e-6, 'üç nokta düzleminde Ø4 × 3 silindir');
  // xyz ifadesi değişkenle güncellenir
  doc.params[0].expr = '3'; out = await K.rebuild(doc); p = PL(out, 'p3');
  vnear(p?.n, nrm(cr(X, sub([0, 0, 3], P1))), 'zz = 3 → n güncellendi', 1e-12);
  // doğrudaş
  doc.features[2].points[2] = { kind: 'xyz', x: '40', y: '-10', z: '-10' }; out = await K.rebuild(doc);
  ok(errOf(out, 'p3') === 'plane.points_collinear', 'doğrudaş üç nokta → plane.points_collinear: ' + errOf(out, 'p3'));
  doc.features[2].points[2] = { kind: 'xyz', x: '0', y: '10', z: '10' }; out = await K.rebuild(doc);
  ok(errOf(out, 'p3') === 'plane.points_collinear', 'çakışan noktalar → plane.points_collinear: ' + errOf(out, 'p3'));
  // sonra gelen eskiz noktası
  doc.features[2].points[2] = { kind: 'xyz', x: '0', y: '0', z: '7' };
  const later = { ...doc, features: [doc.features[0], doc.features[2], doc.features[1]] }; out = await K.rebuild(later);
  ok(errOf(out, 'p3') === 'sketch.not_found', 'sonra gelen eskizin noktası → sketch.not_found: ' + errOf(out, 'p3'));
  doc.features[2].points[1] = { kind: 'sketch', sketch: 'sp', point: 'yok' }; out = await K.rebuild(doc);
  ok(errOf(out, 'p3') === 'sketch.not_found', 'olmayan eskiz noktası → sketch.not_found: ' + errOf(out, 'p3'));
}

// ------------------------------------------------------------------ ofset + zincir
section('ofset ve zincir');
{
  const doc = { params: [{ name: 'h', expr: '10' }], features: [
    { id: 'pa', type: 'plane', mode: 'angle', base: base('XY'), axis: { kind: 'axis', name: 'X' }, angle: '30' },
    { id: 'po', type: 'plane', mode: 'offset', base: pref('pa'), offset: 'h' },
    { id: 'pc', type: 'plane', mode: 'angle', base: pref('po'), axis: { kind: 'axis', name: 'X' }, angle: '60' },
    rect('s', pref('po'), 8, 8), ext('e', 's', 2),
    rect('s2', pref('pc'), 4, 4), ext('e2', 's2', 1),
  ] };
  let out = await K.rebuild(doc);
  const pa = PL(out, 'pa'), po = PL(out, 'po'), pc = PL(out, 'pc');
  ok(['pa', 'po', 'pc', 'e', 'e2'].every((id) => out.status[id]?.ok), 'zincir ok: ' + ['pa', 'po', 'pc', 'e', 'e2'].map((id) => errOf(out, id)).join(','));
  const n30 = [0, -Math.sin(30 * D), Math.cos(30 * D)]; // Z, X etrafında +30°: (0, −sin, cos)
  vnear(pa?.n, n30, 'pa: n'); vnear(po?.n, n30, 'po: n = taban normali'); vnear(po?.x, pa.x, 'po: x'); vnear(po?.y, pa.y, 'po: y');
  vnear(po?.o, n30.map((x) => x * 10), 'po: o = o_b + n_b·10', 1e-12);
  vnear(pc?.n, [0, -1, 0], 'pc: 30 + 60 = 90° → n = −Y', 1e-12);
  vnear(pc?.o, [0, 0, 0], 'pc: o = po orijininin X eksenine (orijinden geçer) dik izdüşümü', 1e-9);
  rel(out.bodies.find((b) => b.id === 'e')?.volume, 8 * 8 * 2, 1e-9, 'ofset düzleminde 8×8×2');
  vnear(K.bodyProps('e').com, n30.map((x) => x * 11), 'ofset gövdesi ağırlık merkezi o + n·1', 1e-6);
  // ofset değişkeni değişince bağlı her şey güncellenir
  doc.params[0].expr = '-4'; out = await K.rebuild(doc);
  vnear(PL(out, 'po')?.o, n30.map((x) => x * -4), 'h = −4 → po.o', 1e-12);
  vnear(K.bodyProps('e').com, n30.map((x) => x * -3), 'h = −4 → gövde taşındı', 1e-6);
  ok(!out.featInfo.pa.changed && out.featInfo.po.changed && out.featInfo.e.changed, 'ofset değişti: pa aynı, po ve e değişti ' + JSON.stringify(['pa', 'po', 'pc', 'e', 'e2'].map((k) => out.featInfo[k].changed)));
  // bastırılmış / sonra gelen / olmayan düzlem
  doc.features[1].suppressed = true; out = await K.rebuild(doc);
  ok(errOf(out, 'pc') === 'plane.not_found' && errOf(out, 's') === 'plane.not_found', 'bastırılmış düzlem → plane.not_found: ' + errOf(out, 'pc') + ' ' + errOf(out, 's'));
  ok(!out.planes.po && out.planes.pa, 'bastırılmış düzlem result.planes içinde yok');
  delete doc.features[1].suppressed;
  const later = { ...doc, features: [doc.features[1], doc.features[0], ...doc.features.slice(2)] }; out = await K.rebuild(later);
  ok(errOf(out, 'po') === 'plane.not_found', 'sonra gelen tabana başvuru → plane.not_found: ' + errOf(out, 'po'));
  out = await K.rebuild({ features: [rect('s', pref('yok'), 4, 4)] });
  ok(errOf(out, 's') === 'plane.not_found', 'olmayan düzlem → plane.not_found');
  out = await K.rebuild({ features: [{ id: 'pz', type: 'plane', mode: 'nope', base: base('XY') }] });
  ok(errOf(out, 'pz') === 'sketch.plane_unknown', 'bilinmeyen kip → sketch.plane_unknown: ' + errOf(out, 'pz'));
}

// ------------------------------------------------------------------ ayna ve bölme
section('ayna ve bölme (toolPlane)');
{
  const doc = { params: [], features: [
    box('b', 10, 10, 10, 20, 0, 0),
    { id: 'pm', type: 'plane', mode: 'offset', base: base('YZ'), offset: '5' },
    { id: 'm', type: 'mirror', source: { kind: 'body', bodies: ['b'] }, plane: 'plane', planeId: 'pm' },
  ] };
  let out = await K.rebuild(doc);
  ok(out.status.m?.ok, 'ayna (yapı düzlemi): ' + errOf(out, 'm'));
  const cp = out.bodies.find((b) => b.id !== 'b');
  ok(cp && Math.abs(cp.bbox[0][0] + 20) < 1e-6 && Math.abs(cp.bbox[1][0] + 10) < 1e-6, 'aynalanan kutu x ∈ [−20, −10]: ' + JSON.stringify(cp?.bbox));
  rel(cp?.volume, 1000, 1e-9, 'ayna kopyası hacmi');
  doc.features[2].planeId = 'yok'; out = await K.rebuild(doc);
  ok(errOf(out, 'm') === 'plane.not_found', 'ayna: olmayan düzlem → plane.not_found');
  // açılı düzlemle bölme: kutu x = 25 dik düzlemle ikiye
  const sd = { params: [], features: [
    box('b', 10, 10, 10, 20, 0, 0),
    { id: 'pv', type: 'plane', mode: 'angle', base: base('XY'), axis: { kind: 'axis', name: 'Y' }, angle: '90' },
    { id: 'po', type: 'plane', mode: 'offset', base: pref('pv'), offset: '25' },
    { id: 'sp', type: 'split', body: 'b', tool: pref('po') },
  ] };
  out = await K.rebuild(sd);
  ok(out.status.sp?.ok && out.bodies.length === 2, 'bölme (yapı düzlemi): ' + errOf(out, 'sp'));
  ok(out.bodies.every((b) => Math.abs(b.volume - 500) < 1e-6), 'iki yarı 500 mm³: ' + out.bodies.map((b) => b.volume).join(','));
  ok(validateDoc(sd) && validateDoc(doc), 'şema: bölme ve ayna düzlem başvurusu geçerli');
}

// ------------------------------------------------------------------ başvuru onarımı
section('başvuru (refs / lost)');
{
  const doc = { params: [], features: [
    box('b', 20, 10, 10),
    { id: 'pl', type: 'plane', mode: 'angle', base: { kind: 'face', ref: topRef }, axis: { kind: 'edge', ref: backTopEdge }, angle: '15' },
    { id: 'p3', type: 'plane', mode: 'three', points: [{ kind: 'vertex', edge: backTopEdge, hint: [0, 10, 10] }, { kind: 'xyz', x: '20', y: '0', z: '0' }, { kind: 'vertex', edge: vertEdge, hint: [20, 10, 0] }] },
  ] };
  const KR = await initKernel(opencascade, () => wasm);
  let out = await KR.rebuild(doc); ok(out.status.pl?.ok && out.status.p3?.ok, 'onarım öncesi sağlam: ' + errOf(out, 'pl') + ' ' + errOf(out, 'p3'));
  ok(KR.repairInfo('pl').total === 2 && KR.repairInfo('pl').lost.length === 0, 'repairInfo: düzlem başvuruları sayılır (base.ref, axis.ref): ' + JSON.stringify(KR.repairInfo('pl')));
  ok(KR.repairInfo('p3').total === 2, 'repairInfo: points[i].edge sayılır');
  doc.features[0] = { ...box('b', 20, 10, 10), kind: 'cylinder', dia: '10', axis: 'Z' }; out = await KR.rebuild(doc);
  ok(out.status.pl?.ok === false && out.status.p3?.ok === false, 'kutu silindire döndü: düzlem başvuruları kayıp');
  const ri = KR.repairInfo('pl'); const fields = ri.lost.map((x) => x.field).sort();
  ok(ri.total === 2 && JSON.stringify(fields) === JSON.stringify(['axis.ref', 'base.ref']), 'lost: base.ref + axis.ref: ' + JSON.stringify(ri.lost.map((x) => [x.field, x.kind, x.code])));
  ok(ri.lost.find((x) => x.field === 'axis.ref')?.kind === 'edge' && ri.lost.find((x) => x.field === 'base.ref')?.kind === 'face', 'lost türleri (kenar / yüz)');
  ok(ri.lost.every((x) => x.ghost && x.ghost.length >= 6), 'hayalet çizgi son başarılı konumdan');
  const r3 = KR.repairInfo('p3');
  ok(r3.lost.length === 2 && r3.lost.every((x) => x.field === 'points' && x.kind === 'edge') && JSON.stringify(r3.lost.map((x) => x.index)) === '[0,2]', 'lost: points[0].edge, points[2].edge: ' + JSON.stringify(r3.lost.map((x) => [x.field, x.index])));
}

// ------------------------------------------------------------------ şema ve dosya sürümü
section('şema, kaydet/aç, sürüm');
{
  ok(FILE_VERSION === 2, 'FILE_VERSION = 2');
  const doc = { params: [{ name: 'a', expr: '20' }], features: [
    { id: 'pl1', type: 'plane', name: 'Düzlem 1', mode: 'angle', base: base('XY', '2'), axis: { kind: 'axis', name: 'X' }, angle: 'a', flip: false },
    { id: 'pl2', type: 'plane', mode: 'offset', base: pref('pl1'), offset: '3' },
    { id: 'pl3', type: 'plane', mode: 'three', points: [{ kind: 'xyz', x: '0', y: '0', z: '0' }, { kind: 'xyz', x: '1', y: '0', z: '0' }, { kind: 'xyz', x: '0', y: '1', z: '1' }] },
    rect('s', pref('pl2'), 10, 10), ext('e', 's', 4),
  ] };
  const before = await K.rebuild(doc);
  const { j, env } = envelope(doc);
  ok(j.version === 2 && !env.newer, 'düzlemli belge sürüm 2 yazılır, açılır (newer değil)');
  const after = await K.rebuild(j.doc);
  ok(Math.abs(after.bodies[0].volume - before.bodies[0].volume) < 1e-9 && JSON.stringify(after.planes) === JSON.stringify(before.planes), 'kaydet/aç gidiş-dönüş: aynı hacim ve düzlemler');
  rel(after.bodies[0].volume, 400, 1e-9, 'pl2 üzerinde 10×10×4');
  ok(docFileVersion({ features: [rect('s', base('XY'), 2, 2)] }) === 1, 'düzlemsiz belge sürüm 1');
  ok(docFileVersion({ features: [{ id: 'm', type: 'mirror', source: { kind: 'body', bodies: ['b'] }, plane: 'plane', planeId: 'p' }] }) === 2, 'ayna düzlem başvurusu → sürüm 2');
  ok(docFileVersion({ features: [{ id: 'sp', type: 'split', body: 'b', tool: pref('p') }] }) === 2, 'bölme düzlem başvurusu → sürüm 2');
  ok(docFileVersion({ features: [{ id: 'p', type: 'plane', mode: 'offset', base: base('XY'), offset: '1', suppressed: true }] }) === 2, 'bastırılmış düzlem de sürüm 2');
  ok(docFileVersion({}) === 1 && docFileVersion(null) === 1, 'boş belge sürüm 1');
  ok(checkEnvelope({ app: 'Mihenk', version: 3, doc: {} }).newer === true, 'sürüm 3 → newer');
  // sürüm 1 belge değişmeden açılır (T04 arayüz belgesi, 0.6.x)
  const t04txt = fs.readFileSync(path.join(here, 'fixtures/ie007/T04-arayuz.mhnk'), 'utf8'); const t04 = JSON.parse(t04txt); const snap = JSON.stringify(t04);
  const e1 = checkEnvelope(t04); ok(e1.version === 1 && !e1.newer, 'sürüm 1 zarfı kabul');
  ok(validateDoc(t04.doc, { byteLength: t04txt.length }), 'sürüm 1 belge şemadan geçer');
  const r1 = await K.rebuild(t04.doc);
  ok(Object.values(r1.status).every((s) => s.ok), 'sürüm 1 belge hatasız hesaplanır');
  ok(JSON.stringify(t04) === snap, 'sürüm 1 belge değişmedi (doğrulama + hesap)');
  ok(docFileVersion(t04.doc) === 1, 'sürüm 1 belge yeniden yazılırken sürüm 1 kalır');
  // şema hataları
  const bad = (f, m) => { let code = null; try { validateDoc({ features: [f] }); } catch (e) { code = e.code; } ok(code && code.startsWith('schema.'), m + ': ' + code); };
  bad({ id: 'p', type: 'plane', mode: 'yamuk', base: base('XY') }, 'bilinmeyen kip');
  bad({ id: 'p', type: 'plane', mode: 'angle', base: { kind: 'plane' }, axis: { kind: 'axis', name: 'X' }, angle: '1' }, 'kimliksiz düzlem başvurusu');
  bad({ id: 'p', type: 'plane', mode: 'angle', base: base('XY'), axis: { kind: 'axis', name: 'W' }, angle: '1' }, 'bilinmeyen eksen');
  bad({ id: 'p', type: 'plane', mode: 'three', points: [{ kind: 'xyz', x: '0', y: '0', z: '0' }, { kind: 'uzay' }, { kind: 'xyz', x: '0', y: '1', z: '0' }] }, 'bilinmeyen nokta türü');
  bad({ id: 'p', type: 'plane', mode: 'three', points: [{ kind: 'xyz', x: '0', y: '0', z: '0' }] }, 'üçten az nokta');
  bad({ id: 'p', type: 'plane', mode: 'offset', base: base('XY'), offset: '1', flip: 'evet' }, 'flip mantıksal değil');
  bad({ id: 's', type: 'sketch', plane: { kind: 'plane', id: 7 }, points: {}, ents: [] }, 'eskiz düzlem kimliği metin değil');
  bad({ id: 'm', type: 'mirror', source: { kind: 'body', bodies: ['b'] }, plane: 'plane' }, 'ayna: planeId yok');
  ok(validateDoc({ features: [{ id: 'p', type: 'plane', mode: 'angle', base: { kind: 'face', ref: topRef }, axis: { kind: 'edge', ref: backTopEdge }, angle: '1' }] }), 'yüz tabanı + kenar ekseni şemadan geçer');
}

// ------------------------------------------------------------------ hata metinleri
section('hata kodları TR/EN');
for (const c of ['plane.not_found', 'plane.axis_not_parallel', 'plane.axis_not_linear', 'plane.points_collinear']) {
  ok(typeof tr['err.' + c] === 'string' && typeof en['err.' + c] === 'string', 'sözlükte: ' + c);
  setLang('tr', false); const t1 = errText({ code: c, params: {} }); setLang('en', false); const t2 = errText({ code: c, params: {} }); setLang('tr', false);
  ok(t1 && t2 && t1 !== t2 && !t1.includes('plane.') && !t2.includes('plane.'), `errText ${c}: "${t1}" / "${t2}"`);
}

// ------------------------------------------------------------------ T04 (ppp0109): açılı düzlem, Move/Copy yok
section('T04 ppp0109: 45° destek açılı yapı düzleminde');
{
  const ref = fs.readFileSync(path.join(here, 'cad-bench/ref/ppp0109.step'));
  let out = await K.rebuild({ features: [{ id: 'imp', type: 'import', format: 'step', name: 'ppp0109', data: ref.toString('base64') }] });
  const meas = (o) => { let v = 0; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const b of o.bodies) { v += b.volume; for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], b.bbox[0][i]); hi[i] = Math.max(hi[i], b.bbox[1][i]); } } return { v, size: hi.map((h, i) => h - lo[i]) }; };
  const R0 = meas(out);
  ok(Math.abs(R0.v - 113789.264) < 0.01, 'referans STEP hacmi ≈ 113 789,264: ' + R0.v);
  const txt = fs.readFileSync(path.join(here, 'fixtures/ie007/T04-acili-duzlem.mhnk'), 'utf8'); const j = JSON.parse(txt);
  ok(checkEnvelope(j).version === 2 && validateDoc(j.doc, { byteLength: txt.length }) && docFileVersion(j.doc) === 2, 'T04 açılı düzlem belgesi: sürüm 2, şema geçerli');
  ok(!j.doc.features.some((f) => f.type === 'move'), 'T04: Move/Copy özelliği yok');
  const pl = j.doc.features.find((f) => f.type === 'plane');
  ok(pl && pl.mode === 'angle' && String(pl.angle) === '45' && j.doc.features.some((f) => f.type === 'sketch' && f.plane?.kind === 'plane' && f.plane.id === pl.id), 'T04: destek eskizi 45° açı düzleminde');
  out = await K.rebuild(j.doc);
  ok(Object.values(out.status).every((s) => s.ok), 'T04 hatasız: ' + Object.entries(out.status).filter(([, s]) => !s.ok).map(([k, s]) => k + ':' + s.error.code).join(','));
  const M = meas(out);
  rel(M.v, R0.v, 1e-3, 'T04 toplam hacim referansa ±%0,1');
  ok(M.size.every((s, i) => Math.abs(s - R0.size[i]) <= 0.05), `T04 kutu ±0,05 mm: ${M.size.map((x) => x.toFixed(4))} / ${R0.size.map((x) => x.toFixed(4))}`);
  // arayüz belgesiyle (Move/Copy) aynı sonuç
  const ui = meas(await K.rebuild(JSON.parse(fs.readFileSync(path.join(here, 'fixtures/ie007/T04-arayuz.mhnk'), 'utf8')).doc));
  ok(Math.abs(ui.v - M.v) <= 1e-6 * M.v, `açılı düzlem = Move/Copy sonucu: ${M.v} / ${ui.v}`);
}

console.log(`yapi-duzlemi: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
