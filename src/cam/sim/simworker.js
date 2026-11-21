// WP-13: tarayici/Electron sim worker'i (type: 'module'). Protokol: worker-core.js
import { createSimHost } from './worker-core.js';
const host = createSimHost((m, t) => self.postMessage(m, t || []));
self.onmessage = (e) => { host.onMessage(e.data); };
