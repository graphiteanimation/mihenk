// AtolyeCAD uygulama çekirdeği: belge durumu, çekirdek (worker) köprüsü, geri al/yinele, dosya, araçlar.
import './style.css';
import pkg from '../../package.json';
import planegcsWasm from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import { Viewport, THREE } from './viewport.js';
import { initSolver, solveSketch } from './solver.js';
import { evalExpr, resolveParams } from '../shared/expr.js';
import { basePlane } from '../shared/vec.js';
import { h, $, toast, modal, modalOpen, promptText, confirmBox, esc, fmt } from './dom.js';
import { defaults, newId, autoName, featLabel, dependents } from './features.js';
import { initChrome } from './chrome.js';
import { FeaturePanel, SketchPanel, SectionPanel, paramsModal, showBox, hideBox, measureRows, showProps } from './panels.js';

// sketcher.js ayrı bir modüldür; yoksa ya da bozuksa model kipi çalışmaya devam eder.
const SKETCHER = import.meta.glob('./sketcher.js');

const clone = (v) => (Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (bytes) => { let s = ''; const C = 0x8000; for (let i = 0; i < bytes.length; i += C) s += String.fromCharCode.apply(null, bytes.subarray(i, i + C)); return btoa(s); };
const ACAD_FILTER = [{ name: 'AtolyeCAD belgesi', extensions: ['acad'] }];
const emptyDoc = () => ({ params: [], features: [], rollback: null });

class App {
  constructor() {
    this.doc = emptyDoc(); this.result = null; this.lastMs = null;
    this.undoStack = []; this.redoStack = []; this.dirty = false; this.fileName = null; this.filePath = null;
    this.selection = []; this.selFeature = null; this.hiddenBodies = new Set(); this.hiddenSketches = new Set();
    this.edit = null; this.tool = null; this.measureSel = []; this.sketchSession = null; this.sketcher = null; this.sectionPanel = null;
    this._seq = 0; this._chain = Promise.resolve(); this._timer = 0; this._pending = new Map(); this._wid = 0; this.needFit = true; this.regionCount = null;
    this.problems = {};
    this.ready = new Promise((res, rej) => { this._readyRes = res; this._readyRej = rej; });
    this.ready.catch(() => {});
  }

  // ------------------------------------------------------------ başlatma
  async init() {
    this.C = initChrome(this);
    try { this.viewport = new Viewport($('#viewport')); }
    catch (e) { $('#loading').innerHTML = '<span style="color:#c62828;max-width:420px;text-align:center">3B görünüm başlatılamadı (WebGL yok ya da kapalı). Ekran kartı sürücüsünü güncelleyin. Ayrıntı: ' + esc(e.message) + '</span>'; this._readyRej(e); return; }
    this.viewport.onPick = (hit, ev) => this.onPick(hit, ev);
    this.viewport.onCamera = () => {};
    this.C.renderViewBtns(); this.C.renderAll();
    this.bindKeys();
    if (!window.native) window.addEventListener('beforeunload', (e) => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } });
    try {
      this.startWorker();
      await Promise.all([this.call('ping'), initSolver(() => planegcsWasm)]);
      $('#loading').classList.add('hidden');
      this.setLeft('Hazır');
      this._readyRes(true);
    } catch (e) {
      $('#loading').innerHTML = '<span style="color:#c62828;max-width:460px;text-align:center">Geometri çekirdeği yüklenemedi: ' + esc(e.message || String(e)) + '<br>Uygulamayı kapatıp yeniden açın.</span>';
      this._readyRej(e); return;
    }
    if (window.native) { try { const f = await window.native.argvFile(); if (f) await this.openBytes(f.data, f.name, f.path); } catch (e) { toast('Dosya açılamadı: ' + e.message, true); } }
    this.updateTitle();
  }

  // ------------------------------------------------------------ çekirdek köprüsü
  startWorker() {
    this.worker = new Worker(new URL('../kernel/worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => {
      const { id, result, error } = ev.data; const p = this._pending.get(id); if (!p) return;
      this._pending.delete(id); error ? p.reject(new Error(error)) : p.resolve(result);
    };
    const die = (msg) => {
      for (const p of this._pending.values()) p.reject(new Error(msg)); this._pending.clear();
      try { this.worker.terminate(); } catch (e) { /* zaten kapalı */ }
      this.startWorker();
    };
    this.worker.onerror = (e) => { console.error('worker hatası', e); die('Geometri çekirdeği beklenmedik şekilde durdu; yeniden başlatıldı. İşlemi tekrar deneyin.'); };
  }
  call(cmd, args = {}) {
    return new Promise((resolve, reject) => { const id = ++this._wid; this._pending.set(id, { resolve, reject }); this.worker.postMessage({ id, cmd, args }); });
  }
  // sıralı sorgu: bekleyen yeniden hesaplamalardan sonra çalışır
  query(cmd, args) { const p = this._chain.then(() => this.call(cmd, args)); this._chain = p.catch(() => {}); return p; }
  describe(hit, kind) { return this.query('describe', { ref: { body: hit.body, idx: hit.idx }, kind: kind || hit.kind }); }

  // ------------------------------------------------------------ belge
  cloneDoc(d) { return clone(d); }
  vars() { try { return resolveParams(this.doc.params).vars; } catch (e) { return {}; } }
  normalize(d) {
    d = clone(d || {}); d.params = Array.isArray(d.params) ? d.params : []; d.features = Array.isArray(d.features) ? d.features : [];
    if (d.rollback === undefined || (typeof d.rollback === 'number' && d.rollback >= d.features.length)) d.rollback = null;
    for (const f of d.features) if (f.type === 'sketch') { f.points = f.points || {}; if (!f.points.O) f.points.O = { x: 0, y: 0, fixed: true }; f.ents = f.ents || []; f.cons = f.cons || []; }
    return d;
  }
  pushUndo() { this.undoStack.push(clone(this.doc)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0; }
  markDirty(v = true) { this.dirty = v; this.updateTitle(); }
  updateTitle() {
    const t = (this.dirty ? '• ' : '') + (this.fileName || 'Başlıksız') + ' — AtolyeCAD';
    document.title = t; this.C?.renderTitle(); if (window.native) { window.native.setTitle(t); window.native.setDirty?.(this.dirty); }
  }
  docTitle() { return (this.dirty ? '• ' : '') + (this.fileName || 'Başlıksız'); }

  // Belgeyi değiştir (geri alınabilir) ve yeniden hesapla.
  async commit(fn) {
    if (this.tool) this.endTool(true);
    this.pushUndo(); fn(this.doc);
    if (this.doc.rollback != null && this.doc.rollback >= this.doc.features.length) this.doc.rollback = null;
    this.markDirty(); this.C.renderAll();
    return this.requestRebuild();
  }
  guard() {
    if (this.edit || this.sketchSession) { toast('Önce açık işlemi Tamam ya da İptal ile bitirin.'); return true; }
    return false;
  }
  async undo() {
    if (this.sketchSession) { this.sketcher?.undo(); return; }
    if (this.guard()) return; if (!this.undoStack.length) { toast('Geri alınacak işlem yok.'); return; }
    this.endTool(true); this.redoStack.push(clone(this.doc)); this.doc = this.undoStack.pop(); this.markDirty(); this.C.renderAll(); return this.requestRebuild();
  }
  async redo() {
    if (this.sketchSession) { this.sketcher?.redo(); return; }
    if (this.guard()) return; if (!this.redoStack.length) { toast('Yinelenecek işlem yok.'); return; }
    this.endTool(true); this.undoStack.push(clone(this.doc)); this.doc = this.redoStack.pop(); this.markDirty(); this.C.renderAll(); return this.requestRebuild();
  }
  // Test ve dosya açma için: belgeyi tümden yükle
  async loadDoc(doc, { name = null, path = null } = {}) {
    if (this.edit) this.edit.cancel(); if (this.sketchSession) this.cancelSketch(); this.endTool(true); if (this.sectionPanel) this.sectionPanel.close();
    this.doc = this.normalize(doc); this.undoStack = []; this.redoStack = []; this.fileName = name; this.filePath = path; this.selection = []; this.selFeature = null;
    this.hiddenBodies.clear(); this.hiddenSketches.clear(); this.needFit = true; this.markDirty(false); this.C.renderAll();
    await this.requestRebuild();
  }

  // ------------------------------------------------------------ yeniden hesaplama
  requestRebuild() { const seq = ++this._seq; this._chain = this._chain.then(() => this._rebuildTask(seq)).catch((e) => console.error(e)); return this.whenIdle(); }
  previewSoon(ms = 250) { clearTimeout(this._timer); this._timer = setTimeout(() => { this._timer = 0; this.requestRebuild(); }, ms); }
  async flushPreview() { if (this._timer) { clearTimeout(this._timer); this._timer = 0; this.requestRebuild(); } return this.whenIdle(); }
  async whenIdle() { for (;;) { const c = this._chain; await c; if (c === this._chain && !this._timer) return; await sleep(0); } }

  async prepare(doc) {
    const vars = resolveParams(doc.params).vars;
    for (const f of doc.features) {
      if (f.type !== 'sketch' || f.suppressed) continue;
      if (!(f.cons || []).some((c) => c.expr != null && c.expr !== '')) continue;
      let r; try { r = await solveSketch(f, vars); } catch (e) { r = { ok: false, errors: [{ msg: e.message }] }; }
      const msg = r.ok ? '' : (r.errors?.[0]?.msg || 'kısıtlar çözülemedi');
      if (msg && this.problems[f.id] !== msg) toast(`"${f.name || f.id}" sketch'i güncellenemedi: ${msg}. Ölçüleri kontrol edin.`, true);
      this.problems[f.id] = msg;
    }
  }
  async rebuildDoc(doc) { await this.prepare(doc); return this.call('rebuild', { doc }); }

  async _rebuildTask(seq) {
    if (seq !== this._seq) return;
    const e = this.edit; const t0 = performance.now();
    try {
      if (e && !e.closed) {
        const err = e.validate();
        let full = null;
        if (!err) { full = await this.rebuildDoc(e.makeDoc(e.at + 1)); e.setStatus(full.status[e.draft.id]); this.lastMs = performance.now() - t0; }
        else e.setStatus({ ok: false, error: err });
        if (e.pickBase() || err) this.applyResult(await this.rebuildDoc(e.makeDoc(e.at)), true); else this.applyResult(full, true);
        return;
      }
      const doc = this.doc;
      const res = await this.rebuildDoc(doc);
      this.lastMs = performance.now() - t0;
      this.applyResult(res, false);
    } catch (err) {
      console.error(err); toast('Hesaplama başarısız: ' + (err.message || err) + ' — son geçerli model gösteriliyor.', true);
    }
  }
  applyResult(res, preview) {
    const had = (this.result?.bodies.length || 0) > 0;
    this.result = res;
    this.viewport.setBodies(res.bodies, this.hiddenBodies);
    this.selection = this.selection.filter((s) => s.kind === 'body' && res.bodies.some((b) => b.id === s.body));
    this.refreshSketches();
    if (this.needFit && res.bodies.length) { this.viewport.fit(); this.needFit = false; }
    else if (!had && res.bodies.length && !this.sketchSession) this.viewport.fit();
    if (!this.edit && !this.tool && !this.sketchSession) this.viewport.setSelection(this.selection);
    this.C.renderAll();
    if (this.edit && !this.edit.closed) this.edit.afterResult();
    if (!this.sketchSession) {
      const bad = this.doc.features.find((f) => res.status[f.id] && res.status[f.id].ok === false);
      this.setLeft(this.edit ? 'Önizleme' : bad ? `Hata: "${bad.name || bad.id}": ${res.status[bad.id].error}` : 'Hazır');
    }
  }
  refreshSketches() {
    const res = this.result; if (!res) return;
    const list = this.doc.features.filter((f) => f.type === 'sketch').map((f) => ({ id: f.id, sk: f, plane: res.sketches?.[f.id]?.plane, visible: !this.hiddenSketches.has(f.id) && !(this.sketchSession && this.sketchSession.draft.id === f.id) }));
    this.viewport.setSketches(list);
  }
  setHint(t) { $('#hint').textContent = t || ''; }
  setLeft(t) { this.C.setLeft(t); }
  refreshToolbar() { this.C.renderToolbar(); }
  selectionCount() { if (this.edit) return this.edit.activeSel ? this.edit.getSel(this.edit.activeSel).length : 0; if (this.tool === 'measure') return this.measureSel.length; return this.selection.length; }
  get planesVisible() { return this.viewport?.planesVisible; }
  togglePlanes() { this.viewport.setPlanesVisible(!this.viewport.planesVisible); this.C.renderAll(); }

  // ------------------------------------------------------------ gövde / seçim
  bodyName(id) {
    return this.doc.bodyNames?.[id] || this.result?.bodies.find((b) => b.id === id)?.name || id;
  }
  selectBody(id) { if (this.edit || this.sketchSession || this.tool) return; this.selection = [{ kind: 'body', body: id }]; this.viewport.setSelection(this.selection); this.C.renderBrowser(); this.C.renderStatus(); }
  toggleBody(id) { this.hiddenBodies.has(id) ? this.hiddenBodies.delete(id) : this.hiddenBodies.add(id); if (this.result) this.viewport.setBodies(this.result.bodies, this.hiddenBodies); this.C.renderBrowser(); }
  toggleSketch(id) { this.hiddenSketches.has(id) ? this.hiddenSketches.delete(id) : this.hiddenSketches.add(id); this.refreshSketches(); this.C.renderBrowser(); }
  async renameBody(id) {
    const nm = await promptText('Gövdeyi yeniden adlandır', this.bodyName(id)); if (!nm) return;
    const base = id.split('#')[0]; const f = this.doc.features.find((x) => x.id === base && id === base && ['extrude', 'revolve', 'primitive'].includes(x.type));
    await this.commit((d) => {
      if (f) { d.features.find((x) => x.id === base).bodyName = nm; if (d.bodyNames) delete d.bodyNames[id]; }
      else { d.bodyNames = d.bodyNames || {}; d.bodyNames[id] = nm; }
    });
    // ad özelliğe yazıldıysa UI haritasını da eşitle
  }
  onPick(hit, ev) {
    if (this.sketchSession) return;
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
    if (['extrude', 'revolve'].includes(type) && !ctx.sketches.length) { toast('Önce bir sketch çizin: "Sketch" düğmesine basıp düzlem seçin, şekli çizin ve Sketch\'i Bitir deyin.', true); return; }
    if (type === 'hole' && !ctx.sketches.length) { toast('Delik için önce konum belirten bir sketch çizin (Nokta ya da Daire aracı).', true); return; }
    if (['fillet', 'chamfer', 'shell', 'combine', 'move'].includes(type) && !ctx.bodies.length) { toast('Önce bir gövde oluşturun.', true); return; }
    if (type === 'combine' && ctx.bodies.length < 2) { toast('Birleştirmek için en az iki gövde gerekir.', true); return; }
    const draft = { id: newId(this.doc, type, kind), type, name: autoName(this.doc, type, kind), ...defaults(type, kind, ctx) };
    new FeaturePanel(this, draft, null).open();
    this.C.renderToolbar();
  }
  editFeature(i) {
    if (this.guard()) return; const f = this.doc.features[i]; if (!f) return; this.endTool(true);
    if (f.type === 'sketch') return this.editSketch(i);
    if (f.type === 'import') { toast('İçe aktarılan geometri düzenlenemez; yeniden adlandırabilir ya da silebilirsiniz.'); return; }
    this.selFeature = f.id; new FeaturePanel(this, clone(f), i).open(); this.C.renderAll();
  }
  async commitFeature(panel) {
    const d = clone(panel.draft);
    await this.commit((doc) => {
      if (panel.isNew) { doc.features.splice(panel.at, 0, d); if (doc.rollback != null) doc.rollback = panel.at + 1; } else doc.features[panel.idx] = d;
    });
    this.selFeature = d.id; this.idleView(); this.C.renderAll();
  }
  endEdit() { this.idleView(); this.C.renderAll(); return this.requestRebuild(); }
  selectFeature(id) { this.selFeature = id; this.C.renderTimeline(); this.C.renderBrowser(); }
  async renameFeature(i) { const f = this.doc.features[i]; const nm = await promptText('Özelliği yeniden adlandır', f.name || featLabel(f)); if (!nm) return; await this.commit((d) => { d.features[i].name = nm; }); }
  async toggleSuppress(i) { await this.commit((d) => { const f = d.features[i]; if (f.suppressed) delete f.suppressed; else f.suppressed = true; }); }
  async rollbackTo(n) { if (this.guard()) return; await this.commit((d) => { d.rollback = n == null || n >= d.features.length ? null : n; }); }
  async deleteFeature(i) {
    if (this.guard()) return; const f = this.doc.features[i]; if (!f) return;
    const deps = dependents(this.doc, f);
    if (deps.length) {
      const ok = await confirmBox('Silinecek özellik kullanılıyor', `"${f.name || f.id}" şu özelliklerde kullanılıyor:\n• ${deps.map((x) => x.name || x.id).join('\n• ')}\n\nYine de silerseniz bunlar hata verir (kırmızı görünür); onları da silebilir ya da düzeltebilirsiniz.`, 'Yine de Sil');
      if (!ok) return;
    }
    await this.commit((d) => { d.features.splice(i, 1); if (d.rollback != null) { if (i < d.rollback) d.rollback--; if (d.rollback >= d.features.length) d.rollback = null; } });
    if (this.selFeature === f.id) this.selFeature = null;
    this.C.renderAll();
  }

  // ------------------------------------------------------------ sketch
  async ensureSketcher() {
    if (this.sketcher) return this.sketcher;
    const loader = SKETCHER['./sketcher.js'];
    if (!loader) throw new Error('Sketch ortamı dosyası (sketcher.js) bulunamadı');
    const mod = await loader();
    this.sketcher = new mod.Sketcher({ viewport: this.viewport, overlayEl: $('#overlay'), getVars: () => this.vars(), setHint: (t) => this.setHint(t), setStatus: (t) => this.setLeft(t), onChange: () => this.onSketchChange() });
    return this.sketcher;
  }
  startSketch() {
    if (this.guard()) return; if (this.tool === 'newsketch') { this.endTool(); return; }
    this.endTool(true); this.tool = 'newsketch';
    if (!this.viewport.planesVisible) this.viewport.setPlanesVisible(true);
    this.viewport.pickPlanes = true; this.viewport.setFilter({ face: true });
    this.setHint('Bir düzlem ya da düzlemsel yüz seçin'); this.C.renderAll();
  }
  async beginSketch(draft, plane, idx) {
    try { await this.ensureSketcher(); }
    catch (e) { console.error(e); this.endTool(); toast('Sketch ortamı yüklenemedi: ' + (e.message || e) + '. Model kipindeki işlemler çalışır; uygulamayı yeniden kurmayı deneyin.', true); return; }
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
    if (!plane && f.plane?.kind === 'base') { try { plane = this.planeOf(f.plane); } catch (e) { toast('Düzlem ofseti hesaplanamadı: ' + e.message, true); return; } }
    if (!plane) { toast('Bu sketch şu an hesaplanmış değil (geri sarılmış olabilir). "Sona git" deyip tekrar deneyin.', true); return; }
    await this.beginSketch(clone(f), plane, i);
  }
  onSketchChange() {
    if (this._skRaf) return;
    this._skRaf = requestAnimationFrame(() => { this._skRaf = 0; this.C.renderToolbar(); this.sketchPanel?.refresh(); });
  }
  sketchTool(id) { this.sketcher?.setTool(id); this.C.renderToolbar(); }
  sketchConstraint(type) { try { this.sketcher?.applyConstraint(type); } catch (e) { toast('Kısıt uygulanamadı: ' + e.message, true); } this.onSketchChange(); }
  sketchConstruction() { this.sketcher?.toggleConstruction(); this.onSketchChange(); }
  async setSketchOffset(expr) {
    const s = this.sketchSession; if (!s || s.draft.plane.kind !== 'base') return;
    try { const pl = basePlane(s.draft.plane.name, evalExpr(expr, this.vars())); await this.sketcher.idle(); const f = this.sketcher.stop(); Object.assign(s.draft, { points: f.points, ents: f.ents, cons: f.cons || [] }); s.draft.plane.offset = expr; s.plane = pl; this.sketcher.start(clone(s.draft), pl); }
    catch (e) { toast('Ofset geçersiz: ' + e.message, true); }
  }
  async finishSketch() {
    const s = this.sketchSession; if (!s) return;
    try { await this.sketcher.idle(); } catch (e) { /* çözüm hatası zaten bildirildi */ }
    const f = this.sketcher.stop() || s.draft;
    this.sketchSession = null; this.sketchPanel.close(); this.sketchPanel = null; this.setHint('');
    const merged = { ...s.draft, points: f.points, ents: f.ents, cons: f.cons || [] };
    this.idleView(); this.C.renderAll();
    if (s.isNew) {
      if (!merged.ents.length) { toast('Boş sketch eklenmedi.'); this.refreshSketches(); return; }
      const at = this.doc.rollback ?? this.doc.features.length;
      await this.commit((d) => { d.features.splice(at, 0, merged); if (d.rollback != null) d.rollback = at + 1; });
    } else await this.commit((d) => { d.features[s.idx] = merged; });
    this.selFeature = merged.id; this.setLeft('Hazır'); this.C.renderAll();
  }
  cancelSketch() {
    const s = this.sketchSession; if (!s) return;
    try { this.sketcher.cancel(); } catch (e) { console.error(e); }
    this.sketchSession = null; this.sketchPanel?.close(); this.sketchPanel = null; this.setHint(''); this.setLeft('Hazır');
    this.idleView(); this.refreshSketches(); this.C.renderAll();
  }

  // ------------------------------------------------------------ inceleme araçları
  toggleTool(name) { if (this.tool === name) { this.endTool(); return; } this.startTool(name); }
  async startTool(name) {
    if (this.guard()) return; this.endTool(true); this.tool = name; this.measureSel = [];
    if (name === 'measure') {
      this.viewport.setFilter({ face: true, edge: true }); this.viewport.setSelection([]);
      this.setHint('Ölçmek için bir kenar ya da yüze tıklayın; ikinci seçim mesafe ve açıyı verir. Esc ile çıkın.');
      showBox('Ölç', '<div class="note">Bir kenar ya da yüz seçin…</div>', () => this.endTool());
    } else if (name === 'props') {
      this.viewport.setFilter({ body: true });
      const vis = (this.result?.bodies || []).filter((b) => !this.hiddenBodies.has(b.id));
      const pre = this.selection.find((s) => s.kind === 'body')?.body || (vis.length === 1 ? vis[0].id : null);
      if (!vis.length) { toast('Önce bir gövde oluşturun.', true); this.tool = null; this.C.renderToolbar(); return; }
      this.setHint('Özelliklerini görmek için bir gövdeye tıklayın. Esc ile çıkın.');
      if (pre) await showProps(this, pre); else showBox('Özellikler', '<div class="note">Bir gövde seçin…</div>', () => this.endTool());
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
    const t = this.tool;
    if (t === 'newsketch') {
      if (!hit) return;
      try {
        if (hit.kind === 'plane') { await this.beginSketch({ id: newId(this.doc, 'sketch'), type: 'sketch', name: autoName(this.doc, 'sketch'), plane: { kind: 'base', name: hit.name, offset: '0' }, points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [] }, basePlane(hit.name, 0), null); }
        else if (hit.kind === 'face') {
          const ref = await this.describe(hit, 'face'); const plane = await this.query('facePlane', { ref });
          await this.beginSketch({ id: newId(this.doc, 'sketch'), type: 'sketch', name: autoName(this.doc, 'sketch'), plane: { kind: 'face', ref }, points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [] }, plane, null);
        }
      } catch (e) { toast('Bu yüze sketch çizilemez: ' + (e.message || e), true); }
      return;
    }
    if (t === 'measure') {
      if (!hit || (hit.kind !== 'face' && hit.kind !== 'edge')) return;
      let d; try { d = await this.describe(hit, hit.kind); } catch (e) { toast('Ölçülemedi: ' + e.message, true); return; }
      const same = (x) => x.body === d.body && x.idx === d.idx && x.kind === d.kind;
      const at = this.measureSel.findIndex(same);
      if (at >= 0) this.measureSel.splice(at, 1); else { if (this.measureSel.length >= 2) this.measureSel = []; this.measureSel.push(d); }
      this.viewport.setSelection(this.measureSel.map((x) => ({ kind: x.kind, body: x.body, idx: x.idx })));
      await this.showMeasure(); this.C.renderStatus(); return;
    }
    if (t === 'props') { if (hit && hit.kind === 'body') { this.selection = [{ kind: 'body', body: hit.body }]; this.viewport.setSelection(this.selection); await showProps(this, hit.body); } }
  }
  async showMeasure() {
    const [a, b] = this.measureSel;
    if (!a) { showBox('Ölç', '<div class="note">Bir kenar ya da yüz seçin…</div>', () => this.endTool()); return; }
    let m = null; if (b) { try { m = await this.query('measure', { a, b }); } catch (e) { toast('Ölçülemedi: ' + e.message, true); } }
    const rows = measureRows(a, b, m || { distance: NaN, centerDistance: NaN, delta: [NaN, NaN, NaN] });
    showBox('Ölç', '<table>' + rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') + '</table>', () => this.endTool());
  }
  async runInterference() {
    if (this.guard()) return; this.endTool(true);
    const ids = (this.result?.bodies || []).filter((b) => !this.hiddenBodies.has(b.id)).map((b) => b.id);
    if (ids.length < 2) { toast('Girişim kontrolü için en az iki görünür gövde gerekir.'); return; }
    try {
      const r = await this.query('interference', { ids });
      const html = r.length ? '<table>' + r.map((x) => `<tr><td>${esc(this.bodyName(x.a))} ∩ ${esc(this.bodyName(x.b))}</td><td>${esc(fmt(x.volume, 3))} mm³</td></tr>`).join('') + '</table>' : '<div class="note" style="color:var(--ok)">Girişim yok: gövdeler birbirine girmiyor.</div>';
      showBox('Girişim', (r.length ? `<div class="err">${r.length} çift gövde birbirine giriyor:</div>` : '') + html, () => hideBox());
    } catch (e) { toast('Girişim hesaplanamadı: ' + e.message, true); }
  }
  toggleSection() {
    if (this.sectionPanel) { this.sectionPanel.close(); this.C.renderToolbar(); return; }
    if (this.guard()) return; this.endTool(true);
    if (!this.result?.bodies.length) { toast('Kesit için önce bir gövde oluşturun.'); return; }
    new SectionPanel(this).open(); this.C.renderToolbar();
  }
  openParams() { if (this.guard()) return; return paramsModal(this); }

  // ------------------------------------------------------------ dosya
  async confirmDiscard() {
    if (!this.dirty) return true;
    return confirmBox('Kaydedilmemiş değişiklikler', 'Belgede kaydedilmemiş değişiklikler var. Devam ederseniz kaybolur.', 'Kaydetmeden Devam Et', 'Vazgeç');
  }
  async newDoc() { if (this.guard()) return; if (!(await this.confirmDiscard())) return; await this.loadDoc(emptyDoc()); this.viewport.view('iso', true); }
  fileBytes() { return new TextEncoder().encode(JSON.stringify({ app: 'AtolyeCAD', version: 1, doc: this.doc })); }
  async writeOut(bytes, defaultName, filters, path) {
    if (window.native) return window.native.saveFile({ defaultName, filters, data: bytes, path });
    const a = h('a', { href: URL.createObjectURL(new Blob([bytes])), download: defaultName }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return defaultName;
  }
  async save(as = false) {
    if (this.sketchSession || this.edit) { toast('Önce açık işlemi bitirin, sonra kaydedin.'); return; }
    try {
      const name = (this.fileName || 'Belge').replace(/\.acad$/i, '') + '.acad';
      const p = await this.writeOut(this.fileBytes(), name, ACAD_FILTER, as ? undefined : this.filePath);
      if (!p) return;
      this.filePath = window.native ? p : null; this.fileName = String(p).split(/[\\/]/).pop(); this.markDirty(false); toast('Kaydedildi: ' + this.fileName);
    } catch (e) { toast('Kaydedilemedi: ' + (e.message || e) + '. Başka bir konuma kaydetmeyi deneyin.', true); }
  }
  async pickFile(accept, filters) {
    if (window.native) { const r = await window.native.openFile(filters); return r ? { name: r.name, path: r.path, data: new Uint8Array(r.data) } : null; }
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept, style: { display: 'none' } }); document.body.append(inp);
      inp.addEventListener('change', async () => { const f = inp.files[0]; inp.remove(); resolve(f ? { name: f.name, path: null, data: new Uint8Array(await f.arrayBuffer()) } : null); });
      inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
      inp.click();
    });
  }
  async openFile() {
    if (this.guard()) return; if (!(await this.confirmDiscard())) return;
    const f = await this.pickFile('.acad', ACAD_FILTER); if (!f) return;
    await this.openBytes(f.data, f.name, f.path);
  }
  async openBytes(bytes, name, path) {
    let j; try { j = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { toast('Bu dosya okunamadı: AtolyeCAD belgesi değil ya da bozuk.', true); return; }
    if (!j || j.app !== 'AtolyeCAD' || !j.doc) { toast('Bu dosya bir AtolyeCAD belgesi değil.', true); return; }
    if ((j.version || 1) > 1) toast('Bu belge daha yeni bir sürümle kaydedilmiş; bazı özellikler eksik olabilir.', true);
    await this.loadDoc(j.doc, { name, path }); toast('Açıldı: ' + name);
    const bad = this.doc.features.filter((f) => this.result?.status[f.id]?.ok === false).length;
    if (bad) toast(`${bad} özellik hata veriyor; zaman çizelgesinde kırmızı görünür.`, true);
  }
  async importFile(format) {
    if (this.guard()) return;
    const f = await this.pickFile(format === 'step' ? '.step,.stp' : '.stl', [{ name: format === 'step' ? 'STEP' : 'STL', extensions: format === 'step' ? ['step', 'stp'] : ['stl'] }]); if (!f) return;
    const id = newId(this.doc, 'import'); const nm = f.name.replace(/\.[^.]+$/, '');
    const at = this.doc.rollback ?? this.doc.features.length;
    await this.commit((d) => { d.features.splice(at, 0, { id, type: 'import', name: nm, format, data: b64(f.data) }); if (d.rollback != null) d.rollback = at + 1; });
    const st = this.result?.status[id];
    if (!st || st.ok === false) { await this.undo(); toast('İçe aktarılamadı: ' + (st?.error || 'dosya geçerli bir ' + format.toUpperCase() + ' dosyası değil') + '.', true); return; }
    this.needFit = true; this.viewport.fit(); toast(`${nm} içe aktarıldı.`);
  }
  async exportFile(format) {
    if (this.guard()) return;
    const ids = (this.result?.bodies || []).filter((b) => !this.hiddenBodies.has(b.id)).map((b) => b.id);
    if (!ids.length) { toast('Dışa aktarılacak görünür gövde yok.', true); return; }
    try {
      const data = await this.query('export', { format, ids });
      const name = (this.fileName || 'Belge').replace(/\.acad$/i, '') + '.' + format;
      const p = await this.writeOut(data, name, [{ name: format.toUpperCase(), extensions: format === 'step' ? ['step', 'stp'] : ['stl'] }]);
      if (p) toast(`${format.toUpperCase()} dosyası kaydedildi (${Math.round(data.length / 1024)} KB).`);
    } catch (e) { toast('Dışa aktarılamadı: ' + (e.message || e), true); }
  }

  // ------------------------------------------------------------ yardım pencereleri
  showShortcuts() {
    const rows = [['Ctrl+S', 'Kaydet'], ['Ctrl+Z / Ctrl+Y', 'Geri al / Yinele'], ['F', 'Görünümü sığdır'], ['Enter / Esc', 'Panelde Tamam / İptal'], ['Sağ tuş sürükle', 'Döndür'], ['Orta tuş sürükle', 'Kaydır'], ['Tekerlek', 'Yakınlaştır'],
      ['L, R, C, A, D', 'Sketch: çizgi, dikdörtgen, daire, yay, ölçü'], ['Delete', 'Sketch: seçileni sil'], ['Çift tık', 'Zaman çizelgesinde düzenle'], ['Sağ tık', 'Zaman çizelgesi menüsü']];
    return modal({ title: 'Kısayollar', content: h('table', {}, rows.map(([k, v]) => h('tr', {}, h('td', { style: { fontWeight: 600, paddingRight: '18px', whiteSpace: 'nowrap' }, text: k }), h('td', { text: v })))), buttons: [{ label: 'Kapat', cls: 'pri', value: true }] });
  }
  showAbout() {
    const dep = (n) => String(pkg.dependencies[n] || '').replace('^', '');
    const el = (window.native?.versions?.electron) || (/Electron\/([\d.]+)/.exec(navigator.userAgent) || [])[1];
    const rows = [['AtolyeCAD', pkg.version], ['Geometri çekirdeği: Open CASCADE (OCCT) + replicad', `${dep('replicad-opencascadejs')} — LGPL-2.1 / MIT`], ['Sketch çözücü: PlaneGCS (FreeCAD)', `${dep('@salusoft89/planegcs')} — LGPL-2.0+`], ['3B görünüm: three.js', `r${THREE.REVISION} — MIT`], ['Masaüstü kabuğu: Electron', `${el || '—'} — MIT`]];
    return modal({ title: 'AtolyeCAD Hakkında', content: h('div', {}, h('div', { class: 'note', text: 'Parametrik katı modelleme — CNC atölyeleri için.' }), h('table', {}, rows.map(([k, v]) => h('tr', {}, h('td', { text: k }), h('td', { style: { fontWeight: 600 }, text: v })))),
      h('div', { class: 'note', style: { marginTop: '8px' }, text: 'Open CASCADE ve PlaneGCS, LGPL lisanslı kütüphanelerdir; kaynak kodları ilgili projelerin sayfalarında bulunur. three.js ve Electron MIT lisanslıdır.' })), buttons: [{ label: 'Kapat', cls: 'pri', value: true }] });
  }

  // ------------------------------------------------------------ klavye
  bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (modalOpen()) return;
      const tag = e.target.tagName; const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      const ctrl = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
      if (ctrl && k === 's') { e.preventDefault(); this.save(e.shiftKey); return; }
      if (this.sketchSession) { if (this.sketcher && this.sketcher.handleKey(e)) e.preventDefault(); return; }
      if (ctrl && !inField && (k === 'z' || k === 'y')) { e.preventDefault(); (k === 'y' || e.shiftKey) ? this.redo() : this.undo(); return; }
      if (this.edit) {
        if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'TEXTAREA') { e.preventDefault(); this.edit.ok(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.edit.cancel(); }
        return;
      }
      if (e.key === 'Escape') { if (this.tool) this.endTool(); else if (this.sectionPanel) this.toggleSection(); return; }
      if (!inField && !ctrl && k === 'f') this.viewport.fit();
    });
  }
}

const app = new App();
window.app = app;
window.THREE_REV = THREE.REVISION;
app.init();
export default app;
