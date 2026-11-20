// WP-17: bagimliliksiz vektor PDF 1.4 yazici. Cizim listesi (sayfa mm) -> PDF baytlari. Yazi tipi: standart Helvetica (gomulu degil),
// WinAnsi + Turkce harfler icin /Differences (Latin-5 konumlari). Dosya yalniz 7 bit ASCII'dir (8 bitlik baytlar sekizli kacisla).
import { LAYERS } from './sheet.js';
import { textWidth, emOf, pdfBytes, PDF_DIFF_NAMES } from './text.js';

const K = 72 / 25.4;
const f = (v) => { const s = (Math.round(v * 1000) / 1000).toString(); return s === '-0' ? '0' : s; };
function pdfStr(s) {
  let o = '(';
  for (const b of pdfBytes(s)) { if (b === 40 || b === 41 || b === 92) o += '\\' + String.fromCharCode(b); else if (b < 32 || b > 126) o += '\\' + b.toString(8).padStart(3, '0'); else o += String.fromCharCode(b); }
  return o + ')';
}
function arcBez(c, r, a0, sw) {
  const n = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 2))); const d = sw / n; const k = (4 / 3) * Math.tan(d / 4); const out = [];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + d * i, t1 = t0 + d; const p0 = [c[0] + r * Math.cos(t0), c[1] + r * Math.sin(t0)], p3 = [c[0] + r * Math.cos(t1), c[1] + r * Math.sin(t1)];
    const p1 = [p0[0] - k * r * Math.sin(t0), p0[1] + k * r * Math.cos(t0)], p2 = [p3[0] + k * r * Math.sin(t1), p3[1] - k * r * Math.cos(t1)];
    out.push([p0, p1, p2, p3]);
  }
  return out;
}
function content(list, H) {
  void H; const o = [`q ${f(K)} 0 0 ${f(K)} 0 0 cm 1 J 1 j`];
  let cur = null;
  const style = (ly) => {
    if (cur === ly) return; cur = ly; const L = LAYERS[ly] || LAYERS.thin; const c = L.color || [0, 0, 0];
    o.push(`${f(L.w)} w [${(L.dash || []).map(f).join(' ')}] 0 d ${c.map(f).join(' ')} RG ${c.map(f).join(' ')} rg`);
  };
  for (const it of list) {
    style(it.ly);
    if (it.k === 'l') o.push(`${f(it.a[0])} ${f(it.a[1])} m ${f(it.b[0])} ${f(it.b[1])} l S`);
    else if (it.k === 'p' || it.k === 'f') { if (!it.pts.length) continue; o.push(`${f(it.pts[0][0])} ${f(it.pts[0][1])} m ` + it.pts.slice(1).map((q) => `${f(q[0])} ${f(q[1])} l`).join(' ') + (it.k === 'f' ? ' h f' : it.closed ? ' h S' : ' S')); }
    else if (it.k === 'c' || it.k === 'a') {
      const segs = it.k === 'c' ? arcBez(it.c, it.r, 0, Math.PI * 2) : arcBez(it.c, it.r, it.a0, it.sw);
      o.push(`${f(segs[0][0][0])} ${f(segs[0][0][1])} m ` + segs.map((s) => `${f(s[1][0])} ${f(s[1][1])} ${f(s[2][0])} ${f(s[2][1])} ${f(s[3][0])} ${f(s[3][1])} c`).join(' ') + (it.k === 'c' ? ' h S' : ' S'));
    } else if (it.k === 't') {
      if (!it.s) continue; const w = textWidth(it.s, it.h); const a = ((it.rot || 0) * Math.PI) / 180; const ca = Math.cos(a), sa = Math.sin(a);
      const dx = it.al === 'c' ? -w / 2 : it.al === 'r' ? -w : 0; const dy = it.va === 't' ? -it.h : it.va === 'm' ? -it.h / 2 : 0;
      const x = it.p[0] + dx * ca - dy * sa, y = it.p[1] + dx * sa + dy * ca;
      o.push(`BT /F1 ${f(emOf(it.h))} Tf ${f(ca)} ${f(sa)} ${f(-sa)} ${f(ca)} ${f(x)} ${f(y)} Tm ${pdfStr(it.s)} Tj ET`);
    }
  }
  o.push('Q');
  return o.join('\n');
}
// pages: [{W, H, list}] -> Uint8Array; meta.title: belge basligi (Info sozlugu)
export function toPdf(pages, meta = {}) {
  const objs = []; // 1-tabanli
  const add = (s) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(null); // Pages sonra
  const font = add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding ${PDF_DIFF_NAMES} >> >>`);
  const kids = [];
  for (const pg of pages) {
    const c = content(pg.list, pg.H);
    const cs = add(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pg.W * K)} ${f(pg.H * K)}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${cs} 0 R >>`));
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Producer ${pdfStr('Mihenk')} /Title ${pdfStr(meta.title || '')} >>`);
  let out = '%PDF-1.4\n%âãÏÓ\n'.replace(/[^\x00-\x7f]/g, '~');
  const offs = [];
  objs.forEach((s, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${s}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((x) => String(x).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
