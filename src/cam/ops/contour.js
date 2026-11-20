// 2D kontur: kapali dongu disi/ici (takim yaricapi + yanal pay kadar kesin ofset), 'on' (takim merkezi geometride),
// cok derinlik, kaba yanal pasolar, yay/cizgi giris-cikis, kopru (tab), wear telafisi (programlanan yol = parca
// konturu + yanal pay; zorunlu dogrusal giris; G41/G42 tarafi). Acik zincir yalniz 'on' ile.
// Yon: tirmanma (climb) = malzeme gidis yonunun SAGINDA (saat yonu mil, G41 ile ayni).
import { cerr } from '../geom/err.js';
import * as P from '../geom/path2d.js';
import { need, opt, posNum, nonNeg, cutting, heights, depthLevels, Builder, finishToolpath, warn, loopFromKernel, r3, belowStockAllow, stockToLeave } from './common.js';

const TURN_EPS = 1e-6;

// Secimden donguler: [{loop (path2d, CCW: bolge solda), side, z}] ya da acik zincir [{chain, z}]
export function contourInputs(op, geom) {
  const sels = Array.isArray(op.geom) ? op.geom : []; if (!sels.length) throw cerr('cam.op.missing', { field: 'geom', op: op.name || op.id });
  const items = [];
  sels.forEach((sel, i) => {
    const g = geom?.faces?.[i] ?? geom?.items?.[i];
    if (sel.kind === 'face' || sel.kind === 'sketch' || sel.kind === 'silhouette') { // sketch/silhouette: resolveGeom ile yuz nesnesine cozulmus
      if (!g || !Array.isArray(g.outer)) throw cerr('cam.geom.missing', { index: i });
      const which = sel.loops ?? 'outer';
      if (which === 'outer' || which === 'all') items.push({ loop: loopFromKernel(g.outer), defSide: 'outside', z: g.z });
      if (which === 'inner' || which === 'all') for (const l of g.inners) items.push({ loop: P.reverseLoop(loopFromKernel(l)), defSide: 'inside', z: g.z }); // bosluk bolgesi CCW
      if (!['outer', 'inner', 'all'].includes(which)) throw cerr('cam.op.bad_field', { field: `geom[${i}].loops`, expect: 'outer/inner/all', op: op.name || op.id });
    } else if (sel.kind === 'chain') { // cagiran tarafindan setup uzayina cevrilmis geom2d zincir {segs:[{...seg, fwd}], closed, z}
      if (!g || !Array.isArray(g.segs)) throw cerr('cam.geom.missing', { index: i });
      const segs = g.segs.flatMap((s) => P.fromGeom2d(s, s.fwd !== false));
      if (g.closed) { const lp = P.area(segs) < 0 ? P.reverseLoop(segs) : segs; if (!P.isClosedLoop(lp, 1e-5)) throw cerr('cam.geom.loop_open'); items.push({ loop: lp, defSide: 'outside', z: g.z ?? null }); }
      else items.push({ chain: segs, z: g.z ?? null });
    } else throw cerr('cam.geom.sel_unsupported', { kind: String(sel.kind) });
  });
  return items;
}

// Takim tarafindaki ic koseler ve kucuk yaylar: kalan malzeme (uyari icin sayi)
function restCorners(loop, toolSide, r) {
  // toolSide: 'right' (disari: malzeme solda) | 'left' (iceri: malzeme sagda)
  let n = 0;
  for (let i = 0; i < loop.length; i++) {
    const s = loop[i], nx = loop[(i + 1) % loop.length];
    const t0 = P.tangentAt(s, 1), t1 = P.tangentAt(nx, 0); const cr = t0[0] * t1[1] - t0[1] * t1[0];
    if (toolSide === 'right' ? cr < -TURN_EPS : cr > TURN_EPS) n++;
    if (s.k === 'A' && s.r < r - 1e-9 && (toolSide === 'right' ? s.sw < 0 : s.sw > 0)) n++;
  }
  return n;
}
// takim merkezi icin izinli mi: sinira uzaklik >= d - tol ve dogru taraf
function centerOk(p, base, d, outside, tol = 1e-6) {
  const dd = P.distTo(p, base); if (dd < d - tol) return false;
  const inside = P.inRegion(p, { outer: base, holes: [] }, Math.min(1e-3, d / 20 || 1e-3));
  return outside ? !inside : inside;
}

