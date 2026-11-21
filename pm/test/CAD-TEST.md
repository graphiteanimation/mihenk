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
| T03 | KISMEN | 0 | C-31…C-36 | R4 fillet aracı yapamadı (C-31, C-33), revolve ile dolanıldı; `pm/test/sonuc/T03.md` |
| T04 | KISMEN | −0,00003 % | C-37…C-44 | eğik düzlem yok, R16 fillet ve birleştirme olmadı (iki gövde); `pm/test/sonuc/T04.md` |
| T05 | KISMEN | −0,054 % | C-45 (+C-31) | R1 sap fillet'i yapılamadı (C-31); `pm/test/sonuc/T05.md` |
| T06 | GEÇTİ | 0 | C-46 | loft (ekle + kes); `pm/test/sonuc/T06.md` |
| T07 | GEÇTİ | 0 | C-47…C-49 | revolve + ayna + R8 fillet zinciri; teğet/ofset hesapla verildi; `pm/test/sonuc/T07.md` |
| T08 | GEÇTİ | +0,00001 % | — (C-14 yeniden) | zarf, iki yönlü (simetrik) extrude, delik; teğetler hesapla verildi; `pm/test/sonuc/T08.md` |
| T09 | KISMEN | +0,107 % | C-50, C-51 | 0,5 pah yapılamadı (C-50: kabuk sonrası kalıcı ad çakışması); pah dışında birebir; `pm/test/sonuc/T09.md` |

## Ara rapor (prizmatik faz, T01–T04, 2026-11-21)
- Puan: GEÇTİ 2 (T01, T02) · KISMEN 2 (T03, T04) · KALDI 0. Dört parçada da son geometri referansla aynı (hacim farkı ≤ %0,0001, kutu aynı) — eksikler ancak dolanarak kapatılabildi.
- Düzeltme paketi WP-CAD1 için öncelik (Engel/Hata, yüksek): C-39 boolean sonrası aynı düzlemli yüzleri birleştir (UnifySameDomain) · C-31 aynı yüz çifti arasındaki birden çok kenarın kalıcı adı · C-33 kenarı köşede biten fillet brepcheck hatası · C-42 teğet temaslı Join/Combine · C-14 Extrude mesafesi · C-21 budamada daire kayması · C-37 açılı yapı düzlemi.
- Orta: C-23 kanal aracı iç kısıtları · C-40 koordinat girişi uç noktayı birleştirmiyor · C-25/C-38 eskiz fillet paneli ve köşe seçimi · C-15 son dosyalar · C-32 fillet önizlemesi.
- Konfor (toplu): C-13, C-16, C-17, C-19, C-22, C-26, C-28, C-29, C-30, C-34, C-35, C-36, C-41, C-43, C-44.
