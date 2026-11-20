# Mihenk CAD/CAM Kullanım Kılavuzu

Sürüm 0.3.0 · Türkçe · İngilizce karşılığı: `docs/MANUAL.md` (içerik aynıdır)

Bu kılavuz, CNC fason işleme yapan ve alüminyum/çelik parça işleyen atölyeler içindir. Mihenk makineden bağımsızdır: kendi tezgâhınızın profilini siz eklersiniz (5.2). CAD/CAM'e yeni olmadığınızı, ama yazılımcı olmadığınızı varsayar. Komut adları, programdaki adlarla birebir aynıdır.

> **ÖNCE BUNU OKUYUN**
>
> Mihenk'in ürettiği NC kodu **DOĞRULANMADI** başlığı taşır. Hiçbir NC dosyası, tezgâhta denenmeden güvenilir sayılmaz.
> Program bir yardımcıdır. Tezgâhtaki kontrol ve sorumluluk sizdedir.
> Tezgâhta ilk çalıştırma adımları bu programın işi değildir; makine projesinde yapılır.
> A ekseni yönü tezgâhta işaretli bir parçayla **teyit edilmeden** 4. eksenli (3+1) NC çalıştırılmamalıdır.
> Simülasyon her şeyi göremez. Neleri göremediği için **Bölüm 7**'yi okuyun.

## İçindekiler

1. Kurulum ve ilk çalıştırma
2. Arayüz turu
3. Sketch (2B çizim)
4. Katı modelleme
5. İmalat (CAM)
6. Baştan sona örnek: cep ve delikli blok
7. GÜVENLİK
8. Sorun giderme
9. Kısayollar

---

## 1. Kurulum ve ilk çalıştırma

### 1.1 Kurulum dosyasını doğrulayın (SHA-256)

Sürümle birlikte iki dosya verilir:

- `Mihenk-Kurulum-0.3.0.exe` (kurulum dosyası)
- `SHA256SUMS.txt` (dosyanın SHA-256 özeti; her satır: `özet  dosya adı`)

Kurmadan önce özeti karşılaştırın:

1. Dosyaların bulunduğu klasörde Windows PowerShell açın.
2. Şunu yazın: `Get-FileHash .\Mihenk-Kurulum-0.3.0.exe -Algorithm SHA256`
   (Olmazsa: `certutil -hashfile Mihenk-Kurulum-0.3.0.exe SHA256`)
3. Çıkan uzun harf-rakam dizisini `SHA256SUMS.txt` içindeki satırla karşılaştırın.
4. Harfi harfine aynı olmalı. **Bir karakter bile farklıysa kurmayın**; dosyayı yeniden alın.

### 1.2 Kurulum

1. `Mihenk-Kurulum-0.3.0.exe` dosyasını çalıştırın.
2. Yönetici izni istemez. Program `%LOCALAPPDATA%\Programs\Mihenk` klasörüne kurulur.
3. Masaüstüne ve Başlat menüsüne kısayol konur. Kaldırmak için Başlat menüsündeki kaldırıcıyı (`Kaldir.exe`) kullanın.
4. Dosya imzasız olduğu için Windows SmartScreen "Windows kişisel bilgisayarınızı korudu" diyebilir. **Ek bilgi** → **Yine de çalıştır**. Bunu yalnız 1.1'deki özet doğruysa yapın.
5. `.mhnk` dosyasına çift tıklayınca Mihenk açılır. Başka bir program o uzantıyı kullanıyorsa kurulum onu yedekler, kaldırmada geri verir.

Program ağ bağlantısı kurmaz. Çevrimdışı çalışır; dosyalarınız bu bilgisayarda kalır.

### 1.3 İlk çalıştırma

1. Açılışta **Karşılama ekranı** gelir: **Yeni belge**, **Belge aç**, **Son dosyalar** ve "Üç adımda ilk parça" (Eskiz, Çıkar, Kaydet).
2. Dil: İlk açılışta bilgisayarınızın dili Türkçeyse Türkçe, değilse İngilizce açılır.
3. **Ayarlar** (Ctrl+,) şunları verir. Değişiklikler hemen uygulanır:
   - **Dil**: Türkçe / English
   - **Tema**: Açık / Koyu / Sistem
   - **Yoğunluk**: Normal / Büyük (eldivenle ya da dokunmatik için geniş düğmeler)
   - **Karşılama ekranı**: Açılışta göster
4. Karşılama ekranının altında da hızlı dil/tema/yoğunluk seçicileri vardır.

### 1.4 Dosya türleri, kayıt, yedek

| Tür | Uzantı | Not |
|---|---|---|
| Mihenk belgesi | `.mhnk` | Kayıt her zaman bu türde yazılır. |
| STEP, STL | `.step` `.stp` `.stl` | Dosya menüsünden içe/dışa aktarılır. |
| Eskiz | `.dxf` | Yalnız Sketch içindeyken (Bölüm 3.7). |
| NC kodu | `.nc` | İmalat sekmesinden kaydedilir (Bölüm 5.10). |
| Takım kütüphanesi | `.json` | Takımlar penceresinden içe/dışa aktarılır. |

- **Kaydet** (Ctrl+S) güvenli yazar: önce geçici dosyaya yazar, sonra yerine koyar. Yazma yarıda kalırsa eski dosya bozulmaz.
- Her kayıtta önceki sürümün kopyası `dosyaadı.mhnk.bak` olarak yanında kalır. Bir önceki kayda dönmek için `.bak` uzantısını silip `.mhnk` yapın.
- **Otomatik kurtarma**: Değişiklik varken her 60 saniyede bir kurtarma kopyası yazılır. Durum çubuğunda "Otomatik kayıt" saati görünür. Temiz kapatma ya da Kaydet bu kopyayı siler. Program beklenmedik kapanırsa bir sonraki açılışta "Kurtarma dosyası bulundu" penceresi çıkar: **Kurtar** ya da **Sil**. Kurtarılan işi hemen kaydedin.
- Ayarlar, **tezgâh profilleriniz** ve **takım kütüphaneniz** `%APPDATA%\Mihenk\settings.json` içinde durur. Belgenin içine yalnız seçili tezgâhın kimliği ve belgedeki takımların kopyası yazılır. Belgeyi başka bilgisayara götürürseniz o bilgisayarda aynı tezgâh profili yoksa "Tezgâh profili bulunamadı" görürsünüz. `settings.json` dosyasını yedekleyin.
- Bilinen sınır: Dosya 200 MB'tan büyük olamaz.

---

## 2. Arayüz turu

Ekran yukarıdan aşağıya şöyledir:

1. **Başlık şeridi**: logo, **Dosya** menüsü, Geri Al / Yinele / Kaydet, belge adı (kaydedilmemiş değişiklik göstergesiyle), **Komut ara** (Ctrl+K), İmalat kipinde seçili **tezgâh** etiketi, Ayarlar, Yardım.
2. **Çalışma alanı sekmeleri**: **Tasarım**, **İmalat**, **Teknik resim** (Teknik resim "Yakında", henüz yok).
3. **Şerit**: komut grupları. Sığmayan komutlar » menüsünde, ilgili grubun ▾ listesinde ya da Ctrl+K aramasındadır. "Son kullanılan komutlar" kısa yol olarak görünür.
4. **Tarayıcı** (solda): Parametreler, Orijin, Gövdeler, Sketch'ler. İmalat sekmesinde: Tezgâhlar, Takımlar, Setup ve işlemler.
5. **3B görünüm** (ortada) ve **görünüm küpü**: Ön, Üst, Sağ, İzo, Sığdır.
6. **Panel** (sağda): bir komut seçince özellik formu açılır. Enter = Tamam, Esc = İptal.
7. **Zaman çizelgesi** (altta): her özellik bir kutucuktur. Tıkla seç, çift tıkla düzenle, sağ tıkla menü (**Düzenle**, **Yeniden adlandır**, **Bastır / Etkinleştir**, **Buraya geri sar**, **Sil**). İmalat sekmesinde burası simülasyon çubuğudur.
8. **Durum çubuğu**: kip (Model / Eskiz), araç, hatalı özellik sayısı, seçim, hesap süresi, otomatik kayıt saati. İmalat sekmesinde "Post: DOĞRULANMADI" düğmesi de buradadır.

Fare (3B görünümde):

| Hareket | Ne yapar |
|---|---|
| Sağ tuşu basılı sürükle | Döndürür |
| Orta tuş sürükle | Kaydırır |
| Tekerlek | Yakınlaştırır |
| Sol tuş | Seçer |

Kullandığınız bazı ifadeler:

- **Parametre**: Adı olan ölçü. Örnek: `L = 80`. Ölçü kutularına `L/2` yazabilirsiniz.
- **Hata**: Kırmızı özellik = hesaplanamadı. Üzerine gelince nedeni görünür.
- Birim: mm ve derece. Sayıda virgül de nokta da kabul edilir.
- Kaydedilmemiş iş varken Yeni/Aç/kapatma sorar ("Kaydedilmemiş değişiklikler").

---

## 3. Sketch (2B çizim)

Sketch, bir düzlem üzerindeki 2B çizimdir. Katı model bundan üretilir.

### 3.1 Sketch başlatma ve bitirme

1. **Sketch** komutuna basın.
2. İpucu: "Bir düzlem ya da düzlemsel yüz seçin". Orijin düzlemlerinden birini (XY Üst, XZ Ön, YZ Sağ) ya da gövdenin düz bir yüzünü tıklayın.
3. Çizin, ölçülendirin, kısıtlayın.
4. **Sketch'i Bitir** (yeşil düğme) ile kaydedin. **İptal** değişiklikleri atar.
5. Bitirirken eksik varsa "Sketch kaydedildi, ama:" uyarısı çıkar: açık profil, kapalı profil yok, üst üste binen nesne, tam tanımlı değil.

Şeritte sık araçlar görünür. Diğerleri **Çiz ▾**, **Düzenle ▾**, **Kısıt ▾** listelerindedir.

### 3.2 Çizim komutları

| Komut | Kısayol | Ne yapar |
|---|---|---|
| Seç | (varsayılan) | Tıkla; Shift ile çoklu seç. Boşlukta sürükle: soldan sağa = tamamen içindekiler, sağdan sola = değenler. Ctrl+A tümünü seçer. |
| Çizgi | L | Zincir çizer. Zincirde A = teğet yay, L = çizgi. Esc, çift tık ya da sağ tık bitirir. Başlangıç noktasına dönünce kapanır. |
| Dikdörtgen | R | İki köşe. |
| Merkez dikd. | Shift+R | Merkezden. |
| 3 nokta dikd. | Çiz ▾ | Döndürülmüş dikdörtgen. |
| Daire | C | Merkez ve yarıçap. |
| 2 nokta daire | Çiz ▾ | Çapın iki ucu. |
| 3 nokta daire | Shift+C | Üç nokta. |
| Yay | A | Merkez, başlangıç, bitiş. |
| 3 nokta yay | Shift+A | Üç nokta. |
| Teğet yay | Çiz ▾ | Mevcut uca teğet. |
| Çokgen | G | Kenar sayısı ve iç/dış teğet kipi sağ panelde. |
| Kanal | U | İki uç merkezi ve genişlik. |
| Elips | Y | Merkez, ana eksen ucu, küçük yarıçap. |
| Eğri | B | Spline. Noktaları tıklayın; Enter, çift tık ya da sağ tık bitirir. İlk noktaya tıklarsanız kapanır. |
| Nokta | P | Delik merkezi gibi noktalar için. |