// kapali takim yolu dongusu icin giris/cikis; donus { pre:[seg], post:[seg], start, end }
function leads(loop, lin, lout, toolSide, check, endsOnly = false) {
  const s0 = loop[0], sN = loop[loop.length - 1]; const p = s0.a;
  const t = P.tangentAt(s0, 0), te = P.tangentAt(sN, 1);
  const nT = toolSide === 'right' ? [t[1], -t[0]] : [-t[1], t[0]]; // takim tarafi (malzemeden uzak) normal
  const nTe = toolSide === 'right' ? [te[1], -te[0]] : [-te[1], te[0]];
  const mkIn = (L) => {
    if (!L || L.kind === 'none') return [];
    if (L.kind === 'line') { const len = L.len; if (!(len > 0)) throw cerr('cam.op.bad_field', { field: 'leadIn.len', expect: 'number > 0' }); return [P.line([p[0] + nT[0] * len, p[1] + nT[1] * len], p)]; }
    if (L.kind === 'arc') {
      const R = L.r; if (!(R > 0)) throw cerr('cam.op.bad_field', { field: 'leadIn.r', expect: 'number > 0' });
      const c = [p[0] + nT[0] * R, p[1] + nT[1] * R]; // merkez takim tarafinda; yay p'de teget
      const ccw = toolSide === 'left' ? false : true; // takim sagda (disari): yay CCW ile p'ye gelir? asagida dogrulanir
      const aP = Math.atan2(p[1] - c[1], p[0] - c[0]);
      // yay p'de t yonunde bitmeli: CCW yayda p'deki teget = (-sin, cos)
      const tc = [-Math.sin(aP), Math.cos(aP)]; const sw = (tc[0] * t[0] + tc[1] * t[1]) > 0 ? Math.PI / 2 : -Math.PI / 2;
      void ccw; return [P.arc(c, R, aP - sw, sw, {}, null, p)];
    }
    throw cerr('cam.op.bad_field', { field: 'leadIn.kind', expect: 'arc/line/none' });
  };
  const q = sN.b;
  const mkOut = (L) => {
    if (!L || L.kind === 'none') return [];
    if (L.kind === 'line') { const len = L.len; if (!(len > 0)) throw cerr('cam.op.bad_field', { field: 'leadOut.len', expect: 'number > 0' }); return [P.line(q, [q[0] + nTe[0] * len, q[1] + nTe[1] * len])]; }
    if (L.kind === 'arc') {
      const R = L.r; if (!(R > 0)) throw cerr('cam.op.bad_field', { field: 'leadOut.r', expect: 'number > 0' });
      const c = [q[0] + nTe[0] * R, q[1] + nTe[1] * R]; const aQ = Math.atan2(q[1] - c[1], q[0] - c[0]);
      const tc = [-Math.sin(aQ), Math.cos(aQ)]; const sw = (tc[0] * te[0] + tc[1] * te[1]) > 0 ? Math.PI / 2 : -Math.PI / 2;
      return [P.arc(c, R, aQ, sw, {}, q, null)];
    }
    throw cerr('cam.op.bad_field', { field: 'leadOut.kind', expect: 'arc/line/none' });
  };
  const pre = mkIn(lin), post = mkOut(lout);
  if (endsOnly) { // wear: telafi kapaliyken takim merkezi giris basinda / cikis sonunda
    for (const pt of [pre[0]?.a, post[post.length - 1]?.b]) if (pt && !check(pt)) throw cerr('cam.contour.lead_no_fit');
  } else for (const s of [...pre, ...post]) for (let k = 0; k <= 16; k++) { const pt = P.pointAt(s, k / 16); if (!check(pt)) throw cerr('cam.contour.lead_no_fit'); }
  return { pre, post };
}
// dongude uzun dogru parcasinin ortasindan basla (giris icin iyi nokta); yoksa en uzun parcanin ortasi
function goodStart(loop) {
  let best = null; for (const s of loop) { const w = P.length(s) * (s.k === 'L' ? 2 : 1); if (!best || w > best.w) best = { w, s }; }
  return P.pointAt(best.s, 0.5);
}
// kopru araliklari (dongu uzunlugu boyunca [s0, s1]) -> dongu parcalarini koprulerde bol
function tabIntervals(L, tabs, r) {
  const n = tabs.n, w = tabs.width + 2 * r; const out = [];
  for (let k = 0; k < n; k++) { const c = ((k + 0.5) * L) / n; out.push([c - w / 2, c + w / 2]); }
  return out;
}
function splitByIntervals(loop, ivs) {
  // donus: [{segs, tab:bool}] ardisik
  const cuts = []; for (const [a, b] of ivs) cuts.push(a, b);
  const pieces = []; let acc = 0;
  for (const s of loop) {
    const L = P.length(s); const inner = cuts.filter((c) => c > acc + 1e-9 && c < acc + L - 1e-9).map((c) => P.pointAt(s, (c - acc) / L));
    for (const q of P.splitAt(s, inner)) { const mid = acc + P.length(q) / 2; pieces.push({ s: q, mid }); acc += P.length(q); }
    if (!inner.length) { /* acc zaten eklendi */ }
  }
  // not: splitAt parcalarinin toplam uzunlugu L; acc parca bazinda ilerledi
  return pieces.map((p) => ({ s: p.s, tab: ivs.some(([a, b]) => p.mid > a && p.mid < b) }));
}

