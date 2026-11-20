// WP-17: Teknik resim calisma alani denetleyicisi. Veri doc.drawings altindadir (geri al/yinele ve kayitla gider); izdusumler cekirdekte
// (drawProject) hesaplanir, sayfa cizim listesi src/drawing/ altindaki saf islevlerle uretilir; onizleme SVG, cikti PDF/DXF/CSV.
// Model degisince (onResult) gorunusler yeniden hesaplanir; olculer kenar anahtariyla yeniden eslenir, eslenemeyen kirmizi isaretlenir.
import './drawing.css';
import { h, toast, modal, promptText, confirmBox } from '../dom.js';
import { t, errText } from '../../shared/i18n.js';
import { newDrawing, addStdViews, computeDrawing, drawingsOf, newId } from '../../drawing/model.js';
import { composeSheet, SHEETS, TB_FIELDS, scaleText } from '../../drawing/sheet.js';
import { placement, fromSheet, toSheet, ORIENT_KEYS, STD_SCALES, autoScale, viewBasis } from '../../drawing/views.js';
import { primDist, dist, ends } from '../../drawing/geom.js';
import { mkRef, fitOk } from '../../drawing/dims.js';
import { toSvg } from '../../drawing/svg.js';
import { toPdf } from '../../drawing/pdf.js';
import { toDxf } from '../../drawing/dxfout.js';
import { faiRows, faiCsv, faiPages } from '../../drawing/fai.js';
import { textWidth } from '../../drawing/text.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const PICK_MM = 2.5;
const TOOL_HINT = { base: 'drw.hint.base', proj: 'drw.hint.proj', sec: 'drw.hint.sec', det: 'drw.hint.det', lin: 'drw.hint.lin', dia: 'drw.hint.dia', ang: 'drw.hint.ang', ord: 'drw.hint.ord', cline: 'drw.hint.cline', rough: 'drw.hint.rough', note: 'drw.hint.note', holes: 'drw.hint.holes' };

