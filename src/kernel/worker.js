import opencascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { initKernel } from './kernel.js';
import { KErr, toErr } from '../shared/errors.js';

let K = null;
const ready = initKernel(opencascade, () => wasmUrl).then((k) => { K = k; });
// WP-02 dilim 5: süren yeniden hesabın iptali ({cmd:'cancel', args:{id}}; yanıt yok, iptal edilen çağrı rebuild.cancelled ile döner)
const stop = new Set();
self.onmessage = async (ev) => {
  const { id, cmd, args } = ev.data;
  if (cmd === 'cancel') { stop.add(args?.id); return; }
  try {
    await ready;
    let result;
    if (cmd === 'rebuild') {
      const opts = {}; if (args.progress) opts.onFeature = (p) => self.postMessage({ id, progress: p }); if (args.cancellable) opts.shouldStop = () => stop.has(id);
      result = await K.rebuild(args.doc, opts);
    }
    else if (cmd === 'repairInfo') result = K.repairInfo(args.id);
    else if (cmd === 'featureFaces') result = K.featureFaces(args.id);
    else if (cmd === 'describe') result = K.describe(args.ref, args.kind);
    else if (cmd === 'facePlane') result = K.facePlane(args.ref);
    else if (cmd === 'measure') result = K.measure(args.a, args.b);
    else if (cmd === 'bodyProps') result = K.bodyProps(args.id);
    else if (cmd === 'interference') result = K.interference(args.ids);
    else if (cmd === 'camFaceLoops') result = K.camFaceLoops(args);
    else if (cmd === 'camSection') result = K.camSection(args);
    else if (cmd === 'camHeightmap') result = K.camHeightmap(args);
    else if (cmd === 'camZLevels') result = K.camZLevels(args);
    else if (cmd === 'camHoleExit') result = K.camHoleExit(args);
    else if (cmd === 'export') result = await K.exportFile(args.format, args.ids, args.names);
    else if (cmd === 'reset') { K.reset(); result = true; }
    else if (cmd === 'ping') result = true;
    else throw new KErr('worker.unknown_cmd', { cmd });
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: toErr(e) });
  } finally { stop.delete(id); }
};
