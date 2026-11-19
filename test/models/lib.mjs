// Bağımsız çekirdek testleri için ortak yardımcılar.
// Çekirdek kaynağı: MIHENK_SRC ortam değişkeni (varsayılan ../../src). Yalnız status.ok ve geometriye bakılır.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import * as R from 'replicad';

export { R };
const here = path.dirname(fileURLToPath(import.meta.url));
export const SRC = process.env.MIHENK_SRC || path.resolve(here, '../../src');
const wasm = path.resolve(here, '../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
const KM = await import(pathToFileURL(path.join(SRC, 'kernel/kernel.js')).href);
const PM = await import(pathToFileURL(path.join(SRC, 'shared/profiles.js')).href);
const EM = await import(pathToFileURL(path.join(SRC, 'shared/expr.js')).href);
export const findRegions = PM.findRegions;
export const evalExpr = EM.evalExpr;
export const resolveParams = EM.resolveParams;

export const oc = await opencascade({ locateFile: () => wasm });
R.setOC(oc);
export const newKernel = () => new KM.Kernel();
export const isMain = (url) => process.argv[1] && url === pathToFileURL(process.argv[1]).href;

// ------------------------------------------------------------------ test kaydı
export function tester(name) {
  const results = []; const info = {}; let n = 0;
  const rec = (pass, msg, extra) => { results.push({ pass: !!pass, msg, ...(extra || {}) }); if (!pass) console.log('  FAIL [' + name + '] ' + msg); return !!pass; };
  const t = {
    name, results, info,
    ok: (c, msg, extra) => rec(c, msg, extra),
    near(a, b, msg, rel = 1e-4, abs = 1e-9) {
      const pass = Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));
      const relErr = Number.isFinite(a) && b ? (a - b) / Math.abs(b) : null;
      return rec(pass, `${msg}: bulunan ${fmt(a)} beklenen ${fmt(b)}` + (relErr != null ? ` (göreli ${relErr.toExponential(2)})` : ''), { kind: 'near', got: a, exp: b });
    },
    vec(a, b, msg, tol = 1e-4) {
      const pass = Array.isArray(a) && a.length === b.length && a.every((x, i) => Number.isFinite(x) && Math.abs(x - b[i]) <= tol);
      return rec(pass, `${msg}: bulunan [${(a || []).map(fmt)}] beklenen [${b.map(fmt)}]`);
    },
    note(k, v) { info[k] = v; },
    count: () => results.length,
  };
  return t;
}
export const fmt = (x) => (typeof x === 'number' ? (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(4) : String(+x.toFixed(6))) : String(x));
export function finish(t) {
  const pass = t.results.filter((r) => r.pass).length, fail = t.results.length - pass;
  console.log('@@RESULT ' + JSON.stringify({ name: t.name, pass, fail, fails: t.results.filter((r) => !r.pass).map((r) => r.msg), info: t.info }));
  console.log(`${t.name}: ${pass} geçti, ${fail} kaldı`);
  return fail;
}
export async function runMain(url, name, fn) {
  if (!isMain(url)) return;
  const t = tester(name);
  try { await fn(t); } catch (e) { t.ok(false, 'İSTİSNA: ' + (e?.stack || e)); }
  const fails = finish(t);
  process.exit(0);
}

