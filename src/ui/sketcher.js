// Sketch düzenleme ortamı: çizim araçları, yakalama, kısıtlar, ölçüler, geri al/yinele.
import { THREE, COL, planeMatrix, sketchPolylines } from './viewport.js';
import { solveSketch, probeFree } from './solver.js';
import { findRegions, arcGeom, entSeg } from '../shared/profiles.js';
import * as G from '../shared/geom2d.js';
import { DEFS, DRAW_TOOLS } from './sketch/tools.js';
import { snapAt, SNAP_LABEL } from './sketch/snap.js';
import { EDIT_METHODS, EDIT_TOOLS } from './sketch/edit.js';
import { boxSelect } from './sketch/ops.js';
import { COMFORT_METHODS } from './sketch/comfort.js';
import { TEXT_METHODS, pruneTexts } from './sketch/text.js';
import { UNDERLAY_METHODS, UL_TOOLS, UL_HINT } from './sketch/underlay.js'; // WP-22a: eskiz altlığı
import { selOn, selClass, autoOn, SKO } from './sketch/opts.js';
import { alignTraceCons, hvSame, autoHvRedundantAfterFix, autoYield } from './sketch/autoalign.js';
import { dropEditedLinks, syncRefs, geomSnap, geomDrift } from './sketch/ops.js';
import { measureDim, DIM_TYPES as DIMS, deleteItems, entPts, seqOf } from './sketch/core.js';
import { evalExpr } from '../shared/expr.js';
import { dxfToSketch, sketchToDxf } from '../shared/dxf.js';
import { t, tk, errText, fmtNum } from '../shared/i18n.js';
import { toErr } from '../shared/errors.js';
import * as V from '../shared/vec.js';

const SNAP_PX = 8, ANG_TOL = 3, TAU = Math.PI * 2, DEG = Math.PI / 180;
const STILL_TOL = 1e-5; // mm: budama/bölmeden sonra kalan geometrinin izin verilen en büyük kayması (C-21)
const DIM_TOOLS = ['dim', 'hdim', 'vdim', 'rdim', 'ddim'];
const TOOLS = ['select', 'line', 'rect', 'circle', 'arc', 'point', ...DIM_TOOLS, ...DRAW_TOOLS, ...EDIT_TOOLS, ...UL_TOOLS];
const DIM_TYPES = DIMS;
// Kısıt adları sözlük anahtarıdır (con.<tip>); metin t() ile üretilir.
const NAME_KEY = {
  horizontal: tk('con.horizontal'), vertical: tk('con.vertical'), horizontal_pp: tk('con.horizontal_pp'), vertical_pp: tk('con.vertical_pp'), coincident: tk('con.coincident'),
  parallel: tk('con.parallel'), perpendicular: tk('con.perpendicular'), equal: tk('con.equal'), tangent: tk('con.tangent'), pointOn: tk('con.pointOn'), midpoint: tk('con.midpoint'), symmetric: tk('con.symmetric'),
  dist: tk('con.dist'), hdist: tk('con.hdist'), vdist: tk('con.vdist'), pldist: tk('con.pldist'), radius: tk('con.radius'), diameter: tk('con.diameter'), angle: tk('con.angle'),
  collinear: tk('con.collinear'), lldist: tk('con.lldist'), ccdist: tk('con.ccdist'), radiusdiff: tk('con.radiusdiff'),
};
const nameOf = (type) => (NAME_KEY[type] ? t(NAME_KEY[type]) : type);
const GLYPH = { horizontal: 'H', vertical: 'V', horizontal_pp: 'H', vertical_pp: 'V', coincident: '●', parallel: '∥', perpendicular: '⊥', equal: '=', tangent: 'T', pointOn: '◦', midpoint: 'M', symmetric: '⇋', collinear: '≡' };
const HINT_KEY = {
  select: tk('hint.select'), line: tk('hint.line'), rect: tk('hint.rect'), circle: tk('hint.circle'), arc: tk('hint.arc'), point: tk('hint.point'),
  dim: tk('hint.dim'), hdim: tk('hint.hdim'), vdim: tk('hint.vdim'), rdim: tk('hint.rdim'), ddim: tk('hint.ddim'), spline: tk('hint.spline'),
  rectc: tk('hint.rectc'), rect3: tk('hint.rect3'), circle2: tk('hint.circle2'), circle3: tk('hint.circle3'), arc3: tk('hint.arc3'), arct: tk('hint.arct'), polygon: tk('hint.polygon'), slot: tk('hint.slot'), ellipse: tk('hint.ellipse'),
  trim: tk('hint.trim'), extend: tk('hint.extend'), break: tk('hint.break'), offset: tk('hint.offset'), fillet: tk('hint.fillet'), chamfer: tk('hint.chamfer'), mirror: tk('hint.mirror'),
  ...UL_HINT, patrect: tk('hint.patrect'), patcirc: tk('hint.patcirc'), move: tk('hint.move'), copy: tk('hint.copy'), rotate: tk('hint.rotate'), scale: tk('hint.scale'), project: tk('hint.project'),
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const getEntS = (sk, id) => sk.ents.find((e) => e.id === id);
const fmt = (v) => fmtNum(Number(v), 3);
const norm = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };
const normId = (id) => String(id).replace(/_(b|c|rules)$/, '');
const conRefs = (c) => [c.a, c.b, c.c].filter(Boolean);
const numeric = (s) => /^[-+]?\d*[.,]?\d+$/.test(String(s).trim());

function segProj(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let t = l2 > 1e-18 ? ((p[0] - a.x) * dx + (p[1] - a.y) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const x = a.x + dx * t, y = a.y + dy * t; return { d: Math.hypot(p[0] - x, p[1] - y), x, y };
}
// nesneye en yakın nokta ve uzaklık
function entDist(sk, e, p) {
  if (e.type === 'ellipse' || e.type === 'ellarc' || e.type === 'spline') {
    const sg = entSeg(sk, e); if (!sg) return null; const cp = G.closestPoint(sg, p); return { d: cp.d, x: cp.p[0], y: cp.p[1] };
  }
  if (e.type === 'line') { const a = sk.points[e.a], b = sk.points[e.b]; return a && b ? segProj(p, a, b) : null; }
  if (e.type === 'circle') {
    const c = sk.points[e.c]; if (!c) return null; const d = Math.hypot(p[0] - c.x, p[1] - c.y); if (d < 1e-9) return null;
    return { d: Math.abs(d - e.r), x: c.x + ((p[0] - c.x) / d) * e.r, y: c.y + ((p[1] - c.y) / d) * e.r };
  }
  if (e.type === 'arc') {
    if (!sk.points[e.a] || !sk.points[e.b] || !sk.points[e.c]) return null;
    const g = arcGeom(sk, e), d = Math.hypot(p[0] - g.c.x, p[1] - g.c.y); if (d < 1e-9) return null;
    const ang = Math.atan2(p[1] - g.c.y, p[0] - g.c.x);
    if (norm(ang - g.a0) <= g.sweep) return { d: Math.abs(d - g.r), x: g.c.x + ((p[0] - g.c.x) / d) * g.r, y: g.c.y + ((p[1] - g.c.y) / d) * g.r };
    const a = sk.points[e.a], b = sk.points[e.b], da = Math.hypot(p[0] - a.x, p[1] - a.y), db = Math.hypot(p[0] - b.x, p[1] - b.y);
    return da < db ? { d: da, x: a.x, y: a.y } : { d: db, x: b.x, y: b.y };
  }
  return null;
}
function entMid(sk, e) {
  if (e.type === 'ellipse' || e.type === 'ellarc' || e.type === 'spline') { const sg = entSeg(sk, e); if (sg) return G.ptAt(sg, G.endU(sg) * 0.25); }
  if (e.type === 'line') { const a = sk.points[e.a], b = sk.points[e.b]; return [(a.x + b.x) / 2, (a.y + b.y) / 2]; }
  if (e.type === 'circle') { const c = sk.points[e.c]; return [c.x + e.r * Math.SQRT1_2, c.y + e.r * Math.SQRT1_2]; }
  if (e.type === 'arc') { const g = arcGeom(sk, e), t = g.a0 + g.sweep / 2; return [g.c.x + g.r * Math.cos(t), g.c.y + g.r * Math.sin(t)]; }
  if (e.type === 'point') { const p = sk.points[e.p]; return [p.x, p.y]; }
  return [0, 0];
}
const arcPts = (c, r, a0, sweep) => { const n = Math.max(8, Math.ceil((Math.abs(sweep) / TAU) * 72)), out = []; for (let i = 0; i <= n; i++) { const t = a0 + (sweep * i) / n; out.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]); } return out; };

export class Sketcher {
  constructor({ viewport, overlayEl, getVars, setHint, setStatus, onChange, onRequestFinish, getBodies } = {}) {
    this.vp = viewport; this.overlayEl = overlayEl; this.getVars = getVars || (() => ({}));
    this._setHint = setHint || (() => {}); this._setStatus = setStatus || (() => {}); this.onChange = onChange || (() => {});
    this._hintSpec = null; this._statusSpec = null;
    this.active = false; this.tool = 'select'; this.selection = []; this.lastSolve = null;
    this.sk = null; this.consMode = false; this._q = Promise.resolve(); this._sid = 0;
    this.opts = { polySides: 6, polyCircum: false }; this.free = null; this.onRequestFinish = onRequestFinish || (() => {}); this.getBodies = getBodies || (() => []); this._focusCons = new Set();
  }

