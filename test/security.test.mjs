// Güvenlik birim testleri (Electron'suz): şema doğrulaması, atomik yazma, yol denetimi, CSP tutarlılığı, kurulum betiği.
// Çalıştır: node test/security.test.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { validateDoc, checkEnvelope, LIMITS, FILE_VERSION } = await import(pathToFileURL(path.join(ROOT, 'src/shared/schema.js')).href);
const { atomicWrite, isInside } = require(path.join(ROOT, 'electron/safe-write.cjs'));
const { CSP, WORKER_CSP, isWorkerScript } = require(path.join(ROOT, 'electron/csp.cjs'));

let pass = 0, fail = 0, skipped = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const code = (fn) => { try { fn(); return null; } catch (e) { return e.code || ('JS:' + e.message); } };
const box = { id: 'b1', type: 'primitive', name: 'K', kind: 'box', x: '0', y: '0', z: '0', w: '40', d: '30', h: '20', op: 'new' };
const good = { params: [{ name: 'L', expr: '10' }], features: [box], rollback: null };

console.log('1. şema doğrulaması');
ok(validateDoc(good) === true, 'geçerli belge reddedildi');
ok(code(() => validateDoc(5)) === 'schema.bad_field', 'doc=5');
ok(code(() => validateDoc('str')) === 'schema.bad_field', 'doc=str');
ok(code(() => validateDoc({ params: [null], features: [] })) === 'schema.bad_field', 'params=[null]');
ok(code(() => validateDoc({ params: [], features: [null] })) === 'schema.bad_field', 'features=[null]');
ok(code(() => validateDoc({ params: [], features: [{ id: 'x', type: 'warp' }] })) === 'schema.unknown_type', 'bilinmeyen tür');
ok(code(() => validateDoc({ params: [], features: [{ id: 'x', type: 'sketch', ents: 5 }] })) === 'schema.bad_field', 'ents=5');
ok(code(() => validateDoc({ params: [], features: [box, box] })) === 'schema.dup_id', 'yinelenen kimlik');
ok(code(() => validateDoc({ ...good, rollback: -5 })) === 'schema.bad_field', 'rollback=-5');
ok(code(() => validateDoc({ ...good, rollback: 'x' })) === 'schema.bad_field', 'rollback=x');
ok(code(() => validateDoc({ params: [], features: [{ ...box, w: { a: 1 } }] })) === 'schema.bad_field', 'w nesne');
ok(code(() => validateDoc({ params: [], features: [{ ...box, op: 'weird' }] })) === 'schema.bad_field', 'op listede yok');
let deep = null; for (let i = 0; i < 4000; i++) deep = [deep];
ok(code(() => validateDoc({ params: [], features: [{ ...box, note: deep }] })) === 'schema.too_deep', '4000 kat iç içe');
let deep65 = null; for (let i = 0; i < 70; i++) deep65 = { a: deep65 };
ok(code(() => validateDoc({ params: [], features: [{ ...box, note: deep65 }] })) === 'schema.too_deep', '70 kat iç içe');
ok(code(() => validateDoc(JSON.parse('{"params":[],"features":[],"__proto__":{"x":1}}'))) === 'schema.bad_key', '__proto__ anahtarı');
ok(code(() => validateDoc(JSON.parse('{"params":[],"features":[{"id":"a","type":"primitive","w":1e999}]}'))) === 'schema.bad_field', 'sonsuz sayı');
ok(code(() => validateDoc({ params: [], features: [{ ...box, name: 'x'.repeat(LIMITS.str + 1) }] })) === 'schema.too_long', 'çok uzun ad');
ok(code(() => validateDoc({ params: [], features: Array.from({ length: LIMITS.features + 1 }, (_, i) => ({ ...box, id: 'b' + i })) })) === 'schema.too_many_features', 'özellik sayısı 5001');
ok(code(() => validateDoc({ params: [], features: Array.from({ length: LIMITS.features }, (_, i) => ({ ...box, id: 'b' + i })) })) === null, 'özellik sayısı 5000 kabul');
ok(code(() => validateDoc(good, { byteLength: LIMITS.fileBytes + 1 })) === 'schema.file_too_big', 'dosya 200 MB üstü');
ok(code(() => validateDoc(good, { byteLength: LIMITS.fileBytes })) === null, 'dosya 200 MB kabul');
const pat = (o) => ({ params: [{ name: 'N', expr: '50' }], features: [box, { id: 'p1', type: 'pattern', kind: 'rect', source: { kind: 'feature', id: 'b1' }, count1: '3', step1: '20', dir1: 'X', count2: '1', step2: '20', dir2: 'Y', ...o }] });
ok(code(() => validateDoc(pat({ count1: '2000' }))) === null, 'desen 2000 kabul');
ok(code(() => validateDoc(pat({ count1: '2001' }))) === 'schema.pattern_too_big', 'desen 2001');
ok(code(() => validateDoc(pat({ count1: '200000' }))) === 'schema.pattern_too_big', 'desen 200000');
ok(code(() => validateDoc(pat({ count1: 'N*10', count2: '5' }))) === 'schema.pattern_too_big', 'desen parametreli 50*10*5');
ok(code(() => validateDoc(pat({ kind: 'circ', count: '2001' }))) === 'schema.pattern_too_big', 'dairesel desen 2001');
ok(code(() => validateDoc(pat({ count1: 'QQ' }))) === null, 'çözülemeyen ifade: çekirdek özellik hatası olarak bildirir');
ok(checkEnvelope({ app: 'Mihenk', version: 1, doc: {} }).newer === false, 'sürüm 1');
ok(checkEnvelope({ app: 'Mihenk', version: FILE_VERSION + 1, doc: {} }).newer === true, 'daha yeni sürüm bildirilir');
ok(checkEnvelope({ app: 'Mihenk', doc: {} }).version === 1, 'sürümsüz = 1');
ok(code(() => checkEnvelope({ app: 'Baska', doc: {} })) === 'schema.not_doc', 'başka uygulama');
ok(code(() => checkEnvelope({ app: 'Mihenk', version: 'x', doc: {} })) === 'schema.bad_field', 'sürüm metin');

