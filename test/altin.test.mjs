// Altın parça seti karşılaştırma mantığı testi (hızlı; ölçüm koşusu `npm run test:altin`). Çıktı: "N geçti, M kaldı".
import { karsilastir, ozet, tablo } from './altin/karsilastir.mjs';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const here = path.dirname(fileURLToPath(import.meta.url));
const taban = JSON.parse(fs.readFileSync(path.join(here, 'altin', 'taban.json'), 'utf8')).parcalar;
const clone = (x) => JSON.parse(JSON.stringify(x));
ok(Object.keys(taban).length >= 4, 'taban P1–P4 içerir: ' + Object.keys(taban));
ok(taban.P3.setups.S1.block === 5 && ['S2', 'S3', 'S4'].every((s) => taban.P3.setups[s].block === 0), 'taban P3 BLOCK 5/0/0/0');
ok(taban.P4.setups.S1.block === 11 && ['S2', 'S3', 'S4'].every((s) => taban.P4.setups[s].block === 0), 'taban P4 BLOCK 11/0/0/0');
ok(karsilastir(taban, clone(taban)).kotulesme.length === 0, 'aynı sonuç kalmaz');
{ const c = clone(taban); c.P2.setups.S1.block += 1; const r = karsilastir(taban, c); ok(r.kotulesme.length === 1 && /BLOCK/.test(r.kotulesme[0]), 'yapay +1 BLOCK kalır: ' + r.kotulesme); }
{ const c = clone(taban); c.P3.setups.S2.temiz = false; ok(karsilastir(taban, c).kotulesme.length === 1, 'temiz NC kaybı kalır'); }
{ const c = clone(taban); c.P4.zincir.S2 = 1; ok(karsilastir(taban, c).kotulesme.length === 1, 'zincirli BLOCK artışı kalır'); }
{ const c = clone(taban); c.P4.delik.bulunan -= 1; ok(karsilastir(taban, c).kotulesme.length === 1, 'tanınan delik azalması kalır'); }
{ const c = clone(taban); c.P3.setups.S1.estS = taban.P3.setups.S1.estS * 1.10; ok(karsilastir(taban, c).kotulesme.length === 1, 'tahmini süre +%10 kalır'); }
{ const c = clone(taban); c.P3.setups.S1.estS = taban.P3.setups.S1.estS * 1.03; ok(karsilastir(taban, c).kotulesme.length === 0, 'tahmini süre +%3 geçer'); }
{ const c = clone(taban); c.P4.setups.S1.G83 += 2; const r = karsilastir(taban, c); ok(r.kotulesme.length === 0 && r.bilgi.length === 1, 'çevrim sayısı değişimi yalnız bilgi'); }
{ const c = clone(taban); c.P4.setups.S1.block = 3; const r = karsilastir(taban, c); ok(r.kotulesme.length === 0, 'iyileşme kalmaz'); }
{ const c = clone(taban); delete c.P1; ok(karsilastir(taban, c).kotulesme.length === 1, 'kayıp parça kalır'); }
{ const c = clone(taban); c.YENI = clone(taban.P1); const r = karsilastir(taban, c); ok(r.kotulesme.length === 0 && r.bilgi.some((x) => /YENI/.test(x)), 'yeni parça yalnız bilgi'); }
ok(/P1 \| S1/.test(tablo(taban)) && /Temiz NC oranı/.test(tablo(taban)), 'tablo üretilir');
ok(ozet({ id: 'X', R: { setups: [{ id: 'S1', gates: [{ level: 'block' }, { level: 'warn' }], post: { ok: false }, islemler: [{ ok: true }, { ok: false }], nc_bloklu: { G83: 2 }, tahmini_sure_s: 10 }], sure_s: 1 } }).setups.S1.block === 1, 'ozet BLOCK sayar');
console.log(`altin: ${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
