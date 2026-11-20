// İmalat (CAM) çalışma alanı denetleyicisi: sekme kipi, şerit, tarayıcı ağacı, alt çubuk, durum çubuğu, doc.cam işlemleri.
// Belge verisi doc.cam altındadır (geri al/yinele ve kayıtla birlikte gider); hesap sonuçları (takım yolu, NC) belgeye yazılmaz, çalışma belleğinde tutulur.
import './cam.css';
import { h, $, toast, promptText, confirmBox, ctxMenu } from '../dom.js';
import { icon } from '../icons.js';
import { t, errText, fmtNum } from '../../shared/i18n.js';
import { allMachines, machineName } from './store.js';
import { checkMachine, GENERIC_3AXIS_ID } from '../../cam/machines/builtin.js';

// Eski belgeler (K-026): kaldirilan yerlesik profilin kimligi ('builtin-<ad>') ayni adli kullanici profiline ('user-<ad>') eslenir;
// o da yoksa 'tezgah bulunamadi' yolu calisir.
const legacyUserId = (id) => (typeof id === 'string' && id.startsWith('builtin-') ? 'user-' + id.slice(8) : null);
import { resolveSetup } from '../../cam/index.js';
import { clone, uid, hidePanel } from './util.js';
import { SetupPanel, defaultSetup } from './setup.js';
import { openMachineManager } from './machines.js';
import { openToolManager, protectedHits, toolLabel } from './toolui.js';
import { openCutData } from './cutdata.js';
import { openTemplates, openHoleSequence, openParts } from './templatesui.js';
import { openQuote } from './quoteui.js';
import { setUnits, getUnits } from '../../shared/units.js';
import { CamView } from './view.js';
import { CamOps } from './ops.js';

const OP_ICON = { face: 'op-face', contour: 'op-contour', pocket: 'op-pocket', drill: 'op-drill', chamfer: 'chamfer', circular: 'op-drill', threadmill: 'op-thread', slot: 'op-contour', trace: 'op-contour' };

export function hashStr(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return (x >>> 0).toString(36); }
function hashArr(a, seed = 2166136261) { let x = seed; for (let i = 0; i < a.length; i++) x = Math.imul(x ^ ((a[i] * 1000) | 0), 16777619); return x >>> 0; }

export class CamCtl {
  constructor(app) {
    this.app = app; this.sel = null; this.panel = null; this.collapsed = new Set(); this._res = new Map(); this._sig = null; this._sigFor = null;
    this.ops = new CamOps(this);
  }
  get view() { if (!this._view && this.app.viewport) this._view = new CamView(this.app); return this._view; }
  // ---------------------------------------------------------------- veri
  machineLabel(m) { return machineName(m).split(' · ')[0]; }
  selLabel() { const s = this.sel; if (!s) return '—'; if (s.kind === 'setup') return this.setup(s.id)?.name || '—'; const l = this.opLoc(s.id); return l ? l.op.name : '—'; }
  defaultMachineId() { const l = allMachines(); return (l.find((m) => m.id === GENERIC_3AXIS_ID) || l[0])?.id || null; }
  data() { setUnits(this.app.doc.cam?.units); return this.app.doc.cam || { machineId: this.defaultMachineId(), tools: [], setups: [], verified: null }; }
  get machineId() { return this.data().machineId ?? this.defaultMachineId(); }
  machine() {
    const l = allMachines(); const id = this.machineId;
    const lu = legacyUserId(id);
    return l.find((m) => m.id === id) || (lu ? l.find((m) => m.id === lu) : null) || null;
  }
  // belgedeki kimlik eski bir kimlikse eslenen profilin gercek kimligi
  get effectiveMachineId() { return this.machine()?.id ?? this.machineId; }
  protectedLists() { return this.machine()?.protected || null; }
  tools() { return this.data().tools; }
  setups() { return this.data().setups; }
  setup(id) { return this.setups().find((s) => s.id === id) || null; }
  opLoc(opId) { for (const s of this.setups()) { const o = (s.ops || []).find((x) => x.id === opId); if (o) return { setup: s, op: o }; } return null; }
  opsUsingTool(id) { let n = 0; for (const s of this.setups()) for (const o of s.ops || []) if (o.toolId === id) n++; return n; }
  // doc.cam üzerinde geri alınabilir değişiklik (model yeniden hesaplanmaz)
  mut(fn) {
    this.app.commitMeta((doc) => { if (!doc.cam) doc.cam = { machineId: this.defaultMachineId(), tools: [], setups: [], verified: null }; if (!doc.cam.machineId) doc.cam.machineId = this.defaultMachineId(); fn(doc.cam); });
  }
  // WP-14: belge birimi (doc.cam.units). Cekirdek mm kalir; gorunum, giris ve post (G20/G21) birimi izler.
  toggleUnits() { const next = getUnits() === 'inch' ? 'mm' : 'inch'; this.mut((c) => { c.units = next; }); setUnits(next); this.closePanel?.(); this.app.C.renderAll(); toast(t(next === 'inch' ? 'cam.units.set_inch' : 'cam.units.set_mm')); }
  setMachine(id) { if (id === this.machineId && this.app.doc.cam) return; this.mut((c) => { c.machineId = id; }); }
  refreshMachines() { this._res.clear(); this.app.C.renderAll(); }
  touchMachine(id) { if (id === this.machineId) { this._res.clear(); this.app.C.renderAll(); } }
  setTools(list) { this.mut((c) => { c.tools = list; }); }
  nextSetupName() { const n = new Set(this.setups().map((s) => s.name)); let i = this.setups().length + 1; while (n.has(t('cam.su.default_name', { n: i }))) i++; return t('cam.su.default_name', { n: i }); }

