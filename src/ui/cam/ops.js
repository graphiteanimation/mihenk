// İmalat işlemleri: hesap önbelleği, durum rozetleri, takım yolu gösterimi, simülasyon ve post akışı.
// Hesap sonuçları (takım yolu, NC) belgeye yazılmaz; anahtar (işlem + setup + takım + tezgâh + model) değişince "Eski" olur.
import { h, toast } from '../dom.js';
import { icon } from '../icons.js';
import { t, tLang, errText } from '../../shared/i18n.js';
import { resolveSetup, buildProgram, generateProgram, gatesAsync, SURF3D_TYPES } from '../../cam/index.js';
import { axisPlane } from '../../cam/program.js';
import { blocked } from '../../cam/gates.js';
import { postProgram, postPropsMissing } from '../../cam/post/index.js';
import { openMachineManager } from './machines.js';
import { uid, hashStr } from './util.js';
import { replicateProgram } from '../../cam/multipart.js';
import { bodiesMeshInFrame } from '../../cam/sim/model3d.js';
import { postRunOpts } from './postopts.js';
import { OpPanel, defaultOp, OP_TYPE_KEY } from './oppanel.js';
import { SimRun } from './simbar.js';
import { showIssueList, showNc as showNcModal, openVerify as openVerifyDlg } from './postui.js';
import { buildSetupSheet } from '../../cam/report/setupsheet.js';
import { MATERIALS } from '../../cam/cutdata.js';
import { machineName } from './store.js';
import pkg from '../../../package.json';

const errObj = (e) => ({ code: e?.code || 'internal', params: e?.params || { message: String(e?.message ?? e) } });
const APP_VERSION = pkg.version;

export class CamOps {
  constructor(cam) { this.cam = cam; this.cache = new Map(); this.nc = null; this.sim = null; this.progNo = 1000; this.showPath = true; this.busy = false; this.selOp = null; this.draftPath = null; this._mh = new WeakMap(); this._envFor = undefined; this._pathSig = ''; }
  get app() { return this.cam.app; }
  enter() { this.refreshPaths(this.selOp); }
  leave() { this.simAbort?.abort(); this.stopSim(true); this.cam.view?.pathsVisible(false); this.cam.view?.hideMove(); }
  reset() { this.cache.clear(); this.nc = null; this.draftPath = null; this.selOp = null; this.stopSim(true); this.cam.view?.clearPaths(); }
  onResult() { if (this.sim) this.stopSim(); }
  relang() { this.app.C.renderTimeline?.(); }

  // ---------------------------------------------------------------- önbellek anahtarı ve durum
  envKey() {
    const r = this.app.result; if (this._envFor === r && this._env) return this._env;
    const sk = (this.app.doc.features || []).filter((f) => f && f.type === 'sketch');
    this._envFor = r; this._env = hashStr(JSON.stringify(sk)) + hashStr(JSON.stringify(r?.holes || [])) + this.cam.modelSig(); return this._env;
  }
  machineKey() { const m = this.cam.machine(); if (!m) return ''; let k = this._mh.get(m); if (!k) { k = hashStr(JSON.stringify(m)); this._mh.set(m, k); } return k; }
  keyOf(op, setup) {
    const tool = this.cam.tools().find((x) => x.id === op.toolId) || null;
    return hashStr(JSON.stringify([op, { ...setup, ops: 0 }, tool])) + this.machineKey() + this.envKey();
  }
  state(op, setup) {
    if (op.suppressed) return { state: 'sup' };
    setup = setup || this.cam.opLoc(op.id)?.setup; const c = this.cache.get(op.id); if (!c || !setup) return { state: 'none' };
    if (c.key !== this.keyOf(op, setup)) return { state: 'stale', msg: t('cam.st.stale_why') };
    if (c.error) return { state: 'err', msg: errText(c.error) };
    const w = (c.tp?.warnings || []).length;
    return { state: 'ok', msg: w ? t('cam.st.warn_n', { n: w }) : '' };
  }
  opName(id) { return this.cam.opLoc(id)?.op.name || ''; }

