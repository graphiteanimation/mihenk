// Kapi/uyari nesnesi -> okunur metin (NC basligi icin). Sozluk: Ingilizce CAM metinleri (saf veri modulleri).
// writeComment ASCII'ye cevirir; burada yalniz yer tutucular doldurulur (sayilar 3 ondaliga yuvarlanir).
import coreEn from '../../i18n/cam-core-en.js';
import postEn from '../../i18n/cam-post-en.js';
import uiEn from '../../i18n/cam-ui2-en.js';
import k5En from '../../i18n/cam-5x-en.js'; // WP-18

const DICT = { ...coreEn, ...postEn, ...k5En };
const fieldName = (v) => (typeof v === 'string' && uiEn['cam.field.' + v]) || v; // alan yolu -> okunur ad (ham ad NC basligina yazilmaz)
const fmtVal = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : String(v));

export function describeIssue(g) {
  const code = String(g?.code ?? '');
  const tpl = DICT['err.' + code];
  const params = g?.params || {};
  let text = tpl ? tpl.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? (k === 'field' ? fieldName(params[k]) : fmtVal(params[k])) : m)) : code;
  if (params.op && !(tpl && tpl.includes('{op}'))) text = `${params.op}: ${text}`;
  else if (!params.op && g?.opId) text = `${g.opId}: ${text}`;
  return text;
}
