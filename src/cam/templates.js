// WP-14: (1) islem sablonlari (kullanici verisi, JSON ice/disa aktarma) ve (2) delik sira sablonu (taninan delik turune gore
// punta -> matkap -> pah -> kilavuz islem dizisi uretir). Saf JS, DOM/Electron yok. Varsayilan degerler GENEL muhendislik
// kurallaridir (tezgaha/malzemeye ozel degil); kullanici kurallari duzenleyebilir (kural listesi JSON). Hata: CamErr {code, params}.
import { cerr, issue } from './geom/err.js';
import { validateCam } from '../shared/schema.js';

export const TPL_FORMAT = 'mihenk-op-templates';
export const TPL_LIMITS = { templates: 500, opsPer: 200, str: 120, bytes: 5 * 1024 * 1024 };
const OP_TYPES = ['face', 'contour', 'pocket', 'drill', 'chamfer', 'circular', 'threadmill', 'slot', 'trace'];
const HOLE_TYPES = new Set(['drill', 'circular', 'threadmill']);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clone = (x) => JSON.parse(JSON.stringify(x));
const hasBadKey = (x) => { if (Array.isArray(x)) return x.some(hasBadKey); if (x && typeof x === 'object') return Object.keys(x).some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype' || hasBadKey(x[k])); return false; };
const sameDia = (a, b) => isNum(a) && isNum(b) && Math.abs(a - b) <= 0.01;

// ------------------------------------------------------------------ (1) islem sablonlari
// Takim, geometri secimi ve belgeye ozel kimlikler sablona girmez; takim "tool" ipucu olarak (tur, cap, hatve, numara) tasinir.
export function opToTemplateOp(op, tools = []) {
  if (!op || typeof op !== 'object') throw cerr('cam.tpl.bad_op');
  const o = clone(op);
  delete o.id; delete o.suppressed; delete o.toolId; delete o.geom;
  if (HOLE_TYPES.has(o.type) && o.holes) o.holes = { kind: 'feature' }; // delik secimi (ozellik kimlikleri) belgeye ozel
  const tl = tools.find((x) => x.id === op.toolId);
  if (tl) o.tool = { type: tl.type, dia: tl.dia, ...(tl.pitch != null ? { pitch: tl.pitch } : {}), number: tl.number };
  return o;
}
export function makeTemplate(name, ops, tools = [], id) {
  if (typeof name !== 'string' || !name.trim() || name.length > TPL_LIMITS.str) throw cerr('cam.tpl.bad_name');
  if (!Array.isArray(ops) || !ops.length) throw cerr('cam.tpl.empty');
  if (ops.length > TPL_LIMITS.opsPer) throw cerr('cam.tpl.too_many_ops', { max: TPL_LIMITS.opsPer });
  return { id: id || 'tpl_' + Math.random().toString(36).slice(2, 10), name: name.trim(), ops: ops.map((o) => opToTemplateOp(o, tools)) };
}
// Uygun takim: ayni tur, cap (ve kilavuzda hatve) eslesir; yoksa ayni numara + tur; yoksa null.
export function matchTool(hint, tools) {
  if (!hint) return null;
  const same = tools.filter((t) => t.type === hint.type);
  const byDia = same.find((t) => sameDia(t.dia, hint.dia) && (hint.pitch == null || (isNum(t.pitch) && Math.abs(t.pitch - hint.pitch) < 1e-6)));
  return byDia || same.find((t) => hint.number != null && t.number === hint.number && !isNum(hint.dia)) || null;
}
// Sablondan islem listesi: yeni kimlik/ad, takim eslesmesi (eslesme yoksa toolId null + uyari). opts: { tools, newId(), suffix }
export function instantiateTemplate(tpl, { tools = [], newId = () => 'op_' + Math.random().toString(36).slice(2, 10) } = {}) {
  const warnings = []; const ops = [];
  (tpl?.ops || []).forEach((t, i) => {
    const o = clone(t); const hint = o.tool; delete o.tool;
    o.id = newId();
    const tl = matchTool(hint, tools);
    o.toolId = tl ? tl.id : null;
    if (hint && !tl) warnings.push(issue('cam.tpl.no_tool', { op: o.name || o.type, type: hint.type, dia: hint.dia ?? '' }));
    if (HOLE_TYPES.has(o.type) && !o.holes) o.holes = { kind: 'feature' };
    if (OP_TYPES.includes(o.type) && !['drill', 'circular', 'threadmill'].includes(o.type) && !o.geom) o.geom = [];
    ops.push(o); void i;
  });
  return { ops, warnings };
}
export function exportTemplates(list) {
  const out = list.map((t, i) => checkTemplate(t, `templates[${i}]`));
  return JSON.stringify({ format: TPL_FORMAT, version: 1, templates: out }, null, 1);
}
function checkTemplate(t, path) {
  if (!t || typeof t !== 'object' || Array.isArray(t) || hasBadKey(t)) throw cerr('cam.tpl.bad_template', { path });
  if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > TPL_LIMITS.str) throw cerr('cam.tpl.bad_name');
  if (!Array.isArray(t.ops) || !t.ops.length || t.ops.length > TPL_LIMITS.opsPer) throw cerr('cam.tpl.bad_template', { path });
  const ops = t.ops.map((o, i) => {
    if (!o || typeof o !== 'object' || Array.isArray(o) || !OP_TYPES.includes(o.type)) throw cerr('cam.tpl.bad_op', { path: `${path}.ops[${i}]` });
    const c = clone(o); const hint = c.tool; delete c.tool;
    if (hint != null && (typeof hint !== 'object' || typeof hint.type !== 'string')) throw cerr('cam.tpl.bad_op', { path: `${path}.ops[${i}].tool` });
    // belge semasiyla ayni denetim (tur, sinir, zararli yapi): gecici bir kimlikle setup icine konup dogrulanir
    try { validateCam({ setups: [{ id: 'tpl', ops: [{ ...c, id: 'tpl_op' }] }] }); } catch (e) { throw cerr('cam.tpl.bad_op', { path: `${path}.ops[${i}]`, why: e.code || '' }); }
    return hint ? { ...c, tool: { type: hint.type, ...(isNum(hint.dia) ? { dia: hint.dia } : {}), ...(isNum(hint.pitch) ? { pitch: hint.pitch } : {}), ...(Number.isInteger(hint.number) ? { number: hint.number } : {}) } } : c;
  });
  return { id: typeof t.id === 'string' && t.id.length <= 80 ? t.id : 'tpl_' + Math.random().toString(36).slice(2, 10), name: t.name.trim(), ops };
}
// Donus: { templates: [gecerli], errors: [{index, code, params}] }. Dosya bicimi bozuksa CamErr.
export function importTemplates(text) {
  if (typeof text !== 'string') throw cerr('cam.tpl.file_bad');
  if (text.length > TPL_LIMITS.bytes) throw cerr('cam.tpl.file_bad');
  let j; try { j = JSON.parse(text); } catch (e) { throw cerr('cam.tpl.file_bad'); }
  if (!j || typeof j !== 'object' || j.format !== TPL_FORMAT || !Array.isArray(j.templates)) throw cerr('cam.tpl.file_bad');
  if (!Number.isInteger(j.version) || j.version < 1) throw cerr('cam.tpl.file_bad');
  if (j.version > 1) throw cerr('cam.tpl.file_newer', { version: j.version });
  if (j.templates.length > TPL_LIMITS.templates) throw cerr('cam.tpl.too_many', { max: TPL_LIMITS.templates });
  const templates = [], errors = [], ids = new Set();
  j.templates.forEach((t, index) => {
    try { const c = checkTemplate(t, `templates[${index}]`); if (ids.has(c.id)) c.id = 'tpl_' + Math.random().toString(36).slice(2, 10); ids.add(c.id); templates.push(c); }
    catch (e) { errors.push({ index, code: e.code || 'internal', params: e.params || {} }); }
  });
  return { templates, errors };
}

