// WP-12: 2D uyarlanir (adaptif) kaba bosaltma. O-038: kendi kodumuz, temiz yazim (FreeCAD kodu alinmadi).
// Yontem (O onerisi): bolge bir hucre izgarasinda (hucre merkezi anlami) tutulur; her hucrenin "malzeme ust z"si (hg) vardir.
// Takim, temizlenmis alanin sinirini izleyen pasolarla ilerler; her adimda aday yonler taranir ve takimin ON yarim
// cemberindeki malzeme orneklerinden olculen temas acisi theta <= thetaMax (= acos(1 - optimalLoad/r)) kosulunu saglayan,
// hedefe en yakin yon secilir (tirmanmada malzeme sagda). Uygun yon yoksa adim kisalir (s, s/2, s/4); yine yoksa paso biter.
// Takim merkezi daima izinli bolgededir (sanal bolge - (r + yanal pay)); acik kenar = pocketRegion'in sanal disa uzatmasi.
// Malzeme: kurulum stogu (kutu/silindir haritasi) ya da rest (onceki islemlerden kalan stok / onceki takim).
// Pasolar arasi baglanti: "asagida kal" (stayDown) acikken bos hucrelerden (malzemeye r'den uzak) dogru ya da izgara yolu ile
// ayni z'de ilerleme; yol yoksa ya da kapaliysa retract duzlemi (Builder.linkTo). Hava yoksa giris: helis (ya da dalma).
// SINIRLAR: temas acisi izgara cozunurlugu (g) kadar belirsizdir (yaklasik bir hucre radyal); giris (helis/dalma) hareketleri
// tanim geregi sinirin disindadir (kind 'ramp'/'plunge').
import { cerr } from '../geom/err.js';
import * as P from '../geom/path2d.js';
import { need, opt, posNum, cutting, heights, depthLevels, Builder, finishToolpath, warn, r3, belowStockAllow, stockToLeave } from './common.js';
import { pocketRegion, SegGrid } from './pocket.js';
import { helixArcs } from './helix.js';
import { stockHeightmap } from '../sim/index.js';

const MAX_CELLS = 1.5e6;
const NS = 48;                      // on yarim cember ornek sayisi
const DPHI = Math.PI / NS;
const PHI = Float64Array.from({ length: NS }, (_, k) => -Math.PI / 2 + (k + 0.5) * DPHI);
const CPHI = PHI.map(Math.cos), SPHI = PHI.map(Math.sin);
const TURNS = (() => { const a = [0]; for (let d = 5; d <= 150; d += 5) a.push(d, -d); return a.map((x) => (x * Math.PI) / 180); })();
const EPSZ = 1e-4;

// temas acisi <-> radyal kavrama: theta = acos(1 - ae/r)  (0 <= ae <= 2r)
export const engageAngle = (ae, r) => Math.acos(Math.max(-1, Math.min(1, 1 - ae / r)));

// ------------------------------------------------------------------ izgara yardimcilari
// halkalarin tek-cift kurali ile tarama dolgusu (hucre merkezleri)
function rasterize(loops, G, tol) {
  const out = new Uint8Array(G.nx * G.ny); const polys = loops.map((l) => P.polygon(l, tol));
  const xs = [];
  for (let j = 0; j < G.ny; j++) {
    const y = G.y0 + (j + 0.5) * G.g; xs.length = 0;
    for (const pg of polys) for (let i = 0, n = pg.length; i < n; i++) {
      const a = pg[i], b = pg[(i + 1) % n];
      if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - G.x0) / G.g - 0.5)), i1 = Math.min(G.nx - 1, Math.floor((xs[k + 1] - G.x0) / G.g - 0.5));
      for (let i = i0; i <= i1; i++) out[j * G.nx + i] = 1;
    }
  }
  return out;
}
// Oklid uzaklik donusumu (Felzenszwalb): her hucre merkezinden en yakin "on" hucre merkezine uzaklik (mm)
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k] && k > 0) k--; else break; }
    if (s <= z[k]) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; k = 0; continue; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
}
export function edt(on, nx, ny, g) {
  const INF = 1e20; const N = Math.max(nx, ny); const f = new Float64Array(N), d = new Float64Array(N), v = new Int32Array(N), z = new Float64Array(N + 1);
  const tmp = new Float64Array(nx * ny); const out = new Float32Array(nx * ny);
  for (let i = 0; i < nx; i++) { for (let j = 0; j < ny; j++) f[j] = on(j * nx + i) ? 0 : INF; edt1(f, ny, d, v, z); for (let j = 0; j < ny; j++) tmp[j * nx + i] = d[j]; }
  for (let j = 0; j < ny; j++) { for (let i = 0; i < nx; i++) f[i] = tmp[j * nx + i]; edt1(f, nx, d, v, z); for (let i = 0; i < nx; i++) out[j * nx + i] = d[i] >= INF / 2 ? Infinity : Math.sqrt(d[i]) * g; }
  return out;
}

