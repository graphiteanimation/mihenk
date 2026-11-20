// İşlem paneli: Yüzey, Kontur, Cep, Delme/diş. Sekmeler: Takım / Geometri / Yükseklikler / Pasolar.
// Geometri görünümde seçilir (yüz, eskiz profili, gövde dış sınırı; delikler özellik listesinden). "Yolu hesapla" taslağı kaydetmeden hesaplar.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { t, errText, fmtNum } from '../../shared/i18n.js';
import { applyPreset } from '../../cam/tools.js';
import { CYCLE_TOOLS } from '../../cam/ops/drill.js';
import { findRegions, resolveProfiles, selectionFor } from '../../shared/profiles.js';
import { clone, getP, setP, numField, textField, selField, checkField, sec, callout, panelShell, okCancel, panelKeys } from './util.js';
import { protectedHits, toolLabel, openToolManager } from './toolui.js';

const TABS = [['tool', 'cam.op.tab_tool'], ['geom', 'cam.op.tab_geom'], ['heights', 'cam.op.tab_heights'], ['passes', 'cam.op.tab_passes']];
const TOOL_KINDS = { face: ['face', 'flat', 'bullnose'], contour: ['flat', 'bullnose', 'ball'], pocket: ['flat', 'bullnose', 'ball'] };
const COOLANT = ['flood', 'mist', 'air', 'through', 'off'];
const TOP_FROM = ['stockTop', 'modelTop', 'selection', 'abs'];
const BOT_FROM = ['selection', 'modelBottom', 'stockBottom', 'modelTop', 'abs'];
export const OP_TYPE_KEY = (op) => (op.type === 'drill' && op.cycle === 'tap' ? 'thread' : op.type);

export const compatibleTools = (tools, type, cycle) => tools.filter((x) => (type === 'drill' ? (CYCLE_TOOLS[cycle] || []) : TOOL_KINDS[type] || []).includes(x.type));

// Yeni işlem: yalnız güvenli geometrik varsayılanlar (yükseklikler). Kesme verisi ön ayardan gelir; yoksa boş kalır ve doldurulması istenir.
export function defaultOp(type, cycle, id, name, tools) {
  const op = { id, type, name, toolId: null, rpm: null, feedCut: null, feedPlunge: null, coolant: 'flood', heights: { clearance: 5, retract: 2 } };
  if (type === 'face') Object.assign(op, { stepover: null, direction: 0, stockToLeave: 0, extend: 0 }), op.heights = { ...op.heights, top: { from: 'stockTop', off: 0 }, bottom: { from: 'modelTop', off: 0 } };
  else if (type === 'contour') Object.assign(op, { geom: [], side: undefined, dir: 'climb', comp: 'computer', stepdown: null, ramp: { kind: 'plunge' }, leadIn: { kind: 'none' }, leadOut: { kind: 'none' } }), op.heights = { ...op.heights, top: { from: 'stockTop', off: 0 }, bottom: { from: 'selection', off: 0 } };
  else if (type === 'pocket') Object.assign(op, { geom: [], dir: 'climb', stepover: null, stepdown: null, entry: { kind: 'ramp', angle: null }, finishPass: false }), op.heights = { ...op.heights, top: { from: 'stockTop', off: 0 }, bottom: { from: 'selection', off: 0 } };
  else if (type === 'drill') Object.assign(op, { cycle: cycle || 'drill', holes: { kind: 'feature' }, depth: { from: 'hole', tipComp: true, breakThrough: 1 }, order: 'shortest' });
  if (op.side === undefined) delete op.side;
  const tl = compatibleTools(tools, type, op.cycle)[0];
  if (tl) { op.toolId = tl.id; if (tl.presets?.length) { try { Object.assign(op, applyPreset(op, tl, tl.presets[0].name)); } catch (e) { /* ön ayar yoksa boş kalır */ } } }
  return op;
}

