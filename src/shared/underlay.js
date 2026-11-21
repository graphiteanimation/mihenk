// WP-14: eskiz altligi (underlay). Goruntu (PNG/JPEG) ya da PDF sayfasindaki gomulu JPEG goruntu; iki noktayla olceklendirme.
// Saf JS (DOM yok). PDF kapsami SINIRLIDIR: yalniz sayfasinda gomulu JPEG (DCTDecode) goruntusu olan, nesne yapisi sikistirilmamis
// PDF'ler (taranmis cizimler); vektor/sikistirilmis-nesneli PDF icin pdf.js gerekir (bu surumde bagimlilik eklenmedi) -> acik hata.
// Altlik modeli (sketch.underlay): { name, mime, data (base64), wPx, hPx, mmPerPx, origin:[x,y], angle, opacity, visible }
// Gorunum: goruntunun SOL-ALT kosesi (piksel (0,hPx)) eskiz koordinati `origin`'dedir; goruntu `angle` derece saat yonu tersine doner.
import { KErr } from './errors.js';

export const UNDERLAY_LIMITS = { bytes: 8 * 1024 * 1024, pdfBytes: 30 * 1024 * 1024, maxPx: 20000 };
const uerr = (code, params = {}) => new KErr(code, params);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------- goruntu bilgisi
export function imageInfo(bytes) {
  const b = bytes;
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) { // JPEG: SOFn isaretcisini ara
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { mime: 'image/jpeg', h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + len;
    }
  }
  return null;
}
const toB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };

// Altlik nesnesi kurar. mmPerPx baslangicta bilinmez (null degil 1): kullanici iki noktayla olcekler.
export function makeUnderlay(name, bytes, opts = {}) {
  if (!(bytes instanceof Uint8Array)) throw uerr('underlay.bad_file');
  if (bytes.length > UNDERLAY_LIMITS.bytes) throw uerr('underlay.too_big', { mb: Math.round(UNDERLAY_LIMITS.bytes / 1048576) });
  const info = imageInfo(bytes);
  if (!info || !(info.w > 0 && info.h > 0) || info.w > UNDERLAY_LIMITS.maxPx || info.h > UNDERLAY_LIMITS.maxPx) throw uerr('underlay.bad_image');
  return { name: String(name ?? '').slice(0, 200), mime: info.mime, data: toB64(bytes), wPx: info.w, hPx: info.h, mmPerPx: opts.mmPerPx ?? 1, origin: opts.origin ?? [0, 0], angle: 0, opacity: opts.opacity ?? 0.5, visible: true, locked: false };
}
export function checkUnderlay(u) {
  if (!u || typeof u !== 'object') throw uerr('underlay.bad_image');
  if (!['image/png', 'image/jpeg'].includes(u.mime) || typeof u.data !== 'string' || u.data.length > UNDERLAY_LIMITS.bytes * 1.4) throw uerr('underlay.bad_image');
  if (!(isNum(u.mmPerPx) && u.mmPerPx > 0) || !(isNum(u.wPx) && u.wPx > 0) || !(isNum(u.hPx) && u.hPx > 0)) throw uerr('underlay.bad_image');
  if (u.locked !== undefined && typeof u.locked !== 'boolean') throw uerr('underlay.bad_image');
  if (!Array.isArray(u.origin) || u.origin.length !== 2 || !u.origin.every(isNum) || !isNum(u.angle) || !(isNum(u.opacity) && u.opacity >= 0 && u.opacity <= 1)) throw uerr('underlay.bad_image');
  return true;
}