// ------------------------------------------------------------------ hesap
export function computeAdaptive(op, ctx) {
  const { setup: S, tool, geom, machine } = ctx;
  const nm = op.name || op.id;
  const cut = cutting(op); const r = tool.dia / 2; const warnings = [];
  const ae = need(op, 'optimalLoad'); if (!(ae < tool.dia)) throw cerr('cam.adaptive.load_too_big', { load: ae, dia: tool.dia });
  const sd = need(op, 'stepdown');
  const { radial: stR, axial: stA } = stockToLeave(op);
  const dir = op.dir ?? 'climb'; if (!['climb', 'conv'].includes(dir)) throw cerr('cam.op.bad_field', { field: 'dir', expect: 'climb/conv', op: nm });
  const stayDown = op.stayDown !== false;
  // giris yalniz helis (hava yoksa): dalma tam kavrama demektir, temas siniriyla celisir
  const entry = op.entry ?? { kind: 'helix' };
  if (entry.kind !== 'helix') throw cerr('cam.op.bad_field', { field: 'entry.kind', expect: 'helix', op: nm });
  const ang = need(op, 'entry.angle', (v) => v > 0 && v <= 45, '0 < angle <= 45');
  const helixR = need(op, 'entry.helixDia') / 2;
  if (!(helixR <= r + 1e-9)) throw cerr('cam.adaptive.helix_big', { helix: r3(2 * helixR), dia: tool.dia });
  const rest = op.rest && op.rest.source ? op.rest : null;
  if (rest && !['stock', 'tool'].includes(rest.source)) throw cerr('cam.op.bad_field', { field: 'rest.source', expect: 'stock/tool', op: nm });
  const restR = rest?.source === 'tool' ? need(op, 'rest.toolDia') / 2 : 0;
  if (rest?.source === 'tool' && !(restR > r)) throw cerr('cam.adaptive.rest_tool_small', { prev: r3(2 * restR), dia: tool.dia });
  const stockMap = ctx.stockMap?.data ? ctx.stockMap : null;
  if (rest?.source === 'stock' && !stockMap) throw cerr('cam.adaptive.rest_no_stock');
  const faces = geom?.faces || []; if (!faces.length || !Array.isArray(op.geom) || !op.geom.length) throw cerr('cam.op.missing', { field: 'geom', op: nm });
  const zSel = faces[0].z;
  const h = heights({ ...op, heights: { top: { from: 'stockTop', off: 0 }, bottom: { from: 'selection', off: 0 }, ...op.heights } }, S, { bottom: zSel, top: zSel });
  const zBot = h.zBot + stA; if (!(h.zTop > zBot + 1e-9)) throw cerr('cam.pocket.nothing', { top: r3(h.zTop), bottom: r3(zBot) });
  const levels = depthLevels(h.zTop, zBot, sd, null);
  const passDepth = levels.reduce((m, z, i) => Math.max(m, (i ? levels[i - 1] : h.zTop) - z), 0);
  const b = new Builder({ zClr: h.zClr, zRet: h.zRet, feed: cut.feedCut, tool });
  const thMax = engageAngle(ae, r);
  const stats = { maxTheta: 0, passes: 0, links: 0, lifts: 0, entries: 0, restArea: 0 };

  for (const face of faces) {
    if (faces.length > 1 && Math.abs(face.z - zSel) > 1e-6) throw cerr('cam.pocket.faces_differ_z');
    // acik kenar: sanal bant takim capindan genis (bos baslangic seridi icin): W = 2(1,25 r) + yanal pay
    const { region: Rv } = pocketRegion(face, 1.25 * r, stR);
    clearRegion({ Rv, S, r, stR, ae, thMax, levels, zTop: h.zTop, dir, stayDown, entry, ang, helixR, rest, restR, stockMap, b, cut, stats, nm, shouldStop: ctx.shouldStop || null });
  }
  if (!stats.passes && !stats.entries) { // WP-22c: hic yol yoksa nedeni (girissiz / erisilemeyen alan) kaybolmasin: hata metninde alan
    if (stats.noEntry > 1e-3) throw cerr('cam.adaptive.no_entry_left', { area: r3(stats.noEntry) });
    if (stats.restArea > 1e-3) throw cerr('cam.pocket.rest_material', { area: r3(stats.restArea) });
    throw cerr('cam.adaptive.nothing');
  }
  if (stats.restArea > 1e-3) warnings.push(warn('cam.pocket.rest_material', { area: r3(stats.restArea) }));
  if (stats.noEntry) warnings.push(warn('cam.adaptive.no_entry_left', { area: r3(stats.noEntry) }));
  return finishToolpath(op, tool, cut, { ...h, zBot }, b, { warnings, passDepth, rapidFeed: machine?.feed?.rapid ?? undefined,
    meta: { belowStock: belowStockAllow(op, S, zBot), adaptive: { load: ae, thetaMax: r3((thMax * 180) / Math.PI), maxTheta: r3((stats.maxTheta * 180) / Math.PI), passes: stats.passes, links: stats.links, lifts: stats.lifts, entries: stats.entries, cell: r3(stats.g) } } });
}

