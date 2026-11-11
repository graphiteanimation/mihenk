// Simülasyon çubuğu: oynat/duraklat/adım/hız/kaydırıcı, stok yükseklik haritası (görünümde ağ), takım gösterimi.
// Sayaç, createSim adımlayıcısından okunur; kapı sonuçları (sorun listesi) program kurulurken ayrıca hesaplanmıştır.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { t, fmtNum } from '../../shared/i18n.js';
import { createSim, createHeightmap } from '../../cam/sim/index.js';
import { showIssueList } from './postui.js';

const SPEEDS = [1, 5, 25, 100, 500];

export class SimRun {
  constructor(ops, r) {
    this.ops = ops; this.cam = ops.cam; this.app = ops.app; this.r = r; this.view = ops.cam.view; this.playing = false; this.speed = 25; this.holder = true; this.raf = 0; this.sec = -1; this.idx = 0; this.refs = {};
    this.offsets = []; let o = 0; for (const s of r.program.sections) { this.offsets.push(o); o += s.toolpath.moves.length; } this.total = o;
    const stockBoxes = {}, hms = {}; this.init = new Map(); const res = r.simOpts.res;
    for (const it of r.items) {
      if (this.init.has(it.S.id)) continue; const b = it.S.stockBox; stockBoxes[it.S.id] = b;
      const hm = createHeightmap([b.min[0], b.min[1]], [b.max[0], b.max[1]], res, b.max[2]); this.init.set(it.S.id, { S: it.S, hm }); hms[it.S.id] = hm;
    }
    this.stepper = createSim(r.program, { res, stockBoxes, initialHeightmaps: hms, modelHeightmaps: r.simOpts.modelHeightmaps, tools: r.simOpts.tools });
  }
  start() {
    const v = this.view; v.pathsVisible(this.ops.showPath); v.initSim(this.init); v.simVisible(true); v.setBodiesDim(true); v.hideMove();
    const first = this.r.items[0]; v.showSimSetup(first.S.id); this.sec = -1; this.sync();
  }
  dispose() { this.pause(true); const v = this.view; if (v) { v.clearSim(); v.hideMove(); v.setTool(null); } }
  item(si) { return this.r.items[si]; }
  toolOf(si) { const it = this.item(si); return this.cam.tools().find((x) => x.number === it.tp.tool.number) || it.tp.tool; }
  enterSection(si) {
    const it = this.item(si); this.view.showSimSetup(it.S.id); this.view.setTool(it.S, this.toolOf(si), {}, this.holder);
  }
  sync() {
    const st = this.stepper.state(); this.idx = st.index; const v = this.view;
    if (st.section != null && st.section !== this.sec) { this.sec = st.section; this.enterSection(st.section); }
    const si = st.section ?? 0; const id = this.item(si).S.id; const vm = v.simMesh?.get(id);
    if (vm) { vm.hm = this.stepper.heightmap(id) || this.init.get(id).hm; v.updateSim(id); }
    if (v.toolG) v.toolG.visible = !!st.position; if (st.position) v.moveTool(st.position);
    this.updateRefs(st);
  }
  go(n) { this.stepper.step(n); this.sync(); }
  resetViews() { for (const [id, { hm }] of this.init) { const vm = this.view.simMesh?.get(id); if (vm) { vm.hm = hm; this.view.updateSim(id); } } this.sec = -1; }
  seek(target) {
    target = Math.max(0, Math.min(this.total, Math.round(target))); const cur = this.stepper.state().index;
    if (target < cur) { this.stepper.reset(); this.resetViews(); if (target > 0) this.stepper.step(target); } else if (target > cur) this.stepper.step(target - cur);
    this.sync();
  }
  play() {
    if (this.idx >= this.total) this.seek(0);
    this.playing = true; this.updateRefs(); this.view.hideMove();
    const tick = () => { if (!this.playing) return; this.go(this.speed); if (this.stepper.done) { this.pause(); return; } this.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  }
  pause(quiet) { this.playing = false; cancelAnimationFrame(this.raf); if (!quiet) this.updateRefs(); }
  jump(g) {
    if (g?.section == null || g.moveIndex == null) return; this.pause(); this.seek((this.offsets[g.section] || 0) + g.moveIndex + 1);
    const it = this.item(g.section); this.view.showMove(it.S, it.tp, g.moveIndex);
  }
  async openIssues() {
    const wasPlaying = this.playing; this.pause();
    await showIssueList(this.ops, { title: t('cam.sim.issues_title'), intro: this.r.gates.length ? t('cam.sim.issues_intro') : t('cam.sim.no_issues'), rows: this.ops.gateRows(this.r.gates), kind: this.r.gates.some((g) => g.level === 'block') ? 'err' : 'warn', onPick: (row) => { if (row.g?.section != null) this.jump(row.g); else if (row.g?.opId) this.ops.edit(row.g.opId); } });
    void wasPlaying;
  }
  updateRefs(st = this.stepper.state()) {
    const R = this.refs; if (!R.slider || !R.slider.isConnected) return;
    R.slider.value = String(st.index); R.pos.textContent = t('cam.sim.pos', { i: st.index, n: this.total }); R.vol.textContent = t('cam.sim.vol', { v: fmtNum(st.removedVolume / 1000, 2) });
    R.play.innerHTML = icon(this.playing ? 'pause' : 'play'); R.play.setAttribute('aria-label', t(this.playing ? 'cam.sim.pause' : 'cam.sim.play')); R.play.dataset.playing = this.playing ? '1' : '0';
    const it = st.section != null ? this.item(st.section) : null; R.op.textContent = it ? it.op.name : '';
  }
  render(tl) {
    tl.classList.add('sim'); const R = this.refs = {};
    const btn = (id, ic, key, fn) => h('button', { class: 'btn icon', type: 'button', 'data-testid': 'sim-' + id, 'aria-label': t(key), title: t(key), onclick: fn, html: icon(ic) });
    R.play = btn('play', 'play', 'cam.sim.play', () => (this.playing ? this.pause() : this.play()));
    R.slider = h('input', { type: 'range', min: '0', max: String(this.total), step: '1', value: String(this.idx), 'data-testid': 'sim-slider', 'aria-label': t('cam.sim.slider') });
    R.slider.addEventListener('input', () => { const v = Number(R.slider.value); this.pause(true); this.seek(v); });
    R.pos = h('span', { class: 'num', 'data-testid': 'sim-pos' }); R.vol = h('span', { class: 'num', 'data-testid': 'sim-vol' }); R.op = h('span', { class: 'num', 'data-testid': 'sim-op' });
    const sp = h('select', { 'data-testid': 'sim-speed', 'aria-label': t('cam.sim.speed') }, SPEEDS.map((n) => h('option', { value: String(n), selected: n === this.speed }, t('cam.sim.speed_n', { n }))));
    sp.addEventListener('change', () => { this.speed = Number(sp.value); });
    const hc = h('input', { type: 'checkbox', 'data-testid': 'sim-holder', checked: this.holder }); hc.addEventListener('change', () => { this.holder = hc.checked; if (this.sec >= 0) this.enterSection(this.sec); this.sync(); });
    const iss = h('button', { class: 'btn sm' + (this.r.gates.some((g) => g.level === 'block') ? ' danger-outline' : ''), type: 'button', 'data-testid': 'sim-issues', onclick: () => this.openIssues() }, h('span', { html: icon(this.r.gates.some((g) => g.level === 'block') ? 'error' : 'warning', 'sm') }), t('cam.sim.issues', { n: this.r.gates.length }));
    tl.replaceChildren(h('div', { class: 'tl-label' }, h('span', { html: icon('simulate', 'sm') }), h('span', { text: t('cam.sim.label') })),
      h('div', { class: 'simbar' }, btn('back', 'step-back', 'cam.sim.back', () => { this.pause(); this.seek(this.idx - 1); }), R.play, btn('step', 'step-forward', 'cam.sim.step', () => { this.pause(); this.go(1); }),
        btn('stop', 'stop', 'cam.sim.stop', () => this.ops.stopSim()), R.slider, R.pos, R.vol, R.op, sp, h('label', { class: 'chk' }, hc, h('span', { text: t('cam.sim.holder') })), iss));
    this.updateRefs();
  }
}