// ------------------------------------------------------------------ sketch kurucu
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };
export class Sk {
  constructor() { this.points = { O: { x: 0, y: 0, fixed: true } }; this.ents = []; this.n = 0; this.m = 0; this.key = new Map(); }
  pt(x, y) { const k = x.toFixed(9) + ',' + y.toFixed(9); if (this.key.has(k)) return this.key.get(k); const id = 'p' + (++this.n); this.points[id] = { x, y }; this.key.set(k, id); return id; }
  freshPt(x, y) { const id = 'p' + (++this.n); this.points[id] = { x, y }; return id; }
  line(a, b, cons) { if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-12) return; this.ents.push({ id: 'e' + (++this.m), type: 'line', a: this.pt(...a), b: this.pt(...b), ...(cons ? { cons: true } : {}) }); }
  circle(cx, cy, r) { this.ents.push({ id: 'e' + (++this.m), type: 'circle', c: this.pt(cx, cy), r }); }
  arc(c, a, b) { this.ents.push({ id: 'e' + (++this.m), type: 'arc', c: this.pt(...c), a: this.pt(...a), b: this.pt(...b) }); }
  point(x, y) { this.ents.push({ id: 'e' + (++this.m), type: 'point', p: this.pt(x, y) }); }
  poly(pts, radii) { for (const s of polyGeom(pts, radii)) { if (s.t === 'l') this.line(s.a, s.b); else this.arc(s.c, s.a, s.b); } }
  rect(x0, y0, x1, y1, r = 0) { this.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [r, r, r, r]); }
  // iki yarım daire + iki çizgi: merkezler c1->c2 (x ekseninde değil de olabilir), yarıçap r
  slot(c1, c2, r) {
    const d = nrm(sub(c2, c1)); const nL = [-d[1], d[0]]; // sol normal
    const a1 = [c1[0] + nL[0] * r, c1[1] + nL[1] * r], a2 = [c2[0] + nL[0] * r, c2[1] + nL[1] * r];
    const b1 = [c1[0] - nL[0] * r, c1[1] - nL[1] * r], b2 = [c2[0] - nL[0] * r, c2[1] - nL[1] * r];
    // CCW dolaşım: b1 -> b2 (sağ taraf), c2 etrafında b2 -> a2 (CCW), a2 -> a1, c1 etrafında a1 -> b1 (CCW)
    this.line(b1, b2); this.arc(c2, b2, a2); this.line(a2, a1); this.arc(c1, a1, b1);
  }
}
// Köşeleri yuvarlatılmış çokgen: parçalar [{t:'l',a,b}|{t:'a',c,a,b,r,turn}] (a->b yay yönü CCW olacak şekilde)
export function polyGeom(pts, radii = []) {
  const n = pts.length;
  const V = pts.map((p, i) => {
    const r = radii[i] || 0; if (!r) return { p, r: 0 };
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const u = nrm(sub(a, p)), w = nrm(sub(b, p));
    const ang = Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1])));
    const t = r / Math.tan(ang / 2);
    const tin = [p[0] + u[0] * t, p[1] + u[1] * t], tout = [p[0] + w[0] * t, p[1] + w[1] * t];
    const bis = nrm([u[0] + w[0], u[1] + w[1]]); const dc = r / Math.sin(ang / 2);
    const c = [p[0] + bis[0] * dc, p[1] + bis[1] * dc];
    const e1 = sub(p, a), e2 = sub(b, p); const turn = e1[0] * e2[1] - e1[1] * e2[0];
    return { p, r, tin, tout, c, turn };
  });
  const segs = [];
  for (let i = 0; i < n; i++) {
    const A = V[i], B = V[(i + 1) % n];
    const o = A.r ? A.tout : A.p, inn = B.r ? B.tin : B.p;
    segs.push({ t: 'l', a: o, b: inn });
    if (B.r) segs.push(B.turn > 0 ? { t: 'a', c: B.c, a: B.tin, b: B.tout, r: B.r } : { t: 'a', c: B.c, a: B.tout, b: B.tin, r: B.r, rev: true });
  }
  return segs;
}
// Aynı çizgiyi örneklenmiş çokgen olarak ver (analitik karşılaştırma için)
export function polySample(pts, radii = [], N = 4000) {
  const out = [];
  for (const s of polyGeom(pts, radii)) {
    if (s.t === 'l') { out.push(s.a); continue; }
    const a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]); let a1 = Math.atan2(s.b[1] - s.c[1], s.b[0] - s.c[0]);
    let sw = a1 - a0; while (sw <= 0) sw += 2 * Math.PI;
    const arr = []; for (let i = 0; i <= N; i++) { const a = a0 + sw * i / N; arr.push([s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)]); }
    if (s.rev) arr.reverse(); out.push(...arr);
  }
  return out;
}
// ------------------------------------------------------------------ analitik yardımcılar
export function polyMoments(P) {
  let A = 0, Sx = 0, Sy = 0, Sxy = 0, Sxx = 0, Syy = 0;
  for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length]; const c = x0 * y1 - x1 * y0;
    A += c / 2; Sx += (x0 + x1) * c / 6; Sy += (y0 + y1) * c / 6;
    Sxy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c / 24;
    Sxx += (x0 * x0 + x0 * x1 + x1 * x1) * c / 12; Syy += (y0 * y0 + y0 * y1 + y1 * y1) * c / 12;
  }
  const s = A < 0 ? -1 : 1; return { A: A * s, Sx: Sx * s, Sy: Sy * s, Sxy: Sxy * s, Sxx: Sxx * s, Syy: Syy * s };
}
// Çokgen (a,b) düzleminde; b'nin 0 değerli doğrusu etrafında... a ekseni etrafında dönme: V=2π∫a dA, ∫a·b
export function revMom(P) { const m = polyMoments(P); return { V: 2 * Math.PI * m.Sx, Mb: 2 * Math.PI * m.Sxy, A: m.A }; }
export const PI = Math.PI;
export const sum = (a) => a.reduce((x, y) => x + y, 0);
// yuvarlak köşe alanı kaybı
export const rrArea = (w, h, r) => w * h - (4 - PI) * r * r;
// bir sayısal integral
export function integrate(f, a, b, n = 20000) { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return (s * h) / 3; }

