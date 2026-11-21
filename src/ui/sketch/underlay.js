// WP-22a: eskiz altlığı (PNG/JPEG/PDF) arayüzü. Sketcher.prototype'a eklenir (UNDERLAY_METHODS) + uygulama tarafı pencereleri (ulAdd, ulProps).
// Veri: sketch.underlay (src/shared/underlay.js; şema doğrulaması orada). Altlık eskiz düzleminde yarı saydam bir doku olarak çizilir
// (sol-alt köşe = origin, angle derece), eskiz geometrisinin ALTINDA kalır ve seçime/yakalamaya girmez. Değişiklikler kendi geri al
// adımıdır ({u: önceki altlık}); veri dizgesi nesneler arasında paylaşılır, geri al yığını şişmez.
import { THREE, COL } from '../viewport.js';
import { h, modal, toast } from '../dom.js';
import { t, tk, errText, fmtNum } from '../../shared/i18n.js';
import { KErr } from '../../shared/errors.js';
import { evalExpr } from '../../shared/expr.js';
import { makeUnderlay, checkUnderlay, withProps, scaleByDistance, fitTwoPoints, sketchToPx, underlayFromPdf } from '../../shared/underlay.js';
import { openPdf } from '../../shared/pdfrender.js';

export const UL_TOOLS = ['ulscale', 'ulfit'];
export const UL_HINT = { ulscale: tk('ul.hint.scale1'), ulfit: tk('ul.hint.fit1') };
const DEG = Math.PI / 180;
const clone = (o) => JSON.parse(JSON.stringify(o));

