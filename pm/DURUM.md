# Mihenk — durum (2026-11-21) — 0.6.0 yayımlandı · CAD testi sürüyor (İE-001)

Sürüm: `v0.6.0` (master), bilgisayarda kurulu (son kurulum SHA-256 `427caa1d…3a85`, `Mihenk\surumler\0.6.0\`). Önceki adaylar `Mihenk\arsiv\0.6.0-aday1`, `-aday2`.
Depo: GitHub `graphiteanimation/mihenk` (ana): yalnız `master` dalı, `v0.6.0` etiketi ve `Mihenk 0.6.0` sürüm sayfası (kurulum + SHA-256). v0.4.0/v0.5.0 etiketleri yalnız yedekte. Yedek `Documents\Mihenk\Mihenk\mihenk.git`.
Düzen: `pm/CALISMA-DUZENI.md` · işler: `pm/BACKLOG.md` · kararlar: `pm/KARARLAR.md` (K-045, O-051) · kabul: `pm/KABUL-WINDOWS.md`.
Yönetim düzeni (K-049): karar ve iş emirleri `Mihenk: yönetim` oturumunda, iş `Mihenk: devam` oturumunda `pm/IS-EMRI.md` sırasıyla. Gündem: `pm/YONETIM.md`. Sıra (K-051): İE-001 CAD testi T02–T10 → İE-004 P1–P4 ile Fusion'a karşı CAD + CAM kıyaslaması. İE-002 (C-14, C-21 düzeltmesi) ekransız, paralel açılabilir.

## İE-001 ilerleme (iş oturumu 2026-11-21, sürüyor)
- T02 GEÇTİ · T03 KISMEN · T04 KISMEN; bulgular C-22…C-44, ara rapor `pm/test/CAD-TEST.md`. Sıradaki parça: **T05**. Kayıtlar `Documents\Mihenk\Mihenk\cad-test\Tnn\`.
- Bilgisayarda Mihenk ayarı "sol tuşla döndür" test için açıldı (C-34).

## Önceki oturumda biten
- K-045: K-044 durdurması kalktı.
- `fix-lnk` (O-051): Türkçe kaldırma kısayolu "/" yüzünden oluşmuyordu; artık "Mihenk Kaldır" / "Uninstall Mihenk", eski kısayollar temizlenir. Bağımsız doğrulandı (Sonnet, ONAY) ve ekranda görüldü.
- Windows kabulü (ekran kontrolüyle): 0, 1, 2, 3, 3a, 10, 11, 12, 13, 15 geçti; ayrıntı `pm/KABUL-WINDOWS.md`.

## Test durumu
- `npm run test:all` (master 1191dd1): 42/42 adım, 6991 denetim geçti, 0 kaldı (altın set P1–P4 dahil). fix-lnk yalnız `build/installer.nsi` ve belgeleri değiştirir.
- Bu çalışma alanında ilk koşuda Electron ikilisi indirilememişti (ortam); yeniden kurulunca geçti.

## Açık (1.0 öncesi değerlendirilecek)
- Tezgâh denemesi şimdilik yapılmaz (K-046); doğruluk ölçütü Fusion karşılaştırması. 0.5–0.6 işlemleri (3D, sarma, 3+2, adaptif) Fusion ile henüz karşılaştırılmadı. İE-004 bunu kapsar; P1–P4 Fusion çıktıları bilgisayarda hazır (`test-fusion-karsilastirma\sonuclar`), Fusion yalnız sarma ve 3+2 referansı için gerekir.
- Uyarlanır kabada temas açısı tepe aşımı (WP-22c 2d); tri-dexel isteğe bağlı (O-050).
- Kabul listesi tam: 14. adım da 2026-11-21'de geçti.
- `%APPDATA%\AtolyeCAD` kullanıcı tarafından silindi; proje klasörü artık `Documents\Mihenk` (K-047).
- Sıradaki sürüm (1.0) için BACKLOG'da sıra onayı kullanıcıdan beklenir.
- Y-02 (2026-11-21): ana dal CI'ı yeşil değil: `e685ffc` koşusu 40/41, yalnız `resim.test` pdftotext denetimi Windows koşucusunda kaldı (İE-002 CI-1). CAD testi: T01, T02 GEÇTİ. yedek `mihenk.git` GitHub'dan geride, Y-02 kapanışında eşitlenecek.

## Notlar
- Fusion deneme lisansı 23 Kasım 2026'da bitiyor.
