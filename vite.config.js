// AtolyeCAD derleme ayarları: göreli yol (Electron app:// için), ES biçiminde worker, wasm dosyaları varlık olarak.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['replicad-opencascadejs', '@salusoft89/planegcs'] },
  assetsInclude: ['**/*.wasm'],
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 20000 },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
