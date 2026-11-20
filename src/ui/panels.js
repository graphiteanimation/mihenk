// Sağ panel: özellik formu (canlı önizleme), sketch paneli, kesit paneli; parametre tablosu ve inceleme araçları.
import { h, $, toast, modal, fmt, esc } from './dom.js';
import { icon, featureIcon } from './icons.js';
import { t, tk, errText } from '../shared/i18n.js';
import { toErr } from '../shared/errors.js';
import { fieldsFor, featLabel, THREADS, patternSources } from './features.js';
import { evalExpr, resolveParams } from '../shared/expr.js';
import { LIMITS } from '../shared/schema.js';
import { basePlane } from '../shared/vec.js';
import { findRegions, resolveProfiles, selectionFor } from '../shared/profiles.js';
import { showRepair } from './viewport-hist.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (v) => fmt(v, 4);
// Ortak panel kabuğu: üst şerit (başlık + kapat), gövde, alt şerit (birincil + iptal).
const unitBox = (inp, unit, cls = '') => h('div', { class: 'input ' + cls }, inp, unit ? h('span', { class: 'unit', text: unit }) : null);
const checkBox = (inp) => { const l = h('label', { class: 'check' + (inp.checked ? ' on' : '') }, inp, h('span', { class: 'box', html: icon('check', 'sm') })); inp.addEventListener('change', () => l.classList.toggle('on', inp.checked)); return l; };
function shell(title, bodyKids, footKids, onClose, titleAttrs = {}, ic = '') {
  const p = $('#panel'); p.classList.remove('hidden');
  p.replaceChildren(h('header', {}, ic ? h('span', { class: 'hic', html: ic }) : null, h('h3', { text: title, ...titleAttrs }), onClose ? h('button', { class: 'btn ghost icon x', type: 'button', 'aria-label': t('common.close'), 'data-testid': 'panel-close', onclick: onClose, html: icon('close') }) : null),
    h('div', { class: 'body' }, ...bodyKids), h('footer', {}, ...footKids));
  return p;
}
// Seçim alanı metinleri: [sayaç, boşken ipucu]
const SEL_KEYS = { edge: [tk('sel.n_edge'), tk('sel.pick_edge')], face: [tk('sel.n_face'), tk('sel.pick_face')], body: [tk('sel.n_body'), tk('sel.pick_body')], item: [tk('sel.n_item'), tk('sel.pick_item')] };

// ------------------------------------------------------------------ Özellik paneli
export class FeaturePanel {
  // repair: WP-02 dilim 5 onarım kipi — çekirdeğin repairInfo çıktısı ({lost:[{field, index, kind, code, ghost, cands}]})
  constructor(app, draft, idx, repair = null) {
    this.app = app; this.draft = draft; this.idx = idx; this.isNew = idx == null; this.repair = repair && repair.lost && repair.lost.length ? repair : null;
    this.at = this.isNew ? (app.doc.rollback ?? app.doc.features.length) : idx;
    this.activeSel = null; this.status = null; this.closed = false; this.firstBody = !(app.result?.bodies.length);
  }
  titleText() { const d = this.draft; return this.isNew ? t('panel.new', { name: featLabel(d) }) : t('panel.edit', { name: d.name || featLabel(d) }); }
  ctx() {
    const feats = this.app.doc.features.slice(0, this.at);
    return { doc: { ...this.app.doc, features: feats }, bodies: this.app.result?.bodies || [], sketches: feats.filter((f) => f.type === 'sketch') };
  }
  fields() { return fieldsFor(this.draft, this.ctx()); }
  hasSel() { return this.fields().some((f) => f.t === 'sel' || (f.t === 'source' && this.draft.source?.kind === 'body')); }
  pickBase() { return this.activeSel != null; }
  // düzenlenen işlemin sağında (işaretçiye kadar) işlem var mı
  hasAfter() { const rb = this.app.doc.rollback; const end = rb ?? this.app.doc.features.length; return this.isNew ? this.at < end : this.at + 1 < end; }
  makeDoc(rollback) {
    const d = this.app.cloneDoc(this.app.doc);
    if (this.isNew) d.features.splice(this.at, 0, clone(this.draft)); else d.features[this.idx] = clone(this.draft);
    d.rollback = rollback; return d;
  }
  validate() {
    const d = this.draft;
    if (['extrude', 'revolve', 'hole'].includes(d.type)) {
      if (!d.sketch || !this.ctx().sketches.some((s) => s.id === d.sketch)) return { code: 'val.no_sketch', params: {} };
      if (d.type !== 'hole' && Array.isArray(d.profiles) && !d.profiles.length) return { code: 'val.no_profile', params: {} };
    }
    if (d.type === 'pattern') {
      // desen adedi üst sınırı (kilitlenmeyi önler); çözülemeyen ifadeyi çekirdek bildirir
      const vars = this.app.vars(); const num = (x) => { try { return Number(evalExpr(x, vars)); } catch (e) { return NaN; } };
      const n = d.kind === 'circ' ? num(d.count) : num(d.count1) * (d.count2 === undefined || d.count2 === '' ? 1 : num(d.count2));
      if (n > LIMITS.patternCount) return { code: 'val.pattern_too_big', params: { max: LIMITS.patternCount } };
    }
    return null;
  }

