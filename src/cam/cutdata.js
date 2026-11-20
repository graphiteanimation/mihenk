// Kesme verisi kutuphanesi (WP-07): malzeme x takim turu x cap -> devir/ilerleme ONERISI + Vc/fz <-> S/F hesaplayici.
// Yerlesik degerler GENEL ve MUHAFAZAKAR BASLANGIC ONERISIDIR (arayuzde "baslangic onerisi" etiketi); kesin deger degildir, tezgah/takim/ayar
// isine gore kullanici duzenler. Yalniz iki acik kaynakta birbiriyle uyumlu olan, TEK TAS (solid) KARBUR PARMAK FREZE degerleri girilmistir;
// dogrulanamayan malzeme/takim turu icin DEGER KONMAZ (oneri yok; kullanici kendi satirini ekler).
// KAYNAKLAR (erisim 2026-11; olculer inch -> mm cevrildi, SFM -> m/min = SFM x 0,3048):
//  [H] Harvey Tool, "General Machining Guidelines" (https://harveytool.com/resources/general-machining-guidelines): solid karbur freze,
//      malzeme grubuna gore SFM araligi ve cap basina IPT (1/8", 1/4", 1/2", 1"). Yerlesik Vc her grupta bu araligin ALT sinirindan alindi.
//  [U] Penn MEAM, "Carbide End Mills" (https://medesign.seas.upenn.edu/index.php/Guides/FeedsAndSpeeds): alumin. 600+ SFM, pirinc 300, yumusak celik 250,
//      paslanmaz 200, plastik 600+ SFM; IPT 1/8", 1/4", 1/2". [H] araligi ile karsilastirildi; farkta DUSUK olan alindi (pirinc: [U] 300 < [H] 600).
// Birimler: Vc m/min, fz mm/dis, cap mm. Titan ve bilyali/cevre-profilli takim icin kaynaklarda tutarli deger yok: yerlesik oneri yok.

export const MATERIALS = ['aluminum', 'brass', 'steel_mild', 'stainless', 'cast_iron', 'plastic'];
// takim turu -> kutuphane turu. Yalniz parmak freze ailesi (flat, bullnose, face) icin yerlesik deger var.
export const CUT_TYPES = ['endmill', 'drill', 'tap', 'chamfer', 'other'];
export const typeOfTool = (tool) => (['flat', 'bullnose', 'face'].includes(tool?.type) ? 'endmill' : tool?.type === 'drill' ? 'drill' : tool?.type === 'tap' ? 'tap' : tool?.type === 'chamfer' ? 'chamfer' : 'other');

const SFM = 0.3048, IN = 25.4;
const DIA_IN = [1 / 8, 1 / 4, 1 / 2, 1]; // [H] tablo capları (inch)
const row = (ipt) => DIA_IN.map((d, i) => ({ dia: +(d * IN).toFixed(4), fz: +(ipt[i] * IN).toFixed(5) }));
// Yerlesik: { id, material, type:'endmill', vc (m/min), fzTable:[{dia,fz}], source }
export const BUILTIN = Object.freeze([
  { id: 'b-al', material: 'aluminum', type: 'endmill', vc: +(800 * SFM).toFixed(1), fzTable: row([0.001, 0.002, 0.004, 0.007]), source: '[H] 2024/6061/7075: 800-1500 SFM (alt sinir); [U] 600+ SFM' },
  { id: 'b-brass', material: 'brass', type: 'endmill', vc: +(300 * SFM).toFixed(1), fzTable: row([0.001, 0.002, 0.003, 0.005]), source: '[U] pirinc 300 SFM; [H] sari/kursunlu pirinc 800-1500 SFM' },
  { id: 'b-mild', material: 'steel_mild', type: 'endmill', vc: +(100 * SFM).toFixed(1), fzTable: row([0.0005, 0.0015, 0.003, 0.006]), source: '[H] 10XX/11XX/13XX dusuk alasimli celik 100-300 SFM (alt sinir); [U] 250 SFM' },
  { id: 'b-ss', material: 'stainless', type: 'endmill', vc: +(100 * SFM).toFixed(1), fzTable: row([0.0001, 0.0005, 0.0015, 0.004]), source: '[H] ostenitik paslanmaz 304/316 100-250 SFM (alt sinir); [U] 200 SFM' },
  { id: 'b-ci', material: 'cast_iron', type: 'endmill', vc: +(100 * SFM).toFixed(1), fzTable: row([0.0005, 0.002, 0.004, 0.008]), source: '[H] gri dokme demir 100-400 SFM (alt sinir)' },
  { id: 'b-plastic', material: 'plastic', type: 'endmill', vc: +(200 * SFM).toFixed(1), fzTable: row([0.001, 0.003, 0.006, 0.015]), source: '[H] akrilik/fenolik 200-600 SFM (alt sinir); [U] 600+ SFM' },
]);

