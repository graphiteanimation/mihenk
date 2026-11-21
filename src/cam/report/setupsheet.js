// WP-07 dilim 6: kurulum foyu (setup sheet) - yazdirilabilir TEK dosya HTML (tarayicidan PDF'e yazdirilir).
// Veri kaynagi: hesaplanmis islemler (parca/stok/orijin, takim, islem listesi, sureler) - belge verisinden; disaridan bir sey cekmez.
// Guvenlik: kullanici metinleri (parca/islem/kurulum/takim adlari, tezgah adi, malzeme) HER ZAMAN esc() ile kacislanir; HTML'de
// satir ici betik, olay ozniteligi, style ozniteligi, dis kaynak (src/href/link/import/font) YOKTUR. Dosya kendi CSP'sini tasir:
// default-src 'none'; stil yalniz asagidaki sabit CSS'in SHA-256 ozeti ile (test ozetin CSS ile eslestigini dogrular).
// Resimler satir ici SVG'dir (ozellik sunumlari; betik yok). Yazdirma: tarayicidan Ctrl+P.

export const SHEET_CSS = `
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body { font: 11px/1.4 Arial, Helvetica, sans-serif; color: #111; margin: 0 auto; max-width: 190mm; padding: 8mm; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 14px; margin: 16px 0 6px; border-bottom: 1px solid #444; padding-bottom: 2px; }
h3 { font-size: 12px; margin: 10px 0 4px; }
table { border-collapse: collapse; width: 100%; margin: 4px 0 8px; }
th, td { border: 1px solid #888; padding: 2px 5px; text-align: left; vertical-align: top; }
th { background: #e6e6e6; }
td.n, th.n { text-align: right; }
.meta td { border: none; padding: 1px 8px 1px 0; }
.setup { page-break-inside: avoid; }
.pics { display: flex; gap: 10px; flex-wrap: wrap; }
.pic { border: 1px solid #aaa; padding: 3px; }
.small { font-size: 9.5px; color: #333; }
.hint { font-size: 10px; color: #555; }
.warn { border: 1px solid #a60; background: #fff4e0; padding: 3px 6px; margin: 6px 0; }
@media print { .hint { display: none; } body { padding: 0; } }
`;
// SHEET_CSS'in SHA-256 ozeti (base64). Test: node crypto ile hesaplanan ile ayni olmalidir; CSS degisirse test bu sabiti dusurur.
export const SHEET_CSS_HASH = 'sha256-8ur+e2h+cYHQOprHhjFgtQId3Oo4rqQg9NfqKFsk5hA=';
export const SHEET_CSP = `default-src 'none'; style-src '${SHEET_CSS_HASH}'; base-uri 'none'; form-action 'none'`;

