// Viewport + Sketcher'ı app.js'siz kurar; window.sk olarak açar.
import wasmUrl from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import { initSolver } from '../src/ui/solver.js';
import { Viewport } from '../src/ui/viewport.js';
import { Sketcher } from '../src/ui/sketcher.js';
import * as V from '../src/shared/vec.js';
import { findRegions } from '../src/shared/profiles.js';

initSolver(() => wasmUrl);
const vp = new Viewport(document.getElementById('viewport'));
window.vars = { L: 60 }; window.statusLog = []; window.changes = 0;
const sk = new Sketcher({
  viewport: vp, overlayEl: document.getElementById('overlay'), getVars: () => window.vars,
  setHint: (t) => { document.getElementById('hint').textContent = t; },
  setStatus: (t) => { window.statusLog.push(t); document.getElementById('st').textContent = t; },
  onChange: () => { window.changes++; },
});
window.sk = sk; window.vp = vp; window.V = V; window.findRegions = findRegions;
window.begin = (plane = 'XY', feat) => {
  const pl = V.basePlane(plane, 0);
  sk.start(feat || { id: 's1', type: 'sketch', name: 'Sketch1', plane: { kind: 'base', name: plane, offset: '0' }, points: { O: { x: 0, y: 0, fixed: true } }, ents: [], cons: [] }, pl);
  return sk.idle();
};
// yerel (u,v) -> sayfa koordinatı
window.px = (u, v) => { const [x, y] = vp.project(V.toWorld(sk.plane, u, v)); const r = vp.renderer.domElement.getBoundingClientRect(); return [r.left + x, r.top + y]; };
window.keyEv = (key, extra = {}) => ({ key, target: document.body, preventDefault() {}, ...extra });
window.addEventListener('keydown', (e) => { if (window.sk.active) sk.handleKey(e); });
window.ready = true;
