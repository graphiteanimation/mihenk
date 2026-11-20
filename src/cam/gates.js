// Guvenlik kapilari (CAM-DESIGN.md): 'block' varken NC uretilmez. Sonuc: [{level:'block'|'warn', code, params, opId?, section?}]
// 1 eksik veri, 2 dokunulmaz numara, 3 sinirlar, 4 dalma/boy, 5 simulasyon (B: src/cam/sim), 6 doner eksen.
// Ayrica islem uyarilari (toolpath.warnings) 'warn' olarak eklenir.
import { checkMachine, axisTravel } from './machines/builtin.js';
import { walk } from './ir.js';
import { simulate } from './sim/index.js';
import { postPropsMissing } from './post/needs.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const G = (level, c, params, extra) => ({ level, code: c, params: params || {}, ...(extra || {}) });
export const wcsName = (w) => (w ? (w.kind === 'G54.1' ? `G54.1 P${w.p}` : w.kind) : null);
// V-08: korunan listede 'G54.1P1' / 'g54.1 p1' gibi yazimlar ayni ofsettir: bosluksuz, buyuk harf karsilastir
const wcsKey = (s) => String(s).replace(/\s+/g, '').toUpperCase();
// iki nokta arasi XY uzunlugu (yay: yay boyu)
function xyLen(from, m) {
  if (m.t !== 'arc') return Math.hypot(m.x - from.x, m.y - from.y);
  const cx = from.x + m.i, cy = from.y + m.j, r = Math.hypot(m.i, m.j);
  const a0 = Math.atan2(from.y - cy, from.x - cx), a1 = Math.atan2(m.y - cy, m.x - cx);
  let sw = m.dir === 'ccw' ? a1 - a0 : a0 - a1; sw = ((sw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return r * sw;
}

// opts.sim: { res, modelHeightmaps?:{[setupId]}, tools?:{[number]:{shaftDia, holder}}, ...diger simulate secenekleri } | false
export function gates(program, machine, opts = {}) {
  const out = [];
  const secs = program?.sections || [];
  // ---- 1: makine profili
  const mc = checkMachine(machine);
  for (const e of mc.errors) out.push(G('block', 'cam.gate.machine_invalid', e.params));
  for (const f of mc.missing) out.push(G('block', 'cam.gate.missing', { field: 'machine.' + f }));
  // M-03: yalniz BU programin gercekten kullandigi bos post ozellikleri engel (kullanilmayanin boslugu engel degil)
  if (machine && !mc.errors.length && secs.length) {
    let pm = null; try { pm = postPropsMissing(program, machine); } catch (e) { pm = null; /* bilinmeyen kontrol vb.: post kendisi bildirir */ }
    for (const p of pm?.missing || []) out.push(G('block', 'cam.gate.post_prop_missing', { prop: p }));
  }
  const prot = machine?.protected || { T: [], H: [], D: [], wcs: [] };
  const maxRpm = machine?.spindle?.maxRpm, minRpm = machine?.spindle?.minRpm, maxF = machine?.feed?.maxCut, maxTools = machine?.toolChange?.maxTools;
  const absWarned = new Set(); const geomWarned = new Set();
  const bodyCand = [];
  secs.forEach((s, si) => {
    const tp = s.toolpath || {}; const opId = tp.opId; const T = tp.tool || {}; const X = { opId, section: si };
    // ---- 1: eksik veri
    if (!Number.isInteger(T.number) || T.number < 1) out.push(G('block', 'cam.gate.missing', { field: 'tool.number', op: tp.opName }, X));
    if (!Number.isInteger(T.H) || T.H < 1) out.push(G('block', 'cam.gate.missing', { field: 'tool.H', op: tp.opName }, X));
    if (tp.comp === 'wear' && !(Number.isInteger(T.D) && T.D >= 1)) out.push(G('block', 'cam.gate.missing', { field: 'tool.D', op: tp.opName }, X));
    if (!(isNum(tp.rpm) && tp.rpm > 0)) out.push(G('block', 'cam.gate.missing', { field: 'rpm', op: tp.opName }, X));
    else if (Math.round(tp.rpm) < 1) out.push(G('block', 'cam.gate.rpm_low', { rpm: tp.rpm, min: 1, op: tp.opName }, X)); // V-23b: S0
    const wo = s.setup?.workOffset; if (!wo || !wo.kind) out.push(G('block', 'cam.gate.missing', { field: 'workOffset', op: tp.opName }, X));
    let fMax = 0; let fBad = false;
    walk(tp, (m) => { if (m.t === 'feed' || m.t === 'arc' || m.t === 'cycle') { if (!(isNum(m.f) && m.f > 0)) fBad = true; else fMax = Math.max(fMax, m.f); } });
    if (fBad) out.push(G('block', 'cam.gate.missing', { field: 'feed', op: tp.opName }, X));
    // T-11: sap capi / uc duz capi verilmediyse simulasyon varsayim yapar (sap = kesici capi, uc keskin): takim basina bir kez uyar
    if (Number.isInteger(T.number) && !geomWarned.has(T.number)) {
      geomWarned.add(T.number); const st = opts.sim && typeof opts.sim === 'object' ? opts.sim.tools?.[T.number] : null;
      if (!isNum(T.shaftDia) && !isNum(st?.shaftDia)) out.push(G('warn', 'cam.gate.tool_geom_assumed', { tool: T.number, field: 'shaftDia' }, { section: si }));
      if (T.type === 'chamfer' && !isNum(T.tipDia) && !isNum(st?.tipDia)) out.push(G('warn', 'cam.gate.tool_geom_assumed', { tool: T.number, field: 'tipDia' }, { section: si }));
    }
    // ---- 2: dokunulmaz numaralar
    if ((prot.T || []).includes(T.number)) out.push(G('block', 'cam.gate.protected', { kind: 'T', value: T.number, op: tp.opName }, X));
    if ((prot.H || []).includes(T.H)) out.push(G('block', 'cam.gate.protected', { kind: 'H', value: T.H, op: tp.opName }, X));
    if (tp.comp === 'wear' && (prot.D || []).includes(T.D)) out.push(G('block', 'cam.gate.protected', { kind: 'D', value: T.D, op: tp.opName }, X));
    const wn = wcsName(wo); if (wn && (prot.wcs || []).map(wcsKey).includes(wcsKey(wn))) out.push(G('block', 'cam.gate.protected', { kind: 'WCS', value: wn, op: tp.opName }, X));
    // ---- 3: sinirlar
    if (isNum(maxRpm) && tp.rpm > maxRpm) out.push(G('block', 'cam.gate.rpm_high', { rpm: tp.rpm, max: maxRpm, op: tp.opName }, X));
    if (isNum(minRpm) && tp.rpm < minRpm) out.push(G('block', 'cam.gate.rpm_low', { rpm: tp.rpm, min: minRpm, op: tp.opName }, X));
    if (isNum(maxF) && fMax > maxF) out.push(G('block', 'cam.gate.feed_high', { f: fMax, max: maxF, op: tp.opName }, X));
    if (isNum(maxTools) && T.number > maxTools) out.push(G('block', 'cam.gate.tool_number_high', { number: T.number, max: maxTools, op: tp.opName }, X));
    const bb = tp.stats?.bbox;
    if (bb) ['X', 'Y', 'Z'].forEach((k, i) => { const tr = axisTravel(machine, k); const span = bb.max[i] - bb.min[i]; if (isNum(tr) && span > tr + 1e-9) out.push(G('block', 'cam.gate.travel', { axis: k, span: Math.round(span * 1000) / 1000, travel: tr, op: tp.opName }, X)); });
    const sid = s.setup?.id; if (!s.setup?.machinePos && !absWarned.has(sid)) { absWarned.add(sid); out.push(G('warn', 'cam.gate.travel_abs_unchecked', { setup: s.setup?.name ?? sid }, { section: si })); }
    // ---- 4: dalma, kesici boyu, govde boyu
    const box = s.setup?.stockBox; const stockTop = box ? box.max[2] : tp.meta?.stockTop;
    if (T.centerCutting === false) {
      // V-09/V-10: hareket TURUNE degil geometriye bakilir. Stok ayak izi icinde, stok ustunun altinda:
      //  - XY'siz asagi her ilerleme (bu islemde bosaltilmis bolgeye 'clear' inis haric) -> dalma
      //  - XY'li asagi ilerleme (rampa/helis) -> aci takimin maxRampAngle'ini asmamali; tanimsizsa engel (tahmin yok)
      let bad = false, rampMax = 0, rampAt = false;
      walk(tp, (m, k, from) => {
        if (!from) return;
        // delme cevrimleri merkezden kesen uc ister; kilavuz/rayba/bara ONCEDEN DELINMIS deliğe girer (V-27: yanlis engel idi)
        if (m.t === 'cycle') { if (!['tap', 'ream', 'bore'].includes(m.cycle)) bad = true; return; }
        if (m.t !== 'feed' && m.t !== 'arc') return;
        if (!(m.z < from.z - 1e-9) || !isNum(stockTop) || !(m.z < stockTop - 1e-6)) return;
        const inside = !box || (m.x > box.min[0] + 1e-6 && m.x < box.max[0] - 1e-6 && m.y > box.min[1] + 1e-6 && m.y < box.max[1] - 1e-6);
        if (!inside) return;
        const L = xyLen(from, m), dz = Math.min(from.z, stockTop) - m.z; if (!(dz > 1e-9)) return;
        if (L < 1e-6) { if (!(m.t === 'feed' && m.clear)) bad = true; return; }
        rampAt = true; rampMax = Math.max(rampMax, Math.atan2(from.z - m.z, L) * 180 / Math.PI);
      });
      if (bad) out.push(G('block', 'cam.gate.plunge_center', { tool: T.number, op: tp.opName }, X));
      if (rampAt) {
        if (!isNum(T.maxRampAngle)) out.push(G('block', 'cam.gate.ramp_no_limit', { tool: T.number, op: tp.opName }, X));
        else if (rampMax > T.maxRampAngle + 1e-6) out.push(G('block', 'cam.gate.ramp_center', { tool: T.number, angle: Math.round(rampMax * 100) / 100, max: T.maxRampAngle, op: tp.opName }, X));
      }
    }
    const pd = tp.meta?.passDepth; if (isNum(pd) && isNum(T.fluteLen) && pd > T.fluteLen + 1e-9) out.push(G('block', 'cam.gate.flute_short', { depth: Math.round(pd * 1000) / 1000, fluteLen: T.fluteLen, op: tp.opName }, X));
    // T-08: govde boyu yerel stok yuksekligine gore (sim sonrasi, asagida); burada yalniz aday kaydedilir
    const zMin = tp.stats?.zMin; if (isNum(zMin) && isNum(stockTop) && isNum(T.bodyLen)) bodyCand.push({ si, zMin, stockTop, bodyLen: T.bodyLen, op: tp.opName, X, at: out.length });
    // ---- 6: doner eksen
    const a = s.setup?.aAngle;
    if (a != null && a !== 0) {
      const A = machine?.axes?.A;
      if (!A || A.kind !== 'rotary') out.push(G('block', 'cam.gate.no_rotary', { op: tp.opName }, X));
      else if (Array.isArray(A.limits) && (a < A.limits[0] - 1e-9 || a > A.limits[1] + 1e-9)) out.push(G('block', 'cam.gate.a_limit', { a, min: A.limits[0], max: A.limits[1], op: tp.opName }, X));
    }
    // islem uyarilari
    for (const w of tp.warnings || []) out.push(G('warn', w.code, { ...w.params, op: tp.opName }, X));
  });
  // ---- 6: A isareti makinede dogrulanmadi (V-01): profil A.dir'i yanlis girilmisse yol ters yuze gider
  if (machine?.axes?.A && secs.some((s) => s.setup?.aAngle != null)) out.push(G('warn', 'cam.gate.a_dir_unverified', { dir: JSON.stringify(machine.axes.A.dir ?? null) }));
  // ---- 5: simulasyon (yalniz once gelen kapilar engellemiyorsa anlamli; yine de calistirilir)
  let simSec = null;
  if (opts.sim === false || !opts.sim) out.push(G('warn', 'cam.gate.sim_not_run', {}));
  else if (secs.length) {
    const stockBoxes = {}; for (const s of secs) if (s.setup?.stockBox) stockBoxes[s.setup.id] = s.setup.stockBox;
    // V-06: model haritasi yoksa oyma denetlenemez -> engel (sessizce kapali denetim yok)
    const hasModel = (id) => !!(opts.sim.modelHeightmaps?.[id]?.data || opts.sim.modelHeightmap?.data);
    const seenS = new Set();
    secs.forEach((s, si) => { const id = s.setup?.id; if (seenS.has(id)) return; seenS.add(id); if (!hasModel(id)) out.push(G('block', 'cam.gate.sim_no_model', { setup: s.setup?.name ?? id }, { section: si })); });
    // V-11: hucre merkezi takim diskine dusmezse hizli/carpma gorulmez -> cozunurluk en kucuk takim yaricapindan buyuk olamaz
    const res = opts.sim.res;
    if (isNum(res) && res > 0) {
      let rMin = Infinity, tMin = null; for (const s of secs) { const T = s.toolpath?.tool; if (T && isNum(T.dia) && T.dia / 2 < rMin) { rMin = T.dia / 2; tMin = T.number; } }
      if (res > rMin + 1e-9) out.push(G('block', 'cam.gate.sim_res_coarse', { res, r: rMin, tool: tMin }));
      // V-24: duvar hucre sinirina hizaliyken res/2'ye kadar yanal oyma haritada gorunmez -> denetimin siniri acikca yazilir
      out.push(G('warn', 'cam.gate.sim_lateral_tol', { tol: Math.round((res / 2) * 1000) / 1000 }));
    }
    try {
      const res = simulate(program, { stockBoxes, ...opts.sim });
      simSec = res.sections || null;
      for (const it of res.issues) out.push(G(it.level === 'error' ? 'block' : 'warn', it.code, it.params, { opId: secs[it.section]?.toolpath?.opId, section: it.section, moveIndex: it.moveIndex }));
      if (res.suppressed) out.push(G('warn', 'cam.gate.sim_suppressed', { n: res.suppressed }));
    } catch (e) { out.push(G('block', 'cam.gate.sim_failed', { code: e.code || 'internal', ...(e.params || {}) })); }
  }
  // ---- 4 (T-08): govde boyu. Derinlik = islem basinda yol bandindaki en yuksek stok hucresi (sim haritasi) - zMin.
  // Sim yoksa ya da tutucu geometrisi bilinmiyorsa (bant yalniz takim capi kadar olurdu) eski muhafazakar hesap: ilk stok ustu - zMin.
  const bodyOut = [];
  for (const c of bodyCand) {
    const st = simSec?.[c.si];
    const local = st && st.envelope === 'holder' && st.localTop != null;
    const top = local ? st.localTop : c.stockTop;
    const depth = top - c.zMin;
    if (depth > c.bodyLen + 1e-9) {
      bodyOut.push([c.at, G('block', 'cam.gate.body_short', { depth: Math.round(depth * 1000) / 1000, bodyLen: c.bodyLen, op: c.op }, c.X)]);
      if (!local) bodyOut.push([c.at, G('warn', 'cam.gate.body_short_conservative', { op: c.op }, c.X)]);
    }
  }
  // eski sirayla (islemin diger kapilarinin yanina) yerlestir
  for (let k = bodyOut.length - 1; k >= 0; k--) out.splice(bodyOut[k][0], 0, bodyOut[k][1]);
  return out;
}
export const blocked = (list) => list.some((g) => g.level === 'block');
