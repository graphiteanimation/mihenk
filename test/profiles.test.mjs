// findRegions birim testleri: belirli durumlar (analitik) + 600 rastgele durumda bölge alanları, bağımsız ızgara yöntemiyle karşılaştırılır.
import { findRegions, regionContains } from '../src/shared/profiles.js';
import * as G from '../src/shared/geom2d.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  BAŞARISIZ', m); } };
const near = (a, b, m, tol = 1e-6) => ok(Math.abs(a - b) <= tol, `${m}: ${a} ≠ ${b}`);

class Sk {
  constructor() { this.points = { O: { x: 0, y: 0, fixed: true } }; this.ents = []; this.n = 0; }
  pt(x, y) { const id = 'p' + ++this.n; this.points[id] = { x, y }; return id; }
  line(a, b) { const A = this.pt(...a), B = this.pt(...b); this.ents.push({ id: 'e' + ++this.n, type: 'line', a: A, b: B }); }
  poly(pts, closed = true) { const ids = pts.map((p) => this.pt(...p)); const m = closed ? pts.length : pts.length - 1; for (let i = 0; i < m; i++) this.ents.push({ id: 'e' + ++this.n, type: 'line', a: ids[i], b: ids[(i + 1) % ids.length] }); }
  rect(x0, y0, x1, y1) { this.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); }
  circle(x, y, r) { this.ents.push({ id: 'e' + ++this.n, type: 'circle', c: this.pt(x, y), r }); }
  arc(c, a, b) { this.ents.push({ id: 'e' + ++this.n, type: 'arc', c: this.pt(...c), a: this.pt(...a), b: this.pt(...b) }); }
  ellipse(c, f, rmin) { this.ents.push({ id: 'e' + ++this.n, type: 'ellipse', c: this.pt(...c), f: this.pt(...f), rmin }); }
  spline(pts, closed) { this.ents.push({ id: 'e' + ++this.n, type: 'spline', pts: pts.map((p) => this.pt(...p)), closed: !!closed }); }
}
const net = (r) => r.net;
const total = (o) => o.regions.reduce((s, r) => s + net(r), 0);
const lens = (r1, r2, d) => r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1)) + r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2)) - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));

