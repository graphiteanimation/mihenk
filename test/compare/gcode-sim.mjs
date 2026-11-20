// WP-13: G-code uzerinden simulasyon karsilastirmasi (P3/P4 betiklerinde P_GCODE_SIM=1 ile). Ayni setup: IR programinin sim'i ile
// posttan cikan NC metninin (gcodeToProgram) sim'i; kaldirilan hacim farki ve sorun kodlari. Birincil sonuclari degistirmez.
import { gcodeToProgram } from '../../src/cam/sim/gcode.js';
import { simulate } from '../../src/cam/sim/index.js';
import { resolveProps } from '../../src/cam/post/engine.js';
import { getPost } from '../../src/cam/post/registry.js';

const kodlar = (r) => { const o = {}; for (const i of r.issues) if (i.level === 'error') o[i.code] = (o[i.code] || 0) + 1; return o; };
// program: IR; ncText: o programin NC'si; machine: post makinesi; simOpts: IR sim'inde kullanilan secenekler; irResult?: hazir IR sonucu
export function gcodeSimCompare({ program, ncText, machine, simOpts, irResult = null }) {
  const t0 = Date.now();
  const ir = irResult || simulate(program, simOpts);
  const tools = {}; for (const s of program.sections) tools[s.toolpath.tool.number] = { ...s.toolpath.tool, ...(simOpts.tools?.[s.toolpath.tool.number] || {}) };
  const setups = []; for (const s of program.sections) if (!setups.find((q) => q.id === s.setup.id)) setups.push(s.setup);
  const props = resolveProps(getPost(machine.control), machine);
  const t1 = Date.now();
  const g = gcodeToProgram(ncText, { tools, setups, tapMode: props.tapMode });
  const nc = simulate(g.program, simOpts);
  const fark = ir.removedVolume > 0 ? Math.abs(nc.removedVolume - ir.removedVolume) / ir.removedVolume * 100 : (nc.removedVolume === 0 ? 0 : Infinity);
  return { ir_hacim: Math.round(ir.removedVolume * 1000) / 1000, nc_hacim: Math.round(nc.removedVolume * 1000) / 1000, fark_yuzde: Math.round(fark * 10000) / 10000,
    ir_engel: kodlar(ir), nc_engel: kodlar(nc), nc_bolum: g.program.sections.length, ir_bolum: program.sections.length, ayrisma_s: (Date.now() - t1) / 1000, s: (Date.now() - t0) / 1000 };
}
