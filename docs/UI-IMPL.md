# Mihenk arayüz uygulaması: yapıldı / kaldı

Her commit'te güncellenir. Plan: docs/UI-SPEC.md §9. Doğrulama komutu: `npm run test:all` (≈11 dk; alt testler tek tek de çalışır).

## Adım 1: Yeniden adlandırma
Yapıldı
- Ürün adı Mihenk / "Mihenk CAD/CAM", sürüm 0.2.0 (package.json, lock), appId `com.d160.mihenk`, pencere başlığı, `index.html` başlığı, Hakkında, sözlükler, OKUBENI.
- Kurulum dosyası `release/Mihenk-Kurulum-0.2.0.exe`, kurulum klasörü `Mihenk`, kısayollar, kayıt defteri anahtarları, kaldırıcı; `.mhnk` dosya ilişkilendirmesi ve belge simgesi (`doc-icon.ico`). `.acad` için ilişkilendirme YAZILMAZ (yalnız Dosya > Aç ile açılır).
- `.mhnk`: kaydetme varsayılanı; `.acad` açılır; belge içi `app` alanı `Mihenk` ya da `AtolyeCAD` kabul. Eski `.acad` açıkken Kaydet yeni `.mhnk` için diyalog açar, özgün dosya değişmez (testli: test/electron.test.mjs 2b, test/app.test.py C, test/security.test.mjs).
- userData: ilk açılışta eski `%APPDATA%/AtolyeCAD` içindeki `settings.json` ve `recovery/autosave.acad` yeni klasöre kopyalanır (`.migrated` işareti), eski klasör silinmez (testli, 2c).
- Simgeler: pencere simgesi (`electron/icon.png`), favicon (`public/favicon.png`), kurulum simgesi (NSIS `Icon`/`MUI_ICON`/`MUI_UNICON`), belge simgesi.
- Exe gömülü simge ve sürüm bilgisi: `scripts/patch-exe.mjs` (npm `resedit` 3.1.0, MIT, bağımlılığı `pe-library`; yalnız devDependency). Gerekçe: `signAndEditExecutable:false` rcedit'i (wine ister) atlıyor; resedit saf Node. `npm audit`: resedit yeni açık getirmedi; kalan 6 "moderate" bulgu `electron-builder` zincirindeki `minimatch` (önceden vardı, yalnız derleme aracı, çalışan uygulamaya girmez; `npm audit --omit=dev` = 0). Doğrulama: patch sonrası exe resedit ile yeniden okundu (simge grubu 1/1033 × 7 boyut, ProductName "Mihenk CAD/CAM", sürüm 0.2.0), fuse dizisi korunmuş (`000001001`). Windows'ta exe'nin açılıp simgesinin görüldüğü DOĞRULANAMADI (wine yok).
- Bilerek değiştirilmedi (iç ayrıntı, UI-SPEC §9): `app://atolye/` kökeni, `ATOLYE_*` geliştirme ortam değişkenleri, `localStorage` anahtarı `atolye.lang`, tarayıcı IndexedDB adı `atolyecad-recovery`.
Kaldı
- (yok)
