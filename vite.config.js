// Mihenk derleme ayarları: göreli yol (Electron app:// için), ES biçiminde worker, wasm dosyaları varlık olarak.
import { defineConfig } from 'vite';

// Geliştirme sunucusunda (HMR için WebSocket ve satır içi stil) CSP gevşetilir; üretim derlemesine DOKUNULMAZ.
const devCsp = { name: 'atolye-dev-csp', apply: 'serve', transformIndexHtml: (html) => html.replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:*").replace("style-src 'self'", "style-src 'self' 'unsafe-inline'") };

export default defineConfig({
  plugins: [devCsp],
  base: './',
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['replicad-opencascadejs', '@salusoft89/planegcs'] },
  assetsInclude: ['**/*.wasm'],
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 20000 },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
