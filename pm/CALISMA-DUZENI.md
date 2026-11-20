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
| Kod + geçmiş | GitHub `graphiteanimation/mihenk` (özel, ana depo). Bilgisayardaki `Documents\Fusion-Klon-Spec\Mihenk\mihenk.git` yedektir; sürüm çıkarken eşitlenir. |
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
2. Depoyu GitHub'dan klonla (`graphiteanimation/mihenk`), `npm ci`. Bilgisayar yalnız kurulum denemesi, ekran testi ve kullanıcı dosyaları için gerekir.
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

## 6. Kalite kapıları (resmi sürüm: 0.4, 0.5, 0.6, 1.0; arada otomatik deneme kurulumu, O-034)
1. `npm run test:all` baştan sona tek seferde geçer.
2. Altın parça seti (P1–P4 karşılaştırma + kullanıcının eklediği parçalar): BLOCK sayısı, temiz NC oranı, süre tablosu önceki sürümden kötü değil.
3. Windows'ta kurulum + aç + kaydet + NC kaydet kısa listesi (kullanıcının bilgisayarında, Claude ekran kontrolüyle).
4. Sürüm notu `OKUBENI.md`; kurulum dosyası + SHA-256 `Mihenk\surumler\` klasörüne.
Tezgâh başı doğrulama bir kalite kapısı değildir (K-026); bir tezgâh profili için post çıktısının "doğrulandı" sayılması o profilin sahibinin beyanıdır.

## 7. Yapılmayacaklar
- Tezgâha gidecek program üretmek; bir tezgâha özel değeri koda gömmek.
- Onaysız kapsam genişletmek; BACKLOG dışında iş yapmak (acil hata dışında; o da WP olarak kaydedilir).
- Doğrulanmamış sonucu doğrulanmış gibi yazmak.

## 8. Kesintisiz yürütme (K-035: 0.6 dahil bitene kadar durmadan)
Oturumlar saatte bir zamanlanmış görevle açılır (platformun en kısa aralığı); kullanıcı beklenmez. Görev kullanıcının bilgisayarına bağlıdır (K-037): bilgisayar açık ve Claude masaüstü uygulaması çalışır olmalıdır. Kod işleri bulutta yapılır; bilgisayar yalnız sürüm sonrası yerel kurulum ve ekran denemesi için kullanılır.
**Kendi kendini uyandırma (zamanlanmış görev GitHub'a erişemezse yedek yol).** Depoya erişimi olan etkileşimli bir Mihenk oturumu, her turunun sonunda `send_later` ile kendine 60 dakika sonrasına `Mihenk: devam` mesajı kurar (DURUM `TAMAMLANDI` değilse). Böylece erişimi olan oturum kullanıcı yazmadan sürer. Bağlam iki kez özetlendiyse zincir kurulmaz; kullanıcıya yeni sohbette `Mihenk: devam` yazması söylenir.
**Kilit (çakışma önleme).** `pm/KILIT.md` tek satır/iş: `WP-NN | dal | başlangıç (UTC) | alan`. Oturum başında:
1. `git pull`; KILIT'te 3 saatten yeni kayıt varsa o WP ve o **alan** meşguldür. Alanı ayrık başka "Hazır" WP varsa onu al; yoksa hiçbir şey yapmadan çık (tek satır rapor).
2. 3 saatten eski kayıt = yarım kalmış oturum: dalı (`wp-NN`) al, `pm/wp/WP-NN.md` notundan devam et.
3. WP'yi alınca KILIT'e yaz, hemen commit + push (push reddedilirse başka oturum almıştır: 1'e dön).
4. WP bitince ya da oturum kapanırken kaydı sil. Erken biten oturum, bağlamı elveriyorsa aynı kuralla bir WP daha alır (büyük WP'den sonra almaz).
**Yarım iş.** Her WP'nin `pm/wp/WP-NN.md` notu vardır: sözleşme, yapılan dilimler, kalan, son test sonucu. Her dilim sonunda dal push edilir; oturum her an kesilebilir varsayılır.
**Sorular.** Kullanıcıya ait bir karar gerekirse iş durmaz: en makul varsayımla ilerlenir, `pm/SORULAR.md`'ye "soru · alınan varsayım · geri dönüş maliyeti" yazılır. Kullanıcı yanıtlayınca K olur.
**Sürüm kapısı (0.4, 0.5, 0.6).** §6'daki 3. madde GitHub Actions Windows koşucusunda otomatik yapılır: kurulumu sessiz kur, uygulamayı aç, Electron testlerini kurulu sürüme karşı koş, NC/DXF kaydet. Geçerse etiketle (`v0.4.0`), GitHub Release'e kurulum + SHA-256 koy, sonraki sürümün WP'lerine geç. Ardından kullanıcının bilgisayarına kurulur ve `pm/KABUL-WINDOWS.md` listesi ekranda uygulanır; izin istemi yanıtsız kalırsa beklenmez, en erken 6 saat sonra yeniden denenir. Windows güvenlik uyarıları aşılmaz.
**Durma koşulları.** (a) 0.6 yayımlandı, yerelde kuruldu ve kabul listesi geçti: DURUM'un ilk satırına `TAMAMLANDI` yaz, zamanlanmış görevi kapat. (b) Aynı WP üç oturum üst üste ilerlemedi: WP'yi "Takıldı" işaretle, nedenini DURUM'a yaz, sıradakine geç. (c) `master` kırmızı (testler geçmiyor): yeni WP alınmaz, önce onarılır.

## 9. Model görev dağılımı ve token kuralları (K-036)
| Model | İş |
|---|---|
| **Fable (ana, orkestratör)** | Sıra ve kapsam kararı, tasarım, alt ajan sözleşmesi, fark (diff) incelemesi, birleştirme, K/O kaydı, sürüm kararı. Kod yazmaz; istisna: 20 satırı geçmeyen düzeltme. |
| **Opus** | Çekirdek (OCCT/B-rep), simülasyon, takım yolu algoritmaları, geometri, zor hata ayıklama. |
| **Sonnet** | Arayüz, işlem panelleri, post/NC biçimi, test yazımı, CI, yeniden düzenleme, bağımsız doğrulama. |
| **Haiku** | i18n anahtarları, kılavuz/OKUBENI, mekanik yeniden adlandırma, test çıktısı özetleme. |
Token kuralları:
1. Ana model büyük dosya okumaz: `grep -n` + satır aralığı; tam okuma alt ajanda.
2. Oturum başında yalnız DURUM, KILIT, BACKLOG'un ilgili satırı ve WP notu okunur.
3. Alt ajan sözleşmesi dosya yolu verir, içerik yapıştırmaz. Alt ajan raporu en çok 30 satır: commit'ler, test sayıları, sapmalar, açıklar.
4. Ana model test çıktısını değil son satırını görür (`| tail -3`); ayrıntı dosyaya yazılır.
5. Doğrulama: yazan ajandan farklı ve daha ucuz bir ajan testleri koşar ve farkı sözleşmeyle karşılaştırır; ana model yalnız `git diff --stat` ve riskli dosyaların farkına bakar.
6. Paralellik yalnız alanlar ayrıksa; bir oturumda en çok 3 alt ajan.
7. Bağlam bir kez özetlendiyse oturum WP'yi kapatıp çıkar; yeni oturum ucuzdur.
