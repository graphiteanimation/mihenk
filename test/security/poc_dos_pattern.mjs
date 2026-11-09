// Desen adedi üst sınırsız: count1=200000 ile çekirdek 30 sn içinde dönmez. Çalıştır: node test/security/poc_dos_pattern.mjs
import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { Worker, isMainThread, parentPort } from 'node:worker_threads';
const here = path.dirname(fileURLToPath(import.meta.url));
if (isMainThread) {
  const w = new Worker(fileURLToPath(import.meta.url)); const t0 = Date.now();
  const timer = setTimeout(() => { console.log('30 sn sonra hâlâ dönmedi -> çekirdek kilitlendi (DoS doğrulandı)'); process.exit(0); }, 30000);
  w.on('message', (m) => { clearTimeout(timer); console.log('döndü', m, (Date.now() - t0) / 1000, 's'); process.exit(0); });
} else {
  const { default: oc } = await import('replicad-opencascadejs'); const { initKernel } = await import('../../src/kernel/kernel.js');
  const K = await initKernel(oc, () => path.join(here, '../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm'));
  const box = { id: 'b', type: 'primitive', name: 'K', kind: 'box', x: '0', y: '0', z: '0', w: '10', d: '10', h: '10', op: 'new' };
  const r = await K.rebuild({ params: [], rollback: null, features: [box, { id: 'p1', type: 'pattern', kind: 'rect', count1: '200000', count2: '1', step1: '1', step2: '0', source: { bodies: ['b'] }, join: false }] });
  parentPort.postMessage(r.bodies.length);
}
