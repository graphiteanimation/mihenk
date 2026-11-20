// Düzenleme işlemleri: ofset, köşe yuvarlat/pah, ayna, desenler, dönüşümler, izdüşüm, pano. Saf işlevler: sk'yi yerinde değiştirir.
import { G, clone, entPts, conRefs, deleteItems, getEnt, segOf, newId, addPoint, addEnt, addCon, cleanup, findPointAt, usersOf, DIM_TYPES, TAU, measureDim } from './core.js';
import { ellipseGeom } from '../../shared/profiles.js';
import { evalExpr } from '../../shared/expr.js';

export { trimAt, extendAt, breakAt, trimSpan } from './trim.js';
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (key, params) => ({ ok: false, err: { key, params } });
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- kopyalama çekirdeği
// ents: kopyalanacak varlıklar; f: [x,y]→[x,y]; opts.swapArc: ayna (yay uçları yer değiştirir); opts.keepPts: dönüşmeden aynı kalacak nokta kimlikleri
export function cloneEnts(sk, ents, f, opts = {}) {
  const pmap = new Map(); const emap = new Map();
  const mapPt = (id) => {
    if (pmap.has(id)) return pmap.get(id);
    if (opts.keepPts && opts.keepPts.has(id)) { pmap.set(id, id); return id; }
    const p = sk.points[id]; const q = f([p.x, p.y]); const nid = addPoint(sk, q[0], q[1]); pmap.set(id, nid); return nid;
  };
  for (const e of ents) {
    const n = { type: e.type }; if (e.cons) n.cons = true;
    switch (e.type) {
      case 'line': n.a = mapPt(e.a); n.b = mapPt(e.b); break;
      case 'circle': n.c = mapPt(e.c); n.r = e.r * (opts.scale || 1); break;
      case 'arc': n.c = mapPt(e.c); if (opts.swapArc) { n.a = mapPt(e.b); n.b = mapPt(e.a); } else { n.a = mapPt(e.a); n.b = mapPt(e.b); } break;
      case 'point': n.p = mapPt(e.p); break;
      case 'ellipse': n.c = mapPt(e.c); n.f = mapPt(e.f); n.rmin = e.rmin * (opts.scale || 1); break;
      case 'ellarc': n.c = mapPt(e.c); n.f = mapPt(e.f); n.rmin = e.rmin * (opts.scale || 1); if (opts.swapArc) { n.a = mapPt(e.b); n.b = mapPt(e.a); } else { n.a = mapPt(e.a); n.b = mapPt(e.b); } break;
      case 'spline': n.pts = e.pts.map(mapPt); if (e.closed) n.closed = true; break;
    }
    emap.set(e.id, addEnt(sk, n));
  }
  return { pmap, emap };
}
const ptsOf = (sk, ents) => { const s = new Set(); for (const e of ents) entPts(e).forEach((p) => s.add(p)); return s; };

