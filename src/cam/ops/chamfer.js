// T-03 pah: secilen kenar (yuz/eskiz/siluet dongusu ya da zincir) boyunca konik uclu takimla pah acar.
// Secilen kenar = pahin UST kenari (CAD modelde pah varsa ust yuzun siniri). Pah bu kenardan malzemenin disina (delikte
// bosluga dogru) `width` kadar yatay, `width/tan(beta)` kadar asagi iner; beta = tipAngle/2 (90 derece takimda 45 derece pah).
// Takim kenar boyunca TEK z'de gezer: konik yan yuzey kenarin ustundeki noktadan (kenar, zEdge) gecer; takim ucu pahin alt
// kosesinin `tipClearance` altinda. Takim merkezi kenardan `needR` = tipDia/2 + (dz + pay)*tan(beta) uzakta (malzeme disinda).
// Mevcut kontur altyapisi: contourInputs, offsetRegions, extendChain.
// WP-07 KESKIN KENAR KIPI (op.sharp = true): secilen kenar modelin KESKIN kosesidir (modelde pah yok). Pah bu kenardan malzemenin
// ICINE `width` kadar yatay, `width/tan(beta)` kadar dikey kesilir: konik yuzey (kenar, zEdge - dz) noktasindan ve kenardan `width`
// iceride (zEdge) noktasindan gecer. Takim merkezi kenardan bosluga dogru tipDia/2 + tipClearance*tan(beta) uzakta (= kenarin dz altindaki
// konik yaricap). Sim'e `meta.chamferSharp` ile bildirilen hacim disinda oyma yine engeldir.
import { cerr } from '../geom/err.js';
import * as P from '../geom/path2d.js';
import { opt, posNum, nonNeg, cutting, heights, Builder, finishToolpath, warn, r3 } from './common.js';
import { contourInputs, extendChain } from './contour.js';

export const CHAMFER_TOOLS = ['chamfer', 'spot'];
const DEF_CLEAR = 0.2; // takim ucunun pah altindan inis payi (mm)

function goodStart(loop) {
  let best = null; for (const s of loop) { const w = P.length(s) * (s.k === 'L' ? 2 : 1); if (!best || w > best.w) best = { w, s }; }
  return P.pointAt(best.s, 0.5);
}

// Pah geometrisi: { dz (pah derinligi), off (takim merkezinin secilen kenardan uzakligi = konik yaricap), tipDrop (kenardan uc z'sine) }
export function chamferGeom(tool, width, clear) {
  const beta = (tool.tipAngle * Math.PI) / 360; const tn = Math.tan(beta);
  const tipR = (tool.tipDia ?? 0) / 2; const dz = width / tn;
  const needR = tipR + (dz + clear) * tn; // kenarin z'sinde konik yaricap = merkezin kenardan uzakligi
  return { dz, off: needR, tipDrop: dz + clear, needR };
}

// Ofsetin kose yaylari (merkezi kaynak koseyle ayni, yaricap |d|) iki dogru komsusu varsa sivri (miter) koseye cevrilir:
// CAD pahi kosede iki duzlemin ortak kesiti (sivri) oldugundan yuvarlak kose konik takimla modeli oyar (sim: gouge).
// Miter uzunlugu > 4|d| (kose acisi ~29 dereceden dar) ise yuvarlak kalir.
export function miterJoins(path, srcVerts, d, closed) {
  const out = path.map((s) => ({ ...s })); const n = out.length; const drop = new Set(); const ad = Math.abs(d);
  for (let i = 0; i < n; i++) {
    const s = out[i]; if (s.k !== 'A' || Math.abs(s.r - ad) > 1e-7 || !srcVerts.some((v) => P.dist(v, s.c) < 1e-6)) continue;
    const pi = closed ? (i + n - 1) % n : i - 1, ni = closed ? (i + 1) % n : i + 1; if (pi < 0 || ni >= n || drop.has(pi) || drop.has(ni)) continue;
    const p = out[pi], q = out[ni]; if (p.k !== 'L' || q.k !== 'L') continue;
    const d1 = [p.b[0] - p.a[0], p.b[1] - p.a[1]], d2 = [q.b[0] - q.a[0], q.b[1] - q.a[1]]; const den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-12 * Math.hypot(...d1) * Math.hypot(...d2)) continue;
    const t = ((q.a[0] - p.a[0]) * d2[1] - (q.a[1] - p.a[1]) * d2[0]) / den; const X = [p.a[0] + d1[0] * t, p.a[1] + d1[1] * t];
    if (t < 1 - 1e-9 || P.dist(X, s.c) > 4 * ad) continue;
    p.b = X; q.a = X; drop.add(i);
  }
  return out.filter((_, i) => !drop.has(i));
}

