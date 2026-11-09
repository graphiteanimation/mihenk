// Güvenlik denetimi kanıt betiği (kernel + ifade). Kaynağı DEĞİŞTİRMEZ. Çalıştır: node test/security/poc_kernel.mjs
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import { initKernel } from '../../src/kernel/kernel.js';
import { evalExpr, resolveParams } from '../../src/shared/expr.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const wasm = path.join(here, '../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
const b64 = (u) => Buffer.from(u).toString('base64');
const box = (id, w) => ({ id, type: 'primitive', name: 'K', kind: 'box', x: '0', y: '0', z: '0', w: String(w), d: String(w), h: String(w), op: 'new' });

console.log('== P1: ifade değerlendirici ==');
for (const [src, vars] of [['constructor', {}], ['toString', {}], ['__proto__', {}], ['hasOwnProperty(1)', {}], ['constructor(5)', {}], ['toString()', {}],
  ['process.exit()', {}], ['(1+2', {}], ['1'.padStart(5000, '(') + '1' + ')'.repeat(4999), {}], ['9^9^9^9', {}], ['a', {}]]) {
  let r; try { r = 'DEĞER ' + String(evalExpr(src, vars)); } catch (e) { r = 'HATA(' + e.constructor.name + ') ' + String(e.message).slice(0, 60); }
  console.log(JSON.stringify(src.slice(0, 30)), '->', r);
}
const rp = resolveParams([{ name: '__proto__', expr: '5' }, { name: 'constructor', expr: '7' }, { name: 'x', expr: '__proto__' }, { name: 'y', expr: 'constructor+1' }]);
console.log('resolveParams:', JSON.stringify(rp), 'Object.prototype kirli mi:', ({}).polluted, Object.getPrototypeOf(rp.vars) === Object.prototype);
// iç içe 100000 parantez (yığın taşması)
try { evalExpr('('.repeat(100000) + '1' + ')'.repeat(100000)); } catch (e) { console.log('100k parantez ->', e.constructor.name, '(yakalanabilir hata)'); }

const K = await initKernel(opencascade, () => wasm);
console.log('\n== P2: İçe aktarma önbelleği yalnız özellik kimliğine (id) bağlı ==');
await K.rebuild({ params: [], features: [box('b', 10)], rollback: null });
const stepA = await K.exportFile('step', ['b']);            // 10 mm küp
await K.rebuild({ params: [], features: [box('b', 20)], rollback: null });
const stepB = await K.exportFile('step', ['b']);            // 20 mm küp
const imp = (data, name) => ({ id: 'import1', type: 'import', name, format: 'step', data: b64(data) });
const r1 = await K.rebuild({ params: [], features: [imp(stepA, 'A_10mm')], rollback: null });
console.log('Belge-1  import1=A(10mm) -> hacim', r1.bodies[0]?.volume);
const r2 = await K.rebuild({ params: [], features: [imp(stepB, 'B_20mm')], rollback: null });
console.log('Belge-2  import1=B(20mm) -> hacim', r2.bodies[0]?.volume, '(beklenen 8000; 1000 çıkarsa ESKİ geometri gösteriliyor)');
// ikinci katman: id önbelleği elle boşaltılsa bile, özellik önbellek anahtarı yalnız data.length içerir (kernel.js:315)
K.imports.clear();
const r3 = await K.rebuild({ params: [], features: [imp(stepB, 'B_20mm')], rollback: null });
console.log('stepA.length === stepB.length ?', stepA.length === stepB.length, '| K.imports.clear() sonrası hacim', r3.bodies[0]?.volume, '(8000 değilse özellik önbelleği de bayat)');
const r4 = await K.rebuild({ params: [], features: [{ ...imp(stepB, 'B_20mm'), id: 'import2' }], rollback: null });
console.log('farklı id (import2) ile aynı veri -> hacim', r4.bodies[0]?.volume, '(doğru değer: önbellek id anahtarı olmayınca düzeliyor)');

console.log('\n== P3: STEP adı alanında kaçış ==');
const evil = "x');\n#999=FOO('PWN" ;
await K.rebuild({ params: [], features: [{ ...box('b', 10), name: evil }], rollback: null });
const st = Buffer.from(await K.exportFile('step', ['b'])).toString('latin1');
console.log('STEP içinde ham satır sonu + enjekte varlık var mı:', /#999=FOO/.test(st));
console.log((st.match(/.*PWN.*/g) || []).slice(0, 3).join('\n'));

console.log('\n== P4: desen adedi sınırsız (DoS) ==');
const t0 = Date.now();
const pat = { params: [], rollback: null, features: [box('b', 10), { id: 'p1', type: 'pattern', kind: 'rect', count1: '1500', count2: '1', step1: '1', step2: '0', source: { bodies: ['b'] }, join: false }] };
const r = await K.rebuild(pat);
console.log('count1=1500 ->', ((Date.now() - t0) / 1000).toFixed(1), 's, gövde sayısı', r.bodies.length, ' (count1=1e6 ya da 1e9 için üst sınır yok: kernel.js:252-254)');
