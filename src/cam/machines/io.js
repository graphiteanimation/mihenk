// Tezgah profili ice/disa aktarma (saf JS). Dosya: { format:'mihenk-machine', version:1, machines:[profil] }.
// Dosya guvenilmeyen veridir: boyut/derinlik/sayi siniri, prototip kirlenmesi anahtarlari reddi, checkMachine dogrulamasi.
import { cerr } from '../geom/err.js';
import { checkMachine } from './builtin.js';

export const MACHINE_FORMAT = 'mihenk-machine';
export const MACHINE_LIMITS = { machines: 200, bytes: 5 * 1024 * 1024, depth: 12, str: 500 };
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const clone = (x) => JSON.parse(JSON.stringify(x));

// Derinlik, dizge uzunlugu ve yasakli anahtar denetimi. Hata: KErr cam.machine.file_bad_field
function scan(v, path, depth) {
  if (depth > MACHINE_LIMITS.depth) throw cerr('cam.machine.file_too_deep', { max: MACHINE_LIMITS.depth });
  if (typeof v === 'string') { if (v.length > MACHINE_LIMITS.str) throw cerr('cam.machine.file_bad_field', { path }); return; }
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) { v.forEach((x, i) => scan(x, `${path}[${i}]`, depth + 1)); return; }
  for (const k of Object.keys(v)) { if (BAD_KEYS.has(k)) throw cerr('cam.machine.file_bad_field', { path: `${path}.${k}` }); scan(v[k], `${path}.${k}`, depth + 1); }
}

// Disa aktar: yerlesik bayragi ve ad anahtari atilir, rev korunur.
export function exportMachines(list) {
  const out = (list || []).map((m, i) => {
    const r = checkMachine(m); if (r.errors.length) throw cerr(r.errors[0].code, r.errors[0].params);
    const c = clone(m); delete c.builtin; delete c.nameKey; return c;
  });
  return JSON.stringify({ format: MACHINE_FORMAT, version: 1, machines: out }, null, 1);
}

// Ice aktar. existingIds: cakisma denetimi icin mevcut kimlikler (dizi/Set). Donus: { machines, errors:[{index, code, params}] }.
// Dosya bicimi bozuksa KErr firlatir. Kimlik cakisirsa yeni kimlik verilir ve ada " (2)" eklenir.
export function importMachines(text, existingIds = [], newId = defaultNewId) {
  if (typeof text !== 'string') throw cerr('cam.machine.file_bad', {});
  if (text.length > MACHINE_LIMITS.bytes) throw cerr('cam.machine.file_too_big', { mb: Math.round(MACHINE_LIMITS.bytes / 1048576) });
  let j; try { j = JSON.parse(text); } catch (e) { throw cerr('cam.machine.file_bad', {}); }
  if (!j || typeof j !== 'object' || Array.isArray(j) || j.format !== MACHINE_FORMAT || !Array.isArray(j.machines)) throw cerr('cam.machine.file_bad', {});
  if (!Number.isInteger(j.version) || j.version < 1) throw cerr('cam.machine.file_bad', {});
  if (j.version > 1) throw cerr('cam.machine.file_newer', { version: j.version });
  if (j.machines.length > MACHINE_LIMITS.machines) throw cerr('cam.machine.file_too_many', { max: MACHINE_LIMITS.machines });
  const taken = new Set(existingIds); const machines = [], errors = [];
  j.machines.forEach((raw, index) => {
    try {
      scan(raw, `machines[${index}]`, 0);
      const r = checkMachine(raw); if (r.errors.length) throw cerr(r.errors[0].code, r.errors[0].params);
      const m = clone(raw); delete m.builtin; delete m.nameKey;
      if (taken.has(m.id)) { let id; do { id = newId(); } while (taken.has(id)); m.id = id; m.name = String(m.name || '').slice(0, 190) + ' (2)'; }
      taken.add(m.id); machines.push(m);
    } catch (e) { errors.push({ index, code: e.code || 'internal', params: e.params || {} }); }
  });
  return { machines, errors };
}
let seq = 0;
function defaultNewId() { return 'mc-' + Date.now().toString(36) + '-' + (++seq).toString(36) + Math.random().toString(36).slice(2, 6); }