// ---------------------------------------------------------------- OFSET
// ids: seçili varlıklar; dist: sayı (>0); exprText: kullanıcı ifadesi; sidePt: ofset tarafını belirleyen nokta
// Döner {ok, newEnts, linked:boolean}
function buildChain(sk, ents) {
  const segs = ents.map((e) => ({ e, seg: segOf(sk, e) })).filter((x) => x.seg);
  const order = G.orderChain(segs.map((x) => x.seg)); if (!order || order.length !== segs.length) return null;
  return order.map((o) => ({ ...o, e: segs[o.i].e }));
}
export function offsetEnts(sk, ids, dist, exprText, sidePt, join = 'sharp') {
  const ents = ids.map((id) => getEnt(sk, id)).filter((e) => e && e.type !== 'point'); if (!ents.length) return fail('sk.op.no_curve');
  if (!(dist > 0)) return fail('sk.op.dist_pos');
  const chain = buildChain(sk, ents); if (!chain) return fail('sk.op.chain_broken');
  // taraf: sidePt'nin yönlü uzaklık işareti (zincirin en yakın parçasına göre)
  let best = null; for (const it of chain) { const cp = G.closestPoint(it.seg, sidePt); if (!best || cp.d < best.d) best = { ...cp, it }; }
  const tg = G.tangentAt(best.it.seg, best.u); const sgn0 = (sidePt[0] - best.p[0]) * -tg[1] + (sidePt[1] - best.p[1]) * tg[0];
  let left = sgn0 >= 0; // seg kanonik yönüne göre sol
  const useFwd = best.it.fwd; if (!useFwd) left = !left; // gidiş yönünde solda mı
  // dairesel/kapalı tek eğri: sol = iç (CCW), sidePt'nin merkeze göre durumuna göre belirle
  if (chain.length === 1 && G.isClosed(chain[0].seg)) { const s = chain[0].seg; const cen = s.c; const inside = G.dist(sidePt, cen) < (s.r ?? Math.max(s.rx, s.ry)) && (s.type === 'circle' ? true : G.pointInPoly(sidePt, G.sample(s, 0.05))); left = inside; }
  const d = left ? dist : -dist;
  const closedChain = chain.length > 1 && G.dist(G.startEnd(chain[0].seg)[chain[0].fwd ? 0 : 1], G.startEnd(chain[chain.length - 1].seg)[chain[chain.length - 1].fwd ? 1 : 0]) < 1e-6;
  const items = chain.map((it) => ({ seg: it.seg, fwd: it.fwd }));
  const out = G.offsetChain(items, d, join, closedChain);
  if (!out.length || out.length < items.length) return fail('sk.op.offset_vanish');
  // ürün: yeni varlıklar (noktalar ardışık parçalarda paylaşılır)
  const newEnts = []; let prevEnd = null; let firstStart = null;
  const mk = (seg) => {
    const [p0, p1] = G.startEnd(seg);
    return { seg, p0, p1 };
  };
  const cons = !!ents[0].cons;
  for (let i = 0; i < out.length; i++) {
    const { seg, fwd } = out[i]; const [s0, s1] = G.startEnd(seg);
    const tS = fwd ? s0 : s1, tE = fwd ? s1 : s0; // gidiş yönündeki başlangıç/bitiş
    const sId = prevEnd || (i === out.length - 1 && closedChain ? null : addPoint(sk, tS[0], tS[1])); // kapalı zincirde son parçanın bitişi ilk noktaya bağlanır
    let startId = prevEnd; if (!startId) { startId = addPoint(sk, tS[0], tS[1]); firstStart = startId; }
    let endId;
    if (closedChain && i === out.length - 1) endId = firstStart; else endId = addPoint(sk, tE[0], tE[1]);
    prevEnd = endId;
    const a = fwd ? startId : endId, b = fwd ? endId : startId; // kanonik (başlangıç, bitiş)
    let ne;
    if (seg.type === 'line') ne = { type: 'line', a, b };
    else if (seg.type === 'arc') { const cp = addPoint(sk, seg.c[0], seg.c[1]); ne = { type: 'arc', c: cp, a, b }; }
    else if (seg.type === 'circle') { const cp = addPoint(sk, seg.c[0], seg.c[1]); ne = { type: 'circle', c: cp, r: seg.r }; }
    else if (seg.type === 'ellipse' || seg.type === 'ellarc') return fail('sk.op.offset_ellipse');
    else if (seg.type === 'spline') { const ids2 = seg.pts.map((p, k) => (k === 0 && !seg.closed ? a : k === seg.pts.length - 1 && !seg.closed ? b : addPoint(sk, p[0], p[1]))); ne = { type: 'spline', pts: ids2, ...(seg.closed ? { closed: true } : {}) }; }
    if (cons) ne.cons = true; newEnts.push(addEnt(sk, ne));
    if (seg.type === 'circle') { /* tam daire: başlangıç/bitiş noktaları gereksiz */ delete sk.points[startId]; if (endId !== startId) delete sk.points[endId]; prevEnd = null; }
  }
  // kaynak ile ilişki: tek çizgi → paralel + noktadan çizgiye ölçü; tek daire/yay → eş merkez + yarıçap farkı
  let linked = false;
  if (chain.length === 1 && out.length === 1) {
    const src = chain[0].e, ne = getEnt(sk, newEnts[0]);
    if (src.type === 'line' && ne.type === 'line') { addCon(sk, 'parallel', src.id, ne.id); addCon(sk, 'pldist', ne.a, src.id, { expr: String(exprText) }); linked = true; }
    else if ((src.type === 'circle' || src.type === 'arc') && (ne.type === 'circle' || ne.type === 'arc')) {
      if (ne.type === 'circle') { sk.points[ne.c] && delete sk.points[ne.c]; ne.c = src.c; } else { delete sk.points[ne.c]; ne.c = src.c; }
      // yarıçap farkı (yeni − kaynak) = ±ifade: sol = iç ofset (yarıçap azalır)
      const inner = ne.type === 'circle' ? ne.r < src.r : Math.hypot(sk.points[ne.a].x - sk.points[ne.c].x, sk.points[ne.a].y - sk.points[ne.c].y) < Math.hypot(sk.points[src.a].x - sk.points[src.c].x, sk.points[src.a].y - sk.points[src.c].y);
      addCon(sk, 'radiusdiff', src.id, ne.id, { expr: (inner ? '-(' : '(') + String(exprText) + ')' }); linked = true;
    }
  }
  cleanup(sk);
  return ok({ newEnts, linked });
}

// ---------------------------------------------------------------- KÖŞE YUVARLAT / PAH
// V noktasında buluşan iki varlık. kind: 'fillet' | 'chamfer'; val: sayı; exprText: ifade (yarıçap ölçüsü için)
function cornerEnts(sk, vid, a, b) {
  const cand = usersOf(sk, vid).filter((e) => e.type === 'line' || e.type === 'arc');
  if (a && b) return [getEnt(sk, a), getEnt(sk, b)];
  return cand.length === 2 ? cand : null;
}
export function cornerAt(sk, vid, kind, val, exprText, entA, entB) {
  if (!sk.points[vid]) return fail('sk.op.corner_none');
  const pair = cornerEnts(sk, vid, entA, entB); if (!pair || !pair[0] || !pair[1]) return fail('sk.op.corner_two');
  const [A, B] = pair; if (A.id === B.id) return fail('sk.op.corner_two');
  const endOf = (e) => (e.a === vid ? 'a' : e.b === vid ? 'b' : null);
  const ea = endOf(A), eb = endOf(B); if (!ea || !eb) return fail('sk.op.corner_two');
  if (!(val > 0)) return fail('sk.op.dist_pos');
  const sa = segOf(sk, A), sb = segOf(sk, B), V = [sk.points[vid].x, sk.points[vid].y];
  let tA, tB, center = null;
  if (kind === 'fillet') {
    const f = G.filletCenter(sa, sb, val, V);
    if (!f) return fail('sk.op.fillet_big');
    tA = f.tA; tB = f.tB; center = f.c;
    if (G.dist(tA, V) < 1e-6 || G.dist(tB, V) < 1e-6) return fail('sk.op.fillet_big');
  } else { // pah: V'den val kadar eğri boyunca
    const along = (seg, atStart) => {
      const L = G.length(seg); if (val >= L - 1e-6) return null;
      if (seg.type === 'line') { const t = val / L; return atStart ? G.ptAt(seg, t) : G.ptAt(seg, 1 - t); }
      const du = val / seg.r; return atStart ? G.ptAt(seg, du) : G.ptAt(seg, seg.sweep - du);
    };
    tA = along(sa, ea === 'a'); tB = along(sb, eb === 'a'); if (!tA || !tB) return fail('sk.op.chamfer_big');
  }
  const pa = addPoint(sk, tA[0], tA[1]), pb = addPoint(sk, tB[0], tB[1]);
  A[ea] = pa; B[eb] = pb;
  sk.cons = sk.cons.filter((c) => !(conRefs(c).includes(vid) && c.type !== 'pointOn') || false);
  sk.cons = sk.cons.filter((c) => !conRefs(c).includes(vid));
  if (kind === 'fillet') {
    // yay: kısa yoldan CCW sıralı uçlar
    const cp = addPoint(sk, center[0], center[1]);
    const a1 = Math.atan2(tA[1] - center[1], tA[0] - center[0]), a2 = Math.atan2(tB[1] - center[1], tB[0] - center[0]);
    const swap = G.wrap(a2 - a1) > Math.PI; const [s, t] = swap ? [pb, pa] : [pa, pb];
    const arc = addEnt(sk, { type: 'arc', c: cp, a: s, b: t, ...(A.cons && B.cons ? { cons: true } : {}) });
    addCon(sk, 'tangent', A.id, arc); addCon(sk, 'tangent', B.id, arc); addCon(sk, 'radius', arc, undefined, { expr: String(exprText) });
  } else {
    addEnt(sk, { type: 'line', a: pa, b: pb, ...(A.cons && B.cons ? { cons: true } : {}) });
    // pah ölçü kısıtı (yuvarlattaki yarıçap ölçüsü gibi): pah çizgisinin uzunluğu. İki çizgi arasında ifade yazılan değere bağlı kalır
    // (kol uzunluğu × 2·sin(açı/2) çarpanı), aksi halde oluşturulan geometrinin ölçüsü sayı olarak yazılır.
    const chord = G.dist(tA, tB), numeric = /^[-+]?\d*[.,]?\d+$/.test(String(exprText).trim());
    const expr = A.type === 'line' && B.type === 'line' && !numeric ? '(' + String(exprText) + ')*' + (chord / val).toFixed(10) : String(+chord.toFixed(6));
    addCon(sk, 'dist', pa, pb, { expr });
  }
  const removed = cleanup(sk);
  return ok({ removedCons: removed });
}

