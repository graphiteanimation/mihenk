// Dis frezeleme (threadmill): tek agizli (tek profilli) dis freze, ic/dis, sag/sol, tirmanma/zit yon. Helis ara degerlemesi (G2/G3 + Z).
// Yon kurali (iki kaynakla dogrulandi: machiningdoctor.com dis frezeleme kodu uretici - ornek ic M10x1 sag dis, G03, Z artarak (alttan uste), mil saat yonu;
// industrialmonitordirect.com - sag dis, mil saat yonunde +Z = tirmanma):
//   mil daima saat yonu (M3) -> tirmanma: ic dis CCW (G3), dis dis CW (G2); zit: tersi.
//   Sag dis helisi CCW giderken YUKSELIR (sag el helisi); sol dis CCW giderken ALCALIR.  => Z yukari <=> (CCW && sag) || (CW && sol).
//   Yani: ic sag tirmanma: alttan uste G3 | ic sag zit: ustten alta G2 | dis sag tirmanma: ustten alta G2 | dis sag zit: alttan uste G3
//         ic sol tirmanma: ustten alta G3 | dis sol tirmanma: alttan uste G2.
// Takim merkezi yolu (tek profil, takim kesici cap = tool.dia, uc yaricapi R):
//   ic:  rho = D/2 - R (+ ayar);  kesici ucun degdigi yaricap = rho + R = D/2 (dis dibi = nominal cap); kucuk cap D1 = D - 1,0825 P.
//   dis: rho = d3/2 + R (- ayar); degdigi yaricap = rho - R = d3/2 (dis dibi);  d3 = d - 1,2269 P.
//   Radyal paso sayisi n: toplam dis derinligi esit n paya bolunur (ic: rho_i = rho_f - (n-i) delta; dis: rho_i = rho_f + (n-i) delta); sonra `spring` tekrar.
// Ilerleme: feedCut = kesici uc (dis dibi) ilerlemesi; dairesel arada merkez yolu ilerlemesi F = feedCut * rho / r_temas
//   (ic r_temas = rho + R; dis r_temas = rho - R). `feedAtEdge: false` ise feedCut aynen yazilir.
// Giris/cikis: ic dis eksenden S'ye yari cember (helis ile ayni yon, S'de teget); dis dis radyal disaridan S'ye yari cember (S egrisi, S'de teget). Yari ilerleme.
// Delik onceden delinmis olmalidir (kucuk cap D1); is baslangicindaki stok haritasindan (ctx.stockMap) delik acik mi denetlenir; harita yoksa uyari.
// Sim: dis bolgesi (kucuk cap..nominal cap halkasi) `meta.threadZones` ile bildirilir; simulasyon o halkada oyma/boy/hizli denetimi yapmaz (T-22 kilavuzla ayni kural),
// halka disinda her sey (hatali yaricap, tutucu, sap) denetlenir.
import { cerr } from '../geom/err.js';
import { need, opt, posNum, nonNeg, cutting, Builder, finishToolpath, warn, r3, anyNum } from './common.js';
import { collectHoles } from './drill.js';
import { helixArcs, leadIn, leadOut } from './helix.js';
import { coarsePitch, minorDia, threadDepth } from '../threads.js';

export const THREAD_TOOLS = ['threadmill'];
const MIN_RHO = 0.05;          // yari cember capi icin en kucuk merkez yaricapi (mm)
const FIT_GAP = 0.05;          // ic dis: takim capi D1'den en az bu kadar kucuk
const OPEN_TOL = 0.05;         // delik acik denetimi: hucre yuksekligi tabandan en cok bu kadar yuksek
const EPS = 1e-9;

// "M8", "M8x1", "M10 x 1.25" -> {major, pitch|null}
export function parseThread(s) {
  const m = /^\s*M\s*(\d+(?:[.,]\d+)?)\s*(?:[x×]\s*(\d+(?:[.,]\d+)?))?\s*$/i.exec(String(s ?? '')); if (!m) return null;
  const num = (v) => Number(String(v).replace(',', '.'));
  const major = num(m[1]); const pitch = m[2] ? num(m[2]) : null;
  return Number.isFinite(major) && major > 0 && (pitch == null || (Number.isFinite(pitch) && pitch > 0)) ? { major, pitch } : null;
}
// Hareket yonu ve eksen yonu (kural yukaridaki yorumda)
export function threadDirection({ internal, hand, dir }) {
  const ccw = internal ? dir === 'climb' : dir !== 'climb';
  const zUp = ccw === (hand === 'right');
  return { ccw, zUp };
}
// delik ekseni (x,y) etrafinda yaricap rad icindeki tum hucreler z + OPEN_TOL'un altinda mi (harita disi hucreler yok sayilir)
export function holeOpen(hm, x, y, rad, z) {
  const rs = hm.res; const i0 = Math.max(0, Math.floor((x - rad - hm.x0) / rs)), i1 = Math.min(hm.nx - 1, Math.floor((x + rad - hm.x0) / rs));
  const j0 = Math.max(0, Math.floor((y - rad - hm.y0) / rs)), j1 = Math.min(hm.ny - 1, Math.floor((y + rad - hm.y0) / rs));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cx = hm.x0 + (i + 0.5) * rs, cy = hm.y0 + (j + 0.5) * rs; if (Math.hypot(cx - x, cy - y) > rad) continue;
    const hh = hm.data[j * hm.nx + i]; if (hh === hh && hh > z + OPEN_TOL) return false;
  }
  return true;
}

