// Arayüze güvenli köprü: yerel dosya diyalogları, ayarlar. contextIsolation açık, nodeIntegration kapalı.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  // filters: [{name, extensions:[...]}], title: diyalog başlığı → {path, name, data:Uint8Array} | null
  openFile: (filters, title) => ipcRenderer.invoke('native:open', filters, title),
  // {defaultName, filters, data:Uint8Array, path?, title?} → kaydedilen yol | null
  saveFile: (opts) => ipcRenderer.invoke('native:save', opts),
  setTitle: (t) => ipcRenderer.send('native:title', String(t)),
  // komut satırından (çift tık) açılan .acad dosyası → {path,name,data} | null
  argvFile: () => ipcRenderer.invoke('native:argv'),
  // arayüz kaydedilmemiş değişiklik durumunu bildirir (kapatırken onay için)
  setDirty: (d) => ipcRenderer.send('native:dirty', !!d),
  // ayarlar (userData/settings.json): getSetting eşzamanlıdır (arayüz ilk çizimden önce dili okur)
  getSetting: (key) => ipcRenderer.sendSync('native:getSetting', String(key)),
  setSetting: (key, value) => ipcRenderer.send('native:setSetting', String(key), value),
  // ana sürecin diyalog metinleri (kapatma onayı): arayüz sözlüğünden gelir
  setStrings: (o) => ipcRenderer.send('native:strings', o),
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
});
