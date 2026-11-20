// WP-17 teknik resim: saf 2B yardimcilar (bagimliliksiz; cekirdek ve arayuz ortak kullanir). Birim: mm, aci: radyan.
// Gorunus ilkeli (prim) bicimleri (JSON'a uygun):
//   {t:'l', a:[x,y], b:[x,y]}                  dogru parcasi
//   {t:'a', c:[x,y], r, a0, sw}                yay: a0'dan saat yonu tersine sw (0 < sw < 2pi)
//   {t:'c', c:[x,y], r}                        tam daire
//   {t:'p', pts:[[x,y],...]}                   cokgen cizgi (elips, B-spline vb. kiris hatasi <= CHORD)
// Ek alanlar (cekirdek ciktisi): vis (gorunur mu), k ('s' keskin | 'g' teget | 'o' siluet), src (model kenar anahtari | null).
export const TAU = Math.PI * 2;
export const CHORD = 0.005;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const crs = (a, b) => a[0] * b[1] - a[1] * b[0];
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const wrapA = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };

export function segDist(p, a, b) {
  const d = sub(b, a); const L2 = dot(d, d); if (L2 < 1e-24) return dist(p, a);
  let u = dot(sub(p, a), d) / L2; u = Math.max(0, Math.min(1, u));
  return Math.hypot(p[0] - a[0] - d[0] * u, p[1] - a[1] - d[1] * u);
}
const inSweep = (ang, a0, sw) => wrapA(ang - a0) <= sw + 1e-9;
export const arcPt = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];

// ilkelin uc noktalari [bas, son] (daire: null)
export function ends(p) {
  if (p.t === 'l') return [p.a, p.b];
  if (p.t === 'a') return [arcPt(p.c, p.r, p.a0), arcPt(p.c, p.r, p.a0 + p.sw)];
  if (p.t === 'p') return [p.pts[0], p.pts[p.pts.length - 1]];
  return null;
}
// noktadan ilkele uzaklik
export function primDist(q, p) {
  if (p.t === 'l') return segDist(q, p.a, p.b);
  if (p.t === 'c') return Math.abs(dist(q, p.c) - p.r);
  if (p.t === 'a') {
    const ang = Math.atan2(q[1] - p.c[1], q[0] - p.c[0]);
    if (inSweep(ang, p.a0, p.sw)) return Math.abs(dist(q, p.c) - p.r);
    const [s, e] = ends(p); return Math.min(dist(q, s), dist(q, e));
  }
  let m = Infinity; for (let i = 1; i < p.pts.length; i++) m = Math.min(m, segDist(q, p.pts[i - 1], p.pts[i])); return m;
}
// ilkeli cokgen cizgiye cevir (kiris hatasi <= tol)
export function toPts(p, tol = CHORD) {
  if (p.t === 'l') return [p.a, p.b];
  if (p.t === 'p') return p.pts;
  const sw = p.t === 'c' ? TAU : p.sw, a0 = p.t === 'c' ? 0 : p.a0;
  const step = p.r > tol ? 2 * Math.acos(Math.max(-1, 1 - tol / p.r)) : Math.PI / 2;
  const n = Math.max(p.t === 'c' ? 16 : 2, Math.ceil(sw / Math.max(step, 1e-3)));
  const out = []; for (let i = 0; i <= n; i++) out.push(arcPt(p.c, p.r, a0 + (sw * i) / n)); return out;
}
// ilke uzerinde orneklenmis noktalar (eslestirme icin): oransal konumlar
export function probe(p, fr = [0.1, 0.5, 0.9]) {
  if (p.t === 'l') return fr.map((f) => [p.a[0] + (p.b[0] - p.a[0]) * f, p.a[1] + (p.b[1] - p.a[1]) * f]);
  if (p.t === 'c') return fr.map((f) => arcPt(p.c, p.r, TAU * f));
  if (p.t === 'a') return fr.map((f) => arcPt(p.c, p.r, p.a0 + p.sw * f));
  const P = p.pts; const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + dist(P[i - 1], P[i]));
  const T = L[L.length - 1] || 1;
  return fr.map((f) => { const s = f * T; let i = 1; while (i < P.length - 1 && L[i] < s) i++; const u = (s - L[i - 1]) / ((L[i] - L[i - 1]) || 1); return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u]; });
}
export function primBox(p) {
  const pts = p.t === 'c' ? [[p.c[0] - p.r, p.c[1] - p.r], [p.c[0] + p.r, p.c[1] + p.r]] : toPts(p, 0.05);
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const q of pts) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }
  return b;
}
export function boxOf(prims) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of prims) { const q = primBox(p); b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]); }
  return Number.isFinite(b[0]) ? b : [0, 0, 0, 0];
}
export function primLen(p) {
  if (p.t === 'l') return dist(p.a, p.b);
  if (p.t === 'c') return TAU * p.r;
  if (p.t === 'a') return p.sw * p.r;
  let s = 0; for (let i = 1; i < p.pts.length; i++) s += dist(p.pts[i - 1], p.pts[i]); return s;
}

