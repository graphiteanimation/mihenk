// CAM ara gosterimi (IR): A (cekirdek) ile B (post/simulasyon) arasindaki TEK arayuz. Saf JS (DOM/three/Electron yok).
// Sozlesme: docs/CAM-DESIGN.md "Takim yolu ara gosterimi (IR)". Birim mm, derece. Koordinatlar setup WCS'sinde.
// Hata: KErr-tarzi {code, params}; sessiz duzeltme yok.
import { KErr } from '../shared/errors.js';

export const MOVE_TYPES = ['rapid', 'feed', 'arc', 'cycle', 'dwell', 'comp'];
export const FEED_KINDS = ['cut', 'plunge', 'ramp', 'lead'];
export const CYCLES = ['drill', 'spot', 'peck', 'chipbreak', 'tap', 'ream', 'bore'];
export const COOLANTS = ['flood', 'mist', 'air', 'through', 'off'];
export const TOOL_TYPES = ['flat', 'ball', 'bullnose', 'drill', 'spot', 'tap', 'chamfer', 'face', 'reamer', 'bore', 'threadmill'];
export const ARC_TOL = 0.005; // mm: yayin baslangic ve bitis yaricaplari arasindaki izinli fark
const EPS = 1e-6;
// V-05: kirisi bundan kisa yay dejenere sayilir (3 ondalikli NC'de baslangic=bitis -> kontrolde TAM DAIRE). Islemler boyle
// yayi dogruya cevirir (ops/common.js Builder.seg); IR dogrulamasi reddeder.
export const ARC_MIN_CHORD = 1e-3;

export const irErr = (code, params = {}) => new KErr(code, params);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);

// ---------------------------------------------------------------- uretim yardimcilari
export const mk = {
  rapid: (x, y, z) => ({ t: 'rapid', x, y, z }),
  feed: (x, y, z, f, kind = 'cut') => ({ t: 'feed', x, y, z, f, kind }),
  arc: (x, y, z, i, j, dir, f, kind = 'cut') => ({ t: 'arc', x, y, z, i, j, dir, f, kind }),
  cycle: (c) => ({ t: 'cycle', ...c }),
  dwell: (s) => ({ t: 'dwell', s }),
  comp: (on) => ({ t: 'comp', on: !!on }),
  // Takim yolu: stats alani moves'tan hesaplanir (computeStats); verilen alanlar uzerine yazilir.
  toolpath(f) {
    const tp = { opId: 'op', opName: 'op', opType: 'contour', rpm: 0, spindleDir: 'cw', coolant: 'off', comp: 'computer', retractZ: f.clearanceZ, ...f };
    if (!tp.stats) tp.stats = computeStats(tp);
    return tp;
  },
  section: (setup, toolpath) => ({ setup, toolpath }),
  program: (p) => ({ name: 'PROG', machine: null, units: 'mm', sections: [], ...p }),
};