// ------------------------------------------------------------------ belge kurucu
// parametre taramaları için: özellik bastırma / çıkarma (kurucu çağrısından önce ayarla)
export const MODS = { suppress: new Set(), remove: new Set() };
export const setMods = (m = {}) => { MODS.suppress = new Set(m.suppress || []); MODS.remove = new Set(m.remove || []); };
export const basePl = (name, off = 0) => ({ kind: 'base', name, offset: String(off) });
export class B {
  constructor(K, params = {}, refs = null) {
    this.K = K; this.p = params; this.refs = refs; this.newRefs = {}; this.snaps = {};
    this.doc = { params: Object.entries(params).map(([name, v]) => ({ name, expr: String(v) })), features: [] };
  }
  add(f) { if (MODS.remove.has(f.id)) return f; if (MODS.suppress.has(f.id)) f.suppressed = true; this.doc.features.push(f); return f; }
  sketch(id, plane, sk) { return this.add({ id, type: 'sketch', plane, points: sk.points, ents: sk.ents, cons: [] }); }
  async pick(key, fn) {
    if (this.refs && this.refs[key]) return this.refs[key];
    await this.K.rebuild(this.doc);
    const r = fn(this.K); this.newRefs[key] = r; this.snaps[key] = this.K.last; return r;
  }
  async build() { return this.K.rebuild(this.doc); }
}
export const clone = (o) => JSON.parse(JSON.stringify(o));

// ------------------------------------------------------------------ gövde sorguları
export function facesOf(K, bid) { const n = K.last.bodies.get(bid).shape.faces.length; return Array.from({ length: n }, (_, i) => K.describe({ body: bid, idx: i }, 'face')); }
export function edgesOf(K, bid) { const n = K.last.bodies.get(bid).shape.edges.length; return Array.from({ length: n }, (_, i) => K.describe({ body: bid, idx: i }, 'edge')); }
export const pickFaces = (K, bid, pred) => facesOf(K, bid).filter(pred);
export const pickEdges = (K, bid, pred) => edgesOf(K, bid).filter(pred);
export const near0 = (a, b, tol = 1e-5) => Math.abs(a - b) <= tol;
export const refOf = (d) => d; // describe sonucu aynen ref

export function solidValid(shape) { try { return new oc.BRepCheck_Analyzer(shape.wrapped, true, false).IsValid(); } catch (e) { return null; } }
export function props(K, bid) {
  const p = K.bodyProps(bid); return { volume: p.volume, area: p.area, com: p.com.map ? p.com.map((x) => x) : Array.from(p.com), bbox: p.bbox, size: p.size };
}
// güvenli yeniden hesap: istisna yakalanır
export async function rb(K, doc) {
  const t0 = performance.now();
  try { const out = await K.rebuild(doc); return { out, ms: performance.now() - t0 }; }
  catch (e) { return { exc: e, ms: performance.now() - t0 }; }
}
// gövdelerin makullüğü: sonlu hacim, geçerli katı, sonlu sınır kutusu
export function sane(K, out) {
  const probs = [];
  for (const b of out.bodies) {
    if (!(b.volume > 0) || !Number.isFinite(b.volume)) probs.push(`${b.id}: hacim ${b.volume}`);
    const flat = b.bbox.flat(); if (flat.some((x) => !Number.isFinite(x))) probs.push(`${b.id}: sınır kutusu sonlu değil`);
    const sh = K.last.bodies.get(b.id)?.shape; if (sh && solidValid(sh) === false) probs.push(`${b.id}: BRepCheck geçersiz`);
    if (!b.vertices.length || b.vertices.some?.((x) => !Number.isFinite(x))) probs.push(`${b.id}: ağ boş ya da NaN`);
  }
  return probs;
}
export const bboxOf = (b) => b.bbox.flat();
export function worldBox(b) { return b.bbox; }

