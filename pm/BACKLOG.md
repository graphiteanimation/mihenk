# Mihenk — birleşik iş listesi ve yol haritası

Bu liste dört ayrı çalışmanın (NX/Fusion eksik analizi O-019…O-028, P1–P4 karşılaştırma testi T-01…T-24, P1 arayüz testi C-01…C-12 / M-01…M-03, doğrulama raporlarından açık kalan V/U/F bulguları) tek listede birleştirilmiş halidir. Aynı ihtiyacı anlatan maddeler tek iş paketinde (WP) toplandı; kaynak numaraları izlenebilirlik için korundu.
Ayrıntılar: T → `pm/kaynak/DUZELTME-PLANI-T01-T24.md` · C/M → `pm/kaynak/P1-arayuz-testi-notlari.md` · V/U/F → `docs/*-FIXES.md` · envanter → `pm/kaynak/envanter-0.3.0.md`.

Durum: ☐ Hazır · ◐ Sürüyor · ◑ Doğrulamada · ☑ Bitti. Model: O Opus · S Sonnet · H Haiku.

## Çakışan maddelerin eşlemesi
| Aynı iş | Birleştiği WP |
|---|---|
| T-03 pah işlemi = O-022 "pah/çapak" = envanter §12-6 | WP-06 |
| T-02 açık zincir = O-022 "açık kontur arayüzü" = P1 yarık (C/M notu) | WP-06 |
| T-05a delme `points` = O-022 "nokta listesinden delme" | WP-05 |
| T-05b delik tanıma = O-025 "delik tanıma + sıra şablonu" (tanıma kısmı) | WP-05 (sıra şablonu WP-14) |
| T-04 önceki setup stoğu = O-025 "in-process stock" = P1 S2/S3 hayalet stok | WP-05 (0.5'ten 0.4'e çekildi: NC'yi engelliyor) |
| T-09 adaptif = O-025 adaptif kaba = envanter kritik açık 2 | WP-12 |
| T-13 + T-20 3D = O-026 3D kaba/bitirme = envanter kritik açık 1 | WP-15 |
| T-19 + T-20 + M-01 silüet/tek kesit sorunu | WP-06 (T-19), WP-15 (T-20 kökten) |
| T-21 A işareti = V-01 = O-019'daki "A yönü teyidi" | WP-01 (profil alanı; K-026, O-032) + WP-03 (T-21b yazım biçimi) |
| C-05 görünüm küpü = envanter §5 "arka/alt/sol tıklanamaz" | WP-04 |
| C-01, U bulguları, "pah ölçü kısıtı eklemiyor" = O-021 hata kısmı | WP-04 (hata), WP-09 (yeni özellik) |
| M-03 kullanılmayan post alanı NC'yi engelliyor = "Neway şablonu boş" şikâyetleri | WP-03 |
| Neway şablon doldurma, tezgâh kabulü (O-019) | Mihenk dışı (K-026) |

## 0.4, birinci bölüm — Temizlik, bağımsızlık, güvenilir kapılar (eski 0.3.1; O-034)
| WP | İş | Kaynak | Alan | Kabul | Model | Durum |
|---|---|---|---|---|---|---|
| WP-00 | Proje düzeni: depo, pm/ belgeleri, birleşik liste | K-030 | pm/ | Bu dosyalar depoda; zip düzeni bitti | ana | ☑ |
| WP-01 | Tezgâh bağımsızlığı: Neway yerleşikten çıkar, genel şablonlar (3 eksen Fanuc, 3 eksen Mitsubishi, 3+1 A), tezgâh profili içe/dışa aktarma, Hakkında metni | K-026, K-027, O-032, T-21a | cam/machines, ui/cam, i18n | src'de tezgâh markası yok; profil dosyası içe alınıp NC kapıları çalışıyor; cam/post/sim/i18n testleri geçiyor | S | ☑ (0.3.1 kurulumuyla kullanıcıya ulaşır) |
| WP-02 | Geçmiş (zaman çizelgesi + ürün ağacı) yeniden tasarımı; ortadan düzenle → gerisi güncellenir akışı | K-028; envanter "sürükle-bırak yok" | ui (kabuk), kernel durum çıktısı | `pm/tasarim/GECMIS.md` kabul listesi | S (+O çekirdek durum/bağımlılık) | ◐ dilim 1–3 ☑ (bağımsız doğrulandı, birleşti); dilim 4–5 Hazır: sıra değiştirme, gruplar, klavye, onarım kipi, 3B yüz boyama (viewport), eskiz düzenlemesinin akışa bağlanması, işçide hesap iptali |
| WP-03 | Sim/kapı doğruluğu (Dalga 1): kılavuz dip çapı, radyal oyma ölçüsü, yerel stok yüksekliği, tutucu boşluk uyarısı, camSection döngü kapanışı, kullanılmayan post alanı engellemesin, A yazım biçimi | T-22, T-17, T-08(+ek), T-24, M-03, T-21b | cam/sim, cam/gates, cam/post | P4 S1 BLOCK 17 → ≤ 11; P1 arayüz senaryosunda yalnız gerçek engeller kalır; T-16 davranışları korunur | O (T-17, T-24), S | ☑ (bağımsız doğrulandı; P1/P2 STEP girdisi olmadığından ölçülemedi) |
| WP-04 | Arayüz hata düzeltmeleri: C-01…C-12, M-02 açıklaması, görünüm küpü tüm yüz/köşeler + sol tuş döndürme seçeneği, pah ölçü kısıtı, U-10; kurulum DirLeave; gerçek pencerede NC/DXF kaydı; `app.test.py` kararsız "sayfa hatası" kontrolü; kılavuz örneğindeki tezgâha özgü numaralar; **WP-03/20/02'den devir:** tezgâh listesindeki eksik rozeti `CONDITIONAL_PROPS` kullansın, `A.wrap` seçimi makine düzenleyicide, `''` boş dize de boş sayılsın, kılavuzlu programda `rigidTapM` boşluğu denetimi, A sınır denetimi `signed` kipte yazılan açıya baksın, arayüz testlerinde tek port değişkeni + açık sunucuyu yeniden kullanmama, i18n/security testlerinde `pathToFileURL`, action'ları commit SHA'sına ve NSIS sürümünü sabitleme, `models/run-all` part-h yük duyarlılığı | C-01…C-12, M-02, U-10, kurulum notu, WP-01 raporu | ui, ui/sketch, electron/build | P1 arayüz senaryosu gövde çevirmeden, bulgu tekrar etmeden biter; Windows kısa listesi geçer | S, H | ☑ (bağımsız doğrulandı; C-03, C-06, C-07 üretilemedi, koruyucu test var; NSIS DirLeave Windows'ta sınanacak) |
| WP-20 | Otomatik derleme: GitHub Actions, Windows'ta test zinciri + deneme kurulumu (her `master` birleşmesinde; indirilebilir çıktı) | O-034 | .github, build, scripts | Bir birleşmeden sonra Actions yeşil, kurulum dosyası indirilebilir ve Windows'ta açılıyor | S | ☑ (bağımsız doğrulandı; release.yml ilk etikette denenecek) |

