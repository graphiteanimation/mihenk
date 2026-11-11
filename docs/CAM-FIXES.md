# CAM-FIXES — CAM-VERIFY bulgularının teyidi ve düzeltmeleri (2026-11-11)

Kapsam: `docs/CAM-VERIFY.md` V-01…V-30. Her bulgu betik + kod okunarak teyit edildi. `test/verify/` betikleri DEĞİŞTİRİLMEDİ.
Hedef makine Neway VM1160H + M80V; bu çalışmada üretilen hiçbir NC makineye gönderilmek için değildir ("DOĞRULANMADI" başlığı korunur).
Commit'ler: `efd4ff2` (post/IR/sim), `7ed6ebc` (kapılar/işlemler/arayüz post-sim akışı), belgeler.

Önceki çıktı = düzeltme öncesi betik satırı; sonraki = düzeltme sonrası. "Betik durur" = betik, düzeltmenin artık açık hata verdiği girdide yakalanmamış istisnayla duruyor (betik hata bekleyip yakalamıyor). Bu durumda betiğin kalanı `test/tmp/vh/` altındaki (git'e girmeyen) kopyada, yalnız o çağrı `try` içine alınarak koşuldu; sonuçlar aşağıda o kopyadan.

## Özet

| ID | Durum | Ana değişiklik | Regresyon testi |
| --- | --- | --- | --- |
| V-01 | düzeltildi | post A'yı işaretsiz yazar; işaret yalnız çerçevede | post 8. bölüm, cam 7. bölüm (dir ±1 × A 30/90/270 fizik) |
| V-02 | düzeltildi | döner eksenli makinede ilk bölümde `G0 A..` mutlak | post 8 + altın dosyalar |
| V-04 | düzeltildi | `onSection`'da F sıfırlanır; okuyucu F'yi bölümler arası taşımaz | post 8 |
| V-05 | düzeltildi | IR kiriş < 0,001 mm yayı reddeder; Builder doğruya çevirir; post tam daireye dönüşen yayı doğru/hata yapar | post 8, cam 6 |
| V-05b | düzeltildi | okuyucu bitişsiz G2/G3'te `read_full_circle` | post 8 |
| V-06 | düzeltildi | kapı 5: model haritası yok → block; arayüz notu block | cam 6 |
| V-07 | düzeltildi | `postProgram` block'ta durur; kapı listesi yoksa statik kapıları kendisi koşar | post 8 |
| V-08 | düzeltildi | korunan WCS karşılaştırması boşluk/harf normalize | cam 6 |
| V-09 | düzeltildi | köprü inişi `plunge`; kapı 4 geometriye bakar | cam 6 |
| V-10 | düzeltildi | takım `maxRampAngle`; kesmeyen uçta rampa/helis kapısı | cam 6 |
| V-11 | düzeltildi | kapı: res > en küçük takım yarıçapı → block; arayüz res'i takım yarıçapına bağlar | cam 6 |
| V-12 | düzeltildi | `below_stock` error; yalnız bildirilmiş boydan boya pay uyarı | sim 2(g) |
| V-13 | düzeltildi | sim: h ≤ taban hücre boş | sim 2(g) |
| V-15 | düzeltildi | ofsette yapay sarkan uç/halka atılır (boy sınırlı) | cam 6 |
| V-17 | düzeltildi | kendini kesen sınır → `cam.geom.self_intersect` | cam 6 |
| V-18 | yanlış alarm (betik "temiz") | — | — |
| V-19 | düzeltildi | farklı z'li profiller → `cam.contour.faces_differ_z` | cam 6 |
| V-20 | düzeltildi | biçimde bilimsel gösterim → `bad_number` | post 8 |
| V-21 | kısmen düzeltildi | O0 / haneyi aşan no → `program_number`; 8000/9000 ertelendi | post 8 |
| V-22 | düzeltildi | `lineNumberMax` (99999) aşılınca sarar + uyarı | post 8 |
| V-23 | düzeltildi | F = yazılan S × adım | post 8 |
| V-23b | düzeltildi | S0 → kapı `rpm_low` + post `bad_rpm` | post 8, cam 6 |
| V-24 | ertelendi | sınır kapıda açık uyarı (`sim_lateral_tol`) | cam 6 |
| V-25 | düzeltildi (yapısal) | okuyucu aAngle = A kelimesi; fizik bağımsız testte | post 8, cam 7 |
| V-27 | düzeltildi (yeni) | kapı 4 kılavuz/rayba/bara çevrimini engellemez | cam 6 |
| V-28 | ertelendi | (uyarı zaten var) | — |
| V-29 | ertelendi | incelenmedi | — |
| V-30 | yanlış alarm | — | — |
| NC başlığı ham kod | düzeltildi | `describe.js`; `(WARNING: <okunur metin>)`, ASCII | post 8 |

Test sayıları (son koşu): `i18n` 27/0, `security` 71/0, `kernel` 104/0, `cam` 166/0 (önce 141), `post` 170/0 (önce 148), `sim` 61/0 (önce 58).

## Ayrıntı

### V-01 — A işareti iki kez uygulanıyordu (Kritik) — TEYİT
Kod: `resolveSetup` çerçeveyi `Rx(aAngle·sign(dir))` = `Rot(dir, aAngle)` kuruyordu (fiziksel olarak "A kelimesi = aAngle" ile tutarlı); post ayrıca `A = sign·aAngle` yazıyordu → dir=[−1,0,0]'da çerçeve A=aAngle'ı, NC ise A=−aAngle'ı varsayıyordu. Karar: **`aAngle` = A kelimesi** (CAM-DESIGN.md v0.3.1, POST.md, CAM.md'de tanımlandı). İşaret yalnız çerçevede; post (`fanuc-base.js _indexRotary`) ve okuyucu (`reader.js makeSection`) işaret çevirmez. Kapı 6'nın A sınırı ve arayüz alanının sınır uyarısı zaten aAngle'a bakıyordu, artık post ile tutarlı. NC başlığında `(WARNING A AXIS DIRECTION NOT VERIFIED - CONFIRM ON MACHINE WITH A MARKED PART BEFORE CUTTING)`, kapılarda `cam.gate.a_dir_unverified` (uyarı).
Önceki: `BULGU V-01: A.dir=[-1,0,0] aAngle=90: NC A=270 … (fark 11.662 mm)` (3 satır). Sonraki: `temiz V-01: … NC A=90 … (fark 0.000 mm)` (5/5 temiz). Altın `indexed_3plus1.nc`: A270→A90, 180° bölmesi 0 yerine 180 üzerinden (A90, A180, A270) — meşru değişim.

