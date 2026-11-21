// WP-14: mengenede coklu parca: ayni programi birden cok is sifirina (G54..G59, G54.1 Pn) kopyalama ve siralama. Saf JS.
// IR daima ilk parcanin koordinatlaridir; kopyalar yalniz is sifiri (workOffset) ile ayrilir (parcalarin fiziksel konumu is sifirlarinda).
// Kopya is sifiri kurali: programin kullandigi ayri is sifirlari (G54, G55, ...) sirasiyla n tane ise k. parca her birini k*n adim ileri alir
// (tek setup: G54 -> G55 -> G56; iki setup G54+G55: parca 2 = G56+G57). G54.1 icin Pn ilerler. Siralama: 'byOp' = her islem tum parcalara
// (takim degisimi az), 'byPart' = once bir parcanin tum setup blogu, sonra digeri. Kopyalar simule edilmez (ilk parca temsilidir).
import { cerr } from './geom/err.js';

export const PART_ORDERS = ['byOp', 'byPart'];
export const MAX_PARTS = 48;
const SEQ = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'];
const wcsName = (w) => (w.kind === 'G54.1' ? `G54.1 P${w.p}` : w.kind);
const wcsKey = (s) => String(s).replace(/\s+/g, '').toUpperCase();

// is sifirini n adim ileri al (G54..G59 dizisi ya da G54.1 Pn)
export function shiftOffset(wo, n) {
  if (wo.kind === 'G54.1') return { kind: 'G54.1', p: wo.p + n };
  const i = SEQ.indexOf(wo.kind); if (i < 0) throw cerr('cam.multi.bad_offset', { kind: String(wo.kind) });
  if (i + n >= SEQ.length) throw cerr('cam.multi.out_of_range', { from: wo.kind, n });
  return { kind: SEQ[i + n] };
}
// opts: { count (toplam parca, >=1), order, machine? (protected.wcs denetimi) } -> { program, offsets: [[...]], warnings }
export function replicateProgram(program, { count = 1, order = 'byOp', machine = null } = {}) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PARTS) throw cerr('cam.multi.bad_count', { max: MAX_PARTS });
  if (!PART_ORDERS.includes(order)) throw cerr('cam.multi.bad_order', { order: String(order) });
  if (count === 1) return { program, offsets: [], warnings: [] };
  const secs = program.sections;
  // ayri is sifirlari (gorunus sirasiyla)
  const distinct = []; for (const s of secs) { const k = wcsName(s.setup.workOffset); if (!distinct.includes(k)) distinct.push(k); }
  const stride = distinct.length;
  const prot = new Set((machine?.protected?.wcs || []).map(wcsKey));
  const used = new Set(distinct.map(wcsKey));
  const kinds = new Set(secs.map((s) => (s.setup.workOffset.kind === 'G54.1' ? 'G54.1' : 'G5x')));
  if (kinds.size > 1) throw cerr('cam.multi.mixed_offsets');
  const make = (sec, k) => { // k = 0 ilk parca (degismez)
    if (k === 0) return sec;
    const wo = shiftOffset(sec.setup.workOffset, k * stride);
    const nm = wcsName(wo);
    if (prot.has(wcsKey(nm))) throw cerr('cam.multi.protected_wcs', { wcs: nm });
    if (used.has(wcsKey(nm))) throw cerr('cam.multi.offset_clash', { wcs: nm });
    return { ...sec, setup: { ...sec.setup, id: `${sec.setup.id}#${k + 1}`, name: `${sec.setup.name ?? sec.setup.id} (${k + 1})`, workOffset: wo, stockFrom: 'blank', part: k + 1 }, toolpath: sec.toolpath };
  };
  // kopya kumeleri cakismasin: uretilen her is sifiri benzersiz olmali
  const seen = new Set(used); const out = []; const offsets = [];
  const blocks = []; for (const s of secs) { const last = blocks.at(-1); if (last && last[0].setup.id === s.setup.id) last.push(s); else blocks.push([s]); }
  const check = (sec) => { if (sec.setup.part) { const k = wcsKey(wcsName(sec.setup.workOffset)); if (!offsets.some((o) => o.key === k)) { offsets.push({ key: k, wcs: wcsName(sec.setup.workOffset), part: sec.setup.part }); if (seen.has(k)) throw cerr('cam.multi.offset_clash', { wcs: wcsName(sec.setup.workOffset) }); seen.add(k); } } return sec; };
  for (const blk of blocks) {
    if (order === 'byOp') for (const sec of blk) for (let k = 0; k < count; k++) out.push(check(make(sec, k)));
    else for (let k = 0; k < count; k++) for (const sec of blk) out.push(check(make(sec, k)));
  }
  return { program: { ...program, sections: out }, offsets: offsets.map(({ wcs, part }) => ({ wcs, part })), warnings: [] };
}
