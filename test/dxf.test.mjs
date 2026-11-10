// DXF testi: kendi yazıcımız ile BAĞIMSIZ (dxf.js'ten bağımsız) bir okuyucu karşılaştırılır; bulge/elips/spline içe aktarma; gidiş-dönüş alan eşitliği.
// Çalıştır: node test/dxf.test.mjs
import { parseDxf, dxfToSketch, sketchToDxf } from '../src/shared/dxf.js';
import { findRegions } from '../src/shared/profiles.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

// ---- bağımsız okuyucu: yalnız grup kodu çiftleri; varlık = {type, g:{kod:[değerler]}}
function readIndependent(text) {
  const L = text.split('\n'); const pairs = [];
  for (let i = 0; i + 1 < L.length; i += 2) pairs.push([+L[i], L[i + 1]]);
  const ents = []; let inEnt = false, cur = null; let ver = null;
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 9 && v === '$ACADVER') ver = pairs[i + 1][1];
    if (c === 0 && v === 'SECTION' && pairs[i + 1][1] === 'ENTITIES') { inEnt = true; i++; continue; }
    if (c === 0 && v === 'ENDSEC') { inEnt = false; continue; }
    if (!inEnt) continue;
    if (c === 0) { cur = { type: v, g: {} }; ents.push(cur); } else (cur.g[c] = cur.g[c] || []).push(v);
  }
  return { ver, ents, eof: pairs[pairs.length - 1][1] === 'EOF' };
}
const first = (e, c) => parseFloat(e.g[c][0]);

const area = (sk) => findRegions(sk).regions.reduce((s, r) => s + r.net, 0);
const mkSk = () => ({ points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [] });
const P = (sk, id, x, y) => { sk.points[id] = { x, y }; return id; };

// ---- örnek eskiz: dikdörtgen kenarında yarım daire ucu (kapalı), ayrıca daire, elips, spline, nokta, yapı çizgisi
const sk = mkSk();
P(sk, 'a', 0, 0); P(sk, 'b', 20, 0); P(sk, 'c', 20, 10); P(sk, 'd', 0, 10); P(sk, 'cc', 20, 5);
sk.ents.push({ id: 'l1', type: 'line', a: 'a', b: 'b' }, { id: 'a1', type: 'arc', c: 'cc', a: 'b', b: 'c' }, { id: 'l2', type: 'line', a: 'c', b: 'd' }, { id: 'l3', type: 'line', a: 'd', b: 'a' });
P(sk, 'k', 60, 5); sk.ents.push({ id: 'c1', type: 'circle', c: 'k', r: 4 });
P(sk, 'e0', 100, 0); P(sk, 'ef', 104, 0); sk.ents.push({ id: 'el', type: 'ellipse', c: 'e0', f: 'ef', rmin: 3 }); // rx = 5, ry = 3
P(sk, 's1', 0, 40); P(sk, 's2', 10, 50); P(sk, 's3', 20, 40); P(sk, 's4', 30, 50); sk.ents.push({ id: 'sp', type: 'spline', pts: ['s1', 's2', 's3', 's4'] });
P(sk, 'pp', 5, 5); sk.ents.push({ id: 'pt', type: 'point', p: 'pp' });
P(sk, 'x1', -50, 0); P(sk, 'x2', -50, 10); sk.ents.push({ id: 'cons1', type: 'line', a: 'x1', b: 'x2', cons: true });
const A0 = area(sk);
ok(Math.abs(A0 - (200 + Math.PI * 12.5 + Math.PI * 16 + Math.PI * 15)) < 1e-3, 'örnek eskiz alanı beklenen: ' + A0);

// ---- dışa aktarma: R12
const r12 = sketchToDxf(sk, { version: 'R12' });
const R12 = readIndependent(r12.text);
ok(R12.ver === 'AC1009' && R12.eof, 'R12: sürüm ve EOF');
const cnt = (R, t) => R.ents.filter((e) => e.type === t).length;
ok(cnt(R12, 'LINE') === 3 && cnt(R12, 'ARC') === 1 && cnt(R12, 'CIRCLE') === 1 && cnt(R12, 'POINT') === 1, 'R12: LINE 3, ARC 1, CIRCLE 1, POINT 1');
ok(cnt(R12, 'ELLIPSE') === 0 && cnt(R12, 'SPLINE') === 0 && cnt(R12, 'POLYLINE') === 2 && cnt(R12, 'VERTEX') > 20, 'R12: elips ve spline POLYLINE olarak');
ok(cnt(R12, 'POLYLINE') === cnt(R12, 'SEQEND'), 'R12: her POLYLINE için SEQEND');
ok(R12.ents.filter((e) => e.type === 'LINE').every((e) => e.g[8][0] === '0'), 'R12: yapı çizgisi yazılmadı (yalnız katman 0, 3 çizgi)');
const arc12 = R12.ents.find((e) => e.type === 'ARC');
ok(near(first(arc12, 40), 5) && near(first(arc12, 50), 270) && near(first(arc12, 51), 90) && near(first(arc12, 10), 20) && near(first(arc12, 20), 5), 'R12: ARC merkez (20,5), r 5, 270°→90° (saat yönü tersi)');
const l12 = R12.ents.find((e) => e.type === 'LINE');
ok(near(first(l12, 10), 0) && near(first(l12, 11), 20), 'R12: ilk LINE (0,0)→(20,0)');

