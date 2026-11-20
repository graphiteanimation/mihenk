// 2D cep: kontur-paralel ofset halkalari (her seviye ORIJINAL sinirdan d_k = d0 + k*stepover ile kesin ofset), adalar
// dahil; dar bogazda bolgeler ayrilir (agac). Kesim sirasi: icten disa (yapraktan koke). Giris: helis/rampa/dalma
// (sigmiyorsa hata; dalma yalniz merkezden kesen takim). Acik kenar: sanal sinir acik kenardan W = 2r + yanal pay disari
// alinir (takim acik kenarin r otesine kadar tasar); uzatma bandi modele (taban ustu kesit) degerse hata.
// Kapsama: halka araligi stepover < takim capi; yaprak cekirdegi gerekirse ek halka ile kapatilir; sonunda orneklemeyle
// islenmeyen alan olculur ve uyari verilir (keskin ic koseler dogal olarak kalir).
import { cerr } from '../geom/err.js';
import * as P from '../geom/path2d.js';
import * as G from '../../shared/geom2d.js';
import { need, opt, posNum, nonNeg, cutting, heights, depthLevels, Builder, finishToolpath, warn, loopFromKernel, r3, belowStockAllow, stockToLeave } from './common.js';
import { rampAlong } from './contour.js';

const MAX_RINGS = 5000;

// ------------------------------------------------------------------ bolge hazirligi
// cekirdek yuz dongulerinden cep bolgesi: dis = duvarlar (acik kenarlar sanal olarak disari), delikler = adalar
export function pocketRegion(face, r, stR) {
  if (!face || !Array.isArray(face.outer)) throw cerr('cam.geom.missing', { index: 0 });
  if (face.normalOk === false) throw cerr('cam.pocket.face_down');
  let outer = loopFromKernel(face.outer); if (P.area(outer) < 0) outer = P.reverseLoop(outer);
  const holes = [];
  for (const l of face.inners || []) {
    const lp = loopFromKernel(l); const nOpen = lp.filter((s) => s.open).length;
    if (nOpen === lp.length) continue;          // tabanda asagi inen delik: takim ustunden gecebilir
    if (nOpen) throw cerr('cam.pocket.mixed_inner');
    holes.push(P.area(lp) > 0 ? P.reverseLoop(lp) : lp);
  }
  const hasOpen = outer.some((s) => s.open);
  let virt = outer, W = 0;
  if (hasOpen) {
    W = 2 * r + stR; virt = virtualOuter(outer, W);
    checkExtension(outer, virt, face, holes);
  }
  return { region: { outer: virt, holes }, hasOpen, W, z: face.z };
}
// acik parcalari W kadar disari (saga) tasi, komsu tasiyicilarla kesistir
function virtualOuter(loop, W) {
  const n = loop.length; const off = loop.map((s) => (s.open ? P.offsetSeg(s, -W) : { ...s }));
  if (off.some((s) => !s)) throw cerr('cam.pocket.open_edge_unsupported');
  const toG = (s) => (s.k === 'L' ? G.mkLine(s.a, s.b) : G.mkCircle(s.c, s.r));
  for (let i = 0; i < n; i++) {
    const A = off[i], B = off[(i + 1) % n];
    if (!loop[i].open && !loop[(i + 1) % n].open) continue;
    if (P.dist(A.b, B.a) < 1e-9) continue;
    const V = loop[i].b; const xs = G.intersectInfinite(toG(A), toG(B)).filter((q) => G.dist(q, V) <= 4 * W + 1e-6).sort((p, q) => G.dist(p, V) - G.dist(q, V));
    if (!xs.length) throw cerr('cam.pocket.open_edge_unsupported');
    const x = xs[0];
    off[i] = retrim(A, null, x); off[(i + 1) % n] = retrim(B, x, null);
  }
  const out = off.filter((s) => P.length(s) > 1e-9);
  // basitlik: ardisik olmayan parcalar kesismemeli
  for (let i = 0; i < out.length; i++) for (let j = i + 2; j < out.length; j++) {
    if (i === 0 && j === out.length - 1) continue;
    if (P.intersect(out[i], out[j], 1e-9).length) throw cerr('cam.pocket.open_edge_unsupported');
  }
  if (!P.isClosedLoop(out, 1e-6) || !(P.area(out) > 0)) throw cerr('cam.pocket.open_edge_unsupported');
  return out;
}
function retrim(s, a, b) {
  const pa = a || s.a, pb = b || s.b;
  if (s.k === 'L') return P.line(pa, pb, s.open ? { open: true } : null);
  const a0 = Math.atan2(pa[1] - s.c[1], pa[0] - s.c[0]), a1 = Math.atan2(pb[1] - s.c[1], pb[0] - s.c[0]);
  let sw = a1 - a0; const sg = Math.sign(s.sw); while (sg > 0 ? sw <= 0 : sw >= 0) sw += sg * 2 * Math.PI; while (Math.abs(sw) > 2 * Math.PI) sw -= sg * 2 * Math.PI;
  if (Math.abs(sw) > Math.PI + 1e-9) throw cerr('cam.pocket.open_edge_unsupported');
  return P.arc(s.c, s.r, a0, sw, s.open ? { open: true } : null, pa, pb);
}
// uzatma bandi (sanal bolge - gercek bolge) taban ustundeki malzemeye degmemeli
function checkExtension(outer, virt, face, holes) {
  const above = face.above; if (!Array.isArray(above)) throw cerr('cam.pocket.open_needs_section');
  const mat = above.map((l) => loopFromKernel(l));
  const virtR = { outer: virt, holes: [] }, realR = { outer, holes: [] };
  for (const m of mat) {
    for (const s of m) for (const v of virt) for (const hh of P.intersect(s, v, 1e-7)) { if (P.distTo(hh.p, outer) > 1e-4) throw cerr('cam.pocket.open_edge_blocked', { x: r3(hh.p[0]), y: r3(hh.p[1]) }); }
    for (const s of m) for (let k = 0; k < 8; k++) { const p = P.pointAt(s, k / 8); if (P.inRegion(p, virtR) && !P.inRegion(p, realR) && P.distTo(p, outer) > 1e-4 && P.distTo(p, virt) > 1e-4) throw cerr('cam.pocket.open_edge_blocked', { x: r3(p[0]), y: r3(p[1]) }); }
  }
  void holes;
}

