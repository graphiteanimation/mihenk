# AtolyeCAD çekirdek düzeltmeleri (KERNEL-TEST-REPORT F-01…F-26)

Durum: ilerledikçe güncellenir (son durum bölüm 2 ve 4). Ölçüt: ya doğru sonuç ya açık hata (`{ok:false, error:{code, params}}`); sessiz yanlış yok.

Kod: `src/kernel/kernel.js` (özellikler, yeniden hesap, sorgular), `src/kernel/topo.js` (OCCT geçmişli işlemler, geçerlilik kapısı), `src/kernel/naming.js` (kalıcı adlandırma), `src/kernel/sketch.js` (profil seçimi/doğrulama/eğriler), `src/kernel/worker.js` (`reset` komutu).

## 1. Kalıcı topolojik adlandırma (F-01, F-21)

**Şema.** Her gövde kaydı `{shape, fn, name}` taşır; `fn[i]` = i'inci yüzün (keşif sırası) **ad kümesi** (sıralı dize dizisi).
- Ad = `özellik:rol[:ayırt edici]`. extrude yan yüzü `e1:side:<sketch varlık kimliği>`, kapaklar `e1:start` / `e1:end` (birden çok profil seçiliyse `:<dış döngü varlıkları>` eki); revolve `r1:rev:<varlık>` (+ açı < 360° ise start/end); delik `h1:wall|bottom|cbore|cbore-floor|csink:<nokta varlık kimliği>`; kutu `b1:x-|x+|y-|y+|z-|z+`; silindir `side|top|bottom`; küre `side`; yuvarlatma `f1:blend<kenar adı>`, köşe `f1:vblend<…>`; pah `cham`; kabuk iç yüzü `s1:inner(f:<kaynak yüz adı>)`; desen/ayna örneği `p1[<örnek>]<kaynak ad>` (dikdörtgen `i.j`, dairesel `k`, ayna `m`); kopya `mv[c]<ad>`; içe aktarma `imp:i<katı>.<sıra>:<yüzey türü>`.
- Gövde değişince adlar **OCCT geçmişiyle** miras alınır: `BRepAlgoAPI_Fuse/Cut/Common` (tek çağrı, çok takım), `BRepFilletAPI_MakeFillet/MakeChamfer`, `BRepOffsetAPI_MakeThickSolid`, `BRepBuilderAPI_Transform`, `BRepPrimAPI_MakePrism/MakeRevol` doğrudan `R.getOC()` ile kurulur; `Modified()/Generated()/IsDeleted()` (topo.js `propagate`). Birleşen yüzler (SimplifyResult) tüm adları taşır (takma adlar).
- Bölünen yüz: parçalar aynı adı taşır; ayırt edici `nb` = komşu yüz adlarından açgözlü seçilmiş en küçük küme.
- KENAR adı `{a, b, nb?}` = iki komşu yüzün adı (sırasız); aynı çifti paylaşan kenarlarda `nb` = uç köşelerdeki üçüncü yüzlerin adları.
- Ref = `{body, kind, name, hint:{fp, geom, idx, n}}` (+ ölçü bilgileri). Çözüm **yalnız ada göre** (naming.js `resolveName`); 0 aday → `ref.lost_face|edge`, >1 → `ref.ambiguous_face|edge`. `hint` yalnız hata metni ve göç içindir.
- Eski Ref `{body, idx, n, fp, geom}`: yalnız `n` eşit, `fp` toleransla (1e-6·max(10,|fp|)) aynı ve `geom` türü aynıysa bir kez kabul edilir; yeni ad çekirdekte saklanır, `rebuild().refUpgrades` ile arayüze bildirilir. Aksi `ok:false`.
- Yüz üzerine sketch (`plane.kind:'face'`) aynı çözümü kullanır.

**Bilinen sınırlar (ad üretilemeyen durumlar → seçim kabul edilmez, özellik `ok:false` ve `ref.unnamed`):**
- OCCT'nin geçmiş vermediği ve geometrik yedeğin (kenar orta noktası tek yüz üzerinde) tek aday bulamadığı süpürme yüzleri. (Revolve'da eksene dik kenarlardan üretilen düzlemler için `Generated()` boş döner; yedek bunları adlandırıyor.)
- Kaynak sketch varlığı bulunamayan profil kenarları (findRegions `ent` vermiyor ve geometriden tek varlık eşleşmiyor).
- İki parçası birebir aynı komşu kümesine sahip bölünmüş yüz/kenar: `ref.ambiguous_here` (describe `name:null, nameError`).
- Profil seçimi (`profiles:[dizin]`) hâlâ findRegions sırasına bağlı: çekirdek arayüzle aynı işlev ve aynı girdiyi kullanır; sketch düzenlenip bölge sırası değişirse dizin başka bölgeyi gösterebilir (arayüz tarafında bölge kimliği gerekir — ayrı iş).