  open() {
    const app = this.app; app.edit = this;
    // WP-02 "Son hali göster" uyarlamalı: son tam güncelleme 1 sn altındaysa kendiliğinden açık
    app.showFinal = this.hasAfter() && (app.lastFullMs == null || app.lastFullMs < 1000); app.setFinal(null);
    // onarım kipi: kaybolan başvurular seçimden çıkarılır, ilgili seçim alanı etkinleşir (kullanıcı yeni kenarı/yüzü tıklar)
    if (this.repair) this.dropLost();
    this.render();
    // ilk seçim alanı boşsa etkin yap
    const first = this.repair ? this.fields().find((f) => f.t === 'sel' && f.k === this.repair.lost[0].field) || this.fields().find((f) => f.t === 'sel') : this.fields().find((f) => f.t === 'sel');
    if (first) this.setActive(first.k, true);
    this.updateViewport();
    app.previewSoon(0);
  }

  dropLost() {
    const by = new Map(); for (const L of this.repair.lost) { if (!by.has(L.field)) by.set(L.field, new Set()); by.get(L.field).add(L.index); }
    for (const [k, set] of by) { const v = this.draft[k]; if (Array.isArray(v)) this.draft[k] = v.filter((_, j) => !set.has(j)); else if (v && set.has(null)) this.draft[k] = Array.isArray(v) ? [] : ''; }
  }
  repairBox() {
    const R = this.repair; if (!R) return null; const app = this.app;
    const n = R.lost.length; const kind = R.lost[0].kind;
    const others = app.badFeatures().filter((f) => f.id !== this.draft.id);
    const btn = (id, label, run, cls = 'btn sm') => h('button', { class: cls, type: 'button', 'data-testid': id, onclick: run }, label);
    return h('div', { class: 'callout warn repair', role: 'group', 'data-testid': 'repair', 'aria-label': t('hs.rp_title') },
      h('div', { class: 'rp-t' }, h('span', { html: icon('warning', 'sm') }), h('strong', { text: t('hs.rp_title') })),
      h('div', { class: 'rp-b', text: t(kind === 'face' ? 'hs.rp_lost_face' : 'hs.rp_lost_edge', { n }) + ' ' + t('hs.rp_hint') }),
      h('div', { class: 'rp-a' },
        btn('repair-reselect', t('hs.rp_reselect'), () => { const k = R.lost[0].field; this.setActive(null, true); this.setActive(k); }),
        btn('repair-suppress', t('hs.rp_suppress'), () => { const i = this.idx; this.cancel(); app.toggleSuppress(i); }),
        btn('repair-delete', t('hs.rp_delete'), () => { const i = this.idx; this.cancel(); app.deleteFeature(i); }),
        others.length ? btn('repair-next', t('hs.rp_next', { n: others.length }), () => { const nx = others[0].id; this.cancel(); app.repairFeature(nx); }) : null));
  }
  // dil değişince formu yeniden kur (girilen değerler taslakta durur)
  relang() { const k = this.activeSel; this.render(); this.updateViewport(); if (k) this.refreshSels(); }

  // --- görünüm
  render() {
    const rows = []; for (const fd of this.fields()) { const row = this.fieldRow(fd); if (row) rows.push(row); }
    this.errEl = h('div', { class: 'callout err', id: 'p-err', role: 'alert', hidden: true }); this.noteEl = h('div', { class: 'note', id: 'p-note' });
    const fin = this.hasAfter() ? (() => {
      const inp = h('input', { type: 'checkbox', 'data-testid': 'show-final', checked: !!this.app.showFinal });
      inp.addEventListener('change', () => this.app.setShowFinal(inp.checked));
      return h('div', { class: 'fld final', title: t('hs.final_tip') }, h('label', { text: t('hs.show_final') }), h('div', { class: 'ctl' }, checkBox(inp)));
    })() : null;
    shell(this.titleText(), [this.repairBox(), ...rows, this.errEl, this.noteEl, fin].filter(Boolean),
      [h('button', { class: 'btn primary pri', id: 'p-ok', 'data-testid': 'panel-ok', onclick: () => this.ok() }, t('common.ok'), h('span', { class: 'kbd', text: 'Enter' })), h('button', { class: 'btn', id: 'p-cancel', 'data-testid': 'panel-cancel', onclick: () => this.cancel() }, t('common.cancel'), h('span', { class: 'kbd', text: 'Esc' }))],
      () => this.cancel(), { 'data-title': '' }, featureIcon(this.draft, 'md'));
    this.setStatus(this.status);
    this.refreshSels();
  }
  row(label, ctl, extra = '') { return h('div', { class: 'fld ' + extra }, h('label', { text: t(label) }), h('div', { class: 'ctl' }, ctl)); }