// Neredeyse dogru olan cokgen cizgi -> dogru parcasi (HLR'nin kenardan gorulen daireleri B-spline olarak verdigi durum)
export function simplify(p, tol = 1e-4) {
  if (p.t !== 'p' || p.pts.length < 2) return p;
  const a = p.pts[0], b = p.pts[p.pts.length - 1];
  // uclar ust uste (kapali egri): degismez
  if (dist(a, b) < tol) return p;
  // en uzak iki nokta arasinda dogru mu?
  let far = [a, b], dmax = dist(a, b);
  for (const q of p.pts) { const d1 = dist(q, far[0]); if (d1 > dmax) { dmax = d1; far = [far[0], q]; } }
  for (const q of p.pts) if (segDist(q, far[0], far[1]) > tol) return p;
  // dogru: ucdan uca tum noktalari kapsayan en uzun parca
  const d = sub(far[1], far[0]); const L = Math.hypot(d[0], d[1]) || 1; const u = [d[0] / L, d[1] / L];
  let lo = Infinity, hi = -Infinity; for (const q of p.pts) { const s = dot(sub(q, far[0]), u); lo = Math.min(lo, s); hi = Math.max(hi, s); }
  return { ...strip(p), t: 'l', a: [far[0][0] + u[0] * lo, far[0][1] + u[1] * lo], b: [far[0][0] + u[0] * hi, far[0][1] + u[1] * hi] };
}
function strip(p) { const o = { ...p }; delete o.pts; delete o.c; delete o.r; delete o.a0; delete o.sw; delete o.a; delete o.b; return o; }

// Bir dogru parcasinin baska dogru parcalari tarafindan ortulen kisimlarini cikar; kalan parcalar
function subtractLine(p, covers, tol) {
  const d = sub(p.b, p.a); const L = Math.hypot(d[0], d[1]); if (L < tol) return [];
  const u = [d[0] / L, d[1] / L];
  const iv = [];
  for (const c of covers) {
    if (c.t !== 'l') continue;
    if (segDistLine(c.a, p.a, u) > tol || segDistLine(c.b, p.a, u) > tol) continue;
    let s0 = dot(sub(c.a, p.a), u), s1 = dot(sub(c.b, p.a), u); if (s0 > s1) [s0, s1] = [s1, s0];
    if (s1 < -tol || s0 > L + tol) continue; iv.push([Math.max(0, s0), Math.min(L, s1)]);
  }
  if (!iv.length) return [p];
  iv.sort((x, y) => x[0] - y[0]);
  const out = []; let cur = 0;
  for (const [s0, s1] of iv) { if (s0 > cur + tol) out.push([cur, s0]); cur = Math.max(cur, s1); }
  if (cur < L - tol) out.push([cur, L]);
  return out.filter(([s0, s1]) => s1 - s0 > tol).map(([s0, s1]) => ({ ...p, a: [p.a[0] + u[0] * s0, p.a[1] + u[1] * s0], b: [p.a[0] + u[0] * s1, p.a[1] + u[1] * s1] }));
}
function segDistLine(q, o, u) { return Math.abs(crs(sub(q, o), u)); }
const onAll = (p, list, tol) => probe(p, [0, 0.25, 0.5, 0.75, 1]).every((q) => list.some((c) => primDist(q, c) <= tol));

