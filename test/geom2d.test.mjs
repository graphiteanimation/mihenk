// geom2d birim testleri: kesişimler analitik değerlerle, bölme, ofset, teğet, en yakın nokta, alan.
import * as G from '../src/shared/geom2d.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  BAŞARISIZ', m); } };
const near = (a, b, m, tol = 1e-9) => ok(Math.abs(a - b) <= tol, `${m}: ${a} ≠ ${b}`);
const pnear = (p, q, m, tol = 1e-9) => ok(Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol, `${m}: [${p}] ≠ [${q}]`);
const has = (pts, q, m, tol = 1e-8) => ok(pts.some((h) => Math.hypot(h.p[0] - q[0], h.p[1] - q[1]) <= tol), `${m}: [${q}] yok; var: ${JSON.stringify(pts.map((h) => h.p))}`);

// --- çizgi/çizgi
let r = G.intersect(G.mkLine([0, 0], [10, 10]), G.mkLine([0, 10], [10, 0]));
ok(r.pts.length === 1, 'x kesişimi tek nokta'); pnear(r.pts[0].p, [5, 5], 'x'); near(r.pts[0].ua, 0.5, 'ua');
r = G.intersect(G.mkLine([0, 0], [10, 0]), G.mkLine([0, 1], [10, 1])); ok(!r.pts.length && !r.overlap.length, 'paralel: yok');
r = G.intersect(G.mkLine([0, 0], [10, 0]), G.mkLine([5, 0], [15, 0])); ok(r.overlap.length === 1, 'çakışık: örtüşme'); near(r.overlap[0].a0, 0.5, 'örtüşme başı'); near(r.overlap[0].a1, 1, 'örtüşme sonu');
r = G.intersect(G.mkLine([0, 0], [10, 0]), G.mkLine([10, 0], [20, 0])); ok(r.pts.length === 1 && !r.overlap.length, 'uç uca eş doğrusal: tek nokta');
r = G.intersect(G.mkLine([0, 0], [10, 0]), G.mkLine([5, 0], [5, 8])); ok(r.pts.length === 1 && Math.abs(r.pts[0].ub) < 1e-12, 'T kavşak: ub=0');
r = G.intersect(G.mkLine([0, 0], [10, 0]), G.mkLine([5, 1e-8], [5, 8])); ok(r.pts.length === 1, 'T kavşak tolerans içinde (1e-8)');
r = G.intersect(G.mkLine([0, 0], [10, 0]), G.mkLine([5, 1e-6], [5, 8])); ok(r.pts.length === 0, 'tolerans dışı (1e-6): yok');
// --- çizgi/daire
r = G.intersect(G.mkLine([-10, 3], [10, 3]), G.mkCircle([0, 0], 5)); ok(r.pts.length === 2, 'çizgi-daire 2 nokta'); has(r.pts, [4, 3], 'ç-d'); has(r.pts, [-4, 3], 'ç-d');
r = G.intersect(G.mkLine([-10, 5], [10, 5]), G.mkCircle([0, 0], 5)); ok(r.pts.length === 1 && r.pts[0].tan, 'teğet değme: 1 nokta, tan'); pnear(r.pts[0].p, [0, 5], 'teğet noktası');
r = G.intersect(G.mkLine([-10, 5.0000001 + 1e-6], [10, 5.0000001 + 1e-6]), G.mkCircle([0, 0], 5)); ok(r.pts.length === 0, 'teğete yakın ama dışarıda');
r = G.intersect(G.mkLine([0, 0], [3, 0]), G.mkCircle([0, 0], 5)); ok(r.pts.length === 0, 'çizgi daire içinde kalır');
r = G.intersect(G.mkLine([0, 0], [10, 0]), G.mkArc([0, 0], 5, 0.1, 0.5)); ok(r.pts.length === 0, 'yay aralığı dışı'); // x ekseni 0 açısında, yay 0.1..0.6
r = G.intersect(G.mkLine([0, 0], [10, 0]), G.mkArc([0, 0], 5, -0.5, 1)); ok(r.pts.length === 1, 'yay aralığı içi'); near(r.pts[0].ub, 0.5, 'yay parametresi');
// --- daire/daire
r = G.intersect(G.mkCircle([0, 0], 5), G.mkCircle([6, 0], 5)); ok(r.pts.length === 2, 'daire-daire 2'); has(r.pts, [3, 4], 'd-d'); has(r.pts, [3, -4], 'd-d');
r = G.intersect(G.mkCircle([0, 0], 5), G.mkCircle([10, 0], 5)); ok(r.pts.length === 1 && r.pts[0].tan, 'dıştan teğet'); pnear(r.pts[0].p, [5, 0], 'dıştan teğet noktası');
r = G.intersect(G.mkCircle([0, 0], 5), G.mkCircle([2, 0], 3)); ok(r.pts.length === 1 && r.pts[0].tan, 'içten teğet'); pnear(r.pts[0].p, [5, 0], 'içten teğet noktası');
r = G.intersect(G.mkCircle([0, 0], 5), G.mkCircle([1, 0], 3)); ok(!r.pts.length, 'iç içe: yok');
r = G.intersect(G.mkCircle([0, 0], 5), G.mkCircle([0, 0], 5)); ok(r.overlap.length >= 1, 'aynı daire: örtüşme'); near(r.overlap[0].a1 - r.overlap[0].a0, G.TAU, 'tam çevre', 1e-9);
r = G.intersect(G.mkArc([0, 0], 5, 0, 2), G.mkArc([0, 0], 5, 1, 2)); ok(r.overlap.length === 1, 'yay örtüşmesi'); near(r.overlap[0].a0, 1, 'başlangıç'); near(r.overlap[0].a1, 2, 'bitiş');
// --- elips
r = G.intersect(G.mkLine([-10, 0], [10, 0]), G.mkEllipse([0, 0], 6, 3, 0)); ok(r.pts.length === 2, 'çizgi-elips'); has(r.pts, [6, 0], 'elips'); has(r.pts, [-6, 0], 'elips');
r = G.intersect(G.mkCircle([0, 0], 5), G.mkEllipse([0, 0], 6, 3, 0)); ok(r.pts.length === 4, 'daire-elips 4 nokta'); const xx = Math.sqrt(16 * 36 / 3 / 3 * 0 + 64 / 3 * 1) ; has(r.pts, [Math.sqrt(64 / 3), Math.sqrt(25 - 64 / 3)], 'daire-elips analitik');
r = G.intersect(G.mkEllipse([0, 0], 6, 3, 0), G.mkEllipse([0, 0], 3, 6, 0)); ok(r.pts.length === 4, 'iki elips 4 nokta'); has(r.pts, [Math.sqrt(36 / 5), Math.sqrt(36 / 5)], 'elips-elips'); // x²/36+y²/9=1, x²/9+y²/36=1 → x=y=√(36/5)
r = G.intersect(G.mkLine([-10, 3], [10, 3]), G.mkEllipse([0, 0], 6, 3, 0)); ok(r.pts.length === 1 && r.pts[0].tan, 'elipse teğet çizgi'); pnear(r.pts[0].p, [0, 3], 'elips teğet', 1e-6);
r = G.intersect(G.mkEllipse([0, 0], 6, 3, 0), G.mkEllipse([0, 0], 6, 3, 0)); ok(r.overlap.length === 1, 'aynı elips örtüşür');
const ea = G.mkEllArc([0, 0], 6, 3, 0, 0, Math.PI); r = G.intersect(G.mkLine([-10, 0], [10, 0]), ea); ok(r.pts.length === 2, 'elips yayı uçlarda kesişir');
r = G.intersect(G.mkLine([-10, -1], [10, -1]), ea); ok(r.pts.length === 0, 'elips yayının dışında kalan kesişim yok');
// --- spline
const S = G.mkSpline([[0, 0], [5, 5], [10, 0]]);
r = G.intersect(S, G.mkLine([5, -1], [5, 10])); ok(r.pts.length === 1, 'spline-çizgi'); pnear(r.pts[0].p, [5, 5], 'spline orta noktası geçer', 1e-9);
r = G.intersect(S, G.mkLine([0, 2], [10, 2])); ok(r.pts.length === 2, 'spline yatay çizgi 2'); near(r.pts[0].p[1], 2, 'y=2', 1e-9);
const S2 = G.mkSpline([[0, 3], [5, 0], [10, 3]]); r = G.intersect(S, S2); ok(r.pts.length === 2, 'spline-spline 2 nokta (simetri)'); near(r.pts[0].p[0] + r.pts[1].p[0], 10, 'simetrik x', 1e-7);
const Sc = G.mkSpline([[5, 0], [0, 5], [-5, 0], [0, -5]], true); r = G.intersect(Sc, G.mkLine([-10, 0], [10, 0])); ok(r.pts.length === 2, 'kapalı spline-çizgi'); has(r.pts, [5, 0], 'kapalı spline: noktadan geçer', 1e-9);
// --- bölme
let parts = G.splitAt(G.mkLine([0, 0], [10, 0]), [0.25, 0.75, 0.25]); ok(parts.length === 3, 'çizgi 3 parçaya'); pnear(parts[1].seg.p0, [2.5, 0], 'parça 1 başı'); pnear(parts[1].seg.p1, [7.5, 0], 'parça 1 sonu');
parts = G.splitAt(G.mkLine([0, 0], [10, 0]), [0, 1, 1e-12]); ok(parts.length === 1, 'uç noktalarda bölme yok');
parts = G.splitAt(G.mkCircle([0, 0], 5), [0, Math.PI]); ok(parts.length === 2 && parts.every((p) => Math.abs(p.seg.sweep - Math.PI) < 1e-12), 'daire 2 yarım yay');
parts = G.splitAt(G.mkCircle([0, 0], 5), [1]); ok(parts.length === 1 && Math.abs(parts[0].seg.sweep - G.TAU) < 1e-12, 'tek noktada bölünen daire: tam yay');
parts = G.splitAt(G.mkArc([0, 0], 5, 0, 2), [1]); near(parts[0].seg.sweep + parts[1].seg.sweep, 2, 'yay toplamı');
parts = G.splitAt(G.mkEllipse([0, 0], 6, 3, 0.3), [0, 2, 4]); ok(parts.length === 3 && parts.every((p) => p.seg.type === 'ellarc'), 'elips yaylara bölünür');
{ const pts = [[0, 0], [3, 4], [6, 1], [10, 6]]; const sp = G.mkSpline(pts); const ps = G.splitAt(sp, [G.endU(sp) / 2]); ok(ps.length === 2, 'spline ikiye'); const mid = G.ptAt(sp, G.endU(sp) / 2); pnear(ps[0].seg.p1, mid, 'spline kesim noktası', 1e-9);
  const q = G.ptAt(sp, G.endU(sp) * 0.2); ok(G.closestPoint(ps[0].seg, q).d < 2e-3, 'alt eğri asıl eğriye yakın (<2e-3)'); }
