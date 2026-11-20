// T-04: setup'lar arasi stok. Onceki setup'larin son yukseklik haritalari (kendi cercevelerinde) -> yeni setup cercevesinde
// baslangic yukseklik haritasi. Saf JS.
// Malzeme kumesi M = BU setup'in kendi ham stok kutusu ∩ her onceki setup k icin { P k'nin stok kutusu icindeyse z_k <= H_k }:
// zincir yalniz malzeme CIKARIR; onceki setup'in bilgi vermedigi her nokta (kutusu disi) bu setup'in ham stogudur (B1).
// Yukaridan bakan tek degerli harita yuzeyin ALTINDA her yeri dolu sayar (alt kesme/ters yuz bilinmez -> malzeme var).
// Muhafazakar ayrintilar: H_k komsu 3x3 hucrenin en buyugu (genisletme); kutu/harita disi = kisit yok (malzeme kalir); isin
// adimi kaynak cozunurlugunun yarisi; bulunan tepe bir adim yukari yuvarlanir. Hedef hucre degeri hucre merkezindeki isinla.
import { createHeightmap } from './heightmap.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const toF = (F, p) => { const d = [p[0] - F.o[0], p[1] - F.o[1], p[2] - F.o[2]]; return [dot(d, F.x), dot(d, F.y), dot(d, F.z)]; };
const fromF = (F, q) => [0, 1, 2].map((k) => F.o[k] + F.x[k] * q[0] + F.y[k] * q[1] + F.z[k] * q[2]);

function dilate(hm) {
  const { nx, ny, data } = hm; const out = new Float32Array(data.length);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let m = -Infinity;
    for (let b = Math.max(0, j - 1); b <= Math.min(ny - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(nx - 1, i + 1); a++) { const v = data[b * nx + a]; if (v > m) m = v; }
    out[j * nx + i] = m;
  }
  return { ...hm, data: out };
}

// prev: [{frame, hm, box}] (islem sirasiyla; box = o setup'in stok kutusu, setup uzayi), target: {frame, box}, res
// -> heightmap (target setup uzayi); malzeme olmayan hucre = box.min z (sim: bos)
export function stockFromPrevious(prev, target, res) {
  const src = prev.map((p) => ({ F: p.frame, H: dilate(p.hm), B: p.box }));
  const tb = target.box; const out = createHeightmap([tb.min[0], tb.min[1]], [tb.max[0], tb.max[1]], res, tb.min[2]);
  const step = Math.max(1e-3, Math.min(res, ...src.map((s) => s.H.res)) / 2);
  const eps = 1e-6;
  const inside = (P) => {
    for (const s of src) {
      const q = toF(s.F, P); const H = s.H, B = s.B;
      // bu setup'in stok kutusu disi: bilgi yok -> kisit yok (malzeme kalir)
      if (q[0] < B.min[0] - eps || q[0] > B.max[0] + eps || q[1] < B.min[1] - eps || q[1] > B.max[1] + eps || q[2] < B.min[2] - eps || q[2] > B.max[2] + eps) continue;
      let i = Math.floor((q[0] - H.x0) / H.res), j = Math.floor((q[1] - H.y0) / H.res);
      // kutu icinde ama izgara yuvarlamasiyla disari tasan (en cok bir hucre): kenar hucresi
      if (i === -1 || i === H.nx) i = Math.min(H.nx - 1, Math.max(0, i)); if (j === -1 || j === H.ny) j = Math.min(H.ny - 1, Math.max(0, j));
      if (i < 0 || j < 0 || i >= H.nx || j >= H.ny) continue;
      // tabana kadar kesilmis sutun (h <= kutu tabani, sim V-13: BOS): sinir duzlemi (z_k = taban) dahil malzeme yok. Ters
      // cevrilmis setup'in tavani tam bu duzlemde ornekler; esitlik 'dolu' sayilirsa boydan boya pencere hic gorulmez.
      const h = H.data[j * H.nx + i];
      if (h <= B.min[2] + eps || q[2] > h + eps) return false;
    }
    return true;
  };
  for (let j = 0; j < out.ny; j++) for (let i = 0; i < out.nx; i++) {
    const x = out.x0 + (i + 0.5) * res, y = out.y0 + (j + 0.5) * res;
    let top = tb.min[2];
    for (let z = tb.max[2]; z > tb.min[2] - eps; z -= step) {
      if (inside(fromF(target.frame, [x, y, z]))) { top = Math.min(tb.max[2], z + step); break; }
    }
    out.data[j * out.nx + i] = top;
  }
  return out;
}

