// Yuzey frezeleme (face): stok dikdortgeni uzerinde zikzak; son paso yuzey z'sinde (+ eksenel stok payi).
// Kapsama: hat araligi <= stepover < takim capi, ilk/son hat stok kenarinda (takim kenari stok disina tasar);
// hat uclari stok disinda takim yaricapi + extend kadar uzanir; hatlar arasi gecis stok disinda yapilir.
import { cerr } from '../geom/err.js';
import { need, opt, posNum, nonNeg, anyNum, cutting, heights, depthLevels, Builder, finishToolpath, stockToLeave } from './common.js';

export function computeFace(op, ctx) {
  const { setup: S, tool, machine } = ctx;
  if (S.stock.kind === 'cyl') throw cerr('cam.face.needs_box_stock');
  const cut = cutting(op);
  const r = tool.dia / 2;
  const so = need(op, 'stepover'); if (!(so < tool.dia)) throw cerr('cam.op.stepover_too_big', { stepover: so, dia: tool.dia });
  const sd = opt(op, 'stepdown', posNum, 'number > 0', null);
  const sta = stockToLeave(op).axial;
  const ang = (opt(op, 'direction', anyNum, 'number', 0) * Math.PI) / 180;
  const ext = opt(op, 'extend', nonNeg, 'number >= 0', 0);
  const h = heights({ ...op, heights: { top: { from: 'stockTop', off: 0 }, bottom: { from: 'modelTop', off: 0 }, ...op.heights } }, S, {});
  const zBot = h.zBot + sta;
  if (!(h.zTop > zBot + 1e-9)) throw cerr('cam.face.nothing', { top: h.zTop, bottom: zBot });
  const levels = depthLevels(h.zTop, zBot, sd, null);
  const passDepth = levels.reduce((m, z, i) => Math.max(m, (i ? levels[i - 1] : h.zTop) - z), 0);
  const u = [Math.cos(ang), Math.sin(ang)], v = [-Math.sin(ang), Math.cos(ang)];
  const B = S.stockBox; const cs = [[B.min[0], B.min[1]], [B.max[0], B.min[1]], [B.max[0], B.max[1]], [B.min[0], B.max[1]]];
  const pu = cs.map((p) => p[0] * u[0] + p[1] * u[1]), pv = cs.map((p) => p[0] * v[0] + p[1] * v[1]);
  const u0 = Math.min(...pu) - r - ext, u1 = Math.max(...pu) + r + ext, v0 = Math.min(...pv), v1 = Math.max(...pv);
  const n = v1 - v0 < 1e-9 ? 1 : Math.ceil((v1 - v0) / so - 1e-9) + 1;
  const vs = []; for (let i = 0; i < n; i++) vs.push(n === 1 ? (v0 + v1) / 2 : v0 + ((v1 - v0) * i) / (n - 1));
  const P = (uu, vv) => [uu * u[0] + vv * v[0], uu * u[1] + vv * v[1]];
  const b = new Builder({ zClr: h.zClr, zRet: h.zRet, feed: cut.feedCut, tool });
  for (const z of levels) {
    const s0 = P(u0, vs[0]);
    b.linkTo(s0[0], s0[1], z, cut.feedPlunge, { far: false });
    vs.forEach((vv, i) => {
      const a = P(i % 2 ? u1 : u0, vv), e = P(i % 2 ? u0 : u1, vv);
      if (i > 0) b.feed(a[0], a[1], z, cut.feedCut, 'cut'); // stok disinda yan gecis
      b.feed(e[0], e[1], z, cut.feedCut, 'cut');
    });
    b.up();
  }
  return finishToolpath(op, tool, cut, { ...h, zBot }, b, { passDepth, rapidFeed: machine?.feed?.rapid ?? undefined, meta: { lines: n } });
}
