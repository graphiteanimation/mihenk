// b. Mengene yumuşak çenesi: blok + kademe (cut) + V kanal + 2 havşalı delik (yüz üstüne sketch) + kenar pahları
import { B, Sk, basePl, runMain, std, PI, allHolePositions, matchPoints, newKernel, occupied } from './lib.mjs';
export const name = 'b-yumusak-cene';
export const defaults = { L: 150, TK: 25, H: 55, SD: 8, SH: 15, DV: 6, ZC: 12, HZ: 29, HX: 30, HD: 9, CBD: 14, CBH: 7, CF: 1 };
export async function build(K, p = defaults, refs = null, opt = {}) {
  const b = new B(K, p, refs);
  const s1 = new Sk(); s1.rect(0, 0, p.L, p.TK); b.sketch('s1', basePl('XY'), s1);
  b.add({ id: 'blk', type: 'extrude', sketch: 's1', profiles: 'all', dist: 'H', extent: 'dist', dir: 'one', op: 'new' });
  if (!opt.noStep) {
    const s2 = new Sk(); s2.rect(0, p.H - p.SH, p.SD, p.H); b.sketch('s2', basePl('YZ'), s2); // YZ: x=Y, y=Z, n=+X
    b.add({ id: 'step', type: 'extrude', sketch: 's2', profiles: 'all', dist: 'L', extent: 'dist', dir: 'one', op: 'cut' });
  }
  const s3 = new Sk(); s3.poly([[0, p.ZC - p.DV], [p.DV, p.ZC], [0, p.ZC + p.DV]]); b.sketch('s3', basePl('YZ'), s3);
  b.add({ id: 'vee', type: 'extrude', sketch: 's3', profiles: 'all', dist: 'L', extent: 'dist', dir: 'one', op: 'cut' });
  const back = await b.pick('back', (K) => { const n = K.last.bodies.get('blk').shape.faces.length; for (let i = 0; i < n; i++) { const d = K.describe({ body: 'blk', idx: i }, 'face'); if (d.geom === 'PLANE' && d.normal[1] > 0.99 && Math.abs(d.fp[1] - p.TK) < 1e-6) return d; } throw new Error('arka yüz yok'); });
  const s4 = new Sk(); // yüz düzlemi: x=(-1,0,0), y=(0,0,1) => dünya (-u, TK, v)
  s4.point(-(p.L / 2 - p.HX), p.HZ); s4.point(-(p.L / 2 + p.HX), p.HZ);
  b.sketch('s4', { kind: 'face', ref: back }, s4);
  b.add({ id: 'hol', type: 'hole', sketch: 's4', kind: 'cbore', dia: 'HD', cboreDia: 'CBD', cboreDepth: 'CBH', extent: 'all', depth: '0' });
  if (opt.noChamfer) return b;
  const ce = await b.pick('chf', (K) => { const E = []; const n = K.last.bodies.get('blk').shape.edges.length; for (let i = 0; i < n; i++) { const d = K.describe({ body: 'blk', idx: i }, 'edge'); if (d.geom === 'LINE' && Math.abs(d.start[1] - p.TK) < 1e-6 && Math.abs(d.end[1] - p.TK) < 1e-6) E.push(d); } return E; });
  b.add({ id: 'chf', type: 'chamfer', edges: ce, d: 'CF' });
  return b;
}
export function analytic(p = defaults, opt = {}) {
  const d = p.CF;
  const holeV = PI * (p.CBD / 2) ** 2 * p.CBH + PI * (p.HD / 2) ** 2 * (p.TK - p.CBH);
  const V = p.L * p.TK * p.H - (opt.noStep ? 0 : p.L * p.SD * p.SH) - p.L * p.DV * p.DV - (opt.noHoles ? 0 : 2 * holeV) - (opt.noChamfer ? 0 : 0.5 * d * d * (2 * p.L + 2 * p.H) - 4 * d ** 3 / 3);
  return { volume: V, bbox: [[0, 0, 0], [p.L, p.TK, p.H]], com: [p.L / 2, null, null], faces: [14, 40] };
}
export async function checks(t, K, p = defaults) {
  const b = await build(K, p); const an = analytic(p);
  const out = await std(t, K, b, an); if (!out) return;
  const exp = [[p.L / 2 - p.HX, p.TK, p.HZ], [p.L / 2 + p.HX, p.TK, p.HZ]];
  const got = allHolePositions(out.holes, p.HD); const m = matchPoints(got, exp);
  t.ok(m.miss.length === 0, `B-holes: iki delik konumu dünya koordinatında (${exp.map((e) => e.join('/')).join(' ; ')}) olmalı; bulunan ${JSON.stringify(got)}`);
  // geometri kanıtı: delik ekseni boş, yan taraf dolu; havşa derinliği
  for (const e of exp) {
    t.ok(occupied(K, 'blk', [e[0], 10, e[2]]) === 0, `B-geo: delik ekseni boş (${e[0]},10,${e[2]})`);
    t.ok(occupied(K, 'blk', [e[0] + 5.5, 10, e[2]]) === 1, `B-geo: delik yanı dolu (r=5.5, ince gövde)`);
    t.ok(occupied(K, 'blk', [e[0] + 6, p.TK - 3, e[2]]) === 0, `B-geo: havşa boşluğu (r=6, y=22)`);
    t.ok(occupied(K, 'blk', [e[0] + 6, p.TK - 10, e[2]]) === 1, `B-geo: havşa altı dolu (r=6, y=15)`);
  }
  t.ok(occupied(K, 'blk', [75, 1, p.ZC]) === 0, 'B-geo: V kanal içi boş'); t.ok(occupied(K, 'blk', [75, 1, p.ZC + p.DV + 1]) === 1, 'B-geo: V kanal üstü dolu');
  t.ok(occupied(K, 'blk', [75, 2, p.H - 2]) === 0, 'B-geo: kademe boşluğu'); t.ok(occupied(K, 'blk', [75, p.SD + 2, p.H - 2]) === 1, 'B-geo: kademe arkası dolu');
  return out;
}
await runMain(import.meta.url, name, async (t) => { const K = newKernel(); await checks(t, K); });
