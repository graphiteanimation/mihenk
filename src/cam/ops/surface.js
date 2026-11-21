// WP-15: 3D islemler (setup cercevesi, takim ekseni +Z). Model: ucgen agi (surf/mesh.js), temas: drop-cutter (surf/drop.js).
//  adaptive3d : 3D uyarlanir kaba. Z kademeleri + her kademede 2D uyarlanir motor (adaptive.js clearRegion); izinli merkez =
//               drop-cutter CL yuksekligi <= kademe (model + bitirme payi); malzeme haritasi kademeden kademeye tasinir (onceki
//               kademenin biraktigi stok); ara seviyeler (fillStepdown) ve yatay alan seviyeleri ana kademelerden SONRA yalniz
//               kalan basamaklari keser; rest.source 'stock' = onceki islemlerin biraktigi stok (3D rest kaba).
//  zlevel     : Z-seviye kontur bitirme: CL izgarasinda es-yukseklik egrileri (kesisimler ikiye bolmeyle kesin), egim araligi.
//  parallel   : paralel (raster) bitirme: hat boyunca drop-cutter + uyarlanir ornekleme, egim araligi, zikzak.
//  scallop    : sabit tepe (scallop) bitirme: CL yuzeyinde egrilik duzeltmeli uzaklik alani (Dijkstra, 16 komsu) es-egrileri.
//  pencil     : kalem izi: CL yuzeyindeki ic bukey kirisimler (iki tegetli temas: ic koseler).
//  rest       : bitirmede rest: { toolDia, cornerR? } onceki takimin biraktigi malzeme (morfolojik kapama) olan yerler.
// Oyma guvencesi: her nokta kesin drop-cutter; iki nokta arasi orta + ceyrek noktalarda CL ile dogrusal ara deger farki tol/4'u
// asarsa bolunur; ucurumda (parca <= 0,005 mm) once yukselip sonra ilerleme (basamak). Ag sapmasi (M.tol) ve bitirme payi
// tekdüze ofset olarak takima eklenir.
import { cerr } from '../geom/err.js';
import * as P from '../geom/path2d.js';
import { need, opt, posNum, nonNeg, cutting, heights, depthLevels, Builder, finishToolpath, warn, r3, stockToLeave, belowStockAllow } from './common.js';
import { modelFromGeom, TriIndex } from '../surf/mesh.js';
import { makeCutter, makeDropper, clGrid, slopeDeg, SURF_TOOLS } from '../surf/drop.js';
import { isoLines } from '../surf/iso.js';
import { clearRegion, engageAngle } from './adaptive.js';

export const SURF3D_TYPES = ['adaptive3d', 'zlevel', 'parallel', 'scallop', 'pencil'];
const MAX_NODES = 4e6;
const IXC = new WeakMap();
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const noStop = () => {};

// ------------------------------------------------------------------ ortak hazirlik
function prep(op, ctx, { tools = SURF_TOOLS, bottomDef = 'modelBottom' } = {}) {
  const { setup: S, tool, geom } = ctx; const nm = op.name || op.id;
  if (!tools.includes(tool.type)) throw cerr('cam.surf.tool_type', { type: tool.type, op: nm });
  const cut = cutting(op);
  const M = modelFromGeom(geom, S.frame);
  let IX = IXC.get(M); if (!IX) { const d = Math.max(tool.dia, 1); IX = new TriIndex(M, Math.max(0.25, d / 4)); IXC.set(M, IX); }
  const st = stockToLeave(op);
  const tol = opt(op, 'tolerance', (v) => isNum(v) && v > 0 && v <= 0.2, '0 < tol <= 0.2', 0.01);
  const h = heights({ ...op, heights: { top: { from: 'stockTop', off: 0 }, bottom: { from: bottomDef, off: 0 }, ...op.heights } }, S, { top: M.bbox.max[2], bottom: M.bbox.min[2] });
  const mtol = M.tol || 0;
  const C = makeCutter(tool, st.radial + mtol); const drop0 = makeDropper(IX, C);
  const dAx = st.axial - st.radial; // eksenel pay farki (yatay yuzeyde)
  const zFloor = h.zBot;
  const drop = (x, y) => drop0(x, y, zFloor - dAx) + dAx;
  const R = tool.dia / 2;
  // sinir: takim merkezi dikdortgeni (model ya da stok kutusu, ofsetli)
  const bd = op.boundary || {}; const bk = bd.kind ?? 'model'; if (!['model', 'stock'].includes(bk)) throw cerr('cam.op.bad_field', { field: 'boundary.kind', expect: 'model/stock', op: nm });
  const boff = opt(op, 'boundary.offset', isNum, 'number', 0);
  const src = bk === 'stock' ? S.stockBox : M.bbox;
  const rect = [src.min[0] - boff, src.min[1] - boff, src.max[0] + boff, src.max[1] + boff];
  if (!(rect[2] > rect[0] && rect[3] > rect[1])) throw cerr('cam.surf.empty_boundary', { op: nm });
  const smin = opt(op, 'slope.min', (v) => isNum(v) && v >= 0 && v <= 90, '0..90', 0), smax = opt(op, 'slope.max', (v) => isNum(v) && v >= 0 && v <= 90, '0..90', 90);
  if (smin > smax) throw cerr('cam.op.bad_field', { field: 'slope', expect: 'min <= max', op: nm });
  const shouldStop = ctx.shouldStop || noStop;
  const b = new Builder({ zClr: h.zClr, zRet: h.zRet, feed: cut.feedCut, tool });
  return { S, tool, nm, cut, M, IX, C, st, tol, h, drop, dropRaw: drop0, R, R0: R, rect, smin, smax, zFloor, dAx, b, shouldStop, mtol };
}

