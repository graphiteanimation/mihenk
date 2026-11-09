// Atomik dosya yazma (S-06): aynı dizinde geçici dosyaya yaz → fsync → (isteğe bağlı .bak) → rename.
// Herhangi bir adım başarısız olursa hedef dosyaya dokunulmaz ve geçici dosya silinir.
// `fsImpl` yalnız testlerde hata enjekte etmek içindir.
const nodeFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

async function atomicWrite(target, data, { backup = false, fsImpl = nodeFs } = {}) {
  const fsp = fsImpl.promises;
  const dir = path.dirname(target);
  const tmp = path.join(dir, '.' + path.basename(target) + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp');
  let fh = null;
  try {
    fh = await fsp.open(tmp, 'wx');
    await fh.writeFile(data);
    await fh.sync();
    await fh.close(); fh = null;
    if (backup) {
      // önceki sürümün kopyası; hedef yoksa (ilk kayıt) yedek de yok
      try { await fsp.copyFile(target, target + '.bak'); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; }
    }
    await fsp.rename(tmp, target);
  } catch (e) {
    if (fh) { try { await fh.close(); } catch (e2) { /* kapanmış olabilir */ } }
    try { await fsp.unlink(tmp); } catch (e2) { /* geçici dosya yoksa sorun değil */ }
    throw e;
  }
  // dizin kaydını da diske indir (Windows'ta desteklenmez; sessizce geç)
  if (process.platform !== 'win32') {
    try { const d = await fsp.open(dir, 'r'); try { await d.sync(); } finally { await d.close(); } } catch (e) { /* en iyi çaba */ }
  }
}

// Yol, kök dizin içinde mi? (önek karşılaştırması DEĞİL; path.relative ile — S-13)
function isInside(root, file) {
  const rel = path.relative(root, file);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

module.exports = { atomicWrite, isInside };
