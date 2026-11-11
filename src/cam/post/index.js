// Post paketi girisi: kayit defteri + motor + geri okuyucu.
import { runPost, perr } from './engine.js';
import { getPost } from './registry.js';
export { readNC } from './reader.js';
export { registerPost, listPosts, getPost } from './registry.js';
export { runPost, createFormat, createVariable, createModal, sanitizeComment, resolveProps, resolveRotary } from './engine.js';

// Program + makine profili -> {text, lines, lineMap, warnings, props}
// opts: {props, date, appVersion, gates, verified:{by,date,note}}
export function postProgram(program, machine, opts = {}) {
  if (!machine) throw perr('cam.post.no_machine');
  return runPost(getPost(machine.control), program, machine, opts);
}
