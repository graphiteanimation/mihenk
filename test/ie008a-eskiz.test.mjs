// İE-008 paket A: eskiz kısıt ve geometri hataları (C-23, C-24, C-40, C-43, C-16, C-17/C-20, C-21 yan bulguları, T07/T08 tam tanım).
// Saf düzey: araç tablosu (tools.js) sahte bir Sketcher (S) ile, çözücü (solver.js) ve düzenleme işlemleri (ops.js/trim.js) doğrudan.
import { DEFS } from '../src/ui/sketch/tools.js';
import { solveSketch, probeFree } from '../src/ui/solver.js';
import { addPoint, addEnt, addCon, getEnt, clone } from '../src/ui/sketch/core.js';
import { findRegions } from '../src/shared/profiles.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  BAŞARISIZ', m); } };
const near = (a, b, m, tol = 1e-6) => ok(Math.abs(a - b) <= tol, `${m}: ${a} ≠ ${b}`);
const quiet = async (f) => { const w = process.stdout.write.bind(process.stdout); process.stdout.write = (s, ...r) => (/Sketcher|^\s*$/.test(String(s)) ? true : w(s, ...r)); try { return await f(); } finally { process.stdout.write = w; } };
const solve = (sk, vars = {}) => quiet(() => solveSketch(sk, vars));
const empty = () => ({ points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [] });
// Sketcher'ın araçlara verdiği yardımcıların saf karşılığı
const mkS = (sk = empty()) => ({ sk, opts: {}, _newPt: (x, y) => addPoint(sk, x, y), _ptFor: (s) => s.pid || addPoint(sk, s.x, s.y), _addEnt: (e) => addEnt(sk, e), _addEntCons: (e) => addEnt(sk, { ...e, cons: true }), _addCon: (t, a, b, ex) => addCon(sk, t, a, b, ex) });
const pts = (sk) => JSON.stringify(Object.fromEntries(Object.entries(sk.points).map(([k, p]) => [k, [+p.x.toFixed(6), +p.y.toFixed(6)]])));
const moved = (a, b) => { let m = 0; for (const k of Object.keys(a.points)) if (b.points[k]) m = Math.max(m, Math.hypot(a.points[k].x - b.points[k].x, a.points[k].y - b.points[k].y)); return m; };

