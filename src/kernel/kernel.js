// AtolyeCAD geometri çekirdeği: özellik listesinden (parametrik geçmiş) B-rep gövdeleri üretir.
// OCCT (replicad üzerinden) kullanır. Hem Web Worker'da hem Node'da çalışır.
import * as R from 'replicad';
import { evalExpr, resolveParams } from '../shared/expr.js';
import { KErr, tk, toErr } from '../shared/errors.js';
import * as V from '../shared/vec.js';
import { findRegions } from '../shared/profiles.js';

export { KErr };
const BIG = 1e4; // "tümünü kes" için uzunluk (mm)

export class Kernel {
  constructor() { this.cache = []; this.meshCache = new WeakMap(); this.last = null; }

  // ---- yardımcılar ----
  num(expr, vars, label) {
    try { return evalExpr(expr, vars); } catch (e) { if (!label) throw e; throw new KErr('expr.in_field', { field: label, inner: toErr(e) }); }
  }

  resolvePlane(spec, state) {
    if (!spec || spec.kind === 'base') return V.basePlane(spec?.name || 'XY', spec?.offsetVal || 0);
    if (spec.kind === 'face') {
      const face = this.resolveRef(spec.ref, state, 'face');
      if (face.geomType !== 'PLANE') throw new KErr('sketch.plane_not_planar');
      const c = face.center.toTuple(); let n = face.normalAt(face.center).toTuple();
      return V.planeFromNormal(n, c);
    }
    throw new KErr('sketch.plane_unknown');
  }

  // Kalıcı adlandırma (basit): indeks + eleman sayısı + geometrik parmak izi.
  // Topoloji aynıysa indeks kullanılır; değiştiyse parmak izi tam eşleşmelidir, yoksa seçim "kayıp" sayılır.
  resolveRef(ref, state, kind) {
    const body = state.bodies.get(ref.body);
    if (!body) throw new KErr('ref.body_missing', { body: ref.body });
    const list = kind === 'face' ? body.shape.faces : body.shape.edges;
    if (ref.n === list.length && list[ref.idx]) return list[ref.idx];
    if (ref.fp) {
      let best = null, bd = 1e-4;
      list.forEach((el) => { const d = V.dist(elemCenter(el, kind), ref.fp); if (d < bd) { bd = d; best = el; } });
      if (best) return best;
    }
    throw new KErr(kind === 'face' ? 'ref.lost_face' : 'ref.lost_edge');
  }

  sketchFaces(sk, plane, profileSel) {
    const { regions } = findRegions(sk);
    if (!regions.length) throw new KErr('sketch.no_profile');
    let idxs = profileSel === 'all' || !profileSel ? regions.map((_, i) => i) : profileSel.filter((i) => i < regions.length);
    if (profileSel && profileSel !== 'all' && idxs.length !== profileSel.length) throw new KErr('sketch.profile_gone');
    const W = (p) => V.toWorld(plane, p[0], p[1]);
    const wire = (loop) => {
      const edges = loop.map((s) => {
        if (s.type === 'line') return R.makeLine(W(s.p0), W(s.p1));
        if (s.type === 'arc') return R.makeThreePointArc(W(s.p0), W(s.mid), W(s.p1));
        return R.makeCircle(s.r, W(s.c), plane.n);
      });
      return R.assembleWire(edges);
    };
    return idxs.map((i) => { const r = regions[i]; const base = R.makeFace(wire(r.loop)); return r.holes.length ? R.addHolesInFace(base, r.holes.map((h) => wire(h.loop))) : base; });
  }

