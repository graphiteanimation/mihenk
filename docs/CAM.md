# Mihenk CAM çekirdeği (Ajan A) — API, sınırlar, testler

Sözleşme: `docs/CAM-DESIGN.md` (v0.3). Post/simülasyon: `docs/POST.md` (Ajan B). Bu dosya çekirdek bölümüdür.
Tüm çekirdek saf JS'tir (`src/cam/**`, DOM/three/Electron yok). Hatalar `CamErr` (= `KErr`) `{code, params}`; kodlar `cam.*`;
metinler `src/i18n/cam-core-tr.js` / `cam-core-en.js` (`'err.' + code`). Uyarı/kapı nesneleri `{level, code, params, opId?, section?}`.

## 1. Modüller ve kesin imzalar

```js
import { resolveSetup, computeOp, gates, buildProgram, generateProgram, CamErr } from 'src/cam/index.js';
import { BUILTIN_MACHINES, builtinMachines, machineById, copyMachine, checkMachine, assertMachine, axisTravel } from 'src/cam/machines/builtin.js';
import { TOOL_TYPES, normalizeTool, applyPreset, irTool, tipLength, toolListIssues, exportLibrary, importLibrary, LIB_FORMAT } from 'src/cam/tools.js';
```

### Kernel/worker komutları (`src/kernel/cam.js`; worker `cmd` adları aynı; son `rebuild` sonucuna göre)
| cmd | args | sonuç |
| --- | --- | --- |
| `camFaceLoops` | `{ref, frame}` | `{ z, normalOk, outer:[seg], inners:[[seg]], open, above:[[seg]]|null, aboveDz, body }` |
| `camSection` | `{body, frame, z}` | `{ z, loops:[[seg]] }` (malzeme gidiş yönünün solunda; dış CCW) |
| `camZLevels` | `{body, frame}` | `{ levels:[z] (eksene dik düzlem yüzlerin z'leri), prismatic, bad, badBoxes:[[x0,y0,x1,y1]] }` |
| `camHeightmap` | `{bodies:[id], frame, res, bbox:[x0,y0,x1,y1]}` | `{ x0, y0, res, nx, ny, data:Float32Array, err }` — B'nin Heightmap biçimi (hücre MERKEZİ); boş hücre `-Infinity` |

- `frame = {o, x, y, z}` model uzayında (birim, dik); setup koordinatı `q = [ (p−o)·x, (p−o)·y, (p−o)·z ]`. Her zaman `resolveSetup(...).frame` verin.
- `seg` = geom2d `line`/`arc` (kanonik, yay CCW) + `fwd` (gidiş kanonik yönde mi) + `open` (açık kenar) + `edge` (kenar dizini). Dış döngü CCW, iç döngüler CW (yüz solda). Çizgi/yay olmayan kenarlar ≤ 0,005 mm kirişe bölünür.
- `open`: kenarı paylaşan komşu yüz bu yüzün z'sinin 1e-4 mm üstüne çıkmıyorsa açık. `above`: açık kenar varsa gövdenin `z + 0,01` kesiti (cep açık-kenar uzatması bununla denetlenir).
- Hatalar: `cam.face_not_flat` (düzlem değil / takım eksenine dik değil), `cam.frame_bad`, `cam.loop_open`, `cam.body_missing`, `cam.section_failed`, `cam.heightmap_bad`, `cam.heightmap_too_big` (4 M hücre), `cam.mesh_failed`, `cam.no_model`.

