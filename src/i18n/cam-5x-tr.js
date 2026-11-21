// WP-18 (K-029): cok eksen altyapisi ve 3+2 konumlu isleme metinleri (Turkce). Anahtar kumesi cam-5x-en.js ile birebir ayni.
export default {
  "cam.machine.generic5ac": "Genel 3+2 tabla-tabla A/C",
  "cam.machine.generic5bc": "Genel 3+2 tabla-tabla B/C",
  "err.cam.kin.tilt_with_rotary": "Bir setup'ta hem 3+1 döner eksen açısı hem 3+2 eğim açık olamaz. Birini kapatın.",
  "err.cam.kin.tilt_cyl_stock": "Eğik (3+2) setup'ta yuvarlak stok kullanılamaz. Kutu stok seçin.",
  "err.cam.kin.unreachable": "Takım ekseni ({axis}) bu tezgâhın döner eksenleriyle elde edilemiyor. Yönü ya da tezgâh kinematiğini kontrol edin.",
  "err.cam.kin.limits": "Gereken döner eksen açıları ({angles}) tezgâh sınırlarının dışında ({limits}).",
  "err.cam.kin.no_rotary": "Eğik (3+2) setup için tezgâh profilinde döner eksen yok.",
  "err.cam.kin.axis_missing": "Tezgâh profilinde {axis} döner ekseni yok.",
  "err.cam.kin.bad_vector": "Takım ekseni birim vektör değil.",
  "err.cam.gate.no_rotary_axis": "Bu setup {axis} döner eksenini istiyor ama tezgâh profilinde yok.",
  "err.cam.gate.rot_limit": "{axis} açısı ({a}°) tezgâh sınırlarının dışında ({min}°…{max}°).",
  "err.cam.gate.unwound_head": "Açılmış 3+2 çıkışı kafa döner ekseninde desteklenmiyor (pivot/RTCP yok). Eğik düzlem çıkışını seçin.",
  "err.cam.post.tilt_needs_nc_rotary": "Eğik (3+2) setup için döner eksenler NC ekseni olmalı (elle indeksleme kipi desteklenmiyor).",
};
