// Kanal (slot) ve iz (trace) islemleri (WP-07). Ikisi de eskiz zincirinden (acik/kapali) calisir; kurallar:
//  - zigRamp: acik zincir boyunca ileri-geri rampa (zigzag). Aci `entry.angle`; inis bitince zincirin kalani z'de kesilir, sonra tum zincir geri
//    z'de gecilir (rampa izi temizlenir). Rampa/helis hareketleri sim'de gercekten supürulur (b.seg: dogrusal ya da helisel yay).
//  - slot: zincir = kanal ORTA cizgisi, `width` = bitmis genislik. width <= takim capi degilse (δ = (width - dia)/2 > 0) merkez zigzag + duvar halkasi
//    (orta cizginin ±δ ofseti + uc yarim cemberleri; kapali halka). width > 3·dia kapsama bosluk birakir -> hata (cep kullanilir).
//    Duvar yonu: tirmanma = halka saat yonunun tersi (CCW, takim kanal icinde).
//  - trace: takim MERKEZI zinciri izler (telafi yok); oyma icin. Dalma (merkezden kesen takim) ya da rampa; kapali zincirde rampAlong.
import { cerr } from '../geom/err.js';
import * as P from '../geom/path2d.js';
import { need, opt, posNum, cutting, heights, depthLevels, Builder, finishToolpath, r3, belowStockAllow, stockToLeave } from './common.js';
import { contourInputs, rampAlong } from './contour.js';

export const SLOT_TOOLS = ['flat', 'bullnose'];
export const TRACE_TOOLS = ['flat', 'bullnose', 'ball', 'chamfer', 'spot', 'drill', 'face'];

// acik zincir boyunca z0 -> z1 ileri-geri rampa; sonunda zincir basinda, z1'de
export function zigRamp(b, chain, z0, z1, angDeg, f) {
  const need_ = (z0 - z1) / Math.tan((angDeg * Math.PI) / 180); let left = need_, z = z0, fwd = chain, guard = 0;
  if (!(P.loopLength(chain) > 1e-9)) throw cerr('cam.geom.loop_open');
  while (left > 1e-9) {
    if (++guard > 100000) throw cerr('cam.entry.ramp_too_long');
    for (const s of fwd) {
      if (left <= 1e-9) { b.seg(s, z1, z1, f, 'cut'); continue; }
      const l = P.length(s);
      if (l <= left + 1e-12) { const zn = z - (z0 - z1) * (l / need_); b.seg(s, z, Math.max(z1, zn), f, 'ramp'); z = Math.max(z1, zn); left -= l; }
      else { const t = left / l; const [p1, p2] = P.splitAt(s, [P.pointAt(s, t)]); b.seg(p1, z, z1, f, 'ramp'); z = z1; left = 0; b.seg(p2, z1, z1, f, 'cut'); }
    }
    if (left > 1e-9) fwd = P.reverseLoop(fwd);
  }
  b.segs(P.reverseLoop(fwd), z1, f, 'cut'); // tum zincir z'de geri (baslangica)
}

// zincirin ±delta ofseti + uc yarim cemberleri: CW kapali halka (sol zincir ileri, uc yayi, sag zincir geri, bas yayi)
export function stadium(chain, delta) {
  const left = P.offsetChainOpen(chain, delta), right = P.offsetChainOpen(chain, -delta);
  const e = chain[chain.length - 1].b, s0 = chain[0].a;
  const t1 = P.tangentAt(chain[chain.length - 1], 1), t0 = P.tangentAt(chain[0], 0);
  const endArc = P.arc(e, delta, Math.atan2(t1[0], -t1[1]), -Math.PI); // sol normal (-ty, tx) acisi = atan2(tx, -ty)
  const startArc = P.arc(s0, delta, Math.atan2(-t0[0], t0[1]), -Math.PI); // sag normal (ty, -tx)
  const loop = [...left, endArc, ...P.reverseLoop(right), startArc];
  if (!P.isClosedLoop(loop, 1e-5)) throw cerr('cam.slot.bad_chain');
  return loop;
}

