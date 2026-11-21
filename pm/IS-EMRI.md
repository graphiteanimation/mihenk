# İş emirleri (iş oturumları buradan alır; yönetim oturumu yazar)
Durumlar: Taslak (yönetim onayı yok) · Beklemede (yönetim açana dek alınmaz) · Hazır · Sürüyor · Bitti · Takıldı.
Sıra (K-051, O-054): emirler aşağıdaki sırayla alınır. "Ön koşul" satırı sağlanmayan emir atlanır, sıradaki Hazır emre bakılır. Ekran kullanan iki emir aynı anda yürümez.

## İE-001 — CAD testi T02–T10 · **Bitti** (2026-11-21c; GEÇTİ 6 · KISMEN 4 · KALDI 0, sonuç raporu `pm/test/CAD-TEST.md`)
- Amaç: `pm/test/CAD-TEST.md` planındaki kalan dokuz parçayı Mihenk arayüzünden çizmek, kaydetmek, referansla ölçmek.
- Kapsam: T02–T10. Her parça `Documents\Mihenk\Mihenk\cad-test\Tnn\` klasörüne `.mhnk` + `.step`; hacim ve kutu referansla; kaydedilen STEP build123d ile bağımsız karşılaştırılır (T01 yöntemi, `pm/test/sonuc/T01.md`). Bulgular `C-22`'den devam, `pm/test/sonuc/Tnn.md`.
- Kod düzeltmesi yapılmaz (bulgular WP-CAD1'e). T04'ten sonra `CAD-TEST.md` İlerleme tablosu ve ara rapor.
- Kabul: 9 parçanın her biri GEÇTİ / KISMEN / KALDI ile sınıflı, nedenleri yazılı; puan tablosu güncel.
- Açılış metni:
```
Mihenk: devam
```

## İE-004A — Fusion referanslarının toplanması (lisans 23 Kasım 2026'da bitiyor) · **Beklemede** (K-053: ekran kullanıcıda; yönetim Hazır yapınca alınır)
- Ön koşul: yok (Mihenk sürümünden bağımsız). Ekran kullanır; Mihenk'e dokunmaz, yalnız Fusion.
- Kapsam: (1) İE-004 Adım A: P3 üzerinde sarma (wrap) ve 3+2 (eğik düzlem) birer işlem, rapor JSON + NC (`_KARSILASTIRMA_TEZGAHA_GITMEZ`) + ekran görüntüsü `test-fusion-karsilastirma\sonuclar\P3_06\`. (2) Mevcut `sonuclar\Pn` klasörlerinin tamlığı denetlenir (rapor JSON, log, NC); eksik varsa betikle yeniden üretilir. (3) Lisans sonrası gerekebilecek her şey dosyaya alınır: P1–P4 Fusion belgeleri `.f3d` olarak dışa aktarılır, her setup için takım listesi ve işlem parametreleri (betik raporu), simülasyonda kalan stok STL'i alınabiliyorsa alınır.
- Kabul: `sonuclar\` altında dört parça için dosya envanteri `ENVANTER.md`; alınamayan her kalem nedeniyle yazılı ("bilinmiyor" / "Fusion vermiyor"); P1 ve P2 raporu + planı depoya (`test/compare/Pn/in`) alındı.
- Açılış metni:
```
Mihenk: devam
```

## İE-004 — P1–P4 ile Fusion'a karşı CAD ve CAM kıyaslaması (0.6.1 üzerinde) · **Beklemede** (K-054: İE-011 Bitti olunca yönetim Hazır yapar)
- Ön koşul: İE-011 Bitti (0.6.1 kurulu) ve İE-004A Bitti. Ekran kullanır. Adım A artık İE-004A'dadır; burada yalnız sonuçları kullanılır.
- Amaç: Mihenk 0.6'nın CAD ve CAM sonuçlarını dört parçada (P1 SK8 mil desteği, P2 NIST FTC-08, P3 NIST FTC-06, P4 NIST FTC-10) Fusion ile ölçerek kıyaslamak (K-046 ölçütü).
- Girdi: STEP ve planlar `test/compare/Pn/in`; Fusion referansı bilgisayarda `Documents\Mihenk\Mihenk\test-fusion-karsilastirma` (`Pn-PLAN.md`, `sonuclar\Pn\Pn_fusion_rapor.json`: işlem başına strateji, takım, işleme süresi, kesme ve hızlı yol boyu; Fusion NC'leri; betik `fusion-betik\MihenkKarsilastirma`). P1 ve P2'nin Fusion raporu ile planı depoda yok: ilk adımda `test/compare/P1/in`, `P2/in` altına alınır (NC dosyaları alınmaz, büyük).
- Adım A (lisansa bağlı, önce yapılır; Fusion deneme lisansı 23 Kasım 2026'da bitiyor): mevcut Fusion çıktılarında olmayan iki işlem için Fusion referansı üretilir: P3 üzerinde sarma (wrap) ve 3+2 (eğik düzlem, G68.2 karşılığı) birer işlem; rapor JSON + NC + ekran görüntüsü `sonuclar\P3_06\`. Lisans bitmişse ya da Fusion bu işlemi vermiyorsa atlanır, raporda "karşılaştırılamadı" yazılır; uydurma değer yazılmaz.
- Adım B (CAM): her parça kurulu Mihenk 0.6'da STEP'ten açılır, `Pn-PLAN.md` işlemleri arayüzden kurulur; 0.3 döneminde "Yapılamadı" kalan 3D uyarlanır kaba, yatay temizleme, 3D kontur, pah, yarık artık yapılır. İşlem başına Mihenk ↔ Fusion: yapıldı mı, kesme yolu boyu, işleme süresi, engel/uyarı sayısı, simülasyonda kalan paso ve oyma. Belge `cam-kiyas\Pn\Pn.mhnk` + NC (`_KARSILASTIRMA_TEZGAHA_GITMEZ`).
- Adım C (CAD): P2, P3, P4 Mihenk arayüzünde resimden (NIST PDF) çizilir (P1 çizimi var: `sonuclar\P1_cizim`, yeniden ölçülür); kaydedilen STEP, kaynak STEP ile build123d üzerinden karşılaştırılır: hacim ±%0,1, kutu ±0,05 mm, yüz sayısı. Çizilemeyen özellik bulgu olarak yazılır, parça KISMEN sayılır.
- Kod düzeltmesi yapılmaz; bulgular `K-01…` numarasıyla `pm/test/sonuc/KIYAS-Pn.md`, özet tablo `pm/test/KIYAS.md`. Tezgâha gidecek G-code üretilmez (K-004).
- Kabul: 4 parçanın her biri için CAD satırı (hacim, kutu, sonuç) ve CAM tablosu (işlem × Mihenk/Fusion) dolu; her fark "Mihenk hatası / yöntem farkı / bilinmiyor" diye sınıflı; BACKLOG'a düzeltme paketleri önerildi. Her parça bitince push (oturum yarıda kalırsa kaldığı parça `DURUM`'da yazılı).
- Açılış metni:
```
Mihenk: devam
```

## İE-002 — CI'yı yeşile çıkarma + C-14 ve C-21 düzeltmesi · **Bitti** (2026-11-21b; master `ci` 44911498632 yeşil, 43/43 adım, 7088 denetim; C-14 gerçek akışta yeniden üretilemedi, savunmacı düzeltme + SORULAR) (O-054; ekransız, İE-001 ya da İE-004 sürerken ayrı oturumda açılabilir)
- Ön koşul: yok. Ekran kullanmaz. Kurulu sürüme dokunmaz; düzeltme 0.6.1 ile çıkar (G-9).
- CI-1 (önce bu; ana dal yeşil değil): GitHub Actions koşusu 44901932629 (`e685ffc`, Windows) 41 adımdan 40'ını geçti, yalnız `test/resim.test.mjs` "pdftotext metni okur (O20 H7, antet)" kaldı (109 geçti, 1 kaldı). Windows koşucusunda bir `pdftotext` bulunuyor (büyük olasılıkla Git for Windows'la gelen eski sürüm; doğrulanmadı) ve çıktısında `Ø20 H7` ya da antet başlığı eşleşmiyor; Linux'ta geçiyor. Neden bulunur: PDF metni gerçekten bozuksa ürün hatasıdır ve düzeltilir; yalnız araç/kodlama farkıysa denetim araca dayanıklı yapılır (ör. PDF içerik akışını doğrudan okuyan kendi denetimi), sessizce atlanmaz.
- C-14: Extrude panelinde görünen mesafe ile uygulanan mesafe farkı; yeniden üret, düzelt, test.
- C-21: Budamada dairenin yaya dönüşürken kayması; önce yeniden üretme testi, sonra merkez/yarıçap korunarak düzeltme.
- Kabul: iki yeniden üretme testi önce kalır sonra geçer; sketch ve app testleri yeşil; GitHub'da ana dal `ci` koşusu yeşil (CI-1 dahil).
- Açılış metni:
```
Mihenk: devam
```

## İE-005 — Çekirdek: fillet ve birleştirme hataları (C-31, C-33, C-39, C-42) · **Sürüyor** (oturum 2026-11-21d) (O-055; ekransız, paralel açılabilir)
- Ön koşul: yok. Ekran kullanmaz. Alan: `src/kernel` (`naming.js` kalıcı adlandırma, `topo.js` fillet ve brepcheck); İE-002'nin alanına (eskiz budama, Extrude paneli, resim testi) dokunmaz.
- Kaynak: `pm/test/sonuc/T03.md`. Yeniden üretme girdisi: bilgisayarda `cad-test\T03\T03.mhnk`, depoda `test/cad-bench/ref` içindeki ppp0104 referansı (R4 fillet).
- C-31: tam daireden extrude edilen silindirin dikişi kesişim yayını ikiye böldüğünde iki yay aynı kalıcı adı alıyor; seçim `ref.ambiguous_here` ile reddediliyor (`src/kernel/naming.js:53,77`). Aynı iki yüz arasındaki birden çok kenar ayırt edilecek biçimde adlandırılır ya da teğet zincir tek başvuru sayılır; eski belgeler açılmaya devam eder.
- C-33: silindir iki yarım yaydan çizildiğinde aynı kenarda Fillet "result is not a valid solid (brepcheck)" veriyor (`src/kernel/topo.js:252` denetimi); build123d aynı OCCT ile yapabiliyor. Neden bilinmiyor: önce çekirdek düzeyinde yeniden üretme testi, sonra Mihenk'in fillet çağrısı build123d'ninkiyle karşılaştırılır (kenar kümesi, zincir, tolerans, sonuç denetimi).
- C-39 (`pm/test/sonuc/T04.md`): Birleştir sonrası aynı düzlemdeki yüzler ayrı kalıyor, büyük yarıçaplı fillet dikişi geçemiyor (R3 oldu, R14/R16 olmadı). `ShapeUpgrade_UnifySameDomain` (`src/kernel/topo.js` `unify`) boolean sonrası çağrılmıyor; çağrılır, kalıcı adların (naming) bozulmadığı testle gösterilir.
- C-42 (T04): yüzlere teğet temaslı gövdenin Join'i "geometry operation failed", Combine "result is empty". Yeniden üretme testi + düzeltme (bulanık tolerans / argüman sırası incelenir); çözülemezse neden yazılır, emir bu madde için Takıldı notu düşer.
- Kabul: dört yeniden üretme testi önce kalır sonra geçer (C-42 için yukarıdaki istisna); T03 ve T04 referans modelleri çekirdek testinde fillet'lerle üretilir; hacimler referansa ±%0,1; `test:all` ve GitHub `ci` yeşil. Düzeltme 0.6.1'e girer (G-9); T03'ün arayüzden yeniden çizimi 0.6.1 sonrası regresyon turunda.
- Açılış metni:
```
Mihenk: devam
```

## İE-007 — Açılı yapı düzlemi (C-37) · **Sürüyor** (oturum 2026-11-21e) (K-052; ekransız, paralel açılabilir)
- Ön koşul: yok. Ekran kullanmaz (arayüz testleri tarayıcı testleriyle bulutta koşar). Alan: yapı düzlemi tanımı (`src/kernel` özellik/eskiz düzlemi çözümü, `src/ui/features.js`, `panels.js`, görünüm seçimi); `naming.js` ve fillet/boolean koduna (İE-005, İE-006) dokunmaz. Aynı dosyada çakışma çıkarsa ana dala yeniden temellenir.
- Amaç: eskiz ve özellikler için orijin düzlemi/düz yüz dışında yapı düzlemi. En az: (1) bir düzlem ya da düz yüzden, seçilen doğrusal kenar/eksen etrafında **açıyla** düzlem; (2) **üç noktadan** düzlem; (3) mevcut ofset düzlemi korunur. Düzlem geçmişte (ağaçta) bir özelliktir, parametriktir (açı düzenlenince bağlı eskiz ve özellikler güncellenir), eskiz düzlemi ve ayna düzlemi olarak seçilebilir, belgeye kaydedilir (şema sürümü + eski belge uyumu), TR + EN.
- Kaynak: `pm/test/sonuc/T04.md` (45° destek Move/Copy ile dolanıldı). Kabul parçası: T04 (ppp0109 Corner Tie) 45° eskizi açılı düzleme çizilerek çekirdek testinde üretilir.
- Kabul: çekirdek testi (açı ve üç nokta düzlemi, açı değişince güncelleme, kaydet/aç), arayüz testi (düzlem oluştur → üzerine eskiz → extrude), `test:all` ve GitHub `ci` yeşil; KILAVUZ/MANUAL'e kısa bölüm. Düzeltme 0.6.1'e girer.
- Açılış metni:
```
Mihenk: devam
```

## İE-006 — Kabuk sonrası kenarların kalıcı adı (C-50) + fillet/pah kenar seçiminin sessizce kapanması (C-47) · **Hazır** (O-056; ekransız)
- Ön koşul: İE-005 Bitti (aynı `src/kernel/naming.js` alanı; çakışmasın). Ekran kullanmaz.
- C-50 (`pm/test/sonuc/T09.md`): Kabuk (Shell) sonrası üst kenar halkasının kenarları, düz kenar dahil, `ref.ambiguous_here` ile reddediliyor; pah/fillet yapılamıyor. Önce çekirdek yeniden üretme testi (`test/cad-bench/ref/t09-kutu.py` modeli), sonra İE-005'in C-31 çözümü bu durumu da kapatıyor mu bakılır; kapatmıyorsa kabuğun iç/dış yüz adları ayrıştırılır. Eski belgeler açılmaya devam eder.
- C-47 (`pm/test/sonuc/T07.md`, C-35 ile aynı kök): Fillet/Pah panelinde değer alanına yazınca kenar seçimi etkinliğini yitiriyor, tıklamalar sessizce yok sayılıyor. Araç açıkken görünümdeki kenar tıklaması her zaman seçime gider; arayüz testi eklenir.
- Kabul: yeniden üretme testleri önce kalır sonra geçer; T09 referans modeli çekirdek testinde 0,5 pah ile referans hacme ±%0,1; `test:all` ve GitHub `ci` yeşil.
- Açılış metni:
```
Mihenk: devam
```

## İE-008 — 0.6.1 eskiz paketi · **Hazır** (O-058; ekransız, paralel açılabilir)
- Ön koşul: yok. Alan: `src/ui/sketch`, `src/ui/sketcher.js`, `solver.js`, eskiz testleri. `features.js`, `panels.js`, `src/kernel`'e dokunmaz.
- Kapsam (kaynak `pm/test/sonuc/T01…T09.md`): C-23 kanal aracı iç kısıtları (2 ölçü + konumla tam tanımlı) · C-40 koordinatla konan noktanın aynı yerdeki uçla birleşmesi · C-25 eskiz fillet'inde köşede yardımcı çizgi yok sayılsın · C-24 teğet yayda gereksiz çakışma uyarısı · C-16 koordinat girişinde isteğe bağlı konum ölçüsü (tam tanımlı eskiz) · C-48 Bağıl kutusu son seçimi hatırlasın · C-17, C-20 çakışan doğrular (birleştir / tek budama) · C-43 teğet yay ters yönde · C-26 fillet yarıçapı hatırlansın · C-38, C-51 eskiz fillet penceresi çizimi örtmesin · C-41 kısıt rozeti uç noktayı örtmesin · C-21 yan bulguları (budamada üst üste binen varlık seçimi, uzatmada orta nokta).
- Her Hata için önce yeniden üretme testi. Eskiz Teğet kısıtı ve Ofset aracıyla T07, T08 profilleri **tam tanımlı** kurulabiliyor mu test edilir (İE-001 yöntem sınırı); çıkan yeni bulgu numaralanır.
- Kabul: Hata sınıfındakilerin (C-23, C-24, C-25, C-40) testi önce kalır sonra geçer; kalanların her biri testli ya da "yapılmadı + neden" notlu; sketcher/sketchops testleri ve GitHub `ci` yeşil.
- Açılış metni:
```
Mihenk: devam
```

## İE-010 — 0.6.1 uygulama kabuğu ve görünüm paketi · **Hazır** (O-058; ekransız, paralel açılabilir)
- Ön koşul: yok. Alan: `src/ui/chrome.js`, `screens.js`, `viewport*.js`, `app.js` (menü/dosya), `electron/`, `src/ui/drawing`. Eskiz, `features.js`, `panels.js`, `src/kernel`'e dokunmaz.
- Kapsam: C-13 kapanış ve Ctrl+N penceresi tasarım sistemine uygun, Kaydet / Kaydetme / Vazgeç, tek dil (kullanıcı bildirdi) · C-15 Dosya ▸ Son dosyalar karşılama ekranıyla aynı listeyi göstersin · C-49, C-34 Alt/Arka/Sol görünüm (menü, görünüm küpü, komut araması) · C-19 orijin düzlemleri seçilebilir (ağaçtan da) · C-46 hata bildirimi belge değişince / süreyle kapansın · C-29 dışa aktarma penceresi belgenin klasöründe açılsın · C-52 teknik resimde ölçü seçim toleransı · C-22 açılışta beyaz pencere: Electron testinde ilk çizim süresi ölçülür, üretilemezse "üretilemedi" yazılır.
- Kabul: her madde testli (app/ui/electron testleri) ya da "yapılmadı + neden"; GitHub `ci` yeşil.
- Açılış metni:
```
Mihenk: devam
```

## İE-009 — 0.6.1 modelleme panelleri paketi · **Hazır** (O-058; ekransız)
- Ön koşul: İE-006 Bitti ve İE-007 Bitti (aynı `features.js` / `panels.js`). Alan: `src/ui/features.js`, `panels.js`, gerekirse `src/kernel/model2.js`.
- Kapsam: C-45 Sweep paneli profil/yol önerisi ve ham JS hatası · C-32 fillet önizlemesi yarıçap–kenar sırasından bağımsız · C-30 delik ve yüz eskizinden kesme yönü malzemeye doğru · C-27 Ayna: fillet kaynak olabilsin, gövde aynasında Birleştir seçeneği · C-36 Revolve simetrik açı · C-18 delik konumu: yüz + yay merkezi · C-28, C-44 gövde ağaçtan seçilebilsin · C-14 Extrude mesafe alanı: yeni panelde hep 18 açılması (T05–T08 notları) incelenir, son kullanılan değer ya da tutarlı varsayılan.
- Kabul: Hata sınıfındakiler (C-45, C-32) yeniden üretme testiyle; kalanlar testli ya da notlu; GitHub `ci` yeşil.
- Açılış metni:
```
Mihenk: devam
```

## İE-011 — Sürüm 0.6.1 · **Beklemede** (ön koşullar bitince yönetim Hazır yapar)
- Ön koşul: İE-005, İE-006, İE-007, İE-008, İE-009, İE-010 Bitti; ana dal `ci` yeşil. Ekran kullanır (kurulum ve yeniden çizim).
- Kapsam: sürüm numarası 0.6.1, değişiklik notu, `test:all` + altın set, Windows kurulum dosyası, bilgisayara kurulum (`Mihenk\surumler\0.6.1\`, eski sürüm `arsiv`'e), kısa kabul (aç, örnek, kaydet, NC). KISMEN parçalar T03, T04, T05, T09 kurulu 0.6.1'de arayüzden yeniden çizilir; hedef dördü de GEÇTİ. `cad-bench` regresyon hedefleri referans hacme çekilir. Kullanıcı için 10 dakikalık deneme listesi (`pm/test/DENEME-0.6.1.md`): C-13, C-14, C-20, C-21 ve açılı düzlem dahil.
- Kabul: GitHub'da `v0.6.1` etiketi ve sürüm sayfası (SHA-256); kurulu; CAD testi puan tablosu güncel; deneme listesi kullanıcıya verildi.

## İE-003 — CAD test parçalarının otomatik regresyonu · **Sürüyor** (oturum 2026-11-21f) (O-056; ekransız, paralel açılabilir)
- Ön koşul: yok. Alan yalnız `test/` (kaynak koda dokunmaz). Girdi: bilgisayarda `Documents\Mihenk\Mihenk\cad-test\Tnn\*.mhnk` (T01–T10; klasör erişimi istenir) → depoda `test/cad-bench/mhnk/`.
- Biten her `cad-test/Tnn.mhnk` depoya `test/cad-bench/mhnk/` altına alınır; yeni test adımı her belgeyi çekirdekte yeniden hesaplar, hacim ve kutuyu `ref/` ile karşılaştırır (±%0,1).
- KISMEN parçalar (T03, T04, T05, T09) bugünkü hacimleriyle "bilinen eksik" olarak kaydedilir; İE-005/006 düzeltmelerinden sonra hedef referans hacme çekilir.
- Kabul: T01–T10 testte; `npm run test:all` zincirine eklendi; CI yeşil.
