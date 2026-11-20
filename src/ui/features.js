// Özellik şemaları: varsayılanlar, alan tanımları, adlandırma, bağımlılık taraması.
// Etiketler sözlük anahtarıdır (tk); panel t() ile çevirir. Varsayılan adlar oluşturulduğu andaki dilde yazılır.
import { t, tk } from '../shared/i18n.js';
import { evalExpr } from '../shared/expr.js';

export const TYPE_KEY = {
  sketch: tk('feat.sketch'), extrude: tk('feat.extrude'), revolve: tk('feat.revolve'), hole: tk('feat.hole'), fillet: tk('feat.fillet'), chamfer: tk('feat.chamfer'), shell: tk('feat.shell'),
  combine: tk('feat.combine'), move: tk('feat.move'), pattern: tk('feat.pattern'), mirror: tk('feat.mirror'), import: tk('feat.import'),
};
export const KIND_KEY = { box: tk('feat.box'), cylinder: tk('feat.cylinder'), sphere: tk('feat.sphere') };
const ID_PREFIX = { sketch: 'sk', extrude: 'ext', revolve: 'rev', hole: 'hole', fillet: 'fil', chamfer: 'cham', shell: 'shell', combine: 'comb', move: 'mov', pattern: 'pat', mirror: 'mir', import: 'imp', box: 'box', cylinder: 'cyl', sphere: 'sph' };

export const featLabel = (f) => (f.type === 'primitive' ? t(KIND_KEY[f.kind] || KIND_KEY.box) : TYPE_KEY[f.type] ? t(TYPE_KEY[f.type]) : f.type);

export function newId(doc, type, kind) {
  const pre = ID_PREFIX[type === 'primitive' ? kind : type] || 'f';
  const used = new Set(doc.features.map((f) => f.id));
  let i = 1; while (used.has(pre + i)) i++;
  return pre + i;
}
export function autoName(doc, type, kind) {
  const base = featLabel({ type, kind });
  const n = doc.features.filter((f) => f.type === type && (type !== 'primitive' || f.kind === kind)).length + 1;
  return base + ' ' + n;
}

// Seçenek etiketleri sözlük anahtarıdır (panel t() ile çevirir); null = olduğu gibi göster.
export const OPS = [['new', tk('op.new')], ['join', tk('op.join')], ['cut', tk('op.cut')], ['intersect', tk('op.intersect')]];
export const AXES = [['X', null], ['Y', null], ['Z', null]];
// Kaba diş tablosu (ad, adım, nominal çap)
export const THREADS = [['M3', 0.5, 3], ['M4', 0.7, 4], ['M5', 0.8, 5], ['M6', 1, 6], ['M8', 1.25, 8], ['M10', 1.5, 10], ['M12', 1.75, 12], ['M14', 2, 14], ['M16', 2, 16], ['M20', 2.5, 20], ['M24', 3, 24]]
  .map(([designation, pitch, major]) => ({ designation, pitch, major }));

