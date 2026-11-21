// IE-005 topoloji: C-33 (dikişte biten fillet brepcheck), C-39 (boolean sonrası eş düzlemli yüzler ayrı kalıyor),
// C-42 (teğet temaslı gövde Join/Combine). Kabul: T03 / T04 referans modelleri fillet'lerle, hacim referansa ±%0,1.
// Fikstürler: test/fixtures/ie005/T03.mhnk, T04.mhnk (kullanıcının T03/T04 kayıtları, salt okunur kopya).
// Çalıştır: node test/ie005-topo.test.mjs
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
import opencascade from 'replicad-opencascadejs';
import { initKernel } from '../src/kernel/kernel.js';
import * as TP from '../src/kernel/topo.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const wasm = path.join(here, '../node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
let pass = 0, fail = 0, xfail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
// beklenen-başarısız: geçerse de kalırsa da raporlanır; kalması toplamı bozmaz (neden yazılır)
const xok = (c, m, why) => { if (c) { pass++; console.log('  XPASS (artık geçiyor):', m); } else { xfail++; console.log('  XFAIL:', m, '—', why); } };
const rel = (a, b, tol, m) => ok(Number.isFinite(a) && Math.abs(a - b) <= tol * Math.abs(b), `${m}: ${a} ≉ ${b} (±${tol * 100}%)`);
const section = (s) => console.log(s);
const K = await initKernel(opencascade, () => wasm);
const load = (n) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures/ie005', n))).doc;
const upTo = (doc, id) => doc.features.slice(0, doc.features.findIndex((f) => f.id === id));
const errOf = (out, id) => (out.status[id]?.ok ? 'ok' : JSON.stringify(out.status[id]?.error));
const body = (id) => K.last.bodies.get(id);
const nFaces = (id) => TP.topoOf(body(id).shape).faces.size;
const faces = (bid) => { const out = []; for (let i = 0; i < nFaces(bid); i++) out.push(K.describe({ body: bid, idx: i }, 'face')); return out; };
const edges = (bid, pred) => { const out = []; const n = TP.topoOf(body(bid).shape).edges.size; for (let i = 0; i < n; i++) { const d = K.describe({ body: bid, idx: i }, 'edge'); if (pred(d)) out.push(d); } return out; };
const ref = ({ body: b, kind, name, hint }) => ({ body: b, kind, name, hint });
// düzlemsel yüzler: birim normal n ve n·p = c
const onPlane = (d, n, c, tol = 1e-4) => d.geom === 'PLANE' && d.normal && Math.hypot(d.normal[0] - n[0], d.normal[1] - n[1], d.normal[2] - n[2]) < 1e-6 && Math.abs(d.fp[0] * n[0] + d.fp[1] * n[1] + d.fp[2] * n[2] - c) < tol;
const S2 = Math.SQRT1_2;