### V-02 — İlk bölümde A yazılmıyordu (Yüksek) — TEYİT
`state.aCur` artık `null` (bilinmiyor); ilk indekslemede A her zaman mutlak yazılır (M11/M10 kuralıyla, Z güvenli geri çekilmeden sonra, G43'ten önce). 6b'de ilk döner bölümde indeks talimatı + M00. Bütün altın dosyalara `M11 / G0 A0. / M10` eklendi (test makinesinde A var) — meşru.
Önceki: `BULGU V-02: … A kelimesi HIC yok`. Sonraki: `BULGU V-02: … A kelimesi satir 18`. **Betik hâlâ BULGU yazıyor, yanlış pozitif**: betik "ilk konumlanma" satırını `/G1|G0 G90/` ile arıyor; bu, güvenli başlangıç satırındaki `G17`'yi de eşliyor (satır 9). A'yı bu satırdan önceye almak Z güvenli geri çekilmeden önce A döndürmek olurdu (sözleşme ihlali). Doğru sıra `post.test` 8'de sınandı (G0 A0. < G43).

### V-04 — F bölümler arası modal (Orta) — TEYİT
`onSection`'da `v.f.reset()`; okuyucu G28/G53 bölüm sınırında `S.f = null` (F'siz ilk kesme okuyucuda hata). Önceki: `BULGU V-04: … "G1 Z-1." — F yok`. Sonraki: `temiz V-04: … "G1 Z-1. F500."` (v04: 0 bulgu).

