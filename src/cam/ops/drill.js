// Delik islemleri: rebuild holes[] (O-008) ya da verilen noktalar -> cevrim hareketleri (IR 'cycle').
// Ekseni takim eksenine (setup -Z) paralel olmayan delik bu setup'ta listelenmez (uyari). Takim capi/hatvesi denetlenir.
// Boydan boya delik dibi = delik ekseninde modelden son cikis (geom.holes[].exits, T-14) - breakThrough - uc boyu; cikis
// bilinmiyorsa model kutusunun tabani (uyari). R duzlemi = delik ustu + heights.retract. Noktalar ayni cevrimde yalniz R duzlemi stok ustundeyse birlesir (G99 ile
// noktalar arasi gecis stok icinden gecmesin); degilse her nokta kendi cevrimidir (ustteki duzleme doner).
import { cerr } from '../geom/err.js';
import { tipLength } from '../tools.js';
import { need, opt, posNum, nonNeg, anyNum, cutting, Builder, finishToolpath, warn, r3 } from './common.js';

export const CYCLE_TOOLS = { drill: ['drill'], peck: ['drill'], chipbreak: ['drill'], spot: ['spot', 'drill', 'chamfer'], tap: ['tap'], ream: ['reamer'], bore: ['bore'], fineBore: ['bore'], backBore: ['bore'] };
const DIA_TOL = 0.01;
const TRANSIT_GAP = 0.1; // mm: G99 gecisinde R ile stok arasinda istenen en kucuk bosluk

// (a -> b) dogru parcasi boyunca, rad + yarim hucre koseni kadar bantta her stok hucresi z'nin altinda mi (harita disi: bos).
export function segClear(hm, a, b, z, rad) {
  const rs = hm.res, pad = rad + rs * Math.SQRT1_2;
  const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - pad - hm.x0) / rs)), i1 = Math.min(hm.nx - 1, Math.floor((Math.max(a.x, b.x) + pad - hm.x0) / rs));
  const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - pad - hm.y0) / rs)), j1 = Math.min(hm.ny - 1, Math.floor((Math.max(a.y, b.y) + pad - hm.y0) / rs));
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  for (let j = j0; j <= j1; j++) {
    const cy = hm.y0 + (j + 0.5) * rs;
    for (let i = i0; i <= i1; i++) {
      const h = hm.data[j * hm.nx + i]; if (!(h >= z)) { if (h === h) continue; return false; } // NaN: bilinmiyor -> guvenli degil
      const cx = hm.x0 + (i + 0.5) * rs; const t = L2 > 0 ? Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / L2)) : 0;
      if (Math.hypot(cx - a.x - dx * t, cy - a.y - dy * t) <= pad) return false;
    }
  }
  return true;
}

// model uzayi -> setup uzayi
const toS = (F, p) => { const d = [p[0] - F.o[0], p[1] - F.o[1], p[2] - F.o[2]]; return [d[0] * F.x[0] + d[1] * F.x[1] + d[2] * F.x[2], d[0] * F.y[0] + d[1] * F.y[1] + d[2] * F.y[2], d[0] * F.z[0] + d[1] * F.z[1] + d[2] * F.z[2]]; };
const toSd = (F, d) => [d[0] * F.x[0] + d[1] * F.x[1] + d[2] * F.x[2], d[0] * F.y[0] + d[1] * F.y[1] + d[2] * F.y[2], d[0] * F.z[0] + d[1] * F.z[1] + d[2] * F.z[2]];

