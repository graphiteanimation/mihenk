// WP-15: 3D islemler icin yuzey modeli (ucgen agi, setup cercevesinde) ve XY kova dizini. Saf JS.
// O-038: 3D temas (drop-cutter) kendi kodumuz; ag kaynagi cekirdegin mevcut API'si (export 'stl' quality 'fine', ya da rebuild
// goruntu agi). Cekirdege dokunulmaz.
// Model = { P: Float64Array (x,y,z; kaynaştirilmis kose), T: Uint32Array (ucgen kose indisleri), E: Uint32Array (benzersiz kenar
//   ciftleri), TE: Uint32Array (ucgen -> 3 kenar), bbox:{min,max}, tol (ag sapmasi, mm) }.
// SINIR: yalniz ustten (takim ekseni +Z) erisim; alt kesmeler (ters yuz) drop-cutter'da tavan olarak gorulur (dogru: 3 eksen).
import { cerr } from '../geom/err.js';

// setup cercevesine (o, x, y, z) donusum: q = [(p-o).x, (p-o).y, (p-o).z]
export function toFrame(frame, x, y, z) {
  if (!frame) return [x, y, z];
  const dx = x - frame.o[0], dy = y - frame.o[1], dz = z - frame.o[2];
  const f = frame;
  return [dx * f.x[0] + dy * f.x[1] + dz * f.x[2], dx * f.y[0] + dy * f.y[1] + dz * f.y[2], dx * f.z[0] + dy * f.z[1] + dz * f.z[2]];
}

// Ham koseler (Float32/64 Array, x,y,z) + ucgenler (indis; yoksa her 3 kose bir ucgen) -> model. Koseler 1e-6 ile kaynastirilir.
export function buildModel(verts, tris, { frame = null, tol = 0 } = {}) {
  const nvIn = Math.floor(verts.length / 3);
  if (!nvIn) throw cerr('cam.surf.no_mesh');
  const map = new Map(); const P = []; const remap = new Uint32Array(nvIn);
  const q = 1e6;
  for (let v = 0; v < nvIn; v++) {
    const p = toFrame(frame, verts[3 * v], verts[3 * v + 1], verts[3 * v + 2]);
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) throw cerr('cam.surf.bad_mesh');
    const key = Math.round(p[0] * q) + ',' + Math.round(p[1] * q) + ',' + Math.round(p[2] * q);
    let id = map.get(key); if (id === undefined) { id = P.length / 3; P.push(p[0], p[1], p[2]); map.set(key, id); }
    remap[v] = id;
  }
  const src = tris || Uint32Array.from({ length: nvIn - (nvIn % 3) }, (_, i) => i);
  const T = []; const emap = new Map(); const E = []; const TE = [];
  const NV = P.length / 3 + 1; const edge = (a, b) => { const k = a < b ? a * NV + b : b * NV + a; let e = emap.get(k); if (e === undefined) { e = E.length / 2; E.push(a < b ? a : b, a < b ? b : a); emap.set(k, e); } return e; };
  for (let t = 0; t + 2 < src.length; t += 3) {
    const a = remap[src[t]], b = remap[src[t + 1]], c = remap[src[t + 2]];
    if (a === b || b === c || a === c) continue; // dejenere
    T.push(a, b, c); TE.push(edge(a, b), edge(b, c), edge(c, a));
  }
  if (!T.length) throw cerr('cam.surf.no_mesh');
  const Pf = Float64Array.from(P);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < Pf.length; i += 3) for (let k = 0; k < 3; k++) { const v = Pf[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  return { P: Pf, T: Uint32Array.from(T), E: Uint32Array.from(E), TE: Uint32Array.from(TE), bbox: { min: mn, max: mx }, tol };
}

// Ikili ya da ASCII STL -> {verts: Float32Array, tris: null}
export function parseSTL(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length >= 84) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const n = dv.getUint32(80, true);
    if (84 + n * 50 === u8.length) {
      const out = new Float32Array(n * 9);
      for (let t = 0; t < n; t++) { const o = 84 + t * 50 + 12; for (let k = 0; k < 9; k++) out[t * 9 + k] = dv.getFloat32(o + 4 * k, true); }
      return { verts: out, tris: null };
    }
  }
  const txt = new TextDecoder().decode(u8); const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g; const v = []; let m;
  while ((m = re.exec(txt))) v.push(+m[1], +m[2], +m[3]);
  if (!v.length || v.length % 9) throw cerr('cam.surf.bad_mesh');
  return { verts: Float32Array.from(v), tris: null };
}

