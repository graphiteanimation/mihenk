// Takim ucu geometrisi: uc profili (takim ekseninden r uzakligindaki alt yuzey yuksekligi), saft, tutucu.
import { KErr } from '../../shared/errors.js';
const simErr = (code, params = {}) => new KErr(code, params);

const FLAT = new Set(['flat', 'face', 'tap', 'reamer', 'bore', 'threadmill']);
// T-22: kilavuz deligin DIS DIBI capina kadar talas kaldirir sayilir; dis (dip..majör arasi) kasitli kesimdir, oyma degildir.
// Dip capi: takimda minorDia varsa o, yoksa ISO metrik temel ic dis kucuk capi D1 = D - 1,0825 P. Hatve yoksa majör cap (muhafazakar).
export const ISO_MINOR_K = 1.0825;
export function tapMinorDia(tool) {
  if (Number.isFinite(tool.minorDia) && tool.minorDia > 0 && tool.minorDia <= tool.dia) return tool.minorDia;
  if (Number.isFinite(tool.pitch) && tool.pitch > 0) { const d = tool.dia - ISO_MINOR_K * tool.pitch; if (d > 0) return d; }
  return tool.dia;
}
const CONE = new Set(['drill', 'spot', 'chamfer']);

// tool: IR tool alanlari + {shaftDia?, holder?:{dia,len}}. Eksik/gecersiz geometri = hata (tahmin yok).
export function toolGeom(tool) {
  const bad = (field) => simErr('cam.sim.tool_geom', { field, type: tool && tool.type });
  if (!tool || !(tool.dia > 0)) throw bad('dia');
  const R = tool.dia / 2;
  let kind;
  let cr = 0, tanHalf = 0, tipR = 0;
  if (FLAT.has(tool.type)) kind = 'flat';
  else if (tool.type === 'ball') kind = 'ball';
  else if (tool.type === 'bullnose') {
    if (!(tool.cornerR > 0) || tool.cornerR > R + 1e-9) throw bad('cornerR');
    kind = 'bull'; cr = tool.cornerR;
  } else if (CONE.has(tool.type)) {
    if (!(tool.tipAngle > 0 && tool.tipAngle < 180)) throw bad('tipAngle');
    kind = 'cone'; tanHalf = Math.tan((tool.tipAngle / 2) * Math.PI / 180);
    if (tool.tipDia != null) { if (!(tool.tipDia >= 0 && tool.tipDia < tool.dia)) throw bad('tipDia'); tipR = tool.tipDia / 2; } // T-11: uc duz capi (WP-06)
  } else throw bad('type');
  if (!(tool.fluteLen > 0)) throw bad('fluteLen');
  if (!(tool.bodyLen >= tool.fluteLen)) throw bad('bodyLen');
  const shaftR = tool.shaftDia != null ? tool.shaftDia / 2 : R;
  if (!(shaftR > 0)) throw bad('shaftDia');
  // WP-13: tutucu profili. holder = {dia, len} (tek silindir, eski bicim) ya da {segments:[{len, d0, d1?}]} (takim ucundan bodyLen
  // yukarida baslayan, asagidan yukari kademeli silindir/koni). holderR = en buyuk yaricap (zarf); holderU(r) = r yaricapindaki
  // malzemenin tutucuya degdigi en kucuk yukseklik (tutucu tabanindan, mm; hic degmiyorsa Infinity).
  let holderR = 0, holderLen = 0, holderSegs = null;
  if (tool.holder) {
    const hs = holderSegments(tool.holder); if (!hs) throw bad('holder');
    holderSegs = hs; holderR = Math.max(...hs.map((q) => Math.max(q.r0, q.r1))); holderLen = hs[hs.length - 1].u1;
  }
  const holderU = (r) => {
    if (!holderSegs) return Infinity;
    for (const q of holderSegs) {
      if (q.r0 >= r) return q.u0;
      if (q.r1 >= r) return q.u0 + ((r - q.r0) / (q.r1 - q.r0)) * (q.u1 - q.u0); // koni: r0 < r <= r1
    }
    return Infinity;
  };
  const profile = (r) => {
    if (kind === 'flat') return 0;
    if (kind === 'ball') { const q = R * R - r * r; return R - Math.sqrt(q > 0 ? q : 0); }
    if (kind === 'bull') { const d = r - (R - cr); if (d <= 0) return 0; const q = cr * cr - d * d; return cr - Math.sqrt(q > 0 ? q : 0); }
    return r <= tipR ? 0 : (r - tipR) / tanHalf;
  };
  // cutR: kesme (talas kaldirma + oyma) yaricapi. Kilavuzda dis dibi; zarf (hizli/saft/tutucu denetimi) R (majör) kalir.
  const cutR = tool.type === 'tap' ? tapMinorDia(tool) / 2 : R;
  // WP-13 (uc dexel): takim ucundan u yukseklikte kesici yaricapi (profile'in tersi; u >= 0). Ustunde silindir (cutR).
  // rhoEnv: zarf (hizli denetimi, majör cap); rho: kesme (cutR ile sinirli)
  const rhoEnv = (u) => {
    if (u < 0) return 0;
    if (kind === 'flat') return R;
    if (kind === 'ball') return u >= R ? R : Math.sqrt(Math.max(0, R * R - (R - u) * (R - u)));
    if (kind === 'bull') return u >= cr ? R : (R - cr) + Math.sqrt(Math.max(0, cr * cr - (cr - u) * (cr - u)));
    return Math.min(R, tipR + u * tanHalf);
  };
  const rho = (u) => Math.min(rhoEnv(u), cutR);
  return { kind, R, cutR, cr, tanHalf, shaftR, holderR, holderLen, holderSegs, holderU, fluteLen: tool.fluteLen, bodyLen: tool.bodyLen, profile, rho, rhoEnv, type: tool.type };
}

// WP-13: tutucu verisini kademeli parcalara cevirir: [{u0, u1, r0, r1}] (u: tutucu tabanindan yukari). Gecersizse null.
export function holderSegments(h) {
  if (!h || typeof h !== 'object') return null;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  if (Array.isArray(h.segments) && h.segments.length) {
    const out = []; let u = 0;
    for (const q of h.segments) {
      const d0 = q?.d0, d1 = q?.d1 ?? q?.d0, len = q?.len;
      if (!(fin(d0) && d0 > 0 && fin(d1) && d1 > 0 && fin(len) && len > 0)) return null;
      out.push({ u0: u, u1: u + len, r0: d0 / 2, r1: d1 / 2 }); u += len;
    }
    return out;
  }
  if (!(fin(h.dia) && h.dia > 0 && fin(h.len) && h.len > 0)) return null;
  return [{ u0: 0, u1: h.len, r0: h.dia / 2, r1: h.dia / 2 }];
}
