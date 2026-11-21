// .mhnk belge şeması doğrulaması (S-12): tür, alan, uzunluk, iç içelik ve sayısal üst sınırlar.
// Hata durumunda 'schema' önekli yapılandırılmış hata (KErr) fırlatır; arayüz bunu errText ile gösterir. Belgeyi DEĞİŞTİRMEZ.
import { KErr } from './errors.js';
import { evalExpr, resolveParams } from './expr.js';
import { validateDrawings } from '../drawing/model.js'; // WP-17

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

// profiller: 'all' | eski sayısal dizinler | [{ents:[kimlik], hint:[x,y]}] (kararlı seçim)
const profilesChk = (v, p) => {
  if (v === 'all') return;
  if (!Array.isArray(v)) fail('schema.bad_field', { path: p, expect: 'all/list' });
  if (v.length > LIMITS.features) fail('schema.too_many', { what: p, max: LIMITS.features });
  v.forEach((x, i) => { if (typeof x === 'number') num()(x, p + '[' + i + ']'); else obj({ ents: arrOf(str(LIMITS.shortStr), LIMITS.refs), hint: arrOf(num(), 2) })(x, p + '[' + i + ']'); });
};
const OPS = ['new', 'join', 'cut', 'intersect'];
// WP-08 devir (a): ilişkisel izdüşüm bağı (WP-09) ent.proj = {b, g, c, sig, e, fp, pin, lost}; hepsi isteğe bağlı
const sigPt = arrOf(num(), 2);
const projChk = obj({ b: str(LIMITS.shortStr), g: num(), c: arrOf(num(), 3), e: str(LIMITS.shortStr), pin: arrOf(str(LIMITS.shortStr), 64), lost: bool(),
  fp: arrOf((v, p) => { if (v !== null && typeof v !== 'string') num()(v, p); else if (typeof v === 'string') str(40)(v, p); }, 64),
  sig: nullable(obj({ k: oneOf(['l', 'a', 'o', 's']), a: sigPt, b: sigPt, c: sigPt, r: num() })) });
