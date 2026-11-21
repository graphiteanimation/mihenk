// WP-15: node worker_threads islem hesabi uyarlayicisi (yalniz testler). Protokol: src/cam/surf/opworker.js ile ayni.
import { parentPort } from 'node:worker_threads';
import { computeOp } from '../../src/cam/index.js';
parentPort.on('message', (m) => {
  const { id, op, ctx } = m || {};
  try { parentPort.postMessage({ id, ok: true, tp: computeOp(op, ctx) }); }
  catch (e) { parentPort.postMessage({ id, ok: false, code: e?.code || 'internal', params: e?.params || { message: String(e?.message ?? e) } }); }
});
