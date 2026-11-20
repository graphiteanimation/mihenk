# İfade sözdizimi (parametreler ve ölçü alanları)

Kaynak: `src/shared/expr.js`. Kurallar O-044 (WP-08, F-15) ile güncellendi.

- Sayılar: ondalık ayraç **virgül ya da nokta** (`12,5` = `12.5`). Bu yüzden fonksiyon bağımsız değişkenleri **`;`** ile ayrılır: `max(10;5)`. (`max(10,5)` tek bağımsız değişken `10.5` olarak okunur; değişmedi.)
- İşleçler ve öncelik (yüksekten düşüğe): parantez → `^` (sağdan birleşir: `2^3^2 = 512`) → tekli `-`/`+` → `*` `/` → `+` `-`.
- **Tekli eksi üsten sonra uygulanır** (O-044): `-2^2 = -4`, `-x^2 = -(x^2)`, `2*-3^2 = -18`, `-2^-2 = -0,25`, `(-2)^2 = 4`. Eski sürümde `-2^2 = 4` idi.
- Fonksiyonlar (açılar derece): `sin cos tan asin acos atan sqrt abs min max round floor ceil`.
- Tanımsız/sonsuz sonuç hata verir (`expr.not_number`): `tan(90)`, `1/0`, `sqrt(-1)`.
- Sabit `pi`; aynı adla tanımlanan kullanıcı parametresi sabiti **gölgeler** (O-044). Eskiden parametre sessizce yok sayılıyordu.
- Parametre bir önceki parametreleri kullanabilir (sırayla çözülür).

Eski belgeler: açılışta, yeni kurala göre değeri değişen parametre/alan varsa bir kez bilgilendirme gösterilir ("Yeni ifade kuralına göre değeri değişenler: …"). Yalnız `-` ile başlayan üslü terimler ve `pi` adlı parametre kullanan ifadeler etkilenir.
