# İmalat (CAM) arayüzü — durum ve yapı

Kapsam: `src/ui/cam/*`, `src/i18n/cam-ui-*.js`, `src/i18n/cam-ui2-*.js`, `test/cam-ui.test.py`. Çekirdek (A) için docs/CAM.md, post/simülasyon (B) için docs/POST.md.

## Dosyalar
| Dosya | Görev |
|---|---|
| `index.js` | `CamCtl`: sekme kipi, şerit, tarayıcı ağacı, durum çubuğu, `doc.cam` değişiklikleri (`mut`), setup/işlem eylemleri |
| `store.js`, `machines.js`, `toolui.js`, `setup.js` | Aşama 1: tezgâh yönetimi, takım kütüphanesi, setup paneli |
| `ops.js` | `CamOps`: hesap önbelleği, durum rozetleri, hesap hattı, program kurma, kapılar, simülasyon/post akışı, doğrulama durumu |
| `oppanel.js` | İşlem paneli (Yüzey, Kontur, Cep, Delme/Diş): sekmeler Takım / Geometri / Yükseklikler / Pasolar |
| `simbar.js` | Simülasyon çubuğu (`createSim` adımlayıcısı), stok ağı ve takım gösterimi |
| `postui.js` | Sorun listesi, NC önizleme + kaydet, doğrulama beyanı |
| `view.js` | three.js: setup çerçevesi, takım yolları, vurgulanan hareket, stok ağı, takım |

## Veri ve akış
- Belge: `doc.cam = {machineId, tools, setups:[{…, ops:[…]}], verified}`. İşlem alanları çekirdeğin `computeOp` sözleşmesiyle aynıdır. Hesap sonuçları (takım yolu, NC) belgeye yazılmaz.
- Önbellek anahtarı = işlem + setup (işlemsiz) + takım + tezgâh (içerik özeti) + model/eskiz/delik özeti. Anahtar değişince rozet "Eski" olur; yol görünümden kalkar.
- Yolu hesapla: işlem panelinde taslağı kaydetmeden hesaplar (`generateProgram` ile, tek işlemlik alt belge); şeritteki "Yolu hesapla" tüm işlemleri hesaplar. Hatalı işlem satırı rozetinde ve listede nedeniyle gösterilir.
- Simüle et / Post işle: eski işlemler yeniden hesaplanır → `buildProgram` → `camHeightmap` (model yüksekliği, setup başına) → `gates(..., {sim})`. Simülasyon çubuğu aynı program için `createSim` ile oynatır.
- Post işle: herhangi bir `block` kapısı varsa NC üretilmez; işlem adı ve neden listelenir, satıra tıklayınca işlem açılır. Yoksa `postProgram`; NC önizlemede satıra tıklayınca `lineMap` ile ilgili hareket görünümde vurgulanır. Kaydet: `kind:'nc'` (Electron'da diyalog, tarayıcıda indirme).
- Doğrulama: yalnız kullanıcı beyanı (ad + tarih + not + onay kutusu) → `doc.cam.verified` ({by, date, note, sig}). `sig` = özellikler + `cam` (verified hariç) özeti; belge değişince beyan düşer ("Doğrulandı" kalkar), geri alınca yeniden geçerli olur. "Post işlemcisi DOĞRULANMADI" rozeti kalıcıdır (NC başlığında ve önizlemede).
- Program numarası yalnız oturumda tutulur (varsayılan 1000), NC penceresinden değiştirilir.

## Yapıldı (tarayıcıda doğrulandı: `python3 test/cam-ui.test.py`)
Aşama 1: sekme, tezgâh yönetimi (şablon + kullanıcı profili, dokunulmaz liste), takım kütüphanesi, setup paneli, tarayıcı ağacı + durum rozetleri, durum çubuğu, TR/EN, Electron `nc`/`json` kaydı.
Aşama 2: dört işlem paneli (takım, ön ayar, kesme verisi, geometri seçimi görünümde: yüz / eskiz profili bölgeleri / gövde dış sınırı; delikler `holes[]` listesinden, çap ve özellik süzgeci), yükseklikler, paso alanları; yol gösterimi (hızlı/kesme/giriş-çıkış renkli + lejant + göster/gizle); "Eski" rozeti ve durum çubuğu sayaçları; simülasyon çubuğu (oynat/duraklat/adım/geri/hız/kaydırıcı, stok yükseklik ağı, takım ve tutucu, sorun listesi → harekete atla); kapı engeli akışı; NC önizleme ve kaydet; doğrulama beyanı.

## Kalan / bilinen sınırlar
- Yarı çalışan ya da yapılmayanlar: Uyarlanır ve 3B yüzey işleme (çekirdekte yok; ribbon "yakında"), 4./5. eksen tezgâhlar (yakında), eksen yönü için "yüzden" seçimi (setup panelinde yalnız ana eksenler; çekirdek `kind:'face'` destekler), `holes.kind:'points'` ve açık zincir (`{kind:'chain'}`) seçimi arayüzde yok.
- Simülasyon ana iş parçacığında çalışır; büyük programda arayüz kısa süre donabilir (ölçülmedi). Çözünürlük otomatik (≥ 0,5 mm, en çok ~400 bin hücre). Silindir stok kutu olarak yaklaşıklanır (B'nin sınırı). Stok ağı yalnız üst yüzeyi gösterir (yan duvar yok).
- Gerçek Electron penceresinde NC kaydı elle denenmedi; `test/electron.test.mjs` ana süreç sözleşmesini (kind, boyut sınırı) kapsar.
- Şablon tezgâhların eksik değerleri (kurslar, `spindle.maxRpm`, `feed.maxCut`) bilerek boş: NC üretimi kapı 1 ile engellenir. Dolu bir kullanıcı profili gerekir; Neway değerlerini makine projesinden teyit edin.
- Post özelliği (`post.props`) boş kalırsa post hatası olarak gösterilir; arayüz değer uydurmaz.
- Gövde dış sınırı yalnız prizmatik gövdede çalışır (A'nın sınırı); aksi `cam.silhouette.not_prismatic` hatası işlem panelinde gösterilir.

## Sözleşmeden sapma / eklemeler
- Çekirdek API'si değiştirilmedi. `generateProgram` tek işlemlik alt belgeyle (taslak hesabı) çağrılır; `gates` simülasyon seçenekleriyle ana iş parçacığında çalışır.
- `err.cam.no_machine` ve `err.cam.ui.sim_no_model` arayüze özgü hata kodlarıdır (`cam-ui2-*`).
- Gözlem (B): NC başlık yorumunda kapı uyarıları ham kodla yazılıyor (`(GATE WARN cam.gate.travel_abs_unchecked)`); okunur metin değil.
