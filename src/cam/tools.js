// Takim modeli: dogrulama/normalizasyon, kesme verisi on ayarlari (preset), kutuphane JSON ice/disa aktarma (saf JS).
// Belgedeki doc.cam.tools kutuphanenin kopyasidir (dosya kendi kendine yeter). Hata: KErr {code, params}.
import { cerr, issue } from './geom/err.js';

export const TOOL_TYPES = ['flat', 'ball', 'bullnose', 'drill', 'spot', 'tap', 'chamfer', 'face', 'reamer', 'bore'];
export const COOLANTS = ['flood', 'mist', 'air', 'through', 'off'];
export const LIB_FORMAT = 'mihenk-tool-library';
export const LIB_LIMITS = { tools: 5000, presets: 100, str: 500, bytes: 20 * 1024 * 1024 };
const TIP_TYPES = new Set(['drill', 'spot', 'chamfer']);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPosInt = (v) => Number.isInteger(v) && v >= 1 && v <= 99999;
const bad = (path, expect) => cerr('cam.tool.bad_field', { path, expect });

// Takimi dogrular; normallestirilmis KOPYA doner (ball: cornerR = dia/2; flat: cornerR = 0). Hata: KErr.
export function normalizeTool(t, path = 'tool') {
  if (!t || typeof t !== 'object' || Array.isArray(t)) throw bad(path, 'object');
  const o = { ...t };
  const req = (k, ok, expect) => { if (!ok(o[k])) throw bad(`${path}.${k}`, expect); };
  const opt = (k, ok, expect) => { if (o[k] !== undefined && o[k] !== null && !ok(o[k])) throw bad(`${path}.${k}`, expect); };
  req('id', (v) => typeof v === 'string' && v.length > 0 && v.length <= 200, 'text');
  req('number', isPosInt, 'integer >= 1');
  req('lengthOffset', isPosInt, 'integer >= 1');
  opt('diaOffset', isPosInt, 'integer >= 1');
  req('type', (v) => TOOL_TYPES.includes(v), TOOL_TYPES.join('/'));
  req('dia', (v) => isNum(v) && v > 0 && v <= 2000, 'number > 0');
  req('fluteLen', (v) => isNum(v) && v > 0, 'number > 0');
  req('bodyLen', (v) => isNum(v) && v > 0, 'number > 0');
  if (o.bodyLen < o.fluteLen) throw bad(`${path}.bodyLen`, '>= fluteLen');
  req('flutes', (v) => Number.isInteger(v) && v >= 1 && v <= 100, 'integer >= 1');
  req('centerCutting', (v) => typeof v === 'boolean', 'boolean');
  opt('shaftDia', (v) => isNum(v) && v > 0, 'number > 0');
  for (const k of ['name', 'material', 'note']) opt(k, (v) => typeof v === 'string' && v.length <= LIB_LIMITS.str, 'text');
  if (o.type === 'ball') { if (o.cornerR != null && Math.abs(o.cornerR - o.dia / 2) > 1e-9) throw bad(`${path}.cornerR`, 'dia/2'); o.cornerR = o.dia / 2; }
  else if (o.type === 'bullnose') req('cornerR', (v) => isNum(v) && v > 0 && v < o.dia / 2, '0 < cornerR < dia/2');
  else { opt('cornerR', (v) => isNum(v) && v >= 0 && v <= o.dia / 2, '0..dia/2'); if (o.cornerR == null) o.cornerR = 0; }
  if (TIP_TYPES.has(o.type)) req('tipAngle', (v) => isNum(v) && v > 0 && v < 180, '0 < angle < 180');
  else opt('tipAngle', (v) => isNum(v) && v > 0 && v <= 180, '0 < angle <= 180');
  if (o.type === 'tap') req('pitch', (v) => isNum(v) && v > 0 && v < 20, 'number > 0');
  else opt('pitch', (v) => isNum(v) && v > 0, 'number > 0');
  if (o.type === 'drill' || o.type === 'spot') { if (o.centerCutting !== true) throw bad(`${path}.centerCutting`, 'true'); }
  if (o.holder !== undefined && o.holder !== null) {
    if (typeof o.holder !== 'object' || !isNum(o.holder.dia) || o.holder.dia <= 0 || !isNum(o.holder.len) || o.holder.len <= 0) throw bad(`${path}.holder`, '{dia, len}');
  }
  if (o.presets === undefined) o.presets = [];
  if (!Array.isArray(o.presets) || o.presets.length > LIB_LIMITS.presets) throw bad(`${path}.presets`, 'list');
  const names = new Set();
  o.presets = o.presets.map((p, i) => {
    const pp = `${path}.presets[${i}]`;
    if (!p || typeof p !== 'object') throw bad(pp, 'object');
    if (typeof p.name !== 'string' || !p.name || p.name.length > 200) throw bad(pp + '.name', 'text');
    if (names.has(p.name)) throw cerr('cam.tool.dup_preset', { name: p.name }); names.add(p.name);
    for (const k of ['rpm', 'feedCut', 'feedPlunge']) if (!isNum(p[k]) || p[k] <= 0) throw bad(`${pp}.${k}`, 'number > 0');
    for (const k of ['feedRamp', 'stepdown', 'stepover']) if (p[k] != null && (!isNum(p[k]) || p[k] <= 0)) throw bad(`${pp}.${k}`, 'number > 0');
    if (!COOLANTS.includes(p.coolant)) throw bad(pp + '.coolant', COOLANTS.join('/'));
    return { ...p };
  });
  return o;
}
// IR'deki takim alt kumesi
export function irTool(t) {
  return { number: t.number, H: t.lengthOffset, D: t.diaOffset ?? null, type: t.type, dia: t.dia, cornerR: t.cornerR ?? 0, tipAngle: t.tipAngle ?? null, fluteLen: t.fluteLen, bodyLen: t.bodyLen, centerCutting: t.centerCutting, pitch: t.pitch ?? null };
}
// matkap ucu boyu (tam captan uca): (d/2)/tan(aci/2)
export function tipLength(t) { return t.tipAngle && t.tipAngle < 180 ? (t.dia / 2) / Math.tan((t.tipAngle * Math.PI) / 360) : 0; }