// Yeni özellik: varsayılan alanlar. ctx = {doc, bodies:[], sketches:[feature], sketchOnFace?:bool, lastFree?:id}
export function defaults(type, kind, ctx) {
  const hasBody = ctx.bodies.length > 0;
  const freeSketch = () => { const used = new Set(ctx.doc.features.filter((f) => f.sketch).map((f) => f.sketch)); const free = ctx.sketches.filter((s) => !used.has(s.id)); return (free.length ? free : ctx.sketches).slice(-1)[0]?.id || ''; };
  const sketchOp = (sid) => { const s = ctx.sketches.find((x) => x.id === sid); const onFace = s?.plane?.kind === 'face'; return hasBody ? (onFace ? { op: 'cut', flip: true } : { op: 'join', flip: false }) : { op: 'new', flip: false }; };
  switch (type) {
    case 'primitive': {
      const base = { kind, x: '0', y: '0', z: '0', op: 'new' };
      if (kind === 'box') return { ...base, w: '50', d: '40', h: '30' };
      if (kind === 'cylinder') return { ...base, dia: '20', h: '40', axis: 'Z' };
      return { ...base, dia: '30' };
    }
    case 'extrude': { const sketch = freeSketch(); return { sketch, profiles: 'all', dist: '10', extent: 'dist', dir: 'one', dist2: '10', ...sketchOp(sketch) }; }
    case 'revolve': { const sketch = freeSketch(); const o = sketchOp(sketch); return { sketch, profiles: 'all', axis: { kind: 'sketchX' }, angle: '360', op: o.op }; }
    case 'hole': { const used = new Set(); const withPts = ctx.sketches.filter((s) => (s.ents || []).some((e) => e.type === 'point' || (e.type === 'circle' && !e.cons))); const sketch = (withPts.slice(-1)[0] || ctx.sketches.slice(-1)[0])?.id || ''; return { sketch, kind: 'simple', dia: '6', extent: 'dist', depth: '10', tipAngle: '118', cboreDia: '12', cboreDepth: '4', csinkDia: '12', csinkAngle: '90', flip: false, thread: null }; }
    case 'fillet': return { edges: [], r: '2' };
    case 'chamfer': return { edges: [], d: '1' };
    case 'shell': return { faces: [], t: '2' };
    case 'combine': return { target: '', tools: [], op: 'join', keepTools: false };
    case 'move': return { bodies: [], dx: '0', dy: '0', dz: '0', angle: '0', axis: 'Z', cx: '0', cy: '0', cz: '0', copy: false };
    case 'pattern': {
      const src = patternSources(ctx.doc).slice(-1)[0];
      return { kind: 'rect', source: src ? { kind: 'feature', id: src.id } : { kind: 'body', bodies: [] }, count1: '3', step1: '20', dir1: 'X', count2: '1', step2: '20', dir2: 'Y', count: '4', total: '360', axis: 'Z', cx: '0', cy: '0', cz: '0', join: false };
    }
    case 'mirror': { const src = patternSources(ctx.doc).slice(-1)[0]; return { source: src ? { kind: 'feature', id: src.id } : { kind: 'body', bodies: [] }, plane: 'YZ', offset: '0' }; }
  }
  return {};
}

export const patternSources = (doc) => doc.features.filter((f) => ['extrude', 'revolve', 'hole', 'primitive'].includes(f.type) && !f.suppressed);

