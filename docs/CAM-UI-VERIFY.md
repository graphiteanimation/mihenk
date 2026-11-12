# Mihenk CAM — arayüz ve test:all doğrulaması (CAM-UI-VERIFY)

Tarih: 2026-11-11 · Bağımsız doğrulayıcı. Görev 1 (test:all) tamamlandı; Görev 2 (uçtan uca arayüz) koşuldu: betikler test/verify-ui/{e2e.py,cam_phase.py,runall.sh}, görüntüler test/verify-ui/shots/ (`<dil>-<tema>-NN-<adım>.png`), günlükler test/verify-ui/logs/. Kod düzeltilmedi.

## test:all — adım adım (her adım ayrı koşuldu; hepsi çıkış kodu 0)

| # | Adım | Çıkış | Süre (sn) |
| --- | --- | --- | --- |
| 01 | `node test/i18n.test.mjs` | 0 | 0.4 |
| 02 | `node test/security.test.mjs` | 0 | 0.1 |
| 03 | `node test/kernel.test.mjs` | 0 | 6.7 |
| 04 | `node test/solver.test.mjs` | 0 | 0.1 |
| 05 | `node test/geom2d.test.mjs` | 0 | 0.2 |
| 06 | `node test/profiles.test.mjs` | 0 | 15.4 |
| 07 | `node test/sketchops.test.mjs` | 0 | 0.3 |
| 08 | `node test/dxf.test.mjs` | 0 | 0.2 |
| 09 | `node test/stability.test.mjs` | 0 | 0.9 |
| 10 | `node test/models/run-all.mjs` | 0 | 386.1 |
| 11 | `node test/cam.test.mjs` | 0 | 5.9 |
| 12 | `node test/post.test.mjs` | 0 | 0.1 |
| 13 | `node test/sim.test.mjs` | 0 | 1.1 |
| 14 | `npm run build` | 0 | 1.4 |
| 15 | `python3 test/sketcher.test.py` | 0 | 58.3 |
| 16 | `python3 test/app.test.py` | 0 | 89.5 |
| 17 | `python3 test/ui.test.py` | 0 | 10.3 |
| 18 | `python3 test/cam-ui.test.py` | 0 | 40.2 |
| 19 | `node test/electron.test.mjs` | 0 | 32.2 |

Tek seferlik `npm run test:all` günlüğü: test/verify-ui/logs/test-all.log (son satırlar aşağıda).

```
  ok    kayıtlı kullanıcı tercihi kurulum dilini ezer
5: öz-test
  ok    Electron öz-testi (sandbox:true) GEÇTI

67 geçti, 0 kaldı
EXIT=0 17:02:41
```

## Uçtan uca senaryo (gerçek fare/klavye; `npm run build` + `vite preview :4301`)
Kanca kullanımı yalnız okuma/ölçme içindir (belge durumu, DOM sorgusu, geliştirme sırasında parça önbelleği). Tıklama, yazma, kısayol gerçektir. Post özelliği değerleri (G53, P, ms, M7…) **deneme değeridir**, gerçek Neway verisi değildir.