// ---------------------------------------------------------------- C-23 kanal (slot) aracı
{
  const S = mkS(); const sk = S.sk;
  DEFS.slot.commit(S, [{ x: 21, y: 25 }, { x: 99, y: 25 }, { x: 50, y: 31 }]);
  const g0 = clone(sk); let r = await solve(sk);
  ok(r.ok && !r.redundant.length && !r.conflicting.length, 'C-23: kanal kendi iç kısıtlarıyla gereksiz/çelişen kısıt vermez ' + JSON.stringify([r.redundant, r.conflicting]));
  ok(r.dof === 5, 'C-23: ölçüsüz kanal serbestliği 5 (merkez x,y + yön + uzunluk + yarıçap): ' + r.dof);
  ok(moved(g0, sk) < 1e-6, 'C-23: çözüm kanalı yerinden oynatmaz: ' + moved(g0, sk));
  const A = sk.ents.find((e) => e.type === 'arc'), cl = sk.ents.find((e) => e.cons);
  addCon(sk, 'radius', A.id, undefined, { expr: '6' }); addCon(sk, 'dist', cl.a, cl.b, { expr: '78' });
  addCon(sk, 'hdist', 'O', cl.a, { expr: '21' }); addCon(sk, 'vdist', 'O', cl.a, { expr: '25' }); addCon(sk, 'horizontal', cl.id);
  r = await solve(sk);
  ok(r.ok && r.dof === 0 && !r.redundant.length, 'C-23: R6 + uzunluk 78 + merkez (21; 25) + yatay → tam tanımlı (serbestlik 0): ' + JSON.stringify({ dof: r.dof, red: r.redundant }));
  const f = await quiet(() => probeFree(sk)); ok(f && f.dof === 0 && f.freePts.size === 0, 'C-23: serbest nokta kalmaz');
  // yarıçap değişince bütün kanal izler (iç kısıtlar gerçekten bağlı)
  sk.cons.find((c) => c.type === 'radius').expr = '9'; r = await solve(sk);
  const lt = sk.ents.filter((e) => e.type === 'line' && !e.cons);
  ok(r.ok && lt.every((l) => Math.abs(Math.abs(sk.points[l.a].y - 25) - 9) < 1e-6 && Math.abs(Math.abs(sk.points[l.b].y - 25) - 9) < 1e-6), 'C-23: R9 → kenarlar merkezden 9 mm: ' + pts(sk));
  ok(Math.abs(sk.points[lt[0].a].y - sk.points[lt[1].a].y) > 17.9, 'C-23: iki kenar ayrı taraflarda kalır');
  // eğik kanal + açı ölçüsü ile tam tanım
  const S2 = mkS(); DEFS.slot.commit(S2, [{ x: 0, y: 0, pid: 'O' }, { x: 30, y: 20 }, { x: 10, y: 15 }]);
  const cl2 = S2.sk.ents.find((e) => e.cons), A2 = S2.sk.ents.find((e) => e.type === 'arc');
  r = await solve(S2.sk); ok(r.ok && r.dof === 3 && !r.redundant.length, 'C-23: orijinde başlayan eğik kanal serbestlik 3: ' + r.dof);
  const ax = addEnt(S2.sk, { type: 'line', a: 'O', b: addPoint(S2.sk, 10, 0), cons: true }); addCon(S2.sk, 'horizontal', ax); addCon(S2.sk, 'dist', 'O', S2.sk.ents.find((e) => e.id === ax).b, { expr: '10' });
  addCon(S2.sk, 'angle', ax, cl2.id, { expr: '30' }); addCon(S2.sk, 'dist', cl2.a, cl2.b, { expr: '40' }); addCon(S2.sk, 'diameter', A2.id, undefined, { expr: '8' });
  r = await solve(S2.sk); ok(r.ok && r.dof === 0 && !r.redundant.length, 'C-23: eğik kanal (açı 30°, uzunluk 40, Ø8) tam tanımlı: ' + JSON.stringify({ dof: r.dof, red: r.redundant }));
  const e2 = S2.sk.points[cl2.b]; near(e2.x, 40 * Math.cos(Math.PI / 6), 'C-23: eğik kanal uç x', 1e-6); near(e2.y, 20, 'C-23: eğik kanal uç y', 1e-6);
  ok(!findRegions(sk).open && findRegions(sk).regions.length === 1, 'C-23: kanal tek kapalı profil');
}

