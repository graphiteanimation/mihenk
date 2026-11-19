# P1 (SK8 mil desteği) — Fusion–Mihenk CAM karşılaştırması, MİHENK tarafı

Tarih: 2026-11-19 · Betik: `node test/compare/P1/run-p1.mjs` (≈2 s, tekrarlanabilir) · Ham sonuç: `test/compare/P1/out/p1-mihenk-sonuc.json`
Plan: `P1-PLAN.md` (bağlayıcı). Fusion sütunları `P1_fusion_rapor.json`'dan. **NC dosyaları tezgâha gitmez.** `src/**` değiştirilmedi.

Mihenk sürümü: git `91fe679` (NC başlığında "MIHENK 0.3.0"). Tüm sonuçlar belgelenmiş public API ile üretildi (`resolveSetup`, `computeOp`, `resolveGeom`, `buildProgram`, `gates`, `postProgram`, `camHeightmap`, `simulate`).

## 0. Özet

- STEP içe aktarma **çalışıyor** (45 yüz, model kutusu plana birebir: X −21…21, Y −14…0, Z 0…32,8; 0,67 s). Yeniden modelleme gerekmedi; pah ve X yönlü vida delikleri STEP'te zaten var.
- 10 işlemin 10'u için toolpath üretildi, ancak **iki işlem için geçici çözüm/elle sarmalama gerekti** (yarık = açık zincir; pah = karşılığı yok) ve **delik seçimi elle sentezlendi**.
- Kapılar: S2 temiz (NC üretildi). **S1 ve S3 `block`** (NC üretilmedi; yapı karşılaştırması için "BLOKLU" adlı, başlığında uyarı olan kopya yazıldı).
- 3+1: Mihenk NC'de **`G0 A90.` yazıyor ve sonda `G0 A0.`** (Fusion S3 yanlışlıkla A0 yazmıştı). Mihenk ayrıca `cam.gate.a_dir_unverified` uyarısı veriyor.
- Fusion'ın T29 bulgusu Mihenk'te yakalandı (iki yoldan, bkz. T-06).

## 1. Kapsama tablosu

Sonuç: Tam / Kısmen / Yapılamadı / Hatalı. "Geçici" = Mihenk'te doğrudan karşılığı yok, kod değiştirmeden denendi.