| # | Adım | Sonuç |
|---|---|---|
| 1 | Eskiz (XY) dikdörtgen 100×60 → Extrude 20; üst yüzde eskiz: dikdörtgen 40×30 + daire Ø16 → Extrude KES 8; üst yüzde 4 nokta → Delik Ø6×10 | Geçti. Hacim beklenenle aynı (108 791,5 mm³ cepten sonra). Not: ilk denemede delik eskizi cep tabanına düştü (kendi hatam), düzeltildi. |
| 2 | İmalat sekmesi; boş durumda Post/Simüle/Yüzey | Düğmeler devre dışı (aria-disabled) ama ipucu nedeni söylemiyor (U-12) |
| 3 | Tezgâh: Neway şablonu seçili, boş alanla Post | DURDU (doğrulandı): "Eksik bilgi machine.spindle.maxRpm / feed.maxCut" + korunan T1/H3/WCS G56 satırları |
| 4 | Takım: T1/H3/D12 | Alan altı uyarı + kutu uyarısı; kayıt serbest; listede kırmızı satır; Post'ta engel |
| 5 | Setup: G54, G56 | Anlık uyarı; kayıt serbest; Post'ta her işlem için ayrı engel satırı |
| 6 | Yüzey, Kontur (gövde dış sınırı), Cep (taban yüzü), Delme | Hepsi hesaplandı; kütüphane kuralları (Ø35 takım cebe sığmıyor, derinlik yok) mesajları anlaşılır |
| 7 | Simülasyon | Oynat/End/sorun listesi çalıştı; sorunlar Post engelleriyle tutarlı |
| 8 | Tezgâhı kopyala, mil/ilerleme doldur; korunanları gider; Post | Post "Post özelliği boş: safeRetract" ile durdu (tek tek) |
| 9 | Post özelliklerini doldur → NC önizleme → program no → Kaydet (.nc) | Üretildi (248 satır); başlıkta `(UNVERIFIED POST - DOGRULANMADI …)`; kayıt indi, toast "NC kaydedildi" |
| 10 | Doğrulama beyanı; belge değişince düşme; Ctrl+Z ile geri gelme | Çalıştı; NC başlığında `(VERIFIED BY … ON …)`, "UNVERIFIED" satırı da kalıyor |
| 11 | Ctrl+S → yeniden yükle → Ctrl+O | `doc.cam` birebir aynı, doğrulama beyanı korundu; yollar "Hesaplanmadı" (beklenen) |
| 12 | Tezgâh profili (localStorage) silinmiş açılış | "Tezgâh profili bulunamadı. Bir tezgâh seçin." ve Post uyarısı; sessiz hata yok |
| 13 | Klavye: Tab, odak, Esc, Enter, Del, F2, Shift+F10 | Odak halkası var, modal odak tuzağı var, Del onayında varsayılan "Vazgeç"; U-09 |
| 14 | TR/EN × açık/koyu | Dört koşu: bkz. "Koşu özeti" |

## Bulgular
Önem: Kritik / Yüksek / Orta / Düşük. "Şüphe" = kesinleştirilmedi.

