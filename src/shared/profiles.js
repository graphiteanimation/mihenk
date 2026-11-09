// Sketch'ten kapalı bölgeleri (profil) çıkarır. Yarım-kenar (half-edge) yüz dolaşımı.
// sketch: {points:{id:{x,y}}, ents:[{id,type:'line',a,b,cons}|{type:'arc',c,a,b}|{type:'circle',c,r}|{type:'point',p}]}
const TAU = Math.PI * 2;
const angNorm = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };

export function arcGeom(sk, e) {
  const c = sk.points[e.c], a = sk.points[e.a], b = sk.points[e.b];
  const r = Math.hypot(a.x - c.x, a.y - c.y);
  const a0 = Math.atan2(a.y - c.y, a.x - c.x);
  let a1 = Math.atan2(b.y - c.y, b.x - c.x);
  let sweep = angNorm(a1 - a0); if (sweep < 1e-9) sweep = TAU;
  return { c, r, a0, sweep };
}
function sampleArc(g, fromStart, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = fromStart ? i / n : 1 - i / n;
    const ang = g.a0 + g.sweep * t;
    pts.push([g.c.x + g.r * Math.cos(ang), g.c.y + g.r * Math.sin(ang)]);
  }
  return pts;
}
const arcSegs = (g) => Math.max(6, Math.ceil((g.sweep / TAU) * 64));

function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function interiorPoint(poly) {
  // çokgenin içinde garanti bir nokta: bir kenarın orta noktasından içeri küçük adım
  const A = polyArea(poly); const sgn = A >= 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy); if (l < 1e-9) continue;
    for (const eps of [1e-3, 1e-2, 1e-4]) {
      const p = [(a[0] + b[0]) / 2 - (dy / l) * eps * sgn * l, (a[1] + b[1]) / 2 + (dx / l) * eps * sgn * l];
      if (pointInPoly(p, poly)) return p;
    }
  }
  return poly[0];
}

