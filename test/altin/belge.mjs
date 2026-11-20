// Altın set: .mhnk belgesi (ya da yalnız STEP) → CAM üretimi + kapılar + NC; karsilastir.mjs'in beklediği `R` biçiminde sonuç.
// Makine: belgenin cam.machineId'si ornekler/tezgahlar/*.json içinde varsa o; yoksa yerleşik genel şablonun TEST değerleriyle doldurulmuş kopyası (kullanıcı verisi taklidi).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import * as CAM from '../../src/cam/index.js';
import { builtinMachines, copyMachine, checkMachine } from '../../src/cam/machines/builtin.js';
import { postProgram } from '../../src/cam/post/index.js';
import { initKernel } from '../../src/kernel/kernel.js';
import { validateDoc } from '../../src/shared/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const r3 = (v) => Math.round(v * 1000) / 1000;
let K = null;
async function kernel() { if (!K) K = await initKernel(opencascade, () => path.join(ROOT, 'node_modules/replicad-opencascadejs/dist/replicad_single.wasm')); return K; }

export function ornekMakineler() {
  const dir = path.join(ROOT, 'ornekler', 'tezgahlar'); const out = [];
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) { try { out.push(...(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).machines || [])); } catch (e) { /* bozuk dosya atlanır */ } }
  return out;
}
export function altinMakine(id) {
  const m = ornekMakineler().find((x) => x.id === id);
  if (m) return m;
  const g = copyMachine(builtinMachines().find((x) => /3axis-fanuc/.test(x.id)), 'test-altin-genel', 'ALTIN TEST genel 3 eksen');
  g.axes.X.travel = 1000; g.axes.Y.travel = 600; g.axes.Z.travel = 600; g.spindle.maxRpm = 10000; g.feed.maxCut = 5000; g.feed.rapid = 20000;
  g.post = { props: { safeRetract: 'G28' } }; return g;
}

export async function belgeKos(file) {
  const id = path.basename(file); const k = await kernel(); const t0 = Number(process.hrtime.bigint()) / 1e9;
  const R = { setups: [], sure_s: 0, deneyler: {} };
  if (/\.(step|stp)$/i.test(file)) {
    const rb = await k.rebuild({ params: [], features: [{ id: 'imp', type: 'import', format: 'step', data: fs.readFileSync(file).toString('base64'), name: id }] });
    const rec = (rb.holes || []).filter((h) => h.recognized);
    R.delik_tanima = { elle_konum: 0, bulunan_konum: 0, taninan_konum: rec.reduce((a, h) => a + h.count, 0) };
    R.import = { govde: rb.bodies.length, hata: rb.docErrors }; R.sure_s = r3(Number(process.hrtime.bigint()) / 1e9 - t0);
    return { id, tur: 'step', R };
  }
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')); validateDoc(doc);
  const rb = await k.rebuild(doc); const cam = doc.cam || { tools: [], setups: [] }; const M = altinMakine(cam.machineId);
  const chk = checkMachine(M); if (chk.errors.length) throw new Error('makine geçersiz: ' + JSON.stringify(chk.errors[0]));
  const query = async (cmd, args) => { if (cmd === 'facePlane') return k.facePlane(args.ref); if (typeof k[cmd] === 'function' && cmd.startsWith('cam')) return k[cmd](args); throw new Error('cmd ' + cmd); };
  const RES = 0.5, hms = {};
  for (const s of cam.setups || []) { try { const S = CAM.resolveSetup(s, rb, M); hms[s.id] = k.camHeightmap({ bodies: S.bodies, frame: S.frame, res: RES, bbox: [S.stockBox.min[0], S.stockBox.min[1], S.stockBox.max[0], S.stockBox.max[1]] }); } catch (e) { /* setup çözülemezse generateProgram kapıya yazar */ } }
  const tools = Object.fromEntries((cam.tools || []).filter((t) => t.holder).map((t) => [t.number, { holder: t.holder }]));
  const res = await CAM.generateProgram(cam, { rebuild: rb, machine: M, query, doc, name: 'O2000', number: 2000, sim: { res: RES, modelHeightmaps: hms, tools } });
  for (const s of cam.setups || []) {
    const idx = res.program ? res.program.sections.findIndex((x) => x.setup.id === s.id) : -1;
    const gates = res.gates.filter((g) => (g.section != null ? res.program?.sections[g.section]?.setup.id === s.id : g.setupId === s.id));
    const ops = res.ops.filter((o) => o.setupId === s.id); const rec = { id: s.id, gates, islemler: ops.map((o) => ({ ok: o.ok })), post: { ok: false }, tahmini_sure_s: r3(ops.filter((o) => o.ok).reduce((a, o) => a + o.toolpath.stats.timeMin * 60, 0)) };
    if (idx >= 0) {
      const sec = res.program.sections[idx]; const prog = CAM.buildProgram({ name: 'O2000', number: 2000, machine: M, sections: [{ setup: sec.setup, toolpaths: ops.filter((o) => o.ok).map((o) => o.toolpath) }] });
      try { const nc = postProgram(prog, M, { gates, date: '2026-01-01' }); rec.post = { ok: true }; rec.nc = ncSay(nc.text); }
      catch (e) { try { rec.nc_bloklu = ncSay(postProgram(prog, M, { gates: gates.filter((g) => g.level !== 'block'), date: '2026-01-01' }).text); } catch (e2) { /* sayı yok */ } }
    }
    R.setups.push(rec);
  }
  R.sure_s = r3(Number(process.hrtime.bigint()) / 1e9 - t0);
  return { id, tur: 'belge', R };
}
function ncSay(text) { const code = text.split(/\r?\n/).map((l) => l.replace(/\([^)]*\)/g, '')).join('\n'); const c = (re) => (code.match(re) || []).length; return { G81: c(/\bG81\b/g), G83: c(/\bG83\b/g), G84: c(/\bG84\b/g), satir: text.split('\n').length }; }