| ID | Önem | Yer | Yeniden üretme | Gözlenen ↔ Beklenen | Görüntü | Düzeltme yönü |
|---|---|---|---|---|---|---|
| U-01 | Yüksek | src/ui/style.css:149 `.modal td input{width:100%}` ↔ src/ui/cam/cam.css:12 `.mc-pick input` | İmalat → Tezgâh | Tezgâh yöneticisinde radyo 292×32 px'e şişiyor, tezgâh adı (span) 0 px genişlikte: **adlar görünmüyor**, "Yerleşik" rozeti ezik. ↔ Ad görünmeli, radyo 18 px. test:all kaçırdı (DOM metni var, görünmüyor). | shots/tr-light-17-c03-tezgah-yoneticisi.png | `.modal td .mc-pick input{width:18px;height:18px}` (özgüllük) |
| U-02 | Yüksek | src/ui/cam/toolui.js (Tamam `check`) | Takım yöneticisi → Yeni → Çap = -5 → Tamam | Alan kırmızı ("En az 0,001") ama Tamam pencereyi kapatıp takımı **eski/varsayılan çapla (10)** kaydediyor; kullanıcı fark etmez. ↔ Hatalı alan varken Tamam engellenmeli (işlem/setup panelleri engelliyor). | shots/tr-light-22-c08-negatif-cap-tamam.png | `check` içinde `.input.err` denetimi |
| U-03 | Orta | src/ui/cam/machines.js (mc-ok check) | Tezgâhı kopyala → Mil: devir "abc", ilerleme -5 → Tamam | Editör kapanıyor, alanlar sessizce boş (null) kalıyor; hata uyarısı yok. | shots/tr-light-*-c47-tezgah-hatali-sayi.png | U-02 ile aynı |
| U-04 | Orta | tezgâh yöneticisi "Eksik değer" sayısı | Neway kopyası: mil+ilerleme dolu | Yönetici "—" (eksik yok) gösterir; oysa 13 post özelliği boş ve Post durur. Şablon için "2 alan boş" da eksik saymış. ↔ Post özellikleri de sayılmalı. | c51/c52 | `checkMachine` sayımına post özellikleri |
| U-05 | Orta | Post hata akışı | Post özellikleri boşken Post işle | Tek bir özellik ("safeRetract") bildiriliyor, kalan 12'si için kullanıcı sırayla dener; ham camelCase ad; tezgâh düzenleyiciye bağlantı yok. ↔ Tüm eksikler tek listede, Türkçe ad, "Tezgâhı düzenle" eylemi. | c57 | `cam.post.prop_missing` tüm eksikleri listele |
| U-06 | Orta | i18n: `machine.spindle.maxRpm`, `machine.feed.maxCut`, `entry.angle`, `geom` | Şablonla Post; Cep'te giriş açısı boş/seçim boş → Hesapla | Metinde ham alan yolu ("Eksik bilgi: machine.spindle.maxRpm", "eksik bilgi: entry.angle", "…: geom"); konsolda `[i18n] eksik anahtar (tr)` ×4. ↔ Okunur alan adı. | c43, c26, c27 | Alan adları için `cam.field.*` anahtarları |
| U-07 | Orta | NC başlığı (post fanuc-base.js:98) | NC önizleme satır 10-11 | `(GATE WARN cam.gate.travel_abs_unchecked)`, `(GATE WARN cam.pocket.rest_material op_xxxx)`: ham kod + içsel işlem kimliği (bilinen gözlem, CAM-UI.md). ↔ Okunur ASCII özet. | shots/tr-light-65-c64-nc-kaydet.png | Başlıkta kısa ASCII metin |
| U-08 | Düşük | kapı iletisi `cam.gate.protected` | Post engel listesi | "WCSG56 dokunulmaz listede" (boşluk yok); aynı neden her işlem için ayrı satır (4 satır). ↔ "WCS G56"; setup başına tek satır. | c43 | Şablon düzelt, grupla |
| U-09 | Orta | src/ui/cam/index.js işlem satırı | İşlem satırına Tab → Enter | Enter yalnız seçer; düzenleme paneli yalnız çift tık / Shift+F10 → Düzenle ile açılır; klavyeyle keşfedilmez. ↔ Enter paneli açmalı (setup satırı gibi). Şüphe: Shift+F10 menüsü çalıştı (Düzenle öğesi var). | c81 | `key` işleyicisine Enter |
| U-10 | Orta | İşlem paneli Tamam/Hesapla | Cep: giriş açısı boş iken Yükseklikler sekmesinde Hesapla | "Kırmızı çerçeveli alanları düzeltin" toast'ı ama görünen sekmede kırmızı alan yok; Pasolar sekmesinde. Ayrıca hatalı alanla Hesapla sonrası sonuç kutusu "Bu yol eski" diyor (hiç hesaplanmadı). ↔ İlgili sekmeye geç/işaretle. | c26 | Sekme rozeti / sekmeye odak |
| U-11 | Düşük | Toast yığını | Program no 0 → uyarı | Uyarı toast'ı otomatik kapanmıyor, sonraki ~10 adım boyunca ekranda kalıyor; yeni toast'lar altında sıkışıyor. ↔ Zaman aşımı ya da yeni eylemde temizleme. | shots/tr-light-65-c64-nc-kaydet.png | `TOAST_MS.warn` |
| U-12 | Düşük | Şerit devre dışı düğmeleri | Setup yokken Yüzey/Post üstünde bekle | İpucu yalnız ad ("Yüzey"); UI-SPEC "ipucu nedeni söyler" ↔ "Önce setup ekleyin". | c02 | `title`/ipucu nedeni |
| U-13 | Düşük | Tarayıcı ağacı, şerit | Her adım (denetim) | Kırpılan etiketler: tezgâh adı "Neway VM1160H · M…" (252 > 147 px), işlem alt satırı "T2 · Ø50 · Yüzey fre…", şerit "Taşı/Kopyala" (72 > 64 px). Tam ad ipucunda var mı: şüphe. | shots/tr-light-65-c64-nc-kaydet.png | Satır sarma / ipucu |
| U-14 | Düşük | src/ui/viewport.js:17 `colorOf('--vp-region-sel')` | Eskiz ekranı (açık tema) | Konsol uyarısı `THREE.Color: Invalid hex color #1f6fd157` (12 kez/koşu). Bölge dolgusu rengi geri düşüyor olabilir (şüphe). ↔ rgba belirteci ayrıştırılmalı. | logs/e2e-tr-light.json | alfayı ayır / hex6 + opaklık |
| U-15 | Düşük | Simülasyon hız seçici | Simüle et | ×1/5/25/100/500; UI-SPEC "0,5/1/4/16×". Tasarımdan sapma. | c39 | Spec'i ya da seçenekleri eşle |
| U-16 | Düşük (şüphe) | Delme çevrimi etiketi | Delme → Çevrim | "Tornalama (bore)": TR/EN karışık, terim şüpheli (delik büyütme/ince delme). | c34 | Terimi düzelt |
| U-18 | Orta | src/ui/cam/oppanel.js COOLANT seçenekleri, i18n `cam.ppw.coolant.*` | Yüzey/Kontur/Cep/Delme paneli, Soğutma listesi | Seçenek etiketi 'Bol soğutma M kodu.' / 'Flood coolant M code.' (post özelliği yardım metni); beklenen: seçenek adı (Bol, Sis, Hava, Mil içi, Kapalı). | shots/tr-dark-32-c18-yuzey-paneli-takim-T1.png | cam.cool.* adlarını kullan |
| U-17 | Düşük (şüphe) | Tezgâh editörü Post sekmesi | Tüm alanları doldur | Bir `.fld.need` (data-row yok, g541Range?) dolduktan sonra da "gerekli" işaretli kalıyor; Post çalıştı. | c59 | needUpdate bağla |