// ------------------------------------------------------------------ (2) delik sira sablonu
// Kural: { id, name, match: { threaded?, through?, diaMin?, diaMax? }, steps: [adim] }. Ilk eslesen kural uygulanir.
// Adim: { role: 'spot'|'drill'|'chamfer'|'tap'|'ream', diaFrom?: 'hole'|'tapDrill', diaOffset?, depthRatio?, width?, peckAboveRatio?, peckRatio? }
// Varsayilanlar genel kural-i bas parmak degerleridir (O onerisi); malzeme/tezgah verisi degildir. Kullanici JSON ile ezer.
export const DEFAULT_HOLE_RULES = [
  { id: 'threaded', name: 'Disli delik', match: { threaded: true }, steps: [{ role: 'spot', depthRatio: 0.3 }, { role: 'drill', diaFrom: 'tapDrill' }, { role: 'chamfer', width: 0.5 }, { role: 'tap' }] },
  { id: 'plain', name: 'Duz delik', match: {}, steps: [{ role: 'spot', depthRatio: 0.3 }, { role: 'drill', diaFrom: 'hole', peckAboveRatio: 3, peckRatio: 1 }] },
];
const ROLE_ORDER = { spot: 0, drill: 1, ream: 2, chamfer: 3, tap: 4 };
const ROLE_TOOLS = { spot: ['spot'], drill: ['drill'], chamfer: ['spot', 'chamfer'], tap: ['tap'], ream: ['reamer'] };

