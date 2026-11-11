// Takim ucu geometrisi: uc profili (takim ekseninden r uzakligindaki alt yuzey yuksekligi), saft, tutucu.
import { KErr } from '../../shared/errors.js';
const simErr = (code, params = {}) => new KErr(code, params);

const FLAT = new Set(['flat', 'face', 'tap', 'reamer', 'bore']);
const CONE = new Set(['drill', 'spot', 'chamfer']);

// tool: IR tool alanlari + {shaftDia?, holder?:{dia,len}}. Eksik/gecersiz geometri = hata (tahmin yok).
export function toolGeom(tool) {
  const bad = (field) => simErr('cam.sim.tool_geom', { field, type: tool && tool.type });
  if (!tool || !(tool.dia > 0)) throw bad('dia');
  const R = tool.dia / 2;
  let kind;
  let cr = 0, tanHalf = 0;
  if (FLAT.has(tool.type)) kind = 'flat';
  else if (tool.type === 'ball') kind = 'ball';
  else if (tool.type === 'bullnose') {
    if (!(tool.cornerR > 0) || tool.cornerR > R + 1e-9) throw bad('cornerR');
    kind = 'bull'; cr = tool.cornerR;
  } else if (CONE.has(tool.type)) {
    if (!(tool.tipAngle > 0 && tool.tipAngle < 180)) throw bad('tipAngle');
    kind = 'cone'; tanHalf = Math.tan((tool.tipAngle / 2) * Math.PI / 180);
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
    return r / tanHalf;
  };
  return { kind, R, cr, tanHalf, shaftR, holderR, holderLen, fluteLen: tool.fluteLen, bodyLen: tool.bodyLen, profile, type: tool.type };
}