// Alan tanımları (panel formu bunlardan üretilir). t: expr | select | check | sketch | profiles | axis | sel | source | thread | note
export function fieldsFor(f, ctx) {
  const F = [];
  const opField = (label = tk('fld.op')) => ({ t: 'select', k: 'op', label, opts: OPS });
  switch (f.type) {
    case 'primitive':
      F.push({ t: 'expr', k: 'x', label: tk('fld.pos_x'), unit: 'mm' }, { t: 'expr', k: 'y', label: tk('fld.pos_y'), unit: 'mm' }, { t: 'expr', k: 'z', label: tk('fld.pos_z'), unit: 'mm' });
      if (f.kind === 'box') F.push({ t: 'expr', k: 'w', label: tk('fld.width'), unit: 'mm' }, { t: 'expr', k: 'd', label: tk('fld.depth_y'), unit: 'mm' }, { t: 'expr', k: 'h', label: tk('fld.height_z'), unit: 'mm' });
      else if (f.kind === 'cylinder') F.push({ t: 'expr', k: 'dia', label: tk('fld.dia'), unit: 'mm' }, { t: 'expr', k: 'h', label: tk('fld.height'), unit: 'mm' }, { t: 'select', k: 'axis', label: tk('fld.axis'), opts: AXES });
      else F.push({ t: 'expr', k: 'dia', label: tk('fld.dia'), unit: 'mm' });
      F.push(opField());
      break;
    case 'extrude':
      F.push({ t: 'sketch', k: 'sketch', label: tk('fld.sketch') }, { t: 'profiles', k: 'profiles', label: tk('fld.profiles') }, opField(),
        { t: 'select', k: 'dir', label: tk('fld.dir'), opts: [['one', tk('dir.one')], ['sym', tk('dir.sym')], ['two', tk('dir.two')]] },
        { t: 'select', k: 'extent', label: tk('fld.extent'), opts: [['dist', tk('extent.dist')], ['all', tk('extent.all')]] });
      if (f.extent !== 'all') F.push({ t: 'expr', k: 'dist', label: tk(f.dir === 'two' ? 'fld.dist1' : 'fld.dist'), unit: 'mm' });
      if (f.dir === 'two' && f.extent !== 'all') F.push({ t: 'expr', k: 'dist2', label: tk('fld.dist2'), unit: 'mm' });
      F.push({ t: 'check', k: 'flip', label: tk('fld.flip') });
      break;
    case 'revolve':
      F.push({ t: 'sketch', k: 'sketch', label: tk('fld.sketch') }, { t: 'profiles', k: 'profiles', label: tk('fld.profiles') }, { t: 'axis', k: 'axis', label: tk('fld.axis') }, { t: 'expr', k: 'angle', label: tk('fld.angle'), unit: '°' }, opField());
      break;
    case 'hole':
      F.push({ t: 'sketch', k: 'sketch', label: tk('fld.sketch'), need: 'points' },
        { t: 'select', k: 'kind', label: tk('fld.hole_type'), opts: [['simple', tk('hole.simple')], ['cbore', tk('hole.cbore')], ['csink', tk('hole.csink')]] },
        { t: 'thread', k: 'thread', label: tk('fld.thread') }, { t: 'expr', k: 'dia', label: tk('fld.dia'), unit: 'mm' },
        { t: 'select', k: 'extent', label: tk('fld.extent'), opts: [['dist', tk('extent.depth')], ['all', tk('extent.through')]] });
      if (f.extent !== 'all') F.push({ t: 'expr', k: 'depth', label: tk('fld.depth'), unit: 'mm' }, { t: 'expr', k: 'tipAngle', label: tk('fld.tip_angle'), unit: '°' });
      if (f.kind === 'cbore') F.push({ t: 'expr', k: 'cboreDia', label: tk('fld.cbore_dia'), unit: 'mm' }, { t: 'expr', k: 'cboreDepth', label: tk('fld.cbore_depth'), unit: 'mm' });
      if (f.kind === 'csink') F.push({ t: 'expr', k: 'csinkDia', label: tk('fld.csink_dia'), unit: 'mm' }, { t: 'expr', k: 'csinkAngle', label: tk('fld.csink_angle'), unit: '°' });
      F.push({ t: 'check', k: 'flip', label: tk('fld.flip') });
      break;
    case 'fillet': F.push({ t: 'sel', k: 'edges', label: tk('fld.edges'), kind: 'edge' }, { t: 'expr', k: 'r', label: tk('fld.radius'), unit: 'mm' }); break;
    case 'chamfer': F.push({ t: 'sel', k: 'edges', label: tk('fld.edges'), kind: 'edge' }, { t: 'expr', k: 'd', label: tk('fld.dist'), unit: 'mm' }); break;
    case 'shell': F.push({ t: 'sel', k: 'faces', label: tk('fld.faces_open'), kind: 'face' }, { t: 'expr', k: 't', label: tk('fld.thickness'), unit: 'mm' }); break;
    case 'combine':
      F.push({ t: 'sel', k: 'target', label: tk('fld.target'), kind: 'body', single: true }, { t: 'sel', k: 'tools', label: tk('fld.tools'), kind: 'body' },
        { t: 'select', k: 'op', label: tk('fld.op'), opts: [['join', tk('op.combine_join')], ['cut', tk('op.cut')], ['intersect', tk('op.intersect')]] }, { t: 'check', k: 'keepTools', label: tk('fld.keep_tools') });
      break;
    case 'move':
      F.push({ t: 'sel', k: 'bodies', label: tk('fld.bodies'), kind: 'body' }, { t: 'expr', k: 'dx', label: tk('fld.tr_x'), unit: 'mm' }, { t: 'expr', k: 'dy', label: tk('fld.tr_y'), unit: 'mm' }, { t: 'expr', k: 'dz', label: tk('fld.tr_z'), unit: 'mm' },
        { t: 'expr', k: 'angle', label: tk('fld.rotation'), unit: '°' }, { t: 'select', k: 'axis', label: tk('fld.rot_axis'), opts: AXES },
        { t: 'expr', k: 'cx', label: tk('fld.c_x'), unit: 'mm' }, { t: 'expr', k: 'cy', label: tk('fld.c_y'), unit: 'mm' }, { t: 'expr', k: 'cz', label: tk('fld.c_z'), unit: 'mm' }, { t: 'check', k: 'copy', label: tk('fld.copy') });
      break;
    case 'pattern':
      F.push({ t: 'source', k: 'source', label: tk('fld.source') }, { t: 'select', k: 'kind', label: tk('fld.pat_type'), opts: [['rect', tk('pat.rect')], ['circ', tk('pat.circ')]] });
      if (f.kind === 'circ') F.push({ t: 'expr', k: 'count', label: tk('fld.count') }, { t: 'expr', k: 'total', label: tk('fld.total_angle'), unit: '°' }, { t: 'select', k: 'axis', label: tk('fld.axis'), opts: AXES },
        { t: 'expr', k: 'cx', label: tk('fld.c_x'), unit: 'mm' }, { t: 'expr', k: 'cy', label: tk('fld.c_y'), unit: 'mm' }, { t: 'expr', k: 'cz', label: tk('fld.c_z'), unit: 'mm' });
      else F.push({ t: 'expr', k: 'count1', label: tk('fld.count1') }, { t: 'expr', k: 'step1', label: tk('fld.step1'), unit: 'mm' }, { t: 'select', k: 'dir1', label: tk('fld.dir1'), opts: AXES },
        { t: 'expr', k: 'count2', label: tk('fld.count2') }, { t: 'expr', k: 'step2', label: tk('fld.step2'), unit: 'mm' }, { t: 'select', k: 'dir2', label: tk('fld.dir2'), opts: AXES });
      if (f.source?.kind === 'body') F.push({ t: 'check', k: 'join', label: tk('fld.join_body') });
      break;
    case 'mirror':
      F.push({ t: 'source', k: 'source', label: tk('fld.source') }, { t: 'select', k: 'plane', label: tk('fld.mirror_plane'), opts: [['XY', tk('plane.xy')], ['XZ', tk('plane.xz')], ['YZ', tk('plane.yz')]] }, { t: 'expr', k: 'offset', label: tk('fld.offset'), unit: 'mm' });
      break;
  }
  return F;
}

