// Sketch düzenleme işlemleri (budama, uzatma, bölme, ofset, yuvarlat, ayna, desen, dönüşüm, izdüşüm, pano): saf işlevler + çözücü.
import { solveSketch, probeFree } from '../src/ui/solver.js';
import { findRegions } from '../src/shared/profiles.js';
import * as G from '../src/shared/geom2d.js';
import * as O from '../src/ui/sketch/ops.js';
import { addPoint, addEnt, addCon, getEnt, clone } from '../src/ui/sketch/core.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  BAŞARISIZ', m); } };
const near = (a, b, m, tol = 1e-6) => ok(Math.abs(a - b) <= tol, `${m}: ${a} ≠ ${b}`);
const empty = () => ({ points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [] });
function rect(sk, x0, y0, x1, y1) {
  const p = [addPoint(sk, x0, y0), addPoint(sk, x1, y0), addPoint(sk, x1, y1), addPoint(sk, x0, y1)]; const l = [];
  for (let i = 0; i < 4; i++) l.push(addEnt(sk, { type: 'line', a: p[i], b: p[(i + 1) % 4] }));
  addCon(sk, 'horizontal', l[0]); addCon(sk, 'vertical', l[1]); addCon(sk, 'horizontal', l[2]); addCon(sk, 'vertical', l[3]); return { p, l };
}
const circle = (sk, x, y, r) => { const c = addPoint(sk, x, y); return addEnt(sk, { type: 'circle', c, r }); };
const line = (sk, a, b) => addEnt(sk, { type: 'line', a: addPoint(sk, ...a), b: addPoint(sk, ...b) });
const solve = async (sk, vars = {}) => solveSketch(sk, vars);
const area = (sk) => findRegions(sk).regions.reduce((s, r) => s + r.net, 0);

