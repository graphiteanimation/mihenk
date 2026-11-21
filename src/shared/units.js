// WP-14: belge birimi (mm / inc). Cekirdek ve IR daima mm'dir; birim yalniz GORUNTULEME, GIRIS ve post cikisinda (G20/G21) uygulanir.
// Saf JS. Durum: modul duzeyinde etkin birim (CAM denetleyicisi belge degisince setUnits ile gunceller).
export const MM_PER_INCH = 25.4;
export const UNIT_SYSTEMS = ['mm', 'inch'];
let current = 'mm';
export const getUnits = () => current;
export function setUnits(u) { current = u === 'inch' ? 'inch' : 'mm'; return current; }
export const normUnits = (u) => (u === 'inch' ? 'inch' : 'mm');
const round = (v, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

// mm degeri -> goruntulenen deger (etkin birimde); inc ise 25,4'e bolunur
export const mmToUnits = (mm, u = current) => (mm == null ? mm : u === 'inch' ? round(mm / MM_PER_INCH) : mm);
// kullanicinin girdigi deger (etkin birimde) -> mm
export const unitsToMm = (v, u = current) => (v == null || Number.isNaN(v) ? v : u === 'inch' ? round(v * MM_PER_INCH) : v);
// birim etiketi: 'mm' -> 'in', 'mm/min' -> 'in/min'; mm disindaki etiketler (derece, devir, ...) degismez
// birim etiketleri bicim kodudur (sozluk metni degil); Turkce arayuzde ilerleme etiketi 'mm/dk'
const SL = '/', MIN = 'min', DK = 'dk';
const LABELS = { mm: 'in', ['mm' + SL + MIN]: 'in' + SL + MIN, ['mm' + SL + DK]: 'in' + SL + DK };
export function unitLabel(label, u = current) { return u === 'inch' && label in LABELS ? LABELS[label] : label; }
export const isLengthUnit = (label) => Object.hasOwn(LABELS, label);
// Uzunluk girdisi: "12,5", "1.5in", '0.25"', "25 mm" -> { mm } | null (gecersiz). Birimsiz sayi etkin birimdedir.
export function parseLength(text, u = current) {
  const m = /^\s*([-+]?(?:\d+[.,]?\d*|[.,]\d+)(?:e[-+]?\d+)?)\s*(mm|in|inch|"|cm|m)?\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const n = Number(m[1].replace(',', '.')); if (!Number.isFinite(n)) return null;
  const s = (m[2] || '').toLowerCase();
  if (s === 'mm') return { mm: n };
  if (s === 'cm') return { mm: round(n * 10) };
  if (s === 'm') return { mm: round(n * 1000) };
  if (s === 'in' || s === 'inch' || s === '"') return { mm: round(n * MM_PER_INCH) };
  return { mm: unitsToMm(n, u) };
}
