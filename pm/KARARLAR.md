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
- **K-031** — "özelliklerden D160 kaldırabiliriz, bu programın adı Mihenk, herhangi bir şirket ismi şu an yok." Exe özellikleri (şirket, telif) "Mihenk"; uygulama kimliği `app.mihenk.cadcam`.
- **K-032** — Geçmiş arayüzü sorusu: "sen bir karar mekanizmasıyla karar ver… nasıl iyi olacaksa öyle ilerle." Karar Claude'a devredildi → O-033.
- **K-033** — "sürüm sırasına itirazım yok ama her sürüm fazladan iş demek…" O-030 onaylandı; sürüm yükü için O-034.
- **K-034** — "github'da mihenk adında bir repo açtım." Ana depo `github.com/graphiteanimation/mihenk` (özel).
- **K-035** — "0.6 sürümü de dahil herşey bitinceye kadar devam et. kurulumu yap, denemeleri yap, herşeyi yap." Saatte bir zamanlanmış oturum; sürüm kapılarında beklenmez (CALISMA-DUZENI §8).
- **K-036** — "bu modelin [Fable 5.2] orkestrasyon, yönetim yapmasını istiyorum… diğer modellere ne iş yaptıracağına ve süreci nasıl yöneteceğine karar versin. az token harcamak için gerekli yol neyse öyle çalışsın." CALISMA-DUZENI §9.
- **K-037** — "0.6 sürümünü bitirip kurup deneyip herşeyiyle bitirmeni istiyorum. bilgisayara kurma ve deneme için gereken izni de vereyim." Zamanlanmış göreve `Documents\Fusion-Klon-Spec` klasörü bağlandı; görev kullanıcının bilgisayarını gerektirir. Her sürüm yayımlanınca yerel kurulum + ekranda kabul listesi (`pm/KABUL-WINDOWS.md`); `TAMAMLANDI` ancak 0.6 yerelde kurulup denendikten sonra. Yarım saatte bir çalıştırma istendi; platformun en kısa aralığı 1 saat, bu yüzden bir oturumda en çok 3 WP paralel yürütülür.
- **K-038** (2026-11-20) — "Her turun sonunda send_later ile kendine 60 dakika sonrasına \"Mihenk: devam\" kur ve uyanınca beni beklemeden sıradaki iş paketini al." Anlam: oturum her turun sonunda kendine 60 dk sonrası için aynı sohbete `Mihenk: devam` kurar; uyanınca kullanıcı beklenmeden §8 kilit kuralıyla sıradaki "Hazır" WP alınır.
- **K-039** (2026-11-20) — "Durmadan çalış: bir iş paketi bitince turu kapatma, aynı turda sıradakini al. Tur herhangi bir nedenle biterse, bitmeden önce send_later ile kendine 1 dakika sonrasına \"Mihenk: devam\" kur ve uyanınca beni beklemeden sürdür. 0.6 bilgisayarıma kurulup denenene kadar böyle devam et." Anlam: bir WP bitince aynı turda sıradaki alınır; tur biterse uyandırma 1 dk sonrasına kurulur. Yerine geçer: K-038 (60 dk).
- **K-040** (2026-11-20) — "Bu işler bitince bir dur, yani bir sonraki aşamaya geçme, şu an devam eden işleri bitir ve dur." Anlam: süren paketler (WP-07, WP-08, WP-10) bitirilip doğrulanıp birleştirilir; yeni paket, sürüm kapısı ya da sonraki sürüm başlatılmaz; kendi kendini uyandırma kurulmaz. Kullanıcı yeniden `Mihenk: devam` yazana kadar K-035 ve K-039 askıdadır.

