# Mihenk — kararlar (K) ve öneriler (O)

K = kullanıcı kararı (bağlayıcı). O = Claude önerisi/teknik kararı. Eski kayıt silinmez; değişirse yeni kayıt "yerine geçer" der.
K-001…K-015 ve O-001…O-018'in tam metni Claude Docs spesifikasyonunun 0. bölümündedir (donduruldu; bu oturumda yeniden okunmadı). 2026-11-20'den itibaren günlük burada tutulur.

## Yürürlükteki kullanıcı kararları (özet)
| No | Tarih | Karar | Durum |
|---|---|---|---|
| K-001 | — | Ayrıntı derinliği hedef makineye (Neway VM1160H/M80V/GSA) göre ayarlanır | **K-026 ile kaldırıldı** |
| K-004 | — | Mihenk projesi tezgâha gidecek G-code üretmez | Yürürlükte |
| K-015/K-022 | 11-10 | Süreç yönetimi Claude'da; kararlar ana modelde, uygulama/test alt ajanlarda; az token | Yürürlükte |
| K-016 | 11-10 | Program tümüyle iki dilli (TR + EN) | Yürürlükte |
| K-017 | 11-10 | Makineden bağımsız; 3/4/5 eksen farklı tezgâhlar eklenebilmeli | Yürürlükte (K-026 ile güçlendi) |
| K-018 | 11-10 | Sketch ana omurga; eksik komut olmamalı | Yürürlükte |
| K-019 | 11-10 | Öncelik alüminyum/çelik parçanın CNC'de işlenmesi; PCB, bulut vb. yok; programa güvenilebilmeli | Yürürlükte |
| K-020 | 11-10 | Electron yığını ve aşama sırası onayı (O-017, O-018) | Yürürlükte |
| K-021 | 11-10 | CAM post çıktısı üretir; çıktı test sayılır | Yürürlükte |
| K-023 | 11-10 | Kurumsal ad + logo + kimlik; profesyonel UI/UX | Uygulandı (Mihenk) |
| K-024 | 11-19 | Ad yalnız Mihenk; AtolyeCAD ile ilişkili her şey silinsin | Uygulandı (b6cbba6) |
| K-025 | 11-20 | "İlk parçayı sen arayüzle çiz… devamında CAM'i de arayüzde yap" | Uygulandı (P1 arayüz testi) |

## 2026-11-20 kararları
- **K-026** — "Bu başlı başına bir CAD/CAM programı projesi… Diğer projedeki kararlar bu programın geliştirilmesini etkilememeli. Bu program bir Fusion, NX, SolidCAM muadili olmalı… tezgah kısmında Neway default olarak ekli olmasın ama kendi makineme ait ayarları kolayca bu bilgisayarda ekleyebileyim."
  Anlam: (1) ürün kapsamı ve sırası genel CAD/CAM ihtiyacına göre belirlenir; (2) yerleşik tezgâh yalnız genel şablonlardır, Neway profili kullanıcı dosyası olur, tezgâh profili içe/dışa aktarılabilir; (3) tezgâh başı teyit bekleyen maddeler Mihenk'in ilerlemesini durdurmaz. Yerine geçer: K-001. Etkilenen: O-019 (geri çekildi), T-21a (profil alanına indirildi), M-03.
- **K-027** — Hakkında metni: "Mihenk açık kaynak araçlar kullanılarak geliştirilmiş bir CAD/CAM programıdır." AtölyeCAD, SAHA MİHENK, D160 anılmaz.
- **K-028** — Ürün ağacı / zaman çizelgesi arayüz ve kullanıcı deneyimi açısından yeniden tasarlanacak; "aradan bir işlemi düzenleyip ardından geri kalan tasarımın update edilmesi" çok önemli. Tasarım: `pm/tasarim/GECMIS.md` (WP-02).
- **K-029** — Çok eksen: "Şu an 3 eksen ve 3+1 yeterli… 5 eksen sonraki versiyonlarda eklenebilir. Eğer şimdi yapmak mantıklıysa şimdi yapalım, buna sen karar ver." Claude'un kararı (kullanıcı devriyle):
  - 5 eksen takım yolu **şimdi yapılmayacak**. Gerekçe: (a) 3 eksenin kendisinde 3D yüzey işleme ve adaptif kaba henüz yok; 5 eksen stratejileri bunların üstüne kurulur; (b) eşzamanlı 5 eksen, takım ekseni denetimi + tutucu/tezgâh çarpışma çözümü + kinematik simülasyon ister, bunların hiçbiri hazır değil; (c) deneyecek 5 eksen tezgâh yok, doğrulanamayan özellik güven hedefiyle (K-019) çelişir.
  - **Şimdi yapılacak olan** ucuz ve geri dönüşü pahalı kısım, yani veri modeli: tezgâh profili N döner eksenli kinematik zinciri (tabla/kafa, eksen yönü, sınır) taşıyacak; takım yolu ara gösterimi (IR) her harekette takım ekseni vektörü taşıyabilecek; setup yönü "herhangi bir yüz normali" olarak saklanacak. Böylece 3+1 bugünkü özel durum olmaktan çıkar, **3+2 konumlu işleme** aynı altyapının iki döner eksenli hali olur (0.6, WP-18). Eşzamanlı 4/5 eksen 1.0 sonrasıdır.