Çizerken **sayı yazmaya başlarsanız** uzunluk/açı (çizgi), en/boy (dikdörtgen) ya da yarıçap (daire) kutusu açılır. Tab alan değiştirir, Enter onaylar ve ilgili ölçüyü ekler.

Yakalama: uç nokta, merkez, orijin, orta nokta, kesişim, teğet, dik, nesne üstü, ızgara (1 mm; Ctrl ile kapanır). Çizgi yataya ya da dikeye ±3° yakınsa otomatik Yatay/Dikey kısıtı eklenir.

### 3.3 Düzenleme komutları

| Komut | Kısayol | Ne yapar |
|---|---|---|
| **Buda** | T | Üstüne gelince silinecek parça kırmızı olur; tıklayın. Basılı sürükleyerek birçok parçayı budayın. Kaldırılan kısıt sayısı durum satırında yazar. |
| Uzat | X | Ucu en yakın kesişime uzatır. |
| Böl | K | Tıklanan yerden nesneyi ikiye ayırır. |
| Ofset | O | Zinciri seçin, mesafeyi yazın (ifade olabilir), tarafı tıklayın. Mümkünse kaynağa bağlı kalır. Köşeler: Keskin / Yuvarlak. |
| Köşe yuv. | Q | Köşe noktasını ya da köşeyi oluşturan iki nesneyi tıklayın. Yarıçap ölçüsü ekler. |
| Pah | W | Köşede pah. Ölçü kısıtı eklemez. |
| Ayna | M | Nesneleri seçin, **İleri**, simetri çizgisini tıklayın. "Bağlı" seçiliyse simetri kısıtı eklenir. |
| Dikd. desen / Dairesel desen | Düzenle ▾ | Adet ve adım girin, **Uygula**. Bağlı ya da bağımsız kopya. |
| Taşı / Kopyala / Döndür / Ölçekle | Düzenle ▾ | Sayı kutusu ya da iki tık (başlangıç, hedef). |
| İzdüşüm | J | Gövde kenarlarını sabit yapı geometrisi olarak ekler. |

Ctrl+X / Ctrl+C / Ctrl+V eskiz panosudur. Sağ tık menüsü: Eskizi bitir, Sil, Yapı geometrisi yap / geri al, Kısıtları göster, Kopyala / Kes / Yapıştır, Tümünü seç. Ölçü etiketinde sağ tık: **Referans ölçüye çevir** / **Sürücü ölçüye çevir**, **Değeri düzenle**.

Yapı geometrisi (**Yapı**) yardımcı çizgidir: kesikli çizilir, profile girmez.

### 3.4 Ölçüler

**Ölçü** (D) aracı tıkladığınız nesneye göre ölçü seçer:

| Tıkladığınız | Ölçü |
|---|---|
| Çizgi | Uzunluk |
| Daire | Çap |
| Yay | Yarıçap |
| İki nokta | Uzaklık |
| Nokta + çizgi | Nokta-çizgi mesafesi |
| İki çizgi | Açı |

**Yatay** ve **Dikey** ölçü araçları iki nokta ya da bir çizgiyi yatay/dikey ölçer. **Yarıçap** ve **Çap** araçları da vardır.

Ölçü seçilince küçük bir kutu açılır; değeri ya da bir ifadeyi (`L/2`) yazıp **Enter**'a basın. Etikete çift tıklayarak sonra düzeltebilirsiniz. Geçersiz ifade ya da çelişki olursa ölçü eklenmez ve nedeni söylenir. Sürüklenebilir etiket konumu kaydedilir.

### 3.5 Kısıtlar

| Kısıt | Uygulandığı öğeler |
|---|---|
| Yatay, Dikey | Çizgi ya da iki nokta |
| Paralel, Dik | Çizgi–çizgi |
| Eşit | Çizgi/daire/yay/elips çiftleri |
| Doğrusal | Çizgi–çizgi (aynı doğru üstünde) |
| Eş merkez | Daire/yay/elips çiftleri |
| Teğet | Çizgi–daire/yay, daire–daire, yay–yay |
| Çakışık | İki nokta |
| Nokta üzerinde | Nokta–çizgi/daire/yay/elips |
| Orta nokta | Nokta ve çizgi |
| Simetri | İki nokta ve bir simetri çizgisi |
| Sabitle | Nokta, çizgi, daire, yay |
| Yapı | Seçili nesneyi yapı geometrisi yapar |

Durum çubuğu "Serbestlik derecesi: N" ya da "Tam tanımlı" yazar. Tam tanımlı geometri koyu, serbest geometri mavi, yapı geometrisi kesikli gri, seçili turuncu görünür. Çelişen ya da gereksiz kısıtlar panelde listelenir; satıra tıklayınca nesne vurgulanır.

Her değişiklikten sonra çözücü çalışır. Çözülemezse değişiklik geri alınır ve nedeni yazılır ("Bu ... mevcut kısıtlarla çelişiyor").

### 3.6 Profil kuralları

Extrude ve Revolve **kapalı** profil ister. Kapalı bölgeler hafif dolguyla gösterilir. Şu durumlarda hata alırsınız:

- Çizgiler uç uca değil (açık profil).
- Çizgiler üst üste ya da kendini kesiyor.
- Profilde çok kısa kenar var.

Bir profil seçtikten sonra eskizi değiştirirseniz seçim kaybolabilir: özellik kırmızı olur, düzenleyip profili yeniden seçin.

### 3.7 DXF içe ve dışa aktarma

Her ikisi de yalnız bir Sketch açıkken çalışır (**Dosya** menüsü).

- **DXF eskiz içe aktar…**: Okunanlar: çizgi, nokta, daire, yay, LWPOLYLINE, POLYLINE (bulge dahil), elips, spline. Katmanlar yok sayılır; yakın uçlar birleştirilir. Dosyada birim bilgisi yoksa bir pencere açılır: **Dosya birimi** (mm, cm, m, inch, foot ya da özel katsayı). Emin değilseniz mm bırakıp sonra ölçüleri kontrol edin.
- **Eskizi DXF olarak dışa aktar (2000)**: Elips ve spline olduğu gibi yazılır.
- **Eskizi DXF olarak dışa aktar (R12)**: Elips ve spline kısa çizgilere (POLYLINE) bölünür. Eski programlar için.
- Yapı geometrisi dışa aktarılmaz.

### 3.8 Sketch'in bilinen sınırları

- Teğet kısıtı: çizgi–elips ve spline teğeti yok; uyarı verilir.
- Pah ölçü kısıtı eklemez.
- Bağlı dairesel desen yaklaşık 120 noktayla sınırlıdır.
- Gövde kenarı izdüşümünde yüze tıklayarak seçim yok: "eş düzlemli / tümü" seçenekleri vardır.
- DXF kaydının Windows'taki kayıt penceresiyle çalışması gerçek Windows'ta denenmedi (Bölüm 7.6).

---

## 4. Katı modelleme

Modelleme komutları **Tasarım** sekmesinin şeridindedir: **Oluştur**, **Düzenle**, **İncele**.

### 4.1 Oluştur

**Extrude**: Eskiz profilini çıkarır ya da keser.

1. **Extrude** komutuna basın. Panel açılır; eskiz otomatik seçilir (son kullanılmamış eskiz).
2. **Profiller**: Görünümde profil bölgelerine tıklayarak seçin (varsayılan: tümü).
3. **İşlem**: Yeni gövde / Ekle / Kes / Kesişim. Bir yüzde çizilmiş eskizle gövde varsa varsayılan Kes olur.
4. **Yön**: Tek yön / Simetrik / İki yön. **Kapsam**: Mesafe / Tümü. **Mesafe** kutusuna ölçü ya da ifade yazın. **Ters çevir** yönü değiştirir.
5. Enter (Tamam). Değer yazdıkça görünümde canlı önizleme çıkar; hata varsa panelde kırmızı yazar.

**Revolve**: Profili bir eksen etrafında döndürür. Eksen: Sketch X ekseni / Sketch Y ekseni / eskizdeki bir çizgi. **Açı** 0–360. Profil eksenin bir tarafında kalmalı; eksenin karşısına geçerse hata verir.

**Delik**: Eskizdeki **Nokta**'lara (ya da daire merkezlerine) delik açar. Önce deliklerin yerini veren bir eskiz çizin.

| Alan | Seçenekler |
|---|---|
| Tip | Düz / Silindirik havşa / Konik havşa |
| Diş | Yok, M3 … M24 (kaba adım). Seçince çap matkap çapına (anma çapı − adım) ayarlanır ve diş bilgisi kaydedilir. |
| Çap, Derinlik | ifade yazılabilir |
| Kapsam | Derinlik / Tümü (delip geçer) |
| Uç açısı | 0–180° |
| Havşa çapı / derinliği / açısı | tipe göre görünür |

> İmalat sekmesindeki **Delik delme** ve **Diş** işlemleri delikleri bu **Delik** özelliğinden okur. Delikleri Extrude ile **Kes** yaparak açarsanız CAM bunları delik olarak görmez.

**Kutu**, **Silindir**, **Küre**: Konum ve ölçü girerek temel şekil ekler.

### 4.2 Düzenle

- **Yuvarlat** (kenarlara yarıçap) ve **Pah**: Kenarları tıklayarak seçin, değer girin. Değer kenar için çok büyükse hata alırsınız.
- **Kabuk**: Gövdeyi içten boşaltır; açılacak yüzleri ve kalınlığı seçin. Yuvarlatılmış kenarlı gövdede başarısız olabilir: kabuğu yuvarlatmadan önce uygulayın.
- **Birleştir**: Hedef gövde ve takım gövdeler. Ekle / Kes / Kesişim. En az iki gövde gerekir.
- **Taşı/Kopyala**: Ötele (X/Y/Z) ya da döndür. **Kopyala (aslını koru)** seçeneği vardır.
- **Desen**: Kaynak (bir özellik ya da gövdeler), tür: Dikdörtgen (adet/aralık, iki yön) ya da Dairesel (adet, toplam açı, merkez).
- **Ayna**: Gövdeyi bir düzleme göre yansıtır.

### 4.3 İncele

- **Ölç**: Bir kenar ya da yüz seçin: tür, uzunluk, alan, yarıçap/çap. İkinci seçim en kısa mesafeyi, açıyı ve ΔX/ΔY/ΔZ'yi verir. Esc ile çıkın.
- **Özellikler**: Bir gövde seçin: hacim, yüzey alanı, ağırlık merkezi, kutu ölçüleri. **Yoğunluk** (g/cm³, örnek 7,85) girerseniz kütle de hesaplanır.
- **Girişim**: Görünür gövdelerin birbirine girip girmediğini denetler.
- **Kesit**: Eksen (X/Y/Z), konum kaydırıcısı, **Ters çevir**, **Kesiti Kapat**. Yalnız görüntüyü etkiler; model değişmez.