  applyOp(state, tool, op, featId, name, targets) {
    // op: new | join | cut | intersect
    const made = [];
    if (op === 'new') {
      const id = uniqueId(state, featId);
      state.bodies.set(id, { shape: tool, name: name || { code: 'n', params: { n: state.bodies.size + 1 } } });
      return [id];
    }
    const tb = tool.boundingBox;
    let ids = targets && targets.length ? targets.filter((t) => state.bodies.has(t)) : [...state.bodies.keys()].filter((id) => !state.bodies.get(id).shape.boundingBox.isOut(tb));
    if (targets && targets.length && !ids.length) throw new KErr('op.no_target');
    if (!ids.length) {
      if (op === 'join') { const id = uniqueId(state, featId); state.bodies.set(id, { shape: tool, name: name || { code: 'n', params: { n: state.bodies.size + 1 } } }); return [id]; }
      throw new KErr(op === 'cut' ? 'op.cut_no_body' : 'op.intersect_no_body');
    }
    if (op === 'join') {
      // ilk hedefe ekle; diğer hedefler de birleşir
      let acc = state.bodies.get(ids[0]).shape.fuse(tool);
      for (const id of ids.slice(1)) { acc = acc.fuse(state.bodies.get(id).shape); state.bodies.delete(id); }
      state.bodies.set(ids[0], { ...state.bodies.get(ids[0]), shape: clean(acc) });
      return [ids[0]];
    }
    for (const id of ids) {
      const b = state.bodies.get(id);
      const res = op === 'cut' ? b.shape.cut(tool) : b.shape.intersect(tool);
      if (!res || isEmpty(res)) { if (op === 'cut') throw new KErr('op.cut_empty'); state.bodies.delete(id); continue; }
      state.bodies.set(id, { ...b, shape: clean(res) }); made.push(id);
    }
    return made;
  }