// ------------------------------------------------------------------ C-33
section('C-33: iki yarım yaydan silindir + kol, kol üstü × silindir kenarına Fillet R4');
const T03 = load('T03.mhnk');
{
  const base = upTo(T03, 'sk4'); // Eskiz XY (iki yarım yay) → Extrude 20 → Ø26 → kol 61×7, simetrik 53, Birleştir
  await K.rebuild({ params: [], features: base });
  const es = edges('ext1', (d) => d.geom === 'CIRCLE' && Math.abs(d.radius - 19) < 1e-6 && Math.abs(d.fp[2] - 7) < 1e-6 && d.fp[0] > 0);
  ok(es.length === 1 && es[0].name, 'kol üstü × silindir kenarı tek ve adlı: ' + es.length);
  const fil = { id: 'f4', type: 'fillet', name: 'R4', edges: es.map(ref), r: '4', chain: true };
  const out = await K.rebuild({ params: [], features: [...base, fil] });
  ok(out.status.f4?.ok, 'Fillet R4 kurulur (önce: brepcheck): ' + errOf(out, 'f4'));
  if (out.status.f4?.ok) {
    const B = body('ext1');
    ok(TP.validity(B.shape) === null, 'sonuç geçerli katı: ' + TP.validity(B.shape));
    // build123d (OCP 8.0.1) aynı adım: dikiş +X'te, 45805.922 mm³; bağımsız denetim: kapalı kabuk, serbest yüz yok
    rel(TP.volume(B.shape), 45805.922, 1e-5, 'R4 sonrası hacim (build123d 45805.922)');
    ok(TP.solidsOf(B.shape).length === 1, 'tek katı');
    const tor = faces('ext1').filter((d) => d.geom === 'TORUS');
    ok(tor.length >= 1 && tor.every((d) => (B.fn[d.idx] || []).some((n) => n.startsWith('f4:blend'))), 'fillet yüzleri f4:blend adını taşır');
  }
}
section('Kabul T03: R4 iç fillet Fillet aracıyla (Revolve ±90° yerine), tüm ağaç');
{
  const feats = T03.features.filter((f) => !['sk4', 'rev1', 'rev2'].includes(f.id));
  const at = feats.findIndex((f) => f.id === 'sk5');
  feats.splice(at, 0, { id: 'f4', type: 'fillet', name: 'R4', edges: [{ body: 'ext1', kind: 'edge', name: { a: 'ext1:side:a3', b: 'ext3:side:l6' }, hint: { fp: [19, 0, 7], geom: 'CIRCLE' } }], r: '4', chain: true });
  const out = await K.rebuild({ params: [], features: feats });
  const bad = Object.entries(out.status).filter(([, s]) => !s.ok).map(([k, s]) => k + ':' + s.error.code);
  ok(!bad.length, 'T03 ağacı hatasız: ' + bad.join(' '));
  ok(out.bodies.length === 1, 'tek gövde');
  rel(out.bodies[0]?.volume, 39743.211, 1e-3, 'T03 hacmi (ppp0104 referansı 39743.211)');
  const bb = body('ext1')?.shape.boundingBox.bounds;
  ok(bb && Math.abs(bb[1][0] - bb[0][0] - 80) < 1e-3 && Math.abs(bb[1][1] - bb[0][1] - 38) < 1e-3 && Math.abs(bb[1][2] - bb[0][2] - 51) < 1e-3, 'T03 kutusu 80 × 38 × 51');
}

