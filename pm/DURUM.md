# Mihenk — durum (2026-11-21 UTC, dördüncü oturum sürüyor) — KESİNTİSİZ (K-043)

Sürüm: kurulu 0.3.0 · `master` = 0.6'nın bütün iş paketleri (WP-12…WP-22). Etiketler `v0.4.0`, `v0.5.0` (yerel). 0.6.0 adayı: tam test zinciri koşuyor, sonra kurulum dosyası ve bilgisayara kurulum + `pm/KABUL-WINDOWS.md`.
Depo: bulut çalışma alanı (GitHub itme yetkisi reddedildi, O-047); yedek `Documents\Fusion-Klon-Spec\Mihenk\mihenk.git` bundle ile eşitleniyor.
Düzen: `pm/CALISMA-DUZENI.md` · işler: `pm/BACKLOG.md` · kararlar: `pm/KARARLAR.md` (K-043, O-047…O-050) · WP notları: `pm/wp/`.

## Bu oturumda biten (hepsi bağımsız doğrulandı; bulgular düzeltildi ya da açık olarak not edildi)
- 0.4: WP-21 → `v0.4.0` (`test:all` 31/31 adım, 6237 denetim).
- 0.5: WP-12 uyarlanır kaba/rest, WP-13 bağlama gövdeleri/tri-dexel/G-code sim, WP-14 iş akışı → `v0.5.0` (34/34 adım, 6438 denetim).
- 0.6: WP-15 3B işleme, WP-16 4. eksen sarma, WP-17 teknik resim, WP-18 3+2 (G68.2), WP-19 sweep/loft/draft/diş/IGES, WP-22a PDF altlık, WP-22b ayrıntılı simülasyon, WP-22c CAM verimi (3B kaba P2: 85 → 51–57 sn), WP-22d G-code sim arayüzü. OKUBENI ve kılavuz 0.6'ya güncellendi.

## Sıradaki
1. `test:all` (0.6.0) → `v0.6.0` etiketi → `npm run dist` → kurulum + SHA-256 `Mihenk\surumler\`.
2. Bilgisayara kurulum ve `pm/KABUL-WINDOWS.md` (ekran kontrolüyle). Geçerse DURUM ilk satırı `TAMAMLANDI`.

## Açık (0.6'yı engellemez)
- Tezgâhta doğrulanmayanlar: tüm NC, özellikle 3+2 (G68.2), sarma (G93), G76/G87.
- WP-22c 2d: uyarlanır kabada temas açısı tepe aşımı (ızgara). Tri-dexel varsayılan değil (O-050).
- GitHub'a itme yok (CI koşmuyor).

## Notlar
- Fusion deneme lisansı 23 Kasım 2026'da bitiyor.
