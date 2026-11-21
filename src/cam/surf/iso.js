// WP-15: dugum izgarasinda es-deger egrileri (marching squares). Ic (V > L) daima gidis yonunun SAGINDA kalir.
// cross(ka, kb) -> [x, y]: ka (ic degil) ile kb (ic) dugumleri arasindaki kesisim noktasi (cagiran kesinlestirir: ikiye bolme ya da
// dogrusal ara deger). Gecersiz (NaN) dugumlu hucreler atlanir: egriler orada acik biter. Esik kosegen (saddle) hucrede merkez
// degeri (4 kose ortalamasi ya da center(i, j)) belirler.
// Donus: [{ pts: [[x,y]...], closed }]
export function isoLines(V, nx, ny, L, cross, center = null) {
  const inside = (k) => V[k] > L;
  const pt = new Map(); // kenar kimligi -> nokta
  const P = (eid) => {
    let p = pt.get(eid); if (p) return p;
    const k = eid >> 1; const k2 = eid & 1 ? k + nx : k + 1;
    p = inside(k) ? cross(k2, k) : cross(k, k2); pt.set(eid, p); return p;
  };
  const next = new Map(); const hasIn = new Set();
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx + 1, d = a + nx;
    const va = V[a], vb = V[b], vc = V[c], vd = V[d];
    if (va !== va || vb !== vb || vc !== vc || vd !== vd) continue; // NaN
    const ia = va > L, ib = vb > L, ic = vc > L, id = vd > L;
    if (ia === ib && ib === ic && ic === id) continue;
    // CCW kenarlar: ab (alt), bc (sag), cd (ust, c->d), da (sol, d->a)
    const E = [[2 * a, ia, ib], [2 * b + 1, ib, ic], [2 * d, ic, id], [2 * a + 1, id, ia]];
    const cr = []; for (const [eid, s0, s1] of E) if (s0 !== s1) cr.push({ eid, N: !s0 && s1 });
    let pairs = [];
    if (cr.length === 2) { const n = cr[0].N ? cr[0] : cr[1], x = cr[0].N ? cr[1] : cr[0]; pairs.push([n.eid, x.eid]); }
    else if (cr.length === 4) {
      const vm = center ? center(i, j) : (va + vb + vc + vd) / 4; const cin = vm > L;
      for (let q = 0; q < 4; q++) if (cr[q].N) { const x = cin ? cr[(q + 3) % 4] : cr[(q + 1) % 4]; pairs.push([cr[q].eid, x.eid]); }
    }
    for (const [u, v] of pairs) { next.set(u, v); hasIn.add(v); }
  }
  const out = []; const used = new Set();
  const walk = (s) => {
    const ids = [s]; used.add(s); let cur = s;
    for (;;) { const n = next.get(cur); if (n === undefined) return { ids, closed: false }; if (n === s) return { ids, closed: true }; if (used.has(n)) return { ids, closed: false }; ids.push(n); used.add(n); cur = n; }
  };
  for (const s of next.keys()) if (!hasIn.has(s) && !used.has(s)) { const w = walk(s); out.push({ pts: w.ids.map(P), closed: false }); }
  for (const s of next.keys()) if (!used.has(s)) { const w = walk(s); out.push({ pts: w.ids.map(P), closed: w.closed }); }
  return out;
}
