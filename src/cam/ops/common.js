// Islemler icin ortak: alan denetimi, yukseklikler, hareket kurucu (IR), baglama (linking), takim yolu sonlandirma.
// Baglama kurali (CAM-DESIGN.md): yatay HIZLI hareket yalniz retract ya da clearance duzleminde yapilir ve her ikisi de
// stok ustunun (stockTop) UZERINDEDIR; boylece hizli hareket asla stok icinde yatay gitmez. Inis: retract'tan ilerlemeyle.
import { cerr, issue } from '../geom/err.js';
import * as P from '../geom/path2d.js';
import { mk, computeStats, validateToolpath, ARC_MIN_CHORD } from '../ir.js';
import { irTool } from '../tools.js';

export const COOLANTS = ['flood', 'mist', 'air', 'through', 'off'];
export const LINK_FAR_FACTOR = 10;   // takim capinin bu katindan uzun gecis clearance duzleminden yapilir
export const LINK_FAR_MIN = 20;      // mm
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function need(op, field, ok = (v) => isNum(v) && v > 0, expect = 'number > 0') {
  const v = field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), op);
  if (v === undefined || v === null) throw cerr('cam.op.missing', { field, op: op.name || op.id });
  if (!ok(v)) throw cerr('cam.op.bad_field', { field, expect, op: op.name || op.id });
  return v;
}
export function opt(op, field, ok, expect, def) {
  const v = field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), op);
  if (v === undefined || v === null) return def;
  if (!ok(v)) throw cerr('cam.op.bad_field', { field, expect, op: op.name || op.id });
  return v;
}
export const posNum = (v) => isNum(v) && v > 0;
export const nonNeg = (v) => isNum(v) && v >= 0;
export const anyNum = (v) => isNum(v);

// T-10: stockToLeave her iki bicimde de verilebilir: sayi n (-> {radial: n, axial: n}) ya da {radial?, axial?}. Ic gosterim daima {radial, axial}.
// face yalniz axial'i kullanir (sayi eski davranisla ayni: eksenel pay).
export function stockToLeave(op) {
  const v = op.stockToLeave; const name = op.name || op.id;
  if (v === undefined || v === null) return { radial: 0, axial: 0 };
  if (typeof v === 'number') { if (!nonNeg(v)) throw cerr('cam.op.bad_field', { field: 'stockToLeave', expect: 'number >= 0 / {radial, axial}', op: name }); return { radial: v, axial: v }; }
  if (typeof v === 'object' && !Array.isArray(v)) {
    const g = (k) => { const x = v[k]; if (x === undefined || x === null) return 0; if (!nonNeg(x)) throw cerr('cam.op.bad_field', { field: 'stockToLeave.' + k, expect: 'number >= 0', op: name }); return x; };
    return { radial: g('radial'), axial: g('axial') };
  }
  throw cerr('cam.op.bad_field', { field: 'stockToLeave', expect: 'number >= 0 / {radial, axial}', op: name });
}

// Ortak kesme verisi: rpm, ilerlemeler, sogutma
export function cutting(op) {
  const rpm = need(op, 'rpm'), feedCut = need(op, 'feedCut'), feedPlunge = need(op, 'feedPlunge');
  const feedRamp = opt(op, 'feedRamp', posNum, 'number > 0', feedCut);
  const coolant = need(op, 'coolant', (v) => COOLANTS.includes(v), COOLANTS.join('/'));
  return { rpm, feedCut, feedPlunge, feedRamp, coolant };
}

