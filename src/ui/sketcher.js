// Sketch düzenleme ortamı: çizim araçları, yakalama, kısıtlar, ölçüler, geri al/yinele.
import { THREE, COL, planeMatrix, sketchPolylines } from './viewport.js';
import { solveSketch } from './solver.js';
import { findRegions, arcGeom } from '../shared/profiles.js';
import { evalExpr } from '../shared/expr.js';
import { t, tk, errText, fmtNum } from '../shared/i18n.js';
import { toErr } from '../shared/errors.js';
import * as V from '../shared/vec.js';

const SNAP_PX = 8, ANG_TOL = 3, TAU = Math.PI * 2, DEG = Math.PI / 180;
const TOOLS = ['select', 'line', 'rect', 'circle', 'arc', 'point', 'dim', 'hdim', 'vdim'];
const DIM_TYPES = new Set(['dist', 'hdist', 'vdist', 'pldist', 'radius', 'diameter', 'angle']);
// Kısıt adları sözlük anahtarıdır (con.<tip>); metin t() ile üretilir.
const NAME_KEY = {
  horizontal: tk('con.horizontal'), vertical: tk('con.vertical'), horizontal_pp: tk('con.horizontal_pp'), vertical_pp: tk('con.vertical_pp'), coincident: tk('con.coincident'),
  parallel: tk('con.parallel'), perpendicular: tk('con.perpendicular'), equal: tk('con.equal'), tangent: tk('con.tangent'), pointOn: tk('con.pointOn'), midpoint: tk('con.midpoint'), symmetric: tk('con.symmetric'),
  dist: tk('con.dist'), hdist: tk('con.hdist'), vdist: tk('con.vdist'), pldist: tk('con.pldist'), radius: tk('con.radius'), diameter: tk('con.diameter'), angle: tk('con.angle'),
};
const nameOf = (type) => (NAME_KEY[type] ? t(NAME_KEY[type]) : type);
const GLYPH = { horizontal: 'H', vertical: 'V', horizontal_pp: 'H', vertical_pp: 'V', coincident: '●', parallel: '∥', perpendicular: '⊥', equal: '=', tangent: 'T', pointOn: '◦', midpoint: 'M', symmetric: '⇋' };
const HINT_KEY = {
  select: tk('hint.select'), line: tk('hint.line'), rect: tk('hint.rect'), circle: tk('hint.circle'), arc: tk('hint.arc'), point: tk('hint.point'),
  dim: tk('hint.dim'), hdim: tk('hint.hdim'), vdim: tk('hint.vdim'),
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const fmt = (v) => fmtNum(Number(v), 3);
const norm = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };
const normId = (id) => String(id).replace(/_(b|rules)$/, '');
const entPts = (e) => (e.type === 'line' ? [e.a, e.b] : e.type === 'circle' ? [e.c] : e.type === 'arc' ? [e.c, e.a, e.b] : e.type === 'point' ? [e.p] : []);
const conRefs = (c) => [c.a, c.b, c.c].filter(Boolean);
const numeric = (s) => /^[-+]?\d*[.,]?\d+$/.test(String(s).trim());

function segProj(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let t = l2 > 1e-18 ? ((p[0] - a.x) * dx + (p[1] - a.y) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const x = a.x + dx * t, y = a.y + dy * t; return { d: Math.hypot(p[0] - x, p[1] - y), x, y };
}
// nesneye en yakın nokta ve uzaklık
function entDist(sk, e, p) {
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
  if (e.type === 'line') { const a = sk.points[e.a], b = sk.points[e.b]; return [(a.x + b.x) / 2, (a.y + b.y) / 2]; }
  if (e.type === 'circle') { const c = sk.points[e.c]; return [c.x + e.r * Math.SQRT1_2, c.y + e.r * Math.SQRT1_2]; }
  if (e.type === 'arc') { const g = arcGeom(sk, e), t = g.a0 + g.sweep / 2; return [g.c.x + g.r * Math.cos(t), g.c.y + g.r * Math.sin(t)]; }
  if (e.type === 'point') { const p = sk.points[e.p]; return [p.x, p.y]; }
  return [0, 0];
}
const arcPts = (c, r, a0, sweep) => { const n = Math.max(8, Math.ceil((Math.abs(sweep) / TAU) * 72)), out = []; for (let i = 0; i <= n; i++) { const t = a0 + (sweep * i) / n; out.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]); } return out; };

