# Mihenk — durum (2026-11-21) — 0.6.0 yayımlandı · CAD testi bitti (6 GEÇTİ, 4 KISMEN) · düzeltmeler sürüyor (0.6.1)

Sürüm: `v0.6.0` (master), bilgisayarda kurulu (son kurulum SHA-256 `427caa1d…3a85`, `Mihenk\surumler\0.6.0\`). Önceki adaylar `Mihenk\arsiv\0.6.0-aday1`, `-aday2`.
Depo: GitHub `graphiteanimation/mihenk` (ana): yalnız `master` dalı, `v0.6.0` etiketi ve `Mihenk 0.6.0` sürüm sayfası (kurulum + SHA-256). v0.4.0/v0.5.0 etiketleri yalnız yedekte. Yedek `Documents\Mihenk\Mihenk\mihenk.git`.
Düzen: `pm/CALISMA-DUZENI.md` · işler: `pm/BACKLOG.md` · kararlar: `pm/KARARLAR.md` (K-045, O-051) · kabul: `pm/KABUL-WINDOWS.md`.
Yönetim düzeni (K-049): karar ve iş emirleri `Mihenk: yönetim` oturumunda, iş `Mihenk: devam` oturumunda `pm/IS-EMRI.md` sırasıyla. Gündem: `pm/YONETIM.md`. Sıra (K-054): önce bütün CAD bulguları → 0.6.1, sonra Fusion kıyaslaması. Bitti: İE-003, İE-005, İE-006 · Sürüyor: İE-007 · Hazır (ekransız): İE-008 eskiz, İE-010 kabuk/görünüm, İE-013 envanter, İE-012 (İE-007'den sonra), İE-009 (İE-007'den sonra; İE-006 koşulu sağlandı) · Beklemede: İE-004A Fusion referansı (ekran; lisans 23 Kasım), İE-011 sürüm 0.6.1, İE-004 kıyaslama.

## İE-006 bitti (2026-11-21g) — 0.6.1'e girer (kurulu 0.6.0 değişmedi)
- C-50: kök neden kabuk değil eğimli (taper) extrude: yan yüzler adsız kalıyor, kabuğun iç yüzleri aynı adı alıyordu. Adlar artık `ModifiedShape` ile aktarılır (O-062, `src/kernel/topo.js`). T09 çekirdek testinde 0,5 pahla 34 412,563 mm³ (referansla fark %0, 43 yüz); kayıtlı `T09.mhnk` aynı açılır (34 449,437, 35 yüz).
- C-47: Fillet/Pah panelinde değer alanına yazmak, odaklanmak ve zincir kutusu artık kenar seçimini kapatmıyor (`src/ui/panels.js` `keepPick`); diğer paneller değişmedi.
- Testler: `test/ie006-naming.test.mjs` 5/32 → 73/0, `test/ie006-fillet-secim.test.py` 13/16 → 29/0; ikisi de `test:all` zincirinde. Bağımsız doğrulama ONAY ×2.
- Açık (Gündem G-16): koni kabuğun iç üst kenarında Pah `chamfer.too_big` (fillet geçer; adlandırmadan bağımsız). T09 İE-011'de arayüzden pahla yeniden çizilip `beklenen.json` güncellenir. GitHub'da `wp-ie006*` dalları duruyor.

## İE-003 sonucu (Bitti 2026-11-21f)
- `test/cad-bench.test.mjs`: arayüzden çizilen 12 belge (T01–T09, T10a/b/c) çekirdekte yeniden hesaplanır (hacim ±%0,1, kutu ±0,05 mm); 152 geçti / 0 kaldı. Bilinen eksik (`beklenen.json`): T03, T04, T05, T09; parça yeniden çizilince mhnk + beklenen.json birlikte güncellenir.

## İE-001 sonucu (Bitti 2026-11-21, iki iş oturumu)
- Puan T01–T10: **GEÇTİ 6** (T01, T02, T06, T07, T08, T10) · **KISMEN 4** (T03, T04, T05, T09) · KALDI 0. Yapılabilen geometri her parçada referansla birebir. Rapor: `pm/test/CAD-TEST.md` (Sonuç raporu), parça notları `pm/test/sonuc/Tnn.md`, kayıtlar `Documents\Mihenk\Mihenk\cad-test\Tnn\`.
- KISMEN nedenleri: C-31, C-33, C-39, C-42 (İE-005'te) ve yeni **C-50** (kabuk sonrası kenarların kalıcı ad çakışması; T09'da 0,5 pah yapılamadı) → İE-005'e eklenmesi önerildi (Gündem G-13). Yeni bulgular C-47…C-52 WP-CAD1'de.
- "Sol tuşla döndür" ayarı test sırasında açıldı, sonunda kapatıldı.

## İE-005 bitti (2026-11-21d) — çekirdek, 0.6.1'e girer (kurulu 0.6.0 değişmedi)
- C-31: dikişte bölünen iki yay artık ayrı kalıcı ad alır (`nk`, O-059); Fillet R4 geçer, eski belgeler açılır.
- C-33: geçersiz fillet'te silindir dikişi taşınıp yeniden denenir (O-060); T03 Fillet aracıyla 39 743,211 mm³, build123d farkı 0/0.
- C-39: boolean 1e-5 mm bulanık tolerans (O-061); 45° düzlemde şerit yüz kalkar, R3/R14/R16 geçer; T04 R16 Fillet'le 113 789,232 mm³.
- C-42: kayıtlı T04 belgesiyle Join/Combine zaten geçiyor; uygulamadaki hatanın nedeni bilinmiyor (o anki eskiz değerleri farklı olabilir).
- Kullanıcı denemesi 0.6.1 kurulunca: T03, T04, T05 fillet'lerle yeniden çizilip `beklenen.json` güncellenir. Açık: dikiş taşıma yalnız silindir. GitHub'da `ie005-entegre` dalı silinemedi (403), `wp-ie005*` dalları duruyor.
- İE-002 (b): CI-1, C-21 düzeltildi, C-14 savunmacı düzeltme; ayrıntı `pm/OTURUMLAR.md`.

## Test durumu
- `npm run test:all` `wp-ie006` CI 44920210934 (İE-006, master'a birleşti): 48/48 adım, 7420 denetim geçti, 0 kaldı (paket ve yayın işleri de yeşil).
- Bu çalışma alanında ilk koşuda Electron ikilisi indirilememişti (ortam); yeniden kurulunca geçti.

## Açık (1.0 öncesi değerlendirilecek)
- Tezgâh denemesi şimdilik yapılmaz (K-046); doğruluk ölçütü Fusion karşılaştırması. 0.5–0.6 işlemleri (3D, sarma, 3+2, adaptif) Fusion ile henüz karşılaştırılmadı. İE-004 bunu kapsar; P1–P4 Fusion çıktıları bilgisayarda hazır (`test-fusion-karsilastirma\sonuclar`), Fusion yalnız sarma ve 3+2 referansı için gerekir.
- Uyarlanır kabada temas açısı tepe aşımı (WP-22c 2d); tri-dexel isteğe bağlı (O-050).
- Kabul listesi tam: 14. adım da 2026-11-21'de geçti.
- `%APPDATA%\AtolyeCAD` kullanıcı tarafından silindi; proje klasörü artık `Documents\Mihenk` (K-047).
- Sıradaki sürüm (1.0) için BACKLOG'da sıra onayı kullanıcıdan beklenir.
- Yedek `mihenk.git` İE-006 kapanışında GitHub master ile eşitlendi (2026-11-21g).

## Notlar
- Fusion deneme lisansı 23 Kasım 2026'da bitiyor.
