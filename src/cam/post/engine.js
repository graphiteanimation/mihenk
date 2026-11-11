// Post motoru: Fusion giris-fonksiyonu adlariyla olay akisi (onOpen, onSection, onRapid, onLinear, onCircular, onCycle,
// onCyclePoint, onCycleEnd, onDwell, onSpindleSpeed, onCommand, onComment, onSectionEnd, onClose) + yardimcilar
// (createFormat, createVariable, createModal, writeBlock, writeComment). Saf JS; eval yok; kullanici betigi yuklenmez.
// Cikti: metin + satir -> (section, move) eslemesi. Uretilen NC yalniz test ciktisidir; DOGRULANMADI basligi daima yazilir.
import { KErr } from '../../shared/errors.js';
import { validateProgram, splitRapid, arcCenter } from '../ir.js';

export const MIHENK_VERSION = '0.2.0'; // yalniz baslik yorumu icin; opts.appVersion ile ezilir
export const perr = (code, params = {}) => new KErr(code, params);

// ---------------------------------------------------------------- yorum ASCII'ye cevirme
const TR_MAP = { '\u011f': 'g', '\u011e': 'G', '\u00fc': 'u', '\u00dc': 'U', '\u015f': 's', '\u015e': 'S', '\u0131': 'i', '\u0130': 'I', '\u00f6': 'o', '\u00d6': 'O', '\u00e7': 'c', '\u00c7': 'C' };
export function sanitizeComment(text) {
  let s = String(text ?? '');
  s = s.replace(/[ğĞüÜşŞıİöÖçÇ]/g, (c) => TR_MAP[c]);
  s = s.replace(/\u00b0/g, ' DEG').replace(/\u2026/g, '...').replace(/[\u2013\u2014]/g, '-').replace(/[\u201c\u201d\u00ab\u00bb]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\u00d7/g, 'x').replace(/\u2192/g, '->').replace(/[\u2264]/g, '<=').replace(/[\u2265]/g, '>=');
  s = s.replace(/[()]/g, (c) => (c === '(' ? '[' : ']'));
  s = s.replace(/[\r\n\t]+/g, ' ');
  s = s.replace(/[^\x20-\x7e]/g, '?');
  s = s.replace(/[%;]/g, '?');
  return s.trim();
}

// ---------------------------------------------------------------- bicim / degisken / modal
export function createFormat(spec = {}) {
  const { prefix = '', decimals = 3, forceDecimal = true, trim = true, scale = 1 } = spec;
  const fmt = {
    prefix,
    value(v) { return Number((v * scale).toFixed(decimals)) + 0; },
    format(v) {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw perr('cam.post.bad_number', { prefix, value: String(v) });
      const fixed = (v * scale).toFixed(decimals);
      if (/e/i.test(fixed)) throw perr('cam.post.bad_number', { prefix, value: String(v) }); // V-20: 1e21 ve ustu bilimsel gosterime kacar
      let neg = fixed.startsWith('-'); let body = neg ? fixed.slice(1) : fixed;
      if (decimals > 0 && trim && body.includes('.')) body = body.replace(/\.?0+$/, '');
      if (body === '' || /^0*\.?0*$/.test(body)) { neg = false; if (body === '') body = '0'; }
      if (forceDecimal && !body.includes('.')) body += '.';
      return prefix + (neg ? '-' : '') + body;
    },
    areDifferent(a, b) { return fmt.format(a) !== fmt.format(b); },
  };
  return fmt;
}
// Degismeyen degeri bastirir.
export function createVariable(spec = {}, format = createFormat(spec)) {
  let last = null, off = false;
  return {
    format(v) { if (off) return ''; const s = format.format(v); if (s === last) return ''; last = s; return s; },
    formatForced(v) { const s = format.format(v); last = s; return s; },
    reset() { last = null; }, disable() { off = true; }, enable() { off = false; },
    getCurrent() { return last; },
  };
}
// Modal grup: ayni kod tekrarlanmaz. format(n) -> 'G1' ya da ''.
export function createModal(spec = {}, format = createFormat({ prefix: 'G', decimals: 0, forceDecimal: false, ...spec })) {
  let last = null;
  return {
    format(v) { const s = format.format(v); if (!spec.force && s === last) return ''; last = s; return s; },
    reset() { last = null; }, getCurrent() { return last; },
  };
}

// ---------------------------------------------------------------- ozellik cozumleme
export function resolveProps(post, machine, overrides) {
  const out = { ...post.defaultProps };
  for (const src of [machine?.post?.props, overrides]) {
    if (!src) continue;
    for (const k of Object.keys(src)) {
      if (!(k in post.defaultProps)) throw perr('cam.post.unknown_prop', { prop: k, post: post.id });
      out[k] = src[k];
    }
  }
  return out;
}
// Makine profilinden A ekseni (varsa) bilgisi
export function resolveRotary(machine) {
  const A = machine?.axes?.A;
  if (!A) return null;
  const dir = Array.isArray(A.dir) ? A.dir : null;
  return {
    sign: dir ? (dir[0] < 0 ? -1 : 1) : null,
    limits: A.limits ?? null, shortest: !!A.shortest,
    clamp: { lock: A.clamp?.lock ?? null, unlock: A.clamp?.unlock ?? null, output: !!A.clamp?.output },
  };
}

