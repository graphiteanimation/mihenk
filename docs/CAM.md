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

## 2. Algoritmalar ve sınırlar
(Testler bölümüyle birlikte sonda güncellenir.)