// Döner: { regions:[{loop:[seg], poly:[[x,y]], holes:[{loop,poly}], area}], open:boolean }
// seg: {type:'line',p0,p1} | {type:'arc',p0,p1,mid,c,r,ccw} | {type:'circle',c,r}
export function findRegions(sk) {
  const P = sk.points; const ents = (sk.ents || []).filter((e) => !e.cons);
  // düğümleri konuma göre birleştir (aynı nokta kimliği veya çakışık koordinat)
  const key = (id) => { const p = P[id]; return Math.round(p.x * 1e5) + ':' + Math.round(p.y * 1e5); };
  const he = []; // half-edges
  const out = new Map();
  const addHE = (from, to, ent, fwd, ang) => { const h = { from, to, ent, fwd, ang, used: false }; he.push(h); if (!out.has(from)) out.set(from, []); out.get(from).push(h); return h; };
  const circles = [];
  for (const e of ents) {
    if (e.type === 'line') {
      const a = P[e.a], b = P[e.b]; if (!a || !b) continue;
      const ka = key(e.a), kb = key(e.b); if (ka === kb) continue;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const h1 = addHE(ka, kb, e, true, ang), h2 = addHE(kb, ka, e, false, angNorm(ang + Math.PI)); h1.twin = h2; h2.twin = h1;
    } else if (e.type === 'arc') {
      if (!P[e.a] || !P[e.b] || !P[e.c]) continue;
      const g = arcGeom(sk, e); const ka = key(e.a), kb = key(e.b);
      if (ka === kb) { circles.push({ c: [g.c.x, g.c.y], r: g.r }); continue; }
      // teğet yönleri: başlangıçta CCW teğet, bitişten geri dönerken CW teğet; eğrilik için küçük sapma eklenir
      const t0 = g.a0 + Math.PI / 2, t1 = g.a0 + g.sweep - Math.PI / 2;
      const h1 = addHE(ka, kb, e, true, angNorm(t0 + 1e-7)), h2 = addHE(kb, ka, e, false, angNorm(t1 - 1e-7)); h1.twin = h2; h2.twin = h1;
    } else if (e.type === 'circle') {
      const c = P[e.c]; if (!c || !(e.r > 0)) continue;
      circles.push({ c: [c.x, c.y], r: e.r });
    }
  }
  // sarkan kenarları (dangling) ayıkla
  let changed = true; const dead = new Set();
  while (changed) {
    changed = false;
    for (const [k, list] of out) {
      const live = list.filter((h) => !dead.has(h));
      if (live.length === 1) { dead.add(live[0]); dead.add(live[0].twin); changed = true; }
    }
  }
  const hadOpen = dead.size > 0;
  for (const [k, list] of out) { const l = list.filter((h) => !dead.has(h)); l.sort((a, b) => a.ang - b.ang); out.set(k, l); }
  const live = he.filter((h) => !dead.has(h));
  // yüz dolaşımı: bir yarım-kenardan sonra, varış düğümünde ikizinden saat yönünde bir sonraki kenar
  const loops = [];
  for (const h0 of live) {
    if (h0.used) continue;
    const loop = []; let h = h0; let guard = 0;
    while (!h.used && guard++ < 100000) {
      h.used = true; loop.push(h);
      const list = out.get(h.to); const idx = list.indexOf(h.twin);
      h = list[(idx - 1 + list.length) % list.length];
    }
    if (h === h0) loops.push(loop);
  }
  const mkLoop = (hes) => {
    const segs = [], poly = [];
    for (const h of hes) {
      const e = h.ent;
      if (e.type === 'line') {
        const a = P[h.fwd ? e.a : e.b], b = P[h.fwd ? e.b : e.a];
        segs.push({ type: 'line', p0: [a.x, a.y], p1: [b.x, b.y] }); poly.push([a.x, a.y]);
      } else {
        const g = arcGeom(sk, e); const pts = sampleArc(g, h.fwd, arcSegs(g));
        const midAng = g.a0 + g.sweep / 2;
        segs.push({ type: 'arc', p0: pts[0], p1: pts[pts.length - 1], mid: [g.c.x + g.r * Math.cos(midAng), g.c.y + g.r * Math.sin(midAng)], c: [g.c.x, g.c.y], r: g.r, ccw: h.fwd });
        for (let i = 0; i < pts.length - 1; i++) poly.push(pts[i]);
      }
    }
    return { loop: segs, poly, area: polyArea(poly) };
  };
  const circLoop = (c) => { const poly = []; for (let i = 0; i < 64; i++) { const a = (i / 64) * TAU; poly.push([c.c[0] + c.r * Math.cos(a), c.c[1] + c.r * Math.sin(a)]); } return { loop: [{ type: 'circle', c: c.c, r: c.r }], poly, area: Math.PI * c.r * c.r }; };
  // bileşenler: bağlı yarım-kenar kümeleri
  const comp = new Map(); let nc = 0;
  const find = (k) => { let r = k; while (comp.get(r) !== r) r = comp.get(r); return r; };
  for (const h of live) { if (!comp.has(h.from)) comp.set(h.from, h.from); if (!comp.has(h.to)) comp.set(h.to, h.to); }
  for (const h of live) { const a = find(h.from), b = find(h.to); if (a !== b) comp.set(a, b); }
  const regions = [], outers = [];
  for (const l of loops) {
    const L = mkLoop(l); L.comp = find(l[0].from);
    if (L.area > 1e-9) regions.push(L); else if (L.area < -1e-9) outers.push({ ...L, poly: L.poly.slice().reverse(), loop: reverseLoop(L.loop), area: -L.area });
  }
  circles.forEach((c, i) => { const L = circLoop(c); L.comp = 'c' + i; regions.push(L); outers.push({ ...L }); });
  regions.forEach((r) => (r.holes = []));
  // her bileşenin dış sınırı, onu içeren en küçük (başka bileşene ait) bölgeye delik olur
  for (const o of outers) {
    const pt = o.poly[0]; let best = null;
    for (const r of regions) {
      if (r.comp === o.comp) continue;
      if (r.area <= o.area) continue;
      if (pointInPoly(pt, r.poly) && (!best || r.area < best.area)) best = r;
    }
    if (best) best.holes.push({ loop: o.loop, poly: o.poly });
  }
  regions.forEach((r) => { delete r.comp; r.inside = interiorPointWithHoles(r); });
  return { regions, open: hadOpen };
}
function interiorPointWithHoles(r) {
  const A = r.poly;
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = A[(i + 1) % A.length]; const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy); if (l < 1e-9) continue;
    for (const eps of [1e-3, 1e-2, 0.05, 1e-4]) {
      const p = [(a[0] + b[0]) / 2 - dy * eps, (a[1] + b[1]) / 2 + dx * eps];
      if (pointInPoly(p, A) && !r.holes.some((h) => pointInPoly(p, h.poly))) return p;
    }
  }
  return interiorPoint(A);
}
function reverseLoop(segs) {
  return segs.slice().reverse().map((s) => (s.type === 'line' ? { type: 'line', p0: s.p1, p1: s.p0 } : s.type === 'arc' ? { ...s, p0: s.p1, p1: s.p0, ccw: !s.ccw } : s));
}
export function regionContains(r, pt) { return pointInPoly(pt, r.poly) && !r.holes.some((h) => pointInPoly(pt, h.poly)); }