export class OpPanel {
  constructor(cam, opId, { isNew = false } = {}) {
    this.cam = cam; this.app = cam.app; this.id = opId; this.isNew = isNew; this.closed = false; this.tab = 'tool'; this.pickMode = 'face'; this.sketchId = null;
    const l = cam.opLoc(opId); this.setupId = l.setup.id; this.draft = clone(l.op); this.out = null;
  }
  get tool() { return this.cam.tools().find((x) => x.id === this.draft.toolId) || null; }
  open() { this.render(); this.unkeys = panelKeys(document.getElementById('panel'), () => this.ok(), () => this.cancel()); this.showResult(); this.pickView(); this.cam.ops.refreshPaths(this.id); }
  relang() { this.render(); this.showResult(); }
  check() { this.showResult(); }
  close() { if (this.closed && !this.unkeys) return; this.closed = true; this.unkeys?.(); this.unkeys = null; this.dispose(); this.cam.panelClosed(this); }
  dispose() { const vp = this.app.viewport; vp.setRegions(null, null); vp.setSelection([]); vp.setFilter({}); this.app.setHint(''); this.cam.ops.refreshPaths(null, true); }
  cancel() { const wasNew = this.isNew; this.close(); if (wasNew) this.cam.mut((c) => { for (const x of c.setups) x.ops = (x.ops || []).filter((o) => o.id !== this.id); }); }
  numErr() { return !!this.bodyEl?.querySelector('.input.err'); }
  // U-10: kırmızı alan görünmeyen sekmede olabilir. Diğer sekmeleri ekran dışında kurup denetler; ilk hatalı sekmenin kimliğini döndürür.
  hiddenBadTab() {
    const keep = this.draft.preset; const fns = { tool: () => this.tabTool(), geom: () => this.tabGeom(), heights: () => this.tabHeights(), passes: () => this.tabPasses() };
    let found = null;
    for (const [id] of TABS) {
      if (id === this.tab) continue;
      try { const box = h('div', {}, ...fns[id]().filter(Boolean)); if (box.querySelector('.input.err')) { found = id; break; } } catch (e) { /* sekme kurulamadı: çekirdek denetler */ }
    }
    if (keep !== undefined) this.draft.preset = keep; // sekme kurulumu ön ayar etiketini silmesin
    return found;
  }
  problems() { if (!String(this.draft.name || '').trim()) return t('cam.fld.required'); if (this.numErr()) return t('cam.su.fix_fields');
    const bt = this.hiddenBadTab(); if (bt) { this.tab = bt; this.render(); this.showResult(); this.pickView(); return t('cam.su.fix_fields'); } if (!this.draft.toolId) return t('cam.op.pick_tool'); return null; }
  ok() {
    const bad = this.problems(); if (bad) { this.app.toastInfo(bad); return; }
    const d = clone(this.draft); this.close();
    this.cam.mut((c) => { for (const s of c.setups) { const i = (s.ops || []).findIndex((x) => x.id === d.id); if (i >= 0) s.ops[i] = d; } });
  }
  async compute() {
    const bad = this.problems(); if (bad) { this.out = { blocked: true }; this.showResult(); this.app.toastInfo(bad); return; } // U-10: engellenen Hesapla "Bu yol eski" demez
    const setup = this.cam.setup(this.setupId); const d = clone(this.draft);
    this.out = { busy: true }; this.showResult();
    this.out = await this.cam.ops.computeDraft(setup, d); this.showResult();
    this.cam.ops.refreshPaths(this.id); this.app.C.renderBrowser();
  }
  showResult() {
    const box = this.resEl; if (!box || this.closed) return; box.replaceChildren();
    const o = this.out;
    if (!o) { const st = this.cam.ops.state(this.draft, this.cam.setup(this.setupId)); box.append(callout('info', null, t(st.state === 'stale' ? 'cam.op.res_stale' : 'cam.op.res_none'))); return; }
    if (o.busy) { box.append(callout('info', null, t('cam.run.busy'))); return; }
    if (o.blocked) { box.append(callout('warn', null, t('cam.op.res_blocked'))); return; }
    if (o.error) { box.append(callout('err', t('cam.op.res_err'), errText(o.error))); return; }
    const s = o.tp.stats || {};
    box.append(callout('ok', t('cam.op.res_ok'), t('cam.op.res_stats', { moves: o.tp.moves.length, cut: fmtNum(s.cutLen ?? 0, 1), rapid: fmtNum(s.rapidLen ?? 0, 1), min: fmtNum(s.timeMin ?? 0, 1) }), 'check'));
    for (const w of o.tp.warnings || []) box.append(callout('warn', null, errText({ code: w.code, params: w.params })));
  }
  invalidate() { if (this.out && !this.out.busy) { this.out = null; this.showResult(); } }
  // alan kısayolları
  num(label, path, o = {}) {
    const d = this.draft;
    return numField({ label, value: getP(d, path), unit: o.unit ?? 'mm', nullable: !!o.nullable, min: o.min, max: o.max, int: o.int, f: 'op-' + (o.f || path.replace(/\./g, '-')), hint: o.hint, warn: o.warn,
      set: (v) => { setP(d, path, v === null && o.nullable ? undefined : v); this.invalidate(); } });
  }
  sel(label, path, opts, o = {}) {
    const d = this.draft;
    return selField({ label, value: getP(d, path) ?? o.def ?? '', opts, f: 'op-' + (o.f || path.replace(/\./g, '-')), hint: o.hint, set: (v) => { if (o.set) o.set(v); else setP(d, path, v === '' ? undefined : v); this.invalidate(); if (o.redraw) this.render(); } });
  }

