import opencascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { initKernel } from './kernel.js';

let K = null;
const ready = initKernel(opencascade, () => wasmUrl).then((k) => { K = k; });
self.onmessage = async (ev) => {
  const { id, cmd, args } = ev.data;
  try {
    await ready;
    let result;
    if (cmd === 'rebuild') result = await K.rebuild(args.doc);
    else if (cmd === 'describe') result = K.describe(args.ref, args.kind);
    else if (cmd === 'facePlane') result = K.facePlane(args.ref);
    else if (cmd === 'measure') result = K.measure(args.a, args.b);
    else if (cmd === 'bodyProps') result = K.bodyProps(args.id);
    else if (cmd === 'interference') result = K.interference(args.ids);
    else if (cmd === 'export') result = await K.exportFile(args.format, args.ids);
    else if (cmd === 'ping') result = true;
    else throw new Error('Bilinmeyen komut ' + cmd);
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: typeof e === 'number' ? 'Geometri çekirdeği hatası (OCCT)' : e?.message || String(e) });
  }
};
