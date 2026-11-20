# Mihenk çekirdek — bağımsız test raporu

Kapsam: `src/kernel/kernel.js` (OCCT/replicad), `src/shared/profiles.js`, `src/shared/expr.js`, `src/shared/vec.js`.
Kaynak koduna dokunulmadı; yalnız `test/models/` ve bu rapor yazıldı. Testler yalnız `status.ok` ve geometrik sonuçlara bakar, hata metnine bağlı değildir.

**Hangi kaynak sınandı:** Başka bir ajan `src/` üzerinde çalıştığı için testler `git archive HEAD` ile alınan sabit bir kopya (`/tmp/snap/src`, `MIHENK_SRC` ile seçilir) üzerinde koşturuldu. **Bu rapordaki satır numaraları HEAD'deki `src/kernel/kernel.js`, `src/shared/*.js` içindir.** Çalışma ağacındaki (değişmekte olan) kaynakta da `part-a/g`, `state-bugs`, `ref-adversarial`, `profiles`, `feature-geo`, `measure` dosyaları koşturuldu ve aynı sonuçlar alındı (kalan sayıları birebir aynı).

Çalıştırma: `node test/models/run-all.mjs [dosya-filtresi]` (ayrıntılar `test/models/results.json`). Tek dosya: `node test/models/part-a.mjs`. Farklı kaynak ağacı: `MIHENK_SRC=/yol/src node test/models/run-all.mjs`.

## 1. Özet

