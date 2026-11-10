// 2b. Rastgele (tohumlu) parametre taraması: 1-3 parametreyi birden değiştir; bayat Ref bağlanmasını gerçek elemanla karşılaştır.
import { runMain, tester, newKernel, rb, setMods, fmt } from './lib.mjs';
import { PARTS } from './param-sweep.mjs';
export const name = 'param-rastgele';
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
export async function checks(t, perPart = Number(process.env.N || 40), seed = Number(process.env.SEED || 7)) {
  const R = rng(seed); const summary = {};
  for (const P of PARTS) {
    const M = P.M; const K = newKernel(); setMods({});
    const b0 = await M.build(K, M.defaults); const refs0 = b0.newRefs; await rb(K, b0.doc);
    const keys = Object.keys(M.defaults).filter((k) => typeof M.defaults[k] === 'number' && !['mode', 'tower', 'rebate'].includes(k));
    const st = { tried: 0, valid: 0, doğru: 0, reddedildi: 0, yanlışBağ: 0, yanlışHacim: 0, idxFarkı: 0 };
    for (let it = 0; it < perPart; it++) {
      const p = { ...M.defaults }; const nch = 1 + Math.floor(R() * 3);
      for (let c = 0; c < nch; c++) { const k = keys[Math.floor(R() * keys.length)]; let v = M.defaults[k] * (0.7 + R() * 0.7); if (['N', 'NS', 'NB'].includes(k)) v = Math.max(2, Math.round(v)); else v = Math.round(v * 10) / 10; p[k] = v; }
      st.tried++;
      let fb; try { fb = await M.build(K, p); } catch (e) { continue; }
      const rf = await rb(K, fb.doc); if (rf.exc || !fb.doc.features.every((f) => rf.out.status[f.id]?.ok)) continue;
      let exp = null; try { exp = M.analytic(p).volume; } catch (e) { continue; }
      if (rf.out.bodies.length !== 1 || Math.abs(rf.out.bodies[0].volume - exp) > 1e-4 * exp) continue; // geçersiz (çakışan özellikler) varyant
      st.valid++;
      const bs = await M.build(K, p, refs0); const rs = await rb(K, bs.doc);
      if (rs.exc) { t.ok(false, `${M.name} rastgele: istisna ${rs.exc}`); continue; }
      const okAll = bs.doc.features.every((f) => rs.out.status[f.id]?.ok);
      let wrong = [];
      for (const key of Object.keys(refs0)) {
        const fr = fb.newRefs[key], snap = fb.snaps[key]; if (!fr || !snap) continue;
        try { const fe = fr.map((r) => K.resolveRef(r, snap, r.kind)); let se; try { se = refs0[key].map((r) => K.resolveRef(r, snap, r.kind)); } catch (e) { continue; }
          if (!(se.length === fe.length && se.every((s) => fe.some((f) => f.isSame(s))))) wrong.push(key);
          if (refs0[key].length && refs0[key][0].n === fr[0].n && refs0[key].some((r, i) => !fr.some((f) => f.idx === r.idx))) st.idxFarkı++; } catch (e) { }
      }
      if (wrong.length) { st.yanlışBağ++; t.ok(false, `${M.name} rastgele: YANLIŞ BAĞLANMA ${wrong.join(',')} p=${JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k, v]) => v !== M.defaults[k])))} durum=${okAll ? 'ok' : 'ok:false'}`); }
      else if (!okAll) { st.reddedildi++; t.ok(true, 'reddedildi'); }
      else if (Math.abs(rs.out.bodies[0].volume - exp) > 1e-4 * exp) { st.yanlışHacim++; t.ok(false, `${M.name} rastgele: SESSİZ YANLIŞ HACİM ${fmt(rs.out.bodies[0].volume)} vs ${fmt(exp)}`); }
      else { st.doğru++; t.ok(true, 'doğru'); }
    }
    summary[M.name] = st; console.log(M.name, JSON.stringify(st));
  }
  t.note('rastgele-özet', summary);
}
await runMain(import.meta.url, name, async (t) => { await checks(t); });
