// Elle kurulmus IR ornekleri (A ajanindan bagimsiz). Tum degerler TEST degeridir; makine gerceginin kaniti degildir.
import { mk } from '../../src/cam/ir.js';

// Test makine profili: "M80V + A ekseni" bicimi; sayilar test icindir. clamp.output true: M10/M11 sirasini sinamak icin.
export function testMachine(over = {}) {
  const m = {
    id: 'test-m80v', name: 'TEST M80V + A', rev: 1, control: 'mitsubishi-m80v',
    axes: { X: { travel: 1000 }, Y: { travel: 600 }, Z: { travel: 600 }, A: { kind: 'rotary', about: 'X', dir: [-1, 0, 0], limits: null, shortest: true, rapid: 4000, feedMax: 2000, clamp: { lock: 'M10', unlock: 'M11', output: true } } },
    spindle: { maxRpm: null, minRpm: null }, feed: { maxCut: null, rapid: null }, toolChange: { maxTools: 25, kind: 'random' },
    protected: { T: [], H: [], D: [], wcs: [] },
    post: { props: { safeRetract: 'G28', dwellAddress: 'P', dwellUnit: 'ms', cycleDwellAddress: 'P', cycleDwellUnit: 'ms', g541Range: [1, 48] } },
  };
  return { ...m, ...over, post: { props: { ...m.post.props, ...(over.props || {}) } } };
}
export function fanucMachine(over = {}) {
  return { id: 'test-fanuc', name: 'TEST Fanuc 3 eksen', rev: 1, control: 'fanuc-generic', axes: { X: { travel: 500 }, Y: { travel: 400 }, Z: { travel: 400 } }, post: { props: { ...(over.props || {}) } } };
}

const T = (number, type, dia, extra = {}) => ({ number, H: number, D: number, type, dia, cornerR: 0, tipAngle: null, fluteLen: 20, bodyLen: 40, centerCutting: true, pitch: null, ...extra });
export const TOOLS = {
  face50: T(1 + 20, 'face', 50, { fluteLen: 6, bodyLen: 30 }),
  flat6: T(2, 'flat', 6, { fluteLen: 15, bodyLen: 40, shaftDia: 6, holder: { dia: 40, len: 50 } }),
  flat10: T(4, 'flat', 10, { fluteLen: 20, bodyLen: 45, shaftDia: 10, holder: { dia: 40, len: 50 } }),
  spot8: T(6, 'spot', 8, { tipAngle: 90, fluteLen: 8, bodyLen: 35 }),
  drill6: T(7, 'drill', 6, { tipAngle: 118, fluteLen: 30, bodyLen: 50 }),
  tapM8: T(8, 'tap', 8, { pitch: 1.25, fluteLen: 20, bodyLen: 40 }),
  ball6: T(9, 'ball', 6, { fluteLen: 12, bodyLen: 40 }),
};

const WCS = (kind = 'G55', p) => (p ? { kind, p } : { kind });
const setup = (id, wcs, aAngle = null, name = id) => ({ id, name, workOffset: wcs, aAngle });

// 1. Yuzey frezeleme (zikzak). Stok ust Z=0.5 -> Z=0.
export function surfaceSample() {
  const clr = 10, f = 800;
  const moves = [mk.rapid(-60, -20, clr), mk.rapid(-60, -20, 2), mk.feed(-60, -20, 0, 300, 'plunge')];
  let dir = 1;
  for (const y of [-20, 20]) {
    if (y !== -20) moves.push(mk.feed(dir > 0 ? -60 : 60, y, 0, f, 'cut'));
    const xe = dir > 0 ? 60 : -60;
    moves.push(mk.feed(xe, y, 0, f, 'cut'));
    dir = -dir;
  }
  moves.push(mk.rapid(dir > 0 ? -60 : 60, 20, clr));
  const tp = mk.toolpath({ opId: 'face1', opName: 'Yuzey', opType: 'face', tool: TOOLS.face50, rpm: 2500, spindleDir: 'cw', coolant: 'flood', clearanceZ: clr, retractZ: 2, moves });
  return {
    name: 'surface', program: mk.program({ name: 'SURFACE', number: 101, machine: 'test-m80v', sections: [mk.section(setup('s1', WCS('G55')), tp)] }),
    stockBox: { min: [-80, -40, -20], max: [80, 40, 0.5] },
  };
}

