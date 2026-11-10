# Mihenk — Arayüz Tasarım Sistemi ve HMI Belirtimi

Durum: v1. Kaynak koda dokunulmadı. Dosyalar: `design/tokens.css` (belirteçler), `design/components.css` (bileşen başvuru gerçeklemesi, birebir alınabilir), `design/mockups/*.html` (maketler), `design/icon-sheet.html`, `brand/icons/*.svg`, `design/tools/*` (üreticiler, kontrast hesabı). Ad ve kimlik: `docs/BRAND.md`.
Maketleri açma: `design/mockups/NN-*.html?theme=light|dark&lang=tr|en&density=normal|large`.

## 1. Mevcut arayüzün eleştirisi (test/shots/*.png ve style.css'ten)
1. **Kimlik yok**: üstte düz koyu menü çubuğunda düz yazı "AtolyeCAD"; simge yok, `<link rel="icon" href="data:,">`.
2. **Hedef boyutları küçük**: menü satırı ~26 px, kutu/giriş ~26 px, 13 px yazı, grup etiketi 10,5 px (okunmaz). Atölyede uzaktan/eldivenle yanlış basmayı kolaylaştırır.
3. **Durum görünürlüğü zayıf**: aktif kip (model/sketch) yalnız araç çubuğu değişimiyle anlaşılıyor; hatalı özellik sayısı durum çubuğunda yok (yalnız kırmızı çip ve alt satırda metin); kaydedilmemiş değişiklik yalnız başlıkta "•" (05/06 numaralı görüntülerde başlık sağında silik).
4. **Renk tek taşıyıcı**: hata çipi yalnız kırmızı kenar + metin; sketch kısıt rozetleri yeşil/kırmızı; seçim yeşil (başarı rengi) ile karışıyor (`regionSel` yeşil); hover turuncu uyarıyla aynı hue.
5. **Çizim hataları**: kırmızı toast (`#toast.bad`) tüm ekranda kırmızı bantla bağırıyor, 4 sn sonra kayboluyor, ne yapılacağı yok (ekran görüntüsü 10: "Bu dosya okunamadı: ..." bilgisi çabuk kaybolur).
6. **Panel yerleşimi**: sağ panel alanları çok sıkışık; birim ("mm") alanın altında küçük metin; ifade girişinde çözülmüş değer gösterilmiyor; seçim kutuları kesikli çerçeveyle belirsiz.
7. **Zaman çizelgesi** çipleri düz; sıra numarası yok; hata çipinde ikon yok; geri sarma işaretçisi 4 px.
8. **Şerit**: 22 px simgeler, 3 grup yatay kaydırma, komut arama yok, "son kullanılanlar" yok; sketch şeridinde 20+ düğme tek satırda (daha çok komut gelecek) ölçeklenmez.
9. **Koyu tema, yoğunluk, odak halkası yok**; `outline` yalnız alanlarda; klavye ile gezinti görünür değil.
10. **Çok tezgâhlı/CAM yeri yok**: sekme yok, makine seçimi yok, "doğrulanmadı" gösterimi yok.
11. **Kontrast**: `--muted:#667085` üzerinde açık gri zeminde ~4,3:1, grup etiketi 10,5 px olduğu için fiilen okunamaz.