| # | Özellik | Fusion işlemi | Fusion sonucu | Mihenk işlemi | Mihenk sonucu | Fark / bulgu |
|---|---|---|---|---|---|---|
| 1 | Yüzey (T20, 2 paso) | Face | Tam | `face` (stepover 40, stepdown 1) | **Tam** | Yol uzunluğu benzer (496,6 vs 480,8 mm). İlk dalma sorunu: T-01 |
| 2 | Dış boşaltma (T21) | 2D Adaptive | Tam | `pocket`, dış duvar = stok+11 mm dikdörtgen, ada = parça silueti (sketch), rampa 3° | **Kısmen** | Adaptive (sabit yük) yok; yol 3136 mm (Fusion 4513). `rest_material` 52,9 mm² uyarısı. T-09 |
| 3 | Kontur bitirme (T22) | 2D Contour | Tam, ama "lead çarpışması: kontur işlenmedi" uyarısı | `contour` outside, yay giriş/çıkış r3, 2 derinlik (7,1) | **Tam** | Mihenk'te lead çarpışması yok; `rest_corner` n=2 (iç köşe R3) uyarısı |
| 4 | Bore Ø8 helisel (T22) | Bore | Tam | `pocket` Ø8 sketch dairesi, helix (merkez Ø2, 9°, ≈0,5 mm/yarım tur) | **Tam** | Yol 153 mm (Fusion 338). Sim temiz |
| 5 | Sıkma yarığı 2 mm (T29, Z22→35, paso 0,5) | 2D Contour (açık) | Tam | `contour` side `on`, açık zincir | **Kısmen** | `generateProgram`/`resolveGeom` `chain` seçimini reddediyor (T-02); yol elle çevrilip `computeOp` ile hesaplandı. Kapılar **block**: `body_short` + `sim.gouge` (T-06) |
| 6 | Bore üst pahı 0,5×45 (T27) | 2D Chamfer | Tam | Pah işlemi yok → **Yapılamadı**. Geçici: `contour` side `on`, daire r3,75, uç z −0,5 | **Yapılamadı** (geçici: Kısmen) | T-03 |
| 7 | Yüzey alt (S2, T20) | Face | Tam | `face` | **Tam** | Stok "önceki setup'tan" değil, aynı kutu (T-04) |
| 8 | Bore alt pahı (S2, T27) | 2D Chamfer | Tam | Geçici çözüm (6 ile aynı) | **Yapılamadı** (geçici: Kısmen) | T-03 |
| 9 | Punta 2× Ø5,5 (S3, T24, G81) | Drill | Tam | `drill` cycle `spot`, nokta delikler elle sentezlendi | **Kısmen** | STEP'ten delik tanıma yok (T-05). Kapı block `sim.rapid_in_stock` ×2 (hayalet stok, T-04) |
| 10 | Delme 2× Ø5,5 (S3, T30, G83 Q2) | Drill | Tam | `drill` cycle `peck` peck 2 | **Kısmen** | Kapılar block: `body_short` 36,801 > taşma 35; `holder_collision` ×2 (hayalet stok) (T-04, T-08) |
| – | X yönlü sıkma vidası delikleri | – | Kapsam dışı | – | Kapsam dışı | İki tarafta da yapılmadı |
| – | Flanş alt yüz pahları (Z=0) | – | Kısmen (erişilemez) | – | Yapılamadı (erişilemez) | Plan: "Kısmen" |

## 2. Sayısal kıyas

