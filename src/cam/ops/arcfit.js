// WP-15: yay uydurma ve dogrusal parca azaltma (IR duzeyinde; post bicimi degismez). op.arcFit = { tol?, arcs? } (tol mm, vars. 0,005;
// arcs false: yalniz dogru birlestirme). Ardisik 'feed' hareketleri (ayni tur, ayni F, ek alan yok) bir dizi olarak alinir:
//  - yay: XY'de uc noktadan cember; dizinin butun ara noktalari ve ara kirislerin sehimi cembere <= tol, z acıyla dogrusal (helis
//    dahil) <= tol, tarama <= 180 derece, yaricap [0,05, 2000] mm. En az 4 nokta (3 parca) bir yaya donusur.
//  - dogru: noktalar kirise (3B) <= tol kaldikca uzatilir.
// Sapma tanimi: eski yolun her kosesinin yeni yola uzakligi <= tol (ve yeni yayin eski kirislerden sehimi <= tol).
import { mk, computeStats, validateToolpath, ARC_MIN_CHORD } from '../ir.js';
import { cerr } from '../geom/err.js';

const RMIN = 0.05, RMAX = 2000;
const sameRun = (a, b) => a.t === 'feed' && b.t === 'feed' && a.kind === b.kind && Math.abs(a.f - b.f) < 1e-9 && Object.keys(a).length === Object.keys(b).length;
function circle3(a, b, c) {
  const ax = a[0], ay = a[1], bx = b[0], by = b[1], cx = c[0], cy = c[1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)); if (Math.abs(d) < 1e-12) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d, uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return [ux, uy, Math.hypot(ax - ux, ay - uy)];
}
// pts[i..j] yay olur mu: { c:[x,y], r, dir } | null
function tryArc(pts, i, j, tol) {
  const m = (i + j) >> 1; const C = circle3(pts[i], pts[m], pts[j]); if (!C) return null;
  const [ux, uy, r] = C; if (!(r >= RMIN && r <= RMAX)) return null;
  const ang = (p) => Math.atan2(p[1] - uy, p[0] - ux);
  const cr = (pts[m][0] - pts[i][0]) * (pts[j][1] - pts[i][1]) - (pts[m][1] - pts[i][1]) * (pts[j][0] - pts[i][0]);
  const sgn = cr > 0 ? 1 : -1; // ccw: yay kirisin sagina siskin (merkez solda)
  let th = 0; let prev = ang(pts[i]); const ths = [0];
  for (let k = i + 1; k <= j; k++) {
    const a = ang(pts[k]); let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    if (d * sgn <= 1e-12) return null; // geri donus / durma
    th += d; prev = a; ths.push(th);
    const p = pts[k]; if (Math.abs(Math.hypot(p[0] - ux, p[1] - uy) - r) > 0.95 * tol) return null; // %5 pay: ornekleme/yuvarlama
    const q = pts[k - 1]; for (const s of [0.25, 0.5, 0.75]) { const mx = q[0] + (p[0] - q[0]) * s - ux, my = q[1] + (p[1] - q[1]) * s - uy; if (Math.abs(Math.hypot(mx, my) - r) > 0.9 * tol) return null; } // eski kiris yaya <= tol (ara noktalar icin %10 pay)
  }
  if (Math.abs(th) > Math.PI) return null;
  const z0 = pts[i][2], z1 = pts[j][2];
  for (let k = i + 1; k < j; k++) if (Math.abs(pts[k][2] - (z0 + ((z1 - z0) * ths[k - i]) / th)) > tol) return null;
  // yayin ara noktalari 3B kirisler boyunca da yakin mi (z dogrusal varsayimi): kose kontrolu yeterli kabul
  return { c: [ux, uy], r, dir: sgn > 0 ? 'ccw' : 'cw' };
}
function lineOk(pts, i, j, tol) {
  const a = pts[i], b = pts[j]; const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const L2 = dx * dx + dy * dy + dz * dz;
  for (let k = i + 1; k < j; k++) {
    const p = pts[k]; const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy + (p[2] - a[2]) * dz) / L2)) : 0;
    if (Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy, p[2] - a[2] - t * dz) > tol) return false;
  }
  return true;
}
// noktalar -> hareketler (feed/arc) ; tmpl: ilk feed hareketi (f, kind, ek alanlar)
export function fitPoints(pts, tol, tmpl, arcs = true) {
  const out = []; let i = 0; const n = pts.length;
  while (i < n - 1) {
    let best = null;
    if (arcs && n - i >= 4) {
      let fails = 0;
      for (let j = i + 3; j < n; j++) { const A = tryArc(pts, i, j, tol); if (A) { best = { j, A }; fails = 0; } else if (++fails > 3) break; }
    }
    if (best && Math.hypot(pts[best.j][0] - pts[i][0], pts[best.j][1] - pts[i][1]) >= ARC_MIN_CHORD) {
      const p = pts[best.j]; const s = pts[i];
      out.push({ ...tmpl, ...mk.arc(p[0], p[1], p[2], best.A.c[0] - s[0], best.A.c[1] - s[1], best.A.dir, tmpl.f, tmpl.kind) }); i = best.j; continue;
    }
    let j = i + 1; while (j + 1 < n && lineOk(pts, i, j + 1, tol)) j++;
    const p = pts[j]; out.push({ ...tmpl, x: p[0], y: p[1], z: p[2] }); i = j;
  }
  return out;
}
export function applyArcFit(tp, op, machine = null) {
  const o = op.arcFit === true ? {} : op.arcFit; if (!o || typeof o !== 'object') return tp;
  const tol = o.tol ?? 0.005; if (!(tol > 0 && tol <= 1)) throw cerr('cam.op.bad_field', { field: 'arcFit.tol', expect: '0 < tol <= 1', op: op.name || op.id });
  const arcs = o.arcs !== false; const mv = tp.moves; const out = []; let pos = null; let k = 0;
  const posOf = (m) => (m.t === 'rapid' || m.t === 'feed' || m.t === 'arc' ? [m.x, m.y, m.z] : null);
  while (k < mv.length) {
    const m = mv[k];
    if (m.t === 'feed' && pos) {
      let e = k; while (e + 1 < mv.length && sameRun(m, mv[e + 1])) e++;
      if (e - k >= 1) {
        const pts = [pos]; for (let q = k; q <= e; q++) pts.push([mv[q].x, mv[q].y, mv[q].z]);
        out.push(...fitPoints(pts, tol, m, arcs)); pos = pts[pts.length - 1]; k = e + 1; continue;
      }
    }
    out.push(m); const p = posOf(m); if (p) pos = p; k++;
  }
  const res = { ...tp, moves: out, meta: { ...tp.meta, arcFit: { tol, before: mv.length, after: out.length } } };
  res.stats = computeStats(res, { rapidFeed: machine?.feed?.rapid ?? undefined });
  try { validateToolpath(res); } catch (e) { throw cerr('cam.internal_ir', { code: e.code || 'internal', params: JSON.stringify(e.params || {}) }); }
  return res;
}
