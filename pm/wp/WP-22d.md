# WP-22d — NC dosyasını simüle et (arayüz)
Dal: `wp-22d` (tabanı `wp-22b`). Sim çekirdeğine, ops/, kernel, sketch, resime dokunulmadı.

## Yapılanlar
- `src/ui/cam/ncsim.js` (yeni): `simulateNcText(ops, text, ad)` ve `simulateNcFile(ops)`. Metin `gcodeToProgram` ile (belge takım listesi; seçili setup başta olmak üzere çözülmüş tüm setup'lar: WCS + A eşleşmesi, stok/tezgâh) IR programına çevrilir, mevcut kapı + sim çubuğu akışına verilir. Eşleşmeyen WCS/A bölümü, metin olmayan dosya ve tüm `cam.gcode.*` hataları sorun listesinde Türkçe/İngilizce, satır numaralı gösterilir (`err.cam.ncsim.*`).
- `ops.js`: `prepare()` içindeki kapı+sim bölümü `runGates()` olarak ayrıldı (davranış aynı); `showNc()` NC penceresinden dönen 'sim' değeriyle simüle eder; `ops.simulateNcText` sarmalayıcı.
- NC penceresi: "Kodu simüle et" düğmesi (`nc-simulate`; NC eskiyse uyarır). Diskten: `cam-ncsim` komutu, `cam-act` grubunda `extra` (» taşma menüsü; şerit genişliği değişmez).
- Electron: yeni yalnız okunur tür `ncread` (.nc .tap .txt), `OPEN_ONLY`; `native:save` reddeder, uzantı denetimi ve `readLimited`/`MAX_FILE` aynen.
- i18n TR/EN (`cam-ui2-*`).

## Testler (bu ortamda koşuldu)
`wp22d` 27/0 (test-all listesinde: 5 örnek programın NC'si geri sim hacmi IR ile < %1, kapılar, bozuk satır hataları satır numaralı, ncread kaynak denetimi), `security` 87/0, `i18n` 52/0, `cam` 602/0, `sim` 138/0, `cam-ui.test.py` 361/0 (WP-22d senaryosu 8 denetim), `app.test.py` 411/0, Electron 79/0 (ncread: okuma, kaydetme reddi, .exe reddi), `npx vite build` geçer.

## Açıklar
- Hiçbir NC tezgâhta doğrulanmadı. Diskten dosya akışı arayüzde (tarayıcı seçici / Electron diyalog) uçtan uca elle denenmedi; Electron yanı yalnız IPC düzeyinde test edildi.
- Oynatıcı yükseklik haritasıyla çalışır (WP-22b açığı); NC simülasyonunda ayrıntılı (tri) kip kullanılmaz.
- NC'nin WCS/A'sı hiçbir setup'la eşleşmezse simüle edilmez (stok bilinmez); çözüm setup'ı NC ile aynı yapmaktır.
- Sim çubuğu etiketi bölüm başına "NC T{n} (satır {l})".
- `npm run test:all` tek seferde koşulmadı.
