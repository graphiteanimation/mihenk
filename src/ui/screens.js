// Ayarlar penceresi ve karşılama ekranı.
import { h, $, modal } from './dom.js';
import { icon } from './icons.js';
import { t, getLang, setLang } from '../shared/i18n.js';
import { prefs, setPref, resetPrefs, getStr, setStr } from './prefs.js';
import logoLight from '../../brand/logo/logo-horizontal.svg?url';
import logoDark from '../../brand/logo/logo-horizontal-reverse.svg?url';
import pkg from '../../package.json';
import { SKO, SNAP_KINDS, GRID_STEPS, AUTO_KINDS, snapOn, setSnapKind, setGridStep, setAuto, setAutoKind } from './sketch/opts.js';
import { SNAP_LABEL } from './sketch/snap.js';
import { DISPLAY_MODES } from './viewport-display.js';
const AUTO_LABEL = { hv: 'cf.auto_hv', tan: 'cf.auto_tan', perp: 'cf.auto_perp', coin: 'cf.auto_coin', on: 'cf.auto_on', mid: 'cf.auto_mid' };

// Bölmeli (segmented) seçici: seçenekler [değer, etiket]; seçilen aria-pressed=true.
function seg(testid, options, current, onPick) {
  const box = h('div', { class: 'seg', role: 'group', 'data-testid': testid });
  const draw = (cur) => box.replaceChildren(...options.map(([v, label]) => h('button', { type: 'button', 'aria-pressed': String(v === cur), 'data-v': v, 'data-testid': testid + '-' + v, onclick: () => { onPick(v); draw(v); } }, label)));
  draw(current); return box;
}
const field = (label, ctl, help) => h('div', { class: 'fld' }, h('label', { text: label }), h('div', { class: 'ctl' }, ctl, help ? h('div', { class: 'help', text: help }) : null));

export function showSettings(app, tab = 'general') {
  let cur = tab; const pane = h('div', { class: 'pane', role: 'tabpanel' }); const nav = h('nav', { role: 'tablist', 'aria-orientation': 'vertical' });
  const TABS = [['general', 'set.general', 'settings'], ['draw', 'set.draw', 'view-iso'], ['about', 'set.about', 'info']];
  // WP-08 devir (c): görüntü modu, adlandırılmış görünüşler (belgeyle saklanır) ve eskiz çizim ayarları ana Ayarlar penceresinde
  const drawTab = () => {
    const vp = app.viewport; const box = (id, on, set, label) => { const c = h('input', { type: 'checkbox', 'data-testid': 'set-' + id, checked: on ? true : null }); c.checked = !!on; c.addEventListener('change', () => set(c.checked)); return h('label', { class: 'check' }, c, h('span', { text: t(label) })); };
    const mode = vp ? seg('set-display', DISPLAY_MODES.map((m) => [m, t('vd.' + m)]), vp.displayMode(), (v) => vp.setDisplayMode(v)) : null;
    const list = vp ? vp.namedViews() : [];
    const views = h('div', { class: 'set-views', 'data-testid': 'set-views' }, ...(list.length ? list.map((v) => h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn sm', 'data-testid': 'set-view-go-' + v.slot, onclick: () => vp.applyViewState(v.s) }, v.name),
      h('button', { type: 'button', class: 'btn sm ghost', 'data-testid': 'set-view-del-' + v.slot, 'aria-label': t('vd.delete', { name: v.name }), onclick: () => { vp.deleteNamedView(v.name); draw(); } }, '×'))) : [h('div', { class: 'note', text: t('vd.none') })]));
    const nm = h('input', { type: 'text', maxlength: '24', 'data-testid': 'set-view-name', placeholder: t('vd.name'), 'aria-label': t('vd.name') });
    const msg = h('div', { class: 'note', role: 'status', 'aria-live': 'polite' });
    const save = () => { const r = vp.saveNamedView(nm.value); if (r.ok) draw(); else msg.textContent = t(r.err); };
    nm.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); save(); } });
    const grid = h('select', { 'data-testid': 'set-grid' }, ...[...new Set([...GRID_STEPS, SKO.grid])].sort((a, b) => a - b).map((v) => h('option', { value: String(v), selected: v === SKO.grid }, v + ' mm')));
    grid.addEventListener('change', () => setGridStep(grid.value));
    return [h('div', { class: 'sec', text: t('vd.title') }), mode ? field(t('vd.mode'), mode) : null,
      field(t('vd.views'), h('div', {}, views, h('div', { class: 'row' }, nm, h('button', { type: 'button', class: 'btn sm', 'data-testid': 'set-view-save', onclick: save }, t('vd.save'))), msg), t('set.views_doc')),
      h('div', { class: 'sec', text: t('cf.open') }),
      field(t('cf.snap_title'), h('div', { class: 'checks' }, ...SNAP_KINDS.map((k) => box('snap-' + k, snapOn(k), (v) => setSnapKind(k, v), SNAP_LABEL[k])))),
      field(t('cf.grid_step'), grid),
      field(t('cf.auto_title'), h('div', { class: 'checks' }, box('auto-all', SKO.auto, (v) => setAuto(v), 'cf.auto_all'), ...AUTO_KINDS.map((k) => box('auto-' + k, !SKO.autoOff.has(k), (v) => setAutoKind(k, v), AUTO_LABEL[k]))))].filter(Boolean);
  };
  const general = () => {
    const lang = seg('set-lang', [['tr', 'Türkçe'], ['en', 'English']], getLang(), (v) => app.setLanguage(v)); // i18n-ignore: dil adları kendi dilindedir
    const theme = seg('set-theme', [['light', t('set.theme_light')], ['dark', t('set.theme_dark')], ['system', t('set.theme_system')]], prefs.theme, (v) => setPref('theme', v));
    const dens = seg('set-density', [['normal', t('set.density_normal')], ['large', t('set.density_large')]], prefs.density, (v) => setPref('density', v));
    const wel = h('input', { type: 'checkbox', 'data-testid': 'set-welcome', checked: getStr('welcome') !== 'off' });
    wel.addEventListener('change', () => setStr('welcome', wel.checked ? 'on' : 'off'));
    // C-05: sol tuşla döndürme (varsayılan kapalı; tercih ayar dosyası/localStorage'da 'leftRotate' = on|off)
    const lr = h('input', { type: 'checkbox', 'data-testid': 'set-leftrotate', checked: getStr('leftRotate') === 'on' });
    lr.addEventListener('change', () => { setStr('leftRotate', lr.checked ? 'on' : 'off'); app.viewport?.setLeftRotate(lr.checked); });
    return [h('div', { class: 'sec', text: t('set.sec_look') }), field(t('set.language'), lang), field(t('set.theme'), theme), field(t('set.density'), dens, t('set.density_help')),
      field(t('set.left_rotate'), h('label', { class: 'check' }, lr, h('span', { text: t('set.left_rotate_on') })), t('set.left_rotate_help')),
      h('div', { class: 'sec', text: t('set.sec_start') }), field(t('set.show_welcome'), h('label', { class: 'check' }, wel, h('span', { text: t('set.show_welcome_on') }))),
      ];
  };
  const about = () => [h('div', { class: 'sec', text: 'Mihenk CAD/CAM' }), h('table', { class: 'kv' }, h('tr', {}, h('td', { text: t('set.version') }), h('td', { text: pkg.version }))),
    h('div', { class: 'note', text: t('set.about_note') }), h('div', { class: 'note', text: t('set.offline') })];
  const draw = () => {
    nav.replaceChildren(...TABS.map(([id, key, ic]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(id === cur), 'data-testid': 'set-tab-' + id, onclick: () => { cur = id; draw(); } }, h('span', { html: icon(ic, 'sm') }), t(key))));
    pane.replaceChildren(...(cur === 'about' ? about() : cur === 'draw' ? drawTab() : general()));
  };
  draw();
  return modal({ title: t('set.title'), content: h('div', { class: 'settings', 'data-testid': 'settings' }, nav, pane), buttons: [{ label: t('set.reset'), cls: 'ghost', testid: 'set-reset', onClick: () => { resetPrefs(); setStr('leftRotate', 'off'); app.viewport?.setLeftRotate(false); app.setLanguage('tr'); draw(); } }, { label: t('common.close'), cls: 'pri primary', value: true }], note: t('set.applied'), width: 720, icon: 'settings' });
}

