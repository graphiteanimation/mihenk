// Düzenleme araçları ve eskiz yardımcıları (Sketcher.prototype'a eklenir): budama/uzatma/bölme, ofset, köşe, ayna,
// desenler, taşı/kopyala/döndür/ölçekle, izdüşüm, pano, sağ tık menüsü ve çizerken sayısal giriş.
import { THREE, COL } from '../viewport.js';
import { h } from '../dom.js';
import { G, clone, getEnt, segOf, entPts, measureDim } from './core.js';
import { trimAt, extendAt, breakAt, trimSpan, offsetEnts, cornerAt, mirrorEnts, patternRect, patternCirc, transformEnts, projectPolylines, reprojectLinked, copySelection, pasteClip } from './ops.js';
import { sketchPolylines } from '../viewport.js';
import { evalExpr } from '../../shared/expr.js';
import { t, tk, errText, fmtNum } from '../../shared/i18n.js';
import { toLocal } from '../../shared/vec.js';
import { selOn, selClass } from './opts.js';

export const EDIT_TOOLS = ['trim', 'extend', 'break', 'offset', 'fillet', 'chamfer', 'mirror', 'patrect', 'patcirc', 'move', 'copy', 'rotate', 'scale', 'project'];
const NEEDS_SEL = new Set(['offset', 'mirror', 'patrect', 'patcirc', 'move', 'copy', 'rotate', 'scale']);
const fmt = (v) => fmtNum(Number(v), 3);
let CLIP = null; // oturumlar arası pano
let PASTE_N = 0;

const KIND = { move: tk('sk.kind.move'), copy: tk('sk.kind.copy'), rotate: tk('sk.kind.rotate'), scale: tk('sk.kind.scale') };
const errOf = (r) => () => t(r.err.key, r.err.params || {});

