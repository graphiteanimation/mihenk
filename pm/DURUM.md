# Mihenk — durum (2026-11-21) — 0.6.0 yayımlandı · CAD testi bitti (6 GEÇTİ, 4 KISMEN) · düzeltmeler sürüyor (0.6.1)

Sürüm: `v0.6.0` (master), bilgisayarda kurulu (son kurulum SHA-256 `427caa1d…3a85`, `Mihenk\surumler\0.6.0\`). Önceki adaylar `Mihenk\arsiv\0.6.0-aday1`, `-aday2`.
Depo: GitHub `graphiteanimation/mihenk` (ana): yalnız `master` dalı, `v0.6.0` etiketi ve `Mihenk 0.6.0` sürüm sayfası (kurulum + SHA-256). v0.4.0/v0.5.0 etiketleri yalnız yedekte. Yedek `Documents\Mihenk\Mihenk\mihenk.git`.
Düzen: `pm/CALISMA-DUZENI.md` · işler: `pm/BACKLOG.md` · kararlar: `pm/KARARLAR.md` (K-045, O-051) · kabul: `pm/KABUL-WINDOWS.md`.
Yönetim düzeni (K-049): karar ve iş emirleri `Mihenk: yönetim` oturumunda, iş `Mihenk: devam` oturumunda `pm/IS-EMRI.md` sırasıyla. Gündem: `pm/YONETIM.md`. Sıra (K-054, Y-02 15:15 UTC): önce bütün CAD bulguları → 0.6.1, sonra Fusion kıyaslaması. Sürüyor: İE-003, İE-005, İE-007 · Hazır (ekransız): İE-008 eskiz, İE-010 kabuk/görünüm, İE-006 (İE-005'ten sonra), İE-009 (İE-006 + İE-007'den sonra) · Beklemede: İE-004A Fusion referansı (ekran; lisans 23 Kasım), İE-011 sürüm 0.6.1, İE-004 kıyaslama.

## İE-003 sonucu (Bitti 2026-11-21f)
- `test/cad-bench/mhnk/` altında arayüzden çizilen 12 belge (T01–T09, T10a/b/c); `test/cad-bench.test.mjs` her birini çekirdekte yeniden hesaplar: şema, geçmişte hata yok, hacim referansa ±%0,1, kutu ±0,05 mm, bugünkü hacim/gövde/yüz sayısı sabit; `ref/*.step` de çekirdekle ölçülüp tabloyla sağlanır. 152 geçti / 0 kaldı; `test:all` zincirinde (43 adım); master `ci` 44914597501 yeşil. Bağımsız doğrulama ONAY.
- Bilinen eksik (`test/cad-bench/beklenen.json`): T03 (yöntem), T04 (2 gövde), T05 (−%0,054), T09 (+%0,107). Parça düzeltmeden sonra yeniden çizilince mhnk + beklenen.json birlikte güncellenir; çekirdek düzeltmesi sayıları değiştirirse (ör. İE-005 C-39: T04 yüz 30 → 28) `bugun` değeri aynı commit'te güncellenir.
- Öneri (Gündem G-14): `.gitattributes` ile `*.mhnk`, `*.step` için `-text`; eskizlerin "tam tanımlı" ölçütü bu testte yok (belgelerdeki eskizler tam tanımlı değil).

## İE-001 sonucu (Bitti 2026-11-21, iki iş oturumu)
- Puan T01–T10: **GEÇTİ 6** (T01, T02, T06, T07, T08, T10) · **KISMEN 4** (T03, T04, T05, T09) · KALDI 0. Yapılabilen geometri her parçada referansla birebir. Rapor: `pm/test/CAD-TEST.md` (Sonuç raporu), parça notları `pm/test/sonuc/Tnn.md`, kayıtlar `Documents\Mihenk\Mihenk\cad-test\Tnn\`.
- KISMEN nedenleri: C-31, C-33, C-39, C-42 (İE-005'te) ve yeni **C-50** (kabuk sonrası kenarların kalıcı ad çakışması; T09'da 0,5 pah yapılamadı) → İE-005'e eklenmesi önerildi (Gündem G-13). Yeni bulgular C-47…C-52 WP-CAD1'de.
- "Sol tuşla döndür" ayarı test sırasında açıldı, sonunda kapatıldı.

## İE-002 bitti (2026-11-21b)
- Ana dal yeşil: master `ci` 44911498632 — 43/43 adım, 7088 denetim geçti, 0 kaldı (paket işi de geçti).
- CI-1: Windows koşucusundaki pdftotext Git for Windows'un xpdf 4.06'sı; metin doğru, yalnız "Ø20" ile "H7" ayrı satırda. Denetim boşluk/satır farkına dayanıklı; araç yoksa "atlandı" yazar.
- C-21 düzeltildi: kayma, budanan/bölünen çizgide kalan orta nokta (ve eşit uzunluk) kısıtından; artık orta nokta "çizgi üstünde"ye döner, budama sonrası kalan geometri 1e-5 mm'den fazla oynarsa işlem geri alınır. Yan bulgular WP-CAD1'e (G-2).
- C-14 gerçek akışta yeniden üretilemedi (7 akış); savunmacı düzeltme: onaydan önce paneldeki görünen sayısal değerler taslağa yazılır. Soru `SORULAR`'da. Düzeltmeler 0.6.1 ile kuruluma gelir (G-9); kurulu 0.6.0 değişmedi.
- GitHub'da geçici `tani-ie002` dalı silinemedi (G-12); `wp-ie002*` dalları da duruyor.

## Test durumu
- `npm run test:all` master CI 44911498632 (İE-002 sonrası): 43/43 adım, 7088 denetim geçti, 0 kaldı (altın set P1–P4 dahil).
- Bu çalışma alanında ilk koşuda Electron ikilisi indirilememişti (ortam); yeniden kurulunca geçti.

## Açık (1.0 öncesi değerlendirilecek)
- Tezgâh denemesi şimdilik yapılmaz (K-046); doğruluk ölçütü Fusion karşılaştırması. 0.5–0.6 işlemleri (3D, sarma, 3+2, adaptif) Fusion ile henüz karşılaştırılmadı. İE-004 bunu kapsar; P1–P4 Fusion çıktıları bilgisayarda hazır (`test-fusion-karsilastirma\sonuclar`), Fusion yalnız sarma ve 3+2 referansı için gerekir.
- Uyarlanır kabada temas açısı tepe aşımı (WP-22c 2d); tri-dexel isteğe bağlı (O-050).
- Kabul listesi tam: 14. adım da 2026-11-21'de geçti.
- `%APPDATA%\AtolyeCAD` kullanıcı tarafından silindi; proje klasörü artık `Documents\Mihenk` (K-047).
- Sıradaki sürüm (1.0) için BACKLOG'da sıra onayı kullanıcıdan beklenir.
- Yedek `mihenk.git` GitHub'dan geride, Y-02 kapanışında eşitlenecek.

## Notlar
- Fusion deneme lisansı 23 Kasım 2026'da bitiyor.
