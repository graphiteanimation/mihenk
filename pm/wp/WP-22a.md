# WP-22a — PDF altlık arayüzü, vektör PDF, DXF kesme çizgisi, kopuk ölçü bağlama
Dal: `wp-22a` (tabanı master 058e083) · Model: Sonnet · Kaynak: BACKLOG WP-22 (ilk dilim), O-049, WP-14 (altlık çekirdeği), WP-17 (teknik resim)

## Sözleşme özeti
Kabul: `test/wp22a.test.mjs` (test-all'a eklendi) + `security`, `resim`, `dxf`, `sketchops`, `i18n`, `wp14` geçer; `npx vite build`, sonra `sketcher`, `app`, `ui` Python testleri geçer; altlık için kısa ekran testi. Dokunulmayanlar: `src/cam/`, kernel (hiç dokunulmadı). Ortak dosyalarda en küçük ekleme.

## Yapılanlar
1. **Altlık arayüzü (eskiz).** Şeritte "Altlık" açılır menüsü (`sk-ul-add`, `sk-ul-scale`, `sk-ul-fit`, `sk-ul-props`; dar ekranda mevcut taşma menüsüne düşer). `src/ui/sketch/underlay.js`: Sketcher'a eklenen `UNDERLAY_METHODS` + uygulama pencereleri.
   - Ekle: PNG/JPEG/PDF (Electron: yeni `underlay` dosya türü, yalnız okuma; tarayıcı: `<input type=file>`). PDF çok sayfalıysa sayfa numarası sorulur. Altlık eskiz düzleminde doku (THREE.Mesh, `renderOrder -10`, `depthTest:false`) olarak yarı saydam çizilir; seçime/yakalamaya girmez; ilk eklemede görünüm altlığa sığdırılır.
   - Ölçekle: altlıkta iki nokta tıkla, gerçek mesafe (ifade/parametre kabul eder) yaz → A sabit, ölçek `scaleByDistance`. Giriş kutusu fare bırakılınca açılır (basışın odak değişimi kapatmasın diye).
   - Oturt: A (altlık), A' (eskiz, yakalanır), B, B' → `fitTwoPoints` (ölçek+dönme+öteleme).
   - Özellikler penceresi: saydamlık, görünür, kilitli, kaldır. Kilitliyken ölçekle/oturt/değiştir/kaldır reddedilir (durum satırı + toast).
   - Geri al: her değişiklik tek adım (`_undo` girdisi `{u: önceki altlık}`; veri dizgesi paylaşıldığı için yığın şişmez). Yinele çalışır.
   - Kayıt: `stop()` ve `finishSketch`/düzlem ofseti yeniden başlatması altlığı taşır; şemaya isteğe bağlı `locked` eklendi (WP-14 biçimli, `locked`'sız belgeler açılır).
2. **Vektör PDF (O-049).** `pdfjs-dist` 6.5.438 (sabit, `package.json`). `src/shared/pdfrender.js`: tembel `import()` (ana parça şişmez; `pdf-*.js` 444 kB + `pdfworker-*.js` 1,2 MB yalnız PDF seçilince yüklenir), işçi `new Worker(new URL('./pdfworker.js', import.meta.url))` ile `self` kaynağından; `isEvalSupported:false`, `disableFontFace:true` (yazı tipleri yol olarak çizilir; `font-src` gevşetilmez), `useSystemFonts:false`. Veri (standart yazı tipleri, openjpeg/jbig2/qcms wasm) `public/pdfjs/` altında, `self`'ten `fetch` (connect-src 'self'). Sayfa canvas'a çizilir → PNG (8 MB'ı aşarsa JPEG, sonra ölçek düşürme); `mmPerPx` = sayfa gerçek boyutu (pt→mm; A4 yatay 297×210 mm doğrulandı), kullanıcı yine iki noktayla doğrular. Hatalar KErr + Türkçe/İngilizce: `pdf_bad`, `pdf_encrypted`, `pdf_timeout` (yükleme 30 sn, çizim 90 sn; zaman aşımında görev yok edilir), `pdf_render`, `pdf_engine` (işçi açılamazsa WP-14'ün gömülü JPEG yolu yedek olarak denenir), `too_big`, `bad_file`.
   - CSP: `electron/csp.cjs`, `index.html` meta ve `isWorkerScript` DEĞİŞMEDİ. pdf işçisi dosya adı `pdfworker-*` (çekirdek işçi `worker-*`), bu yüzden ana CSP ile sunulur (unsafe-eval YOK). `electron/main.cjs`'te yalnız `underlay` dosya türü (+`OPEN_ONLY`) eklendi.
3. **DXF kesme çizgisi.** `src/drawing/dxfout.js`: `cutk` (kalın uçlar) artık ayrı katman `CUTTING_ENDS` (CONTINUOUS); ince gövde `CUTTING` (CENTER). Eskiden iki parça tek katmandaydı ve katman çizgi türü CENTER olduğu için kalın uçlar da eksen çizgisi çıkıyordu. Geri okuma testi katman tablosunu ve varlık katmanlarını ham DXF'ten okur; `parseDxf` 4 çizgiyi uzunluklarıyla okur.
4. **Kopuk ölçüyü bağlama.** `dims.js`: `lostRefIdx(how)`, `relinkRef(eskiRef, ilkel, tık)` (tür uyumu: çizgi↔çizgi, daire/yay↔daire/yay; uç/orta/merkez seçimi korunur; uyumsuzsa `null`). Arayüz: kopuk ölçü seçilince panelde "Yeni kenara bağla"; araç kopuk her başvuru için sırayla yeni kenar/nokta ister, aynı görünüş zorunlu; Esc iptal. Bağ kenar anahtarıyla kalıcı (model değişince yeniden eşlenir).

## Testler (bu ortamda koşuldu)
- `node test/wp22a.test.mjs`: **55/55** (DXF 9, ölçü bağlama 17, altlık çekirdeği/şema 14, pdf.js açma ve hatalar 10, işçi/CSP statik 5).
- `python3 test/wp22a-ui.test.py` **46/46** (PNG ekle/gizle/geri al, ölçekle, oturt, özellik/kilit, kaydet/aç, eski biçim belge, vektör PDF 2 sayfa + sayfa seçimi, bozuk PDF, **gerçek CSP başlığıyla** pdf işçisi unsafe-eval'siz, kopuk ölçü bağlama).
- `security` 82/82 (başlangıç 74; +8: pdf işçi adı/dist denetimi, dist'te eval/new Function yok), `resim` 111, `dxf` 40, `sketchops` 154, `i18n` 52, `wp14` 168 — hepsi 0 kalan.
- `vite build` geçti; `sketcher.test.py` 299/299, `app.test.py` 411/411 (bir beklenti güncellendi: İngilizce sketch şeridi grupları artık "Underlay" içerir), `ui.test.py` 32/32.

## O önerisi (teknik seçimler)
- Altlık menüsü bir grup (açılır menü); 1400 px'te şerit dolu olduğundan taşma menüsüne düşer (komutlar paletten de açılır).
- PDF çözünürlüğü: en uzun kenar ≈2600 px (en çok ×3 büyütme), 40 Mpx üstü ve 8 MB üstü için otomatik düşürme; vektör çizimde ölçek zaten gerçek boyuttur.
- `isEvalSupported:false` geçilir ama pdfjs-dist 6.x'te eval yolu hiç yoktur (seçenek kaldırılmış; dist işçi/ana parçada `new Function`/`eval(` aranıp bulunmadığı test edilir).
- Standart yazı tipi ve wasm verisi depoya kopyalandı (`public/pdfjs`, 1,3 MB; lisanslar `public/licenses`). cmap (CJK) yok.
- Yalnız altlık içeren, çizimsiz yeni eskiz "boş sketch" kuralıyla atılır (mevcut davranış).

## Açıklar / kalan
- Şifreli PDF için ayrı koşul testi yok (`pdf_encrypted` yolu pdf.js `PasswordException` eşlemesiyle kodlu, gerçek şifreli dosyayla denenmedi; WP-14'ün `/Encrypt` yolu ayrı denetlenmişti). Parola sorma yok.
- pdf.js 6.x modern JS ister (Electron 45/Chromium'da yerleşik); Node testi için `Promise.try` ve `Uint8Array.toHex` test dosyasında yedeklenir. Eski tarayıcıda PDF açılmaz (açık hata, yedek JPEG yolu).
- Gerçek Electron kabuğunda (`underlay` türü diyaloğu, app:// altında işçi/fetch) koşulmadı; Chrome + elektron CSP'sini birebir taklit eden sunucuyla doğrulandı. `test/electron.test.mjs` koşulmadı.
- Kopuk ölçü bağlama: Esc dışında "geri al" ayrı adım değildir (her bağ `commitMeta` adımıdır, uygulama geri al'ı ile geri alınır). Ölçü bağlanırken yalnız aynı görünüşteki kenar kabul edilir.
- Altlık dönmesi/öteleme için fare ile sürükleme yok (yalnız iki nokta oturtma).
