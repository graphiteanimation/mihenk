// Çizim konforu (WP-09): hizalama izleri, çizim ayarları paneli ve seçenek erişimi (Sketcher.prototype'a eklenir).
import './comfort.css';
import { COL } from '../viewport.js';
import { h } from '../dom.js';
import { t, tk } from '../../shared/i18n.js';
import { SNAP_LABEL } from './snap.js';
import { DEFS } from './tools.js';
import { findPointAt } from './core.js';
import { reprojectLinked, matchEdge, edgeSig, unlinkProjection, relinkProjection } from './ops.js';
import { toLocal } from '../../shared/vec.js';
import { evalExpr } from '../../shared/expr.js';
import { fmtNum, errText } from '../../shared/i18n.js';
import { SKO, SNAP_KINDS, GRID_STEPS, SEL_KINDS, snapOn, setSnapKind, setGridStep, selOn, setSelKind, AUTO_KINDS, autoOn, setAuto, setAutoKind, setAutoRef, onSkOptsChange } from './opts.js';

// Ayar bölümleri: sonraki dilimler buraya ekler
function sections(S) {
  const chk = (id, label, get, set) => ({ id, label, get, set });
  const out = [
    { id: 'snap', title: 'cf.snap_title', items: SNAP_KINDS.map((k) => chk('snap-' + k, SNAP_LABEL[k], () => snapOn(k), (v) => setSnapKind(k, v))) },
    { id: 'grid', title: 'cf.grid_title', select: { id: 'grid-step', label: 'cf.grid_step', values: GRID_STEPS, get: () => SKO.grid, set: (v) => setGridStep(v) } },
  ];
  out.push({ id: 'sel', title: 'cf.sel_title', items: SEL_KINDS.map((k) => chk('sel-' + k, SEL_LABEL[k], () => selOn(k), (v) => setSelKind(k, v))) });
  out.push({ id: 'auto', title: 'cf.auto_title', items: [chk('auto-all', 'cf.auto_all', () => SKO.auto, (v) => setAuto(v)), ...AUTO_KINDS.map((k) => chk('auto-' + k, AUTO_LABEL[k], () => !SKO.autoOff.has(k), (v) => setAutoKind(k, v))), chk('auto-ref', 'cf.auto_ref', () => SKO.autoRef, (v) => setAutoRef(v))] });
  out.push({ id: 'proj', title: 'cf.proj_title', button: { id: 'proj-refresh', label: 'cf.proj_refresh', run: () => S.refreshProjections() } });
  for (const f of S._cfSections || []) out.push(f(S));
  return out;
}

const SEL_LABEL = { point: 'cf.sel_point', line: 'cf.sel_line', circle: 'cf.sel_circle', arc: 'cf.sel_arc', other: 'cf.sel_other' };
const AUTO_LABEL = { hv: 'cf.auto_hv', tan: 'cf.auto_tan', perp: 'cf.auto_perp', coin: 'cf.auto_coin', on: 'cf.auto_on', mid: 'cf.auto_mid' };
const PT_TOOLS = ['line', 'rect', 'circle', 'arc', 'point', 'spline'];
const fmt = (v) => fmtNum(Number(v), 4);

