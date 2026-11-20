# Mihenk — durum (2026-11-20)

Sürüm: kurulu 0.3.0 · depo `master` = WP-00 + WP-01 birleşik (0.3.1 hazırlığı; kurulum dosyası henüz üretilmedi).
Depo: `Documents\Fusion-Klon-Spec\Mihenk\mihenk.git` (bare). GitHub yansısı yok (O-031 bekliyor).
Düzen: `pm/CALISMA-DUZENI.md` · işler: `pm/BACKLOG.md` · kararlar: `pm/KARARLAR.md`.

## Bu oturumda biten
- WP-00 proje düzeni: zip + devam günlüğü düzeni bitti; dört ayrı eksik/bulgu listesi tek BACKLOG'da birleşti (19 iş paketi, 4 sürüm).
- WP-01 tezgâh bağımsızlığı (K-026, K-027): Neway yerleşikten çıktı; yerleşik 3 genel şablon; tezgâh profili dosyadan içe/dışa aktarma; Hakkında metni; tasarım kipindeki sabit makine çipi kaldırıldı.
  Testler: i18n 27, security 70, cam 191, post 170, sim 61, cam-ui 180, ui 28, electron 65 geçti; build geçti; P1 karşılaştırma betiği sonuçları değişmedi (25 BLOCK satırı, aynı).
  Açık: `app.test.py` "konsolda sayfa hatası yok" kontrolü 12 koşunun 4'ünde kaldı (master'da 5/5 geçti); neden kanıtlanmadı → WP-04. `npm run test:all` baştan sona tek seferde koşulmadı. P2–P4 betikleri yalnız sözdizimi denetiminden geçti.
- Kullanıcının tezgâh profili: `Mihenk\tezgahlar\Neway-VM1160H-M80V-GSA.mhnk-tezgah.json` (0.3.1'de Tezgâhlar → Dosyadan içe aktar).
- Geçmiş arayüzü tasarımı yazıldı: `pm/tasarim/GECMIS.md` (maket kullanıcıya gösterildi; görüşü bekleniyor).

## Sıradaki (paralel yürütülebilir)
1. WP-02 Geçmiş arayüzü (dilim 1–3).
2. WP-03 Sim/kapı doğruluğu (T-22, T-17, T-08, T-24, M-03, T-21b).
Ardından WP-04 ve 0.3.1 kurulumu.

## Kullanıcıdan beklenen
- O-030: BACKLOG'daki sürüm sırasına itiraz varsa söylemesi (yoksa uygulanır).
- Geçmiş maketine görüş (özellikle eskiz rozetinin işlem çipine kaynaşması ve sol panelde "Geçmiş" sekmesi).
- O-031: GitHub'da boş özel `mihenk` deposu açması (isteğe bağlı ama önerilir).
- Exe özelliklerinde görünen şirket adı ne olsun (şu an "D160 Makina")?

## Notlar
- Fusion deneme lisansı 23 Kasım 2026'da bitiyor; karşılaştırma için Fusion tarafında yeni koşu gerekirse önce o yapılmalı.
- Bilgisayarda `Mihenk\_to_delete\` ve `Mihenk\arsiv\` (eski zip'ler, ~330 MB; tümü git geçmişinde) kullanıcı isterse silinebilir.
