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
  let holderR = 0, holderLen = 0;
  if (tool.holder) { holderR = tool.holder.dia / 2; holderLen = tool.holder.len; if (!(holderR > 0) || !(holderLen > 0)) throw bad('holder'); }
  const profile = (r) => {
    if (kind === 'flat') return 0;
    if (kind === 'ball') { const q = R * R - r * r; return R - Math.sqrt(q > 0 ? q : 0); }
    if (kind === 'bull') { const d = r - (R - cr); if (d <= 0) return 0; const q = cr * cr - d * d; return cr - Math.sqrt(q > 0 ? q : 0); }
    return r <= tipR ? 0 : (r - tipR) / tanHalf;
  };
  // cutR: kesme (talas kaldirma + oyma) yaricapi. Kilavuzda dis dibi; zarf (hizli/saft/tutucu denetimi) R (majör) kalir.
  const cutR = tool.type === 'tap' ? tapMinorDia(tool) / 2 : R;
  return { kind, R, cutR, cr, tanHalf, shaftR, holderR, holderLen, fluteLen: tool.fluteLen, bodyLen: tool.bodyLen, profile, type: tool.type };
}