// Delik sinifi: kor/boydan, disli, cap. thread: {major, pitch} (ya da kabul edilmis threadHint)
export function classifyHole(h, acceptThreadHint = false) {
  const th = h.thread && isNum(h.thread.major) && isNum(h.thread.pitch) ? h.thread : (acceptThreadHint && h.threadHint && isNum(h.threadHint.major) && isNum(h.threadHint.pitch) ? h.threadHint : null);
  return { dia: h.dia, through: !!h.through, threaded: !!th, thread: th ? { major: th.major, pitch: th.pitch } : null, depth: h.depth ?? null, kind: h.kind ?? null };
}
const ruleMatches = (r, c) => {
  const m = r.match || {};
  if (m.threaded != null && !!m.threaded !== c.threaded) return false;
  if (m.through != null && !!m.through !== c.through) return false;
  if (isNum(m.diaMin) && !(c.dia >= m.diaMin - 1e-9)) return false;
  if (isNum(m.diaMax) && !(c.dia <= m.diaMax + 1e-9)) return false;
  return true;
};
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

// holes: [{feature, dia, depth, through, thread, threadHint, tipAngle, ...}] (rebuild.holes / geom.holes). tools: kutuphane.
// opts: { rules, acceptThreadHint, newId(), pocketLike: 'skip'|'keep' } -> { ops: [drill islemleri], warnings, groups }
export function planHoleOps(holes, tools = [], opts = {}) {
  const rules = opts.rules || DEFAULT_HOLE_RULES; const newId = opts.newId || (() => 'op_' + Math.random().toString(36).slice(2, 10));
  const warnings = []; const groups = new Map(); let skipped = 0;
  for (const h of holes || []) {
    if (!h || !isNum(h.dia) || !(h.dia > 0)) continue;
    if (h.pocketLike && opts.pocketLike !== 'keep') { skipped++; continue; } // cep benzeri: delme dizisi uygun degil (WP-05 ile ayni kural)
    const c = classifyHole(h, opts.acceptThreadHint);
    const key = [r3(c.dia), c.through ? 'T' : 'B', c.threaded ? r3(c.thread.major) + 'x' + r3(c.thread.pitch) : '-', c.through ? '' : r3(c.depth ?? 0)].join('|');
    if (!groups.has(key)) groups.set(key, { key, c, features: [], count: 0 });
    const g = groups.get(key); g.count += (h.positions?.length ?? 1); if (h.feature != null && !g.features.includes(h.feature)) g.features.push(h.feature);
  }
  if (skipped) warnings.push(issue('cam.tpl.pocketlike_skipped', { n: skipped }));
  const ops = []; const outGroups = [];
  for (const g of groups.values()) {
    if (!g.features.length) { warnings.push(issue('cam.tpl.no_feature', { dia: g.c.dia })); continue; }
    const rule = rules.find((r) => ruleMatches(r, g.c));
    if (!rule) { warnings.push(issue('cam.tpl.no_rule', { dia: g.c.dia })); continue; }
    outGroups.push({ key: g.key, dia: g.c.dia, through: g.c.through, thread: g.c.thread, count: g.count, rule: rule.id });
    for (const st of rule.steps) {
      const role = st.role; if (!(role in ROLE_ORDER)) { warnings.push(issue('cam.tpl.bad_step', { role: String(role) })); continue; }
      const sizeDia = role === 'tap' ? g.c.thread?.major : role === 'drill' && st.diaFrom === 'tapDrill' ? (g.c.thread ? g.c.thread.major - g.c.thread.pitch : g.c.dia) : g.c.dia + (st.diaOffset ?? 0);
      if (role === 'tap' && !g.c.thread) { warnings.push(issue('cam.tpl.tap_no_thread', { dia: g.c.dia })); continue; }
      const toolDia = role === 'spot' || role === 'chamfer' ? null : sizeDia;
      // disli deligin on matkabi: standart matkap capi major-hatve'den biraz buyuk olabilir (6.75 -> 6.8): [-0.02, +0.12 hatve] araligi, en yakin
      const tapDrill = role === 'drill' && st.diaFrom === 'tapDrill' && g.c.thread;
      const diaOk = (t) => (toolDia == null ? true : tapDrill ? t.dia >= toolDia - 0.02 && t.dia <= toolDia + 0.12 * g.c.thread.pitch + 1e-9 : sameDia(t.dia, toolDia));
      const cands = tools.filter((t) => (ROLE_TOOLS[role] || []).includes(t.type) && diaOk(t) && (role !== 'tap' || (isNum(t.pitch) && Math.abs(t.pitch - g.c.thread.pitch) < 1e-6))).sort((a, b) => Math.abs(a.dia - (toolDia ?? a.dia)) - Math.abs(b.dia - (toolDia ?? b.dia)));
      // punta/pah: capi deligi kapsayan en kucuk (ya da yoksa ilk) punta takimi
      const tool = role === 'spot' || role === 'chamfer' ? (cands.filter((t) => t.dia >= g.c.dia - 1e-9).sort((a, b) => a.dia - b.dia)[0] || cands[0] || null) : (cands[0] || null);
      if (!tool) warnings.push(issue('cam.tpl.no_tool', { op: role, type: (ROLE_TOOLS[role] || [])[0] || role, dia: toolDia != null ? r3(toolDia) : '' }));
      const op = { id: newId(), type: 'drill', name: `${role} ${r3(g.c.dia)}${g.c.threaded ? ' M' + r3(g.c.thread.major) + 'x' + r3(g.c.thread.pitch) : ''}${g.c.through ? '' : ' kor'}`, toolId: tool ? tool.id : null, rpm: null, feedCut: null, feedPlunge: null, coolant: 'flood', heights: { clearance: 5, retract: 2 }, holes: { kind: 'feature', filter: { features: g.features.slice() } }, order: 'shortest', seqRole: role };
      if (role === 'spot') { op.cycle = 'spot'; op.depth = { from: 'top', d: Math.max(0.5, r1(g.c.dia * (st.depthRatio ?? 0.3))), tipComp: false }; }
      else if (role === 'chamfer') { const half = ((tool?.tipAngle || 90) * Math.PI) / 360; op.cycle = 'spot'; op.depth = { from: 'top', d: r3((g.c.dia / 2 + (st.width ?? 0.5)) / Math.tan(half)), tipComp: false }; if (tool && !(tool.tipAngle > 0)) warnings.push(issue('cam.tpl.chamfer_no_angle', { tool: tool.number })); }
      else if (role === 'tap') { op.cycle = 'tap'; op.depth = { from: 'hole', tipComp: false }; }
      else if (role === 'ream') { op.cycle = 'ream'; op.depth = { from: 'hole', tipComp: false, breakThrough: 1 }; }
      else { // drill
        const depth = g.c.through ? null : g.c.depth;
        const deep = isNum(st.peckAboveRatio) && isNum(depth) && depth / Math.max(sizeDia, 1e-9) > st.peckAboveRatio;
        op.cycle = deep ? 'peck' : 'drill'; if (deep) op.peck = r3(sizeDia * (st.peckRatio ?? 1));
        op.depth = { from: 'hole', tipComp: true, breakThrough: 1 };
      }
      for (const [k, v] of Object.entries(st.op || {})) if (k !== 'id' && k !== 'toolId') op[k] = clone(v); // kullanici kuralinin ek islem alanlari
      op._sortDia = sizeDia ?? g.c.dia;
      ops.push(op);
    }
  }
  // takim degisimini azaltmak icin: once rol sirasi (punta -> matkap -> raybalama -> pah -> kilavuz), sonra cap; ayni rolde kararli
  ops.sort((a, b) => (ROLE_ORDER[a.seqRole] - ROLE_ORDER[b.seqRole]) || (a._sortDia - b._sortDia));
  for (const o of ops) { delete o._sortDia; delete o.seqRole; }
  return { ops, warnings, groups: outGroups };
}
// Kural listesi dogrulama (kullanici JSON'u). Donus: gecerli kural listesi; hata CamErr.
export function checkHoleRules(list) {
  if (!Array.isArray(list) || !list.length || list.length > 50 || hasBadKey(list)) throw cerr('cam.tpl.bad_rules');
  return list.map((r, i) => {
    if (!r || typeof r.id !== 'string' || typeof r.name !== 'string' || !Array.isArray(r.steps) || !r.steps.length || r.steps.length > 12) throw cerr('cam.tpl.bad_rules', { index: i });
    for (const s of r.steps) if (!s || !(s.role in ROLE_ORDER)) throw cerr('cam.tpl.bad_step', { role: String(s?.role) });
    return clone(r);
  });
}
