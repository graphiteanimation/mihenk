// Mihenk geometri çekirdeği: özellik listesinden (parametrik geçmiş) B-rep gövdeleri üretir.
// OCCT (replicad üzerinden) kullanır. Hem Web Worker'da hem Node'da çalışır.
// İlke: ya doğru sonuç ya açık hata ({ok:false, error:{code, params}}); sessiz yanlış yok.
import * as R from 'replicad';
import { evalExpr, resolveParams } from '../shared/expr.js';
import { KErr, tk, toErr } from '../shared/errors.js';
import * as V from '../shared/vec.js';
import * as TP from './topo.js';
import { faceName, edgeName, resolveName, aliasSet, faceKey, vertKey } from './naming.js';
import { sketchFaces, matchSeg, MAX_COORD } from './sketch.js';
import * as CAM from './cam.js';
import { recognizeBody, recognizedHoles } from './holes.js';

export { KErr };
export const LIMITS = { minDim: 1e-3, maxDim: 1e5, maxPattern: 2000, maxStlTris: 50000 };
const AX = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
const OPS = new Set(['new', 'join', 'cut', 'intersect']);

export class Kernel {
  constructor() { this.reset(); }
  // Çekirdek durumunu sıfırlar (Yeni/Aç, worker yeniden başlatma eşdeğeri)
  reset() { this.cache = []; this.meshCache = new WeakMap(); this.last = null; this.imports = new Map(); this.hashes = new Map(); this.upgrades = new Map(); this.sums = new Map(); this.lastGood = new Map(); this.rev = 0; }

  // ---- değer yardımcıları ----
  num(expr, vars, label) {
    try { return evalExpr(expr, vars); } catch (e) { if (!label) throw e; throw new KErr('expr.in_field', { field: label, inner: toErr(e) }); }
  }
  // ölçü: |v| ∈ [minDim, maxDim] (F-11/S-08)
  dim(v, field, { allowNeg = false, allowZero = false } = {}) {
    if (!Number.isFinite(v)) throw new KErr('value.out_of_range', { field, value: v, min: LIMITS.minDim, max: LIMITS.maxDim });
    if (!allowNeg && v < 0) throw new KErr('value.positive', { field, value: v });
    const a = Math.abs(v); if (allowZero && a === 0) return v;
    if (a < LIMITS.minDim || a > LIMITS.maxDim) throw new KErr('value.out_of_range', { field, value: v, min: LIMITS.minDim, max: LIMITS.maxDim });
    return v;
  }
  coord(v, field) { if (!Number.isFinite(v) || Math.abs(v) > MAX_COORD) throw new KErr('value.out_of_range', { field, value: v, min: -MAX_COORD, max: MAX_COORD }); return v; }

  resolvePlane(spec, state, ctx) {
    if (!spec || typeof spec !== 'object') throw new KErr('sketch.plane_unknown');
    if (spec.kind === 'base') { if (!V.BASE_PLANES[spec.name]) throw new KErr('sketch.plane_unknown'); return V.basePlane(spec.name, spec.offsetVal || 0); }
    if (spec.kind === 'face') {
      if (!spec.ref) throw new KErr('sketch.plane_ref_missing');
      const { body, i } = this.resolveIdx(spec.ref, state, 'face', ctx);
      const face = TP.faceWrap(TP.topoOf(body.shape).faces.list[i]);
      if (face.geomType !== 'PLANE') throw new KErr('sketch.plane_not_planar');
      return V.planeFromNormal(face.normalAt(face.center).toTuple(), face.center.toTuple());
    }
    throw new KErr('sketch.plane_unknown');
  }

  // ---- seçim (Ref) çözümü: yalnız ADA göre (F-01) ----
  // Ref = {body, kind, name, hint:{fp, geom, idx, n}}; eski biçim {body, idx, n, fp, geom} yalnız birebir tutarsa yükseltilir.
  resolveIdx(ref, state, kind, ctx) {
    if (!ref || typeof ref !== 'object') throw new KErr('ref.unnamed');
    if (ref.kind && ref.kind !== kind) throw new KErr('ref.wrong_kind', { want: kind, got: String(ref.kind) });
    const body = state.bodies.get(ref.body); if (!body) throw new KErr('ref.body_missing', { body: String(ref.body) });
    if (ref.name !== undefined) {
      if (ref.name === null) throw new KErr(ref.nameError === 'ref.ambiguous_here' ? 'ref.ambiguous_here' : 'ref.unnamed');
      const i = resolveName(body, kind, ref.name, ref.hint);
      // ek güvenlik (yedek DEĞİL, yalnız ret): ad tek elemana çözüldü ama geometri türü değiştiyse (ör. kimliği yeniden
      // kullanılmış başka bir sketch varlığı) seçim kabul edilmez
      if (ref.hint && typeof ref.hint.geom === 'string') { const T = TP.topoOf(body.shape); const el = kind === 'face' ? TP.faceWrap(T.faces.list[i]) : TP.edgeWrap(T.edges.list[i]); if (el.geomType !== ref.hint.geom) throw new KErr('ref.changed', { was: ref.hint.geom, now: el.geomType }); }
      return { body, i };
    }
    return { body, i: this.legacy(ref, body, kind, ctx) };
  }
  legacy(ref, body, kind, ctx) {
    const mk = `${ctx?.feature ?? ''}|${kind}|${JSON.stringify(ref)}`;
    const memo = this.upgrades.get(mk);
    if (memo) { ctx?.upgrades?.push({ ...memo.rec }); return resolveName(body, kind, memo.name, memo.hint); }
    const T = TP.topoOf(body.shape); const list = kind === 'face' ? T.faces : T.edges;
    const fail = () => new KErr(kind === 'face' ? 'ref.lost_face' : 'ref.lost_edge', { hint: Array.isArray(ref.fp) ? ref.fp.map((x) => Math.round(x * 1000) / 1000).join(', ') : '' });
    if (!Number.isInteger(ref.idx) || ref.n !== list.size || !list.list[ref.idx] || !Array.isArray(ref.fp) || typeof ref.geom !== 'string') throw fail();
    const el = kind === 'face' ? TP.faceWrap(list.list[ref.idx]) : TP.edgeWrap(list.list[ref.idx]);
    const fp = elemCenter(el, kind); const tol = 1e-6 * Math.max(10, ...ref.fp.map(Math.abs));
    if (el.geomType !== ref.geom || !(V.dist(fp, ref.fp) <= tol)) throw fail();
    const nm = kind === 'face' ? faceName(body, ref.idx) : edgeName(body, ref.idx);
    if (nm.error) throw new KErr(nm.error);
    const hint = { fp, geom: el.geomType, idx: ref.idx, n: list.size };
    const rec = { feature: ctx?.feature ?? null, field: ctx?.field ?? null, index: ctx?.index ?? null, ref: { body: ref.body, kind, name: nm, hint } };
    this.upgrades.set(mk, { name: nm, hint, rec }); ctx?.upgrades?.push({ ...rec });
    return ref.idx;
  }
  // testler/arayüz için: Ref → replicad yüz/kenar sarmalayıcısı
  resolveRef(ref, state, kind, ctx) { const { body, i } = this.resolveIdx(ref, state, kind, ctx); const T = TP.topoOf(body.shape); return kind === 'face' ? TP.faceWrap(T.faces.list[i]) : TP.edgeWrap(T.edges.list[i]); }

