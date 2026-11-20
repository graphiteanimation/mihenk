// 3B görünüm: three.js, ortografik kamera, Z yukarı. Gövde/yüz/kenar seçimi, sketch gösterimi, kesit.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { findRegions, arcGeom, entSeg } from '../shared/profiles.js';
import { sample as sampleSeg } from '../shared/geom2d.js';
import * as V from '../shared/vec.js';

// 3B görünüm renkleri tema belirteçlerinden (--vp-*) okunur; tema değişince readTheme() yeniden çağrılır.
const COL = {};
const _c = new THREE.Color();
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
// #rrggbbaa (alfa'lı belirteç) three.js'te geçersiz: alfa atılır, opaklık malzemede ayrıca verilir (U-14)
const colorOf = (n) => { try { let v = cssVar(n); if (/^#[0-9a-f]{8}$/i.test(v)) v = v.slice(0, 7); else if (/^#[0-9a-f]{4}$/i.test(v)) v = v.slice(0, 4); _c.set(v); return _c.getHex(); } catch (e) { return 0x808080; } };
export function readTheme() {
  Object.assign(COL, {
    body: colorOf('--vp-body'), edge: colorOf('--vp-edge'), hover: colorOf('--vp-hover'), sel: colorOf('--vp-sel'),
    sketch: colorOf('--vp-sk-free'), sketchDim: colorOf('--vp-sk-construct'), cons: colorOf('--vp-sk-sel'), dark: colorOf('--vp-sk-full'), err: colorOf('--vp-sk-error'), ok: colorOf('--ok-fg'),
    region: colorOf('--vp-region-sel'), regionSel: colorOf('--vp-region-sel'),
    gridMinor: colorOf('--vp-grid-minor'), gridMajor: colorOf('--vp-grid-major'), axX: colorOf('--vp-axis-x'), axY: colorOf('--vp-axis-y'), axZ: colorOf('--vp-axis-z'),
  });
  return COL;
}
readTheme();

export function planeMatrix(pl) {
  const m = new THREE.Matrix4();
  m.makeBasis(new THREE.Vector3(...pl.x), new THREE.Vector3(...pl.y), new THREE.Vector3(...pl.n));
  m.setPosition(new THREE.Vector3(...pl.o));
  return m;
}

export class Viewport {
  constructor(el) {
    readTheme(); this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.localClippingEnabled = true;
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-100, 100, 100, -100, -1e5, 1e5);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(200, -260, 180);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // C-05: sol tuşla döndürme seçeneği (ayar; varsayılan kapalı). Eskiz kipinde (leftLock) sol tuş çizime ayrıldığı için kapalı kalır.
    this.leftRotate = false; this.leftLock = 0;
    const vpRef = this;
    this.controls.mouseButtons = { get LEFT() { return vpRef.leftRotate && !vpRef.leftLock ? THREE.MOUSE.ROTATE : null; }, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.zoomToCursor = true; this.controls.enableDamping = false; this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => { this.dirty = true; this.onCamera && this.onCamera(); this.onView && this.onView(); });
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a93a3, 1.15));
    const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(1, -1.5, 2); this.camera.add(dl); this.scene.add(this.camera);
    this.bodyGroup = new THREE.Group(); this.sketchGroup = new THREE.Group(); this.helperGroup = new THREE.Group(); this.hlGroup = new THREE.Group(); this.editGroup = new THREE.Group(); this.regionGroup = new THREE.Group();
    this.scene.add(this.helperGroup, this.bodyGroup, this.sketchGroup, this.regionGroup, this.hlGroup, this.editGroup);
    this.bodies = new Map(); this.filter = { face: true, edge: true, body: false };
    this.selection = []; this.hover = null; this.clip = null; this.planesVisible = true; this.pickPlanes = false;
    this.ray = new THREE.Raycaster();
    this._helpers();
    this._events();
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    const loop = () => { if (this.dirty) { this.dirty = false; this.renderer.render(this.scene, this.camera); } requestAnimationFrame(loop); };
    loop();
    this.view('iso', false);
  }

  _helpers() {
    const g = this.helperGroup;
    const grid = new THREE.GridHelper(400, 40, COL.gridMajor, COL.gridMinor); grid.rotation.x = Math.PI / 2; grid.material.transparent = true; grid.material.opacity = 0.55; grid.material.depthWrite = false; g.add(grid); this.grid = grid;
    const ax = (d, c) => { const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(...d).multiplyScalar(40)]); return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: c, depthTest: false })); };
    g.add(ax([1, 0, 0], COL.axX), ax([0, 1, 0], COL.axY), ax([0, 0, 1], COL.axZ));
    this.planeMeshes = [];
    for (const [name, col] of [['XY', COL.axZ], ['XZ', COL.axY], ['YZ', COL.axX]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
      const pl = V.basePlane(name, 0); m.applyMatrix4(planeMatrix(pl)); m.position.add(new THREE.Vector3(...pl.x).multiplyScalar(30)).add(new THREE.Vector3(...pl.y).multiplyScalar(30));
      m.userData = { basePlane: name }; g.add(m); this.planeMeshes.push(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.5 })); m.add(e);
    }
  }
  // Tema değişti: renkleri yeniden oku, yardımcıları ve gövde malzemelerini güncelle.
  applyTheme() {
    readTheme();
    for (const o of [...this.helperGroup.children]) { this.helperGroup.remove(o); o.traverse((c) => { c.geometry && c.geometry.dispose(); c.material && c.material.dispose(); }); }
    this._helpers(); this.setPlanesVisible(this.planesVisible);
    for (const b of this.bodies.values()) { b.mesh.material.color.setHex(COL.body); b.lines.material.color.setHex(COL.edge); }
    this._drawHL(); this.dirty = true;
  }
  setPlanesVisible(v) { this.planesVisible = v; this.planeMeshes.forEach((m) => (m.visible = v)); this.dirty = true; }

  resize() {
    const w = this.el.clientWidth || 800, h = this.el.clientHeight || 600;
    this.renderer.setSize(w, h, false); this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    const half = (this.camera.top - this.camera.bottom) / 2 || 100; const asp = w / h;
    this.camera.left = -half * asp; this.camera.right = half * asp; this.camera.top = half; this.camera.bottom = -half;
    this.camera.updateProjectionMatrix(); this.dirty = true; this.onCamera && this.onCamera();
  }
  worldPerPixel() { return (this.camera.top - this.camera.bottom) / this.camera.zoom / (this.el.clientHeight || 600); }

  // ---- gövdeler ----
  setBodies(bodies, hidden = new Set()) {
    for (const o of [...this.bodyGroup.children]) { this.bodyGroup.remove(o); o.traverse((c) => c.geometry && c.geometry.dispose()); }
    this.bodies.clear();
    for (const b of bodies) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(b.vertices, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(b.normals, 3));
      geo.setIndex(new THREE.BufferAttribute(b.triangles, 1));
      const mat = new THREE.MeshStandardMaterial({ color: COL.body, metalness: 0.15, roughness: 0.62, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: this.clip ? [this.clip] : [] });
      const mesh = new THREE.Mesh(geo, mat); mesh.userData = { body: b.id, kind: 'faces' };
      const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.BufferAttribute(b.lines, 3));
      const lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: COL.edge, clippingPlanes: this.clip ? [this.clip] : [] })); lines.userData = { body: b.id, kind: 'edges' };
      const grp = new THREE.Group(); grp.add(mesh, lines); grp.visible = !hidden.has(b.id);
      this.bodyGroup.add(grp); this.bodies.set(b.id, { data: b, mesh, lines, grp });
    }
    this.selection = this.selection.filter((s) => this.bodies.has(s.body));
    this._drawHL(); this.dirty = true;
  }
  bbox() {
    const box = new THREE.Box3();
    for (const b of this.bodies.values()) if (b.grp.visible) { box.expandByPoint(new THREE.Vector3(...b.data.bbox[0])); box.expandByPoint(new THREE.Vector3(...b.data.bbox[1])); }
    this.sketchGroup.updateMatrixWorld(true); this.editGroup.updateMatrixWorld(true);
    const sb = new THREE.Box3().setFromObject(this.sketchGroup); if (!sb.isEmpty()) box.union(sb);
    const eb = new THREE.Box3().setFromObject(this.editGroup); if (!eb.isEmpty()) box.union(eb);
    if (box.isEmpty()) box.set(new THREE.Vector3(-50, -50, -10), new THREE.Vector3(50, 50, 50));
    return box;
  }
  fit() {
    const box = this.bbox(); const c = box.getCenter(new THREE.Vector3()); const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 5);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(c); this.camera.position.copy(c).add(dir.multiplyScalar(r * 4 + 500));
    const asp = (this.el.clientWidth || 800) / (this.el.clientHeight || 600);
    this.camera.zoom = 1; const half = r * 1.25; this.camera.top = half; this.camera.bottom = -half; this.camera.left = -half * asp; this.camera.right = half * asp;
    if (asp < 1) { this.camera.zoom = asp; }
    this.camera.updateProjectionMatrix(); this.controls.update(); this.dirty = true; this.onCamera && this.onCamera();
  }
  // name: 'iso' | 'top' | 'bottom' | 'front' | 'back' | 'right' | 'left' ya da [x, y, z] bakış yönü (görünüm küpünün kenar/köşeleri)
  view(name, fit = true) {
    const dirs = { iso: [1, -1.3, 0.9], top: [0, 0, 1], bottom: [0, 0, -1], front: [0, -1, 0], back: [0, 1, 0], right: [1, 0, 0], left: [-1, 0, 0] };
    const d = new THREE.Vector3(...(Array.isArray(name) ? name : dirs[name] || dirs.iso)).normalize();
    const vertical = Math.abs(d.z) > 0.9999; // üstten/alttan bakışta yukarı yönü Y
    this.camera.up.set(0, vertical ? (d.z > 0 ? 1 : -1) : 0, vertical ? 0 : 1);
    this.camera.position.copy(this.controls.target).add(d.multiplyScalar(1000));
    this.camera.lookAt(this.controls.target); this.controls.update();
    if (!vertical) this.camera.up.set(0, 0, 1);
    if (fit) this.fit(); this.dirty = true; this.onView && this.onView();
  }
  setLeftRotate(on) { this.leftRotate = !!on; }
  lookAtPlane(pl) {
    const c = new THREE.Vector3(...pl.o);
    this.controls.target.copy(c); this.camera.up.set(...pl.y);
    this.camera.position.copy(c).add(new THREE.Vector3(...pl.n).multiplyScalar(1000));
    this.camera.lookAt(c); this.controls.update(); this.dirty = true; this.onCamera && this.onCamera(); this.onView && this.onView();
  }
  setSection(axis, pos, flip) {
    if (!axis) this.clip = null;
    else { const n = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[axis]; const s = flip ? 1 : -1; this.clip = new THREE.Plane(new THREE.Vector3(...n).multiplyScalar(s), -s * pos); }
    for (const b of this.bodies.values()) { b.mesh.material.clippingPlanes = this.clip ? [this.clip] : []; b.lines.material.clippingPlanes = this.clip ? [this.clip] : []; b.mesh.material.needsUpdate = true; }
    this.dirty = true;
  }

  // ---- sketch gösterimi (düzenleme dışı) ----
  setSketches(list) {
    for (const o of [...this.sketchGroup.children]) { this.sketchGroup.remove(o); o.geometry?.dispose(); }
    for (const s of list) {
      if (!s.visible || !s.plane) continue;
      const obj = sketchLines(s.sk, s.dim ? COL.sketchDim : COL.sketch); obj.applyMatrix4(planeMatrix(s.plane)); obj.userData = { sketch: s.id };
      this.sketchGroup.add(obj);
    }
    this.dirty = true;
  }
  // profil bölgeleri (extrude/revolve seçimi)
  setRegions(plane, sk, selected, onToggle) {
    for (const o of [...this.regionGroup.children]) { this.regionGroup.remove(o); o.geometry?.dispose(); }
    this.regionCb = onToggle; this.regions = null;
    if (!plane || !sk) { this.dirty = true; return 0; }
    const { regions } = findRegions(sk); this.regions = regions; const M = planeMatrix(plane);
    regions.forEach((r, i) => {
      const shape = new THREE.Shape(r.poly.map((p) => new THREE.Vector2(p[0], p[1])));
      for (const h of r.holes) shape.holes.push(new THREE.Path(h.poly.map((p) => new THREE.Vector2(p[0], p[1]))));
      const on = selected === 'all' || (selected || []).includes(i);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: on ? COL.regionSel : COL.region, transparent: true, opacity: on ? 0.45 : 0.15, side: THREE.DoubleSide, depthTest: false }));
      m.applyMatrix4(M); m.userData = { region: i }; m.renderOrder = 5; this.regionGroup.add(m);
    });
    this.dirty = true; return regions.length;
  }

  // ---- seçim ----
  setFilter(f) { this.filter = { face: false, edge: false, body: false, ...f }; this.hover = null; this._drawHL(); }
  setSelection(list) { this.selection = list.slice(); this._drawHL(); }
  _drawHL() {
    for (const o of [...this.hlGroup.children]) { this.hlGroup.remove(o); o.geometry?.dispose(); }
    const add = (s, color, hover) => {
      const b = this.bodies.get(s.body); if (!b || !b.grp.visible) return;
      if (s.kind === 'face') {
        const g = b.data.faceGroups.find((x) => x.idx === s.idx); if (!g) return;
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', b.mesh.geometry.getAttribute('position'));
        geo.setIndex(new THREE.BufferAttribute(b.data.triangles.subarray(g.start, g.start + g.count), 1));
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: hover ? 0.45 : 0.6, side: THREE.DoubleSide, depthTest: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })); this.hlGroup.add(m);
      } else if (s.kind === 'edge') {
        const g = b.data.edgeGroups.find((x) => x.idx === s.idx); if (!g) return;
        const pts = b.data.lines.subarray(g.start * 3, (g.start + g.count) * 3);
        const pos = []; const wpp = this.worldPerPixel();
        // kalın çizgi etkisi: tüp yerine üç ofsetli çizgi
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
        const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, depthTest: false, linewidth: 3 })); l.renderOrder = 10; this.hlGroup.add(l);
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
        const p = new THREE.Points(pg, new THREE.PointsMaterial({ color, size: 5, sizeAttenuation: false, depthTest: false })); p.renderOrder = 10; this.hlGroup.add(p);
      } else if (s.kind === 'body') {
        const m = new THREE.Mesh(b.mesh.geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: hover ? 0.3 : 0.45, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })); this.hlGroup.add(m);
      }
    };
    for (const s of this.selection) add(s, COL.sel, false);
    if (this.hover && !this.selection.some((s) => same(s, this.hover))) add(this.hover, COL.hover, true);
    this.dirty = true;
  }
  ndc(ev) { const r = this.renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); }
  pickAt(ev) {
    this.ray.setFromCamera(this.ndc(ev), this.camera);
    const wpp = this.worldPerPixel();
    if (this.regionCb && this.regionGroup.children.length) {
      const hits = this.ray.intersectObjects(this.regionGroup.children, false);
      if (hits.length) { // en küçük (en içteki) bölge öncelikli
        hits.sort((a, b) => this.regions[a.object.userData.region].area - this.regions[b.object.userData.region].area);
        return { kind: 'region', idx: hits[0].object.userData.region };
      }
    }
    const vis = [...this.bodies.values()].filter((b) => b.grp.visible);
    const clipOk = (p) => !this.clip || this.clip.distanceToPoint(p) >= 0;
    let faceHit = null;
    for (const h of this.ray.intersectObjects(vis.map((b) => b.mesh), false)) { if (clipOk(h.point)) { faceHit = h; break; } }
    if (this.filter.edge) {
      this.ray.params.Line.threshold = wpp * 6;
      let best = null;
      for (const h of this.ray.intersectObjects(vis.map((b) => b.lines), false)) {
        if (!clipOk(h.point)) continue;
        if (faceHit && h.distance > faceHit.distance + wpp * 8) continue; // arkadaki kenarlar
        if (!best || h.distanceToRay < best.distanceToRay - 1e-9) best = h;
      }
      if (best) {
        const b = this.bodies.get(best.object.userData.body); const g = b.data.edgeGroups.find((x) => best.index >= x.start && best.index < x.start + x.count);
        if (g && g.idx >= 0) return { kind: 'edge', body: b.data.id, idx: g.idx, point: best.point.toArray() };
      }
    }
    if (faceHit) {
      const b = this.bodies.get(faceHit.object.userData.body);
      if (this.filter.face) { const i3 = faceHit.faceIndex * 3; const g = b.data.faceGroups.find((x) => i3 >= x.start && i3 < x.start + x.count); if (g && g.idx >= 0) return { kind: 'face', body: b.data.id, idx: g.idx, point: faceHit.point.toArray() }; }
      if (this.filter.body) return { kind: 'body', body: b.data.id, point: faceHit.point.toArray() };
      return null;
    }
    if (this.pickPlanes && this.planesVisible) {
      const hits = this.ray.intersectObjects(this.planeMeshes, false);
      if (hits.length) return { kind: 'plane', name: hits[0].object.userData.basePlane };
    }
    return null;
  }
  rayToPlane(ev, pl) {
    this.ray.setFromCamera(this.ndc(ev), this.camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...pl.n), new THREE.Vector3(...pl.o));
    const p = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(plane, p)) { // ortografik ışın düzleme paralel olabilir
      return null; }
    return V.toLocal(pl, p.toArray());
  }
  project(w) { const v = new THREE.Vector3(...w).project(this.camera); const r = this.renderer.domElement.getBoundingClientRect(); return [((v.x + 1) / 2) * r.width, ((1 - v.y) / 2) * r.height]; }

  _events() {
    const dom = this.renderer.domElement; let down = null;
    dom.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, b: e.button }; if (this.onPointer && this.onPointer('down', e) === true) down.captured = true; });
    dom.addEventListener('pointermove', (e) => {
      if (this.onPointer && this.onPointer('move', e) === true) return;
      if (e.buttons) return;
      if (this._hoverRaf) return;
      this._hoverRaf = requestAnimationFrame(() => { this._hoverRaf = 0; const h = this.pickAt(e); const hv = h && h.kind !== 'region' && h.kind !== 'plane' ? h : null; if (!same(hv, this.hover)) { this.hover = hv; this._drawHL(); } dom.style.cursor = h ? 'pointer' : 'default'; });
    });
    dom.addEventListener('pointerup', (e) => {
      const d = down; down = null; if (!d) return;
      if (this.onPointer && this.onPointer('up', e) === true) return;
      if (d.captured) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
      if (e.button === 0) { const h = this.pickAt(e); this.onPick && this.onPick(h, e); }
    });
    dom.addEventListener('dblclick', (e) => this.onPointer && this.onPointer('dbl', e));
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
const same = (a, b) => (!a && !b) || (a && b && a.kind === b.kind && a.body === b.body && a.idx === b.idx);