  fieldRow(fd) {
    const d = this.draft, app = this.app;
    switch (fd.t) {
      case 'expr': {
        const inp = h('input', { type: 'text', 'data-k': fd.k, value: d[fd.k] ?? fd.def ?? '', autocomplete: 'off', spellcheck: 'false', class: 'expr' });
        const hint = h('div', { class: 'resolved', 'data-testid': 'resolved' }); const msg = h('div', { class: 'fieldmsg', role: 'alert', hidden: true });
        const box = unitBox(inp, fd.unit);
        const upd = () => {
          let txt = ''; let bad = '';
          try { const v = evalExpr(inp.value, app.vars()); if (!/^\s*-?[0-9]*[.,]?[0-9]+\s*$/.test(inp.value)) txt = '= ' + num(v) + ' ' + (fd.unit || ''); }
          catch (e) { bad = errText(e); }
          box.classList.toggle('err', !!bad); inp.setAttribute('aria-invalid', bad ? 'true' : 'false');
          hint.textContent = txt; hint.hidden = !txt;
          msg.hidden = !bad; msg.replaceChildren(...(bad ? [h('span', { html: icon('error', 'sm') }), h('span', { text: bad })] : []));
        };
        upd();
        inp.addEventListener('input', () => { d[fd.k] = inp.value; upd(); this.setActive(null); this.changed(); });
        inp.addEventListener('focus', () => this.setActive(null));
        return this.row(fd.label, h('div', {}, box, hint, msg));
      }
      case 'select': {
        const s = h('select', { 'data-k': fd.k }, fd.opts.map(([v, l]) => h('option', { value: v, selected: String(d[fd.k]) === String(v) }, l == null ? v : t(l))));
        s.addEventListener('change', () => { d[fd.k] = s.value; this.setActive(null); this.fieldChanged(fd.k); });
        return this.row(fd.label, unitBox(s));
      }
      case 'check': {
        const c = h('input', { type: 'checkbox', 'data-k': fd.k, checked: !!d[fd.k] });
        c.addEventListener('change', () => { d[fd.k] = c.checked; this.setActive(null); this.changed(); });
        return this.row(fd.label, checkBox(c));
      }
      case 'sketch': {
        let list = this.ctx().sketches;
        if (fd.need === 'points') list = list.filter((s) => (s.ents || []).some((e) => e.type === 'point' || e.type === 'circle'));
        if (!list.length) return this.row(fd.label, h('span', { class: 'note', text: fd.need === 'points' ? t('fld.no_point_sketch') : t('fld.no_sketch') }));
        if (!list.some((s) => s.id === d.sketch)) d.sketch = list[list.length - 1].id;
        const s = h('select', { 'data-k': fd.k }, list.map((x) => h('option', { value: x.id, selected: x.id === d.sketch }, x.name || x.id)));
        s.addEventListener('change', () => { d.sketch = s.value; d.profiles = 'all'; this.fieldChanged('sketch'); });
        return this.row(fd.label, unitBox(s));
      }
      case 'profiles': {
        this.profEl = h('span', { 'data-k': fd.k });
        const btn = h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { d.profiles = 'all'; this.refreshProfiles(); this.changed(); } }, t('common.all'));
        const box = h('div', { class: 'input pick active', style: { cursor: 'default' } }, this.profEl, btn);
        this.refreshProfiles();
        return this.row(fd.label, box);
      }
      case 'axis': {
        const sk = this.ctx().sketches.find((s) => s.id === d.sketch);
        const lines = (sk?.ents || []).filter((e) => e.type === 'line');
        const opts = [['sketchX', t('fld.axis_x')], ['sketchY', t('fld.axis_y')], ...lines.map((l, i) => ['line:' + l.id, t(l.cons ? 'fld.axis_line_cons' : 'fld.axis_line', { n: i + 1 })])];
        const cur = d.axis?.kind === 'line' ? 'line:' + d.axis.ent : d.axis?.kind || 'sketchX';
        const s = h('select', { 'data-k': 'axis' }, opts.map(([v, l]) => h('option', { value: v, selected: v === cur }, l)));
        s.addEventListener('change', () => { d.axis = s.value.startsWith('line:') ? { kind: 'line', ent: s.value.slice(5) } : { kind: s.value }; this.changed(); });
        return this.row(fd.label, unitBox(s));
      }
      case 'thread': {
        const cur = d.thread?.designation || '';
        const s = h('select', { 'data-k': 'thread' }, [h('option', { value: '' }, t('common.none')), ...THREADS.map((th) => h('option', { value: th.designation, selected: th.designation === cur }, t('fld.thread_opt', { d: th.designation, p: fmt(th.pitch, 3) })))]);
        s.addEventListener('change', () => {
          const th = THREADS.find((x) => x.designation === s.value);
          d.thread = th ? { designation: th.designation, pitch: th.pitch, major: th.major } : null;
          if (th) d.dia = String(Math.round((th.major - th.pitch) * 1000) / 1000);
          this.fieldChanged('thread');
        });
        return this.row(fd.label, unitBox(s));
      }
      case 'sel': {
        const el = h('div', { class: 'selbox input pick', 'data-k': fd.k, 'data-testid': 'sel-' + fd.k, tabindex: '0', role: 'button', onclick: () => this.setActive(fd.k) });
        el.addEventListener('keydown', (e) => { if (e.key === ' ' || (e.key === 'Enter' && e.target === el)) { e.preventDefault(); e.stopPropagation(); this.setActive(fd.k); } });
        el.append(h('span', { class: 'cnt' }), h('button', { class: 'clr clear', type: 'button', title: t('fld.clear_sel'), 'aria-label': t('fld.clear_sel'), onclick: (e) => { e.stopPropagation(); this.clearSel(fd.k); }, html: icon('close', 'sm') }));
        return this.row(fd.label, el);
      }
      case 'source': {
        const srcs = patternSources(this.ctx().doc);
        const cur = d.source?.kind === 'feature' ? 'f:' + d.source.id : 'b';
        const s = h('select', { 'data-k': 'source' }, [...srcs.map((f) => h('option', { value: 'f:' + f.id, selected: cur === 'f:' + f.id }, f.name || f.id)), h('option', { value: 'b', selected: cur === 'b' }, t('fld.bodies_pick'))]);
        s.addEventListener('change', () => { d.source = s.value === 'b' ? { kind: 'body', bodies: [] } : { kind: 'feature', id: s.value.slice(2) }; this.fieldChanged('source'); });
        const wrap = h('div', {}, unitBox(s));
        if (d.source?.kind === 'body') {
          const el = h('div', { class: 'selbox input pick', 'data-k': 'source.bodies', style: { marginTop: '4px' }, tabindex: '0', role: 'button', onclick: () => this.setActive('source.bodies') });
          el.append(h('span', { class: 'cnt' }), h('button', { class: 'clr clear', type: 'button', 'aria-label': t('fld.clear_sel'), title: t('fld.clear_sel'), onclick: (e) => { e.stopPropagation(); this.clearSel('source.bodies'); }, html: icon('close', 'sm') }));
          wrap.append(el);
        }
        return this.row(fd.label, wrap);
      }
    }
    return null;
  }
  fieldChanged(k) {
    this.setActive(null); this.render();
    const first = this.fields().find((x) => x.t === 'sel');
    if (k === 'source' && this.draft.source?.kind === 'body') this.setActive('source.bodies', true);
    else if (first && (k === 'kind' || k === 'extent' || k === 'mode' || k === 'tool')) this.setActive(first.k, true);
    this.updateViewport(); this.changed();
  }
  changed() { this.app.previewSoon(); }

  // --- seçim alanları
  selKind(k) { if (k === 'source.bodies') return 'body'; return this.fields().find((f) => f.k === k)?.kind; }
  getSel(k) { if (k === 'source.bodies') return this.draft.source?.bodies || []; const v = this.draft[k]; return Array.isArray(v) ? v : v ? [v] : []; }
  setSelList(k, list) {
    const f = this.fields().find((x) => x.k === k);
    if (k === 'source.bodies') this.draft.source.bodies = list; else if (f?.single) this.draft[k] = list[0] || ''; else this.draft[k] = list;
  }
  // C-04: × seçimi temizler ve alanı etkinleştirir (× tıklaması kutunun kendi tıklamasını durdurduğu için alan pasif kalıp kenar tıklamaları boşa gidiyordu)
  clearSel(k) { this.setSelList(k, []); this.setActive(k, true); this.refreshSels(); this.updateViewport(); this.changed(); }
  setActive(k, silent) {
    if (this.activeSel === k) return;
    const was = this.pickBase();
    this.activeSel = k || null;
    this.refreshSels();
    if (!silent && was !== this.pickBase()) this.app.previewSoon(0);
    this.updateViewport();
  }
  refreshSels() {
    for (const el of document.querySelectorAll('#panel .selbox[data-k]')) {
      const k = el.dataset.k; if (k === 'profiles') continue;
      const n = this.getSel(k).length; const kind = this.selKind(k);
      const K = SEL_KEYS[kind] || SEL_KEYS.item;
      const nameOf = (id) => this.app.bodyName(id);
      el.querySelector('.cnt').textContent = n ? (kind === 'body' && n <= 2 ? this.getSel(k).map(nameOf).join(', ') : t(K[0], { n })) : t(K[1]);
      el.classList.toggle('active', this.activeSel === k);
      el.dataset.count = String(n);
    }
  }
  refProfiles() {
    const sk = this.ctx().sketches.find((s) => s.id === this.draft.sketch);
    return sk;
  }
  refreshProfiles() {
    if (!this.profEl) return;
    const total = this.app.regionCount;
    const p = this.draft.profiles;
    this.profEl.textContent = p === 'all' || p == null ? t('common.all') + (total != null ? ' (' + total + ')' : '') : t('fld.n_profiles', { n: p.length });
  }
  // görünüm ayarları: süzgeç, vurgular, profil bölgeleri
  updateViewport() {
    const vp = this.app.viewport; if (!vp || this.closed) return;
    const k = this.activeSel;
    const kind = k ? this.selKind(k) : null;
    vp.setFilter(kind ? { [kind]: true } : {});
    if (kind && kind !== 'body') {
      // base görünümde tutulan seçim vurgusu
      vp.setSelection(this.getSel(k).map((r) => ({ kind: r.kind || kind, body: r.body, idx: r.idx })));
    } else if (kind === 'body') vp.setSelection(this.getSel(k).map((id) => ({ kind: 'body', body: id })));
    else vp.setSelection([]);
    const d = this.draft;
    if (['extrude', 'revolve'].includes(d.type)) {
      const sk = this.refProfiles(); const pl = this.app.result?.sketches?.[d.sketch]?.plane;
      const rg = sk ? findRegions(sk).regions : [];
      const selIdx = d.profiles === 'all' ? 'all' : resolveProfiles(rg, d.profiles).idx;
      this.app.regionCount = sk && pl ? vp.setRegions(pl, sk, selIdx, true) : (vp.setRegions(null, null), null);
      this.refreshProfiles();
    } else vp.setRegions(null, null);
    this.app.setHint(this.hint());
  }
  hint() {
    const k = this.activeSel; if (k) { const hk = { edge: tk('hint.pick_edge'), face: tk('hint.pick_face'), body: tk('hint.pick_body') }[this.selKind(k)]; return hk ? t(hk) : ''; }
    if (['extrude', 'revolve'].includes(this.draft.type)) return t('hint.profiles');
    return '';
  }
  // yeni sonuç geldiğinde
  afterResult() { this.updateViewport(); if (this.repair) this.app.repairDrawn = showRepair(this.app.viewport, this.repair.lost); }
  setStatus(st) {
    this.status = st;
    if (!this.errEl) return;
    const bad = !!(st && st.ok === false);
    this.errEl.hidden = !bad; this.errEl.dataset.bad = bad ? '1' : '';
    this.errEl.replaceChildren(...(bad ? [h('span', { html: icon('error', 'sm') }), h('div', { text: st.error ? errText(st.error) : t('panel.error') })] : []));
  }

  async onPick(hit) {
    if (!hit) return;
    const d = this.draft;
    if (hit.kind === 'region') {
      if (!['extrude', 'revolve'].includes(d.type)) return;
      const rg = this.app.viewport.regions || []; const total = rg.length;
      const sel = d.profiles === 'all' ? Array.from({ length: total }, (_, i) => i) : resolveProfiles(rg, d.profiles || []).idx.slice();
      const at = sel.indexOf(hit.idx); if (at >= 0) sel.splice(at, 1); else sel.push(hit.idx);
      sel.sort((a, b) => a - b);
      d.profiles = sel.length === total ? 'all' : sel.map((i) => selectionFor(rg[i]));
      this.updateViewport(); this.changed(); return;
    }
    const k = this.activeSel; if (!k) return;
    const kind = this.selKind(k);
    if (hit.kind !== kind) { if (kind === 'body' && hit.body) hit = { kind: 'body', body: hit.body }; else return; }
    let list = this.getSel(k).slice();
    const f = this.fields().find((x) => x.k === k);
    if (kind === 'body') {
      const i = list.indexOf(hit.body);
      if (i >= 0) list.splice(i, 1); else if (f?.single) list = [hit.body]; else list.push(hit.body);
    } else {
      const i = list.findIndex((r) => r.body === hit.body && r.idx === hit.idx);
      // WP-08: teğet zincir (yuvarlat/pah): tıklanan kenarın G1 zinciri birlikte seçilir / bırakılır
      let chain = [hit.idx];
      if (kind === 'edge' && (d.type === 'fillet' || d.type === 'chamfer') && d.chain) { try { chain = await this.app.query('tangentChain', { ref: { body: hit.body, idx: hit.idx } }); } catch (e) { chain = [hit.idx]; } }
      if (i >= 0) list = list.filter((r) => !(r.body === hit.body && chain.includes(r.idx)));
      else {
        try { for (const idx of chain) if (!list.some((r) => r.body === hit.body && r.idx === idx)) list.push(await this.app.describe({ ...hit, idx }, kind)); }
        catch (e) { toast(t('msg.selection_unreadable', { msg: errText(e) }), true); return; }
      }
    }
    this.setSelList(k, list); this.refreshSels(); this.updateViewport(); this.changed();
  }

  async ok() {
    if (this.closed) return;
    const err = this.validate();
    if (err) { this.setStatus({ ok: false, error: err }); toast(errText(err), true); return; }
    await this.app.flushPreview();
    const st = this.status;
    this.close();
    await this.app.commitFeature(this);
    if (this.firstBody) this.app.viewport.fit();
    if (st && st.ok === false) toast(t('msg.saved_with_error', { msg: errText(st.error) }), true);
  }
  cancel() { if (this.closed) return; this.close(); this.app.endEdit(); }
  close() {
    this.closed = true; this.app.edit = null; this.app.setFinal(null);
    $('#panel').classList.add('hidden'); $('#panel').replaceChildren();
    const vp = this.app.viewport; vp.setRegions(null, null); vp.setSelection([]); this.app.setHint('');
    if (this.repair) { showRepair(vp, []); this.app.repairDrawn = null; }
  }
}

