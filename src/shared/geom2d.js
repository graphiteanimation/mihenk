// 2B geometri altyapısı (saf, bağımlılıksız). Birim mm / radyan. Tolerans: TOL = 1e-7 mm.
//
// Parça (segment) biçimleri (düz, JSON'a uygun nesneler):
//   {type:'line',   p0, p1}
//   {type:'arc',    c, r, a0, sweep, p0, p1}          saat yönü tersi (CCW), 0 < sweep <= 2π
//   {type:'circle', c, r}
//   {type:'ellipse',c, rx, ry, rot}                   rot: ana eksenin açısı (rad)
//   {type:'ellarc', c, rx, ry, rot, a0, sweep, p0, p1} a0/sweep PARAMETRİK açıdır: P(t)=c+R(rot)·(rx cos t, ry sin t)
//   {type:'spline', pts, closed, p0, p1}              pts: sırayla geçilen enterpolasyon noktaları (kapalıysa ilk nokta sonda TEKRARLANMAZ)
// Her parçanın parametresi u ∈ [0, U]: line U=1; arc/ellarc U=sweep (açı farkı); circle/ellipse U=2π;
// spline U=toplam kiriş uzunluğu (kiriş-uzunluğu parametrizasyonlu doğal kübik spline).
// Kesişim sonuçları {pts:[{p,ua,ub,tan}], overlap:[{a0,a1,b0,b1}]} biçimindedir; `tan` teğet değmeyi bildirir.
export const TOL = 1e-7;
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const wrap = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const nrm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

// ------------------------------------------------------------ kurucular
export const mkLine = (p0, p1) => ({ type: 'line', p0: [p0[0], p0[1]], p1: [p1[0], p1[1]] });
export const mkCircle = (c, r) => ({ type: 'circle', c: [c[0], c[1]], r });
export function mkArc(c, r, a0, sweep) {
  a0 = wrap(a0);
  return { type: 'arc', c: [c[0], c[1]], r, a0, sweep, p0: [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)], p1: [c[0] + r * Math.cos(a0 + sweep), c[1] + r * Math.sin(a0 + sweep)] };
}
export const mkEllipse = (c, rx, ry, rot = 0) => ({ type: 'ellipse', c: [c[0], c[1]], rx, ry, rot });
const ellPt = (s, t) => { const x = s.rx * Math.cos(t), y = s.ry * Math.sin(t), cr = Math.cos(s.rot), sr = Math.sin(s.rot); return [s.c[0] + x * cr - y * sr, s.c[1] + x * sr + y * cr]; };
const ellD = (s, t) => { const x = -s.rx * Math.sin(t), y = s.ry * Math.cos(t), cr = Math.cos(s.rot), sr = Math.sin(s.rot); return [x * cr - y * sr, x * sr + y * cr]; };
export function mkEllArc(c, rx, ry, rot, a0, sweep) {
  a0 = wrap(a0); const s = { type: 'ellarc', c: [c[0], c[1]], rx, ry, rot, a0, sweep };
  s.p0 = ellPt(s, a0); s.p1 = ellPt(s, a0 + sweep); return s;
}
export function mkSpline(pts, closed = false) {
  pts = pts.map((p) => [p[0], p[1]]);
  return { type: 'spline', pts, closed: !!closed, p0: pts[0], p1: closed ? pts[0] : pts[pts.length - 1] };
}

// ------------------------------------------------------------ eğri değerlendirici
// kübik spline: x(s), y(s) ayrı ayrı; doğal uç koşulu (açık) ya da periyodik (kapalı)
function solveTri(a, b, c, d) { // Thomas
  const n = b.length, cp = new Array(n), dp = new Array(n), x = new Array(n);
  cp[0] = c[0] / b[0]; dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) { const m = b[i] - a[i] * cp[i - 1]; cp[i] = c[i] / m; dp[i] = (d[i] - a[i] * dp[i - 1]) / m; }
  x[n - 1] = dp[n - 1]; for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}
