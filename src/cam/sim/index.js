// Stok simulasyonu: yukseklik haritasi (tek degerli dexel) + takim sweep. Saf JS (three.js yok).
// API: simulate(input, opts) -> sonuc;  createSim(input, opts) -> adim adim oynatici ({step(n), run(), state(), heightmap(), reset()}).
// Denetimler: serbest/kopmus parca (T-15, sim sonu), hizlinin stok icine girmesi, oyma (gouge), takim boyu asimi (flute), saft/tutucu carpmasi, stok tabaninin altina inis.
// Setup'lar arasi stok (T-04): bolum setup'inda frame (model uzayi) varsa yeni setup'in baslangic stogu onceki setup'larin son
// haritalarindan (chain.js; ayni govde + ortusen kutu; setup.stockFrom 'blank' ya da opts.chain:false kapatir; initialHeightmaps once gelir).
// stockFrom:'blank' yalniz o setup'i degil SONRAKILERI de etkiler: zincir kaynagi son 'blank' setup'tan baslar, ondan onceki
// setup'larin kesimleri unutulur (yeni ham parca bagli sayilir).
// SINIRLAR: yalniz ustten (takim ekseni +Z) kesilen tek degerli stok; alt kesme (undercut) ve ters yuz modellenmez; tutucu/saft
// yalniz silindir olarak modellenir; kesit disi fikstur yok. Ayrintilar docs/POST.md.
import { KErr } from '../../shared/errors.js';
import { validateProgram, validateToolpath, splitRapid, sampleArc } from '../ir.js';
import { createHeightmap, cloneHeightmap, stockHeightmap } from './heightmap.js';
import { toolGeom } from './tool.js';
import { stockFromPrevious, chainSources, prepareSources, columnEmpty } from './chain.js';
import { freePieces } from './free.js';
import { lowerForChamfer } from './chamfer.js';
import { fixtureGrid, fixtureHit } from './fixtures.js';
import { triFromBox, triFromHeightmap, triFromSources, triHeightmap, triCut, triHit, triSweep, triBandHit, subRay, rayTop } from './tridexel.js';
import { createWrapStock, wrapTouch, wrapFixtureHit } from './wrap.js';
import { triFromMesh, meshZGrid, meshRadialRays, overlapIv } from './model3d.js';
export { stockFromPrevious, chainSources, boxesOverlap } from './chain.js';
export { createHeightmap, cloneHeightmap, heightmapFromFn, stockHeightmap, sampleHeightmap, volumeBetween, heightmapStats } from './heightmap.js';
export { toolGeom, holderSegments } from './tool.js';
export { fixtureGrid, fixtureHit, normalizeFixtures, resolveFixtures, normalizeSolids } from './fixtures.js';
export { triFromBox, triFromHeightmap, triHeightmap, triVolume, triContains, subRay } from './tridexel.js';
export { createWrapStock, wrapRay, wrapRadiiAt, wrapTheta, wrapFixtureHit } from './wrap.js';
export { triFromMesh, meshZGrid, meshRadialRays, boxMesh, mergeMeshes, bodiesMeshInFrame } from './model3d.js';