// Delikleri setup uzayinda topla: [{x, y, top, dia, depth, through, thread, tipAngle, feature}], atlanan sayisi
export function collectHoles(op, S, geom) {
  const sel = op.holes; if (!sel || typeof sel !== 'object') throw cerr('cam.op.missing', { field: 'holes', op: op.name || op.id });
  const out = []; let skipped = 0, pocketLike = 0;
  if (sel.kind === 'feature') {
    const f = sel.filter || {};
    // WP-06 (WP-05 devri): taninan delikler (recognized, feature 'rec:N'). `holes.rec` verilmisse yalniz listelenen taninan delikler
    // alinir (pocketLike da listelenebilir); verilmemisse taninan delikler alinir, pocketLike (cep benzeri) olanlar ATLANIR
    // (filter.feature ile acikca secilmedikce). `holes.acceptThread`: kullanicinin onayladigi taninan delikler icin threadHint -> thread.
    const rec = Array.isArray(sel.rec) ? new Set(sel.rec) : null; const acc = new Set(Array.isArray(sel.acceptThread) ? sel.acceptThread : []);
    for (const h of geom?.holes || []) {
      if (f.feature != null && h.feature !== f.feature && h.patternOf !== f.feature && h.copyOf !== f.feature) continue;
      if (f.dia != null && Math.abs(h.dia - f.dia) > 1e-6) continue;
      if (h.recognized) {
        if (rec ? !rec.has(h.feature) : (h.pocketLike && f.feature !== h.feature)) { if (!rec && h.pocketLike) pocketLike += h.positions.length; continue; }
      }
      const thread = h.thread || (h.recognized && acc.has(h.feature) && h.threadHint ? { major: h.threadHint.major, pitch: h.threadHint.pitch } : null);
      h.positions.forEach((p, i) => {
        const dm = h.dirs[i] || h.dir; const d = toSd(S.frame, dm); let q = toS(S.frame, p);
        const exit = Number.isFinite(h.exits?.[i]) ? h.exits[i] : null;
        if (Math.abs(d[2] + 1) > 1e-6) {
          // T-05b: boyu bilinen boydan boya delik karsi uctan da delinir (ust = p + d*boy)
          if (h.through && exit != null && Math.abs(d[2] - 1) <= 1e-6) q = toS(S.frame, [p[0] + dm[0] * exit, p[1] + dm[1] * exit, p[2] + dm[2] * exit]);
          else { skipped++; return; }
        }
        out.push({ x: q[0], y: q[1], top: q[2], dia: h.dia, depth: h.depth, through: !!h.through, thread, tipAngle: h.tipAngle, feature: h.feature, exit });
      });
    }
  } else if (sel.kind === 'points') {
    for (const p of geom?.points || []) { const q = toS(S.frame, p.p); out.push({ x: q[0], y: q[1], top: q[2], dia: null, depth: null, through: false, thread: null, tipAngle: null, feature: null }); }
  } else throw cerr('cam.op.bad_field', { field: 'holes.kind', expect: 'feature/points', op: op.name || op.id });
  // ayni konum (yinelenen) tek delik
  const uniq = []; for (const h of out) if (!uniq.some((u) => Math.hypot(u.x - h.x, u.y - h.y) < 1e-6 && Math.abs(u.top - h.top) < 1e-6)) uniq.push(h);
  return { holes: uniq, skipped, pocketLike };
}

// en kisa yol: en yakin komsu + 2-opt
export function orderPoints(pts, start) {
  if (pts.length < 3) return pts.slice();
  const rest = pts.slice(); const out = []; let cur = start || [rest[0].x, rest[0].y];
  while (rest.length) { let bi = 0, bd = Infinity; rest.forEach((p, i) => { const d = Math.hypot(p.x - cur[0], p.y - cur[1]); if (d < bd) { bd = d; bi = i; } }); const p = rest.splice(bi, 1)[0]; out.push(p); cur = [p.x, p.y]; }
  const D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  for (let it = 0, improved = true; improved && it < 50; it++) {
    improved = false;
    for (let i = 0; i < out.length - 2; i++) for (let j = i + 2; j < out.length - 1; j++) {
      if (D(out[i], out[j]) + D(out[i + 1], out[j + 1]) < D(out[i], out[i + 1]) + D(out[j], out[j + 1]) - 1e-9) { out.splice(i + 1, j - i, ...out.slice(i + 1, j + 1).reverse()); improved = true; }
    }
  }
  return out;
}