// [a..b] arasi oyma guvenli noktalar (a haric, b dahil). tolR: CL ile kiris farki siniri.
function refineSeg(drop, a, b, tolR, out, depth = 0) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy);
  const at = (t) => { const x = a[0] + dx * t, y = a[1] + dy * t; return [x, y, drop(x, y)]; };
  if (L > 1e-9 && depth < 18) {
    const m = at(0.5); let bad = Math.abs(m[2] - (a[2] + b[2]) / 2) > tolR;
    if (!bad && L > 0.02) { const q1 = at(0.25), q3 = at(0.75); bad = Math.abs(q1[2] - (0.75 * a[2] + 0.25 * b[2])) > tolR || Math.abs(q3[2] - (0.25 * a[2] + 0.75 * b[2])) > tolR; }
    if (bad) {
      if (L > 0.005) { refineSeg(drop, a, m, tolR, out, depth + 1); refineSeg(drop, m, b, tolR, out, depth + 1); return; }
      // ucurum: once yuksel (alcak ucta), sonra ilerle
      if (a[2] < b[2]) out.push([a[0], a[1], b[2]]); else out.push([b[0], b[1], a[2]]);
    }
  }
  out.push(b);
}
function dropLine(drop, a, b, ds, tolR) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(L / ds)); const out = [];
  let prev = [a[0], a[1], drop(a[0], a[1])]; out.push(prev);
  for (let k = 1; k <= n; k++) { const t = k / n; const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; q.push(drop(q[0], q[1])); refineSeg(drop, prev, q, tolR, out); prev = q; }
  return out;
}
// CL izgarasi (sinir dikdortgeni, dugumler)
function gridOver(E, g) {
  const { rect } = E; let gg = g; let nx = Math.floor((rect[2] - rect[0]) / gg) + 1, ny = Math.floor((rect[3] - rect[1]) / gg) + 1;
  if (nx * ny > MAX_NODES) { gg = Math.sqrt(((rect[2] - rect[0]) * (rect[3] - rect[1])) / MAX_NODES); nx = Math.floor((rect[2] - rect[0]) / gg) + 1; ny = Math.floor((rect[3] - rect[1]) / gg) + 1; }
  const x0 = (rect[0] + rect[2]) / 2 - ((nx - 1) * gg) / 2, y0 = (rect[1] + rect[3]) / 2 - ((ny - 1) * gg) / 2;
  return clGrid(E.drop, x0, y0, gg, nx, ny, -Infinity, E.shouldStop);
}
// dugum egimi (derece), merkezi fark (kenarda tek yonlu)
function slopeGrid(Gd) {
  const { H, nx, ny, g } = Gd; const out = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; const xl = i > 0 ? H[k - 1] : H[k], xr = i < nx - 1 ? H[k + 1] : H[k], yl = j > 0 ? H[k - nx] : H[k], yr = j < ny - 1 ? H[k + nx] : H[k];
    const gx = (xr - xl) / (g * ((i > 0) + (i < nx - 1))), gy = (yr - yl) / (g * ((j > 0) + (j < ny - 1)));
    out[k] = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
  }
  return out;
}
const sampleNode = (Gd, A, x, y) => { const i = Math.round((x - Gd.x0) / Gd.g), j = Math.round((y - Gd.y0) / Gd.g); if (i < 0 || j < 0 || i >= Gd.nx || j >= Gd.ny) return 0; return A[j * Gd.nx + i]; };

// rest maskesi: onceki takimin (R1, rc1) biraktigi malzeme kalinligi (kapama) - bu takiminki > esik olan dugumler (takim yaricapi
// kadar genisletilmis). Uint8Array (Gd dugumleri)
function restMask(E, op, Gd) {
  const nm = E.nm; const d1 = need(op, 'rest.toolDia');
  const cr1 = op.rest.cornerR; // yoksa kure uclu
  const t1 = cr1 == null || cr1 >= d1 / 2 ? { type: 'ball', dia: d1 } : cr1 > 0 ? { type: 'bullnose', dia: d1, cornerR: cr1 } : { type: 'flat', dia: d1 };
  if (!(d1 > E.tool.dia)) throw cerr('cam.surf.rest_tool_small', { prev: r3(d1), dia: E.tool.dia, op: nm });
  const thr = opt(op, 'rest.threshold', posNum, 'number > 0', Math.max(0.02, E.tol * 2));
  const C1 = makeCutter(t1, E.st.radial + E.mtol); const dr1 = makeDropper(E.IX, C1);
  const { nx, ny, g, x0, y0 } = Gd; const H1 = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) { E.shouldStop(); for (let i = 0; i < nx; i++) H1[j * nx + i] = dr1(x0 + i * g, y0 + j * g, E.zFloor); }
  // zarf: env(p) = min_c H(c) + prof(|c-p|)  (gercek takim profili; dugum ornekli)
  const env = (H, Cc) => {
    const out = new Float64Array(nx * ny); const w = Math.ceil(Cc.R0 / g); const offs = [];
    for (let dj = -w; dj <= w; dj++) for (let di = -w; di <= w; di++) { const d = Math.hypot(di, dj) * g; if (d <= Cc.R0) offs.push(di, dj, Cc.prof(d)); }
    for (let j = 0; j < ny; j++) { E.shouldStop(); for (let i = 0; i < nx; i++) { let m = Infinity; for (let q = 0; q < offs.length; q += 3) { const ii = i + offs[q], jj = j + offs[q + 1]; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const v = H[jj * nx + ii] + offs[q + 2]; if (v < m) m = v; } out[j * nx + i] = m; } }
    return out;
  };
  const e1 = env(H1, C1), e0 = env(Gd.H, E.C);
  const on = new Uint8Array(nx * ny); for (let k = 0; k < on.length; k++) if (e1[k] - e0[k] > thr) on[k] = 1;
  // takim konumu c secilir: diskindeki bir rest dugumunde p takim alt yuzeyi onceki zarfin altina iner (kalan malzemeye degiyor)
  const w = Math.ceil(E.R0 / g); const offs = []; for (let dj = -w; dj <= w; dj++) for (let di = -w; di <= w; di++) { const d = Math.hypot(di, dj) * g; if (d <= E.R0) offs.push(di, dj, E.C.prof(d)); }
  const out = new Uint8Array(nx * ny); const H = Gd.H;
  for (let j = 0; j < ny; j++) { E.shouldStop(); for (let i = 0; i < nx; i++) { const hc = H[j * nx + i]; for (let q = 0; q < offs.length; q += 3) { const ii = i + offs[q], jj = j + offs[q + 1]; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const k = jj * nx + ii; if (on[k] && hc + offs[q + 2] < e1[k] - thr / 2) { out[j * nx + i] = 1; break; } } } }
  return out;
}