Olumlu doğrulamalar: eksik veriyle Post durur; korunan T/H/D/WCS Post'u engeller; NC "DOĞRULANMADI"; Del onayı güvenli varsayılan; Esc yeni işlemi geri alır; Ctrl+Z/Y çalışır; kayıt/yeniden açma `doc.cam`'ı korur; tezgâh profili yokken açılış anlaşılır.

## Koşu özeti ve sınanamayanlar
Dört koşu (hepsi tam; 99 adım, adım FAIL yok):

| Koşu | Konsol | Ham anahtar | Not |
|---|---|---|---|
| tr-light | 12x THREE.Color uyarısı, 4x i18n eksik anahtar | NC başlığı (U-07) | referans |
| tr-dark | aynı (#5fa2ee61) | aynı | koyu temada ek görsel kusur görülmedi |
| en-light | aynı, `(en)` | aynı; gate iletisinde machine.spindle.maxRpm | EN'deki TR harfli sözcükler yalnız benim yazdığım ad/notlar (Atölye, büyük), arayüz metni değil |
| en-dark | aynı | aynı | - |

Ek gözlemler:
- U-19 (şüphe): kayıt + yeniden açma sonrası NC yeniden üretilince 89-92. satırlarda fark okundu (yeni NC'de boş satır). doc.cam birebir aynı; okuma yöntemim (NC satır DOM'u) kaynaklı olabilir. İki NC'yi dosya olarak karşılaştırın (ilk NC: /tmp/nc-out/*-PROGRAM.nc).
- U-20 (Düşük): NC başlığı EN modunda da DOGRULANMADI içerir (ASCII sabit başlık; çift dilli olması bilinçli olabilir).
- Görüntü incelemesi (Read): tr-light-14, -17, -65; tr-dark-32, -54; en-light-57. Görsel kusurlar: U-01, U-13, U-18, U-11. Simülasyon, stok ağı ve takım yolları koyu temada okunaklı.
- Not: önceki yarım denemenin explore*/scratch/flow/build/lib/steps.sh dosyaları silindi (steps.sh test:all adım koşucusuydu; tablo logs/steps çıktısından alınmıştı).

### Sınanamayanlar
- Gerçek Electron penceresinde NC kaydı/diyaloğu (yalnız tarayıcı indirmesi).
- 4./5. eksen, A ekseni (3+1) setup, Uyarlanır/Diş/3B yüzey (arayüzde yok ya da yakında); Kılavuz çevrimi denenmedi.
- Fanuc genel şablonu; gerçek Neway değerleriyle post (post özellikleri deneme değeri).
- Makinede NC doğruluğu (kapsam dışı); büyük programda simülasyon donması ölçülmedi.
- Ekran okuyucu, renk körlüğü; yalnız odak halkası ve Tab sırası sınandı.
- Geliştirme sırasında parça bir ara önbellekle (FAST=1, app.openBytes kancası) yüklendi; final dört koşuda parça baştan gerçek tıklamayla üretildi.
