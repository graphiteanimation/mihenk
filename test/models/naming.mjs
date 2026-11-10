// Kalıcı topolojik adlandırma (F-01) kanıt testleri. Her senaryoda beklenen eleman geometriden BAĞIMSIZ doğrulanır:
// yuvarlatma/pah yüzünün hangi iki adlı yüz arasında olduğu (komşuluk) + ayrıca geometriyle (doluluk/konum).
// Sınıf: DOĞRU | REDDEDİLDİ (ok:false, açık hata) | SESSİZ-YANLIŞ (ok:true ama yanlış eleman). Koşul: SESSİZ-YANLIŞ = 0.
import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { runMain, newKernel, rb, Sk, basePl, occupied, SRC, PI } from './lib.mjs';
import * as A from './part-a.mjs';
const TP = await import(pathToFileURL(path.join(SRC, 'kernel/topo.js')).href);
export const name = 'adlandirma';
const D = (...f) => ({ params: [], features: f });
const skf = (id, sk, plane = basePl('XY'), ents = sk.ents) => ({ id, type: 'sketch', plane, points: sk.points, ents, cons: [] });
const ext = (o) => ({ id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', dist: '20', extent: 'dist', dir: 'one', op: 'new', ...o });
// gövdede, adı `pre` ile başlayan yüzlerin komşu yüz ad kümeleri
function blendNbrs(K, bid, pre) {
  const b = K.last.bodies.get(bid); const T = TP.topoOf(b.shape); const out = [];
  b.fn.forEach((al, i) => { if (!al.some((n) => n.startsWith(pre))) return; const s = new Set(); for (const j of T.faceEdges[i]) for (const f of T.edgeFaces[j]) if (f !== i) for (const n of b.fn[f]) s.add(n); out.push(s); });
  return out;
}
const lineAt = (sk, ents, p, q) => ents.find((e) => { const a = sk.points[e.a], b = sk.points[e.b]; const m = (u, v) => Math.hypot(u.x - v[0], u.y - v[1]) < 1e-9; return e.type === 'line' && ((m(a, p) && m(b, q)) || (m(a, q) && m(b, p))); }).id;

export async function checks(t) {
  const tally = { doğru: 0, reddedildi: 0, sessizYanlış: 0 };
  const verdict = (label, ok, correct, extra = '') => {
    if (!ok) { tally.reddedildi++; console.log('  REDDEDİLDİ', label, extra); t.ok(true, label + ': ok:false (açık hata) ' + extra); return; }
    if (correct) { tally.doğru++; t.ok(true, label + ': doğru eleman'); return; }
    tally.sessizYanlış++; t.ok(false, label + ': SESSİZ YANLIŞ BAĞLANMA ' + extra);
  };
  // ---------- N1: F-01 yeniden üretimi (sketch varlık sırası kaydırma) + rastgele karıştırma
  {
    const sk = new Sk(); sk.rect(0, 0, 100, 60);
    const LA = lineAt(sk, sk.ents, [0, 0], [100, 0]), LB = lineAt(sk, sk.ents, [100, 0], [100, 60]); // (100,0) köşesinde buluşan iki çizgi
    const K = newKernel(); const d0 = D(skf('s1', sk), ext({}));
    await K.rebuild(d0);
    const edges = []; const n = K.last.bodies.get('e1').fn.length; // kenarlar
    const T = TP.topoOf(K.last.bodies.get('e1').shape);
    for (let j = 0; j < T.edges.size; j++) { const e = K.describe({ body: 'e1', idx: j }, 'edge'); if (e.geom === 'LINE' && Math.abs(e.start[2] - e.end[2]) > 19 && Math.abs(e.start[0] - 100) < 1e-9 && Math.abs(e.start[1]) < 1e-9) edges.push(e); }
    t.ok(edges.length === 1 && n === 6, 'N1: dikey (100,0) kenarı seçildi');
    const ref = edges[0];
    t.ok(ref.name && [ref.name.a, ref.name.b].sort().join('|') === [`e1:side:${LA}`, `e1:side:${LB}`].sort().join('|'), 'N1: kenar adı = iki yan yüz (' + JSON.stringify(ref.name) + ')');
    const rng = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
    const perms = [1, 2, 3].map((k) => { const e = sk.ents.slice(); for (let i = 0; i < k; i++) e.push(e.shift()); return e; });
    for (let k = 0; k < 8; k++) { const e = sk.ents.slice(); for (let i = e.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [e[i], e[j]] = [e[j], e[i]]; } perms.push(e); }
    for (const [pi, ents] of perms.entries()) {
      const d = D(skf('s1', sk, basePl('XY'), ents), ext({}), { id: 'f1', type: 'fillet', edges: [ref], r: '5' });
      const o = await K.rebuild(d);
      const nb = o.status.f1.ok ? blendNbrs(K, 'e1', 'f1:blend') : [];
      const byName = nb.length === 1 && nb[0].has(`e1:side:${LA}`) && nb[0].has(`e1:side:${LB}`);
      const byGeom = o.status.f1.ok && occupied(K, 'e1', [99.7, 0.3, 10]) === 0 && [[0.3, 0.3], [0.3, 59.7], [99.7, 59.7]].every(([x, y]) => occupied(K, 'e1', [x, y, 10]) === 1);
      verdict(`N1 sıra ${pi < 3 ? 'kaydırma ' + (pi + 1) : 'karıştırma ' + (pi - 2)}`, o.status.f1.ok, byName && byGeom, JSON.stringify(o.status.f1));
    }
    // aynı varlıklar silinip yeniden çizilirse (yeni kimlik) eski ad kaybolur → açık hata (sessiz değil)
    const sk2 = new Sk(); sk2.rect(0, 0, 100, 60); sk2.ents.forEach((e) => (e.id = 'x' + e.id));
    const o2 = await K.rebuild(D(skf('s1', sk2), ext({}), { id: 'f1', type: 'fillet', edges: [ref], r: '5' }));
    t.ok(!o2.status.f1.ok && o2.status.f1.error.code === 'ref.lost_edge', 'N1: varlıklar yeniden çizildi (yeni kimlik) → ref.lost_edge: ' + JSON.stringify(o2.status.f1));
    // eski biçim Ref (v1): birebir aynıysa yükseltilir; sıra değişmişse (fp farklı) reddedilir
    const K3 = newKernel(); await K3.rebuild(D(skf('s1', sk), ext({})));
    const legacy = { body: 'e1', kind: 'edge', idx: ref.idx, n: ref.n, fp: ref.fp, geom: ref.geom };
    let o3 = await K3.rebuild(D(skf('s1', sk), ext({}), { id: 'f1', type: 'fillet', edges: [legacy], r: '5' }));
    t.ok(o3.status.f1.ok && o3.refUpgrades.length === 1 && o3.refUpgrades[0].feature === 'f1' && o3.refUpgrades[0].ref.name.a, 'N1-göç: v1 Ref birebir aynı → kabul + refUpgrades: ' + JSON.stringify(o3.refUpgrades));
    t.ok(o3.status.f1.ok && occupied(K3, 'e1', [99.7, 0.3, 10]) === 0, 'N1-göç: yükseltilen Ref doğru köşe');
    // yükseltilmiş ad kullanılınca sıra değişimi artık doğru kenarı verir
    o3 = await K3.rebuild(D(skf('s1', sk, basePl('XY'), perms[1]), ext({}), { id: 'f1', type: 'fillet', edges: [o3.refUpgrades[0].ref], r: '5' }));
    verdict('N1-göç: yükseltilmiş Ref + sıra kaydırma', o3.status.f1.ok, occupied(K3, 'e1', [99.7, 0.3, 10]) === 0);
    const K4 = newKernel(); const o4 = await K4.rebuild(D(skf('s1', sk, basePl('XY'), perms[1]), ext({}), { id: 'f1', type: 'fillet', edges: [legacy], r: '5' }));
    verdict('N1-göç: v1 Ref, sketch sırası değişmiş (F-01 tam senaryo)', o4.status.f1.ok, o4.status.f1.ok && occupied(K4, 'e1', [99.7, 0.3, 10]) === 0, JSON.stringify(o4.status.f1));
    const o5 = await newKernel().rebuild(D(skf('s1', sk), ext({}), { id: 'f1', type: 'fillet', edges: [{ body: 'e1', kind: 'edge', idx: ref.idx, n: ref.n, fp: ref.fp }], r: '5' }));
    t.ok(!o5.status.f1.ok, 'N1-göç: geom türü olmayan v1 Ref reddedilir');
  }
  // ---------- N2: delik deseni adedi 6→8 (ve 6→3, 6→2): pah örnek 2'nin havşa kenarında kalmalı
  {
    const K = newKernel(); const b = await A.build(K, A.defaults, null, { noFinish: true }); await K.rebuild(b.doc);
    const T = TP.topoOf(K.last.bodies.get('rv').shape); let ref = null;
    for (let j = 0; j < T.edges.size; j++) { const e = K.describe({ body: 'rv', idx: j }, 'edge'); if (e.name && e.name.a.startsWith('pat[2]') && e.name.b.startsWith('pat[2]') && [e.name.a, e.name.b].some((x) => x.includes(':csink:')) && [e.name.a, e.name.b].some((x) => x.includes(':wall:'))) ref = e; }
    t.ok(!!ref, 'N2: örnek 2 havşa/duvar kenarı bulundu');
    for (const N of [6, 8, 3, 12, 2]) {
      const d = JSON.parse(JSON.stringify(b.doc)); d.params.find((p) => p.name === 'N').expr = String(N); d.features.push({ id: 'cf', type: 'chamfer', edges: [ref], d: '0.5' });
      const o = await K.rebuild(d);
      if (N <= 2) { t.ok(!o.status.cf.ok && o.status.cf.error.code === 'ref.lost_edge', `N2 N=${N}: örnek 2 yok → ref.lost_edge: ${JSON.stringify(o.status.cf)}`); continue; }
      const nb = o.status.cf.ok ? blendNbrs(K, 'rv', 'cf:cham') : [];
      const byName = nb.length === 1 && [...nb[0]].some((x) => x.startsWith('pat[2]bolt:csink')) && [...nb[0]].some((x) => x.startsWith('pat[2]bolt:wall'));
      // geometri: pah yüzünün merkezi örnek 2'nin açısında (2·360/N)
      let ang = null; if (o.status.cf.ok) { const bb = K.last.bodies.get('rv'); const i = bb.fn.findIndex((al) => al.some((x) => x.startsWith('cf:cham'))); const c = TP.faceWrap(TP.topoOf(bb.shape).faces.list[i]).center.toTuple(); ang = ((Math.atan2(c[1], c[0]) * 180) / PI + 360) % 360; }
      verdict(`N2 N=6→${N}: pah örnek 2'de (beklenen açı ${(720 / N).toFixed(1)}°, bulunan ${ang?.toFixed(1)})`, o.status.cf.ok, byName && Math.abs(ang - 720 / N) < 1e-6);
    }
  }
  // ---------- N3: araya özellik ekleme / silme / bastırma / geri sarma (kutu + dikey kenar yuvarlatma)
  {
    const prim = { id: 'b1', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '80', d: '50', h: '30', op: 'new' };
    const K = newKernel(); await K.rebuild(D(prim));
    const T = TP.topoOf(K.last.bodies.get('b1').shape); let ref;
    for (let j = 0; j < T.edges.size; j++) { const e = K.describe({ body: 'b1', idx: j }, 'edge'); if ([e.name.a, e.name.b].sort().join() === ['b1:x+', 'b1:y-'].join()) ref = e; }
    t.ok(!!ref, 'N3: x+/y- kenarı');
    const fil = { id: 'f1', type: 'fillet', edges: [ref], r: '4' };
    const corner = () => occupied(newK, 'b1', [79.6, 0.4, 15]) === 0 && occupied(newK, 'b1', [0.4, 0.4, 15]) === 1;
    let newK = K;
    const pocket = (() => { const s = new Sk(); s.rect(10, 10, 40, 40); return [skf('sp', s, basePl('XY', 30)), { id: 'pk', type: 'extrude', sketch: 'sp', profiles: 'all', dist: '10', extent: 'dist', dir: 'one', flip: true, op: 'cut' }]; })();
    const slot = (() => { const s = new Sk(); s.rect(70, -5, 90, 5); return [skf('ss', s, basePl('XY', 30)), { id: 'sl', type: 'extrude', sketch: 'ss', profiles: 'all', dist: '10', extent: 'dist', dir: 'one', flip: true, op: 'cut' }]; })();
    const midSlot = (() => { const s = new Sk(); s.rect(75, -5, 85, 5); return [{ ...skf('sm', s, basePl('XY', 18)), plane: basePl('XY', 18) }, { id: 'ms', type: 'extrude', sketch: 'sm', profiles: 'all', dist: '6', extent: 'dist', dir: 'one', flip: true, op: 'cut' }]; })();
    const scen = [
      ['temel', [prim, fil]],
      ['araya cep eklendi', [prim, ...pocket, fil]],
      ['cep bastırıldı', [prim, ...pocket.map((f) => (f.id === 'pk' ? { ...f, suppressed: true } : f)), fil]],
      ['cep silindi', [prim, fil]],
      ['kenarın üst ucunu kesen yuva eklendi (kenar kısalır)', [prim, ...slot, fil]],
      ['kenarı ortadan ikiye bölen yuva (aynı yüz çifti iki kenar)', [prim, ...midSlot, fil]],
      ['kutu boyu değişti w=120', [{ ...prim, w: '120' }, fil]],
    ];
    for (const [lab, feats] of scen) {
      newK = newKernel(); const o = await newK.rebuild(D(...JSON.parse(JSON.stringify(feats))));
      const nb = o.status.f1.ok ? blendNbrs(newK, 'b1', 'f1:blend') : [];
      const byName = nb.length >= 1 && nb.every((s) => s.has('b1:x+') && s.has('b1:y-'));
      const w = feats[0].w === '120' ? 120 : 80; const geomOk = o.status.f1.ok && occupied(newK, 'b1', [w - 0.4, 0.4, lab.includes('üst ucunu') ? 10 : 15]) === 0 && occupied(newK, 'b1', [0.4, 0.4, 15]) === 1;
      if (lab.includes('ikiye bölen')) { t.ok(!o.status.f1.ok && o.status.f1.error.code === 'ref.ambiguous_edge', `N3 ${lab}: belirsiz → ref.ambiguous_edge: ${JSON.stringify(o.status.f1)}`); if (o.status.f1.ok) tally.sessizYanlış++; else tally.reddedildi++; continue; }
      verdict(`N3 ${lab}`, o.status.f1.ok, byName && geomOk, JSON.stringify(o.status.f1));
    }
    // geri sarma: aynı çekirdekte sırayla, önbellekli sonuç temiz çekirdekle aynı
    const full = D(prim, ...pocket, fil); const Kr = newKernel();
    for (const r of [null, 1, 3, 4, null, 0, null]) {
      full.rollback = r; const o = await Kr.rebuild(full); const of = await newKernel().rebuild(JSON.parse(JSON.stringify(full)));
      t.ok(o.bodies.length === of.bodies.length && (o.bodies[0]?.volume ?? 0) === (of.bodies[0]?.volume ?? 0) && JSON.stringify(o.status) === JSON.stringify(of.status), `N3 geri sarma ${r}: önbellekli = temiz`);
    }
  }
  // ---------- N4: yüz üzerine sketch (plane.kind:'face') ada göre; yüz bölünürse açık hata
  {
    const prim = { id: 'b1', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '80', d: '50', h: '30', op: 'new' };
    const K = newKernel(); await K.rebuild(D(prim)); const T = TP.topoOf(K.last.bodies.get('b1').shape);
    let top; for (let i = 0; i < T.faces.size; i++) { const f = K.describe({ body: 'b1', idx: i }, 'face'); if (f.name.k === 'b1:z+') top = f; }
    const s = new Sk(); s.point(20, 20);
    const holeOn = (pre) => [...pre, { id: 'hs', type: 'sketch', plane: { kind: 'face', ref: top }, points: s.points, ents: s.ents, cons: [] }, { id: 'hh', type: 'hole', sketch: 'hs', kind: 'simple', dia: '5', extent: 'dist', depth: '8' }];
    for (const h of ['30', '45']) {
      const o = await newKernel().rebuild(D(...holeOn([{ ...prim, h }])));
      const z = o.holes[0]?.positions[0]?.[2]; verdict(`N4 üst yüz sketch, kutu h=${h}`, o.status.hh.ok && o.status.hs.ok, Math.abs(z - +h) < 1e-9);
    }
    // üst yüzü ikiye bölen tam boy kanal → üst yüz adı iki parçada: belirsiz → açık hata
    const ch = new Sk(); ch.rect(38, -5, 42, 55);
    const o = await newKernel().rebuild(D(...holeOn([prim, skf('cs', ch, basePl('XY', 30)), { id: 'cc', type: 'extrude', sketch: 'cs', profiles: 'all', dist: '5', extent: 'dist', dir: 'one', flip: true, op: 'cut' }])));
    t.ok(!o.status.hs.ok && o.status.hs.error.code === 'ref.ambiguous_face', 'N4 üst yüz bölündü → ref.ambiguous_face: ' + JSON.stringify(o.status.hs));
  }
  // ---------- N5: varlık kimliği yeniden kullanıldı (arayüz silinen kimliği yeni varlığa verebilir): tür değiştiyse ret
  {
    const pts = { O: { x: 0, y: 0, fixed: true }, a: { x: 0, y: 0 }, b: { x: 60, y: 0 }, c: { x: 60, y: 40 }, d: { x: 0, y: 40 }, m: { x: 30, y: 40 } };
    const ents = [{ id: 'l1', type: 'line', a: 'a', b: 'b' }, { id: 'l2', type: 'line', a: 'b', b: 'c' }, { id: 'l3', type: 'line', a: 'c', b: 'd' }, { id: 'l4', type: 'line', a: 'd', b: 'a' }];
    const K = newKernel(); await K.rebuild(D({ id: 's1', type: 'sketch', plane: basePl('XY'), points: pts, ents, cons: [] }, ext({})));
    const T = TP.topoOf(K.last.bodies.get('e1').shape); let side; for (let i = 0; i < T.faces.size; i++) { const f = K.describe({ body: 'e1', idx: i }, 'face'); if (f.name.k === 'e1:side:l3') side = f; }
    const ents2 = ents.map((e) => (e.id === 'l3' ? { id: 'l3', type: 'arc', c: 'm', a: 'c', b: 'd' } : e)); // l3 silinip yerine aynı kimlikle yay çizildi
    const o = await newKernel().rebuild(D({ id: 's1', type: 'sketch', plane: basePl('XY'), points: pts, ents: ents2, cons: [] }, ext({}), { id: 'sh', type: 'shell', faces: [side], t: '2' }));
    t.ok(!o.status.sh.ok && o.status.sh.error.code === 'ref.changed', 'N5: aynı kimlikli varlık türü değişti (çizgi→yay) → ref.changed: ' + JSON.stringify(o.status.sh));
    if (o.status.sh.ok) tally.sessizYanlış++; else tally.reddedildi++;
  }
  t.note('adlandırma-özet', tally); console.log('adlandırma özet', JSON.stringify(tally));
  t.ok(tally.sessizYanlış === 0, 'sessiz yanlış bağlanma = 0 (' + tally.sessizYanlış + ')');
}
await runMain(import.meta.url, name, async (t) => { await checks(t); });
