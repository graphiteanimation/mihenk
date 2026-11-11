// Görünüm tercihleri: tema (açık/koyu/sistem), yoğunluk (normal/büyük). Dil tercihi shared/i18n.js'te tutulur.
// Saklama: Electron'da userData/settings.json (window.native), tarayıcıda localStorage. <html data-theme data-density> yazılır.
export const THEMES = ['light', 'dark', 'system'];
export const DENSITIES = ['normal', 'large'];
const OPTIONS = { theme: THEMES, density: DENSITIES };
const DEFAULTS = { theme: 'system', density: 'normal' };
const listeners = new Set();
const mq = globalThis.matchMedia ? globalThis.matchMedia('(prefers-color-scheme: dark)') : null;

function load(key) {
  let v = null;
  try {
    const nat = globalThis.native;
    v = nat && typeof nat.getSetting === 'function' ? nat.getSetting(key) : globalThis.localStorage.getItem('mihenk.' + key);
  } catch (e) { /* depolama kapalı olabilir */ }
  return OPTIONS[key].includes(v) ? v : DEFAULTS[key];
}
export const prefs = { theme: load('theme'), density: load('density') };

export const resolvedTheme = () => (prefs.theme === 'system' ? (mq && mq.matches ? 'dark' : 'light') : prefs.theme);

export function applyPrefs() {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolvedTheme()); root.setAttribute('data-density', prefs.density);
  for (const cb of [...listeners]) { try { cb({ ...prefs, resolved: resolvedTheme() }); } catch (e) { console.error(e); } }
}
export function setPref(key, value) {
  if (!OPTIONS[key] || !OPTIONS[key].includes(value)) return false;
  prefs[key] = value;
  try {
    const nat = globalThis.native;
    if (nat && typeof nat.setSetting === 'function') nat.setSetting(key, value); else globalThis.localStorage.setItem('mihenk.' + key, value);
  } catch (e) { /* oturum boyunca geçerli kalır */ }
  applyPrefs(); return true;
}
export function resetPrefs() { for (const k of Object.keys(DEFAULTS)) setPref(k, DEFAULTS[k]); }
export const onPrefsChange = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
if (mq) mq.addEventListener('change', () => { if (prefs.theme === 'system') applyPrefs(); });
applyPrefs();

// Düz metin tercihleri (ör. son kullanılan komutlar, karşılama ekranı): ayar dosyası ya da localStorage.
export function getStr(key) {
  try { const nat = globalThis.native; const v = nat && typeof nat.getSetting === 'function' ? nat.getSetting(key) : globalThis.localStorage.getItem('mihenk.' + key); return typeof v === 'string' ? v : null; } catch (e) { return null; }
}
export function setStr(key, value) {
  try { const nat = globalThis.native; if (nat && typeof nat.setSetting === 'function') nat.setSetting(key, String(value).slice(0, 200)); else globalThis.localStorage.setItem('mihenk.' + key, String(value)); } catch (e) { /* oturumluk */ }
}
