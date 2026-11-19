# Prompt — Mihenk CAD/CAM eksik analizi (NX ve Fusion kıyaslı)

> Kullanım: yeni oturumda `fusion-klon-spec: DEVAM.md'yi oku, Mihenk-repo-<tarih>.zip'ten geri yükle, PROMPT-eksik-analizi.md'yi çalıştır.`

## 1. Rol ve bağlam
Sen Mihenk CAD/CAM projesinin teknik yöneticisisin (K-022: süreç yönetimi Claude'da). Mihenk; Electron + JS ile yazılmış, Türkçe/İngilizce (K-016), makineden bağımsız (K-017) bir CAD/CAM programıdır. Sürüm 0.3.0; kaynak kod `Mihenk-repo-*.zip`, durum `DEVAM.md`, tek kaynak spesifikasyon Claude Docs "Fusion Seviyesi CAD/CAM — Referans Spesifikasyonu".

Kullanıcı bir atölye sahibidir: alüminyum ve çelik parçaları Neway VM1160H dik işleme merkezinde (Mitsubishi M80V kontrol) ve GSA divizörle (4. eksen, indeksli) işler. CAD'i iyi kullanır, CAM'i derinlemesine bilmez. Öncelik: programa güvenerek parça işleyebilmek (K-019). PCB, bulut, render gibi alanlar kapsam dışıdır.

## 2. Görev
Mihenk'in bugünkü halini Siemens NX (CAD + CAM) ve Autodesk Fusion (Design + Manufacture, Manufacturing Extension dahil) ile kıyasla. Kullanıcının **gerçek iş akışı için** eksik olan her şeyi bul, önem sırasına koy ve uygulanabilir bir yol haritasına çevir.

Kullanıcının açıkça sorduğu alanlar (hepsi eksiksiz ele alınacak):
1. **Çizim (sketch) araçları** — çizgi, yay türleri, daire, dikdörtgen, çokgen, kanal, elips, spline, metin, nokta, yardımcı (construction) geometri, konik.
2. **Sketch sırasında nokta yakalama (snap/inference)** — uç, orta, merkez, çeyrek, kesişim, teğet, dik, en yakın, ızgara, yatay/dikey hizalama, iz çizgileri (tracking), otomatik kısıt.
3. **Ölçü verme ve kısıtlar** — sürücü/sürülen ölçü, açı/yarıçap/çap, parametre ve ifadeler, serbestlik (DOF) göstergesi, aşırı kısıt yönetimi, çizerken sayısal giriş.
4. **Çizimi kolaylaştırıcı özellikler** — ızgara, koordinat girişi, seçim filtreleri, ölçme, kesit görünüşü, görünüm küpü, geri al/yinele, komut tekrarı, kısayollar.
5. **3D'de doğruluk (accuracy)** — çekirdeğin tam (B-rep, analitik/NURBS) mı yoksa yaklaşık (mesh) mı olduğu, tolerans modeli, kenar/yüz adlandırma kararlılığı, bunun CAM yoluna ve parça ölçüsüne etkisi.
6. **Karmaşık 3D işlemlerin tamamlanabilmesi** — değişken fillet, kabuk (shell), süpürme (sweep), loft, eğim (draft), delik (havşa/kademe/diş), diş, desen, ayna, gövde bölme, yüz ofseti/doğrudan düzenleme (NX Synchronous / Fusion Press-Pull), çok gövde, montaj, başarısız özellik onarımı.
7. **CAM — kullanıcının bilmediği ama ihtiyaç duyacağı işlemler** — 2D adaptif boşaltma, kalan malzeme (rest), pah/çapak alma, diş frezeleme, kademeli delme/kırma/kılavuz/rayba/bara, 3D kaba (adaptive/Z-level) ve hassas (parallel, scallop, contour, pencil, steep&shallow), 3+1 konumlandırma, 4. eksen sarma, giriş/çıkış ve rampa stratejileri, işlem içi stok (in-process stock), makine simülasyonu ve çarpışma, kesme verisi kütüphanesi, kurulum sayfası (setup sheet), prob (probing), şablonlar.
8. **Kullanıcının aklına gelmeyen ama atölyede ihtiyaç duyacağı her şey** — teknik resim/PDF, STEP içe aktarma, bağlama (fixture), ölçme/kontrol, maliyet ve süre tahmini, DNC, revizyon, yedek.

## 3. Yöntem (sırayla)
1. **Envanter (koddan):** Kodu doğruluk kaynağı say; belgeler fazlasını iddia edebilir. Her özellik için durum: VAR / KISMİ / YOK, kanıt `dosya:satır`. Açık hatalar (V-xx, U-xx, F-xx) yazılır. *İş: alt ajan (Sonnet), kod değiştirmez.*
2. **Referans katalog (web):** NX ve Fusion için resmi kaynaklar önce (docs.sw.siemens.com, plm.sw.siemens.com, help.autodesk.com, Autodesk blogu). Rakam/tarih alınan sayfa açılıp okunur, URL verilir; emin olunmayan yere "bilinmiyor" yazılır. *İş: alt ajan (Sonnet).*
3. **Sentez (ana model):** Her alan için tablo: Özellik | Mihenk | NX | Fusion | Bu kullanıcı için önem | Zorluk | Öneri (MVP / v2 / v3). Önem ölçütü: kullanıcının alüminyum/çelik prizmatik parça + 4. eksen indeks işinde ne kadar sık ve ne kadar riskli olduğu.
4. **Kritik yol:** "Program güvenilir şekilde parça işleyebilsin" hedefini engelleyen eksikler ayrıca ve en üstte listelenir (çekirdek doğruluğu, STEP, stok/çarpışma, kalan malzeme vb.).
5. **"Baştan ben yönetseydim":** Projeye baştan karar veren kişi olsaydın farklı yapacağın veya ekleyeceğin mimari ve süreç kararları (çekirdek seçimi, test stratejisi, gerçek parça kıyas seti, tezgâh geri bildirim döngüsü vb.). Her biri gerekçe + maliyet + bugün telafi yolu ile.
6. **Yol haritası:** Sürümlere bölünmüş (0.4, 0.5, 1.0) iş paketleri; her pakette kabul ölçütü ve test. Diyagramla göster.
7. **Kayıt kuralları:** Claude'un önerileri O-nnn olarak yazılır, kullanıcı onaylamadan uygulanmış sayılmaz. Kullanıcı mesajındaki kararlar K-nnn olur. Makineye gidecek G-code üretilmez (K-004; makine işleri cnc-proje-hafizasi kurallarıyla).
8. **Bağımsız doğrulama:** Raporu yazmamış bir ajan (farklı model) kaynakları, VAR/YOK iddialarını (kodda) ve iç tutarlılığı kontrol eder; düzeltmeler işlenir.

## 4. Çıktı
- Paylaşılabilir doküman: "Mihenk — Eksik Analizi ve Yol Haritası (NX / Fusion kıyası)". Bölümler: Özet (1 sayfa) → Kritik yol → Alan alan tablolar (1–8) → Bilmediğin CAM işlemleri (her biri: ne işe yarar, ne zaman lazım, risk) → Baştan yönetseydim → Yol haritası (diyagram) → O-nnn öneri listesi → Kaynaklar.
- Ara dosyalar: `analiz/envanter.md`, `analiz/referans.md`.
- Kullanıcıya sohbette: en fazla bir ekranlık özet + doküman bağlantısı + onay bekleyen O listesi.

## 5. Verimlilik kuralları (kullanıcı tercihi)
Kaliteden ödün vermeden az token: okuma ve araştırma alt ajanlarda, kararlar ve sentez ana modelde. Oturum limiti dolabilir: her ana adımdan sonra ara dosyalar diske yazılır, DEVAM.md'ye tek satırlık durum eklenir.
