// Kurulum dosyalarının SHA-256 özetlerini release/SHA256SUMS.txt dosyasına yazar (sha256sum -c ile doğrulanabilir biçim).
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const REL = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'release');
const files = fs.readdirSync(REL).filter((f) => /^AtolyeCAD-Kurulum-.*\.exe$/.test(f)).sort();
if (!files.length) { console.error('release/ içinde kurulum dosyası yok'); process.exit(1); }
const lines = files.map((f) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(REL, f))).digest('hex')}  ${f}`);
fs.writeFileSync(path.join(REL, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