// Yol listesi (her biri [[x,y,z],...]) -> hareketler. Baglanti: kisa ve guvenli ise yuzey uzerinde (link), degilse geri cekme.
function emitPaths(E, paths, { linkMax, surfaceLink = true, ds }) {
  const { b, cut, drop, tol } = E; let pos = null; let links = 0, lifts = 0;
  for (const pts of paths) {
    if (pts.length < 2) continue;
    const s = pts[0];
    if (pos && surfaceLink && Math.hypot(s[0] - pos[0], s[1] - pos[1]) <= linkMax) {
      const L = dropLine(drop, pos, s, ds, tol / 4); L[0] = pos; L[L.length - 1] = s;
      let zmax = -Infinity; for (const q of L) zmax = Math.max(zmax, q[2]);
      if (zmax - Math.min(pos[2], s[2]) <= Math.max(2 * E.R, 1)) { for (const q of L.slice(1)) b.feed(q[0], q[1], q[2], cut.feedCut, 'cut', { link: true }); links++; }
      else { b.linkTo(s[0], s[1], s[2], cut.feedPlunge); lifts++; }
    } else { b.linkTo(s[0], s[1], s[2], cut.feedPlunge); lifts++; }
    for (const q of pts.slice(1)) b.feed(q[0], q[1], q[2], cut.feedCut, 'cut');
    pos = pts[pts.length - 1];
  }
  return { links, lifts };
}
// en yakin komsu sirasi (kapali yollar yakin noktadan baslatilir)
function orderPaths(list, start) {
  const out = []; const left = list.slice(); let p = start;
  while (left.length) {
    let bi = 0, bd = Infinity, bk = 0, rev = false;
    for (let i = 0; i < left.length; i++) {
      const L = left[i];
      if (L.closed) { for (let k = 0; k < L.pts.length; k += Math.max(1, (L.pts.length / 64) | 0)) { const d = p ? Math.hypot(L.pts[k][0] - p[0], L.pts[k][1] - p[1]) : 0; if (d < bd) { bd = d; bi = i; bk = k; rev = false; } } }
      else { const a = L.pts[0], z = L.pts[L.pts.length - 1]; const da = p ? Math.hypot(a[0] - p[0], a[1] - p[1]) : 0, dz = p ? Math.hypot(z[0] - p[0], z[1] - p[1]) : 0; if (da < bd) { bd = da; bi = i; bk = 0; rev = false; } if (L.canRev && dz < bd) { bd = dz; bi = i; bk = 0; rev = true; } }
    }
    const L = left.splice(bi, 1)[0]; let pts = L.pts;
    if (L.closed) { pts = [...pts.slice(bk), ...pts.slice(0, bk), pts[bk]]; } else if (rev) pts = pts.slice().reverse();
    out.push(pts); p = pts[pts.length - 1];
  }
  return out;
}
function finish(op, E, ctx, meta, warnings = []) {
  if (!E.b.moves.length) throw cerr('cam.surf.nothing', { op: E.nm });
  return finishToolpath(op, E.tool, E.cut, { ...E.h, zTop: E.h.zTop, zBot: E.zFloor }, E.b, { warnings, rapidFeed: ctx.machine?.feed?.rapid ?? undefined, meta: { belowStock: belowStockAllow(op, E.S, E.zFloor), surf: { tol: E.tol, meshTol: E.mtol, ...meta } } });
}

