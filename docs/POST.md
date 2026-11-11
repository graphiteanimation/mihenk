# Mihenk CAM: post, geri okuyucu ve simülasyon (Ajan B) — 0.2.0

Bu belgedeki NC çıktıları YALNIZ test çıktısıdır; hiçbiri "makinede çalıştırılabilir" diye sunulmaz. Her çıktının ilk yorum satırı
`(UNVERIFIED POST - DOGRULANMADI - MIHENK x.y.z)` olur (K-004). Makinede ilk doğrulama makine projesindedir.

## 1. Dosyalar

| Dosya | İş |
| --- | --- |
| `src/cam/ir.js` | IR doğrulama (`validateToolpath`, `validateProgram`, `toolpathErrors`), `mk` yardımcıları, `pathBBox`, `computeStats`, yay yardımcıları (`arcCenter`, `arcRadius`, `arcSweep`, `sampleArc`), `splitRapid`/`normalizeRapids`, `compareToolpaths` |
| `src/cam/post/engine.js` | Olay motoru (`runPost`), `createFormat`, `createVariable`, `createModal`, `sanitizeComment`, `resolveProps` |
| `src/cam/post/fanuc-base.js` | Fanuc tarzı ortak çekirdek (`createFanucPost`) |
| `src/cam/post/mitsubishi-m80v.js` | M80V postu (çekirdekten türer) |
| `src/cam/post/registry.js`, `index.js` | `control` kimliği → post; `postProgram`, `readNC` |
| `src/cam/post/reader.js` | Geri okuyucu: NC → IR |
| `src/cam/sim/` | `index.js` (simülasyon), `heightmap.js`, `tool.js` |
| `src/i18n/cam-post-{tr,en}.js` | Hata/uyarı metinleri (anahtar = `'err.' + kod`; C ajanı sözlüğe bağlar) |

## 2. Post API

```js
import { postProgram, readNC, getPost, listPosts } from 'src/cam/post/index.js';
postProgram(program, machine, opts?) → { text, lines:[string], lineMap:[{section:n|null, move:k|null}], warnings:[{code,params}], props }
//   opts: { props?, date?:'YYYY-MM-DD', appVersion?:'0.2.0', gates?:[{level,code,opId?}], verified?:{by,date,note} }
//   machine.control → post kimliği ('mitsubishi-m80v' | 'fanuc-generic'); post özellikleri = post varsayılanı < machine.post.props < opts.props
//   lineMap[i] = i+1. satırın (bölüm, hareket) eşlemesi; hareket IR'deki ORİJİNAL indekstir (post karışık hızlıyı böldüyse iki satır aynı harekete eşlenir).
readNC(text, { machine?, post?, props? }) → { program:{name,number,machine,units,sections}, events:[{line,ev,...}], lineMap:[{section,move}|null] }
```
Hatalar `KErr` `{code, params}`; kodlar `cam.ir.*`, `cam.post.*`, `cam.sim.*` (metinler `src/i18n/cam-post-*.js`). Boş (`null`) bir post özelliği gerektiğinde `cam.post.prop_missing {prop}` ile durulur.
Kapılar (savunma derinliği, CAM-FIXES V-07): `opts.gates` içinde `block` varsa NC üretilmez (`cam.post.gates_blocked`); `opts.gates` verilmezse `postProgram` statik kapıları (1–4, 6; simülasyonsuz) kendisi çalıştırır, sonucu `gates` alanında döner. `gates: []` = "kapılar çağıranda çalıştı, sorun yok" beyanıdır (testler). Başlığa `(GATES n BLOCK m WARN)` ve her kapı için okunur metin yazılır: `(WARNING: <metin>)` — metin `opts.gateText(g)` (arayüz kendi dilinde verebilir) ya da İngilizce sözlükten (`describe.js`), yorum ASCII'ye çevrilir (Türkçe karakter çıkmaz). 3+1 bölüm varsa `(WARNING A AXIS DIRECTION NOT VERIFIED - CONFIRM ON MACHINE WITH A MARKED PART BEFORE CUTTING)`. `verified` doluysa UNVERIFIED satırı korunur, ardına `(VERIFIED BY .. ON ..)` eklenir.

