# İş emirleri (iş oturumları buradan alır; yönetim oturumu yazar)
Durumlar: Taslak (yönetim onayı yok) · Hazır · Sürüyor · Bitti · Takıldı.

## İE-001 — CAD testi T02–T10 · **Sürüyor** (oturum 2026-11-21)
- Amaç: `pm/test/CAD-TEST.md` planındaki kalan dokuz parçayı Mihenk arayüzünden çizmek, kaydetmek, referansla ölçmek.
- Kapsam: T02–T10. Her parça `Documents\Mihenk\Mihenk\cad-test\Tnn\` klasörüne `.mhnk` + `.step`; hacim ve kutu referansla; kaydedilen STEP build123d ile bağımsız karşılaştırılır (T01 yöntemi, `pm/test/sonuc/T01.md`). Bulgular `C-22`'den devam, `pm/test/sonuc/Tnn.md`.
- Kod düzeltmesi yapılmaz (bulgular WP-CAD1'e). T04'ten sonra `CAD-TEST.md` İlerleme tablosu ve ara rapor.
- Kabul: 9 parçanın her biri GEÇTİ / KISMEN / KALDI ile sınıflı, nedenleri yazılı; puan tablosu güncel.
- Açılış metni:
```
Mihenk: devam
```

## İE-002 — C-14 ve C-21 düzeltmesi · **Taslak** (G-2 kararı bekliyor)
- C-14: Extrude panelinde görünen mesafe ile uygulanan mesafe farkı; yeniden üret, düzelt, test.
- C-21: Budamada dairenin yaya dönüşürken kayması; önce yeniden üretme testi, sonra merkez/yarıçap korunarak düzeltme.
- Kabul: iki yeniden üretme testi önce kalır sonra geçer; sketch ve app testleri yeşil; CI yeşil.

## İE-003 — CAD test parçalarının otomatik regresyonu · **Taslak** (G-8)
- Biten her `cad-test/Tnn.mhnk` depoya `test/cad-bench/mhnk/` altına alınır; yeni test adımı her belgeyi çekirdekte yeniden hesaplar, hacim ve kutuyu `ref/` ile karşılaştırır (±%0,1).
- Kabul: T01 ve o ana dek biten parçalar testte; `npm run test:all` zincirine eklendi; CI yeşil.
