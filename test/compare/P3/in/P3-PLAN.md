# P3 NIST FTC-06 blok — Fusion betiği için CAM planı (karşılaştırma testi)

Ölçüler mm, STEP koordinatları (resim inç; model mm'ye çevrilmiş). NC dosyaları tezgâha gitmez (`_KARSILASTIRMA_TEZGAHA_GITMEZ`).

## Geometri (OpenCascade ile okundu)
- Kutu X ±152,4, Y 0…97,79, Z −247,65…0; 1 katı, hacim 3 323 546 mm³ (~9 kg Al). STEP'te ayrıca Y=106,68'de serbest bir nokta var (katıya ait değil, bbox'a sayılmadı).
- Taban plaka: Y 0…31,75, Z −234,95…0, X ±152,4 (304,8 × 234,95). Alt yüz (Y=0) düz.
  - 4× Ø10,54 (Ø.415 ±.008) geçiş deliği (X ±133,35; Z −57,15 ve −184,15), üstten Ø15,875 (Ø.625 ±.02) × 12,7 havşa (Y 19,05…31,75).
- Arka duvar: Z −31,75…0, üst Y 97,79; uçlarda R12,7 üst dış köşe (CR.50). İki V yarık (X ±82,55 ekseninde): taban Y 52,07, 12,7 genişlik (.500 ±.008), dikey duvar Y 66,04'e kadar, sonra ~65° yanaklar üst yüze (Y 97,79) açılır; Z boyunca boydan boya. Üst orta yüzde SR12,7 küre çukuru (X ±12,7, Z −28,6…−3,2, Y 85,09…97,79). 2× Ø14,29 (Ø.562 ±.008) delik (X ±127, Y 78,74), −Z yüzünden Ø20,64 (Ø.812) × 14,29 havşa.
- Kaburga (orta, X ±12,7): Z −133,35…−31,75, üst eğimli (1:2, 26,6°) Y 46,99→97,79; dibinde R3,175 fileler.
- Ön duvar: Z −234,95…−209,55, üst Y 50,8. Üzerinde 4 boss Ø44,45 (eksen Z, X ±36,2 ve ±108,59, Y 50,8), Z −247,65'e uzar (ön duvarın 12,7 önüne taşar). Her boss'ta Ø7,14 (Ø.281) delik Z −209,55'e geçiş (38,1), uçta Ø10,16 × 7,94 havşa. Boss–duvar R3,175.
- 2 konik direk (X ±76,2, Z −158,75): taban Ø31,75 (Y 31,75…47), 9,5° koni, üst Y 85,09 (Ø19,05); tepede Ø6,35 × 12,7 delik (dibi 118° koni). Tabanda R3,175 file.
- 2 küre SØ31,75 (X ±114,3, Z −107,95; merkez Y ~63,5) Ø22,86 boyun üstünde; alt yarısı alt-kesim.
- Ön yüzde (Z=−234,95) "NIST" yazı oyması, 2,54 derin, en küçük iç yarıçap 0,415.
- Genel profil toleransı .05; en sıkı ölçü toleransları ±0,2 (delik/yarık), yüzey profili .02–.05.

## Erişim analizi (3 eksen + A, divizör X ekseni boyunca)
- +Y: taban üst, duvarlar, kaburga, direkler, kürelerin üst yarısı, V yarıklar, küre çukuru, R12,7 köşeler, 4 plaka deliği, direk delikleri, dış silüet. Tek setup.
- −Z (A≈±90): boss uç yüzleri, boss Ø7,14 delikleri + havşalar, boss alt yarıları/altındaki stok, ön yüz düzlemi, yazı.
- +Z (A≈∓90): arka yüz, arka duvar Ø14,29 deliği.
- −Y: yalnız alt yüz (2 mm deri). X yönlü hiçbir delik/yüz özelliği yok → 4. bağlama (yan mengene) gerekmez; **divizörle 3+1 yeter**. Tamamen erişilemeyen: küre alt yarısı/boyun, arka duvar iç havşa (bkz. Kapsam dışı).

## Sabitler
Al 6061-T6; stok kutu + 2 mm her yana → 308,8 × 101,79 (Y −2…99,79) × 251,65 (Z −249,65…2). Sıfır stok üst merkezi. Neway VM1160H, M80V, M8, devir ≤ 8000, ilerleme ≤ 5000. Post Fusion genel Mitsubishi. Program 2003 (S1), 2004 (S2), 2005 (S3), 2006 (S4); iş ofseti G55 / G57 / G58 / G59 (Fusion work offset 2 / 4 / 5 / 6).

## Eklenen takımlar (T34+; ortak listeden T20, T21, T22, T24 kullanılır)
| T | Takım | Taşma | n | Vf | Vz |
|---|---|---|---|---|---|
| T34 | Ø12 düz parmak 3 ağız EKSTRA UZUN, ağız 40 | 105 | 8000 | 1500 | 500 |
| T35 | Ø12 R3 köşe radyuslu 3 ağız UZUN, ağız 35 | 80 | 8000 | 1500 | 500 |
| T36 | Ø10,5 matkap 140° | 60 | 3500 | 500 | 500 |
| T37 | Ø7,1 matkap 140° | 50 | 3500 | 420 | 420 |

Gerekçe:
- T34: dış duvar/stok kabuğu tam yükseklikte kesilir (stok üstünden Y=−0,2'ye ~100 mm) ve Ø40 tutucu arka duvarın R12,7 köşesinin (Y 97,79) üstünde kalmalı; ayrıca yüz tarafında düz uç gerekir (alt dış kenar R3 artığı olmasın). Mevcut en uzun taşma 55.
- T35: iç filelerin R3,175'i için R3 köşe; taşma 80 → tutucu tabanı kat dibinde (Y 31,5) Y 111,5'te, arka duvarın (97,79) üstünde → duvar dibinde çarpışma yok. T32 (taşma 55) yetmez.
- T36: Ø10,54 ±0,2 geçiş deliği 31,75 derin + deri; T22 ağzı 16 kısa, T21 Ø12 büyük.
- T37: Ø7,14 ±0,2 boss deliği 38 derin; T22 taşması 25, mevcut matkaplar Ø5,5 / Ø6,1.

## S1 "P3-S1 Ust" — G55, takım ekseni model +Y
Alt sınır −0,2: parça S4'e kadar 1,8 mm deriyle stoğa bağlı kalır. Stok bırakma radyal 0,3 / eksenel 0,2.
1. Yüzey T20 → Y 97,79 (2 paso).
2. 3D Adaptive T34, alt Y −0,2, optimal yük 1,2, paso 12 (iç boşluk, boss/direk/küre üstü, dış stok kabuğu).
3. Yatay temizleme T35, alt Y 31,5 (plaka üstü, ön duvar üstü, arka duvar üstü, V yarık tabanı, direk üstü).
4. 3D Kontur T35, alt Y 31,5, paso 1 (duvarlar, kaburga, koni, küre üst yarısı, R12,7 köşeler, V yarık, küre çukuru).
5. 2D Kontur T34, dış siluet (yalnız dış halka), üst Y 36, alt Y −0,2, paso 12, sol (climb).
6. Bore T21: 4× Ø15,875 havşa, Y 31,75 → 19,05.
7. Punta T24: 4× Ø10,54, 1,5 derin (Y 17,55).
8. Delme T36: 4× Ø10,54, G83 gaga 5, boydan boya +1.
9. Bore T22: 2× Ø6,35 direk deliği, Y 85,09 → 72,39.

## S2 "P3-S2 On A" — G57, takım ekseni model −Z (A ±90, 3+1), stok önceki setup'tan
Eksen koordinatı s = −Z. Önceki stokun üstü boss uç yüzü (s 247,65) varsayıldı.
10. 3D Adaptive T34, alt s 234,95 (boss altı/yanındaki stok; ön plaka düzlemine kadar).
11. Yatay temizleme T35, alt s 234,78 (ön yüz düzlemi s 234,95, boss uç yüzleri s 247,65).
12. 2D Kontur T21: 4× boss dış çemberi (Ø44,45), s 247,65 → 234,95, paso 6,4.
13. Bore T22: 4× Ø10,16 havşa, s 247,65 → 239,71.
14. Punta T24: 4× Ø7,14, 1,5 derin (s 238,21).
15. Delme T37: 4× Ø7,14, G83 gaga 5, boydan boya +1.

## S3 "P3-S3 Arka A" — G58, takım ekseni model +Z (A ∓90, 3+1), stok önceki setup'tan
Eksen koordinatı s = Z. Arka yüz S1 konturuyla Z=0'a inmiş varsayıldı (s 0).
16. Yatay temizleme T35, alt s −0,17 (arka yüz düzlemi, flatness).
17. Bore T34: 2× Ø14,29 arka duvar deliği, s 0 → −32,75 (iç yüzün 1 mm ötesine; havşa halkası kalır).

## S4 "P3-S4 Alt" — G59, takım ekseni model −Y (ters çevrildi), stok önceki setup'tan
18. Yüzey T20: Y −2 → 0, 2 paso. Parça stoktan burada ayrılır.

Toplam 4 setup, 18 işlem, 8 takım (4 yeni).

## Kapsam dışı / Kısmen
- "NIST" yazı oyması (ön yüz, 2,54 derin, R0,415): Ø0,8 altı takım gerekir → yapılmadı (takım yok). −Z'den erişilebilir.
- Arka duvar 2× Ø20,64 × 14,29 havşa (Z −31,75 yüzünden): −Z yolu ~218 mm derin ve küre/boss/ön duvarla çakışır (OCC kesişim: Ø12 eksen yolu 104 mm³, Ø20,64 yolu 1138 mm³) → yapılmadı; Ø14,29 delik arkadan açılır, havşa halkası kalır → Kısmen.
- 2× küre: +Y'den yalnız ekvatora (Y 63,5) kadar kesilir. Alt yarı, Ø22,86 boyun ve boyun–küre / taban fileleri alt-kesim; ±Z'den de bloklu → ~R15,9 silindirik artık → Kısmen.
- Ø12 ile ~0,175 mm artık: iç fileler R3,175 (T35 R3). Kaburga–arka duvar 2 dikey iç köşe R3,175: Ø12 sığmaz, R6 artık → Kısmen. V yarık taban–duvar köşeleri (modelde keskin): R3 artık → Kısmen.
- Direk deliği dibi 118° koni: Ø6 düz uç bore → düz dip → Kısmen.
- Sığ eğimli yüzeyler (kaburga 26,6°, küre üstü, SR12,7 çukur): Z-seviye 3B kontur paso 1 ile tarak izi; profil .02–.05 tutmayabilir → Kısmen.
- Ø6,35 ±0,2 direk deliği T22 (Ø6) ile helis; delik toleransı bore ile sağlanır.
- Bağlama (fikstür/divizör sıkma) modellenmedi: S1–S3'te parça 1,8–2 mm deriyle stoğa bağlı varsayıldı, S4 sonrası serbest.
- A kelimesi: S2/S3'te WCS takım eksenine hizalı → post A üretmeyebilir (P1-S3 ile aynı durum); S3b türü varyant eklenmedi (zincir bozulmasın diye). Sonuç raporda `A_notu`.
- `stok_ust_s` (S2 247,65; S3 0,0) varsayımı: Fusion önceki-setup stokunun "from stock top" referansı gerçekte bundan farklıysa bore/punta/kontur yükseklikleri ±2 mm kayar → logdaki "stok boyutu"na ve GUI'deki yüksekliklere bakılmalı.

## Fusion koşu sonucu (2026-11-19)
- Deneme 1 (sonuclar\P3_deneme1): 16/18. Hata: 14 punta "top height must be above bottom", 16 yatay boş yol. Neden: önceki-setup stokunda da Fusion "from stock top" = STOK KUTUSU üstü (bbox+2). Düzeltme: stok_ust_s S2 247,65→249,65, S3 0→2 (S2/S3 yükseklikleri önceki koşuda 2 mm sığdı).
- Deneme 2 (P3_deneme2): S2–S4 tamam; S1 adaptive 300 s zaman aşımı → S1 NC yok. GEN_TIMEOUT_S 300→900.
- Son (sonuclar\P3): 18/18, param hatası 0. Süre S1 24 658 s (adaptive 18 699 s), S2 2 985, S3 424, S4 173 → ≈ 7 sa 51 dk. NC satır: 699 610 / 59 788 / 1 659 / 71.
- S2 ve S3 NC'de yalnız A0 var (WCS takım eksenine hizalı; P1-S3 ile aynı sorun) → 3+1 açısı postta yok. Kısmen.
- GUI simülasyonuna bakılmadı.
