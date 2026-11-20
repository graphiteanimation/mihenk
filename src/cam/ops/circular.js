// Dairesel (bore) frezeleme: delik (ic) ya da silindirik cikinti (dis) boyunca helisel inis, kaba halkalar + bitirme.
// Merkez yolu yaricapi: ic rho_f = D/2 - r (- yanal pay), dis rho_f = D/2 + r (+ yanal pay). Halkalar `roughPasses` {n, stepover}: ic icten disa
// (rho_f - n*so ... rho_f), dis distan ice. Her derinlik seviyesinde (stepdown) ilk halkada helisel inis (aci `entry.angle`), sonra halkalar arasi
// radyal gecis (onceki seviyede bosalan alan) ve her halkada tam tur. `finishPass`: kaba halkalar finishStock kadar yanal pay birakir; bitirme TEK surekli
// helis (tur basina `finishStepdown ?? stepdown` inis) + dipte tam tur, sonra icerye kisa radyal cekilme.
// Yon: tirmanma ic CCW (G3), dis CW (G2) (mil saat yonu; malzeme gidis yonunun sagi). Telafi: yalniz bilgisayar telafisi (comp 'computer'); G41/G42 icin
// delik ici baslangic hareketini simulasyon modelleyemedigi icin 'wear' ENGELLENIR (sim'in goremedigi hareket uretilmez).
// Cekirdek (yeterince buyuk delik degilse) kalir: roughPasses ile merkeze inilmemisse `cam.circular.core_left` uyarisi (predrillDia verilirse delinmis cap sayilir).
import { cerr } from '../geom/err.js';
import { need, opt, posNum, nonNeg, anyNum, cutting, depthLevels, Builder, finishToolpath, warn, r3, stockToLeave } from './common.js';
import { collectHoles } from './drill.js';
import { helixArcs, fullCircle } from './helix.js';

export const CIRCULAR_TOOLS = ['flat', 'bullnose', 'face'];
const MIN_RHO = 0.01;

// derinlik seviyesi basina helis: zPrev -> z, halka yaricapi rho, aci ang (derece)
function descend(b, c, rho, a0, sg, zPrev, z, ang, f) {
  const dz = zPrev - z; if (!(dz > 1e-9)) return a0;
  const perTurn = 2 * Math.PI * rho * Math.tan((ang * Math.PI) / 180);
  const total = (dz / perTurn) * 2 * Math.PI;
  return helixArcs(b, c, rho, a0, sg, zPrev, z, total, f, 'ramp');
}

// bolgedeki (disk) en yuksek stok hucresi, stok ustuyle sinirli; harita disi/bos: -Infinity
export function localTop(hm, x, y, rad, cap) {
  let top = -Infinity; const rs = hm.res;
  const i0 = Math.max(0, Math.floor((x - rad - hm.x0) / rs)), i1 = Math.min(hm.nx - 1, Math.floor((x + rad - hm.x0) / rs));
  const j0 = Math.max(0, Math.floor((y - rad - hm.y0) / rs)), j1 = Math.min(hm.ny - 1, Math.floor((y + rad - hm.y0) / rs));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { if (Math.hypot(hm.x0 + (i + 0.5) * rs - x, hm.y0 + (j + 0.5) * rs - y) > rad) continue; const v = hm.data[j * hm.nx + i]; if (v === v && v > top) top = v; }
  return Math.min(top, cap);
}

