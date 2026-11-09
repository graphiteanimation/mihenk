// .acad belge şeması doğrulaması (S-12): tür, alan, uzunluk, iç içelik ve sayısal üst sınırlar.
// Hata durumunda 'schema' önekli yapılandırılmış hata (KErr) fırlatır; arayüz bunu errText ile gösterir. Belgeyi DEĞİŞTİRMEZ.
import { KErr } from './errors.js';
import { evalExpr, resolveParams } from './expr.js';

export const FILE_VERSION = 1;
export const LIMITS = {
  fileBytes: 200 * 1024 * 1024, // dosya boyutu
  features: 5000, params: 2000, patternCount: 2000, depth: 64, str: 10000, shortStr: 200,
  sketchItems: 50000, refs: 5000, bodyNames: 5000, nodes: 5_000_000,
};

const fail = (code, params) => { throw new KErr(code, params || {}); };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---- tür denetleyicileri: (değer, yol) → hata fırlatır
const str = (max = LIMITS.str) => (v, p) => { if (typeof v !== 'string') fail('schema.bad_field', { path: p, expect: 'text' }); if (v.length > max) fail('schema.too_long', { path: p, max }); };
const num = () => (v, p) => { if (typeof v !== 'number' || !Number.isFinite(v)) fail('schema.bad_field', { path: p, expect: 'number' }); };
const expr = () => (v, p) => { if (typeof v === 'number') { if (!Number.isFinite(v)) fail('schema.bad_field', { path: p, expect: 'number' }); return; } str(LIMITS.shortStr * 5)(v, p); };
const bool = () => (v, p) => { if (typeof v !== 'boolean') fail('schema.bad_field', { path: p, expect: 'boolean' }); };
const oneOf = (list) => (v, p) => { if (!list.includes(v)) fail('schema.bad_field', { path: p, expect: list.join('/') }); };
const arrOf = (item, max) => (v, p) => { if (!Array.isArray(v)) fail('schema.bad_field', { path: p, expect: 'list' }); if (v.length > max) fail('schema.too_many', { what: p, max }); v.forEach((x, i) => item(x, p + '[' + i + ']')); };
const strArr = () => arrOf(str(LIMITS.shortStr), LIMITS.features);
const obj = (shape = {}) => (v, p) => {
  if (!isObj(v)) fail('schema.bad_field', { path: p, expect: 'object' });
  for (const [k, chk] of Object.entries(shape)) if (v[k] !== undefined) chk(v[k], p + '.' + k);
};
const nullable = (c) => (v, p) => { if (v !== null) c(v, p); };
const either = (a, b, label) => (v, p) => { try { a(v, p); } catch (e) { try { b(v, p); } catch (e2) { fail('schema.bad_field', { path: p, expect: label }); } } };

