# Geçmiş: zaman çizelgesi + ürün ağacı tasarımı (WP-02, K-028)

## Bugünkü durum (0.3.0) ve sorunlar
Altta tek sıra çip (sıra no + ad), sağ tık menüsü (düzenle, adlandır, bastır, sil, geri sar), geri sarma işaretçisi. Solda gövde ve eskiz listesi.
1. Bir işlemi değiştirince **neyin etkileneceği önceden görülmüyor**; sonuç ancak hata çıkarsa (kırmızı çip) anlaşılıyor.
2. Ortadaki işlem düzenlenirken model son haliyle görünüyor; o işlemin kendi anındaki geometri görünmüyor.
3. Güncelleme sonrası "ne değişti, ne aynı kaldı, ne uyarı verdi" ayrımı yok; yalnız başarılı / hatalı.
4. Hatalı işlemin onarımı için yol yok (kaybolan kenar/yüz gösterilmiyor).
5. Sıra değiştirme yok. Eskiz ve onu kullanan işlem ayrı çipler: şerit iki kat uzun.
6. Çipte parametre görünmüyor; "Extrude 3" neydi diye açıp bakmak gerekiyor.

## Tasarım ilkesi
Geçmiş bir kayıt listesi değil, **neden-sonuç zinciridir**. Arayüz her an üç soruyu yanıtlar: bu işlem neye dayanıyor, neyi etkiliyor, son güncellemede ona ne oldu.

## Karar (O-033, 2026-11-20)
Ölçütler ve sonuç:
| Soru | Seçenekler | Ölçüt | Karar |
|---|---|---|---|
| Ana görünüm nerede? | alt şerit (Fusion) · sol dikey liste (SolidWorks, NX, Onshape, Inventor) · ikisi eşit | 50+ işlemde ölçeklenme, ad + parametre okunurluğu, başka programdan gelen kullanıcının alışkanlığı, aynı işi iki yerde yapma karmaşası | **Sol dikey liste ana görünüm**: bütün eylemler (düzenle, sırala, onar, grupla) burada. Dikey liste uzun adı ve parametre özetini taşır, dikey kaydırma doğaldır; dört büyük programın üçünde yer burasıdır. |
| Alt şerit kalsın mı? | kaldır · tam özellikli · özet | geniş ve boş alt alanın kullanımı, geri sarmada "zaman" hissi, tekrar | **Özet olarak kalır**: adsız, simge + durum işareti; tıkla = seç, işaretçiyi sürükle = geri sar. 60+ işlem tek satıra sığar. Düzenleme eylemleri şeritte yoktur (tekrar olmasın). |
| Sekme mi, tek panel mi? | "Gövdeler / Geçmiş" sekmeleri · tek panelde iki bölüm | sekme değiştirirken bilgi kaybı | **Tek panel**: üstte kısa Gövdeler bölümü, altında Geçmiş. Sekme yok. |
| Eskiz kaynaşması | hep ayrı (Fusion, Onshape) · işlemin altında (SolidWorks) | liste uzunluğu, eskizi bulabilme, paylaşılan eskiz | **Tek işlemin kullandığı eskiz o işlemin altına girer** (satır açılır, eskiz çocuk satır; çipte rozet). İki ve daha çok işlemin kullandığı ya da henüz kullanılmamış eskiz ayrı satırdır. Liste yarıya iner, eskiz kaybolmaz. |
| "Son hali göster" | hep açık · hep elle · uyarlamalı | bekleme süresi, sürpriz hatanın önlenmesi | **Uyarlamalı**: son güncellemesi 1 sn altında süren modelde kendiliğinden açık, yavaş modelde düğmeyle. |
| "Değişti" işaretleri | kalıcı · yok · geçici | gürültü | **Geçici ve silik**: bir sonraki düzenlemede silinir; uyarı ve hata kalır. |
Kullanıcı açısından değerlendirme: düzenlerken geri sarma ve bağımlı işlemlerin yeniden hesaplanması bütün parametrik CAD programlarının ortak davranışıdır, yani öğrenme yükü getirmez. Yeni olan iki şey (etki alanını önceden görmek, güncelleme sonrası tek özet + onarım) mevcut programlarda menü arkasında ya da hiç yoktur ve en sık yaşanan sorunu, "bir ölçüyü değiştirdim, model kırıldı, neden?" durumunu hedefler.
Aşağıdaki bölümlerde "şerit" ile "panel" arasında çelişki olursa bu karar geçerlidir.

