// Budama (trim), uzatma (extend) ve bölme (break). Saf işlevler: sk'yi yerinde değiştirir; başarısızlıkta sk değişmez.
import { G, clone, entPts, conRefs, getEnt, segOf, newId, addPoint, addEnt, addCon, cleanup, findPointAt, usersOf, DIM_TYPES, TAU } from './core.js';
import { ellipseGeom } from '../../shared/profiles.js';

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (key, params) => ({ ok: false, err: { key, params } });
const COPY_CONS = new Set(['horizontal', 'vertical']); // iki parçaya kopyalanan kısıtlar (tek varlıklı)
const COPY_PAIR = new Set(['parallel', 'perpendicular']);
const UTOL = 1e-9;

// e varlığının diğer varlıklarla kesişim parametreleri [{u, p, others:[id]}], sıralı ve tekilleştirilmiş
function hitsOf(sk, e, seg) {
  const hits = [];
  for (const o of sk.ents) {
    if (o.id === e.id || o.type === 'point') continue;
    const so = segOf(sk, o); if (!so) continue;
    let r; try { r = G.intersect(seg, so); } catch (err) { continue; }
    for (const h of r.pts) hits.push({ u: h.ua, p: h.p, other: o.id });
    for (const ov of r.overlap) { hits.push({ u: ov.a0, p: G.ptAt(seg, ov.a0), other: o.id, ov: true }, { u: ov.a1, p: G.ptAt(seg, ov.a1), other: o.id, ov: true }); }
  }
  hits.sort((a, b) => a.u - b.u);
  const out = [];
  for (const h of hits) { const last = out[out.length - 1]; if (last && G.dist(last.p, h.p) < 1e-6) { last.others.push(h.other); } else out.push({ u: h.u, p: h.p, others: [h.other], ov: h.ov }); }
  return out;
}
// noktayı oluştur ya da mevcutla birleştir; kesiştiği öteki varlıklara pointOn ekler
function pointForHit(sk, h, selfPts) {
  const ex = findPointAt(sk, h.p, 1e-6);
  if (ex && !selfPts.has(ex)) return { id: ex, reused: true };
  const id = addPoint(sk, h.p[0], h.p[1]);
  for (const o of h.others) { const oe = getEnt(sk, o); if (!oe || oe.type === 'spline' || oe.type === 'ellarc') continue; addCon(sk, 'pointOn', id, o); }
  return { id, reused: false };
}