// ------------------------------------------------------------------ halka agaci
// level k bolgeleri; her bolgenin cocuklari (k+1'de icindekiler)
export function ringTree(R, d0, so) {
  const levels = [];
  for (let k = 0; k < MAX_RINGS; k++) {
    const regs = P.offsetRegions([R], d0 + k * so);
    if (!regs.length) break;
    levels.push(regs.map((g) => ({ ...g, d: d0 + k * so, k, children: [] })));
  }
  if (levels.length >= MAX_RINGS) throw cerr('cam.pocket.too_many_rings');
  for (let k = 1; k < levels.length; k++) for (const g of levels[k]) {
    const p = P.probePoint(g.outer); const par = levels[k - 1].find((q) => P.inRegion(p, q)) || null;
    if (!par) throw cerr('cam.geom.offset_failed', { reason: 'tree' });
    par.children.push(g);
  }
  return levels;
}
// bolgede sinirdan en uzak nokta (izgara + yerel iyilestirme). walls: uzaklik olculen parcalar
export function deepestPoint(reg, walls, h) {
  const bb = P.loopBBox([reg.outer]); let best = null;
  const nx = Math.min(400, Math.max(2, Math.ceil((bb[2] - bb[0]) / h))), ny = Math.min(400, Math.max(2, Math.ceil((bb[3] - bb[1]) / h)));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
    const p = [bb[0] + ((bb[2] - bb[0]) * i) / nx, bb[1] + ((bb[3] - bb[1]) * j) / ny];
    if (!P.inRegion(p, reg)) continue; const D = P.distTo(p, walls); if (!best || D > best.D) best = { p, D };
  }
  if (!best) { const p = P.probePoint(reg.outer); best = { p, D: P.distTo(p, walls) }; }
  let step = Math.max((bb[2] - bb[0]) / nx, (bb[3] - bb[1]) / ny) / 2;
  for (let it = 0; it < 60 && step > 1e-6; it++) {
    let moved = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const q = [best.p[0] + dx * step, best.p[1] + dy * step]; if (!P.inRegion(q, reg)) continue;
      const D = P.distTo(q, walls); if (D > best.D) { best = { p: q, D }; moved = true; }
    }
    if (!moved) step /= 2;
  }
  return best;
}

