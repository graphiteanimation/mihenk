// Post + geri okuyucu testi. Calistir: node test/post.test.mjs [--update]  (--update: altin NC dosyalarini yeniden yazar)
// Uretilen NC dosyalari YALNIZ test ciktisidir; makinede kosturulabilir diye sunulmaz.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateToolpath, validateProgram, mk, compareToolpaths, normalizeRapids, splitRapid, pathBBox } from '../src/cam/ir.js';
import { postProgram, readNC, getPost, listPosts } from '../src/cam/post/index.js';
import { sanitizeComment, createFormat } from '../src/cam/post/engine.js';
import * as S from './cam-samples/samples.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const GOLD = path.join(DIR, 'cam-samples', 'golden');
const UPDATE = process.argv.includes('--update');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const throwsCode = (fn, code, msg) => { try { fn(); ok(false, (msg || code) + ' (hata beklenirdi)'); } catch (e) { ok(e.code === code, `${msg || code}: ${e.code} ${JSON.stringify(e.params)}`); } };
const OPTS = { date: '2026-01-01', appVersion: '0.2.0' };
fs.mkdirSync(GOLD, { recursive: true });

console.log('1. bicim / yardimcilar');
const F = createFormat({ prefix: 'X', decimals: 3 });
ok(F.format(10) === 'X10.' && F.format(-0.0004) === 'X0.' && F.format(1.2346) === 'X1.235' && F.format(-2.5) === 'X-2.5', 'createFormat: ' + [F.format(10), F.format(-0.0004), F.format(1.2346), F.format(-2.5)]);
ok(sanitizeComment('Çelik (Ğ) ışık; %') === 'Celik [G] isik? ?', 'ASCII yorum: ' + sanitizeComment('Çelik (Ğ) ışık; %'));
ok(listPosts().includes('mitsubishi-m80v') && listPosts().includes('fanuc-generic'), 'kayit defteri');
throwsCode(() => getPost('yok'), 'cam.post.unknown_control', 'bilinmeyen kontrol');

console.log('2. IR dogrulama');
{
  const sm = S.pocketHelixSample().program.sections[0].toolpath;
  ok(validateToolpath(sm) === true, 'gecerli yol');
  const bad = (mut, code, msg) => { const c = JSON.parse(JSON.stringify(sm)); mut(c); throwsCode(() => validateToolpath(c), code, msg); };
  bad((c) => { c.moves[1].x = NaN; }, 'cam.ir.field', 'NaN');
  bad((c) => { c.moves[0].z = 5; }, 'cam.ir.first_not_clearance', 'ilk hareket clearance degil');
  bad((c) => { c.moves[3].t = 'spiral'; }, 'cam.ir.move_type', 'bilinmeyen tur');
  bad((c) => { c.moves.pop(); }, 'cam.ir.last_not_clearance', 'son clearance degil');
  bad((c) => { c.moves[2].x = 5; }, 'cam.ir.arc_radius_mismatch', 'yay yaricap uyumsuz');
  bad((c) => { c.rpm = 0; }, 'cam.ir.field', 'rpm');
  bad((c) => { delete c.tool; }, 'cam.ir.tool_missing', 'takim yok');
  bad((c) => { c.moves.splice(2, 0, mk.comp(true)); }, 'cam.ir.comp_not_wear', 'comp yalniz wear');
  const wear = S.contourWearSample().program.sections[0].toolpath;
  const bw = (mut, code, msg) => { const c = JSON.parse(JSON.stringify(wear)); mut(c); throwsCode(() => validateToolpath(c), code, msg); };
  bw((c) => { c.moves = c.moves.filter((m) => m.t !== 'comp'); }, 'cam.ir.wear_no_comp', 'wear ama comp yok');
  bw((c) => { c.tool.D = null; }, 'cam.ir.field', 'wear D yok');
  bw((c) => { c.moves[4].kind = 'cut'; }, 'cam.ir.comp_not_on_lead', 'comp lead uzerinde olmali');
  bw((c) => { const k = c.moves.findLastIndex((m) => m.t === 'comp'); c.moves.splice(k, 1); }, 'cam.ir.rapid_in_comp', 'comp acik kaldi (hizli hareket)');
  const dr = S.drillSample().program.sections[2].toolpath;
  const bd = (mut, code, msg) => { const c = JSON.parse(JSON.stringify(dr)); mut(c); throwsCode(() => validateToolpath(c), code, msg); };
  bd((c) => { c.moves[1].pitch = null; }, 'cam.ir.tap_pitch', 'kilavuz pitch');
  bd((c) => { c.moves[1].f = 123; }, 'cam.ir.tap_feed_mismatch', 'rpm*pitch=ilerleme');
  bd((c) => { c.moves[1].retract = 50; }, 'cam.ir.cycle_heights', 'retract > clearance');
  throwsCode(() => validateProgram({ name: 'x', units: 'mm', sections: [] }), 'cam.ir.no_sections', 'bos program');
  ok(pathBBox(sm.moves).min[2] === -5 && pathBBox(sm.moves).max[2] === 10, 'pathBBox z');
}

