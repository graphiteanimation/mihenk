// 2. Parametrik sağlamlık: her parçada parametreler değiştirilir; kayıtlı Ref'ler (yuvarlatma/pah/kabuk/yüz-sketch) doğru elemana bağlı kalıyor mu?
// Yöntem: varsayılan p0'da seçilen Ref'ler (refs0) yeni p'de olduğu gibi kullanılır ("bayat" belge = kullanıcının parametre değiştirmesi).
//   "taze" belge: aynı p'de Ref'ler yeniden geometriden seçilir. Beklenen hacim bağımsız analitik formülden gelir.
//   Sınıf: DOĞRU (ok + hacim = analitik) | REDDEDİLDİ (bir özellik ok:false; sessiz değil) | SESSİZ-YANLIŞ (hepsi ok:true ama hacim analitikten farklı)
import { runMain, newKernel, rb, setMods, props, fmt, sane } from './lib.mjs';
import * as A from './part-a.mjs'; import * as Bm from './part-b.mjs'; import * as C from './part-c.mjs'; import * as D from './part-d.mjs';
import * as E from './part-e.mjs'; import * as F from './part-f.mjs'; import * as G from './part-g.mjs';
export const name = 'param-tarama';
const v = (name, over, extra = {}) => ({ name, over, ...extra });
const dd = (o) => ({ ...o }); // yardımcı
export const PARTS = [
  { M: A, variants: [
    ...[3, 4, 8, 10, 12].map((n) => v(`N=${n}`, { N: n })),
    ...[130, 150, 160].map((x) => v(`OD=${x}`, { OD: x })), ...[86, 96, 98].map((x) => v(`PCD=${x}`, { PCD: x })),
    ...[10, 14, 16].map((x) => v(`T=${x}`, { T: x })), ...[24, 36, 45].map((x) => v(`HH=${x}`, { HH: x })),
    ...[50, 56, 66].map((x) => v(`HD=${x}`, { HD: x })), ...[12, 16, 24, 28].map((x) => v(`BD=${x}`, { BD: x })),
    ...[1, 2, 4].map((x) => v(`RF=${x}`, { RF: x })), ...[0.5, 1, 2].map((x) => v(`CH=${x}`, { CH: x })),
    v('N=8,OD=140,PCD=100,HD=50', { N: 8, OD: 140, PCD: 100, HD: 50 }),
    v('bastır: pat (6→1 delik)', {}, { suppress: ['pat'], ap: { N: 1 } }), v('bastır: bore', {}, { suppress: ['bore'], ap: { BD: 0 } }),
    v('bastır: bolt+pat', {}, { suppress: ['bolt', 'pat'], ap: { N: 0 } }), v('çıkar: bore + N=8', { N: 8 }, { remove: ['bore'], ap: { BD: 0 } }),
  ] },
  { M: Bm, variants: [
    ...[120, 180, 200].map((x) => v(`L=${x}`, { L: x })), ...[50, 60, 70].map((x) => v(`H=${x}`, { H: x })),
    ...[4, 6, 10].map((x) => v(`SD=${x}`, { SD: x })), ...[10, 12, 15].map((x) => v(`SH=${x}`, { SH: x })),
    ...[3, 5, 7].map((x) => v(`DV=${x}`, { DV: x, ZC: 12 })), ...[10, 14].map((x) => v(`ZC=${x}`, { ZC: x })),
    ...[20, 30, 35].map((x) => v(`TK=${x}`, { TK: x })), ...[0.5, 1.5, 2].map((x) => v(`CF=${x}`, { CF: x })), ...[20, 35, 40].map((x) => v(`HX=${x}`, { HX: x })),
    v('bastır: step', {}, { suppress: ['step'], aopt: { noStep: true } }), v('bastır: vee', {}, { suppress: ['vee'], ap: { DV: 0 } }), v('bastır: hol', {}, { suppress: ['hol'], aopt: { noHoles: true } }),
    v('L=180,TK=30,H=60,CF=2', { L: 180, TK: 30, H: 60, CF: 2 }),
  ] },
  { M: C, variants: [
    ...[150, 180, 200].map((x) => v(`OD=${x}`, { OD: x })), ...[12, 18, 20].map((x) => v(`T=${x}`, { T: x })), ...[60, 70, 76].map((x) => v(`SPD=${x}`, { SPD: x })),
    ...[4, 8, 10].map((x) => v(`SPH=${x}`, { SPH: x })), ...[8, 12].map((x) => v(`SW=${x}`, { SW: x })), ...[2, 4, 5, 6, 8].map((x) => v(`NS=${x}`, { NS: x })),
    ...[3, 6, 8].map((x) => v(`NB=${x}`, { NB: x })), ...[6.6, 10].map((x) => v(`BD=${x}`, { BD: x })), ...[1, 3].map((x) => v(`FR=${x}`, { FR: x })),
    v('bastır: spg (fatura)', {}, { suppress: ['spg'], ap: { SPH: 0 } }), v('bastır: spat (tek kanal)', {}, { suppress: ['spat'], ap: { NS: 1 } }), v('NS=4,OD=180,SPH=8', { NS: 4, OD: 180, SPH: 8 }),
  ] },
  { M: D, variants: [
    ...[180, 220, 260].map((x) => v(`PW=${x}`, { PW: x, KW: x - 50 })), ...[100, 140].map((x) => v(`PH=${x}`, { PH: x, KH: x - 40 })),
    ...[16, 24, 30].map((x) => v(`PT=${x}`, { PT: x })), ...[8, 10, 14].map((x) => v(`DEP=${x}`, { DEP: x })),
    ...[12, 18, 22].map((x) => v(`ISL=${x}`, { ISL: x })), ...[5, 10].map((x) => v(`KR=${x}`, { KR: x })), ...[1, 3, 4].map((x) => v(`FR=${x}`, { FR: x })),
    ...[12, 18].map((x) => v(`HC=${x}`, { HC: x })),
    v('bastır: hp (4→1 delik)', {}, { suppress: ['hp'], aopt: { nh: 1 } }), v('bastır: pk (cep yok → fillet reddedilmeli)', {}, { suppress: ['pk'], mustFail: ['fil'] }),
    v('PW=220,PT=24,DEP=14,FR=3', { PW: 220, KW: 170, PT: 24, DEP: 14, FR: 3 }),
  ] },
  { M: E, variants: [
    ...[16, 24].map((x) => v(`D1=${x}`, { D1: x })), ...[26, 34].map((x) => v(`D2=${x}`, { D2: x, KD: 4 })), ...[36, 44].map((x) => v(`D3=${x}`, { D3: x })),
    ...[30, 50].map((x) => v(`L2=${x}`, { L2: x, KX1: Math.min(60, 25 + x - 5) })), ...[50, 70].map((x) => v(`L3=${x}`, { L3: x })),
    ...[0.5, 1.5].map((x) => v(`RF=${x}`, { RF: x })), ...[0.5, 1.5].map((x) => v(`CH=${x}`, { CH: x })), ...[6, 10].map((x) => v(`KW=${x}`, { KW: x })), ...[3, 5].map((x) => v(`KD=${x}`, { KD: x })),
    v('kademe kaldır: D3=D2 (profil 4 kademe)', { D3: 30 }), v('kademe kaldır: D4=D3', { D4: 40 }), v('kademe kaldır: D5=D4 (uç radyüs değişir)', { D5: 30 }), v('L1=20,D1=14', { L1: 20, D1: 14 }),
  ] },
  { M: F, variants: [
    ...[90, 120].map((x) => v(`BL=${x}`, { BL: x })), ...[6, 10].map((x) => v(`BT=${x}`, { BT: x })), ...[50, 80].map((x) => v(`LH=${x}`, { LH: x })),
    ...[70, 80].map((x) => v(`W=${x}`, { W: x, GY: x / 2, BY2: x - 15 })), ...[[30, 30], [50, 45]].map(([a, b]) => v(`GX=${a},GZ=${b}`, { GX: a, GZ: b })),
    ...[4, 8].map((x) => v(`GT=${x}`, { GT: x })), ...[6.6, 10].map((x) => v(`HD=${x}`, { HD: x })), ...[30, 45].map((x) => v(`LZ=${x}`, { LZ: x })),
    v('bastır: rib', {}, { suppress: ['rib'], ap: { GT: 0 } }), v('BT=10,LH=80,W=80', { BT: 10, LH: 80, W: 80, GY: 40, BY2: 65 }),
  ] },
  { M: G, variants: [
    ...[90, 120].map((x) => v(`BW=${x}`, { BW: x })), ...[50, 70].map((x) => v(`BD=${x}`, { BD: x })), ...[37, 50].map((x) => v(`BH=${x}`, { BH: x })),
    ...[4, 8].map((x) => v(`R=${x}`, { R: x })), ...[1.5, 2.5, 3].map((x) => v(`ST=${x}`, { ST: x, R: 6 })), ...[6, 10].map((x) => v(`TW=${x}`, { TW: x })), ...[2, 4].map((x) => v(`RB=${x}`, { RB: x })),
    v('bastır: tw0 (kule)', {}, { suppress: ['tw0'], ap: null, skipVol: true }), v('mod=after R=1.5', { mode: 'after', R: 1.5 }),
  ] },
];
function patchResolve(K, log) {
  const orig = K.resolveRef.bind(K);
  K.resolveRef = (ref, state, kind) => { const body = state.bodies.get(ref.body); const list = body ? (kind === 'face' ? body.shape.faces : body.shape.edges) : []; const byIdx = ref.n === list.length && !!list[ref.idx]; const r = orig(ref, state, kind); log.push({ kind, byIdx }); return r; };
}
export async function evalPart(t, P, only) {
  const { M } = P; const K = newKernel(); const log = []; patchResolve(K, log);
  setMods({}); const b0 = await M.build(K, M.defaults); const refs0 = b0.newRefs; const base = await rb(K, b0.doc);
  t.ok(!base.exc && b0.doc.features.every((f) => base.out.status[f.id].ok), `${M.name}: varsayılan kurulum`);
  const rows = [];
  for (const V of P.variants) {
    if (only && !V.name.includes(only)) continue;
    const p = { ...M.defaults, ...V.over }; const ap = { ...p, ...(V.ap || {}) };
    let expV = null; try { expV = M.analytic(ap, V.aopt || {}).volume; } catch (e) { }
    const row = { part: M.name, variant: V.name, expV };
    // taze
    let freshB = null;
    try { setMods(V); const bf = await M.build(K, p); freshB = bf; const rf = await rb(K, bf.doc); row.fresh = rf.exc ? 'İSTİSNA' : bf.doc.features.every((f) => rf.out.status[f.id]?.ok) ? 'ok' : 'ok:false'; row.freshV = rf.out?.bodies[0]?.volume; row.freshFails = rf.out ? bf.doc.features.filter((f) => rf.out.status[f.id] && !rf.out.status[f.id].ok).map((f) => f.id) : []; }
    catch (e) { row.fresh = 'kurulamadı: ' + e.message; }
    // bayat
    log.length = 0;
    try { setMods(V); const bs = await M.build(K, p, refs0); const rs = await rb(K, bs.doc); row.stale = rs.exc ? 'İSTİSNA' : bs.doc.features.every((f) => rs.out.status[f.id]?.ok) ? 'ok' : 'ok:false'; row.staleV = rs.out?.bodies[0]?.volume; row.nBodies = rs.out?.bodies.length; row.staleFails = rs.out ? bs.doc.features.filter((f) => rs.out.status[f.id] && !rs.out.status[f.id].ok).map((f) => f.id) : []; row.byIdx = log.filter((l) => l.byIdx).length; row.byFp = log.filter((l) => !l.byIdx).length; if (rs.out) { const sp = sane(K, rs.out); if (sp.length) row.insane = sp.join(';'); } }
    catch (e) { row.stale = 'kurulamadı: ' + e.message; }
    setMods({});
    // gerçek bağlanma denetimi: bayat Ref'in çözümlediği eleman, taze (geometriden seçilen) elemanla aynı mı? (hacim simetride yanıltabilir)
    row.bind = [];
    if (freshB) for (const key of Object.keys(refs0)) {
      const fr = freshB.newRefs[key], snap = freshB.snaps[key]; if (!fr || !snap) continue;
      try {
        const freshEls = fr.map((r) => K.resolveRef(r, snap, r.kind)); let staleEls;
        try { staleEls = refs0[key].map((r) => K.resolveRef(r, snap, r.kind)); } catch (e) { row.bind.push(key + ': kayıp'); continue; }
        const same = staleEls.length === freshEls.length && staleEls.every((s) => freshEls.some((f) => f.isSame(s)));
        row.bind.push(key + (same ? ': aynı' : ': FARKLI'));
        if (!same) { row.wrongBind = row.wrongBind || []; row.wrongBind.push(key); }
      } catch (e) { row.bind.push(key + ': ?' + e.message); }
    }
    // sınıf
    const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);
    if (V.mustFail) {
      row.cls = V.mustFail.every((id) => row.staleFails?.includes(id)) ? 'REDDEDİLDİ(beklenen)' : row.stale === 'ok' ? 'SESSİZ-YANLIŞ' : 'DİĞER';
    } else if (row.stale === 'ok') row.cls = V.skipVol || relErr(row.staleV, expV) < 1e-4 && row.nBodies === 1 ? 'DOĞRU' : 'SESSİZ-YANLIŞ';
    else if (row.stale === 'ok:false') row.cls = row.fresh === 'ok' ? 'REDDEDİLDİ(beklenmedi)' : 'REDDEDİLDİ';
    else row.cls = 'İSTİSNA/DİĞER';
    if (row.wrongBind) { row.cls = 'SESSİZ-YANLIŞ(bağlanma)'; t.ok(false, `${M.name} [${V.name}] bayat Ref taze seçimden FARKLI elemana bağlandı: ${row.wrongBind.join(',')}; durum=${row.stale}; hacim ${fmt(row.staleV)} / analitik ${fmt(expV)}`); }
    // taze doğruluk
    if (!V.mustFail && row.fresh === 'ok' && !V.skipVol) t.near(row.freshV, expV, `${M.name} [${V.name}] taze belge hacmi`, 1e-4);
    else if (!V.mustFail && row.fresh !== 'ok' && !row.fresh.startsWith('kurulamadı')) t.ok(false, `${M.name} [${V.name}] taze belge başarısız: ${row.fresh} ${row.freshFails}`);
    if (row.cls === 'SESSİZ-YANLIŞ') t.ok(false, `${M.name} [${V.name}] SESSİZ YANLIŞ BAĞLANMA: bayat-Ref hacmi ${fmt(row.staleV)} analitik ${fmt(expV)} (gövde ${row.nBodies}); taze ${fmt(row.freshV)}`);
    if (row.cls === 'İSTİSNA/DİĞER') t.ok(false, `${M.name} [${V.name}] ${row.stale}`);
    rows.push(row);
  }
  return rows;
}
export async function checks(t, only) {
  const all = [];
  for (const P of PARTS) { if (only && !P.M.name.includes(only.split(':')[0])) continue; all.push(...await evalPart(t, P, only && only.includes(':') ? only.split(':')[1] : null)); }
  const cnt = {}; for (const r of all) cnt[r.cls] = (cnt[r.cls] || 0) + 1;
  t.note('param-sınıf-sayıları', cnt); t.note('param-satırlar', all.map((r) => ({ p: r.part, v: r.variant, cls: r.cls, stale: r.stale, fresh: r.fresh, sf: r.staleFails, bind: r.bind, idx: r.byIdx, fp: r.byFp, sv: r.staleV, ev: r.expV })));
  console.log(JSON.stringify(cnt));
  for (const r of all) if (r.cls !== 'DOĞRU') console.log(`  ${r.cls.padEnd(24)} ${r.part} [${r.variant}] stale=${r.stale} ${r.staleFails || ''} fresh=${r.fresh} ${r.freshFails || ''}`);
  return all;
}
await runMain(import.meta.url, name, async (t) => { await checks(t, process.env.ONLY || null); });
