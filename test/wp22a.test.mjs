// WP-22a testleri: (1) DXF kesme cizgisi katmanlari, (2) kopuk olcuyu yeni kenara baglama, (3) altlik cekirdegi (kilit/ozellik/sema/eski belge),
// (4) pdf.js ile PDF acma (sayfa sayisi/boyut/hatalar; Node'da sahte iscide), (5) PDF isci/CSP statik denetimleri. Calistir: node test/wp22a.test.mjs
// Sayfayi goruntuye CIZME (canvas) tarayicida test/wp22a-ui.test.py ile denenir.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url'; import { createRequire } from 'node:module';
// Node 22 icin pdf.js 6'nin istedigi yeni dil ozellikleri (Electron 45 / Chromium'da yerlesiktir): yalniz test ortami
if (!Promise.try) Promise.try = (f, ...a) => new Promise((r) => r(f(...a)));
if (!Uint8Array.prototype.toHex) Uint8Array.prototype.toHex = function () { return Array.from(this, (b) => b.toString(16).padStart(2, '0')).join(''); };
const here = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(here, '..');
const { toDxf, DXF_LAYER } = await import('../src/drawing/dxfout.js');
const { parseDxf } = await import('../src/shared/dxf.js');
const { LAYERS } = await import('../src/drawing/sheet.js');
const { evalDim, mkRef, relinkRef, lostRefIdx, resolveRef } = await import('../src/drawing/dims.js');
const { validateDrawings, newDrawing } = await import('../src/drawing/model.js');
const U = await import('../src/shared/underlay.js');
const { validateDoc } = await import('../src/shared/schema.js');
const { configurePdf, openPdf, PDF_LIMITS } = await import('../src/shared/pdfrender.js');
const require = createRequire(import.meta.url);
const { CSP, WORKER_CSP, isWorkerScript } = require(path.join(ROOT, 'electron/csp.cjs'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, m, tl = 1e-6) => ok(Math.abs(a - b) <= tl, `${m}: ${a} != ${b}`);
const throwsCode = async (fn, code, m) => { try { await fn(); ok(false, `${m}: hata bekleniyordu (${code})`); } catch (e) { ok(e.code === code, `${m}: ${e.code} != ${code}`); } };

// ------------------------------------------------------------------ 1. DXF kesme cizgisi
console.log('1. DXF kesme cizgisi: kalin uclar surekli, ince govde eksen cizgisi');
{
  const page = { W: 100, H: 100, list: [
    { k: 'l', a: [10, 50], b: [90, 50], ly: 'cut' }, { k: 'l', a: [10, 50], b: [16, 50], ly: 'cutk' }, { k: 'l', a: [84, 50], b: [90, 50], ly: 'cutk' },
    { k: 'l', a: [10, 10], b: [20, 10], ly: 'vis' },
  ] };
  const dx = toDxf(page);
  // ham cift okuma: katman tablosu (ad -> cizgi turu) ve LINE varliklarinin katmani
  const L = dx.text.split('\n'); const P = []; for (let i = 0; i + 1 < L.length; i += 2) P.push([+L[i], L[i + 1]]);
  const layerLt = {}; const lineLayers = [];
  for (let i = 0; i < P.length; i++) {
    if (P[i][0] === 0 && P[i][1] === 'LAYER') { let nm = null, lt = null; for (let j = i + 1; j < P.length && P[j][0] !== 0; j++) { if (P[j][0] === 2) nm = P[j][1]; if (P[j][0] === 6) lt = P[j][1]; } layerLt[nm] = lt; }
    if (P[i][0] === 0 && P[i][1] === 'LINE') { for (let j = i + 1; j < P.length && P[j][0] !== 0; j++) if (P[j][0] === 8) { lineLayers.push(P[j][1]); break; } }
  }
  ok(DXF_LAYER.cut === 'CUTTING' && DXF_LAYER.cutk === 'CUTTING_ENDS', 'katman adlari: CUTTING / CUTTING_ENDS');
  ok(layerLt.CUTTING === 'CENTER', 'CUTTING katmani eksen cizgisi (CENTER): ' + layerLt.CUTTING);
  ok(layerLt.CUTTING_ENDS === 'CONTINUOUS', 'CUTTING_ENDS katmani surekli: ' + layerLt.CUTTING_ENDS);
  ok(lineLayers.filter((x) => x === 'CUTTING').length === 1 && lineLayers.filter((x) => x === 'CUTTING_ENDS').length === 2, 'govde 1, uc 2 cizgi: ' + lineLayers.join(','));
  ok(LAYERS.cutk.lt === 'CONTINUOUS' && LAYERS.cut.lt === 'CENTER' && LAYERS.cutk.w > LAYERS.cut.w, 'sayfa katmani: uc kalin+surekli, govde ince+eksen');
  // geri okuma: mevcut okuyucu ucu 4 cizgiyi de okur, uzunluklar korunur
  const pr = parseDxf(dx.text); const lines = pr.ents.filter((e) => e.type === 'line');
  ok(lines.length === 4 && dx.counts.LINE === 4, 'geri okuma: 4 cizgi');
  const lens = lines.map((e) => Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1])).sort((a, b) => a - b);
  near(lens[0], 6, 'uc uzunlugu 6'); near(lens[3], 80, 'govde uzunlugu 80');
  ok(/^[\x0a\x20-\x7e]*$/.test(dx.text), 'ASCII');
}