console.log('3. ornekler: IR -> post -> altin dosya -> reader -> IR\'');
const machine = S.testMachine();
for (const smp of S.ALL()) {
  const prog = smp.program;
  let res;
  try { res = postProgram(prog, machine, OPTS); } catch (e) { ok(false, `${smp.name}: post hatasi ${e.code} ${JSON.stringify(e.params)} ${e.code ? '' : e.stack}`); continue; }
  const gp = path.join(GOLD, smp.name + '.nc');
  if (UPDATE) fs.writeFileSync(gp, res.text);
  ok(fs.existsSync(gp) && fs.readFileSync(gp, 'utf8') === res.text, `${smp.name}: altin dosya ile ayni` + (fs.existsSync(gp) ? '' : ' (yok; --update)'));
  ok(res.lines[0].startsWith('O') || res.lines[0].includes('UNVERIFIED POST - DOGRULANMADI - MIHENK'), `${smp.name}: UNVERIFIED baslik`);
  ok(res.lines.filter((l) => l.startsWith('(')).some((l) => l.startsWith('(UNVERIFIED POST - DOGRULANMADI - MIHENK ')), `${smp.name}: UNVERIFIED yorum satiri`);
  ok(/^[\x20-\x7e\n]*$/.test(res.text), `${smp.name}: yalniz ASCII`);
  ok(res.lines.length === res.lineMap.length, `${smp.name}: satir->hareket eslemesi uzunlugu`);
  let back;
  try { back = readNC(res.text, { machine }); } catch (e) { ok(false, `${smp.name}: reader hatasi ${e.code} ${JSON.stringify(e.params)}`); continue; }
  ok(back.program.sections.length === prog.sections.length, `${smp.name}: bolum sayisi ${back.program.sections.length}/${prog.sections.length}`);
  prog.sections.forEach((sec, i) => {
    const b = back.program.sections[i]; if (!b) return;
    const a = normalizeRapids(sec.toolpath);
    const cmp = compareToolpaths(a, b.toolpath, 0.001);
    ok(cmp.equal, `${smp.name}[${i}]: IR eslesmesi: ${cmp.diffs.slice(0, 4).join(' | ')}`);
    ok(b.setup.workOffset.kind === sec.setup.workOffset.kind && (b.setup.workOffset.p ?? null) === (sec.setup.workOffset.p ?? null), `${smp.name}[${i}]: WCS`);
    const exp = ((machine.axes.A.dir[0] < 0 ? -1 : 1) * (sec.setup.aAngle ?? 0));
    const dA = ((b.setup.aOut - (((exp % 360) + 360) % 360)) % 360 + 360) % 360;
    ok(dA < 1e-6 || dA > 360 - 1e-6, `${smp.name}[${i}]: A acisi ${b.setup.aOut} ~ ${exp}`);
  });
  // satir eslemesi: reader'in esledigi her satir motorun esledigiyle ayni (bolum, hareket)
  let mism = 0, checked = 0;
  const origOf = prog.sections.map((sec) => { const o = []; let pos = null; sec.toolpath.moves.forEach((m, k) => { const n = m.t === 'rapid' ? splitRapid(pos, m).length : 1; for (let q = 0; q < n; q++) o.push(k); if (m.t === 'rapid' || m.t === 'feed' || m.t === 'arc') pos = m; else if (m.t === 'cycle') pos = { x: m.points.at(-1)[0], y: m.points.at(-1)[1], z: m.clearance }; }); return o; });
  back.lineMap.forEach((lm, i) => { if (!lm) return; const em = res.lineMap[i]; checked++; lm = { section: lm.section, move: origOf[lm.section][lm.move] }; if (em.section !== lm.section || em.move !== lm.move) { mism++; if (mism < 4) console.log(`     satir ${i + 1}: motor ${JSON.stringify(em)} reader ${JSON.stringify(lm)} | ${res.lines[i]}`); } });
  ok(mism === 0 && checked > 0, `${smp.name}: satir eslemesi (${checked} satir, ${mism} uyumsuz)`);
  // modal sikistirma: ayni satirda tekrar eden eksen degeri olmamali (ardisik G1 satirlarinda ayni X tekrar yok)
  const feeds = res.lines.filter((l) => /^G1 /.test(l));
  ok(feeds.every((l) => !/ F[\d.]+ F/.test(l)), `${smp.name}: F tekrari yok`);
}
fs.writeFileSync(path.join(GOLD, '.gitkeep'), '');

