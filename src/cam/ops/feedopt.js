// WP-12: ilerleme iyilestirme (takim yolu sonrasi isleme; IR'de yeni hareket turu yok, yalniz hareket basina F).
//  corner: { angle (derece, yon degisimi esigi), dist (mm, kosenin iki yaninda), factor (0..1), maxR? (mm) }
//    Kose = ardisik iki kesme hareketinin birlesimindeki XY yon degisimi >= angle, ya da yaricapi <= maxR (varsayilan takim capi)
//    ve tarama acisi >= angle olan yay (yuvarlatilmis ic kose). Bolge: kosenin (yayin) dist oncesi ve sonrasi.
//  exit: { dist (mm), factor (0..1) }: her kesintisiz kesme dizisinin (sonunda kalkis/baglanti olan) son dist mm'si
//    (takimin malzemeden ciktigi yer: acik kenar, paso sonu). Baglanti hareketleri (link) ve giris (ramp/plunge/lead) degismez.
//    WP-22c: exit.when 'material' (setup stogu biliniyorsa; arayuzde yeni secimde varsayilan): yalniz takim gercekten malzemeden cikiyorsa
//    (dizinin sonunda takimin on konisi islem oncesi stogun disinda: stok kenarindan havaya cikis; materialExits). Malzeme icinde biten
//    dizi (uyarlanir paso sonu, cep duvari dibinde kalkis) yavaslatilmaz. 'always' (belgede alan yoksa): eski davranis.
// Bolgedeki hareket bolunur ve F = F * factor. Toplam yol (geometri) degismez.
import { cerr } from '../geom/err.js';
import { computeStats, validateToolpath, arcSweep, ARC_MIN_CHORD } from '../ir.js';
import { stockHeightmap } from '../sim/index.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
function parse(op, tool) {
  const fo = op.feedOpt; const nm = op.name || op.id;
  const bad = (field, expect) => cerr('cam.op.bad_field', { field: 'feedOpt.' + field, expect, op: nm });
  if (!fo || typeof fo !== 'object') throw bad('', 'object');
  const fac = (v, f) => { if (!(isNum(v) && v > 0 && v <= 1)) throw bad(f, '0 < factor <= 1'); return v; };
  const pos = (v, f) => { if (!(isNum(v) && v > 0)) throw bad(f, 'number > 0'); return v; };
  const out = {};
  if (fo.corner) {
    const c = fo.corner; const angle = c.angle ?? 45; if (!(isNum(angle) && angle > 0 && angle < 180)) throw bad('corner.angle', '0 < angle < 180');
    out.corner = { angle: (angle * Math.PI) / 180, dist: pos(c.dist ?? tool.dia / 2, 'corner.dist'), factor: fac(c.factor, 'corner.factor'), maxR: pos(c.maxR ?? tool.dia, 'corner.maxR') };
  }
  if (fo.exit) {
    const when = fo.exit.when ?? 'always'; if (!['material', 'always'].includes(when)) throw bad('exit.when', 'material/always'); // geriye uyum: alan yoksa 'always'; arayuz yeni secimde 'material'
    out.exit = { dist: pos(fo.exit.dist, 'exit.dist'), factor: fac(fo.exit.factor, 'exit.factor'), when };
  }
  return out;
}
const isCut = (m) => (m.t === 'feed' || m.t === 'arc') && m.kind === 'cut' && !m.link;
function geomOf(m, from) {
  if (m.t === 'feed') { const dx = m.x - from.x, dy = m.y - from.y; const L = Math.hypot(dx, dy); return { L, t0: L > 1e-9 ? [dx / L, dy / L] : null, t1: L > 1e-9 ? [dx / L, dy / L] : null }; }
  const cx = from.x + m.i, cy = from.y + m.j; const R = Math.hypot(m.i, m.j); const sw = arcSweep(from, m); const s = sw > 0 ? 1 : -1;
  const tan = (x, y) => { const ux = (x - cx) / R, uy = (y - cy) / R; return [-uy * s, ux * s]; };
  return { L: R * Math.abs(sw), t0: tan(from.x, from.y), t1: tan(m.x, m.y), R, sw, cx, cy };
}
// hareketi [u0,u1] (0..1) parcasina bol: yeni hareket (baslangic noktasi = parca basi)
function piece(m, from, g, u0, u1) {
  const z = from.z + (m.z - from.z) * u1;
  if (m.t === 'feed') return { start: { x: from.x + (m.x - from.x) * u0, y: from.y + (m.y - from.y) * u0, z: from.z + (m.z - from.z) * u0 }, m: { ...m, x: from.x + (m.x - from.x) * u1, y: from.y + (m.y - from.y) * u1, z } };
  const a0 = Math.atan2(from.y - g.cy, from.x - g.cx);
  const pa = [g.cx + g.R * Math.cos(a0 + g.sw * u0), g.cy + g.R * Math.sin(a0 + g.sw * u0)], pb = u1 >= 1 ? [m.x, m.y] : [g.cx + g.R * Math.cos(a0 + g.sw * u1), g.cy + g.R * Math.sin(a0 + g.sw * u1)];
  const start = { x: pa[0], y: pa[1], z: from.z + (m.z - from.z) * u0 };
  if (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) < ARC_MIN_CHORD) { const { i: _i, j: _j, dir: _d, ...rest } = m; return { start, m: { ...rest, t: 'feed', x: pb[0], y: pb[1], z } }; }
  return { start, m: { ...m, x: pb[0], y: pb[1], z, i: g.cx - pa[0], j: g.cy - pa[1] } };
}