export function computeContour(op, ctx) {
  const { setup: S, tool, geom, machine } = ctx;
  const cut = cutting(op); const r = tool.dia / 2; const warnings = [];
  const comp = op.comp ?? 'computer'; if (!['computer', 'wear'].includes(comp)) throw cerr('cam.op.bad_field', { field: 'comp', expect: 'computer/wear', op: op.name || op.id });
  const dir = op.dir ?? 'climb'; if (!['climb', 'conv'].includes(dir)) throw cerr('cam.op.bad_field', { field: 'dir', expect: 'climb/conv', op: op.name || op.id });
  const sd = need(op, 'stepdown'); const fsd = opt(op, 'finishStepdown', posNum, 'number > 0', null);
  const { radial: stR, axial: stA } = stockToLeave(op);
  const rough = op.roughPasses && op.roughPasses.n > 0 ? { n: need(op, 'roughPasses.n', (v) => Number.isInteger(v) && v >= 1 && v <= 100, 'integer 1..100'), so: need(op, 'roughPasses.stepover') } : null;
  if (rough && rough.so >= tool.dia) throw cerr('cam.op.stepover_too_big', { stepover: rough.so, dia: tool.dia });
  if (comp === 'wear' && rough) throw cerr('cam.contour.wear_rough');
  if (comp === 'wear' && !Number.isInteger(tool.diaOffset)) throw cerr('cam.contour.wear_no_d', { tool: tool.number });
  const ramp = op.ramp ?? { kind: 'plunge' }; if (!['plunge', 'ramp'].includes(ramp.kind)) throw cerr('cam.op.unsupported', { what: 'ramp.' + ramp.kind });
  const rampAng = ramp.kind === 'ramp' ? need(op, 'ramp.angle', (v) => v > 0 && v <= 45, '0 < angle <= 45') : null;
  const lin = op.leadIn ?? { kind: 'none' }, lout = op.leadOut ?? { kind: 'none' };
  if (comp === 'wear') {
    if (lin.kind !== 'line' || lout.kind !== 'line') throw cerr('cam.contour.wear_needs_line_lead');
    if (!(lin.len > r) || !(lout.len > r)) throw cerr('cam.contour.wear_lead_short', { min: r3(r) });
  }
  if (ramp.kind === 'ramp' && (lin.kind !== 'none' || lout.kind !== 'none')) throw cerr('cam.contour.ramp_with_lead');
  if (ramp.kind === 'ramp' && comp === 'wear') throw cerr('cam.contour.wear_ramp');
  const tabs = op.tabs && op.tabs.n > 0 ? { n: need(op, 'tabs.n', (v) => Number.isInteger(v) && v >= 1 && v <= 100, 'integer 1..100'), width: need(op, 'tabs.width'), height: need(op, 'tabs.height') } : null;
  const items = contourInputs(op, geom);
  const zSel = items.find((it) => Number.isFinite(it.z))?.z;
  // V-19: secimden taban alinirken farkli z'deki profiller ilk profilin tabanina inerdi (sessiz derin/eksik kesim) -> hata (cepteki gibi)
  const bFrom = op.heights?.bottom?.from ?? 'selection', tFrom = op.heights?.top?.from ?? 'stockTop';
  if (bFrom === 'selection' || tFrom === 'selection') { const zs = items.map((it) => it.z).filter(Number.isFinite); if (zs.some((v) => Math.abs(v - zs[0]) > 1e-6)) throw cerr('cam.contour.faces_differ_z', { z1: r3(Math.min(...zs)), z2: r3(Math.max(...zs)) }); }
  const h = heights({ ...op, heights: { top: { from: 'stockTop', off: 0 }, bottom: { from: 'selection', off: 0 }, ...op.heights } }, S, { bottom: zSel, top: zSel });
  const zBot = h.zBot + stA; if (!(h.zTop > zBot + 1e-9)) throw cerr('cam.contour.nothing', { top: r3(h.zTop), bottom: r3(zBot) });
  if (tabs && !(tabs.height < h.zTop - zBot)) throw cerr('cam.contour.tab_too_high');
  const levels = depthLevels(h.zTop, zBot, sd, fsd);
  const passDepth = levels.reduce((m, z, i) => Math.max(m, (i ? levels[i - 1] : h.zTop) - z), 0);
  const b = new Builder({ zClr: h.zClr, zRet: h.zRet, feed: cut.feedCut, tool });
  let compSide = null; let restN = 0;

  // her dongu icin pasolar
  const passes = []; // [{loop, toolSide, check, offsets:[d...] (rough..final)}]
  for (const it of items) {
    if (it.chain) {
      const side = op.side ?? 'on'; if (side !== 'on') throw cerr('cam.contour.open_needs_on');
      if (lin.kind !== 'none' || lout.kind !== 'none' || tabs || comp === 'wear') throw cerr('cam.contour.open_options');
      passes.push({ chain: it.chain }); continue;
    }
    const side = op.side ?? it.defSide; if (!['outside', 'inside', 'on'].includes(side)) throw cerr('cam.op.bad_field', { field: 'side', expect: 'outside/inside/on', op: op.name || op.id });
    const base = it.loop; // CCW, bolge solda
    if (side === 'on') { if (comp === 'wear') throw cerr('cam.contour.wear_on'); passes.push({ loops: [[{ loop: dir === 'climb' ? base : P.reverseLoop(base), d: 0 }]], toolSide: null, check: () => true, base }); continue; }
    const outside = side === 'outside';
    const dFinal = (comp === 'wear' ? 0 : r) + stR; const dCheck = r + stR;
    const ds = []; if (rough) for (let k = rough.n; k >= 1; k--) ds.push(dFinal + k * rough.so); ds.push(dFinal);
    const ringSets = ds.map((d) => {
      if (d < 1e-12) return [{ loop: base, d }];
      const regs = P.offsetRegions([{ outer: base, holes: [] }], outside ? -d : d);
      if (!regs.length) throw cerr('cam.contour.tool_too_big', { dia: tool.dia });
      if (outside && regs.some((g) => g.holes.length)) warnings.push(warn('cam.contour.unreachable_cavity', {}));
      if (!outside && regs.length > 1) warnings.push(warn('cam.contour.split', { n: regs.length }));
      return regs.map((g) => ({ loop: g.outer, d }));
    });
    if (comp === 'wear') { // takim merkezi yolu var mi (takim sigiyor mu) ve takim tarafindaki kucuk yaylar
      const regs = P.offsetRegions([{ outer: base, holes: [] }], outside ? -dCheck : dCheck); if (!regs.length) throw cerr('cam.contour.tool_too_big', { dia: tool.dia });
      const prog = ringSets[ringSets.length - 1][0].loop;
      for (const s of prog) if (s.k === 'A' && s.r <= r + 1e-9 && (outside ? s.sw < 0 : s.sw > 0)) throw cerr('cam.contour.wear_arc_small', { r: r3(s.r), tool: r3(r) });
      if (!outside && ringSets[ringSets.length - 1].length > 1) throw cerr('cam.contour.wear_split');
    }
    restN += restCorners(base, outside ? 'right' : 'left', r);
    // yon: disari CCW dongude malzeme solda -> tirmanma icin ters (CW); iceri CCW dongude malzeme sagda -> tirmanma CCW
    const flip = outside ? dir === 'climb' : dir === 'conv';
    const toolSide0 = outside ? 'right' : 'left';
    const toolSide = flip ? (toolSide0 === 'right' ? 'left' : 'right') : toolSide0;
    const check = (p) => centerOk(p, base, dCheck, outside);
    passes.push({ loops: ringSets.map((set) => set.map((x) => ({ loop: flip ? P.reverseLoop(x.loop) : x.loop, d: x.d }))), toolSide, check, base });
    if (comp === 'wear') { const cs = toolSide === 'left' ? 'left' : 'right'; if (compSide && compSide !== cs) throw cerr('cam.contour.wear_mixed_side'); compSide = cs; }
  }
  if (restN) warnings.push(warn('cam.contour.rest_corner', { n: restN, r: r3(r) }));

  const zTabTop = tabs ? zBot + tabs.height : null;
  for (const ps of passes) {
    if (ps.chain) { // acik zincir 'on'
      for (const z of levels) { const a = ps.chain[0].a; b.linkTo(a[0], a[1], z, cut.feedPlunge); b.segs(ps.chain, z, cut.feedCut); b.up(); }
      continue;
    }
    for (let li = 0; li < levels.length; li++) {
      const z = levels[li]; const zPrev = li ? levels[li - 1] : h.zTop;
      for (const set of ps.loops) for (const { loop: L0 } of set) {
        const L = P.startAt(L0, goodStart(L0));
        const { pre, post } = ps.toolSide ? leads(L, lin, lout, ps.toolSide, ps.check, comp === 'wear') : { pre: [], post: [] };
        const st = pre.length ? pre[0].a : L[0].a;
        if (ramp.kind === 'ramp') {
          b.linkTo(st[0], st[1], zPrev, cut.feedPlunge, { clear: li > 0 });
          rampAlong(b, L, zPrev, z, rampAng, cut.feedRamp);
        } else b.linkTo(st[0], st[1], z, cut.feedPlunge);
        if (comp === 'wear') { b.moves.push({ t: 'comp', on: true }); }
        for (const s of pre) b.seg(s, z, z, cut.feedCut, 'lead');
        const useTabs = tabs && z < zTabTop - 1e-9;
        if (useTabs) {
          const Ltot = P.loopLength(L); const ivs = tabIntervals(Ltot, tabs, r);
          if (ivs.reduce((s, [a, c]) => s + (c - a), 0) >= Ltot - 1e-6) throw cerr('cam.contour.tabs_too_many');
          let up = false;
          for (const pc of splitByIntervals(L, ivs)) {
            if (pc.tab && !up) { b.feed(pc.s.a[0], pc.s.a[1], zTabTop, cut.feedCut, 'cut'); up = true; }
            // kopru sonu inisi malzemeye dikey dalmadir: 'plunge' (kapi 4 kesmeyen ucu engeller, V-09)
            if (!pc.tab && up) { b.feed(pc.s.a[0], pc.s.a[1], z, cut.feedPlunge, 'plunge'); up = false; }
            b.seg(pc.s, up ? zTabTop : z, up ? zTabTop : z, cut.feedCut, 'cut');
          }
          if (up) b.feed(L[0].a[0], L[0].a[1], z, cut.feedPlunge, 'plunge', { clear: true }); // baslangic noktasi bu pasoda z'de kesildi
        } else b.segs(L, z, cut.feedCut, 'cut');
        for (const s of post) b.seg(s, z, z, cut.feedCut, 'lead');
        if (comp === 'wear') { // telafi kapama: zorunlu kisa dogrusal cikis (cikis cizgisinin devami)
          b.moves.push({ t: 'comp', on: false });
          const lastP = b.pos; const s = post[post.length - 1]; const tt = P.tangentAt(s, 1);
          b.feed(lastP[0] + tt[0] * r, lastP[1] + tt[1] * r, z, cut.feedCut, 'lead');
        }
        b.up();
      }
    }
  }
  return finishToolpath(op, tool, cut, { ...h, zBot }, b, { warnings, passDepth, comp, compSide: comp === 'wear' ? compSide : undefined, rapidFeed: machine?.feed?.rapid ?? undefined, meta: { belowStock: belowStockAllow(op, S, zBot) } });
}

// dongu boyunca z0'dan z1'e rampa (aci derece), sonra z1'de tam tur
export function rampAlong(b, loop, z0, z1, angDeg, f) {
  const need_ = (z0 - z1) / Math.tan((angDeg * Math.PI) / 180); let left = need_;
  const L = P.loopLength(loop); if (!(L > 1e-9)) throw cerr('cam.geom.loop_open');
  let z = z0; let guard = 0;
  while (left > 1e-9) {
    if (++guard > 100000) throw cerr('cam.entry.ramp_too_long');
    for (const s of loop) {
      if (left <= 1e-9) { b.seg(s, z1, z1, f, 'cut'); continue; }
      const l = P.length(s);
      if (l <= left + 1e-12) { const zn = z - (z0 - z1) * (l / need_); b.seg(s, z, Math.max(z1, zn), f, 'ramp'); z = Math.max(z1, zn); left -= l; }
      else { const t = left / l; const [p1, p2] = P.splitAt(s, [P.pointAt(s, t)]); b.seg(p1, z, z1, f, 'ramp'); z = z1; left = 0; b.seg(p2, z1, z1, f, 'cut'); }
    }
  }
  b.segs(loop, z1, f, 'cut'); // derinlikte tam tur (rampa izini temizler)
}
