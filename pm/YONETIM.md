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
| G-1 | CAD testi T02–T10 (İE-001) | Sürsün; T04 sonrası ara rapor yönetimde değerlendirilsin | Açık |
| G-2 | CAD düzeltmeleri (WP-CAD1): İE-002 C-14, C-21 ve CI-1'i kapattı (C-14 gerçek akışta yeniden üretilemedi, soru SORULAR'da); kalanlar test bitince | C-21 yan bulguları (budamada üst üste binen varlıktan yanlışının seçilmesi, uzatmada orta nokta kayması) WP-CAD1'e | Açık |
| G-3 | 1.0 yapım sırası (BACKLOG "1.0 ve sonrası") | CAD testi ve WP-CAD1 bitince planlansın | Karar bekliyor |
| G-4 | Fusion karşılaştırması: K-051 ile İE-004 (P1–P4, CAD + CAM), İE-001'den sonra. P1–P4'ün Fusion çıktıları bilgisayarda hazır; lisans yalnız sarma ve 3+2 referansı için gerekli (23 Kasım 2026) | İE-001 22 Kasım akşamına dek bitmezse araya yalnız İE-004 Adım A alınsın (kısa) | İzleniyor |
| G-5 | Ana dal testi: belge gönderimleri artık koşuyu iptal etmiyor (O-052 çalışıyor). İlk tam koşu (`e685ffc`) KALDI: 40/41, yalnız `resim.test` pdftotext denetimi (Windows koşucusu) | İE-002'nin ilk maddesi (CI-1); yeşil görülene dek kod emri Bitti sayılmaz | Açık |
| G-6 | Bazı iş oturumları GitHub'a gönderemedi (O-047), iş yedek depoda kaldı | İş oturumu kapanışta GitHub'a gönderimi doğrular; gönderemezse `DURUM`'un ilk satırına yazar; yönetim oturumu eşitler | İzleniyor |
| G-7 | Skill güncellemeleri (izinlerin toplu istenmesi, yeni klasör yolu, yönetim/iş ayrımı) kullanıcı tarafından kaydedilmeli | Kartlar kaydedilsin | Kapandı (Y-02: kullanıcı onayladı) |
| G-8 | Test parçalarının otomatik regresyona alınması (İE-003 taslak) | T04 ara raporundan sonra Hazır yapılsın | Karar bekliyor |
| G-9 | 0.6.1 düzeltme sürümü (WP-CAD1 bulguları) ve kullanıcı deneme listesi | İE-002 bitince | Karar bekliyor |
| G-10 | GitHub'da geçici tanı dalı `tani-ie002` kaldı (oturum proxy'si dal silmeye izin vermedi) | Kullanıcı GitHub'da silsin (Branches → tani-ie002 → sil) | Açık |