| Ölçüt | Fusion | Mihenk |
|---|---|---|
| STEP içe aktarma | Var (süre ayrı verilmedi: bilinmiyor) | Var, 0,67 s, 1 gövde, 45 yüz, hacim 8958,26 mm³, kutu plana birebir |
| İşlem sayısı (toolpath üretilen / planlanan) | 10 / 10 | 10 / 10; bunların #5 elle zincir, #6 ve #8 geçici çözüm (pah işlemi yok → "Yapılamadı" 2) |
| Toplam çalışma süresi | 110,1 s | 2,0 s (STEP + sketch + 10 hesap + 3 kapı/sim + post) |
| Hesap süresi / işlem (s) | 1,86 · 7,76 · 3,28 · 0,03 · 4,57 · 7,03 · 2,46 · 6,90 · 6,54 · 6,86 | 0,006 · 0,24 · 0,007 · 0,006 · 0,001 · 0,008 · ≈0 · 0,007 · 0,001 · ≈0 |
| Kapılar+sim süresi (S1/S2/S3) | – (sim API'de yok) | 0,29 / 0,02 / 0,06 s (res 0,5) |
| Tahmini işleme süresi S1 / S2 / S3 | 895,6 / 32,6 / 23,7 s | 747,3 / 22,3 / 7,5 s (Mihenk: yol uzunluğu/ilerleme + hızlı 24000 mm/dk varsayımı; "hesaplandı") |
| Kesme yolu (mm) işlem 1…10 | 480,8 · 4512,9 · 368,4 · 338,2 · 810,4 · 28,8 · 480,8 · 28,8 · 16,5 · 29,2 | 496,6 · 3135,6 · 392,5 · 153,1 · 803,0 · 41,1 · 496,6 · 41,1 · 16,5 · 26,0 |
| Hızlı yol (mm) işlem 1…10 | 41,8 · 413,1 · 59,3 · 45,9 · 895,6 · 28,0 · 41,8 · 28,0 · 183,7 · 350,0 | 59,8 · 376,2 · 51,3 · 45,8 · 790,0 · 17,5 · 59,8 · 17,5 · 52,0 · 52,0 |
| Oyma/çarpışma uyarıları | S1 op3: "lead çarpışması, kontur işlenmedi" (uyarı). Sim yok (GUI) | S1: gouge ×19 (yarık), body_short (T29). S3: body_short (T30), rapid_in_stock ×2, holder_collision ×2. Ayrıntı §3 |
| Kalan stok (sim, S1) | bilinmiyor | 16 mm² (iç köşe artıkları + bore kenar hücreleri), `rest_corner`/`rest_material` uyarılarıyla tutarlı |
| NC satır sayısı S1 / S2 / S3 | 7458 / 67 / 56 | 1829* / 58 / 57* |
| NC yapısı | N numaralı, 3 ondalık, G28 G91 Z0, S3: `G98 G81 X16 / X-16` tek çevrim | N numarasız, 3 ondalık, `G91 G28 Z0.`, her delik ayrı `G98 G81…G80` çevrimi (S3: 2+2), başlıkta kapı özeti |
| G81 / G83 / G84 (S3) | 1 / 1 / 0 | 2 / 2 / 0 (nokta başına çevrim) |
| G41 / G42 | 0 / 0 | 0 / 0 (bilgisayar telafisi) |
| A kelimeleri (yorum dışı) | S3: A0 ×3 (**yanlış**); S3b: A0 ve A90 | S3: `A90` (satır 25) ve `A0` (satır 59) — **doğru** |
| M6 S1 / S2 / S3 | 5 / 2 / 2 | 5 / 2 / 2 |
| M8 S1 / S2 / S3 | 5 / 2 / 2 | 6 / 2 / 2 (T-07) |
| Çökme / donma | yok | yok |

\* S1 ve S3 NC'leri kapılar block verdiği için normal yoldan **üretilmedi**; sayılar, block'ların kapı listesinden çıkarılıp (kod değiştirilmeden, `postProgram(..., {gates: yalnız uyarılar})`) yalnız yapı karşılaştırması için üretilen `*_BLOKLU_*` dosyalarındandır. Satır sayısına eklenen 1+N başlık yorumu dahil değil.

## 3. Kapı sonuçları

**S1 (G55, 1001)** — block 20: `cam.gate.body_short` (op5, derinlik 16,2 > T29 taşma 16), `cam.sim.gouge` ×19 (op5, x=0, y=−10,6 çevresi, derinlik 0,39 → 9,20 mm). warn: `travel_abs_unchecked`, `pocket.rest_material` (52,875 mm²), `contour.rest_corner` (n=2, r=3), `sim_lateral_tol` (0,25).
**S2 (G57, 1002)** — block yok. warn: `travel_abs_unchecked`, `sim_lateral_tol`. **NC üretildi.**
**S3 (G58, 1003)** — block 5: `cam.gate.body_short` (op10: 36,801 > 35), `cam.sim.rapid_in_stock` ×2 (op9, R=−23,8, x=±16), `cam.sim.holder_collision` ×2 (op10, derinlik 1,80 mm). warn: `a_dir_unverified` (dir [-1,0,0]), `travel_abs_unchecked`, `sim_lateral_tol`.
Sim: res 0,5 (≤ en küçük takım yarıçapı 1; model yükseklik haritası `camHeightmap` ile, her setup için).
Post sonucu: S1 ve S3 `cam.post.gates_blocked`; S2 başarılı.

**Ek deney (S3, önceki setup stoğu elle):** `initialHeightmaps` ile stok = parçanın Y-ekstrüzyon silüeti verilince `rapid_in_stock` ve `holder_collision` **kayboluyor**; geriye yalnız `body_short` (op10) kalıyor. Yani bu 4 block hayalet stoktan geliyor (T-04); `body_short` gerçek (bkz. T-08).

**Kontroller:** (a) `safeRetract` null iken post `cam.post.prop_missing {prop:'safeRetract'}` ile duruyor. (b) Yerleşik Neway şablonu doğrudan kullanılsa kapı 1 `cam.gate.missing machine.spindle.maxRpm` ve `machine.feed.maxCut` ile block verir (şablon değiştirilmedi, kopya kullanıldı; `yerlesik_degismedi: true`).

## 4. Bulgular

Tür: Hata = Mihenk yanlış/gereksiz sonuç üretti · Eksik = özellik yok · Kullanım = beklenen/uyarı. En önemlisi Hata.

**T-01 — Hata (orta/düşük, verimlilik).** Her kontur/cep/yüzey işleminin **ilk dalması clearance düzleminden (Z15) ilerlemeyle** yapılıyor; hızlıyla retract'a (Z5) inilmiyor. Belge (`docs/CAM.md` §2 Bağlama: "İniş daima ilerlemeyle … retract'tan") bunu retract'tan öngörüyor. Kanıt: S1 BLOKLU NC satır 1708–1710 `G43 H29 Z15. / M8 / G1 Z-2.49 F60.` (17,5 mm havada F60 ≈ 17 s fazla), satır 1600–1602 `G1 Z-9.1 F320.` (24 mm), 1837 `G1 Z-2.5 F200.`; S2 satır 20–22 `G43 H20 Z15. / M8 / G1 Z-1. F750.`. Kod: `src/cam/ops/common.js:95` — başlangıç XY'sinde zaten bulunulduğunda (`d ≤ 1e-9` ve `pz ≥ zRet`) hızlı iniş atlanıyor. Çevrimler (G81/G83) etkilenmiyor (`Z5.` var). Tahmini süre bunu içeriyor.

**T-02 — Eksik.** Açık zincir (`{kind:'chain'}`) seçimi şema ve `computeOp` tarafında var ama `resolveGeom`/`generateProgram` onu `cam.geom.sel_unsupported` ile reddediyor (`src/cam/program.js:36`); bu yüzden 2 mm yarık gibi açık sketch zincirleri yalnız çağıranın elle setup uzayına çevirip `computeOp` çağırmasıyla çalışıyor (betik böyle yaptı). `generateProgram` ile doğrudan: S1 op5 → `cam.geom.sel_unsupported`. `docs/CAM.md` §3 bunu "çeviri çağıranda" diye belgeliyor; arayüzden erişimi bilinmiyor.

**T-03 — Eksik.** Pah (chamfer) işlemi yok (`op.type` yalnız face/contour/pocket/drill). Geçici çözüm: T27 ile `contour` side `on`, sketch dairesi r=3,75, uç z −0,5 (Plan: 0,5×45°). Toolpath üretildi (S1 satır 1826+, `G3 X-3.75… I0. J-3.75`), ama takım modelinde uç düz çapı (Ø0,5) alanı yok → sim ve yol "sivri koni" varsayar; pah ölçüsü gerçek takım için elle hesaplandı. Sonuç: "Yapılamadı" (geçici: Kısmen).

**T-04 — Eksik.** "Önceki setup'tan stok" yok. S2/S3 aynı kutu (46×18×36,8) alınıyor. S3'te flanş üstü (Z=6) setup z=−28,8; R düzlemi −23,8 hayalet stok içinde kalıyor → `cam.sim.rapid_in_stock` ×2 (op9) ve T30 için `holder_collision` ×2 (op10, 1,80 mm). Bu block'lar hayalet stoğun sonucudur: `initialHeightmaps` ile stok elle verilince kayboluyor (§3 ek deney). Fusion'ın NC'si de aynı Z/R değerlerini üretmiş (`Z-32.05 R-23.8`, `Z-36.801`) ama uyarı vermemiş.

**T-05 — Eksik.** İçe aktarılan STEP'te delik özelliği tanınmıyor (`rebuild.holes` boş). `generateProgram` ayrıca `holes.kind:'points'` ile çalışmıyor (yalnız `rebuild.holes` aktarılıyor; sonuç `cam.drill.no_holes`, `src/cam/program.js:63`). Betik Plan koordinatlarıyla (X±16, Y−7, Z6, yön −Z) `holes[]` kaydını elle üretti.

**T-06 — Kullanım (yakalandı).** Fusion'ın "T29 Ø2 sap/tutucu yarıkta stoğa çarpıyor" bulgusu Mihenk'te yakalandı: `cam.gate.body_short` — stok üstünden dip 16,2 mm, T29 taşma 16 mm (block). Yüzey işlemi olmadan tek başına sim ise `cam.sim.holder_collision` ×2 (0,2 mm) da veriyor (yüzey işleminden sonra bu kalkıyor, çünkü tutucu Y=+1,8'de, yüzeylenmiş stok Y=0'ın üstünde). **Ek, Fusion'da olmayan bulgu:** `cam.sim.gouge` ×19. Kök neden: STEP, yarık içinde Z≈25,5–29,5 aralığında Ø4 **katı** malzeme içeriyor (X ekseninde Ø4 çubuk; hacim testi: model − kutu(|X|<0,5, Z24,5…32,8) = 12,57 mm³ = π·2²·1 mm). T29 yolu (X=0, Z22→35) bu malzemenin içinden geçiyor, yani Fusion yolu da aynı; Fusion'da uyarı yok. Bu çubuğun tasarım gereği olup olmadığı **bilinmiyor**; plan metni "Ø4/Ø4,2 delikler" diyor.

**T-07 — Hata (düşük, verimlilik).** Aynı takımla ardışık işlemlerde (S1 op3 → op4, T22) her işlem yine `M5 / M9 / S8000 M3 / M8` tekrar ediyor, mil durup kalkıyor: NC satır 1646–1652. M8 sayısı bu yüzden 6 (Fusion 5, tek soğutma/takım).

**T-08 — Kullanım.** `body_short` (kapı 4) **ilk stok üstünü** esas alıyor; yüzey işlemiyle ya da önceki setup'la inen yüzey hesaba katılmıyor (muhafazakâr). S1 op5'te (16,2 vs 16) ve S3 op10'da (36,801 vs 35) tetikledi. S3 op10 için Plan/Fusion NC'sinin kendisi tutarsız: T30 taşma 35 iken Fusion Z−36,801'e iniyor ve uyarı vermemiş; Mihenk bunu hayalet stok deneyinde de (T-04) block olarak koruyor. Gerçek stok üstü (flanş Z=6) esas alınsaydı bu block tetiklenmezdi; bunun tezgâhta anlamı (parçada tutucu erişimi) bu testten **bilinmiyor**.

**T-09 — Eksik.** Adaptive (sabit yük) strateji yok; dış boşaltma `pocket` + sketch adası + stok+11 mm dış duvarla yapıldı (havada kesen bant). Kalan malzeme tahmini 52,9 mm² uyarısı çıktı. Ayrıca stok dışına serbest/açık kenarlı dış boşaltma kavramı model yüzü olmayınca (STEP) yok; dış duvarı elle çizmek gerekti.

**T-10 — Kullanım (düşük).** `face` için `stockToLeave` **sayı**, `contour/pocket` için `{radial, axial}` nesnesi: tutarsız imza; ilk denemede `cam.op.bad_field stockToLeave expect number >= 0` hatası (op1, op7). Hata mesajı net.

**T-11 — Eksik (düşük).** Takımda uç düz çapı (T27 Ø0,5) ve plan'da olmayan sap çapı alanı yok; sap çapı verilmediğinde = kesici çapı varsayılıyor (T29'da Ø2 sap). Sim bu varsayımla çalıştı.