// ------------------------------------------------------------------ BUDAMA
// pt: tıklama noktası [x,y]. Döner {ok, removedCons, deleted}
export function trimAt(sk, entId, pt) {
  const e = getEnt(sk, entId); if (!e || e.type === 'point') return fail('sk.op.no_curve');
  const seg = segOf(sk, e); if (!seg) return fail('sk.op.no_curve');
  const c = G.curve(seg), U = c.U, closed = c.closed;
  const hits = hitsOf(sk, e, seg).filter((h) => closed || (h.u > UTOL && h.u < U - UTOL && G.dist(h.p, seg.p0) > 1e-6 && G.dist(h.p, seg.p1) > 1e-6));
  const uc = G.closestPoint(seg, pt).u;
  let bounds; // [ua, ub] silinecek aralık (kapalıda ub>ua olabilir, mod U)
  let lo = null, hi = null;
  for (const h of hits) { if (h.u <= uc) lo = h; if (h.u > uc && !hi) hi = h; }
  if (closed) {
    if (hits.length < 2) { return removeWhole(sk, e); }
    const idx = hits.findIndex((h) => h.u > uc); const hiH = idx < 0 ? hits[0] : hits[idx], loH = idx < 0 ? hits[hits.length - 1] : hits[(idx - 1 + hits.length) % hits.length];
    lo = loH; hi = hiH;
  } else if (!lo && !hi) return removeWhole(sk, e);
  const selfPts = new Set(entPts(e));
  const before = sk.cons.length;
  const t = e.type;
  // --- kapalı eğri: kalan tek yay
  if (closed) {
    const ia = pointForHit(sk, lo, selfPts), ib = pointForHit(sk, hi, selfPts); // silinen aralık lo..hi (ccw); kalan: hi → lo
    if (t === 'circle') { Object.assign(e, { type: 'arc', a: ib.id, b: ia.id }); delete e.r; }
    else if (t === 'ellipse') { Object.assign(e, { type: 'ellarc', a: ib.id, b: ia.id }); }
    else if (t === 'spline') {
      const pieces = G.splitAt(seg, [lo.u, hi.u]); // kapalı: [lo→hi], [hi→lo+U]
      const keep = pieces.find((p) => Math.abs(p.ua - hi.u) < 1e-9) || pieces[1];
      replaceSpline(sk, e, [{ seg: keep.seg, p0: ib.id, p1: ia.id }]);
    }
    return ok({ removedCons: cleanup(sk) + 0, changed: true });
  }
  const hasLeft = !!lo, hasRight = !!hi;
  const ia = hasLeft ? pointForHit(sk, lo, selfPts) : null, ib = hasRight ? pointForHit(sk, hi, selfPts) : null;
  let detached = 0;
  if (t === 'line') {
    detached = detachExtent(sk, e.id); const oldB = e.b;
    if (hasLeft && hasRight) { // e = sol parça, yeni çizgi = sağ parça
      const nid = addEnt(sk, { type: 'line', a: ib.id, b: oldB, ...(e.cons ? { cons: true } : {}) });
      e.b = ia.id; copyConsToNew(sk, e.id, nid);
    } else if (hasLeft) e.b = ia.id; else e.a = ib.id;
  } else if (t === 'arc') {
    const oldB = e.b;
    if (hasLeft && hasRight) { const nid = addEnt(sk, { type: 'arc', c: e.c, a: ib.id, b: oldB, ...(e.cons ? { cons: true } : {}) }); e.b = ia.id; addCon(sk, 'equal', e.id, nid); }
    else if (hasLeft) e.b = ia.id; else e.a = ib.id;
  } else if (t === 'ellarc') {
    if (hasLeft && hasRight) { const nid = addEnt(sk, { type: 'ellarc', c: e.c, f: e.f, rmin: e.rmin, a: ib.id, b: e.b, ...(e.cons ? { cons: true } : {}) }); e.b = ia.id; }
    else if (hasLeft) e.b = ia.id; else e.a = ib.id;
  } else if (t === 'spline') {
    const cuts = []; if (hasLeft) cuts.push(lo.u); if (hasRight) cuts.push(hi.u);
    const pieces = G.splitAt(seg, cuts); const out = [];
    if (hasLeft) out.push({ seg: pieces[0].seg, p0: null, p1: ia.id });
    if (hasRight) out.push({ seg: pieces[pieces.length - 1].seg, p0: ib.id, p1: null });
    replaceSpline(sk, e, out);
  } else return fail('sk.op.no_curve');
  const removed = cleanup(sk) + detached;
  return ok({ removedCons: removed, changed: true });
}
function removeWhole(sk, e) {
  const before = sk.cons.length;
  sk.ents = sk.ents.filter((x) => x.id !== e.id);
  cleanup(sk);
  return ok({ deleted: true, removedCons: Math.max(0, before - sk.cons.length), changed: true });
}
// C-21: çizginin BOYUNA bağlı kısıtlar (orta nokta, eşit uzunluk) budama/bölmede kısalan parçaya kalırsa çözücü
// başka geometriyi yeni boya/orta noktaya taşır (ör. kenarın orta noktasına yakalanmış daire merkezi kayar).
// Budama yalnız siler: orta nokta → "çizgi üstünde" (taşıyıcı aynı, nokta yerinde kalır), çizgi–çizgi eşitliği kaldırılır.
// Döner: kaldırılan/zayıflatılan kısıt sayısı.
function detachExtent(sk, lineId) {
  let n = 0;
  sk.cons = sk.cons.filter((c) => {
    if (c.type === 'midpoint' && c.b === lineId) { c.type = 'pointOn'; n++; return true; }
    if (c.type === 'equal' && (c.a === lineId || c.b === lineId)) { const o = getEnt(sk, c.a === lineId ? c.b : c.a); if (!o || o.type === 'line') { n++; return false; } }
    return true;
  });
  return n;
}
// C-21: kayma ölçümü. geomSnap: noktaların konumu + daire/yay yarıçapları; geomDrift: aynı kimlikler için en büyük yer değiştirme (mm).
export function geomSnap(sk) {
  const pts = {}, rad = {};
  for (const [id, p] of Object.entries(sk.points)) pts[id] = [p.x, p.y];
  for (const e of sk.ents) { const r = radOf(sk, e); if (r != null) rad[e.id] = r; }
  return { pts, rad };
}
export function geomDrift(snap, sk) {
  let d = 0;
  for (const [id, q] of Object.entries(snap.pts)) { const p = sk.points[id]; if (p) d = Math.max(d, Math.hypot(p.x - q[0], p.y - q[1])); }
  for (const [id, r0] of Object.entries(snap.rad)) { const e = getEnt(sk, id); const r = e && radOf(sk, e); if (r != null) d = Math.max(d, Math.abs(r - r0)); }
  return d;
}
function radOf(sk, e) {
  if (e.type === 'circle') return e.r;
  if (e.type === 'arc') { const c = sk.points[e.c], a = sk.points[e.a]; return c && a ? Math.hypot(a.x - c.x, a.y - c.y) : null; }
  return null;
}
function copyConsToNew(sk, oldId, newEntId) {
  const add = [];
  for (const c of sk.cons) {
    if (!conRefs(c).includes(oldId) || DIM_TYPES.has(c.type)) continue;
    if (COPY_CONS.has(c.type) && c.a === oldId) add.push({ type: c.type, a: newEntId });
    else if (COPY_PAIR.has(c.type)) add.push({ type: c.type, a: c.a === oldId ? newEntId : c.a, b: c.b === oldId ? newEntId : c.b });
    else if (c.type === 'collinear') add.push({ type: c.type, a: c.a === oldId ? newEntId : c.a, b: c.b === oldId ? newEntId : c.b });
  }
  for (const x of add) addCon(sk, x.type, x.a, x.b);
}
// spline'ı verilen parçalarla değiştirir: parça {seg, p0, p1}: uç noktaları kimlikleri (null → yeni nokta)
function replaceSpline(sk, e, pieces) {
  const oldPts = e.pts.slice(); const cons = !!e.cons; sk.ents = sk.ents.filter((x) => x.id !== e.id);
  let first = true; // ilk (başlangıca yakın) parça özgün kimliği korur; diğerleri yeni kimlik alır
  for (const pc of pieces) {
    const pts = pc.seg.pts; const ids = pts.map((p, i) => { if (i === 0 && pc.p0) return pc.p0; if (i === pts.length - 1 && pc.p1) return pc.p1; return addPoint(sk, p[0], p[1]); });
    const ent = { type: 'spline', pts: ids, ...(cons ? { cons: true } : {}) };
    if (first) { sk.ents.push({ id: e.id, ...ent }); first = false; } else addEnt(sk, ent);
  }
}