// ---------------------------------------------------------------- yay yardimcilari
// Yay merkezi (mutlak) ve yaricap. start = {x,y}
export function arcCenter(start, m) { return { cx: start.x + m.i, cy: start.y + m.j }; }
export function arcRadius(start, m) { return Math.hypot(m.i, m.j); }
// Isaretli tarama acisi (radyan): ccw pozitif, cw negatif. Baslangic = bitis ise 0 (tam daire IR'de yasak).
export function arcSweep(start, m) {
  const { cx, cy } = arcCenter(start, m);
  const a0 = Math.atan2(start.y - cy, start.x - cx), a1 = Math.atan2(m.y - cy, m.x - cx);
  let d = a1 - a0;
  if (m.dir === 'ccw') { while (d <= 0) d += 2 * Math.PI; while (d > 2 * Math.PI) d -= 2 * Math.PI; return d; }
  while (d >= 0) d -= 2 * Math.PI; while (d < -2 * Math.PI) d += 2 * Math.PI; return d;
}
// Yayi kiris hatasi <= tol olacak sekilde ornekler; baslangic haric, bitis dahil [[x,y,z],...]. Z dogrusal (helis).
export function sampleArc(start, m, tol = 0.002) {
  const r = arcRadius(start, m); const { cx, cy } = arcCenter(start, m);
  const sw = arcSweep(start, m); const a0 = Math.atan2(start.y - cy, start.x - cx);
  const dmax = r > tol ? 2 * Math.acos(Math.max(0, 1 - tol / r)) : Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(sw) / Math.max(dmax, 1e-3)));
  const out = [];
  for (let k = 1; k <= n; k++) {
    if (k === n) { out.push([m.x, m.y, m.z]); break; }
    const a = a0 + sw * (k / n);
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a), start.z + (m.z - start.z) * (k / n)]);
  }
  return out;
}
// Yayin XY kutusu (uc noktalar + eksen gecisleri)
export function arcBBox2(start, m) {
  const { cx, cy } = arcCenter(start, m); const r = arcRadius(start, m);
  let minx = Math.min(start.x, m.x), maxx = Math.max(start.x, m.x), miny = Math.min(start.y, m.y), maxy = Math.max(start.y, m.y);
  const sw = arcSweep(start, m); const a0 = Math.atan2(start.y - cy, start.x - cx);
  for (let q = 0; q < 4; q++) {
    const ang = q * Math.PI / 2; // 0, 90, 180, 270
    let d = ang - a0; // ayni yonde a0'dan ang'a mesafe
    if (sw > 0) { while (d < 0) d += 2 * Math.PI; while (d >= 2 * Math.PI) d -= 2 * Math.PI; if (d <= sw) { /* icinde */ } else continue; }
    else { while (d > 0) d -= 2 * Math.PI; while (d <= -2 * Math.PI) d += 2 * Math.PI; if (d >= sw) { /* icinde */ } else continue; }
    const px = cx + r * Math.cos(ang), py = cy + r * Math.sin(ang);
    minx = Math.min(minx, px); maxx = Math.max(maxx, px); miny = Math.min(miny, py); maxy = Math.max(maxy, py);
  }
  return { minx, maxx, miny, maxy };
}

// ---------------------------------------------------------------- yol gezintisi
// fn(move, index, from) cagrilir; from = hareket oncesi konum {x,y,z} (ilk hareket icin null).
// Cevrimden sonra konum = son nokta XY, Z = clearance (G98 donusu).
export function walk(tp, fn) {
  let pos = null;
  tp.moves.forEach((m, k) => {
    fn(m, k, pos ? { ...pos } : null);
    if (m.t === 'rapid' || m.t === 'feed' || m.t === 'arc') pos = { x: m.x, y: m.y, z: m.z };
    else if (m.t === 'cycle' && m.points?.length) { const p = m.points[m.points.length - 1]; pos = { x: p[0], y: p[1], z: m.clearance }; }
  });
  return pos;
}

// Hareketlerin 3B sinir kutusu {min:[x,y,z], max:[x,y,z]} (yaylar dahil; cevrimler noktalar x [bottom..clearance]). Bos ise null.
export function pathBBox(moves) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const add = (x, y, z) => { if (x < mn[0]) mn[0] = x; if (y < mn[1]) mn[1] = y; if (z < mn[2]) mn[2] = z; if (x > mx[0]) mx[0] = x; if (y > mx[1]) mx[1] = y; if (z > mx[2]) mx[2] = z; };
  walk({ moves }, (m, k, from) => {
    if (m.t === 'rapid' || m.t === 'feed') add(m.x, m.y, m.z);
    else if (m.t === 'arc') {
      if (from) { const b = arcBBox2(from, m); add(b.minx, b.miny, Math.min(from.z, m.z)); add(b.maxx, b.maxy, Math.max(from.z, m.z)); }
      add(m.x, m.y, m.z);
    } else if (m.t === 'cycle') for (const p of m.points || []) { add(p[0], p[1], m.bottom); add(p[0], p[1], m.clearance); }
  });
  return Number.isFinite(mn[0]) ? { min: mn, max: mx } : null;
}

