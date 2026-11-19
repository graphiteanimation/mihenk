# P4 (NIST FTC-10 kapak, 4 setup) — Fusion–Mihenk CAM karşılaştırması, MİHENK tarafı

Betik: `node test/compare/P4/run-p4.mjs` (≈126 s, deneyler dahil; deneysiz ≈80 s). Env: `P4_STEP`, `P4_FUSION_JSON`, `P4_OUT`, `P4_RES` (varsayılan 0,5), `P4_BAND` (1), `P4_ONLY`, `P4_NOSIM`, `P4_NOEXP`, `P4_DUMP`. Ham sonuç: `out/p4-mihenk-sonuc.json`. Plan: `in/P4-PLAN.md` (bağlayıcı). **NC dosyaları tezgâha gitmez.** `src/**` değiştirilmedi; yalnız public API kullanıldı (`resolveSetup`, `resolveGeom`, `computeOp`, `buildProgram`, `gates`, `simulate`, `postProgram`). Makine yerleşik Neway şablonunun kopyası; yerleşik şablon değişmedi (`yerlesik_degismedi: true`). Numaralandırma: P1–P3 bulguları T-01…T-21, yeni bulgular T-22'den başlıyor.

## 0. Özet

- STEP içe aktarma çalışıyor: 214 yüz, 1 gövde, hacim 188 318,067 mm³. Kutu plana birebir uyuyor (X ±79, Y 0…31, Z ±37,5). Delik tanıma yok (`rebuild.holes` = 0, T-05).
- Fusion'ın 25 işleminin sonucu: **Tam 4 / Kısmen 21 / Yapılamadı 0**. Planın kendi kapsam dışı kalemi olan X yönlü 2× Ø5,5 delik iki tarafta da yapılmadı.
- **Kılavuz döngüsü var.** `cycle:'tap'` + `type:'tap'` takım ile 6× `G98 G84 … F0.5 ,R1` yazıldı (M80V `tapMode:'pitch'`).
- Kapılar: **S1 BLOCK ×17**: 1× `body_short` (o7 T22, T-08), 16× `sim.gouge` (o9 ×4, o11 ×6, o12 ×6). **S2, S3, S4 OK.** S1 NC'si bu yüzden `_BLOKLU_` adıyla yazıldı.
- Süre tahmini: Mihenk **4 986,4 s (1 sa 23 dk 6 s)**, Fusion 4 970,4 s (≈1 sa 23 dk). Setup bazında farklar büyük (§2).
- **A açısı**: S2 `G0 A270.` (satır 21), S3 `G0 A90.` (satır 24). Her ikisi de sonda `A0.` yazıyor. Fusion yalnız A0 yazdı. Plan S2 için A+90, S3 için A−90 diyor. Mihenk'in işareti bunun tersi (§4, teyitsiz).
- Yeni bulgular:
  - **T-22**: sim kılavuzu majör çaplı dolu silindir sayıyor, model deliği küçük çaplı. Her kılavuz deliği bu yüzden gouge BLOCK veriyor.
  - **T-23**: delme çevrimi gruplaması ilk stok üstüne göre yapılıyor. Her delik ayrı çevrim alıyor.
  - **T-24**: `camSection` döngülerinde ≈6·10⁻⁴ mm uç açıklığı var. Eskiz düğüm toleransıyla birleşmiyor (ürün etkisi teyitsiz).

## 1. Kapsama tablosu

Kural (P1–P3 ile aynı): **Tam** = eşdeğer strateji ve o işlemde kapı bloğu yok. Aksi halde **Kısmen**. Uygulanamayan işlem **Yapılamadı**. Delik işlemleri, delik kayıtları elle sentezlendiği için (T-05) en fazla Kısmen sayılır (P1–P3 kuralı).