// ---- hesaplayici
const isPos = (v) => Number.isFinite(v) && v > 0;
export const rpmFromVc = (vc, dia) => (isPos(vc) && isPos(dia) ? (1000 * vc) / (Math.PI * dia) : null);
export const vcFromRpm = (rpm, dia) => (isPos(rpm) && isPos(dia) ? (Math.PI * dia * rpm) / 1000 : null);
export const feedFromFz = (rpm, z, fz) => (isPos(rpm) && Number.isInteger(z) && z > 0 && isPos(fz) ? rpm * z * fz : null);
export const fzFromFeed = (rpm, z, feed) => (isPos(rpm) && Number.isInteger(z) && z > 0 && isPos(feed) ? feed / (rpm * z) : null);

// dis basina ilerleme tablosundan (artan cap) cap icin dogrusal interpolasyon; tablo disinda: kucukte cap orantili, buyukte son deger
export function fzAt(table, dia) {
  const t = table.slice().sort((a, b) => a.dia - b.dia);
  if (dia <= t[0].dia) return t[0].fz * (dia / t[0].dia);
  if (dia >= t.at(-1).dia) return t.at(-1).fz;
  for (let i = 1; i < t.length; i++) if (dia <= t[i].dia) { const a = t[i - 1], b = t[i]; return a.fz + ((b.fz - a.fz) * (dia - a.dia)) / (b.dia - a.dia); }
  return t.at(-1).fz;
}

// ---- kullanici satirlari
// {id, material (MATERIALS kimligi ya da serbest ad), type, diaMin, diaMax, vc, fz, note?}
export function normalizeEntry(e) {
  if (!e || typeof e !== 'object') throw new Error('entry');
  const out = { id: String(e.id ?? ''), material: String(e.material ?? '').trim().slice(0, 60), type: CUT_TYPES.includes(e.type) ? e.type : 'endmill', diaMin: Number(e.diaMin ?? 0), diaMax: Number(e.diaMax ?? 1000), vc: Number(e.vc), fz: Number(e.fz) };
  if (e.note) out.note = String(e.note).slice(0, 200);
  return out;
}
export function entryIssues(e) {
  const o = []; if (!e.material) o.push('material'); if (!isPos(e.vc)) o.push('vc'); if (!isPos(e.fz)) o.push('fz');
  if (!(e.diaMin >= 0) || !isPos(e.diaMax) || e.diaMax < e.diaMin) o.push('dia'); return o;
}

// oneri: ara sirasi = belge satirlari, kullanici ayari satirlari, yerlesik. Eslesme: ayni malzeme+tur ve diaMin <= cap <= diaMax.
// Donus: { source:'doc'|'user'|'builtin', entry, vc, fz, rpm, feed, limited? } | null. machine.maxRpm asilirsa devir kisilir, fz korunur (ilerleme yeniden hesaplanir).
export function suggest({ docLib = [], userLib = [], material, type, dia, flutes, maxRpm = null }) {
  if (!isPos(dia) || !Number.isInteger(flutes) || flutes < 1 || !material) return null;
  const inRange = (e) => e.material === material && e.type === type && dia >= (e.diaMin ?? 0) - 1e-9 && dia <= (e.diaMax ?? 1e9) + 1e-9;
  let src = null, entry = null;
  for (const [s, lib] of [['doc', docLib], ['user', userLib]]) { const e = lib.map((x) => { try { return normalizeEntry(x); } catch (_) { return null; } }).filter((x) => x && !entryIssues(x).length).find(inRange); if (e) { src = s; entry = e; break; } }
  let vc, fz;
  if (entry) { vc = entry.vc; fz = entry.fz; }
  else { const b = BUILTIN.find((x) => x.material === material && x.type === type); if (!b) return null; src = 'builtin'; entry = b; vc = b.vc; fz = fzAt(b.fzTable, dia); }
  let rpm = rpmFromVc(vc, dia), limited = false;
  if (isPos(maxRpm) && rpm > maxRpm) { rpm = maxRpm; limited = true; vc = vcFromRpm(rpm, dia); }
  return { source: src, entry, vc, fz, rpm, feed: feedFromFz(rpm, flutes, fz), limited };
}
