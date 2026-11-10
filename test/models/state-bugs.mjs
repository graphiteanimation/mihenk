// Durum/önbellek hataları: aynı Kernel (worker ömür boyu tek örnek) ile art arda belgeler
import { runMain, newKernel, rb, Sk, basePl, props } from './lib.mjs';
export const name = 'durum-onbellek';
const prim = (o = {}) => ({ id: 'b1', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '10', d: '10', h: '10', op: 'new', ...o });
const D = (...f) => ({ params: [], features: f });
const b64 = (u) => Buffer.from(u).toString('base64');
export async function checks(t) {
  // X1: içe aktarma önbelleği özellik kimliğine bağlı (kernel.js loadImports: this.imports.has(f.id))
  const KA = newKernel(); await KA.rebuild(D(prim({ w: '10', d: '20', h: '30' }))); const stepBox = await KA.exportFile('step'); // 6000
  const KB = newKernel(); await KB.rebuild(D(prim({ kind: 'cylinder', dia: '20', h: '10', axis: 'Z' }))); const stepCyl = await KB.exportFile('step'); // 3141.59
  const K = newKernel();
  let r = await rb(K, D({ id: 'import1', type: 'import', format: 'step', name: 'a', data: b64(stepBox) })); t.near(r.out.bodies[0]?.volume, 6000, 'X1: belge A içe aktarma (kutu 6000)', 1e-6);
  r = await rb(K, D({ id: 'import1', type: 'import', format: 'step', name: 'b', data: b64(stepCyl) })); // yeni dosya açıldı, aynı özellik kimliği
  t.near(r.out.bodies[0]?.volume, Math.PI * 100 * 10, 'X1: belge B (aynı "import1" kimliği, farklı dosya) kendi geometrisini göstermeli; eski dosyanın geometrisi kalıyor', 1e-6);
  r = await rb(K, D({ id: 'import1', type: 'import', format: 'step', name: 'c', data: b64(Buffer.from('bozuk veri, STEP değil')) }));
  t.ok(!r.out.status.import1.ok, 'X1: bozuk dosya, aynı kimlikle: ok:false olmalı (önceki geometri sessizce gösteriliyor: ' + (r.out.status.import1.ok ? 'ok:true hacim ' + r.out.bodies[0]?.volume : 'ok:false') + ')');
  r = await rb(K, D({ id: 'import1', type: 'import', format: 'step', name: 'd' })); t.ok(!r.out.status.import1.ok, 'X1: veri alanı hiç yok, aynı kimlik: ok:false olmalı');
  // X2: Taşı/Kopyala (move) ikinci rebuild'de "object has been deleted" (kernel.js move: shape.rotate/translate kaynak şekli siler)
  const K2 = newKernel(); const d2 = D(prim(), { id: 'mv', type: 'move', bodies: ['b1'], dx: '50' });
  r = await rb(K2, d2); t.ok(!r.exc && r.out.status.mv.ok, 'X2: move ilk rebuild ok'); d2.features[1].dx = '70'; r = await rb(K2, d2);
  t.ok(!r.exc && r.out.status.mv.ok && Math.abs(r.out.bodies[0].bbox[0][0] - 70) < 1e-9, 'X2: move dx 50→70 ikinci rebuild: ' + (r.exc ? 'İSTİSNA ' + r.exc.message : 'ok'));
  const K2b = newKernel(); r = await rb(K2b, D(prim(), { id: 'mv', type: 'move', bodies: ['b1'], dx: '50', copy: true })); t.ok(!r.exc && r.out.status.mv.ok && r.out.bodies.length === 2, 'X2b: move copy:true ("Kopyala"): ' + (r.exc ? 'İSTİSNA ' + r.exc.message : r.out.bodies.length + ' gövde'));
  // X3: profiles [] istisnası sonrası K.last bozuk
  const K3 = newKernel(); const s = new Sk(); s.rect(0, 0, 10, 10);
  r = await rb(K3, D({ id: 's', type: 'sketch', plane: basePl('XY'), points: s.points, ents: s.ents, cons: [] }, { id: 'e', type: 'extrude', sketch: 's', profiles: [], dist: '5', extent: 'dist', dir: 'one', op: 'new' }));
  t.ok(!r.exc, 'X3: profiles [] rebuild istisna fırlatmamalı (' + (r.exc ? r.exc.message : 'ok') + ')');
  let q; try { q = K3.bodyProps('e'); t.ok(false, 'X3: istisna sonrası K.last içinde şekilsiz gövde var, bodyProps ' + JSON.stringify(q).slice(0, 80)); } catch (e) { t.ok(true, 'X3: bodyProps hata verdi (kabul)'); }
  // X4: hata sonrası aynı belge düzeltilince toparlanıyor mu
  r = await rb(K3, D({ id: 's', type: 'sketch', plane: basePl('XY'), points: s.points, ents: s.ents, cons: [] }, { id: 'e', type: 'extrude', sketch: 's', profiles: 'all', dist: '5', extent: 'dist', dir: 'one', op: 'new' })); t.near(r.out?.bodies[0]?.volume, 500, 'X4: düzeltilmiş belge doğru hacim', 1e-9);
  // X5: önbellek anahtarı import veri içeriği yerine yalnız uzunluk (kernel.js: data.length) kullanıyor: aynı uzunlukta farklı veri
  const stepA = Buffer.from(stepBox).toString('latin1'); const stepA2 = stepA.replace(/CARTESIAN_POINT\('',\(10\./, "CARTESIAN_POINT('',(10."); // aynı
  const K5 = newKernel(); const mk = (txt) => D({ id: 'imp', type: 'import', format: 'step', name: 'x', data: Buffer.from(txt, 'latin1').toString('base64') });
  const KC = newKernel(); await KC.rebuild(D(prim({ w: '10', d: '20', h: '31' }))); const stepB = Buffer.from(await KC.exportFile('step')).toString('latin1');
  t.note('X5-uzunluk', [stepA.length, stepB.length]);
  // X6: fillet bir gövdeyi değiştirdikten sonra aynı Kernel'de önceki belgeye dönüş (undo) aynı hacmi vermeli
  const K6 = newKernel(); const d6 = D(prim({ w: '40', d: '30', h: '20' })); await K6.rebuild(d6);
  const ed = K6.describe({ body: 'b1', idx: 0 }, 'edge'); const v0 = props(K6, 'b1').volume;
  d6.features.push({ id: 'f', type: 'fillet', edges: [ed], r: '3' }); await K6.rebuild(d6); const v1 = props(K6, 'b1').volume; d6.features.pop(); await K6.rebuild(d6); const v2 = props(K6, 'b1').volume;
  t.ok(v1 < v0 && Math.abs(v2 - v0) < 1e-9, `X6: fillet ekle/çıkar (geri al) sonrası hacim döner: ${v0} → ${v1} → ${v2}`);
  const fl = []; for (let i = 0; i < 6; i++) { d6.features.push({ id: 'f', type: 'fillet', edges: [ed], r: String(1 + i) }); await K6.rebuild(d6); fl.push(props(K6, 'b1').volume); d6.features.pop(); await K6.rebuild(d6); }
  t.ok(fl.every((v, i) => i === 0 || v < fl[i - 1]), 'X6: artan yarıçaplı fillet hacmi azalır ' + fl.map((x) => x.toFixed(2)));
}
await runMain(import.meta.url, name, async (t) => { await checks(t); });
