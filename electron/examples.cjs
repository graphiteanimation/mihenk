// Örnek belgeler (WP-21): kurulu sürümde <kurulum>/resources/ornekler (package.json build.extraResources), geliştirmede depo kökündeki ornekler/.
// Arayüze yol verilmez: liste yalnız dosya adlarıdır; açma isteği listede olan bir adla gelir, ana süreç yolu kendisi kurar.
// Saf modül (electron gerektirmez): test/wp21.test.mjs doğrudan sınar.
const path = require('node:path');
const fs = require('node:fs');

const MAX_EXAMPLES = 200;
const MAX_BYTES = 50 * 1024 * 1024;

// isPackaged: app.isPackaged; resourcesPath: process.resourcesPath; appRoot: geliştirmede depo kökü
function examplesDir({ isPackaged, resourcesPath, appRoot }) {
  return isPackaged ? path.join(resourcesPath, 'ornekler') : path.join(appRoot, 'ornekler');
}
// klasördeki *.mhnk düzenli dosyaların adları (sıralı; klasör yoksa boş liste)
function listExamples(dir) {
  let names; try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return []; }
  return names.filter((d) => d.isFile() && /\.mhnk$/i.test(d.name)).map((d) => d.name).sort((a, b) => a.localeCompare(b)).slice(0, MAX_EXAMPLES);
}
// ad listede değilse (yol parçası, ../, başka uzantı) null; değilse {name, data:Uint8Array}
function readExample(dir, name) {
  if (typeof name !== 'string' || !listExamples(dir).includes(name)) return null;
  const p = path.join(dir, name); const st = fs.statSync(p);
  if (!st.isFile() || st.size > MAX_BYTES) return null;
  return { name, data: new Uint8Array(fs.readFileSync(p)) };
}
module.exports = { examplesDir, listExamples, readExample };
