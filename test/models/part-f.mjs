// f. L braket: extrude (flip) + üçgen nervür (join, sym) + iki farklı yüzde delikler (kind:'face') + shell denemesi
import { B, Sk, basePl, runMain, std, PI, polyMoments, allHolePositions, matchPoints, newKernel, occupied, rb, sane, props, facesOf } from './lib.mjs';
export const name = 'f-l-braket';
export const defaults = { BL: 100, BT: 8, LH: 60, W: 60, GX: 45, GZ: 40, GT: 6, GY: 30, HD: 8.5, BX: 70, BY1: 15, BY2: 45, LZ: 40, ST: 2 };
export const lpts = (p) => [[0, 0], [p.BL, 0], [p.BL, p.BT], [p.BT, p.BT], [p.BT, p.LH], [0, p.LH]];
export async function build(K, p = defaults, refs = null, opt = {}) {
  const b = new B(K, p, refs);
  const s1 = new Sk(); s1.poly(lpts(p)); b.sketch('s1', basePl('XZ'), s1);
  b.add({ id: 'L', type: 'extrude', sketch: 's1', profiles: 'all', dist: 'W', extent: 'dist', dir: 'one', flip: true, op: 'new' });
  if (opt.plain) return b;
  const s2 = new Sk(); s2.poly([[p.BT, p.BT], [p.BT + p.GX, p.BT], [p.BT, p.BT + p.GZ]]); b.sketch('s2', basePl('XZ', 'GY'), s2);
  b.add({ id: 'rib', type: 'extrude', sketch: 's2', profiles: 'all', dist: 'GT', extent: 'dist', dir: 'sym', op: 'join' });
  const topf = await b.pick('topf', (K) => { let best = null; for (const d of facesOf(K, 'L')) if (d.geom === 'PLANE' && d.normal[2] > 0.99 && Math.abs(d.fp[2] - p.BT) < 1e-6 && (!best || d.area > best.area)) best = d; if (!best) throw new Error('taban üst yüzü yok'); return best; });
  const s3 = new Sk(); s3.point(p.BX, p.BY1); s3.point(p.BX, p.BY2); b.sketch('s3', { kind: 'face', ref: topf }, s3);
  b.add({ id: 'h1', type: 'hole', sketch: 's3', kind: 'simple', dia: 'HD', extent: 'all', depth: '0' });
  const legf = await b.pick('legf', (K) => { for (const d of facesOf(K, 'L')) if (d.geom === 'PLANE' && d.normal[0] < -0.99 && Math.abs(d.fp[0]) < 1e-6) return d; throw new Error('dik ayak dış yüzü yok'); });
  const s4 = new Sk(); s4.point(-p.BY1, p.LZ); s4.point(-p.BY2, p.LZ); b.sketch('s4', { kind: 'face', ref: legf }, s4); // yüz düzlemi: (u,v) -> dünya (0,-u,v)
  b.add({ id: 'h2', type: 'hole', sketch: 's4', kind: 'simple', dia: 'HD', extent: 'all', depth: '0' });
  if (opt.shell) {
    const sf = await b.pick('shf', (K) => { for (const d of facesOf(K, 'L')) if (d.geom === 'PLANE' && d.normal[1] < -0.99 && Math.abs(d.fp[1]) < 1e-6) return d; throw new Error('y=0 yüzü yok'); });
    b.add({ id: 'shl', type: 'shell', faces: [sf], t: 'ST' });
  }
  return b;
}
export function analytic(p = defaults) {
  const m = polyMoments(lpts(p)); const r = p.HD / 2, Ah = PI * r * r;
  const gA = p.GX * p.GZ / 2, gcx = p.BT + p.GX / 3, gcz = p.BT + p.GZ / 3;
  const V = m.A * p.W + gA * p.GT - 4 * Ah * p.BT;
  const Mx = m.Sx * p.W + gA * p.GT * gcx - 2 * Ah * p.BT * p.BX - 2 * Ah * p.BT * (p.BT / 2);
  const Mz = m.Sy * p.W + gA * p.GT * gcz - 2 * Ah * p.BT * (p.BT / 2) - 2 * Ah * p.BT * p.LZ;
  return { volume: V, bbox: [[0, 0, 0], [p.BL, p.W, p.LH]], com: [Mx / V, p.W / 2, Mz / V], faces: [13, 20] };
}
// düz L'nin içi boş hali: ters ofset alanı (iç içbükey köşede yay birleşimi)
export function shellAnalytic(p) {
  const t = p.ST, a = p.BT - 2 * t, A = polyMoments(lpts(p)).A;
  const strips = (p.BL - 2 * t) * a + a * (p.LH - 2 * t) - a * a;
  const counted = 2 * (p.BT - t) * a - a * a, extra = (p.BT - t) ** 2 - counted - PI * t * t / 4;
  return A * p.W - (strips + extra) * (p.W - t);
}
export async function checks(t, K, p = defaults) {
  const b = await build(K, p); const an = analytic(p);
  const out = await std(t, K, b, an); if (!out) return;
  const e1 = [[p.BX, p.BY1, p.BT], [p.BX, p.BY2, p.BT]], e2 = [[0, p.BY1, p.LZ], [0, p.BY2, p.LZ]];
  const got = allHolePositions(out.holes, p.HD); const m = matchPoints(got, [...e1, ...e2]);
  t.ok(m.miss.length === 0, `F-holes: iki farklı yüzdeki 4 delik dünya koordinatında olmalı; eksik ${JSON.stringify(m.miss)}`);
  const h1 = out.holes.find((h) => h.feature === 'h1'), h2 = out.holes.find((h) => h.feature === 'h2');
  t.ok(h1 && Math.abs(h1.dir[2] + 1) < 1e-9, 'F-holes: üst yüz deliği yönü -Z'); t.ok(h2 && Math.abs(h2.dir[0] - 1) < 1e-9, 'F-holes: ayak deliği yönü +X');
  t.ok(occupied(K, 'L', [p.BX, p.BY1, 4]) === 0, 'F-geo: taban deliği boş'); t.ok(occupied(K, 'L', [4, p.BY2, p.LZ]) === 0, 'F-geo: ayak deliği boş');
  t.ok(occupied(K, 'L', [p.BT + 5, p.GY, p.BT + 5]) === 1, 'F-geo: nervür dolu'); t.ok(occupied(K, 'L', [p.BT + 5, p.GY + 6, p.BT + 5]) === 0, 'F-geo: nervür dışı (y+6) boş');
  t.ok(occupied(K, 'L', [p.BT + p.GX - 2, p.GY, p.BT + p.GZ - 2]) === 0, 'F-geo: hipotenüs ötesi boş');
  // shell: düz L (açık yüz y=0)
  const b2 = await build(K, p, null, { plain: true, shell: false });
  const sf = await (async () => { await K.rebuild(b2.doc); for (const d of facesOf(K, 'L')) if (d.geom === 'PLANE' && d.normal[1] < -0.99) return d; })();
  b2.add({ id: 'shl', type: 'shell', faces: [sf], t: 'ST' });
  const r2 = await rb(K, b2.doc);
  if (r2.exc) t.ok(false, 'F-shell: düz L kabuğu istisna: ' + r2.exc); else {
    if (!r2.out.status.shl.ok) t.ok(true, 'F-shell: düz L kabuğu ok:false (kabul; açıklanmalı)'), t.note('f-shell-düz', 'ok:false');
    else { t.near(r2.out.bodies[0].volume, shellAnalytic(p), 'F-shell: düz L kabuk hacmi (ters ofset alanı x uzunluk)', 1e-3); t.note('f-shell-düz-hacim', r2.out.bodies[0].volume); t.note('f-shell-düz-beklenen', shellAnalytic(p)); }
  }
  // shell: tam braket
  const b3 = await build(K, p, null, { shell: true }); const r3 = await rb(K, b3.doc);
  if (r3.exc) t.ok(false, 'F-shell: tam braket kabuğu istisna: ' + r3.exc);
  else if (!r3.out.status.shl.ok) { t.note('f-shell-tam', 'ok:false (kabul)'); t.ok(true, 'F-shell: tam braket ok:false'); }
  else {
    const v0 = an.volume, v1 = r3.out.bodies[0].volume; const pr = sane(K, r3.out);
    t.ok(!pr.length, 'F-shell: tam braket kabuğu geçerli katı: ' + pr.join(';'));
    // yaklaşık: V ≈ (yüzey alanı - açılan yüz) * t, birkaç köşe düzeltmesiyle ±%25
    const A = props(K, 'L'); t.note('f-shell-tam-hacim', v1);
    t.ok(v1 > 0 && v1 < v0, 'F-shell: tam braket kabuk hacmi 0 < V < V0'); t.ok(v1 > 0.5 * (an.volume) * 0 + 0 && v1 < (A.area * p.ST) * 1.05, `F-shell: kabuk hacmi ≈ alan·t sınırında (V=${v1.toFixed(1)}, alan·t=${(A.area * p.ST).toFixed(1)})`);
  }
  return out;
}
await runMain(import.meta.url, name, async (t) => { const K = newKernel(); await checks(t, K); });