// Yukseklikler (setup uzayi, mutlak z). sel: secimden gelen z (yuz/delik); modelTop/Bottom: S.modelBBox.
// clearance/retract: stok ustunden (mm, > 0). top/bottom: {from, off}.
export function heights(op, S, sel = {}) {
  const h = op.heights; if (!h || typeof h !== 'object') throw cerr('cam.op.missing', { field: 'heights', op: op.name || op.id });
  const clr = need(op, 'heights.clearance'), ret = need(op, 'heights.retract');
  if (ret > clr + 1e-9) throw cerr('cam.heights.retract_above_clearance', { retract: ret, clearance: clr });
  const stockTop = S.stockBox.max[2], stockBot = S.stockBox.min[2];
  const ref = (spec, which) => {
    if (!spec || typeof spec !== 'object') throw cerr('cam.op.missing', { field: 'heights.' + which, op: op.name || op.id });
    const off = spec.off ?? 0; if (!isNum(off)) throw cerr('cam.op.bad_field', { field: `heights.${which}.off`, expect: 'number', op: op.name || op.id });
    switch (spec.from) {
      case 'stockTop': return stockTop + off;
      case 'stockBottom': return stockBot + off;
      case 'modelTop': return S.modelBBox.max[2] + off;
      case 'modelBottom': return S.modelBBox.min[2] + off;
      case 'selection': if (!isNum(sel[which])) throw cerr('cam.heights.no_selection', { which }); return sel[which] + off;
      case 'abs': return off;
      default: throw cerr('cam.op.bad_field', { field: `heights.${which}.from`, expect: 'stockTop/modelTop/selection/abs/…', op: op.name || op.id });
    }
  };
  const zTop = ref(h.top, 'top'), zBot = ref(h.bottom, 'bottom');
  const zClr = stockTop + Math.max(clr, S.clearance ?? 0), zRet = stockTop + ret;
  if (zTop > zRet - 1e-9) throw cerr('cam.heights.top_above_retract', { top: zTop, retract: zRet });
  return { zClr, zRet, zTop, zBot, stockTop };
}

// Derinlik seviyeleri: zTop'tan zBot'a, her biri <= stepdown; finish: son paso kalinligi (varsa)
export function depthLevels(zTop, zBot, stepdown, finish) {
  const H = zTop - zBot; if (!(H > 1e-9)) return [];
  if (!stepdown) return [zBot];
  if (finish && finish > 0 && finish < H - 1e-9) { const rough = depthLevels(zTop, zBot + finish, stepdown, null); return [...rough, zBot]; }
  const n = Math.max(1, Math.ceil(H / stepdown - 1e-9)); const out = [];
  for (let k = 1; k <= n; k++) out.push(k === n ? zBot : zTop - (H * k) / n);
  return out;
}

// ------------------------------------------------------------------ hareket kurucu
export class Builder {
  constructor({ zClr, zRet, feed, tool }) { this.moves = []; this.pos = null; this.zClr = zClr; this.zRet = zRet; this.f = feed; this.tool = tool; this.far = Math.max(LINK_FAR_MIN, LINK_FAR_FACTOR * tool.dia); }
  rapid(x, y, z) { this.moves.push(mk.rapid(x, y, z)); this.pos = [x, y, z]; }
  feed(x, y, z, f, kind = 'cut', extra) { if (this.pos && Math.hypot(x - this.pos[0], y - this.pos[1], z - this.pos[2]) < 1e-9) return; const m = mk.feed(x, y, z, f, kind); if (extra) Object.assign(m, extra); this.moves.push(m); this.pos = [x, y, z]; }
  // yonlu parca (path2d) izle; z0 -> z1 dogrusal (helis/rampa)
  seg(s, z0, z1, f, kind = 'cut') {
    if (s.k === 'L') { this.feed(s.b[0], s.b[1], z1, f, kind); return; }
    // yay: |sw| <= PI (path2d garantisi); baslangic konumu = s.a
    // kirisi ARC_MIN_CHORD'dan kisa yay (sehim < kiris/2) dogru olarak yazilir: NC'de tam daireye donusmesin (V-05)
    if (Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) < ARC_MIN_CHORD) { this.feed(s.b[0], s.b[1], z1, f, kind); return; }
    this.moves.push(mk.arc(s.b[0], s.b[1], z1, s.c[0] - s.a[0], s.c[1] - s.a[1], s.sw > 0 ? 'ccw' : 'cw', f, kind)); this.pos = [s.b[0], s.b[1], z1];
  }
  segs(list, z, f, kind = 'cut') { for (const s of list) this.seg(s, z, z, f, kind); }
  // ilk konumlanma: clearance'ta hizli
  start(x, y) { this.rapid(x, y, this.zClr); }
  // (x,y)'ye guvenli gecis ve zTarget'a inis: stok ustu retract'a kadar hizli, sonrasi ilerleme. opts.clear: inis bolgesi bu islemde bosaltilmis (kapi 4 icin)
  linkTo(x, y, zTarget, fPlunge, opts = {}) {
    if (!this.pos) { this.start(x, y); }
    const [px, py, pz] = this.pos; const d = Math.hypot(x - px, y - py);
    const far = opts.far ?? d > this.far;
    // T-01: ilk konum clearance'ta (pz > zRet) ve XY ayni ise de retract'a HIZLI inilir (eskiden clearance'tan ilerlemeyle inilirdi:
    // havada kesme). Hizli inis yalniz stok ustu + retract payina kadar (zRet > stockTop); orada ilerlemeye gecilir.
    if (d > 1e-9 || Math.abs(pz - this.zRet) > 1e-9) {
      const zUp = far ? this.zClr : this.zRet;
      if (pz < zUp - 1e-9) this.rapid(px, py, zUp);
      if (d > 1e-9) this.rapid(x, y, Math.max(zUp, this.pos[2]));
      if (this.pos[2] > this.zRet + 1e-9) this.rapid(x, y, this.zRet);
    }
    if (zTarget < this.pos[2] - 1e-9) this.feed(x, y, zTarget, fPlunge, 'plunge', opts.clear ? { clear: true } : null);
    else if (zTarget > this.pos[2] + 1e-9) this.feed(x, y, zTarget, fPlunge, 'plunge');
  }
  // retract duzlemine dikey cikis
  up(z = this.zRet) { if (this.pos && this.pos[2] < z - 1e-9) this.rapid(this.pos[0], this.pos[1], z); }
  end() { if (this.pos) { this.up(this.zClr); } }
}