  // ---------- yaşam döngüsü ----------
  start(feature, plane) {
    if (this.active) this._teardown();
    this._sid++;
    this.feature = clone(feature || {}); this.plane = plane;
    const sk = { points: this.feature.points || {}, ents: this.feature.ents || [], cons: this.feature.cons || [] }; if (Number.isFinite(this.feature.seq)) sk.seq = this.feature.seq; seqOf(sk);
    if (Array.isArray(this.feature.texts)) sk.texts = this.feature.texts; // WP-21: metin kayıtları (metin olarak yeniden düzenleme)
    if (!sk.points.O) sk.points.O = { x: 0, y: 0, fixed: true };
    sk.points.O.x = 0; sk.points.O.y = 0; sk.points.O.fixed = true;
    this.sk = sk; this._undo = []; this._redo = []; this.selection = []; this.hover = null; this.cursor = null; this.consMode = false; this.free = null; this._focusCons = new Set();
    this.root = new THREE.Group(); this.root.matrixAutoUpdate = false; this.root.matrix.copy(planeMatrix(plane));
    this.gMain = new THREE.Group(); this.gPrev = new THREE.Group(); this.root.add(this.gMain, this.gPrev);
    this.vp.editGroup.add(this.root); this._ulInit();
    this.ovl = document.createElement('div'); this.ovl.className = 'sk-ovl'; this.ovl.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.overlayEl.appendChild(this.ovl); this._cfInit();
    this._prevPtr = this.vp.onPointer; this._prevCam = this.vp.onCamera; this.vp.leftLock++; // eskizde sol tuş çizime ayrılır (sol tuşla döndürme kapalı)
    this.vp.onPointer = (t, e) => this._pointer(t, e);
    this.vp.onCamera = () => { this._prevCam && this._prevCam(); this._onCamera(); };
    this.active = true; this.tool = 'select'; this._resetDraw();
    this._reprojectOnOpen();
    this.vp.lookAtPlane(plane); this.vp.fit();
    this.setHint(HINT_KEY.select);
    this._refresh();
    const sid = this._sid;
    this._q = this._q.then(async () => {
      if (this._sid !== sid || !this.active) return;
      try { const r = await solveSketch(this.sk, this.getVars()); this.lastSolve = r; if (r.ok) syncRefs(this.sk); this._statusDof(r, this._openNote); this._openNote = null; this._probeSoon(); } catch (e) { this._status('sk.solve_failed', { msg: errText(e) }); }
      this._refresh();
    });
    return this._q;
  }
  stop() {
    if (!this.active) return null;
    pruneTexts(this.sk);
    const out = { ...this.feature, points: clone(this.sk.points), ents: clone(this.sk.ents), cons: clone(this.sk.cons), seq: seqOf(this.sk) };
    if (this.sk.texts) out.texts = clone(this.sk.texts); else delete out.texts;
    if (this.underlay) out.underlay = clone(this.underlay); else delete out.underlay; // WP-22a
    this._teardown(); return out;
  }
  cancel() { if (this.active) this._teardown(); }
  _teardown() {
    this._closeInput(); this._closeDialog(); this._hideCtx(); clearTimeout(this._probeT); this._sid++;
    this.active = false;
    for (const g of [this.gMain, this.gPrev]) this._clearGroup(g);
    this._ulDispose();
    this._cfDispose(); this.vp.editGroup.remove(this.root); this.ovl.remove();
    this.vp.onPointer = this._prevPtr || null; this.vp.onCamera = this._prevCam || null; this.vp.leftLock = Math.max(0, this.vp.leftLock - 1);
    this.vp.renderer.domElement.style.cursor = '';
    this.selection = []; this._resetDraw(); this.setHint(''); this.vp.dirty = true; this.onChange();
  }
  idle() { return this._q; }

  // ---------- araçlar ----------
  setTool(name) {
    if (!TOOLS.includes(name)) return;
    this._closeInput(); this._closeDialog(); this._resetDraw();
    const keepSel = DIM_TOOLS.includes(name) || EDIT_TOOLS.includes(name);
    const prevSel = this.selection.slice();
    this.tool = name; if (name !== 'select') this._lastTool = name; // Enter/Boşluk son komutu yineler
    this.vp.renderer.domElement.style.cursor = name === 'select' ? 'default' : 'crosshair';
    this.setHint(HINT_KEY[name]);
    if (DIM_TOOLS.includes(name) && this.selection.length) this._dimEval(); else if (name !== 'select' && this.selection.length && !keepSel) this.selection = [];
    this._renderGL(); this._buildOverlay(); this._renderPreview(); this.onChange();
    if (EDIT_TOOLS.includes(name)) this._editEnter(name, prevSel);
  }
  _resetDraw() { this._ul = null; this._ln = null; this._rc = null; this._ci = null; this._ar = null; this._ds = null; this._sp = null; this._off = null; this._mir = null; this._cornerFirst = null; this._box = null; this._press = null; this._drag = null; this._dragTarget = null; this._rdown = null; this._trimming = false; this._trimHot = null; this._hideSnap(); if (this.gPrev) { this._clearGroup(this.gPrev); this._hideTip(); } }

  // ---------- kimlik / durum ----------
  _id(prefix) { // kalıcı sayaç: silinen kimlik yeniden verilmez
    const sk = this.sk; seqOf(sk);
    const used = (id) => id in sk.points || sk.ents.some((e) => e.id === id) || sk.cons.some((c) => c.id === id) || (this._reserved && this._reserved.has(id));
    let id; do { id = prefix + (++sk.seq); } while (used(id) || used(id + '_b') || used(id + '_rules'));
    return id;
  }
  // İpucu ve durum satırı: anahtar (ya da metin üreten işlev) saklanır; dil değişince relang() yeniden yazar.
  setHint(k, params) {
    this._hintSpec = k ? (typeof k === 'function' ? k : () => t(k, params)) : null;
    this._setHint(this._hintSpec ? this._hintSpec() : '');
  }
  _status(k, params) {
    this._statusSpec = k ? (typeof k === 'function' ? k : () => t(k, params)) : null;
    this._setStatus(this._statusSpec ? this._statusSpec() : '');
  }
  retheme() { if (this.active) { this._renderGL(); this._renderPreview(); this._buildOverlay(); } }
  relang() {
    this.setHint(this._hintSpec); this._status(this._statusSpec);
    if (this.active) { this.relangComfort(); this._buildOverlay(); this.onChange(); }
  }
  _statusDof(r, note) {
    if (!this.sk.ents.length) return this._status('sk.empty');
    const red = !!(r.redundant && r.redundant.length);
    this._status(() => (r.dof === 0 ? t('sk.dof_full') : t('sk.dof', { n: r.dof })) + (red ? t('sk.redundant_suffix') : '') + (note && note() ? '  ·  ' + note() : ''));
  }
  // Nesne başına serbestlik: çözümden sonra kısa gecikmeyle sınanır (WASM; büyük sketch'lerde atlanır)
  _probeSoon() {
    clearTimeout(this._probeT); const sid = this._sid; const r = this.lastSolve;
    if (r && r.dof === 0) { this.free = { dof: 0, freePts: new Set(), freeEnts: new Set() }; return; }
    this._probeT = setTimeout(async () => {
      if (this._sid !== sid || !this.active) return;
      try { const f = await probeFree(this.sk, this.getVars()); if (this._sid === sid && this.active) { this.free = f && f.freePts ? f : null; this._renderGL(); this.onChange(); } } catch (e) { console.warn('probe', e && e.message); }
    }, 180);
  }
  // çelişen/gereksiz kısıtların okunur listesi
  _badLabels(r) {
    const ids = [...new Set([...(r.conflicting || []), ...(r.redundant || [])].map(normId))];
    return ids.map((id) => { const c = this.sk.cons.find((k) => k.id === id); return c ? this._conLabel(c) : null; }).filter(Boolean);
  }
  _snapStr() { return JSON.stringify({ points: this.sk.points, ents: this.sk.ents, cons: this.sk.cons, seq: this.sk.seq, ...(this.sk.texts ? { texts: this.sk.texts } : {}) }); }
  _restore(s) { const seq = this.sk.seq; this.sk = JSON.parse(s); this.sk.seq = Math.max(seq || 0, this.sk.seq || 0); this.selection = this.selection.filter((x) => this._exists(x)); this.hover = null; }
  _exists(x) { return x.kind === 'point' ? x.id in this.sk.points : this.sk.ents.some((e) => e.id === x.id); }
  _badSet() { const r = this.lastSolve; return new Set([...((r && r.conflicting) || []), ...((r && r.redundant) || [])].map(normId)); }

  // Değişikliği hemen uygular, arkadan çözer; olmazsa geri alır. Sonuç: Promise<{ok,msg}>
  // still: işlem (budama/bölme) kalan geometriyi oynatmamalı (C-21): çözümden önceki ve sonraki konumlar karşılaştırılır,
  // STILL_TOL'u aşan kayma olursa işlem geri alınır.
  _apply(mutate, { strict = false, kind = tk('sk.kind.op'), note = null, still = false } = {}) {
    if (!this.active) return Promise.resolve({ ok: false, msg: t('sk.inactive') });
    const before = this._snapStr();
    const abort = mutate(this.sk);
    if (typeof abort === 'function') { this._restore(before); this._status(abort); this._refresh(); return Promise.resolve({ ok: false, msg: abort() }); }
    const dropped = dropEditedLinks(this.sk); // izdüşürülen nesne düzenlendiyse (kırp/uzat/böl/taşı/kopya…) kaynak bağı düşer
    if (dropped) { const n0 = note; note = () => [n0 && n0(), t('sk.proj_unlinked', { n: dropped })].filter(Boolean).join('  ·  '); }
    const entry = { s: before }; this._undo.push(entry); if (this._undo.length > 200) this._undo.shift(); this._redo = [];
    this._refresh();
    const sid = this._sid;
    const run = async () => {
      if (this._sid !== sid || !this.active) return { ok: false };
      const prev = this._badSet(); let yielded = 0;
      for (let attempt = 0; ; attempt++) {
      let r, mk = null, over = false; const g0 = still ? geomSnap(this.sk) : null;
      try { r = await solveSketch(this.sk, this.getVars()); } catch (e) { r = { ok: false, errors: [toErr(e)] }; }
      if (this._sid !== sid || !this.active) return { ok: false };
      const newBad = [...(r.conflicting || []), ...(r.redundant || [])].map(normId).filter((id) => !prev.has(id));
      const K = () => ({ kind: t(kind) });
      const lst = () => { const l = this._badLabels(r); return l.length ? ' ' + t('sk.conflict_list', { list: l.join('; ') }) : ''; };
      if (r.errors && r.errors.length) { const er = r.errors[0]; mk = () => errText(er); }
      else if (!r.ok) { over = !!(strict && r.conflicting && r.conflicting.length); mk = r.conflicting && r.conflicting.length ? (strict ? () => t('sk.conflict_strict', K()) + lst() : () => t('sk.conflict_undone', K()) + lst()) : () => t('sk.no_solution', K()); }
      else if (strict && newBad.length) {
        over = true;
        const conflict = (r.conflicting || []).map(normId).some((id) => !prev.has(id));
        mk = conflict ? () => t('sk.conflict_strict', K()) + lst() : () => t('sk.redundant_con', K()) + lst();
      }
      if (!mk && g0) { const d = geomDrift(g0, this.sk); if (d > STILL_TOL) mk = () => t('sk.op.moved_undone', { kind: t(kind), d: fmtNum(d, 6) }); }
      // WP-21 (7g): kullanıcının kısıtı/ölçüsü/Sabitle'si OTOMATİK yatay/dikey kısıtlarla çatışırsa (fazla kısıt) o otomatik kısıtlar
      // (yalnız ilgili noktalara dokunanlar) kaldırılıp bir kez yeniden çözülür; yine olmazsa eskisi gibi reddedilir.
      if (mk && over && attempt === 0) {
        const drop = autoYield(JSON.parse(before), this.sk);
        if (drop.length) { this.sk.cons = this.sk.cons.filter((c) => !drop.includes(c.id)); yielded = drop.length; continue; }
      }
      if (mk) {
        this._restore(before); const i = this._undo.indexOf(entry); if (i >= 0) this._undo.splice(i, 1);
        this._resetDraw(); this._status(mk); this._refresh(); return { ok: false, msg: mk(), over };
      }
      if (yielded) { const n0 = note, n = yielded; note = () => [n0 && n0(), t('sk.auto_yield', { n })].filter(Boolean).join('  ·  '); }
      this.lastSolve = r; syncRefs(this.sk); this._statusDof(r, note); this._probeSoon(); this._refresh(); return { ok: true };
      }
    };
    const p = this._q.then(run, run); this._q = p.catch(() => {}); return p;
  }
  _resolveOnly() { // geri al/yinele sonrası serbestlik derecesini tazele
    const sid = this._sid;
    this._q = this._q.then(async () => {
      if (this._sid !== sid || !this.active) return;
      try { const r = await solveSketch(this.sk, this.getVars()); if (r.ok) { this.lastSolve = r; syncRefs(this.sk); this._statusDof(r); this._probeSoon(); } } catch (e) {}
      this._refresh();
    });
  }
  undo() {
    if (!this.active) return; if (!this._undo.length) return this._status('msg.nothing_undo');
    const e = this._undo.pop(); if ('u' in e) { this._redo.push({ u: this.underlay }); this._ulRestore(e.u); this._resetDraw(); this._refresh(); return; } // WP-22a: altlık adımı
    this._redo.push({ s: this._snapStr() }); this._restore(e.s); this._resetDraw(); this._refresh(); this._resolveOnly();
  }
  redo() {
    if (!this.active) return; if (!this._redo.length) return this._status('msg.nothing_redo');
    const e = this._redo.pop(); if ('u' in e) { this._undo.push({ u: this.underlay }); this._ulRestore(e.u); this._resetDraw(); this._refresh(); return; }
    this._undo.push({ s: this._snapStr() }); this._restore(e.s); this._resetDraw(); this._refresh(); this._resolveOnly();
  }

