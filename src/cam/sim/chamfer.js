// WP-07: keskin kenar pahi icin sim'e bildirilen hacim (toolpath.meta.chamferSharp). Model yukseklik haritasinin KOPYASI, secilen kenardan
// malzemeye dogru `width` icindeki hucrelerde pah yuzeyine indirilir: z_c(d) = zEdge - dz + d*dz/width (d = kenardan malzemeye yatay uzaklik,
// 0..width). Takim bu yuzeyin altina inerse (deklare edilenden fazla kesim) oyma kapisi yine tetiklenir; yuzeyin ustu serbesttir.
// Hucre ayriklastirmasi icin d, hucre capraz yarisi (0,71*res) kadar azaltilir (yuzey biraz asagi: kasitli tolerans, res ile sinirli).
export function lowerForChamfer(mh, cs) {
  if (!mh?.data || !cs?.items?.length || !(cs.width > 0)) return mh;
  const out = { ...mh, data: new Float32Array(mh.data) };
  const w = cs.width, slope = cs.dz / w, res = mh.res, tolD = 0.71 * res;
  for (const it of cs.items) {
    const pts = it.pts, n = pts.length, segN = it.closed ? n : n - 1; if (segN < 1) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    const pad = w + 2 * res;
    const i0 = Math.max(0, Math.floor((x0 - pad - mh.x0) / res)), i1 = Math.min(mh.nx - 1, Math.floor((x1 + pad - mh.x0) / res));
    const j0 = Math.max(0, Math.floor((y0 - pad - mh.y0) / res)), j1 = Math.min(mh.ny - 1, Math.floor((y1 + pad - mh.y0) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = mh.x0 + (i + 0.5) * res, cy = mh.y0 + (j + 0.5) * res;
      let best = Infinity, sg = 0;
      for (let s = 0; s < segN; s++) {
        const a = pts[s], b = pts[(s + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 1e-18) continue;
        let t = ((cx - a[0]) * dx + (cy - a[1]) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = a[0] + t * dx - cx, py = a[1] + t * dy - cy; const d = Math.hypot(px, py);
        if (d < best) { best = d; sg = dx * (cy - a[1]) - dy * (cx - a[0]); } // sg > 0: hucre yonun solunda
      }
      if (!(best < Infinity) || (sg > 0) !== it.matLeft) continue; // malzeme tarafi degil
      if (best > w + tolD) continue;
      const zc = it.zEdge - cs.dz + Math.max(0, best - tolD) * slope; const k = j * mh.nx + i;
      if (out.data[k] > zc) out.data[k] = zc;
    }
  }
  return out;
}
