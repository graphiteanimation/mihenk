// WP-15: 3D islem hesabi arayuzu dondurmesin: computeOpAsync(op, ctx, ctl) -> Promise<Toolpath>.
// ctl: { signal?: AbortSignal (iptal -> KErr cam.op.cancelled), worker?: 'auto' | false | () => Worker-benzeri }.
//  'auto': tarayicida/Electron'da modul worker'i (opworker.js; iptal = worker sonlandirilir: suren hesap hemen durur).
//  Worker yoksa (node, worker: false) ayni is parcaciginda, BOLUNMEDEN (WP-22c: iddia gercege uyduruldu): hesap senkron oldugundan
//  suren hesap sirasinda olay dongusu donmez ve AbortSignal'in abort'u calisamaz. Bu kipte iptal (a) hesaptan once (bir olay
//  dongusu turu verilir: o ana kadar kuyruga giren abort islenir) ve (b) hesaptan sonra (bir tur daha; abort geldiyse sonuc atilir,
//  cam.op.cancelled) uygulanir. ctx.shouldStop (or. sure siniri, paylasimli bellek bayragi) hesap dongulerinde denetlenir ve suren
//  hesabi keser. Node'da suren hesabi AbortSignal ile kesmek icin worker verilmeli (worker_threads uyarlayicisi: test/wp15/opworker-node.mjs).
import { KErr } from '../../shared/errors.js';

const cancelErr = () => new KErr('cam.op.cancelled', {});
let seq = 0;
export const opWorkerAvailable = () => typeof Worker !== 'undefined' && typeof window !== 'undefined';
export function browserOpWorker() { return new Worker(new URL('./opworker.js', import.meta.url), { type: 'module' }); }
// ctx'ten aktarilamayan alanlari (islevler) at
const plain = (ctx) => { const o = {}; for (const [k, v] of Object.entries(ctx || {})) if (typeof v !== 'function') o[k] = v; return o; };

const turn = () => new Promise((res) => (typeof setImmediate === 'function' ? setImmediate(res) : setTimeout(res, 0)));
// ayni is parcaciginda hesap: once ve sonra iptal denetimi (yukaridaki aciklama)
async function inline(op, ctx, signal) {
  const { computeOp } = await import('../index.js');
  await turn(); if (signal?.aborted) throw cancelErr();
  const tp = computeOp(op, { ...ctx, shouldStop: () => { if (signal?.aborted) throw cancelErr(); ctx?.shouldStop?.(); } });
  await turn(); if (signal?.aborted) throw cancelErr();
  return tp;
}

export async function computeOpAsync(op, ctx, ctl = {}) {
  const { signal = null } = ctl; const wk = ctl.worker === undefined ? 'auto' : ctl.worker;
  if (signal?.aborted) throw cancelErr();
  const factory = typeof wk === 'function' ? wk : wk === 'auto' && opWorkerAvailable() ? browserOpWorker : null;
  if (!factory) return inline(op, ctx, signal);
  return new Promise((resolve, reject) => {
    let w; try { w = factory(); } catch (e) { inline(op, ctx, signal).then(resolve, reject); return; }
    const id = ++seq; let done = false;
    const end = (fn, v) => { if (done) return; done = true; signal?.removeEventListener?.('abort', onAbort); try { w.terminate(); } catch (e) { /* kapali */ } fn(v); };
    const onAbort = () => end(reject, cancelErr());
    signal?.addEventListener?.('abort', onAbort);
    w.onmessage = (ev) => { const m = ev?.data ?? ev; if (!m || m.id !== id) return; if (m.ok) end(resolve, m.tp); else end(reject, new KErr(m.code || 'internal', m.params || {})); };
    w.onerror = (e) => end(reject, new KErr('cam.op.worker_failed', { message: String(e?.message ?? e) }));
    w.postMessage({ id, op, ctx: plain(ctx) });
  });
}
