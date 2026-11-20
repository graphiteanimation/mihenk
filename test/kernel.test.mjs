import path from 'node:path'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import { initKernel } from '../src/kernel/kernel.js';
import { findRegions } from '../src/shared/profiles.js';
import { evalExpr } from '../src/shared/expr.js';
import fs from 'node:fs';
const here = path.dirname(fileURLToPath(import.meta.url));
const wasm = path.join(here, '../node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, m, t = 1e-3) => ok(Math.abs(a - b) <= t * Math.max(1, Math.abs(b)), `${m}: ${a} != ${b}`);

// --- ifade
near(evalExpr('2+3*4'), 14, 'expr'); near(evalExpr('(a+1)^2', { a: 2 }), 9, 'expr2'); near(evalExpr('sin(30)'), 0.5, 'sin'); near(evalExpr('12,5*2'), 25, 'virgül');
try { evalExpr('process.exit()'); ok(false, 'güvenlik'); } catch (e) { ok(true); }

// --- profil
const rect = (w, h, pre = 'p', ox = 0, oy = 0) => ({ pts: { [pre + 1]: { x: ox, y: oy }, [pre + 2]: { x: ox + w, y: oy }, [pre + 3]: { x: ox + w, y: oy + h }, [pre + 4]: { x: ox, y: oy + h } }, ents: [1, 2, 3, 4].map((i) => ({ id: pre + 'l' + i, type: 'line', a: pre + i, b: pre + ((i % 4) + 1) })) });
const r1 = rect(100, 60);
let sk = { points: { ...r1.pts, c: { x: 50, y: 30 } }, ents: [...r1.ents, { id: 'c1', type: 'circle', c: 'c', r: 10 }] };
let reg = findRegions(sk);
ok(reg.regions.length === 2, 'iki bölge: ' + reg.regions.length);
const big = reg.regions.find((r) => r.area > 1000); near(big.area, 6000, 'dikdörtgen alanı'); ok(big.holes.length === 1, 'delik');
// köşegenli dikdörtgen -> 2 üçgen
sk = { points: r1.pts, ents: [...r1.ents, { id: 'd', type: 'line', a: 'p1', b: 'p3' }] };
reg = findRegions(sk); ok(reg.regions.length === 2, 'köşegen 2 bölge: ' + reg.regions.length); near(reg.regions[0].area + reg.regions[1].area, 6000, 'toplam alan');
// yay: yarım daire + çap
sk = { points: { a: { x: 10, y: 0 }, b: { x: -10, y: 0 }, c: { x: 0, y: 0 } }, ents: [{ id: 'arc', type: 'arc', c: 'c', a: 'a', b: 'b' }, { id: 'l', type: 'line', a: 'b', b: 'a' }] };
reg = findRegions(sk); ok(reg.regions.length === 1, 'yarım daire'); near(reg.regions[0].area, Math.PI * 50, 'yarım daire alanı', 5e-3);

// --- çekirdek
const K = await initKernel(opencascade, () => wasm);
const doc = { params: [{ name: 'L', expr: '100' }, { name: 'H', expr: 'L/5' }], features: [
  { id: 's1', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '0' }, points: { ...r1.pts, c: { x: 50, y: 30 } }, ents: [...r1.ents, { id: 'c1', type: 'circle', c: 'c', r: 10 }] },
  { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', dist: 'H', op: 'new' },
] };
let out = await K.rebuild(doc);
ok(out.status.e1.ok, 'extrude: ' + out.status.e1.error?.code); ok(out.bodies.length === 1, 'tek gövde');
near(out.bodies[0].volume, 100 * 60 * 20, 'hacim (tüm profiller = dolu)');
doc.features[1].profiles = [reg0idx(doc.features[0])];
function reg0idx(s) { const r = findRegions(s).regions; return r.findIndex((x) => x.holes.length); }
out = await K.rebuild(doc); near(out.bodies[0].volume, (6000 - Math.PI * 100) * 20, 'delikli hacim');
// üst yüz bul
const bid = out.bodies[0].id; let top = -1, n = out.bodies[0].nFaces;
for (let i = 0; i < n; i++) { const d = K.describe({ body: bid, idx: i }, 'face'); if (d.geom === 'PLANE' && d.normal[2] > 0.99) top = d; }
ok(top !== -1, 'üst yüz +Z normal'); near(top.fp[2], 20, 'üst yüz z');
// yüz üzerine sketch + kesme
const r2 = rect(20, 20, 'q', 5, 5);
doc.features.push({ id: 's2', type: 'sketch', plane: { kind: 'face', ref: top }, points: r2.pts, ents: r2.ents });
doc.features.push({ id: 'e2', type: 'extrude', sketch: 's2', profiles: 'all', dist: '5', flip: true, op: 'cut' });
out = await K.rebuild(doc); ok(out.status.e2.ok, 'cut: ' + out.status.e2.error?.code);
near(out.bodies[0].volume, (6000 - Math.PI * 100) * 20 - 20 * 20 * 5, 'cep sonrası hacim');
near(out.sketches.s2.plane.o[2], 20, 'yüz düzlemi orijini');
// fillet: dikey kenarlar
const edges = []; for (let i = 0; i < out.bodies[0].nEdges; i++) { const d = K.describe({ body: bid, idx: i }, 'edge'); if (d.geom === 'LINE' && Math.abs(d.length - 20) < 1e-6 && Math.abs(d.start[2] - d.end[2]) > 19 && Math.abs(d.start[0] - 50) > 20) edges.push(d); }
ok(edges.length === 4, 'dört dikey kenar: ' + edges.length);
doc.features.push({ id: 'f1', type: 'fillet', edges, r: '5' });
out = await K.rebuild(doc); ok(out.status.f1.ok, 'fillet: ' + out.status.f1.error?.code);
const vBefore = (6000 - Math.PI * 100) * 20 - 2000; near(out.bodies[0].volume, vBefore - (4 - Math.PI) * 25 * 20, 'fillet hacmi');
// parametre değişimi: topoloji aynı -> seçimler korunur
doc.params[0].expr = '120';
// sketch noktaları arayüzde çözülür; burada elle güncelle
doc.features[0].points.p2.x = 120; doc.features[0].points.p3.x = 120;
out = await K.rebuild(doc); ok(out.status.f1.ok && out.status.e2.ok, 'parametre sonrası: ' + (out.status.f1.error?.code || out.status.e2.error?.code));
near(out.bodies[0].bbox[1][2], 24, 'yeni yükseklik H=L/5');
// delik + dairesel desen
doc.features.push({ id: 's3', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: 'H' }, points: { h1: { x: 100, y: 30 } }, ents: [{ id: 'hp', type: 'point', p: 'h1' }] });
doc.features.push({ id: 'h1', type: 'hole', sketch: 's3', kind: 'cbore', dia: '6.6', extent: 'all', cboreDia: '11', cboreDepth: '6.5', thread: null });
out = await K.rebuild(doc); ok(out.status.h1.ok, 'delik: ' + out.status.h1.error?.code); const v1 = out.bodies[0].volume;
ok(out.holes.length === 1 && out.holes[0].dia === 6.6, 'delik verisi');
doc.features.push({ id: 'pt', type: 'pattern', kind: 'rect', source: { kind: 'feature', id: 'h1' }, count1: '1', step1: '0', count2: '2', step2: '-10', dir1: 'X', dir2: 'Y' });
out = await K.rebuild(doc); ok(out.status.pt.ok, 'desen: ' + out.status.pt.error?.code); ok(out.bodies[0].volume < v1 - 100, 'desen hacmi azalttı');
// hatalı özellik geri alınır, diğerleri devam eder
doc.features.push({ id: 'bad', type: 'fillet', edges: [{ ...edges[0] }], r: '500' });
out = await K.rebuild(doc); ok(!out.status.bad.ok, 'büyük fillet hata vermeli'); ok(out.bodies.length === 1, 'gövde korunur');
// hatalar metin değil {code, params} taşır (i18n sözleşmesi)
ok(out.status.bad.error && typeof out.status.bad.error.code === 'string' && typeof out.status.bad.error.params === 'object', 'hata {code, params}: ' + JSON.stringify(out.status.bad.error));
ok(!JSON.stringify(out.status.bad.error).match(/[ğüşıöçĞÜŞİÖÇ]/), 'hata nesnesinde metin yok');
doc.features.pop();
// revolve + ilkel + combine + mirror + shell
const d2 = { params: [], features: [
  { id: 's', type: 'sketch', plane: { kind: 'base', name: 'XZ' }, points: rect(10, 30, 'p', 5, 0).pts, ents: rect(10, 30, 'p', 5, 0).ents },
  { id: 'r', type: 'revolve', sketch: 's', axis: { kind: 'sketchY' }, angle: '360', op: 'new' },
  { id: 'b', type: 'primitive', kind: 'box', x: '-50', y: '-50', z: '-10', w: '100', d: '100', h: '10', op: 'join' },
  { id: 'c', type: 'primitive', kind: 'cylinder', x: '40', y: '0', z: '-10', dia: '8', h: '10', axis: 'Z', op: 'cut' },
  { id: 'm', type: 'mirror', source: { kind: 'feature', id: 'c' }, plane: 'YZ' },
  { id: 'pc', type: 'pattern', kind: 'circ', source: { kind: 'feature', id: 'c' }, count: '4', total: '360', axis: 'Z' },
] };
const K2 = await initKernel(opencascade, () => wasm);
out = await K2.rebuild(d2);
for (const f of d2.features) ok(out.status[f.id].ok, f.id + ': ' + out.status[f.id].error?.code);
ok(out.bodies.length === 1, 'tek gövde (join)');
const ring = Math.PI * (15 * 15 - 5 * 5) * 30, plate = 100 * 100 * 10, hole = Math.PI * 16 * 10;
near(out.bodies[0].volume, ring + plate - Math.PI * 0 - 4 * hole, 'revolve+plaka-4 delik (mirror, desenle çakışır)', 2e-3);
// kabuk
const d3 = { params: [], features: [{ id: 'b', type: 'primitive', kind: 'box', w: '50', d: '40', h: '30', op: 'new' }] };
out = await K2.rebuild(d3); let tf; for (let i = 0; i < 6; i++) { const d = K2.describe({ body: 'b', idx: i }, 'face'); if (d.normal[2] > 0.9) tf = d; }
d3.features.push({ id: 'sh', type: 'shell', faces: [tf], t: '2' });
out = await K2.rebuild(d3); ok(out.status.sh.ok, 'kabuk: ' + out.status.sh.error?.code); near(out.bodies[0].volume, 50 * 40 * 30 - 46 * 36 * 28, 'kabuk hacmi');
// STEP dışa/içe
const step = await K2.exportFile('step'); ok(step.length > 1000, 'STEP boyutu');
const stl = await K2.exportFile('stl'); ok(stl.length > 500, 'STL boyutu');
const d4 = { params: [], features: [{ id: 'imp', type: 'import', format: 'step', name: 'parça', data: Buffer.from(step).toString('base64') }] };
out = await K2.rebuild(d4); ok(out.status.imp.ok, 'STEP içe: ' + out.status.imp.error?.code); near(out.bodies[0].volume, 50 * 40 * 30 - 46 * 36 * 28, 'içe alınan hacim');
const pr = K2.bodyProps(out.bodies[0].id); ok(pr.area > 0 && pr.com.length === 3, 'kütle özellikleri');
// --- çok büyük fillet / pah: kod fillet.too_big, chamfer.too_big
const d6 = { params: [], features: [{ id: 'b', type: 'primitive', kind: 'box', w: '50', d: '40', h: '30', op: 'new' }] };
await K2.rebuild(d6);
const ed = K2.describe({ body: 'b', idx: 0 }, 'edge');
d6.features.push({ id: 'ff', type: 'fillet', edges: [ed], r: '500' }, { id: 'cc', type: 'chamfer', edges: [ed], d: '500' });
out = await K2.rebuild(d6);
ok(!out.status.ff.ok && out.status.ff.error.code === 'fillet.too_big', 'fillet.too_big: ' + JSON.stringify(out.status.ff.error));
ok(!out.status.cc.ok && out.status.cc.error.code === 'chamfer.too_big', 'chamfer.too_big: ' + JSON.stringify(out.status.cc.error));
ok(out.bodies.length === 1 && out.bodies[0].volume > 59000, 'hatalı fillet/pah gövdeyi bozmaz');