- Ek ret kuralı (yedek değil): ad tek elemana çözülse de `hint.geom` ile çözülen elemanın türü farklıysa `ref.changed`. Neden: arayüz sketcher'ı silinen varlığın kimliğini yeni çizilen varlığa yeniden veriyor (`src/ui/sketcher.js` `_id`: en küçük boş numara). Bu, adı başka bir geometriye bağlayabilir; tür değişirse yakalanır, aynı tür ve komşulukta yeni çizilen varlık "aynı varlık" sayılır. **Öneri (arayüz, ayrı iş): sketch varlık kimlikleri hiç yeniden kullanılmasın (artan sayaç).**

## 2. Bulgu tablosu

Satır numaraları bu commit'teki dosyalar içindir. "Kanıt" = önceden başarısız olup şimdi geçen test.

| No | Durum | Kök neden | Düzeltme (dosya:satır) | Kanıt testi |
|---|---|---|---|---|
| F-01 | Düzeldi | Ref indeks+n ile çözülüyor, parmak izi bakılmıyordu | Köken tabanlı adlandırma: topo.js:69 `propagate`, :87 `boolean`, :104 `edgeBlend`, :125 `shell`, :157 `transform`, :195 `sweepResult`; naming.js:48/64/89; kernel.js:51 `resolveIdx`, :65 `legacy` | naming.mjs N1 (11 sıra permütasyonu, hepsi doğru köşe), ref-adversarial R1–R4 |
| F-02 / S-02 | Düzeldi | İçe aktarma önbelleği ve özellik anahtarı kimlik/uzunluğa bağlı | SHA-256 içerik özeti (kernel.js:606 `featKey`, `importKeyAsync`), kullanılmayan girdiler silinir (:442), ayrıştırma hatası yalnız o özelliği `ok:false` yapar; `reset()` :20; worker `reset` komutu worker.js:20 | state-bugs X1, kernel.test F-02 + reset, security/poc_kernel P2 (B=8000) |
| F-03 | Düzeldi | flip yalnız d'yi çeviriyordu | kernel.js:163 (iki yön için [-d2,d] / flip [-d,d2]) | feature-geo E6, kernel.test F-03 |
| F-04 | Ayrı iş (profiles.js, başka ajan; çözülmüş) | — | Çekirdek ek olarak findRegions `issues` (kapanmayan/tutarsız/kesişim hatası) → `sketch.unreliable` (sketch.js:193) ve bölünmemiş kesişim/T-kavşak denetimi (sketch.js:230) | profiles.mjs P10/P10b/P5b/P19 geçiyor |
| F-05 | Düzeldi | Geçerlilik denetimi yoktu | Her özellikten sonra kapı (kernel.js:477 → topo.js:236 `validity`: BRepCheck_Analyzer + katı var + serbest yüz yok + sonlu kutu + hacim>0) → `geom.invalid`; girdi: kenar < 1e-4 mm `sketch.edge_too_short` (sketch.js:220), kendini kesme/T-kavşak/teğet delik `sketch.self_intersect`, profil yüzü BRepCheck | edge-cases S02, S11, S28 |
| F-06 | Düzeldi | Açı doğrulanmıyordu | 0<|a|≤360 (kernel.js:186) `revolve.angle_range` | edge-cases R01/R02/R04, kernel.test F-06 |
| F-07 | Düzeldi | Desen kaydı kaynak konumu + N−1 sayı | Her örnek için dönüştürülmüş konum ve yön (kernel.js:421), `positions`/`dirs`/`count`/`bodies`/`lost`; son modelde gerçekten var olmayan konumlar çıkarılır (kernel.js:676 `holesOut`); gövde taşınınca/kopyalanınca/desenlenince delikler de taşınır | part-a A-holes, part-d D-holes, kernel.test F-07 |
| F-08 | Düzeldi | Yalnız sınır kutusu çakışmasına bakılıyordu | Kesme/birleştirme hacim değişimi (kernel.js:107 `op.no_effect`); delik konumu başına ad denetimi (`hole.no_material`, :359); desen örneği başına (`pattern.no_effect`, :418); hayalet delik yazılmaz | edge-cases B03/B04/B05/H21/H22/H23, feature-geo PT2, kernel.test F-08 |
| F-09 | Düzeldi | replicad translate/rotate kaynağı siliyor | Kendi `BRepBuilderAPI_Transform` (kopya, topo.js:157); hiçbir yerde kaynak silen replicad yöntemi yok | state-bugs X2/X2b, edge-cases D21 |
| F-10 | Düzeldi | `[]` doğru-yorumlanıyordu | `sketch.no_profile_selected` (sketch.js:200); mesh gövde başına try/catch | edge-cases S16/R17, state-bugs X3 |
| F-11 / S-08 | Düzeldi | Sınır yok; zincirleme fuse O(n²); ağ toleransı kıskacı | Ölçü 1e-3…1e5 mm (kernel.js:27 `dim`), koordinat ≤ 1e5; desen ≤ 2000 (:390); tüm takımlar tek BOP çağrısında (topo.js:87); ağ toleransı model boyutuna oranlı, üst kıskaç kaldırıldı (kernel.js:659) | edge-cases V03/V12/V16/V24/H07 (artık hata), P16; perf.mjs; security/poc_dos_pattern (0,7 s'de döner) |
| F-12 | Düzeldi | Bilinmeyen değerler varsayılana düşüyordu | op/dir/extent/kind/eksen/düzlem adı doğrulaması; eksik revolve ekseni hata (kernel.js:195); combine op | edge-cases S21, B20, B21, R14, P13, P15 |
| F-13 | Düzeldi | Boş kesişim gövdeyi siliyordu; hedef=takım | `op.intersect_empty` (kernel.js:115), `combine.self` (:269) | edge-cases B13/B14/B16/B17 |
| F-14 | Düzeldi | Aralık denetimi yok | revolve açı 0 hata; derinlik/çap sınırları; havşa derinliği ≥ derinlik `hole.cbore_depth`/`hole.csink_depth`; konik havşa açısı (0,180) | edge-cases R04, H06, H09, H10, H11, H12 |
| F-15 | Düzeltilmedi | expr.js (sahiplik dışı) | — (öneri: tekli eksi öncelik, `;` dışı virgülde hata, sonsuz/çok büyük değer, kullanıcı `pi`'si) | edge-cases V31/V32/V35 "BEKLENİYOR: ayrı iş" |
| F-16 | Çekirdek tarafı düzeldi | profiles.js bölme eksikleri | Yeni findRegions (başka ajan) + çekirdek kesişim/T denetimi | profiles.mjs 88/88 |
| F-17 | Düzeldi | `StlAPI_Reader` WASM'da istisna | Kendi STL ayrıştırıcısı (ikili/ASCII) + `BRepBuilderAPI_Sewing` + `MakeSolid` + yönelim + eş düzlemli birleştirme (kernel.js:632); ≤ 50 000 üçgen | edge-cases I17, part-h STL içe alma |
| F-18 | Düzeldi | İçe aktarmada geçerlilik/ağ denetimi yok | İçe aktarılan her katı `validity` + ağ (NaN/boş) denetimi; diğer gövdelerde ağ hatası son değiştiren özelliği `ok:false` yapar | edge-cases I14 |
| F-19 | Düzeldi | `describe` gövde türünü desteklemiyordu | `queryEl` gövde/yüz/kenar (kernel.js:545 `measure`) | measure.mjs M2, kernel.test F-19 |
| F-20 | Düzeldi | (1) `NCollection_List.Append` dönüşü silinmiyordu, (2) replicad `makeLine`/`makeThreePointArc`/`measureDistanceBetween` kurucu nesneyi silmiyor → kenar ve onu paylaşan şekiller (üçgenlemeleriyle) bellekte kalıyordu | topo.js:60 `app`, :230 `makeLine/makeArc3/makePolygon`, :218 `pointFaceDist`; tüm geçici OCCT nesneleri `scope()` ile silinir | bölüm 3 ölçümleri; perf.mjs |
| F-21 | Kısmen | Adlar artık parametreden bağımsız; kalan retler gerçekten kaybolan elemanlar | Ad tabanlı çözüm | param-sweep: 170 doğru, 0 sessiz yanlış; kalan 3 ret (mil: kademe kaldırılınca test kurucusu varlık kimliklerini yeniden numaralıyor → ad kaybolur, açık hata) |
| F-22 | Düzeldi | Belge doğrulanmıyordu | `doc.invalid`/`doc.no_features`/`feature.invalid` (kernel.js:455), istisna yok | edge-cases D05/D06/D08/D09, kernel.test F-22 |
| F-23 | Düzeldi | `acos(|n1·n2|)` | `angle` = iki yüz arası iç açı [0,180] (dışa bakan normallerden), `normalAngle`, `planeAngle` [0,90] ayrıca | measure.mjs M6/M6b |
| F-24 | Ayrı iş (profiles.js) | — | — | profiles.mjs P18 geçiyor (yeni findRegions) |
| F-25 | Düzeldi (profiles.js + çekirdek) | Yinelenen çizgiler | Yeni findRegions yinelenenleri ayıklıyor; eski sürüm için çekirdek `sketch.duplicate_geometry` | edge-cases S09 |
| F-26 | Değiştirilmedi | STL kiriş hatası (eğrisel yüz) | STL dışa aktarma toleransı 0.01 mm kaldı; CAM için kesin yol STEP (B-rep). Mil −3.7e-4 hacim sapması STL'in doğasıdır | part-h (2e-3 eşiği geçiyor) |
| S-14 | Düzeldi | Bozuk STEP sonrası istisna tüm hesabı düşürüyordu | Özellik başına try/catch, WASM istisnası → `occt` kodu (kernel.js:588, errors.js) | security/poc_corrupt_import (hepsi RED) |

Elips / elips yayı / spline profil segmentleri (profiles.js yeni türleri) gerçek OCCT eğrisiyle kurulur (sketch.js:135 `segEdge`, :156 `splineEdge` — `GeomAPI_Interpolate`, noktalardan geçer); bilinmeyen tür `sketch.unknown_segment`. Kanıt: kernel.test "elips alanı", "yarım elips (ccw/cw)", "spline enterpolasyon noktalarından geçiyor", "kapalı periyodik spline", "elips extrude hacmi".

Zaman aşımı/iptal: arayüz işçiyi öldürüp yeniden başlatabilir; çekirdekte `reset()` ve worker `reset` komutu aynı temiz durumu verir (kernel.test "reset sonrası sonuç = temiz çekirdek").

## 3. Performans ve bellek (önce → sonra)

Aynı makine, Node 22, `node --expose-gc test/models/perf.mjs` (önce: düzeltme öncesi kaynak kopyası; sonra: bu sürüm).

| Durum | Önce | Sonra |
|---|---:|---:|
| Dikdörtgen desen 50 / 100 / 200 / 400 / 800 delik | 0,75 / 2,6 / 8,5 / 32,9 / 134 s | 0,33 / 0,68 / **1,77** / 5,9 / 19,3 s |
| Dairesel desen 50 / 100 / 200 / 400 delik (tümü plakada) | 0,48 / 1,8 / 6,5 / 26,2 s ¹ | 0,27 / 0,53 / 1,48 / 3,9 s |
| Tek sketch'te 200 nokta + delik | 8,7 s | 1,7 s |
| Küre çap 100 / 1000 / 3000 / 6000 | 0,03 / 0,25 / 1,2 / 4,1 s | 0,03 / 0,03 / 0,03 / 0,03 s |
| Küre çap 1e6, desen 5000 | kilitlenme | anında açık hata (`value.out_of_range`, `pattern.too_many`) |
| 60 özellikli belge soğuk / son özellik değişti / ilk özellik değişti | 2,2 / 0,52 / 1,8 s | 2,6 / 0,28 / 2,7 s ² |
| Flanş 30 tur rebuild süresi | 131–212 ms | 127–243 ms |

¹ Eski ölçümde kaynak delik plakanın dışına taşan bir dairede idi; yeni sürüm bunu `pattern.no_effect` ile reddettiği için ölçüm plaka içine alındı (aynı delik sayısı). ² Her özellikten sonraki geçerlilik kapısı (BRepCheck) ve adlandırma maliyeti.
800 delikte sürenin ~%85'i görüntü ağı (BRepMesh) üretimi; boolean artık tek çağrı (doğrusal).

| Bellek (perf.mjs, flanş, her 30 turda gc) | rss | JS heap | external |
|---|---:|---:|---:|
| Önce: başlangıç → 30 → 150 tur | 312 → 352 → 440 MB (+128) | 23,5 → 39 MB | 102 → 152 MB |
| Sonra: başlangıç → 30 → 60 → 150 tur | 309 → 337 → 348 → 349 MB (+40) | 23,5 → 23,7 MB | 102 → 103 MB |

Sonra: 60→150 turda +1,4 MB (≈0,015 MB/tur); 300 tur denemesinde 60→300 +4 MB ve WASM belleği 100 MB'de sabit (önce 240. turdan sonra 144 MB'ye büyüyordu). İlk 30 turdaki +28 MB tek seferlik ısınmadır (önceden ayrılmış 100 MB WASM yığınının sayfalarına ilk dokunuş + WASM JIT kademesi); sonra düz. Hedef "<20 MB / 150 tur" kararlı durumda sağlanıyor, soğuk başlangıçtan ölçülünce sağlanmıyor (+40 MB, ısınma dahil).
Kök nedenler (F-20) ve WASM yığın kullanımı ölçüm yöntemi: 64 KB bloklarla bellek büyüyene dek ayırıp boş alanı sayma (geçici betik); delik özelliği önce ≈36 KB/tur, flanş ≈250 KB/tur → sonra ölçüm gürültüsü içinde (≤0).
