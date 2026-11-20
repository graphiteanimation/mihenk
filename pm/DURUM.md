# Mihenk — durum (2026-11-20)

Sürüm: kurulu 0.3.0 · `master` = WP-00 + WP-01 + ad temizliği (kurulum dosyası henüz üretilmedi).
Depo: GitHub `graphiteanimation/mihenk` (özel, ana). Yedek: `Documents\Fusion-Klon-Spec\Mihenk\mihenk.git`.
Düzen: `pm/CALISMA-DUZENI.md` · işler: `pm/BACKLOG.md` · kararlar: `pm/KARARLAR.md`.

## Biten
- WP-00 proje düzeni; WP-01 tezgâh bağımsızlığı (K-026, K-027); exe özelliklerinde şirket adı "Mihenk", uygulama kimliği `app.mihenk.cadcam` (K-031).
- Son test sayıları (WP-01): i18n 27, security 70, cam 191, post 170, sim 61, cam-ui 180, ui 28, electron 65; P1 karşılaştırma sonucu değişmedi.
- Açık: `app.test.py` "konsolda sayfa hatası yok" kararsız (12 koşuda 4 kalma) → WP-04. `npm run test:all` baştan sona koşulmadı. K-031 değişikliğinden sonra kurulum üretilip denenmedi.
- Yol haritası onaylandı (K-033). Geçmiş arayüzü kararları verildi (O-033). 0.3.1 ayrı sürüm değil, 0.4'ün ilk bölümü (O-034).

## Sıradaki (paralel yürütülebilir, alanlar ayrık)
1. WP-02 Geçmiş arayüzü, dilim 1–3 (`pm/tasarim/GECMIS.md`).
2. WP-03 Sim/kapı doğruluğu.
3. WP-20 GitHub Actions: Windows'ta test + deneme kurulumu.
Ardından WP-04.

## Kullanıcıdan beklenen
- Yok. İlk deneme kurulumu çıkınca Windows'ta kurup denemesi istenecek.

## Notlar
- Kullanıcının tezgâh profili: `Mihenk\tezgahlar\Neway-VM1160H-M80V-GSA.mhnk-tezgah.json`.
- Fusion deneme lisansı 23 Kasım 2026'da bitiyor.
- Yeni oturum mesajı: `Mihenk: devam`