  // ---------- çizim yardımcıları ----------
  _newPt(x, y) { const id = this._id('p'); this.sk.points[id] = { x, y }; return id; }
  _addEnt(ent) { const id = this._id({ line: 'l', circle: 'c', arc: 'a', point: 'n', ellipse: 'e', ellarc: 'e', spline: 's' }[ent.type] || 'x'); const e = { id, ...ent }; if (this.consMode && ent.type !== 'point') e.cons = true; this.sk.ents.push(e); if (this._addedLog) this._addedLog.push(id); return id; }
  _addCon(type, a, b, extra = {}) { const id = this._id(DIM_TYPES.has(type) ? 'd' : 'k'); const c = { id, type, a }; if (b !== undefined) c.b = b; Object.assign(c, extra); this.sk.cons.push(c); return id; }
  _addEntCons(ent) { const id = this._id({ line: 'l', circle: 'c', arc: 'a', ellipse: 'e', ellarc: 'e' }[ent.type] || 'x'); this.sk.ents.push({ id, ...ent, cons: true }); return id; }
  _ptFor(s, skipRef = null) { // yakalama sonucundan nokta kimliği (gerekirse oluşturur, uygun kısıtları ekler); skipRef: hizalama izinde atlanacak nokta
    if (s.pid) return s.pid;
    const id = this._newPt(s.x, s.y);
    const okOn = (eid) => { const e = this.sk.ents.find((x) => x.id === eid); return e && e.type !== 'spline' && e.type !== 'ellarc' && e.type !== 'point'; };
    if (s.kind === 'align') { if (autoOn('hv')) for (const [ty, a, b] of alignTraceCons(this.sk, id, s, skipRef)) this._addCon(ty, a, b, { auto: true }); return id; } // WP-21: hizalama izinden otomatik yatay/dikey
    if (!autoOn('on') && s.kind !== 'mid') return id; // otomatik "nesne üstünde" kapalı: yalnız nokta konur
    if (s.kind === 'int' && s.ents) { for (const e of s.ents) if (okOn(e)) this._addCon('pointOn', id, e); }
    else if (s.kind === 'quad' && s.ent) { // çeyrek nokta: daire/yayın üstünde ve merkezle yatay/dikey hizada
      const e = this.sk.ents.find((x) => x.id === s.ent); if (okOn(s.ent)) this._addCon('pointOn', id, s.ent);
      if (e && (e.type === 'circle' || e.type === 'arc') && e.c) this._addCon(s.qi % 2 === 0 ? 'horizontal_pp' : 'vertical_pp', id, e.c, { auto: true });
    }
    else if (s.kind === 'mid' && s.ent) { const e = this.sk.ents.find((x) => x.id === s.ent); if (e && e.type === 'line' && autoOn('mid')) this._addCon('midpoint', id, s.ent); else if (okOn(s.ent) && autoOn('on')) this._addCon('pointOn', id, s.ent); }
    else if (s.ent && okOn(s.ent)) this._addCon('pointOn', id, s.ent);
    return id;
  }
  _alignEnd(st, s) {
    if (s.pid || s.ent || !autoOn('hv')) return s;
    if (s.exact) { const ex = s.x - st.x, ey = s.y - st.y; return autoOn('hv') && Math.hypot(ex, ey) > 1e-9 ? (Math.abs(ey) < 1e-9 ? { ...s, align: 'h' } : Math.abs(ex) < 1e-9 ? { ...s, align: 'v' } : s) : s; } // yazılan koordinat: kaydırma yok, tam yatay/dikey ise kısıt
    const dx = s.x - st.x, dy = s.y - st.y; if (Math.hypot(dx, dy) < 1e-9) return s;
    const ang = Math.atan2(Math.abs(dy), Math.abs(dx)) / DEG;
    if (ang < ANG_TOL) return { ...s, y: st.y, align: 'h' };
    if (ang > 90 - ANG_TOL) return { ...s, x: st.x, align: 'v' };
    return s;
  }

  // ---------- yakalama / seçme ----------
  _hit(loc) {
    const tol = SNAP_PX * this.vp.worldPerPixel(); let best = null; const flt = this.tool === 'select'; // seçim filtresi yalnız Seç aracında
    if (!flt || selOn('point')) for (const [id, p] of Object.entries(this.sk.points)) { const d = Math.hypot(p.x - loc[0], p.y - loc[1]); if (d <= tol && (!best || d < best.d)) best = { kind: 'point', id, d }; }
    if (best) return best;
    for (const e of this.sk.ents) { if (e.type === 'point') continue; if (flt && !selOn(selClass('ent', e))) continue; const r = entDist(this.sk, e, loc); if (r && r.d <= tol && (!best || r.d < best.d)) best = { kind: 'ent', id: e.id, d: r.d, x: r.x, y: r.y }; }
    return best;
  }
  _snapAt(loc, ev, from) {
    const s = snapAt(this, loc, ev, from || this._snapFrom());
    // otomatik "çakışık" kapalıysa mevcut noktaya yakalanan çizim noktası paylaşılmaz (konum aynı, yeni nokta, kısıt yok)
    if (s.pid && !autoOn('coin') && !EDIT_TOOLS.includes(this.tool) && this.tool !== 'select' && !DIM_TOOLS.includes(this.tool)) { const { pid, ...r } = s; return r; }
    return s;
  }
  _snapFrom() { // teğet/dik yakalama için çizilmekte olan çizginin başlangıcı
    if (this.tool === 'line' && this._ln) return [this._ln.start.x, this._ln.start.y];
    return null;
  }
  _entDist(e, p) { return entDist(this.sk, e, p); }
  _isSel(x) { return this.selection.some((s) => s.kind === x.kind && s.id === x.id); }
  _setSel(list) { this.selection = list; if (this._focusCons && this._focusCons.size) { this._focusCons = new Set(); this._buildOverlay(); } this._renderGL(); this.onChange(); }
  _loc(ev) { return this.vp.rayToPlane(ev, this.plane); }

  // ---------- fare ----------
  _pointer(type, ev) {
    if (!this.active) return false;
    if (type === 'dbl') { if (this.tool === 'line') this._endChain(); else if (this.tool === 'spline') this._finishSpline(); return true; }
    if (type === 'move') {
      if (ev.buttons & 6) return true;
      const loc = this._loc(ev); if (!loc) return true;
      this._move(loc, ev); return true;
    }
    if (ev.button === 2) {
      if (type === 'down') this._rdown = { x: ev.clientX, y: ev.clientY };
      else if (type === 'up' && this._rdown) { const m = Math.hypot(ev.clientX - this._rdown.x, ev.clientY - this._rdown.y) < 4; this._rdown = null; if (m) this._rightClick(ev); }
      return false;
    }
    if (ev.button !== 0) return false;
    const loc = this._loc(ev); if (!loc) return true;
    if (type === 'down') { this._closeInput(); this._hideCtx(); this._down(loc, ev); } else if (type === 'up') this._up(loc, ev);
    return true;
  }
  _hasStage() { return !!(this._ln || this._rc || this._ci || this._ar || this._ds || this._sp || this._off || this._mir || this._cornerFirst || (this._ul && this._ul.pts.length)); }
  _rightClick(ev) {
    if (this.tool === 'line' && this._ln) return this._endChain();
    if (this.tool === 'spline' && this._sp) return this._finishSpline();
    if (this._hasStage()) return this._cancelStage();
    this._contextMenu(ev);
  }
  _cancelStage() { this._ul = null; this._ln = null; this._rc = null; this._ci = null; this._ar = null; this._ds = null; this._sp = null; this._off = null; this._mir = null; this._cornerFirst = null; this._closeDialog(); this.setHint(HINT_KEY[this.tool]); this._renderPreview(); }

  _down(loc, ev) {
    const t = this.tool;
    if (t === 'select') return this._selDown(loc, ev);
    if (DIM_TOOLS.includes(t)) return this._dimDown(loc, ev);
    if (EDIT_TOOLS.includes(t)) return this._editDown(loc, ev);
    if (UL_TOOLS.includes(t)) return this._ulDown(loc, ev);
    const s = this._snapAt(loc, ev);
    this._clickWith(s);
    this._renderPreview();
  }
  // Çizim aracına hazır bir yakalama sonucunu "tıklama" olarak verir (fare ve koordinat girişi ortak kullanır)
  _clickWith(s) {
    const t = this.tool;
    if (t === 'line') return this._lineClick(s);
    if (t === 'rect') return this._rectClick(s);
    if (t === 'circle') return this._circleClick(s);
    if (t === 'arc') return this._arcClick(s);
    if (t === 'point') return this._pointClick(s);
    if (t === 'spline') return this._splineClick(s);
    if (DEFS[t]) return this._dsClick(s);
  }
  _move(loc, ev) {
    const t = this.tool;
    if (t === 'select') {
      if (this._box) return this._boxMove(loc, ev);
      if (this._press && (ev.buttons & 1)) return this._selDrag(loc, ev);
      return this._setHover(this._hit(loc));
    }
    if (DIM_TOOLS.includes(t)) return this._setHover(this._hit(loc));
    if (EDIT_TOOLS.includes(t)) return this._editMove(loc, ev);
    if (UL_TOOLS.includes(t)) { this.cursor = { ...this._snapAt(loc, ev), loc }; this._renderPreview(); return; }
    this.cursor = { ...this._snapAt(loc, ev), loc }; this._renderPreview();
  }
  _up(loc, ev) {
    if (this._dimPending) {
      this._dimPending = false;
      if (this._dimEval() === 'bad') { this.selection = this.selection.slice(-1); this._dimEval(); }
      this._renderGL(); this.onChange(); return;
    }
    if (EDIT_TOOLS.includes(this.tool)) return this._editUp(loc, ev);
    if (UL_TOOLS.includes(this.tool)) return this._ulUp();
    if (this.tool !== 'select') return;
    if (this._box) return this._boxUp(loc, ev);
    const pr = this._press, d = this._drag; this._press = null; this._drag = null;
    if (d && d.active) { this._dragTarget = null; this._finishDrag(d); return; }
    if (pr && pr.hit && !pr.shift && this.selection.length > 1) this._setSel([{ kind: pr.hit.kind, id: pr.hit.id }]);
  }
  _setHover(h) {
    const a = this.hover, same = (!a && !h) || (a && h && a.kind === h.kind && a.id === h.id);
    if (same) return; this.hover = h ? { kind: h.kind, id: h.id } : null; this._renderGL();
  }

