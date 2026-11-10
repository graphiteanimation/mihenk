// DXF (ASCII) içe/dışa aktarma — yalnız 2B eskiz geometrisi. Bağımlılık yok.
// İçe aktarma: LINE, LWPOLYLINE/POLYLINE (bulge), CIRCLE, ARC, ELLIPSE, SPLINE. Katmanlar yok sayılır, uçlar tolerans ile birleştirilir.
// Dışa aktarma: R12 (AC1009) ve 2000 (AC1015). Yapı (construction) geometrisi dışa verilmez.
import { entSeg } from './profiles.js';
import * as G from './geom2d.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;

// $INSUNITS kodu → milimetre katsayısı
export const UNIT_TABLE = { 0: null, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 3: 1609344, 7: 1e6, 8: 25.4e-6, 9: 0.0254, 10: 914.4, 13: 1e-3, 14: 100, 15: 1e4 };
export const UNIT_NAME = { 1: 'inch', 2: 'foot', 4: 'mm', 5: 'cm', 6: 'm', 10: 'yard' };

// ---------------------------------------------------------------- ayrıştırma
function pairs(text) {
  const lines = String(text).split(/\r\n|\r|\n/); const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) { const code = parseInt(lines[i].trim(), 10); if (Number.isNaN(code)) { i--; continue; } out.push([code, lines[i + 1].trim()]); }
  return out;
}
const num = (v) => parseFloat(v);

// Dönüş: { units:{code, factor|null}, ents:[{type,...}], skipped:{TYPE:n} }; geometri DXF birimlerinde (ölçeklenmemiş)
export function parseDxf(text) {
  const P = pairs(text); const skipped = {}; const ents = []; let units = { code: 0, factor: null };
  let i = 0, section = '';
  // başlık
  while (i < P.length) {
    const [c, v] = P[i];
    if (c === 0 && v === 'SECTION') { section = P[i + 1] && P[i + 1][0] === 2 ? P[i + 1][1] : ''; i += 2; continue; }
    if (c === 0 && v === 'ENDSEC') { section = ''; i++; continue; }
    if (section === 'HEADER' && c === 9 && v === '$INSUNITS') { const n = P[i + 1]; if (n && n[0] === 70) { const code = parseInt(n[1], 10); units = { code, factor: UNIT_TABLE[code] ?? null }; } i++; continue; }
    if (section === 'ENTITIES') break;
    i++;
  }
  // varlıklar
  const flat = []; // her biri {type, codes:[[c,v]]}
  for (; i < P.length; i++) {
    const [c, v] = P[i];
    if (c === 0) { if (v === 'ENDSEC' || v === 'EOF') break; flat.push({ type: v, codes: [] }); } else if (flat.length) flat[flat.length - 1].codes.push([c, v]);
  }
  const get = (e, code, d = 0) => { const f = e.codes.find((x) => x[0] === code); return f ? num(f[1]) : d; };
  const all = (e, code) => e.codes.filter((x) => x[0] === code).map((x) => num(x[1]));
  for (let k = 0; k < flat.length; k++) {
    const e = flat[k];
    switch (e.type) {
      case 'LINE': ents.push({ type: 'line', a: [get(e, 10), get(e, 20)], b: [get(e, 11), get(e, 21)] }); break;
      case 'POINT': ents.push({ type: 'point', p: [get(e, 10), get(e, 20)] }); break;
      case 'CIRCLE': ents.push({ type: 'circle', c: [get(e, 10), get(e, 20)], r: get(e, 40) }); break;
      case 'ARC': ents.push({ type: 'arc', c: [get(e, 10), get(e, 20)], r: get(e, 40), a0: get(e, 50) * DEG, a1: get(e, 51) * DEG }); break;
      case 'LWPOLYLINE': {
        const verts = []; for (const [c, v] of e.codes) { if (c === 10) verts.push({ x: num(v), y: 0, b: 0 }); else if (c === 20 && verts.length) verts[verts.length - 1].y = num(v); else if (c === 42 && verts.length) verts[verts.length - 1].b = num(v); }
        ents.push({ type: 'poly', verts, closed: (get(e, 70) & 1) === 1 }); break;
      }
      case 'POLYLINE': {
        const flags = get(e, 70); const verts = []; let j = k + 1;
        for (; j < flat.length && flat[j].type !== 'SEQEND'; j++) if (flat[j].type === 'VERTEX') verts.push({ x: get(flat[j], 10), y: get(flat[j], 20), b: get(flat[j], 42) });
        k = j; ents.push({ type: 'poly', verts, closed: (flags & 1) === 1 }); break;
      }
      case 'VERTEX': case 'SEQEND': break;
      case 'ELLIPSE': ents.push({ type: 'ellipse', c: [get(e, 10), get(e, 20)], m: [get(e, 11), get(e, 21)], ratio: get(e, 40, 1), t0: get(e, 41, 0), t1: get(e, 42, TAU) }); break;
      case 'SPLINE': {
        const flags = get(e, 70), deg = get(e, 71, 3); const ctrl = []; const fit = []; const xs10 = all(e, 10), ys20 = all(e, 20), xs11 = all(e, 11), ys21 = all(e, 21);
        for (let q = 0; q < xs10.length; q++) ctrl.push([xs10[q], ys20[q] || 0]); for (let q = 0; q < xs11.length; q++) fit.push([xs11[q], ys21[q] || 0]);
        ents.push({ type: 'spline', degree: deg, closed: (flags & 1) === 1, ctrl, fit, knots: all(e, 40), weights: all(e, 41) }); break;
      }
      default: skipped[e.type] = (skipped[e.type] || 0) + 1;
    }
  }
  return { units, ents, skipped };
}