  // "Tümü" uzunluğu: tüm gövdeleri aşacak kadar (model boyutuna göre, F-11)
  bigLen(state, o) {
    let L = 10;
    for (const b of state.bodies.values()) { const [lo, hi] = b.shape.boundingBox.bounds; for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) L = Math.max(L, V.dist([x, y, z], o)); }
    return 2 * L + 10;
  }

  // ---- boolean işlem (parçalar adlarıyla) ----
  applyOp(state, parts, op, c) {
    if (!OPS.has(op)) throw new KErr('op.unknown', { op: String(op) });
    if (!parts.length) throw new KErr('sketch.no_profile');
    const newBody = () => { const p = parts.length > 1 ? TP.boolean('fuse', [parts[0]], parts.slice(1)) : parts[0]; if (!p) throw new KErr('op.failed'); const id = uniqueId(state, c.id); state.bodies.set(id, { shape: p.shape, fn: p.fn, name: c.name || { code: 'n', params: { n: state.bodies.size + 1 } } }); return [id]; };
    if (op === 'new') return newBody();
    const explicit = Array.isArray(c.targets) && c.targets.length;
    if (explicit && c.targets.some((t) => !state.bodies.has(t))) throw new KErr('op.no_target');
    const tb = unionBox(parts.map((p) => p.shape));
    const ids = explicit ? [...new Set(c.targets)] : [...state.bodies.keys()].filter((id) => !boxOut(state.bodies.get(id).shape.boundingBox.bounds, tb));
    if (!ids.length) { if (op === 'join' && !explicit) return newBody(); throw new KErr(op === 'cut' ? 'op.cut_no_body' : op === 'join' ? 'op.no_target' : 'op.intersect_no_body'); }
    if (op === 'join') {
      const t0 = state.bodies.get(ids[0]); const others = ids.slice(1).map((id) => state.bodies.get(id));
      const v0 = [t0, ...others].reduce((s, b) => s + TP.volume(b.shape), 0);
      const res = TP.boolean('fuse', [t0], [...others, ...parts]); if (!res || isEmpty(res.shape)) throw new KErr('op.failed');
      if (!(TP.volume(res.shape) > v0 + volTol(v0))) throw new KErr('op.no_effect');
      for (const id of ids.slice(1)) state.bodies.delete(id);
      state.bodies.set(ids[0], { ...t0, shape: res.shape, fn: res.fn }); return [ids[0]];
    }
    const made = [];
    for (const id of ids) {
      const b = state.bodies.get(id); const v0 = TP.volume(b.shape);
      const res = TP.boolean(op === 'cut' ? 'cut' : 'common', [b], parts); if (!res) throw new KErr('op.failed');
      if (isEmpty(res.shape)) throw new KErr(op === 'cut' ? 'op.cut_empty' : 'op.intersect_empty');
      const v1 = TP.volume(res.shape);
      if (Math.abs(v1 - v0) <= volTol(v0)) continue; // bu gövdeye değmedi: değiştirme
      state.bodies.set(id, { ...b, shape: res.shape, fn: res.fn }); made.push(id);
    }
    if (!made.length && op === 'cut') throw new KErr('op.no_effect');
    if (!made.length && op === 'intersect') return ids; // değişmeyen kesişim: gövde zaten takım içinde
    return made;
  }

  // ---- sketch tabanlı takımlar ----
  regions(f, S) {
    return sketchFaces(S.sk, S.plane, f.profiles);
  }
  // extrude/revolve parçaları: her bölge için {shape, fn} (yan yüz: side:<varlık>, kapaklar start/end)
  sweepParts(f, S, regs, sweep, sideRole) {
    const multi = regs.length > 1; const sc = sketchScale(S);
    return regs.map((r) => {
      const res = sweep(r.face); if (!res) throw new KErr(f.type === 'revolve' ? 'revolve.failed' : 'extrude.failed');
      const n = TP.topoOf(res.shape).faces.size; const fn = Array.from({ length: n }, () => []);
      const suf = multi && r.sig ? ':' + r.sig : '';
      if (res.first >= 0) fn[res.first] = [`${f.id}:start${suf}`];
      if (res.last >= 0) fn[res.last] = [`${f.id}:end${suf}`];
      res.edges.forEach((e, k) => { const seg = matchSeg(r.segs, TP.edgeMid(e), sc); if (!seg || seg.ent == null) return; for (const gi of res.gens[k]) fn[gi] = [`${f.id}:${sideRole}:${seg.ent}`]; });
      return { shape: res.shape, fn };
    });
  }

  // ---- özellikler ----
  runFeature(f, state, vars, ctx) {
    const N = (e, l) => this.num(e, vars, l);
    switch (f.type) {
      case 'sketch': {
        let spec = f.plane;
        if (spec?.kind === 'base') spec = { ...spec, offsetVal: this.coord(N(spec.offset ?? 0, tk('ef.offset')), tk('ef.offset')) };
        const plane = this.resolvePlane(spec, state, { ...ctx, field: 'plane' });
        if (!Array.isArray(f.ents) || !f.points || typeof f.points !== 'object') throw new KErr('sketch.no_profile');
        state.sketches.set(f.id, { plane, sk: { points: f.points, ents: f.ents } });
        return [];
      }
      case 'extrude': {
        const S = state.sketches.get(f.sketch); if (!S) throw new KErr('sketch.not_found');
        const op = f.op ?? 'new'; if (!OPS.has(op)) throw new KErr('op.unknown', { op: String(op) });
        const dir = f.dir ?? 'one'; if (!['one', 'sym', 'two'].includes(dir)) throw new KErr('extrude.dir_unknown');
        const extent = f.extent ?? 'dist'; if (!['dist', 'all'].includes(extent)) throw new KErr('extrude.extent_unknown');
        let d = extent === 'all' ? this.bigLen(state, S.plane.o) : N(f.dist, tk('ef.dist'));
        if (Math.abs(d) < 1e-12) throw new KErr('extrude.zero_dist');
        if (extent !== 'all') this.dim(d, tk('ef.dist'), { allowNeg: dir === 'one' });
        // F-03: ters çevir iki mesafeyi birlikte çevirir. one: [0,d]; sym: [-d/2,d/2]; two: [-d2, d] (flip: [-d, d2])
        let lo, hi;
        if (dir === 'sym') { lo = -d / 2; hi = d / 2; }
        else if (dir === 'two') {
          const d2 = N(f.dist2 ?? 0, tk('ef.dist2')); this.dim(d2, tk('ef.dist2'), { allowZero: true });
          lo = -d2; hi = d; if (f.flip) { lo = -d; hi = d2; }
        } else { lo = Math.min(0, f.flip ? -d : d); hi = Math.max(0, f.flip ? -d : d); }
        if (!(hi - lo > 1e-12)) throw new KErr('extrude.zero_dist');
        // tek yönde ters (negatif) değer: başlangıç kapağı sketch düzleminde kalsın
        const fwd = dir === 'one' ? ((f.flip ? -d : d) > 0) : true;
        // simetrik/iki yön: profil yüzü doğrudan başlangıç ofsetinde kurulur (kenar→varlık eşlemesi aynı konumda kalsın)
        const off = dir === 'one' ? 0 : lo; const len = dir === 'one' ? (fwd ? hi : lo) : hi - lo;
        const regs = sketchFaces(S.sk, S.plane, f.profiles, off);
        const parts = this.sweepParts(f, S, regs, (face) => TP.prism(face, V.mul(S.plane.n, len)), 'side');
        state.tools.set(f.id, { parts, op, targets: f.targets });
        return this.applyOp(state, parts, op, { id: f.id, name: f.bodyName, targets: f.targets });
      }
      case 'revolve': {
        const S = state.sketches.get(f.sketch); if (!S) throw new KErr('sketch.not_found');
        const op = f.op ?? 'new'; if (!OPS.has(op)) throw new KErr('op.unknown', { op: String(op) });
        const ang = N(f.angle ?? 360, tk('ef.angle'));
        if (!(Math.abs(ang) > 1e-9 && Math.abs(ang) <= 360 + 1e-9)) throw new KErr('revolve.angle_range', { value: ang }); // F-06, F-14
        let c2, d2;
        if (f.axis?.kind === 'line') {
          const e = S.sk.ents.find((x) => x.id === f.axis.ent); if (!e || e.type !== 'line') throw new KErr('revolve.axis_missing');
          const a = S.sk.points[e.a], b = S.sk.points[e.b]; if (!a || !b) throw new KErr('revolve.axis_missing');
          if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) throw new KErr('revolve.axis_zero');
          c2 = [a.x, a.y]; d2 = [(b.x - a.x) / Math.hypot(b.x - a.x, b.y - a.y), (b.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y)];
        } else if (f.axis?.kind === 'sketchX') { c2 = [0, 0]; d2 = [1, 0]; }
        else if (f.axis?.kind === 'sketchY') { c2 = [0, 0]; d2 = [0, 1]; }
        else throw new KErr('revolve.axis_missing'); // F-12: eksik eksen varsayılana düşmez
        const c = V.toWorld(S.plane, c2[0], c2[1]); const dir = V.norm(V.sub(V.toWorld(S.plane, c2[0] + d2[0], c2[1] + d2[1]), c));
        const regs = this.regions(f, S);
        // profil ekseni kesmemeli (kendini kesen katı olur)
        let mn = Infinity, mx = -Infinity;
        for (const r of regs) for (const p of [...r.poly, ...r.holes.flatMap((h) => h.poly)]) { const s = (p[0] - c2[0]) * d2[1] - (p[1] - c2[1]) * d2[0]; mn = Math.min(mn, s); mx = Math.max(mx, s); }
        const et = 1e-7 * sketchScale(S); if (mn < -et && mx > et) throw new KErr('revolve.crosses_axis');
        const full = Math.abs(Math.abs(ang) - 360) < 1e-9;
        const parts = this.sweepParts(f, S, regs, (face) => { const r = TP.revol(face, c, dir, full ? 360 : ang); if (r && full) { r.first = -1; r.last = -1; } return r; }, 'rev');
        state.tools.set(f.id, { parts, op, targets: f.targets });
        return this.applyOp(state, parts, op, { id: f.id, name: f.bodyName, targets: f.targets });
      }
      case 'hole': return this.hole(f, state, N);
      case 'fillet': case 'chamfer': {
        const isF = f.type === 'fillet';
        const val = N(isF ? f.r : f.d, isF ? tk('ef.radius') : tk('ef.dist'));
        if (!(val > 0)) throw new KErr('fc.value_positive'); this.dim(val, isF ? tk('ef.radius') : tk('ef.dist'));
        if (!Array.isArray(f.edges) || !f.edges.length) throw new KErr('fc.no_edges');
        const byBody = new Map();
        f.edges.forEach((r, k) => { const { body, i } = this.resolveIdx(r, state, 'edge', { ...ctx, field: 'edges', index: k }); const bid = r.body; if (!byBody.has(bid)) byBody.set(bid, { body, sel: new Map() }); const nm = edgeName(body, i); byBody.get(bid).sel.set(i, nm.error ? `#${k}` : `<${nm.a}&${nm.b}${nm.nb ? '|' + nm.nb.join('|') : ''}>`); });
        for (const [bid, { body, sel }] of byBody) {
          let res = null;
          try { res = TP.edgeBlend(f.type, body, [...sel.keys()], val, (j) => `${f.id}:${isF ? 'blend' : 'cham'}${sel.get(j)}`, (k) => { const vk = vertKey(body, k); return vk ? `${f.id}:${isF ? 'vblend' : 'vcham'}${vk}` : `${f.id}:v?`; }); } catch (e) { res = null; }
          if (!res || isEmpty(res.shape)) throw new KErr(isF ? 'fillet.too_big' : 'chamfer.too_big');
          state.bodies.set(bid, { ...body, shape: res.shape, fn: res.fn });
        }
        return [...byBody.keys()];
      }
      case 'shell': {
        const t = N(f.t, tk('ef.thickness')); if (!(t > 0)) throw new KErr('shell.thickness_positive'); this.dim(t, tk('ef.thickness'));
        if (!Array.isArray(f.faces) || !f.faces.length) throw new KErr('shell.no_faces');
        const byBody = new Map();
        f.faces.forEach((r, k) => { const { body, i } = this.resolveIdx(r, state, 'face', { ...ctx, field: 'faces', index: k }); if (!byBody.has(r.body)) byBody.set(r.body, { body, sel: new Set() }); byBody.get(r.body).sel.add(i); });
        for (const [bid, { body, sel }] of byBody) {
          if (sel.size >= TP.topoOf(body.shape).faces.size) throw new KErr('shell.failed');
          let res = null;
          try { res = TP.shell(body, [...sel], t, (kind, i) => { const k = kind === 'f' ? faceKey(body, i) : kind === 'v' ? vertKey(body, i) : null; return k ? `${f.id}:inner(${kind}:${k})` : `${f.id}:inner?`; }); } catch (e) { res = null; }
          if (!res || isEmpty(res.shape)) throw new KErr('shell.failed');
          // OCCT bazı geometrilerde sessizce aynı gövdeyi döndürür; hacim değişmediyse başarısız say
          const v0 = TP.volume(body.shape), v1 = TP.volume(res.shape);
          if (!(Math.abs(v1 - v0) > 1e-6 * Math.max(1, v0))) throw new KErr('shell.no_change');
          state.bodies.set(bid, { ...body, shape: res.shape, fn: res.fn });
        }
        return [...byBody.keys()];
      }
      case 'primitive': {
        const p = [N(f.x ?? 0, tk('ef.x')), N(f.y ?? 0, tk('ef.y')), N(f.z ?? 0, tk('ef.z'))].map((x, i) => this.coord(x, ['ef.x', 'ef.y', 'ef.z'][i]));
        const op = f.op ?? 'new'; if (!OPS.has(op)) throw new KErr('op.unknown', { op: String(op) });
        let s, fn;
        if (f.kind === 'box') {
          const w = N(f.w, tk('ef.width')), d = N(f.d, tk('ef.depth')), h = N(f.h, tk('ef.height'));
          if (!(w > 0 && d > 0 && h > 0)) throw new KErr('prim.dims_positive');
          this.dim(w, tk('ef.width')); this.dim(d, tk('ef.depth')); this.dim(h, tk('ef.height'));
          s = R.makeBox([p[0], p[1], p[2]], [p[0] + w, p[1] + d, p[2] + h]);
          const ctr = [p[0] + w / 2, p[1] + d / 2, p[2] + h / 2];
          fn = TP.topoOf(s).faces.list.map((raw) => { const c = TP.faceWrap(raw).center.toTuple(); const q = [(c[0] - ctr[0]) / w, (c[1] - ctr[1]) / d, (c[2] - ctr[2]) / h]; const a = q.map(Math.abs); const k = a.indexOf(Math.max(...a)); return [`${f.id}:${'xyz'[k]}${q[k] > 0 ? '+' : '-'}`]; });
        } else if (f.kind === 'cylinder') {
          const r = N(f.dia, tk('ef.dia')) / 2, h = N(f.h, tk('ef.height')); if (!(r > 0 && h > 0)) throw new KErr('prim.dims_positive');
          this.dim(2 * r, tk('ef.dia')); this.dim(h, tk('ef.height'));
          const ax = AX[f.axis ?? 'Z']; if (!ax) throw new KErr('prim.axis_unknown');
          s = R.makeCylinder(r, h, p, ax);
          fn = TP.topoOf(s).faces.list.map((raw) => { const F = TP.faceWrap(raw); if (F.geomType !== 'PLANE') return [`${f.id}:side`]; const c = F.center.toTuple(); return [V.dot(V.sub(c, p), ax) > h / 2 ? `${f.id}:top` : `${f.id}:bottom`]; });
        } else if (f.kind === 'sphere') {
          const r = N(f.dia, tk('ef.dia')) / 2; if (!(r > 0)) throw new KErr('prim.dia_positive'); this.dim(2 * r, tk('ef.dia'));
          s = R.makeSphere(r); const moved = TP.transform({ shape: s, fn: TP.topoOf(s).faces.list.map(() => [`${f.id}:side`]) }, [{ t: p }]); s = moved.shape; fn = moved.fn;
        } else throw new KErr('prim.unknown');
        const parts = [{ shape: s, fn }];
        state.tools.set(f.id, { parts, op, targets: f.targets });
        return this.applyOp(state, parts, op, { id: f.id, name: f.bodyName, targets: f.targets });
      }
      case 'combine': {
        const op = f.op; if (!['join', 'cut', 'intersect'].includes(op)) throw new KErr('op.unknown', { op: String(op) }); // F-12
        const tgt = state.bodies.get(f.target); if (!tgt) throw new KErr('combine.no_target');
        if (!Array.isArray(f.tools) || !f.tools.length) throw new KErr('combine.no_tools');
        if (f.tools.includes(f.target)) throw new KErr('combine.self'); // F-13
        const tools = [...new Set(f.tools)].map((id) => { const b = state.bodies.get(id); if (!b) throw new KErr('combine.tool_missing'); return b; });
        const v0 = TP.volume(tgt.shape);
        const res = TP.boolean(op === 'join' ? 'fuse' : op === 'cut' ? 'cut' : 'common', [tgt], tools);
        if (!res || isEmpty(res.shape)) throw new KErr('combine.empty');
        const v1 = TP.volume(res.shape);
        if (op === 'cut' && !(Math.abs(v0 - v1) > volTol(v0))) throw new KErr('op.no_effect');
        state.bodies.set(f.target, { ...tgt, shape: res.shape, fn: res.fn });
        if (!f.keepTools) for (const id of f.tools) state.bodies.delete(id);
        return [f.target];
      }
      case 'move': {
        if (!Array.isArray(f.bodies) || !f.bodies.length) throw new KErr('body_missing');
        const ang = N(f.angle ?? 0, tk('ef.angle'));
        const steps = [];
        if (Math.abs(ang) > 1e-12) { const ax = AX[f.axis ?? 'Z']; if (!ax) throw new KErr('prim.axis_unknown'); steps.push({ rot: { c: [N(f.cx ?? 0, tk('ef.x')), N(f.cy ?? 0, tk('ef.y')), N(f.cz ?? 0, tk('ef.z'))].map((x) => this.coord(x, 'ef.x')), ax, deg: ang } }); }
        const t = [N(f.dx ?? 0, tk('ef.x')), N(f.dy ?? 0, tk('ef.y')), N(f.dz ?? 0, tk('ef.z'))].map((x) => this.coord(x, 'ef.x'));
        if (V.len(t) > 1e-12) steps.push({ t });
        const made = [];
        for (const id of f.bodies) {
          const b = state.bodies.get(id); if (!b) throw new KErr('body_missing');
          if (!steps.length && !f.copy) { made.push(id); continue; }
          const pre = f.copy ? `${f.id}[c]` : '';
          const m = TP.transform(b, steps, pre ? (n) => pre + n : null); // F-09: kaynak şekil korunur
          this.moveHoles(state, b, steps, pre);
          if (f.copy) { const nid = uniqueId(state, f.id); state.bodies.set(nid, { shape: m.shape, fn: m.fn, name: { code: 'copy', params: { base: b.name } } }); made.push(nid); }
          else { state.bodies.set(id, { ...b, shape: m.shape, fn: m.fn }); made.push(id); }
        }
        return made;
      }
      case 'pattern': case 'mirror': return this.pattern(f, state, N);
      case 'import': {
        const ent = this.imports.get(importKey(f, this.hashes));
        if (!ent || ent.error) throw new KErr('import.load_failed', { reason: ent?.error || 'no_data' });
        const ids = [];
        ent.solids.forEach((s, si) => {
          const fn = TP.topoOf(s).faces.list.map((raw, k) => { let g = '?'; try { g = TP.faceWrap(raw).geomType; } catch (e) { /* */ } return [`${f.id}:i${si}.${k}:${g}`]; });
          const id = uniqueId(state, f.id); state.bodies.set(id, { shape: s, fn, name: bodyNum(f.name || { code: 'import' }, ent.solids.length > 1 ? si + 1 : 0) }); ids.push(id);
        });
        return ids;
      }
      default: throw new KErr('feature.unknown', { type: String(f.type) });
    }
  }

  hole(f, state, N) {
    const S = state.sketches.get(f.sketch); if (!S) throw new KErr('hole.no_sketch');
    const P = S.sk.points;
    let src = S.sk.ents.filter((e) => e.type === 'point' && P[e.p]).map((e) => ({ pid: String(e.id), p: P[e.p] }));
    if (!src.length) src = S.sk.ents.filter((e) => e.type === 'circle' && !e.cons && P[e.c]).map((e) => ({ pid: String(e.id), p: P[e.c] }));
    if (!src.length) throw new KErr('hole.no_positions');
    const kind = f.kind ?? 'simple'; if (!['simple', 'cbore', 'csink'].includes(kind)) throw new KErr('hole.kind_unknown');
    const dia = N(f.dia, tk('ef.dia')); if (!(dia > 0)) throw new KErr('hole.dia_positive'); this.dim(dia, tk('ef.dia'));
    const r = dia / 2; const through = f.extent === 'all';
    const depth = through ? this.bigLen(state, S.plane.o) : this.dim(N(f.depth, tk('ef.depth')), tk('ef.depth'));
    const tipA = N(f.tipAngle ?? 118, tk('ef.tip_angle')); if (!(tipA > 0 && tipA <= 180)) throw new KErr('hole.tip_angle', { value: tipA });
    const tip = !through && tipA < 179.9 ? r / Math.tan((tipA * Math.PI) / 360) : 0;
    // profil (yarıçap, derinlik) ve kenar rolleri
    const prof = [[0, 0]]; const roles = ['top'];
    if (kind === 'cbore') {
      const cr = this.dim(N(f.cboreDia, tk('ef.cbore_dia')), tk('ef.cbore_dia')) / 2, cd = this.dim(N(f.cboreDepth, tk('ef.cbore_depth')), tk('ef.cbore_depth'));
      if (cr <= r) throw new KErr('hole.cbore_dia'); if (!through && cd >= depth) throw new KErr('hole.cbore_depth');
      prof.push([cr, 0], [cr, cd], [r, cd]); roles.push('cbore', 'cbore-floor', 'wall');
    } else if (kind === 'csink') {
      const cr = this.dim(N(f.csinkDia, tk('ef.csink_dia')), tk('ef.csink_dia')) / 2, ca = N(f.csinkAngle ?? 90, tk('ef.csink_angle'));
      if (cr <= r) throw new KErr('hole.cbore_dia'); if (!(ca > 0 && ca < 180)) throw new KErr('hole.csink_angle', { value: ca });
      const h = (cr - r) / Math.tan((ca * Math.PI) / 360); if (!through && h >= depth) throw new KErr('hole.csink_depth');
      prof.push([cr, 0], [r, h]); roles.push('csink', 'wall');
    } else { prof.push([r, 0]); roles.push('wall'); }
    prof.push([r, depth]); roles.push('bottom'); if (tip > 0) { prof.push([0, depth + tip]); } else prof.push([0, depth]);
    roles.push('axis');
    const d = f.flip ? S.plane.n : V.mul(S.plane.n, -1);
    // aynı konumdaki noktalar tek delik (F-08: hayalet/yinelenen yazılmaz)
    const uniq = [];
    for (const q of src) { const w = V.toWorld(S.plane, this.coord(q.p.x, 'ef.x'), this.coord(q.p.y, 'ef.y')); if (!uniq.some((u) => V.dist(u.w, w) < 1e-6)) uniq.push({ ...q, w }); }
    const parts = [], pos = [];
    for (const u of uniq) {
      const pts = prof.map(([rr, z]) => V.add(V.add(u.w, V.mul(S.plane.x, rr)), V.mul(d, z)));
      const face = TP.makePolygon(pts);
      const rv = TP.revol(face, u.w, d, 360); if (!rv) throw new KErr('hole.failed');
      const fn = Array.from({ length: TP.topoOf(rv.shape).faces.size }, () => []);
      const segMid = prof.map((a, i) => { const b = prof[(i + 1) % prof.length]; return V.add(V.add(u.w, V.mul(S.plane.x, (a[0] + b[0]) / 2)), V.mul(d, (a[1] + b[1]) / 2)); });
      rv.edges.forEach((e, k) => { const m = TP.edgeMid(e); let bi = -1, bd = 1e-6 * Math.max(1, depth); segMid.forEach((s, i) => { const dd = V.dist(s, m); if (dd < bd) { bd = dd; bi = i; } }); if (bi < 0) return; for (const gi of rv.gens[k]) fn[gi] = [`${f.id}:${roles[bi]}:${u.pid}`]; });
      parts.push({ shape: rv.shape, fn });
      pos.push({ p: u.w, d, keys: roles.filter((x) => x !== 'axis' && x !== 'top').map((x) => `${f.id}:${x}:${u.pid}`) });
    }
    state.tools.set(f.id, { parts, op: 'cut', targets: f.targets });
    const made = this.applyOp(state, parts, 'cut', { id: f.id, targets: f.targets });
    // her konum malzemeye değmeli (F-08)
    const miss = pos.filter((q) => !made.some((id) => hasAny(state.bodies.get(id), q.keys)));
    if (miss.length) throw new KErr('hole.no_material', { n: miss.length, total: pos.length });
    // CAM'e aktarılacak delik verisi (O-008)
    state.holes.push({ feature: f.id, kind, dia, depth: through ? null : depth, through, tipAngle: tipA, thread: f.thread || null, pos });
    return made;
  }

  // delik konumlarını gövdeyle birlikte taşı/kopyala
  moveHoles(state, body, steps, pre) {
    const al = aliasSet(body); const add = [];
    state.holes = state.holes.map((h) => {
      let changed = false; const np = [];
      for (const q of h.pos) {
        if (!q.keys.some((k) => al.has(k))) { np.push(q); continue; }
        const moved = { p: TP.xformPoint(steps, q.p), d: TP.xformPoint(steps, q.d, true), keys: pre ? q.keys.map((k) => pre + k) : q.keys };
        if (pre) { np.push(q); add.push({ h, q: moved }); } else { np.push(moved); changed = true; }
      }
      return changed ? { ...h, pos: np } : h;
    });
    // kopyalar ayrı kayıt olarak eklenir
    const byH = new Map(); for (const { h, q } of add) { if (!byH.has(h)) byH.set(h, []); byH.get(h).push(q); }
    for (const [h, qs] of byH) state.holes.push({ ...h, feature: h.feature, copyOf: h.feature, pos: qs });
  }

  pattern(f, state, N) {
    const xs = [];
    if (f.type === 'mirror') {
      const pl = f.plane ?? 'XY'; if (!V.BASE_PLANES[pl]) throw new KErr('sketch.plane_unknown'); // F-12
      const P = V.basePlane(pl, this.coord(N(f.offset ?? 0, tk('ef.offset')), 'ef.offset'));
      xs.push({ inst: 'm', steps: [{ mirror: { o: P.o, n: P.n } }] });
    } else if (f.kind === 'circ') {
      const n = Math.round(N(f.count, tk('ef.count'))); const tot = N(f.total ?? 360, tk('ef.angle'));
      if (!(n >= 2)) throw new KErr('pattern.count_min'); if (n > LIMITS.maxPattern) throw new KErr('pattern.too_many', { n, max: LIMITS.maxPattern });
      if (!(Math.abs(tot) > 1e-9 && Math.abs(tot) <= 360 + 1e-9)) throw new KErr('pattern.angle_range', { value: tot });
      const ax = AX[f.axis ?? 'Z']; if (!ax) throw new KErr('prim.axis_unknown');
      const c = [N(f.cx ?? 0, tk('ef.x')), N(f.cy ?? 0, tk('ef.y')), N(f.cz ?? 0, tk('ef.z'))].map((x) => this.coord(x, 'ef.x'));
      const step = Math.abs(Math.abs(tot) - 360) < 1e-9 ? tot / n : tot / (n - 1);
      for (let i = 1; i < n; i++) xs.push({ inst: String(i), steps: [{ rot: { c, ax, deg: step * i } }] });
    } else if (f.kind === 'rect') {
      const n1 = Math.round(N(f.count1, tk('ef.count1'))), n2 = Math.round(N(f.count2 ?? 1, tk('ef.count2')));
      if (!(n1 >= 1 && n2 >= 1 && n1 * n2 >= 2)) throw new KErr('pattern.total_min');
      if (n1 * n2 > LIMITS.maxPattern) throw new KErr('pattern.too_many', { n: n1 * n2, max: LIMITS.maxPattern });
      const s1 = N(f.step1, tk('ef.step1')), s2 = N(f.step2 ?? 0, tk('ef.step2'));
      if (n1 > 1) this.dim(s1, tk('ef.step1'), { allowNeg: true }); if (n2 > 1) this.dim(s2, tk('ef.step2'), { allowNeg: true });
      const d1 = AX[f.dir1 ?? 'X'], d2 = AX[f.dir2 ?? 'Y']; if (!d1 || !d2) throw new KErr('prim.axis_unknown');
      for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) { if (!i && !j) continue; xs.push({ inst: `${i}.${j}`, steps: [{ t: V.add(V.mul(d1, s1 * i), V.mul(d2, s2 * j)) }] }); }
    } else throw new KErr('pattern.kind_unknown');
    const made = [];
    if (f.source?.kind === 'feature') {
      const T = state.tools.get(f.source.id); if (!T) throw new KErr('pattern.source_unsupported');
      const inst = []; // [{x, parts}]
      for (const x of xs) inst.push({ x, parts: T.parts.map((p) => TP.transform(p, x.steps, (n) => `${f.id}[${x.inst}]${n}`)) });
      const all = inst.flatMap((q) => q.parts);
      state.tools.set(f.id, { parts: all, op: T.op, targets: T.targets });
      if (T.op === 'new') { for (const q of inst) made.push(...this.applyOp(state, q.parts, 'new', { id: f.id })); }
      else {
        made.push(...this.applyOp(state, all, T.op, { id: f.id, targets: T.targets }));
        if (T.op === 'cut' || T.op === 'join') {
          // her örnek malzemeye değmeli (F-08): örneğin adlarından en az biri sonuçta kalmalı
          const seen = new Set(); for (const id of made) for (const a of aliasSet(state.bodies.get(id)).keys()) { const m = a.startsWith(f.id + '[') ? a.slice(f.id.length + 1, a.indexOf(']')) : null; if (m != null) seen.add(m); }
          const miss = xs.filter((x) => !seen.has(x.inst)).length; if (miss) throw new KErr('pattern.no_effect', { n: miss, total: xs.length });
        }
      }
      // F-07: delik verisi her örneğin gerçek konum ve yönüyle
      for (const h of state.holes.filter((hh) => hh.feature === f.source.id)) {
        const pos = []; for (const x of xs) for (const q of h.pos) pos.push({ p: TP.xformPoint(x.steps, q.p), d: TP.xformPoint(x.steps, q.d, true), keys: q.keys.map((k) => `${f.id}[${x.inst}]${k}`) });
        state.holes.push({ ...h, feature: f.id, patternOf: f.source.id, pos });
      }
      return made;
    }
    if (f.source?.kind !== 'body' || !Array.isArray(f.source.bodies) || !f.source.bodies.length) throw new KErr('pattern.no_source');
    for (const id of f.source.bodies) {
      const b = state.bodies.get(id); if (!b) throw new KErr('body_missing');
      const copies = xs.map((x) => ({ x, ...TP.transform(b, x.steps, (n) => `${f.id}[${x.inst}]${n}`) }));
      for (const c of copies) this.moveHoles(state, b, c.x.steps, `${f.id}[${c.x.inst}]`);
      if (f.join) {
        const res = TP.boolean('fuse', [b], copies); if (!res || isEmpty(res.shape)) throw new KErr('op.failed');
        state.bodies.set(id, { ...b, shape: res.shape, fn: res.fn }); made.push(id);
      } else copies.forEach((c, k) => { const nid = uniqueId(state, f.id); state.bodies.set(nid, { shape: c.shape, fn: c.fn, name: { code: 'pat', params: { base: b.name, n: k + 2 } } }); made.push(nid); });
    }
    return made;
  }

  // İçe aktarma: içerik özetine bağlı önbellek (F-02 / S-02)
  async loadImports(features) {
    const used = new Set();
    for (const f of features) {
      if (!f || f.type !== 'import') continue;
      const key = await importKeyAsync(f, this.hashes); if (!key) continue; used.add(key);
      if (this.imports.has(key)) continue;
      this.imports.set(key, await loadImport(f));
    }
    for (const k of [...this.imports.keys()]) if (!used.has(k)) this.imports.delete(k);
  }

  // ---- yeniden hesap ----
  // opts.onFeature({id, i, n, ok, cached, ms, sum, error?}): her işlem bitince (arayüzdeki güncelleme süpürmesi için)
  async rebuild(doc, opts = {}) {
    const empty = (code) => ({ bodies: [], status: {}, sketches: {}, vars: {}, paramErrors: { '#doc': { code, params: {} } }, holes: [], refUpgrades: [], docErrors: [{ code, params: {} }] });
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { this.last = { bodies: new Map(), sketches: new Map(), tools: new Map(), holes: [] }; this.cache = []; return empty('doc.invalid'); }
    if (!Array.isArray(doc.features)) { this.last = { bodies: new Map(), sketches: new Map(), tools: new Map(), holes: [] }; this.cache = []; return empty('doc.no_features'); }
    const feats = doc.features; const docErrors = [];
    await yieldTask(); // olay döngüsüne dön: bekleyen OCCT nesne sonlandırıcıları (FinalizationRegistry) çalışsın (F-20)
    await this.loadImports(feats);
    const { vars, errors: perr } = resolveParams(Array.isArray(doc.params) ? doc.params.filter((p) => p && typeof p === 'object') : []);
    const status = {}; const pkey = JSON.stringify(vars); const upgrades = [];
    const rb = doc.rollback; const end = rb == null || !Number.isFinite(rb) ? feats.length : Math.max(0, Math.min(Math.floor(rb), feats.length));
    let state = { bodies: new Map(), sketches: new Map(), tools: new Map(), holes: [], touch: new Map() };
    const newCache = []; let valid = true;
    // WP-02: işlem başına iz (status'tan ayrı; status biçimi ve önbellek eşitliği değişmez)
    // featInfo[id] = {ms, cached, changed, warn:[{code,params}], sum, lastOk:{rev}|null}
    const featInfo = {}; const rev = ++this.rev;
    for (let i = 0; i < end; i++) {
      const f = feats[i];
      if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !f.id) { docErrors.push({ code: 'feature.invalid', params: { index: i } }); valid = false; newCache.push(null); continue; }
      const key = pkey + '|' + featKey(f, this.hashes);
      const c = this.cache[i];
      if (valid && c && c.key === key) { state = cloneState(c.state); status[f.id] = c.status; upgrades.push(...c.upgrades); newCache.push(c); featInfo[f.id] = this.info(f.id, c, true); report(opts, f.id, i, end, status[f.id], featInfo[f.id]); continue; }
      valid = false; const fu = []; const t0 = now(); let sum;
      if (f.suppressed === true) { status[f.id] = { ok: true, suppressed: true }; sum = 'sup'; }
      else {
        const snap = cloneState(state);
        try {
          const made = this.runFeature(f, state, vars, { feature: f.id, upgrades: fu }) || [];
          // geçerlilik kapısı (F-05)
          for (const id of made) {
            const b = state.bodies.get(id); if (!b) continue; const why = TP.validity(b.shape); if (why) throw new KErr('geom.invalid', { body: id, reason: why });
            if (f.type === 'import') { const m = this.mesh(b); if (m.error || !meshOk(m)) throw new KErr('geom.invalid', { body: id, reason: 'mesh' }); }
            state.touch.set(id, f.id);
          }
          status[f.id] = { ok: true, bodies: made };
          sum = resultSum(f, snap, state);
          this.lastGood.set(f.id, { rev, input: snap, sum });
        } catch (e) { state = snap; status[f.id] = { ok: false, error: errOf(e) }; fu.length = 0; sum = 'err:' + status[f.id].error.code; }
      }
      upgrades.push(...fu);
      const warn = fu.length ? [{ code: 'ref.remapped', params: { n: fu.length } }] : [];
      const ce = { key, state: cloneState(state), status: status[f.id], upgrades: fu, ms: now() - t0, sum, warn };
      newCache.push(ce); featInfo[f.id] = this.info(f.id, ce, false);
      this.sums.set(f.id, sum);
      report(opts, f.id, i, end, status[f.id], featInfo[f.id]);
    }
    // önbellek: işaretçinin sağındaki kayıtlar, önek hiç değişmediyse saklanır (geri sar → sona git yeniden hesaplamaz)
    if (valid && end < feats.length) for (let i = end; i < this.cache.length; i++) newCache.push(this.cache[i]);
    this.cache = newCache; this.last = state;
    // belgede artık olmayan işlemlerin izi silinir
    const ids = new Set(feats.map((f) => f && f.id));
    for (const m of [this.sums, this.lastGood]) for (const k of [...m.keys()]) if (!ids.has(k)) m.delete(k);
    if (docErrors.length) perr['#doc'] = docErrors[0];
    const bodies = [];
    for (const [id, b] of state.bodies) {
      const m = this.mesh(b);
      if (m.error || !meshOk(m)) {
        // görüntü ağı üretilemedi/NaN: gövdeyi son değiştiren özellik açık hata verir (sessiz boş gövde yok)
        const fid = state.touch.get(id); if (fid && status[fid]) status[fid] = { ok: false, error: { code: 'geom.invalid', params: { body: id, reason: 'mesh' } } }; if (fid && featInfo[fid]) featInfo[fid].sum = 'err:geom.invalid';
        docErrors.push({ code: 'mesh.failed', params: { body: id } }); continue;
      }
      bodies.push({ id, name: typeof b.name === 'string' ? b.name : null, auto: typeof b.name === 'string' ? null : b.name, ...m });
    }
    const sketches = {};
    for (const [id, s] of state.sketches) sketches[id] = { plane: s.plane };
    const holes = holesOut(state);
    // T-05b: ice aktarilan (STEP) govdelerde delik ozelligi yok -> B-rep delik tanima (ozellik delikleriyle es eksenli olanlar atlanir)
    if (feats.some((f) => f && f.type === 'import' && !f.suppressed)) {
      const list = []; for (const bo of bodies) { const b = state.bodies.get(bo.id); try { list.push({ id: bo.id, groups: recognizeBody(b, this.mesh(b)) }); } catch (e) { docErrors.push({ code: 'hole.recognize_failed', params: { body: bo.id } }); } }
      const known = holes.flatMap((h) => h.positions.map((p, i) => [p, h.dirs[i]])).filter(([, d]) => d);
      const onAxis = (p, d) => known.some(([q, e]) => { const l = Math.hypot(...e); const u = e.map((x) => x / l); if (Math.abs(Math.abs(V.dot(u, d)) - 1) > 1e-6) return false; const w = V.sub(p, q); const t = V.dot(w, u); return Math.hypot(w[0] - u[0] * t, w[1] - u[1] * t, w[2] - u[2] * t) < 1e-3; });
      holes.push(...recognizedHoles(list, onAxis));
    }
    return { bodies, status, sketches, vars, paramErrors: perr, holes, refUpgrades: upgrades, docErrors, featInfo, rev };
  }
  // işlem izi: changed = sonuç özeti bir önceki hesaplamadakinden farklı (ilk hesapta false)
  info(id, ce, cached) {
    let changed = false;
    if (!cached) { const prev = this.sums.get(id); changed = prev !== undefined && prev !== ce.sum; }
    const lg = this.lastGood.get(id);
    return { ms: ce.ms ?? 0, cached, changed, warn: (ce.warn || []).map((w) => ({ ...w })), sum: ce.sum ?? null, lastOk: lg ? { rev: lg.rev } : null };
  }
  // son başarılı sonucun girdi durumu (onarım kipi için; dilim 5). Yoksa null.
  lastGoodState(id) { return this.lastGood.get(id)?.input || null; }

  mesh(b) { let m = this.meshCache.get(b.shape); if (!m) { try { m = meshBody(b); } catch (e) { m = { error: errOf(e) }; } this.meshCache.set(b.shape, m); } return m; }

  // ---- sorgular ----
  // ref: {body, idx} (görünümden gelen dizin) ya da adlı Ref. Döner: saklanacak Ref + ölçü bilgisi.
  describe(ref, kind) {
    const st = this.last; const body = st?.bodies.get(ref?.body); if (!body) throw new KErr('body_none');
    kind = kind || ref.kind;
    if (kind === 'body') return { body: ref.body, kind: 'body' };
    const T = TP.topoOf(body.shape); const list = kind === 'face' ? T.faces : T.edges;
    const i = ref.name ? resolveName(body, kind, ref.name, ref.hint) : ref.idx;
    if (!Number.isInteger(i) || !list.list[i]) throw new KErr('elem_none');
    const el = kind === 'face' ? TP.faceWrap(list.list[i]) : TP.edgeWrap(list.list[i]);
    const fp = elemCenter(el, kind); const nm = kind === 'face' ? faceName(body, i) : edgeName(body, i);
    const out = { body: ref.body, kind, name: nm.error ? null : nm, hint: { fp, geom: el.geomType, idx: i, n: list.size }, idx: i, n: list.size, fp, geom: el.geomType };
    if (nm.error) out.nameError = nm.error;
    if (kind === 'face') {
      out.area = R.measureArea(el);
      if (el.geomType === 'PLANE') out.normal = el.normalAt(el.center).toTuple();
      if (el.geomType === 'CYLINDRE') { try { const surf = el.surface.wrapped; const cyl = surf.Cylinder(); out.radius = cyl.Radius(); const ax = cyl.Axis(); const l = ax.Location(), d = ax.Direction(); out.axis = { o: [l.X(), l.Y(), l.Z()], d: [d.X(), d.Y(), d.Z()] }; } catch (e) { /* */ } }
    } else {
      out.length = R.measureLength(el);
      try { out.start = el.startPoint.toTuple(); out.end = el.endPoint.toTuple(); } catch (e) { /* */ }
      if (el.geomType === 'CIRCLE') { try { const c = el._geomAdaptor().Circle(); out.radius = c.Radius(); const l = c.Location(); out.center = [l.X(), l.Y(), l.Z()]; } catch (e) { /* */ } }
    }
    return out;
  }
  queryEl(ref) {
    const body = this.last?.bodies.get(ref?.body); if (!body) throw new KErr('body_none');
    if (ref.kind === 'body') return body.shape;
    const T = TP.topoOf(body.shape); const list = ref.kind === 'face' ? T.faces : T.edges;
    const i = ref.name ? resolveName(body, ref.kind, ref.name, ref.hint) : ref.idx;
    if (!Number.isInteger(i) || !list.list[i]) throw new KErr('elem_none');
    return ref.kind === 'face' ? TP.faceWrap(list.list[i]) : TP.edgeWrap(list.list[i]);
  }
  facePlane(ref) {
    const face = this.queryEl({ ...ref, kind: 'face' });
    if (face.geomType !== 'PLANE') throw new KErr('face.not_planar');
    return V.planeFromNormal(face.normalAt(face.center).toTuple(), face.center.toTuple());
  }
  measure(a, b) {
    const sa = this.queryEl(a), sb = this.queryEl(b);
    const out = { distance: R.measureDistanceBetween(sa, sb) };
    const cen = (r, s) => (r.kind === 'body' ? R.measureShapeVolumeProperties(s).centerOfMass : elemCenter(s, r.kind));
    const da = a.kind === 'body' ? {} : this.describe(a, a.kind), db = b.kind === 'body' ? {} : this.describe(b, b.kind);
    if (da.normal && db.normal) {
      const na = (Math.acos(Math.max(-1, Math.min(1, V.dot(da.normal, db.normal)))) * 180) / Math.PI;
      out.normalAngle = na; out.angle = 180 - na; // F-23: iki yüz arası iç (dihedral) açı, dışa bakan normallerden [0,180]
      out.planeAngle = Math.min(na, 180 - na); // düzlemler arası açı [0,90]
    }
    const ca = cen(a, sa), cb = cen(b, sb);
    out.centerDistance = V.dist(ca, cb); out.delta = V.sub(cb, ca);
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
      const a = this.last?.bodies.get(ids[i]), b = this.last?.bodies.get(ids[j]); if (!a || !b) throw new KErr('body_none');
      if (a.shape.boundingBox.isOut(b.shape.boundingBox)) continue;
      const c = TP.boolean('common', [{ shape: a.shape, fn: [] }], [{ shape: b.shape, fn: [] }]);
      if (!c) throw new KErr('op.failed');
      const v = isEmpty(c.shape) ? 0 : TP.volume(c.shape); if (v > 1e-6) out.push({ a: ids[i], b: ids[j], volume: v });
    }
    return out;
  }
  // CAM geometri sorgulari (src/kernel/cam.js; son rebuild sonucuna gore)
  camFaceLoops(args) { return CAM.camFaceLoops(this, args || {}); }
  camSection(args) { return CAM.camSection(this, args || {}); }
  camHeightmap(args) { return CAM.camHeightmap(this, args || {}); }
  camZLevels(args) { return CAM.camZLevels(this, args || {}); }
  camHoleExit(args) { return CAM.camHoleExit(this, args || {}); }
  async exportFile(format, ids, names) {
    const shapes = [...(this.last?.bodies || [])].filter(([id]) => !ids || ids.includes(id));
    if (!shapes.length) throw new KErr('export.no_body');
    let blob;
    if (format === 'step') blob = R.exportSTEP(shapes.map(([id, b]) => ({ shape: b.shape, name: names?.[id] || (typeof b.name === 'string' ? b.name : id) })), { unit: 'MM', modelUnit: 'MM' });
    else if (format === 'stl') { const comp = shapes.length === 1 ? shapes[0][1].shape : R.makeCompound(shapes.map(([, b]) => b.shape)); blob = comp.blobSTL({ tolerance: 0.01, angularTolerance: 0.1, binary: true }); }
    else throw new KErr('export.format_unknown');
    return new Uint8Array(await blob.arrayBuffer());
  }
}

