// Sağ panel: özellik formu (canlı önizleme), sketch paneli, kesit paneli; parametre tablosu ve inceleme araçları.
import { h, $, toast, modal, fmt, esc } from './dom.js';
import { fieldsFor, featLabel, THREADS, patternSources } from './features.js';
import { evalExpr, resolveParams } from '../shared/expr.js';
import { basePlane } from '../shared/vec.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (v) => fmt(v, 4);

// ------------------------------------------------------------------ Özellik paneli
export class FeaturePanel {
  constructor(app, draft, idx) {
    this.app = app; this.draft = draft; this.idx = idx; this.isNew = idx == null;
    this.at = this.isNew ? (app.doc.rollback ?? app.doc.features.length) : idx;
    this.activeSel = null; this.status = null; this.closed = false; this.firstBody = !(app.result?.bodies.length);
    this.title = (this.isNew ? 'Yeni ' : 'Düzenle: ') + (this.isNew ? featLabel(draft) : draft.name || featLabel(draft));
  }
  ctx() {
    const feats = this.app.doc.features.slice(0, this.at);
    return { doc: { ...this.app.doc, features: feats }, bodies: this.app.result?.bodies || [], sketches: feats.filter((f) => f.type === 'sketch') };
  }
  fields() { return fieldsFor(this.draft, this.ctx()); }
  hasSel() { return this.fields().some((f) => f.t === 'sel' || (f.t === 'source' && this.draft.source?.kind === 'body')); }
  pickBase() { return this.activeSel != null; }
  makeDoc(rollback) {
    const d = this.app.cloneDoc(this.app.doc);
    if (this.isNew) d.features.splice(this.at, 0, clone(this.draft)); else d.features[this.idx] = clone(this.draft);
    d.rollback = rollback; return d;
  }
  validate() {
    const d = this.draft;
    if (['extrude', 'revolve', 'hole'].includes(d.type)) {
      if (!d.sketch || !this.ctx().sketches.some((s) => s.id === d.sketch)) return 'Önce bir sketch seçin ya da çizin.';
      if (d.type !== 'hole' && Array.isArray(d.profiles) && !d.profiles.length) return 'En az bir profil seçin (görünümde profile tıklayın).';
    }
    return null;
  }

  open() {
    const app = this.app; app.edit = this;
    this.render();
    // ilk seçim alanı boşsa etkin yap
    const first = this.fields().find((f) => f.t === 'sel');
    if (first) this.setActive(first.k, true);
    this.updateViewport();
    app.previewSoon(0);
  }

  // --- görünüm
  render() {
    const p = $('#panel'); p.classList.remove('hidden');
    const body = h('div', { class: 'body' });
    for (const fd of this.fields()) { const row = this.fieldRow(fd); if (row) body.append(row); }
    this.errEl = h('div', { class: 'err', id: 'p-err' }); this.noteEl = h('div', { class: 'note', id: 'p-note' });
    body.append(this.errEl, this.noteEl);
    p.replaceChildren(h('h3', { text: this.title, 'data-title': '' }), body,
      h('div', { class: 'actions' }, h('button', { class: 'btn pri', id: 'p-ok', onclick: () => this.ok() }, 'Tamam'), h('button', { class: 'btn', id: 'p-cancel', onclick: () => this.cancel() }, 'İptal')));
    this.setStatus(this.status);
    this.refreshSels();
  }
  row(label, ctl, extra = '') { return h('div', { class: 'fld ' + extra }, h('label', { text: label }), ctl); }