// Istatistik: cutLen (kesme/dalma/yay yolu), rapidLen, timeMin (hizli sure yalniz opts.rapidFeed verilirse), zMin, bbox
export function computeStats(tp, opts = {}) {
  let cutLen = 0, rapidLen = 0, tMin = 0, zMin = Infinity;
  walk(tp, (m, k, from) => {
    if (m.t === 'rapid') {
      if (from) { const l = Math.hypot(m.x - from.x, m.y - from.y, m.z - from.z); rapidLen += l; if (opts.rapidFeed > 0) tMin += l / opts.rapidFeed; }
      zMin = Math.min(zMin, m.z);
    } else if (m.t === 'feed' || m.t === 'arc') {
      let l;
      if (m.t === 'feed') l = from ? Math.hypot(m.x - from.x, m.y - from.y, m.z - from.z) : 0;
      else { const r = arcRadius(from || { x: 0, y: 0 }, m); const sw = from ? Math.abs(arcSweep(from, m)) : 0; l = Math.hypot(r * sw, m.z - (from?.z ?? m.z)); }
      cutLen += l; if (m.f > 0) tMin += l / m.f; zMin = Math.min(zMin, m.z);
    } else if (m.t === 'cycle') {
      for (let n = 0; n < (m.points || []).length; n++) { const l = m.retract - m.bottom; cutLen += l; if (m.f > 0) tMin += l / m.f; }
      zMin = Math.min(zMin, m.bottom);
    } else if (m.t === 'dwell') tMin += (m.s || 0) / 60;
  });
  const bb = pathBBox(tp.moves);
  return { cutLen, rapidLen, timeMin: tMin, zMin: Number.isFinite(zMin) ? zMin : null, bbox: bb };
}

// Karisik (XY + Z birlikte) hizli hareketi guvenli sirayla boler: inis = once XY sonra Z; cikis = once Z sonra XY.
// (G0 dog-leg riskine karsi; post ve simulasyon ayni normalizasyonu kullanir.)
export function splitRapid(from, m) {
  if (!from) return [m];
  const dxy = Math.hypot(m.x - from.x, m.y - from.y), dz = m.z - from.z;
  if (dxy < EPS || Math.abs(dz) < EPS) return [m];
  return dz > 0 ? [{ t: 'rapid', x: from.x, y: from.y, z: m.z }, { t: 'rapid', x: m.x, y: m.y, z: m.z }]
                : [{ t: 'rapid', x: m.x, y: m.y, z: from.z }, { t: 'rapid', x: m.x, y: m.y, z: m.z }];
}
export function normalizeRapids(tp) {
  const moves = []; let pos = null;
  const tmp = { moves: tp.moves };
  walk(tmp, (m, k, from) => {
    if (m.t === 'rapid') for (const s of splitRapid(from, m)) moves.push(s); else moves.push(m);
  });
  return { ...tp, moves };
}