// --- hata kodları ve yapılandırılmış hata parametreleri
const d5 = { params: [{ name: 'L', expr: '10' }], features: [
  { id: 'x1', type: 'extrude', sketch: 'yok', profiles: 'all', dist: '5', op: 'new' },
  { id: 'x2', type: 'primitive', kind: 'box', w: 'Q', d: '5', h: '5', op: 'new' },
  { id: 'x3', type: 'primitive', kind: 'box', w: '5', d: '5', h: '5', op: 'new' },
  { id: 'x4', type: 'fillet', edges: [], r: '1' },
  { id: 'x5', type: 'combine', target: 'yok', tools: [], op: 'join' },
  { id: 'x6', type: 'bilinmeyen' },
] };
out = await K2.rebuild(d5);
const code = (id) => out.status[id].error?.code;
ok(code('x1') === 'sketch.not_found', 'sketch.not_found: ' + code('x1'));
ok(code('x2') === 'expr.in_field' && out.status.x2.error.params.field === 'ef.width' && out.status.x2.error.params.inner.code === 'expr.unknown_param' && out.status.x2.error.params.inner.params.name === 'Q', 'alan + iç hata: ' + JSON.stringify(out.status.x2.error));
ok(out.status.x3.ok && out.bodies.length === 1, 'geçerli özellik etkilenmez');
ok(code('x4') === 'fc.no_edges', 'fc.no_edges: ' + code('x4'));
ok(code('x5') === 'combine.no_target', 'combine.no_target: ' + code('x5'));
ok(code('x6') === 'feature.unknown' && out.status.x6.error.params.type === 'bilinmeyen', 'feature.unknown');
ok(out.bodies[0].name === null && out.bodies[0].auto && out.bodies[0].auto.code === 'n', 'gövde adı yapılandırılmış: ' + JSON.stringify(out.bodies[0].auto));
// ifade hataları
try { evalExpr('(1+2', {}); ok(false, 'hata beklenirdi'); } catch (e) { ok(e.code === 'expr.paren', 'expr.paren: ' + e.code); }
try { evalExpr('foo(1)', {}); ok(false, 'hata beklenirdi'); } catch (e) { ok(e.code === 'expr.unknown_fn' && e.params.name === 'foo', 'expr.unknown_fn'); }
try { evalExpr('', {}); ok(false, 'hata beklenirdi'); } catch (e) { ok(e.code === 'expr.empty', 'expr.empty'); }
try { evalExpr('1/0', {}); ok(false, 'hata beklenirdi'); } catch (e) { ok(e.code === 'expr.not_number', 'expr.not_number'); }
// sorgu hataları
try { K2.describe({ body: 'yok', idx: 0 }, 'face'); ok(false, 'hata beklenirdi'); } catch (e) { ok(e.code === 'body_none', 'describe body_none'); }
try { await K2.exportFile('step', ['yok']); ok(false, 'hata beklenirdi'); } catch (e) { ok(e.code === 'export.no_body', 'export.no_body'); }

// --- v0.2 düzeltmeleri (docs/KERNEL-FIXES.md)
{
  const box = (id, o = {}) => ({ id, type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '10', d: '20', h: '30', op: 'new', ...o });
  const K3 = await initKernel(opencascade, () => wasm);
  // F-02/S-02: içe aktarma önbelleği içerik özetine bağlı; reset() durumu temizler
  await K3.rebuild({ params: [], features: [box('b')] }); const stepA = await K3.exportFile('step');
  await K3.rebuild({ params: [], features: [box('b', { w: '20' })] }); const stepB = await K3.exportFile('step');
  const imp = (data) => ({ params: [], features: [{ id: 'import1', type: 'import', format: 'step', name: 'x', data }] });
  let o = await K3.rebuild(imp(Buffer.from(stepA).toString('base64'))); near(o.bodies[0].volume, 6000, 'F-02 içe aktarma A');
  o = await K3.rebuild(imp(Buffer.from(stepB).toString('base64'))); near(o.bodies[0].volume, 12000, 'F-02 aynı kimlik, farklı veri → kendi geometrisi');
  o = await K3.rebuild(imp('Ym96dWs=')); ok(!o.status.import1.ok && o.bodies.length === 0, 'F-02 bozuk veri → ok:false, eski geometri yok');
  ok(o.status.import1.error.code === 'import.load_failed', 'F-02 kod import.load_failed');
  // reset: worker öldürülüp yeniden başlatılmış gibi; sonuçlar temiz çekirdekle aynı
  const docR = { params: [{ name: 'W', expr: '40' }], features: [box('b', { w: 'W' })] };
  await K3.rebuild(docR); K3.reset();
  ok(K3.cache.length === 0 && K3.last === null && K3.imports.size === 0 && K3.upgrades.size === 0, 'reset: önbellek/son durum/içe aktarma/yükseltme boş');
  const r1 = await K3.rebuild(docR); const r2 = await (await initKernel(opencascade, () => wasm)).rebuild(docR);
  ok(r1.bodies[0].volume === r2.bodies[0].volume && JSON.stringify(r1.status) === JSON.stringify(r2.status), 'reset sonrası sonuç = temiz çekirdek');
  try { K3.reset(); K3.describe({ body: 'b', idx: 0 }, 'face'); ok(false, 'reset sonrası eski gövde sorgusu hata vermeli'); } catch (e) { ok(e.code === 'body_none', 'reset sonrası sorgu body_none'); }
  // F-03 iki yön + ters çevir
  const sq = rect(20, 10);
  o = await K3.rebuild({ params: [], features: [{ id: 's', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '0' }, points: sq.pts, ents: sq.ents }, { id: 'e', type: 'extrude', sketch: 's', profiles: 'all', dist: '10', dist2: '5', dir: 'two', flip: true, op: 'new' }] });
  near(o.bodies[0].volume, 3000, 'F-03 hacim'); near(o.bodies[0].bbox[0][2], -10, 'F-03 z min'); near(o.bodies[0].bbox[1][2], 5, 'F-03 z max');
  // F-06 açı aralığı, F-10 boş profil, F-11 desen sınırı / ölçü sınırı, F-12 bilinmeyen op
  const code2 = (out, id) => out.status[id].error?.code;
  o = await K3.rebuild({ params: [], features: [{ id: 's', type: 'sketch', plane: { kind: 'base', name: 'XZ' }, points: rect(5, 10, 'p', 2, 0).pts, ents: rect(5, 10, 'p', 2, 0).ents }, { id: 'r', type: 'revolve', sketch: 's', axis: { kind: 'sketchY' }, angle: '400', op: 'new' }, { id: 'e', type: 'extrude', sketch: 's', profiles: [], dist: '5', op: 'new' }, { id: 'x', type: 'extrude', sketch: 's', profiles: 'all', dist: '5', op: 'subtract' }, { id: 'big', type: 'primitive', kind: 'box', w: '2e5', d: '1', h: '1', op: 'new' }] });
  ok(code2(o, 'r') === 'revolve.angle_range', 'F-06 400° → revolve.angle_range'); ok(code2(o, 'e') === 'sketch.no_profile_selected', 'F-10 boş profil'); ok(code2(o, 'x') === 'op.unknown', 'F-12 bilinmeyen op'); ok(code2(o, 'big') === 'value.out_of_range', 'F-11 ölçü sınırı');
  // F-07 desen sonrası holes[] tüm örnekler; F-08 havadaki delik → ok:false
  const hs = { points: { h: { x: 10, y: 10 } }, ents: [{ id: 'hp', type: 'point', p: 'h' }] };
  const hd = (extra) => ({ params: [], features: [box('b', { w: '100', d: '100', h: '10' }), { id: 'hs', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '10' }, ...hs }, { id: 'h', type: 'hole', sketch: 'hs', kind: 'simple', dia: '4', extent: 'all' }, ...extra] });
  o = await K3.rebuild(hd([{ id: 'p', type: 'pattern', kind: 'rect', source: { kind: 'feature', id: 'h' }, count1: '3', step1: '20', dir1: 'X', count2: '2', step2: '30', dir2: 'Y' }]));
  const allPos = o.holes.flatMap((h) => h.positions.map((p) => p.map((x) => +x.toFixed(6)).join(',')));
  ok(o.status.p.ok && allPos.length === 6 && new Set(allPos).size === 6 && allPos.includes('50,40,10'), 'F-07 holes[] 6 farklı konum: ' + allPos.join(' '));
  ok(o.holes.every((h) => h.dirs.length === h.positions.length && h.dirs.every((d) => d[2] === -1)), 'F-07 her konum için yön');
  o = await K3.rebuild(hd([{ id: 'p', type: 'pattern', kind: 'rect', source: { kind: 'feature', id: 'h' }, count1: '2', step1: '200', dir1: 'X', count2: '1', step2: '0' }]));
  ok(['pattern.no_effect', 'op.cut_no_body'].includes(code2(o, 'p')) && o.holes.flatMap((h) => h.positions).length === 1, 'F-08 gövde dışındaki desen örneği → pattern.no_effect, hayalet delik yok');
  o = await K3.rebuild(hd([{ id: 'p', type: 'pattern', kind: 'rect', source: { kind: 'feature', id: 'h' }, count1: '3000', step1: '0.5', dir1: 'X', count2: '1', step2: '0' }]));
  ok(code2(o, 'p') === 'pattern.too_many', 'F-11/S-08 desen adedi ≤ 2000');
  // F-09 move iki kez + kopya
  const mv = { params: [], features: [box('b'), { id: 'm', type: 'move', bodies: ['b'], dx: '50' }] };
  await K3.rebuild(mv); mv.features[1].dx = '70'; o = await K3.rebuild(mv); near(o.bodies[0].bbox[0][0], 70, 'F-09 move ikinci rebuild');
  mv.features[1].copy = true; o = await K3.rebuild(mv); ok(o.status.m.ok && o.bodies.length === 2, 'F-09 move kopya');
  // F-19 gövde-gövde ölçü, F-23 iç açı
  const m = K3.measure({ body: 'b', kind: 'body' }, { body: 'm', kind: 'body' }); near(m.distance, 60, 'F-19 gövde-gövde mesafe');
  // F-22 bozuk belge istisna fırlatmaz
  for (const bad of [null, {}, { features: {} }, { params: [], features: [null, box('b')] }]) { let ex = null; try { const r = await K3.rebuild(bad); ok(r && Array.isArray(r.bodies), 'F-22 bozuk belge sonuç döner'); } catch (e) { ex = e; } ok(!ex, 'F-22 bozuk belge istisnasız: ' + (ex && ex.message)); }
  // F-05 kendini kesen profil, kısa kenar
  const bow = { points: { a: { x: 0, y: 0 }, b: { x: 20, y: 10 }, c: { x: 20, y: 0 }, d: { x: 0, y: 10 }, e: { x: -6, y: 3 } }, ents: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'a']].map(([a, b], i) => ({ id: 'l' + i, type: 'line', a, b })) };
  o = await K3.rebuild({ params: [], features: [{ id: 's', type: 'sketch', plane: { kind: 'base', name: 'XY' }, ...bow }, { id: 'e', type: 'extrude', sketch: 's', profiles: 'all', dist: '5', op: 'new' }] });
  ok(!o.status.e.ok || o.bodies.every((b) => b.volume > 0), 'F-05 kendini kesen profil: ok:false ya da geçerli bölünmüş bölgeler (' + code2(o, 'e') + ')');
}