// ------------------------------------------------------------------ C-39
section('C-39: Join sonrası eş düzlemli yüzler tek yüz; R16 iç köşe fillet; birleşme öncesi adlar çözülür');
const T04 = load('T04.mhnk');
{
  // T04: plaka + dikme (x = 0 düzlemi), destek plakası 45° döndürülmüş, kama (eskiz koordinatları elle yuvarlanmış: 8.48528, 4.24264)
  const beforeWedge = upTo(T04, 'sk5');
  await K.rebuild({ params: [], features: beforeWedge });
  // kama Join'inden ÖNCE destek üst yüzünün adı (45° düzlem, n·p = 6)
  const braceTop = faces('ext3').filter((d) => onPlane(d, [S2, 0, S2], 6));
  ok(braceTop.length === 1 && braceTop[0].name, 'destek üst yüzü önceden adlı');
  const xPlane0 = faces('ext1').filter((d) => onPlane(d, [1, 0, 0], 0));
  ok(xPlane0.length === 1, 'plaka + dikme: x = 0 düzleminde tek yüz: ' + xPlane0.length);
  const xName = xPlane0[0]?.name;
  const base = upTo(T04, 'sk6');
  await K.rebuild({ params: [], features: base });
  const all = faces('ext1');
  const p45 = all.filter((d) => onPlane(d, [S2, 0, S2], 6));
  ok(p45.length === 1, 'kama + destek üst yüzü 45° düzlemde tek yüz (önce 2): ' + p45.length);
  ok(all.every((d) => d.area > 1e-3), 'sıfır alanlı şerit yüz yok: ' + all.filter((d) => !(d.area > 1e-3)).map((d) => d.idx + ':' + d.area.toExponential(2)).join(' '));
  ok(all.filter((d) => onPlane(d, [1, 0, 0], 0)).length === 1, 'x = 0 düzleminde tek yüz (Join sonrası)');
  // birleşmeden önce verilen adlar sonra hâlâ çözülüyor (takma ad kümesi)
  for (const [lbl, nm] of [['destek üst yüzü', braceTop[0]?.name], ['x = 0 yüzü', xName]]) {
    let d = null; try { d = K.describe({ body: 'ext1', kind: 'face', name: nm }, 'face'); } catch (e) { d = { err: e.code }; }
    ok(d && !d.err && (lbl.startsWith('destek') ? p45.some((q) => q.idx === d.idx) : onPlane(d, [1, 0, 0], 0)), `${lbl} adı (${JSON.stringify(nm)}) birleşmiş yüze çözülür: ${d?.err || d?.idx}`);
  }
  const cornerEdge = edges('ext1', (d) => d.geom === 'LINE' && Math.abs(d.fp[0]) < 1e-4 && Math.abs(d.fp[2] - 6 / S2) < 1e-3 && Math.abs(d.length - 75) < 1e-6);
  ok(cornerEdge.length === 1, 'x = 0 × 45° iç köşe kenarı tek: ' + cornerEdge.length);
  // kama Join'inden önce verilebilen ad biçimiyle kenar (kama üstü adı) da çözülür
  let ej = null; try { ej = K.describe({ body: 'ext1', kind: 'edge', name: { a: 'ext1:side:l6', b: 'ext4:side:l5' } }, 'edge'); } catch (e) { ej = { err: e.code }; }
  ok(ej && !ej.err && ej.idx === cornerEdge[0]?.idx, 'eski kenar adı {ext1:side:l6, ext4:side:l5} aynı kenara çözülür: ' + (ej?.err || ej?.idx));
  for (const r of ['3', '14', '16']) {
    const out = await K.rebuild({ params: [], features: [...base, { id: 'f16', type: 'fillet', edges: cornerEdge.map(ref), r, chain: true }] });
    ok(out.status.f16?.ok, `iç köşe Fillet R${r} (önce R14/R16: değer büyük): ` + errOf(out, 'f16'));
    if (r === '16' && out.status.f16?.ok) {
      ok(TP.validity(body('ext1').shape) === null, 'R16 sonucu geçerli');
      section('Kabul T04 (Fillet R16)');
      rel(out.bodies[0].volume, 113789.264, 1e-3, 'T04 hacmi R16 Fillet ile (referans 113789.264)');
      const bb = body('ext1').shape.boundingBox.bounds;
      ok(Math.abs(bb[1][0] - bb[0][0] - 118.243) < 1e-3 && Math.abs(bb[1][1] - bb[0][1] - 75) < 1e-6 && Math.abs(bb[1][2] - bb[0][2] - 105) < 1e-3, 'T04 kutusu 118.243 × 75 × 105: ' + JSON.stringify(bb));
    }
  }
}

// ------------------------------------------------------------------ C-42
section('C-42: yüzlere teğet R16 kesit gövdesi ana gövdeye Join / Combine');
{
  // Extrude 5'i doğrudan Birleştir ile
  let out = await K.rebuild({ params: [], features: T04.features.map((f) => (f.id === 'ext5' ? { ...f, op: 'join' } : f)) });
  ok(out.status.ext5?.ok, 'Extrude R16 kesit Birleştir: ' + errOf(out, 'ext5'));
  ok(out.bodies.length === 1, 'tek gövde: ' + out.bodies.length);
  rel(out.bodies[0]?.volume, 113789.264, 1e-3, 'Kabul T04 (teğet gövde Join) hacmi');
  if (out.status.ext5?.ok) {
    const all = faces('ext1');
    ok(all.filter((d) => onPlane(d, [1, 0, 0], 0)).length === 1, 'Join sonrası x = 0 düzleminde tek yüz');
    ok(all.filter((d) => onPlane(d, [S2, 0, S2], 6)).length === 1, 'Join sonrası 45° düzlemde tek yüz');
    ok(TP.validity(body('ext1').shape) === null, 'Join sonucu geçerli');
  }
  // Yeni gövde + Combine (Birleştir)
  out = await K.rebuild({ params: [], features: [...T04.features, { id: 'cmb', type: 'combine', target: 'ext1', tools: ['ext5'], op: 'join' }] });
  ok(out.status.cmb?.ok, 'Combine Join: ' + errOf(out, 'cmb'));
  ok(out.bodies.length === 1, 'Combine sonrası tek gövde');
  rel(out.bodies[0]?.volume, 113789.264, 1e-3, 'Combine hacmi');
}

console.log(`ie005-topo: ${pass} geçti, ${fail} kaldı${xfail ? `, ${xfail} beklenen-başarısız` : ''}`);
process.exit(fail ? 1 : 0);