// 2. Kontur + wear telafisi (G41, D); 2 pas; koseler yay
export function contourWearSample() {
  const clr = 10, f = 400;
  const pass = (z) => [
    mk.rapid(-30, 0, clr), mk.rapid(-30, 0, 2), mk.feed(-30, 0, z, 150, 'plunge'),
    mk.comp(true), mk.feed(-20, 0, z, f, 'lead'),
    mk.feed(-20, 15, z, f), mk.arc(-15, 20, z, 5, 0, 'cw', f),
    mk.feed(15, 20, z, f), mk.arc(20, 15, z, 0, -5, 'cw', f),
    mk.feed(20, -15, z, f), mk.arc(15, -20, z, -5, 0, 'cw', f),
    mk.feed(-15, -20, z, f), mk.arc(-20, -15, z, 0, 5, 'cw', f),
    mk.feed(-20, 0, z, f),
    mk.comp(false), mk.feed(-30, 0, z, f, 'lead'),
  ];
  const moves = [...pass(-3), ...pass(-6), mk.rapid(-30, 0, clr)];
  const tp = mk.toolpath({ opId: 'cont1', opName: 'Kontur D10', opType: 'contour', tool: TOOLS.flat10, rpm: 4000, spindleDir: 'cw', coolant: 'flood', comp: 'wear', compSide: 'left', clearanceZ: clr, retractZ: 2, moves });
  return {
    name: 'contour_wear', program: mk.program({ name: 'CONTOUR WEAR', number: 102, machine: 'test-m80v', sections: [mk.section(setup('s1', WCS('G54.1', 3)), tp)] }),
    stockBox: { min: [-34, -34, -10], max: [34, 34, 0] },
  };
}

// 3. 20x20x5 cep, helis giris, 2 derinlik. Takim D6 (kose yaricapi 3 -> kalan hacim analitik)
export function pocketHelixSample() {
  const clr = 10, f = 600, fz = 250, Rh = 2;
  const sq = (h, z) => [mk.feed(h, -h, z, f), mk.feed(h, h, z, f), mk.feed(-h, h, z, f), mk.feed(-h, -h, z, f)];
  const moves = [mk.rapid(Rh, 0, clr), mk.rapid(Rh, 0, 1)];
  // seviye 1: iki devir helis, her yarim yayda 0.625 inis (toplam -2.5)
  let z = 0;
  for (let k = 0; k < 4; k++) {
    z -= 0.625;
    if (k % 2 === 0) moves.push(mk.arc(-Rh, 0, z, -Rh, 0, 'ccw', fz, 'ramp'));
    else moves.push(mk.arc(Rh, 0, z, Rh, 0, 'ccw', fz, 'ramp'));
  }
  // dipte tam daire (iki yarim yay), sonra halkalar ice -> disa
  moves.push(mk.arc(-Rh, 0, -2.5, -Rh, 0, 'ccw', f), mk.arc(Rh, 0, -2.5, Rh, 0, 'ccw', f));
  for (const h of [1, 4, 7]) { moves.push(mk.feed(-h, -h, -2.5, f)); moves.push(...sq(h, -2.5).slice(0)); }
  moves.push(mk.rapid(0, 0, 1)); // hizli: temizlenmis cep icinde yukari
  moves.push(mk.rapid(0, 0, -2));
  moves.push(mk.feed(0, 0, -5, fz, 'plunge'));
  for (const h of [1, 4, 7]) { moves.push(mk.feed(-h, -h, -5, f)); moves.push(...sq(h, -5)); }
  moves.push(mk.rapid(-7, -7, 1), mk.rapid(-7, -7, clr));
  const tp = mk.toolpath({ opId: 'pkt1', opName: 'Cep 20x20', opType: 'pocket', tool: TOOLS.flat6, rpm: 6000, spindleDir: 'cw', coolant: 'flood', clearanceZ: clr, retractZ: 2, moves });
  return {
    name: 'pocket_helix', program: mk.program({ name: 'POCKET HELIX', number: 103, machine: 'test-m80v', sections: [mk.section(setup('s1', WCS('G56')), tp)] }),
    stockBox: { min: [-25, -25, -10], max: [25, 25, 0] }, expectedVolume: 5 * (400 - (4 - Math.PI) * 9),
  };
}

