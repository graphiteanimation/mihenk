# Devam notu — 2026-11-10 (oturum sınırı nedeniyle ara kayıt)

Bu dosya yeni oturumda kaldığı yerden devam etmek için yazıldı. Tek kaynak yine Claude Docs spesifikasyonudur
(https://claude.ai/artifact/4v27ETxjeH62wwuXNwf9dU); bu not uygulama (kod) durumunu taşır.

## Kullanıcı kararları (dokümana K olarak HENÜZ İŞLENMEDİ — ilk iş)
- K-016: Programın tamamı iki dilli: Türkçe + İngilizce.
- K-017: Makine bağımsız: ileride 3/4/5 eksen farklı CNC'ler eklenebilmeli.
- K-018: Sketch ana omurga; eksik komut olmamalı (budama/trim şikâyeti).
- K-019: Öncelik alüminyum/çelik parçaların CNC'de işlenmesi; PCB, bulut vb. gereksiz; programa güvenerek iş yapılabilmeli.
- K-020: O-017 (Electron yığını) ve O-018 (aşama sırası; güvenlik + CAM öne, teknik resim sona) ONAYLANDI.
- K-021: CAM post çıktısı üretsin; çıktılar test sayılır, makinede ilk doğrulama makine projesinde (K-004) kalır. ONAYLANDI.
- K-022: Süreç yönetimi Claude'da; adımlar arası kendisi geçer, ara ara kısa özet verir. Verimlilik: kararlar ana modelde, uygulama/test alt ajanlarda (K-015).
- K-023: Ad beğenilmedi: kurumsal ad + logo + kurumsal kimlik; UI/UX ve HMI profesyonel bakışıyla arayüz tasarımı.
- Kullanıcı 0.1.0'ı Windows'ta kurdu: sketch, extrude, kaydet, STL dışa aktarma hatasız çalıştı.
- O-016 (spesifikasyon projesini kapatma) hâlâ onay bekliyor.

## Durum güncellemesi — 2026-11-10 akşam (limit %95; ikinci ara kayıt)
- Ad kararı: **Mihenk CAD/CAM**, uzantı `.mhnk` (eski `.acad` açılır), logo V-blok M + datum üçgeni. Ana model logo ve iki makete bakıp ONAYLADI.
  Belgeler: docs/BRAND.md, docs/UI-SPEC.md; varlıklar brand/, design/. Kullanıcıya bildirildi; itiraz gelmedi (SAHA MİHENK yakınlığı kabul; yedek ad Punta).
  HENÜZ UYGULANMADI: yeniden adlandırma + tasarımın arayüze işlenmesi (UI-SPEC "Uygulama planı"). Bilinen maket kusuru: yön seçicide "Symmetric" kesiliyor.
- Çekirdek düzeltmeleri BİTTİ (f7499ce): köken tabanlı kalıcı adlandırma, F-02…F-25 çoğu, S-02/S-08/S-14. test/models 1282/1282, kernel 104/104.
  Rapor: docs/KERNEL-FIXES.md. Açık: bellek ısınması +40 MB/150 tur (kararlı durumda sızıntı yok), F-15 (expr.js), F-26 (STL kiriş hatası).
- Marka/tasarım BİTTİ. Güvenlik düzeltmeleri BİTTİ (8dc19db).
- Sketch BİTTİ (cfe4627): tüm komutlar, kararlı kimlik + profil seçimi, `npm run test:all` geçiyor (rapor: docs/SKETCH.md). ESKİ NOT: Ek zorunlu işler iletildi: (1) varlık kimlikleri asla yeniden kullanılmaz (artan sayaç),
  (2) profil seçimi sıra numarası yerine sınır varlık kümesiyle saklanır, (3) app.test.py G bölümü (açılır araç grupları) düzeltilip `npm run test:all` geçirilir,
  (4) elips/spline uçtan uca test. Durumu docs/SKETCH.md ve git log'dan oku.
- Dokümana (Claude Docs) K-016…K-023 ve Aşama 9 kayıtları HÂLÂ işlenmedi.

## Biten işler (commit'li)
- v0.1.0 (41468d9): çekirdek, sketch ortamı, arayüz, Electron, kurulum.
- İki dil (309867e): 556 anahtar TR/EN, çekirdek hataları {code, params}.
- Güvenlik düzeltmeleri (8dc19db): IPC sertleştirme, sandbox, CSP, ağ kapalı, atomik kayıt + .bak + otomatik kurtarma,
  kaldırıcı, şema doğrulama, fuses. Raporlar: docs/SECURITY-AUDIT.md, docs/SECURITY-FIXES.md. `npm run test:all` 495 kontrol geçti.
- Çekirdek stres testi raporu: docs/KERNEL-TEST-REPORT.md (8 Kritik, 3 Yüksek; testler test/models/).

## Kesildiği anda SÜREN işler (yarım olabilir; `git status` ve dosyalara bakarak doğrula)
1. Çekirdek düzeltmeleri (Opus): kalıcı topolojik adlandırma (köken tabanlı yüz/kenar adları; ad tek eleman vermiyorsa ok:false),
   F-01…F-26, S-02/S-08/S-14 çekirdek tarafı, yeni segment türleri (ellipse/ellarc/spline), worker `reset`.
   Sahiplik: src/kernel/**, src/shared/errors.js, test/kernel.test.mjs, test/models/**. Çıktı: docs/KERNEL-FIXES.md.
2. Sketch'in tamamlanması (Sonnet): geom2d, F-04 (kesişen varlıkların bölünmesi), budama/uzatma/böl/ofset/köşe yuvarlat-pah/
   ayna/desen/taşı-kopyala-döndür-ölçekle/izdüşür, çokgen/kanal/elips/spline/3 nokta yay-daire/teğet yay, kutuyla seçim,
   nesne başına serbestlik, DXF içe/dışa. Çıktı: docs/SKETCH.md. Kullanıcı senaryosu: dikdörtgen + daire → budama → tek profil.
3. Marka + arayüz tasarım sistemi (Sonnet; koda dokunmaz): ad (öncelik: Mihenk > Punta > Pafta; web çakışma kontrolü),
   logo, simge, palet, tipografi, ikon seti, HMI ilkeleri, maketler. Çıktı: docs/BRAND.md, docs/UI-SPEC.md, brand/, design/.

## Sıradaki işler
4. (1) ve (2) bitince bütünleşik doğrulama: yeni segment türleriyle extrude, Ref biçimi değişikliğiyle arayüz, test:all.
5. Marka/tasarımın arayüze uygulanması + yeniden adlandırma (eski .acad açılmaya devam eder); ana model logo ve maketlere bakıp onaylar.
6. CAM (2.5 eksen + 3+1 indeks): makine profilleri (3/4/5 eksen eklenebilir), takım kütüphanesi (O-004/O-014 dokunulmaz liste),
   yüzey/kontur/cep/delme, post motoru + M80V postu, geri okuyucu + stok simülasyonu ile doğrulama; çıktı "DOĞRULANMADI" başlıklı.
   Güvenlik kapıları: dalma kontrolü, kurs sınırı, dokunulmaz numara, eksik veri → post durur.
7. Bağımsız son doğrulama, kullanım kılavuzu (TR/EN), kurulum dosyası + SHA-256, dokümana K/O/Aşama kayıtları, klasöre aktarım.

## Çalıştırma
`npm install` · `npm run dev` · `npm run test:all` · `npm run dist` (kurulum dosyası; DESIGN.md Electron bölümü).
Tasarım sözleşmesi: DESIGN.md (v0.2 eki bağlayıcı).

## Yeni oturumda kodu geri yükleme (2026-11-11)
Kod bu sohbetin çalışma alanındaydı; yeni sohbette o alan YOKTUR. Güncel kopya (git geçmişiyle):
`Documents\Fusion-Klon-Spec\AtolyeCAD\Mihenk-repo-2026-11-11.zip` → çalışma alanına aç, `npm install`, `npm run test:all`.
Sketch BİTTİ. Tasarım uygulaması (Mihenk) YARIM: durum docs/UI-IMPL.md'de ("yapıldı / kaldı"). Sonra: CAM → son doğrulama → kılavuz → kurulum 0.2.0 → Docs'a K-016…K-023.

## Durum — 2026-11-11 (tasarım uygulaması BİTTİ; sürüm 0.2.0)
- Mihenk CAD/CAM 0.2.0: yeniden adlandırma, .mhnk, açık/koyu tema, yoğunluk, yeni ikonlar, komut arama, karşılama, ayarlar. Rapor: docs/UI-IMPL.md.
- Kurulum: Mihenk-Kurulum-0.2.0.exe (SHA-256 ec2d53214092e623baa7eec07f2d33b683267295582caa027955474877b7acb0) klasörde. Windows'ta HENÜZ denenmedi.
- Testler (son koşu): kernel 104, solver 16, geom2d 128, profiles 1265, sketchops 94, dxf 40, stability 29, i18n 27, security 71, app 196, sketcher 143, ui 28, electron 67 — hepsi geçti.
  test/models/run-all bu son koşuda 400 sn sınırında kesildi (kalan yok; tamamı koşulmadı). `npm run test:all` tek seferde baştan sona koşulmadı.
- Küçük açıklar: araç çubuğunda "Taşı/Kopyala" etiketi kırpılıyor; sketch kipinde sol ağaç model ağacı; ayarlarda yalnız Genel/Hakkında; "Örnek parça" yok;
  durum çubuğu hızlı seçici 24 px; hesap iptali düğmesi testsiz; pah ölçü kısıtı eklemiyor; spline/elips teğet yok; yüz tıklayarak izdüşüm yok.
- SIRADAKİ: CAM (DEVAM.md "Sıradaki işler" 6. madde; UI-SPEC'teki İmalat çalışma alanı iskeleti ve design/mockups/05-imalat-cam.html hedef görünüm;
  delik verisi `holes[]` desenlerde tüm örnekleri taşıyor) → bağımsız son doğrulama → kılavuz (TR/EN) → Docs'a K-016…K-023 + Aşama 9.
- Kod kopyası: Mihenk-repo-2026-11-11b.zip (git geçmişiyle).

## Durum — 2026-11-11 CAM (oturum limiti %99; ara kayıt)
- Kod kopyası: Mihenk-repo-2026-11-11c.zip (çalışma ağacı dahil; A ajanının commit edilmemiş dosyaları olabilir → `git status`).
- Sözleşme: docs/CAM-DESIGN.md (bağlayıcı). Kararlar: post betiği yükleme yok (yerleşik ES modül postlar); VM1160H profilinde dokunulmaz liste ön dolu; bilinmeyen makine değeri null → post durur.
- B (post+sim) BİTTİ, commit'li: src/cam/ir.js, post/**, sim/**, docs/POST.md. post 148, sim 58, i18n 27, security 70 geçti. M80V'de null özellikler (safeRetract, dwellAddress/Unit, g541Range…) docs/POST.md'de; yerleşik makine şablonu bu alanları içermeli.
- A (çekirdek, Opus) kesildiğinde SÜRÜYORDU: src/cam/{index,ops,geom,tools,machines,gates}, kernel cam* komutları, test/cam.test.mjs, docs/CAM.md. Durumu git log + git status + docs/CAM.md'den oku; yarımsa aynı görevle sürdür (CAM-DESIGN "Dosya sahipliği → A").
- SIRADAKİ: A'yı bitir → kapı 5 (sim) bağla, sim 'error'→'block' → C (İmalat arayüzü, src/ui/cam/**, i18n cam-*.js sözlüğe bağlama, Electron saveFile kind 'nc', test:all'a cam/post/sim testleri) → bağımsız doğrulama → kılavuz → 0.3.0 kurulum → Docs'a K-016…K-023 + Aşama 9/10.

## Durum — 2026-11-11 öğleden sonra (CAM A+B+C BİTTİ; kod kopyası Mihenk-repo-2026-11-11e.zip)
- A çekirdek (3e5bfd9), B post+sim, C İmalat arayüzü (fc2316d) commit'li. Testler (ajan raporu): cam 141, post 148, sim 58, cam-ui 130, app 196, ui 28, electron 67, i18n 27, security 71. `npm run test:all` baştan sona tek seferde KOŞULMADI.
- Belgeler: docs/CAM-DESIGN.md (sözleşme), docs/CAM.md, docs/POST.md, docs/CAM-UI.md (yapıldı/kaldı).
- Karar: Neway korunan WCS yalnız G54/G56 (G58 serbest; 4. eksen işi). Neway şablonunda maxRpm, ilerleme sınırları, safeRetract, G04 adres/birim vb. null → kullanıcı doldurana kadar post durur.
- Bilinen açıklar: NC başlığında kapı uyarıları ham kod (`GATE WARN cam.gate...`) → okunur metne çevrilecek; gerçek Electron penceresinde NC kaydı denenmedi; setup ekseni yüzden seçilemiyor; delme 'points', açık zincir kontur arayüzde yok; kontur helis rampası/predrill yok; sim ana iş parçacığında.
- SIRADAKİ: bağımsız doğrulama (içeriği yazmamış ajan) → bulgu düzeltmeleri → kılavuz TR/EN + OKUBENI → sürüm 0.3.0 + `npm run dist` + SHA-256 → Docs'a K-016…K-023 + aşama kayıtları → klasöre aktarım.

## DURAKLATILDI — 2026-11-11 (kullanıcı isteğiyle; kod kopyası Mihenk-repo-2026-11-11f.zip)
- İki bağımsız doğrulayıcı başlar başlamaz durduruldu; bulgu YOK, rapor yazılmadı. Yeni oturumda ikisi baştan başlatılır:
  (1) Opus: çekirdek/post/sim'de sessiz yanlış yol, çarpışma, hatalı NC arar → docs/CAM-VERIFY.md + test/verify/**;
  (2) Sonnet: `npm run test:all` baştan sona + örnek parçayla uçtan uca arayüz (TR/EN, ekran görüntüsü) → docs/CAM-UI-VERIFY.md.
  İkisi de kod düzeltmez; bulgular sonra yazan ajanlara düzelttirilir.
- Sonra: kılavuz TR/EN + OKUBENI → sürüm 0.3.0 + `npm run dist` + SHA-256 → Docs'a K-016…K-023 + aşama kayıtları → klasöre aktarım.
- Yeni oturum mesajı: "fusion-klon-spec: DEVAM.md'yi oku, Mihenk-repo-2026-11-11f.zip'ten geri yükle, bağımsız CAM doğrulamasından devam et."

## Durum — 2026-11-11 akşam (bağımsız doğrulama YARIM; kod kopyası Mihenk-repo-2026-11-11g.zip)
- İki doğrulayıcı kullanıcı tarafından durduruldu. Kod DEĞİŞMEDİ (yalnız docs/ ve test/verify*/ eklendi).
- test:all zincirinin 19 adımı tek tek koşuldu, hepsi geçti (docs/CAM-UI-VERIFY.md). Uçtan uca arayüz senaryosu YAPILMADI.
- docs/CAM-VERIFY.md: 13 bulgu (1 Kritik V-01 A ekseni işareti Neway dir=[-1,0,0]; Yüksek V-02 ilk bölümde A yazılmıyor, V-05 mikro yay → tam daire,
  V-06 model haritası yokken sim oymayı denetlemiyor, V-09 kesmeyen uçla köprü sonrası düz dalma; Orta V-04/07/08/10/11/12/13; Düşük V-05b/15).
  Ana model bulguları kodda TEYİT ETMEDİ. test/verify/v07…v10 betiklerinin sonuçları rapora işlenmedi.