// ---------------------------------------------------------------- AYNA
export function mirrorEnts(sk, ids, lineId, linked = true) {
  const L = getEnt(sk, lineId); if (!L || L.type !== 'line') return fail('sk.op.mirror_line');
  const ents = ids.filter((i) => i !== lineId).map((i) => getEnt(sk, i)).filter(Boolean); if (!ents.length) return fail('sk.op.nothing');
  const a = sk.points[L.a], b = sk.points[L.b]; const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; if (l2 < 1e-18) return fail('sk.op.mirror_line');
  const refl = (p) => { const t = ((p[0] - a.x) * dx + (p[1] - a.y) * dy) / l2; const fx = a.x + dx * t, fy = a.y + dy * t; return [2 * fx - p[0], 2 * fy - p[1]]; };
  const onLine = (id) => Math.abs((sk.points[id].x - a.x) * dy - (sk.points[id].y - a.y) * dx) / Math.sqrt(l2) < 1e-6;
  const keep = new Set(); for (const id of ptsOf(sk, ents)) if (onLine(id)) keep.add(id);
  const { pmap, emap } = cloneEnts(sk, ents, refl, { swapArc: true, keepPts: keep });
  if (linked) {
    for (const [oid, nid] of pmap) if (oid !== nid) addCon(sk, 'symmetric', oid, nid, { c: lineId });
    for (const e of ents) { const ne = getEnt(sk, emap.get(e.id)); if (e.type === 'circle') addCon(sk, 'equal', e.id, ne.id); else if (e.type === 'ellipse') addCon(sk, 'equal', e.id, ne.id); }
  }
  return ok({ newEnts: [...emap.values()] });
}

// ---------------------------------------------------------------- DESENLER
const q = (s) => '(' + String(s) + ')';
// dikdörtgen desen: yön 1 açısı angExpr (derece, 0 = X), adım ifadeleri; n1×n2 kopya (kaynak dahil)
export function patternRect(sk, ids, { n1, n2 = 1, s1, s2 = '0', ang = '0', vars = {}, linked = true }) {
  const ents = ids.map((i) => getEnt(sk, i)).filter(Boolean); if (!ents.length) return fail('sk.op.nothing');
  n1 = Math.floor(n1); n2 = Math.floor(n2); if (!(n1 >= 1 && n2 >= 1) || n1 * n2 > 400) return fail('sk.op.pattern_count');
  let v1, v2, th; try { v1 = evalExpr(s1, vars); v2 = evalExpr(s2, vars); th = evalExpr(ang, vars) * DEG; } catch (e) { return fail('sk.op.bad_expr'); }
  const srcPts = [...ptsOf(sk, ents)].filter((id) => id !== 'O');
  const total = (n1 * n2 - 1) * srcPts.length; const lnk = linked && total * 2 <= 600;
  const created = [];
  for (let j = 0; j < n2; j++) for (let i = 0; i < n1; i++) {
    if (!i && !j) continue;
    const ox = i * v1 * Math.cos(th) - j * v2 * Math.sin(th), oy = i * v1 * Math.sin(th) + j * v2 * Math.cos(th);
    const { pmap, emap } = cloneEnts(sk, ents, (p) => [p[0] + ox, p[1] + oy]);
    created.push(...emap.values());
    if (lnk) {
      const ex = th === 0 ? `${i}*${q(s1)}` : `${i}*${q(s1)}*cos(${q(ang)})-${j}*${q(s2)}*sin(${q(ang)})`;
      const ey = th === 0 ? `${j}*${q(s2)}` : `${i}*${q(s1)}*sin(${q(ang)})+${j}*${q(s2)}*cos(${q(ang)})`;
      const ex2 = th === 0 && !i ? '0' : ex, ey2 = th === 0 && !j ? '0' : ey;
      for (const [oid, nid] of pmap) { addCon(sk, 'hdist', oid, nid, { expr: ex2 }); addCon(sk, 'vdist', oid, nid, { expr: ey2 }); }
    }
  }
  return ok({ newEnts: created, linked: lnk });
}
// dairesel desen: merkez nokta kimliği (cid), adet n, toplam açı (ifade; 360 = tam), kaynak dahil
export function patternCirc(sk, ids, { n, cid = 'O', total = '360', vars = {}, linked = true }) {
  const ents = ids.map((i) => getEnt(sk, i)).filter(Boolean); if (!ents.length) return fail('sk.op.nothing');
  n = Math.floor(n); if (!(n >= 2) || n > 200) return fail('sk.op.pattern_count');
  let tot; try { tot = evalExpr(total, vars); } catch (e) { return fail('sk.op.bad_expr'); }
  const full = Math.abs(Math.abs(tot) - 360) < 1e-9; const stepDeg = full ? tot / n : tot / (n - 1);
  const C = sk.points[cid]; const srcPts = [...ptsOf(sk, ents)].filter((id) => id !== cid);
  const lnk = linked && (n - 1) * srcPts.length <= 120; const created = [];
  const helpers = new Map(); // kaynak nokta → yardımcı yapı çizgisi (merkez→nokta)
  const helper = (pid) => { if (helpers.has(pid)) return helpers.get(pid); const id = addEnt(sk, { type: 'line', a: cid, b: pid, cons: true }); helpers.set(pid, id); return id; };
  for (let k = 1; k < n; k++) {
    const ang = k * stepDeg * DEG, cs = Math.cos(ang), sn = Math.sin(ang);
    const { pmap, emap } = cloneEnts(sk, ents, (p) => [C.x + (p[0] - C.x) * cs - (p[1] - C.y) * sn, C.y + (p[0] - C.x) * sn + (p[1] - C.y) * cs], { keepPts: new Set([cid]) });
    created.push(...emap.values());
    if (lnk) {
      for (const [oid, nid] of pmap) {
        if (oid === cid) continue; const h0 = helper(oid); const hk = addEnt(sk, { type: 'line', a: cid, b: nid, cons: true });
        addCon(sk, 'equal', h0, hk); addCon(sk, 'angle', h0, hk, { expr: `${k}*(${full ? q(total) + '/' + n : q(total) + '/' + (n - 1)})` });
      }
    }
  }
  return ok({ newEnts: created, linked: lnk });
}

