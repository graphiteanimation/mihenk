// Altın parça seti koşucusu: `npm run test:altin [-- --yalniz=P1,P2 | --taban-guncelle | --sahte-block]`
// P1–P4 karşılaştırma betikleri (test/compare/Pn/run-pn.mjs, çıktı release/altin/Pn/ — izlenen out/ klasörüne dokunulmaz), ornekler/*.mhnk,
// test/altin/*.mhnk ve test/altin/kullanici/ (*.mhnk, *.step, *.stp; boşsa atlanır). Sonuç test/altin/taban.json ile karşılaştırılır; kötüleşme varsa çıkış kodu 1.
// --taban-guncelle: taban bilerek yenilenir (tek yazan komut). --sahte-block: her parçanın ilk setup'ına 1 BLOCK ekleyerek kapının kaldığını gösterir (taban yazılmaz).
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { ozet, karsilastir, tablo } from './karsilastir.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(here, '..', '..');
const arg = (n) => process.argv.find((a) => a === '--' + n || a.startsWith('--' + n + '='));
const yalniz = arg('yalniz') ? arg('yalniz').split('=')[1].split(',') : null; const GUNCELLE = !!arg('taban-guncelle'), SAHTE = !!arg('sahte-block');
const TABAN = path.join(here, 'taban.json'); const OUT = path.join(ROOT, 'release', 'altin'); fs.mkdirSync(OUT, { recursive: true });
const secili = (id) => !yalniz || yalniz.includes(id);
const simdi = {};

for (const P of ['P1', 'P2', 'P3', 'P4']) {
  if (!secili(P)) continue;
  const lo = P.toLowerCase(), dir = path.join(OUT, P); fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now(); const r = spawnSync(process.execPath, [path.join(ROOT, 'test', 'compare', P, `run-${lo}.mjs`)], { cwd: ROOT, env: { ...process.env, [`${P}_OUT`]: dir }, encoding: 'utf8', maxBuffer: 256 << 20 });
  fs.writeFileSync(path.join(dir, 'kosu.log'), (r.stdout || '') + (r.stderr || ''));
  const jf = path.join(dir, `${lo}-mihenk-sonuc.json`);
  if (r.status !== 0 || !fs.existsSync(jf)) { console.log(`${P}: betik başarısız (kod ${r.status}, ${r.signal || ''}); günlük ${path.join(dir, 'kosu.log')}`); simdi[P] = null; continue; }
  console.log(`${P}: ${((Date.now() - t0) / 1000).toFixed(0)} sn`); simdi[P] = ozet({ id: P, R: JSON.parse(fs.readFileSync(jf, 'utf8')) });
}
// belge/STEP parçaları (ornekler/*.mhnk, test/altin/*.mhnk, test/altin/kullanici/*)
const belgeler = [];
for (const [d, re] of [[path.join(ROOT, 'ornekler'), /\.mhnk$/i], [here, /\.mhnk$/i], [path.join(here, 'kullanici'), /\.(mhnk|step|stp)$/i]]) if (fs.existsSync(d)) for (const f of fs.readdirSync(d).sort()) if (re.test(f)) belgeler.push(path.join(d, f));
if (belgeler.length) {
  const { belgeKos } = await import('./belge.mjs');
  for (const f of belgeler) {
    const base = path.basename(f).replace(/\.[^.]+$/, ''); if (!secili(base)) continue;
    try { const r = await belgeKos(f); simdi[base] = ozet({ ...r, id: base }); console.log(`${base}: ${r.R.sure_s} sn`); } catch (e) { console.log(`${base}: başarısız — ${e.message}`); simdi[base] = null; }
  }
} else console.log('belge/kullanıcı parçası yok (atlandı)');

const basarisiz = Object.entries(simdi).filter(([, v]) => !v).map(([k]) => k); for (const k of basarisiz) delete simdi[k];
if (SAHTE) for (const c of Object.values(simdi)) { const s = Object.values(c.setups)[0]; if (s) s.block += 1; }
console.log('\n' + tablo(simdi) + '\n');
fs.writeFileSync(path.join(OUT, 'sonuc.json'), JSON.stringify(simdi, null, 1));

let taban = { format: 'mihenk-altin-taban', parcalar: {} }; try { taban = JSON.parse(fs.readFileSync(TABAN, 'utf8')); } catch (e) { /* ilk koşu */ }
if (GUNCELLE && !SAHTE) {
  if (basarisiz.length) { console.log('TABAN YAZILMADI (başarısız parça: ' + basarisiz.join(', ') + ')'); process.exit(1); }
  taban.parcalar = { ...taban.parcalar, ...simdi }; fs.writeFileSync(TABAN, JSON.stringify(taban, null, 1) + '\n'); console.log('TABAN GÜNCELLENDİ: ' + TABAN); process.exit(0);
}
const tabanSecili = Object.fromEntries(Object.entries(taban.parcalar).filter(([k]) => secili(k)));
const sonuc = karsilastir(tabanSecili, simdi); const basarisizSay = basarisiz.filter((k) => k in tabanSecili).length;
for (const b of sonuc.bilgi) console.log('  bilgi: ' + b); for (const b of basarisiz) console.log('  KALDI: ' + b + ': betik/belge başarısız');
for (const k of sonuc.kotulesme) console.log('  KÖTÜLEŞME: ' + k);
const kalan = sonuc.sayim.kalan + basarisizSay;
console.log(`altın: ${sonuc.sayim.gecen} geçti, ${kalan} kaldı${SAHTE ? ' (yapay kötüleştirme)' : ''}`);
process.exit(kalan ? 1 : 0);