// ------------------------------------------------------------------ Sketch paneli
export class SketchPanel {
  constructor(app, session) { this.app = app; this.s = session; }
  render() {
    const app = this.app, s = this.s;
    const body = h('div', { class: 'sk-body' });
    const isBase = s.draft.plane?.kind === 'base';
    body.append(h('div', { class: 'note', text: isBase ? t('skp.plane', { name: s.draft.plane.name }) : t('skp.plane_face') }));
    if (isBase) {
      const inp = h('input', { type: 'text', 'data-k': 'offset', value: s.draft.plane.offset ?? '0' });
      inp.addEventListener('change', () => app.setSketchOffset(inp.value));
      body.append(h('div', { class: 'fld' }, h('label', { text: t('skp.offset') }), h('div', { class: 'ctl' }, unitBox(inp, 'mm'))));
    }
    this.dof = h('div', { class: 'note', id: 'sk-dof' });
    this.bad = h('div', { class: 'bad-list', id: 'sk-bad' });
    this.list = h('div', { class: 'clist', id: 'sk-cons' });
    // çokgen seçenekleri (yalnız çokgen aracında görünür)
    this.sides = h('input', { type: 'text', 'data-k': 'sides', value: String(app.sketcher?.opts?.polySides ?? 6) });
    this.circ = h('input', { type: 'checkbox', 'data-k': 'circum' });
    const setOpt = () => { const o = app.sketcher?.opts; if (!o) return; const n = Math.round(parseFloat(String(this.sides.value).replace(',', '.'))); if (n >= 3 && n <= 200) o.polySides = n; o.polyCircum = this.circ.checked; app.sketcher._renderPreview(); };
    this.sides.addEventListener('input', setOpt); this.circ.addEventListener('change', setOpt);
    this.poly = h('div', { class: 'polyopt', id: 'sk-poly' }, h('div', { class: 'fld' }, h('label', { text: t('skp.sides') }), h('div', { class: 'ctl' }, unitBox(this.sides))), h('div', { class: 'fld' }, h('label', { text: t('skp.circum') }), h('div', { class: 'ctl' }, checkBox(this.circ))));
    body.append(this.dof, this.bad, this.poly, h('div', { class: 'note', text: t('skp.constraints') }), this.list);
    shell(t('skp.title', { name: s.draft.name || '' }), [body],
      [h('button', { class: 'btn primary pri', id: 'sk-finish', onclick: () => app.finishSketch() }, t('sk.finish')), h('button', { class: 'btn', id: 'sk-cancel', onclick: () => app.cancelSketch() }, t('common.cancel'))]);
    this.refresh();
  }
  refresh() {
    const sk = this.app.sketcher; if (!sk || !this.list) return;
    let items = []; try { items = sk.constraintsList() || []; } catch (e) { /* sketcher henüz hazır değil */ }
    this.list.replaceChildren(...(items.length ? items.map((c) => h('div', { class: 'row' + (sk._focusCons && sk._focusCons.has(c.id) ? ' focus' : '') + (c.bad ? ' bad' : ''), 'data-id': c.id, onclick: () => sk.focusConstraint(c.id) }, h('span', { class: 'nm', text: c.label }), h('button', { title: t('skp.del_con'), onclick: () => { sk.removeConstraint(c.id); this.refresh(); this.app.refreshToolbar(); } }, '✕'))) : [h('div', { class: 'note', style: { padding: '4px 8px' }, text: t('skp.no_cons') })]));
    const ls = sk.lastSolve;
    const badL = ls && sk._badLabels ? sk._badLabels(ls) : [];
    this.bad.replaceChildren(...(badL.length ? [h('div', { class: 'note' }, t('skp.conflicts')), ...badL.map((l) => h('div', { class: 'row bad', text: l }))] : []));
    const isPoly = sk.tool === 'polygon'; this.poly.style.display = isPoly ? '' : 'none';
    if (isPoly) { if (document.activeElement !== this.sides) this.sides.value = String(sk.opts.polySides); this.circ.checked = !!sk.opts.polyCircum; }
    this.dof.textContent = ls ? (ls.ok === false ? t('skp.no_solution') : ls.dof === 0 ? t('sk.dof_full') : ls.dof != null ? t('sk.dof', { n: ls.dof }) : '') : '';
  }
  close() { $('#panel').classList.add('hidden'); $('#panel').replaceChildren(); this.list = null; }
}