// ------------------------------------------------------------------ 2. Kopuk olcuyu yeni kenara baglama
console.log('2. Kopuk olcuyu yeni kenara baglama');
{
  const L = (a, b, src) => ({ t: 'l', a, b, src, vis: true });
  const C = (c, r, src) => ({ t: 'c', c, r, src, vis: true });
  const prims0 = [L([0, 0], [40, 0], 'e1'), L([0, 0], [0, 20], 'e2'), L([40, 0], [40, 20], 'e3'), C([20, 10], 4, 'e4')];
  // yatay lineer olcu: e2 (a ucu) ile e3 (a ucu) arasi
  const dim = { id: 'd1', view: 'v1', type: 'lin', dir: 'h', refs: [mkRef(prims0[1], 'a', [0, 1]), mkRef(prims0[2], 'a', [40, 1])], off: 8 };
  const e0 = evalDim(dim, prims0, 0.01); ok(!e0.lost && Math.abs(e0.value - 40) < 1e-9, 'baslangic: 40 mm, kopuk degil');
  // model degisti: e3 kenar anahtari ve konumu degisti -> kopuk
  const prims1 = [L([0, 0], [55, 0], 'e1'), L([0, 0], [0, 20], 'e2'), L([55, 0], [55, 20], 'e9'), C([20, 10], 4, 'e4')];
  const e1 = evalDim(dim, prims1, 0.01); ok(e1.lost, 'model degisince olcu kopuk');
  const idx = lostRefIdx(e1.how); ok(idx.length === 1 && idx[0] === 1, 'kopuk basvuru dizini = [1]: ' + JSON.stringify(idx));
  near(e1.value, 40, 'kopukken son bilinen deger korunur (dim.last yoksa hayalet geometri)');
  // yeni kenar sec -> bag yenilenir, olcu yeni degeri hesaplar
  const nr = relinkRef(dim.refs[1], prims1[2], [55, 1]); ok(nr && nr.src === 'e9' && nr.pt === 'a', 'yeni basvuru yeni kenar anahtarini tasir');
  const dim2 = { ...dim, refs: [dim.refs[0], nr] }; const e2 = evalDim(dim2, prims1, 0.01);
  ok(!e2.lost && Math.abs(e2.value - 55) < 1e-9, 'baglandiktan sonra olcu 55 mm ve kopuk degil: ' + e2.value);
  // sonraki modelde de anahtarla yeniden eslenir
  const prims2 = [L([0, 0], [60, 0], 'e1'), L([0, 0], [0, 20], 'e2'), L([60, 0], [60, 20], 'e9'), C([20, 10], 4, 'e4')];
  const e3 = evalDim(dim2, prims2, 0.01); ok(!e3.lost && Math.abs(e3.value - 60) < 1e-9 && e3.how[1] === 'key', 'yeni bag kalici: anahtarla eslesir');
  // tur uyusmazligi: daire olcusu cizgiye baglanamaz; cizgi olcusu daireye baglanamaz
  const dd = { id: 'd2', view: 'v1', type: 'dia', refs: [mkRef(prims0[3])], off: 8 };
  ok(relinkRef(dd.refs[0], prims1[0]) === null, 'daire olcusu cizgiye baglanmaz');
  ok(relinkRef(dim.refs[0], prims1[3]) === null, 'cizgi olcusu daireye baglanmaz');
  // daire olcusu: yeni daireye bagla
  const prims3 = [C([30, 10], 6, 'x7')]; const e4 = evalDim(dd, prims3, 0.01); ok(e4.lost, 'daire olcusu kopuk');
  const nr2 = relinkRef(dd.refs[0], prims3[0]); const e5 = evalDim({ ...dd, refs: [nr2] }, prims3, 0.01); ok(!e5.lost && Math.abs(e5.value - 12) < 1e-9, 'daire olcusu yeni daireye baglandi: Ø12');
  // yay da daire gibi kabul edilir
  const arc = { t: 'a', c: [0, 0], r: 5, a0: 0, sw: 1, src: 'k' }; ok(relinkRef(dd.refs[0], arc) !== null, 'daire olcusu yaya baglanabilir');
  // orta nokta secimi korunur (pt: 'm')
  const dm = { id: 'd3', view: 'v1', type: 'lin', dir: 'h', refs: [mkRef(prims0[1], 'm'), mkRef(prims0[2], 'm')] };
  ok(relinkRef(dm.refs[0], prims1[1]).pt === 'm', 'nokta secimi (orta) korunur');
  // sema: baglanan olcu belge dogrulamasindan gecer
  const dr = newDrawing({ name: 'T' }); dr.views.push({ id: 'v1', kind: 'base', orient: 'front', o: [10, 10], hidden: false, cmark: true }); dr.dims.push({ ...dim2 });
  let sch = true; try { validateDrawings([dr]); } catch (e) { sch = false; console.log(e.code, JSON.stringify(e.params)); } ok(sch, 'baglanmis olcu cizim semasindan gecer');
  void resolveRef;
}

