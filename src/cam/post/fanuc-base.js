// Fanuc tarzi ortak post cekirdegi. Makineye/kontrole ozgu degerler KODA GOMULMEZ: ya ozellik (props) ya makine profili.
// Varsayilanlar genel Fanuc kurallaridir (spesifikasyonda M80V icin dogrulanmadi); turetilen postlar (mitsubishi-m80v.js) ezer.
// Bu dosyanin urettigi NC YALNIZ TEST CIKTISIDIR; makinede kosturulabilir diye sunulmaz.
import { createFormat, createVariable, createModal, sanitizeComment, perr, isEmptyProp, MIHENK_VERSION } from './engine.js';
import { describeIssue } from './describe.js';
import { expandCyclePoint } from '../cycles.js';

export const FANUC_DEFAULT_PROPS = {
  lineNumbers: false, lineNumberStart: 10, lineNumberStep: 10,
  programNumberDigits: 4, percentLeader: false, modelSummary: true,
  decimals: 3,
  decimalsInch: 4,               // WP-14: inc (G20) cikisinda uzunluk ondalik sayisi
  safeRetract: 'G28',            // 'G28' | 'G53' | null (null -> prop_missing)
  safeRetractZ: null,            // yalniz G53: makine Z konumu (mm)
  dwellAddress: 'P',             // G04 adresi: 'P' | 'X' | null
  dwellUnit: 'ms',               // G04 birimi: 'ms' | 's' | null
  cycleDwellAddress: 'P',        // G82/G89 bekleme adresi
  cycleDwellUnit: 'ms',
  coolantCodes: { flood: 'M8', mist: 'M7', air: null, through: null, off: 'M9' },
  optionalStop: false,           // her islem basinda M01
  rapidSplit: true,              // karisik XY+Z hizliyi guvenli siraya boler
  cannedCycles: true,            // false: acik hareket (yalniz drill/spot/ream/bore; fineBore/backBore acilir)
  cycleG76: true,                // false: ince delik (G76) cevrimi desteklenmiyor -> acik harekete acilir (uyari)
  cycleG87: true,                // false: arka havsa (G87) cevrimi desteklenmiyor -> acik harekete acilir (uyari)
  tapMode: 'feed',               // 'feed': F = devir x adim (+ rigidTapM); 'pitch': F = adim
  rigidTapM: 'M29',              // 'feed' kipinde G84 oncesi senkron kilavuz kodu (null: yazma)
  tapR1: false,                  // G84 satirina ,R1 ekle
  rotaryMode: '6a',              // '6a': NC A ekseni; '6b': A yazilmaz, M00 ile indeks
  aReturnZero: true,             // program sonunda A -> 0
  aSplit180: true,               // kisa yol kipinde 180 derece iki adimda
  g541Range: null,               // G54.1 Pn icin [min,max]; null -> G54.1 kullanilinca prop_missing
  highSpeedOn: null, highSpeedOff: null, // ornek 'G05 P10000' / 'G05 P0' (cift olmali)
  toolChangeCode: 'M6',
  endCode: 'M30',
  safeStartExtra: [],
  lineNumberMax: 99999,          // N ust siniri (genel Fanuc kurali; makinede teyit edilmedi). Asilinca bastan sarar + uyari.
};

const ucfirst = (s) => String(s).toUpperCase();

// Kapi sonucu -> NC basligi icin okunur metin (ASCII'ye writeComment cevirir). opts.gateText(g) verilirse o kullanilir
// (arayuz kullanicinin dilinde verebilir; Turkce karakterler yorumda ASCII'ye donusur); yoksa Ingilizce sozluk.
const COMMENT_MAX = 78; // model ozeti yorum metni ust siniri: parantezlerle satir en cok 80 karakter
function gateText(g, fn) {
  if (typeof fn === 'function') { try { const t = fn(g); if (t) return String(t); } catch (e) { /* sozluge dus */ } }
  return describeIssue(g);
}