  // ---------------------------------------------------------------- çizim
  render() {
    const d = this.draft; const keep = this.tab;
    this.resEl = h('div', { class: 'op-res', 'data-testid': 'op-result', 'aria-live': 'polite' });
    const tabs = h('div', { class: 'seg', role: 'group', 'aria-label': t('cam.op.tabs') }, ...TABS.map(([id, key]) => h('button', { type: 'button', 'aria-pressed': String(id === keep), 'data-testid': 'op-tab-' + id, onclick: () => { this.tab = id; this.render(); this.showResult(); this.pickView(); } }, t(key))));
    const rows = { tool: () => this.tabTool(), geom: () => this.tabGeom(), heights: () => this.tabHeights(), passes: () => this.tabPasses() }[keep]();
    this.bodyEl = h('div', { class: 'op-body' }, ...rows);
    const foot = okCancel(() => this.ok(), () => this.cancel());
    const comp = h('button', { class: 'btn op-compute', type: 'button', id: 'p-compute', 'data-testid': 'op-compute', onclick: () => this.compute() }, h('span', { html: icon('cam-compute', 'sm') }), t('cam.cmd.compute'));
    panelShell(this.isNew ? t('cam.op.title_new', { type: t('cam.op.type.' + OP_TYPE_KEY(d)) }) : t('cam.op.title', { name: d.name }), [tabs, this.bodyEl, comp, this.resEl], foot, () => this.cancel(), 'op-' + (d.type === 'drill' && d.cycle === 'tap' ? 'thread' : d.type));
  }
  tabTool() {
    const d = this.draft, cam = this.cam; const rows = [];
    rows.push(textField({ label: t('cam.op.name'), value: d.name || '', f: 'op-name', set: (v) => { d.name = v; } }));
    const tools = cam.tools().slice().sort((a, b) => a.number - b.number);
    const ok = compatibleTools(tools, d.type, d.cycle).map((x) => x.id);
    if (!tools.length) rows.push(callout('warn', t('cam.op.no_tools'), t('cam.op.no_tools_body')), h('button', { class: 'btn', type: 'button', 'data-testid': 'op-open-tools', onclick: async () => { await openToolManager(cam, 'doc'); if (!this.closed) { this.render(); this.showResult(); } } }, t('cam.cmd.tools')));
    rows.push(selField({ label: t('cam.op.tool'), value: d.toolId || '', f: 'op-tool', opts: [['', t('cam.op.pick_tool')], ...tools.map((x) => [x.id, toolLabel(x) + (ok.includes(x.id) ? '' : ' ' + t('cam.op.tool_mismatch_tag'))])], set: (v) => {
      d.toolId = v || null; const tl = this.tool; if (tl?.presets?.length && !d.preset) { try { Object.assign(d, applyPreset(d, tl, tl.presets[0].name)); } catch (e) { /* ön ayar yoksa elle */ } }
      this.invalidate(); this.render(); this.showResult(); } }));
    const tl = this.tool;
    if (tl) {
      if (!ok.includes(tl.id)) rows.push(callout('err', null, t(d.type === 'drill' ? 'cam.op.tool_cycle_bad' : 'cam.op.tool_type_bad', { type: t('cam.tt.' + tl.type) })));
      const hit = protectedHits(cam.protectedLists(), tl);
      if (hit.length) rows.push(callout('warn', null, t('cam.op.tool_protected', { list: hit.map((x) => x.kind + x.n).join(', ') })));
      if (tl.presets?.length) rows.push(selField({ label: t('cam.op.preset'), value: d.preset || '', f: 'op-preset', hint: t('cam.op.preset_hint'), opts: [['', t('cam.op.preset_manual')], ...tl.presets.map((p) => [p.name, p.name])], set: (v) => {
        if (v) { try { Object.assign(d, applyPreset(d, tl, v)); } catch (e) { this.app.toastInfo(errText(e)); } } else delete d.preset; this.invalidate(); this.render(); this.showResult(); } }));
      else rows.push(h('div', { class: 'note', text: t('cam.op.no_presets') }));
    }
    const manual = () => { delete d.preset; };
    rows.push(sec(t('cam.op.cutdata')),
      this.num(t('cam.op.rpm'), 'rpm', { unit: t('cam.u.rpm'), min: 1, f: 'rpm', warn: (v) => { manual(); return v && this.cam.machine()?.spindle?.maxRpm && v > this.cam.machine().spindle.maxRpm ? t('cam.op.rpm_over', { max: this.cam.machine().spindle.maxRpm }) : null; } }),
      this.num(t('cam.op.feed_cut'), 'feedCut', { unit: t('cam.u.mm_min'), min: 0.001, f: 'feedCut', warn: () => { manual(); return null; } }),
      this.num(t('cam.op.feed_plunge'), 'feedPlunge', { unit: t('cam.u.mm_min'), min: 0.001, f: 'feedPlunge' }));
    if (d.type === 'contour' || d.type === 'pocket') rows.push(this.num(t('cam.op.feed_ramp'), 'feedRamp', { unit: t('cam.u.mm_min'), min: 0.001, nullable: true, f: 'feedRamp', hint: t('cam.op.feed_ramp_hint') }));
    if (d.cycle === 'tap') rows.push(h('div', { class: 'note', text: t('cam.op.tap_feed') }));
    rows.push(this.sel(t('cam.op.coolant'), 'coolant', COOLANT.map((c) => [c, t('cam.cool.' + c)]), { f: 'coolant' }));
    return rows;
  }
  // ---- geometri
  geomLabel(g) {
    if (g.kind === 'face') return t('cam.op.g_face', { body: g.ref?.body ?? '?', n: (g.ref?.idx ?? 0) + 1 });
    if (g.kind === 'sketch') { const sk = this.app.doc.features.find((f) => f.id === g.sketch); const p = g.profiles; return t('cam.op.g_sketch', { name: sk?.name || g.sketch, n: p === 'all' || p == null ? t('common.all') : p.length }); }
    return t('cam.op.g_sil', { body: g.body });
  }
  tabGeom() {
    const d = this.draft, rows = [];
    if (d.type === 'face') {
      rows.push(callout('info', null, t('cam.op.face_geom')), this.num(t('cam.op.direction'), 'direction', { unit: '°', min: -360, max: 360, f: 'direction', hint: t('cam.op.direction_hint') }), this.num(t('cam.op.extend'), 'extend', { min: 0, f: 'extend', nullable: true, hint: t('cam.op.extend_hint') }));
      return rows;
    }
    if (d.type === 'drill') return this.holesRows();
    // kontur ve cep: seçim listesi
    const mode = this.pickMode; const sk = this.app.doc.features.filter((f) => f.type === 'sketch');
    rows.push(selField({ label: t('cam.op.pick_what'), value: mode, f: 'op-pickmode', hint: t('cam.op.pickhint.' + mode), opts: [['face', t('cam.op.pm_face')], ['sketch', t('cam.op.pm_sketch')], ['silhouette', t('cam.op.pm_sil')]], set: (v) => { this.pickMode = v; this.render(); this.showResult(); this.pickView(); } }));
    if (mode === 'sketch') {
      if (!sk.length) rows.push(callout('warn', null, t('cam.op.no_sketch')));
      else { if (!sk.some((s) => s.id === this.sketchId)) this.sketchId = sk[0].id; rows.push(selField({ label: t('cam.op.sketch'), value: this.sketchId, f: 'op-sketch', opts: sk.map((s) => [s.id, s.name || s.id]), set: (v) => { this.sketchId = v; this.pickView(); } })); }
    }
    const list = h('div', { class: 'op-geom', 'data-testid': 'op-geom-list' });
    (d.geom || []).forEach((g, i) => list.append(h('div', { class: 'op-grow', 'data-testid': 'op-geom-row' }, h('span', { class: 'nm', text: this.geomLabel(g) }),
      h('button', { class: 'btn ghost icon', type: 'button', 'aria-label': t('cam.op.g_remove'), 'data-testid': 'op-geom-del', onclick: () => { d.geom.splice(i, 1); this.invalidate(); this.render(); this.showResult(); this.pickView(); }, html: icon('close', 'sm') }))));
    if (!(d.geom || []).length) list.append(h('div', { class: 'note', 'data-testid': 'op-geom-empty', text: t('cam.op.g_empty') }));
    rows.push(sec(t('cam.op.g_selected')), list);
    if (d.type === 'contour') {
      rows.push(this.sel(t('cam.op.side'), 'side', [['', t('cam.op.side_auto')], ['outside', t('cam.op.side_out')], ['inside', t('cam.op.side_in')], ['on', t('cam.op.side_on')]], { f: 'side', hint: t('cam.op.side_hint') }),
        this.sel(t('cam.op.comp'), 'comp', [['computer', t('cam.op.comp_computer')], ['wear', t('cam.op.comp_wear')]], { f: 'comp', def: 'computer', hint: t('cam.op.comp_hint'), redraw: true }));
    }
    rows.push(this.sel(t('cam.op.dir'), 'dir', [['climb', t('cam.op.dir_climb')], ['conv', t('cam.op.dir_conv')]], { f: 'dir', def: 'climb' }));
    return rows;
  }
  holesRows() {
    const d = this.draft; const hs = (this.app.result?.holes || []); const rows = [];
    const f = d.holes.filter || {};
    rows.push(this.sel(t('cam.op.cycle'), 'cycle', Object.keys(CYCLE_TOOLS).map((c) => [c, t('cam.op.cy.' + c)]), { f: 'cycle', def: 'drill', redraw: true, set: (v) => { d.cycle = v; if (v === 'peck' || v === 'chipbreak') d.peck = d.peck ?? null; this.invalidate(); } }));
    if (!hs.length) { rows.push(callout('warn', t('cam.op.no_holes'), t('cam.op.no_holes_body'))); return rows; }
    const dias = [...new Set(hs.map((x) => x.dia).filter((x) => x != null))].sort((a, b) => a - b);
    const feats = [...new Set(hs.map((x) => x.patternOf ?? x.copyOf ?? x.feature))];
    rows.push(selField({ label: t('cam.op.h_dia'), value: f.dia ?? '', f: 'op-h-dia', opts: [['', t('common.all')], ...dias.map((x) => [String(x), 'Ø' + fmtNum(x, 3)])], set: (v) => { setP(d, 'holes.filter.dia', v === '' ? undefined : Number(v)); this.cleanFilter(); this.invalidate(); this.render(); this.showResult(); } }));
    rows.push(selField({ label: t('cam.op.h_feat'), value: f.feature ?? '', f: 'op-h-feat', opts: [['', t('common.all')], ...feats.map((x) => [x, this.app.doc.features.find((q) => q.id === x)?.name || x])], set: (v) => { setP(d, 'holes.filter.feature', v === '' ? undefined : v); this.cleanFilter(); this.invalidate(); this.render(); this.showResult(); } }));
    const pick = hs.filter((x) => (f.dia == null || Math.abs(x.dia - f.dia) < 1e-6) && (f.feature == null || x.feature === f.feature || x.patternOf === f.feature || x.copyOf === f.feature));
    const n = pick.reduce((a, x) => a + (x.positions?.length || 0), 0);
    const list = h('div', { class: 'op-geom', 'data-testid': 'op-holes' });
    for (const x of pick) list.append(h('div', { class: 'op-grow' }, h('span', { class: 'nm', text: t('cam.op.h_row', { name: this.app.doc.features.find((q) => q.id === x.feature)?.name || x.feature, dia: fmtNum(x.dia, 3), n: x.positions?.length || 0, depth: x.through ? t('cam.op.h_through') : fmtNum(x.depth, 3) + ' mm' }) })));
    rows.push(sec(t('cam.op.h_list', { n })), list);
    return rows;
  }
  cleanFilter() { const d = this.draft; if (d.holes.filter && d.holes.filter.dia === undefined && d.holes.filter.feature === undefined) delete d.holes.filter; }
  // görünüm: seçim kipi, vurgu
  pickView() {
    const vp = this.app.viewport, d = this.draft; vp.setRegions(null, null); this.app.setHint('');
    if (this.tab !== 'geom' || !(d.type === 'contour' || d.type === 'pocket')) { vp.setFilter({}); vp.setSelection([]); return; }
    const m = this.pickMode;
    if (m === 'sketch') {
      vp.setFilter({}); vp.setSelection([]);
      const sk = this.app.doc.features.find((f) => f.id === this.sketchId); const pl = this.app.result?.sketches?.[this.sketchId]?.plane;
      if (sk && pl) { const rg = findRegions(sk).regions; const g = (d.geom || []).find((x) => x.kind === 'sketch' && x.sketch === this.sketchId); const idx = !g ? [] : g.profiles === 'all' ? 'all' : resolveProfiles(rg, g.profiles).idx; vp.setRegions(pl, sk, idx, true); }
    } else {
      vp.setFilter(m === 'face' ? { face: true } : { body: true });
      vp.setSelection((d.geom || []).filter((g) => (m === 'face' && g.kind === 'face') || (m === 'silhouette' && g.kind === 'silhouette')).map((g) => (g.kind === 'face' ? { kind: 'face', body: g.ref.body, idx: g.ref.idx } : { kind: 'body', body: g.body })));
    }
    this.app.setHint(t('cam.op.pickhint.' + m));
  }
  async onPick(hit) {
    const d = this.draft; if (this.tab !== 'geom' || !hit || !(d.type === 'contour' || d.type === 'pocket')) return;
    d.geom = d.geom || [];
    if (hit.kind === 'region' && this.pickMode === 'sketch') {
      const sk = this.app.doc.features.find((f) => f.id === this.sketchId); if (!sk) return; const rg = findRegions(sk).regions;
      let g = d.geom.find((x) => x.kind === 'sketch' && x.sketch === this.sketchId);
      const cur = !g ? [] : g.profiles === 'all' ? rg.map((_, i) => i) : resolveProfiles(rg, g.profiles).idx.slice();
      const at = cur.indexOf(hit.idx); if (at >= 0) cur.splice(at, 1); else cur.push(hit.idx); cur.sort((a, b) => a - b);
      if (!cur.length) d.geom = d.geom.filter((x) => x !== g);
      else { if (!g) { g = { kind: 'sketch', sketch: this.sketchId, profiles: [] }; d.geom.push(g); } g.profiles = cur.length === rg.length ? 'all' : cur.map((i) => selectionFor(rg[i])); }
    } else if (hit.kind === 'face' && this.pickMode === 'face') {
      let r; try { r = await this.app.describe(hit, 'face'); } catch (e) { this.app.toastInfo(errText(e)); return; }
      const ref = { body: r.body, kind: 'face', name: r.name, hint: r.hint, idx: r.idx };
      const at = d.geom.findIndex((x) => x.kind === 'face' && x.ref.body === ref.body && x.ref.idx === ref.idx);
      if (at >= 0) d.geom.splice(at, 1); else d.geom.push({ kind: 'face', ref });
    } else if (hit.kind === 'body' && this.pickMode === 'silhouette') {
      const at = d.geom.findIndex((x) => x.kind === 'silhouette' && x.body === hit.body);
      if (at >= 0) d.geom.splice(at, 1); else d.geom.push({ kind: 'silhouette', body: hit.body });
    } else return;
    this.invalidate(); this.render(); this.showResult(); this.pickView();
  }
  // ---- yükseklikler
  tabHeights() {
    const d = this.draft, rows = [];
    rows.push(this.num(t('cam.op.clearance'), 'heights.clearance', { min: 0.001, f: 'clearance', hint: t('cam.op.clearance_hint') }),
      this.num(t('cam.op.retract'), 'heights.retract', { min: 0.001, f: 'retract', hint: t('cam.op.retract_hint'), warn: (v) => (v !== null && d.heights.clearance != null && v > d.heights.clearance ? t('cam.op.retract_over') : null) }));
    if (d.type === 'drill') {
      const dep = d.depth;
      rows.push(sec(t('cam.op.depth')), this.sel(t('cam.op.depth_from'), 'depth.from', [['hole', t('cam.op.df_hole')], ['abs', t('cam.op.df_abs')]], { f: 'depth-from', redraw: true, def: 'hole', set: (v) => { dep.from = v; if (v === 'abs') dep.z = dep.z ?? null; else delete dep.z; this.invalidate(); } }));
      if (dep.from === 'abs') rows.push(this.num(t('cam.op.depth_z'), 'depth.z', { f: 'depth-z', min: -1e6, hint: t('cam.op.depth_z_hint') }));
      else rows.push(checkField({ label: t('cam.op.tipcomp'), value: !!dep.tipComp, f: 'op-tipcomp', hint: t('cam.op.tipcomp_hint'), set: (v) => { dep.tipComp = v; this.invalidate(); } }), this.num(t('cam.op.breakthrough'), 'depth.breakThrough', { min: 0, nullable: true, f: 'breakthrough', hint: t('cam.op.breakthrough_hint') }));
      return rows;
    }
    for (const [which, from] of [['top', TOP_FROM], ['bottom', BOT_FROM]]) {
      const cur = d.heights[which] || (d.heights[which] = { from: from[0], off: 0 });
      rows.push(sec(t('cam.op.h.' + which)), this.sel(t('cam.op.h_from'), `heights.${which}.from`, from.map((x) => [x, t('cam.op.hf.' + x)]), { f: which + '-from', redraw: true, hint: t('cam.op.hfh.' + which) }),
        this.num(cur.from === 'abs' ? t('cam.op.h_abs') : t('cam.op.h_off'), `heights.${which}.off`, { min: -1e6, f: which + '-off', hint: cur.from === 'abs' ? t('cam.op.h_abs_hint') : t('cam.op.h_off_hint') }));
    }
    return rows;
  }
  // ---- pasolar
  tabPasses() {
    const d = this.draft, rows = [];
    const stepover = () => this.num(t('cam.op.stepover'), 'stepover', { min: 0.001, f: 'stepover', hint: t('cam.op.stepover_hint'), warn: (v) => (v !== null && this.tool && v >= this.tool.dia ? t('cam.op.stepover_big', { dia: fmtNum(this.tool.dia, 3) }) : null) });
    if (d.type === 'face') {
      rows.push(stepover(), this.num(t('cam.op.stepdown'), 'stepdown', { min: 0.001, nullable: true, f: 'stepdown', hint: t('cam.op.stepdown_face_hint') }), this.num(t('cam.op.sta_axial'), 'stockToLeave', { min: 0, nullable: true, f: 'stockToLeave' }));
    } else if (d.type === 'pocket') {
      const e = d.entry;
      rows.push(stepover(), this.num(t('cam.op.stepdown'), 'stepdown', { min: 0.001, f: 'stepdown' }), this.num(t('cam.op.finish_stepdown'), 'finishStepdown', { min: 0.001, nullable: true, f: 'finishStepdown' }),
        this.num(t('cam.op.sta_radial'), 'stockToLeave.radial', { min: 0, nullable: true, f: 'sta-radial' }), this.num(t('cam.op.sta_axial'), 'stockToLeave.axial', { min: 0, nullable: true, f: 'sta-axial' }),
        sec(t('cam.op.entry')), this.sel(t('cam.op.entry_kind'), 'entry.kind', [['helix', t('cam.op.en_helix')], ['ramp', t('cam.op.en_ramp')], ['plunge', t('cam.op.en_plunge')]], { f: 'entry-kind', def: 'ramp', redraw: true, set: (v) => { e.kind = v; if (v === 'plunge') delete e.angle; else e.angle = e.angle ?? null; if (v === 'helix') e.helixDia = e.helixDia ?? null; else delete e.helixDia; this.invalidate(); } }));
      if (e.kind !== 'plunge') rows.push(this.num(t('cam.op.entry_angle'), 'entry.angle', { unit: '°', min: 0.1, max: 45, f: 'entry-angle', hint: t('cam.op.entry_angle_hint') }));
      if (e.kind === 'helix') rows.push(this.num(t('cam.op.helix_dia'), 'entry.helixDia', { min: 0.001, f: 'helix-dia', hint: t('cam.op.helix_dia_hint') }));
      rows.push(sec(t('cam.op.finish')), checkField({ label: t('cam.op.finish_pass'), value: !!d.finishPass, f: 'op-finish', hint: t('cam.op.finish_hint'), set: (v) => { d.finishPass = v; if (v) d.finishStock = d.finishStock ?? null; else delete d.finishStock; this.invalidate(); this.render(); this.showResult(); } }));
      if (d.finishPass) rows.push(this.num(t('cam.op.finish_stock'), 'finishStock', { min: 0.001, f: 'finishStock', hint: t('cam.op.finish_stock_hint') }));
    } else if (d.type === 'contour') {
      const r = d.ramp, wear = d.comp === 'wear';
      rows.push(this.num(t('cam.op.stepdown'), 'stepdown', { min: 0.001, f: 'stepdown' }), this.num(t('cam.op.finish_stepdown'), 'finishStepdown', { min: 0.001, nullable: true, f: 'finishStepdown' }),
        this.num(t('cam.op.sta_radial'), 'stockToLeave.radial', { min: 0, nullable: true, f: 'sta-radial' }), this.num(t('cam.op.sta_axial'), 'stockToLeave.axial', { min: 0, nullable: true, f: 'sta-axial' }),
        sec(t('cam.op.rough')), checkField({ label: t('cam.op.rough_on'), value: !!(d.roughPasses && d.roughPasses.n > 0), f: 'op-rough', hint: wear ? t('cam.op.rough_wear') : t('cam.op.rough_hint'), set: (v) => { if (v) d.roughPasses = { n: 2, stepover: null }; else delete d.roughPasses; this.invalidate(); this.render(); this.showResult(); } }));
      if (d.roughPasses) rows.push(this.num(t('cam.op.rough_n'), 'roughPasses.n', { unit: '', int: true, min: 1, max: 100, f: 'rough-n' }), this.num(t('cam.op.stepover'), 'roughPasses.stepover', { min: 0.001, f: 'rough-stepover' }));
      rows.push(sec(t('cam.op.entry')), this.sel(t('cam.op.ramp_kind'), 'ramp.kind', [['plunge', t('cam.op.en_plunge')], ['ramp', t('cam.op.en_ramp')]], { f: 'ramp-kind', def: 'plunge', redraw: true, set: (v) => { d.ramp = v === 'ramp' ? { kind: v, angle: null } : { kind: v }; this.invalidate(); } }));
      if (r.kind === 'ramp') rows.push(this.num(t('cam.op.entry_angle'), 'ramp.angle', { unit: '°', min: 0.1, max: 45, f: 'ramp-angle', hint: t('cam.op.entry_angle_hint') }));
      for (const [key, nm] of [['leadIn', 'cam.op.lead_in'], ['leadOut', 'cam.op.lead_out']]) {
        const L = d[key] || (d[key] = { kind: 'none' });
        rows.push(this.sel(t(nm), key + '.kind', [['none', t('cam.op.l_none')], ['arc', t('cam.op.l_arc')], ['line', t('cam.op.l_line')]], { f: key, def: 'none', redraw: true, set: (v) => { d[key] = v === 'arc' ? { kind: v, r: null } : v === 'line' ? { kind: v, len: null } : { kind: v }; this.invalidate(); } }));
        if (L.kind === 'arc') rows.push(this.num(t('cam.op.l_radius'), key + '.r', { min: 0.001, f: key + '-r' }));
        if (L.kind === 'line') rows.push(this.num(t('cam.op.l_len'), key + '.len', { min: 0.001, f: key + '-len', hint: wear && this.tool ? t('cam.op.l_len_wear', { min: fmtNum(this.tool.dia / 2, 3) }) : null }));
      }
      rows.push(sec(t('cam.op.tabs_title')), checkField({ label: t('cam.op.tabs_on'), value: !!(d.tabs && d.tabs.n > 0), f: 'op-tabs', hint: t('cam.op.tabs_hint'), set: (v) => { if (v) d.tabs = { n: 2, width: null, height: null }; else delete d.tabs; this.invalidate(); this.render(); this.showResult(); } }));
      if (d.tabs) rows.push(this.num(t('cam.op.tabs_n'), 'tabs.n', { unit: '', int: true, min: 1, max: 100, f: 'tabs-n' }), this.num(t('cam.op.tabs_w'), 'tabs.width', { min: 0.001, f: 'tabs-width' }), this.num(t('cam.op.tabs_h'), 'tabs.height', { min: 0.001, f: 'tabs-height' }));
    } else if (d.type === 'drill') {
      if (d.cycle === 'peck' || d.cycle === 'chipbreak') rows.push(this.num(t('cam.op.peck'), 'peck', { min: 0.001, f: 'peck', hint: t('cam.op.peck_hint') }));
      rows.push(this.num(t('cam.op.dwell'), 'dwell', { unit: t('cam.u.s'), min: 0, nullable: true, f: 'dwell', hint: t('cam.op.dwell_hint') }),
        this.sel(t('cam.op.order'), 'order', [['asis', t('cam.op.or_asis')], ['shortest', t('cam.op.or_short')]], { f: 'order', def: 'asis' }));
    }
    return rows;
  }
}