// ---- belirli durumlar
{ const s = new Sk(); s.rect(0, 0, 40, 40); s.line([0, 0], [40, 40]); s.line([40, 0], [0, 40]); const o = findRegions(s);
  ok(o.regions.length === 4, 'F-04 çarpı köşegen: 4 bölge'); o.regions.forEach((r) => near(net(r), 400, 'üçgen alanı 400', 1e-9)); ok(o.open === false, 'çarpı: open=false'); }
{ const s = new Sk(); s.rect(0, 0, 40, 20); s.circle(40, 10, 8); const o = findRegions(s); // dikdörtgen + daire (Fusion gibi): 3 bölge
  ok(o.regions.length === 3, 'dikdörtgen+daire 3 bölge: ' + o.regions.length);
  const L = [...o.regions].map(net).sort((a, b) => a - b); const circ = Math.PI * 64;
  // daire merkezi kenarın ortasında (x=40,y=10): yarım daire içeride
  near(L[0], circ / 2, 'daire dışı yarım', 0.05); near(L[1], circ / 2, 'ortak yarım daire', 0.05); near(L[2], 800 - circ / 2, 'dikdörtgen dışı', 0.05); }
{ const s = new Sk(); s.circle(0, 0, 10); s.circle(12, 0, 10); const o = findRegions(s); ok(o.regions.length === 3, 'iki daire 3 bölge'); const A = lens(10, 10, 12);
  const L = o.regions.map(net).sort((a, b) => a - b); near(L[0], A, 'mercek alanı', 1e-6); near(L[1], Math.PI * 100 - A, 'ay 1', 1e-6); near(L[2], Math.PI * 100 - A, 'ay 2', 1e-6); }
{ const s = new Sk(); s.rect(0, 0, 10, 10); s.rect(0, 0, 10, 10); const o = findRegions(s); ok(o.regions.length === 1, 'üst üste aynı dikdörtgen: 1 bölge'); near(net(o.regions[0]), 100, 'alan'); ok(o.issues.some((i) => i.code === 'duplicate'), 'yinelenme bildirilir'); }
{ const s = new Sk(); s.circle(5, 5, 3); s.circle(5, 5, 3); const o = findRegions(s); ok(o.regions.length === 1, 'aynı daire iki kez: 1 bölge'); near(net(o.regions[0]), Math.PI * 9, 'alan', 1e-9); }
{ const s = new Sk(); s.poly([[0, 0], [10, 10], [10, 0], [0, 10]]); const o = findRegions(s); ok(o.regions.length === 2, 'kelebek (kendini kesen): 2 üçgen'); o.regions.forEach((r) => near(net(r), 25, 'üçgen 25', 1e-9)); }
{ const s = new Sk(); s.rect(0, 0, 10, 10); s.rect(30, 0, 40, 10); s.line([10, 5], [30, 5]); const o = findRegions(s); ok(o.regions.length === 2, 'köprü ile bağlı iki kare: 2 bölge'); ok(o.open === true && o.issues.some((i) => i.code === 'dangling'), 'köprü sarkan olarak bildirilir'); near(total(o), 200, 'toplam'); }
{ const s = new Sk(); s.rect(0, 0, 10, 10); s.line([5, 5], [5, 20]); const o = findRegions(s); ok(o.regions.length === 1 && o.open, 'içeri/dışarı uzanan sarkan çizgi'); near(net(o.regions[0]), 100, 'alan'); }
{ const s = new Sk(); s.circle(0, 0, 50); s.rect(-30, -30, 30, 30); s.circle(0, 0, 10); const o = findRegions(s); ok(o.regions.length === 3, 'iç içe 3'); near(total(o), Math.PI * 2500, 'toplam', 1e-6); }
{ const s = new Sk(); s.rect(0, 0, 100, 50); s.line([50, 0], [50, 50]); const o = findRegions(s); ok(o.regions.length === 2, 'T kavşak'); o.regions.forEach((r) => near(net(r), 2500, 'yarım', 1e-9)); }
{ const s = new Sk(); s.circle(0, 0, 5); s.circle(10, 0, 5); const o = findRegions(s); ok(o.regions.length === 2, 'dıştan teğet daireler: 2 bölge'); near(total(o), 50 * Math.PI, 'toplam'); }
{ const s = new Sk(); s.circle(0, 0, 10); s.circle(5, 0, 5); const o = findRegions(s); ok(o.regions.length === 2, 'içten teğet daireler: 2 bölge (halka + küçük daire)'); near(total(o), 100 * Math.PI, 'toplam', 1e-6); }
{ const s = new Sk(); s.circle(0, 0, 10); s.line([-20, 10], [20, 10]); const o = findRegions(s); ok(o.regions.length === 1, 'teğet çizgi daireyi bölmez'); }
{ const s = new Sk(); s.rect(0, 0, 10, 10); s.rect(10, 0, 20, 10); const o = findRegions(s); ok(o.regions.length === 2, 'ortak kenarlı komşular'); near(total(o), 200, 'toplam'); }
{ const s = new Sk(); s.rect(0, 0, 10, 10); s.rect(5, 0, 15, 10); const o = findRegions(s); ok(o.regions.length === 3, 'yarı çakışık ortak kenar (kısmi örtüşme)'); near(total(o), 150, 'toplam'); }
{ const s = new Sk(); s.ellipse([0, 0], [Math.sqrt(27), 0], 3); const o = findRegions(s); ok(o.regions.length === 1 && o.regions[0].loop[0].type === 'ellipse', 'elips bölgesi'); near(net(o.regions[0]), Math.PI * 6 * 3, 'elips alanı (rx=6, ry=3)', 1e-9); near(o.regions[0].loop[0].rx, 6, 'rx', 1e-12); }
{ const s = new Sk(); s.ellipse([0, 0], [Math.sqrt(27), 0], 3); s.rect(0, -10, 10, 10); const o = findRegions(s); ok(o.regions.length === 3, 'elips + dikdörtgen: 3 bölge'); const L = o.regions.map(net).sort((a, b) => a - b); near(L[0], 9 * Math.PI, 'sol yarım elips', 1e-8); near(L[1], 9 * Math.PI, 'sağ yarım elips', 1e-8); near(L[2], 200 - 9 * Math.PI, 'dikdörtgen kalanı', 1e-8); ok(o.regions.some((r) => r.loop.some((x) => x.type === 'ellarc' && x.ent)), 'elips yayları ellarc olarak ve ent ile döner'); }
{ const s = new Sk(); s.spline([[0, 0], [10, 6], [20, 0], [10, -6]], true); const o = findRegions(s); ok(o.regions.length === 1 && o.regions[0].loop[0].type === 'spline' && o.regions[0].loop[0].closed, 'kapalı spline bölgesi'); { const smp = G.sample(G.mkSpline([[0, 0], [10, 6], [20, 0], [10, -6]], true), 0.0005); near(net(o.regions[0]), Math.abs(G.polyArea(smp.slice(0, -1))), 'spline alanı = örneklenmiş çokgen alanı', 1e-3); } }
{ const s = new Sk(); s.spline([[0, 0], [10, 8], [20, 0]]); s.line([20, 0], [0, 0]); const o = findRegions(s); ok(o.regions.length === 1, 'spline + kiriş kapalı profil'); ok(o.regions[0].loop.some((x) => x.type === 'spline' && x.pts.length >= 3), 'spline parçası döngüde'); ok(o.regions[0].loop.every((x) => x.ent), 'tüm parçalarda ent var'); }
{ const s = new Sk(); s.rect(0, 0, 10, 10); s.line([-5, 5], [15, 5]); const o = findRegions(s); ok(o.regions.length === 2 && o.regions.every((r) => r.loop.every((x) => typeof x.ent === 'string')), 'bölücü çizgi: 2 bölge, ent alanı'); near(total(o), 100, 'toplam'); }
{ const s = new Sk(); s.arc([0, 0], [10, 0], [-10, 0]); s.line([-10, 0], [10, 0]); const o = findRegions(s); ok(o.regions.length === 1, 'yarım daire (yay+kiriş)'); near(net(o.regions[0]), Math.PI * 50, 'yarım daire alanı', 1e-9); }
{ const s = new Sk(); const o = findRegions(s); ok(o.regions.length === 0 && o.open === false, 'boş sketch'); }
{ const s = new Sk(); s.line([0, 0], [10, 0]); s.line([10, 0], [10, 10]); const o = findRegions(s); ok(o.regions.length === 0 && o.open === true, 'açık profil: bölge yok, open=true'); }
{ const s = new Sk(); s.poly([[0, 0], [10, 0], [10, 10], [5, 10], [5 - 1e-8, 10], [0, 10]]); const o = findRegions(s); ok(o.regions.length === 1, 'çok kısa kenar (F-24/F-05)'); near(net(o.regions[0]), 100, 'alan', 1e-6); }
{ const s = new Sk(); s.rect(0, 0, 10, 10); const a = s.pt(10, 10 + 2e-7); s.line([10 + 2e-7, 0], [10, 10]); const o = findRegions(s); ok(o.regions.length >= 1, 'ızgara sınırı yakınındaki noktalar birleşir'); }
{ const s = new Sk(); s.line([0, 0], [10, 0]); s.line([10, 1e-9], [10, 10]); s.line([10, 10], [0, 10]); s.line([0, 10], [0, 1e-9]); const o = findRegions(s); ok(o.regions.length === 1 && Math.abs(net(o.regions[0]) - 100) < 1e-6, '1e-9 aralıklı köşeler birleşir'); }