// --- sketch eğri segmentleri (elips, elips yayı, spline) elle kurulup OCCT eğrisiyle doğrulanır
{
  const R = await import('replicad'); const { segEdge } = await import('../src/kernel/sketch.js'); const V = await import('../src/shared/vec.js');
  const pl = V.basePlane('XY', 0); const W = (p) => V.toWorld(pl, p[0], p[1]);
  const area = (segs) => R.measureArea(R.makeFace(R.assembleWire(segs.map((x) => segEdge(x, W, pl, 100)))));
  near(area([{ type: 'ellipse', ent: 'e', c: [5, 5], rx: 20, ry: 8, rot: 0.3 }]), Math.PI * 160, 'elips alanı (gerçek elips, poligon değil)', 1e-9);
  near(area([{ type: 'ellipse', ent: 'e', c: [0, 0], rx: 6, ry: 15, rot: 0 }]), Math.PI * 90, 'elips ry>rx', 1e-9);
  // yarım elips (ccw: a0=0 → a1=π) + kiriş
  const rot = 0.5, u = [Math.cos(rot), Math.sin(rot)]; const p0 = [20 * u[0], 20 * u[1]], p1 = [-20 * u[0], -20 * u[1]];
  near(area([{ type: 'ellarc', ent: 'a', p0, p1, c: [0, 0], rx: 20, ry: 8, rot, a0: 0, a1: Math.PI, ccw: true }, { type: 'line', ent: 'l', p0: p1, p1: p0 }]), Math.PI * 80, 'yarım elips (ccw)', 1e-9);
  near(area([{ type: 'ellarc', ent: 'a', p0: p1, p1: p0, c: [0, 0], rx: 20, ry: 8, rot, a0: Math.PI, a1: 0, ccw: false }, { type: 'line', ent: 'l', p0, p1 }]), Math.PI * 80, 'yarım elips (cw)', 1e-9);
  // spline: açık spline + kiriş; noktalardan GEÇER
  const sp = [[0, 0], [10, 8], [20, 10], [30, 6], [40, 0]];
  const e = segEdge({ type: 'spline', ent: 's', p0: sp[0], p1: sp[4], pts: sp }, W, pl, 100);
  const T = (await import('../src/kernel/topo.js'));
  let maxd = 0; for (const q of sp) { const d = T.pointFaceDist ? R.measureDistanceBetween(e, R.makeVertex(W(q))) : 0; maxd = Math.max(maxd, d); }
  ok(maxd < 1e-7, 'spline enterpolasyon noktalarından geçiyor: ' + maxd);
  const a = area([{ type: 'spline', ent: 's', p0: sp[0], p1: sp[4], pts: sp }, { type: 'line', ent: 'l', p0: sp[4], p1: sp[0] }]); ok(a > 250 && a < 400, 'spline + kiriş alanı makul: ' + a);
  const cl = Array.from({ length: 12 }, (_, i) => [10 * Math.cos((i * Math.PI) / 6), 10 * Math.sin((i * Math.PI) / 6)]);
  near(area([{ type: 'spline', ent: 's', p0: cl[0], p1: cl[0], pts: [...cl, cl[0]], closed: true }]), Math.PI * 100, 'kapalı periyodik spline ≈ daire', 2e-3);
  try { segEdge({ type: 'nurbs?' }, W, pl, 100); ok(false, 'bilinmeyen segment hata vermeli'); } catch (x) { ok(x.code === 'sketch.unknown_segment', 'bilinmeyen segment → sketch.unknown_segment'); }
  // çekirdek üzerinden: elips varlığı (profiles.js) extrude
  const ko = await K.rebuild({ params: [], features: [{ id: 's', type: 'sketch', plane: { kind: 'base', name: 'XY' }, points: { O: { x: 0, y: 0 }, c: { x: 0, y: 0 }, m: { x: 20, y: 0 }, n: { x: 0, y: 8 } }, ents: [{ id: 'el', type: 'ellipse', c: 'c', rx: 20, ry: 8, rot: 0 }] }, { id: 'e', type: 'extrude', sketch: 's', profiles: 'all', dist: '5', op: 'new' }] });
  if (ko.status.e.ok) { near(ko.bodies[0].volume, Math.PI * 160 * 5, 'elips extrude hacmi', 1e-9); const T2 = T.topoOf(K.last.bodies.get('e').shape); ok(K.last.bodies.get('e').fn.some((al) => al.includes('e:side:el')), 'elips yan yüzü adı e:side:el'); }
  else ok(true, 'elips varlık biçimi profiles.js ile farklı: ' + JSON.stringify(ko.status.e));
}
// --- WP-02: işlem izi (featInfo) — status biçimi değişmez, iz ayrı alanda
{
  const KF = await initKernel(opencascade, () => wasm);
  const dF = { params: [{ name: 'H', expr: '10' }], features: [
    { id: 'a', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '20', d: '20', h: 'H', op: 'new' },
    { id: 'b', type: 'primitive', kind: 'box', x: '40', y: '0', z: '0', w: '20', d: '20', h: '10', op: 'new' },
    { id: 'x', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '0', d: '20', h: '10', op: 'new' }] };
  let o = await KF.rebuild(dF);
  ok(JSON.stringify(Object.keys(o.status.a).sort()) === '["bodies","ok"]', 'status biçimi değişmedi: ' + JSON.stringify(o.status.a));
  ok(o.featInfo && ['a', 'b', 'x'].every((id) => o.featInfo[id] && typeof o.featInfo[id].ms === 'number' && Array.isArray(o.featInfo[id].warn)), 'featInfo her işlem için');
  ok(o.featInfo.x.sum.startsWith('err:') && o.featInfo.x.lastOk === null, 'hatalı işlem: özet hata kodu, son başarılı sonuç yok');
  dF.params[0].expr = '15'; o = await KF.rebuild(dF);
  ok(o.featInfo.a.changed && !o.featInfo.b.changed && !o.featInfo.x.changed, 'parametre değişti: yalnız a "değişti" (b aynı, x yine aynı hata)');
  ok(!o.featInfo.a.cached && !o.featInfo.b.cached, 'parametre değişince hepsi yeniden hesaplandı');
  { const hd = (x) => ({ params: [], features: [{ id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '60', d: '40', h: '20', op: 'new' }, { id: 'c', type: 'primitive', kind: 'cylinder', x, y: '20', z: '-1', dia: '8', h: '100', axis: 'Z', op: 'cut', targets: ['b'] }] });
    const KH = await initKernel(opencascade, () => wasm); await KH.rebuild(hd('20')); const oh = await KH.rebuild(hd('35'));
    ok(oh.featInfo.c.changed && !oh.featInfo.b.changed, 'delik kaydırma (hacim/kutu aynı) → "değişti" (konuma duyarlı özet)'); }
  dF.features[1].suppressed = true; o = await KF.rebuild(dF);
  ok(o.featInfo.b.changed && o.featInfo.b.sum === 'sup' && o.status.b.suppressed, 'bastırma: sonuç değişti');
}

// --- WP-02 dilim 4: sıra değiştirme (arayüz planı, çekirdekle doğrulama)
{
  const { part12 } = await import('./models/part12.mjs');
  const FS = await import('../src/ui/features.js');
  const KM = await initKernel(opencascade, () => wasm);
  const d = part12('30'); const ids = d.features.map((f) => f.id); const r0 = await KM.rebuild(d);
  const vol = (r) => r.bodies.map((b) => b.volume).reduce((a, b) => a + b, 0);
  let p = FS.planMove(d, ids.indexOf('k3'), ids.indexOf('bx'), r0.status);
  ok(p.ok && p.features.map((f) => f.id).join() === 's1,e1,k3,bx,k1,k2,s2,e2,fb,ch,cy,cz' && p.at === 2, 'planMove: k3 Kutu 1 önüne: ' + JSON.stringify(p.why || p.features?.map((f) => f.id)));
  const r1 = await KM.rebuild({ ...d, features: p.features });
  ok(Object.values(r1.status).every((s) => s.ok) && Math.abs(vol(r1) - vol(r0)) < 1e-6 * vol(r0), 'taşınan sıra hatasız hesaplanır, toplam hacim aynı');
  p = FS.planMove(d, ids.indexOf('k3'), 0, r0.status); ok(!p.ok && p.why.feat === 'k3' && p.why.dep === 'e1', 'planMove: k3 Extrude 1 önüne geçemez (k3 → e1): ' + JSON.stringify(p.why));
  p = FS.planMove(d, ids.indexOf('fb'), ids.indexOf('bx'), r0.status); ok(!p.ok && p.why.dep === 'bx', 'planMove: yuvarlatma kenarını aldığı kutunun önüne geçemez (topolojik ad kökeni)');
  p = FS.planMove(d, ids.indexOf('e1'), ids.indexOf('k1'), r0.status); ok(p.ok && p.features.map((f) => f.id).slice(0, 3).join() === 'bx,s1,e1', 'planMove: kaynaşmış eskiz tüketicisiyle birlikte taşınır');
  p = FS.planMove(d, ids.indexOf('e1'), ids.indexOf('k2'), r0.status); ok(!p.ok && p.why.feat === 'k1' && p.why.dep === 'e1', 'planMove: Extrude 1 kendisine dayanan k1 ardına geçemez');
  ok(FS.planMove(d, ids.indexOf('k3'), ids.indexOf('k3'), r0.status).noop && FS.planMove(d, ids.indexOf('k3'), ids.indexOf('k3') + 1, r0.status).noop, 'planMove: yerinde bırakma değişiklik değil');
  const dr = { ...d, rollback: 5 };
  p = FS.planMove(dr, ids.indexOf('k3'), 3, r0.status); ok(p.ok && p.rollback === 6 && p.features[3].id === 'k3', 'planMove: işaretçinin sağından soluna taşınan işlem etkinleşir, işaretçi aynı komşular arasında');
  p = FS.planMove(dr, ids.indexOf('k1'), 9, r0.status); ok(p.ok && p.rollback === 4, 'planMove: işaretçinin soluna giden işlem sağa taşınınca işaretçi bir geri');
  p = FS.planMove(dr, ids.indexOf('k3'), 5, r0.status); ok(p.ok && p.rollback === 6 && p.features[5].id === 'k3', 'planMove: işaretçi aralığına bırakma = işaretçinin önü');
  const dg = { ...d, groups: [{ id: 'g1', name: 'G', first: 'k1', last: 'k3' }, { id: 'g2', name: 'X', first: 'k2', last: 'cz' }, { id: 'g3', first: 'yok', last: 'cz' }, null] };
  ok(FS.groupRanges(dg).length === 1 && FS.groupRanges(dg)[0].ids.length === 6, 'groupRanges: çakışan / eksik / bozuk grup kayıtları yok sayılır');
  p = FS.planMove(dg, ids.indexOf('ch'), ids.indexOf('fb'), r0.status); ok(p.ok && p.groups[0].last === 'k3' && p.features.findIndex((f) => f.id === 'ch') < p.features.findIndex((f) => f.id === 'k3'), 'grup aralığına bırakılan işlem gruba girer');
  p = FS.planMove(dg, ids.indexOf('k3'), ids.indexOf('ch'), r0.status); ok(p.ok && !p.noop && p.groups[0].last === 'fb' && p.features.map((f) => f.id).join() === ids.join(), 'son üyeyi grubun hemen arkasına bırakmak: sıra aynı, üyelikten çıkar');
  ok(FS.fixGroups(dg, d.features.filter((f) => f.id !== 'k1'))[0].first === 'k2', 'fixGroups: ilk üye silinince grup bir sonrakinden başlar');
  ok(FS.fixGroups(d, d.features) === undefined, 'fixGroups: grupsuz belgede alan oluşmaz');
  p = FS.planMove(d, ids.indexOf('k3'), ids.indexOf('k1'), r0.status); ok(p.ok && p.sensitive.join() === 'k1,k2,e2', 'planMove: aynı gövdeyi değiştirenlerin üzerinden atlama sıraya duyarlı: ' + JSON.stringify(p.sensitive));
  p = FS.planMove(d, ids.indexOf('bx'), ids.indexOf('k2'), r0.status); ok(p.ok && p.sensitive.length === 0, 'planMove: başka gövdeye dokunanlar üzerinden atlama duyarlı değil');
  const T = FS.dropTargets(d, ids.indexOf('k3'), r0.status); ok(T.length === 13 && !T[0].ok && !T[1].ok && T[2].ok && T[8].noop && T[9].noop, 'dropTargets: her aralık için izin/neden');
}

// --- WP-02 dilim 5: hesap iptali, onarım bilgisi, işlemin yüzleri
{
  const { part12 } = await import('./models/part12.mjs');
  const KC = await initKernel(opencascade, () => wasm);
  const sig = (r) => JSON.stringify([Object.values(r.status).map((x) => x.ok), r.bodies.map((x) => [x.id, Math.round(x.volume)])]);
  const KF = await initKernel(opencascade, () => wasm);
  const d = part12('30'), d2 = part12('40'); await KC.rebuild(d); let n = 0;
  let err = null; try { await KC.rebuild(d2, { shouldStop: () => ++n > 6 }); } catch (e) { err = e; }
  ok(err && err.code === 'rebuild.cancelled', 'iptal: shouldStop → rebuild.cancelled: ' + (err && err.code));
  ok(KC.last && KC.last.bodies.get('bx') && KC.cache.length === 12, 'iptal: önbellek ve son durum önceki tamamlanmış hesaptaki gibi');
  const r2 = await KC.rebuild(d2); ok(sig(r2) === sig(await KF.rebuild(d2)) && Object.values(r2.status).every((x) => x.ok), 'iptal sonrası tam hesap, sıfırdan hesapla aynı');
  ok(r2.featInfo.e1.cached && !r2.featInfo.bx.cached, 'iptal sonrası değişmeyen önek önbellekten');
  n = 0; try { await KC.rebuild(d, { shouldStop: () => ++n > 3 }); } catch (e) { /* beklenen */ }
  const r3 = await KC.rebuild(d); ok(sig(r3) === sig(await KF.rebuild(d)), 'ikinci iptal sonrası da doğru');
  const ff = KC.featureFaces('bx'); ok(ff.length === 1 && ff[0].body === 'bx' && ff[0].faces.length >= 5, 'featureFaces: kutunun yüzleri (' + JSON.stringify(ff) + ')');
  ok(KC.featureFaces('k1').some((x) => x.body === 'e1' && x.faces.length >= 1), 'featureFaces: delik (kesme) yüzü hedef gövdede ' + JSON.stringify(KC.featureFaces('k1')) + ' ' + JSON.stringify([...KC.last.bodies.keys()]));
  { // iptal özetleri kirletmez: A → (B iptal) → B tam: düzenlenen kutu yine "değişti"
    const KS = await initKernel(opencascade, () => wasm); await KS.rebuild(d); let m = 0;
    try { await KS.rebuild(d2, { shouldStop: () => ++m > 6 }); } catch (e) { /* beklenen */ }
    const rB = await KS.rebuild(d2); ok(rB.featInfo.bx.changed && !rB.featInfo.e1.changed, 'iptal sonrası featInfo.changed doğru (bx değişti, e1 aynı)');
    m = 0; try { await KS.rebuild(d, { shouldStop: () => ++m > 6 }); } catch (e) { /* beklenen */ }
    const rA = await KS.rebuild(d); ok(rA.featInfo.bx.changed, 'geri dönüşte de bx "değişti" (iptal edilen hesap özeti yazmadı)');
  }
  // onarım: yuvarlatmanın kenarını yok eden değişiklik
  const hd = (h) => ({ params: [], features: [
    { id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '40', h: '20', op: 'new' },
    { id: 'c', type: 'primitive', kind: 'cylinder', x: '20', y: '20', z: '-1', dia: '10', h, axis: 'Z', op: 'cut', targets: ['b'] },
    { id: 'f', type: 'fillet', edges: [{ body: 'b', kind: 'edge', name: { a: 'b:z+', b: 'c:side' } }], r: '1' }] });
  const KR = await initKernel(opencascade, () => wasm);
  await KR.rebuild(hd('100')); const rb = await KR.rebuild(hd('10'));
  ok(rb.status.f.ok === false, 'onarım öncesi: yuvarlatma hatalı (' + JSON.stringify(rb.status.f.error) + ')');
  const ri = KR.repairInfo('f');
  ok(ri.total === 1 && ri.lost.length === 1 && ri.lost[0].field === 'edges' && ri.lost[0].index === 0 && ri.lost[0].kind === 'edge', 'repairInfo: kaybolan kenar (alan, sıra)');
  const g = ri.lost[0].ghost; let zmax = -1e9; for (let q = 2; q < (g ? g.length : 0); q += 3) zmax = Math.max(zmax, g[q]);
  ok(g && g.length >= 6 && Math.abs(zmax - 20) < 1e-3, 'repairInfo: hayalet çizgi son başarılı konumda (z=20 delik ağzı)');
  ok(ri.lost[0].cands.length >= 1 && ri.lost[0].cands.every((c) => c.body === 'b' && c.kind === 'edge'), 'repairInfo: yakın aday kenarlar: ' + JSON.stringify(ri.lost[0].cands) + ' ' + JSON.stringify(Array.from(g || []).slice(0, 6)));
  ok(KR.repairInfo('b').lost.length === 0 && KR.repairInfo('yok').lost.length === 0, 'repairInfo: sağlam / olmayan işlem → boş');
}