// ------------------------------------------------------------------ 3. Altlik cekirdegi: ozellik/kilit/sema/eski belge
console.log('3. Altlik: ozellikler, kilit, sema, eski belge');
{
  const png = (w, h) => { const b = new Uint8Array(33); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]); const dv = new DataView(b.buffer); dv.setUint32(16, w); dv.setUint32(20, h); return b; };
  const u0 = U.makeUnderlay('plan.png', png(400, 200), { mmPerPx: 0.5 }); ok(u0.locked === false && u0.mmPerPx === 0.5 && U.checkUnderlay(u0) === true, 'yeni altlik: kilitsiz, verilen mm/px');
  const u1 = U.withProps(u0, { opacity: 0.25, visible: false, locked: true }); ok(u1.opacity === 0.25 && u1.visible === false && u1.locked === true && u1.data === u0.data && u0.opacity === 0.5, 'withProps yeni nesne, ayni veri dizgesi, eskisi degismez');
  let bad = false; try { U.withProps(u0, { opacity: 1.5 }); } catch (e) { bad = e.code === 'underlay.bad_image'; } ok(bad, 'saydamlik 0..1 disi reddedilir');
  bad = false; try { U.checkUnderlay({ ...u0, locked: 'evet' }); } catch (e) { bad = e.code === 'underlay.bad_image'; } ok(bad, 'locked mantiksal olmali');
  // olcekle: A sabit, B mesafesi gercek
  const pA = [100, 150], pB = [300, 150]; const s1 = U.scaleByDistance(u0, pA, pB, 200);
  near(Math.hypot(...U.pxToSketch(s1, pB).map((v, i) => v - U.pxToSketch(s1, pA)[i])), 200, 'olcekleme sonrasi |AB| = 200 mm');
  near(U.pxToSketch(s1, pA)[0], U.pxToSketch(u0, pA)[0], 'A noktasi yerinde kalir (x)'); near(U.pxToSketch(s1, pA)[1], U.pxToSketch(u0, pA)[1], 'A noktasi yerinde kalir (y)');
  // belge: yeni altlik (locked dahil) sema dogrulamasindan gecer; locked'siz eski belge de gecer
  const mkDoc = (u) => ({ features: [{ id: 'sk1', type: 'sketch', seq: 1, plane: { kind: 'base', name: 'XY', offset: '0' }, points: {}, ents: [], cons: [], dims: [], ...(u ? { underlay: u } : {}) }] });
  let r1 = true; try { validateDoc(mkDoc(u1)); } catch (e) { r1 = false; console.log(e.code, JSON.stringify(e.params)); } ok(r1, 'locked:true altlikli belge gecerli');
  const { locked, ...old } = u0; void locked; let r2 = true; try { validateDoc(mkDoc(old)); } catch (e) { r2 = false; } ok(r2, 'WP-14 bicimli (locked yok) eski belge acilir');
  let r3 = true; try { validateDoc(mkDoc(null)); } catch (e) { r3 = false; } ok(r3, 'altliksiz eskiz gecerli');
  let r4 = false; try { validateDoc(mkDoc({ ...u0, locked: 1 })); } catch (e) { r4 = true; } ok(r4, 'locked mantiksal degilse belge reddedilir');
  // kaydet/ac gidis-donus: JSON
  const rt = JSON.parse(JSON.stringify(mkDoc(U.fitTwoPoints(u1, [10, 10], [110, 10], [0, 0], [0, 50])))); let r5 = true; try { validateDoc(rt); } catch (e) { r5 = false; } ok(r5 && Math.abs(rt.features[0].underlay.angle - 90) < 1e-9, 'oturtulmus altlik JSON gidis-donusu: aci 90');
}

