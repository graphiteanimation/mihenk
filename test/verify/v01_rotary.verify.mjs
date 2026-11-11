// V-01 / V-02: 3+1 A ekseni. Cekirdegin etkin cercevesi (resolveSetup) ile postun yazdigi A kelimesinin FIZIKSEL
// sonucu ayni yonelimi mi veriyor? Hakem: sag el kurali, A pozitif = machine.axes.A.dir etrafinda pozitif donus.
// Fiziksel: parca noktasi p (orijin eksen uzerinde) tezgah koordinatinda Rot(dir, Akelimesi)·(p-o) olur. Takim yolu
// koordinatlari (setup uzayi) bununla ayni olmali; degilse yol aynalanmis/yanlis yuzde.
// Calistir: node test/verify/v01_rotary.verify.mjs
import * as CAM from '../../src/cam/index.js';
import { postProgram } from '../../src/cam/post/index.js';
import { mk } from '../../src/cam/ir.js';
import { machineM80V, reporter } from './ctx.mjs';

const rep = reporter('v01_rotary');
const boxVerts = (a, b) => { const v = []; for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) v.push(x, y, z); return new Float32Array(v); };
const rb = { bodies: [{ id: 'b', vertices: boxVerts([-40, -10, -10], [40, 10, 10]) }] };
const rot = (u, deg) => { const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), [x, y, z] = u; return [[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s], [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s], [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]]; };
const mul = (M, p) => M.map((row) => row[0] * p[0] + row[1] * p[1] + row[2] * p[2]);

function run(dirX, aAngle) {
  const M = machineM80V(); M.axes.A.dir = [dirX, 0, 0];
  const setup = { id: 'r', name: 'R', bodies: ['b'], frame: { origin: { kind: 'model' } }, stock: { kind: 'cyl', dia: 40, len: 100, axis: 'X' }, workOffset: { kind: 'G55' }, clearanceZ: 5, rotary: { enabled: true, aAngle } };
  const S = CAM.resolveSetup(setup, rb, M);
  const p = [0, 5, 3]; const q = [0, 1, 2].map((k) => (p[0] - S.frame.o[0]) * S.frame[['x', 'y', 'z'][k]][0] + (p[1] - S.frame.o[1]) * S.frame[['x', 'y', 'z'][k]][1] + (p[2] - S.frame.o[2]) * S.frame[['x', 'y', 'z'][k]][2]);
  const tp = mk.toolpath({ tool: { number: 5, H: 5, D: null, type: 'flat', dia: 6, cornerR: 0, tipAngle: null, fluteLen: 20, bodyLen: 40, centerCutting: true, pitch: null }, rpm: 5000, coolant: 'off', clearanceZ: 30, moves: [mk.rapid(0, 0, 30), mk.feed(0, 0, 25, 100, 'plunge'), mk.rapid(0, 0, 30)] });
  const prog = { name: 'R', number: 1, machine: null, units: 'mm', sections: [{ setup: { id: 'r', name: 'R', workOffset: { kind: 'G55' }, aAngle, stockBox: S.stockBox }, toolpath: tp }] };
  const nc = postProgram(prog, M, { date: '2026-11-11' }).text;
  const aw = [...nc.matchAll(/G0 A(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const aFinal = aw.length ? aw[aw.findIndex((x, i) => i === aw.length - 2) >= 0 ? aw.length - 2 : 0] : 0; // son A0 donusu haric
  const aCmd = aw.length >= 2 ? aw[aw.length - 2] : aw[0];
  const phys = mul(rot([dirX, 0, 0], aCmd), p);
  const err = Math.hypot(phys[0] - q[0], phys[1] - q[1], phys[2] - q[2]);
  void aFinal;
  return { q, phys, aCmd, err, nc };
}
for (const [dx, a] of [[1, 90], [1, 30], [-1, 90], [-1, 30], [-1, 270]]) {
  const r = run(dx, a);
  rep.finding(dx < 0 ? 'V-01' : 'V-01-kontrol', r.err > 1e-6, `A.dir=[${dx},0,0] aAngle=${a}: NC A=${r.aCmd}; setup koord. ${r.q.map((v) => v.toFixed(3))} <-> fiziksel ${r.phys.map((v) => v.toFixed(3))} (fark ${r.err.toFixed(3)} mm)`);
}

// V-02: rotary.enabled + aAngle=0 olan ILK bolum: A0 yazilmiyor (post A'nin 0'da oldugunu varsayar)
{
  const M = machineM80V();
  const setup = { id: 'r', name: 'R', bodies: ['b'], frame: { origin: { kind: 'model' } }, stock: { kind: 'cyl', dia: 40, len: 100, axis: 'X' }, workOffset: { kind: 'G55' }, clearanceZ: 5, rotary: { enabled: true, aAngle: 0 } };
  const S = CAM.resolveSetup(setup, rb, M);
  const tp = mk.toolpath({ tool: { number: 5, H: 5, D: null, type: 'flat', dia: 6, cornerR: 0, tipAngle: null, fluteLen: 20, bodyLen: 40, centerCutting: true, pitch: null }, rpm: 5000, coolant: 'off', clearanceZ: 30, moves: [mk.rapid(0, 0, 30), mk.feed(0, 0, 25, 100, 'plunge'), mk.rapid(0, 0, 30)] });
  const prog = { name: 'R', number: 1, machine: null, units: 'mm', sections: [{ setup: { id: 'r', name: 'R', workOffset: { kind: 'G55' }, aAngle: 0, stockBox: S.stockBox }, toolpath: tp }] };
  const nc = postProgram(prog, M, { date: '2026-11-11' }).text;
  const firstCut = nc.split('\n').findIndex((l) => /G1|G0 G90/.test(l)); const aIdx = nc.split('\n').findIndex((l) => /\bA-?[\d.]/.test(l) && !l.startsWith('('));
  rep.finding('V-02', aIdx < 0 || aIdx > firstCut, `3+1 setup aAngle=0 ilk bolum: ilk konumlanmadan once A kelimesi ${aIdx < 0 ? 'HIC yok' : 'satir ' + (aIdx + 1)} (tezgah A'si onceki isten 90'da kaldiysa parca yanlis acida islenir)`);
}
rep.done();