export const ADJUST_MAX = 0.2; // mm: radialAdjust siniri (sim diş bolgesi adjust ile buyumez)
export function computeThread(op, ctx) {
  const { setup: S, tool, geom, machine } = ctx;
  const nm = op.name || op.id;
  if (!THREAD_TOOLS.includes(tool.type)) throw cerr('cam.thread.tool_type', { type: tool.type, tool: tool.number });
  const cut = cutting(op); const warnings = [];
  const external = op.external === true; const internal = !external;
  const hand = op.hand ?? 'right'; if (!['right', 'left'].includes(hand)) throw cerr('cam.op.bad_field', { field: 'hand', expect: 'right/left', op: nm });
  const dir = op.dir ?? 'climb'; if (!['climb', 'conv'].includes(dir)) throw cerr('cam.op.bad_field', { field: 'dir', expect: 'climb/conv', op: nm });
  const nPass = opt(op, 'radialPasses', (v) => Number.isInteger(v) && v >= 1 && v <= 20, 'integer 1..20', 1);
  const spring = opt(op, 'springPasses', (v) => Number.isInteger(v) && v >= 0 && v <= 5, 'integer 0..5', 0);
  const adjust = opt(op, 'radialAdjust', anyNum, 'number', 0);
  const atEdge = op.feedAtEdge !== false;
  const R = tool.dia / 2;
  const des = op.designation != null && op.designation !== '' ? parseThread(op.designation) : null;
  if (op.designation != null && op.designation !== '' && !des) throw cerr('cam.op.bad_field', { field: 'designation', expect: 'M8 / M8x1', op: nm });
  const { holes, skipped } = collectHoles(op, S, geom);
  if (skipped) warnings.push(warn('cam.drill.skipped_axis', { n: skipped }));
  if (!holes.length) throw cerr('cam.drill.no_holes');
  const clr = need(op, 'heights.clearance'), ret = need(op, 'heights.retract');
  if (ret > clr + 1e-9) throw cerr('cam.heights.retract_above_clearance', { retract: ret, clearance: clr });
  const stockTop = S.stockBox.max[2]; const zClr = stockTop + Math.max(clr, S.clearance ?? 0), zRet = stockTop + ret;
  const sg = threadDirection({ internal, hand, dir }); const sgn = sg.ccw ? 1 : -1;
  const b = new Builder({ zClr, zRet, feed: cut.feedCut, tool });
  const zones = []; let info = null; let unverified = 0, extUnverified = 0; let toolPitchWarned = false;
  const stockMap = ctx.stockMap?.data ? ctx.stockMap : null;
  const lengthOp = opt(op, 'length', posNum, 'number > 0', null);
  let zMin = Infinity, zMax = -Infinity;

  for (const hl of holes) {
    const major = op.major != null ? need(op, 'major') : des ? des.major : hl.thread?.major ?? null;
    if (major == null) throw cerr('cam.thread.no_major', { op: nm });
    const pitch = op.pitch != null ? need(op, 'pitch') : des?.pitch ?? hl.thread?.pitch ?? coarsePitch(major);
    if (pitch == null) throw cerr('cam.thread.no_pitch', { major: r3(major) });
    if (tool.pitch != null && Math.abs(tool.pitch - pitch) > 1e-6 && !toolPitchWarned) { toolPitchWarned = true; warnings.push(warn('cam.thread.tool_pitch', { toolPitch: r3(tool.pitch), pitch: r3(pitch) })); }
    if (Math.abs(adjust) > ADJUST_MAX) throw cerr('cam.op.bad_field', { field: 'radialAdjust', expect: '|v| <= ' + ADJUST_MAX + ' mm', op: nm });
    const depthR = threadDepth(pitch, internal); const minor = minorDia(major, pitch, internal);
    // thread bottom z
    const top = hl.top; let bottom;
    if (lengthOp != null) bottom = top - lengthOp;
    else if (op.depth?.from === 'abs') bottom = need(op, 'depth.z', anyNum, 'number');
    else if (hl.through || hl.depth == null) { if (hl.exit != null) bottom = top - hl.exit; else throw cerr('cam.thread.no_length', { op: nm }); }
    else bottom = top - hl.depth;
    const L = top - bottom; if (!(L >= pitch - 1e-9)) throw cerr('cam.thread.too_short', { length: r3(L), pitch: r3(pitch) });
    if (internal && !(tool.dia < minor - FIT_GAP + EPS)) throw cerr('cam.thread.tool_too_big', { dia: r3(tool.dia), minor: r3(minor) });
    // radyal paso yaricaplari (merkez yolu), sirayla: ilk = en az derin, son = nominal (+ ayar); sonra spring tekrar
    const rhoF = internal ? major / 2 - R + adjust : minor / 2 + R - adjust;
    const delta = depthR / nPass; const rhos = [];
    for (let i = 1; i <= nPass; i++) rhos.push(internal ? rhoF - (nPass - i) * delta : rhoF + (nPass - i) * delta);
    for (let i = 0; i < spring; i++) rhos.push(rhoF);
    if (rhos.some((r) => !(r >= MIN_RHO))) throw cerr('cam.thread.tool_too_big', { dia: r3(tool.dia), minor: r3(minor) });
    // dis dis: takim kesici ucu (rho - R) eksenden uzak olmali (rho > R); aksi halde takim govdesi gövdeyi keser
    if (external && !(rhoF > R)) throw cerr('cam.thread.tool_too_big', { dia: r3(tool.dia), minor: r3(minor) });
    // delik acik mi (ic dis): is basi stok haritasi
    if (internal) {
      if (stockMap) { if (!holeOpen(stockMap, hl.x, hl.y, R, bottom)) throw cerr('cam.thread.not_predrilled', { x: r3(hl.x), y: r3(hl.y), z: r3(bottom) }); }
      else unverified++;
    }
    const O = [hl.x, hl.y]; const zA = sg.zUp ? bottom : top, zB = sg.zUp ? top : bottom;
    // giris/cikis yaylari yarim tur (pi) suruyor: Z'yi helisle uyumlu yurutur (yarim hatve). Ana helis zA2..zB2 arasinda; L >= 2*hatve ise
    // (kisa dislerde sabit Z'ye dusulur). Tum radyal paslar ayni zA2 ile baslar -> ayni olugu keser (faz sabit).
    const walk = L >= 2 * pitch - 1e-9; const zDir = zB > zA ? 1 : -1; const dz0 = walk ? zDir * pitch / 2 : 0;
    const zA2 = zA + dz0, zB2 = zB - dz0; const total = (2 * Math.PI * (L - (walk ? pitch : 0))) / pitch; const aOut = R + 1;
    zMin = Math.min(zMin, bottom); zMax = Math.max(zMax, top);
    let first = true;
    for (const rho of rhos) {
      const rc = internal ? rho + R : rho - R; // kesici ucun temas yaricapi
      const Fc = atEdge ? cut.feedCut * (rho / rc) : cut.feedCut; const Fl = Math.max(Fc * 0.5, 1e-3);
      const li = leadIn(O, rho, 0, sgn, internal, aOut);
      // dikey inis bolgesi bosaltilmis mi: ic dis = onceden delinmis delik (yukarida denetlendi); dis dis = takimin indigi nokta civari stok haritasinda bos olmali
      let clearIn = internal;
      if (external) {
        if (stockMap) { if (!holeOpen(stockMap, li.start[0], li.start[1], R + 0.1, bottom)) throw cerr('cam.thread.ext_not_cleared', { x: r3(li.start[0]), y: r3(li.start[1]), z: r3(bottom) }); clearIn = true; }
        else extUnverified++;
      }
      if (first) { b.linkTo(li.start[0], li.start[1], zA, cut.feedPlunge, clearIn ? { clear: true } : {}); first = false; }
      else {
        if (Math.abs(b.pos[2] - zA) > EPS) b.feed(b.pos[0], b.pos[1], zA, cut.feedPlunge, 'plunge', clearIn ? { clear: true } : undefined);
        if (Math.hypot(b.pos[0] - li.start[0], b.pos[1] - li.start[1]) > EPS) b.feed(li.start[0], li.start[1], zA, Fl, 'lead');
      }
      b.seg(li.arc, zA, zA2, Fl, 'lead');
      const aEnd = helixArcs(b, O, rho, 0, sgn, zA2, zB2, total, Fc, 'cut');
      const lo = leadOut(O, rho, aEnd, sgn, internal, aOut);
      b.seg(lo.arc, zB2, zB, Fl, 'lead');
    }
    b.up();
    zones.push({ c: O.map(r3x), r0: minor / 2 - 0.01, r1: major / 2 + 0.01, // adjust bolgeyi BUYUTMEZ: sabit kucuk tolerans (adjust ile fazla kesim oyma olarak gorunur)
    z0: bottom - 1e-6, z1: top + 1e-6 });
    if (!info) info = { major: r3(major), pitch: r3(pitch), internal, hand, dir, ccw: sg.ccw, zUp: sg.zUp, passes: rhos.length, rho: r3(rhoF), depth: r3(depthR), length: r3(L), turns: r3(L / pitch) };
  }
  if (unverified) warnings.push(warn('cam.thread.predrill_unverified', { n: unverified }));
  if (extUnverified) warnings.push(warn('cam.thread.ext_unverified', { n: extUnverified }));
  const hh = { zClr, zRet, zTop: zMax, zBot: zMin, stockTop };
  return finishToolpath(op, tool, cut, hh, b, { warnings, passDepth: null, rapidFeed: machine?.feed?.rapid ?? undefined, meta: { thread: info, threadZones: zones, holes: holes.length } });
}
const r3x = (v) => Math.round(v * 1e6) / 1e6;
