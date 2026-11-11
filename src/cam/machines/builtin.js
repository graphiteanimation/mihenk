// Yerlesik makine profili sablonlari ve makine profili dogrulamasi (saf JS).
// Kural (CAM-DESIGN.md, K-017): makineye ozel HICBIR deger koda gomulmez; degerler bu sablonlardan gelir ve kullanici
// profili kopyalayip duzenler. Spesifikasyonun "Makine verisi" tablosunda OLMAYAN deger null birakilir; null alan
// post icin gerekiyorsa guvenlik kapisi 1 (cam.gate.missing) NC uretimini durdurur.
// Metin alanlari: name kullanici verisidir (cevrilmez); yerlesik sablonlar nameKey ile iki dilde gosterilir.
import { cerr, issue } from '../geom/err.js';

const WCS = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59', 'G54.1'];

// Neway VM1160H + Mitsubishi M80V + GSA CNC-200R (NC A ekseni). Kaynak: spesifikasyon "Makine verisi" tablosu (2026-11-06).
const NEWAY = {
  id: 'builtin-neway-vm1160h-m80v-gsa', name: 'Neway VM1160H · M80V · GSA A', nameKey: 'cam.machine.neway', rev: 1, builtin: true,
  control: 'mitsubishi-m80v',
  axes: {
    X: { travel: 1000, min: null, max: null }, Y: { travel: 600, min: null, max: null }, Z: { travel: 600, min: null, max: null },
    // A: X'e paralel, sinirsiz, #8213=1 kisa yol; hizli 4000 deg/dk, kesme 2000 deg/dk; donme ekseni [-1,0,0]; fren PLC otomatik
    A: { kind: 'rotary', about: 'X', dir: [-1, 0, 0], limits: null, shortest: true, rapid: 4000, feedMax: 2000, centerHeight: 160, clamp: { lock: 'M10', unlock: 'M11', output: false } },
  },
  spindle: { maxRpm: null, minRpm: null },
  feed: { maxCut: null, rapid: null },
  // rastgele takim yonetimi; 24 cep dolu, T1-T25 kayitli (magazin kapasitesi tabloda yok)
  toolChange: { maxTools: null, kind: 'random', pos: null },
  // Korunan: G54, G56, T1/T3/T12, H1/H3/H12; 4. eksen isi G58; D1/D3/D12 on dolu. Makine projesinden teyit edilmeli.
  protected: { T: [1, 3, 12], H: [1, 3, 12], D: [1, 3, 12], wcs: ['G54', 'G56', 'G58'], noteKey: 'cam.machine.protected_confirm' },
  table: { x: 1200, y: 600 },
  post: { props: {
    tapMode: 'g84-sync-f-pitch',  // G84 senkron (#8159=1), F = adim, M29 gerekmez
    highSpeedOn: 'G05 P10000', highSpeedOff: 'G05 P0', highSpeed: false,
    compType: 'II',               // geometri ve asinma ayri
    aClampOutput: false,          // M10/M11 PLC otomatik
    dwellAddress: null, dwellUnit: null,
  } },
};
// Genel 3 eksen (Fanuc tarzi): yalniz yapi; tum sayisal degerler kullanici tarafindan girilmeli.
const GENERIC = {
  id: 'builtin-generic-3axis-fanuc', name: 'Generic 3-axis (Fanuc style)', nameKey: 'cam.machine.generic3', rev: 1, builtin: true,
  control: 'fanuc-generic',
  axes: { X: { travel: null, min: null, max: null }, Y: { travel: null, min: null, max: null }, Z: { travel: null, min: null, max: null } },
  spindle: { maxRpm: null, minRpm: null }, feed: { maxCut: null, rapid: null },
  toolChange: { maxTools: null, kind: 'fixed', pos: null },
  protected: { T: [], H: [], D: [], wcs: [] },
  post: { props: { dwellAddress: null, dwellUnit: null } },
};

const clone = (x) => JSON.parse(JSON.stringify(x));
export const BUILTIN_MACHINES = Object.freeze([NEWAY, GENERIC].map((m) => Object.freeze(clone(m))));
export const builtinMachines = () => BUILTIN_MACHINES.map(clone);
export function machineById(list, id) { return (list || []).find((m) => m && m.id === id) || null; }
// Kopya: yeni kimlik, builtin bayragi yok (kullanici profili)
export function copyMachine(m, newId, newName) { const c = clone(m); c.id = newId; if (newName != null) c.name = newName; delete c.builtin; c.rev = 1; return c; }