// ---- yardımcılar ----
// OCCT/WASM kaynaklı istisnalar (RuntimeError, WebAssembly.Exception, silinmiş nesne) → 'occt'
function errOf(e) { if (e instanceof KErr || (e && typeof e.code === 'string' && e.params)) return toErr(e); if (typeof WebAssembly !== 'undefined' && e instanceof WebAssembly.RuntimeError) return { code: 'occt', params: {} }; const t = toErr(e); return t.code === 'internal' && /deleted|WebAssembly|Exception|function signature|unreachable|memory access|Standard_|BindingError/i.test(t.params?.message || '') ? { code: 'occt', params: {} } : t; }
function elemCenter(el, kind) {
  if (kind === 'face') return el.center.toTuple();
  try { return el.pointAt(0.5).toTuple(); } catch (e) { const b = el.boundingBox.center; return [b[0], b[1], b[2]]; }
}
function uniqueId(state, base) { if (!state.bodies.has(base)) return base; let i = 2; while (state.bodies.has(base + '#' + i)) i++; return base + '#' + i; }
function cloneState(s) { return { bodies: new Map(s.bodies), sketches: new Map(s.sketches), tools: new Map(s.tools), holes: s.holes.slice(), touch: new Map(s.touch) }; }
function meshOk(m) { const v = m.vertices; if (!v || !v.length || !m.triangles?.length) return false; for (let i = 0; i < v.length; i++) if (!Number.isFinite(v[i])) return false; return true; }
function isEmpty(shape) { try { return !shape || shape.isNull || TP.topoOf(shape).faces.size === 0; } catch (e) { return true; } }
function bodyNum(base, n) { return n ? { code: 'num', params: { base, n } } : base; }
const volTol = (v) => 1e-9 * Math.max(1, Math.abs(v));
function unionBox(shapes) { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const s of shapes) { const [a, b] = s.boundingBox.bounds; for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], a[i]); hi[i] = Math.max(hi[i], b[i]); } } return [lo, hi]; }
function boxOut([a0, a1], [b0, b1], tol = 1e-7) { for (let i = 0; i < 3; i++) if (a1[i] < b0[i] - tol || b1[i] < a0[i] - tol) return true; return false; }
const hasAny = (body, keys) => { if (!body) return false; const al = aliasSet(body); return keys.some((k) => al.has(k)); };
function sketchScale(S) { let m = 1; for (const p of Object.values(S.sk.points || {})) if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) m = Math.max(m, Math.abs(p.x), Math.abs(p.y)); return m; }

