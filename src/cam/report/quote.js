// WP-14: teklif yardimcisi. Islem suresi (hesaplanmis islemlerin sure tahmini, tp.stats.timeMin) + malzeme (ham olcu x yogunluk x
// birim fiyat) -> teklif ozeti (tek dosya HTML; setup sheet ile ayni CSS/CSP/kacislama, tarayicidan PDF'e yazdirilir).
// TUM fiyat/oran/yogunluk degerleri KULLANICI VERISIDIR (doc.cam.quote): koda varsayilan fiyat gomulmez; eksik girdi satiri
// hesaplanmaz ve "eksik" olarak isaretlenir (sessiz sifir yok). Saf JS.
import { SHEET_CSS, SHEET_CSP, esc } from './setupsheet.js';

export const QUOTE_LIMITS = { extras: 30, str: 200, notes: 2000 };
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nn = (v) => isNum(v) && v >= 0;
const money = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

// Ham parca hacmi (mm3): kutu ya da silindir (setup cozumunden S.stock / S.stockBox)
export function stockVolumeMm3(S) {
  if (S?.stock?.kind === 'cyl' && isNum(S.stock.dia) && isNum(S.stock.len)) return (Math.PI / 4) * S.stock.dia * S.stock.dia * S.stock.len;
  const b = S?.stockBox; if (!b) return null;
  return (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
}
// items: [{ setupName, stockFrom, S, tp }] (setup sheet ile ayni). -> ozet
export function summarizeForQuote(items) {
  let timeMin = 0, toolChanges = 0, last = null; const raws = new Map(); const setups = new Set();
  for (const it of items) {
    timeMin += it.tp?.stats?.timeMin ?? 0;
    const T = it.tp?.tool?.number; if (T != null && T !== last) { toolChanges++; last = T; }
    setups.add(it.S.id);
    if (it.stockFrom !== 'previous' && !raws.has(it.S.id)) raws.set(it.S.id, stockVolumeMm3(it.S));
  }
  const vols = [...raws.values()]; const vol = vols.length && vols.every(isNum) ? vols.reduce((a, b) => a + b, 0) : null;
  return { timeMin, toolChanges, setups: setups.size, rawVolumeMm3: vol, rawCount: raws.size };
}
// q: kullanici girdisi { qty, partsPerRun, currency, material:{name,density,pricePerKg}, rates:{machinePerHour,setup,toolChangeSec}, extras:[{name,amount,per:'order'|'piece'}], marginPct, vatPct }
// -> { lines:[{key,name,qty,unitAmount,amount}], missing:[alan], pieces, runs, subtotal, margin, vat, totalOrder, totalPiece, complete }
export function computeQuote(q = {}, sum) {
  const pieces = Number.isInteger(q.qty) && q.qty >= 1 ? q.qty : 1;
  const per = Number.isInteger(q.partsPerRun) && q.partsPerRun >= 1 ? q.partsPerRun : 1;
  const runs = Math.ceil(pieces / per);
  const lines = [], missing = [];
  // malzeme (parca basina)
  const m = q.material || {};
  if (sum.rawVolumeMm3 == null) missing.push('rawSize');
  else if (!(isNum(m.density) && m.density > 0)) missing.push('density');
  else if (!nn(m.pricePerKg)) missing.push('pricePerKg');
  else {
    const kg = (sum.rawVolumeMm3 / 1000) * m.density / 1000; // mm3 -> cm3 -> g -> kg
    lines.push({ key: 'material', qty: pieces, unitAmount: money(kg * m.pricePerKg), amount: money(money(kg * m.pricePerKg) * pieces), kg: r3(kg) });
  }
  // talasli imalat (parca basina): sure tahmini + takim degisimi
  const r = q.rates || {};
  if (!nn(r.machinePerHour)) missing.push('machinePerHour');
  else {
    const minPiece = sum.timeMin + (nn(r.toolChangeSec) ? (sum.toolChanges * r.toolChangeSec) / 60 / per : 0);
    const unit = money((minPiece / 60) * r.machinePerHour);
    lines.push({ key: 'machining', qty: pieces, unitAmount: unit, amount: money(unit * pieces), minutes: r3(minPiece) });
  }
  // kurulum (calisma basina)
  if (nn(r.setup)) lines.push({ key: 'setup', qty: runs * Math.max(1, sum.setups), unitAmount: money(r.setup), amount: money(r.setup * runs * Math.max(1, sum.setups)) });
  else if (r.setup != null) missing.push('setupRate');
  // ek kalemler
  (Array.isArray(q.extras) ? q.extras : []).slice(0, QUOTE_LIMITS.extras).forEach((x, i) => {
    if (!x || !nn(x.amount)) { missing.push('extra' + (i + 1)); return; }
    const perPiece = x.per === 'piece';
    lines.push({ key: 'extra', name: String(x.name ?? '').slice(0, QUOTE_LIMITS.str), qty: perPiece ? pieces : 1, unitAmount: money(x.amount), amount: money(x.amount * (perPiece ? pieces : 1)) });
  });
  const subtotal = money(lines.reduce((a, l) => a + l.amount, 0));
  const margin = nn(q.marginPct) ? money((subtotal * q.marginPct) / 100) : 0;
  const net = money(subtotal + margin);
  const vat = nn(q.vatPct) ? money((net * q.vatPct) / 100) : 0;
  const totalOrder = money(net + vat);
  return { lines, missing, pieces, runs, subtotal, margin, vat, net, totalOrder, totalPiece: money(totalOrder / pieces), complete: missing.length === 0 };
}
export function validateQuoteInput(q) {
  if (q == null) return true;
  const bad = (m) => { throw Object.assign(new Error('cam.quote.bad_input'), { code: 'cam.quote.bad_input', params: { field: m } }); };
  if (typeof q !== 'object' || Array.isArray(q)) bad('quote');
  for (const k of ['marginPct', 'vatPct']) if (q[k] != null && !(nn(q[k]) && q[k] <= 1000)) bad(k);
  if (q.qty != null && !(Number.isInteger(q.qty) && q.qty >= 1 && q.qty <= 1e6)) bad('qty');
  for (const [o, ks] of [[q.material, ['density', 'pricePerKg']], [q.rates, ['machinePerHour', 'setup', 'toolChangeSec']]]) { if (o == null) continue; for (const k of ks) if (o[k] != null && !nn(o[k])) bad(k); }
  return true;
}

const NUM = (v, d = 2) => { if (!isNum(v)) return '-'; return v.toFixed(d); };
// data: { title, date, quoteNo, customer, currency, notes, validDays, input (q), summary (sum), result (computeQuote), tr(key, params), lang }
export function buildQuoteHtml(data) {
  const tr = data.tr; const e = (k, p) => esc(tr(k, p)); const res = data.result; const cur = esc(data.currency || '');
  const p = [];
  p.push(`<h1>${e('cam.quote.title')}</h1>`);
  p.push(`<p class="hint">${e('cam.sheet.print_hint')}</p>`);
  const meta = [['cam.quote.no', data.quoteNo], ['cam.quote.customer', data.customer], ['cam.sheet.part', data.title], ['cam.sheet.date', data.date], ['cam.quote.qty', res.pieces], ['cam.quote.valid', data.validDays != null ? tr('cam.quote.valid_days', { n: data.validDays }) : null]].filter((r) => r[1] != null && r[1] !== '');
  p.push('<table class="meta">' + meta.map((r) => `<tr><th>${e(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('') + '</table>');
  if (!res.complete) p.push(`<p class="warn">${e('cam.quote.incomplete', { list: res.missing.map((k) => tr(MISSING_KEY[k] || 'cam.quote.m.other')).join(', ') })}</p>`);
  p.push(`<h2>${e('cam.quote.lines')}</h2>`);
  const T = (v) => (res.complete ? NUM(v) : '-'); // eksik girdide toplamlar gosterilmez (kismi toplam yaniltir)
  const label = (l) => (l.key === 'material' ? tr('cam.quote.l_material', { kg: NUM(l.kg, 3) }) : l.key === 'machining' ? tr('cam.quote.l_machining', { min: NUM(l.minutes, 1) }) : l.key === 'setup' ? tr('cam.quote.l_setup') : l.name || tr('cam.quote.l_extra'));
  p.push(`<table><tr><th>${e('cam.quote.c_item')}</th><th class="n">${e('cam.quote.c_qty')}</th><th class="n">${e('cam.quote.c_unit')} (${cur})</th><th class="n">${e('cam.quote.c_amount')} (${cur})</th></tr>`
    + res.lines.map((l) => `<tr><td>${esc(label(l))}</td><td class="n">${esc(l.qty)}</td><td class="n">${esc(NUM(l.unitAmount))}</td><td class="n">${esc(NUM(l.amount))}</td></tr>`).join('')
    + `<tr><th colspan="3">${e('cam.quote.subtotal')}</th><th class="n">${esc(T(res.subtotal))}</th></tr>`
    + (res.margin ? `<tr><td colspan="3">${e('cam.quote.margin', { p: data.input?.marginPct })}</td><td class="n">${esc(T(res.margin))}</td></tr>` : '')
    + (res.vat ? `<tr><td colspan="3">${e('cam.quote.vat', { p: data.input?.vatPct })}</td><td class="n">${esc(T(res.vat))}</td></tr>` : '')
    + `<tr><th colspan="3">${e('cam.quote.total_order')}</th><th class="n">${esc(T(res.totalOrder))}</th></tr>`
    + `<tr><th colspan="3">${e('cam.quote.total_piece')}</th><th class="n">${esc(T(res.totalPiece))}</th></tr></table>`);
  const s = data.summary;
  p.push(`<p class="small">${e('cam.quote.basis', { min: NUM(s.timeMin, 1), setups: s.setups, changes: s.toolChanges })}</p>`);
  if (data.notes) p.push(`<h2>${e('cam.quote.notes')}</h2><p>${esc(data.notes).replace(/\n/g, '<br>')}</p>`);
  p.push(`<p class="warn">${e('cam.quote.footer')}</p>`);
  const lang = data.lang === 'en' ? 'en' : 'tr';
  return `<!DOCTYPE html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SHEET_CSP}"><title>${esc(tr('cam.quote.title') + (data.title ? ' - ' + data.title : ''))}</title><style>${SHEET_CSS}</style></head><body>\n${p.join('\n')}\n</body></html>\n`;
}
const MISSING_KEY = { rawSize: 'cam.quote.m.raw', density: 'cam.quote.m.density', pricePerKg: 'cam.quote.m.price', machinePerHour: 'cam.quote.m.machine', setupRate: 'cam.quote.m.setup' };
