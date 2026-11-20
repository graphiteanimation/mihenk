# Mihenk — durum (2026-11-20, üçüncü oturum, sürüyor)

Sürüm: kurulu 0.3.0 · `master` = WP-00, 01, 02, 03, 04, 05, 06, 09, 11, 20 (resmi kurulum yok; Actions her birleşmede deneme kurulumu üretir).
Depo: GitHub `graphiteanimation/mihenk` (özel, ana). Yedek `mihenk.git` bu oturumda eşitlenmedi (oturuma bilgisayar klasörü bağlı değil).
Düzen: `pm/CALISMA-DUZENI.md` · işler: `pm/BACKLOG.md` · kararlar: `pm/KARARLAR.md` · WP notları: `pm/wp/`.

## Biten (bu oturum; her biri bağımsız doğrulandı)
- WP-04 Arayüz hataları: C-01, 02, 04, 05, 08…12, M-02, U-10, pah ölçü kısıtı + devirler; görünüm küpü tüm yüz/kenar/köşe, sol tuşla döndürme seçeneği (varsayılan kapalı). C-03, C-06, C-07(p) iki ayrı ajanla üretilemedi; koruyucu test eklendi. Arayüz testleri kendi boş portunda; `app.test.py` kararlı.
- WP-05 Setup'lar arası stok + delikler: setup stok zinciri (O-039), delik dibi = modelden son çıkış, delme çevrimi gruplama (P4 S1 G81/G83/G84 4/14/6 → 2/5/1; Fusion 1/4/1), B-rep delik tanıma (P3 8/8, P4 32/32), serbest parça uyarısı, stok altı payı (O-040). Doğrulama iki turda 4 güvenlik kusuru buldu, hepsi düzeltildi.
- WP-11 Takım yolu kütüphaneleri raporu (`pm/tasarim/TAKIMYOLU-KUTUPHANELERI.md`, O-038).
- WP-02 dilim 4–5 (sıra değiştirme, gruplar, klavye, onarım kipi, hesap iptali; O-041), WP-06 (ilk dalma, M kodu sadeleştirme: P3 S1 M5 93 → 8, pah işlemi, açık zincir, tanınan delik seçimi; P4 S1 çevrim 1/4/1 = Fusion; O-043), WP-09 (hizalama izi, koordinat girişi, komut tekrarı, referans ölçü, ilişkisel izdüşüm O-042, görüntü modları).
- Entegre dalda Linux `npm run test:all` 20/20 adım, 4908 denetim, 0 kalan (sonraki 5 dar düzeltme hedefli testlerle). P3 BLOCK 5/0/0/0, P4 11/0/0/0.

## Sürüyor (KILIT)
- WP-07 (`wp-07`), WP-08 (`wp-08`), WP-10 (`wp-10`) paralel; sözleşmeler `pm/wp/`.

## Açık
- P1/P2 STEP girdileri depoya alındı (`test/compare/P1/in`, `P2/in`); koşu betikleri eski, WP-10'da güncellenip ölçülecek.
- NSIS DirLeave düzeltmesi ve sabitlenen `choco nsis` sürümü yalnız Windows koşusunda görülür (Actions sonucu okunacak).
- `test:all` izlenen `test/models/results.json`'ı değiştiriyor; part-h 3,4 GB bellek → WP-10.
- LGPL/WASM dağıtım biçimi (OpenCAMLib) sürümden önce teyit edilecek.

## Sıradaki
1. WP-07, WP-08, WP-10 doğrulama + birleşme → sürüm 0.4 kapısı (Actions + yerel kurulum, `pm/KABUL-WINDOWS.md`) → 0.5 (WP-12 ‖ WP-13 ‖ WP-14).

## Kullanıcıdan beklenen
- Klasör erişimi verildi (`Documents\Fusion-Klon-Spec`). 0.4 kurulumu ve ekran denemesi için ekran kontrolü izni istenecek; bilgisayar açık ve Claude masaüstü uygulaması çalışır olmalı.
- İsteğe bağlı: kendi parçaların `Mihenk\altin-parcalar\`; açık varsayımlar `pm/SORULAR.md`.

## Notlar
- Fusion deneme lisansı 23 Kasım 2026'da bitiyor.
- Yeni oturum mesajı: `Mihenk: devam` (K-039: paket bitince aynı turda sıradaki; tur biterse 1 dk sonra uyanır).