### 4.4 Parametreler ve zaman çizelgesi

- **Parametreler**: Tarayıcıda Parametreler → **Düzenle** (ya da Ctrl+K ile "Parametreler"). Tabloda Ad, İfade, Değer, Not. Ad yalnız harf, rakam ve `_` içerir; rakamla başlamaz. Bir parametre öncekileri kullanabilir. Parametre değişince bağlı ölçüler ve eskizler yeniden hesaplanır.
- **Zaman çizelgesi** özellik sırasıdır. **Bastır**, özelliği silmeden devre dışı bırakır. **Buraya geri sar** o ana döner; **Sona git** geri sarmayı bitirir. Başka özelliğin kullandığı bir özelliği silerken uyarı çıkar ("Silinecek özellik kullanılıyor").
- Geri Al / Yinele (Ctrl+Z / Ctrl+Y) 50 adımlıktır.
- Model değişince bir kenar/yüz seçimi bulunamazsa özellik kırmızı olur ("Seçilen yüz model değişince kayboldu"). Özelliği düzenleyip yeniden seçin.

### 4.5 STEP ve STL

- **STEP İçe Aktar… / STL İçe Aktar…**: Yabancı model gövde olarak eklenir. **İçe aktarılan geometri düzenlenemez**; yeniden adlandırabilir ya da silebilirsiniz.
- STL kapalı bir katı olmalıdır ve en çok 50000 üçgen içerebilir.
- **STEP Dışa Aktar… / STL Dışa Aktar…**: Görünür gövdeleri yazar. Görünür gövde yoksa "Dışa aktarılacak görünür gövde yok" der.
- CAM için mümkünse kendi çizdiğiniz parametrik modeli kullanın. CAM'de "Gövde dış sınırı" seçimi yalnız düz duvarlı (prizmatik) gövdede çalışır (Bölüm 5.6).

---

## 5. İmalat (CAM)

**İmalat** sekmesine geçin. Şerit şu gruplardan oluşur:

| Grup | Komutlar |
|---|---|
| Kurulum | **Yeni setup**, **Stok**, **Tezgâh**, **Takımlar** |
| 2B | **Yüzey**, **Kontur**, **Cep**, **Uyarlanır** (yok, "Bu işlem türü sonraki sürümde") |
| Delme ve diş | **Delik delme**, **Diş** |
| 3B | **Yüzey işleme** (yok, sonraki sürümde) |
| Eylemler | **Yolu hesapla**, **Simüle et**, **Post işle**, **NC kodu** |

### 5.1 Genel akış

1. Tezgâh profilini hazırlayın ve seçin (5.2, 5.3).
2. Takımları tanımlayın (5.4).
3. **Yeni setup** ekleyin: stok, sıfır noktası, iş sıfırı (5.5).
4. İşlemleri ekleyin (5.6).
5. **Yolu hesapla** (5.7).
6. **Simüle et** (5.8).
7. **Post işle**: kapılar denetler, sorun yoksa NC çıkar (5.9, 5.10).
8. NC'yi okuyun, kaydedin. Tezgâhta kendiniz doğrulayın.

Önce bir gövde (Tasarım sekmesi) olmalıdır. Aksi halde "Önce bir gövde oluşturun (Tasarım sekmesi). Setup gövdeye bağlanır." uyarısı çıkar.

Tarayıcıda her işlemin yanında durum rozeti vardır: **Tamam**, **Hesaplanmadı**, **Eski** (model, takım, tezgâh ya da işlem değişti; yeniden hesaplayın), **Hata**, **Bastırıldı**. Durum çubuğu "N işlemde hata", "N işlem eski" sayar. İşlem sağ tık menüsü: Düzenle, Yeniden adlandır, Kopyala, Bastır / Bastırmayı kaldır, Yukarı / Aşağı taşı, Sil.

### 5.2 Tezgâh profili

**Tezgâh** komutu tezgâh yöneticisini açar. Listede üç **Yerleşik** şablon vardır:

- **Genel 3 eksen (Fanuc tarzı)**
- **Genel 3+1 (A eksenli, Fanuc tarzı)**
- **Genel 3 eksen (Mitsubishi tarzı)**

Yerleşik şablonlar yalnız yapıyı taşır, sayısal değerleri boştur ve değişmez; hiçbir tezgâh markası ya da modeli yerleşik değildir. Tezgâh profilleri sizin verinizdir. **Kopyala** ile kendi profilinizi çıkarın, **Düzenle** ile doldurun, listede profilinizin yanındaki işareti seçerek belgede kullanın (ya da aşağıdaki "Kendi tezgâhını ekleme" kısmına bakın). Listedeki "Eksik değer" sütunu kaç alanın boş olduğunu söyler.

**Neden boş alanlar var?** Şablon tezgâhınıza ait hiçbir değeri bilemez ve **uydurmaz**; bu değerleri boş (`null`) bırakır. Bir değer NC için gerekliyse ve boşsa **NC üretimi durur**. Amaç: yanlış bir tahminin sessizce NC'ye girmesini önlemek.

Şablonlar yalnız yapıyı taşır; kurs, A ekseni (hız, sınır, dönüş yönü), kontrol/post ayarları, soğutma M kodları ve dokunulmaz liste (5.3) tezgâhınızın belgesinden **sizin** doldurduğunuz değerlerdir.

**Doldurmanız gerekenler** ve doldurmazsanız ne olur:

| Alan (sekme) | Doldurmazsanız |
|---|---|
| **En yüksek devir** (Mil ve ilerleme) | Kapı 1: "Eksik bilgi" → NC üretilmez |
| **En yüksek kesme ilerlemesi** (Mil ve ilerleme) | Kapı 1: "Eksik bilgi" → NC üretilmez |
| **Güvenli Z çekilme yöntemi** (Post) | Post durur: "Post özelliği boş: safeRetract" |
| G53 güvenli Z (Post) | G53 yöntemini seçtiyseniz post durur |
| Bekleme (G04) adresi ve birimi (Post) | Bekleme (dwell) gereken işlemde post durur |
| Çevrim bekleme adresi ve birimi (Post) | G82/G89 gibi beklemeli çevrimde post durur |
| Soğutma kodları: sis, hava, mil içi (Post) | O soğutmayı seçen işlemde post durur |
| G54.1 P aralığı (Post) | G54.1 Pn kullanırsanız post durur |
| Yüksek hız kipi (G05 …) | Boş kalabilir; boşsa yazılmaz |
| Magazin kapasitesi | Boş kalabilir; yalnız takım numarası denetimi yapılmaz |

Post sekmesinde boş zorunlu alanlar turuncu işaretlidir. Değerleri **tezgâhın kontrol kılavuzundan ya da makine projesinden** alın; tahmin etmeyin. Yanlış G04 birimi bekleme süresini 1000 kat değiştirir.

**A ekseni**: Eksenler sekmesindeki **Dönüş yönü** (−X / +X) "pozitif A açısının hangi yöne döndüğü"dür. Şablondaki değer **tezgâhta doğrulanmamıştır** (Bölüm 5.5 ve 7).

### Kendi tezgâhını ekleme

Mihenk hiçbir tezgâh profili hazır getirmez; tezgâhınızı bu bilgisayara siz eklersiniz. İki yol vardır:

1. **Şablonu kopyalayın:** İmalat → **Tezgâh** → ihtiyacınıza uyan şablonda **Kopyala** → ad verin → açılan pencerede alanları (kurslar, mil/ilerleme, A ekseni, dokunulmaz liste, post özellikleri) tezgâhınızın belgesinden doldurup **Tamam**.
2. **Dosyadan içe aktarın:** **Tezgâh** penceresinde **Dosyadan içe aktar** → `.json` tezgâh dosyasını seçin. Dosya bozuksa ya da bir profil geçersizse o profil alınmaz ve nedeni bildirilir; kimliği çakışan profil " (2)" ekiyle yeni kimlik alır.

**Yedekleme ve taşıma:** Satırdaki **Dışa aktar** düğmesi profili `mihenk-machine` biçiminde bir JSON dosyasına yazar. Bu dosyayı yedek olarak saklayabilir, başka bir bilgisayarda **Dosyadan içe aktar** ile geri yükleyebilirsiniz. Tezgâh profilleri belge dosyasına yazılmaz, bu bilgisayarda saklanır; bu yüzden dışa aktarıp yedeklemeniz önerilir.

### 5.3 Korunan T / H / D ve WCS listesi

**Dokunulmaz** sekmesi, makinede başka işler için ayrılmış numaraları tutar. Bu numaralar bir takımda ya da iş sıfırında kullanılırsa **NC üretilmez** (Kapı 2).

Genel şablonlarda liste **boştur**. Makinenizde başka işler için ayrılmış numaralar varsa kendi profilinize yazın.

Kurallar:

- Yeni takım eklerken program korunan numaraları atlayıp serbest ilk numarayı verir.
- Yeni setup'ta iş sıfırı, korunmayan ilk G54–G59 olarak seçilir.
- Listeye G54.1 Pn de yazabilirsiniz ("Diğer iş sıfırları": virgülle ayırın, örnek `G54.1 P1`).
- Listenin atölyenizin gerçek durumuna uyması sizin sorumluluğunuzdadır. Şablon yalnız başlangıç değeridir.

### 5.4 Takım kütüphanesi

**Takımlar** komutu iki kapsamı gösterir: **Bu belge** ve **Kütüphane**. Belgeye eklenen takım kopyalanır, böylece dosya kendi kendine yeter. Kütüphane bu bilgisayarda kalır.

- **Yeni takım**, **İçe aktar**, **Dışa aktar** (JSON). Satırda: **Düzenle**, **Kopyala**, **Sil**, **Belgeye ekle** / **Kütüphaneye kaydet**.
- Bir işlemde kullanılan takımı silerseniz o işlemler takımsız kalır.

**Takım türleri**: Parmak freze (düz), Küresel freze, Köşe yarıçaplı freze, Matkap, Punta, Kılavuz, Pah frezesi, Yüzey frezesi, Rayba, Delik tornası (bore).

**Genel sekmesi**: Ad, Tür, **Takım no (T)**, **Boy düzeltme (H)**, **Çap düzeltme (D)** (yalnız aşınma telafisinde gerekir), Malzeme, Not.

**Geometri sekmesi**:

| Alan | Anlamı |
|---|---|
| Çap | Kesici çapı |
| Köşe yarıçapı | Köşe yarıçaplı frezede |
| Uç açısı | Matkap, punta, pah frezesi |
| Diş adımı | Kılavuzda zorunlu |
| **Kesici boy** | Kesicinin kesme boyu. Bir pasonun derinliği bunu aşamaz. |
| **Tutucudan çıkıntı** | Tutucudan çıkan toplam boy. Bundan derine inilemez. |
| Şaft çapı | Boşsa kesici çapı alınır |
| Ağız sayısı | |
| **Merkezden keser** | Aşağıya bakın |
| Tutucu çapı / boyu | Simülasyonda tutucu çarpışmasını denetlemek için gerekir |