  fieldRow(fd) {
    const d = this.draft, app = this.app;
    switch (fd.t) {
      case 'expr': {
        const inp = h('input', { type: 'text', 'data-k': fd.k, value: d[fd.k] ?? '', autocomplete: 'off', spellcheck: 'false' });
        const hint = h('span', { class: 'unit' });
        const upd = () => {
          let t = fd.unit || '';
          try { const v = evalExpr(inp.value, app.vars()); if (!/^\s*-?[0-9]*[.,]?[0-9]+\s*$/.test(inp.value)) t = '= ' + num(v) + ' ' + (fd.unit || ''); inp.style.borderColor = ''; hint.style.color = ''; }
          catch (e) { t = e.message; inp.style.borderColor = 'var(--danger)'; hint.style.color = 'var(--danger)'; }
          hint.textContent = t;
        };
        upd();
        inp.addEventListener('input', () => { d[fd.k] = inp.value; upd(); this.setActive(null); this.changed(); });
        inp.addEventListener('focus', () => this.setActive(null));
        return this.row(fd.label, h('div', {}, inp, hint));
      }
      case 'select': {
        const s = h('select', { 'data-k': fd.k }, fd.opts.map(([v, l]) => h('option', { value: v, selected: String(d[fd.k]) === String(v) }, l)));
        s.addEventListener('change', () => { d[fd.k] = s.value; this.setActive(null); this.fieldChanged(fd.k); });
        return this.row(fd.label, s);
      }
      case 'check': {
        const c = h('input', { type: 'checkbox', 'data-k': fd.k, checked: !!d[fd.k] });
        c.addEventListener('change', () => { d[fd.k] = c.checked; this.setActive(null); this.changed(); });
        return this.row(fd.label, h('label', {}, c));
      }
      case 'sketch': {
        let list = this.ctx().sketches;
        if (fd.need === 'points') list = list.filter((s) => (s.ents || []).some((e) => e.type === 'point' || e.type === 'circle'));
        if (!list.length) return this.row(fd.label, h('span', { class: 'note', text: fd.need === 'points' ? 'Nokta içeren sketch yok' : 'Sketch yok' }));
        if (!list.some((s) => s.id === d.sketch)) d.sketch = list[list.length - 1].id;
        const s = h('select', { 'data-k': fd.k }, list.map((x) => h('option', { value: x.id, selected: x.id === d.sketch }, x.name || x.id)));
        s.addEventListener('change', () => { d.sketch = s.value; d.profiles = 'all'; this.fieldChanged('sketch'); });
        return this.row(fd.label, s);
      }
      case 'profiles': {
        this.profEl = h('span', { 'data-k': fd.k });
        const btn = h('button', { class: 'btn', style: { padding: '1px 8px' }, onclick: () => { d.profiles = 'all'; this.refreshProfiles(); this.changed(); } }, 'Tümü');
        const box = h('div', { class: 'selbox active', style: { cursor: 'default' } }, this.profEl, btn);
        this.refreshProfiles();
        return this.row(fd.label, box);
      }
      case 'axis': {
        const sk = this.ctx().sketches.find((s) => s.id === d.sketch);
        const lines = (sk?.ents || []).filter((e) => e.type === 'line');
        const opts = [['sketchX', 'Sketch X ekseni'], ['sketchY', 'Sketch Y ekseni'], ...lines.map((l, i) => ['line:' + l.id, 'Çizgi ' + (i + 1) + (l.cons ? ' (yapı)' : '')])];
        const cur = d.axis?.kind === 'line' ? 'line:' + d.axis.ent : d.axis?.kind || 'sketchX';
        const s = h('select', { 'data-k': 'axis' }, opts.map(([v, l]) => h('option', { value: v, selected: v === cur }, l)));
        s.addEventListener('change', () => { d.axis = s.value.startsWith('line:') ? { kind: 'line', ent: s.value.slice(5) } : { kind: s.value }; this.changed(); });
        return this.row(fd.label, s);
      }
      case 'thread': {
        const cur = d.thread?.designation || '';
        const s = h('select', { 'data-k': 'thread' }, [h('option', { value: '' }, 'Yok'), ...THREADS.map((t) => h('option', { value: t.designation, selected: t.designation === cur }, `${t.designation} (adım ${String(t.pitch).replace('.', ',')})`))]);
        s.addEventListener('change', () => {
          const t = THREADS.find((x) => x.designation === s.value);
          d.thread = t ? { designation: t.designation, pitch: t.pitch, major: t.major } : null;
          if (t) d.dia = String(Math.round((t.major - t.pitch) * 1000) / 1000);
          this.fieldChanged('thread');
        });
        return this.row(fd.label, s);
      }
      case 'sel': {
        const el = h('div', { class: 'selbox', 'data-k': fd.k, tabindex: '0', onclick: () => this.setActive(fd.k) });
        el.append(h('span', { class: 'cnt' }), h('button', { class: 'clr', title: 'Seçimi temizle', onclick: (e) => { e.stopPropagation(); this.clearSel(fd.k); } }, 'Temizle'));
        return this.row(fd.label, el);
      }
      case 'source': {
        const srcs = patternSources(this.ctx().doc);
        const cur = d.source?.kind === 'feature' ? 'f:' + d.source.id : 'b';
        const s = h('select', { 'data-k': 'source' }, [...srcs.map((f) => h('option', { value: 'f:' + f.id, selected: cur === 'f:' + f.id }, f.name || f.id)), h('option', { value: 'b', selected: cur === 'b' }, 'Gövdeler (seçerek)')]);
        s.addEventListener('change', () => { d.source = s.value === 'b' ? { kind: 'body', bodies: [] } : { kind: 'feature', id: s.value.slice(2) }; this.fieldChanged('source'); });
        const wrap = h('div', {}, s);
        if (d.source?.kind === 'body') {
          const el = h('div', { class: 'selbox', 'data-k': 'source.bodies', style: { marginTop: '4px' }, tabindex: '0', onclick: () => this.setActive('source.bodies') });
          el.append(h('span', { class: 'cnt' }), h('button', { class: 'clr', onclick: (e) => { e.stopPropagation(); this.clearSel('source.bodies'); } }, 'Temizle'));
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
    else if (first && k === 'kind') this.setActive(first.k, true);
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
  clearSel(k) { this.setSelList(k, []); this.refreshSels(); this.updateViewport(); this.changed(); }
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
      const noun = { edge: 'kenar', face: 'yüz', body: 'gövde' }[kind] || 'öğe';
      const nameOf = (id) => this.app.bodyName(id);
      el.querySelector('.cnt').textContent = n ? (kind === 'body' && n <= 2 ? this.getSel(k).map(nameOf).join(', ') : `${n} ${noun} seçili`) : `${noun[0].toUpperCase() + noun.slice(1)} seçin…`;
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
    this.profEl.textContent = p === 'all' || p == null ? `Tümü${total != null ? ' (' + total + ')' : ''}` : `${p.length} profil seçili`;
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
      this.app.regionCount = sk && pl ? vp.setRegions(pl, sk, d.profiles, true) : (vp.setRegions(null, null), null);
      this.refreshProfiles();
    } else vp.setRegions(null, null);
    this.app.setHint(this.hint());
  }
  hint() {
    const k = this.activeSel; if (k) return { edge: 'Görünümde kenarlara tıklayın (tekrar tıklarsanız çıkar)', face: 'Görünümde yüzlere tıklayın', body: 'Görünümde gövdeye tıklayın' }[this.selKind(k)] || '';
    if (['extrude', 'revolve'].includes(this.draft.type)) return 'Profil bölgelerine tıklayarak seçimi değiştirebilirsiniz';
    return '';
  }
  // yeni sonuç geldiğinde
  afterResult() { this.updateViewport(); }
  setStatus(st) {
    this.status = st;
    if (!this.errEl) return;
    this.errEl.textContent = st && st.ok === false ? st.error || 'Hata' : '';
    this.errEl.dataset.bad = st && st.ok === false ? '1' : '';
  }

  async onPick(hit) {
    if (!hit) return;
    const d = this.draft;
    if (hit.kind === 'region') {
      if (!['extrude', 'revolve'].includes(d.type)) return;
      const total = this.app.regionCount || 0; let sel = d.profiles === 'all' ? Array.from({ length: total }, (_, i) => i) : (d.profiles || []).slice();
      const at = sel.indexOf(hit.idx); if (at >= 0) sel.splice(at, 1); else sel.push(hit.idx);
      sel.sort((a, b) => a - b);
      d.profiles = sel.length === total ? 'all' : sel;
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
      if (i >= 0) list.splice(i, 1);
      else { try { list.push(await this.app.describe(hit, kind)); } catch (e) { toast('Seçim okunamadı: ' + e.message, true); return; } }
    }
    this.setSelList(k, list); this.refreshSels(); this.updateViewport(); this.changed();
  }

  async ok() {
    if (this.closed) return;
    const err = this.validate();
    if (err) { this.setStatus({ ok: false, error: err }); toast(err, true); return; }
    await this.app.flushPreview();
    const st = this.status;
    this.close();
    await this.app.commitFeature(this);
    if (this.firstBody) this.app.viewport.fit();
    if (st && st.ok === false) toast('Özellik kaydedildi ama hata veriyor: ' + st.error, true);
  }
  cancel() { if (this.closed) return; this.close(); this.app.endEdit(); }
  close() {
    this.closed = true; this.app.edit = null;
    $('#panel').classList.add('hidden'); $('#panel').replaceChildren();
    const vp = this.app.viewport; vp.setRegions(null, null); vp.setSelection([]); this.app.setHint('');
  }
}

// ------------------------------------------------------------------ Sketch paneli
export class SketchPanel {
  constructor(app, session) { this.app = app; this.s = session; }
  render() {
    const app = this.app, s = this.s, p = $('#panel'); p.classList.remove('hidden');
    const body = h('div', { class: 'body' });
    const isBase = s.draft.plane?.kind === 'base';
    body.append(h('div', { class: 'note', text: isBase ? 'Düzlem: ' + s.draft.plane.name : 'Düzlem: seçilen yüz' }));
    if (isBase) {
      const inp = h('input', { type: 'text', 'data-k': 'offset', value: s.draft.plane.offset ?? '0' });
      inp.addEventListener('change', () => app.setSketchOffset(inp.value));
      body.append(h('div', { class: 'fld' }, h('label', { text: 'Düzlem ofseti' }), h('div', {}, inp, h('span', { class: 'unit', text: 'mm' }))));
    }
    this.dof = h('div', { class: 'note', id: 'sk-dof' });
    this.list = h('div', { class: 'clist', id: 'sk-cons' });
    body.append(this.dof, h('div', { class: 'note', text: 'Kısıtlar' }), this.list);
    p.replaceChildren(h('h3', { text: 'Sketch: ' + (s.draft.name || '') }), body,
      h('div', { class: 'actions' }, h('button', { class: 'btn pri', id: 'sk-finish', onclick: () => app.finishSketch() }, 'Sketch\'i Bitir'), h('button', { class: 'btn', id: 'sk-cancel', onclick: () => app.cancelSketch() }, 'İptal')));
    this.refresh();
  }
  refresh() {
    const sk = this.app.sketcher; if (!sk || !this.list) return;
    let items = []; try { items = sk.constraintsList() || []; } catch (e) { /* sketcher henüz hazır değil */ }
    this.list.replaceChildren(...(items.length ? items.map((c) => h('div', { class: 'row', 'data-id': c.id }, h('span', { class: 'nm', text: c.label }), h('button', { title: 'Kısıtı sil', onclick: () => { sk.removeConstraint(c.id); this.refresh(); this.app.refreshToolbar(); } }, '✕'))) : [h('div', { class: 'note', style: { padding: '4px 8px' }, text: 'Henüz kısıt yok' })]));
    const ls = sk.lastSolve;
    this.dof.textContent = ls ? (ls.ok === false ? 'Çözüm yok: kısıtları gözden geçirin' : ls.dof === 0 ? 'Tam tanımlı' : ls.dof != null ? 'Serbestlik derecesi: ' + ls.dof : '') : '';
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
  open() {
    const app = this.app; app.sectionPanel = this;
    const p = $('#panel'); p.classList.remove('hidden');
    const [lo, hi] = this.range(); if (this.pos == null) this.pos = Math.round((lo + hi) / 2);
    const sel = h('select', { id: 'sec-axis' }, ['X', 'Y', 'Z'].map((a) => h('option', { value: a, selected: a === this.axis }, a)));
    this.slider = h('input', { type: 'range', id: 'sec-pos', min: lo, max: hi, step: 0.5, value: this.pos, style: { width: '100%' } });
    this.val = h('input', { type: 'text', id: 'sec-val', value: String(this.pos) });
    const flip = h('input', { type: 'checkbox', id: 'sec-flip', checked: this.flip });
    const apply = () => { app.viewport.setSection(this.axis, this.pos, this.flip); };
    sel.addEventListener('change', () => { this.axis = sel.value; const [l, hh] = this.range(); this.slider.min = l; this.slider.max = hh; this.pos = Math.round((l + hh) / 2); this.slider.value = this.pos; this.val.value = String(this.pos); apply(); });
    this.slider.addEventListener('input', () => { this.pos = +this.slider.value; this.val.value = String(this.pos); apply(); });
    this.val.addEventListener('change', () => { const v = parseFloat(this.val.value.replace(',', '.')); if (Number.isFinite(v)) { this.pos = v; this.slider.value = v; apply(); } });
    flip.addEventListener('change', () => { this.flip = flip.checked; apply(); });
    p.replaceChildren(h('h3', { text: 'Kesit görünümü' }), h('div', { class: 'body' },
      h('div', { class: 'fld' }, h('label', { text: 'Eksen' }), sel), h('div', { class: 'fld' }, h('label', { text: 'Konum (mm)' }), this.val), this.slider,
      h('div', { class: 'fld' }, h('label', { text: 'Ters çevir' }), h('label', {}, flip)), h('div', { class: 'note', text: 'Kesit yalnız görüntüyü etkiler; model değişmez.' })),
      h('div', { class: 'actions' }, h('button', { class: 'btn pri', id: 'sec-close', onclick: () => this.close() }, 'Kesiti Kapat')));
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
  const errBox = h('div', { class: 'err', id: 'par-err' });
  const check = () => {
    const errs = rows.map(() => null); const seen = new Set();
    rows.forEach((r, i) => {
      const n = (r.name || '').trim();
      if (!n) errs[i] = 'Ad boş olamaz';
      else if (!NAME_RE.test(n)) errs[i] = 'Ad yalnız harf, rakam ve _ içerebilir; rakamla başlayamaz';
      else if (RESERVED.has(n)) errs[i] = '"' + n + '" ayrılmış bir ad';
      else if (seen.has(n)) errs[i] = 'Bu ad zaten var';
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
      const e = tr.querySelector('.pe'); e.textContent = errs[i] || ''; tr.classList.toggle('err', !!errs[i]);
    });
    errBox.textContent = errs.some(Boolean) ? 'Kırmızı satırlardaki hataları düzeltin.' : '';
    return errs;
  };
  const build = () => {
    tbody.replaceChildren(...rows.map((r, i) => {
      const mk = (k, w) => { const inp = h('input', { type: 'text', value: r[k] ?? '', 'data-k': k, style: { width: w } }); inp.addEventListener('input', () => { r[k] = inp.value; draw(); }); return h('td', {}, inp); };
      return h('tr', { 'data-i': i }, mk('name', '90px'), mk('expr', '130px'), h('td', { class: 'pv', style: { fontVariantNumeric: 'tabular-nums', minWidth: '60px' } }), mk('note', '150px'),
        h('td', {}, h('button', { class: 'btn danger', title: 'Parametreyi sil', style: { padding: '1px 8px' }, onclick: () => { rows.splice(i, 1); build(); } }, '✕')),
        h('td', { class: 'pe err', style: { fontSize: '11px', minWidth: '120px' } }));
    }));
    draw();
  };
  build();
  const add = h('button', { class: 'btn', id: 'par-add', onclick: () => { let n = 1; while (rows.some((r) => r.name === 'P' + n)) n++; rows.push({ name: 'P' + n, expr: '10', note: '' }); build(); tbody.querySelector('tr:last-child input')?.focus(); } }, '+ Parametre ekle');
  const content = h('div', {}, h('div', { class: 'note', text: 'Parametre adlarını ölçü alanlarında ve sketch ölçülerinde kullanabilirsiniz (ör. L/2). Bir parametre öncekileri kullanabilir.' }),
    h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Ad' }), h('th', { text: 'İfade' }), h('th', { text: 'Değer' }), h('th', { text: 'Not' }), h('th'), h('th'))), tbody), h('div', { style: { marginTop: '8px' } }, add), errBox);
  const r = await modal({ title: 'Parametreler', content, buttons: [{ label: 'İptal', value: null }, { label: 'Tamam', cls: 'pri', value: 'ok', check: () => { const e = draw(); if (e.some(Boolean)) { toast('Parametre tablosunda hata var; kırmızı satırları düzeltin.', true); return false; } } }] });
  if (r !== 'ok') return;
  const out = rows.map((x) => ({ name: x.name.trim(), expr: String(x.expr).trim(), ...(x.note ? { note: x.note } : {}) }));
  if (JSON.stringify(out) === JSON.stringify(app.doc.params || [])) return;
  await app.commit((doc) => { doc.params = out; });
}

// ------------------------------------------------------------------ İnceleme araçları
const FACE_T = { PLANE: 'Düzlem', CYLINDRE: 'Silindir', CONE: 'Koni', SPHERE: 'Küre', TORUS: 'Halka (torus)' };
const EDGE_T = { LINE: 'Doğru', CIRCLE: 'Daire / yay', ELLIPSE: 'Elips' };
const rowsHtml = (rows) => '<table>' + rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('') + '</table>';
const box = () => $('#measurebox');
export function showBox(title, bodyHtml, onClose) {
  const b = box(); b.classList.remove('hidden');
  b.replaceChildren(h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' } }, h('b', { text: title }), h('button', { class: 'btn', style: { padding: '0 7px' }, id: 'mb-close', onclick: () => { hideBox(); onClose && onClose(); } }, '✕')), h('div', { html: bodyHtml, id: 'mb-body' }));
}
export function hideBox() { box().classList.add('hidden'); box().replaceChildren(); }

export function measureRows(a, b, m) {
  const one = (d) => {
    if (d.kind === 'face') {
      const r = [['Tür', 'Yüz — ' + (FACE_T[d.geom] || 'Serbest yüzey')], ['Alan', num(d.area) + ' mm²']];
      if (d.radius != null) r.push(['Yarıçap', num(d.radius) + ' mm'], ['Çap', num(d.radius * 2) + ' mm']);
      if (d.normal) r.push(['Normal', d.normal.map((x) => fmt(x, 3)).join('; ')]);
      return r;
    }
    const r = [['Tür', 'Kenar — ' + (EDGE_T[d.geom] || 'Eğri')], ['Uzunluk', num(d.length) + ' mm']];
    if (d.radius != null) r.push(['Yarıçap', num(d.radius) + ' mm'], ['Çap', num(d.radius * 2) + ' mm']);
    return r;
  };
  if (!b) return one(a);
  const r = [['En kısa mesafe', num(m.distance) + ' mm'], ['Merkezler arası', num(m.centerDistance) + ' mm']];
  if (m.angle != null) r.push(['Açı', num(m.angle) + '°']);
  r.push(['ΔX', num(m.delta[0]) + ' mm'], ['ΔY', num(m.delta[1]) + ' mm'], ['ΔZ', num(m.delta[2]) + ' mm']);
  return r;
}

export async function showProps(app, bodyId) {
  let p; try { p = await app.call('bodyProps', { id: bodyId }); } catch (e) { toast('Özellikler okunamadı: ' + e.message, true); return; }
  const dens = h('input', { type: 'text', id: 'dens', value: '', placeholder: 'ör. 7,85', style: { width: '80px' } });
  const mass = h('span', { id: 'mass', text: '—' });
  dens.addEventListener('input', () => { const d = parseFloat(dens.value.replace(',', '.')); mass.textContent = d > 0 ? fmt((p.volume / 1000) * d, 2) + ' g' : '—'; });
  const [a, b] = p.bbox;
  const html = rowsHtml([['Gövde', app.bodyName(bodyId)], ['Hacim', num(p.volume) + ' mm³'], ['Yüzey alanı', num(p.area) + ' mm²'],
    ['Ağırlık merkezi', p.com.map((x) => fmt(x, 3)).join('; ')], ['Kutu ölçüleri', p.size.map((x) => fmt(x, 3)).join(' × ') + ' mm'],
    ['Sınırlar X', fmt(a[0], 3) + ' … ' + fmt(b[0], 3)], ['Sınırlar Y', fmt(a[1], 3) + ' … ' + fmt(b[1], 3)], ['Sınırlar Z', fmt(a[2], 3) + ' … ' + fmt(b[2], 3)]]);
  showBox('Özellikler', html, () => app.endTool());
  $('#mb-body').append(h('div', { style: { marginTop: '6px' } }, 'Yoğunluk (g/cm³): ', dens, '  Kütle: ', mass));
}