const AX = ['X', 'Y', 'Z'];
const sourceChk = obj({ kind: oneOf(['feature', 'body']), id: str(LIMITS.shortStr), bodies: strArr() });
const sketchChk = {
  seq: num(),
  underlay: nullable(obj({ name: str(200), mime: oneOf(['image/png', 'image/jpeg']), data: str(12 * 1024 * 1024), wPx: num(), hPx: num(), mmPerPx: num(), origin: arrOf(num(), 2), angle: num(), opacity: num(), visible: bool() })), // WP-14: eskiz altligi
  plane: obj({ kind: oneOf(['base', 'face']), name: oneOf(['XY', 'XZ', 'YZ']), offset: expr(), ref: obj() }),
  points: (v, p) => {
    if (!isObj(v)) fail('schema.bad_field', { path: p, expect: 'object' });
    const ks = Object.keys(v); if (ks.length > LIMITS.sketchItems) fail('schema.too_many', { what: p, max: LIMITS.sketchItems });
    for (const k of ks) { str(LIMITS.shortStr)(k, p + '{key}'); obj({ x: num(), y: num(), fixed: bool() })(v[k], p + '.' + k); }
  },
  ents: arrOf(obj({ id: str(LIMITS.shortStr), type: oneOf(['line', 'circle', 'arc', 'point', 'ellipse', 'ellarc', 'spline']), a: str(LIMITS.shortStr), b: str(LIMITS.shortStr), c: str(LIMITS.shortStr), p: str(LIMITS.shortStr), f: str(LIMITS.shortStr), r: expr(), rmin: num(), pts: arrOf(str(LIMITS.shortStr), LIMITS.sketchItems), closed: bool(), cons: bool(), proj: projChk }), LIMITS.sketchItems),
  cons: arrOf(obj({ id: str(LIMITS.shortStr), type: str(40), a: str(LIMITS.shortStr), b: str(LIMITS.shortStr), c: str(LIMITS.shortStr), expr: expr(), ref: bool(), lo: arrOf(num(), 2) }), LIMITS.sketchItems),
  // WP-21: metin kayıtları (isteğe bağlı; eski belgelerde yok): metin olarak yeniden düzenleme için parametreler + çizgi kimlikleri
  texts: arrOf(obj({ id: str(LIMITS.shortStr), text: str(LIMITS.shortStr * 4), height: num(), x: num(), y: num(), angle: num(), ents: arrOf(str(LIMITS.shortStr), LIMITS.sketchItems) }), 1000),
};
// Özellik türü → alan denetleyicileri. Listede olmayan alanlar genel denetimden (derinlik/uzunluk/boyut) geçer.
const TYPES = {
  primitive: { kind: oneOf(['box', 'cylinder', 'sphere']), x: expr(), y: expr(), z: expr(), w: expr(), d: expr(), h: expr(), dia: expr(), axis: oneOf(AX), op: oneOf(OPS), targets: strArr() },
  sketch: sketchChk,
  extrude: { sketch: str(LIMITS.shortStr), profiles: profilesChk, dist: expr(), dist2: expr(), extent: oneOf(['dist', 'all', 'face', 'body']), toFace: obj(), toBody: str(LIMITS.shortStr), taper: expr(), dir: oneOf(['one', 'sym', 'two']), flip: bool(), op: oneOf(OPS), targets: strArr() },
  revolve: { sketch: str(LIMITS.shortStr), profiles: profilesChk, axis: obj({ kind: oneOf(['sketchX', 'sketchY', 'line']), ent: str(LIMITS.shortStr) }), angle: expr(), op: oneOf(OPS), targets: strArr() },
  hole: { sketch: str(LIMITS.shortStr), kind: oneOf(['simple', 'cbore', 'csink']), dia: expr(), depth: expr(), tipAngle: expr(), cboreDia: expr(), cboreDepth: expr(), csinkDia: expr(), csinkAngle: expr(), extent: oneOf(['dist', 'all']), flip: bool(), thread: nullable(obj({ designation: str(40), pitch: num(), major: num(), family: oneOf(['iso', 'iso_fine', 'g', 'npt']), drill: num(), tpi: num(), taper: bool() })), targets: strArr() },
  fillet: { edges: arrOf(obj(), LIMITS.refs), r: expr(), chain: bool() },
  chamfer: { edges: arrOf(obj(), LIMITS.refs), d: expr(), mode: oneOf(['equal', 'two', 'angle']), d2: expr(), angle: expr(), flip: bool(), chain: bool() },
  shell: { faces: arrOf(obj(), LIMITS.refs), t: expr() },
  combine: { target: str(LIMITS.shortStr), tools: strArr(), op: oneOf(['join', 'cut', 'intersect']), keepTools: bool() },
  move: { bodies: strArr(), dx: expr(), dy: expr(), dz: expr(), angle: expr(), axis: oneOf(AX), cx: expr(), cy: expr(), cz: expr(), copy: bool() },
  pattern: { kind: oneOf(['rect', 'circ']), source: sourceChk, count1: expr(), step1: expr(), dir1: oneOf(AX), count2: expr(), step2: expr(), dir2: oneOf(AX), count: expr(), total: expr(), axis: oneOf([...AX, 'edge']), axisRef: obj(), cx: expr(), cy: expr(), cz: expr(), join: bool() },
  mirror: { source: sourceChk, plane: oneOf(['XY', 'XZ', 'YZ', 'face']), planeRef: obj(), offset: expr() },
  split: { body: str(LIMITS.shortStr), tool: obj({ kind: oneOf(['base', 'face']), name: oneOf(['XY', 'XZ', 'YZ']), offset: expr(), ref: obj() }) },
  splitface: { faces: arrOf(obj(), LIMITS.refs), tool: obj({ kind: oneOf(['base', 'face']), name: oneOf(['XY', 'XZ', 'YZ']), offset: expr(), ref: obj() }) },
  faceop: { faces: arrOf(obj(), LIMITS.refs), mode: oneOf(['offset', 'move', 'delete']), dist: expr(), dx: expr(), dy: expr(), dz: expr() },
  import: { format: oneOf(['step', 'stl']), name: str(LIMITS.str), data: str(LIMITS.fileBytes), hash: str(LIMITS.shortStr) },
};
export const KNOWN_TYPES = Object.keys(TYPES);