// Gorunus temizligi: (1) gorunur cizginin ustune dusen gizli cizgiler cizilmez (ISO 128: gorunur cizgi onceliklidir),
// (2) ayni gorunurlukte ust uste binen kopyalar tekillenir, (3) cok kisa kirintilar atilir. Girdi degismez.
export function cleanView(prims, tol = 1e-4) {
  const vis = [], hid = [];
  for (const p0 of prims) { const p = simplify(p0, tol); if (primLen(p) <= tol * 2) continue; (p.vis ? vis : hid).push(p); }
  const dedupe = (list) => {
    const out = [];
    for (const p of list) {
      if (p.t === 'l') { const rest = subtractLine(p, out, tol); out.push(...rest); continue; }
      if (out.some((q) => q.t !== 'l' && onAll(p, [q], tol))) continue;
      out.push(p);
    }
    return out;
  };
  const V = dedupe(vis);
  const H = [];
  for (const p of dedupe(hid)) {
    if (p.t === 'l') { H.push(...subtractLine(p, V, tol)); continue; }
    if (onAll(p, V, tol)) continue;
    H.push(p);
  }
  return [...V, ...H];
}

// Ayni dogru uzerinde uc uca degen, ayni gorunurluk ve ayni kaynakli dogru parcalarini birlestir (HLR'nin bolmesi)
export function mergeLines(prims, tol = 1e-4) {
  const lines = prims.filter((p) => p.t === 'l'), rest = prims.filter((p) => p.t !== 'l');
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const A = lines[i], B = lines[j];
      if (!!A.vis !== !!B.vis || (A.src || null) !== (B.src || null) || (A.k || 's') !== (B.k || 's')) continue;
      const d = sub(A.b, A.a); const L = Math.hypot(d[0], d[1]); if (L < tol) continue; const u = [d[0] / L, d[1] / L];
      if (segDistLine(B.a, A.a, u) > tol || segDistLine(B.b, A.a, u) > tol) continue;
      let s0 = dot(sub(B.a, A.a), u), s1 = dot(sub(B.b, A.a), u); if (s0 > s1) [s0, s1] = [s1, s0];
      if (s0 > L + tol || s1 < -tol) continue;
      const lo = Math.min(0, s0), hi = Math.max(L, s1);
      lines[i] = { ...A, a: [A.a[0] + u[0] * lo, A.a[1] + u[1] * lo], b: [A.a[0] + u[0] * hi, A.a[1] + u[1] * hi] };
      lines.splice(j, 1); changed = true; break outer;
    }
  }
  return [...lines, ...rest];
}

