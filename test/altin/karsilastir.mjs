// Altın parça seti: ölçüm özeti, taban karşılaştırması ve tablo (saf JS; koşucu ve test ortak kullanır).
// Giriş "giris" = { id, tur, setups: { S1: { block, warn, temiz, estS, G81, G83, G84 } }, zincir: { S1: block } | null, delik: { elle, bulunan, taninan } | null, hesapS }
// Kötüleşme (kalır): BLOCK artışı (ayrı ya da zincirli), BLOCK kodu çoklu kümesinde tabandan fazla kod (aynı sayıda ama farklı kod dahil), çevrim sayısı (G81/G83/G84) artışı,
// tabanda olmayan parça/setup (taban açık komutla güncellenir), temiz NC'nin temiz olmayana dönmesi, tahmini işleme süresinin %5'ten (en az 1 sn) fazla artması,
// elle girilen deliklerden tanıyıcının bulduğunun azalması, tabandaki parça/setup'ın kaybolması. Çevrim sayısı AZALMASI ve hesap süresi YALNIZ bilgidir.
export const SURE_TOL = 0.05;

const kodSay = (g) => { const k = {}; for (const x of g) if (x.level === 'block') k[x.code || '?'] = (k[x.code || '?'] || 0) + 1; return Object.fromEntries(Object.entries(k).sort()); };
export function ozet(rec) { // P1–P4 `*-mihenk-sonuc.json` → giriş
  const setups = {};
  for (const s of rec.R.setups) {
    const nc = s.nc || s.nc_bloklu || {}; const g = s.gates || [];
    setups[s.id] = { block: g.filter((x) => x.level === 'block').length, kodlar: kodSay(g), warn: g.filter((x) => x.level === 'warn').length, temiz: !!s.post?.ok && !s.build_hata && !s.setup_hata, estS: s.tahmini_sure_s ?? null, G81: nc.G81 ?? 0, G83: nc.G83 ?? 0, G84: nc.G84 ?? 0, opHata: (s.islemler || []).filter((o) => !o.ok).length };
  }
  const z = rec.R.deneyler?.T04_zincir?.setup; const zincir = z ? Object.fromEntries(Object.entries(z).filter(([k]) => k !== 'genel').map(([k, v]) => [k, v.block])) : null;
  const d = rec.R.delik_tanima; const delik = d ? { elle: d.elle_konum, bulunan: d.bulunan_konum, taninan: d.taninan_konum } : null;
  return { id: rec.id, tur: rec.tur || 'compare', setups, zincir, delik, hesapS: rec.R.sure_s ?? null };
}

export function karsilastir(taban, simdi) { // → { kotulesme: [], bilgi: [], sayim: { gecen, kalan } }
  const kotu = [], bilgi = []; let n = 0;
  const chk = (ok, msg) => { n++; if (!ok) kotu.push(msg); };
  for (const [id, b] of Object.entries(taban)) {
    const c = simdi[id];
    if (!c) { chk(false, `${id}: tabanda var, bu koşuda yok`); continue; }
    for (const [sid, bs] of Object.entries(b.setups)) {
      const cs = c.setups[sid];
      if (!cs) { chk(false, `${id} ${sid}: setup kayıp`); continue; }
      chk(cs.block <= bs.block, `${id} ${sid}: BLOCK ${bs.block} → ${cs.block}`);
      chk(!(bs.temiz && !cs.temiz), `${id} ${sid}: temiz NC → NC üretilemiyor`);
      chk(cs.opHata <= bs.opHata, `${id} ${sid}: hesaplanamayan işlem ${bs.opHata} → ${cs.opHata}`);
      if (bs.estS != null && cs.estS != null) chk(cs.estS <= bs.estS * (1 + SURE_TOL) + 1, `${id} ${sid}: tahmini süre ${bs.estS} sn → ${cs.estS} sn (> %${SURE_TOL * 100})`);
      if (bs.kodlar) for (const [kod, say] of Object.entries(cs.kodlar || {})) chk(say <= (bs.kodlar[kod] || 0), `${id} ${sid}: BLOCK kodu ${kod} ${bs.kodlar[kod] || 0} → ${say}`);
      for (const k of ['G81', 'G83', 'G84']) { if (cs[k] > bs[k]) chk(false, `${id} ${sid}: ${k} çevrim sayısı arttı ${bs[k]} → ${cs[k]}`); else if (cs[k] < bs[k]) bilgi.push(`${id} ${sid}: ${k} ${bs[k]} → ${cs[k]} (azaldı; bilgi)`); }
    }
    for (const sid of Object.keys(c.setups)) if (!b.setups[sid]) chk(false, `${id} ${sid}: taban yok: açık komutla güncelle (npm run test:altin -- --taban-guncelle)`);
    if (b.zincir) for (const [sid, v] of Object.entries(b.zincir)) chk((c.zincir?.[sid] ?? Infinity) <= v, `${id} ${sid}: zincirli BLOCK ${v} → ${c.zincir?.[sid] ?? 'yok'}`);
    if (b.delik) chk(!!c.delik && c.delik.bulunan >= b.delik.bulunan, `${id}: tanıyıcının bulduğu delik ${b.delik.bulunan} → ${c.delik?.bulunan ?? 'yok'}`);
    if (b.hesapS != null && c.hesapS != null && c.hesapS > b.hesapS * 3 + 20) bilgi.push(`${id}: hesap süresi ${b.hesapS} sn → ${c.hesapS} sn (bilgi; makineye bağlı)`);
  }
  for (const id of Object.keys(simdi)) if (!taban[id]) chk(false, `${id}: taban yok: açık komutla güncelle (npm run test:altin -- --taban-guncelle)`);
  return { kotulesme: kotu, bilgi, sayim: { gecen: n - kotu.length, kalan: kotu.length } };
}

export function tablo(simdi) {
  const L = ['Parça | Setup | BLOCK (ayrı/zincir) | NC | G81/G83/G84 | tahmini süre sn | delik elle/bulunan/tanınan | hesap sn', '--- | --- | --- | --- | --- | --- | --- | ---'];
  for (const c of Object.values(simdi)) {
    const ids = Object.keys(c.setups);
    ids.forEach((sid, i) => { const s = c.setups[sid]; const z = c.zincir && sid in c.zincir ? c.zincir[sid] : '-'; const d = c.delik; L.push([i ? '' : c.id, sid, `${s.block}/${z}`, s.temiz ? 'temiz' : 'BLOCK', `${s.G81}/${s.G83}/${s.G84}`, s.estS ?? '-', i || !d ? '' : `${d.elle}/${d.bulunan}/${d.taninan}`, i ? '' : c.hesapS ?? '-'].join(' | ')); });
  }
  const tot = Object.values(simdi); const nS = tot.reduce((a, c) => a + Object.keys(c.setups).length, 0), nT = tot.reduce((a, c) => a + Object.values(c.setups).filter((s) => s.temiz).length, 0);
  L.push('', `Temiz NC oranı: ${nT}/${nS} setup; toplam BLOCK (ayrı): ${tot.reduce((a, c) => a + Object.values(c.setups).reduce((x, s) => x + s.block, 0), 0)}`);
  return L.join('\n');
}