export const COMFORT_METHODS = {
  _cfInit() {
    this._cfOpen = false;
    if (this._cfUnsub) this._cfUnsub();
    this._cfUnsub = onSkOptsChange(() => { if (this.active) this._cfRender(); });
    this._cfBuild();
  },
  _cfDispose() { if (this._cfUnsub) { this._cfUnsub(); this._cfUnsub = null; } if (this._cfEl) { this._cfEl.remove(); this._cfEl = null; } },
  _cfBuild() {
    if (this._cfEl) this._cfEl.remove();
    const btn = h('button', { type: 'button', class: 'cf-btn', 'aria-haspopup': 'true', 'aria-expanded': String(!!this._cfOpen), title: t('cf.open_tip'), onclick: () => this._cfToggle() }, t('cf.open'));
    const root = h('div', { class: 'sk-cf', role: 'group', 'aria-label': t('cf.open') }, btn);
    root.addEventListener('mousedown', (ev) => ev.stopPropagation());
    root.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape' && this._cfOpen) { ev.preventDefault(); this._cfToggle(false); btn.focus(); } });
    this.ovl.appendChild(root); this._cfEl = root; this._cfRender();
  },
  _cfToggle(v) { this._cfOpen = v === undefined ? !this._cfOpen : !!v; this._cfRender(); },
  _cfRender() {
    const root = this._cfEl; if (!root) return;
    const btn = root.querySelector('.cf-btn'); btn.setAttribute('aria-expanded', String(!!this._cfOpen));
    const old = root.querySelector('.pop'); const focusId = old && old.contains(document.activeElement) ? document.activeElement.dataset.cf : null;
    if (old) old.remove();
    if (!this._cfOpen) return;
    const pop = h('div', { class: 'pop', role: 'group', 'aria-label': t('cf.open') });
    for (const sec of sections(this)) {
      pop.append(h('h4', {}, t(sec.title)));
      for (const it of sec.items || []) {
        const lbl = t(it.label);
        const inp = h('input', { type: 'checkbox', 'data-cf': it.id, checked: it.get() ? true : null, onchange: (ev) => it.set(ev.target.checked) });
        inp.checked = !!it.get();
        pop.append(h('label', {}, inp, h('span', {}, lbl)));
      }
      if (sec.button) pop.append(h('button', { type: 'button', 'data-cf': sec.button.id, onclick: () => sec.button.run() }, t(sec.button.label)));
      if (sec.select) {
        const s = sec.select, vals = [...new Set([...s.values, s.get()])].sort((a, b) => a - b);
        const sel = h('select', { 'data-cf': s.id, onchange: (ev) => s.set(ev.target.value) }, ...vals.map((v) => h('option', { value: String(v) }, String(v) + ' mm')));
        sel.value = String(s.get());
        pop.append(h('label', {}, h('span', {}, t(s.label)), sel));
      }
    }
    root.append(pop);
    if (focusId) { const f = pop.querySelector(`[data-cf="${focusId}"]`); if (f) f.focus(); }
  },
  relangComfort() { if (this._cfEl) this._cfBuild(); },
  // seçenek erişimi (testler ve komutlar için)
  skOpts() { return SKO; },
  setSnapKind(kind, on) { return setSnapKind(kind, on); },
  setGridStep(v) { return setGridStep(v); },
  setSelKind(kind, on) { return setSelKind(kind, on); },
  setAuto(on) { return setAuto(on); },
  setAutoKind(kind, on) { return setAutoKind(kind, on); },
  setAutoRef(on) { return setAutoRef(on); },
  // hizalama izleri: yakalama bir ya da iki noktayla hizalıysa o noktalardan imlece kesikli çizgi
  _drawTraces(s) {
    if (!s || s.kind !== 'align' || !s.refs) return;
    for (const r of s.refs) {
      const ok = r.axis === 'v' ? Math.abs(s.x - r.p[0]) < 1e-9 : Math.abs(s.y - r.p[1]) < 1e-9;
      if (ok && (Math.abs(s.x - r.p[0]) > 1e-9 || Math.abs(s.y - r.p[1]) > 1e-9)) this._line([r.p, [s.x, s.y]], COL.hover, true);
    }
  },
  // ---------- giriş: koordinat girişi (N), komut tekrarı (Enter/Boşluk) ----------
  _coordReady() { return this.active && !this._dlg && (PT_TOOLS.includes(this.tool) || !!DEFS[this.tool]); },
  // çizilmekte olan komutun son noktası (bağıl giriş için); yoksa null
  _refPoint() {
    const t = this.tool, last = (a) => (a && a.length ? [a[a.length - 1].x, a[a.length - 1].y] : null);
    if (t === 'line') return this._ln ? (this._ln.mode === 'line' || this._ln.mode === 'arc' ? [this._ln.start.x, this._ln.start.y] : null) : null;
    if (t === 'rect') return this._rc ? [this._rc.c1.x, this._rc.c1.y] : null;
    if (t === 'circle') return this._ci ? [this._ci.c.x, this._ci.c.y] : null;
    if (t === 'arc') return this._ar ? (this._ar.a ? [this._ar.a.x, this._ar.a.y] : [this._ar.c.x, this._ar.c.y]) : null;
    if (t === 'spline') return this._sp ? last(this._sp.pts) : null;
    if (DEFS[t]) return this._ds ? last(this._ds.pts) : null;
    return null;
  },
  _coordStart() {
    if (!this._coordReady()) return false;
    this._closeInput();
    const ref = this._refPoint(); let rel = !!ref;
    const cur = this.cursor && Number.isFinite(this.cursor.x) ? [this.cursor.x, this.cursor.y] : this.cursor && this.cursor.loc ? this.cursor.loc : [0, 0];
    const fx = h('input', { type: 'text', 'data-k': 'x', 'aria-label': 'X' }), fy = h('input', { type: 'text', 'data-k': 'y', 'aria-label': 'Y' });
    const lx = h('span', {}), ly = h('span', {});
    const chk = h('input', { type: 'checkbox', 'data-k': 'rel', disabled: ref ? null : true }); chk.checked = rel;
    const fill = () => {
      lx.textContent = t(rel ? 'sk.coord.dx' : 'sk.coord.x'); ly.textContent = t(rel ? 'sk.coord.dy' : 'sk.coord.y');
      fx.value = fmt(rel ? cur[0] - ref[0] : cur[0]); fy.value = fmt(rel ? cur[1] - ref[1] : cur[1]);
    };
    fill();
    chk.addEventListener('change', () => { rel = chk.checked; fill(); fx.focus(); fx.select(); });
    const box = h('div', { class: 'sk-num', role: 'group', 'aria-label': t('sk.coord.title') },
      h('label', { class: 'row' }, lx, fx), h('label', { class: 'row' }, ly, fy), h('label', { class: 'row' }, h('span', {}, t('sk.coord.rel')), chk), h('div', { class: 'n' }, t('sk.coord.hint')));
    box.style.cssText = 'position:absolute;transform:translate(14px,14px);pointer-events:auto;z-index:7;';
    const items = [fx, fy, ...(ref ? [chk] : [])];
    box.addEventListener('mousedown', (ev) => ev.stopPropagation());
    box.addEventListener('keydown', async (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); this._closeInput(); }
      else if (ev.key === 'Tab') { ev.preventDefault(); const i = items.indexOf(document.activeElement); const n = items[(i + (ev.shiftKey ? items.length - 1 : 1)) % items.length]; n.focus(); if (n.select) n.select(); }
      else if (ev.key === 'Enter') {
        ev.preventDefault(); const err = await this._coordCommit({ x: fx.value, y: fy.value }, rel, ref);
        if (err) { box.classList.add('bad'); this._status(() => err); } else this._closeInput();
      }
    });
    this.ovl.appendChild(box); this._input = box; this._inputAnchor = cur; this._posInput();
    fx.focus(); fx.select(); return true;
  },
  // Yazılan koordinatla çizim aracına tıklama gönderir. Döner: hata metni ya da null
  async _coordCommit(vals, rel, ref) {
    const num = (s) => { if (String(s).trim() === '') throw new Error(t('sk.coord.empty')); const v = evalExpr(String(s), this.getVars()); if (!Number.isFinite(v)) throw new Error('NaN'); return v; };
    let x, y;
    try { x = num(vals.x); y = num(vals.y); } catch (e) { return t('sk.bad_expr', { msg: errText(e) }); }
    if (rel && ref) { x += ref[0]; y += ref[1]; }
    const pid = findPointAt(this.sk, [x, y], 1e-6);
    const s = pid ? { x: this.sk.points[pid].x, y: this.sk.points[pid].y, pid, kind: 'end' } : { x, y, kind: 'free', exact: true };
    const r = this._clickWith(s); this.cursor = { ...s, loc: [x, y] }; this._renderPreview();
    if (r && typeof r.then === 'function') { const res = await r; if (res && res.ok === false && res.msg) return res.msg; }
    return null;
  },
  // Seç aracındayken Enter/Boşluk: son kullanılan komutu yeniden başlatır
  _repeatLast(t0) {
    if (!this._lastTool || this.tool !== 'select' || this._hasStage() || this._input || this._dlg || this._ctxEl) return false;
    if (t0 && (t0.tagName === 'BUTTON' || t0.tagName === 'A' || (t0.getAttribute && /^(button|menuitem|tab|checkbox|option)$/.test(t0.getAttribute('role') || '')))) return false;
    this.setTool(this._lastTool); return true;
  },
  // ---------- ilişkisel izdüşüm ----------
  _edgeBodies() { const bodies = this.getBodies && this.getBodies(); return bodies && bodies.length ? bodies : [...this.vp.bodies.values()].map((b) => b.data); },
  // gövde görünüm alanında var ama gizli mi (gizli gövde "kayıp" sayılmaz: bilinmiyor)
  _bodyHidden(id) { const e = this.vp.bodies && this.vp.bodies.get && this.vp.bodies.get(id); return !!(e && e.grp && !e.grp.visible); },
  // bağın (gövde, kenar grubu) güncel yerel noktaları. Kaynak kenarın imzası saklıdır (tür, eskiz düzleminde uçlar/merkez/yarıçap):
  // aynı indeksli kenar yalnız makul değişimse, değilse imzaya en yakın TEK aday kabul edilir; belirsiz ya da uzaksa null (bağlanma, grup lost).
  // Gövde gizliyse undefined (bilinmiyor: dokunma).
  _edgeByMeta(meta) {
    const b = this._edgeBodies().find((x) => x.id === meta.b); if (!b) return this._bodyHidden(meta.b) ? undefined : null;
    const pl = this.plane, groups = b.edgeGroups || [];
    const ptsOf = (g) => { const a = b.lines.subarray(g.start * 3, (g.start + g.count) * 3), pts = []; for (let i = 0; i + 5 < a.length; i += 6) { if (!pts.length) pts.push([a[i], a[i + 1], a[i + 2]]); pts.push([a[i + 3], a[i + 4], a[i + 5]]); } return pts; };
    const cands = []; for (const g of groups) { const p3 = ptsOf(g); if (p3.length >= 2) cands.push({ idx: g.idx, p3, pts: p3.map((p) => toLocal(pl, p)) }); }
    const m = matchEdge(meta, cands); if (!m) return null;
    const out = m.pts; out.g = m.idx; out.c = [0, 1, 2].map((k) => Math.round(m.p3.reduce((q, p) => q + p[k], 0) / m.p3.length * 1e4) / 1e4); out.sig = edgeSig(out); return out;
  },
  // izdüşüm sonucunun durum metni: güncellenen ve kaybolan AYRI sayılır
  _projSummary(r) {
    const u = r.updated + r.rebuilt;
    const tail = r.unlinked ? '  ·  ' + t('sk.proj_unlinked', { n: r.unlinked }) : '';
    if (u && r.lost) return t('sk.proj_both', { u, l: r.lost }) + tail;
    if (u) return t('sk.proj_updated', { n: u }) + tail;
    if (r.lost) return t('sk.proj_lost', { n: r.lost }) + tail;
    return (r.unlinked ? t('sk.proj_unlinked', { n: r.unlinked }) : t('sk.proj_same'));
  },
  // Eskiz açılırken: bağlı izdüşümleri güncel gövdeden okur (geri alma adımı yok)
  _reprojectOnOpen() {
    this._openNote = null;
    if (!this.sk.ents.some((e) => e.proj)) return;
    try { const r = reprojectLinked(this.sk, (m) => this._edgeByMeta(m)); if (r.updated || r.rebuilt || r.lost || r.unlinked) { const txt = this._projSummary(r); this._status(() => txt); this._openNote = () => txt; } } catch (e) { console.warn('reproject', e && e.message); }
  },
  // Elle güncelle (panel düğmesi): çözülür, geri alınabilir
  refreshProjections() {
    if (!this.active) return Promise.resolve({ ok: false });
    if (!this.sk.ents.some((e) => e.proj)) { this._status('sk.proj_none'); return Promise.resolve({ ok: false }); }
    let res = null;
    return this._apply((sk) => { res = reprojectLinked(sk, (m) => this._edgeByMeta(m)); if (!res.updated && !res.rebuilt && !res.flagged && !res.unlinked) { const txt = this._projSummary(res); return () => txt; } },
      { kind: tk('sk.kind.project'), note: () => (res ? this._projSummary(res) : '') });
  },
  // sağ tık: izdüşüm bağını kaldır (nesneler sıradan geometri olur)
  unlinkSelected() {
    const ids = this._entsSel().filter((id) => { const e = this.sk.ents.find((x) => x.id === id); return e && e.proj; });
    if (!ids.length) return this._status('sk.proj_none_sel');
    return this._apply((sk) => { unlinkProjection(sk, ids); }, { kind: tk('sk.kind.project'), note: () => t('sk.proj_unlinked', { n: ids.length }) });
  },
  // sağ tık: yeniden bağla. Modelde TEK kenar seçiliyken çalışır; değilse kullanıcıya ne yapacağı söylenir.
  relinkSelected() {
    const ids = this._entsSel().filter((id) => { const e = this.sk.ents.find((x) => x.id === id); return e && e.proj; });
    if (!ids.length) return this._status('sk.proj_none_sel');
    const sel = (this.vp.selection || []).filter((s) => s.kind === 'edge');
    if (sel.length !== 1) return this._status('sk.proj_relink_pick');
    const s0 = sel[0], b = this._edgeBodies().find((x) => x.id === s0.body); const g = b && (b.edgeGroups || []).find((x) => x.idx === s0.idx);
    if (!g) return this._status('sk.proj_relink_pick');
    const a = b.lines.subarray(g.start * 3, (g.start + g.count) * 3), p3 = []; for (let i = 0; i + 5 < a.length; i += 6) { if (!p3.length) p3.push([a[i], a[i + 1], a[i + 2]]); p3.push([a[i + 3], a[i + 4], a[i + 5]]); }
    const pts = p3.map((p) => toLocal(this.plane, p)); const c = [0, 1, 2].map((k) => Math.round(p3.reduce((q, p) => q + p[k], 0) / p3.length * 1e4) / 1e4);
    let r = null;
    return this._apply((sk) => { r = relinkProjection(sk, ids, { b: b.id, g: g.idx, c }, pts); if (!r.ok) return () => t(r.err.key, r.err.params || {}); }, { kind: tk('sk.kind.project'), note: () => t('sk.proj_relinked') });
  },
  lostEnts() { return this.sk.ents.filter((e) => e.proj && e.proj.lost).map((e) => e.id); },
};
