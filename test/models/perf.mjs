// 3b. Süre ve bellek: 200 delikli desen, 60 özellikli belge, 30 ardışık rebuild bellek artışı, ölçek davranışı
import { runMain, newKernel, rb, Sk, basePl, oc, sane } from './lib.mjs';
import * as A from './part-a.mjs';
export const name = 'sure-bellek';
const D = (...f) => ({ params: [], features: f });
const prim = (o = {}) => ({ id: 'b1', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '10', d: '10', h: '10', op: 'new', ...o });
const mem = () => { const m = process.memoryUsage(); return { rss: m.rss / 1048576, heap: m.heapUsed / 1048576, ext: m.external / 1048576, ab: m.arrayBuffers / 1048576, wasm: (oc.HEAPU8?.length || 0) / 1048576 }; };
const r1 = (x) => Math.round(x * 10) / 10;
export async function checks(t) {
  const table = [];
  const T = async (label, doc, K = newKernel()) => { const r = await rb(K, doc); const row = { label, ms: Math.round(r.ms), exc: r.exc ? String(r.exc.message || r.exc) : null, ok: r.out ? Object.values(r.out.status).every((s) => s.ok) : null, bodies: r.out?.bodies.length, vol: r.out?.bodies[0]?.volume }; table.push(row); return { r, K, row }; };
  // 30 ardışık rebuild: bellek (flanş; her turda parametre değişir)
  const Kf = newKernel(); const base = await A.build(Kf, A.defaults); await rb(Kf, base.doc); global.gc?.();
  const m0 = mem(); const series = [m0]; const times = [];
  for (let i = 1; i <= 30; i++) { base.doc.params.find((p) => p.name === 'BD').expr = String(20 + (i % 7)); base.doc.params.find((p) => p.name === 'T').expr = String(12 + (i % 3)); const r = await rb(Kf, base.doc); times.push(Math.round(r.ms)); if (r.exc) { t.ok(false, `PERF bellek turu ${i} istisna ${r.exc}`); break; } global.gc?.(); series.push(mem()); }
  const m30 = series[series.length - 1];
  t.note('bellek-30-rebuild', { baş: Object.fromEntries(Object.entries(m0).map(([k, v]) => [k, r1(v)])), son: Object.fromEntries(Object.entries(m30).map(([k, v]) => [k, r1(v)])), fark: Object.fromEntries(Object.keys(m0).map((k) => [k, r1(m30[k] - m0[k])])), gc: !!global.gc, süreler: times });
  console.log('bellek (MB) baş', JSON.stringify(m0), 'son', JSON.stringify(m30), 'ms:', times.join(','));
  t.ok(m30.rss - m0.rss < 500, `PERF 30 rebuild sonrası rss artışı ${r1(m30.rss - m0.rss)} MB < 500 MB`);
  // sızıntı eğilimi: son 10 turun ortalama artışı
  const slope = (m30.ext - series[10].ext) / 20; t.note('external-artışı-MB/rebuild (son 20 tur)', Math.round(slope * 1000) / 1000);
  // uzun koşu: 150 rebuild
  const long = []; let failedAt = null; for (let i = 31; i <= 150; i++) { base.doc.params.find((p) => p.name === 'BD').expr = String(20 + (i % 9)); const r = await rb(Kf, base.doc); if (r.exc || !r.out.status.bore?.ok) { failedAt = i; long.push(String(r.exc || r.out.status.bore.error)); break; } if (i % 30 === 0) { global.gc?.(); long.push({ i, ...Object.fromEntries(Object.entries(mem()).map(([k, v]) => [k, r1(v)])) }); } }
  t.note('bellek-150-rebuild', long); t.ok(failedAt == null, 'PERF 150 ardışık rebuild çökmeden bitti' + (failedAt ? ' (başarısız tur ' + failedAt + ')' : ''));
  // 200 delik: dikdörtgen desen, dairesel desen, tek sketch'te 200 nokta
  const pl = (extra = [], pt = [5, 5]) => { const s = new Sk(); s.point(...pt); return [prim({ w: '600', d: '600', h: '10' }), { id: 'h', type: 'sketch', plane: basePl('XY', 10), points: s.points, ents: s.ents, cons: [] }, { id: 'hh', type: 'hole', sketch: 'h', kind: 'simple', dia: '2', extent: 'all' }, ...extra]; };
  const V0 = 600 * 600 * 10, vh = Math.PI * 10;
  for (const [cx, cy] of [[10, 5], [10, 10], [10, 20], [20, 20], [20, 40]]) {
    const { r, row } = await T(`desen ${cx}x${cy} = ${cx * cy} delik (rect)`, D(...pl([{ id: 'pt', type: 'pattern', kind: 'rect', source: { kind: 'feature', id: 'hh' }, count1: String(cx), step1: '20', dir1: 'X', count2: String(cy), step2: '14', dir2: 'Y' }])));
    if (r.out) t.near(r.out.bodies[0]?.volume, V0 - cx * cy * vh, `PERF desen ${cx * cy} delik hacmi`, 1e-4);
    if (cx * cy === 200) t.ok(row.ms < 60000, `PERF 200 delik desen süresi ${row.ms} ms < 60 s`);
  }
  { const s = new Sk(); for (let i = 0; i < 200; i++) s.point(10 + (i % 20) * 28, 10 + Math.floor(i / 20) * 28); const { r, row } = await T('tek sketch\'te 200 nokta + tek delik', D(prim({ w: '600', d: '600', h: '10' }), { id: 'h', type: 'sketch', plane: basePl('XY', 10), points: s.points, ents: s.ents, cons: [] }, { id: 'hh', type: 'hole', sketch: 'h', kind: 'simple', dia: '2', extent: 'all' })); if (r.out) t.near(r.out.bodies[0]?.volume, V0 - 200 * vh, 'PERF 200 noktalı delik hacmi', 1e-4); }
  // kaynak delik (550,300), merkez (300,300): tüm örnekler plakada (F-08: dışarı taşan örnek açık hata verir)
  for (const n of [50, 100, 200, 400]) { const { r } = await T(`dairesel desen ${n} delik`, D(...pl([{ id: 'pt', type: 'pattern', kind: 'circ', source: { kind: 'feature', id: 'hh' }, count: String(n), total: '360', axis: 'Z', cx: '300', cy: '300' }], [550, 300]))); if (r.out) t.near(r.out.bodies[0]?.volume, V0 - n * vh, `PERF dairesel ${n} delik hacmi`, 1e-4); }
  // ölçek: küre büyüklüğü -> ağ süresi
  for (const dia of [100, 1e3, 3e3, 6e3]) await T(`küre çap ${dia}`, D(prim({ kind: 'sphere', dia: String(dia) })));
  // 60 özellikli belge
  const feats = [prim({ id: 'base', w: '400', d: '400', h: '30' })];
  for (let i = 0; i < 29; i++) { const s = new Sk(); const x = 20 + (i % 6) * 60, y = 20 + Math.floor(i / 6) * 70; s.rect(x, y, x + 40, y + 40, 4); feats.push({ id: 'sk' + i, type: 'sketch', plane: basePl('XY', 30), points: s.points, ents: s.ents, cons: [] }, { id: 'pk' + i, type: 'extrude', sketch: 'sk' + i, profiles: 'all', dist: String(5 + (i % 5)), extent: 'dist', dir: 'one', flip: true, op: 'cut' }); }
  feats.push({ id: 'last', type: 'primitive', kind: 'cylinder', x: '200', y: '200', z: '30', dia: '30', h: '10', axis: 'Z', op: 'join' });
  const doc60 = D(...feats); t.ok(doc60.features.length === 60, 'PERF belge 60 özellik: ' + doc60.features.length);
  const K60 = newKernel(); const a = await T('60 özellikli belge (soğuk)', doc60, K60);
  t.ok(Object.values(a.r.out.status).every((s) => s.ok), 'PERF 60 özellik hepsi ok');
  let exp = 400 * 400 * 30 - 29 * (1600 - (4 - Math.PI) * 16) * 0; let cut = 0; for (let i = 0; i < 29; i++) cut += (1600 - (4 - Math.PI) * 16) * (5 + (i % 5)); t.near(a.r.out.bodies[0].volume, 400 * 400 * 30 - cut + Math.PI * 225 * 10, 'PERF 60 özellik hacmi', 1e-4);
  doc60.features[59].h = '12'; const b = await rb(K60, doc60); table.push({ label: '60 özellik: yalnız son özellik değişti (önbellek)', ms: Math.round(b.ms) });
  doc60.features[0].h = '31'; const c = await rb(K60, doc60); table.push({ label: '60 özellik: ilk özellik değişti (tam yeniden hesap)', ms: Math.round(c.ms) });
  t.note('süre-tablosu', table); for (const r of table) console.log(`  ${String(r.ms).padStart(7)} ms  ${r.label}${r.exc ? '  İSTİSNA ' + r.exc : ''}`);
}
await runMain(import.meta.url, name, async (t) => { await checks(t); });
