# P2 (NIST FTC-08 tepsi) — Fusion–Mihenk CAM karşılaştırması, MİHENK tarafı

Tarih: 2026-11-19 · Betik: `node test/compare/P2/run-p2.mjs` (≈21 s çekirdek + ≈40 s ek deney; env: `P2_STEP`, `P2_FUSION_JSON`, `P2_OUT`, `P2_RES`) · Ham sonuç: `test/compare/P2/out/p2-mihenk-sonuc.json`
Plan: `P2-PLAN.md` (bağlayıcı). Fusion sütunları `P2_fusion_rapor.json`'dan. **NC dosyaları tezgâha gitmez.** `src/**` değiştirilmedi; yalnız public API (`resolveSetup`, `resolveGeom`, `computeOp`, `buildProgram`, `gates`, `postProgram`, `simulate`, `generateProgram`, kernel `rebuild/camSection/camHeightmap`).

Mihenk sürümü: git `3a9a8e6` (NC başlığında "MIHENK 0.3.0"). Makine: yerleşik Neway şablonunun **kopyası** (`test-p2-neway-kopya`; yerleşik şablon değişmedi, betik doğruluyor).

Numaralandırma notu: görev metni P1'de T-01…T-08 olduğunu söylüyor; P1 raporunda aslında **T-01…T-12** var. Çakışmayı önlemek için P1'de görülenler "T-xx P2'de de" diye anılır, yeni bulgular **T-13**'ten başlar.

## 0. Özet