const OPS = ['new', 'join', 'cut', 'intersect'];
const AX = ['X', 'Y', 'Z'];
const sourceChk = obj({ kind: oneOf(['feature', 'body']), id: str(LIMITS.shortStr), bodies: strArr() });
const sketchChk = {
  plane: obj({ kind: oneOf(['base', 'face']), name: oneOf(['XY', 'XZ', 'YZ']), offset: expr(), ref: obj() }),
  points: (v, p) => {
    if (!isObj(v)) fail('schema.bad_field', { path: p, expect: 'object' });
    const ks = Object.keys(v); if (ks.length > LIMITS.sketchItems) fail('schema.too_many', { what: p, max: LIMITS.sketchItems });
    for (const k of ks) { str(LIMITS.shortStr)(k, p + '{key}'); obj({ x: num(), y: num(), fixed: bool() })(v[k], p + '.' + k); }
  },
  ents: arrOf(obj({ id: str(LIMITS.shortStr), type: oneOf(['line', 'circle', 'arc', 'point']), a: str(LIMITS.shortStr), b: str(LIMITS.shortStr), c: str(LIMITS.shortStr), p: str(LIMITS.shortStr), r: expr(), cons: bool() }), LIMITS.sketchItems),
  cons: arrOf(obj({ id: str(LIMITS.shortStr), type: str(40), a: str(LIMITS.shortStr), b: str(LIMITS.shortStr), c: str(LIMITS.shortStr), expr: expr() }), LIMITS.sketchItems),
};
// Özellik türü → alan denetleyicileri. Listede olmayan alanlar genel denetimden (derinlik/uzunluk/boyut) geçer.
const TYPES = {
  primitive: { kind: oneOf(['box', 'cylinder', 'sphere']), x: expr(), y: expr(), z: expr(), w: expr(), d: expr(), h: expr(), dia: expr(), axis: oneOf(AX), op: oneOf(OPS), targets: strArr() },
  sketch: sketchChk,
  extrude: { sketch: str(LIMITS.shortStr), profiles: either(oneOf(['all']), arrOf(num(), LIMITS.features), 'all/list'), dist: expr(), dist2: expr(), extent: oneOf(['dist', 'all']), dir: oneOf(['one', 'sym', 'two']), flip: bool(), op: oneOf(OPS), targets: strArr() },
  revolve: { sketch: str(LIMITS.shortStr), profiles: either(oneOf(['all']), arrOf(num(), LIMITS.features), 'all/list'), axis: obj({ kind: oneOf(['sketchX', 'sketchY', 'line']), ent: str(LIMITS.shortStr) }), angle: expr(), op: oneOf(OPS), targets: strArr() },
  hole: { sketch: str(LIMITS.shortStr), kind: oneOf(['simple', 'cbore', 'csink']), dia: expr(), depth: expr(), tipAngle: expr(), cboreDia: expr(), cboreDepth: expr(), csinkDia: expr(), csinkAngle: expr(), extent: oneOf(['dist', 'all']), flip: bool(), thread: nullable(obj({ designation: str(40), pitch: num(), major: num() })), targets: strArr() },
  fillet: { edges: arrOf(obj(), LIMITS.refs), r: expr() },
  chamfer: { edges: arrOf(obj(), LIMITS.refs), d: expr() },
  shell: { faces: arrOf(obj(), LIMITS.refs), t: expr() },
  combine: { target: str(LIMITS.shortStr), tools: strArr(), op: oneOf(['join', 'cut', 'intersect']), keepTools: bool() },
  move: { bodies: strArr(), dx: expr(), dy: expr(), dz: expr(), angle: expr(), axis: oneOf(AX), cx: expr(), cy: expr(), cz: expr(), copy: bool() },
  pattern: { kind: oneOf(['rect', 'circ']), source: sourceChk, count1: expr(), step1: expr(), dir1: oneOf(AX), count2: expr(), step2: expr(), dir2: oneOf(AX), count: expr(), total: expr(), axis: oneOf(AX), cx: expr(), cy: expr(), cz: expr(), join: bool() },
  mirror: { source: sourceChk, plane: oneOf(['XY', 'XZ', 'YZ']), offset: expr() },
  import: { format: oneOf(['step', 'stl']), name: str(LIMITS.str), data: str(LIMITS.fileBytes), hash: str(LIMITS.shortStr) },
};
export const KNOWN_TYPES = Object.keys(TYPES);

// Genel gezinti: iç içelik, düğüm sayısı, dizge uzunluğu, tehlikeli anahtar (__proto__). Özyinelemesiz (4000 katman bile yığını taşırmaz).
function walk(root) {
  const stack = [[root, 1, '']]; let nodes = 0;
  while (stack.length) {
    const [v, d, key] = stack.pop();
    if (++nodes > LIMITS.nodes) fail('schema.too_many', { what: 'nodes', max: LIMITS.nodes });
    if (d > LIMITS.depth) fail('schema.too_deep', { max: LIMITS.depth });
    if (typeof v === 'string') { if (v.length > (key === 'data' ? LIMITS.fileBytes : LIMITS.str)) fail('schema.too_long', { path: key || 'text', max: key === 'data' ? LIMITS.fileBytes : LIMITS.str }); }
    else if (Array.isArray(v)) { for (const x of v) stack.push([x, d + 1, key]); }
    else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) { if (k === '__proto__') fail('schema.bad_key', { key: k }); if (k.length > LIMITS.shortStr) fail('schema.too_long', { path: 'key', max: LIMITS.shortStr }); stack.push([v[k], d + 1, k]); }
    } else if (typeof v === 'number' && !Number.isFinite(v)) fail('schema.bad_field', { path: key, expect: 'number' });
  }
}

