// WP-08 dilim 6: eskiz metni. Uygulamayla gelen açık lisanslı yazı tipi (Inter Regular, SIL OFL 1.1; fonts/OFL.txt,
// docs/YAZI-TIPI.md) okunur, glifler kapalı çokgen eğrilere (çizgi varlıkları) çevrilir; eskizde extrude/kazıma profili olur.
// Sistem yazı tipi kullanılmaz (her makinede aynı geometri). Yalnız TrueType 'glyf' biçimi (bileşik glifler dahil) okunur.
import { t, tk } from '../../shared/i18n.js';

// ---------------------------------------------------------------- TrueType okuyucu (cmap 4/12, head, hhea, hmtx, loca, glyf, kern)
export function parseFont(buf) {
  const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, buf.byteLength);
  const u16 = (o) => dv.getUint16(o), i16 = (o) => dv.getInt16(o), u32 = (o) => dv.getUint32(o);
  const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  const n = u16(4); const T = {};
  for (let i = 0; i < n; i++) { const o = 12 + i * 16; T[tag(o)] = { off: u32(o + 8), len: u32(o + 12) }; }
  for (const k of ['head', 'hhea', 'hmtx', 'loca', 'glyf', 'cmap', 'maxp']) if (!T[k]) throw new Error('font: ' + k);
  const upm = u16(T.head.off + 18); const locFmt = i16(T.head.off + 50);
  const nGlyphs = u16(T.maxp.off + 4); const nH = u16(T.hhea.off + 34);
  const loca = (g) => (locFmt ? u32(T.loca.off + g * 4) : u16(T.loca.off + g * 2) * 2);
  const adv = (g) => u16(T.hmtx.off + 4 * Math.min(g, nH - 1));
  // cmap: tercihen 3/10 (biçim 12), yoksa 3/1 (biçim 4)
  const cm = T.cmap.off; let sub = null, best = -1;
  for (let i = 0; i < u16(cm + 2); i++) { const o = cm + 4 + i * 8; const pid = u16(o), eid = u16(o + 2), so = cm + u32(o + 4); const fmt = u16(so); const score = pid === 3 && eid === 10 && fmt === 12 ? 3 : pid === 3 && eid === 1 && fmt === 4 ? 2 : pid === 0 && (fmt === 4 || fmt === 12) ? 1 : 0; if (score > best) { best = score; sub = so; } }
  if (!sub) throw new Error('font: cmap');
  const glyphOf = (cp) => {
    const fmt = u16(sub);
    if (fmt === 12) { const ng = u32(sub + 12); for (let i = 0; i < ng; i++) { const o = sub + 16 + i * 12; const a = u32(o), b = u32(o + 4); if (cp >= a && cp <= b) return u32(o + 8) + cp - a; } return 0; }
    const segX2 = u16(sub + 6); const ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let i = 0; i < segX2 / 2; i++) {
      const e = u16(ends + i * 2); if (cp > e) continue; const s = u16(starts + i * 2); if (cp < s) return 0;
      const d = i16(deltas + i * 2), ro = u16(ranges + i * 2);
      if (!ro) return (cp + d) & 0xffff;
      const g = u16(ranges + i * 2 + ro + (cp - s) * 2); return g ? (g + d) & 0xffff : 0;
    }
    return 0;
  };
  // kern (biçim 0) varsa çift aralıkları; yoksa boş (GPOS okunmaz)
  const kern = new Map();
  if (T.kern) { const k = T.kern.off; const nt = u16(k + 2); let o = k + 4; for (let i = 0; i < nt; i++) { const len = u16(o + 2), cov = u16(o + 4); if ((cov >> 8) === 0) { const np = u16(o + 6); for (let j = 0; j < np; j++) { const q = o + 14 + j * 6; kern.set(u16(q) * 65536 + u16(q + 2), i16(q + 4)); } } o += len; } }
  const cache = new Map();
  // glif konturları: [[{x, y, on}]] (yazı tipi birimi)
  const contours = (g, depth = 0) => {
    if (cache.has(g)) return cache.get(g);
    const out = []; if (g < 0 || g >= nGlyphs || depth > 8) return out;
    const a = loca(g), b = loca(g + 1); if (b <= a) { cache.set(g, out); return out; }
    const o = T.glyf.off + a; const nc = i16(o);
    if (nc >= 0) {
      const endPts = []; for (let i = 0; i < nc; i++) endPts.push(u16(o + 10 + i * 2));
      const np = nc ? endPts[nc - 1] + 1 : 0; let p = o + 10 + nc * 2; p += 2 + u16(p);
      const flags = []; while (flags.length < np) { const f = dv.getUint8(p++); flags.push(f); if (f & 8) { let r = dv.getUint8(p++); while (r--) flags.push(f); } }
      const xs = [], ys = []; let v = 0;
      for (const f of flags) { if (f & 2) { const d = dv.getUint8(p++); v += f & 16 ? d : -d; } else if (!(f & 16)) { v += i16(p); p += 2; } xs.push(v); }
      v = 0; for (const f of flags) { if (f & 4) { const d = dv.getUint8(p++); v += f & 32 ? d : -d; } else if (!(f & 32)) { v += i16(p); p += 2; } ys.push(v); }
      let s = 0; for (const e of endPts) { const c = []; for (let i = s; i <= e; i++) c.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) }); if (c.length) out.push(c); s = e + 1; }
    } else {
      let p = o + 10, more = true;
      while (more) {
        const fl = u16(p), gi = u16(p + 2); p += 4; let dx, dy;
        if (fl & 1) { dx = fl & 2 ? i16(p) : 0; dy = fl & 2 ? i16(p + 2) : 0; p += 4; } else { dx = fl & 2 ? dv.getInt8(p) : 0; dy = fl & 2 ? dv.getInt8(p + 1) : 0; p += 2; }
        let m = [1, 0, 0, 1]; const f2 = (q) => i16(q) / 16384;
        if (fl & 8) { const s2 = f2(p); m = [s2, 0, 0, s2]; p += 2; } else if (fl & 0x40) { m = [f2(p), 0, 0, f2(p + 2)]; p += 4; } else if (fl & 0x80) { m = [f2(p), f2(p + 2), f2(p + 4), f2(p + 6)]; p += 8; }
        for (const c of contours(gi, depth + 1)) out.push(c.map((q) => ({ x: m[0] * q.x + m[2] * q.y + dx, y: m[1] * q.x + m[3] * q.y + dy, on: q.on })));
        more = !!(fl & 0x20);
      }
    }
    cache.set(g, out); return out;
  };
  return { upm, glyphOf, adv, contours, kern: (a, b) => kern.get(a * 65536 + b) || 0, ascent: i16(T.hhea.off + 4), descent: i16(T.hhea.off + 6) };
}