- **K-041** (2026-11-21) — "normalde iş 1 saat sürünce 100 birim token tüketiyor ama token tüketimini düşürmek istediğimiz için iş 5 saat sürüyor ama 90 birim token tüketiyorsa bunu değiştirelim." Anlam: öncelik duvar saati; token yalnız israfı önlemek için gözetilir. Uygulama: CALISMA-DUZENI §10 (paralellik 3 → 5, boru hattı, tam test zinciri yerel değil CI'da, tek doğrulama turu, toplu birleşme).

- **K-042** (2026-11-21) — "her yeni oturum açıp… klasöre erişim yetkisi istiyor ve github yetkisi istiyor. bu iş bitinceye kadar gerekli tüm yetkileri… verebilir miyim?" Anlam: izin istemleri en aza indirilir; klasör/bilgisayar yalnız sürüm kapısında, aynı sohbet mümkün olduğunca uzun sürdürülür (CALISMA-DUZENI §4).

- **K-042** (2026-11-21) — "bütün ihtiyaç duyacağı yetkileri promptu verdiğim anda başlangıçta istesin. böylece daha sonra yetki isterse ben görmediğim için bekleyebiliyor, bunu engellemiş oluruz." Uygulama: CALISMA-DUZENI §4 adım 0.

- **K-043** (2026-11-21) — "Durmadan çalış: bir iş paketi bitince turu kapatma, aynı turda sıradakini al. Tur herhangi bir nedenle biterse, bitmeden önce send_later ile kendine 1 dakika sonrasına \"Mihenk: devam\" kur ve uyanınca beni beklemeden sürdür. 0.6 bilgisayarıma kurulup denenene kadar böyle devam et." Anlam: K-040 sona erdi (yerine geçer: K-040); K-035/K-039 yeniden yürürlükte. Sıra: WP-21 → 0.4 kapısı → 0.5 (WP-12‖13‖14) → 0.6 (WP-15…19) → yerel kurulum ve kabul. Durma koşulu yalnız §8 (a).

- **K-044** (2026-11-21) — "Şu an devam eden işler bitince bir dur" Anlam: süren işler (dikdörtgen hatası düzeltmesi, kabul bulguları düzeltmesi, `test:all`) bitirilip birleştirilir; yeni kurulum dosyası, yeniden kurulum, kaldırma adımı ve yeni paket başlatılmaz; kendi kendini uyandırma kurulmaz. Kullanıcı `Mihenk: devam` yazınca sürer (K-043 askıda).
- **K-045** (2026-11-21) — "Mihenk: devam" Anlam: K-044 durdurması kalkar; K-044 öncesi sıradaki işe (0.6.0 düzeltilmiş kurulum, kabul adımları 15/10/12/2, `v0.6.0`) devam edilir. Yerine geçer: K-044.

- **K-046** (2026-11-21) — "tezgah denemesi şimdi yapmıyoruz. kıyaslamayı diğer programların kullanımıyla yapıyoruz. fusion ile yaptığımız test gibi" Anlam: Mihenk'in doğruluk ölçütü tezgâh denemesi değil, aynı parçanın Fusion (ve benzeri programlar) ile programlanıp sonuçların karşılaştırılmasıdır (P1–P4 yöntemi). `pm/SORULAR.md`'deki üç varsayıma itiraz edilmedi; yürürlükte.

- **K-047** (2026-11-21) — "atolye cad i sildim. dosya yolunun adını mihenk olarak değiştirdim." `%APPDATA%\AtolyeCAD` silindi. Bilgisayardaki proje klasörü `Documents\Fusion-Klon-Spec` → `Documents\Mihenk` (içinde `Mihenk\` alt klasörü: `mihenk.git`, `surumler`, `tezgahlar`, `test-fusion-karsilastirma`, `arsiv`). Oturumlar klasör erişimini yeni yoldan ister.

- **K-048** (2026-11-21) — "mevcut mihenk sürümünün sadece cad kısmını test etmek istiyorum… kaç adet ve hangi parçalar ile cad çizme denemesi yapabiliriz. cad lere karar verip çizdikten sonra kaydetmeni de istiyorum… cad test i için ayrı ve çok uzun olmayan ama yeterli bir yol haritası çıkar." + "mihenk'i kapatmak istediğimde gelen uyarı ekranı arayüzle çok uyumlu değil." Uygulama: `pm/test/CAD-TEST.md` (10 parça), C-13.

- **K-049** (2026-11-21) — "bundan sonra da bir proje yönetimi oturumu açıp proje gidişatıyla ilgili konuları orada konuşup süreci yürütmeyi istiyorum. yapılacak işleri ise yeni bir oturum açıp mihenk devam sistemiyle devam etmek istiyorum." Uygulama: `pm/YONETIM.md`, `pm/IS-EMRI.md`, `pm/OTURUMLAR.md`; CALISMA-DUZENI §4 ve §8. Ek teknik karar O-052: CI, yalnız `pm/**`, `*.md`, `docs/**` değişen gönderimde koşmaz (belge gönderimleri süren testi iptal ediyordu).

- **K-050** (2026-11-21) — "bundan sonraki devam oturumlarının ve yönetim oturumlarının isimlendirmelerini de kafa karıştırmayacak şekilde düzenlesek?" + eski oturumların yönetimi + sürecin gözden geçirilmesi. Uygulama: `pm/YONETIM.md` "Oturum adları" ve "Çalışma ilkeleri" (O-053), `pm/arsiv/SOHBETLER.md`. `fusion-klon-spec` skill'i silindi; yerine `mihenk-gelistirme`.

- **K-051** (2026-11-21) — "önce İE-001 deki cad testleri yapmak istiyorum. sonra ise en az şu belirlediğin 4 parça ile cad ve cam kıyaslaması yapmak istiyorum." Sıra: İE-001 (CAD testi T02–T10), ardından İE-004 (P1–P4 ile Fusion'a karşı CAD ve CAM kıyaslaması; "4 parça" = `test/compare` P1–P4 seti olarak yorumlandı, 3D, uyarlanır, sarma ve 3+2 işlemleri bu parçalar üzerinde kapsanır). G-4 bu kararla kapanır. Skill güncelleme kartları kullanıcı tarafından onaylandı (G-7 kapandı).

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
| O-030 | **Birleşik yol haritası** (BACKLOG.md sürüm sırası): O-019…O-029'un yerine tek onay kalemi | **Onaylandı** (K-033) |
| O-031 | Kod deposu için özel GitHub deposu (`mihenk`): bilgisayar kapalıyken de oturum açılabilir, paralel dallar, Windows'ta otomatik test (Actions) | **Uygulandı** (K-034): `graphiteanimation/mihenk` ana depo; bilgisayardaki `mihenk.git` yedek |
| O-032 | Genel 4 eksen şablonunda A yönü varsayılanı ISO 841 sağ el kuralı (`dir [1,0,0]`); her tezgâh kendi profilinde değiştirir. T-21a kodda "tezgâh teyidi bekleyen" madde olmaktan çıkar | WP-01 ile uygulanıyor |
| O-033 | Geçmiş arayüzü kararları (K-032 devriyle): ana görünüm sol dikey Geçmiş listesi, alt şerit simge düzeyinde özet; tek işlemin kullandığı eskiz o işlemin altına kaynaşır; "Son hali göster" hızlı modellerde otomatik | WP-02; gerekçe `pm/tasarim/GECMIS.md` "Karar" bölümü |
| O-034 | Sürüm yükünü azaltma (K-033 sorusu): 0.3.1 ayrı sürüm olmaktan çıkar, paketleri 0.4'ün ilk bölümü olur; resmi sürüm kapısı yalnız 0.4, 0.5, 0.6'da çalışır; arada her birleşmeden sonra GitHub Actions Windows'ta testleri koşup deneme kurulumu üretir (WP-20) | Uygulanıyor |
| O-035 | Tutucu boşluğu ≤ 0,01 mm (sim düşey toleransı) **engel** (`cam.sim.holder_contact`); 0,01–0,5 mm uyarı (`holder_clearance_low`, eşik sim seçeneği) | Uygulandı (WP-03) |
| O-036 | Kurulu sürüm denetimi: paketli sürümde hata ayıklama girişi kapalı olduğundan Electron testleri kurulu exe'ye karşı koşamaz; yerine `scripts/installed-smoke.mjs` (sessiz kur, aç, kaydet, NC/DXF kaydet, kaldır). Güvenlik sigortaları gevşetilmez | Uygulandı (WP-20); §8 sürüm kapısı bu testi esas alır |
| O-037 | Post alanları: zorunlu alan boşsa her programda engel ve post durur; yalnız `CONDITIONAL_PROPS` (bekleme, G54.1 aralığı, safeRetractZ, yüksek hız, soğutma, rigidTapM, lineNumberMax) program kullanmıyorsa muaf. Anahtarı hiç yazmayan profil varsayılana düşer | Uygulandı (WP-03, M-03) |
| O-038 | Takım yolu kütüphane seçimi (WP-11 raporu `pm/tasarim/TAKIMYOLU-KUTUPHANELERI.md`): 2D ofset/cep kendi `path2d.js` kalır (yay korur); 2D adaptif ve rest kendi kodumuz (FreeCAD kodu alınmaz, temiz yazım), poligon boolean için Clipper2 (Boost); 3D kaba kendi kodumuz (Z kesiti + 2D adaptif); 3D bitirme için önce OpenCAMLib (LGPL, ayrı wasm dosyası) Electron'da yükleme + doğruluk kapısı, geçmezse BVH ile kendi drop-cutter; dexel sim kendi kodumuz; CGAL kullanılmaz (GPL paketler) | WP-12, WP-13, WP-15'te uygulanır; LGPL/WASM dağıtım biçimi sürümden önce teyit edilir |
| O-039 | Setup stok zinciri (T-04): program setup'ı `frame` taşıyorsa önceki setup'ın kalan stoğu başlangıç stoğudur (`stockFrom: 'previous'`, varsayılan; `'blank'` kapatır). Zincir yalnız malzeme çıkarır; önceki setup'ın göremediği her yer (alt kesme, kutu dışı) malzeme sayılır; farklı gövde ya da örtüşmeyen kutu zincirlenmez | Uygulandı (WP-05) |
| O-040 | Delme: stok altına iniş payı = delip geçme + uç boyu; payı aşan iniş engel (`cam.sim.below_stock_excess`), pay içi uyarı. Delik tanımada emin olunamayan durum "kör" sayılır; çap ≥ 2 × derinlik oyuklar `pocketLike` işaretlenir | Uygulandı (WP-05) |
| O-041 | Geçmişte sıra değiştirme: yalnız doğrudan başvuru bağımlılığı taşımayı engeller; aynı gövdeyi değiştiren işlemler arasında taşıma serbesttir ama model (hacim/yüz/gövde sayısı) değişirse kalıcı uyarı + "Geri al" (ve hata varsa "Onar") gösterilir | Uygulandı (WP-02) |
| O-042 | İlişkisel izdüşüm: "emin değilsen dokunma". Sabit noktalar taşınmaz; kullanıcı düzenlemesi bağı düşürür; kaynak kenar imzayla eşlenir (aynı indeks: yan kayma ≤ 25 mm, boy serbest; farklı indeks: ≤ 1 mm ve tek aday), belirsizse `lost` ve görünür işaret; 1 mm'den büyük kayma durum satırında bildirilir. Kalıcı kenar adlandırması yok (çekirdek işi, 1.0 sonrası değerlendirilir) | Uygulandı (WP-09) |
| O-043 | Post: her program durdurma (M00/M01) öncesi M5 + M9, sonrası S…M3 ve soğutma yeniden yazılır; M kodu sadeleştirme durdurma içeren geçişte uygulanmaz. Sayı biçimli eski `stockToLeave` kontur/cepte artık uygulanır (daha fazla pay bırakır) | Uygulandı (WP-06) |
| O-044 | İfade değerlendirici (F-15): tekli eksi üsten sonra uygulanır (`-2^2 = -4`); tanımsız değer (`tan(90)`, `1/0`) hata verir; kullanıcının `pi` adlı parametresi yerleşik sabiti gölgeler; virgül ondalık ayraç kalır (fonksiyon ayracı `;`). Eski belgede değeri değişen parametre açılışta bir kez bildirilir | Uygulandı (WP-08) |
| O-045 | Diş frezeleme: `radialAdjust` ±0,2 mm ile sınırlı; sim diş profilini kaldırmaz, diş bölgesinde yalnız flüt boyu içini serbest sayar (panelde not). Pah "keskin kenar" kipinde sim çözünürlüğü genişlik/10'dan kabaysa uyarı. Kesme verisi yerleşik değerleri yalnız "başlangıç önerisi" | Uygulandı (WP-07) |
| O-046 | Hata günlüğü yalnız yerel dosya (5 × 1 MB), ağ gönderimi yok; yol, belge adı ve tırnaklı içerik maskelenir. `test:all` izlenen dosyayı değiştirmez; altın parça seti (`npm run test:altin`, P1–P4) tabana göre kötüleşmede kalır | Uygulandı (WP-10) |
| O-047 | GitHub itme yetkisi yokken (add_repo reddi) yürütme: kod bulut çalışma alanında, dallar yerel; yedek `mihenk.git` her birleşmede bundle ile eşitlenir. CI yerine: tam `npm run test:all` bulutta (Linux; Chrome `/usr/bin/google-chrome` hazır, Electron xvfb ile); Windows kontrolü sürüm kapısında kurulu sürümün ekran kabulüyle yapılır. Windows kurulum dosyası bulutta Linux üzerinden üretilir (`npm run dist`, NSIS önbelleği elle kuruldu). Yetki gelince CI yeniden ana kapıdır | Uygulanıyor (2026-11-21) |
| O-048 | Sürüm kapısı yükü (K-043, kullanıcının "her sürüm fazladan iş" kaygısı): 0.4 ve 0.5 kapıları depoda etiket + tam `test:all` + altın set ile kapanır; tam Windows kurulum ve `pm/KABUL-WINDOWS.md` ekran kabulü yalnız 0.6'da. 0.5 etiketinde risk azaltmak için kısa Windows dumanı (kur, aç, örnek belge, NC kaydet) yapılır. Paketler bağımsız doğrulanınca dalı beklemeden `master`'a birleşir; etiket o anki `master` | Uygulanıyor |
| O-049 | PDF altlık: vektör PDF için `pdfjs-dist` (Apache-2.0) eklenir; yalnız kullanılan modüller paketlenir (vite), işçi `self` kaynağından, `isEvalSupported:false`, ana belge CSP'si gevşetilmez; sayfa görüntüye çizilip altlık olur. WP-14'ün gömülü JPEG yolu yedek kalır | WP-22a |
| O-050 | Tri-dexel + model ağıyla 3B oyma denetimi arayüzde isteğe bağlı "Ayrıntılı simülasyon" seçeneği; varsayılan kapalı (altın taban ve bellek korunur, ölçü: tri+ağ ≈ 2× bellek). 1.0'da varsayılanın açılması yeniden değerlendirilir. WP-15 3D kaba süresi (büyük parçada > 60 sn) 0.6'da açık kalır; işçide ve iptal edilebilir olduğu için engel sayılmaz, WP-22c'de iyileştirilir | Uygulanıyor |
| O-051 | Başlat menüsü kaldırma kısayolu `Mihenk Kaldır` / `Uninstall Mihenk` (APP adı). Kısayol adı dosya adıdır; APPFULL içindeki "/" yüzünden 0.6.0 adayında Türkçe kısayol hiç oluşmuyordu (kabul adımı 2). Kurulum ve kaldırma eski sürümlerden kalan `Uninstall Mihenk CADCAM.lnk` ve `Mihenk CADCAM Kaldır.lnk` adlarını da siler | Uygulandı (fix-lnk) |
| O-054 | İş emri sırası ve ön koşul (K-051): `IS-EMRI.md`'de emirler yürütme sırasıyla durur; "Ön koşul" satırı sağlanmayan emir alınmaz, sıradaki Hazır emre geçilir. İE-004 Fusion karşılaştırmasında P1–P4 için 2026-11-19 tarihli Fusion çıktıları (`Mihenk\test-fusion-karsilastirma\sonuclar`, işlem başına süre ve yol boyu; 2D, 3D uyarlanır, yatay, 3D kontur dahil) referans alınır; Fusion lisansı yalnız bu çıktılarda olmayan sarma ve 3+2 için gerekir, lisans yetmezse o iki satır "karşılaştırılamadı" yazılır. İE-002 ekran kullanmadığından Hazır yapıldı; düzeltmeler 0.6.1 ile çıkacağından kurulu 0.6.0 üzerindeki CAD testini etkilemez | Uygulanıyor (Y-02) |

## Mihenk dışında kalan (bilgi; Mihenk'i bekletmez)
Kullanıcının Neway profilindeki boş alanlar (maxRpm, ilerleme sınırı, safeRetract, G04 adresi/birimi, G54.1 aralığı), A+ dönüş yönü, O/N sınırları: kullanıcı kendi profil dosyasında doldurur. P1 STEP'indeki Ø4 çubuk sorusu yalnız karşılaştırma testinin yorumunu etkiler.