- SIRADAKİ: (1) V-01…V-15'i betiklerle teyit et, v07–v10'u koşup rapora ekle; (2) uçtan uca arayüz doğrulaması (TR/EN); (3) düzeltmeleri yazan ajanlara yaptır;
  (4) kılavuz TR/EN + OKUBENI → 0.3.0 + dist + SHA-256 → Docs'a K-016…K-023 + aşama kayıtları.
- Yeni oturum mesajı: "fusion-klon-spec: DEVAM.md'yi oku, Mihenk-repo-2026-11-11g.zip'ten geri yükle, CAM-VERIFY bulgularını teyit edip düzeltmelere geç."

## Durum — 2026-11-12 (SÜRÜM 0.3.0 ÇIKTI; kod kopyası Mihenk-repo-2026-11-12.zip)
- Bağımsız doğrulama bitti: docs/CAM-VERIFY.md (çekirdek, V-01…V-30) ve docs/CAM-UI-VERIFY.md (arayüz, U-01…U-20).
- Düzeltmeler: docs/CAM-FIXES.md, docs/CAM-UI-FIXES.md. V-01 (A işareti) düzeltildi: setup A açısı = NC'deki A kelimesi.
- `npm run test:all` baştan sona tek seferde geçti (19 adım; cam 166, post 170, sim 61).
- Kılavuz: docs/KILAVUZ.md (TR), docs/MANUAL.md (EN); OKUBENI.md 0.3.0.
- Kurulum: Mihenk-Kurulum-0.3.0.exe, SHA-256 80eb47be81113e824cee6849bd30acf60769ee90077ae5f20fac1df5645d3fb1. Windows'ta DENENMEDİ.
- Spesifikasyona (Claude Docs) K-016…K-023 ve Aşama 9–10 işlendi.
- Açık / ertelenen: V-21 (O 8000/9000 aralığı, makine projesi), V-24 (sim, çözünürlüğün yarısından küçük yan oymayı görmez; kapı uyarısı var), V-28 (yüksek yana kaymada cep köşesi artığı; uyarı var),
  V-29 (duvar örneklerinin binde birkaçında ters kesme yönü; incelenmedi), U-10'un "Bu yol eski" iletisi; toolpath.verify 220 durumun 21'iyle koşuldu;
  gerçek Electron penceresinde NC kaydı, A ekseni işlemlerinin arayüzü, Fanuc şablonu sınanmadı; setup ekseni yüzden seçilemiyor; delme 'points' ve açık zincir kontur arayüzde yok; kontur helis rampası/predrill yok.
- Tezgâhta teyit edilecek (makine projesi, K-004/K-021): A yönü (işaretli parçayla), N/O sınırları, G28/G53, Neway şablonundaki boş alanların gerçek değerleri.
- SIRADAKİ (kullanıcı): 0.3.0'ı Windows'ta kur, dene, geri bildirim. Sonraki olası aşama: 3+1 arayüzü, teknik resim (O-018 sırası), V-29 incelemesi.
- Derleme notu: `npm run dist` Linux'ta makensis ister: electron-builder-binaries nsis-3.0.4.1.7z → ~/.cache/electron-builder/nsis-3.0.4.1/nsis-3.0.4.1/ (7za ile aç; py7zr BCJ2 açamaz).
- Yeni oturum mesajı: "fusion-klon-spec: DEVAM.md'yi oku, Mihenk-repo-2026-11-12.zip'ten geri yükle, <istek>."
