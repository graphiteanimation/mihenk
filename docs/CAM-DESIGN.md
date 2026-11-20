# Mihenk CAM — tasarım sözleşmesi (v0.3, 2026-11-11) — BAĞLAYICI

DESIGN.md (v0.2 eki dahil: i18n, güvenlik, kalite kuralları) aynen geçerlidir. Depo kökü: `/home/claude/restore`.
Spesifikasyon (salt okunur başvuru): `/mnt/user-data/uploads/Fusion-Klon-Spec/Fusion-Klon-Spesifikasyonu.md`
(C1–C4, C6, C8, C10, C11, CP1–CP8 ve "Makine verisi" tablosu). Hedef görünüm: `design/mockups/05-imalat-cam.html`, UI-SPEC "CAM çalışma alanı iskeleti".

## İlkeler (K-017, K-019, K-021)
- Ya doğru sonuç ya açık hata (`KErr`-tarzı `{code, params}`); sessiz yanlış yok. Desteklenmeyen geometri = hata, tahmin yok.
- Makine bağımsız: makineye/kontrole özel HİÇBİR değer koda gömülmez; hepsi makine profili + post özelliklerinden gelir.
- CAM çekirdeği (`src/cam/**`) saf JS'tir: DOM, three.js, Electron YOK; Node'da test edilir. Yeni npm bağımlılığı YOK.
- `eval`/`new Function` yok (CSP). Postlar depo içi ES modülleridir (O-006'nın giriş fonksiyonu adlarıyla); kullanıcı post betiği yükleme bu sürümde YOK (ileride yalıtılmış yorumlayıcı).
- Post çıktısı her zaman "DOĞRULANMADI" başlıklıdır; makinede ilk doğrulama makine projesindedir (K-004). Uygulama G-code'u makine kurallarına göre denetlemez; yalnız kendi iç tutarlılığını (geri okuma + stok simülasyonu) sınar.

## Belge modeli (`doc.cam`, isteğe bağlı; yoksa CAM boş)
```
doc.cam = { machineId, tools:[Tool], setups:[Setup], verified?:{by,date,note,hash}|null }
Tool  = { id, number(T), lengthOffset(H), diaOffset(D), type:'flat'|'ball'|'bullnose'|'drill'|'spot'|'tap'|'chamfer'|'face'|'reamer'|'bore',
          dia, cornerR?, tipAngle?, fluteLen, bodyLen(tutucudan çıkan boy), shaftDia?, flutes, centerCutting:bool, pitch?(tap),
          holder?:{dia,len}, material?, note?,
          presets:[{name, rpm, feedCut, feedPlunge, feedRamp?, stepdown?, stepover?, coolant:'flood'|'mist'|'air'|'through'|'off'}] }
Setup = { id, name, bodies:[bodyId],
          frame:{ origin:{kind:'model'|'stockCorner'|'stockTopCenter'|'point', ...}, zAxis:{kind:'base',dir:'+X'|'-X'|'+Y'|'-Y'|'+Z'|'-Z'}|{kind:'face',ref}, xAxis:{...aynı}, },
          rotary?:{ enabled, aAngle(derece) },      // 3+1: çerçeve A=0 içindir; orijin döner eksen ÜZERİNDE, X = döner eksen. İşlemler A=aAngle'da koşar.
          //   aAngle TANIMI (v0.3.1, CAM-FIXES V-01): NC'ye yazılan A KELİMESİDİR (kısa yol normalizasyonundan önce). Fiziksel dönüş:
          //   parça, makine profilindeki axes.A.dir etrafında sağ el kuralıyla aAngle kadar döner → etkin çerçeve F = Rot(A.dir, aAngle)·F0.
          //   A.dir işareti YALNIZ bu çerçevede (resolveSetup) uygulanır; post A'yı aAngle olarak yazar, okuyucu A'yı aAngle olarak okur, A sınırları aAngle'a uygulanır.
          //   A yönü (dir) tezgâhta işaretli parçayla teyit edilmeden NC'ye güvenilmez: NC başlığında ve kapılarda (cam.gate.a_dir_unverified) uyarı kalır.
          workOffset:{kind:'G54'..'G59'|'G54.1', p?},
          stock:{kind:'boxOffset', side, top, bottom} | {kind:'box', min:[x,y,z], max:[x,y,z]} | {kind:'cyl', dia, len, axis:'X'} ,
          clearanceZ(stok üstünden; hızlı hareket düzlemi), ops:[Op] }
Op ortak = { id, type, name, toolId, preset?:ad, rpm, feedCut, feedPlunge, feedRamp?, coolant, suppressed?,
             heights:{clearance, retract, top:{from:'stockTop'|'modelTop'|'selection'|'abs', off}, bottom:{from:'selection'|'modelBottom'|'stockBottom'|'abs', off}} }
face    { stepover, stepdown?, stockToLeave?, direction:açı, extend }
contour { geom:[GeomSel], side:'outside'|'inside'|'on'(GeomSel'e göre otomatik varsayılan), dir:'climb'|'conv', stepdown, finishStepdown?, roughPasses?:{n,stepover},
          stockToLeave:{radial,axial}, comp:'computer'|'wear', leadIn:{kind:'arc'|'line'|'none', r|len}, leadOut:{…}, tabs?:{n,width,height}, ramp?:{kind:'plunge'|'ramp'|'helix', angle} }
pocket  { geom:[GeomSel], stepover, stepdown, finishStepdown?, stockToLeave:{radial,axial}, dir, entry:{kind:'helix'|'ramp'|'plunge'|'predrill', angle, helixDia?}, finishPass:bool }
drill   { holes:{kind:'feature', filter?:{dia?,feature?}} | {kind:'points', sketch, ents}, cycle:'drill'|'spot'|'peck'|'chipbreak'|'tap'|'ream'|'bore',
          depth:{from:'hole'|'abs', tipComp:bool, breakThrough?}, peck?, dwell?, order:'asis'|'shortest' }
GeomSel = {kind:'face', ref:Ref, loops:'outer'|'inner'|'all'} | {kind:'sketch', sketch:id, profiles:[seçim (profiles.js selectionFor)]} | {kind:'silhouette', body:id}
```
`src/shared/schema.js` doc.cam'i de doğrular (tür, sınır). Eski belgeler (cam yok) aynen açılır.

## Makine profili (uygulama ayarı; belgeye gömülmez, belge `machineId` taşır)
```
Machine = { id, name, rev, builtin?:bool, control:'mitsubishi-m80v'|'fanuc-generic'|…(post kimliği),
  axes:{ X:{min,max}|{travel}, Y, Z, A?:{kind:'rotary', about:'X', dir:[-1,0,0], limits:null|[min,max], shortest:bool, rapid, feedMax, clamp:{lock:'M10',unlock:'M11',output:false} }, B?, C? },
  spindle:{maxRpm, minRpm}, feed:{maxCut, rapid}, toolChange:{maxTools, kind:'random'|'fixed', pos?}, 
  protected:{ T:[..], H:[..], D:[..], wcs:['G54',..] },          // O-004/O-014 dokunulmaz liste; kullanıcı düzenler
  post:{ props:{…post özellikleri varsayılanları} } }
```
Yerleşik şablonlar (`src/cam/machines/builtin.js`): yalnız genel şablonlar — "Genel 3 eksen (Fanuc tarzı)", "Genel 3+1 (A eksenli, Fanuc tarzı)", "Genel 3 eksen (Mitsubishi tarzı)"; sayısal değerler `null`, korunan liste boş. **K-026: yerleşik yalnız genel şablonlar; tezgâh profilleri kullanıcı verisidir, dosyadan içe aktarılır** (`src/cam/machines/io.js`: `exportMachines`/`importMachines`, biçim `{format:'mihenk-machine', version:1, machines:[…]}`; her profil `checkMachine` ile doğrulanır, `builtin`/`nameKey` atılır, kimlik çakışırsa yeni kimlik + " (2)", güvenilmeyen JSON: boyut/derinlik/sayı sınırı ve `__proto__`/`constructor`/`prototype` reddi). Neway VM1160H profili arşiv dosyasıdır (`pm/arsiv/Neway-VM1160H-M80V-GSA.mhnk-tezgah.json`; `ornekler/tezgahlar/` altından WP-10 düzeltmesiyle taşındı, kurulum paketine girmez) ve test sabitidir (`test/fixtures/machine-neway.mjs`). Eski belgelerdeki `builtin-neway-vm1160h-m80v-gsa` kimliği kullanıcı profili `user-neway-vm1160h-m80v-gsa` varsa ona eşlenir, yoksa "tezgâh bulunamadı" yolu çalışır. Kullanıcı profili kopyalar/düzenler/yeni ekler (4/5 eksen alanları şemada var; 5 eksen işlemleri yok).
Saklama: `native.getSetting/setSetting('machines')`, tarayıcıda localStorage. Takım kütüphanesi de aynı yolla (`'toolLibrary'`), JSON içe/dışa aktarılır; belgedeki `cam.tools` kopyadır (dosya kendi kendine yeter).

## Çekirdek API'si (`src/cam/index.js`, saf)
```js
resolveSetup(setup, rebuildResult, machine) → { frame:{o,x,y,z} (model uzayı), stockBox (setup uzayı), modelBBox, aAngle }
computeOp(op, ctx) → Toolpath | throw CamErr          // ctx = { setup:resolved, tool, geom: çözülmüş geometri, machine }
gates(program, machine) → [{level:'block'|'warn', code, params, opId?}]
```
Geometri worker'dan gelir (yeni komutlar, `src/kernel`): 
- `camFaceLoops {ref, frame}` → `{ z, normalOk, outer:[seg], inners:[[seg]] }` setup uzayında; seg = geom2d `line`/`arc` (diğer eğriler ≤0,005 mm kiriş hatasıyla çizgilere bölünür); her seg `open:bool` taşır (komşu yüz bu yüzün üstüne yükselmiyorsa açık kenar). Yüz takım eksenine dik düzlem değilse `KErr('cam.face_not_flat')`.
- `camSection {body, frame, z}` → setup uzayında z'deki kesit döngüleri (silhouette/kontur için) — aynı seg biçimi.
- `camHeightmap {bodies, frame, res, bbox}` → takım ekseni boyunca model üst yükseklik haritası (Float32Array; üçgen ağdan z-buffer). Simülasyonun oyma (gouge) denetimi bunu kullanır.
- Delikler: `rebuild` sonucundaki `holes[]` (O-008); ekseni takım eksenine paralel olmayan delik o setup'ta listelenmez.

## Takım yolu ara gösterimi (IR) — A (çekirdek) ile B (post/simülasyon) arasındaki TEK arayüz
```
Toolpath = { opId, opName, opType, tool:{number,H,D,type,dia,cornerR,tipAngle,fluteLen,bodyLen,centerCutting,pitch},
             rpm, spindleDir:'cw'|'ccw', coolant, comp:'computer'|'wear', compSide?:'left'|'right',
             clearanceZ, retractZ, moves:[Move], stats:{cutLen, rapidLen, timeMin, zMin, bbox} }
Move = {t:'rapid', x,y,z}
     | {t:'feed',  x,y,z, f, kind:'cut'|'plunge'|'ramp'|'lead'}
     | {t:'arc',   x,y,z, i,j, dir:'cw'|'ccw', f, kind}          // XY düzlemi; i,j merkez (başlangıca göre artımlı); z değişirse helis; tam daire = iki yarım yay
     | {t:'cycle', cycle:'drill'|'spot'|'peck'|'chipbreak'|'tap'|'ream'|'bore', points:[[x,y],…], top, bottom, retract, clearance, peck?, dwell?(s), pitch?, f}
     | {t:'dwell', s}
     | {t:'comp', on:bool}                                        // wear telafisi aç/kapa (yalnız doğrusal lead üzerinde)
Program = { name, number?, machine, units:'mm', sections:[{ setup:{id,name,workOffset,aAngle|null}, toolpath:Toolpath }], }
```
Koordinatlar setup WCS'sinde, mm; x/y/z her harekette TAM yazılır (modal sıkıştırma postun işi). `src/cam/ir.js`: `validateToolpath(tp)` (NaN/eksik alan/bilinmeyen tür → hata), `mk` yardımcıları, `pathBBox`. İlk hareket her zaman clearanceZ'de hızlıdır; yol clearanceZ'de biter.

## İşlem kuralları (MVP)
- Yüzey: zikzak, stok dikdörtgeni + extend; son paso yüzey Z'sinde. Kontur: kapalı/açık zincir, takım yarıçapı kadar ofset (geom2d.offsetChain; kendi kendini kesen ofset temizlenir; iç köşe yarıçapı < takım yarıçapı ise kalan malzeme uyarısı), çok derinlik, kaba pasolar, yay/çizgi giriş-çıkış, köprü (tab), wear telafisinde programlanan yol = parça konturu + zorunlu doğrusal giriş. Cep: kontur-paralel ofset halkaları (adalar dahil; dar boğazda bölgeler ayrılır; ulaşılamayan alan uyarı), helis/rampa/dalma girişi (giriş sığmıyorsa hata; dalma yalnız centerCutting takımda), açık kenarda takım dışarı taşar; bitirme pasosu. Delme: `holes[]` + takım çapı eşleşme denetimi (uyuşmazlık uyarı), uç telafisi, çevrim türleri; kılavuzda pitch zorunlu, rpm·pitch = ilerleme.
- Bağlama: aynı işlem içinde yakın geçişte retract, uzak geçişte clearance; hızlı hareket ASLA stok içinde yatay gitmez.

## Güvenlik kapıları (`gates`; 'block' varken NC üretilmez, hangi işlem olduğu gösterilir)
1. Eksik veri: takım no/H (ve wear'de D), rpm, ilerlemeler, iş sıfırı, makine profilinde post için gerekli alanlar (kurslar, maxRpm…) `null` ise → block (`cam.gate.missing`).
2. Dokunulmaz numara: T/H/D/WCS `machine.protected` içindeyse → block (`cam.gate.protected`, numara + işlem).
3. Sınırlar: rpm > maxRpm, ilerleme > max, yol zarfı (X/Y/Z açıklığı) > kurs → block; setup'ta makine konumu verilmediyse mutlak kurs denetimi "yapılamadı" uyarısı.
4. Dalma: kesmeyen uçla (centerCutting=false) malzemeye düz dalma, kesici boydan (fluteLen) derin tek paso, bodyLen'den derin iniş → block.
5. Simülasyon (`src/cam/sim`): stok yükseklik haritası (dexel, çözünürlük ayarlı); hızlı hareket stok içine girerse → block; takım model yüzeyinin altına toleranstan (0,01 + harita hatası) fazla inerse (oyma) → block; tutucu/şaft stok ya da modele değerse → block; kalan malzeme haritası raporlanır. 3+1: her A açısı kendi çerçevesinde, başlangıç stokuyla (tutucu yönden güvenli) sınanır.
6. Döner eksen: A hareketinden önce Z güvenli geri çekilme sırası postta zorunlu; aAngle makine limitleri dışındaysa block. Döner eksenli makinede ilk bölümde A mutlak yazılır (tezgâh A'sı bilinmez); A yönü doğrulanmadı uyarısı.
Sonuç nesnesi kullanıcıya gösterilir ve NC başlığına özet yazılır.

## Post motoru (`src/cam/post/`)
- `engine.js`: Fusion giriş fonksiyonu adlarıyla olay akışı — `onOpen, onSection, onRapid, onLinear, onCircular, onCycle, onCyclePoint, onCycleEnd, onDwell, onSpindleSpeed, onCommand, onComment, onSectionEnd, onClose`; yardımcılar `createFormat, createVariable (modal), createModal, writeBlock, writeComment`, post özellikleri (`props`), satır numarası seçeneği. Çıktı: metin + satır→(section, move) eşlemesi.
- `fanuc-base.js` (ortak Fanuc tarzı çekirdek) → `mitsubishi-m80v.js` (türeyen; farklar spesifikasyon CP6/CP7 ve "Makine verisi"nden: G84 senkron F=adım mantığı, G05 P10000 seçenekli, A ekseni kısa yol/işaret `dir`, M10/M11 seçenekli, G54.1 Pn, G04 adres/birimi POST ÖZELLİĞİ — bilinmeyen değer için varsayılan koyma: özellik `null` ise ve o özellik gerekiyorsa post `cam.post.prop_missing` ile durur).
- Yorumlar yalnız ASCII (Türkçe karakter dönüştürülür). İlk yorum satırı: `(UNVERIFIED POST - DOGRULANMADI - MIHENK x.y.z)`; ardından program adı, tarih, makine profili adı+rev, takım listesi (T/H/D/çap), kapı özeti. `doc.cam.verified` yalnız kullanıcı eylemiyle dolar; doluyken bile NC başlığındaki satır kalır, yalnız "VERIFIED BY … ON …" eklenir.
- Güvenli başlangıç/bitiş blokları, takım değişimi, G43 H, iş sıfırı, 3+1'de: Z güvenli geri çekilme → (M11) → A konumlama → (M10) sırası; delik çevrimleri G81/G82/G83/G73/G84/G85/G76-yok; G98/G99; yay I/J (R değil), tam daire iki yarım; helis G2/G3 + Z.
- `reader.js` (geri okuyucu): motorun ürettiği lehçeyi (G0/1/2/3, G17, G90, G54…/G54.1, G43/G49, G40/41/42, G80–G85, G98/99, G04, G28/G53, A, M3/4/5/6/8/9/30, T/S/F/H/D) IR hareketlerine geri çözer. Test: her örnek için `IR → post → reader → IR'` karşılaştırması (biçim hassasiyeti 0,001 mm) + geri okunan yol simülasyondan geçer. Tanımadığı kelimede hata verir (sessiz atlama yok).

## Dosya sahipliği
- **A (çekirdek)**: `src/cam/{index,ops/**,geom/**,tools,machines/**,gates,program}.js`, `src/kernel/**` içine `cam*` komutları, `src/shared/schema.js` (cam bölümü), `test/cam.test.mjs`, `docs/CAM.md` çekirdek bölümü.
- **B (post+sim)**: `src/cam/ir.js` (İLK İŞ; hemen commit), `src/cam/post/**`, `src/cam/sim/**`, `test/post.test.mjs`, `test/sim.test.mjs`, `test/cam-samples/**` (IR örnekleri + beklenen NC), `docs/POST.md`.
- **C (arayüz; A ve B'den SONRA)**: `src/ui/cam/**`, app.js/chrome.js/panels.js/viewport.js eklemeleri, i18n anahtarları (`cam.*`, `err.cam.*`), Electron `saveFile kind:'nc'`, `test/cam-ui.test.py`.
- i18n: A ve B hata kodlarının TR/EN metinlerini `src/i18n/cam-{tr,en}.js` taslak dosyalarına (A: `cam-core-*.js`, B: `cam-post-*.js`) yazar; C bunları sözlüğe bağlar. `test/i18n.test.mjs` bozulmamalı.
- Git: yalnız kendi dosyaların `git add <yollar>`; `git add -A` YOK (paralel ajan var). Küçük, sık commit (oturum her an kesilebilir; commit edilmeyen iş kaybolur). `index.lock` hatasında 2 sn bekleyip yinele. Push yok.

## Rapor biçimi (her ajan, son mesaj ≤ 25 satır)
Yapılan · test sayıları (komut + geçen/kalan) · doğrulanamayan/eksik kalan · sözleşmeden sapma ve nedeni · C ajanının bilmesi gereken API notları. Ayrıntı docs/ altındaki dosyaya.