export function renderWelcome(app) {
  const root = $('#welcome'); if (!root) return;
  root.classList.toggle('hidden', !app.welcome);
  if (!app.welcome) { root.replaceChildren(); return; }
  const go = (fn) => () => { app.showWelcome(false); if (fn) fn(); };
  const big = (cls, ic, title, sub, kbd, tid, fn) => h('button', { type: 'button', class: 'bigact ' + cls, 'data-testid': tid, onclick: fn }, h('span', { html: icon(ic) }), h('span', {}, title, sub ? h('span', { class: 'sub', text: sub }) : null), kbd ? h('span', { class: 'kbd', text: kbd }) : null);
  const left = h('div', { class: 'left' },
    h('img', { class: 'logo logo-light', src: logoLight, alt: 'Mihenk' }), h('img', { class: 'logo logo-dark', src: logoDark, alt: 'Mihenk' }),
    h('div', {}, h('h1', { text: t('w.tagline') }), h('p', { class: 'lead', text: t('w.lead') })),
    h('div', { class: 'acts', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      big('primary', 'file-new', t('w.new'), t('w.new_sub'), 'Ctrl+N', 'w-new', go()),
      big('', 'file-open', t('w.open'), t('w.open_sub'), 'Ctrl+O', 'w-open', () => { app.showWelcome(false); app.openFile().then(() => { if (!app.fileName) app.showWelcome(false); }); })),
    h('div', { class: 'foot' }, h('span', { text: t('w.version', { v: pkg.version }) }), h('span', { text: t('ui.offline') })));
  const list = h('div', { class: 'rlist', 'data-testid': 'w-recent' });
  const right = h('div', { class: 'right' }, h('div', { class: 'rhead' }, h('span', { text: t('w.recent') })), list,
    h('div', { class: 'card' }, h('div', { class: 'rhead', text: t('w.steps_title') }), h('div', { class: 'steps' }, h('span', { class: 'chip', text: '1 ' + t('w.step1') }), h('span', { class: 'chip', text: '2 ' + t('w.step2') }), h('span', { class: 'chip', text: '3 ' + t('w.step3') }))));
  const empty = () => list.replaceChildren(h('div', { class: 'empty', style: { padding: '24px' } }, h('div', { class: 'et', text: t('w.recent_none') }), h('div', { class: 'eb', text: t('w.recent_none_help') })));
  empty();
  if (window.native?.recentList) window.native.recentList().then((items) => {
    if (!Array.isArray(items) || !items.length) return;
    list.replaceChildren(...items.slice(0, 6).map((it, i) => h('button', { type: 'button', class: 'ri', 'data-testid': 'w-recent-item', onclick: go(() => app.openRecent(i)) },
      h('span', { class: 'thumb', html: icon('file-open') }), h('span', {}, h('span', { class: 'nm', text: it.name }), h('span', { class: 'path', text: it.dir || '' })), h('span', { class: 'meta' }, h('span', { text: new Date(it.ms).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' }) })))));
  }).catch(() => {});
  root.replaceChildren(left, right);
}
