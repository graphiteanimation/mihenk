// İmalat 3B katmanı: stok çerçevesi, WCS eksenleri, takım yolları, simülasyon stoku ve takım gösterimi.
// Tek bir THREE.Group görünüm sahnesine eklenir; imalat sekmesinden çıkınca gizlenir. Renkler tema belirteçlerinden (--vp-*) okunur.
import { THREE } from '../viewport.js';

const _c = new THREE.Color();
const css = (n, fb = '#888888') => { let v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); if (/^#[0-9a-f]{8}$/i.test(v)) v = v.slice(0, 7); try { _c.set(v || fb); return _c.getHex(); } catch (e) { return 0x808080; } };
const dispose = (g) => { g.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()); }); };

export class CamView {
  constructor(app) {
    this.app = app; this.vp = app.viewport;
    this.root = new THREE.Group(); this.root.name = 'cam'; this.root.visible = false;
    this.setupG = new THREE.Group(); this.pathG = new THREE.Group(); this.simG = new THREE.Group(); this.toolG = new THREE.Group(); this.selG = new THREE.Group();
    this.root.add(this.setupG, this.simG, this.pathG, this.toolG, this.selG); this.vp.scene.add(this.root);
    this.last = null;
  }
  get dirty() { return this.vp.dirty; } set dirty(v) { this.vp.dirty = v; }
  show(on) { this.root.visible = !!on; this.vp.dirty = true; }
  _clear(g) { for (const o of [...g.children]) { g.remove(o); dispose(o); } }
  retheme() { if (this.last) this.showSetup(this.last); }
  // setup uzayı → model uzayı: p = o + qx·x + qy·y + qz·z
  toWorld(S, q) { const f = S.frame; return [0, 1, 2].map((k) => f.o[k] + q[0] * f.x[k] + q[1] * f.y[k] + q[2] * f.z[k]); }
  showSetup(S) {
    this._clear(this.setupG); this.last = S; this.vp.dirty = true; if (!S) return;
    const { min, max } = S.stockBox; const P = (x, y, z) => new THREE.Vector3(...this.toWorld(S, [x, y, z]));
    const c = [P(min[0], min[1], min[2]), P(max[0], min[1], min[2]), P(max[0], max[1], min[2]), P(min[0], max[1], min[2]), P(min[0], min[1], max[2]), P(max[0], min[1], max[2]), P(max[0], max[1], max[2]), P(min[0], max[1], max[2])];
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]; const pts = []; for (const [a, b] of E) pts.push(c[a], c[b]);
    const box = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: css('--vp-sk-construct'), dashSize: 3, gapSize: 2 }));
    box.computeLineDistances(); this.setupG.add(box);
    // WCS eksenleri (çerçeve orijininde)
    const len = Math.max(10, Math.min(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * 0.4);
    for (const [dir, col] of [[[1, 0, 0], '--vp-axis-x'], [[0, 1, 0], '--vp-axis-y'], [[0, 0, 1], '--vp-axis-z']]) {
      const a = P(0, 0, 0), b = P(dir[0] * len, dir[1] * len, dir[2] * len);
      this.setupG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: css(col), linewidth: 2 })));
    }
    const dot = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.8, len * 0.06), 12, 8), new THREE.MeshBasicMaterial({ color: css('--accent') })); dot.position.copy(P(0, 0, 0)); this.setupG.add(dot);
  }
}