| # | Setup | Fusion işlemi (strateji) | Mihenk | Sonuç | Not |
|---|---|---|---|---|---|
| 1 | S1 | Yüzey T20 (face) | `face` o1, Y33→31, 2 paso | **Tam** | 41,2 s / 39,7 s; yol 1 477 / 1 478 mm |
| 2 | S1 | 3D Adaptive T34 | 6 adet 2,5D `pocket` bandı (R1…R6, Y31→−0,2); ada = dolgu gövdesinin bant altı kesiti | **Kısmen** | Adaptive yok (T-09), 3D yok (T-13). Dar aralıklar kasıtlı ada yapıldı (§5, dolgu). R1/R4/R6'da `helix_no_fit` → rampa |
| 3 | S1 | Yatay temizleme T35 | `pocket` ×3: Y8 (flanş), Y23 (omuz), Y27 (kaide üstü) | **Kısmen** | Düz bölgeler elle seçildi. Köprü kutularının altı temizlenmedi |
| 4 | S1 | 3D Kontur T35 (paso 1) | 11 `contour` işlemi: Y31→22 arası 1 mm bantlar, Y22→9 tek duvar işlemi, Y9→8 ayak bandı | **Kısmen** | Z-seviye 2,5D (T-13). Vadi, kaburga ve R1 fileler kalıyor |
| 5 | S1 | 2D Kontur dış silüet T34 | `contour`, elle silüet (Y0,05 kesiti dış döngüsü) | **Tam** | Silüet seçici çöktü (T-19 tekrar). 72,8 / 71,5 s |
| 6 | S1 | Kaide kanalları T29 (pocket2d, dalma) | `pocket` T29, 2 dikdörtgen, paso 0,5, dalma | **Tam** | 210,9 / 83,2 s; ilk dalma Z15'ten F60 (T-01) |
| 7 | S1 | Bore Ø10 kulak havşası T22 | `pocket` 4× r5 + helis | **Kısmen** | Bore işlemi yok. **block `body_short`** 27 > 25 (T-08) |
| 8 | S1 | Punta T24 4× Ø6 | `drill spot` | **Kısmen** | Delikler sentetik (T-05). 4 ayrı G81 (T-23) |
| 9 | S1 | Delme Ø6,1 T33 G83 | `drill peck` Q3, through +1 | **Kısmen** | **block `sim.gouge` ×4** (Ø6,1 > model Ø6; T-17, E2). `below_stock` 0,11 ×4 (T-14) |
| 10 | S1 | Delme Ø3,5 T41 G83 | `drill peck` Q3, kör +1 (kaide 3 + boss 3) | **Kısmen** | T-05; 4 çevrim bloğu (T-23) |
| 11 | S1 | M3 ön delik Ø2,5 T39 G83 | `drill peck` Q3, uç Y14,3 | **Kısmen** | **block `sim.gouge` ×6** (0,24 mm). Kök neden uç açısı: 140° matkap, modeldeki delik 118° uçlu (E3a/E3b) |
| 12 | S1 | Kılavuz M3×0,5 T40 (tapping, G84) | `drill tap`, Y17, F = 1000×0,5 | **Kısmen** | G84 yazıldı (6 blok). **block `sim.gouge` ×6**, derinlik 10 (T-22, E6) |
| 13 | S2 | Bore Ø10 havşa −Z T22 | `pocket` 4× r5 + helis, s37,5→27,5 | **Kısmen** | Bore yok. 216,8 / 94,9 s (helis 3° → küçük adım) |
| 14 | S2 | Punta T24 4× Ø7 | `drill spot` s26 | **Kısmen** | T-05 |
| 15 | S2 | Delme Ø7,1 T37 G83 Q5, uç s−2 | `drill peck` Q5, abs s−2 | **Kısmen** | T-05; `dia_mismatch` uyarısı |
| 16 | S3 | Bore Ø10 havşa +Z T22 | 13 ile aynı (+Z) | **Kısmen** | 13 ile aynı |
| 17 | S3 | Punta T24 4× Ø7 | `drill spot` | **Kısmen** | T-05 |
| 18 | S3 | Delme Ø7,1 T37 | `drill peck` | **Kısmen** | T-05; `dia_mismatch` |
| 19 | S3 | Yarık taban T28 (adaptive2d) | `pocket` T28, X40…55 Y0…24, Z37,5→36,5 | **Kısmen** | Adaptive yok (T-09). 98,8 / 224,9 s |
| 20 | S3 | Yarık 2×5 mm T28 (adaptive2d) | `pocket` T28 ×2 bölge, Z36,5→34,5 | **Kısmen** | T-09. 123,3 / 556,4 s; köşede R1,5 artık (plan da öyle) |
| 21 | S4 | 2D Adaptive cep T21 | `pocket` T21, bölge = Y10 kesitindeki cep döngüsü (R2 köşeli), Y−2→14,8 | **Kısmen** | T-09. 234,4 / 523,5 s |
| 22 | S4 | Yatay cep tabanı T21 | `pocket` dikdörtgen X−56…18 Z±23, tek paso Y14,8→17 | **Kısmen** | Düz bölge elle verildi |
| 23 | S4 | 3D Kontur cep T38 (paso 0,5) | `contour` T38 (ball): duvar Y0→15 (kesit Y10) + filet bantları 15→17 her 0,5 mm | **Kısmen** | Filet bandında ≤1,86 mm artık (2,5D, T-13). 1 360 / 1 197,5 s |
| 24 | S4 | Delme Ø2,5 T39 8× cep tabanı G83 Q1,5 | `drill peck` Q1,5, kör +1 | **Kısmen** | T-05; 8 ayrı G83 (T-23) |
| 25 | S4 | Yüzey alt T20 | `face` Y−2→0 | **Tam** | Parça burada stoktan ayrılır. Serbest parça uyarısı yok (T-15) |
| – | – | X yönlü 2× Ø5,5 (Plan: kapsam dışı) | – | (kapsam dışı) | İki tarafta da yapılmadı. Ø3,5 delikleri katıda kör kalır |

