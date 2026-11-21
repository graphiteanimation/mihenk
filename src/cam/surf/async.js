// WP-15: 3D islem hesabi arayuzu dondurmesin: computeOpAsync(op, ctx, ctl) -> Promise<Toolpath>.
// ctl: { signal?: AbortSignal (iptal -> KErr cam.op.cancelled), worker?: 'auto' | false | () => Worker-benzeri }.
//  'auto': tarayicida/Electron'da modul worker'i (opworker.js; iptal = worker sonlandirilir). Worker yoksa (node testleri) ayni is
//  parcaciginda; iptal ctx.shouldStop ile hesap dongulerinde denetlenir (dilimler arasinda).
import { KErr } from '../../shared/errors.js';

const cancelErr = () => new KErr('cam.op.cancelled', {});
let seq = 0;
export const opWorkerAvailable = () => typeof Worker !== 'undefined' && typeof window !== 'undefined';
export function browserOpWorker() { return new Worker(new URL('./opworker.js', import.meta.url), { type: 'module' }); }
// ctx'ten aktarilamayan alanlari (islevler) at
const plain = (ctx) => { const o = {}; for (const [k, v] of Object.entries(ctx || {})) if (typeof v !== 'function') o[k] = v; return o; };

export async function computeOpAsync(op, ctx, ctl = {}) {
  const { signal = null } = ctl; const wk = ctl.worker === undefined ? 'auto' : ctl.worker;
  if (signal?.aborted) throw cancelErr();
  const factory = typeof wk === 'function' ? wk : wk === 'auto' && opWorkerAvailable() ? browserOpWorker : null;
  if (!factory) {
    const { computeOp } = await import('../index.js');
    return computeOp(op, { ...ctx, shouldStop: () => { if (signal?.aborted) throw cancelErr(); ctx.shouldStop?.(); } });
  }
  return new Promise((resolve, reject) => {
    let w; try { w = factory(); } catch (e) { import('../index.js').then(({ computeOp }) => resolve(computeOp(op, ctx)), reject); return; }
    const id = ++seq; let done = false;
    const end = (fn, v) => { if (done) return; done = true; signal?.removeEventListener?.('abort', onAbort); try { w.terminate(); } catch (e) { /* kapali */ } fn(v); };
    const onAbort = () => end(reject, cancelErr());
    signal?.addEventListener?.('abort', onAbort);
    w.onmessage = (ev) => { const m = ev?.data ?? ev; if (!m || m.id !== id) return; if (m.ok) end(resolve, m.tp); else end(reject, new KErr(m.code || 'internal', m.params || {})); };
    w.onerror = (e) => end(reject, new KErr('cam.op.worker_failed', { message: String(e?.message ?? e) }));
    w.postMessage({ id, op, ctx: plain(ctx) });
  });
}