## Yerleşim: tek veri, iki görünüm
- **Şerit (alt)**: zaman sırası, kompakt. Göz atma, geri sarma, sıra değiştirme.
- **Geçmiş paneli (sol, "Gövdeler" sekmesinin yanında "Geçmiş" sekmesi)**: aynı liste dikey; ad + parametre özeti ("Extrude · 14 mm · Kes", "Delik · Ø5,5 · Tümü", "Yuvarlat · R1 · 4 kenar"). Okuma ve yeniden adlandırma.
İkisi aynı seçimi, aynı durumu paylaşır. Dar ekranda panel kapatılır, şerit kalır.

## Çip yapısı
`[simge] [ad] [özet]` + durum işareti. Sıra numarası kaldırılır (konum zaten sırayı gösterir); adın altında ince **hesap süresi çubuğu** (yavaş işlem bulunur).
- **Eskiz kaynaşması**: tek işlem tarafından kullanılan eskiz ayrı çip olmaz, işlem çipinin solunda küçük eskiz rozeti olur (rozete çift tık = eskizi düzenle). Birden çok işlemin kullandığı eskiz ayrı çip kalır.
- **Gruplar**: kullanıcı ardışık işlemleri adlandırılmış gruba toplar ("Delikler", "Pahlar"); grup tek çipe katlanır, durum rozetleri toplanır.

## Durumlar (renk tek kanal değildir: simge + desen + metin)
| Durum | Görünüm |
|---|---|
| Normal | düz çip |
| Seçili | vurgulu kenarlık |
| Düzenleniyor | dolu vurgu + "düzenleniyor" etiketi |
| Bekliyor (işaretçinin sağında) | soluk, kesik kenarlık |
| Bastırılmış | çapraz tarama + üstü çizili ad |
| Hesaplanıyor | ilerleme çizgisi |
| Güncellendi: değişti | mavi nokta (son güncellemede sonucu değişti) |
| Güncellendi: aynı | işaret yok |
| Uyarı | sarı üçgen (referans yeniden eşlendi, belirsizlik çözüldü, etkisiz kaldı) |
| Hata | kırmızı ünlem + neden satırı |
"Değişti / uyarı" işaretleri bir sonraki düzenlemeye kadar kalır; "Temizle" ile silinir.

## Bağımlılık görünümü (özgün kısım)
Bir çip seçilince ya da üstüne gelince:
- **Dayandıkları** (ata) çiplerin altına yukarı ok çizgisi, **etkiledikleri** (torun dahil) çiplerin altına dolu çizgi; ilgisizler soluklaşır.
- Durum çubuğunda özet: "Extrude 2 → 5 işlemi etkiler (2 delik, 2 yuvarlat, 1 pah)".
- 3B görünümde o işlemin ürettiği yüzler hafifçe boyanır.
Veri hazır: `features.js dependsOn/dependents` (eskiz, yüz/kenar referansı, gövde hedefi). Geçişli kapanış arayüzde hesaplanır.

## Ortadan düzenleme akışı (K-028'in özü)
1. Çipe çift tık → model **o işlemin anına** otomatik geri sarılır (işlem dahil), sağdaki çipler "bekliyor" olur. Panel açılır. Kullanıcı o andaki gerçek geometri üzerinde seçim yapar.
2. Panelde **"Son hali göster"** anahtarı: açıkken değişiklik arka planda sona kadar hesaplanır (çekirdek önbelleği yalnız değişen işlemden sonrasını yeniden hesaplar; 250 ms bekleme, iptal edilebilir) ve son model yarı saydam üst üste gösterilir. Kullanıcı Tamam'a basmadan tasarımın nasıl güncelleneceğini görür; kırılacak işlemler şeritte önceden sarı/kırmızı yanar.
3. Tamam → şeritte soldan sağa **güncelleme süpürmesi**: her çip sırayla hesaplanır ve durumunu alır. Hata güncellemeyi durdurmaz; hatalı işlem atlanır, kalanlar denenir (bugünkü çekirdek davranışı), hepsi işaretlenir.
4. Bitince tek özet bildirimi: "6 işlem güncellendi · 2 değişti · 1 uyarı · 1 hata: Yuvarlat 3 — kenar bulunamadı" + **Onar** düğmesi. İşaretçi otomatik sona döner (önceki konumu sondaysa).
5. İptal → belge ve işaretçi düzenleme öncesine döner; hiçbir şey hesaplanmış kalmaz.
6. Geri al (Ctrl+Z) tüm düzenlemeyi tek adımda geri alır.

