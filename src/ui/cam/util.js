// CAM arayüzü ortak yardımcılar: sayı çözme (TR virgülü), alan üreticiler, kimlik üretimi, kopyalama.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { t, fmtNum } from '../../shared/i18n.js';
import { getUnits, mmToUnits, unitsToMm, unitLabel, isLengthUnit } from '../../shared/units.js';

export const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
export const uid = (p) => { const r = crypto.getRandomValues(new Uint32Array(2)); return p + '_' + r[0].toString(36) + r[1].toString(36).slice(0, 4); };
// '12,5' ve '12.5' kabul; boş → null; geçersiz → NaN
export function parseNum(s) {
  const x = String(s ?? '').trim().replace(',', '.'); if (x === '') return null;
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(x) ? Number(x) : NaN;
}
export const showNum = (v) => (v === null || v === undefined ? '' : fmtNum(v, 4));
// '1, 3, 12' → [1,3,12]; geçersizse null
export function parseIntList(s) {
  const parts = String(s ?? '').split(/[,;\s]+/).filter(Boolean); const out = [];
  for (const p of parts) { if (!/^\d+$/.test(p)) return null; out.push(Number(p)); }
  return out;
}
export const unitBox = (inp, unit, cls = '') => h('div', { class: 'input ' + cls }, inp, unit ? h('span', { class: 'unit', text: unit }) : null);
export const checkBox = (inp) => { const l = h('label', { class: 'check' + (inp.checked ? ' on' : '') }, inp, h('span', { class: 'box', html: icon('check', 'sm') })); inp.addEventListener('change', () => l.classList.toggle('on', inp.checked)); return l; };
export const fld = (label, ctl, o = {}) => h('div', { class: 'fld' + (o.cls ? ' ' + o.cls : ''), 'data-row': o.f || null }, h('label', { text: label, for: o.id || null }), h('div', { class: 'ctl' }, ctl));
export const msgBox = () => h('div', { class: 'fieldmsg', role: 'alert', hidden: true });
export function setMsg(box, text, kind = 'err') {
  box.hidden = !text; box.className = 'fieldmsg' + (kind === 'warn' ? ' warn' : kind === 'info' ? ' ok' : '');
  box.replaceChildren(...(text ? [h('span', { html: icon(kind === 'warn' ? 'warning' : kind === 'info' ? 'info' : 'error', 'sm') }), h('span', { text })] : []));
}

// Sayı alanı: değer taslak nesneye `set(v)` ile yazılır (null = boş). o: {label, value, unit, min, max, int, nullable, set, f, hint, warn(v)→metin|null}
export function numField(o) {
  // WP-14: belge birimi inc iken uzunluk (mm) ve ilerleme (mm/min) alanlari inc olarak gosterilir/girilir; deger mm saklanir
  const conv = isLengthUnit(o.unit) && getUnits() === 'inch';
  const toUi = (v) => (conv ? mmToUnits(v) : v), fromUi = (v) => (conv ? unitsToMm(v) : v);
  const inp = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'data-f': o.f || null, value: showNum(toUi(o.value)), id: o.id || null, class: 'expr' });
  const box = unitBox(inp, unitLabel(o.unit)); const msg = msgBox();
  const hint = o.hint ? h('div', { class: 'help', text: o.hint }) : null;
  const upd = () => {
    const raw = parseNum(inp.value); const v = Number.isNaN(raw) ? raw : raw === null ? null : fromUi(raw); let bad = '';
    if (Number.isNaN(v)) bad = t('cam.fld.bad_number');
    else if (v === null && !o.nullable) bad = t('cam.fld.required');
    else if (v !== null && o.min !== undefined && v < o.min) bad = t('cam.fld.min', { min: fmtNum(toUi(o.min), 4) });
    else if (v !== null && o.max !== undefined && v > o.max) bad = t('cam.fld.max', { max: fmtNum(toUi(o.max), 4) });
    else if (v !== null && o.int && !Number.isInteger(v)) bad = t('cam.fld.int');
    box.classList.toggle('err', !!bad); inp.setAttribute('aria-invalid', bad ? 'true' : 'false');
    const w = !bad && o.warn ? o.warn(v) : null;
    if (bad) setMsg(msg, bad); else if (w) setMsg(msg, w, 'warn'); else setMsg(msg, '');
    return { v, bad };
  };
  inp.addEventListener('input', () => { const { v, bad } = upd(); if (!bad && o.set) o.set(v); else if (bad && o.set && o.keepBad) o.set(v); });
  upd();
  const row = fld(o.label, h('div', {}, box, msg, hint), { f: o.f });
  row.refresh = upd; row.input = inp; return row;
}
export function textField(o) {
  const inp = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'data-f': o.f || null, value: o.value ?? '', maxlength: o.max || 200, placeholder: o.placeholder || null });
  inp.addEventListener('input', () => o.set(inp.value));
  const row = fld(o.label, h('div', {}, unitBox(inp, o.unit)), { f: o.f }); row.input = inp; return row;
}
// opts: [[değer, etiket]]
export function selField(o) {
  const s = h('select', { 'data-f': o.f || null }, o.opts.map(([v, l]) => h('option', { value: v, selected: String(o.value ?? '') === String(v) }, l)));
  s.addEventListener('change', () => o.set(s.value));
  const row = fld(o.label, h('div', {}, unitBox(s), o.hint ? h('div', { class: 'help', text: o.hint }) : null), { f: o.f }); row.input = s; return row;
}
export function checkField(o) {
  const c = h('input', { type: 'checkbox', 'data-f': o.f || null, checked: !!o.value }); c.addEventListener('change', () => o.set(c.checked));
  const row = fld(o.label, h('div', {}, checkBox(c), o.hint ? h('div', { class: 'help', text: o.hint }) : null), { f: o.f }); row.input = c; return row;
}
export const sec = (title) => h('div', { class: 'psec', text: title });
export const callout = (kind, title, body, ic) => h('div', { class: 'callout ' + kind, role: kind === 'err' ? 'alert' : null }, h('span', { html: icon(ic || (kind === 'err' ? 'error' : kind === 'warn' ? 'warning' : kind === 'unv' ? 'unverified' : 'info'), 'sm') }), h('div', {}, title ? h('div', { class: 'ct', text: title }) : null, body ? h('div', { text: body }) : null));

