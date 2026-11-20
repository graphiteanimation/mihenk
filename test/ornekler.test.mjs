// ornekler/*.mhnk örnek belgeleri: şemadan geçer, model kurulur, her setup'ta tüm işlemler hesaplanır, simülasyonlu kapılarda BLOCK 0, NC üretilir.
// Örnek tezgâh profilleri (ornekler/tezgahlar/*.json) içe aktarma biçiminden geçer. Çıktı: "N geçti, M kaldı".
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { validateDoc } from '../src/shared/schema.js';
import { importMachines } from '../src/cam/machines/io.js';
import { checkMachine } from '../src/cam/machines/builtin.js';
import { belgeKos, ornekMakineler } from './altin/belge.mjs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const dir = path.join(ROOT, 'ornekler');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mhnk')).sort();
ok(files.length >= 3, 'en az 3 örnek belge: ' + files.length);
const tdir = path.join(dir, 'tezgahlar');
for (const f of fs.readdirSync(tdir).filter((x) => x.endsWith('.json'))) { try { const r = importMachines(fs.readFileSync(path.join(tdir, f), 'utf8')); ok(r.machines.length >= 1 && !r.errors.length, `tezgâh profili içe aktarılır: ${f}`); } catch (e) { ok(false, `tezgâh profili ${f}: ${e.code || e.message}`); } }
const ids = new Set(ornekMakineler().map((m) => m.id));
let kapsam = { cokSetup: false, donel: false, delik: false };
for (const f of files) {
  const file = path.join(dir, f);
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8')); validateDoc(doc); ok(true, f + ': şema');
    ok(doc.cam && ids.has(doc.cam.machineId), f + ': tezgâh profili ornekler/tezgahlar içinde: ' + doc.cam?.machineId);
    const m = ornekMakineler().find((x) => x.id === doc.cam.machineId); ok(m && !checkMachine(m).errors.length, f + ': tezgâh profili geçerli');
    const r = await belgeKos(file);
    ok(r.R.setups.length >= 1, f + ': setup var');
    for (const s of r.R.setups) {
      ok(s.islemler.length > 0 && s.islemler.every((o) => o.ok), `${f} ${s.id}: tüm işlemler hesaplandı (${s.islemler.filter((o) => !o.ok).length} hatalı)`);
      const b = s.gates.filter((g) => g.level === 'block'); ok(b.length === 0, `${f} ${s.id}: sim kapıları BLOCK 0 (${b.map((g) => g.code).join(',')})`);
      ok(s.post.ok && s.nc && s.nc.satir > 20, `${f} ${s.id}: NC üretildi`);
    }
    if (r.R.setups.length >= 2) kapsam.cokSetup = true; if ((doc.cam.setups || []).some((s) => s.rotary?.enabled)) kapsam.donel = true; if ((doc.cam.setups || []).some((s) => s.ops.some((o) => o.type === 'drill'))) kapsam.delik = true;
  } catch (e) { ok(false, f + ': ' + (e.code || e.message)); }
}
ok(kapsam.cokSetup && kapsam.donel && kapsam.delik, 'örnekler çok setup + 3+1 (A) + delik kapsar: ' + JSON.stringify(kapsam));
console.log(`ornekler: ${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
