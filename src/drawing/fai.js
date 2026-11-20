// WP-17: ilk parca kontrol formu (FAI): olculerden balon numarali olcu listesi. "Olculen" ve "Sonuc" sutunlari BOS birakilir (dolduran
// kalite sorumlusudur). Cikti: satirlar, CSV (TR: ';' ayirici + ',' ondalik; EN: ',' + '.'; UTF-8 BOM'lu, O onerisi) ve PDF sayfalari.
import { fmtN, fmtDev } from './dims.js';
import { table } from './sheet.js';

const TYPE_KEY = { lin: 'drw.dim.lin', dia: 'drw.dim.dia', rad: 'drw.dim.rad', ang: 'drw.dim.ang', ord: 'drw.dim.ord' };
export function faiRows(dr, composed, T) {
  const prec = dr.sheet.prec ?? 2, dec = dr.sheet.dec || ',';
  const vname = new Map(); dr.views.forEach((v, i) => vname.set(v.id, v.label ? v.label : String(i + 1)));
  const rows = [];
  for (const d of composed.dims) {
    if (d.n == null) continue;
    const src = (dr.dims || []).find((x) => x.id === d.id) || {};
    const dev = d.dev; const nom = d.value;
    const p = src.type === 'ang' ? Math.min(prec, 2) : prec;
    rows.push({
      n: d.n, view: vname.get(d.view) ?? '', type: T(TYPE_KEY[src.type] || 'drw.dim.lin'),
      nominal: d.text ? d.text.main : fmtN(nom, p, dec),
      upper: dev ? fmtDev(dev.upper, dec) : '', lower: dev ? fmtDev(dev.lower, dec) : '',
      min: nom != null ? fmtN(nom + (dev ? dev.lower : 0), 4, dec) : '', max: nom != null ? fmtN(nom + (dev ? dev.upper : 0), 4, dec) : '',
      measured: '', result: '', lost: !!d.lost,
    });
  }
  return rows;
}
export const FAI_COLS = ['n', 'view', 'type', 'nominal', 'upper', 'lower', 'min', 'max', 'measured', 'result'];
const head = (T) => FAI_COLS.map((c) => T('drw.fai.' + c));
export function faiCsv(rows, T, dec = ',') {
  const sep = dec === ',' ? ';' : ',';
  const q = (v) => { const s = String(v ?? ''); return /["\n\r;,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [head(T).map(q).join(sep), ...rows.map((r) => FAI_COLS.map((c) => q(c === 'result' && r.lost ? T('drw.fai.lost') : r[c])).join(sep))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
// A4 dikey sayfalar: ust bilgi (resim adi/no, parca, tarih alani) + tablo; sayfa basina 34 satir
export function faiPages(dr, rows, T) {
  const W = 210, H = 297; const per = 34; const pages = []; const tb = dr.sheet.tb || {};
  for (let i = 0; i < Math.max(1, Math.ceil(rows.length / per)); i++) {
    const list = [];
    list.push({ k: 't', p: [15, H - 18], s: T('drw.fai.title'), h: 5, rot: 0, al: 'l', va: 'b', ly: 'txt' });
    const meta = [[T('drw.tb.title'), tb.title || dr.name || ''], [T('drw.tb.number'), tb.number || ''], [T('drw.tb.rev'), tb.rev || ''], [T('drw.fai.inspector'), ''], [T('drw.tb.date'), ''], [T('drw.fai.page'), `${i + 1}/${Math.max(1, Math.ceil(rows.length / per))}`]];
    meta.forEach(([k, v], j) => { const x = 15 + (j % 3) * 62, y = H - 28 - Math.floor(j / 3) * 7; list.push({ k: 't', p: [x, y], s: k + ': ' + v, h: 2.5, rot: 0, al: 'l', va: 'b', ly: 'txt' }); list.push({ k: 'l', a: [x, y - 1], b: [x + 58, y - 1], ly: 'thin' }); });
    const part = rows.slice(i * per, (i + 1) * per);
    table(list, [15, H - 45], head(T), part.map((r) => FAI_COLS.map((c) => (c === 'result' && r.lost ? T('drw.fai.lost') : r[c]))), [9, 12, 20, 34, 15, 15, 17, 17, 22, 19], 2.3);
    pages.push({ W, H, list });
  }
  return pages;
}
