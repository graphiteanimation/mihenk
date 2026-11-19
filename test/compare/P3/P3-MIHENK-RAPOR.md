# P3 (NIST FTC-06 blok, 4 setup) — Fusion–Mihenk CAM karşılaştırması, MİHENK tarafı

Betik: `node test/compare/P3/run-p3.mjs` (≈167 s, deneyler dahil; env: `P3_STEP`, `P3_FUSION_JSON`, `P3_OUT`, `P3_RES`, `P3_BAND`, `P3_ONLY`, `P3_NOSIM`, `P3_DUMP`). Ham sonuç: `out/p3-mihenk-sonuc.json`. Plan: `in/P3-PLAN.md` (bağlayıcı). **NC dosyaları tezgâha gitmez.** `src/**` değiştirilmedi; yalnız public API (`resolveSetup`, `resolveGeom`, `computeOp`, `buildProgram`, `gates`, `simulate`, `postProgram`). Makine: yerleşik Neway şablonunun kopyası. Numaralandırma: P1/P2 bulguları T-01…T-18; yeni bulgular T-19'dan.

## 0. Özet

- STEP içe aktarma çalışıyor: 144 yüz, 1 gövde, hacim 3 323 546,071 mm³, kutu plana birebir, 1,6–1,75 s. Delik tanıma yok (`rebuild.holes` = 0, T-05).
- Fusion'ın 18 işleminden **Tam 6 / Kısmen 12 / Yapılamadı 0**. Alt kalem olarak yapılamayanlar: kuyu tabanı (p11, SR12,7, T35 Ø12 Y≈86,8 altına sığmaz), küre alt yarısı ve boyun (plandaki gibi erişilemez), R3,175 filetolar ve V-yarık köşeleri (planın kendi Kısmen kalemi), NIST yazısı (kapsam dışı).
- Kapılar: **S1 BLOCK (9)**: 4× `body_short` (T-08) + 5× `sim.flute_exceeded` (o3a). **S2, S3, S4 OK** (blok yok). S1 NC'si bu yüzden `_BLOKLU_` adıyla yazıldı.
- Süre tahmini: Mihenk **34 190 s (9 sa 30 dk)**, Fusion 28 241 s (7 sa 51 dk).
- **A açısı**: S2 `G0 A270.` (satır 26), S3 `G0 A90.` (satır 20), her setup sonunda `A0.`. Fusion yalnız A0 yazdı. Mihenk tutarlı ama yön doğrulanmamış (`a_dir_unverified`, teyitsiz).
- Yeni bulgular: T-19 (silüet seçici çok bölgede çöker), T-20 (çatılı oyuk tek-Y kesitte yarık görünür), T-21 (A−90 → A270).

## 1. Kapsama tablosu

Kural: Tam = eşdeğer strateji ve kapı bloğu yok; aksi halde Kısmen.

| Fusion op | Özellik | Mihenk | Sonuç | Not |
|---|---|---|---|---|
| 1 | S1 yüzey T20 | `face` | Tam | |
| 2 | S1 3D Adaptive | 2,5D cep bantları (R1a…R6 + halka), ada = bant alt kesiti | Kısmen | Yukarı daralan şekillerde basamak/artık kalır (T-09/T-13) |
| 3 | S1 yatay temizleme T35 | `pocket` (plaka üstü Y31,75, ön duvar 50,8, V-yarık tabanı 52,07, direk üstleri 85,09) | Kısmen | Düz bölge sınırı elle çizildi |
| 4 | S1 3D kontur | 63 adet 1 mm Z-seviye `contour` bandı (Y97,79→34,925) | Kısmen | p11 `tool_too_big` (kuyu tabanı); 85 ek mil yeniden başlatma |
| 5 | S1 (silüet işlemi) | `contour`, elle çizilmiş silüet | Tam | Silüet seçici başarısız (T-19) |
| 6 | S1 punta T24 | `drill spot` | Kısmen | Delikler sentetik (T-05); body_short BLOCK (T-08) |
| 7, 8 | S1 delme Ø10,5 / Ø7,1 | `drill` G83 | Kısmen | Delikler sentetik; body_short BLOCK |
| 9 | S1 delme/derinleştirme | `drill` | Kısmen | body_short BLOCK |
| 10, 11 | S2 | `pocket`/`contour` | Kısmen | rest_material / artık (en çok 5,5 mm) |
| 12, 13 | S2 | `face`/`contour` | Tam | |
| 14, 15 | S2 | `drill`/`pocket` | Kısmen | Delikler sentetik |
| 16 | S3 | `contour` | Kısmen | rest_material (yüz sınırında 2 mm) |
| 17 | S3 | `face` | Tam | |
| 18 | S4 yüzey | `face` | Tam | |