**T-12 — Olumlu / doğrulama.** 3+1: `resolveSetup` etkin çerçeve `z=(0,0,1)`, stok kutusu 46×18×36,8 (S3, Y ±9, z −36,8…0); NC `G0 A90.` (satır 25) ve program sonu `G0 A0.` (satır 59); A yönü doğrulanmadığına dair kapı uyarısı ve NC başlığında uyarı var. Fusion S3 NC'sinde yalnız `A0`.

## 5. Test makine kopyasına ve girdilere eklenen varsayımlar

Makine: yerleşik `builtin-neway-vm1160h-m80v-gsa` **kopyası** (`copyMachine`), kimlik `test-p1-neway-kopya`; yerleşik şablon değişmedi (betik doğruluyor). Post: `mitsubishi-m80v`. Kopyada yalnız şunlar girildi:

| Alan | Değer | Neden |
|---|---|---|
| `spindle.maxRpm` | 8000 | Plan |
| `feed.maxCut` | 5000 | Plan |
| `post.props.safeRetract` | `'G28'` | Plan (G28 Z) |
| `feed.rapid` | 24000 | Planda yok; yalnız süre tahmini için test değeri |

Kopyada hâlâ `null` kalan (bu testte gerekmedi): `spindle.minRpm`, `toolChange.maxTools/pos`, `axes.*.min/max`, `axes.A.limits`, `post.props.safeRetractZ, dwell*, cycleDwell*, coolantCodes.mist/air/through, g541Range, rigidTapM, highSpeedOn/Off`.

