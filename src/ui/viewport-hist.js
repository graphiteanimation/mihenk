// WP-02 dilim 5: görünümde geçmiş vurguları (viewport.js'e dokunmadan, kendi gruplarında).
//  - paintFaces: seçili işlemin ürettiği yüzler hafifçe boyanır (çekirdek featureFaces → [{body, faces}])
//  - showRepair: onarım kipinde kaybolan başvurunun son geçerli konumu kesik çizgi (hayalet), yakın adaylar vurgulu
import { THREE, COL } from './viewport.js';

const groupOf = (vp, name) => {
  let g = vp.scene.getObjectByName(name);
  if (!g) { g = new THREE.Group(); g.name = name; g.renderOrder = 6; vp.scene.add(g); }
  return g;
};
const clear = (g) => { for (const o of [...g.children]) { g.remove(o); o.geometry?.dispose(); o.material?.dispose(); } };

export function paintFaces(vp, list) {
  if (!vp) return 0; const g = groupOf(vp, 'hist-paint'); clear(g); let n = 0;
  for (const it of list || []) {
    const b = vp.bodies.get(it.body); if (!b || !b.grp.visible) continue;
    const idx = [];
    for (const k of it.faces) { const fg = b.data.faceGroups.find((x) => x.idx === k); if (fg) for (let q = fg.start; q < fg.start + fg.count; q++) idx.push(b.data.triangles[q]); }
    if (!idx.length) continue;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', b.mesh.geometry.getAttribute('position')); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COL.sel, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    m.userData = { paint: it.body }; g.add(m); n++;
  }
  vp.dirty = true; return n;
}

export function showRepair(vp, lost) {
  if (!vp) return { ghosts: 0, cands: 0 }; const g = groupOf(vp, 'hist-repair'); clear(g); let ghosts = 0, cands = 0;
  for (const L of lost || []) {
    if (L.ghost && L.ghost.length >= 6) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(L.ghost), 3));
      const line = new THREE.LineSegments(geo, new THREE.LineDashedMaterial({ color: COL.err, dashSize: 1.2, gapSize: 0.8, depthTest: false, transparent: true, opacity: 0.9 }));
      line.computeLineDistances(); line.renderOrder = 11; line.userData = { ghost: true }; g.add(line); ghosts++;
    }
    for (const c of L.cands || []) {
      const b = vp.bodies.get(c.body); if (!b) continue;
      const eg = c.kind === 'edge' ? b.data.edgeGroups.find((x) => x.idx === c.idx) : null; if (!eg) continue;
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.data.lines.subarray(eg.start * 3, (eg.start + eg.count) * 3)), 3));
      const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COL.hover, depthTest: false, transparent: true, opacity: 0.85 })); l.renderOrder = 10; l.userData = { cand: c.idx }; g.add(l); cands++;
    }
  }
  vp.dirty = true; return { ghosts, cands };
}
