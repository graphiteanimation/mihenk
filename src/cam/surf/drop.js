// WP-15: drop-cutter (ters takim / "inverse tool"): takim ekseni +Z, takim (x,y)'de yukaridan indirilir; ucgen agina ilk degdigi
// uc yuksekligi (tip z) bulunur. Takim = yaricap R, kose yaricapi rc (duz 0, kure R, kose radusl. 0<rc<R) ve tekdüze ofset s
// (bitirme payi / ag sapmasi): Minkowski(takim, s-kure) = (R+s, rc+s) takim, ucu s asagida -> gercek uc = zE + s.
// Temas denetimleri (kendi kodumuz, O-038): yuzey (duzlem destek noktasi ucgen icindeyse), kenar (1B icbukey en buyukleme: duz
// ve kurede kapali bicim, torusta turev ikiye bolme) ve kose (dik kenar). Ucgenler/kenarlar en ust z'leri eldeki en iyiden
// asagidaysa atlanir (uc <= temas <= en ust z).
import { cerr } from '../geom/err.js';

export const SURF_TOOLS = ['flat', 'ball', 'bullnose'];

// takim -> kesici { R, rc, off, R0, rc0, prof(d) } (prof: eksenden d uzaktaki alt yuzeyin uca gore yuksekligi; gercek takim)
export function makeCutter(tool, off = 0) {
  if (!tool || !SURF_TOOLS.includes(tool.type)) throw cerr('cam.surf.tool_type', { type: String(tool?.type) });
  const R0 = tool.dia / 2; const rc0 = tool.type === 'ball' ? R0 : tool.type === 'bullnose' ? tool.cornerR : 0;
  if (!(R0 > 0) || !(rc0 >= 0 && rc0 <= R0 + 1e-12)) throw cerr('cam.surf.tool_type', { type: tool.type });
  if (!(off >= 0)) throw cerr('cam.surf.bad_offset', { off });
  const prof = (d) => {
    const f = R0 - rc0; if (d <= f) return 0; const q = d - f; const v = rc0 * rc0 - q * q; return rc0 - Math.sqrt(v > 0 ? v : 0);
  };
  return { R: R0 + off, rc: rc0 + off, off, R0, rc0, prof, type: tool.type };
}