console.log('2. atomik yazma + yedek');
const tmpd = fs.mkdtempSync(path.join(os.tmpdir(), 'acad-sec-'));
const f = path.join(tmpd, 'a.mhnk');
await atomicWrite(f, Buffer.from('v1'), { backup: true });
ok(fs.readFileSync(f, 'utf8') === 'v1' && !fs.existsSync(f + '.bak'), 'ilk kayıt, yedek yok');
await atomicWrite(f, Buffer.from('v2'), { backup: true });
ok(fs.readFileSync(f, 'utf8') === 'v2' && fs.readFileSync(f + '.bak', 'utf8') === 'v1', 'ikinci kayıt: .bak = önceki sürüm');
await atomicWrite(f, Buffer.from('v3'), { backup: true });
ok(fs.readFileSync(f, 'utf8') === 'v3' && fs.readFileSync(f + '.bak', 'utf8') === 'v2', 'üçüncü kayıt: .bak = bir önceki');
const leftovers = () => fs.readdirSync(tmpd).filter((n) => n.endsWith('.tmp'));
ok(leftovers().length === 0, 'geçici dosya kalmadı');
// hata enjeksiyonu: yazma, fsync, kopya, rename her adımda hedef değişmez ve geçici dosya silinir
const real = fs.promises;
const faulty = (where) => ({
  ...fs,
  promises: {
    ...real,
    open: async (p, fl) => { const h = await real.open(p, fl); if (fl !== 'wx') return h; return { writeFile: async (d) => { if (where === 'write') { await h.writeFile(d.subarray(0, 1)); throw Object.assign(new Error('disk dolu'), { code: 'ENOSPC' }); } return h.writeFile(d); }, sync: async () => { if (where === 'sync') throw new Error('fsync'); return h.sync(); }, close: () => h.close() }; },
    copyFile: async (a, b) => { if (where === 'copy') throw Object.assign(new Error('kopya'), { code: 'EIO' }); return real.copyFile(a, b); },
    rename: async (a, b) => { if (where === 'rename') throw new Error('rename'); return real.rename(a, b); },
  },
});
for (const where of ['write', 'sync', 'copy', 'rename']) {
  let err = null; try { await atomicWrite(f, Buffer.from('BOZUK'), { backup: true, fsImpl: faulty(where) }); } catch (e) { err = e; }
  ok(err !== null && fs.readFileSync(f, 'utf8') === 'v3', `hata (${where}): hedef dokunulmadı`);
  ok(leftovers().length === 0, `hata (${where}): geçici dosya temizlendi`);
}
ok(['v2', 'v3'].includes(fs.readFileSync(f + '.bak', 'utf8')), 'hatalı denemeler .bak dosyasını bozmadı (eski ya da hedefle aynı)');
fs.rmSync(tmpd, { recursive: true, force: true });

