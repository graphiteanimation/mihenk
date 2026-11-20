// WP-17: belge icindeki teknik resim sayfalari (doc.drawings): varsayilanlar, standart gorunus yerlesimi, sema denetimi, hesap boru hatti.
// doc.drawings yoksa (eski belgeler) bos liste sayilir; alan eklenmesi FILE_VERSION'i degistirmez (geriye uyumlu, isteğe bagli alan).
import { KErr } from '../shared/errors.js';
import { ORIENT_KEYS, SIDES, kernelSpecs, autoScale, viewBasis } from './views.js';
import { composeSheet, sheetSize, SHEETS, FRAME, TB, TB_FIELDS } from './sheet.js';
import { DIM_TYPES } from './dims.js';

export const DRW_LIMITS = { drawings: 100, views: 24, dims: 2000, notes: 500, rough: 500, clines: 500, str: 2000 };
const fail = (path, expect) => { throw new KErr('schema.bad_field', { path, expect }); };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, p) => { if (typeof v !== 'number' || !Number.isFinite(v)) fail(p, 'number'); };
const pt2 = (v, p) => { if (!Array.isArray(v) || v.length !== 2) fail(p, 'list'); v.forEach((x, i) => num(x, p + '[' + i + ']')); };
const str = (v, p, max = 200) => { if (typeof v !== 'string') fail(p, 'text'); if (v.length > max) throw new KErr('schema.too_long', { path: p, max }); };
const oneOf = (v, list, p) => { if (!list.includes(v)) fail(p, list.join('/')); };
const arr = (v, p, max) => { if (!Array.isArray(v)) fail(p, 'list'); if (v.length > max) throw new KErr('schema.too_many', { what: p, max }); };
const opt = (o, k, chk, p) => { if (o[k] !== undefined && o[k] !== null) chk(o[k], p + '.' + k); };
const bool = (v, p) => { if (typeof v !== 'boolean') fail(p, 'boolean'); };

