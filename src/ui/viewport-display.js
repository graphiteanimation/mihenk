// Görüntü modları (tel kafes / saydam / gölgeli+kenar) ve adlandırılmış görünüşler (WP-09 dilim 5).
// Viewport.prototype'a viewport.js sonunda eklenir; var olan işlevlere dokunmaz: setBodies ve view sarılır.
import './viewport-display.css';
import { h } from './dom.js';
import { t, onLangChange } from '../shared/i18n.js';
import { getStr, setStr } from './prefs.js';

export const DISPLAY_MODES = ['shaded', 'wire', 'ghost'];
const MODE_KEY = { shaded: 'vd.shaded', wire: 'vd.wire', ghost: 'vd.ghost' };
export const MAX_VIEWS = 12;
const slotKey = (i) => 'nv_' + i; // Electron ayar anahtarı: en çok 200 karakterlik metin → sıkı kodlama
const r3 = (x) => +Number(x).toFixed(3);
const sg = (x) => +Number(x).toPrecision(7); // yakınlaştırma/yarı yükseklik için anlamlı basamak (çok küçük değer 0'a yuvarlanıp okunamaz hâle gelmesin)
const MAX_LEN = 200; // Electron ayar değeri sınırı
const NAME_MAX = 24;

// Kodlama: ad|px,py,pz|tx,ty,tz|ux,uy,uz|zoom|yarıYükseklik
export function encodeView(name, s) {
  const j = (a) => a.map(r3).join(',');
  return [String(name).replace(/[|]/g, ' ').slice(0, 24), j(s.p), j(s.t), j(s.u), sg(s.z), sg(s.h)].join('|');
}
export function decodeView(str) {
  if (typeof str !== 'string') return null;
  const a = str.split('|'); if (a.length !== 6) return null;
  const v = (x, n) => { const p = x.split(',').map(Number); return p.length === n && p.every(Number.isFinite) ? p : null; };
  const p = v(a[1], 3), tg = v(a[2], 3), u = v(a[3], 3), z = Number(a[4]), hh = Number(a[5]);
  if (!p || !tg || !u || !Number.isFinite(z) || !(z > 0) || !(hh > 0) || !a[0]) return null;
  return { name: a[0], s: { p, t: tg, u, z, h: hh } };
}