// ------------------------------------------------------------------ hesap
export function computePocket(op, ctx) {
  const { setup: S, tool, geom, machine } = ctx;
  const cut = cutting(op); const r = tool.dia / 2; const warnings = [];
  const so = need(op, 'stepover'); if (!(so < tool.dia)) throw cerr('cam.op.stepover_too_big', { stepover: so, dia: tool.dia });
  const sd = need(op, 'stepdown'); const fsd = opt(op, 'finishStepdown', posNum, 'number > 0', null);
  const { radial: stR, axial: stA } = stockToLeave(op);
  const dir = op.dir ?? 'climb'; if (!['climb', 'conv'].includes(dir)) throw cerr('cam.op.bad_field', { field: 'dir', expect: 'climb/conv', op: op.name || op.id });
  const entry = op.entry; if (!entry || typeof entry !== 'object') throw cerr('cam.op.missing', { field: 'entry', op: op.name || op.id });
  if (!['helix', 'ramp', 'plunge', 'predrill'].includes(entry.kind)) throw cerr('cam.op.bad_field', { field: 'entry.kind', expect: 'helix/ramp/plunge', op: op.name || op.id });
  if (entry.kind === 'predrill') throw cerr('cam.op.unsupported', { what: 'entry.predrill' });
  if (entry.kind === 'plunge' && !tool.centerCutting) throw cerr('cam.entry.plunge_not_center_cutting', { tool: tool.number });
  const ang = entry.kind === 'plunge' ? null : need(op, 'entry.angle', (v) => v > 0 && v <= 45, '0 < angle <= 45');
  const helixR = entry.kind === 'helix' ? need(op, 'entry.helixDia') / 2 : 0;
  const finish = op.finishPass === true; const fStock = finish ? need(op, 'finishStock') : 0;
  if (finish && !(fStock < so)) throw cerr('cam.pocket.finish_stock_big');
  const faces = geom?.faces || []; if (!faces.length || !Array.isArray(op.geom) || !op.geom.length) throw cerr('cam.op.missing', { field: 'geom', op: op.name || op.id });
  const zSel = faces[0].z;
  const h = heights({ ...op, heights: { top: { from: 'stockTop', off: 0 }, bottom: { from: 'selection', off: 0 }, ...op.heights } }, S, { bottom: zSel, top: zSel });
  const zBot = h.zBot + stA; if (!(h.zTop > zBot + 1e-9)) throw cerr('cam.pocket.nothing', { top: r3(h.zTop), bottom: r3(zBot) });
  const levels = depthLevels(h.zTop, zBot, sd, fsd);
  const passDepth = levels.reduce((m, z, i) => Math.max(m, (i ? levels[i - 1] : h.zTop) - z), 0);
  const b = new Builder({ zClr: h.zClr, zRet: h.zRet, feed: cut.feedCut, tool });
  const orient = (loop) => (dir === 'climb' ? loop : P.reverseLoop(loop));
  let restArea = 0, unreachable = false;

  for (const face of faces) {
    if (faces.length > 1 && Math.abs(face.z - zSel) > 1e-6) throw cerr('cam.pocket.faces_differ_z');
    const { region: Rg } = pocketRegion(face, r, stR);
    const walls = P.regionSegs(Rg);
    const d0 = r + stR + fStock;
    const tree = ringTree(Rg, d0, so);
    if (!tree.length) throw cerr('cam.pocket.tool_too_big', { dia: tool.dia });
    // yaprak cekirdekleri: sinirdan uzakligi son halkadan r'den fazla olan nokta kalmasin
    const hS = Math.max(Math.min(so, r) / 4, 1e-3);
    const fixLeaves = (node) => {
      if (node.children.length) { node.children.forEach(fixLeaves); return; }
      let cur = node;
      for (let guard = 0; guard < 20; guard++) {
        const dp = deepestPoint(cur, walls, hS); cur.deep = dp;
        if (dp.D - cur.d <= 0.9 * r) break;
        const dn = dp.D - 0.5 * r; const regs = P.offsetRegions([Rg], dn).filter((g) => P.inRegion(P.probePoint(g.outer), cur));
        if (!regs.length) break;
        const kids = regs.map((g) => ({ ...g, d: dn, k: cur.k + 1, children: [] })); cur.children.push(...kids);
        if (kids.length > 1) { kids.forEach(fixLeaves); break; }
        cur = kids[0];
      }
    };
    tree[0].forEach(fixLeaves);
    // giris uygunlugu (her yaprak)
    const leaves = []; const collect = (n) => (n.children.length ? n.children.forEach(collect) : leaves.push(n)); tree[0].forEach(collect);
    for (const lf of leaves) {
      if (!lf.deep) lf.deep = deepestPoint(lf, walls, hS);
      if (entry.kind === 'helix' && lf.deep.D < d0 + helixR - 1e-9) throw cerr('cam.pocket.helix_no_fit', { need: r3(2 * helixR), avail: r3(Math.max(0, 2 * (lf.deep.D - d0))) });
    }
    // islenmeyen alan (son derinlikte takim izi orneklemesi)
    const cover = coverage(Rg, walls, tree, leaves, r, stR, helixR, entry.kind);
    restArea += cover.uncut; if (cover.unreachable) unreachable = true;
    const allowed = tree[0]; // seviye 0 bolgeleri: takim merkezinin izinli alani (guvenli baglanti denetimi)
    const allowedLoops = allowed.flatMap((g) => [g.outer, ...g.holes]);

    for (let li = 0; li < levels.length; li++) {
      const z = levels[li], zPrev = li ? levels[li - 1] : h.zTop;
      const cutNode = (node) => {
        // once cocuklar (her alt agac kendi girisiyle), sonra bu bolgenin halkalari
        node.children.forEach(cutNode);
        const loops = [node.outer, ...node.holes].map(orient);
        const left = loops.slice();
        while (left.length) {
          const here = b.pos ? [b.pos[0], b.pos[1]] : null;
          let pick = 0, q = null;
          if (here) { let bd = Infinity; left.forEach((l, i) => { const c = P.closestOnLoops(here, [l]); if (c.d < bd) { bd = c.d; pick = i; q = c.p; } }); }
          const L = left.splice(pick, 1)[0];
          const inside = here && b.pos[2] <= z + 1e-9; // bu derinlikte takim asagida
          if (inside && segmentOk(here, q, node, allowedLoops)) { const Ls = P.startAt(L, q); b.feed(q[0], q[1], z, cut.feedCut, 'cut'); b.segs(Ls, z, cut.feedCut, 'cut'); continue; }
          // yeni giris
          if (!node.children.length && !inside) { enterLeaf(b, node, L, z, zPrev, li); continue; }
          const Ls = here ? P.startAt(L, q) : L;
          if (entry.kind === 'plunge') { b.linkTo(Ls[0].a[0], Ls[0].a[1], z, cut.feedPlunge, { clear: false }); b.segs(Ls, z, cut.feedCut, 'cut'); }
          else { b.linkTo(Ls[0].a[0], Ls[0].a[1], zPrev, cut.feedPlunge, { clear: li > 0 }); rampAlong(b, Ls, zPrev, z, ang, cut.feedRamp); }
        }
      };
      const enterLeaf = (bb, node, L, z, zPrev, li) => {
        const c = node.deep.p;
        if (entry.kind === 'helix') {
          const s0 = [c[0] + helixR, c[1]];
          bb.linkTo(s0[0], s0[1], zPrev, cut.feedPlunge, { clear: li > 0 });
          helix(bb, c, helixR, zPrev, z, ang, cut.feedRamp, dir);
          bb.feed(c[0], c[1], z, cut.feedCut, 'cut');
          const q = P.closestOnLoops(c, [L]).p; const Ls = P.startAt(L, q);
          bb.feed(q[0], q[1], z, cut.feedCut, 'cut'); bb.segs(Ls, z, cut.feedCut, 'cut');
        } else if (entry.kind === 'ramp') {
          bb.linkTo(L[0].a[0], L[0].a[1], zPrev, cut.feedPlunge, { clear: li > 0 });
          rampAlong(bb, L, zPrev, z, ang, cut.feedRamp);
        } else {
          bb.linkTo(L[0].a[0], L[0].a[1], z, cut.feedPlunge, { clear: false });
          bb.segs(L, z, cut.feedCut, 'cut');
        }
      };
      for (const root of tree[0]) { cutNode(root); b.up(); }
    }
    // bitirme pasosu: duvar halkasi (d = r + stR) her derinlikte; inis bosaltilmis kaba halkada
    if (finish) {
      const fin = P.offsetRegions([Rg], r + stR);
      for (let li = 0; li < levels.length; li++) {
        const z = levels[li];
        for (const g of fin) for (const L0 of [g.outer, ...g.holes].map(orient)) {
          const rough = tree[0].flatMap((q) => [q.outer, ...q.holes]);
          const near = P.closestOnLoops(P.probePoint(L0), rough); const q = P.closestOnLoops(near.p, [L0]).p;
          const Ls = P.startAt(L0, q);
          if (segmentOk(near.p, q, { outer: g.outer, holes: g.holes }, fin.flatMap((x) => [x.outer, ...x.holes]))) {
            b.linkTo(near.p[0], near.p[1], z, cut.feedPlunge, { clear: true });
            b.feed(q[0], q[1], z, cut.feedCut, 'cut'); b.segs(Ls, z, cut.feedCut, 'cut');
          } else { b.linkTo(Ls[0].a[0], Ls[0].a[1], li ? levels[li - 1] : h.zTop, cut.feedPlunge, { clear: true }); rampAlong(b, Ls, li ? levels[li - 1] : h.zTop, z, ang ?? 2, cut.feedRamp); }
          b.up();
        }
      }
    }
  }
  if (restArea > 1e-3) warnings.push(warn('cam.pocket.rest_material', { area: r3(restArea) }));
  if (unreachable) warnings.push(warn('cam.pocket.unreachable', {}));
  return finishToolpath(op, tool, cut, { ...h, zBot }, b, { warnings, passDepth, rapidFeed: machine?.feed?.rapid ?? undefined, meta: { restArea: r3(restArea), belowStock: belowStockAllow(op, S, zBot) } });
}

