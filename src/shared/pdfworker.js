// WP-22a (O-049): pdf.js islemcisi icin ayri is parcacigi girisi. Vite bu dosyayi `assets/pdfworker-<ozet>.js` olarak paketler;
// elektron/csp.cjs `isWorkerScript` YALNIZ `worker-*.js` (cekirdek isci) adini tanir -> bu isci 'unsafe-eval' ALMAZ (security.test.mjs denetler).
// pdf.js 6.x calisma aninda kod uretmez (eval / new Function yok); isci yalniz 'self' kaynaktan yuklenir.
import 'pdfjs-dist/build/pdf.worker.mjs';