// B-spline (NURBS) değerlendirme: de Boor, ağırlıklı
function nurbsPoints(sp, n) {
  const p = sp.degree, X = sp.ctrl; const m = X.length; let U = sp.knots;
  if (m < 2) return X.slice();
  if (!U || U.length !== m + p + 1) { // düğümler yoksa/hatalıysa: kenetli düzgün
    U = []; for (let q = 0; q <= m + p; q++) U.push(q <= p ? 0 : q >= m ? m - p : q - p);
  }
  const w = sp.weights && sp.weights.length === m ? sp.weights : X.map(() => 1);
  const u0 = U[p], u1 = U[m]; const out = [];
  for (let s = 0; s <= n; s++) {
    let u = u0 + ((u1 - u0) * s) / n; if (s === n) u = u1 - 1e-12 * (u1 - u0 || 1);
    let k = p; while (k < m - 1 && u >= U[k + 1]) k++;
    const d = []; for (let j = 0; j <= p; j++) { const q = k - p + j; d.push([X[q][0] * w[q], X[q][1] * w[q], w[q]]); }
    for (let r = 1; r <= p; r++) for (let j = p; j >= r; j--) {
      const q = k - p + j; const den = U[q + p - r + 1] - U[q]; const a = den === 0 ? 0 : (u - U[q]) / den;
      d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1], (1 - a) * d[j - 1][2] + a * d[j][2]];
    }
    out.push([d[p][0] / d[p][2], d[p][1] / d[p][2]]);
  }
  return out;
}

