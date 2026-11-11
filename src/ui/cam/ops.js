// İşlem paneli, hesap, simülasyon, post (Aşama 2). Bu sürüm: durum rozetleri ve alt çubuk iskeleti.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../../shared/i18n.js';

export class CamOps {
  constructor(cam) { this.cam = cam; this.cache = new Map(); this.nc = null; }
  enter() {} leave() {} reset() { this.cache.clear(); this.nc = null; } onResult() {} relang() {}
  state(op) { if (op.suppressed) return { state: 'sup' }; const c = this.cache.get(op.id); return c ? { state: 'ok' } : { state: 'none' }; }
  create() { this.cam.app.toastInfo(t('cam.soon_op')); }
  onPick() {}
  edit() {} computeAll() {} simulate() {} post() {} showNc() {}
  verifiedState() { return { ok: false }; }
  openVerify() {}
  renderBar(tl) {
    tl.replaceChildren(h('div', { class: 'tl-label' }, h('span', { html: icon('simulate', 'sm') }), h('span', { text: t('cam.sim.label') })), h('span', { class: 'note', text: t('cam.sim.empty') }));
  }
}
