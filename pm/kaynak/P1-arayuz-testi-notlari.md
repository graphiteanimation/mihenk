# P1 çizim testi (Mihenk 0.3.0 arayüzü, Claude ekran kontrolüyle) — 2026-11-20

Dosya: P1_SK8_mihenk_cizim.mhnk. Ağaç: Sketch1 (XZ, profil, yazılı uzunluk/açı zinciri) → Extrude 14 → Sketch2 (Ø8 + 2 mm yarık) → Extrude Kes Tümü → Sketch3 (XY ofset 6, 2 nokta) → Delik Ø5,5 Tümü → Yuvarlat R1 ×4 → Pah 0,5 ×3 → Taşı/Kopyala (X 180°) → Pah 0,5 ×3 → Taşı/Kopyala (X 180° geri).
Sonuç: kutu 42×14×32,8, sınırlar X −21…21, Y −14…0, Z 0…32,8 (STEP ile birebir). Hacim 9016,05 mm³ (STEP 8958,26; fark 57,8 mm³ = X yönlü sıkma vidası bölgesi, çizilmedi: STEP'te vida gövdeye kaynaşık, T-06).
Ara hacimler hesapla birebir: 10,28 → 9,33 → 9,045 → 9,033 cm³.

## Bulgular (CAD arayüzü)
- C-01 Daire: yazılan yarıçap ölçü kısıtı eklemiyor (kılavuz ekler diyor); serbestlik 1 kaldı, Ölçü aracıyla Ø8 eklendi.
- C-02 Ölçü etiketleri noktanın tam üstünde duruyor; tıklama etikete gidiyor, nokta yakalanmıyor (etiketi sürüklemek gerekti).
- C-03 Kes Extrude, Kapsam=Mesafe 18 önizlemede yarık bölgelerini kesmedi (9,6 cm³); Tümü ile doğru (9,33). Teyit gerekli.
- C-04 Pah/Yuvarlat: seçim × ile temizlenince seçim alanı pasif kalıyor, kenar tıklamaları boşa gidiyor.
- C-05 Görünüm: döndürme yalnız sağ tuş sürükleme; view cube'de arka/alt/köşe yok → arka ve alt kenarlar seçilemedi, gövde 180° çevrilip geri çevrildi (Fusion: cube'ün her yüzü/köşesi).
- C-06 Komut paneli açıkken Ön/İzo düğmeleri görünümü değiştirmedi; panel kapanınca çalıştı.
- C-07 Nokta kısayolu küçük harf "p" çalışmadı (menüde P).
- C-08 Yardımcı çizgiler "açık profil" uyarısı veriyor; yapı (construction) geçişi sağ tık menüsünde bulunamadı.
- Olumlu: yazılı uzunluk/açı zinciri hızlı ve kesin; Delik özelliği; hacim/kutu/ağırlık merkezi paneli; otomatik kayıt.
- C-09 Takım içe aktarma (Bu belge) aynı numaralı takımı kopyalıyor (T20 iki kez); Kütüphane'den "belgeye al" sonrası sekme kendiliğinden Bu belge'ye geçiyor, ikinci tıklama boşa gidiyor.
- C-10 İşlem yeniden açılınca Seçim türü "Yüz" görünüyor ama seçim eskiz profili (gösterim tutarsız).
- C-11 Eskizdeki yapı (construction) yapılmamış açık çizgi daireyi bölünce Kontur/Cep "Takım (Ø6) bu cebe sığmıyor" diyor — gerçek neden (açık çizgi bölgeyi yarıyor) söylenmiyor. Çizgiler yapıya çevrilince çözüldü.
- C-12 İşlem panelinde bir alan değişince panel kaydırması başa dönüyor; alttaki alanlara her seferinde yeniden kaydırmak gerekiyor (yanlış alana yazma riski: geri çekilme 20 oldu).

# P1 CAM (arayüz) — 2026-11-20
Takımlar: P1-takimlar.json "İçe aktar" ile (7 takım, ön ayarlı). Tezgâh: Neway kopyası; maxRpm 8000, kesme 5000, hızlı 24000 (test değerleri, plan), güvenli Z G28.
S1 (G55, +Y, stok üst merkezi, +2 her yan): Yüzey T20 ✓; Cep T21 (Sketch 4 halka, paso 1,2/7,1, pay 0,3, rampa 3°) ✓ 4245 mm kesme ≈2,5 dk; Kontur T22 dış ✓; Bore Ø8 = Kontur T22 içte ✓ (Cep T22 hep "sığmıyor"); Yarık T29 ✗ (Ø2 2 mm yarığa "içte" sığmaz, açık zincir/yarık işlemi arayüzde yok → bastırıldı; T-02); Pah ✗ (işlem yok, T-03).
S2 (G57, −Y): Yüzey T20 ✓ (önceki setup stoğu seçeneği yok: Stok türü yalnız Modelden pay/Kutu/Silindir → T-04).
S3 (G58, +Y, A 90°): Delik özelliği delik olarak tanındı (2× Ø5,5 boydan boya) ✓; Punta T24 (Mutlak Z) + Delme T30 G83 Q2 ✓ hesap.
Simülasyon 15 sorun. NC ÜRETİLMEDİ: 11 engel —
 * Delme T30 taşma 35 < derinlik 36,8 (gerçek, T-08) + tutucu stoğa çarpıyor (hayalet stok, T-04)
 * Punta T24 hızlı hareket stok içinde ×2 (hayalet stok, T-04), oyma 0,49 mm (T-17 türü, incelenmeli)
 * Post alanları boş: dwellAddress, dwellUnit, cycleDwellAddress, cycleDwellUnit, g541Range — P1 bunları kullanmadığı halde engelliyor (M-03). Değerler makine projesinde teyit edilmeden girilmedi.
Ek bulgular:
- M-01 Cep/Kontur "Gövde dış sınırı" tek kesit alıyor: Y=−7 kesitinde flanş delikleri flanşı bölünce "3 ayrı dış sınır" hatası (T-19/T-20 ailesi); halka eskizi elle çizildi.
- M-02 3+1 setup'ta orijin A=0 çerçevesinde "stok üst merkezi"; A90 sonrası stok üstü Z=+18,4 oluyor, Mutlak Z derinliği buna göre girilmeli (ilk denemede 50,45 mm derinlik çıktı). Panelde açıklama yok.
- M-03 Kullanılmayan post özellikleri NC'yi engelliyor (betik yolunda S2 NC üretilmişti); setup bazında post yok, tek tıkla tüm program.
- Olumlu: takım JSON içe aktarma + ön ayar; delik özelliği → delme işlemi otomatik; hesap/sim hızlı; sorun listesi satır → harekete gitme.