// ------------------------------------------------------------------ Kesit paneli
export class SectionPanel {
  constructor(app) { this.app = app; this.axis = 'Z'; this.flip = false; this.pos = null; }
  range() {
    const vp = this.app.viewport; const b = vp.bbox(); const i = { X: 0, Y: 1, Z: 2 }[this.axis];
    const lo = [b.min.x, b.min.y, b.min.z][i], hi = [b.max.x, b.max.y, b.max.z][i]; return [Math.floor(lo - 1), Math.ceil(hi + 1)];
  }
  open() { this.app.sectionPanel = this; this.build(); }
  relang() { this.build(); }
  build() {
    const app = this.app;
    const [lo, hi] = this.range(); if (this.pos == null) this.pos = Math.round((lo + hi) / 2);
    const sel = h('select', { id: 'sec-axis' }, ['X', 'Y', 'Z'].map((a) => h('option', { value: a, selected: a === this.axis }, a)));
    this.slider = h('input', { type: 'range', id: 'sec-pos', min: lo, max: hi, step: 0.5, value: this.pos, 'aria-label': t('sec.pos') });
    this.val = h('input', { type: 'text', id: 'sec-val', value: String(this.pos) });
    const flip = h('input', { type: 'checkbox', id: 'sec-flip', checked: this.flip });
    const apply = () => { app.viewport.setSection(this.axis, this.pos, this.flip); };
    sel.addEventListener('change', () => { this.axis = sel.value; const [l, hh] = this.range(); this.slider.min = l; this.slider.max = hh; this.pos = Math.round((l + hh) / 2); this.slider.value = this.pos; this.val.value = String(this.pos); apply(); });
    this.slider.addEventListener('input', () => { this.pos = +this.slider.value; this.val.value = String(this.pos); apply(); });
    this.val.addEventListener('change', () => { const v = parseFloat(this.val.value.replace(',', '.')); if (Number.isFinite(v)) { this.pos = v; this.slider.value = v; apply(); } });
    flip.addEventListener('change', () => { this.flip = flip.checked; apply(); });
    shell(t('sec.title'), [
      h('div', { class: 'fld' }, h('label', { text: t('sec.axis') }), h('div', { class: 'ctl' }, unitBox(sel))), h('div', { class: 'fld' }, h('label', { text: t('sec.pos') }), h('div', { class: 'ctl' }, unitBox(this.val, 'mm'))), h('div', { class: 'slider' }, this.slider),
      h('div', { class: 'fld' }, h('label', { text: t('sec.flip') }), h('div', { class: 'ctl' }, checkBox(flip))), h('div', { class: 'note', text: t('sec.note') })],
      [h('button', { class: 'btn primary pri', id: 'sec-close', onclick: () => this.close() }, t('sec.close'))], () => this.close());
    apply();
  }
  close() { this.app.viewport.setSection(null); this.app.sectionPanel = null; $('#panel').classList.add('hidden'); $('#panel').replaceChildren(); }
}

