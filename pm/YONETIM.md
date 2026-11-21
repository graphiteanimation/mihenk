# Mihenk — yönetim düzeni (K-049)

İki tür oturum vardır. Biri yönetir, öteki iş yapar; ikisi depodaki belgeler üzerinden konuşur, sohbet geçmişine dayanmaz.

| | Yönetim oturumu | İş oturumu |
|---|---|---|
| Açılış mesajı | `Mihenk: yönetim` | `Mihenk: devam` |
| Ne yapar | Durumu okur, kullanıcıyla gidişatı konuşur, karar alır (K/O), öncelik verir, iş emri yazar, sonuçları değerlendirir, depo ve GitHub bakımını yapar | Sıradaki iş emrini alır, yürütür (alt ajanlar, ekran kontrolü), sonucu yazar, durur |
| Kod yazar mı | Hayır (yalnız `pm/` ve CI ayarı) | Evet |
| Ömrü | Uzun olabilir; bağlam bir kez özetlenince yenisi açılır | Tek iş emri; bitince kapanır |
| Yazdığı belgeler | `KARARLAR`, `BACKLOG`, `IS-EMRI`, `YONETIM` gündemi, `DURUM` | `DURUM`, `OTURUMLAR`, `wp/`, `test/sonuc/`, iş emrinin durum satırı |

## Belgeler (tek kaynak, `pm/`)
- `DURUM.md` — şu an ne durumda (≤ 40 satır, üzerine yazılır).
- `IS-EMRI.md` — iş oturumlarının sırası. Her emir: amaç, kapsam, kabul, yapıştırılacak açılış metni, durum.
- `OTURUMLAR.md` — her oturumun tek satırlık kaydı (tarih, tür, emir, sonuç). Yönetim oturumu ilerlemeyi buradan izler.
- `BACKLOG.md` — bütün işler ve sürüm sırası. `KARARLAR.md` — K/O günlüğü. `SORULAR.md` — açık varsayımlar.
- `CALISMA-DUZENI.md` — bağlayıcı çalışma kuralları (iş oturumu için ayrıntı).

## Yönetim oturumu akışı
1. Açılış: `DURUM`, `OTURUMLAR` (son 10 satır), `IS-EMRI`, aşağıdaki **Gündem** okunur; GitHub'da ana dalın son test sonucu ve açık dallar kontrol edilir; bilgisayardaki yedek depo GitHub'dan geride/ileride mi bakılır.
2. Kullanıcıya en çok 8 satırlık durum: ne bitti, ne sürüyor, ne takıldı, karar bekleyenler (her biri bir satır, önerimle).
3. Konuşma: kullanıcının kararları K olarak yazılır; Claude'un teknik kararları O olarak yazılır.
4. Çıktı: iş emri ekle/değiştir/sırala; gündemi güncelle; `DURUM`u yenile; commit + push; proje belgesi `claude/DURUM.md` eşitlenir.
5. Kapanış: kullanıcıya bir sonraki iş oturumunun açılış metni (iş emrindeki metin) verilir.

## İş oturumu akışı
1. İzinler toplu istenir (CALISMA-DUZENI §4 adım 0).
2. `IS-EMRI.md`'de durumu **Hazır** olan ilk emir alınır, durumu **Sürüyor** yapılır, push edilir (iki iş oturumu aynı emri almaz).
3. Emir yürütülür (CALISMA-DUZENI §3, §9, §10). Kapsam dışı bir şey çıkarsa yapılmaz; `BACKLOG`'a ya da gündeme not düşülür.
4. Bitiş: emir **Bitti** (ya da **Takıldı** + neden), `OTURUMLAR`'a tek satır, `DURUM` yenilenir, push. Sıradaki **Hazır** emir varsa ve kullanıcı "durmadan" dediyse aynı kuralla alınır; yoksa durulur ve kullanıcıya "yönetim oturumunda yeni iş emri gerekiyor" denir.
5. Kullanıcıya ait karar gerekirse iş durmaz: varsayım `SORULAR`'a, konu **Gündem**'e yazılır.

