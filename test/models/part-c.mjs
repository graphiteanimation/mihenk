// c. Divizör ayna adaptör plakası: disk + merkezleme faturası (yüz üstüne sketch) + NS×120° kanal (yay+çizgi profili) + 4 cıvata deliği + yuvarlatma
import { B, Sk, basePl, runMain, std, PI, allHolePositions, matchPoints, filletSection, newKernel, occupied } from './lib.mjs';
export const name = 'c-ayna-adaptoru';
export const defaults = { OD: 160, T: 15, SPD: 80, SPH: 6, SW: 10, S1: 50, S2: 65, NS: 3, NB: 4, BPCD: 50, BD: 8.5, FR: 2 };
export async function build(K, p = defaults, refs = null, opt = {}) {
  const b = new B(K, p, refs);
  const s1 = new Sk(); s1.circle(0, 0, p.OD / 2); b.sketch('s1', basePl('XY'), s1);
  b.add({ id: 'disc', type: 'extrude', sketch: 's1', profiles: 'all', dist: 'T', extent: 'dist', dir: 'one', op: 'new' });
  const top = await b.pick('top', (K) => { const n = K.last.bodies.get('disc').shape.faces.length; for (let i = 0; i < n; i++) { const d = K.describe({ body: 'disc', idx: i }, 'face'); if (d.geom === 'PLANE' && d.normal[2] > 0.99 && Math.abs(d.fp[2] - p.T) < 1e-6) return d; } throw new Error('üst yüz yok'); });
  const s2 = new Sk(); s2.circle(0, 0, p.SPD / 2); b.sketch('s2', { kind: 'face', ref: top }, s2);
  b.add({ id: 'spg', type: 'extrude', sketch: 's2', profiles: 'all', dist: 'SPH', extent: 'dist', dir: 'one', op: 'join' });
  const s3 = new Sk(); s3.slot([p.S1, 0], [p.S2, 0], p.SW / 2); b.sketch('s3', basePl('XY'), s3);
  b.add({ id: 'slot', type: 'extrude', sketch: 's3', profiles: 'all', dist: 'T', extent: 'dist', dir: 'one', op: 'cut' });
  b.add({ id: 'spat', type: 'pattern', kind: 'circ', source: { kind: 'feature', id: 'slot' }, count: 'NS', total: '360', axis: 'Z' });
  const s4 = new Sk(); for (let k = 0; k < p.NB; k++) { const a = PI / 4 + (2 * PI * k) / p.NB; s4.point(p.BPCD / 2 * Math.cos(a), p.BPCD / 2 * Math.sin(a)); }
  b.sketch('s4', basePl('XY', p.T + p.SPH), s4);
  b.add({ id: 'hol', type: 'hole', sketch: 's4', kind: 'simple', dia: 'BD', extent: 'all', depth: '0' });
  const fe = await b.pick('fil', (K) => { const E = []; const n = K.last.bodies.get('disc').shape.edges.length; for (let i = 0; i < n; i++) { const d = K.describe({ body: 'disc', idx: i }, 'edge'); if (d.geom === 'CIRCLE' && Math.abs(d.radius - p.OD / 2) < 1e-6 && Math.abs(d.center[2] - p.T) < 1e-6) E.push(d); } return E; });
  b.add({ id: 'fil', type: 'fillet', edges: fe, r: 'FR' });
  return b;
}
export function analytic(p = defaults) {
  const R = p.OD / 2, T = p.T, fs = filletSection(p.FR);
  const Vd = PI * R * R * T, Vs = PI * (p.SPD / 2) ** 2 * p.SPH;
  const Vslot = ((p.S2 - p.S1) * p.SW + PI * (p.SW / 2) ** 2) * T, Vh = PI * (p.BD / 2) ** 2 * (T + p.SPH);
  const Vf = 2 * PI * (R - fs.cd) * fs.A;
  const V = Vd + Vs - p.NS * Vslot - p.NB * Vh - Vf;
  const Mz = Vd * T / 2 + Vs * (T + p.SPH / 2) - p.NS * Vslot * T / 2 - p.NB * Vh * (T + p.SPH) / 2 - Vf * (T - fs.cd);
  return { volume: V, bbox: [[-R, -R, 0], [R, R, T + p.SPH]], com: [0, 0, Mz / V], faces: [20, 26] };
}
export async function checks(t, K, p = defaults) {
  const b = await build(K, p); const an = analytic(p);
  const out = await std(t, K, b, an); if (!out) return;
  const exp = Array.from({ length: p.NB }, (_, k) => { const a = PI / 4 + 2 * PI * k / p.NB; return [p.BPCD / 2 * Math.cos(a), p.BPCD / 2 * Math.sin(a), p.T + p.SPH]; });
  const m = matchPoints(allHolePositions(out.holes, p.BD), exp); t.ok(m.miss.length === 0, 'C-holes: 4 cıvata deliği konumu');
  const mid = (p.S1 + p.S2) / 2;
  for (let k = 0; k < p.NS; k++) { const a = 2 * PI * k / p.NS; t.ok(occupied(K, 'disc', [mid * Math.cos(a), mid * Math.sin(a), 5]) === 0, `C-geo: kanal ${k} boş`); const a2 = a + PI / p.NS; t.ok(occupied(K, 'disc', [mid * Math.cos(a2), mid * Math.sin(a2), 5]) === 1, `C-geo: kanallar arası ${k} dolu`); }
  t.ok(occupied(K, 'disc', [0, 0, p.T + 3]) === 1, 'C-geo: fatura dolu'); t.ok(occupied(K, 'disc', [p.SPD / 2 + 3, 0, p.T + 3]) === 0, 'C-geo: fatura dışı boş');
  return out;
}
await runMain(import.meta.url, name, async (t) => { const K = newKernel(); await checks(t, K); });