// ---------------------------------------------------------------- dogrulama
// Ilk hatayi atar. Donus: true.
export function validateToolpath(tp) {
  const errs = toolpathErrors(tp, true);
  if (errs.length) throw irErr(errs[0].code, errs[0].params);
  return true;
}
// Tum hatalari dizi olarak verir: [{code, params}]
export function toolpathErrors(tp, firstOnly = false) {
  const errs = [];
  const bad = (code, params = {}) => { errs.push({ code, params }); return firstOnly; };
  if (!tp || typeof tp !== 'object') { bad('cam.ir.not_object'); return errs; }
  const T = tp.tool;
  if (!T || typeof T !== 'object') { if (bad('cam.ir.tool_missing')) return errs; }
  else {
    if (!isInt(T.number) || T.number < 1) { if (bad('cam.ir.field', { field: 'tool.number' })) return errs; }
    if (!isInt(T.H) || T.H < 1) { if (bad('cam.ir.field', { field: 'tool.H' })) return errs; }
    if (tp.comp === 'wear' && (!isInt(T.D) || T.D < 1)) { if (bad('cam.ir.field', { field: 'tool.D' })) return errs; }
    if (!TOOL_TYPES.includes(T.type)) { if (bad('cam.ir.field', { field: 'tool.type' })) return errs; }
    if (!isNum(T.dia) || T.dia <= 0) { if (bad('cam.ir.field', { field: 'tool.dia' })) return errs; }
    for (const k of ['cornerR', 'tipAngle', 'fluteLen', 'bodyLen', 'pitch']) if (T[k] != null && (!isNum(T[k]) || T[k] < 0)) { if (bad('cam.ir.field', { field: 'tool.' + k })) return errs; }
  }
  if (!isNum(tp.rpm) || tp.rpm <= 0) { if (bad('cam.ir.field', { field: 'rpm' })) return errs; }
  if (tp.spindleDir !== 'cw' && tp.spindleDir !== 'ccw') { if (bad('cam.ir.field', { field: 'spindleDir' })) return errs; }
  if (!COOLANTS.includes(tp.coolant)) { if (bad('cam.ir.field', { field: 'coolant' })) return errs; }
  if (tp.comp !== 'computer' && tp.comp !== 'wear') { if (bad('cam.ir.field', { field: 'comp' })) return errs; }
  if (tp.comp === 'wear' && tp.compSide !== 'left' && tp.compSide !== 'right') { if (bad('cam.ir.field', { field: 'compSide' })) return errs; }
  if (!isNum(tp.clearanceZ)) { if (bad('cam.ir.field', { field: 'clearanceZ' })) return errs; }
  if (!isNum(tp.retractZ) || (isNum(tp.clearanceZ) && tp.retractZ > tp.clearanceZ + EPS)) { if (bad('cam.ir.field', { field: 'retractZ' })) return errs; }
  if (!Array.isArray(tp.moves) || tp.moves.length === 0) { bad('cam.ir.no_moves'); return errs; }

  let pos = null, compActive = false, pending = null, compOnCount = 0;
  for (let k = 0; k < tp.moves.length; k++) {
    const m = tp.moves[k]; const at = { move: k };
    if (!m || typeof m !== 'object' || !MOVE_TYPES.includes(m.t)) { if (bad('cam.ir.move_type', { ...at, t: m && m.t })) return errs; continue; }
    if (k === 0 && m.t !== 'rapid') { if (bad('cam.ir.first_not_rapid', at)) return errs; }
    if (m.t === 'rapid' || m.t === 'feed' || m.t === 'arc') {
      for (const a of ['x', 'y', 'z']) if (!isNum(m[a])) { if (bad('cam.ir.field', { ...at, field: a })) return errs; }
      if (!isNum(m.x) || !isNum(m.y) || !isNum(m.z)) continue;
    }
    if (pending !== null && !(m.t === 'feed' && m.kind === 'lead')) { if (bad('cam.ir.comp_not_on_lead', at)) return errs; }
    if (m.t === 'rapid') {
      if (compActive && bad('cam.ir.rapid_in_comp', at)) return errs;
      if (k === 0 && isNum(tp.clearanceZ) && Math.abs(m.z - tp.clearanceZ) > EPS) { if (bad('cam.ir.first_not_clearance', { ...at, z: m.z, clearanceZ: tp.clearanceZ })) return errs; }
      pos = { x: m.x, y: m.y, z: m.z };
    } else if (m.t === 'feed' || m.t === 'arc') {
      if (!isNum(m.f) || m.f <= 0) { if (bad('cam.ir.field', { ...at, field: 'f' })) return errs; }
      if (!FEED_KINDS.includes(m.kind)) { if (bad('cam.ir.field', { ...at, field: 'kind' })) return errs; }
      if (m.t === 'arc') {
        if (!isNum(m.i) || !isNum(m.j)) { if (bad('cam.ir.field', { ...at, field: 'i,j' })) return errs; continue; }
        if (m.dir !== 'cw' && m.dir !== 'ccw') { if (bad('cam.ir.field', { ...at, field: 'dir' })) return errs; }
        if (pos) {
          const r0 = Math.hypot(m.i, m.j), r1 = Math.hypot(m.x - (pos.x + m.i), m.y - (pos.y + m.j));
          if (r0 < EPS) { if (bad('cam.ir.arc_zero_radius', at)) return errs; }
          else if (Math.abs(r0 - r1) > ARC_TOL) { if (bad('cam.ir.arc_radius_mismatch', { ...at, r0, r1 })) return errs; }
          const ch = Math.hypot(m.x - pos.x, m.y - pos.y);
          if (ch < EPS) { if (bad('cam.ir.arc_full_circle', at)) return errs; }
          else if (ch < ARC_MIN_CHORD) { if (bad('cam.ir.arc_degenerate', { ...at, chord: ch })) return errs; }
        }
      }
      if (pending !== null) {
        if (m.t !== 'feed') { if (bad('cam.ir.comp_not_on_lead', at)) return errs; }
        compActive = pending; pending = null;
      }
      pos = { x: m.x, y: m.y, z: m.z };
    } else if (m.t === 'cycle') {
      if (compActive && bad('cam.ir.cycle_in_comp', at)) return errs;
      if (!CYCLES.includes(m.cycle)) { if (bad('cam.ir.field', { ...at, field: 'cycle' })) return errs; continue; }
      if (!Array.isArray(m.points) || m.points.length === 0 || !m.points.every((p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]))) { if (bad('cam.ir.field', { ...at, field: 'points' })) return errs; continue; }
      for (const a of ['top', 'bottom', 'retract', 'clearance', 'f']) if (!isNum(m[a])) { if (bad('cam.ir.field', { ...at, field: a })) return errs; }
      if (isNum(m.bottom) && isNum(m.retract) && isNum(m.clearance)) {
        if (!(m.bottom < m.retract)) { if (bad('cam.ir.cycle_heights', at)) return errs; }
        if (m.retract > m.clearance + EPS) { if (bad('cam.ir.cycle_heights', at)) return errs; }
        if (pos && Math.abs(pos.z - m.clearance) > EPS) { if (bad('cam.ir.cycle_start_z', { ...at, z: pos.z, clearance: m.clearance })) return errs; }
      }
      if (isNum(m.f) && m.f <= 0) { if (bad('cam.ir.field', { ...at, field: 'f' })) return errs; }
      if (m.returnTo != null && m.returnTo !== 'r' && m.returnTo !== 'clearance') { if (bad('cam.ir.field', { ...at, field: 'returnTo' })) return errs; } // WP-06: 'clearance' = her nokta sonrasi G98 (baslangic duzlemine donus); 'r' (varsayilan) = G99 gecisleri
      if ((m.cycle === 'peck' || m.cycle === 'chipbreak') && !(isNum(m.peck) && m.peck > 0)) { if (bad('cam.ir.field', { ...at, field: 'peck' })) return errs; }
      if (m.dwell != null && (!isNum(m.dwell) || m.dwell < 0)) { if (bad('cam.ir.field', { ...at, field: 'dwell' })) return errs; }
      if (m.cycle === 'tap') {
        if (!(isNum(m.pitch) && m.pitch > 0)) { if (bad('cam.ir.tap_pitch', at)) return errs; }
        else if (isNum(tp.rpm) && isNum(m.f) && Math.abs(m.f - tp.rpm * m.pitch) > 1e-3 * Math.max(1, m.f)) { if (bad('cam.ir.tap_feed_mismatch', { ...at, f: m.f, expected: tp.rpm * m.pitch })) return errs; }
      }
      if (m.points?.length) { const p = m.points[m.points.length - 1]; if (isNum(p[0])) pos = { x: p[0], y: p[1], z: m.clearance }; }
    } else if (m.t === 'dwell') {
      if (!isNum(m.s) || m.s < 0) { if (bad('cam.ir.field', { ...at, field: 's' })) return errs; }
    } else if (m.t === 'comp') {
      if (typeof m.on !== 'boolean') { if (bad('cam.ir.field', { ...at, field: 'on' })) return errs; continue; }
      if (tp.comp !== 'wear') { if (bad('cam.ir.comp_not_wear', at)) return errs; }
      const cur = pending !== null ? pending : compActive;
      if (m.on === cur) { if (bad('cam.ir.comp_state', at)) return errs; }
      if (m.on) compOnCount++;
      pending = m.on;
    }
  }
  if (pending !== null && bad('cam.ir.comp_not_on_lead', { move: tp.moves.length })) return errs;
  if (compActive) { if (bad('cam.ir.comp_left_on')) return errs; }
  if (tp.comp === 'wear' && compOnCount === 0) { if (bad('cam.ir.wear_no_comp')) return errs; }
  if (pos && isNum(tp.clearanceZ) && Math.abs(pos.z - tp.clearanceZ) > EPS) { if (bad('cam.ir.last_not_clearance', { z: pos.z, clearanceZ: tp.clearanceZ })) return errs; }
  return errs;
}