## Oturum adları (K-050)
- Yönetim oturumları sırayla numaralanır: **Y-01, Y-02, …** (bu düzenin kurulduğu oturum Y-01). İş oturumları aldıkları emrin adını taşır: **İE-001**; aynı emir ikinci bir oturuma taşarsa **İE-001/2**.
- Sohbet başlığı biçimi: `Mihenk Y-02 · yönetim · 2026-11-22` ve `Mihenk İE-001 · CAD testi T02–T10`. Claude sohbetin adını değiştiremez: her oturum ilk yanıtının ilk satırında önerilen başlığı verir, kullanıcı sohbeti öyle adlandırır.
- Açılış mesajları sade kalır (`Mihenk: yönetim`, `Mihenk: devam`); numarayı oturum `OTURUMLAR.md`'den kendisi bulur ve kaydına yazar.
- 2026-11-21 öncesinin sohbetleri: içerikleri depoya işlendi; dizin `pm/arsiv/SOHBETLER.md`. Silinmeleri veri kaybettirmez. Kullanıcı 2026-11-21'de bu 25 sohbeti eskiden yeniye `Arşiv 1: …` … `Arşiv 25: …` diye adlandırdı; kuruluş yönetim sohbetinin adı `Mihenk Y-01 yönetim kuruluş`.

## Çalışma ilkeleri (Y-01 gözden geçirmesi, O-053)
1. **Ana dal yeşil kalır.** Kod değişikliği içeren iş emri, GitHub'daki test sonucu yeşil görülmeden Bitti sayılmaz. Yönetim oturumu her açılışta son sonucu kontrol eder.
2. **Tek ekran, tek iş.** Ekran kontrolü kullanan iş emirleri aynı anda yürütülmez; kod emirleri (ekransız) bunlarla paralel açılabilir.
3. **Bulunan her hata teste dönüşür.** Düzeltme emri önce hatayı yeniden üreten otomatik testi yazar. Elle çizilip doğrulanan her test parçası (`cad-test/Tnn.mhnk`) depoya regresyon girdisi olarak alınır: CI modeli yeniden hesaplar, hacmi referansla karşılaştırır.
4. **Kullanıcı denemesi döngünün parçasıdır.** Her sürümde kullanıcıya 10 dakikalık deneme listesi verilir; kullanıcının bulguları yönetim oturumunda numaralanıp iş emrine girer. Otomatik testler ve Claude'un ekran denemesi bunun yerini tutmaz.
5. **Düzeltmeler küçük sürümlerle çıkar** (0.6.1, 0.6.2); kullanıcı düzeltmeyi kurulu programda görür, 1.0 beklenmez.
6. **Oturum ölçülür.** `OTURUMLAR.md` satırına süre ve varsa takılma nedeni yazılır; yönetim oturumu yavaşlayan yeri buradan görür.
7. **Oturum uzamaz.** Yönetim oturumu da bağlamı bir kez özetlenince kapanır, yenisi açılır (Y-01 bu kuralı aştı; yavaşlama ve maliyet oradan geldi).
8. **Yedek her yönetim oturumunda eşitlenir**; iş oturumu GitHub'a gönderemediyse fark burada kapanır.