export function computeDrill(op, ctx) {
  const { setup: S, tool, geom, machine } = ctx;
  const cut = cutting(op);
  const cycle = need(op, 'cycle', (v) => Object.hasOwn(CYCLE_TOOLS, v), Object.keys(CYCLE_TOOLS).join('/'));
  if (!CYCLE_TOOLS[cycle].includes(tool.type)) throw cerr('cam.drill.tool_cycle', { cycle, type: tool.type });
  const warnings = [];
  const { holes, skipped, pocketLike } = collectHoles(op, S, geom);
  if (skipped) warnings.push(warn('cam.drill.skipped_axis', { n: skipped }));
  if (pocketLike) warnings.push(warn('cam.drill.pocketlike_skipped', { n: pocketLike }));
  if (!holes.length) throw cerr('cam.drill.no_holes');
  const dep = op.depth; if (!dep || typeof dep !== 'object') throw cerr('cam.op.missing', { field: 'depth', op: op.name || op.id });
  const tipComp = dep.tipComp === true; const brk = opt(op, 'depth.breakThrough', nonNeg, 'number >= 0', 0);
  const tipL = tipComp ? tipLength(tool) : 0;
  const clr = need(op, 'heights.clearance'), ret = need(op, 'heights.retract');
  if (ret > clr + 1e-9) throw cerr('cam.heights.retract_above_clearance', { retract: ret, clearance: clr });
  const stockTop = S.stockBox.max[2]; const zClr = stockTop + Math.max(clr, S.clearance ?? 0); const zSafe = stockTop + ret;
  let peck = null, dwell = null, pitch = null, f = cut.feedCut;
  if (cycle === 'peck' || cycle === 'chipbreak') peck = need(op, 'peck');
  if (op.dwell != null) dwell = need(op, 'dwell', nonNeg, 'number >= 0');
  // WP-14: G76 (ince delik) / G87 (arka havsa): kayma miktari zorunlu; G87 ek olarak boydan boya delik, arka havsa boyu ve alt baslangic payi ister
  let shift = null, shiftDir = null, backDepth = null, startBelow = 0;
  if (cycle === 'fineBore' || cycle === 'backBore') {
    shift = need(op, 'shift', posNum, 'number > 0'); if (op.shiftDir != null) shiftDir = need(op, 'shiftDir', anyNum, 'number');
    if (cycle === 'backBore') { backDepth = need(op, 'backDepth', posNum, 'number > 0'); startBelow = opt(op, 'startBelow', nonNeg, 'number >= 0', 2); }
  }
  if (cycle === 'tap') {
    if (!(tool.pitch > 0)) throw cerr('cam.drill.tap_no_pitch', { tool: tool.number });
    pitch = tool.pitch; f = cut.rpm * pitch; // senkron kilavuz: ilerleme = devir x hatve
  }
  let thru = 0, mism = 0, pmism = 0, nothread = 0;
  const pts = holes.map((h) => {
    let bottom;
    if (dep.from === 'abs') bottom = need(op, 'depth.z', anyNum, 'number');
    else if (dep.from === 'hole') {
      if (h.dia == null) throw cerr('cam.drill.depth_from_hole_needs_feature');
      // T-14: boydan boya dip = delik ekseninde modelden son cikis (annotateHoleExits); bilinmiyorsa model tabani (uyari)
      if ((h.through || h.depth == null) && h.exit != null) bottom = h.top - h.exit - brk - tipL;
      else if (h.through || h.depth == null) { bottom = S.modelBBox.min[2] - brk - tipL; thru++; }
      else bottom = h.top - h.depth - tipL;
    } else throw cerr('cam.op.bad_field', { field: 'depth.from', expect: 'hole/abs', op: op.name || op.id });
    if (h.dia != null) {
      if (cycle === 'tap') {
        if (!h.thread) nothread++;
        else { if (h.thread.major != null && Math.abs(h.thread.major - tool.dia) > DIA_TOL) mism++; if (h.thread.pitch != null && Math.abs(h.thread.pitch - tool.pitch) > 1e-6) pmism++; }
      } else if (cycle !== 'spot' && Math.abs(h.dia - tool.dia) > DIA_TOL) mism++;
    }
    let cutTo = null;
    if (cycle === 'backBore') { // alt baslangic = delik cikisinin startBelow altinda, ustte bitis = cikistan backDepth yukari
      if (!(h.through && h.exit != null)) throw cerr('cam.drill.backbore_needs_through');
      if (!(tool.dia < h.dia - DIA_TOL)) throw cerr('cam.drill.backbore_tool_too_big', { tool: tool.dia, dia: h.dia });
      const zExit = h.top - h.exit; bottom = zExit - startBelow; cutTo = zExit + backDepth;
      if (!(cutTo < h.top - 1e-9)) throw cerr('cam.drill.backbore_too_long', { depth: backDepth, hole: r3(h.exit) });
    }
    const R = h.top + ret;
    if (!(bottom < R - 1e-9)) throw cerr('cam.drill.bottom_above_r', { bottom: r3(bottom), r: r3(R) });
    return { ...h, bottom, R, cutTo };
  });
  if (thru) warnings.push(warn('cam.drill.through_to_model_bottom', { n: thru, z: r3(S.modelBBox.min[2]) }));
  if (mism) warnings.push(warn('cam.drill.dia_mismatch', { n: mism, dia: tool.dia }));
  if (pmism) warnings.push(warn('cam.drill.pitch_mismatch', { n: pmism, pitch: tool.pitch }));
  if (nothread) warnings.push(warn('cam.drill.no_thread', { n: nothread }));
  const order = op.order ?? 'asis'; if (!['asis', 'shortest'].includes(order)) throw cerr('cam.op.bad_field', { field: 'order', expect: 'asis/shortest', op: op.name || op.id });
  // T-23 gruplama: anahtar (ust z, dip, R). Ayni anahtarli ardisik noktalar tek cevrimde (G99: gecis R'de) yalniz gecis
  // guvenliyse: R stok kutusunun ustunde, ya da islem basi stok haritasinda (ctx.stockMap, generateProgram'in sim'i) gecis
  // bandindaki her hucre R'nin altinda; model ust haritasi (ctx.modelMap, ince duvar guvencesi) da ayni. Haritalardan biri yoksa ya da bant disi/bilinmeyen hucre varsa gecis guvenli SAYILMAZ (ayri cevrim).
  const stockMap = ctx.stockMap?.data ? ctx.stockMap : null, modelMap = ctx.modelMap?.data ? ctx.modelMap : null;
  const clearAt = (a, b, z) => (z >= stockTop - 1e-9) || (stockMap && modelMap ? segClear(stockMap, a, b, z - TRANSIT_GAP, tool.dia / 2) && segClear(modelMap, a, b, z - TRANSIT_GAP, tool.dia / 2) : false);
  const byKey = new Map(); const keyed = [];
  for (const p of pts) { const key = `${Math.round(p.top * 1e6)}|${Math.round(p.bottom * 1e6)}|${Math.round(p.R * 1e6)}|${p.cutTo == null ? '' : Math.round(p.cutTo * 1e6)}`; if (!byKey.has(key)) { const k = { top: p.top, bottom: p.bottom, R: p.R, cutTo: p.cutTo, pts: [] }; byKey.set(key, k); keyed.push(k); } byKey.get(key).pts.push(p); }
  const groups = []; const zCyc0 = Math.max(zSafe, ...pts.map((p) => p.R)); // cevrim baslangic duzlemi (asagidaki zCyc ile ayni)
  // R altinda engel (kaburga vb.) gecisi G99'a izin vermiyorsa ayni anahtarli noktalar BIR cevrimde G98 ile (her nokta sonrasi baslangic
  // duzlemine donus; XY hizli hareket baslangic duzleminde = stok ustu) toplanir: returnTo:'clearance'. Gecis guvenliyse eskisi gibi G99 zinciri.
  const chains = (k, list) => {
    const from = groups.length; let g = null;
    for (const p of list) { if (g && clearAt(g.pts[g.pts.length - 1], p, k.R)) g.pts.push(p); else { g = { top: k.top, bottom: k.bottom, R: k.R, cutTo: k.cutTo, pts: [p] }; groups.push(g); } }
    if (groups.length - from > 1 && k.R < zCyc0 - 1e-9) { const all = groups.splice(from).flatMap((x) => x.pts); groups.push({ top: k.top, bottom: k.bottom, R: k.R, cutTo: k.cutTo, pts: all, returnTo: 'clearance' }); }
  };
  let cur = null;
  if (order === 'shortest') { // anahtar gruplari en yakin komsu sirasiyla, grup ici en kisa yol, sonra guvenli gecis zincirleri
    const rest = keyed.slice();
    while (rest.length) {
      let bi = 0, bd = Infinity; rest.forEach((g, i) => { const d = cur ? Math.min(...g.pts.map((p) => Math.hypot(p.x - cur[0], p.y - cur[1]))) : 0; if (d < bd) { bd = d; bi = i; } });
      const k = rest.splice(bi, 1)[0]; const start = cur ? k.pts.reduce((a, p) => (Math.hypot(p.x - cur[0], p.y - cur[1]) < Math.hypot(a.x - cur[0], a.y - cur[1]) ? p : a)) : k.pts[0];
      chains(k, orderPoints(k.pts, [start.x, start.y])); const l = groups[groups.length - 1].pts.slice(-1)[0]; cur = [l.x, l.y];
    }
  } else for (const k of keyed) chains(k, k.pts);
  for (const g of groups) g.points = g.pts.map((p) => [p.x, p.y]);
  const zCyc = Math.max(zSafe, ...groups.map((g) => g.R)); // cevrim baslangic (ilk) duzlemi: stok ustu ve tum R'lerin ustu
  if (zCyc > zClr + 1e-9) throw cerr('cam.heights.retract_above_clearance', { retract: r3(zCyc - stockTop), clearance: clr });
  const b = new Builder({ zClr, zRet: zCyc, feed: f, tool });
  for (const g of groups) {
    const [x, y] = g.points[0];
    if (!b.pos) b.start(x, y);
    else if (Math.abs(b.pos[2] - zCyc) > 1e-9) b.rapid(b.pos[0], b.pos[1], zCyc);
    if (Math.hypot(b.pos[0] - x, b.pos[1] - y) > 1e-9) b.rapid(x, y, zCyc);
    if (Math.abs(b.pos[2] - zCyc) > 1e-9) b.rapid(x, y, zCyc);
    const m = { t: 'cycle', cycle, points: g.points, top: g.top, bottom: g.bottom, retract: cycle === 'backBore' ? zCyc : g.R, clearance: zCyc, f }; // G87 yalniz baslangic duzlemine doner: retract = clearance
    if (shift != null) { m.shift = shift; if (shiftDir != null) m.shiftDir = shiftDir; }
    if (cycle === 'backBore') m.cutTo = g.cutTo;
    if (g.returnTo && g.points.length > 1) m.returnTo = g.returnTo;
    if (peck != null) m.peck = peck; if (dwell != null) m.dwell = dwell; if (pitch != null) m.pitch = pitch;
    b.moves.push(m); const lp = g.points[g.points.length - 1]; b.pos = [lp[0], lp[1], zCyc];
  }
  const passDepth = Math.max(...pts.map((p) => p.top - p.bottom));
  const hh = { zClr, zRet: zCyc, zTop: Math.max(...pts.map((p) => p.top)), zBot: Math.min(...pts.map((p) => p.bottom)), stockTop };
  return finishToolpath(op, tool, { ...cut }, hh, b, { warnings, passDepth, rapidFeed: machine?.feed?.rapid ?? undefined, meta: { holes: pts.length, cycles: groups.length, drillAllow: brk + tipL + startBelow, belowStock: pts.some((p) => p.through || p.depth == null) ? Math.min(brk + tipL + startBelow, Math.max(0, S.stockBox.min[2] - Math.min(...pts.filter((p) => p.through || p.depth == null).map((p) => p.bottom)))) : 0 } });
}
