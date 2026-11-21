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

## Gündem (yönetim oturumunun açık konuları)
| # | Konu | Önerim | Durum |
|---|---|---|---|
| G-1 | CAD testi T02–T10 (İE-001) | Sürsün; T04 sonrası ara rapor yönetimde değerlendirilsin | Açık |
| G-2 | CAD düzeltmeleri (WP-CAD1) ne zaman? C-14 (Extrude görünen/uygulanan mesafe farkı) ve C-21 (budamada daire kayması) testin sonucunu da bozabilir | C-14 ve C-21 hemen ayrı iş emri (İE-002), kalanlar test bitince | Karar bekliyor |
| G-3 | 1.0 yapım sırası (BACKLOG "1.0 ve sonrası") | CAD testi ve WP-CAD1 bitince planlansın | Karar bekliyor |
| G-4 | 0.5–0.6 işlemlerinin Fusion karşılaştırması (K-046); Fusion deneme lisansı 23 Kasım 2026'da bitiyor | Lisans bitmeden yapılmayacaksa ileride başka programla; yapılacaksa İE-003 | Karar bekliyor |
| G-5 | Ana dal testleri belge değişikliklerinde iptal ediliyordu | CI'da `pm/**`, `*.md`, `docs/**` yolları test başlatmaz (bu oturumda yapıldı); ilk yeşil sonuç kontrol edilecek | İzleniyor |
| G-6 | Bazı iş oturumları GitHub'a gönderemedi (O-047), iş yedek depoda kaldı | İş oturumu kapanışta GitHub'a gönderimi doğrular; gönderemezse `DURUM`'un ilk satırına yazar; yönetim oturumu eşitler | İzleniyor |
| G-7 | Skill güncellemeleri (izinlerin toplu istenmesi, yeni klasör yolu, yönetim/iş ayrımı) kullanıcı tarafından kaydedilmeli | Kartlar kaydedilsin | Kullanıcıda |