  // ---- özellikler ----
  runFeature(f, state, vars) {
    const N = (e, l) => this.num(e, vars, l);
    switch (f.type) {
      case 'sketch': {
        const spec = f.plane?.kind === 'base' ? { ...f.plane, offsetVal: N(f.plane.offset ?? 0, tk('ef.offset')) } : f.plane;
        const plane = this.resolvePlane(spec, state);
        // ölçü kısıtlarındaki ifadeler arayüzde çözülür; çekirdek çözülmüş noktaları kullanır
        state.sketches.set(f.id, { plane, sk: { points: f.points || {}, ents: f.ents || [] } });
        return;
      }
      case 'extrude': {
        const S = state.sketches.get(f.sketch); if (!S) throw new KErr('sketch.not_found');
        const faces = this.sketchFaces(S.sk, S.plane, f.profiles);
        let d = f.extent === 'all' ? BIG : N(f.dist, tk('ef.dist'));
        if (Math.abs(d) < 1e-9) throw new KErr('extrude.zero_dist');
        if (f.flip) d = -d;
        let tool = null;
        for (const face of faces) {
          let s;
          if (f.dir === 'sym') { s = R.basicFaceExtrusion(face, new R.Vector(V.mul(S.plane.n, d))).translate(V.mul(S.plane.n, -d / 2)); }
          else if (f.dir === 'two') { const d2 = N(f.dist2 ?? 0, tk('ef.dist2')); s = R.basicFaceExtrusion(face, new R.Vector(V.mul(S.plane.n, d + d2))).translate(V.mul(S.plane.n, -d2)); }
          else s = R.basicFaceExtrusion(face, new R.Vector(V.mul(S.plane.n, d)));
          tool = tool ? tool.fuse(s) : s;
        }
        state.tools.set(f.id, { tool, op: f.op, targets: f.targets });
        return this.applyOp(state, tool, f.op || 'new', f.id, f.bodyName, f.targets);
      }
      case 'revolve': {
        const S = state.sketches.get(f.sketch); if (!S) throw new KErr('sketch.not_found');
        const faces = this.sketchFaces(S.sk, S.plane, f.profiles);
        const ang = N(f.angle ?? 360, tk('ef.angle'));
        let c, dir;
        if (f.axis?.kind === 'line') {
          const e = S.sk.ents.find((x) => x.id === f.axis.ent); if (!e || e.type !== 'line') throw new KErr('revolve.axis_missing');
          const a = S.sk.points[e.a], b = S.sk.points[e.b];
          c = V.toWorld(S.plane, a.x, a.y); dir = V.norm(V.sub(V.toWorld(S.plane, b.x, b.y), c));
        } else { c = S.plane.o; dir = f.axis?.kind === 'sketchY' ? S.plane.y : S.plane.x; }
        let tool = null;
        for (const face of faces) { const s = R.revolution(face, c, dir, ang); tool = tool ? tool.fuse(s) : s; }
        state.tools.set(f.id, { tool, op: f.op, targets: f.targets });
        return this.applyOp(state, tool, f.op || 'new', f.id, f.bodyName, f.targets);
      }
      case 'hole': {
        const S = state.sketches.get(f.sketch); if (!S) throw new KErr('hole.no_sketch');
        let pts = S.sk.ents.filter((e) => e.type === 'point').map((e) => S.sk.points[e.p]);
        if (!pts.length) pts = S.sk.ents.filter((e) => e.type === 'circle' && !e.cons).map((e) => S.sk.points[e.c]);
        if (!pts.length) throw new KErr('hole.no_positions');
        const r = N(f.dia, tk('ef.dia')) / 2; if (!(r > 0)) throw new KErr('hole.dia_positive');
        const through = f.extent === 'all';
        const depth = through ? BIG : N(f.depth, tk('ef.depth'));
        const tipA = N(f.tipAngle ?? 118, tk('ef.tip_angle'));
        const tip = !through && tipA < 179.9 ? r / Math.tan((tipA * Math.PI) / 360) : 0;
        const prof = [[0, 0]];
        if (f.kind === 'cbore') {
          const cr = N(f.cboreDia, tk('ef.cbore_dia')) / 2, cd = N(f.cboreDepth, tk('ef.cbore_depth'));
          if (cr <= r) throw new KErr('hole.cbore_dia');
          prof.push([cr, 0], [cr, cd], [r, cd]);
        } else if (f.kind === 'csink') {
          const cr = N(f.csinkDia, tk('ef.csink_dia')) / 2, ca = N(f.csinkAngle ?? 90, tk('ef.csink_angle'));
          if (cr <= r) throw new KErr('hole.cbore_dia');
          prof.push([cr, 0], [r, (cr - r) / Math.tan((ca * Math.PI) / 360)]);
        } else prof.push([r, 0]);
        prof.push([r, depth]); prof.push([0, depth + tip]);
        const d = f.flip ? S.plane.n : V.mul(S.plane.n, -1);
        let tool = null;
        for (const p of pts) {
          const P0 = V.toWorld(S.plane, p.x, p.y);
          const face = R.makePolygon(prof.map(([rr, z]) => V.add(V.add(P0, V.mul(S.plane.x, rr)), V.mul(d, z))));
          const s = R.revolution(face, P0, d, 360);
          tool = tool ? tool.fuse(s) : s;
        }
        state.tools.set(f.id, { tool, op: 'cut', targets: f.targets });
        // CAM'e aktarılacak delik verisi (O-008): konum, yön, çap, derinlik, diş
        state.holes.push({ feature: f.id, kind: f.kind || 'simple', dia: r * 2, depth: through ? null : depth, through, tipAngle: tipA, thread: f.thread || null, dir: d, positions: pts.map((p) => V.toWorld(S.plane, p.x, p.y)) });
        return this.applyOp(state, tool, 'cut', f.id, null, f.targets);
      }
      case 'fillet': case 'chamfer': {
        const val = N(f.type === 'fillet' ? f.r : f.d, f.type === 'fillet' ? tk('ef.radius') : tk('ef.dist'));
        if (!(val > 0)) throw new KErr('fc.value_positive');
        const byBody = groupRefs(f.edges || []);
        if (!byBody.size) throw new KErr('fc.no_edges');
        for (const [bid, refs] of byBody) {
          const b = state.bodies.get(bid); if (!b) throw new KErr('body_missing');
          const sel = refs.map((r) => this.resolveRef(r, state, 'edge'));
          const cfg = (e) => (sel.some((s) => s.isSame(e)) ? val : null);
          let res;
          try { res = f.type === 'fillet' ? b.shape.fillet(cfg) : b.shape.chamfer(cfg); }
          catch (e) { throw new KErr(f.type === 'fillet' ? 'fillet.too_big' : 'chamfer.too_big'); }
          if (!res || isEmpty(res)) throw new KErr(f.type === 'fillet' ? 'fillet.too_big' : 'chamfer.too_big');
          state.bodies.set(bid, { ...b, shape: res });
        }
        return [...byBody.keys()];
      }
      case 'shell': {
        const t = N(f.t, tk('ef.thickness')); if (!(t > 0)) throw new KErr('shell.thickness_positive');
        const byBody = groupRefs(f.faces || []);
        if (!byBody.size) throw new KErr('shell.no_faces');
        for (const [bid, refs] of byBody) {
          const b = state.bodies.get(bid);
          const sel = refs.map((r) => this.resolveRef(r, state, 'face'));
          let res;
          try { res = b.shape.shell(t, (ff) => ff.when(({ element }) => sel.some((s) => s.isSame(element)))); }
          catch (e) { throw new KErr('shell.failed'); }
          // OCCT bazı geometrilerde sessizce aynı gövdeyi döndürür; hacim değişmediyse başarısız say
          try { if (Math.abs(R.measureVolume(res) - R.measureVolume(b.shape)) < 1e-6 * Math.max(1, R.measureVolume(b.shape))) throw 0; } catch (e) { if (e === 0) throw new KErr('shell.no_change'); }
          state.bodies.set(bid, { ...b, shape: res });
        }
        return [...byBody.keys()];
      }
      case 'primitive': {
        const p = [N(f.x ?? 0, tk('ef.x')), N(f.y ?? 0, tk('ef.y')), N(f.z ?? 0, tk('ef.z'))];
        let s;
        if (f.kind === 'box') { const w = N(f.w, tk('ef.width')), d = N(f.d, tk('ef.depth')), h = N(f.h, tk('ef.height')); if (!(w > 0 && d > 0 && h > 0)) throw new KErr('prim.dims_positive'); s = R.makeBox([p[0], p[1], p[2]], [p[0] + w, p[1] + d, p[2] + h]); }
        else if (f.kind === 'cylinder') { const r = N(f.dia, tk('ef.dia')) / 2, h = N(f.h, tk('ef.height')); if (!(r > 0 && h > 0)) throw new KErr('prim.dims_positive'); const ax = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[f.axis || 'Z']; s = R.makeCylinder(r, h, p, ax); }
        else if (f.kind === 'sphere') { const r = N(f.dia, tk('ef.dia')) / 2; if (!(r > 0)) throw new KErr('prim.dia_positive'); s = R.makeSphere(r).translate(p); }
        else throw new KErr('prim.unknown');
        state.tools.set(f.id, { tool: s, op: f.op || 'new', targets: f.targets });
        return this.applyOp(state, s, f.op || 'new', f.id, f.bodyName, f.targets);
      }
      case 'combine': {
        const tgt = state.bodies.get(f.target); if (!tgt) throw new KErr('combine.no_target');
        const tools = (f.tools || []).map((id) => { const b = state.bodies.get(id); if (!b) throw new KErr('combine.tool_missing'); return b; });
        if (!tools.length) throw new KErr('combine.no_tools');
        let acc = tgt.shape;
        for (const t of tools) acc = f.op === 'cut' ? acc.cut(t.shape) : f.op === 'intersect' ? acc.intersect(t.shape) : acc.fuse(t.shape);
        if (isEmpty(acc)) throw new KErr('combine.empty');
        state.bodies.set(f.target, { ...tgt, shape: clean(acc) });
        if (!f.keepTools) for (const id of f.tools) state.bodies.delete(id);
        return [f.target];
      }
      case 'move': {
        const made = [];
        for (const id of f.bodies || []) {
          const b = state.bodies.get(id); if (!b) throw new KErr('body_missing');
          let s = b.shape;
          const ang = N(f.angle ?? 0, tk('ef.angle'));
          if (Math.abs(ang) > 1e-12) s = s.rotate(ang, [N(f.cx ?? 0), N(f.cy ?? 0), N(f.cz ?? 0)], { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[f.axis || 'Z']);
          const t = [N(f.dx ?? 0, tk('ef.x')), N(f.dy ?? 0, tk('ef.y')), N(f.dz ?? 0, tk('ef.z'))];
          if (V.len(t) > 1e-12) s = s.translate(t);
          if (f.copy) { const nid = uniqueId(state, f.id); state.bodies.set(nid, { shape: s, name: { code: 'copy', params: { base: b.name } } }); made.push(nid); }
          else { state.bodies.set(id, { ...b, shape: s }); made.push(id); }
        }
        return made;
      }
      case 'pattern': case 'mirror': {
        // kaynak: bir özelliğin takımı (özellik deseni) ya da gövdeler
        const xforms = [];
        if (f.type === 'mirror') {
          const pl = f.plane || 'XY'; const off = N(f.offset ?? 0, tk('ef.offset'));
          const P = V.basePlane(pl, off);
          xforms.push((s) => s.mirror(new R.Plane(P.o, P.x, pl === 'XZ' ? [0, 1, 0] : P.n), P.o));
        } else if (f.kind === 'circ') {
          const n = Math.round(N(f.count, tk('ef.count'))), tot = N(f.total ?? 360, tk('ef.angle')); if (n < 2) throw new KErr('pattern.count_min');
          const ax = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[f.axis || 'Z']; const c = [N(f.cx ?? 0), N(f.cy ?? 0), N(f.cz ?? 0)];
          const step = Math.abs(tot - 360) < 1e-9 ? 360 / n : tot / (n - 1);
          for (let i = 1; i < n; i++) xforms.push((s) => s.rotate(step * i, c, ax));
        } else {
          const n1 = Math.round(N(f.count1, tk('ef.count1'))), n2 = Math.round(N(f.count2 ?? 1, tk('ef.count2')));
          const s1 = N(f.step1, tk('ef.step1')), s2 = N(f.step2 ?? 0, tk('ef.step2'));
          const d1 = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[f.dir1 || 'X'], d2 = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[f.dir2 || 'Y'];
          if (n1 < 1 || n2 < 1 || n1 * n2 < 2) throw new KErr('pattern.total_min');
          for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) { if (!i && !j) continue; const t = V.add(V.mul(d1, s1 * i), V.mul(d2, s2 * j)); xforms.push((s) => s.translate(t)); }
        }
        const made = [];
        if (f.source?.kind === 'feature') {
          const T = state.tools.get(f.source.id); if (!T) throw new KErr('pattern.source_unsupported');
          const tools = [T.tool]; let all = null;
          for (const x of xforms) { const s = x(T.tool.clone()); all = all ? all.fuse(s) : s; }
          const op = T.op === 'new' ? 'new' : T.op || 'new';
          state.tools.set(f.id, { tool: all, op, targets: T.targets });
          if (op === 'new') { for (const x of xforms) made.push(...this.applyOp(state, x(T.tool.clone()), 'new', f.id)); }
          else made.push(...this.applyOp(state, all, op, f.id, null, T.targets));
          const srcHole = state.holes.find((h) => h.feature === f.source.id);
          if (srcHole) state.holes.push({ ...srcHole, feature: f.id, patternOf: f.source.id, count: xforms.length });
        } else {
          for (const id of f.source?.bodies || []) {
            const b = state.bodies.get(id); if (!b) throw new KErr('body_missing');
            let acc = b.shape;
            for (const x of xforms) {
              const s = x(b.shape.clone());
              if (f.join) acc = acc.fuse(s); else { const nid = uniqueId(state, f.id); state.bodies.set(nid, { shape: s, name: { code: 'pat', params: { base: b.name, n: made.length + 2 } } }); made.push(nid); }
            }
            if (f.join) { state.bodies.set(id, { ...b, shape: clean(acc) }); made.push(id); }
          }
          if (!made.length) throw new KErr('pattern.no_source');
        }
        return made;
      }
      case 'import': {
        const shape = state.imports?.get(f.id); if (!shape) throw new KErr('import.load_failed');
        const sols = shape.solids?.length ? shape.solids : [shape];
        const ids = [];
        sols.forEach((s, i) => { const id = uniqueId(state, f.id); state.bodies.set(id, { shape: s, name: bodyNum(f.name || { code: 'import' }, sols.length > 1 ? i + 1 : 0) }); ids.push(id); });
        return ids;
      }
      default: throw new KErr('feature.unknown', { type: f.type });
    }
  }