// WP-22c: gercek malzeme cikisi. runs: kesme dizileri (items indeksleri). Donus: Set(dizi indeksi) | null (stok bilgisi yok).
// Cikis = dizinin sonunda takimin on konisi (+-30 derece, yaricap r + h) ISLEM ONCESI malzemenin (stok kutusu/silindiri ya da onceki
// stok haritasi) disinda: takim stok kenarindan (acik kenar) havaya cikiyor. Ayni islemin daha once bosalttigi bosluga cikis sayilmaz.
function materialExits(items, runs, tool, S, stockMap) {
  const box = S?.stockBox; if (!box && !stockMap?.data) return null;
  const r = tool.dia / 2; const h = Math.min(1, Math.max(0.1, r / 8));
  const src = stockMap?.data ? stockMap : stockHeightmap(box, Math.min(0.5, h), S.stockCyl ?? null);
  const topAt = (x, y) => { const i = Math.floor((x - src.x0) / src.res), j = Math.floor((y - src.y0) / src.res); return i < 0 || j < 0 || i >= src.nx || j >= src.ny ? -Infinity : src.data[j * src.nx + i]; };
  const out = new Set();
  runs.forEach((run, q) => {
    const it = items[run[run.length - 1]]; if (!it.g?.t1) return; const m = it.m; const a0 = Math.atan2(it.g.t1[1], it.g.t1[0]); const R = r + h;
    for (let k = 0; k <= 12; k++) { const a = a0 + ((k - 6) * Math.PI) / 36; if (topAt(m.x + R * Math.cos(a), m.y + R * Math.sin(a)) > m.z + 1e-3) return; }
    out.add(q);
  });
  return out;
}

