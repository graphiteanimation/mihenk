// 5. profiles.js findRegions: iç içe, ortak kenar, T kavşak, kesişim, yay-çizgi teğet, küçük kenar; alan toplamları
import { runMain, newKernel, rb, Sk, basePl, findRegions, polyMoments, PI, rrArea, sane } from './lib.mjs';
export const name = 'profiller';
const net = (r) => r.area - r.holes.reduce((s, h) => s + polyMoments(h.poly).A, 0);
const sumNet = (regs) => regs.reduce((s, r) => s + net(r), 0);
const skOf = (s) => ({ points: s.points, ents: s.ents });
function chkRegions(t, tag, s, expectN, expectNet, relTol = 2e-4) {
  const out = findRegions(skOf(s)); const regs = out.regions;
  t.ok(regs.length === expectN, `${tag}: bölge sayısı ${regs.length} (beklenen ${expectN}); open=${out.open}`);
  if (expectNet != null) t.near(sumNet(regs), expectNet, `${tag}: net alan toplamı`, relTol);
  for (const r of regs) { const A = polyMoments(r.poly).A; t.ok(Math.abs(A - r.area) <= 6e-3 * Math.max(1, A), `${tag}: r.area ≈ çokgen alanı (${r.area} / ${A})`); }
  return out;
}
export async function checks(t) {
  // 3 seviye iç içe dikdörtgen
  let s = new Sk(); s.rect(0, 0, 100, 100); s.rect(20, 20, 80, 80); s.rect(35, 35, 65, 65);
  let o = chkRegions(t, 'P1 3 seviye dikdörtgen', s, 3, 10000);
  const byArea = o.regions.slice().sort((a, b) => b.area - a.area); t.ok(byArea[0].holes.length === 1 && byArea[1].holes.length === 1 && byArea[2].holes.length === 0, 'P1: delik zinciri O→M→I');
  t.near(net(byArea[0]), 10000 - 3600, 'P1: dış halka 6400', 1e-9); t.near(net(byArea[1]), 3600 - 900, 'P1: orta halka 2700', 1e-9); t.near(net(byArea[2]), 900, 'P1: iç 900', 1e-9);
  // 4 seviye: daire-dikdörtgen-daire-dikdörtgen
  s = new Sk(); s.circle(0, 0, 100); s.rect(-60, -60, 60, 60); s.circle(0, 0, 30); s.rect(-10, -10, 10, 10);
  o = chkRegions(t, 'P2 daire⊃dikdörtgen⊃daire⊃dikdörtgen', s, 4, PI * 100 * 100, 2e-3);
  // daire içinde dikdörtgen içinde daire (görev tanımı)
  s = new Sk(); s.circle(0, 0, 50); s.rect(-30, -30, 30, 30); s.circle(0, 0, 10); o = chkRegions(t, 'P3 daire⊃dikdörtgen⊃daire', s, 3, PI * 2500, 2e-3);
  const reg = o.regions.slice().sort((a, b) => b.area - a.area); t.near(net(reg[0]), PI * 2500 - 3600, 'P3: dış daire-dikdörtgen halka', 3e-3); t.near(net(reg[1]), 3600 - PI * 100, 'P3: dikdörtgen-küçük daire', 3e-3);
  // ortak kenar: tek paylaşılan çizgi
  s = new Sk(); s.poly([[0, 0], [50, 0], [50, 50], [0, 50]]); s.line([50, 0], [100, 0]); s.line([100, 0], [100, 50]); s.line([100, 50], [50, 50]);
  chkRegions(t, 'P4 ortak kenar (tek çizgi)', s, 2, 5000);
  // ortak kenar: iki dikdörtgen çizilmiş, ortak kenar iki kez
  s = new Sk(); s.rect(0, 0, 50, 50); s.rect(50, 0, 100, 50); o = chkRegions(t, 'P5 ortak kenar (yinelenen çizgi)', s, 2, 5000);
  // üç komşu
  s = new Sk(); s.rect(0, 0, 30, 30); s.rect(30, 0, 60, 30); s.rect(0, 30, 60, 60); chkRegions(t, 'P6 L düzeni 3 komşu', s, 3, 900 * 2 + 1800);
  // T kavşak: bölücü çizgi dikdörtgenin kenarlarının ORTASINDA biter (kenarlar düğümde bölünmemiş)
  s = new Sk(); s.rect(0, 0, 100, 50); s.line([50, 0], [50, 50]); o = chkRegions(t, 'P7 T kavşak (düğümsüz, bölücü çizgi iki kenarın ortasında)', s, 2, 5000);
  // T kavşak: kenarlar düğümde bölünmüş
  s = new Sk(); s.poly([[0, 0], [50, 0], [100, 0], [100, 50], [50, 50], [0, 50]]); s.line([50, 0], [50, 50]); chkRegions(t, 'P8 T kavşak (düğümlü)', s, 2, 5000);
  // yalnız tek T (bölücü bir kenarda biter, diğer ucu serbest) : sarkan çizgi yok sayılmalı
  s = new Sk(); s.rect(0, 0, 100, 50); s.line([50, 0], [50, 30]); o = chkRegions(t, 'P9 sarkan çizgi', s, 1, 5000); t.ok(o.open === true, 'P9: open bayrağı true');
  // çarpı: iki köşegen düğümsüz kesişir
  s = new Sk(); s.rect(0, 0, 40, 40); s.line([0, 0], [40, 40]); s.line([40, 0], [0, 40]); chkRegions(t, 'P10 köşegenler kesişimde bölünmemiş (4 üçgen beklenir)', s, 4, 1600);
  // kernel üzerinden: çarpı köşegenli dikdörtgen tümü extrude
  { const K0 = newKernel(); const sx = new Sk(); sx.rect(0, 0, 40, 40); sx.line([0, 0], [40, 40]); sx.line([40, 0], [0, 40]);
    const rr = await rb(K0, { params: [], features: [{ id: 's', type: 'sketch', plane: basePl('XY'), points: sx.points, ents: sx.ents, cons: [] }, { id: 'e', type: 'extrude', sketch: 's', profiles: 'all', dist: '10', extent: 'dist', dir: 'one', op: 'new' }] });
    t.near(rr.out?.bodies[0]?.volume, 16000, 'P10b: çarpı köşegenli 40x40 dikdörtgenin tümü extrude (16000); üçgen bölgelerin biri kayboluyor', 1e-6); }
  { const K0 = newKernel(); const sx = new Sk(); sx.rect(0, 0, 50, 50); sx.rect(50, 0, 100, 50);
    const rr = await rb(K0, { params: [], features: [{ id: 's', type: 'sketch', plane: basePl('XY'), points: sx.points, ents: sx.ents, cons: [] }, { id: 'e', type: 'extrude', sketch: 's', profiles: [0], dist: '10', extent: 'dist', dir: 'one', op: 'new' }] });
    t.near(rr.out?.bodies[0]?.volume, 25000, 'P5b: iki bitişik kare, profil 0 seçili: tek kare (25000) beklenir; birleşik 50000 çıkıyor', 1e-6); }
  // dikdörtgeni kesen daire
  s = new Sk(); s.rect(0, 0, 40, 40); s.circle(5, 20, 10); o = findRegions(skOf(s));
  const lens = (() => { const r = 10, d = 0; /* daire merkezi kenar üzerinde: yarım daire içeride */ return PI * 100 / 2; })();
  t.ok(o.regions.length === 3, `P11 dikdörtgeni kesen daire: 3 bölge beklenir (dikdörtgen-dışı, daire-dışı, kesişim); bulunan ${o.regions.length}: net alanlar [${o.regions.map((r) => net(r).toFixed(1))}]`);
  // yay-çizgi teğet geçişler: stadyum
  s = new Sk(); s.slot([0, 0], [40, 0], 10); chkRegions(t, 'P12 stadyum (yay-çizgi teğet)', s, 1, 40 * 20 + PI * 100, 5e-4);
  s = new Sk(); s.slot([0, 0], [30, 40], 6); chkRegions(t, 'P13 eğik stadyum', s, 1, 50 * 12 + PI * 36, 5e-4);
  s = new Sk(); s.rect(0, 0, 60, 40, 8); chkRegions(t, 'P14 yuvarlatılmış dikdörtgen', s, 1, rrArea(60, 40, 8), 3e-4);
  s = new Sk(); s.rect(0, 0, 60, 40, 8); s.slot([15, 20], [45, 20], 5); o = chkRegions(t, 'P15 yuvarlatılmış dikdörtgen ⊃ stadyum', s, 2, rrArea(60, 40, 8), 5e-4);
  // 270° yay + kiriş (C şekli)
  s = new Sk(); const c = s.pt(0, 0), a = s.pt(10, 0), b = s.pt(0, 10); s.ents.push({ id: 'ar', type: 'arc', c, a: b, b: a }); s.line([10, 0], [0, 10]); o = findRegions(skOf(s)); // b=(0,10) → a=(10,0) CCW = 270°
  t.ok(o.regions.length === 1, 'P16: 270° yay + kiriş tek bölge'); t.near(sumNet(o.regions), PI * 100 * 0.75 + 50, 'P16: 270° yay + kiriş alanı (3/4 daire + üçgen 50)', 4e-3);
  // küçük kenarlar
  for (const e of [1e-2, 1e-3, 1e-4, 1e-5, 1e-6]) { s = new Sk(); s.poly([[0, 0], [10, 0], [10, 10], [5 + e, 10], [5, 10 - e], [0, 10]]); o = findRegions(skOf(s)); t.ok(o.regions.length === 1, `P17 küçük kenar ${e}: bölge sayısı ${o.regions.length}`); const exp = 100 - e * (5 + e) / 2; if (o.regions.length) t.near(net(o.regions[0]), exp, `P17 küçük kenar ${e}: alan`, 1e-7); }
  // anahtar yuvarlama sınırı: aynı noktayı temsil eden iki farklı kimlik, 1e-5 ızgarası sınırında
  for (const dx of [2e-9, 2e-7, 2e-6, 4e-6]) {
    s = new Sk(); const x0 = 5e-6 - dx / 2; const p1 = s.freshPt(0, 0), p2 = s.freshPt(10, 0), p3 = s.freshPt(10, 10), p4 = s.freshPt(x0, 10), p5 = s.freshPt(x0 + dx, 10);
    s.ents.push({ id: 'l1', type: 'line', a: p1, b: p2 }, { id: 'l2', type: 'line', a: p2, b: p3 }, { id: 'l3', type: 'line', a: p3, b: p4 }, { id: 'l4', type: 'line', a: p5, b: p1 });
    o = findRegions(skOf(s)); t.ok(o.regions.length === 1, `P18 iki kimlik ${dx} aralıklı (aynı nokta olmalı), x≈5e-6 sınırında: bölge ${o.regions.length}`);
  }
  // aynı çizimi çekirdek üzerinden extrude: ortak kenarlı komşu bölgeler ayrı ayrı seçilebilir
  const K = newKernel(); s = new Sk(); s.rect(0, 0, 50, 50); s.rect(50, 0, 100, 50);
  const regs = findRegions(skOf(s)).regions; const i0 = regs.findIndex((r) => r.poly.every((p) => p[0] <= 50 + 1e-9));
  const d = { params: [], features: [{ id: 's', type: 'sketch', plane: basePl('XY'), points: s.points, ents: s.ents, cons: [] }, { id: 'e', type: 'extrude', sketch: 's', profiles: [i0], dist: '10', extent: 'dist', dir: 'one', op: 'new' }] };
  const r = await rb(K, d); t.ok(!r.exc && r.out.status.e.ok, 'P19: komşu bölge tek başına extrude'); if (!r.exc) t.near(r.out.bodies[0]?.volume, 25000, 'P19: sol kare hacmi', 1e-9);
  // kesişen daire dikdörtgen: dikdörtgen+delik (delik dışarı taşıyor) profili tek başına extrude edilirse
  s = new Sk(); s.rect(0, 0, 40, 40); s.circle(5, 20, 10); const rg = findRegions(skOf(s)).regions; const iR = rg.findIndex((q) => q.holes.length === 1);
  const d2 = { params: [], features: [{ id: 's', type: 'sketch', plane: basePl('XY'), points: s.points, ents: s.ents, cons: [] }, { id: 'e', type: 'extrude', sketch: 's', profiles: [iR], dist: '10', extent: 'dist', dir: 'one', op: 'new' }] };
  const r2 = await rb(K, d2); if (r2.exc) t.ok(false, 'P20: istisna ' + r2.exc); else if (!r2.out.status.e.ok) t.ok(true, 'P20: kesişen daire içeren dikdörtgen profili ok:false'); else { const sp = sane(K, r2.out); t.ok(!sp.length, 'P20: kesişen daire "delik" sayılıyor, ok:true; geçerli katı mı? ' + sp.join(';')); const seg = 100 * Math.acos(0.5) - 5 * Math.sqrt(75), lensA = PI * 100 - seg; t.near(r2.out.bodies[0]?.volume, (1600 - lensA) * 10, 'P20: dikdörtgen−daire kesişimi hacmi (dikdörtgen bölgesi, daire ile ortak kısım hariç)', 1e-3); }
}
await runMain(import.meta.url, name, async (t) => { await checks(t); });
