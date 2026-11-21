# Altın set BLOCK sınıflaması — ek kayıtlar

Taban ve genel sınıflama `pm/wp/WP-10.md` (dilim 2) notundadır. Bu dosya sonradan sınıflanan maddeleri tutar; her madde yeniden üretilebilir bir deneye bağlıdır.

## P1 S3 `cam.sim.holder_collision` ×2 (WP-21)

**Sonuç: gerçek çarpışma değil; stok modeli kaynaklı. Gerçek bulgu aynı setup'taki `cam.gate.body_short` (T30 taşma boyu 35 < 36,8, T-08).**

Deney: `node test/compare/P1/run-p1.mjs` → `p1-mihenk-sonuc.json` `deneyler.WP21_S3_tutucu` (denetim: `test/wp21.test.mjs` madde 7). o10 (Ø5,5 delme, A90) delik dibinde (z −36,801) tutucunun alt yüzü z −1,801'dedir (taşma 35, tutucu Ø40 × 50 — tutucu boyu planda yok, test değeri). Tutucu dairesindeki en yüksek malzeme (setup z; her iki delikte aynı):

| Stok modeli | En yüksek malzeme | Boşluk |
|---|---|---|
| Ayrı setup, ham kutu (ana kapı sayıları; taban) | 0 (stok üstü) | −1,801 → kapı derinliği 1,80 |
| Sim zinciri (`stockFromPrevious`) | −1,25 | −0,551 |
| Aynı zincir kuralı, genişletmesiz, 0,05 mm ışın adımı | −2,00 | +0,199 |
| Model üst haritası (kule üstü) | −2,00 | +0,199 |

- Ayrı setup koşusunda S3 ham kutudan başlar: kule üstündeki +2 mm stok katı (S1'in dış boşaltma/kontur işlemlerinin −16,2'ye kadar, S2 yüzeyinin kalan 1,8 mm alt katı kaldırdığı bölge) yerinde sayılır. Çarpılan malzeme bu kattır: plan/model uyumsuzluğu (betiğin "önceki setup'tan stok yok" varsayımı).
- Zincir koşusunda (`T04_zincir`) çarpışma kalır çünkü zincir muhafazakârdır: önceki setup haritaları komşu 3×3 hücrenin en büyüğüyle genişletilir ve bulunan tepe bir ışın adımı (res/2) yukarı yuvarlanır → kule üstü +0,75 mm. Bu payı kaldıran ölçüm, önceki setup'ların bıraktığı malzemenin model kule üstüne (−2,0) indiğini gösterir.
- Gerçek kalan malzemeyle boşluk 0,199 mm'dir: çarpışma yok ama `cam.sim.holder_clearance_low` (en az 0,5) uyarısı yerindedir (elle silüet stoğu deneyinde de bu uyarı çıkar). Boşluğun bu kadar küçük olmasının nedeni zaten engelleyen kısa taşma boyudur; takım planda 36,8+ taşmayla seçilirse tutucu kuleden uzaklaşır.
- Zincirin payı sim alanındadır (`src/cam/sim/chain.js`, bu WP'de değiştirilmedi). Taban değişmedi.