// ---- doc.cam (isteğe bağlı; yoksa CAM boş). Ayrıntılı anlamsal denetim CAM çekirdeğindedir (src/cam/tools.js, index.js);
// burada tür, sınır ve zararlı yapı denetlenir. Bilinmeyen ek alanlar genel denetimden geçer.
export const CAM_LIMITS = { tools: 5000, setups: 500, ops: 5000, presets: 100, geom: 5000, num: 1e6 };
const camNum = (lo = -CAM_LIMITS.num, hi = CAM_LIMITS.num) => (v, p) => { num()(v, p); if (v < lo || v > hi) fail('schema.bad_field', { path: p, expect: 'number' }); };
const posInt = (max = 99999) => (v, p) => { if (!Number.isInteger(v) || v < 1 || v > max) fail('schema.bad_field', { path: p, expect: 'number' }); };
const idStr = str(LIMITS.shortStr);
const COOL = ['flood', 'mist', 'air', 'through', 'off'];
const camTool = obj({
  id: idStr, number: posInt(), lengthOffset: posInt(), diaOffset: nullable(posInt()),
  type: oneOf(['flat', 'ball', 'bullnose', 'drill', 'spot', 'tap', 'chamfer', 'face', 'reamer', 'bore', 'threadmill']),
  dia: camNum(0, 2000), cornerR: camNum(0, 1000), tipAngle: camNum(0, 180), fluteLen: camNum(0), bodyLen: camNum(0), shaftDia: camNum(0, 2000), tipDia: camNum(0, 2000),
  flutes: posInt(100), centerCutting: bool(), pitch: camNum(0, 100), holder: nullable(obj({ dia: camNum(0), len: camNum(0), segments: arrOf(obj({ len: camNum(0), d0: camNum(0, 2000), d1: camNum(0, 2000) }), 20) })), // WP-13: tutucu profili
  material: str(LIMITS.shortStr), note: str(), name: str(LIMITS.shortStr),
  presets: arrOf(obj({ name: str(LIMITS.shortStr), rpm: camNum(0), feedCut: camNum(0), feedPlunge: camNum(0), feedRamp: camNum(0), stepdown: camNum(0), stepover: camNum(0), coolant: oneOf(COOL) }), CAM_LIMITS.presets),
});
const axisSpec = obj({ kind: oneOf(['base', 'face', 'edge']), dir: oneOf(['+X', '-X', '+Y', '-Y', '+Z', '-Z']), ref: obj(), flip: bool(), auto: bool() });
const heightRef = obj({ from: oneOf(['stockTop', 'stockBottom', 'modelTop', 'modelBottom', 'selection', 'abs']), off: camNum() });
const camOp = obj({
  id: idStr, type: oneOf(['face', 'contour', 'pocket', 'drill', 'chamfer', 'circular', 'threadmill', 'slot', 'trace']), name: str(LIMITS.shortStr), toolId: idStr, preset: str(LIMITS.shortStr),
  rpm: camNum(0), feedCut: camNum(0), feedPlunge: camNum(0), feedRamp: camNum(0), coolant: oneOf(COOL), suppressed: bool(),
  heights: obj({ clearance: camNum(), retract: camNum(), top: heightRef, bottom: heightRef }),
  geom: arrOf(obj({ kind: oneOf(['face', 'sketch', 'silhouette', 'chain']), ref: obj(), loops: oneOf(['outer', 'inner', 'all']), sketch: idStr, profiles: profilesChk, body: idStr, ents: strArr(), reverse: bool() }), CAM_LIMITS.geom),
  stepover: camNum(0), stepdown: camNum(0), finishStepdown: camNum(0), finishStock: camNum(0), direction: camNum(), extend: camNum(0),
  side: oneOf(['outside', 'inside', 'on', 'left', 'right']), extendStart: camNum(0), extendEnd: camNum(0), width: camNum(0), tipClearance: camNum(0), dir: oneOf(['climb', 'conv']), comp: oneOf(['computer', 'wear']), finishPass: bool(),
  cycle: oneOf(['drill', 'spot', 'peck', 'chipbreak', 'tap', 'ream', 'bore', 'fineBore', 'backBore']), order: oneOf(['asis', 'shortest']), peck: camNum(0), dwell: camNum(0),
  shift: camNum(0), shiftDir: camNum(-360, 360), backDepth: camNum(0), startBelow: camNum(0), // WP-14: G76/G87
  aAngle: camNum(-36000, 36000),
  sharp: bool(),
  holes: obj({ kind: oneOf(['feature', 'points']), filter: obj({ dia: camNum(0), feature: idStr, features: strArr() }), sketch: idStr, ents: strArr(), rec: strArr(), acceptThread: strArr() }),
  depth: obj({ from: oneOf(['hole', 'abs', 'top']), tipComp: bool(), breakThrough: camNum(0), z: camNum(), d: camNum(0) }),
  entry: obj({ kind: oneOf(['helix', 'ramp', 'plunge', 'predrill']), angle: camNum(0, 90), helixDia: camNum(0), points: arrOf(arrOf(camNum(), 2), 500) }),
  leadIn: obj({ kind: oneOf(['arc', 'line', 'none']), r: camNum(0), len: camNum(0) }), leadOut: obj({ kind: oneOf(['arc', 'line', 'none']), r: camNum(0), len: camNum(0) }),
  tabs: obj({ n: posInt(100), width: camNum(0), height: camNum(0) }), ramp: obj({ kind: oneOf(['plunge', 'ramp', 'helix']), angle: camNum(0, 90), helixDia: camNum(0) }),
  roughPasses: obj({ n: posInt(100), stepover: camNum(0) }),
  stockToLeave: either(camNum(0), obj({ radial: camNum(0), axial: camNum(0) }), 'number/{radial,axial}'),
  // WP-07: dairesel frezeleme (circular) ve dis frezeleme (threadmill)
  dia: camNum(0), diaAdjust: camNum(), predrillDia: camNum(0), external: bool(), hand: oneOf(['right', 'left']), designation: str(40), major: camNum(0), pitch: camNum(0, 100),
  radialPasses: posInt(20), springPasses: camNum(0, 5), radialAdjust: camNum(-0.2, 0.2), feedAtEdge: bool(), length: camNum(0),
});
const camSetup = obj({
  id: idStr, name: str(LIMITS.shortStr), bodies: strArr(),
  frame: obj({ origin: obj({ kind: oneOf(['model', 'stockCorner', 'stockTopCenter', 'point']), corner: str(16), p: arrOf(camNum(), 3) }), zAxis: axisSpec, xAxis: axisSpec }),
  rotary: obj({ enabled: bool(), aAngle: camNum(-36000, 36000) }),
  tilt: obj({ enabled: bool(), kind: oneOf(['face', 'vector', 'angles']), ref: obj(), flip: bool(), v: arrOf(camNum(), 3), angles: obj({ A: camNum(-36000, 36000), B: camNum(-36000, 36000), C: camNum(-36000, 36000) }) }), machinePos: arrOf(camNum(), 3), // WP-18: 3+2 egim, is sifirinin makine konumu
  workOffset: obj({ kind: oneOf(['G54', 'G55', 'G56', 'G57', 'G58', 'G59', 'G54.1']), p: posInt(9999) }),
  stock: obj({ kind: oneOf(['boxOffset', 'box', 'cyl']), side: camNum(0), top: camNum(0), bottom: camNum(0), min: arrOf(camNum(), 3), max: arrOf(camNum(), 3), dia: camNum(0), len: camNum(0), axis: oneOf(['X']) }),
  clearanceZ: camNum(0), stockFrom: oneOf(['previous', 'blank']), freePieceBlock: bool(), ops: arrOf(camOp, CAM_LIMITS.ops),
  // WP-13: baglama govdeleri (kutu, silindir, islenmeyen belge govdesi); anlamsal denetim src/cam/sim/fixtures.js
  fixtures: arrOf(obj({ id: idStr, name: str(LIMITS.shortStr), kind: oneOf(['box', 'cyl', 'body']), min: arrOf(camNum(), 3), max: arrOf(camNum(), 3), axis: oneOf(['X', 'Y', 'Z']), center: arrOf(camNum(), 3), dia: camNum(0), len: camNum(0), body: idStr }), 50),
});
const CP = 'cam'; // belge yolu oneki (sozluk anahtari degil)
export function validateCam(cam) {
  if (!isObj(cam)) fail('schema.bad_field', { path: 'cam', expect: 'object' });
  if (cam.machineId !== undefined && cam.machineId !== null) str(LIMITS.shortStr)(cam.machineId, CP + '.machineId');
  if (cam.tools !== undefined) arrOf(camTool, CAM_LIMITS.tools)(cam.tools, CP + '.tools');
  if (cam.setups !== undefined) arrOf(camSetup, CAM_LIMITS.setups)(cam.setups, CP + '.setups');
  // WP-07: belgeye ozel kesme verisi satirlari ve varsayilan malzeme
  if (cam.cutLib !== undefined) arrOf(obj({ id: idStr, material: str(60), type: oneOf(['endmill', 'drill', 'tap', 'chamfer', 'other']), diaMin: camNum(0), diaMax: camNum(0), vc: camNum(0), fz: camNum(0), note: str(200) }), 500)(cam.cutLib, CP + '.cutLib');
  if (cam.material !== undefined) str(60)(cam.material, CP + '.material');
  if (cam.units !== undefined) oneOf(['mm', 'inch'])(cam.units, CP + '.units'); // WP-14: belge birimi
  if (cam.quote !== undefined && cam.quote !== null) obj({ no: str(80), customer: str(200), currency: str(8), qty: posInt(1000000), partsPerRun: posInt(48), validDays: posInt(3650), notes: str(2000), marginPct: camNum(0, 1000), vatPct: camNum(0, 1000), material: obj({ density: camNum(0, 100), pricePerKg: camNum(0, 1e9) }), rates: obj({ machinePerHour: camNum(0, 1e9), setup: camNum(0, 1e9), toolChangeSec: camNum(0, 3600) }), extras: arrOf(obj({ name: str(200), amount: camNum(0, 1e9), per: oneOf(['order', 'piece']) }), 30) })(cam.quote, CP + '.quote'); // WP-14: teklif girdileri (kullanici verisi)
  if (cam.parts !== undefined && cam.parts !== null) obj({ count: posInt(48), order: oneOf(['byOp', 'byPart']) })(cam.parts, CP + '.parts'); // WP-14: mengenede coklu parca
  if (cam.verified !== undefined && cam.verified !== null) obj({ by: str(LIMITS.shortStr), date: str(40), note: str(), hash: str(LIMITS.shortStr) })(cam.verified, CP + '.verified');
  const ids = new Set();
  for (const [i, t] of (cam.tools || []).entries()) { if (!t.id) fail('schema.bad_field', { path: `${CP}.tools[${i}].id`, expect: 'text' }); if (ids.has(t.id)) fail('schema.dup_id', { id: t.id }); ids.add(t.id); }
  const oids = new Set();
  for (const s of cam.setups || []) for (const o of s.ops || []) { if (!o.id) fail('schema.bad_field', { path: CP + '.setups.ops.id', expect: 'text' }); if (oids.has(o.id)) fail('schema.dup_id', { id: o.id }); oids.add(o.id); }
  return true;
}

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

