// h. STEP döngüsü: a–g parçalarını STEP ve STL dışa aktar; yeni çekirdekte STEP'i içe al; hacim/alan/sınır kutusu/ağırlık merkezi/yüz sayısı aynı mı
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { runMain, isMain, tester, finish, newKernel, props, rb, sane, stlStats, solidValid } from './lib.mjs';
import * as A from './part-a.mjs'; import * as Bm from './part-b.mjs'; import * as C from './part-c.mjs'; import * as D from './part-d.mjs';
import * as E from './part-e.mjs'; import * as F from './part-f.mjs'; import * as G from './part-g.mjs';
export const name = 'h-step-dongusu';
// WP-10 dilim 1: bellek tepesi — her parça AYRI süreçte koşar (OCCT wasm yığını süreç içinde küçülmez; tek süreçte tepe ~3,4 GB idi).
// `node part-h.mjs` tüm parçaları sırayla alt süreçlerde koşturur ve tek @@RESULT yazar; `--parca=a..g|cokgovde` yalnız birini koşar.
const STL_ICE_ALMA_ESIK = 20000;
const PARCALAR = { a: A, b: Bm, c: C, d: D, e: E, f: F, g: G };
export async function checks(t, secim) {
  const K = newKernel();
  for (const M of (secim ? (secim in PARCALAR ? [PARCALAR[secim]] : []) : Object.values(PARCALAR))) {
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
    // STL içe alma üçgen üçgen dikiş (sewing) yapar: 1,5 GB'a varan geçici bellek. Kendi alt sürecinde koşar; tepe bellek yalnız o süreçte kalır.
    // Üçgen sayısı STL_ICE_ALMA_ESIK'i aşarsa (~65 KB/üçgen; 35 bin üçgen ≈ 2,4 GB) varsayılan koşuda atlanır; MODEL_STL_TAM=1 ile tam koşulur. Çekirdek tarafı için bkz. WP-10 "Sapma/İhtiyaç".
    const nTri = (stl.length - 84) / 50; if (nTri > STL_ICE_ALMA_ESIK && !process.env.MODEL_STL_TAM) { t.note(tag + 'stl-içe-alma', `atlandı: ${nTri} üçgen > ${STL_ICE_ALMA_ESIK} (MODEL_STL_TAM=1 ile koşulur)`); continue; }
    const tmp = path.join(os.tmpdir(), `mihenk-parth-${process.pid}-${M.name}.stl`); fs.writeFileSync(tmp, stl);
    const sr = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--stlimp=' + tmp], { encoding: 'utf8', env: process.env, maxBuffer: 64 << 20 }); try { fs.unlinkSync(tmp); } catch (e) { /* geçici dosya */ }
    const sm = /^@@STL (.*)$/m.exec(sr.stdout || '');
    if (!sm) t.ok(false, tag + 'STL içe alma alt süreci sonuç üretmedi (' + (sr.signal || 'kod ' + sr.status) + ')');
    else { const o = JSON.parse(sm[1]); if (o.exc) t.ok(false, tag + 'STL içe alma istisna ' + o.exc); else t.note(tag + 'stl-içe-alma', o.text); }
  }
  if (secim && secim !== 'cokgovde') return;
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
const arg = process.argv.find((a) => a.startsWith('--parca=')), stlArg = process.argv.find((a) => a.startsWith('--stlimp='));
if (isMain(import.meta.url) && stlArg) {
  const stl = fs.readFileSync(stlArg.slice(9)); let o;
  try { const r4 = await rb(newKernel(), { params: [], features: [{ id: 'imp1', type: 'import', format: 'stl', name: 'p', data: stl.toString('base64') }] }); o = r4.exc ? { exc: String(r4.exc) } : { text: r4.out.status.imp1.ok ? `ok bodies=${r4.out.bodies.length} vol=${r4.out.bodies[0]?.volume}` : 'ok:false' }; } catch (e) { o = { exc: String(e) }; }
  console.log('@@STL ' + JSON.stringify(o)); process.exit(0);
} else if (isMain(import.meta.url) && !arg) {
  const t = tester(name); const here = fileURLToPath(import.meta.url);
  for (const k of [...Object.keys(PARCALAR), 'cokgovde']) {
    const r = spawnSync(process.execPath, [here, '--parca=' + k], { encoding: 'utf8', env: process.env, maxBuffer: 64 << 20 });
    const m = [...(r.stdout || '').matchAll(/^@@RESULT (.*)$/gm)].map((x) => JSON.parse(x[1]));
    if (!m.length) { t.ok(false, `h[${k}]: alt süreç sonuç üretmedi (${r.signal || 'kod ' + r.status}): ${(r.stderr || '').split('\n').slice(-4).join(' | ')}`); continue; }
    for (const x of m) { for (let i = 0; i < x.pass; i++) t.results.push({ pass: true, msg: '' }); for (const f of x.fails) { t.ok(false, f); } Object.assign(t.info, x.info); }
  }
  const atl = Object.entries(t.info).filter(([k, v]) => /stl-içe-alma$/.test(k) && String(v).startsWith('atlandı')).length;
  if (atl) console.log(`ATLANDI (${atl}): STL yeniden içe alma (üçgen > ${STL_ICE_ALMA_ESIK}; MODEL_STL_TAM=1 ile tam koşar)`);
  finish(t); process.exit(0);
} else await runMain(import.meta.url, name, async (t) => { await checks(t, arg ? arg.slice(8) : undefined); });
