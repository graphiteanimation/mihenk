// Eskiz çizim konforu ayarları (WP-09). Kalıcıdır: Electron'da userData/settings.json, tarayıcıda localStorage (prefs.js getStr/setStr).
// Saf durum: DOM yok. Değişiklikte onSkOptsChange dinleyicileri çağrılır.
import { getStr, setStr } from '../prefs.js';

export const SNAP_KINDS = ['end', 'center', 'origin', 'mid', 'quad', 'int', 'tan', 'perp', 'ent', 'align', 'grid'];
export const GRID_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10];
export const SEL_KINDS = ['point', 'line', 'circle', 'arc', 'other'];
export const AUTO_KINDS = ['hv', 'tan', 'perp', 'coin', 'on', 'mid'];

const loadSet = (key, allowed) => new Set((getStr(key) || '').split(',').filter((k) => allowed.includes(k)));
const loadNum = (key, def, lo, hi) => { const v = parseFloat(getStr(key)); return Number.isFinite(v) && v >= lo && v <= hi ? v : def; };
const loadBool = (key, def) => { const v = getStr(key); return v === '1' ? true : v === '0' ? false : def; };

export const SKO = {
  snapOff: loadSet('skopt_snapoff', SNAP_KINDS), // kapatılan yakalama türleri
  grid: loadNum('skopt_grid', 1, 0.001, 1000), // ızgara yakalama aralığı (mm)
  selOff: loadSet('skopt_seloff', SEL_KINDS), // seçim filtresi: seçilemeyen nesne türleri
  auto: loadBool('skopt_auto', true), // çizerken otomatik kısıtlandırma (ana anahtar)
  autoOff: loadSet('skopt_autooff', AUTO_KINDS), // kapatılan otomatik kısıt türleri
  autoRef: loadBool('skopt_autoref', true), // aşırı kısıtta ölçü referans (sürülen) ölçüye çevrilebilsin
};
const listeners = new Set();
const notify = () => { for (const cb of [...listeners]) { try { cb(SKO); } catch (e) { console.error(e); } } };
export const onSkOptsChange = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const save = (key, set) => setStr(key, [...set].join(','));

export const snapOn = (kind) => !SKO.snapOff.has(kind);
export function setSnapKind(kind, on) {
  if (!SNAP_KINDS.includes(kind)) return false;
  if (on) SKO.snapOff.delete(kind); else SKO.snapOff.add(kind);
  save('skopt_snapoff', SKO.snapOff); notify(); return true;
}
export function setGridStep(v) {
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0.001 || n > 1000) return false;
  SKO.grid = n; setStr('skopt_grid', String(n)); notify(); return true;
}
export const selOn = (kind) => !SKO.selOff.has(kind);
export function setSelKind(kind, on) {
  if (!SEL_KINDS.includes(kind)) return false;
  if (on) SKO.selOff.delete(kind); else SKO.selOff.add(kind);
  save('skopt_seloff', SKO.selOff); notify(); return true;
}
export const autoOn = (kind) => SKO.auto && !SKO.autoOff.has(kind);
export function setAuto(on) { SKO.auto = !!on; setStr('skopt_auto', on ? '1' : '0'); notify(); return true; }
export function setAutoKind(kind, on) {
  if (!AUTO_KINDS.includes(kind)) return false;
  if (on) SKO.autoOff.delete(kind); else SKO.autoOff.add(kind);
  save('skopt_autooff', SKO.autoOff); notify(); return true;
}
export function setAutoRef(on) { SKO.autoRef = !!on; setStr('skopt_autoref', on ? '1' : '0'); notify(); return true; }
// Seçim filtresi için nesne sınıfı
export const selClass = (kind, ent) => (kind === 'point' ? 'point' : ent && (ent.type === 'line' || ent.type === 'circle' || ent.type === 'arc') ? ent.type : ent && ent.type === 'point' ? 'point' : 'other');