// ------------------------------------------------------------------ UZATMA
export function extendAt(sk, entId, pt) {
  const e = getEnt(sk, entId); if (!e || (e.type !== 'line' && e.type !== 'arc')) return fail('sk.op.extend_type');
  const seg = segOf(sk, e); const U = G.endU(seg);
  const uc = G.closestPoint(seg, pt).u; const atEnd = uc >= U / 2;
  const endId = atEnd ? e.b : e.a;
  // taşıyıcı üzerinde ileri doğru en yakın kesişim
  let best = null;
  for (const o of sk.ents) {
    if (o.id === e.id || o.type === 'point') continue;
    const so = segOf(sk, o); if (!so) continue;
    let ps = [];
    if (e.type === 'line') {
      const d = [seg.p1[0] - seg.p0[0], seg.p1[1] - seg.p0[1]], L = Math.hypot(d[0], d[1]) || 1, ex = 1e5;
      const big = G.mkLine([seg.p0[0] - (d[0] / L) * ex, seg.p0[1] - (d[1] / L) * ex], [seg.p1[0] + (d[0] / L) * ex, seg.p1[1] + (d[1] / L) * ex]);
      for (const h of G.intersect(big, so).pts) { const t = ((h.p[0] - seg.p0[0]) * d[0] + (h.p[1] - seg.p0[1]) * d[1]) / (L * L); const ahead = atEnd ? t - 1 : -t; if (ahead > 1e-7) ps.push({ p: h.p, dist: ahead * L, o }); }
    } else {
      const circ = G.mkCircle(seg.c, seg.r);
      for (const h of G.intersect(circ, so).pts) {
        const ang = h.ua; // dairede açı
        const ahead = atEnd ? G.wrap(ang - (seg.a0 + seg.sweep)) : G.wrap(seg.a0 - ang);
        if (ahead > 1e-7 && ahead < TAU - 1e-7) ps.push({ p: h.p, dist: ahead * seg.r, o });
      }
    }
    for (const q of ps) if (!best || q.dist < best.dist) best = q;
  }
  if (!best) return fail('sk.op.extend_none');
  if (usersOf(sk, endId).length > 1) return fail('sk.op.extend_shared');
  const before = sk.cons.length;
  const hitPt = findPointAt(sk, best.p, 1e-6, endId);
  // uç noktasındaki ölçüler geçersizleşir: sil
  sk.cons = sk.cons.filter((c) => !(DIM_TYPES.has(c.type) && conRefs(c).includes(endId)));
  if (hitPt && usersOf(sk, hitPt).length) { if (atEnd) e.b = hitPt; else e.a = hitPt; sk.cons = sk.cons.filter((c) => !conRefs(c).includes(endId)); delete sk.points[endId]; }
  else {
    sk.points[endId].x = best.p[0]; sk.points[endId].y = best.p[1];
    if (best.o.type !== 'spline' && best.o.type !== 'ellarc') addCon(sk, 'pointOn', endId, best.o.id);
  }
  return ok({ removedCons: Math.max(0, before - sk.cons.length), changed: true });
}