// ------------------------------------------------------------------ paralel (raster)
export function computeParallel(op, ctx) {
  const E = prep(op, ctx); const { drop, R, rect, tol } = E;
  const so = need(op, 'stepover'); if (!(so < 2 * R)) throw cerr('cam.surf.stepover_big', { stepover: so, dia: E.tool.dia, op: E.nm });
  const ang = (opt(op, 'angle', isNum, 'number', 0) * Math.PI) / 180; const ca = Math.cos(ang), sa = Math.sin(ang);
  const ds = opt(op, 'sampling', posNum, 'number > 0', Math.min(R / 2, 1));
  const zig = (op.pattern ?? 'zigzag') === 'zigzag';
  const useSlope = E.smin > 0 || E.smax < 90; const rest = !!op.rest;
  let Gd = null, SG = null, RM = null;
  if (useSlope || rest) { Gd = gridOver(E, Math.min(so / 2, 0.5, R / 3)); if (useSlope) SG = slopeGrid(Gd); if (rest) RM = restMask(E, op, Gd); }
  const keep = (q) => { if (SG) { const s = sampleNode(Gd, SG, q[0], q[1]); if (s < E.smin - 1e-9 || s > E.smax + 1e-9) return false; } if (RM && !sampleNode(Gd, RM, q[0], q[1])) return false; return true; };
  // dondurulmus koordinatlar: u = x ca + y sa ; v = -x sa + y ca
  const cs = [[rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]]];
  const vs = cs.map((p) => -p[0] * sa + p[1] * ca); const vmin = Math.min(...vs), vmax = Math.max(...vs);
  const nL = Math.max(1, Math.ceil((vmax - vmin) / so - 1e-9)); const runs = []; let odd = false;
  for (let k = 0; k <= nL; k++) {
    E.shouldStop();
    const v = Math.min(vmax, vmin + k * so);
    // dikdortgenle kesisim (u araligi)
    let u0 = -Infinity, u1 = Infinity; const bx = -v * sa, by = v * ca; // hat: (bx,by) + u (ca, sa)
    for (const [d, lo, hi, base] of [[ca, rect[0], rect[2], bx], [sa, rect[1], rect[3], by]]) {
      if (Math.abs(d) < 1e-12) { if (base < lo - 1e-9 || base > hi + 1e-9) { u0 = 1; u1 = 0; } continue; }
      const ta = (lo - base) / d, tb = (hi - base) / d; u0 = Math.max(u0, Math.min(ta, tb)); u1 = Math.min(u1, Math.max(ta, tb));
    }
    if (!(u1 > u0 + 1e-9)) continue;
    let A = [bx + u0 * ca, by + u0 * sa], B = [bx + u1 * ca, by + u1 * sa]; if (zig && odd) { const t = A; A = B; B = t; }
    const pts = dropLine(drop, A, B, ds, tol / 4);
    let cur = []; const line = [];
    for (const q of pts) { if (keep(q)) cur.push(q); else { if (cur.length > 1) line.push(cur); cur = []; } }
    if (cur.length > 1) line.push(cur);
    for (const r of line) runs.push(r);
    if (zig) odd = !odd;
  }
  const lk = emitPaths(E, runs, { linkMax: Math.max(2.5 * so, R), ds: Math.min(ds, so) });
  return finish(op, E, ctx, { kind: 'parallel', stepover: so, lines: nL + 1, runs: runs.length, ...lk });
}