## 0.4, ikinci bölüm — Prizmatik iş eksiksiz (her günkü 2,5 eksen + 3+1)
| WP | İş | Kaynak | Alan | Kabul | Model |
|---|---|---|---|---|---|
| WP-05 | Setup'lar arası stok ve delikler: önceki setup'tan stok, boydan boya delik dibi, STEP'te delik tanıma + `points`, serbest parça uyarısı, delme çevrimi gruplaması | T-04, T-14, T-05, T-15, T-23 | cam/sim, cam/ops/drill, kernel (delik tanıma) | P1 S3 hayalet BLOCK 0; P1–P4'te elle girilen 27 delik otomatik; P4 S1 çevrim sayısı Fusion ±1 | O, S · ☑ (iki tur bağımsız doğrulama; P1/P2 STEP girdisi yok, ölçülemedi; arayüz kısmı WP-06'da) |
| WP-06 ◐ | NC verimi + küçük CAM eksikleri: ilk dalma, gereksiz M kodları, yorum karakterleri, açık zincir, stockToLeave biçimi, takım uç/sap çapı, **pah işlemi**, silüet çok bölge | T-01, T-07, T-18, T-02, T-10, T-11, T-03, T-19 | cam/ops, cam/post, ui/cam | P3 S1 M5 sayısı ≈ takım değişimi; P1'de pah ve yarık yapılır (Yapılamadı 2 → 0) | S, H |
| WP-07 | 2D CAM'in kalanı: diş frezeleme, dairesel/bore frezeleme, kanal + iz sürme + sketch metni kazıma, ön delik, kontur helis rampası, setup eksenini yüzden seçme, bir setup'ta çok açı, yuvarlak stok, kesme verisi kütüphanesi + hesaplayıcı, setup sheet (HTML/PDF), ham ebat listesi | O-022, O-028 | cam/ops, ui/cam, ui/sketch (metin) | Her işlem için birim test + P-seti senaryosu; setup sheet P1 için üretilir | S (O: metin→eğri) |
| WP-08 | Modelleme: yüze/nesneye kadar extrude, konik, gövde/yüz bölme, doğrudan düzenleme (yüz taşı/ofsetle/sil), iki mesafeli ve açılı pah, teğet zincir seçimi, ince diş/boru dişi tabloları, yüzden ayna, kenar ekseninden desen; açık çekirdek hataları | O-020; F-15, F-26, F-21, C-03 | kernel, ui (özellik panelleri) | Her özellik için model testi; içe aktarılan STEP'te yüz taşıma/silme çalışır | O |
| WP-09 ◐ | Çizim konforu: hizalama izleri, çeyrek nokta, mutlak/bağıl koordinat, yakalama filtresi, ızgara aralığı, otomatik kısıtlandırma, aşırı kısıtta referans ölçü, ilişkisel izdüşüm, komut tekrarı, seçim filtresi, görüntü modları (tel kafes/saydam), adlandırılmış görünüş | O-021; envanter §3–§5 | ui/sketch, ui | Sketch testleri + P1 çizim süresi ölçümü kısalır | S |
| WP-10 | Güven altyapısı: `test/models/results.json` test koşusunda izlenen dosyayı kirletmesin, part-h bellek tepe değeri (3,4 GB) düşürülsün, `test/shots-ui.py` sabit port/yol; altın parça setine kullanıcı parçaları, örnek parçalar, çökme/hata günlüğü, NC başlığında model özeti, V-29 incelemesi, hesap iptali testi | O-024, O-028, V-29 | test, electron | Set her sürümde tek komutla koşar | S |
| — | **Sürüm 0.4** | | | §6 | ana |

## 0.5 — Verim ve çarpışma güvenliği
| WP | İş | Kaynak | Model |
|---|---|---|---|
| WP-11 | Açık kaynak takım yolu kütüphaneleri incelemesi (FreeCAD Adaptive/libarea, OpenCAMLib, Clipper2): lisans, WASM, kalite. Çıktı: seçim raporu | O-023 | S + ana · ☑ (O-038) |
| WP-12 | 2D adaptif kaba (açık kenar dahil), kalan malzeme (rest), yatay temizleme, aşağıda kalma, köşede ilerleme düşürme, çıkışta ilerleme düşürme, ince duvar | T-09, O-025, O-028 | O |
| WP-13 | Çarpışma: fikstür/mengene/divizör modeli (montaj yerine "bağlama gövdeleri"), gerçek tutucu geometrisi, üç yönlü dexel simülasyon (alt kesme, yan yüz), sim'in worker'a taşınması, G-code üzerinden simülasyon | O-025; V-24, V-28 | O |
| WP-14 | İş akışı: işlem şablonları, delik sıra şablonu, G76/G87, mengenede çoklu parça, teklif yardımcısı (süre + malzeme), PDF altlık, inç birimi | O-025, O-028 | S |
| — | **Sürüm 0.5** | | |

## 0.6 — Eğrisel parça, çok eksen altyapısı, kâğıt
| WP | İş | Kaynak | Model |
|---|---|---|---|
| WP-15 | 3D işleme: model yükseklik haritasından ada (T-20), 3D adaptif kaba, Z-seviye kontur, paralel/scallop, kalem, 3D rest, yay uydurma | T-20, T-13, O-026 | O |
| WP-16 | 4. eksen sarma (wrap) | O-026 | O |
| WP-17 | Teknik resim: görünüş, kesit, ölçü/tolerans, delik tablosu, PDF/DXF; ilk parça kontrol formu | O-026, O-015 | S, O |
| WP-18 | Çok eksen altyapısı: genel kinematik zincirli tezgâh profili, IR'de takım ekseni, setup yönü serbest yüz normali, **3+2 konumlu işleme**, post'ta eğik düzlem (G68.2 sınıfı) seçeneği | K-029 | O |
| WP-19 | Modelleme ikinci tur: sweep, loft, draft, rib, değişken fillet, helis/diş, IGES | envanter §6–§7 | O |
| — | **Sürüm 0.6** | | |

## 1.0 ve sonrası
- 1.0: kinematik tezgâh simülasyonu, kod imzası + güncelleme, performans, tam kılavuz, kabul.
- 1.0 sonrası: eşzamanlı 4/5 eksen, prob çevrimleri, montaj, DNC aktarımı. Kapsam dışı: sac metal, yüzey modelleme, konfigürasyon, bulut (O-027).

## Sıra gerekçesi
1. Önce güven: yanlış BLOCK ve yanlış "temiz" (WP-03), sonra setup'lar arası stok (WP-05). Karşılaştırma testinde 13 setup'ın 6'sında NC'yi engelleyen bunlardı.
2. Geçmiş arayüzü (WP-02) erken: CAD'in her gün kullanılan omurgası ve sonraki modelleme özellikleri (WP-08) buna bağlanıyor.
3. Sıklık: her parçada gereken (pah, delik, 2D) → verim (adaptif) → seyrek (3D, çok eksen, teknik resim).
4. Paralel yürütülebilenler: WP-02 ‖ WP-03 · WP-04 ‖ WP-05 · WP-06 ‖ WP-08 ‖ WP-09 (alanlar ayrık).
