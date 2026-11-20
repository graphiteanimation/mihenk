// WP-17: teknik resim sayfasi -> cizim listesi (sayfa mm, sol alt orijin, y yukari). SVG, PDF ve DXF ayni listeden uretilir.
// Oge bicimleri: {k:'l',a,b,ly} {k:'a',c,r,a0,sw,ly} {k:'c',c,r,ly} {k:'p',pts,ly,closed} {k:'t',p,s,h,rot,al,va,ly} {k:'f',pts,ly} (dolu)
// Katmanlar (ISO 128-20 cizgi turleri, O onerisi kalinliklari): LAYERS.
import { toPts, hatch, clipCircle, boxOf, dist, TAU } from './geom.js';
import { viewBasis, placement, toSheet, parentOf, arrowDir2, viewScale } from './views.js';
import { evalDim, dimText, tolDev, fmtN } from './dims.js';
import { textWidth } from './text.js';

export const SHEETS = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] };
export const LAYERS = {
  vis: { w: 0.5, dash: null, lt: 'CONTINUOUS', col: 7 },
  tan: { w: 0.25, dash: null, lt: 'CONTINUOUS', col: 8 },
  hid: { w: 0.25, dash: [3, 1.5], lt: 'HIDDEN', col: 4 },
  ctr: { w: 0.25, dash: [8, 1.5, 0.5, 1.5], lt: 'CENTER', col: 1 },
  cut: { w: 0.25, dash: [8, 1.5, 0.5, 1.5], lt: 'CENTER', col: 1 },
  cutk: { w: 0.7, dash: null, lt: 'CONTINUOUS', col: 1 },
  hat: { w: 0.18, dash: null, lt: 'CONTINUOUS', col: 8 },
  dim: { w: 0.25, dash: null, lt: 'CONTINUOUS', col: 3 },
  lost: { w: 0.35, dash: null, lt: 'CONTINUOUS', col: 1, color: [0.85, 0.1, 0.1] },
  txt: { w: 0.25, dash: null, lt: 'CONTINUOUS', col: 7 },
  frm: { w: 0.7, dash: null, lt: 'CONTINUOUS', col: 7 },
  tb: { w: 0.35, dash: null, lt: 'CONTINUOUS', col: 7 },
  thin: { w: 0.18, dash: null, lt: 'CONTINUOUS', col: 7 },
};
export function sheetSize(sh) { const s = SHEETS[sh?.size] || SHEETS.A3; return sh?.orient === 'port' ? [s[1], s[0]] : [s[0], s[1]]; }
export const FRAME = { l: 20, r: 10, t: 10, b: 10 };
export const TB = { w: 180, h: 32 };
const ARW = 3, ARH = 1; // ok boyu/yari genisligi (mm)

const rot2 = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const nrm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