## Onarım akışı
Hatalı çipe tık → panel "Onarım" kipinde açılır: kaybolan referans son geçerli geometriden **hayalet** olarak (kesik çizgi) gösterilir, yanında adaylar vurgulanır; kullanıcı yeni kenar/yüzü tıklar. Seçenekler: yeniden seç · bastır · sil. Birden çok hata varsa "sonraki hata" ile sırayla gezilir. Veri: çekirdeğin `ref.lost_*` / `ref.ambiguous_*` hata parametreleri ve işlemin son başarılı sonucu (önbellekte tutulacak).

## Geri sarma ve araya ekleme
- İşaretçi sürüklenebilir tutamaktır; Alt+←/→ bir adım, Alt+Home/End başa/sona. İşaretçi sonda değilken şerit üstünde kalıcı bant: "Geçmişin ortasındasınız — yeni işlem buraya eklenir · Sona git".
- Araya eklenen işlem sonrası aynı güncelleme süpürmesi ve özet çalışır.

## Sıra değiştirme
Çip sürüklenir; bırakılabilecek aralıklar yeşil, bağımlılığı bozacak aralıklar kapalı ve nedeni ipucunda ("Delik 1, Eskiz 3'e dayanıyor"). Klavye: Alt+Shift+←/→.

## İmalat ile bağ
Model güncellemesi takım yollarını eskitirse özet bildirimine eklenir: "3 takım yolu eskidi" → İmalat'a geçince "Tümünü yeniden hesapla".

## Erişilebilirlik ve HMI
Hedef boyu en az 32 px (büyük yoğunlukta 40). Tüm eylemler klavyeyle: F2 adlandır, Enter düzenle, Del sil, Ctrl+B bastır. Durumlar ekran okuyucuya metinle bildirilir. TR/EN.

## Uygulama dilimleri (WP-02)
1. Çekirdek çıktısı: işlem başına `changed` (sonuç özeti karşılaştırması), `warn[]`, `ms`; son başarılı sonuç referansı. (kernel, O)
2. Şerit + Geçmiş paneli: yeni çip, durumlar, eskiz kaynaşması, parametre özeti, bağımlılık vurgusu. (ui, S)
3. Düzenleme akışı: otomatik geri sarma, "Son hali göster", süpürme, özet bildirimi, iptal/geri al. (ui + worker iptali, S)
4. Sıra değiştirme, gruplar, klavye. (ui, S)
5. Onarım kipi. (ui + kernel, S/O)
Her dilim ayrı commit ve test; 1–3 birlikte 0.3.1'e, 4–5 0.4'e kayabilir.

## Kabul listesi
- 12 işlemli örnek parçada 3. işlemin ölçüsü değişir: düzenleme sırasında model 3. işlem anında görünür; "Son hali göster" son modeli gösterir; Tamam sonrası etkilenen çipler "değişti", etkilenmeyenler işaretsiz.
- Bir yuvarlatmanın kenarını yok eden değişiklik: özet bildiriminde hata, Onar ile yeni kenar seçilir, parça tamamlanır.
- Bağımlılığı bozacak sıra değişikliği arayüzde yapılamaz.
- Eski `.mhnk` belgeleri değişmeden açılır (belge şeması yalnız isteğe bağlı `groups` alanı kazanır).
- Mevcut `data-testid` değerleri (`chip`, `tl-end`, `tl-marker`) korunur; app/ui testleri geçer, yeni akış için testler eklenir.