| Dosya | Denetim | Geçen | Kalan | Süre (s) | İçerik |
|---|---:|---:|---:|---:|---|
| part-a.mjs | 20 | 19 | 1 | 1.3 | Flanş (revolve, havşalı delik deseni, pah, iç yuvarlatma) |
| part-b.mjs | 26 | 26 | 0 | 2.1 | Yumuşak çene (kademe, V kanal, yüz-sketch'li havşalı delik, pah) |
| part-c.mjs | 24 | 24 | 0 | 3.6 | Ayna adaptörü (fatura, 3 slot deseni, 4 delik, yuvarlatma) |
| part-d.mjs | 22 | 21 | 1 | 3.5 | Cepli/adalı plaka (3 seviye iç içe profil, cep dibi yuvarlatma, dikdörtgen desen) |
| part-e.mjs | 20 | 20 | 0 | 2.1 | Kademeli mil (5 kademe, profilde yay, kama kanalı, pah) |
| part-f.mjs | 27 | 27 | 0 | 1.6 | L braket (nervür, iki yüzde delik, kabuk) |
| part-g.mjs | 41 | 41 | 0 | 2.0 | İnce duvarlı kutu (kabuk, kule, fatura; yuvarlatma önce/sonra) |
| part-h.mjs | 144 | 144 | 0 | 17.4 | STEP/STL döngüsü a–g |
| param-sweep.mjs | 180 | 180 | 0 | 55.7 | 7 parça × 175 parametre/topoloji varyantı, bayat Ref denetimi |
| param-random.mjs | 250 | 250 | 0 | 89.3 | Tohumlu rastgele 1–3 parametre değişimi (7 parça × 40) |
| ref-adversarial.mjs | 24 | 21 | 3 | 3.1 | Hedefli Ref senaryoları, rollback/bastırma önbellek tutarlılığı |
| edge-cases.mjs | 216 | 180 | 36 | 105 | Sınır/hata vakaları (216 vaka, her biri ayrı çekirdek, çökme gözetmenli) |
| measure.mjs | 61 | 59 | 2 | 1.0 | describe/measure/bodyProps/interference |
| profiles.mjs | 82 | 66 | 16 | 0.5 | findRegions |
| feature-geo.mjs | 53 | 51 | 2 | 2.5 | extrude yönleri, revolve eksenleri, desen/ayna/taşı/birleştir |
| state-bugs.mjs | 12 | 6 | 6 | 2.7 | Aynı çekirdek örneğiyle art arda belgeler |
| perf.mjs | 12 | 12 | 0 | 232 | Süre ve bellek |
| **Toplam** | **1214** | **1147** | **67** | | 17 dosya, hepsi sonuç üretti |

"Kalan" 67 denetim, aşağıdaki 25 bulguya karşılık gelir (bir bulgu birden çok denetimi düşürebilir). Bulgu sayısı: 8 Kritik, 3 Yüksek, 9 Orta, 5 Düşük.

**Güven verici sonuçlar (kanıtlı):**
- 7 gerçekçi parçanın hepsinde hacim, bağımsız kapalı formülle **göreli 1e-9 ya da daha iyi** tutuyor (aşağıdaki tablo). Sınır kutusu, ağırlık merkezi simetrisi, delik konumu (dünya koordinatında, yüz-sketch eksen dönüşümü dahil), yüz/kenar sayısı makullüğü ve Euler çift sayı koşulu geçti.
- Yuvarlatma/pah/kabuk hacimleri analitik (Pappus, kesit centroidi, ters ofset alanı) formüllerle birebir eşleşiyor; kabuk "önce/sonra" farkı beklenenle aynı (522 mm³, R=6, t=2).
- STEP döngüsü a–g için hacim 1e-7, alan 1e-6, sınır kutusu, ağırlık merkezi, yüz sayısı birebir korunuyor; STL kapalı manifold, dışa bakan, hacim sapması en çok −3.7e-4 (mil; lineer tolerans 0.01 mm).
- Parametre taraması: 175 varyantta bayat Ref'ler **169 kez doğru elemana bağlandı** (hacim analitikle uyuştu ve Ref çözümü geometriden seçilen taze Ref ile aynı eleman), 5 kez yüksek sesle `ok:false`, 1 kez beklenen `ok:false` (cep silinince yuvarlatma). Rastgele taramada 250 geçerli varyantta **sıfır** yanlış bağlanma. Yani topolojik ad (indeks + n + parmak izi) parametre değişimlerinde sağlam; zayıf nokta F-01'deki "aynı n, farklı sıra" durumu.
- Önbellek tutarlılığı: rollback dizisi, bastır/aç döngüsü, fillet ekle/çıkar sonrası sonuç temiz çekirdekle bit-bit aynı.

| Parça | Hacim (kernel) mm³ | Beklenen (analitik) | Göreli fark | Yüz | Kenar |
|---|---:|---:|---:|---:|---:|
| a Flanş | 170377.12570 | 170377.12574 | 2.1e-10 | 21 | 45 |
| b Çene | 178200.97973 | 178200.97973 | <1e-15 | 21 | 47 |
| c Adaptör | 316272.23792 | 316272.23792 | <1e-15 | 22 | 56 |
| d Cepli plaka | 337118.28012 | 337118.28012 | <1e-15 | 36 | 84 |
| e Mil | 148925.69539 | 148925.69539 | 4.5e-12 | 22 | 42 |
| f L braket | 76544.15945 | 76544.15945 | <1e-15 | 15 | 39 |
| g Kutu (önce) | 39554.85884 | 39554.85884 | <1e-15 | 44 | 104 |

## 2. Bulgu tablosu

Önem tanımı: **Kritik** = sessiz yanlış geometri (ya da CAM'e giden `holes[]` verisi sessizce yanlış), **Yüksek** = çökme/istisna/kilitlenme ya da veri kaybı, **Orta** = yanlış ya da eksik hata, **Düşük**.

| No | Önem | Başlık | Yeniden üretim |
|---|---|---|---|
| F-01 | Kritik | Ref aynı `n` ile gelince parmak izi hiç denetlenmiyor: sketch varlık sırası değişince yuvarlatma/pah yanlış kenara uygulanıyor (ok:true) | ref-adversarial.mjs R1 |
| F-02 | Kritik | İçe aktarma önbelleği özellik kimliğine bağlı: aynı `import1` kimlikli başka dosya (ya da bozuk/eksik veri) eski geometriyi ok:true gösteriyor | state-bugs.mjs X1 |
| F-03 | Kritik | `extrude dir:'two'` + `flip` yanlış aralık ve hacim üretiyor (3000 yerine 1000) | feature-geo.mjs E6 |
| F-04 | Kritik | Düğümsüz kesişen çizgiler bölünmüyor: çarpı köşegenli dikdörtgenin yarısı kayboluyor (8000, beklenen 16000) | profiles.mjs P10/P10b |
| F-05 | Kritik | Geçersiz katı ok:true: kendini kesen profil, 1e-5'ten kısa kenar (hacim −%8.3), kenara teğet delik | edge-cases.mjs S02, S28, S11 |
| F-06 | Kritik | Revolve açısı >360 sessizce açı mod 360 oluyor (400° → 40°) | edge-cases.mjs R01 |
| F-07 | Kritik | `holes[]` desen/ayna girdisi yalnız kaynak delik konumunu taşıyor, `count`=N−1: 6 delikten 1'i görünüyor | part-a.mjs, part-d.mjs (A-holes, D-holes) |
| F-08 | Kritik | Malzemeye değmeyen kesme/delik ok:true (no-op); `holes[]`'e hayalet delik yazılıyor | edge-cases.mjs B03/B04/B05/H21/H22/H23 |
| F-09 | Yüksek | `move`: ikinci rebuild'de ve `copy:true`'da "This object has been deleted" istisnası, önbellek zehirleniyor | state-bugs.mjs X2/X2b, edge-cases D21 |
| F-10 | Yüksek | `profiles:[]` (boş seçim) → `rebuild()` TypeError fırlatıyor, `last` bozuk kalıyor | edge-cases.mjs S16/R17, state-bugs X3 |
| F-11 | Yüksek | Ölçek: küre çap 1e6 (ve 3e4) meshleme kilitleniyor/bellek yiyor; desen adedi O(n²): 800 delik 122 s, 5000 delik kilitlenme | edge-cases V16/P16, perf.mjs |
| F-12 | Orta | Bilinmeyen değerler sessiz varsayılana düşüyor: `op:'subtract'`→kesişim, `combine op:'xor'`→birleştir, bilinmeyen/eksik düzlem→XY, eksik revolve ekseni→sketchX | edge-cases S21, B20, B21, R14 |
| F-13 | Orta | Kesişimin boş çıkması bütün hedef gövdeleri siliyor (ok:true, 0 gövde); `combine` hedef=takım gövdeyi yok ediyor | edge-cases B13/B14/B17 |
| F-14 | Orta | Anlamsız delik/revolve parametreleri ok:true: açı 0 (sıfır hacimli gövde), negatif derinlik, havşa derinliği>derinlik, konik havşa 180° | edge-cases R04, H06, H09, H10 |
| F-15 | Orta | İfade değerlendirici: `-2^2`=+4, `max(10,5)`=10.5, `tan(90)`=1.6e16 kabul, `pi` adlı parametre yok sayılıyor | edge-cases V31/V32/V33/V35 |
| F-16 | Orta | Profil bölme eksiklikleri: T kavşak, ortak kenarlı komşular, kesişen daire; `open` bayrağı çekirdekte yok sayılıyor | profiles.mjs P5/P6/P7/P11/P20 |
| F-17 | Orta | STL içe aktarma hiçbir dosyada çalışmıyor (kendi dışa aktarımı dahil); neden yutuluyor | edge-cases I17, part-h.mjs |
| F-18 | Orta | Bozuk STEP (yarıçap 0) ok:true ama ağ boş/NaN | edge-cases I14 |
| F-19 | Orta | `measure(gövde, gövde)` istisna ("Eleman yok") | measure.mjs M2 |
| F-20 | Orta | Bellek artışı: rebuild başına ≈0.8–1.1 MB rss (150 turda +122 MB) | perf.mjs |
| F-21 | Orta | Ref yeniden bağlama kırılgan: n değişirken geometri de kayarsa (5/175) `ok:false` | param-sweep.mjs |
| F-22 | Düşük | Bozuk belge (null özellik, `features` yok/dizi değil, doc null) `rebuild()` istisnası | edge-cases D05/D06/D08/D09 |
| F-23 | Düşük | `measure().angle` yalnız [0°,90°]: 120° iç açı 60° bildiriliyor | measure.mjs M6b |
| F-24 | Düşük | Düğüm birleştirme yuvarlamayla (1e-5 ızgara): ızgara sınırında 2e-9 farklı iki nokta farklı düğüm oluyor | profiles.mjs P18 |
| F-25 | Düşük | Yinelenen (üst üste) dikdörtgen çizgileri profili tamamen siliyor (ok:false) | edge-cases S09 |
| F-26 | Düşük | STL ağ hacmi 1e-4 hedefini mil için aşıyor (−3.7e-4) | part-h.mjs |

## 3. Bulgu ayrıntıları

### F-01 Kritik — Ref indeks yolu parmak izini doğrulamıyor
- **Yeniden üretim** (`ref-adversarial.mjs`, R1): sketch `s1` XY'de `rect(0,0,100,60)`; `e1` extrude `dist:'20'`, `op:'new'`; `f1` fillet `r:'5'`, `edges:[{body:'e1', idx:i, n:12, fp:[100,0,10], kind:'edge'}]` (x=100,y=0 dikey kenarı). Sonra `s1.ents` dizisi 1, 2, 3 kaydırılır (aynı geometri, aynı nokta kimlikleri; kullanıcı bir çizgiyi silip yeniden çizince olan şey).
- **Gözlenen:** `f1` `ok:true`; yuvarlanan köşe sırasıyla (100,60), (0,60), (0,0). **Beklenen:** her seferinde (100,0) ya da `ok:false`.
- **Neden:** `kernel.js:35` `if (ref.n === list.length && list[ref.idx]) return list[ref.idx];` — `n` aynıysa `fp` hiç bakılmıyor. `sketchFaces` (`:44-57`) bölgeleri `findRegions` sırasıyla alıyor, o da varlık sırasından döngü başlangıcını seçiyor; OCCT kenar sırası bu başlangıçla değişiyor. Hacim aynı kaldığı için (dört köşe eşdeğer) tek başına hacim testiyle de görünmez.
- **Düzeltme:** indeks yolunda da `fp`'yi doğrula (tolerans: yeniden hesaplamada hareket edebilen elemanlar için ayrı "aday bulma"); daha sağlamı kalıcı adlandırma: eleman başına `{özellik kimliği, üretim sırası/ebeveyn yüz imzası, tür, komşu yüz normalleri}` sakla ve eşleşmezse `ok:false`. Sketch varlıklarını bölge sırasından önce kimliğe göre sırala (`findRegions` çıktısını girdi sırasına bağımsız yap).

### F-02 Kritik — İçe aktarma önbelleği kimliğe bağlı
- **Yeniden üretim** (`state-bugs.mjs`, X1; aynı `Kernel` örneği): A belgesi `[{id:'import1',type:'import',format:'step',data:<kutu 10×20×30>}]` → hacim 6000. B belgesi aynı `id` ile silindir verisi → **6000** (beklenen 3141.59). C belgesi `data:'bozuk veri'` → **ok:true, 6000**. D belgesi `data` alanı yok → ok:true, 6000.
- **Neden:** `kernel.js:292-302` `loadImports` → `if (... || this.imports.has(f.id)) continue;` (anahtar yalnız özellik kimliği); önbellek anahtarı da `data.length` (`:317`). Uygulamada `newId()` her yeni belgede ilk içe aktarmaya `import1` veriyor (`features.js:14-19`), worker tek örnek ve `loadDoc` (`app.js:149`) onu yeniden başlatmıyor → bir dosyadan diğerine geçince **önceki dosyanın geometrisi** görünür (uygulama içinde uçtan uca denenmedi; kernel düzeyinde kanıtlı).
- **Düzeltme:** anahtar = kimlik + veri özeti (örn. SHA-1/uzunluk+FNV); `rebuild` başında kullanılmayan kimlikleri sil; yükleme hatasında eski girdiyi sil.

### F-03 Kritik — iki yönlü extrude + ters çevir
- **Yeniden üretim** (`feature-geo.mjs`, E6): XY'de 20×10 dikdörtgen, `extrude {dir:'two', dist:'10', dist2:'5', flip:true, op:'new'}`.
- **Gözlenen:** z∈[−10, −5], hacim 1000. **Beklenen:** z∈[−10, +5], hacim 3000 (flip olmadan z∈[−5,10] doğru çıkıyor).
- **Neden:** `kernel.js:113` `d+d2` ve `translate(-d2)`; `flip` `d`'yi negatif yapıyor (`:109`) ama `d2` işareti çevrilmiyor → `d+d2 = −5`.
- **Düzeltme:** `flip` iki mesafeyi birlikte çevirsin (`d2 = flip ? -d2 : d2` ya da ön/arka uzunlukları ayrı hesapla).

### F-04 Kritik — Kesişimlerde bölme yok (çarpı köşegen)
- **Yeniden üretim** (`profiles.mjs` P10/P10b): `rect(0,0,40,40)` + `line (0,0)-(40,40)` + `line (40,0)-(0,40)` (köşegenler ortada düğümsüz kesişir); `extrude profiles:'all' dist:'10'`.
- **Gözlenen:** `findRegions` tek bölge (üçgen, alan 800, `open:false`); hacim **8000**. **Beklenen:** 4 üçgen / hacim 16000 (ya da yapı çizgisi uyarısı).
- **Neden:** `profiles.js:52-90` yarım-kenar grafiği yalnız ortak **düğümler** üzerinden kurulur; çizgi-çizgi, çizgi-yay, daire-çizgi kesişimleri düğüme çevrilmiyor. Yüz dolaşımı kapanmayan döngüleri sessizce atıyor (`if (h === h0) loops.push`).
- **Düzeltme:** `findRegions` başında tüm varlık çiftleri için kesişimleri hesaplayıp varlıkları bölün (planar arrangement); kapanmayan/atılan döngü varsa `open` bayrağını `sketchFaces`'te uyarıya çevirin (şu an çekirdek `open`'ı hiç okumuyor).

### F-05 Kritik — Geçersiz katı ok:true
`BRepCheck_Analyzer` ile doğrulandı; kernel hiçbir yerde geçerlilik denetimi yapmıyor.
1. **Kendini kesen profil** (S02): `poly [[0,0],[20,10],[20,0],[0,10],[-6,3]]`, dist 10 → ok:true, hacim 300 (anlamsız), BRepCheck geçersiz. (Simetrik papyon alanı 0 çıktığı için S01'de doğru hata veriyor.)
2. **Çok kısa kenar** (S28): `[[0,0],[10,0],[10,10],[5,10],[5-1e-6,10],[0,10]]` → hacim **916.67** (beklenen 1000, −%8.3), geçersiz. 1e-7…3e-6 aralığında hep yanlış; ≥1e-5'te doğru. **Neden:** `profiles.js:53` düğümleri 1e-5'e yuvarlayıp birleştiriyor, ama `mkLoop` (`:96-110`) ham koordinatları yayınlıyor; `kernel.js:48-56` bu uçlar arasındaki ~1e-6 boşlukla tel kuruyor.
3. **Kenara teğet delik** (S11): `rect(0,0,40,40)` + `circle(10,20,r=10)` (x=0'a teğet), yalnız delikli bölge → hacim doğru (12858.4) fakat katı geçersiz; sonraki boolean/fillet/CAM işlemlerinde güvenilmez.
- **Düzeltme:** `sketchFaces` sonunda `BRepCheck`/`ShapeFix_Shape` uygula, geçersizse `ok:false`; düğüm birleştirmede yayınlanan koordinatları da düğüm merkezine çek (ya da tolerans içindeki uçları aynı noktaya eşitle); kendini kesen döngü tespiti ekle.

### F-06 Kritik — Revolve açı >360
- **Yeniden üretim** (edge-cases R01): XZ sketch `rect(2,0,5,10)`, `revolve axis:{kind:'sketchY'} angle:'400'`.
- **Gözlenen:** hacim 73.30 (=40° dilimi); 720° tam gövde, 0 → hacim 0 (F-14). **Beklenen:** tam halka 659.73 ya da `ok:false`.
- **Neden:** `kernel.js:123,131` açı doğrulanmadan `R.revolution`'a veriliyor.
- **Düzeltme:** `0 < |açı| ≤ 360` dışında `ok:false` (ya da 360'a kıs).

### F-07 Kritik — `holes[]` desen girdisi eksik
- **Yeniden üretim** (`part-a.mjs`): revolve flanş + `hole csink` (1 nokta, r=45) + `pattern circ count 6 total 360 axis Z` kaynağı o delik. `part-d.mjs`: tek delik + `pattern rect 2×2`.
- **Gözlenen:** `holes = [bore, bolt(positions:[[45,0,12]]), pat(patternOf:'bolt', count:5, positions:[[45,0,12]])]` → CAM yalnız 1 konum görür (6'dan). Plakada 4'ten 1. Ayna (`mirror`) aynı.
- **Beklenen:** her örnek için dünya konumu (6 konum) ve tutarlı `count`.
- **Neden:** `kernel.js:265-266` `{...srcHole, count: xforms.length}` — dönüştürülmüş konumlar hesaplanmıyor, `count` N−1.
- **Düzeltme:** her `xform`'u konumlara (ve `dir`'e) uygula; `positions`'a ekle.

### F-08 Kritik — Malzemeye değmeyen kesme sessiz no-op
- **Yeniden üretim** (edge-cases B03, B04, B05, H21, H22, H23): 40×40×10 kutudan 25×25 köşe kesilmiş (L), üst düzlemden (25,25)'e `hole simple dia 4 extent all`; ya da kesme takımı yalnız bir yüzle değiyor; ya da `hole flip:true` (havaya doğru).
- **Gözlenen:** ok:true, hacim değişmedi; `holes[]`'e delik yazıldı (CAM havayı deler). H23: iki noktadan biri malzemede, biri havada → ikisi de `positions`'ta.
- **Neden:** `kernel.js:66-72` yalnız sınır kutusu çakışmasına bakıyor; `:85` kesme sonucu hacmini kıyaslamıyor; delik verisi `:166`'da kesmeden önce yazılıyor.
- **Düzeltme:** kesmede `V_önce − V_sonra < ε` ise `ok:false` ("takım malzemeye değmiyor"); delik başına etkili olup olmadığını denetle ve `holes[]`'e yalnız etkili konumları yaz.

### F-09 Yüksek — `move` kaynağı yok ediyor
- **Yeniden üretim** (state-bugs X2/X2b): kutu + `move {bodies:['b1'], dx:'50'}`; ilk rebuild ok; `dx:'70'` ile ikinci rebuild → `Error: This object has been deleted`. `copy:true` ilk rebuild'de bile fırlatıyor.
- **Neden:** `kernel.js:229,231` `s.rotate/translate` replicad'de kaynak şekli siler; `b.shape` hem önbellekteki durumda (`:317` `cloneState` şekilleri paylaşır) hem `copy` dalında kullanılıyor. `pattern`/`mirror` `clone()` kullandığı için sorunsuz.
- **Etki:** "Taşı/Kopyala" aracı canlı önizlemede (parametre her değişince) çöker; hata `rebuild` istisnası olduğundan durum çubuğu bile güncellenmeyebilir.
- **Düzeltme:** dönüşümden önce `b.shape.clone()`.

### F-10 Yüksek — Boş profil seçimi istisna
- **Yeniden üretim:** `extrude`/`revolve` `profiles:[]`, `op:'new'`.
- **Neden:** `kernel.js:47` `[]` doğru-yorumlanıyor → `faces=[]` → `tool=null`; `applyOp` `:63-65` `new` dalında `shape:null` gövdeyi kaydediyor; sonra `:327` önbellek/`last` atanıyor ve `:332` `b.shape.boundingBox` TypeError ile `rebuild` düşüyor (özellik düzeyinde `ok:false` yerine).
- **Düzeltme:** `idxs.length === 0` ise "profil seçilmedi" hatası; `rebuild` sonunda mesh üretimini try/catch'e al, `this.cache/last`'ı hatadan önce atama.

### F-11 Yüksek — Ölçek ve süre
- Küre çap 1e6 (`V16`) 40–90 s sonra zaman aşımı; 3e4'te RSS %36'ya çıktı (elle kesildi). Neden: görüntü ağı toleransı `[0.005, 0.2]` mm'ye kıskaç (`kernel.js:333`) → üçgen sayısı sınırsız.
- Desen süresi karesel (zincirleme `fuse`, `:260`): 50→0.6 s, 100→2.4 s, 200→8.1 s, 400→31 s, 800→122 s, 5000 (`P16`) zaman aşımı. 200 delik görevinde 8 s (kabul edilebilir ama arayüzde canlı önizleme için yavaş).
- **Düzeltme:** ağ toleransını model köşegenine oranla alt sınırlı yap ya da üçgen sayısı üst sınırı koy; desen aletlerini bir `makeCompound` ile tek seferde `fuse`/`cut` et ya da ikili ağaç birleşimi kullan; `count` üst sınırı.

### F-12…F-26 (kısa)
- **F-12** `applyOp :85` `op==='cut' ? cut : intersect` → bilinmeyen op kesişim olur (B21: 1000→250); `combine :217` `xor`→birleştir (B20); `vec.js:16` bilinmeyen/eksik düzlem adı XY (S21, S20); `kernel.js:129` eksik ekseni sketchX. Doğrulama listesi (`op ∈ {new,join,cut,intersect}`, düzlem adı ∈ XY/XZ/YZ) ekleyin.
- **F-13** `applyOp :86` boş kesişimde `state.bodies.delete(id)` → `ok:true`, 0 gövde (B13/B14; kesişmeyen *diğer* gövdeler de siliniyor); `combine :220` takım kimliği hedefle aynıysa hedef siliniyor (B17).
- **F-14** `revolve` açı 0 → sıfır hacimli gövde ok:true (R04); `hole` derinlik −5 → no-op (H06); `cboreDepth>depth` (H09); `csinkAngle 180` → `tan(90°)` ile anlamsız koni (H10). Girdi aralık denetimi ekleyin.
- **F-15** `expr.js:18` tekli eksi `pow`'dan önce → `-2^2 = 4`; `:11` tüm virgüller noktaya çevriliyor → `max(10,5)=10.5` (fonksiyon argüman ayracı `;`; hata vermeli); `tan(90)=1.6e16` sonlu diye kabul; `:34` `pi` kullanıcı parametresinden önce geliyor (tanımlanan `pi` sessizce yok sayılıyor). Hiçbiri hata vermiyor.
- **F-16** `profiles.js`: ortak kenarlı iki kare yinelenen çizgiyle çizilince tek birleşik bölge (P5/P6; `profiles:[0]` seçimi 25000 yerine **50000**); T kavşak tek bölge + `open:true` (P7); daire dikdörtgeni kesince 2 bölge (P11), daire ilk noktası dikdörtgen içindeyse "delik" sayılıp geçersiz yüz üretiyor (P20: ok:true, geçersiz katı, hacim 19141 vs 13473). Kökü F-04 ile aynı (kesişim bölünmüyor) + `:101-110` delik atama noktası tek örneğe bakıyor.
- **F-17** `StlAPI_Reader` her çağrıda `WebAssembly.Exception` atıyor (kendi ürettiğimiz 12 üçgenlik kutu STL'i dahil); `kernel.js:301` `catch` mesajı yutuyor, kullanıcı yalnız "yüklenemedi" görüyor. Tasarım (DESIGN.md) STL içe aktarmayı vaat ediyor.
- **F-18** STEP içinde silindir yarıçapı 0 → import ok:true, ağ boş/NaN (I14); içe aktarmada geçerlilik/ağ kontrolü yok.
- **F-19** `measure :` `get()` gövde türünü destekliyor ama `describe(a, a.kind)` `kind:'body'`'yi kenar listesi sanıyor → "Eleman yok".
- **F-20** 30 rebuild: rss 318→352 MB (+34 MB), 150 rebuild: 440 MB (external 102→151 MB); ≈0.8 MB/rebuild. replicad nesneleri `delete()` edilmiyor. Canlı önizleme (250 ms) ile uzun oturumda birkaç bin turda GB düzeyine çıkar (tahmin, ölçülmedi).
- **F-21** Beklenmedik `ok:false` (taze belge sorunsuz): a: N=8+OD=140+PCD=100+HD=50 birlikte; c: NS=4+OD=180+SPH=8; e: D5=D4 (uç radyüsü değişir) ve L1=20+D1=14 (pah kenarı hareket eder); f: nervür bastırılınca yüz-sketch Ref'i. Sessiz değil, ama `n` değişirken `fp` 1e-4'ten fazla kayınca Ref kaybolur (`kernel.js:36-40`); yeniden bağlama sezgisi yok.
- **F-22** `loadImports :294-295` doğrulamasız (`doc` null, `features` yok/dizi değil, özelliklerde null). Worker istisnayı yakalıyor (`worker.js`), bu yüzden süreç düşmez.
- **F-23** `kernel.js:measure` `acos(|n1·n2|)`: 120° iç açı 60°, 150° iç açı 30° (M6'da sınırlı aralıkta kayıtlı).
- **F-24** `profiles.js:53` `Math.round(x*1e5)`: 2e-9 farklı iki nokta ızgara sınırında (5e-6) ayrı düğüm → bölge 0 (P18). Çözücü artıkları nedeniyle seyrek.
- **F-25** Aynı dikdörtgen iki kez çizilirse bölge bulunamıyor (yinelenen çizgiler yarım-kenar eşleşmesini bozuyor); ok:false ile reddediliyor (sessiz değil).
- **F-26** STL (tolerans 0.01 mm): a −8.9e-5, b +1.0e-5, c −8.7e-5, d −1.6e-5, e **−3.7e-4**, f +1.0e-5, g −8.3e-5. Hedef 1e-4 yalnız mil için aşıldı (eğrisel yüzeyin kiriş hatası).

## 4. Süre ve bellek ölçümleri

Makine: konteyner, Node 22, tek iş parçacığı, WASM (replicad-opencascadejs tek dosya). Süreler duvar saati.

| Durum | Süre |
|---|---:|
| Flanş (a) soğuk rebuild | ~0.15 s |
| Flanş rebuild (parametre değişimi, 30 tur ort.) | 140–205 ms |
| 60 özellikli belge, soğuk | 2.2 s |
| 60 özellik, yalnız son özellik değişti (önbellek) | 0.55 s |
| 60 özellik, ilk özellik değişti (tam hesap) | 1.9 s |
| Dikdörtgen desen 50 / 100 / 200 / 400 / 800 delik | 0.6 / 2.4 / 8.1 / 31 / 122 s |
| Dairesel desen 50 / 100 / 200 / 400 delik | 0.5 / 1.6 / 6.2 / 24.8 s |
| Tek sketch'te 200 nokta + tek delik | 8.4 s |
| Kutu 600×600×10, 200 delikli desen (görev ölçütü) | 8.1 s |
| Küre çap 100 / 1000 / 3000 / 6000 | 0.04 / 0.34 / 1.8 / 4.9 s |
| Küre çap 1e6, desen 5000 | 40–90 s sonra sonlandırıldı |

| Bellek (process.memoryUsage, `--expose-gc` sonrası) | rss | heapUsed | external |
|---|---:|---:|---:|
| Flanş, başlangıç | 318 MB | 23.5 MB | 102 MB |
| 30 ardışık rebuild sonrası | 352 MB (+34) | 26.8 MB (+3.3) | 102.6 MB (+0.2) |
| 60 / 90 / 120 / 150 rebuild | 372 / 395 / 417 / 440 MB | 30 / 33 / 36 / 39 MB | 109 / 109 / 126 / 152 MB |

150 ardışık rebuild çökmeden bitti; sızıntı doğrusal (≈0.8 MB/tur rss, heap ≈0.1 MB/tur).

## 5. Test edemediklerim / sınırlar

- **Arayüz ve worker mesaj protokolü** (`worker.js`, `app.js`, `loadDoc`) çalıştırılmadı: F-02'nin uygulama içi uçtan uca doğrulaması, F-09'un arayüzde nasıl göründüğü ve `die()` ile worker yeniden başlatma yolu denenmedi (kernel düzeyinde kanıtlı; app davranışı koddan çıkarım).
- **Sketch çözücü** (`solver.js`, kısıt çözümü) ve ölçü ifadeli sketch'lerin parametre değişiminde yeniden çözümü: sketch noktaları elle (çözülmüş) verildi, bu yüzden "çözücü yakınsamazsa/kayan nokta artığı" etkisi (F-05/F-24 tetikleyicileri) gerçek akışta ölçülemedi.
- **Başka CAD'den gelen gerçek STEP/IGES/STL** (B-spline, NURBS, montaj, renk/isim) yok; yalnız Mihenk'in kendi ürettiği STEP ve elle bozulmuş dosyalar denendi. STEP 20 MB doldurulmuş dosya geçti; 100 MB+ denenmedi.
- **Diş verisi** (`thread`), 4/5 eksen/makine verisi, CAM çıktısı, G-kodu bu kapsamda değil. `holes[]` yalnız kaynağıyla karşılaştırıldı.
- **Görüntüleme ağı** (faceGroups/edgeGroups indeksleri, normaller, WebGL) ve seçim eşlemesi (`hashCode` → indeks) test edilmedi; yalnız hacim/ağın sonlu olması denetlendi.
- **Loft/sweep/helis** yok (çekirdekte yok). Eğrisel (serbest biçimli) yüzeyde fillet/shell denenmedi.
- **Bellek:** WASM yığın boyutu `oc.HEAPU8` ile okunamadı (0 döndü); yalnız `process.memoryUsage` kullanıldı. Birkaç bin tur ve gerçek OOM sınırı sınanmadı.
- **Windows/Electron paketi** çalıştırılmadı (Linux, Node 22).
- Shell sonuçları L braket ve kutu gibi basit gövdelerde analitikle uyuştu; karmaşık gövdelerde "OCCT sessizce aynı gövdeyi döndürür" koruması (hacim değişmediyse hata) yalnız dolaylı sınandı.
- Sweep'ler aynı sketch varlık sırasını korudu; F-01 senaryosu dışında sıralama kaynaklı yeniden numaralama ayrıca sınanmadı.

## 6. Dosya envanteri (`test/models/`)

`lib.mjs` (yardımcılar: sketch kurucu, analitik moment/revolve, `std` parça denetimi, BRepCheck, STL manifold ölçümü), `part-a…h.mjs`, `param-sweep.mjs`, `param-random.mjs`, `ref-adversarial.mjs`, `edge-cases.mjs` (alt süreç gözetmenli), `measure.mjs`, `profiles.mjs`, `feature-geo.mjs`, `state-bugs.mjs`, `perf.mjs`, `run-all.mjs`, `results.json` (son koşu).
