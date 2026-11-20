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
`Documents\Fusion-Klon-Spec\Mihenk\Mihenk-repo-2026-11-11.zip` → çalışma alanına aç, `npm install`, `npm run test:all`.
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

## Durum — 2026-11-12 öğleden sonra (eksik analizi; kod DEĞİŞMEDİ)
- Kurulum: SHA-256 teyitli; bilgisayarda kurulumu kullanıcı başlatacak (Dosya Gezgini yalnız tıklama izni, pencere görünmedi).
- Eksik analizi (NX/Fusion kıyası): https://claude.ai/artifact/L4C72y7G1BHEPQBf3Se3Ru — ara dosyalar Mihenk\analiz\ (envanter, referans, dogrulama, PROMPT).
- Onay bekleyen: O-019 (0.3.x tezgâh kabulü önce) … O-028. Yol haritası: 0.4 prizmatik eksiksiz → 0.5 verim/çarpışma → 0.6 3D + teknik resim → 1.0.
- SIRADAKİ: kullanıcı O-019…O-028 onayı + Windows kurulumu; onaydan sonra O'lar spesifikasyona işlenir.

## Durum — 2026-11-19 (Windows kurulumu yapıldı)
- 0.3.0 bilgisayara kuruldu: C:\Users\sand\AppData\Local\Programs\Mihenk\Mihenk.exe. Açılıyor; Tasarım, İmalat, Neway profili görünüyor (Neway'de eksik veri uyarısı beklenen).
- KURULUM HATASI bulundu: build/installer.nsi EnsureSubdir "\Mihenk" (7 karakter) yerine son 10 karakteri karşılaştırıyordu → her kurulumda yola bir "\Mihenk" daha ekleniyordu. Ayrıca klasör sayfasında yol elle değiştirilince DirLeave ekleme yapmadı ve dosyalar Programs köküne açıldı (kendi kaldırıcısıyla temizlendi). Düzeltme: StrCpy $0 $INSTDIR 7 -7 (commit'li). DirLeave'in çalışmaması 0.3.1'de Windows'ta sınanmalı; 0.3.1 kurulum dosyası yeniden üretilmeli.
- Eski kurulumlar duruyor: Programs\Mihenk\Mihenk\ altında iç içe 3 kopya (11 Kasım, ~1,2 GB). Kullanıcı onayıyla silinecek.

## Durum — 2026-11-19 (K-024: ad temizliği)
- Kullanıcı: "Artık programın ismi Mihenk, eski atolyecad ilişkili şeyleri sil, dosya yollarını düzelt." (K-024, spesifikasyona işlendi.)
- Kod (b6cbba6): .acad desteği ve %APPDATA%\AtolyeCAD ayar taşıma kaldırıldı; köken app://mihenk/, anahtarlar mihenk.*, IndexedDB mihenk-recovery, ortam değişkenleri MIHENK_*. Testler: tüm adımlar geçti (app.test.py zincirde bir kez kararsız sayfa hatası verdi, tek başına iki kez 194/194 geçti). Not: köken değiştiği için tema/yoğunluk tercihi bir kez sıfırlanır.
- Bilgisayar: klasör Documents\Fusion-Klon-Spec\Mihenk (eski AtolyeCAD); AtolyeCAD-Kurulum-0.1.0.exe, AtolyeCAD-kaynak-*.zip, Roaming\AtolyeCAD içeriği ve iç içe 3 eski Mihenk kurulumu silindi; Belge.acad → Belge.mhnk. Boş Roaming\AtolyeCAD klasörü duruyor (erişim kökü olduğu için silinemedi).
- Bilgisayardaki kurulu 0.3.0 hâlâ eski adları kullanır; temizlik 0.3.1 kurulumuyla gelir.

## Durum — 2026-11-19 akşam (Fusion–Mihenk karşılaştırma testi başladı)
- Çerçeve: https://claude.ai/artifact/5BrBbZJKEPQU9izqKuNrNe (parçalar, sabitler, ölçütler, prompt). Parçalar: Documents\Fusion-Klon-Spec\Mihenk\test-fusion-karsilastirma\parcalar (P1 SK8 CC-BY; P2 FTC-08, P3 FTC-06, P4 FTC-10 NIST kamu malı).
- Fusion: tam özellikli DENEME lisansı, 23 Kasım 2026'da bitiyor. P1 açıldı, setup 1 kuruldu (kaydedilmedi).
- Yöntem kararı: GUI çok yavaş → Fusion API (Python) betiği + Mihenk CAM çekirdeğine doğrudan aynı parametreler; GUI yalnız kontrol. SIRADAKİ: Fusion betiğini yaz (setup/takım/işlem/sim/post), P1 ile dene, sonra P2–P4; 23 Kasım'dan önce.

## Durum — 2026-11-19 gece (P1 Fusion tarafı BİTTİ)
- Fusion betiği: test-fusion-karsilastirma\fusion-betik\MihenkKarsilastirma\ (Yardımcı Programlar → Betikler ve Eklentiler'e eklendi; aramaya "Mihenk" yaz, ▶). Veri güdümlü: PARTS sözlüğüne P2–P4 eklenecek, PART sabiti seçer. Plan: test-fusion-karsilastirma\P1-PLAN.md.
- P1 sonucu: 12/12 işlem; NC + P1_fusion_rapor.json + log sonuclar\P1\ (ilk deneme sonuclar\P1_deneme1\). S1+S2 sim 15:43, 8,63 m. Fusion sim: T29 Ø2 sapı yarıkta stoğa 17 kez çarpıyor (beklenen plan sorunu; Mihenk de yakalamalı). 3+1: S3 A0 (yanlış), S3b A90 + G43.4.
- Betik dersleri: yüze açılan eskiz kenarları otomatik izdüşürür (oluşturulan çizgiyi seç); kontur = siluet; dış boşaltma = stok+takım paylı dikdörtgen + parça adası (AllLoops/StartInside); yarık = açık çizgide contour2d compensationType 'off'; pah = taraf 'dis', chamferClearance 0.
- Bulutta "Mihenk-Test" projesi yok → tasarım kaydedilmedi.
- SIRADAKİ: P2–P4 için geometri analizi + PARTS girdisi + Fusion koşusu (deneme 23 Kasım'da biter) → sonra Mihenk tarafı (P1'den başla; aynı plan, test makine kopyası).
- Yeni oturum mesajı: "fusion-klon-spec: DEVAM.md'yi oku, Mihenk-repo-2026-11-19b.zip'ten geri yükle, karşılaştırma testinde P2'yi Fusion betiğiyle koş."

## Durum — 2026-11-19 gece (P2 Fusion tarafı BİTTİ)
- Plan: test-fusion-karsilastirma\P2-PLAN.md (geometri OpenCascade ile okundu). Betikte PART = "P2"; PARTS'a P2 girdisi, yeni seçici `halka_eskizi` (yüzün seçili iç halkaları, 0 ofsetli yapı düzleminde eskiz → otomatik izdüşüm yok), `delik_yuzleri` artık r listesi + merkez süzgeci alır, strateji adı 'a|b' alternatifli.
- Eklenen takımlar (Mihenk'e de aynı): T31 Ø12 uzun (taşma 55), T32 Ø12 R3 köşe radyuslu uzun, T33 Ø6,1 matkap; ortak listeden T20/T22/T24/T28.
- Sonuç (sonuclar\P2\, ilk deneme P2_deneme1\): 14/14 işlem, param hatası 0, betik 470 s. S1 iç taraf (G55, 2001): yüzey, 3D adaptive, yatay, 3D kontur, punta, G83 delme — tahmini 11 144 s, NC 200 224 satır. S2 üst (G57, 2002, önceki stok): yüzey, 3D adaptive, yatay, 3D kontur, 2D kontur ×3 (pencere+yuvarlak, kanal, kare+anahtar T28), bore 16 delik T28 — 8 432 s, NC 130 929 satır. Toplam ≈ 5 sa 26 dk (adaptive baskın: 13 488 s).
- Ders: Fusion API'de 3D Kontur stratejisi 'contour' DEĞİL 'contour_new'; 'adaptive' ve 'horizontal' kabul edildi.
- Kapsam dışı / Kısmen: +X duvarındaki "NIST" yazısı (X normalli, divizör ekseni → erişilemez); boşluk dikey köşe R3,05 (~0,24 mm artık); duvar dibi R1,52; kanal tabanı R0,76 (2D düz uç keser); S2 bağlaması flanş deliklerinden fikstüre cıvata varsayımı.
- GUI simülasyonu P2 için HENÜZ BAKILMADI (özellikle S1 derin boşlukta T31/T32 tutucu çarpışması ve S2'de serbest kalan pencere parçaları).
- SIRADAKİ: P2 sim kontrolü (Fusion GUI) → P3 ve P4 geometri analizi + PARTS + Fusion koşusu (deneme 23 Kasım'da biter) → Mihenk tarafı P1'den.
- Yeni oturum mesajı: "fusion-klon-spec: DEVAM.md'yi oku, Mihenk-repo-2026-11-19b.zip'ten geri yükle, P2 Fusion simülasyonuna bak, sonra P3'ü Fusion betiğiyle koş."

## Durum — 2026-11-19 akşam (P2 sim kontrol edildi, P3 Fusion tarafı BİTTİ)
- P2 sim (S1+S2): 14 işlem, 9 takım değişimi, 5:26:31, 584,9 m; zaman çizelgesinde çarpışma işareti YOK (S1 derin boşlukta T31/T32 tutucu temiz). Bulgu: S2'de T28 2D konturla kesilen iki anahtar deliğinin (ve muhtemelen Ø30,56'nın) içindeki parçacıklar serbest kalıyor; Fusion sim yerinde bırakıyor. Mihenk de yakalamalı (serbest parça uyarısı).
- P3 planı: test-fusion-karsilastirma\P3-PLAN.md (alt ajan, OpenCascade). 4 setup: S1 üst +Y G55/2003, S2 ön −Z A G57/2004, S3 arka +Z A G58/2005, S4 alt −Y G59/2006. 18 işlem. Yeni takımlar T34 Ø12 uzun (taşma 105), T35 Ø12 R3 (80), T36 Ø10,5 matkap, T37 Ø7,1 matkap (Mihenk'e de aynı).
- Betik: PART = "P3"; yeni: merkezler 3B nokta, siluet `sadece_dis`, setup `stok_ust_s`; GEN_TIMEOUT_S 900. P2 hali yedek: fusion-betik\MihenkKarsilastirma_P2-yedek.py.txt.
- Ders: önceki-setup stokunda "from stock top" = stok KUTUSU üstü (bbox+pay), kalan stok değil.
- P3 sonuç (sonuclar\P3; denemeler P3_deneme1/2): 18/18, ≈ 7 sa 51 dk (S1 adaptive 5,2 sa baskın). NC 699 610 / 59 788 / 1 659 / 71 satır. S2/S3'te yalnız A0 (P1-S3 gibi; açı postta yok) → Kısmen. GUI sim bakılmadı.
- Kapsam dışı/Kısmen (P3): NIST yazısı, arka Ø20,64 havşa, küre alt yarısı/boyun, iç köşe artıkları (P3-PLAN.md).
- SIRADAKİ: P4 geometri analizi + PARTS + Fusion koşusu (deneme 23 Kasım'da biter); isterse P3 sim kontrolü → Mihenk tarafı P1'den.
- Yeni oturum mesajı: "fusion-klon-spec: DEVAM.md'yi oku, Mihenk-repo-2026-11-19b.zip'ten geri yükle, P4'ü Fusion betiğiyle koş."

## Durum — 2026-11-19 gece (P4 Fusion tarafı BİTTİ)
- Plan: test-fusion-karsilastirma\P4-PLAN.md (alt ajan, OpenCascade). 4 setup: S1 üst +Y G55/2007, S2 −Z A G57/2008, S3 +Z A G58/2009, S4 alt −Y G59/2010 (cep/delikler önce, yüzey en son). 25 işlem. Yeni takımlar T38 Ø4 küre, T39 Ø2,5 matkap, T40 M3×0,5 kılavuz, T41 Ø3,5 matkap (Mihenk'e de aynı).
- Betik: PART = "P4"; yeni seçici `cokgen_yapi` (yapı düzleminde kapalı çokgen), `eksen_aralik` (±Z havşa ayrımı), find_axis_map'e kütle merkezi doğrulaması (P4 kutusu X/Z simetrik; Fusion KM okundu, eşleme birim). P3 hali yedek: fusion-betik\MihenkKarsilastirma_P3-yedek.py.txt.
- 1. koşu (sonuclar\P4_deneme1): 24/25; op 6 kaide kanalları (3 mm kanal, T29 Ø2) adaptive2d "Generated toolpath is empty". Düzeltme: pocket2d + rampType 'plunge', paso 0,5.
- P4 sonuç (sonuclar\P4): 25/25, param hatası 0, betik 359 s. İşleme ≈ 1 sa 23 dk (S1 2026 s / S2 155 s / S3 952 s / S4 1838 s). NC 56 761 / 392 / 10 398 / 22 244 satır. G84 kılavuz döngüsü S1'de çıktı (tap 'tapping' çalıştı). S2/S3'te yine yalnız A0 → Kısmen. GUI sim bakılmadı.
- Ders: 2D adaptive, takım çapına yakın genişlikteki kapalı kanalda yol üretmiyor → 2D cep + dalma.
- Kapsam dışı/Kısmen (P4): 2× X yönlü Ø5,5 delik (erişilemez; Ø3,5'ler kör kalır), R1 iç fileler, dalga yüzeyi tarak izi, cep R2 taban filesi, girinti köşesi çizimde R0,2 MAX (P4-PLAN.md).
- SIRADAKİ: Fusion tarafı 4 parçada bitti (lisans 23 Kasım). İsteğe bağlı: P3/P4 GUI sim kontrolü (lisans bitmeden) → karşılaştırma testi Sonuçlar'a P2 sim, P3 ve P4 satırları → Mihenk tarafı (P1'den; aynı plan, test makine kopyası).
- Yeni oturum mesajı: "fusion-klon-spec: DEVAM.md'yi oku, Mihenk-repo-2026-11-19b.zip'ten geri yükle, karşılaştırma testinde Mihenk tarafına P1'den başla."

## Durum — 2026-11-19 gece (P1 Mihenk tarafı BİTTİ; kod kopyası Mihenk-repo-2026-11-19c.zip)
- Betik test/compare/P1/run-p1.mjs (src/** değişmedi, commit 3a9a8e6; 2 s'de koşar). Rapor + NC: test-fusion-karsilastirma\sonuclar\P1\P1-MIHENK-RAPOR.md.
- STEP içe aktarma çalıştı (45 yüz, kutu plana birebir). Kapsama: Tam 4 (yüzey ×2, kontur, bore helis cep), Kısmen 4 (adaptive→cep, yarık açık zincir elle, punta/delme delikler elle), Yapılamadı 2 (pah ×2).
- NC: S2 temiz (58 satır); S1/S3 kapılar BLOCK → yalnız yapı kıyası için *_BLOKLU_* kopyalar. S3'te A90/A0 doğru (Fusion A0 yazmıştı).
- Bulgular: T-01 HATA (teyitli): ilk dalma clearance Z15'ten ilerlemeyle (common.js linkTo, ilk konumlanmada retract'a hızlı iniş atlanıyor; S1 NC 1708–1710). T-02 chain seçimi resolveGeom'da yok; T-03 pah yok; T-04 önceki setup stoku yok (S3 hayalet stok block'ları); T-05 STEP'te delik tanıma yok; T-06 Ø2 yarık body_short + holder_collision yakalandı (+ STEP'te yarık içinde Ø4 katı çubuk → sim.gouge ×19, kasıtlı mı bilinmiyor); T-07 aynı takımda gereksiz M5/M9/M3/M8; T-08 T30 taşma 35 < derinlik 36,8, Mihenk yakaladı, Fusion yakalamadı.
- Süre tahmini S1/S2/S3: Mihenk 747/22/7,5 s (hesaplandı, hızlı 24000 varsayımı) — Fusion 896/33/24 s.
- SIRADAKİ: P2 Mihenk tarafı (P2-PLAN.md; aynı yöntem, test/compare/P2). Düzeltmeler test bitince toplu.
- Yeni oturum mesajı: "fusion-klon-spec: DEVAM.md'yi oku, Mihenk-repo-2026-11-19c.zip'ten geri yükle, karşılaştırma testinde Mihenk tarafında P2'yi koş."

## Durum — 2026-11-19 gece (P2 Mihenk tarafı BİTTİ; kod kopyası Mihenk-repo-2026-11-19d.zip)
- Betik test/compare/P2/run-p2.mjs (src/** değişmedi, commit d8ea40c; ≈21 s). Rapor + NC: test-fusion-karsilastirma\sonuclar\P2\P2-MIHENK-RAPOR.md.
- STEP içe aktarma: 270 yüz, 503 592 mm³. Kapsama: Tam 5 / Kısmen 9 / Yapılamadı 0 (3D adaptive/yatay/3D kontur yok → 2,5D cep/kontur kademeleri); alt kalem Yapılamadı: S1 tavan R3,05, S2 üst kenar R3,05.
- NC: S1 BLOCK (sim.gouge o7: T33 Ø6,1 > model deliği Ø6,045), S2 BLOCK ×20 (o9 duvar dibi R1,52, o13 kanal tabanı R0,76) → ikisi de *_BLOKLU_*.
- Süre: Mihenk S1 11 214 / S2 4 824 s (4 sa 27 dk) — Fusion 11 144 / 8 432 s (5 sa 26 dk); S2 farkının nedeni bilinmiyor.
- P2'de de: T-01 (S1 NC 3813–3814), T-04, T-05, T-07, T-09. Yeni: T-13 3D yüzey izleme yok; T-14 HATA through delme modelBBox.min'e iner (drill.js:82, teyitli); T-15 serbest parça denetimi yok (Fusion'ın gördüğü anahtar/kare parçaları Mihenk görmüyor); T-16 olumlu: sim R1,52/R0,76 ve flute_exceeded yakaladı; T-17 gouge derinliği düşey fark (yanıltıcı, sim/index.js:86); T-18 NC yorumunda ²/Ø → ? (engine.js:19). Not: P1 raporunda T-01…T-12 var.
- SIRADAKİ: P3 Mihenk tarafı (P3-PLAN.md; aynı yöntem, test/compare/P3). Düzeltmeler test bitince toplu.
- Yeni oturum mesajı: "fusion-klon-spec: DEVAM.md'yi oku, Mihenk-repo-2026-11-19d.zip'ten geri yükle, karşılaştırma testinde Mihenk tarafında P3'ü koş."

## Durum — 2026-11-19 gece (P3 Mihenk tarafı BİTTİ; kod kopyası Mihenk-repo-2026-11-19e.zip)
- Betik test/compare/P3/run-p3.mjs (src/** değişmedi, commit 3572e18; ≈167 s). Rapor + NC: test-fusion-karsilastirma\sonuclar\P3\P3-MIHENK-RAPOR.md.
- Kapsama (18 işlem): Tam 6 (1, 5, 12, 13, 17, 18) / Kısmen 12 / Yapılamadı 0. Alt kalem yapılamayan: kuyu tabanı o11 (tool_too_big), küre alt yarısı + boyun, R3,175 fileler / V yarık köşeleri, NIST yazısı.
- Kapılar: S1 BLOCK ×9 (4× body_short = T-08, gates.js:84; 5× sim.flute_exceeded o3a, 0,3 radyal kabuk) → *_BLOKLU_*. S2, S3, S4 OK (uyarı: a_dir_unverified, rest_material).
- Süre Mihenk / Fusion (s): S1 30 934 / 24 658, S2 2 557 / 2 985, S3 527 / 424, S4 171 / 173 → 9 sa 30 dk / 7 sa 51 dk.
- A açısı: Mihenk S2 `G0 A270.`, S3 `G0 A90.` yazıyor (Fusion yalnız A0). Makine yönü / kısa yol teyitsiz.
- Tekrar edenler: T-01 (S1 NC 14531–14533), T-04, T-05, T-07 (S1'de 93 M5/M8, Fusion'da 8), T-08, T-09/T-13, T-14 (stok altı 0,911), T-15, T-16 (olumlu), T-18.
- Yeni: T-19 siluet seçici çok bölgeli yüzde çöküyor (select.js:75); T-20 tek Y kesiti çatılı oyuğu yarık gibi görüyor, takım çatıya dalıyor (E6 gouge ×8); T-21 A−90 → A270 (fanuc-base.js:156–157, düşük önem, teyitsiz). Artık: S1'de en çok 65 mm (kaburga–arka duvar iç köşesi).
- SIRADAKİ: P4 Mihenk tarafı (P4-PLAN.md; aynı yöntem, test/compare/P4). Düzeltmeler test bitince toplu.
- Yeni oturum mesajı: "fusion-klon-spec: DEVAM.md'yi oku, Mihenk-repo-2026-11-19e.zip'ten geri yükle, karşılaştırma testinde Mihenk tarafında P4'ü koş."

## Durum — 2026-11-19 gece (P4 Mihenk tarafı BİTTİ; kod kopyası Mihenk-repo-2026-11-19f.zip)
- Betik test/compare/P4/run-p4.mjs (src/** değişmedi, commit 16fd408; ≈80 s deneysiz, ≈126 s deneyli; sim çözünürlüğü 0,5). Rapor + NC: test-fusion-karsilastirma\sonuclar\P4\P4-MIHENK-RAPOR.md.
- Kapsama (25 işlem): Tam 4 (1, 5, 6, 25) / Kısmen 21 / Yapılamadı 0. X yönlü 2× Ø5,5 delik iki tarafta da yok (plan kapsam dışı). Kılavuz döngüsü G84 Mihenk'te var.
- Kapılar: S1 BLOCK ×17 → *_BLOKLU_*: 1× body_short (o7 T22 derinlik 27 > gövde 25, T-08), 4× sim.gouge o9 (Ø6,1 matkap > Ø6 delik), 6× sim.gouge o11 0,24 mm (140° matkap ucu vs modelde 118°), 6× sim.gouge o12 (kılavuz, T-22). S2/S3/S4 OK. Çözünürlük 0,25'te de aynı 17 blok.
- Süre Mihenk / Fusion (s): S1 2610 / 2026, S2 242 / 155, S3 464 / 952, S4 1670 / 1838 → ikisi de ≈1 sa 23 dk. NC satır: 8393 / 56 761, 762 / 392, 924 / 10 398, 853 / 22 244.
- A açısı: S2 `G0 A270.` (satır 21), S3 `G0 A90.` (satır 24), sonda A0. Plan S2 A+90 / S3 A−90 diyor; Mihenk işareti ters (src/cam/index.js:78-83, A.dir=[−1,0,0]); makinede hangisi doğru teyitsiz. Fusion yalnız A0.
- Tekrar: T-01 (S1 NC 8043 havada G1 ≈21,5 s), T-04, T-05, T-07, T-08, T-09/T-13, T-12 (olumlu), T-14, T-15, T-16, T-17, T-18, T-19, T-20, T-21. T22 gövde 25'te tutucu boşluğu tam 0 mm, Mihenk uyarı vermiyor.
- Yeni: T-22 sim kılavuzu majör çap Ø3 dolu silindir sayıyor (STEP deliği Ø2,459) → her kılavuz deliği gouge BLOCK (sim/tool.js:5, sim/index.js:159-165, :86); T-23 delme çevrimi her deliğe ayrı G98 G8x…G80 (drill.js:68, :103; S1 G81/G83/G84 4/14/6, Fusion 1/4/1); T-24 teyitsiz: camSection döngülerinde ≈6e-4 mm açıklık, eskiz toleransı 1e-6 birleştirmiyor → ada kaybı (kernel/cam.js:179, shared/profiles.js:9).
- Yöntem notu: S1 adaları "dolgu" yardımcı gövdesinden alındı → köprü alanlarında S1'de 4–7,5 mm artık (kasıtlı, raporda ölçüldü).
- Karşılaştırma testi Mihenk tarafı 4 parçada BİTTİ. SIRADAKİ: karşılaştırma testi artifact'ine P2 Mihenk, P2 sim, P3, P4 satırlarını işle + genel sonuç → T-01…T-24 toplu düzeltme planı (öncelik: T-01, T-14, T-22, T-04, T-15, A işareti teyidi).
- Yeni oturum mesajı: "fusion-klon-spec: DEVAM.md'yi oku, Mihenk-repo-2026-11-19f.zip'ten geri yükle, karşılaştırma testi artifact'ine P2–P4 satırlarını işle ve genel sonucu yaz."

## 2026-11-19 gece-2 — Karşılaştırma testi dokümanı tamamlandı
- Karşılaştırma testi artifact'ine P2–P4 satırları (Durum/Fusion/Mihenk/bulgular) ve "Genel sonuç" bölümü işlendi: 67 işlem → Tam 19 / Kısmen 46 / Yapılamadı 2; temiz NC 7/13 setup. 6 kök neden grubu: (1) sim kapısı yanlış/aşırı BLOCK T-22,T-17,T-06,T-24; (2) 3D strateji yok T-13,T-09,T-20; (3) setup'lar arası stok/delik T-04,T-05,T-14,T-15,T-23; (4) NC verimi/biçimi T-01,T-07,T-18; (5) A işareti T-21; (6) T-02,T-03,T-19. Kod değişmedi (21363ba). T-10/T-11 içeriği P1 raporunda.
- SIRADAKİ: T-01…T-24 toplu düzeltme planı; öncelik 1 ve 5 → 3 ve 4 → 2. Fusion denemesi 23 Kasım'da biter.

## 2026-11-19 gece-3 — T-01…T-24 toplu düzeltme planı yazıldı (O-029, onay bekliyor)
- Kod 21363ba'dan geri yüklendi; `npm run test:all` temel çizgi geçiyor. Kod değişmedi.
- Plan: `DUZELTME-PLANI-T01-T24.md` (bu klasör + proje dokümanı). Dalga 1 = grup 1 (T-22, T-17, T-08, T-06 teyit, T-24 önce test) + grup 5 (T-21; A işareti tezgâh teyidi olmadan değişmez). Dalga 2 = grup 3 (T-04, T-14, T-05, T-15, T-23) + grup 4 (T-01, T-07, T-18) + grup 6 önerisi (T-02, T-10, T-11, T-03, T-19). Dalga 3 = 3D (T-20, T-09, T-13).
- Kullanıcıdan bekleniyor: O-029 onayı; A+ yön teyidi (makine projesi); P1 STEP Ø4 çubuk kasıtlı mı; Fusion A0 betiği 23 Kasım öncesi düzeltilsin mi.
- Yeni oturum mesajı: "fusion-klon-spec: DEVAM.md'yi oku, Mihenk-repo-2026-11-19f.zip'ten geri yükle, düzeltme planı Dalga 1'i uygula."

## 2026-11-20 — P1 arayüz testi (çizim + CAM, Mihenk 0.3.0, Claude ekran kontrolüyle)
- Kullanıcı kararı (K-025, spesifikasyon dokümanına henüz işlenmedi): "ilk parçayı sen arayüzle çiz, ona göre diğer parçalara karar vereceğim. yine ilk parçanın devamında cam işlemini de arayüzde yap." + çizim testi Dalga 1'in önünde.
- Sonuçlar: test-fusion-karsilastirma\sonuclar\P1_cizim\ (P1_SK8_mihenk_cizim.mhnk, P1-takimlar.json, P1-CIZIM-NOTLAR.md). Çizim: kutu STEP ile birebir, hacim 9016,05 (STEP 8958,26; fark = X yönlü vida bölgesi, çizilmedi). CAM: S1 5 işlemden 4'ü, S2 yüzey, S3 punta+delme hesaplandı; NC üretilmedi (11 engel: T-04 hayalet stok, T-08, boş post alanları dwell/g541Range).
- Yeni bulgular C-01…C-12, M-01…M-03 (notlarda). Düzeltme planına eklenmeli.
- SIRADAKİ: kullanıcı P2–P4 çizim testine ve post alanlarının teyidine karar verecek; sonra Dalga 1.
