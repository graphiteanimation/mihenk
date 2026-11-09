// Bozuk STEP/STL ile içe aktarma: çökme/asılma var mı? Çalıştır: node test/security/poc_corrupt_import.mjs
import path from 'node:path'; import { fileURLToPath } from 'node:url'; import opencascade from 'replicad-opencascadejs'; import { initKernel } from '../../src/kernel/kernel.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const K = await initKernel(opencascade, () => path.join(here, '../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm'));
const b64 = (u) => Buffer.from(u).toString('base64');
await K.rebuild({ params: [], rollback: null, features: [{ id: 'b', type: 'primitive', name: 'K', kind: 'box', x: '0', y: '0', z: '0', w: '10', d: '10', h: '10', op: 'new' }] });
const good = Buffer.from(await K.exportFile('step', ['b']));
const rnd = Buffer.alloc(4096); for (let i = 0; i < rnd.length; i++) rnd[i] = (i * 2654435761) >>> 24;
const cases = { 'rastgele bayt (STEP)': ['step', rnd], 'yarım STEP': ['step', good.subarray(0, good.length >> 1)], 'bayt bozulmuş STEP': ['step', Buffer.from(good.toString('latin1').replace(/#1\d\b/g, '#999999'), 'latin1')],
  'boş STL': ['stl', Buffer.alloc(0)], 'ASCII STL NaN': ['stl', Buffer.from('solid x\nfacet normal 0 0 0\nouter loop\nvertex nan 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid')],
  'ikili STL, üçgen sayısı 4e9 yalan': ['stl', Buffer.concat([Buffer.alloc(80), Buffer.from([0xff, 0xff, 0xff, 0xee]), Buffer.alloc(50)])] };
for (const [n, [format, data]] of Object.entries(cases)) {
  const t = Date.now(); let r;
  try { r = await K.rebuild({ params: [], rollback: null, features: [{ id: 'i' + n.length, type: 'import', name: n, format, data: b64(data) }] }); const st = Object.values(r.status)[0]; console.log(n.padEnd(34), st.ok ? 'KABUL' : 'RED: ' + String(st.error).slice(0, 50), Date.now() - t, 'ms'); }
  catch (e) { console.log(n.padEnd(34), 'ÇEKİRDEK İSTİSNASI', String(e && e.message || e).slice(0, 60)); }
}
