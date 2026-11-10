# Mihenk — Marka ve Kurumsal Kimlik

Durum: taslak v1 (tasarım ajanı). Bu belge `brand/` altındaki dosyalarla birlikte okunur. Kaynak koda dokunulmadı.

## 1. Ad kararı

**Seçilen ad: Mihenk.** Ürün adı biçimi: **Mihenk CAD/CAM** (tam), **Mihenk** (kısa). Mihenk taşı, altının ayarının sınandığı ölçüt taşıdır; "doğruluğun sınandığı ölçüt" fikri programın vaadidir: hesabın sonucu görünür, doğrulanmayan şey "DOĞRULANMADI" diye işaretlenir. Altı harf, TR/EN okunur ("mi-HENK"), imalat/ölçme alanıyla anlam bağı var. Büyük harfle Türkçe yazım MİHENK'tir; logo bu yüzden karışık harfle (Mihenk) çizildi, I/İ sorunu doğmaz.

### Çakışma kontrolü (hukuki araştırma DEĞİLDİR)
Bu, web aramasıyla yapılmış bir ön taramadır. Hukuki marka araştırması değildir. Resmi tescil ya da yaygın kullanım öncesi **TÜRKPATENT** (marka sorgusu, Nice sınıfları 9, 42, 7, 35) ve **WIPO Global Brand Database** sorgusu yaptırın, mümkünse marka vekiliyle.

Öncelik sırası: Mihenk, Punta, Pafta.

**Mihenk**
- CAD, CAM, CNC yazılımı, takım tezgâhı, kesici takım ya da ölçme aleti markası olarak **bulunamadı** (Türkçe ve İngilizce, birden çok arama).
- Bulunan benzer kullanımlar:
  - **SAHA MİHENK**: SAHA İstanbul Savunma ve Havacılık Kümesi içindeki "Ulusal Havacılık Endüstrisi Komitesi"; havacılık kalite sertifikasyon gözetimi (IAQG/AS9100 ailesi). Yazılım ya da makine değil. Ancak hedef müşteri çevresi (havacılık-savunma tedarikçileri) aynı olduğundan **ilişki sanılma riski** var. Kaynaklar: https://sahaistanbul.org.tr/en/komiteler/mihenk-turkish , https://sahaexpo.com/exhibitor/saha-mihenk (ikisi de açılıp okundu).
  - **mihenk teknoloji**: BT hizmet firması dizin kaydı (GoodFirms). Sayfa açılamadı; yalnız arama sonucu başlığı: https://www.goodfirms.co/company/mihenk-teknoloji . Alanı CAD/CAM değil görünüyor, doğrulanamadı.
- Alan adları: `mihenk.com` kayıtlı ama içerik yok (Cloudflare Registrar sayfası), `mihenk.com.tr` "yapım aşamasında" yer tutucu. `mihenk.io` ve diğerleri erişilemedi (robots engeli). https://mihenk.com , https://mihenk.com.tr
- Sonuç: yazılım/imalat alanında doğrudan çakışma bulunmadı; SAHA MİHENK ile bağ kurulmaması için "Mihenk CAD/CAM" tam ad biçimi ve "havacılık kalite komitesi ile ilgisi yoktur" notu (Hakkında penceresi) önerilir. Karar sahibi: kullanıcı. Risk istenmezse yedek: Punta.

**Punta, Pafta (yedekler)**: Arama motoru tek kelimelik adlarda ayrım yapmadı (alakasız Hexagon/Siemens sayfaları döndü); `punta.com` ve `pafta.com` sayfaları açılamadı (robots/istemci hatası). **Doğrulanmadı**, bu yüzden "çakışma yok" denemez. Pafta'nın Türkçe anlamı harita/çizim paftasıdır (tanımlayıcı, zayıf marka); Punta karşılığı tezgâh punta (kuyruk mili) olup ürün adı olarak gündelik teknik terimdir.

