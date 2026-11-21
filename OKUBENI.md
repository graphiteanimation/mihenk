# Mihenk CAD/CAM 0.6.0

Parametrik CAD/CAM programı. Makineden bağımsızdır; kendi tezgâh profilinizi eklersiniz. Dosya uzantısı `.mhnk`.

**NC çıktısı makinede DOĞRULANMAMIŞTIR.** Her programı önce simülasyonda ve makinede havada, tek blok ile deneyin. A ekseni yönü, 3+2 eğik düzlem (G68.2) ve 4. eksen sarma (G93 ters zaman ilerleme, sürekli A kelimesi) çıktıları makinede teyit edilmedi. Ayrıntı: kılavuzun GÜVENLİK bölümü.

## Kurulum
1. `Mihenk-Kurulum-0.6.0.exe` dosyasını çalıştırın. Yönetici izni istemez; `%LOCALAPPDATA%\Programs\Mihenk` altına kurulur.
2. Dosya imzasızdır. SmartScreen uyarırsa: "Ek bilgi" → "Yine de çalıştır".
3. Çalıştırmadan önce dosyanın SHA-256 değerini `SHA256SUMS.txt` içindeki satırla karşılaştırın (PowerShell: `Get-FileHash .\Mihenk-Kurulum-0.6.0.exe`). Değerler aynı değilse dosyayı kullanmayın.

## İlk çalıştırma
1. Dil ve tema seçin (Türkçe / English).
2. İmalat çalışma alanında **Tezgâh** ile kendi tezgâh profilinizi ekleyin (bir şablonu kopyalayıp doldurun ya da dosyadan içe aktarın). Genel şablonlardaki boş alanları doldurmadan post çalışmaz; bu bilerek böyledir.
3. Kayıt otomatik alınır (60 sn); önceki sürüm `.mhnk.bak` olarak saklanır.

## Kılavuz
Adım adım kullanım, örnek parça, güvenlik kapıları ve sorun giderme:
- Türkçe: `docs/KILAVUZ.md`
- English: `docs/MANUAL.md`

## Yenilikler (0.4–0.6)

**0.6**
- 2D uyarlanır kaba: kalan malzeme (rest), açık kenar, ince duvar; yatay temizleme; köşede ve çıkışta ilerleme düşürme.
- 3B kaba ve bitirme: Z-seviye, paralel, sabit tepe, kalem izi.
- 4. eksen sarma: sarılmış kontur, sarılmış cep, radyal delme.
- 3+2 eğik düzlem işleme (G68.2): tezgâh profilinde kinematik zincir, setup'ta yüz, vektör ya da açı ile eğim.
- Teknik resim: görünüş, kesit, detay, ölçü, ISO 286 tolerans, delik tablosu, PDF ve DXF, ilk parça kontrol formu.
- Modelleme: sweep, loft, draft, kaburga, değişken yuvarlatma, helis, modellenmiş diş, IGES içe ve dışa aktarma.
- PDF altlık: eskize PNG, JPEG ya da vektör PDF koyup iki noktayla ölçeklendirme.

**0.5**
- Bağlama gövdeleri (kutu, silindir, STEP mengene) ile çarpışma denetimi; gerçek tutucu profili.
- Üç yönlü simülasyon (isteğe bağlı, varsayılan kapalı).
- İşlem şablonları, delik sıra şablonu, G76/G87 delme çevrimleri, teklif yardımcısı, inç birimi (G20).
- Mengenede çoklu parça: NC üretiminde kopyalar.

**0.4**
- Yerleşik tezgâh markası kaldırıldı; genel şablonlar (3 eksen Fanuc, 3 eksen Mitsubishi, 3+1 A) ve tezgâh profili içe/dışa aktarma.
- Setup'lar arası stok ve delikler: önceki setup'tan stok, delik tanıma, delme çevrimi gruplaması.
- 2D: pah işlemi, açık kontur, diş frezeleme, dairesel ve bore frezeleme, kanal, kesme verisi hesaplayıcısı, kurulum föyü.
- Modelleme: yüze kadar extrude, konik, gövde bölme, iki mesafeli ve açılı pah, ince diş tabloları, yüzden ayna.
- Geçmiş: zaman çizelgesi ve ürün ağacı yeniden tasarlandı; çizimde hizalama izleri ve yakalama filtresi.
- Güvenlik kapılarında yanlış engeller azaltıldı; yalnız gerçek engeller kalıyor.

