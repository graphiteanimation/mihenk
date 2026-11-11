// Bagimsiz NC ayrıştırıcı + M80V lint (post/reader.js KULLANILMAZ). Uretilen metni tezgahin gorecegi gibi yorumlar:
// modal durum, konum, takim/H/S/M3, F, yay merkezi, cevrimler. Cikti: { moves:[{t,x0..,x,y,z,f,line,...}], issues:[{code,line,text}] }
const HOME_Z = 1e6; // G28 Z0 sonrasi "tezgah ust" (isaret)

export function lintNC(text, o = {}) {
  const { stockTop = 0, protectedT = [], protectedH = [], protectedD = [], protectedWcs = [], decimals = 3 } = o;
  const lines = text.split('\n'); if (lines[lines.length - 1] === '') lines.pop();
  const issues = []; const I = (code, ln, msg) => issues.push({ code, line: ln, msg });
  const st = { g90: null, g17: false, motion: null, wcs: null, comp: 40, h: null, t: null, tPending: null, s: null, spin: null, cool: false, f: null, fSec: false, x: null, y: null, z: HOME_Z, cycle: null, ret: 98, secIdx: -1, ended: false, lastN: -Infinity, cycleInit: null, positioned: false };
  const moves = []; let sawUnverified = false; let lastCode = null;
  lines.forEach((raw, idx) => {
    const ln = idx + 1;
    if (/UNVERIFIED POST/.test(raw)) sawUnverified = true;
    if (/^\(OP \d+/.test(raw)) { st.secIdx++; st.fSec = false; }
    let body = raw.replace(/\([^)]*\)/g, '').trim();
    if (/[()]/.test(body)) I('paren', ln, raw);
    if (/[^\x20-\x7e]/.test(raw)) I('non_ascii', ln, raw);
    if (!body || body === '%') return;
    if (/NaN|undefined|null|Infinity|e[+-]\d/i.test(body)) I('bad_number', ln, body);
    if (/[XYZIJRQFA]-0\.?(0*)(?![1-9])(\s|$)/.test(body)) I('neg_zero', ln, body);
    if (st.ended) I('after_end', ln, body);
    const words = body.match(/,R\d+|[A-Z][+-]?[\d.]+/g) || [];
    if (words.join(' ').replace(/\s/g, '') !== body.replace(/\s/g, '')) I('garbage', ln, body);
    const W = {}; const Gs = [], Ms = [];
    for (const w of words) {
      if (w.startsWith(',')) { W[','] = w; continue; }
      const L = w[0], v = w.slice(1);
      if ('XYZIJRQFA'.includes(L) && !v.includes('.')) I('no_decimal', ln, w);
      if ('XYZIJRQF'.includes(L)) { const dp = v.split('.')[1] ?? ''; if (dp.length > decimals) I('too_many_decimals', ln, w); }
      if (L === 'G') Gs.push(Number(v)); else if (L === 'M') Ms.push(Number(v)); else { if (W[L] !== undefined && L !== 'G') I('dup_word', ln, w); W[L] = Number(v); }
    }
    if (W.N !== undefined) { if (W.N <= st.lastN) I('n_order', ln, 'N' + W.N); if (W.N > 99999) I('n_big', ln, 'N' + W.N); st.lastN = W.N; }
    if (W.O !== undefined) { if (!(W.O >= 1 && W.O <= 9999)) I('o_range', ln, 'O' + W.O); if (W.O >= 8000) I('o_protected_range', ln, 'O' + W.O); }
    // M kodlari once (bilgi)
    for (const m of Ms) {
      if (m === 6) { if (st.tPending == null && W.T === undefined) I('m6_no_t', ln, body); if (st.z !== HOME_Z) I('m6_not_home', ln, body); if (st.spin) I('m6_spindle_on', ln, body); if (st.h != null) I('m6_with_g43', ln, body); st.t = W.T ?? st.tPending; st.h = null; st.positioned = false; if (protectedT.includes(st.t)) I('protected_T', ln, 'T' + st.t); }
      if (m === 3 || m === 4) { if (!(W.S > 0) && !(st.s > 0)) I('spindle_no_s', ln, body); st.spin = m; }
      if (m === 5) st.spin = null;
      if (m === 8 || m === 7) st.cool = true; if (m === 9) st.cool = false;
      if (m === 30 || m === 2) { if (st.spin) I('end_spindle_on', ln, body); if (st.cool) I('end_coolant_on', ln, body); if (st.z !== HOME_Z) I('end_not_home', ln, body); st.ended = true; }
    }
    if (W.T !== undefined) st.tPending = W.T;
    if (W.S !== undefined) { st.s = W.S; if (!(W.S > 0)) I('s_zero', ln, body); }
    if (W.F !== undefined) { st.f = W.F; st.fSec = true; if (!(W.F > 0)) I('f_zero', ln, body); }
    let motionWord = null, g28 = false, g53 = false, g80 = false, cyc = null;
    for (const g of Gs) {
      if ([0, 1, 2, 3].includes(g)) motionWord = g;
      else if (g === 90) st.g90 = true; else if (g === 91) st.g90 = false;
      else if (g === 17) st.g17 = true; else if (g === 18 || g === 19) st.g17 = false;
      else if (g === 21 || g === 94) { /* */ } else if (g === 20) I('inch', ln, body);
      else if (g === 28) g28 = true; else if (g === 53) g53 = true;
      else if (g === 40 || g === 41 || g === 42) { st.comp = g; if (g !== 40) { if (W.D === undefined) I('comp_no_d', ln, body); if (protectedD.includes(W.D)) I('protected_D', ln, 'D' + W.D); } }
      else if (g === 43) { if (W.H === undefined) I('g43_no_h', ln, body); st.h = W.H; if (protectedH.includes(W.H)) I('protected_H', ln, 'H' + W.H); if (W.Z === undefined) I('g43_no_z', ln, body); }
      else if (g === 49) st.h = null;
      else if ((g >= 54 && g <= 59 && Number.isInteger(g)) || g === 54.1) { st.wcs = g === 54.1 ? 'G54.1 P' + W.P : 'G' + g; if (protectedWcs.includes(st.wcs)) I('protected_wcs', ln, st.wcs); }
      else if (g === 80) g80 = true; else if ([73, 74, 76, 81, 82, 83, 84, 85, 86, 89].includes(g)) cyc = g;
      else if (g === 98 || g === 99) st.ret = g; else if (g === 4 || g === 5) { /* */ }
      else I('unknown_g', ln, 'G' + g);
    }
    if (g80) { st.cycle = null; st.motion = null; }
    if (g28) { if (st.g90 !== false || W.Z !== 0) I('g28_form', ln, body); if (st.comp !== 40) I('g28_with_comp', ln, body); st.z = HOME_Z; return; }
    if (g53) { st.z = HOME_Z; return; }
    const hasXYZ = W.X !== undefined || W.Y !== undefined || W.Z !== undefined;
    if (W.A !== undefined) { if (st.z !== HOME_Z) I('a_not_home', ln, body); if (hasXYZ) I('a_with_xyz', ln, body); moves.push({ t: 'a', a: W.A, line: ln }); return; }
    if (cyc != null) {
      if (st.g90 !== true) I('cycle_inc', ln, body);
      for (const k of ['Z', 'R']) if (W[k] === undefined) I('cycle_no_' + k, ln, body);
      if ([83, 73].includes(cyc) && !(W.Q > 0)) I('cycle_no_q', ln, body);
      if (cyc !== 84 && cyc !== 74 && W.F === undefined && !(st.f > 0)) I('cycle_no_f', ln, body);
      if (!(W.R > W.Z)) I('cycle_r_below_z', ln, body);
      if (st.z < W.R - 1e-9) I('cycle_init_below_r', ln, `init ${st.z} R ${W.R}`);
      if (st.h == null) I('cycle_no_g43', ln, body); if (!st.spin) I('cycle_no_spindle', ln, body);
      st.cycle = { g: cyc, Z: W.Z, R: W.R, Q: W.Q, init: st.z }; st.motion = 'cyc';
    }
    if (st.cycle && st.motion === 'cyc' && (W.X !== undefined || W.Y !== undefined || cyc != null) && motionWord == null) {
      if (W.X !== undefined) st.x = W.X; if (W.Y !== undefined) st.y = W.Y;
      if (W.Z !== undefined && cyc == null) I('cycle_z_change', ln, body);
      if (st.cycle.R < stockTop - 1e-9 && st.ret === 99 && !o.allowLowR) I('g99_below_stock', ln, body);
      moves.push({ t: 'cycle', x: st.x, y: st.y, R: st.cycle.R, Z: st.cycle.Z, init: st.cycle.init, ret: st.ret, g: st.cycle.g, line: ln });
      lastCode = 'cyc'; return;
    }
    if (motionWord != null) { if (st.cycle) I('motion_in_cycle', ln, body); st.motion = motionWord; }
    if (!hasXYZ) { if (motionWord === 2 || motionWord === 3) I('arc_no_endpoint', ln, body); return; }
    if (st.motion == null) { I('no_motion_mode', ln, body); return; }
    if (st.g90 !== true) I('not_absolute', ln, body);
    if (!st.wcs) I('no_wcs', ln, body);
    const from = { x: st.x, y: st.y, z: st.z };
    const x = W.X ?? st.x, y = W.Y ?? st.y, z = W.Z ?? st.z;
    if (x == null || y == null) I('xy_unknown', ln, body);
    if (W.Z !== undefined && st.h == null) I('z_without_g43', ln, body);
    if (st.motion === 0) {
      const dxy = from.x == null ? 0 : Math.hypot(x - from.x, y - from.y);
      if (from.z !== HOME_Z && dxy > 1e-9 && Math.min(from.z, z) < stockTop + 1e-9) I('rapid_xy_low', ln, `${body} (z ${from.z}->${z})`);
      if (from.z !== HOME_Z && dxy > 1e-9 && W.Z !== undefined && Math.abs(z - from.z) > 1e-9) I('rapid_dogleg', ln, body);
      if (z < stockTop - 1e-9) I('rapid_below_stock_top', ln, body);
      moves.push({ t: 'rapid', from, x, y, z, line: ln });
    } else {
      if (!st.spin) I('feed_no_spindle', ln, body);
      if (st.h == null) I('feed_no_g43', ln, body);
      if (!(st.f > 0)) I('feed_no_f', ln, body);
      if (!st.fSec && !o.allowModalF) I('feed_f_from_prev_section', ln, body);
      if (st.motion === 1) moves.push({ t: 'feed', from, x, y, z, f: st.f, comp: st.comp, line: ln });
      else {
        if (!st.g17) I('arc_no_g17', ln, body);
        if (W.R !== undefined) I('arc_r_word', ln, body);
        if (W.I === undefined && W.J === undefined) I('arc_no_ij', ln, body);
        const cx = from.x + (W.I ?? 0), cy = from.y + (W.J ?? 0);
        const r0 = Math.hypot(from.x - cx, from.y - cy), r1 = Math.hypot(x - cx, y - cy);
        if (Math.abs(r0 - r1) > 0.002) I('arc_radius_mismatch', ln, `${body} r0 ${r0.toFixed(4)} r1 ${r1.toFixed(4)}`);
        if (Math.hypot(x - from.x, y - from.y) < 1e-9) I('arc_full_circle', ln, body);
        moves.push({ t: 'arc', from, x, y, z, cx, cy, r: r0, cw: st.motion === 2, f: st.f, comp: st.comp, line: ln });
      }
    }
    st.x = x; st.y = y; st.z = z;
  });
  if (!sawUnverified) I('no_unverified', 0, '');
  if (!st.ended) I('no_end', lines.length, '');
  if (st.cycle) I('cycle_not_cancelled', lines.length, '');
  return { moves, issues };
}
// NC yay ornekleyici (tam daire yok sayilmaz: baslangic=bitis -> 2pi)
export function ncSamples(moves, cb, h = 0.05) {
  for (const m of moves) {
    if (m.t === 'feed' || m.t === 'rapid') {
      if (m.from.x == null || m.from.z > 1e5) continue;
      const L = Math.hypot(m.x - m.from.x, m.y - m.from.y, m.z - m.from.z); const n = Math.max(1, Math.ceil(L / h));
      const dxy = Math.hypot(m.x - m.from.x, m.y - m.from.y); const t = dxy > 1e-12 ? [(m.x - m.from.x) / dxy, (m.y - m.from.y) / dxy] : null;
      for (let i = 0; i <= n; i++) cb({ x: m.from.x + (m.x - m.from.x) * i / n, y: m.from.y + (m.y - m.from.y) * i / n, z: m.from.z + (m.z - m.from.z) * i / n, m, t });
    } else if (m.t === 'arc') {
      const a0 = Math.atan2(m.from.y - m.cy, m.from.x - m.cx), a1 = Math.atan2(m.y - m.cy, m.x - m.cx);
      let sw = m.cw ? a0 - a1 : a1 - a0; sw = ((sw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); if (sw < 1e-12) sw = 2 * Math.PI; if (m.cw) sw = -sw;
      const n = Math.max(2, Math.ceil(Math.abs(sw) * m.r / h));
      for (let i = 0; i <= n; i++) { const a = a0 + sw * i / n; const sg = sw > 0 ? 1 : -1; cb({ x: m.cx + m.r * Math.cos(a), y: m.cy + m.r * Math.sin(a), z: m.from.z + (m.z - m.from.z) * i / n, m, t: [-Math.sin(a) * sg, Math.cos(a) * sg] }); }
    }
  }
}
