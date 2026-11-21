// WP-22a (O-049): vektor / sikistirilmis PDF -> sayfa goruntusu (PNG) -> eskiz altligi. pdf.js (pdfjs-dist, Apache-2.0) tembel yuklenir:
// pdf.js yalniz PDF secildiginde indirilir/calisir. Ana belge CSP'si gevsetilmez: isci `self` kaynaktan (pdfworker.js), yazi tipi/wasm
// verisi `self` altindaki public/pdfjs/ dizininden (connect-src 'self'), yazi tipleri yol olarak cizilir (disableFontFace: font-src gerekmez).
// Bozuk / sifreli / sonsuza giden PDF icin Turkce anlasilir hata (KErr) ve zaman asimi; takilma yok.
import { KErr } from './errors.js';
import { UNDERLAY_LIMITS } from './underlay.js';

export const PDF_LIMITS = { loadMs: 30000, renderMs: 90000, targetPx: 2600, maxScale: 3, minScale: 0.2, maxCanvasPx: 40e6 };
const PT_MM = 25.4 / 72; // 1 pt = 1/72 inc

let opts = { workerSrc: null, base: null };
let lib = null;
// Sinama: Node testleri `workerSrc` (sahte isci) ve `base` (veri dizini URL'si) verir; tarayicida ikisi de otomatik.
export function configurePdf(o) { opts = { ...opts, ...o }; }

async function engine() {
  if (lib) return lib;
  let m;
  try { m = await import('pdfjs-dist/build/pdf.mjs'); } catch (e) { throw new KErr('underlay.pdf_engine'); }
  if (opts.workerSrc) m.GlobalWorkerOptions.workerSrc = opts.workerSrc;
  else if (typeof Worker !== 'undefined') { try { m.GlobalWorkerOptions.workerPort = new Worker(new URL('./pdfworker.js', import.meta.url), { type: 'module' }); } catch (e) { throw new KErr('underlay.pdf_engine'); } }
  lib = m; return m;
}
const withTimeout = (p, ms, onTimeout) => new Promise((res, rej) => {
  const tm = setTimeout(() => { try { onTimeout && onTimeout(); } catch (e) { /* yoksay */ } rej(new KErr('underlay.pdf_timeout', { s: Math.round(ms / 1000) })); }, ms);
  p.then((v) => { clearTimeout(tm); res(v); }, (e) => { clearTimeout(tm); rej(e); });
});
function mapErr(e) {
  if (e instanceof KErr) return e;
  const n = e && e.name, msg = String(e && e.message || '');
  if (n === 'PasswordException') return new KErr('underlay.pdf_encrypted');
  if (n === 'InvalidPDFException' || n === 'MissingPDFException' || n === 'FormatError' || n === 'XRefParseException' || n === 'UnknownErrorException') return new KErr('underlay.pdf_bad');
  if (/worker/i.test(msg)) return new KErr('underlay.pdf_engine');
  return new KErr('underlay.pdf_bad');
}
const dataBase = () => opts.base ?? (typeof document !== 'undefined' ? new URL('./pdfjs/', document.baseURI).href : null);

// PDF'i ac. Donus: { numPages, size(n) -> {wPt,hPt}, render(n, o) -> altlik gorseli, destroy() }
export async function openPdf(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) throw new KErr('underlay.bad_file');
  if (bytes.length > UNDERLAY_LIMITS.pdfBytes) throw new KErr('underlay.too_big', { mb: Math.round(UNDERLAY_LIMITS.pdfBytes / 1048576) });
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') { // basliga kadar 1 KB tarama (bazi dosyalar onde cop tasir)
    const head = String.fromCharCode(...bytes.subarray(0, Math.min(1024, bytes.length)));
    if (!head.includes('%PDF-')) throw new KErr('underlay.bad_file');
  }
  const L = await engine(); const base = dataBase();
  const task = L.getDocument({
    data: bytes.slice(), isEvalSupported: false, // v6'da eval yolu hic yok; secenek eski surumlerle uyum icin acikca kapali
    disableFontFace: true, useSystemFonts: false, enableXfa: false, stopAtErrors: false, verbosity: 0, isOffscreenCanvasSupported: false,
    ...(base ? { standardFontDataUrl: base + 'standard_fonts/', wasmUrl: base + 'wasm/' } : {}),
  });
  let doc;
  try { doc = await withTimeout(task.promise, PDF_LIMITS.loadMs, () => task.destroy()); } catch (e) { try { task.destroy(); } catch (x) { /* yoksay */ } throw mapErr(e); }
  if (!(doc.numPages >= 1)) { try { task.destroy(); } catch (x) { /* yoksay */ } throw new KErr('underlay.pdf_bad'); }
  const getPage = async (n) => { if (!Number.isInteger(n) || n < 1 || n > doc.numPages) throw new KErr('underlay.pdf_no_page', { page: n }); try { return await withTimeout(doc.getPage(n), PDF_LIMITS.loadMs, () => task.destroy()); } catch (e) { throw mapErr(e); } };
  return {
    numPages: doc.numPages,
    async size(n) { const pg = await getPage(n); const v = pg.getViewport({ scale: 1 }); return { wPt: v.width, hPt: v.height }; },
    // Sayfayi PNG'ye (buyukse JPEG'e) cizer. mmPerPx: sayfa gercek (yazdirma) boyutundadir.
    async render(n, o = {}) {
      const pg = await getPage(n); const v1 = pg.getViewport({ scale: 1 });
      if (!(v1.width > 0 && v1.height > 0)) throw new KErr('underlay.pdf_bad');
      let scale = Math.min(PDF_LIMITS.maxScale, Math.max(PDF_LIMITS.minScale, (o.targetPx || PDF_LIMITS.targetPx) / Math.max(v1.width, v1.height)));
      for (let attempt = 0; attempt < 4; attempt++) {
        const vp = pg.getViewport({ scale }); const w = Math.max(1, Math.round(vp.width)), h = Math.max(1, Math.round(vp.height));
        if (w * h > PDF_LIMITS.maxCanvasPx || w > UNDERLAY_LIMITS.maxPx || h > UNDERLAY_LIMITS.maxPx) { scale *= 0.7; continue; }
        const cv = o.canvas || document.createElement('canvas'); cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d'); if (!ctx) throw new KErr('underlay.pdf_render');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        const rt = pg.render({ canvasContext: ctx, canvas: cv, viewport: vp, intent: 'display' });
        try { await withTimeout(rt.promise, PDF_LIMITS.renderMs, () => { try { rt.cancel(); } catch (x) { /* yoksay */ } task.destroy(); }); } catch (e) { throw e instanceof KErr ? e : new KErr('underlay.pdf_render'); }
        let mime = 'image/png', blob = await new Promise((r) => cv.toBlob(r, mime));
        if (!blob || blob.size > UNDERLAY_LIMITS.bytes) { mime = 'image/jpeg'; blob = await new Promise((r) => cv.toBlob(r, mime, 0.9)); }
        if (!blob || blob.size > UNDERLAY_LIMITS.bytes) { scale *= 0.7; continue; }
        const out = { bytes: new Uint8Array(await blob.arrayBuffer()), mime, wPx: w, hPx: h, mmPerPx: PT_MM / scale };
        pg.cleanup(); return out;
      }
      throw new KErr('underlay.too_big', { mb: Math.round(UNDERLAY_LIMITS.bytes / 1048576) });
    },
    destroy() { try { task.destroy(); } catch (e) { /* yoksay */ } },
  };
}
