// İE-008 paket B: eskiz fillet (C-25 köşede yardımcı çizgi yok sayılır). Çalıştır: node test/ie008b-fillet.test.mjs
import * as O from '../src/ui/sketch/ops.js';
import { addPoint, addEnt } from '../src/ui/sketch/core.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  BAŞARISIZ', m); } };
const empty = () => ({ points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [] });
// merkez dikdörtgen + yardımcı köşegen (köşede üç nesne buluşur)
function centerRect(sk, w, h, diag) {
  const p = [addPoint(sk, -w, -h), addPoint(sk, w, -h), addPoint(sk, w, h), addPoint(sk, -w, h)];
  const l = p.map((_, i) => addEnt(sk, { type: 'line', a: p[i], b: p[(i + 1) % 4] }));
  const d = addEnt(sk, { type: 'line', a: p[0], b: p[2], cons: true });
  return { p, l, d, diag: diag && d };
}
{ // C-25: köşe noktasına tıklama (kenar çifti verilmeden)
  const sk = empty(); const R = centerRect(sk, 20, 10);
  const r = O.cornerAt(sk, R.p[0], 'fillet', 3, '3');
  ok(r.ok, 'C-25: yardımcı köşegen olan köşede fillet çalışır ' + JSON.stringify(r.err || ''));
  ok(sk.ents.some((e) => e.type === 'arc'), 'C-25: yay oluştu');
  ok(sk.ents.filter((e) => e.type === 'line' && !e.cons).length === 4, 'C-25: dört kenar durur');
}
{ // iki gerçek çizgi + iki yardımcı: yine yok sayılır; üç gerçek çizgi: hâlâ hata (iletiyle)
  const sk = empty(); const R = centerRect(sk, 20, 10);
  const x = addPoint(sk, 30, 30); addEnt(sk, { type: 'line', a: R.p[2], b: x });
  const r = O.cornerAt(sk, R.p[2], 'fillet', 3, '3'); ok(!r.ok && r.err && r.err.key === 'sk.op.corner_many', 'C-25: üç gerçek nesne açık iletiyle reddedilir ' + JSON.stringify(r.err || ''));
}
{ // tüm nesneler yardımcıysa (yardımcı dikdörtgen) fillet yine çalışır
  const sk = empty(); const p = [addPoint(sk, 0, 0), addPoint(sk, 10, 0), addPoint(sk, 10, 10)];
  addEnt(sk, { type: 'line', a: p[0], b: p[1], cons: true }); addEnt(sk, { type: 'line', a: p[1], b: p[2], cons: true });
  ok(O.cornerAt(sk, p[1], 'fillet', 2, '2').ok, 'yardımcı çizgi çifti de yuvarlatılır');
}
console.log(`ie008b-fillet: ${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