  // ---------------------------------------------------------------- hesap durumu
  resultSeq() { return this.app.result; }
  modelSig() {
    const r = this.app.result; if (!r) return 'none'; if (this._sigFor === r) return this._sig;
    let x = 2166136261; for (const b of r.bodies || []) { x = hashArr(b.vertices || [], x); x = Math.imul(x ^ hashStr(String(b.id)).length, 16777619); }
    this._sigFor = r; this._sig = (x >>> 0).toString(36) + ':' + (r.bodies || []).length; return this._sig;
  }
  resolved(setup) {
    const m = this.machine(); const key = hashStr(JSON.stringify({ ...setup, ops: 0 })) + this.modelSig() + (m ? m.id + m.rev : '');
    const c = this._res.get(setup.id); if (c && c.key === key) return c;
    let S = null, err = null; try { S = resolveSetup(setup, this.app.result, m); } catch (e) { err = e; }
    const n = { key, S, err }; this._res.set(setup.id, n); return n;
  }

  // ---------------------------------------------------------------- kip
  enter() {
    this.view?.show(true); this.app.refreshSketches(); this.app.viewport.setFilter({}); this.app.viewport.setSelection([]);
    this.sync(); this.ops.enter();
  }
  leave() { this.ops.leave(); this.closePanel(); this.view?.show(false); }
  onDocLoaded() { this.sel = null; this.closePanel(); this._res.clear(); this.ops.reset(); this.view?.showSetup(null); }
  onResult() { if (this.app.mode !== 'cam') return; this._res.clear(); this.ops.onResult(); if (this.panel?.check) this.panel.check(); }
  // Geri al/yinele ya da yükleme sonrası seçim ve panel geçerliliği
  sync() {
    if (this.sel) { const ok = this.sel.kind === 'setup' ? this.setup(this.sel.id) : this.sel.kind === 'op' ? this.opLoc(this.sel.id) : true; if (!ok) { this.sel = null; this.closePanel(); } }
    if (this.panel && this.panel.id && !(this.setup(this.panel.id) || this.opLoc(this.panel.id))) this.closePanel();
  }
  closePanel() { if (this.panel) { const p = this.panel; this.panel = null; try { p.closed = true; p.unkeys?.(); p.dispose?.(); } catch (e) { console.error(e); } } hidePanel(); this.view?.showSetup(null); }
  panelClosed(p) { if (this.panel === p) { this.panel = null; hidePanel(); } this.app.C.renderBrowser(); }
  openPanel(p) { this.closePanel(); this.panel = p; p.open(); this.app.C.renderBrowser(); }
  relang() { this.panel?.relang?.(); this.ops.relang?.(); }

