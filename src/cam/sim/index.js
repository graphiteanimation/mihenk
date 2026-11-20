// Stok simulasyonu: yukseklik haritasi (tek degerli dexel) + takim sweep. Saf JS (three.js yok).
// API: simulate(input, opts) -> sonuc;  createSim(input, opts) -> adim adim oynatici ({step(n), run(), state(), heightmap(), reset()}).
// Denetimler: hizlinin stok icine girmesi, oyma (gouge), takim boyu asimi (flute), saft/tutucu carpmasi, stok tabaninin altina inis.
// SINIRLAR: yalniz ustten (takim ekseni +Z) kesilen tek degerli stok; alt kesme (undercut) ve ters yuz modellenmez; tutucu/saft
// yalniz silindir olarak modellenir; kesit disi fikstur yok. Ayrintilar docs/POST.md.
import { KErr } from '../../shared/errors.js';
import { validateProgram, validateToolpath, splitRapid, sampleArc } from '../ir.js';
import { createHeightmap, cloneHeightmap } from './heightmap.js';
import { toolGeom } from './tool.js';
export { createHeightmap, cloneHeightmap, heightmapFromFn, sampleHeightmap, volumeBetween, heightmapStats } from './heightmap.js';
export { toolGeom } from './tool.js';

const err = (code, params = {}) => new KErr(code, params);
// below_stock: islemin bildirdigi bilincli pay (toolpath.meta.belowStock, mm; boydan boya delik/kontur) icindeyse 'warn', disindaysa 'error' (V-12)
const LEVEL = { comp_arc_collapse: 'error', rapid_in_stock: 'error', gouge: 'error', flute_exceeded: 'error', shaft_collision: 'error', holder_collision: 'error', below_stock: 'error' };
const CODE = (k) => 'cam.sim.' + k;

