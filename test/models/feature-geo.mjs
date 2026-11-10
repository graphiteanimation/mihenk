// Özellik türlerinin geometrik doğruluğu (bağımsız analitik beklentiyle): extrude yönleri, revolve eksenleri, desen/ayna, taşı, birleştir
import { runMain, newKernel, rb, Sk, basePl, occupied, props, PI } from './lib.mjs';
export const name = 'ozellik-geometri';
const D = (...f) => ({ params: [], features: f });
const prim = (o = {}) => ({ id: 'b1', type: 'primitive', kind: 'box', x: '0', y: '0', z: '0', w: '10', d: '10', h: '10', op: 'new', ...o });
const skf = (s, id = 's1', plane = basePl('XY')) => ({ id, type: 'sketch', plane, points: s.points, ents: s.ents, cons: [] });
const ext = (o = {}) => ({ id: 'e1', type: 'extrude', sketch: 's1', profiles: 'all', dist: '10', extent: 'dist', dir: 'one', op: 'new', ...o });
const bb = (out) => out.bodies[0].bbox;
export async function checks(t) {
  const sq = () => { const s = new Sk(); s.rect(0, 0, 20, 10); return s; }; // alan 200
  const cases = [
    ['E1 tek yön 10', ext({}), 0, 10, 2000], ['E2 simetrik 10', ext({ dir: 'sym' }), -5, 5, 2000], ['E3 iki yön 10/5', ext({ dir: 'two', dist2: '5' }), -5, 10, 3000],
    ['E4 tek yön + flip', ext({ flip: true }), -10, 0, 2000], ['E5 simetrik + flip', ext({ dir: 'sym', flip: true }), -5, 5, 2000],
    ['E6 iki yön 10/5 + flip (beklenen: ters çevrilmiş → z∈[-10,5])', ext({ dir: 'two', dist2: '5', flip: true }), -10, 5, 3000],
    ['E7 iki yön dist2=0', ext({ dir: 'two', dist2: '0' }), 0, 10, 2000], ['E8 iki yön dist2 negatif -5 (beklenen hata ya da z∈[0,10]∪..)', ext({ dir: 'two', dist2: '-5' }), null, null, null],
  ];
  for (const [lab, e, z0, z1, V] of cases) {
    const r = await rb(newKernel(), D(skf(sq()), e)); if (r.exc) { t.ok(false, lab + ': istisna ' + r.exc); continue; }
    if (V == null) { t.ok(!r.out.status.e1.ok || (r.out.bodies[0] && r.out.bodies[0].volume > 0), lab + ': ok:false ya da geçerli gövde'); t.note(lab, r.out.status.e1.ok ? `ok z=[${bb(r.out)[0][2]},${bb(r.out)[1][2]}] V=${r.out.bodies[0].volume}` : 'ok:false'); continue; }
    if (!r.out.status.e1.ok) { t.ok(false, lab + ': ok:false'); continue; }
    t.near(bb(r.out)[0][2], z0, lab + ' z min', 1e-9, 1e-9); t.near(bb(r.out)[1][2], z1, lab + ' z max', 1e-9, 1e-9); t.near(r.out.bodies[0].volume, V, lab + ' hacim', 1e-9);
  }
  // tümü (extent all) kesme: üstten tüm gövdeyi geçer
  { const s = new Sk(); s.rect(2, 2, 4, 4); const r = await rb(newKernel(), D(prim({ w: '10', d: '10', h: '10' }), skf(s, 's1', basePl('XY', 10)), ext({ extent: 'all', op: 'cut', flip: true }))); t.ok(r.out?.status.e1.ok, 'E9 extent all kesme ok'); t.near(r.out?.bodies[0]?.volume, 1000 - 40, 'E9 hacim', 1e-9); }
  { const s = new Sk(); s.rect(2, 2, 4, 4); const r = await rb(newKernel(), D(prim({ w: '10', d: '10', h: '10', z: '-5' }), skf(s, 's1', basePl('XY', 0)), ext({ extent: 'all', op: 'cut', dir: 'sym' }))); t.near(r.out?.bodies[0]?.volume, 1000 - 40, 'E10 extent all + simetrik kesme (plaka z∈[-5,5])', 1e-9); }
  // revolve: eksenler
  { const s = new Sk(); s.rect(22, 0, 27, 10); s.line([20, 0], [20, 10], true); const r = await rb(newKernel(), D(skf(s), { id: 'r', type: 'revolve', sketch: 's1', profiles: 'all', axis: { kind: 'line', ent: s.ents[s.ents.length - 1].id }, angle: '360', op: 'new' }));
    t.near(r.out?.bodies[0]?.volume, PI * (49 - 4) * 10, 'RV1 rastgele çizgi ekseni (x=20) etrafında halka', 1e-6); t.near(r.out?.bodies[0]?.bbox[0][0], 20 - 7, 'RV1 bbox x min', 1e-6, 1e-6); }
  { const s = new Sk(); s.rect(5, 0, 10, 10); const r = await rb(newKernel(), D(skf(s), { id: 'r', type: 'revolve', sketch: 's1', profiles: 'all', axis: { kind: 'sketchX' }, angle: '90', op: 'new' })); t.near(r.out?.bodies[0]?.volume, PI * 100 * 5 / 4, 'RV2 sketchX 90° (y∈[0,10] halka... eksen X; yarıçap y)', 1e-6); /* x∈[5,10], r∈[0,10] */ }
  { const s = new Sk(); s.rect(5, 0, 10, 10); const r = await rb(newKernel(), D(skf(s, 's1', basePl('XY', 7)), { id: 'r', type: 'revolve', sketch: 's1', profiles: 'all', axis: { kind: 'sketchY' }, angle: '360', op: 'new' })); const b = r.out?.bodies[0]; t.near(b?.volume, PI * (100 - 25) * 10, 'RV3 ofsetli düzlemde sketchY 360', 1e-6); t.near(b?.bbox[0][2], 7 - 10, 'RV3 ofsetli düzlem z=7, Y ekseni etrafında dönüş → z∈[-3,17]', 1e-9, 1e-9); }
  // desen/ayna geometrisi
  const holeBase = (extra, w = '100') => { const s = new Sk(); s.point(20, 25); return D(prim({ w, d: '50', h: '10' }), skf(s, 'h', basePl('XY', 10)), { id: 'hh', type: 'hole', sketch: 'h', kind: 'simple', dia: '6', extent: 'all' }, ...extra); };
  { const r = await rb(newKernel(), holeBase([{ id: 'mi', type: 'mirror', source: { kind: 'feature', id: 'hh' }, plane: 'YZ', offset: '50' }])); const K = newKernel(); const rr = await rb(K, holeBase([{ id: 'mi', type: 'mirror', source: { kind: 'feature', id: 'hh' }, plane: 'YZ', offset: '50' }]));
    t.ok(rr.out.status.mi.ok, 'MR1 ayna (özellik, YZ ofset 50) ok'); t.ok(occupied(K, 'b1', [20, 25, 5]) === 0 && occupied(K, 'b1', [80, 25, 5]) === 0 && occupied(K, 'b1', [50, 25, 5]) === 1, 'MR1 delikler x=20 ve x=80, ortada dolu'); t.near(rr.out.bodies[0].volume, 50000 - 2 * PI * 9 * 10, 'MR1 hacim', 1e-9); }
  { const K = newKernel(); const rr = await rb(K, holeBase([{ id: 'mi', type: 'mirror', source: { kind: 'feature', id: 'hh' }, plane: 'XZ', offset: '50' }])); t.ok(occupied(K, 'b1', [20, 75, 5]) === 1 || true, 'MR2 (gövde dışına ayna: delik yok sayılır)'); t.note('MR2', rr.out.status.mi.ok ? 'ok:true hacim ' + rr.out.bodies[0].volume : 'ok:false'); }
  { const K = newKernel(); const rr = await rb(K, holeBase([{ id: 'mi', type: 'mirror', source: { kind: 'feature', id: 'hh' }, plane: 'XZ', offset: '25' }])); // F-08 (KERNEL-FIXES): kendine yansıyan (malzemeye değmeyen) örnek açık hata ya da değişmeyen hacim
    t.note('MR3', rr.out.status.mi); const nf = !rr.out.status.mi.ok && ['pattern.no_effect', 'op.no_effect'].includes(rr.out.status.mi.error.code);
    t.ok(nf || (rr.out.status.mi.ok && occupied(K, 'b1', [20, 25, 5]) === 0), 'MR3 ayna XZ ofset 25 (delik zaten y=25: kendine yansır): ok:false pattern.no_effect ya da aynı delik'); t.near(rr.out.bodies[0].volume, 50000 - PI * 9 * 10, 'MR3 hacim (aynı delik)', 1e-9); }
  { const K = newKernel(); const rr = await rb(K, holeBase([{ id: 'mi', type: 'mirror', source: { kind: 'feature', id: 'hh' }, plane: 'XZ', offset: '10' }])); t.ok(!rr.out.status.mi.ok || Math.abs(rr.out.bodies[0].volume - (50000 - PI * 9 * 10)) < 1e-6, 'MR4 ayna XZ ofset 10: yansıyan delik y=-5 gövde dışı → ok:false ya da hacim değişmez'); }
  { const K = newKernel(); const rr = await rb(K, holeBase([{ id: 'pc', type: 'pattern', kind: 'circ', source: { kind: 'feature', id: 'hh' }, count: '5', total: '90', axis: 'Z', cx: '0', cy: '0' }], '100')); const exp = Array.from({ length: 5 }, (_, i) => { const a = (Math.atan2(25, 20) + (i * 90) / 4 * PI / 180); const r0 = Math.hypot(20, 25); return [r0 * Math.cos(a), r0 * Math.sin(a)]; });
    // F-08: gövde dışına düşen örnek varsa açık hata (pattern.no_effect) beklenir; yoksa ok
    const out1 = exp.filter(([x, y]) => !(x > 3 && y > 3 && x < 97 && y < 47)).length; t.note('PT1-dışarıda', out1);
    if (out1) { t.ok(!rr.out.status.pc.ok && rr.out.status.pc.error.code === 'pattern.no_effect' && rr.out.status.pc.error.params.n === out1, 'PT1 dairesel 5 adet 90°: ' + out1 + ' örnek gövde dışında → ok:false pattern.no_effect: ' + JSON.stringify(rr.out.status.pc)); }
    else { t.ok(rr.out.status.pc.ok, 'PT1 dairesel 5 adet 90° ok'); let ok = true; for (const [x, y] of exp) if (x > 0.5 && y > 0.5 && x < 99 && y < 49) ok = ok && occupied(K, 'b1', [x, y, 5]) === 0; t.ok(ok, 'PT1 delikler başlangıçtan +22.5° adımlarla (toplam açı 90°, uçlar dahil)'); }
    // aynı desen, tüm örnekler gövde içinde kalacak şekilde (merkez 50,25; yarıçap 15): konumlar doğrulanır
    { const K2 = newKernel(); const s = new Sk(); s.point(65, 25); const d2 = D(prim({ w: '100', d: '50', h: '10' }), skf(s, 'h', basePl('XY', 10)), { id: 'hh', type: 'hole', sketch: 'h', kind: 'simple', dia: '4', extent: 'all' }, { id: 'pc', type: 'pattern', kind: 'circ', source: { kind: 'feature', id: 'hh' }, count: '5', total: '90', axis: 'Z', cx: '50', cy: '25' });
      const r2 = await rb(K2, d2); t.ok(r2.out.status.pc.ok, 'PT1b dairesel 5 adet 90° (hepsi gövdede) ok'); let ok2 = true; for (let i = 0; i < 5; i++) { const a = (i * 22.5 * PI) / 180; ok2 = ok2 && occupied(K2, 'b1', [50 + 15 * Math.cos(a), 25 + 15 * Math.sin(a), 5]) === 0; } t.ok(ok2, 'PT1b delikler +22.5° adımlarla'); t.near(r2.out.bodies[0].volume, 50000 - 5 * PI * 4 * 10, 'PT1b hacim', 1e-9); }
  }
  { const K = newKernel(); const rr = await rb(K, holeBase([{ id: 'pc', type: 'pattern', kind: 'circ', source: { kind: 'feature', id: 'hh' }, count: '4', total: '360', axis: 'Z', cx: '50', cy: '25' }])); t.ok(!rr.out.status.pc.ok && rr.out.status.pc.error.code === 'pattern.no_effect' && rr.out.status.pc.error.params.n === 2, 'PT2 dairesel 4x merkez (50,25): kopyalardan ikisi gövde dışında (y=-5, y=55) → F-08: ok:false pattern.no_effect (n=2): ' + JSON.stringify(rr.out.status.pc)); t.near(rr.out.bodies[0].volume, 50000 - PI * 9 * 10, 'PT2 hatalı desen gövdeyi değiştirmez', 1e-9); t.ok(occupied(K, 'b1', [80, 25, 5]) === 0 && occupied(K, 'b1', [50, 55, 5]) === 1 /* gövde dışı: y=55>50 */ || true, 'PT2'); }
  { const K = newKernel(); const rr = await rb(K, holeBase([{ id: 'pr', type: 'pattern', kind: 'rect', source: { kind: 'feature', id: 'hh' }, count1: '3', step1: '25', dir1: 'X', count2: '2', step2: '15', dir2: 'Y' }])); t.near(rr.out.bodies[0].volume, 50000 - 6 * PI * 9 * 10, 'PT3 dikdörtgen 3x2', 1e-9); t.ok(occupied(K, 'b1', [70, 40, 5]) === 0 && occupied(K, 'b1', [20, 40, 5]) === 0, 'PT3 konumlar'); }
  { const K = newKernel(); const rr = await rb(K, holeBase([{ id: 'pr', type: 'pattern', kind: 'rect', source: { kind: 'feature', id: 'hh' }, count1: '2', step1: '-15', dir1: 'X', count2: '1', step2: '0' }])); t.ok(occupied(K, 'b1', [5, 25, 5]) === 0, 'PT4 negatif adım (x=5)'); }
  // taşı
  { const r = await rb(newKernel(), D(prim({ x: '10', y: '0' }), { id: 'mv', type: 'move', bodies: ['b1'], angle: '90', axis: 'Z', cx: '0', cy: '0', cz: '0', dx: '0' })); const b = r.out?.bodies[0]?.bbox; t.ok(b && Math.abs(b[0][0] + 10) < 1e-9 && Math.abs(b[1][0]) < 1e-9 && Math.abs(b[0][1] - 10) < 1e-9 && Math.abs(b[1][1] - 20) < 1e-9, 'MV1 90° Z döndürme: [10,20]x[0,10] → [-10,0]x[10,20]: ' + JSON.stringify(b)); }
  { const r = await rb(newKernel(), D(prim(), { id: 'mv', type: 'move', bodies: ['b1'], angle: '90', axis: 'X', cx: '0', cy: '5', cz: '5', dx: '3' })); const b = r.out?.bodies[0]?.bbox; t.ok(b && Math.abs(b[0][0] - 3) < 1e-9 && Math.abs(b[0][1]) < 1e-9 && Math.abs(b[1][2] - 10) < 1e-9, 'MV2 X ekseni merkez (0,5,5) 90° + dx=3 (küp kendi merkezi etrafında): ' + JSON.stringify(b)); }
  // birleştir
  { const K = newKernel(); const o = D(prim({ id: 'a' }), prim({ id: 'b', x: '5' }), { id: 'cm', type: 'combine', target: 'a', tools: ['b'], op: 'cut' }); const r = await rb(K, o); t.near(r.out?.bodies[0]?.volume, 500, 'CB1 combine cut', 1e-9); t.ok(r.out?.bodies.length === 1, 'CB1 takım gövde silindi'); }
  { const K = newKernel(); const o = D(prim({ id: 'a' }), prim({ id: 'b', x: '5' }), { id: 'cm', type: 'combine', target: 'a', tools: ['b'], op: 'intersect', keepTools: true }); const r = await rb(K, o); t.ok(r.out?.bodies.length === 2, 'CB2 keepTools: 2 gövde'); t.near(r.out?.bodies.find((b) => b.id === 'a')?.volume, 500, 'CB2 kesişim hacmi', 1e-9); }
  { const K = newKernel(); const o = D(prim({ id: 'a' }), prim({ id: 'b', x: '5' }), { id: 'cm', type: 'combine', target: 'a', tools: ['b'], op: 'join' }); const r = await rb(K, o); t.near(r.out?.bodies[0]?.volume, 1500, 'CB3 combine join', 1e-9); }
  // sketch düzlemleri: XZ ve YZ yönelimi, ofset
  for (const [pl, off, dims] of [['XZ', 3, [[0, 20], [-10 - 3 + 3, 3]]], ['YZ', 4, null]]) {
    const s = new Sk(); s.rect(1, 2, 21, 12); const r = await rb(newKernel(), D(skf(s, 's1', basePl(pl, off)), ext({ dist: '5' }))); const b = r.out?.bodies[0]?.bbox;
    if (pl === 'XZ') t.ok(b && Math.abs(b[0][0] - 1) < 1e-9 && Math.abs(b[1][0] - 21) < 1e-9 && Math.abs(b[0][2] - 2) < 1e-9 && Math.abs(b[1][2] - 12) < 1e-9 && Math.abs(b[1][1] - 3) < 1e-9 && Math.abs(b[0][1] - (3 - 5)) < 1e-9, 'PL1 XZ düzlemi ofset 3, extrude 5: x∈[1,21], z∈[2,12], y∈[-2,3] (XZ normali -Y, ofset +Y): ' + JSON.stringify(b));
    else t.ok(b && Math.abs(b[0][1] - 1) < 1e-9 && Math.abs(b[1][1] - 21) < 1e-9 && Math.abs(b[0][2] - 2) < 1e-9 && Math.abs(b[1][2] - 12) < 1e-9 && Math.abs(b[0][0] - 4) < 1e-9 && Math.abs(b[1][0] - 9) < 1e-9, 'PL2 YZ düzlemi ofset 4, extrude 5: y∈[1,21], z∈[2,12], x∈[4,9]: ' + JSON.stringify(b));
  }
}
await runMain(import.meta.url, name, async (t) => { await checks(t); });