  async loadImports(doc) {
    this.imports = this.imports || new Map();
    for (const f of doc.features) {
      if (f.type !== 'import' || this.imports.has(f.id)) continue;
      try {
        const bin = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
        const blob = new Blob([bin]);
        const shape = f.format === 'stl' ? await R.importSTL(blob) : await R.importSTEP(blob);
        this.imports.set(f.id, shape);
      } catch (e) { /* hata özellik çalışırken bildirilir */ }
    }
  }

  // ---- yeniden hesap ----
  async rebuild(doc) {
    await this.loadImports(doc);
    const { vars, errors: perr } = resolveParams(doc.params);
    const status = {}; const pkey = JSON.stringify(vars);
    const end = doc.rollback == null ? doc.features.length : Math.min(doc.rollback, doc.features.length);
    let state = { bodies: new Map(), sketches: new Map(), tools: new Map(), holes: [], imports: this.imports };
    const newCache = []; let valid = true;
    for (let i = 0; i < end; i++) {
      const f = doc.features[i];
      const key = pkey + '|' + JSON.stringify({ ...f, name: undefined, data: f.data ? f.data.length : undefined });
      const c = this.cache[i];
      if (valid && c && c.key === key) { state = cloneState(c.state); state.imports = this.imports; status[f.id] = c.status; newCache.push(c); continue; }
      valid = false;
      if (f.suppressed) { status[f.id] = { ok: true, suppressed: true }; }
      else {
        const snap = cloneState(state);
        try { const made = this.runFeature(f, state, vars) || []; status[f.id] = { ok: true, bodies: made }; }
        catch (e) { state = snap; state.imports = this.imports; status[f.id] = { ok: false, error: toErr(e) }; }
      }
      newCache.push({ key, state: cloneState(state), status: status[f.id] });
    }
    this.cache = newCache; this.last = state;
    const bodies = [];
    for (const [id, b] of state.bodies) {
      let m = this.meshCache.get(b.shape);
      if (!m) {
        const bb = b.shape.boundingBox; const diag = Math.hypot(bb.width, bb.height, bb.depth) || 1;
        const tol = Math.max(0.005, Math.min(0.2, diag / 2000));
        const mesh = b.shape.mesh({ tolerance: tol, angularTolerance: 0.25 });
        const edges = b.shape.meshEdges({ tolerance: tol, angularTolerance: 0.25 });
        let volume = 0; try { volume = R.measureVolume(b.shape); } catch (e) {}
        const fh = new Map(); b.shape.faces.forEach((x, i) => fh.set(x.hashCode, i));
        const eh = new Map(); b.shape.edges.forEach((x, i) => eh.set(x.hashCode, i));
        m = {
          vertices: new Float32Array(mesh.vertices), normals: new Float32Array(mesh.normals), triangles: new Uint32Array(mesh.triangles),
          faceGroups: mesh.faceGroups.map((g) => ({ start: g.start, count: g.count, idx: fh.get(g.faceId) ?? -1 })),
          lines: new Float32Array(edges.lines), edgeGroups: edges.edgeGroups.map((g) => ({ start: g.start, count: g.count, idx: eh.get(g.edgeId) ?? -1 })), bbox: bb.bounds, volume,
          nFaces: b.shape.faces.length, nEdges: b.shape.edges.length,
        };
        this.meshCache.set(b.shape, m);
      }
      bodies.push({ id, name: typeof b.name === 'string' ? b.name : null, auto: typeof b.name === 'string' ? null : b.name, ...m });
    }
    const sketches = {};
    for (const [id, s] of state.sketches) sketches[id] = { plane: s.plane };
    return { bodies, status, sketches, vars, paramErrors: perr, holes: state.holes };
  }

