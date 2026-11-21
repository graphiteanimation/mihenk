// WP-13: sim worker protokolu (ortamdan bagimsiz). Tarayici worker'i (simworker.js) ve node worker_threads uyarlayicisi ayni cekirdegi kullanir.
// Gelen: {type:'run', id, input, opts, chunk?} | {type:'cancel', id}. Giden: {type:'progress', id, index, total, removedVolume} |
// {type:'done', id, result} | {type:'error', id, code, params} | {type:'cancelled', id}. Sonuctaki haritalarin tamponlari aktarilir.
import { createSim } from './index.js';

export function transferList(result) {
  const out = new Set();
  for (const hm of Object.values(result?.remainBySetup || {})) if (hm?.data?.buffer) out.add(hm.data.buffer);
  for (const f of result?.frames || []) if (f.heightmap?.buffer) out.add(f.heightmap.buffer);
  return [...out];
}
// sonuc: remainHeightmap remainBySetup'taki bir haritanin kendisidir; aktarimda iki kez gitmesin diye kimlik olarak tasinir
export function packResult(r) { const id = Object.entries(r.remainBySetup || {}).find(([, v]) => v === r.remainHeightmap)?.[0] ?? null; return { ...r, remainHeightmap: null, remainId: id }; }
export function unpackResult(r) { const o = { ...r, remainHeightmap: r.remainId != null ? r.remainBySetup?.[r.remainId] ?? null : null }; delete o.remainId; return o; }

export function createSimHost(post, { yieldFn = () => new Promise((res) => setTimeout(res, 0)) } = {}) {
  const cancelled = new Set();
  return {
    async onMessage(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'cancel') { cancelled.add(msg.id); return; }
      if (msg.type !== 'run') return;
      const id = msg.id;
      try {
        const sim = createSim(msg.input, msg.opts || {}); const chunk = msg.chunk > 0 ? msg.chunk : 500;
        while (!sim.done) {
          sim.step(chunk);
          const st = sim.state(); post({ type: 'progress', id, index: st.index, total: st.total, removedVolume: st.removedVolume });
          await yieldFn();
          if (cancelled.has(id)) { cancelled.delete(id); post({ type: 'cancelled', id }); return; }
        }
        const r = packResult(sim.result()); post({ type: 'done', id, result: r }, transferList(r));
      } catch (e) { post({ type: 'error', id, code: e?.code || 'cam.sim.internal', params: e?.params || { message: String(e?.message ?? e) } }); }
    },
  };
}
