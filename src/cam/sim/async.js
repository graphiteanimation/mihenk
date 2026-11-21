// WP-13: asenkron simulasyon (arayuz donmasin). simulateAsync(input, opts, ctl) -> Promise<result> (simulate() ile ayni sonuc).
// ctl: { signal?: AbortSignal (iptal -> KErr cam.sim.cancelled), onProgress?({index,total,removedVolume}), chunk? (adim/dilim),
//        worker?: 'auto' | false | () => Worker-benzeri }.
//  'auto': tarayicida (Worker varsa) modul worker'i (simworker.js); yoksa (node testleri) ayni is parcaciginda dilimli calisir ve her
//  dilim arasinda olay dongusune doner (iptal ve ilerleme calisir). Worker-benzeri: {postMessage, onmessage, onerror?, terminate}.
import { KErr } from '../../shared/errors.js';
import { createSim } from './index.js';
import { unpackResult } from './worker-core.js';

const cancelErr = () => new KErr('cam.sim.cancelled', {});
let seq = 0;
export function browserWorker() { return new Worker(new URL('./simworker.js', import.meta.url), { type: 'module' }); }
export const workerAvailable = () => typeof Worker !== 'undefined' && typeof window !== 'undefined';

export function simulateAsync(input, opts = {}, ctl = {}) {
  const { signal = null, onProgress = null, chunk = 500 } = ctl;
  const wk = ctl.worker === undefined ? 'auto' : ctl.worker;
  if (signal?.aborted) return Promise.reject(cancelErr());
  const factory = typeof wk === 'function' ? wk : wk === 'auto' && workerAvailable() ? browserWorker : null;
  if (!factory) return runInline(input, opts, { signal, onProgress, chunk });
  return new Promise((resolve, reject) => {
    let w; try { w = factory(); } catch (e) { runInline(input, opts, { signal, onProgress, chunk }).then(resolve, reject); return; } // worker kurulamazsa ayni is parcaciginda
    const id = ++seq; let finished = false;
    const end = (fn, v) => { if (finished) return; finished = true; signal?.removeEventListener?.('abort', onAbort); try { w.terminate(); } catch (e) { /* zaten kapali */ } fn(v); };
    const onAbort = () => { try { w.postMessage({ type: 'cancel', id }); } catch (e) { /* kapali */ } end(reject, cancelErr()); };
    signal?.addEventListener?.('abort', onAbort);
    w.onmessage = (ev) => {
      const m = ev?.data ?? ev; if (!m || m.id !== id) return;
      if (m.type === 'progress') onProgress?.({ index: m.index, total: m.total, removedVolume: m.removedVolume });
      else if (m.type === 'done') end(resolve, unpackResult(m.result));
      else if (m.type === 'error') end(reject, new KErr(m.code, m.params || {}));
      else if (m.type === 'cancelled') end(reject, cancelErr());
    };
    w.onerror = (e) => end(reject, new KErr('cam.sim.worker_failed', { message: String(e?.message ?? e) }));
    w.postMessage({ type: 'run', id, input, opts, chunk });
  });
}

async function runInline(input, opts, { signal, onProgress, chunk }) {
  const sim = createSim(input, opts);
  while (!sim.done) {
    sim.step(chunk);
    const st = sim.state(); onProgress?.({ index: st.index, total: st.total, removedVolume: st.removedVolume });
    await new Promise((res) => setTimeout(res, 0));
    if (signal?.aborted) throw cancelErr();
  }
  return sim.result();
}