  // ---------------------------------------------------------------- işlem oluştur / düzenle
  create(type, cycle) {
    const cam = this.cam; const s = cam.sel;
    const su = s?.kind === 'setup' ? cam.setup(s.id) : s?.kind === 'op' ? cam.opLoc(s.id)?.setup : cam.setups().at(-1);
    if (!su) { toast(t('cam.need_setup'), { kind: 'warn' }); return; }
    const id = uid('op'); const key = type === 'drill' && cycle === 'tap' ? 'thread' : type;
    const n = cam.setups().reduce((a, x) => a + (x.ops || []).filter((o) => OP_TYPE_KEY(o) === key).length, 0) + 1;
    const op = defaultOp(type, cycle, id, t('cam.op.name_n', { type: t('cam.op.type.' + key), n }), cam.tools());
    cam.mut((c) => { c.setups.find((x) => x.id === su.id).ops.push(op); });
    cam.sel = { kind: 'op', id }; this.edit(id, { isNew: true });
  }
  edit(id, o = {}) { if (!this.cam.opLoc(id)) return; this.selOp = id; this.cam.sel = { kind: 'op', id }; this.cam.openPanel(new OpPanel(this.cam, id, o)); }
  onPick(hit, ev) { this.cam.panel?.onPick?.(hit, ev); }

  // ---------------------------------------------------------------- hesap
  async resolveS(setup) {
    const planes = {};
    for (const [k, f] of [['z', 'zAxis'], ['x', 'xAxis']]) { const ax = setup.frame?.[f]; if (ax?.kind === 'face' || ax?.kind === 'edge') planes[k] = await axisPlane((c, a) => this.app.query(c, a), ax); }
    return resolveSetup(setup, this.app.result, this.cam.machine(), { planes });
  }
  // setup.ops içinden ids hesaplanır; sonuç önbelleğe yazılır. Dönüş: Map(opId → {key,S,tp,error})
  async computeSetup(setup, ids, ctxOps = []) {
    const out = new Map(); const ops = (setup.ops || []).filter((o) => ids.includes(o.id) && !o.suppressed);
    const gen = [...ctxOps, ...ops]; // ctxOps: yalniz stok zincirine girer (onceki islemler); sonuc ops icin tutulur
    let S = null;
    try { S = await this.resolveS(setup); } catch (e) { for (const o of ops) { const x = { key: this.keyOf(o, setup), error: errObj(e) }; this.cache.set(o.id, x); out.set(o.id, x); } return out; }
    const sub = { tools: this.cam.tools(), setups: [{ ...setup, ops: gen }] };
    // WP-15: 3D işlemler worker'da hesaplanır; süren hesap bildirimden iptal edilebilir
    const s3 = ops.some((o) => SURF3D_TYPES.includes(o.type)); const ac = s3 ? new AbortController() : null; const el = s3 ? toast(t('cam.s3.computing'), { kind: 'info', ms: 0, action: { label: t('cam.sim.cancel'), run: () => ac.abort() } }) : null;
    let r; try { r = await generateProgram(sub, { rebuild: this.app.result, machine: this.cam.machine(), query: (c, a) => this.app.query(c, a), doc: this.app.doc, name: 'PROG', signal: ac?.signal ?? null }); }
    catch (e) { if (e?.code !== 'cam.op.cancelled') throw e; for (const o of ops) { const x = { key: this.keyOf(o, setup), error: errObj(e) }; this.cache.set(o.id, x); out.set(o.id, x); } return out; }
    finally { if (el?.isConnected) el.querySelector('[data-testid="toast-close"]')?.click(); }
    for (const o of ops) {
      const q = r.ops.find((x) => x.opId === o.id);
      let So = S; if (Number.isFinite(o.aAngle) && o.aAngle !== setup.rotary?.aAngle) { try { So = await this.resolveS({ ...setup, rotary: { enabled: true, aAngle: o.aAngle } }); } catch (e) { So = S; } } // WP-07: islem basina A acisi
      const x = { key: this.keyOf(o, setup), S: So, tp: q?.toolpath || null, error: q ? (q.ok ? null : q.error) : errObj({ code: 'cam.gate.op_failed', params: { op: o.name, code: 'internal' } }) };
      this.cache.set(o.id, x); out.set(o.id, x);
    }
    return out;
  }
  async computeDraft(setup, d) {
    if (!this.cam.machine()) return { error: { code: 'cam.no_machine', params: {} } };
    try {
      // dis frezeleme: delik onceki islemle (matkap) acilmis olabilir; taslak, kendinden onceki islemlerle zincirlenir (stok denetimi)
      const all = setup.ops || []; const at = all.findIndex((o) => o.id === d.id);
      const prior = (d.type === 'threadmill' || (d.type === 'adaptive' && d.rest?.source === 'stock')) && at > 0 ? all.slice(0, at).filter((o) => !o.suppressed) : []; // WP-12: rest stok zinciri
      const m = await this.computeSetup({ ...setup, ops: [d] }, [d.id], prior); const x = m.get(d.id);
      this.draftPath = x && !x.error ? { opId: d.id, S: x.S, tp: x.tp } : null;
      return x?.error ? { error: x.error } : { tp: x.tp, S: x.S };
    } catch (e) { return { error: errObj(e) }; }
  }
  // geçerli önbelleği olmayan (ya da force) işlemleri hesaplar; dönüş: hatalı işlemler
  async ensure(ids, force) {
    const fails = [];
    for (const s of this.cam.setups()) {
      const need = (s.ops || []).filter((o) => ids.includes(o.id) && !o.suppressed && (force || this.state(o, s).state !== 'ok'));
      if (need.length) await this.computeSetup(s, need.map((o) => o.id));
      for (const o of (s.ops || [])) { if (!ids.includes(o.id) || o.suppressed) continue; const c = this.cache.get(o.id); if (!c || c.error) fails.push({ op: o, error: c?.error || { code: 'internal', params: {} } }); }
    }
    return fails;
  }
  allIds() { const ids = []; for (const s of this.cam.setups()) for (const o of s.ops || []) if (!o.suppressed) ids.push(o.id); return ids; }
  guard() {
    if (this.busy) return false;
    if (!this.cam.machine()) { toast(t('cam.br.machine_missing'), { kind: 'warn' }); return false; }
    if (!this.allIds().length) { toast(t('cam.need_ops'), { kind: 'warn' }); return false; }
    return true;
  }
  failRows(fails) { return fails.map((f) => ({ level: 'block', op: f.op.name, text: errText(f.error), opId: f.op.id })); }
  async computeAll() {
    if (!this.guard()) return; this.busy = true;
    try {
      this.stopSim(); const fails = await this.ensure(this.allIds(), true);
      this.refreshPaths(this.selOp); this.app.C.renderAll();
      if (fails.length) await showIssueList(this, { title: t('cam.run.fail_title'), intro: t('cam.run.fail_intro', { n: fails.length }), rows: this.failRows(fails), kind: 'err', onPick: (r) => { if (r.opId) this.edit(r.opId); } });
      else toast(t('cam.run.done', { n: this.allIds().length }), { kind: 'ok' });
    } catch (e) { toast(errText(e), { kind: 'err' }); } finally { this.busy = false; }
  }