// ---- rastgele durumlar (bağımsız ızgara denetimi)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeCase(seed) {
  const R = rng(seed), integer = R() < 0.5, n = 2 + Math.floor(R() * 4), shapes = [];
  const rv = (a, b) => (integer ? Math.round(a + R() * (b - a)) : a + R() * (b - a));
  for (let i = 0; i < n; i++) {
    const k = R();
    if (k < 0.4) shapes.push({ t: 'circle', x: rv(12, 38), y: rv(12, 38), r: Math.max(integer ? 2 : 2.3, rv(3, 14)) });
    else if (k < 0.8) { const x = rv(5, 35), y = rv(5, 35), w = Math.max(integer ? 3 : 3.1, rv(4, 20)), h = Math.max(integer ? 3 : 3.1, rv(4, 20)); shapes.push({ t: 'rect', x, y, w, h, rot: integer ? 0 : R() * Math.PI }); }
    else { const x = rv(8, 35), y = rv(8, 35); shapes.push({ t: 'tri', pts: [[x, y], [x + rv(4, 18), y + rv(-4, 6)], [x + rv(-6, 10), y + rv(5, 18)]] }); }
  }
  if (R() < 0.15) shapes.push({ ...shapes[Math.floor(R() * shapes.length)] }); // yinelenen
  if (integer && R() < 0.3) { const a = shapes.find((s) => s.t === 'rect'); if (a) shapes.push({ t: 'rect', x: a.x + a.w, y: a.y, w: 6, h: a.h, rot: 0 }); } // ortak kenar
  return shapes;
}
const rotPt = (s, u, v) => { const c = Math.cos(s.rot), n = Math.sin(s.rot); u -= s.w / 2; v -= s.h / 2; return [s.x + s.w / 2 + u * c - v * n, s.y + s.h / 2 + u * n + v * c]; };
function rectCorners(s) { return [rotPt(s, 0, 0), rotPt(s, s.w, 0), rotPt(s, s.w, s.h), rotPt(s, 0, s.h)]; }
function toSk(shapes) {
  const sk = new Sk();
  for (const s of shapes) { if (s.t === 'circle') sk.circle(s.x, s.y, s.r); else if (s.t === 'rect') sk.poly(rectCorners(s)); else sk.poly(s.pts); }
  return sk;
}
function inShape(s, px, py) {
  if (s.t === 'circle') return (px - s.x) ** 2 + (py - s.y) ** 2 < s.r * s.r;
  const pts = s.t === 'rect' ? rectCorners(s) : s.pts; return G.pointInPoly([px, py], pts);
}
function perim(s) { if (s.t === 'circle') return 2 * Math.PI * s.r; const pts = s.t === 'rect' ? rectCorners(s) : s.pts; let L = 0; for (let i = 0; i < pts.length; i++) L += G.dist(pts[i], pts[(i + 1) % pts.length]); return L; }
const H = 0.25, N = 320, OFF = 1e-3 * Math.PI; // alan [-15, 65]² : 320 hücre
let nCases = 0, nFacesChecked = 0, worst = 0;
for (let seed = 1; seed <= 600; seed++) {
  const shapes = makeCase(seed); const sk = toSk(shapes); let o;
  try { o = findRegions(sk); } catch (e) { ok(false, `rastgele #${seed}: istisna ${e.message}`); continue; }
  nCases++;
  const masks = new Int32Array(N * N); const ma = new Map();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const px = -15 + (i + 0.5) * H + OFF, py = -15 + (j + 0.5) * H - OFF; let m = 0;
    for (let k = 0; k < shapes.length; k++) if (inShape(shapes[k], px, py)) m |= 1 << k;
    masks[j * N + i] = m; ma.set(m, (ma.get(m) || 0) + H * H);
  }
  // boşluklar: sınıra bağlı olmayan maske-0 bileşenleri
  const seen = new Uint8Array(N * N); const stack = [];
  const push = (i, j) => { if (i < 0 || j < 0 || i >= N || j >= N) return; const q = j * N + i; if (seen[q] || masks[q] !== 0) return; seen[q] = 1; stack.push(q); };
  for (let i = 0; i < N; i++) { push(i, 0); push(i, N - 1); push(0, i); push(N - 1, i); }
  while (stack.length) { const q = stack.pop(), i = q % N, j = (q / N) | 0; push(i + 1, j); push(i - 1, j); push(i, j + 1); push(i, j - 1); }
  let voidArea = 0; for (let q = 0; q < N * N; q++) if (masks[q] === 0 && !seen[q]) voidArea += H * H;
  const P = shapes.reduce((s, x) => s + perim(x), 0);
  const tol = 0.1 * H * P + 0.5;
  // bölge net alanları, temsilci noktanın maskesine göre
  const got = new Map(); let sum = 0;
  for (const r of o.regions) {
    let m = 0; for (let k = 0; k < shapes.length; k++) if (inShape(shapes[k], r.inside[0], r.inside[1])) m |= 1 << k;
    got.set(m, (got.get(m) || 0) + r.net); sum += r.net;
  }
  const unionArea = [...ma].filter(([m]) => m !== 0).reduce((s, [, a]) => s + a, 0);
  const err = Math.abs(sum - unionArea - voidArea); worst = Math.max(worst, err / Math.max(1, tol));
  ok(err <= tol, `rastgele #${seed}: bölge alanları toplamı ${sum.toFixed(3)} ≠ birleşim ${unionArea.toFixed(3)} + boşluk ${voidArea.toFixed(3)} (tol ${tol.toFixed(2)})`);
  for (const [m, a] of ma) { if (m === 0) continue; const g = got.get(m) || 0; const e2 = Math.abs(g - a); if (e2 > tol) { ok(false, `rastgele #${seed}: maske ${m} alanı bölge ${g.toFixed(3)} ≠ ızgara ${a.toFixed(3)}`); } nFacesChecked++; }
  ok(o.open === false || o.issues.every((i) => i.code === 'duplicate' || i.code === 'overlap'), `rastgele #${seed}: kapalı şekillerde open/issue beklenmez: ${JSON.stringify(o.issues.slice(0, 2))}`);
  // bölgeler birbirini örtmez; birleşim içindeki noktalar tam 1 bölgede
  const R2 = rng(seed * 7 + 1);
  for (let t = 0; t < 120; t++) {
    const px = R2() * 60 - 5, py = R2() * 60 - 5; const cnt = o.regions.filter((r) => regionContains(r, [px, py])).length; const inU = shapes.some((s) => inShape(s, px, py));
    if (cnt > 1) { ok(false, `rastgele #${seed}: nokta ${cnt} bölgede`); break; }
    if (inU && cnt !== 1) { // sınıra çok yakınsa atla
        const near_ = shapes.some((s) => { if (s.t === 'circle') return Math.abs(Math.hypot(px - s.x, py - s.y) - s.r) < 0.02; const pts = s.t === 'rect' ? rectCorners(s) : s.pts; return pts.some((p, i) => { const q = pts[(i + 1) % pts.length]; return G.closestPoint(G.mkLine(p, q), [px, py]).d < 0.02; }); });
        if (!near_) { ok(false, `rastgele #${seed}: birleşim içi nokta ${cnt} bölgede`); break; }
    }
  }
}
ok(nCases >= 500, 'en az 500 rastgele durum koşuldu: ' + nCases);
console.log(`profiles: ${pass} geçti, ${fail} kaldı (rastgele durum: ${nCases}, kontrol edilen maske-bölge: ${nFacesChecked}, en kötü hata/tol: ${worst.toFixed(3)})`);
process.exit(fail ? 1 : 0);