// ------------------------------------------------------------------ BÖLME
export function breakAt(sk, entId, pt) {
  const e = getEnt(sk, entId); if (!e || e.type === 'point') return fail('sk.op.no_curve');
  const seg = segOf(sk, e); const c = G.curve(seg), U = c.U, closed = c.closed;
  const hits = hitsOf(sk, e, seg).filter((h) => closed || (h.u > UTOL && h.u < U - UTOL && G.dist(h.p, seg.p0) > 1e-6 && G.dist(h.p, seg.p1) > 1e-6));
  const uc = G.closestPoint(seg, pt).u;
  let cuts = [];
  if (closed) {
    if (hits.length < 2) return fail('sk.op.break_closed');
    const idx = hits.findIndex((h) => h.u > uc); cuts = [hits[idx < 0 ? hits.length - 1 : (idx - 1 + hits.length) % hits.length], hits[idx < 0 ? 0 : idx]];
  } else {
    let lo = null, hi = null; for (const h of hits) { if (h.u <= uc) lo = h; if (h.u > uc && !hi) hi = h; }
    if (lo) cuts.push(lo); if (hi) cuts.push(hi);
    if (!cuts.length) { // kesişim yok: tıklama noktasından böl
      const cp = G.closestPoint(seg, pt); if (cp.u < 1e-6 || cp.u > U - 1e-6) return fail('sk.op.break_end'); cuts = [{ u: cp.u, p: cp.p, others: [] }];
    }
  }
  const selfPts = new Set(entPts(e));
  const pts = cuts.map((h) => pointForHit(sk, h, selfPts).id);
  const t = e.type;
  let detached = 0;
  if (t === 'line') {
    detached = detachExtent(sk, e.id);
    const oldB = e.b; const ids = [...pts, oldB]; e.b = pts[0];
    const made = [];
    for (let i = 0; i < pts.length; i++) { const nid = addEnt(sk, { type: 'line', a: pts[i], b: ids[i + 1], ...(e.cons ? { cons: true } : {}) }); copyConsToNew(sk, e.id, nid); made.push(nid); }
    for (const nid of made) addCon(sk, 'collinear', e.id, nid);
  } else if (t === 'arc') {
    const oldB = e.b; const ids = [...pts, oldB]; e.b = pts[0];
    for (let i = 0; i < pts.length; i++) { const nid = addEnt(sk, { type: 'arc', c: e.c, a: pts[i], b: ids[i + 1], ...(e.cons ? { cons: true } : {}) }); addCon(sk, 'equal', e.id, nid); }
  } else if (t === 'circle') { // iki yay
    const r0 = e.r; Object.assign(e, { type: 'arc', a: pts[1], b: pts[0] }); delete e.r;
    addEnt(sk, { type: 'arc', c: e.c, a: pts[0], b: pts[1], ...(e.cons ? { cons: true } : {}) }); addCon(sk, 'equal', e.id, sk.ents[sk.ents.length - 1].id);
  } else if (t === 'ellipse') {
    Object.assign(e, { type: 'ellarc', a: pts[1], b: pts[0] }); addEnt(sk, { type: 'ellarc', c: e.c, f: e.f, rmin: e.rmin, a: pts[0], b: pts[1], ...(e.cons ? { cons: true } : {}) });
  } else if (t === 'ellarc') {
    const oldB = e.b; const ids = [...pts, oldB]; e.b = pts[0];
    for (let i = 0; i < pts.length; i++) addEnt(sk, { type: 'ellarc', c: e.c, f: e.f, rmin: e.rmin, a: pts[i], b: ids[i + 1], ...(e.cons ? { cons: true } : {}) });
  } else if (t === 'spline') {
    const cu = cuts.map((h) => h.u); const pieces = G.splitAt(seg, cu);
    const out = pieces.map((pc, i) => ({ seg: pc.seg, p0: i === 0 ? null : pts[i - 1], p1: i === pieces.length - 1 ? null : pts[i] }));
    replaceSpline(sk, e, out);
  }
  return ok({ removedCons: cleanup(sk) + detached, changed: true });
}