// Dosya içindeki `app` alanı: belgeler 'Mihenk' yazar ve yalnız onu kabul eder.
export const APP_NAME = 'Mihenk';
export const APP_NAMES = ['Mihenk'];

// Dosya zarfı: {app, version, doc}. Daha yeni sürümü `newer: true` ile bildirir (reddetmez; çağıran uyarır).
export function checkEnvelope(j) {
  if (!isObj(j) || !APP_NAMES.includes(j.app)) fail('schema.not_doc');
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
  if (doc.cam !== undefined && doc.cam !== null) validateCam(doc.cam);
  // WP-08 devir (a): WP-02 grupları [{id, name, first, last}] (ardışık aralık; aralık geçerliliğini arayüz denetler)
  if (doc.groups !== undefined) {
    arrOf(obj({ id: str(LIMITS.shortStr), name: str(LIMITS.shortStr), first: str(LIMITS.shortStr), last: str(LIMITS.shortStr) }), LIMITS.features)(doc.groups, 'groups');
    doc.groups.forEach((g, i) => { for (const k of ['id', 'first', 'last']) if (typeof g[k] !== 'string' || !g[k]) fail('schema.bad_field', { path: `groups[${i}].${k}`, expect: 'text' }); });
  }
  // WP-08 devir (c): belgeyle saklanan adlandırılmış görünüşler (en çok 12 yuva; kodlu metin, boş = boş yuva)
  if (doc.views !== undefined) arrOf(str(200), 12)(doc.views, 'views');
  // WP-17: teknik resim sayfalari (isteğe bagli; eski belgelerde yok)
  if (doc.drawings !== undefined && doc.drawings !== null) validateDrawings(doc.drawings);
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
