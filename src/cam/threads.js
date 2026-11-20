// Metrik (ISO) dis olculeri: iri hatve tablosu ve dis derinligi. Saf JS.
// Kaynak (WP-07 dilim 1):
//  - iri hatve tablosu: ISO 724 / ISO 261 degerleri; kaynak engineeringtoolbox.com "ISO 724 - Metric Threads" tablosu (M1.6..M48, orada listelenen satirlar).
//    O tabloda olmayan satirlar (M18, M33, M39, M45 vb.) DOGRULANAMADIGI icin yazilmadi -> hatve elle girilir.
//  - temel yukseklik H = (sqrt 3 / 2) P. Ic dis derinligi (5/8) H = 0,5413 P (ic dis kucuk capi D1 = D - 1,0825 P, sim/tool.js ISO_MINOR_K ile ayni);
//    dis dis derinligi h3 = (17/24) H = 0,6134 P (dis dis kucuk capi d3 = d - 1,2269 P).
// Ince hatve tablosu BILEREK yok: ince hatveler cok cesitli, dogrulanan liste yok -> kullanici hatveyi girer.
export const METRIC_COARSE = {
  1.6: 0.35, 2: 0.4, 2.5: 0.45, 3: 0.5, 3.5: 0.6, 4: 0.7, 5: 0.8, 6: 1, 8: 1.25, 10: 1.5, 12: 1.75, 14: 2, 16: 2, 20: 2.5, 22: 2.5, 24: 3, 27: 3, 30: 3.5, 36: 4, 42: 4.5, 48: 5,
};
export const H_FACTOR = Math.sqrt(3) / 2;       // H = H_FACTOR * P
export const INT_DEPTH_K = (5 / 8) * H_FACTOR;  // ic dis derinligi / P = 0,5413
export const EXT_DEPTH_K = (17 / 24) * H_FACTOR; // dis dis derinligi / P = 0,6134

// nominal capin iri hatvesi; tabloda yoksa null
export function coarsePitch(major) {
  const k = Object.keys(METRIC_COARSE).find((x) => Math.abs(Number(x) - major) < 1e-9);
  return k === undefined ? null : METRIC_COARSE[k];
}
export const designationList = () => Object.keys(METRIC_COARSE).map((k) => `M${k}`);
// dis derinligi (yaricap yonunde, mm) ve kucuk cap
export function threadDepth(pitch, internal) { return pitch * (internal ? INT_DEPTH_K : EXT_DEPTH_K); }
export function minorDia(major, pitch, internal) { return major - 2 * threadDepth(pitch, internal); }
