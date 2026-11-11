// Arayüz kabuğu: başlık şeridi (Dosya menüsü, geri al/yinele/kaydet, belge adı, komut arama, tezgâh, ayarlar, yardım), çalışma alanı sekmeleri,
// komut şeridi (gruplar, açılır alt menüler, son kullanılanlar, taşma menüsü), tarayıcı, zaman çizelgesi, durum çubuğu, görünüm küpü/düğmeleri,
// komut paleti. Tüm komutlar tek kayıt defterinde (cmds) durur: şerit, Dosya menüsü, palet ve taşma menüsü aynı tanımı kullanır.
// Test ve erişilebilirlik sözleşmesi: her komut düğmesi `data-cmd`, önemli parçalar `data-testid` taşır; metne bağlı seçici gerekmez.
import { h, $, ctxMenu, fmt, tip, hideTip, modal } from './dom.js';
import { icon, featureIcon } from './icons.js';
import { featLabel } from './features.js';
import { t, tk, errText, getLang, LANGS, tLang } from '../shared/i18n.js';
import { getStr, setStr } from './prefs.js';
import logoReverse from '../../brand/logo/logo-horizontal-reverse.svg?url';

// Eskiz araç listeleri: [kimlik, etiket anahtarı, simge adı]
const FEAT_IDS = new Set(['sketch', 'extrude', 'revolve', 'hole', 'box', 'cylinder', 'sphere', 'fillet', 'chamfer', 'shell', 'combine', 'move', 'pattern', 'mirror', 'measure', 'props', 'interf', 'section']);
// Eskiz aracı ile model komutu aynı kimliği paylaşırsa eskiz komutu 'sk-' önekini alır.
const cid = (id) => (FEAT_IDS.has(id) ? 'sk-' + id : id);
const SK_DRAW = [['select', tk('tb.select'), 'select'], ['line', tk('tb.line'), 'line'], ['rect', tk('tb.rect'), 'rect'], ['circle', tk('tb.circle'), 'circle'], ['arc', tk('tb.arc'), 'arc']];
const SK_DRAW_MORE = [['point', tk('tb.point'), 'point'], ['rectc', tk('tb.rectc'), 'rect-center'], ['rect3', tk('tb.rect3'), 'rect3'], ['circle2', tk('tb.circle2'), 'circle'], ['circle3', tk('tb.circle3'), 'circle-3pt'], ['arc3', tk('tb.arc3'), 'arc-3pt'], ['arct', tk('tb.arct'), 'arc-tangent'], ['polygon', tk('tb.polygon'), 'polygon'], ['slot', tk('tb.slot'), 'slot'], ['ellipse', tk('tb.ellipse'), 'ellipse'], ['spline', tk('tb.spline'), 'spline']];
const SK_EDIT = [['trim', tk('tb.trim'), 'trim'], ['offset', tk('tb.offset'), 'offset'], ['mirror', tk('tb.sk_mirror'), 'sketch-mirror']];
const SK_EDIT_MORE = [['extend', tk('tb.extend'), 'extend'], ['break', tk('tb.break'), 'split'], ['fillet', tk('tb.sk_fillet'), 'sketch-fillet'], ['chamfer', tk('tb.sk_chamfer'), 'sketch-chamfer'], ['patrect', tk('tb.patrect'), 'pattern-rect'], ['patcirc', tk('tb.patcirc'), 'pattern-circ'], ['move', tk('tb.sk_move'), 'sk-move'], ['copy', tk('tb.copy'), 'sk-copy'], ['rotate', tk('tb.rotate'), 'sk-rotate'], ['scale', tk('tb.scale'), 'sk-scale'], ['project', tk('tb.project'), 'project']];
const SK_DIMS = [['dim', tk('tb.dim'), 'dim'], ['hdim', tk('tb.hdim'), 'hdim'], ['vdim', tk('tb.vdim'), 'vdim']];
const SK_DIMS_MORE = [['rdim', tk('tb.rdim'), 'dim-radius'], ['ddim', tk('tb.ddim'), 'ddim']];
const SK_CONS = [['horizontal', tk('con.horizontal')], ['vertical', tk('con.vertical')], ['parallel', tk('con.parallel')], ['perpendicular', tk('con.perpendicular')], ['equal', tk('con.equal')], ['tangent', tk('con.tangent')], ['fix', tk('con.fix')]];
const SK_CONS_MORE = [['coincident', tk('con.coincident')], ['midpoint', tk('con.midpoint')], ['concentric', tk('con.concentric')], ['symmetric', tk('con.symmetric')], ['collinear', tk('con.collinear')]];
// kısayol göstergesi (araç ipucuna eklenir; gerçek tuşlar sketcher.handleKey'de)
const SHORT = { line: 'L', rect: 'R', circle: 'C', arc: 'A', point: 'P', dim: 'D', trim: 'T', extend: 'X', break: 'K', offset: 'O', fillet: 'Q', chamfer: 'W', mirror: 'M', polygon: 'G', slot: 'U', ellipse: 'Y', spline: 'B', project: 'J', rectc: 'Shift+R', circle3: 'Shift+C', arc3: 'Shift+A' };
const FEATURE_CMDS = ['sketch', 'extrude', 'revolve', 'hole', 'box', 'cylinder', 'sphere', 'fillet', 'chamfer', 'shell', 'combine', 'move', 'pattern', 'mirror', 'measure', 'props', 'interf', 'section'];
const DEFAULT_RECENT = ['extrude', 'fillet', 'hole', 'measure'];
const LANG_KEY = { tr: tk('lang.tr'), en: tk('lang.en') };

