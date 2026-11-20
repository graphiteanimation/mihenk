// WP-17: cizim listesi -> SVG metni (arayuz onizlemesi). Koordinat: sayfa mm, y asagi (Y = H - y). Metinler kacislanir.
import { LAYERS } from './sheet.js';
import { textWidth } from './text.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f = (v) => (Math.round(v * 1000) / 1000).toString();
export function toSvg(page, o = {}) {
  const { W, H, list } = page; const Y = (y) => H - y; const out = [];
  const st = (ly, fill = false) => { const L = LAYERS[ly] || LAYERS.thin; const c = L.color ? `rgb(${L.color.map((x) => Math.round(x * 255)).join(',')})` : 'currentColor'; return fill ? `fill="${c}" stroke="none"` : `fill="none" stroke="${c}" stroke-width="${L.w}"${L.dash ? ` stroke-dasharray="${L.dash.join(' ')}"` : ''}`; };
  for (const it of list) {
    const extra = it.id ? ` data-id="${esc(it.id)}"` : '';
    if (it.k === 'l') out.push(`<line x1="${f(it.a[0])}" y1="${f(Y(it.a[1]))}" x2="${f(it.b[0])}" y2="${f(Y(it.b[1]))}" ${st(it.ly)}${extra}/>`);
    else if (it.k === 'p' || it.k === 'f') out.push(`<${it.closed || it.k === 'f' ? 'polygon' : 'polyline'} points="${it.pts.map((q) => f(q[0]) + ',' + f(Y(q[1]))).join(' ')}" ${st(it.ly, it.k === 'f')}${extra}/>`);
    else if (it.k === 'c') out.push(`<circle cx="${f(it.c[0])}" cy="${f(Y(it.c[1]))}" r="${f(it.r)}" ${st(it.ly)}${extra}/>`);
    else if (it.k === 'a') {
      const p0 = [it.c[0] + it.r * Math.cos(it.a0), it.c[1] + it.r * Math.sin(it.a0)], p1 = [it.c[0] + it.r * Math.cos(it.a0 + it.sw), it.c[1] + it.r * Math.sin(it.a0 + it.sw)];
      out.push(`<path d="M${f(p0[0])} ${f(Y(p0[1]))} A${f(it.r)} ${f(it.r)} 0 ${it.sw > Math.PI ? 1 : 0} 0 ${f(p1[0])} ${f(Y(p1[1]))}" ${st(it.ly)}${extra}/>`);
    } else if (it.k === 't') {
      if (!it.s) continue; const w = textWidth(it.s, it.h); const a = ((it.rot || 0) * Math.PI) / 180;
      const dx = it.al === 'c' ? -w / 2 : it.al === 'r' ? -w : 0; const dy = it.va === 't' ? -it.h : it.va === 'm' ? -it.h / 2 : 0;
      const x = it.p[0] + dx * Math.cos(a) - dy * Math.sin(a), y = it.p[1] + dx * Math.sin(a) + dy * Math.cos(a);
      const L = LAYERS[it.ly] || LAYERS.txt; const c = L.color ? `rgb(${L.color.map((v) => Math.round(v * 255)).join(',')})` : 'currentColor';
      out.push(`<text x="${f(x)}" y="${f(Y(y))}" font-size="${f(it.h / 0.72)}" font-family="Helvetica, Arial, sans-serif" fill="${c}"${it.rot ? ` transform="rotate(${f(-it.rot)} ${f(x)} ${f(Y(y))})"` : ''}${extra}>${esc(it.s)}</text>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" width="${o.width || f(W) + 'mm'}" height="${o.height || f(H) + 'mm'}" stroke-linecap="round" stroke-linejoin="round">${o.bg ? `<rect width="${f(W)}" height="${f(H)}" fill="${o.bg}"/>` : ''}${out.join('')}</svg>`;
}
