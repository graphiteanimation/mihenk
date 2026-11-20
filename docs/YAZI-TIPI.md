# Eskiz metni yazı tipi

Eskiz metni aracı (WP-08) sistem yazı tipi kullanmaz; uygulamayla tek bir açık lisanslı yazı tipi gelir, böylece aynı metin her makinede aynı geometriyi verir.

| | |
|---|---|
| Yazı tipi | Inter Regular (TrueType, `glyf`) |
| Dosya | `src/ui/sketch/fonts/Inter-Regular.ttf` (değiştirilmeden kopyalandı) |
| Kaynak | npm paketi `@expo-google-fonts/inter` 0.4.2, `400Regular/Inter_400Regular.ttf` |
| SHA-256 | `a414b48aa577ef2c62ebb135341ddeef33ee26a4f5dc9f787f93c1aab08ebb50` |
| Telif | Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter) |
| Lisans | SIL Open Font License 1.1 — tam metin `src/ui/sketch/fonts/OFL.txt` (paketin `LICENSE_FONT` dosyası) |

Notlar
- Lisans metninin başlığında "Reserved Font Name" bildirilmemiştir. Dosya değiştirilmeden (alt küme alınmadan) dağıtılır; yazı tipi tek başına satılmaz.
- Glif konturları çakışabildiğinden (Inter'de "k", "ş", "ç" gibi) metin eskize eklenirken sıfır olmayan sarım kuralıyla temizlenir (`src/ui/sketch/text.js` `cleanSegments`); eskizde yalnız dış sınır çizgileri kalır.
- Metin eklendikten sonra çizgi konturudur; metin olarak yeniden düzenlenmez.
- Dağıtım: lisans metinleri `public/licenses/` üzerinden `dist/licenses/` içine (dolayısıyla kurulum paketine) kopyalanır; Hakkında penceresi bunları anar.
