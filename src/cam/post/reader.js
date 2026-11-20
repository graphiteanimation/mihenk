// Geri okuyucu: motorun uretti lehceyi IR hareketlerine geri cozer. Tanimadigi kelimede HATA verir (sessiz atlama yok).
// Dil: G0/1/2/3/4, G17, G21, G28 (G91 ile), G40/41/42, G43/49, G53, G54-59/G54.1 Pn, G73/74/80-85/89, G90/G91, G94, G98/99, G05/G05.1 (olay),
// A, M0/1/3/4/5/6/8/9/30 (+ ozellik tablosundaki sogutma kodlari, makine A kilidi, senkron kilavuz M kodu), T S F H D X Y Z I J R Q P, ",R1", N, O.
// NC'de karsiligi olmayan alanlar (kind, cycle.top, opName...) geri okunamaz: ir.js compareToolpaths bunlari yok sayar.
import { perr, resolveProps, resolveRotary } from './engine.js';
import { getPost } from './registry.js';
import { computeStats } from '../ir.js';

const LETTERS = 'NOGMXYZAIJRQPFSTHD';

function tokenize(src, lineNo) {
  const words = [];
  const re = /\s*(?:(,R)(\d+)|([A-Za-z])\s*([+-]?(?:\d+\.?\d*|\.\d+)))/y;
  let i = 0;
  const rest = () => src.slice(i);
  while (i < src.length) {
    if (/^\s*$/.test(rest())) break;
    re.lastIndex = i; const m = re.exec(src);
    if (!m) throw perr('cam.post.read_unknown_word', { line: lineNo, text: rest().trim().slice(0, 24) });
    i = re.lastIndex;
    if (m[1]) words.push({ l: ',R', v: Number(m[2]), raw: ',R' + m[2] });
    else {
      const l = m[3].toUpperCase();
      if (!LETTERS.includes(l)) throw perr('cam.post.read_unknown_word', { line: lineNo, text: m[3] + m[4] });
      words.push({ l, v: Number(m[4]), raw: l + m[4] });
    }
  }
  return words;
}

