// T-04: setup'lar arasi stok. Onceki setup'larin son yukseklik haritalari (kendi cercevelerinde) -> yeni setup cercevesinde
// baslangic yukseklik haritasi. Saf JS.
// Malzeme kumesi M = ham kutu (ilk setup stok kutusu) ∩ her onceki setup k icin { z_k <= H_k(x_k, y_k) }: yukaridan bakan
// tek degerli harita, yuzeyin ALTINDA her yeri dolu sayar (alt kesme/ters yuz bilinmez -> malzeme var: muhafazakar).
// Muhafazakar ayrintilar: H_k komsu 3x3 hucrenin en buyugu (genisletme); harita disi = kisit yok (malzeme kalir); isin
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
  const blank = prev[0];
  const src = prev.map((p) => ({ F: p.frame, H: dilate(p.hm) }));
  const tb = target.box; const out = createHeightmap([tb.min[0], tb.min[1]], [tb.max[0], tb.max[1]], res, tb.min[2]);
  const step = Math.max(1e-3, Math.min(res, ...src.map((s) => s.H.res)) / 2);
  const bb = blank.box, eps = 1e-6;
  const inside = (P) => {
    const qb = toF(blank.frame, P);
    if (qb[0] < bb.min[0] - eps || qb[0] > bb.max[0] + eps || qb[1] < bb.min[1] - eps || qb[1] > bb.max[1] + eps || qb[2] < bb.min[2] - eps || qb[2] > bb.max[2] + eps) return false;
    for (const s of src) {
      const q = toF(s.F, P); const H = s.H;
      let i = Math.floor((q[0] - H.x0) / H.res), j = Math.floor((q[1] - H.y0) / H.res);
      // harita kenarindan en cok bir hucre disari (kutu siniri yuvarlama): kenar hucresi (genisletilmis) gecerli
      if (i === -1 || i === H.nx) i = Math.min(H.nx - 1, Math.max(0, i)); if (j === -1 || j === H.ny) j = Math.min(H.ny - 1, Math.max(0, j));
      if (i < 0 || j < 0 || i >= H.nx || j >= H.ny) continue; // harita disi: bu setup orayi modellemedi -> malzeme kalir
      if (q[2] > H.data[j * H.nx + i] + eps) return false;
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