Toplam: **Tam 4 (1, 5, 6, 25) / Kısmen 21 / Yapılamadı 0.** Ayrıntı JSON `fop_ozet` alanında.

## 2. Sayısal karşılaştırma

| Setup | Mihenk (s) | Fusion (s) | NC satır Mihenk | NC satır Fusion | M6 M/F | M8 M/F | G81/G83/G84 Mihenk | G81/G83/G84 Fusion |
|---|---|---|---|---|---|---|---|---|
| S1 | 2 609,8 | 2 025,7 | 8 393 (+18 BLOKLU başlık) | 56 761 | 11 / 11 | 29 / 11 | 4 / 14 / 6 | 1 / 4 / 1 |
| S2 | 242,2 | 155,3 | 762 | 392 | 3 / 3 | 3 / 3 | 4 / 4 / 0 | 1 / 1 / 0 |
| S3 | 464,3 | 951,7 | 924 | 10 398 | 4 / 4 | 5 / 4 | 4 / 4 / 0 | 1 / 1 / 0 |
| S4 | 1 670,2 | 1 837,7 | 853 | 22 244 | 4 / 4 | 9 / 4 | 0 / 8 / 0 | 0 / 1 / 0 |
| **Toplam** | **4 986,4 (1 sa 23 dk 6 s)** | **4 970,4 (≈1 sa 23 dk)** | | | | | | |

- Satır sayısı = `ncStats` (`split('\n')`). `wc -l` bundan bir eksik çıkar.
- Mihenk yayları koruyor (S1: G2/G3 3 253, G1 3 276); satır farkının ana nedeni bu. S2'de satır sayısı Fusion'dan fazla: havşa helisi 3° açıyla 0,247 mm/tur ilerliyor.

**İşlem başına (Mihenk / Fusion, s):**

| Op | Mihenk | Fusion |
|---|---|---|
| op2 | 1 437,7 | 1 176,9 |
| op3 | 206,8 | 111,3 |
| op4 | 505,1 | 310,5 |
| op6 | 210,9 | 83,2 |
| op7 | 74,4 | 23,6 |
| op12 | 11,0 | 0,3 |
| op13 / op16 | 216,8 | 94,9 |
| op19 | 98,8 | 224,9 |
| op20 | 123,3 | 556,4 |
| op21 | 234,4 | 523,5 |
| op23 | 1 360,1 | 1 197,5 |

