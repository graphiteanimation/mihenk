# P4 NIST FTC-10 kapak — Fusion betiği için CAM planı (karşılaştırma testi)

Ölçüler mm (STEP birimi mm; çizim de mm). STEP koordinatları. NC dosyaları tezgâha gitmez (`_KARSILASTIRMA_TEZGAHA_GITMEZ`).

## Geometri (OpenCascade ile okundu)
- Sıkı kutu X ±79, Y 0…31, Z ±37,5 (BRepBndLib gevşek: 79,742 / 31,659 / 38,242 — betiğe sıkı değer girildi). 1 katı, hacim 188 318 mm³ (~0,5 kg Al), kütle merkezi (5,017; 14,611; 0,01). 214 yüz.
- Taban Y=0 düz (datum A). Gövde X ±62,5, Z ±37,5, üst düz Y=23 (kenar R1 yuvarlak). Kulaklar (flanş Y 0…8, üst Y=8, gövde dibinde R1 iç file): X ±62,5…±79; uç X=±70 (Z ±18,55) + iki R9 lob (merkez X ±70, Z ±28,5); girinti köşeleri R1.
  - 4× Ø6 (±0,15) geçiş, merkez (±70; ±28,5), Y 0…6; üstten Ø10 (±0,25) × 2 (±0,15) havşa, Y 6…8.
