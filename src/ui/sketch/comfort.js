// Çizim konforu (WP-09): hizalama izleri, çizim ayarları paneli ve seçenek erişimi (Sketcher.prototype'a eklenir).
import './comfort.css';
import { COL } from '../viewport.js';
import { h } from '../dom.js';
import { t } from '../../shared/i18n.js';
import { SNAP_LABEL } from './snap.js';
import { SKO, SNAP_KINDS, GRID_STEPS, snapOn, setSnapKind, setGridStep, onSkOptsChange } from './opts.js';

// Ayar bölümleri: sonraki dilimler buraya ekler
function sections(S) {
  const chk = (id, label, get, set) => ({ id, label, get, set });
  const out = [
    { id: 'snap', title: 'cf.snap_title', items: SNAP_KINDS.map((k) => chk('snap-' + k, SNAP_LABEL[k], () => snapOn(k), (v) => setSnapKind(k, v))) },
    { id: 'grid', title: 'cf.grid_title', select: { id: 'grid-step', label: 'cf.grid_step', values: GRID_STEPS, get: () => SKO.grid, set: (v) => setGridStep(v) } },
  ];
  for (const f of S._cfSections || []) out.push(f(S));
  return out;
}

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
  // hizalama izleri: yakalama bir ya da iki noktayla hizalıysa o noktalardan imlece kesikli çizgi
  _drawTraces(s) {
    if (!s || s.kind !== 'align' || !s.refs) return;
    for (const r of s.refs) {
      const ok = r.axis === 'v' ? Math.abs(s.x - r.p[0]) < 1e-9 : Math.abs(s.y - r.p[1]) < 1e-9;
      if (ok && (Math.abs(s.x - r.p[0]) > 1e-9 || Math.abs(s.y - r.p[1]) > 1e-9)) this._line([r.p, [s.x, s.y]], COL.hover, true);
    }
  },
};