- Hesaplama süresi Mihenk'te işlem başına < 1,4 s. Fusion'da op2 94,8 s, toplam 359 s.
- T-01'in maliyeti (clearance'tan ilerlemeyle ilk iniş, NC'den hesap): S1 92,3 s, S2 3,2 s, S3 24,2 s, S4 66,4 s.
- Kılavuz: Mihenk `G98 G84 X31.9 Y30. Z-16. R-1. F0.5 ,R1` (S1 satır 8368 vd., 6 ayrı blok). Fusion'da 1 adet G84 bloğu var; Fusion'ın F değeri bilinmiyor (Fusion NC'si burada yok, yalnız sayaçlar).

## 3. Kapılar ve simülasyon (res 0,5)

### S1 BLOCK ×17

**`body_short` (o7)**
- T22 derinliği stok üstünden 27, gövde 25 (`src/cam/gates.js:84`, T-08).
- Gerçekte kulak üstünden (Y8) yalnız 2 mm derin. E4 (gövde 30) → blok kalmıyor.

**`sim.gouge` o9 ×4 (derinlik 7,01)**
- Ø6,1 matkap, modelde Ø6 delik.
- E2 (Ø6,0) → kalkıyor. Derinlik düşey ölçü olarak raporlanıyor (T-17).

**`sim.gouge` o11 ×6 (0,24 mm, z −18,7)**
- Kök neden uç açısı. 140° matkap planın uç değerinde (Y14,3) modeldeki 118° koni dibinin (Y14,26) altına giriyor.
- E3a (Ø2,45, aynı uç) → gouge sürüyor. E3b (uç Y14,6) → kalkıyor.
- Plan geometrisinin sonucu; sim doğru yakaladı (T-16 tipi). Ölçü düşey (T-17).

**`sim.gouge` o12 ×6 (derinlik 10, 200 hücre)**
- Kılavuz Ø3 dolu silindir olarak süpürülüyor; modeldeki delik Ø2,459 (diş küçük çapı).
- E6 (sim çapı 2,45) → kalkıyor. **T-22.**

**Uyarılar**
- `below_stock` ×4: o9 dibi stok altına 0,11 mm iniyor (through −1 − uç 1,11; T-14).
- `through_to_model_bottom`, `dia_mismatch` ×2, `rest_material` ×10, `rest_corner` ×11, `sim_lateral_tol` (0,25), `travel_abs_unchecked`.

### S2, S3, S4 OK

- Uyarılar: `a_dir_unverified` (S2, S3), `dia_mismatch` (T37 Ø7,1 / Ø7), `rest_material` (S3 ×2: 1,7 ve 4,1 mm²; S4 ×2: 32,6 ve 30,4 mm²), `rest_corner` ×4 (S4).
- Çapraz Ø7 deliklerde sim gouge vermedi. Delik boydan boya açık; Z yönü yükseklik haritasında malzeme yok.

### Deneyler (birincil sonucu değiştirmez)

- **E1.** Duvar konturu c4_9 dolgusuz gerçek Y15 kesitiyle çalıştırıldı → `sim.gouge c4_9` ×13. +X yüzündeki X yönlü Ø5,5 delik tek kesitte çentik gibi görünüyor; takım Y9…22 boyunca bu çentiğe giriyor (T-20'nin yeni biçimi). Bu deneyde gouge kodu sayaç sınırına takıldı (o11 ×3, o12 kaydı yok).
- **E5.** res 0,25 → aynı 17 blok. Çözünürlük artefaktı değil.
- **E7.** T22 gövdesi 24 alındı → `holder_collision` ×20 (o7, en çok 0,49 mm, boss üstü Y31).
  - Planın "tutucu alt kenarı Y≈31" uyarısı doğru: gövde 25'te boşluk tam 0 mm ve Mihenk uyarı vermiyor.
  - 1 mm kısa gövdede sim çarpmayı yakalıyor.
- **Silüet seçici:** `cam.silhouette.multiple`, n=5, z=−13 (Y20: Ø7 tünelleri kesiti 5 bölgeye ayırıyor; `src/cam/geom/select.js:75`, T-19 tekrar).

## 4. A açısı (S2/S3)

- **S2:** `G0 A270.` (satır 21), kapanış `G0 A0.` (satır 758). Çözülen çerçeve z = (0,0,−1), orijin (0, 15,5, −39,5).
- **S3:** `G0 A90.` (satır 24), kapanış `G0 A0.` (satır 920). Çözülen çerçeve z = (0,0,1), orijin (0, 15,5, 39,5).
- Mihenk'te aAngle −90 yazıldığı gibi A270 oluyor (`shortest`, `src/cam/post/fanuc-base.js:156–157`, T-21 tekrar). Kontrolün kısa yolu seçip seçmediği teyitsiz.
- **İşaret farkı:** Plan S2 için "A +90", S3 için "A −90" diyor. Mihenk'te φ = aAngle·sign(A.dir·X) (`src/cam/index.js:78–83`). A.dir = [−1,0,0] ile −Z yüzünü yukarı getiren değer A−90. Fusion makinesinin A yönü de (−1,0,0) (log satır 202). Fusion yalnız A0 yazdığı için hangisinin makinede doğru olduğu **teyitsiz** (`a_dir_unverified`).
- Mihenk P3'teki kuralla kendi içinde tutarlı.

## 5. Yöntem notları (varsayımlar)

Tam liste JSON `varsayim` alanında (37 kayıt).

**Dolgu gövdesi.** S1 ada kesitleri yalnız bu yardımcı gövdeden alındı; sim ve yükseklik haritası gerçek gövdeyle yapıldı. Doldurulanlar:
- 4 çapraz tünel + Ø10 havşa (silindir, eksen Z),
- dalga vadileri (kutu, Y ≤ 29,5),
- kaide–kaburga, kaburga–boss ve dalga–kaide arası < 12,6 mm aralıklar (köprü kutuları, 0,5 mm bindirmeli),
- X yönlü Ø5,5 delikler.

Neden: tek-Y kesit tünelleri yarık gösteriyor (T-20). Ø12 takımın giremediği aralıklar da konturda komşu adaya oyuyor. Bu alanlarda kalan malzeme kasıtlı; §7'de ölçüldü.

**Diğer varsayımlar**
- Makine kopyası: maxRpm 8000, maxCut 5000, rapid 24 000 (yalnız süre tahmini için), safeRetract G28.
- Tutucu Ø40×50.
- Takımlar: mevcutlar P1–P3 değerleriyle birebir. Yeniler:
  - T38: `ball` Ø4, ağız 20 / taşma 25.
  - T39: Ø2,5, 140°, ağız = taşma = 25.
  - T40: `tap` Ø3, adım 0,5, ağız = taşma = 20, `centerCutting:false`.
  - T41: Ø3,5, 140°, ağız = taşma = 22.
- Güvenli yükseklik 15/5.
- Stok 162×35×79 kutusu, dört setup'ta da aynı (T-04).
- Bant/kesit seviyeleri, eş düzlemli yüz hatası (`cam.loop_open`) vermesin diye +0,05 kaydırıldı.
- Delik kayıtları elle (`P4kulak`, `P4d35kaide/boss`, `P4m3` diş {3; 0,5}, `P4caprazZeksi/Zarti`, `P4taban25`).

## 6. Bulgular

### Tekrar edenler

- **T-01** (ilk dalış clearance'tan ilerlemeyle):
  - S1 satır 8041–8043: `G43 H29 Z15.` → `G1 Z-6.5 F60.` (21,5 mm havada ≈21,5 s).
  - S1 satır 101–103: `G1 Z-2. F500.`
  - S3 satır 768: `G1 Z-2. F100.`
  - S4 satır 713: `G1 Z-17.5 F150.`
  - Kod: `src/cam/ops/common.js:90-98` (P1'de teyit edilmişti).
- **T-04** (önceki setup stoğu yok):
  - S2/S3/S4 aynı kutuyu kullanıyor.
  - S4 artığında Ø2,5 deliklerinde 5,62 mm görünüyor. Sim, çapraz Ø7 deliklerin S2/S3'te açıldığını bilmiyor; değer hayalet.
  - S3 yarığı 2 mm hayalet kabuğun altından başlıyor.
- **T-05** (delik tanıma yok): 7 delik kaydı elle girildi.
- **T-07** (aynı takımda mil yeniden başlatma):
  - Örnek S1 satır 1543–1552 (T34 R1→R2: `G91 G28 Z0. / M5 / M9 / S8000 M3 … M8`).
  - M8 sayıları S1 29 / S3 5 / S4 9; Fusion 11 / 4 / 4.
- **T-08**: `body_short` o7 (`src/cam/gates.js:84`), E4 ile doğrulandı.
- **T-09/T-13**: adaptive ve 3D yüzey işlemi yok. Dalga vadilerinde ≈2 mm, köprü alanlarında 4–7,5 mm, S4 filet bandında ≤1,86 mm artık.
- **T-14**: through delik `S.modelBBox.min − brk − tip` noktasına iniyor (`src/cam/ops/drill.js:82`). Burada model tabanı flanş altı olduğu için hedef doğru; yine de stok altına 0,11 mm iniyor (`below_stock` ×4).
- **T-15**: op25 parçayı stoktan ayırıyor; uyarı yok.
- **T-16** (olumlu): sim uç açısı uyuşmazlığını (o11), Ø6,1/Ø6 farkını (o9) ve tutucu boşluğunu (E7) yakaladı.
- **T-17**: gouge derinliği düşey ölçülüyor (`src/cam/sim/index.js:86`, `m − zb`). Ø6,1/Ø6 farkı 7,01 mm, uç açısı farkı 0,24 mm olarak görünüyor.
- **T-18**: NC yorumlarında `mm²` → `?` (S1 satır 36–40).
- **T-19**: silüet seçici çöküyor (n=5, z=−13; `select.js:75`).
- **T-20**: tek kesitte tünel ve yan yüze açılan delik yarık/çentik gibi görünüyor. Dolgu gövdesi gerekti; E1 dolgusuz durumda gouge ×13 verdi.
- **T-21**: A−90 → A270 (S2 satır 21; `fanuc-base.js:156–157`).
- **T-12** (olumlu): 3+1 çerçeveleri doğru çözüldü, A kelimesi yazıldı. Fusion A0'da kaldı.

### Yeni

**T-22 — Hata (orta, kapı/sim).** Simülasyon kılavuzu majör çaplı (Ø3) dolu düz silindir olarak süpürüyor; STEP'te dişli delik küçük çapta (Ø2,459) modelli. Sonuç: her kılavuz deliği `sim.gouge` BLOCK veriyor (derinlik = diş boyu 10, 200 hücre).
- Kod (teyit edildi):
  - `src/cam/sim/tool.js:5`: `FLAT` kümesinde `'tap'` var.
  - `src/cam/sim/index.js:159-165`: `cycle` noktası tam takım profiliyle dibe süpürülüyor.
  - `src/cam/sim/index.js:86`: gouge bu süpürmeden çıkıyor.
- Delik kaydındaki `thread` bilgisi (`{major:3, pitch:0,5}`) sim'de kullanılmıyor.
- E6: sim çapı 2,45 alınınca gouge kalkıyor.
- Etki: G84 kullanan her parçada NC normal yoldan üretilemiyor. Fusion G84'ü sorunsuz üretti.

**T-23 — Eksik (düşük, verimlilik/okunabilirlik).** Delme çevrimlerinin gruplanması **ilk stok üstüne** bakıyor: `shared = p.R >= stockTop` (`src/cam/ops/drill.js:103`, `stockTop = S.stockBox.max[2]`, `drill.js:68`). R düzlemi, işlenmiş ve alçalmış yüzeylerde (kulak Y6, kaide Y27, S2/S3 havşa tabanı, S4 cep tabanı) ilk stok üstünün altında kalıyor. Bu yüzden her delik ayrı `G98 G8x … G80` bloğu alıyor ve noktalar arası geçiş clearance'tan değil R üstü Z5'ten yapılıyor.
- Sayılar: S1 G81 4 / G83 14 / G84 6; Fusion 1 / 4 / 1. S2/S3 4/4 (Fusion 1/1), S4 G83 8 (Fusion 1).
- T-04/T-08 ile aynı kökten geliyor (güncel stok bilinmiyor). Güvenli yönde bir hata.

**T-24 — Gözlem (düşük; ürün etkisi teyitsiz).** `camSection` döngüleri `chainLoops(items, 1e-5·ölçek)` ile zincirleniyor (`src/kernel/cam.js:179`; P4'te ölçek ≈177 → tolerans ≈1,8·10⁻³ mm). Dönen döngüde 5,85·10⁻⁴ mm uç açıklığı ölçüldü (dolgu gövdesi, Y29,05).
- Eskiz `findRegions` düğüm toleransı `NODE_TOL = 1e-6` (`src/shared/profiles.js:9`). Kesit doğrudan eskize çevrilince `dangling` oluyor ve ada kayboluyor (sR2'de dalga bloğu düştü; kontur yalnız boss'u izledi).
- Betik 2·10⁻³ mm nokta birleştirmesiyle çözdü.
- Üründe aynı açıklık `camFaceLoops` (`cam.js:151`, aynı tolerans) → `contour.js:26` `P.isClosedLoop(lp, 1e-5)` yolunda `cam.geom.loop_open` verebilir. Bu yol P4'te denenmedi: **teyitsiz**.

**Gözlem (numarasız).** Plan "kanal paso 1,5" diyor; Fusion log'unda `maximumStepdown 0,5` var. Log değeri kullanıldı.

## 7. Artık malzeme (sim, res 0,5)

**S1 (tüm alan)**
- Model üstü artık alanı: >0,05 mm 8 303 mm², >0,3 mm 6 938, >1 mm 4 677, >3 mm 1 062,5, >10 mm 0. En çok 7,5 mm. Hacim 12 715 mm³.
- 10 mm karelere göre başlıca kaynaklar:
  - kaburga–boss B2 köprüsü ve boss uç yarım daireleri (X20–40, Z0…20): 6,2–7,5 mm,
  - kaide–kaburga B1 köprüsü (X30–60, Z−10…−20): 4,0 mm,
  - B1/B3 köprüleri (X20–30, Z−10…−30): 4,18 mm,
  - vadi şeridi (X0–10 vb., vadi dolgusu): ≤2,0 mm.
- Oyma: 47 mm², en çok 10 mm. Kaynağı o12 (T-22) ile o9/o11 gouge'ları.

**S2 (havşa içi r ≤ 4,8)**: 0 mm.

**S3 (havşa içi + yarık)**: >1 mm alan 1 mm², en çok 5 mm (yarık köşesi X40/55, Y≈0; Ø3 takımın R1,5 köşesi).

**S4 (tüm alan)**
- >0,3 mm 545 mm², >1 mm 286, >3 mm 32. En çok 5,62 mm (Ø2,5 delikler; T-04 hayaleti).
- Cep duvar/filet bandında ≤1,86 mm. T38 kesit seviyesinde r kadar ötelendiği için filet merkezinden 1,8 mm uzakta kalıyor (2,5D, T-13).

**Çıkarılan hacim**: S1 139 094 + S2 8 261 + S3 9 814 + S4 91 185 = 248 353 mm³. Teorik değer 447 930 − 188 318 = 259 612 mm³; S2/S3 hayalet kabuk payı da bu toplamın içinde.

## 8. Dosyalar

| Dosya | Satır |
|---|---|
| `out/P4_S1_Ust_mihenk_BLOKLU_KARSILASTIRMA_TEZGAHA_GITMEZ.nc` | 8 393 + 18 başlık |
| `out/P4_S2_Zeksi_mihenk_KARSILASTIRMA_TEZGAHA_GITMEZ.nc` | 762 |
| `out/P4_S3_Zarti_mihenk_KARSILASTIRMA_TEZGAHA_GITMEZ.nc` | 924 |
| `out/P4_S4_Alt_mihenk_KARSILASTIRMA_TEZGAHA_GITMEZ.nc` | 853 |
| `out/p4-mihenk-sonuc.json` | – |
