# Mihenk 0.6 — CAD kabiliyet testi (yol haritası)

Amaç: Mihenk'in yalnız CAD kısmını, bilinen test parçalarını arayüzden çizerek sınamak; eksikleri ve hataları bulmak. CAM bu testin dışında. Ölçüt K-046 ile aynı: başka bir sistemin (burada build123d / OpenCascade referans modeli) sonucuyla karşılaştırma.

## Parça seti (10)
Kaynak: Too Tall Toby "Party Pack" ve yarışma çizimleri; build123d belgelerinde ölçülü çizim + referans modelle yayımlanmış (`test/cad-bench/resim`, `ref/*.py`, Apache-2.0 depo). Referans hacimler bu oturumda build123d 0.13 ile hesaplandı.

| T | Parça | Sınanan kabiliyet | Referans hacim (mm³) | Kutu (mm) |
|---|---|---|---|---|
| T01 | ppp0103 C Clamp Base | yuvarlatılmış dikdörtgen, cep, konik havşa delik | 35 605,55 | 42 × 104 × 16 |
| T02 | ppp0101 Bearing Bracket | kanal (slot), kademeli havşa, ayna, gövde bölme, fillet | 102 198,22 | 115 × 50 × 68 |
| T03 | ppp0104 Angle Bracket | iki düzlemde eskiz, birleşme, kanal kesme, fillet | 39 743,21 | 80 × 38 × 51 |
| T04 | ppp0109 Corner Tie | yüze kadar extrude, eğik düzlem, bölme, ayna | 113 789,26 | 118,24 × 75 × 105 |
| T05 | ppp0102 Post Cap | revolve, elips, süpürme (sweep), bölme | 42 248,62 | 58,5 × 49 × 48 |
| T06 | ppp0105 Paste Sleeve | ofset eskiz, loft (ekle + kes) | 55 617,53 | 66 × 44 × 133 |
| T07 | ppp0110 Light Cap | teğet yay, ofset, revolve, kesişim, ayna | 207 159,36 | 84 × 184 × 46 |
| T08 | 23-T-24 Curved Support | teğet doğrular/yaylar (zarf), iki yönlü extrude, delik | 165 914,07 | 55 × 167,5 × 60 |
| T09 | Mihenk özel kutu (`ref/t09-kutu.py`) | konik extrude (draft), kabuk, boss, nervür, pah | 34 412,56 | 100 × 60 × 30 |
| T10 | Düzenleme dayanıklılığı | T02'de geçmişin ortasındaki 3 ölçüyü değiştir + güncelle; P3 STEP içe al, yüz taşı/ofsetle/sil; T02'den teknik resim | T02 değişik parametrelerle yeniden hesaplanır | — |

## Kabul ölçütü (her parça)
- Hacim referansa göre ±%0,1, kutu ±0,05 mm (Mihenk kütle özellikleri paneli + kaydedilen STEP'in bağımsız ölçümü).
- Tam tanımlı eskizler (serbestlik 0), geçmişte hata yok.
- Kayıt: `Documents\Mihenk\Mihenk\cad-test\Tnn\` → `Tnn.mhnk` + `Tnn.step` + `Tnn-notlar.md` (süre, adım sayısı, bulgular).
- Bulgular `C-13…` diye numaralanır: Engel (parça bitmiyor) · Hata (yanlış sonuç/çökme) · Eksik (özellik yok, dolanarak yapıldı) · Konfor (yavaş/zor).

## Fazlar
1. **Hazırlık** (bitti 2026-11-21): set, referanslar, bu plan.
2. **Prizmatik** T01–T04 → ara rapor; engeller hemen düzeltme paketine (WP-CAD1).
3. **Döner ve serbest** T05–T08.
4. **Gelişmiş ve düzenleme** T09–T10.
5. **Rapor**: puan tablosu (parça × geçti/kısmen/kaldı, süre), bulgu listesi, düzeltme paketleri BACKLOG'a. Düzeltmelerden sonra kalan parçalar yeniden çizilir (regresyon).

## Bilinen ön bulgular
- C-13 (kullanıcı, 2026-11-21): Mihenk'i kapatırken çıkan uyarı penceresi arayüzle uyumsuz (yerel işletim sistemi kutusu, tasarım sistemine uymuyor). Test sırasında ekran görüntüsü alınacak.

## İlerleme
| T | Sonuç | Hacim farkı | Bulgular | Not |
|---|---|---|---|---|
| T01 | GEÇTİ | 0 | C-13…C-19 | `pm/test/sonuc/T01.md` |
| T02 | GEÇTİ | +0,00007 % | C-22…C-30 | `pm/test/sonuc/T02.md` |
