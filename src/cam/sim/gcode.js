// WP-13: G-code uzerinden simulasyon. Genel ISO/Fanuc tarzi NC metnini (herhangi bir posttan ya da elle yazilmis) IR programina cevirir;
// sonuc dogrudan simulate()/createSim() girdisidir. Post okuyucusundan (post/reader.js: yalniz kendi lehcesini birebir geri okur) ayridir:
// burada amac tezgahin YAPACAGI hareketi canlandirmaktir; anlamini bilmedigi her kelime HATA verir (sessiz atlama yok), hareket
// etkisi olmayan M kodlari (sogutma, kilit, ...) olay olarak kaydedilip yok sayilir.
// Desteklenen: G0/G1/G2/G3 (IJK ya da R; tam daire), G17/G18/G19 (G18/G19 yaylari dogru parcalara bolunur), G90/G91, G20/G21,
// G4, G28/G53 (Z: guvenli geri cekilme), G40/G41/G42 (D), G43/G49 (H), G54-G59/G54.1 P, G80-G89/G73/G74/G76 (G98/G99, G91'de
// artimli R/Z; G87 R = alt baslangic, Z = ustte bitis), G94, G5/G5.1/G8/G9/G61/G64 (yok sayilir), T/M6 takim degisimi, S/M3/M4/M5, A indeksleme (3+1), M0/1/2/30.
// Desteklenmeyen (hata): makro/degisken, alt program (M98/M99), G10/G52/G68/G92/G51, ',R'/',C' kose kelimeleri, B/C/U/V/W
// eksenleri, eszamanli A (A ile ayni blokta XYZ ya da G1 A), G90.1/G91.1 yay merkezi kipi. G76/G87: Q = kayma (IR shift);
// kayma yonu tezgah parametresidir (NC'de yok; sim'de gerekmez: sim/index.js oriented()).
// Bolum: takim degisimi, WCS degisimi, A acisi degisimi ve G28/G53 geri cekilmesi yeni bolum baslatir. Bolumun Z'si bilinmeden
// ilk konumlanma "ev" yuksekligindedir: opts.homeZ, yoksa bolumdeki en yuksek programlanmis Z (muhafazakar degil: ev Z'si bilinmez).
// opts: { tools: {[T]: takim geometrisi (IR tool alanlari + shaftDia/holder)}, setups?: [{id, workOffset, aAngle, ...}] (WCS + A ile
//         eslenir; stockBox/frame/fixtures sim'e tasinir), homeZ?, tapMode?: 'feed'|'pitch' (G84 F anlami), name?,
//         belowStock?: mm (NC islem payini tasimaz: boydan boya delik/kontur icin stok alti izinli pay; yoksa stok alti inis engel) }
// Donus: { program, events: [{line, ev, ...}], lineMap: [{section, move} | null] (satir basina) }.
import { KErr } from '../../shared/errors.js';
import { computeStats, ARC_MIN_CHORD } from '../ir.js';

const gerr = (code, params = {}) => new KErr(code, params);
const LETTERS = 'NOGMXYZAIJKRQPFSTHDL';
const CYC = { 81: 'drill', 82: 'drill', 83: 'peck', 73: 'chipbreak', 84: 'tap', 74: 'tap', 85: 'ream', 86: 'bore', 88: 'bore', 89: 'bore', 76: 'fineBore', 87: 'backBore' }; // WP-14 IR: fineBore (G76), backBore (G87)
const IGNORED_G = new Set([5, 5.1, 8, 9, 15, 61, 61.1, 64, 94, 17.1]);