// Ana hesap: cizim verisi + cekirdek izdusumleri (+ delikler) -> {list, W, H, views, dims, holeRows, issues}
// proj: {viewId: {prims, loops, box, basis} | {error}}; T(anahtar, parametre): ceviri; opts.holes: rebuild delik listesi
export function composeSheet(dr, proj, T, opts = {}) {
  const [W, H] = sheetSize(dr.sheet); const list = []; const issues = [];
  const L = (a, b, ly) => list.push({ k: 'l', a, b, ly });
  const txt = (p, s, h, o = {}) => list.push({ k: 't', p, s: String(s), h, rot: o.rot || 0, al: o.al || 'l', va: o.va || 'b', ly: o.ly || 'txt' });
  const th = dr.sheet.th || 3.5; const prec = dr.sheet.prec ?? 2; const dec = dr.sheet.dec || ',';
  // cerceve
  const fx0 = FRAME.l, fy0 = FRAME.b, fx1 = W - FRAME.r, fy1 = H - FRAME.t;
  list.push({ k: 'p', pts: [[0, 0], [W, 0], [W, H], [0, H]], closed: true, ly: 'thin' });
  list.push({ k: 'p', pts: [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1]], closed: true, ly: 'frm' });
  // gorunusler
  const views = {};
  for (const v of dr.views) {
    const B = viewBasis(dr, v); const pl = placement(dr, v);
    let prims = [], loops = [], err = null;
    if (v.kind === 'det') {
      const P = parentOf(dr, v); const pr = P ? proj[P.id] : null;
      if (!pr || pr.error) err = pr?.error || { code: 'drw.view_bad', params: {} };
      else { prims = clipCircle(pr.prims, v.c, v.r); const sp = views[P.id]; if (sp) loops = []; }
    } else {
      const pr = proj[v.id];
      if (!pr || pr.error) err = pr?.error || { code: 'drw.view_bad', params: {} };
      else { prims = pr.prims; loops = pr.loops || []; }
    }
    if (err) issues.push({ view: v.id, err });
    views[v.id] = { v, B, pl, prims, loops, err, box: prims.length ? boxOf(prims) : null };
  }
  // ayrinti gorunusunde kesit taramasi: ana gorunus kesitse donguler kirpilmaz (O onerisi: tarama yalniz kesit gorunusunde)
  for (const id of Object.keys(views)) {
    const V = views[id]; const v = V.v; if (V.err) continue;
    const S = (q) => toSheet(V.pl, q);
    const showHidden = v.hidden !== false && v.kind !== 'sec' && v.orient !== 'iso';
    for (const p of V.prims) {
      if (!p.vis && !showHidden) continue;
      const ly = !p.vis ? 'hid' : p.k === 'g' ? 'tan' : 'vis';
      if (p.t === 'l') L(S(p.a), S(p.b), ly);
      else if (p.t === 'c') list.push({ k: 'c', c: S(p.c), r: p.r * V.pl.s, ly });
      else if (p.t === 'a') list.push({ k: 'a', c: S(p.c), r: p.r * V.pl.s, a0: p.a0, sw: p.sw, ly });
      else list.push({ k: 'p', pts: p.pts.map(S), ly });
    }
    // tarama (kesit)
    if (v.kind === 'sec' && V.loops.length) {
      const sl = V.loops.map((lp) => lp.map(S)); const step = v.hatch?.step || 3; const ang = ((v.hatch?.ang ?? 45) * Math.PI) / 180;
      for (const [a, b] of hatch(sl, step, ang)) L(a, b, 'hat');
      for (const lp of sl) list.push({ k: 'p', pts: lp, closed: true, ly: 'vis' });
    }
    // merkez isaretleri
    if (v.cmark !== false && v.orient !== 'iso') {
      const seen = [];
      for (const p of V.prims) {
        if (p.t !== 'c' && !(p.t === 'a' && p.sw > Math.PI * 0.9)) continue;
        if (seen.some((q) => dist(q.c, p.c) < 1e-6 && Math.abs(q.r - p.r) < 1e-6)) continue; seen.push(p);
        const c = S(p.c), rs = p.r * V.pl.s; if (rs < 0.8) continue; const e = rs + 2;
        L([c[0] - e, c[1]], [c[0] + e, c[1]], 'ctr'); L([c[0], c[1] - e], [c[0], c[1] + e], 'ctr');
      }
    }
    // gorunus etiketi (kesit / ayrinti)
    if ((v.kind === 'sec' || v.kind === 'det') && V.box) {
      const bx = V.pl.c ? [toSheet(V.pl, [v.c[0] - v.r, v.c[1] - v.r]), toSheet(V.pl, [v.c[0] + v.r, v.c[1] + v.r])] : [S([V.box[0], V.box[1]]), S([V.box[2], V.box[3]])];
      const cx = (bx[0][0] + bx[1][0]) / 2; const lab = v.kind === 'sec' ? `${v.label || 'A'}-${v.label || 'A'}` : `${v.label || 'B'} (${scaleText(viewScale(dr, v))})`;
      txt([cx, bx[0][1] - 4 - th * 1.4], lab, th * 1.4, { al: 'c', va: 't' });
    }
    if (v.kind === 'det') { const r = v.r * V.pl.s; list.push({ k: 'c', c: V.pl.o, r, ly: 'thin' }); }
  }
  // ana gorunuste kesme cizgisi ve ayrinti dairesi
  for (const v of dr.views) {
    const P = parentOf(dr, v); const VP = P ? views[P.id] : null; if (!VP || VP.err || !VP.box) continue;
    const S = (q) => toSheet(VP.pl, q);
    if (v.kind === 'sec') {
      const a = ((v.cut.ang || 0) * Math.PI) / 180; const u = [Math.cos(a), Math.sin(a)]; const ext = Math.hypot(VP.box[2] - VP.box[0], VP.box[3] - VP.box[1]) / 2 + 5 / VP.pl.s;
      const cx = [(VP.box[0] + VP.box[2]) / 2, (VP.box[1] + VP.box[3]) / 2]; const t0 = (cx[0] - v.cut.p[0]) * u[0] + (cx[1] - v.cut.p[1]) * u[1];
      const A = S(add(v.cut.p, mul(u, t0 - ext))), Bp = S(add(v.cut.p, mul(u, t0 + ext)));
      L(A, Bp, 'cut'); const uu = nrm(sub(Bp, A)); L(A, add(A, mul(uu, 6)), 'cutk'); L(Bp, sub(Bp, mul(uu, 6)), 'cutk');
      const ad = arrowDir2(v.cut);
      for (const e of [A, Bp]) { const tail = add(add(e, mul(uu, e === A ? 3 : -3)), [0, 0]); const tip = add(tail, mul(ad, 8)); L(tail, tip, 'dim'); arrow(list, tip, ad, 'dim'); txt(add(tip, mul(ad, 2)), v.label || 'A', th * 1.4, { al: 'c', va: ad[1] < 0 ? 't' : 'b' }); }
    }
    if (v.kind === 'det') { const c = S(v.c), r = v.r * VP.pl.s; list.push({ k: 'c', c, r, ly: 'thin' }); txt([c[0] + r * 0.75 + 1, c[1] + r * 0.75 + 1], v.label || 'B', th * 1.4); }
  }
  // olculer
  const dims = []; let n = 0;
  for (const d of dr.dims || []) {
    const V = views[d.view]; if (!V || V.err) { dims.push({ id: d.id, lost: true, value: d.last ?? null, n: d.fai === false ? null : ++n, text: null }); continue; }
    const tol = Math.max(0.01, 1e-4 * (V.box ? Math.hypot(V.box[2] - V.box[0], V.box[3] - V.box[1]) : 1));
    const ev = evalDim(d, V.prims, tol);
    const value = ev.value; const tx = dimText(d, value ?? 0, { prec, dec });
    const num = d.fai === false ? null : ++n;
    const info = { id: d.id, view: d.view, type: d.type, value, lost: ev.lost, how: ev.how, text: tx, n: num, dev: value != null ? tolDev(d.tol, value) : null };
    if (ev.geo) info.at = drawDim(list, d, ev.geo, V.pl, tx, th, ev.lost ? 'lost' : 'dim');
    else if (d.at) { info.at = d.at; txt(d.at, tx.main + ' ?', th, { ly: 'lost' }); }
    if (ev.lost && info.at) { const w = textWidth(tx.main, th); list.push({ k: 'p', pts: rectAround(info.at, w, th), closed: true, ly: 'lost' }); }
    if (dr.fai && num != null && info.at) balloon(list, add(info.at, [-(textWidth(tx.main, th) / 2) - 5, th + 3]), num, th);
    dims.push(info);
  }
  // eksen cizgileri (iki paralel kenar arasi)
  for (const cl of dr.clines || []) {
    const V = views[cl.view]; if (!V || V.err) continue;
    const ev = evalDim({ type: 'lin', refs: [{ ...cl.refs[0], pt: 'a' }, { ...cl.refs[1], pt: 'a' }] }, V.prims, 0.01);
    if (ev.lost) { issues.push({ view: cl.view, err: { code: 'drw.cline_lost', params: {} } }); continue; }
    const pa = refLine(cl.refs[0], V.prims), pb = refLine(cl.refs[1], V.prims); if (!pa || !pb) continue;
    const m0 = mid2(pa.a, pb.a, pa.b, pb.b); const S = (q) => toSheet(V.pl, q); const a = S(m0[0]), b = S(m0[1]); const u = nrm(sub(b, a));
    L(sub(a, mul(u, 3)), add(b, mul(u, 3)), 'ctr');
  }
  // yuzey puruzlulugu
  for (const r of dr.rough || []) { const V = views[r.view]; if (!V) continue; roughSym(list, toSheet(V.pl, r.p), r, th, dec); }
  // notlar
  for (const nt of dr.notes || []) String(nt.text || '').split('\n').forEach((line, i) => txt([nt.p[0], nt.p[1] - i * th * 1.6], line, nt.h || th));
  // delik tablosu
  let holeRows = [];
  if (dr.holeTable && views[dr.holeTable.view] && !views[dr.holeTable.view].err) {
    holeRows = holeTableRows(views[dr.holeTable.view], opts.holes || [], dr.holeTable, T, { prec, dec });
    const V = views[dr.holeTable.view];
    for (const r of holeRows) txt(add(toSheet(V.pl, r.uv), [1.2, 1.2]), r.tag, th * 0.8, { ly: 'dim' });
    table(list, dr.holeTable.p || [fx0 + 5, fy1 - 5], [T('drw.ht.tag'), T('drw.ht.x'), T('drw.ht.y'), T('drw.ht.desc')], holeRows.map((r) => [r.tag, fmtN(r.x, prec, dec), fmtN(r.y, prec, dec), r.desc]), [16, 22, 22, 50], th * 0.75);
  }
  titleBlock(list, dr, W, H, T, th);
  return { list, W, H, views, dims, holeRows, issues };
}

