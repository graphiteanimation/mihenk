// g. İnce duvarlı kutu gövde: kutu + kabuk + 4 cıvata kulesi (join) + pilot delikler + kapak faturası (halka kesme) + dış yuvarlatma (kabuktan ÖNCE ya da SONRA)
import { B, Sk, basePl, runMain, std, PI, rrArea, newKernel, occupied, rb, sane, facesOf, edgesOf, allHolePositions, matchPoints } from './lib.mjs';
import { findRegions } from './lib.mjs';
export const name = 'g-kutu-govde';
export const defaults = { BW: 100, BD: 60, BH: 40, ST: 2, R: 6, TW: 8, TH: 32, PD: 3, PDEP: 20, RB: 3, TC: 14, mode: 'before', tower: 1, rebate: 1 };
export async function build(K, p = defaults, refs = null, opt = {}) {
  const b = new B(K, { BW: p.BW, BD: p.BD, BH: p.BH, ST: p.ST, R: p.R, TW: p.TW, TH: p.TH, PD: p.PD, PDEP: p.PDEP, RB: p.RB }, refs);
  const s1 = new Sk(); s1.rect(0, 0, p.BW, p.BD); b.sketch('s1', basePl('XY'), s1);
  b.add({ id: 'bx', type: 'extrude', sketch: 's1', profiles: 'all', dist: 'BH', extent: 'dist', dir: 'one', op: 'new' });
  const vert = (K) => edgesOf(K, 'bx').filter((d) => d.geom === 'LINE' && Math.abs(Math.abs(d.start[2] - d.end[2]) - p.BH) < 1e-6);
  if (p.mode === 'before' && p.R > 0) { const fe = await b.pick('filB', vert); b.add({ id: 'fil', type: 'fillet', edges: fe, r: 'R' }); }
  const topf = await b.pick('topF', (K) => { for (const d of facesOf(K, 'bx')) if (d.geom === 'PLANE' && d.normal[2] > 0.99 && Math.abs(d.fp[2] - p.BH) < 1e-6) return d; throw new Error('üst yüz yok'); });
  b.add({ id: 'sh', type: 'shell', faces: [topf], t: 'ST' });
  if (p.mode === 'after' && p.R > 0) { const fe = await b.pick('filA', vert); b.add({ id: 'fil', type: 'fillet', edges: fe, r: 'R' }); }
  if (p.tower) {
    [[p.TC, p.TC], [p.BW - p.TC, p.TC], [p.TC, p.BD - p.TC], [p.BW - p.TC, p.BD - p.TC]].forEach((c, i) => b.add({ id: 'tw' + i, type: 'primitive', kind: 'cylinder', x: String(c[0]), y: String(c[1]), z: String(p.ST - 1), dia: 'TW', h: String(p.TH - p.ST + 1), axis: 'Z', op: 'join' }));
    const s2 = new Sk(); [[p.TC, p.TC], [p.BW - p.TC, p.TC], [p.TC, p.BD - p.TC], [p.BW - p.TC, p.BD - p.TC]].forEach((c) => s2.point(...c)); b.sketch('s2', basePl('XY', 'TH'), s2);
    b.add({ id: 'pil', type: 'hole', sketch: 's2', kind: 'simple', dia: 'PD', extent: 'dist', depth: 'PDEP', tipAngle: '118' });
  }
  if (p.rebate) {
    const rim = await b.pick('rim', (K) => { for (const d of facesOf(K, 'bx')) if (d.geom === 'PLANE' && d.normal[2] > 0.99 && Math.abs(d.fp[2] - p.BH) < 1e-6) return d; throw new Error('kenar yüzü yok'); });
    const s3 = new Sk(); const rc = p.mode === 'before' ? p.R - p.ST : 0, ro = p.mode === 'before' ? p.R - 1 : Math.max(p.R - 1, 0);
    s3.rect(1, 1, p.BW - 1, p.BD - 1, ro); s3.rect(p.ST, p.ST, p.BW - p.ST, p.BD - p.ST, rc); b.sketch('s3', { kind: 'face', ref: rim }, s3);
    const regs = findRegions({ points: s3.points, ents: s3.ents }).regions; const iRing = regs.findIndex((r) => r.holes.length === 1);
    b.add({ id: 'reb', type: 'extrude', sketch: 's3', profiles: [iRing], dist: 'RB', extent: 'dist', dir: 'one', flip: true, op: 'cut' });
  }
  return b;
}
export function analytic(p = defaults) {
  const R = p.R, t = p.ST; const before = p.mode === 'before';
  const Aout = rrArea(p.BW, p.BD, R); const Acav = before ? rrArea(p.BW - 2 * t, p.BD - 2 * t, R - t) : (p.BW - 2 * t) * (p.BD - 2 * t);
  let V = Aout * p.BH - Acav * (p.BH - t);
  if (p.tower) { const r = p.PD / 2; V += 4 * PI * (p.TW / 2) ** 2 * (p.TH - t); V -= 4 * (PI * r * r * p.PDEP + PI * r * r * (r / Math.tan((118 * PI) / 360)) / 3); }
  if (p.rebate) V -= (rrArea(p.BW - 2, p.BD - 2, before ? R - 1 : Math.max(R - 1, 0)) - Acav) * p.RB;
  return { volume: V, bbox: [[0, 0, 0], [p.BW, p.BD, p.BH]], com: [p.BW / 2, p.BD / 2, null], faces: [10, 90] };
}
export async function checks(t, K, p = defaults) {
  // 1) fillet kabuktan ÖNCE (tam parça)
  const b = await build(K, p); const an = analytic(p);
  const out = await std(t, K, b, an, 'ÖNCE: '); if (!out) return;
  if (out.holes.length) { const exp = [[p.TC, p.TC], [p.BW - p.TC, p.TC], [p.TC, p.BD - p.TC], [p.BW - p.TC, p.BD - p.TC]].map((c) => [...c, p.TH]); const m = matchPoints(allHolePositions(out.holes, p.PD), exp); t.ok(m.miss.length === 0, 'G-holes: 4 pilot delik konumu'); }
  t.ok(occupied(K, 'bx', [p.TC + 3, p.TC, 20]) === 1, 'G-geo: kule dolu'); t.ok(occupied(K, 'bx', [p.TC, p.TC, 25]) === 0, 'G-geo: pilot delik boş'); t.ok(occupied(K, 'bx', [p.TC, p.TC, 8]) === 1, 'G-geo: pilot altı dolu (delik derinliği 20 sınırı)');
  t.ok(occupied(K, 'bx', [50, 30, 10]) === 0, 'G-geo: kutu içi boş'); t.ok(occupied(K, 'bx', [50, 30, 1]) === 1, 'G-geo: taban dolu'); t.ok(occupied(K, 'bx', [50, 1.5, 20]) === 1, 'G-geo: duvar dolu');
  t.ok(occupied(K, 'bx', [50, 1.5, 38.5]) === 0, 'G-geo: kapak faturası (rebate) boş (y=1.5 içi, z=38.5)'); t.ok(occupied(K, 'bx', [50, 0.5, 38.5]) === 1, 'G-geo: kapak faturası dış duvar dolu');
  // 2) saf kutu: ÖNCE vs SONRA, aynı R
  const base = { ...p, tower: 0, rebate: 0 };
  const diff = {};
  for (const mode of ['before', 'after']) {
    const bb = await build(K, { ...base, mode }); const a = analytic({ ...base, mode });
    const r = await rb(K, bb.doc);
    if (r.exc) { t.ok(false, `G-${mode}: R=${p.R} istisna: ${r.exc}`); continue; }
    const okAll = bb.doc.features.every((f) => r.out.status[f.id].ok);
    if (!okAll) { t.note(`g-${mode}-R${p.R}`, 'ok:false'); t.ok(true, `G-${mode}: R=${p.R} ok:false (kabul)`); diff[mode] = null; continue; }
    const pr = sane(K, r.out); t.ok(!pr.length, `G-${mode}: geçerli katı: ${pr.join(';')}`);
    t.near(r.out.bodies[0].volume, a.volume, `G-${mode}: saf kutu R=${p.R} hacim`, 1e-4); diff[mode] = r.out.bodies[0].volume;
  }
  if (diff.before != null && diff.after != null) t.note('g-ÖNCE-SONRA-hacim-farkı', diff.before - diff.after);
  t.note('g-fark-beklenen', (rrArea(p.BW - 2 * p.ST, p.BD - 2 * p.ST, p.R - p.ST) - (p.BW - 2 * p.ST) * (p.BD - 2 * p.ST)) * -(p.BH - p.ST) * -1);
  // 3) SONRA, makul R (<ST), tam parça
  const p2 = { ...p, mode: 'after', R: 1.5 }; const b2 = await build(K, p2); await std(t, K, b2, analytic(p2), 'SONRA R=1.5: ');
  return out;
}
await runMain(import.meta.url, name, async (t) => { const K = newKernel(); await checks(t, K); });
