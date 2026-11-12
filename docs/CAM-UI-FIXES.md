# Mihenk CAM arayüz düzeltmeleri (CAM-UI-FIXES) — sürüm 0.3.0

Kaynak: docs/CAM-UI-VERIFY.md (U-01…U-20). Her bulgu önce kodda ve tarayıcıda (Playwright) teyit edildi. Regresyon denetimleri `test/cam-ui.test.py` içinde (bölümler: "arayüz doğrulama düzeltmeleri", "takım düzenleyici: geçersiz giriş, rampa açısı", "keşfedilebilirlik, metinler, işlem paneli, post", "NC kaydet/aç tutarlılığı"). Düzeltme öncesi hâlde çalıştırılan karşılaştırmalı koşu yapılmadı; "teyit" ifadesi kod okuma + düzeltme sonrası denetimin geçmesine dayanır (aşağıda ayrıca belirtilenler hariç).

| ID | Durum | Değişiklik (dosya) | Eklenen test |
|---|---|---|---|
| U-01 | Teyit, düzeltildi | `.modal td .mc-pick input` özgüllüğü: radyo 18 px, ad esner (`src/ui/cam/cam.css`) | Radyo ≤ 24 px, ad > 60 px genişlik ve > 8 px yükseklik, rozet ≥ 40 px (getBoundingClientRect) |
| U-02 | Teyit, düzeltildi | Takım düzenleyici Tamam: kırmızı alan (`.input.err`) varsa kaydetmez, uyarı gösterir, ilk hatalı alana odaklanır (`toolui.js`, ortak `blockedByBadField` `util.js`) | Çap -5 → Tamam: pencere açık, takım eklenmedi, odak `tl-dia` |
| U-03 | Teyit, düzeltildi | Tezgâh düzenleyici Tamam aynı denetim (`machines.js`). İşlem ve setup panelleri zaten `numErr` ile engelliyordu; başka aynı kalıp bulunamadı (diğer modallar: onay, ad sorusu, NC, doğrulama) | Mil devri "abc", ilerleme -5 → pencere açık, ileti, odak, kayıt yok |
| U-04 | Teyit, düzeltildi | "Eksik değer" sayısı koşulsuz gerekli boş post özelliklerini de sayar: `postMissing` (`machines.js`) | Şablon eksik sayısı > 2 |
| U-05 | Teyit, düzeltildi | Post işle: boş post özellikleri kapı engelleriyle birlikte tek listede, Türkçe ad + ham ad parantezde; satıra tıklayınca tezgâh yöneticisi (`ops.js`, i18n `cam.post.prop_row`, `cam.post.prop_missing_intro`) | Şablonla Post: ≥ 6 satır, "Güvenli Z çekilme yöntemi" var, satır tıklayınca yönetici açılır |
| U-06 | Teyit, düzeltildi | `errText` alan adını önce `cam.field.<yol>` anahtarıyla çözer, yoksa eskisi gibi; 40 alan yolu için TR+EN okunur ad (`src/shared/i18n.js`, `src/i18n/cam-ui2-*.js`) | Gate metninde "en yüksek mil devri", "machine." yok; Cep boş giriş açısı hata kutusunda ham "entry.angle" yok; konsolda eksik anahtar yok |
| U-07 | Zaten kapalı (çekirdek) | Değişiklik yok: `src/cam/post/describe.js` (CAM-FIXES) başlığı okunur ASCII yazıyor | NC başlığında `cam.gate.`, `cam.pocket.`, `op_xxxx` yok; `GATES n BLOCK m WARN` satırı var |
| U-08 | Teyit, düzeltildi | Aynı neden birden çok işlemde tek satır (işlem adları birleşik); WCS için "WCS G56" boşluğu (`ops.js gateRows`) | WCS iletisi tek satır ve "WCS G56" |
| U-09 | Teyit edilemedi | Değişiklik yok: Enter, satırın `click` işleyicisi üzerinden `select → ops.edit` ile paneli açıyor | Enter paneli açar |
| U-10 | Birinci kısım teyit, düzeltildi; ikinci kısım ele alınmadı | `numErr` yalnız görünen sekmeyi bakıyordu: diğer sekmeler ekran dışında kurulup denetlenir, hatalı sekmeye geçilir (`oppanel.js hiddenBadTab`). Hesapla sonrası sonuç kutusundaki "Bu yol eski" iletisi önbellek durumunu yansıtır (daha önce hesaplanmış yol varsa doğru); yeniden üretilmedi, değiştirilmedi | Hesapla ve Tamam, hatalı sekmeye (Pasolar) geçer, panel açık kalır |
| U-11 | Teyit edilemedi | Değişiklik yok: uyarı bildirimi `TOAST_MS.warn` = 8 sn; fare bildirimin üstündeyken sayaç durur (olası neden, doğrulanmadı) | Geçersiz program no uyarısı ~9 sn sonra kapanmış |
| U-12 | Teyit edilemedi | Değişiklik yok: kapalı düğmenin ipucu gövdesi nedeni ("Önce setup ekleyin") taşıyor | Post düğmesi `data-tip-body` "setup" içerir |
| U-13 | Kısmen düzeltildi | Ağaç satır adlarına tam metin `title` (`index.js`); şerit etiketi: tek sözcük 64 px'ten uzunsa sarar (`components.css`). Taşma yalnız Tasarım kipinde ("Taşı/Kopyala", EN "Interference"); CAM şeridinde yoktu | Şerit etiketlerinde yatay kırpma yok (TR, EN, iki kip); ağaç adları `title` taşır |
| U-14 | Düzeltildi (neden koddan çıkarıldı) | Alfa'lı belirteç `#rrggbbaa` gelince three.js reddediyor ve `colorOf` gri (0x808080) döndürüyordu; alfa atılır (`viewport.js`) | Tema değişiminde "Invalid hex"/THREE.Color uyarısı yok |
| U-15 | Bilinçli sapma, belgelendi | ×1/5/25/100/500 kare başına hareket sayısıdır; UI-SPEC'teki 0,5/1/4/16× uygulanmadı (docs/CAM-UI.md) | Yok |
| U-16 | Teyit, düzeltildi | TR etiket "İnce delme (bore)" (`cam-ui2-tr.js`); EN "Boring" zaten doğru | Çevrim listesinde "Tornalama" yok |
| U-17 | Teyit (koddan), düzeltildi | Aralık satırının `needUpdate`'i boş işlevdi; etiket satırınınkine bağlandı (`machines.js`) | g541Range min/max dolunca G54.1 vurgusu kalkar |
| U-18 | Teyit, düzeltildi | Soğutma seçenekleri `cam.cool.*` adlarını kullanır (`oppanel.js`) | Seçenekler Bol soğutma / Sis / Hava / Mil içinden / Kapalı |
| U-19 | Geçersiz | Fark yalnız NC'nin 3. satırı `(PROGRAM …)`: ad belge adından geliyor (yeniden açılan dosya adı "x"). Kayıt/açma NC'yi bozmuyor | Kaydet+aç sonrası 150 satır, farklı satır yalnız 3. satır |
| U-20 | Geçersiz / bilinçli | NC başlığı ASCII ve sabit (post sözleşmesi); dil değişince değişmez | NC metninde ASCII dışı karakter yok |

