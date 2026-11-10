// d. Cepli ve adalı plaka: yaylı dış kontur, iç cep (ada + adanın içinde pim deliği = 3 seviye iç içe profil), cep dibi yuvarlatma, 4 köşe deliği (dikdörtgen desen)
import { B, Sk, basePl, runMain, std, PI, rrArea, allHolePositions, matchPoints, filletSection, newKernel, occupied, findRegions } from './lib.mjs';
export const name = 'd-cepli-adali-plaka';
export const defaults = { PW: 200, PH: 120, PT: 20, PR: 15, KW: 150, KH: 80, KR: 8, DEP: 12, ISL: 15, PIN: 4, FR: 2, HOLE: 8, HC: 15 };
export function pocketSketch(p) {
  const s = new Sk(); const cx = p.PW / 2, cy = p.PH / 2;
  s.rect(cx - p.KW / 2, cy - p.KH / 2, cx + p.KW / 2, cy + p.KH / 2, p.KR); s.circle(cx, cy, p.ISL); s.circle(cx, cy, p.PIN); return s;
}
export async function build(K, p = defaults, refs = null, opt = {}) {
  const b = new B(K, p, refs);
  const s1 = new Sk(); s1.rect(0, 0, p.PW, p.PH, p.PR); b.sketch('s1', basePl('XY'), s1);
  b.add({ id: 'pl', type: 'extrude', sketch: 's1', profiles: 'all', dist: 'PT', extent: 'dist', dir: 'one', op: 'new' });
  const s2 = pocketSketch(p); b.sketch('s2', basePl('XY', 'PT'), s2);
  const regs = findRegions({ points: s2.points, ents: s2.ents }).regions;
  const iPocket = regs.findIndex((r) => r.holes.length === 1 && r.area > 5000), iPin = regs.findIndex((r) => r.holes.length === 0 && Math.abs(r.area - PI * p.PIN ** 2) < 1);
  b.add({ id: 'pk', type: 'extrude', sketch: 's2', profiles: [iPocket, iPin], dist: 'DEP', extent: 'dist', dir: 'one', flip: true, op: 'cut' });
  const s3 = new Sk(); s3.point(p.HC, p.HC); b.sketch('s3', basePl('XY', 'PT'), s3);
  b.add({ id: 'hol', type: 'hole', sketch: 's3', kind: 'simple', dia: 'HOLE', extent: 'all', depth: '0' });
  b.add({ id: 'hp', type: 'pattern', kind: 'rect', source: { kind: 'feature', id: 'hol' }, count1: '2', step1: String(p.PW - 2 * p.HC), dir1: 'X', count2: '2', step2: String(p.PH - 2 * p.HC), dir2: 'Y' });
  if (opt.noFillet) return b;
  const fe = await b.pick('fil', (K) => { const E = []; const fz = p.PT - p.DEP; const n = K.last.bodies.get('pl').shape.edges.length; for (let i = 0; i < n; i++) { const d = K.describe({ body: 'pl', idx: i }, 'edge'); const onFloor = d.geom === 'LINE' ? Math.abs(d.start[2] - fz) < 1e-6 && Math.abs(d.end[2] - fz) < 1e-6 : d.geom === 'CIRCLE' && Math.abs(d.center[2] - fz) < 1e-6; if (onFloor && !(d.geom === 'CIRCLE' && Math.abs(d.radius - p.PIN) < 1e-6)) E.push(d); } return E; });
  b.add({ id: 'fil', type: 'fillet', edges: fe, r: 'FR' });
  return b;
}
export function analytic(p = defaults, opt = {}) {
  const nh = opt.nh ?? 4;
  const fs = filletSection(p.FR);
  const Apl = rrArea(p.PW, p.PH, p.PR), Apk = rrArea(p.KW, p.KH, p.KR);
  const cutA = Apk - PI * p.ISL ** 2 + PI * p.PIN ** 2;
  const Pout = 2 * (p.KW - 2 * p.KR) + 2 * (p.KH - 2 * p.KR) + 2 * PI * (p.KR - fs.cd), Pisl = 2 * PI * (p.ISL + fs.cd);
  const Vf = opt.noFillet ? 0 : fs.A * (Pout + Pisl); const fz = p.PT - p.DEP;
  const Vh = PI * (p.HOLE / 2) ** 2 * p.PT;
  const V = Apl * p.PT - cutA * p.DEP + Vf - nh * Vh;
  const Mz = Apl * p.PT * p.PT / 2 - cutA * p.DEP * (p.PT - p.DEP / 2) + Vf * (fz + fs.cd) - nh * Vh * p.PT / 2;
  return { volume: V, bbox: [[0, 0, 0], [p.PW, p.PH, p.PT]], com: [p.PW / 2, p.PH / 2, Mz / V], faces: [30, 45] };
}
export async function checks(t, K, p = defaults) {
  const b = await build(K, p); const an = analytic(p);
  const out = await std(t, K, b, an); if (!out) return;
  const exp = [[p.HC, p.HC], [p.PW - p.HC, p.HC], [p.HC, p.PH - p.HC], [p.PW - p.HC, p.PH - p.HC]].map((q) => [q[0], q[1], p.PT]);
  const m = matchPoints(allHolePositions(out.holes, p.HOLE), exp); t.ok(m.miss.length === 0, `D-holes: 4 köşe deliği konumunun tamamı holes[] içinde olmalı; eksik ${m.miss.length}/4`);
  const cx = p.PW / 2, cy = p.PH / 2;
  t.ok(occupied(K, 'pl', [cx + 40, cy, 15]) === 0, 'D-geo: cep içi boş'); t.ok(occupied(K, 'pl', [cx + 10, cy, 15]) === 1, 'D-geo: ada dolu');
  t.ok(occupied(K, 'pl', [cx + 1, cy, 15]) === 0, 'D-geo: pim deliği boş'); t.ok(occupied(K, 'pl', [cx + 1, cy, 7]) === 1, 'D-geo: pim tabanı dolu');
  t.ok(occupied(K, 'pl', [p.HC, p.HC, 10]) === 0, 'D-geo: köşe deliği boş'); t.ok(occupied(K, 'pl', [10, 60, 15]) === 1, 'D-geo: cep dışı kenar dolu');
  return out;
}
await runMain(import.meta.url, name, async (t) => { const K = newKernel(); await checks(t, K); });