### `resolveSetup(setup, rebuildResult, machine, opts?) → S`
```
S = { id, name, bodies, workOffset, frame:{o,x,y,z} (A açısında ETKİN çerçeve, model uzayı), frame0 (A=0), aAngle|null,
      stock:{kind:'box'|'cyl',…}, stockBox:{min,max} (setup uzayı), modelBBox:{min,max} (setup uzayı, görüntü ağından),
      clearance (setup.clearanceZ), stockTop, machinePos|null }
```
- `setup.frame.zAxis/xAxis`: `{kind:'base', dir:'+X'|…|'-Z'}` ya da `{kind:'face', ref, flip?}` → `opts.planes = {z?: facePlane(ref), x?: …}` (worker `facePlane` sonucu; `{n}` alanı kullanılır). Verilmezse `cam.setup.face_axis_unresolved`.
- `frame.origin`: `{kind:'stockCorner', corner:'x-y-z+'}` (varsayılan) | `{kind:'stockTopCenter'}` | `{kind:'model'}` (dünya orijini) | `{kind:'point', p:[x,y,z]}` (model uzayı).
- `stock`: `{kind:'boxOffset', side, top, bottom}` | `{kind:'box', min, max}` (setup eksenlerinde, dünya orijinli; modeli içermeli) | `{kind:'cyl', dia, len, axis:'X'}` (eksen setup X'i ve orijinden geçer; orijin `point`/`model` olmalı).
- 3+1: `setup.rotary = {enabled:true, aAngle}`; makinede `axes.A` (about 'X') yoksa `cam.setup.no_rotary`. `aAngle` = NC A kelimesi (CAM-DESIGN v0.3.1). Etkin çerçeve `F = Rot(A.dir, aAngle)·F0 = Rx(φ)·F0`, `φ = aAngle · sign(A.dir[0])` — işaret YALNIZ burada; post A'yı aAngle olarak yazar (M80V: dir [-1,0,0] → φ = −aAngle). Takım yolu koordinatları bu etkin WCS'dedir. Kutu stok döndürülünce köşe kutusu (muhafazakâr).
- `workOffset`: `{kind:'G54'..'G59'}` | `{kind:'G54.1', p}`.

### `computeOp(op, ctx) → Toolpath | throw CamErr`
`ctx = { setup: S, tool: (doc.cam.tools öğesi), geom, machine }`. `geom`:
- `face`: gerekmez. `drill`: `{holes: rebuild.holes}` ya da `{points:[{p:[x,y,z]}]}` (`holes.kind:'points'`).
- `contour`/`pocket`: `{faces:[camFaceLoops sonucu]}` — `op.geom[i]` ile aynı sırada. Kontur ayrıca `op.geom[i] = {kind:'chain'}` + `geom.items[i] = {segs:[geom2d+fwd], closed, z}` (setup uzayına çevrilmiş sketch zinciri; çeviri çağıranın işi) kabul eder.

Ortak alanlar (eksik → `cam.op.missing {field}`; geçersiz → `cam.op.bad_field`): `rpm, feedCut, feedPlunge, feedRamp?, coolant`,
`heights:{clearance (stok üstünden mm), retract (stok üstünden, ≤ clearance), top:{from:'stockTop'|'modelTop'|'selection'|'abs', off}, bottom:{from:'selection'|'modelBottom'|'stockBottom'|'modelTop'|'abs', off}}`
(`abs`: `off` mutlak z). Varsayılan top/bottom: face `stockTop`/`modelTop`; kontur/cep `stockTop`/`selection`.
- **face**: `stepover (< çap), stepdown?, stockToLeave?, direction (derece), extend`. Silindir stokta `cam.face.needs_box_stock`.
- **drill**: `holes:{kind:'feature', filter?:{dia?, feature?}}`, `cycle`, `depth:{from:'hole'|'abs', tipComp, breakThrough?, z? (abs)}`, `peck?`, `dwell? (s)`, `order:'asis'|'shortest'`. R düzlemi = delik üstü + `heights.retract`.
- **contour**: sözleşmedeki alanlar. `ramp` yalnız `plunge`/`ramp` (helix → `cam.op.unsupported`). Açık zincir yalnız `side:'on'`.
- **chamfer** (WP-06 T-03): seçim `contour` ile aynı (yüz/eskiz/siluet döngüsü, `kind:'chain'` zinciri). **Seçilen kenar pahın ÜST kenarıdır** (CAD modelde pah varsa üst yüzün sınırı); pah buradan malzeme dışına (delikte boşluğa) `width` kadar yatay, `width/tan(tipAngle/2)` kadar aşağı iner (90° takımda 45°). Alanlar: `width` (zorunlu, mm), `tipClearance?` (takım ucunun pahın alt köşesinin altına inme payı, varsayılan 0,2), `side?` (`outside`/`inside`; zincirde `left`/`right` zorunlu), `dir`, zincirde `extendStart/End`. Takım `chamfer` ya da `spot` olmalı (`tipAngle`, `tipDia?` = uç düz çapı). Takım merkezi seçilen kenardan `tipDia/2 + (dz + tipClearance)·tan(tipAngle/2)` uzakta TEK z'de gezer (z = kenar − dz − pay); konik yaricap bu mesafeden küçükse `cam.chamfer.tool_small`. Telafi yalnız bilgisayar (G41/G42 yok), giriş/çıkış ve köprü yok. Kenar stok üstünün üstündeyse `cam.chamfer.above_stock`. Sim: model pahı içermeli (CAD pah özelliği); düz blok modelde pah `cam.sim.gouge` verir.
- **pocket**: sözleşmedeki alanlar + `finishPass:true` ise **`finishStock` zorunlu** (kaba pasoların bitirme için bıraktığı yanal pay; varsayılan uydurulmaz). `entry.helixDia` = takım MERKEZİ helis çapı (helix'te zorunlu); `entry.angle` (0–45°) helix/ramp'ta zorunlu. `predrill` → `cam.op.unsupported`.

Toolpath = IR (`src/cam/ir.js validateToolpath`'ten geçer) + ek alanlar: `warnings:[{code,params}]`, `meta:{stockTop, topZ, bottomZ, passDepth, …}`; dalma hareketlerinde `clear:true` (bu işlemde boşaltılmış bölgeye iniş — kapı 4 için).

### `gates(program, machine, opts?) → [{level:'block'|'warn', code, params, opId?, section?, moveIndex?}]`
`opts.sim`: `false`/yok → `cam.gate.sim_not_run` uyarısı; nesne → `simulate(program, {stockBoxes (bölüm setup'larından), ...opts.sim})` (B) çalışır, `error` → `block`. `opts.sim` örneği: `{ res: 0.5, modelHeightmaps: {[setupId]: camHeightmap sonucu}, tools: {[T]: {shaftDia, holder}} }`.
Toolpath uyarıları da `warn` olarak eklenir. `blocked(list)` (gates.js) yardımcı.

### `buildProgram({name, number?, machine, sections:[{setup:S, toolpaths:[tp]}]}) → Program` (validateProgram'dan geçer; bölüm `setup` = `{id,name,workOffset,aAngle,stockBox,machinePos}`)
### `resolveGeom(op, S, {rebuild, doc, query}) → Promise<{sels, faces}>`
Seçimleri yüz nesnelerine çözer (sıra korunur; bir sketch seçimi birden çok bölge verebilir, `sels` buna göre genişler — `computeOp`'a `{...op, geom: sels}` ve `geom.faces = faces` verin):
- `{kind:'face', ref, loops?}` → `camFaceLoops`.
- `{kind:'sketch', sketch, profiles, loops?}` → `doc.features` içindeki sketch + `rebuild.sketches[id].plane`; `findRegions` + `resolveProfiles` (sayısal ya da `{ents,hint}`); bölge dışı CCW, delikleri iç döngü/ada; z = sketch düzlemi. Düzlem takım eksenine dik değilse `cam.geom.sketch_not_perpendicular`; normal −Z ise ayna doğru uygulanır. Çizgi/yay/daire dışı eğri (elips, spline) → `cam.geom.unsupported_curve`. Kayıp profil → `cam.geom.sketch_profile_lost`.
- `{kind:'silhouette', body, loops?}` → `camZLevels` + ardışık seviyelerin ortasında `camSection`; her kesitte tek dış sınır (`cam.silhouette.multiple`), kesitler iç içe (`cam.silhouette.not_nested`), en geniş dış sınır alınır, z = gövde tabanı. Eksene dik/paralel düzlem ve eksene paralel silindir dışındaki yüzler yalnız XY kutuları dış sınırın kesin içindeyse (ör. delik ucu konisi) kabul edilir; aksi `cam.silhouette.not_prismatic` (ör. eğik duvar, dış pah/yuvarlatma, yatay silindir).

### `generateProgram(cam, {rebuild, machine, query, doc?, name, number?, sim?, onlyOps?}) → Promise<{program|null, ops:[{opId,setupId,ok,error?,toolpath?}], gates, blocked}>`
`query(cmd, args)` → worker çağrısı (`facePlane`, `camFaceLoops`, `camSection`, `camZLevels`). `doc` sketch seçimleri için gerekir. Hesaplanamayan işlem `ops[].error` + `cam.gate.op_failed` (block).

Örnek:
```js
const S = resolveSetup(doc.cam.setups[0], rebuildResult, machine);
const fl = await worker.call('camFaceLoops', { ref: floorRef, frame: S.frame });
const tp = computeOp(op, { setup: S, tool: doc.cam.tools.find((t) => t.id === op.toolId), geom: { faces: [fl] }, machine });
const program = buildProgram({ name: 'O1000', machine, sections: [{ setup: S, toolpaths: [tp] }] });
const g = gates(program, machine, { sim: { res: 0.5 } });
if (!g.some((x) => x.level === 'block')) postProgram(program, machine, { gates: g });  // B
```

### Makine ve takım
- `checkMachine(m) → {errors, missing}`; `missing` = post/kapılar için gerekli `null` alanlar (kurslar, `spindle.maxRpm`, `feed.maxCut`) → kapı 1 block.
- Yerleşik şablonlar: `nameKey` (`cam.machine.neway`, `cam.machine.generic3`) arayüzde çevrilir; `protected.noteKey` = "makine projesinden teyit edin".
- `normalizeTool(t)` doğrular ve normalleştirilmiş kopya döner (ball: cornerR = dia/2). `importLibrary(text) → {tools, errors:[{index,code,params}]}`; `exportLibrary(tools) → string`.

## 2. Algoritmalar
- **Ofset (`src/cam/geom/path2d.js`)**: yönlü çizgi/yay parçaları. Ham ofset (her parçanın ofseti + boşluk köşesinde köşe merkezli |d| yayı) → tüm ham parçalar karşılıklı kesişimlerde bölünür → her parça 3 noktada ORİJİNAL sınıra uzaklıkla süzülür (≥ |d| − 1e-7·ölçek ve doğru taraf) → kalanlar kapalı halkalara zincirlenir. Kendi kendini kesen ofset bu yolla temizlenir; dar boğazda bölgeler ayrılır; adalar aynı hesaba girer. Zincir kapanmazsa `cam.geom.offset_failed` (tahmin yok).
- **Cep**: halkalar her seviyede orijinal sınırdan `d_k = r + yanal pay (+ finishStock) + k·stepover` (birikimli hata yok); halka ağacı (dar boğazda dallanır); yapraklarda sınırdan en uzak nokta (ızgara + yerel iyileştirme) son halkadan 0,9r'den uzaksa ek halka. Kesim içten dışa; bağlantı: çocuktan ebeveyne en yakın noktaya doğru (disk savı: iç noktadan en yakın sınır noktasına doğru parça bölge içindedir), aynı seviyede halkalar arası bağlantı izinli bölge sınırını kesmiyorsa doğrudan, kesiyorsa geri çekilip yeniden giriş (rampa/dalma). Helis: yaprağın en derin noktasında, `D(c) ≥ d0 + helixDia/2` değilse `cam.pocket.helix_no_fit`. Açık kenar: sanal dış sınır açık parçaları `W = 2r + yanal pay` dışarı taşır (komşu taşıyıcılarla kesiştirilir); uzatma bandı `above` kesitine değerse `cam.pocket.open_edge_blocked`. Tabanda aşağı inen (tüm kenarları açık) iç döngü ada sayılmaz. Kalan malzeme: örnekleme ile (h ≈ r/8) yaklaşık alan → `cam.pocket.rest_material` uyarısı (keskin iç köşeler doğal olarak kalır).
- **Kontur**: kesin bölge ofseti (dışarı: −d, içeri: +d). Tırmanma = malzeme sağda. Giriş/çıkış yayı 90°, takım tarafında; giriş/çıkışın her noktası `r + pay` kuralıyla denetlenir. Köprü: son derinlik(ler)de `width + takım çapı` boyunca köprü yüksekliğine çıkış. Wear: programlanan yol = parça konturu + yanal pay; takım tarafında yarıçapı ≤ r yay varsa hata (kontrol alarmı önlemi).
- **Yüzey**: zikzak; hat aralığı ≤ stepover (< çap), ilk/son hat stok kenarında, uçlar stok dışında `r + extend`; dalmalar stok dışında.
- **Delme**: `holes[]` setup uzayına; eksen −Z'ye paralel değilse atlanır (uyarı). R = delik üstü + retract. Aynı üst/dip ve R ≥ stok üstü olan noktalar tek çevrim (G99 ara geçişi stok üstünde); aksi her nokta ayrı çevrim. Çevrim başlangıç (clearance) düzlemi = max(stok üstü + retract, tüm R). Boydan boya: model tabanı + breakThrough (uyarı). Kılavuz: F = devir × hatve.
- **Bağlama**: yatay hızlı hareket yalnız retract (stok üstü + retract > stok üstü) ya da clearance düzleminde; uzak geçiş (> max(20 mm, 10·çap)) clearance'tan. İniş: ilk konumda clearance'tan retract'a (stok üstü + retract) HIZLI inilir (WP-06 T-01; eskiden clearance'tan ilerlemeyle inilir, havada kesme olurdu), retract'tan hedefe ilerlemeyle (`kind:'plunge'`; bu işlemde boşaltılmış bölgeye iniş `clear:true`). Sim `rapid_in_stock` yeni hızlı inişi de denetler.
- **Açık kenar tespiti (çekirdek)**: kenara oturan komşu yüz üçgenlerinin üçüncü köşesi taban z'sinin 1e-4 mm üstünde değilse açık; üçgen bulunamazsa komşu yüzün tamamının en yüksek noktası (muhafazakâr: kapalı sayar).

## 3. Sınırlar (bu sürüm)
- Sketch seçimi yalnız kapalı bölgeler (açık sketch zinciri için `{kind:'chain'}` + `geom.items`, çeviri çağıranda). Silhouette yalnız prizmatik dış sınır (yukarıdaki kural); alt kesme/eğik duvarlı gövdede açık hata. Kontur `ramp.kind:'helix'`, cep `entry:'predrill'` → `cam.op.unsupported`.
- **Açık zincir (WP-06 T-02):** `op.geom[i] = {kind:'chain', sketch, ents:[kimlik…], reverse?}` (yalnız kontur; `resolveGeom` eskiz çizgi/yay/daire ögelerini uç uca zincirler: `cam.geom.chain_broken/chain_empty/chain_ent_missing`; zincir yönü ilk listelenen ögenin serbest ucundan, `reverse` çevirir; `z` = eskiz düzlemi). `side`: `on` (merkez zincirde) | `left` | `right` (zincir yönüne göre takım tarafı; yol = zincirin r + `stockToLeave.radial` ofseti). `extendStart`/`extendEnd` (mm): zincir uçlarına teğet düz uzatma (giriş/çıkış payı; ofset uzatılmış zincire uygulanır). `comp:'wear'` yalnız `left/right` ile: G41/G42, uzatmalar > takım yarıçapı (dogrusal giriş/çıkış, `lead` hareketi), yol zincirin kendisi (+ radial pay yok). Giriş/çıkış (`leadIn/Out`), köprü açık zincirde yok (`cam.contour.open_options`). `dir` açık zincirde etkisizdir (yön zincirin yönüdür).
- `stockToLeave`: sayı `n` (= `{radial:n, axial:n}`; face yalnız eksenel kullanır) ya da `{radial, axial}` (WP-06 T-10). Takım: `tipDia` (uç düz çapı, drill/spot/chamfer; 0 ≤ tipDia < dia), `shaftDia`; ikisi de IR takımında taşınır, yoksa `cam.gate.tool_geom_assumed` uyarısı.
- Eski kural (referans): açık zincir kontur yalnız `side:'on'` (giriş/çıkış, köprü, wear yok). Aşınma telafisinde kaba yanal paso, rampa, bölünen kontur desteklenmez (hata).
- Bir cep işleminin taban yüzleri aynı z'de olmalı. Kontur da seçimden taban/üst alırken farklı z'deki profilleri reddeder (`cam.contour.faces_differ_z`, V-19). Kendini kesen sınır `cam.geom.self_intersect` (V-17). Kirişi < 0,001 mm yay doğru olarak yazılır (V-05). Neredeyse doğrusal kırıkta ofset sarkan yapay uçları atar (yalnız `2·sqrt(d·dtol)` altı; daha uzunu hata, V-15). Takım yolu `meta.belowStock` = stok tabanı altına bilinçli iniş payı (boydan boya delik; tabanı model/stok tabanına ya da seçime negatif ofsetli kontur/cep — en çok ofset kadar); başka her stok tabanı altı iniş simülasyonda engel (V-12). Cepte her derinlik aynı XY halkalarını kullanır (2,5D; eğimli duvar yok).
- Kenar/yüz eğrileri: çizgi ve takım eksenine dik daire tam; diğerleri ≤ 0,005 mm kirişe bölünür.
- Kalan malzeme alanı örnekleme tahminidir (uyarı amaçlı). Uzak/yakın geçiş eşiği sabittir (makineye özel değil).
- `resolveSetup` model kutusunu görüntü ağı köşelerinden hesaplar (ağ toleransı kadar yaklaşık; boxOffset stoku için).
- Kapı 3: makine konumu (`setup.machinePos`) modeli yok → mutlak kurs denetimi yapılamaz, yalnız yol açıklığı (uyarı `cam.gate.travel_abs_unchecked`).
- Kapı 4 (CAM-FIXES V-09/V-10/V-27): kesmeyen uçlu takımda hareket TÜRÜNE değil geometriye bakılır — stok ayak izi içinde, stok üstünün altına inen XY'siz her ilerleme (`clear` işaretli boşaltılmış iniş hariç) ve her delme çevrimi (drill/spot/peck/chipbreak; kılavuz/rayba/bara önceden delinmiş deliğe girdiği için hariç) → `cam.gate.plunge_center`; XY'li iniş (rampa/helis) açısı takımın `maxRampAngle` (derece, isteğe bağlı takım alanı) değerini aşarsa `cam.gate.ramp_center`, alan yoksa `cam.gate.ramp_no_limit` (block; tahmin yok). Kapı 5 = B'nin `simulate` (yalnız +Z tek değerli harita; fikstür yok): model haritası olmayan setup `cam.gate.sim_no_model` (block), `res` > en küçük takım yarıçapı `cam.gate.sim_res_coarse` (block), yanal oyma görünürlük sınırı `cam.gate.sim_lateral_tol` (uyarı, res/2). Devir S0'a yuvarlanıyorsa `cam.gate.rpm_low` (block). 3+1 bölüm varsa `cam.gate.a_dir_unverified` (uyarı). Korunan WCS karşılaştırması boşluk/büyük-küçük harf bağımsız.

## 4. Sözleşmeden sapmalar / ekler
- `camFaceLoops` parçaları geom2d'ye ek `fwd` ve `edge` alanı taşır (yay kanonik CCW olduğundan gidiş yönü için gerekli); sonuçta ek `open`, `above`, `aboveDz`, `body`.
- `camHeightmap` sonucu B'nin Heightmap biçimindedir (`data`, hücre merkezi, `err`) — sözleşmedeki "Float32Array" bununla uyumlu.
- Toolpath ek alanları: `warnings`, `meta`, dalmada `clear`. IR doğrulaması (B) bunları yok sayar.
- Cep `finishPass` için `finishStock` zorunlu; helis için `entry.helixDia` (takım merkezi çapı) ve `entry.angle` zorunlu (varsayılan uydurulmadı).
- Yükseklikler: `clearance`/`retract` stok üstünden mm; `abs` için `off` mutlak z; drill `depth.z` (abs).
- Wear (sözleşme metnine göre): programlanan yol = parça konturu + yanal pay; kontrol D değerindeki TAM yarıçapı uygular (Fusion'daki "in control" anlamı). B'nin simülasyonu da böyle modelliyor. Makinede D'ye ne yazılacağı (yarıçap mı, yalnız aşınma mı) makine projesinde teyit edilmeli.
- Yerleşik Neway şablonu: `toolChange.maxTools: null` (tabloda magazin kapasitesi yok; "24 cep dolu, T1–T25 kayıtlı"), korunan WCS yalnız G54/G56 (G58 4. eksen işinin kullandığı ofset; koordinatör düzeltmesi aaeedc3); `post.props` docs/POST.md adlarıyla, bilinmeyenler `null`.

## 5. Testler
`node test/cam.test.mjs` → 141 geçti, 0 kaldı (≈7 s). Kapsam: ofset doğruluğu (her nokta sınırdan tam d, hata < 1e-9), L şekli, dış ofset yayları; makine/takım/kütüphane; yüzey kapsaması ve stok dışı dalma; delme gruplama/uç telafisi/kılavuz F; kontur (tam r+pay, ihlal yok, tırmanma yönü, iç köşe uyarısı, takım sığmıyor, giriş çarpması, köprü, wear G41, kaba pasolar, rampa, açık zincir); cep (ihlal yok, kapsama ≤ köşe kalıntısı + örnekleme payı, adalar, dar boğazda ayrılma, açık kenar taşması ve engel hatası, helis sığmıyor, dalma reddi, bitirme); kapılar (T/H/D/WCS/G54.1, eksik makine/H/D, devir, ilerleme, kurs, magazin, dalma, kesici boyu, gövde boyu, A sınırı, A yok, sim bağlı + kasıtlı stok içi hızlı); setup (kutu/köşe, 3+1 A işareti, silindir), şema, metin anahtarları; çekirdekli uçtan uca (blok + cep + ada + açık basamak + delikler → rebuild → camFaceLoops/camSection/camHeightmap → generateProgram → kapılar + B simülasyonu (oyma dahil) temiz → B postu G83 NC); silhouette kontur (tam r+pay, gövde dışında) ve sketch cebi (yüz cebiyle aynı sınırlar) uçtan uca sim temiz; dik olmayan/aynalı sketch, prizmatik olmayan gövde hataları).
Diğer: `node test/kernel.test.mjs` 104/0, `node test/security.test.mjs` 70/0, `node test/i18n.test.mjs` 27/0 (temiz HEAD ağacında; çalışma ağacındaki C'nin yarım tr.js değişikliğiyle `cam-ui-tr.js` eksik olduğu için o an çalışmıyordu).
