// İmalat 3B katmanı: stok çerçevesi, WCS eksenleri, takım yolları, simülasyon stoku ve takım gösterimi.
// Tek bir THREE.Group görünüm sahnesine eklenir; imalat sekmesinden çıkınca gizlenir. Renkler tema belirteçlerinden (--vp-*) okunur.
import { THREE } from '../viewport.js';
import { sampleArc } from '../../cam/ir.js';

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

  // ---------------------------------------------------------------- ortak
  basis(S) { const m = new THREE.Matrix4(); m.makeBasis(new THREE.Vector3(...S.frame.x), new THREE.Vector3(...S.frame.y), new THREE.Vector3(...S.frame.z)); m.setPosition(new THREE.Vector3(...S.frame.o)); return m; }
  holder(S) { const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(this.basis(S)); g.matrixWorldNeedsUpdate = true; return g; }

  // ---------------------------------------------------------------- takım yolları
  // items: [{opId, S, tp}]; sel: vurgulanan işlem (diğerleri soluk)
  showPaths(items, sel = null) {
    this._clear(this.pathG); this.pathItems = items; this.vp.dirty = true;
    const col = { rapid: css('--vp-toolpath-rapid'), cut: css('--vp-toolpath-cut'), lead: css('--vp-toolpath-lead') };
    for (const it of items) {
      const dim = sel && sel !== it.opId; const g = this.holder(it.S); g.userData.opId = it.opId;
      const seg = { rapid: [], cut: [], lead: [] }; walkMoves(it.tp, (kind, a, b) => { const arr = seg[kind]; arr.push(a[0], a[1], a[2], b[0], b[1], b[2]); });
      for (const k of ['rapid', 'cut', 'lead']) {
        if (!seg[k].length) continue;
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(seg[k], 3));
        const mat = k === 'rapid' ? new THREE.LineDashedMaterial({ color: col.rapid, dashSize: 2, gapSize: 1.5, transparent: dim, opacity: dim ? 0.3 : 1 }) : new THREE.LineBasicMaterial({ color: col[k], transparent: dim, opacity: dim ? 0.35 : 1 });
        const ls = new THREE.LineSegments(geo, mat); if (k === 'rapid') ls.computeLineDistances(); g.add(ls);
      }
      this.pathG.add(g);
    }
  }
  clearPaths() { this._clear(this.pathG); this.pathItems = []; this.hideMove(); this.vp.dirty = true; }
  pathsVisible(on) { this.pathG.visible = !!on; this.vp.dirty = true; }
  // tek hareketi vurgula (NC satırı / sorun tıklaması)
  showMove(S, tp, k) {
    this._clear(this.selG); this.vp.dirty = true; if (!S || !tp || k == null) return;
    const g = this.holder(S); const pts = []; walkMoves(tp, (kind, a, b) => { pts.push(a, b); }, k);
    if (!pts.length) return;
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p)));
    const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: css('--err-fg'), depthTest: false })); l.renderOrder = 10; g.add(l);
    const m = tp.moves[k]; const mk = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshBasicMaterial({ color: css('--err-fg'), depthTest: false })); mk.position.set(m.x ?? m.points?.[0]?.[0] ?? 0, m.y ?? m.points?.[0]?.[1] ?? 0, m.z ?? m.top ?? 0); mk.renderOrder = 11; g.add(mk);
    this.selG.add(g);
  }
  hideMove() { this._clear(this.selG); this.vp.dirty = true; }

  // ---------------------------------------------------------------- simülasyon stoku ve takım
  // setups: Map(setupId → {S, hm}); hm canlı yükseklik haritasıdır
  initSim(setups) {
    this.clearSim(); this.simMesh = new Map();
    for (const [id, { S, hm }] of setups) {
      const g = this.holder(S); const stride = Math.max(1, Math.ceil(Math.sqrt((hm.nx * hm.ny) / 160000)));
      const nx = Math.max(2, Math.floor((hm.nx - 1) / stride) + 1), ny = Math.max(2, Math.floor((hm.ny - 1) / stride) + 1);
      const pos = new Float32Array(nx * ny * 3); const idx = new Uint32Array((nx - 1) * (ny - 1) * 6); let q = 0;
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.set([a, b, d, a, d, c], q); q += 6; }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = (j * nx + i) * 3; pos[k] = hm.x0 + (Math.min(i * stride, hm.nx - 1) + 0.5) * hm.res; pos[k + 1] = hm.y0 + (Math.min(j * stride, hm.ny - 1) + 0.5) * hm.res; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
      const mat = new THREE.MeshStandardMaterial({ color: css('--vp-body'), flatShading: true, side: THREE.DoubleSide, metalness: 0.1, roughness: 0.7 });
      const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; g.add(mesh); this.simG.add(g);
      this.simMesh.set(id, { g, mesh, hm, nx, ny, stride, floor: S.stockBox.min[2], S }); this.updateSim(id);
    }
  }
  updateSim(id) {
    const m = this.simMesh?.get(id); if (!m) return; const p = m.mesh.geometry.attributes.position, hm = m.hm;
    for (let j = 0; j < m.ny; j++) for (let i = 0; i < m.nx; i++) { const v = hm.data[Math.min(j * m.stride, hm.ny - 1) * hm.nx + Math.min(i * m.stride, hm.nx - 1)]; p.array[(j * m.nx + i) * 3 + 2] = Number.isFinite(v) ? v : m.floor; }
    p.needsUpdate = true; m.mesh.geometry.computeBoundingSphere(); this.vp.dirty = true;
  }
  showSimSetup(id) { if (!this.simMesh) return; for (const [k, m] of this.simMesh) m.g.visible = k === id; this.vp.dirty = true; }
  simVisible(on) { this.simG.visible = !!on; this.vp.dirty = true; }
  // bodies: stok gösterildiğinde modeli soluklaştır
  setBodiesDim(on) { const vp = this.vp; for (const b of vp.bodies.values()) { b.mesh.material.transparent = !!on; b.mesh.material.opacity = on ? 0.18 : 1; b.mesh.material.depthWrite = !on; } vp.dirty = true; }
  clearSim() { this._clear(this.simG); this._clear(this.toolG); this.simMesh = null; this.toolObj = null; this.setBodiesDim(false); this.vp.dirty = true; }
  // takım gösterimi: setup çerçevesinde bir grup; geometri takım ve tutucu ölçülerinden
  setTool(S, tool, extras, withHolder) {
    this._clear(this.toolG); this.toolObj = null; if (!S || !tool) { this.vp.dirty = true; return; }
    const root = this.holder(S); const g = new THREE.Group(); root.add(g); const T = { ...tool, ...(extras || {}) }; const R = T.dia / 2; const fl = T.fluteLen || 10; const bl = Math.max(T.bodyLen || fl, fl);
    const mat = new THREE.MeshStandardMaterial({ color: css('--accent'), transparent: true, opacity: 0.85, metalness: 0.3, roughness: 0.4 }); const matH = new THREE.MeshStandardMaterial({ color: css('--text-muted'), transparent: true, opacity: 0.45 });
    const cyl = (r, h, z0, m) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(h, 0.01), 28), m); c.rotation.x = Math.PI / 2; c.position.z = z0 + h / 2; return c; };
    let z0 = 0;
    if (T.type === 'ball') { const s = new THREE.Mesh(new THREE.SphereGeometry(R, 28, 14), mat); s.position.z = R; g.add(s); z0 = R; }
    else if (['drill', 'spot', 'chamfer'].includes(T.type) && T.tipAngle) { const tr = Math.min(R * 0.999, (T.tipDia || 0) / 2); const tl = (R - tr) / Math.tan((T.tipAngle * Math.PI) / 360); const c = new THREE.Mesh(tr > 0 ? new THREE.CylinderGeometry(tr, R, tl, 28) : new THREE.ConeGeometry(R, tl, 28), mat); c.rotation.x = -Math.PI / 2; c.position.z = tl / 2; g.add(c); z0 = tl; }
    g.add(cyl(R, fl - z0, z0, mat));
    const sd = T.shaftDia || T.dia; if (bl > fl) g.add(cyl(sd / 2, bl - fl, fl, mat));
    if (withHolder && T.holder) g.add(cyl(T.holder.dia / 2, T.holder.len, bl, matH));
    this.toolObj = g; this.toolG.add(root); this.vp.dirty = true;
  }
  moveTool(p) { if (this.toolObj && p) { this.toolObj.position.set(p.x, p.y, p.z); this.vp.dirty = true; } }
}

// Takım yolu hareketlerini doğru parçalarına açar: cb(tür 'rapid'|'cut'|'lead', [x,y,z], [x,y,z]); only verilirse yalnız o hareket.
export function walkMoves(tp, cb, only = null) {
  let p = null;
  tp.moves.forEach((m, k) => {
    const want = only === null || only === k; const q = m.t === 'cycle' ? null : [m.x, m.y, m.z];
    if (m.t === 'rapid') { if (want && p) cb('rapid', p, q); p = q; }
    else if (m.t === 'feed') { if (want && p) cb(m.kind === 'cut' ? 'cut' : 'lead', p, q); p = q; }
    else if (m.t === 'arc') {
      let a = p; if (p) for (const pt of sampleArc({ x: p[0], y: p[1], z: p[2] }, m)) { if (want) cb(m.kind === 'cut' ? 'cut' : 'lead', a, pt); a = pt; } p = q;
    } else if (m.t === 'cycle') {
      for (const [x, y] of m.points) { if (want) { if (p) cb('rapid', p, [x, y, m.clearance]); cb('rapid', [x, y, m.clearance], [x, y, m.retract]); cb('cut', [x, y, m.retract], [x, y, m.bottom]); } p = [x, y, m.clearance]; }
    }
  });
}