### Çıktı yapısı (6a, M80V)
Başlık: `O<no>` (program.number varsa) · UNVERIFIED · PROGRAM · DATE · MACHINE (ad, rev, kontrol) · takım listesi `(T H D DIA TÜR)` · kapı özeti · `G90 G17 G21 G40 G49 G80 G94`.
Her işlem: `(OP n: ad)` → güvenli Z geri çekilme (`G90 G40 G49` / `G91 G28 Z0.` / `G90` ya da `G53 G0 Z..`) → `M5`/`M9` (açıksa) → `[M01]` → `T.. M6` (yalnız takım değişince) →
**A indeksleme: `[M11]` → `G0 A..` → `[M10]`** (Z güvenli geri çekilme bunlardan ÖNCE yapılmıştır) → `S.. M3|M4` → `G0 G90 G5x X Y` → `G43 H.. Z..` → soğutma → hareketler.
Bitiş: `(END OF PROGRAM)` → güvenli geri çekilme → A→0 (`aReturnZero`) → `M5` `M9` → `[G05 P0]` → `M30`.
Delik: `G98|G99 G8x X Y Z R [Q|P] F` (ilk nokta), sonraki noktalar yalnız `X Y`, son nokta G98; `G80`. R düzlemi güvenli yüksekliğe eşitse yalnız G98.
Çevrim eşleşmesi: drill/spot → G81 (dwell>0: G82), peck → G83 (Q), chipbreak → G73 (Q), tap → G84 (spindleDir ccw: G74), ream → G85, bore → G89. G76 yok.

## 3. Post özellikleri

