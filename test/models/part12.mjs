// WP-02: 12 işlemli örnek parça (çekirdek ve arayüz testleri ortak kullanır; OCCT yüklemez).
// node --input-type=module -e "import('./test/models/part12.mjs').then(m => console.log(JSON.stringify(m.part12('30'))))"
const rect = (w, h) => ({ O: { x: 0, y: 0, fixed: true }, p1: { x: 0, y: 0 }, p2: { x: w, y: 0 }, p3: { x: w, y: h }, p4: { x: 0, y: h } });
const rectEnts = [1, 2, 3, 4].map((i) => ({ id: 'l' + i, type: 'line', a: 'p' + i, b: 'p' + ((i % 4) + 1) }));
const cyl = (id, x, y, dia, target) => ({ id, type: 'primitive', kind: 'cylinder', x: String(x), y: String(y), z: '-1', dia: String(dia), h: '100', axis: 'Z', op: 'cut', targets: [target] });
const edge = (body, a, b) => ({ body, kind: 'edge', name: { a, b } });
// 12 işlem. 3. işlem (bx, ayrı gövde) ölçüsü H3; etkiledikleri: fb, cy, cz (bx gövdesi). Diğerleri e1 gövdesinde.
export function part12(H3 = '30') {
  return { params: [], rollback: null, features: [
    { id: 's1', type: 'sketch', name: 'Sketch 1', plane: { kind: 'base', name: 'XY', offset: '0' }, points: rect(100, 60), ents: rectEnts, cons: [] },
    { id: 'e1', type: 'extrude', name: 'Extrude 1', sketch: 's1', profiles: 'all', dist: '20', extent: 'dist', dir: 'one', op: 'new' },
    { id: 'bx', type: 'primitive', name: 'Kutu 1', kind: 'box', x: '130', y: '0', z: '0', w: '30', d: '30', h: H3, op: 'new' },
    cyl('k1', 20, 20, 8, 'e1'),
    cyl('k2', 80, 40, 8, 'e1'),
    { id: 's2', type: 'sketch', name: 'Sketch 2', plane: { kind: 'base', name: 'XY', offset: '20' }, points: { O: { x: 0, y: 0, fixed: true }, c: { x: 50, y: 30 } }, ents: [{ id: 'c1', type: 'circle', c: 'c', r: 10 }], cons: [] },
    { id: 'e2', type: 'extrude', name: 'Extrude 2', sketch: 's2', profiles: 'all', dist: '10', extent: 'dist', dir: 'one', op: 'join', targets: ['e1'] },
    { id: 'fb', type: 'fillet', name: 'Fillet 1', edges: [edge('bx', 'bx:x+', 'bx:z+')], r: '3' },
    cyl('k3', 20, 45, 6, 'e1'),
    { id: 'ch', type: 'chamfer', name: 'Chamfer 1', edges: [edge('e1', 'e1:side:l1', 'e1:start')], d: '1' },
    cyl('cy', 140, 10, 6, 'bx'),
    cyl('cz', 150, 20, 6, 'bx'),
  ] };
}

export const AFFECTED = ['bx', 'fb', 'cy', 'cz'];
