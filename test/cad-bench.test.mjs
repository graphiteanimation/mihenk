// İE-003: CAD test parçalarının otomatik regresyonu (pm/test/CAD-TEST.md, T01–T10).
// Mihenk arayüzünden çizilip kaydedilen belgeler (test/cad-bench/mhnk/*.mhnk) çekirdekte yeniden hesaplanır;
// hacim ve kutu build123d referansıyla (test/cad-bench/beklenen.json, ref/*.step) karşılaştırılır.
//  - durum "gecti": hacim referansa ±%0,1, kutu ±0,05 mm, tek gövde.
//  - durum "bilinen-eksik": bugünkü değer sabitlenir; eksik ölçünün hâlâ eksik olduğu da denetlenir
//    (parça düzeltmeden sonra yeniden çizilince beklenen.json güncellenmeden geçmesin diye).
// Çalıştır: node test/cad-bench.test.mjs
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import { initKernel } from '../src/kernel/kernel.js';
import { validateDoc, checkEnvelope } from '../src/shared/schema.js';
import { setLang } from '../src/shared/i18n.js';
setLang('tr', false);
const here = path.dirname(fileURLToPath(import.meta.url));
const wasm = path.join(here, '../node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
const DIR = path.join(here, 'cad-bench');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } return !!c; };
const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);
const K = await initKernel(opencascade, () => wasm);
const B = JSON.parse(fs.readFileSync(path.join(DIR, 'beklenen.json'), 'utf8')); const T = B.tolerans;

// Gövdelerin toplam hacmi, ortak kutusu, yüz sayısı
function measure(out) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; let hacim = 0, yuz = 0;
  for (const b of out.bodies) { hacim += b.volume; yuz += b.nFaces; for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], b.bbox[0][i]); hi[i] = Math.max(hi[i], b.bbox[1][i]); } }
  return { hacim, yuz, govde: out.bodies.length, kutu: hi.map((h, i) => h - lo[i]) };
}
const errs = (out) => Object.entries(out.status).filter(([, v]) => !v.ok).map(([k, v]) => k + ':' + (v.error?.code || '?'));
const kutuOk = (a, b) => a.every((x, i) => Math.abs(x - b[i]) <= T.kutu);
const sorted = (a) => [...a].sort((x, y) => x - y);

// Referans STEP'leri çekirdekle ölç (tablodaki build123d değerlerinin bağımsız sağlaması)
const refCache = new Map();
async function refStep(name) {
  if (refCache.has(name)) return refCache.get(name);
  const buf = fs.readFileSync(path.join(DIR, 'ref', name));
  const doc = { params: [], features: [{ id: 'ref', type: 'import', name: 'ref', format: 'step', hash: crypto.createHash('sha256').update(buf).digest('hex'), data: buf.toString('base64') }] };
  const out = await K.rebuild(doc); const m = { ...measure(out), errs: errs(out) }; refCache.set(name, m); return m;
}