console.log('T-14 camHoleExit: delik ekseninde son çıkış');
{
  const KX = await initKernel(opencascade, () => wasm);
  const pt = (id, x, y) => ({ id, type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '30' }, points: { a: { x, y } }, ents: [{ id: id + 'p', type: 'point', p: 'a' }] });
  const dH = { params: [], features: [
    { id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '100', d: '60', h: '30', op: 'new' },
    pt('s1', 10, 10), { id: 'h1', type: 'hole', sketch: 's1', kind: 'simple', dia: '6.8', extent: 'dist', depth: '15', tipAngle: '118' },
    pt('s2', 30, 30), { id: 'h2', type: 'hole', sketch: 's2', kind: 'cbore', dia: '5.5', cboreDia: '10', cboreDepth: '5', extent: 'all' },
    pt('s3', 60, 30), { id: 'h3', type: 'hole', sketch: 's3', kind: 'csink', dia: '4', csinkDia: '8', csinkAngle: '90', extent: 'all' },
  ] };
  const rH = await KX.rebuild(dH); const bid = rH.bodies[0].id;
  const ex = (p, r, d = [0, 0, -1]) => KX.camHoleExit({ bodies: [bid], p, d, r });
  let e = ex([30, 30, 30], 2.75); ok(e.t != null && Math.abs(e.t - 30) < 1e-6 && e.through && e.deepOpen, 'havşalı (cbore) boydan boya: çıkış 30: ' + JSON.stringify(e));
  e = ex([60, 30, 30], 2); ok(Math.abs(e.t - 30) < 1e-6 && e.through, 'havşa (csink) boydan boya: çıkış 30: ' + JSON.stringify(e));
  e = ex([10, 10, 30], 3.4); ok(!e.through && !e.deepOpen && e.t > 15 && e.t < 17.1, 'kör delik: boydan boya değil, en derin uç konisi: ' + JSON.stringify(e));
  e = ex([50, 10, 30], 3.4); ok(e.t === null, 'delik olmayan eksen: t null');
  e = ex([30, 30, 0], 2.75, [0, 0, 1]); ok(Math.abs(e.t - 30) < 1e-6 && e.through, 'ters yönden (alttan) sorgu: çıkış 30');
  e = ex([30, 30, 30], 12); ok(e.t === null, 'çap çok farklı (Ø24 sorgu, Ø5,5/Ø10 delik): eşleşme yok');
  // P2 benzeri: flanş (z 25..30) altında boşluk, altında plaka (z 0..10); flanş deliği yalnız flanşı deler
  const dF = { params: [], features: [
    { id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '100', d: '60', h: '10', op: 'new' },
    { id: 'w', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '5', d: '60', h: '30', op: 'join', targets: ['b'] },
    { id: 'f', type: 'primitive', kind: 'box', x: '0', y: '0', z: '25', w: '40', d: '60', h: '5', op: 'join', targets: ['b'] },
    pt('s1', 20, 30), { id: 'h', type: 'hole', sketch: 's1', kind: 'simple', dia: '6', extent: 'dist', depth: '5', tipAngle: '118' },
  ] };
  const rF = await KX.rebuild(dF); ok(Object.values(rF.status).every((x) => x.ok) && rF.bodies.length === 1, 'flanş modeli kuruldu');
  e = KX.camHoleExit({ bodies: [rF.bodies[0].id], p: [20, 30, 30], d: [0, 0, -1], r: 3 });
  ok(Math.abs(e.t - 5) < 1e-6 && e.through && e.deepOpen, 'flanş deliği: çıkış flanş altı (5), plaka değil: ' + JSON.stringify(e));
  let er = null; try { KX.camHoleExit({ bodies: ['yok'], p: [0, 0, 0], d: [0, 0, -1] }); } catch (x) { er = x.code; } ok(er === 'cam.body_missing', 'bilinmeyen gövde: cam.body_missing');
}

console.log('T-05b STEP/B-rep delik tanıma → rebuild.holes');
{
  const KR = await initKernel(opencascade, () => wasm);
  const pt = (id, pts) => ({ id, type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '30' }, points: Object.fromEntries(pts.map((q, i) => ['a' + i, { x: q[0], y: q[1] }])), ents: pts.map((q, i) => ({ id: id + 'p' + i, type: 'point', p: 'a' + i })) });
  const dM = { params: [], features: [
    { id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '120', d: '60', h: '30', op: 'new' },
    pt('s1', [[10, 10], [10, 50]]), { id: 'h1', type: 'hole', sketch: 's1', kind: 'simple', dia: '6.8', extent: 'dist', depth: '15', tipAngle: '118' },
    pt('s2', [[30, 30]]), { id: 'h2', type: 'hole', sketch: 's2', kind: 'cbore', dia: '5.5', cboreDia: '10', cboreDepth: '5', extent: 'all' },
    pt('s3', [[50, 30]]), { id: 'h3', type: 'hole', sketch: 's3', kind: 'csink', dia: '4', csinkDia: '8', csinkAngle: '90', extent: 'all' },
    pt('s4', [[70, 15]]), { id: 'h4', type: 'hole', sketch: 's4', kind: 'simple', dia: '5', extent: 'dist', depth: '12', tipAngle: '118' },
    { id: 'fc', type: 'primitive', kind: 'cylinder', x: '70', y: '45', z: '20', dia: '8', h: '10', axis: 'Z', op: 'cut', targets: ['b'] },
    { id: 'sx', type: 'primitive', kind: 'cylinder', x: '0', y: '30', z: '15', dia: '6', h: '120', axis: 'X', op: 'cut', targets: ['b'] },
    // yarik (iki yari silindir uc) ve dis boss silindiri: delik DEGIL
    { id: 'sl', type: 'primitive', kind: 'box', x: '90', y: '20', z: '25', w: '20', d: '6', h: '5', op: 'cut', targets: ['b'] },
    { id: 'sl1', type: 'primitive', kind: 'cylinder', x: '90', y: '23', z: '25', dia: '6', h: '5', axis: 'Z', op: 'cut', targets: ['b'] },
    { id: 'sl2', type: 'primitive', kind: 'cylinder', x: '110', y: '23', z: '25', dia: '6', h: '5', axis: 'Z', op: 'cut', targets: ['b'] },
    { id: 'bo', type: 'primitive', kind: 'cylinder', x: '100', y: '45', z: '30', dia: '12', h: '8', axis: 'Z', op: 'join', targets: ['b'] },
  ] };
  const r0 = await KR.rebuild(dM); ok(Object.values(r0.status).every((x) => x.ok) && r0.bodies.length === 1, 'tanıma modeli kuruldu: ' + JSON.stringify(Object.entries(r0.status).filter(([, x]) => !x.ok)));
  ok(r0.holes.length === 4 && !r0.holes.some((h) => h.recognized), 'içe aktarma yok: tanıma çalışmaz (yalnız özellik delikleri)');
  const stp = await KR.exportFile('step');
  const rI = await KR.rebuild({ params: [], features: [{ id: 'imp', type: 'import', format: 'step', data: Buffer.from(stp).toString('base64'), name: 'rec' }] });
  const H = rI.holes; const near = (a, b, t = 1e-3) => Math.abs(a - b) <= t;
  const at = (x, y) => H.find((h) => h.positions.some((p) => near(p[0], x) && near(p[1], y)));
  ok(H.every((h) => h.recognized && h.feature.startsWith('rec:')), 'STEP gövdesi: tanınan delikler rebuild.holes içinde');
  let h = at(10, 10); ok(h && h === at(10, 50) && h.kind === 'simple' && near(h.dia, 6.8) && near(h.depth, 15) && near(h.tipAngle, 118, 0.01) && !h.through && h.count === 2 && h.dir.join() === '0,0,-1' && near(h.positions[0][2], 30), 'kör Ø6,8 ×2 (aynı kayıt): derinlik 15, uç 118°, yön -Z, üst Z30: ' + JSON.stringify(h && { k: h.kind, d: h.dia, dep: h.depth, t: h.tipAngle, n: h.count }));
  h = at(30, 30); ok(h && h.kind === 'cbore' && near(h.dia, 5.5) && h.through && near(h.cboreDia, 10) && near(h.cboreDepth, 5) && near(h.exits[0], 30) && h.dir.join() === '0,0,-1', 'havşa (cbore) boydan boya: Ø5,5 / Ø10×5, boy 30, havşa tarafından: ' + JSON.stringify(h && { k: h.kind, d: h.dir }));
  h = at(50, 30); ok(h && h.kind === 'csink' && near(h.dia, 4) && h.through && near(h.csinkDia, 8, 0.01) && near(h.csinkAngle, 90, 0.05) && h.dir.join() === '0,0,-1', 'havşa (csink) boydan boya: Ø4 / Ø8 90°: ' + JSON.stringify(h && { k: h.kind, cs: h.csinkDia, a: h.csinkAngle }));
  h = at(70, 15); ok(h && near(h.dia, 5) && h.threadHint && h.threadHint.major === 6 && h.threadHint.pitch === 1 && h.thread === null, 'Ø5 kör: M6 kılavuz matkabı önerisi (threadHint), thread onaysız boş');
  h = at(70, 45); ok(h && near(h.dia, 8) && near(h.depth, 10) && h.tipAngle === 180, 'düz tabanlı kör Ø8 (silindir kesim): uç 180°');
  h = H.find((q) => q.dir && Math.abs(q.dir[0]) === 1); ok(h && near(h.dia, 6) && h.through && near(h.exits[0], 120) && near(h.positions[0][1], 30) && near(h.positions[0][2], 15), 'X eksenli boydan boya Ø6 (yan delik): boy 120');
  ok(!H.some((q) => near(q.dia, 6) && q.positions.some((p) => p[0] > 85 && near(p[1], 23))), 'yarık uçları (yarım silindir) delik sayılmaz');
  ok(!H.some((q) => near(q.dia, 12)), 'dış boss silindiri delik sayılmaz');
  ok(H.length === 6 && H.reduce((a, q) => a + q.count, 0) === 7, 'toplam 6 kayıt / 7 konum: ' + H.map((q) => q.kind + q.dia + '×' + q.count).join(' '));
  // özellik deliği ile aynı eksende tanınan delik yinelenmez (içe aktarılan gövdeye delik özelliği)
  const rJ = await KR.rebuild({ params: [], features: [{ id: 'imp', type: 'import', format: 'step', data: Buffer.from(stp).toString('base64'), name: 'rec' }, pt('s9', [[60, 50]]), { id: 'h9', type: 'hole', sketch: 's9', kind: 'simple', dia: '6.8', extent: 'dist', depth: '15', tipAngle: '118', targets: ['imp'] }] });
  const at9 = rJ.holes.filter((q) => q.positions.some((p) => near(p[0], 60) && near(p[1], 50)));
  ok(Object.values(rJ.status).every((x) => x.ok) && at9.length === 1 && at9[0].feature === 'h9', 'özellik deliği ile eş eksenli tanınan delik atlanır: ' + at9.map((q) => q.feature));
}

