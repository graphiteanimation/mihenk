// h. STEP döngüsü: a–g parçalarını STEP ve STL dışa aktar; yeni çekirdekte STEP'i içe al; hacim/alan/sınır kutusu/ağırlık merkezi/yüz sayısı aynı mı
import { runMain, newKernel, props, rb, sane, stlStats, solidValid } from './lib.mjs';
import * as A from './part-a.mjs'; import * as Bm from './part-b.mjs'; import * as C from './part-c.mjs'; import * as D from './part-d.mjs';
import * as E from './part-e.mjs'; import * as F from './part-f.mjs'; import * as G from './part-g.mjs';
export const name = 'h-step-dongusu';
export async function checks(t) {
  const K = newKernel();
  for (const M of [A, Bm, C, D, E, F, G]) {
    const tag = M.name + ': ';
    const b = await M.build(K, M.defaults); const r = await rb(K, b.doc); if (r.exc || !b.doc.features.every((f) => r.out.status[f.id].ok)) { t.ok(false, tag + 'kaynak parça kurulamadı'); continue; }
    const bid = r.out.bodies[0].id; const P0 = props(K, bid); const nF = r.out.bodies[0].nFaces;
    // STEP
    let step; try { step = await K.exportFile('step'); } catch (e) { t.ok(false, tag + 'STEP dışa aktarma istisna ' + e); continue; }
    t.ok(step.length > 1000, tag + 'STEP boyutu ' + step.length);
    const doc2 = { params: [], features: [{ id: 'imp1', type: 'import', format: 'step', name: 'p', data: Buffer.from(step).toString('base64') }] };
    const K2 = newKernel(); const K3 = newKernel();
    const r2 = await rb(K2, doc2); if (r2.exc || !r2.out.status.imp1.ok) { t.ok(false, tag + 'STEP içe alma başarısız ' + (r2.exc || '')); continue; }
    t.ok(r2.out.bodies.length === 1, tag + 'içe alınan gövde sayısı ' + r2.out.bodies.length);
    const P1 = props(K2, r2.out.bodies[0].id);
    t.near(P1.volume, P0.volume, tag + 'STEP hacim', 1e-7); t.near(P1.area, P0.area, tag + 'STEP alan', 1e-6);
    for (let a = 0; a < 2; a++) for (let i = 0; i < 3; i++) t.near(P1.bbox[a][i], P0.bbox[a][i], tag + `STEP bbox[${a}][${i}]`, 1e-7, 1e-5);
    P0.com.forEach((c, i) => t.near(P1.com[i], c, tag + `STEP com[${i}]`, 1e-6, 1e-5));
    t.ok(r2.out.bodies[0].nFaces === nF, tag + `STEP yüz sayısı korunur (${r2.out.bodies[0].nFaces} vs ${nF})`);
    t.ok(solidValid(K2.last.bodies.get(r2.out.bodies[0].id).shape) !== false, tag + 'STEP içe alınan geçerli katı');
    // ikinci tur (STEP -> STEP)
    const step2 = await K2.exportFile('step'); const r3 = await rb(K3, { params: [], features: [{ id: 'imp1', type: 'import', format: 'step', name: 'p', data: Buffer.from(step2).toString('base64') }] });
    if (!r3.exc && r3.out.status.imp1.ok) t.near(props(K3, r3.out.bodies[0].id).volume, P0.volume, tag + 'STEP ikinci tur hacim', 1e-7); else t.ok(false, tag + 'ikinci tur başarısız');
    // STL
    const stl = await K.exportFile('stl'); const S = stlStats(stl);
    t.near(S.volume, P0.volume, tag + 'STL hacmi (üçgen toplamı) ~ gerçek', 2e-3); t.near(S.area, P0.area, tag + 'STL alanı', 3e-3);
    t.ok(S.volume > 0, tag + 'STL yönelimi dışa bakan (işaretli hacim > 0)'); t.ok(S.openEdges === 0 && S.badEdges === 0, tag + `STL kapalı manifold (açık kenar ${S.openEdges}, hatalı ${S.badEdges})`);
    t.note(tag + 'stl-hacim-hatası', (S.volume - P0.volume) / P0.volume);
    // STL içe alma
    const r4 = await rb(newKernel(), { params: [], features: [{ id: 'imp1', type: 'import', format: 'stl', name: 'p', data: Buffer.from(stl).toString('base64') }] });
    if (r4.exc) t.ok(false, tag + 'STL içe alma istisna ' + r4.exc); else t.note(tag + 'stl-içe-alma', r4.out.status.imp1.ok ? `ok bodies=${r4.out.bodies.length} vol=${r4.out.bodies[0]?.volume}` : 'ok:false');
  }
  // çok gövdeli STEP: iki ilkel gövde
  const Kx = newKernel(); const dd = { params: [], features: [
    { id: 'b1', type: 'primitive', kind: 'box', w: '10', d: '20', h: '30', op: 'new' }, { id: 'b2', type: 'primitive', kind: 'cylinder', x: '50', dia: '20', h: '10', axis: 'Z', op: 'new' }] };
  const rr = await rb(Kx, dd); const st = await Kx.exportFile('step'); const Ky = newKernel();
  const r5 = await rb(Ky, { params: [], features: [{ id: 'imp1', type: 'import', format: 'step', name: 'p', data: Buffer.from(st).toString('base64') }] });
  t.ok(!r5.exc && r5.out.status.imp1.ok && r5.out.bodies.length === 2, 'h-çok-gövde: iki gövde STEP döngüsü: ' + (r5.exc || r5.out?.bodies.length));
  if (!r5.exc) { const vs = r5.out.bodies.map((b) => b.volume).sort((a, b) => a - b); t.near(vs[0], Math.PI * 100 * 10, 'h-çok-gövde: silindir hacmi', 1e-7); t.near(vs[1], 6000, 'h-çok-gövde: kutu hacmi', 1e-7); }
  // STEP dışa aktarma birim/ad: STEP başlığında MM
  const txt = Buffer.from(st).toString('latin1'); t.ok(/SI_UNIT\(.MILLI.,.METRE.\)/.test(txt), 'h-birim: STEP milimetre birimi');
}
await runMain(import.meta.url, name, async (t) => { await checks(t); });