export const EDIT_METHODS = {
  // ------------------------------------------------------------------ ortak yardımcılar
  _edNum(txt) { return evalExpr(String(txt), this.getVars()); },
  // sk üzerinde saf işlem uygular; hata → geri al + durum satırı. extra: {note, after(res)}
  _runOp(fn, kind, extra = {}) {
    let res = null;
    const p = this._apply((sk) => { res = fn(sk); if (!res || !res.ok) return errOf(res || { err: { key: 'sk.op.nothing' } }); }, {
      kind, still: !!extra.still, note: () => (res && res.removedCons ? t('sk.op.cons_removed', { n: res.removedCons }) + (extra.note ? ' ' + extra.note(res) : '') : extra.note && res ? extra.note(res) : ''),
    });
    return p.then((r) => { if (r.ok && extra.after) extra.after(res); return r; });
  },
  _previewOp(fn, color = COL.sketch, dashed = true) {
    const sk2 = clone(this.sk); let r; try { r = fn(sk2); } catch (e) { return null; }
    if (!r || !r.ok) return r;
    const old = new Set(this.sk.ents.map((e) => e.id)); const mine = (e) => !old.has(e.id) || (r.changed && r.changed.has && r.changed.has(e.id));
    for (const s of sketchPolylines(sk2, mine)) this._line(s.pts, color, dashed);
    return r;
  },
  _entsSel() { return this.selection.filter((s) => s.kind === 'ent').map((s) => s.id); },
  // uç noktaları paylaşan, düğümü tam iki eğri paylaşan zincir
  _chainOf(id) {
    const sk = this.sk, cur = sk.ents.filter((e) => e.type !== 'point'); const e0 = cur.find((e) => e.id === id); if (!e0) return [];
    const users = (p) => cur.filter((e) => entPts(e).includes(p) && !((e.type === 'circle' || e.type === 'arc' || e.type === 'ellipse' || e.type === 'ellarc') && e.c === p));
    const ends = (e) => (e.type === 'line' || e.type === 'arc' || e.type === 'ellarc' ? [e.a, e.b] : e.type === 'spline' && !e.closed ? [e.pts[0], e.pts[e.pts.length - 1]] : []);
    const seen = new Set([id]), q = [e0];
    while (q.length) { const e = q.pop(); for (const p of ends(e)) { const u = users(p); if (u.length !== 2) continue; for (const o of u) if (!seen.has(o.id) && ends(o).includes(p)) { seen.add(o.id); q.push(o); } } }
    return [...seen];
  },

  // ------------------------------------------------------------------ pano
  selectAll() {
    if (!this.active) return;
    this._setSel(this.sk.ents.filter((e) => selOn(selClass('ent', e))).map((e) => ({ kind: 'ent', id: e.id })));
    this._status('sk.selected_n', { n: this.selection.length });
  },
  copyClip() {
    const ids = this._entsSel(); if (!ids.length) return this._status('sk.pick_first');
    CLIP = copySelection(this.sk, ids); PASTE_N = 0; this._status('sk.clip_copied', { n: ids.length });
  },
  cutClip() {
    const ids = this._entsSel(); if (!ids.length) return this._status('sk.pick_first');
    CLIP = copySelection(this.sk, ids); PASTE_N = 0; this.deleteSelection();
  },
  pasteClip() {
    if (!CLIP) return this._status('sk.op.clip_empty');
    PASTE_N++; const d = 5 * PASTE_N; let res;
    return this._apply((sk) => { res = pasteClip(sk, CLIP, d, d); if (!res.ok) return errOf(res); }, { kind: tk('sk.kind.paste') }).then((r) => { if (r.ok && res) this._setSel(res.newEnts.map((id) => ({ kind: 'ent', id }))); return r; });
  },

  // ------------------------------------------------------------------ iletişim kutusu
  _openDialog(spec) {
    this._closeDialog(); const vals = () => { const o = {}; for (const el of d.querySelectorAll('[data-k]')) o[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; return o; };
    const rows = spec.fields.map((f) => {
      let inp;
      if (f.type === 'check') { inp = h('input', { type: 'checkbox', 'data-k': f.k }); inp.checked = !!f.value; }
      else if (f.type === 'select') { inp = h('select', { 'data-k': f.k }, ...f.options.map(([v, l]) => h('option', { value: v }, t(l)))); inp.value = f.value; }
      else { inp = h('input', { type: 'text', 'data-k': f.k, value: f.value ?? '' }); if (f.placeholder) inp.placeholder = t(f.placeholder); }
      return h('label', { class: 'row' }, h('span', {}, t(f.label)), inp);
    });
    const d = h('div', { class: 'sk-dlg', 'data-tool': this.tool },
      h('div', { class: 't' }, t(spec.title)), ...rows, spec.note ? h('div', { class: 'n' }, t(spec.note)) : '',
      h('div', { class: 'b' }, h('button', { class: 'btn pri', 'data-act': 'sk-dlg-ok', onclick: () => spec.onOk(vals()) }, t(spec.ok || 'common.ok')), h('button', { class: 'btn', 'data-act': 'sk-dlg-cancel', onclick: () => this.setTool('select') }, t('common.cancel'))));
    d.style.cssText = 'position:absolute;left:12px;top:12px;pointer-events:auto;z-index:6;';
    d.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); spec.onOk(vals()); } else if (ev.key === 'Escape') { ev.preventDefault(); this.setTool('select'); } });
    d.addEventListener('pointerdown', (ev) => ev.stopPropagation()); d.addEventListener('mousedown', (ev) => ev.stopPropagation());
    d.addEventListener('input', () => { this._dlgDirty = true; if (spec.onInput) spec.onInput(vals()); this._renderPreview(); });
    d.addEventListener('change', () => { if (spec.onInput) spec.onInput(vals()); this._renderPreview(); });
    this.ovl.appendChild(d); this._dlg = d; this._dlgVals = vals; this._dlgSet = (k, v) => { const el = d.querySelector(`[data-k="${k}"]`); if (el) el.value = v; };
    const first = d.querySelector('input[type=text]'); if (first && spec.focus !== false) first.focus();
    return d;
  },
  _closeDialog() { if (this._dlg) { this._dlg.remove(); this._dlg = null; this._dlgVals = null; } },
  _dv() { return this._dlgVals ? this._dlgVals() : {}; },

  // ------------------------------------------------------------------ araca giriş
  _editEnter(name, prevSel) {
    this._ed = { tool: name }; const ed = this._ed;
    if (NEEDS_SEL.has(name)) this.selection = (prevSel || []).filter((s) => s.kind === 'ent'); else this.selection = [];
    this._renderGL(); this.onChange();
    const bad = (k) => { this._status(() => t('sk.op.expr_bad', { msg: k })); };
    switch (name) {
      case 'offset':
        this._openDialog({
          title: 'sk.dlg.offset', fields: [{ k: 'dist', label: 'sk.dlg.dist', value: '', placeholder: 'sk.dlg.dist_ph' }, { k: 'join', label: 'sk.dlg.join', type: 'select', value: 'sharp', options: [['sharp', 'sk.dlg.join_sharp'], ['round', 'sk.dlg.join_round']] }],
          ok: 'sk.dlg.apply', note: 'sk.dlg.offset_note', onOk: () => this._offsetCommit(this.cursor && this.cursor.loc),
        }); break;
      case 'fillet': case 'chamfer':
        this._openDialog({ title: name === 'fillet' ? 'sk.dlg.fillet' : 'sk.dlg.chamfer', fields: [{ k: 'val', label: name === 'fillet' ? 'sk.dlg.radius' : 'sk.dlg.length', value: '5' }], ok: 'sk.dlg.apply', note: 'sk.dlg.corner_note', onOk: () => this._cornerGo(), focus: false }); break;
      case 'mirror':
        ed.phase = 0;
        this._openDialog({ title: 'sk.dlg.mirror', fields: [{ k: 'linked', label: 'sk.dlg.linked', type: 'check', value: true }], ok: 'sk.dlg.next', note: 'sk.dlg.mirror_note', onOk: () => this._mirNext(), focus: false }); break;
      case 'patrect':
        this._openDialog({
          title: 'sk.dlg.patrect', fields: [{ k: 'n1', label: 'sk.dlg.n1', value: '3' }, { k: 's1', label: 'sk.dlg.s1', value: '10' }, { k: 'n2', label: 'sk.dlg.n2', value: '1' }, { k: 's2', label: 'sk.dlg.s2', value: '10' }, { k: 'ang', label: 'sk.dlg.ang', value: '0' }, { k: 'linked', label: 'sk.dlg.linked', type: 'check', value: true }],
          ok: 'sk.dlg.apply', onOk: (v) => this._patGo(v), onInput: () => {},
        }); break;
      case 'patcirc':
        ed.cid = 'O';
        this._openDialog({ title: 'sk.dlg.patcirc', fields: [{ k: 'n', label: 'sk.dlg.count', value: '6' }, { k: 'total', label: 'sk.dlg.total', value: '360' }, { k: 'linked', label: 'sk.dlg.linked', type: 'check', value: true }], ok: 'sk.dlg.apply', note: 'sk.dlg.patcirc_note', onOk: (v) => this._patGo(v) }); break;
      case 'move': case 'copy':
        this._openDialog({ title: name === 'move' ? 'sk.dlg.move' : 'sk.dlg.copy', fields: [{ k: 'dx', label: 'sk.dlg.dx', value: '10' }, { k: 'dy', label: 'sk.dlg.dy', value: '0' }], ok: 'sk.dlg.apply', note: 'sk.dlg.move_note', onOk: (v) => this._xformGo(v) }); break;
      case 'rotate':
        ed.base = [0, 0];
        this._openDialog({ title: 'sk.dlg.rotate', fields: [{ k: 'angle', label: 'sk.dlg.angle', value: '90' }, { k: 'cx', label: 'sk.dlg.cx', value: '0' }, { k: 'cy', label: 'sk.dlg.cy', value: '0' }, { k: 'copy', label: 'sk.dlg.keep', type: 'check', value: false }], ok: 'sk.dlg.apply', note: 'sk.dlg.base_note', onOk: (v) => this._xformGo(v) }); break;
      case 'scale':
        this._openDialog({ title: 'sk.dlg.scale', fields: [{ k: 'k', label: 'sk.dlg.factor', value: '2' }, { k: 'cx', label: 'sk.dlg.cx', value: '0' }, { k: 'cy', label: 'sk.dlg.cy', value: '0' }, { k: 'copy', label: 'sk.dlg.keep', type: 'check', value: false }], ok: 'sk.dlg.apply', note: 'sk.dlg.base_note', onOk: (v) => this._xformGo(v) }); break;
      case 'project':
        this._openDialog({ title: 'sk.dlg.project', fields: [{ k: 'mode', label: 'sk.dlg.pmode', type: 'select', value: 'plane', options: [['plane', 'sk.dlg.pm_plane'], ['all', 'sk.dlg.pm_all']] }], ok: 'sk.dlg.apply', note: 'sk.dlg.project_note', onOk: (v) => this._projectGo(v), focus: false }); break;
      default: break;
    }
    void bad;
  },

  // yalnız eğrileri hedefler (noktaları atlar): budama/uzatma/bölmede uca yakın tıklamak doğal olmalı
  _hitEnt(loc) {
    const tol = 8 * this.vp.worldPerPixel(); let best = null;
    for (const e of this.sk.ents) { if (e.type === 'point') continue; const r = this._entDist(e, loc); if (r && r.d <= tol && (!best || r.d < best.d)) best = { kind: 'ent', id: e.id, d: r.d, x: r.x, y: r.y }; }
    return best;
  },
  // ------------------------------------------------------------------ fare
  _editDown(loc, ev) {
    const tool = this.tool, ed = this._ed || (this._ed = { tool }); const hit = tool === 'trim' || tool === 'extend' || tool === 'break' ? this._hitEnt(loc) : this._hit(loc);
    if (tool === 'trim') { if (!hit || hit.kind !== 'ent') return this._status('sk.op.click_curve'); this._trimming = true; this._trimmed = new Set(); return this._trimOne(hit.id, loc); }
    if (tool === 'extend') { if (!hit || hit.kind !== 'ent') return this._status('sk.op.click_curve'); return this._runOp((sk) => extendAt(sk, hit.id, loc), tk('sk.kind.extend')); }
    if (tool === 'break') { if (!hit || hit.kind !== 'ent') return this._status('sk.op.click_curve'); return this._runOp((sk) => breakAt(sk, hit.id, loc), tk('sk.kind.break'), { still: true }); }
    if (tool === 'fillet' || tool === 'chamfer') return this._cornerClick(hit);
    if (tool === 'project') return;
    if (tool === 'mirror' && ed.phase === 1) return this._mirAxis(hit);
    if (tool === 'patcirc' && hit && hit.kind === 'point') { ed.cid = hit.id; this._status('sk.op.center_set', { id: hit.id }); this._renderPreview(); return; }
    if ((tool === 'rotate' || tool === 'scale') && hit && hit.kind === 'point') { const p = this.sk.points[hit.id]; this._dlgSet('cx', fmt(p.x)); this._dlgSet('cy', fmt(p.y)); this._status('sk.op.base_set', { id: hit.id }); return; }
    if ((tool === 'move' || tool === 'copy') && hit && hit.kind === 'point') {
      const p = this.sk.points[hit.id];
      if (!ed.base) { ed.base = [p.x, p.y]; this._status('sk.op.base_set', { id: hit.id }); this.setHint('hint.move_target'); return; }
      this._dlgSet('dx', fmt(p.x - ed.base[0])); this._dlgSet('dy', fmt(p.y - ed.base[1])); ed.base = null; return this._xformGo(this._dv());
    }
    if (hit && hit.kind === 'ent') { // seçim değiştir (ofsette zincir)
      const ids = tool === 'offset' ? this._chainOf(hit.id) : [hit.id]; const on = this._isSel({ kind: 'ent', id: hit.id });
      const rest = this.selection.filter((s) => !ids.includes(s.id));
      this._setSel(on ? rest : [...rest, ...ids.map((id) => ({ kind: 'ent', id }))]);
      this._status('sk.selected_n', { n: this.selection.length });
      if (tool === 'offset' && !on) this._offsetFocus();
    } else if (tool === 'offset' && this.selection.length) this._offsetCommit(loc);
    else if (!hit && !ev.shiftKey) this._setSel([]);
  },
  _editMove(loc, ev) {
    const tool = this.tool, ed = this._ed || (this._ed = { tool }); const sn = this._snapAt(loc, ev); this.cursor = { ...sn, loc };
    const hit = tool === 'trim' || tool === 'extend' || tool === 'break' ? this._hitEnt(loc) : this._hit(loc); this._setHover(hit);
    if (tool === 'trim') {
      if (this._trimming && (ev.buttons & 1) && hit && hit.kind === 'ent' && !this._trimmed.has(hit.id)) this._trimOne(hit.id, loc);
      ed.span = hit && hit.kind === 'ent' && !this._trimming ? trimSpan(this.sk, hit.id, loc) : null;
    }
    if (tool === 'extend') ed.hot = hit && hit.kind === 'ent' ? hit.id : null;
    this._renderPreview();
  },
  _editUp() { this._trimming = false; this._trimmed = null; },
  async _trimOne(entId, loc) {
    const before = new Set(this.sk.ents.map((e) => e.id)); this._trimmed.add(entId);
    const p = this._runOp((sk) => trimAt(sk, entId, [loc[0], loc[1]]), tk('sk.kind.trim'), { still: true }); // C-21: budama kalan geometriyi oynatmaz
    for (const e of this.sk.ents) if (!before.has(e.id)) this._trimmed.add(e.id);
    const r = await p; if (this._ed) this._ed.span = null; return r;
  },

  // ------------------------------------------------------------------ önizleme
  _editPreview(cur) {
    const tool = this.tool, ed = this._ed || {}; let tip = ''; const loc = cur ? cur.loc : null;
    const thick = (pts, col) => { const w = this.vp.worldPerPixel(); for (const o of [[0, 0], [w, 0], [-w, 0], [0, w], [0, -w]]) this._line(pts.map((p) => [p[0] + o[0], p[1] + o[1]]), col); };
    if (tool === 'trim' && ed.span && !this._trimming) thick(ed.span.pts, COL.err);
    else if (tool === 'extend' && ed.hot && loc) { this._previewOp((sk) => extendAt(sk, ed.hot, loc), COL.ok, false); const sk2 = clone(this.sk); if (extendAt(sk2, ed.hot, loc).ok) { const e = getEnt(sk2, ed.hot), sg = e && segOf(sk2, e); if (sg) thick(G.sample(sg, 0.05), COL.ok); } }
    else if (tool === 'break' && loc) { const hit = this._hitEnt(loc); if (hit && hit.kind === 'ent') { const w = this.vp.worldPerPixel() * 5; this._line([[hit.x - w, hit.y - w], [hit.x + w, hit.y + w]], COL.err); this._line([[hit.x - w, hit.y + w], [hit.x + w, hit.y - w]], COL.err); } }
    else if (tool === 'offset' && this.selection.length && loc) {
      const pl = this._offsetPlan(loc);
      if (pl) { const r = this._previewOp((sk) => offsetEnts(sk, pl.ids, pl.dist, pl.expr, loc, pl.join)); tip = r && !r.ok ? t(r.err.key, r.err.params || {}) : 'd = ' + fmt(pl.dist) + ' mm'; }
    } else if ((tool === 'fillet' || tool === 'chamfer') && loc) {
      const hit = this._hit(loc); const plan = this._cornerPlan(hit, true);
      if (plan) { const r = this._previewOp((sk) => cornerAt(sk, plan.vid, tool, plan.val, plan.expr, plan.a, plan.b), COL.sketch, false); if (r && !r.ok) tip = t(r.err.key, r.err.params || {}); }
      else if (this._cornerFirst) tip = t('sk.op.corner_second');
    } else if (tool === 'mirror' && ed.phase === 1 && loc) {
      const hit = this._hit(loc); if (hit && hit.kind === 'ent' && getEnt(this.sk, hit.id).type === 'line') this._previewOp((sk) => mirrorEnts(sk, this._entsSel(), hit.id, true));
    } else if (tool === 'patrect' && this._dlg) { const v = this._dv(); this._previewOp((sk) => patternRect(sk, this._entsSel(), { n1: +v.n1, n2: +v.n2, s1: v.s1, s2: v.s2, ang: v.ang, vars: this.getVars(), linked: false })); }
    else if (tool === 'patcirc' && this._dlg) { const v = this._dv(); this._previewOp((sk) => patternCirc(sk, this._entsSel(), { n: +v.n, cid: ed.cid || 'O', total: v.total, vars: this.getVars(), linked: false })); }
    else if ((tool === 'move' || tool === 'copy') && this._dlg) {
      const v = this._dv(); try { let dx = this._edNum(v.dx), dy = this._edNum(v.dy); if (ed.base && loc) { dx = loc[0] - ed.base[0]; dy = loc[1] - ed.base[1]; } this._previewOp((sk) => transformEnts(sk, this._entsSel(), 'move', { dx, dy }, { copy: true })); tip = fmt(dx) + ', ' + fmt(dy); } catch (e) {}
    } else if (tool === 'rotate' && this._dlg) { const v = this._dv(); try { const a = this._edNum(v.angle), cx = this._edNum(v.cx), cy = this._edNum(v.cy); this._previewOp((sk) => transformEnts(sk, this._entsSel(), 'rotate', { angle: a, cx, cy }, { copy: true })); } catch (e) {} }
    else if (tool === 'scale' && this._dlg) { const v = this._dv(); try { const k = this._edNum(v.k), cx = this._edNum(v.cx), cy = this._edNum(v.cy); this._previewOp((sk) => transformEnts(sk, this._entsSel(), 'scale', { k, cx, cy }, { copy: true })); } catch (e) {} }
    if (cur && cur.kind && cur.kind !== 'grid' && cur.kind !== 'free') this._showSnap(cur); else this._hideSnap();
    this._tipLoc = loc; if (tip && loc) this._showTip(tip); else this._hideTip();
  },

  // ------------------------------------------------------------------ ofset
  _offsetFocus() { const e = this.selection[0]; if (e && this._dlgVals) { const el = this._dlg.querySelector('[data-k=dist]'); if (el) el.focus(); } },
  _offsetPlan(loc) {
    const ids = this._entsSel(); if (!ids.length || !loc) return null; const v = this._dv(); let dist, expr;
    if (String(v.dist || '').trim()) { try { dist = this._edNum(v.dist); } catch (e) { return null; } expr = String(v.dist).trim(); }
    else { // imleçten zincire uzaklık
      let best = Infinity; for (const id of ids) { const e = getEnt(this.sk, id), sg = e && segOf(this.sk, e); if (sg) best = Math.min(best, G.closestPoint(sg, loc).d); }
      dist = Math.round(best * 1000) / 1000; expr = String(dist);
    }
    return { ids, dist, expr, join: v.join || 'sharp' };
  },
  _offsetCommit(loc) {
    if (!loc) return this._status('sk.op.offset_side');
    if (!this.selection.length) return this._status('sk.op.offset_pick');
    const pl = this._offsetPlan(loc); if (!pl) return this._status('sk.op.expr_bad', { msg: '' });
    return this._runOp((sk) => offsetEnts(sk, pl.ids, pl.dist, pl.expr, loc, pl.join), tk('sk.kind.offset'), { after: (r) => { this._setSel(r.newEnts.map((id) => ({ kind: 'ent', id }))); }, note: (r) => (r.linked ? t('sk.op.linked') : t('sk.op.unlinked')) });
  },

  // ------------------------------------------------------------------ köşe (yuvarlat / pah)
  _cornerPlan(hit, quiet) {
    const v = this._dv(); let val; try { val = this._edNum(v.val); } catch (e) { if (!quiet) this._status('sk.bad_expr', { msg: errText(e) }); return null; }
    if (!hit) return null; const sk = this.sk;
    if (hit.kind === 'point') return { vid: hit.id, val, expr: String(v.val).trim() };
    const first = this._cornerFirst; if (!first || first === hit.id) return null;
    const A = getEnt(sk, first), B = getEnt(sk, hit.id); if (!A || !B) return null;
    const common = entPts(A).filter((p) => entPts(B).includes(p) && !(A.c === p) && !(B.c === p));
    if (common.length !== 1) return null;
    return { vid: common[0], val, expr: String(v.val).trim(), a: first, b: hit.id };
  },
  _cornerClick(hit) {
    if (!hit) { this._cornerFirst = null; return; }
    if (hit.kind === 'ent' && !this._cornerFirst) { this._cornerFirst = hit.id; this._status('sk.op.corner_second'); return; }
    const plan = this._cornerPlan(hit); if (!plan) { this._status('sk.op.corner_two'); this._cornerFirst = null; return; }
    this._cornerFirst = null; const kind = this.tool;
    return this._runOp((sk) => cornerAt(sk, plan.vid, kind, plan.val, plan.expr, plan.a, plan.b), tk(kind === 'fillet' ? 'sk.kind.fillet' : 'sk.kind.chamfer'));
  },
  _cornerGo() { this._status('sk.dlg.corner_note'); },

  // ------------------------------------------------------------------ ayna
  _mirNext() {
    const ed = this._ed; if (!this._entsSel().length) return this._status('sk.op.mirror_pick');
    ed.phase = 1; ed.linked = !!this._dv().linked; this._mir = { phase: 1 }; this.setHint('hint.mirror_axis'); this._renderPreview();
  },
  _mirAxis(hit) {
    const ed = this._ed; if (!hit || hit.kind !== 'ent' || getEnt(this.sk, hit.id).type !== 'line') return this._status('sk.op.mirror_line');
    const ids = this._entsSel(); const linked = ed.linked !== false;
    return this._runOp((sk) => mirrorEnts(sk, ids, hit.id, linked), tk('sk.kind.mirror'), { after: (r) => { this._setSel(r.newEnts.map((id) => ({ kind: 'ent', id }))); ed.phase = 0; this._mir = null; this.setHint('hint.mirror'); } });
  },

  // ------------------------------------------------------------------ desenler, dönüşümler
  _patGo(v) {
    const ids = this._entsSel(); if (!ids.length) return this._status('sk.op.nothing');
    const vars = this.getVars(), tool = this.tool, ed = this._ed;
    try {
      if (tool === 'patrect') { const n1 = this._edNum(v.n1), n2 = this._edNum(v.n2); return this._runOp((sk) => patternRect(sk, ids, { n1, n2, s1: v.s1, s2: v.s2, ang: v.ang, vars, linked: !!v.linked }), tk('sk.kind.pattern'), { note: (r) => (v.linked && !r.linked ? t('sk.op.too_many_linked') : '') }); }
      const n = this._edNum(v.n); const cid = ed.cid || 'O';
      return this._runOp((sk) => patternCirc(sk, ids, { n, cid, total: v.total, vars, linked: !!v.linked }), tk('sk.kind.pattern'), { note: (r) => (v.linked && !r.linked ? t('sk.op.too_many_linked') : '') });
    } catch (e) { this._status('sk.bad_expr', { msg: errText(e) }); }
  },
  _xformGo(v) {
    const ids = this._entsSel(); if (!ids.length) return this._status('sk.op.nothing'); const tool = this.tool; let p, kind = tool, copy = false;
    try {
      if (tool === 'move' || tool === 'copy') { p = { dx: this._edNum(v.dx), dy: this._edNum(v.dy) }; kind = 'move'; copy = tool === 'copy'; }
      else if (tool === 'rotate') { p = { angle: this._edNum(v.angle), cx: this._edNum(v.cx), cy: this._edNum(v.cy) }; copy = !!v.copy; }
      else { p = { k: this._edNum(v.k), cx: this._edNum(v.cx), cy: this._edNum(v.cy) }; copy = !!v.copy; }
    } catch (e) { return this._status('sk.bad_expr', { msg: errText(e) }); }
    return this._runOp((sk) => transformEnts(sk, ids, kind, p, { copy }), KIND[tool], { after: (r) => { if (r.newEnts) this._setSel(r.newEnts.map((id) => ({ kind: 'ent', id }))); } });
  },

  // ------------------------------------------------------------------ gövde kenarlarını izdüşür
  _bodyEdges(mode) {
    const pl = this.plane, nrm = [pl.x[1] * pl.y[2] - pl.x[2] * pl.y[1], pl.x[2] * pl.y[0] - pl.x[0] * pl.y[2], pl.x[0] * pl.y[1] - pl.x[1] * pl.y[0]];
    const nl = Math.hypot(...nrm) || 1; const sel = (this.vp.selection || []).filter((s) => s.kind === 'edge');
    const out = []; const bodies = this.getBodies && this.getBodies(); const list = bodies && bodies.length ? bodies : [...this.vp.bodies.values()].filter((b) => b.grp.visible).map((b) => b.data);
    for (const b of list) {
      const groups = b.edgeGroups || [];
      for (const g of groups) {
        if (sel.length && !sel.some((s) => s.body === b.id && s.idx === g.idx)) continue;
        const a = b.lines.subarray(g.start * 3, (g.start + g.count) * 3); const pts = [];
        for (let i = 0; i + 5 < a.length + 0; i += 6) { if (!pts.length) pts.push([a[i], a[i + 1], a[i + 2]]); pts.push([a[i + 3], a[i + 4], a[i + 5]]); }
        if (pts.length < 2) continue;
        if (!sel.length && mode === 'plane' && !pts.every((p) => Math.abs(((p[0] - pl.o[0]) * nrm[0] + (p[1] - pl.o[1]) * nrm[1] + (p[2] - pl.o[2]) * nrm[2]) / nl) < 1e-4)) continue;
        const cen = [0, 1, 2].map((k) => Math.round(pts.reduce((q, p) => q + p[k], 0) / pts.length * 1e4) / 1e4);
        out.push({ pts: pts.map((p) => toLocal(pl, p)), meta: { b: b.id, g: g.idx, c: cen } }); // meta: ilişkisel izdüşüm bağı
      }
    }
    return out;
  },
  _projectGo(v) {
    const pls = this._bodyEdges(v.mode); if (!pls.length) return this._status('sk.op.project_none');
    return this._runOp((sk) => projectPolylines(sk, pls), tk('sk.kind.project'), { note: (r) => t('sk.op.projected', { n: r.count }) });
  },

  // ------------------------------------------------------------------ çizerken sayısal giriş
  _numericSpec() {
    const tool = this.tool;
    if (tool === 'line' && this._ln && this._ln.mode === 'line') return { kind: 'line', fields: [['len', 'sk.num.length'], ['ang', 'sk.num.angle']] };
    if (tool === 'rect' && this._rc) return { kind: 'rect', fields: [['w', 'sk.num.width'], ['h', 'sk.num.height']] };
    if (tool === 'circle' && this._ci) return { kind: 'circle', fields: [['r', 'sk.num.radius']] };
    return null;
  },
  _numericStart(first) {
    const spec = this._numericSpec(); if (!spec) return false;
    this._closeInput(); const cur = this.cursor && this.cursor.loc ? this.cursor.loc : [0, 0];
    const els = spec.fields.map(([k, l], i) => h('label', { class: 'row' }, h('span', {}, t(l)), h('input', { type: 'text', 'data-k': k, value: i === 0 ? first : '' })));
    const box = h('div', { class: 'sk-num' }, ...els, h('div', { class: 'n' }, t('sk.num.hint')));
    box.style.cssText = 'position:absolute;transform:translate(14px,14px);pointer-events:auto;z-index:7;';
    const inputs = [...box.querySelectorAll('input')];
    box.addEventListener('mousedown', (ev) => ev.stopPropagation());
    box.addEventListener('keydown', async (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); this._closeInput(); }
      else if (ev.key === 'Tab') { ev.preventDefault(); const i = inputs.indexOf(document.activeElement); const n = inputs[(i + (ev.shiftKey ? inputs.length - 1 : 1)) % inputs.length]; n.focus(); n.select(); }
      else if (ev.key === 'Enter') {
        ev.preventDefault(); const vals = {}; for (const el of inputs) vals[el.dataset.k] = el.value.trim();
        const err = await this._numericCommit(spec, vals); if (err) { box.classList.add('bad'); this._status(() => err); } else this._closeInput();
      }
    });
    this.ovl.appendChild(box); this._input = box; this._inputAnchor = cur; this._posInput();
    inputs[0].focus(); inputs[0].setSelectionRange(first.length, first.length);
    return true;
  },
  async _numericCommit(spec, vals) {
    const num = (s) => { const v = this._edNum(s); if (!Number.isFinite(v)) throw new Error('NaN'); return v; };
    const cur = this.cursor && this.cursor.loc ? this.cursor.loc : null; let s, extra = null;
    try {
      if (spec.kind === 'line') {
        const st = this._ln.start, L = num(vals.len); if (!(L > 0)) return t('sk.dim_pos');
        const a = vals.ang !== '' ? num(vals.ang) * Math.PI / 180 : cur ? Math.atan2(cur[1] - st.y, cur[0] - st.x) : 0;
        s = { x: st.x + L * Math.cos(a), y: st.y + L * Math.sin(a), kind: 'free' }; extra = { type: 'dist', expr: vals.len, pick: (ids) => { const e = getEnt(this.sk, ids[0]); return [e.a, e.b]; } };
        const m = ((a * 180 / Math.PI) % 90 + 90) % 90; if (m < 1e-9 || 90 - m < 1e-9) s.kind = 'free';
      } else if (spec.kind === 'rect') {
        const c1 = this._rc.c1, W = num(vals.w), H = num(vals.h); if (!(W > 0) || !(H > 0)) return t('sk.dim_pos');
        const sx = cur && cur[0] < c1.x ? -1 : 1, sy = cur && cur[1] < c1.y ? -1 : 1; s = { x: c1.x + sx * W, y: c1.y + sy * H, kind: 'free' };
        extra = { rect: true, w: vals.w, h: vals.h };
      } else {
        const c = this._ci.c, r = num(vals.r); if (!(r > 0)) return t('sk.dim_pos');
        const a = cur ? Math.atan2(cur[1] - c.y, cur[0] - c.x) : 0; s = { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a), kind: 'free' }; extra = { type: 'radius', expr: vals.r };
      }
    } catch (e) { return t('sk.bad_expr', { msg: errText(e) }); }
    const nBefore = this._undo.length;
    this._addedLog = [];
    const p = spec.kind === 'line' ? this._lineClick(s) : spec.kind === 'rect' ? this._rectClick(s) : this._circleClick(s);
    const added = (this._addedLog || []).slice(); const r1 = await p; if (!r1 || !r1.ok) return r1 && r1.msg ? r1.msg : t('sk.num.failed');
    const cons = [];
    if (spec.kind === 'line') { const e = getEnt(this.sk, added[0]); if (e) cons.push(['dist', e.a, e.b, extra.expr]); }
    else if (spec.kind === 'circle') { if (added[0]) cons.push(['radius', added[0], undefined, extra.expr]); }
    else if (added.length >= 4) { const l1 = getEnt(this.sk, added[0]), l2 = getEnt(this.sk, added[1]); if (l1 && l2) cons.push(['hdist', l1.a, l1.b, extra.w], ['vdist', l2.a, l2.b, extra.h]); }
    if (!cons.length) return null;
    const r2 = await this._apply(() => { for (const [ty, a, b, ex] of cons) this._addCon(ty, a, b, { expr: String(ex) }); }, { strict: true, kind: tk('sk.kind.dim') });
    if (r2.ok && this._undo.length >= nBefore + 2) this._undo.splice(this._undo.length - 2, 1); // tek geri alma adımı
    return r2.ok ? null : r2.msg;
  },

  // ------------------------------------------------------------------ sağ tık menüsü
  _menuAt(ev, items) {
    this._hideCtx(); const r = this.ovl.getBoundingClientRect();
    const m = h('div', { class: 'sk-ctx', role: 'menu' }, ...items.filter(Boolean).map((it) => h('button', { class: 'it' + (it.off ? ' off' : ''), 'data-act': it.id, disabled: !!it.off, onclick: (e) => { e.stopPropagation(); this._hideCtx(); it.run(); } }, t(it.label))));
    m.style.cssText = `position:absolute;left:${Math.max(0, ev.clientX - r.left)}px;top:${Math.max(0, ev.clientY - r.top)}px;pointer-events:auto;z-index:9;`;
    m.addEventListener('mousedown', (e) => e.stopPropagation()); m.addEventListener('contextmenu', (e) => e.preventDefault());
    this.ovl.appendChild(m); this._ctxEl = m;
  },
  _hideCtx() { if (this._ctxEl) { this._ctxEl.remove(); this._ctxEl = null; } },
  _contextMenu(ev) {
    const loc = this._loc(ev); const hit = loc ? this._hit(loc) : null;
    if (hit && !this._isSel(hit)) this._setSel([{ kind: hit.kind, id: hit.id }]);
    const hasSel = this.selection.length > 0, hasEnt = this._entsSel().length > 0;
    const hasProj = this._entsSel().some((id) => { const e = this.sk.ents.find((x) => x.id === id); return e && e.proj; });
    this._menuAt(ev, [
      { id: 'ctx-finish', label: 'ctx.finish', run: () => this.onRequestFinish() },
      hasSel && { id: 'ctx-delete', label: 'ctx.delete', run: () => this.deleteSelection() },
      { id: 'ctx-construction', label: 'ctx.construction', run: () => this.toggleConstruction() }, // C-08: her zaman görünür (nesne seçiliyse seçiliyi, değilse yapı çizim kipini değiştirir)
      hasSel && { id: 'ctx-constraints', label: 'ctx.constraints', run: () => this.showConstraintsOfSelection() },
      hasEnt && { id: 'ctx-copy', label: 'ctx.copy', run: () => this.copyClip() },
      hasEnt && { id: 'ctx-cut', label: 'ctx.cut', run: () => this.cutClip() },
      CLIP && { id: 'ctx-paste', label: 'ctx.paste', run: () => this.pasteClip() },
      { id: 'ctx-selall', label: 'ctx.selectall', run: () => this.selectAll() },
      hasProj && { id: 'ctx-unlink', label: 'ctx.proj_unlink', run: () => this.unlinkSelected() },
      hasProj && { id: 'ctx-relink', label: 'ctx.proj_relink', run: () => this.relinkSelected() },
    ]);
  },
  _dimMenu(ev, c) {
    this._menuAt(ev, [
      { id: 'ctx-ref', label: c.ref ? 'ctx.driving' : 'ctx.reference', run: () => this.toggleReference(c.id) },
      { id: 'ctx-dimedit', label: 'ctx.edit_dim', run: () => this._editDim(c.id) },
      { id: 'ctx-dimdel', label: 'ctx.delete', run: () => this.removeConstraint(c.id) },
    ]);
  },
  showConstraintsOfSelection() {
    const refs = new Set(); for (const s of this.selection) { refs.add(s.id); if (s.kind === 'ent') { const e = getEnt(this.sk, s.id); if (e) entPts(e).forEach((p) => refs.add(p)); } }
    this._focusCons = new Set(this.sk.cons.filter((c) => [c.a, c.b, c.c].filter(Boolean).some((r) => refs.has(r))).map((c) => c.id));
    this._status('sk.cons_focus', { n: this._focusCons.size }); this._buildOverlay(); this.onChange();
  },
  toggleReference(id) {
    const c = this.sk.cons.find((k) => k.id === id); if (!c) return;
    // sürücüye çevrilirken ölçü o anki geometri değerini alır (eski/bayat ifade değil); referansa çevrilirken de ifade geometriyle eşlenir
    return this._apply((sk) => { const k = sk.cons.find((x) => x.id === id); const m = measureDim(sk, k); if (Number.isFinite(m)) k.expr = String(+m.toFixed(6)); if (k.ref) { delete k.ref; } else k.ref = true; }, { kind: tk('sk.kind.change'), strict: false });
  },
};

void THREE;