## Bilinen sınırlar
- Eşzamanlı 4 ve 5 eksen yok. 3+1 ve 3+2 konumlu işleme vardır; 4. eksen sarma yalnız X'e paralel silindirde çalışır.
- 3B kaba büyük parçada uzun sürebilir (ölçümde 87 sn); işlem iptal edilebilir. Adaptif yol dar geçitlere girmeyebilir; uyarı verir.
- Benzetim varsayılanda yalnız üstten bakan yükseklik haritasıdır; yan yüzeydeki küçük oyulmaları görmez. Üç yönlü ayrıntılı simülasyon isteğe bağlıdır ve varsayılan kapalıdır. Tezgâh tablası ve tutucunun fener mili modellenmez.
- 3+2 eğik düzlem (G68.2) ve sarma çıktıları hiçbir tezgâhta doğrulanmadı. Açılmış çıkış kafa eksenlerinde yoktur. Sarma simülasyonunda modele oyma ve bağlama denetimi yoktur; G76/G87 sarmada desteklenmez.
- Takım düzenleyicide eğim açısı alanı yok: merkez kesmeyen takımla rampa/helis yolu engellenir.
- Teklifteki süreler simülasyon tahminidir, ölçülmüş değildir. Varsayılan fiyat yoktur.
- Teknik resim: GD&T yok; kesit yalnız düz düzlemde; PDF'te yazı tipi gömülü değildir, Latin dışı harfler "?" olur.
- IGES: B-rep katı (186) ile 141 ve 143 okunmaz. Gerçek CAD dışa aktarımlarıyla sınanmadı.
- Modelleme: kaburga yalnız düz çizgi boyunca; diş kökü yuvarlatmasız; diş verisi CAM'e aktarılmaz.
- PDF altlık şifreli dosyayı açmaz; parola sorulmaz.
- Montaj yok. Inç yalnız CAM panellerinde ve NC'de; eskiz ölçüleri mm kalır.
- Windows kurulumu Linux'ta üretildi; ilk denemeyi siz yapacaksınız.

## Kaynak kod ve lisanslar
`npm install`, `npm run dev`, `npm run build`. Tasarım sözleşmesi `DESIGN.md`. Açık kaynak: OpenCascade (LGPL-2.1 + istisna), replicad (MIT), PlaneGCS/FreeCAD (LGPL-2.1+), three.js (MIT), Electron (MIT), pdfjs-dist (Apache-2.0).

---

## Sürüm notu şablonu (yayın öncesi doldurulur; GitHub Release metni olarak kullanılır)
<!-- Bu bölüm yalnız şablondur; her sürümde kopyalanıp doldurulur, "Bilinen sınırlar" yukarıdaki güncel listeyle eşitlenir. -->
```
# Mihenk <sürüm> — <tarih>

## Yenilikler
- <kullanıcıya görünen değişiklikler, WP numarasıyla>

## Düzeltmeler
- <düzeltilen hatalar>

## Doğrulama (bu sürüm için ölçüldü)
- npm run test:all: <adım>/<adım> geçti, <denetim> denetim, <kalan> kalan
- Altın parça seti (npm run test:altin): P1–P4 BLOCK <a>/<b>/<c>/<d>; temiz NC <x>/<y> setup; tablo: release/altin/sonuc.json
- Kurulu sürüm duman testi (Actions, Windows): <geçen>/<toplam>
- Windows kabul listesi (pm/KABUL-WINDOWS.md): <geçen>/<toplam> — <tarih>, <Windows sürümü> ya da "uygulanmadı"

## Bilinen sınırlar
- <OKUBENI.md "Bilinen sınırlar" ile aynı>; NC çıktısı makinede DOĞRULANMAMIŞTIR.

## Dosyalar
- Mihenk-Kurulum-<sürüm>.exe — SHA-256: <değer> (SHA256SUMS.txt ile aynı). Kod imzasızdır.
```

