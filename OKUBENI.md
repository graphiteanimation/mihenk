# Mihenk CAD/CAM 0.2.0

Parametrik CAD programı (önceki adı AtolyeCAD). Bu sürümde yalnız CAD vardır: CAM, post, montaj ve teknik resim yok. Dosya uzantısı `.mhnk`; eski `.acad` dosyaları açılır, kaydedince `.mhnk` yazılır (özgün dosyaya dokunulmaz).

## Kurulum
`Mihenk-Kurulum-0.2.0.exe` dosyasını çalıştırın. Yönetici izni istemez; `%LOCALAPPDATA%\Programs\Mihenk` altına kurulur, masaüstüne kısayol koyar. Dosya imzasız olduğu için Windows SmartScreen "Windows kişisel bilgisayarınızı korudu" diyebilir: "Ek bilgi" → "Yine de çalıştır".

## İlk parça
1. **Sketch** → XY düzlemine tıklayın → **Dikdörtgen** ile çizin → **Ölçü** ile kenarlara değer verin → **Sketch'i Bitir**.
2. **Extrude** → mesafe girin → Tamam.
3. Üst yüze yeni **Sketch** → **Daire** → Bitir → **Extrude**, işlem **Kes**.
4. **Yuvarlat**: kenarlara tıklayın, yarıçap girin.
5. Dosya → Kaydet (`.mhnk`), Dosya → STEP Dışa Aktar.

Fare: sağ tuş döndürür, orta tuş kaydırır, tekerlek yakınlaştırır. Düzen → Parametreler ile `L = 80` gibi değerler tanımlayıp ölçülerde `L/2` yazabilirsiniz.

## Bilinen sınırlar
- Eski AtolyeCAD ayarları ilk açılışta yeni klasöre kopyalanır (eski klasör silinmez).
- Kurulum dosyası Linux'ta üretildi; Windows'ta kurulumu ve açılışı ilk siz deneyeceksiniz.
- Sketch'te budama (trim), ofset, sketch içi desen/ayna, spline ve elips yok.
- Sweep, loft, draft, modellenmiş diş, montaj, teknik resim, CAM ve post yok.
- Yuvarlatılmış kenarlı gövdede Kabuk başarısız olabilir; kabuğu yuvarlatmadan önce uygulayın.
- Model değişince bir kenar/yüz seçimi kaybolursa özellik kırmızı olur; düzenleyip yeniden seçin.

## Kaynak kod
Kaynak kod: `npm install`, `npm run dev` (geliştirme), `npm run build`. Tasarım sözleşmesi `DESIGN.md`. Kullanılan açık kaynak: OpenCascade (LGPL-2.1 + istisna), replicad (MIT), PlaneGCS/FreeCAD (LGPL-2.1+), three.js (MIT), Electron (MIT).