// ---------------------------------------------------------------- DÖNÜŞÜMLER
const ORIENT = new Set(['horizontal', 'vertical', 'horizontal_pp', 'vertical_pp', 'hdist', 'vdist']);
export function transformEnts(sk, ids, kind, p, { copy = false } = {}) {
  const ents = ids.map((i) => getEnt(sk, i)).filter(Boolean); if (!ents.length) return fail('sk.op.nothing');
  let f, scale = 1;
  if (kind === 'move') f = (q) => [q[0] + p.dx, q[1] + p.dy];
  else if (kind === 'rotate') { const a = p.angle * DEG, cs = Math.cos(a), sn = Math.sin(a); f = (q) => [p.cx + (q[0] - p.cx) * cs - (q[1] - p.cy) * sn, p.cy + (q[0] - p.cx) * sn + (q[1] - p.cy) * cs]; }
  else if (kind === 'scale') { if (!(p.k > 0)) return fail('sk.op.scale_pos'); scale = p.k; f = (q) => [p.cx + (q[0] - p.cx) * p.k, p.cy + (q[1] - p.cy) * p.k]; }
  else return fail('sk.op.nothing');
  if (copy) { const r = cloneEnts(sk, ents, f, { scale }); return ok({ newEnts: [...r.emap.values()] }); }
  const pts = ptsOf(sk, ents); pts.delete('O');
  for (const id of pts) { const q = f([sk.points[id].x, sk.points[id].y]); sk.points[id].x = q[0]; sk.points[id].y = q[1]; }
  if (scale !== 1) for (const e of ents) { if (e.type === 'circle') e.r *= scale; if (e.type === 'ellipse' || e.type === 'ellarc') e.rmin *= scale; }
  // geometriyi bozan kısıtları sadece seçili geometri içindeyse kaldır
  const inside = (c) => conRefs(c).every((r) => pts.has(r) || ents.some((e) => e.id === r));
  let removed = 0; const before = sk.cons.length;
  if (kind === 'rotate') sk.cons = sk.cons.filter((c) => !(ORIENT.has(c.type) && inside(c)));
  if (kind === 'scale') sk.cons = sk.cons.filter((c) => !(DIM_TYPES.has(c.type) && inside(c)));
  // dönmede/ölçeklemede sabit noktalar serbest bırakılır (aksi halde taşınan sabit nokta orijinal yerine döner)
  removed = before - sk.cons.length;
  return ok({ removedCons: removed });
}

