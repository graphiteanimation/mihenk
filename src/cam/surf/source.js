// WP-15: setup govdelerinin yuzey modeli (setup cercevesi). Kaynak sirasi: (1) cekirdek 'export' komutu (STL, quality 'fine':
// dogrusal tolerans kosegen x 2e-5, 0,001..0,01 mm; kernel.js exportFile), (2) yoksa rebuild goruntu agi (tolerans
// max(0,005, kosegen/2000); kernel.js meshBody). Cekirdege dokunulmaz; tolerans degerleri o dosyalardaki formullerin aynisidir ve
// ag sapmasi olarak takim ofsetine eklenir (oyma guvencesi). Onbellek: rebuild nesnesi basina (belge degisince yenilenir).
import { cerr } from '../geom/err.js';
import { buildModel, parseSTL } from './mesh.js';

const CACHE = new WeakMap();
const diagOf = (v) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { if (v[i + k] < mn[k]) mn[k] = v[i + k]; if (v[i + k] > mx[k]) mx[k] = v[i + k]; } return Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]); };

export async function surfaceForSetup(S, { rebuild, query }) {
  const key = JSON.stringify([S.bodies, S.frame]);
  let m = rebuild ? CACHE.get(rebuild) : null; if (rebuild && !m) { m = new Map(); CACHE.set(rebuild, m); }
  if (m?.has(key)) return m.get(key);
  let model = null;
  if (query) {
    try {
      const bytes = await query('export', { format: 'stl', ids: S.bodies, opts: { quality: 'fine' } });
      if (bytes && bytes.length > 84) { const { verts } = parseSTL(bytes); const tol = Math.min(0.01, Math.max(0.001, diagOf(verts) * 2e-5)); model = buildModel(verts, null, { frame: S.frame, tol }); }
    } catch (e) { model = null; }
  }
  if (!model) {
    const V = [], T = []; let tol = 0;
    for (const id of S.bodies) {
      const b = (rebuild?.bodies || []).find((x) => x.id === id); if (!b?.vertices?.length || !b.triangles?.length) continue;
      const o = V.length / 3; for (const v of b.vertices) V.push(v); for (const t of b.triangles) T.push(t + o);
      tol = Math.max(tol, Math.max(0.005, diagOf(b.vertices) / 2000));
    }
    if (!T.length) throw cerr('cam.surf.no_model');
    model = buildModel(V, T, { frame: S.frame, tol });
  }
  m?.set(key, model);
  return model;
}
