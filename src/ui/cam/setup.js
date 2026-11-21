// Setup paneli: çerçeve (Z/X yönü, orijin), iş sıfırı, stok, döner eksen (A açısı), güvenli yükseklik. Çözüm (resolveSetup) canlı denetlenir.
import { h } from '../dom.js';
import { t, errText, fmtNum } from '../../shared/i18n.js';
import { resolveSetup } from '../../cam/index.js';
import { axisPlane } from '../../cam/program.js';
import { clone, numField, textField, selField, checkField, sec, callout, fld, unitBox, panelShell, okCancel, panelKeys, parseNum } from './util.js';

const DIRS = ['+Z', '-Z', '+X', '-X', '+Y', '-Y'];
const VEC = { '+X': [1, 0, 0], '-X': [-1, 0, 0], '+Y': [0, 1, 0], '-Y': [0, -1, 0], '+Z': [0, 0, 1], '-Z': [0, 0, -1] };
const perp = (a, b) => VEC[a][0] * VEC[b][0] + VEC[a][1] * VEC[b][1] + VEC[a][2] * VEC[b][2] === 0;
export const WCS = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59', 'G54.1'];

export function defaultSetup(id, name, bodyIds, machine) {
  const prot = machine?.protected?.wcs || [];
  const wcs = WCS.slice(0, 6).find((w) => !prot.includes(w)) || 'G54';
  return { id, name, bodies: bodyIds, frame: { origin: { kind: 'stockCorner', corner: 'x-y-z+' }, zAxis: { kind: 'base', dir: '+Z' }, xAxis: { kind: 'base', dir: '+X' } },
    rotary: { enabled: false, aAngle: 0 }, workOffset: { kind: wcs }, stock: { kind: 'boxOffset', side: 2, top: 2, bottom: 0 }, clearanceZ: 10, ops: [] };
}

