# Açık kaynak takım yolu kütüphaneleri: seçim raporu (WP-11, O-023)

Tarih: 2026-11-20. Yöntem: sayfalar WebFetch ile açılıp okundu, npm paketleri `/tmp/wp11` altında kurulup Node'da denendi (depoya paket eklenmedi). Hukuki kesinlik iddiası yok; lisans yorumları "teyit gerekir". GitHub'ın kendi depo/LICENSE sayfaları bu oturumda çoğunlukla açılamadı (izin listesi), bu yüzden birçok lisans satırı npm kaydı, PyPI, kütüphane README'si ya da ayna sayfa üzerinden okundu; hangisi olduğu [K] numarasıyla görünür.

## 1. Mihenk'in bugünkü durumu (kodu tarayarak)
- `package.json` bağımlılıkları: `replicad`, `replicad-opencascadejs` (OCCT), `@salusoft89/planegcs`, `three`. Takım yolu/poligon kütüphanesi yok.
- `src/cam/geom/path2d.js` (503 satır): yay korumalı (L/A parçaları) kendi ofsetleme motoru. Ham ofset + kesişimlerde bölme + uzaklıkla süzme + halka zincirleme; adalı bölge desteği; zincir kapanmazsa `cam.geom.offset_failed`. Kalır.
- `src/cam/ops/pocket.js`: eş merkezli halka ağacı (`ringTree`, `P.offsetRegions`), giriş (helis/rampa/dalma), kapsama denetimi. Adaptif, rest ve açık kenar yok (WP-12'nin işi).
- `src/cam/sim/*`: tek değerli yükseklik haritası (`Float32Array`, XY ızgarası), silindir takım süpürme; alt kesme ve yan yüz modellenmiyor (dosya başlığında yazılı). Dexel simülasyon WP-13.
- Sonuç: 2D'de yay-dostu bir çekirdek var; eksik olan çok-bölgeli boolean/kırpma, adaptif yol, rest, 3D temas (drop-cutter) ve 3D kaba.

## 2. Karşılaştırma tablosu
| Aday | Lisans (kaynak) | Ne sağlar | Bakım göstergesi | JS/WASM | Denendi mi |
|---|---|---|---|---|---|
| FreeCAD `libarea/Adaptive.cpp` | `LGPL-2.1-or-later` başlığı [K1] (ayna sayfa); kök `Area.cpp` BSD-3-Clause [K2]; bağımsız eski depo (kreso-t) "lisans yok" görünüyor [K3] | 2D adaptif boşaltma (sabit kavrama), iç/dış, helis dalış, bırakılan pay [K1]; cep: zigzag/spiral/tek ofset [K2] | FreeCAD içinde yaşıyor; sürüm/tarih doğrulanamadı | Hazır paket yok; kod Clipper1'e bağlı [K1]; emscripten derlemesi denenmedi | Hayır |
| libarea (Heeks/danielfalck) | Kendi kodu New BSD; Clipper (Boost) ile gelir [K4] | Profil + cep ofsetleme | Sürüm yok; yazışmalar 2012 [K4] | Yok | Hayır |
| OpenCAMLib | LGPL-2.1: README/PyPI Ağustos 2018'den beri [K5][K6]; npm kaydı `LGPL-3.0` yazıyor [K7] (tutarsız, teyit) | Drop-cutter, push-cutter/waterline, adaptif örnekleme; silindir, küre, torus, koni, bileşik takım [K5] | Son sürüm 2023.1.11 (11 Ocak 2023) [K6][K8]; sonrası için `dev` etiketi 2023-10-28 [K7]; son commit doğrulanamadı | `@opencamlib/opencamlib@2023.1.11` (npm): emscripten + N-API [K7]. Tarayıcı derlemesi wasm'ı base64 gömülü, 8,1 MB | EVET (aşağıda 3.1) |
| Clipper2 (C++/C#/Delphi) | Boost 1.0: Rust/TS port README'leri "aynısı" diyor [K9][K10]; orijinal LICENSE dosyası açılamadı | Boolean, ofset (InflatePaths, açık/kapalı yol), Minkowski, dikdörtgen kırpma, üçgenleme [K9][K11] | 2.0.1 (19 Aralık; sayfada yıl yok, 1.5.4 Haziran'ın ardından geldiği için 2025 olması beklenir) [K12]; 2.0.0 için sayfada "17 Aralık 2025" [K11] | `clipper2-wasm@0.4.0` (npm, BSL-1.0 alanı, 212 KB wasm) [K13]; saf JS: `clipper2-ts@2.0.1-19` (BSL-1.0) [K10][K14] | EVET (3.2) |
| Cavalier Contours | MIT veya Apache-2.0 (çifte) [K15][K16] | YAYLI polyline paralel ofset, boolean, adalı şekil ofseti [K15] | 0.9.0 (20 Ağustos 2026) [K16] | Rust'ta WASM desteği var [K15]; saf TS portu `cavalier-contours-js@0.1.1` (MIT OR Apache-2.0, 2026-08-08, bağımlılıksız) [K17] | EVET (3.3, JS portu) |
| Manifold | Apache-2.0 [K18][K19] | Mesh boolean, kesit (slice), `CrossSection.offset` (poligon ofseti), SDF'den yüzey [K18]; Clipper2 bağımlılığı sayfada yok | `manifold-3d@3.5.5`, npm değişiklik 2026-11-13 [K19]; GitHub'da sürüm listesi boş görünüyor | `manifold-3d` wasm 532 KB [K19]; yalnız seri çalışıyor [K18] | EVET (3.4) |
| OpenVDB | Apache-2.0'a geçti (12.0 ile; önceden MPL-2.0) [K20][K21]; openvdb.org/license sayfası hâlâ MPL-2.0 diyor [K22] (eski, teyit) | Seyrek hacim/level-set ızgarası; takım yolu stratejisi YOK | Sürüm tarihi sayfada yok | Resmi WASM derlemesi bulunamadı (arama sonuç vermedi). npm `openvdb@0.27.0` yalnız dosya okuyucu, kütüphane değil [K23] | Hayır |
| CGAL | GPL-3+ / LGPL-3+ + ticari (GeometryFactory) [K24]; "2D Minkowski", "Straight Skeleton ve Polygon Offsetting", "Nef" paketleri GPL [K25] | 2D ofset, iskelet, Minkowski | Aktif (6.2 el kitabı var, tarih sayfada yok) | Yok | Hayır |
| three-mesh-bvh | MIT (npm) [K26] | Üçgen ağı için BVH; drop-cutter'ı hızlandırmak için yapı taşı, strateji değil | 0.9.18, 2026-11-03 [K26] | Saf JS | Yüklendi, `MeshBVH` görüldü |
| Kiri:Moto (GridSpace) | MIT rozeti [K27] | Sayfa CAM stratejilerini saymıyor; doğrulanamadı | 5.543 commit; tarih yok [K27] | Tarayıcı uygulaması | Hayır |

Bakılmayanlar: CAMotics, pyCAM, OpenVoronoi (lisansları açılıp okunmadı; GPL olabilecekleri için aday dışı bırakıldı, bu bir doğrulama değildir).

## 3. Denemeler (Node 22, /tmp/wp11)
1. OpenCAMLib: `build/ocl.js` Node'da doğrudan yüklenmedi ("not compiled for this environment": yalnız web ortamı için derlenmiş). `window/document` taklidiyle yüklendi (~0,5 s, `BallCutter`, `PathDropCutter`, `Waterline`, `AdaptivePathDropCutter` görüldü); z=5 düzlemine küre takımla drop-cutter: 18 nokta, z=5 döndü. Sonuç: Electron renderer/worker (web ortamı) için uygun görünüyor, gerçek ortamda ayrıca denenmedi. npm paketi ayrıca Windows x64 için N-API ön derlemeleri taşıyor (Electron ABI uyumu denenmedi).
2. Clipper2-wasm: 10x10 kareyi `-1` ile içe ofsetledi, 1 yol/4 nokta döndü. npm paketinde LICENSE dosyası yok (yalnız `package.json` alanı) → yükümlülük için orijinal Boost metni eklenmeli.
3. cavalier-contours-js: iki yay + iki çizgili yuvarlak uç kapalı polyline'ı `parallelOffset(1)` ile ofsetledi, 1 halka, alan küçüldü, ~7 ms. Yay korunuyor (bulge gösterimi).
4. manifold-3d: `CrossSection.square.offset(-1,'Round')` alan 64 (8x8, beklenen), `Manifold.slice(5)` çalıştı.

## 4. Öneriler (ihtiyaç başına)
| İhtiyaç | Karar | Gerekçe | Risk |
|---|---|---|---|
| 2D ofset/cep (bugünkü eş merkezli) | KENDİMİZ YAZDIK, kalsın | `path2d.js` yayları koruyor, adaları işliyor, testli. Clipper2 poligon tabanlı; yaylar parçalanır, G2/G3 kaybolur | Köşe durumlarında `offset_failed`; bunlar için Clipper2'yi yalnız test karşılaştırıcısı (oracle) yapmak ucuz |
| 2D adaptif (WP-12) | ESİNLEN: algoritmayı JS'te yeniden yaz; geometri omurgası Clipper2-wasm | FreeCAD Adaptive2d fikri (kavrama alanını hedefte tutma, temizlenen alanı izleme, giriş noktası seçimi) [K1] yazılabilir; doğrudan C++ derlemesi Clipper1 + emscripten kurulumu ve LGPL yükümlülüğü getirir, Mihenk yay kurallarına uymaz. Clipper2 ile süpürülen alan boolean'ı hızlı | Adaptif yolun doğruluğu zor (tur kesişimi, ince duvar). FreeCAD kodu satır satır çevrilirse LGPL türev eser sayılabilir: temiz oda yaklaşımı (yalnız yayımlı tanım/benzer yöntem açıklaması) + "teyit gerekir" |
| Rest (WP-12) | KÜTÜPHANE AL (yalnız poligon aracı) + KENDİMİZ YAZ | Rest = önceki takımın süpürme alanı çıkarılmış stok; Clipper2 boolean/ofset yeterli. Mantığı (hangi takım neyi kesti) biz yazarız | Poligonlaştırma toleransı: çıktı yolu yay uydurmayla (WP-15 kapsamındaki "yay uydurma") yayına çevrilmeli |
| 3D kaba (WP-15) | KENDİMİZ YAZ | Stok yükseklik haritasında Z seviyesi kesiti → 2D adaptif/ofset motorunu her seviyede çağırmak. OpenCAMLib'de adaptif boşaltma yok (waterline + drop-cutter var) [K5]. Model mesh ise Manifold `slice` seviye kesiti verebilir (denendi), OCCT kesiti de seçenek | Z-seviye geçişleri arası "merdiven" payı; seviye kesiti alma maliyeti |
| 3D bitirme / drop-cutter (WP-15) | KÜTÜPHANE AL: OpenCAMLib (arayüz soyutlaması arkasında), yedek = kendimiz yaz | Küre/torus/koni takımlar için hazır, test edilmiş drop-cutter + waterline; sıfırdan yazmak güvenilirlik işi. Üçgen girişi: OCCT tessellation. Yedek: yükseklik haritası + `three-mesh-bvh` ile düz/küre takım drop-cutter yazmak | (a) son sürüm Ocak 2023, bakım durumu doğrulanamadı; (b) web ortamı derlemesi, wasm base64 gömülü 8,1 MB; (c) LGPL (bölüm 5); (d) npm `LGPL-3.0` / README `LGPL-2.1` çelişkisi. WP-15 ilk dilimi bir "geçiş kapısı" olsun: Electron'da yükleme + iki bilinen yüzeyde sonuç doğrulaması |
| Dexel sim (WP-13) | KENDİMİZ YAZ | OpenVDB'nin WASM'ı bulunamadı, seyrek level-set zaten dexel değil; Manifold mesh boolean ile talaş simülasyonu pahalı (denenmedi). Mevcut `sim/heightmap.js` tek değerli dexel'in özel hâli; üç yönlü dexel doğal genişleme | Bellek ve süre; worker'a taşıma WP-13'te |
| Aday dışı | CGAL | Gerekli paketler GPL [K25]; SORULAR.md sınırı GPL'yi dışlıyor. Ticari lisans teorik seçenek, öneri değil | — |

## 5. Lisans yükümlülükleri (hukuki kesinlik değil, teyit gerekir)
- **Boost 1.0 (Clipper2 ve portları):** telif ve lisans metni kaynak dağıtımlarında korunmalı; yalnız derlenmiş ikili dağıtımda metin zorunluluğu hafif, yine de "Hakkında/Üçüncü taraf" listesine eklenmeli. `clipper2-wasm` paketinde LICENSE dosyası olmadığından orijinal metin ayrıca alınmalı.
- **MIT / Apache-2.0 (Cavalier, Manifold, OpenVDB 12+, three-mesh-bvh):** telif bildirimi + lisans metni; Apache-2.0'da NOTICE dosyası varsa taşınır.
- **LGPL (OpenCAMLib, ve alınırsa FreeCAD Adaptive):** WASM tek bir ikili olduğu için "kütüphaneyi kullanıcı değiştirebilsin" şartı pratikte statik bağlamaya benzer yorumlanabilir. Önerilen önlem: `ocl` wasm/JS'i uygulamadan AYRI, değiştirilebilir bir dosya olarak gönder (npm `browser.js` gibi base64 gömülü paketi sıkıştırıp ana pakete katma); lisans metni ve ilgili sürümün kaynağına yazılı yönlendirme (bağlantı); Mihenk kendi kodunu LGPL'ye zorlayacak biçimde birleştirmemek. OCCT (`replicad-opencascadejs`) zaten benzer bir LGPL kullanımı; aynı dağıtım kalıbı izlenebilir. Bu yorum teyit gerektirir.
- **GPL:** aday dışı (CGAL paketleri; denetlenmemiş CAMotics/pyCAM).
- Dosya bazlı fark örnekleri: FreeCAD ağacında `Adaptive.hpp` LGPL-2.1-or-later iken `Area.cpp` BSD-3-Clause [K1][K2]; bu yüzden FreeCAD'den alınacak her dosyanın başlığı tek tek okunmalı.

## 6. Doğrulanamayanlar
- Clipper2 orijinal `LICENSE` dosyası ve 2.0.1'in yılı (yalnız çıkarım).
- OpenCAMLib ve FreeCAD libarea için son commit tarihi; Manifold GitHub sürüm tarihleri.
- FreeCAD'in `Adaptive.cpp` başlığı birincil depodan değil Hugging Face aynasından okundu [K1]; bağımsız kreso-t deposunun lisansı "yok" görünüyor [K3], FreeCAD'e girişteki lisanslama yolu belirsiz.
- OpenVDB WASM derlemesi var mı; 12.0 çıkış tarihi.
- OpenCAMLib gerçek Electron ortamında çalışması; N-API ön derlemelerinin Electron ABI'siyle uyumu.
- Kiri:Moto CAM yetenekleri ve dosya bazlı lisansları.

## 7. Kaynaklar (açılıp okunanlar)
- [K1] https://huggingface.co/AbdulElahGwaith/FreeCAD/blob/main/src/Mod/CAM/libarea/Adaptive.hpp
- [K2] https://huggingface.co/AbdulElahGwaith/FreeCAD/blob/main/src/Mod/CAM/libarea/Area.cpp
- [K3] https://kandi.openweaver.com/python/kreso-t/FreeCAD_Mod_Adaptive_Path ; https://gitee.com/BinGo2019/FreeCAD_Mod_Adaptive_Path
- [K4] https://www.pro-linux.de/cgi-bin/DBApp/jump.cgi?ID=20807 (danielfalck/libarea sayfası); https://gh.r-mj.com/Heeks/libarea
- [K5] https://github.com/aewallin/opencamlib
- [K6] https://pypi.org/project/opencamlib/
- [K7] `npm view @opencamlib/opencamlib` (https://www.npmjs.com/package/@opencamlib/opencamlib) ; paketin README.rst'i
- [K8] https://github.imc.re/aewallin/opencamlib/releases (GitHub sürüm sayfası aynası)
- [K9] https://docs.rs/crate/clipper2-rust/1.0.3/source/README.md
- [K10] https://cdn.jsdelivr.net/npm/clipper2-ts@2.0.1-17/README.md ; kurulu `clipper2-ts/LICENSE` (Boost metni okundu)
- [K11] https://angusj.com/clipper2/Docs/Overview.htm
- [K12] https://www.github.com/AngusJohnson/Clipper2/releases
- [K13] https://eriksom.github.io/Clipper2-WASM ; `npm view clipper2-wasm`
- [K14] `npm view clipper2-ts`
- [K15] https://raw.githubusercontent.com/jbuckmccready/cavalier_contours/master/README.md
- [K16] https://docs.rs/crate/cavalier_contours/0.7.0
- [K17] `npm view cavalier-contours-js` ve kurulu paketin README/LICENSE-MIT/LICENSE-APACHE dosyaları
- [K18] https://github.com/elalish/manifold
- [K19] `npm view manifold-3d`; kurulu paketin `LICENSE` (Apache-2.0) dosyası
- [K20] https://raw.githubusercontent.com/AcademySoftwareFoundation/openvdb/master/README.md
- [K21] https://phoronix.com/news/ASF-OpenVDB-12.0
- [K22] https://openvdb.org/license
- [K23] `npm view openvdb`
- [K24] https://www.cgal.org/license.html
- [K25] https://doc.cgal.org/6.2/Manual/packages.html
- [K26] `npm view three-mesh-bvh`
- [K27] https://github.com/GridSpace/grid-apps