// Sağ panel kabuğu (panels.js ile aynı yapı): üst şerit, gövde, alt şerit.
import { $ } from '../dom.js';
export function panelShell(title, bodyKids, footKids, onClose, ic = '') {
  const p = $('#panel'); p.classList.remove('hidden'); p.dataset.cam = '1';
  p.replaceChildren(h('header', {}, ic ? h('span', { class: 'hic', html: icon(ic) }) : null, h('h3', { text: title, 'data-testid': 'panel-title' }),
    onClose ? h('button', { class: 'btn ghost icon x', type: 'button', 'aria-label': t('common.close'), 'data-testid': 'panel-close', onclick: onClose, html: icon('close') }) : null),
    h('div', { class: 'body' }, ...bodyKids), h('footer', {}, ...footKids));
  return p;
}
export function hidePanel() { const p = $('#panel'); if (p.dataset.cam === '1') { p.classList.add('hidden'); p.replaceChildren(); delete p.dataset.cam; } }
export const okCancel = (ok, cancel, okLabel = t('common.ok')) => [
  h('button', { class: 'btn primary pri', id: 'p-ok', 'data-testid': 'panel-ok', onclick: ok }, okLabel, h('span', { class: 'kbd', text: 'Enter' })),
  h('button', { class: 'btn', id: 'p-cancel', 'data-testid': 'panel-cancel', onclick: cancel }, t('common.cancel'), h('span', { class: 'kbd', text: 'Esc' }))];
// Enter = Tamam, Esc = İptal (alan içinde Enter de çalışır; düğme/metin alanı hariç)
export function panelKeys(panel, ok, cancel) {
  const fn = (e) => {
    if (!panel.isConnected) { document.removeEventListener('keydown', fn); return; }
    if (document.querySelector('#modal:not(.hidden)')) return;
    if (!panel.contains(document.activeElement) && document.activeElement !== document.body) return;
    const tag = e.target.tagName;
    if (e.key === 'Escape') { e.preventDefault(); cancel(); } else if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'TEXTAREA' && tag !== 'SELECT') { e.preventDefault(); ok(); }
  };
  document.addEventListener('keydown', fn); return () => document.removeEventListener('keydown', fn);
}
export function hashStr(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return (x >>> 0).toString(36); }
export const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
export function setP(o, p, v) { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== 'object') a[ks[i]] = {}; a = a[ks[i]]; } if (v === undefined) delete a[ks.at(-1)]; else a[ks.at(-1)] = v; }

// U-02/U-03: pencerede kırmızı (geçersiz) alan varsa Tamam'ı engelle, ilk hatalı alana odaklan. true = engel var.
export function blockedByBadField(root = document.getElementById('modal')) {
  const bad = root?.querySelector('.input.err input, .input.err select');
  if (!bad) return false;
  try { bad.focus(); } catch (e) { /* odak verilemedi */ }
  return true;
}