// Parcalari (her biri nokta dizisi) uc noktalarindan zincirleyip donguler kur. Donus: {loops:[pts], open:n}
export function chainLoops(polys, tol = 1e-3) {
  const segs = polys.filter((p) => p.length >= 2).map((p) => p.slice());
  const loops = []; let open = 0; const used = new Array(segs.length).fill(false);
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = true; let cur = segs[i].slice();
    if (dist(cur[0], cur[cur.length - 1]) <= tol && cur.length > 2) { loops.push(cur.slice(0, -1)); continue; }
    for (;;) {
      const end = cur[cur.length - 1]; let found = -1, rev = false;
      for (let j = 0; j < segs.length; j++) { if (used[j]) continue; if (dist(segs[j][0], end) <= tol) { found = j; break; } if (dist(segs[j][segs[j].length - 1], end) <= tol) { found = j; rev = true; break; } }
      if (found < 0) break;
      used[found] = true; const s = rev ? segs[found].slice().reverse() : segs[found]; cur.push(...s.slice(1));
      if (dist(cur[0], cur[cur.length - 1]) <= tol) break;
    }
    if (dist(cur[0], cur[cur.length - 1]) <= tol && cur.length > 3) loops.push(cur.slice(0, -1)); else open++;
  }
  return { loops, open };
}
export function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export function inPoly(q, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
}
// cift-tek kuralina gore dolu alan (dis donguler arti, delikler eksi)
export function regionArea(loops) {
  let s = 0;
  for (let i = 0; i < loops.length; i++) {
    const q = loops[i][0]; let depth = 0; for (let j = 0; j < loops.length; j++) if (j !== i && inPoly(q, loops[j])) depth++;
    s += (depth % 2 ? -1 : 1) * Math.abs(polyArea(loops[i]));
  }
  return s;
}
// Tarama (ISO 128-50): aci ang (rad) ve aralik step ile paralel cizgiler; cift-tek kuralli bolgeye kirpilir. Donus: [[a,b], ...]
export function hatch(loops, step, ang = Math.PI / 4) {
  if (!loops.length || !(step > 0)) return [];
  const u = [Math.cos(ang), Math.sin(ang)], n = [-u[1], u[0]];
  let lo = Infinity, hi = -Infinity; for (const L of loops) for (const q of L) { const s = dot(q, n); lo = Math.min(lo, s); hi = Math.max(hi, s); }
  const out = []; const k0 = Math.ceil(lo / step), k1 = Math.floor(hi / step);
  if (k1 - k0 > 20000) return out;
  for (let k = k0; k <= k1; k++) {
    const s = k * step; const ts = [];
    for (const L of loops) for (let i = 0; i < L.length; i++) {
      const a = L[i], b = L[(i + 1) % L.length]; const da = dot(a, n) - s, db = dot(b, n) - s;
      if ((da > 0) === (db > 0) || da === db) continue; const f = da / (da - db); const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; ts.push(dot(p, u));
    }
    ts.sort((x, y) => x - y);
    for (let i = 0; i + 1 < ts.length; i += 2) { if (ts[i + 1] - ts[i] < 1e-9) continue; out.push([[n[0] * s + u[0] * ts[i], n[1] * s + u[1] * ts[i]], [n[0] * s + u[0] * ts[i + 1], n[1] * s + u[1] * ts[i + 1]]]); }
  }
  return out;
}
// Detay gorunusu: ilkelleri c merkezli r yaricapli daireye kirp (cokgen cizgi olarak; gorunurluk korunur)
export function clipCircle(prims, c, r) {
  const out = [];
  const inside = (q) => dist(q, c) <= r;
  for (const p of prims) {
    if (p.t === 'c' && dist(p.c, c) + p.r <= r) { out.push(p); continue; }
    if (p.t === 'l' && inside(p.a) && inside(p.b)) { out.push(p); continue; }
    const pts = toPts(p, 0.002 * Math.max(1, r)); let cur = [];
    const flush = () => { if (cur.length >= 2) out.push({ ...strip(p), t: 'p', pts: cur }); cur = []; };
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      if (i === 0) { if (inside(q)) cur.push(q); continue; }
      const a = pts[i - 1]; const ia = inside(a), ib = inside(q);
      const hits = segCircle(a, q, c, r);
      if (ia && ib) { cur.push(q); continue; }
      if (ia && !ib) { cur.push(hits[hits.length - 1] || q); flush(); continue; }
      if (!ia && ib) { cur = [hits[0] || a, q]; continue; }
      if (hits.length === 2) { out.push({ ...strip(p), t: 'p', pts: [hits[0], hits[1]] }); }
    }
    flush();
  }
  return out.map((p) => (p.t === 'p' ? simplify(p, 1e-6) : p));
}
function segCircle(a, b, c, r) {
  const d = sub(b, a), f = sub(a, c); const A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - r * r; const D = B * B - 4 * A * C;
  if (D < 0 || A < 1e-24) return [];
  const s = Math.sqrt(D); const out = [];
  for (const u of [(-B - s) / (2 * A), (-B + s) / (2 * A)]) if (u >= 0 && u <= 1) out.push([a[0] + d[0] * u, a[1] + d[1] * u]);
  return out;
}
// 2B donusum: q -> o + s * R(rot) * (q - pivot)
export function xform(p, f) {
  const T = (q) => f(q);
  if (p.t === 'l') return { ...p, a: T(p.a), b: T(p.b) };
  if (p.t === 'p') return { ...p, pts: p.pts.map(T) };
  return { ...p, c: T(p.c), r: p.r * (f.s || 1) };
}