const dosyalar = fs.readdirSync(path.join(DIR, 'mhnk')).filter((f) => f.endsWith('.mhnk')).sort();
ok(JSON.stringify(dosyalar) === JSON.stringify(B.belgeler.map((b) => b.dosya).sort()), 'mhnk klasörü ile beklenen.json aynı belgeleri saymalı: ' + dosyalar.join(','));
for (const n of ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10']) ok(dosyalar.some((f) => f.startsWith(n)), n + ' belgesi var');

const satirlar = [];
for (const b of B.belgeler) {
  console.log(b.dosya + ' — ' + b.parca);
  const txt = fs.readFileSync(path.join(DIR, 'mhnk', b.dosya), 'utf8'); let j;
  try { j = JSON.parse(txt); checkEnvelope(j); validateDoc(j.doc, { byteLength: Buffer.byteLength(txt) }); pass++; } catch (e) { ok(false, b.dosya + ' şema: ' + (e.code || e.message)); continue; }
  let out; try { out = await K.rebuild(j.doc); } catch (e) { ok(false, b.dosya + ' yeniden hesap: ' + (e.code || e.message)); continue; }
  ok(errs(out).length === 0, b.dosya + ' geçmişte hata: ' + errs(out).join(','));
  if (!ok(out.bodies.length > 0, b.dosya + ' gövde yok')) continue;
  const m = measure(out);
  // 1) bugünkü değer sabit (istenmeyen değişikliği yakalar)
  ok(relErr(m.hacim, b.bugun.hacim) <= T.bugunHacim, `${b.dosya} hacim değişti: ${m.hacim} ≠ ${b.bugun.hacim}`);
  ok(m.govde === b.bugun.govde, `${b.dosya} gövde sayısı: ${m.govde} ≠ ${b.bugun.govde}`);
  ok(m.yuz === b.bugun.yuz, `${b.dosya} yüz sayısı: ${m.yuz} ≠ ${b.bugun.yuz}`);
  // 2) kutu referansla (eksik parçalarda da aynı olmalı)
  ok(kutuOk(m.kutu, b.ref.kutu), `${b.dosya} kutu: ${m.kutu.map((x) => x.toFixed(4))} ≠ ${b.ref.kutu} (±${T.kutu})`);
  // 3) referans hacim
  const fark = (m.hacim - b.ref.hacim) / b.ref.hacim; const icinde = Math.abs(fark) <= T.refHacim;
  if (b.durum === 'gecti') {
    ok(icinde, `${b.dosya} hacim referansa ±%0,1 değil: ${m.hacim} / ${b.ref.hacim} (${(fark * 100).toFixed(4)} %)`);
    ok(m.govde === 1, `${b.dosya} tek gövde olmalı: ${m.govde}`);
  } else if (b.durum === 'bilinen-eksik') {
    const e = b.eksik || {};
    if (e.olcu === 'hacim') ok(!icinde, `${b.dosya} bilinen eksik giderilmiş görünüyor (hacim referansa ±%0,1): beklenen.json'da durumu "gecti" yap`);
    else { ok(icinde, `${b.dosya} hacim referansa ±%0,1 değil: ${m.hacim} / ${b.ref.hacim}`); }
    if (e.olcu === 'govde') ok(m.govde !== e.hedefGovde, `${b.dosya} bilinen eksik giderilmiş görünüyor (gövde ${m.govde}): beklenen.json'da durumu "gecti" yap`);
    if (e.olcu === 'hacim-acik') ok(Math.abs(fark) > 1e-4, `${b.dosya} bilinen eksik giderilmiş görünüyor (hacim farkı ${(fark * 100).toFixed(5)} %): beklenen.json'da durumu "gecti" yap`);
    ok(typeof e.neden === 'string' && e.neden.length > 10, b.dosya + ' eksik nedeni yazılı');
  } else ok(false, b.dosya + ' bilinmeyen durum: ' + b.durum);
  // 4) tablo değeri ↔ depodaki referans STEP (çekirdekle ölçülür; eksen sırası farklı olabilir)
  if (b.ref.step) {
    const r = await refStep(b.ref.step);
    ok(r.errs.length === 0 && r.govde === 1, `${b.ref.step} içe alınamadı: ${r.errs.join(',')}`);
    ok(relErr(r.hacim, b.ref.hacim) <= T.refStep, `${b.ref.step} hacmi tabloyla uyuşmuyor: ${r.hacim} ≠ ${b.ref.hacim}`);
    ok(sorted(r.kutu).every((x, i) => Math.abs(x - sorted(b.ref.kutu)[i]) <= T.kutu), `${b.ref.step} kutusu tabloyla uyuşmuyor: ${r.kutu} ≠ ${b.ref.kutu}`);
  }
  if (b.resim) ok(Array.isArray(j.doc.drawings) && j.doc.drawings.length >= b.resim, b.dosya + ' teknik resim belgede kayıtlı');
  satirlar.push(`  ${b.dosya.padEnd(9)} ${b.durum.padEnd(13)} hacim ${m.hacim.toFixed(3).padStart(13)}  ref ${String(b.ref.hacim).padStart(11)}  fark ${(fark * 100).toFixed(5).padStart(9)} %  gövde ${m.govde}  yüz ${m.yuz}`);
}
console.log('Özet:'); satirlar.forEach((s) => console.log(s));
console.log(`cad-bench: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
