# Mihenk CAD/CAM 0.3.0

Parametrik CAD/CAM programı. Makineden bağımsızdır; kendi tezgâh profilinizi eklersiniz. Dosya uzantısı `.mhnk`.

**NC çıktısı makinede DOĞRULANMAMIŞTIR.** Her programı önce simülasyonda ve makinede havada, tek blok ile deneyin. A ekseni yönü makinede teyit edilmedi. Ayrıntı: kılavuzun GÜVENLİK bölümü.

## Kurulum
1. `Mihenk-Kurulum-0.3.0.exe` dosyasını çalıştırın. Yönetici izni istemez; `%LOCALAPPDATA%\Programs\Mihenk` altına kurulur.
2. Dosya imzasızdır. SmartScreen uyarırsa: "Ek bilgi" → "Yine de çalıştır".
3. Çalıştırmadan önce dosyanın SHA-256 değerini `SHA256SUMS.txt` içindeki satırla karşılaştırın (PowerShell: `Get-FileHash .\Mihenk-Kurulum-0.3.0.exe`). Değerler aynı değilse dosyayı kullanmayın.

## İlk çalıştırma
1. Dil ve tema seçin (Türkçe / English).
2. İmalat çalışma alanında **Tezgâh** ile kendi tezgâh profilinizi ekleyin (bir şablonu kopyalayıp doldurun ya da dosyadan içe aktarın). Genel şablonlardaki boş alanları doldurmadan post çalışmaz; bu bilerek böyledir.
3. Kayıt otomatik alınır (60 sn); önceki sürüm `.mhnk.bak` olarak saklanır.

## Kılavuz
Adım adım kullanım, örnek parça, güvenlik kapıları ve sorun giderme:
- Türkçe: `docs/KILAVUZ.md`
- English: `docs/MANUAL.md`

## Bilinen sınırlar
- Uyarlamalı (adaptive) yol ve 3B yüzey işleme yok; 4/5 eksen makine ve eşzamanlı 4 eksen yok.
- Benzetim, yan yüzeydeki küçük oyulmaları görmez; mengene/tabla/aparat modeli yok.
- Takım düzenleyicide eğim açısı alanı yok: merkez kesmeyen takımla rampa/helis yolu engellenir.
- Windows kurulumu Linux'ta üretildi; ilk denemeyi siz yapacaksınız.
- Sweep, loft, montaj, teknik resim yok.

## Kaynak kod ve lisanslar
`npm install`, `npm run dev`, `npm run build`. Tasarım sözleşmesi `DESIGN.md`. Açık kaynak: OpenCascade (LGPL-2.1 + istisna), replicad (MIT), PlaneGCS/FreeCAD (LGPL-2.1+), three.js (MIT), Electron (MIT).

---

## Sürüm notu şablonu (yayın öncesi doldurulur; GitHub Release metni olarak kullanılır)
<!-- Bu bölüm yalnız şablondur; her sürümde kopyalanıp doldurulur, "Bilinen sınırlar" yukarıdaki güncel listeyle eşitlenir. -->
```
# Mihenk <sürüm> — <tarih>

## Yenilikler
- <kullanıcıya görünen değişiklikler, WP numarasıyla>

## Düzeltmeler
- <düzeltilen hatalar>

## Doğrulama (bu sürüm için ölçüldü)
- npm run test:all: <adım>/<adım> geçti, <denetim> denetim, <kalan> kalan
- Altın parça seti (npm run test:altin): P1–P4 BLOCK <a>/<b>/<c>/<d>; temiz NC <x>/<y> setup; tablo: release/altin/sonuc.json
- Kurulu sürüm duman testi (Actions, Windows): <geçen>/<toplam>
- Windows kabul listesi (pm/KABUL-WINDOWS.md): <geçen>/<toplam> — <tarih>, <Windows sürümü> ya da "uygulanmadı"

## Bilinen sınırlar
- <OKUBENI.md "Bilinen sınırlar" ile aynı>; NC çıktısı makinede DOĞRULANMAMIŞTIR.

## Dosyalar
- Mihenk-Kurulum-<sürüm>.exe — SHA-256: <değer> (SHA256SUMS.txt ile aynı). Kod imzasızdır.
```