function refChk(r, p) {
  if (!isObj(r)) fail(p, 'object');
  if (r.src !== null && r.src !== undefined) str(r.src, p + '.src', 2000);
  oneOf(r.t, ['l', 'c', 'a', 'p'], p + '.t');
  if (!isObj(r.g)) fail(p + '.g', 'object'); for (const k of ['a', 'b', 'c', 'm']) opt(r.g, k, pt2, p + '.g'); opt(r.g, 'r', num, p + '.g');
  if (r.pt !== null && r.pt !== undefined) oneOf(r.pt, ['a', 'b', 'm', 'c'], p + '.pt');
  opt(r, 'q', pt2, p);
}
export function validateDrawings(list) {
  arr(list, 'drawings', DRW_LIMITS.drawings);
  const ids = new Set();
  list.forEach((dr, i) => {
    const p = `drawings[${i}]`; if (!isObj(dr)) fail(p, 'object');
    str(dr.id, p + '.id'); if (!dr.id || ids.has(dr.id)) throw new KErr('schema.dup_id', { id: String(dr.id) }); ids.add(dr.id);
    opt(dr, 'name', (v, q) => str(v, q), p);
    const sh = dr.sheet; if (!isObj(sh)) fail(p + '.sheet', 'object');
    oneOf(sh.size, Object.keys(SHEETS), p + '.sheet.size'); opt(sh, 'orient', (v, q) => oneOf(v, ['land', 'port'], q), p + '.sheet'); oneOf(sh.angle, ['first', 'third'], p + '.sheet.angle');
    opt(sh, 'scale', (v, q) => { num(v, q); if (v <= 0 || v > 1000) fail(q, 'number'); }, p + '.sheet'); opt(sh, 'prec', (v, q) => { num(v, q); if (v < 0 || v > 6) fail(q, 'number'); }, p + '.sheet');
    opt(sh, 'dec', (v, q) => oneOf(v, [',', '.'], q), p + '.sheet'); opt(sh, 'th', (v, q) => { num(v, q); if (v < 1 || v > 20) fail(q, 'number'); }, p + '.sheet'); opt(sh, 'page', (v, q) => str(v, q, 20), p + '.sheet');
    if (sh.tb !== undefined) { if (!isObj(sh.tb)) fail(p + '.sheet.tb', 'object'); for (const k of Object.keys(sh.tb)) { if (!TB_FIELDS.includes(k)) fail(p + '.sheet.tb.' + k, TB_FIELDS.join('/')); str(sh.tb[k], p + '.sheet.tb.' + k, 200); } }
    arr(dr.views || [], p + '.views', DRW_LIMITS.views);
    const vids = new Set();
    (dr.views || []).forEach((v, j) => {
      const q = `${p}.views[${j}]`; if (!isObj(v)) fail(q, 'object'); str(v.id, q + '.id'); if (vids.has(v.id)) throw new KErr('schema.dup_id', { id: v.id }); vids.add(v.id);
      oneOf(v.kind, ['base', 'proj', 'sec', 'det'], q + '.kind'); pt2(v.o, q + '.o');
      if (v.kind === 'base') oneOf(v.orient, ORIENT_KEYS, q + '.orient'); else str(v.parent, q + '.parent');
      if (v.kind === 'proj') oneOf(v.side, SIDES, q + '.side');
      if (v.kind === 'sec') { if (!isObj(v.cut)) fail(q + '.cut', 'object'); pt2(v.cut.p, q + '.cut.p'); opt(v.cut, 'ang', num, q + '.cut'); opt(v.cut, 'flip', bool, q + '.cut'); opt(v, 'label', (x, y) => str(x, y, 8), q); }
      if (v.kind === 'det') { pt2(v.c, q + '.c'); num(v.r, q + '.r'); if (!(v.r > 0)) fail(q + '.r', 'number'); opt(v, 'label', (x, y) => str(x, y, 8), q); }
      opt(v, 'scale', (x, y) => { num(x, y); if (x <= 0 || x > 1000) fail(y, 'number'); }, q); opt(v, 'hidden', bool, q); opt(v, 'cmark', bool, q);
    });
    for (const v of dr.views || []) if (v.parent !== undefined && !vids.has(v.parent)) fail(`${p}.views.${v.id}.parent`, 'id');
    arr(dr.dims || [], p + '.dims', DRW_LIMITS.dims);
    (dr.dims || []).forEach((d, j) => {
      const q = `${p}.dims[${j}]`; if (!isObj(d)) fail(q, 'object'); str(d.id, q + '.id'); oneOf(d.type, DIM_TYPES, q + '.type'); str(d.view, q + '.view');
      arr(d.refs, q + '.refs', 2); d.refs.forEach((r, k) => refChk(r, `${q}.refs[${k}]`));
      opt(d, 'dir', (v, y) => oneOf(v, ['h', 'v', 'al'], y), q); opt(d, 'axis', (v, y) => oneOf(v, ['x', 'y'], y), q); for (const k of ['off', 'ang', 'tx', 'last']) opt(d, k, num, q);
      opt(d, 'sup', bool, q); opt(d, 'fai', bool, q); opt(d, 'prefix', (v, y) => str(v, y, 40), q); opt(d, 'suffix', (v, y) => str(v, y, 40), q);
      if (d.tol !== undefined && d.tol !== null) { if (!isObj(d.tol)) fail(q + '.tol', 'object'); oneOf(d.tol.k, ['none', 'sym', 'dev', 'fit'], q + '.tol.k'); opt(d.tol, 'up', num, q + '.tol'); opt(d.tol, 'lo', num, q + '.tol'); opt(d.tol, 'fit', (v, y) => str(v, y, 8), q + '.tol'); opt(d.tol, 'show', bool, q + '.tol'); }
    });
    arr(dr.notes || [], p + '.notes', DRW_LIMITS.notes); (dr.notes || []).forEach((n, j) => { const q = `${p}.notes[${j}]`; if (!isObj(n)) fail(q, 'object'); str(n.id, q + '.id'); pt2(n.p, q + '.p'); str(n.text, q + '.text', DRW_LIMITS.str); opt(n, 'h', num, q); });
    arr(dr.rough || [], p + '.rough', DRW_LIMITS.rough); (dr.rough || []).forEach((r, j) => { const q = `${p}.rough[${j}]`; if (!isObj(r)) fail(q, 'object'); str(r.id, q + '.id'); str(r.view, q + '.view'); pt2(r.p, q + '.p'); opt(r, 'ang', num, q); opt(r, 'proc', (v, y) => oneOf(v, ['any', 'remove', 'noremove'], y), q); opt(r, 'param', (v, y) => oneOf(v, ['Ra', 'Rz'], y), q); if (r.val !== undefined && typeof r.val !== 'number') str(r.val, q + '.val', 20); });
    arr(dr.clines || [], p + '.clines', DRW_LIMITS.clines); (dr.clines || []).forEach((c, j) => { const q = `${p}.clines[${j}]`; if (!isObj(c)) fail(q, 'object'); str(c.id, q + '.id'); str(c.view, q + '.view'); arr(c.refs, q + '.refs', 2); if (c.refs.length !== 2) fail(q + '.refs', 'list'); c.refs.forEach((r, k) => refChk(r, `${q}.refs[${k}]`)); });
    if (dr.holeTable !== undefined && dr.holeTable !== null) { const q = p + '.holeTable'; if (!isObj(dr.holeTable)) fail(q, 'object'); str(dr.holeTable.view, q + '.view'); opt(dr.holeTable, 'p', pt2, q); opt(dr.holeTable, 'origin', pt2, q); }
    opt(dr, 'fai', bool, p);
  });
  return true;
}

