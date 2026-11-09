// Küçük DOM yardımcıları: öğe üretimi, kip pencere (modal), bildirim (toast), bağlam menüsü.
import { t, fmtNum } from '../shared/i18n.js';

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

let toastTimer = 0;
export function toast(msg, bad = false) {
  const el = $('#toast'); el.textContent = msg; el.classList.toggle('bad', !!bad); el.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), bad ? 7000 : 3800);
}

// Kip pencere. buttons: [{label, cls, value, keep?:fn}] → seçilen değer ile çözülen Promise.
// Enter = ilk "pri" düğmesi, Esc = iptal (değer null).
export function modal({ title, content, buttons }) {
  const root = $('#modal');
  return new Promise((resolve) => {
    const close = (v) => { root.classList.add('hidden'); root.replaceChildren(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const btns = (buttons || [{ label: t('common.ok'), cls: 'pri', value: true }]).map((b) => h('button', {
      class: 'btn ' + (b.cls || ''), 'data-v': String(b.value),
      onclick: () => { if (b.check && b.check() === false) return; close(b.value); },
    }, b.label));
    const pri = btns.find((b) => b.classList.contains('pri'));
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(null); }
      else if (e.key === 'Enter' && pri && !(e.target.tagName === 'BUTTON')) { e.stopPropagation(); e.preventDefault(); pri.click(); }
    };
    document.addEventListener('keydown', onKey, true);
    root.replaceChildren(h('div', { class: 'box', role: 'dialog' }, h('h3', { text: title }), h('div', { class: 'content' }, content), h('div', { class: 'actions' }, btns)));
    root.classList.remove('hidden');
    const first = root.querySelector('input,select'); if (first) first.focus(); else if (pri) pri.focus();
  });
}
export const modalOpen = () => !$('#modal').classList.contains('hidden');

export async function promptText(title, value = '', label = t('common.name')) {
  const inp = h('input', { type: 'text', value, style: { width: '100%', padding: '5px 7px', border: '1px solid var(--line)', borderRadius: '4px' } });
  const r = await modal({ title, content: h('div', {}, h('div', { class: 'note', text: label }), inp), buttons: [{ label: t('common.cancel'), value: null }, { label: t('common.ok'), cls: 'pri', value: 'ok' }] });
  return r === 'ok' ? inp.value.trim() : null;
}
export const confirmBox = (title, text, yes = t('common.yes'), no = t('common.giveup')) =>
  modal({ title, content: h('div', { style: { whiteSpace: 'pre-wrap', maxWidth: '460px' }, text }), buttons: [{ label: no, value: false }, { label: yes, cls: 'pri', value: true }] }).then((v) => v === true);

// Bağlam menüsü: items [{label, run, sep?}]
export function ctxMenu(x, y, items) {
  const c = $('#ctx'); c.replaceChildren();
  for (const it of items) {
    if (it.sep) { c.append(h('hr')); continue; }
    c.append(h('button', { disabled: it.disabled, onclick: () => { hideCtx(); it.run(); } }, h('span', { text: it.label })));
  }
  c.classList.remove('hidden');
  const r = c.getBoundingClientRect();
  c.style.left = Math.min(x, innerWidth - r.width - 4) + 'px'; c.style.top = Math.min(y, innerHeight - r.height - 4) + 'px';
}
export function hideCtx() { $('#ctx').classList.add('hidden'); }
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ctx')) hideCtx(); });

export const fmt = (v, d = 3) => fmtNum(v, d);