export function computeSlot(op, ctx) {
  const { setup: S, tool, geom, machine } = ctx; const nm = op.name || op.id;
  if (!SLOT_TOOLS.includes(tool.type)) throw cerr('cam.slot.tool_type', { tool: tool.number, type: tool.type });
  const cut = cutting(op); const r = tool.dia / 2;
  const width = need(op, 'width'); const sd = need(op, 'stepdown'); const ang = need(op, 'entry.angle', (v) => v > 0 && v <= 45, '0 < angle <= 45');
  const dir = op.dir ?? 'climb'; if (!['climb', 'conv'].includes(dir)) throw cerr('cam.op.bad_field', { field: 'dir', expect: 'climb/conv', op: nm });
  const delta = (width - tool.dia) / 2;
  if (delta < -1e-9) throw cerr('cam.slot.tool_too_big', { dia: r3(tool.dia), width: r3(width) });
  if (width > 3 * tool.dia + 1e-9) throw cerr('cam.slot.too_wide', { width: r3(width), max: r3(3 * tool.dia) });
  const { axial: stA } = stockToLeave(op);
  const items = contourInputs(op, geom); const chains = items.filter((i) => i.chain);
  if (!chains.length || chains.length !== items.length) throw cerr('cam.slot.need_chain');
  const zs = chains.map((i) => i.z).filter(Number.isFinite); const zSel = zs[0];
  if (zs.some((v) => Math.abs(v - zs[0]) > 1e-6)) throw cerr('cam.contour.faces_differ_z', { z1: r3(Math.min(...zs)), z2: r3(Math.max(...zs)) });
  const h = heights({ ...op, heights: { top: { from: 'stockTop', off: 0 }, bottom: { from: 'selection', off: 0 }, ...op.heights } }, S, { bottom: zSel, top: zSel });
  const zBot = h.zBot + stA; if (!(h.zTop > zBot + 1e-9)) throw cerr('cam.contour.nothing', { top: r3(h.zTop), bottom: r3(zBot) });
  const levels = depthLevels(h.zTop, zBot, sd, null);
  const passDepth = levels.reduce((m, z, i) => Math.max(m, (i ? levels[i - 1] : h.zTop) - z), 0);
  const b = new Builder({ zClr: h.zClr, zRet: h.zRet, feed: cut.feedCut, tool });
  for (const it of chains) {
    const ch = it.chain; if (!(P.loopLength(ch) > 1e-6)) throw cerr('cam.slot.bad_chain');
    let wall = null;
    if (delta > 1e-9) { wall = stadium(ch, delta); if (dir === 'climb') wall = P.reverseLoop(wall); } // stadium CW; tirmanma CCW
    const a = ch[0].a;
    for (let li = 0; li < levels.length; li++) {
      const z = levels[li], zPrev = li ? levels[li - 1] : h.zTop;
      b.linkTo(a[0], a[1], zPrev, cut.feedPlunge, { clear: li > 0 });
      zigRamp(b, ch, zPrev, z, ang, cut.feedRamp);
      if (wall) {
        const W = P.startAt(wall, P.closestOnLoops(a, [wall]).p); const q = W[0].a;
        b.feed(q[0], q[1], z, cut.feedCut, 'cut'); b.segs(W, z, cut.feedCut, 'cut');
      }
      b.up();
    }
  }
  return finishToolpath(op, tool, cut, { ...h, zBot }, b, { warnings: [], passDepth, rapidFeed: machine?.feed?.rapid ?? undefined, meta: { belowStock: belowStockAllow(op, S, zBot), slot: { width, delta } } });
}

export function computeTrace(op, ctx) {
  const { setup: S, tool, geom, machine } = ctx; const nm = op.name || op.id;
  if (!TRACE_TOOLS.includes(tool.type)) throw cerr('cam.trace.tool_type', { tool: tool.number, type: tool.type });
  const cut = cutting(op);
  const sd = opt(op, 'stepdown', posNum, 'number > 0', null);
  const entry = op.entry ?? { kind: 'plunge' }; if (!['plunge', 'ramp'].includes(entry.kind)) throw cerr('cam.op.bad_field', { field: 'entry.kind', expect: 'plunge/ramp', op: nm });
  const ang = entry.kind === 'ramp' ? need(op, 'entry.angle', (v) => v > 0 && v <= 45, '0 < angle <= 45') : null;
  if (entry.kind === 'plunge' && !tool.centerCutting) throw cerr('cam.entry.plunge_not_center_cutting', { tool: tool.number });
  const { axial: stA } = stockToLeave(op);
  const items = contourInputs(op, geom);
  const zs = items.map((i) => i.z).filter(Number.isFinite); const zSel = zs[0];
  if (zs.some((v) => Math.abs(v - zs[0]) > 1e-6)) throw cerr('cam.contour.faces_differ_z', { z1: r3(Math.min(...zs)), z2: r3(Math.max(...zs)) });
  const h = heights({ ...op, heights: { top: { from: 'stockTop', off: 0 }, bottom: { from: 'selection', off: 0 }, ...op.heights } }, S, { bottom: zSel, top: zSel });
  const zBot = h.zBot + stA; if (!(h.zTop > zBot + 1e-9)) throw cerr('cam.contour.nothing', { top: r3(h.zTop), bottom: r3(zBot) });
  const levels = depthLevels(h.zTop, zBot, sd, null);
  const passDepth = levels.reduce((m, z, i) => Math.max(m, (i ? levels[i - 1] : h.zTop) - z), 0);
  const b = new Builder({ zClr: h.zClr, zRet: h.zRet, feed: cut.feedCut, tool });
  for (const it of items) {
    const path = it.chain || it.loop; const a = path[0].a; const closed = !it.chain;
    for (let li = 0; li < levels.length; li++) {
      const z = levels[li], zPrev = li ? levels[li - 1] : h.zTop;
      if (entry.kind === 'plunge') { b.linkTo(a[0], a[1], z, cut.feedPlunge, { clear: false }); b.segs(path, z, cut.feedCut, 'cut'); }
      else { b.linkTo(a[0], a[1], zPrev, cut.feedPlunge, { clear: li > 0 }); if (closed) rampAlong(b, path, zPrev, z, ang, cut.feedRamp); else zigRamp(b, path, zPrev, z, ang, cut.feedRamp); }
      b.up();
    }
  }
  return finishToolpath(op, tool, cut, { ...h, zBot }, b, { warnings: [], passDepth, rapidFeed: machine?.feed?.rapid ?? undefined, meta: { belowStock: belowStockAllow(op, S, zBot) } });
}