// ---------------------------------------------------------------- İZDÜŞÜM
// polylines: [{pts:[[x,y]...], closed?}] eskiz yerel koordinatlarında; sabit yapı geometrisi olarak eklenir.
function fitCircle(p) {
  const a = p[0], b = p[Math.floor(p.length / 2)], c = p[p.length - 1];
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-12) return null;
  const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d;
  const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d;
  return { c: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) };
}
function projectCore(sk, polylines, tol = 2e-3) {
  const created = []; let lines = 0, circles = 0, splines = 0;
  const has = (seg) => created.some((x) => x.sig === seg);
  for (const pl of polylines) {
    let pts = pl.pts.filter((p, i) => i === 0 || G.dist(p, pl.pts[i - 1]) > 1e-9); if (pts.length < 2) continue;
    const closed = G.dist(pts[0], pts[pts.length - 1]) < 1e-6; if (closed) pts = pts.slice(0, -1);
    if (pts.length < 2) continue;
    const mkFixedPt = (p) => addPoint(sk, p[0], p[1], true);
    const find = (p) => findPointAt(sk, p, 1e-6) ;
    const useOrNew = (p) => { const ex = find(p); if (ex && sk.points[ex].fixed) return ex; return mkFixedPt(p); };
    const first = pts[0], last = closed ? pts[0] : pts[pts.length - 1];
    // doğru mu?
    const ln = G.mkLine(first, pts[pts.length - 1]); const straight = !closed && G.length(ln) > 1e-9 && pts.every((p) => G.closestPoint(ln, p).d < tol);
    if (straight) { const a = useOrNew(first), b = useOrNew(last); if (a !== b && !sk.ents.some((e) => e.type === 'line' && ((e.a === a && e.b === b) || (e.a === b && e.b === a)))) { addEnt(sk, { type: 'line', a, b, cons: true }); lines++; } continue; }
    const fc = pts.length >= 3 ? fitCircle(closed ? pts : pts) : null;
    if (fc && fc.r < 1e6 && pts.every((p) => Math.abs(G.dist(p, fc.c) - fc.r) < tol * Math.max(1, fc.r / 50))) {
      const cp = useOrNew(fc.c);
      if (closed) { if (!sk.ents.some((e) => e.type === 'circle' && e.c === cp && Math.abs(e.r - fc.r) < 1e-6)) { addEnt(sk, { type: 'circle', c: cp, r: fc.r, cons: true }); circles++; } }
      else { const m = pts[Math.floor(pts.length / 2)]; const cr = (first[0] - fc.c[0]) * (m[1] - fc.c[1]) - (first[1] - fc.c[1]) * (m[0] - fc.c[0]); const s = cr > 0 ? [first, last] : [last, first]; addEnt(sk, { type: 'arc', c: cp, a: useOrNew(s[0]), b: useOrNew(s[1]), cons: true }); circles++; }
      continue;
    }
    // spline: en çok 40 nokta
    const step = Math.max(1, Math.ceil(pts.length / 40)); const sel = pts.filter((_, i) => i % step === 0); if (!closed && sel[sel.length - 1] !== last) sel.push(last);
    if (sel.length >= 2) { const ids = sel.map((p) => mkFixedPt(p)); addEnt(sk, { type: 'spline', pts: ids, ...(closed ? { closed: true } : {}), cons: true }); splines++; }
  }
  return ok({ lines, circles, splines, count: lines + circles + splines });
}