export function esc(v) {
  return String(v ?? '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[c]);
}
const num = (v, d = 3) => { if (!Number.isFinite(v)) return '-'; const r = Math.round(v * 10 ** d) / 10 ** d; return String(Object.is(r, -0) ? 0 : r); };
const dur = (min) => { if (!Number.isFinite(min)) return '-'; const s = Math.round(min * 60); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// Tam sozluk anahtarlari (dinamik anahtar yok)
const TOOL_KEY = { flat: 'cam.tt.flat', ball: 'cam.tt.ball', bullnose: 'cam.tt.bullnose', drill: 'cam.tt.drill', spot: 'cam.tt.spot', tap: 'cam.tt.tap', chamfer: 'cam.tt.chamfer', face: 'cam.tt.face', reamer: 'cam.tt.reamer', bore: 'cam.tt.bore', threadmill: 'cam.tt.threadmill' };
const OP_KEY = { contour: 'cam.op.type.contour', drill: 'cam.op.type.drill', face: 'cam.op.type.face', pocket: 'cam.op.type.pocket', chamfer: 'cam.op.type.chamfer', circular: 'cam.op.type.circular', threadmill: 'cam.op.type.threadmill', slot: 'cam.op.type.slot', trace: 'cam.op.type.trace', adaptive: 'cam.op.type.adaptive', flat: 'cam.op.type.flat', adaptive3d: 'cam.op.type.adaptive3d', zlevel: 'cam.op.type.zlevel', parallel: 'cam.op.type.parallel', scallop: 'cam.op.type.scallop', pencil: 'cam.op.type.pencil' };

// Kesme beslemesi: ilk 'cut' hareketi (yoksa dongu f, yoksa ilk ilerleme)
export function feedOf(tp) {
  let any = null;
  for (const m of tp.moves || []) {
    if ((m.t === 'feed' || m.t === 'arc') && m.f > 0) { if (m.kind === 'cut') return m.f; if (any == null) any = m.f; }
    else if (m.t === 'cycle' && m.f > 0 && any == null) any = m.f;
  }
  return any;
}

// ---- resimler (satir ici SVG, yalniz sunum oznitelikleri)
// Kurulum eksenlerinde: stok kutusu (gri), parca kutusu (mavi), orijin (0,0,0) ve X/Y/Z oklari. view: 'top' (X-Y) | 'side' (X-Z)
export function pictureSvg(S, view, tr) {
  const W = 250, H = 170, pad = 22;
  const sb = S.stockBox, mb = S.modelBBox || S.stockBox; const a = view === 'top' ? 1 : 2; // dikey eksen indeksi
  const x0 = Math.min(sb.min[0], mb.min[0], 0), x1 = Math.max(sb.max[0], mb.max[0], 0);
  const y0 = Math.min(sb.min[a], mb.min[a], 0), y1 = Math.max(sb.max[a], mb.max[a], 0);
  const sc = Math.min((W - 2 * pad) / Math.max(x1 - x0, 1e-6), (H - 2 * pad) / Math.max(y1 - y0, 1e-6));
  const px = (x) => pad + (x - x0) * sc, py = (y) => H - pad - (y - y0) * sc;
  const rect = (b, fill, stroke) => `<rect x="${num(px(b.min[0]), 2)}" y="${num(py(b.max[a]), 2)}" width="${num((b.max[0] - b.min[0]) * sc, 2)}" height="${num((b.max[a] - b.min[a]) * sc, 2)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
  const ox = px(0), oy = py(0), L = 26;
  const arrow = (dx, dy, col, label) => `<line x1="${num(ox, 2)}" y1="${num(oy, 2)}" x2="${num(ox + dx, 2)}" y2="${num(oy + dy, 2)}" stroke="${col}" stroke-width="2"/><text x="${num(ox + dx * 1.25 + (dx ? 2 : 4), 2)}" y="${num(oy + dy * 1.25 + (dy ? 0 : 4), 2)}" font-size="11" font-family="Arial" fill="${col}">${esc(label)}</text>`;
  const title = view === 'top' ? tr('cam.sheet.pic_top') : tr('cam.sheet.pic_side');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`
    + `<text x="4" y="12" font-size="10" font-family="Arial" fill="#333">${esc(title)}</text>`
    + rect(sb, '#e4e4e4', '#555') + rect(mb, '#bcd4f2', '#1f5fa8')
    + arrow(L, 0, '#c00', 'X') + arrow(0, -L, view === 'top' ? '#080' : '#00c', view === 'top' ? 'Y' : 'Z')
    + `<circle cx="${num(ox, 2)}" cy="${num(oy, 2)}" r="3" fill="#000"/></svg>`;
}

const stockText = (S, tr) => (S.stock?.kind === 'cyl' ? tr('cam.sheet.raw_cyl', { d: num(S.stock.dia), l: num(S.stock.len) })
  : tr('cam.sheet.raw_box', { x: num(S.stockBox.max[0] - S.stockBox.min[0]), y: num(S.stockBox.max[1] - S.stockBox.min[1]), z: num(S.stockBox.max[2] - S.stockBox.min[2]) }));
const range = (b, i) => num(b.min[i]) + ' … ' + num(b.max[i]);

// data: { title, date, machineName, material, programName, items:[{ setupName, stockFrom, S, opName, opType, tp }], toolNames:{[T]: ad}, tr(key, params), lang }
export function buildSetupSheet(data) {
  const tr = data.tr; const items = data.items || [];
  const e = (k, p) => esc(tr(k, p));
  // kurulumlar (S.id'ye gore, sirayla)
  const setups = []; const bySetup = new Map();
  for (const it of items) {
    const id = it.S.id; let g = bySetup.get(id);
    if (!g) { g = { id, name: it.setupName ?? it.S.name ?? id, S: it.S, stockFrom: it.stockFrom, ops: [] }; bySetup.set(id, g); setups.push(g); }
    g.ops.push(it);
  }
  const toolsMap = new Map(); let totalMin = 0, nOps = 0;
  const opRows = [];
  for (const g of setups) {
    g.min = 0;
    for (const it of g.ops) {
      const tp = it.tp; const min = tp.stats?.timeMin ?? 0; g.min += min; totalMin += min; nOps++;
      const T = tp.tool.number; let tl = toolsMap.get(T); if (!tl) { tl = { T, tool: tp.tool, n: 0, min: 0 }; toolsMap.set(T, tl); }
      tl.n++; tl.min += min;
      const isTap = tp.tool.type === 'tap' && it.opType === 'drill';
      opRows.push({ g, it, min, label: tr(isTap ? 'cam.op.type.thread' : (OP_KEY[it.opType] || OP_KEY.contour)), feed: feedOf(tp) });
    }
  }
  const tools = [...toolsMap.values()].sort((a, b) => a.T - b.T);
  const parts = [];
  parts.push(`<h1>${e('cam.sheet.title')}</h1>`);
  parts.push(`<p class="hint">${e('cam.sheet.print_hint')}</p>`);
  const meta = [['cam.sheet.part', data.title], ['cam.sheet.program', data.programName], ['cam.sheet.machine', data.machineName], ['cam.sheet.material', data.material], ['cam.sheet.date', data.date]].filter((r) => r[1] != null && r[1] !== '');
  parts.push('<table class="meta">' + meta.map((r) => `<tr><th>${e(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('') + `<tr><th>${e('cam.sheet.summary')}</th><td>${e('cam.sheet.summary_v', { setups: setups.length, tools: tools.length, ops: nOps, time: dur(totalMin) })}</td></tr></table>`);
  // kurulumlar
  parts.push(`<h2>${e('cam.sheet.setups')}</h2>`);
  setups.forEach((g, k) => {
    const S = g.S; const wo = S.workOffset ? S.workOffset.kind + (S.workOffset.kind === 'G54.1' ? ' P' + S.workOffset.p : '') : '';
    parts.push(`<div class="setup"><h3>${e('cam.sheet.setup_n', { n: k + 1 })}: ${esc(g.name)}</h3>`);
    parts.push('<table class="meta">'
      + `<tr><th>${e('cam.sheet.wcs')}</th><td>${esc(wo)}</td></tr>`
      + (Number.isFinite(S.aAngle) && S.aAngle !== 0 ? `<tr><th>${e('cam.sheet.a_angle')}</th><td>${esc(num(S.aAngle))}°</td></tr>` : '')
      + `<tr><th>${e('cam.sheet.origin')}</th><td>${e('cam.sheet.origin_v', { x: range(S.stockBox, 0), y: range(S.stockBox, 1), z: range(S.stockBox, 2) })}</td></tr>`
      + `<tr><th>${e('cam.sheet.model_box')}</th><td>${e('cam.sheet.origin_v', { x: range(S.modelBBox || S.stockBox, 0), y: range(S.modelBBox || S.stockBox, 1), z: range(S.modelBBox || S.stockBox, 2) })}</td></tr>`
      + `<tr><th>${e('cam.sheet.stock')}</th><td>${g.stockFrom === 'previous' ? e('cam.sheet.stock_prev') : esc(stockText(S, tr))}</td></tr></table>`);
    parts.push(`<div class="pics"><div class="pic">${pictureSvg(S, 'top', tr)}</div><div class="pic">${pictureSvg(S, 'side', tr)}</div></div>`);
    parts.push(`<p class="small">${e('cam.sheet.legend')}</p></div>`);
  });
  // takim listesi
  parts.push(`<h2>${e('cam.sheet.tools')}</h2>`);
  parts.push(`<table><tr><th class="n">T</th><th>${e('cam.sheet.t_name')}</th><th>${e('cam.sheet.t_type')}</th><th class="n">${e('cam.sheet.t_dia')}</th><th class="n">${e('cam.sheet.t_flute')}</th><th class="n">${e('cam.sheet.t_len')}</th><th class="n">${e('cam.sheet.t_ops')}</th><th class="n">${e('cam.sheet.t_time')}</th></tr>`
    + tools.map((x) => `<tr><td class="n">T${esc(x.T)}</td><td>${esc(data.toolNames?.[x.T] ?? '')}</td><td>${esc(tr(TOOL_KEY[x.tool.type] || TOOL_KEY.flat))}</td><td class="n">${esc(num(x.tool.dia))}</td><td class="n">${esc(x.tool.flutes ?? '')}</td><td class="n">${esc(num(x.tool.fluteLen))}</td><td class="n">${x.n}</td><td class="n">${esc(dur(x.min))}</td></tr>`).join('') + '</table>');
  // islem listesi
  parts.push(`<h2>${e('cam.sheet.ops')}</h2>`);
  parts.push(`<table><tr><th class="n">${e('cam.sheet.o_no')}</th><th>${e('cam.sheet.o_setup')}</th><th>${e('cam.sheet.o_name')}</th><th>${e('cam.sheet.o_type')}</th><th class="n">T</th><th class="n">${e('cam.sheet.o_rpm')}</th><th class="n">${e('cam.sheet.o_feed')}</th><th class="n">${e('cam.sheet.o_time')}</th></tr>`
    + opRows.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${esc(r.g.name)}</td><td>${esc(r.it.opName)}</td><td>${esc(r.label)}</td><td class="n">T${esc(r.it.tp.tool.number)}</td><td class="n">${esc(num(r.it.tp.rpm, 0))}</td><td class="n">${esc(r.feed == null ? '-' : num(r.feed, 1))}</td><td class="n">${esc(dur(r.min))}</td></tr>`).join('')
    + `<tr><th colspan="7">${e('cam.sheet.total')}</th><th class="n">${esc(dur(totalMin))}</th></tr></table>`);
  parts.push(`<p class="small">${e('cam.sheet.time_note')}</p>`);
  // ham olcu listesi (onceki kurulumdan gelen stok satiri yok: ayni ham parca)
  parts.push(`<h2>${e('cam.sheet.raw')}</h2>`);
  const raws = setups.filter((g) => g.stockFrom !== 'previous');
  parts.push(`<table><tr><th>${e('cam.sheet.o_setup')}</th><th>${e('cam.sheet.raw_size')}</th></tr>` + raws.map((g) => `<tr><td>${esc(g.name)}</td><td>${esc(stockText(g.S, tr))}</td></tr>`).join('') + '</table>');
  parts.push(`<p class="warn">${e('cam.sheet.footer')}</p>`);
  const lang = data.lang === 'en' ? 'en' : 'tr';
  return `<!DOCTYPE html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SHEET_CSP}"><title>${esc(tr('cam.sheet.title') + (data.title ? ' - ' + data.title : ''))}</title><style>${SHEET_CSS}</style></head><body>\n${parts.join('\n')}\n</body></html>\n`;
}