  // ---- genel çizim araçları (tools.js)
  _dsClick(s) {
    const def = DEFS[this.tool];
    if (!this._ds) {
      if (def.first) { const err = def.first(this, s); if (err) { this._status(err); return; } }
      this._ds = { pts: [s] }; this.setHint(def.hints[1]); return;
    }
    const pts = [...this._ds.pts, s];
    if (pts.length < def.n) { this._ds.pts = pts; this.setHint(def.hints[pts.length]); return; }
    const err = def.valid ? def.valid(this, pts) : null; if (err) { this._status(err); return; }
    this._ds = null; this.setHint(def.hints[0]);
    return this._apply(() => { def.commit(this, pts); }, { kind: def.kind });
  }
  // ---- spline
  _splineClick(s) {
    const st = this._sp;
    if (!st) { this._sp = { pts: [s] }; this.setHint('hint.spline_next'); return; }
    const first = st.pts[0];
    if (st.pts.length >= 3 && ((s.pid && s.pid === first.pid) || Math.hypot(s.x - first.x, s.y - first.y) < SNAP_PX * this.vp.worldPerPixel() * 0.6)) return this._finishSpline(true);
    if (Math.hypot(s.x - st.pts[st.pts.length - 1].x, s.y - st.pts[st.pts.length - 1].y) < 1e-6) return;
    st.pts.push(s);
  }
  _finishSpline(closed = false) {
    const st = this._sp; if (!st) return; this._sp = null; this.setHint(HINT_KEY.spline);
    if (st.pts.length < 2) { this._renderPreview(); return; }
    this._apply(() => { const ids = st.pts.map((p) => this._ptFor(p)); this._addEnt({ type: 'spline', pts: ids, ...(closed ? { closed: true } : {}) }); }, { kind: tk('sk.kind.spline') });
    this._renderPreview();
  }

  // ---- seç aracı
  _selDown(loc, ev) {
    const hit = this._hit(loc), shift = ev.shiftKey;
    this._press = { hit, shift, x: ev.clientX, y: ev.clientY };
    if (hit) {
      const it = { kind: hit.kind, id: hit.id };
      if (shift) this._setSel(this._isSel(it) ? this.selection.filter((s) => !(s.kind === it.kind && s.id === it.id)) : [...this.selection, it]);
      else if (!this._isSel(it)) this._setSel([it]);
      if (!shift) this._drag = { start: loc, active: false, before: this._snapStr(), moved: false, items: this._isSel(it) ? this.selection.slice() : [it] };
    } else {
      this._box = { a: loc, ax: ev.clientX, ay: ev.clientY, active: false, shift };
    }
  }
  _boxMove(loc, ev) {
    const b = this._box; if (!b) return;
    if (!b.active) { if (Math.hypot(ev.clientX - b.ax, ev.clientY - b.ay) < 4) return; b.active = true; }
    b.cur = loc; b.touch = ev.clientX < b.ax; this._drawBox(ev);
  }
  _drawBox(ev) {
    const b = this._box; if (!this._boxEl) { this._boxEl = document.createElement('div'); this._boxEl.className = 'sk-box'; this.ovl.appendChild(this._boxEl); }
    const r = this.vp.renderer.domElement.getBoundingClientRect(); const x0 = Math.min(b.ax, ev.clientX) - r.left, y0 = Math.min(b.ay, ev.clientY) - r.top;
    Object.assign(this._boxEl.style, { left: x0 + 'px', top: y0 + 'px', width: Math.abs(ev.clientX - b.ax) + 'px', height: Math.abs(ev.clientY - b.ay) + 'px', display: '' });
    this._boxEl.classList.toggle('touch', b.touch);
  }
  _boxUp(loc, ev) {
    const b = this._box; this._box = null; this._press = null; this._drag = null; if (this._boxEl) { this._boxEl.remove(); this._boxEl = null; }
    if (!b) return;
    if (!b.active) { if (!b.shift && this.selection.length) this._setSel([]); return; }
    const box = [Math.min(b.a[0], loc[0]), Math.min(b.a[1], loc[1]), Math.max(b.a[0], loc[0]), Math.max(b.a[1], loc[1])];
    const r = boxSelect(this.sk, box, !b.touch);
    const items = [...r.ents.filter((id) => selOn(selClass('ent', getEntS(this.sk, id)))).map((id) => ({ kind: 'ent', id })), ...(selOn('point') ? r.pts : []).map((id) => ({ kind: 'point', id }))];
    const merged = b.shift ? [...this.selection, ...items.filter((x) => !this._isSel(x))] : items;
    this._setSel(merged); this._status(() => t('sk.box_selected', { n: items.length, mode: t(b.touch ? 'sk.box_touch' : 'sk.box_contain') }));
  }
  _selDrag(loc, ev) {
    const d = this._drag, pr = this._press; if (!d) return;
    if (!d.active) {
      if (Math.hypot(ev.clientX - pr.x, ev.clientY - pr.y) < 4) return;
      d.active = true; const ids = new Set();
      for (const it of d.items) { if (it.kind === 'point') ids.add(it.id); else { const e = this.sk.ents.find((x) => x.id === it.id); if (e) entPts(e).forEach((p) => ids.add(p)); } }
      d.orig = [...ids].map((id) => ({ id, x: this.sk.points[id].x, y: this.sk.points[id].y }));
    }
    const dx = loc[0] - d.start[0], dy = loc[1] - d.start[1];
    this._dragTarget = d.orig.map((o) => ({ id: o.id, x: o.x + dx, y: o.y + dy }));
    if (this._dragBusy) return;
    this._dragBusy = true; const sid = this._sid;
    this._q = this._q.then(async () => {
      try {
        while (this._dragTarget && this._sid === sid && this.active) {
          const t = this._dragTarget; this._dragTarget = null;
          const r = await solveSketch(this.sk, this.getVars(), t);
          if (r.ok) d.moved = true; this._renderGL(); this._buildOverlay();
        }
      } catch (e) {}
      this._dragBusy = false;
    });
  }
  _finishDrag(d) {
    const sid = this._sid;
    this._q = this._q.then(async () => {
      if (this._sid !== sid || !this.active) return;
      if (!d.moved) return;
      const r = await solveSketch(this.sk, this.getVars());
      if (!r.ok) { this._restore(d.before); this._status('sk.drag_failed'); }
      else { this._undo.push({ s: d.before }); this._redo = []; this.lastSolve = r; syncRefs(this.sk); this._statusDof(r); this._probeSoon(); }
      this._refresh();
    });
  }

  // ---- çizgi (zincir; A tuşu ile teğet yay, L tuşu ile çizgi)
  _lineClick(s) {
    const st = this._ln;
    if (!st) { this._ln = { start: s, firstPid: s.pid || null, n: 0, mode: 'line' }; this.setHint('hint.line_next'); return; }
    if (st.mode === 'arc') return this._chainArc(st, s);
    s = this._alignEnd(st.start, s);
    if (Math.hypot(s.x - st.start.x, s.y - st.start.y) < 1e-6 || (s.pid && s.pid === st.start.pid)) return; // sıfır uzunluk
    const closing = !!(s.pid && s.pid === st.firstPid);
    let aId, bId;
    const res = this._apply((sk) => {
      aId = this._ptFor(st.start);
      if (!st.firstPid) st.firstPid = aId;
      bId = this._ptFor(s, aId); // çizginin kendi başlangıcıyla hiza: çizginin yatay/dikey kısıtı yeter (nokta-nokta eklenmez)
      const l = this._addEnt({ type: 'line', a: aId, b: bId });
      // otomatik yatay/dikey (auto: Sabitle ile gereksizleşirse kaldırılır); hizalama izi zaten belirlediyse eklenmez
      if (s.align === 'h' && !hvSame(sk, aId, bId, 'h')) this._addCon('horizontal', l, undefined, { auto: true }); else if (s.align === 'v' && !hvSame(sk, aId, bId, 'v')) this._addCon('vertical', l, undefined, { auto: true });
      if (s.kind === 'tan' && s.ent && autoOn('tan')) this._addCon('tangent', l, s.ent); else if (s.kind === 'perp' && autoOn('perp') && s.ent && sk.ents.find((e) => e.id === s.ent)?.type === 'line') this._addCon('perpendicular', l, s.ent);
      st.lastEnt = l;
    }, { kind: tk('sk.kind.line') });
    st.n++;
    if (closing) { this._ln = null; this.setHint(() => t('hint.closed') + ' ' + t(HINT_KEY.line)); } else st.start = { x: s.x, y: s.y, pid: bId };
    return res;
  }
  _chainArc(st, s) {
    const pts = [st.start, s]; const err = DEFS.arct.valid(this, pts); if (err) { this._status(err); return; }
    const closing = !!(s.pid && s.pid === st.firstPid); let endPid;
    const res = this._apply(() => { DEFS.arct.commit(this, pts); endPid = this._lastPid; }, { kind: tk('sk.kind.arc') });
    st.n++; if (closing) { this._ln = null; this.setHint(() => t('hint.closed') + ' ' + t(HINT_KEY.line)); } else st.start = { x: s.x, y: s.y, pid: endPid };
    return res;
  }
  chainMode(mode) { // zincir sırasında çizgi/yay geçişi
    const st = this._ln; if (!st || this.tool !== 'line') return false;
    if (mode === 'arc' && !(st.n > 0 && st.start.pid)) { this._status('sk.arct_start'); return true; }
    st.mode = mode; this.setHint(mode === 'arc' ? 'hint.chain_arc' : 'hint.line_next'); this._renderPreview(); return true;
  }
  _endChain() { if (this._ln) { this._ln = null; this.setHint(HINT_KEY.line); this._renderPreview(); } }