### V-05 / V-05b — Dejenere yay tam daire olur (Yüksek/Düşük) — TEYİT
`ir.js`: `ARC_MIN_CHORD = 0.001`; kiriş < 0,001 mm → `cam.ir.arc_degenerate`. `ops/common.js Builder.seg`: böyle yayı doğru yazar (sehim < kiriş/2). `fanuc-base.js onCircular`: biçimlenmiş bitiş = başlangıç ise sehim < yarım birim → G1 + `arc_as_line` uyarısı, değilse `arc_degenerate` hatası (decimals < 3 için ağ). `reader.js`: G2/G3 + I/J ve X/Y yoksa `read_full_circle`; hareketsiz satırda I/J `read_unknown_word`.
Önceki: `BULGU V-05 … "G2 I0. J-5. F500."`, `BULGU V-05b …`. Sonraki: **betik durur** (`validateToolpath` → `cam.ir.arc_degenerate`; betik bu IR'nin geçerli olduğunu varsayıyor). Kopyada: `(a) IR reddetti: cam.ir.arc_degenerate`, `temiz V-05c`, `temiz V-15 … basarili`.

### V-06 — Model haritası yokken oyma denetimi sessizce kapalı (Yüksek) — TEYİT
`gates.js`: `opts.sim` nesnesi varken model haritası olmayan her setup için `cam.gate.sim_no_model` (block). `src/ui/cam/ops.js simOpts`: `camHeightmap` hatası artık `block` notu (metin TR+EN güncellendi). Önceki: `BULGU V-06: … BLOCK []`. Sonraki: `temiz V-06: … BLOCK ["cam.gate.sim_no_model"]`.

### V-07 — postProgram kapı uygulamıyordu (Orta) — TEYİT
`post/index.js`: `validateProgram` → kapı listesi yoksa `gates(program, machine, {sim:false})` → block varsa `cam.post.gates_blocked`; sonuç `gates` alanında döner. `gates: []` açık beyandır (testler). Önceki: `BULGU V-07 … "T1 M6"… true`. Sonraki: `temiz V-07 … S99999 iceriyor: false`.
Yan etki: betikler `postProgram`'ı kapısız çağırıyor; post artık statik kapıları koştuğu için V-27 ortaya çıktı.

### V-08 — Korunan WCS yazım farkı (Orta) — TEYİT
`gates.js wcsKey`: boşluksuz + büyük harf. Önceki: `BULGU V-08 … (kapilar: yok)`. Sonraki: `temiz V-08 … (kapilar: cam.gate.protected)`.

### V-09 / V-10 — Kesmeyen uç: köprü inişi ve rampa (Yüksek/Orta) — TEYİT
`ops/contour.js`: köprü sonu inişi `kind:'plunge'` (döngü başına dönüş `clear:true`). `gates.js` kapı 4: stok ayak izi içinde stok üstü altına inen XY'siz her ilerleme (clear hariç) dalma; XY'li iniş açısı `tool.maxRampAngle`'ı aşarsa `cam.gate.ramp_center`, alan yoksa `cam.gate.ramp_no_limit` (block). `tools.js`: `maxRampAngle` (0–90°, isteğe bağlı) doğrulanır ve IR takımına taşınır (şema bilinmeyen alanları zaten geçirir).
Önceki: `BULGU V-09: … 4 dikey asagi 'cut'`, `BULGU V-10: … kapi engeli yok (-)`. Sonraki: `temiz V-09: … 0 dikey asagi 'cut'`, `temiz V-10: … (cam.gate.ramp_no_limit)`.
**Açık (arayüz ajanına)**: takım düzenleyicide `maxRampAngle` alanı yok; kesmeyen uçlu takımla rampa/helis şu an daima engellenir.

### V-11 — Sim çözünürlüğü takımdan kaba (Orta) — TEYİT
`gates.js`: `res` > en küçük takım yarıçapı → `cam.gate.sim_res_coarse` (block). `ops.js simRes(Ss, program)`: res ≤ min(alan tabanlı değer, en küçük takım yarıçapı); hücre sayısı aşılırsa çekirdek `heightmap_too_big` → V-06 engeli. Önceki/sonraki: `BULGU V-11: … res 1.3 -> KACIRILDI` **değişmedi**: betik `simulate()`'i eski arayüz formülüyle doğrudan çağırıyor (kapıyı ve yeni arayüz formülünü atlıyor); simülasyon ilkeli çözünürlükle sınırlıdır. Kapı ve arayüz düzeltmesi `cam.test` 6'da sınandı.

### V-12 / V-13 — Stok tabanı (Orta) — TEYİT
`sim/index.js`: `below_stock` = error; `toolpath.meta.belowStock` (mm) payı içindeyse warn. Pay: delmede boydan boya delik (`drill.js`), kontur/cepte taban `modelBottom`/`stockBottom`/`selection` + negatif ofset ise en çok |ofset| (`ops/common.js belowStockAllow`); `abs` taban payı 0. V-13: `touch()` içinde `h <= zFloor` hücre atlanır. Mevcut uçtan uca test (siluet kontur, seçim −0,5) payla geçiyor.
Önceki: `BULGU V-12: … warn,…`, `BULGU V-13: … cam.sim.rapid_in_stock`. Sonraki: `temiz V-12: … block,… BLOCK cam.sim.gouge,cam.sim.below_stock`, `temiz V-13: … kapilar cam.gate.sim_no_model` (betik model haritası vermediği için V-06 engeli; `rapid_in_stock` yok).

### V-15 — Neredeyse doğrusal kırıkta ofset hatası (Düşük) — TEYİT
Neden: iki ofset çizgisi çok küçük açıyla kesişiyor, kesişim ötesindeki ~1e-4 mm uçlar uzaklık süzgecinden ~1e-8 farkla geçiyor; zincir sarkan uçtan başlayınca kapanmıyor, ya da bu iki uç tolerans içinde tek parçalık yapay halka oluşturuyor. `path2d.js offsetRegions`: `pruneDangling` (yalnız boyu ≤ `2·sqrt(d·dtol)+ctol` olan, ucu bağlanmayan parçalar) + bu boyun altındaki halkalar atılır; daha uzun sarkan parça gerçek hatadır, `offset_failed` kalır. (Yön notundaki "yakın-doğrusal birleştirme" geometriyi 1 µm değiştireceği için seçilmedi.) Test: sonuç tek bölge, her nokta sınırdan tam 5 mm (hata 3,6e-15).
Önceki: `BULGU V-15: … cam.geom.offset_failed`. Sonraki (kopya, betik V-05'te durduğu için): `temiz V-15: … basarili`.

### V-17 — Kendini kesen sınır (Orta) — TEYİT
`path2d.selfIntersects` (x-süpürmeli; komşu parçalarda ortak uç hariç) → `loopFromKernel`'de `cam.geom.self_intersect`. Önceki: `BULGU V-17: … cep YOL, kontur cam.geom.offset_failed`. Sonraki: `temiz V-17: … cep cam.geom.self_intersect, kontur cam.geom.self_intersect`.

### V-18 — YANLIŞ ALARM
Betik çıktısı önce de sonra da `temiz`: CW verilen dış döngüde kontur parçaya girmiyor (0 örnek). Değişiklik yok.

### V-19 — Kontur, farklı z'li profiller (Yüksek) — TEYİT
`contour.js`: taban ya da üst `selection` iken profillerin z'leri farklıysa `cam.contour.faces_differ_z {z1,z2}`. Önceki: `BULGU V-19: … 15.0 mm altina iner`. Sonraki (kopya): satır `HATA cam.contour.faces_differ_z`, bulgu satırı üretilmiyor.

### V-20 — Bilimsel gösterim (Düşük) — TEYİT
`engine.js createFormat`: `toFixed` sonucu 'e' içerirse `cam.post.bad_number`. Önceki: `BULGU V-20: … X1e+21.`. Sonraki: `temiz V-20: … HATA cam.post.bad_number`.

### V-21 — Program numarası (Düşük) — KISMEN TEYİT
O0 geçersiz (teyit). 4 haneyi aşan no: `programNumberDigits` bir dolgu genişliğiydi; aşılınca artık `cam.post.program_number` (8 haneli O isteyen makine `programNumberDigits`'i artırır). 8000/9000 korumalı aralık makine parametresine bağlı → **ertelendi** (makine projesi).
Önceki: `BULGU V-21: … O0000, O12345, O9000`. Sonraki: **betik durur** (`cam.post.program_number`, O0'da). Kopyada: `BULGU V-21: … HATA cam.post.program_number, HATA cam.post.program_number, O9000` (betik koşulu `length > 5` hata metnini de bulgu sayıyor; kalan gerçek kısım O9000).

### V-22 — N üst sınırı (Düşük) — TEYİT (genel kural)
`engine.js writeBlock`: `lineNumberMax` (Fanuc varsayılanı 99999, M80V'de teyit edilmedi) aşılınca başlangıçtan sarar + `cam.post.line_number_wrapped` uyarısı (Fusion postlarının davranışı; N yalnız etiket). Önceki: `BULGU V-22: … son N=110180`. Sonraki (kopya): `temiz V-22: … son N=99990`.

### V-23 / V-23b — Kılavuz F ve S0 (Orta) — TEYİT
`fanuc-base.js`: 'feed' kipinde `F = round(rpm) × adım`; `onSpindleSpeed` S < 1 → `cam.post.bad_rpm`; `gates.js` round(rpm) < 1 → `cam.gate.rpm_low {min:1}`. Önceki: `BULGU V-23: … F416.75 (F/S = 1.25150)`, `BULGU V-23b: … "S0 M3"`. Sonraki (kopya): `temiz V-23: … F416.25 (F/S = 1.25000)`, `rpm 0.4: HATA cam.post.gates_blocked`, `temiz V-23b`.

### V-24 — Yanal oyma çözünürlük sınırı (Orta) — TEYİT, ERTELENDİ
Hücre merkezi örneklemesinin doğal sınırı (res/2). Düzeltme alt-hücre ya da analitik duvar denetimi ister (simülasyon tasarımı). Bu çalışmada: kapı 5 her sim koşusunda `cam.gate.sim_lateral_tol {tol: res/2}` uyarısı yazar (sessiz değil). Duvar doğruluğu takım yolu hesabının bağımsız denetimleriyle (v03, v10, toolpath.verify) sınanıyor. Betik çıktısı değişmedi (`BULGU V-24`, `BULGU V-24-ui`).

### V-25 — Okuyucu totolojisi (Düşük) — TEYİT (yapısal)
Okuyucu artık `aAngle = A` (işaret yok); fiziksel tutarlılık `cam.test` 7'de bağımsız Rodrigues formülüyle (dir ±1 × A 30/90/270) sınanıyor. Betikte bu satır sabit `true` yazıldığından çıktı değişmez (`BULGU V-25`, metin artık eski kodu anlatıyor).

### V-27 — YENİ: kapı 4 kılavuz/rayba/bara çevrimini engelliyordu (Orta) — TEYİT
V-07 sonrası post statik kapıları koşunca v04 `cam.post.gates_blocked (cam.gate.plunge_center, kilavuz)` ile durdu. Kapı 4 kesmeyen uçlu takımın HER çevrimini dalma sayıyordu; kılavuz/rayba/bara önceden delinmiş deliğe girer. Düzeltme: yalnız drill/spot/peck/chipbreak. Önceki: v04 durur. Sonraki: v04 `0 bulgu / 6 denetim`.

### V-28 / V-29 — Cep kapsaması ve yön (Orta/Düşük) — ERTELENDİ
`toolpath.verify.mjs 21` (aynı tohum): önce (220'lik koşunun ilk 21 durumu) ve sonra cep FAIL satırları birebir aynı; sonraki koşu toplam 771 geçti / 27 kaldı, 27'nin tamamı V-28/V-29 (iç konturda 4 yön satırı dahil); r+pay ihlali yok.
V-28 teyit: bağımsız denemede (60×40 cep, d2) so 1,2 ve 1,5'te köşe bölgesi tam işleniyor; so 1,87'de 62/10201 nokta işlenmemiş, cep `cam.pocket.rest_material {area:3.36}` + `cam.pocket.unreachable` uyarısı veriyor (sessiz değil). Köşe temizleme hareketi bu çalışmada yapılmadı. V-29 incelenmedi.

### V-30 (v03 `contour_fresh_plunge`) — YANLIŞ ALARM
Rampasız konturda giriş noktasında dikey dalma sözleşme gereğidir (`ramp.kind:'plunge'`, merkezden kesen takım); kesmeyen uçta kapı 4 artık geometrik olarak engelliyor. Betik çıktısı değişmedi (`BULGU contour_fresh_plunge`).

### NC başlığındaki ham kapı kodları — DÜZELTİLDİ
`src/cam/post/describe.js` (İngilizce CAM sözlükleri, yer tutucu doldurma, sayılar 3 ondalık) + `opts.gateText(g)` (arayüz kullanıcı dilinde verebilir). Satır biçimi `(WARNING: …)` / `(BLOCK: …)`; `sanitizeComment` Türkçe harfleri ve °, …, —, tırnak vb. ASCII'ye çevirir. Örnek: `(WARNING: No machine position for "Baglama 1": absolute travel could not be checked. Only the toolpath span was checked.)`.

## Değişen dosyalar
`src/cam/post/{fanuc-base,engine,index,reader}.js`, yeni `src/cam/post/describe.js`; `src/cam/{ir,gates,tools}.js`; `src/cam/sim/index.js`; `src/cam/ops/{common,contour,pocket,drill}.js`; `src/cam/geom/path2d.js`; `src/ui/cam/ops.js` (yalnız `simRes`/`simOpts`); `src/i18n/cam-{core,post,ui2}-{tr,en}.js`; `test/{cam,post,sim}.test.mjs`; `test/cam-samples/golden/*.nc` (yeniden üretildi, fark: V-01/V-02); `docs/{CAM-DESIGN,CAM,POST,CAM-VERIFY}.md`.

## Açık kalanlar
- V-21 korumalı O aralığı, V-22/V-23 N sınırı ve genel kurallar, A yönü: makine projesinde teyit.
- V-24 (sim yanal çözünürlük), V-28 (köşe temizleme), V-29 (yön sapması) ertelendi.
- Arayüz: takım düzenleyicide `maxRampAngle` alanı yok (kesmeyen uçla rampa/helis engelli kalır); `simRes` küçük takım + büyük stokta hücre sınırına takılıp engelleyebilir (sessiz değil).
- v05 ve v07 betikleri, düzeltmenin artık hata verdiği girdide duruyor; v01 V-02 satırı betiğin `G17`'yi `G1` sanmasıyla yanlış pozitif.
