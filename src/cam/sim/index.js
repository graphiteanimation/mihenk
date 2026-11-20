// Stok simulasyonu: yukseklik haritasi (tek degerli dexel) + takim sweep. Saf JS (three.js yok).
// API: simulate(input, opts) -> sonuc;  createSim(input, opts) -> adim adim oynatici ({step(n), run(), state(), heightmap(), reset()}).
// Denetimler: serbest/kopmus parca (T-15, sim sonu), hizlinin stok icine girmesi, oyma (gouge), takim boyu asimi (flute), saft/tutucu carpmasi, stok tabaninin altina inis.
// Setup'lar arasi stok (T-04): bolum setup'inda frame (model uzayi) varsa yeni setup'in baslangic stogu onceki setup'larin son
// haritalarindan (chain.js; ayni govde + ortusen kutu; setup.stockFrom 'blank' ya da opts.chain:false kapatir; initialHeightmaps once gelir).
// SINIRLAR: yalniz ustten (takim ekseni +Z) kesilen tek degerli stok; alt kesme (undercut) ve ters yuz modellenmez; tutucu/saft
// yalniz silindir olarak modellenir; kesit disi fikstur yok. Ayrintilar docs/POST.md.
import { KErr } from '../../shared/errors.js';
import { validateProgram, validateToolpath, splitRapid, sampleArc } from '../ir.js';
import { createHeightmap, cloneHeightmap } from './heightmap.js';
import { toolGeom } from './tool.js';
import { stockFromPrevious, chainSources } from './chain.js';
import { freePieces } from './free.js';
export { stockFromPrevious, chainSources, boxesOverlap } from './chain.js';
export { createHeightmap, cloneHeightmap, heightmapFromFn, sampleHeightmap, volumeBetween, heightmapStats } from './heightmap.js';
export { toolGeom } from './tool.js';

