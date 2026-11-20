# Mihenk — durum (2026-11-20, ikinci oturum)

Sürüm: kurulu 0.3.0 · `master` = WP-00, 01, 20, 03 + WP-02 dilim 1–3 (resmi kurulum yok; Actions her birleşmede deneme kurulumu üretir).
Depo: GitHub `graphiteanimation/mihenk` (özel, ana). Yedek: `Documents\Fusion-Klon-Spec\Mihenk\mihenk.git` (bu oturumda eşitlenmedi).
Düzen: `pm/CALISMA-DUZENI.md` · işler: `pm/BACKLOG.md` · kararlar: `pm/KARARLAR.md` · WP notları: `pm/wp/`.

## Biten (bu oturum; her biri bağımsız doğrulandı)
- WP-20 Actions: Windows'ta `test:all` 19/19 + kurulu sürüm duman testi 23/0 (dal koşusu). Kurulum dosyası bu ortamdan indirilemedi (vekil artifact deposunu engelliyor). `release.yml` hiç koşmadı.
- WP-03 Sim/kapı: P4 S1 BLOCK 17 → 11, P3 S1 9 → 5; kalanlar gerçek. P1/P2 ölçülemedi (STEP girdisi yok). O-035, O-037.
- WP-02 dilim 1–3: sol Geçmiş paneli + şerit, düzenlemede geri sarma, "Son hali göster", "değişti" işareti (konuma duyarlı), özet bildirimi.
- Birleşik `master`da Linux `npm run test:all` tek seferde 19/19 adım, 4281 denetim, 0 kalan: i18n 27, security 69, kernel 111, solver 16, geom2d 128, profiles 1265, sketchops 94, dxf 40, stability 29, models 1309, cam 206, post 223, sim 104, sketcher 143, app 238, ui 32, cam-ui 182, electron 65.

## Açık
- `master`daki Actions koşularının sonucu bu oturumda okunmadı (WP-03 ve WP-02 birleşmeleri sonrası).
- security testi Linux'ta 69, Windows/doğrulayıcı koşusunda 70 sayıyor; fark incelenmedi.
- `app.test.py` "konsolda sayfa hatası yok" hâlâ kararsız (WP-02 doğrulamasında 3 koşuda 2 kalma; nedeni testin kendi CSP ihlali) → WP-04.
- Paralel ajanlarda arayüz testleri açık kalmış sunucuyu sınayabiliyor; üç ayrı port değişkeni var → WP-04'te teke indirilecek.

## Sıradaki
1. WP-04 Arayüz hata düzeltmeleri (+ WP-03/20/02 devirleri; BACKLOG satırı).
2. WP-05 Setup'lar arası stok ve delikler (WP-04 ile paralel, alan ayrık).
3. WP-02 dilim 4–5 (WP-04 ile aynı alan: ui kabuk; ardışık).

## Kullanıcıdan beklenen
- Yok. İsteğe bağlı: P1/P2 STEP dosyaları ve kendi parçaların `Mihenk\altin-parcalar\` klasörüne; açık varsayımlar `pm/SORULAR.md`.

## Notlar
- Tezgâh profilinde açıkça boş bırakılmış zorunlu post alanı artık NC'yi engeller (O-037).
- Fusion deneme lisansı 23 Kasım 2026'da bitiyor.
- Yeni oturum mesajı: `Mihenk: devam` (K-038: her tur sonunda 60 dk sonraya kurulur).
