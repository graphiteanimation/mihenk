# Sketch ortamı (AtolyeCAD)

Durum: ÇALIŞMA SÜRÜYOR. Bu belge ilerledikçe güncellenir; en alttaki "Yapılan / Kalan" listesi güncel durumu gösterir.

## Komutlar

Araç çubuğunda sık araçlar doğrudan görünür; diğerleri "Çiz ▾", "Düzenle ▾", "Kısıt ▾" açılır gruplarındadır.

| Komut | Kısayol | Etki |
|---|---|---|
| Seç | (varsayılan) | Tıkla/Shift ile çoklu; boşlukta sürükle: soldan sağa = tamamen içindekiler, sağdan sola = değenler. Ctrl+A tümünü seçer |
| Çizgi | L | Zincir; zincirde A = teğet yay, L = çizgi |
| Dikdörtgen / Merkez dikd. / 3 nokta dikd. | R / Shift+R / Çiz ▾ | Köşe-köşe; merkezden; döndürülmüş |
| Daire / 2 nokta / 3 nokta | C / Çiz ▾ / Shift+C | Merkez-yarıçap; çap uçları; üç nokta |
| Yay / 3 nokta yay / Teğet yay | A / Shift+A / Çiz ▾ | Merkez-başlangıç-bitiş; üç nokta; mevcut uca teğet |
| Çokgen | G | Kenar sayısı ve iç/dış teğet kipi sağ panelde |
| Kanal | U | İki uç merkezi + genişlik |
| Elips | Y | Merkez, ana eksen ucu, küçük yarıçap |
| Eğri (spline) | B | Noktalar; Enter/çift tık/sağ tık bitirir; ilk noktaya tık kapatır |
| Nokta | P | Delik merkezi vb. |
| Buda | T | Üstüne gelince silinecek parça kırmızı görünür; tıkla; basılı sürükleyerek çoklu buda. Kaldırılan kısıt sayısı durum satırında |
| Uzat | X | Ucu en yakın kesişime uzatır |
| Böl | K | Tıklanan yerden ikiye ayırır |
| Ofset | O | Zincir seçilir, mesafe (ifade olabilir) yazılır, taraf tıklanır; mümkünse kaynağa bağlı |
| Köşe yuvarlat / Pah | Q / W | Köşe noktası ya da iki nesne; yuvarlatma yarıçap ölçüsü ekler |
| Ayna | M | Nesneleri seç, İleri, simetri çizgisini tıkla; simetri kısıtları |
| Dikd. / Dairesel desen | Düzenle ▾ | Bağlı ya da bağımsız kopya |
| Taşı / Kopyala / Döndür / Ölçekle | Düzenle ▾ | Sayısal kutu; Taşı/Kopyala'da iki nokta da tıklanabilir |
| İzdüşüm | J | Gövde kenarlarını sabit yapı geometrisi olarak ekler |
| Kes / Kopyala / Yapıştır | Ctrl+X / C / V | Eskiz panosu |
| Sağ tık menüsü | sağ tık | Bitir, Sil, Yapı geometrisi, Kısıtları göster, Kopyala/Kes/Yapıştır, Tümünü seç; ölçü etiketinde referans/sürücü |

Çizerken sayı yazmaya başlarsanız uzunluk/açı (çizgi), en/boy (dikdörtgen), yarıçap (daire) kutusu açılır; Tab alan değiştirir, Enter onaylar ve ilgili ölçü kısıtını ekler.

## Yapılan / Kalan

Yapılan: geom2d altyapısı, findRegions (F-04), budama + K-018 senaryosu (testli), uzatma, böl, ofset, köşe, ayna, desenler, dönüşümler, yeni çizim araçları, kısıt/ölçü genişletmeleri, nesne başına serbestlik (iç yöntem: her noktayı sabitleyip serbestlik düşüşüne bakma), sağ tık, sayısal giriş, çıkış uyarısı.
Kalan / eksik: DXF içe/dışa aktarma, tüm komutlar için Playwright kapsamı, ekran görüntüleri.
