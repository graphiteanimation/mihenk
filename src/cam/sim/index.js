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
const LEVEL = { rapid_in_stock: 'error', gouge: 'error', flute_exceeded: 'error', shaft_collision: 'error', holder_collision: 'error', below_stock: 'warn' };
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
    cur = { si, tp, setup: setupFor(id), geom: toolGeom(tool), pos: null, acc: null, move: 0 };
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
        const cx = hm.x0 + (i + 0.5) * rs, dx = cx - px, r2 = dx * dx + dy * dy;
        if (r2 > Rmax2) continue;
        const r = Math.sqrt(r2);
        if (r <= holderR && h > zBody) { note('holder_collision', h - zBody + tol, px, py, pz); continue; }
        if (r <= shaftR && h > zFlute) {
          if (r <= R) note('flute_exceeded', h - zFlute + tol, px, py, pz); else { note('shaft_collision', h - zFlute + tol, px, py, pz); continue; }
        }
        if (r > R) continue;
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

  function doMove(m) {
    if (m.t === 'rapid') rapidTo(m);
    else if (m.t === 'feed') { sweep(cur.pos, m, 1); cur.pos = { x: m.x, y: m.y, z: m.z }; }
    else if (m.t === 'arc') {
      const start = cur.pos;
      for (const p of sampleArc(start, m, 0.002)) { const q = { x: p[0], y: p[1], z: p[2] }; sweep(cur.pos, q, 1); cur.pos = q; }
    } else if (m.t === 'cycle') {
      m.points.forEach((p, n) => {
        const last = n === m.points.length - 1;
        if (cur.pos.x !== p[0] || cur.pos.y !== p[1]) rapidTo({ x: p[0], y: p[1], z: cur.pos.z });
        if (cur.pos.z !== m.retract) rapidTo({ x: p[0], y: p[1], z: m.retract });
        const b = { x: p[0], y: p[1], z: m.bottom }; sweep(cur.pos, b, 1); cur.pos = b;
        rapidTo({ x: p[0], y: p[1], z: last || m.retract === m.clearance ? m.clearance : m.retract });
      });
    }
  }

  function flush(si, k) {
    const acc = cur.acc; const fresh = [];
    for (const key of Object.keys(acc)) {
      const a = acc[key], code = CODE(key);
      counts[key] = (counts[key] || 0) + 1;
      if (counts[key] > capPerCode) { suppressed++; continue; }
      const it = { level: LEVEL[key], code, params: { x: a.x, y: a.y, z: a.z, depth: a.depth, cells: a.n, op: sections[si].toolpath.opId }, moveIndex: k, section: si };
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