export function createFanucPost(over = {}) {
  const base = {
    id: 'fanuc-generic',
    defaultProps: { ...FANUC_DEFAULT_PROPS },

    // ------------------------------------------------------------ yardimcilar (this = PostContext)
    _init() {
      // WP-14: opts.units === 'inch' -> G20, uzunluk/ilerleme degerleri mm'den inc'e olceklenir (IR daima mm). Aci, devir, bekleme degismez.
      const inch = this.opts.units === 'inch'; this.inch = inch; this.k = inch ? 1 / 25.4 : 1;
      const d = inch ? this.props.decimalsInch : this.props.decimals; this.dec = d; const sc = this.k;
      this.fmt = { xyz: createFormat({ decimals: d, scale: sc }), ang: createFormat({ prefix: 'A', decimals: 3 }), f: createFormat({ prefix: 'F', decimals: 3, scale: sc }), ij: createFormat({ decimals: d, scale: sc }) };
      this.v = {
        x: createVariable({ prefix: 'X', decimals: d, scale: sc }), y: createVariable({ prefix: 'Y', decimals: d, scale: sc }), z: createVariable({ prefix: 'Z', decimals: d, scale: sc }),
        f: createVariable({ prefix: 'F', decimals: 3, scale: sc }),
      };
      this.g = { motion: createModal({}), wcs: createModal({ force: true }), cyc: createModal({}) };
      // aCur null = tezgah A konumu BILINMIYOR (onceki is/elle): ilk indekslemede A mutlak yazilir (V-02)
      Object.assign(this.state, { tool: null, spindle: null, coolant: 'off', aCur: null, positioned: false, cycle: null, comp: false, highSpeed: false });
    },
    _resetPos() { this.v.x.reset(); this.v.y.reset(); this.v.z.reset(); },
    _dwellWord(addr, unit, s, inCycle = false) {
      if (inCycle && addr != null && 'XYZRQFI'.includes(addr)) throw perr('cam.post.bad_prop', { prop: 'cycleDwellAddress', value: String(addr) });
      if (isEmptyProp(addr)) throw perr('cam.post.prop_missing', { prop: inCycle ? 'cycleDwellAddress' : 'dwellAddress', post: this.post.id });
      if (isEmptyProp(unit)) throw perr('cam.post.prop_missing', { prop: inCycle ? 'cycleDwellUnit' : 'dwellUnit', post: this.post.id });
      if (unit === 'ms') return addr + String(Math.round(s * 1000));
      if (unit === 's') return createFormat({ prefix: addr, decimals: 3 }).format(s);
      throw perr('cam.post.bad_prop', { prop: 'dwellUnit', value: String(unit) });
    },
    _coolantCode(name) {
      const table = this.need('coolantCodes'); const c = table[name];
      if (isEmptyProp(c)) throw perr('cam.post.prop_missing', { prop: 'coolantCodes.' + name, post: this.post.id });
      return c;
    },
    _safeRetract() {
      const m = this.need('safeRetract');
      if (m === 'G28') {
        this.writeBlock('G90', 'G40', 'G49');
        this.writeBlock('G91', 'G28', 'Z0.');
        this.writeBlock('G90');
      } else if (m === 'G53') {
        const z = this.need('safeRetractZ');
        this.writeBlock('G90', 'G40', 'G49');
        this.writeBlock('G53', 'G0', createFormat({ prefix: 'Z', decimals: this.dec, scale: this.k }).format(z));
      } else throw perr('cam.post.bad_prop', { prop: 'safeRetract', value: String(m) });
      this.pos = null; this.v.x.reset(); this.v.y.reset(); this.v.z.reset(); this.g.motion.reset(); this.state.positioned = false;
    },

    // NC basligi model ozeti: belge adi (opts.modelSummary.doc), parca kutusu (opts.modelSummary.bbox [min,max] model uzayi), setup'lar (stok, parca, WCS, A), uretim zamani.
    // Her satir sanitizeComment'ten gecer (ASCII); kisisel veri/yol yazilmaz (belge adi yalniz dosya adidir: yol kisimlari atilir).
    _modelSummary() {
      const o = this.opts, prog = this.program, ms = o.modelSummary || {}, f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
      // Model ozeti satirlari en cok COMMENT_MAX karakter (profilde yorum uzunlugu alani yok; Fanuc bloklari 80 karakter civari): uzunsa '...' ile kisaltilir
      const cm = (t) => { const a = sanitizeComment(t); this.writeComment(a.length > COMMENT_MAX ? a.slice(0, COMMENT_MAX - 3) + '...' : a); };
      const size = (b) => (b && b.min && b.max ? [0, 1, 2].map((k) => f1(b.max[k] - b.min[k])).join(' x ') : null);
      if (ms.doc) cm(`MODEL ${String(ms.doc).split(/[\\/]/).pop()}`);
      const pb = size(ms.bbox); if (pb) cm(`PART SIZE ${pb} MM`);
      const seen = new Set();
      prog.sections.forEach((sec) => {
        const st = sec.setup, id = st.id ?? st.name ?? ''; if (seen.has(id)) return; seen.add(id);
        const stock = size(st.stockBox), part = size(st.modelBBox);
        cm(`SETUP ${seen.size} ${st.name ?? id}${st.workOffset?.kind ? ' WCS ' + st.workOffset.kind : ''}${stock ? ' STOCK ' + stock : ''}${part ? ' PART ' + part : ''}${st.aAngle != null ? ' A ' + f1(st.aAngle) : ''}`);
      });
      cm(`GENERATED ${o.generatedAt || o.date || new Date().toISOString()}`);
    },

    // ------------------------------------------------------------ giris fonksiyonlari
    onOpen() {
      post._init.call(this);
      const p = this.props, prog = this.program, o = this.opts;
      if (p.percentLeader) this.writeRaw('%');
      if (prog.number != null) {
        // O0 gecersiz; hane sayisini asan numara kesilmez/sarilmaz -> acik hata (V-21)
        if (!(Number.isInteger(prog.number) && prog.number >= 1 && String(prog.number).length <= p.programNumberDigits)) this.fail('cam.post.program_number', { number: prog.number, digits: p.programNumberDigits });
        this.writeBlock('O' + String(prog.number).padStart(p.programNumberDigits, '0'));
      }
      if (this.opts.units === 'inch') this.writeComment('UNITS INCH G20 - COMMENT DIMENSIONS ARE MM');
      this.writeComment(`UNVERIFIED POST - DOGRULANMADI - MIHENK ${o.appVersion || MIHENK_VERSION}`);
      this.writeComment(`PROGRAM ${prog.name}`);
      this.writeComment(`DATE ${o.date || new Date().toISOString().slice(0, 10)}`);
      if (this.machine) this.writeComment(`MACHINE ${this.machine.name ?? this.machine.id} REV ${this.machine.rev ?? '?'} CONTROL ${this.machine.control ?? '?'}`);
      if (p.modelSummary !== false) post._modelSummary.call(this); // WP-10: model ozeti (profilde post.props.modelSummary=false ile kapatilir)
      if (o.verified) this.writeComment(`VERIFIED BY ${o.verified.by} ON ${o.verified.date}`);
      const seen = new Map();
      for (const s of prog.sections) { const t = s.toolpath.tool; if (!seen.has(t.number)) seen.set(t.number, t); }
      for (const t of [...seen.values()].sort((a, b) => a.number - b.number)) {
        this.writeComment(`T${t.number} H${t.H}${t.D != null ? ' D' + t.D : ''} DIA ${t.dia.toFixed(3)} ${ucfirst(t.type)}`);
      }
      // 3+1: A isareti (machine.axes.A.dir) tezgahta isaretli parcayla teyit edilmeden NC'ye guvenilmez (V-01)
      if (this.rotary && prog.sections.some((s) => s.setup.aAngle != null)) this.writeComment('WARNING A AXIS DIRECTION NOT VERIFIED - CONFIRM ON MACHINE WITH A MARKED PART BEFORE CUTTING');
      const gates = o.gates || [];
      const nb = gates.filter((g) => g.level === 'block').length, nw = gates.filter((g) => g.level === 'warn').length;
      this.writeComment(`GATES ${nb} BLOCK ${nw} WARN`);
      for (const g of gates) this.writeComment(`${g.level === 'block' ? 'BLOCK' : 'WARNING'}: ${gateText(g, o.gateText)}`);
      this.writeBlock('G90', 'G17', this.inch ? 'G20' : 'G21', 'G40', 'G49', 'G80', 'G94', ...p.safeStartExtra);
      if (p.highSpeedOn != null || p.highSpeedOff != null) {
        this.need('highSpeedOn'); this.need('highSpeedOff');
        this.writeBlock(p.highSpeedOn); this.state.highSpeed = true;
      }
    },

    onSection(sec) {
      const tp = sec.toolpath, st = sec.setup, p = this.props, S = this.state;
      this.writeComment(`OP ${sec.index + 1}: ${tp.opName} [${tp.opType}] SETUP ${st.name ?? st.id ?? ''}`);
      post._safeRetract.call(this);
      // T-07: ayni takim + ayni setup (is koordinati ve A acisi) ve mil/sogutma zaten istenen durumdaysa M5/M9/S M3/M8
      // tekrarlanmaz; devir ya da sogutma degisiyorsa yalniz degisen yazilir. Mil yonu degisiyorsa once M5.
      const wo = st.workOffset, key = `${wo?.kind}|${wo?.p ?? ''}|${st.aAngle ?? 0}`;
      // program durdurma (M00/M01) varsa sadelestirme YOK: durmadan once M5/M9, sonra S M3 ve sogutma yeniden (mil/sogutma acikken durma yok)
      const keep = !p.optionalStop && S.tool === tp.tool.number && S.setupKey === key && !!S.spindle;
      const dirSame = keep && S.spindle.dir === tp.spindleDir;
      const rpmSame = dirSame && Math.round(S.spindle.rpm) === Math.round(tp.rpm);
      const coolSame = keep && S.coolant === tp.coolant;
      if (S.spindle && !dirSame) { this.writeBlock('M5'); S.spindle = null; }
      if (S.coolant !== 'off' && !coolSame) { this.writeBlock(post._coolantCode.call(this, 'off')); S.coolant = 'off'; }
      if (p.optionalStop) this.writeBlock('M01');
      if (S.tool !== tp.tool.number) { this.writeBlock('T' + tp.tool.number, p.toolChangeCode); S.tool = tp.tool.number; }
      post._indexRotary.call(this, st.aAngle ?? 0);
      if (!rpmSame) {
        if (dirSame) { const sv = Math.round(tp.rpm); if (!(sv >= 1)) this.fail('cam.post.bad_rpm', { rpm: tp.rpm }); this.writeBlock('S' + sv); S.spindle = { rpm: tp.rpm, dir: tp.spindleDir }; }
        else this.call('onSpindleSpeed', tp.rpm, tp.spindleDir);
      }
      S.setupKey = key;
      S.comp = false; S.compRequest = null; S.cycle = null;
      this.v.f.reset(); // V-04: bolumun ilk kesmesinde F daima yazilir (onceki takimdan modal kalmaz)
    },

    // 3+1: Z guvenli (onSection'da yapildi) -> [M11] -> A -> [M10]
    _indexRotary(angle) {
      const R = this.rotary, p = this.props, st = this.state;
      const eps = 1e-9;
      if (p.rotaryMode === '6b') {
        const prev = st.aShown;
        // ilk doner bolumde indeksleyici konumu bilinmez: talimat daima yazilir (V-02)
        if (prev == null ? this.section?.setup?.aAngle != null : Math.abs(angle - prev) > eps) {
          this.writeComment(`INDEX A TO ${angle.toFixed(3)} DEG THEN LOCK`);
          this.call('onCommand', 'COMMAND_STOP'); st.aShown = angle;
        }
        return;
      }
      if (!R) { if (Math.abs(angle) > eps) this.fail('cam.post.no_a_axis', { angle }); return; }
      if (R.sign == null) throw perr('cam.post.prop_missing', { prop: 'machine.axes.A.dir', post: this.post.id });
      // aAngle = A KELIMESI (docs/POST.md, CAM-DESIGN.md). Isaret (A.dir) YALNIZ cekirdek cercevesinde (resolveSetup) uygulanir;
      // burada ikinci kez uygulanmaz (V-01).
      let out = angle;
      if (R.limits && R.wrap !== 'signed' && (out < R.limits[0] - eps || out > R.limits[1] + eps)) this.fail('cam.post.a_out_of_limits', { angle: out, min: R.limits[0], max: R.limits[1] }); // signed: yazilan aciya asagida bakilir
      const norm = (a) => ((a % 360) + 360) % 360;
      if (R.wrap === 'shortest' || R.wrap === '0-360') out = norm(out);
      else if (R.wrap === 'signed') { out = norm(out); if (out > 180 + eps) out -= 360; }
      if (R.wrap === 'signed' || R.wrap === '0-360') { if (Math.abs(out) < 1e-9) out = 0; if (R.limits && (out < R.limits[0] - eps || out > R.limits[1] + eps)) this.fail('cam.post.a_out_of_limits', { angle: out, min: R.limits[0], max: R.limits[1] }); }
      const cur = st.aCur;
      const same = cur == null ? false : R.shortest ? Math.abs(norm(cur) - out) < 1e-6 || Math.abs(norm(cur) - out - 360) < 1e-6 : Math.abs(cur - out) < 1e-6;
      if (same) return;
      if (R.clamp.output) { if (R.clamp.unlock == null || R.clamp.lock == null) throw perr('cam.post.prop_missing', { prop: 'machine.axes.A.clamp', post: this.post.id }); this.call('onCommand', 'COMMAND_UNLOCK_MULTI_AXIS'); }
      const aOut = (v) => this.writeBlock('G0', createFormat({ prefix: 'A', decimals: 3 }).format(v));
      if (cur != null && R.shortest && p.aSplit180 && Math.abs(Math.abs(norm(cur) - out) - 180) < 1e-6) aOut(norm(norm(cur) + 90));
      aOut(out);
      st.aCur = out;
      if (R.clamp.output) this.call('onCommand', 'COMMAND_LOCK_MULTI_AXIS');
      this.g.motion.reset();
    },

    onSpindleSpeed(rpm, dir) {
      const s = Math.round(rpm);
      if (!(s >= 1)) this.fail('cam.post.bad_rpm', { rpm }); // V-23b: S0 ile kesme yok
      this.writeBlock('S' + s, dir === 'cw' ? 'M3' : 'M4');
      this.state.spindle = { rpm, dir };
    },

    onCommand(cmd) {
      const R = this.rotary;
      switch (cmd) {
        case 'COMMAND_STOP': this.writeBlock('M00'); break;
        case 'COMMAND_OPTIONAL_STOP': this.writeBlock('M01'); break;
        case 'COMMAND_STOP_SPINDLE': this.writeBlock('M5'); this.state.spindle = null; break;
        case 'COMMAND_COOLANT_OFF': this.writeBlock(post._coolantCode.call(this, 'off')); this.state.coolant = 'off'; break;
        case 'COMMAND_UNLOCK_MULTI_AXIS': if (R?.clamp.output) this.writeBlock(R.clamp.unlock); break;
        case 'COMMAND_LOCK_MULTI_AXIS': if (R?.clamp.output) this.writeBlock(R.clamp.lock); break;
        case 'COMMAND_END': this.writeBlock(this.props.endCode); break;
        default: throw perr('cam.post.unknown_command', { cmd });
      }
    },
    onComment(text) { this.writeComment(text); },

    // Ilk hareket: G0 XY (G43 oncesi) sonra G43 H Z; sonra sogutma
    onRapid(x, y, z) {
      const st = this.state, tp = this.section.toolpath;
      if (!st.positioned) {
        const w = this.section.setup.workOffset;
        let wcs;
        if (w.kind === 'G54.1') {
          const [lo, hi] = this.need('g541Range');
          if (w.p < lo || w.p > hi) this.fail('cam.post.wcs_range', { p: w.p, min: lo, max: hi });
          wcs = 'G54.1 P' + w.p;
        } else wcs = w.kind;
        this.writeBlock('G0', 'G90', wcs, this.v.x.formatForced(x), this.v.y.formatForced(y));
        this.g.motion.format(0);
        this.writeBlock('G43', 'H' + tp.tool.H, this.v.z.formatForced(z));
        const cc = tp.coolant;
        if (cc !== 'off' && st.coolant !== cc) { this.writeBlock(post._coolantCode.call(this, cc)); st.coolant = cc; }
        st.positioned = true;
        return;
      }
      if (!this.writeBlock(this.g.motion.format(0), this.v.x.format(x), this.v.y.format(y), this.v.z.format(z))) this.warn('cam.post.zero_move');
    },

    onRadiusCompensation(on, side, D) {
      this.state.compRequest = { on, side, D };
    },

    onLinear(x, y, z, f) {
      const st = this.state; let comp = '';
      if (st.compRequest) {
        const r = st.compRequest; st.compRequest = null;
        comp = r.on ? [r.side === 'left' ? 'G41' : 'G42', 'D' + r.D] : 'G40';
        st.comp = r.on;
      }
      if (!this.writeBlock(this.g.motion.format(1), comp, this.v.x.format(x), this.v.y.format(y), this.v.z.format(z), this.v.f.format(f))) this.warn('cam.post.zero_move');
    },

    onCircular(cw, cx, cy, cz, x, y, z, f) {
      const s = this.pos; const d = this.dec;
      const I = createFormat({ prefix: 'I', decimals: d, scale: this.k }), J = createFormat({ prefix: 'J', decimals: d, scale: this.k });
      // V-05: yuvarlanmis bitis = yuvarlanmis baslangic ise G2/G3 kontrolde TAM DAIRE olur. Yay bu cozunurlukte dogrudan
      // ayirt edilemiyorsa (sehim < yarim birim) dogruya cevrilir; degilse (buyuk yay acisi) acik hata.
      if (!this.fmt.xyz.areDifferent(x, s.x) && !this.fmt.xyz.areDifferent(y, s.y)) {
        const r = Math.hypot(cx - s.x, cy - s.y);
        const a0 = Math.atan2(s.y - cy, s.x - cx), a1 = Math.atan2(y - cy, x - cx);
        let sw = cw ? a0 - a1 : a1 - a0; sw = ((sw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const sag = sw <= Math.PI ? r * (1 - Math.cos(sw / 2)) : 2 * r;
        if (sag > 0.5 * Math.pow(10, -d) / this.k) this.fail('cam.post.arc_degenerate', { r: Math.round(r * 1000) / 1000 });
        this.warn('cam.post.arc_as_line');
        if (!this.writeBlock(this.g.motion.format(1), this.v.x.format(x), this.v.y.format(y), this.v.z.format(z), this.v.f.format(f))) this.warn('cam.post.zero_move');
        return;
      }
      this.writeBlock(this.g.motion.format(cw ? 2 : 3), this.v.x.format(x), this.v.y.format(y), this.v.z.format(z), I.format(cx - s.x), J.format(cy - s.y), this.v.f.format(f));
    },

    onDwell(s) {
      const p = this.props;
      this.writeBlock('G04', post._dwellWord.call(this, p.dwellAddress, p.dwellUnit, s));
      this.g.motion.reset();
    },

    // ------------------------------------------------------------ delik cevrimleri
    onCycle(c) {
      const p = this.props, tp = this.section.toolpath;
      this.state.cycle = { c, n: 0 };
      // WP-14: G76/G87 desteklenmiyorsa (profil ozelligi ya da cannedCycles:false) nokta basina acik harekete acilir; mil yonlendirme yok -> uyari
      if (c.cycle === 'fineBore' || c.cycle === 'backBore') {
        if (!p.cannedCycles || (c.cycle === 'fineBore' ? p.cycleG76 === false : p.cycleG87 === false)) {
          this.state.cycle.expand = true;
          this.warn('cam.post.cycle_expanded', { cycle: c.cycle });
          this.writeComment(`${c.cycle === 'fineBore' ? 'G76' : 'G87'} EXPANDED - NO SPINDLE ORIENT - CHECK SHIFT DIRECTION`);
          return;
        }
      } else if (!p.cannedCycles) {
        if (!['drill', 'spot', 'ream', 'bore'].includes(c.cycle)) this.fail('cam.post.cycle_unsupported', { cycle: c.cycle });
        return;
      }
      if (c.cycle === 'tap') {
        if (p.tapMode === 'feed') this.writeBlock(this.need('rigidTapM'), 'S' + Math.round(tp.rpm));
      }
    },
    _cycleCode(c) {
      const tp = this.section.toolpath;
      switch (c.cycle) {
        case 'drill': case 'spot': return c.dwell > 0 ? 82 : 81;
        case 'peck': return 83;
        case 'chipbreak': return 73;
        case 'tap': return tp.spindleDir === 'ccw' ? 74 : 84;
        case 'ream': return 85;
        case 'bore': return 89;
        case 'fineBore': return 76;
        case 'backBore': return 87;
        default: throw perr('cam.post.cycle_unsupported', { cycle: c.cycle });
      }
    },
    onCyclePoint(x, y, z) {
      const st = this.state, { c } = st.cycle, p = this.props, d = this.dec;
      const last = st.cycle.n === c.points.length - 1;
      if (st.cycle.expand) { // WP-14: acilmis G76/G87
        for (const s of expandCyclePoint(c, x, y, last)) {
          if (s.t === 'dwell') { this.writeBlock('G04', post._dwellWord.call(this, p.dwellAddress, p.dwellUnit, s.s)); this.g.motion.reset(); continue; }
          const xy = [s.x != null ? this.v.x.format(s.x) : '', s.y != null ? this.v.y.format(s.y) : ''], zw = s.z != null ? this.v.z.format(s.z) : '';
          this.writeBlock(this.g.motion.format(s.t === 'rapid' ? 0 : 1), ...xy, zw, s.t === 'feed' ? this.v.f.format(s.f) : '');
        }
        st.cycle.n++;
        return;
      }
      if (!p.cannedCycles) { // acik hareket: XY hizli, R'ye hizli, dibe kesme, bekleme, R'ye (son nokta: clearance) hizli
        const xy = [this.v.x.format(x), this.v.y.format(y)];
        if (xy.some(Boolean)) this.writeBlock(this.g.motion.format(0), ...xy);
        const rz = this.v.z.format(c.retract);
        if (rz) this.writeBlock(this.g.motion.format(0), rz);
        this.writeBlock(this.g.motion.format(1), this.v.z.format(c.bottom), this.v.f.format(c.f));
        if (c.dwell > 0) { this.writeBlock('G04', post._dwellWord.call(this, p.dwellAddress, p.dwellUnit, c.dwell)); this.g.motion.reset(); }
        this.writeBlock(this.g.motion.format(0), this.v.z.format(last || c.returnTo === 'clearance' ? c.clearance : c.retract));
        st.cycle.n++;
        return;
      }
      const code = post._cycleCode.call(this, c);
      const retr = (last || c.retract === c.clearance || c.returnTo === 'clearance' || code === 87) ? 'G98' : 'G99'; // G87 yalniz baslangic duzlemine doner
      const first = st.cycle.n === 0;
      const fmtd = (pre, v) => createFormat({ prefix: pre, decimals: d, scale: this.k }).format(v);
      if (first) {
        const words = [retr, 'G' + code, this.v.x.formatForced(x), this.v.y.formatForced(y), fmtd('Z', code === 87 ? c.cutTo : c.bottom), fmtd('R', code === 87 ? c.bottom : c.retract)]; // G87: R = alt baslangic, Z = ustte bitis
        if (code === 73 || code === 83) words.push(fmtd('Q', c.peck));
        if (code === 76 || code === 87) { words.push(fmtd('Q', c.shift)); if (c.dwell > 0) words.push(post._dwellWord.call(this, p.cycleDwellAddress, p.cycleDwellUnit, c.dwell, true)); }
        if (code === 82 || code === 89) words.push(post._dwellWord.call(this, p.cycleDwellAddress, p.cycleDwellUnit, c.dwell ?? 0, true));
        if (code === 84 || code === 74) {
          if (p.tapMode === 'pitch') words.push('F' + createFormat({ decimals: this.inch ? 5 : 3, scale: this.k }).format(c.pitch));
          else words.push(this.fmt.f.format(Math.round(this.section.toolpath.rpm) * c.pitch)); // V-23: F = (yazilan S) x adim; kesirli devirde adim bozulmaz
          if (p.tapR1) words.push(',R1');
        } else words.push(this.fmt.f.format(c.f));
        this.v.f.reset(); // cevrimde F degisti; sonraki kesme hareketi F'yi yeniden yazar
        this.writeBlock(words);
      } else {
        const rw = retr !== st.cycleRetr ? retr : '';
        const xs = this.v.x.format(x), ys = this.v.y.format(y);
        if (!rw && !xs && !ys) this.fail('cam.post.duplicate_point', { x, y });
        this.writeBlock(rw, xs, ys);
      }
      st.cycleRetr = retr;
      st.cycle.n++;
    },
    onCycleEnd() {
      if (this.props.cannedCycles && !this.state.cycle?.expand) this.writeBlock('G80');
      this.g.motion.reset(); this.v.x.reset(); this.v.y.reset(); this.v.z.reset();
      this.state.cycle = null;
    },

    onSectionEnd() {
      if (this.state.cycle) this.writeBlock('G80');
    },

    onClose() {
      const p = this.props, st = this.state;
      this.writeComment('END OF PROGRAM');
      post._safeRetract.call(this);
      if (p.rotaryMode === '6a' && this.rotary && p.aReturnZero) post._indexRotary.call(this, 0);
      else if (p.rotaryMode === '6b' && (st.aShown ?? 0) !== 0) this.writeComment('RESET INDEXER TO ZERO');
      if (st.spindle) this.writeBlock('M5');
      if (st.coolant !== 'off') this.writeBlock(post._coolantCode.call(this, 'off'));
      if (st.highSpeed) this.writeBlock(p.highSpeedOff);
      this.writeBlock(p.endCode);
      if (p.percentLeader) this.writeRaw('%');
    },
  };
  const post = { ...base, ...over, defaultProps: { ...base.defaultProps, ...(over.defaultProps || {}) } };
  return post;
}