export function computeCircular(op, ctx) {
  const { setup: S, tool, geom, machine } = ctx;
  const nm = op.name || op.id;
  if (!CIRCULAR_TOOLS.includes(tool.type)) throw cerr('cam.circular.tool_type', { type: tool.type, tool: tool.number });
  const comp = op.comp ?? 'computer'; if (comp !== 'computer') throw cerr('cam.circular.comp_unsupported', { op: nm });
  const cut = cutting(op); const r = tool.dia / 2; const warnings = [];
  const outside = op.side === 'outside'; if (op.side != null && !['inside', 'outside'].includes(op.side)) throw cerr('cam.op.bad_field', { field: 'side', expect: 'inside/outside', op: nm });
  const dir = op.dir ?? 'climb'; if (!['climb', 'conv'].includes(dir)) throw cerr('cam.op.bad_field', { field: 'dir', expect: 'climb/conv', op: nm });
  const sd = need(op, 'stepdown'); const { radial: stR, axial: stA } = stockToLeave(op);
  const ang = need(op, 'entry.angle', (v) => v > 0 && v <= 45, '0 < angle <= 45');
  const rough = op.roughPasses && op.roughPasses.n > 0 ? { n: need(op, 'roughPasses.n', (v) => Number.isInteger(v) && v >= 1 && v <= 100, 'integer 1..100'), so: need(op, 'roughPasses.stepover') } : null;
  if (rough && rough.so >= tool.dia) throw cerr('cam.op.stepover_too_big', { stepover: rough.so, dia: tool.dia });
  const finish = op.finishPass === true; const fStock = finish ? need(op, 'finishStock') : 0;
  const fsd = opt(op, 'finishStepdown', posNum, 'number > 0', sd);
  const diaAdj = opt(op, 'diaAdjust', anyNum, 'number', 0);
  const predrill = opt(op, 'predrillDia', nonNeg, 'number >= 0', 0);
  const dep = op.depth && typeof op.depth === 'object' ? op.depth : { from: 'hole', breakThrough: 0 };
  const brk = opt({ depth: dep, name: nm }, 'depth.breakThrough', nonNeg, 'number >= 0', 0);
  const { holes, skipped } = collectHoles(op, S, geom);
  if (skipped) warnings.push(warn('cam.drill.skipped_axis', { n: skipped }));
  if (!holes.length) throw cerr('cam.drill.no_holes');
  const clr = need(op, 'heights.clearance'), ret = need(op, 'heights.retract');
  if (ret > clr + 1e-9) throw cerr('cam.heights.retract_above_clearance', { retract: ret, clearance: clr });
  const stockTop = S.stockBox.max[2]; const zClr = stockTop + Math.max(clr, S.clearance ?? 0), zRet = stockTop + ret;
  const sg = outside ? (dir === 'climb' ? -1 : 1) : (dir === 'climb' ? 1 : -1); // + = CCW
  const b = new Builder({ zClr, zRet, feed: cut.feedCut, tool });
  let zMin = Infinity, zMax = -Infinity, passDepth = 0, thru = 0, core = 0, maxBrk = 0; const fed = cut.feedCut;
  const fRamp = cut.feedRamp; const stockMap = ctx.stockMap?.data ? ctx.stockMap : null;

  for (const hl of holes) {
    const D0 = op.dia != null ? need(op, 'dia') : hl.dia;
    if (D0 == null) throw cerr('cam.circular.no_dia', { op: nm });
    const D = D0 + diaAdj; if (!(D > 0)) throw cerr('cam.circular.no_dia', { op: nm });
    // merkez yolu yaricaplari
    const rhoF = (outside ? D / 2 + r : D / 2 - r) + (outside ? stR : -stR);
    if (!outside && !(rhoF >= MIN_RHO)) throw cerr('cam.circular.tool_too_big', { dia: r3(tool.dia), hole: r3(D) });
    const rhoRough = finish ? (outside ? rhoF + fStock : rhoF - fStock) : rhoF;
    if (!outside && finish && !(rhoRough >= MIN_RHO)) throw cerr('cam.circular.tool_too_big', { dia: r3(tool.dia), hole: r3(D) });
    const rings = [];
    if (rough) for (let k = rough.n; k >= 0; k--) rings.push(outside ? rhoRough + k * rough.so : rhoRough - k * rough.so);
    else rings.push(rhoRough);
    // ic: icten disa (artan), dis: distan ice (azalan) -> yukaridaki dongu zaten o sirada
    if (rings.some((q) => !(q >= MIN_RHO))) throw cerr('cam.circular.rough_too_deep', { n: rough?.n ?? 0, hole: r3(D) });
    if (!outside) { const rMin = rings[0]; if (rMin - r > Math.max(0.01, predrill / 2)) core++; }
    // z araligi
    const top = stockMap ? Math.max(hl.top, localTop(stockMap, hl.x, hl.y, D / 2 + r + (rough ? rough.n * rough.so : 0) + 0.1, stockTop)) : Math.max(hl.top, stockTop);
    let bottom;
    if (dep.from === 'abs') bottom = need({ depth: dep, name: nm }, 'depth.z', anyNum, 'number');
    else if (hl.through || hl.depth == null) {
      if (hl.exit != null) bottom = hl.top - hl.exit - brk; else { bottom = S.modelBBox.min[2] - brk; thru++; }
      maxBrk = Math.max(maxBrk, brk);
    } else bottom = hl.top - hl.depth;
    bottom += stA;
    if (!(top > bottom + 1e-9)) throw cerr('cam.circular.nothing', { top: r3(top), bottom: r3(bottom) });
    const levels = depthLevels(top, bottom, sd, null);
    passDepth = Math.max(passDepth, levels.reduce((m, z, i) => Math.max(m, (i ? levels[i - 1] : top) - z), 0));
    zMin = Math.min(zMin, bottom); zMax = Math.max(zMax, top);
    const c = [hl.x, hl.y]; const startAt = (rho) => [c[0] + rho, c[1]];
    // ---- kaba: seviyeler
    let a = 0; let first = true;
    for (let li = 0; li < levels.length; li++) {
      const z = levels[li], zPrev = li ? levels[li - 1] : top;
      const ring0 = rings[0];
      if (first) { const s0 = startAt(ring0); b.linkTo(s0[0], s0[1], zPrev, cut.feedPlunge); first = false; a = 0; }
      else { // onceki seviyenin son halkasindan ilk halkaya radyal gecis (z = zPrev, onceki seviyede bosaltildi)
        const s0 = [c[0] + ring0 * Math.cos(a), c[1] + ring0 * Math.sin(a)]; b.feed(s0[0], s0[1], zPrev, fed, 'cut');
      }
      a = descend(b, c, ring0, a, sg, zPrev, z, ang, fRamp);
      a = fullCircle(b, c, ring0, a, sg, z, fed);
      for (let k = 1; k < rings.length; k++) {
        const p = [c[0] + rings[k] * Math.cos(a), c[1] + rings[k] * Math.sin(a)]; b.feed(p[0], p[1], z, fed, 'cut');
        a = fullCircle(b, c, rings[k], a, sg, z, fed);
      }
      // ilk halka disindaki halkalara gectiyse bir sonraki seviyeye icerden devam edilecek (yukarida)
    }
    // ---- bitirme: kaba, son halkada finishStock yanal pay biraktı. Bitirme = uste cikis (acik alanda), bitirme yaricapina gecis, tur basina
    // `finishStepdown` inen TEK surekli helis (yon tirmanma yonuyle ayni; her tur yalniz bu kadar yukseklik keser), dipte tam tur.
    if (finish) {
      b.feed(b.pos[0], b.pos[1], top, fed, 'cut'); // kaba halkanin bosalttigi alanda dikey cikis
      const p0 = [c[0] + rhoF * Math.cos(a), c[1] + rhoF * Math.sin(a)]; b.feed(p0[0], p0[1], top, fed, 'cut');
      a = helixArcs(b, c, rhoF, a, sg, top, bottom, ((top - bottom) / fsd) * 2 * Math.PI, fRamp, 'cut');
      a = fullCircle(b, c, rhoF, a, sg, bottom, fed);
      passDepth = Math.max(passDepth, Math.min(fsd, top - bottom));
    }
    // cekilme: halkaya gore icerye 0,2 mm (kaba/bitirmede takim zaten bu bandi temizledi) sonra yukari
    {
      const q = [b.pos[0], b.pos[1]]; const dx = q[0] - c[0], dy = q[1] - c[1], dl = Math.hypot(dx, dy) || 1;
      const rel = Math.min(0.2, r * 0.5) * (outside ? 1 : -1);
      b.feed(q[0] + (dx / dl) * rel, q[1] + (dy / dl) * rel, b.pos[2], fed, 'cut');
    }
    b.up();
  }
  if (thru) warnings.push(warn('cam.drill.through_to_model_bottom', { n: thru, z: r3(S.modelBBox.min[2]) }));
  if (core) warnings.push(warn('cam.circular.core_left', { n: core }));
  const hh = { zClr, zRet, zTop: zMax, zBot: zMin, stockTop };
  const belowStock = maxBrk > 0 ? Math.min(maxBrk, Math.max(0, S.stockBox.min[2] - zMin)) : 0;
  return finishToolpath(op, tool, cut, hh, b, { warnings, passDepth, rapidFeed: machine?.feed?.rapid ?? undefined, meta: { circular: { holes: holes.length, outside, rings: rough ? rough.n + 1 : 1 }, belowStock } });
}