// ------------------------------------------------------------------ Z-seviye kontur
function contoursAt(E, Gd, z, tolR) {
  const { drop } = E; const { H, nx, g, x0, y0 } = Gd;
  const xy = (k) => [x0 + (k % nx) * g, y0 + ((k / nx) | 0) * g];
  const cross = (ka, kb) => { // ka serbest (<= z), kb yasak
    let a = xy(ka), bq = xy(kb);
    for (let it = 0; it < 18; it++) { const m = [(a[0] + bq[0]) / 2, (a[1] + bq[1]) / 2]; if (drop(m[0], m[1]) > z) bq = m; else a = m; }
    return a;
  };
  const lines = isoLines(H, Gd.nx, Gd.ny, z, cross, (i, j) => drop(x0 + (i + 0.5) * g, y0 + (j + 0.5) * g));
  // kiris oyma duzeltmesi: orta nokta yasaksa egriye (serbest tarafa, sol) izdusur
  const fix = (p, q, out, depth) => {
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (depth > 10 || L < 0.002 || drop(m[0], m[1]) <= z + tolR) { out.push(q); return; }
    const nxl = -(q[1] - p[1]) / L, nyl = (q[0] - p[0]) / L; let t = g / 8; let f = null;
    for (let k = 0; k < 8; k++, t *= 2) { const c = [m[0] + nxl * t, m[1] + nyl * t]; if (drop(c[0], c[1]) <= z) { f = c; break; } }
    if (!f) { out.push(q); return; }
    let a = f, bq = m; for (let it = 0; it < 16; it++) { const c = [(a[0] + bq[0]) / 2, (a[1] + bq[1]) / 2]; if (drop(c[0], c[1]) > z) bq = c; else a = c; }
    fix(p, a, out, depth + 1); fix(a, q, out, depth + 1);
  };
  return lines.map((Lr) => {
    const pts = Lr.pts; if (pts.length < 2) return null; const out = [pts[0]];
    const n = Lr.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) fix(pts[i], pts[(i + 1) % pts.length], out, 0);
    if (Lr.closed) out.pop(); // son = ilk
    return { pts: out.map((p) => [p[0], p[1], z]), closed: Lr.closed };
  }).filter(Boolean);
}
// egim araligindaki kosuya bol
function splitBySlope(E, L, hs) {
  if (E.smin <= 0 && E.smax >= 90) return [L];
  const ok = L.pts.map((p) => { const s = slopeDeg(E.drop, p[0], p[1], hs); return s >= E.smin - 1e-9 && s <= E.smax + 1e-9; });
  if (ok.every(Boolean)) return [L];
  const n = L.pts.length; let s0 = 0; if (L.closed) { s0 = ok.indexOf(false); }
  const out = []; let cur = [];
  for (let k = 0; k < n + (L.closed ? 1 : 0); k++) { const i = (s0 + k) % n; if (ok[i]) cur.push(L.pts[i]); else { if (cur.length > 1) out.push({ pts: cur, closed: false }); cur = []; } }
  if (cur.length > 1) out.push({ pts: cur, closed: false });
  return out;
}
export function computeZLevel(op, ctx) {
  const E = prep(op, ctx); const { R, tol } = E;
  const sd = need(op, 'stepdown');
  const g = opt(op, 'sampling', posNum, 'number > 0', Math.min(R / 4, 0.5));
  const dir = op.dir ?? 'climb'; if (!['climb', 'conv'].includes(dir)) throw cerr('cam.op.bad_field', { field: 'dir', expect: 'climb/conv', op: E.nm });
  const Gd = gridOver(E, g);
  let hmax = -Infinity; for (let k = 0; k < Gd.H.length; k++) if (Gd.H[k] > hmax) hmax = Gd.H[k];
  const zTop = Math.min(E.h.zTop, hmax); const levels = [];
  for (let k = 1; ; k++) { const z = zTop - k * sd; if (z <= E.zFloor + 1e-6) break; levels.push(z); }
  if (!levels.length) throw cerr('cam.surf.nothing', { op: E.nm });
  const RM = op.rest ? restMask(E, op, Gd) : null;
  const all = []; let nCont = 0;
  for (const z of levels) {
    E.shouldStop();
    const cs = contoursAt(E, Gd, z, tol / 4);
    for (const L of cs) {
      for (const piece of splitBySlope(E, L, Math.min(0.05, Gd.g / 4))) {
        let parts = [piece];
        if (RM) { parts = []; let cur = []; for (const p of piece.pts) { if (sampleNode(Gd, RM, p[0], p[1])) cur.push(p); else { if (cur.length > 1) parts.push({ pts: cur, closed: false }); cur = []; } } if (cur.length > 1) parts.push({ pts: cur, closed: piece.closed && cur.length === piece.pts.length }); }
        for (const pc of parts) { const pts = dir === 'conv' ? pc.pts.slice().reverse() : pc.pts; nCont++; all.push({ z, pts, closed: pc.closed }); }
      }
    }
  }
  // seviye seviye, en yakin sira; seviye ici kisa guvenli baglanti ayni z'de
  const { b, cut, drop } = E; let pos = null; let lifts = 0, links = 0;
  for (const z of levels) {
    const here = all.filter((q) => q.z === z); if (!here.length) continue;
    const ord = orderPaths(here, pos);
    for (const pts of ord) {
      const s = pts[0]; let direct = false;
      if (pos && Math.abs(pos[2] - z) < 1e-9) {
        const d = Math.hypot(s[0] - pos[0], s[1] - pos[1]);
        if (d <= Math.max(2 * R, 2 * sd)) { direct = true; const n = Math.max(1, Math.ceil(d / (g / 4))); for (let k = 1; k < n; k++) { const t = k / n; if (drop(pos[0] + (s[0] - pos[0]) * t, pos[1] + (s[1] - pos[1]) * t) > z + 1e-9) { direct = false; break; } } }
      }
      if (direct) { b.feed(s[0], s[1], z, cut.feedCut, 'cut', { link: true }); links++; } else { b.linkTo(s[0], s[1], z, cut.feedPlunge); lifts++; }
      for (const q of pts.slice(1)) b.feed(q[0], q[1], z, cut.feedCut, 'cut');
      pos = pts[pts.length - 1];
    }
  }
  return finish(op, E, ctx, { kind: 'zlevel', levels: levels.length, contours: nCont, cell: r3(Gd.g), links, lifts });
}