export function initChrome(app) {
  const C = {};
  const cmds = {};            // kimlik → {id, name, icon, kbd, tip, run, off(): neden | null, sk?: yalnız sketch kipi}
  C.cmds = cmds;
  const reg = (id, name, ic, run, o = {}) => { cmds[id] = { id, name, icon: ic, run, ...o }; return cmds[id]; };
  const label = (c) => t(c.name);
  const reason = (c) => (c.off ? c.off() : null);

  // ---------------------------------------------------------------- komut kayıt defteri
  const needSketch = () => (app.doc.features.slice(0, app.doc.rollback ?? undefined).some((f) => f.type === 'sketch') ? null : t('ui.need_sketch'));
  const needBody = () => (app.result?.bodies.length ? null : t('ui.need_body'));
  const needTwo = () => ((app.result?.bodies.length || 0) >= 2 ? null : t('ui.need_two'));
  const inSketch = () => (app.sketchSession ? null : t('ui.need_sketch_mode'));
  const feat = (id, nameKey, ic, type, kind, off) => reg(id, nameKey, ic, () => app.startFeature(type, kind), { tip: 'tip.' + id, off, feature: true });
  reg('new', 'menu.new', 'file-new', () => app.newDoc(), { kbd: 'Ctrl+N' });
  reg('open', 'menu.open', 'file-open', () => app.openFile(), { kbd: 'Ctrl+O' });
  reg('save', 'menu.save', 'file-save', () => app.save(), { kbd: 'Ctrl+S', tip: 'tip.save' });
  reg('saveas', 'menu.saveas', 'file-save', () => app.save(true), { kbd: 'Ctrl+Shift+S' });
  reg('import-step', 'menu.import_step', 'import', () => app.importFile('step'));
  reg('import-stl', 'menu.import_stl', 'import', () => app.importFile('stl'));
  reg('import-dxf', 'menu.import_dxf', 'dxf-import', () => app.importDxf(), { off: inSketch });
  reg('export-step', 'menu.export_step', 'export', () => app.exportFile('step'));
  reg('export-stl', 'menu.export_stl', 'export', () => app.exportFile('stl'));
  reg('export-dxf', 'menu.export_dxf', 'dxf-export', () => app.exportDxf('2000'), { off: inSketch });
  reg('export-dxf12', 'menu.export_dxf12', 'dxf-export', () => app.exportDxf('R12'), { off: inSketch });
  reg('quit', 'menu.quit', 'close', () => window.close());
  reg('undo', 'menu.undo', 'undo', () => app.undo(), { kbd: 'Ctrl+Z', tip: 'tip.undo', off: () => (app.sketchSession || app.undoStack.length ? null : t('ui.nothing')) });
  reg('redo', 'menu.redo', 'redo', () => app.redo(), { kbd: 'Ctrl+Y', tip: 'tip.redo', off: () => (app.sketchSession || app.redoStack.length ? null : t('ui.nothing')) });
  reg('params', 'menu.params', 'parameters', () => app.openParams(), { tip: 'tip.params' });
  reg('fit', 'view.fit', 'fit', () => app.viewport.fit(), { kbd: 'F' });
  reg('view-front', 'view.front', 'view-front', () => app.viewport.view('front'));
  reg('view-top', 'view.top', 'view-top', () => app.viewport.view('top'));
  reg('view-right', 'view.right', 'view-right', () => app.viewport.view('right'));
  reg('view-iso', 'menu.iso', 'view-iso', () => app.viewport.view('iso'));
  reg('planes', 'menu.planes', 'planes', () => app.togglePlanes());
  reg('settings', 'menu.settings', 'settings', () => app.showSettings(), { kbd: 'Ctrl+,', tip: 'tip.settings' });
  reg('shortcuts', 'menu.shortcuts', 'keyboard', () => app.showShortcuts());
  reg('about', 'menu.about', 'info', () => app.showAbout());
  reg('home', 'menu.home', 'home', () => app.showWelcome(true));
  reg('palette', 'ui.palette', 'search', () => C.openPalette(), { kbd: 'Ctrl+K', tip: 'tip.palette' });
  feat('sketch', tk('tb.sketch'), 'sketch', 'sketch').run = () => app.startSketch();
  feat('extrude', tk('tb.extrude'), 'extrude', 'extrude', null, needSketch);
  feat('revolve', tk('tb.revolve'), 'revolve', 'revolve', null, needSketch);
  feat('hole', tk('tb.hole'), 'hole', 'hole', null, needSketch);
  feat('box', tk('tb.box'), 'box', 'primitive', 'box');
  feat('cylinder', tk('tb.cylinder'), 'cylinder', 'primitive', 'cylinder');
  feat('sphere', tk('tb.sphere'), 'sphere', 'primitive', 'sphere');
  feat('fillet', tk('tb.fillet'), 'fillet', 'fillet', null, needBody);
  feat('chamfer', tk('tb.chamfer'), 'chamfer', 'chamfer', null, needBody);
  feat('shell', tk('tb.shell'), 'shell', 'shell', null, needBody);
  feat('combine', tk('tb.combine'), 'combine', 'combine', null, needTwo);
  feat('move', tk('tb.move'), 'move', 'move', null, needBody);
  feat('pattern', tk('tb.pattern'), 'pattern', 'pattern');
  feat('mirror', tk('tb.mirror'), 'mirror', 'mirror');
  reg('measure', 'tb.measure', 'measure', () => app.toggleTool('measure'), { tip: 'tip.measure', feature: true, tool: true, off: needBody });
  reg('props', 'tb.props', 'properties', () => app.toggleTool('props'), { tip: 'tip.props', feature: true, tool: true, off: needBody });
  reg('interf', 'tb.interf', 'interference', () => app.runInterference(), { tip: 'tip.interf', feature: true, off: needTwo });
  reg('section', 'tb.section', 'section', () => app.toggleSection(), { tip: 'tip.section', feature: true, off: needBody });
  // eskiz komutları (yalnız sketch kipinde şeritte)
  const skTool = ([id, nm, ic]) => reg(cid(id), nm, ic, () => app.sketchTool(id), { kbd: SHORT[id], tip: 'hint.' + id, sk: true, skTool: true });
  [...SK_DRAW, ...SK_DRAW_MORE, ...SK_EDIT, ...SK_EDIT_MORE, ...SK_DIMS, ...SK_DIMS_MORE].forEach(skTool);
  for (const [id, nm] of [...SK_CONS, ...SK_CONS_MORE]) reg('c-' + id, nm, id, () => app.sketchConstraint(id), { sk: true, tip: 'tip.con', tipParams: { name: nm } });
  reg('c-construct', tk('con.construction'), 'construction', () => app.sketchConstruction(), { sk: true, tip: 'tip.construct' });
  reg('sk-finish', tk('sk.finish'), 'finish', () => app.finishSketch(), { sk: true, tip: 'tip.sk_finish' });
  reg('sk-cancel', tk('common.cancel'), 'cancel', () => app.cancelSketch(), { sk: true, tip: 'tip.sk_cancel' });

  // son kullanılanlar (MRU; ayar dosyasında kısa bir liste olarak saklanır)
  const recentList = () => { const s = getStr('recent'); const l = s ? s.split(',').filter((x) => FEATURE_CMDS.includes(x)) : []; return [...l, ...DEFAULT_RECENT.filter((d) => !l.includes(d))].slice(0, 4); };
  const touchRecent = (id) => { if (!FEATURE_CMDS.includes(id)) return; const l = (getStr('recent') || '').split(',').filter((x) => x && x !== id); setStr('recent', [id, ...l].slice(0, 8).join(',')); };
  // komutu çalıştırır; devre dışıysa nedenini söyler
  C.run = (id) => {
    const c = cmds[id]; if (!c) return;
    const why = reason(c);
    if (why) { app.toastInfo(why); return; }
    touchRecent(id); hideTip();
    return c.run();
  };

  // ipucu: ad + kısayol + tek cümle (devre dışıysa neden)
  const tipOf = (c, el) => {
    const why = reason(c);
    const body = why || (c.tip ? t(c.tip, c.tipParams) : '');
    tip(el, { name: label(c), kbd: c.kbd, body });
    return el;
  };
  const dis = (c, el) => { const why = reason(c); if (why) { el.setAttribute('aria-disabled', 'true'); el.classList.add('is-disabled'); } return el; };

  // ---------------------------------------------------------------- başlık şeridi
  const closeMenus = () => { document.querySelectorAll('#menubar .menu.open').forEach((m) => { m.classList.remove('open'); m.querySelector('[data-menu]')?.setAttribute('aria-expanded', 'false'); }); };
  const fileItems = () => [
    'new', 'open', ['recent'], 'save', 'saveas', { sep: 1 }, 'import-step', 'import-stl', 'import-dxf', { sep: 1 }, 'export-step', 'export-stl', 'export-dxf', 'export-dxf12', { sep: 1 }, 'params', 'settings', 'home', { sep: 1 }, 'quit',
  ];
  const helpItems = () => ['shortcuts', 'about'];
  const menuBtn = (c) => { const why = reason(c); const b = h('button', { class: 'mi', role: 'menuitem', 'data-cmd': c.id, 'aria-disabled': why ? 'true' : null, onclick: (e) => { e.stopPropagation(); closeMenus(); C.run(c.id); } },
    h('span', { html: icon(c.icon, 'sm') }), h('span', { text: label(c) }), c.kbd ? h('span', { class: 'kbd', text: c.kbd }) : null); if (why) b.classList.add('is-disabled'); return b; };
  const dropdown = (id, nameKey, ic, items, testid, iconOnly) => {
    const m = h('div', { class: 'menu' });
    const b = h('button', { class: 'tbtn', 'data-menu': id, 'data-testid': testid || 'menu-' + id, 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (e) => {
      e.stopPropagation(); const o = m.classList.contains('open'); closeMenus(); if (!o) { m.classList.add('open'); b.setAttribute('aria-expanded', 'true'); m.querySelector('.mi:not(.is-disabled)')?.focus(); }
    }, 'aria-label': iconOnly ? t(nameKey) : null }, ic ? h('span', { html: icon(ic) }) : null, iconOnly ? null : h('span', { class: 'lbl', text: t(nameKey) }), iconOnly ? null : h('span', { html: icon('chevron-down', 'sm') }));
    if (iconOnly) b.classList.add('icon-only');
    const drop = h('div', { class: 'drop ctxmenu', role: 'menu' });
    for (const it of items) {
      if (it.sep) { drop.append(h('hr')); continue; }
      if (Array.isArray(it) && it[0] === 'recent') { C.recentMenu = h('div', { class: 'recent-sub', 'data-testid': 'recent-sub' }); drop.append(C.recentMenu); continue; }
      drop.append(menuBtn(cmds[it]));
    }
    m.append(b, drop);
    m.addEventListener('keydown', (e) => {
      if (!m.classList.contains('open')) return;
      const items2 = [...drop.querySelectorAll('.mi')]; const i = items2.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items2[(i + 1) % items2.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); items2[(i - 1 + items2.length) % items2.length].focus(); }
      else if (e.key === 'Escape') { e.stopPropagation(); closeMenus(); b.focus(); }
    });
    return m;
  };
  const tbtn = (id, ic, extra = {}) => { const c = cmds[id]; const b = h('button', { class: 'tbtn icon-only', 'data-cmd': id, 'data-testid': 'tb-' + id, onclick: () => C.run(id), ...extra }, h('span', { html: icon(ic || c.icon) })); tipOf(c, b); return dis(c, b); };
  C.renderMenu = () => {
    const bar = $('#menubar'); const openId = bar.querySelector('.menu.open > button')?.dataset.menu;
    const unsaved = app.dirty;
    const doc = h('div', { class: 'doc', 'data-testid': 'doc' }, h('span', { class: 'name', id: 'docname', 'data-testid': 'docname', text: app.fileName || t('doc.untitled') }),
      h('span', { class: 'dirty', id: 'dirty', 'data-testid': 'dirty', hidden: !unsaved }, h('span', { text: t('ui.unsaved') })));
    const search = h('button', { class: 'cmdsearch', 'data-cmd': 'palette', 'data-testid': 'cmd-search', onclick: () => C.run('palette') }, h('span', { html: icon('search') }), h('span', { text: t('ui.palette') }), h('span', { class: 'kbd', text: 'Ctrl+K' }));
    tip(search, { name: t('ui.palette'), kbd: 'Ctrl+K / S', body: t('tip.palette') });
    const machine = h('div', { class: 'machine-chip', 'data-testid': 'machine', role: 'group', 'aria-label': t('ui.machine_label') }, h('span', { html: icon('axes-3') }), h('span', { text: 'Neway VM1160H' }), h('small', { text: t('ui.axes3') }));
    const helpMenu = dropdown('help', 'menu.help', 'help', helpItems(), 'menu-help', true); helpMenu.classList.add('right');
    bar.replaceChildren(
      h('div', { class: 'brand' }, h('img', { src: logoReverse, height: 22, alt: 'Mihenk', 'data-testid': 'brand' })),
      dropdown('file', 'menu.file', 'file-open', fileItems(), 'menu-file'), h('span', { class: 'sep' }),
      tbtn('undo', 'undo'), tbtn('redo', 'redo'), tbtn('save', 'file-save'), doc, h('span', { class: 'grow' }), search, machine, tbtn('settings', 'settings'), helpMenu);
    if (openId) bar.querySelector(`[data-menu="${openId}"]`)?.click();
    C.renderRecentMenu();
  };
  document.addEventListener('click', closeMenus);
  C.renderTitle = () => {
    const d = $('#docname'); if (d) d.textContent = app.fileName || t('doc.untitled');
    const u = $('#dirty'); if (u) u.hidden = !app.dirty;
    for (const id of ['undo', 'redo']) { const b = $(`#menubar [data-cmd="${id}"]`); if (b) { const why = reason(cmds[id]); b.classList.toggle('is-disabled', !!why); why ? b.setAttribute('aria-disabled', 'true') : b.removeAttribute('aria-disabled'); } }
  };
  // Son dosyalar (yalnız masaüstü uygulamasında: yolları ana süreç tutar, yeniden açmak için dizin gönderilir)
  C.recentFiles = [];
  C.renderRecentMenu = () => {
    if (!C.recentMenu) return;
    const list = C.recentFiles;
    C.recentMenu.replaceChildren(h('div', { class: 'msec', text: t('menu.recent') }), ...(list.length ? list.slice(0, 6).map((f, i) => h('button', { class: 'mi', role: 'menuitem', 'data-cmd': 'open-recent', 'data-i': i, title: f.dir, onclick: (e) => { e.stopPropagation(); closeMenus(); app.openRecent(i); } }, h('span', { html: icon('file-open', 'sm') }), h('span', { text: f.name }))) : [h('div', { class: 'mi is-disabled', 'aria-disabled': 'true' }, h('span', { text: t('w.recent_none_short') }))]));
  };

  // ---------------------------------------------------------------- çalışma alanı sekmeleri
  C.renderTabs = () => {
    const tab = (id, ic, nm, on, soon) => h('button', { class: 'tab', role: 'tab', 'data-testid': 'tab-' + id, 'aria-selected': on ? 'true' : 'false', 'aria-disabled': on ? null : 'true', tabindex: on ? null : '0' },
      h('span', { html: icon(ic) }), h('span', { text: t(nm) }), soon ? h('span', { class: 'soon', text: t('ui.soon') }) : null);
    $('#tabs').replaceChildren(tab('design', 'workspace-design', 'ui.tab_design', true), tab('manufacture', 'workspace-manufacture', 'ui.tab_manufacture', false, true), tab('drawing', 'workspace-drawing', 'ui.tab_drawing', false, true),
      h('div', { class: 'right' }, h('span', { class: 'badge', 'data-testid': 'offline' }, h('span', { html: icon('lock', 'sm') }), h('span', { text: t('ui.offline') }))));
  };

  // ---------------------------------------------------------------- komut şeridi
  C.ddOpen = null;
  const toolBtn = (id, o = {}) => {
    const c = cmds[id];
    const b = h('button', { class: 'tool' + (o.on ? ' on' : '') + (o.cls ? ' ' + o.cls : ''), 'data-cmd': id, 'data-testid': 'cmd-' + id, 'aria-pressed': o.on === undefined ? null : o.on ? 'true' : 'false', onclick: o.run || (() => C.run(id)) },
      h('span', { html: icon(c.icon, 'lg') }), h('span', { class: 'l', text: label(c) }), o.caret ? h('span', { html: icon('chevron-down', 'caret') }) : null);
    tipOf(c, b); return dis(c, b);
  };
  const iconBtn = (id, o = {}) => {
    const c = cmds[id];
    const b = h('button', { class: 'tool icon36' + (o.on ? ' on' : ''), 'data-cmd': id, 'data-testid': 'cmd-' + id, 'aria-pressed': o.on === undefined ? null : o.on ? 'true' : 'false', onclick: o.run || (() => C.run(id)) }, h('span', { html: icon(c.icon, 'lg') }));
    tipOf(c, b); return b;
  };
  const group = (key, nm, kids, o = {}) => { const g = h('div', { class: 'rgroup' + (o.cls ? ' ' + o.cls : ''), 'data-group': key, role: 'group', 'aria-label': t(nm) }, h('div', { class: 'btns' }, kids), h('div', { class: 'glabel', text: t(nm) })); g._items = o.items || []; return g; };
  const ddBtn = (id, nm, ic) => { const b = h('button', { class: 'tool', 'data-cmd': 'dd-' + id, 'data-testid': 'dd-' + id, 'aria-haspopup': 'menu', 'aria-expanded': C.ddOpen === id ? 'true' : 'false', onclick: (e) => { e.stopPropagation(); C.ddOpen = C.ddOpen === id ? null : id; C.renderDD(); } },
    h('span', { html: icon(ic, 'lg') }), h('span', { class: 'l', text: t(nm) }), h('span', { html: icon('chevron-down', 'caret') })); tip(b, { name: t(nm), body: t('tip.dd') }); if (C.ddOpen === id) b.classList.add('on'); return b; };
  const ddItems = (id) => id === 'draw' ? SK_DRAW_MORE.map((x) => cid(x[0])) : id === 'edit' ? SK_EDIT_MORE.map((x) => cid(x[0])) : id === 'cons' ? [...SK_CONS_MORE.map((x) => 'c-' + x[0]), ...SK_DIMS_MORE.map((x) => cid(x[0]))] : id === 'prim' ? ['box', 'cylinder', 'sphere'] : [];
  // açılır alt menü (şeridin kaydırılabilir/taşabilir olması nedeniyle gövdeye sabitlenir)
  C.renderDD = () => {
    document.getElementById('ddpop')?.remove();
    for (const b of document.querySelectorAll('#toolbar [data-cmd^="dd-"]')) { const on = C.ddOpen && b.dataset.cmd === 'dd-' + C.ddOpen; b.setAttribute('aria-expanded', on ? 'true' : 'false'); b.classList.toggle('on', !!on); }
    if (!C.ddOpen) return;
    const items = ddItems(C.ddOpen).map((id) => { const c = cmds[id]; const cur = app.sketcher?.tool === id; return h('button', { class: 'mi' + (cur ? ' hl' : ''), role: 'menuitem', 'data-cmd': id, onclick: (e) => { e.stopPropagation(); C.ddOpen = null; C.renderDD(); C.run(id); } },
      h('span', { html: icon(c.icon, 'sm') }), h('span', { text: label(c) }), c.kbd ? h('span', { class: 'kbd', text: c.kbd }) : null); });
    const pop = h('div', { id: 'ddpop', class: 'ddpop ctxmenu', role: 'menu', 'data-testid': 'ddpop' }, items);
    const anchor = document.querySelector(`#toolbar [data-cmd="dd-${C.ddOpen}"]`); const r = anchor ? anchor.getBoundingClientRect() : { left: 8, bottom: 60 };
    document.body.append(pop);
    const w = pop.getBoundingClientRect().width;
    pop.style.left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4)) + 'px'; pop.style.top = r.bottom + 2 + 'px';
    pop.addEventListener('keydown', (e) => {
      const l = [...pop.querySelectorAll('.mi')]; const i = l.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); l[(i + 1) % l.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); l[(i - 1 + l.length) % l.length].focus(); }
      else if (e.key === 'Escape') { e.stopPropagation(); const id = C.ddOpen; C.ddOpen = null; C.renderDD(); document.querySelector(`#toolbar [data-cmd="dd-${id}"]`)?.focus(); }
    });
    if (document.activeElement && document.activeElement.matches && document.activeElement.matches('#toolbar [data-cmd^="dd-"]:focus-visible')) pop.querySelector('.mi')?.focus();
  };
  document.addEventListener('click', () => { if (C.ddOpen) { C.ddOpen = null; C.renderDD(); } C.closeOverflow(); });

  // taşma menüsü: sığmayan gruplar sağdan sola "»" düğmesine gider (aynı sıra, aynı simge + ad)
  C.closeOverflow = () => document.getElementById('ovpop')?.remove();
  C.fitRibbon = () => {
    const bar = $('#toolbar'); if (!bar) return;
    bar.querySelector('.ov-btn')?.remove();
    const groups = [...bar.querySelectorAll('.rgroup')]; groups.forEach((g) => g.classList.remove('ov-hidden'));
    const cs = getComputedStyle(bar); const avail = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const total = () => groups.filter((g) => !g.classList.contains('ov-hidden')).reduce((a, g) => a + g.getBoundingClientRect().width + (g.classList.contains('end') ? 0 : 0), 0);
    const hidden = [];
    const pin = (g) => g.dataset.pin === '1';
    let guard = 0;
    while (total() > avail - (hidden.length ? 56 : 0) && guard++ < 12) {
      const vis = groups.filter((g) => !g.classList.contains('ov-hidden') && !pin(g));
      const pick = vis.find((g) => g.classList.contains('recent')) || vis[vis.length - 1]; if (!pick) break;
      pick.classList.add('ov-hidden'); hidden.unshift(pick);
    }
    if (!hidden.length) return;
    const btn = h('button', { class: 'tool ov-btn', 'data-cmd': 'ribbon-overflow', 'data-testid': 'ribbon-overflow', 'aria-haspopup': 'menu', onclick: (e) => {
      e.stopPropagation(); if (document.getElementById('ovpop')) { C.closeOverflow(); return; }
      const rows = [];
      for (const g of hidden) { rows.push(h('div', { class: 'msec', text: g.getAttribute('aria-label') })); for (const id of g._items) { const c = cmds[id]; if (!c) continue; rows.push(h('button', { class: 'mi', role: 'menuitem', 'data-cmd': id, onclick: () => { C.closeOverflow(); C.run(id); } }, h('span', { html: icon(c.icon, 'sm') }), h('span', { text: label(c) }))); } }
      const pop = h('div', { id: 'ovpop', class: 'ctxmenu ddpop', role: 'menu' }, rows); document.body.append(pop);
      const r = btn.getBoundingClientRect(); const w = pop.getBoundingClientRect().width; pop.style.left = Math.max(4, Math.min(r.right - w, innerWidth - w - 4)) + 'px'; pop.style.top = r.bottom + 2 + 'px'; pop.querySelector('.mi')?.focus();
      pop.addEventListener('keydown', (ev) => { const l = [...pop.querySelectorAll('.mi')]; const i = l.indexOf(document.activeElement); if (ev.key === 'ArrowDown') { ev.preventDefault(); l[(i + 1) % l.length].focus(); } else if (ev.key === 'ArrowUp') { ev.preventDefault(); l[(i - 1 + l.length) % l.length].focus(); } else if (ev.key === 'Escape') { C.closeOverflow(); btn.focus(); } });
    } }, h('span', { html: icon('more', 'lg') }), h('span', { class: 'l', text: t('ui.overflow') }));
    tip(btn, { name: t('ui.overflow'), body: t('tip.overflow') });
    const firstHidden = hidden[0]; bar.insertBefore(btn, firstHidden);
    bar.insertBefore(btn, bar.querySelector('.rgroup.end') || null);
  };
  new ResizeObserver(() => C.fitRibbon()).observe($('#toolbar'));

  C.renderToolbar = () => {
    const bar = $('#toolbar'); const sk = app.sketcher; bar.classList.toggle('sk', !!app.sketchSession);
    if (app.sketchSession) {
      const cur = sk?.tool;
      const tools = (list) => list.map((x) => toolBtn(cid(x[0]), { on: cur === x[0] }));
      const ids = (list) => list.map((x) => cid(x[0]));
      const consIds = [...SK_CONS.map((x) => 'c-' + x[0])];
      bar.replaceChildren(
        group('draw', tk('grp.draw'), [...tools(SK_DRAW), ddBtn('draw', tk('dd.draw'), 'more')], { items: [...ids(SK_DRAW), ...ids(SK_DRAW_MORE)] }),
        group('edit', tk('grp.edit'), [...tools(SK_EDIT), ddBtn('edit', tk('dd.edit'), 'more')], { items: [...ids(SK_EDIT), ...ids(SK_EDIT_MORE)] }),
        group('dimcons', tk('grp.dimcons'), [...tools(SK_DIMS), h('div', { class: 'icongrid g6' }, [...consIds.map((id) => iconBtn(id)), iconBtn('c-construct', { on: !!sk?.consMode }), (() => { const b = h('button', { class: 'tool icon36' + (C.ddOpen === 'cons' ? ' on' : ''), 'data-cmd': 'dd-cons', 'data-testid': 'dd-cons', 'aria-haspopup': 'menu', 'aria-expanded': C.ddOpen === 'cons' ? 'true' : 'false', onclick: (e) => { e.stopPropagation(); C.ddOpen = C.ddOpen === 'cons' ? null : 'cons'; C.renderDD(); } }, h('span', { html: icon('more', 'lg') })); tip(b, { name: t('dd.cons'), body: t('tip.dd') }); return b; })()])],
          { items: [...ids(SK_DIMS), ...consIds, 'c-construct', ...SK_CONS_MORE.map((x) => 'c-' + x[0]), ...ids(SK_DIMS_MORE)] }),
        group('sketch', tk('grp.sketch'), [toolBtn('sk-finish', { cls: 'primary' }), toolBtn('sk-cancel')], { cls: 'end', items: ['sk-finish', 'sk-cancel'] }));
      bar.querySelector('.rgroup.end').dataset.pin = '1';
      C.renderDD(); C.fitRibbon();
      return;
    }
    C.ddOpen = C.ddOpen === 'prim' ? 'prim' : null;
    const on = (id) => (id === 'measure' || id === 'props' ? app.tool === id : id === 'sketch' ? app.tool === 'newsketch' : id === 'section' ? !!app.sectionPanel : false);
    const t1 = (id) => toolBtn(id, { on: on(id) });
    const recent = recentList();
    bar.replaceChildren(
      group('create', tk('grp.create'), [t1('sketch'), t1('extrude'), t1('revolve'), t1('hole'), ddBtn('prim', tk('tb.prim'), 'box')], { items: ['sketch', 'extrude', 'revolve', 'hole', 'box', 'cylinder', 'sphere'] }),
      group('modify', tk('grp.modify'), ['fillet', 'chamfer', 'shell', 'combine', 'move', 'pattern', 'mirror'].map(t1), { items: ['fillet', 'chamfer', 'shell', 'combine', 'move', 'pattern', 'mirror'] }),
      group('inspect', tk('grp.inspect'), ['measure', 'props', 'interf', 'section'].map(t1), { items: ['measure', 'props', 'interf', 'section'] }),
      group('recent', tk('ui.recent'), [h('div', { class: 'tool-stack', 'data-testid': 'recent' }, recent.map((id) => { const c = cmds[id]; const b = h('button', { class: 'tool sm', 'data-cmd': id, 'data-recent': '1', onclick: () => C.run(id) }, h('span', { html: icon(c.icon, 'sm') }), h('span', { class: 'l', text: label(c) })); tipOf(c, b); return dis(c, b); }))], { cls: 'end recent', items: recent }));
    C.renderDD(); C.fitRibbon();
  };

  // ---------------------------------------------------------------- görünüm küpü ve düğmeleri
  C.renderViewBtns = () => {
    const vb = (id, ic, nm, view) => { const b = h('button', { 'data-view': view || null, 'data-cmd': id, 'aria-label': t(nm), 'aria-pressed': view === 'iso' ? 'true' : null, onclick: () => C.run(id), html: icon(ic) }); tip(b, { name: t(nm), kbd: cmds[id].kbd, body: t('tip.' + id) }); return b; };
    $('#viewbtns').replaceChildren(vb('view-front', 'view-front', tk('view.front'), 'front'), vb('view-top', 'view-top', tk('view.top'), 'top'), vb('view-right', 'view-right', tk('view.right'), 'right'), vb('view-iso', 'view-iso', tk('view.iso'), 'iso'), vb('fit', 'fit', tk('view.fit'), 'fit'));
    const tg = (id, ic, nm, on) => { const b = h('button', { 'data-cmd': id, 'aria-label': t(nm), 'aria-pressed': on ? 'true' : 'false', onclick: () => C.run(id), html: icon(ic) }); tip(b, { name: t(nm), body: t('tip.' + id) }); return b; };
    $('#viewtoggles').replaceChildren(tg('planes', 'planes', tk('menu.planes'), app.planesVisible), tg('section', 'section', tk('tb.section'), !!app.sectionPanel));
    // küp: üç görünür yüz tıklanabilir (Üst, Ön, Sağ)
    const face = (pts, cls, view, txt, tx, ty, rot) => `<g class="cube-face ${cls}" data-view="${view}" tabindex="0" role="button" aria-label="${t('view.' + view)}"><polygon points="${pts}"/><text x="${tx}" y="${ty}" text-anchor="middle"${rot ? ` transform="rotate(${rot} ${tx} ${ty})"` : ''}>${txt}</text></g>`;
    $('#viewcube').innerHTML = `<svg viewBox="0 0 80 80" aria-hidden="false">${face('40,8 68,24 40,40 12,24', 'f-top', 'top', t('view.top'), 40, 29)}${face('12,24 40,40 40,72 12,56', 'f-front', 'front', t('view.front'), 26, 52, 26)}${face('68,24 40,40 40,72 68,56', 'f-right', 'right', t('view.right'), 54, 52, -26)}</svg>`;
    for (const g of $('#viewcube').querySelectorAll('.cube-face')) { const go = () => app.viewport.view(g.dataset.view); g.addEventListener('click', go); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); }
  };

  // ---------------------------------------------------------------- tarayıcı
  const activate = (el, fn) => { el.tabIndex = 0; el.setAttribute('role', 'button'); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } }); };
  const eye = (on, fn, title) => h('button', { class: 'tw vis' + (on ? '' : ' off'), 'data-testid': 'vis-toggle', 'aria-pressed': on ? 'true' : 'false', 'aria-label': t(title), onclick: (e) => { e.stopPropagation(); fn(); }, html: icon(on ? 'eye' : 'eye-off', 'sm') });
  const featureMenu = (e, f, i) => {
    e.preventDefault(); app.selectFeature(f.id);
    ctxMenu(e.clientX || 80, e.clientY || 80, [
      { id: 'ctx-edit', label: t('ctx.edit'), icon: 'sketch', run: () => app.editFeature(i) }, { id: 'ctx-rename', label: t('ctx.rename'), icon: 'rename', kbd: 'F2', run: () => app.renameFeature(i) },
      { id: 'ctx-suppress', label: f.suppressed ? t('ctx.unsuppress') : t('ctx.suppress'), icon: 'suppress', run: () => app.toggleSuppress(i) }, { id: 'ctx-rollback', label: t('ctx.rollback'), icon: 'rollback', run: () => app.rollbackTo(i + 1) },
      { sep: 1 }, { id: 'ctx-delete', label: t('ctx.delete'), icon: 'trash', danger: true, kbd: 'Del', run: () => app.deleteFeature(i) }]);
  };
  C.featureMenu = featureMenu;
  C.renderBrowser = () => {
    const br = $('#browser'); const doc = app.doc, res = app.result;
    const sec = (title, action) => h('div', { class: 'bsec' }, h('span', { text: title }), action || null);
    const note = (txt) => h('div', { class: 'trow empty', text: txt });
    const params = (doc.params || []).map((p) => {
      const v = res?.vars?.[p.name]; const er = res?.paramErrors?.[p.name];
      return h('div', { class: 'trow' + (er ? ' err' : ''), 'data-param': p.name, title: er ? errText(er) : p.expr + (p.note ? ' — ' + p.note : '') }, h('span', { class: 'tw' }, er ? h('span', { html: icon('error', 'sm') }) : null), h('span', { class: 'nm mono', text: p.name }), h('span', { class: 'val num', text: er ? t('br.err') : '= ' + fmt(v, 4) + ' mm' }));
    });
    const bodies = (res?.bodies || []).map((b) => { const r = h('div', { class: 'trow' + (app.selection.some((s) => s.kind === 'body' && s.body === b.id) ? ' sel' : '') + (app.hiddenBodies.has(b.id) ? ' hidden-item' : ''), 'data-body': b.id, 'data-testid': 'row-body', onclick: () => app.selectBody(b.id), ondblclick: () => app.renameBody(b.id) },
      eye(!app.hiddenBodies.has(b.id), () => app.toggleBody(b.id), tk('br.eye')), h('span', { class: 'nm', text: app.bodyName(b.id) }), h('span', { class: 'val num', text: fmt(b.volume / 1000, 2) + ' cm³' })); activate(r, () => app.selectBody(b.id)); return r; });
    const used = new Set(doc.features.map((f) => f.sketch).filter(Boolean));
    const sketches = doc.features.map((f, i) => [f, i]).filter(([f]) => f.type === 'sketch').map(([f, i]) => { const r = h('div', { class: 'trow' + (app.selFeature === f.id ? ' sel' : '') + (app.hiddenSketches.has(f.id) ? ' hidden-item' : ''), 'data-sketch': f.id, 'data-testid': 'row-sketch', ondblclick: () => app.editFeature(i), onclick: () => app.selectFeature(f.id), oncontextmenu: (e) => featureMenu(e, f, i) },
      eye(!app.hiddenSketches.has(f.id), () => app.toggleSketch(f.id), tk('br.eye')), h('span', { class: 'nm', text: f.name || f.id }), h('span', { class: 'val', text: used.has(f.id) ? t('br.in_use') : '' })); activate(r, () => app.selectFeature(f.id)); return r; });
    br.replaceChildren(
      sec(t('br.params'), h('button', { class: 'btn sm', id: 'br-params', 'data-cmd': 'params', onclick: () => C.run('params') }, t('br.edit'))), ...(params.length ? params : [note(t('br.no_params'))]),
      sec(t('br.origin')), (() => { const r = h('div', { class: 'trow' }, eye(app.planesVisible, () => app.togglePlanes(), tk('br.eye_planes')), h('span', { class: 'nm', text: t('br.planes_axes') })); return r; })(),
      sec(t('br.bodies')), ...(bodies.length ? bodies : [note(t('br.no_bodies'))]),
      sec(t('br.sketches')), ...(sketches.length ? sketches : [note(t('br.no_sketches'))]));
  };

  // ---------------------------------------------------------------- zaman çizelgesi
  C.renderTimeline = () => {
    const tl = $('#timeline'); const doc = app.doc, st = app.result?.status || {};
    const rb = doc.rollback; const kids = [h('div', { class: 'tl-label' }, h('span', { html: icon('clock', 'sm') }), h('span', { text: t('tl.label') }))];
    doc.features.forEach((f, i) => {
      if (i > 0) kids.push(h('span', { class: 'tl-sep' }));
      if (rb != null && i === rb) kids.push(h('span', { class: 'tl-marker', id: 'tl-marker', title: t('tl.marker') }));
      const s = st[f.id]; const rolled = rb != null && i >= rb; const bad = s && s.ok === false;
      const editing = app.edit && !app.edit.closed && app.edit.idx === i;
      const cls = 'chip' + (app.selFeature === f.id ? ' sel' : '') + (bad ? ' err' : '') + (f.suppressed ? ' sup' : '') + (rolled ? ' rolled' : '');
      const chip = h('button', { class: cls, 'data-id': f.id, 'data-i': i, 'data-testid': 'chip', 'aria-pressed': app.selFeature === f.id ? 'true' : 'false', title: bad ? errText(s.error) : f.name || f.id },
        h('span', { html: bad ? icon('error', 'sm') : featureIcon(f) }), h('span', { class: 'ix', text: String(i + 1) }), h('span', { text: (f.name || featLabel(f)) + (editing ? ' ' + t('tl.editing') : '') }));
      chip.addEventListener('click', (e) => { if (e.detail === 0 && app.selFeature === f.id && !app.edit) app.editFeature(i); else app.selectFeature(f.id); });
      chip.addEventListener('dblclick', () => app.editFeature(i));
      chip.addEventListener('contextmenu', (e) => featureMenu(e, f, i));
      kids.push(chip);
    });
    if (rb != null) kids.push(h('button', { class: 'btn sm', id: 'tl-end', 'data-testid': 'tl-end', onclick: () => app.rollbackTo(null) }, t('tl.end')));
    if (rb != null && rb >= doc.features.length) kids.push(h('span', { class: 'tl-marker', id: 'tl-marker' }));
    if (!doc.features.length) kids.push(h('span', { class: 'note', text: t('tl.empty') }));
    tl.replaceChildren(...kids);
    tl.querySelector('.chip.sel')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  // ---------------------------------------------------------------- durum çubuğu
  const hhmm = (d) => d.toLocaleTimeString(getLang() === 'tr' ? 'tr-TR' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  const seg = (id, ...kids) => h('span', { class: 'seg-i', 'data-testid': id, id: id === 'st-left' ? 'st-left' : null }, ...kids);
  const div = () => h('span', { class: 'div' });
  C.renderStatus = () => {
    const r = app.result; const n = r ? r.bodies.length : 0;
    const bad = app.badFeatures();
    const sk = !!app.sketchSession;
    const toolName = sk ? (() => { const c = cmds[app.sketcher?.tool]; return c ? label(c) : '—'; })() : app.edit && !app.edit.closed ? app.edit.titleText() : app.tool === 'measure' ? t('tb.measure') : app.tool === 'props' ? t('tb.props') : app.tool === 'newsketch' ? t('tb.sketch') : '—';
    const left = $('#st-left'); const keep = left ? left.textContent : '';
    $('#statusbar-main').replaceChildren(
      h('span', { class: 'seg-i', 'data-testid': 'st-mode', 'data-mode': sk ? 'sketch' : 'model' }, h('span', { html: icon(sk ? 'sketch' : 'workspace-design', 'sm') }), h('b', { text: t(sk ? 'ui.mode_sketch' : 'ui.mode_model') })), div(),
      h('span', { class: 'seg-i', 'data-testid': 'st-tool' }, h('span', { class: 'muted-od', text: t('ui.tool') }), h('b', { text: toolName })), div(),
      h('span', { class: 'seg-i', id: 'st-left', 'data-testid': 'st-left', text: keep }), h('span', { class: 'grow' }),
      ...(app.busy ? [h('span', { class: 'seg-i', 'data-testid': 'st-busy' }, h('span', { class: 'progress indet', role: 'progressbar', 'aria-label': t('ui.busy') }, h('i')), h('span', { text: t('ui.busy') }),
        h('button', { class: 'sbtn', 'data-testid': 'cancel-compute', 'data-cmd': 'cancel-compute', onclick: () => app.cancelCompute() }, h('span', { html: icon('cancel', 'sm') }), h('span', { text: t('ui.cancel_compute') })), div())] : []),
      ...(app.stale ? [h('span', { class: 'seg-i warnc', 'data-testid': 'st-stale' }, h('span', { html: icon('warning', 'sm') }), h('span', { text: t('ui.stale') })), div()] : []),
      ...(bad.length ? [h('button', { class: 'sbtn err', 'data-testid': 'st-errors', 'data-cmd': 'goto-error', onclick: () => app.gotoFirstError() }, h('span', { html: icon('error', 'sm') }), h('span', { text: t(bad.length === 1 ? 'ui.errors_one' : 'ui.errors_many', { n: bad.length }) })), div()] : []),
      h('span', { class: 'seg-i', 'data-testid': 'st-bodies', text: t('ui.bodies', { n }) }), div(),
      h('span', { class: 'seg-i', 'data-testid': 'st-sel', text: t('ui.sel', { n: app.selectionCount() }) }), div(),
      h('span', { class: 'seg-i', 'data-testid': 'st-unit', text: 'mm' }), div(),
      h('span', { class: 'seg-i num', 'data-testid': 'st-time', text: t('ui.time', { t: app.lastMs != null ? Math.round(app.lastMs) + ' ms' : '—' }) }), div(),
      h('span', { class: 'seg-i' + (app.lastAutosave ? ' okc' : ''), 'data-testid': 'st-autosave' }, app.lastAutosave ? h('span', { html: icon('check', 'sm') }) : null, h('span', { text: app.lastAutosave ? t('ui.autosaved', { time: hhmm(app.lastAutosave) }) : t('ui.autosave_none') })));
    C.renderTitle();
  };
  C.setLeft = (text) => { const e = $('#st-left'); if (e) e.textContent = text; };

  // ---------------------------------------------------------------- komut paleti (Ctrl+K / S)
  C.openPalette = () => {
    if (document.getElementById('palette')) return;
    const other = getLang() === 'tr' ? 'en' : 'tr';
    const all = () => Object.values(cmds).filter((c) => (app.sketchSession ? c.sk || !c.feature : !c.sk));
    const hay = (c) => (label(c) + ' ' + tLang(other, c.name) + ' ' + c.id).toLocaleLowerCase(getLang());
    const norm = (s) => s.toLocaleLowerCase(getLang());
    let list = [], sel = 0;
    const inp = h('input', { type: 'text', 'data-testid': 'palette-input', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list', 'aria-label': t('ui.palette'), placeholder: t('ui.palette'), autocomplete: 'off', spellcheck: 'false' });
    const res = h('div', { id: 'pal-list', role: 'listbox', 'data-testid': 'palette-list' });
    const root = h('div', { id: 'palette', class: 'scrim top', 'data-testid': 'palette' }, h('div', { class: 'cmd-palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('ui.palette') }, h('div', { class: 'q' }, h('span', { html: icon('search') }), inp, h('span', { class: 'kbd', text: 'Esc' })), res));
    const close = () => { root.remove(); document.removeEventListener('keydown', onKey, true); prev && prev.focus && prev.focus(); };
    const prev = document.activeElement;
    const draw = () => {
      const q = norm(inp.value.trim());
      list = all().filter((c) => !q || hay(c).includes(q)).sort((a, b) => (norm(label(a)).startsWith(q) ? 0 : 1) - (norm(label(b)).startsWith(q) ? 0 : 1) || label(a).localeCompare(label(b)));
      sel = Math.min(sel, Math.max(0, list.length - 1));
      res.replaceChildren(...(list.length ? list.slice(0, 40).map((c, i) => { const why = reason(c); return h('div', { class: 'res' + (i === sel ? ' sel' : '') + (why ? ' is-disabled' : ''), role: 'option', 'aria-selected': i === sel ? 'true' : 'false', 'aria-disabled': why ? 'true' : null, 'data-cmd': c.id, onclick: () => go(c) },
        h('span', { html: icon(c.icon, 'sm') }), h('span', { text: label(c) }), why ? h('span', { class: 'why', text: why }) : (c.kbd ? h('span', { class: 'kbd', text: c.kbd }) : null)); }) : [h('div', { class: 'res none', text: t('ui.palette_none') })]));
      inp.setAttribute('aria-activedescendant', list[sel] ? '' : '');
      res.querySelector('.sel')?.scrollIntoView?.({ block: 'nearest' });
    };
    const go = (c) => { close(); setTimeout(() => C.run(c.id), 0); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, list.length - 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (list[sel]) go(list[sel]); }
      else if (e.key === 'Tab') { e.preventDefault(); }
    };
    inp.addEventListener('input', () => { sel = 0; draw(); });
    root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
    document.addEventListener('keydown', onKey, true);
    $('#app').append(root); draw(); inp.focus();
  };

  C.renderAll = () => { C.renderMenu(); C.renderTabs(); C.renderToolbar(); C.renderBrowser(); C.renderTimeline(); C.renderStatus(); C.renderEmpty(); };
  // boş durum: simge + bir cümle + tek eylem
  C.renderEmpty = () => {
    const el = $('#empty'); if (!el) return;
    const show = !app.doc.features.length && !app.sketchSession && !app.edit && !app.tool && !app.welcome;
    el.classList.toggle('hidden', !show);
    if (show) el.replaceChildren(h('div', { class: 'empty' }, h('span', { html: icon('sketch', 'lg') }), h('div', { class: 'et', text: t('ui.empty_title') }), h('div', { text: t('ui.empty_body') }), h('button', { class: 'btn primary', 'data-cmd': 'sketch', 'data-testid': 'empty-sketch', onclick: () => C.run('sketch') }, t('tb.sketch'))));
  };
  C.relang = () => { C.renderViewBtns(); C.renderAll(); };
  void LANGS; void LANG_KEY; void modal;
  return C;
}
