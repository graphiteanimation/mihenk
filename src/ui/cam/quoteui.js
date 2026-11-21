// WP-14: teklif yardimcisi penceresi. Girdiler belgeyle saklanir (doc.cam.quote, kullanici verisi; varsayilan fiyat yok).
// Hesap/HTML: src/cam/report/quote.js. Arayuz testi (Python/tarayici) bu ortamda kosulamadi.
import { h, modal, toast } from '../dom.js';
import { t, errText } from '../../shared/i18n.js';
import { summarizeForQuote, computeQuote, buildQuoteHtml, validateQuoteInput } from '../../cam/report/quote.js';
import { parseNum, showNum } from './util.js';

export async function openQuote(cam) {
  const q0 = cam.data().quote || {};
  const st = { no: q0.no ?? '', customer: q0.customer ?? '', currency: q0.currency ?? '', notes: q0.notes ?? '', qty: q0.qty ?? null, partsPerRun: q0.partsPerRun ?? (cam.data().parts?.count ?? null), validDays: q0.validDays ?? null,
    density: q0.material?.density ?? null, price: q0.material?.pricePerKg ?? null, machine: q0.rates?.machinePerHour ?? null, setup: q0.rates?.setup ?? null, tc: q0.rates?.toolChangeSec ?? null, margin: q0.marginPct ?? null, vat: q0.vatPct ?? null };
  const rows = [];
  const txt = (key, label, max = 80) => { const i = h('input', { type: 'text', maxlength: max, value: st[key], 'data-f': 'quote-' + key }); i.addEventListener('input', () => { st[key] = i.value; }); rows.push(h('label', { text: label }), i); };
  const nm = (key, label) => { const i = h('input', { type: 'text', inputmode: 'decimal', value: showNum(st[key]), 'data-f': 'quote-' + key }); i.addEventListener('input', () => { const v = parseNum(i.value); st[key] = Number.isNaN(v) ? NaN : v; }); rows.push(h('label', { text: label }), i); };
  txt('no', t('cam.quote.f_no')); txt('customer', t('cam.quote.f_customer'), 200); txt('currency', t('cam.quote.f_currency'), 8);
  nm('qty', t('cam.quote.f_qty')); nm('partsPerRun', t('cam.quote.f_parts')); nm('density', t('cam.quote.f_density')); nm('price', t('cam.quote.f_price'));
  nm('machine', t('cam.quote.f_machine')); nm('setup', t('cam.quote.f_setup')); nm('tc', t('cam.quote.f_tc')); nm('margin', t('cam.quote.f_margin')); nm('vat', t('cam.quote.f_vat')); nm('validDays', t('cam.quote.f_valid'));
  const ta = h('textarea', { rows: 3, maxlength: 2000, 'data-f': 'quote-notes' }); ta.value = st.notes; ta.addEventListener('input', () => { st.notes = ta.value; }); rows.push(h('label', { text: t('cam.quote.f_notes') }), ta);
  const v = await modal({ title: t('cam.quote.dlg_title'), width: 520, content: h('div', { class: 'quote-form' }, rows), buttons: [{ label: t('cam.quote.save'), value: 'save', cls: 'pri primary', testid: 'quote-save' }, { label: t('common.giveup'), value: null }] });
  if (v !== 'save') return;
  const num = (x) => (x == null || Number.isNaN(x) ? undefined : x);
  const q = { no: st.no || undefined, customer: st.customer || undefined, currency: st.currency || undefined, notes: st.notes || undefined, qty: num(st.qty), partsPerRun: num(st.partsPerRun), validDays: num(st.validDays), marginPct: num(st.margin), vatPct: num(st.vat),
    material: { density: num(st.density), pricePerKg: num(st.price) }, rates: { machinePerHour: num(st.machine), setup: num(st.setup), toolChangeSec: num(st.tc) } };
  const clean = JSON.parse(JSON.stringify(q)); if (q0.extras) clean.extras = q0.extras;
  try {
    validateQuoteInput(clean);
    const r = await cam.ops.prepare(); if (!r) return;
    cam.mut((c) => { c.quote = clean; });
    const sum = summarizeForQuote(r.items.map((x) => ({ setupName: x.setup.name, stockFrom: x.setup.stockFrom, S: x.S, tp: x.tp })));
    const result = computeQuote(clean, sum);
    const title = String(cam.app.fileName || '').replace(/\.[^.]*$/, '');
    const html = buildQuoteHtml({ title, date: new Date().toISOString().slice(0, 10), quoteNo: clean.no, customer: clean.customer, currency: clean.currency, notes: clean.notes, validDays: clean.validDays, input: clean, summary: sum, result, tr: (k, p) => t(k, p), lang: document.documentElement.lang === 'en' ? 'en' : 'tr' });
    const name = (clean.no || cam.ops.progName()) + '-teklif.html';
    const p = await cam.app.writeOut(new TextEncoder().encode(html), name, 'html', true); if (p) toast(t('cam.quote.saved'), { kind: 'ok' });
  } catch (e) { toast(t('cam.quote.save_failed', { msg: errText(e) }), { kind: 'err' }); }
}
