# Mihenk CAD/CAM 0.3.0

Parametrik CAD/CAM programı. Hedef makine: Neway VM1160H + Mitsubishi M80V + GSA bölme başlığı (A ekseni). Dosya uzantısı `.mhnk`.

**NC çıktısı makinede DOĞRULANMAMIŞTIR.** Her programı önce simülasyonda ve makinede havada, tek blok ile deneyin. A ekseni yönü makinede teyit edilmedi. Ayrıntı: kılavuzun GÜVENLİK bölümü.

## Kurulum
1. `Mihenk-Kurulum-0.3.0.exe` dosyasını çalıştırın. Yönetici izni istemez; `%LOCALAPPDATA%\Programs\Mihenk` altına kurulur.
2. Dosya imzasızdır. SmartScreen uyarırsa: "Ek bilgi" → "Yine de çalıştır".
3. Çalıştırmadan önce dosyanın SHA-256 değerini `SHA256SUMS.txt` içindeki satırla karşılaştırın (PowerShell: `Get-FileHash .\Mihenk-Kurulum-0.3.0.exe`). Değerler aynı değilse dosyayı kullanmayın.

## İlk çalıştırma
1. Dil ve tema seçin (Türkçe / English).
2. İmalat çalışma alanında makine profilini seçin. Neway şablonundaki boş alanları doldurmadan post çalışmaz; bu bilerek böyledir.
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