const WCS = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59', 'G54.1'];
export function validateProgram(p) {
  if (!p || typeof p !== 'object') throw irErr('cam.ir.not_object');
  if (typeof p.name !== 'string' || !p.name) throw irErr('cam.ir.field', { field: 'name' });
  if (p.units !== 'mm') throw irErr('cam.ir.field', { field: 'units' });
  if (p.number != null && !(isInt(p.number) && p.number >= 0)) throw irErr('cam.ir.field', { field: 'number' });
  if (!Array.isArray(p.sections) || p.sections.length === 0) throw irErr('cam.ir.no_sections');
  p.sections.forEach((s, n) => {
    const st = s && s.setup;
    if (!st || typeof st !== 'object') throw irErr('cam.ir.field', { section: n, field: 'setup' });
    const w = st.workOffset;
    if (!w || !WCS.includes(w.kind)) throw irErr('cam.ir.field', { section: n, field: 'workOffset' });
    if (w.kind === 'G54.1' && !(isInt(w.p) && w.p >= 1)) throw irErr('cam.ir.field', { section: n, field: 'workOffset.p' });
    if (st.aAngle != null && !isNum(st.aAngle)) throw irErr('cam.ir.field', { section: n, field: 'aAngle' });
    try { validateToolpath(s.toolpath); } catch (e) { if (e instanceof KErr) throw irErr(e.code, { ...e.params, section: n }); throw e; }
  });
  return true;
}

