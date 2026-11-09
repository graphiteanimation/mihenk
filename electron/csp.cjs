// İçerik güvenlik ilkesi (S-05). index.html'deki <meta> ile BİREBİR aynı olmalıdır (test/security.test.mjs doğrular).
// 'unsafe-inline' yok: arayüz yalnız CSSOM (el.style) ile biçim verir.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Geometri çekirdeği (OpenCascade/embind) çalışma anında JS işlevi üretir (`new Function`); bu yüzden YALNIZ çekirdek işçisinin
// betik yanıtı 'unsafe-eval' alır. İşçide DOM, `native` köprüsü ve ağ yoktur (connect-src 'self', webRequest ağı keser);
// ana belge (meta + yanıt başlığı) 'unsafe-eval' İÇERMEZ.
const WORKER_CSP = CSP.replace("script-src 'self' 'wasm-unsafe-eval'", "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'");
const isWorkerScript = (rel) => /^\/assets\/worker-[\w-]+\.js$/.test(rel);

module.exports = { CSP, WORKER_CSP, isWorkerScript };