// İkinci dereceden (TrueType) konturu çokgene çevir; tol: kiriş toleransı (yazı tipi birimi)
function flatten(c, tol) {
  const n = c.length; if (n < 2) return [];
  // örtük "on" noktaları: art arda iki "off" arasında orta nokta
  const P = []; for (let i = 0; i < n; i++) { const a = c[i], b = c[(i + 1) % n]; P.push(a); if (!a.on && !b.on) P.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true }); }
  let k0 = P.findIndex((q) => q.on); if (k0 < 0) return [];
  const Q = [...P.slice(k0), ...P.slice(0, k0)]; const out = [[Q[0].x, Q[0].y]];
  for (let i = 1; i <= Q.length; i++) {
    const q = Q[i % Q.length];
    if (q.on) { out.push([q.x, q.y]); continue; }
    const s = out[out.length - 1], e = Q[(i + 1) % Q.length]; // e "on" olmak zorunda (örtük noktalar eklendi)
    const dev = Math.hypot((s[0] + e.x) / 2 - q.x, (s[1] + e.y) / 2 - q.y) / 2; // eğrinin kirişten en çok sapması
    const m = Math.max(1, Math.min(16, Math.ceil(Math.sqrt(dev / tol))));
    for (let k = 1; k <= m; k++) { const t2 = k / m, u = 1 - t2; out.push([u * u * s[0] + 2 * u * t2 * q.x + t2 * t2 * e.x, u * u * s[1] + 2 * u * t2 * q.y + t2 * t2 * e.y]); }
    i++;
  }
  // kapanış yinelenmesi ve art arda aynı/eşdoğrusal noktaları ayıkla
  const pts = [];
  for (const p of out) { const l = pts[pts.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > tol * 1e-3) pts.push(p); }
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= tol * 1e-3) pts.pop();
  for (let i = 0; i < pts.length && pts.length > 3;) {
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c2 = pts[(i + 1) % pts.length];
    const cr = (b[0] - a[0]) * (c2[1] - a[1]) - (b[1] - a[1]) * (c2[0] - a[0]);
    if (Math.abs(cr) <= 1e-9 * Math.max(1, Math.hypot(c2[0] - a[0], c2[1] - a[1]) ** 2)) pts.splice(i, 1); else i++;
  }
  return pts.length >= 3 ? pts : [];
}