// text: NC metni; opts: {post:'mitsubishi-m80v'|..., props?, machine?}
export function readNC(text, opts = {}) {
  const post = getPost(opts.post || opts.machine?.control);
  const props = resolveProps(post, opts.machine, opts.props);
  const R = resolveRotary(opts.machine);
  const rawLines = String(text).split(/\r?\n/);
  if (rawLines.length && rawLines[rawLines.length - 1] === '') rawLines.pop();
  const lineMap = rawLines.map(() => null);
  const events = [];
  const sections = [];
  const S = {
    motion: null, x: null, y: null, z: null, f: null, rpm: null, dir: null, tool: null, pendingT: null, H: null, D: null,
    wcs: { kind: 'G54' }, aCur: 0, inc: false, comp: null, coolant: 'off', cycle: null, retrMode: null, end: false, program: { name: null, number: null }, opComment: null,
  };
  let cur = null; let pending = null; // pending: {x,y,line}
  const mcodeEq = (v, code) => code != null && String(code).toUpperCase() === 'M' + v;
  const norm360 = (a) => ((a % 360) + 360) % 360;

  const makeSection = () => ({ setup: { id: null, name: null, workOffset: { ...S.wcs }, aAngle: S.aCur, aOut: S.aCur }, comp: 'computer', compSide: null, moves: [], tool: S.tool, H: S.H, D: null, lineIdx: [] });
  const ensureSection = (ln) => { if (!cur) { cur = makeSection(); cur.opName = S.opComment; } return cur; };
  const emit = (mv, ln) => { const c = ensureSection(ln); c.moves.push(mv); const k = c.moves.length - 1; lineMap[ln - 1] = { section: sections.length, move: k }; return k; };
  const finalize = () => {
    if (!cur) return;
    const c = cur; cur = null; if (!c.moves.length) return;
    const firstZ = c.moves[0].z;
    const tp = { opId: 'rd' + sections.length, opName: c.opName || 'read', opType: 'read', tool: { number: c.tool, H: c.H, D: c.D }, rpm: S.rpm, spindleDir: S.dir === 'M4' ? 'ccw' : 'cw', coolant: S.coolant, comp: c.comp, compSide: c.compSide, clearanceZ: firstZ, retractZ: firstZ, moves: c.moves };
    tp.stats = computeStats(tp);
    sections.push({ setup: c.setup, toolpath: tp });
  };
  const fail = (code, ln, extra = {}) => { throw perr(code, { line: ln, ...extra }); };

  const finishCycle = (ln) => {
    const cy = S.cycle; if (!cy) return;
    S.cycle = null;
    if (cy.lastRetr !== 98) fail('cam.post.read_cycle_end_g99', ln);
    const mv = { t: 'cycle', cycle: cy.kind, points: cy.points, top: cy.R, bottom: cy.Z, retract: cy.R, clearance: cy.startZ, f: cy.f };
    if (cy.points.length > 1 && cy.modes.every((x) => x === 98) && cy.R < cy.startZ - 1e-9) mv.returnTo = 'clearance'; // her nokta G98: baslangic duzlemine donus
    if (cy.kind === 'fineBore') { mv.shift = cy.Q; } else if (cy.kind === 'backBore') { mv.shift = cy.Q; mv.bottom = cy.R; mv.cutTo = cy.Z; mv.top = cy.Z; mv.retract = cy.startZ; } // G87: R = alt baslangic, Z = ustte bitis, doner: baslangic duzlemi
    else if (cy.Q != null) mv.peck = cy.Q;
    if (cy.P != null) mv.dwell = cy.P;
    if (cy.kind === 'tap') {
      if (!(S.rpm > 0)) fail('cam.post.read_no_spindle', ln);
      if (props.tapMode === 'pitch') { mv.pitch = cy.f; mv.f = cy.f * S.rpm; } else { mv.pitch = cy.f / S.rpm; }
    }
    const k = emit(mv, cy.lines[0]);
    for (const l of cy.lines) lineMap[l - 1] = { section: sections.length, move: k };
    S.x = cy.points[cy.points.length - 1][0]; S.y = cy.points[cy.points.length - 1][1]; S.z = cy.startZ; S.motion = null;
  };

  const readDwell = (addr, unit, w, ln) => {
    if (addr == null || unit == null) fail('cam.post.read_prop_missing', ln, { prop: addr == null ? 'dwellAddress' : 'dwellUnit' });
    return unit === 'ms' ? w.v / 1000 : w.v;
  };

  rawLines.forEach((rawLine, idx) => {
    const ln = idx + 1;
    // yorumlar
    const cm = rawLine.match(/\(([^)]*)\)/g) || [];
    let body = rawLine.replace(/\([^)]*\)/g, ' ');
    if (/[()]/.test(body)) fail('cam.post.read_unknown_word', ln, { text: 'paren' });
    for (const c of cm) { const t = c.slice(1, -1); if (/^PROGRAM /.test(t)) S.program.name = t.slice(8); if (/^OP \d+:/.test(t)) S.opComment = t.replace(/^OP \d+:\s*/, '').replace(/\s*\[.*$/, ''); }
    body = body.trim();
    if (!body || body === '%') return;
    const words = tokenize(body, ln).filter((w) => w.l !== 'N');
    if (!words.length) return;
    if (words[0].l === 'O') { S.program.number = words[0].v; words.shift(); if (!words.length) return; }
    if (S.end) return;
    const W = (l) => words.find((w) => w.l === l);
    const Gs = words.filter((w) => w.l === 'G').map((w) => w.v);
    const Ms = words.filter((w) => w.l === 'M').map((w) => w.v);
    const has = (g) => Gs.includes(g);
    const isCycleCode = (g) => [73, 74, 76, 81, 82, 83, 84, 85, 87, 89].includes(g);

    // ---- G kodlari
    let retractEv = false, dwell = false, machineCoord = false, wantCycle = null, compReq = undefined, retrMode = null, newMotion = null;
    for (const g of Gs) {
      if (g === 0 || g === 1 || g === 2 || g === 3) newMotion = g;
      else if (g === 4) dwell = true;
      else if (g === 5 || g === 5.1) { events.push({ line: ln, ev: 'highSpeed', word: 'G' + g, p: W('P')?.v ?? W('Q')?.v }); }
      else if (g === 17 || g === 21 || g === 94) { /* sabit lehce */ }
      else if (g === 90) S.inc = false;
      else if (g === 91) S.inc = true;
      else if (g === 28) retractEv = true;
      else if (g === 53) machineCoord = true;
      else if (g === 40) compReq = null;
      else if (g === 41) compReq = 'left';
      else if (g === 42) compReq = 'right';
      else if (g === 43) { const h = W('H'); if (!h) fail('cam.post.read_missing_word', ln, { word: 'H' }); S.H = h.v; if (cur && cur.H == null) cur.H = h.v; }
      else if (g === 49) S.H = null;
      else if (g >= 54 && g <= 59 && Number.isInteger(g)) S.wcs = { kind: 'G' + g };
      else if (g === 54.1) { const p = W('P'); if (!p) fail('cam.post.read_missing_word', ln, { word: 'P' }); S.wcs = { kind: 'G54.1', p: p.v }; }
      else if (isCycleCode(g)) wantCycle = g;
      else if (g === 80) { finishCycle(ln); S.motion = null; }
      else if (g === 98 || g === 99) retrMode = g;
      else fail('cam.post.read_unknown_word', ln, { text: 'G' + g });
    }
    // ---- M kodlari
    let endProg = false, tChange = false;
    for (const m of Ms) {
      if (m === 0 || m === 1) events.push({ line: ln, ev: m === 0 ? 'stop' : 'optionalStop' });
      else if (m === 3 || m === 4) { S.dir = 'M' + m; }
      else if (m === 5) { S.dir = null; }
      else if (m === 6) tChange = true;
      else if (m === 30) endProg = true;
      else if (mcodeEq(m, props.coolantCodes?.flood)) S.coolant = 'flood';
      else if (mcodeEq(m, props.coolantCodes?.mist)) S.coolant = 'mist';
      else if (mcodeEq(m, props.coolantCodes?.air)) S.coolant = 'air';
      else if (mcodeEq(m, props.coolantCodes?.through)) S.coolant = 'through';
      else if (mcodeEq(m, props.coolantCodes?.off)) S.coolant = 'off';
      else if (R && (mcodeEq(m, R.clamp.lock) || mcodeEq(m, R.clamp.unlock))) events.push({ line: ln, ev: mcodeEq(m, R.clamp.lock) ? 'aLock' : 'aUnlock' });
      else if (props.rigidTapM && mcodeEq(m, props.rigidTapM)) events.push({ line: ln, ev: 'rigidTap' });
      else fail('cam.post.read_unknown_word', ln, { text: 'M' + m });
    }
    if (endProg) { finishCycle(ln); finalize(); S.end = true; return; }
    const sW = W('S'); if (sW) S.rpm = sW.v;
    const tW = W('T'); if (tW) S.pendingT = tW.v;
    const fW = W('F'); if (fW && !(wantCycle != null)) S.f = fW.v;
    if (tChange) { if (S.pendingT == null) fail('cam.post.read_missing_word', ln, { word: 'T' }); S.tool = S.pendingT; events.push({ line: ln, ev: 'toolChange', tool: S.tool }); }
    if (S.cycle == null && wantCycle == null && words.some((w) => w.l === ',R')) fail('cam.post.read_unknown_word', ln, { text: ',R' });

    const X = W('X'), Y = W('Y'), Z = W('Z'), A = W('A'), I = W('I'), J = W('J');
    const hasXYZ = !!(X || Y || Z);
    // ---- G28 / G53 guvenli geri cekilme
    if (retractEv) {
      if (!S.inc || !Z || Z.v !== 0 || X || Y) fail('cam.post.read_bad_retract', ln);
      // bolum siniri: F modal tasinmaz (post her bolumde F'yi yeniden yazar; yazmazsa okuyucu hata verir, V-04)
      finishCycle(ln); finalize(); S.z = null; S.motion = null; S.f = null; pending = null; events.push({ line: ln, ev: 'safeRetract', method: 'G28' });
      return;
    }
    if (machineCoord) {
      if (!Z || X || Y || newMotion !== 0) fail('cam.post.read_bad_retract', ln);
      finishCycle(ln); finalize(); S.z = null; S.motion = null; S.f = null; pending = null; events.push({ line: ln, ev: 'safeRetract', method: 'G53', z: Z.v });
      return;
    }
    if (S.inc && (hasXYZ || newMotion != null)) fail('cam.post.read_incremental', ln);
    // ---- dwell
    if (dwell) {
      const a = props.dwellAddress; const w = a ? W(a) : null;
      if (a == null || props.dwellUnit == null) fail('cam.post.read_prop_missing', ln, { prop: a == null ? 'dwellAddress' : 'dwellUnit' });
      if (!w) fail('cam.post.read_missing_word', ln, { word: a });
      emit({ t: 'dwell', s: readDwell(a, props.dwellUnit, w, ln) }, ln);
      S.motion = null; return;
    }
    // ---- A indeksleme
    if (A) {
      if (hasXYZ) fail('cam.post.read_a_with_xyz', ln);
      if (!R) fail('cam.post.read_no_a_axis', ln);
      S.aCur = A.v; events.push({ line: ln, ev: 'aIndex', a: A.v });
      if (cur && cur.moves.length) fail('cam.post.read_a_inside_section', ln);
      return;
    }
    // ---- delik cevrimi
    if (wantCycle != null || S.cycle) {
      if (wantCycle != null) {
        finishCycle(ln);
        if (S.z == null) fail('cam.post.read_no_position', ln);
        const kind = { 81: 'drill', 82: 'drill', 83: 'peck', 73: 'chipbreak', 84: 'tap', 74: 'tap', 85: 'ream', 89: 'bore', 76: 'fineBore', 87: 'backBore' }[wantCycle];
        const Rw = W('R'), Zw = Z, Fw = W('F'), Qw = W('Q');
        if (!Rw || !Zw || !Fw) fail('cam.post.read_missing_word', ln, { word: !Rw ? 'R' : !Zw ? 'Z' : 'F' });
        let P = null;
        if (wantCycle === 76 || wantCycle === 87) { if (!Qw) fail('cam.post.read_missing_word', ln, { word: 'Q' }); const a = props.cycleDwellAddress; const pw = a ? W(a) : null; if (pw) { if (props.cycleDwellUnit == null) fail('cam.post.read_prop_missing', ln, { prop: 'cycleDwellUnit' }); P = readDwell(a, props.cycleDwellUnit, pw, ln); } }
        if (wantCycle === 82 || wantCycle === 89) { const a = props.cycleDwellAddress; const pw = a ? W(a) : null; if (a == null || props.cycleDwellUnit == null) fail('cam.post.read_prop_missing', ln, { prop: 'cycleDwellAddress' }); if (!pw) fail('cam.post.read_missing_word', ln, { word: a }); P = readDwell(a, props.cycleDwellUnit, pw, ln); }
        if ((wantCycle === 83 || wantCycle === 73) && !Qw) fail('cam.post.read_missing_word', ln, { word: 'Q' });
        if (wantCycle === 84 || wantCycle === 74) { if (!!words.find((w) => w.l === ',R') !== !!props.tapR1) fail('cam.post.read_tap_r1', ln); }
        S.cycle = { kind, code: wantCycle, Z: Zw.v, R: Rw.v, Q: Qw ? Qw.v : null, P, f: Fw.v, points: [], lines: [], startZ: S.z, lastRetr: null, modes: [] };
        S.f = Fw.v;
      }
      const cy = S.cycle;
      if (retrMode) cy.lastRetr = retrMode; else if (cy.lastRetr == null) fail('cam.post.read_missing_word', ln, { word: 'G98' });
      if (newMotion != null || compReq !== undefined) fail('cam.post.read_cycle_mix', ln);
      if (!X && !Y && wantCycle == null) { if (retrMode && !hasXYZ) { /* sadece mod degisimi */ } else fail('cam.post.read_missing_word', ln, { word: 'X' }); }
      if (X) S.x = X.v; if (Y) S.y = Y.v;
      if (X || Y || wantCycle != null) { if (S.x == null || S.y == null) fail('cam.post.read_no_position', ln); cy.points.push([S.x, S.y]); cy.lines.push(ln); cy.modes.push(cy.lastRetr); }
      return;
    }
    if (retrMode) { /* hareketsiz G98/G99 */ }
    // ---- serbest hareket
    if (newMotion != null) S.motion = newMotion;
    if (compReq !== undefined && (hasXYZ || newMotion != null)) { /* asagida */ }
    // bitissiz G2/G3 (yalniz I/J): kontrolde TAM DAIRE yurutulur; motor bunu asla uretmez -> hata (sessiz atlama yok, V-05b)
    const arcMode = newMotion ?? S.motion;
    if ((arcMode === 2 || arcMode === 3) && (I || J) && !X && !Y) fail('cam.post.read_full_circle', ln);
    if (!hasXYZ) {
      if (I || J) fail('cam.post.read_unknown_word', ln, { text: I ? 'I' : 'J' });
      if (compReq) fail('cam.post.read_comp_no_move', ln);
      return; // durum satirlari (S M3, T M6, G54 vb.)
    }
    if (S.motion == null) fail('cam.post.read_no_motion_mode', ln);
    // telafi gecisi
    if (compReq !== undefined) {
      const turnOn = compReq !== null;
      const c = ensureSection(ln);
      if (turnOn) {
        const d = W('D'); if (!d) fail('cam.post.read_missing_word', ln, { word: 'D' });
        c.comp = 'wear'; c.compSide = compReq; c.D = d.v; S.D = d.v;
      }
      emit({ t: 'comp', on: turnOn }, ln);
      S.comp = compReq;
    } else if (W('D')) fail('cam.post.read_unknown_word', ln, { text: 'D' });
    if (S.motion === 0) {
      if (X) S.x = X.v; if (Y) S.y = Y.v;
      if (S.z == null) {
        if (Z) {
          if (S.x == null && !pending) fail('cam.post.read_no_position', ln);
          const px = pending ? pending.x : S.x, py = pending ? pending.y : S.y;
          const k = emit({ t: 'rapid', x: px, y: py, z: Z.v }, ln);
          if (pending) lineMap[pending.line - 1] = { section: sections.length, move: k };
          pending = null; S.z = Z.v;
        } else {
          if (pending) fail('cam.post.read_no_position', ln);
          pending = { x: S.x, y: S.y, line: ln };
        }
        return;
      }
      if (Z) S.z = Z.v;
      emit({ t: 'rapid', x: S.x, y: S.y, z: S.z }, ln);
      return;
    }
    if (S.z == null || S.x == null) fail('cam.post.read_no_position', ln);
    const sx = S.x, sy = S.y;
    if (X) S.x = X.v; if (Y) S.y = Y.v; if (Z) S.z = Z.v;
    if (S.f == null) fail('cam.post.read_missing_word', ln, { word: 'F' });
    if (S.motion === 1) emit({ t: 'feed', x: S.x, y: S.y, z: S.z, f: S.f, kind: 'cut' }, ln);
    else emit({ t: 'arc', x: S.x, y: S.y, z: S.z, i: I ? I.v : 0, j: J ? J.v : 0, dir: S.motion === 2 ? 'cw' : 'ccw', f: S.f, kind: 'cut' }, ln);
    void sx; void sy;
  });
  // M30 satirinda hareket yoksa
  finishCycle(rawLines.length);
  finalize();
  return { program: { name: S.program.name || 'READ', number: S.program.number, machine: opts.machine?.id ?? null, units: 'mm', sections }, events, lineMap };
}