console.log('4. icerik denetimleri (altin dosyalar)');
{
  const t = (n) => fs.readFileSync(path.join(GOLD, n + '.nc'), 'utf8');
  const s = t('surface');
  ok(/G54|G55/.test(s) && /G43 H21 Z10\./.test(s), 'G43 H (face takimi 21): ' + s.split('\n').find((l) => l.includes('G43')));
  ok(s.split('\n').filter((l) => /^[XY]/.test(l)).every((l) => !/Z/.test(l)), 'surface: Z modal sikistirma (XY satirlarinda Z tekrari yok)');
  const w = t('contour_wear');
  ok(/G54\.1 P3/.test(w), 'G54.1 P3');
  ok(/G41 D4 /.test(w) && /G40 /.test(w) && (w.match(/G41/g) || []).length === 2 && (w.match(/G40 X/g) || []).length === 2, 'wear: G41 D / G40 iki pas');
  ok(/G2 X-15\. Y20\. I5\. J0\./.test(w), 'yay I/J: ' + w.split('\n').find((l) => l.startsWith('G2')));
  const p = t('pocket_helix');
  ok(/G3 X-2\. Z-0\.625 I-2\. J0\. F250\./.test(p), 'helis G3 + Z');
  const d = t('drill_cycles');
  ok(/G99 G82 X-30\. Y-15\. Z-2\. R5\. P500 F150\./.test(d), 'G82 P500 ms: ' + d.split('\n').find((l) => l.includes('G82')));
  ok(/G99 G83 X-30\. Y0\. Z-20\. R5\. Q4\. F200\.\nG98 X-10\./.test(d), 'G99 .. G98 son nokta + G83 Q');
  ok(/G73/.test(d) && /G81/.test(d) && /G85/.test(d) && /G89/.test(d) && /G04 P1500/.test(d), 'G73 G81 G85 G89 G04');
  ok(/G84 X30\. Y15\. Z-15\. R5\. F1\.25 ,R1/.test(d) && !/M29/.test(d), 'M80V G84: F=adim, ,R1, M29 yok: ' + d.split('\n').find((l) => l.includes('G84')));
  ok((d.match(/\nG80\n/g) || []).length >= 6, 'G80 her cevrim sonrasi');
  const ix = t('indexed_3plus1');
  const lines = ix.split('\n');
  const iA = lines.findIndex((l) => l === 'G0 A270.');
  ok(iA > 3 && lines[iA - 1] === 'M11' && lines[iA + 1] === 'M10', 'A: M11 / A / M10 sirasi');
  ok(lines.slice(iA - 6, iA).join('|').includes('G91 G28 Z0.|G90|M5|M11'), 'A oncesi Z guvenli geri cekilme: ' + lines.slice(iA - 6, iA + 2).join(' | '));
  ok(lines.filter((l) => /^G0 A/.test(l)).join(',') === 'G0 A270.,G0 A0.,G0 A90.,G0 A0.', '180 derece iki adim + son A0: ' + lines.filter((l) => /^G0 A/.test(l)).join(','));
}