// ------------------------------------------------------------------ 4. pdf.js: PDF acma
console.log('4. pdf.js ile PDF acma (Node, sahte isci)');
configurePdf({ workerSrc: pathToFileURL(path.join(ROOT, 'node_modules/pdfjs-dist/build/pdf.worker.mjs')).href });
const mkPdf = (pages) => {
  const objs = []; const add = (s) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>'); add(`<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach(([w, h], i) => { const c = `0 0 ${w} ${h} re S 10 10 m ${w - 10} ${h - 10} l S BT /F1 12 Tf 20 20 Td (Sayfa ${i + 1}) Tj ET`; add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`); add(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`); });
  let out = '%PDF-1.4\n'; const off = []; objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return new TextEncoder().encode(out);
};
{
  const t0 = Date.now(); const pdf = await openPdf(mkPdf([[595, 842], [842, 595], [300, 200]]));
  ok(pdf.numPages === 3, 'vektor PDF: 3 sayfa');
  const s2 = await pdf.size(2); near(s2.wPt, 842, 'sayfa 2 genislik pt'); near(s2.hPt, 595, 'sayfa 2 yukseklik pt');
  await throwsCode(() => pdf.size(4), 'underlay.pdf_no_page', 'olmayan sayfa (4)'); await throwsCode(() => pdf.size(0), 'underlay.pdf_no_page', 'sayfa 0');
  pdf.destroy(); ok(Date.now() - t0 < 20000, 'acma hizli (takilma yok): ' + (Date.now() - t0) + ' ms');
  await throwsCode(() => openPdf(new TextEncoder().encode('%PDF-1.4\n garbage garbage garbage')), 'underlay.pdf_bad', 'bozuk PDF govdesi');
  const good = mkPdf([[200, 200]]); await throwsCode(() => openPdf(good.slice(0, 120)), 'underlay.pdf_bad', 'yarida kesilmis PDF');
  await throwsCode(() => openPdf(new TextEncoder().encode('MZ bu bir pdf degil')), 'underlay.bad_file', 'PDF olmayan dosya');
  await throwsCode(() => openPdf(new Uint8Array(3)), 'underlay.bad_file', 'cok kisa dosya');
  await throwsCode(() => openPdf(new Uint8Array(U.UNDERLAY_LIMITS.pdfBytes + 1).fill(37)), 'underlay.too_big', 'cok buyuk PDF');
  // zaman asimi: yukleme siniri 1 ms -> anlasilir hata, takilma yok
  const keep = PDF_LIMITS.loadMs; PDF_LIMITS.loadMs = 1; let to = null; try { const p = await openPdf(mkPdf([[100, 100]])); p.destroy(); } catch (e) { to = e.code; } PDF_LIMITS.loadMs = keep;
  ok(to === 'underlay.pdf_timeout' || to === null, 'zaman asimi: pdf_timeout (ya da cok hizli bitti): ' + to);
}