// WP-15: A.surf (3D kaba) verilirse izinli merkez maskesi her seviyede yeniden kurulur: surf.allowAt(z, G, cx, cy) -> Uint8Array
// (hucre merkezi izinli mi), surf.exact(x, y, z) -> bool (kesin denetim: model + bitirme payi). Bolge (Rv) yine dis sinirdir.
export function clearRegion(A) {
  const { Rv, S, r, stR, ae, thMax, levels, zTop, dir, stayDown, entry, ang, helixR, rest, restR, stockMap, b, cut, stats } = A;
  const sgn = dir === 'climb' ? -1 : 1; // malzeme tarafi: tirmanmada sag (negatif phi)
  const walls = P.regionSegs(Rv); const dAllow = r + stR + 0.005;
  const bb = P.loopBBox([Rv.outer]); const W = bb[2] - bb[0], H = bb[3] - bb[1];
  let g = Math.min(r / 8, ae / 3); if ((W / g) * (H / g) > MAX_CELLS) g = Math.sqrt((W * H) / MAX_CELLS);
  if (g > r / 4) throw cerr('cam.adaptive.region_too_large', { cell: r3(g) });
  stats.g = Math.max(stats.g || 0, g);
  const pad = 2 * g; const G = { g, x0: bb[0] - pad, y0: bb[1] - pad, nx: Math.ceil((W + 2 * pad) / g), ny: Math.ceil((H + 2 * pad) / g) };
  const { nx, ny } = G; const N = nx * ny;
  const cx = (i) => G.x0 + (i + 0.5) * g, cy = (j) => G.y0 + (j + 0.5) * g;
  const cellOf = (x, y) => { const i = Math.floor((x - G.x0) / g), j = Math.floor((y - G.y0) / g); return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i; };
  const inRv = rasterize([Rv.outer, ...Rv.holes], G, Math.min(1e-3, g / 20));
  const sg = new SegGrid(walls, Math.max(r, g * 4));
  const surf = A.surf || null; let zNow = Infinity;
  const rClr = surf ? r - 0.71 * g : r; // 3D: hucre ancak tamami takim icindeyse temiz sayilir (izgara arasi pim kalmasin)
  const allowed2 = (x, y) => { const c = cellOf(x, y); if (c < 0 || !inRv[c]) return false; return sg.nearest([x, y], dAllow) >= dAllow; };
  // 3D: izinli merkezlerden >= 3g icerdeki nokta kesin izinlidir (R - rc >= g iken: aradaki her temas komsu merkezlerden birinde de olurdu)
  const allowedExact = surf ? (x, y) => { if (!allowed2(x, y)) return false; if (surf.flatR >= g) { const c = cellOf(x, y); if (c >= 0 && allowC[c] && dToWallNA[c] >= 3 * g) return true; } return surf.exact(x, y, zNow); } : allowed2;
  // izinli hucre (merkez) maskesi (3D: seviyeye gore)
  const allow0 = new Uint8Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const c = j * nx + i; if (inRv[c] && allowed2(cx(i), cy(j))) allow0[c] = 1; }
  let allowC = allow0, dAllowed = null, dToWallNA = null;
  const setMask = (z) => {
    if (surf) { const m = surf.allowAt(z, G, cx, cy); allowC = new Uint8Array(N); for (let c = 0; c < N; c++) allowC[c] = allow0[c] & m[c]; }
    dAllowed = edt((c) => allowC[c] === 1, nx, ny, g); // hucreden en yakin izinli merkeze uzaklik
    dToWallNA = edt((c) => allowC[c] === 0, nx, ny, g); // izinli hucrenin izinsiz bolgeye uzakligi (giris yeri secimi)
  };
  if (!surf) setMask(Infinity);
  const reach = (c) => dAllowed[c] <= r - 0.75 * g;
  // malzeme ust z (hg): stok haritasi (rest) ya da kurulum stogu; bolge disi -inf
  const smap = rest?.source === 'stock' ? stockMap : stockHeightmap(S.stockBox, Math.min(0.5, Math.max(g, 0.1)), S.stockCyl ?? null);
  const hg = new Float32Array(N).fill(-Infinity);
  const sres = smap.res, spad = sres / 2 + g / 2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = j * nx + i; if (!inRv[c]) continue;
    const x = cx(i), y = cy(j); let m = -Infinity;
    const i0 = Math.max(0, Math.floor((x - spad - smap.x0) / sres)), i1 = Math.min(smap.nx - 1, Math.floor((x + spad - smap.x0) / sres));
    const j0 = Math.max(0, Math.floor((y - spad - smap.y0) / sres)), j1 = Math.min(smap.ny - 1, Math.floor((y + spad - smap.y0) / sres));
    for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) { const v = smap.data[jj * smap.nx + ii]; if (v > m) m = v; }
    hg[c] = m;
  }
  if (rest?.source === 'tool') { // onceki (buyuk) takimin erisebildigi her yer o takimin tabanina kadar bosaltilmis sayilir
    const prev = P.offsetRegions([Rv], restR + stR); const pm = rasterize(prev.flatMap((q) => [q.outer, ...q.holes]), G, Math.min(1e-3, g / 20));
    const dp = edt((c) => pm[c] === 1, nx, ny, g); const zf = levels[levels.length - 1];
    for (let c = 0; c < N; c++) if (dp[c] <= restR - 0.5 * g && hg[c] > zf) hg[c] = zf;
  }
  // disk ofsetleri (yaricap r): hucre merkezi kosulu disk temizligi icin
  const mat = new Uint8Array(N); const rch = new Uint8Array(N);
  const bad = new Uint8Array(N);
  const rs = r + 0.5 * g;
  const isMat = (x, y) => { const c = cellOf(x, y); return c >= 0 && mat[c] === 1; };
  // capsule temizligi: [p,q] dogru parcasina uzakligi <= rr olan malzeme hucreleri
  let removed = 0; let undo = null;
  const clearCapsule = (p, q, rr, z) => {
    const xmin = Math.min(p[0], q[0]) - rr, xmax = Math.max(p[0], q[0]) + rr, ymin = Math.min(p[1], q[1]) - rr, ymax = Math.max(p[1], q[1]) + rr;
    const i0 = Math.max(0, Math.floor((xmin - G.x0) / g)), i1 = Math.min(nx - 1, Math.floor((xmax - G.x0) / g)), j0 = Math.max(0, Math.floor((ymin - G.y0) / g)), j1 = Math.min(ny - 1, Math.floor((ymax - G.y0) / g));
    const dx = q[0] - p[0], dy = q[1] - p[1], L2 = dx * dx + dy * dy, r2 = rr * rr;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * nx + i; if (hg[c] <= z + EPSZ) continue;
      const x = cx(i) - p[0], y = cy(j) - p[1]; const t = L2 > 0 ? Math.max(0, Math.min(1, (x * dx + y * dy) / L2)) : 0;
      const ex = x - t * dx, ey = y - t * dy; if (ex * ex + ey * ey <= r2) { if (undo) undo.push(c, hg[c], mat[c] | (rch[c] << 1)); hg[c] = z; mat[c] = 0; if (rch[c]) { rch[c] = 0; removed++; } }
    }
  };
  const clearRing = (c0, rh, z) => { // helis: |d - rh| <= r
    const rr = rh + r; const i0 = Math.max(0, Math.floor((c0[0] - rr - G.x0) / g)), i1 = Math.min(nx - 1, Math.floor((c0[0] + rr - G.x0) / g)), j0 = Math.max(0, Math.floor((c0[1] - rr - G.y0) / g)), j1 = Math.min(ny - 1, Math.floor((c0[1] + rr - G.y0) / g));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = j * nx + i; const d = Math.hypot(cx(i) - c0[0], cy(j) - c0[1]); if (Math.abs(d - rh) <= r && hg[c] > z + EPSZ) { hg[c] = z; mat[c] = 0; if (rch[c]) { rch[c] = 0; removed++; } } }
  };
  const maxIn = (c0, rr) => { // diskteki en yuksek malzeme
    let m = -Infinity; const i0 = Math.max(0, Math.floor((c0[0] - rr - G.x0) / g)), i1 = Math.min(nx - 1, Math.floor((c0[0] + rr - G.x0) / g)), j0 = Math.max(0, Math.floor((c0[1] - rr - G.y0) / g)), j1 = Math.min(ny - 1, Math.floor((c0[1] + rr - G.y0) / g));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = j * nx + i; if (hg[c] > m && Math.hypot(cx(i) - c0[0], cy(j) - c0[1]) <= rr + g) m = hg[c]; }
    return m;
  };
  // on yarim cemberde temas: {th, side} (side: malzeme orneklerinin sin(phi) toplami)
  const engage = (x, y, a) => {
    let n = 0, sd = 0, fl = 0; const kf = sgn < 0 ? 0 : NS - 1; const ca = Math.cos(a) * rs, sa = Math.sin(a) * rs; // rs = r + g/2: izgara kuantalamasina karsi temkinli
    const ox = x - G.x0, oy = y - G.y0;
    for (let k = 0; k < NS; k++) {
      const px = ox + ca * CPHI[k] - sa * SPHI[k], py = oy + sa * CPHI[k] + ca * SPHI[k];
      const i = Math.floor(px / g), j = Math.floor(py / g); if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      if (mat[j * nx + i] === 1) { n++; sd += PHI[k]; if (k - kf <= 1 && kf - k <= 1) fl = 1; }
    }
    return { th: n * DPHI, side: sd, flank: fl };
  };
  const sideOk = (e) => e.th === 0 || (sgn < 0 ? e.side <= 0 : e.side >= 0);
  const segAllowed = (p, q) => { const L = P.dist(p, q); const n = Math.max(1, Math.ceil(L / (g / 2))); for (let k = 1; k <= n; k++) { const t = k / n; if (!allowedExact(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)) return false; } return true; };
  const s0 = Math.min(r / 3, Math.max(2 * g, 0.5 * ae));
  // duvar dibinde (izinli bolge sinirina 2 hucreden yakin) temas siniri %80: hucre kuantalamasi duvar seridinde temasi eksik gosterir
  const limAt = (q) => { const c = cellOf(q[0], q[1]); return c >= 0 && dToWallNA[c] < 2 * g ? 0.8 * thMax : thMax; };
  const thT = thMax * 0.98;
  // en iyi yon: theta <= thMax, hedefe en yakin; esitlikte az donus
  const bestStep = (p, head) => {
    for (const s of [s0, s0 / 2, s0 / 4]) {
      let best = null;
      for (const dl of TURNS) {
        if (best && best.sc <= 0.05 * Math.abs(dl)) break; // TURNS |dl| sirali: daha iyisi olamaz
        const a = head + dl; const q = [p[0] + s * Math.cos(a), p[1] + s * Math.sin(a)];
        const e = engage(q[0], q[1], a); if (!(e.th > 0) || e.th > limAt(q) + 1e-12 || !sideOk(e)) continue;
        const sc = Math.abs(thT - e.th) + 0.05 * Math.abs(dl) + (e.flank ? 0 : 0.5);
        if (!best || sc < best.sc) best = { sc, a, q, th: e.th };
      }
      if (best && segAllowed(p, best.q)) return best;
      if (best) { // en iyi aday izinsiz: izinli olanlari sirayla dene
        const cands = [];
        for (const dl of TURNS) { const a = head + dl; const q = [p[0] + s * Math.cos(a), p[1] + s * Math.sin(a)]; const e = engage(q[0], q[1], a); if (e.th > 0 && e.th <= limAt(q) + 1e-12 && sideOk(e)) cands.push({ sc: Math.abs(thT - e.th) + 0.05 * Math.abs(dl) + (e.flank ? 0 : 0.5), a, q, th: e.th }); }
        cands.sort((u, v) => u.sc - v.sc); for (const c of cands) if (segAllowed(p, c.q)) return c;
      }
    }
    return null;
  };
  // bosluk: erisilebilir malzemeye uzaklik (erisilemeyen duvar dibi seritleri takim diskine girmez; temas olcumu yine HEPSINI gorur)
  let dmR = null; const refreshDm = () => { dmR = edt((c) => rch[c] === 1, nx, ny, g); };
  const freeAt = (x, y, lim) => { const c = cellOf(x, y); return c >= 0 && dmR[c] > lim; };
  // p'den baslayan ilk adim: 72 yon, kisalan adim; {p, head} | null
  const startAt = (p) => {
    for (const s of [s0, s0 / 2, s0 / 4]) {
      let best = null;
      for (let t = 0; t < 72; t++) {
        const a = (t * Math.PI) / 36; const q = [p[0] + s * Math.cos(a), p[1] + s * Math.sin(a)];
        const e = engage(q[0], q[1], a); if (!(e.th > 0) || e.th > limAt(q) + 1e-12 || !sideOk(e)) continue;
        const sc = Math.abs(thT - e.th) + (e.flank ? 0 : 0.5); if (!best || sc < best.sc) { if (segAllowed(p, q)) best = { sc, a }; }
      }
      if (best) return { p, head: best.a };
    }
    return null;
  };
  // kuru kosu: st'den en cok kmax adim (degisiklikler geri alinir); donus: adim sayisi
  const dryRun = (st, kmax, z, idle = 25) => {
    undo = []; const rem0 = removed; let p = st.p, head = st.head, n = 0;
    for (let k = 0; n < kmax && k < kmax + idle && (n > 0 || k < (idle >= 25 ? kmax + idle : idle)); k++) { const stp = bestStep(p, head); if (!stp) break; const rb = removed; clearCapsule(p, stp.q, rClr, z); p = stp.q; head = stp.a; if (removed > rb) n++; }
    for (let k = undo.length - 3; k >= 0; k -= 3) { hg[undo[k]] = undo[k + 1]; mat[undo[k]] = undo[k + 2] & 1; rch[undo[k]] = undo[k + 2] >> 1; }
    undo = null; removed = rem0; return n;
  };
  // pasonun baslangici: bos (malzemeye > r + g) ve malzeme cephesine yakin izinli hucre; konuma yakin olanlardan uzun
  // paso verebilen (kuru kosu KMAX adim) ilki, yoksa en uzun kuru kosulu
  const KMAX = 10; const MAXTRY = 400;
  const findStart = (pos, z, ext = false) => {
    const cand = [];
    for (let c = 0; c < N; c++) { if (!allowC[c] || bad[c]) continue; if (dmR[c] > r + g && dmR[c] <= r + 3 * g) cand.push(c); }
    if (!cand.length) return null;
    const px = pos ? pos[0] : cx(0), py = pos ? pos[1] : cy(0);
    const dd = (c) => (cx(c % nx) - px) ** 2 + (cy((c / nx) | 0) - py) ** 2;
    cand.sort((u, v) => dd(u) - dd(v));
    let best = null, tried = 0;
    // WP-22c (ext): yakin adaylarin hepsi verimsizse (sikismis kose) aramaya devam (aday basina en cok bir kuru kosu: verimsiz = bad).
    // Yalniz helis yeri cogunlukla havadaysa cagrilir (rest kipi: ince artik); kapali cepte yeni cephe acan helis tercih edilir.
    for (let k = 0; k < cand.length && (tried < 16 || (ext && !best && tried < 16 + MAXTRY)); k++) {
      const c = cand[k]; const p = [cx(c % nx), cy((c / nx) | 0)];
      if (best && dd(c) > (best.d2 + 1) * 16 && tried >= 8) break;
      if (!allowedExact(p[0], p[1])) { bad[c] = 1; continue; }
      const st = startAt(p); if (!st) { bad[c] = 1; continue; }
      tried++; const n = dryRun(st, KMAX, z, tried > 16 ? 6 : 25); // uzatilmis aramada bos yuruyus kisa
      if (n >= KMAX) return { ...st, c };
      if (n > 0 && (!best || n > best.n)) best = { ...st, c, n, d2: dd(c) }; else if (!n) bad[c] = 1;
    }
    return best;
  };
  // bos hucrelerden baglanti yolu (dogru ya da izgara A*): [p...] ya da null
  const freePath = (p, q) => {
    const lim = r + 0.25 * g;
    const losOk = (u, v, skip0, skip1) => { const L = P.dist(u, v); const n = Math.max(1, Math.ceil(L / (g / 2))); for (let k = 0; k <= n; k++) { const t = k / n; const x = u[0] + (v[0] - u[0]) * t, y = u[1] + (v[1] - u[1]) * t; const dl = L * t; if ((skip0 && dl < g) || (skip1 && L - dl < g)) continue; if (!freeAt(x, y, lim) || !allowedExact(x, y)) return false; } return true; };
    if (losOk(p, q, true, true)) return [p, q];
    const s = cellOf(p[0], p[1]), e = cellOf(q[0], q[1]); if (s < 0 || e < 0) return null;
    const pass = (c) => allowC[c] === 1 && dmR[c] > lim;
    const prev = new Int32Array(N).fill(-1); const seen = new Uint8Array(N); const qu = new Int32Array(N); let qh = 0, qt = 0;
    qu[qt++] = s; seen[s] = 1; let found = false;
    while (qh < qt) { const c = qu[qh++]; if (c === e) { found = true; break; } const i = c % nx, j = (c / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const n2 = jj * nx + ii; if (seen[n2] || (!pass(n2) && n2 !== e)) continue; seen[n2] = 1; prev[n2] = c; qu[qt++] = n2; } }
    if (!found) return null;
    const cells = []; for (let c = e; c !== -1; c = prev[c]) cells.push(c); cells.reverse();
    const pts = [p, ...cells.slice(1, -1).map((c) => [cx(c % nx), cy((c / nx) | 0)]), q];
    const out = [pts[0]]; let k = 0;
    while (k < pts.length - 1) { let m = pts.length - 1; while (m > k + 1 && !losOk(pts[k], pts[m], k === 0, m === pts.length - 1)) m--; if (m === k + 1 && !losOk(pts[k], pts[m], k === 0, m === pts.length - 1)) return null; out.push(pts[m]); k = m; }
    return out;
  };
  // Douglas-Peucker sadelestirme (tolerans 0,002 mm; izinli bolge payi 0,005)
  const simplify = (pts, tol = 0.002) => {
    if (pts.length < 3) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) { const [a, c] = st.pop(); let md = 0, mi = -1; const A = pts[a], C = pts[c]; const dx = C[0] - A[0], dy = C[1] - A[1], L = Math.hypot(dx, dy) || 1e-12;
      for (let i = a + 1; i < c; i++) { const d = Math.abs((pts[i][0] - A[0]) * dy - (pts[i][1] - A[1]) * dx) / L; if (d > md) { md = d; mi = i; } }
      if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, c]); } }
    return pts.filter((_, i) => keep[i]);
  };
  const emit = (pts, z, extra) => { for (const q of pts.slice(1)) b.feed(q[0], q[1], z, cut.feedCut, 'cut', extra); };

  let pos = null; let guard = 0;
  for (let li = 0; li < levels.length; li++) {
    const z = levels[li];
    if (surf) { zNow = z; setMask(z); if (A.onLevel) A.onLevel(li, z); }
    let left = 0, unreach = 0;
    // mat: 1 = malzeme (temas olcumu ve bosluk icin HEPSI), rch: takimin erisebildigi malzeme (ilerleme/cephe/giris icin)
    const pt = surf ? surf.partTop(G, cx, cy) : null; // 3D: parcanin kendisi malzeme sayilmaz (duvar gibi)
    for (let c = 0; c < N; c++) { mat[c] = 0; rch[c] = 0; bad[c] = 0; if (inRv[c] && hg[c] > z + EPSZ && !(pt && pt[c] > z + EPSZ)) { mat[c] = 1; if (reach(c)) { rch[c] = 1; left++; } else unreach++; } }
    if (li === levels.length - 1 && !surf) stats.restArea += unreach * g * g;
    const pend = []; // 3D: temizlenecek kucuk artik hucreleri
    let down = false; // takim bu seviyede asagida mi
    let forced = null; // giristen hemen sonra: paso takimin bulundugu yerden baslar
    for (;;) {
      if (++guard > 200000) throw cerr('cam.adaptive.no_progress');
      if (A.shouldStop && (guard & 15) === 0) A.shouldStop(); // WP-22c: iptal / sure siniri denetimi (paso arasi)
      refreshDm();
      let st = forced; forced = null;
      if (!st) st = findStart(pos, z);
      if (!st) {
        let leftNow = 0; for (let c = 0; c < N; c++) leftNow += rch[c];
        if (leftNow * g * g < Math.max(0.05 * r * r, 4 * g * g)) { if (surf) { for (let c = 0; c < N; c++) if (rch[c]) pend.push(c); } else stats.restArea += leftNow * g * g; break; }
        // giris: helis yeri = malzemeli, duvardan en uzak izinli hucre
        let bc = -1;
        for (let c = 0; c < N; c++) if (allowC[c] && dmR[c] < r && dToWallNA[c] >= helixR + g && (bc < 0 || dToWallNA[c] > dToWallNA[bc])) bc = c;
        if (bc < 0) { stats.noEntry = (stats.noEntry || 0) + leftNow * g * g; break; }
        const c0 = [cx(bc % nx), cy((bc / nx) | 0)];
        if (!allowedExact(c0[0], c0[1])) { allowC[bc] = 0; continue; }
        // WP-22c: helis halkasi (helixR + r) cogunlukla bu seviyede zaten bos (hava) ise helis gereksiz: artiga havadan, malzemeye
        // yakin yandan girilebilir mi (uzatilmis paso baslangic aramasi)? Bulunursa helis acilmaz.
        { let nAir = 0, nAll = 0; const RA = helixR + r;
          for (let j = Math.max(0, Math.floor((c0[1] - RA - G.y0) / g)); j <= Math.min(ny - 1, Math.floor((c0[1] + RA - G.y0) / g)); j++) for (let i = Math.max(0, Math.floor((c0[0] - RA - G.x0) / g)); i <= Math.min(nx - 1, Math.floor((c0[0] + RA - G.x0) / g)); i++) { const c = j * nx + i; if (!inRv[c] || Math.hypot(cx(i) - c0[0], cy(j) - c0[1]) > RA) continue; nAll++; if (!mat[c]) nAir++; }
          if (nAll && nAir >= 0.25 * nAll) { const sx = findStart(pos, z, true); if (sx) { forced = sx; stats.sideEntries = (stats.sideEntries || 0) + 1; continue; } } }
        // kucuk artik (ince serit): helis acilmaz, artik sayilir
        let near = 0; const RR = helixR + r;
        for (let j = Math.max(0, Math.floor((c0[1] - RR - G.y0) / g)); j <= Math.min(ny - 1, Math.floor((c0[1] + RR - G.y0) / g)); j++) for (let i = Math.max(0, Math.floor((c0[0] - RR - G.x0) / g)); i <= Math.min(nx - 1, Math.floor((c0[0] + RR - G.x0) / g)); i++) { const c = j * nx + i; if (rch[c] && Math.hypot(cx(i) - c0[0], cy(j) - c0[1]) <= RR) near++; }
        if (near * g * g < 0.5 * ae * r) {
          for (let j = Math.max(0, Math.floor((c0[1] - RR - G.y0) / g)); j <= Math.min(ny - 1, Math.floor((c0[1] + RR - G.y0) / g)); j++) for (let i = Math.max(0, Math.floor((c0[0] - RR - G.x0) / g)); i <= Math.min(nx - 1, Math.floor((c0[0] + RR - G.x0) / g)); i++) { const c = j * nx + i; if (rch[c] && Math.hypot(cx(i) - c0[0], cy(j) - c0[1]) <= RR) rch[c] = 0; }
          if (surf) { for (let j = Math.max(0, Math.floor((c0[1] - RR - G.y0) / g)); j <= Math.min(ny - 1, Math.floor((c0[1] + RR - G.y0) / g)); j++) for (let i = Math.max(0, Math.floor((c0[0] - RR - G.x0) / g)); i <= Math.min(nx - 1, Math.floor((c0[0] + RR - G.x0) / g)); i++) { const c = j * nx + i; if (hg[c] > z + EPSZ && mat[c] && Math.hypot(cx(i) - c0[0], cy(j) - c0[1]) <= RR) pend.push(c); } }
          else stats.restArea += near * g * g; continue;
        }
        const zs = maxIn(c0, helixR + r); const top = Math.max(zs, z);
        const s0p = [c0[0] + helixR, c0[1]];
        b.linkTo(s0p[0], s0p[1], top, cut.feedPlunge, { clear: true }); stats.lifts++;
        const sgH = dir === 'climb' ? 1 : -1; const pitch = 2 * Math.PI * helixR * Math.tan((ang * Math.PI) / 180);
        const turns = top > z + 1e-9 ? Math.max(1, Math.ceil((top - z) / pitch - 1e-9)) : 0;
        if (turns) helixArcs(b, c0, helixR, 0, sgH, top, z, turns * 2 * Math.PI, cut.feedRamp, 'ramp');
        helixArcs(b, c0, helixR, 0, sgH, z, z, 2 * Math.PI, cut.feedRamp, 'ramp');
        clearRing(c0, helixR, z);
        stats.entries++; pos = b.pos.slice(0, 2); down = true;
        refreshDm(); forced = startAt(pos);
        continue;
      }
      // baglanti (giristen sonraki paso yerinde baslar)
      if (P.dist(pos || [Infinity, Infinity], st.p) < 1e-9 && down) { /* yerinde */ }
      else if (down && pos) {
        const path = stayDown ? freePath(pos, st.p) : null;
        if (path) { emit(simplify(path, 0.002), z, { link: true }); stats.links++; }
        else { b.linkTo(st.p[0], st.p[1], z, cut.feedPlunge, { clear: true }); stats.lifts++; }
      } else { b.linkTo(st.p[0], st.p[1], z, cut.feedPlunge, { clear: true }); stats.lifts++; down = true; }
      // paso
      const r0 = removed; let pts = [st.p]; let p = st.p, head = st.head; let nStep = 0; let lastProd = 0; undo = [];
      for (;;) {
        const stp = bestStep(p, head); if (!stp) break;
        const rb = removed; clearCapsule(p, stp.q, rClr, z); if (stp.th > stats.maxTheta) stats.maxTheta = stp.th;
        if (removed > rb) { lastProd = pts.length; undo = []; } else if (pts.length - lastProd > 25) break; // erisilemeyen serit boyunca bos yuruyus: paso biter
        pts.push(stp.q); p = stp.q; head = stp.a;
        if (++nStep > 20000) break;
      }
      if (pts.length - 1 > lastProd) { pts = pts.slice(0, lastProd + 1); p = pts[pts.length - 1]; for (let k = undo.length - 3; k >= 0; k -= 3) { hg[undo[k]] = undo[k + 1]; mat[undo[k]] = undo[k + 2] & 1; rch[undo[k]] = undo[k + 2] >> 1; } } // sondaki verimsiz adimlar atilir (izgara geri alinir)
      undo = null;
      if (removed === r0) { if (st.c != null) bad[st.c] = 1; if (pts.length === 1) { pos = st.p; continue; } }
      emit(simplify(pts), z); stats.passes++; pos = p;
    }
    // 3D: kucuk artiklar (ince pim, serit) birakilmaz: yakindaki izinli merkezden dik inisle (malzeme takim alanindan kucuk) temizlenir
    if (surf && pend.length) {
      const w = Math.ceil(r / g);
      for (const c of pend) {
        if (!(hg[c] > z + EPSZ)) continue; const ci = c % nx, cj = (c / nx) | 0; let best = null, bd = Infinity;
        for (let dj = -w; dj <= w; dj++) for (let di = -w; di <= w; di++) { const ii = ci + di, jj = cj + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const k = jj * nx + ii; if (!allowC[k]) continue; const d = Math.hypot(di, dj) * g; if (d > r - 0.75 * g || d >= bd) continue; const q = [cx(ii), cy(jj)]; if (!allowedExact(q[0], q[1])) continue; bd = d; best = q; }
        if (!best) { stats.restArea += g * g; continue; }
        b.linkTo(best[0], best[1], z, cut.feedPlunge); clearCapsule(best, best, rClr, z); stats.zaps = (stats.zaps || 0) + 1; pos = best;
      }
      pend.length = 0;
    }
    if (surf && A.afterLevel) { A.afterLevel({ z, hg, G, cx, cy, N, inRv }); pos = b.pos ? b.pos.slice(0, 2) : pos; }
  }
  return { hg, G };
}