// Model yukseklik haritasindan (ctx.modelMap, ince cozunurluk) secilen kenarin modelde pahli olup olmadigi: kenardan malzeme disina
// (delikte bosluga) width/2 uzaklikta CAD pahi yuzu zEdge - dz/2 civarindadir; keskin kenarda bu nokta pahin altindaki duvar/zemindir.
// Noktalarin yarisindan cogu zEdge - 0,9 dz'den yuksekse pahli sayilir. Harita yoksa null (bilinmiyor: uyari yok).
export function modelChamfered(map, paths, zEdge, dz) {
  if (!map?.data) return null;
  let n = 0, ok = 0;
  for (const path of paths) for (const sg of path) {
    const k = Math.max(1, Math.ceil(P.length(sg) / 2));
    for (let i = 0; i < k; i++) {
      const q = P.pointAt(sg, (i + 0.5) / k); const ix = Math.floor((q[0] - map.x0) / map.res), iy = Math.floor((q[1] - map.y0) / map.res);
      if (ix < 0 || iy < 0 || ix >= map.nx || iy >= map.ny) continue;
      n++; if (map.data[iy * map.nx + ix] > zEdge - 0.9 * dz) ok++;
    }
  }
  return n ? ok / n >= 0.5 : null;
}

export function computeChamfer(op, ctx) {
  const { setup: S, tool, geom, machine } = ctx;
  if (!CHAMFER_TOOLS.includes(tool.type)) throw cerr('cam.chamfer.tool_type', { type: tool.type, tool: tool.number });
  if (!(tool.tipAngle > 0 && tool.tipAngle < 180)) throw cerr('cam.chamfer.tool_angle', { tool: tool.number });
  const cut = cutting(op); const warnings = [];
  const width = opt(op, 'width', posNum, 'number > 0', null); if (width == null) throw cerr('cam.op.missing', { field: 'width', op: op.name || op.id });
  const clear = opt(op, 'tipClearance', nonNeg, 'number >= 0', DEF_CLEAR);
  const dir = op.dir ?? 'climb'; if (!['climb', 'conv'].includes(dir)) throw cerr('cam.op.bad_field', { field: 'dir', expect: 'climb/conv', op: op.name || op.id });
  const exS = opt(op, 'extendStart', nonNeg, 'number >= 0', 0), exE = opt(op, 'extendEnd', nonNeg, 'number >= 0', 0);
  const g = chamferGeom(tool, width, clear);
  if (op.sharp !== undefined && typeof op.sharp !== 'boolean') throw cerr('cam.op.bad_field', { field: 'sharp', expect: 'true/false', op: op.name || op.id });
  const sharp = op.sharp === true;
  // keskin kenarda merkez kenardan yalniz konigin (kenar, zEdge - dz) noktasindaki yaricap kadar uzakta
  if (sharp) g.off = (tool.tipDia ?? 0) / 2 + clear * Math.tan((tool.tipAngle * Math.PI) / 360);
  if (g.needR > tool.dia / 2 + 1e-9) throw cerr('cam.chamfer.tool_small', { width: r3(width), need: r3(2 * g.needR), dia: r3(tool.dia) });
  const items = contourInputs(op, geom);
  const stockTop = S.stockBox.max[2];
  for (const it of items) if (Number.isFinite(it.z) && it.z > stockTop + 1e-6) throw cerr('cam.chamfer.above_stock', { z: r3(it.z), top: r3(stockTop) });
  const zSel = items.find((it) => Number.isFinite(it.z))?.z;
  const h = heights({ ...op, heights: { top: { from: 'selection', off: 0 }, bottom: { from: 'selection', off: 0 }, ...op.heights } }, S, { bottom: zSel, top: zSel });
  const b = new Builder({ zClr: h.zClr, zRet: h.zRet, feed: cut.feedCut, tool });
  let zLow = Infinity; const probes = []; const sharpItems = [];

  for (const it of items) {
    const zEdge = Number.isFinite(it.z) ? it.z : h.zTop; // pahin ust kenari
    const zt = zEdge - g.tipDrop; zLow = Math.min(zLow, zt);
    if (it.chain) {
      const side = op.side; if (side !== 'left' && side !== 'right') throw cerr('cam.chamfer.chain_side');
      const ch0 = extendChain(it.chain, exS, exE);
      const dd = side === 'left' ? g.off : -g.off;
      let ch = miterJoins(P.offsetChainOpen(ch0, dd), ch0.map((x) => x.a).concat([ch0[ch0.length - 1].b]), dd, false);
      // tirmanma: malzeme gidis yonunun sagi = takim solda (side 'left') zincir yonunde; conv ya da sag taraf ters
      const rev = (side === 'left') !== (dir === 'climb');
      if (rev) ch = P.reverseLoop(ch);
      if (sharp) sharpItems.push({ pts: P.polygon(ch0, 0.002).concat([ch0[ch0.length - 1].b.slice()]), closed: false, matLeft: side === 'right', zEdge });
      else try { probes.push({ paths: [P.offsetChainOpen(ch0, side === 'left' ? width / 2 : -width / 2)], zEdge }); } catch (e) { /* kontrol yapilamaz: uyari yok */ }
      b.linkTo(ch[0].a[0], ch[0].a[1], zt, cut.feedPlunge);
      b.segs(ch, zt, cut.feedCut, 'cut'); b.up();
      continue;
    }
    const side = op.side ?? it.defSide; if (!['outside', 'inside'].includes(side)) throw cerr('cam.op.bad_field', { field: 'side', expect: 'outside/inside', op: op.name || op.id });
    const outside = side === 'outside';
    const regs = P.offsetRegions([{ outer: it.loop, holes: [] }], outside ? -g.off : g.off);
    if (!regs.length) throw cerr('cam.contour.tool_too_big', { dia: tool.dia });
    if (sharp) { const ccw = P.area(it.loop) >= 0; sharpItems.push({ pts: P.polygon(ccw ? it.loop : P.reverseLoop(it.loop), 0.002), closed: true, matLeft: outside, zEdge }); }
    else try { probes.push({ paths: P.offsetRegions([{ outer: it.loop, holes: [] }], outside ? -width / 2 : width / 2).map((r) => r.outer), zEdge }); } catch (e) { /* kontrol yapilamaz */ }
    if (!outside && regs.length > 1) warnings.push(warn('cam.contour.split', { n: regs.length }));
    // CCW dongu (bolge solda): disari -> malzeme solda; tirmanma icin CW (ters). Iceri: malzeme sagda; tirmanma CCW
    const flip = outside ? dir === 'climb' : dir === 'conv';
    for (const rg of regs) {
      const mo = miterJoins(rg.outer, it.loop.map((x) => x.a), g.off, true);
      const L0 = flip ? P.reverseLoop(mo) : mo; const L = P.startAt(L0, goodStart(L0));
      b.linkTo(L[0].a[0], L[0].a[1], zt, cut.feedPlunge);
      b.segs(L, zt, cut.feedCut, 'cut'); b.up();
    }
  }
  // model o kenarda pahli degil (keskin kenar): islem modele gore pah kesmez -> sessizlik yerine uyari (WP-07: keskin kenara pah atma kipi)
  if (probes.some((pr) => modelChamfered(ctx.modelMap, pr.paths, pr.zEdge, g.dz) === false)) warnings.push(warn('cam.chamfer.model_sharp', {}));
  if (!b.moves.length) throw cerr('cam.contour.nothing', { top: r3(h.zTop), bottom: r3(h.zBot) });
  return finishToolpath(op, tool, cut, { ...h, zBot: zLow }, b, { warnings, passDepth: g.tipDrop, comp: 'computer', rapidFeed: machine?.feed?.rapid ?? undefined, meta: { chamfer: { width: r3(width), depth: r3(g.dz), tipDia: tool.tipDia ?? 0, ...(sharp ? { sharp: true } : {}) }, ...(sharp ? { chamferSharp: { width: r3(width), dz: r3(g.dz), items: sharpItems.map((x) => ({ closed: x.closed, matLeft: x.matLeft, zEdge: r3(x.zEdge), pts: x.pts.map((q) => [r3(q[0]), r3(q[1])]) })) } } : {}) } });
}