export function applyFeedOpt(tp, op, machine, ctx = null) {
  const cfg = parse(op, tp.tool); if (!cfg.corner && !cfg.exit) return tp;
  const mv = tp.moves; const items = []; let pos = null;
  for (const m of mv) {
    const from = pos ? { ...pos } : null;
    items.push({ m, from, g: from && (m.t === 'feed' || m.t === 'arc') ? geomOf(m, from) : null });
    if (m.t === 'rapid' || m.t === 'feed' || m.t === 'arc') pos = { x: m.x, y: m.y, z: m.z };
    else if (m.t === 'cycle' && m.points?.length) { const p = m.points[m.points.length - 1]; pos = { x: p[0], y: p[1], z: m.clearance }; }
  }
  // kesme dizileri
  const runs = []; let cur = null;
  items.forEach((it, k) => { if (it.from && isCut(it.m)) { if (!cur) runs.push((cur = [])); cur.push(k); } else cur = null; });
  const zonesOf = new Map(); let nCorner = 0, nExit = 0;
  const mex = cfg.exit && cfg.exit.when === 'material' ? materialExits(items, runs, tp.tool, ctx?.setup, ctx?.stockMap) : null; let nInside = 0; const runIdx = new Map(runs.map((u, i) => [u, i]));
  for (const run of runs) {
    const s = []; let acc = 0; for (const k of run) { s.push(acc); acc += items[k].g.L; }
    const zones = [];
    if (cfg.corner) {
      const C = cfg.corner;
      for (let q = 0; q < run.length; q++) {
        const it = items[run[q]];
        if (it.m.t === 'arc' && it.g.R <= C.maxR + 1e-9 && Math.abs(it.g.sw) >= C.angle - 1e-9) { zones.push([s[q] - C.dist, s[q] + it.g.L + C.dist, C.factor]); nCorner++; }
        if (q + 1 < run.length) {
          const a = it.g, b = items[run[q + 1]].g; if (!a.t1 || !b.t0 || Math.abs(items[run[q + 1]].from.z - it.m.z) > 1e-6) continue;
          const c = Math.max(-1, Math.min(1, a.t1[0] * b.t0[0] + a.t1[1] * b.t0[1]));
          if (Math.acos(c) >= C.angle - 1e-9) { const sj = s[q] + a.L; zones.push([sj - C.dist, sj + C.dist, C.factor]); nCorner++; }
        }
      }
    }
    if (cfg.exit && acc > 1e-9) { if (!mex || mex.has(runIdx.get(run))) { zones.push([acc - cfg.exit.dist, acc + 1, cfg.exit.factor]); nExit++; } else nInside++; }
    if (!zones.length) continue;
    run.forEach((k, q) => zonesOf.set(k, { s0: s[q], zones }));
  }
  if (!zonesOf.size) return { ...tp, meta: { ...tp.meta, feedOpt: { corners: 0, exits: 0, insideEnds: nInside } } };
  const out = [];
  items.forEach((it, k) => {
    const zz = zonesOf.get(k); if (!zz || !(it.g.L > 1e-9)) { out.push(it.m); return; }
    const L = it.g.L; const cuts = new Set([0, 1]);
    for (const [a, b] of zz.zones) for (const v of [a, b]) { const u = (v - zz.s0) / L; if (u > 1e-9 && u < 1 - 1e-9) cuts.add(u); }
    const us = [...cuts].sort((p, q) => p - q);
    // cok kisa parcalari birlestir (0,01 mm)
    const ux = [us[0]]; for (let i = 1; i < us.length; i++) { if ((us[i] - ux[ux.length - 1]) * L < 0.01 && i < us.length - 1) continue; if ((us[i] - ux[ux.length - 1]) * L < 0.01) ux[ux.length - 1] = us[i]; else ux.push(us[i]); }
    if (ux[0] !== 0) ux.unshift(0);
    for (let i = 0; i + 1 < ux.length; i++) {
      const mid = zz.s0 + ((ux[i] + ux[i + 1]) / 2) * L; let f = 1;
      for (const [a, b, fac] of zz.zones) if (mid >= a && mid <= b) f = Math.min(f, fac);
      const pc = ux.length === 2 ? { m: { ...it.m } } : piece(it.m, it.from, it.g, ux[i], ux[i + 1]);
      if (f < 1) pc.m.f = Math.max(1e-3, Math.round(it.m.f * f * 1000) / 1000);
      out.push(pc.m);
    }
  });
  const nt = { ...tp, moves: out, meta: { ...tp.meta, feedOpt: { corners: nCorner, exits: nExit, insideEnds: nInside } } };
  nt.stats = computeStats(nt, { rapidFeed: machine?.feed?.rapid ?? undefined });
  try { validateToolpath(nt); } catch (e) { throw cerr('cam.internal_ir', { code: e.code || 'internal', params: JSON.stringify(e.params || {}) }); }
  return nt;
}