function solveDense(A, b) {
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    [M[i], M[p]] = [M[p], M[i]]; const d = M[i][i] || 1e-300;
    for (let k = i + 1; k < n; k++) { const f = M[k][i] / d; if (f) for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; }
  }
  const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / (M[i][i] || 1e-300); }
  return x;
}
function splineModel(seg) {
  let pts = seg.pts.slice(); if (seg.closed) pts.push(pts[0]);
  // yinelenen ardışık noktaları at
  const q = [pts[0]]; for (let i = 1; i < pts.length; i++) if (dist(pts[i], q[q.length - 1]) > 1e-9) q.push(pts[i]); pts = q;
  const n = pts.length; const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + dist(pts[i], pts[i - 1]));
  const second = (vals) => { // vals: n değer, döner: ikinci türevler M
    if (n < 3) return new Array(n).fill(0);
    const h = []; for (let i = 0; i < n - 1; i++) h.push(s[i + 1] - s[i]);
    if (!seg.closed) {
      const m = n - 2, a = new Array(m).fill(0), b = new Array(m).fill(0), c = new Array(m).fill(0), d = new Array(m).fill(0);
      for (let i = 1; i <= m; i++) { a[i - 1] = h[i - 1]; b[i - 1] = 2 * (h[i - 1] + h[i]); c[i - 1] = h[i]; d[i - 1] = 6 * ((vals[i + 1] - vals[i]) / h[i] - (vals[i] - vals[i - 1]) / h[i - 1]); }
      const x = solveTri(a, b, c, d); return [0, ...x, 0];
    }
    // periyodik: n-1 bilinmeyen (son = ilk)
    const N = n - 1, A = Array.from({ length: N }, () => new Array(N).fill(0)), d = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      const im = (i - 1 + N) % N, hp = h[i], hm = h[im];
      A[i][im] += hm; A[i][i] += 2 * (hm + hp); A[i][(i + 1) % N] += hp;
      d[i] = 6 * ((vals[(i + 1) % N === 0 ? N : i + 1] - vals[i]) / hp - (vals[i] - vals[i === 0 ? N - 1 : i - 1]) / hm);
    }
    const x = solveDense(A, d); return [...x, x[0]];
  };
  const X = pts.map((p) => p[0]), Y = pts.map((p) => p[1]);
  return { pts, s, n, Mx: second(X), My: second(Y), X, Y, U: s[n - 1] };
}
function splineEval(m, u, deriv) {
  const { s, n } = m; let i = 0, lo = 0, hi = n - 2;
  if (u <= 0) i = 0; else if (u >= m.U) i = n - 2; else { while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid] <= u) lo = mid; else hi = mid - 1; } i = lo; }
  const h = s[i + 1] - s[i]; const A = (s[i + 1] - u) / h, B = (u - s[i]) / h;
  const f = (V, M) => deriv
    ? (V[i + 1] - V[i]) / h - ((3 * A * A - 1) / 6) * h * M[i] + ((3 * B * B - 1) / 6) * h * M[i + 1]
    : A * V[i] + B * V[i + 1] + ((A * A * A - A) * M[i] + (B * B * B - B) * M[i + 1]) * h * h / 6;
  return [f(m.X, m.Mx), f(m.Y, m.My)];
}
const CACHE = new WeakMap();
export function curve(seg) {
  let c = CACHE.get(seg); if (c) return c;
  switch (seg.type) {
    case 'line': { const d = sub(seg.p1, seg.p0); c = { U: 1, closed: false, pt: (u) => [seg.p0[0] + d[0] * u, seg.p0[1] + d[1] * u], d: () => d }; break; }
    case 'arc': case 'circle': {
      const a0 = seg.type === 'arc' ? seg.a0 : 0, r = seg.r, ce = seg.c;
      c = { U: seg.type === 'arc' ? seg.sweep : TAU, closed: seg.type === 'circle', pt: (u) => [ce[0] + r * Math.cos(a0 + u), ce[1] + r * Math.sin(a0 + u)], d: (u) => [-r * Math.sin(a0 + u), r * Math.cos(a0 + u)] }; break;
    }
    case 'ellipse': case 'ellarc': {
      const a0 = seg.type === 'ellarc' ? seg.a0 : 0;
      c = { U: seg.type === 'ellarc' ? seg.sweep : TAU, closed: seg.type === 'ellipse', pt: (u) => ellPt(seg, a0 + u), d: (u) => ellD(seg, a0 + u) }; break;
    }
    case 'spline': { const m = splineModel(seg); c = { U: m.U, closed: !!seg.closed, m, pt: (u) => splineEval(m, Math.min(Math.max(u, 0), m.U), false), d: (u) => splineEval(m, Math.min(Math.max(u, 0), m.U), true) }; break; }
    default: throw new Error('geom2d: bilinmeyen parça ' + seg.type);
  }
  CACHE.set(seg, c); return c;
}
export const ptAt = (seg, u) => curve(seg).pt(u);
export const endU = (seg) => curve(seg).U;
export const isClosed = (seg) => curve(seg).closed;
export function tangentAt(seg, u) { return nrm(curve(seg).d(u)); }
// işaretli eğrilik (sola dönüş +): κ = (x'y'' − y'x'') / |v|³ ; sayısal ikinci türev
export function curvatureAt(seg, u) {
  if (seg.type === 'line') return 0;
  if (seg.type === 'arc' || seg.type === 'circle') return 1 / seg.r;
  const c = curve(seg), h = Math.max(1e-5, c.U * 1e-6);
  const d1 = c.d(u), dp = c.d(Math.min(u + h, c.U + (c.closed ? h : 0))), dm = c.d(Math.max(u - h, c.closed ? u - h : 0));
  const du = (Math.min(u + h, c.closed ? u + h : c.U) - Math.max(u - h, c.closed ? u - h : 0)) || h;
  const dd = [(dp[0] - dm[0]) / du, (dp[1] - dm[1]) / du]; const v = Math.hypot(d1[0], d1[1]) || 1;
  return cross(d1, dd) / (v * v * v);
}
export function length(seg) {
  if (seg.type === 'line') return dist(seg.p0, seg.p1);
  if (seg.type === 'arc') return seg.r * seg.sweep;
  if (seg.type === 'circle') return TAU * seg.r;
  const c = curve(seg), N = 400; let s = 0, h = c.U / N;
  for (let i = 0; i < N; i++) { const a = i * h, f = (u) => Math.hypot(...c.d(u)); s += (h / 6) * (f(a) + 4 * f(a + h / 2) + f(a + h)); }
  return s;
}
// çizim için çokgen noktaları (kiriş sapması ≤ tol mm). Kapalı eğrilerde son nokta = ilk nokta.
export function sample(seg, tol = 0.01) {
  if (seg.type === 'line') return [seg.p0.slice(), seg.p1.slice()];
  const c = curve(seg); let n;
  if (seg.type === 'arc' || seg.type === 'circle') { const r = seg.r; const step = r > tol ? 2 * Math.acos(Math.max(0, 1 - tol / r)) : Math.PI / 4; n = Math.min(2000, Math.max(8, Math.ceil(c.U / Math.max(step, 1e-3)))); if (seg.type === 'circle') n = Math.max(n, 32); }
  else if (seg.type === 'spline') n = Math.min(4000, Math.max(16, (c.m.n - 1) * 16));
  else { const R = Math.max(seg.rx, seg.ry); const step = R > tol ? 2 * Math.acos(Math.max(0, 1 - tol / R)) : Math.PI / 4; n = Math.min(2000, Math.max(24, Math.ceil(c.U / Math.max(step, 1e-3)))); }
  const out = []; for (let i = 0; i <= n; i++) out.push(c.pt((c.U * i) / n));
  return out;
}
export function bbox(seg) {
  const pts = sample(seg, 0.002); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const pad = seg.type === 'line' ? 0 : seg.type === 'spline' ? 0.05 + 0.01 * Math.max(x1 - x0, y1 - y0) : 0.0025; // örnekleme sapması payı (muhafazakâr)
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
export function startEnd(seg) { // [p0, p1]; kapalı eğri için aynı nokta
  if (seg.type === 'circle' || seg.type === 'ellipse') { const p = curve(seg).pt(0); return [p, p]; }
  return [seg.p0, seg.p1];
}

// ------------------------------------------------------------ en yakın nokta
export function closestPoint(seg, p) {
  if (seg.type === 'line') {
    const d = sub(seg.p1, seg.p0), l2 = dot(d, d); let u = l2 > 1e-300 ? dot(sub(p, seg.p0), d) / l2 : 0; u = Math.min(1, Math.max(0, u));
    const q = curve(seg).pt(u); return { u, p: q, d: dist(p, q) };
  }
  if (seg.type === 'arc' || seg.type === 'circle') {
    const dx = p[0] - seg.c[0], dy = p[1] - seg.c[1], dd = Math.hypot(dx, dy);
    if (seg.type === 'circle') { const ang = dd < 1e-12 ? 0 : Math.atan2(dy, dx); const u = wrap(ang); const q = curve(seg).pt(u); return { u, p: q, d: dist(p, q) }; }
    const u = wrap(Math.atan2(dy, dx) - seg.a0);
    if (dd >= 1e-12 && u <= seg.sweep) { const q = curve(seg).pt(u); return { u, p: q, d: dist(p, q) }; }
    const d0 = dist(p, seg.p0), d1 = dist(p, seg.p1); return d0 <= d1 ? { u: 0, p: seg.p0.slice(), d: d0 } : { u: seg.sweep, p: seg.p1.slice(), d: d1 };
  }
  // genel: tarama + Newton (en küçük kareler)
  const c = curve(seg), N = Math.max(64, seg.type === 'spline' ? (c.m.n - 1) * 24 : 256); let bu = 0, bd = Infinity;
  for (let i = 0; i <= N; i++) { const u = (c.U * i) / N, d = dist(c.pt(u), p); if (d < bd) { bd = d; bu = u; } }
  let lo = Math.max(c.closed ? bu - c.U / N : 0, bu - c.U / N), hi = Math.min(c.closed ? bu + c.U / N : c.U, bu + c.U / N); // altın oran inceltme
  const f = (u) => { const q = c.pt(c.closed ? wrap2(u, c.U) : u); return (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2; };
  const g = 0.6180339887498949; let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo), f1 = f(x1), f2 = f(x2);
  for (let k = 0; k < 80; k++) { if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = f(x1); } else { lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = f(x2); } }
  let u = (lo + hi) / 2; if (c.closed) u = wrap2(u, c.U); const q = c.pt(u);
  return { u, p: q, d: dist(p, q) };
}
const wrap2 = (u, U) => { u %= U; return u < 0 ? u + U : u; };