  // ---------------------------------------------------------------- setup / işlem eylemleri
  hasModel() { return !!this.app.result?.bodies?.length; }
  addSetup() {
    if (!this.hasModel()) { toast(t('cam.su.need_model'), { kind: 'warn' }); return; }
    const id = uid('su'); const ids = this.app.result.bodies.map((b) => b.id).filter((b) => !this.app.hiddenBodies.has(b));
    const s = defaultSetup(id, this.nextSetupName(), ids.length ? ids : this.app.result.bodies.map((b) => b.id), this.machine());
    this.mut((c) => { c.setups.push(s); });
    this.sel = { kind: 'setup', id }; this.editSetup(id, { isNew: true });
  }
  editSetup(id, o = {}) { if (!this.setup(id)) return; this.sel = { kind: 'setup', id }; this.openPanel(new SetupPanel(this, id, o)); }
  editStock() { const s = this.setups()[0]; if (!s) { this.addSetup(); return; } const sel = this.sel?.kind === 'setup' ? this.sel.id : s.id; this.editSetup(sel, { focus: 'su-stock-kind' }); }
  async renameSetup(id) { const s = this.setup(id); const nm = await promptText(t('cam.su.rename'), s.name); if (!nm) return; this.mut((c) => { c.setups.find((x) => x.id === id).name = nm; }); }
  async deleteSetup(id) {
    const s = this.setup(id); if (!s) return;
    if (!(await confirmBox(t('cam.su.del_title'), t('cam.su.del_body', { name: s.name, n: (s.ops || []).length }), t('cam.su.delete'), t('common.giveup'), { danger: true }))) return;
    if (this.sel?.id === id) { this.sel = null; this.closePanel(); } this.mut((c) => { c.setups = c.setups.filter((x) => x.id !== id); });
  }
  async renameOp(id) { const l = this.opLoc(id); if (!l) return; const nm = await promptText(t('cam.op.rename'), l.op.name); if (!nm) return; this.mut((c) => { for (const s of c.setups) { const o = s.ops.find((x) => x.id === id); if (o) o.name = nm; } }); }
  toggleSuppress(id) { this.mut((c) => { for (const s of c.setups) { const o = s.ops.find((x) => x.id === id); if (o) { if (o.suppressed) delete o.suppressed; else o.suppressed = true; } } }); }
  moveOp(id, dir) { this.mut((c) => { for (const s of c.setups) { const i = s.ops.findIndex((x) => x.id === id); if (i < 0) continue; const j = i + dir; if (j < 0 || j >= s.ops.length) return; [s.ops[i], s.ops[j]] = [s.ops[j], s.ops[i]]; return; } }); }
  copyOp(id) { const l = this.opLoc(id); if (!l) return; const c = clone(l.op); c.id = uid('op'); c.name = t('cam.op.copy_name', { name: l.op.name }); this.mut((d) => { const s = d.setups.find((x) => x.id === l.setup.id); const i = s.ops.findIndex((x) => x.id === id); s.ops.splice(i + 1, 0, c); }); }
  async deleteOp(id) {
    const l = this.opLoc(id); if (!l) return;
    if (!(await confirmBox(t('cam.op.del_title'), t('cam.op.del_body', { name: l.op.name }), t('cam.op.delete'), t('common.giveup'), { danger: true }))) return;
    if (this.sel?.id === id) { this.sel = null; this.closePanel(); }
    this.mut((c) => { for (const s of c.setups) s.ops = s.ops.filter((x) => x.id !== id); });
  }
  select(kind, id) {
    this.sel = { kind, id };
    if (kind === 'setup') this.editSetup(id); else if (kind === 'op') this.ops.edit(id);
    this.app.C.renderBrowser();
  }