function tokenize(src, ln) {
  const words = []; const re = /\s*([A-Za-z])\s*([+-]?(?:\d+\.?\d*|\.\d+))/y; let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    const cm = /\s*,([RC])\s*([+-]?(?:\d+\.?\d*|\.\d+))/y; cm.lastIndex = i; const c2 = cm.exec(src);
    if (c2) { words.push({ l: ',' + c2[1].toUpperCase(), v: Number(c2[2]) }); i = cm.lastIndex; continue; }
    if (/^\s*[,#[=]/.test(src.slice(i))) throw gerr('cam.gcode.unsupported', { line: ln, what: src.slice(i).trim().slice(0, 16) });
    re.lastIndex = i; const m = re.exec(src);
    if (!m) throw gerr('cam.gcode.bad_word', { line: ln, text: src.slice(i).trim().slice(0, 16) });
    i = re.lastIndex; const l = m[1].toUpperCase();
    if (!LETTERS.includes(l)) throw gerr('cam.gcode.unsupported', { line: ln, what: m[1] + m[2] });
    words.push({ l, v: Number(m[2]) });
  }
  return words;
}

export function gcodeToProgram(text, opts = {}) {
  const tools = opts.tools || {};
  const lines = String(text).split(/\r?\n/);
  const events = []; const lineMap = lines.map(() => null); const sections = [];
  const S = { motion: null, plane: 17, inc: false, scale: 1, x: null, y: null, z: null, f: null, rpm: null, dir: 'cw', T: null, pendT: null, H: null, D: null,
    wcs: { kind: 'G54' }, a: 0, comp: null, cyc: null, retMode: 98, end: false };
  let cur = null;
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const fail = (code, ln, p = {}) => { throw gerr(code, { line: ln, ...p }); };
  const wcsKey = (w) => (w.kind === 'G54.1' ? 'G54.1P' + w.p : w.kind);
  const setupFor = () => {
    const a = S.a; const hit = (opts.setups || []).find((s) => s.workOffset && wcsKey(s.workOffset) === wcsKey(S.wcs) && near(((s.aAngle ?? 0) % 360 + 360) % 360, ((a % 360) + 360) % 360));
    if (hit) return hit;
    return { id: wcsKey(S.wcs) + (near(a, 0) ? '' : '@A' + a), name: wcsKey(S.wcs), workOffset: { ...S.wcs }, aAngle: near(a, 0) ? null : a };
  };
  const open = (ln) => {
    if (cur) return cur;
    if (S.T == null) fail('cam.gcode.no_tool', ln);
    const tg = tools[S.T]; if (!tg) fail('cam.gcode.tool_unknown', ln, { tool: S.T });
    if (!(S.rpm > 0)) fail('cam.gcode.no_spindle', ln);
    cur = { setup: setupFor(), tool: { ...tg, number: S.T, H: S.H ?? tg.H ?? S.T }, rpm: S.rpm, dir: S.dir, moves: [], lines: [], comp: null, compSide: null, D: null, first: true };
    return cur;
  };
  const emit = (mv, ln) => { const c = open(ln); c.moves.push(mv); c.lines.push(ln); lineMap[ln - 1] = { section: sections.length, move: c.moves.length - 1 }; };
  const close = () => {
    if (!cur) return; const c = cur; cur = null; if (!c.moves.length) return;
    if (S.comp) throw gerr('cam.gcode.comp_left_on', { line: c.lines[c.lines.length - 1] });
    let zmax = -Infinity; for (const m of c.moves) { if (m.z != null && m.z > zmax) zmax = m.z; if (m.t === 'cycle' && m.clearance > zmax) zmax = m.clearance; }
    const home = Number.isFinite(opts.homeZ) ? Math.max(opts.homeZ, zmax) : zmax;
    for (const m of c.moves) { if (m.z === null) m.z = home; if (m.t === 'cycle' && m.clearance === null) m.clearance = home; }
    const last = c.moves[c.moves.length - 1]; const lp = last.t === 'cycle' ? { x: last.points.at(-1)[0], y: last.points.at(-1)[1], z: last.clearance } : last;
    if (!(lp.z >= home - 1e-9)) { c.moves.push({ t: 'rapid', x: lp.x, y: lp.y, z: home }); }
    const tp = { opId: 'nc' + sections.length, opName: 'NC ' + (c.lines[0] ?? ''), opType: 'gcode', tool: c.tool, rpm: c.rpm, spindleDir: c.dir, coolant: 'off', comp: c.comp ? 'wear' : 'computer', compSide: c.compSide, clearanceZ: home, retractZ: home, moves: c.moves, meta: { ncLines: c.lines, ...(opts.belowStock > 0 ? { belowStock: opts.belowStock } : {}) } };
    if (c.comp) tp.tool = { ...tp.tool, D: c.D };
    tp.stats = computeStats(tp);
    sections.push({ setup: c.setup, toolpath: tp });
  };
  // bilinen konuma (x,y) ilk hareket: bolum basinda ev yuksekliginden
  const ensureStart = (ln) => {
    const c = open(ln);
    if (c.first) { c.first = false; if (S.x == null || S.y == null) fail('cam.gcode.no_position', ln); emit({ t: 'rapid', x: S.x, y: S.y, z: S.z }, ln); }
  };
  const finishCycle = () => { S.cyc = null; };

  lines.forEach((raw, idx) => {
    const ln = idx + 1; if (S.end) return;
    let body = raw.replace(/\([^)]*\)/g, ' ');
    const sc = body.indexOf(';'); if (sc >= 0) body = body.slice(0, sc);
    body = body.trim(); if (/[()]/.test(body)) fail('cam.gcode.bad_word', ln, { text: '(' });
    if (!body || body === '%') return;
    if (body[0] === '/') body = body.slice(1).trim(); // blok atlama: tezgah anahtarina bagli; muhafazakar: yurutulur
    if (/^O\d+/i.test(body)) body = body.replace(/^O\d+/i, '').trim();
    if (!body) return;
    const words = tokenize(body, ln).filter((w) => w.l !== 'N'); if (!words.length) return;
    const W = (l) => { const ws = words.filter((w) => w.l === l); if (ws.length > 1 && l !== 'G' && l !== 'M') fail('cam.gcode.bad_word', ln, { text: l + ' x2' }); return ws[0]; };
    const Gs = words.filter((w) => w.l === 'G').map((w) => w.v), Ms = words.filter((w) => w.l === 'M').map((w) => w.v);
    if (W('O')) fail('cam.gcode.bad_word', ln, { text: 'O' });
    let newMotion = null, retract = false, machineCoord = false, compReq, wantCyc = null, dwell = false;
    for (const g of Gs) {
      if (g === 0 || g === 1 || g === 2 || g === 3) newMotion = g;
      else if (g === 17 || g === 18 || g === 19) S.plane = g;
      else if (g === 90) S.inc = false; else if (g === 91) S.inc = true;
      else if (g === 20) S.scale = 25.4; else if (g === 21) S.scale = 1;
      else if (g === 4) dwell = true;
      else if (g === 28) retract = true; else if (g === 53) machineCoord = true;
      else if (g === 40) compReq = null; else if (g === 41) compReq = 'left'; else if (g === 42) compReq = 'right';
      else if (g === 43) { const h = W('H'); if (!h) fail('cam.gcode.missing_word', ln, { word: 'H' }); S.H = h.v; if (cur) cur.tool.H = h.v; }
      else if (g === 49) { /* boy telafisi iptali: geri cekilmede */ }
      else if (g >= 54 && g <= 59 && Number.isInteger(g)) { const w = { kind: 'G' + g }; if (wcsKey(w) !== wcsKey(S.wcs)) { close(); S.wcs = w; } }
      else if (g === 54.1) { const p = W('P'); if (!p) fail('cam.gcode.missing_word', ln, { word: 'P' }); const w = { kind: 'G54.1', p: p.v }; if (wcsKey(w) !== wcsKey(S.wcs)) { close(); S.wcs = w; } }
      else if (g === 80) finishCycle();
      else if (g === 98 || g === 99) S.retMode = g;
      else if (CYC[g]) wantCyc = g;
      else if (IGNORED_G.has(g)) { /* hareketi etkilemez */ }
      else fail('cam.gcode.unsupported', ln, { what: 'G' + g });
    }
    let endProg = false, tChange = false;
    for (const m of Ms) {
      if (m === 3) S.dir = 'cw'; else if (m === 4) S.dir = 'ccw'; else if (m === 5) { /* durus */ }
      else if (m === 6) tChange = true; else if (m === 30 || m === 2) endProg = true;
      else if (m === 98 || m === 99) fail('cam.gcode.unsupported', ln, { what: 'M' + m });
      else events.push({ line: ln, ev: 'mcode', m });
    }
    if (W('L') && W('L').v !== 1) fail('cam.gcode.unsupported', ln, { what: 'L' + W('L').v });
    // ',R' / ',C': kose yuvarlatma/pah (geometri) desteklenmez; kilavuz cevrimindeki ',R' (senkron kilavuz secimi) yalniz olay
    for (const w of words) if (w.l[0] === ',') { if (w.l === ',R' && (wantCyc === 84 || wantCyc === 74)) events.push({ line: ln, ev: 'tapMode', word: ',R' + w.v }); else fail('cam.gcode.unsupported', ln, { what: w.l + w.v }); }
    const sw = W('S'); if (sw) { if (cur && cur.moves.length && sw.v !== S.rpm) close(); S.rpm = sw.v; }
    const tw = W('T'); if (tw) S.pendT = tw.v;
    if (tChange) { if (S.pendT == null) fail('cam.gcode.missing_word', ln, { word: 'T' }); close(); finishCycle(); S.T = S.pendT; S.H = null; S.x = S.y = S.z = null; events.push({ line: ln, ev: 'toolChange', tool: S.T }); }
    const sc1 = (w) => (w ? w.v * S.scale : null);
    const X = sc1(W('X')), Y = sc1(W('Y')), Z = sc1(W('Z')), A = W('A'), I = sc1(W('I')), J = sc1(W('J')), K = sc1(W('K')), R = sc1(W('R'));
    const fw = W('F'); if (fw && wantCyc == null) S.f = fw.v * S.scale;
    const hasXYZ = X != null || Y != null || Z != null;
    if (endProg) { close(); S.end = true; return; }
    if (retract || machineCoord) { // guvenli geri cekilme: Z eve; XY verilirse konum bilinmez olur
      if (A) fail('cam.gcode.unsupported', ln, { what: 'A' });
      if (retract && !S.inc && Z != null && cur && !cur.first) { ensureStart(ln); emit({ t: 'rapid', x: S.x, y: S.y, z: Z }, ln); } // G90 G28: ara nokta
      close(); finishCycle(); S.z = null; if (X != null || Y != null) { S.x = null; S.y = null; }
      events.push({ line: ln, ev: 'retract', method: retract ? 'G28' : 'G53' }); return;
    }
    if (dwell) return; // bekleme: hareketsiz
    if (A) {
      if (hasXYZ || newMotion === 1 || newMotion === 2 || newMotion === 3 || (newMotion == null && S.motion !== 0 && S.motion != null)) fail('cam.gcode.a_simultaneous', ln);
      const na = S.inc ? S.a + A.v : A.v; if (!near(na, S.a)) { close(); S.a = na; } events.push({ line: ln, ev: 'aIndex', a: na });
      if (newMotion != null) S.motion = newMotion; return;
    }
    // ---- delik cevrimi
    if (wantCyc != null || (S.cyc && hasXYZ && newMotion == null)) {
      if (compReq !== undefined || S.comp) fail('cam.gcode.cycle_in_comp', ln);
      if (newMotion != null && wantCyc == null) { finishCycle(); }
      else {
        if (wantCyc != null) {
          if (S.z == null) fail('cam.gcode.no_position', ln);
          const prev = S.cyc; const init = prev ? prev.init : S.z;
          S.cyc = { code: wantCyc, init, R: prev?.R ?? null, Z: prev?.Z ?? null, Q: prev?.Q ?? null, f: prev?.f ?? S.f };
        }
        const cy = S.cyc;
        const Qw = W('Q'); if (Qw) cy.Q = Qw.v * S.scale; if (fw) cy.f = fw.v * S.scale;
        if (R != null) cy.R = S.inc ? cy.init + R : R;
        if (Z != null) cy.Z = S.inc ? (cy.R ?? cy.init) + Z : Z;
        if (cy.R == null || cy.Z == null) fail('cam.gcode.missing_word', ln, { word: cy.R == null ? 'R' : 'Z' });
        if (!(cy.f > 0)) fail('cam.gcode.missing_word', ln, { word: 'F' });
        if ((cy.code === 83 || cy.code === 73 || cy.code === 76 || cy.code === 87) && !(cy.Q > 0)) fail('cam.gcode.missing_word', ln, { word: 'Q' });
        if (S.x == null || S.y == null) { if (X == null || Y == null) fail('cam.gcode.no_position', ln); }
        const px = X != null ? (S.inc ? S.x + X : X) : S.x, py = Y != null ? (S.inc ? S.y + Y : Y) : S.y;
        ensureStartXY(ln, px, py);
        const kind = CYC[cy.code];
        if (kind === 'backBore') { // G87: R = alttaki baslangic, Z = ustte bitis (Z > R); yalniz G98 (baslangic duzlemine doner)
          if (!(cy.Z > cy.R) || S.retMode !== 98 || !(cy.Z < S.z)) fail('cam.gcode.cycle_heights', ln);
          emit({ t: 'cycle', cycle: kind, points: [[px, py]], top: cy.Z, bottom: cy.R, cutTo: cy.Z, retract: S.z, clearance: S.z, f: cy.f, shift: cy.Q }, ln);
          S.x = px; S.y = py; if (!near(cy.init, S.z)) { emit({ t: 'rapid', x: px, y: py, z: cy.init }, ln); S.z = cy.init; }
          return;
        }
        if (!(cy.Z < cy.R)) fail('cam.gcode.cycle_heights', ln);
        if (cy.R > S.z + 1e-9) fail('cam.gcode.cycle_heights', ln);
        // her nokta ayri IR cevrimi: baslangic = bulunulan Z (G99 sonrasi R), IR noktadan sonra oraya doner; tezgahin donus duzlemi
        // (G98: ilk cevrim blogundaki baslangic Z'si, G99: R) farkliysa ayni sutunda dusey hizli eklenir.
        const mv = { t: 'cycle', cycle: kind, points: [[px, py]], top: cy.R, bottom: cy.Z, retract: cy.R, clearance: S.z, f: cy.f };
        if (kind === 'peck' || kind === 'chipbreak') mv.peck = cy.Q;
        if (kind === 'fineBore') mv.shift = cy.Q;
        if (kind === 'tap') { if (opts.tapMode === 'pitch') { mv.pitch = cy.f; mv.f = cy.f * S.rpm; } else mv.pitch = cy.f / S.rpm; }
        emit(mv, ln);
        S.x = px; S.y = py;
        const back = S.retMode === 99 ? cy.R : cy.init;
        if (!near(back, S.z)) { emit({ t: 'rapid', x: px, y: py, z: back }, ln); S.z = back; }
        return;
      }
    }
    if (S.cyc && newMotion != null) finishCycle();
    if (newMotion != null) S.motion = newMotion;
    if (!hasXYZ) {
      if (I != null || J != null || K != null || R != null) fail('cam.gcode.bad_word', ln, { text: 'IJKR' });
      if (compReq || (compReq === null && S.comp)) fail('cam.gcode.comp_no_move', ln); // etkin olmayan telafinin G40 iptali: islemsiz
      return;
    }
    if (S.motion == null) fail('cam.gcode.no_motion_mode', ln);
    const nx = X != null ? (S.inc ? (S.x == null ? fail('cam.gcode.no_position', ln) : S.x + X) : X) : S.x;
    const ny = Y != null ? (S.inc ? (S.y == null ? fail('cam.gcode.no_position', ln) : S.y + Y) : Y) : S.y;
    const nz = Z != null ? (S.inc ? (S.z == null ? fail('cam.gcode.no_position', ln) : S.z + Z) : Z) : S.z;
    if (S.motion === 0) {
      if (compReq !== undefined) fail('cam.gcode.comp_on_rapid', ln);
      if (S.comp) fail('cam.gcode.rapid_in_comp', ln);
      const c = open(ln);
      if (c.first) { // bolum basi: XY bilinmeden Z verilirse hata; Z bilinmiyorsa ev yuksekligi
        if (nx == null || ny == null) fail('cam.gcode.no_position', ln);
        c.first = false; emit({ t: 'rapid', x: nx, y: ny, z: S.z }, ln); // S.z null -> ev
        if (nz != null && !(S.z != null && near(nz, S.z))) emit({ t: 'rapid', x: nx, y: ny, z: nz }, ln);
      } else emit({ t: 'rapid', x: nx, y: ny, z: nz }, ln);
      S.x = nx; S.y = ny; S.z = nz ?? S.z; return;
    }
    if (S.x == null || S.y == null || S.z == null || nz == null) fail('cam.gcode.no_position', ln);
    if (!(S.f > 0)) fail('cam.gcode.missing_word', ln, { word: 'F' });
    ensureStart(ln);
    const kind = compReq !== undefined ? 'lead' : 'cut';
    if (compReq !== undefined) {
      if (S.motion !== 1) fail('cam.gcode.comp_on_arc', ln);
      const c = cur;
      if (compReq) { const d = W('D'); if (!d) fail('cam.gcode.missing_word', ln, { word: 'D' }); if (c.compSide && c.compSide !== compReq) fail('cam.gcode.unsupported', ln, { what: 'G41/G42' }); c.comp = true; c.compSide = compReq; c.D = d.v; }
      if ((S.comp || null) !== compReq) emit({ t: 'comp', on: !!compReq }, ln);
      S.comp = compReq;
    }
    if (S.motion === 1) emit({ t: 'feed', x: nx, y: ny, z: nz, f: S.f, kind }, ln);
    else arcMoves(ln, { x: S.x, y: S.y, z: S.z }, { x: nx, y: ny, z: nz }, { I, J, K, R }, S.motion === 2 ? 'cw' : 'ccw');
    S.x = nx; S.y = ny; S.z = nz;
  });
  if (S.cyc) finishCycle();
  close();
  if (!sections.length) throw gerr('cam.gcode.empty', {});
  const program = { name: opts.name || 'NC', number: null, machine: null, units: 'mm', sections };
  return { program, events, lineMap };

  function ensureStartXY(ln, px, py) {
    const c = open(ln);
    if (c.first) { c.first = false; emit({ t: 'rapid', x: px, y: py, z: S.z }, ln); S.x = px; S.y = py; return; }
    if (S.x !== px || S.y !== py) { emit({ t: 'rapid', x: px, y: py, z: S.z }, ln); S.x = px; S.y = py; }
  }
  // yay: duzlem koordinatlari (a, b, eksen c); G17 (x,y,z), G18 (z,x,y), G19 (y,z,x). Her duzlemde normal ekrandan disari, G2 = saat yonu.
  function arcMoves(ln, p0, p1, w, dir) {
    const pl = S.plane; const ax = pl === 17 ? ['x', 'y', 'z'] : pl === 18 ? ['z', 'x', 'y'] : ['y', 'z', 'x'];
    const off = pl === 17 ? [w.I, w.J] : pl === 18 ? [w.K, w.I] : [w.J, w.K];
    const a0 = p0[ax[0]], b0 = p0[ax[1]], a1 = p1[ax[0]], b1 = p1[ax[1]];
    let ca, cb; const chord = Math.hypot(a1 - a0, b1 - b0);
    if (w.R != null) {
      if (chord < 1e-9) fail('cam.gcode.arc_bad', ln);
      const r = Math.abs(w.R); const h2 = r * r - (chord / 2) * (chord / 2);
      if (h2 < -1e-6 * r * r - 1e-6) fail('cam.gcode.arc_bad', ln);
      const h = Math.sqrt(Math.max(0, h2)), ma = (a0 + a1) / 2, mb = (b0 + b1) / 2, ua = (a1 - a0) / chord, ub = (b1 - b0) / chord;
      let s = dir === 'ccw' ? 1 : -1; if (w.R < 0) s = -s; ca = ma - ub * h * s; cb = mb + ua * h * s;
    } else {
      if (off[0] == null && off[1] == null) fail('cam.gcode.missing_word', ln, { word: 'IJK' });
      ca = a0 + (off[0] ?? 0); cb = b0 + (off[1] ?? 0);
    }
    const r0 = Math.hypot(a0 - ca, b0 - cb), r1 = Math.hypot(a1 - ca, b1 - cb);
    if (!(r0 > 1e-9) || Math.abs(r0 - r1) > Math.max(0.005, 1e-4 * r0)) fail('cam.gcode.arc_radius', ln, { r0: Math.round(r0 * 1e4) / 1e4, r1: Math.round(r1 * 1e4) / 1e4 });
    const full = chord < 5e-4; // kontrol cozunurlugunde baslangic = bitis: tam daire
    let t0 = Math.atan2(b0 - cb, a0 - ca), t1 = Math.atan2(b1 - cb, a1 - ca); let sw = t1 - t0;
    if (dir === 'ccw') { while (sw <= 0) sw += 2 * Math.PI; while (sw > 2 * Math.PI) sw -= 2 * Math.PI; } else { while (sw >= 0) sw -= 2 * Math.PI; while (sw < -2 * Math.PI) sw += 2 * Math.PI; }
    if (full) sw = dir === 'ccw' ? 2 * Math.PI : -2 * Math.PI;
    const c0 = p0[ax[2]], c1 = p1[ax[2]];
    const pt = (t, c) => { const q = {}; q[ax[0]] = ca + r0 * Math.cos(t); q[ax[1]] = cb + r0 * Math.sin(t); q[ax[2]] = c; return q; };
    if (pl === 17 && !full && chord >= ARC_MIN_CHORD) { emit({ t: 'arc', x: p1.x, y: p1.y, z: p1.z, i: ca - p0.x, j: cb - p0.y, dir, f: S.f, kind: 'cut' }, ln); return; }
    if (pl === 17 && full) { // iki yarim yay
      const m = pt(t0 + sw / 2, (c0 + c1) / 2);
      emit({ t: 'arc', x: m.x, y: m.y, z: m.z, i: ca - p0.x, j: cb - p0.y, dir, f: S.f, kind: 'cut' }, ln);
      emit({ t: 'arc', x: p1.x, y: p1.y, z: p1.z, i: ca - m.x, j: cb - m.y, dir, f: S.f, kind: 'cut' }, ln); return;
    }
    // G18/G19 (ya da cok kisa yay): kiris hatasi <= 0,002 mm dogru parcalari
    const tol = 0.002, dmax = r0 > tol ? 2 * Math.acos(Math.max(0, 1 - tol / r0)) : Math.PI;
    const n = Math.max(1, Math.ceil(Math.abs(sw) / Math.max(dmax, 1e-3)));
    for (let k = 1; k <= n; k++) { const q = k === n ? p1 : pt(t0 + sw * (k / n), c0 + (c1 - c0) * (k / n)); emit({ t: 'feed', x: q.x, y: q.y, z: q.z, f: S.f, kind: 'cut' }, ln); }
  }
}