// ------------------------------------------------------------------ sabit tepe (scallop)
class Heap { constructor() { this.k = []; this.v = []; } push(k, v) { const K = this.k, V = this.v; let i = K.length; K.push(k); V.push(v); while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; } K[i] = k; V[i] = v; } pop() { const K = this.k, V = this.v; const top = V[0]; const lk = K.pop(), lv = V.pop(); if (K.length) { let i = 0; const n = K.length; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] < K[c]) c++; if (K[c] >= lk) break; K[i] = K[c]; V[i] = V[c]; i = c; } K[i] = lk; V[i] = lv; } return top; } get size() { return this.k.length; } topKey() { return this.k[0]; } }
export function scallopWidth(tool, hgt) { const Re = tool.type === 'ball' ? tool.dia / 2 : tool.cornerR; return 2 * Math.sqrt(Math.max(0, 2 * Re * hgt - hgt * hgt)); }
export function computeScallop(op, ctx) {
  const E = prep(op, ctx, { tools: ['ball', 'bullnose'] }); const { R, tol, drop } = E;
  const hs = need(op, 'scallopHeight'); const Re = E.tool.type === 'ball' ? R : E.tool.cornerR;
  if (!(hs < Re)) throw cerr('cam.op.bad_field', { field: 'scallopHeight', expect: '< ' + r3(Re), op: E.nm });
  const w = scallopWidth(E.tool, hs);
  const g = opt(op, 'sampling', posNum, 'number > 0', Math.max(0.03, Math.min(w / 4, R / 6, 0.5)));
  const Gd = gridOver(E, g); const { H, nx, ny, x0, y0 } = Gd; const gg = Gd.g; const N = nx * ny;
  const SG = slopeGrid(Gd); const RM = op.rest ? restMask(E, op, Gd) : null;
  const ok = new Uint8Array(N); for (let k = 0; k < N; k++) ok[k] = SG[k] >= E.smin - 1e-9 && SG[k] <= E.smax + 1e-9 && (!RM || RM[k]) ? 1 : 0;
  // komsuluk (16): (1,0) (1,1) (2,1) ve simetrikleri
  const NB = []; for (const [a, c] of [[1, 0], [1, 1], [2, 1], [1, 2]]) for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const di = sx * a, dj = sy * c; if (!NB.some((q) => q[0] === di && q[1] === dj)) NB.push([di, dj]); if (!NB.some((q) => q[0] === dj && q[1] === di)) NB.push([dj, di]); }
  const Rk = R; // CL egriligi duzeltmesi: w_cl = w / sqrt(1 - R k_cl)  (k_cl > 0 disbukey)
  const wAt = (k, di, dj) => {
    const i = k % nx, j = (k / nx) | 0; const L = Math.hypot(di, dj) * gg; const ux = di / Math.hypot(di, dj), uy = dj / Math.hypot(di, dj);
    const s = gg; const f = (t) => { const ii = Math.round(i + (ux * t) / gg), jj = Math.round(j + (uy * t) / gg); if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) return null; return H[jj * nx + ii]; };
    const hm = f(-s), h0 = H[k], hp = f(s); void L;
    if (hm == null || hp == null) return w;
    const d1 = (hp - hm) / (2 * s), d2 = (hp + hm - 2 * h0) / (s * s);
    const kap = -d2 / Math.pow(1 + d1 * d1, 1.5); const fct = Math.min(4, Math.max(0.25, 1 - Rk * kap));
    return w / Math.sqrt(fct);
  };
  const D = new Float64Array(N).fill(Infinity); const hp = new Heap();
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (!ok[k]) continue;
    let seed = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
    if (!seed) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!ok[k + dj * nx + di]) { seed = true; break; }
    if (seed) { D[k] = 0; hp.push(0, k); }
  }
  let it = 0;
  while (hp.size) {
    const d0 = hp.topKey(); const k = hp.pop(); if (d0 > D[k]) continue; if ((++it & 65535) === 0) E.shouldStop();
    const i = k % nx, j = (k / nx) | 0;
    for (const [di, dj] of NB) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const k2 = jj * nx + ii; if (!ok[k2]) continue;
      const L = Math.hypot(di * gg, dj * gg, H[k2] - H[k]); const c = L / (0.5 * (wAt(k, di, dj) + wAt(k2, di, dj)));
      if (d0 + c < D[k2]) { D[k2] = d0 + c; hp.push(D[k2], k2); }
    }
  }
  let Dmax = 0; for (let k = 0; k < N; k++) if (D[k] < Infinity && D[k] > Dmax) Dmax = D[k];
  const V = new Float64Array(N); for (let k = 0; k < N; k++) V[k] = D[k] < Infinity ? D[k] : NaN;
  const lv = []; for (let q = 0.5; q < Dmax; q += 1) lv.push(q);
  if (lv.length && Dmax - lv[lv.length - 1] > 0.5) lv.push((lv[lv.length - 1] + Dmax) / 2);
  const xy = (k) => [x0 + (k % nx) * gg, y0 + ((k / nx) | 0) * gg];
  const paths = [];
  for (const L of lv) {
    E.shouldStop();
    const lines = isoLines(V, nx, ny, L, (ka, kb) => { const a = xy(ka), c = xy(kb); const t = (L - V[ka]) / (V[kb] - V[ka]); return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]; });
    for (const Ln of lines) {
      if (Ln.pts.length < 2) continue; const src = Ln.closed ? [...Ln.pts, Ln.pts[0]] : Ln.pts;
      const out = [[src[0][0], src[0][1], drop(src[0][0], src[0][1])]];
      for (let k = 1; k < src.length; k++) refineSeg(drop, out[out.length - 1], [src[k][0], src[k][1], drop(src[k][0], src[k][1])], tol / 4, out);
      paths.push({ pts: Ln.closed ? out.slice(0, -1) : out, closed: Ln.closed, canRev: true, lvl: L });
    }
  }
  if (!paths.length) throw cerr('cam.surf.nothing', { op: E.nm });
  // seviye sirasi (distan ice), seviye icinde en yakin
  const ord = []; let p = null;
  for (const L of [...new Set(paths.map((q) => q.lvl))]) { const o = orderPaths(paths.filter((q) => q.lvl === L), p); ord.push(...o); p = o[o.length - 1][o[o.length - 1].length - 1]; }
  const lk = emitPaths(E, ord, { linkMax: 2 * w, ds: Math.min(gg, w / 2) });
  return finish(op, E, ctx, { kind: 'scallop', scallop: hs, width: r3(w), passes: lv.length, cell: r3(gg), ...lk });
}

