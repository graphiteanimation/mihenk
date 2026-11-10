// Yapılandırılmış hata: metin değil {code, params} taşır; arayüz t('err.' + code, params) ile çevirir.
// Bu dosya sözlük içermez (worker'a girer); yalnız hata türü ve yardımcılar.
export class KErr extends Error {
  constructor(code, params = {}) {
    super(code);
    this.name = 'KErr'; this.code = code; this.params = params;
  }
}

// Sözlük anahtarını işaretler (kimlik işlevi): test, bu anahtarın sözlükte olduğunu doğrular.
export const tk = (key) => key;

// Her hatayı düz {code, params} nesnesine çevirir (postMessage ile geçebilir).
export function toErr(e) {
  if (e && typeof e === 'object' && typeof e.code === 'string' && e.params !== undefined) return { code: e.code, params: e.params };
  if (typeof e === 'number') return { code: 'occt', params: {} };
  // OCCT (WASM) istisnası: mesajı yok; metin olarak '[object WebAssembly.Exception]' göstermek yerine kod ver
  if (typeof WebAssembly !== 'undefined' && WebAssembly.Exception && e instanceof WebAssembly.Exception) return { code: 'occt', params: {} };
  const m = e?.message ?? String(e);
  if (/^\d+$/.test(m)) return { code: 'occt', params: {} };
  return { code: 'internal', params: { message: m } };
}

export const isErr = (x) => !!x && typeof x === 'object' && typeof x.code === 'string';
