# Mihenk — T-01…T-24 toplu düzeltme planı (O-029, onay bekliyor)

Tarih: 2026-11-19 · Temel: commit 21363ba (Mihenk-repo-2026-11-19f.zip), geri yüklendi, `npm run test:all` temel çizgi alındı.
Kaynak: P1–P4 MIHENK-RAPOR.md, DEVAM.md. Kural: kod değişikliği ancak bu plan onaylanınca başlar (O-029). Bu plan makineye gidecek G-code üretmez.

Sıra (DEVAM): **Dalga 1 = grup 1 + grup 5 → Dalga 2 = grup 3 + grup 4 → Dalga 3 = grup 2.** Grup 6 küçük işler; önerim Dalga 2'nin sonuna eklenmesi (O-029'un parçası).

Her madde: Sorun → Düzeltme → Dosya → Kabul testi → Model.
Model: **O** = Opus (çekirdek/sim/geometri), **S** = Sonnet (sınırlı kod), **H** = Haiku (kozmetik/test yazımı). Kararlar ana modelde (K-015/K-022).

---

## Dalga 1 — Grup 1: sim kapısının yanlış/aşırı BLOCK'ları

| T | Sorun (kanıt) | Düzeltme | Dosya | Kabul | Model |
|---|---|---|---|---|---|
| T-22 | Sim kılavuzu majör çaplı (Ø3) dolu silindir süpürüyor; STEP deliği Ø2,459 → her kılavuz deliği gouge BLOCK (P4 S1 o12 ×6) | `tap` için süpürme çapı = diş dibi çapı: `thread.minor` varsa o, yoksa ISO metrik `major − 1,0825·pitch` (M3×0,5 → 2,459). Majör çap yalnız "diş derinliği" bilgisi olarak kalır | sim/tool.js:5 (FLAT kümesinden `tap` ayrılır), sim/index.js:159-165 | P4 S1 o12 gouge 6 → 0; birim test: M3/M6/M10 dip çapları | S |
| T-17 | `sim.gouge` derinliği düşey fark (`m − zb`): 0,03 mm yarıçap farkı "11,17 mm" görünüyor (P2 o7, P4 o9) | Raporlanan değer = yatay+düşey en küçük girme (komşu hücrelerde model yüzeyine en yakın mesafe, takım yarıçapı kadar arama). Kod adı aynı, parametre `depth` + yeni `radial`. BLOCK ölçütü değişmez (gerçek oyma yine BLOCK) | sim/index.js:86 | P2 o7 rapor ≈0,03 mm radyal; P4 o9 ≈0,05; o11 0,24 aynı kalır | O |
| T-08 | `body_short` ilk stok üstünü esas alıyor; yüzeyleme / önceki setup ile inen yüzey sayılmıyor (P1 S1 o5, P3 S1 ×4, P4 S1 o7) | Kapı 4 derinliği = işlem başındaki **yerel** stok yüksekliği (sim yükseklik haritasında yol bandı içindeki en yüksek hücre) − zMin. Sim yoksa eski muhafazakâr hesap + uyarı `body_short_conservative` | gates.js:84 (+ sim'den işlem başı harita özeti) | P3 S1 body_short 4 → yalnız gerçekten aşanlar; P4 o7 (27 > 25) **BLOCK kalır** | S |
| T-08 ek | P4 T22: tutucu boşluğu tam 0 mm, uyarı yok | Yeni uyarı `cam.sim.holder_clearance_low` (en küçük boşluk < 0,5 mm, eşik makine profilinde) | sim/index.js:78 | P4 S1'de uyarı çıkar | S |
| T-06 | Ø2 yarık: body_short + holder_collision doğru yakalandı. Ayrıca STEP'te yarık içinde Ø4 katı çubuk → gouge ×19 | Kod değişmez (doğru davranış). Ø4 çubuğun **STEP'te kasıtlı olup olmadığı kullanıcıdan teyit** (bilinmiyor) | — | Teyit sonrası P1 S1 yeniden koşu | — |
| T-24 | `camSection` döngüleri 1e-5·ölçek ile zincirleniyor; döngüde 5,85·10⁻⁴ mm açıklık kalıyor, eskiz `NODE_TOL` 1e-6 birleştirmiyor → ada kaybı (teyitsiz) | Önce **başarısız test** (P4 dolgu gövdesi Y29,05). Doğrulanırsa: camSection çıkışında uçları zincir toleransına "yapıştır" (snap) ve döngüyü kapat; profiles.js'de toleransı mutlak değil ölçeğe bağlı yap | kernel/cam.js:151/179, shared/profiles.js:9 | Test: açıklık 0; ada sayısı Fusion'la aynı | O |

Beklenen sonuç (Dalga 1 sonrası, tahmin): P4 S1 BLOCK 17 → ≤11 (kalanlar gerçek: Ø6,1 > Ø6 ×4, 140°/118° uç ×6, T22 27 > 25 ×1 — bunlar plan/takım uyuşmazlığı, Mihenk'in doğru davranışı). P3 S1'de body_short kısmı kalkabilir; 5× `flute_exceeded` (o3a) gerçek mi, Dalga 2'deki T-04 ile yeniden bakılır.

## Dalga 1 — Grup 5: 3+1 A işareti

| T | Sorun | Düzeltme | Dosya | Kabul | Model |
|---|---|---|---|---|---|
| T-21a | Plan S2 A+90 / S3 A−90; Mihenk S2 `A270`, S3 `A90` yazıyor (işaret ters, `A.dir=[−1,0,0]`). Fusion yalnız A0 yazıyor | Kodda tek yer: `index.js:83` `phi = aAngle·sign(A.dir[0])`. Doğru işaret **tezgâhta teyit edilmeden kod değişmez**. Teyit cnc-proje-hafizasi projesinde yapılır (kesmesiz, komparatörle A+ yön gözlemi); sonuç Neway profilinin `A.dir` alanına yazılır | machines/neway-*.js | Teyitli `A.dir` + P3/P4 3+1 setup'larının A kelimeleri planla aynı | ana model + kullanıcı |
| T-21b | A−90 NC'de A270 (`shortest` normalizasyonu); M80V'nin dönüş yolu teyitsiz | Çıkış biçimi makine profiline: `A.wrap: 'signed'` (−180…180, varsayılan) / `'0-360'`. Teyit gelene kadar `signed` + NC başlığında mevcut `a_dir_unverified` uyarısı kalır | post/fanuc-base.js:156-157 | P3 S2 / P4 S2 `A-90.` | S |
| — | Fusion betiği 3+1'de yalnız A0 yazıyor | Karşılaştırma betiği sorunu (Mihenk değil). Fusion deneme lisansı **23 Kasım**'da bitiyor: düzeltilecekse önce bu yapılmalı | test-fusion betiği | Fusion NC'sinde A±90 | S |

---

## Dalga 2 — Grup 3: setup'lar arası stok / delik

| T | Sorun | Düzeltme | Dosya | Kabul | Model |
|---|---|---|---|---|---|
| T-04 | Önceki setup stoğu yok; her setup aynı kutu → hayalet stok BLOCK'ları (P1 S3 rapid_in_stock ×2, holder_collision ×2). P1 ek deneyi: `initialHeightmaps` ile kayboluyor | Setup n'in son yükseklik haritası → kapalı stok ağı (dünya çerçevesinde) → setup n+1 çerçevesinde yukarıdan ışın izleme → `initialHeightmaps`. Setup seçeneği `stock: 'fromPrevious'` (Fusion karşılığı) varsayılan. Alt kesme (undercut) kaybı muhafazakâr yönde (malzeme var sayılır) | cam/index.js (resolveSetup), sim/heightmap.js, program.js | P1 S3 BLOCK 4 → 0 (yalnız gerçek body_short kalır); P2 S2 simi S1 boşluğunu görür | O |
| T-14 | `through` delik delik çıkışına değil model kutusunun en altına iniyor (drill.js:82); P2'de flanş 10,16 iken plaka altına, P3/P4'te stok altına 0,911 / 0,11 mm | Dip = delik ekseninde modelden **son çıkış** noktası (çekirdekte ışın kesişimi) − breakThrough − uç boyu. Delik özelliği varsa onun uzunluğu. Dip stok altına iniyorsa `below_stock` **BLOCK** (bağlama/tabla riski) — uyarı değil | ops/drill.js:82 (+ kernel ışın sorgusu) | P2 o7 dip = flanş altı −1; P3/P4 below_stock 0 | S |
| T-05 | STEP'te delik tanıma yok (`rebuild.holes` boş); `holes.kind:'points'` generateProgram'da çalışmıyor | (a) program.js:63: `holes` seçimi (`points` / `feature`) geçirilsin — küçük iş, hemen. (b) B-rep tanıyıcı: iç silindirik yüzler → eş eksenli gruplar → {çap, üst, derinlik, geçişli, uç açısı, havşa/pah}; dişli delik için ISO tablosundan öneri (Ø2,459 → M3), kullanıcı onaylar | program.js:63, kernel (yeni features/holes.js) | P1–P4'teki elle girilen 4+8+8+7 delik otomatik bulunur | (a) S, (b) O |
| T-15 | Serbest/kopmuş parça denetimi yok (P2 kare + 2 anahtar, P3 S4, P4 op25) | Sim sonrası yükseklik haritasında "boydan boya kesilmiş" hücreler sınır sayılır; kalan malzeme hücrelerinin bağlı bileşenleri; bağlama bileşeni dışında kalanlar `cam.sim.free_piece` (alan, ağırlık merkezi) **uyarı**; ayar ile BLOCK | sim/index.js (yeni geçiş) | P2: 480 / 275 / 240 mm² bulunur (rapordaki ek analizle aynı) | S |
| T-23 | Delme gruplaması ilk stok üstüne bakıyor (`p.R >= stockTop`, drill.js:103) → işlenmiş yüzeylerde her delik ayrı G98 G8x…G80 (P4 S1 G81/G83/G84 4/14/6, Fusion 1/4/1) | Grup anahtarı = (üst z, dip, R). Noktalar arası geçişte yol boyunca yerel stok/model tepe yüksekliği (T-04 haritası) R'nin altındaysa G99 ile R'de, değilse G98 başlangıç düzleminde; tek çevrim bloğu | ops/drill.js:68, :103 | P4 S1 çevrim sayısı Fusion'a yakın (1/4/1 ± 1) | S |

## Dalga 2 — Grup 4: NC verimi / biçimi

| T | Sorun | Düzeltme | Dosya | Kabul | Model |
|---|---|---|---|---|---|
| T-01 | İlk dalma clearance'tan (Z15) ilerlemeyle: `linkTo` ilk konumda d=0 ve pz>zRet iken hızlı inişi atlıyor (P2'de 55–61 mm havada ≈7 s; P4 ≈21,5 s) | linkTo koşulu `d > 1e-9 || pz < zRet` → konum zRet'ten farklıysa da gir: önce hızlıyla `max(zRet, zTarget)`'a in, sonra ilerleme. CAM.md §2 ile uyumlu | ops/common.js:92-99 | P1–P4'te her işlemin ilk G1 Z'si retract'tan başlar; süre P2 S1 −dakikalar | S |
| T-07 | Aynı takımla ardışık işlemlerde M5/M9/S M3/M8 tekrarı (P3 S1 93 M5/M8, Fusion 8) | IR → post: önceki işlemle takım, devir, soğutma aynıysa mil/soğutma blokları yazılmaz, yalnız işlem yorumu + gerekirse G43 yok | post/engine.js (işlem geçişi) | P3 S1 M5 sayısı ≈ takım değişimi sayısı | S |
| T-18 | NC yorumunda ², ³, Ø → `?` | Eşleme: `²`→`2`, `³`→`3`, `Ø`/`ø`→`D`, `µ`→`u` (engine.js:16) | post/engine.js:16 | Yorumlarda `?` kalmaz | H |

## Dalga 2 sonu — Grup 6: küçük eksikler (önerim)

| T | Sorun | Düzeltme | Dosya | Model |
|---|---|---|---|---|
| T-02 | Açık zincir (`chain`) seçimi resolveGeom'da `sel_unsupported` | resolveGeom'a `chain` dalı (computeOp zaten destekliyor) | program.js:36 | S |
| T-10 | `stockToLeave` face'te sayı, contour/pocket'te {radial, axial} | Her ikisini de kabul et, içte {radial, axial}'a normalize | ops/face.js, şema | H |
| T-11 | Takımda uç düz çapı ve sap çapı alanı yok (sap = kesici varsayılıyor) | `tipDia`, `shaftDia` alanları; sap verilmezse `tool_geom_assumed` uyarısı | tools.js, sim/tool.js | S |
| T-03 | Pah (chamfer) işlemi yok (P1'de tek "Yapılamadı") | Yeni `chamfer` işlemi: kenar/zincir + genişlik + takım uç açısı ve `tipDia` (T-11) → z ve ofset hesabı; contour altyapısını kullanır | ops/chamfer.js (yeni) | S (T-11 sonrası) |
| T-19 | Silüet seçici kesitte birden çok bölgede çöküyor (`cam.silhouette.multiple`) | Tüm bölgeleri döndür, en dıştakini varsayılan seç, seçim parametresi ekle | geom/select.js:75 | S |

---

## Dalga 3 — Grup 2: 3D stratejiler (en büyük iş)

| T | Sorun | Düzeltme | Model |
|---|---|---|---|
| T-20 | Tek-Y `camSection` çatılı oyuk/tünel/yan deliği yarık görüyor; takım çatıya dalıyor (P3 E6 gouge ×8, P4 E1 ×13) | Ada üretimi tek kesitten değil **modelin yukarıdan yükseklik haritasından** ("z seviyesinde ya da üstünde malzeme olan her yer ada"). 3D işlemlerin de temeli olacağı için Dalga 3'ün ilk adımı | O |
| T-09 | 2D Adaptive (sabit takım yükü) yok; açık kenarlı dış boşaltma kavramı yok | Sabit kavrama açılı boşaltma (trochoidal/adaptive). [Çıkarım] Açık kaynak yapı taşı: FreeCAD Path "Adaptive" (libarea, LGPL) → WASM. Açık kenar = stok sınırı "serbest" işaretli | O |
| T-13 | 3D yüzey izleyen işlem yok (adaptive 3D, z-seviye kontur, yatay/düz alan, paralel/scallop, rest) → P2 R3,05 tavan/kenar hiç işlenemiyor | Drop-cutter + waterline tabanlı: 3D adaptive kaba (T-09 + T-20 z dilimleri), z-seviye (waterline) kontur, paralel bitiş, rest. [Çıkarım] Yapı taşı: OpenCAMLib (LGPL; drop-cutter, waterline) → WASM | O |

Kabul: P2'de R3,05 bantlarında kalan malzeme ≤ 0,05 mm; P3/P4 artıkları Fusion düzeyinde. Bu dalga kendi spesifikasyon alt planını ister (ayrı oturum).

---

## Kapsam dışı / olumlu (kod değişmez, regresyon testi olarak sabitlenir)
- T-12: 3+1 çerçeve çözümü ve A kelimesi yazımı doğru (Fusion A0'da kalıyor).
- T-16: sim R1,52 / R0,76 oymalarını, flute aşımını, uç açısı uyuşmazlığını yakalıyor. Bu davranışlar Dalga 1'de korunmalı (T-17/T-22 değişikliği bunları **kaldırmamalı**).

## Doğrulama (her dalga sonunda)
1. `npm run test:all` (temel çizgi 21363ba'da alındı) + her T için yeni birim test.
2. P1–P4 karşılaştırma betikleri yeniden koşulur (`test/compare/P{n}/run-p{n}.mjs`); tablo: BLOCK sayısı, temiz NC (şu an 7/13), süre, M5/M8 sayısı, çevrim sayısı.
3. Bağımsız doğrulama ajanı (kodu yazmamış) farkı ve raporu denetler.
4. NC'ler yine `_KARSILASTIRMA_TEZGAHA_GITMEZ` adlı kalır; tezgâh doğrulaması K-004/K-021 gereği makine projesinde.

## Kullanıcıdan bilgi gereken
1. O-029 (bu plan, dalga sırası, grup 6'nın Dalga 2 sonuna eklenmesi) onayı.
2. T-21: Neway VM1160H + GSA'da A+ dönüş yönü (tezgâhta kesmesiz gözlem, cnc-proje-hafizasi projesinde).
3. T-06: P1 STEP'inde 2 mm yarık içindeki Ø4 katı çubuk kasıtlı mı?
4. Fusion betiğinin A0 sorunu 23 Kasım'dan önce düzeltilsin mi?
