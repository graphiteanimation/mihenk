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
ok(out.status.e1.ok, 'extrude: ' + out.status.e1.error); ok(out.bodies.length === 1, 'tek gövde');
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
out = await K.rebuild(doc); ok(out.status.e2.ok, 'cut: ' + out.status.e2.error);
near(out.bodies[0].volume, (6000 - Math.PI * 100) * 20 - 20 * 20 * 5, 'cep sonrası hacim');
near(out.sketches.s2.plane.o[2], 20, 'yüz düzlemi orijini');
// fillet: dikey kenarlar
const edges = []; for (let i = 0; i < out.bodies[0].nEdges; i++) { const d = K.describe({ body: bid, idx: i }, 'edge'); if (d.geom === 'LINE' && Math.abs(d.length - 20) < 1e-6 && Math.abs(d.start[2] - d.end[2]) > 19 && Math.abs(d.start[0] - 50) > 20) edges.push(d); }
ok(edges.length === 4, 'dört dikey kenar: ' + edges.length);
doc.features.push({ id: 'f1', type: 'fillet', edges, r: '5' });
out = await K.rebuild(doc); ok(out.status.f1.ok, 'fillet: ' + out.status.f1.error);
const vBefore = (6000 - Math.PI * 100) * 20 - 2000; near(out.bodies[0].volume, vBefore - (4 - Math.PI) * 25 * 20, 'fillet hacmi');
// parametre değişimi: topoloji aynı -> seçimler korunur
doc.params[0].expr = '120';
// sketch noktaları arayüzde çözülür; burada elle güncelle
doc.features[0].points.p2.x = 120; doc.features[0].points.p3.x = 120;
out = await K.rebuild(doc); ok(out.status.f1.ok && out.status.e2.ok, 'parametre sonrası: ' + (out.status.f1.error || out.status.e2.error));
near(out.bodies[0].bbox[1][2], 24, 'yeni yükseklik H=L/5');
// delik + dairesel desen
doc.features.push({ id: 's3', type: 'sketch', plane: { kind: 'base', name: 'XY', offset: 'H' }, points: { h1: { x: 100, y: 30 } }, ents: [{ id: 'hp', type: 'point', p: 'h1' }] });
doc.features.push({ id: 'h1', type: 'hole', sketch: 's3', kind: 'cbore', dia: '6.6', extent: 'all', cboreDia: '11', cboreDepth: '6.5', thread: null });
out = await K.rebuild(doc); ok(out.status.h1.ok, 'delik: ' + out.status.h1.error); const v1 = out.bodies[0].volume;
ok(out.holes.length === 1 && out.holes[0].dia === 6.6, 'delik verisi');
doc.features.push({ id: 'pt', type: 'pattern', kind: 'rect', source: { kind: 'feature', id: 'h1' }, count1: '1', step1: '0', count2: '2', step2: '-10', dir1: 'X', dir2: 'Y' });
out = await K.rebuild(doc); ok(out.status.pt.ok, 'desen: ' + out.status.pt.error); ok(out.bodies[0].volume < v1 - 100, 'desen hacmi azalttı');
// hatalı özellik geri alınır, diğerleri devam eder
doc.features.push({ id: 'bad', type: 'fillet', edges: [{ ...edges[0] }], r: '500' });
out = await K.rebuild(doc); ok(!out.status.bad.ok, 'büyük fillet hata vermeli'); ok(out.bodies.length === 1, 'gövde korunur');
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
for (const f of d2.features) ok(out.status[f.id].ok, f.id + ': ' + out.status[f.id].error);
ok(out.bodies.length === 1, 'tek gövde (join)');
const ring = Math.PI * (15 * 15 - 5 * 5) * 30, plate = 100 * 100 * 10, hole = Math.PI * 16 * 10;
near(out.bodies[0].volume, ring + plate - Math.PI * 0 - 4 * hole, 'revolve+plaka-4 delik (mirror, desenle çakışır)', 2e-3);
// kabuk
const d3 = { params: [], features: [{ id: 'b', type: 'primitive', kind: 'box', w: '50', d: '40', h: '30', op: 'new' }] };
out = await K2.rebuild(d3); let tf; for (let i = 0; i < 6; i++) { const d = K2.describe({ body: 'b', idx: i }, 'face'); if (d.normal[2] > 0.9) tf = d; }
d3.features.push({ id: 'sh', type: 'shell', faces: [tf], t: '2' });
out = await K2.rebuild(d3); ok(out.status.sh.ok, 'kabuk: ' + out.status.sh.error); near(out.bodies[0].volume, 50 * 40 * 30 - 46 * 36 * 28, 'kabuk hacmi');
// STEP dışa/içe
const step = await K2.exportFile('step'); ok(step.length > 1000, 'STEP boyutu');
const stl = await K2.exportFile('stl'); ok(stl.length > 500, 'STL boyutu');
const d4 = { params: [], features: [{ id: 'imp', type: 'import', format: 'step', name: 'parça', data: Buffer.from(step).toString('base64') }] };
out = await K2.rebuild(d4); ok(out.status.imp.ok, 'STEP içe: ' + out.status.imp.error); near(out.bodies[0].volume, 50 * 40 * 30 - 46 * 36 * 28, 'içe alınan hacim');
const pr = K2.bodyProps(out.bodies[0].id); ok(pr.area > 0 && pr.com.length === 3, 'kütle özellikleri');
console.log(`\n${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