console.log('5. kapilar / hatalar');
{
  const smp = S.surfaceSample(); const prog = smp.program;
  // M80V varsayilanlari: bilinmeyen ozellik -> dur
  const m0 = S.testMachine({ props: { safeRetract: null } });
  throwsCode(() => postProgram(prog, m0, OPTS), 'cam.post.prop_missing', 'safeRetract null');
  throwsCode(() => postProgram(prog, { ...S.testMachine(), post: { props: { yokOzellik: 1 } } }, OPTS), 'cam.post.unknown_prop', 'bilinmeyen ozellik');
  const dr = S.drillSample().program;
  throwsCode(() => postProgram(dr, S.testMachine({ props: { dwellAddress: null } }), OPTS), 'cam.post.prop_missing', 'G04 adresi null');
  throwsCode(() => postProgram(dr, S.testMachine({ props: { cycleDwellUnit: null } }), OPTS), 'cam.post.prop_missing', 'cevrim bekleme birimi null');
  const wc = S.contourWearSample().program;
  throwsCode(() => postProgram(wc, S.testMachine({ props: { g541Range: null } }), OPTS), 'cam.post.prop_missing', 'G54.1 araligi null');
  throwsCode(() => postProgram(wc, S.testMachine({ props: { g541Range: [1, 2] } }), OPTS), 'cam.post.wcs_range', 'G54.1 P araligi disi');
  // sogutma kodu bilinmiyor
  const air = JSON.parse(JSON.stringify(prog)); air.sections[0].toolpath.coolant = 'mist';
  throwsCode(() => postProgram(air, machine, OPTS), 'cam.post.prop_missing', 'mist kodu null');
  // A sinirlari
  const ix = S.indexedSample().program;
  const lim = S.testMachine(); lim.axes.A = { ...lim.axes.A, limits: [-45, 45], shortest: false };
  throwsCode(() => postProgram(ix, lim, OPTS), 'cam.post.a_out_of_limits', 'A limit disi');
  const noA = S.testMachine(); delete noA.axes.A;
  throwsCode(() => postProgram(ix, noA, OPTS), 'cam.post.no_a_axis', 'A ekseni yok');
  const noDir = S.testMachine(); noDir.axes.A = { ...noDir.axes.A, dir: undefined };
  throwsCode(() => postProgram(ix, noDir, OPTS), 'cam.post.prop_missing', 'A yonu bilinmiyor');
  const noClamp = S.testMachine(); noClamp.axes.A.clamp = { lock: null, unlock: null, output: true };
  throwsCode(() => postProgram(ix, noClamp, OPTS), 'cam.post.prop_missing', 'A kilit kodlari null');
  // gecersiz IR post'a girmez
  const badp = JSON.parse(JSON.stringify(prog)); badp.sections[0].toolpath.moves[1].x = Infinity;
  throwsCode(() => postProgram(badp, machine, OPTS), 'cam.ir.field', 'gecersiz IR post edilmez');
}