**Merkezden keser (centerCutting)**:

- Açıksa takım malzemeye düz dalabilir (merkezden kesen parmak freze, matkap).
- **Kapalıysa** takım düz dalamaz. Programa böyle bir takımı vermek NC'yi engeller (Kapı 4).
- Yeni oluşturulan parmak freze, küresel ve köşe yarıçaplı takımlarda bu kutu **kapalı** gelir. Takımınız merkezden kesiyorsa işaretlemeniz gerekir; kesmiyorsa işaretlemeyin. Doğruyu katalogdan okuyun.

**Rampa açısı**: Merkezden kesmeyen takımla rampa ya da helis girişi yapmak için takımda "en büyük rampa açısı" değeri tanımlı olmalıdır. Takım düzenleyicide **Geometri** sekmesinde **En büyük rampa açısı** (0–90°, °) alanı vardır; yalnız **Merkezden keser** işaretli değilse görünür. Üretici verisini girin; boş bırakırsanız merkezden kesmeyen takımla rampa/helis girişi engellenir (Kapı 4, Bölüm 5.9) ve değer uydurulmaz. Değer takımla birlikte kaydedilir, yeniden açınca korunur.

**Kesme verisi sekmesi (Preset)**: Ad, **Devir**, **Kesme ilerlemesi**, **Dalma ilerlemesi**, Rampa ilerlemesi, Pasa derinliği, Yanal pasa, Soğutma. İşleme takım seçince ön ayar devir ve ilerlemeleri otomatik doldurur.

> **Dikkat:** **Preset ekle** ile yeni eklenen ön ayar yer tutucu değerlerle gelir (3000 dev/dk, 600 mm/dk, 200 mm/dk). Bunlar **sizin kesme verinizi temsil etmez**. Her ön ayarın değerlerini kendiniz yazın.

Program sizin yerinize kesme verisi **önermez**.

### 5.5 Setup

Setup bir bağlamadır: hangi gövde, nerede sıfır, hangi stok, hangi iş sıfırı. **Yeni setup** komutu paneli açar.

1. **Ad**; **Gövdeler**: işlenecek gövdeleri işaretleyin (en az biri).
2. **Koordinat sistemi**:
   - **Z yönü**: takımın parçaya yaklaştığı yön. Üstten işleme için **+Z (üstten)**. Seçenekler: ±X, ±Y, ±Z.
   - **X yönü**: Z'ye dik bir yön.
   - **Orijin**: **Stok köşesi** (varsayılan, sol-ön-üst), **Stok üst merkezi**, **Model orijini**, **Nokta**.
3. **İş sıfırı**: G54 … G59 ya da G54.1 (+ P numarası). Korunan listedeyse panel uyarır ve NC üretilmez.
4. **Stok**:
   - **Modelden pay**: Yanlarda pay (varsayılan 2), Üstte pay (2), Altta pay (0).
   - **Kutu (ölçü)**: En küçük / En büyük X, Y, Z (modeli içermeli).
   - **Silindir (çubuk)**: Çap, Boy. Eksen X boyunca uzanır; orijin **Model orijini** ya da **Nokta** olmalı.
   - Stok modeli içine almıyorsa "Stok modeli içine almıyor" hatası çıkar.
5. **Döner eksen (A)**: aşağıya bakın.
6. **Güvenli yükseklik** (varsayılan 10 mm): Stok üstünden yukarı. İşlemin kendi güvenli yüksekliği ile bunun büyüğü kullanılır.

Panelin altında "Setup çözüldü: Stok … mm · üst yüz Z=…" özeti çıkar. Çözülemezse nedeni kırmızıyla yazar. Görünümde setup çerçevesi (WCS eksenleri) görünür; **tezgâhta sıfırı koyacağınız yer ile karşılaştırın**.

#### 3+1 (A ekseni, GSA divizör)

"3+1": A ekseni parçayı bir açıya çevirip kilitler; kesme 3 eksenle yapılır. Eşzamanlı 4 eksen **yok**.

1. Setup'ta **A ekseninde işle (3+1)** kutusunu işaretleyin. (Seçili tezgâhta A ekseni yoksa: "Seçili tezgâhta A ekseni yok." "Genel 3+1 (A eksenli, Fanuc tarzı)" şablonunu kopyalayın.)
2. **A açısı** kutusuna açıyı derece olarak yazın.
3. Koordinat sistemi **A = 0 için** tanımlanır. İşlemler yazdığınız açıda çalışır.

**`aAngle` ne demek?** Girdiğiniz A açısı, NC'ye yazılan **A kelimesinin kendisidir** (kısa yol normalizasyonundan önceki değer). `A90` için 90 yazarsınız. Program A işaretini kendi içinde çevirmez. Parçanın fiziksel dönüş yönü, makine profilindeki **Dönüş yönü** (−X / +X) ayarından hesaplanır. Bu yön yanlışsa yol ters yüze gider.

Bilmeniz gerekenler:

- **A yönü tezgâhta doğrulanmadı.** NC başlığında `(WARNING A AXIS DIRECTION NOT VERIFIED - CONFIRM ON MACHINE WITH A MARKED PART BEFORE CUTTING)` yazar ve kapı uyarısı verir. Bölüm 7.3'teki teyidi yapın.
- Koordinat çerçevesi, orijinden geçen **X çizgisi etrafında** döner. İş sıfırınızın (WCS) tezgâhta **A ekseninin üzerinde** olması gerekir. Program bunu denetlemez.
- Profilde **Kısa yoldan dön** açıksa (Genel 3+1 şablonunda açık) açı 0–359,999 aralığına normalleştirilir (örnek: A−90 → A270) ve 180° dönüş iki adıma bölünür.
- Program döner eksenli tezgâhta ilk bölümde A'yı **mutlak** yazar (başlangıçta tezgâh A'sı bilinmez) ve program sonunda A'yı 0'a döndürür.
- A hareketinden önce Z güvenli yüksekliğe çekilir.
- Aynı setup içinde A≠0 iken yan yönden kesme ve alt kesme simülasyonda **yoktur** (Bölüm 7.4).

Örnek biçim (çalıştırmayın): NC'de A indeksleme satırı şu biçimde görünür.

```
(ORNEK BICIM - CALISTIRMAYIN)
G0 A90.
```

### 5.6 İşlemler

Her işlem aynı paneli kullanır: dört sekme **Takım**, **Geometri**, **Yükseklikler**, **Pasolar**. Panelin altındaki **Yolu hesapla** düğmesi, taslağı kaydetmeden yolu hesaplar ve sonucu gösterir ("Yol hesaplandı · N hareket · kesme … mm · hızlı … mm · yaklaşık … dk"). Enter = Tamam, Esc = İptal.

**Ortak: Takım sekmesi**

- **Takım**: uyumlu olmayan takım "(bu işleme uymaz)" etiketlidir. Yüzey için yüzey frezesi/parmak freze/köşe yarıçaplı; kontur ve cep için parmak freze/köşe yarıçaplı/küresel; delme için çevrime göre matkap, punta, kılavuz, rayba, bore.
- **Ön ayar**: devir, ilerleme, paso ve soğutmayı doldurur; sonra değiştirebilirsiniz. Elle değiştirirseniz "(elle)" olur.
- **Devir**, **Kesme ilerlemesi**, **Dalma ilerlemesi**, **Rampa ilerlemesi** (boşsa kesme ilerlemesi), **Soğutma**. Devir ve ilerlemeler **boş gelir**; ön ayar yoksa siz yazmalısınız.
- Makinenin en yüksek devri biliniyorsa aşan devirde uyarı çıkar.

**Ortak: Yükseklikler sekmesi** (kontur, cep, yüzey)

- **Güvenli yükseklik** (varsayılan 5) ve **Geri çekilme yüksekliği** (varsayılan 2): stok üstünden yukarı, mm. Geri çekilme güvenli yükseklikten büyük olamaz. İşlem, kendi değeri ile setup'taki değerin büyüğünü kullanır.
- **Üst** ve **Alt**: her biri için **Başvuru** (Stok üstü, Model üstü, Seçilen geometri, Model altı, Stok altı, Mutlak) ve **Fark** (mm; artı yukarı). Mutlak seçilirse Z setup sıfırına göredir.
- Varsayılanlar: yüzeyde Üst = Stok üstü, Alt = Model üstü; kontur ve cepte Üst = Stok üstü, Alt = Seçilen geometri.

#### Yüzey

Stoğun üstünü frezeler. Geometri seçmezsiniz; alan setup'taki stoktan gelir. Yalnız **kutu stokla** çalışır (silindir stokta hata).

| Alan | Sekme | Anlamı |
|---|---|---|
| Hat yönü | Geometri | X eksenine göre derece (zikzak hatların yönü) |
| Ek taşma | Geometri | Takımın stok dışına taşacağı ek mesafe |
| Yanal adım | Pasolar | Takım çapından küçük olmalı |
| Derinlik adımı | Pasolar | Boşsa tek paso |
| Dikey pay | Pasolar | Üstte bırakılacak malzeme |

#### Kontur

Bir profili dışından, içinden ya da üzerinden keser.

**Geometri**: **Seçim türü**: **Yüz** (takım eksenine dik düz bir yüz; yüzün sınırı kesilir), **Eskiz profili**, **Gövde dış sınırı**. Görünümde tıklayarak seçin; seçilenler listelenir.

| Alan | Seçenekler / anlamı |
|---|---|
| **Kesme tarafı** | Otomatik (dış sınır için dışında, delik için içinde), İçinde, Dışında, Üzerinde. Açık zincir yalnız Üzerinde. |
| **Telafi** | **Bilgisayarda**: yol takım yarıçapını hesaba katar. **Kontrolde aşınma (D)**: yol parça konturudur, kontrol G41/G42 uygular; takımın D numarası gerekir. |
| **Kesme yönü** | Tırmanma / Geleneksel |

Pasolar sekmesi:

| Alan | Anlamı |
|---|---|
| Derinlik adımı | Her paso derinliği |
| Bitirme derinlik adımı | İsteğe bağlı |
| Yanal pay / Dikey pay | Bırakılacak malzeme |
| Kaba yanal pasolar | Duvardan uzakta ek pasolar (Paso sayısı, Yanal adım). Kontrolde aşınma ile kullanılamaz. |
| **Dalma biçimi** | Dalma ya da Rampa (**Giriş açısı** gerekir: 0,1–45°). Dalma yalnız merkezden kesen takımla. |
| **Giriş / Çıkış** | Yok / Yay (yarıçap) / Doğru (uzunluk). Kontrolde aşınmada doğru olmalı ve takım yarıçapından uzun olmalı. Rampa ile giriş/çıkış birlikte kullanılamaz. |
| **Köprüler** | Köprü bırak: Köprü sayısı, genişliği, yüksekliği. Parçayı son derinliklerde çerçeveye bağlı tutar. |