// dropper(IX, C) -> drop(x, y, floor = -Infinity) : gercek uc z (temas yoksa floor)
// Budama: kova/ucgen ust siniri = en ust z - prof(eksenden kutuya yatay uzaklik); kovalar bu sinira gore azalan sirada islenir,
// sinir eldeki en iyiden kucukse durulur. Degisken sayilar Float64Array'de tutulur (kapanis icinde kutulanmasin).
export function makeDropper(IX, C) {
  const { R, rc, off } = C; const flatR = R - rc; const P = IX.M.P, T = IX.M.T, TE = IX.M.TE;
  const D = IX.D, Dd = IX.Dd, ED = IX.ED; const R2 = R * R;
  const kind = rc <= 1e-12 ? 0 : rc >= R - 1e-12 ? 1 : 2; // 0 duz, 1 kure, 2 torus
  const { cs, nx: bnx, ny: bny, start, list } = IX; const bx0 = IX.x0, by0 = IX.y0;
  if (!IX.bmz) { const b = new Float64Array(bnx * bny).fill(-Infinity); for (let k = 0; k < b.length; k++) for (let p = start[k]; p < start[k + 1]; p++) { const z = D[list[p] * 8 + 4]; if (z > b[k]) b[k] = z; } IX.bmz = b; }
  if (!IX.bv) { // kovadaki en yuksek kose (alt sinir: uc >= vz - prof(|v - eksen|))
    const bv = new Float64Array(bnx * bny * 3).fill(NaN);
    for (let k = 0; k < bnx * bny; k++) { let bz = -Infinity; for (let p = start[k]; p < start[k + 1]; p++) { const t = list[p]; for (let j = 0; j < 3; j++) { const v = 3 * T[3 * t + j]; if (P[v + 2] > bz) { bz = P[v + 2]; bv[3 * k] = P[v]; bv[3 * k + 1] = P[v + 1]; bv[3 * k + 2] = bz; } } } }
    IX.bv = bv;
  }
  const bmz = IX.bmz, bv = IX.bv;
  const cap = Math.max(64, (Math.ceil((2 * R) / cs) + 2) ** 2); const bk = new Int32Array(cap), bb = new Float64Array(cap);
  const S = new Float64Array(4); // qx, qy, best
  const prof = (rho) => { const q = rho - flatR; if (q <= 0) return 0; const v = rc * rc - q * q; return rc - Math.sqrt(v > 0 ? v : 0); };
  const dprof = (rho) => { const q = rho - flatR; if (q <= 0) return 0; const v = rc * rc - q * q; return v > 1e-18 ? q / Math.sqrt(v) : 1e9; };
  const boundAt = (d2, zmax) => (d2 >= R2 ? -Infinity : zmax - prof(Math.sqrt(d2)));
  function facet(t, qx, qy) {
    const o = t * 8; const nz = D[o + 7]; if (nz <= 0) return;
    const nx = D[o + 5], ny = D[o + 6]; const nxy = Math.sqrt(nx * nx + ny * ny);
    const zE = (Dd[t] - nx * qx - ny * qy + flatR * nxy + rc * (1 - nz)) / nz;
    if (zE <= S[2]) return;
    let px = qx, py = qy; if (nxy > 1e-12) { const k = flatR / nxy + rc; px -= nx * k; py -= ny * k; }
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
    const ax = P[a], ay = P[a + 1], bx = P[b], by = P[b + 1], cx = P[c], cy = P[c + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-18) return;
    const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den; if (l1 < -1e-9) return;
    const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den; if (l2 < -1e-9 || l1 + l2 > 1 + 1e-9) return;
    S[2] = zE;
  }
  function edge(e, qx, qy) {
    const o = e * 8; const best = S[2]; if (ED[o + 7] <= best) return;
    const ax = ED[o], ay = ED[o + 1], az = ED[o + 2], L = ED[o + 5];
    const dx = qx - ax, dy = qy - ay;
    if (L === 0) { const d2 = dx * dx + dy * dy; if (d2 > R2) return; const z = az - prof(Math.sqrt(d2)); if (z > best) S[2] = z; return; }
    const ux = ED[o + 3], uy = ED[o + 4], m = ED[o + 6];
    const t0 = dx * ux + dy * uy; const h = Math.abs(dx * uy - dy * ux); if (h >= R) return;
    const w = Math.sqrt(R2 - h * h); const lo = t0 - w > 0 ? t0 - w : 0, hi = t0 + w < L ? t0 + w : L; if (lo > hi) return;
    if (az + m * (m >= 0 ? hi : lo) <= best) return; // dogru en ust noktasi bile asagida
    let s, z;
    if (kind === 0) { s = m >= 0 ? hi : lo; z = az + m * s; }
    else if (kind === 1) {
      s = t0 + (m * w) / Math.sqrt(1 + m * m); if (s < lo) s = lo; else if (s > hi) s = hi;
      const u = s - t0; const v = w * w - u * u; z = az + m * s - R + Math.sqrt(v > 0 ? v : 0);
    } else {
      let u = lo - t0, rho = Math.sqrt(u * u + h * h);
      if ((rho < 1e-15 ? m : m - dprof(rho) * (u / rho)) <= 0) s = lo;
      else {
        u = hi - t0; rho = Math.sqrt(u * u + h * h);
        if ((rho < 1e-15 ? m : m - dprof(rho) * (u / rho)) >= 0) s = hi;
        else { let a = lo, b = hi; for (let k = 0; k < 26; k++) { const c = 0.5 * (a + b); u = c - t0; rho = Math.sqrt(u * u + h * h); if ((rho < 1e-15 ? m : m - dprof(rho) * (u / rho)) > 0) a = c; else b = c; } s = 0.5 * (a + b); }
      }
      u = s - t0; z = az + m * s - prof(Math.sqrt(u * u + h * h));
    }
    if (z > best) S[2] = z;
  }
  return function drop(qx, qy, floor = -Infinity) {
    S[2] = floor - off;
    const i0 = Math.max(0, Math.floor((qx - R - bx0) / cs)), i1 = Math.min(bnx - 1, Math.floor((qx + R - bx0) / cs));
    const j0 = Math.max(0, Math.floor((qy - R - by0) / cs)), j1 = Math.min(bny - 1, Math.floor((qy + R - by0) / cs));
    if (i1 < i0 || j1 < j0) return S[2] + off;
    let n = 0;
    for (let j = j0; j <= j1; j++) {
      const ylo = by0 + j * cs, yhi = ylo + cs; const ddy = qy < ylo ? ylo - qy : qy > yhi ? qy - yhi : 0;
      for (let i = i0; i <= i1; i++) {
        const k = j * bnx + i; const zm = bmz[k]; if (zm <= S[2]) continue;
        const vx = bv[3 * k] - qx, vy = bv[3 * k + 1] - qy; const lb = boundAt(vx * vx + vy * vy, bv[3 * k + 2]); if (lb > S[2]) S[2] = lb;
        const xlo = bx0 + i * cs, xhi = xlo + cs; const ddx = qx < xlo ? xlo - qx : qx > xhi ? qx - xhi : 0;
        const bd = boundAt(ddx * ddx + ddy * ddy, zm); if (bd <= S[2]) continue;
        // azalan siraya ekle
        let p = n++; while (p > 0 && bb[p - 1] < bd) { bb[p] = bb[p - 1]; bk[p] = bk[p - 1]; p--; } bb[p] = bd; bk[p] = k;
      }
    }
    let q = ++IX.q; if (q >= 4294967295) { IX.stamp.fill(0); IX.estamp.fill(0); IX.q = q = 1; }
    const st = IX.stamp, es = IX.estamp;
    for (let a = 0; a < n; a++) {
      if (bb[a] <= S[2]) break;
      const k = bk[a];
      for (let p = start[k], pe = start[k + 1]; p < pe; p++) {
        const t = list[p]; const o = t * 8; const zm = D[o + 4]; if (zm <= S[2]) break; // kova azalan sirali
        if (st[t] === q) continue; st[t] = q;
        const ddx = qx < D[o] ? D[o] - qx : qx > D[o + 2] ? qx - D[o + 2] : 0, ddy = qy < D[o + 1] ? D[o + 1] - qy : qy > D[o + 3] ? qy - D[o + 3] : 0;
        const d2 = ddx * ddx + ddy * ddy; if (d2 >= R2) continue;
        if (zm - prof(Math.sqrt(d2)) <= S[2]) continue;
        facet(t, qx, qy);
        for (let j = 0; j < 3; j++) { const e = TE[3 * t + j]; if (es[e] === q) continue; es[e] = q; edge(e, qx, qy); }
      }
    }
    return S[2] + off;
  };
}

// CL izgarasi (dugum: x0 + i g, y0 + j g): Float64Array (j*nx + i); floor = temas yoksa deger. shouldStop: iptal denetimi.
export function clGrid(drop, x0, y0, g, nx, ny, floor, shouldStop) {
  const H = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) { if (shouldStop && (j & 15) === 0) shouldStop(); const y = y0 + j * g; for (let i = 0; i < nx; i++) H[j * nx + i] = drop(x0 + i * g, y, floor); }
  return { x0, y0, g, nx, ny, H };
}
// CL yuzeyi egimi (derece) merkezi farkla
export function slopeDeg(drop, x, y, h, floor) {
  const gx = (drop(x + h, y, floor) - drop(x - h, y, floor)) / (2 * h), gy = (drop(x, y + h, floor) - drop(x, y - h, floor)) / (2 * h);
  return (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
}
