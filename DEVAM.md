# Devam notu — 2026-11-10 (oturum sınırı nedeniyle ara kayıt)

Bu dosya yeni oturumda kaldığı yerden devam etmek için yazıldı. Tek kaynak yine Claude Docs spesifikasyonudur
(https://claude.ai/artifact/4v27ETxjeH62wwuXNwf9dU); bu not uygulama (kod) durumunu taşır.

## Kullanıcı kararları (dokümana K olarak HENÜZ İŞLENMEDİ — ilk iş)
- K-016: Programın tamamı iki dilli: Türkçe + İngilizce.
- K-017: Makine bağımsız: ileride 3/4/5 eksen farklı CNC'ler eklenebilmeli.
- K-018: Sketch ana omurga; eksik komut olmamalı (budama/trim şikâyeti).
- K-019: Öncelik alüminyum/çelik parçaların CNC'de işlenmesi; PCB, bulut vb. gereksiz; programa güvenerek iş yapılabilmeli.
- K-020: O-017 (Electron yığını) ve O-018 (aşama sırası; güvenlik + CAM öne, teknik resim sona) ONAYLANDI.
- K-021: CAM post çıktısı üretsin; çıktılar test sayılır, makinede ilk doğrulama makine projesinde (K-004) kalır. ONAYLANDI.
- K-022: Süreç yönetimi Claude'da; adımlar arası kendisi geçer, ara ara kısa özet verir. Verimlilik: kararlar ana modelde, uygulama/test alt ajanlarda (K-015).
- K-023: Ad beğenilmedi: kurumsal ad + logo + kurumsal kimlik; UI/UX ve HMI profesyonel bakışıyla arayüz tasarımı.
- Kullanıcı 0.1.0'ı Windows'ta kurdu: sketch, extrude, kaydet, STL dışa aktarma hatasız çalıştı.
- O-016 (spesifikasyon projesini kapatma) hâlâ onay bekliyor.

## Biten işler (commit'li)
- v0.1.0 (41468d9): çekirdek, sketch ortamı, arayüz, Electron, kurulum.
- İki dil (309867e): 556 anahtar TR/EN, çekirdek hataları {code, params}.
- Güvenlik düzeltmeleri (8dc19db): IPC sertleştirme, sandbox, CSP, ağ kapalı, atomik kayıt + .bak + otomatik kurtarma,
  kaldırıcı, şema doğrulama, fuses. Raporlar: docs/SECURITY-AUDIT.md, docs/SECURITY-FIXES.md. `npm run test:all` 495 kontrol geçti.
- Çekirdek stres testi raporu: docs/KERNEL-TEST-REPORT.md (8 Kritik, 3 Yüksek; testler test/models/).

## Kesildiği anda SÜREN işler (yarım olabilir; `git status` ve dosyalara bakarak doğrula)
1. Çekirdek düzeltmeleri (Opus): kalıcı topolojik adlandırma (köken tabanlı yüz/kenar adları; ad tek eleman vermiyorsa ok:false),
   F-01…F-26, S-02/S-08/S-14 çekirdek tarafı, yeni segment türleri (ellipse/ellarc/spline), worker `reset`.
   Sahiplik: src/kernel/**, src/shared/errors.js, test/kernel.test.mjs, test/models/**. Çıktı: docs/KERNEL-FIXES.md.
2. Sketch'in tamamlanması (Sonnet): geom2d, F-04 (kesişen varlıkların bölünmesi), budama/uzatma/böl/ofset/köşe yuvarlat-pah/
   ayna/desen/taşı-kopyala-döndür-ölçekle/izdüşür, çokgen/kanal/elips/spline/3 nokta yay-daire/teğet yay, kutuyla seçim,
   nesne başına serbestlik, DXF içe/dışa. Çıktı: docs/SKETCH.md. Kullanıcı senaryosu: dikdörtgen + daire → budama → tek profil.
3. Marka + arayüz tasarım sistemi (Sonnet; koda dokunmaz): ad (öncelik: Mihenk > Punta > Pafta; web çakışma kontrolü),
   logo, simge, palet, tipografi, ikon seti, HMI ilkeleri, maketler. Çıktı: docs/BRAND.md, docs/UI-SPEC.md, brand/, design/.

## Sıradaki işler
4. (1) ve (2) bitince bütünleşik doğrulama: yeni segment türleriyle extrude, Ref biçimi değişikliğiyle arayüz, test:all.
5. Marka/tasarımın arayüze uygulanması + yeniden adlandırma (eski .acad açılmaya devam eder); ana model logo ve maketlere bakıp onaylar.
6. CAM (2.5 eksen + 3+1 indeks): makine profilleri (3/4/5 eksen eklenebilir), takım kütüphanesi (O-004/O-014 dokunulmaz liste),
   yüzey/kontur/cep/delme, post motoru + M80V postu, geri okuyucu + stok simülasyonu ile doğrulama; çıktı "DOĞRULANMADI" başlıklı.
   Güvenlik kapıları: dalma kontrolü, kurs sınırı, dokunulmaz numara, eksik veri → post durur.
7. Bağımsız son doğrulama, kullanım kılavuzu (TR/EN), kurulum dosyası + SHA-256, dokümana K/O/Aşama kayıtları, klasöre aktarım.

## Çalıştırma
`npm install` · `npm run dev` · `npm run test:all` · `npm run dist` (kurulum dosyası; DESIGN.md Electron bölümü).
Tasarım sözleşmesi: DESIGN.md (v0.2 eki bağlayıcı).