  // ---- sorgular ----
  describe(ref, kind) {
    const body = this.last?.bodies.get(ref.body); if (!body) throw new KErr('body_none');
    const list = kind === 'face' ? body.shape.faces : body.shape.edges;
    const el = list[ref.idx]; if (!el) throw new KErr('elem_none');
    const fp = elemCenter(el, kind);
    const out = { body: ref.body, idx: ref.idx, n: list.length, fp, kind };
    if (kind === 'face') {
      out.geom = el.geomType; out.area = R.measureArea(el);
      if (el.geomType === 'PLANE') { out.normal = el.normalAt(el.center).toTuple(); }
      if (el.geomType === 'CYLINDRE') { try { const oc = R.getOC(); const surf = el.surface.wrapped; const cyl = surf.Cylinder(); out.radius = cyl.Radius(); const ax = cyl.Axis(); const l = ax.Location(), d = ax.Direction(); out.axis = { o: [l.X(), l.Y(), l.Z()], d: [d.X(), d.Y(), d.Z()] }; } catch (e) {} }
    } else {
      out.length = R.measureLength(el); out.geom = el.geomType;
      try { out.start = el.startPoint.toTuple(); out.end = el.endPoint.toTuple(); } catch (e) {}
      if (el.geomType === 'CIRCLE') { try { const c = el._geomAdaptor().Circle(); out.radius = c.Radius(); const l = c.Location(); out.center = [l.X(), l.Y(), l.Z()]; } catch (e) {} }
    }
    return out;
  }
  facePlane(ref) {
    const face = this.resolveRef(ref, this.last, 'face');
    if (face.geomType !== 'PLANE') throw new KErr('face.not_planar');
    return V.planeFromNormal(face.normalAt(face.center).toTuple(), face.center.toTuple());
  }
  measure(a, b) {
    const get = (r) => { const body = this.last.bodies.get(r.body); return r.kind === 'body' ? body.shape : (r.kind === 'face' ? body.shape.faces : body.shape.edges)[r.idx]; };
    const sa = get(a), sb = get(b);
    const out = { distance: R.measureDistanceBetween(sa, sb) };
    const da = this.describe(a, a.kind), db = this.describe(b, b.kind);
    if (da.normal && db.normal) out.angle = (Math.acos(Math.min(1, Math.abs(V.dot(da.normal, db.normal)))) * 180) / Math.PI;
    out.centerDistance = V.dist(da.fp, db.fp);
    out.delta = V.sub(db.fp, da.fp);
    return out;
  }
  bodyProps(id) {
    const b = this.last?.bodies.get(id); if (!b) throw new KErr('body_none');
    const vp = R.measureShapeVolumeProperties(b.shape); const bb = b.shape.boundingBox;
    return { volume: R.measureVolume(b.shape), area: R.measureArea(b.shape), com: vp.centerOfMass, bbox: bb.bounds, size: [bb.width, bb.height, bb.depth] };
  }
  interference(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = this.last.bodies.get(ids[i]), b = this.last.bodies.get(ids[j]);
      if (a.shape.boundingBox.isOut(b.shape.boundingBox)) continue;
      try { const c = a.shape.intersect(b.shape); const v = isEmpty(c) ? 0 : R.measureVolume(c); if (v > 1e-6) out.push({ a: ids[i], b: ids[j], volume: v }); } catch (e) {}
    }
    return out;
  }
  async exportFile(format, ids, names) {
    const shapes = [...this.last.bodies].filter(([id]) => !ids || ids.includes(id));
    if (!shapes.length) throw new KErr('export.no_body');
    let blob;
    if (format === 'step') blob = R.exportSTEP(shapes.map(([id, b]) => ({ shape: b.shape, name: names?.[id] || (typeof b.name === 'string' ? b.name : id) })), { unit: 'MM', modelUnit: 'MM' });
    else { const comp = shapes.length === 1 ? shapes[0][1].shape : R.makeCompound(shapes.map(([, b]) => b.shape)); blob = comp.blobSTL({ tolerance: 0.01, angularTolerance: 0.1, binary: true }); }
    return new Uint8Array(await blob.arrayBuffer());
  }
}

function elemCenter(el, kind) {
  if (kind === 'face') return el.center.toTuple();
  try { return el.pointAt(0.5).toTuple(); } catch (e) { const b = el.boundingBox.center; return [b[0], b[1], b[2]]; }
}
function groupRefs(refs) { const m = new Map(); for (const r of refs) { if (!m.has(r.body)) m.set(r.body, []); m.get(r.body).push(r); } return m; }
function uniqueId(state, base) { if (!state.bodies.has(base)) return base; let i = 2; while (state.bodies.has(base + '#' + i)) i++; return base + '#' + i; }
function cloneState(s) { return { bodies: new Map(s.bodies), sketches: new Map(s.sketches), tools: new Map(s.tools), holes: s.holes.slice(), imports: s.imports }; }
function isEmpty(shape) { try { return !shape || shape.isNull || shape.faces.length === 0; } catch (e) { return true; } }
function clean(shape) { return shape; }
function bodyNum(base, n) { return n ? { code: 'num', params: { base, n } } : base; }

export async function initKernel(ocFactory, locate) {
  const oc = await ocFactory(locate ? { locateFile: locate } : undefined);
  R.setOC(oc);
  return new Kernel();
}
