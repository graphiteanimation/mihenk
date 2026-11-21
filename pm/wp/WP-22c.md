# WP-22c — 0.6 son devirler: arcFit/sarma, WP-12 verimi, 3B kaba süresi, node iptali

Dal: `wp-22c` (taban master fbbdbd1). Model: O. Kaynak: BACKLOG WP-22c, WP-12/WP-15 doğrulama bulguları, O-050.

## Sözleşme özeti
- Kapsam: (1) yay uydurma sarma/döner eksenli yolda atlanır; (2) WP-12 verimi a–f; (3) P2 tepside 3B kaba ≤ 60 sn; (4) `surf/async.js` node aynı iş parçacığında iptal (bölme ya da belgeyi gerçeğe uydurma).
- Kabul: yeni `test/wp22c.test.mjs` (test-all listesinde, wp15'ten sonra); `wp12`, `wp15`, `wp16`, `cam`, `post`, `sim`, `sim3d`, `i18n`, altın koşu (BLOCK 62, temiz 13/19) kötüleşmez; `npx vite build`; `python3 test/cam-ui.test.py`.
- Dokunulmayanlar: `src/cam/sim/` (yalnız `simulate`/`stockHeightmap`/`sampleHeightmap` API'si), `src/ui/cam/ops.js`, kernel, ui/sketch, resim, post biçimi.

## Yapılanlar (O önerileri)
1. **arcFit + sarma** (`ops/arcfit.js`). Hata yeniden üretildi: Ø50 sarmada açılmış düzlemde yay (117 A'lı feed) eski kodda 6 harekete birleşiyor, A değerleri ilk hareketinkiyle eziliyordu (`tmpl` yayılımı). **O önerisi:** `tp.wrap` ya da herhangi bir harekette `a` varsa arcFit hiç uygulanmaz, yol aynen döner, `meta.arcFit.skipped = 'rotary'` ve uyarı `cam.arcfit.skipped_rotary`; ayrıca `sameRun` A'lı hareketi hiçbir zaman birleştirmez. Şema düzeyi: alan şemada genel kalır, `computeOp` sarma yolunda yok sayar (uyarıyla). Panel: arcFit yalnız 3B panellerinde (`oppanel-wp15.js`), sarma panelleri (`ops.js`, dokunulmadı) göstermiyor.
2c. **Dar halka** (`adaptive.js`, `surface.js`): hiç yol yoksa artık `cam.adaptive.nothing` yerine alanlı hata: girişsiz alan varsa `cam.adaptive.no_entry_left {area}`, yoksa erişilemeyen alan `cam.pocket.rest_material {area}`. **O önerisi:** boş yol yerine hata (boş takım yolunun post/sim zincirine girmemesi için). D10, helis 8, 12 mm halka: hata alanı 1824 mm² (halka 1765 mm²; ızgara payı).
2a. **Rest'te havadan helis** (`adaptive.js`): neden `findStart`'ın yalnız en yakın 16 adayı denemesi (sıkışmış köşe adaylarının hepsi verimsiz → erken null → helis). **O önerisi:** yalnız rest kipinde ve helis halkasının ≥ %25'i bu seviyede zaten boşsa uzatılmış aday araması (en çok +400 kuru koşu, boş yürüyüş 6 adım); başlangıç bulunursa helis açılmaz, yandan girilir. WP-12 rest örneği (D16 cep → D4 rest stock): helis 1 → 0, kesme 653 → 575 mm, dört köşe tabanda. Tam stokta uzatılmış arama P2 3B kabayı 86 → 137 sn yavaşlattığı için kapalı (ölçüldü, düzeltme commit'i 5d24516).
4. **Node iptali** (`surf/async.js`): **O önerisi:** belge gerçeğe uyduruldu — worker yoksa hesap bölünmez (senkron), AbortSignal süren hesabı kesemez. Bu kipte iptal hesaptan önce (bir olay döngüsü turu) ve sonra (abort geldiyse sonuç atılır, `cam.op.cancelled`) uygulanır; `ctx.shouldStop` (süre sınırı vb., atarak) döngülerde denetlenir — uyarlanır motora (2D/3B, paso arası) eklendi. Süren hesabı node'da AbortSignal ile kesmek için worker verilmeli (`test/wp15/opworker-node.mjs`). Worker fabrikası hata verirse satır içi yol da artık iptali gözetir.
3. **3B kaba süresi** (`adaptive.js`): profil: süre `findStart` kuru koşularında (P2'de ~5900 çağrı, ~90 bin kuru koşu, yalnız 96'sı KMAX'a ulaşıyor), `refreshDm` tam EDT'si ve `segAllowed`/drop. **O önerisi: yolu değiştirmeyen hızlandırmalar** (P2 hareket özeti md5 öncesi = sonrası `90579c652fd7`, 62 779 hareket; 2D wp12 kapalı cep de birebir aynı):
   - artımlı `dmR`: yalnız r + 3g'ye kadar kesin gerekir; son yenilemeden beri rch'si değişen kutu ± CAP hedefleri ± 2CAP pencerede yeniden hesaplanır;
   - duvardan uzak hücre maskesi (`allowed2` SegGrid sorgusu atlanır; üçgen eşitsizliğiyle kesin);
   - temas sayımında sınır aşılınca erken red (aynı ifade, aynı sonuç);
   - seçilen adayın kuru koşu adımları gerçek pasoda yeniden kullanılır (aynı ızgara durumu → aynı adımlar).
   - Denenip bırakılan: karo sürümlü kuru koşu önbelleği (isabet %1,4; yararsız).
2b. **rest_material alanı** (`adaptive.js`): **O önerisi:** 2D'de alan son seviyede ızgaradan ölçülür: hâlâ malzemeli (hg > z) ve izinli sınır duvarına yanal pay + 1 hücreden uzak hücreler; girişsiz alan (ayrı uyarı) düşülür. WP-12 rest örneği: 48,25 → 3,69 mm² (analitik dört köşe r²(1 − π/4) = 3,43 mm²). 3B (surf) hesabı değişmedi.
2e. **Çıkışta ilerleme düşürme** (`feedopt.js`, `index.js`, `schema.js`, `oppanel-wp12.js`, i18n): **O önerisi:** `feedOpt.exit.when: 'material' | 'always'`. `material`: dizi sonunda takımın ön konisi (±30°, r + h) işlem öncesi stoğun (kutu/silindir ya da rest stok haritası) dışında ise çıkış sayılır (stok kenarından havaya çıkış); malzeme içinde biten dizi yavaşlatılmaz (`meta.feedOpt.insideEnds`). Alan yoksa `always` (eski davranış: eski belgeler ve wp12 testi bunu bekliyor); arayüzde çıkış yeni açıldığında `material` yazılır, onay kutusuyla değiştirilir. Kapalı cep: çıkış 1 → 0; stok kenarına açık kenarlı uyarlanır: 297 dizi sonu → 16 gerçek çıkış (hepsi x = 80 kenarına ≤ 6,5 mm).
2f. Ayrı iş yapılmadı; 3. maddedeki hızlandırmalar 2D motoru da kapsar: wp12 kapalı cep (100×60, D10) 11,7 → 8,4 sn (aynı yol).

## Ölçümler (2 çekirdek, paylaşımlı makine; cpu sn, `process.cpuUsage`)
- P2 3B kaba (`node test/wp15/p-sure.mjs adaptive3d`, D16, yük 4, kademe 10, ara 2,5): master **85,5 / 92,1 sn** (iki koşu, yük farkı) → **57,3 sn** (duvar 63 sn). Hareket 62 779, özet aynı. Hedef ≤ 60 sn karşılandı ama pay küçük; yük altındaki makinede cpu süresi ±%10 oynuyor.
- wp15 testi içindeki 3B kaba (`adaptive3d`) 13,9 sn, rest 6,1 sn.
- `p-sure.mjs`'ye hareket özeti (md5, ilk 12) eklendi: hız değişikliğinin yolu değiştirip değiştirmediğini gösterir.

## Testler (bu oturumda koşuldu, sırayla)
- `node test/wp22c.test.mjs`: 29 geçti, 0 kaldı (~13 sn). Bölümler 1, 2a(+2b), 2c, 2e, 4; `WP22C_ONLY=2a,4` ile seçilebilir. 3. madde P2 ölçümüyle (test içinde değil; STEP + çekirdek gerektirir, ~60 sn).
- `wp12` 53/0, `wp15` 112/0, `wp16` 85/0, `cam` 602/0, `post` 281/0, `sim` 138/0, `sim3d` 100/0, `i18n` 52/0.
- Altın koşu, `vite build`, `cam-ui.test.py`: aşağıda "Son koşu".

## Açıklar
- **2d (temas açısı tepe aşımı) yapılmadı.** Bulgu: wp12 kapalı cepte bağımsız ölçüm en büyük 56° (sınır 45,6°), > 48° yalnız 9 örnek; çoğu duvar dibinde değil, ada yakını ve paso başlarında (≤ 1,5 mm) ve `link` hareketlerinde (bağımsız ölçüm link'i de kesme sayıyor). Duvar bandını 2g → 3g genişletmek tepeyi 67°'ye çıkardı (geri alındı). Önerilen: paso başı/bağlantı kuantalamasını ayrıca ele almak (ayrı iş).
- 2f yalnız 3. maddedeki ortak hızlandırma kadar; P1 o2 (`P1_ADAPTIF=1`) yeniden ölçülmedi.
- Node'da süren hesabı AbortSignal ile kesmek hâlâ worker gerektirir (bilinçli: senkron motoru bölmek ayrı iş).
- 2e malzeme modeli işlem öncesi stoktur: aynı işlemin boşalttığı boşluğa çıkış (ör. kanal içinden önceki pasonun boşluğuna) çıkış sayılmaz; eğimli/3B yollarda yalnız XY ön konisi.
- 2b 3B kaba alanı eski hesapta (küçük artık sayımı) kaldı.
- `pm/wp/WP-15.md` O önerisi 11'deki "node'da aynı iş parçacığında (`shouldStop` denetimi)" cümlesi bu notla düzeltilmiş sayılır (dosya değiştirilmedi).
- Arayüzde yeni "Yalnız malzemeden gerçek çıkışta" kutusu için Playwright senaryosu yazılmadı.

## Son koşu (wp-22c, 637ca0c + not)
- `node test/altin/kos.mjs`: 100 geçti, 0 kaldı; temiz NC 13/19, toplam BLOCK 62 (taban ile aynı).
- `npx vite build` geçti; `python3 test/cam-ui.test.py` 345 geçti, 0 kaldı.
- Koşulmayanlar: `app.test.py`, `ui.test.py`, `sketcher.test.py`, `iptal.test.py`, electron testleri, `npm run test:all` tam zinciri, `P1_ADAPTIF=1` P1 karşılaştırması.
