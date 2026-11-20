// WP-17: ISO 286-1/-2 gecme toleranslari (tablo, 0 < anma olcusu <= 500 mm). Birim: tablolar mikrometre, cikis mm.
// Kapsam (O onerisi, WP-17 notu): temel tolerans IT1-IT16; milde d e f g h js k m n p, delikte D E F G H JS K M N P.
// Delik sapmalari genel kuraldan (EI = -es, A..H) ve ozel kuraldan (K, M, N <= IT8; P <= IT7: ES = -ei + Delta, Delta = IT(n) - IT(n-1);
// anma <= 3 mm icin Delta = 0) turetilir. Kapsam disi harf/derece/olcu: null (arayuz "tabloda yok" der; deger uydurulmaz).
// JS/js: +-IT/2; IT7..IT11 tek sayili mikrometrede +-(IT-1)/2 (ISO 286-1 dipnotu).
export const RANGES = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500]; // ust sinirlar (dahil); alt sinir bir oncekidir (haric)
export const IT = {
  1: [0.8, 1, 1, 1.2, 1.5, 1.5, 2, 2.5, 3.5, 4.5, 6, 7, 8],
  2: [1.2, 1.5, 1.5, 2, 2.5, 2.5, 3, 4, 5, 7, 8, 9, 10],
  3: [2, 2.5, 2.5, 3, 4, 4, 5, 6, 8, 10, 12, 13, 15],
  4: [3, 4, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20],
  5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
  12: [100, 120, 150, 180, 210, 250, 300, 350, 400, 460, 520, 570, 630],
  13: [140, 180, 220, 270, 330, 390, 460, 540, 630, 720, 810, 890, 970],
  14: [250, 300, 360, 430, 520, 620, 740, 870, 1000, 1150, 1300, 1400, 1550],
  15: [400, 480, 580, 700, 840, 1000, 1200, 1400, 1600, 1850, 2100, 2300, 2500],
  16: [600, 750, 900, 1100, 1300, 1600, 1900, 2200, 2500, 2900, 3200, 3600, 4000],
};
// Mil temel sapmalari: d..h ust sapma es; k..p alt sapma ei (mikrometre)
const SHAFT_ES = {
  d: [-20, -30, -40, -50, -65, -80, -100, -120, -145, -170, -190, -210, -230],
  e: [-14, -20, -25, -32, -40, -50, -60, -72, -85, -100, -110, -125, -135],
  f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68],
  g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20],
  h: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
const SHAFT_EI = {
  k: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5], // yalniz IT4..IT7; diger derecelerde 0
  m: [2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
  n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40],
  p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68],
};
export const SHAFT_LETTERS = ['d', 'e', 'f', 'g', 'h', 'js', 'k', 'm', 'n', 'p'];
export const HOLE_LETTERS = ['D', 'E', 'F', 'G', 'H', 'JS', 'K', 'M', 'N', 'P'];

export function rangeIndex(size) {
  if (!(size > 0) || size > 500) return -1;
  for (let i = 0; i < RANGES.length; i++) if (size <= RANGES[i]) return i;
  return -1;
}
export function itValue(grade, size) { const i = rangeIndex(size); const row = IT[grade]; return i < 0 || !row ? null : row[i]; }
const jsHalf = (it, grade) => (grade >= 7 && grade <= 11 && Number.isInteger(it) && it % 2 === 1 ? (it - 1) / 2 : it / 2);

// 'H7', 'h6', 'JS9', 'k6' -> {letter, grade, hole}
export function parseFit(code) {
  const m = /^\s*([A-Za-z]{1,2})\s*(\d{1,2})\s*$/.exec(String(code || '')); if (!m) return null;
  const letter = m[1], grade = +m[2];
  const hole = letter === letter.toUpperCase();
  if (hole ? !HOLE_LETTERS.includes(letter) : !SHAFT_LETTERS.includes(letter)) return null;
  if (!IT[grade]) return null;
  return { letter, grade, hole };
}
// Sapmalar (mm): {upper, lower} ya da null (kapsam disi)
export function fitDeviations(code, size) {
  const f = parseFit(code); const i = rangeIndex(size); if (!f || i < 0) return null;
  const it = IT[f.grade][i]; const L = f.letter.toLowerCase();
  let es, ei;
  if (L === 'js') { const h = jsHalf(it, f.grade); es = h; ei = -h; }
  else if (!f.hole) {
    if (SHAFT_ES[L]) { es = SHAFT_ES[L][i]; ei = es - it; }
    else { ei = L === 'k' && (f.grade < 4 || f.grade > 7) ? 0 : SHAFT_EI[L][i]; es = ei + it; }
  } else {
    // delik: ES (ust), EI (alt)
    if (SHAFT_ES[L]) { const EI = -SHAFT_ES[L][i]; return mm(EI + it, EI); }
    const lim = L === 'p' ? 7 : 8;
    if (f.grade > lim || f.grade < 3) return null; // ozel kural yalniz bu derecelerde (kapsam)
    const shaftEi = L === 'k' && (f.grade < 4 || f.grade > 7) ? 0 : SHAFT_EI[L][i];
    const delta = i === 0 ? 0 : IT[f.grade][i] - IT[f.grade - 1][i];
    const ES = -shaftEi + delta; return mm(ES, ES - it);
  }
  return mm(es, ei);
}
const mm = (u, l) => ({ upper: +(u / 1000).toFixed(5), lower: +(l / 1000).toFixed(5) });
