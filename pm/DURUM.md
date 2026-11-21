# Mihenk — durum (2026-11-21 UTC, beşinci oturum sonu) — TAMAMLANDI (0.6.0 yayımlandı)

Sürüm: `v0.6.0` (master), bilgisayarda kurulu (son kurulum SHA-256 `427caa1d…3a85`, `Mihenk\surumler\0.6.0\`). Önceki adaylar `Mihenk\arsiv\0.6.0-aday1`, `-aday2`.
Depo: GitHub `master` yedek depoyla eşitlendi (2026-11-21, 210e3e4 ve sonrası). Etiketler (v0.4.0, v0.5.0, v0.6.0) ve GitHub sürüm sayfası yalnız yedekte: bu ortamın vekili etiket, dal silme ve sürüm yazımını engelliyor. Yedek `Documents\Fusion-Klon-Spec\Mihenk\mihenk.git`.
Düzen: `pm/CALISMA-DUZENI.md` · işler: `pm/BACKLOG.md` · kararlar: `pm/KARARLAR.md` (K-045, O-051) · kabul: `pm/KABUL-WINDOWS.md`.
K-035 hedefi (0.6 dahil bitene kadar) tamamlandı: kendi kendini uyandırma kurulmaz. Yeni hedef kullanıcıdan gelir (`Mihenk: devam`).

## Bu oturumda biten
- K-045: K-044 durdurması kalktı.
- `fix-lnk` (O-051): Türkçe kaldırma kısayolu "/" yüzünden oluşmuyordu; artık "Mihenk Kaldır" / "Uninstall Mihenk", eski kısayollar temizlenir. Bağımsız doğrulandı (Sonnet, ONAY) ve ekranda görüldü.
- Windows kabulü (ekran kontrolüyle): 0, 1, 2, 3, 3a, 10, 11, 12, 13, 15 geçti; ayrıntı `pm/KABUL-WINDOWS.md`.

## Test durumu
- `npm run test:all` (master 1191dd1): 42/42 adım, 6991 denetim geçti, 0 kaldı (altın set P1–P4 dahil). fix-lnk yalnız `build/installer.nsi` ve belgeleri değiştirir.
- Bu çalışma alanında ilk koşuda Electron ikilisi indirilememişti (ortam); yeniden kurulunca geçti.

## Açık (1.0 öncesi değerlendirilecek)
- Tezgâhta doğrulanmayanlar: tüm NC (3+2 G68.2, sarma G93, G76/G87 dahil).
- Uyarlanır kabada temas açısı tepe aşımı (WP-22c 2d); tri-dexel isteğe bağlı (O-050).
- Kabul listesi tam: 14. adım da 2026-11-21'de geçti.
- Bilgisayarda `%APPDATA%\AtolyeCAD` klasörü duruyor (eski adın kalıntısı; boş, alt klasör yok; kullanıcı Dosya Gezgini'nden silebilir).
- Sıradaki sürüm (1.0) için BACKLOG'da sıra onayı kullanıcıdan beklenir.

## Notlar
- Fusion deneme lisansı 23 Kasım 2026'da bitiyor.
- GitHub'da kullanıcı eli gerektiren: etiketler + `Mihenk 0.6.0` sürüm sayfası (kurulum dosyası `Mihenk\surumler\0.6.0\`), birleşmiş eski dalların silinmesi (entegre*, wp-*).
