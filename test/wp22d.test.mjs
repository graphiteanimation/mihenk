// WP-22d testleri: NC dosyası simülasyonu (arayüz tarafının çekirdek akışı), Electron 'ncread' türü (yalnız okunur) kaynak denetimi.
// Arayüz akışının kendisi test/cam-ui.test.py'de (NC penceresi → Kodu simüle et). Çalıştır: node test/wp22d.test.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { simulate } from '../src/cam/sim/index.js';
import { gcodeToProgram } from '../src/cam/sim/gcode.js';
import { gates } from '../src/cam/gates.js';
import { buildProgram } from '../src/cam/program.js';
import { postProgram } from '../src/cam/post/index.js';
import { resolveProps } from '../src/cam/post/engine.js';
import { getPost } from '../src/cam/post/registry.js';
import * as S from './cam-samples/samples.mjs';
import { setLang, errText } from '../src/shared/i18n.js';
import '../src/i18n/tr.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pct = (a, b) => (100 * Math.abs(a - b)) / Math.max(1, Math.abs(a));
const M = S.testMachine(); const props = resolveProps(getPost(M.control), M);

console.log('1. üretilmiş program → NC → geri simülasyon (arayüzün kullandığı akış)');
for (const smp of S.ALL()) {
  const nc = postProgram(smp.program, M, { date: 'x', gates: [] });
  // arayüz akışı: takım listesi (numara → takım) + çözülmüş kurulumlar; sonuç buildProgram ile yeniden kurulur
  const tools = {}; for (const sc of smp.program.sections) tools[sc.toolpath.tool.number] = sc.toolpath.tool;
  const setups = []; for (const sc of smp.program.sections) if (!setups.find((q) => q.id === sc.setup.id)) setups.push(sc.setup);
  const g = gcodeToProgram(nc.text, { tools, setups, tapMode: props.tapMode, name: smp.name });
  const prog = buildProgram({ name: 'NC', number: 1, machine: M, sections: g.program.sections.map((s) => ({ setup: s.setup, toolpaths: [s.toolpath] })) });
  const o = { res: 0.25, stockBox: smp.stockBox };
  const r1 = simulate(smp.program, o), r2 = simulate(prog, o);
  ok(r1.removedVolume > 0 && pct(r1.removedVolume, r2.removedVolume) < 1, `${smp.name}: NC geri sim hacmi IR ile < %1 (${r1.removedVolume.toFixed(2)} / ${r2.removedVolume.toFixed(2)})`);
  const gl = gates(prog, M, { simResult: r2 });
  ok(Array.isArray(gl) && gl.every((x) => x.code && x.level), `${smp.name}: NC programı kapılardan geçer (${gl.length} kayıt)`);
  ok(g.program.sections.every((s) => s.toolpath.meta?.ncLines?.length), `${smp.name}: her bölüm NC satır numarası taşır (sim çubuğu etiketi)`);
}

console.log('2. bozuk NC: Türkçe, satır numaralı hata');
setLang('tr');
{
  const T = { 1: { number: 1, H: 1, type: 'flat', dia: 6, fluteLen: 20, bodyLen: 40 } };
  const run = (txt) => { try { gcodeToProgram(txt, { tools: T }); return null; } catch (e) { return e; } };
  const head = 'T1 M6\nS5000 M3\nG0 G90 G54 X0 Y0\nZ5\n';
  let e = run(head + 'G1 Z-1 F100\nX10 Y5 $\nM30');
  ok(e?.code === 'cam.gcode.bad_word' && e.params.line === 6, 'bilinmeyen kelime: satır 6 (' + e?.code + ' ' + e?.params?.line + ')');
  ok(/NC satırı 6/.test(errText(e)), 'ileti Türkçe ve satır numaralı: ' + errText(e));
  e = run(head + 'G1 Z-1 F100\nG92 X0\nM30');
  ok(e?.code === 'cam.gcode.unsupported' && e.params.line === 6 && /desteklenmiyor/.test(errText(e)), 'desteklenmeyen G92: satır 6 — ' + errText(e));
  e = run(head + 'G1 Z-1 F100\n#100=5\nM30');
  ok(e?.code === 'cam.gcode.unsupported' && e.params.line === 6, 'makro/değişken (#): satır 6');
  e = run('T9 M6\nS5000 M3\nG0 X0 Y0\nZ5\nM30');
  ok(e?.code === 'cam.gcode.tool_unknown' && e.params.line === 3 && /T9/.test(errText(e)), 'listede olmayan takım: ' + errText(e));
  e = run('G0 X0 Y0\nM30');
  ok(e?.code === 'cam.gcode.no_tool' && e.params.line === 1, 'takımsız hareket: satır 1');
  e = run('(yorum)\nM30');
  ok(e?.code === 'cam.gcode.empty' || e == null, 'hareketsiz dosya: boş hata ya da boş program (' + e?.code + ')');
}

console.log("3. Electron 'ncread' türü: yalnız okunur (kaynak denetimi)");
{
  const src = fs.readFileSync(path.join(ROOT, 'electron/main.cjs'), 'utf8');
  const kinds = /const KINDS = (\{[^\n]*?\});/.exec(src)?.[1] || '';
  ok(/ncread:\s*\['\.nc',\s*'\.tap',\s*'\.txt'\]/.test(kinds), "KINDS.ncread = .nc .tap .txt");
  const oo = /const OPEN_ONLY = new Set\(\[([^\]]*)\]\)/.exec(src)?.[1] || '';
  ok(/'ncread'/.test(oo), 'ncread OPEN_ONLY içinde (native:save reddeder)');
  const so = /const SAVE_ONLY = new Set\(\[([^\]]*)\]\)/.exec(src)?.[1] || '';
  ok(!/'ncread'/.test(so), 'ncread SAVE_ONLY içinde değil (native:open açar)');
  ok(/OPEN_ONLY\.has\(kind\)/.test(src), 'native:save OPEN_ONLY türlerini reddeder');
  ok(/readLimited\(p\)/.test(src) && /MAX_FILE/.test(src), 'okuma readLimited / MAX_FILE sınırıyla');
}

console.log(`\n${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