Kuralların bir kısmı hata verir: kendini kesen sınır ("Sınır kendini kesiyor"), takımın sığmaması ("Takım … bu kontura sığmıyor"), farklı yükseklikte iki profil seçmek ("Seçilen profiller farklı yükseklikte"), iç köşenin takımdan dar olması (malzeme kalır uyarısı).

**Gövde dış sınırı** yalnız takım ekseni boyunca düz duvarlı (prizmatik) gövdede çalışır. Eğik/eğri duvar, dış pah/yuvarlatma, yatay silindir varsa hata verir ("Gövde takım ekseni boyunca düz duvarlı değil"); bir yüz ya da eskiz seçin.

#### Cep

Kapalı bir bölgeyi boşaltır (adalar dahil).

**Geometri**: Yüz (cebin taban yüzü), Eskiz profili ya da Gövde dış sınırı; **Kesme yönü**. Bir cepteki taban yüzleri aynı yükseklikte olmalıdır ("Bir cep işlemindeki taban yüzleri aynı yükseklikte olmalı"); farklıysa ayrı işlem yapın. Açık kenarlı cep (bir tarafı açık basamak) desteklenir; takım dışarı taşar.

| Alan | Anlamı |
|---|---|
| Yanal adım | Takım çapından küçük |
| Derinlik adımı | Her paso derinliği |
| Bitirme derinlik adımı | İsteğe bağlı |
| Yanal pay / Dikey pay | Bırakılacak malzeme |
| **Giriş türü** | Helis / Rampa / Dalma. Varsayılan Rampa. Dalma yalnız merkezden kesen takımla. |
| **Giriş açısı** | Helis ve rampada **zorunlu**, 0,1–45°. Varsayılmaz; siz yazarsınız. |
| **Helis çapı (takım merkezi)** | Helis girişinde zorunlu. Cebe sığmazsa hesap hata verir ("Helis girişi sığmıyor"). |
| **Bitirme pasosu** | Seçilirse **Bitirme payı** zorunludur (yanal adımdan küçük). Kaba pasolar duvardan bu kadar uzak kalır, son paso temizler. |

Cep köşeleri takım yarıçapından keskin olamaz: **köşede malzeme kalır** ve program "Cepte işlenemeyen yaklaşık … mm² alan kalıyor" uyarısı verir. Bu uyarıyı daha küçük takımlı ikinci bir işlemle giderin. Çok yüksek yanal adımlarda (çapa yakın) da köşe kalıntısı artar.

#### Delik delme

**Geometri**: Delikler **modeldeki Delik özelliğinden** gelir (Bölüm 4.1). Model delik içermiyorsa "Modelde delik yok" uyarısı çıkar.

| Alan | Anlamı |
|---|---|
| **Çevrim** | Delme, Gagalama, Talaş kırma, Punta, Kılavuz, Raybalama, Tornalama |
| Çapa göre süz / Özelliğe göre süz | Hangi deliklerin işleneceği; liste altta görünür |
| **Derinlik kaynağı** | **Delik ölçüsünden** ya da **Mutlak Z** (setup sıfırına göre) |
| **Uç boyunu ekle** | Delik dibinde tam çap için matkap ucu boyu kadar daha iner |
| **Boydan delikte taşma** | Boydan boya deliklerde model tabanının altına ek mm (varsayılan 1) |
| **Gagalama adımı** | Gagalama ve talaş kırmada zorunlu |
| **Bekleme** (sn) | Delik dibinde bekleme; boşsa yok. Post'ta bekleme adresi/birimi dolu olmalı. |
| **Delik sırası** | Model sırası / En kısa yol |

Eksenleri takım eksenine paralel olmayan delikler o setup'ta atlanır (uyarı). Delik çapı takım çapından farklıysa uyarı çıkar. Aynı üst/dip yüksekliğindeki delikler tek çevrimde yazılır.

Tamamen delip geçen delikte takım model tabanının altına iner. Programda **tabla ya da fikstür modellenmediği** için altına bir fedakâr levha (ya da boşluk) koymak sizin sorumluluğunuzdadır (Bölüm 7.4).

#### Diş

Kılavuz çevrimi: **Diş** komutu Delik delme ile aynı paneli "Kılavuz" çevrimiyle açar. Takım türü **Kılavuz** olmalı ve **Diş adımı** girilmelidir. İlerleme otomatik hesaplanır; M80V şablonunda senkron kılavuzda ilerleme = hatve olarak yazılır. Deliğin diş bilgisi yoksa uyarı verir ("deliklerde diş bilgisi yok"), adım uyuşmuyorsa uyarı verir.

#### Yok olanlar

**Uyarlanır** (adaptif) boşaltma ve **3B yüzey işleme** bu sürümde yoktur; şeritte pasif görünür.

### 5.7 Yol üretme

- **Yolu hesapla** (şerit): Tüm işlemlerin takım yolunu hesaplar. Hesaplanamayan işlemler listelenir ("Hesaplanamayan işlemler"); satıra tıklayınca işlem açılır.
- Hesaplanan yol görünümde renkli çizilir: **Hızlı**, **Kesme**, **Giriş/çıkış**. Alt çubukta **Yolu göster** ile gizlenebilir.
- Model, takım, tezgâh ya da işlem değişince rozet **Eski** olur; yol görünümden kalkar. Yeniden hesaplayın.
- Hata mesajları ne yapacağınızı söyler (Bölüm 8).

### 5.8 Simülasyon

**Simüle et**: Eski işlemleri yeniden hesaplar, kapıları çalıştırır ve takım yolunu stok üzerinde oynatır. Alt çubukta: **Oynat / Duraklat**, **Bir adım ileri**, **Bir adım geri**, **Oynatma hızı** (×1 … ×500), kaydırıcı, "Kaldırılan … cm³", **Tutucu** göster/gizle, **Sorunlar (N)**, **Simülasyonu kapat**.

- Görünümde stok bir yükseklik ağı olarak çizilir ve oyulur; takım ve tutucu gösterilir.
- **Sorunlar** listesinde kırmızı satır NC'yi engeller. Satıra tıklayınca simülasyon o harekete gider ya da işlem açılır.
- Çözünürlük otomatiktir ve en küçük takım yarıçapından kaba olamaz. Hücre sayısı çok büyürse (büyük stok, küçük takım) kapı NC'yi engeller; sessiz kaba çözünürlük yoktur.
- Simülasyon ana işlemde çalışır; büyük programda arayüz kısa süre donabilir.

**Simülasyonun göremedikleri Bölüm 7.4'tedir. Okuyun.**

### 5.9 Güvenlik kapıları

**Post işle** düğmesi önce tüm kapıları çalıştırır. **Engel** (kırmızı) varsa **NC üretilmez**. **Uyarı** (sarı) NC'yi durdurmaz ama NC başlığına ve listeye yazılır. Sorun listesinde satıra tıklayınca ilgili işlem açılır.

| Kapı | Ne denetler | Seviye | Ne yapmalı |
|---|---|---|---|
| **1. Eksik veri** | Takım no, H, aşınma telafisinde D, devir, ilerleme, iş sıfırı; makine profilindeki boş zorunlu alanlar (en yüksek devir, en yüksek kesme ilerlemesi, kurslar). Geçersiz makine profili. "Eksik bilgi: …" | **Engel** | Alanı doldurun. Makine alanlarını makine projesinden alın. |
| **2. Dokunulmaz numara** | T, H, D ve iş sıfırı korunan listede mi (yazım farkı: boşluk/harf boyutu önemsiz). "… dokunulmaz listede" | **Engel** | Başka numara seçin. Listeyi 5.3'e göre gözden geçirin. |
| **3. Sınırlar** | Devir > en yüksek devir; devir < en düşük devir (en az 1 dev/dk); ilerleme > en yüksek ilerleme; takım no > magazin kapasitesi; yol açıklığı > eksen kursu | **Engel** | Değeri düşürün ya da profili düzeltin. |
| 3b. Mutlak kurs | Setup'ın tezgâh üzerindeki konumu verilmediği için mutlak kurs denetlenemedi; yalnız yol açıklığı denetlendi ("… mutlak kurs denetimi yapılamadı") | Uyarı | Parçanın tezgâh üzerindeki konumunu ve kursu **siz** kontrol edin. |
| **4. Dalma ve boy** | Merkezden kesmeyen takımın malzemeye düz dalması ya da delme çevrimi; rampa/helis açısı takımın en büyük rampa açısını aşıyor ya da bu değer tanımsız (alan takım düzenleyicide **En büyük rampa açısı**; boşsa engel); bir pasonun derinliği kesici boyunu aşıyor; iniş derinliği "tutucudan çıkıntı"yı aşıyor (tutucu stoka çarpar). Kılavuz, rayba, bore bu denetimden muaftır (önceden delinmiş deliğe girer). | **Engel** | Merkezden kesen takım, helis/rampa, daha küçük derinlik adımı ya da daha uzun takım çıkıntısı. |
| **5. Simülasyon** | Hızlı hareket stoka giriyor; **oyma** (takım model yüzeyinin altına iniyor); kesici boyundan derin kesme; şaft ya da tutucu stoka çarpıyor; stok tabanının altına iniş (bildirilmiş boydan boya kesim ve delik hariç); telafili yay yarıçapı takımdan küçük; model yükseklik haritası alınamadı; çözünürlük en küçük takım yarıçapından kaba; simülasyon çalışmadı | **Engel** | Satıra tıklayıp hareketi görün. İşlemi (yükseklikler, giriş, takım) düzeltin. |
| 5b. Yanal çözünürlük | Simülasyon, hücre aralığının yarısından küçük yanal oymaları göremez ("… mm'den küçük yanal oymaları göremez"). Her simülasyonda yazılır. | Uyarı | Bölüm 7.4'ü okuyun; duvar doğruluğu takım yolu hesabından gelir. |
| **6. Döner eksen** | A istenen setup'ta makinede A ekseni yok; A açısı makine sınırları dışında | **Engel** | Profil ya da açıyı düzeltin. |
| 6b. A yönü | "A ekseni yönü … tezgâhta doğrulanmadı" (3+1 varsa her zaman) | Uyarı | **İşaretli parçayla A yönünü teyit edin.** Bölüm 7.3. |
| İşlem uyarıları | Cepte kalan malzeme, boydan delik taban payı, delik çapı uyuşmazlığı, iç köşede kalan malzeme, vb. | Uyarı | Mesajı okuyun; gerekirse ikinci işlem ekleyin. |
| Hesaplanamayan işlem | "… işlemi hesaplanamadı" | **Engel** | İşlemdeki hatayı giderin. |

Ek olarak, tezgâh profilinde boş post özellikleri (G04 adresi, Z çekilme yöntemi gibi) varsa Post işle **hepsini tek listede** gösterir ve NC üretmez; satıra tıklayınca tezgâh yöneticisi açılır ("Eksik değer" sütunu bu özellikleri de sayar). Post'un kendisi de durabilir: kullanılan bir özellik boşsa "Post özelliği boş", bir kapı engelliyorsa "Güvenlik kapıları bu programı engelliyor", devir S0'a yuvarlanıyorsa "S0 olarak yazılırdı".

