// Mihenk uygulama çekirdeği: belge durumu, çekirdek (worker) köprüsü, geri al/yinele, dosya, araçlar.
import './prefs.js';
import './style.css';
import pkg from '../../package.json';
import planegcsWasm from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import { Viewport, THREE, COL } from './viewport.js';
import { SKO, onSkOptsChange } from './sketch/opts.js';
import { TEXT_MAX } from './sketch/text.js';
const EXAMPLES = import.meta.glob('../../ornekler/*.mhnk', { query: '?raw', import: 'default' });
import { paintFaces } from './viewport-hist.js';
import { initSolver, solveSketch } from './solver.js';
import { evalExpr, resolveParams, changedByO044 } from '../shared/expr.js';
import { basePlane } from '../shared/vec.js';
import { h, $, toast, modal, modalOpen, promptText, confirmBox, esc, fmt } from './dom.js';
import { t, errText, setLang, getLang, onLangChange, applyI18n } from '../shared/i18n.js';
import { KErr, toErr } from '../shared/errors.js';
import { checkEnvelope, validateDoc, FILE_VERSION, LIMITS, APP_NAME } from '../shared/schema.js';
import { upgradeDocProfiles } from '../shared/profiles.js';
import { recovery } from './recovery.js';
import { parseDxf, UNIT_TABLE } from '../shared/dxf.js';
import { defaults, newId, autoName, featLabel, dependents, tn, planMove, fixGroups, groupRanges, groupOf, moveUnit, groupUnit } from './features.js';
import { initChrome } from './chrome.js';
import { exampleEntries, wrapExample } from './examples.js';
import { initCam } from './cam/index.js';
import { initDrawing } from './drawing/index.js'; // WP-17
import { onPrefsChange, getStr, setStr } from './prefs.js';
import { showSettings, renderWelcome } from './screens.js';
import { FeaturePanel, SketchPanel, SectionPanel, paramsModal, showBox, hideBox, measureRows, showProps } from './panels.js';

// sketcher.js ayrı bir modüldür; yoksa ya da bozuksa model kipi çalışmaya devam eder.
const SKETCHER = import.meta.glob('./sketcher.js');