// ------------------------------------------------------------------ 5. PDF isci / CSP statik denetimleri
console.log('5. PDF isci ve CSP');
{
  ok(fs.existsSync(path.join(ROOT, 'src/shared/pdfworker.js')), 'src/shared/pdfworker.js var');
  ok(!isWorkerScript('/assets/pdfworker-D9ZZTwKt.js') && !isWorkerScript('/assets/pdf-YwugTw7Y.js'), 'pdf isci/ana parca adlari cekirdek isci kuralina uymaz (unsafe-eval almaz)');
  ok(!/'unsafe-eval'/.test(CSP) && /'unsafe-eval'/.test(WORKER_CSP), 'ana belge CSP unsafe-eval icermez; yalniz cekirdek isci yaniti alir');
  const src = fs.readFileSync(path.join(ROOT, 'src/shared/pdfrender.js'), 'utf8');
  ok(/isEvalSupported:\s*false/.test(src) && /disableFontFace:\s*true/.test(src), 'pdf.js: isEvalSupported:false, disableFontFace:true');
  ok(!/blob:|data:/.test(fs.readFileSync(path.join(ROOT, 'src/shared/pdfworker.js'), 'utf8').replace(/\/\/.*$/gm, '')), 'isci girisi blob:/data: kullanmaz');
  ok(fs.existsSync(path.join(ROOT, 'public/pdfjs/standard_fonts/LiberationSans-Regular.ttf')) && fs.existsSync(path.join(ROOT, 'public/pdfjs/wasm/openjpeg.wasm')), 'yazi tipi ve wasm verisi public/pdfjs altinda (self kaynak)');
  const mc = fs.readFileSync(path.join(ROOT, 'electron/main.cjs'), 'utf8');
  ok(/underlay: \['\.png', '\.jpg', '\.jpeg', '\.pdf'\]/.test(mc) && /OPEN_ONLY = new Set\(\[[^\]]*'underlay'/.test(mc) && /OPEN_ONLY\.has\(kind\)/.test(mc), 'ana süreç: altlık türü yalnız okunur (png/jpg/jpeg/pdf), yazma reddedilir');
  const pk = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')); ok(/^\d+\.\d+\.\d+$/.test(pk.dependencies['pdfjs-dist'] || ''), 'pdfjs-dist surumu sabit: ' + pk.dependencies['pdfjs-dist']);
}

console.log(`\n${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