// ---------------------------------------------------------------- karsilastirma (geri okuma testleri icin)
// Iki takim yolunu NC'de temsil edilebilen alanlar uzerinden karsilastirir.
// NC'de karsiligi olmayan alanlar yok sayilir: kind, cycle.top, stats, opId/opName/opType, retractZ, tool geometrisi.
// 'spot' = 'drill' sayilir (ikisi de G81/G82). tol mm (varsayilan 0.001 + yuvarlama payi).
export function compareToolpaths(a, b, tol = 0.001) {
  const diffs = [];
  const canon = (c) => (c === 'spot' ? 'drill' : c);
  const retToClr = (c) => c.returnTo === 'clearance' || Math.abs(c.retract - c.clearance) < 1e-9; // cok noktali cevrimde her nokta G98
  const ma = a.moves, mb = b.moves;
  const near = (u, v, t = tol) => Math.abs(u - v) <= t;
  if (ma.length !== mb.length) diffs.push(`move count ${ma.length} != ${mb.length}`);
  const n = Math.min(ma.length, mb.length);
  for (let k = 0; k < n; k++) {
    const p = ma[k], q = mb[k];
    if (p.t !== q.t) { diffs.push(`#${k} type ${p.t} != ${q.t}`); continue; }
    const chk = (keys, t = tol) => keys.forEach((key) => { if (!(typeof p[key] === 'number' && typeof q[key] === 'number' && near(p[key], q[key], t))) diffs.push(`#${k} ${p.t}.${key} ${p[key]} != ${q[key]}`); });
    if (p.t === 'rapid') chk(['x', 'y', 'z']);
    else if (p.t === 'feed') { chk(['x', 'y', 'z']); chk(['f'], 0.051); }
    else if (p.t === 'arc') { chk(['x', 'y', 'z', 'i', 'j']); chk(['f'], 0.051); if (p.dir !== q.dir) diffs.push(`#${k} arc.dir ${p.dir} != ${q.dir}`); }
    else if (p.t === 'dwell') chk(['s'], 0.0011);
    else if (p.t === 'comp') { if (p.on !== q.on) diffs.push(`#${k} comp.on`); }
    else if (p.t === 'cycle') {
      if (canon(p.cycle) !== canon(q.cycle)) diffs.push(`#${k} cycle ${p.cycle} != ${q.cycle}`);
      chk(['bottom', 'retract', 'clearance']); chk(['f'], 0.051);
      if (p.points.length !== q.points.length) diffs.push(`#${k} cycle points count`);
      else if (p.points.length > 1 && retToClr(p) !== retToClr(q)) diffs.push(`#${k} cycle.returnTo ${retToClr(p) ? 'clearance' : 'r'} != ${retToClr(q) ? 'clearance' : 'r'}`);
      else p.points.forEach((pt, m) => { if (!near(pt[0], q.points[m][0]) || !near(pt[1], q.points[m][1])) diffs.push(`#${k} point ${m}`); });
      for (const key of ['peck', 'dwell', 'pitch']) if ((p[key] ?? null) !== null || (q[key] ?? null) !== null) { if (!(typeof p[key] === 'number' && typeof q[key] === 'number' && near(p[key], q[key], 0.0011))) { if (!(key === 'dwell' && !(p[key] > 0) && !(q[key] > 0))) diffs.push(`#${k} cycle.${key} ${p[key]} != ${q[key]}`); } }
    }
  }
  for (const key of ['rpm']) if (a[key] !== b[key]) diffs.push(`${key} ${a[key]} != ${b[key]}`);
  if (a.spindleDir !== b.spindleDir) diffs.push(`spindleDir ${a.spindleDir} != ${b.spindleDir}`);
  if (a.coolant !== b.coolant) diffs.push(`coolant ${a.coolant} != ${b.coolant}`);
  if (a.tool.number !== b.tool.number || a.tool.H !== b.tool.H) diffs.push('tool number/H');
  if (a.comp === 'wear' && (a.tool.D !== b.tool.D || a.compSide !== b.compSide)) diffs.push('wear D/side');
  if (a.comp !== b.comp) diffs.push(`comp ${a.comp} != ${b.comp}`);
  return { equal: diffs.length === 0, diffs };
}