export const UNDERLAY_METHODS = {
  // ------------------------------------------------------------------ yaşam döngüsü
  _ulInit() {
    let u = this.feature.underlay || null;
    if (u) { try { checkUnderlay(u); u = clone(u); } catch (e) { u = null; } }
    this.underlay = u; this._ul = null; this._ulTex = null; this._ulMesh = null; this._ulTok = 0;
    this.gUnder = new THREE.Group(); this.root.add(this.gUnder); this._ulBuild();
  },
  _ulDispose() {
    this._ulTok++; if (this._ulMesh) { this._ulMesh.geometry.dispose(); this._ulMesh.material.dispose(); this._ulMesh = null; }
    if (this._ulTex) { this._ulTex.tex.dispose(); this._ulTex = null; }
    if (this.gUnder) { this.root.remove(this.gUnder); this.gUnder = null; }
  },
  // doku yüklemesi eşzamansızdır; aynı veri için doku yeniden kullanılır (saydamlık/konum değişince yeniden yüklenmez)
  _ulBuild() {
    if (!this.gUnder) return; const u = this.underlay; const tok = ++this._ulTok;
    const clear = () => { if (this._ulMesh) { this.gUnder.remove(this._ulMesh); this._ulMesh.geometry.dispose(); this._ulMesh.material.dispose(); this._ulMesh = null; } };
    if (!u || !u.visible) { clear(); this.vp.dirty = true; return; }
    const place = (tex) => {
      if (this._ulTok !== tok || !this.gUnder) return; clear();
      const g = new THREE.PlaneGeometry(1, 1); g.translate(0.5, 0.5, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: u.opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
      m.scale.set(u.wPx * u.mmPerPx, u.hPx * u.mmPerPx, 1); m.position.set(u.origin[0], u.origin[1], 0); m.rotation.z = u.angle * DEG; m.renderOrder = -10; m.userData.underlay = true;
      this._ulMesh = m; this.gUnder.add(m); this.vp.dirty = true;
      if (this._ulFitPending) { this._ulFitPending = false; this.gUnder.updateMatrixWorld(true); this.vp.fit(); } // yeni altlık: görünüm altlığa sığdırılır
    };
    if (this._ulTex && this._ulTex.data === u.data) { place(this._ulTex.tex); return; }
    const img = new Image();
    img.onload = () => {
      if (this._ulTok !== tok) return;
      const tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; tex.anisotropy = 4;
      if (this._ulTex) this._ulTex.tex.dispose(); this._ulTex = { data: u.data, tex }; place(tex);
    };
    img.onerror = () => { if (this._ulTok === tok) this._status('ul.load_failed'); };
    img.src = 'data:' + u.mime + ';base64,' + u.data;
  },
  // Değişiklik: geri al adımı ekler. next: yeni altlık nesnesi ya da null (kaldır).
  setUnderlay(next, status) {
    if (!this.active) return false;
    if (next) checkUnderlay(next);
    this._undo.push({ u: this.underlay }); if (this._undo.length > 200) this._undo.shift(); this._redo = [];
    this.underlay = next; this._ulBuild(); if (status) this._status(status); this.onChange(); return true;
  },
  _ulRestore(u) { this.underlay = u; this._ulBuild(); this.onChange(); },
  underlayLocked(msg = true) { const l = !!(this.underlay && this.underlay.locked); if (l && msg) { this._status('ul.locked_msg'); } return l; },

  // ------------------------------------------------------------------ işlemler (araçlar ve testler ortak kullanır)
  // a, b: eskiz konumları (altlıkta iki nokta); dist: gerçek mesafe (mm). A noktası yerinde kalır.
  underlayScale(a, b, dist) {
    const u = this.underlay; if (!u) throw new KErr('underlay.none');
    if (u.locked) throw new KErr('underlay.locked');
    const next = scaleByDistance(u, sketchToPx(u, a), sketchToPx(u, b), dist);
    this.setUnderlay(next, 'ul.scaled'); return next;
  },
  // pA, pB: altlıktaki iki nokta (eskiz konumu); qA, qB: onların gelmesi gereken eskiz noktaları
  underlayFit(pA, pB, qA, qB) {
    const u = this.underlay; if (!u) throw new KErr('underlay.none');
    if (u.locked) throw new KErr('underlay.locked');
    const next = fitTwoPoints(u, sketchToPx(u, pA), sketchToPx(u, pB), qA, qB);
    this.setUnderlay(next, 'ul.fitted'); return next;
  },
  underlayProps(p) { const u = this.underlay; if (!u) throw new KErr('underlay.none'); return this.setUnderlay(withProps(u, p)); },

  // ------------------------------------------------------------------ araçlar: ulscale (A, B, mesafe) ve ulfit (pA, qA, pB, qB)
  _ulDown(loc, ev) {
    const u = this.underlay;
    if (!u || !u.visible) { this._status(u ? 'ul.hidden_msg' : 'ul.none'); this.setTool('select'); return; }
    if (u.locked) { this._status('ul.locked_msg'); this.setTool('select'); return; }
    if (this._input) return;
    const st = this._ul || (this._ul = { pts: [] });
    if (this.tool === 'ulscale') {
      if (st.pts.length >= 2) st.pts = []; // giriş Esc ile kapandıysa yeni ölçekleme başlar
      st.pts.push([loc[0], loc[1]]);
      if (st.pts.length === 1) { this.setHint(tk('ul.hint.scale2')); this._renderPreview(); return; }
      const [a, b] = st.pts; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) { st.pts.pop(); this._status(() => t('err.underlay.same_point')); return; }
      this.setHint(tk('ul.hint.scale3')); st.ask = true; this._renderPreview(); // giriş kutusu fare BIRAKILINCA açılır (basışın varsayılan odak değişimi onu kapatmasın)
      return;
    }
    // ulfit: sıra pA (altlık), qA (hedef, yakalanır), pB, qB
    const i = st.pts.length; const s = i % 2 === 1 ? this._snapAt(loc, ev) : null; st.pts.push(s ? [s.x, s.y] : [loc[0], loc[1]]);
    if (st.pts.length < 4) { this.setHint(tk(['ul.hint.fit2', 'ul.hint.fit3', 'ul.hint.fit4'][st.pts.length - 1])); this._renderPreview(); return; }
    const [pA, qA, pB, qB] = st.pts; this._ul = null;
    try { this.underlayFit(pA, pB, qA, qB); this.setHint(tk('ul.hint.fit1')); } catch (e) { this._status(() => errText(e)); this.setHint(tk('ul.hint.fit1')); }
    this._renderPreview();
  },
  _ulUp() {
    const st = this._ul; if (!st || !st.ask || this._input) return; st.ask = false; const [a, b] = st.pts;
    this._openInput({ anchor: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], text: String(+Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(3)), label: t('ul.dist'),
      submit: async (txt) => {
        let d; try { d = Number(evalExpr(String(txt), this.getVars())); } catch (e) { return errText(e); }
        if (!(d > 0) || !Number.isFinite(d)) return t('err.underlay.bad_distance');
        try { this.underlayScale(a, b, d); } catch (e) { return errText(e); }
        this._ul = null; this.setHint(tk('ul.hint.scale1')); this._renderPreview(); return null;
      } });
  },
  _ulPreview(cur) {
    const st = this._ul; const B = COL.cons;
    if (st && st.pts.length) {
      const pts = st.pts.map((p) => p.slice()); const x = this.vp.worldPerPixel() * 6;
      pts.forEach((p, i) => { const col = this.tool === 'ulfit' && i % 2 === 1 ? COL.sketch : B; this._line([[p[0] - x, p[1]], [p[0] + x, p[1]]], col); this._line([[p[0], p[1] - x], [p[0], p[1] + x]], col); });
      if (this.tool === 'ulscale') { const a = pts[0], b = pts[1] || (cur ? [cur.x, cur.y] : null); if (b) this._line([a, b], B, true); }
      else { for (let k = 0; k + 1 < pts.length; k += 2) this._line([pts[k], pts[k + 1]], B, true); if (pts.length % 2 === 1 && cur) this._line([pts[pts.length - 1], [cur.x, cur.y]], B, true); }
    }
    if (cur && this.tool === 'ulfit' && st && st.pts.length % 2 === 1) this._showSnap(cur); else this._hideSnap();
    this._hideTip();
  },
};

