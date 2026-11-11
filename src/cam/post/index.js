// Post paketi girisi: kayit defteri + motor + geri okuyucu.
import { runPost, perr } from './engine.js';
import { getPost } from './registry.js';
import { validateProgram } from '../ir.js';
import { gates as runGates } from '../gates.js';
export { readNC } from './reader.js';
export { registerPost, listPosts, getPost } from './registry.js';
export { runPost, createFormat, createVariable, createModal, sanitizeComment, resolveProps, resolveRotary } from './engine.js';
export { describeIssue } from './describe.js';

// Program + makine profili -> {text, lines, lineMap, warnings, props, gates}
// opts: {props, date, appVersion, gates, gateText?, verified:{by,date,note}}
// Savunma derinligi (V-07): kapi listesinde 'block' varsa NC URETILMEZ (cam.post.gates_blocked). Kapi listesi verilmezse
// post statik kapilari (1-4, 6; simulasyonsuz) kendisi calistirir; sonuc basliga yazilir ("simulasyon calismadi" uyarisi dahil).
export function postProgram(program, machine, opts = {}) {
  if (!machine) throw perr('cam.post.no_machine');
  validateProgram(program);
  let list = opts.gates;
  if (list == null) list = runGates(program, machine, { sim: false });
  else if (!Array.isArray(list)) throw perr('cam.post.bad_gates');
  const bl = list.filter((g) => g && g.level === 'block');
  if (bl.length) throw perr('cam.post.gates_blocked', { n: bl.length, code: bl[0].code, op: bl[0].params?.op ?? bl[0].opId ?? '' });
  const res = runPost(getPost(machine.control), program, machine, { ...opts, gates: list });
  return { ...res, gates: list };
}