console.log('6. secenekler: A kilidi cikti yok, 6b kolu, satir numarasi, dogrulandi basligi, G53, kapi ozeti, fanuc, longhand');
{
  const ix = S.indexedSample().program;
  const m = S.testMachine(); m.axes.A.clamp.output = false;
  const t = postProgram(ix, m, OPTS).text;
  ok(!/M10|M11/.test(t) && /G0 A90\./.test(t), 'clamp.output=false: M10/M11 yok');
  const b = postProgram(ix, S.testMachine({ props: { rotaryMode: '6b' } }), OPTS).text;
  ok(!/ A\d/.test(b) && /INDEX A TO 90\.000 DEG/.test(b) && /M00/.test(b), '6b: A yazilmaz, M00');
  const n = postProgram(S.surfaceSample().program, machine, { ...OPTS, props: { lineNumbers: true } });
  ok(/^N10 /m.test(n.text) && /^N20 /m.test(n.text), 'satir numarasi');
  const bn = readNC(n.text, { machine });
  ok(compareToolpaths(normalizeRapids(S.surfaceSample().program.sections[0].toolpath), bn.program.sections[0].toolpath).equal, 'N numarali metin geri okunur');
  const v = postProgram(S.surfaceSample().program, machine, { ...OPTS, verified: { by: 'Osman', date: '2026-02-02' }, gates: [{ level: 'warn', code: 'cam.gate.x', opId: 'face1' }] });
  ok(v.lines[1] === '(UNVERIFIED POST - DOGRULANMADI - MIHENK 0.2.0)' || v.lines[0].includes('UNVERIFIED'), 'UNVERIFIED satiri korunur');
  ok(v.lines.some((l) => l === '(VERIFIED BY Osman ON 2026-02-02)') && v.lines.some((l) => l.startsWith('(GATES 0 BLOCK 1 WARN)')), 'VERIFIED + kapi ozeti');
  const g53 = postProgram(S.surfaceSample().program, S.testMachine({ props: { safeRetract: 'G53', safeRetractZ: -5 } }), OPTS);
  ok(/G53 G0 Z-5\./.test(g53.text), 'G53 geri cekilme');
  throwsCode(() => postProgram(S.surfaceSample().program, S.testMachine({ props: { safeRetract: 'G53' } }), OPTS), 'cam.post.prop_missing', 'G53 Z null');
  const rb = readNC(g53.text, { machine: S.testMachine({ props: { safeRetract: 'G53', safeRetractZ: -5 } }) });
  ok(rb.program.sections.length === 1, 'G53 geri okuma');
  // Fanuc: kilavuz F=devir*adim + M29, mm bekleme ms, G28
  const fm = S.fanucMachine();
  const fd = postProgram(S.drillSample().program, fm, OPTS);
  ok(/M29 S400/.test(fd.text) && /G84 X30\. Y15\. Z-15\. R5\. F500\./.test(fd.text) && !/,R1/.test(fd.text), 'fanuc kilavuz');
  const fb = readNC(fd.text, { machine: fm });
  S.drillSample().program.sections.forEach((sec, i) => { const c = compareToolpaths(normalizeRapids(sec.toolpath), fb.program.sections[i].toolpath); ok(c.equal, `fanuc delik[${i}] ${c.diffs.slice(0, 3)}`); });
  // dolasik cevrim (cannedCycles false): drill/ream/bore acik hareket, peck hata
  const lh = S.drillSample().program; lh.sections = [lh.sections[0]];
  const lt = postProgram(lh, S.testMachine({ props: { cannedCycles: false } }), OPTS);
  ok(!/G8[1-9]/.test(lt.text) && /G1 Z-2\./.test(lt.text), 'acik hareket cevrimi');
  throwsCode(() => postProgram(S.drillSample().program, S.testMachine({ props: { cannedCycles: false } }), OPTS), 'cam.post.cycle_unsupported', 'peck acik harekete acilmaz');
  // G04 X + saniye birimi; yuksek hizli mod secenegi (G05 P10000 / G05 P0)
  const dm = S.testMachine({ props: { dwellAddress: 'X', dwellUnit: 's', cycleDwellAddress: 'P', cycleDwellUnit: 's', highSpeedOn: 'G05 P10000', highSpeedOff: 'G05 P0' } });
  const dt = postProgram(S.drillSample().program, dm, OPTS);
  ok(/G04 X1\.5/.test(dt.text) && /G82 X-30\. Y-15\. Z-2\. R5\. P0\.5 F150\./.test(dt.text), 'G04 X saniye, G82 P saniye');
  throwsCode(() => postProgram(S.drillSample().program, S.testMachine({ props: { cycleDwellAddress: 'X' } }), OPTS), 'cam.post.bad_prop', 'cevrim bekleme adresi eksen harfi olamaz');
  ok(/\nG05 P10000\n/.test(dt.text) && /\nG05 P0\n/.test(dt.text), 'G05 P10000 / G05 P0 secenegi');
  const db = readNC(dt.text, { machine: dm });
  ok(db.events.filter((e) => e.ev === 'highSpeed').length === 2, 'G05 olaylari geri okundu');
  S.drillSample().program.sections.forEach((sec, i) => { const c = compareToolpaths(normalizeRapids(sec.toolpath), db.program.sections[i].toolpath); ok(c.equal, `G04 X/s delik[${i}] ${c.diffs.slice(0, 3)}`); });
  throwsCode(() => postProgram(S.surfaceSample().program, S.testMachine({ props: { highSpeedOn: 'G05 P10000' } }), OPTS), 'cam.post.prop_missing', 'G05 cifti eksik');
  // karisik hizli hareket boler
  const mixed = JSON.parse(JSON.stringify(S.surfaceSample().program));
  const mv = mixed.sections[0].toolpath.moves; mv.splice(1, 1, mk.rapid(-50, -10, 2));
  const mt = postProgram(mixed, machine, OPTS).text;
  ok(/G43 H21 Z10\.\nM8\nX-50\. Y-10\.\nZ2\./.test(mt), 'karisik hizli bolundu (inis: once XY sonra Z)');
}

console.log('7. geri okuyucu: tanimadigi kelime hata verir');
{
  const base = postProgram(S.surfaceSample().program, machine, OPTS).text;
  const inj = (line, code, msg) => { const L = base.split('\n'); L.splice(12, 0, line); throwsCode(() => readNC(L.join('\n'), { machine }), code || 'cam.post.read_unknown_word', msg || line); };
  inj('G61 X1.', null, 'G61');
  inj('M99', null, 'M99');
  inj('G1 X1. B5.', null, 'B kelimesi');
  inj('G1 X1. $', null, 'bilinmeyen karakter');
  inj('G91 G1 X1.', 'cam.post.read_incremental', 'G91 hareket');
  throwsCode(() => readNC(base.replace(/ F\d+\./g, ''), { machine }), 'cam.post.read_missing_word', 'F yok');
}

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