// ---------------------------------------------------------------------- uygulama tarafı pencereleri
// Dosya seç → (PDF ise sayfa seç) → altlık kur. Hata: Türkçe/İngilizce ileti (toast); PDF motoru açılmazsa gömülü JPEG yedek yolu.
const readImageOrPdf = async (app, f) => {
  const bytes = f.data; const isPdf = bytes.length > 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-' || /\.pdf$/i.test(f.name);
  if (!isPdf) return makeUnderlay(f.name, bytes);
  let pdf;
  try { pdf = await openPdf(bytes); }
  catch (e) {
    if (e && e.code === 'underlay.pdf_engine') { toast(t('ul.engine_fallback'), true); return underlayFromPdf(f.name, bytes, 1); } // WP-14 yedeği: gömülü JPEG
    throw e;
  }
  try {
    let page = 1;
    if (pdf.numPages > 1) {
      const inp = h('input', { type: 'number', min: 1, max: pdf.numPages, value: 1, 'data-testid': 'ul-page', id: 'ul-page' });
      const ok = await modal({ title: t('ul.pdf_title'), content: h('div', {}, h('div', { class: 'note', text: t('ul.pdf_pages', { n: pdf.numPages }) }), h('div', { class: 'fld' }, h('label', { for: 'ul-page', text: t('ul.pdf_page') }), inp)),
        buttons: [{ label: t('common.ok'), cls: 'pri', value: true, check: () => { const v = Math.round(Number(inp.value)); if (!(v >= 1 && v <= pdf.numPages)) return false; page = v; return true; } }, { label: t('common.cancel'), value: false }] });
      if (!ok) return null;
    }
    toast(t('ul.pdf_loading'));
    const r = await pdf.render(page);
    return makeUnderlay(f.name.replace(/\.pdf$/i, '') + (pdf.numPages > 1 ? ' (' + page + ')' : ''), r.bytes, { mmPerPx: r.mmPerPx });
  } finally { pdf.destroy(); }
};
export async function ulAdd(app) {
  const sk = app.sketcher; if (!app.sketchSession || !sk) { toast(t('ul.need_sketch')); return; }
  if (sk.underlayLocked()) { toast(t('ul.locked_msg')); return; }
  const f = await app.pickFile('.png,.jpg,.jpeg,.pdf', 'underlay'); if (!f) return;
  let u;
  try { u = await readImageOrPdf(app, f); } catch (e) { toast(t('ul.add_failed', { msg: errText(e) }), true); return; }
  if (!u) return;
  if (sk.underlay) { u.opacity = sk.underlay.opacity; u.origin = sk.underlay.origin.slice(); } // değiştirme: konum/saydamlık korunur
  sk._ulFitPending = true;
  if (sk.setUnderlay(u)) { toast(t('ul.added', { name: u.name })); app.onSketchChange(); } else sk._ulFitPending = false;
}
export async function ulProps(app) {
  const sk = app.sketcher; if (!app.sketchSession || !sk) { toast(t('ul.need_sketch')); return; }
  const u = sk.underlay; if (!u) { toast(t('ul.none')); return; }
  const op = h('input', { type: 'range', min: 5, max: 100, step: 5, value: Math.round(u.opacity * 100), 'data-testid': 'ul-opacity', id: 'ul-opacity' });
  const vis = h('input', { type: 'checkbox', checked: u.visible, 'data-testid': 'ul-visible', id: 'ul-visible' });
  const lk = h('input', { type: 'checkbox', checked: !!u.locked, 'data-testid': 'ul-locked', id: 'ul-locked' });
  const info = h('div', { class: 'note', text: u.name + ' · ' + u.wPx + '×' + u.hPx + ' px · ' + fmtNum(u.mmPerPx, 4) + ' mm/px' });
  const ok = await modal({ title: t('ul.title'), content: h('div', {}, info, h('div', { class: 'fld' }, h('label', { for: 'ul-opacity', text: t('ul.opacity') }), op), h('div', { class: 'fld' }, h('label', { for: 'ul-visible', text: t('ul.visible') }), vis), h('div', { class: 'fld' }, h('label', { for: 'ul-locked', text: t('ul.locked') }), lk)),
    buttons: [{ label: t('common.ok'), cls: 'pri', value: true }, { label: t('ul.remove'), value: 'remove' }, { label: t('common.cancel'), value: false }] });
  if (ok === 'remove') { if (sk.underlayLocked()) { toast(t('ul.locked_msg'), true); return; } sk.setUnderlay(null, 'ul.removed'); app.onSketchChange(); return; }
  if (!ok) return;
  const p = { opacity: Number(op.value) / 100, visible: vis.checked, locked: lk.checked };
  if (p.opacity !== u.opacity || p.visible !== u.visible || p.locked !== !!u.locked) { sk.underlayProps(p); app.onSketchChange(); }
}