// ---- ilişkisel izdüşüm: kenar imzası, düzenleme izi, eşleştirme
// Tasarım kuralı: "emin değilsen dokunma, kullanıcıya söyle". Belirsiz eşleşmede geometri yerinde kalır, grup `lost` olur.
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const rp = (p) => [r4(p[0]), r4(p[1])];
// Kaynak kenarın eskiz düzlemindeki imzası: tür (l: doğru, o: daire, a: yay, s: eğri), uçlar/merkez/yarıçap
export function edgeSig(pts) {
  if (!pts || pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1], closed = G.dist(first, last) < 1e-6;
  const ln = G.mkLine(first, last);
  if (!closed && G.length(ln) > 1e-9 && pts.every((p) => G.closestPoint(ln, p).d < 2e-3)) return { k: 'l', a: rp(first), b: rp(last) };
  const body = closed ? pts.slice(0, -1) : pts;
  const fc = body.length >= 3 ? fitCircle(body) : null;
  if (fc && fc.r < 1e6 && body.every((p) => Math.abs(G.dist(p, fc.c) - fc.r) < 2e-3 * Math.max(1, fc.r / 50))) return closed ? { k: 'o', c: rp(fc.c), r: r4(fc.r) } : { k: 'a', c: rp(fc.c), r: r4(fc.r), a: rp(first), b: rp(last) };
  const cx = body.reduce((q, p) => q + p[0], 0) / body.length, cy = body.reduce((q, p) => q + p[1], 0) / body.length;
  return { k: 's', a: rp(first), b: rp(last), c: rp([cx, cy]) };
}
// İmza ile aday arasındaki uzaklık (mm); tür/doğrultu uyuşmazsa Infinity
export function sigDist(a, b) {
  if (!a || !b || a.k !== b.k) return Infinity;
  const ends = () => Math.min(G.dist(a.a, b.a), G.dist(a.b, b.b), G.dist(a.a, b.b), G.dist(a.b, b.a));
  if (a.k === 'l') {
    const da = [a.b[0] - a.a[0], a.b[1] - a.a[1]], db = [b.b[0] - b.a[0], b.b[1] - b.a[1]]; const la = Math.hypot(...da), lb = Math.hypot(...db);
    if (!la || !lb || Math.abs(da[0] * db[1] - da[1] * db[0]) / (la * lb) > 0.05) return Infinity; // ~3° üstü doğrultu farkı: aynı kenar değil
    return ends();
  }
  const rr = (b.r || 1) / (a.r || 1);
  if (a.k === 'o') return rr < 0.5 || rr > 2 ? Infinity : G.dist(a.c, b.c);
  if (a.k === 'a') return rr < 0.5 || rr > 2 ? Infinity : Math.min(G.dist(a.c, b.c), ends());
  return Math.min(G.dist(a.c, b.c), ends());
}
const TOL_A = 25, TOL_B = 1, CLEAR = 1; // (ii): aynı indeksli kenar en çok 25 mm oynamış olabilir; (i): imzaya <=1 mm uyan aday, ikincisinden en az 1 mm daha yakın
// İmza ile aday arasındaki kenar-kenar uzaklığı (mm): uçlar (en iyi eşleme, ikisi birlikte) / merkez+yarıçap birlikte. Tür/doğrultu uyuşmazsa Infinity.
export function edgeDist(a, b) {
  if (!isFinite(sigDist(a, b))) return Infinity;
  const pair = () => Math.min(Math.max(G.dist(a.a, b.a), G.dist(a.b, b.b)), Math.max(G.dist(a.a, b.b), G.dist(a.b, b.a)));
  if (a.k === 'l') return pair();
  if (a.k === 'o') return Math.max(G.dist(a.c, b.c), Math.abs(a.r - b.r));
  if (a.k === 'a') return Math.max(G.dist(a.c, b.c), Math.abs(a.r - b.r), pair());
  return Math.max(G.dist(a.c, b.c), pair());
}
// Parametrik değişim ölçütü (aynı indeksli aday için): {k: sıralama değeri, sh: bildirilen kayma (mm), ok: makul değişim mi} | null (tür/doğrultu uyuşmaz).
//  doğru: yan kayma (taşıyıcı doğrular arası dik uzaklık) + en yakın uç farkı; yan kayma <= 25 VE parçalar örtüşüyor / uç yakın ise boy değişimi sınırsız;
//  yay/daire: merkez kayması <= 25, yarıçap değişimi serbest; eğri: eski ölçüt (iki uç/merkez birlikte).
export function changeMeasure(a, b) {
  if (!a || !b || a.k !== b.k) return null;
  if (a.k === 'l') {
    const da = [a.b[0] - a.a[0], a.b[1] - a.a[1]], db = [b.b[0] - b.a[0], b.b[1] - b.a[1]]; const la = Math.hypot(...da), lb = Math.hypot(...db);
    if (!la || !lb || Math.abs(da[0] * db[1] - da[1] * db[0]) / (la * lb) > 0.05) return null;
    const u = [da[0] / la, da[1] / la], rel = (p) => [p[0] - a.a[0], p[1] - a.a[1]];
    const lat = Math.abs(rel([(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2]).reduce((q, v, i) => q + (i ? v * u[0] : -v * u[1]), 0));
    const t1 = rel(b.a)[0] * u[0] + rel(b.a)[1] * u[1], t2 = rel(b.b)[0] * u[0] + rel(b.b)[1] * u[1];
    const end = Math.min(G.dist(a.a, b.a), G.dist(a.b, b.b), G.dist(a.a, b.b), G.dist(a.b, b.a));
    const overlap = Math.min(la, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)) > 0;
    return { k: lat + end, sh: lat, ok: lat <= TOL_A && (overlap || end <= TOL_A) };
  }
  if (a.k === 'o' || a.k === 'a') { const c = G.dist(a.c, b.c); return { k: c, sh: c, ok: c <= TOL_A }; }
  const d = edgeDist(a, b); return isFinite(d) ? { k: d, sh: d, ok: d <= TOL_A } : null;
}
// Eşleştirme. cands: [{idx, pts}] (pts: eskiz yerel noktaları). Döner: {c: aday, d: kayma mm} ya da null (belirsiz/uzak → bağlama).
//  (i) imzaya <= 1 mm (iki uç/merkez+yarıçap birlikte) en yakın aday, ikincisi >= 1 mm uzak → kabul (indeksten bağımsız);
//  (ii) aynı indeksli kenar makul değişimse (changeMeasure.ok, yan kayma <= 25 mm) ve ondan >= 1 mm daha yakın BAŞKA aday yoksa → kabul (parametrik değişim; d = yan/merkez kayması);
//  (iii) aksi halde null. Aynı indeks yalnız "makul değişim" izni verir, daha yakın bir adayı asla ezmez.
// İmzasız (eski belge) bağda yalnız aynı indeks (d: 0).
export function matchEdgeD(meta, cands) {
  const sig = meta.sig;
  if (!sig) { const same = cands.find((c) => c.idx === meta.g); return same ? { c: same, d: 0 } : null; }
  const sigs = cands.map((c) => edgeSig(c.pts));
  const xs = cands.map((c, i) => ({ c, d: edgeDist(sig, sigs[i]) })).filter((x) => isFinite(x.d)).sort((p, q) => p.d - q.d);
  if (xs.length) { const second = xs.length > 1 ? xs[1].d : Infinity; if (xs[0].d <= TOL_B && second - xs[0].d >= CLEAR) return xs[0]; }
  const si = cands.findIndex((c) => c.idx === meta.g); if (si < 0) return null;
  const cm = changeMeasure(sig, sigs[si]); if (!cm || !cm.ok) return null;
  for (let i = 0; i < cands.length; i++) { if (i === si) continue; const o = changeMeasure(sig, sigs[i]); if (o && (o.k <= cm.k - CLEAR || (o.k < cm.k && o.k <= TOL_B))) return null; } // belirgin (>= 1 mm) daha yakın ya da imzaya <= 1 mm uyan (ama (i)'de ayırt edilemeyen) başka aday varsa → bağlama
  return { c: cands[si], d: cm.sh };
}
export function matchEdge(meta, cands) { const m = matchEdgeD(meta, cands); return m ? m.c : null; }

// Nesnenin geometri parmak izi (düzenleme algılamak için)
const fpOf = (sk, e) => { const a = []; for (const id of entPts(e)) { const p = sk.points[id]; a.push(p ? +p.x.toFixed(6) : null, p ? +p.y.toFixed(6) : null); } if (e.type === 'circle') a.push(+Number(e.r).toFixed(6)); if (e.rmin !== undefined) a.push(+Number(e.rmin).toFixed(6)); a.push(e.type); return a; };
const fpSame = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i] || (typeof v === 'number' && typeof b[i] === 'number' && Math.abs(v - b[i]) <= 2e-6));
const stampProj = (sk, e, base) => { e.proj = { ...base, e: e.id, fp: fpOf(sk, e) }; };
// Kullanıcı izdüşürülen nesneyi düzenlediyse (geometri değişti ya da kopya/ayna/parça olarak türedi) o nesnenin proj bağı düşer. Döner: bağı düşen nesne sayısı
export function dropEditedLinks(sk) {
  let n = 0;
  for (const e of sk.ents) {
    const p = e.proj; if (!p) continue;
    if ((p.e !== undefined && p.e !== e.id) || (p.fp && !fpSame(p.fp, fpOf(sk, e)))) { delete e.proj; n++; }
  }
  return n;
}
const remapPt = (e, from, to) => { for (const k of ['a', 'b', 'c', 'f', 'p']) if (e[k] === from) e[k] = to; if (e.pts) e.pts = e.pts.map((p) => (p === from ? to : p)); };