// 4. Delik cevrimleri: spot (G82), gagalama (G83, G99 ara), talas kirma (G73), delme (G81), rayba (G85), bore (G89), kilavuz (G84), ayri bekleme
export function drillSample() {
  const clr = 20;
  const pts4 = [[-30, -15], [-10, -15], [10, -15], [30, -15]];
  const spot = mk.toolpath({ opId: 'spot', opName: 'Punta', opType: 'drill', tool: TOOLS.spot8, rpm: 3000, spindleDir: 'cw', coolant: 'flood', clearanceZ: clr, retractZ: 5, moves: [
    mk.rapid(-30, -15, clr),
    mk.cycle({ cycle: 'spot', points: pts4, top: 0, bottom: -2, retract: 5, clearance: clr, dwell: 0.5, f: 150 }),
    mk.rapid(0, 0, clr),
  ] });
  const drill = mk.toolpath({ opId: 'drl', opName: 'Delme', opType: 'drill', tool: TOOLS.drill6, rpm: 2500, spindleDir: 'cw', coolant: 'flood', clearanceZ: clr, retractZ: 5, moves: [
    mk.rapid(-30, 0, clr),
    mk.cycle({ cycle: 'peck', points: [[-30, 0], [-10, 0]], top: 0, bottom: -20, retract: 5, clearance: clr, peck: 4, f: 200 }),
    mk.cycle({ cycle: 'chipbreak', points: [[10, 0], [30, 0]], top: 0, bottom: -18, retract: 2, clearance: clr, peck: 3, f: 200 }),
    mk.cycle({ cycle: 'drill', points: [[-30, 15]], top: 0, bottom: -10, retract: clr, clearance: clr, f: 220 }),
    mk.cycle({ cycle: 'ream', points: [[-10, 15]], top: 0, bottom: -10, retract: 2, clearance: clr, f: 100 }),
    mk.cycle({ cycle: 'bore', points: [[10, 15]], top: 0, bottom: -10, retract: 2, clearance: clr, dwell: 0.3, f: 100 }),
    mk.dwell(1.5),
    mk.rapid(10, 15, clr),
  ] });
  const tap = mk.toolpath({ opId: 'tap', opName: 'Kilavuz M8', opType: 'drill', tool: TOOLS.tapM8, rpm: 400, spindleDir: 'cw', coolant: 'flood', clearanceZ: clr, retractZ: 5, moves: [
    mk.rapid(30, 15, clr),
    mk.cycle({ cycle: 'tap', points: [[30, 15], [30, -15]], top: 0, bottom: -15, retract: 5, clearance: clr, pitch: 1.25, f: 500 }),
    mk.rapid(0, 0, clr),
  ] });
  return {
    name: 'drill_cycles', program: mk.program({ name: 'DRILL CYCLES', number: 104, machine: 'test-m80v', sections: [
      mk.section(setup('s1', WCS('G54')), spot), mk.section(setup('s1', WCS('G54')), drill), mk.section(setup('s1', WCS('G54')), tap)] }),
    stockBox: { min: [-40, -25, -25], max: [40, 25, 0] },
  };
}

// 5. 3+1: iki A acisi (0 -> 90 -> 270 [180 derece fark: iki adim] -> null=0)
export function indexedSample() {
  const clr = 30, f = 300;
  const slot = (x0, x1, z, id, tool) => mk.toolpath({ opId: id, opName: 'Kanal ' + id, opType: 'contour', tool, rpm: 5000, spindleDir: 'cw', coolant: 'off', clearanceZ: clr, retractZ: 5, moves: [
    mk.rapid(x0, 0, clr), mk.rapid(x0, 0, 3), mk.feed(x0, 0, z, 120, 'plunge'), mk.feed(x1, 0, z, f), mk.rapid(x1, 0, clr)] });
  const t = TOOLS.flat6;
  return {
    name: 'indexed_3plus1', program: mk.program({ name: 'INDEXED', number: 105, machine: 'test-m80v', sections: [
      mk.section(setup('a0', WCS('G58'), 0), slot(-10, 10, -2, 'a0', t)),
      mk.section(setup('a90', WCS('G58'), 90), slot(-10, 10, -2, 'a90', t)),
      mk.section(setup('a270', WCS('G58'), 270), slot(-10, 10, -2, 'a270', t)),
      mk.section(setup('flat', WCS('G55'), null), slot(-10, 10, -2, 'flat', t))] }),
    stockBox: { min: [-30, -20, -20], max: [30, 20, 0] },
  };
}

export const ALL = () => [surfaceSample(), contourWearSample(), pocketHelixSample(), drillSample(), indexedSample()];
