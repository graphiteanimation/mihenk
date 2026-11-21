// Hizalama izinden otomatik yatay/dikey kısıt ve "Sabitle" ile çatışmanın çözümü (WP-21; WP-08 7g). Saf: DOM yok.
// Otomatik eklenen yatay/dikey kısıtlar `auto: true` taşır. Sabitlenen noktalar bir otomatik yatay/dikey kısıtı zaten
// belirliyorsa (kısıtın bütün noktaları sabit) o kısıt gereksizdir: çözücü onu "fazla kısıt" sayar ve Sabitle reddedilirdi.
// Kullanıcının elle eklediği kısıtlara dokunulmaz.
import { getEnt } from './core.js';

const HV = { h: { line: 'horizontal', pp: 'horizontal_pp' }, v: { line: 'vertical', pp: 'vertical_pp' } };

// kısıtın nokta kimlikleri (yalnız yatay/dikey ailesi; diğerleri null)
export function hvPoints(sk, c) {
  if (c.type === 'horizontal_pp' || c.type === 'vertical_pp') return [c.a, c.b];
  if (c.type === 'horizontal' || c.type === 'vertical') { const e = getEnt(sk, c.a); return e && e.type === 'line' ? [e.a, e.b] : null; }
  return null;
}

// p ve q bugünkü kısıtlarla aynı eksen değerini (h: y, v: x) paylaşıyor mu? (birleşim kümesi; ikisi de sabitse belirlenmiş sayılır)
export function hvSame(sk, p, q, axis) {
  if (p === q) return true;
  const P = sk.points; if (P[p]?.fixed && P[q]?.fixed) return true;
  const par = new Map(); const f = (x) => { while (par.has(x) && par.get(x) !== x) x = par.get(x); return x; };
  const u = (a, b) => { const ra = f(a), rb = f(b); if (ra !== rb) par.set(ra, rb); };
  for (const c of sk.cons) {
    if (c.type === 'coincident') u(c.a, c.b);
    else if (c.type === HV[axis].pp) u(c.a, c.b);
    else if (c.type === HV[axis].line) { const e = getEnt(sk, c.a); if (e && e.type === 'line') u(e.a, e.b); }
  }
  return f(p) === f(q);
}

// Yeni nokta pid hizalama yakalamasıyla (snap.kind 'align', refs) konduysa eklenecek kısıtlar: [[tip, pid, ref]].
// Nokta son konumunda referansla hâlâ aynı x (dikey) / y (yatay) değerindeyse ve bu zaten belirli değilse.
export function alignTraceCons(sk, pid, snap, skipRef = null) {
  if (!snap || snap.kind !== 'align' || !Array.isArray(snap.refs)) return [];
  const p = sk.points[pid]; if (!p) return [];
  const out = [];
  for (const r of snap.refs) {
    const q = sk.points[r.id]; if (!q || r.id === pid || r.id === skipRef) continue;
    const axis = r.axis === 'v' ? 'v' : 'h';
    if (Math.abs(axis === 'v' ? p.x - q.x : p.y - q.y) > 1e-9) continue; // kaydırıldı (ör. çizgi yatay/dikey hizası): hiza bozuldu
    if (hvSame(sk, pid, r.id, axis)) continue;
    out.push([HV[axis].pp, pid, r.id]);
  }
  return out;
}

// "Sabitle" sonrası sabit olacak nokta kümesiyle gereksizleşen OTOMATİK yatay/dikey kısıtların kimlikleri
export function autoHvRedundantAfterFix(sk, fixedIds) {
  const fixed = (id) => fixedIds.has(id) || !!sk.points[id]?.fixed;
  return sk.cons.filter((c) => c.auto === true).filter((c) => { const pts = hvPoints(sk, c); return pts && pts.every(fixed); }).map((c) => c.id);
}

// Katı uygulama (kullanıcı kısıtı/ölçüsü/Sabitle) fazla kısıt verirse geri çekilecek OTOMATİK yatay/dikey kısıtlar: bu adımda eklenen
// kısıtların ve sabitlik durumu değişen noktaların dokunduğu noktalara bağlı olanlar (adımda eklenenler hariç). before/after: eskiz.
export function autoYield(before, after) {
  const old = new Set((before.cons || []).map((c) => c.id)); const pts = new Set();
  const addRef = (id) => { if (id in after.points) pts.add(id); else { const e = getEnt(after, id); if (e) for (const k of ['a', 'b', 'c', 'p']) if (e[k] && e[k] in after.points) pts.add(e[k]); } };
  for (const c of after.cons) if (!old.has(c.id)) for (const k of ['a', 'b', 'c']) if (c[k]) addRef(c[k]);
  for (const [id, p] of Object.entries(after.points)) if (!!p.fixed !== !!before.points?.[id]?.fixed) pts.add(id);
  if (!pts.size) return [];
  return after.cons.filter((c) => c.auto === true && old.has(c.id)).filter((c) => (hvPoints(after, c) || []).some((p) => pts.has(p))).map((c) => c.id);
}
