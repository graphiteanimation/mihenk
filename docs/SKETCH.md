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

## Kısıtlar ve ölçüler

| Kısıt / ölçü | Uygulandığı öğeler | Not |
|---|---|---|
| Yatay, Dikey | çizgi ya da iki nokta | |
| Paralel, Dik, Eşit | çizgi-çizgi; eşit: çizgi/daire/yay/elips | |
| Çakışık (aynı doğru) | çizgi-çizgi | |
| Eş merkezli | daire/yay/elips çiftleri | |
| Teğet | çizgi-daire/yay, daire-daire, yay-yay | çizgi-elips ve spline teğeti çözücüde yok; uyarı verilir |
| Üzerinde (nokta) | nokta-çizgi/daire/yay/elips | uç noktada olan kısıt sessizce temizlenir |
| Sabit, Yapı geometrisi | nokta/öğe | |
| Mesafe, Yatay/Dikey mesafe | nokta-nokta, nokta-çizgi, çizgi-çizgi (paralel), daire-daire | |
| Açı | iki çizgi | |
| Yarıçap, Çap | daire/yay | |
| Referans ölçü | tüm ölçüler | sağ tık > Referans; parantezli gösterilir, çözümü etkilemez |

Ölçü etiketleri sürüklenebilir (konum kısıt içinde saklanır). Çelişen kısıtlar panelde listelenir, satıra tıklayınca öğe vurgulanır. Her öğenin serbestlik durumu ayrı gösterilir.

## DXF

Dosya > DXF içe aktar / DXF dışa aktar (2000) / DXF dışa aktar (R12). Okunan: LINE, POINT, CIRCLE, ARC, LWPOLYLINE, POLYLINE/VERTEX (bulge dahil), ELLIPSE, SPLINE (fit ya da NURBS). Birim kodu okunur, birim penceresiyle ölçek seçilir. R12 çıktısında elips/spline POLYLINE olarak örneklenir; 2000 çıktısında ELLIPSE ve SPLINE yazılır. Bağımsız okuyucu ile gidiş-dönüş testi: `test/dxf.test.mjs`.

## Kimlik ve profil kararlılığı

- Öğe, nokta ve kısıt kimlikleri sketch içindeki kalıcı sayaçtan (`seq`) verilir; silinen kimlik bir daha kullanılmaz. Budama/bölme/uzatmada başlangıca yakın parça özgün kimliği korur, diğerleri yeni kimlik alır.
- Extrude/Revolve profil seçimi `profiles: [{ents:[...], hint:[x,y]}]` olarak saklanır (sınır öğe kümesi + iç nokta ipucu). Çözümleme yalnızca küme tam olarak bir bölgeye uyuyorsa kabul edilir; aksi halde açık hata: `profile.lost` (kayıp) ya da `profile.ambiguous` (belirsiz). Eski sayısal dizinler dosya açılırken bir kez yükseltilir. Testler: `test/stability.test.mjs`.

## Yapılan / Kalan

Yapılan: geom2d altyapısı, findRegions (F-04), budama + K-018 senaryosu (node, tarayıcı ve uygulama düzeyinde; Extrude hacmi analitik), uzatma, böl, ofset, köşe, ayna, desenler, dönüşümler, yeni çizim araçları, kısıt/ölçü genişletmeleri, nesne başına serbestlik, sağ tık, sayısal giriş, çıkış uyarısı, DXF, kararlı kimlik ve profil seçimi, elips/elips yayı/spline Extrude testleri.

Bilinen sınırlar / yapılmayanlar:
- Elektron içinde DXF kaydı doğrulanmadı (ana süreçte `dxf` türü yok; tarayıcı indirmesi kullanılır).
- Pah (chamfer) ölçü kısıtı eklemez.
- Taşı/Döndür/Ölçekle ağırlıkla sayısal girişlidir (taşı/kopyala iki tıklamayı da destekler).
- Bağlı dairesel desen yardımcı yapı çizgileri kullanır (yaklaşık 120 nokta sınırı).
- Spline teğeti ve elips-daire teğeti yok.
- Gövde kenarı izdüşümü: eş düzlemli / tümü / seçili kenarlar; yüze tıklayarak seçim yok.
- Spline hacim testi bağımsız alan olarak findRegions alanını kullanır (çokgen örnekleme); elips ve elips yayı için kapalı formül kullanılır.
