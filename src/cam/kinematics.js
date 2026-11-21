// WP-18 (K-029): genel kinematik zincir, takim ekseni ve 3+2 konumlu isleme (saf JS).
// Sozlesme (docs/CAM.md "Cok eksen"): tezgah profili doner eksenleri (axes.A/B/C) {kind:'rotary', about, dir, limits, on?, center?}
// tasir; `on` 'table' (varsayilan) | 'head'; `center` = eksen uzerinde bir nokta (makine koordinati, mm; null = bilinmiyor).
// Profil `kinematics` (istege bagli): { chain, order, prefer, tiltOutput }.
//   chain: 'table' (tek doner, tabla) | 'head' (tek doner, kafa) | 'table-table' | 'head-table' | 'head-head' | null (doner yok)
//   order: zincir sirasi; tablalar dis -> ic (tezgah gövdesinden parcaya), sonra kafalar dis -> ic (kolondan takima)
//   prefer: null | 'positive' | 'negative' (iki cozumde egme ekseninin isaret tercihi)
//   tiltOutput: 'plane' (egik duzlem cevrimi, G68.2 sinifi) | 'unwound' (acilmis: doner acilar + makine koordinatina cevrilmis XYZ)
// Eski profil (kinematics yok; A on/center yok) kayipsiz okunur: normalizeMachine eksik alanlari varsayilanla doldurur, eski alanlara dokunmaz.
// Koordinatlar: "tabla koordinati" = doner eksenler sifirdayken is koordinati (setup taban cercevesi F0). Aci derece.
// Doner donus kurali (mevcut 3+1 ile ayni, CAM-DESIGN): eksen `dir` etrafinda sag el kurali; tabla eksenleri parcayi, kafa eksenleri takimi dondurur.
import { cerr } from './geom/err.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const D2R = Math.PI / 180;
export const ROTARY_NAMES = ['A', 'B', 'C'];
export const CHAINS = ['table', 'head', 'table-table', 'head-table', 'head-head'];
export const TILT_OUTPUTS = ['plane', 'unwound'];
export const PREFER = ['positive', 'negative'];

// ---------------------------------------------------------------- vektor/matris
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
export const matMul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
export const matT = (A) => [0, 1, 2].map((i) => [A[0][i], A[1][i], A[2][i]]);
export const matVec = (A, v) => A.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const I3 = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
// Rodrigues: birim u etrafinda deg derece (sag el)
export function rotMat(u, deg) {
  const t = deg * D2R, c = Math.cos(t), s = Math.sin(t), k = 1 - c, [x, y, z] = u;
  return [[c + x * x * k, x * y * k - z * s, x * z * k + y * s], [y * x * k + z * s, c + y * y * k, y * z * k - x * s], [z * x * k - y * s, z * y * k + x * s, c + z * z * k]];
}
const rotVec = (u, deg, v) => matVec(rotMat(u, deg), v);
const norm180 = (a) => { let x = ((a % 360) + 360) % 360; if (x > 180 + 1e-12) x -= 360; return Math.abs(x) < 1e-12 ? 0 : x; };