// ------------------------------------------------------------------ kalem (pencil)
export function computePencil(op, ctx) {
  const E = prep(op, ctx, { tools: ['ball', 'bullnose'] }); const { R, tol, drop } = E;
  const g = opt(op, 'sampling', posNum, 'number > 0', Math.max(0.03, Math.min(R / 6, 0.25)));
  const th = (opt(op, 'minAngle', (v) => isNum(v) && v > 0 && v < 90, '0 < angle < 90', 20) * Math.PI) / 180;
  const Gd = gridOver(E, g); const { H, nx, ny, x0, y0 } = Gd; const gg = Gd.g; const N = nx * ny;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const jump = new Float32Array(N); const jdir = new Int8Array(N).fill(-1);
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = j * nx + i; let bj = 0, bd = -1;
    DIRS.forEach(([di, dj], q) => { const s = gg * Math.hypot(di, dj); const sl = (H[k] - H[k - dj * nx - di]) / s, sr = (H[k + dj * nx + di] - H[k]) / s; const a = Math.atan(sr) - Math.atan(sl); if (a > bj) { bj = a; bd = q; } });
    jump[k] = bj; jdir[k] = bd;
  }
  const on = new Uint8Array(N);
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = j * nx + i; if (jump[k] < th) continue; const [di, dj] = DIRS[jdir[k]];
    if (jump[k] >= jump[k - dj * nx - di] && jump[k] > jump[k + dj * nx + di] - 1e-12) on[k] = 1; // yonlu en buyuk (NMS)
  }
  // zincirler (8 komsu)
  const seen = new Uint8Array(N); const chains = [];
  const nbrs = (k) => { const i = k % nx, j = (k / nx) | 0; const o = []; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const k2 = jj * nx + ii; if (on[k2]) o.push(k2); } return o; };
  const trace = (s) => { const c = [s]; seen[s] = 1; let cur = s; for (;;) { const nb = nbrs(cur).filter((q) => !seen[q]); if (!nb.length) break; const ci = cur % nx, cj = (cur / nx) | 0; nb.sort((a, b2) => (Math.abs((a % nx) - ci) + Math.abs(((a / nx) | 0) - cj)) - (Math.abs((b2 % nx) - ci) + Math.abs(((b2 / nx) | 0) - cj))); cur = nb[0]; seen[cur] = 1; c.push(cur); } return c; };
  for (let k = 0; k < N; k++) if (on[k] && !seen[k] && nbrs(k).length <= 1) chains.push(trace(k));
  for (let k = 0; k < N; k++) if (on[k] && !seen[k]) chains.push(trace(k));
  const minLen = opt(op, 'minLength', posNum, 'number > 0', Math.max(R / 2, 4 * gg));
  const paths = [];
  for (const c of chains) {
    if (c.length < 2) continue;
    let pts = c.map((k) => [x0 + (k % nx) * gg, y0 + ((k / nx) | 0) * gg]);
    // sadelestir (XY, g/2) sonra kesin z
    pts = dp2(pts, gg / 2); let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (len < minLen) continue;
    const out = [[pts[0][0], pts[0][1], drop(pts[0][0], pts[0][1])]];
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], q = pts[i]; const n = Math.max(1, Math.ceil(Math.hypot(q[0] - a[0], q[1] - a[1]) / gg)); for (let s = 1; s <= n; s++) { const t = s / n; const x = a[0] + (q[0] - a[0]) * t, y = a[1] + (q[1] - a[1]) * t; refineSeg(drop, out[out.length - 1], [x, y, drop(x, y)], tol / 4, out); } }
    paths.push({ pts: out, closed: false, canRev: true });
  }
  if (!paths.length) throw cerr('cam.surf.no_pencil', { op: E.nm });
  const lk = emitPaths(E, orderPaths(paths, null), { linkMax: 0, surfaceLink: false, ds: gg });
  return finish(op, E, ctx, { kind: 'pencil', chains: paths.length, cell: r3(gg), angle: r3((th * 180) / Math.PI), ...lk });
}
function dp2(pts, tol) {
  if (pts.length < 3) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, c] = st.pop(); let md = 0, mi = -1; const A = pts[a], Cc = pts[c]; const dx = Cc[0] - A[0], dy = Cc[1] - A[1], L = Math.hypot(dx, dy) || 1e-12; for (let i = a + 1; i < c; i++) { const d = Math.abs((pts[i][0] - A[0]) * dy - (pts[i][1] - A[1]) * dx) / L; if (d > md) { md = d; mi = i; } } if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, c]); } }
  return pts.filter((_, i) => keep[i]);
}