// ------------------------------------------------------------------ Parametre tablosu
const NAME_RE = /^[A-Za-z_ğüşıöçĞÜŞİÖÇ][A-Za-z0-9_ğüşıöçĞÜŞİÖÇ]*$/;
const RESERVED = new Set(['pi', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'min', 'max', 'round', 'floor', 'ceil', 'asin', 'acos', 'atan']);
export async function paramsModal(app) {
  let rows = clone(app.doc.params || []);
  const tbody = h('tbody');
  const errBox = h('div', { class: 'fieldmsg', id: 'par-err', role: 'alert' });
  const check = () => {
    const errs = rows.map(() => null); const seen = new Set();
    rows.forEach((r, i) => {
      const n = (r.name || '').trim();
      if (!n) errs[i] = { code: 'par.empty', params: {} };
      else if (!NAME_RE.test(n)) errs[i] = { code: 'par.bad_name', params: {} };
      else if (RESERVED.has(n)) errs[i] = { code: 'par.reserved', params: { name: n } };
      else if (seen.has(n)) errs[i] = { code: 'par.duplicate', params: {} };
      seen.add(n);
    });
    const { vars, errors } = resolveParams(rows.map((r) => ({ ...r, name: (r.name || '').trim() })));
    rows.forEach((r, i) => { if (!errs[i] && errors[(r.name || '').trim()]) errs[i] = errors[(r.name || '').trim()]; });
    return { errs, vars };
  };
  const draw = (keepFocus) => {
    const { errs, vars } = check();
    const cells = [...tbody.children];
    rows.forEach((r, i) => {
      const tr = cells[i]; if (!tr) return;
      tr.querySelector('.pv').textContent = errs[i] ? '—' : num(vars[(r.name || '').trim()]);
      const e = tr.querySelector('.pe'); e.textContent = errs[i] ? errText(errs[i]) : ''; tr.classList.toggle('err', !!errs[i]);
    });
    errBox.textContent = errs.some(Boolean) ? t('par.fix_rows') : '';
    return errs;
  };
  const build = () => {
    tbody.replaceChildren(...rows.map((r, i) => {
      const mk = (k, w) => { const inp = h('input', { type: 'text', value: r[k] ?? '', 'data-k': k, style: { width: w } }); inp.addEventListener('input', () => { r[k] = inp.value; draw(); }); return h('td', {}, inp); };
      return h('tr', { 'data-i': i }, mk('name', '90px'), mk('expr', '130px'), h('td', { class: 'pv', style: { fontVariantNumeric: 'tabular-nums', minWidth: '60px' } }), mk('note', '150px'),
        h('td', {}, h('button', { class: 'btn ghost icon', type: 'button', title: t('par.delete'), 'aria-label': t('par.delete'), onclick: () => { rows.splice(i, 1); build(); }, html: icon('trash') })),
        h('td', { class: 'pe' }));
    }));
    draw();
  };
  build();
  const add = h('button', { class: 'btn', id: 'par-add', onclick: () => { let n = 1; while (rows.some((r) => r.name === 'P' + n)) n++; rows.push({ name: 'P' + n, expr: '10', note: '' }); build(); tbody.querySelector('tr:last-child input')?.focus(); } }, t('par.add'));
  const content = h('div', {}, h('div', { class: 'note', text: t('par.note') }),
    h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: t('par.name') }), h('th', { text: t('par.expr') }), h('th', { text: t('par.value') }), h('th', { text: t('par.remark') }), h('th'), h('th'))), tbody), h('div', { style: { marginTop: '8px' } }, add), errBox);
  const r = await modal({ title: t('par.title'), content, buttons: [{ label: t('common.cancel'), value: null }, { label: t('common.ok'), cls: 'pri', value: 'ok', check: () => { const e = draw(); if (e.some(Boolean)) { toast(t('par.table_error'), true); return false; } } }] });
  if (r !== 'ok') return;
  const out = rows.map((x) => ({ name: x.name.trim(), expr: String(x.expr).trim(), ...(x.note ? { note: x.note } : {}) }));
  if (JSON.stringify(out) === JSON.stringify(app.doc.params || [])) return;
  await app.commit((doc) => { doc.params = out; });
}