// ------------------------------------------------------------ kesişimler
const clamp01 = (x) => Math.min(1, Math.max(0, x));
function hit(p, ua, ub, tan) { return { p, ua, ub, tan: !!tan }; }
function arcRangeU(seg, p) { // p noktası bu daire/yayın hangi parametresinde; aralık dışıysa null
  if (seg.type === 'circle') return wrap(Math.atan2(p[1] - seg.c[1], p[0] - seg.c[0]));
  const u = wrap(Math.atan2(p[1] - seg.c[1], p[0] - seg.c[0]) - seg.a0);
  const eps = TOL / Math.max(seg.r, TOL);
  if (u <= seg.sweep + eps) return Math.min(u, seg.sweep);
  if (u >= TAU - eps) return 0;
  return null;
}
function lineLine(a, b, inf) {
  const d1 = sub(a.p1, a.p0), d2 = sub(b.p1, b.p0), l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
  const out = { pts: [], overlap: [] }; if (l1 < 1e-12 || l2 < 1e-12) return out;
  const den = cross(d1, d2), w = sub(b.p0, a.p0);
  if (Math.abs(den) <= 1e-12 * l1 * l2) { // paralel
    if (Math.abs(cross(w, d1)) / l1 > TOL) return out;
    const t0 = dot(w, d1) / (l1 * l1), t1 = dot(sub(b.p1, a.p0), d1) / (l1 * l1);
    const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
    const e = TOL / l1;
    if (hi - lo > e) { const ub = (t) => (t - t0) / (t1 - t0); out.overlap.push({ a0: lo, a1: hi, b0: clamp01(ub(lo)), b1: clamp01(ub(hi)) }); }
    else if (hi - lo >= -e) { const t = (lo + hi) / 2; out.pts.push(hit(curve(a).pt(clamp01(t)), clamp01(t), clamp01((t - t0) / (t1 - t0)), false)); }
    return out;
  }
  const ua = cross(w, d2) / den, ub = cross(w, d1) / den, ea = TOL / l1, eb = TOL / l2;
  if (!inf && (ua < -ea || ua > 1 + ea || ub < -eb || ub > 1 + eb)) return out;
  const u = inf ? ua : clamp01(ua), v = inf ? ub : clamp01(ub); out.pts.push(hit(curve(a).pt(u), u, v, false)); return out;
}
function lineCirc(l, c, swap, inf) { // l: line; c: circle/arc; swap: sonuçta a/b yer değiştirir
  const out = { pts: [], overlap: [] }; const d = sub(l.p1, l.p0), L = Math.hypot(...d); if (L < 1e-12) return out;
  const n = [-d[1] / L, d[0] / L]; const h = dot(sub(c.c, l.p0), n); // merkez-doğru işaretli uzaklık
  const ah = Math.abs(h); if (ah > c.r + TOL) return out;
  const foot = dot(sub(c.c, l.p0), d) / (L * L); // doğru üzerindeki iz düşüm parametresi
  const cand = [];
  if (Math.abs(ah - c.r) <= TOL) cand.push({ t: foot, tan: true });
  else { const hh = Math.sqrt(Math.max(0, c.r * c.r - h * h)) / L; cand.push({ t: foot - hh }, { t: foot + hh }); }
  const eL = TOL / L;
  for (const k of cand) {
    if (!inf && (k.t < -eL || k.t > 1 + eL)) continue; const t = inf ? k.t : clamp01(k.t); const p = curve(l).pt(t);
    const uc = arcRangeU(c, p); if (uc === null) continue;
    out.pts.push(swap ? hit(p, uc, t, k.tan) : hit(p, t, uc, k.tan));
  }
  return out;
}
function circCirc(a, b) {
  const out = { pts: [], overlap: [] }; const d = dist(a.c, b.c);
  if (d < TOL) {
    if (Math.abs(a.r - b.r) > TOL) return out;
    // aynı daire: yay aralıklarının kesişimi
    const A = a.type === 'circle' ? [0, TAU] : [a.a0, a.a0 + a.sweep], B = b.type === 'circle' ? [0, TAU] : [b.a0, b.a0 + b.sweep];
    const baseA = a.type === 'circle' ? 0 : a.a0, baseB = b.type === 'circle' ? 0 : b.a0;
    const sA = A[1] - A[0], sB = B[1] - B[0], off = wrap(baseB - baseA);
    for (const sh of [off - TAU, off, off + TAU]) { // B aralığı A'ya göre [sh, sh+sB]
      const lo = Math.max(0, sh), hi = Math.min(sA, sh + sB);
      if (hi - lo > TOL / a.r) out.overlap.push({ a0: lo, a1: hi, b0: lo - sh, b1: hi - sh });
      else if (Math.abs(hi - lo) <= TOL / a.r && hi >= lo - TOL / a.r) { /* tek noktada değme */ const u = (lo + hi) / 2; const p = curve(a).pt(u); out.pts.push(hit(p, u, wrap2(u - sh, b.type === 'circle' ? TAU : TAU), false)); }
    }
    return out;
  }
  const sum = a.r + b.r, dif = Math.abs(a.r - b.r);
  if (d > sum + TOL || d < dif - TOL) return out;
  const ex = nrm(sub(b.c, a.c)), ey = [-ex[1], ex[0]];
  let x = (d * d + a.r * a.r - b.r * b.r) / (2 * d); let tan = false;
  let y2 = a.r * a.r - x * x; if (Math.abs(d - sum) <= TOL || Math.abs(d - dif) <= TOL || y2 < 0) { tan = true; y2 = 0; }
  const y = Math.sqrt(Math.max(0, y2));
  const ys = tan || y < TOL ? [0] : [y, -y];
  for (const yy of ys) {
    const p = add(add(a.c, mul(ex, x)), mul(ey, yy));
    const ua = arcRangeU(a, p), ub = arcRangeU(b, p); if (ua === null || ub === null) continue;
    out.pts.push(hit(p, ua, ub, tan));
  }
  return out;
}
const isRound = (s) => s.type === 'circle' || s.type === 'arc';
function dedupeHits(hits, closedA, closedB, UA, UB) {
  const out = [];
  for (const h of hits) {
    if (closedA && h.ua >= UA - 1e-12) h.ua = 0; if (closedB && h.ub >= UB - 1e-12) h.ub = 0;
    if (!out.some((o) => dist(o.p, h.p) < 1e-6)) out.push(h); else { const o = out.find((q) => dist(q.p, h.p) < 1e-6); if (h.tan && !o.tan) o.tan = true; }
  }
  return out;
}
function genericX(a, b) {
  const A = curve(a), B = curve(b); const out = { pts: [], overlap: [] };
  const bba = bbox(a), bbb = bbox(b); const sc = Math.max(1, bba.x1 - bba.x0, bba.y1 - bba.y0, bbb.x1 - bbb.x0, bbb.y1 - bbb.y0);
  if (bba.x1 < bbb.x0 - 1e-6 || bbb.x1 < bba.x0 - 1e-6 || bba.y1 < bbb.y0 - 1e-6 || bbb.y1 < bba.y0 - 1e-6) return out;
  const cnt = (s, C) => (s.type === 'spline' ? Math.max(32, (C.m.n - 1) * 24) : s.type === 'line' ? 1 : 160);
  const NA = cnt(a, A), NB = cnt(b, B);
  const ua = [], ub = [], pa = [], pb = [];
  for (let i = 0; i <= NA; i++) { const u = (A.U * i) / NA; ua.push(u); pa.push(A.pt(u)); }
  for (let j = 0; j <= NB; j++) { const u = (B.U * j) / NB; ub.push(u); pb.push(B.pt(u)); }
  const raw = []; let touchTries = 0;
  const segDist = (p, q, r2, s2) => { // iki doğru parçası arası en küçük uzaklık
    const d1 = sub(q, p), d2 = sub(s2, r2); const c = (a, b) => { const l = dot(sub(b, a), sub(b, a)); return 0; };
    const pd = (pt, a, b) => { const d = sub(b, a), l2 = dot(d, d); const t = l2 > 0 ? Math.min(1, Math.max(0, dot(sub(pt, a), d) / l2)) : 0; return dist(pt, [a[0] + d[0] * t, a[1] + d[1] * t]); };
    return Math.min(pd(p, r2, s2), pd(q, r2, s2), pd(r2, p, q), pd(s2, p, q));
  };
  const localMin = (C, pt, u0, du) => { // [u0-du, u0+du] içinde pt'ye en yakın parametre (altın oran)
    let lo = u0 - du, hi = u0 + du; if (!C.closed) { lo = Math.max(0, lo); hi = Math.min(C.U, hi); }
    const f = (u) => { const q = C.pt(C.closed ? wrap2(u, C.U) : u); return (q[0] - pt[0]) ** 2 + (q[1] - pt[1]) ** 2; };
    const g = 0.6180339887498949; let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo), f1 = f(x1), f2 = f(x2);
    for (let k = 0; k < 70; k++) { if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = f(x1); } else { lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = f(x2); } }
    return (lo + hi) / 2;
  };
  const touchRefine = (u0, v0, wa, wb) => {
    let u = u0, v = v0;
    for (let it = 0; it < 40; it++) {
      const v2 = localMin(B, A.pt(wrapIf(u, A)), v, wb), u2 = localMin(A, B.pt(wrapIf(v2, B)), u, wa);
      const mv = Math.abs(v2 - v) + Math.abs(u2 - u); u = u2; v = v2; if (mv < 1e-12) break;
    }
    return { u, v, res: dist(A.pt(wrapIf(u, A)), B.pt(wrapIf(v, B))) };
  };
  const refine = (u0, v0, strict) => {
    let u = u0, v = v0, damp = strict ? 0 : 1e-3;
    for (let it = 0; it < 60; it++) {
      const p = A.pt(wrapIf(u, A)), q = B.pt(wrapIf(v, B)), F = [p[0] - q[0], p[1] - q[1]];
      const res = Math.hypot(F[0], F[1]); if (res < 1e-11) return { u, v, res };
      const da = A.d(wrapIf(u, A)), db = B.d(wrapIf(v, B));
      // J = [da, -db]; (J^T J + damp I) δ = -J^T F
      const j11 = da[0], j12 = -db[0], j21 = da[1], j22 = -db[1];
      let m11 = j11 * j11 + j21 * j21 + damp, m12 = j11 * j12 + j21 * j22, m22 = j12 * j12 + j22 * j22 + damp;
      const g1 = -(j11 * F[0] + j21 * F[1]), g2 = -(j12 * F[0] + j22 * F[1]);
      const det = m11 * m22 - m12 * m12; if (Math.abs(det) < 1e-300) break;
      const du = (g1 * m22 - g2 * m12) / det, dv = (m11 * g2 - m12 * g1) / det;
      const stepmax = Math.max(A.U, B.U) * 0.2; const k = Math.min(1, stepmax / (Math.hypot(du, dv) || 1));
      u += du * k; v += dv * k;
      if (Math.hypot(du, dv) * k < 1e-13) break;
    }
    const p = A.pt(wrapIf(u, A)), q = B.pt(wrapIf(v, B)); return { u, v, res: dist(p, q) };
  };
  const wrapIf = (u, C) => (C.closed ? wrap2(u, C.U) : Math.min(Math.max(u, 0), C.U));
  for (let i = 0; i < NA; i++) {
    const ax0 = Math.min(pa[i][0], pa[i + 1][0]), ax1 = Math.max(pa[i][0], pa[i + 1][0]), ay0 = Math.min(pa[i][1], pa[i + 1][1]), ay1 = Math.max(pa[i][1], pa[i + 1][1]);
    const pad = Math.max(1e-3 * sc, 0);
    for (let j = 0; j < NB; j++) {
      const bx0 = Math.min(pb[j][0], pb[j + 1][0]), bx1 = Math.max(pb[j][0], pb[j + 1][0]), by0 = Math.min(pb[j][1], pb[j + 1][1]), by1 = Math.max(pb[j][1], pb[j + 1][1]);
      if (ax1 < bx0 - pad || bx1 < ax0 - pad || ay1 < by0 - pad || by1 < ay0 - pad) continue;
      const r = lineLine(mkLine(pa[i], pa[i + 1]), mkLine(pb[j], pb[j + 1]));
      let cands = r.pts.map((h) => [ua[i] + (ua[i + 1] - ua[i]) * h.ua, ub[j] + (ub[j + 1] - ub[j]) * h.ub, true]);
      if (!cands.length && !r.overlap.length) { // teğet değme adayı: yalnızca çok yakın çokgen parçaları
        if (touchTries < 60 && segDist(pa[i], pa[i + 1], pb[j], pb[j + 1]) < Math.max(1e-3 * sc, 4 * (ua[1] - ua[0]) * 0)) { touchTries++; cands = [[(ua[i] + ua[i + 1]) / 2, (ub[j] + ub[j + 1]) / 2, false]]; }
      }
      for (const [u0, v0, cross_] of cands) {
        const f = cross_ ? refine(u0, v0, true) : touchRefine(u0, v0, (ua[1] - ua[0]) * 2, (ub[1] - ub[0]) * 2);
        if (f.res > 1e-7) continue;
        let u = f.u, v = f.v;
        if (!A.closed && (u < -1e-9 || u > A.U + 1e-9)) continue; if (!B.closed && (v < -1e-9 || v > B.U + 1e-9)) continue;
        u = wrapIf(u, A); v = wrapIf(v, B); raw.push(hit(A.pt(u), u, v, !cross_));
      }
    }
  }
  out.pts = dedupeHits(raw, A.closed, B.closed, A.U, B.U);
  // aynı eğri (elips = elips) için örtüşme
  if (a.type === b.type && (a.type === 'ellipse') && dist(a.c, b.c) < TOL && Math.abs(a.rx - b.rx) < TOL && Math.abs(a.ry - b.ry) < TOL && (Math.abs(wrap(a.rot - b.rot)) < 1e-9 || Math.abs(wrap(a.rot - b.rot) - Math.PI) < 1e-9 || Math.abs(wrap(a.rot - b.rot) - TAU) < 1e-9)) { out.pts = []; out.overlap.push({ a0: 0, a1: TAU, b0: 0, b1: TAU }); }
  return out;
}
export function intersect(a, b) {
  if (a.type === 'line' && b.type === 'line') return lineLine(a, b);
  if (a.type === 'line' && isRound(b)) return lineCirc(a, b, false);
  if (isRound(a) && b.type === 'line') return lineCirc(b, a, true);
  if (isRound(a) && isRound(b)) return circCirc(a, b);
  return genericX(a, b);
}
// Sonsuz uzantılı kesişim (doğru ve tam daire olarak): [{p}]. Kesme/uzatma/yuvarlatma için.
export function intersectInfinite(a, b) {
  const full = (s) => (s.type === 'arc' ? mkCircle(s.c, s.r) : s.type === 'ellarc' ? mkEllipse(s.c, s.rx, s.ry, s.rot) : s);
  const A = full(a), B = full(b);
  if (A.type === 'line' && B.type === 'line') return lineLine(A, B, true).pts.map((h) => h.p);
  if (A.type === 'line' && isRound(B)) return lineCirc(A, B, false, true).pts.map((h) => h.p);
  if (isRound(A) && B.type === 'line') return lineCirc(B, A, true, true).pts.map((h) => h.p);
  if (A.type === 'line' || B.type === 'line') { // çizgi + elips/spline: uzun sonlu çizgi
    const ln = A.type === 'line' ? A : B, d = nrm(sub(ln.p1, ln.p0)), C = 1e4; const big = mkLine(sub(ln.p0, mul(d, C)), add(ln.p0, mul(d, C)));
    return intersect(big, A.type === 'line' ? B : A).pts.map((h) => h.p);
  }
  return intersect(A, B).pts.map((h) => h.p);
}