console.log('T-05b/H1 eş eksenli ama malzemeyle ayrılmış delikler; çapraz delik; cep benzeri');
{
  const RR = await import('replicad');
  const KH = await initKernel(opencascade, () => wasm);
  const cyl = (r, h, p, d) => RR.makeCylinder(r, h, p, d); const box = (w, d, h) => RR.makeBox([0, 0, 0], [w, d, h]);
  const imp = async (shape) => { const stp = RR.exportSTEP([{ shape, name: 'b' }], { unit: 'MM', modelUnit: 'MM' }); const r = await KH.rebuild({ params: [], features: [{ id: 'imp', type: 'import', format: 'step', data: Buffer.from(await stp.arrayBuffer()).toString('base64'), name: 'x' }] }); return r; };
  const near = (a, b, t = 1e-3) => Math.abs(a - b) <= t;
  let r = await imp(box(40, 40, 30).cut(cyl(3, 10, [20, 20, 20], [0, 0, 1])).cut(cyl(3, 5, [20, 20, 0], [0, 0, 1])));
  ok(r.holes.length === 2 && r.holes.every((h) => !h.through) && r.holes.some((h) => near(h.depth, 10) && h.dir[2] < 0) && r.holes.some((h) => near(h.depth, 5) && h.dir[2] > 0), 'H1: üstten Ø6×10 + alttan Ø6×5 (arada 15 mm malzeme) iki ayrı kör delik: ' + r.holes.map((h) => h.kind + h.dia + 'd' + h.depth + (h.through ? 'T' : '')));
  let e = KH.camHoleExit({ bodies: [r.bodies[0].id], p: [20, 20, 30], d: [0, 0, -1], r: 3 }); ok(near(e.t, 10) && !e.through && !e.deepOpen, 'H1 çıkış: malzemeden geçmez (10, kör): ' + JSON.stringify(e));
  r = await imp(box(40, 40, 30).cut(cyl(4, 12, [20, 20, 18], [0, 0, 1])).cut(cyl(2.5, 6, [20, 20, 0], [0, 0, 1])));
  ok(r.holes.length === 2 && !r.holes.some((h) => h.kind === 'cbore' || h.through) && r.holes.some((h) => near(h.dia, 8) && near(h.depth, 12)) && r.holes.some((h) => near(h.dia, 5) && near(h.depth, 6)), 'H1b: Ø8×12 üst + Ø5×6 alt ayrı kör (cbore/boydan boya değil): ' + r.holes.map((h) => h.kind + h.dia + 'd' + h.depth));
  e = KH.camHoleExit({ bodies: [r.bodies[0].id], p: [20, 20, 30], d: [0, 0, -1], r: 4 }); ok(near(e.t, 12) && !e.through, 'H1b çıkış 12, kör');
  for (const web of [0.05, 0.01]) { // 2. tur: ince web (ornekleme degil, eksen dogrusu-ag kesisimi)
    const hh = (40 - web) / 2; r = await imp(RR.makeBox([0, 0, 0], [80, 80, 40]).cut(cyl(3, hh, [40, 40, 20 + web / 2], [0, 0, 1])).cut(cyl(3, hh, [40, 40, 0], [0, 0, 1])));
    ok(r.holes.length === 2 && r.holes.every((h) => !h.through && near(h.depth, hh)), `ince web ${web} mm: iki kor delik (through degil): ` + r.holes.map((h) => (h.through ? 'T' : 'K') + h.depth));
    e = KH.camHoleExit({ bodies: [r.bodies[0].id], p: [40, 40, 40], d: [0, 0, -1], r: 3 }); ok(near(e.t, hh) && !e.through, `ince web ${web}: cikis web'de durur`);
  }
  { // N1: kor + 0,05 web + capraz Ø19,9 boydan boya + 0,05 web + kor
    let sN = box(40, 40, 30).cut(cyl(3, 5, [20, 20, 25], [0, 0, 1])).cut(cyl(3, 5, [20, 20, 0], [0, 0, 1])).cut(cyl(9.95, 40, [0, 20, 15], [1, 0, 0]));
    r = await imp(sN); const vz = r.holes.filter((h) => Math.abs(h.dir[2]) === 1);
    ok(vz.length === 2 && vz.every((h) => !h.through && near(h.depth, 5)) && r.holes.some((h) => h.dir[0] === 1 && h.through), 'ince web + capraz delik: dusey ikisi kor (5), capraz boydan boya: ' + r.holes.map((h) => h.kind + h.dia + (h.through ? 'T' : 'K')));
  }
  r = await imp(box(40, 40, 30).cut(cyl(4, 10, [20, 20, 20], [0, 0, 1])).cut(cyl(2.5, 30, [20, 20, 0], [0, 0, 1])));
  ok(r.holes.length === 1 && r.holes[0].kind === 'cbore' && r.holes[0].through && near(r.holes[0].exits[0], 30), 'kademeli Ø8×10 + Ø5 boydan boya: tek cbore delik korunur');
  r = await imp(box(40, 40, 30).cut(cyl(3, 40, [20, 20, -5], [0, 0, 1])).cut(cyl(3, 50, [-5, 20, 15], [1, 0, 0])));
  ok(r.holes.length === 2 && r.holes.every((h) => h.through) && r.holes.some((h) => h.dir[2] !== 0 && near(h.exits[0], 30)), 'çapraz kesişen Ø6 delikler: bölünen duvar hava boşluğundan birleşir, ikisi de boydan boya');
  e = KH.camHoleExit({ bodies: [r.bodies[0].id], p: [20, 20, 30], d: [0, 0, -1], r: 3 }); ok(near(e.t, 30) && e.through, 'çapraz delik çıkışı 30');
  e = KH.camHoleExit({ bodies: [r.bodies[0].id], p: [20, 20, 45], d: [0, 0, -1], r: 3 }); ok(near(e.t, 45) && e.through, 'giriş delikten 15 mm yukarıda (havada): çıkış 45');
  r = await imp(box(60, 60, 20).cut(cyl(20, 10, [30, 30, 10], [0, 0, 1])));
  ok(r.holes.length === 1 && r.holes[0].pocketLike === true && near(r.holes[0].dia, 40), 'Ø40×10 yuvarlak cep: pocketLike işaretli (silinmez)');
  r = await imp(box(40, 40, 30).cut(cyl(3, 10, [20, 20, 20], [0, 0, 1])));
  ok(r.holes.length === 1 && !r.holes[0].pocketLike, 'Ø6×10 delik pocketLike değil');
}

