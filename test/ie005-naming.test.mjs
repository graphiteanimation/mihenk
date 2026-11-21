// IE-005 / C-31: tam daireden extrude edilen silindirin dikişi (+X) kol üst yüzü × silindir yan yüzü kesişim yayını ikiye
// böler; aynı iki yüz arasındaki iki kenar kalıcı olarak ayrı adlandırılmalı ve Fillet R4 yapılabilmeli.
// Ayrıca kullanıcının T03 belgesi (test/fixtures/ie005/T03.mhnk) yeniden hesaplanır: hacim 39 743,211 mm³ (±%0,1).
// Çalıştır: node test/ie005-naming.test.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import { initKernel } from '../src/kernel/kernel.js';
import { resolveName, edgeName } from '../src/kernel/naming.js';
import { validateDoc, checkEnvelope } from '../src/shared/schema.js';
import { setLang } from '../src/shared/i18n.js';
import * as TP from '../src/kernel/topo.js';
setLang('tr', false);
const here = path.dirname(fileURLToPath(import.meta.url));
const wasm = path.join(here, '../node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const rel = (a, b, tol, m) => ok(Number.isFinite(a) && Math.abs(a - b) <= tol * Math.abs(b), `${m}: ${a} ≉ ${b} (±${tol * 100}%)`);
const K = await initKernel(opencascade, () => wasm);

const base = (name) => ({ kind: 'base', name, offset: '0' });
const poly = (id, plane, pts) => { const points = {}; pts.forEach((p, i) => { points['p' + i] = { x: p[0], y: p[1] }; }); return { id, type: 'sketch', plane, points, ents: pts.map((_, i) => ({ id: 'l' + i, type: 'line', a: 'p' + i, b: 'p' + ((i + 1) % pts.length) })) }; };
const errOf = (out, id) => out.status[id]?.error?.code;
const edges = (bid) => { const n = TP.topoOf(K.last.bodies.get(bid).shape).edges.size; const out = []; for (let i = 0; i < n; i++) out.push(K.describe({ body: bid, idx: i }, 'edge')); return out; };
const clean = (d) => ({ body: d.body, kind: 'edge', name: d.name, hint: d.hint, ...(d.nameError ? { nameError: d.nameError } : {}) });

// Ø38 silindir (tek daire → dikiş +X'te) h=20; XZ'de kol 0..61 × 0..7, simetrik 53 (silindirden geniş), Birleştir
const model = () => ({ params: [], features: [
  { id: 's1', type: 'sketch', plane: base('XY'), points: { c: { x: 0, y: 0 } }, ents: [{ id: 'c1', type: 'circle', c: 'c', r: 19 }] },
  { id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', dist: '20', op: 'new' },
  poly('s2', base('XZ'), [[0, 0], [61, 0], [61, 7], [0, 7]]),
  { id: 'e2', type: 'extrude', sketch: 's2', profiles: 'all', dist: '53', dir: 'sym', op: 'join' },
] });

console.log('C-31 dikişte bölünmüş kesişim yayı');
const doc = model();
let out = await K.rebuild(doc);
ok(out.status.e2.ok && out.bodies.length === 1, 'kol birleşti: ' + errOf(out, 'e2'));
const v0 = out.bodies[0].volume;
const all = edges('e1');
// kol üst yüzü (z=7) × silindir yan yüzü: z=7'deki iki yay (dikiş köşesi (19,0,7))
const arcs = all.filter((d) => d.geom === 'CIRCLE' && Math.abs(d.fp[2] - 7) < 1e-6 && Math.abs(d.radius - 19) < 1e-6);
ok(arcs.length === 2, 'z=7 kesişiminde iki yay: ' + arcs.length);
for (const d of arcs) ok(d.name && !d.nameError, `yay #${d.idx} kalıcı adlı: ${d.nameError || JSON.stringify(d.name)}`);
// aynı iki yüz adını paylaşıyorlar ve adları farklı
if (arcs.length === 2 && arcs.every((d) => d.name)) {
  const [p, q] = arcs.map((d) => d.name);
  ok(p.a === q.a && p.b === q.b && [p.a, p.b].includes('e1:side:c1') && [p.a, p.b].includes('e2:side:l2'), 'iki yay aynı yüz çifti: ' + JSON.stringify([p, q]));
  ok(JSON.stringify(p) !== JSON.stringify(q), 'iki yayın adı farklı');
  const body = K.last.bodies.get('e1');
  for (const d of arcs) ok(resolveName(body, 'edge', d.name, d.hint) === d.idx, `ad kendi yayına çözülür #${d.idx}`);
}
// gövdenin hiçbir kenarı "aynı adlı başka eleman" hatası vermemeli
const amb = all.filter((d) => d.nameError === 'ref.ambiguous_here');
ok(!amb.length, 'belirsiz adlı kenar yok: ' + amb.map((d) => '#' + d.idx).join(','));

// Fillet R4: (a) tek yay, (b) teğet zinciriyle iki yay
const R = 4, lost = R * R * (1 - Math.PI / 4), cbar = R * (10 - 3 * Math.PI) / (12 - 3 * Math.PI);
for (const [lbl, sel, chain] of [['tek yay', arcs.slice(0, 1), false], ['teğet zincir', arcs.slice(0, 1), true], ['iki yay', arcs, false]]) {
  const d2 = model(); d2.features.push({ id: 'fl', type: 'fillet', edges: sel.map(clean), r: String(R), chain });
  out = await K.rebuild(d2);
  ok(out.status.fl.ok, `Fillet R4 ${lbl}: ${errOf(out, 'fl')}`);
  if (!out.status.fl.ok) continue;
  const add = out.bodies[0].volume - v0;
  // iç köşe yuvarlatması malzeme ekler: kesit r²(1−π/4) × ağırlık merkezi yolu (Pappus). OCCT MakeFillet G1-sürekli
  // komşu kenara kendiliğinden yayılır: tek yay seçilse de 180°'lik zincirin tamamı yuvarlatılır
  const ang = Math.PI;
  ok(add > 0, `${lbl}: hacim artar (${add.toFixed(3)})`);
  rel(add, lost * ang * (19 + cbar), 0.03, `${lbl}: eklenen hacim ≈ Pappus`);
  if (lbl === 'iki yay') {
    const names = K.last.bodies.get('e1').fn.flat().filter((n) => n.startsWith('fl:blend'));
    ok(new Set(names).size >= 2, `${lbl}: iki yuvarlatma yüzü ayrı adlı: ${[...new Set(names)].join(' ; ')}`);
  }
}

// kaydet/aç gidiş-dönüşü: yeni ad alanı (nk) şemadan geçer ve yeniden çözülür
{
  const d2 = model(); d2.features.push({ id: 'fl', type: 'fillet', edges: arcs.map(clean), r: '4', chain: false });
  const txt = JSON.stringify({ app: 'Mihenk', version: 1, doc: d2 }); const j = JSON.parse(txt);
  let schemaOk = true; try { checkEnvelope(j); validateDoc(j.doc, { byteLength: txt.length }); } catch (e) { schemaOk = false; console.log('   şema:', e.code || e.message); }
  ok(schemaOk, 'nk alanlı belge şemadan geçer');
  out = await K.rebuild(j.doc); ok(out.status.fl.ok, 'gidiş-dönüş sonrası fillet: ' + errOf(out, 'fl'));
}

// geriye uyum: eski {a,b,nb?} adları aynen üretilir/çözülür (nk yalnız ham adlar yetmediğinde)
{
  await K.rebuild(model()); const body = K.last.bodies.get('e1');
  const withNb = all.filter((d) => d.name && d.name.nb && !d.name.nk);
  ok(withNb.length > 0, 'nb ile ayrılan kenar(lar) var: ' + withNb.length);
  for (const d of withNb) ok(resolveName(body, 'edge', { a: d.name.a, b: d.name.b, nb: d.name.nb }, d.hint) === d.idx, 'eski {a,b,nb} çözülür #' + d.idx);
  const plain = all.filter((d) => d.name && !d.name.nb && !d.name.nk);
  for (const d of plain) ok(resolveName(body, 'edge', { a: d.name.a, b: d.name.b }, d.hint) === d.idx, 'eski {a,b} çözülür #' + d.idx);
  // nk'siz eski ad iki yayda hâlâ belirsiz (sessizce birini seçmez)
  if (arcs.length === 2 && arcs[0].name) { let code = null; try { resolveName(body, 'edge', { a: arcs[0].name.a, b: arcs[0].name.b }, null); } catch (e) { code = e.code; } ok(code === 'ref.ambiguous_edge', 'nk\'siz ad belirsiz kalır: ' + code); }
  ok(edgeName(body, all.find((d) => d.geom === 'LINE' && d.name && !d.name.nk).idx).nk === undefined, 'normal kenarda nk alanı yok');
}

// kullanıcının T03 belgesi
console.log('T03.mhnk');
{
  const txt = fs.readFileSync(path.join(here, 'fixtures/ie005/T03.mhnk'), 'utf8'); const j = JSON.parse(txt);
  checkEnvelope(j); validateDoc(j.doc, { byteLength: txt.length });
  out = await K.rebuild(j.doc);
  const bad = Object.entries(out.status).filter(([, s]) => !s.ok).map(([id, s]) => id + ':' + s.error?.code);
  ok(!bad.length, 'T03 tüm özellikler hesaplandı: ' + bad.join(','));
  ok(out.bodies.length === 1, 'T03 tek gövde: ' + out.bodies.length);
  rel(out.bodies[0]?.volume, 39743.211, 0.001, 'T03 hacmi');
}

console.log(`ie005-naming: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