// XY kova dizini: her ucgen XY kutusunun degdigi kovalara yazilir. query(x0,y0,x1,y1, fn(t)) her ucgeni bir kez cagirir.
export class TriIndex {
  constructor(M, cell) {
    this.M = M; const { P, T } = M; const nt = T.length / 3;
    const b = M.bbox; const W = Math.max(1e-6, b.max[0] - b.min[0]), H = Math.max(1e-6, b.max[1] - b.min[1]);
    let cs = cell > 0 ? cell : Math.sqrt((W * H) / Math.max(1, nt)) * 2;
    if ((W / cs) * (H / cs) > 4e6) cs = Math.sqrt((W * H) / 4e6);
    this.cs = cs; this.x0 = b.min[0]; this.y0 = b.min[1]; this.nx = Math.max(1, Math.ceil(W / cs)); this.ny = Math.max(1, Math.ceil(H / cs));
    // ucgen verisi: kutu, en ust z, yukari normal ve duzlem (dik ucgende nz = 0)
    const D = new Float64Array(nt * 8); // [minx, miny, maxx, maxy, maxz, nx, ny, nz] ; duzlem d ayrica
    const Dd = new Float64Array(nt);
    const counts = new Uint32Array(this.nx * this.ny);
    const span = (t) => {
      const i0 = Math.max(0, Math.floor((D[t * 8] - this.x0) / cs)), i1 = Math.min(this.nx - 1, Math.floor((D[t * 8 + 2] - this.x0) / cs));
      const j0 = Math.max(0, Math.floor((D[t * 8 + 1] - this.y0) / cs)), j1 = Math.min(this.ny - 1, Math.floor((D[t * 8 + 3] - this.y0) / cs));
      return [i0, i1, j0, j1];
    };
    for (let t = 0; t < nt; t++) {
      const a = 3 * T[3 * t], c1 = 3 * T[3 * t + 1], c2 = 3 * T[3 * t + 2];
      const ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[c1], by = P[c1 + 1], bz = P[c1 + 2], cx = P[c2], cy = P[c2 + 1], cz = P[c2 + 2];
      D[t * 8] = Math.min(ax, bx, cx); D[t * 8 + 1] = Math.min(ay, by, cy); D[t * 8 + 2] = Math.max(ax, bx, cx); D[t * 8 + 3] = Math.max(ay, by, cy); D[t * 8 + 4] = Math.max(az, bz, cz);
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L; if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      if (nz < 1e-9) nz = 0;
      D[t * 8 + 5] = nx; D[t * 8 + 6] = ny; D[t * 8 + 7] = nz; Dd[t] = nx * ax + ny * ay + nz * az;
      const [i0, i1, j0, j1] = span(t); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) counts[j * this.nx + i]++;
    }
    const start = new Uint32Array(this.nx * this.ny + 1); for (let k = 0; k < counts.length; k++) start[k + 1] = start[k] + counts[k];
    const list = new Uint32Array(start[start.length - 1]); const fill = start.slice(0, -1);
    for (let t = 0; t < nt; t++) { const [i0, i1, j0, j1] = span(t); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) list[fill[j * this.nx + i]++] = t; }
    // kova ici ucgenler en ust z'ye gore azalan: drop-cutter eldeki en iyinin altina inince kovayi birakir
    for (let k = 0; k < counts.length; k++) { const seg = Array.from(list.subarray(start[k], start[k + 1])); seg.sort((a, b) => D[b * 8 + 4] - D[a * 8 + 4]); list.set(seg, start[k]); }
    this.start = start; this.list = list; this.D = D; this.Dd = Dd; this.nt = nt;
    this.stamp = new Uint32Array(nt); this.estamp = new Uint32Array(M.E.length / 2); this.q = 0;
    // kenar verisi: a(x,y,z), birim XY yon, XY boy, egim, en ust z
    const ne = M.E.length / 2; const ED = new Float64Array(ne * 8);
    for (let e = 0; e < ne; e++) {
      const a = 3 * M.E[2 * e], c = 3 * M.E[2 * e + 1];
      let ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[c], by = P[c + 1], bz = P[c + 2];
      const L = Math.hypot(bx - ax, by - ay);
      ED[e * 8] = ax; ED[e * 8 + 1] = ay; ED[e * 8 + 2] = az;
      if (L < 1e-9) { ED[e * 8 + 3] = 0; ED[e * 8 + 4] = 0; ED[e * 8 + 5] = 0; ED[e * 8 + 6] = 0; ED[e * 8 + 2] = Math.max(az, bz); }
      else { ED[e * 8 + 3] = (bx - ax) / L; ED[e * 8 + 4] = (by - ay) / L; ED[e * 8 + 5] = L; ED[e * 8 + 6] = (bz - az) / L; }
      ED[e * 8 + 7] = Math.max(az, bz);
    }
    this.ED = ED;
  }
  // kutuya degen kovalardaki ucgenler (tekrar yok)
  each(x0, y0, x1, y1, fn) {
    const cs = this.cs; const i0 = Math.max(0, Math.floor((x0 - this.x0) / cs)), i1 = Math.min(this.nx - 1, Math.floor((x1 - this.x0) / cs));
    const j0 = Math.max(0, Math.floor((y0 - this.y0) / cs)), j1 = Math.min(this.ny - 1, Math.floor((y1 - this.y0) / cs));
    if (i1 < i0 || j1 < j0) return;
    let q = ++this.q; if (q >= 4294967295) { this.stamp.fill(0); this.estamp.fill(0); this.q = q = 1; }
    const st = this.stamp, D = this.D, list = this.list, start = this.start;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * this.nx + i;
      for (let p = start[k], pe = start[k + 1]; p < pe; p++) {
        const t = list[p]; if (st[t] === q) continue; st[t] = q;
        if (D[t * 8 + 2] < x0 || D[t * 8] > x1 || D[t * 8 + 3] < y0 || D[t * 8 + 1] > y1) continue;
        fn(t);
      }
    }
  }
}

// Model kaynagi: (a) ctx.geom.surface (onceden kurulmus {P,T,...} ya da {verts, tris, frame?, tol}), (b) yoksa hata.
export function modelFromGeom(geom, frame) {
  const s = geom?.surface; if (!s) throw cerr('cam.surf.no_model');
  if (s.P && s.T && s.E) return s;
  if (s.verts) return buildModel(s.verts, s.tris || null, { frame: s.frame === undefined ? frame : s.frame, tol: s.tol || 0 });
  throw cerr('cam.surf.no_model');
}
