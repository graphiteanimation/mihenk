// WP-13: node worker_threads uyarlayicisi (testler; uretimde kullanilmaz). Protokol: worker-core.js
import { parentPort } from 'node:worker_threads';
import { createSimHost } from './worker-core.js';
const host = createSimHost((m, t) => parentPort.postMessage(m, t || []));
parentPort.on('message', (m) => { host.onMessage(m); });