export const DISPLAY_METHODS = {
  displayMode() { return this._dispMode || 'shaded'; },
  setDisplayMode(m) {
    if (!DISPLAY_MODES.includes(m)) return false;
    this._dispMode = m; setStr('vp_display', m); this.applyDisplayMode(); this._dispRender(); return true;
  },
  // Gövde malzemelerine modu uygular (setBodies sonrası da çağrılır)
  applyDisplayMode() {
    const m = this.displayMode();
    for (const b of this.bodies.values()) {
      const mat = b.mesh.material, ln = b.lines.material;
      mat.visible = m !== 'wire'; mat.transparent = m === 'ghost'; mat.opacity = m === 'ghost' ? 0.28 : 1; mat.depthWrite = m !== 'ghost'; mat.needsUpdate = true;
      ln.depthTest = m === 'shaded'; ln.needsUpdate = true;
    }
    this.dirty = true;
  },
  // ---- adlandırılmış görünüşler
  viewState() { const c = this.camera, g = this.controls.target; return { p: [c.position.x, c.position.y, c.position.z], t: [g.x, g.y, g.z], u: [c.up.x, c.up.y, c.up.z], z: c.zoom, h: (c.top - c.bottom) / 2 }; },
  applyViewState(s) {
    const c = this.camera, asp = (this.el.clientWidth || 800) / (this.el.clientHeight || 600);
    c.up.set(...s.u); c.position.set(...s.p); this.controls.target.set(...s.t); c.zoom = s.z;
    c.top = s.h; c.bottom = -s.h; c.left = -s.h * asp; c.right = s.h * asp; c.lookAt(this.controls.target); c.updateProjectionMatrix(); this.controls.update();
    this.dirty = true; this.onCamera && this.onCamera(); this.onView && this.onView();
  },
  namedViews() { const out = []; for (let i = 1; i <= MAX_VIEWS; i++) { const d = decodeView(getStr(slotKey(i))); if (d) out.push({ slot: i, name: d.name, s: d.s }); } return out; },
  // Kaydet: ad >24 karakterse "…" ile kısaltılır; kısaltılmış biçimi başka bir kayıtla aynıysa REDDEDİLİR (birbirini ezmez).
  // Kayıt geri okunup doğrulanmadan ok:true dönmez; okunamıyorsa önceki değer geri konur.
  saveNamedView(name) {
    const raw = String(name || '').replace(/[|]/g, ' ').trim(); if (!raw) return { ok: false, err: 'vd.name_empty' };
    const nm = raw.length > NAME_MAX ? raw.slice(0, NAME_MAX - 1) + '…' : raw, cut = raw.length > NAME_MAX;
    const list = this.namedViews(); const same = list.find((v) => v.name.toLowerCase() === nm.toLowerCase());
    if (same && cut) return { ok: false, err: 'vd.name_clash' };
    let slot = same ? same.slot : null;
    if (!slot) { const used = new Set(list.map((v) => v.slot)); for (let i = 1; i <= MAX_VIEWS; i++) if (!used.has(i)) { slot = i; break; } }
    if (!slot) return { ok: false, err: 'vd.full' };
    const st = this.viewState(), enc = encodeView(nm, st), key = slotKey(slot), prev = getStr(key);
    const good = () => { const d = decodeView(getStr(key)); return !!d && d.name === nm && Math.abs(d.s.z - st.z) <= Math.abs(st.z) * 1e-5 && Math.abs(d.s.h - st.h) <= Math.abs(st.h) * 1e-5; };
    if (enc.length > MAX_LEN) return { ok: false, err: 'vd.save_failed' };
    setStr(key, enc);
    if (!good()) { setStr(key, prev || ''); return { ok: false, err: 'vd.save_failed' }; }
    this._dispRender(); return { ok: true, slot, replaced: !!same, name: nm };
  },
  recallNamedView(name) {
    const v = this.namedViews().find((x) => x.name.toLowerCase() === String(name).toLowerCase()); if (!v) return false;
    this.applyViewState(v.s); return true;
  },
  deleteNamedView(name) {
    const v = this.namedViews().find((x) => x.name.toLowerCase() === String(name).toLowerCase()); if (!v) return false;
    setStr(slotKey(v.slot), ''); this._dispRender(); return true;
  },
  // ---- arayüz (görünüm alanının sağ altı)
  _dispInit() {
    if (this._dispDone) return; this._dispDone = true;
    const m = getStr('vp_display'); this._dispMode = DISPLAY_MODES.includes(m) ? m : 'shaded';
    const host = this.el.parentElement; if (!host) return;
    this._dispEl = h('div', { class: 'vp-disp', role: 'group', 'aria-label': t('vd.title') }); host.appendChild(this._dispEl);
    this._dispEl.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && this._dispOpen) { ev.preventDefault(); ev.stopPropagation(); this._dispOpen = false; this._dispRender(); const b = this._dispEl.querySelector('.vd-views'); if (b) b.focus(); } });
    onLangChange(() => this._dispRender()); this._dispRender();
  },
  _dispRender() {
    const el = this._dispEl; if (!el) return;
    const focusId = el.contains(document.activeElement) ? document.activeElement.dataset.vd || null : null;
    const modes = h('div', { class: 'vd-modes', role: 'group', 'aria-label': t('vd.mode') }, ...DISPLAY_MODES.map((m) => h('button', { type: 'button', 'data-vd': 'mode-' + m, 'aria-pressed': String(this.displayMode() === m), title: t(MODE_KEY[m]), onclick: () => this.setDisplayMode(m) }, t(MODE_KEY[m]))));
    const vb = h('button', { type: 'button', class: 'vd-views', 'data-vd': 'views', 'aria-haspopup': 'true', 'aria-expanded': String(!!this._dispOpen), onclick: () => { this._dispOpen = !this._dispOpen; this._dispRender(); } }, t('vd.views'));
    const kids = [modes, vb];
    if (this._dispOpen) {
      const list = this.namedViews();
      const input = h('input', { type: 'text', 'data-vd': 'name', maxlength: '24', placeholder: t('vd.name'), 'aria-label': t('vd.name') });
      const msg = h('div', { class: 'vd-msg', role: 'status', 'aria-live': 'polite' });
      const save = () => { const r = this.saveNamedView(input.value); if (!r.ok) { const m2 = this._dispEl.querySelector('.vd-msg'); if (m2) m2.textContent = t(r.err); } };
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } ev.stopPropagation(); if (ev.key === 'Escape') { ev.preventDefault(); this._dispOpen = false; this._dispRender(); } });
      const pop = h('div', { class: 'vd-pop', role: 'group', 'aria-label': t('vd.views') },
        list.length ? h('ul', {}, ...list.map((v) => h('li', {}, h('button', { type: 'button', class: 'vd-go', 'data-vd': 'go-' + v.slot, title: t('vd.recall', { name: v.name }), onclick: () => this.applyViewState(v.s) }, v.name), h('button', { type: 'button', class: 'vd-del', 'data-vd': 'del-' + v.slot, 'aria-label': t('vd.delete', { name: v.name }), title: t('vd.delete', { name: v.name }), onclick: () => this.deleteNamedView(v.name) }, '×')))) : h('div', { class: 'vd-empty' }, t('vd.none')),
        h('div', { class: 'vd-row' }, input, h('button', { type: 'button', 'data-vd': 'save', onclick: save }, t('vd.save'))), msg);
      kids.push(pop);
    }
    el.replaceChildren(...kids);
    if (focusId) { const f = el.querySelector(`[data-vd="${focusId}"]`); if (f) f.focus(); }
  },
  relangDisplay() { this._dispRender(); },
};