// ---------------------------------------------------------------- C-24 teğet yay: gereksiz/çelişen uyarısı yok
for (const [end, name] of [[[10, 12], 'tam yarım daire (yukarı)'], [[10, -12], 'tam yarım daire (aşağı)'], [[14, 8], 'çeyrekten büyük'], [[4, 6], 'geriye dönen']]) {
  const S = mkS(); const sk = S.sk; const a = addPoint(sk, 0, 0), b = addPoint(sk, 10, 0); addEnt(sk, { type: 'line', a, b });
  DEFS.arct.commit(S, [{ x: 10, y: 0, pid: b }, { x: end[0], y: end[1] }]);
  const g0 = clone(sk); const r = await solve(sk);
  ok(r.ok && !r.redundant.length && !r.conflicting.length, `C-24: teğet yay ${name}: gereksiz/çelişen kısıt yok ` + JSON.stringify([r.redundant, r.conflicting]));
  ok(r.dof === 6, `C-24: teğet yay ${name}: serbestlik 6 (çizgi 4 + yay 3 − teğet 1): ` + r.dof);
  ok(moved(g0, sk) < 1e-6, `C-24: teğet yay ${name}: çözüm geometriyi oynatmaz: ` + moved(g0, sk));
}
// yarım daireden sonra geri dönen teğet doğru (T02: kanal elle) → tam tanımlı olabilir
{
  const S = mkS(); const sk = S.sk; const a = addPoint(sk, 0, 0), b = addPoint(sk, 30, 0); const l1 = addEnt(sk, { type: 'line', a, b });
  addCon(sk, 'coincident', a, 'O'); addCon(sk, 'horizontal', l1); addCon(sk, 'dist', a, b, { expr: '30' });
  DEFS.arct.commit(S, [{ x: 30, y: 0, pid: b }, { x: 30, y: 12 }]); const arc = sk.ents.find((e) => e.type === 'arc'); const top = arc.a === b ? arc.b : arc.a;
  const d = addPoint(sk, 0, 12); const l2 = addEnt(sk, { type: 'line', a: top, b: d }); addCon(sk, 'tangent', l2, arc.id); addCon(sk, 'horizontal', l2);
  addCon(sk, 'radius', arc.id, undefined, { expr: '6' }); addCon(sk, 'dist', top, d, { expr: '30' });
  let r = await solve(sk); ok(r.ok && !r.redundant.length && !r.conflicting.length && r.dof === 0, 'C-24: doğru + teğet yarım daire + teğet dönüş doğrusu + yatay + R6 + 30 → tam tanımlı, uyarısız: ' + JSON.stringify({ dof: r.dof, red: r.redundant, c: r.conflicting }));
  near(sk.points[top].y, 12, 'C-24: yarım daire tepesi y = 12', 1e-6); near(sk.points[d].x, 0, 'C-24: dönüş doğrusu x = 0', 1e-6);
}
// yay → yay teğet zinciri (ortak uç)
{
  const S = mkS(); const sk = S.sk; const a = addPoint(sk, 0, 0), b = addPoint(sk, 10, 0); addEnt(sk, { type: 'line', a, b });
  DEFS.arct.commit(S, [{ x: 10, y: 0, pid: b }, { x: 20, y: 10 }]); const a1 = sk.ents.find((e) => e.type === 'arc'); const e1 = a1.a === b ? a1.b : a1.a;
  DEFS.arct.commit(S, [{ x: 20, y: 10, pid: e1 }, { x: 30, y: 20 }]);
  const g0 = clone(sk); const r = await solve(sk);
  ok(r.ok && !r.redundant.length && !r.conflicting.length && r.dof === 8, 'C-24: yay → yay teğet zinciri uyarısız, serbestlik 8: ' + JSON.stringify({ dof: r.dof, red: r.redundant }));
  ok(moved(g0, sk) < 1e-6, 'C-24: yay → yay zinciri yerinde kalır: ' + moved(g0, sk));
}
// ortak ucu olmayan teğet (doğru daireye/yaya) eski biçimiyle çalışmaya devam eder
{
  const sk = empty(); const c = addPoint(sk, 0, 0); const ci = addEnt(sk, { type: 'circle', c, r: 5 }); const l = addEnt(sk, { type: 'line', a: addPoint(sk, -10, 5.2), b: addPoint(sk, 10, 5.1) });
  addCon(sk, 'tangent', l, ci); const r = await solve(sk); ok(r.ok && !r.redundant.length, 'teğet doğru-daire (ortak uç yok) çalışır');
  const L = getEnt(sk, l), A = sk.points[L.a], B = sk.points[L.b], C = sk.points[c]; const dd = Math.abs((B.x - A.x) * (A.y - C.y) - (A.x - C.x) * (B.y - A.y)) / Math.hypot(B.x - A.x, B.y - A.y); near(dd, getEnt(sk, ci).r, 'doğru daireye teğet', 1e-6);
}

console.log(`${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
