// WP-17: metin olcusu (Helvetica AFM genislikleri, 1/1000 em) ve PDF tek bayt kodlamasi (WinAnsi + Turkce harfler, Latin-5 konumlari).
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const EXTRA = { 0xd8: 778, 0xf8: 611, 0xb0: 400, 0xb1: 584, 0xd7: 584, 0x11e: 778, 0x11f: 556, 0x130: 278, 0x131: 278, 0x15e: 667, 0x15f: 500, 0xc7: 722, 0xe7: 500, 0xd6: 778, 0xf6: 556, 0xdc: 722, 0xfc: 556 };
export function charW(ch) { const c = ch.codePointAt(0); if (c >= 32 && c <= 126) return W[c - 32]; return EXTRA[c] ?? 556; }
export const textWidth = (s, h) => [...String(s)].reduce((a, ch) => a + charW(ch), 0) * h / 1000 / 0.72; // h: buyuk harf yuksekligi (mm); Helvetica cap ~0,72 em
export const emOf = (h) => h / 0.72; // cap yuksekliginden yazi tipi boyu
// PDF kodlamasi: Latin-1 (WinAnsi ile 0xA0-0xFF ortak) + Latin-5 farklari
export const PDF_DIFF = { 0x11e: 0xd0, 0x130: 0xdd, 0x15e: 0xde, 0x11f: 0xf0, 0x131: 0xfd, 0x15f: 0xfe };
export const PDF_DIFF_NAMES = '/Differences [208 /Gbreve 221 /Idotaccent 222 /Scedilla 240 /gbreve 253 /dotlessi 254 /scedilla]';
export function pdfBytes(s) {
  const out = [];
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (PDF_DIFF[c] !== undefined) out.push(PDF_DIFF[c]);
    else if ((c >= 32 && c <= 126) || (c >= 0xa0 && c <= 0xff && ![0xd0, 0xdd, 0xde, 0xf0, 0xfd, 0xfe].includes(c))) out.push(c);
    else out.push(63);
  }
  return out;
}