  // ---------------------------------------------------------------- komutlar (şerit, palet)
  registerCommands(C) {
    const reg = (id, name, ic, run, o = {}) => C.reg(id, name, ic, run, { cam: true, tip: o.tip === undefined ? 'cam.tip.' + id.replace('cam-', '') : o.tip, ...o });
    const needModel = () => (this.hasModel() ? null : t('cam.su.need_model'));
    const needSetup = () => (this.setups().length ? null : t('cam.need_setup'));
    const needOps = () => needSetup() || (this.setups().some((s) => (s.ops || []).length) ? null : t('cam.need_ops'));
    reg('cam-setup', 'cam.cmd.setup', 'cam-setup', () => this.addSetup(), { off: needModel });
    reg('cam-stock', 'cam.cmd.stock', 'cam-stock', () => this.editStock(), { off: needModel });
    reg('cam-machine', 'cam.cmd.machine', 'cam-machine', () => openMachineManager(this));
    reg('cam-tools', 'cam.cmd.tools', 'cam-tool-library', () => openToolManager(this, 'doc'));
    reg('cam-sheet', 'cam.cmd.sheet', 'nc-code', () => { this.ops.sheet(); }, { off: needOps, tip: null });
    reg('cam-cutdata', 'cam.cmd.cutdata', 'cam-tool-library', () => openCutData(this));
    reg('cam-units', 'cam.cmd.units', 'cam-stock', () => this.toggleUnits(), { tip: null }); // WP-14: belge birimi mm <-> inc
    reg('cam-parts', 'cam.cmd.parts', 'cam-stock', () => openParts(this), { off: needSetup, tip: null });
    reg('cam-quote', 'cam.cmd.quote', 'nc-code', () => openQuote(this), { off: needOps, tip: null });
    reg('cam-tpl', 'cam.cmd.tpl', 'cam-tool-library', () => openTemplates(this), { off: needSetup, tip: null }); // WP-14
    reg('cam-holeseq', 'cam.cmd.holeseq', 'op-drill', () => openHoleSequence(this), { off: needSetup, tip: null });
    const opcmd = (id, nm, ic, type, cycle) => reg(id, nm, ic, () => this.ops.create(type, cycle), { off: needSetup });
    opcmd('cam-op-face', 'cam.cmd.face', 'op-face', 'face'); opcmd('cam-op-contour', 'cam.cmd.contour', 'op-contour', 'contour'); opcmd('cam-op-pocket', 'cam.cmd.pocket', 'op-pocket', 'pocket'); opcmd('cam-op-chamfer', 'cam.cmd.chamfer', 'chamfer', 'chamfer');
    reg('cam-op-adaptive', 'cam.cmd.adaptive', 'op-adaptive', () => {}, { off: () => t('cam.soon_op') });
    opcmd('cam-op-drill', 'cam.cmd.drill', 'op-drill', 'drill', 'drill'); opcmd('cam-op-thread', 'cam.cmd.thread', 'op-thread', 'drill', 'tap'); opcmd('cam-op-circular', 'cam.cmd.circular', 'op-pocket', 'circular'); opcmd('cam-op-threadmill', 'cam.cmd.threadmill', 'op-thread', 'threadmill');
    opcmd('cam-op-slot', 'cam.cmd.slot', 'op-contour', 'slot'); opcmd('cam-op-trace', 'cam.cmd.trace', 'op-contour', 'trace');
    reg('cam-op-surface', 'cam.cmd.surface', 'op-surface', () => {}, { off: () => t('cam.soon_op') });
    reg('cam-compute', 'cam.cmd.compute', 'cam-compute', () => this.ops.computeAll(), { off: needOps });
    reg('cam-sim', 'cam.cmd.sim', 'simulate', () => this.ops.simulate(), { off: needOps });
    reg('cam-post', 'cam.cmd.post', 'post', () => this.ops.post(), { off: needOps });
    reg('cam-nc', 'cam.cmd.nc', 'nc-code', () => this.ops.showNc(), { off: () => this.ops.nc ? null : t('cam.need_post') });
  }
  ribbon(R) {
    const { group, toolBtn } = R; const b = (id) => toolBtn(id);
    return [
      group('cam-setup', 'cam.grp.setup', ['cam-setup', 'cam-stock', 'cam-machine', 'cam-tools', 'cam-units', 'cam-parts'].map(b), { items: ['cam-setup', 'cam-stock', 'cam-machine', 'cam-tools', 'cam-units', 'cam-parts'] }),
      group('cam-2d', 'cam.grp.2d', ['cam-op-face', 'cam-op-contour', 'cam-op-pocket', 'cam-op-chamfer', 'cam-op-slot', 'cam-op-trace', 'cam-op-adaptive'].map(b), { items: ['cam-op-face', 'cam-op-contour', 'cam-op-pocket', 'cam-op-chamfer', 'cam-op-slot', 'cam-op-trace', 'cam-op-adaptive'] }),
      group('cam-drill', 'cam.grp.drill', ['cam-op-drill', 'cam-op-thread', 'cam-op-circular', 'cam-op-threadmill', 'cam-holeseq', 'cam-tpl'].map(b), { items: ['cam-op-drill', 'cam-op-thread', 'cam-op-circular', 'cam-op-threadmill', 'cam-holeseq', 'cam-tpl'] }),
      group('cam-3d', 'cam.grp.3d', [b('cam-op-surface')], { items: ['cam-op-surface'] }),
      group('cam-act', 'cam.grp.actions', ['cam-compute', 'cam-sim', 'cam-post', 'cam-nc', 'cam-quote'].map(b), { cls: 'end', items: ['cam-compute', 'cam-sim', 'cam-post', 'cam-nc', 'cam-quote'] }),
    ];
  }

