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
- 3+1: `setup.rotary = {enabled:true, aAngle}`; makinede `axes.A` (about 'X') yoksa `cam.setup.no_rotary`. Etkin çerçeve `F = Rx(φ)·F0`, `φ = aAngle · sign(A.dir[0])` (M80V: dir [-1,0,0] → φ = −aAngle). Takım yolu koordinatları bu etkin WCS'dedir. Kutu stok döndürülünce köşe kutusu (muhafazakâr).
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
- **pocket**: sözleşmedeki alanlar + `finishPass:true` ise **`finishStock` zorunlu** (kaba pasoların bitirme için bıraktığı yanal pay; varsayılan uydurulmaz). `entry.helixDia` = takım MERKEZİ helis çapı (helix'te zorunlu); `entry.angle` (0–45°) helix/ramp'ta zorunlu. `predrill` → `cam.op.unsupported`.

Toolpath = IR (`src/cam/ir.js validateToolpath`'ten geçer) + ek alanlar: `warnings:[{code,params}]`, `meta:{stockTop, topZ, bottomZ, passDepth, …}`; dalma hareketlerinde `clear:true` (bu işlemde boşaltılmış bölgeye iniş — kapı 4 için).

### `gates(program, machine, opts?) → [{level:'block'|'warn', code, params, opId?, section?, moveIndex?}]`
`opts.sim`: `false`/yok → `cam.gate.sim_not_run` uyarısı; nesne → `simulate(program, {stockBoxes (bölüm setup'larından), ...opts.sim})` (B) çalışır, `error` → `block`. `opts.sim` örneği: `{ res: 0.5, modelHeightmaps: {[setupId]: camHeightmap sonucu}, tools: {[T]: {shaftDia, holder}} }`.
Toolpath uyarıları da `warn` olarak eklenir. `blocked(list)` (gates.js) yardımcı.

### `buildProgram({name, number?, machine, sections:[{setup:S, toolpaths:[tp]}]}) → Program` (validateProgram'dan geçer; bölüm `setup` = `{id,name,workOffset,aAngle,stockBox,machinePos}`)
### `generateProgram(cam, {rebuild, machine, query, name, number?, sim?, onlyOps?}) → Promise<{program|null, ops:[{opId,setupId,ok,error?,toolpath?}], gates, blocked}>`
`query(cmd, args)` → worker çağrısı (`facePlane`, `camFaceLoops`). Hesaplanamayan işlem `ops[].error` + `cam.gate.op_failed` (block).

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
- **Bağlama**: yatay hızlı hareket yalnız retract (stok üstü + retract > stok üstü) ya da clearance düzleminde; uzak geçiş (> max(20 mm, 10·çap)) clearance'tan. İniş daima ilerlemeyle (`kind:'plunge'`; bu işlemde boşaltılmış bölgeye iniş `clear:true`).
- **Açık kenar tespiti (çekirdek)**: kenara oturan komşu yüz üçgenlerinin üçüncü köşesi taban z'sinin 1e-4 mm üstünde değilse açık; üçgen bulunamazsa komşu yüzün tamamının en yüksek noktası (muhafazakâr: kapalı sayar).

## 3. Sınırlar (bu sürüm)
- Sketch/silhouette GeomSel `generateProgram` içinde desteklenmez (`cam.geom.sel_unsupported`); `computeOp` setup uzayına çevrilmiş zinciri `{kind:'chain'}` ile kabul eder (çeviri C'de). Kontur `ramp.kind:'helix'`, cep `entry:'predrill'` → `cam.op.unsupported`.
- Açık zincir kontur yalnız `side:'on'` (giriş/çıkış, köprü, wear yok). Aşınma telafisinde kaba yanal paso, rampa, bölünen kontur desteklenmez (hata).
- Bir cep işleminin taban yüzleri aynı z'de olmalı. Cepte her derinlik aynı XY halkalarını kullanır (2,5D; eğimli duvar yok).
- Kenar/yüz eğrileri: çizgi ve takım eksenine dik daire tam; diğerleri ≤ 0,005 mm kirişe bölünür.
- Kalan malzeme alanı örnekleme tahminidir (uyarı amaçlı). Uzak/yakın geçiş eşiği sabittir (makineye özel değil).
- `resolveSetup` model kutusunu görüntü ağı köşelerinden hesaplar (ağ toleransı kadar yaklaşık; boxOffset stoku için).
- Kapı 3: makine konumu (`setup.machinePos`) modeli yok → mutlak kurs denetimi yapılamaz, yalnız yol açıklığı (uyarı `cam.gate.travel_abs_unchecked`).
- Kapı 4 dalma denetimi: kesmeyen uçla, stok ayak izi içinde, stok üstünün altına inen ve `clear` işaretsiz dikey ilerleme + her çevrim. Kapı 5 = B'nin `simulate` (yalnız +Z tek değerli harita; fikstür yok).

## 4. Sözleşmeden sapmalar / ekler
- `camFaceLoops` parçaları geom2d'ye ek `fwd` ve `edge` alanı taşır (yay kanonik CCW olduğundan gidiş yönü için gerekli); sonuçta ek `open`, `above`, `aboveDz`, `body`.
- `camHeightmap` sonucu B'nin Heightmap biçimindedir (`data`, hücre merkezi, `err`) — sözleşmedeki "Float32Array" bununla uyumlu.
- Toolpath ek alanları: `warnings`, `meta`, dalmada `clear`. IR doğrulaması (B) bunları yok sayar.
- Cep `finishPass` için `finishStock` zorunlu; helis için `entry.helixDia` (takım merkezi çapı) ve `entry.angle` zorunlu (varsayılan uydurulmadı).
- Yükseklikler: `clearance`/`retract` stok üstünden mm; `abs` için `off` mutlak z; drill `depth.z` (abs).
- Wear (sözleşme metnine göre): programlanan yol = parça konturu + yanal pay; kontrol D değerindeki TAM yarıçapı uygular (Fusion'daki "in control" anlamı). B'nin simülasyonu da böyle modelliyor. Makinede D'ye ne yazılacağı (yarıçap mı, yalnız aşınma mı) makine projesinde teyit edilmeli.
- Yerleşik Neway şablonu: `toolChange.maxTools: null` (tabloda magazin kapasitesi yok; "24 cep dolu, T1–T25 kayıtlı"), korunan WCS listesine "4. eksen işi G58" de eklendi; `post.props` docs/POST.md adlarıyla, bilinmeyenler `null`.

## 5. Testler
`node test/cam.test.mjs` → 136 geçti, 0 kaldı (≈7 s). Kapsam: ofset doğruluğu (her nokta sınırdan tam d, hata < 1e-9), L şekli, dış ofset yayları; makine/takım/kütüphane; yüzey kapsaması ve stok dışı dalma; delme gruplama/uç telafisi/kılavuz F; kontur (tam r+pay, ihlal yok, tırmanma yönü, iç köşe uyarısı, takım sığmıyor, giriş çarpması, köprü, wear G41, kaba pasolar, rampa, açık zincir); cep (ihlal yok, kapsama ≤ köşe kalıntısı + örnekleme payı, adalar, dar boğazda ayrılma, açık kenar taşması ve engel hatası, helis sığmıyor, dalma reddi, bitirme); kapılar (T/H/D/WCS/G54.1, eksik makine/H/D, devir, ilerleme, kurs, magazin, dalma, kesici boyu, gövde boyu, A sınırı, A yok, sim bağlı + kasıtlı stok içi hızlı); setup (kutu/köşe, 3+1 A işareti, silindir), şema, metin anahtarları; çekirdekli uçtan uca (blok + cep + ada + açık basamak + delikler → rebuild → camFaceLoops/camSection/camHeightmap → generateProgram → kapılar + B simülasyonu (oyma dahil) temiz → B postu G83 NC).
Diğer: `node test/kernel.test.mjs` 104/0, `node test/security.test.mjs` 70/0, `node test/i18n.test.mjs` 27/0 (temiz HEAD ağacında; çalışma ağacındaki C'nin yarım tr.js değişikliğiyle `cam-ui-tr.js` eksik olduğu için o an çalışmıyordu).