// ------------------------------------------------------------------ dogrulama
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPosInt = (v) => Number.isInteger(v) && v >= 1;
// Donus: { errors:[{code, params}], missing:[yol] }. errors: yapi hatasi (profil kullanilamaz).
// missing: post/kapilar icin gerekli ama null alanlar (kapi 1 bunlari engeller).
export function checkMachine(m) {
  const errors = [], missing = [];
  const bad = (path, expect) => errors.push(issue('cam.machine.bad_field', { path, expect }));
  const nn = (v, path, { pos = true, allowNull = true } = {}) => { if (v === null || v === undefined) { if (!allowNull) bad(path, 'number'); return false; } if (!isNum(v) || (pos && v <= 0)) { bad(path, 'number'); return false; } return true; };
  if (!m || typeof m !== 'object' || Array.isArray(m)) { bad('machine', 'object'); return { errors, missing }; }
  if (typeof m.id !== 'string' || !m.id || m.id.length > 200) bad('id', 'text');
  if (typeof m.name !== 'string' || m.name.length > 200) bad('name', 'text');
  if (typeof m.control !== 'string' || !/^[a-z0-9-]{1,64}$/.test(m.control)) bad('control', 'post id');
  const ax = m.axes;
  if (!ax || typeof ax !== 'object') bad('axes', 'object');
  else {
    for (const k of ['X', 'Y', 'Z']) {
      const a = ax[k]; if (!a || typeof a !== 'object') { bad('axes.' + k, 'object'); continue; }
      const hasMM = isNum(a.min) && isNum(a.max);
      if (a.min != null && !isNum(a.min)) bad(`axes.${k}.min`, 'number');
      if (a.max != null && !isNum(a.max)) bad(`axes.${k}.max`, 'number');
      if (hasMM && !(a.max > a.min)) bad(`axes.${k}.max`, '> min');
      if (a.travel != null) nn(a.travel, `axes.${k}.travel`);
      if (!hasMM && !isNum(a.travel)) missing.push(`axes.${k}.travel`);
    }
    for (const k of ['A', 'B', 'C']) {
      const a = ax[k]; if (a == null) continue;
      if (typeof a !== 'object' || a.kind !== 'rotary') { bad(`axes.${k}.kind`, 'rotary'); continue; }
      if (!['X', 'Y', 'Z'].includes(a.about)) bad(`axes.${k}.about`, 'X/Y/Z');
      if (!Array.isArray(a.dir) || a.dir.length !== 3 || !a.dir.every(isNum) || Math.abs(Math.hypot(...a.dir) - 1) > 1e-9) bad(`axes.${k}.dir`, 'unit vector');
      else { const idx = { X: 0, Y: 1, Z: 2 }[a.about]; if (idx !== undefined && Math.abs(Math.abs(a.dir[idx]) - 1) > 1e-9) bad(`axes.${k}.dir`, 'parallel to ' + a.about); }
      if (a.limits !== null && a.limits !== undefined && !(Array.isArray(a.limits) && a.limits.length === 2 && a.limits.every(isNum) && a.limits[1] > a.limits[0])) bad(`axes.${k}.limits`, 'null or [min,max]');
      if (a.shortest !== undefined && typeof a.shortest !== 'boolean') bad(`axes.${k}.shortest`, 'boolean');
      nn(a.rapid, `axes.${k}.rapid`); nn(a.feedMax, `axes.${k}.feedMax`);
      if (a.clamp != null && (typeof a.clamp !== 'object' || typeof a.clamp.output !== 'boolean')) bad(`axes.${k}.clamp`, 'object');
      if (a.clamp?.output && (typeof a.clamp.lock !== 'string' || typeof a.clamp.unlock !== 'string')) bad(`axes.${k}.clamp`, 'lock/unlock');
    }
  }
  const sp = m.spindle; if (!sp || typeof sp !== 'object') bad('spindle', 'object'); else {
    if (nn(sp.maxRpm, 'spindle.maxRpm') === false && sp.maxRpm == null) missing.push('spindle.maxRpm');
    nn(sp.minRpm, 'spindle.minRpm');
    if (isNum(sp.minRpm) && isNum(sp.maxRpm) && sp.minRpm > sp.maxRpm) bad('spindle.minRpm', '<= maxRpm');
  }
  const fd = m.feed; if (!fd || typeof fd !== 'object') bad('feed', 'object'); else {
    if (nn(fd.maxCut, 'feed.maxCut') === false && fd.maxCut == null) missing.push('feed.maxCut');
    nn(fd.rapid, 'feed.rapid');
  }
  const tc = m.toolChange; if (!tc || typeof tc !== 'object') bad('toolChange', 'object'); else {
    if (tc.maxTools != null && !isPosInt(tc.maxTools)) bad('toolChange.maxTools', 'integer');
    if (!['random', 'fixed'].includes(tc.kind)) bad('toolChange.kind', 'random/fixed');
  }
  const pr = m.protected; if (!pr || typeof pr !== 'object') bad('protected', 'object'); else {
    for (const k of ['T', 'H', 'D']) if (!Array.isArray(pr[k]) || !pr[k].every(isPosInt)) bad('protected.' + k, 'integer list');
    if (!Array.isArray(pr.wcs) || !pr.wcs.every((w) => typeof w === 'string' && (WCS.includes(w) || /^G54\.1 ?P\d+$/.test(w)))) bad('protected.wcs', 'G54..G59/G54.1 Pn');
  }
  if (m.post !== undefined && (typeof m.post !== 'object' || m.post === null || (m.post.props !== undefined && (typeof m.post.props !== 'object' || m.post.props === null)))) bad('post', 'object');
  return { errors, missing };
}
export function assertMachine(m) { const r = checkMachine(m); if (r.errors.length) throw cerr(r.errors[0].code, r.errors[0].params); return r; }
// eksen kursu (mm) ya da null
export function axisTravel(m, k) { const a = m?.axes?.[k]; if (!a) return null; if (isNum(a.min) && isNum(a.max)) return a.max - a.min; return isNum(a.travel) ? a.travel : null; }