// Gövde kenarını eskize izdüşürür; her polyline'a `meta` ({b: gövde, g: kenar grubu, c: ağırlık merkezi}) verilmişse
// üretilen nesnelere `proj` yazılır (ilişkisel bağ; reprojectLinked ile güncellenir). proj: {b,g,c, sig: kaynak kenar imzası,
// e: nesne kimliği, fp: geometri parmak izi, pin: izdüşümden önce var olan sabit noktalarla paylaşılan uçlar (taşınmaz)}.
export function projectPolylines(sk, polylines, tol = 2e-3) {
  const tot = { lines: 0, circles: 0, splines: 0 };
  for (const pl of polylines) {
    const n0 = sk.ents.length; const ptsBefore = new Set(Object.keys(sk.points));
    const owned = new Set(); for (const e of sk.ents) if (e.proj) entPts(e).forEach((p) => owned.add(p));
    const r = projectCore(sk, [pl], tol);
    for (const k of Object.keys(tot)) tot[k] += (r.lines !== undefined ? r[k] : 0) || 0;
    if (pl.meta) for (const e of sk.ents.slice(n0)) {
      const pin = [...new Set(entPts(e))].filter((id) => ptsBefore.has(id) && !owned.has(id));
      stampProj(sk, e, { ...pl.meta, sig: edgeSig(pl.pts), pin });
    }
  }
  return ok({ ...tot, count: tot.lines + tot.circles + tot.splines });
}