// On ayari isleme kopyalar (rpm, ilerlemeler, stepdown/stepover, sogutma). Islemdeki diger alanlar korunur.
export function applyPreset(op, tool, presetName) {
  const p = (tool.presets || []).find((x) => x.name === presetName);
  if (!p) throw cerr('cam.tool.no_preset', { name: String(presetName), tool: tool.number });
  const o = { ...op, preset: p.name, rpm: p.rpm, feedCut: p.feedCut, feedPlunge: p.feedPlunge, coolant: p.coolant };
  if (p.feedRamp != null) o.feedRamp = p.feedRamp;
  if (p.stepdown != null && 'stepdown' in op) o.stepdown = p.stepdown;
  if (p.stepover != null && 'stepover' in op) o.stepover = p.stepover;
  return o;
}

// Ayni takim numarasi farkli takima verilmis mi, ayni kimlik tekrar mi: [{code, params}]
export function toolListIssues(tools) {
  const out = []; const byNum = new Map(), ids = new Set();
  for (const t of tools) {
    if (ids.has(t.id)) out.push(issue('cam.tool.dup_id', { id: t.id })); ids.add(t.id);
    if (byNum.has(t.number) && byNum.get(t.number) !== t.id) out.push(issue('cam.tool.dup_number', { number: t.number }));
    byNum.set(t.number, t.id);
  }
  return out;
}

// ------------------------------------------------------------------ kutuphane JSON
export function exportLibrary(tools) {
  const list = tools.map((t, i) => normalizeTool(t, `tools[${i}]`));
  return JSON.stringify({ format: LIB_FORMAT, version: 1, tools: list }, null, 1);
}
// Donus: { tools: [gecerli], errors: [{index, code, params}] }. Dosya bicimi bozuksa KErr.
export function importLibrary(text) {
  if (typeof text !== 'string') throw cerr('cam.tool.lib_bad', {});
  if (text.length > LIB_LIMITS.bytes) throw cerr('cam.tool.lib_too_big', { mb: Math.round(LIB_LIMITS.bytes / 1048576) });
  let j; try { j = JSON.parse(text); } catch (e) { throw cerr('cam.tool.lib_bad', {}); }
  if (!j || typeof j !== 'object' || j.format !== LIB_FORMAT || !Array.isArray(j.tools)) throw cerr('cam.tool.lib_bad', {});
  if (!Number.isInteger(j.version) || j.version < 1) throw cerr('cam.tool.lib_bad', {});
  if (j.version > 1) throw cerr('cam.tool.lib_newer', { version: j.version });
  if (j.tools.length > LIB_LIMITS.tools) throw cerr('cam.tool.lib_too_many', { max: LIB_LIMITS.tools });
  const tools = [], errors = []; const ids = new Set();
  j.tools.forEach((t, i) => {
    try {
      if (t && typeof t === 'object' && Object.keys(t).includes('__proto__')) throw bad(`tools[${i}]`, 'object');
      const n = normalizeTool(t, `tools[${i}]`);
      if (ids.has(n.id)) throw cerr('cam.tool.dup_id', { id: n.id }); ids.add(n.id);
      tools.push(n);
    } catch (e) { errors.push({ index: i, code: e.code || 'internal', params: e.params || {} }); }
  });
  return { tools, errors };
}