## Gündem (yönetim oturumunun açık konuları)
| # | Konu | Önerim | Durum |
|---|---|---|---|
| G-1 | CAD testi T02–T10 (İE-001) | Bitti 2026-11-21; sonuç raporu `pm/test/CAD-TEST.md` | Kapandı |
| G-2 | İE-002 Bitti: CI-1 ve C-21 düzeltildi; C-14 yeniden üretilemedi, olası neden kapatıldı (soru `SORULAR`'da). C-21 yan bulguları WP-CAD1'de | 0.6.1 kullanıcı denemesinde C-14'e özellikle bakılsın | İzleniyor |
| G-3 | v1 (1.0) kapsamı ve sırası: K-056 ile çerçeve belli (v1 kalan bütün eksikler, v2 eşzamanlı 4/5 eksen, v3 montaj vb.). Kesin v1 listesi İE-013'ten; 1.0 kapısının ölçütü (Fusion kıyaslaması, gerçek parçalar, tezgâhta kesim) ayrıca | İE-013 bitince sıra onayı | Karar bekliyor |
| G-15 | Tornalama v1'e girsin mi? Büyük iş (ayrı işlem ailesi, post, simülasyon); freze önceliğiyle (K-019) çelişebilir | Tornalama gerçekten kullanılacaksa v1, değilse v2 | Karar bekliyor (kullanıcı) |
| G-16 | İE-006 bitti (C-50, C-47). Kapsam dışı bulgular: (1) koni kabuğun (dairesel profil + eğim + kabuk) iç üst kenarında Pah `chamfer.too_big` veriyor, fillet geçiyor; adlandırmadan bağımsız geometri sınırı, bulgu numarası verilmedi. (2) `test/ie006-naming.test.mjs` T09 hacmini sabitle karşılaştırıyor (`ref/t09-kutu.step` cad-bench'te ölçülüyor; sabit doğru). (3) Fillet/Pah düzenleme kipi ve "hangi kenar seçildi" denetimi arayüz testinde yok. (4) GitHub'da `wp-ie006`, `wp-ie006-kernel`, `wp-ie006-ui` dalları duruyor | (1) için bulgu numarası + emir gerekir mi; T09 İE-011'de arayüzden pahla yeniden çizilir | Açık |
| G-4 | Fusion: K-054 ile kıyaslama (İE-004) 0.6.1'den sonra. Lisansa bağlı referans toplama İE-004A ayrı, **Beklemede** (ekran kullanıcıda); lisans 23 Kasım 2026 | Kullanıcı "bilgisayar boş" deyince hemen Hazır; en geç 22 Kasım | Açık |
| G-5 | Ana dal testi | İlk yeşil koşu 2026-11-21 14:29 UTC (`9dc2867`, 43/43 adım; İE-002 CI-1: Windows'taki xpdf metni farklı satıra koyuyordu, ürün hatası değil) | Kapandı (Y-02) |
| G-6 | Bazı iş oturumları GitHub'a gönderemedi (O-047), iş yedek depoda kaldı | İş oturumu kapanışta GitHub'a gönderimi doğrular; gönderemezse `DURUM`'un ilk satırına yazar; yönetim oturumu eşitler | İzleniyor |
| G-7 | Skill güncellemeleri (izinlerin toplu istenmesi, yeni klasör yolu, yönetim/iş ayrımı) kullanıcı tarafından kaydedilmeli | Kartlar kaydedilsin | Kapandı (Y-02: kullanıcı onayladı) |
| G-8 | Test parçalarının otomatik regresyonu (İE-003) | Hazır yapıldı (O-056) | Kapandı (Y-02) |
| G-10 | Yüksek çekirdek hataları: C-31, C-33, C-39, C-42 → İE-005 (Sürüyor); C-50, C-47 → İE-006; C-37 açılı düzlem → İE-007 (K-052: 0.6.1'e girer) | — | Kapandı (Y-02) |
| G-11 | İE-001 ilk oturumu T06'dan sonra kapandı (bağlam, kural 7); emir Hazır, T07'den devam | Yeni sohbette `Mihenk: devam` | Kapandı (İE-001 Bitti, 2026-11-21) |
| G-13 | İE-001 bitti: GEÇTİ 6 · KISMEN 4 · KALDI 0. C-50 → İE-006 (İE-005'ten sonra), İE-003 Hazır, İE-004 sırada ilk (O-056) | — | Kapandı (Y-02) |
| G-14 | İE-003 bitti (otomatik regresyon, 152 denetim). Öneriler: `.gitattributes` (`*.mhnk`, `*.step` `-text`); eskiz "tam tanımlı" ölçütü için ayrı test; düzeltmelerden sonra T03, T04, T05, T09 yeniden çizimi | Yönetim oturumunda karar | Açık |
| G-9 | 0.6.1 (K-054, O-058): Bitti İE-002, 003, 005 · Sürüyor İE-006, 007 · Hazır İE-008, 010 (kimse almadı), 009, 012 (K-055 ek düzlem yöntemleri) → İE-011 sürüm + kullanıcı deneme listesi | İE-008 ve İE-010 açılsın | Açık |
| G-14 | C-42 (teğet temaslı Join) İE-005'te kayıtlı belgeyle yeniden üretilemedi; C-39 düzeltmesiyle T04 tek gövde | İE-011'de T04 arayüzden yeniden çizilirken doğrulanır | İzleniyor |
| G-12 | GitHub'da geçici tanı dalı `tani-ie002` kaldı (oturum proxy'si dal silmeye izin vermedi) | Kullanıcı GitHub'da silsin (Branches → tani-ie002 → sil) | Açık |
