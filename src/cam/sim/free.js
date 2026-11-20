// T-15: serbest / kopmus parca denetimi. Sim sonrasi yukseklik haritasinda tabana kadar (boydan boya) kesilmis hucre BOS;
// kalan malzeme hucrelerinin 4-komsulukla bagli bilesenleri. En buyuk alanli bilesen baglanan (mengene/bagi) parca sayilir;
// digerleri (alan >= minArea) serbest parca. 4-komsuluk: capraz tek koseyle degen hucreler AYRI sayilir (daha cok uyari: guvenli yon).
// Sinir: tek degerli harita; bos sutun = bu setup tabana kadar kesti YA DA (zincirde) onceki (anti)paralel setup'lar sutunun
// kalanini kaldirdi (columnEmpty, tam aralik). Egik setup zincirinde ikinci olcut kullanilmaz: tabandan serbest kalan parca
// gorulmeyebilir (yanlis negatif), yanlis pozitif uretilmez.
// empty(k): ek bos hucre olcutu (zincirde onceki setup'larin kaldirdigi sutun; chain.js columnEmpty)
export function freePieces(hm, zFloor, { tol = 1e-6, minArea = 1, empty = null } = {}) {
  const { nx, ny, data, res } = hm; const lab = new Int32Array(nx * ny).fill(-1); const comps = [];
  const E = empty ? new Uint8Array(nx * ny) : null; if (E) for (let k = 0; k < nx * ny; k++) if (data[k] > zFloor + tol && empty(k)) E[k] = 1;
  const filled = (k) => data[k] > zFloor + tol && !(E && E[k]);
  const stack = new Int32Array(nx * ny);
  for (let k0 = 0; k0 < nx * ny; k0++) {
    if (lab[k0] >= 0 || !filled(k0)) continue;
    const id = comps.length; let n = 0, sx = 0, sy = 0, top = -Infinity, sp = 0, edge = false; stack[sp++] = k0; lab[k0] = id;
    while (sp) {
      const k = stack[--sp]; const i = k % nx, j = (k - i) / nx; n++; sx += i; sy += j; if (data[k] > top) top = data[k];
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) edge = true;
      if (i > 0 && lab[k - 1] < 0 && filled(k - 1)) { lab[k - 1] = id; stack[sp++] = k - 1; }
      if (i < nx - 1 && lab[k + 1] < 0 && filled(k + 1)) { lab[k + 1] = id; stack[sp++] = k + 1; }
      if (j > 0 && lab[k - nx] < 0 && filled(k - nx)) { lab[k - nx] = id; stack[sp++] = k - nx; }
      if (j < ny - 1 && lab[k + nx] < 0 && filled(k + nx)) { lab[k + nx] = id; stack[sp++] = k + nx; }
    }
    comps.push({ cells: n, area: n * res * res, x: hm.x0 + (sx / n + 0.5) * res, y: hm.y0 + (sy / n + 0.5) * res, top, edge });
  }
  if (comps.length < 2) return { components: comps.length, free: [] };
  let main = 0; comps.forEach((c, i) => { if (c.area > comps[main].area) main = i; });
  return { components: comps.length, main: comps[main], free: comps.filter((c, i) => i !== main && c.area >= minArea) };
}