// ---------------------------------------------------------------- donusumler
// piksel (sol-ust orijin, y asagi) -> eskiz mm
export function pxToSketch(u, [px, py]) {
  const x = px * u.mmPerPx, y = (u.hPx - py) * u.mmPerPx; const a = (u.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [u.origin[0] + x * c - y * s, u.origin[1] + x * s + y * c];
}
export function sketchToPx(u, [sx, sy]) {
  const a = (-u.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); const dx = sx - u.origin[0], dy = sy - u.origin[1];
  const x = dx * c - dy * s, y = dx * s + dy * c; return [x / u.mmPerPx, u.hPx - y / u.mmPerPx];
}
// Iki nokta + gercek mesafe: A noktasi (eskizde) yerinde kalir, olcek mesafeye uyar. pA, pB piksel; dist mm > 0.
export function scaleByDistance(u, pA, pB, dist) {
  if (!(isNum(dist) && dist > 0)) throw uerr('underlay.bad_distance');
  const d = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]) * u.mmPerPx;
  if (!(d > 1e-9)) throw uerr('underlay.same_point');
  const k = dist / d; const keep = pxToSketch(u, pA);
  const out = { ...u, mmPerPx: u.mmPerPx * k };
  const moved = pxToSketch(out, pA); // A'nin yeni eskiz konumu: eski konuma tasi
  out.origin = [u.origin[0] + (keep[0] - moved[0]), u.origin[1] + (keep[1] - moved[1])];
  return out;
}
// Iki goruntu noktasi -> iki eskiz noktasi (benzerlik donusumu: olcek + donme + oteleme). Eskiz noktalari farkli olmali.
export function fitTwoPoints(u, pA, pB, qA, qB) {
  const vp = [(pB[0] - pA[0]) * u.mmPerPx, -(pB[1] - pA[1]) * u.mmPerPx], vq = [qB[0] - qA[0], qB[1] - qA[1]];
  const lp = Math.hypot(vp[0], vp[1]), lq = Math.hypot(vq[0], vq[1]);
  if (!(lp > 1e-9) || !(lq > 1e-9)) throw uerr('underlay.same_point');
  const k = lq / lp; const dAng = (Math.atan2(vq[1], vq[0]) - Math.atan2(vp[1], vp[0])) * 180 / Math.PI;
  const out = { ...u, mmPerPx: u.mmPerPx * k, angle: ((u.angle + dAng) % 360 + 540) % 360 - 180 };
  out.origin = [0, 0]; const at = pxToSketch(out, pA); out.origin = [qA[0] - at[0], qA[1] - at[1]];
  return out;
}

// WP-22a: ozellik degisiklikleri (yeni nesne doner; veri dizgesi paylasilir, geri al kayitlari ucuz kalir)
export function withProps(u, p) {
  const out = { ...u };
  if (p.opacity !== undefined) { if (!(isNum(p.opacity) && p.opacity >= 0 && p.opacity <= 1)) throw uerr('underlay.bad_image'); out.opacity = p.opacity; }
  if (p.visible !== undefined) out.visible = !!p.visible;
  if (p.locked !== undefined) out.locked = !!p.locked;
  return out;
}