// ------------------------------------------------------------ bölme
function piece(seg, ua, ub) {
  const c = curve(seg), U = c.U;
  switch (seg.type) {
    case 'line': return mkLine(c.pt(ua), c.pt(ub));
    case 'arc': return mkArc(seg.c, seg.r, seg.a0 + ua, ub - ua);
    case 'circle': return mkArc(seg.c, seg.r, ua, ub - ua);
    case 'ellipse': return mkEllArc(seg.c, seg.rx, seg.ry, seg.rot, ua, ub - ua);
    case 'ellarc': return mkEllArc(seg.c, seg.rx, seg.ry, seg.rot, seg.a0 + ua, ub - ua);
    case 'spline': {
      const m = c.m, anchors = [ua];
      for (let i = 1; i < m.n - 1; i++) if (m.s[i] > ua + 1e-9 && m.s[i] < ub - 1e-9) anchors.push(m.s[i]);
      if (c.closed && ub > U) { for (let i = 1; i < m.n - 1; i++) { const s2 = m.s[i] + U; if (s2 > ua + 1e-9 && s2 < ub - 1e-9) anchors.push(s2); } }
      anchors.push(ub); const pts = [];
      for (let i = 0; i < anchors.length - 1; i++) { const a = anchors[i], b = anchors[i + 1]; for (let k = 0; k < 8; k++) pts.push(c.pt(wrap2x(a + ((b - a) * k) / 8, U, c.closed))); }
      pts.push(c.pt(wrap2x(ub, U, c.closed))); return mkSpline(pts, false);
    }
  }
}
const wrap2x = (u, U, closed) => (closed ? wrap2(u, U) : u);
export const subCurve = piece; // [ua,ub] aralığı (kapalı eğride ub>U olabilir)
// us: bölme parametreleri. Dönen: sıralı parçalar [{seg, ua, ub}] (parça = seg'in [ua,ub] aralığı)
export function splitAt(seg, us) {
  const c = curve(seg), U = c.U; const [p0, p1] = startEnd(seg);
  const dp = (u) => dist(c.pt(u), p0), de = (u) => dist(c.pt(u), p1);
  let list = us.map((u) => (c.closed ? wrap2(u, U) : u)).filter((u) => c.closed || (u > 0 && u < U)).sort((x, y) => x - y);
  if (!c.closed) list = list.filter((u) => dp(u) > TOL * 2 && de(u) > TOL * 2);
  const uniq = []; for (const u of list) if (!uniq.length || dist(c.pt(u), c.pt(uniq[uniq.length - 1])) > TOL * 2) uniq.push(u);
  if (c.closed && uniq.length > 1 && dist(c.pt(uniq[0]), c.pt(uniq[uniq.length - 1])) <= TOL * 2) uniq.pop();
  if (!uniq.length) return c.closed ? [{ seg, ua: 0, ub: U, whole: true }] : [{ seg, ua: 0, ub: U, whole: true }];
  const res = [];
  if (c.closed) { for (let i = 0; i < uniq.length; i++) { const a = uniq[i], b = i + 1 < uniq.length ? uniq[i + 1] : uniq[0] + U; res.push({ seg: piece(seg, a, b), ua: a, ub: b }); } }
  else { const b = [0, ...uniq, U]; for (let i = 0; i < b.length - 1; i++) res.push({ seg: piece(seg, b[i], b[i + 1]), ua: b[i], ub: b[i + 1] }); }
  return res;
}
export function reverse(seg) {
  switch (seg.type) {
    case 'line': return mkLine(seg.p1, seg.p0);
    case 'spline': return mkSpline(seg.pts.slice().reverse(), seg.closed);
    default: return seg;
  }
}

