// Yukseklik haritasi (tek degerli dexel): Z yonunde her XY hucresi icin stok ust yuksekligi. Saf JS.
// Heightmap = { x0, y0, res, nx, ny, data: Float32Array(nx*ny), err? }   hucre (i,j) merkezi: (x0+(i+0.5)res, y0+(j+0.5)res); data[j*nx+i]
import { KErr } from '../../shared/errors.js';
const simErr = (code, params = {}) => new KErr(code, params);

export function createHeightmap(minXY, maxXY, res, fill = 0) {
  if (!(res > 0) || !Number.isFinite(res)) throw simErr('cam.sim.bad_res', { res });
  const nx = Math.max(1, Math.round((maxXY[0] - minXY[0]) / res)), ny = Math.max(1, Math.round((maxXY[1] - minXY[1]) / res));
  if (nx * ny > 64e6) throw simErr('cam.sim.grid_too_big', { nx, ny });
  const data = new Float32Array(nx * ny); data.fill(fill);
  return { x0: minXY[0], y0: minXY[1], res, nx, ny, data };
}
export function cloneHeightmap(h) { return { ...h, data: new Float32Array(h.data) }; }
// fn(x, y) -> z ile doldurur (ornegin silindir stok ya da model)
export function heightmapFromFn(minXY, maxXY, res, fn) {
  const h = createHeightmap(minXY, maxXY, res);
  for (let j = 0; j < h.ny; j++) for (let i = 0; i < h.nx; i++) h.data[j * h.nx + i] = fn(h.x0 + (i + 0.5) * res, h.y0 + (j + 0.5) * res);
  return h;
}
// Stok baslangic haritasi: kutu (duz ust) ya da silindir (WP-07; eksen X, kesit merkezi (yc, zc), yaricap R: ust z = zc + sqrt(R^2 - (y-yc)^2))
export function stockHeightmap(box, res, cyl = null) {
  if (!cyl) return createHeightmap([box.min[0], box.min[1]], [box.max[0], box.max[1]], res, box.max[2]);
  return heightmapFromFn([box.min[0], box.min[1]], [box.max[0], box.max[1]], res, (x, y) => cyl.zc + Math.sqrt(Math.max(0, cyl.R * cyl.R - (y - cyl.yc) * (y - cyl.yc))));
}
// En yakin hucre degeri; harita disinda NaN
export function sampleHeightmap(h, x, y) {
  const i = Math.floor((x - h.x0) / h.res), j = Math.floor((y - h.y0) / h.res);
  if (i < 0 || j < 0 || i >= h.nx || j >= h.ny) return NaN;
  return h.data[j * h.nx + i];
}
// a ile b arasindaki hacim farki (a - b) * hucre alani; ayni izgara olmali
export function volumeBetween(a, b) {
  if (a.nx !== b.nx || a.ny !== b.ny) throw simErr('cam.sim.grid_mismatch', {});
  let s = 0; for (let k = 0; k < a.data.length; k++) s += a.data[k] - b.data[k];
  return s * a.res * a.res;
}
export function heightmapStats(h) {
  let mn = Infinity, mx = -Infinity; for (let k = 0; k < h.data.length; k++) { const v = h.data[k]; if (v < mn) mn = v; if (v > mx) mx = v; }
  return { min: mn, max: mx };
}
