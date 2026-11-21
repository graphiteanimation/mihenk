# İE-007 — Yapı düzlemi (construction plane) tasarımı (O-057)

Bağlayıcı sözleşme: çekirdek ve arayüz bu belgeye göre yazılır. Değişiklik gerekirse önce bu belge güncellenir.

## Belge modeli
Yeni özellik türü `plane` (geçmiş ağacında sıradan bir özellik; bastırılabilir, yeniden adlandırılır, silinir):
```
{ id: 'plane1', type: 'plane', name, mode: 'angle' | 'three' | 'offset',
  base:   <düzlem başvurusu>,            // angle, offset
  axis:   { kind: 'edge', ref: <kenar başvurusu> } | { kind: 'axis', name: 'X'|'Y'|'Z' },   // angle
  angle:  <ifade, derece>,               // angle
  offset: <ifade, mm>,                   // offset (base normali yönünde)
  points: [<nokta>, <nokta>, <nokta>],   // three
  flip:   bool }                         // isteğe bağlı: normali ters çevir (x korunur, y ve n ters)
```
Düzlem başvurusu (her yerde aynı): `{kind:'base', name:'XY'|'XZ'|'YZ', offset}` · `{kind:'face', ref}` · **yeni** `{kind:'plane', id}`.
Nokta: `{kind:'vertex', edge:<kenar başvurusu>, hint:[x,y,z]}` (kenarın uç noktalarından, dairesel kenarda ayrıca merkezden hint'e en yakını) · `{kind:'sketch', sketch:<id>, point:<nokta kimliği>}` · `{kind:'xyz', x, y, z}` (ifadeler).
`naming.js`'e dokunulmaz: yeni başvuru türü yok, mevcut kenar/yüz başvuruları kullanılır.

Kullanım yerleri: eskiz `plane: {kind:'plane', id}` · ayna `plane: 'plane', planeId: id` · `toolPlane` (böl, yüz böl, draft nötr düzlemi) `{kind:'plane', id}` kabul eder.

## Geometri (düzlem = {o, x, y, n}, sağ el: n = x × y)
- **angle**: taban düzlemi B (normal n_b), eksen doğrusu L (nokta a, birim yön d). Koşul |d·n_b| ≤ 1e-6 (eksen tabana paralel), yoksa `plane.axis_not_parallel`. d'nin işareti geometrik olarak sabitlenir: mutlak değeri en büyük bileşeni pozitif (topoloji sırası değişince açı yön değiştirmesin). n = n_b'nin d etrafında sağ el kuralıyla `angle` derece döndürülmüşü; x = d; y = n × x; o = B'nin orijininin L üzerine dik izdüşümü. angle = 0 → tabanla aynı yönelim.
- **three**: o = p1, x = birim(p2 − p1), n = birim(x × (p3 − p1)), y = n × x. Doğrudaş (|x × (p3−p1)| < 1e-9·ölçek) → `plane.points_collinear`.
- **offset**: B'nin x, y, n'si; o = o_b + n_b·offset.
- Başvurulan düzlem özelliği yok/bastırılmış/sonra geliyor → `plane.not_found`. Eksen kenarı doğrusal değil → `plane.axis_not_linear`.

## Çekirdek
- `state.planes: Map(id → plane)`; `resolvePlane` `kind:'plane'` çözer. Sonuçta `result.planes = {id: {plane}}` (arayüz çizimi için).
- Parametrik: açı/ofset ifadedir (değişkenler dahil); değişince bağlı eskiz ve özellikler yeniden hesaplanır (mevcut yeniden hesap ve önbellek imzası düzleme duyarlı olmalı).
- Başvuru onarımı / kayıp başvuru bildirimi (`refs`, `lost`) düzlem özelliğinin `base.ref`, `axis.ref`, `points[i].edge` alanlarını kapsar.
- Şema: `plane` türü doğrulanır. `FILE_VERSION = 2`; yazarken belge `plane` özelliği ya da `kind:'plane'` başvurusu içermiyorsa `version: 1` yazılır (0.6.0 eski belgeleri ve yeni yazılan düzlemsiz belgeleri açmaya devam eder); sürüm 1 belgeler değişmeden açılır.

## Arayüz
- Araç: Oluştur (Construct) grubunda "Yapı düzlemi" (Construction Plane); panelde kip seçimi (Açıyla / Üç noktadan / Ofset), kipin alanları, canlı önizleme.
- Görünüm: yapı düzlemleri yarı saydam dörtgen (orijin düzlemlerinden ayırt edilir renk), "düzlemler" göz düğmesine uyar; yeni eskizde ve ayna/böl düzlem seçiminde tıklanarak seçilir (`hit.kind = 'cplane'`). Ağaçta simge + özet (kip, açı).
- Eskiz düzlemi yapı düzlemi olan eskiz düzenlenirken panel notu düzlemin adını gösterir.
- TR + EN bütün metinler; `test/i18n.test.mjs` yeşil kalır.

## Kabul testleri
- `test/yapi-duzlemi.test.mjs` (test-all zincirinde): açı düzlemi (eksen: orijin ekseni ve kenar), üç nokta (üç nokta türü), ofset; açı değişince bağlı eskiz+extrude güncellenir; düzlem üzerinde eskiz → extrude hacmi analitik değerle; ayna; kaydet/aç (sürüm 2, düzlemsiz belge sürüm 1); hata kodları; zincir (düzlemden düzlem).
- T04 (ppp0109): `test/fixtures/ie007/T04-arayuz.mhnk` arayüz testindeki belgedir (Move/Copy dolanması). Aynı parça, 45° destek eskizi açılı yapı düzlemine çizilerek (Move/Copy olmadan) üretilir; gövdelerin toplam hacmi `test/cad-bench/ref/ppp0109.step` hacmine ±%0,1, kutu ±0,05 mm. (C-39/C-42 İE-005'tedir: R16 kesiti ayrı gövde kalabilir.)
- `test/yapi-duzlemi-ui.test.py` (test-all zincirinde, needsBuild): düzlem oluştur → üzerine eskiz → extrude; açı düzenlenince gövde güncellenir.

## Uygulamada netleşenler (çekirdek, 2b115bf)
- Bilinmeyen kip ya da nokta türü → `sketch.plane_unknown`; eskiz noktası yok / eskiz sonra geliyor → `sketch.not_found`; eksen verilmemiş → `pattern.no_axis`; eksen adı bilinmiyor → `prim.axis_unknown`.
- Orijin eksenleri dünya orijininden geçer. Eksen tabana paralel olmalı, taban düzleminin içinde olması gerekmez; o = taban orijininin eksene dik izdüşümü.
- `hint` yoksa köşe noktası kenarın ilk ucudur.
- `docFileVersion(doc)`: `type:'plane'`, ayna `plane:'plane'` ya da `f.plane` / `f.tool` / `f.base` içinde `kind:'plane'` varsa 2, yoksa 1.
- Arayüz etiket anahtarları `plane.` öneki yerine `cpl.` kullanır (i18n testi `plane.` önekini hata ad alanı sayar).