// STL (ikili) ayrıştır: üçgenler -> işaretli hacim, alan, kenar manifold kontrolü (köşeler 1e-3 toleransla birleştirilir)
export function stlStats(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); const n = dv.getUint32(80, true);
  let vol = 0, area = 0; const grid = new Map(); const TOL = 1e-3; let nv = 0;
  const vid = (x, y, z) => {
    const cx = Math.floor(x / TOL), cy = Math.floor(y / TOL), cz = Math.floor(z / TOL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const l = grid.get((cx + i) + ',' + (cy + j) + ',' + (cz + k)); if (l) for (const v of l) if (Math.hypot(v.x - x, v.y - y, v.z - z) < TOL) return v.id; }
    const key = cx + ',' + cy + ',' + cz; const v = { x, y, z, id: nv++ }; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(v); return v.id;
  };
  const em = new Map();
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12; const v = []; for (let k = 0; k < 3; k++) v.push([dv.getFloat32(o + k * 12, true), dv.getFloat32(o + k * 12 + 4, true), dv.getFloat32(o + k * 12 + 8, true)]);
    const [a, b, c] = v; vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    area += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
    const ks = v.map((p) => vid(...p));
    if (ks[0] === ks[1] || ks[1] === ks[2] || ks[0] === ks[2]) continue;
    for (let k = 0; k < 3; k++) { const e0 = ks[k], e1 = ks[(k + 1) % 3]; const dir = e0 < e1 ? 1 : -1; const key = dir > 0 ? e0 + '|' + e1 : e1 + '|' + e0; const s = em.get(key) || [0, 0]; s[dir > 0 ? 0 : 1]++; em.set(key, s); }
  }
  let open = 0, nonman = 0; for (const [, s] of em) { if (s[0] !== 1 || s[1] !== 1) { if (s[0] + s[1] === 1) open++; else nonman++; } }
  return { tris: n, volume: vol, area, openEdges: open, badEdges: nonman };
}