export class DrawingCtl {
  constructor(app) { this.app = app; this.cur = null; this.C = null; this.tool = null; this.sel = null; this.seq = 0; this.vb = null; this.lastVal = new Map(); this.err = null; }
  // ------------------------------------------------------------ veri
  list() { return drawingsOf(this.app.doc); }
  current() { const l = this.list(); return l.find((d) => d.id === this.cur) || l[0] || null; }
  hasModel() { return !!(this.app.result && this.app.result.bodies && this.app.result.bodies.length); }
  mut(fn) {
    const id = this.current()?.id;
    this.app.commitMeta((doc) => { if (!Array.isArray(doc.drawings)) doc.drawings = []; const dr = doc.drawings.find((d) => d.id === id) || doc.drawings[0]; if (dr) fn(dr, doc); });
    this.refresh();
  }
  // ------------------------------------------------------------ kip
  enter() { this.ensureDom(); this.root.classList.remove('hidden'); this.refresh(); this.root.focus({ preventScroll: true }); }
  leave() { this.setTool(null); if (this.root) this.root.classList.add('hidden'); this.closeProps(); }
  onDocLoaded() { this.cur = null; this.sel = null; this.C = null; this.vb = null; this.lastVal.clear(); this.setTool(null); this.closeProps(); }
  onResult() { if (this.app.mode === 'drawing') this.refresh(); }
  ensureDom() {
    if (this.root) return;
    this.canvas = h('div', { class: 'drw-canvas', 'data-testid': 'drw-canvas' });
    this.hint = h('div', { class: 'drw-hint hidden', role: 'status' });
    this.side = h('aside', { class: 'drw-props hidden', 'data-testid': 'drw-props' });
    this.root = h('div', { id: 'drw', class: 'drw hidden', tabindex: '0', 'data-testid': 'drw-root' }, this.canvas, this.hint, this.side);
    document.getElementById('viewwrap').append(this.root);
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onUp(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('keydown', (e) => this.onKey(e));
  }
  // ------------------------------------------------------------ hesap
  async refresh() {
    if (this.app.mode !== 'drawing' || !this.root) return;
    const dr = this.current(); const my = ++this.seq;
    if (!dr) { this.C = null; this.render(); return; }
    this.cur = dr.id;
    if (!this.hasModel()) { this.C = composeSheet(dr, {}, (k, p) => t(k, p)); this.err = { code: 'drw.no_model', params: {} }; this.render(); return; }
    try {
      const C = await computeDrawing(dr, (cmd, args) => this.app.query(cmd, args), (k, p) => t(k, p), this.app.result?.holes || []);
      if (my !== this.seq) return;
      for (const d of C.dims) { if (!d.lost && d.value != null) this.lastVal.set(d.id, d.value); else if (d.lost && this.lastVal.has(d.id)) d.value = this.lastVal.get(d.id); }
      this.C = C; this.err = null;
    } catch (e) { if (my !== this.seq) return; this.err = e; }
    this.render(); this.app.C.renderBrowser();
  }
  recompose() { const dr = this.current(); if (!dr || !this.C) return; const C = composeSheet(dr, this.C.proj || {}, (k, p) => t(k, p), { holes: this.app.result?.holes || [] }); C.proj = this.C.proj; this.C = C; this.render(); }
  // ------------------------------------------------------------ cizim
  render() {
    if (!this.canvas) return;
    const dr = this.current();
    if (!dr) {
      this.canvas.replaceChildren(h('div', { class: 'drw-empty', 'data-testid': 'drw-empty' }, h('h3', { text: t('drw.empty_title') }), h('p', { text: this.hasModel() ? t('drw.empty_body') : t('err.drw.no_model') }),
        h('button', { class: 'btn primary', 'data-testid': 'drw-empty-new', disabled: !this.hasModel(), onclick: () => this.newSheet() }, t('drw.cmd.new'))));
      return;
    }
    const C = this.C; if (!C) { this.canvas.replaceChildren(h('div', { class: 'drw-empty', text: t('ui.busy') })); return; }
    if (!this.vb || this.vb.key !== C.W + 'x' + C.H) this.vb = { key: C.W + 'x' + C.H, x: -10, y: -10, w: C.W + 20, h: C.H + 20 };
    const sel = this.sel; const list = C.list.slice();
    if (sel?.kind === 'dim') { const d = C.dims.find((x) => x.id === sel.id); if (d?.at) { const w = textWidth(d.text?.main || '', dr.sheet.th || 3.5); list.push({ k: 'p', pts: [[d.at[0] - w / 2 - 1.5, d.at[1] - 1.5], [d.at[0] + w / 2 + 1.5, d.at[1] - 1.5], [d.at[0] + w / 2 + 1.5, d.at[1] + 5], [d.at[0] - w / 2 - 1.5, d.at[1] + 5]], closed: true, ly: 'sel' }); } }
    if (sel?.kind === 'view') { const V = C.views[sel.id]; const b = V && viewBoxSheet(V); if (b) list.push({ k: 'p', pts: [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], closed: true, ly: 'sel' }); }
    for (const p of this.tool?.picks || []) list.push({ k: 'c', c: p.at, r: 1.2, ly: 'sel' });
    const svg = toSvg({ W: C.W, H: C.H, list }, { width: '100%', height: '100%', bg: '#ffffff' }).replace('<svg ', `<svg data-testid="drw-svg" preserveAspectRatio="xMidYMid meet" `).replace(/viewBox="[^"]*"/, `viewBox="${this.vb.x} ${this.vb.y} ${this.vb.w} ${this.vb.h}"`);
    this.canvas.innerHTML = svg; this.svg = this.canvas.firstElementChild;
    const bad = [...C.issues, ...(this.err ? [{ err: this.err }] : [])];
    const lost = C.dims.filter((d) => d.lost).length;
    this.canvas.append(h('div', { class: 'drw-status', 'data-testid': 'drw-status' },
      lost ? h('span', { class: 'badge warn', 'data-testid': 'drw-lost', text: t('drw.lost_n', { n: lost }) }) : null,
      ...bad.slice(0, 3).map((b) => h('span', { class: 'badge err', text: errText(b.err) }))));
  }
  // ------------------------------------------------------------ koordinat, secim
  sheetPt(e) { const s = this.svg; if (!s || !this.C) return null; const pt = s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const m = s.getScreenCTM(); if (!m) return null; const q = pt.matrixTransform(m.inverse()); return [q.x, this.C.H - q.y]; }
  pickPrim(p, { filter = null } = {}) {
    let best = null; if (!this.C) return null;
    for (const [id, V] of Object.entries(this.C.views)) {
      if (V.err || !V.prims) continue; const q = fromSheet(V.pl, p);
      for (const pr of V.prims) { if (filter && !filter(pr)) continue; const d = primDist(q, pr) * V.pl.s; if (d < PICK_MM && (!best || d < best.d)) best = { d, view: id, prim: pr, q, V }; }
    }
    return best;
  }
  pickView(p) { let best = null; for (const [id, V] of Object.entries(this.C?.views || {})) { const b = viewBoxSheet(V); if (!b) continue; if (p[0] >= b[0] - 3 && p[0] <= b[2] + 3 && p[1] >= b[1] - 3 && p[1] <= b[3] + 3) { const a = (b[2] - b[0]) * (b[3] - b[1]); if (!best || a < best.a) best = { id, a }; } } return best?.id || null; }
  pickDim(p) { const dr = this.current(); let best = null; for (const d of this.C?.dims || []) { if (!d.at) continue; const w = textWidth(d.text?.main || '', dr.sheet.th || 3.5) / 2 + 2; const dd = Math.max(Math.abs(p[0] - d.at[0]) - w, 0) + Math.max(Math.abs(p[1] - d.at[1] - 2) - 3, 0); if (dd < 1.5 && (!best || dd < best.dd)) best = { id: d.id, dd }; } return best?.id || null; }
  // ------------------------------------------------------------ fare
  onWheel(e) {
    e.preventDefault(); if (!this.vb) return; const p = this.svgPt(e); const k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const w = Math.min(5000, Math.max(5, this.vb.w * k)), hh = this.vb.h * (w / this.vb.w);
    this.vb.x = p[0] - (p[0] - this.vb.x) * (w / this.vb.w); this.vb.y = p[1] - (p[1] - this.vb.y) * (hh / this.vb.h); this.vb.w = w; this.vb.h = hh; this.applyVb();
  }
  svgPt(e) { const s = this.svg; const pt = s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(s.getScreenCTM().inverse()); return [q.x, q.y]; }
  applyVb() { if (this.svg) this.svg.setAttribute('viewBox', `${this.vb.x} ${this.vb.y} ${this.vb.w} ${this.vb.h}`); }
  onDown(e) {
    if (!this.svg) return; this.root.focus({ preventScroll: true });
    if (e.button === 1 || e.button === 2) { this.pan = { s: this.svgPt(e), vb: { ...this.vb } }; this.canvas.setPointerCapture(e.pointerId); return; }
    if (e.button !== 0) return; const p = this.sheetPt(e); if (!p) return;
    if (this.tool) { this.toolClick(p, e); return; }
    const did = this.pickDim(p); if (did) { this.select({ kind: 'dim', id: did }); this.drag = { kind: 'dim', id: did, s: p }; this.canvas.setPointerCapture(e.pointerId); return; }
    const vid = this.pickView(p); if (vid) { this.select({ kind: 'view', id: vid }); this.drag = { kind: 'view', id: vid, s: p, moved: false }; this.canvas.setPointerCapture(e.pointerId); return; }
    this.select(null);
  }
  onMove(e) {
    if (this.pan) { const q = this.svgPt(e); const k = this.vb.w / this.pan.vb.w; void k; this.vb.x = this.pan.vb.x - (q[0] - this.pan.s[0]); this.vb.y = this.pan.vb.y - (q[1] - this.pan.s[1]); this.applyVb(); this.pan.s = [q[0] + (this.vb.x - this.pan.vb.x), q[1] + (this.vb.y - this.pan.vb.y)]; this.pan.vb = { ...this.vb }; return; }
    if (!this.drag) return; const p = this.sheetPt(e); if (!p) return; const dr = this.current(); if (!dr) return;
    const dx = p[0] - this.drag.s[0], dy = p[1] - this.drag.s[1]; if (Math.hypot(dx, dy) < 0.5 && !this.drag.moved) return;
    if (!this.drag.orig) this.drag.orig = clone(dr);
    this.drag.moved = true;
    // canli onizleme: belge degil, kopya uzerinde
    const tmp = clone(this.drag.orig);
    if (this.drag.kind === 'view') { const v = tmp.views.find((x) => x.id === this.drag.id); if (v) v.o = [v.o[0] + dx, v.o[1] + dy]; }
    else { const d = tmp.dims.find((x) => x.id === this.drag.id); if (d) dragDim(d, dx, dy); }
    this.dragTmp = tmp; const C = composeSheet(tmp, this.C.proj || {}, (k, pp) => t(k, pp), { holes: this.app.result?.holes || [] }); C.proj = this.C.proj; this.C = C; this.render();
  }
  onUp(e) {
    if (this.pan) { this.pan = null; try { this.canvas.releasePointerCapture(e.pointerId); } catch (x) { /* */ } return; }
    const d = this.drag; this.drag = null; try { this.canvas.releasePointerCapture(e.pointerId); } catch (x) { /* */ }
    if (d && d.moved && this.dragTmp) { const tmp = this.dragTmp; this.dragTmp = null; this.mut((dr) => { dr.views = tmp.views; dr.dims = tmp.dims; }); }
  }
  onKey(e) {
    if (e.target !== this.root) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (this.tool) this.setTool(null); else this.select(null); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) { e.preventDefault(); this.deleteSel(); }
  }
  select(s) { this.sel = s; this.render(); if (s?.kind === 'dim') this.openDimProps(s.id); else if (s?.kind === 'view') this.openViewProps(s.id); else this.closeProps(); }
  async deleteSel() {
    const s = this.sel; if (!s) return;
    if (s.kind === 'view') {
      const dr = this.current(); const kids = new Set([s.id]); let grew = true; while (grew) { grew = false; for (const v of dr.views) if (v.parent && kids.has(v.parent) && !kids.has(v.id)) { kids.add(v.id); grew = true; } }
      if (kids.size > 1 && !(await confirmBox(t('drw.del_view_title'), t('drw.del_view_body', { n: kids.size - 1 })))) return;
      this.mut((d) => { d.views = d.views.filter((v) => !kids.has(v.id)); d.dims = d.dims.filter((x) => !kids.has(x.view)); d.rough = (d.rough || []).filter((x) => !kids.has(x.view)); d.clines = (d.clines || []).filter((x) => !kids.has(x.view)); if (d.holeTable && kids.has(d.holeTable.view)) d.holeTable = null; });
    } else if (s.kind === 'dim') this.mut((d) => { d.dims = d.dims.filter((x) => x.id !== s.id); });
    this.sel = null; this.closeProps();
  }
  // ------------------------------------------------------------ araclar
  setTool(kind, data = {}) {
    this.tool = kind ? { kind, picks: [], ...data } : null;
    if (this.hint) { this.hint.classList.toggle('hidden', !kind); this.hint.textContent = kind ? t(TOOL_HINT[kind] || 'drw.hint.base') : ''; }
    this.render(); this.app.C.renderToolbar();
  }
  needDrawing() { if (!this.current()) { toast(t('drw.need_sheet')); return true; } if (!this.hasModel()) { toast(t('err.drw.no_model')); return true; } return false; }
  async startTool(kind) {
    if (this.app.mode !== 'drawing') this.app.setMode('drawing');
    if (this.needDrawing()) return;
    if (kind === 'base') { const o = await this.askOrient(); if (!o) return; this.setTool('base', o); return; }
    if (kind === 'ord') { const ax = await this.askAxis(); if (!ax) return; this.setTool('ord', { axis: ax }); return; }
    if (kind === 'rough') { const r = await this.askRough(); if (!r) return; this.setTool('rough', { r }); return; }
    this.setTool(kind);
  }
  async toolClick(p, e) {
    const T = this.tool; const dr = this.current(); if (!T || !dr) return;
    const used = new Set([...dr.views.map((v) => v.id), ...dr.dims.map((d) => d.id)]);
    if (T.kind === 'base') { this.mut((d) => { d.views.push({ id: newId('v', used), kind: 'base', orient: T.orient, o: placeAt(this.app, T.orient, p, T.scale || d.sheet.scale || 1), hidden: T.orient !== 'iso', cmark: true, ...(T.scale ? { scale: T.scale } : {}) }); }); this.setTool(null); return; }
    if (T.kind === 'proj') {
      if (!T.parent) { const v = this.pickView(p); if (!v) return; const pv = dr.views.find((x) => x.id === v); if (pv?.kind === 'det' || pv?.orient === 'iso') { toast(t('drw.proj_bad_parent')); return; } T.parent = v; this.hint.textContent = t('drw.hint.proj2'); return; }
      const P = this.C.views[T.parent]; const b = viewBoxSheet(P); const c = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : P.pl.o; const dx = p[0] - c[0], dy = p[1] - c[1];
      const side = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'above' : 'below');
      const tmp = { id: 'x', kind: 'proj', parent: T.parent, side, o: [0, 0] }; const B = viewBasis({ ...dr, views: [...dr.views, tmp] }, tmp);
      const o = placeBasis(this.app, B, p, placement(dr, dr.views.find((x) => x.id === T.parent)).s);
      this.mut((d) => { d.views.push({ id: newId('v', used), kind: 'proj', parent: T.parent, side, o, hidden: true, cmark: true }); }); this.setTool(null); return;
    }
    if (T.kind === 'sec') {
      if (!T.parent) { const v = this.pickView(p); if (!v) return; const pv = dr.views.find((x) => x.id === v); if (pv?.kind === 'det' || pv?.orient === 'iso') { toast(t('drw.proj_bad_parent')); return; } T.parent = v; T.cut = { p: fromSheet(this.C.views[v].pl, p), ang: e.shiftKey ? 90 : 0 }; this.hint.textContent = t('drw.hint.sec2'); return; }
      const P = this.C.views[T.parent]; const label = nextLabel(dr);
      const tmp = { id: 'x', kind: 'sec', parent: T.parent, cut: T.cut, o: [0, 0] }; const B = viewBasis({ ...dr, views: [...dr.views, tmp] }, tmp);
      const o = placeBasis(this.app, B, p, P.pl.s);
      this.mut((d) => { d.views.push({ id: newId('v', used), kind: 'sec', parent: T.parent, cut: T.cut, label, o, cmark: true }); }); this.setTool(null); return;
    }
    if (T.kind === 'det') {
      if (!T.parent) { const v = this.pickView(p); if (!v) return; T.parent = v; T.c = fromSheet(this.C.views[v].pl, p); this.hint.textContent = t('drw.hint.det2'); return; }
      if (!T.r) { const q = fromSheet(this.C.views[T.parent].pl, p); T.r = Math.max(1e-3, dist(q, T.c)); this.hint.textContent = t('drw.hint.det3'); return; }
      const P = this.C.views[T.parent]; const label = nextLabel(dr);
      this.mut((d) => { d.views.push({ id: newId('v', used), kind: 'det', parent: T.parent, c: T.c, r: T.r, scale: niceScale(P.pl.s * 2), label, o: p }); }); this.setTool(null); return;
    }
    if (T.kind === 'note') { const s = await promptText(t('drw.note_title'), '', t('drw.note_label')); if (s) this.mut((d) => { d.notes.push({ id: newId('n', used), p, text: s.slice(0, 2000) }); }); this.setTool(null); return; }
    if (T.kind === 'holes') { if (!T.view) { const v = this.pickView(p); if (!v) return; T.view = v; this.hint.textContent = t('drw.hint.holes2'); return; } this.mut((d) => { d.holeTable = { view: T.view, p }; }); this.setTool(null); return; }
    if (T.kind === 'rough') { const hit = this.pickPrim(p, { filter: (q) => q.vis && q.t === 'l' }); if (!hit) return; const ang = (Math.atan2(hit.prim.b[1] - hit.prim.a[1], hit.prim.b[0] - hit.prim.a[0]) * 180) / Math.PI; const a = ((ang % 180) + 180) % 180; const near = closestOnLine(hit.q, hit.prim); this.mut((d) => { d.rough.push({ id: newId('r', used), view: hit.view, p: near, ang: a > 90 ? a - 180 : a, ...T.r }); }); this.setTool(null); return; }
    // dogrusal olcu: iki secimden sonra ucuncu tik yerlesimdir (bos alana da olabilir)
    if (T.kind === 'lin' && T.picks.length === 2) { this.placeLin(p, used); return; }
    // olcu araclari: ilkel secimi
    const hit = this.pickPrim(p); if (!hit) return;
    if (T.picks.length && T.picks[0].view !== hit.view) { toast(t('drw.same_view')); return; }
    if (this.C.views[hit.view]?.v.orient === 'iso') { toast(t('drw.no_iso_dims')); return; }
    const pt = hit.prim.t === 'c' || hit.prim.t === 'a' ? 'c' : nearEnd(hit.prim, hit.q);
    T.picks.push({ view: hit.view, prim: hit.prim, q: hit.q, pt, at: p });
    const P = T.picks; const vw = hit.view;
    const add = (dim) => { this.mut((d) => { d.dims.push({ id: newId('d', used), view: vw, ...dim }); }); };
    if (T.kind === 'dia') { if (hit.prim.t !== 'c' && hit.prim.t !== 'a') { T.picks.pop(); toast(t('drw.need_circle')); return; } add({ type: hit.prim.t === 'a' && hit.prim.sw < Math.PI ? 'rad' : 'dia', refs: [mkRef(hit.prim)], ang: 45, off: 8, last: hit.prim.t === 'c' ? 2 * hit.prim.r : hit.prim.r }); this.setTool(null); return; }
    if (T.kind === 'ang') { if (hit.prim.t !== 'l') { T.picks.pop(); toast(t('drw.need_line')); return; } if (P.length < 2) { this.render(); return; } add({ type: 'ang', refs: [mkRef(P[0].prim), mkRef(P[1].prim)], off: 15 }); this.setTool(null); return; }
    if (T.kind === 'cline') { if (hit.prim.t !== 'l') { T.picks.pop(); toast(t('drw.need_line')); return; } if (P.length < 2) { this.render(); return; } this.mut((d) => { d.clines.push({ id: newId('c', used), view: vw, refs: [mkRef(P[0].prim), mkRef(P[1].prim)] }); }); this.setTool(null); return; }
    if (T.kind === 'ord') {
      if (!T.origin) { T.origin = P[0]; T.picks = [P[0]]; this.hint.textContent = t('drw.hint.ord2'); this.render(); return; }
      const O = T.origin; const cur = P[P.length - 1]; T.picks = [O];
      add({ type: 'ord', axis: T.axis, refs: [mkRef(O.prim, O.pt, O.q), mkRef(cur.prim, cur.pt, cur.q)], off: 10 }); return;
    }
    if (T.kind === 'lin') { this.hint.textContent = t(P.length < 2 ? 'drw.hint.lin' : 'drw.hint.lin3'); this.render(); }
  }
  placeLin(p, used) {
    const P = this.tool.picks; const vw = P[0].view; const V = this.C.views[vw]; if (!V) { this.setTool(null); return; }
    const a = toSheet(V.pl, refPt(P[0])), b = toSheet(V.pl, refPt(P[1]));
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; const horiz = Math.abs(p[1] - my) >= Math.abs(p[0] - mx);
    const dir = horiz ? 'h' : 'v'; const k = horiz ? 1 : 0; const hi = Math.max(a[k], b[k]), lo = Math.min(a[k], b[k]);
    const off = p[k] >= hi ? p[k] - hi : p[k] <= lo ? p[k] - lo : p[k] - hi;
    const last = Math.abs(refPt(P[1])[horiz ? 0 : 1] - refPt(P[0])[horiz ? 0 : 1]);
    this.mut((d) => { d.dims.push({ id: newId('d', used), view: vw, type: 'lin', dir, refs: [mkRef(P[0].prim, P[0].pt, P[0].q), mkRef(P[1].prim, P[1].pt, P[1].q)], off: Math.abs(off) < 3 ? (off < 0 ? -8 : 8) : off, last }); });
    this.setTool(null);
  }
  // ------------------------------------------------------------ iletiler
  async askOrient() {
    const sel = h('select', { 'data-testid': 'drw-orient' }, ...ORIENT_KEYS.map((k) => h('option', { value: k, text: t('drw.or.' + k) })));
    const sc = scaleSelect(this.current().sheet.scale || 1, true);
    const r = await modal({ title: t('drw.cmd.base'), content: h('div', {}, fld(t('drw.f.orient'), sel), fld(t('drw.f.scale'), sc)), buttons: [{ label: t('common.cancel'), value: null }, { label: t('common.ok'), cls: 'pri primary', value: 'ok' }] });
    if (r !== 'ok') return null; return { orient: sel.value, scale: sc.value === 'sheet' ? null : +sc.value };
  }
  async askAxis() {
    const sel = h('select', { 'data-testid': 'drw-axis' }, h('option', { value: 'x', text: t('drw.ax.x') }), h('option', { value: 'y', text: t('drw.ax.y') }));
    const r = await modal({ title: t('drw.cmd.ord'), content: fld(t('drw.f.axis'), sel), buttons: [{ label: t('common.cancel'), value: null }, { label: t('common.ok'), cls: 'pri primary', value: 'ok' }] });
    return r === 'ok' ? sel.value : null;
  }
  async askRough() {
    const proc = h('select', {}, ...['any', 'remove', 'noremove'].map((k) => h('option', { value: k, text: t('drw.rp.' + k) })));
    const par = h('select', {}, h('option', { value: 'Ra', text: 'Ra' }), h('option', { value: 'Rz', text: 'Rz' }));
    const val = h('input', { type: 'text', value: '1,6', 'data-testid': 'drw-rough-val' });
    const r = await modal({ title: t('drw.cmd.rough'), content: h('div', {}, fld(t('drw.f.proc'), proc), fld(t('drw.f.param'), par), fld(t('drw.f.value'), val)), buttons: [{ label: t('common.cancel'), value: null }, { label: t('common.ok'), cls: 'pri primary', value: 'ok' }] });
    if (r !== 'ok') return null; const v = parseFloat(String(val.value).replace(',', '.'));
    return { proc: proc.value, param: par.value, val: Number.isFinite(v) && v > 0 ? v : String(val.value).slice(0, 20) };
  }
  // ------------------------------------------------------------ ozellik paneli
  closeProps() { if (this.side) { this.side.classList.add('hidden'); this.side.replaceChildren(); } }
  openDimProps(id) {
    const dr = this.current(); const d = dr?.dims.find((x) => x.id === id); const info = this.C?.dims.find((x) => x.id === id); if (!d) return;
    const tol = d.tol || { k: 'none' };
    const kind = h('select', { 'data-testid': 'drw-tol-kind' }, ...['none', 'sym', 'dev', 'fit'].map((k) => h('option', { value: k, text: t('drw.tol.' + k), selected: tol.k === k })));
    const up = h('input', { type: 'text', value: tol.up != null ? String(tol.up).replace('.', ',') : '', 'data-testid': 'drw-tol-up' });
    const lo = h('input', { type: 'text', value: tol.lo != null ? String(tol.lo).replace('.', ',') : '', 'data-testid': 'drw-tol-lo' });
    const fit = h('input', { type: 'text', value: tol.fit || '', placeholder: 'H7', 'data-testid': 'drw-tol-fit' });
    const show = h('input', { type: 'checkbox', checked: !!tol.show });
    const fai = h('input', { type: 'checkbox', checked: d.fai !== false });
    const msg = h('div', { class: 'fieldmsg', role: 'alert', hidden: true });
    const sync = () => { const k = kind.value; upR.hidden = !(k === 'sym' || k === 'dev'); loR.hidden = k !== 'dev'; fitR.hidden = k !== 'fit'; showR.hidden = k !== 'fit'; };
    const upR = fld(t('drw.f.up'), up), loR = fld(t('drw.f.lo'), lo), fitR = fld(t('drw.f.fit'), fit), showR = fld(t('drw.f.show_dev'), show);
    kind.addEventListener('change', sync); sync();
    const apply = () => {
      const k = kind.value; const n = (s) => parseFloat(String(s).replace(',', '.'));
      let nt = { k };
      if (k === 'sym') { const v = n(up.value); if (!Number.isFinite(v)) return bad(t('drw.tol.bad_num')); nt.up = Math.abs(v); }
      if (k === 'dev') { const a = n(up.value), b = n(lo.value); if (!Number.isFinite(a) || !Number.isFinite(b) || a < b) return bad(t('drw.tol.bad_dev')); nt.up = a; nt.lo = b; }
      if (k === 'fit') { const c = fit.value.trim(); if (!fitOk(c)) return bad(t('drw.tol.bad_fit')); nt.fit = c; nt.show = show.checked; }
      if (k === 'none') nt = null;
      msg.hidden = true; this.mut((x) => { const dd = x.dims.find((y) => y.id === id); if (!dd) return; if (nt) dd.tol = nt; else delete dd.tol; if (fai.checked) delete dd.fai; else dd.fai = false; });
    };
    const bad = (s) => { msg.textContent = s; msg.hidden = false; };
    const extra = [];
    if (d.type === 'lin') { const dir = h('select', {}, ...['h', 'v', 'al'].map((k) => h('option', { value: k, text: t('drw.dir.' + k), selected: (d.dir || 'h') === k }))); dir.addEventListener('change', () => this.mut((x) => { const dd = x.dims.find((y) => y.id === id); if (dd) dd.dir = dir.value; })); extra.push(fld(t('drw.f.dir'), dir)); }
    if (d.type === 'dia' || d.type === 'rad') { const ty = h('select', {}, ...['dia', 'rad'].map((k) => h('option', { value: k, text: t('drw.dim.' + k), selected: d.type === k }))); ty.addEventListener('change', () => this.mut((x) => { const dd = x.dims.find((y) => y.id === id); if (dd) dd.type = ty.value; })); extra.push(fld(t('drw.f.type'), ty)); }
    if (d.type === 'ang') { const sup = h('input', { type: 'checkbox', checked: !!d.sup }); sup.addEventListener('change', () => this.mut((x) => { const dd = x.dims.find((y) => y.id === id); if (dd) dd.sup = sup.checked; })); extra.push(fld(t('drw.f.sup'), sup)); }
    this.side.replaceChildren(
      h('header', {}, h('h3', { text: t('drw.props_dim') }), h('button', { class: 'btn ghost', type: 'button', 'aria-label': t('common.close'), onclick: () => this.select(null), text: '×' })),
      ...(info?.lost ? [h('div', { class: 'callout warn', 'data-testid': 'drw-dim-lost', text: t('drw.dim_lost') })] : []),
      h('div', { class: 'drw-val', 'data-testid': 'drw-dim-val', text: info?.text ? info.text.main : '' }),
      ...extra, fld(t('drw.f.tol'), kind), upR, loR, fitR, showR, fld(t('drw.f.fai'), fai), msg,
      h('div', { class: 'row' }, h('button', { class: 'btn primary', 'data-testid': 'drw-dim-apply', onclick: apply }, t('common.ok')), h('button', { class: 'btn', 'data-testid': 'drw-dim-del', onclick: () => this.deleteSel() }, t('drw.delete'))));
    this.side.classList.remove('hidden');
  }
  openViewProps(id) {
    const dr = this.current(); const v = dr?.views.find((x) => x.id === id); if (!v) return;
    const hid = h('input', { type: 'checkbox', checked: v.hidden !== false }); const cm = h('input', { type: 'checkbox', checked: v.cmark !== false });
    hid.addEventListener('change', () => this.mut((x) => { const w = x.views.find((y) => y.id === id); if (w) w.hidden = hid.checked; }));
    cm.addEventListener('change', () => this.mut((x) => { const w = x.views.find((y) => y.id === id); if (w) w.cmark = cm.checked; }));
    const rows = [fld(t('drw.f.hidden'), hid), fld(t('drw.f.cmark'), cm)];
    if (v.kind === 'base' || v.kind === 'det') { const sc = scaleSelect(v.scale || (v.kind === 'base' ? dr.sheet.scale : 2), v.kind === 'base'); sc.addEventListener('change', () => this.mut((x) => { const w = x.views.find((y) => y.id === id); if (!w) return; if (sc.value === 'sheet') delete w.scale; else w.scale = +sc.value; })); rows.push(fld(t('drw.f.scale'), sc)); }
    if (v.kind === 'sec') { const ang = h('select', {}, h('option', { value: '0', text: t('drw.cut.h'), selected: !v.cut.ang }), h('option', { value: '90', text: t('drw.cut.v'), selected: v.cut.ang === 90 })); ang.addEventListener('change', () => this.mut((x) => { const w = x.views.find((y) => y.id === id); if (w) w.cut.ang = +ang.value; })); const fl = h('input', { type: 'checkbox', checked: !!v.cut.flip }); fl.addEventListener('change', () => this.mut((x) => { const w = x.views.find((y) => y.id === id); if (w) w.cut.flip = fl.checked; })); rows.push(fld(t('drw.f.cut'), ang), fld(t('drw.f.flip'), fl)); }
    this.side.replaceChildren(h('header', {}, h('h3', { text: t('drw.kind.' + v.kind) + (v.label ? ' ' + v.label : '') }), h('button', { class: 'btn ghost', type: 'button', 'aria-label': t('common.close'), onclick: () => this.select(null), text: '×' })),
      ...rows, h('div', { class: 'row' }, h('button', { class: 'btn', 'data-testid': 'drw-view-del', onclick: () => this.deleteSel() }, t('drw.delete'))));
    this.side.classList.remove('hidden');
  }
  // ------------------------------------------------------------ sayfa
  async newSheet() {
    if (this.app.mode !== 'drawing') this.app.setMode('drawing');
    if (!this.hasModel()) { toast(t('err.drw.no_model')); return; }
    let bb = null; try { bb = (await this.app.query('drawProject', { views: [] })).bbox; } catch (e) { toast(errText(e), true); return; }
    const used = new Set(this.list().map((d) => d.id));
    const dr = newDrawing({ name: t('drw.sheet_n', { n: this.list().length + 1 }), dec: t('drw.dec') === '.' ? '.' : ',', bbox: bb, used }); addStdViews(dr, bb);
    dr.sheet.tb.title = this.app.fileName ? String(this.app.fileName).replace(/\.mhnk$/i, '').slice(0, 200) : '';
    this.app.commitMeta((doc) => { if (!Array.isArray(doc.drawings)) doc.drawings = []; doc.drawings.push(dr); });
    this.cur = dr.id; this.vb = null; this.refresh();
  }
  async sheetSettings() {
    const dr = this.current(); if (!dr) { toast(t('drw.need_sheet')); return; }
    const sh = dr.sheet; const tb = sh.tb || {};
    const size = h('select', { 'data-testid': 'drw-size' }, ...Object.keys(SHEETS).map((k) => h('option', { value: k, text: k, selected: sh.size === k })));
    const orient = h('select', {}, h('option', { value: 'land', text: t('drw.or_land'), selected: sh.orient !== 'port' }), h('option', { value: 'port', text: t('drw.or_port'), selected: sh.orient === 'port' }));
    const angle = h('select', { 'data-testid': 'drw-angle' }, h('option', { value: 'first', text: t('drw.angle.first'), selected: sh.angle !== 'third' }), h('option', { value: 'third', text: t('drw.angle.third'), selected: sh.angle === 'third' }));
    const scale = scaleSelect(sh.scale || 1, false);
    const prec = h('select', {}, ...[0, 1, 2, 3, 4].map((n) => h('option', { value: String(n), text: String(n), selected: (sh.prec ?? 2) === n })));
    const dec = h('select', {}, h('option', { value: ',', text: t('drw.dec_comma'), selected: sh.dec !== '.' }), h('option', { value: '.', text: t('drw.dec_point'), selected: sh.dec === '.' }));
    const name = h('input', { type: 'text', value: dr.name || '' });
    const fields = TB_FIELDS.map((k) => [k, h('input', { type: 'text', value: tb[k] || '', maxlength: '200', 'data-testid': 'drw-tb-' + k })]);
    const r = await modal({ title: t('drw.cmd.sheet'), width: 560, content: h('div', { class: 'drw-sheet-form' }, fld(t('common.name'), name), fld(t('drw.f.size'), size), fld(t('drw.f.orient_sheet'), orient), fld(t('drw.f.angle'), angle), fld(t('drw.f.scale'), scale), fld(t('drw.f.prec'), prec), fld(t('drw.f.dec'), dec),
      h('h4', { text: t('drw.tb_head') }), ...fields.map(([k, inp]) => fld(t('drw.tb.' + k), inp))), buttons: [{ label: t('common.cancel'), value: null }, { label: t('common.ok'), cls: 'pri primary', value: 'ok' }] });
    if (r !== 'ok') return;
    this.mut((d) => { d.name = name.value.slice(0, 200); d.sheet.size = size.value; d.sheet.orient = orient.value; d.sheet.angle = angle.value; d.sheet.scale = +scale.value; d.sheet.prec = +prec.value; d.sheet.dec = dec.value; d.sheet.tb = Object.fromEntries(fields.map(([k, inp]) => [k, inp.value.slice(0, 200)])); });
    this.vb = null;
  }
  async renameSheet(id) { const d = this.list().find((x) => x.id === id); if (!d) return; const s = await promptText(t('drw.rename'), d.name || ''); if (s == null) return; this.app.commitMeta((doc) => { const x = doc.drawings.find((y) => y.id === id); if (x) x.name = s.slice(0, 200); }); this.render(); }
  async deleteSheet(id) { const d = this.list().find((x) => x.id === id); if (!d) return; if (!(await confirmBox(t('drw.del_sheet_title'), t('drw.del_sheet_body', { name: d.name || '' }), t('drw.delete'), t('common.giveup'), { danger: true }))) return; this.app.commitMeta((doc) => { doc.drawings = doc.drawings.filter((y) => y.id !== id); }); if (this.cur === id) this.cur = null; this.vb = null; this.refresh(); }
  openSheet(id) { this.cur = id; this.sel = null; this.vb = null; this.closeProps(); this.refresh(); }
  // ------------------------------------------------------------ cikti
  baseName() { const dr = this.current(); return String(dr?.sheet.tb?.number || dr?.name || this.app.fileName || 'resim').replace(/\.mhnk$/i, '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'resim'; }
  async exportPdf() {
    if (!this.current()) { toast(t('drw.need_sheet')); return; }
    try {
      const pages = [];
      for (const dr of this.list()) { const C = await computeDrawing(dr, (c, a) => this.app.query(c, a), (k, p) => t(k, p), this.app.result?.holes || []); pages.push({ W: C.W, H: C.H, list: C.list }); }
      const p = await this.app.writeOut(toPdf(pages, { title: this.baseName() }), this.baseName() + '.pdf', 'pdf', true); if (p) toast(t('drw.saved', { name: String(p).split(/[\\/]/).pop() }));
    } catch (e) { toast(t('drw.export_failed', { msg: errText(e) }), true); }
  }
  async exportDxf() {
    if (!this.C) { toast(t('drw.need_sheet')); return; }
    try { const dx = toDxf({ W: this.C.W, H: this.C.H, list: this.C.list }); const p = await this.app.writeOut(new TextEncoder().encode(dx.text), this.baseName() + '.dxf', 'dxf', true); if (p) toast(t('drw.saved', { name: String(p).split(/[\\/]/).pop() })); }
    catch (e) { toast(t('drw.export_failed', { msg: errText(e) }), true); }
  }
  toggleFai() { if (!this.current()) { toast(t('drw.need_sheet')); return; } this.mut((d) => { d.fai = !d.fai; }); }
  async exportFai(kind) {
    const dr = this.current(); if (!dr || !this.C) { toast(t('drw.need_sheet')); return; }
    const rows = faiRows(dr, this.C, (k, p) => t(k, p)); if (!rows.length) { toast(t('drw.fai_empty')); return; }
    try {
      const bytes = kind === 'csv' ? new TextEncoder().encode(faiCsv(rows, (k, p) => t(k, p), dr.sheet.dec || ',')) : toPdf(faiPages(dr, rows, (k, p) => t(k, p)), { title: t('drw.fai.title') });
      const p = await this.app.writeOut(bytes, this.baseName() + '-' + t('drw.fai_file') + '.' + kind, kind, true); if (p) toast(t('drw.saved', { name: String(p).split(/[\\/]/).pop() }));
    } catch (e) { toast(t('drw.export_failed', { msg: errText(e) }), true); }
  }
  // ------------------------------------------------------------ serit, tarayici, komutlar
  registerCommands(C) {
    const reg = (id, name, ic, run, o = {}) => C.reg(id, name, ic, run, { drw: true, tip: 'drw.tip.' + id.replace('drw-', '').replace('-', '_'), ...o });
    const needSheet = () => (this.current() ? (this.hasModel() ? null : t('err.drw.no_model')) : t('drw.need_sheet'));
    reg('drw-new', 'drw.cmd.new', 'file-new', () => this.newSheet(), { off: () => (this.hasModel() ? null : t('err.drw.no_model')) });
    reg('drw-sheet', 'drw.cmd.sheet', 'settings', () => this.sheetSettings(), { off: () => (this.current() ? null : t('drw.need_sheet')) });
    reg('drw-base', 'drw.cmd.base', 'view-front', () => this.startTool('base'), { off: needSheet });
    reg('drw-proj', 'drw.cmd.proj', 'view-right', () => this.startTool('proj'), { off: needSheet });
    reg('drw-sec', 'drw.cmd.sec', 'section', () => this.startTool('sec'), { off: needSheet });
    reg('drw-det', 'drw.cmd.det', 'search', () => this.startTool('det'), { off: needSheet });
    reg('drw-lin', 'drw.cmd.lin', 'hdim', () => this.startTool('lin'), { off: needSheet });
    reg('drw-dia', 'drw.cmd.dia', 'dim-radius', () => this.startTool('dia'), { off: needSheet });
    reg('drw-ang', 'drw.cmd.ang', 'dim', () => this.startTool('ang'), { off: needSheet });
    reg('drw-ord', 'drw.cmd.ord', 'point', () => this.startTool('ord'), { off: needSheet });
    reg('drw-cline', 'drw.cmd.cline', 'concentric', () => this.startTool('cline'), { off: needSheet });
    reg('drw-rough', 'drw.cmd.rough', 'vdim', () => this.startTool('rough'), { off: needSheet });
    reg('drw-note', 'drw.cmd.note', 'text', () => this.startTool('note'), { off: needSheet });
    reg('drw-holes', 'drw.cmd.holes', 'hole', () => this.startTool('holes'), { off: needSheet });
    reg('drw-pdf', 'drw.cmd.pdf', 'export', () => this.exportPdf(), { off: needSheet });
    reg('drw-dxf', 'drw.cmd.dxf', 'dxf-export', () => this.exportDxf(), { off: needSheet });
    reg('drw-fai', 'drw.cmd.fai', 'check', () => this.toggleFai(), { off: needSheet });
    reg('drw-fai-pdf', 'drw.cmd.fai_pdf', 'export', () => this.exportFai('pdf'), { off: needSheet });
    reg('drw-fai-csv', 'drw.cmd.fai_csv', 'export', () => this.exportFai('csv'), { off: needSheet });
  }
  ribbon(R) {
    const { group, toolBtn } = R; const on = (k) => this.tool?.kind === k; const b = (id, k) => toolBtn(id, k ? { on: on(k) } : {});
    const G = (key, nm, ids, o = {}) => group(key, nm, ids.map(([id, k]) => b(id, k)), { items: ids.map(([id]) => id), ...o });
    return [
      G('drw-sheet', 'drw.grp.sheet', [['drw-new'], ['drw-sheet']]),
      G('drw-views', 'drw.grp.views', [['drw-base', 'base'], ['drw-proj', 'proj'], ['drw-sec', 'sec'], ['drw-det', 'det']]),
      G('drw-dims', 'drw.grp.dims', [['drw-lin', 'lin'], ['drw-dia', 'dia'], ['drw-ang', 'ang'], ['drw-ord', 'ord']]),
      G('drw-sym', 'drw.grp.symbols', [['drw-cline', 'cline'], ['drw-rough', 'rough'], ['drw-note', 'note'], ['drw-holes', 'holes']]),
      G('drw-out', 'drw.grp.output', [['drw-pdf'], ['drw-dxf'], ['drw-fai'], ['drw-fai-pdf'], ['drw-fai-csv']], { cls: 'end' }),
    ];
  }
  renderBrowser(br) {
    const list = this.list(); const cur = this.current();
    const row = (d) => h('div', { class: 'trow' + (cur && d.id === cur.id ? ' sel' : ''), 'data-testid': 'drw-sheet-row', 'data-id': d.id, tabindex: 0, role: 'button', onclick: () => this.openSheet(d.id), ondblclick: () => this.renameSheet(d.id),
      oncontextmenu: (e) => { e.preventDefault(); this.deleteSheet(d.id); } }, h('span', { class: 'nm', text: (d.name || d.id) + ' · ' + d.sheet.size + ' · ' + scaleText(d.sheet.scale) }));
    const kids = [h('div', { class: 'bsec' }, h('span', { text: t('drw.br.sheets') }), h('button', { class: 'btn ghost', 'data-testid': 'drw-br-new', title: t('drw.cmd.new'), onclick: () => this.newSheet(), text: '+' }))];
    if (!list.length) kids.push(h('div', { class: 'trow empty', text: t('drw.br.none') }));
    kids.push(...list.map(row));
    if (cur) {
      kids.push(h('div', { class: 'bsec' }, h('span', { text: t('drw.br.views') })));
      for (const v of cur.views) kids.push(h('div', { class: 'trow' + (this.sel?.kind === 'view' && this.sel.id === v.id ? ' sel' : ''), tabindex: 0, role: 'button', onclick: () => this.select({ kind: 'view', id: v.id }) }, h('span', { class: 'nm', text: t('drw.kind.' + v.kind) + (v.kind === 'base' ? ' (' + t('drw.or.' + v.orient) + ')' : v.label ? ' ' + v.label : '') })));
      const lost = this.C ? this.C.dims.filter((d) => d.lost).length : 0;
      kids.push(h('div', { class: 'bsec' }, h('span', { text: t('drw.br.dims', { n: cur.dims.length }) })));
      if (lost) kids.push(h('div', { class: 'trow err', text: t('drw.lost_n', { n: lost }) }));
    }
    br.replaceChildren(...kids);
  }
  renderBottom(tl) { tl.replaceChildren(h('div', { class: 'tl-label', text: this.current() ? t('drw.bottom', { name: this.current().name || '', size: this.current().sheet.size, scale: scaleText(this.current().sheet.scale) }) : t('drw.br.none') })); }
}

// ------------------------------------------------------------ yardimcilar
function fld(label, ctl) { return h('div', { class: 'fld' }, h('label', { text: label }), h('div', { class: 'ctl' }, ctl)); }
function scaleSelect(cur, withSheet) {
  const opts = STD_SCALES.map((s) => h('option', { value: String(s), text: scaleText(s), selected: !withSheet && Math.abs(s - cur) < 1e-9 }));
  return h('select', { 'data-testid': 'drw-scale' }, ...(withSheet ? [h('option', { value: 'sheet', text: t('drw.scale_sheet'), selected: true })] : []), ...opts);
}
function viewBoxSheet(V) {
  if (!V || V.err || !V.box) return null;
  if (V.pl.c) { const r = V.v.r * V.pl.s; return [V.pl.o[0] - r, V.pl.o[1] - r, V.pl.o[0] + r, V.pl.o[1] + r]; }
  const a = toSheet(V.pl, [V.box[0], V.box[1]]), b = toSheet(V.pl, [V.box[2], V.box[3]]); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}
function dragDim(d, dx, dy) {
  if (d.type === 'lin') { const dir = d.dir || 'h'; const delta = dir === 'h' ? dy : dir === 'v' ? dx : Math.hypot(dx, dy) * Math.sign(dy || dx); d.off = (Number.isFinite(d.off) ? d.off : 10) + delta; }
  else if (d.type === 'dia' || d.type === 'rad') { d.off = Math.max(3, (Number.isFinite(d.off) ? d.off : 8) + Math.hypot(dx, dy) * Math.sign(dx + dy)); }
  else if (d.type === 'ang' || d.type === 'ord') d.off = Math.max(3, (Number.isFinite(d.off) ? d.off : 10) + (d.axis === 'y' ? dx : dy));
}
// Yeni ana gorunusu tiklanan noktaya ortala: model kutusu merkezinin gorunus izdusumu p'ye gelir
function placeAt(app, orient, p, s) { const dr = { sheet: { angle: 'first' }, views: [] }; const v = { id: 'x', kind: 'base', orient, o: [0, 0] }; return placeBasis(app, viewBasis(dr, v), p, s); }
function placeBasis(app, B, p, s) {
  const bodies = app.result?.bodies || []; let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const b of bodies) { const v = b.vertices || []; for (let i = 0; i + 2 < v.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[i + k]); hi[k] = Math.max(hi[k], v[i + k]); } }
  if (!Number.isFinite(lo[0])) { lo = [0, 0, 0]; hi = [0, 0, 0]; }
  const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]; const u = c[0] * B.x[0] + c[1] * B.x[1] + c[2] * B.x[2], v = c[0] * B.y[0] + c[1] * B.y[1] + c[2] * B.y[2];
  return [p[0] - s * u, p[1] - s * v];
}
function nextLabel(dr) { const used = new Set(dr.views.map((v) => v.label).filter(Boolean)); for (let i = 0; i < 26; i++) { const L = String.fromCharCode(65 + i); if (!used.has(L)) return L; } return 'Z'; }
function niceScale(s) { let best = STD_SCALES[0]; for (const x of STD_SCALES) if (Math.abs(Math.log(x / s)) < Math.abs(Math.log(best / s))) best = x; return best; }
function nearEnd(prim, q) { const e = ends(prim); if (!e) return 'c'; const L = dist(e[0], e[1]); const d0 = dist(e[0], q), d1 = dist(e[1], q); if (prim.t === 'l' && Math.min(d0, d1) > L * 0.3) return 'm'; return d0 <= d1 ? 'a' : 'b'; }
function refPt(pk) { const p = pk.prim; if (pk.pt === 'c') return p.c; if (pk.pt === 'm') return p.t === 'l' ? [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2] : p.c || p.pts[p.pts.length >> 1]; const e = ends(p); return pk.pt === 'a' ? e[0] : e[1]; }
function closestOnLine(q, L) { const d = [L.b[0] - L.a[0], L.b[1] - L.a[1]]; const l2 = d[0] * d[0] + d[1] * d[1] || 1; const u = Math.max(0, Math.min(1, ((q[0] - L.a[0]) * d[0] + (q[1] - L.a[1]) * d[1]) / l2)); return [L.a[0] + d[0] * u, L.a[1] + d[1] * u]; }

export const initDrawing = (app) => new DrawingCtl(app);
