// CAM-VERIFY ortak baglam: elle kurulmus setup (resolveSetup ciktisi bicimi), takim, islem tabani, doldurulmus M80V
// makine kopyasi (null alanlar YALNIZ bu dogrulama icin dolduruldu; gercek makine degeri degildir).
import { builtinMachines, copyMachine } from '../../src/cam/machines/builtin.js';
import { NEWAY_FIXTURE } from '../fixtures/machine-neway.mjs';

export const S0 = (over = {}) => ({
  id: 's1', name: 'S1', bodies: ['b'], workOffset: { kind: 'G55' }, frame: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] },
  frame0: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, aAngle: null, stock: { kind: 'box' },
  stockBox: { min: [-20, -20, -30], max: [120, 120, 0] }, modelBBox: { min: [-15, -15, -30], max: [115, 115, -1] },
  clearance: 5, stockTop: 0, machinePos: null, ...over,
});
export const tool = (dia, extra = {}) => ({ id: 't' + dia, number: 5, lengthOffset: 5, diaOffset: 25, type: 'flat', dia, fluteLen: 30, bodyLen: 60, flutes: 3, centerCutting: true, ...extra });
export const base = { rpm: 8000, feedCut: 800, feedPlunge: 300, coolant: 'flood', heights: { clearance: 10, retract: 2 } };

// Neway fixture + dogrulama icin uydurma (TEST) degerler: maxRpm, maxCut, rapid, safeRetract G28, dwell P ms
export function machineM80V(over = {}) {
  const nw = structuredClone(NEWAY_FIXTURE); // K-026: yerlesik degil; kullanici profili ornegi
  const m = copyMachine(nw, 'verify-m80v', 'VERIFY M80V');
  m.spindle.maxRpm = 12000; m.feed.maxCut = 10000; m.feed.rapid = 30000;
  Object.assign(m.post.props, { safeRetract: 'G28', dwellAddress: 'P', dwellUnit: 'ms', cycleDwellAddress: 'P', cycleDwellUnit: 'ms' });
  return Object.assign(m, over);
}
export function machineGeneric() {
  const g = builtinMachines().find((m) => m.id === 'builtin-generic-3axis-fanuc');
  const m = copyMachine(g, 'verify-gen', 'VERIFY GEN');
  m.axes.X.travel = 1000; m.axes.Y.travel = 600; m.axes.Z.travel = 600; m.spindle.maxRpm = 12000; m.feed.maxCut = 10000; m.feed.rapid = 30000;
  return m;
}
export const section = (S, tp) => ({ setup: { id: S.id, name: S.name, workOffset: { ...S.workOffset }, aAngle: S.aAngle ?? null, stockBox: S.stockBox, machinePos: null }, toolpath: tp });
export const program = (sections, extra = {}) => ({ name: 'VERIFY', number: 1234, machine: null, units: 'mm', sections, ...extra });

// basit sonuc toplayici (her betik kendi bulgu satirlarini yazar)
export function reporter(name) {
  const rows = []; let fails = 0;
  return {
    finding(id, cond, msg) { rows.push({ id, hit: !!cond, msg }); if (cond) fails++; console.log(`${cond ? 'BULGU ' : 'temiz '} ${id}: ${msg}`); },
    info(msg) { console.log('  ' + msg); },
    done() { console.log(`\n${name}: ${fails} bulgu yeniden uretildi / ${rows.length} denetim`); return rows; },
  };
}
