import { solveSketch } from '../src/ui/solver.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const near = (a, b, m) => ok(Math.abs(a - b) < 1e-5, `${m}: ${a} != ${b}`);
const sk = { points: { O: { x: 0, y: 0, fixed: true }, p1: { x: 1, y: 2 }, p2: { x: 48, y: 3 }, p3: { x: 52, y: 31 }, p4: { x: -2, y: 28 }, c: { x: 20, y: 12 } },
  ents: [{ id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p4' }, { id: 'l4', type: 'line', a: 'p4', b: 'p1' }, { id: 'c1', type: 'circle', c: 'c', r: 4 }],
  cons: [{ id: 'k1', type: 'horizontal', a: 'l1' }, { id: 'k2', type: 'vertical', a: 'l2' }, { id: 'k3', type: 'horizontal', a: 'l3' }, { id: 'k4', type: 'vertical', a: 'l4' }, { id: 'k5', type: 'coincident', a: 'p1', b: 'O' },
    { id: 'd1', type: 'dist', a: 'p1', b: 'p2', expr: 'L' }, { id: 'd2', type: 'dist', a: 'p2', b: 'p3', expr: 'L/2' }, { id: 'd3', type: 'diameter', a: 'c1', expr: '10' }, { id: 'd4', type: 'hdist', a: 'p1', b: 'c', expr: '25' }, { id: 'd5', type: 'vdist', a: 'p1', b: 'c', expr: '15' }] };
let r = await solveSketch(sk, { L: 60 });
ok(r.ok, 'çözüm: ' + JSON.stringify(r)); near(sk.points.p3.x, 60, 'p3.x'); near(sk.points.p3.y, 30, 'p3.y'); near(sk.ents[4].r, 5, 'r'); near(sk.points.c.x, 25, 'c.x'); near(sk.points.c.y, 15, 'c.y');
console.log('dof', r.dof); ok(r.dof === 0, 'tam kısıtlı');
r = await solveSketch(sk, { L: 80 }); near(sk.points.p3.x, 80, 'param L=80'); near(sk.points.p3.y, 40, 'L/2');
// yay + teğet
const s2 = { points: { c: { x: 0, y: 0, fixed: true }, a: { x: 10, y: 0.5 }, b: { x: 0.3, y: 10 }, e: { x: 25, y: 11 } }, ents: [{ id: 'ar', type: 'arc', c: 'c', a: 'a', b: 'b' }, { id: 'ln', type: 'line', a: 'b', b: 'e' }], cons: [{ id: 't', type: 'tangent', a: 'ln', b: 'ar' }, { id: 'r', type: 'radius', a: 'ar', expr: '12' }] };
r = await solveSketch(s2, {}); ok(r.ok, 'yay çözümü'); near(Math.hypot(s2.points.a.x, s2.points.a.y), 12, 'yay yarıçapı'); near(Math.hypot(s2.points.b.x, s2.points.b.y), 12, 'yay bitiş');
const tx = s2.points.e.x - s2.points.b.x, ty = s2.points.e.y - s2.points.b.y; near((tx * s2.points.b.x + ty * s2.points.b.y) / Math.hypot(tx, ty), 0, 'teğetlik');
// sürükleme
r = await solveSketch(sk, { L: 80 }, [{ id: 'c', x: 99, y: 99 }]); near(sk.points.c.x, 25, 'tam kısıtlı nokta sürüklenemez');
// çelişki
sk.cons.push({ id: 'bad', type: 'dist', a: 'p1', b: 'p2', expr: '10' }); r = await solveSketch(JSON.parse(JSON.stringify(sk)), { L: 80 }); ok(!r.ok || r.conflicting.length || r.redundant.length, 'çelişki bildirilir ' + JSON.stringify(r));
console.log(`${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