export class Sketcher {
  constructor({ viewport, overlayEl, getVars, setHint, setStatus, onChange } = {}) {
    this.vp = viewport; this.overlayEl = overlayEl; this.getVars = getVars || (() => ({}));
    this._setHint = setHint || (() => {}); this._setStatus = setStatus || (() => {}); this.onChange = onChange || (() => {});
    this._hintSpec = null; this._statusSpec = null;
    this.active = false; this.tool = 'select'; this.selection = []; this.lastSolve = null;
    this.sk = null; this.consMode = false; this._q = Promise.resolve(); this._sid = 0;
  }

  // ---------- yaşam döngüsü ----------
  start(feature, plane) {
    if (this.active) this._teardown();
    this._sid++;
    this.feature = clone(feature || {}); this.plane = plane;
    const sk = { points: this.feature.points || {}, ents: this.feature.ents || [], cons: this.feature.cons || [] };
    if (!sk.points.O) sk.points.O = { x: 0, y: 0, fixed: true };
    sk.points.O.x = 0; sk.points.O.y = 0; sk.points.O.fixed = true;
    this.sk = sk; this._undo = []; this._redo = []; this.selection = []; this.hover = null; this.cursor = null; this.consMode = false;
    this.root = new THREE.Group(); this.root.matrixAutoUpdate = false; this.root.matrix.copy(planeMatrix(plane));
    this.gMain = new THREE.Group(); this.gPrev = new THREE.Group(); this.root.add(this.gMain, this.gPrev);
    this.vp.editGroup.add(this.root);
    this.ovl = document.createElement('div'); this.ovl.className = 'sk-ovl'; this.ovl.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.overlayEl.appendChild(this.ovl);
    this._prevPtr = this.vp.onPointer; this._prevCam = this.vp.onCamera;
    this.vp.onPointer = (t, e) => this._pointer(t, e);
    this.vp.onCamera = () => { this._prevCam && this._prevCam(); this._onCamera(); };
    this.active = true; this.tool = 'select'; this._resetDraw();
    this.vp.lookAtPlane(plane); this.vp.fit();
    this.setHint(HINT_KEY.select);
    this._refresh();
    const sid = this._sid;
    this._q = this._q.then(async () => {
      if (this._sid !== sid || !this.active) return;
      try { const r = await solveSketch(this.sk, this.getVars()); this.lastSolve = r; this._statusDof(r); } catch (e) { this._status('sk.solve_failed', { msg: errText(e) }); }
      this._refresh();
    });
    return this._q;
  }
  stop() {
    if (!this.active) return null;
    const out = { ...this.feature, points: clone(this.sk.points), ents: clone(this.sk.ents), cons: clone(this.sk.cons) };
    this._teardown(); return out;
  }
  cancel() { if (this.active) this._teardown(); }
  _teardown() {
    this._closeInput(); this._sid++;
    this.active = false;
    for (const g of [this.gMain, this.gPrev]) this._clearGroup(g);
    this.vp.editGroup.remove(this.root); this.ovl.remove();
    this.vp.onPointer = this._prevPtr || null; this.vp.onCamera = this._prevCam || null;
    this.vp.renderer.domElement.style.cursor = '';
    this.selection = []; this._resetDraw(); this.setHint(''); this.vp.dirty = true; this.onChange();
  }
  idle() { return this._q; }

  // ---------- araçlar ----------
  setTool(name) {
    if (!TOOLS.includes(name)) return;
    this._closeInput(); this._resetDraw(); this.tool = name;
    this.vp.renderer.domElement.style.cursor = name === 'select' ? 'default' : 'crosshair';
    this.setHint(HINT_KEY[name]);
    if (['dim', 'hdim', 'vdim'].includes(name) && this.selection.length) this._dimEval(); else if (name !== 'select' && this.selection.length && !['dim', 'hdim', 'vdim'].includes(name)) this.selection = [];
    this._renderGL(); this._renderPreview(); this.onChange();
  }
  _resetDraw() { this._ln = null; this._rc = null; this._ci = null; this._ar = null; this._press = null; this._drag = null; this._dragTarget = null; this._rdown = null; if (this.gPrev) { this._clearGroup(this.gPrev); this._hideTip(); } }