// iki nokta arasindaki dogru baglanti guvenli mi: izinli bolgenin sinirlarini kesmiyor ve orta nokta izinli bolgede
function segmentOk(a, q, node, allowedLoops) {
  if (P.dist(a, q) < 1e-9) return true;
  if (!P.segmentClear(a, q, allowedLoops)) return false;
  const m = [(a[0] + q[0]) / 2, (a[1] + q[1]) / 2];
  const reg = { outer: node.outer, holes: node.holes };
  return P.inRegion(m, reg) || P.distTo(m, [node.outer, ...node.holes].flat()) < 1e-6 || P.segmentClear(a, q, [node.outer, ...node.holes]);
}

// helis: merkez c, yaricap rh, z0 -> z1, aci (derece); sonra z1'de tam tur. Yaylar yarim tur (IR: tam daire yok).
export function helix(b, c, rh, z0, z1, angDeg, f, dir) {
  const pitch = 2 * Math.PI * rh * Math.tan((angDeg * Math.PI) / 180); // tur basina inis
  const ccw = dir !== 'conv' ? true : false; // cep icinde tirmanma: CCW
  const halfDz = pitch / 2; let z = z0; let a0 = 0; const sg = ccw ? 1 : -1;
  let guard = 0;
  while (z > z1 + 1e-9) {
    if (++guard > 100000) throw cerr('cam.entry.ramp_too_long');
    const zn = Math.max(z1, z - halfDz);
    const frac = (z - zn) / halfDz; const sw = sg * Math.PI * Math.min(1, frac);
    const s = P.arc(c, rh, a0, sw); b.seg(s, z, zn, f, 'ramp'); a0 += sw; z = zn;
  }
  for (let k = 0; k < 2; k++) { const s = P.arc(c, rh, a0, sg * Math.PI); b.seg(s, z1, z1, f, 'cut'); a0 += sg * Math.PI; }
}