**Kapılar sizin yerinize karar vermez.** Hiç engel çıkmaması NC'nin güvenli olduğu anlamına gelmez (Bölüm 7).

### 5.10 NC önizleme, kaydetme, doğrulama beyanı

Engel yoksa **Post işle** NC'yi üretir ve **NC kodu** penceresini açar:

- Üstte **"Post işlemcisi DOĞRULANMADI"** uyarısı. "Bu çıktı gerçek tezgâhta denenmedi. Tezgâha vermeden önce kuru çalıştırma yapın ve ilk parçayı tek blok ilerleyerek izleyin."
- **NC satırları**: bir satıra tıklayınca görünümde ilgili hareket vurgulanır. Ok tuşlarıyla gezilir.
- **Program numarası** (1–99999999, varsayılan 1000): değiştirip **Yeniden üret** deyin. Program adı dosya adından türetilir (büyük harf, 24 karaktere kadar).
- Belge NC üretildikten sonra değiştiyse "Belge bu NC üretildikten sonra değişti. Kaydetmeden önce Post işle ile yeniden üretin." çıkar ve **Kaydet (.nc)** pasif olur.
- **Kaydet (.nc)**: `.nc` dosyası olarak kaydeder.

NC başlığı şunlar içerir (örnek biçim, çalıştırmayın):

```
(UNVERIFIED POST - DOGRULANMADI - MIHENK x.y.z)
(WARNING: <okunur kapı uyarısı>)
```

Başlıktaki yorumlar ASCII'dir (Türkçe karakter çıkmaz).

**Doğrulama beyanı**: Durum çubuğundaki **Post: DOĞRULANMADI** düğmesi bir pencere açar. **Ad**, **Tarih**, **Ne kontrol ettiniz?** ve "Bu NC'yi kendim kontrol ettim" kutusunu doldurup **Doğrulandı say** derseniz belgeye bu beyan yazılır, NC başlığına `(VERIFIED BY … ON …)` eklenir.

Bu beyan **yazılımın doğrulaması değildir**; kendi kontrolünüzün kaydıdır. Belge değişirse beyan **düşer** ("Önceki doğrulama düştü"). "Post işlemcisi DOĞRULANMADI" uyarısı beyanla kalkmaz; kalıcıdır.

---

## 6. Baştan sona örnek: cep ve delikli blok

Parça: 100 × 60 × 20 mm alüminyum blok. Üstte 60 × 30 mm, 8 mm derin cep. Dört köşede Ø6,6 mm delik (delip geçer). 3 eksen, tek bağlama, iş sıfırı üst sol ön köşe.

> Sayılar örnektir. **Kesme verisi (devir, ilerleme) bu kılavuzda verilmez**; kendi verinizi yazın. Tezgâh alanlarını makine projenizden alın. Ekranınızda T numaraları farklı olabilir.

### 6.1 Tasarım

1. **Tasarım** sekmesi → **Sketch** → **XY (Üst)** düzlemi.
2. **Dikdörtgen** ile orijinden (yakalama "Orijin" gösterir) bir dikdörtgen çizin. **Ölçü** ile yatay kenara 100, dikey kenara 60 yazın. **Sketch'i Bitir**.
3. **Extrude** → Profil: tümü → İşlem: **Yeni gövde** → Mesafe 20 → Enter. Blok oluşur.
4. **Sketch** → bloğun **üst yüzünü** tıklayın. **İzdüşüm** (J) ile üst yüzün kenarlarını sabit yapı geometrisi olarak ekleyin (Kaynak: "Düzlemdeki kenarlar", **Uygula**). **Dikdörtgen** çizin; **Ölçü** ile genişlik 60, yükseklik 30 verin. Konumlandırmak için dikdörtgenin sol alt köşesi ile izdüşürülmüş sol kenar arasına 20, alt kenar arasına 15 yazın (Ölçü aracı nokta + çizgi seçince nokta-çizgi mesafesi verir). **Sketch'i Bitir**.
5. **Extrude** → İşlem: **Kes** → Mesafe 8 → Enter. Cep oluşur (taban yüzü Z = 12).
6. **Sketch** → yine üst yüz. **İzdüşüm** ile kenarları ekleyin. **Nokta** aracıyla bir nokta koyun; sol kenardan 10, alt kenardan 10 mm olacak şekilde **Ölçü** verin. Sonra **Dikd. desen** ile noktayı seçin: Adet (yön 1) 2, Adım (yön 1) 80, Adet (yön 2) 2, Adım (yön 2) 40, **Uygula**. Dört nokta (10,10), (90,10), (10,50), (90,50) olur ve cebin dışında kalır. (Desen noktayı kopyalamazsa dört noktayı tek tek ölçülendirin.) **Sketch'i Bitir**.
7. **Delik**: Eskiz = noktaların eskizi, Tip = **Düz**, Çap = 6.6, Kapsam = **Tümü (delip geçer)** → Enter.
8. **Özellikler** ile gövdeyi kontrol edin; Kaydet (Ctrl+S): `blok.mhnk`.

Ölçüm hatasını önlemek için **Ölç** ile cep tabanı ve delik konumlarını bir kez kontrol edin.

### 6.2 Tezgâh profili

1. **İmalat** sekmesi → **Tezgâh**.
2. **Genel 3 eksen (Fanuc tarzı)** satırında **Kopyala** (A eksenli bir iş için **Genel 3+1**); ad verin (örnek `Benim tezgâhım`). Elinizde bir tezgâh dosyası varsa **Dosyadan içe aktar** da kullanılabilir. Düzenleme penceresi açılır.
3. **Mil ve ilerleme**: **En yüksek devir** ve **En yüksek kesme ilerlemesi** değerlerini makine belgenizden yazın.
4. **Post**: **Güvenli Z çekilme yöntemi**'ni makine projenizin kararına göre seçin (G28 ya da G53; G53 ise makine Z'sini de yazın). Bu örnekte bekleme (G04) ve G54.1 kullanılmadığı için o alanlar boş kalabilir.
5. **Dokunulmaz** sekmesini gözden geçirin (makinenizde ayrılmış T/H/D numaraları ve iş sıfırları varsa yazın).
6. **Tamam**. Listede kendi profilinizin yanındaki işareti seçin → **Kapat**.

### 6.3 Takımlar

**Takımlar** → **Yeni takım**:

- **Takım 1**: Tür **Parmak freze (düz)**, Çap 10, Kesici boy 25, Tutucudan çıkıntı 45, **Merkezden keser: işaretli** (katalog doğruysa), Tutucu çapı/boyu girin. T numarasını program verir. **Kesme verisi** sekmesinde **Preset ekle** ve **kendi** devir/ilerleme değerlerinizi yazın.
- **Takım 2**: Tür **Matkap**, Çap 6.6, uç açısı 118°, Kesici boy 40, Tutucudan çıkıntı 60. T numarasını program verir (dokunulmaz listenizdeki numaralar atlanır; boş listede en küçük serbest numara). **Preset** ekleyin ve kendi değerlerinizi yazın.

### 6.4 Setup

1. **Yeni setup**. Ad: `Üst`.
2. **Gövdeler**: bloğu işaretleyin.
3. Z yönü **+Z (üstten)**, X yönü **+X (sağdan)**, Orijin **Stok köşesi** (Sol, Ön, Üst).
4. İş sıfırı: panel dokunulmaz listenizde olmayan ilk iş sıfırını seçer (liste boşsa G54). Seçilen sıfırı tezgâhta o bağlamaya göre ayarlayacağınızı unutmayın.
5. Stok: **Modelden pay**, yanlarda 2, üstte 2, altta 0. A ekseninde işle: **kapalı**.
6. Özet satırını kontrol edin: "Stok 104 × 64 × 22 mm". **Tamam**.

### 6.5 İşlemler

1. **Yüzey**: Takım 1. Ön ayarı seçin ya da devir/ilerlemeyi yazın. Pasolar: **Yanal adım** 6 (çaptan küçük), **Derinlik adımı** boş (tek paso, 2 mm). **Tamam**.
2. **Cep**: Takım 1. Geometri → **Yüz** → görünümde cebin **taban yüzünü** tıklayın. **Kesme yönü** Tırmanma. Pasolar: **Yanal adım** 4, **Derinlik adımı** 3, **Giriş türü** Rampa, **Giriş açısı** 2 (kendi seçiminiz), **Bitirme pasosu** isterseniz işaretleyip **Bitirme payı** 0,2 yazın. **Yolu hesapla** deyin: "Yol hesaplandı". Dik iç köşelerde Ø10 takım köşe yarıçapı 5 bırakır; program bunu "Cepte işlenemeyen … alan" uyarısıyla bildirebilir. Keskin köşe istiyorsanız daha küçük takımla ikinci bir cep işlemi ekleyin (Bölüm 5.6). **Tamam**.
3. **Delik delme**: Takım 2, **Çevrim**: Delme (ya da Gagalama, **Gagalama adımı** yazarak). Derinlik kaynağı **Delik ölçüsünden**. Delik listesinde 4 delik görünmeli. **Tamam**.

### 6.6 Hesapla, simüle et, post işle

1. **Yolu hesapla**: hepsi **Tamam** rozeti almalı.
2. **Simüle et**: **Oynat**. Cepte ve deliklerde stoğun oyulduğunu izleyin. **Sorunlar** sıfır olmalı. Delip geçen delikler için "stok tabanının altına" uyarısı çıkarsa, bu delik bildirilmiş boydan boya kesim olduğu için uyarıdır; altına levha koyduğunuzdan emin olun.
3. **Post işle**: Engel çıkarsa listeyi okuyun (en sık: boş en yüksek devir, boş güvenli Z yöntemi). Düzeltin, yeniden **Post işle**.
4. **NC kodu** penceresinde satırlara tıklayıp hareketleri görünümde izleyin. Başlıkta DOĞRULANMADI yazdığını görün.
5. **Kaydet (.nc)**.

### 6.7 Tezgâha gitmeden önce

- NC'yi okuyun: takım sırası, devirler, ilerlemeler, seçtiğiniz iş sıfırı (G54…G59), Z yükseklikleri.
- Kuru çalıştırma ve ilk parça işlemlerini **makine projesindeki prosedürle** yapın. Bu program o prosedürü içermez.
- Doğruladıysanız **Post: DOĞRULANMADI** düğmesinden beyanınızı kaydedin.

---

## 7. GÜVENLİK

Bu bölüm kılavuzun en önemli bölümüdür.

### 7.1 NC çıktısı "DOĞRULANMADI"dır