// ------------------------------------------------------------ ofset
// d: kanonik yönün SOLUNA işaretli uzaklık (çizgi: p0→p1'in solu; yay/daire/elips CCW → sol = iç taraf).
export function offsetSeg(seg, d) {
  switch (seg.type) {
    case 'line': { const t = nrm(sub(seg.p1, seg.p0)); const n = [-t[1] * d, t[0] * d]; return mkLine(add(seg.p0, n), add(seg.p1, n)); }
    case 'arc': { const r = seg.r - d; return r > TOL ? mkArc(seg.c, r, seg.a0, seg.sweep) : null; }
    case 'circle': { const r = seg.r - d; return r > TOL ? mkCircle(seg.c, r) : null; }
    default: { // elips / spline: örneklenmiş yaklaşık ofset (spline olarak)
      const c = curve(seg), N = seg.type === 'spline' ? Math.max(24, (c.m.n - 1) * 8) : 96, pts = [];
      for (let i = 0; i < (c.closed ? N : N + 1); i++) { const u = (c.U * i) / N; const p = c.pt(u), t = nrm(c.d(u)); pts.push([p[0] - t[1] * d, p[1] + t[0] * d]); }
      const s = mkSpline(pts, c.closed); s.approx = true; return s;
    }
  }
}
// Zincir ofseti. items: [{seg, fwd}] sıralı (bir parçanın bitişi sonrakinin başlangıcı). d: gidiş yönünün soluna işaretli uzaklık.
// join: 'sharp' (sivri köşe, uzatma/kırpma) | 'round' (dış köşede yay). Döner: seg listesi (gidiş yönünde, seg'ler kanonik biçimde).
export function offsetChain(items, d, join = 'sharp', closed = false) {
  const segs = items.map((it) => ({ ...it, o: offsetSeg(it.seg, it.fwd ? d : -d) }));
  const out = segs.filter((s) => s.o);
  if (!out.length) return [];
  const travelEnd = (s) => (s.fwd ? s.o.p1 ?? ptAt(s.o, endU(s.o)) : s.o.p0 ?? ptAt(s.o, 0));
  const travelStart = (s) => (s.fwd ? s.o.p0 ?? ptAt(s.o, 0) : s.o.p1 ?? ptAt(s.o, endU(s.o)));
  const result = out.map((s) => ({ ...s, cur: s.o }));
  const extra = [];
  const n = result.length, lim = closed ? n : n - 1;
  for (let i = 0; i < lim; i++) {
    const A = result[i], B = result[(i + 1) % n];
    const ea = travelEnd(A), sb = travelStart(B);
    if (dist(ea, sb) < 1e-6) continue;
    const vtx = A.fwd ? A.seg.p1 ?? ptAt(A.seg, endU(A.seg)) : A.seg.p0 ?? ptAt(A.seg, 0);
    let ps = intersectInfinite(A.cur, B.cur);
    if (!ps.length) ps = [];
    ps = ps.filter((p) => dist(p, vtx) <= Math.abs(d) * 6 + 1e-6);
    ps.sort((p, q) => dist(p, vtx) - dist(q, vtx));
    // iç köşe (kırpma) mı dış köşe (boşluk) mu: kesişim A'nın ofset ucundan geriye mi ileriye mi
    const x = ps[0];
    let gap = true;
    if (x) {
      const tA = tangentAt(A.cur, A.fwd ? endU(A.cur) : 0); const dirA = A.fwd ? tA : [-tA[0], -tA[1]];
      gap = dot(sub(x, ea), dirA) > 1e-9;
    }
    if (x && (!gap || join === 'sharp')) { A.cur = trimEnd(A, x, true); B.cur = trimEnd(B, x, false); }
    else if (join === 'round' || !x) { // vtx merkezli yay
      const r = Math.abs(d); const a1 = Math.atan2(ea[1] - vtx[1], ea[0] - vtx[0]), a2 = Math.atan2(sb[1] - vtx[1], sb[0] - vtx[0]);
      const turnLeft = d > 0 ? false : true; // sol ofsette boşluk sağa dönüşte olur (CW yay)
      let sw = turnLeft ? wrap(a2 - a1) : -wrap(a1 - a2);
      if (r > TOL && Math.abs(sw) > 1e-9) extra.push({ after: i, seg: sw > 0 ? mkArc(vtx, r, a1, sw) : mkArc(vtx, r, a2, -sw), fwd: sw > 0 });
    }
  }
  const ordered = [];
  result.forEach((s, i) => { ordered.push({ seg: s.cur, fwd: s.fwd }); for (const e of extra) if (e.after === i) ordered.push({ seg: e.seg, fwd: e.fwd }); });
  return ordered;
}
// segmenti, gidiş yönündeki başlangıç/bitiş ucundan x noktasına çek/uzat (x eğri taşıyıcısı üzerinde)
function trimEnd(item, x, atEnd) {
  const s = item.cur; const fwd = item.fwd;
  // kanonik yönde hangi uç değişecek: gidişin sonu fwd ise kanonik son, değilse kanonik başlangıç
  const canonEnd = atEnd ? fwd : !fwd;
  if (s.type === 'line') return canonEnd ? mkLine(s.p0, x) : mkLine(x, s.p1);
  if (s.type === 'arc') {
    const ang = Math.atan2(x[1] - s.c[1], x[0] - s.c[0]);
    if (canonEnd) { const sw = wrap(ang - s.a0); return mkArc(s.c, s.r, s.a0, sw < 1e-9 ? TAU : sw); }
    const end = s.a0 + s.sweep; const sw = wrap(end - ang); return mkArc(s.c, s.r, ang, sw < 1e-9 ? TAU : sw);
  }
  return s;
}
// iç içe geçmiş eğri zinciri sırala: serbest segment listesinden uç uca bağlı zincir (ilk bulunan). Döner [{seg,fwd,i}] ya da null
export function orderChain(segs, tol = 1e-6) {
  const n = segs.length; const used = new Array(n).fill(false); const ends = segs.map((s) => startEnd(s));
  const open = segs.map((s) => !isClosed(s));
  const take = (i, fwd) => ({ seg: segs[i], fwd, i });
  if (!n) return null;
  // başlangıç: bir ucu başka hiçbir parçaya değmeyen parça, yoksa 0
  let start = 0;
  for (let i = 0; i < n; i++) { if (!open[i]) continue; const deg = (pt) => segs.reduce((k, _, j) => k + (j !== i && open[j] && (dist(ends[j][0], pt) < tol || dist(ends[j][1], pt) < tol) ? 1 : 0), 0); if (deg(ends[i][0]) === 0 || deg(ends[i][1]) === 0) { start = i; break; } }
  const first = take(start, true); const chain = [first]; used[start] = true;
  if (!open[start]) return chain;
  let cur = first.seg === undefined ? null : ends[start][1];
  if (start !== 0 || true) { /* uç değmesi yoksa ters başlat */ const deg0 = segs.some((s, j) => j !== start && open[j] && (dist(ends[j][0], ends[start][0]) < tol || dist(ends[j][1], ends[start][0]) < tol)); const deg1 = segs.some((s, j) => j !== start && open[j] && (dist(ends[j][0], ends[start][1]) < tol || dist(ends[j][1], ends[start][1]) < tol)); if (deg1 === false && deg0) { chain[0] = take(start, false); cur = ends[start][0]; } }
  for (;;) {
    let found = false;
    for (let j = 0; j < n; j++) {
      if (used[j] || !open[j]) continue;
      if (dist(ends[j][0], cur) < tol) { chain.push(take(j, true)); cur = ends[j][1]; used[j] = true; found = true; break; }
      if (dist(ends[j][1], cur) < tol) { chain.push(take(j, false)); cur = ends[j][0]; used[j] = true; found = true; break; }
    }
    if (!found) break;
  }
  return chain;
}