  // ---- dikdörtgen
  _rectClick(s) {
    if (!this._rc) { this._rc = { c1: s }; this.setHint('hint.rect_next'); return; }
    const c1 = this._rc.c1, w = Math.abs(s.x - c1.x), h = Math.abs(s.y - c1.y);
    if (w < 1e-6 || h < 1e-6) { this._status('sk.rect_zero'); return; }
    this._rc = null; this.setHint(HINT_KEY.rect);
    this._apply(() => {
      const p1 = this._ptFor(c1), p3 = this._ptFor(s);
      const p2 = this._newPt(s.x, c1.y), p4 = this._newPt(c1.x, s.y);
      const l1 = this._addEnt({ type: 'line', a: p1, b: p2 }), l2 = this._addEnt({ type: 'line', a: p2, b: p3 });
      const l3 = this._addEnt({ type: 'line', a: p3, b: p4 }), l4 = this._addEnt({ type: 'line', a: p4, b: p1 });
      this._addCon('horizontal', l1); this._addCon('vertical', l2); this._addCon('horizontal', l3); this._addCon('vertical', l4);
    }, { kind: tk('sk.kind.rect') });
  }

  // ---- daire
  _circleClick(s) {
    if (!this._ci) { this._ci = { c: s }; this.setHint('hint.circle_next'); return; }
    const c = this._ci.c, r = Math.hypot(s.x - c.x, s.y - c.y);
    if (r < 1e-6) { this._status('sk.radius_zero'); return; }
    this._ci = null; this.setHint(HINT_KEY.circle);
    return this._apply(() => { const cp = this._ptFor(c); this._addEnt({ type: 'circle', c: cp, r }); }, { kind: tk('sk.kind.circle') }); // C-01: sonuç döner (yazılan yarıçap ölçü kısıtına bağlanır)
  }

  // ---- yay (merkez, başlangıç, bitiş; saat yönü tersi)
  _arcClick(s) {
    const st = this._ar;
    if (!st) { this._ar = { c: s }; this.setHint('hint.arc_start'); return; }
    if (!st.a) {
      if (Math.hypot(s.x - st.c.x, s.y - st.c.y) < 1e-6) { this._status('sk.radius_zero'); return; }
      st.a = s; this.setHint('hint.arc_end'); return;
    }
    const r = Math.hypot(st.a.x - st.c.x, st.a.y - st.c.y), a0 = Math.atan2(st.a.y - st.c.y, st.a.x - st.c.x), a1 = Math.atan2(s.y - st.c.y, s.x - st.c.x);
    if (norm(a1 - a0) < 1e-6 || norm(a1 - a0) > TAU - 1e-6) { this._status('sk.arc_same_dir'); return; }
    const bx = st.c.x + r * Math.cos(a1), by = st.c.y + r * Math.sin(a1);
    this._ar = null; this.setHint(HINT_KEY.arc);
    this._apply(() => {
      const cp = this._ptFor(st.c), ap = this._ptFor(st.a);
      let bp = s.pid && Math.abs(Math.hypot(s.x - st.c.x, s.y - st.c.y) - r) < 1e-6 ? s.pid : this._newPt(bx, by);
      this._addEnt({ type: 'arc', c: cp, a: ap, b: bp });
    }, { kind: tk('sk.kind.arc') });
  }

  // ---- nokta
  _pointClick(s) {
    this._apply((sk) => {
      const pid = this._ptFor(s);
      if (sk.ents.some((e) => e.type === 'point' && e.p === pid)) return () => t('sk.point_exists');
      this._addEnt({ type: 'point', p: pid });
    }, { kind: tk('sk.kind.point') });
  }

  // ---------- silme / yapı ----------
  deleteSelection() {
    if (!this.active) return;
    if (!this.selection.length) return this._status('sk.pick_first');
    const items = this.selection.filter((s) => this._selAllowed(s)); let hadO = false; // seçim filtresi kapalı türler silinmez
    if (!items.length) return this._status('sk.sel_filtered');
    if (items.every((i) => i.kind === 'point' && i.id === 'O')) return this._status('sk.origin_nodelete');
    for (const i of items) if (i.kind === 'point' && i.id === 'O') hadO = true;
    this.selection = this.selection.filter((s) => !items.includes(s)); this.hover = null;
    const res = this._apply((sk) => this._deleteItems(sk, items), { kind: tk('sk.kind.delete') });
    if (hadO) this._status('sk.origin_partial');
    this.onChange(); return res;
  }
  _deleteItems(sk, items) { return deleteItems(sk, items); }
  _deleteItemsOld(sk, items) {
    const delEnts = new Set(), delPts = new Set();
    for (const i of items) { if (i.kind === 'ent') delEnts.add(i.id); else if (i.id !== 'O') delPts.add(i.id); }
    for (const e of sk.ents) if (entPts(e).some((p) => delPts.has(p))) delEnts.add(e.id);
    const cand = new Set(delPts);
    for (const e of sk.ents) if (delEnts.has(e.id)) entPts(e).forEach((p) => cand.add(p));
    sk.ents = sk.ents.filter((e) => !delEnts.has(e.id));
    const used = new Set(); for (const e of sk.ents) entPts(e).forEach((p) => used.add(p));
    const gone = new Set([...delEnts]);
    for (const p of cand) if (p !== 'O' && !used.has(p)) { delete sk.points[p]; gone.add(p); }
    sk.cons = sk.cons.filter((c) => !conRefs(c).some((r) => gone.has(r)));
  }
  toggleConstruction() {
    if (!this.active) return;
    const ents = this.selection.filter((s) => s.kind === 'ent');
    if (!ents.length) {
      this.consMode = !this.consMode;
      return this._status(this.consMode ? 'sk.cons_on' : 'sk.cons_off');
    }
    this._apply((sk) => { for (const it of ents) { const e = sk.ents.find((x) => x.id === it.id); if (e) { if (e.cons) delete e.cons; else e.cons = true; } } }, { kind: tk('sk.kind.change') });
  }

  // ---------- kısıtlar ----------
  applyConstraint(type) {
    if (!this.active) return;
    const sel = this.selection, sk = this.sk;
    const pts = sel.filter((s) => s.kind === 'point').map((s) => s.id);
    const ents = sel.filter((s) => s.kind === 'ent').map((s) => sk.ents.find((e) => e.id === s.id)).filter(Boolean);
    const lines = ents.filter((e) => e.type === 'line'), round = ents.filter((e) => e.type === 'circle' || e.type === 'arc'), ell = ents.filter((e) => e.type === 'ellipse' || e.type === 'ellarc');
    const withCenter = ents.filter((e) => e.type === 'circle' || e.type === 'arc' || e.type === 'ellipse' || e.type === 'ellarc');
    const fail = (k, p) => { this._status(k, p); return Promise.resolve({ ok: false, msg: t(k, p) }); };
    let list = []; // eklenecek kısıtlar: [tip, a, b, extra]
    switch (type) {
      case 'horizontal': case 'vertical':
        if (lines.length && !pts.length && ents.length === lines.length) list = lines.map((l) => [type, l.id]);
        else if (pts.length === 2 && !ents.length) list = [[type + '_pp', pts[0], pts[1]]];
        else return fail(type === 'horizontal' ? 'sk.c_horizontal' : 'sk.c_vertical');
        break;
      case 'parallel': case 'perpendicular':
        if (lines.length === 2 && ents.length === 2 && !pts.length) list = [[type, lines[0].id, lines[1].id]];
        else return fail(type === 'parallel' ? 'sk.c_parallel' : 'sk.c_perpendicular');
        break;
      case 'collinear':
        if (lines.length === 2 && ents.length === 2 && !pts.length) list = [['collinear', lines[0].id, lines[1].id]]; else return fail('sk.c_collinear');
        break;
      case 'equal':
        if (!pts.length && ents.length >= 2 && (lines.length === ents.length || round.length === ents.length || ell.length === ents.length)) list = ents.slice(1).map((e) => ['equal', ents[0].id, e.id]);
        else return fail('sk.c_equal');
        break;
      case 'tangent': {
        const okPair = ents.length === 2 && !pts.length && ((lines.length === 1 && round.length === 1) || round.length === 2 || (lines.length === 1 && ell.length === 1));
        if (okPair) list = [['tangent', ents[0].id, ents[1].id]];
        else if (ents.length === 2 && !pts.length && ents.some((e) => e.type === 'spline' || ((e.type === 'ellipse' || e.type === 'ellarc') && !lines.length))) return fail('sk.c_tangent_unsup');
        else return fail('sk.c_tangent');
        break;
      }
      case 'coincident':
        if (pts.length === 2 && !ents.length) list = [['coincident', pts[0], pts[1]]]; else return fail('sk.c_coincident');
        break;
      case 'midpoint':
        if (pts.length === 1 && lines.length === 1 && ents.length === 1) list = [['midpoint', pts[0], lines[0].id]]; else return fail('sk.c_midpoint');
        break;
      case 'concentric':
        if (!pts.length && withCenter.length === 2 && ents.length === 2) {
          if (withCenter[0].c === withCenter[1].c) return fail('sk.c_concentric_same');
          list = [['coincident', withCenter[0].c, withCenter[1].c]];
        } else return fail('sk.c_concentric');
        break;
      case 'symmetric':
        if (pts.length === 2 && lines.length === 1 && ents.length === 1) list = [['symmetric', pts[0], pts[1], { c: lines[0].id }]];
        else return fail('sk.c_symmetric');
        break;
      case 'pointOn':
        if (pts.length === 1 && ents.length === 1 && (lines.length === 1 || round.length === 1 || ell.length === 1)) list = [['pointOn', pts[0], ents[0].id]]; else return fail('sk.c_pointOn');
        break;
      case 'fix': {
        const ids = new Set(pts); for (const e of ents) entPts(e).forEach((p) => ids.add(p)); ids.delete('O');
        if (!ids.size) return fail('sk.c_fix');
        this.selection = []; this.onChange();
        // WP-21 (7g): sabitlenen noktaların zaten belirlediği OTOMATİK yatay/dikey kısıtlar kaldırılır (yoksa çözücü fazla kısıt der, Sabitle reddedilirdi)
        let drop = [];
        return this._apply((s) => {
          const all = [...ids].every((i) => s.points[i].fixed);
          if (!all) { drop = autoHvRedundantAfterFix(s, ids); for (const cid of drop) { const k = s.cons.findIndex((c) => c.id === cid); if (k >= 0) s.cons.splice(k, 1); } }
          for (const i of ids) { if (all) delete s.points[i].fixed; else s.points[i].fixed = true; }
        }, { kind: tk('sk.kind.fix'), strict: true, note: () => (drop.length ? t('sk.fix_auto_dropped', { n: drop.length }) : '') });
      }
      default: return fail('sk.c_unknown', { type });
    }
    // aynısı varsa ekleme
    const sameCon = (c, t) => c.type === t[0] && ((c.a === t[1] && c.b === t[2]) || (['parallel', 'perpendicular', 'equal', 'tangent', 'coincident', 'collinear'].includes(c.type) && c.a === t[2] && c.b === t[1]));
    list = list.filter((t) => !sk.cons.some((c) => sameCon(c, t)));
    if (!list.length) return fail('sk.c_exists');
    this.selection = []; this.onChange();
    return this._apply((s) => { for (const [t, a, b, ex] of list) this._addCon(t, a, b, ex || {}); }, { strict: true, kind: tk('sk.kind.constraint') });
  }
  constraintsList() {
    if (!this.sk) return [];
    const bad = this._badSet(); const out = this.sk.cons.map((c) => ({ id: c.id, label: this._conLabel(c) + (c.ref ? ' ' + t('sk.ref_suffix') : ''), bad: bad.has(c.id) }));
    for (const [id, p] of Object.entries(this.sk.points)) if (p.fixed && id !== 'O') out.push({ id: 'fix:' + id, label: t('sk.fixed_pt', { id }) });
    return out;
  }
  _conLabel(c) {
    let s = nameOf(c.type);
    if (DIM_TYPES.has(c.type)) s += ': ' + this._dimText(c).text;
    return s + ' (' + conRefs(c).join(', ') + ')';
  }
  focusConstraint(id) { this._focusCons = new Set(this._focusCons.has(id) && this._focusCons.size === 1 ? [] : [id]); this._buildOverlay(); this.onChange(); }
  removeConstraint(id) {
    if (!this.active) return;
    if (String(id).startsWith('fix:')) { const pid = id.slice(4); if (!this.sk.points[pid]) return; return this._apply((s) => { delete s.points[pid].fixed; }, { kind: tk('sk.kind.change') }); }
    if (!this.sk.cons.some((c) => c.id === id)) return;
    return this._apply((s) => { s.cons = s.cons.filter((c) => c.id !== id); }, { kind: tk('sk.kind.change') });
  }

