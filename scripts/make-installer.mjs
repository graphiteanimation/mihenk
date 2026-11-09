// NSIS kurulum dosyasını derler (Linux'ta electron-builder önbelleğindeki makensis; Windows'ta PATH'teki makensis).
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
let exe = 'makensis', env = { ...process.env };
const cache = path.join(os.homedir(), '.cache', 'electron-builder');
if (process.platform === 'linux') {
  const base = path.join(cache, 'nsis-3.0.4.1');
  const dir = fs.existsSync(base) ? fs.readdirSync(base).map((d) => path.join(base, d)).find((d) => fs.existsSync(path.join(d, 'linux', 'makensis'))) : null;
  if (!dir) { console.error('makensis bulunamadı: ' + base); process.exit(1); }
  exe = path.join(dir, 'linux', 'makensis'); env.NSISDIR = dir;
}
if (!fs.existsSync(path.join(ROOT, 'release', 'uninstall-files.nsh'))) { console.error('release/uninstall-files.nsh yok: önce node scripts/gen-uninstall-list.mjs'); process.exit(1); }
const r = spawnSync(exe, ['-V2', '-DVERSION=' + pkg.version, 'installer.nsi'], { cwd: path.join(ROOT, 'build'), env, stdio: 'inherit' });
process.exit(r.status ?? 1);