// İlişkisel izdüşümleri yeniden okur. resolve(meta) → yerel nokta dizisi | null (kenar bulunamadı: grup `lost`) | undefined (bilinmiyor, ör. gövde gizli: dokunma).
// Yapı aynıysa nesneler yerinde taşınır (üzerlerindeki kısıt/ölçü korunur); değiştiyse (çizgi→yay vb.) yeniden kurulur.
// Sabit noktalar (orijin ve izdüşümden önce var olan sabit noktalar) ASLA taşınmaz: izdüşüm ucu onlarla paylaşılıyorsa o uç için paylaşım çözülür.
export function reprojectLinked(sk, resolve, tol = 2e-3) {
  const unlinked = dropEditedLinks(sk);
  const groups = new Map();
  for (const e of sk.ents) if (e.proj) { const k = e.proj.b + '|' + e.proj.g; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  let updated = 0, rebuilt = 0, lost = 0, lostEnts = 0, skipped = 0, flagged = 0, maxShift = 0;
  const res = new Map(); const frozen = new Set(); // kayıp/bilinmeyen grupların noktaları bu geçişte taşınmaz
  for (const [k, ents] of groups) {
    const pts = ents.length > 1 && ents.some((e) => !e.proj.fp) ? undefined : resolve(ents[0].proj); // parmak izsiz çok nesneli grup: kullanıcı kopyası/parçası olabilir → dokunma
    res.set(k, pts);
    if (!pts) for (const e of ents) entPts(e).forEach((p) => frozen.add(p));
  }
  const claimed = new Map();
  for (const [k, ents] of groups) {
    const meta = ents[0].proj; const pts = res.get(k);
    if (pts === undefined) { skipped++; continue; }
    if (pts === null) { lost++; lostEnts += ents.length; for (const e of ents) if (!e.proj.lost) { e.proj = { ...e.proj, lost: true }; flagged++; } continue; }
    if (pts.shift > maxShift) maxShift = pts.shift;
    const nm = { b: meta.b, g: pts.g !== undefined ? pts.g : meta.g, c: pts.c || meta.c, sig: edgeSig(pts) || meta.sig };
    const scratch = { points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [], seq: 0 };
    projectCore(scratch, [{ pts }], tol);
    const nw = scratch.ents;
    const same = nw.length === ents.length && nw.every((n, i) => n.type === ents[i].type && entPts(n).length === entPts(ents[i]).length);
    if (same) {
      let moved = false; const pin = new Set(); for (const e of ents) (e.proj.pin || []).forEach((p) => pin.add(p)); const unshared = new Map();
      const wasLost = ents.some((e) => e.proj.lost);
      ents.forEach((e, i) => {
        for (const [o, nid] of unshared) remapPt(e, o, nid);
        const n = nw[i], op = entPts(e), np = entPts(n);
        op.forEach((id, j) => {
          const a = sk.points[id], b = scratch.points[np[j]]; if (!a || !b || (Math.abs(a.x - b.x) <= 1e-9 && Math.abs(a.y - b.y) <= 1e-9)) return;
          const cl = claimed.get(id);
          if (id !== 'O' && !pin.has(id) && !frozen.has(id) && (!cl || (Math.abs(cl[0] - b.x) <= 1e-9 && Math.abs(cl[1] - b.y) <= 1e-9))) { a.x = b.x; a.y = b.y; claimed.set(id, [b.x, b.y]); }
          else { const nid = addPoint(sk, b.x, b.y, true); unshared.set(id, nid); claimed.set(nid, [b.x, b.y]); remapPt(e, id, nid); }
          moved = true;
        });
        if (e.type === 'circle' && Math.abs(e.r - n.r) > 1e-9) { e.r = n.r; moved = true; }
        if (e.proj.g !== nm.g) moved = true;
      });
      if (wasLost) { moved = true; flagged++; }
      for (const e of ents) { const keep = new Set(entPts(e)); const base = { ...nm, pin: [...pin].filter((p) => keep.has(p)) }; stampProj(sk, e, base); }
      if (moved) updated++;
    } else {
      deleteItems(sk, ents.map((e) => ({ kind: 'ent', id: e.id })));
      const map = {}; const pid = (id) => (map[id] || (map[id] = addPoint(sk, scratch.points[id].x, scratch.points[id].y, true)));
      for (const n of nw) {
        const e = clone(n); delete e.id;
        for (const kk of ['a', 'b', 'c', 'f', 'p']) if (e[kk]) e[kk] = pid(e[kk]);
        if (e.pts) e.pts = e.pts.map(pid);
        const id = addEnt(sk, e); stampProj(sk, sk.ents.find((x) => x.id === id), { ...nm, pin: [] });
      }
      rebuilt++;
    }
  }
  return { updated, rebuilt, lost, lostEnts, skipped, flagged, unlinked, maxShift, groups: groups.size };
}
// Bağı kaldır: nesneler sıradan geometri olur. Döner: bağı kalkan nesne sayısı
export function unlinkProjection(sk, ids) {
  let n = 0; for (const id of ids) { const e = getEnt(sk, id); if (e && e.proj) { delete e.proj; n++; } } return n;
}
// Yeniden bağla: seçili izdüşümlü nesnelerin grubu verilen kenara (meta + yerel noktalar) bağlanır ve ona göre güncellenir.
export function relinkProjection(sk, ids, meta, pts) {
  const ents = ids.map((i) => getEnt(sk, i)).filter((e) => e && e.proj); if (!ents.length) return fail('sk.proj_relink_none');
  const nk = meta.b + '|' + meta.g; const others = sk.ents.filter((e) => e.proj && !ents.includes(e) && e.proj.b + '|' + e.proj.g === nk);
  if (others.length) return fail('sk.proj_relink_taken');
  dropEditedLinks(sk);
  for (const e of ents) { if (!e.proj) continue; const { sig, ...rest } = e.proj; e.proj = { ...rest, b: meta.b, g: meta.g, c: meta.c, sig: edgeSig(pts) }; delete e.proj.lost; }
  const r = reprojectLinked(sk, (m) => (m.b === meta.b && m.g === meta.g ? pts : undefined));
  return ok(r);
}
// Referans (sürülen) ölçülerin ifadesini güncel geometriyle eşler. Döner: değişen ölçü sayısı
export function syncRefs(sk) {
  let n = 0;
  for (const c of sk.cons) {
    if (!c.ref || !DIM_TYPES.has(c.type)) continue;
    const m = measureDim(sk, c); if (!Number.isFinite(m)) continue;
    const v = String(+m.toFixed(6)); if (String(c.expr) !== v) { c.expr = v; n++; }
  }
  return n;
}

// ---------------------------------------------------------------- PANO (kes/kopyala/yapıştır)
export function copySelection(sk, ids) {
  const ents = ids.map((i) => getEnt(sk, i)).filter((e) => e && !(e.type === 'line' && false)); if (!ents.length) return null;
  const pts = ptsOf(sk, ents); const entIds = new Set(ents.map((e) => e.id));
  const cons = sk.cons.filter((c) => conRefs(c).every((r) => pts.has(r) || entIds.has(r)));
  const pp = {}; for (const id of pts) if (id !== 'O') pp[id] = { x: sk.points[id].x, y: sk.points[id].y };
  return { ents: clone(ents), points: pp, cons: clone(cons), usesO: pts.has('O') };
}
// yapıştır: yeni kimliklerle ekler; (dx,dy) kaydırma; kısıtlar (sabit olanlar hariç) taşınır
export function pasteClip(sk, clip, dx = 5, dy = 5) {
  if (!clip || !clip.ents.length) return fail('sk.op.clip_empty');
  const idmap = new Map(); idmap.set('O', 'O');
  for (const [id, p] of Object.entries(clip.points)) idmap.set(id, addPoint(sk, p.x + dx, p.y + dy));
  const newEnts = [];
  for (const e of clip.ents) {
    const n = clone(e); delete n.id; delete n.proj; // yapıştırılan nesne kaynak kenara bağlı değildir
    for (const k of ['a', 'b', 'c', 'p', 'f']) if (n[k] && idmap.has(n[k]) && e.type !== 'line' ? true : n[k] && idmap.has(n[k])) n[k] = idmap.get(n[k]);
    if (n.pts) n.pts = n.pts.map((i) => idmap.get(i) || i);
    const id = addEnt(sk, n); idmap.set(e.id, id); newEnts.push(id);
  }
  for (const c of clip.cons) { if (c.type === 'coincident' && (c.a === 'O' || c.b === 'O')) continue; const n = { type: c.type }; for (const k of ['a', 'b', 'c']) if (c[k]) n[k] = idmap.get(c[k]) || c[k]; if (c.expr !== undefined) n.expr = c.expr; if (c.ref) n.ref = true; addCon(sk, n.type, n.a, n.b, Object.fromEntries(Object.entries(n).filter(([k]) => !['type', 'a', 'b'].includes(k)))); }
  // O ile bağlantı kurmayan ölçüleri (hdist O → ...) korumaz
  cleanup(sk);
  return ok({ newEnts });
}

// ---------------------------------------------------------------- seçim yardımcıları
// kutu içi (contain=true: tamamen içinde; false: değen) varlık/nokta kimlikleri
export function boxSelect(sk, box, contain) {
  const [x0, y0, x1, y1] = box;
  const inB = (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  const ents = [], pts = [];
  const rect = [G.mkLine([x0, y0], [x1, y0]), G.mkLine([x1, y0], [x1, y1]), G.mkLine([x1, y1], [x0, y1]), G.mkLine([x0, y1], [x0, y0])];
  for (const e of sk.ents) {
    if (e.type === 'point') { const p = sk.points[e.p]; if (p && inB([p.x, p.y])) ents.push(e.id); continue; }
    const s = segOf(sk, e); if (!s) continue;
    const bb = G.bbox(s);
    if (contain) {
      const poly = G.sample(s, 0.05); if (poly.every(inB)) ents.push(e.id);
    } else {
      if (bb.x1 < x0 || bb.x0 > x1 || bb.y1 < y0 || bb.y0 > y1) continue;
      const poly = G.sample(s, 0.05); if (poly.some(inB) || rect.some((r) => G.intersect(s, r).pts.length)) ents.push(e.id);
    }
  }
  for (const [id, p] of Object.entries(sk.points)) if (inB([p.x, p.y]) && !ents.some((eid) => { const e = getEnt(sk, eid); return e && entPts(e).includes(id); })) pts.push(id);
  return { ents, pts };
}
