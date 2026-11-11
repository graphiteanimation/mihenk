// V-26..: setup cercevesi (WCS) donusumleri: 24 taban eksen birlesimi sag elli mi, orijin dogru mu, model noktalari
// setup uzayinda beklenen yerde mi, delik ekseni (-Z) suzgeci ve delik konumu ayni cerceveyle mi.
// Calistir: node test/verify/v09_frames.verify.mjs
import * as CAM from '../../src/cam/index.js';
import { collectHoles } from '../../src/cam/ops/drill.js';
import { reporter } from './ctx.mjs';
const rep = reporter('v09_frames');
const AX = { '+X': [1, 0, 0], '-X': [-1, 0, 0], '+Y': [0, 1, 0], '-Y': [0, -1, 0], '+Z': [0, 0, 1], '-Z': [0, 0, -1] };
const boxVerts = (a, b) => { const v = []; for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) v.push(x, y, z); return new Float32Array(v); };
const rb = { bodies: [{ id: 'b', vertices: boxVerts([0, 0, 0], [100, 60, 20]) }] };
const det = (a, b, c) => a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
const q = (F, p) => ['x', 'y', 'z'].map((k) => (p[0] - F.o[0]) * F[k][0] + (p[1] - F.o[1]) * F[k][1] + (p[2] - F.o[2]) * F[k][2]);
let bad = 0, n = 0; const notes = [];
for (const zk of Object.keys(AX)) for (const xk of Object.keys(AX)) {
  if (Math.abs(AX[zk].reduce((s, v, i) => s + v * AX[xk][i], 0)) > 0) continue;
  n++;
  const S = CAM.resolveSetup({ id: 's', bodies: ['b'], frame: { zAxis: { kind: 'base', dir: zk }, xAxis: { kind: 'base', dir: xk }, origin: { kind: 'stockCorner', corner: 'x-y-z+' } }, stock: { kind: 'boxOffset', side: 2, top: 1, bottom: 0 }, workOffset: { kind: 'G55' }, clearanceZ: 5 }, rb, null);
  const F = S.frame; const d = det(F.x, F.y, F.z);
  // model kosesinin setup koordinati: stok kosesi (x-y-z+) = orijin; tum model noktalari x>=2-, y>=2-, z<=-1 olmali
  const pts = []; for (let i = 0; i < 8; i++) pts.push(q(F, [i & 1 ? 100 : 0, i & 2 ? 60 : 0, i & 4 ? 20 : 0]));
  const okBox = pts.every((p) => p[0] >= 2 - 1e-9 && p[1] >= 2 - 1e-9 && p[2] <= -1 + 1e-9) && Math.abs(Math.max(...pts.map((p) => p[2])) + 1) < 1e-9;
  const okBB = S.modelBBox.max[2] < S.stockBox.max[2] && Math.abs(S.stockBox.max[2]) < 1e-9 && Math.abs(S.stockBox.min[0]) < 1e-9;
  // delik: model +Z'den -Z'ye; yalniz zAxis=+Z setup'ta listelenmeli
  const holes = [{ feature: 'h', dia: 5, depth: 5, through: false, tipAngle: 118, positions: [[50, 30, 20]], dirs: [[0, 0, -1]] }];
  const { holes: hs, skipped } = collectHoles({ holes: { kind: 'feature' } }, S, { holes });
  const okHole = zk === '+Z' ? hs.length === 1 && Math.abs(hs[0].top - q(F, [50, 30, 20])[2]) < 1e-9 : hs.length === 0 && skipped === 1;
  if (Math.abs(d - 1) > 1e-9 || !okBox || !okBB || !okHole) { bad++; notes.push(`${zk}/${xk}: det ${d.toFixed(3)} kutu ${okBox} bb ${okBB} delik ${okHole}`); }
}
rep.finding('V-26', bad > 0, `${n} eksen birlesimi; sorunlu ${bad}${notes.length ? ': ' + notes.slice(0, 4).join(' ; ') : ''}`);
rep.done();