  // ---------------------------------------------------------------- takım yolu gösterimi
  validItems() {
    const items = [];
    for (const s of this.cam.setups()) for (const o of s.ops || []) {
      if (o.suppressed) continue;
      if (this.draftPath && this.draftPath.opId === o.id) { items.push(this.draftPath); continue; }
      const c = this.cache.get(o.id); if (c && !c.error && c.tp && c.key === this.keyOf(o, s)) items.push({ opId: o.id, S: c.S, tp: c.tp });
    }
    return items;
  }
  refreshPaths(sel = this.selOp, clearDraft = false) {
    if (clearDraft) this.draftPath = null; this.selOp = sel; const view = this.cam.view; if (!view) return;
    const items = this.validItems(); this._pathSig = items.map((x) => x.opId + x.tp.moves.length).join(',') + '|' + sel;
    view.showPaths(items, sel); view.pathsVisible(this.showPath && !this.sim);
  }
  pathCount() { return this.validItems().length; }

  // ---------------------------------------------------------------- program, kapılar, simülasyon
  progName() { const n = String(this.app.fileName || '').replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase().slice(0, 24); return n || 'PROGRAM'; }
  // V-11: çözünürlük en küçük takım yarıçapını aşamaz (hücre merkezi takım diskine düşmezse hızlı/çarpma görülmez).
  // Hücre sayısı büyürse çekirdek camHeightmap_too_big verir → kapı engeller (sessiz kaba çözünürlük yok).
  simRes(Ss, program) {
    let a = 0; for (const S of Ss) a = Math.max(a, (S.stockBox.max[0] - S.stockBox.min[0]) * (S.stockBox.max[1] - S.stockBox.min[1]));
    let res = Math.max(0.5, Math.ceil(Math.sqrt(a / 400000) * 10) / 10);
    for (const sec of program?.sections || []) { const d = sec.toolpath?.tool?.dia; if (d > 0) res = Math.min(res, Math.floor((d / 2) * 1000) / 1000); }
    return res;
  }
  async simOpts(Ss, program) {
    const res = this.simRes(Ss, program); const modelHeightmaps = {}; const notes = [];
    for (const S of Ss) {
      const b = S.stockBox;
      try { modelHeightmaps[S.id] = await this.app.query('camHeightmap', { bodies: S.bodies, frame: S.frame, res, bbox: [b.min[0], b.min[1], b.max[0], b.max[1]] }); }
      catch (e) { notes.push({ level: 'block', code: 'cam.ui.sim_no_model', params: { setup: S.name, msg: errText(e) } }); } // V-06: oyma denetlenemez → engel
    }
    // WP-22b (O-050): ayrintili simulasyon (belge doc.cam.sim.detail): tri-dexel + model agi (setup cercevesinde, sarma dahil).
    // Ag = goruntu agi (kernel meshBody toleransi max(0,005, kosegen/2000) mm -> err olarak oyma toleransina eklenir).
    let detail = null;
    if (this.cam.data().sim?.detail) {
      const all = this.app.result?.bodies || []; const modelMeshes = {}; const transfer = [];
      for (const S of Ss) {
        const bs = all.filter((b) => (S.bodies || []).includes(b.id)); let err = 0.005;
        for (const b of bs) { const v = b.vertices; if (!v?.length) continue; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let k = 0; k < v.length; k++) { const a = k % 3; if (v[k] < mn[a]) mn[a] = v[k]; if (v[k] > mx[a]) mx[a] = v[k]; } err = Math.max(err, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2000); }
        const m = bodiesMeshInFrame(bs, S.frame, err); if (m) { modelMeshes[S.id] = m; transfer.push(m.v.buffer, m.t.buffer); }
      }
      detail = { modelMeshes, transfer };
    }
    const tools = {}; for (const tl of this.cam.tools()) { const o = {}; if (tl.shaftDia != null) o.shaftDia = tl.shaftDia; if (tl.tipDia != null) o.tipDia = tl.tipDia; if (tl.holder) o.holder = tl.holder; if (Object.keys(o).length) tools[tl.number] = o; }
    return { opts: { res, modelHeightmaps, tools, ...(detail ? { dexel: 'tri', modelMeshes: detail.modelMeshes } : {}) }, notes, transfer: detail?.transfer ?? [] };
  }
  // tüm işlemleri hesapla (eskileri), program kur, kapıları (simülasyon dahil) çalıştır. Hata → null (kullanıcıya gösterilmiş)
  async prepare() {
    if (!this.guard()) return null; this.busy = true;
    try {
      const fails = await this.ensure(this.allIds(), false);
      this.refreshPaths(this.selOp); this.app.C.renderAll();
      if (fails.length) { await showIssueList(this, { title: t('cam.run.fail_title'), intro: t('cam.run.fail_intro', { n: fails.length }), rows: this.failRows(fails), kind: 'err', onPick: (r) => { if (r.opId) this.edit(r.opId); } }); return null; }
      const sections = [], items = [];
      for (const s of this.cam.setups()) {
        const tps = []; let S = null;
        for (const o of s.ops || []) { if (o.suppressed) continue; const c = this.cache.get(o.id); tps.push(c.tp); S = c.S; items.push({ op: o, setup: s, S: c.S, tp: c.tp }); }
        if (tps.length) sections.push({ setup: S, toolpaths: tps });
      }
      const machine = this.cam.machine();
      const program = buildProgram({ name: this.progName(), number: this.progNo, machine, sections });
      const so = await this.simOpts(sections.map((x) => x.setup), program);
      // WP-13: simulasyon Web Worker'da (arayuz donmaz); ilerleme ve iptal bildiriminde
      const ac = new AbortController(); this.simAbort = ac; let el = null, last = 0;
      const prog = ({ index, total }) => { const now = Date.now(); if (now - last < 400) return; last = now; const msg = t('cam.sim.progress', { p: Math.round((index / Math.max(1, total)) * 100) }); if (el?.isConnected) { const tt = el.querySelector('.tt'); if (tt) tt.textContent = msg; } else el = toast(msg, { kind: 'info', ms: 0, action: { label: t('cam.sim.cancel'), run: () => ac.abort() } }); };
      let gl; try { gl = await gatesAsync(program, machine, { sim: so.opts }, { signal: ac.signal, onProgress: prog, transfer: so.transfer }); } /* WP-22b: model agi worker'a aktarilir (kopyasiz) */ finally { this.simAbort = null; if (el?.isConnected) el.querySelector('[data-testid="toast-close"]')?.click(); }
      const g = [...so.notes, ...gl];
      const { modelMeshes: _mm, ...simKeep } = so.opts; // aktarilan ag tamponlari burada bostur; oynatici yukseklik haritasiyla calisir
      return { program, items, gates: g, simOpts: simKeep, docSig: this.docSig() };
    } catch (e) { toast(errText(e), { kind: e?.code === 'cam.sim.cancelled' ? 'info' : 'err' }); return null; } finally { this.busy = false; }
  }
  // Aynı neden (kod + işlem dışı parametreler) birden çok işlemde tekrarlanırsa tek satır: işlem adları birleşir (U-08).
  gateRows(list) {
    const rows = new Map();
    for (const g of list) {
      const { op: _op, ...rest } = g.params || {};
      const params = g.code === 'cam.gate.protected' && rest.kind === 'WCS' ? { ...rest, kind: 'WCS ' } : rest; // "WCS G56" (boşluklu)
      const key = g.level + '|' + g.code + '|' + JSON.stringify(rest);
      const nm = g.opId ? this.opName(g.opId) : '';
      const hit = rows.get(key);
      if (hit) { if (nm && !hit.names.includes(nm)) hit.names.push(nm); continue; }
      rows.set(key, { level: g.level, names: nm ? [nm] : [], text: errText({ code: g.code, params: { ...(g.params || {}), ...params } }), g });
    }
    return [...rows.values()].map((r) => ({ level: r.level, op: r.names.join(', '), text: r.text, g: r.g }));
  }
  async simulate() {
    const r = await this.prepare(); if (!r) return;
    this.stopSim(true);
    try { this.sim = new SimRun(this, r); this.sim.start(); } catch (e) { this.sim = null; toast(errText(e), { kind: 'err' }); }
    this.app.C.renderTimeline(); this.app.C.renderBrowser();
  }
  stopSim(quiet) {
    if (!this.sim) return; this.sim.dispose(); this.sim = null;
    this.refreshPaths(this.selOp); if (!quiet) this.app.C.renderTimeline();
  }
  renderBar(tl) {
    if (this.sim && this.sim.r.docSig !== this.docSig()) this.stopSim(true); // belge değişti: simülasyon eskidi
    if (this.sim) { this.sim.render(tl); return; }
    if (this._pathSig !== this.validItems().map((x) => x.opId + x.tp.moves.length).join(',') + '|' + this.selOp) this.refreshPaths(this.selOp);
    const kids = [h('div', { class: 'tl-label' }, h('span', { html: icon('simulate', 'sm') }), h('span', { text: t('cam.sim.label') }))];
    if (this.pathCount()) {
      const sw = (cls, key) => h('span', { class: 'lg-i' }, h('span', { class: 'lg-sw ' + cls }), h('span', { text: t(key) }));
      kids.push(h('span', { class: 'legend', 'data-testid': 'path-legend' }, sw('rapid', 'cam.leg.rapid'), sw('cut', 'cam.leg.cut'), sw('lead', 'cam.leg.lead')));
      const c = h('input', { type: 'checkbox', 'data-testid': 'path-toggle', checked: this.showPath }); c.addEventListener('change', () => { this.showPath = c.checked; this.cam.view?.pathsVisible(this.showPath); });
      kids.push(h('label', { class: 'chk' }, c, h('span', { text: t('cam.leg.show') })));
    } else kids.push(h('span', { class: 'note', text: t('cam.sim.empty') }));
    tl.replaceChildren(...kids);
  }

  // ---------------------------------------------------------------- post / NC
  docSig() { const doc = this.app.doc; return hashStr(JSON.stringify([doc.features, doc.cam ? { ...doc.cam, verified: undefined } : null])); }
  verifiedState() {
    const v = this.cam.data().verified; if (!v) return { ok: false };
    return v.sig === this.docSig() ? { ok: true, rec: v } : { ok: false, lapsed: true, rec: v };
  }
  openVerify() { return openVerifyDlg(this); }
  runPost(program, gates) {
    const v = this.verifiedState(); program.number = this.progNo;
    { const pt = this.cam.data().parts; if (pt && pt.count > 1) program = replicateProgram(program, { count: pt.count, order: pt.order || 'byOp', machine: this.cam.machine() }).program; } // WP-14: mengenede coklu parca
    // WP-21: NC başlığı model özeti için belge adı, model kutusu ve tam üretim zamanı (postopts.js)
    return postProgram(program, this.cam.machine(), { ...postRunOpts({ program, fileName: this.app.fileName, result: this.app.result, gates, appVersion: APP_VERSION, verified: v.ok ? { by: v.rec.by, date: v.rec.date, note: v.rec.note } : null }), units: this.cam.data().units === 'inch' ? 'inch' : 'mm' });
  }
  async post() {
    const r = await this.prepare(); if (!r) return;
    this.stopSim(true);
    // M-03: yalnız BU programın kullandığı boş post özellikleri (U-05: hepsi tek listede); kapıdaki aynı engeller tekrar yazılmaz
    const bl = r.gates.filter((g) => g.level === 'block' && g.code !== 'cam.gate.post_prop_missing');
    let miss = []; try { miss = postPropsMissing(r.program, this.cam.machine()).missing; } catch (e) { miss = r.gates.filter((g) => g.code === 'cam.gate.post_prop_missing').map((g) => g.params.prop); }
    const ppName = (k) => { const b = 'cam.pp.' + String(k).split('.')[0]; return tLang('tr', b) !== b ? t(b) : k; };
    if (bl.length || miss.length) {
      this.nc = null; this.app.C.renderAll();
      const rows = [...this.gateRows(bl), ...miss.map((k) => ({ level: 'block', op: '', text: t('cam.post.prop_row', { name: ppName(k), key: k }), prop: k }))];
      await showIssueList(this, { title: t('cam.post.blocked_title'), intro: bl.length ? t('cam.post.blocked_intro', { n: rows.length }) : t('cam.post.prop_missing_intro', { n: miss.length }), rows, warns: this.gateRows(r.gates.filter((g) => g.level !== 'block')), kind: 'err', onPick: (row) => { if (row.g?.opId) this.edit(row.g.opId); else if (row.prop || row.g?.code === 'cam.gate.missing') openMachineManager(this.cam); } });
      return;
    }
    let res; try { res = this.runPost(r.program, r.gates); } catch (e) { this.nc = null; this.app.C.renderAll(); await showIssueList(this, { title: t('cam.post.fail_title'), intro: t('cam.post.fail_intro'), rows: [{ level: 'block', op: '', text: errText(e) }], kind: 'err' }); return; }
    this.nc = { ...res, items: r.items, program: r.program, gates: r.gates, docSig: r.docSig, name: this.progName() };
    this.app.C.renderAll(); await this.showNc();
  }
  // WP-07 dilim 6: kurulum foyu - belge verisinden (hesaplanmis islemler) tek dosya HTML; tarayicidan PDF'e yazdirilir
  buildSheet(r) {
    const cam = this.cam; const toolNames = {}; for (const x of cam.tools()) if (x.name) toolNames[x.number] = x.name;
    const mat = cam.data().material; const material = mat ? (MATERIALS.includes(mat) ? t('cam.cd.m.' + mat) : mat) : '';
    const title = String(this.app.fileName || '').replace(/\.[^.]*$/, '');
    return buildSetupSheet({ title, date: new Date().toISOString().slice(0, 10), machineName: machineName(cam.machine()), material, programName: this.progName(), toolNames, tr: (k, p) => t(k, p), lang: document.documentElement.lang === 'en' ? 'en' : 'tr',
      items: r.items.map((x) => ({ setupName: x.setup.name, stockFrom: x.setup.stockFrom, S: x.S, opName: x.op.name, opType: x.op.type, tp: x.tp })) });
  }
  async sheet() {
    const r = await this.prepare(); if (!r) return null;
    const html = this.buildSheet(r); const name = this.progName() + '-foy.html';
    try { const p = await this.app.writeOut(new TextEncoder().encode(html), name, 'html', true); if (p) toast(t('cam.sheet.saved', { name: typeof p === 'string' ? p : name }), { kind: 'ok' }); return html; }
    catch (e) { toast(t('cam.sheet.save_failed', { msg: errText(e) }), { kind: 'err' }); return null; }
  }
  async showNc() { if (!this.nc) { toast(t('cam.need_post'), { kind: 'warn' }); return; } await showNcModal(this); this.cam.view?.hideMove(); }
}
