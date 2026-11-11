// Mitsubishi M80V postu (Fanuc tarzi cekirdekten turer). Farklar: spesifikasyon CP6/CP7 ve "Makine verisi" tablosu.
// BILINMEYEN degerler null birakilir; gerektiginde post cam.post.prop_missing ile durur (tahmin yok).
// Uretilen NC yalniz test ciktisidir; makinede kosturulabilir diye sunulmaz.
import { createFanucPost } from './fanuc-base.js';

export function createM80VPost() {
  return createFanucPost({
    id: 'mitsubishi-m80v',
    defaultProps: {
      // [Dogrulandi] G84 senkron (#8159=1), F = adim, M29 gerekmez; post yine ,R1 yazar (makine verisi)
      tapMode: 'pitch', rigidTapM: null, tapR1: true,
      // BILINMIYOR: G04 adresi/birimi (M80 1/2 kilavuz bol. 8.1-8.2), cevrim bekleme adresi/birimi
      dwellAddress: null, dwellUnit: null, cycleDwellAddress: null, cycleDwellUnit: null,
      // BILINMIYOR: guvenli Z geri cekilme yontemi (G28 / G53) ve G53 icin makine Z'si
      safeRetract: null, safeRetractZ: null,
      // BILINMIYOR: G54.1 P araligi
      g541Range: null,
      // Soguatma: M8/M9 sozlesme lehcesinde; mist/air/through kodlari BILINMIYOR
      coolantCodes: { flood: 'M8', mist: null, air: null, through: null, off: 'M9' },
      // [Dogrulandi] A: 180 derece iki adimda, kisa yol (#8213=1); kilit M10/M11 PLC'ce yonetiliyor -> makine profili clamp.output
      aSplit180: true, rotaryMode: '6a',
      // Secenek: G05 P10000 / G05 P0 (mevcut isler kullaniyor; varsayilan kapali)
      highSpeedOn: null, highSpeedOff: null,
    },
  });
}