## Ek: takım "En büyük rampa açısı" (`maxRampAngle`)
- Takım düzenleyici → Geometri sekmesi; yalnız "Merkezden keser" kapalıyken görünür. 0 < açı ≤ 90°, boş = tanımsız (alan silinir, değer uydurulmaz). TR+EN etiket ve ipucu (`cam.tl.max_ramp*`).
- Çekirdek alanı ve kapı 4 hazırdı; çekirdek değişmedi. Testler: görünürlük, 120° reddi, 2,5° kaydı, yeniden açınca 2,5, boşaltınca alan silinir, işaret değişince gizlenir, EN etiket.
- Kılavuzlar (KILAVUZ.md, MANUAL.md): alan anlatıldı, "bilinen sınırlar"dan ve hata tablosundaki "alan yok" notlarından çıkarıldı; Post'taki boş post özellikleri listesi ve "Eksik değer" sütunu davranışı eklendi.

## Çekirdeğe / ortak koda dokunuşlar
- `src/cam/post/engine.js`: yalnız `MIHENK_VERSION` 0.3.0 (NC başlığı varsayılan sürümü). Başka çekirdek değişikliği yok.
- `src/shared/i18n.js` (`errText`): `field` parametresi için `cam.field.*` önceliği (geriye uyumlu).
- Sürüm 0.3.0: `package.json`, `package-lock.json`, `src/ui/cam/ops.js` (artık `package.json`'dan okur). Hakkında/karşılama ekranı zaten `package.json`'dan okuyordu.

## Ertelenen / açık
- U-10 ikinci kısım (blok edilmiş Hesapla sonrası sonuç kutusu iletisi) değiştirilmedi.
- U-09, U-11, U-12 üçünün raporlanan davranışı bu ortamda yeniden üretilemedi; yalnız regresyon denetimi eklendi. U-11 için fare üstünde duran bildirimin kapanmaması olası neden.
- Gözlem (doğrulanmadı, değiştirilmedi): işlem paneli Takım sekmesinde devir/ilerleme `warn` geri çağrısı `manual()` ile `preset` etiketini silebilir; sekmeler yeniden çizildiğinde ön ayar seçimi düşebilir. `hiddenBadTab` bu yan etkiyi geri yükler.
- Gerçek Electron penceresinde NC diyaloğu ve Windows kurulumu bu çalışmada denenmedi.

## test:all son sonucu
`npm run test:all` tek seferde, baştan sona: çıkış kodu 0 (log: 05:58:48 → 06:10:10, ~11 dk 22 sn). 19 adım, hepsi geçti. Adım toplamları: i18n 27, security 71, kernel 104, solver 16, geom2d 128, profiles 1265, sketchops 94, dxf 40, stability 29, models/run-all 1282, cam 143, post 196, sim 28, `npm run build` başarılı, sketcher/app/ui betikleri çıkış 0 (toplam satırı basmıyorlar), cam-ui 171, electron 67.
