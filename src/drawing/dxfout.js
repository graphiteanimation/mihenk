// WP-17: cizim listesi -> DXF R12 (AC1009, ASCII). Katmanlar ve cizgi turleri (CONTINUOUS, HIDDEN, CENTER) tablolarla yazilir.
// Metin: TEXT; ASCII disi karakterler AutoCAD denetim kodlari (%%c cap, %%d derece, %%p arti-eksi) ya da \U+XXXX ile kacislanir.
// Dolu oklar SOLID, cokgen cizgi ve elips/B-spline parcalari LINE dizisi olarak yazilir (eski okuyucularla uyum, O onerisi).
import { LAYERS } from './sheet.js';
import { textWidth } from './text.js';

const f6 = (v) => (Math.abs(v) < 1e-12 ? '0' : String(+v.toFixed(6)));
const deg = (a) => ((((a * 180) / Math.PI) % 360) + 360) % 360;
export const DXF_LAYER = { vis: 'VISIBLE', tan: 'TANGENT', hid: 'HIDDEN', ctr: 'CENTER', cut: 'CUTTING', cutk: 'CUTTING', hat: 'HATCH', dim: 'DIM', lost: 'DIM_LOST', txt: 'TEXT', frm: 'FRAME', tb: 'TITLE', thin: 'THIN' };
function dxfText(s) {
  let o = '';
  for (const ch of String(s)) { const c = ch.codePointAt(0); if (c === 0xd8 || c === 0xf8) o += '%%c'; else if (c === 0xb0) o += '%%d'; else if (c === 0xb1) o += '%%p'; else if (c >= 32 && c <= 126) o += ch; else o += '\\U+' + c.toString(16).toUpperCase().padStart(4, '0'); }
  return o;
}
export function toDxf(page) {
  const o = []; const w = (c, v) => o.push(String(c), String(v));
  const layers = [...new Set(Object.values(DXF_LAYER))];
  const lyOf = (k) => DXF_LAYER[k] || 'THIN';
  w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, 'AC1009'); w(9, '$MEASUREMENT'); w(70, 1); w(9, '$EXTMIN'); w(10, 0); w(20, 0); w(30, 0); w(9, '$EXTMAX'); w(10, f6(page.W)); w(20, f6(page.H)); w(30, 0); w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'TABLES');
  const LT = [['CONTINUOUS', 'Solid line', []], ['HIDDEN', '__ __ __', [3, -1.5]], ['CENTER', '____ _ ____', [8, -1.5, 0.5, -1.5]]];
  w(0, 'TABLE'); w(2, 'LTYPE'); w(70, LT.length);
  for (const [nm, desc, pat] of LT) { w(0, 'LTYPE'); w(2, nm); w(70, 0); w(3, desc); w(72, 65); w(73, pat.length); w(40, f6(pat.reduce((a, b) => a + Math.abs(b), 0))); for (const p of pat) w(49, f6(p)); }
  w(0, 'ENDTAB');
  w(0, 'TABLE'); w(2, 'LAYER'); w(70, layers.length + 1);
  w(0, 'LAYER'); w(2, '0'); w(70, 0); w(62, 7); w(6, 'CONTINUOUS');
  for (const nm of layers) { const k = Object.keys(DXF_LAYER).find((x) => DXF_LAYER[x] === nm); const L = LAYERS[k] || LAYERS.thin; w(0, 'LAYER'); w(2, nm); w(70, 0); w(62, L.col || 7); w(6, L.lt || 'CONTINUOUS'); }
  w(0, 'ENDTAB'); w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'ENTITIES');
  const counts = { LINE: 0, CIRCLE: 0, ARC: 0, TEXT: 0, SOLID: 0 };
  const line = (a, b, ly) => { w(0, 'LINE'); w(8, ly); w(10, f6(a[0])); w(20, f6(a[1])); w(30, 0); w(11, f6(b[0])); w(21, f6(b[1])); w(31, 0); counts.LINE++; };
  for (const it of page.list) {
    const ly = lyOf(it.ly);
    if (it.k === 'l') line(it.a, it.b, ly);
    else if (it.k === 'p') { for (let i = 1; i < it.pts.length; i++) line(it.pts[i - 1], it.pts[i], ly); if (it.closed && it.pts.length > 2) line(it.pts[it.pts.length - 1], it.pts[0], ly); }
    else if (it.k === 'c') { w(0, 'CIRCLE'); w(8, ly); w(10, f6(it.c[0])); w(20, f6(it.c[1])); w(30, 0); w(40, f6(it.r)); counts.CIRCLE++; }
    else if (it.k === 'a') { w(0, 'ARC'); w(8, ly); w(10, f6(it.c[0])); w(20, f6(it.c[1])); w(30, 0); w(40, f6(it.r)); w(50, f6(deg(it.a0))); w(51, f6(deg(it.a0 + it.sw))); counts.ARC++; }
    else if (it.k === 'f') { const p = it.pts; const q = [p[0], p[1], p[2], p[3] || p[2]]; w(0, 'SOLID'); w(8, ly); [10, 11, 13, 12].forEach((c, i) => { w(c, f6(q[i][0])); w(c + 10, f6(q[i][1])); w(c + 20, 0); }); counts.SOLID++; }
    else if (it.k === 't') {
      if (!it.s) continue; const a = ((it.rot || 0) * Math.PI) / 180; const wd = textWidth(it.s, it.h);
      const dx = it.al === 'c' ? -wd / 2 : it.al === 'r' ? -wd : 0; const dy = it.va === 't' ? -it.h : it.va === 'm' ? -it.h / 2 : 0;
      const x = it.p[0] + dx * Math.cos(a) - dy * Math.sin(a), y = it.p[1] + dx * Math.sin(a) + dy * Math.cos(a);
      w(0, 'TEXT'); w(8, ly); w(10, f6(x)); w(20, f6(y)); w(30, 0); w(40, f6(it.h)); w(1, dxfText(it.s)); if (it.rot) w(50, f6(it.rot)); counts.TEXT++;
    }
  }
  w(0, 'ENDSEC'); w(0, 'EOF');
  return { text: o.join('\n') + '\n', counts };
}