// Metin → kapalı çokgenler (eskiz birimi, mm). opt: {height (büyük harf yüksekliği değil, yazı tipi em boyu oranında: ascent), x, y, angle(°), spacing}
export function textOutlines(font, text, { height = 10, x = 0, y = 0, angle = 0, tol = null } = {}) {
  const s = height / font.upm; const ca = Math.cos((angle * Math.PI) / 180), sa = Math.sin((angle * Math.PI) / 180);
  const ftol = tol != null ? tol / s : font.upm / 400;
  const out = []; let pen = 0, prev = null, line = 0;
  for (const ch of String(text)) {
    if (ch === '\n') { pen = 0; prev = null; line++; continue; }
    const g = font.glyphOf(ch.codePointAt(0)); if (prev != null) pen += font.kern(prev, g);
    const glyph = [];
    for (const c of font.contours(g)) {
      const poly = flatten(c, ftol); if (!poly.length) continue;
      glyph.push(poly.map(([u, v]) => { const px = (pen + u) * s, py = (v - line * (font.ascent - font.descent) * 1.2) * s; return [x + px * ca - py * sa, y + px * sa + py * ca]; }));
    }
    if (glyph.length) out.push(glyph);
    pen += font.adv(g); prev = g;
  }
  return out; // glif başına kontur listeleri
}
// Glif konturlarının sıfır olmayan sarım (TrueType dolgu kuralı) bölgesinin sınırı. Inter gibi yazı tiplerinde konturlar
// birbiriyle ve kendi kendileriyle çakışır; eskizde bu geçersiz profil verir. Konturlar düzlemsel olarak bölünür (kesişim ve
// T-kavşak noktalarında; yakın noktalar `snap` içinde birleşir), her parçanın iki yanındaki sarım sayısına bakılır: yalnız bir
// yanı dolu olan parçalar sınırdır. Döner: [[x1, y1, x2, y2], ...]
export function cleanSegments(glyphs, snap = 1e-4) {
  const out = []; const keyOf = (x, y) => Math.round(x / snap) + ',' + Math.round(y / snap);
  for (const polys of glyphs) {
    const S = []; for (const p of polys) for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > snap) S.push([a, b]); }
    const ts = S.map(() => [0, 1]);
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const [p, q] = S[i], [r, s] = S[j]; const dx = q[0] - p[0], dy = q[1] - p[1], ex = s[0] - r[0], ey = s[1] - r[1];
      const L1 = Math.hypot(dx, dy), L2 = Math.hypot(ex, ey); const d = dx * ey - dy * ex;
      const onSeg = (P, A, B, L) => { const t2 = ((P[0] - A[0]) * (B[0] - A[0]) + (P[1] - A[1]) * (B[1] - A[1])) / (L * L); const cx = A[0] + t2 * (B[0] - A[0]), cy = A[1] + t2 * (B[1] - A[1]); return t2 > 0 && t2 < 1 && Math.hypot(P[0] - cx, P[1] - cy) < snap ? t2 : null; };
      if (Math.abs(d) > 1e-12 * L1 * L2) {
        const t2 = ((r[0] - p[0]) * ey - (r[1] - p[1]) * ex) / d, u = ((r[0] - p[0]) * dy - (r[1] - p[1]) * dx) / d;
        if (t2 > -snap / L1 && t2 < 1 + snap / L1 && u > -snap / L2 && u < 1 + snap / L2) { if (t2 > 0 && t2 < 1) ts[i].push(t2); if (u > 0 && u < 1) ts[j].push(u); }
      }
      // uç noktası öbür parçanın üzerinde (T-kavşak, eşdoğrusal örtüşme)
      for (const P of [r, s]) { const t2 = onSeg(P, p, q, L1); if (t2 != null) ts[i].push(t2); }
      for (const P of [p, q]) { const t2 = onSeg(P, r, s, L2); if (t2 != null) ts[j].push(t2); }
    }
    const pieces = new Map();
    S.forEach(([a, b], i) => {
      const T = [...new Set(ts[i])].sort((x, y) => x - y); const at = (t2) => [a[0] + t2 * (b[0] - a[0]), a[1] + t2 * (b[1] - a[1])];
      for (let k = 0; k + 1 < T.length; k++) {
        const A = at(T[k]), B = at(T[k + 1]); const ka = keyOf(...A), kb = keyOf(...B); if (ka === kb) continue;
        const key = ka < kb ? ka + '|' + kb : kb + '|' + ka; if (!pieces.has(key)) pieces.set(key, [A, B]);
      }
    });
    // noktalar ızgaraya oturtulur (aynı anahtar → aynı konum): parçalar uç uca tam birleşir
    const snapPt = new Map(); const sp = (P) => { const k = keyOf(...P); if (!snapPt.has(k)) snapPt.set(k, P); return snapPt.get(k); };
    for (const [A0, B0] of pieces.values()) {
      const A = sp(A0), B = sp(B0); const len = Math.hypot(B[0] - A[0], B[1] - A[1]); if (!(len > snap)) continue;
      const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], n = [-(B[1] - A[1]) / len, (B[0] - A[0]) / len]; const dl = Math.min(snap * 0.25, len * 0.01);
      const wl = windingAt(polys, m[0] + n[0] * dl, m[1] + n[1] * dl) !== 0, wr = windingAt(polys, m[0] - n[0] * dl, m[1] - n[1] * dl) !== 0;
      if (wl !== wr) out.push([A[0], A[1], B[0], B[1]]);
    }
  }
  return out;
}
export function windingAt(polys, x, y) {
  let w = 0;
  for (const p of polys) for (let i = 0; i < p.length; i++) {
    const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length];
    if (ay <= y) { if (by > y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) > 0) w++; } else if (by <= y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) < 0) w--;
  }
  return w;
}
// Parçaları (x1,y1,x2,y2) eskiz noktası + çizgi varlıklarına çevir: uç noktalar birleştirilir (aynı konum → aynı nokta)
export function segmentsToSketch(segs, newPoint, newLine, tol = 1e-6) {
  const key = (x, y) => Math.round(x / tol) + ',' + Math.round(y / tol);
  // sarkan (tek uçlu) parçalar kapalı sınıra ait olamaz: yinelemeli ayıklanır (ince şerit hücrelerinden kalan kırıntılar)
  let S = segs.map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, a: key(x1, y1), b: key(x2, y2) })).filter((s) => s.a !== s.b);
  for (let guard = 0; guard < 100; guard++) {
    const deg = new Map(); for (const s of S) { deg.set(s.a, (deg.get(s.a) || 0) + 1); deg.set(s.b, (deg.get(s.b) || 0) + 1); }
    const T = S.filter((s) => deg.get(s.a) > 1 && deg.get(s.b) > 1); if (T.length === S.length) break; S = T;
  }
  const ids = new Map(); const pt = (k, x, y) => { let id = ids.get(k); if (!id) { id = newPoint(x, y); ids.set(k, id); } return id; };
  for (const s of S) newLine(pt(s.a, s.x1, s.y1), pt(s.b, s.x2, s.y2));
  return S.length;
}
export const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };

// ---------------------------------------------------------------- yazı tipini yükle (tarayıcı: Vite ?url, Node testleri: dosya)
let fontP = null;
export function loadFont() {
  if (!fontP) fontP = import('./fonts/Inter-Regular.ttf?url').then((m) => fetch(m.default)).then((r) => r.arrayBuffer()).then(parseFont).catch((e) => { fontP = null; throw e; });
  return fontP;
}

// Arayüz kilitlenmesin: 500 karakter ~27 sn sürüyordu (çözücü + profil taraması); sınır 120 karakter
export const TEXT_MAX = 120;
// ---------------------------------------------------------------- Sketcher yöntemleri (Object.assign ile Sketcher.prototype'a)
export const TEXT_METHODS = {
  // Metni etkin eskize çizgi varlıkları olarak ekler (tek geri alma adımı). Döner {ok, n (kontur), msg?}
  async insertText({ text, height = 10, x = 0, y = 0, angle = 0 } = {}) {
    if (!text || !String(text).trim()) return { ok: false, msg: t('sk.text_empty') };
    if (!(height > 0 && height <= 10000) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(angle)) return { ok: false, msg: t('sk.text_height') };
    if ([...String(text)].length > TEXT_MAX) return { ok: false, msg: t('sk.text_long', { n: TEXT_MAX }) };
    let font; try { font = await loadFont(); } catch (e) { return { ok: false, msg: t('sk.text_font_failed') }; }
    const glyphs = textOutlines(font, text, { height, x, y, angle });
    if (!glyphs.length) return { ok: false, msg: t('sk.text_no_glyph') };
    const snap = Math.max(1e-4, height * 2e-5);
    const segs = cleanSegments(glyphs, snap); if (!segs.length) return { ok: false, msg: t('sk.text_no_glyph') };
    let n = 0;
    const r = await this._apply((sk) => {
      n = segmentsToSketch(segs, (px, py) => { const id = this._id('p'); sk.points[id] = { x: px, y: py }; return id; }, (a, b) => sk.ents.push({ id: this._id('l'), type: 'line', a, b }), snap);
    }, { kind: tk('sk.kind.text') });
    if (r.ok) { this._setSel([]); }
    return { ...r, n, glyphs: glyphs.length };
  },
};