const clone = (v) => (Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (bytes) => { let s = ''; const C = 0x8000; for (let i = 0; i < bytes.length; i += C) s += String.fromCharCode.apply(null, bytes.subarray(i, i + C)); return btoa(s); };
const emptyDoc = () => ({ params: [], features: [], rollback: null });
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
// İçe aktarılan verinin SHA-256'sı (S-02): özelliğe `hash` olarak yazılır; yükleme sırasında doğrulanır.
export async function sha256Hex(bytes) { return hex(await crypto.subtle.digest('SHA-256', bytes)); }
// Benzersiz içe aktarma kimliği: belge değişse de çekirdek önbelleğinde çakışmaz (eski: her belgede 'imp1').
const importId = (doc) => { const used = new Set(doc.features.map((f) => f.id)); for (;;) { const r = crypto.getRandomValues(new Uint32Array(2)); const id = 'imp_' + hex(r.buffer); if (!used.has(id)) return id; } };
// Otomatik kurtarma aralığı (60 sn). Yalnız tarayıcı/test kipinde localStorage ile geçersiz kılınabilir (0 = kapalı).
const RECOVERY_MS = 60000;
const recoveryInterval = () => { if (window.native) return RECOVERY_MS; try { const v = localStorage.getItem('mihenk.recoveryMs'); return v == null ? RECOVERY_MS : Math.max(0, Number(v) || 0); } catch (e) { return RECOVERY_MS; } };

class App {
  constructor() {
    this.doc = emptyDoc(); this.result = null; this.lastMs = null;
    this.undoStack = []; this.redoStack = []; this.dirty = false; this.fileName = null; this.filePath = null;
    this.selection = []; this.selFeature = null; this.hiddenBodies = new Set(); this.hiddenSketches = new Set();
    this.edit = null; this.tool = null; this.measureSel = []; this.sketchSession = null; this.sketcher = null; this.sectionPanel = null;
    this._seq = 0; this._chain = Promise.resolve(); this._timer = 0; this._pending = new Map(); this._wid = 0; this.needFit = true; this.regionCount = null;
    this.busy = false; this.stale = false; this.lastAutosave = null; this.welcome = false; this._cancelled = false;
    this.mode = 'design'; this.problems = {}; this._rev = 0; this._recRev = -1; this._resetP = Promise.resolve(); this.recoveryMs = RECOVERY_MS; this._recTimer = 0;
    // WP-02 geçmiş: geçici "değişti" işaretleri (bir sonraki güncellemede yenilenir), açık kaynaşmış eskizler, üstüne gelinen işlem
    this.marks = { changed: new Set() }; this.histOpen = new Set(); this.groupOpen = new Set(); this.selAnchor = null; this.selGroup = null; this._cancellable = null; this.cancelStats = { sent: 0, done: 0 }; this._paintSeq = 0; this.painted = null; this.hoverFeature = null; this.sums = null; this.sweep = null; this.showFinal = false;
    this.ready = new Promise((res, rej) => { this._readyRes = res; this._readyRej = rej; });
    this.ready.catch(() => {});
  }

  // ------------------------------------------------------------ başlatma
  async init() {
    document.documentElement.lang = getLang(); applyI18n();
    this.cam = initCam(this); this.drawing = initDrawing(this);
    await this.loadExamples(); // menü kurulmadan önce (Dosya → Örnekler)
    this.C = initChrome(this);
    onLangChange(() => this.relang());
    onPrefsChange(() => this.retheme());
    this.pushNativeStrings();
    try { this.viewport = new Viewport($('#viewport')); this.installViewStore(); this.viewport.setGridStep(SKO.grid); onSkOptsChange(() => this.viewport?.setGridStep(SKO.grid)); }
    catch (e) { this.loadFail(t('ld.webgl', { detail: e.message }), 420); this._readyRej(e); return; }
    this.viewport.onPick = (hit, ev) => this.onPick(hit, ev);
    this.viewport.onCamera = () => {}; this.viewport.setLeftRotate(getStr('leftRotate') === 'on');
    this.C.renderViewBtns(); this.C.renderAll();
    this.bindKeys();
    this.showWelcome(getStr('welcome') !== 'off');
    // sürükle-bırak ile dosyaya gezinmeyi engelle (S-03); gezinti ayrıca ana süreçte de engellidir
    for (const ev of ['dragover', 'drop']) window.addEventListener(ev, (e) => e.preventDefault());
    if (!window.native) window.addEventListener('beforeunload', (e) => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } });
    try {
      this.startWorker();
      await Promise.all([this.call('ping'), initSolver(() => planegcsWasm)]);
      $('#loading').classList.add('hidden');
      this.setLeft(() => t('st.ready'));
      this._readyRes(true);
    } catch (e) {
      this.loadFail(t('ld.kernel_fail', { detail: errText(e) }), 460, t('ld.restart'));
      this._readyRej(e); return;
    }
    let recovered = false;
    try { recovered = await this.offerRecovery(); } catch (e) { console.error(e); }
    if (window.native && !recovered) { try { const f = await window.native.argvFile(); if (f) await this.openBytes(f.data, f.name, f.name); } catch (e) { toast(t('msg.open_failed', { msg: errText(e) }), true); } }
    this.recoveryMs = recoveryInterval();
    if (this.recoveryMs > 0) this._recTimer = setInterval(() => this.recoveryTick(), this.recoveryMs);
    this.updateTitle();
  }
  // Başlangıç hatası: yükleme katmanında kırmızı metin (kullanıcı verisi textContent ile basılır).
  loadFail(text, width, extra) {
    const box = $('#loading'); box.replaceChildren();
    const sp = h('span', { class: 'load-fail', style: { maxWidth: width + 'px' }, text });
    if (extra) sp.append(h('br'), extra);
    box.append(sp);
  }

  // ------------------------------------------------------------ dil
  setLanguage(l) { setLang(l); }
  // Tema/yoğunluk değişince 3B görünüm ve eskiz katmanı renkleri CSS değişkenlerinden yeniden okunur.
  retheme() {
    try { this.viewport?.applyTheme(); if (this.viewport) { this.viewport.snapGrid = null; this.viewport.setGridStep(SKO.grid); } this.refreshSketches(); this.sketcher?.retheme?.(); this.cam?.view?.retheme(); } catch (e) { console.error(e); }
    this.C?.renderAll?.();
  }
  showSettings(tab) { return showSettings(this, tab); }
  showWelcome(on) { this.welcome = !!on; document.getElementById('app').classList.toggle('welcome-on', this.welcome); renderWelcome(this); this.C?.renderAll?.(); }
  async openRecent(i) { if (!window.native?.openRecent) return; if (this.guard()) return; if (!(await this.confirmDiscard())) return; const f = await window.native.openRecent(i); if (f) await this.openBytes(f.data, f.name, f.path || f.name); }
  toastInfo(m) { toast(m, { kind: 'info' }); }
  badFeatures() { const st = this.result?.status || {}; return this.doc.features.filter((f) => st[f.id] && st[f.id].ok === false); }
  gotoFirstError() { const f = this.badFeatures()[0]; if (!f || this.guard()) return; this.selectFeature(f.id); this.toastInfo(errText(this.result.status[f.id].error)); }
  // Uzun hesaplamayı iptal eder: işçi sonlandırılır ve yeniden başlatılır (`reset`); sonuç eski kalır (bayat).
  async cancelCompute() {
    if (!this.busy) return;
    this._cancelled = true; this._seq++; clearTimeout(this._timer); this._timer = 0; this.busy = false; this.stale = true; this.C.renderStatus();
    try { await this._resetWorker(); } catch (e) { console.error(e); }
    this._cancelled = false; this.setLeft(() => t('st.cancelled')); this.C.renderStatus();
  }
  // Electron ana süreci kapatma onayı gibi diyalog metinlerini buradan alır (tek sözlük).
  pushNativeStrings() {
    window.native?.setStrings?.({ closeMsg: t('native.close_msg'), closeDetail: t('native.close_detail'), closeCancel: t('native.close_cancel'), closeDiscard: t('native.close_discard'),
      filterDoc: t('file.filter_doc'), filterStep: t('file.filter_step'), filterStl: t('file.filter_stl'), filterDxf: t('file.filter_dxf'), filterNc: t('file.filter_nc'), filterJson: t('file.filter_json'), tSave: t('dlg.t_save'), tOpen: t('dlg.t_open'), tImport: t('dlg.t_import'), tExport: t('dlg.t_export') });
  }
  // Dil değişince her yer yeniden çizilir; açık panel, sketch, kesit, ölçü kutusu ve durum satırı dahil.
  relang() {
    this.pushNativeStrings();
    this.C.relang(); this.updateTitle(); if (this.welcome) renderWelcome(this);
    if (this.edit && !this.edit.closed) { this.edit.relang(); }
    if (this.sketchSession) { this.sketchPanel?.render(); this.sketcher?.relang(); }
    if (this.sectionPanel) this.sectionPanel.relang();
    if (this.tool === 'measure') this.showMeasure(); else if (this.tool === 'props') { const id = this.selection.find((s) => s.kind === 'body')?.body; if (id) showProps(this, id); }
    this.refreshHint(); this.refreshLeft();
  }

  // ------------------------------------------------------------ çekirdek köprüsü
  startWorker() {
    this.worker = new Worker(new URL('../kernel/worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => {
      const { id, result, error, progress } = ev.data; const p = this._pending.get(id); if (!p) return;
      if (progress) { try { p.onProgress?.(progress); } catch (e) { console.error(e); } return; }
      this._pending.delete(id); error ? p.reject(new KErr(error.code, error.params)) : p.resolve(result);
    };
    const die = (err) => {
      for (const p of this._pending.values()) p.reject(err); this._pending.clear();
      try { this.worker.terminate(); } catch (e) { /* zaten kapalı */ }
      this.startWorker();
    };
    this.worker.onerror = (e) => { console.error('worker hatası', e); die(new KErr('worker.crashed')); };
  }
  // Çekirdek önbelleğini sıfırlar (S-02): işçi sonlandırılıp yeniden başlatılır (worker'a `reset` komutu eklenene kadar).
  async resetKernel() {
    clearTimeout(this._timer); this._timer = 0; await this.whenIdle();
    const p = this._resetWorker(); this._resetP = p.catch(() => {}); await p;
  }
  async _resetWorker() {
    const err = new KErr('worker.crashed');
    for (const p of this._pending.values()) p.reject(err); this._pending.clear();
    try { this.worker.terminate(); } catch (e) { /* zaten kapalı */ }
    this.startWorker();
    await this.call('ping');
  }
  call(cmd, args = {}, onProgress = null) {
    return new Promise((resolve, reject) => { const id = ++this._wid; this._pending.set(id, { resolve, reject, onProgress }); this.worker.postMessage({ id, cmd, args }); });
  }
  // sıralı sorgu: bekleyen yeniden hesaplamalardan sonra çalışır
  query(cmd, args) { const p = this._chain.then(() => this.call(cmd, args)); this._chain = p.catch(() => {}); return p; }
  describe(hit, kind) { return this.query('describe', { ref: { body: hit.body, idx: hit.idx }, kind: kind || hit.kind }); }

  // ------------------------------------------------------------ belge
  cloneDoc(d) { return clone(d); }
  vars() { try { return resolveParams(this.doc.params).vars; } catch (e) { return {}; } }
  // WP-10 devri: örnek belgeler (geliştirmede ve paketlenmiş uygulamada ornekler/*.mhnk derlemeye gömülür; yoksa liste boş, menü gizli)
  // WP-21: masaüstü kabuğu örnek listesi veriyorsa (kurulu sürüm: resources/ornekler) o kullanılır; yoksa derlemeye gömülü liste
  exampleList() { return this._nativeExamples ? exampleEntries(this._nativeExamples, 'native') : exampleEntries(Object.keys(EXAMPLES), 'embed'); }
  async loadExamples() { try { const l = window.native?.examplesList ? await window.native.examplesList() : null; this._nativeExamples = Array.isArray(l) ? l.filter((x) => typeof x === 'string') : null; } catch (e) { this._nativeExamples = null; } }
  async openExample(key) {
    const ex = this.exampleList().find((x) => x.key === key); if (!ex || this.guard()) return;
    if (!(await this.confirmDiscard())) return;
    try {
      let txt;
      if (ex.src === 'native') { const r = await window.native.openExample(ex.file); if (!r) throw new KErr('example_missing', { name: ex.name }); txt = new TextDecoder().decode(r.data); }
      else txt = await EXAMPLES[ex.path]();
      if (await this.openBytes(new TextEncoder().encode(wrapExample(txt, APP_NAME, FILE_VERSION)), ex.name + '.mhnk', null)) window.native?.docState('new'); // örnek salt okunur kaynaktır: belge yolu olmaz
    } catch (e) { toast(t('msg.open_failed', { msg: errText(e) }), true); }
  }
  async saveViewPrompt() {
    const nm = await promptText(t('vd.name'), ''); if (!nm) return;
    const r = this.viewport.saveNamedView(nm); toast(r.ok ? t('cmd.view_saved', { name: r.name }) : t(r.err), !r.ok);
  }
  // WP-08 devir (c): adlandırılmış görünüşler belgenin isteğe bağlı `views` alanında (12 yuva, kodlu metin); kaydet/sil geri alınabilir adımdır
  installViewStore() {
    const vp = this.viewport; if (!vp) return;
    vp.viewStore = {
      get: (i) => (Array.isArray(this.doc?.views) ? this.doc.views[i - 1] || '' : ''),
      set: (i, v) => this.commitMeta((d) => { const a = Array.isArray(d.views) ? d.views.slice() : []; while (a.length < i) a.push(''); a[i - 1] = v || ''; while (a.length && !a[a.length - 1]) a.pop(); if (a.length) d.views = a; else delete d.views; }),
    };
  }
  normalize(d) {
    d = clone(d || {}); d.params = Array.isArray(d.params) ? d.params : []; d.features = Array.isArray(d.features) ? d.features : [];
    if (d.rollback === undefined || (typeof d.rollback === 'number' && d.rollback >= d.features.length)) d.rollback = null;
    for (const f of d.features) if (f.type === 'sketch') { f.points = f.points || {}; if (!f.points.O) f.points.O = { x: 0, y: 0, fixed: true }; f.ents = f.ents || []; f.cons = f.cons || []; }
    return d;
  }
  pushUndo() { this.undoStack.push(clone(this.doc)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0; }
  markDirty(v = true) { this.dirty = v; if (v) this._rev++; this.updateTitle(); }
  updateTitle() {
    const title = this.docTitle() + ' — Mihenk';
    document.title = title; this.C?.renderTitle(); if (window.native) { window.native.setTitle(title); window.native.setDirty?.(this.dirty); }
  }
  docTitle() { return (this.dirty ? '• ' : '') + (this.fileName || t('doc.untitled')); }

  // Belgeyi değiştir (geri alınabilir) ve yeniden hesapla.
  async commit(fn) {
    if (this.tool) this.endTool(true);
    this.pushUndo(); fn(this.doc);
    if (this.doc.rollback != null && this.doc.rollback >= this.doc.features.length) this.doc.rollback = null;
    this.markDirty(); this.C.renderAll();
    return this.requestRebuild();
  }
  // Yalnız doc.cam gibi geometriyi etkilemeyen belge değişikliği (geri alınabilir; yeniden hesaplama yok)
  commitMeta(fn) { if (this.tool) this.endTool(true); this.pushUndo(); fn(this.doc); this.markDirty(); this.C.renderAll(); }
  // Çalışma alanı: 'design' | 'cam'. Belge, görünüm ve kamera korunur; şerit, tarayıcı, panel ve alt çubuk değişir.
  setMode(m) {
    if (m === this.mode || !['design', 'cam', 'drawing'].includes(m)) return;
    if (this.welcome) return;
    if (this.guard()) return; this.endTool(true); if (this.sectionPanel) { this.sectionPanel.close(); }
    if (this.mode === 'drawing') this.drawing.leave(); // WP-17
    if (m === 'cam') { this.mode = 'cam'; this.setHint(''); this.cam.enter(); }
    else if (m === 'drawing') { if (this.mode === 'cam') this.cam.leave(); this.mode = 'drawing'; this.setHint(''); this.drawing.enter(); }
    else { this.cam.leave(); this.mode = 'design'; this.idleView(); this.refreshSketches(); }
    this.C.renderAll(); this.refreshLeft(); this.paintSel();
  }
  guard() {
    if (this.edit || this.sketchSession) { toast(t('msg.finish_first')); return true; }
    return false;
  }
  async undo() {
    if (this.sketchSession) { this.sketcher?.undo(); return; }
    if (this.guard()) return; if (!this.undoStack.length) { toast(t('msg.nothing_undo')); return; }
    this.endTool(true); this.redoStack.push(clone(this.doc)); this.doc = this.undoStack.pop(); this.markDirty(); this.C.renderAll(); return this.requestRebuild();
  }
  async redo() {
    if (this.sketchSession) { this.sketcher?.redo(); return; }
    if (this.guard()) return; if (!this.redoStack.length) { toast(t('msg.nothing_redo')); return; }
    this.endTool(true); this.undoStack.push(clone(this.doc)); this.doc = this.redoStack.pop(); this.markDirty(); this.C.renderAll(); return this.requestRebuild();
  }
  // Test ve dosya açma için: belgeyi tümden yükle
  async loadDoc(doc, { name = null, path = null, reset = false } = {}) {
    if (reset) await this.resetKernel();
    if (this.edit) this.edit.cancel(); if (this.sketchSession) this.cancelSketch(); this.endTool(true); if (this.sectionPanel) this.sectionPanel.close();
    try { upgradeDocProfiles(doc); } catch (e) { console.error('profile upgrade failed', e); }
    if (this.welcome) this.showWelcome(false);
    this.doc = this.normalize(doc); this.undoStack = []; this.redoStack = []; this.fileName = name; this.filePath = path; this.selection = []; this.selFeature = null;
    this.hiddenBodies.clear(); this.hiddenSketches.clear(); this.marks.changed.clear(); this.histOpen.clear(); this.groupOpen.clear(); this.selAnchor = null; this.selGroup = null; this.sums = null; this.needFit = true; this.markDirty(false); this.cam.onDocLoaded(); this.drawing.onDocLoaded(); this.C.renderAll();
    await this.requestRebuild();
  }

  // ------------------------------------------------------------ yeniden hesaplama
  // WP-02 dilim 5: yeni düzenleme gelince süren (iptal edilebilir) ön izleme / son hal hesabı işçide durdurulur
  cancelInflight() {
    const id = this._cancellable; if (id == null) return;
    this._cancellable = null; this.cancelStats.sent++;
    try { this.worker.postMessage({ id: 0, cmd: 'cancel', args: { id } }); } catch (e) { console.error(e); }
  }
  requestRebuild() { this.cancelInflight(); const seq = ++this._seq; this._chain = this._chain.then(() => this._rebuildTask(seq)).catch((e) => console.error(e)); return this.whenIdle(); }
  previewSoon(ms = 250) { this.cancelInflight(); clearTimeout(this._timer); this._timer = setTimeout(() => { this._timer = 0; this.requestRebuild(); }, ms); }
  async flushPreview() { if (this._timer) { clearTimeout(this._timer); this._timer = 0; this.requestRebuild(); } return this.whenIdle(); }
  async whenIdle() { for (;;) { const r = this._resetP; await r; const c = this._chain; await c; if (r === this._resetP && c === this._chain && !this._timer) return; await sleep(0); } }

  async prepare(doc) {
    const vars = resolveParams(doc.params).vars;
    for (const f of doc.features) {
      if (f.type !== 'sketch' || f.suppressed) continue;
      if (!(f.cons || []).some((c) => c.expr != null && c.expr !== '')) continue;
      let r; try { r = await solveSketch(f, vars); } catch (e) { r = { ok: false, errors: [toErr(e)] }; }
      const msg = r.ok ? '' : (r.errors?.[0] ? errText(r.errors[0]) : t('err.solver.unsolved'));
      if (msg && this.problems[f.id] !== msg) toast(t('msg.sketch_update_failed', { name: f.name || f.id, msg }), true);
      this.problems[f.id] = msg;
    }
  }
  async rebuildDoc(doc, onProgress = null, cancellable = false) {
    await this.prepare(doc);
    if (!cancellable) return this.call('rebuild', onProgress ? { doc, progress: true } : { doc }, onProgress);
    const id = this._wid + 1; const p = this.call('rebuild', { doc, cancellable: true }); this._cancellable = id;
    try { return await p; } finally { if (this._cancellable === id) this._cancellable = null; }
  }

  async _rebuildTask(seq) {
    if (seq !== this._seq) return;
    const e = this.edit; const t0 = performance.now();
    clearTimeout(this._busyT); this._busyT = setTimeout(() => { this.busy = true; this.C.renderStatus(); }, 300);
    try {
      // WP-02 dilim 5: var olan eskiz düzenlenirken model eskizin anına geri sarılı gösterilir (sağdakiler "bekliyor")
      const ss = this.sketchSession;
      if (ss && !ss.isNew && !(e && !e.closed)) {
        const d = this.cloneDoc(this.doc); d.rollback = ss.idx;
        const res = await this.rebuildDoc(d, null, true); if (seq !== this._seq) return; if (this.sketchSession === ss) this.applyResult(res, true);
        return;
      }
      if (e && !e.closed) {
        const err = e.validate();
        let full = null;
        // WP-10 devri: yalnız en son isteğin sonucu uygulanır (eski uzun hesap yeni düzenlemeden sonra dönerse atılır)
        if (!err) { full = await this.rebuildDoc(e.makeDoc(e.at + 1), null, true); if (seq !== this._seq) return; e.setStatus(full.status[e.draft.id]); this.lastMs = performance.now() - t0; }
        else e.setStatus({ ok: false, error: err });
        if (e.pickBase() || err) { const base = await this.rebuildDoc(e.makeDoc(e.at), null, true); if (seq !== this._seq) return; this.applyResult(base, true); } else this.applyResult(full, true);
        // WP-02 "Son hali göster": aynı değişiklik arka planda sona kadar hesaplanır (önbellek yalnız değişen işlemden sonrasını
        // yeniden hesaplar); yeni bir değişiklik gelirse eski sonuç atılır.
        if (this.showFinal && !err && e.hasAfter() && seq === this._seq && !e.closed) {
          const rb = this.doc.rollback; const fin = await this.rebuildDoc(e.makeDoc(rb == null ? null : rb + (e.isNew ? 1 : 0)), null, true);
          if (seq === this._seq && !e.closed && this.edit === e) this.setFinal(fin);
        } else if (!this.showFinal) this.setFinal(null);
        return;
      }
      const doc = this.doc; const sw = this._sweepNext; this._sweepNext = null;
      // WP-02 güncelleme süpürmesi: çekirdek her işlemi bitirdikçe şerit soldan sağa durumunu alır
      if (sw) { this.sweep = { at: sw.at, base: this.sums ? new Map(this.sums) : new Map(), done: new Map(), order: [], cur: doc.features[sw.at]?.id ?? null }; this.C.renderTimeline(); }
      const res = await this.rebuildDoc(doc, sw ? (p) => this.onSweep(p) : null);
      if (seq !== this._seq) { this.staleDropped = (this.staleDropped || 0) + 1; return; } // daha yeni istek var: eski sonuç uygulanmaz
      this.lastMs = performance.now() - t0; if (doc.rollback == null) this.lastFullMs = this.lastMs;
      const done = this.sweep; this.sweep = null;
      this.applyResult(res, false);
      if (sw && done) this.sweepSummary(res, done);
    } catch (err) {
      if (err?.code === 'rebuild.cancelled') this.cancelStats.done++;
      else if (!this._cancelled) { console.error(err); toast(t('msg.rebuild_failed', { msg: errText(err) }), true); }
    } finally {
      clearTimeout(this._busyT); if (this.busy) { this.busy = false; this.C.renderStatus(); }
      if (this.sweep && seq === this._seq) { this.sweep = null; this.C.renderTimeline(); }
    }
  }
  // ------------------------------------------------------------ WP-02: düzenleme akışı (son hali, süpürme, özet)
  onSweep(p) {
    const S = this.sweep; if (!S) return;
    S.done.set(p.id, p); S.order.push(p.id);
    S.cur = this.doc.features[p.i + 1]?.id ?? null;
    if (!this._sweepRaf) this._sweepRaf = requestAnimationFrame(() => { this._sweepRaf = 0; if (this.sweep) this.C.renderTimeline(); });
  }
  // Tek özet bildirimi: "N işlem güncellendi · c değişti · w uyarı · e hata: Ad — neden" + Onar
  sweepSummary(res, S) {
    const feats = this.doc.features.slice(S.at, this.doc.rollback ?? undefined).filter((f) => res.status[f.id]);
    const errs = feats.filter((f) => res.status[f.id].ok === false);
    const warns = feats.filter((f) => res.status[f.id].ok !== false && (res.featInfo?.[f.id]?.warn || []).length);
    const ch = feats.filter((f) => this.marks.changed.has(f.id));
    const sum = { n: feats.length, c: ch.length, w: warns.length, e: errs.length, order: S.order.slice(), errors: errs.map((f) => f.id), changed: ch.map((f) => f.id) };
    const first = errs[0];
    // WP-02: sıra değişikliği sonucu değiştirdiyse açık uyarı + tek tıkla geri al
    const mc = this._moveCheck; this._moveCheck = null; let mv = null;
    if (mc) { const b = this.modelSig(res); if (Math.abs(b.vol - mc.vol) > 1e-6 * Math.max(1, mc.vol) || b.faces !== mc.faces || b.n !== mc.n) mv = { a: mc.vol, b: b.vol, fa: mc.faces, fb: b.faces }; }
    sum.moveChanged = mv;
    const text = () => [tn('hs.sum_n', sum.n), tn('hs.sum_c', sum.c), tn('hs.sum_w', sum.w), tn('hs.sum_e', sum.e)].join(' · ') + (first ? t('hs.summary_err', { name: first.name || first.id, msg: errText(res.status[first.id].error) }) : '');
    sum.text = text() + (mv ? ' · ' + t('hs.move_changed', { a: fmt(mv.a, 1), b: fmt(mv.b, 1) }) : ''); this.lastSummary = sum;
    // tek özet: yenisi öncekinin yerine geçer
    this._sumToast?.querySelector('[data-testid=toast-close]')?.click();
    const acts = []; if (mv) acts.push({ label: t('hs.undo_move'), run: () => this.undo() }); if (first) acts.push({ label: t('hs.repair'), run: () => this.repairFeature(first.id) }); // ikisi birlikte: sıra değişimi hem modeli değiştirdi hem hata verdiyse ikisi de çıkar
    const act = acts.length ? { actions: acts } : {};
    this._sumToast = toast(sum.text, { kind: errs.length ? 'err' : warns.length || mv ? 'warn' : 'ok', title: t('hs.summary_title'), ...(mv ? { ms: 0 } : {}), ...act });
    this._sumToast.setAttribute('data-testid', 'hist-summary');
    let host = document.getElementById('hist-summary-host');
    if (!host) { host = h('div', { id: 'hist-summary-host', class: 'toasts', 'aria-live': 'polite' }); document.getElementById('viewwrap').append(host); }
    host.append(this._sumToast); const root = document.getElementById('toast'); if (root && !root.children.length) root.classList.add('hidden');
  }
  // WP-02 dilim 5 onarım kipi: hatalı işlem, kaybolan başvuruları (son geçerli konumu hayalet çizgi, yakın adaylar)
  // gösterilerek açılır; kullanıcı yeni kenarı/yüzü seçer ya da işlemi bastırır/siler; birden çok hatada "Sonraki hata".
  async repairFeature(id) {
    const i = this.doc.features.findIndex((f) => f.id === id); if (i < 0 || this.guard()) return;
    const f = this.doc.features[i]; this.selectFeature(id);
    if (f.type === 'import') return this.editFeature(i);
    let info = null; try { info = await this.query('repairInfo', { id }); } catch (e) { console.error(e); }
    // WP-08 devir (f): yüz üzerine kurulu eskizin kayıp yüz başvurusu onarım kipinde yeniden seçilir; başka sorunda eskiz düzenleyici açılır
    if (f.type === 'sketch' && !(f.plane?.kind === 'face' && info?.lost?.some((L) => String(L.field).startsWith('plane')))) return this.editFeature(i);
    if (this.guard()) return; this.endTool(true);
    new FeaturePanel(this, clone(f), i, info).open(); this.C.renderAll();
  }
  setShowFinal(on) { this.showFinal = !!on; if (!on) this.setFinal(null); if (this.edit && !this.edit.closed) this.previewSoon(0); this.C.renderTimeline(); this.C.renderBrowser(); }
  // son modelin yarı saydam görüntüsü (görünüm üstünde ayrı grup; seçilemez)
  setFinal(fin) {
    this.finalResult = fin || null;
    const vp = this.viewport; if (!vp) return;
    if (this._ghost) { vp.scene.remove(this._ghost); this._ghost.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); this._ghost = null; }
    if (fin) {
      const g = new THREE.Group(); g.name = 'final-ghost'; g.renderOrder = 5;
      for (const b of fin.bodies) {
        if (this.hiddenBodies.has(b.id)) continue;
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(b.vertices, 3)); geo.setIndex(new THREE.BufferAttribute(b.triangles, 1));
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COL.sel, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(b.lines, 3));
        const l = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: COL.sel, transparent: true, opacity: 0.55, depthWrite: false }));
        m.userData = l.userData = { ghost: b.id }; g.add(m, l);
      }
      vp.scene.add(g); this._ghost = g;
    }
    vp.dirty = true; this.C.renderTimeline(); this.C.renderBrowser();
  }
  applyResult(res, preview) {
    const had = (this.result?.bodies.length || 0) > 0;
    if (!preview) this.updateMarks(res);
    this.result = res; this.stale = false;
    this.viewport.setBodies(res.bodies, this.hiddenBodies);
    this.viewport.setCPlanes(this.cplaneList(res)); // İE-007: yapı düzlemleri
    this.selection = this.selection.filter((s) => s.kind === 'body' && res.bodies.some((b) => b.id === s.body));
    this.refreshSketches();
    if (this.needFit && res.bodies.length) { this.viewport.fit(); this.needFit = false; }
    else if (!had && res.bodies.length && !this.sketchSession) this.viewport.fit();
    if (!this.edit && !this.tool && !this.sketchSession) this.viewport.setSelection(this.selection);
    this.cam.onResult(); this.drawing.onResult(); this.C.renderAll();
    if (this.edit && !this.edit.closed) this.edit.afterResult();
    this.paintSel();
    if (!this.sketchSession) {
      const bad = this.doc.features.find((f) => res.status[f.id] && res.status[f.id].ok === false);
      this.setLeft(this.edit ? () => t('st.preview') : bad ? () => t('st.error', { name: bad.name || bad.id, msg: errText(this.result?.status[bad.id]?.error) }) : () => t('st.ready'));
    }
  }
  // İE-007: sonuçtaki yapı düzlemleri → görünüm listesi (ad: özellik adı)
  cplaneList(res = this.result) {
    const out = []; for (const [id, v] of Object.entries(res?.planes || {})) { if (!v?.plane) continue; const f = this.doc.features.find((x) => x.id === id); out.push({ id, name: f?.name || id, plane: v.plane }); }
    return out;
  }
  cplaneName(id) { const f = this.doc.features.find((x) => x.id === id); return f?.name || id; }
  refreshSketches() {
    const res = this.result; if (!res) return;
    const list = this.doc.features.filter((f) => f.type === 'sketch').map((f) => ({ id: f.id, sk: f, plane: res.sketches?.[f.id]?.plane, visible: !this.hiddenSketches.has(f.id) && !(this.sketchSession && this.sketchSession.draft.id === f.id) }));
    this.viewport.setSketches(this.mode === 'cam' ? [] : list);
  }
  setHint(text) { $('#hint-text').textContent = text || ''; $('#hint').classList.toggle('hidden', !text); }
  // Durum satırı: metin ya da dil değişince yeniden çağrılacak işlev
  setLeft(v) { this._left = v; this.C.setLeft(typeof v === 'function' ? v() : v || ''); }
  refreshLeft() { if (typeof this._left === 'function') this.C.setLeft(this._left()); }
  // Bağlama göre ipucu satırını yeniden yazar (dil değişince)
  refreshHint() {
    if (this.edit && !this.edit.closed) this.edit.updateViewport();
    else if (this.sketchSession) { /* sketcher.relang() ipucunu kendisi yazar */ }
    else if (this.tool === 'newsketch') this.setHint(t('hint.sketch_plane'));
    else if (this.tool === 'measure') this.setHint(t('hint.measure'));
    else if (this.tool === 'props') this.setHint(t('hint.props'));
  }
  refreshToolbar() { this.C.renderToolbar(); }
  selectionCount() { if (this.edit) return this.edit.activeSel ? this.edit.getSel(this.edit.activeSel).length : 0; if (this.tool === 'measure') return this.measureSel.length; return this.selection.length; }
  get planesVisible() { return this.viewport?.planesVisible; }
  togglePlanes() { this.viewport.setPlanesVisible(!this.viewport.planesVisible); this.C.renderAll(); }

  // ------------------------------------------------------------ gövde / seçim
  bodyName(id) {
    const b = this.result?.bodies.find((x) => x.id === id);
    return this.doc.bodyNames?.[id] || b?.name || (b?.auto ? this.autoBodyName(b.auto) : id);
  }
  // Çekirdekten gelen varsayılan gövde adı ({code, params}) geçerli dilde yazılır.
  autoBodyName(a) {
    if (typeof a === 'string') return a;
    const p = { ...(a.params || {}) }; if (p.base != null) p.base = this.autoBodyName(p.base);
    return t('body.' + a.code, p);
  }
  selectBody(id) { if (this.edit || this.sketchSession || this.tool) return; this.selection = [{ kind: 'body', body: id }]; this.viewport.setSelection(this.selection); this.C.renderBrowser(); this.C.renderStatus(); }
  toggleBody(id) { this.hiddenBodies.has(id) ? this.hiddenBodies.delete(id) : this.hiddenBodies.add(id); if (this.result) this.viewport.setBodies(this.result.bodies, this.hiddenBodies); this.C.renderBrowser(); }
  toggleSketch(id) { this.hiddenSketches.has(id) ? this.hiddenSketches.delete(id) : this.hiddenSketches.add(id); this.refreshSketches(); this.C.renderBrowser(); }
  async renameBody(id) {
    const nm = await promptText(t('dlg.rename_body'), this.bodyName(id)); if (!nm) return;
    const base = id.split('#')[0]; const f = this.doc.features.find((x) => x.id === base && id === base && ['extrude', 'revolve', 'primitive'].includes(x.type));
    await this.commit((d) => {
      if (f) { d.features.find((x) => x.id === base).bodyName = nm; if (d.bodyNames) delete d.bodyNames[id]; }
      else { d.bodyNames = d.bodyNames || {}; d.bodyNames[id] = nm; }
    });
    // ad özelliğe yazıldıysa UI haritasını da eşitle
  }
  onPick(hit, ev) {
    if (this.sketchSession) return;
    if (this.mode === 'cam') { this.cam.ops.onPick(hit, ev); return; }
    if (this.edit) { this.edit.onPick(hit, ev); return; }
    if (this.tool) { this.toolPick(hit, ev); return; }
    if (hit && hit.kind === 'body') {
      if (ev && ev.shiftKey) { const i = this.selection.findIndex((s) => s.body === hit.body); if (i >= 0) this.selection.splice(i, 1); else this.selection.push({ kind: 'body', body: hit.body }); }
      else this.selection = [{ kind: 'body', body: hit.body }];
    } else this.selection = [];
    this.viewport.setSelection(this.selection); this.C.renderBrowser(); this.C.renderStatus();
  }
  idleView() { this.viewport.pickPlanes = false; this.viewport.setFilter({ body: true }); this.viewport.setSelection(this.selection); this.viewport.setRegions(null, null); }

  // ------------------------------------------------------------ özellik ekle / düzenle / sil
  ctx() { return { doc: this.doc, bodies: this.result?.bodies || [], sketches: this.doc.features.slice(0, this.doc.rollback ?? undefined).filter((f) => f.type === 'sketch') }; }
  startFeature(type, kind) {
    if (this.guard()) return; this.endTool(true);
    const ctx = this.ctx();
    if (['extrude', 'revolve'].includes(type) && !ctx.sketches.length) { toast(t('msg.need_sketch'), true); return; }
    if (type === 'hole' && !ctx.sketches.length) { toast(t('msg.need_sketch_hole'), true); return; }
    if (['sweep', 'loft'].includes(type) && !ctx.sketches.length) { toast(t('msg.need_sketch'), true); return; }
    if (['fillet', 'chamfer', 'shell', 'combine', 'move', 'split', 'splitface', 'faceop', 'draft', 'vfillet', 'thread', 'rib'].includes(type) && !ctx.bodies.length) { toast(t('msg.need_body'), true); return; }
    if (type === 'combine' && ctx.bodies.length < 2) { toast(t('msg.need_two_bodies'), true); return; }
    const draft = { id: newId(this.doc, type, kind), type, name: autoName(this.doc, type, kind), ...defaults(type, kind, ctx) };
    new FeaturePanel(this, draft, null).open();
    this.C.renderToolbar();
  }
  editFeature(i) {
    if (this.guard()) return; const f = this.doc.features[i]; if (!f) return; this.endTool(true);
    if (f.type === 'sketch') return this.editSketch(i);
    if (f.type === 'import') { toast(t('msg.import_noedit')); return; }
    // kaybolan başvuru hatası olan işlem onarım kipinde açılır
    const st = this.result?.status?.[f.id]; if (st && st.ok === false && /^ref\./.test(st.error?.code || '')) return this.repairFeature(f.id);
    this.selFeature = f.id; new FeaturePanel(this, clone(f), i).open(); this.C.renderAll();
  }
  async commitFeature(panel) {
    const d = clone(panel.draft); this._sweepNext = { at: panel.at }; this.setFinal(null);
    await this.commit((doc) => {
      if (panel.isNew) { doc.features.splice(panel.at, 0, d); if (doc.rollback != null) doc.rollback = panel.at + 1; } else doc.features[panel.idx] = d;
    });
    this.selFeature = d.id; this.idleView(); this.C.renderAll();
  }
  endEdit() { this.idleView(); this.C.renderAll(); return this.requestRebuild(); }
  selectFeature(id) {
    this.selFeature = id; this.selAnchor = null; this.selGroup = null;
    // kapalı gruptaki işlem seçilince grup açılır (hata gezintisi, Onar)
    const g = id && groupOf(this.doc, id); if (g && !this.groupOpen.has(g.id)) this.groupOpen.add(g.id);
    this.C.renderTimeline(); this.C.renderBrowser(); this.paintSel();
  }
  // WP-02 dilim 5: seçili işlemin ürettiği yüzler 3B'de hafifçe boyanır (düzenleme/eskiz/İmalat dışında)
  async paintSel() {
    const id = this.selFeature; const vp = this.viewport; const seq = ++this._paintSeq;
    if (!vp) return;
    if (!id || this.edit || this.sketchSession || this.mode !== 'design') { paintFaces(vp, []); this.painted = null; return; }
    let list = []; try { list = await this.query('featureFaces', { id }); } catch (e) { list = []; }
    if (seq !== this._paintSeq || this.selFeature !== id || this.edit || this.sketchSession || this.mode !== 'design') return;
    this.painted = { id, n: paintFaces(vp, list) };
  }
  // "Değişti": son kesinleşmiş sonuca göre özeti (featInfo.sum) değişen işlemler. Ön izleme bu karşılaştırmayı bozmaz.
  updateMarks(res) {
    const info = res?.featInfo || {}; const prev = this.sums;
    const sums = new Map(Object.entries(info).map(([id, x]) => [id, x.sum]));
    if (prev) {
      const ch = [...sums].filter(([id, sm]) => prev.has(id) && prev.get(id) !== sm).map(([id]) => id);
      // belge değişmeden gelen yeniden hesap (iptal, dil, sona git) önceki işaretleri silmez
      if (ch.length || this._rev !== this._marksRev) { this.marks.changed = new Set(ch); this._marksRev = this._rev; }
    } else this._marksRev = this._rev;
    // geri sarılmışken hesaplanmayan işlemlerin son özeti korunur (sona dönünce yanlış "değişti" çıkmaz)
    if (prev) for (const [id, sm] of prev) if (!sums.has(id) && this.doc.features.some((f) => f.id === id)) sums.set(id, sm);
    this.sums = sums;
  }
  clearMarks() { this.marks.changed.clear(); this.C.renderBrowser(); this.C.renderTimeline(); }
  toggleHistOpen(id) { if (this.histOpen.has(id)) this.histOpen.delete(id); else this.histOpen.add(id); this.C.renderBrowser(); }
  async renameFeature(i) { const f = this.doc.features[i]; const nm = await promptText(t('dlg.rename_feature'), f.name || featLabel(f)); if (!nm) return; await this.commit((d) => { d.features[i].name = nm; }); }
  async toggleSuppress(i) { await this.commit((d) => { const f = d.features[i]; if (f.suppressed) delete f.suppressed; else f.suppressed = true; }); }
  async rollbackTo(n) { if (this.guard()) return; await this.commit((d) => { d.rollback = n == null || n >= d.features.length ? null : n; }); }
  async deleteFeature(i) {
    if (this.guard()) return; const f = this.doc.features[i]; if (!f) return;
    const deps = dependents(this.doc, f);
    if (deps.length) {
      const ok = await confirmBox(t('dlg.del_title'), t('dlg.del_body', { name: f.name || f.id, list: deps.map((x) => x.name || x.id).join('\n• ') }), t('dlg.del_yes'));
      if (!ok) return;
    }
    await this.commit((d) => {
      const before = { ...d, features: d.features.slice() }; // grup aralığı silme öncesi sıraya göre çözülür
      d.features.splice(i, 1); if (d.rollback != null) { if (i < d.rollback) d.rollback--; if (d.rollback >= d.features.length) d.rollback = null; }
      // grup kalan üyelerle sürer (sınır komşu üyeye kayar); tek üyesi silinen grup düşer; grup kalmazsa alan kaldırılır
      if (Array.isArray(d.groups)) { const g = fixGroups(before, d.features); if (g && g.length) d.groups = g; else delete d.groups; }
    });
    if (this.selFeature === f.id) this.selFeature = null;
    this.C.renderAll();
  }

  // ------------------------------------------------------------ WP-02 dilim 4: sıra değiştirme
  // Bağımlılığı bozacak taşıma yapılmaz; neden bildirilir. Taşıma sonrası değişen ilk konumdan süpürme + özet.
  // geçmiş bildirimi: görünüm alanının sol altında (Geçmiş listesini örtmez); ekran okuyucuya da bildirilir
  histNote(msg, kind = 'err') {
    const el = toast(msg, { kind, ms: 5000 }); el.setAttribute('data-testid', 'hist-note');
    let host = document.getElementById('hist-note-host');
    if (!host) { host = h('div', { id: 'hist-note-host', class: 'toasts', 'aria-live': 'polite' }); document.getElementById('viewwrap').append(host); }
    host.replaceChildren(el); const root = document.getElementById('toast'); if (root && !root.children.length) root.classList.add('hidden');
    this.C.announce(msg); return el;
  }
  // son modelin özeti (taşıma öncesi/sonrası karşılaştırma): toplam hacim ve yüz sayısı
  modelSig(res) { const B = res?.bodies || []; return { vol: B.reduce((a, b) => a + (b.volume || 0), 0), faces: B.reduce((a, b) => a + (b.nFaces || 0), 0), n: B.length }; }
  sensWhy(ids) { const nm = ids.map((id) => { const f = this.doc.features.find((x) => x.id === id); return f ? f.name || featLabel(f) : id; }); return t('hs.move_sensitive', { list: nm.join(', ') }); }
  moveWhy(why) { const nm = (id) => { const f = this.doc.features.find((x) => x.id === id); return f ? f.name || featLabel(f) : id; }; return t('hs.move_blocked', { a: nm(why.feat), b: nm(why.dep) }); }
  async moveFeature(i, to, unit = null) {
    if (this.guard()) return false; const f = this.doc.features[i]; if (!f) return false;
    const p = planMove(this.doc, i, to, this.result?.status || {}, null, unit);
    if (!p.ok) { this.histNote(this.moveWhy(p.why)); return false; }
    if (p.noop) return true;
    this._sweepNext = { at: p.at }; this._moveCheck = this.modelSig(this.result);
    const done = this.commit((d) => { d.features = p.features; d.rollback = p.rollback; if (p.groups !== undefined) d.groups = p.groups; });
    this.selFeature = f.id; this.C.renderAll();
    const k = this.doc.features.findIndex((x) => x.id === f.id);
    this.C.announce(t('hs.moved', { name: f.name || featLabel(f), n: k + 1, total: this.doc.features.length }));
    await done; this._moveCheck = null; return true;
  }

  // ------------------------------------------------------------ WP-02 dilim 4: gruplar (belgede isteğe bağlı `groups`)
  toggleGroup(gid) { if (this.groupOpen.has(gid)) this.groupOpen.delete(gid); else this.groupOpen.add(gid); this.C.renderTimeline(); this.C.renderBrowser(); }
  // WP-08 devir (e): grup bütün olarak taşınır (to: özgün dizideki aralık)
  async moveGroup(gid, to) { const u = groupUnit(this.doc, gid); if (!u.length) return false; return this.moveFeature(u[0], to, u); }
  async createGroup(ids) {
    if (this.guard()) return null; const F = this.doc.features; const pos = ids.map((id) => F.findIndex((f) => f.id === id)).filter((i) => i >= 0); if (!pos.length) return null;
    const a = Math.min(...pos.flatMap((i) => moveUnit(this.doc, i))), b = Math.max(...pos);
    if (groupRanges(this.doc).some((r) => !(b < r.a || a > r.b))) { this.histNote(t('hs.group_overlap')); return null; }
    const used = new Set((this.doc.groups || []).map((g) => g.id)); let n = 1; while (used.has('g' + n)) n++;
    const nm = await promptText(t('hs.group_prompt'), t('hs.group_new_name', { n })); if (!nm) return null;
    const g = { id: 'g' + n, name: nm, first: F[a].id, last: F[b].id };
    this.commitMeta((d) => { d.groups = [...(Array.isArray(d.groups) ? d.groups : []), g]; });
    this.selAnchor = null; this.selFeature = null; this.selGroup = g.id; this.C.renderAll(); this.C.announce(t('hs.grouped', { name: nm, n: b - a + 1 }));
    return g.id;
  }
  async renameGroup(gid) {
    const g = (this.doc.groups || []).find((x) => x.id === gid); if (!g || this.guard()) return;
    const nm = await promptText(t('hs.group_prompt'), g.name || gid); if (!nm) return;
    this.commitMeta((d) => { const x = d.groups.find((y) => y.id === gid); if (x) x.name = nm; });
  }
  async ungroup(gid) {
    if (this.guard() || !(this.doc.groups || []).some((x) => x.id === gid)) return;
    this.commitMeta((d) => { d.groups = d.groups.filter((y) => y.id !== gid); if (!d.groups.length) delete d.groups; });
    this.groupOpen.delete(gid); if (this.selGroup === gid) this.selGroup = null; this.C.renderAll();
  }

  // ------------------------------------------------------------ sketch
  async ensureSketcher() {
    if (this.sketcher) return this.sketcher;
    const loader = SKETCHER['./sketcher.js'];
    if (!loader) throw new KErr('sketcher_missing');
    const mod = await loader();
    this.sketcher = new mod.Sketcher({ viewport: this.viewport, overlayEl: $('#overlay'), getVars: () => this.vars(), setHint: (x) => this.setHint(x), setStatus: (x) => this.setLeft(x), onChange: () => this.onSketchChange(), onRequestFinish: () => this.finishSketch(), getBodies: () => [...this.viewport.bodies.values()].filter((b) => b.grp.visible).map((b) => b.data) });
    return this.sketcher;
  }
  startSketch() {
    if (this.guard()) return; if (this.tool === 'newsketch') { this.endTool(); return; }
    this.endTool(true); this.tool = 'newsketch';
    if (!this.viewport.planesVisible) this.viewport.setPlanesVisible(true);
    this.viewport.pickPlanes = true; this.viewport.setFilter({ face: true });
    this.setHint(t('hint.sketch_plane')); this.C.renderAll();
  }
  async beginSketch(draft, plane, idx) {
    try { await this.ensureSketcher(); }
    catch (e) { console.error(e); this.endTool(); toast(t('msg.sketcher_failed', { msg: errText(e) }), true); return; }
    this.endTool(true);
    this.sketchSession = { draft, idx, isNew: idx == null, plane };
    this.viewport.pickPlanes = false; this.viewport.setFilter({}); this.viewport.setRegions(null, null); this.viewport.setSelection([]);
    this.refreshSketches();
    this.sketchPanel = new SketchPanel(this, this.sketchSession); this.sketchPanel.render();
    this.sketcher.start(clone(draft), plane);
    // boş sketch'te sığdır çok yakın olur: en az ~120 mm'lik alan göster
    const vp = this.viewport; if (vp.bbox().getSize(new THREE.Vector3()).length() < 60) { vp.camera.zoom = 1; vp.camera.top = 60; vp.camera.bottom = -60; vp.resize(); vp.controls.update(); vp.dirty = true; }
    this.C.renderAll();
  }
  planeOf(spec) { return basePlane(spec.name, evalExpr(spec.offset ?? 0, this.vars())); }
  async editSketch(i) {
    const f = this.doc.features[i]; this.selFeature = f.id;
    let plane = this.result?.sketches?.[f.id]?.plane;
    if (!plane && f.plane?.kind === 'plane') plane = this.result?.planes?.[f.plane.id]?.plane; // İE-007
    if (!plane && f.plane?.kind === 'base') { try { plane = this.planeOf(f.plane); } catch (e) { toast(t('msg.offset_failed', { msg: errText(e) }), true); return; } }
    if (!plane) { toast(t('msg.sketch_not_computed'), true); return; }
    await this.beginSketch(clone(f), plane, i);
    if (this.sketchSession && !this.sketchSession.isNew) { this.C.renderAll(); this.requestRebuild(); }
  }
  onSketchChange() {
    if (this._skRaf) return;
    this._skRaf = requestAnimationFrame(() => {
      this._skRaf = 0; this.C.renderToolbar(); this.sketchPanel?.refresh();
      // durum çubuğundaki "Araç" bölümü etkin eskiz aracını izler (şeritle tutarlı; önceden Seç'te kalıyordu)
      const tool = this.sketchSession ? this.sketcher?.tool : null; if (tool !== this._skToolShown) { this._skToolShown = tool; this.C.renderStatus(); }
    });
  }
  sketchTool(id) { this.sketcher?.setTool(id); this.C.renderToolbar(); }
  sketchConstraint(type) { try { this.sketcher?.applyConstraint(type); } catch (e) { toast(t('msg.constraint_failed', { msg: errText(e) }), true); } this.onSketchChange(); }
  // WP-08: eskiz metni (uygulamayla gelen yazı tipi → kapalı çizgi konturları; çakışmalar çekirdekte temizlenir)
  async sketchText() {
    if (!this.sketchSession || !this.sketcher) return;
    // WP-21: seçili bir metin çizgisi varsa o metin, metin olarak yeniden düzenlenir (eski çizgiler aynı geri alma adımında yenisiyle değişir)
    const editing = this.sketcher.selectedText();
    const prev = editing ? { text: editing.text, height: String(editing.height), x: String(editing.x), y: String(editing.y), angle: String(editing.angle) } : this._textOpts || { text: '', height: '10', x: '0', y: '0', angle: '0' };
    const inp = (k, v, lbl) => { const e = h('input', { type: 'text', id: 'sktx-' + k, 'data-testid': 'sktx-' + k, value: v, autocomplete: 'off', spellcheck: 'false' }); return [e, h('div', { class: 'fld' }, h('label', { for: 'sktx-' + k, text: t(lbl) }), e)]; };
    const [eT, rT] = inp('text', prev.text, 'sk.text_text'), [eH, rH] = inp('height', prev.height, 'sk.text_size'), [eX, rX] = inp('x', prev.x, 'fld.pos_x'), [eY, rY] = inp('y', prev.y, 'fld.pos_y'), [eA, rA] = inp('angle', prev.angle, 'fld.angle');
    const num = (e) => { try { return Number(evalExpr(e.value, this.vars())); } catch (x) { return NaN; } };
    let vals = null;
    eT.setAttribute('maxlength', String(TEXT_MAX));
    const msg = h('div', { class: 'callout err', role: 'alert', 'data-testid': 'sktx-msg', hidden: true });
    const say = (k, p) => { msg.textContent = t(k, p); msg.hidden = false; return false; };
    const ok = await modal({
      title: t(editing ? 'sk.text_edit_title' : 'sk.text_title'), content: h('div', {}, rT, rH, rX, rY, rA, msg, h('div', { class: 'note', text: t('sk.text_note') + ' ' + t('sk.text_max', { n: TEXT_MAX }) })),
      buttons: [{ label: t('common.ok'), cls: 'pri', value: true, check: () => {
        vals = { text: eT.value, height: num(eH), x: num(eX), y: num(eY), angle: num(eA) };
        if (!vals.text.trim()) return say('sk.text_empty');
        if ([...vals.text].length > TEXT_MAX) return say('sk.text_long', { n: TEXT_MAX });
        if (!(vals.height > 0) || ![vals.x, vals.y, vals.angle].every(Number.isFinite)) return say('sk.text_height');
        return true; } }, { label: t('common.cancel'), value: false }],
    });
    if (!ok || !vals) return;
    this._textOpts = { text: eT.value, height: eH.value, x: eX.value, y: eY.value, angle: eA.value };
    const r = await this.sketcher.insertText({ ...vals, replace: editing ? editing.id : null });
    toast(r.ok ? t('sk.text_done', { n: r.glyphs }) : r.msg || t('sk.text_failed'), !r.ok);
    this.onSketchChange();
  }
  sketchConstruction() { this.sketcher?.toggleConstruction(); this.onSketchChange(); }
  async setSketchOffset(expr) {
    const s = this.sketchSession; if (!s || s.draft.plane.kind !== 'base') return;
    try { const pl = basePlane(s.draft.plane.name, evalExpr(expr, this.vars())); await this.sketcher.idle(); const f = this.sketcher.stop(); Object.assign(s.draft, { points: f.points, ents: f.ents, cons: f.cons || [], seq: f.seq }); if (f.texts) s.draft.texts = f.texts; else delete s.draft.texts; if (f.underlay) s.draft.underlay = f.underlay; else delete s.draft.underlay; s.draft.plane.offset = expr; s.plane = pl; this.sketcher.start(clone(s.draft), pl); }
    catch (e) { toast(t('msg.offset_invalid', { msg: errText(e) }), true); }
  }
  async finishSketch() {
    const s = this.sketchSession; if (!s) return;
    try { await this.sketcher.idle(); } catch (e) { /* çözüm hatası zaten bildirildi */ }
    let warns = []; try { warns = this.sketcher.exitReport(); } catch (e) { /* bilgi amaçlı */ }
    const f = this.sketcher.stop() || s.draft;
    this.sketchSession = null; this.sketchPanel.close(); this.sketchPanel = null; this.setHint('');
    const merged = { ...s.draft, points: f.points, ents: f.ents, cons: f.cons || [], seq: f.seq }; if (f.texts) merged.texts = f.texts; else delete merged.texts; // WP-21: metin kayıtları
    if (f.underlay) merged.underlay = f.underlay; else delete merged.underlay; // WP-22a: eskiz altlığı
    this.idleView(); this.C.renderAll();
    if (s.isNew) {
      if (!merged.ents.length) { toast(t('msg.empty_sketch')); this.refreshSketches(); return; }
      const at = this.doc.rollback ?? this.doc.features.length;
      await this.commit((d) => { d.features.splice(at, 0, merged); if (d.rollback != null) d.rollback = at + 1; });
    } else { this._sweepNext = { at: s.idx }; await this.commit((d) => { d.features[s.idx] = merged; }); }
    this.selFeature = merged.id; this.setLeft(() => t('st.ready')); this.C.renderAll();
    if (warns.length) toast(t('sk.exit.title') + ' ' + warns.join(' · '));
  }
  cancelSketch() {
    const s = this.sketchSession; if (!s) return;
    try { this.sketcher.cancel(); } catch (e) { console.error(e); }
    this.sketchSession = null; this.sketchPanel?.close(); this.sketchPanel = null; this.setHint(''); this.setLeft(() => t('st.ready'));
    this.idleView(); this.refreshSketches(); this.C.renderAll();
    if (!s.isNew) this.requestRebuild(); // geri sarılı görünümden düzenleme öncesine
  }

  // ------------------------------------------------------------ inceleme araçları
  toggleTool(name) { if (this.tool === name) { this.endTool(); return; } this.startTool(name); }
  async startTool(name) {
    if (this.guard()) return; this.endTool(true); this.tool = name; this.measureSel = [];
    if (name === 'measure') {
      this.viewport.setFilter({ face: true, edge: true }); this.viewport.setSelection([]);
      this.setHint(t('hint.measure'));
      showBox(t('meas.title'), '<div class="note">' + t('meas.pick') + '</div>', () => this.endTool());
    } else if (name === 'props') {
      this.viewport.setFilter({ body: true });
      const vis = (this.result?.bodies || []).filter((b) => !this.hiddenBodies.has(b.id));
      const pre = this.selection.find((s) => s.kind === 'body')?.body || (vis.length === 1 ? vis[0].id : null);
      if (!vis.length) { toast(t('msg.need_body'), true); this.tool = null; this.C.renderToolbar(); return; }
      this.setHint(t('hint.props'));
      if (pre) await showProps(this, pre); else showBox(t('props.title'), '<div class="note">' + t('props.pick') + '</div>', () => this.endTool());
    }
    this.C.renderToolbar();
  }
  endTool(quiet) {
    const was = this.tool; this.tool = null; this.measureSel = [];
    if (was === 'measure' || was === 'props') hideBox();
    if (was) { this.idleView(); this.setHint(''); }
    if (!quiet) this.C.renderAll();
  }
  async toolPick(hit) {
    const tool = this.tool;
    if (tool === 'newsketch') {
      if (!hit) return;
      try {
        if (hit.kind === 'plane') { await this.beginSketch({ id: newId(this.doc, 'sketch'), type: 'sketch', name: autoName(this.doc, 'sketch'), plane: { kind: 'base', name: hit.name, offset: '0' }, points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [] }, basePlane(hit.name, 0), null); }
        else if (hit.kind === 'cplane') { // İE-007: yapı düzlemi
          const plane = this.result?.planes?.[hit.id]?.plane; if (!plane) { toast(t('msg.sketch_not_computed'), true); return; }
          await this.beginSketch({ id: newId(this.doc, 'sketch'), type: 'sketch', name: autoName(this.doc, 'sketch'), plane: { kind: 'plane', id: hit.id }, points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [] }, plane, null);
        }
        else if (hit.kind === 'face') {
          const ref = await this.describe(hit, 'face'); const plane = await this.query('facePlane', { ref });
          await this.beginSketch({ id: newId(this.doc, 'sketch'), type: 'sketch', name: autoName(this.doc, 'sketch'), plane: { kind: 'face', ref }, points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [] }, plane, null);
        }
      } catch (e) { toast(t('msg.sketch_face_failed', { msg: errText(e) }), true); }
      return;
    }
    if (tool === 'measure') {
      if (!hit || (hit.kind !== 'face' && hit.kind !== 'edge')) return;
      let d; try { d = await this.describe(hit, hit.kind); } catch (e) { toast(t('msg.measure_failed', { msg: errText(e) }), true); return; }
      const same = (x) => x.body === d.body && x.idx === d.idx && x.kind === d.kind;
      const at = this.measureSel.findIndex(same);
      if (at >= 0) this.measureSel.splice(at, 1); else { if (this.measureSel.length >= 2) this.measureSel = []; this.measureSel.push(d); }
      this.viewport.setSelection(this.measureSel.map((x) => ({ kind: x.kind, body: x.body, idx: x.idx })));
      await this.showMeasure(); this.C.renderStatus(); return;
    }
    if (tool === 'props') { if (hit && hit.kind === 'body') { this.selection = [{ kind: 'body', body: hit.body }]; this.viewport.setSelection(this.selection); await showProps(this, hit.body); } }
  }
  async showMeasure() {
    const [a, b] = this.measureSel;
    if (!a) { showBox(t('meas.title'), '<div class="note">' + t('meas.pick') + '</div>', () => this.endTool()); return; }
    let m = null; if (b) { try { m = await this.query('measure', { a, b }); } catch (e) { toast(t('msg.measure_failed', { msg: errText(e) }), true); } }
    const rows = measureRows(a, b, m || { distance: NaN, centerDistance: NaN, delta: [NaN, NaN, NaN] });
    showBox(t('meas.title'), '<table>' + rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') + '</table>', () => this.endTool());
  }
  async runInterference() {
    if (this.guard()) return; this.endTool(true);
    const ids = (this.result?.bodies || []).filter((b) => !this.hiddenBodies.has(b.id)).map((b) => b.id);
    if (ids.length < 2) { toast(t('msg.interf_need2')); return; }
    try {
      const r = await this.query('interference', { ids });
      const html = r.length ? '<table>' + r.map((x) => `<tr><td>${esc(this.bodyName(x.a))} ∩ ${esc(this.bodyName(x.b))}</td><td>${esc(fmt(x.volume, 3))} mm³</td></tr>`).join('') + '</table>' : '<div class="note ok-text">' + t('interf.none') + '</div>';
      showBox(t('interf.title'), (r.length ? `<div class="err">${t('interf.count', { n: r.length })}</div>` : '') + html, () => hideBox());
    } catch (e) { toast(t('msg.interf_failed', { msg: errText(e) }), true); }
  }
  toggleSection() {
    if (this.sectionPanel) { this.sectionPanel.close(); this.C.renderToolbar(); return; }
    if (this.guard()) return; this.endTool(true);
    if (!this.result?.bodies.length) { toast(t('msg.section_need_body')); return; }
    new SectionPanel(this).open(); this.C.renderToolbar();
  }
  openParams() { if (this.guard()) return; return paramsModal(this); }

  // ------------------------------------------------------------ dosya
  async confirmDiscard() {
    if (!this.dirty) return true;
    return confirmBox(t('dlg.discard_title'), t('dlg.discard_body'), t('dlg.discard_yes'), t('common.giveup'));
  }
  async newDoc() {
    if (this.guard()) return; if (!(await this.confirmDiscard())) return;
    await this.loadDoc(emptyDoc(), { reset: true }); this.viewport.view('iso', true);
    window.native?.docState('new'); this.clearRecovery();
  }
  fileBytes() { return new TextEncoder().encode(JSON.stringify({ app: APP_NAME, version: FILE_VERSION, doc: this.doc })); }
  // kind: 'doc' | 'step' | 'stl'. Electron'da yol HİÇ gönderilmez; ana süreç diyalog açar ya da bu oturumdaki geçerli belge yoluna yazar.
  async writeOut(bytes, defaultName, kind, saveAs) {
    if (window.native) return window.native.saveFile({ saveAs: !!saveAs, data: bytes, defaultName, kind });
    const a = h('a', { href: URL.createObjectURL(new Blob([bytes])), download: defaultName }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return defaultName;
  }
  async save(as = false) {
    if (this.sketchSession || this.edit) { toast(t('msg.finish_before_save')); return; }
    try {
      const name = (this.fileName || t('file.default_name')).replace(/\.mhnk$/i, '') + '.mhnk';
      const p = await this.writeOut(this.fileBytes(), name, 'doc', as || !this.filePath);
      if (!p) return;
      this.filePath = window.native ? p : null;  this.fileName = String(p).split(/[\\/]/).pop(); this.markDirty(false); toast(t('msg.saved', { name: this.fileName }));
      this.clearRecovery();
    } catch (e) { toast(t('msg.save_failed', { msg: errText(e) }), true); }
  }
  // kind: 'doc' | 'step' | 'stl' (Electron: ana süreç diyaloğu; tarayıcı: <input type=file>)
  async pickFile(accept, kind) {
    if (window.native) { const r = await window.native.openFile(kind); return r ? { name: r.name, path: kind === 'doc' ? r.name : null, data: new Uint8Array(r.data) } : null; }
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept, style: { display: 'none' } }); document.body.append(inp);
      inp.addEventListener('change', async () => { const f = inp.files[0]; inp.remove(); resolve(f ? { name: f.name, path: null, data: new Uint8Array(await f.arrayBuffer()) } : null); });
      inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
      inp.click();
    });
  }
  async openFile() {
    if (this.guard()) return; if (!(await this.confirmDiscard())) return;
    const f = await this.pickFile('.mhnk', 'doc'); if (!f) return;
    await this.openBytes(f.data, f.name, f.path);
  }
  // İçe aktarma özetlerini doğrula (hash alanı varsa)
  async verifyImports(doc) {
    for (const f of doc.features) {
      if (f.type !== 'import' || typeof f.hash !== 'string' || !f.hash) continue;
      let ok = false; try { ok = (await sha256Hex(unb64(f.data))) === f.hash; } catch (e) { ok = false; }
      if (!ok) throw new KErr('schema.hash_mismatch', { name: f.name || f.id });
    }
  }
  // Ham baytlardan belge: ŞEMA doğrulanır, sonra mevcut belge değiştirilir (hata olursa mevcut belge olduğu gibi kalır).
  async openBytes(bytes, name, path) {
    if (bytes.byteLength > LIMITS.fileBytes) { toast(t('msg.file_invalid', { msg: errText(new KErr('schema.file_too_big', { mb: Math.round(LIMITS.fileBytes / 1048576) })) }), true); return false; }
    let j; try { j = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { toast(t('msg.file_unreadable'), true); return false; }
    try {
      const env = checkEnvelope(j);
      validateDoc(j.doc, { byteLength: bytes.byteLength });
      await this.verifyImports(j.doc);
      if (env.newer && !(await confirmBox(t('dlg.newer_title'), t('msg.file_newer'), t('dlg.newer_yes'), t('common.giveup')))) return false;
    } catch (e) { toast(t('msg.file_invalid', { msg: errText(e) }), true); return false; }
    try { await this.loadDoc(j.doc, { name, path, reset: true }); }
    catch (e) { console.error(e); toast(t('msg.open_failed', { msg: errText(e) }), true); return false; }
    window.native?.docState('opened'); this.clearRecovery();
    toast(t('msg.opened', { name }));
    const bad = this.doc.features.filter((f) => this.result?.status[f.id]?.ok === false).length;
    if (bad) toast(t('msg.n_bad', { n: bad }), true);
    // O-044 (F-15): yeni ifade kuralıyla değeri değişen parametre/alan varsa açılışta bir kez bildirilir
    let ch = []; try { ch = changedByO044(j.doc); } catch (e) { ch = []; }
    this.lastO044 = ch; if (ch.length) toast(t('msg.o044_changed', { list: ch.slice(0, 8).join(', ') + (ch.length > 8 ? ' …' : '') }), { kind: 'info' });
    return true;
  }
  async importFile(format) {
    if (this.guard()) return;
    const f = await this.pickFile(format === 'step' ? '.step,.stp' : format === 'iges' ? '.igs,.iges' : '.stl', format); if (!f) return;
    // benzersiz kimlik + içerik özeti: önbellek, belge değişse de başka verinin geometrisini göstermez (S-02)
    const id = importId(this.doc); const nm = f.name.replace(/\.[^.]+$/, ''); const hash = await sha256Hex(f.data);
    const at = this.doc.rollback ?? this.doc.features.length;
    await this.commit((d) => { d.features.splice(at, 0, { id, type: 'import', name: nm, format, hash, data: b64(f.data) }); if (d.rollback != null) d.rollback = at + 1; });
    const st = this.result?.status[id];
    if (!st || st.ok === false) { await this.undo(); toast(t('msg.import_failed', { reason: st?.error ? errText(st.error) : t('msg.import_invalid', { fmt: format.toUpperCase() }) }), true); return; }
    this.needFit = true; this.viewport.fit(); toast(t('msg.imported', { name: nm }));
  }

  // ------------------------------------------------------------ DXF (yalnız sketch içinde)
  // Dosya seçimi her zaman <input type=file>: Electron ana süreci 'dxf' türünü bilmez (o dosya bu işin kapsamı dışında).
  pickTextFile(accept) {
    if (window.native) return window.native.openFile('dxf').then((r) => (r ? { name: r.name, text: new TextDecoder().decode(new Uint8Array(r.data)) } : null));
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept, style: { display: 'none' } }); document.body.append(inp);
      inp.addEventListener('change', async () => { const f = inp.files[0]; inp.remove(); resolve(f ? { name: f.name, text: await f.text() } : null); });
      inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
      inp.click();
    });
  }
  async importDxf() {
    if (!this.sketchSession || !this.sketcher) { toast(t('dxf.need_sketch')); return; }
    const f = await this.pickTextFile('.dxf'); if (!f) return;
    let parsed; try { parsed = parseDxf(f.text); } catch (e) { toast(t('dxf.bad_file', { msg: errText(e) }), true); return; }
    if (!parsed.ents.length) { toast(t('dxf.empty'), true); return; }
    const known = parsed.units.factor; let factor = known ?? 1;
    const unitOpts = [['1', 'mm'], ['10', 'cm'], ['1000', 'm'], ['25.4', 'inch'], ['304.8', 'foot']];
    const sel = h('select', { id: 'dxf-unit' }, unitOpts.map(([v, l]) => h('option', { value: v }, l)), h('option', { value: 'custom' }, t('dxf.custom')));
    sel.value = unitOpts.some(([v]) => +v === factor) ? String(factor) : 'custom';
    const custom = h('input', { type: 'text', id: 'dxf-factor', value: String(factor) });
    const ok = await modal({
      title: t('dxf.title'), content: h('div', {}, h('div', { class: 'note', text: known == null ? t('dxf.unit_unknown') : t('dxf.unit_found', { f: String(known) }) }),
        h('div', { class: 'fld' }, h('label', { text: t('dxf.unit') }), sel), h('div', { class: 'fld' }, h('label', { text: t('dxf.factor') }), custom), h('div', { class: 'note', text: t('dxf.counts', { n: parsed.ents.length }) })),
      buttons: [{ label: t('common.ok'), cls: 'pri', value: true, check: () => { const v = sel.value === 'custom' ? parseFloat(String(custom.value).replace(',', '.')) : +sel.value; if (!(v > 0)) return false; factor = v; return true; } }, { label: t('common.cancel'), value: false }],
    });
    if (!ok) return;
    const r = await this.sketcher.importDxf(parsed, factor);
    toast(r.ok ? t('dxf.imported', { n: r.rep.count, skipped: Object.values(r.rep.skipped).reduce((a, b) => a + b, 0) }) : r.msg, !r.ok);
  }
  async exportDxf(version) {
    if (!this.sketchSession || !this.sketcher) { toast(t('dxf.need_sketch')); return; }
    const out = this.sketcher.exportDxf(version);
    if (!out.count) { toast(t('dxf.nothing'), true); return; }
    const name = ((this.sketchSession.draft.name || 'Sketch') + '.dxf').replace(/[\\/:*?"<>|]/g, '_'); // i18n-ignore: dosya adı yedeği
    let saved = name;
    try { saved = await this.writeOut(new TextEncoder().encode(out.text), name, 'dxf', true); } catch (e) { toast(t('msg.save_failed', { msg: errText(e) }), true); return; }
    if (!saved) return;
    toast(t('dxf.exported', { n: out.count, name: String(saved).split(/[\\/]/).pop() }));
  }

  // ------------------------------------------------------------ otomatik kurtarma (S-06)
  // Değişiklik varsa (ve son yazmadan beri değiştiyse) kurtarma dosyasını yazar. 60 sn'de bir çağrılır.
  async recoveryTick() {
    if (!this.dirty || this._rev === this._recRev) return false;
    const rev = this._rev;
    try {
      const bytes = new TextEncoder().encode(JSON.stringify({ app: APP_NAME, version: FILE_VERSION, doc: this.doc, fileName: this.fileName }));
      await recovery.save(bytes); this._recRev = rev; this.lastAutosave = new Date(); this.C.renderStatus(); return true;
    } catch (e) { console.error('recovery save failed', e); return false; }
  }
  clearRecovery() { this._recRev = -1; return recovery.clear().catch((e) => console.error('recovery clear failed', e)); }
  // Açılışta kurtarma dosyası varsa kullanıcıya sorar. true = kurtarıldı.
  async offerRecovery() {
    const bytes = await recovery.load().catch(() => null); if (!bytes) return false;
    let j; try { j = JSON.parse(new TextDecoder().decode(bytes)); checkEnvelope(j); validateDoc(j.doc, { byteLength: bytes.byteLength }); await this.verifyImports(j.doc); }
    catch (e) { await this.clearRecovery(); return false; } // bozuk yedek: sessizce at
    const nm = typeof j.fileName === 'string' && j.fileName ? j.fileName : t('doc.untitled');
    const yes = await confirmBox(t('rec.title'), t('rec.body', { name: nm }), t('rec.yes'), t('rec.no'));
    if (!yes) { await this.clearRecovery(); return false; }
    await this.loadDoc(j.doc, { name: typeof j.fileName === 'string' ? j.fileName : null, path: null, reset: true });
    window.native?.docState('new'); this.markDirty(true); toast(t('msg.recovered'));
    return true;
  }
  async exportFile(format, opts = null) {
    if (this.guard()) return;
    const ids = (this.result?.bodies || []).filter((b) => !this.hiddenBodies.has(b.id)).map((b) => b.id);
    if (!ids.length) { toast(t('msg.export_none'), true); return; }
    try {
      const names = Object.fromEntries(ids.map((id) => [id, this.bodyName(id)]));
      const data = await this.query('export', { format, ids, names, opts });
      const name = (this.fileName || t('file.default_name')).replace(/\.mhnk$/i, '') + '.' + format;
      const p = await this.writeOut(data, name, format, true);
      if (p) toast(t('msg.exported', { fmt: format.toUpperCase(), kb: Math.round(data.length / 1024) }));
    } catch (e) { toast(t('msg.export_failed', { msg: errText(e) }), true); }
  }

  // ------------------------------------------------------------ yardım pencereleri
  showShortcuts() {
    const rows = [['Ctrl+S', t('sc.save')], ['Ctrl+Z / Ctrl+Y', t('sc.undo')], ['F', t('sc.fit')], ['Enter / Esc', t('sc.panel')], [t('sc.k_rdrag'), t('sc.rotate')], [t('sc.k_mdrag'), t('sc.pan')], [t('sc.k_wheel'), t('sc.zoom')],
      ['L, R, C, A, D', t('sc.sketch_keys')], ['Delete', t('sc.sketch_del')], [t('sc.k_dbl'), t('sc.dbl')], [t('sc.k_rclick'), t('sc.rclick')]];
    return modal({ title: t('sc.title'), content: h('table', {}, rows.map(([k, v]) => h('tr', {}, h('td', { style: { fontWeight: 600, paddingRight: '18px', whiteSpace: 'nowrap' }, text: k }), h('td', { text: v })))), buttons: [{ label: t('common.close'), cls: 'pri', value: true }] });
  }
  showAbout() {
    const dep = (n) => String(pkg.dependencies[n] || '').replace('^', '');
    const el = (window.native?.versions?.electron) || (/Electron\/([\d.]+)/.exec(navigator.userAgent) || [])[1];
    const rows = [['Mihenk CAD/CAM', pkg.version], [t('about.kernel'), `${dep('replicad-opencascadejs')} — LGPL-2.1 / MIT`], [t('about.solver'), `${dep('@salusoft89/planegcs')} — LGPL-2.0+`], [t('about.view3d'), `r${THREE.REVISION} — MIT`], [t('about.shell'), `${el || '—'} — MIT`], [t('about.fonts'), 'Inter, JetBrains Mono — SIL OFL 1.1'], [t('about.pdf'), 'pdf.js (pdfjs-dist) — Apache-2.0']];
    return modal({ title: t('about.title'), content: h('div', {}, h('div', { class: 'note', text: t('about.tagline') }), h('table', {}, rows.map(([k, v]) => h('tr', {}, h('td', { text: k }), h('td', { style: { fontWeight: 600 }, text: v })))),
      h('div', { class: 'note', style: { marginTop: '8px' }, text: t('about.license') }), h('div', { class: 'note', 'data-testid': 'about-3p', text: t('about.third_party') })), buttons: [{ label: t('common.close'), cls: 'pri', value: true }] });
  }

  // ------------------------------------------------------------ klavye
  bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (modalOpen()) return;
      const tag = e.target.tagName; const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      const ctrl = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
      if (ctrl && k === 'k') { e.preventDefault(); this.C.openPalette(); return; }
      if (ctrl && e.key === ',') { e.preventDefault(); this.showSettings(); return; }
      if (ctrl && !e.shiftKey && k === 'n') { e.preventDefault(); this.C.run('new'); return; }
      if (ctrl && !e.shiftKey && k === 'o') { e.preventDefault(); this.C.run('open'); return; }
      if (ctrl && k === 's') { e.preventDefault(); this.save(e.shiftKey); return; }
      if (this.sketchSession) { if (this.sketcher && this.sketcher.handleKey(e)) e.preventDefault(); return; }
      if (ctrl && !inField && (k === 'z' || k === 'y')) { e.preventDefault(); (k === 'y' || e.shiftKey) ? this.redo() : this.undo(); return; }
      if (this.edit) {
        if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'TEXTAREA') { e.preventDefault(); this.edit.ok(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.edit.cancel(); }
        return;
      }
      if (e.key === 'Escape') { if (this.tool) this.endTool(); else if (this.sectionPanel) this.toggleSection(); return; }
      // WP-02: geri sarma işaretçisi Alt+←/→ bir adım, Alt+Home/End başa/sona
      if (e.altKey && !ctrl && !e.shiftKey && !inField && this.mode === 'design' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault(); const n = this.doc.features.length; const v = this.doc.rollback ?? n;
        this.C.stepMarker(e.key === 'Home' ? 0 : e.key === 'End' ? n : v + (e.key === 'ArrowLeft' ? -1 : 1)); return;
      }
      if (!inField && !ctrl && k === 'f') this.viewport.fit();
    });
  }
}

const app = new App();
window.app = app;
window.THREE_REV = THREE.REVISION;
app.init();
export default app;