// --- en yakın nokta
let cp = G.closestPoint(G.mkLine([0, 0], [10, 0]), [4, 3]); near(cp.d, 3, 'çizgi uzaklığı'); near(cp.u, 0.4, 'çizgi u');
cp = G.closestPoint(G.mkLine([0, 0], [10, 0]), [14, 3]); pnear(cp.p, [10, 0], 'uca kıstırma');
cp = G.closestPoint(G.mkCircle([0, 0], 5), [10, 0]); near(cp.d, 5, 'daire'); pnear(cp.p, [5, 0], 'daire en yakın');
cp = G.closestPoint(G.mkEllipse([0, 0], 6, 3, 0), [0, 10]); near(cp.d, 7, 'elips tepe', 1e-7);
cp = G.closestPoint(G.mkEllipse([0, 0], 6, 3, 0), [10, 0]); near(cp.d, 4, 'elips uç', 1e-7);
cp = G.closestPoint(G.mkSpline([[0, 0], [5, 5], [10, 0]]), [5, 9]); near(cp.d, 4, 'spline tepe', 1e-6);
// --- uzunluk / alan
near(G.length(G.mkEllipse([0, 0], 5, 5, 0)), 10 * Math.PI, 'elips=daire çevresi', 1e-6); near(G.length(G.mkArc([0, 0], 4, 0, 1.5)), 6, 'yay boyu');
near(G.length(G.mkEllipse([0, 0], 6, 3, 0)), Math.PI * (27 - Math.sqrt(21 * 15)), 'elips çevresi (Ramanujan 29.0653)', 2e-3);
near(G.areaContribution(G.mkCircle([1, 2], 3)), Math.PI * 9, 'daire alanı'); near(G.areaContribution(G.mkEllipse([1, 2], 6, 3, 0.5)), Math.PI * 18, 'elips alanı');
{ const arc = G.mkArc([0, 0], 2, 0, Math.PI); const chord = G.mkLine(arc.p1, arc.p0); near(G.areaContribution(arc) + G.areaContribution(chord), Math.PI * 2, 'yarım daire alanı (yay+kiriş)'); }
{ const arc = G.mkArc([3, -2], 2, 0.4, 2.2); const chord = G.mkLine(arc.p1, arc.p0); const seg = 0.5 * 4 * (2.2 - Math.sin(2.2)); near(G.areaContribution(arc) + G.areaContribution(chord), seg, 'daire kesmesi alanı (merkez kaymış)'); }
// --- ofset
let o = G.offsetSeg(G.mkLine([0, 0], [10, 0]), 2); pnear(o.p0, [0, 2], 'çizgi ofseti sol'); pnear(o.p1, [10, 2], 'çizgi ofseti sol');
o = G.offsetSeg(G.mkCircle([0, 0], 5), -2); near(o.r, 7, 'daire dış ofset'); o = G.offsetSeg(G.mkCircle([0, 0], 5), 2); near(o.r, 3, 'daire iç ofset'); ok(G.offsetSeg(G.mkCircle([0, 0], 5), 6) === null, 'daire iç ofset sıfırı aşar → null');
o = G.offsetSeg(G.mkArc([0, 0], 5, 0, 1), 1); near(o.r, 4, 'yay iç ofset'); near(o.sweep, 1, 'yay açısı korunur');
o = G.offsetSeg(G.mkEllipse([0, 0], 6, 3, 0), -1); ok(o.type === 'spline' && o.approx, 'elips ofseti yaklaşık spline'); near(G.closestPoint(G.mkEllipse([0, 0], 6, 3, 0), o.pts[0]).d, 1, 'elips ofset mesafesi', 1e-6);
// zincir ofseti: L şekli, sivri köşe
{ const ch = [{ seg: G.mkLine([0, 0], [10, 0]), fwd: true }, { seg: G.mkLine([10, 0], [10, 10]), fwd: true }];
  let out = G.offsetChain(ch, -2, 'sharp'); ok(out.length === 2, 'L zinciri sivri: 2 parça'); pnear(out[0].seg.p1, [12, -2], 'dış köşe sivri'); pnear(out[1].seg.p0, [12, -2], 'dış köşe sivri 2');
  out = G.offsetChain(ch, 2, 'sharp'); pnear(out[0].seg.p1, [8, 2], 'iç köşe kırpılır'); pnear(out[1].seg.p0, [8, 2], 'iç köşe kırpılır 2');
  out = G.offsetChain(ch, -2, 'round'); ok(out.length === 3 && out[1].seg.type === 'arc', 'dış köşe yuvarlak: yay eklenir'); near(out[1].seg.r, 2, 'köşe yayı yarıçapı'); near(out[1].seg.sweep, Math.PI / 2, 'köşe yayı açısı'); pnear(out[1].seg.c, [10, 0], 'köşe yayı merkezi');
  // ters yönde gidiş: sol taraf değişir
  const rv = [{ seg: G.mkLine([10, 10], [10, 0]), fwd: false }, { seg: G.mkLine([10, 0], [0, 0]), fwd: false }];
  out = G.offsetChain([{ seg: ch[1].seg, fwd: false }, { seg: ch[0].seg, fwd: false }], 2, 'sharp'); ok(out.length === 2, 'ters zincir'); }