// ------------------------------------------------------------ teğetler
// p noktasından daireye teğet noktaları (0, 1 ya da 2 nokta)
export function tangentPoints(p, c, r) {
  const d = dist(p, c); if (d < r - TOL) return []; if (Math.abs(d - r) <= TOL) return [p.slice()];
  const base = Math.atan2(p[1] - c[1], p[0] - c[0]), da = Math.acos(r / d);
  return [[c[0] + r * Math.cos(base + da), c[1] + r * Math.sin(base + da)], [c[0] + r * Math.cos(base - da), c[1] + r * Math.sin(base - da)]];
}
// iki daireye ortak teğet doğruları: [{a:[x,y] (1. dairede), b:[x,y] (2. dairede), kind:'outer'|'inner'}]
export function commonTangents(c1, r1, c2, r2) {
  const d = dist(c1, c2); if (d < TOL) return [];
  const th = Math.atan2(c2[1] - c1[1], c2[0] - c1[0]);
  const res = [];
  for (const [kind, s2] of [['outer', 1], ['inner', -1]]) {
    const k = (r1 - s2 * r2) / d; if (Math.abs(k) > 1 + 1e-12) continue;
    const ph = Math.acos(Math.min(1, Math.max(-1, k)));
    for (const sg of [1, -1]) {
      const a = th + sg * ph; const n = [Math.cos(a), Math.sin(a)];
      res.push({ kind, a: [c1[0] + r1 * n[0], c1[1] + r1 * n[1]], b: [c2[0] + s2 * r2 * n[0], c2[1] + s2 * r2 * n[1]] });
    }
  }
  return res;
}
// Köşe yuvarlatma merkezi: A ve B parçalarına (taşıyıcı eğrileri) r yarıçaplı teğet daire. hint: tercih edilen nokta (köşe).
// Döner {c, tA, tB, uA, uB} ya da null. Teğet noktaları parçaların KENDİ aralığında olmalıdır (lineer uzantı payı: slack).
export function filletCenter(A, B, r, hint, slack = 0) {
  const offs = (s) => {
    if (s.type === 'line') return [offsetSeg(s, r), offsetSeg(s, -r)];
    const base = mkCircle(s.c, s.r); const o = [mkCircle(s.c, s.r + r)]; if (s.r - r > TOL) o.push(mkCircle(s.c, s.r - r)); return o;
  };
  const infinite = (s) => (s.type === 'line' ? s : mkCircle(s.c, s.r));
  const cands = [];
  for (const oa of offs(A)) for (const ob of offs(B)) for (const p of intersectInfinite(oa, ob)) cands.push(p);
  let best = null;
  for (const c of cands) {
    const ca = closestPoint(A, c), cb = closestPoint(B, c);
    if (Math.abs(ca.d - r) > 1e-6 || Math.abs(cb.d - r) > 1e-6) continue; // teğet nokta aralık içinde değil (uç yakalandı)
    if (slack === 0) {
      // aralık denetimi: closestPoint aralığa kıstırır; kıstırılmışsa mesafe r olmaz
    }
    const sc = dist(c, hint);
    if (!best || sc < best.sc) best = { c, tA: ca.p, tB: cb.p, uA: ca.u, uB: cb.u, sc };
  }
  return best;
}

