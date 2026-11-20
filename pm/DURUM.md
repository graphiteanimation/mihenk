# Mihenk — durum (2026-11-20, üçüncü oturum, sürüyor)

Sürüm: kurulu 0.3.0 · `master` = WP-00, 01, 20, 03, 04, 05, 11 + WP-02 dilim 1–3 (resmi kurulum yok; Actions her birleşmede deneme kurulumu üretir).
Depo: GitHub `graphiteanimation/mihenk` (özel, ana). Yedek `mihenk.git` bu oturumda eşitlenmedi (oturuma bilgisayar klasörü bağlı değil).
Düzen: `pm/CALISMA-DUZENI.md` · işler: `pm/BACKLOG.md` · kararlar: `pm/KARARLAR.md` · WP notları: `pm/wp/`.

## Biten (bu oturum; her biri bağımsız doğrulandı)
- WP-04 Arayüz hataları: C-01, 02, 04, 05, 08…12, M-02, U-10, pah ölçü kısıtı + devirler; görünüm küpü tüm yüz/kenar/köşe, sol tuşla döndürme seçeneği (varsayılan kapalı). C-03, C-06, C-07(p) iki ayrı ajanla üretilemedi; koruyucu test eklendi. Arayüz testleri kendi boş portunda; `app.test.py` kararlı.
- WP-05 Setup'lar arası stok + delikler: setup stok zinciri (O-039), delik dibi = modelden son çıkış, delme çevrimi gruplama (P4 S1 G81/G83/G84 4/14/6 → 2/5/1; Fusion 1/4/1), B-rep delik tanıma (P3 8/8, P4 32/32), serbest parça uyarısı, stok altı payı (O-040). Doğrulama iki turda 4 güvenlik kusuru buldu, hepsi düzeltildi.
- WP-11 Takım yolu kütüphaneleri raporu (`pm/tasarim/TAKIMYOLU-KUTUPHANELERI.md`, O-038).
- Birleşik `master`da Linux `npm run test:all` tek seferde 20/20 adım, 4449 denetim, 0 kalan. P3 BLOCK 5/0/0/0, P4 11/0/0/0.

## Sürüyor (KILIT)
- WP-02 dilim 4–5 (`wp-02b`), WP-06 (`wp-06`), WP-09 (`wp-09`) paralel; sözleşmeler `pm/wp/`.

## Açık
- P1/P2 STEP girdisi yok: P1 S3 hayalet BLOCK ve "27 delik" ölçütü gerçek parçada ölçülemedi (sentetik testle kapandı).
- NSIS DirLeave düzeltmesi ve sabitlenen `choco nsis` sürümü yalnız Windows koşusunda görülür (Actions sonucu okunacak).
- `test:all` izlenen `test/models/results.json`'ı değiştiriyor; part-h 3,4 GB bellek → WP-10.
- LGPL/WASM dağıtım biçimi (OpenCAMLib) sürümden önce teyit edilecek.

## Sıradaki
1. WP-02b, WP-06, WP-09 doğrulama + birleşme → WP-07 ‖ WP-08 ‖ WP-10 → sürüm 0.4.

## Kullanıcıdan beklenen
- Sürüm kurulumu ve ekran denemesi için bu oturuma bilgisayar klasörü bağlı değil: Claude masaüstü uygulamasında bu sohbete `Documents\Fusion-Klon-Spec` klasörünü ekle (0.4 çıkınca gerekecek).
- İsteğe bağlı: P1/P2 STEP dosyaları ve kendi parçaların `Mihenk\altin-parcalar\`; açık varsayımlar `pm/SORULAR.md`.

## Notlar
- Fusion deneme lisansı 23 Kasım 2026'da bitiyor.
- Yeni oturum mesajı: `Mihenk: devam` (K-039: paket bitince aynı turda sıradaki; tur biterse 1 dk sonra uyanır).