// ------------------------------------------------------------------ BUDAMA ÖNİZLEMESİ
// Tıklanırsa silinecek aralığın çokgeni (kırmızı ön izleme). Döner {pts:[[x,y]...], whole:boolean} ya da null.
export function trimSpan(sk, entId, pt) {
  const e = getEnt(sk, entId); if (!e || e.type === 'point') return null;
  const seg = segOf(sk, e); if (!seg) return null;
  const c = G.curve(seg), U = c.U, closed = c.closed;
  const hits = hitsOf(sk, e, seg).filter((h) => closed || (h.u > UTOL && h.u < U - UTOL && G.dist(h.p, seg.p0) > 1e-6 && G.dist(h.p, seg.p1) > 1e-6));
  const uc = G.closestPoint(seg, pt).u;
  const path = (u0, u1) => { // u0'dan u1'e (kapalıda mod U ile ileri) örnekler
    let span = u1 - u0; if (closed && span <= 0) span += U; const n = Math.max(2, Math.min(400, Math.ceil(span / U * 96) + 2)); const out = [];
    for (let i = 0; i <= n; i++) out.push(c.pt(closed ? ((u0 + (span * i) / n) % U + U) % U : u0 + (span * i) / n));
    return out;
  };
  const sampleLine = (u0, u1) => (seg.type === 'line' ? [c.pt(u0), c.pt(u1)] : path(u0, u1));
  let lo = null, hi = null;
  for (const h of hits) { if (h.u <= uc) lo = h; if (h.u > uc && !hi) hi = h; }
  if (closed) {
    if (hits.length < 2) return { pts: G.sample(seg, 0.05), whole: true };
    const idx = hits.findIndex((h) => h.u > uc); const hiH = idx < 0 ? hits[0] : hits[idx], loH = idx < 0 ? hits[hits.length - 1] : hits[(idx - 1 + hits.length) % hits.length];
    return { pts: path(loH.u, hiH.u), whole: false };
  }
  if (!lo && !hi) return { pts: G.sample(seg, 0.05), whole: true };
  return { pts: sampleLine(lo ? lo.u : 0, hi ? hi.u : U), whole: false };
}