// ------------------------------------------------------------------ İnceleme araçları
const FACE_T = { PLANE: tk('meas.f_plane'), CYLINDRE: tk('meas.f_cyl'), CONE: tk('meas.f_cone'), SPHERE: tk('meas.f_sphere'), TORUS: tk('meas.f_torus') };
const EDGE_T = { LINE: tk('meas.e_line'), CIRCLE: tk('meas.e_circle'), ELLIPSE: tk('meas.e_ellipse') };
const rowsHtml = (rows) => '<table>' + rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('') + '</table>';
const box = () => $('#measurebox');
export function showBox(title, bodyHtml, onClose) {
  const b = box(); b.classList.remove('hidden');
  b.replaceChildren(h('div', { class: 'mb-head' }, h('b', { text: title }), h('button', { class: 'btn ghost icon', type: 'button', id: 'mb-close', 'aria-label': t('common.close'), onclick: () => { hideBox(); onClose && onClose(); }, html: icon('close') })), h('div', { html: bodyHtml, id: 'mb-body' }));
}
export function hideBox() { box().classList.add('hidden'); box().replaceChildren(); }

export function measureRows(a, b, m) {
  const one = (d) => {
    if (d.kind === 'face') {
      const r = [[t('meas.type'), t('meas.face', { type: FACE_T[d.geom] ? t(FACE_T[d.geom]) : t('meas.f_free') })], [t('meas.area'), num(d.area) + ' mm²']];
      if (d.radius != null) r.push([t('meas.radius'), num(d.radius) + ' mm'], [t('meas.diameter'), num(d.radius * 2) + ' mm']);
      if (d.normal) r.push([t('meas.normal'), d.normal.map((x) => fmt(x, 3)).join('; ')]);
      return r;
    }
    const r = [[t('meas.type'), t('meas.edge', { type: EDGE_T[d.geom] ? t(EDGE_T[d.geom]) : t('meas.e_curve') })], [t('meas.length'), num(d.length) + ' mm']];
    if (d.radius != null) r.push([t('meas.radius'), num(d.radius) + ' mm'], [t('meas.diameter'), num(d.radius * 2) + ' mm']);
    return r;
  };
  if (!b) return one(a);
  const r = [[t('meas.distance'), num(m.distance) + ' mm'], [t('meas.center_dist'), num(m.centerDistance) + ' mm']];
  if (m.angle != null) r.push([t('meas.angle'), num(m.angle) + '°']);
  r.push(['ΔX', num(m.delta[0]) + ' mm'], ['ΔY', num(m.delta[1]) + ' mm'], ['ΔZ', num(m.delta[2]) + ' mm']);
  return r;
}