// ---------------------------------------------------------------- eskize dönüştürme
// sk: hedef eskiz (yerinde değiştirilir); opts: { scale (mm/DXF birimi), tol (mm) }
export function dxfToSketch(parsed, sk, { scale = 1, tol = 1e-3 } = {}) {
  const report = { lines: 0, arcs: 0, circles: 0, ellipses: 0, splines: 0, points: 0, skipped: { ...parsed.skipped }, merged: 0 };
  const grid = new Map(); const key = (x, y) => Math.round(x / (tol * 4)) + ',' + Math.round(y / (tol * 4));
  const idCounter = {};
  const nid = (pre, has) => { let n = idCounter[pre] || 1; while (has(pre + n)) n++; idCounter[pre] = n + 1; return pre + n; };
  const usedId = (id) => id in sk.points || sk.ents.some((e) => e.id === id);
  for (const [id, p] of Object.entries(sk.points)) { const k = key(p.x, p.y); (grid.get(k) || grid.set(k, []).get(k)).push(id); }
  const point = (x, y, merge = true) => {
    if (merge) {
      const kx = Math.round(x / (tol * 4)), ky = Math.round(y / (tol * 4));
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const id of grid.get((kx + dx) + ',' + (ky + dy)) || []) { const p = sk.points[id]; if (Math.hypot(p.x - x, p.y - y) <= tol) { report.merged++; return id; } }
    }
    const id = nid('p', usedId); sk.points[id] = { x, y }; const k = key(x, y); (grid.get(k) || grid.set(k, []).get(k)).push(id); return id;
  };
  const addEnt = (pre, e) => { const id = nid(pre, usedId); sk.ents.push({ id, ...e }); return id; };
  const S = (v) => v * scale, SP = (p) => [p[0] * scale, p[1] * scale];
  const arcFrom = (c, r, a0, a1) => { const ct = point(c[0], c[1], false); const pa = point(c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)), pb = point(c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)); if (pa === pb) return false; addEnt('a', { type: 'arc', c: ct, a: pa, b: pb }); report.arcs++; return true; };
  const segment = (p1, p2, bulge) => {
    if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < tol) return;
    if (Math.abs(bulge) < 1e-9) { const a = point(p1[0], p1[1]), b = point(p2[0], p2[1]); if (a !== b) { addEnt('l', { type: 'line', a, b }); report.lines++; } return; }
    let A = p1, B = p2, b = bulge; if (b < 0) { A = p2; B = p1; b = -b; }
    const dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy), th = 4 * Math.atan(b), h = d / 2 / Math.tan(th / 2);
    const cx = (A[0] + B[0]) / 2 + (-dy / d) * h, cy = (A[1] + B[1]) / 2 + (dx / d) * h; const r = Math.hypot(A[0] - cx, A[1] - cy);
    const ct = point(cx, cy, false); const pa = point(A[0], A[1]), pb = point(B[0], B[1]);
    // yarıçap uç noktalardan türetilir: noktalar birleşince hafif sapma olabilir; kabul edilir
    addEnt('a', { type: 'arc', c: ct, a: pa, b: pb }); report.arcs++; void r;
  };
  for (const e of parsed.ents) {
    if (e.type === 'line') { segment(SP(e.a), SP(e.b), 0); }
    else if (e.type === 'point') { const q = SP(e.p); const pid = point(q[0], q[1]); if (!sk.ents.some((x) => x.type === 'point' && x.p === pid)) { addEnt('n', { type: 'point', p: pid }); report.points++; } }
    else if (e.type === 'circle') { const r = S(e.r); if (r > tol) { const c = SP(e.c); addEnt('c', { type: 'circle', c: point(c[0], c[1], false), r }); report.circles++; } }
    else if (e.type === 'arc') { let a1 = e.a1; while (a1 <= e.a0) a1 += TAU; const c = SP(e.c); arcFrom(c, S(e.r), e.a0, a1); }
    else if (e.type === 'poly') {
      const v = e.verts.map((q) => ({ p: SP([q.x, q.y]), b: q.b })); const n = v.length;
      for (let q = 0; q + 1 < n; q++) segment(v[q].p, v[q + 1].p, v[q].b);
      if (e.closed && n > 2) segment(v[n - 1].p, v[0].p, v[n - 1].b);
    } else if (e.type === 'ellipse') {
      const c = SP(e.c), m = SP(e.m); const a = Math.hypot(m[0], m[1]); const b = a * e.ratio; if (a < tol || b < tol) continue;
      const rot = Math.atan2(m[1], m[0]);
      if (Math.abs(e.ratio - 1) < 1e-9) { // daire / yay
        const t1 = e.t1 <= e.t0 ? e.t1 + TAU : e.t1; if (t1 - e.t0 >= TAU - 1e-9) { addEnt('c', { type: 'circle', c: point(c[0], c[1], false), r: a }); report.circles++; } else arcFrom(c, a, e.t0 + rot, t1 + rot); continue;
      }
      const fc = Math.sqrt(Math.max(0, a * a - b * b)); const ct = point(c[0], c[1], false); const fp = point(c[0] + Math.cos(rot) * fc, c[1] + Math.sin(rot) * fc, false);
      const t1 = e.t1 <= e.t0 ? e.t1 + TAU : e.t1;
      if (t1 - e.t0 >= TAU - 1e-9) addEnt('e', { type: 'ellipse', c: ct, f: fp, rmin: b });
      else { const at = (t) => [c[0] + a * Math.cos(t) * Math.cos(rot) - b * Math.sin(t) * Math.sin(rot), c[1] + a * Math.cos(t) * Math.sin(rot) + b * Math.sin(t) * Math.cos(rot)]; const pa = at(e.t0), pb = at(t1); addEnt('e', { type: 'ellarc', c: ct, f: fp, rmin: b, a: point(pa[0], pa[1]), b: point(pb[0], pb[1]) }); }
      report.ellipses++;
    } else if (e.type === 'spline') {
      let pts = e.fit.length >= 2 ? e.fit.slice() : e.ctrl.length >= 2 ? nurbsPoints(e, Math.max(8, e.ctrl.length * 6)) : [];
      pts = pts.map(SP); if (pts.length < 2) continue;
      if (e.closed && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < tol) pts.pop();
      const ids = pts.map((p) => point(p[0], p[1])); if (new Set(ids).size < 2) continue;
      addEnt('s', { type: 'spline', pts: ids, ...(e.closed ? { closed: true } : {}) }); report.splines++;
    }
  }
  report.count = report.lines + report.arcs + report.circles + report.ellipses + report.splines + report.points;
  return report;
}

