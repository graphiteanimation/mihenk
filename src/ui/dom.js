// Küçük DOM yardımcıları: öğe üretimi, kip pencere (modal), bildirim (toast), bağlam menüsü.
import { t, fmtNum } from '../shared/i18n.js';
import { icon } from './icons.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- bildirim (toast)
// Sağ altta, en çok 3. Hata kalıcıdır (kapat düğmesiyle), uyarı 8 sn, bilgi/başarı 5 sn; fare üstündeyken sayaç durur.
// toast(msg, bad) eski çağrı biçimidir: bad = hata. toast(msg, {kind, title, action:{label, run}}) ayrıntılı biçim.
const TOAST_MS = { err: 0, warn: 8000, ok: 5000, info: 5000 };
const TOAST_ICON = { err: 'error', warn: 'warning', ok: 'success', info: 'info' };
export function toast(msg, opt = false) {
  const o = typeof opt === 'object' && opt ? opt : { kind: opt ? 'err' : 'info' };
  const kind = o.kind || 'info';
  const root = $('#toast');
  if (root.classList.contains('hidden')) root.replaceChildren();
  const text = String(msg ?? '');
  for (const old of [...root.children]) if (old.dataset.msg === text) old.remove();
  while (root.children.length >= 3) root.firstElementChild.remove();
  const el = h('div', { class: 'toast ' + kind, role: kind === 'err' ? 'alert' : 'status', 'data-kind': kind, 'data-msg': text });
  const close = () => { clearTimeout(el._t); el.remove(); if (!root.children.length) root.classList.add('hidden'); };
  const body = h('div', {}, o.title ? h('div', { class: 'tt', text: o.title }) : null, h('div', o.title ? { class: 'tb', text } : { class: 'tt', text }));
  el.append(h('span', { html: icon(TOAST_ICON[kind], 'sm') }), body, h('button', { class: 'x', 'data-testid': 'toast-close', 'aria-label': t('common.close'), onclick: close, html: icon('close', 'sm') }));
  if (o.action) el.append(h('div', { class: 'acts' }, h('button', { class: 'btn sm', onclick: () => { close(); o.action.run(); } }, o.action.label)));
  const arm = () => { const ms = o.ms ?? TOAST_MS[kind]; if (ms) el._t = setTimeout(close, ms); };
  el.addEventListener('mouseenter', () => clearTimeout(el._t)); el.addEventListener('mouseleave', arm);
  root.append(el); root.classList.remove('hidden'); arm();
  return el;
}

// ---------------------------------------------------------------- kip pencere (modal)
// Kurallar: yalnız onay (geri alınamaz işlem, kaydedilmemiş değişiklik), kurtarılamaz hata ve ayarlar için kullanılır.
// buttons: [{label, cls, value, check?, safe?}] → seçilen değer ile çözülen Promise. Esc = iptal (null). Enter = ilk "pri" düğmesi
// (odak bir düğmedeyse o düğme). safe: true olan düğme ilk odağı alır (geri alınamaz işlemlerde varsayılan = güvenli seçenek).
// Odak pencerenin içinde döner (Tab tuzağı); kapanınca odak önceki öğeye döner.
export function modal({ title, content, buttons, width, cls, icon: ic, note }) {
  const root = $('#modal');
  const prev = document.activeElement;
  return new Promise((resolve) => {
    const close = (v) => { root.classList.add('hidden'); root.replaceChildren(); document.removeEventListener('keydown', onKey, true); try { prev && prev.focus && prev.focus(); } catch (e) { /* öğe kalkmış olabilir */ } resolve(v); };
    const btns = (buttons || [{ label: t('common.ok'), cls: 'pri primary', value: true }]).map((b) => h('button', {
      class: 'btn ' + (b.cls || ''), 'data-v': String(b.value), 'data-testid': b.testid || null,
      onclick: () => { if (b.onClick) { b.onClick(); return; } if (b.check && b.check() === false) return; close(b.value); },
    }, b.label));
    const pri = btns.find((b) => b.classList.contains('pri'));
    const safe = (buttons || []).findIndex((b) => b.safe);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(null); }
      else if (e.key === 'Enter' && pri && !(e.target.tagName === 'BUTTON') && e.target.tagName !== 'TEXTAREA') { e.stopPropagation(); e.preventDefault(); pri.click(); }
      else if (e.key === 'Tab') {
        const f = [...root.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex="0"]')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    const box = h('div', { class: 'modal' + (cls ? ' ' + cls : ''), role: 'dialog', 'aria-modal': 'true' },
      h('header', {}, ic ? h('span', { html: icon(ic) }) : null, h('h3', { text: title }), h('button', { class: 'btn ghost icon x', type: 'button', 'aria-label': t('common.close'), 'data-testid': 'modal-close', onclick: () => close(null), html: icon('close') })),
      h('div', { class: 'body content' }, content), h('footer', { class: 'actions' }, note ? h('span', { class: 'fnote', text: note }) : null, btns));
    if (width) box.style.width = width + 'px';
    root.replaceChildren(box);
    root.classList.remove('hidden');
    const first = safe >= 0 ? btns[safe] : root.querySelector('input,select'); if (first) first.focus(); else if (pri) pri.focus();
  });
}
export const modalOpen = () => !$('#modal').classList.contains('hidden');