// Bir özellik başka bir özelliğin kimliğine (ya da ondan türeyen gövde kimliğine) bağlı mı?
export function dependsOn(f, id) {
  const hit = (s) => typeof s === 'string' && (s === id || s.startsWith(id + '#'));
  const walk = (v, key) => {
    if (v == null) return false;
    if (typeof v === 'string') return key !== 'name' && key !== 'data' && key !== 'fp' && hit(v);
    if (Array.isArray(v)) return v.some((x) => walk(x, key));
    if (typeof v === 'object') return Object.entries(v).some(([k, x]) => walk(x, k));
    return false;
  };
  if (f.type === 'sketch') return f.plane?.kind === 'face' && walk(f.plane.ref, 'ref');
  const { id: _i, name: _n, type: _t, data: _d, ...rest } = f;
  return walk(rest, '');
}
export const dependents = (doc, feat) => doc.features.filter((g) => g.id !== feat.id && dependsOn(g, feat.id));

// ------------------------------------------------------------------ WP-02: geçmiş (neden-sonuç zinciri)
// Doğrudan dayanak: işlemin başvurduğu sketch/özellik kimlikleri + başvurduğu ya da değiştirdiği gövdenin
// o ana kadarki son yazarı (status[id].bodies çekirdekten gelir). Geçişli kapanış arayüzde hesaplanır.
export function historyGraph(doc, status = {}) {
  const feats = doc.features || []; const up = new Map(), down = new Map();
  const writer = new Map(); // gövde kimliği → son yazan özellik
  const ids = new Set(feats.map((f) => f.id));
  feats.forEach((f, i) => {
    const deps = new Set(); up.set(f.id, deps); down.set(f.id, down.get(f.id) || new Set());
    for (let j = 0; j < i; j++) { const g = feats[j]; if (dependsOn(f, g.id)) deps.add(g.id); }
    for (const [b, w] of writer) if (w !== f.id && !deps.has(w) && dependsOn(f, b)) deps.add(w);
    const made = status[f.id]?.ok ? status[f.id].bodies || [] : [];
    for (const b of made) { const w = writer.get(b); if (w && w !== f.id) deps.add(w); }
    // gövde kimliği bir özellik kimliğiyle başlıyorsa (e1, e1#2) o gövdenin şimdiki yazarı dayanaktır
    for (const d of [...deps]) { if (!ids.has(d)) deps.delete(d); }
    for (const d of deps) { if (!down.has(d)) down.set(d, new Set()); down.get(d).add(f.id); }
    for (const b of made) writer.set(b, f.id);
  });
  // yazar eşlemesi: dayanılan gövdenin yaratıcısı yerine son yazarı (kesme/yuvarlatma zinciri)
  return { up, down };
}
export function closure(map, id) {
  const out = new Set(); const st = [...(map.get(id) || [])];
  while (st.length) { const x = st.pop(); if (out.has(x)) continue; out.add(x); for (const y of map.get(x) || []) st.push(y); }
  return out;
}
// Eskiz kaynaşması: tek bir işlemin "sketch" alanıyla kullandığı eskiz o işlemin altına girer.
// Döner: Map(sketchId → tüketici özellik kimliği). rb: geri sarma işaretçisi (arada kalan eskiz kaynaşmaz).
export function fusedSketches(doc) {
  const feats = doc.features || []; const use = new Map(); const pos = new Map(feats.map((f, i) => [f.id, i]));
  for (const f of feats) if (f.type !== 'sketch' && typeof f.sketch === 'string') use.set(f.sketch, [...(use.get(f.sketch) || []), f.id]);
  const out = new Map(); const rb = doc.rollback;
  for (const f of feats) {
    if (f.type !== 'sketch') continue;
    const u = use.get(f.id) || []; if (u.length !== 1) continue;
    // eskizi başka bir şey (yüzüne sketch, desen kaynağı...) de kullanıyorsa ayrı kalır
    if (feats.some((g) => g.id !== u[0] && dependsOn(g, f.id))) continue;
    const a = pos.get(f.id), b = pos.get(u[0]); if (!(b > a)) continue;
    if (rb != null && rb > a && rb <= b) continue;
    out.set(f.id, u[0]);
  }
  return out;
}
// Tekil/çoğul: n === 1 ise '<anahtar>_one' (TR'de ikisi aynı metin; EN'de "1 edge" / "2 edges")
export const tn = (key, n, p = {}) => t(n === 1 ? key + '_one' : key, { ...p, n });
// Parametre özeti ("14 mm · Kes", "Ø5,5 · Tümü", "R1 · 4 kenar"). vars: çözülmüş parametreler.
export function featSummary(f, vars = {}, fmt = (v) => String(v)) {
  const n = (e) => { try { const v = evalExpr(e, vars); return Number.isFinite(v) ? fmt(v) : '?'; } catch (x) { return '?'; } };
  const mm = (e) => n(e) + ' mm';
  const op = (o) => (o && o !== 'new' ? t(OPS.find((x) => x[0] === o)?.[1] || 'op.new') : null);
  const cnt = (k, a) => tn(k, Array.isArray(a) ? a.length : 0);
  const parts = [];
  switch (f.type) {
    case 'sketch': parts.push(f.plane?.kind === 'face' ? t('hs.on_face') : String(f.plane?.name || '')); parts.push(tn('hs.n_ents', (f.ents || []).length)); break;
    case 'extrude': parts.push(f.extent === 'all' ? t('hs.all') : mm(f.dist)); if (f.dir === 'sym') parts.push(t('hs.sym')); parts.push(op(f.op)); break;
    case 'revolve': parts.push(n(f.angle) + '°'); parts.push(op(f.op)); break;
    case 'hole': parts.push(f.thread?.designation || 'Ø' + n(f.dia)); parts.push(f.extent === 'all' ? t('hs.all') : mm(f.depth)); break;
    case 'fillet': parts.push('R' + n(f.r)); parts.push(cnt('hs.n_edges', f.edges)); break;
    case 'chamfer': parts.push(mm(f.d)); parts.push(cnt('hs.n_edges', f.edges)); break;
    case 'shell': parts.push(mm(f.t)); parts.push(cnt('hs.n_faces', f.faces)); break;
    case 'primitive':
      if (f.kind === 'box') parts.push([n(f.w), n(f.d), n(f.h)].join('×') + ' mm');
      else if (f.kind === 'cylinder') parts.push('Ø' + n(f.dia) + ' × ' + mm(f.h));
      else parts.push('Ø' + n(f.dia));
      parts.push(op(f.op)); break;
    case 'combine': parts.push(t(f.op === 'cut' ? 'op.cut' : f.op === 'intersect' ? 'op.intersect' : 'op.combine_join')); parts.push(cnt('hs.n_tools', f.tools)); break;
    case 'move': parts.push([n(f.dx ?? 0), n(f.dy ?? 0), n(f.dz ?? 0)].join(', ') + ' mm'); if (f.angle && n(f.angle) !== fmt(0)) parts.push(n(f.angle) + '°'); break;
    case 'pattern': parts.push(f.kind === 'circ' ? '×' + n(f.count) : '×' + n(f.count1) + (f.count2 ? ' × ' + n(f.count2) : '')); break;
    case 'mirror': parts.push(String(f.plane || '')); break;
    case 'import': parts.push(String(f.format || '').toUpperCase()); break;
    default: break;
  }
  return parts.filter(Boolean).join(' · ');
}

