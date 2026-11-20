# Mihenk Güvenlik Düzeltmeleri

Kaynak: `docs/SECURITY-AUDIT.md` (git `41468d9`, v0.1.0). Bu belge her bulgu için yapılan değişikliği (dosya:satır) ve kanıtı listeler. Denetim belgesine dokunulmamıştır.
Test komutu: `npm run test:all` (i18n 27, güvenlik birimi 70, çekirdek 65, çözücü 16, sketcher 78, arayüz 180, Electron 59 = 495 kontrol; hepsi geçti).
Kısaltmalar: `main` = electron/main.cjs, `app` = src/ui/app.js.

## Özet

| Bulgu | Durum |
|---|---|
| S-01 | Düzeltildi |
| S-02 | Kısmen: arayüz tarafı düzeltildi; çekirdek önbelleği (kernel.js) bilerek bırakıldı |
| S-03 | Düzeltildi |
| S-04 | Düzeltildi (gerçek OS kum havuzu bu ortamda denenemedi, bkz. "Doğrulanamayanlar") |
| S-05 | Düzeltildi (bir sapma var: yalnız çekirdek işçisi `unsafe-eval` alır) |
| S-06 | Düzeltildi |
| S-07 | Düzeltildi (Windows'ta çalıştırılamadı) |
| S-08 | Kısmen: dosya yükleme ve panel doğrulaması; çekirdek tarafı ve iptal edilebilir hesap bırakıldı |
| S-09 | Düzeltildi |
| S-10 | Düzeltildi (ASAR bütünlüğü bilerek açılmadı) |
| S-11 | Düzeltildi |
| S-12 | Düzeltildi |
| S-13 | Düzeltildi |
| S-14 | Yapılmadı (çekirdek tarafı; bu turun kapsamı dışı) |
| S-15 | Kısmen: SHA-256 listesi üretiliyor; kod imzası yok |
| S-16 | Düzeltildi (Windows'ta çalıştırılamadı) |
| S-20 | Kısmen: UNC reddi ve 200 MB sınırı yapıldı; tek örnek kilidi yapılmadı |
| S-21 | Kısmen: `node_modules` pakete girmiyor; LGPL kaynak paketi yapılmadı |
| S-17, S-18, S-19, S-22 | Bu turda ele alınmadı |

## Bulgu bazında

### S-01 Renderer keyfi yola yazıyor, IPC gönderen doğrulaması yok
- Değişiklik:
  - `native:save` yalnız `{saveAs, data, defaultName, kind}` kabul eder; başka anahtar (özellikle `path`) hata verir (main:173-190). `kind` ∈ acad/step/stl, `data` yalnız `Uint8Array`, ≤200 MB, uzantı ana süreçte zorlanır (main:20, 175-183).
  - Hedef yol: (a) ana süreçte açılan kaydetme diyaloğunun yolu, ya da (b) ana süreçte tutulan `currentPath` (yalnız diyalogla açılan/kaydedilen .acad; main:30-31, 162-199). Renderer'ın "yük başarılı" bildirimi `docState('opened'|'new')` ile gelir ve yol taşımaz (main:193-197, preload:15). Yeni belge yolu sıfırlar, böylece "Yeni → Kaydet" önceki dosyanın üstüne yazmaz.
  - Tüm `ipcMain` işleyicilerinde gönderen doğrulaması: `okSender` (main:86-91) ana pencere + ana çerçeve + `senderFrame.url` `app://mihenk/` ile başlamalı; `handle` için `guarded` (main:92), `on` işleyicilerinde doğrudan çağrı.
  - Arayüz: `writeOut` artık yol göndermez (app:496-500).
- Kanıt: `test/electron.test.mjs` bölüm 1: yol anahtarlı/geçersiz tür/geçersiz veri çağrıları reddedildi, hedef dosya oluşmadı; `data:` çerçevesinden ham `ipcRenderer` ile tüm `invoke` çağrıları reddedildi, yetkisiz `setSetting`/`setTitle` etkisiz. Bölüm 2: ilk Kaydet diyalog açar, ikinci Kaydet açmaz ve aynı dosyaya yazar, Yeni belge sonrası diyalog açılır, Aç sonrası Kaydet açılan dosyaya yazar, geçersiz dosya açılamayınca kayıt hedefi değişmez. Denetçi PoC'u `electron_probe.mjs` yeniden koşuldu: `arbitraryWrite: "ERR ... bad args"`, `fileWritten: null`.

### S-02 İçe aktarma önbelleği yanlış geometri (YALNIZ ARAYÜZ TARAFI)
- Değişiklik:
  - İçe aktarma kimliği `imp_<64 bit rastgele>` (app:30, 552-560) ve özelliğe `hash` = verinin SHA-256'sı yazılır (app:21-22, 557). Çekirdek önbelleği kimliğe bağlı olduğu için yeni kimlik çakışmaz.
  - Yeni belge / Aç / kurtarma sırasında çekirdek işçisi sonlandırılıp yeniden başlatılır (`resetKernel`, app:120-131; `loadDoc(..., {reset:true})`). `worker.js`'e `reset` komutu eklenmedi (çekirdeğe dokunulmadı). `whenIdle` sıfırlamayı bekler (app:190).
  - Dosya açarken `hash` doğrulanır, uyuşmazsa reddedilir (app:527-533).
- Kanıt (`test/app.test.py`, bölüm S): Yeni → A (10 mm) → Yeni → B (20 mm): hacim 1000 sonra 8000; kimlikler benzersiz ve `imp1` değil; `hash` Python `hashlib.sha256` ile aynı; işçi nesnesi değişti; içe aktar-geri al-başka içe aktar: 8000; eski biçim iki .acad (ikisinde `imp1`) aç-aç: 1000 sonra 8000. Denetçi `import_cache_ui_poc.py` yeniden koşuldu: A=1000, B=8000 (PoC kimliği hâlâ `imp1` kullanıyor; düzeltme işçi sıfırlamasından geliyor).
- Kalan (çekirdek): `kernel.js:293-295` (`imports` Map'i kimlik anahtarlı) ve `kernel.js:315` (`data.length`) hâlâ eski. `node test/security/poc_kernel.mjs` P2 aynı kimlikle hâlâ 1000 gösteriyor; çekirdek düzeltilince kapanacak.

### S-03 Gezinti, yeni pencere, sürükle-bırak; preload her kökende
- Değişiklik: `will-navigate`, `will-frame-navigate`, `will-redirect` engeli, `will-attach-webview` engeli, `setWindowOpenHandler` → deny, tüm webContents'e uygulanır (main:152-160, 295); `webviewTag:false` (main:225); preload köprüsü yalnız `location` `app://atolye` iken kurulur (preload:6); sürükle-bırak `dragover/drop` varsayılanı iptal (app:60).
- Kanıt (electron.test.mjs bölüm 1): `location.href` ile http/file/https gezintisi engellendi, URL `app://` kaldı, sunucuya istek ulaşmadı; `window.open` null, pencere sayısı 1; `<webview>` işlevsiz; `drop` olayı `defaultPrevented`; `data:` sayfasında `window.native` yok (preload kontrolü). `electron_probe.mjs`: `windowsAfterWindowOpen: 0`, `allWindowUrls` yalnız `app://`.
- Sınırlama: gerçek işletim sistemi dosya bırakma olayı üretilemedi; `drop` olayı ve `will-navigate file://` ayrı ayrı kanıtlandı.

### S-04 Kum havuzu
- Değişiklik: `sandbox:true` (main:223); `MIHENK_NO_SANDBOX` ve kodla `--no-sandbox` eklemesi kaldırıldı (main:33-34 yorumu). Öz-test ve `MIHENK_USERDATA`/`MIHENK_LANGFILE` yalnız `!app.isPackaged` (main:12-13, 40-41). Kök kullanıcıda `--no-sandbox` yalnız komut satırından (testlerde `SANDBOX_ARGS`).
- Kanıt: öz-test çıktısı `SELFTEST GEÇTI ... sandbox=true`; `getLastWebPreferences().sandbox === true` (electron.test.mjs). Linux paketli derleme (`electron-builder --linux dir`, aynı kod+fuse): `MIHENK_SELFTEST` ve `MIHENK_USERDATA` ortam değişkenleri yok sayıldı (öz-test çıktısı yok, userData oluşmadı).

### S-05 CSP
- Değişiklik: `electron/csp.cjs` tek kaynak; `index.html:5` meta (aynı metin); `protocol.handle` her yanıta başlık ekler (main:132). Tam ilke: `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`.
- Sapmalar (bilerek): (1) `style-src` içinde `'unsafe-inline'` YOK (arayüz yalnız CSSOM `el.style` kullanıyor; tek HTML satır içi stil sınıfa çevrildi, app:472, style.css). (2) Geometri çekirdeğinin (OpenCascade/embind) `new Function` kullandığı görüldü: sıkı CSP ile çekirdek yüklenmedi ("Evaluating a string as JavaScript violates ... 'unsafe-eval'"). Bu yüzden YALNIZ çekirdek işçi betiğinin (`/assets/worker-*.js`) yanıt başlığına `'unsafe-eval'` eklendi (`WORKER_CSP`, csp.cjs; main:132). Ana belge (meta ve başlık) `unsafe-eval` içermez; işçide DOM, `native` köprüsü ve ağ yok.
- Kanıt: `npm run test:all` içindeki arayüz testi sıkı meta CSP altında tüm akışı (kutu, sketch, içe aktarma, kurtarma, dil) çalıştırdı ve `securitypolicyviolation` olayı 0 (app.test.py bölüm S ve sonu); Electron: başlık = csp.cjs, ana betik sıkı CSP alır, yalnız işçi `unsafe-eval` alır, satır içi `<script>` ve `<img onerror>` çalışmadı. Sayfada eval engeli: Playwright dizge ifadeli `wait_for_function` sorgusu "unsafe-eval is not an allowed source" hatası verdi.

### Ağ kapatma
- Değişiklik: `session.webRequest.onBeforeRequest` app://, blob:, data: (ve yalnız geliştirmede devtools:) dışındaki her isteği iptal eder (main:140-147); `host-resolver-rules MAP * ~NOTFOUND` (main:37).
- Kanıt: öz-test (`webRequestBlocked=1 viaSession=ENGELLENDI serverHits=0`); electron.test.mjs: renderer fetch/Image/sendBeacon/WebSocket sunucuya ulaşmadı, ana süreç `session.fetch` http ve `file://` iptal edildi (CSP'den bağımsız katman), sunucu istek sayısı 0.

### S-06 Atomik kayıt, .bak, otomatik kurtarma
- Değişiklik: `electron/safe-write.cjs:8-33` (aynı dizinde geçici dosya `wx` → `fsync` → `.bak` kopyası → `rename`; hatada geçici dosya silinir, hedef değişmez; dizin fsync). `.bak` yalnız .acad için (main:187). Kurtarma: `app.recoveryTick` 60 sn zamanlayıcı (app:76-77, 575-583), `electron/preload.cjs` kurtarma API'si, ana süreç `userData/recovery/autosave.acad` (main:208-214), temiz kapanışta silme (main:242), açılışta iki dilli soru `offerRecovery` (app:576-590), tarayıcıda IndexedDB (`src/ui/recovery.js`). Kaydet/Yeni/Aç yedeği siler.
- Kanıt: `test/security.test.mjs` bölüm 2: yazma, fsync, kopya, rename her aşamada hata enjeksiyonu: hedef değişmedi, geçici dosya kalmadı; `.bak` önceki sürüm. electron.test.mjs bölüm 2-3: ikinci kayıtta `.bak` = önceki içerik; temiz kapanışta kurtarma dosyası silindi; SIGKILL sonrası kaldı, açılışta soruldu, Kurtar/Sil iki yol, kaydedince silindi. app.test.py: tarayıcıda 60000 ms aralıklı `setInterval` kuruldu (geri çağrısı çağrılarak IndexedDB yazımı kanıtlandı), temiz belgede yazmaz, yeniden yükleyince soru, Kurtar/Sil, kaydet/Yeni siler.
- Sınırlama: 60 sn'lik gerçek bekleme yapılmadı; aralığın kurulduğu ve geri çağrının yedek yazdığı ayrı ayrı gösterildi.

### S-07 Kaldırıcı
- Değişiklik: `scripts/gen-uninstall-list.mjs` kurulum ağacından `Delete`/`RMDir` listesi üretir (release/uninstall-files.nsh: 72 dosya, 2 klasör); `build/installer.nsi:92-110` yalnız bu listeyi, `lang` ve `Kaldir.exe` dosyalarını siler, `RMDir` (özyinelemesiz; dolu klasör silinmez); `RMDir /r` kaldırıldı. `EnsureSubdir` (nsi:36-45) dizin sonuna `\Mihenk` ekler (dizin sayfası çıkışı ve `.onInit`, yani sessiz kurulum `/D=` dahil). `.acad` komutu tırnaklı (nsi:87). Kısayollar tek tek silinir.
- Kanıt: `test/security.test.mjs` bölüm 5 (statik: `RMDir /r "$INSTDIR"` yok, tırnaklı komut, alt dizin işlevi, liste kullanımı); `makensis` derlemesi uyarısız bitti, `file release/*.exe`: "PE32 executable ... Nullsoft Installer self-extracting archive".
- ÇALIŞTIRILMADI: Windows'ta kurulum/kaldırma. Dizin ekleme ve kaldırıcı davranışı yalnız betik okumasıyla gösterildi.

### S-08 Desen adedi (YALNIZ ARAYÜZ/DOSYA TARAFI)
- Değişiklik: dosya yüklemede desen adedi ≤ 2000 (schema.js:117-124, parametreli ifadeler çözülür); özellik panelinde aynı sınır, aşılırsa Tamam engellenir (panels.js:38-47).
- Kanıt: security.test.mjs (2000 kabul, 2001/200000/parametreli/dairesel ret); app.test.py: panelde `count1=200000` → hata, Tamam engelli.
- Kalan: çekirdekte üst sınır ve iptal edilebilir hesap yok (`kernel.js:245-254`); `poc_dos_pattern.mjs` çekirdeği doğrudan çağırdığı için hâlâ kilitleniyor.

### S-09 İzinler
- Değişiklik: `setPermissionRequestHandler`/`setPermissionCheckHandler`/`setDevicePermissionHandler` hepsi ret (main:148-150).
- Kanıt: electron.test.mjs: bildirim `denied`, konum/kamera `granted` değil, konum çağrısı hata kodu 1; `electron_probe.mjs`: tüm `perm_*` `denied`.

### S-10 Fuse'lar
- Değişiklik: package.json `build.electronFuses` (55-61): `runAsNode:false`, `enableNodeOptionsEnvironmentVariable:false`, `enableNodeCliInspectArguments:false`, `onlyLoadAppFromAsar:true`, `grantFileProtocolExtraPrivileges:false`. Yeni bağımlılık yok (`@electron/fuses` electron-builder'ın zaten getirdiği paket). `enableEmbeddedAsarIntegrityValidation` BİLEREK kapalı: `signAndEditExecutable:false` iken Windows'ta bütünlük kaynağı gömülmediğinden açılışı bozabilir; bunun için imzalama/kaynak düzenleme gerekir.
- Kanıt: `npx electron-fuses read --app release/win-unpacked/Mihenk.exe`: RunAsNode Disabled, EnableNodeOptionsEnvironmentVariable Disabled, EnableNodeCliInspectArguments Disabled, OnlyLoadAppFromAsar Enabled, GrantFileProtocolExtraPrivileges Disabled. Linux paketli derlemede `ELECTRON_RUN_AS_NODE=1 ... -e` komutu çalıştırılmadı.

### S-11 F12
- Değişiklik: `devTools: DEV` (main:224) ve F12 işleyicisi yalnız `if (DEV)` (main:229).
- Kanıt: Linux paketli derleme, uzaktan hata ayıklama portuyla: F12 ve Ctrl+Shift+I sonrası hedef listesinde DevTools yok. Geliştirmede F12 DevTools'u açar (`electron_f12.mjs`: true). Windows paketli exe çalıştırılmadı.

### S-12 .acad şema doğrulaması
- Değişiklik: `src/shared/schema.js` (tür/alan/uzunluk, iç içelik ≤64, özellik ≤5000, parametre ≤2000, dosya ≤200 MB, `__proto__` anahtarı ret, bilinmeyen özellik türü ve yinelenen kimlik → anlaşılır iki dilli hata, `version` > 1 → `checkEnvelope().newer`). `openBytes` önce doğrular, sonra belgeyi değiştirir; hata olursa mevcut belge ve geri alma yığını aynen kalır (app:535-550). Daha yeni sürüm dosyası için "daha yeni bir sürümle kaydedilmiş" onay penceresi, "Yine de Aç" ile yüklenir.
- Kanıt: security.test.mjs (33 şema kontrolü); app.test.py: 10 bozuk belge (sayı, `params=[null]`, `features=[null]`, bilinmeyen tür, `ents=5`, desen 200000, 300 kat iç içe, `rollback=-5`, yinelenen kimlik, yanlış özet) reddedildi ve belge değişmedi; daha yeni sürüm uyarısı: vazgeç yüklemez, Yine de Aç yükler. `malformed_doc_poc.py` yeniden koşuldu: tüm durumlarda `thrown=None`, yakalanmamış hata yok. `xss_poc.py` belgesi (`__proto__` anahtarlı) artık "açılamadı: izin verilmeyen ad" ile reddediliyor; enjekte `<img>` 0.

### S-13 `dist` önekli kardeş dizin
- Değişiklik: `isInside` `path.relative` ile (safe-write.cjs:35-38); main:128.
- Kanıt: security.test.mjs bölüm 3; electron.test.mjs: `dist-secret/x.txt` ve üst dizin okunamadı. `electron_probe.mjs`: `%2e%2e%2fdist-secret/x.txt` önce "200 SIR-DIST-KARDES", şimdi "403 Forbidden".

### S-14 Bozuk STEP tüm hesabı düşürüyor
- Yapılmadı (çekirdek, kapsam dışı). `poc_corrupt_import.mjs` sonucu değişmedi.

### S-15 İmzasız ikililer
- Değişiklik: `scripts/sha256sums.mjs` → `release/SHA256SUMS.txt` (`npm run dist` sonunda; `sha256sum -c` biçimi). Kod imzası yok. Güncel özet: `3560576e01d1cc142c0985d9743b7cee6ee40304a75fedf573c13c90f277364d  Mihenk-Kurulum-0.1.0.exe`.
- Kanıt: `sha256sum -c SHA256SUMS.txt` → OK.

### S-16 Kurulum artıkları
- Değişiklik: önceki başka `.acad` ilişkilendirmesi `PrevAcadAssoc` olarak yedeklenir; kaldırmada geri yüklenir, yoksa `.acad` anahtarı silinir (nsi:82-88, 100-109). Windows'ta çalıştırılmadı.

### S-20 argv, tek örnek, boyut
- Yapıldı: UNC (`\\`, `//`) argv yolu açılmaz (main:94-98); dosya okuma/kaydetme/kurtarma 200 MB üst sınırı (main:15, 100-104). Yapılmadı: tek örnek kilidi.

### S-21 Paket içeriği
- Yapıldı: `build.files` içine `!node_modules/**`; `app.asar` içeriği yalnız `dist`, `electron`, `package.json`; kurulum dosyası 132 MB'tan 121 MB'a indi. Yapılmadı: LGPL kaynak paketi.

### Kurulum dili → ilk açılış dili
- Değişiklik: kurulum dizinine `lang` dosyası (`tr`/`en`) yazılır (nsi:60-69) ve `HKCU\Software\Mihenk\Lang`; `main` ilk açılışta, kayıtlı tercih yokken okur (main:67-77).
- Kanıt: electron.test.mjs bölüm 4 (`MIHENK_LANGFILE` ile): en → menü "File", tr → "Dosya", kayıtlı tercih kurulum dilini ezer. NSIS tarafı (`$LANGUAGE` → dosya) Windows'ta çalıştırılmadı.

## Denetçi PoC'ları yeniden koşuldu

| PoC | Önceki | Şimdi |
|---|---|---|
| electron_probe.mjs (diyalogsuz yazma) | dosya yazıldı | `ERR ... bad args`, `fileWritten:null` |
| electron_probe.mjs (gezinti/yeni pencere) | uzak sayfa `native` ile yazdı | gezinti yok, pencere 0, sunucu isteği 0 |
| electron_probe.mjs (CSP, satır içi, ağ, izin) | hepsi açık | CSP başlık+meta, satır içi ve `new Function` engelli, ağ ve izinler reddedildi |
| electron_probe.mjs (`dist-secret` kaçışı) | 200 SIR | 403 |
| electron_f12.mjs | DevTools açık | geliştirmede açık (beklenen); paketli Linux derlemesinde açılmıyor |
| import_cache_ui_poc.py | B=1000 (yanlış) | B=8000 |
| malformed_doc_poc.py | istisna, yarım belge | hiç istisna yok, belge korunur |
| xss_poc.py | (XSS yoktu) | kötü belge şemada reddedildi |
| poc_kernel.mjs P2, poc_dos_pattern.mjs, poc_corrupt_import.mjs | yeniden üretiliyor | HÂLÂ ÜRETİLİYOR (çekirdek; bilerek bırakıldı) |

## Doğrulanamayanlar
- Windows'ta: kurulum, kaldırma, `.acad` ilişkilendirme yedeği, `lang` dosyası yazımı, paketli `Mihenk.exe` davranışı (F12, fuse etkisi). Yalnız Linux'ta üretilen `.exe` biçimi (`file`), fuse bayrakları (`electron-fuses read`) ve aynı kodun Linux paketli derlemesi denendi.
- Gerçek işletim sistemi kum havuzu (çekirdek `chrome-sandbox` / kullanıcı alanı): bu ortam kök kullanıcı, testler `--no-sandbox` komut satırı bayrağıyla koştu. `sandbox:true` tercihi, bayrak ve preload davranışı doğrulandı; Chromium'un gerçek süreç içi kısıtlaması doğrulanamadı.
- Gerçek OS sürükle-bırak olayı, gerçek 60 sn bekleme, 200 MB üstü dosyanın tarayıcı belleği davranışı.
- Kod imzası ve SmartScreen.