let seq = 0;
export const newId = (pre, used) => { for (;;) { const id = pre + (++seq).toString(36) + Math.floor(Math.random() * 1296).toString(36); if (!used || !used.has(id)) return id; } };
// Yeni sayfa: varsayilan birinci aci (ISO E; Turkiye), A3 yatay, sirket adi bos.
export function newDrawing({ name = '', dec = ',', size = 'A3', angle = 'first', bbox = null, used = null } = {}) {
  const [W, H] = sheetSize({ size, orient: 'land' });
  const dr = { id: newId('drw', used), name, sheet: { size, orient: 'land', angle, scale: autoScale(bbox, W, H), prec: 2, dec, th: 3.5, tb: { company: '', title: '', number: '', material: '', rev: '', gentol: '', drawn: '', checked: '', approved: '', date: '' } }, views: [], dims: [], notes: [], rough: [], clines: [], holeTable: null, fai: false };
  return dr;
}
// Standart uc gorunus + izometrik (model kutusuna gore yerlesim)
export function addStdViews(dr, bbox) {
  const [W, H] = sheetSize(dr.sheet); const s = dr.sheet.scale || 1;
  const [lo, hi] = bbox || [[0, 0, 0], [100, 100, 100]]; const ex = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const gap = 20; const x0 = FRAME.l + 15, y0 = FRAME.b + TB.h + 15, x1 = W - FRAME.r - 15, y1 = H - FRAME.t - 15;
  const first = dr.sheet.angle !== 'third';
  // on gorunus kutusu (gorunus koordinati): u = x, v = z
  const fw = ex[0] * s, fh = ex[2] * s, dw = ex[1] * s;
  const fx = x0 + (first ? 0 : dw + gap), fy = first ? y1 - fh : y0;
  const o = (bx, by, u0, v0) => [bx - u0 * s, by - v0 * s];
  const used = new Set(dr.views.map((v) => v.id));
  const vf = { id: newId('v', used), kind: 'base', orient: 'front', o: o(fx, fy, lo[0], lo[2]), hidden: true, cmark: true };
  // ust gorunus (birinci acida asagida): v = y; yan gorunus (birinci acida sagda: soldan gorulen, u = -y)
  const vt = { id: newId('v', used), kind: 'proj', parent: vf.id, side: first ? 'below' : 'above', o: [0, first ? fy - gap - dw - lo[1] * s : fy + fh + gap - lo[1] * s], hidden: true };
  const vs = { id: newId('v', used), kind: 'proj', parent: vf.id, side: 'right', o: [fx + fw + gap + (first ? hi[1] * s : -lo[1] * s), 0], hidden: true };
  const iso = { id: newId('v', used), kind: 'base', orient: 'iso', o: [x1 - (ex[0] + ex[1]) * 0.7 * s - lo[0] * 0.7 * s, y1 - ex[2] * s * 0.9], hidden: false, scale: s };
  dr.views.push(vf, vt, vs, iso);
  return dr;
}
// Hesap: cekirdek cagrisi (call: async (cmd, args) => sonuc) + yerlesim. Donus composeSheet sonucu + proj
export async function computeDrawing(dr, call, T, holes = []) {
  const specs = kernelSpecs(dr);
  const res = specs.length ? await call('drawProject', { views: specs }) : { views: {} };
  const out = composeSheet(dr, res.views || {}, T, { holes });
  out.proj = res.views || {};
  return out;
}
export const drawingsOf = (doc) => (Array.isArray(doc?.drawings) ? doc.drawings : []);
void viewBasis;
