// WP-06 T-01 olcusu: stok ustunde (z > stockTop) ILERLEMEYLE (hizli olmayan) alinan yol, mm. Eski davranis: her islemin ilk dalmasi
// clearance'tan ilerlemeyle iner (havada kesme); yeni: stok ustu + retract payina kadar hizli. Yay = kiris (stok ustunde yay olmaz).
export function airFeed(tp, stockTop) {
  let pos = null, sum = 0;
  for (const m of tp.moves) {
    if (m.t === 'feed' || m.t === 'arc') {
      if (pos) {
        const L = Math.hypot(m.x - pos[0], m.y - pos[1], m.z - pos[2]);
        const hi = Math.max(pos[2], m.z), lo = Math.min(pos[2], m.z);
        if (lo >= stockTop - 1e-9) sum += L;
        else if (hi > stockTop + 1e-9) sum += L * (hi - stockTop) / (hi - lo);
      }
      pos = [m.x, m.y, m.z];
    } else if (m.t === 'rapid') pos = [m.x, m.y, m.z];
    else if (m.t === 'cycle') { const lp = m.points[m.points.length - 1]; pos = [lp[0], lp[1], m.clearance]; }
  }
  return Math.round(sum * 1000) / 1000;
}
