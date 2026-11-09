// Otomatik kurtarma deposu (S-06). Electron: ana süreç userData/recovery/autosave.acad dosyasını yazar (yolu renderer bilmez).
// Tarayıcı/test kipi: IndexedDB (büyük içe aktarma verisi localStorage kotasına sığmaz).
const DB = 'atolyecad-recovery', STORE = 'kv', KEY = 'autosave';

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx(mode, fn) {
  const db = await idb();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
    });
  } finally { db.close(); }
}

export const recovery = {
  async save(bytes) { if (window.native) { await window.native.recoverySave(bytes); return; } await tx('readwrite', (s) => s.put(bytes, KEY)); },
  async load() {
    if (window.native) { const b = await window.native.recoveryLoad(); return b ? new Uint8Array(b) : null; }
    const v = await tx('readonly', (s) => s.get(KEY));
    return v ? new Uint8Array(v) : null;
  },
  async clear() { if (window.native) { await window.native.recoveryClear(); return; } await tx('readwrite', (s) => s.delete(KEY)); },
};
