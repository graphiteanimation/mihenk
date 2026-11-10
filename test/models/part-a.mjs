// a. Cıvata daireli flanş: revolve gövde + merkez delik + N×havşalı delik (dairesel desen) + dış pah + iç yuvarlatma
import { B, Sk, basePl, runMain, std, revMom, polySample, PI, rrArea, allHolePositions, matchPoints, filletSection, newKernel } from './lib.mjs';
export const name = 'a-flans';
export const defaults = { OD: 120, T: 12, HD: 60, HH: 30, BD: 20, N: 6, PCD: 90, HOLE: 9, CSD: 17, CH: 1.5, RF: 3 };
export async function build(K, p = defaults, refs = null, opt = {}) {
  const b = new B(K, p, refs);
  const s1 = new Sk(); s1.poly([[0, 0], [p.OD / 2, 0], [p.OD / 2, p.T], [p.HD / 2, p.T], [p.HD / 2, p.HH], [0, p.HH]]);
  b.sketch('s1', basePl('XZ'), s1);
  b.add({ id: 'rv', type: 'revolve', sketch: 's1', profiles: 'all', axis: { kind: 'sketchY' }, angle: '360', op: 'new' });
  const s2 = new Sk(); s2.point(0, 0); b.sketch('s2', basePl('XY', 'HH'), s2);
  b.add({ id: 'bore', type: 'hole', sketch: 's2', kind: 'simple', dia: 'BD', extent: 'all', depth: '0' });
  const s3 = new Sk(); s3.point(p.PCD / 2, 0); b.sketch('s3', basePl('XY', 'T'), s3);
  b.add({ id: 'bolt', type: 'hole', sketch: 's3', kind: 'csink', dia: 'HOLE', csinkDia: 'CSD', csinkAngle: '90', extent: 'all', depth: '0' });
  b.add({ id: 'pat', type: 'pattern', kind: 'circ', source: { kind: 'feature', id: 'bolt' }, count: 'N', total: '360', axis: 'Z' });
  if (opt.noFinish) return b;
  const ce = await b.pick('och', (K) => { const bid = 'rv'; const E = []; const n = K.last.bodies.get(bid).shape.edges.length; for (let i = 0; i < n; i++) { const d = K.describe({ body: bid, idx: i }, 'edge'); if (d.geom === 'CIRCLE' && Math.abs(d.radius - p.OD / 2) < 1e-6 && (Math.abs(d.center[2]) < 1e-6 || Math.abs(d.center[2] - p.T) < 1e-6)) E.push(d); } return E; });
  b.add({ id: 'och', type: 'chamfer', edges: ce, d: 'CH' });
  const fe = await b.pick('ifil', (K) => { const bid = 'rv'; const E = []; const n = K.last.bodies.get(bid).shape.edges.length; for (let i = 0; i < n; i++) { const d = K.describe({ body: bid, idx: i }, 'edge'); if (d.geom === 'CIRCLE' && Math.abs(d.radius - p.HD / 2) < 1e-6 && Math.abs(d.center[2] - p.T) < 1e-6) E.push(d); } return E; });
  b.add({ id: 'ifil', type: 'fillet', edges: fe, r: 'RF' });
  return b;
}
export function analytic(p = defaults) {
  const R = p.OD / 2, hr = p.HD / 2, c = p.CH;
  const prof = polySample([[0, 0], [R - c, 0], [R, c], [R, p.T - c], [R - c, p.T], [hr, p.T], [hr, p.HH], [0, p.HH]], [0, 0, 0, 0, 0, p.RF, 0, 0]);
  const main = revMom(prof);
  const boreV = PI * (p.BD / 2) ** 2 * p.HH, boreM = boreV * p.HH / 2;
  const r = p.HOLE / 2, cr = p.CSD / 2;
  const hp = revMom([[0, 0], [cr, 0], [r, cr - r], [r, p.T], [0, p.T]]); // (yarıçap, derinlik)
  const hV = hp.V, hM = hV * p.T - hp.Mb;
  const V = main.V - boreV - p.N * hV, Mz = main.Mb - boreM - p.N * hM;
  return { volume: V, bbox: [[-R, -R, 0], [R, R, p.HH]], com: [0, 0, Mz / V], faces: [21, 21] };
}
export async function checks(t, K, p = defaults) {
  const b = await build(K, p); const an = analytic(p);
  const out = await std(t, K, b, an);
  if (!out) return;
  // delik verisi
  const expPos = Array.from({ length: p.N }, (_, k) => [p.PCD / 2 * Math.cos(2 * PI * k / p.N), p.PCD / 2 * Math.sin(2 * PI * k / p.N), p.T]);
  const got = allHolePositions(out.holes, p.HOLE);
  const m = matchPoints(got, expPos);
  t.ok(m.miss.length === 0, `A-holes: ${p.N} cıvata deliği konumunun tamamı holes[] içinde olmalı; eksik ${m.miss.length}/${p.N} (holes[] ${out.holes.length} girdi: ${out.holes.map((h) => h.feature + ':' + h.positions.length + (h.count != null ? ' count=' + h.count : '')).join(', ')})`);
  const bore = out.holes.find((h) => h.feature === 'bore'); t.ok(bore && Math.abs(bore.dia - p.BD) < 1e-9 && bore.through && bore.positions[0][2] === p.HH, 'A-holes: merkez delik verisi');
  const bolt = out.holes.find((h) => h.feature === 'bolt'); t.ok(bolt && bolt.kind === 'csink' && Math.abs(bolt.dia - p.HOLE) < 1e-9, 'A-holes: havşalı delik verisi (tip, çap)');
  t.ok(bolt && bolt.dir[2] === -1, 'A-holes: delik yönü -Z');
  // analitik beklenen gövdeyi yüz dökümü ile karşılaştır: yüz türleri
  const body = out.bodies[0]; const kinds = {}; for (let i = 0; i < body.nFaces; i++) { const d = K.describe({ body: body.id, idx: i }, 'face'); kinds[d.geom] = (kinds[d.geom] || 0) + 1; }
  t.note('a-yüz-türleri', kinds);
  t.ok(kinds.PLANE === 3, `yüz türü: PLANE=3 (alt, flanş üstü, hub üstü): ${JSON.stringify(kinds)}`);
  // ağırlık merkezi simetri: 6 kat
  return out;
}
await runMain(import.meta.url, name, async (t) => { const K = newKernel(); await checks(t, K); });
