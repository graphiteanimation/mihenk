// Dosya → Örnekler listesi (saf; node testli: test/wp21.test.mjs). WP-21: kurulu sürümde liste masaüstü kabuğundan
// (resources/ornekler dosya adları) gelir; tarayıcıda/kabuksuz derlemeye gömülü ornekler/*.mhnk kullanılır.
const base = (p) => String(p).split(/[\\/]/).pop();
const stem = (p) => base(p).replace(/\.mhnk$/i, '');
// list: dosya adları (native) ya da gömülü modül yolları (embed). Döner [{key, name, src, file|path}] (ada göre sıralı, tekrarsız anahtar)
export function exampleEntries(list, src) {
  const seen = new Set(); const out = [];
  for (const p of [...(list || [])].filter((x) => typeof x === 'string' && /\.mhnk$/i.test(x)).sort((a, b) => base(a).localeCompare(base(b)))) {
    const key = stem(p).replace(/[^\w-]/g, '_'); if (seen.has(key)) continue; seen.add(key);
    out.push(src === 'native' ? { key, name: stem(p), src, file: base(p) } : { key, name: stem(p), src, path: p });
  }
  return out;
}
// örnek dosyalar çıplak belge olabilir: zarfa sarılır (zarflıysa olduğu gibi)
export function wrapExample(txt, app, version) {
  const j = JSON.parse(txt);
  return j && typeof j === 'object' && j.doc ? txt : JSON.stringify({ app, version, doc: j });
}
