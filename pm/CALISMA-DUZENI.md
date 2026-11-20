# Mihenk — çalışma düzeni (ana prompt)

Bu dosya projenin nasıl yürütüldüğünü tanımlar. Her oturum bununla başlar. Değişiklik ancak KARARLAR.md'ye kayıtla yapılır.

## 1. Ürün tanımı
Mihenk; Fusion, NX CAM ve SolidCAM muadili, kendi başına bir masaüstü CAD/CAM programıdır (Electron + JS, OpenCascade çekirdek, TR/EN).
Ölçüt: kullanıcı bir parçayı kolay ve verimli biçimde çizebilmeli ya da STEP'ten alabilmeli, takım yolunu kurup güvenle NC alabilmeli.
- Makineden bağımsızdır (K-017, K-026). Hiçbir tezgâh markası üründe varsayılan değildir; tezgâh profili kullanıcı verisidir.
- Başka projelerin (CNC-Altyapı vb.) kararları Mihenk'in kapsamını, sırasını ya da kabul ölçütünü belirlemez (K-026).
- Bu sürüm hedefi 3 eksen + 3+1 (indeksli 4. eksen). Çok eksen kararı: KARARLAR.md K-029.
- Mihenk projesi tezgâha gidecek G-code üretmez; ürettiği NC test çıktısıdır. Bir tezgâhta ilk çalıştırma o tezgâhın sahibinin işidir.

## 2. Tek doğruluk kaynağı
| Ne | Nerede |
|---|---|
| Kod + geçmiş | git deposu: `Documents\Fusion-Klon-Spec\Mihenk\mihenk.git` (bare). GitHub yansısı kurulunca `origin` o olur. |
| Güncel durum (≤ 40 satır, üzerine yazılır) | `pm/DURUM.md` (kopyası claude.ai projesinde `claude/DURUM.md`) |
| Yapılacak her şey | `pm/BACKLOG.md` (iş paketleri, sürüm sırası, kaynak bulgu numaraları) |
| Kararlar ve öneriler | `pm/KARARLAR.md` (K-nnn kullanıcı, O-nnn Claude) |
| Tasarım sözleşmeleri | `DESIGN.md`, `docs/*-DESIGN.md`, `pm/tasarim/*` |
| Fusion özellik referansı | Claude Docs "Fusion Seviyesi CAD/CAM — Referans Spesifikasyonu" (yalnız başvuru; 0. bölümdeki K/O günlüğü donduruldu) |
Kural: bir bilgi tek yerde durur. Zip kopyası, tarihli devam günlüğü, sohbet içinde plan yoktur. Eski kayıtlar `pm/arsiv/` ve `pm/kaynak/` altında salt okunurdur.

## 3. İş birimi: iş paketi (WP)
- Her iş BACKLOG'da bir WP'dir: amaç, kapsam (kaynak numaraları), dokunacağı dosya alanı, kabul ölçütü, model.
- Bir oturum = bir WP (ya da dosya alanı çakışmayan en çok 3 WP, paralel alt ajanlarla). WP kendi dalında (`wp-NN`) yapılır, kabul geçince `master`'a birleşir.
- WP durumu: Hazır → Sürüyor → Doğrulamada → Bitti. "Bitti" = kabul testleri geçti + bağımsız doğrulayıcı (kodu yazmamış ajan) onayladı + birleşti.
- Alan sahipliği (paralel çalışmayı mümkün kılar): `src/kernel` · `src/ui/sketch*` · `src/ui` (kabuk) · `src/cam/ops+geom` · `src/cam/sim` · `src/cam/post+machines` · `src/ui/cam` · `electron+build`. Aynı alana aynı anda iki WP girmez.
- Program tek uygulama ve tek depo olarak kalır; bölünme modül ve dal düzeyindedir, ayrı programlar yoktur.

## 4. Oturum protokolü
Başlangıç (kullanıcı mesajı: `Mihenk: devam` ya da `Mihenk: WP-NN`):
1. `pm/DURUM.md` ve BACKLOG'un ilk "Hazır" WP'sini oku. Başka belge ancak WP gerektirirse okunur.
2. Depoyu klonla: bilgisayar bağlıysa `mihenk.git`'ten; GitHub yansısı varsa oradan. `npm ci`.
3. Kullanıcıya en çok 3 satır: bu oturumun WP'si, kabul ölçütü, kullanıcıdan gereken (varsa).
Yürütme:
4. Karar ve tasarım ana modelde; kod, test, tarama alt ajanlarda (kod: Sonnet; çekirdek/sim/geometri: Opus; kozmetik: Haiku). Her alt ajana yazılı sözleşme verilir.
5. Kullanıcıya soru yalnız kullanıcıya ait kararlarda sorulur (kapsam, davranış, görünüş tercihi). Teknik seçimler sorulmaz, KARARLAR'a O olarak yazılıp uygulanır; kullanıcı sonradan değiştirebilir.
Kapanış:
6. Testler koşulur, sonuç sayılarıyla yazılır; koşulamayan "koşulamadı" diye yazılır.
7. `pm/DURUM.md` üzerine yazılır, BACKLOG'da WP durumu güncellenir, commit + push. Proje belgesi `claude/DURUM.md` eşitlenir.
8. Kullanıcıya: ne bitti, neyi denemesi gerekiyor, sıradaki WP. Yeni oturum mesajı her zaman aynıdır: `Mihenk: devam`.

## 5. Onay modeli
- Kullanıcı yol haritasını (BACKLOG'daki sürüm sırası) onaylar; WP'ler ayrıca onay beklemez.
- Kullanıcının mesajındaki her "olsun / istemiyorum / şöyle olmalı" K-nnn olarak yazılır ve o oturumda uygulanmaya başlanır.
- Kullanıcıya görünen davranışı değiştiren öneriler (arayüz yerleşimi, varsayılanlar) önce maket ya da kısa açıklamayla gösterilir.

## 6. Kalite kapıları (sürüm çıkarmadan önce)
1. `npm run test:all` baştan sona tek seferde geçer.
2. Altın parça seti (P1–P4 karşılaştırma + kullanıcının eklediği parçalar): BLOCK sayısı, temiz NC oranı, süre tablosu önceki sürümden kötü değil.
3. Windows'ta kurulum + aç + kaydet + NC kaydet kısa listesi (kullanıcının bilgisayarında, Claude ekran kontrolüyle).
4. Sürüm notu `OKUBENI.md`; kurulum dosyası + SHA-256 `Mihenk\surumler\` klasörüne.
Tezgâh başı doğrulama bir kalite kapısı değildir (K-026); bir tezgâh profili için post çıktısının "doğrulandı" sayılması o profilin sahibinin beyanıdır.

## 7. Yapılmayacaklar
- Tezgâha gidecek program üretmek; bir tezgâha özel değeri koda gömmek.
- Onaysız kapsam genişletmek; BACKLOG dışında iş yapmak (acil hata dışında; o da WP olarak kaydedilir).
- Doğrulanmamış sonucu doğrulanmış gibi yazmak.