// orneklemeyle islenmeyen alan: bolgede, yanal paydan derinde (D >= stR) olup hicbir halkaya (ve helis cemberine)
// r'den yakin olmayan noktalar. Donus {uncut (mm2), unreachable}
export function coverage(Rg, walls, tree, leaves, r, stR, helixR, kind) {
  const paths = []; const visit = (n) => { paths.push(n.outer, ...n.holes); n.children.forEach(visit); }; tree[0].forEach(visit);
  if (kind === 'helix') for (const lf of leaves) paths.push(P.circle(lf.deep.p, helixR));
  const segs = paths.flat(); const idx = new SegGrid(segs, r);
  const bb = P.loopBBox([Rg.outer]); const area = Math.abs(P.area(Rg.outer));
  const h = Math.max(Math.sqrt(area / 60000), r / 8, 1e-3);
  let un = 0, unR = false;
  for (let x = bb[0] + h / 2; x < bb[2]; x += h) for (let y = bb[1] + h / 2; y < bb[3]; y += h) {
    const p = [x, y]; if (!P.inRegion(p, Rg)) continue;
    const D = P.distTo(p, walls); if (D < stR + 1e-6) continue;
    if (idx.nearest(p, r + 1e-9) > r + 1e-9) { un += h * h; if (D > 2 * r) unR = true; }
  }
  return { uncut: un, unreachable: unR };
}
// parcalar icin duzgun izgara dizini: nearest(p, rmax) -> rmax icindeki en kisa uzaklik (yoksa Infinity)
export class SegGrid {
  constructor(segs, cell) {
    this.c = Math.max(cell, 1e-3); this.m = new Map(); this.segs = segs;
    segs.forEach((s, i) => { const b = P.bbox(s); for (let gx = Math.floor(b[0] / this.c); gx <= Math.floor(b[2] / this.c); gx++) for (let gy = Math.floor(b[1] / this.c); gy <= Math.floor(b[3] / this.c); gy++) { const k = gx + ',' + gy; if (!this.m.has(k)) this.m.set(k, []); this.m.get(k).push(i); } });
  }
  nearest(p, rmax) {
    let best = Infinity; const seen = new Set();
    const g0x = Math.floor((p[0] - rmax) / this.c), g1x = Math.floor((p[0] + rmax) / this.c), g0y = Math.floor((p[1] - rmax) / this.c), g1y = Math.floor((p[1] + rmax) / this.c);
    for (let gx = g0x; gx <= g1x; gx++) for (let gy = g0y; gy <= g1y; gy++) for (const i of this.m.get(gx + ',' + gy) || []) { if (seen.has(i)) continue; seen.add(i); const d = P.closest(this.segs[i], p).d; if (d < best) best = d; }
    return best;
  }
}
