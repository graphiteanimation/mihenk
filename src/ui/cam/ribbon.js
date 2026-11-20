// İmalat şeridi yerleşimi (saf veri; node testli). [grup kimliği, etiket anahtarı, komutlar, seçenekler]
// WP-21: "Kesme verisi" (cam-cutdata) Hazırlık grubunda; şerit dar kalırsa grup taşma menüsüne gider (chrome.js fitRibbon).
export const CAM_RIBBON = [
  ['cam-setup', 'cam.grp.setup', ['cam-setup', 'cam-stock', 'cam-machine', 'cam-tools', 'cam-cutdata']],
  ['cam-2d', 'cam.grp.2d', ['cam-op-face', 'cam-op-contour', 'cam-op-pocket', 'cam-op-chamfer', 'cam-op-slot', 'cam-op-trace', 'cam-op-adaptive']],
  ['cam-drill', 'cam.grp.drill', ['cam-op-drill', 'cam-op-thread', 'cam-op-circular', 'cam-op-threadmill']],
  ['cam-3d', 'cam.grp.3d', ['cam-op-surface']],
  ['cam-act', 'cam.grp.actions', ['cam-compute', 'cam-sim', 'cam-post', 'cam-nc'], { cls: 'end' }],
];
