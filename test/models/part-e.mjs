// e. Kademeli mil: revolve (5 kademe, fatura radyüsleri profilde yay) + kama kanalı (cut) + uç pahları
import { B, Sk, basePl, runMain, std, PI, revMom, polySample, integrate, newKernel, occupied } from './lib.mjs';
export const name = 'e-kademeli-mil';
export const defaults = { D1: 20, D2: 30, D3: 40, D4: 30, D5: 24, L1: 25, L2: 40, L3: 60, L4: 35, L5: 30, RF: 1, CH: 1, KW: 8, KD: 4, KX0: 30, KX1: 60 };
export function profile(p) {
  const D = [p.D1, p.D2, p.D3, p.D4, p.D5], Lg = [p.L1, p.L2, p.L3, p.L4, p.L5]; const N = D.length;
  const xb = [0]; Lg.forEach((l) => xb.push(xb[xb.length - 1] + l)); const r = D.map((d) => d / 2);
  const pts = [[0, 0], [xb[N], 0], [xb[N], r[N - 1]]]; const rad = [0, 0, 0];
  for (let k = N - 1; k >= 1; k--) { const rl = r[k - 1], rr = r[k]; if (Math.abs(rl - rr) < 1e-9) continue; pts.push([xb[k], rr], [xb[k], rl]); if (rr < rl) rad.push(p.RF, 0); else rad.push(0, p.RF); }
  pts.push([0, r[0]]); rad.push(0); return { pts, rad, xb, r };
}
export async function build(K, p = defaults, refs = null, opt = {}) {
  const b = new B(K, p, refs); const P = profile(p);
  const s1 = new Sk(); s1.poly(P.pts, P.rad); b.sketch('s1', basePl('XZ'), s1);
  b.add({ id: 'sh', type: 'revolve', sketch: 's1', profiles: 'all', axis: { kind: 'sketchX' }, angle: '360', op: 'new' });
  const zt = p.D2 / 2 + 1;
  const s2 = new Sk(); s2.rect(p.KX0, -p.KW / 2, p.KX1, p.KW / 2); b.sketch('s2', basePl('XY', zt), s2);
  b.add({ id: 'kw', type: 'extrude', sketch: 's2', profiles: 'all', dist: String(p.KD + 1), extent: 'dist', dir: 'one', flip: true, op: 'cut' });
  const xN = P.xb[P.xb.length - 1];
  const ce = await b.pick('ch', (K) => { const E = []; const n = K.last.bodies.get('sh').shape.edges.length; for (let i = 0; i < n; i++) { const d = K.describe({ body: 'sh', idx: i }, 'edge'); if (d.geom === 'CIRCLE' && ((Math.abs(d.center[0]) < 1e-6 && Math.abs(d.radius - p.D1 / 2) < 1e-6) || (Math.abs(d.center[0] - xN) < 1e-6 && Math.abs(d.radius - p.D5 / 2) < 1e-6))) E.push(d); } return E; });
  b.add({ id: 'ch', type: 'chamfer', edges: ce, d: 'CH' });
  return b;
}
export function analytic(p = defaults) {
  const P = profile(p); const xN = P.xb[P.xb.length - 1];
  const sw = polySample(P.pts, P.rad).map(([x, r]) => [r, x]); const main = revMom(sw);
  const r2 = p.D2 / 2, zf = r2 - p.KD, len = p.KX1 - p.KX0, hw = p.KW / 2;
  const area = integrate((y) => Math.sqrt(r2 * r2 - y * y) - zf, -hw, hw), mz = integrate((y) => (r2 * r2 - y * y - zf * zf) / 2, -hw, hw);
  const Vk = len * area, Mzk = len * mz;
  const c1 = 2 * PI * (p.D1 / 2 - p.CH / 3) * p.CH * p.CH / 2, c2 = 2 * PI * (p.D5 / 2 - p.CH / 3) * p.CH * p.CH / 2;
  const V = main.V - Vk - c1 - c2;
  const Mx = main.Mb - Vk * (p.KX0 + p.KX1) / 2 - c1 * (p.CH / 3) - c2 * (xN - p.CH / 3);
  const R = Math.max(p.D1, p.D2, p.D3, p.D4, p.D5) / 2;
  return { volume: V, bbox: [[0, -R, -R], [xN, R, R]], com: [Mx / V, 0, -Mzk / V], faces: [20, 26] };
}
export async function checks(t, K, p = defaults) {
  const b = await build(K, p); const an = analytic(p);
  const out = await std(t, K, b, an); if (!out) return;
  const r2 = p.D2 / 2, zf = r2 - p.KD, xm = (p.KX0 + p.KX1) / 2;
  t.ok(occupied(K, 'sh', [xm, 0, zf + 1]) === 0, 'E-geo: kama kanalı boş'); t.ok(occupied(K, 'sh', [xm, 0, zf - 1]) === 1, 'E-geo: kanal tabanı altı dolu');
  t.ok(occupied(K, 'sh', [xm, 5, r2 - 1.5]) === 1, 'E-geo: kanal yanı (y=5) dolu'); t.ok(occupied(K, 'sh', [xm, 0, -(zf + 1)]) === 1, 'E-geo: kanal karşı yüz dolu');
  t.ok(occupied(K, 'sh', [p.KX1 + 2, 0, zf + 1]) === 1, 'E-geo: kanal sonrası dolu');
  return out;
}
await runMain(import.meta.url, name, async (t) => { const K = newKernel(); await checks(t, K); });