  // ---------- kimlik / durum ----------
  _id(prefix) {
    const sk = this.sk; let n = 1;
    const used = (id) => id in sk.points || sk.ents.some((e) => e.id === id) || sk.cons.some((c) => c.id === id) || (this._reserved && this._reserved.has(id));
    while (used(prefix + n) || used(prefix + n + '_b') || used(prefix + n + '_rules')) n++;
    return prefix + n;
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
  relang() {
    this.setHint(this._hintSpec); this._status(this._statusSpec);
    if (this.active) { this._buildOverlay(); this.onChange(); }
  }
  _statusDof(r) {
    if (!this.sk.ents.length) return this._status('sk.empty');
    const red = !!(r.redundant && r.redundant.length);
    this._status(() => (r.dof === 0 ? t('sk.dof_full') : t('sk.dof', { n: r.dof })) + (red ? t('sk.redundant_suffix') : ''));
  }
  _snapStr() { return JSON.stringify({ points: this.sk.points, ents: this.sk.ents, cons: this.sk.cons }); }
  _restore(s) { this.sk = JSON.parse(s); this.selection = this.selection.filter((x) => this._exists(x)); this.hover = null; }
  _exists(x) { return x.kind === 'point' ? x.id in this.sk.points : this.sk.ents.some((e) => e.id === x.id); }
  _badSet() { const r = this.lastSolve; return new Set([...((r && r.conflicting) || []), ...((r && r.redundant) || [])].map(normId)); }

  // Değişikliği hemen uygular, arkadan çözer; olmazsa geri alır. Sonuç: Promise<{ok,msg}>
  _apply(mutate, { strict = false, kind = tk('sk.kind.op') } = {}) {
    if (!this.active) return Promise.resolve({ ok: false, msg: t('sk.inactive') });
    const before = this._snapStr();
    const abort = mutate(this.sk);
    if (typeof abort === 'function') { this._restore(before); this._status(abort); this._refresh(); return Promise.resolve({ ok: false, msg: abort() }); }
    const entry = { s: before }; this._undo.push(entry); if (this._undo.length > 200) this._undo.shift(); this._redo = [];
    this._refresh();
    const sid = this._sid;
    const run = async () => {
      if (this._sid !== sid || !this.active) return { ok: false };
      const prev = this._badSet(); let r, mk = null;
      try { r = await solveSketch(this.sk, this.getVars()); } catch (e) { r = { ok: false, errors: [toErr(e)] }; }
      if (this._sid !== sid || !this.active) return { ok: false };
      const newBad = [...(r.conflicting || []), ...(r.redundant || [])].map(normId).filter((id) => !prev.has(id));
      const K = () => ({ kind: t(kind) });
      if (r.errors && r.errors.length) { const er = r.errors[0]; mk = () => errText(er); }
      else if (!r.ok) mk = r.conflicting && r.conflicting.length ? (strict ? () => t('sk.conflict_strict', K()) : () => t('sk.conflict_undone', K())) : () => t('sk.no_solution', K());
      else if (strict && newBad.length) {
        const conflict = (r.conflicting || []).map(normId).some((id) => !prev.has(id));
        mk = conflict ? () => t('sk.conflict_strict', K()) : () => t('sk.redundant_con', K());
      }
      if (mk) {
        this._restore(before); const i = this._undo.indexOf(entry); if (i >= 0) this._undo.splice(i, 1);
        this._resetDraw(); this._status(mk); this._refresh(); return { ok: false, msg: mk() };
      }
      this.lastSolve = r; this._statusDof(r); this._refresh(); return { ok: true };
    };
    const p = this._q.then(run, run); this._q = p.catch(() => {}); return p;
  }
  _resolveOnly() { // geri al/yinele sonrası serbestlik derecesini tazele
    const sid = this._sid;
    this._q = this._q.then(async () => {
      if (this._sid !== sid || !this.active) return;
      try { const r = await solveSketch(this.sk, this.getVars()); if (r.ok) { this.lastSolve = r; this._statusDof(r); } } catch (e) {}
      this._refresh();
    });
  }
  undo() {
    if (!this.active) return; if (!this._undo.length) return this._status('msg.nothing_undo');
    this._redo.push({ s: this._snapStr() }); this._restore(this._undo.pop().s); this._resetDraw(); this._refresh(); this._resolveOnly();
  }
  redo() {
    if (!this.active) return; if (!this._redo.length) return this._status('msg.nothing_redo');
    this._undo.push({ s: this._snapStr() }); this._restore(this._redo.pop().s); this._resetDraw(); this._refresh(); this._resolveOnly();
  }

  // ---------- çizim yardımcıları ----------
  _newPt(x, y) { const id = this._id('p'); this.sk.points[id] = { x, y }; return id; }
  _addEnt(ent) { const id = this._id({ line: 'l', circle: 'c', arc: 'a', point: 'n' }[ent.type]); const e = { id, ...ent }; if (this.consMode && ent.type !== 'point') e.cons = true; this.sk.ents.push(e); return id; }
  _addCon(type, a, b, extra = {}) { const id = this._id(DIM_TYPES.has(type) ? 'd' : 'k'); const c = { id, type, a }; if (b !== undefined) c.b = b; Object.assign(c, extra); this.sk.cons.push(c); return id; }
  _ptFor(s) { // yakalama sonucundan nokta kimliği (gerekirse oluşturur, pointOn ekler)
    if (s.pid) return s.pid;
    const id = this._newPt(s.x, s.y); if (s.ent) this._addCon('pointOn', id, s.ent); return id;
  }
  _alignEnd(st, s) {
    if (s.pid || s.ent) return s;
    const dx = s.x - st.x, dy = s.y - st.y; if (Math.hypot(dx, dy) < 1e-9) return s;
    const ang = Math.atan2(Math.abs(dy), Math.abs(dx)) / DEG;
    if (ang < ANG_TOL) return { ...s, y: st.y, align: 'h' };
    if (ang > 90 - ANG_TOL) return { ...s, x: st.x, align: 'v' };
    return s;
  }

  // ---------- yakalama / seçme ----------
  _hit(loc) {
    const tol = SNAP_PX * this.vp.worldPerPixel(); let best = null;
    for (const [id, p] of Object.entries(this.sk.points)) { const d = Math.hypot(p.x - loc[0], p.y - loc[1]); if (d <= tol && (!best || d < best.d)) best = { kind: 'point', id, d }; }
    if (best) return best;
    for (const e of this.sk.ents) { if (e.type === 'point') continue; const r = entDist(this.sk, e, loc); if (r && r.d <= tol && (!best || r.d < best.d)) best = { kind: 'ent', id: e.id, d: r.d, x: r.x, y: r.y }; }
    return best;
  }
  _snapAt(loc, ev) {
    const h = this._hit(loc);
    if (h && h.kind === 'point') { const p = this.sk.points[h.id]; return { x: p.x, y: p.y, pid: h.id }; }
    if (h && h.kind === 'ent') return { x: h.x, y: h.y, ent: h.id };
    if (ev && ev.ctrlKey) return { x: loc[0], y: loc[1] };
    return { x: Math.round(loc[0]), y: Math.round(loc[1]), grid: true };
  }
  _isSel(x) { return this.selection.some((s) => s.kind === x.kind && s.id === x.id); }
  _setSel(list) { this.selection = list; this._renderGL(); this.onChange(); }
  _loc(ev) { return this.vp.rayToPlane(ev, this.plane); }

  // ---------- fare ----------
  _pointer(type, ev) {
    if (!this.active) return false;
    if (type === 'dbl') { if (this.tool === 'line') this._endChain(); return true; }
    if (type === 'move') {
      if (ev.buttons & 6) return true;
      const loc = this._loc(ev); if (!loc) return true;
      this._move(loc, ev); return true;
    }
    if (ev.button === 2) {
      if (type === 'down') this._rdown = { x: ev.clientX, y: ev.clientY };
      else if (type === 'up' && this._rdown) { const m = Math.hypot(ev.clientX - this._rdown.x, ev.clientY - this._rdown.y) < 4; this._rdown = null; if (m) this._rightClick(); }
      return false;
    }
    if (ev.button !== 0) return false;
    const loc = this._loc(ev); if (!loc) return true;
    if (type === 'down') { this._closeInput(); this._down(loc, ev); } else if (type === 'up') this._up(loc, ev);
    return true;
  }
  _rightClick() { if (this.tool === 'line' && this._ln) this._endChain(); else if (this.tool !== 'select') this._cancelStage(); }
  _cancelStage() { this._ln = null; this._rc = null; this._ci = null; this._ar = null; this.setHint(HINT_KEY[this.tool]); this._renderPreview(); }

  _down(loc, ev) {
    const t = this.tool;
    if (t === 'select') return this._selDown(loc, ev);
    if (t === 'dim' || t === 'hdim' || t === 'vdim') return this._dimDown(loc, ev);
    const s = this._snapAt(loc, ev);
    if (t === 'line') this._lineClick(s);
    else if (t === 'rect') this._rectClick(s);
    else if (t === 'circle') this._circleClick(s);
    else if (t === 'arc') this._arcClick(s);
    else if (t === 'point') this._pointClick(s);
    this._renderPreview();
  }
  _move(loc, ev) {
    const t = this.tool;
    if (t === 'select') {
      if (this._press && (ev.buttons & 1)) return this._selDrag(loc, ev);
      return this._setHover(this._hit(loc));
    }
    if (t === 'dim' || t === 'hdim' || t === 'vdim') return this._setHover(this._hit(loc));
    this.cursor = { ...this._snapAt(loc, ev), loc }; this._renderPreview();
  }
  _up(loc, ev) {
    if (this._dimPending) {
      this._dimPending = false;
      if (this._dimEval() === 'bad') { this.selection = this.selection.slice(-1); this._dimEval(); }
      this._renderGL(); this.onChange(); return;
    }
    if (this.tool !== 'select') return;
    const pr = this._press, d = this._drag; this._press = null; this._drag = null;
    if (d && d.active) { this._dragTarget = null; this._finishDrag(d); return; }
    if (pr && pr.hit && !pr.shift && this.selection.length > 1) this._setSel([{ kind: pr.hit.kind, id: pr.hit.id }]);
  }
  _setHover(h) {
    const a = this.hover, same = (!a && !h) || (a && h && a.kind === h.kind && a.id === h.id);
    if (same) return; this.hover = h ? { kind: h.kind, id: h.id } : null; this._renderGL();
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
    } else if (!shift && this.selection.length) this._setSel([]);
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
      else { this._undo.push({ s: d.before }); this._redo = []; this.lastSolve = r; this._statusDof(r); }
      this._refresh();
    });
  }

  // ---- çizgi
  _lineClick(s) {
    const st = this._ln;
    if (!st) { this._ln = { start: s, firstPid: s.pid || null, n: 0 }; this.setHint('hint.line_next'); return; }
    s = this._alignEnd(st.start, s);
    if (Math.hypot(s.x - st.start.x, s.y - st.start.y) < 1e-6 || (s.pid && s.pid === st.start.pid)) return; // sıfır uzunluk
    const closing = !!(s.pid && s.pid === st.firstPid);
    let aId, bId;
    const res = this._apply((sk) => {
      aId = this._ptFor(st.start);
      if (!st.firstPid) st.firstPid = aId;
      bId = this._ptFor(s);
      const l = this._addEnt({ type: 'line', a: aId, b: bId });
      if (s.align === 'h') this._addCon('horizontal', l); else if (s.align === 'v') this._addCon('vertical', l);
    }, { kind: tk('sk.kind.line') });
    st.n++;
    if (closing) { this._ln = null; this.setHint(() => t('hint.closed') + ' ' + t(HINT_KEY.line)); } else st.start = { x: s.x, y: s.y, pid: bId };
    return res;
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
    this._apply(() => { const cp = this._ptFor(c); this._addEnt({ type: 'circle', c: cp, r }); }, { kind: tk('sk.kind.circle') });
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
    const items = this.selection.slice(); let hadO = false;
    if (items.every((i) => i.kind === 'point' && i.id === 'O')) return this._status('sk.origin_nodelete');
    for (const i of items) if (i.kind === 'point' && i.id === 'O') hadO = true;
    this.selection = []; this.hover = null;
    const res = this._apply((sk) => this._deleteItems(sk, items), { kind: tk('sk.kind.delete') });
    if (hadO) this._status('sk.origin_partial');
    this.onChange(); return res;
  }
  _deleteItems(sk, items) {
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
    const lines = ents.filter((e) => e.type === 'line'), round = ents.filter((e) => e.type === 'circle' || e.type === 'arc');
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
      case 'equal':
        if (!pts.length && ents.length >= 2 && (lines.length === ents.length || round.length === ents.length)) list = ents.slice(1).map((e) => ['equal', ents[0].id, e.id]);
        else return fail('sk.c_equal');
        break;
      case 'tangent':
        if (!pts.length && ents.length === 2 && ((lines.length === 1 && round.length === 1) || round.length === 2)) list = [['tangent', ents[0].id, ents[1].id]];
        else return fail('sk.c_tangent');
        break;
      case 'coincident':
        if (pts.length === 2 && !ents.length) list = [['coincident', pts[0], pts[1]]]; else return fail('sk.c_coincident');
        break;
      case 'midpoint':
        if (pts.length === 1 && lines.length === 1 && ents.length === 1) list = [['midpoint', pts[0], lines[0].id]]; else return fail('sk.c_midpoint');
        break;
      case 'concentric':
        if (!pts.length && round.length === 2 && ents.length === 2) {
          if (round[0].c === round[1].c) return fail('sk.c_concentric_same');
          list = [['coincident', round[0].c, round[1].c]];
        } else return fail('sk.c_concentric');
        break;
      case 'symmetric':
        if (pts.length === 2 && lines.length === 1 && ents.length === 1) list = [['symmetric', pts[0], pts[1], { c: lines[0].id }]];
        else return fail('sk.c_symmetric');
        break;
      case 'pointOn':
        if (pts.length === 1 && ents.length === 1 && (lines.length === 1 || round.length === 1)) list = [['pointOn', pts[0], ents[0].id]]; else return fail('sk.c_pointOn');
        break;
      case 'fix': {
        const ids = new Set(pts); for (const e of ents) entPts(e).forEach((p) => ids.add(p)); ids.delete('O');
        if (!ids.size) return fail('sk.c_fix');
        this.selection = []; this.onChange();
        return this._apply((s) => { const all = [...ids].every((i) => s.points[i].fixed); for (const i of ids) { if (all) delete s.points[i].fixed; else s.points[i].fixed = true; } }, { kind: tk('sk.kind.fix'), strict: true });
      }
      default: return fail('sk.c_unknown', { type });
    }
    // aynısı varsa ekleme
    const sameCon = (c, t) => c.type === t[0] && ((c.a === t[1] && c.b === t[2]) || (['parallel', 'perpendicular', 'equal', 'tangent', 'coincident'].includes(c.type) && c.a === t[2] && c.b === t[1]));
    list = list.filter((t) => !sk.cons.some((c) => sameCon(c, t)));
    if (!list.length) return fail('sk.c_exists');
    this.selection = []; this.onChange();
    return this._apply((s) => { for (const [t, a, b, ex] of list) this._addCon(t, a, b, ex || {}); }, { strict: true, kind: tk('sk.kind.constraint') });
  }
  constraintsList() {
    if (!this.sk) return [];
    const out = this.sk.cons.map((c) => ({ id: c.id, label: this._conLabel(c) }));
    for (const [id, p] of Object.entries(this.sk.points)) if (p.fixed && id !== 'O') out.push({ id: 'fix:' + id, label: t('sk.fixed_pt', { id }) });
    return out;
  }
  _conLabel(c) {
    let s = nameOf(c.type);
    if (DIM_TYPES.has(c.type)) s += ': ' + this._dimText(c).text;
    return s + ' (' + conRefs(c).join(', ') + ')';
  }
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
      if (e.type === 'circle') return { type: 'diameter', a: e.id, value: 2 * e.r, anchor: entMid(sk, e) };
      if (e.type === 'arc') return { type: 'radius', a: e.id, value: arcGeom(sk, e).r, anchor: entMid(sk, e) };
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
        let v = ((ang(b) - ang(a)) / DEG) % 360; if (v > 180) v -= 360; if (v <= -180) v += 360;
        if (v < 0) { [a, b] = [b, a]; v = -v; }
        const m1 = entMid(sk, a), m2 = entMid(sk, b);
        return { type: 'angle', a: a.id, b: b.id, value: v, anchor: [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2] };
      }
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
      submit: (txt) => this._dimSubmit(spec, txt),
    });
    this._status('sk.dim_prompt', { name: nameOf(spec.type) });
    return 'ok';
  }
  _evalDim(type, txt) {
    let v; try { v = evalExpr(txt, this.getVars()); } catch (e) { return { err: t('sk.bad_expr', { msg: errText(e) }) }; }
    if (['dist', 'pldist', 'radius', 'diameter'].includes(type) && !(v > 0)) return { err: t('sk.dim_pos') };
    if (type === 'angle' && (v === 0 || Math.abs(v) >= 360)) return { err: t('sk.angle_range') };
    return { v };
  }
  async _dimSubmit(spec, txt) {
    const e = this._evalDim(spec.type, txt); if (e.err) { this._status(() => e.err); return e.err; }
    this.selection = []; this.onChange();
    const r = await this._apply((sk) => { this._addCon(spec.type, spec.a, spec.b, { expr: String(txt).trim() }); }, { strict: true, kind: tk('sk.kind.dim') });
    return r.ok ? null : r.msg;
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
    inp.style.cssText = 'position:absolute;width:84px;transform:translate(-50%,-50%);pointer-events:auto;padding:1px 4px;font-size:12px;border:2px solid #1769e0;border-radius:3px;background:#fff;user-select:text;z-index:5;';
    let busy = false;
    inp.addEventListener('keydown', async (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { this._closeInput(); this._setSel([]); }
      else if (ev.key === 'Enter') {
        ev.preventDefault(); if (busy) return; busy = true;
        const err = await submit(inp.value); busy = false;
        if (err) inp.style.borderColor = '#c62828'; else this._closeInput();
      }
    });
    inp.addEventListener('input', () => { inp.style.borderColor = '#1769e0'; });
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
    const t = ev.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return false;
    const k = ev.key, mod = ev.ctrlKey || ev.metaKey;
    const done = () => { ev.preventDefault && ev.preventDefault(); return true; };
    if (mod) {
      const l = k.toLowerCase();
      if (l === 'z' && !ev.shiftKey) { this.undo(); return done(); }
      if (l === 'y' || (l === 'z' && ev.shiftKey)) { this.redo(); return done(); }
      return false;
    }
    if (ev.altKey) return false;
    if (k === 'Escape') {
      if (this._input) this._closeInput();
      else if (this._ln || this._rc || this._ci || this._ar) this._cancelStage();
      else if (this.tool !== 'select') this.setTool('select');
      else if (this.selection.length) this._setSel([]);
      else return false;
      return done();
    }
    if (k === 'Delete' || k === 'Backspace') { this.deleteSelection(); return done(); }
    const map = { l: 'line', r: 'rect', c: 'circle', a: 'arc', d: 'dim' }, tool = map[k.toLowerCase()];
    if (tool) { this.setTool(tool); return done(); }
    return false;
  }

  // ---------- çizim (three.js) ----------
  _clearGroup(g) { if (!g) return; for (const o of [...g.children]) { g.remove(o); o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); } }
  _refresh() { if (!this.active) return; this._renderGL(); this._buildOverlay(); this.onChange(); }
  _onCamera() {
    if (!this.active) return;
    const w = this.vp.worldPerPixel(); if (Math.abs(w / (this._lastWpp || w) - 1) > 0.03) { this._renderGL(); this._renderPreview(); }
    this._posOverlay(); this._posInput(); if (this.cursor) this._posTip();
  }
  _renderGL() {
    if (!this.active) return; this._clearGroup(this.gMain);
    const wpp = this.vp.worldPerPixel(); this._lastWpp = wpp; const sk = this.sk;
    const fully = this.lastSolve && this.lastSolve.dof === 0 && sk.ents.some((e) => !e.cons);
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
      const color = sel ? COL.cons : hov ? 0xffb020 : e.cons ? COL.sketchDim : fully ? 0x1c2430 : COL.sketch;
      const geo = new THREE.BufferGeometry().setFromPoints(s.pts.map((p) => new THREE.Vector3(p[0], p[1], 0)));
      const mat = e.cons ? new THREE.LineDashedMaterial({ color, dashSize: 7 * wpp, gapSize: 4 * wpp, depthTest: false }) : new THREE.LineBasicMaterial({ color, depthTest: false });
      const line = new THREE.Line(geo, mat); if (e.cons) line.computeLineDistances();
      line.renderOrder = 4; line.userData.ent = e.id; this.gMain.add(line);
    }
    const pos = [], col = [], c = new THREE.Color();
    for (const [id, p] of Object.entries(sk.points)) {
      pos.push(p.x, p.y, 0);
      c.set(isSel('point', id) ? COL.cons : isHov('point', id) ? 0xffb020 : id === 'O' ? 0xc62828 : p.fixed ? 0x111111 : fully ? 0x1c2430 : COL.sketch); col.push(c.r, c.g, c.b);
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
    if (!cur || tool === 'select' || tool === 'dim' || tool === 'hdim' || tool === 'vdim') { this._hideTip(); this.vp.dirty = true; return; }
    let s = cur; const B = 0x0b62d6;
    if (tool === 'line' && this._ln) {
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
    // yakalama işareti
    if (cur.pid || cur.ent) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(s.x, s.y, 0)]);
      const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 12, sizeAttenuation: false, color: cur.pid ? 0x16a34a : 0xe07b00, depthTest: false })); m.renderOrder = 8; this.gPrev.add(m);
    }
    this._tipLoc = [s.x, s.y];
    if (tip) { this._showTip(tip); } else this._hideTip();
    this.vp.dirty = true;
  }
  _showTip(text) {
    if (!this._tip) { this._tip = document.createElement('div'); this._tip.className = 'sk-tip'; this._tip.style.cssText = 'position:absolute;pointer-events:none;background:rgba(31,42,58,.88);color:#fff;font-size:11.5px;padding:1px 6px;border-radius:3px;white-space:nowrap;font-variant-numeric:tabular-nums;'; this.ovl.appendChild(this._tip); }
    this._tip.textContent = text; this._tip.style.display = ''; this._posTip();
  }
  _hideTip() { if (this._tip) this._tip.style.display = 'none'; }
  _posTip() { if (!this._tip || !this._tipLoc) return; const [x, y] = this._px(this._tipLoc); this._tip.style.left = x + 14 + 'px'; this._tip.style.top = y + 14 + 'px'; }
  _px(loc) { return this.vp.project(V.toWorld(this.plane, loc[0], loc[1])); }

  // ---------- ölçü etiketleri ve kısıt rozetleri ----------
  _dimText(c) {
    let v = null, bad = false; try { v = evalExpr(c.expr, this.getVars()); } catch (e) { bad = true; }
    const pre = c.type === 'diameter' ? 'Ø' : c.type === 'radius' ? 'R' : '', suf = c.type === 'angle' ? '°' : '';
    const e = String(c.expr).trim();
    const text = bad ? pre + e + ' ?' : numeric(e) ? pre + fmt(v) + suf : pre + e + ' = ' + fmt(v) + suf;
    return { text, bad };
  }
  _dimAnchor(c) { // yerel konum
    const sk = this.sk, P = (id) => sk.points[id], ent = (id) => sk.ents.find((e) => e.id === id);
    try {
      if (['dist', 'hdist', 'vdist'].includes(c.type)) return [(P(c.a).x + P(c.b).x) / 2, (P(c.a).y + P(c.b).y) / 2];
      if (c.type === 'pldist') { const l = ent(c.b), p = P(c.a), pr = segProj([p.x, p.y], P(l.a), P(l.b)); return [(p.x + pr.x) / 2, (p.y + pr.y) / 2]; }
      if (c.type === 'radius' || c.type === 'diameter') return entMid(sk, ent(c.a));
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
    for (const el of [...this.ovl.children]) if (el !== this._input && el !== this._tip) el.remove();
    this._ovEls = [];
    for (const c of this.sk.cons) {
      if (!conRefs(c).every((r) => r in this.sk.points || this.sk.ents.some((e) => e.id === r))) continue;
      const el = document.createElement('div');
      if (DIM_TYPES.has(c.type)) {
        const d = this._dimText(c); el.className = 'dim' + (d.bad ? ' bad' : ''); el.textContent = d.text; el.title = t('sk.dim_tip', { name: nameOf(c.type) });
        el.addEventListener('dblclick', (ev) => { ev.stopPropagation(); this._editDim(c.id); });
        el._loc = this._dimAnchor(c); el._off = this._dimOffset(c);
      } else {
        el.className = 'cbadge'; el.textContent = GLYPH[c.type] || '?'; el.title = t('sk.con_tip', { name: nameOf(c.type) });
        el.addEventListener('click', (ev) => { ev.stopPropagation(); this.removeConstraint(c.id); });
        el._loc = this._conAnchor(c); el._off = [0, -13];
      }
      el.dataset.con = c.id; el.style.pointerEvents = 'auto'; this.ovl.appendChild(el); this._ovEls.push(el);
    }
    this._posOverlay();
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
}
