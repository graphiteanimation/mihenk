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
// ---- pano
{ const sk = empty(); const R = rect(sk, 0, 0, 10, 5); const clip = O.copySelection(sk, R.l); ok(clip.ents.length === 4 && clip.cons.length === 4, 'pano: 4 çizgi + 4 kısıt'); const r = O.pasteClip(sk, clip, 20, 0); ok(r.ok && sk.ents.length === 8, 'yapıştır'); ok(findRegions(sk).regions.length === 2, 'iki dikdörtgen'); const s = await solve(sk); ok(s.ok, 'yapıştırma çözülür'); }
// ---- kutu seçimi
{ const sk = empty(); const R = rect(sk, 0, 0, 10, 5); const c = circle(sk, 30, 2, 3); const a = O.boxSelect(sk, [-1, -1, 12, 6], true); ok(a.ents.length === 4, 'soldan sağa: içindekiler (4 çizgi)'); const b = O.boxSelect(sk, [5, 2, 28, 3], false); ok(b.ents.includes(R.l[0]) === false && b.ents.length >= 2 && b.ents.includes(c), 'sağdan sola: değenler'); const d = O.boxSelect(sk, [26, -1, 36, 6], true); ok(d.ents.length === 1 && d.ents[0] === c, 'daire tamamen içinde'); }
// ---- serbestlik denetimi
{ const sk = empty(); const R = rect(sk, 0, 0, 10, 5); await solve(sk); const p = await probeFree(sk, {}); ok(p.dof === 4 && p.freeEnts.size === 4, 'kısıtsız dikdörtgen: hepsi serbest'); }
function TAU() { return Math.PI * 2; }
console.log(`sketchops: ${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