// ---------------------------------------------------------------- profil
// Profildeki doner eksenler (ad sirasi A, B, C)
export const rotaryNames = (m) => ROTARY_NAMES.filter((k) => m?.axes?.[k] && m.axes[k].kind === 'rotary');
function chainOf(names, axes) {
  const on = names.map((k) => axes[k].on || 'table');
  if (!names.length) return null;
  if (names.length === 1) return on[0];
  const t = on.filter((x) => x === 'table').length;
  return t === 2 ? 'table-table' : t === 1 ? 'head-table' : 'head-head';
}
// Eski ya da eksik profili yeni semaya cevirir (kopya). Eski alanlar degismez; yalniz eksikler eklenir.
export function normalizeMachine(m) {
  if (!m || typeof m !== 'object') return m;
  const c = JSON.parse(JSON.stringify(m));
  const names = rotaryNames(c);
  for (const k of names) { const a = c.axes[k]; if (a.on == null) a.on = 'table'; if (a.center === undefined) a.center = null; }
  const k0 = c.kinematics && typeof c.kinematics === 'object' ? c.kinematics : {};
  const order = Array.isArray(k0.order) && k0.order.length === names.length && names.every((n) => k0.order.includes(n)) ? k0.order.slice() : defaultOrder(names, c.axes);
  c.kinematics = { chain: k0.chain ?? chainOf(names, c.axes), order, prefer: k0.prefer ?? null, tiltOutput: k0.tiltOutput ?? 'plane' };
  return c;
}
// varsayilan sira: tablalar once (egme ekseni -- Z'ye en dik -- dista), sonra kafalar (dikey eksen dista)
function defaultOrder(names, axes) {
  const tilt = (k) => Math.abs(axes[k].dir?.[2] ?? 0);
  const tabs = names.filter((k) => (axes[k].on || 'table') === 'table').sort((a, b) => tilt(a) - tilt(b) || a.localeCompare(b));
  const heads = names.filter((k) => axes[k].on === 'head').sort((a, b) => tilt(b) - tilt(a) || a.localeCompare(b));
  return [...tabs, ...heads];
}
// Profil kinematik alanlarinin yapi denetimi: checkMachine'e eklenir. bad(path, expect)
export function checkKinematics(m, bad) {
  const names = rotaryNames(m);
  for (const k of names) {
    const a = m.axes[k];
    if (a.on != null && a.on !== 'table' && a.on !== 'head') bad(`axes.${k}.on`, 'table/head');
    if (a.center != null && !(Array.isArray(a.center) && a.center.length === 3 && a.center.every(isNum))) bad(`axes.${k}.center`, 'null or [x,y,z]');
  }
  const K = m.kinematics; if (K === undefined || K === null) return;
  if (typeof K !== 'object' || Array.isArray(K)) { bad('kinematics', 'object'); return; }
  if (names.length > 2) bad('kinematics', 'at most 2 rotary axes');
  if (K.chain != null && (!CHAINS.includes(K.chain) || K.chain !== chainOf(names, m.axes))) bad('kinematics.chain', chainOf(names, m.axes) || 'null');
  if (K.order != null && !(Array.isArray(K.order) && K.order.length === names.length && names.every((n) => K.order.includes(n)))) bad('kinematics.order', names.join(','));
  else if (Array.isArray(K.order)) { const on = K.order.map((n) => m.axes[n].on || 'table'); if (on.indexOf('head') >= 0 && on.lastIndexOf('table') > on.indexOf('head')) bad('kinematics.order', 'tables before heads'); }
  if (K.prefer != null && !PREFER.includes(K.prefer)) bad('kinematics.prefer', 'null/positive/negative');
  if (K.tiltOutput != null && !TILT_OUTPUTS.includes(K.tiltOutput)) bad('kinematics.tiltOutput', TILT_OUTPUTS.join('/'));
}

// Cozumleme: { names (zincir sirasi), tables, heads (dis -> ic), ax: {k: {u, on, limits, center}}, chain, prefer, tiltOutput, primary }
export function kinOf(machine) {
  const m = normalizeMachine(machine); const names = m?.kinematics?.order || [];
  const ax = {}; for (const k of names) { const a = m.axes[k]; ax[k] = { u: nrm(a.dir), on: a.on, limits: Array.isArray(a.limits) ? a.limits : null, center: a.center ?? null }; }
  const tables = names.filter((k) => ax[k].on === 'table'), heads = names.filter((k) => ax[k].on === 'head');
  // egme (birincil) ekseni: Z'ye en dik olan; esitse zincirde ilk
  let primary = null; for (const k of names) if (primary === null || Math.abs(ax[k].u[2]) < Math.abs(ax[primary].u[2]) - 1e-9) primary = k;
  return { names, tables, heads, ax, chain: m?.kinematics?.chain ?? null, prefer: m?.kinematics?.prefer ?? null, tiltOutput: m?.kinematics?.tiltOutput ?? 'plane', primary };
}

// ---------------------------------------------------------------- ileri kinematik
// Rt: tabla dondurmesi (parca vektoru -> makine), Rh: kafa dondurmesi (takim vektoru -> makine). Ic eksen once uygulanir.
function chainMat(kin, list, ang) { let R = I3(); for (const k of list) R = matMul(R, rotMat(kin.ax[k].u, ang[k] ?? 0)); return R; }
// W: takim (calisma) cercevesinin tabla koordinatlarindaki eksenleri (sutunlar). W[:,2] = takim ekseni.
export function workFrame(kin, ang) { return matMul(matT(chainMat(kin, kin.tables, ang)), chainMat(kin, kin.heads, ang)); }
export function toolAxisOf(kin, ang) { const W = workFrame(kin, ang); return [W[0][2], W[1][2], W[2][2]]; }