// teğetler
{ const t = G.tangentPoints([10, 0], [0, 0], 5); ok(t.length === 2, 'noktadan daireye 2 teğet'); for (const q of t) { near(Math.hypot(q[0], q[1]), 5, 'teğet noktası daire üstünde'); near((q[0] - 10) * q[0] + q[1] * q[1], 0, 'teğet dik', 1e-9); }
  ok(G.tangentPoints([3, 0], [0, 0], 5).length === 0, 'daire içinden teğet yok'); ok(G.tangentPoints([5, 0], [0, 0], 5).length === 1, 'daire üstünde 1');
  const ct = G.commonTangents([0, 0], 2, [10, 0], 1); ok(ct.length === 4, 'iki daire 4 ortak teğet'); for (const c of ct) { near(Math.hypot(c.a[0], c.a[1]), 2, 'a daire üstünde'); near(Math.hypot(c.b[0] - 10, c.b[1]), 1, 'b daire üstünde'); const d = [c.b[0] - c.a[0], c.b[1] - c.a[1]]; near(d[0] * c.a[0] + d[1] * c.a[1], 0, 'teğet 1. daireye dik yarıçap', 1e-9); near(d[0] * (c.b[0] - 10) + d[1] * c.b[1], 0, 'teğet 2. daireye dik yarıçap', 1e-9); }
  ok(G.commonTangents([0, 0], 5, [1, 0], 1).length === 0, 'içte daire: ortak teğet yok'); }
// yuvarlatma merkezi
{ const A = G.mkLine([0, 0], [10, 0]), B = G.mkLine([0, 0], [0, 10]); const f = G.filletCenter(A, B, 2, [0, 0]); pnear(f.c, [2, 2], 'dik köşe yuvarlatma merkezi'); pnear(f.tA, [2, 0], 'teğet noktası A'); pnear(f.tB, [0, 2], 'teğet noktası B');
  const C = G.mkCircle([0, 0], 5); const L2 = G.mkLine([-10, 5.0], [10, 5.0]); ok(G.filletCenter(L2, C, 1, [0, 5]) !== null, 'çizgi-daire yuvarlatma var'); }
console.log(`geom2d: ${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