- STEP içe aktarma **çalışıyor**: 270 yüz, 1 gövde, hacim 503 592,175 mm³ (plan 503 592), kutu X ±155,797 · Y ±111,347 · Z 0…48,26 (plana birebir); 2,25 s. Delik/özellik tanıma yok (T-05 P2'de de).
- Fusion'ın 14 işleminden **Tam 5 / Kısmen 9 / Yapılamadı 0**. Ek olarak Fusion'ın 3D kontur bileşenlerinden **2 alt kalem Yapılamadı** (S1 tavan R3,05, S2 üst kenar R3,05; §1). Mihenk'te 3D yüzey izleyen (adaptive / yatay / 3D kontur) işlem yok; 2,5D `pocket`/`contour` kademeleriyle karşılandı. Betik hata vermeden **S1'de 9, S2'de 9 Mihenk işlemi** üretti (hepsi `generateProgram` ile de kuruluyor).
- Kapılar: **S1 BLOCK (1)**: `cam.sim.gouge` op o7 (T33 Ø6,1 > modeldeki delik Ø6,045; kök neden deneyle doğrulandı, T-17). **S2 BLOCK (20)**: `cam.sim.gouge` o9 ×13 (duvar dibi R1,52 yuvarlatmasına giriyor) + `cam.sim.gouge` o13 ×7 (kanal tabanı R0,76). Her iki setup'ta NC normal yoldan **üretilmedi**; yapı kıyası için `*_BLOKLU_*` kopyalar yazıldı.
- **Fusion sim bulgusu**: T28 ile 2D konturla kesilen kare + 2 anahtar deliğinin içindeki parçalar serbest kalıyor. **Mihenk simülasyonu/kapıları bunu yakalamıyor** (hiçbir uyarı/kod yok). Yükseklik haritası sonrası analizimle (Mihenk çıktısı değil, bu testin ek analizi) 3 serbest parça bulunuyor: kare 480 mm², anahtar 275 mm², anahtar 240 mm². Pencere + Ø30,56 kaba boşaltmayı (o9b) kaldırınca bunlar da serbest kalıyor (pencere 11 350 mm², Ø30,56 251 mm²). T-15.
- Süre tahmini: **S1 11 214 s (Fusion 11 144 s), S2 4 824 s (Fusion 8 432 s)**; toplam Mihenk 16 038 s (4 sa 27 dk), Fusion 19 576 s (5 sa 26 dk).

## 1. Kapsama tablosu

Sonuç: Tam / Kısmen / Yapılamadı. "Mihenk yolu" = kullanılan Mihenk işlemleri (id betikteki `o…`).

| # | Özellik | Fusion işlemi | Fusion | Mihenk işlemi | Mihenk | Fark / bulgu |
|---|---|---|---|---|---|---|
| 1 | Yüzey T20 (S1) | Face | Tam | `face` o1 (stepover 40, paso 1) | **Tam** | Yol 5650,7 mm (Fusion 5769,9); 153,1 s (154,5). T-01 P2'de de |
| 2 | 3D Adaptive T31, alt Z45, yük 1,2, paso 12, pay 0,3/0,2 | 3D Adaptive | Tam | `pocket` ×3: o2 flanş çevresi + stok kabuğu (Z45, ada = flanş silueti), o3 boşluk duvarı bölgesi (Z41,78'e), o3b tavan düz bölgesi (Z44,83'e); T31 | **Kısmen** | Sabit yük yok, 3D yüzey izleme yok → iki kademeli 2,5D (T-09 P2'de de, T-13). `rest_material` 36,4 / 6,2 / 7,6 mm². Yol 212 082 mm (Fusion 199 300), 8 541 s (8 392 s) |
| 3 | Yatay temizleme T32 (tavan Z44,83) | Horizontal | Tam | `pocket` o4, sketch = tavan düz bölge sınırı (kesitle), T32, stepover 5 | **Kısmen** | Düz bölge sınırı yüz seçimiyle değil `z=44,828` kesitiyle (±0,1 mm) alındı; `rest_material` 5,0 mm². 392 s (763 s) |
| 4 | 3D Kontur T32 paso 1 (boşluk duvarları, tavan R3,05, flanş yanı) | Contour 3D | Tam | `contour` o5a (boşluk, ic) + o5b (flanş yanı, dış), paso 1 | **Kısmen** | Düşey duvarlar tamam. **Tavan R3,05 yuvarlatması Yapılamadı** (T-13): kalan band 2706 mm² (>0,3 mm); iç köşelerde `rest_corner` n=8 (R6 takım, R3,05 köşe). 2 113 s (1 754 s) |
| 5 | Punta T24, 4× flanş deliği, 1,5 derin | Drill | Tam | `drill` o6, cycle `spot`, delikler elle sentezlendi | **Kısmen** | STEP'ten delik tanıma yok (T-05). 4 delik tek `G81` (satır 5262–5263) |
| 6 | Delme T33 Ø6,1, G83 Q3, boydan boya +1 | Drill | Tam | `drill` o7, `peck` 3, blind kayıt (derinlik 11,16) | **Kısmen** | Kapı **block**: `sim.gouge` (T33 Ø6,1 > model deliği Ø6,045; T-17). `through:true` kaydı model tabanına iner (T-14) |
| 7 | Yüzey T20 (S2) | Face | Tam | `face` o8 | **Tam** | Stok "önceki setup'tan" değil, aynı kutu (T-04 P2'de de) |
| 8 | 3D Adaptive T31, alt Z9,5 (duvar dışı; parça stoktan ayrılır) | 3D Adaptive | Tam | `pocket` o9 (ada = duvar siluet, taban flanş üstü Z10,16, pay 0,3/0,2) + o9b (pencere + Ø30,56 kaba, Z44,33'e) | **Kısmen** | o9 kapıda **block** (`gouge` ×13: duvar dibi R1,52). Sabit yük yok (T-09). o9b "pencereler kaba" varsayımına dayanır (§5) |
| 9 | Yatay temizleme T32 (flanş üstü, kanal tabanı) | Horizontal | Tam (Fusion planı: duvar dibi R1,52 Kısmen) | `pocket` o10, flanş üstü, radyal pay 0,3 | **Kısmen** | Kanal tabanı yatay temizlemesi yok (kanal o13 konturuyla). İlk denemede radyal pay 0'dı: `sim.flute_exceeded` ×7 (§3). Duvar dibi R1,52 yapılamaz |
| 10 | 3D Kontur T32, alt Z7 (duvarlar, R3,05 kenarlar) | Contour 3D | Tam | `contour` o11, dış, Z10,16'ya, paso 1 | **Kısmen** | Plan alt Z7 → 2,5D'de flanşa oyar, Z10,16'da durduruldu. **Üst kenar R3,05 Yapılamadı** (T-13): kenar bandında kalan ≤2,8 mm |
| 11 | 2D Kontur T22: pencere + Ø30,56/kama, alt Z44,33 | Contour 2D | Tam | `contour` o12, ic, 2 bölge (tek sketch) | **Tam** | Uyarı/kapı yok. 48,8 s (45,0 s) |
| 12 | 2D Kontur T22: kanal, alt Z46,99 | Contour 2D | Tam (plan: taban R0,76 sapma) | `contour` o13, ic | **Kısmen** | Kapı **block**: `sim.gouge` ×7 (0,04–0,52 mm), kanal tabanı R0,76 (T-16). Orta şerit 0,7 mm kesilmez (iki taraf konturu; Fusion ile aynı strateji) |
| 13 | 2D Kontur T28: kare + 2 anahtar deliği, paso 2, alt Z44,33 | Contour 2D | Tam | `contour` o14, ic, 3 bölge, paso 2, lead r=1 | **Tam** | Yol temiz, kapı yok. **Serbest parça** kapıda/sim'de yok (T-15) |
| 14 | Bore (helis) 16 delik T28, adım 0,5 | Bore | Tam | `pocket` o15, 16 daire, helis giriş (merkez Ø2,2, 4°) | **Tam** | Kontur helis desteklemiyor (`cam.op.unsupported`), cep+helis kullanıldı (P1 #4 gibi). Yol 1341 mm (Fusion 2848) |
| – | Tavan R3,05 (S1) ve üst kenar R3,05 (S2) — 3D kontur bileşenleri | (4, 10 içinde) | Tam | – | **Yapılamadı** (2 alt kalem) | T-13 |
| – | +X duvarı NIST yazısı | – | Kapsam dışı | – | Kapsam dışı | İki tarafta da yapılmadı |
| – | Duvar dibi R1,52, boşluk köşe R3,05, kanal tabanı R0,76 | – | Kısmen | – | Kısmen / Yapılamadı | Plan'ın kendi "Kısmen" kalemleri; Mihenk sim'i R1,52 ve R0,76'yı **oyma** olarak yakaladı (T-16) |

Sayım (Fusion'ın 14 işlemi üzerinden): **Tam 5** (1, 7, 11, 13, 14) · **Kısmen 9** (2, 3, 4, 5, 6, 8, 9, 10, 12) · **Yapılamadı 0**; ek alt kalem Yapılamadı: 2.

## 2. Sayısal kıyas

| Ölçüt | Fusion | Mihenk |
|---|---|---|
| STEP içe aktarma | var (süre ayrı verilmedi) | 2,25 s, 270 yüz, 1 gövde, hacim 503 592,175 mm³, kutu plana birebir |
| Üretilen işlem | 14 / 14 | 18 Mihenk işlemi (S1 9, S2 9) = Fusion'ın 14'ü; 5 Tam, 9 Kısmen |
| Toplam çalışma süresi | 469,7 s (GUI + 2 post) | 63,1 s (21 s çekirdek + ≈40 s ek deney); işlem hesabı toplam ≈2,8 s |
| Hesap süresi / işlem | S1: 1,17 · 109,6 · 13,3 · 11,0 · 14,4 · 10,1 s; S2: 2,6 · 197,8 · 21,2 · 14,4 · 2,6 · 6,4 · 3,9 · 0,02 s | S1: 0,002 · 0,10 · 0,49 · 0,46 · 0,29 · 0,04 · 0,01 · 0,001 · 0 s; S2: 0 · 0,17 · 0,93 · 0,12 · 0,03 · 0,02 · 0,002 · 0,01 · 0,09 s |
| Kapılar + sim süresi | – (sim API'de yok) | S1 2,9 s, S2 1,1 s (res 1,0); S1 res 0,5 ≈23 s |
| Tahmini işleme süresi S1 | 11 144,3 s | 11 213,8 s |
| Tahmini işleme süresi S2 | 8 432,2 s | 4 823,8 s |
| Toplam | 19 576,5 s (5 sa 26 dk) | 16 037,6 s (4 sa 27 dk) |
| NC satır S1 / S2 | 200 224 / 130 929 | 5 291 / 6 227 (BLOKLU kopyalar; + başlık yorumları) |
| NC yapısı | doğrusal parçalara bölünmüş yollar (≈200 k satır) | yay (G2/G3: 624 / 953) ve doğru (G1: 636 / 925) korunmuş; N numarasız, `G91 G28 Z0.`; yorumlar ASCII (T-18) |
| G81 / G83 / G84 (S1) | 1 / 1 / 0 | 1 / 1 / 0 (4 delik tek çevrimde: satır 5262, 5280) |
| M6 S1 / S2 | 5 / 5 | 5 / 5 |
| M8 S1 / S2 | 5 / 5 | 9 / 9 (T-07 P2'de de) |
| G41 / G42 | 0 / 0 | 0 / 0 |
| A kelimesi | yok | S1/S2'de başlangıçta `G0 A0.` (makine A eksenli; P1'de de) |

İşlem bazında süre (s) / kesme yolu (mm) / hızlı yol (mm); Mihenk sütunu birden çok Mihenk işlemini toplar:

| Fusion işlemi | Fusion s | Fusion kesme | Fusion hızlı | Mihenk s | Mihenk kesme | Mihenk hızlı |
|---|---|---|---|---|---|---|
| 1 Yüzey | 154,5 | 5 769,9 | 217,8 | 153,1 | 5 650,7 | 456,6 |
| 2 Adaptive (o2+o3+o3b) | 8 392,2 | 199 299,7 | 88 758,0 | 8 541,0 | 212 082,3 | 5 442,9 |
| 3 Yatay (o4) | 763,1 | 18 861,9 | 1 767,0 | 391,8 | 9 667,0 | 61,8 |
| 4 3D kontur (o5a+o5b) | 1 754,3 | 42 035,3 | 76,2 | 2 112,9 | 50 017,8 | 1 656,3 |
| 5 Punta (o6) | 6,7 | 26,0 | 741,5 | 5,3 | 26,0 | 20,0 |
| 6 Delme (o7) | 13,6 | 78,7 | 1 174,9 | 9,9 | 69,1 | 20,0 |
| **S1 toplam** | **11 144,3** | | | **11 213,8** | | |
| 7 Yüzey | 154,5 | 5 769,9 | 217,8 | 153,1 | 5 650,7 | 456,6 |
| 8 Adaptive (o9+o9b) | 5 096,1 | 116 055,6 | 36 335,1 | 2 317,1 | 56 847,6 | 5 312,0 |
| 9 Yatay (o10) | 748,0 | 18 570,0 | 1 337,2 | 162,6 | 3 726,4 | 751,2 |
| 10 3D kontur (o11) | 1 641,9 | 41 033,6 | 288,7 | 1 667,4 | 39 515,1 | 1 273,0 |
| 11 Pencere+yuvarlak (o12) | 45,0 | 682,4 | 156,4 | 48,8 | 706,6 | 269,1 |
| 12 Kanal (o13) | 21,3 | 329,2 | 29,7 | 24,0 | 346,3 | 18,3 |
| 13 Kare+anahtar (o14) | 129,5 | 586,8 | 230,8 | 144,8 | 614,4 | 344,6 |
| 14 Bore (o15) | 535,8 | 2 847,9 | 912,7 | 306,1 | 1 340,6 | 1 770,4 |
| **S2 toplam** | **8 432,2** | | | **4 823,8** | | |

Süre notu: Mihenk "yol uzunluğu / ilerleme + hızlı 24 000 mm/dk (test değeri)"; takım değişimi/ivmelenme yok. Fusion'ın S2 adaptive yolu Mihenk'inkinin ≈2 katı; Fusion önceki setup'taki gerçek stoğu (S1 kesimleri) bildiğinden orada daha çok iş hesaplıyor olabilir — **bilinmiyor**, doğrulanmadı. S1 toplamının neredeyse aynı çıkması tesadüf; işlem bazında dağılım farklı (yatay temizleme Mihenk'te yarısı).

## 3. Kapı ve simülasyon sonuçları

Sim: **res 1,0 mm** (kapı şartı: res ≤ en küçük takım yarıçapı = T28 yarıçapı 1,5; `cam.gate.sim_lateral_tol` 0,5 mm uyarısı çıkıyor), model yükseklik haritası `camHeightmap` ile her setup için STEP gövdesinden; tutucu Ø40×50. Kontrol için S1 res 0,5 ve S2 res 0,5 ayrıca koşuldu (§3.4).

### 3.1 S1 (G55, O2001) — `BLOCK`, NC üretilmedi
block 1: `cam.sim.gouge` (op o7, T33; konum x=-142,875 y=-98,425, "derinlik" 11,17 mm). warn 8: `travel_abs_unchecked`, `pocket.rest_material` ×4 (o2 36,4 · o3 6,2 · o3b 7,6 · o4 5,0 mm²), `contour.rest_corner` n=8 r=6 (o5a), `drill.dia_mismatch` (n=4, Ø6,1), `sim_lateral_tol` 0,5.
Post: `cam.post.gates_blocked`; BLOKLU kopya `out/P2_S1_Ic_mihenk_BLOKLU_KARSILASTIRMA_TEZGAHA_GITMEZ.nc` (5 291 satır).
**Kök neden (deneyle doğrulandı):** model deliği Ø6,045, matkap Ø6,1; Ø6,0 ile aynı program **block'suz** (E7), res 0,5'te de aynı block sürüyor (E6) → çözünürlük artefaktı değil. T-17.
Sim kalan stok (model üstü fazla, res 1): >0,05 mm 4 836 mm², >0,3 mm 2 706 mm², >3 mm 1 186 mm², >10 mm yalnız 5 hücre (5 mm²; boşluk 45° pah/R3,05 köşe bitişleri, `rest_corner`/`rest_material` ile tutarlı: x=-139,3 y=-76,8 · x=-121,3 y=95,2 · x=-120,3 y=-95,8 · x=138,7 y=-77,8 · x=-139,3 y=77,2). 2 706 mm² ≈ boşluk çevresi (942 mm) × tavan yuvarlatma bandı (≈2,9 mm): **R3,05 tavan yuvarlatmasının kalan malzemesi**.

### 3.2 S2 (G57, O2002) — `BLOCK`, NC üretilmedi
block 20: `cam.sim.gouge` o9 ×13 (derinlik 0,045–0,392 mm, z=-39,9), `cam.sim.gouge` o13 ×7 (0,042–0,524 mm, z=-3,27). warn 6: `travel_abs_unchecked`, `rest_material` o9 36,4 · o9b 107,4 · o10 36,4 mm², `sim_lateral_tol`, `sim_suppressed` (2).
Post: `cam.post.gates_blocked`; BLOKLU kopya `out/P2_S2_Ust_mihenk_BLOKLU_KARSILASTIRMA_TEZGAHA_GITMEZ.nc` (6 227 satır).
- **o9 gouge kök nedeni:** takım merkezi duvardan 6,3 mm'de (radyal pay 0,3) ama duvar dibi R1,52 yuvarlatması duvardan 1,52 mm dışarı taşıyor. Kesitle doğrulandı: z=10,2'de dış boyut 294,39 mm, z=10,5'te 293,17, z=11,7'de 292,04 (duvar). Taban Z10,36'da (pay 0,2) takım kenarı yuvarlatmaya 0,3…0,77 mm girer → 0,05–0,39 mm oyma. Radyal pay 1,6 ile o9 block'ları kalkıyor (E1b).
- **o10 `flute_exceeded` ×7 (ilk deneme, radyal pay 0):** o9'un bıraktığı 0,3 mm duvar payı stok üstüne (−2) kadar 38,1 mm yüksekliğinde duruyor; T32 ağız boyu 30 → 8,1 mm aşım. Radyal pay 0,3'e çekilince kalktı (E2 ilk hali yeniden üretiyor; birincil koşuda yok). o9+o10 pay 1,6 → yalnız o13 block'u kalıyor (E1b).
- **o13 gouge kök nedeni:** kanal tabanı R0,76 yuvarlatması (kesit: z=46,99'da kanal genişliği 12,7 yerine 11,42). Düz uç duvara temas ederken yuvarlatmaya 0,04–0,52 mm girer; Fusion planı bunu "sapma ≈0,2" diye geçmiş, Mihenk **block** veriyor. Bu bir yazılım hatası değil; plan geometrisinin sonucu (T-16).
- Res 0,5 ile aynı bulgular (o9 ×17, o13 ×3; E3) — res artefaktı değil.

Sim kalan stok (S2, res 1): >0,05 mm 7 263 mm², >0,3 mm 4 268 mm², >1 mm 2 296 mm², en çok 2,79 mm (x=123,7 y=-101,8; x=153,7 y=111,2; x=155,7 y=-108,8 …): hepsi R3,05 üst kenar bantlarında (plaka üst kenarı x/y≈100,6–102,5, flanş üst kenarı y≈111,3) → **T-13 (3D bileşen Yapılamadı)** ile tutarlı.

### 3.3 Serbest parça (Fusion'ın sim bulgusu)
Mihenk `simulate`/`gates` içinde "kopmuş/serbest parça" kodu yok (`grep` ile `src/cam/sim`, `gates.js`, `program.js` içinde yok); S2'de bu parçalar için **hiçbir uyarı çıkmıyor**. Ek analiz (testin kendi kodu; `run-p2.mjs` `analyze()`): model boş (-∞) + kalan stok taban (Z44,33) üstünde + çevresinde yalnız kesilmiş hücre → bağlantısız bölge.
- Birincil program (res 1,0): **3 serbest parça** — kare 27,94 (merkez 109,1 −49,3, 480 mm²), anahtar (59,3 46,2; 275 mm²), anahtar (60,5 −46,3; 240 mm²). Res 0,5'te aynı: 480,25 / 274,5 / 236 mm² (T28 Ø3 konturu 3 mm ize bıraktığı için içerideki parça ≈ (27,94−6)² = 481). Fusion'ın bulgusunu **doğruluyor** (kare + iki anahtar). 16 delik `pocket` ile tamamen boşaltıldığı için parça yok.
- Ø30,56 + kama ve pencere: o9b'de T31 ile kaba boşaltıldığı için serbest parça yok. **o9b kaldırılırsa (E4)**: pencere (11 350 mm², merkez −37,8 0), Ø30,56 + kama (251 mm², merkez 111,9 64,2) de serbest kalır → Fusion'ın "muhtemelen Ø30,56" tahmini bu koşulda doğru; Fusion adaptive'inin pencereleri gerçekten boşaltıp boşaltmadığı bilinmiyor.

### 3.4 Ek deneyler (`deneyler` alanı; birincil sonuçları değiştirmez)
| Deney | Sonuç |
|---|---|
| E1 o9 radyal pay 1,6 | block: o10 flute ×17, o13 gouge ×9 (o10 payı 0,3 kaldığı için) |
| E1b o9 + o10 pay 1,6 | **yalnız o13 gouge ×9** kalır |
| E2 o10 pay 0 (ilk deneme) | o9 ×13, **o10 flute_exceeded ×7**, o13 ×7 = 27 block |
| E3 S2 res 0,5 | o9 ×17, o13 ×3 |
| E4 o9b'siz | 5 serbest parça (pencere 11 350, kare 480, anahtar 275, Ø30,56 251, anahtar 240 mm²) |
| E5 res 0,5 serbest parça | 3 serbest (480,25 / 274,5 / 236) |
| E6 S1 res 0,5 | o7 gouge ×1 (kalıcı) |
| E7 S1 T33 Ø6,0 | block yok |
| `through:true` flanş deliği | delik dibi z=−52,370 (model tabanı −50,26 − uç 1,11 − 1 kırılma); stok tabanı −52,26 → `belowStock` 0,11; uyarı `cam.drill.through_to_model_bottom` (z=−50,26) |

## 4. Bulgular

Tür: Hata = Mihenk yanlış/gereksiz sonuç üretti · Eksik = özellik yok · Kullanım = beklenen/uyarı. Teyit: NC satırı veya `dosya:satır`; teyitsiz olan "şüphe". NC satır numaraları BLOKLU dosyalardaki gerçek satırdır (başlık dahil).

**T-01 P2'de de — Hata (orta/düşük).** Her işlemin ilk dalması clearance'tan (Z15) ilerlemeyle; retract'a hızlı inilmiyor. P2'de derin işlerde belirgin: S1 satır 3814 `G1 Z-43.58 F500.` (58,6 mm havada ≈7 s), satır 4353 `G1 Z-46.63 F500.` (61,6 mm, ≈7,4 s), S2 satır 4579 `G1 Z-40.1 F500.` (55,1 mm), satır 5633 `G1 Z-3.965 F100.` (T28, 19 mm, ≈11 s; yaklaşık 10 s hava). Kod: `src/cam/ops/common.js:95` (aynı XY'de d≤1e-9 ve pz≥zRet iken hızlı iniş atlanıyor).

**T-04 P2'de de — Eksik.** "Önceki setup'tan stok" yok; S2 aynı kutu. P2'de hayalet stoktan kaynaklanan block görülmedi, ama S2 simülasyonu S1'in oyduğu boşluğu bilmiyor (tek değerli harita, `docs/POST.md` §6: alt kesme yok) → pencere altı vb. "malzeme var" sayılır; serbest parça analizi bu yüzden yalnız ek analizle yapılabildi.

**T-05 P2'de de — Eksik.** `rebuild.holes` boş (`rebuild_holes_sayisi: 0`); 4 flanş deliği elle `holes[]` kaydı olarak girildi (`kind:'simple', dia 6,045, depth 11,16, dir [0,0,1]`).

**T-07 P2'de de — Hata (düşük).** Aynı takımla ardışık işlemlerde mil durup kalkıyor: S1 satır 1566–1575 (T31 o2→o3: `M5 / M9 / S8000 M3 / … M8`), 3804–3813 (o3→o3b); S2 satır 3919–3928. M8 sayısı 9 (Fusion 5), M6 5/5.

**T-09 P2'de de — Eksik.** Adaptive yok; `pocket` + sketch adası + stok+11 mm dış duvar ("havada kesen bant"; S1 o2 hızlı yol 4 969 mm, S2 o9 5 075 mm). P2 ek: STEP'te yüz seçimi için ad (ref) gerekmesi nedeniyle dış duvar/ada/pencere sınırlarını kernel `camSection` kesitlerinden eskize çevirmek gerekti (§5).

**T-13 — Eksik (orta).** 3D yüzey izleyen işlem yok (adaptive 3D, yatay temizleme, 3D kontur/rest). Sonuç, P2'nin R3,05 tavan yuvarlatması (S1) ve R3,05 üst kenar/flanş kenarı (S2) **hiç işlenemiyor**; 2,5D kademeyle yaklaşıldı. Ölçü (sim, res 1): S1 tavan bandı 2 706 mm² (>0,3 mm; max ≈3,8 mm), S2 kenar bantlarında max 2,79 mm kalan. Doğrulama: §3.1/§3.2 kalan-stok tabloları; `docs/CAM.md` §3 "Cepte her derinlik aynı XY halkalarını kullanır (2,5D; eğimli duvar yok)".

**T-14 — Hata (orta).** `drill` `depth.from:'hole'` ile `through:true` (ya da `depth:null`) delik, **delik çıkışına değil model kutusunun en derin noktasına** iniyor: `bottom = S.modelBBox.min[2] − breakThrough − tipL` (`src/cam/ops/drill.js:82`). P2 S1'de flanş 10,16 mm kalın olduğu halde model tabanı plaka üstü (z −50,26) → dip z −52,370 (deney `deney_through`), stok tabanının 0,11 mm altı; yalnız `cam.drill.through_to_model_bottom` uyarısı (drill.js:95) var, block yok. Ayrıca `breakThrough` yalnız through kolunda uygulanıyor, blind kayıtta (drill.js:83) yok sayılır. Teyit: NC değil; `computeOp` çıktısı (betik `deney_through`) + kod satırı.

**T-15 — Eksik (orta).** Kopmuş/serbest parça denetimi yok (sim ve kapılarda ilgili kod yok). 2D konturla kesilen kapalı iç bölgeler serbest parça bırakır; Mihenk uyarmaz (§3.3: 480 / 275 / 240 mm²; o9b yokken +11 350 / 251 mm²).

**T-16 — Olumlu / doğrulama.** Sim, Fusion'ın "Kısmen/artık" diye geçtiği yuvarlatmaları **oyma** olarak yakaladı: duvar dibi R1,52 (o9 gouge, 0,05–0,39 mm) ve kanal tabanı R0,76 (o13 gouge, 0,04–0,52 mm); pay duvarına ağız boyu aşımı (`flute_exceeded` 8,1 mm, o10 ilk deneme); `drill.dia_mismatch` uyarısı. Kök nedenler kesit ölçümleri ve deneylerle (E1b, E2, E7) doğrulandı.

**T-17 — Kullanım (düşük, kapı ölçütü).** `sim.gouge` "derinlik" değeri **düşey** fark (`m − zb`) raporluyor (`src/cam/sim/index.js:86`); T33 Ø6,1 / delik Ø6,045 gibi **0,03 mm yarıçap** farkı "11,17 mm gouge" olarak görünüyor (o7, z=−14,27). Plan zaten Ø6,1 seçmiş (Ø.238 +.005/−.001 toleransı); block'un nedeni Mihenk'in ölçüt biçimidir. Anlaşılması için `dia_mismatch` uyarısıyla birlikte okunmalı.

**T-18 — Kullanım (kozmetik).** NC yorumlarında `²` ve `Ø` karakterleri `?`'e dönüşüyor: S1 satır 15–18 `About 36.383 mm? of the pocket…`, satır 20 `[?6.1]`. Kod: `src/cam/post/engine.js:19` (`[^\x20-\x7e]` → `?`; `²`/`Ø` eşlemesi yok).

Bu testte **Hata düzeltmesi yapılmadı**. Teyitsiz ("şüphe") madde: Fusion S2 adaptive yolunun neden ≈2× olduğu (§2 süre notu).

## 5. Test makine kopyasına ve girdilere eklenen varsayımlar

Makine kopyası: yerleşik `builtin-neway-vm1160h-m80v-gsa` → `copyMachine`; yalnız `spindle.maxRpm 8000`, `feed.maxCut 5000`, `feed.rapid 24000` (yalnız süre tahmini), `post.props.safeRetract 'G28'` (Fusion post: `safePositionMethod = G28`). Post: `mitsubishi-m80v`. `checkMachine`: errors [], missing []. Program no: 2001 (S1), 2002 (S2).

Plan'da olmayan değerler (betikteki `ASSUME` ile aynı; JSON `varsayim`):
- **Geometri:** Eskizler kernel `camSection` kesitlerinden (kimlik çerçeve): z=5 flanş (311,6×222,7) + 4 delik, z=20 duvar dışı (292,04×204,92) ve boşluk (279,34×192,21), z=44,828 tavan düz bölge sınırı (273,5×186,4; yatay hata ≈0,1 mm, yükseklik 0,002 mm), z=48 pencere (151,9×126,5 tırnaklarla), Ø30,56+kama (32,74×30,56), kare 27,94, iki anahtar (25,4×31,75 ve 20,32×31,75), kanal (12,7×158,76), 16 delik (Ø5,41 ×10, Ø5,79 ×2, Ø6,15 ×2, Ø6,35 ×2). Kesitler boyutla sınıflandırıldı.
- **Takımlar** (plan: ortak liste + T31/T32/T33): T20/T22/T24 P1 değerleri (T20 ağız 10/gövde 40; T22 16/25; T24 2 ağız 35/35); T28 D3 düz, 2 ağız, ağız 9, gövde 15 (planda yalnız D3); T31 D12 düz, ağız 30, gövde 55; T32 `bullnose` D12 R3, ağız 30, gövde 55; T33 D6,1 140°, 2 ağız, ağız 40 = gövde 40. Tutucu Ø40×50; `shaftDia` verilmedi (= kesici çapı).
- **Yükseklikler:** clearance 15, retract 5 (stok üstünden), `setup.clearanceZ` 5 (P1 ile aynı).
- **S1:** `zAxis -Z`, `xAxis +X`, orijin stok üst merkezi (model Z=−2), G55. **S2:** `zAxis +Z`, G57, orijin model Z=50,26. Stok her ikisinde kutu 315,6×226,7×52,26 (+2 mm; S2 "önceki setup stoku" yok, T-04).
- **Dış boşaltma (o2, o9):** `pocket`; dış duvar = stok + 11 mm dikdörtgen, ada = flanş silueti (S1) / duvar silueti (S2); o2 taban Z45 (radyal pay 0,3, eksenel 0), o9 taban flanş üstü Z10,16 (pay 0,3/0,2); stepdown 12, stepover 1,2; rampa 3°.
- **Boşluk kaba (o3, o3b):** duvar bölgesi Z41,78'e (R3,05 yuvarlatma başlangıcı) ve tavan düz bölgesi Z44,83'e; pay 0,3/0,2; helis merkez Ø10, 3°.
- **Yatay (o4, o10):** T32 cep, stepover 5, paso 1, o4 radyal pay 0 / o10 radyal pay 0,3 (ilk denemede 0 → flute_exceeded; §3.2).
- **3D kontur karşılığı (o5a/o5b/o11):** kontur ic/dış, paso 1, yay lead r=3, pay 0; o11 alt Z10,16 (planın Z7'si 2,5D'de flanşa oyar). **o9b:** pencere + Ø30,56'yı T31 ile kaba boşaltma varsayımı (planda "pencereler kaba"; Fusion'ın gerçekte ne yaptığı bilinmiyor).
- **o12–o14:** kontur ic, bilgisayar telafisi, tek paso (o12: 4, o13: 2; o14 paso 2), lead r=3 (o14: r=1). **o15 bore:** cep + helis (Ø2,2, 4° ≈ 0,5 mm adım), stepover 1.
- **Delikler:** `rebuild.holes` elle (4× Ø6,045, ±142,875 / ±98,425, giriş Z=0, yön +Z, derinlik 11,16). Punta `abs` z −3,5 (tipComp false); delme `from:'hole'`, tipComp true, peck 3.
- **Sim:** res 1,0 (kapı şartı ≤1,5); model haritası `camHeightmap`; ek kontrol res 0,5.

## 6. Dosyalar

- Betik: `test/compare/P2/run-p2.mjs` · Ham sonuç: `test/compare/P2/out/p2-mihenk-sonuc.json`
- NC (hepsi TEZGÂHA GİTMEZ; her ikisi kapı BLOCK nedeniyle BLOKLU): `out/P2_S1_Ic_mihenk_BLOKLU_KARSILASTIRMA_TEZGAHA_GITMEZ.nc`, `out/P2_S2_Ust_mihenk_BLOKLU_KARSILASTIRMA_TEZGAHA_GITMEZ.nc` (başlıkta BLOCK listesi). Temiz NC üretilmedi.