  // ---------------------------------------------------------------- tarayıcı
  renderBrowser(br) {
    this.sync();
    const app = this.app; const data = this.data(); const mach = this.machine();
    const sec = (title, action) => h('div', { class: 'bsec' }, h('span', { text: title }), action || null);
    const row = (o) => {
      const r = h('div', { class: 'trow' + (o.two ? ' two' : '') + (o.sel ? ' sel' : '') + (o.err ? ' err' : '') + (o.dim ? ' hidden-item' : ''), style: { '--depth': o.depth || 0 }, 'data-testid': o.testid || null, 'data-id': o.id || null, tabindex: o.click ? 0 : null, role: o.click ? 'button' : null, 'aria-selected': o.click ? String(!!o.sel) : null,
        onclick: o.click || null, ondblclick: o.dbl || null, oncontextmenu: o.ctx || null }, ...o.kids);
      if (o.click) r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.click(e); } else if (o.key) o.key(e); });
      return r;
    };
    const twist = (open, fn) => h('button', { class: 'tw', type: 'button', 'aria-expanded': String(open), 'aria-label': t(open ? 'cam.br.collapse' : 'cam.br.expand'), onclick: (e) => { e.stopPropagation(); fn(); }, html: icon(open ? 'chevron-down' : 'chevron-right', 'sm') });
    const nm = (title, sub) => h('span', { class: 'nm', title: sub ? title + ' · ' + sub : title }, h('span', { text: title }), sub ? h('span', { class: 'subtle', text: sub }) : null);
    const kids = [];
    // tezgâhlar
    kids.push(sec(t('cam.br.machines'), h('button', { class: 'btn sm', type: 'button', 'data-testid': 'cam-machines-manage', onclick: () => openMachineManager(this) }, t('cam.br.manage'))));
    if (!mach) kids.push(row({ err: true, kids: [h('span', { class: 'tw', html: icon('error', 'sm') }), nm(t('cam.br.machine_missing'))], testid: 'cam-machine-missing' }));
    for (const m of allMachines()) {
      const on = m.id === this.effectiveMachineId; const miss = checkMachine(m).missing.length;
      kids.push(row({ id: m.id, testid: 'cam-machine-row', sel: on, click: () => this.setMachine(m.id), kids: [h('span', { class: 'radio' + (on ? ' on' : ''), style: { minHeight: 0 } }, h('span', { class: 'dot' })), h('span', { html: icon(m.axes?.A ? 'axes-4' : 'axes-3', 'sm') }), nm(machineName(m)), miss ? h('span', { class: 'badge warn', title: t('cam.mc.n_missing', { n: miss }), html: icon('warning', 'sm') }) : h('span', { class: 'val', text: m.control === 'mitsubishi-m80v' ? 'M80V' : '' })] }));
    }
    for (const k of ['4', '5']) kids.push(row({ dim: true, kids: [h('span', { class: 'radio', style: { minHeight: 0 } }, h('span', { class: 'dot' })), h('span', { html: icon('axes-' + k, 'sm') }), nm(t('cam.br.axes_n', { n: k })), h('span', { class: 'val', text: t('ui.soon') })] }));
    // setup ve işlemler
    kids.push(sec(t('cam.br.setups'), h('button', { class: 'btn sm', type: 'button', 'data-testid': 'cam-add-setup', onclick: () => this.addSetup() }, h('span', { html: icon('plus', 'sm') }), t('cam.br.setup'))));
    if (!data.setups.length) kids.push(h('div', { class: 'trow empty', text: this.hasModel() ? t('cam.br.no_setups') : t('cam.su.need_model') }));
    for (const s of data.setups) {
      const open = !this.collapsed.has(s.id); const on = this.sel?.kind === 'setup' && this.sel.id === s.id; const rs = this.resolved(s);
      const z = s.frame?.zAxis; const sub = [s.workOffset?.kind === 'G54.1' ? `G54.1 P${s.workOffset.p}` : s.workOffset?.kind, z?.kind === 'base' ? t('cam.dir.' + z.dir) : t('cam.su.from_face'), s.rotary?.enabled ? `A ${fmtNum(s.rotary.aAngle, 3)}°` : null].filter(Boolean).join(' · ');
      const sctx = (e) => { e.preventDefault(); this.sel = { kind: 'setup', id: s.id }; ctxMenu(e.clientX || 80, e.clientY || 80, [
        { id: 'ctx-edit', label: t('cam.ctx.edit'), icon: 'properties', run: () => this.editSetup(s.id) }, { id: 'ctx-rename', label: t('cam.ctx.rename'), icon: 'rename', kbd: 'F2', run: () => this.renameSetup(s.id) },
        { sep: 1 }, { id: 'ctx-delete', label: t('cam.ctx.delete'), icon: 'trash', danger: true, kbd: 'Del', run: () => this.deleteSetup(s.id) }]); };
      kids.push(row({ id: s.id, testid: 'cam-setup-row', two: true, sel: on, depth: 0, click: () => this.select('setup', s.id), dbl: () => this.editSetup(s.id), ctx: sctx, key: (e) => { if (e.key === 'F2') this.renameSetup(s.id); else if (e.key === 'Delete') this.deleteSetup(s.id); },
        kids: [twist(open, () => { open ? this.collapsed.add(s.id) : this.collapsed.delete(s.id); app.C.renderBrowser(); }), h('span', { html: icon('cam-setup', 'sm') }), nm(s.name, sub)] }));
      if (!open) continue;
      const stockTxt = rs.S ? rs.S.stockBox.max.map((v, i) => fmtNum(v - rs.S.stockBox.min[i], 3)).join('×') + ' mm' : '';
      kids.push(row({ testid: 'cam-stock-row', depth: 1, err: !!rs.err, click: () => this.editSetup(s.id, { focus: 'su-stock-kind' }), kids: [h('span', { class: 'tw' }), h('span', { html: icon('cam-stock', 'sm') }), nm(t('cam.cmd.stock')), h('span', { class: 'val num', text: rs.err ? t('cam.br.unresolved') : stockTxt, title: rs.err ? errText(rs.err) : '' })] }));
      for (const op of s.ops || []) kids.push(this.opRow(op, s, row, nm));
    }
    // takımlar
    kids.push(sec(t('cam.br.tools'), h('button', { class: 'btn sm', type: 'button', 'data-testid': 'cam-tool-lib', onclick: () => openToolManager(this, 'doc') }, t('cam.br.library'))));
    if (!data.tools.length) kids.push(h('div', { class: 'trow empty', text: t('cam.br.no_tools') }));
    const prot = this.protectedLists();
    for (const tl of data.tools.slice().sort((a, b) => a.number - b.number)) {
      const hit = protectedHits(prot, tl);
      kids.push(row({ id: tl.id, testid: 'cam-tool-row', err: hit.length > 0, click: () => openToolManager(this, 'doc'), kids: [h('span', { class: 'tw' }), h('span', { html: icon('cam-tool', 'sm') }), nm(toolLabel(tl), tl.name || ''), hit.length ? h('span', { class: 'badge warn', title: t('cam.tl.prot_body', { list: hit.map((q) => q.kind + q.n).join(', ') }), html: icon('warning', 'sm') }) : null] }));
    }
    br.replaceChildren(...kids);
  }
  opRow(op, s, row, nm) {
    const tool = this.tools().find((x) => x.id === op.toolId); const st = this.ops.state(op, s);
    const badge = { ok: ['ok', 'check', 'cam.st.ok'], stale: ['warn', 'warning', 'cam.st.stale'], err: ['err', 'error', 'cam.st.err'], none: ['info', 'info', 'cam.st.none'], sup: ['info', 'suppress', 'cam.st.sup'] }[st.state];
    const on = this.sel?.kind === 'op' && this.sel.id === op.id;
    const ctx = (e) => { e.preventDefault(); this.sel = { kind: 'op', id: op.id }; ctxMenu(e.clientX || 80, e.clientY || 80, [
      { id: 'ctx-edit', label: t('cam.ctx.edit'), icon: 'properties', run: () => this.ops.edit(op.id) }, { id: 'ctx-rename', label: t('cam.ctx.rename'), icon: 'rename', kbd: 'F2', run: () => this.renameOp(op.id) },
      { id: 'ctx-suppress', label: op.suppressed ? t('cam.ctx.unsuppress') : t('cam.ctx.suppress'), icon: 'suppress', run: () => this.toggleSuppress(op.id) },
      { id: 'ctx-copy', label: t('cam.ctx.copy'), icon: 'duplicate', run: () => this.copyOp(op.id) }, { id: 'ctx-up', label: t('cam.ctx.up'), icon: 'chevron-up', run: () => this.moveOp(op.id, -1) }, { id: 'ctx-down', label: t('cam.ctx.down'), icon: 'chevron-down', run: () => this.moveOp(op.id, 1) },
      { sep: 1 }, { id: 'ctx-delete', label: t('cam.ctx.delete'), icon: 'trash', danger: true, kbd: 'Del', run: () => this.deleteOp(op.id) }]); };
    return row({ id: op.id, testid: 'cam-op-row', two: true, depth: 1, sel: on, err: st.state === 'err', dim: !!op.suppressed, click: () => this.select('op', op.id), dbl: () => this.ops.edit(op.id), ctx, key: (e) => { if (e.key === 'F2') this.renameOp(op.id); else if (e.key === 'Delete') this.deleteOp(op.id); },
      kids: [h('span', { class: 'tw' }), h('span', { html: icon(OP_ICON[op.type] || 'cam-tool', 'sm') }), nm(op.name, tool ? toolLabel(tool) : t('cam.op.no_tool')), h('span', { class: 'badge ' + badge[0], 'data-testid': 'op-badge', 'data-state': st.state, title: st.msg || '' }, h('span', { html: icon(badge[1], 'sm') }), h('span', { text: t(badge[2]) }))] });
  }

  // ---------------------------------------------------------------- alt çubuk ve durum çubuğu
  renderBottom(tl) { this.ops.renderBar(tl); }
  statusMode() { return { icon: 'workspace-manufacture', label: t('ui.mode_cam') }; }
  statusExtras(div) {
    const out = []; let stale = 0, err = 0;
    for (const s of this.setups()) for (const o of s.ops || []) { const st = this.ops.state(o, s).state; if (st === 'stale') stale++; else if (st === 'err') err++; }
    if (err) out.push(h('span', { class: 'seg-i errc', 'data-testid': 'st-op-err' }, h('span', { html: icon('error', 'sm') }), h('span', { text: t('cam.st.n_err', { n: err }) })), div());
    if (stale) out.push(h('span', { class: 'seg-i warnc', 'data-testid': 'st-op-stale' }, h('span', { html: icon('warning', 'sm') }), h('span', { text: t('cam.st.n_stale', { n: stale }) })), div());
    const v = this.ops.verifiedState();
    out.push(h('button', { class: 'sbtn ' + (v.ok ? 'ok' : 'unv'), type: 'button', 'data-testid': 'st-post', 'data-verified': v.ok ? '1' : '0', onclick: () => this.ops.openVerify() }, h('span', { html: icon(v.ok ? 'verified' : 'unverified', 'sm') }), h('span', { text: v.ok ? t('cam.post.verified_short') : t('cam.post.unverified_short') })), div());
    return out;
  }
}
export const initCam = (app) => new CamCtl(app);
void $; void clone;