console.log('3. yol denetimi (S-13)');
const D = path.join(ROOT, 'dist');
ok(isInside(D, path.join(D, 'index.html')), 'dist içi');
ok(isInside(D, path.join(D, 'assets', 'a.js')), 'dist/assets');
ok(!isInside(D, path.join(ROOT, 'dist-secret', 'x.txt')), 'dist-secret kardeş dizini reddedilir');
ok(!isInside(D, path.join(ROOT, 'distx')), 'distx reddedilir');
ok(!isInside(D, path.join(ROOT, 'package.json')), 'üst dizin');
ok(!isInside(D, path.join(D, '..', 'electron', 'main.cjs')), '.. ile çıkış');
ok(isInside(D, path.join(D, '..foo', 'a')), '"..foo" adlı alt dizin geçerli (yanlış ret yok)');

console.log('4. CSP tutarlılığı');
for (const html of ['index.html', 'dist/index.html']) {
  // dist/index.html yalnız `vite build` sonrası vardır: yoksa bu denetim atlanır (geçti sayısı 1 az çıkar: Linux 69 / build sonrası 70). Atlanan sayı aşağıda ayrıca yazılır.
  if (!fs.existsSync(path.join(ROOT, html))) { skipped++; continue; }
  const m = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(fs.readFileSync(path.join(ROOT, html), 'utf8'));
  ok(m && m[1] === CSP, html + ': meta CSP, electron/csp.cjs ile aynı');
}
for (const d of ["default-src 'none'", "script-src 'self' 'wasm-unsafe-eval'", "img-src 'self' data: blob:", "worker-src 'self' blob:", "connect-src 'self'", "font-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) ok(CSP.split('; ').includes(d), 'CSP içinde ' + d);
ok(!/'unsafe-eval'|'unsafe-inline'/.test(CSP), 'ana belge CSP: unsafe-eval / unsafe-inline yok');
ok(/'unsafe-eval'/.test(WORKER_CSP) && !/'unsafe-inline'/.test(WORKER_CSP), 'yalnız işçi yanıtı unsafe-eval alır');
ok(isWorkerScript('/assets/worker-CHepCBmu.js') && !isWorkerScript('/assets/index-abc.js') && !isWorkerScript('/index.html'), 'işçi betiği ayrımı');
ok(!isWorkerScript('/assets/simworker-DA-b6Gn8.js'), 'sim işçisi unsafe-eval almaz (yalnız çekirdek işçisi)');

console.log('5. kurulum betiği (statik)');
const nsi = fs.readFileSync(path.join(ROOT, 'build/installer.nsi'), 'utf8');
ok(!/RMDir\s+\/r\s+"\$INSTDIR"/i.test(nsi), 'RMDir /r "$INSTDIR" yok');
ok(/\$\\"\$INSTDIR\\\$\{APP\}\.exe\$\\" \$\\"%1\$\\"/.test(nsi), '.mhnk komutu tırnaklı');
ok(/\\Mihenk/.test(nsi) && /DirLeave|\.onVerifyInstDir/.test(nsi), 'dizin sonuna Mihenk ekleme işlevi var');
ok(/StrCpy \$0 \$INSTDIR 7 -7/.test(nsi) && /Section "\$\(SEC_PROGRAM\)"\s*\n[^\n]*\n\s*Call EnsureSubdir/.test(nsi), 'EnsureSubdir 7 karakter karşılaştırır ve kurulum bölümü başında da çağrılır (DirLeave çalışmasa da)');
ok(/uninstall-files\.nsh/.test(nsi), 'kaldırıcı dosya listesini kullanıyor');

for (const wf of ['ci.yml', 'release.yml']) {
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows', wf), 'utf8');
  const uses = [...y.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)].map((m) => m[1]).filter((u) => !u.startsWith('./'));
  ok(uses.length > 0 && uses.every((u) => /@[0-9a-f]{40}$/.test(u)), wf + ': tüm action\'lar commit SHA\'sına sabit: ' + uses.filter((u) => !/@[0-9a-f]{40}$/.test(u)).join(','));
}
ok(/NSIS_VERSION:\s*'\d+\.\d+(\.\d+)?'/.test(fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8')), 'CI: NSIS sürümü sabit');
if (skipped) console.log(`  not: ${skipped} denetim atlandı (dist/ yok; önce vite build)`);
console.log(`\n${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
