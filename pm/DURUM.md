# Mihenk — durum (2026-11-21 UTC, dördüncü oturum sürüyor) — KESİNTİSİZ (K-043)

Sürüm: kurulu 0.3.0 · `master` = 0.4 + 0.5 paketlerinin tamamı + WP-17, WP-19 (0.6'dan). Etiket `v0.4.0` (yerel). 0.5.0 adayı test ediliyor.
Depo: bulut çalışma alanı (GitHub itme yetkisi reddedildi, O-047); yedek `Documents\Fusion-Klon-Spec\Mihenk\mihenk.git` bundle ile eşitleniyor.
Düzen: `pm/CALISMA-DUZENI.md` · işler: `pm/BACKLOG.md` · kararlar: `pm/KARARLAR.md` (K-043, O-047, O-048) · WP notları: `pm/wp/`.

## Bu oturumda biten (her biri bağımsız doğrulandı, bulgular düzeltildi ya da WP-22'ye devredildi)
- WP-21 0.4 kapanış devirleri (8 madde) → `v0.4.0`: `test:all` 31/31 adım, 6237 denetim geçti.
- WP-12 2D uyarlanır kaba, rest, yatay, aşağıda kal, köşe/çıkış ilerleme düşürme, ince duvar.
- WP-13 bağlama gövdeleri, tutucu profili, tri-dexel sim, sim işçisi, G-code sim, G76/G87 sim.
- WP-14 işlem şablonları, delik sırası, G76/G87, mengenede çoklu parça, teklif, inç.
- WP-17 teknik resim (görünüş, kesit, ölçü/ISO 286, delik tablosu, antet, PDF/DXF, ilk parça formu).
- WP-19 sweep, loft, draft, rib, değişken fillet, helis/diş, IGES içe/dışa.

## Sürüyor
- WP-15 3D işleme · WP-16 4. eksen sarma · WP-18 çok eksen altyapısı (3+2, G68.2).
- Sonra: WP-22 (0.6 devirleri) → 0.6 kapısı: `test:all`, kurulum dosyası, bilgisayara kurulum + `pm/KABUL-WINDOWS.md`.

## Test durumu
- `v0.4.0`: `npm run test:all` 31/31 adım, 6237 geçti, 0 kaldı (bulut, Linux + Chrome + Electron/xvfb).
- Altın set tabanı değişmedi: toplam BLOCK 62, temiz NC 13/19.

## Açık
- GitHub'a itme yok (CI koşmuyor). Kullanıcı depoyu oturuma eklerse dallar itilir.
- Windows'ta doğrulanmayanlar: kurulu sürümde Örnekler, sim işçisi, hata kutusu (0.6 kabulünde).
- WP-22 listesi BACKLOG'da.

## Notlar
- Fusion deneme lisansı 23 Kasım 2026'da bitiyor.
