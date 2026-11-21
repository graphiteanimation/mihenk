// İmalat şeridi yerleşimi (saf veri; node testli). [grup kimliği, etiket anahtarı, komutlar, seçenekler]
// WP-16: "Sarma" grubu (4. eksen) is akisi ile Kutuphane arasinda: taşmada Kutuphane'den hemen sonra gider.
// WP-21: "Kesme verisi" (cam-cutdata) kendi "Kütüphane" grubunda, eylemlerden hemen önce. Şerit dar kalınca taşma menüsüne (») ilk o
// gider (fitRibbon sağdan sola gizler): 1440 piksel genişlikte delik grubu görünür kalır, kesme verisi » menüsünden açılır.
export const CAM_RIBBON = [
  ['cam-setup', 'cam.grp.setup', ['cam-setup', 'cam-stock', 'cam-machine', 'cam-tools']],
  ['cam-2d', 'cam.grp.2d', ['cam-op-face', 'cam-op-contour', 'cam-op-pocket', 'cam-op-chamfer', 'cam-op-slot', 'cam-op-trace', 'cam-op-adaptive'], { extra: ['cam-op-flat'] }], // WP-12: Yatay yalnız taşma menüsünde (şerit taşmasın)
  ['cam-drill', 'cam.grp.drill', ['cam-op-drill', 'cam-op-thread', 'cam-op-circular', 'cam-op-threadmill']],
  ['cam-3d', 'cam.grp.3d', ['cam-op-adaptive3d', 'cam-op-zlevel'], { extra: ['cam-op-parallel', 'cam-op-scallop', 'cam-op-pencil'] }], // WP-15: kalan 3D komutları taşma menüsünde (şerit taşmasın)
  ['cam-flow', 'cam.grp.flow', ['cam-tpl', 'cam-holeseq', 'cam-parts', 'cam-units', 'cam-quote']], // WP-14 iş akışı; dar şeritte Kütüphane'den sonra taşar
  ['cam-wrap', 'cam.grp.wrap', ['cam-op-wrapcontour', 'cam-op-wrappocket', 'cam-op-wrapdrill']], // WP-16 4. eksen sarma; dar seritte Kutuphane'den sonra tasar
  ['cam-lib', 'cam.grp.library', ['cam-cutdata']],
  ['cam-act', 'cam.grp.actions', ['cam-compute', 'cam-sim', 'cam-post', 'cam-nc'], { cls: 'end', extra: ['cam-ncsim'] }] // WP-22d: NC dosyası simülasyonu yalnız taşma menüsünde (şerit taşmasın),
];
