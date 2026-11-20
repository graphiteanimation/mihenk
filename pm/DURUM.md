# Mihenk — durum (2026-11-20, üçüncü oturum sonu) — DURDURULDU (K-040)

Sürüm: kurulu 0.3.0 · `master` = WP-00…WP-11 ve WP-20'nin tamamı (0.4'ün bütün yazılım paketleri; resmi kurulum yok, Actions her birleşmede deneme kurulumu üretir).
Depo: GitHub `graphiteanimation/mihenk` (özel, ana). Yedek `mihenk.git` bu oturumda eşitlenmedi.
Düzen: `pm/CALISMA-DUZENI.md` · işler: `pm/BACKLOG.md` · kararlar: `pm/KARARLAR.md` · WP notları: `pm/wp/`.
**Kullanıcı durdurdu (K-040): yeni paket, sürüm kapısı ve kendi kendini uyandırma yok. Kullanıcı `Mihenk: devam` yazınca sürer.**

## Biten (bu oturum; her biri bağımsız doğrulandı, bulgular düzeltildi)
- WP-04 arayüz hataları · WP-05 setup stok zinciri, delik tanıma, delme gruplama · WP-11 kütüphane raporu (O-038).
- WP-02 dilim 4–5 Geçmiş (O-041) · WP-06 NC verimi, pah, açık zincir (O-043) · WP-09 çizim konforu, ilişkisel izdüşüm (O-042).
- WP-07 2D CAM'in kalanı: dairesel ve diş frezeleme, kanal, iz sürme, helis rampa, ön delik, yüzden eksen, bir setup'ta çok A açısı, yuvarlak stok, kesme verisi + hesaplayıcı, keskin kenar pah, setup sheet (O-045).
- WP-08 modelleme: yüze kadar/konik extrude, pah türleri, teğet zincir, gövde/yüz bölme, yüz taşı/ofsetle/sil, diş tabloları, yüzden ayna, eskiz metni, ifade kuralı (O-044), CSP'de gereksiz kısıt tanısı, bayat hesap sonucu, Örnekler ve günlük menüleri.
- WP-10 güven altyapısı: test hijyeni (part-h 3,4 GB → 0,7 GB), altın parça seti P1–P4, örnek belgeler, hata günlüğü, NC başlığı model özeti, `pm/KABUL-WINDOWS.md`, sürüm iş akışı (O-046).

## Test durumu
- Son tam `npm run test:all` (entegre dal): 25/27 adım, 5704 geçti, 4 kaldı. O 4 denetim düzeltildi ve hedefli testlerle geçti (kernel 285, sketchops 154, i18n 52, app 408, ui 32). Düzeltme sonrası `master` (1d66718) GitHub Actions koşusu **yeşil** (2026-11-20 21:16 UTC, 30 dk).
- Altın set tabanı: P1 BLOCK 19/0/5, P2 2/20, P3 5/0/0/0, P4 11/0/0/0; tanınan delik 46/46. P1/P2 BLOCK'ları plan/model uyumsuzluğu olarak sınıflandı (P1 S3 `holder_collision` ×2 ayrılamadı).

## Açık
- `test:all` özeti "1 bilinen açık" gösterebilir (`iptal` testi; düzeltme WP-08 ile geldi, `IPTAL_KATI` varsayılanı güncellenmedi).
- Windows'ta doğrulanmayanlar: NSIS kurulumu, `release.yml`, kurulu sürümde `resources\ornekler`, hata kutusu görünümü.
- LGPL/WASM dağıtım biçimi (OpenCAMLib) 0.6'dan önce teyit edilecek.

## Sıradaki (kullanıcı devam deyince)
1. Hız önceliği geçerli (K-041, CALISMA-DUZENI §10): en çok 5 paralel alt ajan, tam test zinciri CI'da.
2. WP-21 (0.4 kapanış devirleri) → sürüm 0.4 kapısı: etiket, Actions, yerel kurulum + `pm/KABUL-WINDOWS.md` (ekran kontrolü izni gerekir).
3. 0.5: WP-12 ‖ WP-13 ‖ WP-14.

## Kullanıcıdan beklenen
- Devam için `Mihenk: devam`. İsteğe bağlı: kendi parçaların `Mihenk\altin-parcalar\`; açık varsayımlar `pm/SORULAR.md`.

## Notlar
- Fusion deneme lisansı 23 Kasım 2026'da bitiyor.
- Bilgisayar klasörü `Documents\Fusion-Klon-Spec` bu sohbete bağlı; P1/P2 STEP dosyaları depoya alındı.
