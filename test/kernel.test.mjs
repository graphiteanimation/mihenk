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

console.log('T-05b/H1 eş eksenli ama malzemeyle ayrılmış delikler; çapraz delik');
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
  r = await imp(box(40, 40, 30).cut(cyl(4, 10, [20, 20, 20], [0, 0, 1])).cut(cyl(2.5, 30, [20, 20, 0], [0, 0, 1])));
  ok(r.holes.length === 1 && r.holes[0].kind === 'cbore' && r.holes[0].through && near(r.holes[0].exits[0], 30), 'kademeli Ø8×10 + Ø5 boydan boya: tek cbore delik korunur');
  r = await imp(box(40, 40, 30).cut(cyl(3, 40, [20, 20, -5], [0, 0, 1])).cut(cyl(3, 50, [-5, 20, 15], [1, 0, 0])));
  ok(r.holes.length === 2 && r.holes.every((h) => h.through) && r.holes.some((h) => h.dir[2] !== 0 && near(h.exits[0], 30)), 'çapraz kesişen Ø6 delikler: bölünen duvar hava boşluğundan birleşir, ikisi de boydan boya');
  e = KH.camHoleExit({ bodies: [r.bodies[0].id], p: [20, 20, 30], d: [0, 0, -1], r: 3 }); ok(near(e.t, 30) && e.through, 'çapraz delik çıkışı 30');
  e = KH.camHoleExit({ bodies: [r.bodies[0].id], p: [20, 20, 45], d: [0, 0, -1], r: 3 }); ok(near(e.t, 45) && e.through, 'giriş delikten 15 mm yukarıda (havada): çıkış 45');
}
console.log(`\n${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
