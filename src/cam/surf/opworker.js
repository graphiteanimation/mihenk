// WP-15: islem hesabi worker'i (tarayici/Electron, type: 'module'). Gelen {id, op, ctx}; giden {id, ok, tp} | {id, ok:false, code, params}.
// Iptal: ana is parcacigi worker'i sonlandirir (async.js).
import { computeOp } from '../index.js';
self.onmessage = (e) => {
  const { id, op, ctx } = e.data || {};
  try { const tp = computeOp(op, ctx); self.postMessage({ id, ok: true, tp }); }
  catch (err) { self.postMessage({ id, ok: false, code: err?.code || 'internal', params: err?.params || { message: String(err?.message ?? err) } }); }
};
