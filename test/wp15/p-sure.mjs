// WP-15 olcum: P2 (NIST FTC-08 tepsi) uzerinde 3D islem hesap sureleri (cpu/duvar). Tezgaha gitmez; yalniz sure ve oyma sayisi.
// Calistir: node test/wp15/p-sure.mjs [islem,...]   (vars. adaptive3d,zlevel,parallel,scallop,pencil)
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import * as CAM from '../../src/cam/index.js';
import { initKernel } from '../../src/kernel/kernel.js';
import { surfaceForSetup } from '../../src/cam/surf/source.js';
const here = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(here, '..', '..');
const K = await initKernel(opencascade, () => path.join(ROOT, 'node_modules/replicad-opencascadejs/dist/replicad_single.wasm'));
const doc = { params: [], features: [{ id: 'imp', type: 'import', format: 'step', data: fs.readFileSync(path.join(ROOT, 'test/compare/P2/in/P2_NIST_FTC08_tepsi.stp')).toString('base64'), name: 'P2' }] };
const rb = await K.rebuild(doc); const bid = rb.bodies[0].id;
const query = async (cmd, a) => (cmd === 'export' ? K.exportFile(a.format, a.ids, a.names, a.opts) : K[cmd](a));
const S = CAM.resolveSetup({ id: 's1', bodies: [bid], workOffset: { kind: 'G54' }, stock: { kind: 'boxOffset', side: 2, top: 2, bottom: 0 } }, rb, null);
let t0 = Date.now(); const M = await surfaceForSetup(S, { rebuild: rb, query }); console.log('ag', M.T.length / 3, 'ucgen, tol', M.tol, 'sn', (Date.now() - t0) / 1000);
const T = (type, dia, cornerR) => ({ id: type + dia, number: 1, lengthOffset: 1, type, dia, ...(cornerR != null ? { cornerR } : {}), fluteLen: 60, bodyLen: 90, flutes: 2, centerCutting: true });
const base = { rpm: 9000, feedCut: 1500, feedPlunge: 500, coolant: 'flood', heights: { clearance: 10, retract: 2 } };
const OPS = {
  adaptive3d: [{ type: 'adaptive3d', optimalLoad: 4, stepdown: 10, fillStepdown: 2.5, stockToLeave: 0.3, entry: { kind: 'helix', angle: 3, helixDia: 14 }, boundary: { kind: 'stock' } }, T('flat', 16)],
  zlevel: [{ type: 'zlevel', stepdown: 1, slope: { min: 30, max: 90 }, arcFit: { tol: 0.005 } }, T('ball', 10)],
  parallel: [{ type: 'parallel', stepover: 1, slope: { min: 0, max: 40 }, arcFit: { tol: 0.005 } }, T('ball', 6)],
  scallop: [{ type: 'scallop', scallopHeight: 0.02, arcFit: { tol: 0.005 } }, T('ball', 10)],
  pencil: [{ type: 'pencil', arcFit: { tol: 0.005 } }, T('ball', 6)],
};
const which = (process.argv[2] || Object.keys(OPS).join(',')).split(',');
const out = {};
for (const k of which) {
  const [op, tool] = OPS[k]; const c0 = process.cpuUsage().user; t0 = Date.now();
  try { const tp = CAM.computeOp({ id: k, name: k, ...base, ...op }, { setup: S, tool, geom: { surface: M }, machine: null }); out[k] = { cpu_s: +((process.cpuUsage().user - c0) / 1e6).toFixed(1), duvar_s: (Date.now() - t0) / 1000, hareket: tp.moves.length, meta: tp.meta.surf || null }; }
  catch (e) { out[k] = { hata: e.code || String(e), params: e.params, cpu_s: +((process.cpuUsage().user - c0) / 1e6).toFixed(1) }; }
  console.log(k, JSON.stringify(out[k]));
}