- Her NC dosyasının ilk satırı `(UNVERIFIED POST - DOGRULANMADI - MIHENK …)` olur. Bu satırı silmeyin.
- Post işlemcisi Mitsubishi M80V için yazıldı ve **gerçek tezgâhta denenmedi**. Bazı post değerleri bilinmiyor ve bilerek boş bırakılmıştır (Bölüm 5.2).
- Program NC'yi tezgâh kurallarına göre denetlemez. Yalnız **kendi iç tutarlılığını** sınar: NC'yi geri okuyup aynı hareketleri verip vermediğine bakar ve stok simülasyonu yapar.
- "Doğrulandı" beyanı sizin beyanınızdır; yazılım doğrulaması değildir.

### 7.2 Tezgâhta ilk çalıştırma programın işi değildir

Kuru çalıştırma, tek blok, ilk parça, takım boyu ölçüsü, iş sıfırı ölçümü gibi adımlar **makine projesinde** yapılır. Mihenk bunların yerine geçmez. Program yalnız "kuru çalıştırma yapın, ilk parçayı tek blokta izleyin" der.

### 7.3 A yönünü işaretli parçayla teyit edin

3+1 NC'de `A` kelimesi parçayı hangi yöne döndürür, makine profilindeki **Dönüş yönü** ayarına bağlı olarak hesaplanır. Şablondaki yön tezgâhınızda **doğrulanmamıştır**; profilinizdeki yönü kendi tezgâhınızda teyit edin. Yanlışsa takım yolu parçanın **yanlış yüzüne** gider. (Doğrulama çalışmasında benzer bir işaret hatası bulunup düzeltildi; ama profildeki yön tezgâhta teyit edilmediği için aynı türden risk sürer.)

Teyit (kısa özet; ayrıntılı prosedür makine projesindedir):

1. Bir parçanın bir yüzünü işaretleyin (örnek: boyayla, belirgin bir çentik).
2. Parçayı bağlayın, takım uzakken elle küçük bir pozitif A hareketi verin ve işaretli yüzün hangi yöne döndüğünü gözleyin.
3. Mihenk'teki **Dönüş yönü** ayarıyla karşılaştırın. Uyuşmuyorsa profili düzeltin ve NC'yi yeniden üretin.
4. 3+1 NC'yi ilk kez her zaman işaretli parçayla ve kuru çalıştırarak deneyin.

Ayrıca: WCS sıfırınız tezgâhta **A ekseni üzerinde** olmalıdır (Bölüm 5.5). Program bunu denetlemez.

### 7.4 Simülasyonun göremedikleri

Simülasyon **yalnız Z'nin üstünden** bakan tek değerli bir yükseklik haritasıdır. Şunları **görmez** ya da sınırlı görür:

