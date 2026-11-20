// Ayarlar penceresi ve karşılama ekranı.
import { h, $, modal } from './dom.js';
import { icon } from './icons.js';
import { t, getLang, setLang } from '../shared/i18n.js';
import { prefs, setPref, resetPrefs, getStr, setStr } from './prefs.js';
import logoLight from '../../brand/logo/logo-horizontal.svg?url';
import logoDark from '../../brand/logo/logo-horizontal-reverse.svg?url';
import pkg from '../../package.json';

// Bölmeli (segmented) seçici: seçenekler [değer, etiket]; seçilen aria-pressed=true.
function seg(testid, options, current, onPick) {
  const box = h('div', { class: 'seg', role: 'group', 'data-testid': testid });
  const draw = (cur) => box.replaceChildren(...options.map(([v, label]) => h('button', { type: 'button', 'aria-pressed': String(v === cur), 'data-v': v, 'data-testid': testid + '-' + v, onclick: () => { onPick(v); draw(v); } }, label)));
  draw(current); return box;
}
const field = (label, ctl, help) => h('div', { class: 'fld' }, h('label', { text: label }), h('div', { class: 'ctl' }, ctl, help ? h('div', { class: 'help', text: help }) : null));

export function showSettings(app, tab = 'general') {
  let cur = tab; const pane = h('div', { class: 'pane', role: 'tabpanel' }); const nav = h('nav', { role: 'tablist', 'aria-orientation': 'vertical' });
  const TABS = [['general', 'set.general', 'settings'], ['about', 'set.about', 'info']];
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
    pane.replaceChildren(...(cur === 'about' ? about() : general()));
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
