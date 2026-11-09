// Arayüze güvenli köprü: yerel dosya diyalogları. contextIsolation açık, nodeIntegration kapalı.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  // filters: [{name, extensions:[...]}] → {path, name, data:Uint8Array} | null
  openFile: (filters) => ipcRenderer.invoke('native:open', filters),
  // {defaultName, filters, data:Uint8Array, path?} → kaydedilen yol | null
  saveFile: (opts) => ipcRenderer.invoke('native:save', opts),
  setTitle: (t) => ipcRenderer.send('native:title', String(t)),
  // komut satırından (çift tık) açılan .acad dosyası → {path,name,data} | null
  argvFile: () => ipcRenderer.invoke('native:argv'),
  // arayüz kaydedilmemiş değişiklik durumunu bildirir (kapatırken onay için)
  setDirty: (d) => ipcRenderer.send('native:dirty', !!d),
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
});