## 2. Tasarım ilkeleri (HMI)
Her biri, "atölyede, eldivenle, acele ederken yanlış yapmayı zorlaştırır mı?" sorusunun cevabıdır. ISA-101 yüksek performanslı HMI ve ISO 9241-110/112/125 yaklaşımı uygulanmıştır (standart metni kopyalanmadı).
1. **Sakin nötr zemin; doygun renk yalnız durum için.** Yüzeyler soğuk gri (`--bg-*`). Marka mavisi (`--accent`) yalnız "etkin/seçili/birincil eylem". Hata, uyarı, başarı, bilgi, doğrulanmadı her yerde aynı rengi ve aynı ikonu taşır.
2. **Renk tek bilgi taşıyıcı değildir.** Her durumun ayrı ikon şekli (daire-çarpı, üçgen, daire-onay, daire-i, kalkan-soru), metni ve biçimi var: hata = kalın sol bant + dolu zemin; uyarı = üçgen; **doğrulanmadı = kesikli çerçeve + kalkan-soru + büyük harfli "DOĞRULANMADI"**; seçili = alt çizgi/sol bant; hatalı çip = ikon + metin.
3. **Durum her an görünür** (durum çubuğu + başlık): kip (Model/Sketch/İmalat), etkin araç, hesap sürüyor (ilerleme çubuğu + İptal), kaydedilmemiş (başlıkta sarı nokta + "Kaydedilmemiş" metni), kayıt zamanı, **hatalı özellik/işlem sayısı (tıklanınca ilk hataya gider)**, sketch serbestlik ve çelişki, post "DOĞRULANMADI".
4. **Birim her sayının yanında** (`mm`, `mm/dk`, `dev/dk`, `%`, `Ø`); alanlarda sabit sağ ek. İfade girilince çözülmüş değer altında yazılır (`= 20,00 mm`).
5. **Geri alınamaz işlemde açık onay, varsayılan odak güvenli seçenekte.** Yıkıcı düğme kenarlıklı kırmızı ve sağda; Enter varsayılanı çalıştırır = güvenli. Geri alınabilir işlemde onay yok, Ctrl+Z.
6. **Uzaktan okunabilirlik ve hedef boyutu**: Normal: kontrol yüksekliği 32 px, yazı 14 px, şerit düğmesi 68×68; **Büyük**: 40 px, 16 px, 84×84. Hiçbir tıklanabilir öğe 32 px (Büyük'te 40) altında değildir; ağaç/tablo satırı da 32. Sketch şeridindeki yalnız-simge kısıt düğmeleri 36 px (Büyük 44×40) ve ipucu gösterir.
7. **Klavye ile tam kullanım, görünür odak**: her etkileşimli öğe `:focus-visible` ile 2 px `--focus` halka + 2 px ofset; Tab sırası = görsel sıra; Esc iptal, Enter onay; komut arama `Ctrl+K` ya da `S`.
8. **Kontrast ≥ WCAG 2.2 AA** (metin 4,5:1; bileşen sınırı/simge/odak 3:1): §5 tablosu betikle hesaplandı.
9. **Renk körlüğü**: seçim (mavi) ve hata (kırmızı-eflatun `#C2185B`, kesikli) ve tam tanımlı (koyu) ayrı luminans ve çizgi biçimi taşır; ΔE tablosu §5. Hata/başarı metin renkleri deuteranopide zayıf (bkz. tablo): bu yüzden hiçbir yerde yalnız renkle ayrılmaz.
10. **Hareket**: 80/140/220 ms; `prefers-reduced-motion`'da süreler ~0, dönen gösterge durağan simgeye döner.

## 3. Tasarım belirteçleri (`design/tokens.css`)
- Temalar: `:root` (açık), `[data-theme="dark"]`; yoğunluk `[data-density="large"]`. Uygulama `<html>` üzerine üçünü de yazar; sistem teması için `matchMedia('(prefers-color-scheme: dark)')`.
- Renk: `--bg-app/-chrome/-surface/-field/-sunken/-hover/-pressed/-title`, `--text/-muted/-subtle/-disabled/-on-title`, `--line` (süs), `--line-strong` (bileşen sınırı), `--accent*`, `--focus`, durum beşlisi (`--err/-warn/-ok/-info/-unv` × `fg bg bd solid on`).
- 3B görünüm (`--vp-*`): zemin gradyanı, ızgara, eksenler, gövde, kenar, hover, seçim, düzlem, sketch serbest/tam/yapı/hata/seçili, bölge dolgusu, ölçü etiketi, takım yolu (hızlı/kesme/giriş), stok. Her ikisi iki tema için tanımlı.
- Boşluk 2/4/8/12/16/24/32/48; yazı 12/13/14/16/20/28 (`--fs-*`), ağırlık 400/500/600; köşe 2/4/6/8; çizgi 1 ve 2 px; gölge sm/md/lg; z: viewport 0, overlay 10, dock 20, menü 100, ipucu 200, modal 300, toast 400, meşgul 500; hareket 80/140/220 ms, `cubic-bezier(.2,0,0,1)`.
- Boyutlar: `--ctl-h` 32 (Büyük 40), `--tool-w/h` 68×72 (84×84), `--ribbon-h` 96 (120), `--titlebar-h` 40, `--tabs-h` 36, `--timeline-h` 48, `--status-h` 28, `--browser-w` 260, `--panel-w` 320 (Büyük 300/360).
- Yazı tipi: bkz. BRAND.md §4. Sayılar `tnum`+`zero`.
- Kural: bileşen CSS'inde ham HEX yok; three.js renkleri (`viewport.js COL`) `getComputedStyle(document.documentElement).getPropertyValue('--vp-…')` ile okunur ve tema değişince yeniden uygulanır.

## 4. Yerleşim ve bilgi mimarisi
Pencere en az 1200×700. Üstten alta (maket: `02-tasarim-model.html`):
1. **Başlık şeridi (40 px, koyu mürekkep)**: logo (yatay, reverse), `Dosya ▾` menüsü (Yeni, Aç, Kaydet, Farklı kaydet, STEP/STL/DXF içe-dışa, Son dosyalar, Ayarlar, Çık), geri al/yinele/kaydet, belge adı + "Kaydedilmemiş" göstergesi, **komut arama (Ctrl+K / S)**, **makine seçici** (makine adı + eksen sayısı; çoklu makine: açılır liste, 3/4/5 eksen), ayarlar, yardım. Klasik menü çubuğu kaldırıldı; ana komutlar şeritte, geri kalanı Dosya menüsünde ve komut aramada.
2. **Çalışma alanı sekmeleri (36 px)**: Tasarım, İmalat (CAM), Çizim (ileride, devre dışı "yakında"). Sağda "Çevrimdışı" rozeti. Sekme değişince şerit, tarayıcı, panel ve zaman çizelgesi alanı değişir, belge ve görünüm korunur.
3. **Şerit (96 px)**: gruplar (Oluştur, Düzenle, İncele). Düğme: simge 24 + en çok 2 satır etiket (12 px), caret'li olanlar açılır alt menü (ör. Temel şekil: Kutu/Silindir/Küre; Desen: dikdörtgen/dairesel/yola). Sağda **"Son kullanılanlar"** (2×2, otomatik, en sık/son 4 komut). Sığmayan gruplar sağdan sola "»" taşma menüsüne gider (aynı sıra, aynı simge+ad). Sketch kipinde şerit değişir (Çiz, Düzenle, Ölçü ve kısıt, Sketch: Bitir birincil mavi, İptal); kısıtlar 6×2 yalnız-simge ızgarası. Devre dışı komut gri ve ipucu nedeni söyler ("Önce bir yüz seçin").
4. **Sol tarayıcı (260)**: Parametreler (Düzenle düğmesi), Orijin, Gövdeler (göz, ad, hacim), Sketch'ler; CAM'de Tezgâhlar, Setup ve işlemler, Takımlar. Satır 32 px; seçili = açık mavi zemin + 3 px sol bant. Sağ tık bağlam menüsü: Yeniden adlandır (F2), Bastır, Buraya geri sar, Sil (Del).
5. **3B görünüm**: sağ üstte görünüm küpü (96 px) + düğmeler (sığdır, iso/üst/ön/sağ, düzlemler, kesit); sol üstte bağlam HUD (ör. "Sketch 1 · XY düzlemi"); alt ortada **komut istemi/ipucu satırı** ("Dikdörtgen: ilk köşeye tıklayın."); sol altta açıklama (CAM: hızlı/kesme/giriş çizgi lejandı). Ölçü etiketleri sahne koordinatında, ölçeklenmez.
6. **Sağ panel (320)**: etkin özellik/işlem formu: başlık (simge + ad + kapat), gövde (alanlar), altbilgi: **Tamam (Enter) birincil**, **İptal (Esc)**. Panel kapalıyken görünüm genişler.
7. **Alt zaman çizelgesi (48)**: çipler `simge · sıra · ad`; hata çipi kırmızı zemin + hata ikonu; bastırılmış çizgili/kesikli; geri sarılmış soluk; sonda 6 px işaretçi; yatay kaydırma, aktif uç görünür. CAM'de bunun yerine **simülasyon çubuğu** (adım geri, oynat, duraklat, adım ileri, dur, zaman kaydırıcısı, hız 0,5/1/4/16×, Stok/Takım yolu/Tutucu).
8. **Durum çubuğu (28)**: solda kip, etkin araç; sağda **hata sayısı düğmesi** (kırmızı, tıklanınca gider), seçim, birim, hesap süresi, otomatik kayıt zamanı. CAM: "Post: DOĞRULANMADI" mor kesikli düğme, hatalı/eski işlem sayıları.
9. **Karşılama** (`01-karsilama.html`): sol: logo, tek cümlelik vaat, Yeni belge (birincil), Aç…, Örnek parça; sağ: **kurtarılmış belge uyarısı** (Kurtar/Sil), son kullanılanlar (küçük resim, yol, tarih; `.acad` "eski biçim" rozeti), ilk üç adım. Alt çubukta dil, tema, yoğunluk hızlı anahtarı. Eski `.acad` dosyaları Aç'ta ve son kullanılanlarda görünür.
10. **Ayarlar penceresi** (`04-ayarlar.html`, 860×760 modal, sol gezinme + içerik): Genel (dil TR/EN, tema Açık/Koyu/Sistem, yoğunluk Normal/Büyük), Birimler (mm/in, ondalık 0–4), Fare ve klavye (düzen: Mihenk varsayılan / Fusion benzeri / SolidWorks benzeri + eşleme tablosu), Dosya ve kurtarma (otomatik kaydet), Hakkında (sürüm, lisanslar, "SAHA MİHENK ile ilgisi yoktur"). **Değişiklikler anında uygulanır**; altbilgide "Kapat" ve "Varsayılana dön". Mouse düzeni eşlemesi: Mihenk: orbit orta tuş, pan Shift+orta, zoom tekerlek; Fusion benzeri: orbit Shift+orta, pan orta; SolidWorks benzeri: orbit orta, pan Ctrl+orta, zoom Shift+orta.
11. **Hata/onay/toast/uzun hesap kalıpları** (`04b-hata-onay-bildirim.html`):
    - Toast: sağ altta, durum çubuğunun üstünde, en çok 3; **hata kalıcı (kapat düğmesiyle), uyarı 8 sn, bilgi/başarı 5 sn**; fare üstündeyken sayaç durur; eylem düğmesi olabilir ("Farklı kaydet"). Başlık = ne oldu, gövde = ne yapmalı.
    - Satır içi `callout` (panel içi, kalıcı): hata/uyarı/bilgi/doğrulanmadı.
    - Modal kuralları: yalnız (a) geri alınamaz işlem onayı, (b) kaydedilmemiş değişiklik, (c) kurtarılamaz hata, (d) ayarlar. Arkası karartılır (`rgba(8,12,16,.55)`), odak içeride döner, Esc = en güvenli düğme. Modal içinde modal açılmaz.
    - Uzun hesap: 300 ms'den kısa göstergesiz; sonra durum çubuğunda ilerleme (belliyse çubuk, değilse hareketli çubuk) + **İptal her zaman**; 5 sn'yi geçerse panelde `callout` ve kalan süre. Hesap sürerken belge düzenlenebilir, sonuç eskiyse "Eski" rozeti.
12. **Boş durumlar**: simge + bir cümle + tek eylem ("Henüz özellik yok. Bir sketch çizerek başlayın." [Sketch]).
13. **İpucu (tooltip)**: 500 ms gecikme, `ad + kısayol + tek cümle`, koyu zemin, en çok 280 px; klavye odağında da gösterilir.
14. **Komut paleti** (Ctrl+K/S): 560 px, yazdıkça süzer (Türkçe/İngilizce ad, takma ad), Enter çalıştırır, kısayol sağda.

### Sayısal giriş alanı
Yazarken ifade kabul eder (`kalinlik + 6`, `d1/2`); birim yazılmazsa alanın birimi, yazılırsa dönüştürülür (`0.5in` → 12,70). Enter/odak kaybı çözer, çözüm altında; hata durumunda kırmızı çerçeve + ikon + "Ne olduğu. Örnek: …"; `↑/↓` adım, Shift ×10, Alt ×0,1. Boş bırakma = önceki değer (alan kırmızı olmaz). Ondalık ayracı dile göre (TR virgül), girişte ikisi de kabul edilir.
### Seçim alanı davranışı
Kesikli çerçeve = seçim bekleyen alan; etkin olunca (tıklandı) düz mavi çerçeve + açık mavi zemin ve görünümde seçilebilir öğeler vurgulanır; sağda sayı ("Tümü 1") ve temizle (×). Seçim görünümde mavi çerçeve + dolgu (`--vp-sel*`), üzerine gelme `--vp-hover` ince çizgi.
### CAM çalışma alanı iskeleti (`05-imalat-cam.html`)
Tarayıcı: **Tezgâhlar** (radyo: Neway VM1160H M80V seçili; 4 ve 5 eksen "yakında" satırları yer ayırır; `axes-3/4/5` simgeleri), **Setup ve işlemler** (setup → stok → işlemler; işlem satırı: ad, takım özeti, durum rozeti: tamam ✓, **Eski** uyarı, **Hata**), **Takımlar** (kütüphane). Şerit: Kurulum (Yeni setup, Stok, Tezgâh, Takımlar), 2B (Yüzey, Kontur, Cep, Uyarlanır), Delme ve diş, 3B (devre dışı), Eylemler (Yolu hesapla, Simüle et, Post işle, NC kodu). Panel: sekmeli işlem formu (Takım/Geometri/Pasolar), devir/ilerleme/pasa birimli; **Post çıktısı** bölümü kesikli mor `callout` "DOĞRULANMADI". Post, simülasyon ve tezgâhta denenmediği sürece bu rozet **kapatılamaz**; yalnız kullanıcı "Doğrulandı" işaretini (tarih ve ad kaydıyla) elle koyabilir; NC dosyasının ilk satırı yorum olarak da "UNVERIFIED POST" yazar (öneri).

## 5. Kontrast ve renk körlüğü (hesaplanmış)
`python3 design/tools/contrast.py` tokens.css'i okur ve aşağıdaki tabloları üretir. Sonuç: **aşağıdaki tüm eşik çiftleri geçti (açık ve koyu tema)**; "muaf" yalnız devre dışı metindir.

### Kontrast — Açık tema

| Grup | Çift (ön / zemin) | Oran | Eşik | Sonuç |
|---|---|---|---|---|
| Metin | `text` / `bg-app` | 14.31:1 | 4.5 | GEÇTİ |
| Metin | `text-muted` / `bg-app` | 6.35:1 | 4.5 | GEÇTİ |
| Metin | `text` / `bg-chrome` | 15.69:1 | 4.5 | GEÇTİ |
| Metin | `text-muted` / `bg-chrome` | 6.96:1 | 4.5 | GEÇTİ |
| Metin | `text` / `bg-surface` | 16.55:1 | 4.5 | GEÇTİ |
| Metin | `text-muted` / `bg-surface` | 7.34:1 | 4.5 | GEÇTİ |
| Metin | `text` / `bg-field` | 17.12:1 | 4.5 | GEÇTİ |
| Metin | `text-muted` / `bg-field` | 7.59:1 | 4.5 | GEÇTİ |
| Metin | `text` / `bg-sunken` | 13.28:1 | 4.5 | GEÇTİ |
| Metin | `text-muted` / `bg-sunken` | 5.89:1 | 4.5 | GEÇTİ |
| Metin | `text` / `bg-hover` | 14.06:1 | 4.5 | GEÇTİ |
| Metin | `text-muted` / `bg-hover` | 6.23:1 | 4.5 | GEÇTİ |
| Metin | `text-subtle` / `bg-app` | 5.18:1 | 4.5 | GEÇTİ |
| Metin | `text-subtle` / `bg-chrome` | 5.68:1 | 4.5 | GEÇTİ |
| Metin | `text-subtle` / `bg-surface` | 6.00:1 | 4.5 | GEÇTİ |
| Metin | `text-subtle` / `bg-field` | 6.20:1 | 4.5 | GEÇTİ |
| Metin | `text-subtle` / `bg-sunken` | 4.81:1 | 4.5 | GEÇTİ |
| Metin | `text-on-title` / `bg-title` | 13.78:1 | 4.5 | GEÇTİ |
| Metin (devre dışı, WCAG muaf) | `text-disabled` / `bg-chrome` | 2.75:1 | — | muaf |
| Vurgu | `on-accent` / `accent` | 7.32:1 | 4.5 | GEÇTİ |
| Vurgu | `on-accent` / `accent-hover` | 9.12:1 | 4.5 | GEÇTİ |
| Vurgu | `on-accent` / `accent-active` | 11.33:1 | 4.5 | GEÇTİ |
| Vurgu | `accent` / `bg-chrome` | 6.71:1 | 4.5 | GEÇTİ |
| Vurgu | `accent` / `bg-field` | 7.32:1 | 4.5 | GEÇTİ |
| Vurgu | `accent` / `accent-tint` | 6.08:1 | 4.5 | GEÇTİ |
| Vurgu | `text` / `accent-tint` | 14.21:1 | 4.5 | GEÇTİ |
| Vurgu | `text` / `accent-tint-strong` | 12.13:1 | 4.5 | GEÇTİ |
| Durum | `err-fg` / `err-bg` | 5.61:1 | 4.5 | GEÇTİ |
| Durum | `err-fg` / `bg-chrome` | 5.99:1 | 4.5 | GEÇTİ |
| Durum | `err-fg` / `bg-surface` | 6.32:1 | 4.5 | GEÇTİ |
| Durum | `err-on` / `err-solid` | 6.54:1 | 4.5 | GEÇTİ |
| Durum (simge, 3:1) | `err-solid` / `bg-chrome` | 5.99:1 | 3.0 | GEÇTİ |
| Durum | `warn-fg` / `warn-bg` | 5.70:1 | 4.5 | GEÇTİ |
| Durum | `warn-fg` / `bg-chrome` | 5.80:1 | 4.5 | GEÇTİ |
| Durum | `warn-fg` / `bg-surface` | 6.12:1 | 4.5 | GEÇTİ |
| Durum | `warn-on` / `warn-solid` | 8.52:1 | 4.5 | GEÇTİ |
| Durum | `ok-fg` / `ok-bg` | 5.70:1 | 4.5 | GEÇTİ |
| Durum | `ok-fg` / `bg-chrome` | 6.00:1 | 4.5 | GEÇTİ |
| Durum | `ok-fg` / `bg-surface` | 6.32:1 | 4.5 | GEÇTİ |
| Durum | `ok-on` / `ok-solid` | 6.54:1 | 4.5 | GEÇTİ |
| Durum (simge, 3:1) | `ok-solid` / `bg-chrome` | 6.00:1 | 3.0 | GEÇTİ |
| Durum | `info-fg` / `info-bg` | 7.71:1 | 4.5 | GEÇTİ |
| Durum | `info-fg` / `bg-chrome` | 8.33:1 | 4.5 | GEÇTİ |
| Durum | `info-fg` / `bg-surface` | 8.79:1 | 4.5 | GEÇTİ |
| Durum | `info-on` / `info-solid` | 9.09:1 | 4.5 | GEÇTİ |
| Durum (simge, 3:1) | `info-solid` / `bg-chrome` | 8.33:1 | 3.0 | GEÇTİ |
| Durum | `unv-fg` / `unv-bg` | 6.68:1 | 4.5 | GEÇTİ |
| Durum | `unv-fg` / `bg-chrome` | 7.22:1 | 4.5 | GEÇTİ |
| Durum | `unv-fg` / `bg-surface` | 7.61:1 | 4.5 | GEÇTİ |
| Durum | `unv-on` / `unv-solid` | 7.87:1 | 4.5 | GEÇTİ |
| Durum (simge, 3:1) | `unv-solid` / `bg-chrome` | 7.22:1 | 3.0 | GEÇTİ |
| Bileşen sınırı (3:1) | `line-strong` / `bg-field` | 3.75:1 | 3.0 | GEÇTİ |
| Bileşen sınırı (3:1) | `line-strong` / `bg-chrome` | 3.43:1 | 3.0 | GEÇTİ |
| Odak halkası (3:1) | `focus` / `bg-chrome` | 5.31:1 | 3.0 | GEÇTİ |
| Odak halkası (3:1) | `focus` / `bg-field` | 5.80:1 | 3.0 | GEÇTİ |
| Odak halkası (3:1) | `focus` / `bg-surface` | 5.61:1 | 3.0 | GEÇTİ |
| Odak halkası (3:1) | `focus-on-dark` / `bg-title` | 8.37:1 | 3.0 | GEÇTİ |
| Bileşen sınırı (3:1) | `accent` / `bg-chrome` | 6.71:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-free` / `vp-bg-top` | 4.36:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-full` / `vp-bg-top` | 14.58:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-construct` / `vp-bg-top` | 3.85:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-error` / `vp-bg-top` | 5.18:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-sel` / `vp-bg-top` | 4.24:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sel` / `vp-bg-top` | 6.46:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-hover` / `vp-bg-top` | 4.13:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-dim-fg` / `vp-bg-top` | 6.66:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-free` / `vp-bg-bottom` | 3.54:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-full` / `vp-bg-bottom` | 11.86:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-construct` / `vp-bg-bottom` | 3.13:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-error` / `vp-bg-bottom` | 4.21:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-sel` / `vp-bg-bottom` | 3.45:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sel` / `vp-bg-bottom` | 5.25:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-hover` / `vp-bg-bottom` | 3.36:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-dim-fg` / `vp-bg-bottom` | 5.41:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-dim-fg` / `vp-dim-bg` | 7.54:1 | 4.5 | GEÇTİ |
| 3B görünüm (3:1) | `vp-edge` / `vp-body` | 7.03:1 | 3.0 | GEÇTİ |

### Renk körlüğü ayırt edilebilirliği (ΔE76; ≥ 15 rahat, 8–15 sınır, < 8 zayıf) — Açık tema

| Çift | Normal | Protanopi | Deuteranopi |
|---|---|---|---|
| sketch tam tanımlı / az tanımlı (`vp-sk-full` / `vp-sk-free`) | 62 | 60 | 62 |
| sketch az tanımlı / hata (`vp-sk-free` / `vp-sk-error`) | 84 | 50 | 76 |
| sketch tam tanımlı / hata (`vp-sk-full` / `vp-sk-error`) | 76 | 22 | 43 |
| sketch seçili / hata (`vp-sk-sel` / `vp-sk-error`) | 58 | 58 | 42 |
| sketch seçili / az tanımlı (`vp-sk-sel` / `vp-sk-free`) | 117 | 104 | 118 |
| gövde seçimi / sketch hata (`vp-sel` / `vp-sk-error`) | 78 | 36 | 66 |
| üzerine gelme / seçim (`vp-hover` / `vp-sel`) | 19 | 14 | 14 |
| hata metni / başarı metni (`err-fg` / `ok-fg`) | 93 | 10 | 27 |
| hata metni / uyarı metni (`err-fg` / `warn-fg`) | 38 | 17 | 4 |
| doğrulanmadı / hata (`unv-fg` / `err-fg`) | 89 | 79 | 93 |
| doğrulanmadı / bilgi (`unv-fg` / `info-fg`) | 52 | 33 | 28 |

### Kontrast — Koyu tema

| Grup | Çift (ön / zemin) | Oran | Eşik | Sonuç |
|---|---|---|---|---|
| Metin | `text` / `bg-app` | 15.71:1 | 4.5 | GEÇTİ |
| Metin | `text-muted` / `bg-app` | 9.81:1 | 4.5 | GEÇTİ |
| Metin | `text` / `bg-chrome` | 13.80:1 | 4.5 | GEÇTİ |
| Metin | `text-muted` / `bg-chrome` | 8.62:1 | 4.5 | GEÇTİ |
| Metin | `text` / `bg-surface` | 12.52:1 | 4.5 | GEÇTİ |
| Metin | `text-muted` / `bg-surface` | 7.82:1 | 4.5 | GEÇTİ |
| Metin | `text` / `bg-field` | 15.18:1 | 4.5 | GEÇTİ |
| Metin | `text-muted` / `bg-field` | 9.48:1 | 4.5 | GEÇTİ |
| Metin | `text` / `bg-sunken` | 14.73:1 | 4.5 | GEÇTİ |
| Metin | `text-muted` / `bg-sunken` | 9.20:1 | 4.5 | GEÇTİ |
| Metin | `text` / `bg-hover` | 10.91:1 | 4.5 | GEÇTİ |
| Metin | `text-muted` / `bg-hover` | 6.81:1 | 4.5 | GEÇTİ |
| Metin | `text-subtle` / `bg-app` | 7.38:1 | 4.5 | GEÇTİ |
| Metin | `text-subtle` / `bg-chrome` | 6.48:1 | 4.5 | GEÇTİ |
| Metin | `text-subtle` / `bg-surface` | 5.88:1 | 4.5 | GEÇTİ |
| Metin | `text-subtle` / `bg-field` | 7.13:1 | 4.5 | GEÇTİ |
| Metin | `text-subtle` / `bg-sunken` | 6.92:1 | 4.5 | GEÇTİ |
| Metin | `text-on-title` / `bg-title` | 16.15:1 | 4.5 | GEÇTİ |
| Metin (devre dışı, WCAG muaf) | `text-disabled` / `bg-chrome` | 3.25:1 | — | muaf |
| Vurgu | `on-accent` / `accent` | 6.57:1 | 4.5 | GEÇTİ |
| Vurgu | `on-accent` / `accent-hover` | 8.08:1 | 4.5 | GEÇTİ |
| Vurgu | `on-accent` / `accent-active` | 9.74:1 | 4.5 | GEÇTİ |
| Vurgu | `accent` / `bg-chrome` | 6.15:1 | 4.5 | GEÇTİ |
| Vurgu | `accent` / `bg-field` | 6.77:1 | 4.5 | GEÇTİ |
| Vurgu | `accent` / `accent-tint` | 5.08:1 | 4.5 | GEÇTİ |
| Vurgu | `text` / `accent-tint` | 11.40:1 | 4.5 | GEÇTİ |
| Vurgu | `text` / `accent-tint-strong` | 8.41:1 | 4.5 | GEÇTİ |
| Durum | `err-fg` / `err-bg` | 7.09:1 | 4.5 | GEÇTİ |
| Durum | `err-fg` / `bg-chrome` | 7.43:1 | 4.5 | GEÇTİ |
| Durum | `err-fg` / `bg-surface` | 6.74:1 | 4.5 | GEÇTİ |
| Durum | `err-on` / `err-solid` | 5.31:1 | 4.5 | GEÇTİ |
| Durum (simge, 3:1) | `err-solid` / `bg-chrome` | 4.42:1 | 3.0 | GEÇTİ |
| Durum | `warn-fg` / `warn-bg` | 8.47:1 | 4.5 | GEÇTİ |
| Durum | `warn-fg` / `bg-chrome` | 9.77:1 | 4.5 | GEÇTİ |
| Durum | `warn-fg` / `bg-surface` | 8.86:1 | 4.5 | GEÇTİ |
| Durum | `warn-on` / `warn-solid` | 8.52:1 | 4.5 | GEÇTİ |
| Durum | `ok-fg` / `ok-bg` | 7.55:1 | 4.5 | GEÇTİ |
| Durum | `ok-fg` / `bg-chrome` | 8.64:1 | 4.5 | GEÇTİ |
| Durum | `ok-fg` / `bg-surface` | 7.83:1 | 4.5 | GEÇTİ |
| Durum | `ok-on` / `ok-solid` | 7.15:1 | 4.5 | GEÇTİ |
| Durum (simge, 3:1) | `ok-solid` / `bg-chrome` | 6.21:1 | 3.0 | GEÇTİ |
| Durum | `info-fg` / `info-bg` | 8.41:1 | 4.5 | GEÇTİ |
| Durum | `info-fg` / `bg-chrome` | 9.07:1 | 4.5 | GEÇTİ |
| Durum | `info-fg` / `bg-surface` | 8.22:1 | 4.5 | GEÇTİ |
| Durum | `info-on` / `info-solid` | 9.74:1 | 4.5 | GEÇTİ |
| Durum (simge, 3:1) | `info-solid` / `bg-chrome` | 9.07:1 | 3.0 | GEÇTİ |
| Durum | `unv-fg` / `unv-bg` | 7.57:1 | 4.5 | GEÇTİ |
| Durum | `unv-fg` / `bg-chrome` | 8.04:1 | 4.5 | GEÇTİ |
| Durum | `unv-fg` / `bg-surface` | 7.29:1 | 4.5 | GEÇTİ |
| Durum | `unv-on` / `unv-solid` | 7.18:1 | 4.5 | GEÇTİ |
| Durum (simge, 3:1) | `unv-solid` / `bg-chrome` | 6.23:1 | 3.0 | GEÇTİ |
| Bileşen sınırı (3:1) | `line-strong` / `bg-field` | 4.94:1 | 3.0 | GEÇTİ |
| Bileşen sınırı (3:1) | `line-strong` / `bg-chrome` | 4.50:1 | 3.0 | GEÇTİ |
| Odak halkası (3:1) | `focus` / `bg-chrome` | 8.30:1 | 3.0 | GEÇTİ |
| Odak halkası (3:1) | `focus` / `bg-field` | 9.13:1 | 3.0 | GEÇTİ |
| Odak halkası (3:1) | `focus` / `bg-surface` | 7.53:1 | 3.0 | GEÇTİ |
| Odak halkası (3:1) | `focus-on-dark` / `bg-title` | 9.82:1 | 3.0 | GEÇTİ |
| Bileşen sınırı (3:1) | `accent` / `bg-chrome` | 6.15:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-free` / `vp-bg-top` | 4.86:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-full` / `vp-bg-top` | 10.91:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-construct` / `vp-bg-top` | 4.16:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-error` / `vp-bg-top` | 4.64:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-sel` / `vp-bg-top` | 6.37:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sel` / `vp-bg-top` | 5.54:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-hover` / `vp-bg-top` | 6.41:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-dim-fg` / `vp-bg-top` | 7.17:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-free` / `vp-bg-bottom` | 6.57:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-full` / `vp-bg-bottom` | 14.73:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-construct` / `vp-bg-bottom` | 5.62:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-error` / `vp-bg-bottom` | 6.27:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sk-sel` / `vp-bg-bottom` | 8.60:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-sel` / `vp-bg-bottom` | 7.48:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-hover` / `vp-bg-bottom` | 8.65:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-dim-fg` / `vp-bg-bottom` | 9.68:1 | 3.0 | GEÇTİ |
| 3B görünüm (3:1) | `vp-dim-fg` / `vp-dim-bg` | 9.07:1 | 4.5 | GEÇTİ |
| 3B görünüm (3:1) | `vp-edge` / `vp-body` | 6.80:1 | 3.0 | GEÇTİ |

### Renk körlüğü ayırt edilebilirliği (ΔE76; ≥ 15 rahat, 8–15 sınır, < 8 zayıf) — Koyu tema

| Çift | Normal | Protanopi | Deuteranopi |
|---|---|---|---|
| sketch tam tanımlı / az tanımlı (`vp-sk-full` / `vp-sk-free`) | 50 | 47 | 53 |
| sketch az tanımlı / hata (`vp-sk-free` / `vp-sk-error`) | 95 | 66 | 87 |
| sketch tam tanımlı / hata (`vp-sk-full` / `vp-sk-error`) | 73 | 45 | 50 |
| sketch seçili / hata (`vp-sk-sel` / `vp-sk-error`) | 45 | 46 | 30 |
| sketch seçili / az tanımlı (`vp-sk-sel` / `vp-sk-free`) | 115 | 109 | 116 |
| gövde seçimi / sketch hata (`vp-sel` / `vp-sk-error`) | 95 | 64 | 85 |
| üzerine gelme / seçim (`vp-hover` / `vp-sel`) | 21 | 13 | 11 |
| hata metni / başarı metni (`err-fg` / `ok-fg`) | 85 | 20 | 6 |
| hata metni / uyarı metni (`err-fg` / `warn-fg`) | 53 | 51 | 36 |
| doğrulanmadı / hata (`unv-fg` / `err-fg`) | 59 | 52 | 60 |
| doğrulanmadı / bilgi (`unv-fg` / `info-fg`) | 34 | 22 | 15 |

Renk körlüğü notu: hata/başarı metin rengi protanopi ve deuteranopide yakınlaşır (ΔE düşük satırlar); bu yüzden durum her yerde ikon şekli + metinle de verilir (ilke 2). Sketch'te tam tanımlı (koyu), az tanımlı (mavi), hata (eflatun-kırmızı, kesikli, kalın) ΔE yüksek ve çizgi biçimi farklı.

## 6. Bileşen kütüphanesi (`design/components.css`, görsel: `design/mockups/06-bilesenler.html`)
Durumlar her bileşende: normal, hover, basılı, odak, devre dışı, hata. Ölçüler Normal / Büyük.
| Bileşen | Sınıf | Ölçü | Notlar |
|---|---|---|---|
| Düğme | `.btn` + `.primary/.ghost/.danger/.danger-outline/.icon` | 32 / 40 px yükseklik, en az 84 px genişlik, yatay iç boşluk 16, köşe 4 | Birincil = accent dolgu. Devre dışı: kenar `--line`, metin `--text-disabled`. |
| Şerit düğmesi | `.tool` (+`.on`, `.primary`, `.icon36`) | 68×68 (84×84), simge 24 (28), etiket 12 px ≤2 satır | `.on`: açık mavi zemin + accent kenar + 3 px alt çizgi; caret açılır menü. |
| Açılır menü / bağlam menüsü | `.ctxmenu .mi` | satır 32 / 40, en az 240 px, köşe 6, gölge md | Kısayol sağda `.kbd`. Yıkıcı = kırmızı metin. Alt menü sağa açılır. |
| Sekme | `.tab` | 36 px | Seçili: üstte 3 px accent çizgi + `--bg-chrome` zemin. |
| Alan | `.input` | 32 / 40 px, kenar `--line-strong`, odak 2 px `--focus`, sağ birim hücresi | Hata: `--err` çerçeve + zemin + `.fieldmsg` (ikon+metin). |
| Seçim kutusu (pick) | `.input.pick(.active)` | 32 px | Bkz. §4. |
| Onay kutusu / radyo | `.check`, `.radio` | kutu 20 px (Büyük 24), satır en az 32 | Karma durum çizgi. |
| Anahtar | `.switch` | 40×22 (48×26) | Yanında "Açık/Kapalı" metni. |
| Kaydırıcı | `.slider` | ray 4 px, tutamaç 20 px | Değer sağda sayı+birim; ok tuşları ile adım. |
| Segment | `.seg` | 32 px | Seçili: açık mavi + alt çizgi. |
| Tablo | `.table` | satır 32 px, başlık yapışkan | Sayılar sağa hizalı, `tnum`. |
| Ağaç satırı | `.trow` | 32 px (iki satırlı 48), girinti 16 px | Seçili sol bant; hata kırmızı metin+ikon; gizli soluk. |
| Çip | `.chip` | 32 px, köşe 4 | seçili/hata/bastırılmış/geri sarılmış. |
| Rozet | `.badge` (+`.err/.warn/.ok/.info/.unv`) | en az 22 px, yazı 12 px/600 | `.unv` kesikli 2 px çerçeve. |
| Toast | `.toast` | 380 px, sol bant 6 px | bkz. §4. |
| Callout | `.callout` | tam genişlik | satır içi kalıcı durum. |
| Modal | `.scrim .modal` | 480–860 px, başlık 56, altbilgi 64, köşe 8 | bkz. kurallar §4. |
| İpucu | `.tip` | ≤280 px | ad + `.kbd` + cümle. |
| Panel | `.panel` | 320 px, başlık 44 | altbilgi birincil+iptal. |
Durum simülasyonu: `design/_states.css` (`build_states.py`) `.is-hover/.is-active/.is-focus` üretir; galeri içindir, uygulamada kullanılmaz.

## 7. İkon seti
`brand/icons/*.svg` 141 adet (`design/icon-sheet.html` önizleme): 24 px ızgara, çizgi 1,75, `currentColor`. Mevcut komutlar (sketch, extrude, revolve, delik, kutu, silindir, küre, yuvarlat, pah, kabuk, birleştir, taşı, desen, ayna, ölç, özellikler, girişim, kesit, içe/dışa aktar, parametreler, göz, geri sar, geri al/yinele, seç, çizgi, dikdörtgen, daire, yay, nokta, ölçüler, 11 kısıt, yapı, bitir, iptal), sketch'e eklenenler (buda, uzat, böl, ofset, köşe yuvarla/pah, ayna, dikdörtgen ve dairesel desen, taşı/kopyala/döndür/ölçekle, izdüşür, çokgen, kanal, elips, spline, 3 nokta yay/daire, teğet yay, merkezden dikdörtgen, kutuyla seçim, DXF içe/dışa, yarıçap ölçüsü), CAM (setup, stok, tezgâh, takım, takım kütüphanesi, yüzey, kontur, cep, uyarlanır, delme, diş, 3B yüzey, takım yolu, simüle, oynat/duraklat/dur/adım, post, NC kodu, hesapla, doğrulandı/doğrulanmadı), durum (info, uyarı, hata, başarı) ve sekme/eksen simgeleri. `icons.json` uygulamada `icons.js`'e kaynak olur (ad → iç SVG). Mevcut `icons.js` anahtarları ile eşleme: `sketch, extrude, revolve, hole, box, cylinder, sphere, fillet, chamfer, shell, combine, move, pattern, mirror, measure, props→properties, interf→interference, section, import, param→parameters, rect, circle, arc, point, dim, hdim, vdim, constraint adları aynı, construct→construction, finish, cancel, eye, rollback, undo`.
Tutarlılık turunda düzeltilenler: `trim` (artı gibi okunuyordu → kesikli kaldırılan parça), `split` (artıya benziyordu → çapraz kırık çizgi + nokta), `op-face`, `cam-tool`, `circle-3pt`.

## 8. Maketler ve eleştiri turları
| Dosya | İçerik |
|---|---|
| `design/mockups/01-karsilama.html` | Karşılama |
| `02-tasarim-model.html` | Tasarım, model kipi, açık Extrude paneli, hatalı çip, ipucu |
| `03-sketch.html` | Sketch kipi: araçlar, ölçü etiketleri, ifade düzenleme, kısıt rozetleri, serbestlik, çelişki |
| `04-ayarlar.html` | Ayarlar penceresi |
| `04b-hata-onay-bildirim.html` | Onay, kaydet, hata, toast, uzun hesap, alan hataları, rozetler, komut paleti, bağlam menüsü |
| `05-imalat-cam.html` | CAM iskeleti |
| `06-bilesenler.html` | Bileşen durumları |
Ekran görüntüleri `design/shots/` (1440×900 ve 1920×1080; açık/TR ve koyu/EN). Yeniden üretim: `python3 design/tools/build_mockups.py` sonra `python3 design/tools/shot_all.py`.
Eleştiri notları:
- Tur 1: ipucu üst ipucu satırını örtüyordu → komut istemi alta alındı; belge adı arama alanıyla çakışıyordu → akışa alındı; segment etiketleri iki satıra kırılıyordu → tam genişlik, 13 px; şerit etiketleri kırpılıyordu ("Temel ş…") → 2 satır etiket, üstten hizalı, 72 px düğme yüksekliği; "Son kullanılanlar" kırpılıyordu → 2×2 ızgara; "Bitir" yeşildi (başarı rengi) → accent; tarayıcıda iki satırlı CAM satırları sıkışıyordu → 48 px satır; CAM panelinde post satırı altbilgiye taşıyordu → callout'a katıldı.
- Tur 2 (koyu/EN, 1920): görünüm küpü etiketleri üst üste biniyordu (Front/Right) → 8 px; EN "Interference" şerit etiketi kırpılıyordu → "Clash check" (2 satır); EN segment "Symmetric" kırpılıyordu → iç boşluk 2 px. Kalan bilinen kusur: Büyük yoğunluk maketlere uygulanmadı (`?density=large` çalışır ama taşma ekran görüntüsüyle doğrulanmadı); sketch şeridi 1440'ta sığıyor, daha dar ekranda taşma menüsü gerekir (maketi yok).

## 9. Uygulama planı (kaynak koda henüz dokunulmadı)
Sıra (her adımdan sonra `npm run test:all`):
1. **Belirteçler**: `design/tokens.css` + `design/components.css` içeriğini `src/ui/style.css`e taşı (ham HEX kalmasın); yazı tiplerini `@fontsource/inter` ve `@fontsource/jetbrains-mono` (sürüm sabit, `latin` + `latin-ext`) ile paketle, ya da `brand/fonts/*.woff2` dosyalarını `public/fonts`a kopyala (CSP `font-src 'self'` uyumlu). `index.html`: `<html data-theme data-density lang>`, `<title>Mihenk</title>`, `<link rel="icon">` = `brand/app-icon/app-icon-32.png`.
2. **dom.js / app ayarları**: tema (açık/koyu/sistem), yoğunluk, dil ayarlarını `settings.json`a yaz (mevcut anahtar mekanizması); `<html>` niteliklerini uygula.
3. **icons.js**: `brand/icons/icons.json` içeriğiyle değiştir (eski anahtarlar için takma ad tablosu: `props→properties, interf→interference, param→parameters, construct→construction`); `featureIcon` aynı kalır. Çizgi kalınlığı CSS'ten `--stroke-icon`.
4. **index.html + chrome.js**: yeni kabuk (başlık şeridi, sekmeler, şerit, tarayıcı, panel, zaman çizelgesi, durum çubuğu) `design/mockups/02` DOM'una göre; klasik menü çubuğu → `Dosya` menüsü + komut arama (Ctrl+K/S); "Son kullanılanlar" sayacı (localStorage yerine settings.json); görünüm küpü; hata sayısı düğmesi.
5. **panels.js**: alan düzeni (`.fld`, birim hücresi, ifade çözümü, `.fieldmsg`), altbilgi Tamam/İptal; seçim kutuları `.input.pick`.
6. **Modal ve toast**: `.scrim/.modal`, `.toast` kuyruğu (hata kalıcı), onay ve kaydet kalıpları (varsayılan odak güvenli düğme), uzun hesap göstergesi + İptal.
7. **viewport.js**: `COL` yerine `--vp-*` değişkenlerini oku, tema değişiminde yeniden boya; sketch hata çizgisi kesikli.
8. **Karşılama ve Ayarlar**: `design/mockups/01` ve `04`.
9. **CAM iskeleti** (CAM yazılınca): `05`.
10. **Yeniden adlandırma** (aşağıdaki liste) ve exe simgesi.

### Yeniden adlandırma denetim listesi ("AtolyeCAD", "atolyecad", "ATOLYE_", ".acad")
`grep -rIl -i "atolye\|\.acad"` ile bulunan dosyalar (taramada görülenler): `index.html`, `package.json` (`name`, `productName`, `build.appId` → `com.d160.mihenk`, `description`), `package-lock.json` (name), `electron/main.cjs` (`title`, dosya türleri `KINDS.acad`, `ORIGIN app://atolye/`, `ATOLYE_*` ortam değişkenleri, `userData` klasörü, `recoveryFile` `autosave.acad`, açılış argümanı `.acad` regex'i, dialog başlığı), `electron/preload.cjs`, `electron/csp.cjs` (köken), `build/installer.nsi` (ad, klasör, kısayol, kayıt defteri, dosya ilişkisi), `scripts/sha256sums.mjs`, `scripts/make-installer.mjs`, `scripts/gen-uninstall-list.mjs`, `src/ui/app.js`, `chrome.js` (marka metni), `recovery.js`, `src/shared/schema.js` (biçim imzası), `src/kernel/kernel.js`, `src/i18n/tr.js` ve `en.js` (metinler), `test/*.mjs|py` (özellikle `electron.test.mjs`, `security.test.mjs`, `app.test.py`, `i18n.test.mjs`), `DESIGN.md`, `OKUBENI.md`, `docs/*`. Karar: **`app://atolye/` köken adı değiştirilmeyebilir** (iç ayrıntı; değişirse CSP ve testler birlikte). Uyumluluk: (a) açma: `.mhnk` ve `.acad` ikisi de; kaydederken `.mhnk`, `.acad` olarak yazma, özgün dosyaya dokunma; belge biçim imzası `schema.js` geriye dönük okunur; (b) ayarlar: ilk açılışta `%APPDATA%/AtolyeCAD/settings.json` ve `recovery/` yeni `Mihenk` klasörüne **kopyalanır**, eskisi silinmez; (c) Windows dosya ilişkisi `.mhnk` (+ `.acad` ek ilişki, isteğe bağlı); (d) uninstall listesi yeni ada göre yeniden üretilir; eski kurulum yan yana kalabilir.
Exe simgesi ve sürüm bilgisi (wine gerektirmeden): `electron-builder` yerine/sonrasında saf JS **`resedit`** (npm) ile `.exe`nin PE kaynaklarına `brand/app-icon/app-icon.ico` ve VERSIONINFO (ProductName "Mihenk CAD/CAM", CompanyName, FileDescription, ProductVersion) yazılır; gerekçe: `electron-builder` Windows'ta rcedit için wine ister, Linux'ta derlerken wine yok; `resedit` yalnız Node'dur. **Yalnız öneri, denenmedi.** Pencere simgesi: `BrowserWindow({ icon })` ile `app-icon-256.png`.

### Kabul ölçütleri (ölçülebilir)
1. `python3 design/tools/contrast.py` çıktısında "KALDI" yok (her iki tema), ve uygulamada kullanılan her metin/zemin çifti tabloda var.
2. Tıklanabilir her öğe `getBoundingClientRect()` ≥ 32×32 px (Büyük ≥ 40×40), istisna yok (Playwright testiyle taranır; 36 px kısıt düğmeleri geçer).
3. Klavye turu: Tab ile tüm etkileşimli öğelere ulaşılır, her birinde 2 px odak halkası (ölçülü `outline-width`), Esc/Enter paneli kapatır/onaylar, Ctrl+K komut arar; tuzak (odak çıkışsız) yok.
4. İki tema: tüm maketlerin ve uygulamanın açık/koyu ekran görüntüleri; ham HEX taraması (`grep "#[0-9a-f]\{3,6\}" src/ui/*.css` yalnız tokens'ta).
5. İki dil: TR ve EN'de metin taşması/kırpılması yok (görüntü incelemesi), `test/i18n.test.mjs` geçer, yeni anahtarlar iki dilde var.
6. Yoğunluk: Normal ve Büyük'te şerit/panel taşması yok, hedef ölçüleri sağlanır.
7. Durum görünürlüğü: kip, etkin araç, hesap, kaydedilmemiş, hata sayısı her zaman görünür (Playwright: seçiciler mevcut).
8. Hata düğmesi tıklanınca ilk hatalı özelliğe gider; hatalı çip ikonlu.
9. Yıkıcı onayda varsayılan odak güvenli düğmede (`document.activeElement` testi).
10. `prefers-reduced-motion`'da animasyon süresi ≤ 0,01 ms.
11. Mevcut tüm testler (`npm run test:all`) geçer; `.acad` açılır, `.mhnk` kaydedilir ve geri açılır; eski ayar klasöründen ayarlar taşınır.
12. Hiçbir ekranda "AtolyeCAD" metni kalmaz (Hakkında'daki "eski AtolyeCAD dosyaları" notu hariç).

## 10. Doğrulanamayanlar
Marka çakışması web aramasıyla sınırlı (BRAND.md). Maketler Chrome'da denendi; Electron 45 içinde (color-mix, `-webkit-line-clamp`) beklenen desteklenir ama denenmedi. Büyük yoğunluk ekran görüntüleri ve 1200 px alt sınır elle doğrulanmadı. `resedit` önerisi denenmedi. woff2 Türkçe kapsama kodla doğrulanmadı, görsel.