export async function showProps(app, bodyId) {
  let p; try { p = await app.call('bodyProps', { id: bodyId }); } catch (e) { toast(t('msg.props_failed', { msg: errText(e) }), true); return; }
  const dens = h('input', { type: 'text', id: 'dens', value: '', placeholder: t('props.dens_ph'), style: { width: '80px' } });
  const mass = h('span', { id: 'mass', text: '—' });
  dens.addEventListener('input', () => { const d = parseFloat(dens.value.replace(',', '.')); mass.textContent = d > 0 ? fmt((p.volume / 1000) * d, 2) + ' g' : '—'; });
  const [a, b] = p.bbox;
  const html = rowsHtml([[t('props.body'), app.bodyName(bodyId)], [t('props.volume'), num(p.volume) + ' mm³'], [t('props.area'), num(p.area) + ' mm²'],
    [t('props.com'), p.com.map((x) => fmt(x, 3)).join('; ')], [t('props.size'), p.size.map((x) => fmt(x, 3)).join(' × ') + ' mm'],
    [t('props.bounds_x'), fmt(a[0], 3) + ' … ' + fmt(b[0], 3)], [t('props.bounds_y'), fmt(a[1], 3) + ' … ' + fmt(b[1], 3)], [t('props.bounds_z'), fmt(a[2], 3) + ' … ' + fmt(b[2], 3)]]);
  showBox(t('props.title'), html, () => app.endTool());
  $('#mb-body').append(h('div', { style: { marginTop: '6px' } }, t('props.density') + ' ', dens, '  ' + t('props.mass') + ' ', mass));
}
