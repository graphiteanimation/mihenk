# Mihenk CAD/CAM 0.3.0 — Özellik Envanteri (kod tabanlı denetim)

Tarih: 2026-11-12 · Kapsam: `/home/claude/repo` (src/, docs/, DESIGN.md, DEVAM.md, package.json). Kod DEĞİŞTİRİLMEDİ; testler bu denetimde KOŞULMADI (sayılar docs/DEVAM.md beyanıdır).
Durum: **VAR** = uygulanmış ve arayüze bağlı · **KISMI** = çekirdek var/arayüz yok/sınırlı/bilinen hata · **YOK** = kodda yok.
Doküman aşırı iddia edebilir; "Kanıt" sütunu koddur, doküman olduğunda "(doc)" yazılır.

## 0. ÖZET (10 satır)

1. **Çekirdek:** gerçek B-rep, OpenCascade (OCCT) — `replicad` 1.2.1 + `replicad-opencascadejs` WASM, Web Worker içinde (package.json; `src/kernel/worker.js:1-9`). Yüzler tam (analitik düzlem/silindir/çember + OCCT'nin ürettiği eğrisel yüzeyler); üçgenleme yalnız ekran ve STL çıktısı içindir.
2. **En güçlü alanlar:** (a) 2B eskiz (PlaneGCS çözücü, trim/offset/mirror/pattern/DXF, kararlı kimlik); (b) kalıcı topolojik adlandırma + "ya doğru sonuç ya açık hata" çekirdeği (geçerlilik kapısı, 1265 profil + 1282 model testi — doc); (c) CAM güvenlik kapıları + M80V post + geri okuyucu + yükseklik-haritası simülasyonu; (d) iki dilli (TR/EN), çevrimdışı, sertleştirilmiş Electron.
3. **Modelleme kapsamı dar:** extrude/revolve/delik/kutu-silindir-küre/yuvarlat(sabit R)/pah(simetrik)/kabuk/birleştir/taşı/desen(dikdörtgen+dairesel)/ayna. Sweep, loft, draft, rib, değişken fillet, yüzey, sac metal, montaj, konfigürasyon YOK.
4. **CAM yalnız 2.5 eksen:** Yüzey, Kontur, Cep, Delme/Kılavuz. Uyarlanır (adaptive), 3B yüzey, kalan malzeme, diş frezeleme, pah işlemi, kanal, 4 eksen sarma YOK ("yakında" düğmesi). 3+1 indeksleme çekirdekte ve setup panelinde var, A yönü tezgâhta doğrulanmadı.
5. **Veri alışverişi:** STEP/STL içe-dışa, DXF 2B içe-dışa, `.mhnk`. IGES, Parasolid, 3MF, DWG, PDF YOK. STL içe aktarma ≤ 50 000 üçgen ve yalnız kapalı kabuk.
6. **KRİTİK AÇIK 1 — 3B yüzey işleme (3B kaba + 3B bitirme + kalan malzeme) YOK:** alüminyum/çelik kalıp-form, cebe girmeyen eğrisel yüzey ve fillet'li yüzeyler CAM'e verilemez; yalnız eksene dik düzlem yüz/prizmatik silüet işlenir (`docs/CAM.md` §3; `src/ui/cam/index.js:127-129`).
7. **KRİTİK AÇIK 2 — Uyarlanır/yüksek hızlı kaba (adaptive/trochoidal) YOK:** çelikte tam genişlik cep kaba işleme takımı/tezgâhı zorlar; yalnız eşmerkezli ofset cep var.
8. **KRİTİK AÇIK 3 — 4. eksen iş akışı eksik:** sarma (wrap), eksen yüzden seçimi, çoklu indeks otomasyonu, A işaretli parça teyidi yok; V-01 (A işareti) düzeltildi ama tezgâhta TEYİTSİZ; NC kaydı gerçek Electron'da denenmedi (`DEVAM.md` 2026-11-12).
9. **KRİTİK AÇIK 4 — Kesme verisi hesaplayıcı, setup sheet, kalan malzeme, kontur helis rampası/predrill, delme `points`, açık zincir kontur arayüzü, pah/diş/kanal işlemi, takım yolu doğrulama (tutucu/fikstür modeli) yok;** simülasyon ana iş parçacığında, tek değerli yükseklik haritası (alt kesme modellenmez).
10. **Diğer kritik boşluklar:** teknik resim (sekme "yakında"), montaj/fikstür-mengene modeli, GD&T, eğrilik/açı analizi, sketch'te metin, post yalnız Fanuc-genel + M80V ve M80V'de çok alan `null` (kullanıcı doldurana kadar post durur), Windows'ta kurulum denenmedi, kod imzası/otomatik güncelleme yok. Üretime güven için gerekli 10 madde Bölüm 12'de.

---

## 0.1 Geometri çekirdeği teknolojisi (kesin)

| Soru | Cevap | Kanıt |
|---|---|---|
| Çekirdek ne? | **OpenCascade (OCCT) B-rep**, replicad sarmalayıcısı üzerinden WASM; OCCT sınıfları `R.getOC()` ile doğrudan da çağrılıyor (BRepAlgoAPI_Fuse/Cut/Common, BRepFilletAPI_MakeFillet/MakeChamfer, BRepOffsetAPI_MakeThickSolid, BRepPrimAPI_MakePrism/MakeRevol, BRepBuilderAPI_Sewing/Transform, ShapeUpgrade_UnifySameDomain, BRepCheck_Analyzer) | `package.json` (replicad, replicad-opencascadejs); `src/kernel/kernel.js:1-3,597`; `src/kernel/topo.js:95,130,200-256`; `docs/KERNEL-FIXES.md` §1 |
| Manifold / mesh-CSG var mı? | YOK. three.js yalnız görüntüleme | `package.json` bağımlılıkları: planegcs, replicad, opencascadejs, three |
| Yüzler tam mı, üçgen mi? | **Tam (B-rep)**. Düzlem (`PLANE`), silindir (`CYLINDRE`), çember/çizgi analitik; yuvarlat/kabuk/süpürme OCCT'nin ürettiği torus/BSpline vb. yüzeyler. Kenar/yüz seçimi, ölçü, hacim, kesit, CAM kesitleri B-rep üzerinden. Üçgenleme YALNIZ: ekran ağı, STL çıktısı, CAM yükseklik haritası (z-buffer), `camSection` içindeki çizgi/yay dışı kenarların kirişe bölünmesi | `kernel.js:665-681` (`meshBody`); `kernel.js:585` (STL); `docs/CAM.md` §1 `camFaceLoops` ("çizgi/yay olmayan kenarlar ≤ 0,005 mm kirişe bölünür") |
| Eskizde eğriler | Çizgi/yay/daire tam; **elips ve elips yayı tam** (`R.makeEllipse/makeEllipseArc`); **spline = interpolasyonlu BSpline** (`GeomAPI_Interpolate`, fit-nokta tipi). Ancak alan/bölge bulma (`findRegions`) spline'ı çokgenle örnekler | `src/kernel/sketch.js:139-169`; `docs/SKETCH.md` "Bilinen sınırlar" |
| Ekran ağı toleransı | `tol = max(0,005 mm, bbox köşegeni/2000)`, açısal 0,25 rad | `kernel.js:666-668` |
| STL dışa aktarma toleransı | doğrusal 0,01 mm, açısal 0,1 rad, ikili | `kernel.js:585` |
| Boyut/hassasiyet sınırları | Ölçü 1e-3…1e5 mm; koordinat ≤ 1e5; desen ≤ 2000 örnek; STL ≤ 50 000 üçgen; dosya ≤ 200 MB; hacim etki toleransı 1e-9 (göreli); ofset/SimplifyResult 1e-3; STL dikiş (Sewing) 1e-6; kesişim kenar eşiği 1e-4 mm | `kernel.js:14,603`; `src/shared/schema.js:7-12`; `topo.js:95,130`; `kernel.js:643` |
| OCCT'nin kendi Precision::Confusion (≈1e-7) değeri | Uygulamada ayrıca ayarlanmıyor; OCCT varsayılanı geçerli (kodda ayar araması boş) | `grep` sonucu: `Precision`/`SetTolerance` çağrısı yok |
| Geçerlilik güvencesi | Her özellikten sonra kapı: `BRepCheck_Analyzer` + katı var + serbest yüz yok + sonlu bbox + hacim>0 → `geom.invalid`; kesme/birleştirme hacim değişmediyse `op.no_effect`; boş kesişim hata | `kernel.js` rebuild (`geom.invalid`); `topo.js:236-247` |
| Parametrik geçmiş | Özellik listesi (tarif) her değişimde baştan/önbellekli yeniden hesaplanır; özellik anahtarı + parametre özeti önbelleği | `kernel.js:rebuild` (`cache`, `featKey`) |
| Kalıcı adlandırma | Köken tabanlı yüz/kenar adları, OCCT `Modified/Generated/IsDeleted` geçmişi ile; belirsizse `ref.lost_*`/`ref.ambiguous_*`; sessiz yanlış yok hedefi | `src/kernel/naming.js`; `docs/KERNEL-FIXES.md` §1 (F-01) |
| Bellek | WASM nesne sonlandırma `FinalizationRegistry`; +40 MB/150 tur ısınma (kararlı durumda sızıntı yok — doc) | `topo.js:fin`; `DEVAM.md` "Açık: bellek ısınması" |

**3B doğruluk sonucu:** Modelleme doğruluğu OCCT sınıfı, endüstriyel B-rep (Fusion'ın Autodesk ShapeManager'ı / NX'in Parasolid'ine göre daha az olgun ama aynı sınıf: sınır gösterimli, yüz-kenar topolojili, analitik/NURBS). Kaybolan doğruluk yalnız (1) tüm CAM yükseklik-haritası simülasyonu (≥ 0,5 mm hücre, yaklaşık), (2) CAM'de eğrisel kenarların ≤ 0,005 mm kirişlenmesi, (3) STL içe aktarılan gövdelerin üçgenli katı olması (analitik yüz yok).

---

## 1. Eskiz çizim araçları

| Özellik | Durum | Kanıt | Not |
|---|---|---|---|
| Çizgi (zincir, kapanış, Esc/çift tık/sağ tık biter) | VAR | `src/ui/sketcher.js:455-470`; `docs/SKETCH.md` Komutlar | zincirde A = teğet yay |
| Dikdörtgen (2 köşe) | VAR | `sketcher.js:501` | 4 çizgi + H/V kısıt |
| Dikdörtgen merkezden | VAR | `src/ui/sketch/tools.js:60-71` (`rectc`) | köşegen + orta nokta kısıtı |
| Dikdörtgen 3 nokta (döndürülmüş) | VAR | `tools.js:72-85` (`rect3`) | dik kısıtlar |
| Daire merkez-yarıçap | VAR | `chrome.js` SK_DRAW | |
| Daire 2 nokta / 3 nokta | VAR | `tools.js:86-107` | 3 nokta: pointOn kısıtları |
| Yay merkez-başlangıç-bitiş | VAR | `chrome.js` SK_DRAW | CCW |
| Yay 3 nokta | VAR | `tools.js:108-125` | |
| Yay teğet (mevcut uca) | VAR | `tools.js:126-139` | tek kullanıcılı uç gerekir |
| Çokgen (iç/dış teğet, N kenar) | VAR | `tools.js:140-150` | kenar sayısı sağ panelde |
| Kanal (slot, düz, iki merkez + genişlik) | VAR | `tools.js:151-168` | **yay kanal / eğri kanal YOK** |
| Elips | VAR | `tools.js:169-183` | tam elips; teğet kısıtı yalnız çizgi-elips çözücüde, UI'da uyarı |
| Elips yayı | KISMI | `solver.js` `ellarc`; DXF içe aktarımdan geliyor | doğrudan çizim aracı listesinde ayrı yok (araç listesi: `tools.js:183`) |
| Spline (fit-nokta, kapatılabilir) | VAR | `sketcher.js` `_splineClick/_finishSpline`; `kernel/sketch.js:156-169` | **kontrol-noktalı (CV) spline YOK**; spline teğet/eğrilik kısıtı YOK |
| Nokta | VAR | SK_DRAW_MORE | delik konumu için |
| Metin (sketch text) | YOK | araç listesinde yok | emboss/gravür metin yok |
| Konik (conic) eğri | YOK | | elips var, parabol/hiperbol yok |
| Yapı (construction) geometrisi | VAR | `c-construct` komutu; `ent.cons` | profile girmez; DXF'e verilmez |
| Merkez çizgi / eksen çizgisi türü | KISMI | yapı çizgisi ile yapılır; revolve ekseni sketch çizgisi seçilebilir | ayrı tür yok |
| Bağlı kapalı profil bölge dolgusu | VAR | `src/shared/profiles.js` `findRegions` | kesişim/T-kavşak denetimi |
| Fillet/chamfer köşe araçları | Bölüm 2 | | |

## 2. Eskiz düzenleme

| Özellik | Durum | Kanıt | Not |
|---|---|---|---|
| Budama (trim, sürükleyerek çoklu) | VAR | `src/ui/sketch/trim.js:37` `trimAt`, `:204` `trimSpan` | kaldırılan kısıt sayısı bildirilir; K-018 senaryosu testli (doc) |
| Uzat (extend) | VAR | `trim.js:119` | en yakın kesişime |
| Böl (break) | VAR | `trim.js:159` | |
| Ofset (zincir, ifade mesafe, kaynağa bağlı) | VAR | `src/ui/sketch/ops.js:45` `offsetEnts` | `join='sharp'` seçenekli |
| Köşe yuvarlat (sketch fillet) | VAR | `ops.js:109` `cornerAt` | yarıçap ölçü kısıtı eklenir |
| Pah (sketch chamfer) | KISMI | `ops.js:109` | **ölçü kısıtı eklemez** (doc SKETCH.md) |
| Ayna (simetri kısıtlı) | VAR | `ops.js:148` | |
| Dikdörtgen desen / dairesel desen (bağlı/bağımsız) | VAR | `ops.js:166,188` | bağlı dairesel ≈120 nokta sınırı |
| Taşı / Kopyala / Döndür / Ölçekle | VAR | `ops.js:213` `transformEnts` | ağırlıkla sayısal giriş (taşı/kopyala iki tıklama da) |
| Kes/Kopyala/Yapıştır panosu | VAR | `ops.js:272,280` | |
| İzdüşüm (gövde kenarı → sabit yapı) | KISMI | `ops.js:243` `projectPolylines`, `edit.js:279-300` | eş düzlemli/tümü/seçili; **yüze tıklayarak seçim YOK**; kenarlar polilin tolerans 2e-3 |
| Kesişim eğrisi (intersect curve / yüzey kesiti) | YOK | | |
| Dahil et (include 3B geometri, ilişkisel) | YOK | izdüşüm sabit/ilişkisiz | |
| Kutu seçim (soldan sağa içeren / sağdan sola değen) | VAR | `ops.js:299` `boxSelect` | |
| Tümünü seç | VAR | `edit.js:51` | |
| DXF içe aktarma | VAR | `src/shared/dxf.js` (LINE, POINT, CIRCLE, ARC, LWPOLYLINE/POLYLINE+bulge, ELLIPSE, SPLINE); `app.js:627-634` birim penceresi | `$INSUNITS` okunur, katman yok sayılır; 3D/BLOCK/INSERT/TEXT/DIMENSION desteklenmez |
| DXF dışa aktarma (R12 ve 2000) | VAR | `dxf.js`; `chrome.js:57-58` | **Electron içinde kayıt doğrulanmadı** (doc SKETCH.md); main.cjs `KINDS.dxf` mevcut |
| Eskiz içi geri al/yinele | VAR | `sketcher.js:190-240` | anlık görüntü yığını |
| Sağ tık bağlam menüsü | VAR | `edit.js:371` | |

## 3. Yakalama / çıkarım (snapping)

| Özellik | Durum | Kanıt | Not |
|---|---|---|---|
| Uç nokta / mevcut nokta | VAR | `src/ui/sketch/snap.js:15-18` | kimlik paylaşılır (coincident) |
| Merkez | VAR | `snap.js:18` (`center`) | daire/yay/elips merkezi |
| Orijin | VAR | `SNAP_LABEL.origin` | |
| Orta nokta | VAR | `snap.js` §4 | çizgi ve yay |
| Çeyrek nokta (quadrant) | YOK | `snap.js` tamamı | |
| Kesişim | VAR | `snap.js` §2 | çizgi/yay/daire çiftleri |
| Teğet (çizilen çizgi başlangıcından) | VAR | `snap.js` §3 | `tangentPoints`; kısıt otomatik eklenir (`sketcher.js:469`) |
| Dik (perpendicular) | VAR | `snap.js` §3 | yalnız çizgiye; otomatik dik kısıtı |
| En yakın / nesne üstü | VAR | `snap.js` §5 | pointOn kısıtı eklenir |
| Izgara | VAR | `snap.js:48` (1 mm tam sayı; Ctrl ile kapalı) | **ızgara aralığı ayarı YOK**, sabit 1 mm |
| Yatay/dikey çıkarım | VAR | `sketcher.js` `_alignEnd`, `:468` | otomatik H/V kısıt (~±3°, DESIGN.md "Sketch ortamı") |
| Hizalama izleme çizgileri (alignment/tracking, polar) | YOK | | uç noktalardan hizalama kılavuzu yok |
| Nesne yakalama aç/kapa kutuları, yakalama filtresi | YOK | | yalnız Ctrl ile tümünü kapatma |
| Otomatik kısıtlar (çizim sırasında) | KISMI | H/V, teğet, dik, coincident, pointOn, dikdörtgen kısıtları | genel "eşit/paralel çıkarımı" yok |
| Yakalama ipucu etiketi | VAR | `sketcher.js:921` | |

## 4. Kısıtlar ve ölçüler

| Özellik | Durum | Kanıt | Not |
|---|---|---|---|
| Çözücü | VAR | PlaneGCS (FreeCAD) WASM, `src/ui/solver.js` | ana iş parçacığında; sürükleme çözümü (`drag`) |
| Yatay, Dikey (çizgi veya 2 nokta) | VAR | `solver.js` buildPrims | |
| Çakışık (nokta-nokta) | VAR | `p2p_coincident` | |
| Paralel, Dik | VAR | | |
| Aynı doğru (collinear) | VAR | `solver.js` `collinear` | |
| Eşit (çizgi/daire/yay/elips) | VAR | | |
| Teğet (çizgi-daire/yay/elips, daire-daire, yay-yay, daire-yay) | VAR | | **spline teğeti ve elips-daire teğeti YOK** |
| Nokta üstünde (çizgi/daire/yay/elips) | VAR | `pointOn` | spline üzerinde YOK |
| Orta nokta | VAR | `midpoint` | |
| Simetri | VAR | `symmetric` | |
| Eş merkezli | VAR | `concentric` (çekirdek: merkez noktaları birleştirir) | |
| Sabit (fix) | VAR | `fix` | orijin sabit |
| Mesafe (nokta-nokta), yatay/dikey mesafe | VAR | `dist/hdist/vdist` | |
| Nokta-çizgi mesafesi; çizgi-çizgi mesafesi; daire merkezleri arası | VAR | `pldist/lldist/ccdist` | |
| Açı (iki çizgi) | VAR | `angle` | derece |
| Yarıçap / Çap | VAR | `radius/diameter` | |
| Yarıçap farkı (ofset yay) | VAR | `radiusdiff` | |
| Sürücü ölçü / Referans (driven) ölçü | VAR | `solver.js` `c.ref` atlanır; `edit.js:398` `toggleReference` | parantezli gösterim |
| Ölçü ifadesi / parametre | VAR | `src/shared/expr.js` | + − * / ^ ( ) sin cos tan sqrt abs min max round floor ceil asin acos atan pi |
| Kullanıcı parametreleri (tablo: ad, ifade, not) | VAR | `app.js` openParams; `kernel.js` `resolveParams` | birimsiz (mm/derece sabit); **birim ifadesi ("10 in") YOK**; **eskiz-dışı özellikte de kullanılır** |
| Parametre değişince eskizler yeniden çözülür | VAR | DESIGN.md (doc) | |
| Serbestlik derecesi (DOF) gösterimi | VAR | durum çubuğu "Serbestlik derecesi: N / Tam tanımlı"; nesne başına DOF (`SKETCH.md`) | renk: tam tanımlı koyu / serbest mavi |
| Çelişen/fazla kısıt listesi | VAR | `solveSketch` → `{conflicting, redundant}`; panelde listelenir, tıkla vurgula | |
| Aşırı kısıtlama davranışı | VAR | çözüm `ok` değilse değişiklik geri alınır, neden yazılır (DESIGN.md) | **sürüklemeyi sınırlayan "kısıt ihlal et" modu YOK** |
| Ölçü etiketi sürükleme | VAR | `SKETCH.md` Kısıtlar | |
| Kısıt gösterme/gizleme, silme | VAR | `edit.js:393` `showConstraintsOfSelection`; panel listesi | global "kısıtları gizle" düğmesi ayrı kontrol edilmedi |
| Denklem/e-tablo bağı (spreadsheet) | YOK | | |
| Eskizler arası ilişkisel referans | KISMI | yalnız gövde kenarı izdüşümü (sabit, ilişkisiz) | |

## 5. Çizim yardımcıları ve görünüm

| Özellik | Durum | Kanıt | Not |
|---|---|---|---|
| Izgara görüntüsü | VAR | `viewport.js:65` GridHelper 400 mm / 40 bölme | sabit |
| Ortho / polar kilit | KISMI | H/V çıkarım (±3° otomatik); ortho kilit tuşu YOK | |
| Çizim sırasında sayısal giriş | VAR | `edit.js:302-363` `_numericStart`; `SKETCH.md` | uzunluk/açı, en/boy, yarıçap; Tab alan değiştirir; ilgili ölçü kısıtı eklenir |
| Koordinat girişi (mutlak X,Y yazma) | KISMI | boyut kutuları var; "x,y" mutlak/bağıl nokta yazma yok | |
| Birimler | KISMI | mm + derece sabit; DXF içe aktarımda birim ölçeği (mm/cm/m/inch/foot) | **inç gösterimi/ayarı YOK** |
| Geri al / yinele (model) | VAR | `app.js:175-214` | 50 adım, belge anlık görüntüsü; Ctrl+Z/Y |
| Seçim filtresi (yüz/kenar/gövde) | KISMI | `viewport.js:181` `setFilter` | komuta bağlı; kullanıcı seçimli filtre çubuğu YOK |
| 3B kutu seçim | YOK | `viewport.js` aranmış, yok | |
| Ölç (iki eleman: mesafe, açı, merkez farkı) | VAR | `kernel.js:545` `measure`; `panels.js:430-455` | yüz-yüz dihedral açı F-23 düzeltildi; **nokta seçerek ölçme / çok-eleman zincir ölçüm YOK** |
| Kesit görünümü | KISMI | `panels.js:351-371` `setSection`, `viewport.js:147` | tek eksen düzlemi + konum + ters çevirme; **eğik düzlem, kesit gövde oluşturma, kesit analizi (alan/eylemsizlik) YOK** |
| Görünüm küpü | VAR | `chrome.js` renderViewBtns (Üst/Ön/Sağ yüzler) | arka/alt/sol yüzler tıklanabilir değil |
| Hazır görünümler (Ön, Üst, Sağ, İzometrik, Sığdır) | VAR | `chrome.js:62-66` | |
| Adlandırılmış görünüm (named views) | YOK | | |
| Görüntü modları (tel kafes, gölgeli+kenar, saydam) | YOK | `viewport.js` tek malzeme | |
| Gizle/göster (gövde, eskiz, orijin düzlemleri) | VAR | tarayıcı göz simgeleri | |
| Komut arama paleti (Ctrl+K) | VAR | `chrome.js` | |
| Açık/koyu tema, yoğunluk | VAR | `src/ui/prefs.js` | |
| Yardım/kılavuz | VAR | docs/KILAVUZ.md (TR), MANUAL.md (EN), uygulama içi kısayollar | |

## 6. 3B özellikler

| Özellik | Durum | Kanıt | Not |
|---|---|---|---|
| Extrude — mesafe, tek/simetrik/iki yön, ters | VAR | `kernel.js:156-180` | iki yönlü: farklı mesafe (dist2) |
| Extrude — Yeni gövde / Birleştir / Kes / Kesişim | VAR | `kernel.js:94` `applyOp`; `features.js:OPS` | çoklu hedef gövde `targets` |
| Extrude — Tümü (through all) | VAR | `kernel.js:158` `bigLen` | |
| Extrude — yüze/nesneye kadar (to face/to object) | YOK | `extent: 'dist'|'all'` yalnız | |
| Extrude — konik (taper/draft açısı) | YOK | | |
| Extrude — ince cidar (thin/surface) | YOK | | |
| Extrude — profil seçimi (bölge tıklama, kararlı) | VAR | `kernel/sketch.js`; `profiles:[{ents,hint}]` | `profile.lost/ambiguous` açık hata |
| Revolve (açı, eksen: sketch X/Y/çizgi, Yeni/Ekle/Kes/Kesişim) | VAR | `kernel.js:181-205` | eksen profili kesiyorsa hata `revolve.crosses_axis` |
| Sweep (süpürme) | YOK | `kernel.js` runFeature case listesi | |
| Loft | YOK | | |
| Coil / helis | YOK | | |
| Emboss / emboss metin | YOK | | |
| Kabuk (shell, açık yüz seçimi, tek kalınlık) | VAR | `kernel.js:222`; `topo.js:125` | **dışa kabuk (negatif), değişken kalınlık YOK**; OCCT bazı geometride başarısız (`shell.failed`) |
| Yuvarlat (fillet) sabit yarıçap | VAR | `kernel.js:207`; `topo.js:104` | **değişken yarıçap, ayna fillet (setback), yüz fillet, kural fillet YOK**; teğet zincir otomatik seçimi kodda görülmedi (kenarlar `Ref` listesi olarak tek tek) |
| Pah (chamfer) eşit mesafe | KISMI | `kernel.js:207` | **iki mesafe / mesafe-açı YOK** |
| Draft (taper) | YOK | | |
| Delik özelliği — düz / silindirik havşa (cbore) / konik havşa (csink) | VAR | `kernel.js:313-364` | tip: uç açısı (118° vars.), bitiş: derinlik/tümü, ters |
| Delik — diş (tapped) | KISMI | `features.js:THREADS` M3–M24 kaba; `kernel.js:360` `thread` verisi saklanır | **diş geometrisi/kozmetik diş modellenmez**; matkap çapı = major−pitch; veri CAM `holes[]`'e gider; ince diş / inç dişleri / diş sınıfı YOK |
| Diş (thread) özelliği (modellenmiş helis) | YOK | | |
| Rib / web | YOK | | |
| Dikdörtgen desen (2 yön) | VAR | `kernel.js:381-420` | ≤ 2000 örnek; `pattern.no_effect` denetimi |
| Dairesel desen (eksen X/Y/Z + merkez + toplam açı) | VAR | `kernel.js` | **eksen yalnız ana eksen; rastgele eksen/kenar eksen YOK** |
| Yol (path) deseni | YOK | | |
| Ayna (mirror) gövde/özellik, ana düzlem + ofset | VAR | `kernel.js:381` | **yüz düzleminden ayna YOK** |
| Boolean — birleştir/kes/kesiştir (araç gövdeleri) | VAR | `kernel.js:264-278` | `keepTools`; tek BOP çağrısı |
| Gövde böl (split body) / yüz böl | YOK | | |
| Yüzü ofsetle / yüzü taşı / press-pull / direct edit | YOK | | `move` yalnız gövdeyi taşır |
| Taşı/Kopyala (gövde, öteleme + tek eksen dönüş) | VAR | `kernel.js:279-297` | dönüş ana eksen |
| Ölçekle (gövde) | YOK | | |
| Primitifler: kutu, silindir, küre | VAR | `kernel.js:239-263` | konik, simit, boru YOK |
| Çoklu gövde (multibody) | VAR | `state.bodies` Map; tarayıcıda listelenir | |
| Bileşenler / montaj / eklemler | YOK | `doc` tek parça modeli | fikstür/mengene modeli için montaj yok |
| Sac metal | YOK | | |
| Yüzey modelleme (yama, kırp, uzat, dikiş) | YOK | | |
| Geçmiş / zaman çizelgesi: düzenle, yeniden adlandır, bastır, sil, geri sar | VAR | `chrome.js` featureMenu; `kernel.js:rebuild` `rollback` | sürükle-bırak sıra değiştirme: kodda görülmedi |
| Bağımlı özellik koruma | VAR | `features.js:dependents` | silme uyarısı |
| Konfigürasyonlar / aileler / tasarım tabloları | YOK | | |
| Malzeme/görünüm ataması, yoğunluk | KISMI | özellik panelinde yoğunluk kutusu → kütle; gövde malzemesi kaydedilmez | `panels.js:457-466` |
| STEP içe aktarma → katı gövde | VAR | `kernel.js:623` `loadImport` | geçerlilik + ağ denetimi (F-18); montaj yapısı/renk/PMI yok, düz katılar |
| Bilinen çekirdek açıkları | — | `DEVAM.md`: F-15 (expr.js tek eksi önceliği, `;` dışı virgül, sonsuz değer, kullanıcı `pi`), F-26 (STL kiriş hatası); F-21 kısmen (param-sweep 3 ret) | F-04/F-16/F-24/F-25 profiles.js ile çözüldü |

## 7. Veri alışverişi

| Format | İçe | Dışa | Kanıt | Not |
|---|---|---|---|---|
| `.mhnk` (yerel, JSON, `{app, version, doc}`) | VAR | VAR | `schema.js`; `main.cjs:23` | şema doğrulama, atomik kayıt + `.bak`; eski `.acad` açılır |
| STEP (.step/.stp) | VAR | VAR | `kernel.js:623,584`; `chrome.js:53,55` | AP214/ham replicad; mm; dışa her gövde adlandırılmış; renk/katman/PMI yok |
| STL | VAR (≤ 50k üçgen, kapalı kabuk) | VAR (ikili) | `kernel.js:637-664,585` | içe aktarılan gövde üçgenli katıdır; F-26 açık |
| DXF 2B | VAR (eskiz) | VAR (R12/2000) | `dxf.js` | yalnız aktif eskiz; 3B DXF yok |
| IGES | YOK | YOK | | |
| Parasolid (.x_t/.x_b), ACIS (.sat), JT, SolidWorks, Inventor | YOK | YOK | | |
| 3MF / OBJ / AMF | YOK | YOK | | |
| DWG | YOK | YOK | | |
| PDF / SVG çıktı | YOK | YOK | | |
| NC (.nc/.txt) | — | VAR | `main.cjs:23,24` (`SAVE_ONLY`) | gerçek pencerede denenmedi |
| Takım kütüphanesi JSON | VAR | VAR | `tools.js` `importLibrary/exportLibrary`; kind `json` | |
| Son dosyalar, komut satırından dosya açma | VAR | — | `main.cjs` recent; `app.js:84` | |

## 8. İnceleme (inspection)

| Özellik | Durum | Kanıt | Not |
|---|---|---|---|
| Ölçüm: mesafe (min), merkez mesafesi, delta, açı (yüz-yüz, düzlemler) | VAR | `kernel.js:545-558` | yüz/kenar/gövde çiftleri |
| Kenar uzunluğu, yüz alanı, silindir yarıçapı/ekseni | VAR | `kernel.js:510-531` `describe` | |
| Kütle özellikleri: hacim, yüzey alanı, ağırlık merkezi, bbox, kütle (kullanıcı yoğunluğu) | VAR | `kernel.js:559`; `panels.js:457` | **atalet momenti / asal eksenler YOK** |
| Girişim (interference) — gövde çiftleri, ortak hacim | VAR | `kernel.js:564-575` | |
| Kesit analizi (alan, kesit özellikleri) | YOK | | yalnız görsel kesme düzlemi |
| Eğrilik analizi (zebra, eğrilik tarağı) | YOK | | |
| Draft (açı) analizi | YOK | | |
| Duvar kalınlığı analizi | YOK | | |
| Eksik yüz/kusur kontrolü | KISMI | her özellik sonrası `BRepCheck` kapısı | kullanıcıya ayrı komut yok |

## 9. Teknik resim / 2B pafta

| Özellik | Durum | Kanıt | Not |
|---|---|---|---|
| Çizim çalışma alanı | YOK | `chrome.js` renderTabs: "Teknik Resim" sekmesi `soon` (devre dışı) | O-018 sırasıyla sona bırakıldı |
| Görünüm üretimi, kesit/detay görünümü, ölçülendirme, tolerans, GD&T, başlık bloğu | YOK | | |
| PDF / DXF paftası çıktısı | YOK | | |
| Yüzey pürüzlülüğü, delik tablosu, balon, malzeme listesi | YOK | | |

## 10. CAM

### 10.1 Genel çerçeve

| Özellik | Durum | Kanıt | Not |
|---|---|---|---|
| Çalışma alanı sekmesi "İmalat" | VAR | `chrome.js:renderTabs`; `src/ui/cam/index.js:135-144` | |
| Setup / WCS | VAR | `src/cam/index.js` `resolveSetup`; `src/ui/cam/setup.js` | G54–G59, G54.1 Pn; eksenler ana ± X/Y/Z; orijin: stok köşesi / stok üst merkezi / model / nokta |
| Setup ekseninin yüzden seçimi | KISMI | çekirdek `kind:'face'` destekler (`CAM.md` §1); **arayüzde yok** | `DEVAM.md` açık |
| Stok tanımı: kutu+ofset, kutu (min/max), silindir | KISMI | `resolveSetup`; silindir yalnız kutu yaklaşımıyla simüle edilir | silindir stokta Yüzey işlemi hata (`cam.face.needs_box_stock`); **gövdeden stok (kalıp), döküm/forging stoğu YOK** |
| Kalan stok (önceki setup'tan) taşıma | YOK | | setup başına stok yeniden başlar |
| Makine profilleri | VAR | `src/cam/machines/builtin.js`; `src/ui/cam/machines.js` | yerleşik: Neway VM1160H/M80V/GSA A, genel 3 eksen Fanuc; kullanıcı kopyası/düzenleme; uygulama ayarında saklanır (`CAM-DESIGN.md`), belge yalnız `machineId` taşır |
| Neway şablonu doluluğu | KISMI | `builtin.js:12-36` | X/Y/Z kurs (1000/600/600) dolu; **maxRpm, minRpm, ilerleme sınırları, safeRetract, dwell adres/birim, g541Range, rigidTapM `null`** → NC üretimi kapı 1 ile engellenir |
| Korunan (dokunulmaz) T/H/D/WCS listesi | VAR | `builtin.js:25-27`; kapı 2 | T1/T3/T12, H1/H3/H12, D1/D3/D12, G54/G56 ön dolu (makine projesinden teyit bekliyor) |
| Takım kütüphanesi alanları | VAR | `src/cam/tools.js:1-60` | tür (düz, küre, köşe R'li, matkap, punta, kılavuz, pah, yüz frezesi, rayba, bora), çap, köşe R, uç açısı, kesici boy, gövde boyu, şaft çapı, diş sayısı, merkez kesme, adım (kılavuz), tutucu {çap, boy}, malzeme, not, maxRampAngle, T/H/D, ön ayarlar (rpm, kesme/dalma/rampa ilerlemesi, stepdown, stepover, soğutma) |
| Takım kütüphanesi JSON içe/dışa | VAR | `tools.js` `LIB_FORMAT='mihenk-tool-library'` | |
| Takım tutucu/şaft geometrisi | KISMI | yalnız silindir (çap, boy) | konik/gerçek tutucu kütüphanesi YOK |
| Kesme verisi hesaplayıcı (Vc, fz, ae/ap) / malzeme veri tabanı | YOK | arama: chipload/sfm/vc yok | ön ayarlar elle girilir |
| Setup sheet / takım listesi çıktısı | KISMI | NC başlığında takım listesi + kapı özeti (`POST.md` çıktı yapısı); **HTML/PDF setup sheet YOK** | |
| Bağlama/fikstür/mengene modeli | YOK | | çarpışma denetimi stok+tutucu+şaft, fikstür yok |

### 10.2 İşlem türleri

| İşlem | Durum | Kanıt | Not |
|---|---|---|---|
| Yüzey frezeleme (facing) | VAR | `src/cam/ops/face.js`; `oppanel.js` | zikzak, stepover < çap, extend; başlangıçtan stok kenarına; açı |
| 2B kontur (dış/iç/üzerinde) | VAR | `ops/contour.js` | tırmanma/geleneksel, çok derinlik (stepdown), kaba yanal paso (`roughPasses`), yay/çizgi giriş-çıkış, köprü (tabs), wear/computer telafisi (G41/G42), rampa (plunge/ramp) |
| Kontur — helis rampa | YOK | `CAM.md` §1: `ramp.kind:'helix'` → `cam.op.unsupported` | |
| Kontur — açık zincir | KISMI | çekirdek `{kind:'chain'}`; yalnız `side:'on'` ve giriş/çıkış/köprü/wear yok; **arayüzde yok** | |
| Kontur — silüet (gövde dış sınırı) | KISMI | `resolveGeom` `kind:'silhouette'` | yalnız prizmatik gövde; alt kesme/eğik duvar `cam.silhouette.not_prismatic` |
| Cep (pocket): eşmerkezli ofset, ada destekli, helis/rampa/dalma giriş, bitirme paso | VAR | `ops/pocket.js` | bitirme için `finishStock` zorunlu; `predrill` YOK; bir işlemde tüm taban yüzleri aynı z |
| Uyarlanır (adaptive/volumill/trochoidal) kaba | YOK | `ui/cam/index.js:127` "soon" | |
| Kanal (slot) frezeleme | YOK | | cep/kontur ile dolaylı |
| Pah işlemi (chamfer mill) | YOK | `TOOL_KINDS.contour` = düz/bullnose/küre (`oppanel.js:13`) | pah takımı yalnız `spot` çevriminde |
| Diş frezeleme (thread mill) | YOK | | |
| Delme: delme (G81/G82), gagalamalı (G83), talaş kırma (G73), punta (spot), kılavuz (G84/G74), rayba (G85), bore (G89) | VAR | `ops/drill.js:9` `CYCLE_TOOLS`; `POST.md` çevrim eşleşmesi | delikler modelden `holes[]`; çap/özellik süzgeci; sıra: asis/en kısa; uç telafisi; G76 (ince bore) YOK |
| Delme — nokta listesi / eskiz noktaları | KISMI | çekirdek `holes.kind:'points'`; **arayüzde yok** | |
| Kılavuz (tapping) | VAR | `drill.js:72-90`; `tapMode:'pitch'` M80V | F = adım (senkron, #8159=1 — doc); kılavuz takım adımı gerekir |
| 3B kaba (adaptive/pocket clearing 3D) | YOK | | |
| 3B bitirme (scallop, paralel, kontur-z, kalem, radyal, spiral) | YOK | `ribbon: cam-op-surface` "soon" | |
| Kalan malzeme (rest machining) | YOK | yalnız kalan alan tahmin uyarısı (cep) | |
| Z-seviye / su hattı | YOK | `camZLevels` sadece prizmatik tespiti | |
| 3+1 indeksleme (A açısı ile setup) | KISMI | `resolveSetup` `rotary`; `setup.js:101-105`; post: Z geri çek → M11 → G0 A → M10 | V-01 (A işareti) düzeltildi (doc); V-02 (ilk bölümde A) belge durumu — `CAM-FIXES`'e bak; **A yönü, N/O sınırları tezgâhta teyitsiz** |
| 4 eksen sarma (wrapping) / sürekli 4. eksen | YOK | | |
| 5 eksen | YOK | "yakında" | |
| Torna / mill-turn | YOK | | |
| Prob (probing) çevrimleri | YOK | | |

### 10.3 Bağlama, hesaplama, doğrulama

| Özellik | Durum | Kanıt | Not |
|---|---|---|---|
| Giriş/çıkış: yay/çizgi/yok (kontur) | VAR | `contour.js`; `oppanel.js:260-264` | 90° yay, yarıçap kuralı denetimi |
| Rampa (açılı) / helis (cep) / dalma | VAR | `pocket.js`, `contour.js` | helis: `helixDia`, `angle` zorunlu |
| Geri çekme/güvenli yükseklik (clearance/retract/top/bottom) | VAR | `ops/common.js`; `CAM.md` §1 | yatay hızlı yalnız retract/clearance'ta; uzak geçiş eşiği sabit |
| Koruyucu "stok içinde yatay hızlı yok" kuralı | VAR | `CAM.md` §2 Bağlama | |
| Takım telafisi: bilgisayar / wear (G41/G42, D) | VAR | `contour.js`; `reader.js` | wear'de kaba paso/rampa/bölünme desteklenmez (hata) |
| Köprü/tab | VAR | `contour.js:209` (V-09 sonrası) | |
| Yol hesabı, durum rozetleri ("Eski"), hata listesi | VAR | `src/ui/cam/ops.js`; `CAM-UI.md` | |
| Simülasyon: stok yükseklik haritası (dexel tek değerli), hızlı hareketin stok içine girmesi, oyma (gouge), kesici boyu aşımı, şaft/tutucu çarpışması, taban altı | VAR | `src/cam/sim/index.js:1-60`; `gates.js` kapı 5 | ana iş parçacığında; çözünürlük ≥ 0,5 mm / ≤ ~400 bin hücre; **alt kesme, ters yüz, fikstür, silindir stok (kutuya yaklaşık) modellenmez** |
| Simülasyon 3B oynatma, takım ve stok görüntüsü, hız ×1/5/25/100/500 | VAR | `simbar.js`, `view.js` | stok ağı yalnız üst yüzey (yan duvar yok) |
| Sim bilinen açıklar | KISMI | V-24 (hücre yarısından küçük yan oyma görünmez), V-28 (yüksek yana kaymada cep köşe artığı), V-11/V-13 düzeltildi (doc) | |
| Model oyma denetimi için model yükseklik haritası | VAR | `kernel/cam.js` `camHeightmap` | V-06 düzeltildi (model haritası yokken oyma denetimi uyarısı — doc) |
| Güvenlik kapıları (1 eksik veri, 2 korunan numara, 3 kurs/devir/ilerleme, 4 düz dalma/kesici boyu, 5 simülasyon, 6 döner eksen) | VAR | `src/cam/gates.js`; `CAM-DESIGN.md` Kapılar | `block` varken NC üretilmez; kapı 3'te mutlak kurs denetimi `setup.machinePos` olmadan yapılamaz (uyarı) |
| Post işlemciler | KISMI | `src/cam/post/registry.js:14-15` | **yalnız `fanuc-generic` ve `mitsubishi-m80v`**; Siemens/Heidenhain/Haas/Okuma/Mazak YOK; kullanıcı post betiği yükleme YOK (karar) |
| M80V postu | KISMI | `mitsubishi-m80v.js`; `POST.md` | G84 senkron F=adım, G54.1 Pn, A kısa yol, M10/M11 isteğe bağlı; çok alan `null` → post durur; G05 P10000 seçenek; **tezgâhta DOĞRULANMADI** (başlık "UNVERIFIED POST - DOGRULANMADI") |
| NC geri okuyucu (back-reader) | VAR | `src/cam/post/reader.js` | IR→post→reader→IR' karşılaştırması testlidir; yalnız motorun lehçesini okur |
| NC önizleme, satır↔hareket eşleme, kaydet | VAR | `postui.js`; `main.cjs` kind `nc` | gerçek Electron'da denenmedi |
| Doğrulama beyanı (kullanıcı imzası) | VAR | `postui.js`; `doc.cam.verified` (`sig` ile belge değişince düşer) | rozet kalıcı |
| Program numarası O8000/9000 koruması | KISMI | V-21 kısmen (makine parametresine bağlı, ertelendi) | |
| Açık CAM bulguları | — | CAM-FIXES: V-21 (kısmen), V-24, V-28, V-29 (ters kesme yönü, incelenmedi) ertelendi; CAM-UI-FIXES: U-10 ikinci kısım, U-09/11/12 yeniden üretilemedi | |
| Besleme/devir hesaplayıcı, malzeme kütüphanesi | YOK | | |
| Yüzey tolerans / kesme süresi tahmini | KISMI | `stats.timeMin` (IR istatistiği) | |
| Takım yolu geçmişi/kaynak parçaya ilişkilendirme (assoc.) | KISMI | işlem önbelleği model/eskiz özetine bağlı, "Eski" rozeti | yeniden hesap elle |

## 11. Platform

| Özellik | Durum | Kanıt | Not |
|---|---|---|---|
| Uygulama kabuğu | VAR | Electron 45 + Vite 8, ES modül, framework yok (`package.json`) | |
| İşletim sistemi hedefi | KISMI | `electron-builder --win dir` + NSIS kurulum betikleri | **Windows'ta DENENMEDİ** (`DEVAM.md`); Linux/macOS paketi yok |
| Dil | VAR | TR/EN; `src/i18n/*.js` (556+ anahtar → büyük sözlükler; `test/i18n.test.mjs`) | çalışma anında geçiş |
| Otomatik kurtarma | VAR | `main.cjs:114-116,249-256` (`userData/recovery/autosave.mhnk`, 60 sn); `app.js:654-672` | tarayıcıda IndexedDB |
| Atomik kayıt + .bak | VAR | `electron/safe-write.cjs` | |
| Geri al | VAR | 50 adım | `app.js:175` |
| Hesap iptali | VAR | `app.js:111` cancelCompute | test eksik (doc) |
| Performans sınırları | KISMI | `kernel.js:14`; desen 2000; belge 5000 özellik; eskiz öğe 50 000; dosya 200 MB; STL 50k üçgen | gerçek parça ölçümleri `test/models/perf.mjs`; simülasyon ana iş parçacığı |
| Güvenlik | VAR | sandbox, CSP, `webRequest` ile ağ engeli, Electron fuses, IPC sertleştirme (`main.cjs:175-191`, `electron/csp.cjs`) | `SECURITY-AUDIT.md`, `SECURITY-FIXES.md` |
| Çevrimdışı çalışma | VAR | ağ kapalı rozeti | bulut/ortak çalışma YOK |
| Lisanslama | YOK | lisans anahtarı/etkinleştirme kodu yok; paket `ISC`; OCCT LGPL, PlaneGCS (LGPL/MIT), three.js MIT notu "Hakkında" | |
| Güncelleme | YOK | otomatik güncelleme yok, ağ kapalı; elle kurulum + SHA-256 | |
| Çökme yönetimi | KISMI | `render-process-gone`/`unresponsive` işleyicisi yok (grep boş); bunun yerine otomatik kurtarma + kapanış onayı (`native.close_msg`) | worker hatası `rebuild_failed` bildirimi |
| Eklenti/makro/betik API | YOK | | |
| Çoklu belge / sekmeler | YOK | tek belge | |
| Yazdırma | YOK | | |
| Test paketi | VAR | `npm run test:all` 19 adım (DEVAM.md: tek seferde geçti, 11 dk 22 sn); kernel 104, solver 16, geom2d 128, profiles 1265, sketchops 94, dxf 40, stability 29, cam 166, post 170, sim 61 | bu denetimde yeniden koşulmadı |

---

## 12. Alüminyum/çelik 3 eksen VMC (Neway VM1160H / M80V + 4. eksen indeksleyici) için en kritik 10 boşluk

| # | Boşluk | Etki | Kanıt |
|---|---|---|---|
| 1 | 3B yüzey işleme (3B kaba, 3B bitirme, kalan malzeme) YOK | Eğrisel yüzey/kalıp/forma işi CAM'e girmez; yalnız prizmatik 2.5D | `ui/cam/index.js:127-129`; `CAM.md` §3 |
| 2 | Uyarlanır/trokoidal kaba YOK | Çelikte takım ömrü, alüminyumda süre; yalnız eşmerkezli ofset cep | aynı |
| 3 | Kesme verisi hesaplayıcı + malzeme/takım ön ayar kütüphanesi YOK | Devir/ilerleme elle ve tezgâh sınırları `null` iken NC zaten üretilmez | `tools.js`; `builtin.js:25-27` |
| 4 | M80V postu tezgâhta doğrulanmadı + Neway şablonunda `maxRpm`, ilerleme sınırı, dwell adresi, güvenli çekilme vb. `null` | Her çalıştırmadan önce elle doldurma + dikkatli ilk parça; "UNVERIFIED" başlığı | `POST.md` §3; `DEVAM.md` |
| 5 | 4. eksen: sarma YOK, eksen yüzden seçilemiyor, A yönü teyitsiz, indeks işlemleri arayüzde sınanmadı | Indekslemeli çok yüz iş akışı güvenilir değil | `DEVAM.md` açıklar; V-01/V-02 |
| 6 | Pah, diş frezeleme, kanal, kalan malzeme, kontur helis rampası/predrill, delme `points`, açık kontur arayüzü YOK | Günlük atölye işlerinde elle çözüm | `CAM.md` §3; `CAM-UI.md` Kalan |
| 7 | Fikstür/mengene/tezgâh gövde modeli yok; simülasyon tek yükseklik haritası (alt kesme yok), ana iş parçacığında | Çarpışma güvencesi yalnız stok+tutucu+şaft; mengene çenesi çarpışması görülmez | `sim/index.js:1-5`; `CAM-UI.md` |
| 8 | Modelleme eksikleri: yüze-kadar extrude, konik/draft, sweep, loft, rib, değişken fillet, split, press-pull, ölçekle, ince cidar | Kullanıcı kendi parçasını modelleyemez; STEP içe aktarıp CAM'e verebilir (STEP katı gövde VAR) | `kernel.js:runFeature` |
| 9 | Teknik resim/ölçü paftası, GD&T, setup sheet (PDF) YOK | Tezgâh başına belge üretilemez | `chrome.js` sekme `soon` |
| 10 | Windows kurulumu ve gerçek Electron'da NC kaydı denenmedi; imza/güncelleme yok | Dağıtım riski | `DEVAM.md` 2026-11-12 |

## 13. Notlar (belge ↔ kod farkları)

- `DESIGN.md` başlığı hâlâ "AtolyeCAD" ve `.acad` anlatır; güncel ad Mihenk, uzantı `.mhnk`. Birkaç kod parçası da `atolyecad-recovery` IndexedDB adını (tarayıcı kipinde) korur (`recovery.js:3`).
- `DESIGN.md` Extrude "Tümü" ve "Kes" varsayılanları anlatır; "yüze kadar" bahsi yok → kodla uyumlu.
- Test sayıları (cam 166, post 170, sim 61, kernel 104, profiles 1265, test/models 1282/1282) belge beyanıdır; bu denetimde koşulmadı.
- Hafıza/ek bilgi: `docs/KERNEL-TEST-REPORT.md` 8 Kritik/3 Yüksek bulgu raporlamış; `KERNEL-FIXES.md` büyük çoğunluğu "Düzeldi" gösteriyor (F-15, F-26 açık, F-21 kısmen).