export async function promptText(title, value = '', label = t('common.name')) {
  const inp = h('input', { type: 'text', value, 'data-testid': 'prompt-input' });
  const r = await modal({ title, content: h('div', { class: 'fld one' }, h('label', { text: label }), h('div', { class: 'input' }, inp)), buttons: [{ label: t('common.cancel'), value: null }, { label: t('common.ok'), cls: 'pri primary', value: 'ok' }] });
  return r === 'ok' ? inp.value.trim() : null;
}
// danger: geri alınamaz işlem. Varsayılan odak güvenli seçenekte (vazgeç); onay düğmesi kırmızı çerçeveli ve sağda.
export const confirmBox = (title, text, yes = t('common.yes'), no = t('common.giveup'), { danger = false } = {}) =>
  modal({ title, icon: danger ? 'warning' : null, cls: danger ? 'dlg-warn' : '', content: h('div', { class: 'confirm-text', text }),
    buttons: [{ label: no, value: false, safe: danger }, { label: yes, cls: 'pri ' + (danger ? 'danger-outline' : 'primary'), value: true }] }).then((v) => v === true);

// ---------------------------------------------------------------- bağlam menüsü
// items: [{id, label, run, sep?, kbd?, danger?, disabled?, icon?}]
export function ctxMenu(x, y, items) {
  const c = $('#ctx'); c.replaceChildren(); c.className = 'ctxmenu'; c.setAttribute('role', 'menu');
  for (const it of items) {
    if (it.sep) { c.append(h('hr')); continue; }
    c.append(h('button', { class: 'mi' + (it.danger ? ' danger' : ''), role: 'menuitem', 'data-cmd': it.id || null, disabled: it.disabled, onclick: () => { hideCtx(); it.run(); } },
      it.icon ? h('span', { html: icon(it.icon, 'sm') }) : null, h('span', { text: it.label }), it.kbd ? h('span', { class: 'kbd', text: it.kbd }) : null));
  }
  c.classList.remove('hidden');
  const r = c.getBoundingClientRect();
  c.style.left = Math.min(x, innerWidth - r.width - 4) + 'px'; c.style.top = Math.min(y, innerHeight - r.height - 4) + 'px';
  const first = c.querySelector('button:not([disabled])'); if (first) first.focus({ preventScroll: true });
}
export function hideCtx() { $('#ctx').classList.add('hidden'); }
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ctx')) hideCtx(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#ctx').classList.contains('hidden')) { hideCtx(); } });

// ---------------------------------------------------------------- ipucu (tooltip): ad + kısayol + tek cümle; 500 ms gecikme, klavye odağında hemen
let tipEl = null, tipTimer = 0, tipFor = null;
export function tip(el, { name, kbd, body }) { el.dataset.tipName = name; if (kbd) el.dataset.tipKbd = kbd; else delete el.dataset.tipKbd; if (body) el.dataset.tipBody = body; else delete el.dataset.tipBody; el.setAttribute('aria-label', name); return el; }
function showTip(el) {
  hideTip(); if (!document.body.contains(el)) return;
  tipFor = el;
  tipEl = h('div', { class: 'tip', id: 'tip', role: 'tooltip' }, h('div', { class: 'th' }, h('span', { text: el.dataset.tipName }), el.dataset.tipKbd ? h('span', { class: 'kbd', text: el.dataset.tipKbd }) : null), el.dataset.tipBody ? h('div', { class: 'tb', text: el.dataset.tipBody }) : null);
  document.body.append(tipEl);
  const r = el.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
  let left = Math.max(4, Math.min(r.left + r.width / 2 - tr.width / 2, innerWidth - tr.width - 4)), top = r.bottom + 8;
  if (top + tr.height > innerHeight - 4) top = Math.max(4, r.top - tr.height - 8);
  tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
}
export function hideTip() { clearTimeout(tipTimer); tipFor = null; if (tipEl) { tipEl.remove(); tipEl = null; } }
document.addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('[data-tip-name]'); if (!el || el === tipFor) return; hideTip(); tipTimer = setTimeout(() => showTip(el), 500); });
document.addEventListener('mouseout', (e) => { const el = e.target.closest && e.target.closest('[data-tip-name]'); if (el && !el.contains(e.relatedTarget)) hideTip(); });
document.addEventListener('focusin', (e) => { const el = e.target.closest && e.target.closest('[data-tip-name]'); if (el && el.matches(':focus-visible')) { hideTip(); showTip(el); } });
document.addEventListener('focusout', hideTip); document.addEventListener('pointerdown', hideTip); document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); }, true);

export const fmt = (v, d = 3) => fmtNum(v, d);
