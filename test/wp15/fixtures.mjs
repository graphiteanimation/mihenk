// WP-15 test parcalari: analitik yuzeylerden ucgen aglari (setup cercevesi = dunya). Saf JS.
// sphereCap: yarim kure (yaricap Rs, merkez (cx,cy,z0)) + taban plakasi; heightfield: z = f(x,y) izgara ucgenlemesi; box: kutu kabugu.
export function heightfield(f, x0, y0, x1, y1, n, m = n) {
  const V = [], T = [];
  for (let j = 0; j <= m; j++) for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * j) / m; V.push(x, y, f(x, y)); }
  const id = (i, j) => j * (n + 1) + i;
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1); T.push(a, b, c, a, c, d); }
  return { verts: Float64Array.from(V), tris: Uint32Array.from(T) };
}
// yarim kure: enlem/boylam; sag (chord sag) <= sag. Taban: kare plaka [cx-W, cx+W] z0'da (kure disinda halka ucgenleri)
export function hemisphere(Rs, cx, cy, z0, W, sag = 0.002) {
  const dth = 2 * Math.acos(1 - sag / (2 * Rs)); // dortgen kosegeni kiristen ~sqrt2 uzun: ucgen sehimi ~2x kenar sehimi
  const nl = Math.ceil(2 * Math.PI / dth), nt = Math.ceil((Math.PI / 2) / dth);
  const V = [], T = []; const ring = [];
  for (let k = 0; k <= nt; k++) { const th = (Math.PI / 2) * (k / nt); const row = []; // th: ekvatordan yukari
    if (k === nt) { row.push(V.length / 3); V.push(cx, cy, z0 + Rs); }
    else for (let l = 0; l < nl; l++) { const ph = (2 * Math.PI * l) / nl; row.push(V.length / 3); V.push(cx + Rs * Math.cos(th) * Math.cos(ph), cy + Rs * Math.cos(th) * Math.sin(ph), z0 + Rs * Math.sin(th)); }
    ring.push(row); }
  for (let k = 0; k < nt; k++) { const A = ring[k], B = ring[k + 1];
    for (let l = 0; l < nl; l++) { const a = A[l], b = A[(l + 1) % nl]; if (B.length === 1) T.push(a, b, B[0]); else { const c = B[(l + 1) % nl], d = B[l]; T.push(a, b, c, a, c, d); } } }
  // taban: ekvator halkasi ile kare kenar arasi (kare kenarinda nl nokta)
  const eq = ring[0]; const sq = [];
  for (let l = 0; l < nl; l++) { const ph = (2 * Math.PI * l) / nl; const c = Math.cos(ph), s = Math.sin(ph); const k = W / Math.max(Math.abs(c), Math.abs(s)); sq.push(V.length / 3); V.push(cx + k * c, cy + k * s, z0); }
  for (let l = 0; l < nl; l++) { const a = eq[l], b = eq[(l + 1) % nl], c = sq[(l + 1) % nl], d = sq[l]; T.push(a, d, c, a, c, b); }
  return { verts: Float64Array.from(V), tris: Uint32Array.from(T) };
}
export function box(mn, mx) {
  const V = []; for (let k = 0; k < 8; k++) V.push(k & 1 ? mx[0] : mn[0], k & 2 ? mx[1] : mn[1], k & 4 ? mx[2] : mn[2]);
  const F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]; const T = [];
  for (const [a, b, c, d] of F) T.push(a, b, c, a, c, d);
  return { verts: Float64Array.from(V), tris: Uint32Array.from(T) };
}
export function merge(...ms) {
  const V = [], T = []; for (const m of ms) { const o = V.length / 3; V.push(...m.verts); for (const t of m.tris) T.push(t + o); }
  return { verts: Float64Array.from(V), tris: Uint32Array.from(T) };
}
