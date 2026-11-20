# Mihenk — Windows kabul listesi (sürüm kapısı, CALISMA-DUZENI §6 madde 3 ve §8)

Kim: sürümü kuran (Claude ekran kontrolüyle ya da kullanıcı). Nerede: gerçek bir Windows bilgisayar, kurulum dosyası `Mihenk-Kurulum-<sürüm>.exe` (GitHub Release ya da `Mihenk\surumler\`). Her adımda **Beklenen** yazan sonuç görülmezse adım KALDI sayılır; ekran görüntüsü alınır, devam edilmez. Windows güvenlik uyarıları aşılmaz: SmartScreen ya da yönetici izni isterse dur, kullanıcıya bildir.
Düğme ve menü adları arayüz sözlüğündendir (Türkçe); birebir tutmuyorsa adımın amacı ve **Beklenen** sütunu esastır. Bu liste henüz bir Windows bilgisayarda ekranda uygulanmadı (uygulandığında Sonuç sütunu doldurulur).
Bu liste otomatik sürüm kapısının (Actions Windows koşucusu: sessiz kur, aç, kaydet, NC/DXF kaydet, kaldır) yerine geçmez, onu GUI üzerinde tamamlar. Tezgâh başı doğrulama bu listenin dışındadır (K-026).

| # | Adım (ekranda) | Beklenen | Sonuç (G/K) |
|---|---|---|---|
| 0 | Dosyanın SHA-256 değerini PowerShell'de `Get-FileHash .\Mihenk-Kurulum-<sürüm>.exe` ile al, `SHA256SUMS.txt` satırıyla karşılaştır. | Değerler harfi harfine aynı. Farklıysa dosyayı kullanma, dur. | |
| 1 | Kurulum dosyasına çift tıkla. Dil sorulursa Türkçe seç. | Kurulum sihirbazı açılır; yönetici izni **istemez**. Varsayılan klasör `%LOCALAPPDATA%\Programs\Mihenk`. | |
| 2 | Sihirbazı bitir, "Mihenk CAD/CAM'i çalıştır"ı işaretli bırak. | Kurulum tamamlanır; Başlat menüsünde "Mihenk CAD/CAM" ve "Mihenk CAD/CAM Kaldır" kısayolları görünür. | |
| 3 | Uygulama kendiliğinden açılır (ya da Başlat menüsünden başlat). | Karşılama ekranı gelir; pencere başlığı "Mihenk CAD/CAM"; arayüz Türkçe; üst menüde Dosya, Düzen, Görünüm, Yardım. | |
| 4 | Dosya > Aç… ile kurulum klasöründeki ya da depodaki `ornekler\01-Prizmatik-plaka.mhnk` dosyasını seç. | Belge açılır; 3B görünümde 80 × 50 × 20 mm plaka (cep + 4 delik) görünür; durum çubuğunda hata yok; başlıkta dosya adı. | |
| 5 | İmalat sekmesine geç; Tezgâhlar'dan `ornekler\tezgahlar\Ornek-Genel-3-eksen.mhnk-tezgah.json` dosyasını içe aktar, belgenin tezgâhı olarak seç. | Tezgâh listede "Örnek · Genel 3 eksen" olarak görünür; "Tezgâh profili bulunamadı" uyarısı kalkar. | |
| 6 | Tüm işlemleri hesapla (İşlemler listesinde Hepsini hesapla). | 4 işlem (yüzey, cep, delme, kontur) "hesaplandı" durumuna geçer; kırmızı hata yok. | |
| 7 | Post işle'ye bas. | NC kodu penceresi açılır; üstte başlık yorumları (`PROGRAM`, `MACHINE`, `SETUP 1 … WCS G55 STOCK … PART …`, `GENERATED`, takım satırları), satır sayısı > 100; "kapı: 0 BLOCK" (uyarı olabilir). | |
| 8 | NC penceresinde Kaydet (.nc) > bir klasör ve ad seç (ör. Masaüstü\deneme.nc). | "NC kaydedildi: deneme.nc" bildirimi; Not Defteri ile açınca ilk satırlar program numarası ve `(MIHENK ...)` yorumları, dosyada Türkçe karakter bozulması yok. | |
| 9 | Pencereyi kapat (NC penceresi), Dosya > Yeni. | Boş belge açılır (kaydedilmemiş değişiklik sorusu çıkarsa "Kaydetmeden kapat" seç). | |
| 10 | Sketch'e tıkla, bir düzlem seç, Dikdörtgen ile 60 × 40 çiz, Sketch'i Bitir; Extrude ile 20 mm kalınlık ver, tamam. | Kutu 3B görünümde belirir; hacim 48000 mm³ (ölçü/özellik panelinde ya da Düzen/Ölçü ile). | |
| 11 | Dosya > Kaydet; Belgelerim'de `deneme.mhnk` adıyla kaydet. | Başlık "deneme.mhnk" olur; durum "kaydedildi"; dosya Belgelerim'de var. | |
| 12 | Uygulamayı kapat (kapat düğmesi), yeniden başlat, Dosya > Aç… ile `deneme.mhnk`i aç. | Aynı kutu geri gelir (hacim 48000); değişiklik kaybı yok. | |
| 13 | Yardım menüsü > Hakkında. | Sürüm numarası kurulan sürümle aynı (`<sürüm>`). | |
| 14 | Hata günlüğü: yardım menüsünde "günlük klasörünü aç" öğesi varsa tıkla. | Dosya yöneticisi `%APPDATA%\Mihenk\logs` klasörünü açar; yeni kurulumda `mihenk-log.txt` olmayabilir (hata yoksa dosya yazılmaz) ya da yalnız kendi hatalarınız vardır; içinde kullanıcı adınız ya da tam dosya yolu **yok**. (Öğe yoksa bu adım atlanır, nedeni yazılır.) | |
| 15 | Başlat menüsü > "Mihenk CAD/CAM Kaldır" (ya da Ayarlar > Uygulamalar > Mihenk). Sessiz değil, sihirbazla. | Kaldırıcı açılır, biter; `%LOCALAPPDATA%\Programs\Mihenk` kalmaz; Başlat kısayolları kalkar; Belgelerim'deki `deneme.mhnk` ve `deneme.nc` **silinmez**. | |

## Sonuç
- Tarih, Windows sürümü, kurulan sürüm, SHA-256 (adım 0): 
- Geçen / kalan adım sayısı: 
- Kalan adımlar ve ekran görüntüsü yolları: 
- Karar: tümü G ise `Mihenk\surumler\` klasörüne kurulum + SHA-256 konur (CALISMA-DUZENI §6 madde 4); bir adım K ise sürüm yayımlanmaz, WP olarak kaydedilir.