// ---- dışa aktarma: 2000
const r2k = sketchToDxf(sk, { version: '2000' });
const R2 = readIndependent(r2k.text);
ok(R2.ver === 'AC1015' && R2.eof, '2000: sürüm ve EOF');
ok(cnt(R2, 'ELLIPSE') === 1 && cnt(R2, 'SPLINE') === 1 && cnt(R2, 'LWPOLYLINE') === 0, '2000: ELLIPSE ve SPLINE yazıldı');
const el = R2.ents.find((e) => e.type === 'ELLIPSE');
ok(near(first(el, 11), 5) && near(first(el, 21), 0) && near(first(el, 40), 0.6) && near(first(el, 41), 0) && near(first(el, 42), 2 * Math.PI), '2000: ELLIPSE ana eksen (5,0), oran 0.6, 0→2π');
const spl = R2.ents.find((e) => e.type === 'SPLINE');
ok(spl.g[11].length === 4 && spl.g[74][0] === '4', '2000: SPLINE 4 uyum noktası');
ok(R2.ents.every((e) => e.g[5] && e.g[5].length === 1), '2000: her varlıkta tutamaç (5)');
const handles = R2.ents.map((e) => e.g[5][0]); ok(new Set(handles).size === handles.length, '2000: tutamaçlar benzersiz');

// ---- gidiş-dönüş: kendi okuyucumuz
for (const [name, out] of [['R12', r12], ['2000', r2k]]) {
  const back = mkSk(); const parsed = parseDxf(out.text);
  ok(parsed.ents.length === out.count, name + ': okunan varlık sayısı = yazılan (' + parsed.ents.length + ' / ' + out.count + ')');
  const rep = dxfToSketch(parsed, back, { scale: 1 });
  ok(rep.count >= 3, name + ': içe aktarma sayıldı ' + rep.count);
  // kapalı profil: dikdörtgen+yarım daire (R12'de yay ARC), daire, elips (R12'de çokgenlenmiş POLYLINE)
  const regs = findRegions(back).regions;
  const tot = regs.reduce((s, r) => s + r.net, 0);
  const expect = 200 + Math.PI * 12.5 + Math.PI * 16 + (name === '2000' ? Math.PI * 15 : Math.PI * 15);
  ok(Math.abs(tot - expect) < (name === 'R12' ? 0.1 : 1e-3), `${name}: gidiş-dönüş toplam alan ${tot.toFixed(4)} ≈ ${expect.toFixed(4)}`);
  ok(regs.length === 3, name + ': 3 ayrı kapalı bölge (' + regs.length + ')');
}

// ---- içe aktarma: elle yazılmış DXF (LWPOLYLINE+bulge, POLYLINE, ARC, ELLIPSE, SPLINE, birim=inç, ek katmanlar)
const g = (...a) => a.join('\n') + '\n';
const lw = g('0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LWPOLYLINE', '8', 'KATMAN_A', '90', '4', '70', '1', '10', '0', '20', '0', '10', '20', '20', '0', '42', '1', '10', '20', '20', '10', '10', '0', '20', '10', '42', '1',
  '0', 'ENDSEC', '0', 'EOF');
const p1 = parseDxf(lw);
ok(p1.units.code === 1 && p1.units.factor === 25.4, 'birim: $INSUNITS=1 → 25.4');
const s1 = mkSk(); const r1 = dxfToSketch(p1, s1, { scale: 1 });
ok(r1.lines === 2 && r1.arcs === 2, 'LWPOLYLINE: 2 çizgi + 2 bulge yayı (' + r1.lines + ',' + r1.arcs + ')');
ok(Math.abs(area(s1) - (200 + Math.PI * 25)) < 1e-6, 'LWPOLYLINE bulge=1: alan 200+25π → ' + area(s1));
const s1b = mkSk(); dxfToSketch(p1, s1b, { scale: p1.units.factor });
ok(Math.abs(area(s1b) - (200 + Math.PI * 25) * 25.4 * 25.4) < 1e-3, 'inç → mm ölçekleme: alan × 645.16');

