// WP-22d: NC (G-code) metnini simüle et. Metin src/cam/sim/gcode.js ile IR programına çevrilir (seçili kurulumun stoğu, tezgâhı ve
// belge takım listesiyle), sonuç mevcut kapı + sim çubuğu akışına verilir. Hata (bilinmeyen kelime, desteklenmeyen kod) satır numaralı.
import { toast } from '../dom.js';
import { t, errText } from '../../shared/i18n.js';
import { KErr } from '../../shared/errors.js';
import { gcodeToProgram, buildProgram } from '../../cam/index.js';
import { showIssueList } from './postui.js';
import { SimRun } from './simbar.js';

const MAX_TEXT = 64 * 1024 * 1024; // metin sınırı (ana süreç dosya sınırının altında; tarayıcıda da aynı)

// Seçili kurulum (yoksa ilki) başa gelir: aynı iş koordinatı + A açısı olan kurulumlar arasında onun stoğu seçilir
async function resolvedSetups(ops) {
  const cam = ops.cam; const all = cam.setups(); if (!all.length) throw new KErr('cam.ncsim.no_setups');
  const sel = cam.sel; const selId = sel?.kind === 'setup' ? sel.id : sel?.kind === 'op' ? cam.opLoc(sel.id)?.setup.id : null;
  const order = [...all.filter((s) => s.id === selId), ...all.filter((s) => s.id !== selId)];
  const out = []; let firstErr = null;
  for (const s of order) { try { out.push(await ops.resolveS(s)); } catch (e) { firstErr = firstErr || e; } }
  if (!out.length) throw firstErr;
  return out;
}

export function ncTools(ops) { const tools = {}; for (const tl of ops.cam.tools()) if (Number.isInteger(tl.number)) tools[tl.number] = tl; return tools; }

async function failList(ops, e) {
  await showIssueList(ops, { title: t('cam.ncsim.fail_title'), intro: t('cam.ncsim.fail_intro'), rows: [{ level: 'block', op: '', text: errText(e) }], kind: 'err' });
}

// text: NC metni; label: dosya adı ya da üretim adı (ileti için). Başarıda sim çubuğu açılır.
export async function simulateNcText(ops, text, label = '') {
  if (ops.busy) { toast(t('cam.run.busy'), { kind: 'info' }); return false; }
  if (!ops.cam.machine()) { toast(t('cam.br.machine_missing'), { kind: 'warn' }); return false; }
  ops.busy = true;
  try {
    if (typeof text !== 'string' || text.length > MAX_TEXT || text.includes('\u0000')) throw new KErr('cam.ncsim.not_text');
    const Ss = await resolvedSetups(ops); const machine = ops.cam.machine();
    const g = gcodeToProgram(text, { tools: ncTools(ops), setups: Ss, name: label || 'NC' });
    const secs = g.program.sections;
    for (const sec of secs) { // stoğu bilinmeyen (kurulumla eşleşmeyen) bölüm: sim stoksuz çalışamaz
      if (!sec.setup?.stockBox) { const w = sec.setup?.workOffset; throw new KErr('cam.ncsim.no_setup', { line: sec.toolpath.meta?.ncLines?.[0] ?? 1, wcs: w ? (w.kind === 'G54.1' ? 'G54.1 P' + w.p : w.kind) : 'G54', a: sec.setup?.aAngle ?? 0 }); }
    }
    const program = buildProgram({ name: (label || 'NC').slice(0, 24), number: ops.progNo, machine, sections: secs.map((s) => ({ setup: s.setup, toolpaths: [s.toolpath] })) });
    const items = secs.map((s) => ({ op: { name: t('cam.ncsim.op', { tool: s.toolpath.tool.number, line: s.toolpath.meta?.ncLines?.[0] ?? 1 }) }, setup: s.setup, S: s.setup, tp: s.toolpath }));
    const { gates, simOpts } = await ops.runGates(program, [...new Map(secs.map((s) => [s.setup.id, s.setup])).values()], machine);
    ops.stopSim(true);
    ops.sim = new SimRun(ops, { program, items, gates, simOpts, docSig: ops.docSig() }); ops.sim.start();
    ops.app.C.renderTimeline(); ops.app.C.renderBrowser();
    toast(t('cam.ncsim.ready', { sections: secs.length, lines: text.split(/\r?\n/).length }), { kind: gates.some((x) => x.level === 'block') ? 'warn' : 'ok' });
    return true;
  } catch (e) {
    if (e?.code === 'cam.sim.cancelled') toast(errText(e), { kind: 'info' });
    else { ops.stopSim(true); ops.cam.view?.hideMove?.(); await failList(ops, e); }
    return false;
  } finally { ops.busy = false; }
}

// Diskten NC dosyası (Electron: yalnız okunur 'ncread' türü; tarayıcı: dosya seçici)
export async function simulateNcFile(ops) {
  const f = await ops.app.pickFile('.nc,.tap,.txt', 'ncread'); if (!f) return false;
  let text; try { text = new TextDecoder('utf-8', { fatal: false }).decode(f.data); } catch (e) { await failList(ops, new KErr('cam.ncsim.not_text')); return false; }
  return simulateNcText(ops, text, String(f.name || '').replace(/\.[^.]*$/, '').slice(0, 40));
}