const err = (code, params = {}) => new KErr(code, params);
// below_stock: islemin bildirdigi bilincli pay (toolpath.meta.belowStock, mm; boydan boya delik/kontur) icindeyse 'warn', disindaysa 'error' (V-12)
const LEVEL = { holder_contact: 'error', comp_arc_collapse: 'error', rapid_in_stock: 'error', gouge: 'error', flute_exceeded: 'error', shaft_collision: 'error', holder_collision: 'error', below_stock: 'error' };
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

  const clrLow = opts.holderClearanceLow ?? 0.5; // T-08 ek: en kucuk tutucu boslugu bunun altindaysa uyari (mm)
  // O-035: bosluk <= clrContact = tutucu stoga DEGIYOR -> engel. Varsayilan = dusey oyma toleransi (gougeTol, 0,01 mm): yukseklik
  // haritasi dusey degerleri bu mertebede kayan nokta/ag hatasi tasir; 0,01 mm takim boyu olcme hassasiyetinin de altindadir.
  const clrContact = opts.holderContactTol ?? (opts.gougeTol ?? 0.01);
  let setups, cur, idx, issues, suppressed, removedTotal, frames, samples, counts, secStats;
  const reset = () => { setups = new Map(); cur = null; idx = 0; issues = []; suppressed = 0; removedTotal = 0; frames = []; samples = 0; counts = {}; secStats = []; };
  reset();

  function setupFor(id, sset) {
    if (setups.has(id)) return setups.get(id);
    const box = opts.stockBoxes?.[id] ?? opts.stockBox;
    if (!box || !box.min || !box.max) throw err('cam.sim.no_stock', { setup: id });
    let hm; let chained = false;
    const init = opts.initialHeightmaps?.[id] ?? (opts.stockHeightmap?.data ? opts.stockHeightmap : null);
    const frame = sset?.frame ?? null; const stockFrom = sset?.stockFrom ?? 'previous', bodies = sset?.bodies ?? null;
    const src = opts.chain !== false && !init ? chainSources([...setups.values()], { frame, box, stockFrom, bodies }) : [];
    if (init) hm = cloneHeightmap(init);
    else if (src.length) { // T-04: onceki setup'larin son stogu (yalniz malzeme cikarir; B1)
      hm = stockFromPrevious(src.map((p) => ({ frame: p.frame, hm: p.hm, box: p.box })), { frame, box }, res); chained = true;
    } else hm = createHeightmap([box.min[0], box.min[1]], [box.max[0], box.max[1]], res, box.max[2]);
    let hmax = -Infinity; for (let k = 0; k < hm.data.length; k++) if (hm.data[k] > hmax) hmax = hm.data[k];
    const mh = opts.modelHeightmaps?.[id] ?? (opts.modelHeightmap?.data ? opts.modelHeightmap : null);
    const s = { id, hm, hmax, zFloor: box.min[2], mh, removed: 0, frame, box, chained, stockFrom, bodies };
    setups.set(id, s); return s;
  }

  function enterSection(si) {
    if (cur) closeSection();
    const sec = sections[si], tp = sec.toolpath;
    const id = sec.setup?.id ?? 'default';
    const tool = { ...tp.tool, ...(opts.tools?.[tp.tool.number] || {}), ...(opts.tool || {}) };
    const allow = Number.isFinite(tp.meta?.belowStock) && tp.meta.belowStock > 0 ? tp.meta.belowStock : 0;
    // B2: delme cevriminde stok alti pay en cok breakThrough + uc boyu (meta.drillAllow; yoksa yalniz takim uc boyu)
    const tipL = tool.tipAngle > 0 && tool.tipAngle < 180 ? (tool.dia / 2) / Math.tan(tool.tipAngle * Math.PI / 360) : 0;
    const cycAllow = Math.min(allow, Number.isFinite(tp.meta?.drillAllow) ? tp.meta.drillAllow : tipL);
    const S = setupFor(id, sec.setup), geom = toolGeom(tool);
    // T-08: islem basi stok (yerel stok yuksekligi icin) ve yol izi maskesi; tutucu boslugu
    let preMax = -Infinity; for (let k = 0; k < S.hm.data.length; k++) if (S.hm.data[k] > preMax) preMax = S.hm.data[k];
    cur = { si, tp, allow, cycAllow, allowNow: allow, setup: S, geom, pos: null, prog: null, acc: null, move: 0, compOn: false, compPend: null,
      pre: new Float32Array(S.hm.data), preMax, mask: new Uint8Array(S.hm.data.length), marked: 0, clr: Infinity, clrAt: null };
  }
  // T-08: islemin yol bandi (takim merkezinin stok yuksekliginin altindaki izi, en buyuk zarf yaricapi kadar kare genisletme:
  // daire yerine kare = bant biraz genis, muhafazakar) icinde islem basindaki en yuksek stok hucresi.
  function localTop() {
    const c = cur, hm = c.setup.hm, nx = hm.nx, ny = hm.ny; if (!c.marked) return -Infinity;
    const g = c.geom, w = Math.ceil(Math.max(g.R, g.shaftR, g.holderR) / hm.res) + 1;
    const rowD = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) { // satirda: en yakin isaretli hucre <= w
      let last = -1e9; for (let i = 0; i < nx; i++) { if (c.mask[j * nx + i]) last = i; if (i - last <= w) rowD[j * nx + i] = 1; }
      last = 1e9; for (let i = nx - 1; i >= 0; i--) { if (c.mask[j * nx + i]) last = i; if (last - i <= w) rowD[j * nx + i] = 1; }
    }
    let top = -Infinity;
    for (let i = 0; i < nx; i++) {
      let last = -1e9; const near = new Uint8Array(ny);
      for (let j = 0; j < ny; j++) { if (rowD[j * nx + i]) last = j; if (j - last <= w) near[j] = 1; }
      last = 1e9; for (let j = ny - 1; j >= 0; j--) { if (rowD[j * nx + i]) last = j; if (last - j <= w) near[j] = 1; }
      for (let j = 0; j < ny; j++) if (near[j]) { const v = c.pre[j * nx + i]; if (v > top) top = v; }
    }
    return top;
  }
  function closeSection() {
    const c = cur; if (!c || c.closed) return; c.closed = true;
    const st = { localTop: localTop(), holderClearance: c.geom.holderR > 0 && Number.isFinite(c.clr) ? c.clr : null, envelope: c.geom.holderR > 0 ? 'holder' : 'tool' };
    secStats[c.si] = st;
    if (st.holderClearance != null && st.holderClearance < clrLow && !c.hadHolderHit) {
      const key = st.holderClearance <= clrContact ? 'holder_contact' : 'holder_clearance_low'; counts[key] = (counts[key] || 0) + 1;
      if (counts[key] > capPerCode) suppressed++;
      else issues.push({ level: key === 'holder_contact' ? 'error' : 'warn', code: CODE(key), params: { x: c.clrAt.x, y: c.clrAt.y, z: c.clrAt.z, clearance: Math.max(0, st.holderClearance), min: key === 'holder_contact' ? clrContact : clrLow, op: c.tp.opId }, moveIndex: c.clrAt.k, section: c.si });
    }
    c.pre = null; c.mask = null;
  }

  // T-15: sim sonu her setup'in son haritasinda serbest/kopmus parca (uyari; opts.freePieceBlock ile engel; opts.freePieces:false kapali)
  function freeCheck() {
    if (opts.freePieces === false) return;
    const lastSec = new Map(); sections.forEach((sec, si) => lastSec.set(sec.setup?.id ?? 'default', si));
    for (const [id, st] of setups) {
      const r = freePieces(st.hm, st.zFloor, { minArea: opts.freePieceMinArea ?? 1 });
      for (const c of r.free) {
        counts.free_piece = (counts.free_piece || 0) + 1; if (counts.free_piece > capPerCode) { suppressed++; continue; }
        const si = lastSec.get(id) ?? 0;
        issues.push({ level: opts.freePieceBlock ? 'error' : 'warn', code: CODE('free_piece'), params: { area: Math.round(c.area * 100) / 100, x: c.x, y: c.y, z: c.top, n: r.free.length, setup: id, op: sections[si].toolpath.opId }, moveIndex: sections[si].toolpath.moves.length - 1, section: si });
      }
    }
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
    if (pz < cur.preMax) { const mi = Math.floor((px - hm.x0) / hm.res), mj = Math.floor((py - hm.y0) / hm.res); if (mi >= 0 && mj >= 0 && mi < nx && mj < ny && !cur.mask[mj * nx + mi]) { cur.mask[mj * nx + mi] = 1; cur.marked++; } }
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
        if (r <= holderR) {
          if (h > zBody) { note('holder_collision', h - zBody + tol, px, py, pz); cur.hadHolderHit = true; continue; }
          const cl = pz + g.bodyLen - h; if (cl < cur.clr) { cur.clr = cl; cur.clrAt = { x: px, y: py, z: pz, k: cur.move }; }
        }
        if (r <= shaftR && h > zFlute) {
          if (r <= R) note('flute_exceeded', h - zFlute + tol, px, py, pz); else { note('shaft_collision', h - zFlute + tol, px, py, pz); continue; }
        }
        if (r > R || (mode === 1 && r > g.cutR)) continue; // T-22: kilavuz kesmesi dis dibi capina kadar (dis bolgesi kasitli)
        const zb = pz + g.profile(r);
        if (mode === 0) { if (h > zb + tol) note('rapid_in_stock', h - zb, px, py, pz); continue; }
        if (h > zb) {
          if (mh) { const m = mhAt(mh, cx, cy); if (m === m && zb < m - gtol) noteGouge(g, r, m, zb, pz, px, py, cx, cy); }
          const nz = zb < S.zFloor ? S.zFloor : zb;
          if (nz < h) { const dv = (h - nz) * rs * rs; S.removed += dv; removedTotal += dv; d[idx2] = nz; }
        }
      }
    }
    if (gc) finishGouge();
  }
  // T-17: oyma miktari = model malzemesinin takim zarfina YUZEYE DIK girme derinligi (yan yuzeye R-r, uca normal uzaklik);
  // dusey fark (m - zb) ayrica 'vertical' olarak tutulur. Engel olcutu degismez (dusey fark > tolerans = oyma).
  function noteGouge(g, r, m, zb, pz, px, py, cx0, cy0) {
    const v = m - zb, Rc = g.cutR;
    let end = v;
    if (g.kind === 'cone') end = v * Math.sin(Math.atan(g.tanHalf));
    else if (g.kind === 'ball') { const c = pz + g.R; if (m < c) end = g.R - Math.hypot(r, c - m); else end = Infinity; }
    else if (g.kind === 'bull') { const c = pz + g.cr, rc = g.R - g.cr; if (r > rc && m < c) end = g.cr - Math.hypot(r - rc, c - m); }
    const a = cur.acc.gouge || (cur.acc.gouge = { n: 0, depth: -Infinity, x: 0, y: 0, z: 0, vertical: -Infinity });
    a.n++; if (v > a.vertical) a.vertical = v;
    // takim zarfi icindeki model derinligi (yan: Rc - r, uc: normal uzaklik); dusey farki asamaz
    const d = Math.min(v, Math.max(0, Math.min(Rc - r, end)));
    if (d > a.depth) { a.depth = d; a.x = px; a.y = py; a.z = pz; }
    // ornek basina en derin (dusey) hucre: yatay model yuzeyi uzakligi touch sonunda bir kez aranir
    if (!gc || v > gc.v) gc = { v, cx: cx0, cy: cy0, zb, px, py, pz, g };
  }
  let gc = null;
  function finishGouge() {
    const c = gc; gc = null; const a = cur.acc.gouge; if (!c || !a) return;
    const lim = Math.min(c.v, 2 * c.g.R + cur.setup.mh.res);
    if (!(lim > a.depth)) return;
    const lat = Math.min(c.v, lateralFree(cur.setup.mh, c.cx, c.cy, c.zb, lim));
    if (lat > a.depth) { a.depth = lat; a.x = c.px; a.y = c.py; a.z = c.pz; }
  }
  // (x,y) hucresinden, model ustu zb'nin altinda kalan (bos) en yakin hucreye uzaklik - res (alt sinir). Halka halka aranir, ilk
  // bulunan halkadan sonra durur; arama yaricapi lim ile sinirli (bulunamazsa lim: yine alt sinir).
  function lateralFree(mh, x, y, zb, lim) {
    const rs = mh.res, n = Math.min(Math.ceil((lim + rs) / rs), 64);
    const i0 = Math.floor((x - mh.x0) / rs), j0 = Math.floor((y - mh.y0) / rs);
    let best = Infinity;
    const at = (i, j) => { if (i < 0 || j < 0 || i >= mh.nx || j >= mh.ny) return; const m = mh.data[j * mh.nx + i]; if (m <= zb) { const dd = Math.hypot(i - i0, j - j0) * rs; if (dd < best) best = dd; } };
    for (let k = 1; k <= n; k++) {
      if (best <= (k - 1) * rs) break; // daha dis halkalar daha uzak
      for (let t = -k; t <= k; t++) { at(i0 + t, j0 - k); at(i0 + t, j0 + k); if (t > -k && t < k) { at(i0 - k, j0 + t); at(i0 + k, j0 + t); } }
    }
    return best === Infinity ? Math.min(lim, n * rs) : Math.max(0, best - rs);
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
        // T-23: cok noktali cevrimde sorunlar NOKTA basina yazilir (hangi delik; tek noktali cevrimlerle ayni sayim)
        if (m.points.length > 1) { cur.cycFresh.push(...flush(cur.si, cur.move, n)); cur.acc = {}; }
      });
      const lp = m.points[m.points.length - 1]; cur.prog = { x: lp[0], y: lp[1], z: m.clearance };
    }
  }

  function flush(si, k, point = null) {
    const acc = cur.acc; const fresh = [];
    for (const key of Object.keys(acc)) {
      const a = acc[key], code = CODE(key);
      counts[key] = (counts[key] || 0) + 1;
      if (counts[key] > capPerCode) { suppressed++; continue; }
      // below_stock: bildirilen pay icinde uyari; pay varken asan kisim ayri kod (below_stock_excess, engel); pay yoksa engel
      let lvl = LEVEL[key], code2 = code;
      if (key === 'below_stock') { if (a.depth <= cur.allowNow + belowTol) lvl = 'warn'; else if (cur.allowNow > 0) code2 = CODE('below_stock_excess'); }
      const it = { level: lvl, code: code2, params: { x: a.x, y: a.y, z: a.z, depth: a.depth, cells: a.n, op: sections[si].toolpath.opId }, moveIndex: k, section: si };
      if (a.vertical != null) it.params.vertical = a.vertical;
      if (point != null) it.params.point = point;
      if (key === 'below_stock') it.params.allow = Math.round(cur.allowNow * 1000) / 1000;
      issues.push(it); fresh.push(it);
    }
    return fresh;
  }

  function stepOne() {
    const [si, k] = steps[idx];
    if (!cur || cur.si !== si) enterSection(si);
    cur.acc = {}; cur.move = k; cur.cycFresh = [];
    const mv = sections[si].toolpath.moves[k]; cur.allowNow = mv.t === 'cycle' ? cur.cycAllow : cur.allow;
    doMove(mv);
    const fresh = [...cur.cycFresh, ...flush(si, k)];
    idx++;
    if (idx >= steps.length) { const n0 = issues.length; closeSection(); freeCheck(); fresh.push(...issues.slice(n0)); }
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
      const out = { issues: issues.slice(), removedVolume: removedTotal, remainHeightmap: cur ? cur.setup.hm : null, remainBySetup, suppressed, moves: steps.length, samples, sections: secStats.slice(), chainedSetups: [...setups.values()].filter((x) => x.chained).map((x) => x.id) };
      if (opts.frames > 0) out.frames = frames;
      return out;
    },
  };
  return sim;
}

export function simulate(input, opts = {}) { return createSim(input, opts).run(); }