// ---------------------------------------------------------------- PDF (sinirli): sayfadaki gomulu JPEG goruntuleri
const latin = (b) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return s; };
// Donus: [{ page (1..), obj, w, h, bytes (JPEG), mime }]. Hata: underlay.pdf_unsupported / pdf_encrypted / too_big / bad_file.
export function pdfPageImages(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8 || latin(bytes.subarray(0, 5)) !== '%PDF-') throw uerr('underlay.bad_file');
  if (bytes.length > UNDERLAY_LIMITS.pdfBytes) throw uerr('underlay.too_big', { mb: Math.round(UNDERLAY_LIMITS.pdfBytes / 1048576) });
  const s = latin(bytes);
  if (/\/Encrypt\b/.test(s)) throw uerr('underlay.pdf_encrypted');
  // nesneler: "N G obj ... endobj" (akis icerigi dahil); akis baslangic/bitis konumlari
  const objs = new Map(); const re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
  while ((m = re.exec(s))) {
    const num = Number(m[1]); const start = m.index + m[0].length; const end = s.indexOf('endobj', start); if (end < 0) continue;
    const body = s.slice(start, end); const sp = body.indexOf('stream');
    const dictTxt = sp >= 0 ? body.slice(0, sp) : body;
    const o = { num, dict: dictTxt, start, end };
    if (sp >= 0) {
      let a = start + sp + 6; if (s[a] === '\r') a++; if (s[a] === '\n') a++;
      const lenM = /\/Length\s+(\d+)(?:\s+(\d+)\s+R)?/.exec(dictTxt); let len = null;
      if (lenM && !lenM[2]) len = Number(lenM[1]);
      else if (lenM) { const lo = objs.get(Number(lenM[1])); const lm = lo && /^\s*(\d+)\s*$/.exec(lo.dict); if (lm) len = Number(lm[1]); }
      let b2 = len != null && a + len <= end ? a + len : s.lastIndexOf('endstream', end);
      if (len == null && b2 < 0) continue;
      o.stream = [a, b2];
    }
    objs.set(num, o);
  }
  if (!objs.size) throw uerr('underlay.pdf_unsupported');
  const isImg = (o) => /\/Subtype\s*\/Image\b/.test(o.dict) && /\/Filter\s*(\[\s*)?\/DCTDecode\b/.test(o.dict) && !/\/Filter\s*\[[^\]]*\/(Flate|LZW|ASCII|RunLength)/.test(o.dict) && o.stream;
  const refs = (txt) => [...txt.matchAll(/(\d+)\s+\d+\s+R/g)].map((x) => Number(x[1]));
  const dictBody = (txt, key) => { // /Key << ... >> (ic ice << >> sayilir) ya da /Key N G R
    const i = txt.search(new RegExp('/' + key + '\\b')); if (i < 0) return null;
    let j = i + key.length + 1; while (/\s/.test(txt[j])) j++;
    if (txt.startsWith('<<', j)) { let d = 0, k = j; for (; k < txt.length; k++) { if (txt.startsWith('<<', k)) { d++; k++; } else if (txt.startsWith('>>', k)) { d--; k++; if (d === 0) { k++; break; } } } return { inline: txt.slice(j, k) }; }
    const r = /^(\d+)\s+\d+\s+R/.exec(txt.slice(j)); return r ? { ref: Number(r[1]) } : null;
  };
  const resolveDict = (d) => (d ? (d.inline ?? objs.get(d.ref)?.dict ?? '') : '');
  const pages = [...objs.values()].filter((o) => /\/Type\s*\/Page\b(?!s)/.test(o.dict));
  // sayfa sirasi: /Pages /Kids gezintisi (dogrudan, sikistirilmamis)
  const order = []; const walkKids = (n, seen = new Set()) => { const o = objs.get(n); if (!o || seen.has(n)) return; seen.add(n); if (/\/Type\s*\/Pages\b/.test(o.dict)) { const k = /\/Kids\s*\[([^\]]*)\]/.exec(o.dict); if (k) for (const r of refs(k[1])) walkKids(r, seen); } else order.push(o); };
  const root = [...objs.values()].find((o) => /\/Type\s*\/Pages\b/.test(o.dict) && !/\/Parent\b/.test(o.dict));
  if (root) walkKids(root.num); const list = order.length ? order : pages;
  if (!list.length) throw uerr('underlay.pdf_unsupported');
  const out = [];
  list.forEach((pg, idx) => {
    const res = resolveDict(dictBody(pg.dict, 'Resources')); const xo = resolveDict(dictBody(res, 'XObject'));
    for (const r of refs(xo)) {
      const io = objs.get(r); if (!io || !isImg(io)) continue;
      const w = Number(/\/Width\s+(\d+)/.exec(io.dict)?.[1]), h = Number(/\/Height\s+(\d+)/.exec(io.dict)?.[1]);
      const raw = new Uint8Array(io.stream[1] - io.stream[0]); for (let i = 0; i < raw.length; i++) raw[i] = s.charCodeAt(io.stream[0] + i) & 0xff;
      if (raw[0] === 0xff && raw[1] === 0xd8) out.push({ page: idx + 1, obj: r, w, h, bytes: raw, mime: 'image/jpeg' });
    }
  });
  if (!out.length) throw uerr('underlay.pdf_unsupported');
  return out;
}
// PDF sayfasi -> altlik (sayfadaki en buyuk gomulu goruntu)
export function underlayFromPdf(name, bytes, page = 1) {
  const imgs = pdfPageImages(bytes).filter((i) => i.page === page);
  if (!imgs.length) throw uerr('underlay.pdf_no_page', { page });
  const best = imgs.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  return makeUnderlay(name, best.bytes);
}