// ------------------------------------------------------------------ öz-sınama (yardımcıların kendisi)
export function selfCheck() {
  const e = [];
  const near = (a, b, m) => { if (Math.abs(a - b) > 1e-5 * Math.max(1, Math.abs(b))) e.push(`${m}: ${a} != ${b}`); };
  near(polyMoments(polySample([[0, 0], [10, 0], [10, 6], [0, 6]], [2, 2, 2, 2])).A, rrArea(10, 6, 2), 'rrArea');
  near(polyMoments(polySample([[0, 0], [10, 0], [10, 6], [0, 6]], [0, 0, 0, 0])).Sx, 10 * 6 * 5, 'Sx');
  near(revMom([[0, 0], [3, 0], [3, 4], [0, 4]]).V, PI * 9 * 4, 'revMom');
  // içbükey dönüş: L şekli sağa-dönüş yayı
  const L = polySample([[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [0, 8]], [0, 0, 0, 1, 0, 0]);
  near(polyMoments(L).A, 20 + 12 - 0 - 0 + (1 - PI / 4), 'L alanı + iç fillet');
  return e;
}

// ------------------------------------------------------------------ standart parça denetimi
// an: {volume, bbox:[[x0,y0,z0],[x1,y1,z1]], com?:[x,y,z], faces?:[min,max]}
export async function std(t, K, b, an, tag = '') {
  const { out, exc } = await rb(K, b.doc);
  if (exc) { t.ok(false, `${tag}rebuild istisna fırlattı: ${exc?.message || exc}`); return null; }
  for (const f of b.doc.features) if (out.status[f.id] && !out.status[f.id].ok) t.ok(false, `${tag}özellik ${f.id} ok:false`);
  t.ok(b.doc.features.every((f) => out.status[f.id]?.ok), `${tag}tüm özellikler ok:true`);
  const bodies = out.bodies; t.ok(bodies.length === (an.bodies ?? 1), `${tag}gövde sayısı ${bodies.length} (beklenen ${an.bodies ?? 1})`);
  const sp = sane(K, out); t.ok(!sp.length, `${tag}gövde makullüğü: ${sp.join('; ')}`);
  if (!bodies.length) return out;
  const body = bodies[0]; const P = props(K, body.id);
  t.near(P.volume, an.volume, `${tag}hacim`, an.relTol ?? 1e-4);
  t.near(body.volume, P.volume, `${tag}rebuild.volume = bodyProps.volume`, 1e-9);
  if (an.bbox) { for (let a = 0; a < 2; a++) for (let i = 0; i < 3; i++) t.near(P.bbox[a][i], an.bbox[a][i], `${tag}sınır kutusu[${a}][${i}]`, 1e-6, 1e-4); }
  if (an.com) { const sz = Math.max(...P.size); an.com.forEach((c, i) => { if (c != null) t.near(P.com[i], c, `${tag}ağırlık merkezi[${'xyz'[i]}]`, 1e-4, 2e-5 * sz); }); }
  if (an.faces) t.ok(body.nFaces >= an.faces[0] && body.nFaces <= an.faces[1], `${tag}yüz sayısı ${body.nFaces} (makul aralık ${an.faces})`);
  t.note(tag + 'nFaces', body.nFaces); t.note(tag + 'nEdges', body.nEdges); t.note(tag + 'volume', P.volume); t.note(tag + 'expVolume', an.volume);
  // Euler: V - E + F = 2 (genus 0) ya da çift sayı; yalnız E ve F makul
  const sh = K.last.bodies.get(body.id).shape;
  try { const V = sh.wrapped && (() => { const m = new oc.TopTools_IndexedMapOfShape_1(); oc.TopExp.MapShapes_1(sh.wrapped, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, m); return m.Extent(); })(); t.note(tag + 'nVerts', V); if (V != null) t.ok((V - body.nEdges + body.nFaces) % 2 === 0, `${tag}Euler çift: V=${V} E=${body.nEdges} F=${body.nFaces}`); } catch (e) {}
  return out;
}
export const allHolePositions = (holes, dia) => { const m = new Map(); for (const h of holes) if (Math.abs(h.dia - dia) < 1e-9) for (const p of h.positions) m.set(p.map((x) => x.toFixed(3)).join(','), p); return [...m.values()]; };
export function matchPoints(got, exp, tol = 1e-4) { const miss = exp.filter((e) => !got.some((g) => Math.hypot(g[0] - e[0], g[1] - e[1], g[2] - e[2]) < tol)); return { miss, extra: got.filter((g) => !exp.some((e) => Math.hypot(g[0] - e[0], g[1] - e[1], g[2] - e[2]) < tol)) }; }
// köşeyi yuvarlatma (içbükey/dışbükey) için kesit: kare r×r - çeyrek daire; alan ve ağırlık merkezi duvara/tabana uzaklık
export const filletSection = (r) => { const A = (1 - PI / 4) * r * r; const qc = (4 * r) / (3 * PI); const cd = (r * r * (r / 2) - (PI * r * r / 4) * (r - qc)) / A; return { A, cd }; };
// nokta doluluk sınaması: noktanın çevresindeki küçük kutu ile kesişim hacmi
export function occupied(K, bid, p, h = 0.05) {
  const sh = K.last.bodies.get(bid).shape; const box = R.makeBox([p[0] - h, p[1] - h, p[2] - h], [p[0] + h, p[1] + h, p[2] + h]);
  const v = (() => { try { const c = sh.intersect(box); return c && c.faces.length ? R.measureVolume(c) : 0; } catch (e) { return -1; } })();
  const full = (2 * h) ** 3; return v > full * 0.99 ? 1 : v < full * 0.01 ? 0 : 0.5;
}