// ---------------------------------------------------------------- dışa aktarma
const f6 = (v) => (Math.abs(v) < 1e-12 ? '0' : String(+v.toFixed(9)));
// sk → DXF metni; version: 'R12' | '2000'; opts.construction: yapı geometrisini de yaz
export function sketchToDxf(sk, { version = '2000', construction = false } = {}) {
  const out = []; const w = (c, v) => out.push(String(c), String(v));
  const r12 = version === 'R12' || version === '12';
  let handle = 0x30; const H = () => (handle++).toString(16).toUpperCase();
  const ent = (type, sub) => { w(0, type); if (!r12) { w(5, H()); w(100, 'AcDbEntity'); } w(8, '0'); if (!r12 && sub) w(100, sub); };
  const pt = (c, x, y) => { w(c, f6(x)); w(c + 10, f6(y)); w(c + 20, 0); };
  const polyline = (pts, closed) => {
    if (r12) { w(0, 'POLYLINE'); w(8, '0'); w(66, 1); w(70, closed ? 1 : 0); for (const p of pts) { w(0, 'VERTEX'); w(8, '0'); pt(10, p[0], p[1]); } w(0, 'SEQEND'); w(8, '0'); }
    else { ent('LWPOLYLINE', 'AcDbPolyline'); w(90, pts.length); w(70, closed ? 1 : 0); for (const p of pts) { w(10, f6(p[0])); w(20, f6(p[1])); } }
  };
  w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, r12 ? 'AC1009' : 'AC1015');
  if (!r12) { w(9, '$HANDSEED'); w(5, 'FFFF'); w(9, '$INSUNITS'); w(70, 4); }
  w(0, 'ENDSEC');
  if (!r12) {
    w(0, 'SECTION'); w(2, 'TABLES');
    w(0, 'TABLE'); w(2, 'LTYPE'); w(5, '5'); w(100, 'AcDbSymbolTable'); w(70, 1); w(0, 'LTYPE'); w(5, '6'); w(100, 'AcDbSymbolTableRecord'); w(100, 'AcDbLinetypeTableRecord'); w(2, 'CONTINUOUS'); w(70, 0); w(3, 'Solid line'); w(72, 65); w(73, 0); w(40, 0); w(0, 'ENDTAB');
    w(0, 'TABLE'); w(2, 'LAYER'); w(5, '2'); w(100, 'AcDbSymbolTable'); w(70, 1); w(0, 'LAYER'); w(5, '10'); w(100, 'AcDbSymbolTableRecord'); w(100, 'AcDbLayerTableRecord'); w(2, '0'); w(70, 0); w(62, 7); w(6, 'CONTINUOUS'); w(0, 'ENDTAB');
    w(0, 'ENDSEC');
  }
  w(0, 'SECTION'); w(2, 'ENTITIES');
  let count = 0;
  for (const e of sk.ents) {
    if (e.cons && !construction) continue;
    if (e.type === 'point') { const p = sk.points[e.p]; if (!p) continue; ent('POINT', 'AcDbPoint'); pt(10, p.x, p.y); count++; continue; }
    const s = entSeg(sk, e); if (!s) continue; count++;
    if (s.type === 'line') { ent('LINE', 'AcDbLine'); pt(10, s.p0[0], s.p0[1]); pt(11, s.p1[0], s.p1[1]); }
    else if (s.type === 'circle') { ent('CIRCLE', 'AcDbCircle'); pt(10, s.c[0], s.c[1]); w(40, f6(s.r)); }
    else if (s.type === 'arc') { ent('ARC', 'AcDbCircle'); pt(10, s.c[0], s.c[1]); w(40, f6(s.r)); if (!r12) w(100, 'AcDbArc'); w(50, f6(((s.a0 / DEG) % 360 + 360) % 360)); w(51, f6((((s.a0 + s.sweep) / DEG) % 360 + 360) % 360)); }
    else if ((s.type === 'ellipse' || s.type === 'ellarc') && !r12) {
      ent('ELLIPSE', 'AcDbEllipse'); pt(10, s.c[0], s.c[1]); pt(11, s.rx * Math.cos(s.rot), s.rx * Math.sin(s.rot));
      w(210, 0); w(220, 0); w(230, 1); w(40, f6(s.ry / s.rx)); w(41, f6(s.type === 'ellipse' ? 0 : s.a0)); w(42, f6(s.type === 'ellipse' ? TAU : s.a0 + s.sweep));
    } else if (s.type === 'spline' && !r12) {
      ent('SPLINE', 'AcDbSpline'); w(210, 0); w(220, 0); w(230, 1); w(70, 8 | (s.closed ? 1 : 0)); w(71, 3); w(72, 0); w(73, 0); w(74, s.pts.length);
      for (const p of s.pts) pt(11, p[0], p[1]);
    } else { const poly = G.sample(s, 0.005); polyline(poly, G.isClosed(s)); }
  }
  w(0, 'ENDSEC'); w(0, 'EOF');
  return { text: out.join('\n') + '\n', count };
}
