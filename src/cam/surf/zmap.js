// WP-15 (T-20): model ust yukseklik haritasindan ada / bolge. Tek bir kesit (camSection) yerine "z seviyesinde ya da ustunde malzeme
// olan her yer ada": 3 eksende takim ustten geldigi icin catili oyuk, tunel ve yan delik ada icinde kalir (yarik gorunmez).
// hm: cekirdek camHeightmap bicimi (hucre merkezi, malzeme yoksa -Infinity). Sinir muhafazakar: ada maskesi bir hucre genisletilir,
// sinir son ic hucre ile ilk dis hucrenin ortasindan gecer, sonra res/2 ile sadelestirilir (gercek sinirin disinda kalir).
import * as P from '../geom/path2d.js';
import { toItems } from '../geom/select.js';
import { isoLines } from './iso.js';

function dp(pts, tol) {
  if (pts.length < 3) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, c] = st.pop(); let md = 0, mi = -1; const A = pts[a], C = pts[c]; const dx = C[0] - A[0], dy = C[1] - A[1], L = Math.hypot(dx, dy);
    for (let i = a + 1; i < c; i++) { const d = L > 1e-12 ? Math.abs((pts[i][0] - A[0]) * dy - (pts[i][1] - A[1]) * dx) / L : Math.hypot(pts[i][0] - A[0], pts[i][1] - A[1]); if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, c]); } }
  return pts.filter((_, i) => keep[i]);
}
// z seviyesindeki ada bolgeleri: [{outer, holes}] (path2d; dis CCW, delik CW). z = -Infinity: herhangi bir malzeme (siluet).
export function islandRegions(hm, z, { dilate = 1 } = {}) {
  const { nx, ny, res, x0, y0, data } = hm; const W = nx + 2, H = ny + 2;
  const inside = (i, j) => { const v = data[j * nx + i]; return z === -Infinity ? v > -Infinity : v >= z - 1e-9; };
  const m0 = new Uint8Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (inside(i, j)) m0[j * nx + i] = 1;
  const V = new Float64Array(W * H);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let on = 0; for (let dj = -dilate; dj <= dilate && !on; dj++) for (let di = -dilate; di <= dilate; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < nx && jj < ny && m0[jj * nx + ii]) { on = 1; break; } }
    V[(j + 1) * W + i + 1] = on;
  }
  const c = (k) => [x0 + ((k % W) - 0.5) * res, y0 + (((k / W) | 0) - 0.5) * res];
  const lines = isoLines(V, W, H, 0.5, (ka, kb) => { const a = c(ka), b = c(kb); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; });
  const loops = [];
  for (const L of lines) {
    if (!L.closed || L.pts.length < 3) continue;
    const pts = dp([...L.pts, L.pts[0]], res / 2); if (pts.length < 4) continue;
    const ring = pts.slice(0, -1).reverse(); // ada sagdaydi -> solda (path2d: dis CCW, delik CW)
    const loop = ring.map((p, i) => P.line(p, ring[(i + 1) % ring.length]));
    if (Math.abs(P.area(loop)) > res * res) loops.push(loop);
  }
  return P.regionsFromLoops(loops);
}
// bolgeler -> "yuz" nesneleri (camFaceLoops benzeri; select.js bicimi)
export function islandFaces(hm, z, zFace) {
  const regs = islandRegions(hm, z);
  return regs.map((r) => ({ z: zFace, normalOk: true, outer: toItems(r.outer), inners: r.holes.map(toItems), open: false, above: null, src: 'zmap' }));
}