// ------------------------------------------------------------------ 3D uyarlanir kaba
export function computeAdaptive3d(op, ctx) {
  const E = prep(op, ctx, { tools: ['flat', 'bullnose'] }); const { S, tool, R: r, nm, drop } = E;
  const ae = need(op, 'optimalLoad'); if (!(ae < tool.dia)) throw cerr('cam.adaptive.load_too_big', { load: ae, dia: tool.dia });
  const sd = need(op, 'stepdown');
  const fill = opt(op, 'fillStepdown', nonNeg, 'number >= 0', 0);
  const flatLv = op.flatLevels !== false;
  const dir = op.dir ?? 'climb'; if (!['climb', 'conv'].includes(dir)) throw cerr('cam.op.bad_field', { field: 'dir', expect: 'climb/conv', op: nm });
  const entry = op.entry ?? { kind: 'helix' }; if (entry.kind !== 'helix') throw cerr('cam.op.bad_field', { field: 'entry.kind', expect: 'helix', op: nm });
  const ang = need(op, 'entry.angle', (v) => v > 0 && v <= 45, '0 < angle <= 45');
  const helixR = need(op, 'entry.helixDia') / 2; if (!(helixR <= r + 1e-9)) throw cerr('cam.adaptive.helix_big', { helix: r3(2 * helixR), dia: tool.dia });
  const rest = op.rest && op.rest.source ? op.rest : null;
  if (rest && rest.source !== 'stock') throw cerr('cam.op.bad_field', { field: 'rest.source', expect: 'stock', op: nm });
  const stockMap = ctx.stockMap?.data ? ctx.stockMap : null; if (rest && !stockMap) throw cerr('cam.adaptive.rest_no_stock');
  const zTop = E.h.zTop, zBot = E.zFloor; if (!(zTop > zBot + 1e-9)) throw cerr('cam.pocket.nothing', { top: r3(zTop), bottom: r3(zBot) });
  const main = depthLevels(zTop, zBot, sd, null);
  // ara seviyeler: ana kademeler arasinda fill adimiyla; yatay alan seviyeleri (yukari bakan yatay ucgenler + eksenel pay)
  const extra = [];
  if (fill > 0 && fill < sd) { let prev = zTop; for (const z of main) { for (let q = z + fill; q < prev - fill / 2; q += fill) extra.push(q); prev = z; } }
  if (flatLv) {
    const zs = new Set(); const D = E.IX.D; for (let t = 0; t < E.IX.nt; t++) if (D[t * 8 + 7] > 0.99999) zs.add(Math.round(D[t * 8 + 4] * 1e4) / 1e4);
    for (const z0 of zs) { const z = z0 + E.st.axial + E.mtol; if (z < zTop - 1e-6 && z > zBot + 1e-6) extra.push(z); }
  }
  const near = (z, list) => list.some((q) => Math.abs(q - z) < 0.02);
  const ex = []; for (const z of extra.sort((a, b2) => b2 - a)) if (!near(z, main) && !near(z, ex)) ex.push(z);
  const levels = [...main, ...ex];
  const passDepth = main.reduce((m, z, i) => Math.max(m, (i ? main[i - 1] : zTop) - z), 0);
  // bolge: stok kutusu + acik kenar seridi
  const W = 1.25 * r + E.st.radial; const bx = S.stockBox;
  const cs = [[bx.min[0] - W, bx.min[1] - W], [bx.max[0] + W, bx.min[1] - W], [bx.max[0] + W, bx.max[1] + W], [bx.min[0] - W, bx.max[1] + W]];
  const Rv = { outer: cs.map((c, i) => P.line(c, cs[(i + 1) % 4])), holes: [] };
  // CL ve parca ust haritalari (hucre merkezleri; izgara clearRegion'dan)
  let Hc = null, Pt = null;
  const surf = {
    allowAt: (z, G, cx, cy) => {
      if (!Hc) { Hc = new Float64Array(G.nx * G.ny); for (let j = 0; j < G.ny; j++) { E.shouldStop(); for (let i = 0; i < G.nx; i++) Hc[j * G.nx + i] = drop(cx(i), cy(j)); } }
      const m = new Uint8Array(G.nx * G.ny); for (let c = 0; c < m.length; c++) m[c] = Hc[c] <= z + 1e-9 ? 1 : 0; return m;
    },
    exact: (x, y, z) => drop(x, y) <= z + 1e-9,
    flatR: E.C.R - E.C.rc, // hizli izin kosulu (clearRegion: flatR >= hucre)
    partTop: (G, cx, cy) => {
      if (!Pt) { const nd = makeDropper(E.IX, makeCutter({ type: 'flat', dia: G.g }, 0)); Pt = new Float64Array(G.nx * G.ny); for (let j = 0; j < G.ny; j++) { E.shouldStop(); for (let i = 0; i < G.nx; i++) Pt[j * G.nx + i] = nd(cx(i), cy(j), -Infinity); } }
      return Pt;
    },
  };
  const b = E.b; const stats = { maxTheta: 0, passes: 0, links: 0, lifts: 0, entries: 0, restArea: 0 };
  clearRegion({ Rv, S, r, stR: 0, ae, thMax: engageAngle(ae, r), levels, zTop, dir, stayDown: op.stayDown !== false, entry, ang, helixR, rest, restR: 0, stockMap, b, cut: E.cut, stats, nm, surf });
  if (!stats.passes && !stats.entries) throw cerr('cam.adaptive.nothing');
  const warnings = []; if (stats.noEntry) warnings.push(warn('cam.adaptive.no_entry_left', { area: r3(stats.noEntry) }));
  return finishToolpath(op, tool, E.cut, { ...E.h, zBot }, b, { warnings, passDepth, rapidFeed: ctx.machine?.feed?.rapid ?? undefined,
    meta: { belowStock: belowStockAllow(op, S, zBot), surf: { kind: 'adaptive3d', tol: E.tol, meshTol: E.mtol, levels: main.length, fillLevels: ex.length }, adaptive: { load: ae, passes: stats.passes, links: stats.links, lifts: stats.lifts, entries: stats.entries, zaps: stats.zaps || 0, cell: r3(stats.g), maxTheta: r3((stats.maxTheta * 180) / Math.PI) } } });
}

export function computeSurface(op, ctx) {
  switch (op.type) {
    case 'adaptive3d': return computeAdaptive3d(op, ctx);
    case 'zlevel': return computeZLevel(op, ctx);
    case 'parallel': return computeParallel(op, ctx);
    case 'scallop': return computeScallop(op, ctx);
    case 'pencil': return computePencil(op, ctx);
    default: throw cerr('cam.op.unsupported', { what: String(op.type) });
  }
}