- **K-030** — "Proje yönetici bakış açısıyla süreci en iyi ve en verimli şekilde yönetmeni istiyorum… en uygun yöntem nasılsa öyle devam edelim." Anlam: çalışma düzeni `pm/CALISMA-DUZENI.md`; onay WP başına değil yol haritası düzeyinde.

## Öneriler
| No | Öneri | Durum |
|---|---|---|
| O-016 | Spesifikasyon projesini kapatma | **Uygulandı sayılır**: spesifikasyon başvuru belgesi oldu, günlük buraya taşındı (K-030) |
| O-019 | Yeni özellikten önce 0.3.x tezgâh kabulü | **Geri çekildi** (K-026). Yerine: yazılım kabul kapıları (CALISMA-DUZENI §6) |
| O-020 | 0.4 modelleme: yüze kadar extrude, gövde bölme, doğrudan düzenleme, iki mesafeli pah, diş tabloları | BACKLOG WP-08 |
| O-021 | 0.4 çizim konforu paketi | BACKLOG WP-09 |
| O-022 | 0.4 2D CAM'in tamamlanması | BACKLOG WP-06, WP-07 |
| O-023 | Açık kaynak takım yolu kütüphaneleri incelemesi (FreeCAD Adaptive, OpenCAMLib, Clipper2) | BACKLOG WP-11 |
| O-024 | Altın regresyon parça seti | P1–P4 ile başladı; kullanıcı parçaları eklenecek (WP-10) |
| O-025 | 0.5 verim + çarpışma paketi | BACKLOG WP-12…WP-14 ("önceki setup'tan stok" 0.4'e çekildi: WP-05) |
| O-026 | 0.6 3D kaba/bitirme, sarma, teknik resim | BACKLOG WP-15…WP-17 |
| O-027 | Kapsam dışı: sac metal, yüzey modelleme, konfigürasyon, bulut; eşzamanlı 4 eksen ertelenir | Yürürlükte (K-029 ile uyumlu) |
| O-028 | Küçük kalemlerin sürümlere dağıtımı | BACKLOG'a işlendi |
| O-029 | T-01…T-24 düzeltme planı ve dalga sırası | BACKLOG WP-03, WP-05, WP-06, WP-12, WP-15'e dağıtıldı |
| O-030 | **Birleşik yol haritası** (BACKLOG.md sürüm sırası): O-019…O-029'un yerine tek onay kalemi | **Kullanıcı onayı bekliyor**; itiraz yoksa sıradaki oturum WP-02/WP-03 ile sürer |
| O-031 | Kod deposu için özel GitHub deposu (`mihenk`) yansısı: bilgisayar kapalıyken de oturum açılabilir, paralel dallar, Windows'ta otomatik test (Actions) | Kullanıcı boş özel depoyu açınca kurulur |
| O-032 | Genel 4 eksen şablonunda A yönü varsayılanı ISO 841 sağ el kuralı (`dir [1,0,0]`); her tezgâh kendi profilinde değiştirir. T-21a kodda "tezgâh teyidi bekleyen" madde olmaktan çıkar | WP-01 ile uygulanıyor |

## Mihenk dışında kalan (bilgi; Mihenk'i bekletmez)
Kullanıcının Neway profilindeki boş alanlar (maxRpm, ilerleme sınırı, safeRetract, G04 adresi/birimi, G54.1 aralığı), A+ dönüş yönü, O/N sınırları: kullanıcı kendi profil dosyasında doldurur. P1 STEP'indeki Ø4 çubuk sorusu yalnız karşılaştırma testinin yorumunu etkiler.
