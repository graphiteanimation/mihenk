export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const dist = (a, b) => len(sub(a, b));
// Düzlem: {o, x, y, n}
export const BASE_PLANES = {
  XY: { x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] },
  XZ: { x: [1, 0, 0], y: [0, 0, 1], n: [0, -1, 0] },
  YZ: { x: [0, 1, 0], y: [0, 0, 1], n: [1, 0, 0] },
};
export function basePlane(name, offset = 0) {
  const b = BASE_PLANES[name] || BASE_PLANES.XY;
  const axis = name === 'XZ' ? [0, 1, 0] : name === 'YZ' ? [1, 0, 0] : [0, 0, 1];
  return { o: mul(axis, offset), x: b.x, y: b.y, n: b.n };
}
export function planeFromNormal(n, pointOnPlane) {
  n = norm(n);
  let x;
  if (Math.abs(n[2]) > 0.999) x = [1, 0, 0];
  else x = norm(cross([0, 0, 1], n));
  const y = norm(cross(n, x));
  const o = mul(n, dot(pointOnPlane, n)); // dünya orijininin düzleme izdüşümü
  return { o, x, y, n };
}
export const toWorld = (pl, u, v) => [pl.o[0] + pl.x[0] * u + pl.y[0] * v, pl.o[1] + pl.x[1] * u + pl.y[1] * v, pl.o[2] + pl.x[2] * u + pl.y[2] * v];
export const toLocal = (pl, p) => { const d = sub(p, pl.o); return [dot(d, pl.x), dot(d, pl.y)]; };
