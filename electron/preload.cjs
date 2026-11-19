// Arayüze güvenli köprü: yerel dosya diyalogları, ayarlar. contextIsolation + sandbox açık, nodeIntegration kapalı.
// Köprü YALNIZ app://mihenk/ kökeninde kurulur; başka bir sayfa (gezinti engellense de) hiçbir işlev görmez.
// Yol parametresi YOKTUR: dosya yolunu yalnız ana süreç bilir (diyalogla seçilen / açılan).
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'app:' && location.host === 'mihenk') {
  contextBridge.exposeInMainWorld('native', {
    // kind: 'doc' | 'step' | 'stl' → {name, data:Uint8Array} | null (ana süreç diyalog açar)
    openFile: (kind) => ipcRenderer.invoke('native:open', String(kind)),
    // {saveAs:boolean, data:Uint8Array, defaultName:string, kind:'doc'|'step'|'stl'|'dxf'|'nc'} → kaydedilen yol | null
    saveFile: (opts) => ipcRenderer.invoke('native:save', opts),
    // belge durumu: 'opened' (az önce açılan dosya yüklendi) | 'new' (yeni belge): geçerli belge yolunu ana süreç günceller
    docState: (s) => ipcRenderer.send('native:docState', String(s)),
    setTitle: (t) => ipcRenderer.send('native:title', String(t)),
    // komut satırından (çift tık) açılan .mhnk dosyası → {name,data} | null
    // son kullanılan belgeler: [{name, dir, ms}] ve dizinle açma (yolu renderer vermez)
    recentList: () => ipcRenderer.invoke('native:recentList'),
    openRecent: (i) => ipcRenderer.invoke('native:openRecent', Number(i)),
    argvFile: () => ipcRenderer.invoke('native:argv'),
    // arayüz kaydedilmemiş değişiklik durumunu bildirir (kapatırken onay için)
    setDirty: (d) => ipcRenderer.send('native:dirty', !!d),
    // ayarlar (userData/settings.json): getSetting eşzamanlıdır (arayüz ilk çizimden önce dili okur)
    getSetting: (key) => ipcRenderer.sendSync('native:getSetting', String(key)),
    setSetting: (key, value) => ipcRenderer.send('native:setSetting', String(key), value),
    // ana sürecin diyalog metinleri (kapatma onayı, dosya süzgeçleri): arayüz sözlüğünden gelir
    setStrings: (o) => ipcRenderer.send('native:strings', o),
    // otomatik kurtarma dosyası (userData/recovery/autosave.mhnk)
    recoverySave: (data) => ipcRenderer.invoke('native:recoverySave', data),
    recoveryLoad: () => ipcRenderer.invoke('native:recoveryLoad'),
    recoveryClear: () => ipcRenderer.invoke('native:recoveryClear'),
    versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  });
}
