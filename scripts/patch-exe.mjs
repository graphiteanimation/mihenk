// Windows exe'sinin gömülü simgesini ve sürüm bilgisini yazar (wine/rcedit gerekmez; saf JS `resedit`, yalnız geliştirme bağımlılığı).
// electron-builder `signAndEditExecutable:false` ile rcedit'i atlar; bu betik release/win-unpacked/Mihenk.exe dosyasını yerinde günceller.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as ResEdit from 'resedit';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const exePath = path.join(ROOT, 'release', 'win-unpacked', 'Mihenk.exe');
if (!fs.existsSync(exePath)) { console.error('Mihenk.exe yok: önce electron-builder --win dir çalıştırın'); process.exit(1); }
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(ROOT, 'brand', 'app-icon', 'app-icon.ico')));
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);

// simge: var olan tüm simge gruplarının (kimlik + dil) içeriği Mihenk simgesiyle değişir; yoksa 1/1033 oluşturulur
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const targets = groups.length ? groups.map((g) => [g.id, g.lang]) : [[1, 1033]];
for (const [id, lang] of targets) ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map((i) => i.data));

// sürüm bilgisi
const [maj, min, pat] = pkg.version.split('.').map(Number);
const vis = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
const vi = vis[0] || ResEdit.Resource.VersionInfo.createEmpty();
const lang = vis[0] && vis[0].getAllLanguagesForStringValues()[0] || { lang: 1033, codepage: 1200 };
vi.setFileVersion(maj, min, pat, 0, lang.lang); vi.setProductVersion(maj, min, pat, 0, lang.lang);
vi.setStringValues(lang, { ProductName: 'Mihenk CAD/CAM', FileDescription: 'Mihenk CAD/CAM', CompanyName: 'D160 Makina', LegalCopyright: 'D160 Makina', OriginalFilename: 'Mihenk.exe', InternalName: 'Mihenk', ProductVersion: pkg.version, FileVersion: pkg.version });
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log(`Mihenk.exe: simge (${targets.map((t) => t.join('/')).join(', ')}) ve sürüm bilgisi ${pkg.version} yazıldı`);