### Dosya uzantısı
**`.mhnk`** (Mihenk belgesi). `.mhk` Broderbund Mohawk/HyperStudio arşivleriyle çakıştığı için elendi (https://filext.com/file-extension/MHK ); `.mnk` (My Notes Keeper) de elendi (https://fileinfo.com/list/m). `.mhnk` fileinfo.com M listesinin ilk 500 kaydında yok; fileinfo/file-extensions.org'da doğrudan sayfa bulunamadı. Tam negatif kanıt değildir. Eski `.acad` dosyaları açılmaya devam eder (yalnız okuma/içe aktarma; kaydedince `.mhnk` yazılır, özgün dosya silinmez). MIME önerisi: `application/vnd.mihenk.document+json` (yalnız öneri).

### Teknik kimlikler
| Öğe | Değer |
|---|---|
| Ürün adı (productName) | Mihenk |
| Tam ad | Mihenk CAD/CAM |
| appId | `com.d160.mihenk` |
| npm paket adı | `mihenk` |
| Kurulum klasörü | `Mihenk` (ör. `%LOCALAPPDATA%\Programs\Mihenk` / `C:\Program Files\Mihenk`) |
| Ayar klasörü (userData) | `Mihenk` (ilk açılışta eski `AtolyeCAD` klasöründen ayar ve kurtarma dosyası **kopyalanır**, silinmez) |
| Dosya uzantısı | `.mhnk` (okuma: `.mhnk`, `.acad`) |
| Dosya türü adı | "Mihenk belgesi" / "Mihenk document" |

## 2. Logo

Seçilen yön: **V-blok M + datum üçgeni**. M, V oluklu bir bloktur (V-blok: imalatta referans/ölçme aparatı). Oluğun içinde aşağı bakan dolu üçgen, teknik resimdeki **datum (referans) işaretidir**: "ölçüt buraya dayanır". Klişe dişli/kumpas yok. Düz, kalın, 16 px'te okunur. Üç yön çizildi ve görüntü olarak incelendi:
1. V-blok M + datum üçgeni: seçildi. 16 px'te net, adla ve metrolojiyle bağlı.
2. Taş + çizik + L datum (`brand/explorations/yon2-tas-olcut.svg`): "düzenle/kalem" simgesine benzedi, elendi.
3. Kare sarmal takım yolu (`brand/explorations/yon3-takim-yolu.svg`): labirent/genel sarmal gibi okundu, 16 px'te çamurlaştı, elendi.

Benzerlik kontrolü (görsel/bellek, web'den doğrulanmadı): Autodesk (A harfi), Mastercam, SolidWorks (SW), FreeCAD (3B kare+ışın), Siemens NX (yazı), Fusion (F/A akışı) logolarının hiçbiri "kalın M + üçgen" değildir. Dolu "M" harfli genel uygulama simgeleri çok; ayırt edicilik üçgen ve V oluktadır. Tescil öncesi logo için de TÜRKPATENT/WIPO şekil sorgusu önerilir.

### Dosyalar (`brand/`)
- `logo/logo-horizontal.svg` (+`-reverse`, `-mono-black`, `-mono-white`): simge + yazı yatay kilit.
- `logo/logo-vertical*.svg`: dikey kilit. `logo/logo-mark*.svg`: yalnız simge.
- `app-icon/app-icon.svg`, `app-icon-small.svg` (≤32 px için daha iri işaretli); `app-icon-{16,24,32,48,64,128,256}.png`; `app-icon.ico` (7 boyut).
- `app-icon/doc-icon*.svg|png|ico`: `.mhnk` belge simgesi.
- `icons/*.svg` (141 simge) + `icons/icons.json`; `explorations/`; `fonts/`; `_build/` (SVG üreten betikler, yazı dış çizgileri `Inter Display SemiBold`dan yola çıkarıldı).

### Geometri ve kurallar
- Simge 32 birimlik ızgarada: M gövdesi x 4–28, y 7–29,5; sap kalınlığı 5,5 birim = **U**. Üçgen (10,3)-(22,3)-(16,12,5), M oluğuyla paralel kenarlı, aralık ≈ 2,3 birim.
- Yatay kilit: yazı taban çizgisi M tabanında, büyük harf yüksekliği M yüksekliğine eşit, simge-yazı aralığı 8 birim.
- **Temiz alan**: kilit çevresinde en az 3U (≈ 16,5 birim, simge yüksekliğinin yarısı). **En küçük boyut**: yalnız simge 16 px; yatay kilit 96 px genişlik; dikey kilit 64 px genişlik.
- Renk: M mürekkep `#14202B`, üçgen marka mavisi `#1F6FD1`. Koyu zeminde (reverse): M `#F2F5F8`, üçgen `#5BA0F0`. Tek renk sürümlerde üçgen de aynı renk.
- Uygulama simgesi: `#14202B` yuvarlatılmış kare (yarıçap 7/32), M `#F2F5F8`, üçgen `#4C94E8`.

### Yanlış kullanım
Üçgeni başka renge boyamak (durum renkleri dahil: kırmızı/sarı/yeşil anlam taşır); M'yi eğmek ya da gölge, gradyan, cam efekti eklemek; üçgeni M'ye yapıştırmak (aralık korunur); yazıyı başka yazı tipiyle dizmek (SVG'deki hâli kullanılır); düşük kontrastlı zemin; simgeyi yazı olmadan 16 px altında kullanmak; adı "MIHENK" diye ASCII büyük harfle yazmak (Türkçe: MİHENK ya da Mihenk).

## 3. Renk paleti
Tam belirteçler: `design/tokens.css`. Kontrast oranları: UI-SPEC §5.

| Rol | Açık | Koyu | Amaç |
|---|---|---|---|
| Mürekkep (başlık/durum çubuğu) | `#14202B` | `#0A0E12` | marka zemini |
| Birincil (accent) | `#1456A0` | `#5FA2EE` | birincil eylem, seçili, odak |
| Accent hover / basılı | `#0F4888` / `#0B3A70` | `#7DB4F3` / `#99C5F7` | |
| Nötr ölçek (açık) | `#FBFBFC #F4F5F7 #E8EBEF #DFE3E8 #D2D7DE #7B8591 #58626E #4B5560 #171C23` | koyu karşılıkları `tokens.css`te | yüzey, çizgi, metin |
| Hata | `#B3261E` | `#FF8F86` | yalnız hata |
| Uyarı | `#8A5300` (metin) / `#F2A900` (dolgu) | `#F5C04D` | yalnız uyarı |
| Başarı | `#1B6B3A` | `#6FD08C` | yalnız başarı |
| Bilgi | `#2D4B66` | `#A9C4DD` | nötr, doygun değil |
| Doğrulanmadı | `#68399E` | `#C7A8F2` | yalnız "DOĞRULANMADI" (kesikli çerçeve) |

İlke: doygun renk yalnız durum anlamı taşır; marka mavisi durum rengi değildir; renk tek taşıyıcı olmaz (ikon + metin + biçim).

## 4. Tipografi
- **Arayüz: Inter** (SIL OFL 1.1). npm: `@fontsource/inter` 5.3.0 (sürüm sabitlenir). Ağırlıklar **400, 500, 600** (700 yalnız karşılama başlığı gerekirse). Alt kümeler **`latin` + `latin-ext`** birlikte yüklenmeli: ğ ş İ ı latin-ext'te. Dosyalar hazır: `brand/fonts/inter-{latin,latin-ext}-{400,500,600,700}-normal.woff2`. Sayılar: `font-feature-settings: "tnum","zero"` (eşit genişlik, çizgili sıfır; 0/O karışmaz).
- **Sayısal ifade, parametre adı, NC kodu: JetBrains Mono** (SIL OFL 1.1). `@fontsource/jetbrains-mono` 5.3.0, ağırlık 400/500, `latin` + `latin-ext` (`brand/fonts/jetbrains-mono-*.woff2`).
- Lisans metinleri: `brand/fonts/LICENSE-Inter-OFL.txt`, `LICENSE-JetBrainsMono-OFL.txt`; kurulumla birlikte "Üçüncü taraf lisansları" altında gönderilir. Yazı tipleri pakete gömülür (CSP `font-src 'self'` uyumlu, çevrimdışı).
- Gerekçe: sistem yazı tipi yığını (Segoe UI) Windows'ta güvenilir ama tezgâh bilgisayarı sürümleri ve Türkçe kapsama farklı olabilir; gömme, ekran görüntülerini ve ölçüleri her makinede aynı yapar. Doğrulanamayan: woff2 dosyalarının Türkçe kapsamı kod olarak taranmadı; maketlerde ğüşıöçİ görsel olarak doğru çiziliyor.
- Ölçek: 12 / 13 / 14 / 16 / 20 / 28 px (Normal), Büyük yoğunlukta 13 / 15 / 16 / 18 / 22 / 32. En küçük yazı 12 px.

## 5. İkon dili
`brand/icons/` : 24 px ızgara, canlı alan 2–22, **çizgi 1,75**, yuvarlak uç ve birleşim, yalnız `currentColor`, dolgu yalnız küçük nokta/işaret için; çizgi kalınlığı tek. Yapı/yardımcı geometri `2 2,5` kesikli. Köşeler: kapalı şekillerde 1–2 birim yarıçap. Boyutlar: şerit 24 (`--icon-tool`), satır 20 (`--icon`), rozet 14–16. Sayfa: `design/icon-sheet.html`. Kategoriler: genel arayüz 53, 3B özellikler 20, sketch çizim 35, sketch kısıtları 11, İmalat (CAM) 22 (toplam 141). Birkaç not: `fillet` (3B, kapalı şekil) ile `sketch-fillet` (açık çizgi + kesikli hayalet köşe) bilerek ayrı; `cam-machine` ile `workspace-manufacture` aynı fikir.

## 6. Ses tonu ve yazım
Kısa, yalın, saygılı; emir kipi yerine tanım ("Kaydedilmemiş değişiklikler var"). Düğme etiketi fiildir, tek kavram ("Kaydet", "Vazgeç"). Türkçede cümle yazımı (başlıkta ilk harf büyük, sözcük sözcük büyütme yok). TAMAMI BÜYÜK HARF yok (İ/I sorunu; yalnız "DOĞRULANMADI" rozeti kasıtlı). Sayı + birim her zaman birlikte ("14,00 mm"); TR ondalık virgül, EN nokta. Hata iletisi = ne oldu + ne yapmalı + (ayrı kutuda) teknik ayrıntı.

| Durum | TR | EN |
|---|---|---|
| Hata | "Dosya açılamadı. Montaj plakası.mhnk bozuk görünüyor. Son otomatik kaydı açın." | "Could not open the file. Montaj plakası.mhnk looks damaged. Open the latest autosave." |
| Alan hatası | "Mesafe 0'dan büyük olmalı. Örnek: 5" | "Distance must be greater than 0. Example: 5" |
| Başarı | "Kaydedildi" | "Saved" |
| Onay | "Takım silinsin mi? Bu işlem geri alınamaz." [Vazgeç] [Takımı sil] | "Delete this tool? This cannot be undone." [Cancel] [Delete tool] |
| Kaçınılacak | "Hata oluştu!" / "Başarısız." | "Something went wrong!" / "Failed." |

Yazma kuralı: ünlem yok; özür dileyen dil yok; suçlama yok ("yanlış girdiniz" yerine "değer geçersiz").

## 7. Açık kararlar
- Mihenk ile SAHA MİHENK ilişkisi (yukarıda), kullanıcı kararı.
- Uzantı `.mhnk` kesin onay; MIME önerisi.
- Üçgen mavisi marka kampanyalarında tek renkle sınırlı mı.
