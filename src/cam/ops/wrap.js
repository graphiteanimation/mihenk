// WP-16: 4. eksen sarma (wrap). Duz (acilmis) eskiz geometrisi X'e paralel A ekseni etrafindaki silindire sarilir:
//   acilmis (u, v) -> X = u, A = deg(v / r) * isaret(A.dir . +X), Z (setup) -> yaricapsal uzaklik (WCS orijini A ekseni uzerinde).
// r = sarma (referans) yaricapi = setup.wrap.dia / 2 (yoksa stok capi / 2). Takim ekseni daima yaricapsal (Y = 0: takim ekseni A
// ekseninden gecer). Islemler mevcut 2D islemlerin (kontur, cep, delme) "acilmis" sanal duz setup'taki sonucundan uretilir:
//   - yaylar dogru parcalarina bolunur (kiris hatasi WRAP_ARC_TOL); dogru parcasi X/A/Z'de dogrusal = silindir uzerinde helis (tam)
//   - hizli hareketler retract/clearance yaricapinda (stok yaricapinin disinda) -> A donusu stok disinda
//   - delme: her delik kendi A acisinda (hizli A indeksi clearance'ta), cevrim Y = 0'da yaricapsal
// Takim telafisi (G41/G42) sarmada yoktur (bilgisayar telafisi acilmis duzlemde, referans yaricapinda yapilir: derinlikte duvar
// konumu yaricapsal takim geometrisinden dolayi duz eskizden sapar; WP-16 notu).
// Saf JS. Sozlesme: IR tp.wrap = {axis:'X', r}; hareketlerde a (derece, surekli; 360'a sarilmaz).
import { cerr } from '../geom/err.js';
import { computeStats, validateToolpath, sampleArc, walk } from '../ir.js';
import { computeContour } from './contour.js';
import { computePocket } from './pocket.js';
import { computeDrill } from './drill.js';
import { opt, need, anyNum } from './common.js';

export const WRAP_ARC_TOL = 0.002; // mm: acilmis duzlemde yay -> dogru kiris hatasi
const DEG = 180 / Math.PI;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const ID_FRAME = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

function wrapOf(S, op) {
  const W = S?.wrap; if (!W) throw cerr('cam.wrap.no_wrap_setup', { op: op.name || op.id });
  return W;
}
// Acilmis sanal duz setup: stok ustu = stok yaricapi R; Y araligi = cevre (referans yaricapinda); frame gercek setup cercevesi (eskiz -> setup).
export function unwrappedSetup(S) {
  const W = S.wrap, b = S.stockBox, mb = S.modelBBox, c = Math.PI * W.r;
  return { ...S, stockBox: { min: [b.min[0], -c, 0], max: [b.max[0], c, W.R] }, modelBBox: { min: [mb.min[0], -c, Math.max(0, mb.min[2])], max: [mb.max[0], c, Math.min(W.R, mb.max[2])] }, stockTop: W.R, stockCyl: null };
}
// acilmis v (mm, referans yaricapinda) -> A kelimesi (derece)
export const vToA = (W, v) => (v / W.r) * DEG * W.sign;
export const aToV = (W, a) => (a / DEG / W.sign) * W.r;

// Acilmis takim yolu hareketleri -> sarilmis (Y=0, a). Yay -> dogrular. Telafi hareketi kabul edilmez.
export function wrapMoves(moves, W) {
  const out = [];
  walk({ moves }, (m, k, from) => {
    if (m.t === 'rapid' || m.t === 'feed') out.push({ ...m, y: 0, a: vToA(W, m.y) });
    else if (m.t === 'arc') { for (const p of sampleArc(from, m, WRAP_ARC_TOL)) out.push({ t: 'feed', x: p[0], y: 0, z: p[2], f: m.f, kind: m.kind, a: vToA(W, p[1]) }); }
    else if (m.t === 'dwell') out.push({ ...m });
    else throw cerr('cam.wrap.move_unsupported', { t: m.t });
  });
  return out;
}
function finishWrap(op, tp, W, extraMeta = {}) {
  const out = { ...tp, opType: op.type, wrap: { axis: 'X', r: W.r }, meta: { ...(tp.meta || {}), wrap: { r: W.r, R: W.R, sign: W.sign }, ...extraMeta } };
  delete out.stats; out.stats = computeStats(out);
  try { validateToolpath(out); } catch (e) { throw cerr('cam.internal_ir', { code: e.code || 'internal', params: JSON.stringify(e.params || {}) }); }
  return out;
}
function noWear(op) { if ((op.comp ?? 'computer') !== 'computer') throw cerr('cam.wrap.no_wear_comp', { op: op.name || op.id }); }

