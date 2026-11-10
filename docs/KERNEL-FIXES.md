# AtolyeCAD çekirdek düzeltmeleri (KERNEL-TEST-REPORT F-01…F-26)

Durum: **çalışma sürüyor** — bu belge her adımda güncellenir. Ölçüt: ya doğru sonuç ya açık hata (`{ok:false, error:{code, params}}`); sessiz yanlış yok.

Kod: `src/kernel/kernel.js` (özellikler, yeniden hesap, sorgular), `src/kernel/topo.js` (OCCT geçmişli işlemler, geçerlilik kapısı), `src/kernel/naming.js` (kalıcı adlandırma), `src/kernel/sketch.js` (profil seçimi/doğrulama/eğriler), `src/kernel/worker.js` (`reset` komutu).

## 1. Kalıcı topolojik adlandırma (F-01, F-21)

**Şema.** Her gövde kaydı `{shape, fn, name}` taşır; `fn[i]` = i'inci yüzün (keşif sırası) **ad kümesi** (sıralı dize dizisi).
- Ad = `özellik:rol[:ayırt edici]`. extrude yan yüzü `e1:side:<sketch varlık kimliği>`, kapaklar `e1:start` / `e1:end` (birden çok profil seçiliyse `:<dış döngü varlıkları>` eki); revolve `r1:rev:<varlık>` (+ açı < 360° ise start/end); delik `h1:wall|bottom|cbore|cbore-floor|csink:<nokta varlık kimliği>`; kutu `b1:x-|x+|y-|y+|z-|z+`; silindir `side|top|bottom`; küre `side`; yuvarlatma `f1:blend<kenar adı>`, köşe `f1:vblend<…>`; pah `cham`; kabuk iç yüzü `s1:inner(f:<kaynak yüz adı>)`; desen/ayna örneği `p1[<örnek>]<kaynak ad>` (dikdörtgen `i.j`, dairesel `k`, ayna `m`); kopya `mv[c]<ad>`; içe aktarma `imp:i<katı>.<sıra>:<yüzey türü>`.
- Gövde değişince adlar **OCCT geçmişiyle** miras alınır: `BRepAlgoAPI_Fuse/Cut/Common` (tek çağrı, çok takım), `BRepFilletAPI_MakeFillet/MakeChamfer`, `BRepOffsetAPI_MakeThickSolid`, `BRepBuilderAPI_Transform`, `BRepPrimAPI_MakePrism/MakeRevol` doğrudan `R.getOC()` ile kurulur; `Modified()/Generated()/IsDeleted()` (topo.js `propagate`). Birleşen yüzler (SimplifyResult) tüm adları taşır (takma adlar).
- Bölünen yüz: parçalar aynı adı taşır; ayırt edici `nb` = komşu yüz adlarından açgözlü seçilmiş en küçük küme.
- KENAR adı `{a, b, nb?}` = iki komşu yüzün adı (sırasız); aynı çifti paylaşan kenarlarda `nb` = uç köşelerdeki üçüncü yüzlerin adları.
- Ref = `{body, kind, name, hint:{fp, geom, idx, n}}` (+ ölçü bilgileri). Çözüm **yalnız ada göre** (naming.js `resolveName`); 0 aday → `ref.lost_face|edge`, >1 → `ref.ambiguous_face|edge`. `hint` yalnız hata metni ve göç içindir.
- Eski Ref `{body, idx, n, fp, geom}`: yalnız `n` eşit, `fp` toleransla (1e-6·max(10,|fp|)) aynı ve `geom` türü aynıysa bir kez kabul edilir; yeni ad çekirdekte saklanır, `rebuild().refUpgrades` ile arayüze bildirilir. Aksi `ok:false`.
- Yüz üzerine sketch (`plane.kind:'face'`) aynı çözümü kullanır.

**Bilinen sınırlar (ad üretilemeyen durumlar → seçim kabul edilmez, özellik `ok:false` ve `ref.unnamed`):**
- OCCT'nin geçmiş vermediği ve geometrik yedeğin (kenar orta noktası tek yüz üzerinde) tek aday bulamadığı süpürme yüzleri. (Revolve'da eksene dik kenarlardan üretilen düzlemler için `Generated()` boş döner; yedek bunları adlandırıyor.)
- Kaynak sketch varlığı bulunamayan profil kenarları (findRegions `ent` vermiyor ve geometriden tek varlık eşleşmiyor).
- İki parçası birebir aynı komşu kümesine sahip bölünmüş yüz/kenar: `ref.ambiguous_here` (describe `name:null, nameError`).
- Profil seçimi (`profiles:[dizin]`) hâlâ findRegions sırasına bağlı: çekirdek arayüzle aynı işlev ve aynı girdiyi kullanır; sketch düzenlenip bölge sırası değişirse dizin başka bölgeyi gösterebilir (arayüz tarafında bölge kimliği gerekir — ayrı iş).

## 2. Bulgu tablosu

(ilerledikçe doldurulur; bkz. bölüm 3 son durum)
