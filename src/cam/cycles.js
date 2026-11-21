// WP-14: G76 (ince delik, 'fineBore') ve G87 (arka havsa, 'backBore') cevrimlerinin ACILIMI: cevrimi desteklemeyen post/profil icin
// nokta basina acik hareket listesi. Saf JS. Bu acilim mil yonlendirme (M19) YAZMAZ: sapma yonu (shiftDir, derece, XY duzleminde,
// 0 = +X) yalniz takim kaymasi icin kullanilir; kontrolun yonlendirmeli kaydirmasinin (G76/G87 Q) birebir esdegeri DEGILDIR (post uyari verir).
// Adimlar: {t:'rapid', x?, y?, z?} | {t:'feed', x?, y?, z?, f} | {t:'dwell', s}. Koordinatlar setup WCS'sinde.
export const EXPANDABLE = ['fineBore', 'backBore'];
const rad = (d) => (d * Math.PI) / 180;
const r6 = (v) => Math.round(v * 1e6) / 1e6;

// c: IR cevrimi; (x, y): nokta; last: cevrimin son noktasi mi. Donus: adim listesi (ilk adim XY'ye hizli, baslangic duzleminde).
export function expandCyclePoint(c, x, y, last = true) {
  const steps = []; const ret = last || c.returnTo === 'clearance' || c.retract === c.clearance ? c.clearance : c.retract;
  const dir = rad(c.shiftDir ?? 0), sx = r6(Math.cos(dir) * (c.shift || 0)), sy = r6(Math.sin(dir) * (c.shift || 0));
  steps.push({ t: 'rapid', x, y });
  if (c.cycle === 'fineBore') {
    // iner: R'ye hizli, dibe kesme, bekleme, sapma ile cikis yuzeyden uzak: sapmasiz kontrolde yuzeyi cizmemek icin kesme beslemesiyle R'ye cik
    steps.push({ t: 'rapid', z: c.retract });
    steps.push({ t: 'feed', z: c.bottom, f: c.f });
    if (c.dwell > 0) steps.push({ t: 'dwell', s: c.dwell });
    if (c.shift > 0) steps.push({ t: 'rapid', x: r6(x + sx), y: r6(y + sy) });
    steps.push({ t: 'feed', z: c.retract, f: c.f });
    if (c.shift > 0) steps.push({ t: 'rapid', x, y });
    if (ret > c.retract + 1e-9) steps.push({ t: 'rapid', z: ret });
  } else if (c.cycle === 'backBore') {
    // delikten kaymis (sapmali) inis, alt noktada merkeze, yukari kesme, ustte bekleme, sapma, cikis
    steps.push({ t: 'rapid', x: r6(x + sx), y: r6(y + sy) });
    steps.push({ t: 'rapid', z: c.bottom });
    steps.push({ t: 'rapid', x, y });
    steps.push({ t: 'feed', z: c.cutTo, f: c.f });
    if (c.dwell > 0) steps.push({ t: 'dwell', s: c.dwell });
    steps.push({ t: 'rapid', x: r6(x + sx), y: r6(y + sy) });
    steps.push({ t: 'rapid', z: ret });
    steps.push({ t: 'rapid', x, y });
  } else throw new Error('expandCyclePoint: ' + c.cycle);
  return steps;
}

// Toolpath icindeki tum acilabilir cevrimleri acik hareketlere cevirir (baska tuketiciler icin). Yeni toolpath dondurur.
// Cevrim oncesi konum bilinmez: her nokta clearance'ta XY hizlisiyla baslar, ilk hizli hareket bunu zaten saglar.
export function expandToolpathCycles(tp, which = EXPANDABLE) {
  const moves = []; let changed = false;
  for (const m of tp.moves) {
    if (m.t !== 'cycle' || !which.includes(m.cycle)) { moves.push(m); continue; }
    changed = true;
    m.points.forEach(([x, y], n) => {
      let cur = { x, y, z: m.clearance };
      for (const s of expandCyclePoint(m, x, y, n === m.points.length - 1)) {
        if (s.t === 'dwell') { moves.push({ t: 'dwell', s: s.s }); continue; }
        cur = { x: s.x ?? cur.x, y: s.y ?? cur.y, z: s.z ?? cur.z };
        moves.push(s.t === 'rapid' ? { t: 'rapid', ...cur } : { t: 'feed', ...cur, f: s.f, kind: 'cut' });
      }
    });
  }
  return changed ? { ...tp, moves } : tp;
}
