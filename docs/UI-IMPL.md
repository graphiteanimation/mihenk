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

## Adım 2-3: Tasarım belirteçleri, tema, kabuk (kısmen)
Yapıldı
- `src/ui/tokens.css` + `components.css` (design/ başvurusundan; ham HEX yalnız belirteç dosyasında), gömülü yazı tipleri (Inter, JetBrains Mono; `src/ui/fonts`, CSP `font-src 'self'`).
- Açık/koyu tema (`data-theme`, "Sistem" seçeneği), yoğunluk Normal/Büyük (`data-density`); tercihler `src/ui/prefs.js` ile kalıcı (Electron: settings.json, tarayıcı: localStorage). 3B görünüm ve eskiz renkleri `--vp-*` değişkenlerinden okunur, tema değişince yeniden kurulur (`Viewport.applyTheme`, `Sketcher.retheme`).
- Ayarlar penceresi (dil, tema, yoğunluk, karşılama ekranı, Hakkında) `src/ui/screens.js`; karşılama ekranı (yeni, aç, son dosyalar alanı, üç adım).
- Kabuk: üst çubuk (logo, Dosya menüsü, geri al/yinele/kaydet, belge adı + kaydedilmedi göstergesi, Ctrl+K komut arama, makine rozeti "Neway VM1160H", ayarlar, yardım), çalışma alanı sekmeleri (Tasarım; İmalat/Teknik resim "Yakında" devre dışı), şerit (gruplar, açılır listeler, "Son kullanılan komutlar", taşma menüsü »), tarayıcı, sağ panel, zaman çizelgesi, durum çubuğu (kip, araç, hatalı özellik sayısı, seçim, birim, hesap süresi, otomatik kayıt zamanı), görünüm küpü/düğmeleri, ipuçları (ad + kısayol + cümle), boş durum, toast/modal/onay desenleri; 141 simgelik marka kümesi `icons.js`.
- HMI: parametre alanlarında birim yanında, ifade altında çözülmüş değer, alan hatası simge+metin; hesaplama iptali (işçi sonlandırılıp yeniden başlatılır, sonuç "güncel değil" işaretlenir); kalıcı hata bildirimi, kalıcı olmayanlar 5-8 sn.
- Bilinen kusur: eskiz komutu ile model komutu kimlik çakışması (fillet/chamfer/mirror/move) `sk-` önekiyle çözüldü.
- Testler uyarlandı (`data-cmd`/`data-testid` bağları): app.test.py 196, sketcher 143, electron 66 geçti.
- Yeni `test/ui.test.py` (28 geçti; `test:all`'a eklendi): tema + kalıcılık + sistem teması, yoğunluk, Ctrl+K komut arama (TR/EN), karşılama, klavye turu (Tab ana bölgelere), odak görünürlüğü, hedef boyutu >=32/>=40 px, kontrast aracı (kalan çift 0), belirteç kayması, HEX taraması, azaltılmış hareket, ekranda "AtolyeCAD" yok.
- DXF için Electron dosya türü `dxf` (kaydet/aç diyaloğu, testli); pencere en küçük boyutu 1200x700; bildirim sütunu sol altta (sağ panel düğmelerini örtmez).
- Karşılama: son dosyalar ana süreçte (`userData/recent.json`, `native:recentList`/`native:openRecent` yalnız dizin alır, testli), alt çubukta hızlı dil/tema/yoğunluk seçicileri, başlık "Atölye için CAD/CAM."; ayarlar penceresi altında "Değişiklikler anında uygulanır" + "Varsayılana dön" + Kapat, üstte kapat (X).
- Ekran görüntüsü turu 1: `test/shots-ui.py` → `test/shots/ui/` (açık TR / koyu EN x 1440 / 1920 x karşılama, model, eskiz, ayarlar) tasarım/shots ile yan yana karşılaştırıldı; düzeltilenler: kenar seçim alanında "Temizle" kırpılması (X simgesi), panel altında Enter/Esc ipuçları, panel başlığında özellik simgesi, kısıt listesi satırları, ayarlar alt satırı, karşılama başlığı.
Kaldı
- "Simetrik" kırpılması, onay penceresi biçimleri, ekran görüntüsü turları (açık/koyu x TR/EN x 1440/1920), Electron öz sınama, `npm run dist`.