export class SetupPanel {
  constructor(cam, setupId, { isNew = false, focus = null } = {}) {
    this.cam = cam; this.app = cam.app; this.id = setupId; this.isNew = isNew; this.focus = focus;
    const cur = cam.data().setups.find((s) => s.id === setupId); this.draft = clone(cur); this.closed = false;
    const d = this.draft; d.frame = d.frame || {}; d.frame.origin = d.frame.origin || { kind: 'stockCorner', corner: 'x-y-z+' }; d.frame.zAxis = d.frame.zAxis || { kind: 'base', dir: '+Z' }; d.frame.xAxis = d.frame.xAxis || { kind: 'base', dir: '+X' };
    d.rotary = d.rotary || { enabled: false, aAngle: 0 }; d.workOffset = d.workOffset || { kind: 'G54' }; d.stock = d.stock || { kind: 'boxOffset', side: 2, top: 2, bottom: 0 };
  }
  open() { this.render(); this.unkeys = panelKeys(document.getElementById('panel'), () => this.ok(), () => this.cancel()); this.check(); }
  relang() { this.render(); this.check(); }
  close() { this.closed = true; this.unkeys?.(); this.cam.panelClosed(this); }
  cancel() { this.endPick(); this.close(); this.cam.view?.showSetup(null); }
  ok() {
    const bad = this.problems(); if (bad) { this.cam.app.toastInfo(bad); return; }
    const d = clone(this.draft); this.endPick(); this.close();
    this.cam.mut((c) => { const i = c.setups.findIndex((s) => s.id === d.id); if (i >= 0) { const nx = { ...c.setups[i], ...d, ops: c.setups[i].ops }; for (const k of ['stockFrom', 'freePieceBlock', 'fixtures']) if (!(k in d)) delete nx[k]; c.setups[i] = nx; } });
  }
  problems() {
    if (!this.draft.bodies.length) return t('cam.su.no_bodies');
    if (!String(this.draft.name || '').trim()) return t('cam.fld.required');
    if (this.numErr()) return t('cam.su.fix_fields');
    return null;
  }
  numErr() { return !!this.bodyEl?.closest('.panel')?.querySelector('.input.err'); }
  async resolve() {
    try {
      const planes = {}; for (const [k, f] of [['z', 'zAxis'], ['x', 'xAxis']]) { const ax = this.draft.frame?.[f]; if (ax?.kind === 'face' || ax?.kind === 'edge') planes[k] = await axisPlane((c, a) => this.app.query(c, a), ax); }
      return { S: resolveSetup(this.draft, this.app.result, this.cam.machine(), { planes }) };
    } catch (e) { return { err: e }; }
  }
  // WP-07: eksen secimi gorunumden (yuz ya da duz kenar)
  // WP-07: yuvarlak stok onerisi: secili govdelerin X eksenine gore yaricap (orijinden) ve X boyu + 2 mm pay (yalniz oneri; kullanici duzenler)
  cylGuess() {
    let R = 0, x0 = Infinity, x1 = -Infinity;
    for (const b of this.app.result?.bodies || []) { if (!this.draft.bodies.includes(b.id)) continue; const v = b.vertices || []; for (let i = 0; i < v.length; i += 3) { R = Math.max(R, Math.hypot(v[i + 1], v[i + 2])); x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); } }
    return R > 0 && x1 > x0 ? { dia: Math.ceil(2 * R + 2), len: Math.ceil(x1 - x0 + 2) } : { dia: 50, len: 100 };
  }
  startPick(which) { this.pickAxis = which; const vp = this.app.viewport; vp.setFilter({ face: true, edge: true }); vp.setSelection([]); this.app.setHint(t('cam.su.pick_axis_hint')); this.render(); this.check(); }
  endPick() { this.pickAxis = null; const vp = this.app.viewport; vp.setFilter({}); vp.setSelection([]); this.app.setHint(''); }
  async onPick(hit) {
    if (!this.pickAxis || !hit || (hit.kind !== 'face' && hit.kind !== 'edge')) return;
    const which = this.pickAxis; const key = which === 'z' ? 'zAxis' : 'xAxis'; const d = this.draft;
    try {
      const ref = await this.app.describe(hit, hit.kind); const spec = { kind: hit.kind, ref };
      const pl = await axisPlane((c, a) => this.app.query(c, a), spec); // yuz duz degilse / kenar dogru degilse hata
      d.frame[key] = spec;
      if (which === 'z') { // X ekseni dik degilse en az hizali taban eksenden "otomatik" (izdusum) sec
        const x = d.frame.xAxis; const dv = (dir) => { const v = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[dir[1]]; return v[0] * pl.n[0] + v[1] * pl.n[1] + v[2] * pl.n[2]; };
        if (x.kind === 'base' && Math.abs(dv(x.dir)) > 1e-9) { const best = ['+X', '+Y', '+Z'].sort((a, b) => Math.abs(dv(a)) - Math.abs(dv(b)))[0]; d.frame.xAxis = { kind: 'base', dir: best, auto: true }; }
      }
    } catch (e) { this.app.toastInfo(errText(e)); }
    this.endPick(); this.render(); this.check();
  }
  async check() {
    if (this.closed || !this.sumEl) return;
    const body = this.sumEl; body.replaceChildren();
    if (!this.app.result?.bodies?.length) { body.append(callout('warn', null, t('cam.su.need_model'))); return; }
    const { S, err } = await this.resolve();
    if (err) { body.append(callout('err', t('cam.su.unresolved'), errText(err))); this.cam.view?.showSetup(null); return; }
    const sz = S.stockBox.max.map((v, i) => v - S.stockBox.min[i]);
    body.append(callout('info', t('cam.su.resolved'), t('cam.su.summary', { stock: sz.map((v) => fmtNum(v, 3)).join(' × '), top: fmtNum(S.stockTop, 3) })));
    this.lastS = S; this.cam.view?.showSetup(S);
  }
  render() {
    const d = this.draft, cam = this.cam, app = this.app, m = cam.machine();
    const prot = m?.protected || {}; const upd = () => this.check();
    this.sumEl = h('div', { class: 'su-sum', 'data-testid': 'setup-summary' });
    const bodies = (app.result?.bodies || []).map((b) => { const c = h('input', { type: 'checkbox', 'data-f': 'su-body', 'data-body': b.id, checked: d.bodies.includes(b.id) }); c.addEventListener('change', () => { d.bodies = c.checked ? [...new Set([...d.bodies, b.id])] : d.bodies.filter((x) => x !== b.id); upd(); }); return h('label', { class: 'wcs-i' }, c, h('span', { text: app.bodyName(b.id) })); });
    this.bodyEl = h('div', { class: 'wcs-grid' }, bodies.length ? bodies : [h('span', { class: 'note', text: t('cam.su.need_model') })]);
    const dirOpts = (list) => list.map((x) => [x, t('cam.dir.' + x)]);
    const zKind = d.frame.zAxis.kind, xKind = d.frame.xAxis.kind;
    const zSel = selField({ label: t('cam.su.z_axis'), value: zKind === 'base' ? d.frame.zAxis.dir : zKind, f: 'su-z', hint: t('cam.su.z_hint'), opts: [...dirOpts(DIRS), ...(zKind !== 'base' ? [[zKind, t(zKind === 'edge' ? 'cam.su.from_edge' : 'cam.su.from_face')]] : [])], set: (v) => {
      if (v === 'face' || v === 'edge') return; d.frame.zAxis = { kind: 'base', dir: v };
      if (d.frame.xAxis.kind === 'base' && !perp(v, d.frame.xAxis.dir)) d.frame.xAxis = { kind: 'base', dir: DIRS.find((q) => perp(v, q) && q[1] === 'X') || DIRS.find((q) => perp(v, q)) };
      this.render(); upd(); } });
    const xList = DIRS.filter((q) => d.frame.zAxis.kind !== 'base' || perp(d.frame.zAxis.dir, q));
    const xSel = selField({ label: t('cam.su.x_axis'), value: xKind === 'base' ? d.frame.xAxis.dir : xKind, f: 'su-x', opts: [...dirOpts(xList), ...(xKind !== 'base' ? [[xKind, t(xKind === 'edge' ? 'cam.su.from_edge' : 'cam.su.from_face')]] : [])], set: (v) => { if (v === 'face' || v === 'edge') return; d.frame.xAxis = { kind: 'base', dir: v }; upd(); } });
    const axisBtns = (w) => {
      const key = w === 'z' ? 'zAxis' : 'xAxis'; const ax = d.frame[key]; const items = [h('button', { class: 'btn ghost sm', type: 'button', 'data-testid': 'su-' + w + '-pick', 'aria-pressed': String(this.pickAxis === w), onclick: () => (this.pickAxis === w ? (this.endPick(), this.render()) : this.startPick(w)) }, t(this.pickAxis === w ? 'cam.su.pick_axis_cancel' : 'cam.su.pick_axis'))];
      if (ax.kind !== 'base') { const c = h('input', { type: 'checkbox', 'data-f': 'su-' + w + '-flip', checked: !!ax.flip }); c.addEventListener('change', () => { ax.flip = c.checked; upd(); }); items.push(h('label', { class: 'chk' }, c, h('span', { class: 'nm', text: t('cam.su.axis_flip') }))); }
      if (w === 'x' && ax.auto) items.push(h('span', { class: 'note', text: t('cam.su.x_auto') }));
      return h('div', { class: 'op-grow', 'data-testid': 'su-' + w + '-axis-row' }, ...items);
    };
    const org = d.frame.origin;
    const oSel = selField({ label: t('cam.su.origin'), value: org.kind, f: 'su-origin', opts: [['stockCorner', t('cam.su.o_corner')], ['stockTopCenter', t('cam.su.o_topcenter')], ['model', t('cam.su.o_model')], ['point', t('cam.su.o_point')]], set: (v) => {
      d.frame.origin = v === 'stockCorner' ? { kind: v, corner: 'x-y-z+' } : v === 'point' ? { kind: v, p: [0, 0, 0] } : { kind: v }; this.render(); upd(); } });
    const rows = [fld(t('cam.su.name'), unitBox(h('input', { type: 'text', 'data-f': 'su-name', value: d.name || '', maxlength: 120, oninput: (e) => { d.name = e.target.value; } }))),
      sec(t('cam.su.bodies')), fld(t('cam.su.bodies_l'), this.bodyEl),
      sec(t('cam.su.frame')), zSel, axisBtns('z'), xSel, axisBtns('x'), oSel];
    if (org.kind === 'stockCorner') {
      const cm = /^x([+-])y([+-])z([+-])$/.exec(org.corner || 'x-y-z+') || ['', '-', '-', '+']; const cur = [cm[1], cm[2], cm[3]];
      for (const [i, ax, neg, pos] of [[0, 'X', 'cam.su.c_left', 'cam.su.c_right'], [1, 'Y', 'cam.su.c_front', 'cam.su.c_back'], [2, 'Z', 'cam.su.c_bottom', 'cam.su.c_top']]) {
        rows.push(selField({ label: t('cam.su.corner_axis', { axis: ax }), value: cur[i], f: 'su-corner-' + ax, opts: [['-', t(neg)], ['+', t(pos)]], set: (v) => { cur[i] = v; org.corner = `x${cur[0]}y${cur[1]}z${cur[2]}`; upd(); } }));
      }
    }
    if (org.kind === 'point') ['X', 'Y', 'Z'].forEach((ax, i) => rows.push(numField({ label: t('cam.su.point_axis', { axis: ax }), value: org.p[i], unit: 'mm', nullable: false, f: 'su-p' + ax, min: -1e6, set: (v) => { org.p[i] = v; upd(); } })));
    // iş sıfırı
    const wk = d.workOffset;
    const wsel = selField({ label: t('cam.su.wcs'), value: wk.kind, f: 'su-wcs', opts: WCS.map((w) => [w, w]), set: (v) => { d.workOffset = v === 'G54.1' ? { kind: v, p: 1 } : { kind: v }; this.render(); upd(); } });
    const wmsg = h('div', { class: 'fieldmsg warn', role: 'alert', hidden: true, 'data-testid': 'wcs-warn' });
    const wcsWarn = () => { const hit = (prot.wcs || []).includes(wk.kind === 'G54.1' ? `G54.1 P${wk.p}` : wk.kind); wmsg.hidden = !hit; wmsg.textContent = hit ? t('cam.su.wcs_protected', { wcs: wk.kind === 'G54.1' ? `G54.1 P${wk.p}` : wk.kind }) : ''; };
    wsel.querySelector('.ctl').append(wmsg); wsel.input.addEventListener('change', wcsWarn);
    rows.push(sec(t('cam.su.workoffset')), wsel);
    if (wk.kind === 'G54.1') rows.push(numField({ label: t('cam.su.wcs_p'), value: wk.p, unit: 'P', int: true, min: 1, nullable: false, f: 'su-wcs-p', set: (v) => { wk.p = v; wcsWarn(); upd(); } }));
    wcsWarn();
    // stok
    const st = d.stock;
    rows.push(sec(t('cam.su.stock')), selField({ label: t('cam.su.stock_kind'), value: st.kind, f: 'su-stock-kind', opts: [['boxOffset', t('cam.su.s_offset')], ['box', t('cam.su.s_box')], ['cyl', t('cam.su.s_cyl')]], set: (v) => {
      d.stock = v === 'boxOffset' ? { kind: v, side: 2, top: 2, bottom: 0 } : v === 'box' ? { kind: v, min: [0, 0, 0], max: [100, 100, 20] } : { kind: v, ...this.cylGuess(), axis: 'X' };
      if (v === 'cyl' && !['point', 'model'].includes(d.frame.origin.kind)) d.frame.origin = { kind: 'model' };
      this.render(); upd(); } }));
    const sn = (label, key, o = {}) => numField({ label, value: st[key], unit: 'mm', nullable: false, min: o.min ?? 0, f: 'su-st-' + key, set: (v) => { st[key] = v; upd(); } });
    if (st.kind === 'boxOffset') rows.push(sn(t('cam.su.s_side'), 'side'), sn(t('cam.su.s_top'), 'top'), sn(t('cam.su.s_bottom'), 'bottom'));
    else if (st.kind === 'box') for (const [k, nm] of [['min', 'cam.su.s_min'], ['max', 'cam.su.s_max']]) ['X', 'Y', 'Z'].forEach((ax, i) => rows.push(numField({ label: t(nm, { axis: ax }), value: st[k][i], unit: 'mm', nullable: false, min: -1e6, f: `su-st-${k}${ax}`, set: (v) => { st[k][i] = v; upd(); } })));
    else rows.push(sn(t('cam.su.s_dia'), 'dia', { min: 0.001 }), sn(t('cam.su.s_len'), 'len', { min: 0.001 }), h('div', { class: 'help', text: t('cam.su.s_cyl_hint') }));
    // döner eksen
    // WP-06 (WP-05 devri): stok kaynağı ve serbest parça ayarı
    rows.push(sec(t('cam.su.chain')),
      selField({ label: t('cam.su.stock_from'), value: d.stockFrom === 'blank' ? 'blank' : 'previous', f: 'su-stock-from', hint: t('cam.su.stock_from_hint'), opts: [['previous', t('cam.su.sf_previous')], ['blank', t('cam.su.sf_blank')]], set: (v) => { if (v === 'blank') d.stockFrom = 'blank'; else delete d.stockFrom; upd(); } }),
      checkField({ label: t('cam.su.free_block'), value: d.freePieceBlock === true, f: 'su-free-block', hint: t('cam.su.free_block_hint'), set: (v) => { if (v) d.freePieceBlock = true; else delete d.freePieceBlock; upd(); } }));
    const A = m?.axes?.A;
    rows.push(sec(t('cam.su.rotary')));
    if (!A) rows.push(h('div', { class: 'note', text: t('cam.su.no_a_axis') }));
    else {
      rows.push(checkField({ label: t('cam.su.a_on'), value: !!d.rotary.enabled, f: 'su-a-on', hint: t('cam.su.a_hint'), set: (v) => { d.rotary.enabled = v; this.render(); upd(); } }));
      // M-02: 3+1'de orijin A=0 çerçevesinde tanımlıdır; döndürülen stok üstü Z=0 olmaz, Mutlak Z buna göre girilir
      if (d.rotary.enabled) rows.push(h('div', { class: 'help', 'data-testid': 'su-a-origin-note', text: t('cam.su.a_origin_note') }));
      if (d.rotary.enabled) rows.push(numField({ label: t('cam.su.a_angle'), value: d.rotary.aAngle, unit: '°', nullable: false, min: -1e5, f: 'su-a-angle', warn: (v) => (v !== null && A.limits && (v < A.limits[0] || v > A.limits[1]) ? t('cam.su.a_limits', { min: A.limits[0], max: A.limits[1] }) : null), set: (v) => { d.rotary.aAngle = v; upd(); } }));
    }
    // WP-13: bağlama gövdeleri (mengene, fikstür, divizör aynası): taban setup çerçevesinde kutu/silindir ya da işlenmeyen belge gövdesi
    rows.push(sec(t('cam.su.fixtures')), h('div', { class: 'help', text: t('cam.su.fx_hint') }));
    const fxs = d.fixtures || [];
    const others = (this.app.result?.bodies || []).filter((b) => !d.bodies.includes(b.id));
    fxs.forEach((f, n) => {
      const F = `su-fx${n}-`; const re = () => { this.render(); upd(); };
      rows.push(h('div', { class: 'op-grow', 'data-testid': F + 'row' },
        h('strong', { text: t('cam.su.fx_n', { n: n + 1, kind: t({ box: 'cam.su.fx_k_box', cyl: 'cam.su.fx_k_cyl', body: 'cam.su.fx_k_body' }[f.kind]) }) }),
        h('button', { class: 'btn sm', type: 'button', 'data-testid': F + 'del', onclick: () => { fxs.splice(n, 1); if (!fxs.length) delete d.fixtures; re(); } }, t('cam.su.fx_del'))));
      rows.push(textField({ label: t('cam.su.fx_name'), value: f.name || '', f: F + 'name', max: 120, set: (v) => { if (v.trim()) f.name = v; else delete f.name; } }));
      const v3 = (k, nm) => ['X', 'Y', 'Z'].forEach((ax, i) => rows.push(numField({ label: t(nm, { axis: ax }), value: f[k][i], unit: 'mm', nullable: false, min: -1e6, f: F + k + ax, set: (v) => { f[k][i] = v; upd(); } })));
      if (f.kind === 'box') { v3('min', 'cam.su.s_min'); v3('max', 'cam.su.s_max'); }
      else if (f.kind === 'cyl') {
        rows.push(selField({ label: t('cam.su.fx_axis'), value: f.axis || 'Z', f: F + 'axis', opts: [['X', 'X'], ['Y', 'Y'], ['Z', 'Z']], set: (v) => { f.axis = v; upd(); } }));
        v3('center', 'cam.su.fx_center');
        for (const [k, lk] of [['dia', 'cam.su.s_dia'], ['len', 'cam.su.s_len']]) rows.push(numField({ label: t(lk), value: f[k], unit: 'mm', nullable: false, min: 0.001, f: F + k, set: (v) => { f[k] = v; upd(); } }));
      } else rows.push(selField({ label: t('cam.su.fx_body'), value: f.body || '', f: F + 'body', opts: [['', t('cam.su.fx_body_none')], ...others.map((b) => [b.id, b.name || b.id])], set: (v) => { f.body = v; upd(); } }));
    });
    const addFx = (kind) => { const sb = this.lastS?.stockBox; const z0 = sb ? sb.min[2] : -20;
      const f = kind === 'box' ? { kind, min: [sb ? sb.min[0] : 0, sb ? sb.min[1] - 20 : -20, z0 - 30], max: [sb ? sb.max[0] : 100, sb ? sb.min[1] : 0, z0 + 10] } : kind === 'cyl' ? { kind, axis: 'X', center: [sb ? sb.min[0] - 30 : -30, sb ? (sb.min[1] + sb.max[1]) / 2 : 0, sb ? (sb.min[2] + sb.max[2]) / 2 : 0], dia: 100, len: 30 } : { kind, body: others[0]?.id || '' };
      (d.fixtures = d.fixtures || []).push(f); this.render(); upd(); };
    rows.push(h('div', { class: 'op-grow' }, ...['box', 'cyl', 'body'].map((k) => h('button', { class: 'btn sm', type: 'button', 'data-testid': 'su-fx-add-' + k, disabled: k === 'body' && !others.length, onclick: () => addFx(k) }, t({ box: 'cam.su.fx_add_box', cyl: 'cam.su.fx_add_cyl', body: 'cam.su.fx_add_body' }[k])))));
    rows.push(sec(t('cam.su.heights')), numField({ label: t('cam.su.clearance'), value: d.clearanceZ ?? 10, unit: 'mm', nullable: false, min: 0, f: 'su-clearance', hint: t('cam.su.clearance_hint'), set: (v) => { d.clearanceZ = v; upd(); } }));
    panelShell(this.isNew ? t('cam.su.title_new') : t('cam.su.title', { name: d.name }), [...rows, this.sumEl], okCancel(() => this.ok(), () => this.cancel()), () => this.cancel(), 'cam-setup');
    if (this.focus) { const el = document.querySelector(`#panel [data-f="${this.focus}"]`); el?.scrollIntoView?.({ block: 'center' }); el?.focus?.(); this.focus = null; }
  }
}
void textField; void parseNum;