| Konu | Durum |
|---|---|
| **Çözünürlük altı yan oyma** | Hücre aralığının yarısından küçük yanal oymalar görülmez (0,5 mm çözünürlükte 0,05–0,2 mm, 1,3 mm çözünürlükte 1 mm'ye kadar kaçırılmıştır). Her simülasyonda bu uyarı yazılır. Duvar doğruluğu simülasyondan değil takım yolu hesabından gelir. Bu sınır **ertelenmiştir**, kapatılmamıştır. |
| **Alt kesme / yan yönden kesme** | Yok. Altı oyuk parça, eğik duvarlı gövdeler simülasyonda doğru görünmez. |
| **A≠0 iken aynı setup içinde yan kesme** | Yok. |
| **Fikstür, mengene, tabla, punta** | **Modellenmez.** Takımın bunlara çarpmasını simülasyon göremez. Stok tabanının altına iniş engel sayılır, ancak mengene çenesi, bağlama ayağı gibi stok dışı cisimler yoktur. |
| **Tutucu** | Yalnız silindir olarak modellenir. |
| **Silindir stok** | Simülasyonda kutu olarak yaklaşıklanır. |
| **Hızlı hareketler** | Hücre merkezi örnekleme ile denetlenir. |
| **Stok görünümü** | Yalnız üst yüzey gösterilir (yan duvar yok). |
| **Takım boyu / kesici boyu** | Yalnız girdiğiniz değerler kadar bilinir; değerler yanlışsa denetim de yanlıştır. |

Bilinen ve **ertelenmiş** bulgular (CAM-VERIFY / CAM-FIXES):

- **Yanal oyma çözünürlüğü** (V-24): yukarıdaki tablo.
- **Cep köşe kalıntısı** (V-28): yüksek yanal adımda halka köşeleri arasında işlenmemiş bölge kalabilir. Program bunu "Cepte işlenemeyen … alan" ve "ulaşılamayan" uyarısıyla bildirir ama köşe temizleme hareketi üretmez.
- **Cep/iç kontur kesme yönü** (V-29): Cep ve iç konturda duvar örneklerinin çok küçük bir kısmı (özellikle yıldız/dambıl gibi şekillerde) istenen tırmanma/geleneksel yönün tersinde çıkmıştır. Nedeni incelenmedi. **Yüzey kalitesi önemli işlerde NC'yi okuyun.**
- **Program numarası** (V-21): Tezgâhınızda ayrılmış program numarası aralıkları denetlenmez.
- **Satır numarası** (V-22): N numaraları 99999'u aşarsa başa sarar (uyarı verir); M80V'de bu sınır teyit edilmedi.

### 7.5 Doğrulanamayanlar (tezgâh davranışı)

Aşağıdakiler yazılımla sınanamaz; makine projesinde işaretli parçayla teyit edilmelidir:

- A yönü ve A kelimesinin fiziksel anlamı
- Güvenli Z çekilme yöntemi (G28 / G53)
- G04 adres ve birimi
- N ve O numarası sınırları, tezgâha ayrılmış program numarası aralıkları
- G05 P10000 çıktısı
- Soğutma kodları: sis, hava, mil içi
- Aşınma telafisinde D'ye yarıçap mı yoksa yalnız aşınma mı yazılacağı

### 7.6 Bilinen sınırlar ve eksikler

Dürüst liste. Bu sürümde **yok ya da eksik** olanlar:

**CAM**
- Uyarlanır (adaptif) boşaltma ve 3B yüzey işleme yok (şeritte "yakında").
- 4. / 5. eksen tezgâhlar yok ("yakında"). Yalnız **3+1** vardır; **eşzamanlı 4 eksen yok**, TCP/G68.2/G07.1 yok.
- Setup panelinde eksen yönü için "yüzden seçim" yok (yalnız ana eksenler ±X, ±Y, ±Z); çekirdek destekler.
- Delik noktalarını eskizden vermek (`points`) ve açık zincir kontur seçimi arayüzde yok. (Delikler yalnız Delik özelliğinden gelir.)
- Kontur için helis dalma yok; cepte "önceden delme" girişi yok.
- Açık zincir kontur yalnız "Üzerinde"; giriş/çıkış, köprü, aşınma yok. Aşınma telafisinde kaba yanal paso, rampa, bölünen kontur yok.
- Gövde dış sınırı yalnız prizmatik gövdede çalışır.
- Eskiz profillerinde yalnız çizgi/yay/daire kullanılır. Elips ve spline profili takım yolunda hata verir ("Bu eğri türü … takım yolunda kullanılamıyor").
- Sketch seçimi takım eksenine dik düzlemde olmalıdır.
- Tezgâh üzerindeki parça konumu girilmediği için mutlak kurs denetimi yapılamaz.
- Fikstür/mengene/tabla çarpışması yok.
- Stok ağı yalnız üst yüzeyi gösterir.
- Simülasyon ana iş parçacığında çalışır; büyük programda arayüz kısa süre donabilir (ölçülmedi).
- Gerçek Electron penceresinde NC kaydı elle denenmedi.
- Teknik resim, montaj yok.

**CAD**
- Sweep, loft, draft, modellenmiş diş yok. Montaj yok.
- Kabuk, yuvarlatılmış kenarlı gövdede başarısız olabilir.
- Pah (Sketch) ölçü kısıtı eklemez. Spline teğeti ve elips–daire teğeti yok.
- İçe aktarılan STEP/STL düzenlenemez.

**Genel**
- Windows'ta kurulum dosyası Linux'ta üretildi; bu sürümde Windows'ta açılış, simge ve `.mhnk` ilişkilendirmesi, eski ayarların kopyalanması **gerçek Windows'ta doğrulanmadı**.
- Eskiz kipinde sol tarayıcı model ağacını gösterir ("Eskiz içeriği" listesi yok).
- Kurtarma, karşılama ekranındaki uyarı yerine modal onay olarak gelir.
- Arayüz metinlerinin bir kısmı hâlâ "Sketch" ve "Eskiz" karışık geçer.

### 7.7 Son söz

Yazılım size güvenli bir NC vermeyi hedefler: "ya doğru sonuç, ya açık hata". Ama hedef, garanti değildir. NC'yi okumadan, kuru çalıştırmadan ve ilk parçayı izlemeden üretime vermeyin.

---

## 8. Sorun giderme

Mesaj metinleri programdaki Türkçe metinlerdir. `{...}` yerine sayı/ad görürsünüz.

### 8.1 Kurulum ve dosya

| Mesaj | Anlamı | Ne yapın |
|---|---|---|
| Windows kişisel bilgisayarınızı korudu (SmartScreen) | Kurulum dosyası imzasız. | SHA-256'yı doğrulayın (1.1). Doğruysa **Ek bilgi → Yine de çalıştır**. |
| Bu dosya okunamadı: Mihenk belgesi değil ya da bozuk. | Dosya `.mhnk` değil ya da bozuk. | `.bak` dosyasını deneyin. |
| Bu belge daha yeni bir sürümle kaydedilmiş; bazı özellikler eksik olabilir. | Belge daha yeni Mihenk ile yazılmış. | Yeni sürümü kurun. |
| Belgede çok uzun bir değer var / çok fazla öğe var / Dosya çok büyük (en fazla 200 MB) | Dosya güvenlik sınırlarını aşıyor ya da bozuk. | Dosyanın kaynağını kontrol edin. |
| "…" içe aktarmasının verisi bozuk (özet uyuşmuyor). | İçe aktarılan STEP/STL verisi bozulmuş. | Dosyayı yeniden içe aktarın. |
| Kaydedilemedi: … Başka bir konuma kaydetmeyi deneyin. | Yazma izni ya da disk sorunu. | Başka klasör/sürücü seçin. |
| Kurtarma dosyası bulundu | Önceki oturum kapanmadan kalmış. | **Kurtar**, hemen kaydedin. |

### 8.2 Sketch ve model

| Mesaj | Anlamı | Ne yapın |
|---|---|---|
| Bu … mevcut kısıtlarla çelişiyor; eklenmedi. Çelişen kısıtı silin ya da farklı bir değer girin. | Eklemeye çalıştığınız ölçü/kısıt öncekilerle çelişiyor. | Çelişen kısıtı silin ya da değeri değiştirin. |
| Bu … zaten başka kısıtlarla belirlenmiş (gereksiz); eklenmedi. | Nesne zaten tam tanımlı. | Kısıt gerekmez. |
| Sketch çözülemedi | Kısıtlar çözülemiyor. | Son eklediğiniz kısıtı geri alın (Ctrl+Z). |
| Profil kendini kesiyor ya da çizgiler bölünmeden kesişiyor | Çizgiler kesişiyor. | **Buda** ya da **Böl** ile düzeltin. |
| Sketch'te üst üste çizilmiş … yinelenen eleman var | Aynı çizgi iki kez çizilmiş. | Fazlasını silin. |
| Profilde çok kısa kenar var | Çok kısa çizgi kalmış. | Kısa çizgiyi silin. |
| Sketch içinde kapalı profil yok | Çizim kapanmamış. | Açık uçları birleştirin. |
| Seçilen profil artık yok (sketch değişti); özelliği düzenleyip profili yeniden seçin | Eskiz değişince profil kayboldu. | Extrude'u düzenleyip profili yeniden seçin. |
| Seçilen yüz model değişince kayboldu; özelliği düzenleyip yeniden seçin | Yuvarlat/Pah/Kabuk seçimi geçersiz. | Özelliği düzenleyip yeniden seçin. |
| Yuvarlatma başarısız: değer bu kenarlar için fazla büyük olabilir | | Değeri küçültün. |
| Kabuk başarısız … | | Kalınlığı küçültün ya da kabuğu yuvarlatmadan önce uygulayın. |
| Profil dönüş eksenini kesiyor | Revolve profili eksenin iki yanında. | Profili eksenin bir tarafına alın. |
| … delik konumu malzemeye değmiyor | Delik yeri/yönü yanlış. | Konumu ya da yönü düzeltin. |
| Önce bir sketch çizin … | Extrude/Delik için eskiz yok. | Sketch'i çizip bitirin. |

### 8.3 İmalat: hesap ve post

| Mesaj | Anlamı | Ne yapın |
|---|---|---|
| Tezgâh profili seçilmedi. Tarayıcıdan bir tezgâh seçin. / Tezgâh profili bulunamadı. | Belgedeki tezgâh bu bilgisayarda yok. | **Tezgâh** → profil seçin. |
| Eksik bilgi: {alan}. Bu bilgi girilmeden NC üretilmez. | Kapı 1. Alan boş. `machine.spindle.maxRpm` → en yüksek devir; `machine.feed.maxCut` → en yüksek kesme ilerlemesi. | Tezgâh profilinde alanı doldurun. |
| Post özelliği boş: {özellik}. Makine profilinde bu değeri makine belgesinden doldurun; tahmin edilmez. | Post bir değeri bilmiyor (örnek `safeRetract`). | Tezgâh → Post sekmesinde doldurun. |
| Güvenlik kapıları bu programı engelliyor … | Bir ya da daha çok engel var. | Sorun listesini okuyun. |
| {T}{n} dokunulmaz listede (mevcut iş korunuyor). Başka numara seçin. | Kapı 2. | Takım/H/D/iş sıfırı numarasını değiştirin. |
| Devir ({}) makinenin en yüksek devrini ({}) aşıyor. | Kapı 3. | Devri düşürün. |
| İlerleme (… mm/dk) makine sınırını aşıyor. | Kapı 3. | İlerlemeyi düşürün. |
| T{n} merkezden kesmiyor ama malzemeye düz dalıyor. Helis ya da rampa girişi kullanın. | Kapı 4. | Merkezden kesen takım ya da rampa. |
| T{n} merkezden kesmiyor ve malzemeye rampa/helisle iniyor, ama takımda en büyük rampa açısı tanımlı değil. | Kapı 4; takımda **En büyük rampa açısı** boş. | Üretici değerini takım düzenleyicide girin ya da merkezden kesen takım kullanın. |
| T{n} merkezden kesmiyor ve {a}° ile rampa yapıyor; en büyük rampa açısı {b}°. | Kapı 4. | Açıyı küçültün. |
| Bir pasonun derinliği (…) kesici boyunu (…) aşıyor. Paso derinliğini azaltın. | Kapı 4. | Derinlik adımını küçültün ya da Kesici boyu'nu doğrulayın. |
| Takım tutucudan çıkan boy (…) bu derinliğe (…) yetmiyor: tutucu stoka çarpar. | Kapı 4. | Daha uzun çıkıntı. |
| {Eksen} ekseninde yol açıklığı … makine kursunu … aşıyor. | Kapı 3. | Parçayı/setup'ı küçültün ya da bölün. |
| "…" için makine üzerindeki konum verilmedi: mutlak kurs denetimi yapılamadı. | Uyarı. | Kursu kendiniz kontrol edin. |
| "…" için model yükseklik haritası yok: oyma denetlenemez. NC üretilmez. | Kapı 5. | Modeli yeniden hesaplayın; sürerse hatayı bildirin. |
| Simülasyon çözünürlüğü … en küçük takım yarıçapından … kaba … | Kapı 5. | Stok çok büyük ya da takım çok küçük; stoğu küçültün. |
| Hızlı hareket stok içine giriyor (…) | Hızlı hareket malzemenin içinden geçiyor. | Güvenli yükseklik/geri çekilmeyi artırın. |
| Takım model yüzeyinin altına iniyor: oyma (…) | Takım yolu modeli oyuyor. | İşlemin yükseklik, pay, taraf ayarlarını kontrol edin. |
| Kesme boyundan derin kesiliyor (…) | | Derinlik adımı / takım. |
| Takım şaftı stoğa çarpıyor / Tutucu stoğa çarpıyor (…) | Takım çıkıntısı yetmiyor. | Daha uzun çıkıntı, daha küçük derinlik. |
| Takım ham parçanın tabanının altına iniyor (…) | Stok tabanı altına iniş. | Alt yüksekliği düzeltin. Boydan boya delik/kesim bilinçliyse "Alt" değerini ya da delik taşmasını kontrol edin. |
| Telafili yayın yarıçapı takım yarıçapından küçük (…) | Aşınma telafisi. | Bilgisayarda telafi ya da küçük takım. |
| A açısı ({a}°) makine sınırları dışında. | Kapı 6. | Açıyı ya da profil sınırını düzeltin. |
| Bu setup A ekseni istiyor ama makine profilinde döner eksen yok. | | A'lı tezgâh profili seçin. |
| Seçilen yüz düz değil ya da takım eksenine dik değil. | Yüz eğik/eğri. | Takım eksenine dik düz yüz seçin. |
| Takım (Ø…) bu cebe/kontura sığmıyor. Daha küçük takım seçin. | | Daha küçük takım. |
| Helis girişi sığmıyor (gereken Ø…, olan Ø…) | | Helis çapını küçültün ya da rampa seçin. |
| Cepte işlenemeyen yaklaşık … mm² alan kalıyor | Dar köşeler. | Daha küçük takımla ikinci işlem. |
| Cepte takımın ulaşamadığı geniş bir bölge var | | Daha küçük takımla ayrı işlem. |
| Sınır kendini kesiyor; bölge belirsiz. | Eskiz/yüz kendini kesiyor. | Sketch'i düzeltin. |
| "…" işleminde eksik bilgi: {alan} | Devir, ilerleme, giriş açısı vb. boş. | İşlem panelinde alanı doldurun. |
| Yan adım (…) takım çapından (Ø…) küçük olmalı. | | Yanal adımı küçültün. |
| Bu setup'ta delinecek delik yok … | Delik seçimi boş. | Modelde Delik özelliği ekleyin; süzgeçleri kontrol edin. |
| Stok modeli içine almıyor. | | Stok ölçülerini büyütün. |
| Gövde takım ekseni boyunca düz duvarlı değil … | "Gövde dış sınırı" prizmatik değil. | Yüz ya da eskiz seçin. |
| Kesim üstü (…) geri çekilme düzleminin (…) altında olmalı. | Yükseklik sırası yanlış. | Üst ya da güvenli yüksekliği düzeltin. |
| İş mili devri … NC'ye S0 olarak yazılırdı | Devir 1'in altında. | Devri yükseltin. |
| NC satırı …: … (okuyucu hataları) | İç tutarlılık denetimi NC'de tanımadığı bir şey gördü. | Hatayı bildirin; NC'yi kullanmayın. |
| Takım yolu verisi geçersiz / İç hata: üretilen takım yolu geçersiz | Program içi hata. | Yeniden hesaplayın; sürerse bildirin. |

### 8.4 Genel

- 3B görünüm açılmıyor ("3B görünüm başlatılamadı"): Ekran kartı sürücüsünü güncelleyin.
- "Geometri çekirdeği yüklenemedi": Uygulamayı kapatıp yeniden açın.
- "Geometri çekirdeği beklenmedik şekilde durdu; yeniden başlatıldı": İşlemi tekrar deneyin.
- Hesaplama uzun sürerse durum çubuğundaki **İptal et**'e basabilirsiniz; sonuç "güncel değil" işaretlenir.
- Bozuk bir `.mhnk` için yanındaki `.bak` dosyasını açın.

---

## 9. Kısayollar

### Genel

| Tuş | İş |
|---|---|
| Ctrl+N | Yeni |
| Ctrl+O | Aç |
| Ctrl+S | Kaydet |
| Ctrl+Shift+S | Farklı Kaydet |
| Ctrl+Z / Ctrl+Y | Geri Al / Yinele (Ctrl+Shift+Z de yineler) |
| Ctrl+K | Komut ara |
| Ctrl+, | Ayarlar |
| F | Görünümü sığdır |
| Enter / Esc | Panelde Tamam / İptal |
| Çift tık | Zaman çizelgesinde düzenle |
| Sağ tık | Zaman çizelgesi menüsü |

### 3B görünüm

| Hareket | İş |
|---|---|
| Sağ tuş sürükle | Döndür |
| Orta tuş sürükle | Kaydır |
| Tekerlek | Yakınlaştır |

### Sketch

| Tuş | Komut |
|---|---|
| L | Çizgi (zincirde A: teğet yay, L: çizgi) |
| R / Shift+R | Dikdörtgen / Merkez dikd. |
| C / Shift+C | Daire / 3 nokta daire |
| A / Shift+A | Yay / 3 nokta yay |
| P | Nokta |
| D | Ölçü |
| T | Buda |
| X | Uzat |
| K | Böl |
| O | Ofset |
| Q | Köşe yuvarlat |
| W | Pah |
| M | Ayna |
| G | Çokgen |
| U | Kanal |
| Y | Elips |
| B | Eğri (spline) |
| J | İzdüşüm |
| Ctrl+A | Tümünü seç |
| Ctrl+C / Ctrl+X / Ctrl+V | Kopyala / Kes / Yapıştır |
| Delete (ya da Backspace) | Seçileni sil |
| Esc | Açık araç / diyalog / seçim kapatır |
| Enter | Eğriyi bitirir; ayna'da İleri |
| Tab | Sayısal girişte sonraki alan |
| Ctrl (basılı) | Izgaraya yakalamayı kapatır |

Araç ipucunda (fareyi tutunca) kısayol da yazar.

### İmalat

İmalat komutlarının tuş kısayolu yoktur. Ctrl+K ile adını yazarak çalıştırabilirsiniz (örnek: "Post işle"). NC listesinde Yukarı/Aşağı ok tuşları satır gezdirir.