function refLine(ref, prims) { for (const p of prims) if (p.t === 'l' && ((ref.src && p.src === ref.src) || (!ref.src && dist(p.a, ref.g.a) + dist(p.b, ref.g.b) < 0.02))) return p; return null; }
function mid2(a1, a2, b1, b2) {
  // iki paralel dogrunun orta dogrusu: ilk dogrunun uclarinin ikinciye izdusumu ile ortalama
  const proj = (p, a, b) => { const d = sub(b, a); const L2 = d[0] * d[0] + d[1] * d[1] || 1; const t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2; return add(a, mul(d, t)); };
  const q1 = proj(a1, a2, b2), q2 = proj(b1, a2, b2);
  return [mul(add(a1, q1), 0.5), mul(add(b1, q2), 0.5)];
}
export function scaleText(s) { if (!(s > 0)) return '1:1'; if (s >= 1) return `${+s.toFixed(3)}:1`; return `1:${+(1 / s).toFixed(3)}`; }
function rectAround(c, w, h) { const x0 = c[0] - w / 2 - 1, x1 = c[0] + w / 2 + 1, y0 = c[1] - 1, y1 = c[1] + h + 1; return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
export function arrow(list, tip, dir, ly) { const u = nrm(dir); const n = [-u[1], u[0]]; const b = sub(tip, mul(u, ARW)); list.push({ k: 'f', pts: [tip, add(b, mul(n, ARH)), sub(b, mul(n, ARH))], ly }); }
function balloon(list, c, n, th) { list.push({ k: 'c', c, r: th * 0.9, ly: 'dim' }); list.push({ k: 't', p: [c[0], c[1] - th * 0.4], s: String(n), h: th * 0.8, rot: 0, al: 'c', va: 'b', ly: 'dim' }); }

// Olcu cizimi; donus: metin capasi (sayfa)
function drawDim(list, d, g, pl, tx, th, ly) {
  const L = (a, b) => list.push({ k: 'l', a, b, ly });
  const S = (q) => toSheet(pl, q);
  const T = (p, rot = 0, al = 'c') => { list.push({ k: 't', p, s: tx.main, h: th, rot, al, va: 'b', ly }); if (tx.devs) { const w = textWidth(tx.main, th); const rr = (rot * Math.PI) / 180; const base = add(p, rot2([al === 'c' ? w / 2 + 0.8 : w + 0.8, 0], rr)); list.push({ k: 't', p: add(base, rot2([0, th * 0.55], rr)), s: tx.devs[0], h: th * 0.7, rot, al: 'l', va: 'b', ly }); list.push({ k: 't', p: add(base, rot2([0, -th * 0.15], rr)), s: tx.devs[1], h: th * 0.7, rot, al: 'l', va: 'b', ly }); } };
  const off = Number.isFinite(d.off) ? d.off : 10;
  if (d.type === 'lin') {
    const p1 = S(g.p1), p2 = S(g.p2); const dir = d.dir || 'h';
    let u, n0;
    if (dir === 'h') { u = [1, 0]; n0 = [0, 1]; } else if (dir === 'v') { u = [0, 1]; n0 = [1, 0]; } else { u = nrm(sub(p2, p1)); n0 = [-u[1], u[0]]; }
    const s1 = p1[0] * n0[0] + p1[1] * n0[1], s2 = p2[0] * n0[0] + p2[1] * n0[1];
    const base = off >= 0 ? Math.max(s1, s2) + off : Math.min(s1, s2) + off; const sg = off >= 0 ? 1 : -1;
    const q1 = add(p1, mul(n0, base - s1)), q2 = add(p2, mul(n0, base - s2));
    L(add(p1, mul(n0, sg * 1)), add(q1, mul(n0, sg * 2))); L(add(p2, mul(n0, sg * 1)), add(q2, mul(n0, sg * 2)));
    L(q1, q2); const du = nrm(sub(q2, q1)); const span = dist(q1, q2);
    if (span > 2 * ARW + 1) { arrow(list, q1, mul(du, -1), ly); arrow(list, q2, du, ly); } else { arrow(list, q1, du, ly); arrow(list, q2, mul(du, -1), ly); L(q2, add(q2, mul(du, ARW + 3))); L(q1, sub(q1, mul(du, ARW + 3))); }
    let ang = Math.atan2(du[1], du[0]); if (ang > Math.PI / 2 + 1e-9 || ang < -Math.PI / 2 + 1e-9) ang += Math.PI; // okunur yon (ISO 129-1 yontem 1)
    const nn = [-Math.sin(ang), Math.cos(ang)]; const m = mul(add(q1, q2), 0.5); const at = add(add(m, mul(nn, 1)), mul([Math.cos(ang), Math.sin(ang)], d.tx || 0));
    T(at, (ang * 180) / Math.PI); return at;
  }
  if (d.type === 'ord') {
    const p2 = S(g.p2); const ax = d.axis === 'y' ? 1 : 0; const u = ax ? [1, 0] : [0, 1];
    const e = add(p2, mul(u, off)); L(add(p2, mul(u, 1)), e);
    const at = ax ? add(e, [1, -th / 2]) : add(e, [th / 2, 1]);
    list.push({ k: 't', p: at, s: tx.main, h: th, rot: ax ? 0 : 90, al: 'l', va: 'b', ly }); return ax ? add(at, [textWidth(tx.main, th) / 2, 0]) : at;
  }
  if (d.type === 'dia' || d.type === 'rad') {
    const c = S(g.c), rs = g.r * pl.s; const a = (((d.ang ?? 45)) * Math.PI) / 180; const u = [Math.cos(a), Math.sin(a)];
    const q = add(c, mul(u, rs)); const out = add(q, mul(u, Math.max(off, 4)));
    if (d.type === 'dia') { L(sub(c, mul(u, rs)), out); arrow(list, q, mul(u, -1), ly); arrow(list, sub(c, mul(u, rs)), u, ly); } else { L(c, out); arrow(list, q, u, ly); }
    const sx = u[0] >= 0 ? 1 : -1; const w = textWidth(tx.main, th) + 2; const sh = add(out, [sx * w, 0]); L(out, sh);
    const at = [(out[0] + sh[0]) / 2, out[1] + 1]; T(at, 0); return at;
  }
  if (d.type === 'ang') {
    if (!g.vertex) return null;
    const X = S(g.vertex); const mA = S(g.fa), mB = S(g.fb); let a1 = Math.atan2(mA[1] - X[1], mA[0] - X[0]), a2 = Math.atan2(mB[1] - X[1], mB[0] - X[0]);
    let sw = ((a2 - a1) % TAU + TAU) % TAU; if (sw > Math.PI) { [a1, a2] = [a2, a1]; sw = TAU - sw; }
    if (d.sup) { a1 = a1 + sw; sw = Math.PI - sw; }
    const r = Math.max(off, 6); list.push({ k: 'a', c: X, r, a0: a1, sw, ly });
    const p1 = add(X, mul([Math.cos(a1), Math.sin(a1)], r)), p2 = add(X, mul([Math.cos(a1 + sw), Math.sin(a1 + sw)], r));
    arrow(list, p1, [Math.sin(a1), -Math.cos(a1)], ly); arrow(list, p2, [-Math.sin(a1 + sw), Math.cos(a1 + sw)], ly);
    const am = a1 + sw / 2; const at = add(X, mul([Math.cos(am), Math.sin(am)], r + 2)); T(at, 0); return at;
  }
  return null;
}

// Yuzey puruzlulugu sembolu (ISO 1302 / ISO 21920-1): uc yuzeyde; proc 'any' | 'remove' (talasli) | 'noremove'
function roughSym(list, p, r, th, dec) {
  const a = ((r.ang || 0) * Math.PI) / 180; const k = th / 3.5; const H1 = 5 * k, H2 = 10.5 * k; const t60 = Math.tan(Math.PI / 3);
  const P = (x, y) => add(p, rot2([x, y], a)); const L = (q1, q2) => list.push({ k: 'l', a: q1, b: q2, ly: 'dim' });
  L(P(0, 0), P(-H1 / t60, H1)); L(P(0, 0), P(H2 / t60, H2));
  if (r.proc === 'remove') L(P(-H1 / t60, H1), P(H1 / t60, H1));
  if (r.proc === 'noremove') list.push({ k: 'c', c: P(0, H1 * 2 / 3), r: H1 / 3, ly: 'dim' });
  const s = (r.param || 'Ra') + ' ' + (typeof r.val === 'number' ? fmtN(r.val, 3, dec) : String(r.val ?? ''));
  const w = textWidth(s, th) + 1; L(P(H2 / t60, H2), P(H2 / t60 + w, H2));
  list.push({ k: 't', p: P(H2 / t60 + 0.5, H2 - th - 0.8), s, h: th, rot: (a * 180) / Math.PI, al: 'l', va: 'b', ly: 'dim' });
}

// Tablo: sol ust kose p; sutun genislikleri ws
export function table(list, p, head, rows, ws, h) {
  const rh = h * 2; const W = ws.reduce((a, b) => a + b, 0); const n = rows.length + 1;
  const y0 = p[1] - rh * n;
  list.push({ k: 'p', pts: [[p[0], y0], [p[0] + W, y0], [p[0] + W, p[1]], [p[0], p[1]]], closed: true, ly: 'tb' });
  for (let i = 1; i < n; i++) list.push({ k: 'l', a: [p[0], p[1] - rh * i], b: [p[0] + W, p[1] - rh * i], ly: 'thin' });
  let x = p[0]; for (let j = 0; j < ws.length - 1; j++) { x += ws[j]; list.push({ k: 'l', a: [x, y0], b: [x, p[1]], ly: 'thin' }); }
  [head, ...rows].forEach((row, i) => { let xx = p[0]; row.forEach((c, j) => { list.push({ k: 't', p: [xx + 1, p[1] - rh * (i + 1) + rh * 0.3], s: String(c ?? ''), h, rot: 0, al: 'l', va: 'b', ly: 'txt' }); xx += ws[j]; }); });
  return y0;
}

// Delik tablosu satirlari: gorunus d'sine paralel eksenli delikler; orijin: gorunus kutusunun sol alt kosesi (ya da ht.origin)
export function holeTableRows(V, holes, ht, T, { prec = 2, dec = ',' } = {}) {
  const B = V.B; if (!B) return [];
  const o = ht.origin || (V.box ? [V.box[0], V.box[1]] : [0, 0]);
  const groups = new Map(); const rows = [];
  for (const h of holes) {
    (h.positions || []).forEach((p, i) => {
      const d = (h.dirs || [])[i] || h.dir; if (!d) return;
      const c = Math.abs(d[0] * B.d[0] + d[1] * B.d[1] + d[2] * B.d[2]); if (c < 1 - 1e-6) return;
      const uv = [p[0] * B.x[0] + p[1] * B.x[1] + p[2] * B.x[2], p[0] * B.y[0] + p[1] * B.y[1] + p[2] * B.y[2]];
      const desc = holeDesc(h, T, prec, dec); let g = groups.get(desc); if (!g) { g = { letter: String.fromCharCode(65 + (groups.size % 26)), n: 0 }; groups.set(desc, g); }
      rows.push({ uv, desc, g });
    });
  }
  rows.sort((a, b) => (a.g.letter === b.g.letter ? a.uv[1] - b.uv[1] || a.uv[0] - b.uv[0] : a.g.letter < b.g.letter ? -1 : 1));
  return rows.map((r) => ({ tag: r.g.letter + ++r.g.n, x: r.uv[0] - o[0], y: r.uv[1] - o[1], uv: r.uv, desc: r.desc }));
}
function holeDesc(h, T, prec, dec) {
  const base = h.thread?.designation ? h.thread.designation : 'Ø' + fmtN(h.dia, prec, dec);
  const depth = h.through ? T('drw.ht.thru') : h.depth ? T('drw.ht.depth', { d: fmtN(h.depth, prec, dec) }) : '';
  const kind = h.kind === 'cbore' ? T('drw.ht.cbore') : h.kind === 'csink' ? T('drw.ht.csink') : '';
  return [base, depth, kind].filter(Boolean).join(' ');
}

// Antet (ISO 7200 alanlarinin sadelestirilmisi, O onerisi): sag altta 180 x 32 mm
export const TB_FIELDS = ['company', 'title', 'number', 'material', 'rev', 'gentol', 'drawn', 'checked', 'approved', 'date'];
function titleBlock(list, dr, W, H, T, th) {
  const x0 = W - FRAME.r - TB.w, y0 = FRAME.b; const tb = dr.sheet.tb || {};
  const cell = (x, y, w, h, label, val, vh = 2.5) => {
    list.push({ k: 'p', pts: [[x0 + x, y0 + y], [x0 + x + w, y0 + y], [x0 + x + w, y0 + y + h], [x0 + x, y0 + y + h]], closed: true, ly: 'tb' });
    list.push({ k: 't', p: [x0 + x + 1, y0 + y + h - 2.6], s: label, h: 1.8, rot: 0, al: 'l', va: 'b', ly: 'txt' });
    if (val) list.push({ k: 't', p: [x0 + x + 1.5, y0 + y + 1.4], s: String(val), h: vh, rot: 0, al: 'l', va: 'b', ly: 'txt' });
  };
  cell(0, 24, 110, 8, T('drw.tb.company'), tb.company, 3.5);
  cell(110, 24, 30, 8, T('drw.tb.proj'), '');
  projSymbol(list, [x0 + 125, y0 + 27.2], dr.sheet.angle);
  cell(140, 24, 40, 8, T('drw.tb.scale'), scaleText(dr.sheet.scale || 1), 3.5);
  cell(0, 16, 110, 8, T('drw.tb.title'), tb.title, 3.5);
  cell(110, 16, 70, 8, T('drw.tb.material'), tb.material);
  cell(0, 8, 70, 8, T('drw.tb.number'), tb.number, 3.5);
  cell(70, 8, 20, 8, T('drw.tb.rev'), tb.rev);
  cell(90, 8, 20, 8, T('drw.tb.sheet'), `${dr.sheet.size || 'A3'} ${dr.sheet.page || '1/1'}`);
  cell(110, 8, 70, 8, T('drw.tb.gentol'), tb.gentol);
  cell(0, 0, 45, 8, T('drw.tb.drawn'), tb.drawn); cell(45, 0, 45, 8, T('drw.tb.checked'), tb.checked); cell(90, 0, 45, 8, T('drw.tb.approved'), tb.approved); cell(135, 0, 45, 8, T('drw.tb.date'), tb.date);
  void H; void th;
}
// Izdusum yontemi sembolu (ISO 5456-2): kesik koni. Ucuncu aci: daire solda, koninin dar ucu daireye bakar; birinci aci: daire sagda, genis uc daireye bakar.
function projSymbol(list, c, angle) {
  const R = 2.4, r = 1.2, Lc = 6; const first = angle !== 'third';
  const cc = first ? [c[0] + 5, c[1]] : [c[0] - 5, c[1]]; const tx = first ? c[0] - 5 : c[0] + 5;
  list.push({ k: 'c', c: cc, r: R, ly: 'tb' }); list.push({ k: 'c', c: cc, r, ly: 'tb' });
  // koni: daireye bakan uc (ucuncu acida dar, birinci acida genis)
  const near = first ? R : r, far = first ? r : R; const sx = first ? 1 : -1; const xn = tx + sx * (Lc / 2), xf = tx - sx * (Lc / 2);
  list.push({ k: 'p', pts: [[xf, c[1] - far], [xn, c[1] - near], [xn, c[1] + near], [xf, c[1] + far]], closed: true, ly: 'tb' });
  list.push({ k: 'l', a: [cc[0] - R - 1, c[1]], b: [cc[0] + R + 1, c[1]], ly: 'ctr' });
}
void toPts;
