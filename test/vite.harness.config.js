// Sketcher testi için küçük vite ayarı (kök vite.config.js'ten bağımsız)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export default {
  root, base: './', cacheDir: path.join(root, 'node_modules/.vite-harness'),
  server: { port: 5199, strictPort: true, host: '127.0.0.1' },
  optimizeDeps: { exclude: ['replicad-opencascadejs', '@salusoft89/planegcs'] },
};