// Iki setup stok kutusunun dunya eksenli kapsayici kutulari kesisiyor mu (pozitif hacimle). Kesismeyen setup'lar zincirlenmez.
export function boxesOverlap(a, b) {
  const wb = (s) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (const x of [s.box.min[0], s.box.max[0]]) for (const y of [s.box.min[1], s.box.max[1]]) for (const z of [s.box.min[2], s.box.max[2]]) { const P = fromF(s.frame, [x, y, z]); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[k]); mx[k] = Math.max(mx[k], P[k]); } } return { mn, mx }; };
  const A = wb(a), B = wb(b); for (let k = 0; k < 3; k++) if (Math.min(A.mx[k], B.mx[k]) - Math.max(A.mn[k], B.mn[k]) <= 1e-6) return false; return true;
}
// Zincir kaynagi: hedef setup 'blank' degilse, son 'blank' setup'tan bu yana gelen (bir ara setup 'blank' ise ONDAN ONCEKI
// setup'larin kesimleri sonrakiler icin unutulur: yeni ham parca), ayni govdeli ve kutusu ortusen onceki setup'lar
export function chainSources(prev, target) {
  if (target.stockFrom === 'blank' || !target.frame) return [];
  let start = 0; prev.forEach((p, i) => { if (p.stockFrom === 'blank') start = i; });
  const key = (b) => (Array.isArray(b) ? b.map(String).sort().join('|') : null);
  return prev.slice(start).filter((p) => p.frame && p.hm && (key(p.bodies) == null || key(target.bodies) == null || key(p.bodies) === key(target.bodies)) && boxesOverlap(p, target));
}

// T-15 (zincir): hedef cercevede (x, y) sutununun [zLo, zHi] araligi onceki setup kisitlarina gore tamamen BOS mu.
// Eksenleri hedefle (anti)paralel kaynaklar icin tam aralik kesisimi. Egik (paralel olmayan) kaynak varsa sutun bos SAYILMAZ
// (SINIR: egik setup'larla tabandan serbest kalan parca gorulmez; yanlis pozitif yok). Haritalar genisletilmis: muhafazakar.
export function prepareSources(prev) { return prev.map((p) => ({ F: p.frame, H: dilate(p.hm), B: p.box })); }
export function columnEmpty(src, F, x, y, zLo, zHi) {
  const eps = 1e-6; let lo = zLo, hi = zHi; const oblique = [];
  for (const s of src) {
    const k = dot(F.z, s.F.z);
    if (Math.abs(Math.abs(k) - 1) > 1e-9) { oblique.push(s); continue; }
    const P0 = fromF(F, [x, y, 0]); const q = toF(s.F, P0); const H = s.H, B = s.B;
    if (q[0] < B.min[0] - eps || q[0] > B.max[0] + eps || q[1] < B.min[1] - eps || q[1] > B.max[1] + eps) continue; // kutu disi: kisit yok
    let i = Math.floor((q[0] - H.x0) / H.res), j = Math.floor((q[1] - H.y0) / H.res);
    if (i === -1 || i === H.nx) i = Math.min(H.nx - 1, Math.max(0, i)); if (j === -1 || j === H.ny) j = Math.min(H.ny - 1, Math.max(0, j));
    if (i < 0 || j < 0 || i >= H.nx || j >= H.ny) continue;
    const h = H.data[j * H.nx + i];
    if (!(h < B.max[2] - eps)) continue; // bu setup bu sutunda hic kesmedi
    // kaynak k'nin kaldirdigi: z_k in (h, B.max]; hedef z'ye: z_k = q[2] + k z
    const zOf = (v) => (v - q[2]) / k; const c0 = Math.min(zOf(h), zOf(B.max[2])), c1 = Math.max(zOf(h), zOf(B.max[2]));
    // kalan malzemenin kapsayicisi [lo, hi] (ortadan kesilirse kapsayici korunur: daha cok malzeme, muhafazakar)
    if (c0 <= lo + eps && c1 >= hi - eps) return true;
    if (c0 <= lo + eps && c1 > lo) lo = c1; else if (c1 >= hi - eps && c0 < hi) hi = c0;
    if (hi < lo + eps) return true;
  }
  // egik (paralel olmayan) kaynak: ornekleme ince dilimi kacirip yanlis 'bos' (yanlis serbest parca) verebilir -> bos sayilmaz
  return !oblique.length && hi < lo + eps;
}