// Takim yolu nesnesi: IR dogrulamasindan (B: src/cam/ir.js validateToolpath) gecmezse ic hata
export function finishToolpath(op, tool, cut, h, b, extra = {}) {
  b.end();
  const tp = {
    opId: op.id, opName: op.name || op.id, opType: op.type, tool: irTool(tool), rpm: cut.rpm, spindleDir: 'cw', coolant: cut.coolant,
    comp: extra.comp || 'computer', clearanceZ: h.zClr, retractZ: extra.retractZ ?? h.zRet, moves: b.moves,
    warnings: extra.warnings || [], meta: { stockTop: h.stockTop, topZ: h.zTop, bottomZ: h.zBot, passDepth: extra.passDepth ?? null, ...(extra.meta || {}) },
  };
  if (extra.compSide) tp.compSide = extra.compSide;
  tp.stats = computeStats(tp, { rapidFeed: extra.rapidFeed });
  try { validateToolpath(tp); } catch (e) { throw cerr('cam.internal_ir', { code: e.code || 'internal', params: JSON.stringify(e.params || {}) }); }
  return tp;
}

// geom2d dongusunu (cekirdek camFaceLoops ogeleri: {...seg, fwd, open}) path2d yonlu parcalara cevir
export function loopFromKernel(items) {
  items = P.closeItemLoop(items); // T-24: cekirdek zincir acikliklari (<= 0,02 mm) birebir kapatilir
  const out = [];
  for (const it of items) for (const s of P.fromGeom2d(it, it.fwd !== false, it.open ? { open: true } : null)) out.push(s);
  if (!P.isClosedLoop(out, 1e-5)) throw cerr('cam.geom.loop_open');
  // kucuk bosluklari kapat (uclari bir sonrakinin baslangicina esitle)
  for (let i = 0; i < out.length; i++) { const nx = out[(i + 1) % out.length]; const s = out[i]; if (P.dist(s.b, nx.a) > 0) { if (s.k === 'L') s.b = nx.a.slice(); else s.b = nx.a.slice(); } }
  if (P.selfIntersects(out)) throw cerr('cam.geom.self_intersect'); // V-17: kendini kesen sinir belirsiz bolge -> acik hata
  return out;
}
export const warn = (code, params = {}) => issue(code, params);
// V-12: stok tabaninin altina bilincli inis payi (mm). Yalniz taban model/stok tabanina ya da secime gore NEGATIF ofsetle
// verildiyse (boydan boya kesim niyeti) ve en cok o ofset kadar izin; 'abs' ya da ofsetsiz taban 0 -> simulasyon stok
// tabani altini ENGEL sayar (tabla/baglama modellenmez).
export function belowStockAllow(op, S, zBot) {
  const b = op.heights?.bottom; const off = b?.off ?? 0;
  if (!b || !['modelBottom', 'stockBottom', 'selection'].includes(b.from) || !(off < 0)) return 0;
  return Math.min(-off, Math.max(0, S.stockBox.min[2] - zBot));
}
// tolerans-yuvarlama: kullaniciya gosterilecek sayi
export const r3 = (x) => Math.round(x * 1000) / 1000;