// ------------------------------------------------------------ çokgen alanı / yardımcılar
export function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// parçanın [0,U] aralığında yönlü alan katkısı: ½∮(x dy − y dx) (Green), yay/elips için analitik
export function areaContribution(seg, fwd = true) {
  let a;
  switch (seg.type) {
    case 'line': a = cross(seg.p0, seg.p1) / 2; break;
    case 'circle': a = Math.PI * seg.r * seg.r; break;
    case 'arc': { const t0 = seg.a0, t1 = seg.a0 + seg.sweep, r = seg.r, c = seg.c; a = 0.5 * (r * r * (t1 - t0) + c[0] * r * (Math.sin(t1) - Math.sin(t0)) - c[1] * r * (Math.cos(t1) - Math.cos(t0))); break; }
    case 'ellipse': a = Math.PI * seg.rx * seg.ry; break;
    case 'ellarc': { // ½[rx·ry·Δt + c × R(Q(t1) − Q(t0))] (analitik)
      const t0 = seg.a0, t1 = seg.a0 + seg.sweep, cr = Math.cos(seg.rot), sr = Math.sin(seg.rot);
      const dq = [seg.rx * (Math.cos(t1) - Math.cos(t0)), seg.ry * (Math.sin(t1) - Math.sin(t0))]; const rq = [dq[0] * cr - dq[1] * sr, dq[0] * sr + dq[1] * cr];
      a = 0.5 * (seg.rx * seg.ry * seg.sweep + cross(seg.c, rq)); break;
    }
    default: { const pts = sample(seg, 0.0005); a = 0; for (let i = 0; i < pts.length - 1; i++) a += cross(pts[i], pts[i + 1]) / 2; if (seg.type === 'ellarc') { /* örneklenmiş */ } }
  }
  return fwd ? a : -a;
}