// ---------------------------------------------------------------- ters kinematik
// u etrafinda a'yi b'ye getiren aci (derece). Bilesenler esit degilse null; ikisi de eksene paralelse 0 (serbest).
function alignAngle(u, a, b, tol = 1e-9) {
  const ua = dot(u, a), ub = dot(u, b); if (Math.abs(ua - ub) > tol) return null;
  const ap = sub(a, scl(u, ua)), bp = sub(b, scl(u, ub));
  if (Math.hypot(...ap) < 1e-12 || Math.hypot(...bp) < 1e-12) return 0;
  return Math.atan2(dot(u, cross(ap, bp)), dot(ap, bp)) / D2R;
}
// s . Rot(p, phi) c = k cozumleri (derece). Serbestse [0].
function trigSolve(p, c, s, k) {
  const pc = dot(p, c), al = pc * dot(s, p), be = dot(s, c) - al, ga = dot(s, cross(p, c));
  const rho = Math.hypot(be, ga);
  if (rho < 1e-12) return Math.abs(k - al) < 1e-9 ? [0] : [];
  let r = (k - al) / rho; if (Math.abs(r) > 1 + 1e-9) return []; r = Math.max(-1, Math.min(1, r));
  const base = Math.atan2(ga, be), d = Math.acos(r);
  return d < 1e-12 ? [base / D2R] : [(base + d) / D2R, (base - d) / D2R];
}
// Tum cozumler (sinir disindakiler dahil; inLimits bayrakli). t: tabla koordinatinda birim takim ekseni.
export function solveAll(kin, t) {
  const z = [0, 0, 1]; const n = kin.names.length; const raw = [];
  if (!(Math.abs(Math.hypot(...t) - 1) < 1e-6)) throw cerr('cam.kin.bad_vector', {});
  t = nrm(t);
  if (n === 0) { if (Math.abs(t[2] - 1) < 1e-9) raw.push({}); }
  else if (n === 1) {
    const k = kin.names[0], u = kin.ax[k].u;
    const th = kin.ax[k].on === 'table' ? alignAngle(u, t, z) : alignAngle(u, z, t);
    if (th !== null) raw.push({ [k]: th });
  } else {
    const [k1, k2] = kin.chain === 'head-table' ? [kin.tables[0], kin.heads[0]] : kin.names;
    const p = kin.ax[k1].u, s = kin.ax[k2].u;
    if (kin.chain === 'table-table') { // Rp(t1) Rs(t2) t = z  ->  s.t = s.Rp(-t1) z
      for (const phi of trigSolve(p, z, s, dot(s, t))) { const t1 = -phi; const v = rotVec(p, -t1, z); const t2 = alignAngle(s, t, v, 1e-7); if (t2 !== null) raw.push({ [k1]: t1, [k2]: t2 }); }
    } else if (kin.chain === 'head-head') { // Rp(t1) Rs(t2) z = t  ->  s.z = s.Rp(-t1) t
      for (const phi of trigSolve(p, t, s, dot(s, z))) { const t1 = -phi; const v = rotVec(p, -t1, t); const t2 = alignAngle(s, z, v, 1e-7); if (t2 !== null) raw.push({ [k1]: t1, [k2]: t2 }); }
    } else { // head-table: Rt(tt) t = Rh(th) z  ->  h.Rt(tt) t = h.z
      for (const tt of trigSolve(p, t, s, dot(s, z))) { const v = rotVec(p, tt, t); const th = alignAngle(s, z, v, 1e-7); if (th !== null) raw.push({ [k1]: tt, [k2]: th }); }
    }
  }
  // normalize + sinira gore +-360 varyantlari; ileri kinematikle dogrula
  const out = []; const seen = new Set();
  for (const r of raw) {
    const opts = kin.names.map((k) => { const a = norm180(r[k] ?? 0); const L = kin.ax[k].limits; const vs = L ? [a, a + 360, a - 360].filter((v) => v >= L[0] - 1e-9 && v <= L[1] + 1e-9) : [a]; return vs.length ? vs.map((v) => ({ v, ok: true })) : [{ v: a, ok: false }]; });
    const combos = opts.reduce((acc, list, i) => acc.flatMap((c) => list.map((o) => ({ ...c, [kin.names[i]]: o }))), [{}]);
    for (const c of combos) {
      const ang = {}; let ok = true; for (const k of kin.names) { ang[k] = Math.abs(c[k].v) < 1e-12 ? 0 : c[k].v; ok = ok && c[k].ok; }
      const e = toolAxisOf(kin, ang); if (Math.hypot(...sub(e, t)) > 1e-7) continue;
      const key = kin.names.map((k) => ang[k].toFixed(6)).join('|'); if (seen.has(key)) continue; seen.add(key);
      out.push({ angles: ang, inLimits: ok });
    }
  }
  return out;
}
// Secim kurali (O onerisi): sinir icindekiler; profil prefer (egme ekseni isareti) uyanlar once; sonra |egme| kucuk, sonra
// diger eksenlerin |aci| toplami kucuk; esitlikte zincir sirasiyla sozluk sirasi (kararli).
export function pickSolution(kin, sols) {
  const ok = sols.filter((s) => s.inLimits); if (!ok.length) return null;
  const P = kin.primary;
  const bad = (s) => (kin.prefer && P && Math.abs(s.angles[P]) > 1e-9 ? ((kin.prefer === 'positive') !== (s.angles[P] > 0) ? 1 : 0) : 0);
  const key = (s) => [bad(s), P ? Math.abs(s.angles[P]) : 0, kin.names.filter((k) => k !== P).reduce((a, k) => a + Math.abs(s.angles[k]), 0), ...kin.names.map((k) => s.angles[k])];
  return ok.slice().sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > 1e-9) return x[i] - y[i]; return 0; })[0];
}
// t -> secilen aci. Hata: cam.kin.unreachable (cozum yok), cam.kin.limits (yalniz sinir disi cozum)
export function solveAngles(kin, t) {
  const sols = solveAll(kin, t);
  if (!sols.length) throw cerr('cam.kin.unreachable', { axis: fmtVec(t) });
  const s = pickSolution(kin, sols);
  if (!s) { const a = sols[0].angles; throw cerr('cam.kin.limits', { angles: fmtAng(a), limits: kin.names.map((k) => `${k} ${kin.ax[k].limits ? kin.ax[k].limits.join('..') : '-'}`).join(', ') }); }
  return { angles: s.angles, count: sols.filter((x) => x.inLimits).length };
}
export const fmtAng = (a) => Object.keys(a).map((k) => `${k}${(Math.round(a[k] * 1000) / 1000)}`).join(' ');
const fmtVec = (v) => v.map((x) => Math.round(x * 1e4) / 1e4).join(', ');

