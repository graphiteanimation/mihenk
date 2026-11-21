# Mihenk — durum (2026-11-21 UTC, dördüncü oturum sonu) — DURDURULDU (K-044)

Sürüm: bilgisayarda kurulu 0.6.0 (ilk aday, dikdörtgen hatalı) · `master` = 0.6'nın bütün iş paketleri + kabul düzeltmeleri. Etiketler `v0.4.0`, `v0.5.0` (yerel); `v0.6.0` düzeltilmiş kurulum kabulü geçince konacak.
Depo: bulut çalışma alanı (GitHub itme yetkisi reddedildi, O-047); yedek `Documents\Fusion-Klon-Spec\Mihenk\mihenk.git` güncel.
Düzen: `pm/CALISMA-DUZENI.md` · işler: `pm/BACKLOG.md` · kararlar: `pm/KARARLAR.md` (K-043, K-044, O-047…O-050) · kabul: `pm/KABUL-WINDOWS.md`.
**Kullanıcı durdurdu (K-044): yeni kurulum, kaldırma, yeni paket ve kendi kendini uyandırma yok. `Mihenk: devam` yazınca sürer.**

## Bu oturumda biten (hepsi bağımsız doğrulandı)
- 0.4 (WP-21) → `v0.4.0`; 0.5 (WP-12/13/14) → `v0.5.0`.
- 0.6: WP-15 3B işleme, WP-16 sarma, WP-17 teknik resim, WP-18 3+2, WP-19 sweep/loft/diş/IGES, WP-22a–d (PDF altlık, ayrıntılı sim, CAM verimi, G-code sim arayüzü), belgeler.
- 0.6.0 aday kurulumu bilgisayarda: kabul listesinde 12 adım geçti; dikdörtgen hatası bulundu ve düzeltildi (`fix-rect`), 5 küçük bulgu düzeltildi (`fix-06`).

## Test durumu
- `npm run test:all` (affd531 + entegrasyon düzeltmesi): 42/42 adım, 6974 denetim geçti, 0 kaldı.
- Düzeltmeler sonrası hedefli: sketcher 313, cam-ui 363, app 411, cam 602, post 282, i18n 52 — 0 kaldı. Tam zincir düzeltmeler sonrası yeniden koşulmadı.

## Sıradaki (kullanıcı devam deyince)
1. `test:all` → `npm run dist` → yeni kurulum + SHA-256 `Mihenk\surumler\0.6.0\`.
2. Kabul: adım 15 (eski kurulumu kaldır), yeniden kur, adım 10 (eskiz dikdörtgen + extrude), 12, 2. Geçerse `v0.6.0` ve DURUM ilk satırı `TAMAMLANDI`.

## Açık (0.6'yı engellemez)
- Tezgâhta doğrulanmayanlar: tüm NC (3+2 G68.2, sarma G93, G76/G87 dahil).
- Uyarlanır kabada temas açısı tepe aşımı (WP-22c 2d); tri-dexel isteğe bağlı (O-050).
- Kabul adımı 14 (günlük klasörü) — klasör erişimi otomatik reddedildi.

## Notlar
- Fusion deneme lisansı 23 Kasım 2026'da bitiyor.
