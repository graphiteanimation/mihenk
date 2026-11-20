// Ortak helis/yay yardimcilari (dairesel frezeleme, dis frezeleme). IR'de tam daire yok: her yay <= PI.
// sg: +1 = CCW (G3), -1 = CW (G2). Z dogrusal degisir (z0 -> z1), toplam acı `total` (radyan, > 0).
import * as P from '../geom/path2d.js';

const TWO_PI = 2 * Math.PI;
// Merkez c, yaricap rho, baslangic acisi a0 etrafinda helis. Parca sayisi = ceil(total / PI); her parca esit aci ve esit dz.
// Donus: bitis acisi (a0 + sg * total). Builder b.seg(s, z0, z1, f, kind) ile eklenir.
export function helixArcs(b, c, rho, a0, sg, z0, z1, total, f, kind = 'cut') {
  if (!(total > 1e-12)) return a0;
  const n = Math.max(1, Math.ceil(total / Math.PI - 1e-9)); const piece = total / n;
  let a = a0, z = z0;
  for (let i = 0; i < n; i++) {
    const zn = i === n - 1 ? z1 : z0 + ((z1 - z0) * (i + 1)) / n;
    const s = P.arc(c, rho, a, sg * piece); b.seg(s, z, zn, f, kind);
    a += sg * piece; z = zn;
  }
  return a;
}
// z sabit tam daire (iki yarim yay)
export const fullCircle = (b, c, rho, a0, sg, z, f, kind = 'cut') => helixArcs(b, c, rho, a0, sg, z, z, TWO_PI, f, kind);

// Yari cember ile teget giris/cikis. Helis cemberi: merkez O, yaricap rho, helis yonu sg (+1 CCW). S: helis uzerindeki nokta (aci a).
//  ic (inside=true): yari cember capi O-S dogrusu (O'dan S'ye); helis ile AYNI yonde (ic teget cember). Giris O'dan S'ye, cikis E'den O'ya.
//  dis (inside=false): capi S'den radyal disari a_out uzunlugunda; helisin TERS yonunde (dis teget cember, S egrisi).
// Donus: parcalar [P.arc] (z sabit; cagiran b.seg ile ekler).
export function leadIn(O, rho, a, sg, inside, aOut = 0) {
  const u = [Math.cos(a), Math.sin(a)]; const S = [O[0] + rho * u[0], O[1] + rho * u[1]];
  if (inside) { const M = [O[0] + (rho / 2) * u[0], O[1] + (rho / 2) * u[1]]; return { start: O.slice(), end: S, arc: P.arc(M, rho / 2, Math.atan2(-u[1], -u[0]), sg * Math.PI) }; }
  const Q = [S[0] + aOut * u[0], S[1] + aOut * u[1]]; const M = [S[0] + (aOut / 2) * u[0], S[1] + (aOut / 2) * u[1]];
  return { start: Q, end: S, arc: P.arc(M, aOut / 2, Math.atan2(u[1], u[0]), -sg * Math.PI) };
}
export function leadOut(O, rho, a, sg, inside, aOut = 0) {
  const u = [Math.cos(a), Math.sin(a)]; const E = [O[0] + rho * u[0], O[1] + rho * u[1]];
  if (inside) { const M = [(O[0] + E[0]) / 2, (O[1] + E[1]) / 2]; return { start: E, end: O.slice(), arc: P.arc(M, rho / 2, Math.atan2(u[1], u[0]), sg * Math.PI) }; }
  const Q = [E[0] + aOut * u[0], E[1] + aOut * u[1]]; const M = [E[0] + (aOut / 2) * u[0], E[1] + (aOut / 2) * u[1]];
  return { start: E, end: Q, arc: P.arc(M, aOut / 2, Math.atan2(-u[1], -u[0]), -sg * Math.PI) };
}