- Alt cep (yalnız −Y'den): X −58…20, Z ±25, duvar Y 0…15, 2 mm taban filesi, taban Y=17; dikey köşeler R2. Cep içi yüzey profili 1,2. Tavan kalınlığı 2,5 (Y 17…19,5).
  - 8× Ø2,5 (±0,15) delik cep tabanından (Y 17) çapraz Ø7 deliğin altına (Y 19,5; yüz Y 17…19,73) açılır; merkezler X −52/−30/−8/14, Z ±15,5.
- 4× çapraz Ø7 (±0,25) delik, eksen Z, merkez Y=23, X −52/−30/−8/14, Z −27,5…27,5 (boydan boya 55). Her iki Z yüzünde (Z=±37,5) 4+4 Ø10 (±0,25) × 10 (±0,2) havşa (Z 27,5…37,5).
- Üst yüz: Y=23 düz + 4 dalga (eksen Z, R8 tepe Y=31, X −52/−30/−8/14) arası R12,5 vadiler; uçlarda R1 yuvarlamalar. X 19,7…61,5 boyunca Z ekseninde ortada R6 yarım yuvarlak kaburga (X yönünde, Y 23…29, Z ±6, R1 ayak fileli).
- +X ucu (Z −32,5…−17,5): kademeli kaide X 29,5…59,5, üç şerit Y=27 (X 29,5…37,5 / 40,5…48,5 / 51,5…59,5, 3 yüz birbirine eş düzlemli) arası 3 mm genişlikte Y=25,5 kanallar; ayak filesi R1, dikey köşe R1. 6× M3×0,5-6g (Ø2,459 küçük çap, Y 27→15 + 118° uç, Y 14,26) (X 31,9/42,9/53,9 @ Z−30; 35,1/46,1/57,1 @ Z−20) ve 3× Ø3,5 (±0,2) (X 33,5/44,5/55,5, Z−25; Y 27→17,12).
- +Z ucu (Z 16…31): oval boss X 35,5…59,5 (R7,5 uçlar, merkez Z 23,5), üst Y=31; 3× Ø3,5 (±0,2) (X 40,5/47,5/54,5, Y 31→20,12).
- +Z yüzünde yarık X 40…55 (15 ±0,2), Y 0…23 boydan boya: iki yan cep Z 34,5'e kadar (5 mm), ortada 5 ±0,2 kaburga Z 36,5'te. Cizimde iç kenarlar 4× R0,15 MAX.
- X yönlü (ekseni X): 2× Ø5,5 (±0,2, ▽35 ±1) delik +X ucundan (X=62,5 → 27,5), merkezler (Y 15, Z −25) ve (Y 18, Z 23,5), 118° uç. Ø3,5 delikleri bunlara açılır (çizim notu 4).
- Çizim toleransları: Ø7 ±0,25 konum Ø0 Ⓜ, silindiriklik 0,1; Ø10 havşa konum Ø0,8 (yüzde) / Ø1,2 (dipte); Ø6 konum Ø0,5/Ø0,65; Ø2,5 konum Ø0,75; Ø3,5 ±0,2 konum Ø0,8; M3 konum Ø0,8 P3,2; Ø5,5 konum Ø0,8; yarık 15 ±0,2 / 5 ±0,2, simetri 0,5; üst yüzey profili 1,75 / 1,2 (3 eş düzlemli şerit, 0,2); flanş 2 eş düzlemli yüz 0,12; cep içi 1,2; diğer 1,5.

## Erişim analizi (3 eksen + A, divizör X ekseni boyunca)
- +Y: üst dalgalar, düz, kaide + kanallar, boss, kulak üstü (Y=8) + Ø10 havşa + Ø6, M3 / Ø3,5 delikleri, dış silüet. Tek setup.
- −Y: yalnız alt düz + cep + 8× Ø2,5.
- ±Z (A ∓90): 4+4 Ø10 havşa + Ø7 (iki yandan, orta 2 mm bindirmeli), +Z yarık.
- **X yönlü Ø5,5 delikleri erişilemez** (takım ekseni X, 4. bağlama yok → Kapsam dışı). Başka X yönlü delik yok.

## Sabitler
Al 6061-T6; stok kutu + 2 mm her yana → 162 × 35 (Y −2…33) × 79. Sıfır stok üst merkezi. Neway VM1160H, M80V, M8, devir ≤ 8000, ilerleme ≤ 5000. Post Fusion genel Mitsubishi. Program 2007 (S1), 2008 (S2), 2009 (S3), 2010 (S4); iş ofseti G55 / G57 / G58 / G59 (Fusion work offset 2 / 4 / 5 / 6) — P3 ile aynı sıra. Eksen koordinatı s: S1 s=Y, S2 s=−Z, S3 s=Z, S4 s=−Y; 'from stock top' = stok KUTUSU üstü (S1 33; S2/S3 39,5; S4 2).

## Takımlar (mevcut olanlar kullanıldı; yeni T38+)
Mevcut: T20, T21, T22, T24, T29 (P1), T28 ve T33 (P2), T34, T35, T37 (P3) — tanımlar birebir aynı (statik kontrolle doğrulandı).

| T | Takım | Taşma | n | Vf | Vz |
|---|---|---|---|---|---|
| T38 | Ø4 küre uç (R2) 2 ağız UZUN, ağız 20 | 25 | 8000 | 440 | 150 |
| T39 | Ø2,5 matkap 140° | 25 | 6000 | 360 | 360 |
| T40 | M3×0,5 kılavuz (sağ) | 20 | 1000 | 500 | 500 |
| T41 | Ø3,5 matkap 140° | 22 | 5000 | 350 | 350 |

Gerekçe:
- T38: cep R2 dikey köşeleri + R2 taban filesi; Ø4 küre (JSON'da `bull nose` RE=2, T32/T35 ile aynı doğrulanmış şema); cep 17 derin → taşma 25.
- T39: Ø2,5 (±0,15) cep tabanı delikleri (taşma ≥ 19,7) ve M3 ön delik (Ø2,459, 12 derin); mevcut en küçük matkap Ø5,5.
- T40: M3×0,5-6g; Vf = n × 0,5. Takım tipi/anahtar adları doğrulanamadı (UNVERIFIED).
- T41: Ø3,5 ±0,2 delikler; Ø3,5 matkap yok.
- Kesme değerleri P1–P3 mantığıyla (Vf ≈ diş/ağız başına ilerleme × n; küçük matkaplarda devir yükseltildi).

## S1 "P4-S1 Ust" — G55, takım ekseni model +Y, stok Y −2…33
Alt sınır −0,2: parça S4'e kadar 1,8 mm deriyle stoğa bağlı. Stok bırakma radyal 0,3 / eksenel 0,2.
1. Yüzey T20 → Y 31 (2 paso).
2. 3D Adaptive T34, alt Y −0,2, optimal yük 1,2, paso 12 (dalga/kaide/boss çevresi, flanş üstü, dış stok kabuğu).
3. Yatay temizleme T35, alt Y 7,8 (Y=8 flanş, 23, 25,5/27, 31; Y=6 havşa tabanı hariç).
4. 3D Kontur T35, alt Y 7,8, paso 1 (dalgalar, vadiler, kaide, boss, kaburga, gövde duvarları).
5. 2D Kontur T34, dış siluet (yalnız dış halka), üst Y 33, alt Y −0,2, paso 12, sol (climb) (kulaklar, yan duvarlar).
6. 2D Cep (pocket2d, dalma girişi, paso 0,5) T29 [1. koşuda adaptive2d boş yol verdi], kaide 2 kanalı (X 37,5…40,5 ve 48,5…51,5; Z −33…−17), Y 27 → 25,5, optimal yük 0,4, paso 1,5. Eskiz `kanal_bolge` (yapı düzleminde, yüz izdüşümü yok).
7. Bore T22: 4× Ø10 kulak havşası, Y 8 → 6.
8. Punta T24: 4× Ø6, 1,5 derin (Y 4,5).
9. Delme T33: 4× Ø6, G83 gaga 3, boydan boya +1.
10. Delme T41: 6× Ø3,5, G83 gaga 3 (kaide Y 27→17,12; boss Y 31→20,12; yüz geometrisi dibi, +1).
11. Delme T39: 6× M3 ön delik Ø2,5, uç Y 14,3, G83 gaga 3.
12. Kılavuz T40: 6× M3×0,5, Y 17'ye (10 derin), G84 (cycleType 'tapping').

## S2 "P4-S2 Z-" — G57, takım ekseni model −Z (A +90, 3+1), stok önceki setup'tan
s = −Z. Stok üstü (kutu) s 39,5. Parça yüzü s 37,5.
13. Bore T22: 4× Ø10 havşa (−Z yan), s 37,5 → 27,5.
14. Punta T24: 4× Ø7, 1,5 derin (s 26,0).
15. Delme T37: 4× Ø7,1, G83 gaga 5, alt s −2,0 (merkezin 2 mm ötesi; S3 ile tam çap kesişir, tek yönden 28 derin).

## S3 "P4-S3 Z+" — G58, takım ekseni model +Z (A −90, 3+1), stok önceki setup'tan
s = Z. Stok üstü 39,5.
16–18. S2'nin aynısı +Z yan: Bore T22 4× Ø10 (s 37,5 → 27,5), Punta T24 4× Ø7, Delme T37 4× Ø7,1 alt s −2,0.
19. Adaptive 2D T28, yarık tüm genişlik (X 40…55, Y 0…24), Z 37,5 → 36,5 (orta kaburga tabanı), paso 1, stok payı yok.
20. Adaptive 2D T28, iki 5 mm cep (X 40…45 ve 50…55), Z 36,5 → 34,5, paso 1, stok payı yok.

## S4 "P4-S4 Alt" — G59, takım ekseni model −Y (ters çevrildi), stok önceki setup'tan, stok üstü s=2
21. Adaptive 2D T21, cep ağzı (X −58…20, Z ±25), üst s 2 → alt s −14,8 (Y 14,8: duvarın düz bölümü Y 15'e kadar; taban filesi bozulmasın), optimal yük 1,2, paso 8, pay 0,3 radyal / 0 eksenel.
22. Yatay temizleme T21, taban Y=17: üst s −10, alt s −17,2 (üst sınır Y=0 düz yüzünün deri alımını dışlar).
23. 3D Kontur T38, alt s −17,0, paso 0,5 (cep duvarları, R2 köşeler, taban filesi).
24. Delme T39: 8× Ø2,5 cep tabanı, G83 gaga 1,5, boydan boya +1 (çapraz Ø7 içine; S2/S3'te açıldığı için).
25. Yüzey T20: Y −2 → 0, 2 paso (**en son**: parça stoktan burada ayrılır; cep/delik işleri deri bağlıyken biter).

Toplam 4 setup, 25 işlem, 14 takım (4 yeni: T38–T41).

## Kapsam dışı / Kısmen
- **2× Ø5,5 ±0,2 × 35 X yönlü delik** (+X ucu): takım ekseni X, divizör A ekseni X → erişilemez; yapılmadı (bağlama yok). Ø3,5 delikleri bu deliklere açılacağından burada katıda kör kalır → Kısmen.
- M3×0,5 diş: kılavuz takım tipi (`tap right hand`, TP) ve `cycleType 'tapping'` doğrulanamadı (UNVERIFIED); hata verirse yalnız ön delik (op 11) açılır → Kısmen.
- R1 iç file: kaide ayak filesi, kulak/duvar dibi (Y 8–9) ve kaburga ayağı; T35 R3 ve T29 Ø2 düz uçla yapılamaz → keskin köşe/artık. Kaide kanalları T29 düz uçla (tabanı keskin).
- Kulak girintisi dikey köşesi: modelde R1, çizimde 4× R0,2 MAX (çizim modele üstün); Ø12 siluet konturu R6 artık bırakır → Kısmen.
- Dalga yüzeyleri (R8 tepe, R12,5 vadi, R6 kaburga): Z-seviye 3B kontur paso 1 tarak izi; profil 1,75 / 1,2 tutmayabilir → Kısmen.
- Cep: R2 taban filesi ve dikey R2 köşe D4 küre uç, paso 0,5 → tarak izi; profil 1,2 tehlikede → Kısmen. 2D adaptive dikey köşe R2'yi 0,3 payla D12'den bırakır, T38 temizler.
- Yarık: D3 ile 5 mm cep; Z yönü köşeleri keskin (R0,15 MAX ile uyumlu); X yönü cep köşeleri R1,5 (çizim belirtmiyor).
- Ø7 çapraz delik iki yandan; tam çap kesişimi (not 4) ve silindiriklik 0,1 doğrulanmadı. Ø2,5 delikleri eğri yüzeye (Ø7) çıkar → uç sapması olabilir.
- Bağlama modellenmedi: S1–S3'te parça 1,8–2 mm deriyle stoğa bağlı varsayıldı; S4'te cep/delik bağlıyken, yüzey en sonda. Flanş/yan duvarlar ince tutucu çarpışması hesaplanmadı (T22 taşma 25: kulak havşası sırasında tutucu alt kenarı Y≈31'e yakın).
- A kelimesi: S2/S3 WCS takım eksenine hizalı → post A üretmeyebilir (P3-S2/S3 ile aynı); `A_notu` raporda; S3b varyantı eklenmedi.
- `stok_ust_s` (S2/S3 39,5; S4 2,0) = stok kutusu üstü (bbox + 2 pay), P3 dersine uygun; GUI'de "stok boyutu" logu kontrol edilmeli.

## Betikte yapılanlar (özet)
- `PART = "P4"`; `PARTS["P4"]` eklendi; `GEN_TIMEOUT_S` 900 aynen (P4 stoku P3'ün ~1/17'si; P3'te adaptive 900 s'ye sığdı).
- Yeni seçici türü `cokgen_yapi` (yapı düzleminde kapalı çokgen eskizi; yüz izdüşümünü önler), `silindir_yuzleri/delik_yuzleri` için opsiyonel `eksen_aralik` (aynı eksendeki ±Z yan ayrımı), `find_axis_map` için opsiyonel kütle merkezi doğrulaması (P4 kutusu X ve Z'de simetrik). P1–P3 girdileri birebir aynı (statik karşılaştırma ile doğrulandı).