// Dosya zarfı: {app, version, doc}. Daha yeni sürümü `newer: true` ile bildirir (reddetmez; çağıran uyarır).
export function checkEnvelope(j) {
  if (!isObj(j) || j.app !== 'AtolyeCAD') fail('schema.not_doc');
  if (!isObj(j.doc)) fail('schema.not_doc');
  const v = j.version === undefined ? 1 : j.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) fail('schema.bad_field', { path: 'version', expect: 'number' });
  return { version: v, newer: v > FILE_VERSION };
}

// Belge gövdesi. Hatada KErr fırlatır; başarıda true.
export function validateDoc(doc, { byteLength } = {}) {
  if (byteLength != null && byteLength > LIMITS.fileBytes) fail('schema.file_too_big', { mb: Math.round(LIMITS.fileBytes / 1048576) });
  if (!isObj(doc)) fail('schema.bad_field', { path: 'doc', expect: 'object' });
  walk(doc);
  if (doc.params !== undefined) arrOf(obj({ name: str(64), expr: expr(), note: str() }), LIMITS.params)(doc.params, 'params');
  if (doc.rollback !== undefined && doc.rollback !== null && (!Number.isInteger(doc.rollback) || doc.rollback < 0)) fail('schema.bad_field', { path: 'rollback', expect: 'number' });
  if (doc.bodyNames !== undefined) {
    if (!isObj(doc.bodyNames)) fail('schema.bad_field', { path: 'bodyNames', expect: 'object' });
    const ks = Object.keys(doc.bodyNames); if (ks.length > LIMITS.bodyNames) fail('schema.too_many', { what: 'bodyNames', max: LIMITS.bodyNames });
    for (const k of ks) str(LIMITS.shortStr)(doc.bodyNames[k], 'bodyNames.' + k);
  }
  const feats = doc.features === undefined ? [] : doc.features;
  if (!Array.isArray(feats)) fail('schema.bad_field', { path: 'features', expect: 'list' });
  if (feats.length > LIMITS.features) fail('schema.too_many_features', { max: LIMITS.features });
  const ids = new Set();
  feats.forEach((f, i) => {
    const p = 'features[' + i + ']';
    if (!isObj(f)) fail('schema.bad_field', { path: p, expect: 'object' });
    str(LIMITS.shortStr)(f.id, p + '.id'); if (!f.id) fail('schema.bad_field', { path: p + '.id', expect: 'text' });
    str(40)(f.type, p + '.type');
    if (!Object.hasOwn(TYPES, f.type)) fail('schema.unknown_type', { type: f.type, id: f.id });
    if (ids.has(f.id)) fail('schema.dup_id', { id: f.id }); ids.add(f.id);
    if (f.name !== undefined) str(LIMITS.str)(f.name, p + '.name');
    if (f.bodyName !== undefined) str(LIMITS.str)(f.bodyName, p + '.bodyName');
    if (f.suppressed !== undefined) bool()(f.suppressed, p + '.suppressed');
    for (const [k, chk] of Object.entries(TYPES[f.type])) if (f[k] !== undefined) chk(f[k], p + '.' + k);
  });
  // desen adedi üst sınırı (ifade çözülebiliyorsa; çözülemeyen ifadeyi çekirdek özellik hatası olarak bildirir)
  let vars = null; try { vars = resolveParams(doc.params || []).vars; } catch (e) { vars = null; }
  if (vars) {
    const val = (x) => { try { return Number(evalExpr(x, vars)); } catch (e) { return NaN; } };
    for (const f of feats) {
      if (f.type !== 'pattern' || f.suppressed) continue;
      const n = f.kind === 'circ' ? val(f.count) : val(f.count1) * (f.count2 === undefined || f.count2 === '' ? 1 : val(f.count2));
      if (n > LIMITS.patternCount) fail('schema.pattern_too_big', { max: LIMITS.patternCount, id: f.id });
    }
  }
  return true;
}