const err = (code, params = {}) => new KErr(code, params);
// below_stock: islemin bildirdigi bilincli pay (toolpath.meta.belowStock, mm; boydan boya delik/kontur) icindeyse 'warn', disindaysa 'error' (V-12)
const LEVEL = { fixture_collision: 'error', fixture_shaft: 'error', fixture_holder: 'error', holder_contact: 'error', comp_arc_collapse: 'error', rapid_in_stock: 'error', gouge: 'error', flute_exceeded: 'error', shaft_collision: 'error', holder_collision: 'error', below_stock: 'error' };
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
  // WP-13: opts.dexel 'tri' = uc yonlu dexel stok (X/Y/Z isin aglari; alt kesme ve yan yuz). Varsayilan 'height' (tek degerli harita).
  const TRI = opts.dexel === 'tri', latTol = opts.lateralTol ?? 0.01;
  const fixTol = opts.fixtureTol ?? 0.01; // WP-13: baglama govdesine bu kadardan az (dusey/yanal) giris temas sayilmaz (kayan nokta)
  let setups, cur, idx, issues, suppressed, removedTotal, frames, samples, counts, secStats;
  let wraps; // WP-16: sarma bolumleri icin silindirik stok (setup kimligi -> createWrapStock); yukseklik haritasiyla stok PAYLASILMAZ (her biri digerinin kesimini bilmez: daha cok malzeme, muhafazakar)
  const reset = () => { wraps = new Map(); setups = new Map(); cur = null; idx = 0; issues = []; suppressed = 0; removedTotal = 0; frames = []; samples = 0; counts = {}; secStats = []; };
  reset();

  function setupFor(id, sset) {
    if (setups.has(id)) return setups.get(id);
    const box = opts.stockBoxes?.[id] ?? opts.stockBox;
    if (!box || !box.min || !box.max) throw err('cam.sim.no_stock', { setup: id });
    let hm; let chained = false;
    const init = opts.initialHeightmaps?.[id] ?? (opts.stockHeightmap?.data ? opts.stockHeightmap : null);
    const frame = sset?.frame ?? null; const stockFrom = sset?.stockFrom ?? 'previous', bodies = sset?.bodies ?? null;
    const src = opts.chain !== false && !init ? chainSources([...setups.values()], { frame, box, stockFrom, bodies }) : [];
    let tri = null;
    if (init) { hm = cloneHeightmap(init); if (TRI) tri = triFromHeightmap(hm, box.min[2], box.max[2]); }
    else if (src.length) { // T-04: onceki setup'larin son stogu (yalniz malzeme cikarir; B1)
      const sl = src.map((p) => ({ frame: p.frame, hm: p.hm, box: p.box }));
      if (TRI && src.every((p) => p.tri)) { // WP-13: uc dexel kaynaklardan (alt kesme/ters yuz korunur)
        const hm0 = stockHeightmap(box, res); tri = triFromSources(src.map((p) => ({ frame: p.frame, tri: p.tri, box: p.box })), { frame, box, cyl: sset?.stockCyl ?? null }, hm0); hm = triHeightmap(tri, hm0);
      } else hm = stockFromPrevious(sl, { frame, box }, res);
      chained = prepareSources(sl);
    } else { hm = stockHeightmap(box, res, sset?.stockCyl ?? null); if (TRI) tri = triFromBox(box, hm, sset?.stockCyl ?? null); }
    let hmax = -Infinity; for (let k = 0; k < hm.data.length; k++) if (hm.data[k] > hmax) hmax = hm.data[k];
    const mh = opts.modelHeightmaps?.[id] ?? (opts.modelHeightmap?.data ? opts.modelHeightmap : null);
    // WP-13: baglama govdeleri (setup.fixtures ya da opts.fixtures[setupId]; opts.fixtures === false kapatir)
    const fxl = opts.fixtures === false ? null : (sset?.fixtures?.length ? sset.fixtures : opts.fixtures?.[id] ?? null);
    const fix = fxl?.length ? fixtureGrid(fxl, res) : null;
    // WP-22b: model agi (setup cercevesi). Tri kipte stok izgarasinda X/Y/Z model araliklari (gercek 3B oyma denetimi)
    const mesh = opts.modelMeshes?.[id] ?? null;
    const mt = TRI && tri && mesh ? triFromMesh(mesh, tri) : null;
    const s = { id, hm, hmax, zFloor: box.min[2], mh, removed: 0, frame, box, chained, stockFrom, bodies, fix, tri, mesh, mt, mz: null };
    setups.set(id, s); return s;
  }

  function enterSection(si) {
    if (cur) closeSection();
    const sec = sections[si], tp = sec.toolpath;
    const id = sec.setup?.id ?? 'default';
    const tool = { ...tp.tool, ...(opts.tools?.[tp.tool.number] || {}), ...(opts.tool || {}) };
    if (tp.wrap) { // WP-16
      if (!wraps.has(id)) {
        const st = sec.setup || {}; const box = opts.stockBoxes?.[id] ?? st.stockBox ?? opts.stockBox, cyl = st.stockCyl;
        if (!box || !cyl) throw err('cam.sim.wrap_no_cyl', { setup: id });
        if (Math.hypot(cyl.yc, cyl.zc) > 1e-6) throw err('cam.sim.wrap_off_axis', { setup: id });
        const W = createWrapStock({ ...st, stockBox: box }, res);
        // WP-22b: model yaricap isinlari (silindirik izgara) ve baglama govdeleri (parca ile A'da doner)
        const mesh = opts.modelMeshes?.[id]; if (mesh) W.model = meshRadialRays(mesh, W);
        const fxl = opts.fixtures === false ? null : (st.fixtures?.length ? st.fixtures : opts.fixtures?.[id] ?? null);
        if (fxl?.length) W.fix = fixtureGrid(fxl, res);
        wraps.set(id, W);
      }
      cur = { si, tp, wrap: wraps.get(id), geom: toolGeom(tool), pos: null, acc: null, move: 0, clr: Infinity, marked: 0, allow: 0, cycAllow: 0, allowNow: 0, pre: null, mask: null };
      return;
    }
    const allow = Number.isFinite(tp.meta?.belowStock) && tp.meta.belowStock > 0 ? tp.meta.belowStock : 0;
    // B2: delme cevriminde stok alti pay en cok breakThrough + uc boyu (meta.drillAllow; yoksa yalniz takim uc boyu)
    const tipL = tool.tipAngle > 0 && tool.tipAngle < 180 ? (tool.dia / 2) / Math.tan(tool.tipAngle * Math.PI / 360) : 0;
    const cycAllow = Math.min(allow, Number.isFinite(tp.meta?.drillAllow) ? tp.meta.drillAllow : tipL);
    const S = setupFor(id, sec.setup), geom = toolGeom(tool);
    // T-08: islem basi stok (yerel stok yuksekligi icin) ve yol izi maskesi; tutucu boslugu
    let preMax = -Infinity; for (let k = 0; k < S.hm.data.length; k++) if (S.hm.data[k] > preMax) preMax = S.hm.data[k];
    const mhCh = tp.meta?.chamferSharp && S.mh ? lowerForChamfer(S.mh, tp.meta.chamferSharp) : null; // WP-07: keskin kenar pahi - bildirilen hacim
    // WP-07: model hucresi beyan edilen pah genisliginin 1/10'undan buyukse fazla kesim (hucre capraz toleransi 0,71*res) gizlenebilir -> acik uyari
    if (mhCh && mhCh.res > tp.meta.chamferSharp.width / 10 + 1e-12) issues.push({ level: 'warn', code: CODE('chamfer_tolerance_coarse'), params: { tol: Math.round(0.71 * mhCh.res * 1000) / 1000, res: mhCh.res, width: tp.meta.chamferSharp.width, op: tp.opName } });
    // WP-22b: tri kip + model agi: oyma modele karsi 3B (keskin kenar pahi islemi yukseklik haritasi varsa onu kullanir: bildirilen pah hacmi)
    const mt = S.mt && !(mhCh) ? S.mt : null;
    cur = { si, tp, mhCh, mt, allow, cycAllow, allowNow: allow, zones: Array.isArray(tp.meta?.threadZones) && tp.meta.threadZones.length ? tp.meta.threadZones : null, setup: S, geom, pos: null, prog: null, acc: null, move: 0, compOn: false, compPend: null,
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
    if (c.wrap) { secStats[c.si] = { localTop: null, holderClearance: null, envelope: 'tool', wrap: true }; return; } // WP-16
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
      const hm = st.hm, F = st.frame, cs = st.chained;
      const empty = cs && F ? (k) => { const i = k % hm.nx, j = (k - i) / hm.nx; return columnEmpty(cs, F, hm.x0 + (i + 0.5) * hm.res, hm.y0 + (j + 0.5) * hm.res, st.zFloor, hm.data[k]); } : null;
      const r = freePieces(hm, st.zFloor, { minArea: opts.freePieceMinArea ?? 1, empty });
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

  // WP-07 dis frezeleme: hucre (x,y) bildirilen halkada (r0 <= uzaklik <= r1) ve takim ucu dis z araliginda ise true
  function inZone(zs, x, y, z) { for (const q of zs) { if (z < q.z0 || z > q.z1) continue; const d = Math.hypot(x - q.c[0], y - q.c[1]); if (d >= q.r0 && d <= q.r1) return true; } return false; }
  // mode 0: hizli (yalniz denetle), 1: kesme (stoku kaldir)
  function touch(px, py, pz, mode, prev = null) {
    samples++;
    const g = cur.geom, S = cur.setup, hm = S.hm, d = hm.data, nx = hm.nx, ny = hm.ny, R = g.R, shaftR = g.shaftR, holderR = g.holderR;
    if (pz < S.zFloor - belowTol) note('below_stock', S.zFloor - pz, px, py, pz);
    if (pz < cur.preMax) { const mi = Math.floor((px - hm.x0) / hm.res), mj = Math.floor((py - hm.y0) / hm.res); if (mi >= 0 && mj >= 0 && mi < nx && mj < ny && !cur.mask[mj * nx + mi]) { cur.mask[mj * nx + mi] = 1; cur.marked++; } }
    if (S.fix) { // WP-13: takim/sap/tutucu ile baglama govdesi (hizli ve kesme hareketlerinde)
      const fh = fixtureHit(S.fix, g, px, py, pz, fixTol);
      // kod parcaya gore: kesici fixture_collision, sap fixture_shaft, tutucu fixture_holder (hepsi engel)
      if (fh) { const key = fh.part === 'tool' ? 'fixture_collision' : 'fixture_' + fh.part; const a = cur.acc[key] || (cur.acc[key] = { n: 0, depth: -Infinity, x: 0, y: 0, z: 0 }); a.n++; if (mode === 0) a.rapid = true; if (fh.depth > a.depth) { a.depth = fh.depth; a.x = px; a.y = py; a.z = pz; a.part = fh.part; a.fixture = fh.fixture; } }
    }
    if (pz + tol >= S.hmax) return;
    const Rmax = Math.max(R, shaftR, holderR), Rmax2 = Rmax * Rmax, rs = hm.res;
    const i0 = Math.max(0, Math.floor((px - Rmax - hm.x0) / rs)), i1 = Math.min(nx - 1, Math.floor((px + Rmax - hm.x0) / rs));
    const j0 = Math.max(0, Math.floor((py - Rmax - hm.y0) / rs)), j1 = Math.min(ny - 1, Math.floor((py + Rmax - hm.y0) / rs));
    const zFlute = pz + g.fluteLen + tol, zBody = pz + g.bodyLen + tol, mh = cur.mhCh || S.mh, gtol = gtolBase + (mh?.err ?? 0);
    const gtolT = gtolBase + (cur.mt?.err ?? 0), tg = { z: 0, x: 0, y: 0 }; // WP-22b: tri model oymasi (Z, X, Y isinlarinda en buyuk ortusme)
    // WP-22b: tri kipte kesici yalniz [uc profili, flut ustu] (oyma bu aralikta; ustundeki model sap/tutucu carpmasidir). Boyunlu takim
    // (sap < kesici, T-yuva): flut ustunde yalniz sap; sap yan temasi X/Y bantlarinda (shaft_collision), Z sutunu sonsuz sayilmaz.
    const neck = !!S.tri && shaftR < R - 1e-9, zCutTop = neck ? zFlute : Infinity;
    for (let j = j0; j <= j1; j++) {
      const cy = hm.y0 + (j + 0.5) * rs, dy = cy - py;
      for (let i = i0; i <= i1; i++) {
        const idx2 = j * nx + i, h = d[idx2];
        if (h <= pz + tol) continue;
        if (h <= S.zFloor + 1e-9) continue; // V-13: tabana kadar kesilmis hucre BOS (hizli/carpma sayilmaz)
        const cx = hm.x0 + (i + 0.5) * rs, dx = cx - px, r2 = dx * dx + dy * dy;
        if (r2 > Rmax2) continue;
        const r = Math.sqrt(r2);
        if (r <= holderR) { // WP-13: tutucu profili (kademeli silindir/koni): bu yaricapta tutucunun basladigi yukseklik zBody + holderU(r)
          const u = g.holderU(r);
          if (u < Infinity) {
            if (h > zBody + u) { note('holder_collision', h - zBody - u + tol, px, py, pz); cur.hadHolderHit = true; continue; }
            const cl = pz + g.bodyLen + u - h; if (cl < cur.clr) { cur.clr = cl; cur.clrAt = { x: px, y: py, z: pz, k: cur.move }; }
          }
        }
        if (neck) { // T-yuva/boyunlu takim (tri): Z isininda yalniz kesici dilimi; flut ustu sap denetimi X/Y bantlarinda
          if (r > R || (mode === 1 && r > g.cutR)) continue;
          const zb = pz + g.profile(r), zr = S.tri.zr[idx2];
          if (mode === 0) { const o = overlapIv(zr, zb, zFlute); if (o && o.ov > tol) note('rapid_in_stock', o.ov, px, py, pz); continue; }
          if (cur.mt) { const o = overlapIv(cur.mt.zr[idx2], zb, zFlute); if (o && o.ov > gtolT && o.ov > tg.z) tg.z = o.ov; }
          const rem = subRay(zr, zb < S.zFloor ? S.zFloor : zb, zFlute); if (rem > 0) { const dv = rem * rs * rs; S.removed += dv; removedTotal += dv; } d[idx2] = rayTop(zr, S.zFloor);
          continue;
        }
        if (cur.zones && r <= R && inZone(cur.zones, cx, cy, pz)) { // WP-07: dis halkasi, yalniz KESICI (flut) boyu icinde kasitli kesimdir; flut boyunu asan malzeme sap yaricapinda engel (flute_exceeded)
          if (h > zFlute && r <= shaftR) note('flute_exceeded', h - zFlute + tol, px, py, pz);
          continue;
        }
        if (r <= shaftR && h > zFlute) {
          if (r <= R) note('flute_exceeded', h - zFlute + tol, px, py, pz); else { note('shaft_collision', h - zFlute + tol, px, py, pz); continue; }
        }
        if (r > R || (mode === 1 && r > g.cutR)) continue; // T-22: kilavuz kesmesi dis dibi capina kadar (dis bolgesi kasitli)
        const zb = pz + g.profile(r);
        if (mode === 0) { if (h > zb + tol) note('rapid_in_stock', h - zb, px, py, pz); continue; }
        if (h > zb) {
          if (cur.mt) { const zr = cur.mt.zr[idx2]; if (zr.length) { const o = overlapIv(zr, zb, zFlute); if (o && o.ov > gtolT && o.ov > tg.z) tg.z = o.ov; } } // WP-22b: kesici dilimi
          else if (mh) { const m = mhAt(mh, cx, cy); if (m === m && zb < m - gtol) noteGouge(g, r, m, zb, pz, px, py, cx, cy); }
          const nz = zb < S.zFloor ? S.zFloor : zb;
          if (S.tri) { const zr = S.tri.zr[idx2]; const rem = subRay(zr, nz, Infinity); if (rem > 0) { const dv = rem * rs * rs; S.removed += dv; removedTotal += dv; } d[idx2] = rayTop(zr, S.zFloor); }
          else if (nz < h) { const dv = (h - nz) * rs * rs; S.removed += dv; removedTotal += dv; d[idx2] = nz; }
        }
      }
    }
    if (gc) finishGouge();
    if (S.tri) { // WP-13: X/Y isinlari (ardisik ornek cifti kapsulu): kesmede cikar, hizlida yanal giris
      const p1 = { x: px, y: py, z: pz };
      const fL = g.fluteLen, rhoCut = (u) => (u <= fL ? g.rho(u) : 0);
      if (mode === 1 && cur.mt) { // WP-22b: model X/Y araliklarina yanal oyma, yalniz kesici dilimi (dis bolgesi kasitli)
        triSweep(cur.mt, rhoCut, prev, p1, cur.mt.zTop, (ray, lo, hi, ax, c) => {
          const o = overlapIv(ray, lo, hi); if (!o || o.ov <= gtolT || o.ov <= tg[ax]) return;
          if (cur.zones) { const m = (o.a + o.b) / 2; if (inZone(cur.zones, ax === 'x' ? m : c, ax === 'x' ? c : m, pz)) return; }
          tg[ax] = o.ov;
        });
      }
      if (cur.mt && (tg.z > 0 || tg.x > 0 || tg.y > 0)) noteTriGouge(tg, px, py, pz);
      lateralBands(S.tri, g, prev, p1, S.hmax, px, py, pz); // WP-22b: sap/tutucu yanal carpmasi (kesimden ONCE: malzeme henuz yerinde)
      if (mode === 1) triCut(S.tri, neck ? rhoCut : g.rho, prev, p1, S.hmax);
      else { const o = triHit(S.tri, neck ? (u) => (u <= fL ? g.rhoEnv(u) : 0) : g.rhoEnv, prev, p1, S.hmax); if (o > latTol) note('rapid_in_stock', o, px, py, pz); }
    }
  }
  // WP-22b: tri model oymasi. Derinlik = ortusmesi olan eksenlerin en buyuk ortusmelerinin EN KUCUGU (yuzeye dik girmenin
  // yaklasigi: tabanda Z kisa / X-Y uzun, duvarda X ya da Y kisa). 'vertical' = Z ortusmesi.
  function noteTriGouge(tg, px, py, pz) {
    let d = Infinity; for (const k of ['z', 'x', 'y']) if (tg[k] > 0 && tg[k] < d) d = tg[k];
    const a = cur.acc.gouge || (cur.acc.gouge = { n: 0, depth: -Infinity, x: 0, y: 0, z: 0, vertical: -Infinity });
    a.n++; if (tg.z > a.vertical) a.vertical = tg.z;
    if (d > a.depth) { a.depth = d; a.x = px; a.y = py; a.z = pz; }
  }
  // WP-22b: kesici boyu ustu (flut), sap ve tutucu bantlari X/Y isinlarinda (hucre merkezine yuvarlanmayan yanal temas)
  const bandCache = new WeakMap(); // geom nesnesi basina (oriented() yeni nesne uretir)
  function bandsOf(g) {
    if (bandCache.has(g)) return bandCache.get(g);
    const fL = g.fluteLen, bL = g.bodyLen, hs = g.holderSegs;
    const neck = g.shaftR < g.R - 1e-9; // boyunlu takim: flut ustunde yalniz sap (shaftR) -> shaft_collision
    const b = { flute: neck ? null : (u) => (u >= fL && u <= bL ? g.R : 0), shaft: g.shaftR > g.R + 1e-9 || neck ? (u) => (u >= fL && u <= bL ? g.shaftR : 0) : null, holder: null };
    if (hs && g.holderR > 0) b.holder = (u) => { const q = u - bL; if (q < 0) return 0; for (const sg of hs) if (q >= sg.u0 && q <= sg.u1) return sg.r0 + (sg.u1 > sg.u0 ? (q - sg.u0) / (sg.u1 - sg.u0) : 0) * (sg.r1 - sg.r0); return 0; };
    bandCache.set(g, b); return b;
  }
  function lateralBands(T, g, prev, p1, zTop, px, py, pz) {
    const b = bandsOf(g); if (Math.min(p1.z, prev ? prev.z : p1.z) + g.fluteLen >= zTop) return;
    const of = b.flute ? triBandHit(T, b.flute, prev, p1, g.fluteLen, zTop) : 0;
    if (of > latTol) note('flute_exceeded', of, px, py, pz);
    if (b.shaft) { const os = triBandHit(T, b.shaft, prev, p1, g.fluteLen, zTop); if (os > of + latTol) note('shaft_collision', os, px, py, pz); }
    if (b.holder && Math.min(p1.z, prev ? prev.z : p1.z) + g.bodyLen < zTop) { const oh = triBandHit(T, b.holder, prev, p1, g.bodyLen, zTop); if (oh > latTol) { note('holder_collision', oh, px, py, pz); cur.hadHolderHit = true; } }
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
    const lim = Math.min(c.v, 2 * c.g.R + (cur.mhCh || cur.setup.mh).res);
    if (!(lim > a.depth)) return;
    const lat = Math.min(c.v, lateralFree(cur.mhCh || cur.setup.mh, c.cx, c.cy, c.zb, lim));
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
    let pv = a;
    for (let k = 1; k <= n; k++) { const t = k / n; const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }; touch(q.x, q.y, q.z, mode, pv); pv = q; }
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

  // WP-16: sarma hareketi (X, Z = uc yaricapi, A). Ornek araligi en buyuk yaricapta (stok ya da uc) yay boyu <= step.
  function wrapSweep(a, b, mode) {
    const W = cur.wrap, k = Math.PI / 180 * W.sign;
    const ext = { gtol: gtolBase + (W.model?.err ?? 0) };
    const at = (q) => {
      if (Math.abs(q.y) > 1e-6) throw err('cam.sim.wrap_y', { y: q.y }); samples++;
      removedTotal += wrapTouch(W, cur.geom, q.x, q.z, q.a * k, mode, (code, depth) => note(code, depth, q.x, 0, q.z), tol, ext);
      if (W.fix) { // WP-22b: baglama govdesi (parca cercevesinde, A ile doner)
        const fh = wrapFixtureHit(W.fix, cur.geom, q.x, q.z, q.a * k, fixTol);
        if (fh) { const key = fh.part === 'tool' ? 'fixture_collision' : 'fixture_' + fh.part; const a = cur.acc[key] || (cur.acc[key] = { n: 0, depth: -Infinity, x: 0, y: 0, z: 0 }); a.n++; if (mode === 0) a.rapid = true; if (fh.depth > a.depth) { a.depth = fh.depth; a.x = q.x; a.y = 0; a.z = q.z; a.part = fh.part; a.fixture = fh.fixture; } }
      }
    };
    if (!a) { at(b); return; }
    const aa = a.a ?? b.a, ba = b.a ?? aa;
    const len = Math.hypot(b.x - a.x, b.z - a.z, Math.max(W.R, Math.abs(a.z), Math.abs(b.z)) * (ba - aa) * Math.PI / 180);
    const n = Math.max(1, Math.ceil(len / step));
    for (let q = 1; q <= n; q++) { const t = q / n; at({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, a: aa + (ba - aa) * t }); }
  }
  function wrapMove(m) {
    const P = (o) => ({ x: o.x, y: o.y, z: o.z, a: o.a ?? cur.pos?.a });
    if (m.t === 'rapid') { for (const p of (rapidSplit ? splitRapid(cur.pos, m) : [m])) { const q = P(p); wrapSweep(cur.pos, q, 0); cur.pos = q; } }
    else if (m.t === 'feed') { const q = P(m); wrapSweep(cur.pos, q, 1); cur.pos = q; }
    else if (m.t === 'cycle') {
      for (const [n, p] of m.points.entries()) {
        const last = n === m.points.length - 1, a = cur.pos.a, go = (z, mode) => { const q = { x: p[0], y: p[1], z, a }; wrapSweep(cur.pos, q, mode); cur.pos = q; };
        if (cur.pos.x !== p[0] || cur.pos.y !== p[1]) go(cur.pos.z, 0);
        if (m.cycle === 'backBore' || m.cycle === 'fineBore') throw err('cam.sim.wrap_cycle', { cycle: m.cycle });
        go(m.retract, 0); go(m.bottom, 1); if (m.cycle === 'tap') go(m.retract, 1);
        go(last || m.retract === m.clearance || m.returnTo === 'clearance' ? m.clearance : m.retract, 0);
      }
    }
  }

  function doMove(m) {
    if (cur.wrap) { wrapMove(m); return; }
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
        const ret = { x: p[0], y: p[1], z: last || m.retract === m.clearance || m.returnTo === 'clearance' ? m.clearance : m.retract }; // WP-06: returnTo 'clearance' = her nokta G98
        if (m.cycle === 'backBore') { // WP-13 (WP-14 G87): yonlendirilmis + kaydirilmis takimla deligin icinden hizli inis, alttan cutTo'ya kesme, kaydirilmis cikis
          cur.allowNow = Math.max(cur.allowNow, cur.setup.zFloor - m.bottom); // alttan baslama: stok tabani alti kasitli (bu hareket icin uyari)
          oriented(m.shift, () => rapidTo({ x: p[0], y: p[1], z: m.bottom }));
          backCut(p[0], p[1], m.bottom, m.cutTo); cur.pos = { x: p[0], y: p[1], z: m.cutTo };
          oriented(m.shift, () => rapidTo(ret));
        } else {
          if (cur.pos.z !== m.retract) rapidTo({ x: p[0], y: p[1], z: m.retract });
          const b = { x: p[0], y: p[1], z: m.bottom }; sweep(cur.pos, b, 1); cur.pos = b;
          // kilavuz dipten ILERLEMEYLE (ters donusle) cikar: hizli degil kesme gibi denetlenir (dis bolgesi hizli sayilmaz)
          if (m.cycle === 'tap') { const up = { x: p[0], y: p[1], z: m.retract }; sweep(cur.pos, up, 1); cur.pos = up; }
          if (m.cycle === 'fineBore') oriented(m.shift, () => rapidTo(ret)); // G76: dipte yonlendirme + kaydirma, hizli cikis
          else rapidTo(ret);
        }
        // T-23: cok noktali cevrimde sorunlar NOKTA basina yazilir (hangi delik; tek noktali cevrimlerle ayni sayim)
        if (m.points.length > 1) { cur.cycFresh.push(...flush(cur.si, cur.move, n)); cur.acc = {}; }
      });
      const lp = m.points[m.points.length - 1]; cur.prog = { x: lp[0], y: lp[1], z: m.clearance };
    }
  }

  // WP-13: G76/G87 yonlendirilmis (M19) ve shift kadar kaydirilmis takim. Takim modeli eksenel simetrik oldugundan kaydirilmis tek
  // kesicili bar, DELIK EKSENI etrafinda R - shift yaricapli zarfla temsil edilir (kesici ucu duvardan shift kadar uzak; bar govdesinin
  // bu zarfin icinde kaldigi VARSAYILIR). Kayma yonu (shiftDir) bu yuzden sonucu degistirmez. Tutucu degismez.
  function oriented(shift, fn) {
    const g = cur.geom, Rs = Math.max(1e-3, g.R - (shift > 0 ? shift : 0));
    const prof = g.profile;
    cur.geom = { ...g, R: Rs, cutR: Math.min(g.cutR, Rs), shaftR: Math.min(g.shaftR, Rs), profile: (r) => prof(r), rho: (u) => Math.min(g.rho(u), Rs), rhoEnv: (u) => Math.min(g.rhoEnv(u), Rs) };
    try { fn(); } finally { cur.geom = g; }
  }
  // WP-13: alttan yukari kesme (G87): (x, y) ekseninde kesme yaricapli silindir [z0, z1] kaldirilir. Uc dexel: tam; yukseklik haritasi
  // alttan kesimi temsil edemez: yalniz sutun ustu z1'in altindaysa (ustu acik) kaldirir, degilse malzeme KALIR (muhafazakar).
  // Model oyma denetimi yapilmaz (model haritasi alttan acilan havsayi gostermez); fikstur denetimi orneklerde yapilir.
  function backCut(x, y, z0, z1) {
    const S = cur.setup, hm = S.hm, d = hm.data, g = cur.geom, R = g.cutR, rs = hm.res, nx = hm.nx;
    if (S.fix) for (let z = z0, n = Math.max(1, Math.ceil((z1 - z0) / step)), k = 0; k <= n; k++, z = z0 + (z1 - z0) * k / n) {
      samples++; const fh = fixtureHit(S.fix, g, x, y, z, fixTol);
      if (fh) { const key = fh.part === 'tool' ? 'fixture_collision' : 'fixture_' + fh.part; const a = cur.acc[key] || (cur.acc[key] = { n: 0, depth: -Infinity, x: 0, y: 0, z: 0 }); a.n++; if (fh.depth > a.depth) { a.depth = fh.depth; a.x = x; a.y = y; a.z = z; a.part = fh.part; a.fixture = fh.fixture; } }
    }
    const i0 = Math.max(0, Math.floor((x - R - hm.x0) / rs)), i1 = Math.min(nx - 1, Math.floor((x + R - hm.x0) / rs));
    const j0 = Math.max(0, Math.floor((y - R - hm.y0) / rs)), j1 = Math.min(hm.ny - 1, Math.floor((y + R - hm.y0) / rs));
    // WP-22b: yukari kesimde modele oyma. Tri kip + model agi: Z ve X/Y isinlari; yukseklik haritasi kipinde model agi verilmisse
    // yalniz Z isinlari (model haritasi alttan acilan havsayi gostermez; ag gosterir). Ag yoksa denetim yok (eskisi gibi).
    const MZ = cur.mt ?? (S.mesh ? (S.mz ??= meshZGrid(S.mesh, hm)) : null), gtolB = gtolBase + (MZ?.err ?? 0), tg = { z: 0, x: 0, y: 0 };
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = hm.x0 + (i + 0.5) * rs, cy = hm.y0 + (j + 0.5) * rs; if (Math.hypot(cx - x, cy - y) > R) continue;
      const k = j * nx + i; let rem = 0;
      if (MZ) { const o = overlapIv(MZ.zr[k], z0, z1); if (o && o.ov > gtolB && o.ov > tg.z) tg.z = o.ov; }
      if (S.tri) { rem = subRay(S.tri.zr[k], z0, z1); d[k] = rayTop(S.tri.zr[k], S.zFloor); }
      else { const h = d[k], lo = Math.max(z0, S.zFloor); if (h > lo && h <= z1 + tol) { rem = h - lo; d[k] = lo; } }
      if (rem > 0) { const dv = rem * rs * rs; S.removed += dv; removedTotal += dv; }
    }
    if (cur.mt) triSweep(cur.mt, (u) => (u <= z1 - z0 ? R : 0), null, { x, y, z: z0 }, z1, (ray, lo, hi, ax) => { const o = overlapIv(ray, lo, hi); if (o && o.ov > gtolB && o.ov > tg[ax]) tg[ax] = o.ov; });
    if (MZ && (tg.z > 0 || tg.x > 0 || tg.y > 0)) noteTriGouge(tg, x, y, z1);
    if (S.tri) triCut(S.tri, g.rho, null, { x, y, z: z0 }, z1);
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
      if (key.startsWith('fixture_')) { it.params.part = a.part; it.params.fixture = a.fixture; it.params.rapid = !!a.rapid; it.params.depth = Math.round(a.depth * 1000) / 1000; }
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
    if (opts.frames > 0 && idx % opts.frames === 0 && cur.setup?.hm) frames.push({ index: idx, section: si, moveIndex: k, removedVolume: removedTotal, heightmap: new Float32Array(cur.setup.hm.data) });
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
      const out = { issues: issues.slice(), removedVolume: removedTotal, remainHeightmap: cur?.setup ? cur.setup.hm : null, remainBySetup, ...(wraps.size ? { wrapBySetup: Object.fromEntries(wraps) } : {}), ...(TRI ? { triBySetup: Object.fromEntries([...setups].map(([id, x]) => [id, x.tri])) } : {}), suppressed, moves: steps.length, samples, sections: secStats.slice(), chainedSetups: [...setups.values()].filter((x) => !!x.chained).map((x) => x.id) };
      if (opts.frames > 0) out.frames = frames;
      return out;
    },
  };
  return sim;
}

export function simulate(input, opts = {}) { return createSim(input, opts).run(); }
