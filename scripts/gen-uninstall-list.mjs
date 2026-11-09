// Kaldırıcı için KURULUMUN yazdığı dosyaların listesi (S-07): release/win-unpacked ağacından üretilir.
// Çıktı: release/uninstall-files.nsh  (yalnız Delete ve RMDir satırları; RMDir yalnız boş dizini siler, "/r" kullanılmaz).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'release', 'win-unpacked');
const OUT = path.join(ROOT, 'release', 'uninstall-files.nsh');
if (!fs.existsSync(SRC)) { console.error('release/win-unpacked yok: önce electron-builder --win dir çalıştırın'); process.exit(1); }
const files = [], dirs = [];
(function walk(d, rel) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? rel + '\\' + e.name : e.name;
    if (/[$"`\r\n]/.test(e.name)) throw new Error('NSIS için güvensiz dosya adı: ' + e.name);
    if (e.isDirectory()) { dirs.push(r); walk(path.join(d, e.name), r); } else files.push(r);
  }
})(SRC, '');
dirs.sort((a, b) => b.split('\\').length - a.split('\\').length || b.localeCompare(a)); // en derin önce
const lines = ['; otomatik üretildi: scripts/gen-uninstall-list.mjs', ...files.map((f) => `Delete "$INSTDIR\\${f}"`), ...dirs.map((d) => `RMDir "$INSTDIR\\${d}"`)];
fs.writeFileSync(OUT, lines.join('\r\n') + '\r\n');
console.log(`uninstall-files.nsh: ${files.length} dosya, ${dirs.length} klasör`);
