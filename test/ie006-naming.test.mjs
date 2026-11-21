// IE-006 / C-50: eğimli (taper) extrude → kabuk (üst yüz açık) → üst kenar halkasına pah/fillet. Kabuk sonrası üst
// kenarlar kalıcı adlandırılabilmeli (ref.ambiguous_here / ref.unnamed olmamalı); T09 referans modeli (test/cad-bench/ref/t09-kutu.py)
// 0,5 pahla üretilir, hacim 34 412,563 mm³ (±%0,1).
// Çalıştır: node test/ie006-naming.test.mjs
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import { initKernel } from '../src/kernel/kernel.js';
import { resolveName } from '../src/kernel/naming.js';
import { setLang } from '../src/shared/i18n.js';
import * as TP from '../src/kernel/topo.js';
setLang('tr', false);
const here = path.dirname(fileURLToPath(import.meta.url));
const wasm = path.join(here, '../node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const rel = (a, b, tol, m) => ok(Number.isFinite(a) && Math.abs(a - b) <= tol * Math.abs(b), `${m}: ${a} ≉ ${b} (±${tol * 100}%)`);
const K = await initKernel(opencascade, () => wasm);

const base = (name, offset = '0') => ({ kind: 'base', name, offset });
const errOf = (out, id) => out.status[id]?.error?.code;
const nE = (bid) => TP.topoOf(K.last.bodies.get(bid).shape).edges.size;
const nF = (bid) => TP.topoOf(K.last.bodies.get(bid).shape).faces.size;
const edges = (bid) => { const out = []; for (let i = 0, n = nE(bid); i < n; i++) out.push(K.describe({ body: bid, idx: i }, 'edge')); return out; };
const faces = (bid) => { const out = []; for (let i = 0, n = nF(bid); i < n; i++) out.push(K.describe({ body: bid, idx: i }, 'face')); return out; };
const clean = (d) => ({ body: d.body, kind: 'edge', name: d.name, hint: d.hint, ...(d.nameError ? { nameError: d.nameError } : {}) });

// T09 eskizi: 100 × 60 dikdörtgen, köşeler R8 (çizgi + yay; T09.mhnk ile aynı varlıklar)
const sk1 = () => ({ id: 'sk1', type: 'sketch', plane: base('XY'), points: {
  p13: { x: 50, y: 22 }, p14: { x: 42, y: 30 }, p15: { x: 42, y: 22 }, p20: { x: -42, y: -30 }, p21: { x: -50, y: -22 }, p22: { x: -42, y: -22 },
  p27: { x: 42, y: -30 }, p28: { x: 50, y: -22 }, p29: { x: 42, y: -22 }, p34: { x: -42, y: 30 }, p35: { x: -50, y: 22 }, p36: { x: -42, y: 22 } },
ents: [{ id: 'l5', type: 'line', a: 'p20', b: 'p27' }, { id: 'l6', type: 'line', a: 'p28', b: 'p13' }, { id: 'l7', type: 'line', a: 'p14', b: 'p34' }, { id: 'l8', type: 'line', a: 'p35', b: 'p21' },
  { id: 'a16', type: 'arc', c: 'p15', a: 'p13', b: 'p14' }, { id: 'a23', type: 'arc', c: 'p22', a: 'p21', b: 'p20' }, { id: 'a30', type: 'arc', c: 'p29', a: 'p27', b: 'p28' }, { id: 'a37', type: 'arc', c: 'p36', a: 'p34', b: 'p35' }] });
const shellDoc = () => ({ params: [], features: [sk1(),
  { id: 'ext1', type: 'extrude', sketch: 'sk1', profiles: 'all', dist: '30', extent: 'dist', dir: 'one', op: 'new', taper: '3' },
  { id: 'shell1', type: 'shell', faces: [{ body: 'ext1', kind: 'face', name: { k: 'ext1:end' } }], t: '2' }] });
const circles = (r) => { const c = [[40, 20], [40, -20], [-40, 20], [-40, -20]]; const points = {}, ents = []; c.forEach((p, i) => { points['c' + i] = { x: p[0], y: p[1] }; ents.push({ id: 'k' + i, type: 'circle', c: 'c' + i, r }); }); return { points, ents }; };
const fullDoc = () => {
  const d = shellDoc(); const b = circles(4), h = circles(1.7);
  const rib = { r0: { x: -48.5, y: -0.75 }, r1: { x: 48.5, y: -0.75 }, r2: { x: 48.5, y: 0.75 }, r3: { x: -48.5, y: 0.75 } };
  d.features.push(
    { id: 'sk2', type: 'sketch', plane: base('XY', '2'), points: { ...b.points, ...rib }, ents: [...b.ents, ...[0, 1, 2, 3].map((i) => ({ id: 'q' + i, type: 'line', a: 'r' + i, b: 'r' + ((i + 1) % 4) }))] },
    { id: 'ext2', type: 'extrude', sketch: 'sk2', profiles: 'all', dist: '13', extent: 'dist', dir: 'one', op: 'join' },
    { id: 'sk2b', type: 'sketch', plane: base('XY', '2'), points: b.points, ents: b.ents },
    { id: 'ext3', type: 'extrude', sketch: 'sk2b', profiles: 'all', dist: '26', extent: 'dist', dir: 'one', op: 'join' },
    { id: 'sk3', type: 'sketch', plane: base('XY'), points: h.points, ents: h.ents },
    { id: 'ext4', type: 'extrude', sketch: 'sk3', profiles: 'all', dist: '10', extent: 'all', dir: 'one', op: 'cut' });
  return d;
};
// üst (z=30) açıklığın dış halkası: eğimli yuvarlatılmış dikdörtgen (yarı boy 50−30·tan3°, köşe R 8−30·tan3°, merkez (±42, ±22))
const dt = 30 * Math.tan((3 * Math.PI) / 180);
const outerDist = (p) => { const qx = Math.abs(p[0]) - 42, qy = Math.abs(p[1]) - 22; return qx > 0 && qy > 0 ? Math.hypot(qx, qy) - (8 - dt) : Math.max(Math.abs(p[0]) - (50 - dt), Math.abs(p[1]) - (30 - dt)); };
const topLoops = (bid) => { const top = edges(bid).filter((d) => Math.abs(d.fp[2] - 30) < 1e-6); return { all: top, outer: top.filter((d) => Math.abs(outerDist(d.fp)) < 1e-3), inner: top.filter((d) => Math.abs(outerDist(d.fp)) >= 1e-3) }; };
const P30 = 2 * 84 + 2 * 44 + 2 * Math.PI * (8 - dt);

console.log('C-50 taper extrude + kabuk: üst kenar adları');
let out = await K.rebuild(shellDoc());
ok(out.status.ext1.ok && out.status.shell1.ok, 'extrude+kabuk: ' + (errOf(out, 'ext1') || errOf(out, 'shell1')));
const v0 = out.bodies[0]?.volume;
// eğimli extrude'un yan yüzleri adlı (taper sonrası ad kaybı yok), kabuk iç yüzleri ayrı adlı
{
  const fs = faces('ext1');
  const bad = fs.filter((d) => !d.name || d.nameError);
  ok(!bad.length, 'kabuk sonrası her yüz kalıcı adlı: ' + bad.map((d) => `#${d.idx}:${d.nameError}`).join(','));
  const body = K.last.bodies.get('ext1');
  const ks = fs.filter((d) => d.name).map((d) => JSON.stringify(d.name)); ok(new Set(ks).size === ks.length, 'yüz adları birbirinden farklı');
  ok(body.fn.some((ns) => ns.some((n) => n.startsWith('ext1:side:'))), 'eğimli yan yüzler ext1:side adını taşır');
  ok(body.fn.filter((ns) => ns.some((n) => n.startsWith('shell1:inner(f:ext1:side:'))).length === 8, 'kabuk iç duvarları dış duvardan türeyen ayrı adlar taşır (8)');
}
let L = topLoops('ext1');
ok(L.outer.length === 8 && L.inner.length === 8, `üst halka: dış ${L.outer.length}, iç ${L.inner.length} (8/8)`);
for (const d of L.all) ok(d.name && !d.nameError, `üst kenar #${d.idx} kalıcı adlı: ${d.nameError || ''}`);
{
  const body = K.last.bodies.get('ext1');
  for (const d of L.all) if (d.name) ok(resolveName(body, 'edge', d.name, d.hint) === d.idx, `üst kenar adı kendine çözülür #${d.idx}`);
  const amb = edges('ext1').filter((d) => d.nameError); ok(!amb.length, 'kabuklu gövdede adsız/belirsiz kenar yok: ' + amb.map((d) => `#${d.idx}:${d.nameError}`).join(','));
}

// kenar işlemleri kabuk sonrası
// üst dış kenarda malzeme açısı 90° − 3° = 87° (duvar yukarı daralır). Kesit alanı × z=30 çevresi (ağırlık merkezi kayması < %1)
const A87 = (87 * Math.PI) / 180;
const tri = (s) => 0.5 * s * s * Math.sin(A87); // eşit pah kesiti
const fil = (r) => r * r * (1 / Math.tan(A87 / 2) - (Math.PI - A87) / 2); // yuvarlatma kesiti
const cases = [
  ['pah 0,5 dış halka, düz kenar', (l) => l.outer.filter((d) => d.geom === 'LINE').slice(0, 1), 'chamfer', '0.5'],
  ['pah 0,5 dış halka (tümü)', (l) => l.outer, 'chamfer', '0.5', tri(0.5) * P30],
  ['pah 0,5 iç halka (tümü)', (l) => l.inner, 'chamfer', '0.5'],
  ['fillet 0,5 dış halka (tümü)', (l) => l.outer, 'fillet', '0.5', fil(0.5) * P30],
];
for (const [lbl, pick, type, val, expect] of cases) {
  await K.rebuild(shellDoc()); const sel = pick(topLoops('ext1'));
  if (!sel.length || sel.some((d) => !d.name)) { ok(false, `${lbl}: seçim adsız`); continue; }
  const d2 = shellDoc(); d2.features.push({ id: 'fc', type, edges: sel.map(clean), ...(type === 'fillet' ? { r: val } : { d: val }) });
  out = await K.rebuild(d2);
  ok(out.status.fc.ok, `${lbl}: ${errOf(out, 'fc')}`);
  if (!out.status.fc.ok) continue;
  const rem = v0 - out.bodies[0].volume; ok(rem > 0, `${lbl}: hacim azalır (${rem.toFixed(4)})`);
  if (expect) rel(rem, expect, 0.03, `${lbl}: kaldırılan hacim`);
  ok(!TP.validity(K.last.bodies.get('ext1').shape), `${lbl}: geçerli katı`);
}

console.log('T09 referans modeli (0,5 pah)');
{
  out = await K.rebuild(fullDoc());
  const bad = Object.entries(out.status).filter(([, s]) => !s.ok).map(([id, s]) => id + ':' + s.error?.code);
  ok(!bad.length, 'T09 pahsız ağaç hesaplandı: ' + bad.join(','));
  L = topLoops('ext1');
  ok(L.outer.length === 8, 'T09 üst dış halka 8 kenar: ' + L.outer.length);
  for (const d of L.outer) ok(d.name && !d.nameError, `T09 dış kenar #${d.idx} kalıcı adlı: ${d.nameError || ''}`);
  if (L.outer.every((d) => d.name)) {
    const d2 = fullDoc(); d2.features.push({ id: 'ch', type: 'chamfer', edges: L.outer.map(clean), d: '0.5' });
    out = await K.rebuild(d2);
    ok(out.status.ch.ok, 'T09 pah 0,5: ' + errOf(out, 'ch'));
    ok(out.bodies.length === 1, 'T09 tek gövde: ' + out.bodies.length);
    rel(out.bodies[0]?.volume, 34412.563, 0.001, 'T09 hacmi');
    if (out.bodies[0]) console.log(`   T09 hacim ${out.bodies[0].volume.toFixed(3)} mm³ (ref 34412.563, fark ${((out.bodies[0].volume / 34412.563 - 1) * 100).toFixed(4)}%), yüz ${nF('ext1')}`);
  }
}

console.log(`ie006-naming: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