  // ---------- ölçü aracı ----------
  _dimDown(loc) {
    const hit = this._hit(loc);
    if (!hit) { this._setSel([]); this._status(''); this.setHint(HINT_KEY[this.tool]); return; }
    const it = { kind: hit.kind, id: hit.id };
    if (this._isSel(it)) return;
    this.selection = [...this.selection, it]; this._dimPending = true; // giriş kutusu fare bırakılınca açılır (odak kaybı olmasın)
    this._renderGL(); this.onChange();
  }
  _dimSpec(tool, sel) {
    const sk = this.sk, P = (id) => sk.points[id];
    const items = sel.map((s) => (s.kind === 'point' ? { pt: s.id } : { ent: sk.ents.find((e) => e.id === s.id) })).filter((x) => x.pt || x.ent);
    const pts = items.filter((i) => i.pt), ents = items.filter((i) => i.ent).map((i) => i.ent);
    const mid = (a, b) => [(P(a).x + P(b).x) / 2, (P(a).y + P(b).y) / 2];
    const lineLen = (l) => Math.hypot(P(l.b).x - P(l.a).x, P(l.b).y - P(l.a).y);
    if (!items.length) return null;
    if (tool === 'hdim' || tool === 'vdim') {
      const hv = tool === 'hdim' ? 'hdist' : 'vdist', k = tool === 'hdim' ? 'x' : 'y'; let a, b;
      if (items.length === 1 && ents.length === 1 && ents[0].type === 'line') { a = ents[0].a; b = ents[0].b; }
      else if (items.length === 1 && pts.length === 1) return null;
      else if (items.length === 2 && pts.length === 2) { a = pts[0].pt; b = pts[1].pt; }
      else return { error: tk('sk.dim_hv') };
      if (P(b)[k] - P(a)[k] < 0) [a, b] = [b, a];
      return { type: hv, a, b, value: P(b)[k] - P(a)[k], anchor: mid(a, b) };
    }
    if (items.length === 1) {
      if (!ents.length) return null; const e = ents[0];
      if (e.type === 'line') return { type: 'dist', a: e.a, b: e.b, value: lineLen(e), anchor: mid(e.a, e.b) };
      if (e.type === 'circle' || e.type === 'arc') {
        const r = e.type === 'circle' ? e.r : arcGeom(sk, e).r;
        if (tool === 'ddim' || (tool === 'dim' && e.type === 'circle')) return { type: 'diameter', a: e.id, value: 2 * r, anchor: entMid(sk, e) };
        return { type: 'radius', a: e.id, value: r, anchor: entMid(sk, e) };
      }
      if (e.type === 'ellipse' || e.type === 'ellarc') return { type: 'radius', a: e.id, value: Math.abs(e.rmin), anchor: entMid(sk, e) };
      return { error: tk('sk.dim_none') };
    }
    if (items.length === 2) {
      if (pts.length === 2) return { type: 'dist', a: pts[0].pt, b: pts[1].pt, value: Math.hypot(P(pts[0].pt).x - P(pts[1].pt).x, P(pts[0].pt).y - P(pts[1].pt).y), anchor: mid(pts[0].pt, pts[1].pt) };
      if (pts.length === 1 && ents.length === 1 && ents[0].type === 'line') {
        const l = ents[0], p = P(pts[0].pt);
        if (l.a === pts[0].pt || l.b === pts[0].pt) return { error: tk('sk.dim_own_end') };
        const pr = segProj([p.x, p.y], P(l.a), P(l.b)); const dx = P(l.b).x - P(l.a).x, dy = P(l.b).y - P(l.a).y;
        const dist = Math.abs(((p.x - P(l.a).x) * dy - (p.y - P(l.a).y) * dx) / (Math.hypot(dx, dy) || 1));
        return { type: 'pldist', a: pts[0].pt, b: l.id, value: dist, anchor: [(p.x + pr.x) / 2, (p.y + pr.y) / 2] };
      }
      if (ents.length === 2 && ents[0].type === 'line' && ents[1].type === 'line') {
        const [l1, l2] = ents; let a = l1, b = l2;
        const ang = (l) => Math.atan2(P(l.b).y - P(l.a).y, P(l.b).x - P(l.a).x);
        if (Math.abs(Math.sin(ang(l2) - ang(l1))) < 1e-7) { // paralel çizgiler: aralarındaki uzaklık
          const m1 = entMid(sk, l1), m2 = entMid(sk, l2); return { type: 'lldist', a: l1.id, b: l2.id, value: measureDim(sk, { type: 'lldist', a: l1.id, b: l2.id }), anchor: [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2] };
        }
        let v = ((ang(b) - ang(a)) / DEG) % 360; if (v > 180) v -= 360; if (v <= -180) v += 360;
        if (v < 0) { [a, b] = [b, a]; v = -v; }
        const m1 = entMid(sk, a), m2 = entMid(sk, b);
        return { type: 'angle', a: a.id, b: b.id, value: v, anchor: [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2] };
      }
      const cc = ents.filter((e) => e.type === 'circle' || e.type === 'arc' || e.type === 'ellipse' || e.type === 'ellarc');
      if (ents.length === 2 && cc.length === 2) { const m = (e) => [P(e.c).x, P(e.c).y]; const a = m(cc[0]), b = m(cc[1]); return { type: 'ccdist', a: cc[0].id, b: cc[1].id, value: Math.hypot(a[0] - b[0], a[1] - b[1]), anchor: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; }
    }
    return { error: tk('sk.dim_between') };
  }
  _dimEval() {
    const spec = this._dimSpec(this.tool, this.selection);
    if (!spec) return 'wait';
    if (spec.error) { this._status(spec.error); return 'bad'; }
    // aynı ölçü varsa onu düzenle
    const ex = this.sk.cons.find((c) => c.type === spec.type && ((c.a === spec.a && c.b === spec.b) || (spec.b && c.a === spec.b && c.b === spec.a && spec.type !== 'angle')));
    if (ex) { this._status('sk.dim_exists'); this._editDim(ex.id); return 'ok'; }
    this._openInput({
      anchor: spec.anchor, text: fmt(spec.value), label: nameOf(spec.type),
      submit: (txt, asRef) => this._dimSubmit(spec, txt, asRef),
    });
    this._status('sk.dim_prompt', { name: nameOf(spec.type) });
    return 'ok';
  }
  _evalDim(type, txt) {
    let v; try { v = evalExpr(txt, this.getVars()); } catch (e) { return { err: t('sk.bad_expr', { msg: errText(e) }) }; }
    if (['dist', 'pldist', 'lldist', 'ccdist', 'radius', 'diameter'].includes(type) && !(v > 0)) return { err: t('sk.dim_pos') };
    if (type === 'angle' && (v === 0 || Math.abs(v) >= 360)) return { err: t('sk.angle_range') };
    return { v };
  }
  async _dimSubmit(spec, txt, asRef = false) {
    const e = this._evalDim(spec.type, txt); if (e.err) { this._status(() => e.err); return e.err; }
    this.selection = []; this.onChange();
    // referans (sürülen) ölçü: değeri çözümden değil geometriden okunur, çözücüyü kısıtlamaz
    const addRef = () => this._apply((sk) => { const c = { type: spec.type, a: spec.a, expr: '0', ref: true }; if (spec.b !== undefined) c.b = spec.b; const m = measureDim(sk, c); if (Number.isFinite(m)) c.expr = String(+m.toFixed(6)); this._addCon(c.type, c.a, c.b, { expr: c.expr, ref: true }); }, { kind: tk('sk.kind.dim') });
    if (asRef) { const r = await addRef(); if (r.ok) this._status('sk.dim_made_ref'); return r.ok ? null : r.msg; }
    const r = await this._apply((sk) => { this._addCon(spec.type, spec.a, spec.b, { expr: String(txt).trim() }); }, { strict: true, kind: tk('sk.kind.dim') });
    if (r.ok) return null;
    if (r.over && SKO.autoRef) { const r2 = await addRef(); if (r2.ok) { this._status('sk.dim_made_ref'); return null; } }
    if (r.over) { const m = r.msg; this._status(() => m + ' ' + t('sk.over_hint')); }
    return r.msg;
  }
  _editDim(id) {
    const c = this.sk.cons.find((x) => x.id === id); if (!c) return;
    const m = this._dimAnchor(c);
    this._openInput({
      anchor: m, text: String(c.expr), label: nameOf(c.type),
      submit: async (txt) => {
        const e = this._evalDim(c.type, txt); if (e.err) { this._status(() => e.err); return e.err; }
        const r = await this._apply((sk) => { const k = sk.cons.find((x) => x.id === id); k.expr = String(txt).trim(); }, { strict: true, kind: tk('sk.kind.dim') });
        return r.ok ? null : r.msg;
      },
    });
  }
  _openInput({ anchor, text, submit, label }) {
    this._closeInput();
    const inp = document.createElement('input'); inp.type = 'text'; inp.value = text; inp.className = 'sk-input'; inp.title = label || '';
    inp.style.cssText = 'position:absolute;transform:translate(-50%,-50%);pointer-events:auto;z-index:5;';
    let busy = false;
    inp.addEventListener('keydown', async (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { this._closeInput(); this._setSel([]); }
      else if (ev.key === 'Enter') {
        ev.preventDefault(); if (busy) return; busy = true;
        const err = await submit(inp.value, ev.ctrlKey || ev.metaKey); busy = false; // Ctrl+Enter: referans ölçü olarak ekle
        if (err) inp.classList.add('bad'); else this._closeInput();
      }
    });
    inp.addEventListener('input', () => { inp.classList.remove('bad'); });
    inp.addEventListener('blur', () => setTimeout(() => { if (this._input === inp && !busy) this._closeInput(); }, 150));
    this.ovl.appendChild(inp); this._input = inp; this._inputAnchor = anchor; this._posInput();
    inp.focus(); inp.select();
  }
  _closeInput() { if (this._input) { const i = this._input; this._input = null; i.remove(); } }
  _posInput() {
    if (!this._input) return; const [x, y] = this._px(this._inputAnchor);
    this._input.style.left = x + 'px'; this._input.style.top = y - 24 + 'px';
  }

  // ---------- klavye ----------
  handleKey(ev) {
    if (!this.active) return false;
    const t0 = ev.target; if (t0 && (t0.tagName === 'INPUT' || t0.tagName === 'TEXTAREA' || t0.tagName === 'SELECT' || t0.isContentEditable)) return false;
    const k = ev.key, mod = ev.ctrlKey || ev.metaKey;
    const done = () => { ev.preventDefault && ev.preventDefault(); return true; };
    if (mod) {
      const l = k.toLowerCase();
      if (l === 'z' && !ev.shiftKey) { this.undo(); return done(); }
      if (l === 'y' || (l === 'z' && ev.shiftKey)) { this.redo(); return done(); }
      if (l === 'a') { this.selectAll(); return done(); }
      if (l === 'c') { this.copyClip(); return done(); }
      if (l === 'x') { this.cutClip(); return done(); }
      if (l === 'v') { this.pasteClip(); return done(); }
      return false;
    }
    if (ev.altKey) return false;
    if (k === 'Escape') {
      if (this._ctxEl) this._hideCtx();
      else if (this._dlg) this._closeDialog();
      else if (this._input) this._closeInput();
      else if (this._hasStage()) this._cancelStage();
      else if (this.tool !== 'select') this.setTool('select');
      else if (this.selection.length) this._setSel([]);
      else return false;
      return done();
    }
    if (k === 'Enter') { if (this._sp) { this._finishSpline(); return done(); } if (this._mir && this._mir.phase === 1) { this._mirNext(); return done(); } if (this._repeatLast(t0)) return done(); return false; }
    if (k === ' ' && this._repeatLast(t0)) return done();
    if (k === 'Delete' || k === 'Backspace') { this.deleteSelection(); return done(); }
    // sayısal giriş: çizerken uzunluk/açı yazılır
    if (/^[0-9.,]$/.test(k) && this._numericStart(k)) return done();
    // C-07: harf kısayolları düzen bağımsız: Latin olmayan düzende (ör. 'з') fiziksel tuş koduna (KeyP) düşülür
    let lk = k.toLowerCase(); if (!/^[a-z]$/.test(lk) && /^Key[A-Z]$/.test(ev.code || '')) lk = ev.code.slice(3).toLowerCase();
    if (lk === 'n' && this._coordStart()) return done(); // N: koordinat girişi (mutlak X,Y ya da bağıl ΔX,ΔY)
    if (this._ln && this.tool === 'line' && (lk === 'a' || lk === 'l')) { this.chainMode(lk === 'a' ? 'arc' : 'line'); return done(); }
    const map = { l: 'line', r: 'rect', c: 'circle', a: 'arc', d: 'dim', p: 'point', t: 'trim', x: 'extend', k: 'break', o: 'offset', q: 'fillet', w: 'chamfer', m: 'mirror', g: 'polygon', u: 'slot', y: 'ellipse', b: 'spline', j: 'project' };
    const shiftMap = { r: 'rectc', c: 'circle3', a: 'arc3' };
    const tool = ev.shiftKey && shiftMap[lk] ? shiftMap[lk] : map[lk];
    if (tool) { this.setTool(tool); return done(); }
    return false;
  }

  // ---------- çizim (three.js) ----------
  _clearGroup(g) { if (!g) return; for (const o of [...g.children]) { g.remove(o); o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); } }
  _refresh() { if (!this.active) return; this._renderGL(); this._buildOverlay(); this.onChange(); }
  _onCamera() {
    if (!this.active) return;
    const w = this.vp.worldPerPixel(); if (Math.abs(w / (this._lastWpp || w) - 1) > 0.03) { this._renderGL(); this._renderPreview(); }
    this._posOverlay(); this._posInput(); if (this.cursor) this._posTip(); this._posSnap();
  }
  _renderGL() {
    if (!this.active) return; this._clearGroup(this.gMain);
    const wpp = this.vp.worldPerPixel(); this._lastWpp = wpp; const sk = this.sk;
    const fully = this.lastSolve && this.lastSolve.dof === 0 && sk.ents.some((e) => !e.cons);
    const fr = this.free; const entDark = (e) => fully || (fr && fr.freeEnts && !fr.freeEnts.has(e.id)); const ptDark = (id) => fully || (fr && fr.freePts && !fr.freePts.has(id));
    try {
      for (const r of findRegions(sk).regions) {
        const shape = new THREE.Shape(r.poly.map((p) => new THREE.Vector2(p[0], p[1])));
        for (const h of r.holes) shape.holes.push(new THREE.Path(h.poly.map((p) => new THREE.Vector2(p[0], p[1]))));
        const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: COL.region, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthTest: false }));
        m.renderOrder = 1; m.userData.region = true; this.gMain.add(m);
      }
    } catch (e) {}
    const isSel = (k, id) => this.selection.some((s) => s.kind === k && s.id === id), isHov = (k, id) => this.hover && this.hover.kind === k && this.hover.id === id;
    for (const s of sketchPolylines(sk)) {
      const e = s.e, sel = isSel('ent', e.id), hov = isHov('ent', e.id);
      const lost = !!(e.proj && e.proj.lost); // kaynağını yitirmiş izdüşüm: ayrı renk ve sık kesikli çizgi
      const color = sel ? COL.cons : hov ? COL.hover : lost ? COL.err : e.cons ? COL.sketchDim : entDark(e) ? COL.dark : COL.sketch;
      const geo = new THREE.BufferGeometry().setFromPoints(s.pts.map((p) => new THREE.Vector3(p[0], p[1], 0)));
      const mat = e.cons ? new THREE.LineDashedMaterial({ color, dashSize: (lost ? 2.5 : 7) * wpp, gapSize: (lost ? 3 : 4) * wpp, depthTest: false }) : new THREE.LineBasicMaterial({ color, depthTest: false });
      const line = new THREE.Line(geo, mat); if (e.cons) line.computeLineDistances();
      line.renderOrder = 4; line.userData.ent = e.id; if (lost) line.userData.lost = true; this.gMain.add(line);
    }
    const pos = [], col = [], c = new THREE.Color();
    for (const [id, p] of Object.entries(sk.points)) {
      pos.push(p.x, p.y, 0);
      c.set(isSel('point', id) ? COL.cons : isHov('point', id) ? COL.hover : id === 'O' ? COL.err : p.fixed ? COL.dark : ptDark(id) ? COL.dark : COL.sketch); col.push(c.r, c.g, c.b);
    }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, depthTest: false })); pts.renderOrder = 6; pts.frustumCulled = false; this.gMain.add(pts);
    this.vp.dirty = true;
  }

  // ön izleme (lastik bant) ve canlı ölçü
  _line(pts, color, dashed) {
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p[0], p[1], 0)));
    const wpp = this.vp.worldPerPixel();
    const l = new THREE.Line(geo, dashed ? new THREE.LineDashedMaterial({ color, dashSize: 5 * wpp, gapSize: 4 * wpp, depthTest: false }) : new THREE.LineBasicMaterial({ color, depthTest: false }));
    if (dashed) l.computeLineDistances(); l.renderOrder = 7; this.gPrev.add(l);
  }
  _renderPreview() {
    if (!this.active) return; this._clearGroup(this.gPrev);
    const cur = this.cursor, tool = this.tool; let tip = '';
    if (EDIT_TOOLS.includes(tool)) { this._editPreview(cur); this.vp.dirty = true; return; }
    if (UL_TOOLS.includes(tool)) { this._ulPreview(cur); this.vp.dirty = true; return; }
    if (!cur || tool === 'select' || DIM_TOOLS.includes(tool)) { this._hideTip(); this._hideSnap(); this.vp.dirty = true; return; }
    let s = cur; const B = COL.sketch;
    if (DEFS[tool] && this._ds) {
      const r = DEFS[tool].preview(this, this._ds.pts, cur); for (const pl of r.polys) this._line(pl.pts, B, pl.dashed); tip = r.tip || '';
    } else if (tool === 'spline' && this._sp) {
      const pts = [...this._sp.pts.map((p) => [p.x, p.y]), [cur.x, cur.y]].filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-9);
      if (pts.length >= 2) { try { this._line(G.sample(G.mkSpline(pts, false), 0.02), B); } catch (e) { this._line(pts, B, true); } }
      tip = pts.length + ' ' + t('sk.spline_pts');
    } else if (tool === 'line' && this._ln && this._ln.mode === 'arc') {
      const r = DEFS.arct.preview(this, [this._ln.start, cur], cur); for (const pl of r.polys) this._line(pl.pts, B, pl.dashed); tip = r.tip || '';
    } else if (tool === 'line' && this._ln) {
      s = this._alignEnd(this._ln.start, cur); const a = this._ln.start;
      this._line([[a.x, a.y], [s.x, s.y]], B);
      const len = Math.hypot(s.x - a.x, s.y - a.y); tip = fmt(len) + ' mm  ' + fmt(Math.atan2(s.y - a.y, s.x - a.x) / DEG) + '°';
      if (s.align) tip += s.align === 'h' ? t('sk.tip_h') : t('sk.tip_v');
    } else if (tool === 'rect' && this._rc) {
      const a = this._rc.c1; this._line([[a.x, a.y], [s.x, a.y], [s.x, s.y], [a.x, s.y], [a.x, a.y]], B);
      tip = fmt(Math.abs(s.x - a.x)) + ' × ' + fmt(Math.abs(s.y - a.y)) + ' mm';
    } else if (tool === 'circle' && this._ci) {
      const c = this._ci.c, r = Math.hypot(s.x - c.x, s.y - c.y); this._line(arcPts([c.x, c.y], r, 0, TAU), B); this._line([[c.x, c.y], [s.x, s.y]], B, true); tip = 'R ' + fmt(r) + '  Ø ' + fmt(2 * r) + ' mm';
    } else if (tool === 'arc' && this._ar) {
      const st = this._ar, c = st.c;
      if (!st.a) { const r = Math.hypot(s.x - c.x, s.y - c.y); this._line([[c.x, c.y], [s.x, s.y]], B, true); tip = 'R ' + fmt(r) + ' mm'; }
      else {
        const r = Math.hypot(st.a.x - c.x, st.a.y - c.y), a0 = Math.atan2(st.a.y - c.y, st.a.x - c.x), a1 = Math.atan2(s.y - c.y, s.x - c.x); let sw = norm(a1 - a0); if (sw < 1e-6) sw = TAU;
        this._line(arcPts([c.x, c.y], r, a0, sw), B); this._line([[c.x, c.y], [st.a.x, st.a.y]], B, true); this._line([[c.x, c.y], [c.x + r * Math.cos(a1), c.y + r * Math.sin(a1)]], B, true);
        tip = 'R ' + fmt(r) + '  ' + fmt(sw / DEG) + '°';
      }
    }
    // yakalama işareti (uç, orta, merkez, kesişim, teğet, dik, nesne üstü)
    this._showSnap(s); this._drawTraces(s);
    this._tipLoc = [s.x, s.y];
    if (tip) { this._showTip(tip); } else this._hideTip();
    this.vp.dirty = true;
  }
  _showTip(text) {
    if (!this._tip) { this._tip = document.createElement('div'); this._tip.className = 'sk-tip'; this._tip.style.cssText = 'position:absolute;pointer-events:none;'; this.ovl.appendChild(this._tip); }
    this._tip.textContent = text; this._tip.style.display = ''; this._posTip();
  }
  _hideTip() { if (this._tip) this._tip.style.display = 'none'; }
  _showSnap(s) {
    if (!s || !s.kind || s.kind === 'grid' || s.kind === 'free') return this._hideSnap();
    if (!this._snapEl) { this._snapEl = document.createElement('div'); this._snapEl.className = 'sk-snap'; this.ovl.appendChild(this._snapEl); this._snapLbl = document.createElement('span'); this._snapEl.appendChild(this._snapLbl); }
    this._snapEl.className = 'sk-snap k-' + s.kind; this._snapLbl.textContent = t(SNAP_LABEL[s.kind] || 'snap.on'); this._snapEl.style.display = ''; this._snapLoc = [s.x, s.y]; this._posSnap();
  }
  _hideSnap() { if (this._snapEl) this._snapEl.style.display = 'none'; this._snapLoc = null; }
  _posSnap() { if (!this._snapEl || !this._snapLoc) return; const [x, y] = this._px(this._snapLoc); this._snapEl.style.left = x + 'px'; this._snapEl.style.top = y + 'px'; }
  _posTip() { if (!this._tip || !this._tipLoc) return; const [x, y] = this._px(this._tipLoc); this._tip.style.left = x + 14 + 'px'; this._tip.style.top = y + 14 + 'px'; }
  _px(loc) { return this.vp.project(V.toWorld(this.plane, loc[0], loc[1])); }

  // ---------- ölçü etiketleri ve kısıt rozetleri ----------
  _dimText(c) {
    let v = null, bad = false; if (!c.ref) { try { v = evalExpr(c.expr, this.getVars()); } catch (e) { bad = true; } }
    const pre = c.type === 'diameter' ? 'Ø' : c.type === 'radius' ? 'R' : '', suf = c.type === 'angle' ? '°' : '';
    const e = String(c.expr).trim();
    if (c.ref) { const m = measureDim(this.sk, c); return { text: '(' + pre + (Number.isFinite(m) ? fmt(m) : '?') + suf + ')', bad: false }; }
    const text = bad ? pre + e + ' ?' : numeric(e) ? pre + fmt(v) + suf : pre + e + ' = ' + fmt(v) + suf;
    return { text, bad };
  }
  _dimAnchor(c) { // yerel konum
    const sk = this.sk, P = (id) => sk.points[id], ent = (id) => sk.ents.find((e) => e.id === id);
    try {
      if (['dist', 'hdist', 'vdist'].includes(c.type)) return [(P(c.a).x + P(c.b).x) / 2, (P(c.a).y + P(c.b).y) / 2];
      if (c.type === 'pldist') { const l = ent(c.b), p = P(c.a), pr = segProj([p.x, p.y], P(l.a), P(l.b)); return [(p.x + pr.x) / 2, (p.y + pr.y) / 2]; }
      if (c.type === 'radius' || c.type === 'diameter') return entMid(sk, ent(c.a));
      if (c.type === 'lldist') { const m1 = entMid(sk, ent(c.a)), m2 = entMid(sk, ent(c.b)); return [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2]; }
      if (c.type === 'ccdist') { const a = P(ent(c.a).c), b = P(ent(c.b).c); return [(a.x + b.x) / 2, (a.y + b.y) / 2]; }
      if (c.type === 'radiusdiff') return entMid(sk, ent(c.b));
      if (c.type === 'angle') { const m1 = entMid(sk, ent(c.a)), m2 = entMid(sk, ent(c.b)); return [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2]; }
    } catch (e) {}
    return [0, 0];
  }
  _conAnchor(c) {
    const sk = this.sk, P = (id) => sk.points[id], ent = (id) => sk.ents.find((e) => e.id === id);
    const item = (id) => (P(id) ? [P(id).x, P(id).y] : ent(id) ? entMid(sk, ent(id)) : [0, 0]);
    try {
      if (c.type === 'horizontal_pp' || c.type === 'vertical_pp' || c.type === 'symmetric') { const a = item(c.a), b = item(c.b); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
      return item(c.a);
    } catch (e) { return [0, 0]; }
  }
  _buildOverlay() {
    if (!this.active) return;
    for (const el of [...this.ovl.children]) if (el !== this._input && el !== this._tip && el !== this._snapEl && el !== this._dlg && el !== this._ctxEl && el !== this._cfEl) el.remove();
    this._ovEls = [];
    for (const c of this.sk.cons) {
      if (!conRefs(c).every((r) => r in this.sk.points || this.sk.ents.some((e) => e.id === r))) continue;
      const el = document.createElement('div');
      if (DIM_TYPES.has(c.type)) {
        const d = this._dimText(c); el.className = 'dim' + (d.bad ? ' bad' : '') + (c.ref ? ' ref' : '') + (this._focusCons.has(c.id) ? ' focus' : ''); el.textContent = d.text; el.title = t(c.ref ? 'sk.dim_ref_tip' : 'sk.dim_tip', { name: nameOf(c.type) });
        el.addEventListener('dblclick', (ev) => { ev.stopPropagation(); if (!c.ref) this._editDim(c.id); });
        el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); this._dimMenu(ev, c); });
        el.addEventListener('mousedown', (ev) => { if (ev.button === 0) this._dimDrag(ev, c, el); });
        const base = this._dimAnchor(c); el._base = base; el._loc = c.lo ? [base[0] + c.lo[0], base[1] + c.lo[1]] : base; el._off = c.lo ? [0, 0] : this._dimOffset(c);
      } else {
        el.className = 'cbadge' + (this._focusCons.has(c.id) ? ' focus' : ''); el.textContent = GLYPH[c.type] || '?'; el.title = t('sk.con_tip', { name: nameOf(c.type) });
        el.addEventListener('click', (ev) => { ev.stopPropagation(); this.removeConstraint(c.id); });
        el._loc = this._conAnchor(c); el._off = [0, -13];
      }
      el.dataset.con = c.id; el.style.pointerEvents = this.tool === 'select' ? 'auto' : 'none'; this.ovl.appendChild(el); this._ovEls.push(el);
    }
    this._posOverlay();
  }
  _dimDrag(ev, c, el) {
    ev.preventDefault(); ev.stopPropagation(); const x0 = ev.clientX, y0 = ev.clientY; let moved = false, last = null;
    const mv = (e) => {
      if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return; moved = true;
      const loc = this.vp.rayToPlane(e, this.plane); if (!loc) return; last = loc; el._loc = loc; el._off = [0, 0]; this._posOverlay();
    };
    const up = (e) => {
      window.removeEventListener('mousemove', mv, true); window.removeEventListener('mouseup', up, true);
      // C-02: sürüklenmeden bırakılan tıklama etiketin altındaki nokta/nesneye iletilir (etiket nokta yakalamayı engellemez)
      if (!moved) { const loc = this._loc(e); if (loc && this.tool === 'select' && this._hit(loc)) { this._pointer('down', e); this._pointer('up', e); } return; }
      if (moved && last) { const base = el._base; this._apply((sk) => { const k = sk.cons.find((x) => x.id === c.id); if (k) k.lo = [last[0] - base[0], last[1] - base[1]]; }, { kind: tk('sk.kind.change') }); }
    };
    window.addEventListener('mousemove', mv, true); window.addEventListener('mouseup', up, true);
  }
  _dimOffset(c) { return c.type === 'radius' || c.type === 'diameter' ? [14, -14] : c.type === 'hdist' ? [0, -16] : c.type === 'vdist' ? [22, 0] : c.type === 'dist' ? [0, 16] : [0, 0]; }
  _posOverlay() {
    if (!this._ovEls) return; const placed = [];
    for (const el of this._ovEls) {
      const [x0, y0] = this._px(el._loc); let x = x0 + el._off[0], y = y0 + el._off[1];
      const w = el.offsetWidth || 20, h = el.offsetHeight || 16;
      for (let i = 0; i < 30 && placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 1 && Math.abs(p.y - y) < (p.h + h) / 2 + 1); i++) x += w + 3;
      placed.push({ x, y, w, h }); el.style.left = x + 'px'; el.style.top = y + 'px';
    }
  }
  // ---------- DXF ----------
  importDxf(parsed, scale) {
    let rep = null;
    return this._apply((sk) => { rep = dxfToSketch(parsed, sk, { scale }); if (!rep.count) return () => t('dxf.empty'); }, { kind: tk('sk.kind.dxf') })
      .then((r) => { if (r.ok) { this._setSel([]); this.vp.fit(); } return { ...r, rep }; });
  }
  exportDxf(version) { return sketchToDxf(this.sk, { version }); }

  // Eskizden çıkarken bilgi amaçlı uyarılar (engellemez)
  exitReport() {
    const out = []; const sk = this.sk; if (!sk || !sk.ents.length) return out;
    try {
      const fr = findRegions(sk);
      if (fr.open) { const n = fr.issues.filter((i) => i.code === 'unclosed' || i.code === 'dangling').length; out.push(t('sk.exit.open', { n: Math.max(1, n) })); }
      else if (!fr.regions.length && sk.ents.some((e) => !e.cons && e.type !== 'point')) out.push(t('sk.exit.noprofile'));
      const dups = fr.issues.filter((i) => i.code === 'duplicate'); if (dups.length) out.push(t('sk.exit.dup', { n: dups.length }));
    } catch (e) { /* profil denetimi başarısız: uyarı verme */ }
    const r = this.lastSolve; if (r && r.ok && r.dof > 0) out.push(t('sk.exit.dof', { n: r.dof }));
    return out;
  }
}

Object.assign(Sketcher.prototype, EDIT_METHODS, COMFORT_METHODS, TEXT_METHODS, UNDERLAY_METHODS);
