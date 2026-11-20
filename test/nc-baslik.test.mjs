// NC başlığında model özeti (WP-10 dilim 5). Çıktı: "N geçti, M kaldı".
import * as S from './cam-samples/samples.mjs';
import { postProgram } from '../src/cam/post/index.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const head = (t) => t.split('\n').slice(0, 30);
const sm = S.indexedSample(); const M = S.testMachine();
sm.program = structuredClone(sm.program); Object.assign(sm.program.sections[0].setup, { stockBox: { min: [-31, -21, -22], max: [31, 21, 2] }, modelBBox: { min: [-30, -20, -20], max: [30, 20, 0] } }); // gerçek programda resolveSetup yazar
const ms = { doc: 'C:\\Users\\Birisi\\Belgeler\\Şaft (rev-2) ÇİĞ.mhnk', bbox: { min: [0, 0, 0], max: [60, 30.04, 40] } };
const r = postProgram(sm.program, M, { gates: [], date: '2026-11-20', generatedAt: '2026-11-20T10:11:12.000Z', appVersion: '9.8.7', modelSummary: ms });
const H = head(r.text);
ok(H.some((l) => l === '(MODEL Saft [rev-2] CIG.mhnk)'), 'belge adı: yol atılır, Türkçe karakter ASCII, parantez köşeliye: ' + H.find((l) => /MODEL/.test(l)));
ok(H.some((l) => l === '(PART SIZE 60.0 x 30.0 x 40.0 MM)'), 'parça kutusu');
ok(H.filter((l) => /^\(SETUP \d/.test(l)).length === new Set(sm.program.sections.map((s) => s.setup.id ?? s.setup.name)).size, 'her setup için bir SETUP satırı: ' + H.filter((l) => /^\(SETUP/.test(l)).join(' / '));
ok(H.includes('(SETUP 1 a0 WCS G58 STOCK 62.0 x 42.0 x 24.0 PART 60.0 x 40.0 x 20.0 A 0.0)'), 'SETUP satırı: WCS, stok, parça, A: ' + H.find((l) => /^\(SETUP 1/.test(l)));
ok(sm.program.sections.some((s) => s.setup.aAngle != null) ? H.some((l) => / A -?[\d.]+\)$/.test(l)) : true, '3+1 setup satırında A açısı');
ok(H.some((l) => l === '(GENERATED 2026-11-20T10:11:12.000Z)'), 'üretim zamanı');
ok(H.some((l) => /^\(T\d+ H\d+/.test(l)) && H.some((l) => l.includes('MIHENK 9.8.7')), 'takım listesi ve Mihenk sürümü');
ok(head(r.text).every((l) => !/[^\x20-\x7e]/.test(l)), 'başlık yalnız ASCII');
const kapali = postProgram(sm.program, { ...M, post: { props: { ...M.post.props, modelSummary: false } } }, { gates: [], date: '2026-11-20', modelSummary: ms });
ok(!/MODEL |PART SIZE|SETUP \d|GENERATED/.test(head(kapali.text).join('\n')), 'profilde post.props.modelSummary=false başlığı kapatır');
const yok = postProgram(sm.program, M, { gates: [], date: '2026-11-20' });
ok(!/\(MODEL /.test(yok.text) && /\(SETUP 1 /.test(yok.text), 'belge adı verilmezse MODEL satırı yok, setup özeti var');
ok(postProgram(sm.program, M, { gates: [], date: '2026-11-20', modelSummary: ms }).text === postProgram(sm.program, M, { gates: [], date: '2026-11-20', modelSummary: ms }).text, 'çıktı belirleyici');
console.log(`nc-baslik: ${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