// ---------------------------------------------------------------- baglam
export class PostContext {
  constructor(post, program, machine, props, opts) {
    this.post = post; this.program = program; this.machine = machine; this.props = props; this.opts = opts;
    this.lines = []; this.lineMap = []; this.warnings = []; this.state = {};
    this.cur = { section: null, move: null }; this.lineNo = 0;
    this.pos = null; this.section = null; this.sectionIndex = -1;
    this.rotary = resolveRotary(machine);
  }
  need(name) { const v = this.props[name]; if (v === null || v === undefined) throw perr('cam.post.prop_missing', { prop: name, post: this.post.id }); return v; }
  fail(code, params = {}) { throw perr(code, { ...params, section: this.cur.section, move: this.cur.move }); }
  warn(code, params = {}) { this.warnings.push({ code, params: { ...params, section: this.cur.section, move: this.cur.move } }); }
  writeBlock(...words) {
    const w = words.flat().filter((x) => x !== '' && x != null && x !== false);
    if (!w.length) return false;
    let text = w.join(' ');
    if (this.props.lineNumbers) {
      const n = this.props.lineNumberStart + this.lineNo * this.props.lineNumberStep;
      // V-22: N ust sinirini asan numara kontrolde alarm/yanlis eslesme -> acik hata (satir numarasini kapatin ya da adimi kucultun)
      let n2 = n; const max = this.props.lineNumberMax;
      if (max != null && n > max) { // V-22: N ust sinirinda numara bastan sarar (Fusion postlari gibi); N yalniz etikettir, uyari verilir
        const span = Math.max(1, Math.floor((max - this.props.lineNumberStart) / this.props.lineNumberStep) + 1);
        n2 = this.props.lineNumberStart + (this.lineNo % span) * this.props.lineNumberStep;
        if (!this.wrapped) { this.wrapped = true; this.warnings.push({ code: 'cam.post.line_number_wrapped', params: { max } }); }
      }
      text = 'N' + n2 + ' ' + text; this.lineNo++;
    }
    this.lines.push(text); this.lineMap.push({ ...this.cur });
    return true;
  }
  writeComment(text) {
    const s = sanitizeComment(text);
    this.lines.push('(' + s + ')'); this.lineMap.push({ ...this.cur });
  }
  writeRaw(text) { this.lines.push(text); this.lineMap.push({ ...this.cur }); }
}

const need = (post, name) => { if (typeof post[name] !== 'function') throw perr('cam.post.entry_missing', { entry: name, post: post.id }); return post[name]; };

// ---------------------------------------------------------------- calistirma
// post: {id, defaultProps, onOpen,...}; program: IR Program; machine: makine profili.
// opts: {props, date, appVersion, gates, verified:{by,date,note}, lineNumbers}
export function runPost(post, program, machine, opts = {}) {
  validateProgram(program);
  const props = resolveProps(post, machine, opts.props);
  const ctx = new PostContext(post, program, machine, props, opts);
  const call = (name, ...a) => need(post, name).apply(ctx, a);
  ctx.call = call;
  call('onOpen');
  program.sections.forEach((sec, si) => {
    ctx.sectionIndex = si; ctx.section = sec; ctx.cur = { section: si, move: null }; ctx.pos = null;
    const tp = sec.toolpath;
    call('onSection', { ...sec, index: si, first: si === 0, last: si === program.sections.length - 1 });
    let kind = null; let pendingComp = null; let pos = null;
    tp.moves.forEach((m, k) => {
      ctx.cur = { section: si, move: k };
      if (m.t === 'rapid') {
        const parts = props.rapidSplit ? splitRapid(pos, m) : [m];
        for (const p of parts) { call('onRapid', p.x, p.y, p.z); ctx.pos = pos = { x: p.x, y: p.y, z: p.z }; }
      } else if (m.t === 'feed') {
        if (m.kind !== kind) { kind = m.kind; if (post.onMovement) call('onMovement', kind); }
        if (pendingComp) { call('onRadiusCompensation', pendingComp.on, tp.compSide, tp.tool.D); }
        call('onLinear', m.x, m.y, m.z, m.f);
        pendingComp = null; ctx.pos = pos = { x: m.x, y: m.y, z: m.z };
      } else if (m.t === 'arc') {
        if (m.kind !== kind) { kind = m.kind; if (post.onMovement) call('onMovement', kind); }
        const c = arcCenter(pos, m);
        call('onCircular', m.dir === 'cw', c.cx, c.cy, pos.z, m.x, m.y, m.z, m.f);
        ctx.pos = pos = { x: m.x, y: m.y, z: m.z };
      } else if (m.t === 'cycle') {
        call('onCycle', m);
        for (const p of m.points) call('onCyclePoint', p[0], p[1], m.bottom);
        call('onCycleEnd');
        const lp = m.points[m.points.length - 1]; ctx.pos = pos = { x: lp[0], y: lp[1], z: m.clearance };
      } else if (m.t === 'dwell') call('onDwell', m.s);
      else if (m.t === 'comp') { pendingComp = { on: m.on }; ctx.state.pendingComp = pendingComp; }
    });
    ctx.cur = { section: si, move: null };
    call('onSectionEnd');
  });
  ctx.cur = { section: null, move: null };
  call('onClose');
  if (post.onTerminate) call('onTerminate');
  return { text: ctx.lines.join('\n') + '\n', lines: ctx.lines, lineMap: ctx.lineMap, warnings: ctx.warnings, props };
}