Kaynak sütunu: **[D]** spesifikasyonda [Doğrulandı]; **[Ç]** çıkarım/genel kural; **[?]** BİLİNMİYOR (M80V'de `null`; gerekince post durur).
Bu özellikler makine profilinde `post.props` altında saklanır (`machine.post.props`).

| Ad | Anlam | Fanuc varsayılanı | M80V varsayılanı | Kaynak |
| --- | --- | --- | --- | --- |
| `lineNumbers`, `lineNumberStart`, `lineNumberStep` | N satır numarası | false, 10, 10 | aynı | seçenek (CP3) |
| `lineNumberMax` | N üst sınırı; aşılınca başlangıçtan sarar + `cam.post.line_number_wrapped` uyarısı | 99999 | 99999 | [Ç] genel Fanuc kuralı, M80V'de teyit edilmedi |
| `programNumberDigits` | O numarası hane sayısı | 4 | 4 | [Ç] (CP3: biçim bekliyor) |
| `percentLeader` | Dosya başı/sonu `%` | false | false | [Ç] |
| `decimals` | XYZ/IJ ondalık | 3 | 3 | [Ç] (Fusion örnek postları 3 ondalık) |
| `safeRetract` | Güvenli Z geri çekilme yöntemi: `'G28'` (G91 G28 Z0) ya da `'G53'` | `'G28'` | **null** | [?] M80V'de yöntem bilinmiyor |
| `safeRetractZ` | G53 için makine Z | null | **null** | [?] |
| `dwellAddress`, `dwellUnit` | G04 adresi (`P`/`X`) ve birimi (`'ms'`/`'s'`) | `'P'`, `'ms'` | **null**, **null** | M80V [?] (M80 1/2 kılavuz bölüm 8.1-8.2) |
| `cycleDwellAddress`, `cycleDwellUnit` | G82/G89 bekleme adresi (X/Y/Z/R/Q/F olamaz) ve birimi | `'P'`, `'ms'` | **null**, **null** | [?] |
| `coolantCodes` | `{flood,mist,air,through,off}` M kodları | M8, M7, null, null, M9 | M8, **null, null, null**, M9 | flood/off sözleşme lehçesi; diğerleri [?] |
| `optionalStop` | Her işlem başında M01 | false | false | seçenek (CP3) |
| `rapidSplit` | Karışık XY+Z hızlıyı böl (iniş: önce XY sonra Z; çıkış: önce Z sonra XY) | true | true | [Ç] dog-leg önlemi (CP2) |
| `cannedCycles` | false: delik çevrimini açık harekete aç (drill/spot/ream/bore; diğerleri `cam.post.cycle_unsupported`) | true | true | C6 |
| `tapMode` | `'feed'`: F = devir x adım (+`rigidTapM`); `'pitch'`: F = adım | `'feed'` | `'pitch'` | M80V [D] (#8159=1, F=adım) |
| `rigidTapM` | `'feed'` kipinde G84 öncesi `M29 S..` | `'M29'` | null | M80V [D]: M29 gerekmez |
| `tapR1` | G84 satırına `,R1` | false | true | M80V [D] (CP6: post yine ,R1 yazar) |
| `rotaryMode` | `'6a'` NC A ekseni; `'6b'` A yazılmaz, `(INDEX A TO ..)` + `M00` | `'6a'` | `'6a'` | CP7 [Ç] |
| `aReturnZero` | Program sonunda A→0 | true | true | CP7 (satır 10) |
| `aSplit180` | Kısa yol kipinde 180° iki adımda | true | true | M80V makine verisi |
| `g541Range` | `[min,max]` G54.1 Pn | null | **null** | [?] "P aralığı bilinmiyor" |
| `highSpeedOn`, `highSpeedOff` | Örn. `'G05 P10000'` / `'G05 P0'` (ikisi birlikte) | null | null (seçenek) | M80V [D] (mevcut işte kullanılıyor); kontrol III/I bilinmiyor |
| `toolChangeCode` | Takım değişimi | `'M6'` | `'M6'` | sözleşme lehçesi |
| `endCode` | Program sonu | `'M30'` | `'M30'` | sözleşme lehçesi |
| `safeStartExtra` | Güvenli başlangıç satırına ek kelimeler | [] | [] | seçenek |

Makine profilinden gelenler (post özelliği değil): `axes.A.dir` (A'nın fiziksel dönüş yönü; YALNIZ çekirdek çerçevesinde kullanılır: `F = Rot(dir, aAngle)·F0`. **`aAngle` = A kelimesi**; post A'yı işaret çevirmeden yazar, okuyucu `aAngle = A` okur — CAM-FIXES V-01. **dir yoksa** `prop_missing machine.axes.A.dir`). Döner eksenli makinede ilk bölümde A mutlak yazılır (`G0 A0.` dahil; tezgâh A'sı bilinmez — V-02),
`axes.A.limits` (null = sınırsız; dışına çıkan açı `cam.post.a_out_of_limits`), `axes.A.shortest` (kısa yol: açılar 0..359.999 normalize),
`axes.A.clamp {lock, unlock, output}` (`output:false` → M10/M11 yazılmaz; M80V verisi "PLC otomatik yönetiyor"; `output:true` ve kod `null` → durur).

## 4. M80V farkları ve doğrulama durumu

| Konu | Post davranışı | Durum |
| --- | --- | --- |
| Senkron kılavuz | `G84 .. F<adım> ,R1`, `M29` yok, `S` önceden `S.. M3` ile | [D] (forum + makine verisi #8159=1) |
| A kısa yol, sınırsız | `G90 G0 A..` normalize 0..359.999, 180° iki adım | [D] (#8213=1) |
| A freni M10/M11 | profile bağlı, varsayılan yazılmaz | [D] kodlar; yazılsın mı: profil |
| Telafi Tip II | `G41/G42 D<n>` (geometri/aşınma ayrı, yalnız D yazılır) | [D] tip; D numarası takımın `D`si |
| G54.1 Pn | `G54.1 P<n>` | [D] biçim; P aralığı [?] |
| G04 adres/birim | `null` → durur | [?] |
| Güvenli Z yöntemi (G28/G53) | `null` → durur | [?] |
| G05 P10000 / P0 | seçenek | [D] kullanımda; çıktı biçimi test edilmedi |
| TCP, G68.2, G07.1, eşzamanlı 4 eksen | yok | v2/v3 |
| Soğutma mist/air/through | `null` | [?] |

Geri okuyucu ve kapsamı dışındakiler: NC'de karşılığı olmayan alanlar (hareket `kind`, `cycle.top`, takım geometrisi, `opName`) geri okunamaz;
`compareToolpaths` bunları yok sayar; `spot` ve `drill` eşit sayılır (ikisi G81/G82). Okuyucu `G91` yalnız `G91 G28 Z0.` için kabul eder.

## 5. IR'ye post/sim'in eklediği kurallar (A için)

`validateToolpath` şunları da reddeder (hata kodu `cam.ir.*`): ilk hareket hızlı değil ya da Z≠clearanceZ; yol clearanceZ'de bitmiyor; yay başlangıç/bitiş yarıçap farkı > 0,005 mm;
tam daire (başlangıç=bitiş; iki yarım yay yazın); kirişi < 0,001 mm yay (`cam.ir.arc_degenerate`; NC'de tam daireye dönüşür — işlemler böyle yayı doğruya çevirir); `comp` hareketi `tp.comp==='wear'` dışında; comp'tan sonraki ilk hareket `feed kind:'lead'` (doğrusal) değil; comp açıkken hızlı hareket ya da çevrim;
wear'de `tool.D` ya da `compSide` yok; wear ama hiç comp açılmamış; çevrim başlangıç Z'si `clearance`'a eşit değil (G98 başlangıç düzlemi); çevrimde dip < retract <= clearance değil;
kılavuzda `pitch` yok ya da `f ≠ rpm·pitch` (±0,1%); gagalama/talaş kırmada `peck` yok.
`comp` hareketi bir SONRAKİ doğrusal harekete uygulanır: `comp(on)` + `feed(kind:'lead')` → `G41|G42 D<n> G1 ..`; `comp(off)` + `feed(kind:'lead')` → `G40 G1 ..`.
Sıfır uzunluklu feed/hızlı hareket post'ta atlanır ve `cam.post.zero_move` uyarısı verir (doğrulayıcı reddetmez).
Hızlı hareketler `rapidSplit` açıkken NC'de bölünür; simülasyon da aynı bölmeyi kullanır.

## 6. Simülasyon API'si (C arayüz ajanı için kesin imzalar)

```js
import { simulate, createSim, createHeightmap, heightmapFromFn, sampleHeightmap, cloneHeightmap, volumeBetween, heightmapStats, toolGeom } from 'src/cam/sim/index.js';

simulate(input, opts) → { issues, removedVolume, remainHeightmap, remainBySetup, suppressed, moves, samples, frames? }
createSim(input, opts) → sim   // sim.step(n=1) → {done, index, newIssues}; sim.run() → result; sim.state(); sim.heightmap(setupId?); sim.result(); sim.reset(); sim.total; sim.done
```
- `input`: `Program` (bölümleri sırayla; aynı `setup.id` bölümleri stoku paylaşır) ya da `Toolpath`.
- `opts`: `res` (mm/hücre, ZORUNLU), `stockBox {min:[x,y,z], max:[x,y,z]}` (setup uzayı) ya da `stockBoxes {[setupId]: box}`;
  `modelHeightmap` (Heightmap; ya da `modelHeightmaps {[setupId]}`); `stockHeightmap`/`initialHeightmaps` (örn. silindir stok için `heightmapFromFn`);
  `tool` (tüm takımlara birleştirilen ek alanlar) ve `tools {[number]: ek}` (örn. `{shaftDia, holder:{dia,len}, fluteLen, bodyLen}` — IR takımında olmayanlar buradan);
  `step` (örnekleme adımı, varsayılan `res`), `contactTol` (0,001), `gougeTol` (0,01), `belowTol` (0,01), `rapidSplit` (true), `maxIssuesPerCode` (20), `frames: N` (her N harekette ızgara kopyası).
- Heightmap: `{x0, y0, res, nx, ny, data: Float32Array}`; hücre (i,j) merkezi `(x0+(i+.5)res, y0+(j+.5)res)`, `data[j*nx+i]` = üst yükseklik (setup Z). `err` alanı (varsa) oyma toleransına eklenir (z-buffer harita hatası).
- Sorun: `{level:'error'|'warn', code, params:{x,y,z,depth,cells,op}, moveIndex, section}` — `moveIndex` o bölümün `toolpath.moves` indeksi, `section` bölüm indeksi. Kodlar:
  `cam.sim.rapid_in_stock`, `cam.sim.gouge`, `cam.sim.flute_exceeded`, `cam.sim.shaft_collision`, `cam.sim.holder_collision` (hepsi `error` → kapılar `block` yapar), `cam.sim.below_stock` (`error`; yalnız takım yolunun bildirdiği bilinçli pay `toolpath.meta.belowStock` mm içindeyse `warn` — boydan boya delik ya da tabanı model/stok tabanına/seçime negatif ofsetli kontur/cep), `cam.sim.comp_arc_collapse` (`error`).
  Aynı hareket + aynı kod tek kayıt (en kötü konum); kod başına `maxIssuesPerCode`'tan sonrası `suppressed` sayacına gider.
- Hatalar (fırlatılır): `cam.sim.bad_res`, `cam.sim.no_stock`, `cam.sim.tool_geom {field,type}` (uç açısı/köşe yarıçapı/kesme boyu/boy eksik), ve geçersiz IR için `cam.ir.*`.
- `state()` → `{index,total,section,moveIndex,position,removedVolume,issues,suppressed}`; `heightmap()` CANLI diziyi verir (kopya değil; çizim için `Float32Array` doğrudan okunur).
- 3+1: her `setup.id` kendi `stockBox`/`stockBoxes[id]` ile başlangıç stokundan başlar; A'yı yeniden döndürme/çerçeve dönüşümü ÇAĞIRANIN işidir (setup uzayında zaten döndürülmüş stok kutusu verilir).

### Modelleme ve sınırlar
- Tek değerli yükseklik haritası: yalnız +Z'den kesim; alt kesme (undercut), yan yönden (A≠0 aynı setup içinde) kesim, ters yüz YOK. Çıkıntılı stok altı model edilmez.
- Takım: flat/face/tap/reamer/bore düz uç; ball; bullnose (`cornerR`); drill/spot/chamfer konik (`tipAngle`). Şaft = `shaftDia` (varsayılan kesici çapı) `fluteLen`..`bodyLen`; tutucu = `holder.dia` `bodyLen` üstünde. Eksik geometri = hata (varsayılan yok).
- Denetimler: stok tabanından aşağı (`below_stock`; bildirilmiş pay dışında ENGEL: tabla/fikstür modellenmez); tabana kadar kesilmiş hücre (h ≤ taban) boş sayılır (geri çekilme "stok içinde hızlı" sayılmaz); fikstür/mengene/punta çarpışması YOK; takım tutucu yalnız silindir.
- Hızlı hareket denetimi hücre merkezi ve `contactTol` ile; stok yüzeyinde (Z = üst) gezinme sorun değildir.
- Wear telafisi: programlanan yol takım yarıçapı kadar ofsetlenir (doğrusal: normal, yay: r∓R); aşınma farkı 0; teğet olmayan köşe geçişleri düz sweep ile bağlanır (kesişim/yuvarlama yok).
- Delik çevrimi: R'ye hızlı, dibe tek kesme (gagalama aralıkları modellenmez, hacim aynı), G99 ara geçiş R düzleminde hızlı olarak sınanır.
- Hacim doğruluğu: hücre merkezi örnekleme; kenarlar ızgaraya hizalıysa tam, değilse ±(çevre·res/2) mertebesinde. 20x20x5 cep (D6 takım, köşe yuvarlak) için res 0,25'te analitik değerle %2 içinde test edilir.
- Hız: `touch` her örnekte takım ayak izi hücrelerini tarar; yol uzunluğu/`step` × (çap/res)² mertebesi. Büyük işler için `res` büyütün; `frames` bellek yer.

## 7. Testler

`node test/post.test.mjs` (IR doğrulama, 5 örnek için IR→post→altın dosya→reader→IR' ≤0,001 mm, satır eşlemesi, kapılar, seçenekler, reader hataları),
`node test/sim.test.mjs` (bilinen hacimler, uç geometrileri, wear, kasıtlı hatalar, 3+1, adım adım API). Altın dosyalar `test/cam-samples/golden/*.nc`; kasıtlı değişiklikte `node test/post.test.mjs --update`.
Örnek makine profilindeki sayılar (`test/cam-samples/samples.mjs`) TEST değeridir; makine gerçeği değildir.