(Op numaraları Fusion rapor sırasına göredir; ayrıntı `fop_ozet` alanında JSON'da.)

## 2. Sayısal karşılaştırma

| Setup | Mihenk (s) | Fusion (s) | NC satır Mihenk | NC satır Fusion | M6 |
|---|---|---|---|---|---|
| S1 | 30 934,5 | 24 658,4 | 36 197 | 699 610 | 8 |
| S2 | 2 557,4 | 2 985 | 2 049 | 59 788 | 6 |
| S3 | 527,3 | 424,3 | 642 | 1 659 | 2 |
| S4 | 170,7 | 173,3 | 64 | 71 | 1 |
| Toplam | 34 190,0 | 28 241 | | | |

Op başına (Mihenk / Fusion s): op2 22 788,5 / 18 698,9; op3 652,9 / 772,8; op4 6 427,9 / 4 622,3; op6 499,0 / 42,3; op9 135,2 / 9,0; op10 2 112,5 / 2 477,0. Hesaplama süresi: Mihenk op başına birkaç saniye (op2 ≈ 9,9 s), Fusion op2 553,7 s (toplam 811,6 s). Mihenk yayları korur (S1: G2/G3 10 957, G1 10 774); satır sayısı farkı budur. Delme: delik grubu başına ayrı `G98 G81/G83 … G80` bloğu (örn. S1 satır 36069 `G98 G83 X133.35 Y-66.675 Z-102.701 R-75.74 Q5. F500.`), Fusion G81/G83 = 1/1.

## 3. Kapılar ve simülasyon

- **S1 BLOCK**: `body_short` ×4 (o6 derinlik 80,74 > gövde 40; o7 82,24 > 35; o8 102,701 > 60; o9 27,4 > 25; `gates.js:84`). `sim.flute_exceeded` ×5 o3a'da (derinlik 6,48, z=−68,04, küre R15,875 sütunları civarı). Önceki cepler 0,3 mm radyal kabuk bırakıyor, o3a'da pay sıfır. Uyarılar: 84 (through_to_model_bottom, dia_mismatch, below_stock ×4 = stok altına 0,911 mm, z −102,701; rest_corner ×64).
- **S2/S3/S4 OK.** Uyarılar: travel_abs_unchecked, sim_lateral_tol, a_dir_unverified (S2/S3), rest_material (S2 ×2, S3 ×1), dia_mismatch (T37).
- Deneyler: E1 (gövde boyu 200) → S1'de sim-dışı blok kalmıyor. E3 (S1 çözünürlük 0,5) → 14 flute ihlali, yani çözünürlük artefaktı değil. E5 (o3a radyal pay 0,3) → ihlal kalkıyor. E6 (çatı düzeltmesi olmayan ham kesit) → c26'da `sim.gouge` ×8.
- Silüet seçici testi: `cam.silhouette.multiple`, n=6, z=−58,515 (`select.js:75`).
- Artık stok (ZONE filtreli, res 1,0): S1 model üstü >0,05 mm alan 23 624 mm², >1 mm 15 870 mm², >10 mm 44 mm², en çok 65,1 mm (kaburga/arka duvar iç köşesi R3,175 vs R6). S2 bölgesi >1 mm 435 mm² (en çok 5,5). S3 >1 mm 960 mm² (en çok 2). S4 0. Çıkarılan hacim 4 285 715 mm³ / teorik 4 586 506.

## 4. A açısı (S2/S3)

S2: `G0 A270.` (satır 26), kapanış `A0.` (satır 2045). S3: `G0 A90.` (satır 20), kapanış `A0.` (satır 638). Çözülen çerçeve z: S2 (0,0,−1), S3 (0,0,1); A.dir=[−1,0,0] ile A=+90 +Z yüzü, A=−90 (270) −Z yüzü yukarı getirir. Mihenk kendi içinde tutarlıdır. Fusion yalnız A0 yazdığı için doğrudan karşılaştırılamaz. Makinenin gerçek A yönü ve kısa yolu seçip seçmediği **teyitsiz**.

## 5. Bulgular

Tekrar edenler:
- **T-01**: ilk dalış Z15'ten besleme hızıyla. S1 satır 14532–14533 (`G43 H34 Z15.` → `G1 Z-40.59 F500.`) havada 55,6 mm ≈ 6,7 s; satır 2148 benzeri. Kod: `src/cam/ops/common.js:90-98` (`linkTo`).
- **T-04**: önceki setup stoku yok. S2–S4 aynı kutu. S1 içinde de o3a önceki cep kabuğunu bilmiyor.
- **T-05**: delikler sentetik (`P3plakaDelik` 4× Ø10,54 geçişli; `P3bossDelik` 4× Ø7,14 kör 31,16).
- **T-07**: her aynı-takım işleminden önce mil yeniden başlatma. S1 M5/M8 = 93 (Fusion 8). Örnek OP 3 başlığı satır 2138–2147.
- **T-08**: `body_short` ×4 (`gates.js:84`).
- **T-09/T-13**: adaptive/3D yok; 2,5D karşılık artık ve R6 köşeleri bırakır.
- **T-14**: geçişli delik stok altına 0,911 mm iniyor (below_stock).
- **T-15**: S4 yüz kesiminden sonra serbest parça uyarısı yok.
- **T-16**: olumlu: simülasyon çatılı oyukları, sütunları ve flute aşımını yakaladı.
- **T-18**: NC yorumlarında `mm²` ve `Ø` → `?` (S1 satır 25, 102).

Yeni:
- **T-19**: silüet seçici, kesitte birden çok bölge varsa kullanılamaz (`src/cam/geom/select.js:75`, `cam.silhouette.multiple`; deney `deney_silhouette`). Elle çizilmiş silüet gerekti.
- **T-20**: tek-Y `camSection`, üstü kapalı delik/tünel/havşa boşluğunu yarık gösterir; takım çatıya dalar. Elle bbox çözümü gerekti, E6 `sim.gouge` ile doğruladı. Proje/çatıya duyarlı ada üretimi yok.
- **T-21**: A−90 NC'de A270 yazılır (`src/cam/post/fanuc-base.js:156-157`, S2 satır 26). Düşük önem; kontrolün gerçekten kısa yolu seçtiği teyitsiz.
- Gözlem: 63 Z-seviye kontur işlemi 85 ek mil yeniden başlatması (T-07 çarpanı). `lead_no_fit` ve `helix_no_fit` yüzünden 9 işlemde rampa girişi, 3'ünde lead yok kullanıldı.
- Bulgu (STEP): plandaki boss–duvar R3,175 fileto STEP'te yok (s 234,96–238,2 arası düz daire r22,225); o12 plandaki s234,95 alt sınırıyla gouge'suz çalışır.

## 6. Varsayımlar

Tam liste JSON `varsayim` alanında. Başlıcaları: kesitten eskiz (yüz adı yok), makine kopyası (maxRpm 8000, maxCut 5000, rapid 24000 yalnız süre için, safeRetract G28), tutucu Ø40×50, takım boyları (T20 10/40; T21 26/40; T22 16/25; T24 35/35; T34 40/105; T35 bullnose R3 35/80; T36 60/60; T37 50/50), güvenli yükseklik 15/5, stok kutusu 308,8×101,79×251,65, S2 A=−90 ve S3 A=+90 (orijinler S2 (0,48,895,−249,65), S3 (0,48,895,2)), G55/G57/G58/G59.

## 7. Dosyalar

`out/P3_S1_Ust_mihenk_BLOKLU_KARSILASTIRMA_TEZGAHA_GITMEZ.nc` (36 197 satır), `out/P3_S2_On_A_mihenk_KARSILASTIRMA_TEZGAHA_GITMEZ.nc` (2 049), `out/P3_S3_Arka_A_mihenk_KARSILASTIRMA_TEZGAHA_GITMEZ.nc` (642), `out/P3_S4_Alt_mihenk_KARSILASTIRMA_TEZGAHA_GITMEZ.nc` (64), `out/p3-mihenk-sonuc.json`.
