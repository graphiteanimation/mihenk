// Tezgâh profilleri ve takım kütüphanesi saklama: Electron'da ayar dosyası (native.getSetting/setSetting), tarayıcıda localStorage.
// Yerleşik şablonlar saklanmaz (kod içinden gelir); yalnız kullanıcı profilleri yazılır.
import { builtinMachines, checkMachine } from '../../cam/machines/builtin.js';
import { normalizeTool } from '../../cam/tools.js';
import { t } from '../../shared/i18n.js';

const LS = 'mihenk.';
function read(key) {
  try { const n = globalThis.native; const v = n && typeof n.getSetting === 'function' ? n.getSetting(key) : globalThis.localStorage.getItem(LS + key); return typeof v === 'string' ? JSON.parse(v) : null; } catch (e) { return null; }
}
function write(key, value) {
  const s = JSON.stringify(value);
  try { const n = globalThis.native; if (n && typeof n.setSetting === 'function') n.setSetting(key, s); else globalThis.localStorage.setItem(LS + key, s); return true; } catch (e) { return false; }
}

export const userMachines = () => { const l = read('machines'); return Array.isArray(l) ? l.filter((m) => m && typeof m === 'object' && typeof m.id === 'string' && !checkMachine(m).errors.length) : []; };
export const saveUserMachines = (list) => write('machines', list.filter((m) => !m.builtin));
// yerleşik + kullanıcı; yerleşik ad anahtarı geçerli dile çevrilir
export function allMachines() { return [...builtinMachines(), ...userMachines()]; }
export const machineName = (m) => (m?.nameKey ? t(m.nameKey) : m?.name || '');
export const machineById = (id) => allMachines().find((m) => m.id === id) || null;

export const toolLibrary = () => {
  const l = read('toolLibrary'); if (!Array.isArray(l)) return [];
  const out = []; for (const x of l) { try { out.push(normalizeTool(x)); } catch (e) { /* bozuk kayıt atlanır */ } } return out;
};
export const saveToolLibrary = (list) => write('toolLibrary', list);

// WP-07: kullanici kesme verisi satirlari (tum belgelerde gecerli; belgeye ozel satirlar doc.cam.cutLib'te)
export const userCutLib = () => { const l = read('cutLib'); return Array.isArray(l) ? l.filter((e) => e && typeof e === 'object') : []; };
export const saveUserCutLib = (list) => write('cutLib', list);
