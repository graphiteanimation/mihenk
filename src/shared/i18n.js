// İki dilli arayüz: t(key, params), setLang, getLang, onLangChange. Sözlükler src/i18n/{tr,en}.js (düz anahtar → metin).
import tr from '../i18n/tr.js';
import en from '../i18n/en.js';
import { isErr } from './errors.js';

export { tk, KErr, toErr } from './errors.js';
import { KErr, toErr } from './errors.js';

export const LANGS = ['tr', 'en'];
const DICTS = { tr, en };
const STORE_KEY = 'atolye.lang';
const warned = new Set();

// İlk dil: kayıtlı tercih → işletim sistemi dili (tr ise Türkçe, değilse İngilizce) → Türkçe.
function detect() {
  let s = null;
  try {
    const nat = globalThis.native;
    if (nat && typeof nat.getSetting === 'function') s = nat.getSetting('lang');
    else if (globalThis.localStorage) s = globalThis.localStorage.getItem(STORE_KEY);
  } catch (e) { /* depolama kapalı olabilir */ }
  if (s === 'tr' || s === 'en') return s;
  const nav = globalThis.navigator;
  const l = nav && (nav.language || (nav.languages && nav.languages[0]));
  if (l) return /^tr(\b|-|_)/i.test(l) ? 'tr' : 'en';
  return 'tr';
}

let lang = detect();
const listeners = new Set();

export const getLang = () => lang;
export function onLangChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

export function setLang(l, persist = true) {
  if (!LANGS.includes(l)) return false;
  const changed = l !== lang;
  lang = l;
  if (persist) {
    try {
      const nat = globalThis.native;
      if (nat && typeof nat.setSetting === 'function') nat.setSetting('lang', l);
      else if (globalThis.localStorage) globalThis.localStorage.setItem(STORE_KEY, l);
    } catch (e) { /* kaydedilemezse oturum boyunca geçerli kalır */ }
  }
  if (globalThis.document) { document.documentElement.lang = l; applyI18n(); }
  if (changed) for (const cb of [...listeners]) { try { cb(l); } catch (e) { console.error(e); } }
  return true;
}

// Başka bir dildeki karşılık (komut arama iki dilde süzer).
export const tLang = (l, key) => (DICTS[l] && DICTS[l][key]) || DICTS.tr[key] || key;

// {ad} yer tutucuları doldurulur. Eksik anahtar: konsola uyarı, ekranda Türkçe karşılığı.
export function t(key, params) {
  let s = DICTS[lang][key];
  if (s === undefined) {
    if (!warned.has(lang + key)) { warned.add(lang + key); console.warn('[i18n] eksik anahtar (' + lang + '): ' + key); }
    s = DICTS.tr[key];
    if (s === undefined) return key;
  }
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params && params[k] != null ? String(params[k]) : m)) : s;
}

// Yapılandırılmış hata → görünen metin. params.field bir sözlük anahtarıdır; iç içe hatalar da çevrilir.
export function errText(err) {
  if (err == null || err === '') return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error && !isErr(err)) return err.message;
  const e = toErr(err);
  const p = {};
  for (const [k, v] of Object.entries(e.params || {})) {
    if (k === 'field' && typeof v === 'string') p[k] = t(v);
    else if (isErr(v)) p[k] = errText(v);
    else p[k] = v;
  }
  return t('err.' + e.code, p);
}

// Sayı gösterimi dile göre: Türkçede virgül, İngilizcede nokta. Girişte ikisi de kabul edilir (evalExpr).
export function fmtNum(v, d = 3) {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = String(Math.round(v * 10 ** d) / 10 ** d);
  return lang === 'tr' ? s.replace('.', ',') : s;
}

// data-i18n="anahtar" taşıyan statik öğeleri çevirir.
export function applyI18n(root = globalThis.document) {
  if (!root || !root.querySelectorAll) return;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.getAttribute('data-i18n'));
}