export function createSim(input, opts = {}) {
  if (!(opts.res > 0)) throw err('cam.sim.bad_res', { res: opts.res });
  const isProg = Array.isArray(input?.sections);
  if (isProg) validateProgram(input); else validateToolpath(input);
  const sections = isProg ? input.sections : [{ setup: { id: 'default', workOffset: null, aAngle: null }, toolpath: input }];
  const res = opts.res, step = opts.step > 0 ? opts.step : res;
  const tol = opts.contactTol ?? 0.001, gtolBase = opts.gougeTol ?? 0.01, belowTol = opts.belowTol ?? 0.01;
  const capPerCode = opts.maxIssuesPerCode ?? 20, rapidSplit = opts.rapidSplit !== false;
  const steps = []; sections.forEach((s, si) => s.toolpath.moves.forEach((m, k) => steps.push([si, k])));

  let setups, cur, idx, issues, suppressed, removedTotal, frames, samples, counts;
  const reset = () => { setups = new Map(); cur = null; idx = 0; issues = []; suppressed = 0; removedTotal = 0; frames = []; samples = 0; counts = {}; };
  reset();

  function setupFor(id) {
    if (setups.has(id)) return setups.get(id);
    const box = opts.stockBoxes?.[id] ?? opts.stockBox;
    if (!box || !box.min || !box.max) throw err('cam.sim.no_stock', { setup: id });
    let hm;
    const init = opts.initialHeightmaps?.[id] ?? (opts.stockHeightmap?.data ? opts.stockHeightmap : null);
    if (init) hm = cloneHeightmap(init);
    else hm = createHeightmap([box.min[0], box.min[1]], [box.max[0], box.max[1]], res, box.max[2]);
    let hmax = -Infinity; for (let k = 0; k < hm.data.length; k++) if (hm.data[k] > hmax) hmax = hm.data[k];
    const mh = opts.modelHeightmaps?.[id] ?? (opts.modelHeightmap?.data ? opts.modelHeightmap : null);
    const s = { id, hm, hmax, zFloor: box.min[2], mh, removed: 0 };
    setups.set(id, s); return s;
  }

  function enterSection(si) {
    const sec = sections[si], tp = sec.toolpath;
    const id = sec.setup?.id ?? 'default';
    const tool = { ...tp.tool, ...(opts.tools?.[tp.tool.number] || {}), ...(opts.tool || {}) };
    const allow = Number.isFinite(tp.meta?.belowStock) && tp.meta.belowStock > 0 ? tp.meta.belowStock : 0;
    cur = { si, tp, allow, setup: setupFor(id), geom: toolGeom(tool), pos: null, prog: null, acc: null, move: 0, compOn: false, compPend: null };
  }

  function note(code, depth, px, py, pz) {
    const a = cur.acc[code] || (cur.acc[code] = { n: 0, depth: -Infinity, x: 0, y: 0, z: 0 });
    a.n++; if (depth > a.depth) { a.depth = depth; a.x = px; a.y = py; a.z = pz; }
  }

  // mode 0: hizli (yalniz denetle), 1: kesme (stoku kaldir)
  function touch(px, py, pz, mode) {
    samples++;
    const g = cur.geom, S = cur.setup, hm = S.hm, d = hm.data, nx = hm.nx, ny = hm.ny, R = g.R, shaftR = g.shaftR, holderR = g.holderR;
    if (pz < S.zFloor - belowTol) note('below_stock', S.zFloor - pz, px, py, pz);
    if (pz + tol >= S.hmax) return;
    const Rmax = Math.max(R, shaftR, holderR), Rmax2 = Rmax * Rmax, rs = hm.res;
    const i0 = Math.max(0, Math.floor((px - Rmax - hm.x0) / rs)), i1 = Math.min(nx - 1, Math.floor((px + Rmax - hm.x0) / rs));
    const j0 = Math.max(0, Math.floor((py - Rmax - hm.y0) / rs)), j1 = Math.min(ny - 1, Math.floor((py + Rmax - hm.y0) / rs));
    const zFlute = pz + g.fluteLen + tol, zBody = pz + g.bodyLen + tol, mh = S.mh, gtol = gtolBase + (mh?.err ?? 0);
    for (let j = j0; j <= j1; j++) {
      const cy = hm.y0 + (j + 0.5) * rs, dy = cy - py;
      for (let i = i0; i <= i1; i++) {
        const idx2 = j * nx + i, h = d[idx2];
        if (h <= pz + tol) continue;
        if (h <= S.zFloor + 1e-9) continue; // V-13: tabana kadar kesilmis hucre BOS (hizli/carpma sayilmaz)
        const cx = hm.x0 + (i + 0.5) * rs, dx = cx - px, r2 = dx * dx + dy * dy;
        if (r2 > Rmax2) continue;
        const r = Math.sqrt(r2);
        if (r <= holderR && h > zBody) { note('holder_collision', h - zBody + tol, px, py, pz); continue; }
        if (r <= shaftR && h > zFlute) {
          if (r <= R) note('flute_exceeded', h - zFlute + tol, px, py, pz); else { note('shaft_collision', h - zFlute + tol, px, py, pz); continue; }
        }
        if (r > R || (mode === 1 && r > g.cutR)) continue; // T-22: kilavuz kesmesi dis dibi capina kadar (dis bolgesi kasitli)
        const zb = pz + g.profile(r);
        if (mode === 0) { if (h > zb + tol) note('rapid_in_stock', h - zb, px, py, pz); continue; }
        if (h > zb) {
          if (mh) { const m = mhAt(mh, cx, cy); if (m === m && zb < m - gtol) note('gouge', m - zb, px, py, pz); }
          const nz = zb < S.zFloor ? S.zFloor : zb;
          if (nz < h) { const dv = (h - nz) * rs * rs; S.removed += dv; removedTotal += dv; d[idx2] = nz; }
        }
      }
    }
  }
  function mhAt(mh, x, y) {
    const i = Math.floor((x - mh.x0) / mh.res), j = Math.floor((y - mh.y0) / mh.res);
    if (i < 0 || j < 0 || i >= mh.nx || j >= mh.ny) return NaN;
    return mh.data[j * mh.nx + i];
  }
  function sweep(a, b, mode) {
    if (!a) { touch(b.x, b.y, b.z, mode); return; }
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) { const t = k / n; touch(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, mode); }
  }
  function rapidTo(to) {
    const parts = rapidSplit ? splitRapid(cur.pos, to) : [to];
    for (const p of parts) { sweep(cur.pos, p, 0); cur.pos = { x: p.x, y: p.y, z: p.z }; }
  }

  // Wear telafisi (G41/G42): programlanan yol = parca konturu; kontrol takimi yaricap kadar ofsetler.
  // Dogru parca: dogrusal bolum -> normal yonunde R; yay -> yaricap r -/+ R (merkez ayni). Kose gecisleri (teget olmayan) duz sweep ile baglanir.
  // Sinir: telafi yaricapi = takim yaricapi (aşinma farki 0); teget olmayan kose yuvarlama/kesisim modellenmez.
  function offsetFor(p0, m) {
    const g = cur.geom, side = cur.tp.compSide === 'left' ? 1 : -1;
    if (m.t === 'feed') {
      const dx = m.x - p0.x, dy = m.y - p0.y, L = Math.hypot(dx, dy);
      if (L < 1e-9) return { s: { x: p0.x, y: p0.y }, e: { x: m.x, y: m.y } };
      const nx = -dy / L * side * g.R, ny = dx / L * side * g.R;
      return { s: { x: p0.x + nx, y: p0.y + ny }, e: { x: m.x + nx, y: m.y + ny } };
    }
    return null;
  }
  function arcComp(p0, m) {
    const g = cur.geom, side = cur.tp.compSide === 'left' ? 1 : -1;
    const cx = p0.x + m.i, cy = p0.y + m.j, r = Math.hypot(m.i, m.j);
    const rt = m.dir === 'cw' ? r + side * g.R : r - side * g.R;
    if (!(rt > 1e-6)) return null;
    const k = rt / r;
    const s = { x: cx + (p0.x - cx) * k, y: cy + (p0.y - cy) * k }, e = { x: cx + (m.x - cx) * k, y: cy + (m.y - cy) * k };
    return { s, e, m: { ...m, x: e.x, y: e.y, i: cx - s.x, j: cy - s.y } };
  }
  function toolArc(startPos, m) {
    for (const p of sampleArc(startPos, m, 0.002)) { const q = { x: p[0], y: p[1], z: p[2] }; sweep(cur.pos, q, 1); cur.pos = q; }
  }

  function doMove(m) {
    if (m.t === 'comp') { cur.compPend = m.on; return; }
    if (m.t === 'rapid') { rapidTo(m); cur.prog = { x: m.x, y: m.y, z: m.z }; }
    else if (m.t === 'feed') {
      const wantOn = cur.compPend; cur.compPend = null;
      if (cur.compOn || wantOn) {
        const o = offsetFor(cur.prog, m);
        let to;
        if (wantOn === false) to = { x: m.x, y: m.y, z: m.z };              // G40: son blokta ofset kalkar
        else to = { x: o.e.x, y: o.e.y, z: m.z };
        if (cur.compOn && wantOn !== false) { sweep(cur.pos, { x: o.s.x, y: o.s.y, z: cur.pos.z }, 1); cur.pos = { x: o.s.x, y: o.s.y, z: cur.pos.z }; }
        sweep(cur.pos, to, 1); cur.pos = to;
        if (wantOn === true) cur.compOn = true; else if (wantOn === false) cur.compOn = false;
      } else { sweep(cur.pos, m, 1); cur.pos = { x: m.x, y: m.y, z: m.z }; }
      cur.prog = { x: m.x, y: m.y, z: m.z };
    } else if (m.t === 'arc') {
      if (cur.compOn) {
        const c = arcComp(cur.prog, m);
        if (!c) { note('comp_arc_collapse', 0, m.x, m.y, m.z); cur.prog = { x: m.x, y: m.y, z: m.z }; return; }
        const s0 = { x: c.s.x, y: c.s.y, z: cur.pos.z };
        sweep(cur.pos, s0, 1); cur.pos = s0;
        toolArc(s0, c.m);
      } else toolArc(cur.pos, m);
      cur.prog = { x: m.x, y: m.y, z: m.z };
    } else if (m.t === 'cycle') {
      m.points.forEach((p, n) => {
        const last = n === m.points.length - 1;
        if (cur.pos.x !== p[0] || cur.pos.y !== p[1]) rapidTo({ x: p[0], y: p[1], z: cur.pos.z });
        if (cur.pos.z !== m.retract) rapidTo({ x: p[0], y: p[1], z: m.retract });
        const b = { x: p[0], y: p[1], z: m.bottom }; sweep(cur.pos, b, 1); cur.pos = b;
        // kilavuz dipten ILERLEMEYLE (ters donusle) cikar: hizli degil kesme gibi denetlenir (dis bolgesi hizli sayilmaz)
        if (m.cycle === 'tap') { const up = { x: p[0], y: p[1], z: m.retract }; sweep(cur.pos, up, 1); cur.pos = up; }
        rapidTo({ x: p[0], y: p[1], z: last || m.retract === m.clearance ? m.clearance : m.retract });
      });
      const lp = m.points[m.points.length - 1]; cur.prog = { x: lp[0], y: lp[1], z: m.clearance };
    }
  }

  function flush(si, k) {
    const acc = cur.acc; const fresh = [];
    for (const key of Object.keys(acc)) {
      const a = acc[key], code = CODE(key);
      counts[key] = (counts[key] || 0) + 1;
      if (counts[key] > capPerCode) { suppressed++; continue; }
      const lvl = key === 'below_stock' && a.depth <= cur.allow + belowTol ? 'warn' : LEVEL[key];
      const it = { level: lvl, code, params: { x: a.x, y: a.y, z: a.z, depth: a.depth, cells: a.n, op: sections[si].toolpath.opId }, moveIndex: k, section: si };
      issues.push(it); fresh.push(it);
    }
    return fresh;
  }

  function stepOne() {
    const [si, k] = steps[idx];
    if (!cur || cur.si !== si) enterSection(si);
    cur.acc = {}; cur.move = k;
    doMove(sections[si].toolpath.moves[k]);
    const fresh = flush(si, k);
    idx++;
    if (opts.frames > 0 && idx % opts.frames === 0) frames.push({ index: idx, section: si, moveIndex: k, removedVolume: removedTotal, heightmap: new Float32Array(cur.setup.hm.data) });
    return fresh;
  }

  const sim = {
    get total() { return steps.length; },
    get done() { return idx >= steps.length; },
    // n hareket ilerler; {done, index, newIssues}
    step(n = 1) {
      const out = [];
      for (let q = 0; q < n && idx < steps.length; q++) out.push(...stepOne());
      return { done: idx >= steps.length, index: idx, newIssues: out };
    },
    run() { while (idx < steps.length) stepOne(); return sim.result(); },
    reset,
    // anlik durum (arayuz oynatma): konum, hacim, sorunlar
    state() {
      const last = idx > 0 ? steps[idx - 1] : null;
      return { index: idx, total: steps.length, section: last ? last[0] : null, moveIndex: last ? last[1] : null, position: cur?.pos ? { ...cur.pos } : null, removedVolume: removedTotal, issues: issues.slice(), suppressed };
    },
    // canli harita (kopya degil): setupId verilmezse son/gecerli setup
    heightmap(setupId) {
      const s = setupId != null ? setups.get(setupId) : cur?.setup;
      return s ? s.hm : null;
    },
    result() {
      const remainBySetup = {}; for (const [id, s] of setups) remainBySetup[id] = s.hm;
      const out = { issues: issues.slice(), removedVolume: removedTotal, remainHeightmap: cur ? cur.setup.hm : null, remainBySetup, suppressed, moves: steps.length, samples };
      if (opts.frames > 0) out.frames = frames;
      return out;
    },
  };
  return sim;
}

export function simulate(input, opts = {}) { return createSim(input, opts).run(); }