// ------------------------------------------------------------------ WP-02 dilim 4: sıra değiştirme
// Sert dayanak: işlemin açıkça başvurduğu işlemler (eskiz, gövde kimliği "e1"/"e1#2", topolojik ad kökeni "e1:side")
// + değiştirdiği gövdeyi yaratan işlem (status[id].bodies). Bunlar işlemden önce kalmak zorundadır; aynı gövde üzerinde
// art arda gelen ama birbirine başvurmayan işlemler (iki delik gibi) yer değiştirebilir.
const SKIP_TOP = new Set(['id', 'name', 'type', 'data', 'suppressed']);
const SKIP_IN = new Set(['fp', 'hint', 'profiles', 'ent', 'ents']);
export function hardRefs(f, ids, status = {}) {
  const out = new Set();
  const hit = (s) => { for (const c of [s, s.split('#')[0], s.split(':')[0]]) if (c !== f.id && ids.has(c)) out.add(c); };
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'string') { hit(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!SKIP_IN.has(k)) walk(x);
  };
  if (f.type === 'sketch') { if (f.plane?.kind === 'face') walk(f.plane.ref); }
  else for (const [k, x] of Object.entries(f)) if (!SKIP_TOP.has(k) && !SKIP_IN.has(k)) walk(x);
  const st = status[f.id];
  if (st && st.ok && Array.isArray(st.bodies)) for (const b of st.bodies) hit(String(b));
  return out;
}
export const refsMap = (doc, status = {}) => { const ids = new Set(doc.features.map((f) => f.id)); return new Map(doc.features.map((f) => [f.id, hardRefs(f, ids, status)])); };
// taşıma birimi: kaynaşmış eskiz tüketicisiyle birlikte taşınır (tek satır / tek çip)
export function moveUnit(doc, i) {
  const f = doc.features[i]; if (!f) return [];
  for (const [sk, c] of fusedSketches(doc)) if (c === f.id) return [doc.features.findIndex((x) => x.id === sk), i];
  return [i];
}
// i. işlemi (birimini) özgün dizideki `to` aralığına (to. elemanın önüne; to = n → sona) taşı.
// Geri sarma işaretçisi aynı iki komşu arasında kalır; to === rollback → işaretçinin önüne.
// Döner: {ok, noop, features, rollback, groups, at} ya da {ok:false, why:{feat, dep}}.
export function planMove(doc, i, to, status = {}, refs = null) {
  const feats = doc.features; const unit = moveUnit(doc, i); if (!unit.length) return { ok: false, noop: true };
  const uset = new Set(unit.map((k) => feats[k].id)); const MARK = { mark: true };
  const rb = doc.rollback; const arr = feats.slice(); if (rb != null) arr.splice(rb, 0, MARK);
  let target = null;
  for (let k = to; k < feats.length; k++) { if (rb != null && k === rb) { target = MARK; break; } if (!uset.has(feats[k].id)) { target = feats[k]; break; } }
  if (target == null && rb != null && to <= rb) target = MARK;
  const rest = arr.filter((x) => x === MARK || !uset.has(x.id));
  const pos = target ? rest.indexOf(target) : rest.length;
  rest.splice(pos, 0, ...unit.map((k) => feats[k]));
  let nrb = rest.indexOf(MARK); if (nrb >= 0) rest.splice(nrb, 1); if (nrb < 0 || nrb >= rest.length) nrb = null;
  const at = rest.findIndex((x, k) => x !== feats[k]);
  const groups = fixGroups(doc, rest, uset);
  // sıra aynı kalsa da grup sınırında bırakma üyeliği değiştirebilir (son üyeyi grubun hemen arkasına bırakmak)
  if (at < 0 && nrb === (rb ?? null) && JSON.stringify(groups) === JSON.stringify(Array.isArray(doc.groups) ? doc.groups : undefined)) return { ok: true, noop: true };
  const R = refs || refsMap(doc, status); const P = new Map(rest.map((x, k) => [x.id, k]));
  let why = null;
  for (const g of rest) {
    for (const d of R.get(g.id) || []) if (P.get(d) > P.get(g.id)) { const w = { feat: g.id, dep: d }; if (uset.has(g.id) || uset.has(d)) { why = w; break; } why = why || w; }
    if (why && (uset.has(why.feat) || uset.has(why.dep))) break;
  }
  if (why) return { ok: false, why };
  return { ok: true, noop: false, features: rest, rollback: nrb, groups, at: at < 0 ? Math.min(...unit) : at };
}
// sürükleme sırasında her aralığın durumu (bırakılabilir mi, değilse neden)
export function dropTargets(doc, i, status = {}) {
  const refs = refsMap(doc, status); const out = [];
  for (let to = 0; to <= doc.features.length; to++) out.push(planMove(doc, i, to, status, refs));
  return out;
}

