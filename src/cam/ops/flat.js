// WP-12: yatay (duz alan) temizleme. Secilen her yatay yuz KENDI z'sinde (farkli z'ler serbest) tek derinlikte, kontur-paralel
// halkalarla (cep motoru: acik kenar ve adalar dahil) temizlenir. Ustteki malzemenin onceki kaba islemle alindigi, yuz ustunde en
// cok `flatTop` (varsayilan 1 mm) kaldigi varsayilir: giris flatTop yuksekliginden baslar (helis/rampa/dalma). Eksenel pay yok
// (yuz tam olcuye), yanal pay stockToLeave.radial (duvarlara dokunmamak icin).
import { cerr } from '../geom/err.js';
import { opt, posNum, warn, r3 } from './common.js';
import { computePocket } from './pocket.js';
import { computeStats, validateToolpath } from '../ir.js';

export function computeFlat(op, ctx) {
  const faces = ctx.geom?.faces || []; const nm = op.name || op.id;
  if (!faces.length || !Array.isArray(op.geom) || !op.geom.length) throw cerr('cam.op.missing', { field: 'geom', op: nm });
  const top = opt(op, 'flatTop', posNum, 'number > 0', 1);
  const stR = typeof op.stockToLeave === 'number' ? op.stockToLeave : (op.stockToLeave?.radial ?? 0);
  // ayni z'deki yuzler tek cep cagrisinda (aralarinda guvenli baglanti cep motorunda); z sirasi yukaridan asagi
  const byZ = new Map(); for (const f of faces) { const k = Math.round(f.z * 1e6); if (!byZ.has(k)) byZ.set(k, []); byZ.get(k).push(f); }
  const groups = [...byZ.values()].sort((a, b) => b[0].z - a[0].z);
  const parts = [];
  for (const fs of groups) {
    const z = fs[0].z; const stockTop = ctx.setup.stockBox.max[2];
    const zTop = Math.min(z + top, stockTop);
    if (!(zTop > z + 1e-9)) continue; // stok ustu = yuz: alinacak malzeme yok
    const pop = { ...op, type: 'pocket', geom: fs.map(() => ({ kind: 'face' })), stepdown: zTop - z + 1, finishStepdown: undefined, stockToLeave: { radial: stR, axial: 0 },
      entry: op.entry ?? { kind: 'ramp', angle: 2 }, heights: { ...op.heights, top: { from: 'abs', off: zTop }, bottom: { from: 'abs', off: z } }, finishPass: false };
    delete pop.feedOpt;
    parts.push(computePocket(pop, { ...ctx, geom: { faces: fs } }));
  }
  if (!parts.length) throw cerr('cam.flat.nothing');
  const tp = { ...parts[0], opId: op.id, opName: nm, opType: 'flat', moves: parts.flatMap((p) => p.moves), warnings: parts.flatMap((p) => p.warnings || []) };
  tp.meta = { ...parts[0].meta, topZ: Math.max(...parts.map((p) => p.meta.topZ)), bottomZ: Math.min(...parts.map((p) => p.meta.bottomZ)), passDepth: Math.max(...parts.map((p) => p.meta.passDepth || 0)), flat: { faces: faces.length, levels: parts.length } };
  if (groups.length > parts.length) tp.warnings.push(warn('cam.flat.face_at_top', { n: groups.length - parts.length }));
  void r3;
  tp.stats = computeStats(tp, { rapidFeed: ctx.machine?.feed?.rapid ?? undefined });
  try { validateToolpath(tp); } catch (e) { throw cerr('cam.internal_ir', { code: e.code || 'internal', params: JSON.stringify(e.params || {}) }); }
  return tp;
}
