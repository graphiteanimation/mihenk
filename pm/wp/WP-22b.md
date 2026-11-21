# WP-22b — Sim devirleri: tri-dexel 3B oyma ve yan çarpışma, G87 oyma, sarma oyma/bağlama, G-code sim eşzamanlı A, okuyucu G68.2
Dal: `wp-22b` (tabanı `master` ac35dbc) · Model: Opus · Kaynak: BACKLOG WP-22 satırı (22b), WP-13/16/18 açıkları

## Sözleşme özeti
Kapsam (bu WP'de): (1) tri-dexel kipinde (`opts.dexel:'tri'`) modele oyma denetimi gerçek 3B ve sap/tutucu yan çarpışması X/Y ışınlarıyla; (2) G87 yukarı kesimde oyma; (3) sarma sim'inde modele oyma ve bağlama gövdesi; (4) G-code sim eşzamanlı A (G93/G94), post okuyucusu G68.2/G53.1/G69 + B/C; (5) WP-16 bulguları (G93 sızıntısı testi, silindir stok ağ köşesi toleransı). Tri kip varsayılan DEĞİL; varsayılan yükseklik haritası yolunun sonuçları değişmez. Dokunulmadı: `src/cam/ops/`, kernel, ui/sketch, resim, arayüz. BACKLOG 22b satırındaki WP-12 verim maddeleri (rest kipinde helis, `rest_material`, `no_entry_left`, temas açısı, paso sonu, hesap süresi) bu sözleşmede YOK (`ops/` paralel WP-15'te).

## Sözleşme (sim API, geriye uyumlu)
- Yeni seçenek `opts.modelMeshes: { [setupId]: { v: xyz (setup çerçevesinde; sarmada A = 0), t: üçlü dizin, err?: mm } }`. Verilmezse her yol eskisi gibi.
  - Tri kip + ağ: oyma modele karşı 3B (Z ışınları hücre merkezinde, X/Y ışınları stokla aynı ızgarada, örnek çifti kapsülü); yükseklik haritası (`modelHeightmaps`) yalnız keskin kenar pahı (`meta.chamferSharp`) işleminde kullanılır.
  - Yükseklik haritası kipi + ağ: yalnız G87 yukarı kesiminde Z ışınlarıyla oyma (diğer hareketler eskisi gibi haritadan).
  - Sarma bölümü + ağ: silindirik ızgarada model yarıçap ışınları (`meshRadialRays`).
- Sarma bölümünde bağlama gövdeleri: `setup.fixtures` ya da `opts.fixtures[setupId]` (WP-13 biçimi, A = 0 setup çerçevesi, parça ile döner) artık denetlenir (`fixture_collision/_shaft/_holder`).
- Tri kipte yeni yanal denetimler (X/Y ışınları, bant örtüşmesi > `lateralTol` 0,01): `flute_exceeded` (kesici boyu üstü, R), `shaft_collision` (sap > kesici çapıysa), `holder_collision` (tutucu profili). Hızlı ve kesme hareketlerinde.
- Dışa açılanlar: `triFromMesh`, `meshZGrid`, `meshRadialRays`, `boxMesh`, `mergeMeshes`, `bodiesMeshInFrame` (rebuild gövdeleri → setup çerçevesi ağı), `wrapFixtureHit`. `wrapTouch(..., tol, ext)` ek parametre (`ext.gtol`).
- `gcodeToProgram` yeni seçenek `aMode: 'continuous'` (varsayılan) | `'shortest'`. Eşzamanlı A yalnız iş koordinatı `opts.setups` içindeki bir sarma setup'ıyla eşleşince okunur; yoksa eskisi gibi `cam.gcode.a_simultaneous`.
- Kapılar: `opts.sim.modelMeshes` tri kipte ve sarma setup'ında model sayılır (`sim_no_model` yok); `sim_lateral_tol` tri + her (sarma dışı) setup'ta ağ varsa yazılmaz; `wrap_sim_limits` yalnız o sarma setup'ında ağ yokken (metin daraltıldı).

## Yapılanlar
1. `src/cam/sim/model3d.js` (yeni): üçgen ağdan eksene paralel ve yarıçapsal ışın aralıkları. Aralık kuralı sarım sayısı (giriş +1 / çıkış −1, malzeme = sarım > 0; aynı işaretli ve aynı konumdaki vuruş bir sayılır) → dokunan/üst üste binen kapalı kabukların birleşimi doğru; sarım tutarsızsa eşlik yedeği (tek sayıda vuruşta [ilk, son]: muhafazakâr). Boş ışınlar tek donmuş diziyi paylaşır, aralıklar tam boy diziye kırpılır.
2. `sim/index.js`: tri model oyması derinliği = örtüşmesi olan eksenlerin (Z, X, Y) en büyük örtüşmelerinin en küçüğü (tabanda Z, duvarda X/Y); `vertical` = Z örtüşmesi; diş bölgesi (`threadZones`) X/Y'de de kasıtlı. Sap/tutucu bantları kesimden ÖNCE ölçülür. G87 `backCut`: Z (ve tri'de X/Y) ışınlarında [alt, cutTo] silindiri ile model. Sarma: model ve bağlama gövdesi kurulumu bölüm girişinde (stok başına bir kez).
3. `sim/tridexel.js`: `sweepRays` geri çağrısı eksen/konum alır, `uMin` (bant alt sınırı); `triSweep`, `triBandHit`.
4. `sim/wrap.js`: modele oyma (kesici [uç, yanal sınır] ∩ model; derinlik = takım ekseni boyunca örtüşme ya da yanal sınıra değiyorsa yanal giriş, küçüğü); `wrapFixtureHit` (takım zarfı yüzeyi ≤ max(res, 0,25) aralıkla noktalanır, parça çerçevesine çevrilir; kutu/silindirde en yakın yüze uzaklık, ağda Z dexel aralığı; zarf 0,75·aralık büyütülür).
5. `sim/gcode.js`: sarma setup'ı eşleşmesi (aynı WCS'de sarma olmayan setup da varsa bölüm ilk eşzamanlı A ya da G93 ile sarmaya geçer), tüm G0/G1 hareketlerine sürekli `a`, sarma bölümünde A tek başına da hareket; G93 (f = `wrapMoveLen` × F, F her blokta), G94; G93'te yay `cam.gcode.inverse_arc`, çevrim `unsupported`.
6. `post/reader.js`: G68.2 X Y Z I J K (bölüm setup'ı `tilt {mode:'plane', euler, origin}`, `rot`), G53.1 (olay), G69 (bölüm sonu, konum bilinmez), B/C indeks (profilde eksen yoksa eskisi gibi `read_unknown_word`); açılmış çıkışta B/C ≠ 0 → `tilt {mode:'unwound'}` (XYZ makine çerçevesinde kalır).
7. `cam/index.js` silindir stok ağ köşesi toleransı: 1e-5 mm + 2,4e-7·(|x|+|y|+|z|) (float32 2 ulp). Eski 1e-6 sabit, R25 eksen (0, 300,5, −210,25) float32 çemberde yanlış `stock_small` veriyordu (test bunu doğrular: yuvarlama 1e-6'yı aşıyor).
8. i18n (`wrap-tr/en.js`, `cam-core`, `cam-post`): `cam.sim.bad_model_mesh`, `cam.gcode.inverse_arc`, `cam.post.read_tilt`; `wrap_sim_limits` ve `a_simultaneous` metinleri güncellendi.

## O önerisi (teknik seçimler)
- **Model ışınları stok ızgarasının aynısı** (tri: X/Y/Z; sarma: silindirik): ayrı uzamsal yapı yok, bellek stokla aynı mertebe, sorgu O(1) ışın erişimi. Çekirdek sorgusu gerekmez: ağ (rebuild üçgenleri) yeterli.
- **Sarım kuralı + eşlik yedeği**: OCCT üçgenlemesi yönlü; yönü bozuk ağda muhafazakâr (fazla model = fazla oyma uyarısı, kaçırma değil).
- **Derinlik = eksenler arası en küçük örtüşme**: tek eksen ışın örtüşmesi yüzeye dik girmeyi abartır (tabanda X/Y kirişleri ~2R). Engel ölçütü: herhangi bir eksende örtüşme > `gougeTol` + ağ `err`.
- **Sarma bağlama: nokta örnekleme** (analitik değil): A ile dönen takım eksenine göre kutu/silindir/ağ için tek kod yolu; kaba kutu elemesiyle çoğu örnek atlanır.
- **G-code A varsayılanı 'continuous'** (ISO mutlak); devirli eksen için çağıran `aMode:'shortest'` verir (post `wrapAMode` ile aynı karar).

## Bellek ve süre (bu ortamda ölçüldü)
- 100×80×40 mm stok, 0,25 mm (400×320×160): tri stok **16,7 MB**, model ışınları **15,5 MB** heap (gc sonrası; gc'siz geçici çöp dahil 87 MB), model kurulumu 0,2–0,95 s (yüke bağlı).
- `pocketHelixSample` (50×50×10, 0,25 mm) tam sim, RSS / süre: harita 50 MB / 1,1 s; tri 98 MB / 0,8 s; tri + model ağı 106 MB / 1,8 s (model X/Y süpürmesi kesim süpürmesi kadar iş: ~2×).

## Testler (bu ortamda koşuldu)
- `node test/wp22b.test.mjs` (yeni, `scripts/test-all.mjs` listesinde): **54 geçti, 0 kaldı**. Kabul: tri + ağ 0,2 mm yanal duvar oyması engel (derinlik 0,2), aynı örnek harita kipinde eskisi gibi görünmez; taban 0,1 mm (ikisi de engel); tutucu 0,2 mm yan duvar sürtünmesi tri'de `holder_collision` (harita görmez), sap 0,2 mm `shaft_collision`; G87 cutTo −23 gövdeye 2 mm → engel (tri ve harita + ağ), −25 temiz, ağ yokken eskisi gibi; sarma kanal tabanı r 23 kutu köşelerini (r 24,04) oyar → engel, ±15 kutu temiz, hacim değişmez; sarma bağlama kutusu engel, 1 mm uzak temiz; G-code sim sarma hacmi IR ile < %1 (kısa yol ve sürekli A), karışık 3 eksen + sarma; okuyucu A/C ve B/C G68.2 programı IR ile eşit, Euler eşleşir, açılmış A45 C45 okunur; G93 sızıntısı sarma → 3 eksen ve sarma → sarma (post + okuyucu + G-code sim); float32 köşe toleransı; kapılar.
- Gerileme (taban = değişiklik öncesi, aynı): `sim` 138/138, `sim3d` (WP-13) 100/100, `cam` 602/602, `post` 281/281, `wp16` 85/85, `wp18` 74/74, `wp14` 168/168, `wp12` 53/53, `i18n` 52/52.
- `node test/altin/kos.mjs`: altın 100/0, BLOCK (ayrı) **62**, temiz NC **13/19** (taban ile aynı). `npx vite build` geçer. `python3 test/cam-ui.test.py`: **345 geçti, 0 kaldı**.
- Koşulamayan: `ui`, `app`, `sketcher`, `iptal` Python testleri, Electron (bu WP arayüze dokunmadı); `npm run test:all` tek seferde koşulmadı.

## Açıklar
- Arayüz (O-050 dilimi, aşağıda) yalnız kapı simülasyonunu ayrıntılı kipte koşar; oynatıcı (sim çubuğu) yükseklik haritasıyla kalır, tri sonucunun görünümü (WP-13 açığı) yapılmadı. Model ağı görüntü ağıdır (tolerans max(0,005, köşegen/2000) mm, oyma toleransına `err` olarak eklenir): ince toleranslı iç bükey yüzeylerde kaba olabilir.
- Tri'de eğik hareketlerde kapsül yarıçapı iki ucun küçüğü (eski sınır); bant geçişinde (bir uç bant dışında) kapsül atlanır → yanal temas biraz geç görülebilir.
- Tri oyma Z ışınları hâlâ hücre merkezinde (taban yönünde yatay çözünürlük res). Ağ iç bükey yüzeyde gerçek yüzeyin dışında kalır; `err` (arayüzde görüntü ağı toleransı) oyma toleransına eklenir, daha sıkı yüzeylerde yalancı oyma olabilir. Oyma artık yalnız KESİCİ DİLİMİNDE ([uç profili, flüt üstü], Z ve X/Y); doğrulama bulgusu düzeltildi: Z ışını takımı sonsuz sütun sayıyordu (T-yuva takımı plaka altında yanlış "gouge 10").
- G87 takım modeli hâlâ eksenel simetrik (R − shift); yukarı kesimde barın sapı modellenmez.
- Sarma bağlama: zarfın tamamen içinde kalan küçük gövde görülmez; noktalama payı nedeniyle en çok 0,75·max(res, 0,25) mm erken uyarı. Sarma oyma derinliği ışın açısına bağlı yaklaşık.
- G-code sim: A kelimesi yorumu (`aMode`) tezgâh parametresidir; tezgâhta doğrulanmadı. Okuyucu açılmış (unwound) çıkışı yerel çerçeveye geri çevirmez.
- Hiçbir NC tezgâhta doğrulanmadı (test çıktısı).

## Ek dilim (O-050): arayüzde ayrıntılı simülasyon
- Belge alanı `doc.cam.sim = { detail: boolean }` (şema `validateCam`); yoksa kapalı (altın taban korunur).
- Arayüz: CAM tarayıcısında yeni "Simülasyon" bölümü, "Ayrıntılı simülasyon — 3 yönlü dexel, modele 3B oyma denetimi" onay satırı (`cam-sim-detail`); geri alınabilir, bildirim balonu. i18n TR/EN (`wrap-*.js`).
- `ui/cam/ops.js simOpts`: açıkken `dexel:'tri'` ve her setup için (sarma dahil) `bodiesMeshInFrame(rebuild gövdeleri, S.frame, err)` ile `modelMeshes`. Ağ tamponları worker'a **aktarılır** (`simulateAsync` yeni `ctl.transfer`; aktarılamazsa kopyalanır); kapı kararları ağın varlığına bakar (aktarılan tampon boşalır). İptal worker'da çalışır.
- `cam-ui.test.py` WP-22b bölümü (8 denetim): kapalıyken `sim_lateral_tol` var, seçenek açılır, sim tamamlanır ve `sim_lateral_tol`/`sim_failed`/`sim_no_model` yok, engeller aynı, ayrıntılı sim iptal edilir, kapatılır, sayfa hatası yok. Tarayıcı bölüm sayısı denetimi 3 → 4.
- `master` (WP-15) birleştirildi (çakışma yalnız `scripts/test-all.mjs` listesi). Birleşme sonrası: `wp22b` 54/0, `cam` 602/0, `sim` 138/0, `i18n` 52/0, `npx vite build` geçer, `cam-ui.test.py` 353/0.

## Doğrulama düzeltmesi (tek tur)
- Tri oyma üst sınırı: Z ışınında `[zb, flüt üstü]`, X/Y model süpürmesinde `rho(u)` flüt boyu üstünde 0. Flüt üstündeki model/stok teması sap/tutucu çarpmasıdır (bantlar).
- Boyunlu takım (sap < kesici, T-yuva) tri kipte: Z ışınında yalnız kesici dilimi kesilir/denetlenir (sütun sonsuz değil), flüt bandı yok, sap bandı `shaft_collision`; hızlıda zarf flüt üstünde 0. Yükseklik haritası kipi değişmedi (T-yuva orada temsil edilemez).
- Bant derinliği (`triBandHit`) = X ve Y eksenlerinin en büyük örtüşmelerinin küçüğü (hareket yönündeki ışın kirişi yanal girişi abartıyordu: 0,2 yerine 1,34).
- Sarma: model ışını stok kalkmış olsa da denetlenir; hızlıda modele giriş `rapid_in_stock` (engel), kesmede oyma; üst sınır flüt üstü.
- G87: [alt, cutTo] zaten sınırlı (değişmedi).
- Testler: `wp22b` 59/0 (+5: T-yuva plaka altında temiz, sap 0,2 mm sürtünme `shaft_collision` 0,2, normal takımda dikey oyma ≤ flüt, sarma hızlı modele giriş / temiz).