// ------------------------------------------------------------------ WP-02 dilim 4: gruplar
// Belge şeması yalnız isteğe bağlı `groups` alanı kazanır: [{id, name, first, last}] (ardışık aralık, ilk/son işlem kimliği).
// Aralığın içine eklenen işlem gruba girer. Grup iç içe olmaz, çakışmaz.
export function groupRanges(doc) {
  const pos = new Map(doc.features.map((f, i) => [f.id, i])); const out = [];
  for (const g of Array.isArray(doc.groups) ? doc.groups : []) {
    if (!g || typeof g !== 'object') continue;
    const a = pos.get(g.first), b = pos.get(g.last); if (a == null || b == null || b < a) continue;
    if (out.some((o) => !(b < o.a || a > o.b))) continue;
    out.push({ g, id: g.id, name: g.name, a, b, ids: doc.features.slice(a, b + 1).map((f) => f.id) });
  }
  return out.sort((x, y) => x.a - y.a);
}
export const groupOf = (doc, id) => groupRanges(doc).find((r) => r.ids.includes(id)) || null;
// yapısal değişiklikten sonra grup aralıklarını yeni sıraya uydur (taşınan birim dışarı bırakılınca gruptan çıkar)
export function fixGroups(doc, feats, moved = new Set()) {
  if (!Array.isArray(doc.groups)) return undefined;
  const pos = new Map(feats.map((f, i) => [f.id, i])); const out = [];
  for (const r of groupRanges(doc)) {
    const keep = r.ids.filter((x) => pos.has(x) && !moved.has(x));
    const all = r.ids.filter((x) => pos.has(x));
    let ids = keep.length ? keep : all; if (!ids.length) continue;
    let a = Math.min(...ids.map((x) => pos.get(x))), b = Math.max(...ids.map((x) => pos.get(x)));
    if (!keep.length) { a = Math.min(...all.map((x) => pos.get(x))); b = Math.max(...all.map((x) => pos.get(x))); }
    out.push({ ...r.g, first: feats[a].id, last: feats[b].id });
  }
  return out;
}