Diğer test varsayımları (planda olmayanlar; betikteki `ASSUMPTIONS` ile aynı):
- Tutucu: Ø40 × 50 mm (boy planda yok); `shaftDia` verilmedi (= kesici çapı).
- Ağız sayısı/boyu planda olmayanlar: T20 ağız boyu 10 / gövde 40; T24 2 ağız, 35/35; T27 3 ağız, 30/30; T30 2 ağız, 35/35. (T21 26/40, T22 16/25, T29 6/16 plandan.)
- Yükseklikler: clearance 15, retract 5 (stok üstünden), setup `clearanceZ` 5 (Fusion NC'sindeki Z15/Z5 ile aynı).
- Yüzey: stepover 40, yön 0°, extend 2. Cep (op2): rampa 3°, radyal pay 0,3, stepover 1,2, stepdown 7,1, dış duvar stok+11 mm. Kontur (op3): yay lead r=3, stepdown 7,1. Bore (op4): merkez helis Ø2, 9°, stepdown 7,25, alt −16,5. Yarık: stepdown 0,5, alt −16,2. Delik derinlikleri Fusion NC'sindeki gibi (−32,05, −36,801).
- Setup'lar: S1 `+Y` / G55 / 1001; S2 `−Y` / G57 / 1002; S3 çerçeve `+Y`, `rotary.aAngle = 90`, G58 / 1003, WCS orijini model (0,−7,34,8) (A90 yönelimde stok üst merkezi; A ekseni bu noktadan geçiyor varsayımı). Stok 46×18×36,8 (+2 mm her yana), S2/S3'te önceki setup'tan stok yok → aynı kutu.
- Sim: res 0,5; model yükseklik haritası her setup için STEP gövdesinden.
- Yarık yolu, delik koordinatları, siluet ve dış duvar ölçüleri Plan "Geometri"sinden elle girildi.

## 6. Dosyalar

- Betik: `test/compare/P1/run-p1.mjs` · Ham sonuç: `test/compare/P1/out/p1-mihenk-sonuc.json`
- NC (hepsi TEZGÂHA GİTMEZ): `out/P1_S2_Alt_mihenk_KARSILASTIRMA_TEZGAHA_GITMEZ.nc` (kapılar temiz); `out/P1_S1_Ust_mihenk_BLOKLU_KARSILASTIRMA_TEZGAHA_GITMEZ.nc`, `out/P1_S3_A90_mihenk_BLOKLU_KARSILASTIRMA_TEZGAHA_GITMEZ.nc` (kapılar block verdi, zorla yapı karşılaştırması için üretildi; başlıkta BLOCK listesi).
