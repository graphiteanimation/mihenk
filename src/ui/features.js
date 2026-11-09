// Özellik şemaları: varsayılanlar, alan tanımları, adlandırma, bağımlılık taraması.
export const TYPE_LABEL = {
  sketch: 'Sketch', extrude: 'Extrude', revolve: 'Revolve', hole: 'Delik', fillet: 'Yuvarlat', chamfer: 'Pah', shell: 'Kabuk',
  combine: 'Birleştir', move: 'Taşı/Kopyala', pattern: 'Desen', mirror: 'Ayna', import: 'İçe Aktarılan',
};
export const KIND_LABEL = { box: 'Kutu', cylinder: 'Silindir', sphere: 'Küre' };
const ID_PREFIX = { sketch: 'sk', extrude: 'ext', revolve: 'rev', hole: 'hole', fillet: 'fil', chamfer: 'cham', shell: 'shell', combine: 'comb', move: 'mov', pattern: 'pat', mirror: 'mir', import: 'imp', box: 'box', cylinder: 'cyl', sphere: 'sph' };

export const featLabel = (f) => (f.type === 'primitive' ? KIND_LABEL[f.kind] || 'Kutu' : TYPE_LABEL[f.type] || f.type);

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

export const OPS = [['new', 'Yeni gövde'], ['join', 'Ekle'], ['cut', 'Kes'], ['intersect', 'Kesişim']];
export const AXES = [['X', 'X'], ['Y', 'Y'], ['Z', 'Z']];
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
  const opField = (label = 'İşlem') => ({ t: 'select', k: 'op', label, opts: OPS });
  switch (f.type) {
    case 'primitive':
      F.push({ t: 'expr', k: 'x', label: 'Konum X', unit: 'mm' }, { t: 'expr', k: 'y', label: 'Konum Y', unit: 'mm' }, { t: 'expr', k: 'z', label: 'Konum Z', unit: 'mm' });
      if (f.kind === 'box') F.push({ t: 'expr', k: 'w', label: 'Genişlik (X)', unit: 'mm' }, { t: 'expr', k: 'd', label: 'Derinlik (Y)', unit: 'mm' }, { t: 'expr', k: 'h', label: 'Yükseklik (Z)', unit: 'mm' });
      else if (f.kind === 'cylinder') F.push({ t: 'expr', k: 'dia', label: 'Çap', unit: 'mm' }, { t: 'expr', k: 'h', label: 'Yükseklik', unit: 'mm' }, { t: 'select', k: 'axis', label: 'Eksen', opts: AXES });
      else F.push({ t: 'expr', k: 'dia', label: 'Çap', unit: 'mm' });
      F.push(opField());
      break;
    case 'extrude':
      F.push({ t: 'sketch', k: 'sketch', label: 'Sketch' }, { t: 'profiles', k: 'profiles', label: 'Profiller' }, opField(),
        { t: 'select', k: 'dir', label: 'Yön', opts: [['one', 'Tek yön'], ['sym', 'Simetrik'], ['two', 'İki yön']] },
        { t: 'select', k: 'extent', label: 'Kapsam', opts: [['dist', 'Mesafe'], ['all', 'Tümü']] });
      if (f.extent !== 'all') F.push({ t: 'expr', k: 'dist', label: f.dir === 'two' ? 'Mesafe 1' : 'Mesafe', unit: 'mm' });
      if (f.dir === 'two' && f.extent !== 'all') F.push({ t: 'expr', k: 'dist2', label: 'Mesafe 2', unit: 'mm' });
      F.push({ t: 'check', k: 'flip', label: 'Ters çevir' });
      break;
    case 'revolve':
      F.push({ t: 'sketch', k: 'sketch', label: 'Sketch' }, { t: 'profiles', k: 'profiles', label: 'Profiller' }, { t: 'axis', k: 'axis', label: 'Eksen' }, { t: 'expr', k: 'angle', label: 'Açı', unit: '°' }, opField());
      break;
    case 'hole':
      F.push({ t: 'sketch', k: 'sketch', label: 'Sketch', need: 'points' },
        { t: 'select', k: 'kind', label: 'Tip', opts: [['simple', 'Düz'], ['cbore', 'Silindirik havşa'], ['csink', 'Konik havşa']] },
        { t: 'thread', k: 'thread', label: 'Diş' }, { t: 'expr', k: 'dia', label: 'Çap', unit: 'mm' },
        { t: 'select', k: 'extent', label: 'Kapsam', opts: [['dist', 'Derinlik'], ['all', 'Tümü (delip geçer)']] });
      if (f.extent !== 'all') F.push({ t: 'expr', k: 'depth', label: 'Derinlik', unit: 'mm' }, { t: 'expr', k: 'tipAngle', label: 'Uç açısı', unit: '°' });
      if (f.kind === 'cbore') F.push({ t: 'expr', k: 'cboreDia', label: 'Havşa çapı', unit: 'mm' }, { t: 'expr', k: 'cboreDepth', label: 'Havşa derinliği', unit: 'mm' });
      if (f.kind === 'csink') F.push({ t: 'expr', k: 'csinkDia', label: 'Havşa çapı', unit: 'mm' }, { t: 'expr', k: 'csinkAngle', label: 'Havşa açısı', unit: '°' });
      F.push({ t: 'check', k: 'flip', label: 'Ters çevir' });
      break;
    case 'fillet': F.push({ t: 'sel', k: 'edges', label: 'Kenarlar', kind: 'edge' }, { t: 'expr', k: 'r', label: 'Yarıçap', unit: 'mm' }); break;
    case 'chamfer': F.push({ t: 'sel', k: 'edges', label: 'Kenarlar', kind: 'edge' }, { t: 'expr', k: 'd', label: 'Mesafe', unit: 'mm' }); break;
    case 'shell': F.push({ t: 'sel', k: 'faces', label: 'Açılacak yüzler', kind: 'face' }, { t: 'expr', k: 't', label: 'Kalınlık', unit: 'mm' }); break;
    case 'combine':
      F.push({ t: 'sel', k: 'target', label: 'Hedef gövde', kind: 'body', single: true }, { t: 'sel', k: 'tools', label: 'Takım gövdeler', kind: 'body' },
        { t: 'select', k: 'op', label: 'İşlem', opts: [['join', 'Birleştir'], ['cut', 'Kes'], ['intersect', 'Kesişim']] }, { t: 'check', k: 'keepTools', label: 'Takım gövdeleri koru' });
      break;
    case 'move':
      F.push({ t: 'sel', k: 'bodies', label: 'Gövdeler', kind: 'body' }, { t: 'expr', k: 'dx', label: 'Öteleme X', unit: 'mm' }, { t: 'expr', k: 'dy', label: 'Öteleme Y', unit: 'mm' }, { t: 'expr', k: 'dz', label: 'Öteleme Z', unit: 'mm' },
        { t: 'expr', k: 'angle', label: 'Döndürme', unit: '°' }, { t: 'select', k: 'axis', label: 'Dönme ekseni', opts: AXES },
        { t: 'expr', k: 'cx', label: 'Merkez X', unit: 'mm' }, { t: 'expr', k: 'cy', label: 'Merkez Y', unit: 'mm' }, { t: 'expr', k: 'cz', label: 'Merkez Z', unit: 'mm' }, { t: 'check', k: 'copy', label: 'Kopyala (aslını koru)' });
      break;
    case 'pattern':
      F.push({ t: 'source', k: 'source', label: 'Kaynak' }, { t: 'select', k: 'kind', label: 'Tür', opts: [['rect', 'Dikdörtgen'], ['circ', 'Dairesel']] });
      if (f.kind === 'circ') F.push({ t: 'expr', k: 'count', label: 'Adet' }, { t: 'expr', k: 'total', label: 'Toplam açı', unit: '°' }, { t: 'select', k: 'axis', label: 'Eksen', opts: AXES },
        { t: 'expr', k: 'cx', label: 'Merkez X', unit: 'mm' }, { t: 'expr', k: 'cy', label: 'Merkez Y', unit: 'mm' }, { t: 'expr', k: 'cz', label: 'Merkez Z', unit: 'mm' });
      else F.push({ t: 'expr', k: 'count1', label: 'Adet 1' }, { t: 'expr', k: 'step1', label: 'Aralık 1', unit: 'mm' }, { t: 'select', k: 'dir1', label: 'Yön 1', opts: AXES },
        { t: 'expr', k: 'count2', label: 'Adet 2' }, { t: 'expr', k: 'step2', label: 'Aralık 2', unit: 'mm' }, { t: 'select', k: 'dir2', label: 'Yön 2', opts: AXES });
      if (f.source?.kind === 'body') F.push({ t: 'check', k: 'join', label: 'Gövdeye birleştir' });
      break;
    case 'mirror':
      F.push({ t: 'source', k: 'source', label: 'Kaynak' }, { t: 'select', k: 'plane', label: 'Ayna düzlemi', opts: [['XY', 'XY (Üst)'], ['XZ', 'XZ (Ön)'], ['YZ', 'YZ (Sağ)']] }, { t: 'expr', k: 'offset', label: 'Ofset', unit: 'mm' });
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