// sketch'i yerel düzlemde çizgi nesnesine çevirir
export function sketchPolylines(sk, pred = () => true) {
  const segs = [];
  for (const e of sk.ents || []) {
    if (!pred(e)) continue;
    if (e.type === 'line') { const a = sk.points[e.a], b = sk.points[e.b]; if (a && b) segs.push({ e, pts: [[a.x, a.y], [b.x, b.y]] }); }
    else if (e.type === 'circle') { const c = sk.points[e.c]; if (!c) continue; const pts = []; for (let i = 0; i <= 72; i++) { const t = (i / 72) * Math.PI * 2; pts.push([c.x + e.r * Math.cos(t), c.y + e.r * Math.sin(t)]); } segs.push({ e, pts }); }
    else if (e.type === 'arc') { if (!sk.points[e.a] || !sk.points[e.b] || !sk.points[e.c]) continue; const g = arcGeom(sk, e); const n = Math.max(8, Math.ceil((g.sweep / (Math.PI * 2)) * 72)); const pts = []; for (let i = 0; i <= n; i++) { const t = g.a0 + (g.sweep * i) / n; pts.push([g.c.x + g.r * Math.cos(t), g.c.y + g.r * Math.sin(t)]); } segs.push({ e, pts }); }
    else if (e.type === 'ellipse' || e.type === 'ellarc' || e.type === 'spline') { try { const sg = entSeg(sk, e); if (sg) segs.push({ e, pts: sampleSeg(sg, 0.02) }); } catch (err) { /* geçersiz geometri çizilmez */ } }
  }
  return segs;
}
export function sketchLines(sk, color) {
  const pos = [];
  for (const s of sketchPolylines(sk)) for (let i = 0; i < s.pts.length - 1; i++) pos.push(s.pts[i][0], s.pts[i][1], 0, s.pts[i + 1][0], s.pts[i + 1][1], 0);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, depthTest: false })); l.renderOrder = 4; return l;
}
export { THREE, COL };