// Sarilmis kontur (kanal / yazi / profil): computeContour acilmis duzlemde, sonra sarma.
export function computeWrapContour(op, ctx) {
  const W = wrapOf(ctx.setup, op); noWear(op);
  const tp = computeContour({ ...op, type: 'contour', comp: 'computer' }, { ...ctx, setup: unwrappedSetup(ctx.setup) });
  return finishWrap(op, { ...tp, moves: wrapMoves(tp.moves, W) }, W);
}
// Sarilmis cep
export function computeWrapPocket(op, ctx) {
  const W = wrapOf(ctx.setup, op); noWear(op);
  if (op.entry?.kind === 'predrill') throw cerr('cam.wrap.predrill_unsupported');
  const tp = computePocket({ ...op, type: 'pocket' }, { ...ctx, setup: unwrappedSetup(ctx.setup), stockMap: null, modelMap: null });
  return finishWrap(op, { ...tp, moves: wrapMoves(tp.moves, W) }, W);
}

// Sarilmis delme (yaricapsal delikler, A indeksli). Konumlar: op.points [{x, a}] (a derece) ya da geom.points (eskiz noktalari, model
// uzayi -> setup: x = u, a = v / r). Delik ustu = stok yaricapi (op.top verilmisse o yaricap). Her delik ayri cevrim; delikler arasi
// gecis clearance yaricapinda hizli (A + X). Sira: op.order 'asis' (verilen) | 'angle' (A sonra X).
export function computeWrapDrill(op, ctx) {
  const S = ctx.setup, W = wrapOf(S, op);
  const top = opt(op, 'top', (v) => isNum(v) && v > 0, 'number > 0', W.R);
  let holes = [];
  if (Array.isArray(op.points) && op.points.length) holes = op.points.map((p, i) => ({ x: need({ ...p, name: op.name || op.id }, 'x', anyNum, 'number'), a: need({ ...p, name: (op.name || op.id) + '#' + i }, 'a', anyNum, 'number') }));
  else for (const p of ctx.geom?.points || []) { const d = [p.p[0] - S.frame.o[0], p.p[1] - S.frame.o[1], p.p[2] - S.frame.o[2]]; const u = d[0] * S.frame.x[0] + d[1] * S.frame.x[1] + d[2] * S.frame.x[2], v = d[0] * S.frame.y[0] + d[1] * S.frame.y[1] + d[2] * S.frame.y[2]; holes.push({ x: u, a: vToA(W, v) }); }
  if (!holes.length) throw cerr('cam.drill.no_holes');
  const order = op.order ?? 'asis'; if (!['asis', 'angle'].includes(order)) throw cerr('cam.op.bad_field', { field: 'order', expect: 'asis/angle', op: op.name || op.id });
  if (order === 'angle') holes = holes.slice().sort((p, q) => p.a - q.a || p.x - q.x);
  const uniq = []; for (const h of holes) if (!uniq.some((u) => Math.abs(u.x - h.x) < 1e-6 && Math.abs(u.a - h.a) < 1e-6)) uniq.push(h);
  const S1 = { ...unwrappedSetup(S), frame: ID_FRAME };
  const opx = { ...op, type: 'drill', holes: { kind: 'points' }, order: 'asis' };
  const moves = []; const warnings = []; let first = null;
  for (const h of uniq) {
    const tp = computeDrill(opx, { ...ctx, setup: S1, geom: { points: [{ p: [h.x, 0, top] }] }, stockMap: null, modelMap: null });
    if (!first) first = tp; for (const w of tp.warnings || []) if (!warnings.some((x) => x.code === w.code)) warnings.push(w);
    for (const m of tp.moves) moves.push(m.t === 'rapid' ? { ...m, y: 0, a: h.a } : m);
  }
  return finishWrap(op, { ...first, moves, warnings, meta: { ...first.meta, holes: uniq.length, cycles: uniq.length } }, W);
}