// negatif bulge (saat yönü) aynı şekli verir
const lwNeg = g('0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '90', '4', '70', '1', '10', '0', '20', '0', '42', '-1', '10', '0', '20', '10', '10', '20', '20', '10', '42', '-1', '10', '20', '20', '0', '0', 'ENDSEC', '0', 'EOF');
const s2 = mkSk(); dxfToSketch(parseDxf(lwNeg), s2);
ok(Math.abs(area(s2) - (200 + Math.PI * 25)) < 1e-6, 'negatif bulge: aynı alan → ' + area(s2));

// eski POLYLINE/VERTEX + uç birleştirme toleransı: üç çizgi + 1e-4 mm kaçıklıkla dördüncü
const poly = g('0', 'SECTION', '2', 'ENTITIES', '0', 'POLYLINE', '8', '0', '66', '1', '70', '0',
  '0', 'VERTEX', '10', '0', '20', '0', '0', 'VERTEX', '10', '10', '20', '0', '0', 'VERTEX', '10', '10', '20', '10', '0', 'SEQEND',
  '0', 'LINE', '8', 'BASKA', '10', '10.0001', '20', '10', '11', '0', '21', '10', '0', 'LINE', '10', '0', '20', '10', '11', '0.00005', '21', '0.0000', '0', 'ENDSEC', '0', 'EOF');
const s3 = mkSk(); const r3 = dxfToSketch(parseDxf(poly), s3, { scale: 1, tol: 1e-3 });
ok(r3.lines === 4, 'POLYLINE+LINE: 4 çizgi (' + r3.lines + ')');
ok(Math.abs(area(s3) - 100) < 1e-2 && findRegions(s3).regions.length === 1, 'uç birleştirme: tek kapalı kare, alan ≈ 100 → ' + area(s3));
const ptsUsed = new Set(s3.ents.flatMap((e) => [e.a, e.b])); ok(ptsUsed.size === 4, 'uç birleştirme: 4 ortak nokta (' + ptsUsed.size + ')');

// ARC + CIRCLE + ELLIPSE (tam ve yay) + SPLINE
const mix = g('0', 'SECTION', '2', 'ENTITIES',
  '0', 'ARC', '10', '0', '20', '0', '40', '10', '50', '0', '51', '90',
  '0', 'ARC', '10', '0', '20', '0', '40', '10', '50', '350', '51', '10',
  '0', 'CIRCLE', '10', '50', '20', '0', '40', '3',
  '0', 'ELLIPSE', '10', '100', '20', '0', '30', '0', '11', '0', '21', '6', '31', '0', '40', '0.5', '41', '0', '42', '6.283185307179586',
  '0', 'ELLIPSE', '10', '200', '20', '0', '30', '0', '11', '4', '21', '0', '31', '0', '40', '0.5', '41', '0', '42', '3.141592653589793',
  '0', 'SPLINE', '70', '8', '71', '3', '72', '8', '73', '4', '40', '0', '40', '0', '40', '0', '40', '0', '40', '1', '40', '1', '40', '1', '40', '1',
  '10', '0', '20', '0', '10', '5', '20', '10', '10', '10', '20', '-10', '10', '15', '20', '0',
  '0', 'SPLINE', '70', '1', '71', '3', '74', '4', '11', '0', '21', '0', '11', '5', '21', '5', '11', '0', '21', '10', '11', '-5', '21', '5',
  '0', 'TEXT', '10', '0', '20', '0', '1', 'merhaba', '0', 'ENDSEC', '0', 'EOF');
const pm = parseDxf(mix); ok(pm.skipped.TEXT === 1, 'desteklenmeyen varlık (TEXT) atlandı ve sayıldı');
const s4 = mkSk(); const r4 = dxfToSketch(pm, s4);
ok(r4.arcs === 2 && r4.circles === 1 && r4.ellipses === 2 && r4.splines === 2, 'karışık: 2 yay, 1 daire, 2 elips, 2 spline (' + JSON.stringify(r4) + ')');
const ell = s4.ents.find((e) => e.type === 'ellipse'); const ellPts = [s4.points[ell.c], s4.points[ell.f]];
ok(near(ellPts[0].x, 100) && near(ell.rmin, 3) && near(Math.hypot(ellPts[1].x - 100, ellPts[1].y), Math.sqrt(36 - 9), 1e-9) && ellPts[1].y > 0, 'ELLIPSE dönüşümü: ana eksen 6 (+Y), küçük yarıçap 3, odak 5.196');
const sp1 = s4.ents.filter((e) => e.type === 'spline'); ok(sp1[0].pts.length >= 8 && sp1[1].closed === true && sp1[1].pts.length === 4, 'SPLINE: kontrol noktalı örneklenir; uyum noktalı kapalı');
const ea = s4.ents.find((e) => e.type === 'ellarc'); ok(!!ea, 'yarım ELLIPSE → ellarc');
// ellarc geometrisi: (204,0)'dan (196,0)'a üst yarı (y>0)
const pa = s4.points[ea.a], pb = s4.points[ea.b]; ok(near(pa.x, 204, 1e-6) && near(pb.x, 196, 1e-6) && near(pa.y, 0, 1e-6), 'ellarc uçları (204,0) → (196,0)');

// ---- birim bilinmiyorsa: factor null (çağıran sorar)
ok(parseDxf(g('0', 'SECTION', '2', 'ENTITIES', '0', 'ENDSEC', '0', 'EOF')).units.factor === null, 'birim yoksa factor null (kullanıcıya sorulur)');
// ---- bozuk/boş giriş
ok(parseDxf('').ents.length === 0, 'boş dosya: varlık yok, hata yok');
ok(parseDxf('abc\nxyz\n').ents.length === 0, 'DXF olmayan metin: hata fırlatmaz');
// ---- CRLF
const crlf = lw.replace(/\n/g, '\r\n'); ok(parseDxf(crlf).ents.length === 1, 'CRLF satır sonları');

console.log(`dxf: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