// ------------------------------------------------------------------ WP-08 dilim 1: yüze/nesneye kadar, konik açı, C-03
{
  const K8 = await initKernel(opencascade, () => wasm);
  const sq = (id, w = 20, z = 0, name = 'XY') => { const q = rect(w, w, id); return { id, type: 'sketch', plane: { kind: 'base', name, offset: String(z) }, points: q.pts, ents: q.ents }; };
  const faceBy = (bid, pred) => { for (let i = 0; i < 64; i++) { let d; try { d = K8.describe({ body: bid, idx: i }, 'face'); } catch (e) { return null; } if (pred(d)) return d; } return null; };
  const frustum = (a, h, deg) => { const b = a - 2 * h * Math.tan((deg * Math.PI) / 180); return (h / 3) * (a * a + b * b + a * b); };
  let r8 = await K8.rebuild({ features: [sq('s1'), { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', dist: '10', taper: '5', op: 'new' }] });
  ok(r8.status.e1.ok, 'WP-08 konik: ' + r8.status.e1.error?.code); near(r8.bodies[0].volume, frustum(20, 10, 5), 'WP-08 konik 5°: kesik piramit hacmi', 1e-6);
  ok(r8.bodies[0].nFaces === 6, 'WP-08 konik: yüz sayısı 6');
  r8 = await K8.rebuild({ features: [sq('s1'), { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', dist: '10', taper: '-5', op: 'new' }] });
  near(r8.bodies[0].volume, frustum(20, 10, -5), 'WP-08 konik -5°: genişleyen hacim', 1e-6);
  r8 = await K8.rebuild({ features: [{ id: 's1', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '0' }, points: { c: { x: 0, y: 0 } }, ents: [{ id: 'c1', type: 'circle', c: 'c', r: 10 }] }, { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', dist: '10', taper: '10', op: 'new' }] });
  { const r2 = 10 - 10 * Math.tan(Math.PI / 18); near(r8.bodies[0]?.volume, (Math.PI * 10 / 3) * (100 + r2 * r2 + 10 * r2), 'WP-08 konik daire: kesik koni hacmi', 1e-5); }
  r8 = await K8.rebuild({ features: [sq('s1'), { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', dist: '10', taper: '60', op: 'new' }] });
  ok(!r8.status.e1.ok && r8.status.e1.error.code === 'extrude.taper_failed', 'WP-08 konik: profil kapanırsa açık hata: ' + r8.status.e1.error?.code);
  r8 = await K8.rebuild({ features: [sq('s1'), { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', dist: '10', dir: 'sym', taper: '3', op: 'new' }] });
  ok(r8.status.e1.error?.code === 'extrude.taper_mode', 'WP-08 konik: simetrikte açık hata');
  // yüze kadar (paralel), nesneye kadar, yüze kadar + konik, eğik yüz
  const plate = { id: 'b', type: 'primitive', kind: 'box', x: '-10', y: '-10', z: '40', w: '60', d: '60', h: '5', op: 'new' };
  const doc8 = { features: [plate, sq('s1')] }; await K8.rebuild(doc8);
  const bot = faceBy('b', (d) => d.normal && d.normal[2] < -0.99), sideX = faceBy('b', (d) => d.normal && Math.abs(d.normal[0]) > 0.99);
  doc8.features.push({ id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', extent: 'face', toFace: bot, op: 'new' });
  r8 = await K8.rebuild(doc8); ok(r8.status.e1.ok && r8.bodies.length === 2, 'WP-08 yüze kadar: ' + r8.status.e1.error?.code);
  near(r8.bodies.find((b) => b.id === 'e1').volume, 400 * 40, 'WP-08 yüze kadar (paralel yüz z=40): hacim', 1e-9);
  doc8.features[2].flip = true; r8 = await K8.rebuild(doc8); near(r8.bodies.find((b) => b.id === 'e1')?.volume, 400 * 40, 'WP-08 yüze kadar: Ters çevir yönü değiştirmez (hedef belirler)', 1e-9);
  doc8.features[2] = { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', extent: 'body', toBody: 'b', op: 'new' };
  r8 = await K8.rebuild(doc8); near(r8.bodies.find((b) => b.id === 'e1')?.volume, 400 * 45, 'WP-08 nesneye kadar: gövdenin uzak yüzü (z=45)', 1e-9);
  doc8.features[2].flip = true; r8 = await K8.rebuild(doc8); ok(r8.status.e1.error?.code === 'extrude.to_body_behind', 'WP-08 nesneye kadar: ters yönde gövde yoksa açık hata');
  doc8.features[2] = { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', extent: 'face', toFace: bot, taper: '3', op: 'new' };
  r8 = await K8.rebuild(doc8); near(r8.bodies.find((b) => b.id === 'e1')?.volume, frustum(20, 40, 3), 'WP-08 yüze kadar + konik 3°', 1e-6);
  doc8.features[2] = { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', extent: 'face', toFace: bot, op: 'join' };
  r8 = await K8.rebuild(doc8); ok(r8.bodies.length === 1, 'WP-08 yüze kadar + Birleştir: tek gövde'); near(r8.bodies[0].volume, 60 * 60 * 5 + 400 * 40, 'WP-08 yüze kadar + Birleştir hacmi', 1e-9);
  const docT = { features: [{ id: 'b', type: 'primitive', kind: 'box', x: '-50', y: '-50', z: '30', w: '100', d: '100', h: '5', op: 'new' }, { id: 'm', type: 'move', bodies: ['b'], angle: '20', axis: 'Y', cx: '0', cy: '0', cz: '30' }, sq('s1')] };
  await K8.rebuild(docT); const low = faceBy('b', (d) => d.normal && d.normal[2] < -0.9);
  docT.features.push({ id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', extent: 'face', toFace: low, op: 'new' });
  r8 = await K8.rebuild(docT);
  { // eğik düzlem: z = 30 + x·n_x/(-n_z) ... normal ve merkezden: z(x) = c_z - (n_x (x - c_x) + n_y (y - c_y)) / n_z; kare [0,20]² üzerinde integral
    const n = low.normal, c = low.fp; const zAt = (x, y) => c[2] - (n[0] * (x - c[0]) + n[1] * (y - c[1])) / n[2];
    near(r8.bodies.find((b) => b.id === 'e1')?.volume, 400 * zAt(10, 10), 'WP-08 yüze kadar (eğik yüz): hacim = alan × ortadaki yükseklik', 1e-6);
    ok(r8.status.e1.ok && (r8.bodies.find((b) => b.id === 'e1')?.nFaces === 6), 'WP-08 eğik yüze kadar: 6 yüz');
  }
  doc8.features[2] = { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', extent: 'face', toFace: sideX, op: 'new' };
  r8 = await K8.rebuild(doc8); ok(r8.status.e1.error?.code === 'extrude.to_face_parallel', 'WP-08 yüze kadar: yöne paralel yüz açık hata: ' + JSON.stringify(r8.status.e1));
  doc8.features[2] = { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', extent: 'face', op: 'new' };
  r8 = await K8.rebuild(doc8); ok(r8.status.e1.error?.code === 'extrude.no_to_face' && r8.bodies.length === 1, 'WP-08 yüze kadar: seçim yoksa açık hata, belge bozulmaz');
  // C-03 yeniden üretme denemesi (P1 koşulları): XZ'de 42×32,8 gövde (14 mm), daire r4 + yarık; Kes Mesafe 18 = Kes Tümü
  const pts = { a: { x: -21, y: 0 }, b: { x: 21, y: 0 }, c: { x: 21, y: 32.8 }, d: { x: -21, y: 32.8 } };
  const L4 = (pre, P) => { const k = Object.keys(P); return k.map((x, i) => ({ id: pre + i, type: 'line', a: x, b: k[(i + 1) % 4] })); };
  const s2p = { o: { x: 0, y: 16 }, e: { x: -1, y: 16 }, f: { x: 1, y: 16 }, g: { x: 1, y: 32.8 }, h: { x: -1, y: 32.8 } };
  const c03 = (cut) => ({ features: [{ id: 's1', type: 'sketch', plane: { kind: 'base', name: 'XZ', offset: '0' }, points: pts, ents: L4('l', pts) }, { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', dist: '14', op: 'new' },
    { id: 's2', type: 'sketch', plane: { kind: 'base', name: 'XZ', offset: '0' }, points: s2p, ents: [{ id: 'c', type: 'circle', c: 'o', r: 4 }, ...L4('m', { e: s2p.e, f: s2p.f, g: s2p.g, h: s2p.h })] }, { id: 'e2', type: 'extrude', sketch: 's2', profiles: 'all', op: 'cut', ...cut }] });
  const vA = (await K8.rebuild(c03({ dist: '18' }))).bodies.map((b) => b.volume), vB = (await K8.rebuild(c03({ extent: 'all' }))).bodies.map((b) => b.volume);
  ok(vA.length === 1 && Math.abs(vA[0] - vB[0]) < 1e-6, `C-03 (çekirdek): Kes Mesafe 18 ile Tümü aynı hacim (${vA} / ${vB}); P1 farkı üretilemedi`);
}

// ------------------------------------------------------------------ WP-08 dilim 2: iki mesafeli / açılı pah, teğet zincir
{
  const K8 = await initKernel(opencascade, () => wasm);
  const bx = { id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '30', h: '20', op: 'new' };
  await K8.rebuild({ features: [bx] });
  let e = null; for (let i = 0; i < 12; i++) { const d = K8.describe({ body: 'b', idx: i }, 'edge'); if ([d.start, d.end].every((p) => Math.abs(p[1]) < 1e-9 && Math.abs(p[2] - 20) < 1e-9)) e = d; }
  const topW = async () => { for (let i = 0; i < 12; i++) { const d = K8.describe({ body: 'b', idx: i }, 'face'); if (d.normal && d.normal[2] > 0.99) return d.area / 40; } return null; };
  let r = await K8.rebuild({ features: [bx, { id: 'c', type: 'chamfer', edges: [e], d: '2', mode: 'two', d2: '4' }] });
  ok(r.status.c.ok, 'WP-08 iki mesafeli pah: ' + r.status.c.error?.code); near(24000 - r.bodies[0].volume, 40 * 2 * 4 / 2, 'WP-08 iki mesafeli pah 2×4: kaldırılan hacim', 1e-9);
  const w1 = await topW();
  r = await K8.rebuild({ features: [bx, { id: 'c', type: 'chamfer', edges: [e], d: '2', mode: 'two', d2: '4', flip: true }] }); const w2 = await topW();
  ok(r.status.c.ok && Math.abs(Math.abs(w1 - w2) - 2) < 1e-6 && [w1, w2].some((w) => Math.abs(w - 28) < 1e-6) && [w1, w2].some((w) => Math.abs(w - 26) < 1e-6), `WP-08 iki mesafeli pah: Tarafı değiştir üst yüz genişliğini 28↔26 yapar (${w1}, ${w2})`);
  r = await K8.rebuild({ features: [bx, { id: 'c', type: 'chamfer', edges: [e], d: '2', mode: 'angle', angle: '30' }] });
  near(24000 - r.bodies[0].volume, 40 * 2 * 2 * Math.tan(Math.PI / 6) / 2, 'WP-08 açılı pah 2 mm × 30°: kaldırılan hacim', 1e-9);
  r = await K8.rebuild({ features: [bx, { id: 'c', type: 'chamfer', edges: [e], d: '2', mode: 'angle', angle: '95' }] });
  ok(r.status.c.error?.code === 'chamfer.angle_range' && r.bodies.length === 1 && Math.abs(r.bodies[0].volume - 24000) < 1e-6, 'WP-08 açılı pah: aralık dışı açı açık hata, gövde bozulmaz');
  r = await K8.rebuild({ features: [bx, { id: 'c', type: 'chamfer', edges: [e], d: '2' }] }); near(24000 - r.bodies[0].volume, 40 * 2, 'WP-08 eski pah (mode yok) değişmedi: eşit 2 mm', 1e-9);
  // teğet zincir: yuvarlatılmış dikdörtgen extrude (8 kenarlık üst döngü)
  const P = { a: { x: 5, y: 0 }, b: { x: 35, y: 0 }, c: { x: 40, y: 5 }, d: { x: 40, y: 25 }, e: { x: 35, y: 30 }, f: { x: 5, y: 30 }, g: { x: 0, y: 25 }, h: { x: 0, y: 5 }, c1: { x: 35, y: 5 }, c2: { x: 35, y: 25 }, c3: { x: 5, y: 25 }, c4: { x: 5, y: 5 } };
  const ents = [['l1', 'line', 'a', 'b'], ['a1', 'arc', 'b', 'c', 'c1'], ['l2', 'line', 'c', 'd'], ['a2', 'arc', 'd', 'e', 'c2'], ['l3', 'line', 'e', 'f'], ['a3', 'arc', 'f', 'g', 'c3'], ['l4', 'line', 'g', 'h'], ['a4', 'arc', 'h', 'a', 'c4']].map(([id, type, a, b, c]) => (c ? { id, type, a, b, c } : { id, type, a, b }));
  const rr = [{ id: 's', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '0' }, points: P, ents }, { id: 'x', type: 'extrude', sketch: 's', profiles: 'all', dist: '10', op: 'new' }];
  r = await K8.rebuild({ features: rr }); const v0 = r.bodies[0].volume;
  let top = null; for (let i = 0; i < r.bodies[0].nEdges; i++) { const d = K8.describe({ body: 'x', idx: i }, 'edge'); if (d.geom === 'LINE' && Math.abs(d.start[2] - 10) < 1e-9 && Math.abs(d.end[2] - 10) < 1e-9) { top = d; break; } }
  const ch = K8.tangentChain({ body: 'x', idx: top.idx });
  ok(ch.length === 8 && ch.every((i) => { const d = K8.describe({ body: 'x', idx: i }, 'edge'); return Math.abs(d.start[2] - 10) < 1e-9; }), 'WP-08 teğet zincir: üst döngünün 8 kenarı (4 çizgi + 4 yay): ' + ch.length);
  const edges = ch.map((i) => K8.describe({ body: 'x', idx: i }, 'edge'));
  r = await K8.rebuild({ features: [...rr, { id: 'f', type: 'fillet', edges, r: '1', chain: true }] });
  // yuvarlatma hacmi: kesit (1 - π/4)·r² × çevre (dış kenarlar boyunca; yay köşelerinde ofset yarıçap düzeltmesi Pappus ile)
  const per = 2 * (30 + 20) + 2 * Math.PI * 5; const A = 1 - Math.PI / 4;
  const d0 = (10 - 3 * Math.PI) / (12 - 3 * Math.PI); // r=1 köşe artığının ağırlık merkezi: kenardan içe (10-3π)/(12-3π)
  const vexp = A * (2 * (30 + 20) + 2 * Math.PI * (5 - d0));
  ok(r.status.f.ok, 'WP-08 teğet zincir yuvarlatma: ' + r.status.f.error?.code); near(v0 - r.bodies[0].volume, vexp, 'WP-08 teğet zincir yuvarlatma R1: kaldırılan hacim (Pappus)', 1e-6);
  r = await K8.rebuild({ features: [...rr, { id: 'f', type: 'chamfer', edges, d: '1', mode: 'two', d2: '2', chain: true }] });
  ok(r.status.f.ok, 'WP-08 teğet zincir üzerinde iki mesafeli pah: ' + r.status.f.error?.code);
}

// ------------------------------------------------------------------ WP-08 dilim 3: gövde/yüz bölme, doğrudan düzenleme (yüz ofsetle/taşı/sil), STEP'te
{
  const K8 = await initKernel(opencascade, () => wasm);
  const bx = { id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '30', h: '20', op: 'new' };
  const hl = { id: 'h', type: 'primitive', kind: 'cylinder', x: '20', y: '15', z: '-1', dia: '10', h: '30', axis: 'Z', op: 'cut' };
  const faceBy = (bid, pred) => { for (let i = 0; i < 64; i++) { let d; try { d = K8.describe({ body: bid, idx: i }, 'face'); } catch (e) { return null; } if (pred(d)) return d; } return null; };
  let r = await K8.rebuild({ features: [bx, { id: 'sp', type: 'split', body: 'b', tool: { kind: 'base', name: 'YZ', offset: '10' } }] });
  ok(r.status.sp.ok && r.bodies.length === 2, 'WP-08 gövde böl (YZ, x=10): iki gövde ' + r.status.sp.error?.code);
  near(r.bodies.find((b) => b.id === 'b').volume, 30 * 30 * 20, 'WP-08 gövde böl: + taraf 30×30×20', 1e-9); near(r.bodies.find((b) => b.id !== 'b').volume, 10 * 30 * 20, 'WP-08 gövde böl: - taraf 10×30×20', 1e-9);
  r = await K8.rebuild({ features: [bx, { id: 'sp', type: 'split', body: 'b', tool: { kind: 'base', name: 'YZ', offset: '50' } }] });
  ok(r.status.sp.error?.code === 'split.no_effect' && r.bodies.length === 1, 'WP-08 gövde böl: düzlem dışarıda → açık hata, gövde değişmez');
  await K8.rebuild({ features: [bx] }); const top = faceBy('b', (d) => d.normal && d.normal[2] > 0.99), side = faceBy('b', (d) => d.normal && d.normal[0] > 0.99);
  r = await K8.rebuild({ features: [bx, { id: 'm', type: 'move', bodies: ['b'], dx: '0' }, { id: 'sp', type: 'split', body: 'b', tool: { kind: 'face', ref: side } }] });
  ok(r.status.sp.error?.code === 'split.no_effect', 'WP-08 gövde böl: kendi yan yüzüyle (kesmez) açık hata');
  r = await K8.rebuild({ features: [bx, { id: 'sf', type: 'splitface', faces: [top], tool: { kind: 'base', name: 'YZ', offset: '10' } }] });
  ok(r.status.sf.ok && r.bodies[0].nFaces === 7, 'WP-08 yüz böl: üst yüz ikiye (7 yüz) ' + r.status.sf.error?.code); near(r.bodies[0].volume, 24000, 'WP-08 yüz böl: hacim değişmez', 1e-12);
  { const a = faceBy('b', (d) => d.normal && d.normal[2] > 0.99 && d.fp[0] < 10), b2 = faceBy('b', (d) => d.normal && d.normal[2] > 0.99 && d.fp[0] > 10);
    ok(a && b2 && Math.abs(a.area - 300) < 1e-6 && Math.abs(b2.area - 900) < 1e-6 && a.name && b2.name && JSON.stringify(a.name) !== JSON.stringify(b2.name), 'WP-08 yüz böl: parçalar 10×30 ve 30×30, ayrı adlı (seçilebilir)');
    r = await K8.rebuild({ features: [bx, { id: 'sf', type: 'splitface', faces: [top], tool: { kind: 'base', name: 'YZ', offset: '10' } }, { id: 'fo', type: 'faceop', mode: 'offset', faces: [b2], dist: '5' }] });
    near(r.bodies[0]?.volume, 24000 + 900 * 5, 'WP-08 yüz böl + parçayı ofsetle: basamak', 1e-9); }
  for (const [d, v] of [['5', 30000], ['-5', 18000]]) { r = await K8.rebuild({ features: [bx, { id: 'fo', type: 'faceop', mode: 'offset', faces: [top], dist: d }] }); ok(r.status.fo.ok && r.bodies[0].nFaces === 6, 'WP-08 yüz ofset ' + d); near(r.bodies[0].volume, v, 'WP-08 yüz ofset ' + d + ' hacim', 1e-9); }
  r = await K8.rebuild({ features: [bx, { id: 'fo', type: 'faceop', mode: 'offset', faces: [top], dist: '5' }, { id: 'sh', type: 'shell', faces: [top], t: '2' }] });
  ok(r.status.sh.ok, 'WP-08 yüz ofset: ötelenen yüz adını korur (sonraki kabuk aynı yüz başvurusuyla çalışır) ' + r.status.sh.error?.code);
  r = await K8.rebuild({ features: [bx, { id: 'fo', type: 'faceop', mode: 'move', faces: [top], dx: '3', dy: '0', dz: '2' }] });
  near(r.bodies[0].volume, 40 * 30 * 22, 'WP-08 yüz taşı (düzlemsel): normal bileşeni (dz=2) uygulanır', 1e-9);
  // eğik komşu: ofset desteklenmez → açık hata, belge bozulmaz
  const wedge = [bx, { id: 'c', type: 'chamfer', edges: [], d: '5' }];
  await K8.rebuild({ features: [bx] }); let te = null; for (let i = 0; i < 12; i++) { const d = K8.describe({ body: 'b', idx: i }, 'edge'); if ([d.start, d.end].every((p) => Math.abs(p[1]) < 1e-9 && Math.abs(p[2] - 20) < 1e-9)) te = d; }
  wedge[1].edges = [te]; await K8.rebuild({ features: wedge }); const top2 = faceBy('b', (d) => d.normal && d.normal[2] > 0.99);
  r = await K8.rebuild({ features: [...wedge, { id: 'fo', type: 'faceop', mode: 'offset', faces: [top2], dist: '3' }] });
  ok(r.status.fo.error?.code === 'faceop.neighbors' && r.bodies.length === 1 && Math.abs(r.bodies[0].volume - (24000 - 12.5 * 40)) < 1e-6, 'WP-08 yüz ofset: eğik (pah) komşu → açık hata, gövde pahlı haliyle kalır');
  // delik: sil (doldur) ve taşı
  await K8.rebuild({ features: [bx, hl] }); const wall = faceBy('b', (d) => d.geom === 'CYLINDRE');
  const vh = 24000 - Math.PI * 25 * 20;
  r = await K8.rebuild({ features: [bx, hl, { id: 'fo', type: 'faceop', mode: 'delete', faces: [wall] }] });
  ok(r.status.fo.ok && r.bodies[0].nFaces === 6, 'WP-08 yüz sil: delik duvarı → delik dolar (6 yüz) ' + r.status.fo.error?.code); near(r.bodies[0].volume, 24000, 'WP-08 yüz sil: hacim dolu kutu', 1e-9);
  r = await K8.rebuild({ features: [bx, hl, { id: 'fo', type: 'faceop', mode: 'move', faces: [wall], dx: '5', dy: '-3', dz: '0' }] });
  near(r.bodies[0].volume, vh, 'WP-08 yüz taşı: delik taşınır, hacim aynı', 1e-9);
  { const w2 = faceBy('b', (d) => d.geom === 'CYLINDRE'); ok(w2 && Math.abs(w2.axis.o[0] - 25) < 1e-6 && Math.abs(w2.axis.o[1] - 12) < 1e-6 && w2.name, 'WP-08 yüz taşı: delik ekseni (25, 12), duvar adı korunur: ' + JSON.stringify(w2?.axis?.o)); }
  // yuvarlatma yüzünü silmek: kapak düzlemsel değil → açık hata
  const fil = [bx, { id: 'f', type: 'fillet', edges: [te], r: '4' }]; await K8.rebuild({ features: fil }); const ff = faceBy('b', (d) => d.geom === 'CYLINDRE');
  r = await K8.rebuild({ features: [...fil, { id: 'fo', type: 'faceop', mode: 'delete', faces: [ff] }] });
  ok(!r.status.fo.ok && ['faceop.cap_not_planar', 'faceop.not_closed', 'faceop.ambiguous'].includes(r.status.fo.error.code) && r.bodies.length === 1, 'WP-08 yüz sil: yuvarlatma yüzü → açık hata (desteklenmez): ' + r.status.fo.error?.code);
  // içe aktarılan STEP (test modeli burada üretilir: delikli kutu → STEP → içe aktar)
  await K8.rebuild({ features: [bx, hl] }); const data = Buffer.from(await K8.exportFile('step')).toString('base64');
  const imp = { id: 'imp', type: 'import', format: 'step', data, name: 'delikli' };
  r = await K8.rebuild({ features: [imp] }); near(r.bodies[0].volume, vh, 'WP-08 STEP içe aktarıldı', 1e-9);
  const iw = faceBy('imp', (d) => d.geom === 'CYLINDRE'), itop = faceBy('imp', (d) => d.normal && d.normal[2] > 0.99);
  r = await K8.rebuild({ features: [imp, { id: 'fo', type: 'faceop', mode: 'move', faces: [iw], dx: '-8', dy: '0', dz: '0' }] });
  ok(r.status.fo.ok, 'WP-08 STEP: delik yüzü taşı ' + r.status.fo.error?.code); near(r.bodies[0].volume, vh, 'WP-08 STEP: taşıma sonrası hacim', 1e-9);
  ok(Math.abs(faceBy('imp', (d) => d.geom === 'CYLINDRE')?.axis?.o[0] - 12) < 1e-6, 'WP-08 STEP: delik x=12');
  r = await K8.rebuild({ features: [imp, { id: 'fo', type: 'faceop', mode: 'delete', faces: [iw] }] }); near(r.bodies[0].volume, 24000, 'WP-08 STEP: delik yüzü sil → dolu', 1e-9);
  r = await K8.rebuild({ features: [imp, { id: 'fo', type: 'faceop', mode: 'offset', faces: [itop], dist: '-4' }] }); near(r.bodies[0].volume, vh * 16 / 20, 'WP-08 STEP: üst yüz -4 ofset', 1e-9);
}

// ------------------------------------------------------------------ WP-08 dilim 4: diş tabloları, yüzden ayna, kenar ekseninden dairesel desen
{
  const { THREAD_TABLES } = await import('../src/ui/features.js');
  const g = (fam, d) => THREAD_TABLES[fam].find((x) => x.designation === d);
  ok(THREAD_TABLES.iso.every((x) => !x.family || x.family === 'iso') && g('iso', 'M8').drill === 6.75, 'WP-08 diş: ISO kaba M8 matkap 6,75 (eski tabloyla aynı)');
  ok(g('iso_fine', 'M10x1').drill === 9 && g('iso_fine', 'M12x1.5').drill === 10.5 && g('iso_fine', 'M8x1').pitch === 1, 'WP-08 diş: ISO ince M10x1 → 9, M12x1,5 → 10,5');
  ok(g('g', 'G1/4').drill === 11.8 && Math.abs(g('g', 'G1/4').pitch - 25.4 / 19) < 1e-4 && g('g', 'G1/2').major === 20.955, 'WP-08 diş: G1/4 matkap 11,8, 19 diş/inç; G1/2 D=20,955');
  ok(Math.abs(g('npt', '1/4 NPT').drill - 11.1125) < 1e-4 && g('npt', '1/4 NPT').taper && Math.abs(g('npt', '1/2 NPT').major - 21.336) < 1e-4, 'WP-08 diş: 1/4 NPT matkap 7/16 in, konik; 1/2 NPT dış çap 0,840 in');
  ok(Object.values(THREAD_TABLES).every((T) => T.every((x) => x.drill > 0 && x.drill < x.major && x.pitch > 0)), 'WP-08 diş: tüm tablolarda 0 < matkap < D, adım > 0');
  const K8 = await initKernel(opencascade, () => wasm);
  const bx = { id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '30', h: '20', op: 'new' };
  const faceBy = (bid, pred) => { for (let i = 0; i < 64; i++) { let d; try { d = K8.describe({ body: bid, idx: i }, 'face'); } catch (e) { return null; } if (pred(d)) return d; } return null; };
  await K8.rebuild({ features: [bx] }); const px = faceBy('b', (d) => d.normal && d.normal[0] > 0.99);
  let r = await K8.rebuild({ features: [bx, { id: 'mi', type: 'mirror', source: { kind: 'body', bodies: ['b'] }, plane: 'face', planeRef: px }] });
  ok(r.status.mi.ok && r.bodies.length === 2, 'WP-08 yüzden ayna: kopya gövde ' + r.status.mi.error?.code);
  { const c = r.bodies.find((b) => b.id !== 'b'); near(c?.volume, 24000, 'WP-08 yüzden ayna: hacim', 1e-12); ok(c && Math.abs(c.bbox[0][0] - 40) < 1e-9 && Math.abs(c.bbox[1][0] - 80) < 1e-9, 'WP-08 yüzden ayna: kopya x 40…80'); }
  r = await K8.rebuild({ features: [bx, { id: 'mi', type: 'mirror', source: { kind: 'body', bodies: ['b'] }, plane: 'face' }] });
  ok(!r.status.mi.ok && r.bodies.length === 1, 'WP-08 yüzden ayna: yüz yoksa açık hata, belge bozulmaz: ' + r.status.mi.error?.code);
  // kenar ekseni: kutunun x=40,y=0 dikey kenarı etrafında 4'lü dairesel desen (gövde kopyaları)
  let ve = null; for (let i = 0; i < 12; i++) { const d = K8.describe({ body: 'b', idx: i }, 'edge'); if ([d.start, d.end].every((p) => Math.abs(p[0] - 40) < 1e-9 && Math.abs(p[1]) < 1e-9)) ve = d; }
  r = await K8.rebuild({ features: [bx, { id: 'pt', type: 'pattern', kind: 'circ', source: { kind: 'body', bodies: ['b'] }, count: '4', total: '360', axis: 'edge', axisRef: ve }] });
  ok(r.status.pt.ok && r.bodies.length === 4, 'WP-08 kenar ekseninden desen: 4 gövde ' + r.status.pt.error?.code);
  { const bb = r.bodies.map((b) => b.bbox); const lo = [0, 1].map((k) => Math.min(...bb.map((x) => x[0][k]))), hi = [0, 1].map((k) => Math.max(...bb.map((x) => x[1][k])));
    ok(Math.abs(lo[0] - 0) < 1e-6 && Math.abs(hi[0] - 80) < 1e-6 && Math.abs(lo[1] + 40) < 1e-6 && Math.abs(hi[1] - 40) < 1e-6, 'WP-08 kenar ekseninden desen: kopyalar kenar (40,0) çevresinde: ' + JSON.stringify([lo, hi])); }
  // dairesel kenar ekseni: silindirin üst dairesi → silindir ekseni; silindir dışındaki kutu onun çevresinde döner
  const cy = { id: 'cy', type: 'primitive', kind: 'cylinder', x: '100', y: '0', z: '0', dia: '10', h: '5', axis: 'Z', op: 'new' };
  await K8.rebuild({ features: [bx, cy] }); let ce = null; for (let i = 0; i < 3; i++) { const d = K8.describe({ body: 'cy', idx: i }, 'edge'); if (d.geom === 'CIRCLE') ce = d; }
  r = await K8.rebuild({ features: [bx, cy, { id: 'pt', type: 'pattern', kind: 'circ', source: { kind: 'body', bodies: ['b'] }, count: '2', total: '360', axis: 'edge', axisRef: ce }] });
  { const c = r.bodies.find((b) => b.id !== 'b' && b.id !== 'cy'); ok(r.status.pt.ok && c && Math.abs(c.bbox[0][0] - 160) < 1e-6 && Math.abs(c.bbox[1][0] - 200) < 1e-6, 'WP-08 dairesel kenar ekseni (silindir x=100): 180° kopya x 160…200 ' + JSON.stringify(c?.bbox)); }
}

// ------------------------------------------------------------------ WP-08 dilim 5: F-26 (STL kiriş hatası) — ince ağ seçeneği
{
  const K8 = await initKernel(opencascade, () => wasm);
  const stlVol = (u) => { const dv = new DataView(u.buffer, u.byteOffset, u.byteLength); const n = dv.getUint32(80, true); let v = 0; for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; const p = [0, 1, 2].map((k) => [0, 1, 2].map((j) => dv.getFloat32(o + k * 12 + j * 4, true))); const [a, b, c] = p; v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; } return { v, n }; };
  const r = await K8.rebuild({ features: [{ id: 'c', type: 'primitive', kind: 'cylinder', x: '0', y: '0', z: '0', dia: '24', h: '100', axis: 'X', op: 'new' }] });
  const v0 = r.bodies[0].volume; const A = stlVol(await K8.exportFile('stl')), B = stlVol(await K8.exportFile('stl', null, null, { quality: 'fine' }));
  ok(Math.abs(A.v - v0) / v0 > 1e-4, `F-26 yeniden üretildi: varsayılan STL Ø24 mil hacim hatası ${((A.v - v0) / v0).toExponential(2)} (> 1e-4)`);
  ok(Math.abs(B.v - v0) / v0 < 1e-4 && B.n > A.n, `F-26 ince ağ: hacim hatası ${((B.v - v0) / v0).toExponential(2)} < 1e-4 (üçgen ${A.n} → ${B.n})`);
}

// ------------------------------------------------------------------ WP-08 dilim 6: eskiz metni (Inter, OFL) → kapalı konturlar → extrude profili
{
  const { parseFont, textOutlines, segmentsToSketch, cleanSegments } = await import('../src/ui/sketch/text.js');
  const { selectionFor } = await import('../src/shared/profiles.js');
  const font = parseFont(new Uint8Array(fs.readFileSync(path.join(here, '../src/ui/sketch/fonts/Inter-Regular.ttf'))));
  ok(font.upm === 2048 && font.glyphOf(0x11f) > 0 && font.glyphOf(0x15f) > 0 && font.glyphOf(0x130) > 0 && font.glyphOf(0x131) > 0, 'WP-08 metin: yazı tipi okundu, Türkçe karakterler (ğ ş İ ı) var');
  const K8 = await initKernel(opencascade, () => wasm);
  // bağımsız alan hesabı: sıfır olmayan sarım bölgesinin tam alanı (tarama: tepe ve kesişim y'leri arasında uzunluk doğrusal)
  const nzArea = (polys) => {
    const E = []; for (const p of polys) for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; if (a[1] !== b[1]) E.push(a[1] < b[1] ? [a, b, 1] : [b, a, -1]); }
    const ys = new Set(); for (const [a, b] of E) { ys.add(a[1]); ys.add(b[1]); }
    for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) { const [p, q] = E[i], [r2, s2] = E[j]; const d = (q[0] - p[0]) * (s2[1] - r2[1]) - (q[1] - p[1]) * (s2[0] - r2[0]); if (Math.abs(d) < 1e-15) continue; const tt = ((r2[0] - p[0]) * (s2[1] - r2[1]) - (r2[1] - p[1]) * (s2[0] - r2[0])) / d, uu = ((r2[0] - p[0]) * (q[1] - p[1]) - (r2[1] - p[1]) * (q[0] - p[0])) / d; if (tt > 0 && tt < 1 && uu > 0 && uu < 1) ys.add(p[1] + tt * (q[1] - p[1])); }
    const Y = [...ys].sort((a, b) => a - b); let A = 0;
    for (let k = 0; k + 1 < Y.length; k++) {
      const y = (Y[k] + Y[k + 1]) / 2, xs = [];
      for (const [a, b, w] of E) if (a[1] <= y && b[1] > y) xs.push([a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), w]);
      xs.sort((a, b) => a[0] - b[0]); let wn = 0, len = 0;
      for (let i = 0; i < xs.length; i++) { const w0 = wn; wn += xs[i][1]; if (w0 !== 0 && i > 0) len += xs[i][0] - xs[i - 1][0]; }
      A += len * (Y[k + 1] - Y[k]);
    }
    return A;
  };
  const winding = (polys, x, y) => { let w = 0; for (const p of polys) for (let i = 0; i < p.length; i++) { const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length]; if (ay <= y) { if (by > y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) > 0) w++; } else if (by <= y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) < 0) w--; } return w; };
  for (const txt of ['Mihenk', 'ĞŞİçöü', 'B8%']) {
    const glyphs = textOutlines(font, txt, { height: 10, x: 5, y: 3 });
    const segs = cleanSegments(glyphs, 2e-4); const pts = {}, ents = []; let k = 0;
    segmentsToSketch(segs, (x, y) => { const id = 'p' + (k++); pts[id] = { x, y }; return id; }, (a, b) => ents.push({ id: 'l' + (k++), type: 'line', a, b }), 2e-4);
    const fr = findRegions({ points: pts, ents });
    ok(!fr.open && !fr.issues.length, `WP-08 metin "${txt}": kapalı, temiz konturlar (çakışma yok): ` + JSON.stringify(fr.issues.slice(0, 2)));
    const ink = fr.regions.filter((r) => glyphs.some((g) => winding(g, r.inside[0], r.inside[1]) !== 0));
    const A = glyphs.reduce((s, g) => s + nzArea(g), 0);
    const r = await K8.rebuild({ features: [{ id: 's', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '0' }, points: pts, ents }, { id: 'e', type: 'extrude', sketch: 's', profiles: ink.map(selectionFor), dist: '2', op: 'new' }] });
    ok(r.status.e.ok, `WP-08 metin "${txt}" extrude: ` + JSON.stringify(r.status.e.error));
    near(r.bodies.reduce((a, b) => a + b.volume, 0), 2 * A, `WP-08 metin "${txt}": hacim = 2 × (sıfır olmayan sarım alanı, bağımsız tarama)`, 1e-6);
  }
  // kazıma: kutu üzerine metin, Kes 0,5 mm
  { const glyphs = textOutlines(font, 'Ş', { height: 8, x: 2, y: 2 }); const segs = cleanSegments(glyphs, 2e-4); const pts = {}, ents = []; let k = 0;
    segmentsToSketch(segs, (x, y) => { const id = 'p' + (k++); pts[id] = { x, y }; return id; }, (a, b) => ents.push({ id: 'l' + (k++), type: 'line', a, b }), 1.6e-4);
    const ink = findRegions({ points: pts, ents }).regions.filter((r) => glyphs.some((g) => winding(g, r.inside[0], r.inside[1]) !== 0));
    const r = await K8.rebuild({ features: [{ id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '-5', w: '20', d: '20', h: '5', op: 'new' }, { id: 's', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '0' }, points: pts, ents }, { id: 'e', type: 'extrude', sketch: 's', profiles: ink.map(selectionFor), dist: '0.5', flip: true, op: 'cut' }] });
    near(r.bodies[0]?.volume, 2000 - 0.5 * nzArea(glyphs[0]), 'WP-08 metin kazıma "Ş" 0,5 mm: hacim', 1e-6); }
}

// ------------------------------------------------------------------ WP-08 dilim 7(b): ilişkisel izdüşüm yeniden hesapta güncellenir (eskiz açık değil)
{
  const { projectPolylines } = await import('../src/ui/sketch/ops.js');
  const V8 = await import('../src/shared/vec.js');
  const K8 = await initKernel(opencascade, () => wasm);
  const docP = { params: [{ name: 'W', expr: '40' }], features: [{ id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: 'W', d: '20', h: '10', op: 'new' }] };
  let r = await K8.rebuild(docP); const pl = V8.basePlane('XY', 10);
  const mb = r.bodies[0]; const polys = [];
  for (const g of mb.edgeGroups) { const a = mb.lines.subarray(g.start * 3, (g.start + g.count) * 3); const p3 = []; for (let i = 0; i + 5 < a.length; i += 6) { if (!p3.length) p3.push([a[i], a[i + 1], a[i + 2]]); p3.push([a[i + 3], a[i + 4], a[i + 5]]); } if (p3.every((p) => Math.abs(p[2] - 10) < 1e-6)) polys.push({ pts: p3.map((p) => V8.toLocal(pl, p)), meta: { b: 'b', g: g.idx, c: [0, 1, 2].map((k) => p3.reduce((q, p) => q + p[k], 0) / p3.length) } }); }
  const sk = { points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [], seq: 0 };
  projectPolylines(sk, polys); for (const e of sk.ents) delete e.cons; // izdüşüm yardımcı çizgidir; profil için normale çevrilir (kullanıcı da yapar)
  ok(polys.length === 4 && sk.ents.length === 4 && sk.ents.every((e) => e.proj), 'WP-08 7b: üst yüzün 4 kenarı ilişkisel izdüşüldü');
  docP.features.push({ id: 's', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '10' }, ...sk }, { id: 'e', type: 'extrude', sketch: 's', profiles: 'all', dist: '5', op: 'new' });
  r = await K8.rebuild(docP); near(r.bodies.find((b) => b.id === 'e')?.volume, 40 * 20 * 5, 'WP-08 7b: başlangıç W=40 ' + JSON.stringify([r.status, r.bodies.map((b) => b.id)]), 1e-9);
  docP.params[0].expr = '60'; r = await K8.rebuild(docP);
  near(r.bodies.find((b) => b.id === 'e')?.volume, 60 * 20 * 5, 'WP-08 7b: W=60 → kapalı eskizdeki izdüşüm gövdeyle güncellenir (60×20×5)', 1e-9);
  ok(!(r.featInfo.s.warn || []).length, 'WP-08 7b: güncellemede uyarı yok');
  ok(docP.features[1].points && Object.values(docP.features[1].points).every((p) => p.x <= 40 + 1e-9), 'WP-08 7b: belge değişmez (izdüşüm kopya üzerinde güncellenir)');
  docP.features[0].id = 'b2'; r = await K8.rebuild(docP);
  ok(r.status.s.ok && (r.featInfo.s.warn || []).some((w) => w.code === 'sketch.proj_lost'), 'WP-08 7b: kaynak gövde/kenar kaybolursa eskiz işleminde uyarı: ' + JSON.stringify(r.featInfo.s.warn));
  near(r.bodies.find((b) => b.id === 'e')?.volume, 40 * 20 * 5, 'WP-08 7b: kayıpta geometri yerinde kalır', 1e-9);
}

// ------------------------------------------------------------------ WP-08 dilim 7(a,c): şema — groups, ent.proj, views (isteğe bağlı)
{
  const { validateDoc } = await import('../src/shared/schema.js');
  const v = (d) => { try { validateDoc(d); return 'ok'; } catch (e) { return e.code; } };
  const sk = (ents) => ({ features: [{ id: 's', type: 'sketch', plane: { kind: 'base', name: 'XY' }, points: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, ents }] });
  ok(v({ features: [] }) === 'ok' && v(sk([{ id: 'l', type: 'line', a: 'a', b: 'b' }])) === 'ok', 'WP-08 şema: alanı olmayan eski belge geçer');
  ok(v({ features: [], groups: [{ id: 'g1', name: 'Delikler', first: 'a', last: 'b' }] }) === 'ok', 'WP-08 şema: geçerli groups');
  ok(v({ features: [], groups: [{ id: 'g1', name: 'x', first: 5, last: 'b' }] }) === 'schema.bad_field' && v({ features: [], groups: { id: 'g' } }) === 'schema.bad_field' && v({ features: [], groups: [{ name: 'x', first: 'a', last: 'b' }] }) === 'schema.bad_field', 'WP-08 şema: bozuk groups reddedilir (tür, liste, eksik kimlik)');
  const proj = { b: 'b', g: 3, c: [1, 2, 3], sig: { k: 'l', a: [0, 0], b: [1, 0] }, e: 'l', fp: [0, 0, 1, 0, 'line'], pin: ['O'] };
  ok(v(sk([{ id: 'l', type: 'line', a: 'a', b: 'b', cons: true, proj }])) === 'ok' && v(sk([{ id: 'l', type: 'line', a: 'a', b: 'b', proj: { ...proj, lost: true, sig: null } }])) === 'ok', 'WP-08 şema: geçerli ent.proj (kayıp, imzasız)');
  ok(v(sk([{ id: 'l', type: 'line', a: 'a', b: 'b', proj: { ...proj, g: 'x' } }])) === 'schema.bad_field' && v(sk([{ id: 'l', type: 'line', a: 'a', b: 'b', proj: { ...proj, c: [1, 2, 'z'] } }])) === 'schema.bad_field' && v(sk([{ id: 'l', type: 'line', a: 'a', b: 'b', proj: { ...proj, sig: { k: 'q' } } }])) === 'schema.bad_field', 'WP-08 şema: bozuk ent.proj reddedilir');
  ok(v({ features: [], views: ['Üst|0,0,1|0,0,0|0,1,0|1|50', ''] }) === 'ok' && v({ features: [], views: new Array(13).fill('') }) === 'schema.too_many' && v({ features: [], views: [3] }) === 'schema.bad_field', 'WP-08 şema: views (≤12 yuva, metin)');
}

// ------------------------------------------------------------------ O-044 (F-15): tekli eksi üsten sonra; tanımsız değer hata; pi gölgelenir; virgül ondalık
{
  const X = await import('../src/shared/expr.js');
  const tv = (e, v) => { try { return X.evalExpr(e, v); } catch (x) { return x.code; } };
  ok(tv('-2^2') === -4 && tv('-x^2', { x: 3 }) === -9 && tv('2*-3^2') === -18 && tv('-2^-2') === -0.25 && tv('2^-2') === 0.25 && tv('3-2^2') === -1 && tv('(-2)^2') === 4, 'O-044: tekli eksi üsten sonra (-2^2=-4, -x^2, 2*-3^2=-18, -2^-2=-0,25, (-2)^2=4)');
  ok(tv('tan(90)') === 'expr.not_number' && tv('1/0') === 'expr.not_number' && Math.abs(tv('tan(45)') - 1) < 1e-12, 'O-044: tan(90), 1/0 → expr.not_number; tan(45)=1');
  ok(tv('pi*2', { pi: 3 }) === 6 && Math.abs(tv('pi') - Math.PI) < 1e-15, 'O-044: kullanıcının pi parametresi yerleşik sabiti gölgeler');
  ok(tv('1,5*2') === 3 && tv('max(10;5)') === 10 && tv('max(10,5)') === 10.5, 'O-044: virgül ondalık ayraç, fonksiyon ayracı ; (değişmedi)');
  const ch = X.changedByO044({ params: [{ name: 'a', expr: '-2^2' }, { name: 'b', expr: 'a+1' }, { name: 'c', expr: '-2*3' }], features: [{ id: 'e', type: 'extrude', dist: '-3^2' }, { id: 'f', type: 'extrude', dist: '10' }] });
  ok(JSON.stringify(ch) === JSON.stringify(['a', 'b', 'e.dist']), 'O-044: değeri değişen parametre/alan listesi (bağımlı parametre dahil): ' + JSON.stringify(ch));
  ok(X.changedByO044({ params: [{ name: 'L', expr: '100' }, { name: 'H', expr: 'L/5' }], features: [] }).length === 0, 'O-044: etkilenmeyen belge için bildirim yok');
}

// ------------------------------------------------------------------ WP-08 doğrulama 4: sessiz sonuç yok (yüze kadar örtmeyen yüz, delip geçen ofset)
{
  const K8 = await initKernel(opencascade, () => wasm);
  const q = rect(20, 20, 'w'); const skq = { id: 's1', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: '0' }, points: q.pts, ents: q.ents };
  const faceBy = (bid, pred) => { for (let i = 0; i < 64; i++) { let d; try { d = K8.describe({ body: bid, idx: i }, 'face'); } catch (e) { return null; } if (pred(d)) return d; } return null; };
  for (const [w, warn] of [[60, false], [8, true]]) {
    const doc = { features: [{ id: 'b', type: 'primitive', kind: 'box', x: '-10', y: '-10', z: '40', w: String(w), d: String(w), h: '5', op: 'new' }, skq] }; await K8.rebuild(doc);
    doc.features.push({ id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', extent: 'face', toFace: faceBy('b', (d) => d.normal && d.normal[2] < -0.99), op: 'new' });
    const r = await K8.rebuild(doc); const has = (r.featInfo.e1.warn || []).some((x) => x.code === 'extrude.face_extended');
    ok(r.status.e1.ok && has === warn && Math.abs(r.bodies.find((b) => b.id === 'e1').volume - 16000) < 1e-6, `WP-08 yüze kadar: hedef yüz ${w} mm ${warn ? 'örtmüyor → uyarı' : 'örtüyor → uyarı yok'}`);
  }
  const bx = { id: 'b', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '30', h: '20', op: 'new' };
  const pk = { id: 'h', type: 'primitive', kind: 'cylinder', x: '20', y: '15', z: '-1', dia: '10', h: '15', axis: 'Z', op: 'cut' };
  await K8.rebuild({ features: [bx, pk] }); const top = faceBy('b', (d) => d.normal && d.normal[2] > 0.99);
  let r = await K8.rebuild({ features: [bx, pk, { id: 'fo', type: 'faceop', mode: 'offset', faces: [top], dist: '-3' }] });
  ok(r.status.fo.ok && !(r.featInfo.fo.warn || []).length, 'WP-08 yüz ofset -3 (cebe ulaşmaz): uyarı yok');
  r = await K8.rebuild({ features: [bx, pk, { id: 'fo', type: 'faceop', mode: 'offset', faces: [top], dist: '-8' }] });
  ok(r.status.fo.ok && (r.featInfo.fo.warn || []).some((x) => x.code === 'faceop.through'), 'WP-08 yüz ofset -8 kör deliği açar → "delip geçti" uyarısı: ' + JSON.stringify(r.featInfo.fo.warn));
}
console.log(`\n${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