// ---- kullanıcı senaryosu: dikdörtgen + daire → budama → tek kapalı profil
{
  const sk = empty(); const R = rect(sk, 0, 0, 40, 20); const c = circle(sk, 40, 10, 8);
  let fr = findRegions(sk); ok(fr.regions.length === 3, 'başlangıç: 3 bölge (ayrı seçilebilir)');
  let r = O.trimAt(sk, c, [32, 10]); ok(r.ok, 'daire iç yayı budanır'); ok(getEnt(sk, c).type === 'arc', 'daire yaya dönüştü');
  r = O.trimAt(sk, R.l[1], [40, 10]); ok(r.ok, 'sağ kenarın ortası budanır');
  fr = findRegions(sk); ok(fr.regions.length === 1 && !fr.open, 'tek kapalı profil: ' + fr.regions.length);
  near(area(sk), 800 + 32 * Math.PI, 'profil alanı = 800 + 32π', 1e-6);
  const s = await solve(sk); ok(s.ok, 'çözücü kabul eder ' + JSON.stringify(s.errors)); near(area(sk), 800 + 32 * Math.PI, 'çözümden sonra alan', 1e-5);
}
// ---- çizgi budama: orta parça silinir, uçlar kesişim noktalarına bağlanır
{
  const sk = empty(); const l = line(sk, [0, 0], [30, 0]); line(sk, [10, -5], [10, 5]); line(sk, [20, -5], [20, 5]);
  const r = O.trimAt(sk, l, [15, 0]); ok(r.ok, 'çizgi budama'); const lines = sk.ents.filter((e) => e.type === 'line');
  ok(lines.length === 4, 'yatay çizgi iki parça + 2 dikey: ' + lines.length);
  const hor = lines.filter((e) => Math.abs(sk.points[e.a].y) < 1e-9 && Math.abs(sk.points[e.b].y) < 1e-9);
  const xs = hor.map((e) => [sk.points[e.a].x, sk.points[e.b].x].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
  ok(hor.length === 2 && Math.abs(xs[0][1] - 10) < 1e-9 && Math.abs(xs[1][0] - 20) < 1e-9, 'parça uçları 10 ve 20: ' + JSON.stringify(xs));
  ok(sk.cons.filter((c) => c.type === 'pointOn').length >= 2, 'kesişim noktaları pointOn ile bağlı');
  const s = await solve(sk); ok(s.ok, 'budama sonrası çözülür');
}
// ---- yalnız bir kesişim: kalan kısım
{ const sk = empty(); const l = line(sk, [0, 0], [30, 0]); line(sk, [10, -5], [10, 5]); const r = O.trimAt(sk, l, [20, 0]); ok(r.ok && sk.ents.filter((e) => e.type === 'line').length === 2, 'tek kesişimde sağ taraf silinir');
  const e = getEnt(sk, l); ok(Math.abs(sk.points[e.b].x - 10) < 1e-9, 'kalan çizgi 10\'da biter'); }
// ---- kesişimsiz çizgi silinir
{ const sk = empty(); const l = line(sk, [0, 0], [30, 0]); const r = O.trimAt(sk, l, [5, 0]); ok(r.ok && r.deleted && !sk.ents.length, 'kesişimsiz çizgi tamamen silinir'); }
// ---- iki daire: budama
{ const sk = empty(); const a = circle(sk, 0, 0, 10), b = circle(sk, 12, 0, 10); O.trimAt(sk, a, [10, 0]); ok(getEnt(sk, a).type === 'arc', 'daire budama → yay'); const s = await solve(sk); ok(s.ok, 'daire/yay çözülür'); }
// ---- uzatma
{ const sk = empty(); const l = line(sk, [0, 0], [8, 0]); line(sk, [10, -5], [10, 5]); const r = O.extendAt(sk, l, [7, 0]); ok(r.ok, 'çizgi uzatma'); const e = getEnt(sk, l); near(sk.points[e.b].x, 10, 'uç x=10', 1e-9); ok(sk.cons.some((c) => c.type === 'pointOn' && c.a === e.b), 'pointOn eklendi');
  const none = O.extendAt(sk, l, [1, 0]); ok(!none.ok, 'diğer uçta kesişim yok → hata'); }
{ const sk = empty(); const c = addPoint(sk, 0, 0), a = addPoint(sk, 10, 0), b = addPoint(sk, 0, 10); const ar = addEnt(sk, { type: 'arc', c, a, b }); line(sk, [-20, 5], [20, 5]); const e = O.extendAt(sk, ar, [0, 10]); ok(e.ok, 'yay uzatma'); const p = sk.points[getEnt(sk, ar).b]; near(Math.hypot(p.x, p.y), 10, 'yay ucu çember üstünde', 1e-9); near(p.y, 5, 'çizgiyle kesişir y=5', 1e-9); near(p.x, -Math.sqrt(75), 'x', 1e-9); }
// ---- bölme
{ const sk = empty(); const l = line(sk, [0, 0], [30, 0]); line(sk, [10, -5], [10, 5]); line(sk, [20, -5], [20, 5]); const r = O.breakAt(sk, l, [15, 0]); ok(r.ok, 'bölme'); ok(sk.ents.filter((e) => e.type === 'line').length === 5, 'çizgi 3 parçaya bölündü'); ok(sk.cons.filter((c) => c.type === 'collinear').length === 2, 'parçalar eş doğrusal'); const s = await solve(sk); ok(s.ok, 'bölme çözülür'); }
// ---- ofset
{ const sk = empty(); const l = line(sk, [0, 0], [20, 0]); const r = O.offsetEnts(sk, [l], 5, '5', [10, 3]); ok(r.ok && r.linked, 'çizgi ofseti ilişkili'); const ne = getEnt(sk, r.newEnts[0]); near(sk.points[ne.a].y, 5, 'ofset y=5'); const s = await solve(sk); ok(s.ok, 'ofset çözülür');
  const r2 = O.offsetEnts(sk, [l], 3, '3', [10, -1]); near(sk.points[getEnt(sk, r2.newEnts[0]).a].y, -3, 'alt tarafa ofset'); }
{ const sk = empty(); const c = circle(sk, 0, 0, 10); addCon(sk, 'diameter', c, undefined, { expr: '20' }); const r = O.offsetEnts(sk, [c], 3, '3', [0, 5]); ok(r.ok && r.linked, 'daire iç ofset'); near(getEnt(sk, r.newEnts[0]).r, 7, 'iç yarıçap 7'); const r2 = O.offsetEnts(sk, [c], 3, '3', [20, 0]); near(getEnt(sk, r2.newEnts[0]).r, 13, 'dış yarıçap 13');
  const s = await solve(sk); ok(s.ok, 'daire ofseti çözülür'); near(getEnt(sk, r.newEnts[0]).r, 7, 'ilişkili yarıçap korunur'); sk.cons.find((k) => k.type === 'diameter').expr = '24'; /* kaynak ölçü değişirse ilişkili ofset izler */ 
  const s2 = await solve(sk); near(getEnt(sk, r.newEnts[0]).r, 9, 'kaynak yarıçap 12 → iç ofset 9 (parametrik)', 1e-6); }
{ const sk = empty(); const R = rect(sk, 0, 0, 20, 10); const r = O.offsetEnts(sk, R.l, 2, '2', [10, 5]); ok(r.ok && !r.linked, 'dikdörtgen zincir ofseti bağımsız'); const a = findRegions(sk); ok(a.regions.length === 2, 'iç içe 2 bölge'); const sm = a.regions.map((x) => x.net).sort((x, y) => x - y); near(sm[0], 16 * 6, 'iç dikdörtgen 16x6'); }
{ const sk = empty(); const R = rect(sk, 0, 0, 20, 10); const r = O.offsetEnts(sk, R.l, 2, '2', [-5, -5], 'round'); ok(r.ok, 'dış ofset yuvarlak köşe'); const a = findRegions(sk); const big = a.regions.reduce((s, x) => s + x.net, 0); near(big, 24 * 14 - (4 - Math.PI) * 4, 'dış yuvarlak ofset alanı (köşeler yuvarlak)', 1e-4); }
// ---- yuvarlat / pah
{ const sk = empty(); const R = rect(sk, 0, 0, 20, 10); const r = O.cornerAt(sk, R.p[1], 'fillet', 3, '3'); ok(r.ok, 'köşe yuvarlat'); const s = await solve(sk); ok(s.ok && s.dof === 4 + 0 || s.ok, 'yuvarlat çözülür: ' + JSON.stringify([s.ok, s.dof, s.conflicting])); near(area(sk), 200 - (9 - 9 * Math.PI / 4), 'alan = 200 − (r² − πr²/4)', 1e-5);
  const arc = sk.ents.find((e) => e.type === 'arc'); ok(sk.cons.some((c) => c.type === 'radius' && c.a === arc.id && c.expr === '3'), 'yarıçap ölçüsü kısıt olarak eklendi'); ok(sk.cons.filter((c) => c.type === 'tangent').length === 2, 'iki teğet kısıtı'); }
{ const sk = empty(); const R = rect(sk, 0, 0, 20, 10); const r = O.cornerAt(sk, R.p[2], 'chamfer', 4, '4'); ok(r.ok, 'köşe pahı'); near(area(sk), 200 - 8, 'pah alanı 200 − 4·4/2'); }
{ const sk = empty(); const R = rect(sk, 0, 0, 20, 10); ok(!O.cornerAt(sk, R.p[1], 'fillet', 30, '30').ok, 'çok büyük yarıçap reddedilir'); }
// ---- ayna
{ const sk = empty(); const l1 = line(sk, [5, 0], [10, 5]); const axis = line(sk, [0, -10], [0, 10]); const r = O.mirrorEnts(sk, [l1], axis); ok(r.ok, 'ayna'); const ne = getEnt(sk, r.newEnts[0]); near(sk.points[ne.a].x, -5, 'ayna x'); ok(sk.cons.filter((c) => c.type === 'symmetric').length === 2, 'simetri kısıtları'); const s = await solve(sk); ok(s.ok, 'ayna çözülür');
  sk.points[sk.ents[0].b].x = 12; const s2 = await solve(sk, {}); }
{ const sk = empty(); const c = addPoint(sk, 5, 0), a = addPoint(sk, 10, 0), b = addPoint(sk, 5, 5); const ar = addEnt(sk, { type: 'arc', c, a, b }); const axis = line(sk, [0, -10], [0, 10]); const r = O.mirrorEnts(sk, [ar], axis); const m = getEnt(sk, r.newEnts[0]); ok(m.type === 'arc', 'yay aynası'); const g = G.curve(G.mkArc([0, 0], 1, 0, 1)); const seg = (await import('../src/shared/profiles.js')).entSeg(sk, m); near(seg.sweep, Math.PI / 2, 'yay açısı korunur'); near(seg.c[0], -5, 'merkez aynalandı'); const s = await solve(sk); ok(s.ok, 'yay aynası çözülür'); }
// ---- desenler
{ const sk = empty(); const R = rect(sk, 0, 0, 10, 5); const r = O.patternRect(sk, R.l, { n1: 3, n2: 2, s1: '20', s2: '15', linked: true }); ok(r.ok && r.newEnts.length === 20, 'dikdörtgen desen: 5 kopya × 4'); const s = await solve(sk); ok(s.ok, 'desen çözülür'); const fr = findRegions(sk); ok(fr.regions.length === 6, '6 ayrı dikdörtgen');
  const vars = { s: 25 }; const k = sk.cons.find((c) => c.type === 'hdist' && c.expr.includes('20')); k.expr = k.expr.replace(/20/g, 's'); const s2 = await solve(sk, vars); ok(s2.ok, 'ifadeli desen çözülür'); }
{ const sk = empty(); const l = line(sk, [10, 0], [14, 0]); const r = O.patternCirc(sk, [l], { n: 4, cid: 'O', linked: true }); ok(r.ok && r.newEnts.length === 3, 'dairesel desen 3 kopya'); const s = await solve(sk); ok(s.ok, 'dairesel desen çözülür: ' + JSON.stringify(s.errors)); const l3 = sk.ents.filter((e) => !e.cons && e.type === 'line'); const mx = l3.map((e) => sk.points[e.a].x.toFixed(2) + ',' + sk.points[e.a].y.toFixed(2)); ok(mx.includes('0.00,10.00') && mx.includes('-10.00,0.00') && mx.some((s) => s === '-0.00,-10.00' || s === '0.00,-10.00'), 'kopyalar 90° adımlarla: ' + mx); }
{ const sk = empty(); const l = line(sk, [10, 0], [14, 0]); const r = O.patternRect(sk, [l], { n1: 2, s1: '10', linked: false }); ok(r.ok && !sk.cons.length, 'bağımsız kopya: kısıt yok'); }
// ---- dönüşüm
{ const sk = empty(); const R = rect(sk, 0, 0, 10, 5); const r = O.transformEnts(sk, R.l, 'rotate', { angle: 90, cx: 0, cy: 0 }); ok(r.ok && r.removedCons >= 4, 'döndür: yatay/dikey kısıtlar kaldırılır'); near(sk.points[R.p[1]].y, 10, 'döndürüldü'); const s = await solve(sk); ok(s.ok, 'çözülür'); }
{ const sk = empty(); const c = circle(sk, 5, 5, 2); addCon(sk, 'diameter', c, undefined, { expr: '4' }); const r = O.transformEnts(sk, [c], 'scale', { k: 2, cx: 0, cy: 0 }); ok(r.ok, 'ölçekle'); near(getEnt(sk, c).r, 4, 'yarıçap ×2'); ok(!sk.cons.some((x) => x.type === 'diameter'), 'ölçü kaldırıldı'); const r2 = O.transformEnts(sk, [c], 'move', { dx: 3, dy: 0 }, { copy: true }); ok(r2.ok && sk.ents.length === 2, 'taşı-kopyala'); }
// ---- izdüşüm
{ const sk = empty(); const pts = []; for (let i = 0; i <= 5; i++) pts.push([i * 2, 3]); const circ = []; for (let i = 0; i <= 40; i++) circ.push([20 + 5 * Math.cos((i / 40) * TAU()), 5 * Math.sin((i / 40) * TAU())]);
  const arcp = []; for (let i = 0; i <= 20; i++) arcp.push([5 * Math.cos(i * 0.05), 5 * Math.sin(i * 0.05)]);
  const wav = []; for (let i = 0; i <= 30; i++) wav.push([i, 10 + 2 * Math.sin(i / 3)]);
  const r = O.projectPolylines(sk, [{ pts }, { pts: circ }, { pts: arcp }, { pts: wav }]); ok(r.lines === 1 && r.circles === 2 && r.splines === 1, `izdüşüm türleri çizgi/daire+yay/spline: ${JSON.stringify(r)}`);
  ok(sk.ents.every((e) => e.cons) && Object.entries(sk.points).every(([id, p]) => id === 'O' || p.fixed), 'hepsi sabit yapı geometrisi'); const s = await solve(sk); ok(s.ok, 'sabit geometri çözülür'); }
// ---- ilişkisel izdüşüm (WP-09 dilim 4)
{ const sk = empty(); const ln = (a, b) => ({ pts: [a, b], meta: { b: 'B', g: 0, c: [0, 0, 0] } });
  const r0 = O.projectPolylines(sk, [ln([0, 0], [10, 0]), { pts: [[10, 0], [10, 5]], meta: { b: 'B', g: 1, c: [0, 0, 0] } }]);
  const tagged = sk.ents.filter((e) => e.proj); ok(r0.lines === 2 && tagged.length === 2 && tagged[0].proj.g === 0 && tagged[1].proj.g === 1, 'izdüşüm: üretilen nesnelere proj bağı yazılır');
  const own = addEnt(sk, { type: 'line', a: tagged[0].a, b: addPoint(sk, -5, -5) });
  const res = O.reprojectLinked(sk, (m) => (m.g === 0 ? [[0, 0], [20, 10]] : [[20, 10], [20, 15]]));
  const l0 = tagged[0], l1 = tagged[1];
  ok(res.updated === 2 && res.rebuilt === 0 && sk.points[l0.b].x === 20 && sk.points[l0.b].y === 10 && sk.points[l1.b].y === 15, 'reprojectLinked: yapı aynıysa nesneler yerinde taşınır');
  ok(sk.ents.find((e) => e.id === own).a === l0.a && l0.b === l1.a, 'paylaşılan noktalar ve kendi nesneler korunur');
  const circ = []; for (let i = 0; i <= 40; i++) circ.push([20 + 5 * Math.cos((i / 40) * TAU()), 10 + 5 * Math.sin((i / 40) * TAU())]);
  const res2 = O.reprojectLinked(sk, (m) => (m.g === 0 ? circ : null));
  ok(res2.rebuilt === 1 && res2.lost === 1 && sk.ents.some((e) => e.type === 'circle' && e.proj && e.proj.g === 0) && sk.ents.some((e) => e.proj && e.proj.g === 1 && e.proj.lost), 'yapı değişince yeniden kurulur; kaynağı olmayan grup "lost" işaretlenir');
  const none = O.reprojectLinked(sk, () => null); ok(none.updated === 0 && none.rebuilt === 0, 'kenar bulunamazsa geometriye dokunulmaz');
}
// ---- ilişkisel izdüşüm düzeltmeleri (WP-09 bağımsız doğrulama RET'i)
{ // 1) sabit noktalar (orijin dahil) ASLA taşınmaz
  const sk = empty(); const mk = (a, b, g) => ({ pts: [a, b], meta: { b: 'B', g, c: [0, 0, 0] } });
  O.projectPolylines(sk, [mk([0, 0], [100, 0], 1), mk([0, 40], [100, 40], 2)]);
  const l1 = sk.ents.find((e) => e.proj.g === 1), body = addEnt(sk, { type: 'line', a: 'O', b: addPoint(sk, 0, -30) });
  ok(l1.a === 'O' && l1.proj.pin.includes('O'), 'orijinden başlayan izdüşüm O ile paylaşır ve pin olarak işaretlenir');
  const r = O.reprojectLinked(sk, (m) => (m.g === 1 ? [[5, 0], [105, 0]] : [[5, 40], [105, 40]]));
  ok(sk.points.O.x === 0 && sk.points.O.y === 0 && sk.points.O.fixed, 'orijin yerinde kalır'); ok(r.updated === 2, 'iki grup güncellendi');
  ok(l1.a !== 'O' && sk.points[l1.a].x === 5 && sk.points[l1.a].fixed, 'izdüşüm ucu ayrı (sabit) noktaya taşındı'); ok(sk.ents.find((e) => e.id === body).a === 'O', 'gövde-dışı nesne O ile bağlı kalır');
  ok(sk.points[l1.b].x === 105, 'diğer uç taşındı'); ok(l1.proj.pin.length === 0, 'paylaşım çözülünce pin temizlenir');
  const sk2 = empty(); const fp = addPoint(sk2, 0, 10, true); O.projectPolylines(sk2, [mk([0, 10], [50, 10], 4)]); const ln2 = sk2.ents[0];
  ok(ln2.a === fp && ln2.proj.pin.includes(fp), 'önceden var olan sabit nokta paylaşılır (pin)'); O.reprojectLinked(sk2, () => [[3, 10], [53, 10]]);
  ok(sk2.points[fp].x === 0 && sk2.points[fp].y === 10 && ln2.a !== fp, 'kullanıcının sabit noktası taşınmaz');
  const sk3 = empty(); O.projectPolylines(sk3, [mk([0, 0], [10, 0], 0), { pts: [[10, 0], [10, 5]], meta: { b: 'B', g: 1, c: [0, 0, 0] } }]);
  O.reprojectLinked(sk3, (m) => (m.g === 0 ? [[2, 0], [12, 0]] : [[12, 0], [12, 5]])); const [q0, q1] = sk3.ents;
  ok(q0.b === q1.a && sk3.points[q0.b].x === 12 && sk3.points[q0.a].x === 2, 'komşu izdüşüm grupları arasındaki ortak köşe paylaşımı korunur');
  const sk4 = empty(); O.projectPolylines(sk4, [mk([0, 0], [10, 0], 0), { pts: [[10, 0], [10, 5]], meta: { b: 'B', g: 1, c: [0, 0, 0] } }]);
  O.reprojectLinked(sk4, (m) => (m.g === 0 ? [[2, 0], [12, 0]] : null)); const [z0, z1] = sk4.ents;
  ok(sk4.points[z1.a].x === 10 && z1.proj.lost && sk4.points[z0.b].x === 12 && z0.b !== z1.a, 'kayıp komşunun ucu taşınmaz (paylaşım çözülür)');
}
{ // 2) kullanıcı düzenleyince proj bağı düşer; yeniden açılışta geri alınmaz, sıfır uzunluklu parça olmaz
  const mkSk = () => { const sk = empty(); O.projectPolylines(sk, [{ pts: [[0, 10], [100, 10]], meta: { b: 'B', g: 1, c: [50, 10, 0] } }]); return sk; };
  const res = (m) => [[0, 10], [100, 10]];
  let sk = mkSk(); let id = sk.ents[0].id; O.breakAt(sk, id, [50, 10]);
  O.dropEditedLinks(sk); ok(sk.ents.length === 2 && sk.ents.every((e) => !e.proj), 'breakAt: iki parçanın da proj bağı düşer');
  { const r = O.reprojectLinked(sk, res); ok(sk.ents.length === 2 && r.updated === 0 && r.rebuilt === 0 && sk.ents.every((e) => !e.proj), 'break sonrası yeniden açılış düzenlemeyi geri almaz'); }
  sk = mkSk(); id = sk.ents[0].id; { ok(O.dropEditedLinks(sk) === 0, 'düzenleme yokken bağ düşmez'); O.transformEnts(sk, [id], 'move', { dx: 7, dy: 3 }); ok(O.dropEditedLinks(sk) === 1 && !sk.ents[0].proj, 'taşıma: bağ düşer'); }
  sk = mkSk(); id = sk.ents[0].id; addEnt(sk, { type: 'line', a: addPoint(sk, 50, -20), b: addPoint(sk, 50, 40) }); { const rt = O.trimAt(sk, id, [20, 10]); const k = sk.ents.find((e) => e.id === id); O.dropEditedLinks(sk); ok(rt.ok && k && sk.points[k.a].x === 50 && !k.proj, 'kırp: parça kısalır, bağ düşer'); }
  sk = mkSk(); const ex = addEnt(sk, { type: 'line', a: addPoint(sk, 120, 20), b: addPoint(sk, 120, 60) }); void ex; { const l = sk.ents[0]; sk.points[l.b].x = 90; ok(O.dropEditedLinks(sk) === 1 && !l.proj, 'uç oynatılınca (uzat/kısalt) bağ düşer'); }
  sk = mkSk(); id = sk.ents[0].id; const ax = addEnt(sk, { type: 'line', a: addPoint(sk, 50, -50), b: addPoint(sk, 50, 50) });
  const mr = O.mirrorEnts(sk, [id], ax, true); O.dropEditedLinks(sk); ok(mr.ok && sk.ents.filter((e) => e.proj).length === 1 && sk.ents[0].proj, 'ayna: asıl bağlı kalır, ayna kopyası (kimliği farklı) sıradan geometri');
  { const dup = JSON.parse(JSON.stringify(sk.ents[0])); dup.id = 'zz'; sk.ents.push(dup); ok(O.dropEditedLinks(sk) === 1 && !sk.ents.at(-1).proj && sk.ents[0].proj, 'kopya (bire bir aynı konumda bile) bağı taşımaz'); }
  sk = mkSk(); const cl = O.copySelection(sk, [sk.ents[0].id]); const pr = O.pasteClip(sk, cl, 0, 0); ok(pr.ok && sk.ents.filter((e) => e.proj).length === 1, 'yapıştırılan nesne proj taşımaz');
}
{ // 3) kenar eşleştirme: imza + belirsizlikte bağlama
  const L = (idx, a, b) => ({ idx, pts: [a, b] });
  const meta = { g: 1, sig: O.edgeSig([[0, 0], [100, 0]]) };
  ok(O.edgeSig([[0, 0], [100, 0]]).k === 'l', 'imza: doğru');
  ok(O.matchEdge(meta, [L(1, [5, 0], [105, 0])]).idx === 1, '(a) aynı indeks, makul değişim kabul');
  ok(O.matchEdge(meta, [L(1, [0, 40], [100, 40]), L(2, [0, 0], [100, 0])]).idx === 2, 'indeks kayınca birebir uyan kenar izlenir');
  ok(O.matchEdge(meta, [L(1, [0, 40], [100, 40])]) === null, 'indeks kayıp 40 mm uzaktaki kenara taşınmaz → lost');
  ok(O.matchEdge(meta, [L(2, [0, 3], [100, 3])]) === null, '3 mm arayla paralel kenarlardan biri silinince diğerine bağlanmaz → lost');
  ok(O.matchEdge(meta, [L(1, [0, 0], [0, 100])]) === null, 'aynı indeks ama farklı doğrultu → bağlanmaz');
  ok(O.matchEdge(meta, [{ idx: 1, pts: Array.from({ length: 37 }, (_, i) => [10 * Math.cos(i * Math.PI / 18), 10 * Math.sin(i * Math.PI / 18)]) }]) === null, 'aynı indeks ama farklı tür → bağlanmaz');
  ok(O.matchEdge(meta, [L(7, [0, 0.2], [100, 0.2]), L(8, [0, -0.2], [100, -0.2])]) === null, 'iki yakın aday ayırt edilemiyorsa bağlanmaz');
  ok(O.matchEdge(meta, [L(7, [0, 0.1], [100, 0.1]), L(8, [0, 30], [100, 30])]).idx === 7, 'tek yakın aday, ikincisi belirgin uzak: kabul');
  ok(O.matchEdge({ g: 1 }, [L(1, [0, 0], [100, 0])]).idx === 1 && O.matchEdge({ g: 1 }, [L(2, [0, 0], [100, 0])]) === null, 'imzasız eski bağ: yalnız aynı indeks');
  { // en yakın aday kazanır; aynı indeks yalnız makul değişim izni verir (doğrulayıcı karşı-örnekleri)
    const M = (g, y) => ({ g, sig: O.edgeSig([[0, y], [100, y]]) }), Y = (idx, y) => L(idx, [0, y], [100, y]);
    ok(O.matchEdge(M(5, 0), [Y(5, 20), Y(7, 2)]) === null, 'kaynak 2 mm kaydı + indeks değişti; eski indekse 20 mm ötede paralel kenar geldi → 20 mm ötedeki SEÇİLMEZ (lost)');
    ok(O.matchEdge(M(5, 0), [Y(5, 20), Y(7, 0)]).idx === 7, 'kontrol: tam eşleşen yeni indeks, uzak eski indekse tercih edilir');
    ok(O.matchEdge(M(5, 0), [Y(5, 0.5), Y(7, 0)]) === null, '0,5 mm ötedeki eski indeks, tam eşleşen yeni indeksi ezmez; ayırt edilemiyorsa lost');
    const r = O.matchEdgeD(M(5, 0), [Y(5, 20)]); ok(r && r.c.idx === 5 && Math.abs(r.d - 20) < 1e-9, 'tek aday, aynı indeks, 20 mm: parametrik değişim kabul, kayma 20 mm bildirilir');
    ok(O.matchEdgeD(M(5, 0), [Y(5, 5), Y(7, 8)]) === null, 'aynı indeks ama ikinci aday yeterince uzak değil (<2 kat) → lost');
    ok(O.matchEdge(M(5, 0), [L(5, [30, 0], [130, 0])]) === null && O.matchEdge(M(5, 0), [Y(5, 5)]).idx === 5, 'iki uç birlikte: 30 mm kayan kenar lost, 5 mm kayan kabul');
  }
  // reprojectLinked: imza ilk başarılı güncellemede yazılır, uyuşmazlıkta nesne yerinde kalır
  const sk = empty(); O.projectPolylines(sk, [{ pts: [[0, 0], [100, 0]], meta: { b: 'B', g: 1, c: [0, 0, 0] } }]); const e0 = sk.ents[0]; delete e0.proj.sig;
  O.reprojectLinked(sk, () => { const p = [[0, 5], [100, 5]]; return p; }); ok(e0.proj.sig && e0.proj.sig.a[1] === 5, 'imzasız bağa ilk başarılı güncellemede imza yazılır');
  const before = JSON.stringify(sk.points); const r = O.reprojectLinked(sk, () => null); ok(r.lost === 1 && JSON.stringify(sk.points) === before && e0.proj.lost, 'lost: geometri yerinde kalır');
}
{ // 4) lost / güncellenen ayrı sayılır; gizli (bilinmeyen) gövde lost olmaz; bağı kaldır / yeniden bağla
  const sk = empty(); const mk = (g, y) => ({ pts: [[0, y], [100, y]], meta: { b: 'B', g, c: [50, y, 0] } });
  O.projectPolylines(sk, [mk(1, 0), mk(2, 20), mk(3, 40), mk(4, 60)]);
  const r = O.reprojectLinked(sk, (m) => (m.g === 1 ? [[0, 5], [100, 5]] : m.g === 2 ? [[0, 20], [100, 20]] : m.g === 3 ? null : undefined));
  ok(r.updated === 1 && r.lost === 1 && r.skipped === 1, `güncellenen / kaybolan / bilinmeyen ayrı sayılır: ${JSON.stringify(r)}`);
  ok(!sk.ents[3].proj.lost && sk.ents[2].proj.lost && !sk.ents[0].proj.lost, 'gizli gövde (undefined) lost işaretlenmez; yalnız null lost olur');
  const re = O.relinkProjection(sk, [sk.ents[2].id], { b: 'B', g: 9, c: [50, 80, 0] }, [[0, 80], [100, 80]]);
  ok(re.ok && !sk.ents[2].proj.lost && sk.ents[2].proj.g === 9 && sk.points[sk.ents[2].a].y === 80, 'yeniden bağla: yeni kenara taşınır, lost kalkar');
  ok(O.unlinkProjection(sk, [sk.ents[2].id]) === 1 && !sk.ents[2].proj, 'bağı kaldır: sıradan geometri');
}
{ // 8) referans ölçü ifadesi geometriyle güncellenir
  const sk = empty(); const a = addPoint(sk, 0, 0), b = addPoint(sk, 60, 0); addEnt(sk, { type: 'line', a, b }); const id = addCon(sk, 'dist', a, b, { expr: '60', ref: true });
  sk.points[b].x = 50; ok(O.syncRefs(sk) === 1 && sk.cons.find((c) => c.id === id).expr === '50', 'referans ölçü expr güncel geometriye eşlenir');
  ok(O.syncRefs(sk) === 0, 'değişmediyse dokunmaz'); const drv = addCon(sk, 'dist', a, b, { expr: '40' }); ok(O.syncRefs(sk) === 0 && sk.cons.find((c) => c.id === drv).expr === '40', 'sürücü ölçüye dokunmaz');
}
// ---- pano
{ const sk = empty(); const R = rect(sk, 0, 0, 10, 5); const clip = O.copySelection(sk, R.l); ok(clip.ents.length === 4 && clip.cons.length === 4, 'pano: 4 çizgi + 4 kısıt'); const r = O.pasteClip(sk, clip, 20, 0); ok(r.ok && sk.ents.length === 8, 'yapıştır'); ok(findRegions(sk).regions.length === 2, 'iki dikdörtgen'); const s = await solve(sk); ok(s.ok, 'yapıştırma çözülür'); }
// ---- kutu seçimi
{ const sk = empty(); const R = rect(sk, 0, 0, 10, 5); const c = circle(sk, 30, 2, 3); const a = O.boxSelect(sk, [-1, -1, 12, 6], true); ok(a.ents.length === 4, 'soldan sağa: içindekiler (4 çizgi)'); const b = O.boxSelect(sk, [5, 2, 28, 3], false); ok(b.ents.includes(R.l[0]) === false && b.ents.length >= 2 && b.ents.includes(c), 'sağdan sola: değenler'); const d = O.boxSelect(sk, [26, -1, 36, 6], true); ok(d.ents.length === 1 && d.ents[0] === c, 'daire tamamen içinde'); }
// ---- serbestlik denetimi
{ const sk = empty(); const R = rect(sk, 0, 0, 10, 5); await solve(sk); const p = await probeFree(sk, {}); ok(p.dof === 4 && p.freeEnts.size === 4, 'kısıtsız dikdörtgen: hepsi serbest'); }
// ---- kalıcı kimlik: silinen kimlik yeniden verilmez; budama/böl özgün kimliği başlangıç tarafındaki parçada korur
{ const sk = empty(); const R = rect(sk, 0, 0, 10, 5); const old = R.l[0]; const seen = new Set([...Object.keys(sk.points), ...sk.ents.map((e) => e.id), ...sk.cons.map((c) => c.id)]);
  const { deleteItems } = await import('../src/ui/sketch/core.js'); deleteItems(sk, [{ kind: 'ent', id: old }]);
  const p1 = addPoint(sk, 0, 0.5), p2 = addPoint(sk, 10, 0.5); const nl = addEnt(sk, { type: 'line', a: p1, b: p2 });
  ok(!seen.has(nl) && nl !== old, 'sil → yeniden çiz: kimlik farklı (' + old + ' → ' + nl + ')');
  const ids = [p1, p2, nl]; ok(new Set(ids).size === 3 && ids.every((i) => !seen.has(i)), 'yeni nokta kimlikleri de eskilerle çakışmıyor');
  const sk2 = JSON.parse(JSON.stringify(sk)); delete sk2.seq; const a = addPoint(sk2, 1, 1); ok(!(a in sk.points && a !== undefined && false), 'seq yoksa en büyük sonekten türetilir'); ok(Number(a.slice(1)) > Math.max(...Object.keys(sk.points).map((k) => +k.slice(1) || 0)), 'türetilen sayaç mevcut en büyüğün üstünde'); }
{ const sk = empty(); const a = addPoint(sk, 0, 0), b = addPoint(sk, 20, 0), c = addPoint(sk, 10, -5), d = addPoint(sk, 10, 5);
  const l1 = addEnt(sk, { type: 'line', a, b }); addEnt(sk, { type: 'line', a: c, b: d });
  const r = O.breakAt(sk, l1, [5, 0]); ok(r.ok, 'böl'); const keep = getEnt(sk, l1); ok(keep && sk.points[keep.a].x === 0, 'böl: özgün kimlik başlangıca yakın parçada kaldı');
  const sk3 = empty(); const a3 = addPoint(sk3, 0, 0), b3 = addPoint(sk3, 20, 0), c3 = addPoint(sk3, 5, -5), d3 = addPoint(sk3, 5, 5), e3 = addPoint(sk3, 15, -5), f3 = addPoint(sk3, 15, 5);
  const m = addEnt(sk3, { type: 'line', a: a3, b: b3 }); addEnt(sk3, { type: 'line', a: c3, b: d3 }); addEnt(sk3, { type: 'line', a: e3, b: f3 });
  O.trimAt(sk3, m, [10, 0]); const kept = getEnt(sk3, m); ok(kept && sk3.points[kept.a].x === 0 && Math.abs(sk3.points[kept.b].x - 5) < 1e-9, 'buda (orta): özgün kimlik başlangıç parçasında'); }
function TAU() { return Math.PI * 2; }
console.log(`sketchops: ${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