function report(opts, id, i, n, st, fi) {
  if (typeof opts?.onFeature !== 'function') return;
  try { opts.onFeature({ id, i, n, ok: !!st?.ok, suppressed: !!st?.suppressed, error: st?.error || null, cached: fi.cached, ms: fi.ms, sum: fi.sum, warn: fi.warn }); } catch (e) { /* ilerleme bildirimi hesaplamayı bozmaz */ }
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// WP-02: işlem sonucu özeti. Aynı girdi → aynı metin; geometri değişince farklı metin.
// Sketch: düzlem + noktalar + varlıklar. Diğerleri: işlemin eklediği/değiştirdiği/sildiği gövdelerin imzası.
const r6 = (x) => (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : String(x));
const sigCache = new WeakMap();
function bodySig(b) {
  let s = sigCache.get(b.shape); if (s) return s;
  try {
    const T = TP.topoOf(b.shape); const [lo, hi] = b.shape.boundingBox.bounds; const v = TP.volume(b.shape);
    // konuma duyarlı bileşenler: ağırlık merkezi + yüzlerin alan ağırlıklı merkez toplamı ve ikinci momenti.
    // Model boyutuna göre nicemlenir (kayan nokta gürültüsü aynı geometride farklı özet üretmesin).
    const L = Math.max(1, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]));
    const q = (x, sc = L) => (Number.isFinite(x) ? Math.round(x / (1e-7 * sc)) : 'nan');
    let com = [NaN, NaN, NaN]; try { com = R.measureShapeVolumeProperties(b.shape).centerOfMass; } catch (e) { /* hacimsiz */ }
    let A = 0; const M = [0, 0, 0]; let M2 = 0;
    for (const raw of T.faces.list) {
      const F = TP.faceWrap(raw); let a = 0; try { a = R.measureArea(F); } catch (e) { a = 0; }
      const c = F.center.toTuple(); A += a; for (let i = 0; i < 3; i++) M[i] += a * c[i]; M2 += a * (c[0] * c[0] + c[1] * c[1] + c[2] * c[2]);
    }
    s = [T.faces.size, T.edges.size, ...lo.map(r6), ...hi.map(r6), Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : 'nan',
      ...com.map((x) => q(x)), q(A, L * L), ...M.map((x) => q(x, L * L * L)), q(M2, L * L * L * L)].join(',');
  } catch (e) { s = 'x'; }
  sigCache.set(b.shape, s); return s;
}
function resultSum(f, before, after) {
  if (f.type === 'sketch') { const S = after.sketches.get(f.id); return S ? 'sk:' + fnv(JSON.stringify([S.plane, S.sk.points, S.sk.ents], (k, v) => (typeof v === 'number' ? r6(v) : v))) : 'none'; }
  const out = [];
  for (const [id, b] of after.bodies) { const p = before.bodies.get(id); if (!p || p.shape !== b.shape) out.push(id + '=' + bodySig(b)); }
  for (const id of before.bodies.keys()) if (!after.bodies.has(id)) out.push(id + '=-');
  return 'b:' + fnv(out.sort().join(';'));
}
// 32 bit FNV-1a (özet karşılaştırması için; güvenlik amacı yok)
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
const yieldTask = () => new Promise((res) => (typeof setImmediate === 'function' ? setImmediate(res) : setTimeout(res, 0)));
// özellik önbellek anahtarı: içe aktarma verisi tam içerik özetiyle (F-02)
function featKey(f, hashes) { return JSON.stringify(f, (k, v) => (k === 'name' ? undefined : k === 'data' && typeof v === 'string' ? 'sha:' + (hashes.get(v) || '?') : v)); }
function importKey(f, hashes) { return typeof f.data === 'string' && f.data.length ? `${f.format}:${hashes.get(f.data)}` : null; }
async function sha256(s) {
  const bytes = new TextEncoder().encode(s);
  const h = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function importKeyAsync(f, hashes) {
  if (typeof f.data !== 'string' || !f.data.length) return null;
  if (!hashes.has(f.data)) { hashes.set(f.data, await sha256(f.data)); while (hashes.size > 16) hashes.delete(hashes.keys().next().value); }
  return importKey(f, hashes);
}
async function loadImport(f) {
  try {
    if (f.format !== 'step' && f.format !== 'stl') return { error: 'format' };
    let bin;
    try { bin = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0)); } catch (e) { return { error: 'base64' }; }
    if (!bin.length) return { error: 'empty' };
    const shape = f.format === 'stl' ? stlToSolid(bin) : await R.importSTEP(new Blob([bin]));
    const solids = TP.solidsOf(shape);
    if (!solids.length) return { error: 'no_solid' };
    for (const s of solids) { const why = TP.validity(s); if (why) return { error: 'invalid:' + why }; } // F-18
    return { solids };
  } catch (e) { return { error: e instanceof KErr ? e.code : 'parse' }; }
}
// STL → katı (F-17): üçgen yüzler dikilir (sewing), kapalı kabuk katıya çevrilir
function stlToSolid(bin) {
  const tris = parseSTL(bin); if (!tris.length) throw new KErr('import.stl_empty');
  if (tris.length > LIMITS.maxStlTris) throw new KErr('import.stl_too_big');
  const oc = R.getOC(); const r = TP.scope();
  try {
    const sew = r(new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false));
    for (const t of tris) { if (V.len(V.cross(V.sub(t[1], t[0]), V.sub(t[2], t[0]))) < 1e-12) continue; const f = TP.makePolygon(t); sew.Add(f.wrapped); }
    sew.Perform(r(new oc.Message_ProgressRange()));
    const sewn = TP.wrap(sew.SewedShape());
    const shells = new TP.SubIndex(sewn.wrapped, 'shell'); if (shells.size !== 1) { shells.list.forEach((x) => x.delete()); throw new KErr('import.stl_not_closed'); }
    const ms = r(new oc.BRepBuilderAPI_MakeSolid(r(oc.TopoDS.Shell(shells.list[0])))); shells.list.forEach((x) => x.delete());
    let solid = TP.wrap(ms.Solid());
    if (!(TP.volume(solid) > 0)) { const rev = solid.wrapped.Reversed(); solid = TP.wrap(rev); }
    try { const u = TP.unify(solid); if (Math.abs(TP.volume(u) - TP.volume(solid)) <= 1e-9 * Math.abs(TP.volume(solid))) solid = u; } catch (e) { /* birleştirilemezse üçgenli katı kalır */ }
    return solid;
  } finally { r.done(); }
}
function parseSTL(bin) {
  const head = new TextDecoder('latin1').decode(bin.subarray(0, Math.min(bin.length, 512)));
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  if (bin.length >= 84) { const n = dv.getUint32(80, true); if (84 + n * 50 === bin.length) { const out = []; for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; const t = []; for (let k = 0; k < 3; k++) t.push([dv.getFloat32(o + k * 12, true), dv.getFloat32(o + k * 12 + 4, true), dv.getFloat32(o + k * 12 + 8, true)]); if (t.flat().some((x) => !Number.isFinite(x))) throw new KErr('import.stl_bad'); out.push(t); } return out; } }
  if (/^\s*solid/i.test(head)) {
    const txt = new TextDecoder('latin1').decode(bin); const vs = [...txt.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    if (!vs.length || vs.length % 3 || vs.flat().some((x) => !Number.isFinite(x))) throw new KErr('import.stl_bad');
    const out = []; for (let i = 0; i < vs.length; i += 3) out.push([vs[i], vs[i + 1], vs[i + 2]]); return out;
  }
  throw new KErr('import.stl_bad');
}
function meshBody(b) {
  const bb = b.shape.boundingBox; const diag = Math.hypot(bb.width, bb.height, bb.depth) || 1;
  const tol = Math.max(0.005, diag / 2000); // F-11: üst sınırsız kıskaç yerine model boyutuna oranlı
  const mesh = b.shape.mesh({ tolerance: tol, angularTolerance: 0.25 });
  const edges = b.shape.meshEdges({ tolerance: tol, angularTolerance: 0.25 });
  const T = TP.topoOf(b.shape);
  const hmap = (list) => { const m = new Map(); list.forEach((x, i) => { const h = TP.hashOf(x); m.set(h, m.has(h) ? -1 : i); }); return m; }; // çakışan özet → seçilemez (-1), yanlış eleman değil
  const fh = hmap(T.faces.list), eh = hmap(T.edges.list);
  const volume = TP.volume(b.shape);
  return {
    vertices: new Float32Array(mesh.vertices), normals: new Float32Array(mesh.normals), triangles: new Uint32Array(mesh.triangles),
    faceGroups: mesh.faceGroups.map((g) => ({ start: g.start, count: g.count, idx: fh.get(g.faceId) ?? -1 })),
    lines: new Float32Array(edges.lines), edgeGroups: edges.edgeGroups.map((g) => ({ start: g.start, count: g.count, idx: eh.get(g.edgeId) ?? -1 })), bbox: bb.bounds, volume,
    nFaces: T.faces.size, nEdges: T.edges.size,
  };
}
// CAM'e giden delik verisi: yalnız son modelde gerçekten var olan konumlar (F-07/F-08)
function holesOut(state) {
  const sets = [...state.bodies].map(([id, b]) => [id, aliasSet(b)]);
  return state.holes.map((h) => {
    const positions = [], dirs = [], bodies = []; let lost = 0;
    for (const q of h.pos) {
      const ids = sets.filter(([, al]) => q.keys.some((k) => al.has(k))).map(([id]) => id);
      if (!ids.length) { lost++; continue; }
      positions.push(q.p); dirs.push(q.d); bodies.push(ids);
    }
    const out = { feature: h.feature, kind: h.kind, dia: h.dia, depth: h.depth, through: h.through, tipAngle: h.tipAngle, thread: h.thread, dir: dirs[0] || h.pos[0]?.d || null, positions, dirs, bodies, count: positions.length, lost };
    if (h.patternOf) out.patternOf = h.patternOf; if (h.copyOf) out.copyOf = h.copyOf;
    return out;
  });
}

export async function initKernel(ocFactory, locate) {
  const oc = await ocFactory(locate ? { locateFile: locate } : undefined);
  R.setOC(oc);
  return new Kernel();
}