// ---------------------------------------------------------------- egik duzlem (G68.2) Euler ZXZ
// W = Rz(I) Rx(J) Rz(K); donus [I, J, K] derece. J ~ 0 ya da 180: K = 0.
export function eulerZXZ(W) {
  const cb = Math.max(-1, Math.min(1, W[2][2])); const b = Math.acos(cb); const sb = Math.sin(b);
  let a, g;
  if (sb > 1e-9) { a = Math.atan2(W[0][2], -W[1][2]); g = Math.atan2(W[2][0], W[2][1]); }
  else { g = 0; a = cb > 0 ? Math.atan2(W[1][0], W[0][0]) : Math.atan2(W[1][0], W[0][0]); }
  const f = (x) => { const d = x / D2R; return Math.abs(d) < 1e-12 ? 0 : d; };
  return [f(a), f(b), f(g)];
}
export function eulerMat(I, J, K) { return matMul(matMul(rotMat([0, 0, 1], I), rotMat([1, 0, 0], J)), rotMat([0, 0, 1], K)); }

// ---------------------------------------------------------------- acilmis cikis kaydirmasi
// Tabla-tabla (ya da tek tabla) zincirinde, eksen merkezleri (makine koordinati) ve is sifirinin makine konumu (machinePos) ile:
// makine XYZ = yerel XYZ + d (tum bolum icin sabit oteleme; RTCP/pivot yok). Kafa ekseni varsa null (desteklenmez).
export function unwoundShift(kin, ang, machinePos) {
  if (kin.heads.length) return { shift: null, missing: 'head' };
  if (!(Array.isArray(machinePos) && machinePos.length === 3 && machinePos.every(isNum))) return { shift: null, missing: 'setup.machinePos' };
  for (const k of kin.tables) if (!kin.ax[k].center) return { shift: null, missing: `axes.${k}.center` };
  // q (tabla koordinati, is sifirina gore) -> makine (is sifirina gore): ic eksen once, her biri kendi merkezi etrafinda
  const T = (q) => { let p = q; for (let i = kin.tables.length - 1; i >= 0; i--) { const k = kin.tables[i]; const c = sub(kin.ax[k].center, machinePos); p = add(c, rotVec(kin.ax[k].u, ang[k] ?? 0, sub(p, c))); } return p; };
  const d = T([0, 0, 0]).map((v) => (Math.abs(v) < 1e-12 ? 0 : v));
  return { shift: d, missing: null };
}

// ---------------------------------------------------------------- setup egimi
// setup.tilt = { enabled, kind: 'face'|'vector'|'angles', ref?, flip?, v?:[x,y,z] (setup taban cercevesinde), angles?:{A,B,C} }
// F0 = taban cercevesi satirlari [x,y,z] (model uzayi). plane = cekirdek facePlane sonucu (kind 'face').
// Donus: { t (tabla koord. takim ekseni), angles, W, euler, count }
export function resolveTilt(tilt, F0, machine, plane) {
  const kin = kinOf(machine);
  if (!kin.names.length) throw cerr('cam.kin.no_rotary', {});
  let t, angles = null, count = 1;
  if (tilt.kind === 'face') {
    if (!plane || !Array.isArray(plane.n)) throw cerr('cam.setup.face_axis_unresolved', { axis: 'tilt' });
    const n = nrm(tilt.flip ? plane.n.map((x) => -x) : plane.n); t = F0.map((r) => dot(r, n));
  } else if (tilt.kind === 'vector') {
    const v = tilt.v; if (!(Array.isArray(v) && v.length === 3 && v.every(isNum) && Math.hypot(...v) > 1e-9)) throw cerr('cam.setup.bad_field', { field: 'tilt.v' });
    t = nrm(v);
  } else if (tilt.kind === 'angles') {
    const a = tilt.angles || {}; angles = {};
    for (const k of kin.names) { const v = a[k] ?? 0; if (!isNum(v)) throw cerr('cam.setup.bad_field', { field: 'tilt.angles.' + k }); angles[k] = v; }
    for (const k of Object.keys(a)) if (!kin.names.includes(k)) throw cerr('cam.kin.axis_missing', { axis: k });
    for (const k of kin.names) { const L = kin.ax[k].limits; if (L && (angles[k] < L[0] - 1e-9 || angles[k] > L[1] + 1e-9)) throw cerr('cam.kin.limits', { angles: fmtAng(angles), limits: `${k} ${L.join('..')}` }); }
    t = toolAxisOf(kin, angles);
  } else throw cerr('cam.setup.bad_field', { field: 'tilt.kind' });
  if (!angles) { const s = solveAngles(kin, t); angles = s.angles; count = s.count; }
  const W = workFrame(kin, angles);
  return { t: [W[0][2], W[1][2], W[2][2]], angles, W, euler: eulerZXZ(W), count, kin };
}

// ---------------------------------------------------------------- acilmis program (post oncesi)
// tilt.mode 'unwound' ve shift bilinen bolumlerde hareketler d kadar otelenir (yaylar ve cevrimler oteleme ile degismez).
// Diger bolumler aynen (ayni nesne) doner.
export function unwindProgram(program) {
  if (!program?.sections?.some((s) => s.setup?.tilt?.mode === 'unwound' && s.setup.tilt.shift)) return program;
  const sections = program.sections.map((s) => {
    const d = s.setup?.tilt?.mode === 'unwound' ? s.setup.tilt.shift : null; if (!d) return s;
    const mv = (m) => {
      if (m.t === 'rapid' || m.t === 'feed' || m.t === 'arc') return { ...m, x: m.x + d[0], y: m.y + d[1], z: m.z + d[2] };
      if (m.t === 'cycle') { const o = { ...m, points: m.points.map((p) => [p[0] + d[0], p[1] + d[1]]) }; for (const k of ['top', 'bottom', 'retract', 'clearance', 'cutTo']) if (isNum(m[k])) o[k] = m[k] + d[2]; return o; }
      return m;
    };
    const tp = s.toolpath;
    return { ...s, toolpath: { ...tp, clearanceZ: tp.clearanceZ + d[2], retractZ: tp.retractZ + d[2], moves: tp.moves.map(mv) } };
  });
  return { ...program, sections };
}
