// Arayüz kabuğu: başlık şeridi (Dosya menüsü, geri al/yinele/kaydet, belge adı, komut arama, tezgâh, ayarlar, yardım), çalışma alanı sekmeleri,
// komut şeridi (gruplar, açılır alt menüler, son kullanılanlar, taşma menüsü), tarayıcı, zaman çizelgesi, durum çubuğu, görünüm küpü/düğmeleri,
// komut paleti. Tüm komutlar tek kayıt defterinde (cmds) durur: şerit, Dosya menüsü, palet ve taşma menüsü aynı tanımı kullanır.
// Test ve erişilebilirlik sözleşmesi: her komut düğmesi `data-cmd`, önemli parçalar `data-testid` taşır; metne bağlı seçici gerekmez.
import { h, $, ctxMenu, fmt, tip, hideTip, modal, modalOpen as modalUp } from './dom.js';
import { icon, featureIcon } from './icons.js';
import { featLabel, featSummary, historyGraph, fusedSketches, closure, tn, moveUnit, dropTargets, groupRanges, groupUnit } from './features.js';
import { t, tk, errText, getLang, LANGS, tLang } from '../shared/i18n.js';
import { getStr, setStr, prefs, setPref } from './prefs.js';
import logoReverse from '../../brand/logo/logo-horizontal-reverse.svg?url';

// Eskiz araç listeleri: [kimlik, etiket anahtarı, simge adı]
const FEAT_IDS = new Set(['sketch', 'extrude', 'revolve', 'hole', 'box', 'cylinder', 'sphere', 'fillet', 'chamfer', 'shell', 'combine', 'move', 'pattern', 'mirror', 'measure', 'props', 'interf', 'section', 'split', 'splitface', 'faceop', 'sweep', 'loft', 'rib', 'coil', 'draft', 'vfillet', 'thread']);
// Eskiz aracı ile model komutu aynı kimliği paylaşırsa eskiz komutu 'sk-' önekini alır.
import { ulAdd, ulProps } from './sketch/underlay.js'; // WP-22a: eskiz altlığı
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
const FEATURE_CMDS = ['sketch', 'extrude', 'revolve', 'hole', 'box', 'cylinder', 'sphere', 'fillet', 'chamfer', 'shell', 'combine', 'move', 'pattern', 'mirror', 'measure', 'props', 'interf', 'section', 'split', 'splitface', 'faceop', 'sweep', 'loft', 'rib', 'coil', 'draft', 'vfillet', 'thread'];
const DEFAULT_RECENT = ['extrude', 'fillet', 'hole', 'measure'];
const LANG_KEY = { tr: tk('lang.tr'), en: tk('lang.en') };

export function initChrome(app) {
  const C = {};
  const cmds = {};            // kimlik → {id, name, icon, kbd, tip, run, off(): neden | null, sk?: yalnız sketch kipi}
  C.cmds = cmds;
  const reg = (id, name, ic, run, o = {}) => { cmds[id] = { id, name, icon: ic, run, ...o }; return cmds[id]; };
  const label = (c) => (c.raw != null ? c.raw : t(c.name));
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
  reg('import-iges', 'menu.import_iges', 'import', () => app.importFile('iges')); // WP-19
  reg('import-dxf', 'menu.import_dxf', 'dxf-import', () => app.importDxf(), { off: inSketch });
  reg('export-step', 'menu.export_step', 'export', () => app.exportFile('step'));
  reg('export-stl', 'menu.export_stl', 'export', () => app.exportFile('stl'));
  reg('export-iges', 'menu.export_iges', 'export', () => app.exportFile('iges')); // WP-19
  reg('export-stl-fine', 'menu.export_stl_fine', 'export', () => app.exportFile('stl', { quality: 'fine' })); // F-26: ince ağ
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
  // WP-08 devir (c): görüntü modları, görünüş kaydet/çağır, çizim ayarları (komut paleti + Görünüm menüsü)
  for (const m of ['shaded', 'wire', 'ghost']) reg('vd-' + m, 'vd.' + m, m === 'wire' ? 'view-iso' : 'view-iso', () => app.viewport?.setDisplayMode(m));
  reg('view-save', 'cmd.view_save', 'view-iso', () => app.saveViewPrompt());
  reg('view-list', 'cmd.view_list', 'view-iso', () => app.showSettings('draw'));
  reg('draw-settings', 'cmd.draw_settings', 'settings', () => app.showSettings('draw'));
  reg('settings', 'menu.settings', 'settings', () => app.showSettings(), { kbd: 'Ctrl+,', tip: 'tip.settings' });
  reg('shortcuts', 'menu.shortcuts', 'keyboard', () => app.showShortcuts());
  reg('about', 'menu.about', 'info', () => app.showAbout());
  // WP-10 devri: günlük klasörü (yalnız masaüstü kabuğu sağlıyorsa) ve örnek belgeler (ornekler/*.mhnk; yoksa menüde görünmez)
  reg('open-logs', 'menu.open_logs', 'file-open', () => window.native?.openLogFolder?.());
  for (const ex of app.exampleList()) reg('ex-' + ex.key, 'menu.examples', 'file-open', () => app.openExample(ex.key), { raw: ex.name });
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
  // WP-08: bölme ve doğrudan düzenleme (şeritte "Doğrudan" açılır menüsü)
  feat('split', tk('tb.split'), 'split', 'split', null, needBody);
  feat('splitface', tk('tb.splitface'), 'splitface', 'splitface', null, needBody);
  feat('faceop', tk('tb.faceop'), 'faceop', 'faceop', null, needBody);
  // WP-19: şeritte "Form" açılır menüsü (tarama, loft, kaburga, helis, koniklik, değişken yuvarlatma, diş)
  feat('sweep', tk('tb.sweep'), 'sweep', 'sweep', null, needSketch);
  feat('loft', tk('tb.loft'), 'loft', 'loft', null, needSketch);
  feat('rib', tk('tb.rib'), 'rib', 'rib', null, needBody);
  feat('coil', tk('tb.coil'), 'coil', 'coil');
  feat('draft', tk('tb.draft'), 'draft', 'draft', null, needBody);
  feat('vfillet', tk('tb.vfillet'), 'vfillet', 'vfillet', null, needBody);
  feat('thread', tk('tb.thread'), 'thread', 'thread', null, needBody);
  reg('measure', 'tb.measure', 'measure', () => app.toggleTool('measure'), { tip: 'tip.measure', feature: true, tool: true, off: needBody });
  reg('props', 'tb.props', 'properties', () => app.toggleTool('props'), { tip: 'tip.props', feature: true, tool: true, off: needBody });
  reg('interf', 'tb.interf', 'interference', () => app.runInterference(), { tip: 'tip.interf', feature: true, off: needTwo });
  reg('section', 'tb.section', 'section', () => app.toggleSection(), { tip: 'tip.section', feature: true, off: needBody });
  // eskiz komutları (yalnız sketch kipinde şeritte)
  const skTool = ([id, nm, ic]) => reg(cid(id), nm, ic, () => app.sketchTool(id), { kbd: SHORT[id], tip: 'hint.' + id, sk: true, skTool: true });
  [...SK_DRAW, ...SK_DRAW_MORE, ...SK_EDIT, ...SK_EDIT_MORE, ...SK_DIMS, ...SK_DIMS_MORE].forEach(skTool);
  for (const [id, nm] of [...SK_CONS, ...SK_CONS_MORE]) reg('c-' + id, nm, id, () => app.sketchConstraint(id), { sk: true, tip: 'tip.con', tipParams: { name: nm } });
  reg('sk-text', tk('tb.text'), 'text', () => app.sketchText(), { sk: true, tip: 'tip.sk_text' }); // WP-08: eskiz metni
  // WP-22a: eskiz altlığı (PNG/JPEG/PDF): ekle, iki noktayla ölçekle, iki noktaya oturt, özellikler (saydamlık/görünürlük/kilit)
  const needUl = () => (app.sketcher?.underlay ? null : t('ul.none'));
  reg('sk-ul-add', tk('tb.ul_add'), 'import', () => ulAdd(app), { sk: true, tip: 'tip.ul_add' });
  reg('sk-ul-scale', tk('tb.ul_scale'), 'scale', () => app.sketchTool('ulscale'), { sk: true, tip: 'tip.ul_scale', off: needUl });
  reg('sk-ul-fit', tk('tb.ul_fit'), 'move', () => app.sketchTool('ulfit'), { sk: true, tip: 'tip.ul_fit', off: needUl });
  reg('sk-ul-props', tk('tb.ul_props'), 'properties', () => ulProps(app), { sk: true, tip: 'tip.ul_props', off: needUl });
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
    'new', 'open', ['recent'], ...(app.exampleList().length ? [{ submenu: 'menu.examples', items: app.exampleList().map((ex) => 'ex-' + ex.key) }, { sep: 1 }] : []), 'save', 'saveas', { sep: 1 }, 'import-step', 'import-stl', 'import-iges', 'import-dxf', { sep: 1 }, 'export-step', 'export-stl', 'export-stl-fine', 'export-iges', 'export-dxf', 'export-dxf12', { sep: 1 }, 'params', 'settings', 'home', { sep: 1 }, 'quit',
  ];
  const helpItems = () => ['shortcuts', ...(typeof window.native?.openLogFolder === 'function' ? ['open-logs'] : []), 'about'];
  const viewItems = () => ['fit', 'view-front', 'view-top', 'view-right', 'view-iso', { sep: 1 }, 'vd-shaded', 'vd-wire', 'vd-ghost', { sep: 1 }, 'view-save', 'view-list', 'planes', { sep: 1 }, 'draw-settings'];
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
      if (it.submenu) { // alt menü (Örnekler): düğme açar/kapar, içindekiler aşağıya açılır
        const wrap = h('div', { class: 'subwrap', 'data-testid': 'menu-examples' });
        const sb = h('button', { class: 'mi sub-toggle', role: 'menuitem', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-testid': 'menu-examples-toggle', onclick: (e) => { e.stopPropagation(); const o = wrap.classList.toggle('open'); sb.setAttribute('aria-expanded', o ? 'true' : 'false'); } },
          h('span', { html: icon('file-open', 'sm') }), h('span', { text: t(it.submenu) }), h('span', { class: 'kbd', html: icon('chevron-down', 'sm') }));
        sb.addEventListener('keydown', (e) => { if ((e.key === 'ArrowRight' && !wrap.classList.contains('open')) || (e.key === 'ArrowLeft' && wrap.classList.contains('open'))) { e.preventDefault(); e.stopPropagation(); sb.click(); } });
        wrap.append(sb, h('div', { class: 'sub', role: 'menu', 'data-testid': 'menu-examples-list' }, ...it.items.map((id) => menuBtn(cmds[id]))));
        drop.append(wrap); continue;
      }
      if (Array.isArray(it) && it[0] === 'recent') { C.recentMenu = h('div', { class: 'recent-sub', 'data-testid': 'recent-sub' }); drop.append(C.recentMenu); continue; }
      drop.append(menuBtn(cmds[it]));
    }
    m.append(b, drop);
    m.addEventListener('keydown', (e) => {
      if (!m.classList.contains('open')) return;
      const items2 = [...drop.querySelectorAll('.mi')].filter((x) => x.offsetParent !== null); const i = items2.indexOf(document.activeElement);
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
    const camM = app.mode === 'cam' ? app.cam.machine() : null;
    const machine = app.mode !== 'cam' ? null
      : h('button', { class: 'machine-chip', type: 'button', 'data-testid': 'machine', 'aria-label': t('ui.machine_label'), onclick: () => C.run('cam-machine') }, h('span', { html: icon(camM?.axes?.A ? 'axes-4' : 'axes-3') }), h('span', { text: camM ? app.cam.machineLabel(camM) : t('cam.br.machine_missing') }), h('small', { text: camM?.axes?.A ? t('cam.mc.axes4') : t('ui.axes3') }), h('span', { html: icon('chevron-down', 'sm') }));
    const helpMenu = dropdown('help', 'menu.help', 'help', helpItems(), 'menu-help', true); helpMenu.classList.add('right');
    bar.replaceChildren(
      h('div', { class: 'brand' }, h('img', { src: logoReverse, height: 22, alt: 'Mihenk', 'data-testid': 'brand' })),
      dropdown('file', 'menu.file', 'file-open', fileItems(), 'menu-file'), dropdown('view', 'menu.view', 'view-iso', viewItems(), 'menu-view'), h('span', { class: 'sep' }),
      tbtn('undo', 'undo'), tbtn('redo', 'redo'), tbtn('save', 'file-save'), doc, h('span', { class: 'grow' }), search, ...(machine ? [machine] : []), tbtn('settings', 'settings'), helpMenu);
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
    const tab = (id, ic, nm, on, soon, mode) => h('button', { class: 'tab', role: 'tab', 'data-testid': 'tab-' + id, 'aria-selected': on ? 'true' : 'false', 'aria-disabled': soon ? 'true' : null, tabindex: soon ? '0' : null, onclick: mode ? () => app.setMode(mode) : null },
      h('span', { html: icon(ic) }), h('span', { text: t(nm) }), soon ? h('span', { class: 'soon', text: t('ui.soon') }) : null);
    const cam = app.mode === 'cam', drw = app.mode === 'drawing'; // WP-17: teknik resim sekmesi etkin
    $('#tabs').replaceChildren(tab('design', 'workspace-design', 'ui.tab_design', !cam && !drw, false, 'design'), tab('manufacture', 'workspace-manufacture', 'ui.tab_manufacture', cam, false, 'cam'), tab('drawing', 'workspace-drawing', 'ui.tab_drawing', drw, false, 'drawing'),
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
  const ddItems = (id) => id === 'draw' ? [...SK_DRAW_MORE.map((x) => cid(x[0])), 'sk-text'] : id === 'edit' ? SK_EDIT_MORE.map((x) => cid(x[0])) : id === 'cons' ? [...SK_CONS_MORE.map((x) => 'c-' + x[0]), ...SK_DIMS_MORE.map((x) => cid(x[0]))] : id === 'ul' ? ['sk-ul-add', 'sk-ul-scale', 'sk-ul-fit', 'sk-ul-props'] : id === 'prim' ? ['box', 'cylinder', 'sphere'] : id === 'direct' ? ['split', 'splitface', 'faceop'] : id === 'form' ? ['sweep', 'loft', 'rib', 'coil', 'draft', 'vfillet', 'thread'] : [];
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
    if (app.mode === 'cam') { C.ddOpen = null; C.renderDD(); bar.classList.remove('sk'); bar.classList.add('cam'); bar.replaceChildren(...app.cam.ribbon({ group, toolBtn })); bar.querySelector('.rgroup.end').dataset.pin = '1'; C.fitRibbon(); return; }
    bar.classList.remove('cam');
    if (app.mode === 'drawing') { C.ddOpen = null; C.renderDD(); bar.classList.remove('sk'); bar.replaceChildren(...app.drawing.ribbon({ group, toolBtn })); bar.querySelector('.rgroup.end').dataset.pin = '1'; C.fitRibbon(); return; } // WP-17
    if (app.sketchSession) {
      const cur = sk?.tool;
      const tools = (list) => list.map((x) => toolBtn(cid(x[0]), { on: cur === x[0] }));
      const ids = (list) => list.map((x) => cid(x[0]));
      const consIds = [...SK_CONS.map((x) => 'c-' + x[0])];
      bar.replaceChildren(
        group('draw', tk('grp.draw'), [...tools(SK_DRAW), ddBtn('draw', tk('dd.draw'), 'more')], { items: [...ids(SK_DRAW), ...ids(SK_DRAW_MORE), 'sk-text'] }),
        group('edit', tk('grp.edit'), [...tools(SK_EDIT), ddBtn('edit', tk('dd.edit'), 'more')], { items: [...ids(SK_EDIT), ...ids(SK_EDIT_MORE)] }),
        group('dimcons', tk('grp.dimcons'), [...tools(SK_DIMS), h('div', { class: 'icongrid g6' }, [...consIds.map((id) => iconBtn(id)), iconBtn('c-construct', { on: !!sk?.consMode }), (() => { const b = h('button', { class: 'tool icon36' + (C.ddOpen === 'cons' ? ' on' : ''), 'data-cmd': 'dd-cons', 'data-testid': 'dd-cons', 'aria-haspopup': 'menu', 'aria-expanded': C.ddOpen === 'cons' ? 'true' : 'false', onclick: (e) => { e.stopPropagation(); C.ddOpen = C.ddOpen === 'cons' ? null : 'cons'; C.renderDD(); } }, h('span', { html: icon('more', 'lg') })); tip(b, { name: t('dd.cons'), body: t('tip.dd') }); return b; })()])],
          { items: [...ids(SK_DIMS), ...consIds, 'c-construct', ...SK_CONS_MORE.map((x) => 'c-' + x[0]), ...ids(SK_DIMS_MORE)] }),
        group('underlay', tk('grp.underlay'), [ddBtn('ul', tk('tb.underlay'), 'import')], { items: ['sk-ul-add', 'sk-ul-scale', 'sk-ul-fit', 'sk-ul-props'] }),
        group('sketch', tk('grp.sketch'), [toolBtn('sk-finish', { cls: 'primary' }), toolBtn('sk-cancel')], { cls: 'end', items: ['sk-finish', 'sk-cancel'] }));
      bar.querySelector('.rgroup.end').dataset.pin = '1';
      C.renderDD(); C.fitRibbon();
      return;
    }
    C.ddOpen = ['prim', 'direct', 'form'].includes(C.ddOpen) ? C.ddOpen : null;
    const on = (id) => (id === 'measure' || id === 'props' ? app.tool === id : id === 'sketch' ? app.tool === 'newsketch' : id === 'section' ? !!app.sectionPanel : false);
    const t1 = (id) => toolBtn(id, { on: on(id) });
    const recent = recentList();
    bar.replaceChildren(
      group('create', tk('grp.create'), [t1('sketch'), t1('extrude'), t1('revolve'), t1('hole'), ddBtn('prim', tk('tb.prim'), 'box'), ddBtn('form', tk('tb.form'), 'sweep')], { items: ['sketch', 'extrude', 'revolve', 'hole', 'box', 'cylinder', 'sphere', 'sweep', 'loft', 'rib', 'coil', 'draft', 'vfillet', 'thread'] }),
      group('modify', tk('grp.modify'), [...['fillet', 'chamfer', 'shell', 'combine', 'move', 'pattern', 'mirror'].map(t1), ddBtn('direct', tk('tb.direct'), 'faceop')], { items: ['fillet', 'chamfer', 'shell', 'combine', 'move', 'pattern', 'mirror', 'split', 'splitface', 'faceop'] }),
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
    // C-05: yönelimi izleyen görünüm küpü. Altı yüz (Üst/Alt/Ön/Arka/Sağ/Sol), on iki kenar ve sekiz köşe tıklanır (Fusion gibi).
    // Elemanlar bir kez kurulur, kamera değişince yalnız noktalar ve görünürlük güncellenir (klavye odağı kaybolmaz).
    const NS = 'http://www.w3.org/2000/svg'; const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; };
    const AX = ['x', 'y', 'z']; const FACES = [['right', 0, 1], ['left', 0, -1], ['back', 1, 1], ['front', 1, -1], ['top', 2, 1], ['bottom', 2, -1]]; // [ad, eksen, işaret]
    const vname = (a, sg) => FACES.find((f) => f[1] === a && f[2] === sg)[0];
    const svg = mk('svg', { viewBox: '0 0 80 80', 'aria-hidden': 'false' });
    const faceEls = FACES.map(([name, a, sg]) => {
      const g = mk('g', { class: `cube-face f-${name}`, 'data-view': name, tabindex: '0', role: 'button', 'aria-label': t('view.' + name) });
      const poly = mk('polygon'); const txt = mk('text', { 'text-anchor': 'middle' }); txt.textContent = t('view.' + name); g.append(poly, txt);
      const go = () => app.viewport.view(name); g.addEventListener('click', go); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      svg.append(g); return { name, a, sg, g, poly, txt };
    });
    const edgeEls = []; const cornerEls = [];
    for (let a = 0; a < 3; a++) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) { // kenar: a ekseni boyunca; diğer iki eksenin işaretleri s1, s2
      const b = (a + 1) % 3, c = (a + 2) % 3; const dir = [0, 0, 0]; dir[b] = s1; dir[c] = s2;
      const l = mk('line', { class: 'cube-edge', 'data-dir': dir.join(','), 'data-edge': `${vname(b, s1)}-${vname(c, s2)}`, 'aria-hidden': 'true' }); l.append(Object.assign(mk('title'), { textContent: t('view.' + vname(b, s1)) + ' + ' + t('view.' + vname(c, s2)) }));
      l.addEventListener('click', () => app.viewport.view(dir)); svg.append(l); edgeEls.push({ a, b, c, s1, s2, el: l });
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const dir = [sx, sy, sz]; const cEl = mk('circle', { class: 'cube-corner', r: '4', 'data-dir': dir.join(','), 'aria-hidden': 'true' });
      cEl.append(Object.assign(mk('title'), { textContent: [vname(0, sx), vname(1, sy), vname(2, sz)].map((n) => t('view.' + n)).join(' + ') }));
      cEl.addEventListener('click', () => app.viewport.view(dir)); svg.append(cEl); cornerEls.push({ dir, el: cEl });
    }
    const S = 18; // küp yarı kenarı (SVG birimi)
    C.updateCube = () => {
      const cam = app.viewport.camera; cam.updateMatrixWorld(); const m = cam.matrixWorld.elements;
      const right = [m[0], m[1], m[2]], up = [m[4], m[5], m[6]], back = [m[8], m[9], m[10]];
      const dot = (v, w) => v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
      const pt = (v) => [40 + S * dot(v, right), 40 - S * dot(v, up)];
      const vis = {}; // yüz görünür mü
      for (const f of faceEls) {
        const n = [0, 0, 0]; n[f.a] = f.sg; const k = dot(n, back); vis[f.a + ':' + f.sg] = k > 0.02;
        f.g.style.display = k > 0.02 ? '' : 'none';
        const b = (f.a + 1) % 3, c = (f.a + 2) % 3; const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, w]) => { const v = [0, 0, 0]; v[f.a] = f.sg; v[b] = u; v[c] = w; return pt(v); });
        f.poly.setAttribute('points', ring.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' '));
        const ctr = pt(n); f.txt.setAttribute('x', ctr[0].toFixed(1)); f.txt.setAttribute('y', (ctr[1] + 3).toFixed(1)); f.txt.style.opacity = k > 0.35 ? '1' : '0';
      }
      for (const e of edgeEls) {
        const f1 = vis[e.b + ':' + e.s1], f2 = vis[e.c + ':' + e.s2]; e.el.style.display = f1 || f2 ? '' : 'none';
        const p0 = [0, 0, 0], p1 = [0, 0, 0]; p0[e.b] = p1[e.b] = e.s1; p0[e.c] = p1[e.c] = e.s2; p0[e.a] = -1; p1[e.a] = 1;
        const a0 = pt(p0), a1 = pt(p1); e.el.setAttribute('x1', a0[0].toFixed(1)); e.el.setAttribute('y1', a0[1].toFixed(1)); e.el.setAttribute('x2', a1[0].toFixed(1)); e.el.setAttribute('y2', a1[1].toFixed(1));
      }
      for (const c of cornerEls) {
        c.el.style.display = [0, 1, 2].some((a) => vis[a + ':' + c.dir[a]]) ? '' : 'none';
        const p = pt(c.dir); c.el.setAttribute('cx', p[0].toFixed(1)); c.el.setAttribute('cy', p[1].toFixed(1));
      }
    };
    $('#viewcube').replaceChildren(svg); app.viewport.onView = C.updateCube; C.updateCube();
  };

  // ---------------------------------------------------------------- tarayıcı
  const activate = (el, fn) => { el.tabIndex = 0; el.setAttribute('role', 'button'); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } }); };
  const eye = (on, fn, title) => h('button', { class: 'tw vis' + (on ? '' : ' off'), 'data-testid': 'vis-toggle', 'aria-pressed': on ? 'true' : 'false', 'aria-label': t(title), onclick: (e) => { e.stopPropagation(); fn(); }, html: icon(on ? 'eye' : 'eye-off', 'sm') });
  const featureMenu = (e, f, i) => {
    e.preventDefault(); if (!C.inSel(f.id)) app.selectFeature(f.id);
    ctxMenu(e.clientX || 80, e.clientY || 80, [
      { id: 'ctx-edit', label: t('ctx.edit'), icon: 'sketch', kbd: 'Enter', run: () => app.editFeature(i) }, { id: 'ctx-rename', label: t('ctx.rename'), icon: 'rename', kbd: 'F2', run: () => app.renameFeature(i) },
      { id: 'ctx-suppress', label: f.suppressed ? t('ctx.unsuppress') : t('ctx.suppress'), icon: 'suppress', kbd: 'Ctrl+B', run: () => app.toggleSuppress(i) }, { id: 'ctx-rollback', label: t('ctx.rollback'), icon: 'rollback', run: () => app.rollbackTo(i + 1) },
      { id: 'ctx-move-up', label: t('ctx.move_up'), icon: 'chevron-up', kbd: 'Alt+Shift+↑', run: () => C.moveBy(i, -1) }, { id: 'ctx-move-down', label: t('ctx.move_down'), icon: 'chevron-down', kbd: 'Alt+Shift+↓', run: () => C.moveBy(i, 1) },
      { id: 'ctx-group', label: t('ctx.group'), icon: 'folder', kbd: 'Ctrl+G', run: () => C.groupSel() },
      { sep: 1 }, { id: 'ctx-delete', label: t('ctx.delete'), icon: 'trash', danger: true, kbd: 'Del', run: () => app.deleteFeature(i) }]);
  };
  C.featureMenu = featureMenu;
  // yeniden çizimde klavye odağı aynı geçmiş satırında / çipinde kalır
  const focusKey = (el) => (el?.dataset ? ['hist', 'id', 'group', 'marker'].map((k) => (el.dataset[k] != null ? k + '=' + el.dataset[k] : '')).find(Boolean) : '');
  const keepFocus = (root) => {
    const a = document.activeElement; const el = a && a.closest && a.closest(root + ' [data-hist], ' + root + ' .chip[data-id], ' + root + ' [data-group], ' + root + ' [data-marker]');
    const k = el && el === a ? focusKey(el) : '';
    return () => { if (!k) return; const [n, v] = k.split('='); const css = n === 'id' ? '.chip[data-id' : '[data-' + n; const nx = document.querySelector(root + ' ' + css + '="' + CSS.escape(v) + '"]'); if (nx) nx.focus({ preventScroll: true }); };
  };
  C.renderBrowser = () => {
    const br = $('#browser'); const doc = app.doc, res = app.result;
    if (app.mode === 'cam') { app.cam.renderBrowser(br); return; }
    if (app.mode === 'drawing') { app.drawing.renderBrowser(br); return; } // WP-17
    const sec = (title, action) => h('div', { class: 'bsec' }, h('span', { text: title }), action || null);
    const note = (txt) => h('div', { class: 'trow empty', text: txt });
    const params = (doc.params || []).map((p) => {
      const v = res?.vars?.[p.name]; const er = res?.paramErrors?.[p.name];
      return h('div', { class: 'trow' + (er ? ' err' : ''), 'data-param': p.name, title: er ? errText(er) : p.expr + (p.note ? ' — ' + p.note : '') }, h('span', { class: 'tw' }, er ? h('span', { html: icon('error', 'sm') }) : null), h('span', { class: 'nm mono', text: p.name }), h('span', { class: 'val num', text: er ? t('br.err') : '= ' + fmt(v, 4) + ' mm' }));
    });
    const bodies = (res?.bodies || []).map((b) => { const r = h('div', { class: 'trow' + (app.selection.some((s) => s.kind === 'body' && s.body === b.id) ? ' sel' : '') + (app.hiddenBodies.has(b.id) ? ' hidden-item' : ''), 'data-body': b.id, 'data-testid': 'row-body', onclick: () => app.selectBody(b.id), ondblclick: () => app.renameBody(b.id) },
      eye(!app.hiddenBodies.has(b.id), () => app.toggleBody(b.id), tk('br.eye')), h('span', { class: 'nm', text: app.bodyName(b.id) }), h('span', { class: 'val num', text: fmt(b.volume / 1000, 2) + ' cm³' })); activate(r, () => app.selectBody(b.id)); return r; });
    const fk = keepFocus('#browser');
    br.replaceChildren(
      sec(t('br.params'), h('button', { class: 'btn sm', id: 'br-params', 'data-cmd': 'params', onclick: () => C.run('params') }, t('br.edit'))), ...(params.length ? params : [note(t('br.no_params'))]),
      sec(t('br.origin')), (() => { const r = h('div', { class: 'trow' }, eye(app.planesVisible, () => app.togglePlanes(), tk('br.eye_planes')), h('span', { class: 'nm', text: t('br.planes_axes') })); return r; })(),
      sec(t('br.bodies')), ...(bodies.length ? bodies : [note(t('br.no_bodies'))]),
      sec(t('hs.title'), app.marks.changed.size ? h('button', { class: 'btn sm', 'data-testid': 'hist-clear', onclick: () => app.clearMarks(), title: t('hs.clear_tip') }, t('hs.clear')) : null),
      h('div', { class: 'hist', role: 'list', 'data-testid': 'hist', 'aria-label': t('hs.title') }, ...historyRows()));
    fk(); C.markDeps();
  };

  // ---------------------------------------------------------------- geçmiş: ortak durum (şerit + panel aynı veriyi paylaşır)
  // Durum işaretleri renk dışında simge + desen + metinle de ayrışır (ekran okuyucuya metin).
  const MARK_ICON = { error: 'error', warn: 'warning', changed: 'changed', sup: 'suppress', pending: 'clock', computing: 'refresh' };
  C.hist = () => {
    const doc = app.doc, res = app.result; const key = app._histKey;
    const k2 = [doc, res, doc.rollback, doc.features.length, doc.features, doc.groups];
    if (key && key.every((x, i) => x === k2[i]) && app._hist) return app._hist;
    const fused = fusedSketches(doc); const fusedBy = new Map([...fused].map(([sk, f]) => [f, sk]));
    const graph = historyGraph(doc, res?.status || {});
    const maxMs = Math.max(1, ...Object.values(res?.featInfo || {}).map((x) => x.ms || 0));
    const groups = groupRanges(doc); const groupBy = new Map(); for (const r of groups) for (const id of r.ids) groupBy.set(id, r);
    app._histKey = k2; app._hist = { fused, fusedBy, graph, maxMs, groups, groupBy }; return app._hist;
  };
  // Bir işlemin görünen durumu. Kaynak: süpürme sırasında çekirdeğin ilerleme bildirimi; düzenlemede "Son hali" açıksa
  // sağdaki işlemler için son model; yoksa son sonuç. "Değişti" düzenleme/süpürme sırasında düzenleme öncesi özetle karşılaştırılır.
  C.featState = (f, i) => {
    const doc = app.doc, res = app.result;
    const SS = app.sketchSession && !app.sketchSession.isNew ? app.sketchSession : null;
    const ed = app.edit && !app.edit.closed ? app.edit : SS ? { isNew: false, idx: SS.idx, at: SS.idx, draft: SS.draft } : null;
    const editing = !!(ed && !ed.isNew && ed.idx === i);
    const after = !!(ed && (ed.isNew ? i >= ed.at : i > ed.at));
    const SW = app.sweep && i >= app.sweep.at ? app.sweep : null; const P = SW ? SW.done.get(f.id) : null;
    const useFinal = after && app.showFinal && app.finalResult;
    const R = useFinal ? app.finalResult : res;
    const st = SW ? (P ? { ok: P.ok, error: P.error, suppressed: P.suppressed } : null) : R?.status?.[f.id];
    const info = SW ? P : R?.featInfo?.[f.id];
    const rb = doc.rollback;
    const computing = !!(SW && !P && SW.cur === f.id);
    const pending = (rb != null && i >= rb) || (after && !useFinal) || !!(SW && !P && !computing);
    const marks = [];
    if (computing) marks.push({ k: 'computing', text: t('hs.st_computing') });
    if (f.suppressed) marks.push({ k: 'sup', text: t('hs.st_suppressed') });
    if (pending && !f.suppressed) marks.push({ k: 'pending', text: t('hs.st_pending') });
    const bad = !pending && !computing && !!st && st.ok === false;
    if (bad) marks.push({ k: 'error', text: t('hs.st_error'), why: errText(st.error) });
    const warns = [...(info?.warn || []).map((w) => t('warn.' + w.code, w.params || {})), ...(f.type === 'sketch' && app.problems[f.id] ? [app.problems[f.id]] : [])];
    const live = !pending && !computing;
    if (!bad && live && warns.length) marks.push({ k: 'warn', text: t('hs.st_warn'), why: warns.join(' · ') });
    const base = SW ? SW.base : ed ? app.sums : null;
    const changed = live && (base ? !!(info && base.has(f.id) && base.get(f.id) !== info.sum) : app.marks.changed.has(f.id));
    if (!bad && changed) marks.push({ k: 'changed', text: t('hs.st_changed') });
    const cls = (app.selFeature === f.id ? ' sel' : '') + (bad ? ' err' : '') + (f.suppressed ? ' sup' : '') + (pending ? ' rolled' : '') + (editing ? ' editing' : '') +
      (marks.some((m) => m.k === 'warn') ? ' warn' : '') + (marks.some((m) => m.k === 'changed') ? ' changed' : '') + (computing ? ' computing' : '');
    const ms = info && live ? info.ms : null;
    return { st, info, bad, pending, editing, marks, cls, ms, summary: featSummary(editing ? ed.draft : f, res?.vars || app.vars(), (v) => fmt(v, 3)) };
  };
  const markEl = (m) => h('span', { class: 'mk mk-' + m.k, 'data-mark': m.k, title: m.why || m.text }, h('span', { html: icon(MARK_ICON[m.k], 'sm') }), h('span', { class: 'sr-only', text: m.text + (m.why ? ': ' + m.why : '') }));
  // CSP: satır içi style özniteliği yasak; özel özellik CSSOM ile yazılır
  const cssVar = (el, k, v) => { el.style.setProperty(k, v); return el; };
  const msBar = (ms) => (ms == null ? null : cssVar(h('i', { class: 'msbar', 'aria-hidden': 'true' }), '--ms', Math.max(0.04, Math.min(1, ms / C.hist().maxMs)).toFixed(3)));
  const msText = (ms) => (ms == null ? '' : t('hs.ms', { t: ms < 10 ? fmt(ms, 1) : String(Math.round(ms)) }));
  const titleOf = (f, S) => (S.bad ? errText(S.st.error) : [f.name || f.id, S.summary, ...S.marks.map((m) => m.text + (m.why ? ': ' + m.why : '')), msText(S.ms)].filter(Boolean).join(' — '));
  // satır: [aç/kapa] [simge] ad · özet [işaretler] + süre çubuğu; hata varsa altında neden satırı
  const historyRows = () => {
    const doc = app.doc; const H = C.hist(); const rows = [];
    doc.features.forEach((f, i) => {
      const G = H.groupBy.get(f.id);
      if (G && G.a === i) rows.push(groupRow(G));
      if (G && !app.groupOpen.has(G.id)) return;
      if (H.fused.has(f.id)) return;
      const S = C.featState(f, i); const skId = H.fusedBy.get(f.id); const sk = skId ? doc.features.find((x) => x.id === skId) : null;
      const open = sk && app.histOpen.has(f.id);
      const row = h('div', { class: 'trow hrow' + S.cls, role: 'listitem', 'data-hist': f.id, 'data-i': i, 'data-testid': 'hist-row', 'aria-current': app.selFeature === f.id ? 'true' : null, title: titleOf(f, S), ...(f.type === 'sketch' ? { 'data-sketch': f.id } : {}),
        onclick: () => app.selectFeature(f.id), ondblclick: () => app.editFeature(i), oncontextmenu: (e) => featureMenu(e, f, i), onmouseenter: () => C.hoverFeature(f.id), onmouseleave: () => C.hoverFeature(null) },
        sk ? h('button', { class: 'tw disc', type: 'button', tabindex: '-1', 'data-testid': 'hist-disc', 'aria-expanded': open ? 'true' : 'false', 'aria-label': t(open ? 'hs.collapse' : 'hs.expand', { name: sk.name || sk.id }), onclick: (e) => { e.stopPropagation(); app.toggleHistOpen(f.id); }, html: icon(open ? 'chevron-down' : 'chevron-right', 'sm') }) : null,
        h('span', { class: 'hic', html: S.bad ? icon('error', 'sm') : featureIcon(f) }),
        sk ? h('button', { class: 'tw sk-badge', type: 'button', tabindex: '-1', 'data-sketch': sk.id, 'data-testid': 'hist-sketch-badge', 'aria-label': t('hs.sketch_badge', { name: sk.name || sk.id }), title: t('hs.sketch_badge', { name: sk.name || sk.id }), onclick: (e) => { e.stopPropagation(); app.selectFeature(sk.id); }, ondblclick: (e) => { e.stopPropagation(); app.editFeature(doc.features.indexOf(sk)); }, html: icon('sketch', 'sm') }) : null,
        h('span', { class: 'nm' }, h('span', { class: 'hn', text: f.name || featLabel(f) }), S.summary ? h('span', { class: 'hs', text: S.summary }) : null),
        ...(S.editing ? [h('span', { class: 'tag', text: t('tl.editing') })] : []),
        ...S.marks.filter((m) => m.k !== 'pending').map(markEl), msBar(S.ms));
      if (G) cssVar(row, '--depth', '1');
      if (C.inSel(f.id)) { row.classList.add('insel'); row.setAttribute('aria-selected', 'true'); }
      row.addEventListener('click', (e) => { if (e.shiftKey) { e.preventDefault(); e.stopPropagation(); C.extendSel(row); C.focusItem(false, 'hist=' + f.id); } }, true);
      histItem(row); bindDrag(row, i, false);
      rows.push(row);
      if (S.bad) rows.push(h('div', { class: 'hwhy', role: 'note', 'data-testid': 'hist-why', 'data-for': f.id }, h('span', { text: errText(S.st.error) }),
        f.type !== 'sketch' && f.type !== 'import' ? h('button', { class: 'btn sm', type: 'button', 'data-testid': 'hist-repair', onclick: () => app.repairFeature(f.id) }, t('hs.repair')) : null));
      if (open) {
        const j = doc.features.indexOf(sk); const SS = C.featState(sk, j);
        const child = h('div', { class: 'trow hrow child' + SS.cls, role: 'listitem', 'data-hist': sk.id, 'data-i': j, 'data-sketch': sk.id, 'data-testid': 'hist-row', title: titleOf(sk, SS),
          onclick: () => app.selectFeature(sk.id), ondblclick: () => app.editFeature(j), oncontextmenu: (e) => featureMenu(e, sk, j), onmouseenter: () => C.hoverFeature(sk.id), onmouseleave: () => C.hoverFeature(null) },
          eye(!app.hiddenSketches.has(sk.id), () => app.toggleSketch(sk.id), tk('br.eye')), h('span', { class: 'nm' }, h('span', { class: 'hn', text: sk.name || sk.id }), SS.summary ? h('span', { class: 'hs', text: SS.summary }) : null), ...SS.marks.filter((m) => m.k !== 'pending').map(markEl));
        cssVar(child, '--depth', G ? '2' : '1'); histItem(child); bindDrag(child, j, false, false); rows.push(child);
      }
    });
    if (!rows.length) rows.push(h('div', { class: 'trow empty', text: t('hs.empty') }));
    roving(rows.filter((r) => r.dataset.hist || r.dataset.group), (r) => r.dataset.hist || r.dataset.group);
    return rows;
  };
  // ---------------------------------------------------------------- WP-02 dilim 4: gruplar
  // Grup satırı: [aç/kapa] [klasör] ad · "n işlem" + üyelerin toplanmış durum işaretleri. Kapalı grup şeritte tek çiptir.
  C.groupHas = (gid, id) => !!C.hist().groups.find((r) => r.id === gid)?.ids.includes(id);
  C.groupState = (r) => {
    const doc = app.doc; const S = r.ids.map((id) => { const i = doc.features.findIndex((f) => f.id === id); return C.featState(doc.features[i], i); });
    const cnt = (k) => S.filter((x) => x.marks.some((m) => m.k === k)).length; const marks = [];
    if (cnt('computing')) marks.push({ k: 'computing', text: t('hs.st_computing') });
    if (cnt('sup') === S.length) marks.push({ k: 'sup', text: t('hs.st_suppressed') });
    if (cnt('pending') === S.length) marks.push({ k: 'pending', text: t('hs.st_pending') });
    const e = cnt('error'), w = cnt('warn'), c = cnt('changed');
    if (e) marks.push({ k: 'error', text: tn('hs.g_err', e) }); if (w) marks.push({ k: 'warn', text: tn('hs.g_warn', w) }); if (c) marks.push({ k: 'changed', text: tn('hs.g_changed', c) });
    const cls = (app.selGroup === r.id ? ' sel' : '') + (e ? ' err' : '') + (cnt('sup') === S.length ? ' sup' : '') + (cnt('pending') === S.length ? ' rolled' : '') + (!e && w ? ' warn' : '') + (!e && c ? ' changed' : '');
    return { marks, cls, bad: !!e, count: tn('hs.g_count', r.ids.filter((x) => !C.hist().fused.has(x)).length) };
  };
  const groupMenu = (e, r) => {
    e.preventDefault(); C.selectGroup(r.id);
    ctxMenu(e.clientX || 80, e.clientY || 80, [
      { id: 'ctx-group-toggle', label: app.groupOpen.has(r.id) ? t('ctx.group_close') : t('ctx.group_open'), icon: app.groupOpen.has(r.id) ? 'chevron-up' : 'chevron-down', kbd: 'Enter', run: () => app.toggleGroup(r.id) },
      { id: 'ctx-group-rename', label: t('ctx.rename'), icon: 'rename', kbd: 'F2', run: () => app.renameGroup(r.id) },
      { sep: 1 }, { id: 'ctx-ungroup', label: t('ctx.ungroup'), icon: 'close', kbd: 'Ctrl+Shift+G', run: () => app.ungroup(r.id) }]);
  };
  const groupEl = (r, horiz) => {
    const S = C.groupState(r); const open = app.groupOpen.has(r.id);
    const label = [r.name || r.id, S.count, ...S.marks.map((m) => m.text)].filter(Boolean).join(' — ');
    const el = horiz
      ? h('button', { class: 'chip gchip' + (open ? ' open' : '') + S.cls, type: 'button', 'data-group': r.id, 'data-testid': 'hist-group-chip', 'aria-expanded': open ? 'true' : 'false', title: label },
        h('span', { class: 'cic', html: icon('folder', 'sm') }), h('span', { class: 'gnm', text: r.name || r.id }), h('span', { class: 'sr-only', text: S.count }),
        ...S.marks.filter((m) => m.k !== 'pending').map(markEl))
      : h('div', { class: 'trow hrow hgroup' + S.cls, 'data-group': r.id, 'data-testid': 'hist-group', 'aria-expanded': open ? 'true' : 'false', title: label },
        h('button', { class: 'tw disc', type: 'button', tabindex: '-1', 'aria-label': t(open ? 'hs.g_collapse' : 'hs.g_expand', { name: r.name || r.id }), onclick: (e) => { e.stopPropagation(); app.toggleGroup(r.id); }, html: icon(open ? 'chevron-down' : 'chevron-right', 'sm') }),
        h('span', { class: 'hic', html: icon('folder', 'sm') }), h('span', { class: 'nm' }, h('span', { class: 'hn', text: r.name || r.id }), h('span', { class: 'hs', text: S.count })),
        ...S.marks.filter((m) => m.k !== 'pending').map(markEl));
    if (!horiz) { el.tabIndex = -1; el.setAttribute('role', 'button'); }
    el.addEventListener('click', (e) => { if (horiz) app.toggleGroup(r.id); C.selectGroup(r.id); C.focusItem(horiz, 'group=' + r.id); });
    if (!horiz) el.addEventListener('dblclick', () => app.renameGroup(r.id));
    el.addEventListener('contextmenu', (e) => groupMenu(e, r));
    el.addEventListener('keydown', (e) => C.groupKey(e, r, horiz));
    // WP-08 devir (e): grup bütün olarak sürüklenir (bırakma aralıkları işlem satırları/çipleri üzerinde, aynı kurallarla)
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      if (app.edit || app.sketchSession || app.mode !== 'design' || app.welcome) { e.preventDefault(); return; }
      const unit = groupUnit(app.doc, r.id); if (!unit.length) { e.preventDefault(); return; }
      app.drag = { i: unit[0], id: app.doc.features[unit[0]].id, group: r.id, unit, targets: dropTargets(app.doc, unit[0], app.result?.status || {}, unit) };
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id);
      document.body.classList.add('hist-dragging'); markGaps();
    });
    el.addEventListener('dragend', endDrag);
    return el;
  };
  const groupRow = (r) => groupEl(r, false);
  C.selectGroup = (gid) => { app.selFeature = null; app.selAnchor = null; app.selGroup = gid; C.renderTimeline(); C.renderBrowser(); };
  // aralık seçimi (Shift+tık, Shift+↑/↓): bağlantı noktası ile seçili işlem arasındaki satırlar
  C.selIds = () => {
    const a = app.selAnchor, b = app.selFeature; if (!a || !b) return b ? [b] : [];
    const F = app.doc.features; const i = F.findIndex((f) => f.id === a), j = F.findIndex((f) => f.id === b); if (i < 0 || j < 0) return [b];
    const lo = Math.min(unitA(i), unitA(j)), hi = Math.max(i, j); return F.slice(lo, hi + 1).map((f) => f.id);
  };
  C.inSel = (id) => !!app.selAnchor && C.selIds().includes(id);
  C.extendSel = (el) => {
    const id = el.dataset.hist || el.dataset.id; if (!id) return;
    const H = C.hist(); const cid = H.fused.get(id) || id;
    if (!app.selAnchor) app.selAnchor = app.selFeature || cid;
    app.selGroup = null; app.selFeature = cid; C.renderTimeline(); C.renderBrowser();
  };
  C.groupSel = () => {
    const ids = C.selIds(); if (!ids.length) return;
    return app.createGroup(ids);
  };
  C.groupKey = async (e, r, horiz) => {
    if (app.edit || app.sketchSession || modalUp() || app.mode !== 'design') return;
    const k = e.key; const stop = () => { e.preventDefault(); e.stopPropagation(); };
    const prevK = horiz ? 'ArrowLeft' : 'ArrowUp', nextK = horiz ? 'ArrowRight' : 'ArrowDown';
    if (!e.ctrlKey && !e.altKey && [prevK, nextK, 'Home', 'End'].includes(k)) {
      stop(); const L = navList(horiz); const at = L.indexOf(e.currentTarget);
      const tgt = L[Math.max(0, Math.min(L.length - 1, k === 'Home' ? 0 : k === 'End' ? L.length - 1 : at + (k === prevK ? -1 : 1)))]; if (!tgt || tgt === e.currentTarget) return;
      const key = keyOfEl(tgt); if (tgt.dataset.group) C.selectGroup(tgt.dataset.group); else app.selectFeature(tgt.dataset.hist || tgt.dataset.id); C.focusItem(horiz, key); return;
    }
    if (!horiz && (k === 'ArrowLeft' || k === 'ArrowRight')) { stop(); const open = app.groupOpen.has(r.id); if ((k === 'ArrowRight') !== open) app.toggleGroup(r.id); else if (open && k === 'ArrowRight') { const first = r.ids.find((x) => !C.hist().fused.has(x)); app.selectFeature(first); C.focusItem(false, 'hist=' + first); return; } C.focusItem(horiz, 'group=' + r.id); return; }
    if (k === 'Enter' || k === ' ') { stop(); app.toggleGroup(r.id); C.focusItem(horiz, 'group=' + r.id); return; }
    if (k === 'F2') { stop(); await app.renameGroup(r.id); C.focusItem(horiz, 'group=' + r.id); return; }
    if (e.ctrlKey && e.shiftKey && k.toLowerCase() === 'g') { stop(); await app.ungroup(r.id); C.focusItem(horiz, 'hist=' + r.ids.find((x) => !C.hist().fused.has(x))); return; }
    if (k === 'ContextMenu' || (e.shiftKey && k === 'F10')) { stop(); const b = e.currentTarget.getBoundingClientRect(); groupMenu({ preventDefault() {}, clientX: b.left + 16, clientY: b.bottom }, r); }
  };
  // bağımlılık vurgusu: seçili ya da üstüne gelinen işlemin ataları (dep-up) ve torunları (dep-down); ilgisizler soluk
  C.hoverFeature = (id) => { app.hoverFeature = id; C.markDeps(); };
  C.depInfo = (id) => {
    const H = C.hist(); if (!id || !H.graph.up.has(id)) return null;
    const up = closure(H.graph.up, id), down = closure(H.graph.down, id);
    // kaynaşmış eskiz kendi tüketicisiyle aynı satırdadır
    for (const [sk, f] of H.fused) { if (up.has(sk) && f === id) up.delete(sk); }
    return { up, down };
  };
  C.markDeps = () => {
    const id = app.hoverFeature || (app.edit ? null : app.selFeature); const D = C.depInfo(id);
    for (const el of document.querySelectorAll('#timeline .chip[data-id], #browser .hrow[data-hist]')) {
      const x = el.dataset.id || el.dataset.hist;
      el.classList.toggle('dep-up', !!D && D.up.has(x)); el.classList.toggle('dep-down', !!D && D.down.has(x));
      el.classList.toggle('dep-dim', !!D && x !== id && !D.up.has(x) && !D.down.has(x) && !(C.hist().fusedBy.get(id) === x));
      el.toggleAttribute('data-dep', !!D && (D.up.has(x) || D.down.has(x)));
      if (D && (D.up.has(x) || D.down.has(x))) el.dataset.dep = D.up.has(x) ? 'up' : 'down';
    }
    const seg = document.querySelector('[data-testid="st-deps"]');
    if (seg) { const txt = C.depText(id, D); seg.textContent = txt; seg.title = txt; seg.hidden = !txt; }
  };
  C.depText = (id, D) => {
    const f = id && app.doc.features.find((x) => x.id === id); if (!f || !D) return '';
    const by = new Map(); for (const x of D.down) { const g = app.doc.features.find((y) => y.id === x); if (!g) continue; const l = featLabel(g); by.set(l, (by.get(l) || 0) + 1); }
    const name = f.name || featLabel(f);
    if (!D.down.size) return t('hs.deps_none', { name });
    return tn('hs.deps', D.down.size, { name, list: [...by].map(([l, n]) => n + ' ' + l).join(', ') });
  };

  // ---------------------------------------------------------------- WP-02 dilim 4: sürükleyerek sıra değiştirme
  // Bırakılabilir aralıklar yeşil (düz çizgi), bağımlılığı bozacak aralıklar kırmızı kesik çizgi + neden (ipucu ve ekran okuyucu).
  const unitA = (i) => Math.min(...moveUnit(app.doc, i));
  const dragList = (box) => [...box.querySelectorAll(box.id === 'timeline' ? '.chip[data-i]' : '.hrow[data-i]:not(.child)')];
  const gapAt = (el, e, horiz) => {
    const r = el.getBoundingClientRect(); const before = horiz ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
    if (before) return { gap: unitA(+el.dataset.i), before: true };
    const list = dragList(el.closest('#timeline, #browser')); const nx = list[list.indexOf(el) + 1];
    return { gap: nx ? unitA(+nx.dataset.i) : app.doc.features.length, before: false };
  };
  C.announce = (txt) => {
    let el = document.getElementById('hist-live');
    if (!el) { el = h('div', { id: 'hist-live', class: 'sr-only', role: 'status', 'aria-live': 'polite', 'data-testid': 'hist-live' }); document.body.append(el); }
    el.textContent = ''; el.textContent = txt;
  };
  const clearDrop = () => { for (const el of document.querySelectorAll('.drop-before, .drop-after')) el.classList.remove('drop-before', 'drop-after', 'drop-no'); };
  const markGaps = () => {
    const D = app.drag; if (!D) return;
    for (const box of [$('#timeline'), $('#browser')]) {
      const list = dragList(box);
      list.forEach((el) => { const P = D.targets[unitA(+el.dataset.i)]; el.dataset.gap = !P || P.noop ? 'same' : P.ok ? (P.sensitive?.length ? 'warn' : 'ok') : 'no'; if (P && !P.ok) el.dataset.why = app.moveWhy(P.why); else delete el.dataset.why; });
      const last = list[list.length - 1]; const P = D.targets[app.doc.features.length];
      if (last) last.dataset.gapEnd = !P || P.noop ? 'same' : P.ok ? (P.sensitive?.length ? 'warn' : 'ok') : 'no';
    }
  };
  const endDrag = () => {
    if (!app.drag) return; app.drag = null; clearDrop(); document.body.classList.remove('hist-dragging');
    for (const el of document.querySelectorAll('[data-gap], [data-gap-end]')) { delete el.dataset.gap; delete el.dataset.gapEnd; delete el.dataset.why; }
    app.refreshHint();
  };
  C.endDrag = endDrag;
  const bindDrag = (el, i, horiz, drag = true) => {
    el.addEventListener('keydown', (e) => C.histKey(e, i, horiz));
    if (!drag) return;
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      if (app.edit || app.sketchSession || app.mode !== 'design' || app.welcome) { e.preventDefault(); return; }
      const f = app.doc.features[i]; app.drag = { i, id: f.id, targets: dropTargets(app.doc, i, app.result?.status || {}) };
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.id);
      document.body.classList.add('hist-dragging'); markGaps();
    });
    el.addEventListener('dragover', (e) => {
      const D = app.drag; if (!D) return;
      const g = gapAt(el, e, horiz); const P = D.targets[g.gap];
      clearDrop(); el.classList.add(g.before ? 'drop-before' : 'drop-after'); if (P && !P.ok) el.classList.add('drop-no');
      const why = P && !P.ok ? app.moveWhy(P.why) : P && P.ok && !P.noop && P.sensitive?.length ? app.sensWhy(P.sensitive) : '';
      if (why !== D.why) { D.why = why; app.setHint(why); if (why) C.announce(why); }
      if (P && P.ok) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } else e.dataTransfer.dropEffect = 'none';
    });
    el.addEventListener('drop', (e) => {
      const D = app.drag; if (!D) return; e.preventDefault();
      const g = gapAt(el, e, horiz); const P = D.targets[g.gap]; endDrag();
      if (P && P.ok && !P.noop) app.moveFeature(D.i, g.gap, D.unit || null);
    });
    el.addEventListener('dragend', endDrag);
  };
  // ---------------------------------------------------------------- WP-02 dilim 4: klavye
  // Geçmiş listesi ve şerit tek sekme durağıdır (gezici tabindex); ok tuşları gezinir, seçim odağı izler.
  // Enter düzenle · Boşluk seç · Del sil · F2 adlandır · Ctrl+B bastır · ←/→ (panel) aç/kapa · Shift+F10 bağlam menüsü · Alt+Shift+Ok taşı.
  const histItem = (el) => { el.tabIndex = -1; el.setAttribute('role', 'button'); };
  const roving = (list, keyOf) => {
    const sel = app.selFeature; const cur = list.find((x) => keyOf(x) === sel) || list.find((x) => x.dataset.group && C.groupHas?.(x.dataset.group, sel)) || list[0];
    for (const x of list) x.tabIndex = x === cur ? 0 : -1;
  };
  const navList = (horiz) => [...document.querySelectorAll(horiz ? '#timeline .chip[data-id], #timeline [data-group]' : '#browser .hist [data-hist], #browser .hist [data-group]')];
  const keyOfEl = (el) => (el.dataset.group ? 'group=' + el.dataset.group : el.dataset.hist ? 'hist=' + el.dataset.hist : 'id=' + el.dataset.id);
  C.focusItem = (horiz, key) => {
    if (!key) return; const [n, v] = key.split('='); const root = horiz ? '#timeline' : '#browser';
    const el = document.querySelector(root + ' ' + (n === 'id' ? '.chip[data-id' : '[data-' + n) + '="' + CSS.escape(v) + '"]');
    if (el) { el.focus({ preventScroll: false }); el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
  };
  C.histKey = async (e, i, horiz) => {
    if (app.edit || app.sketchSession || modalUp() || app.mode !== 'design' || e.defaultPrevented) return;
    const k = e.key; const el = e.currentTarget; const f = app.doc.features[i]; if (!f) return;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.altKey && e.shiftKey && ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(k)) { stop(); await C.moveBy(i, k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 1); C.focusItem(horiz, keyOfEl(el)); return; }
    if (e.altKey || e.metaKey) return;
    const prevK = horiz ? 'ArrowLeft' : 'ArrowUp', nextK = horiz ? 'ArrowRight' : 'ArrowDown';
    if (!e.ctrlKey && [prevK, nextK, 'Home', 'End'].includes(k)) {
      stop(); const L = navList(horiz); const at = L.indexOf(el);
      const to = Math.max(0, Math.min(L.length - 1, k === 'Home' ? 0 : k === 'End' ? L.length - 1 : at + (k === prevK ? -1 : 1)));
      const tgt = L[to]; if (!tgt || tgt === el) return;
      const key = keyOfEl(tgt);
      if (e.shiftKey && C.extendSel) C.extendSel(tgt); else if (tgt.dataset.group) C.selectGroup?.(tgt.dataset.group); else app.selectFeature(tgt.dataset.hist || tgt.dataset.id);
      C.focusItem(horiz, key); return;
    }
    const H = C.hist();
    if (!horiz && !e.ctrlKey && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      stop();
      if (el.classList.contains('child')) { if (k === 'ArrowLeft') { const c = H.fused.get(f.id); app.selectFeature(c); C.focusItem(false, 'hist=' + c); } return; }
      if (H.fusedBy.has(f.id)) {
        const open = app.histOpen.has(f.id);
        if (k === 'ArrowRight' && !open) { app.toggleHistOpen(f.id); C.focusItem(false, 'hist=' + f.id); }
        else if (k === 'ArrowLeft' && open) { app.toggleHistOpen(f.id); C.focusItem(false, 'hist=' + f.id); }
        else if (k === 'ArrowRight' && open) { const sk = H.fusedBy.get(f.id); app.selectFeature(sk); C.focusItem(false, 'hist=' + sk); }
      }
      return;
    }
    if (k === 'Enter' && !e.ctrlKey && !e.shiftKey) { stop(); app.editFeature(i); return; }
    if (k === ' ' && !e.ctrlKey) { stop(); app.selectFeature(f.id); C.focusItem(horiz, keyOfEl(el)); return; }
    if (k === 'Delete' && !e.ctrlKey) {
      stop(); const L = navList(horiz); const at = L.indexOf(el); const nb = L[at + 1] || L[at - 1]; const nk = nb ? keyOfEl(nb) : null;
      const n0 = app.doc.features.length; await app.deleteFeature(i);
      C.focusItem(horiz, app.doc.features.length < n0 ? nk : keyOfEl(el)); return;
    }
    if (k === 'F2') { stop(); await app.renameFeature(i); C.focusItem(horiz, keyOfEl(el)); return; }
    if (e.ctrlKey && !e.shiftKey && k.toLowerCase() === 'g') { stop(); await C.groupSel(); C.focusItem(horiz, keyOfEl(el)); return; }
    if (e.ctrlKey && !e.shiftKey && k.toLowerCase() === 'b') { stop(); await app.toggleSuppress(i); C.focusItem(horiz, keyOfEl(el)); return; }
    if (k === 'ContextMenu' || (e.shiftKey && k === 'F10')) { stop(); const r = el.getBoundingClientRect(); featureMenu({ preventDefault() {}, clientX: r.left + 16, clientY: r.bottom }, f, i); }
  };
  // klavye: Alt+Shift+↑/← bir satır yukarı, Alt+Shift+↓/→ bir satır aşağı (kaynaşmış eskiz tüketicisiyle birlikte)
  C.rowUnits = () => { const F = C.hist().fused; return app.doc.features.map((f, i) => i).filter((i) => !F.has(app.doc.features[i].id)); };
  C.moveBy = (i, dir) => {
    const f = app.doc.features[i]; if (!f) return; const H = C.hist();
    if (H.fused.has(f.id)) i = app.doc.features.findIndex((x) => x.id === H.fused.get(f.id));
    const U = C.rowUnits(); const r = U.indexOf(i); if (r < 0) return;
    const n = app.doc.features.length;
    if (dir < 0) { if (r === 0) return; return app.moveFeature(i, unitA(U[r - 1])); }
    if (r >= U.length - 1) return; return app.moveFeature(i, r + 2 < U.length ? unitA(U[r + 2]) : n);
  };

  // ---------------------------------------------------------------- WP-02 dilim 4: geri sarma işaretçisi (sürüklenir) + orta-geçmiş bandı
  // İşaretçi kaydırıcıdır: ←/→ bir adım, Home/End başa/sona (genelde Alt+←/→, Alt+Home/End); fareyle sürüklenir.
  const markerEl = () => {
    const n = app.doc.features.length; const rb = app.doc.rollback; const v = rb ?? n;
    const prev = v > 0 ? app.doc.features[v - 1] : null;
    const el = h('span', { class: 'tl-marker', id: 'tl-marker', 'data-testid': 'tl-marker', 'data-marker': '1', tabindex: '0', role: 'slider', title: t('tl.marker_tip'), 'aria-label': t('tl.marker'),
      'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(v), 'aria-valuetext': prev ? t('tl.marker_at', { n: v, total: n, name: prev.name || featLabel(prev) }) : t('tl.marker_start') });
    el.addEventListener('keydown', (e) => {
      if (app.edit || app.sketchSession || modalUp()) return;
      const k = e.key; let to = null;
      if (k === 'ArrowLeft' || k === 'ArrowDown') to = v - 1; else if (k === 'ArrowRight' || k === 'ArrowUp') to = v + 1; else if (k === 'Home') to = 0; else if (k === 'End') to = n; else return;
      e.preventDefault(); e.stopPropagation(); C.stepMarker(to, true);
    });
    el.addEventListener('pointerdown', (e) => startMarkerDrag(e, el));
    return el;
  };
  C.stepMarker = async (to, focus) => {
    const n = app.doc.features.length; to = Math.max(0, Math.min(n, to)); const cur = app.doc.rollback ?? n;
    if (to === cur) return; await app.rollbackTo(to >= n ? null : to);
    if (focus) document.querySelector('#timeline [data-marker]')?.focus();
  };
  // sürükleme: işaretçi en yakın aralığa (çip ortaları arasına) yerleşir; bırakınca geri sarılır
  const markerGap = (x) => {
    const items = [...document.querySelectorAll('#timeline .chip[data-i], #timeline .chip[data-group]')];
    for (const c of items) { const r = c.getBoundingClientRect(); if (x < r.left + r.width / 2) return { gap: c.dataset.group ? C.hist().groups.find((g) => g.id === c.dataset.group).a : unitA(+c.dataset.i), before: c }; }
    return { gap: app.doc.features.length, before: null };
  };
  const startMarkerDrag = (e, el) => {
    if (e.button !== 0 || app.edit || app.sketchSession || app.mode !== 'design') return;
    e.preventDefault(); el.classList.add('dragging'); el.focus({ preventScroll: true });
    // önizleme: işaretçinin kendisi taşınmaz (işaretçi yakalaması kopmasın), aralığa hayalet işaretçi konur
    const tl = $('#timeline'); const ghost = h('span', { class: 'tl-marker ghost', 'aria-hidden': 'true' }); let last = null;
    const move = (ev) => { const g = markerGap(ev.clientX); if (last && last.gap === g.gap) return; last = g; const endBtn = $('#tl-end'); if (g.before) tl.insertBefore(ghost, g.before); else if (endBtn) tl.insertBefore(ghost, endBtn); else tl.append(ghost); };
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      ghost.remove(); el.classList.remove('dragging');
      const g = last || markerGap(ev.clientX); const n = app.doc.features.length;
      if (g.gap !== (app.doc.rollback ?? n)) C.stepMarker(g.gap, true);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  // geçmişin ortasındayken görünüm alanının altında kalıcı bant
  C.renderBand = () => {
    const vw = $('#viewwrap'); if (!vw) return; let band = document.getElementById('mid-band');
    const on = app.mode === 'design' && !app.welcome && app.doc.rollback != null;
    vw.classList.toggle('mid', on);
    if (!on) { band?.remove(); return; }
    if (!band) { band = h('div', { id: 'mid-band', class: 'mid-band', role: 'status', 'data-testid': 'mid-band' }); vw.append(band); }
    band.replaceChildren(h('span', { html: icon('rollback', 'sm') }), h('span', { class: 'mb-txt', text: t('tl.mid_band') }),
      h('button', { class: 'btn sm', type: 'button', 'data-testid': 'mid-band-end', onclick: () => app.rollbackTo(null) }, t('tl.end'), h('span', { class: 'kbd', text: 'Alt+End' })));
  };

  // ---------------------------------------------------------------- zaman çizelgesi
  C.renderTimeline = () => {
    const tl = $('#timeline'); const doc = app.doc;
    tl.classList.toggle('sim', app.mode === 'cam');
    if (app.mode === 'cam') { app.cam.renderBottom(tl); return; }
    if (app.mode === 'drawing') { app.drawing.renderBottom(tl); return; } // WP-17
    const rb = doc.rollback; const H = C.hist();
    const kids = [h('div', { class: 'tl-label' }, h('span', { html: icon('clock', 'sm') }), h('span', { text: t('tl.label') }))];
    let first = true;
    doc.features.forEach((f, i) => {
      if (rb != null && i === rb) kids.push(markerEl());
      const G = H.groupBy.get(f.id);
      if (G && G.a === i) { if (!first) kids.push(h('span', { class: 'tl-sep' })); first = false; kids.push(groupEl(G, true)); }
      if (G && !app.groupOpen.has(G.id)) return;
      if (H.fused.has(f.id)) return; // tek işlemin kullandığı eskiz, o işlemin çipinde rozet
      if (!first) kids.push(h('span', { class: 'tl-sep' })); first = false;
      const S = C.featState(f, i); const skId = H.fusedBy.get(f.id); const sk = skId ? doc.features.find((x) => x.id === skId) : null;
      // özet şerit: adsız, simge + durum işareti; ad ve durum ekran okuyucu için metin olarak durur
      const chip = h('button', { class: 'chip' + S.cls, 'data-id': f.id, 'data-i': i, 'data-testid': 'chip', 'aria-pressed': app.selFeature === f.id ? 'true' : 'false', title: titleOf(f, S) },
        sk ? h('span', { class: 'chip-sk', 'data-sketch': sk.id, 'data-testid': 'chip-sketch', title: t('hs.sketch_badge', { name: sk.name || sk.id }), html: icon('sketch', 'sm'),
          ondblclick: (e) => { e.stopPropagation(); app.editFeature(doc.features.indexOf(sk)); } }) : null,
        h('span', { class: 'cic', html: S.bad ? icon('error', 'sm') : featureIcon(f) }),
        h('span', { class: 'sr-only', text: [f.name || featLabel(f), S.summary].filter(Boolean).join(', ') }),
        ...(S.editing ? [h('span', { class: 'tag', text: t('tl.editing') })] : []),
        ...S.marks.filter((m) => m.k !== 'pending' && m.k !== 'error').map(markEl),
        ...(S.marks.some((m) => m.k === 'pending') ? [h('span', { class: 'sr-only', text: t('hs.st_pending') })] : []),
        S.bad ? h('span', { class: 'sr-only', text: t('hs.st_error') + ': ' + errText(S.st.error) }) : null, msBar(S.ms));
      chip.addEventListener('click', (e) => { if (e.detail === 0 && app.selFeature === f.id && !app.edit) app.editFeature(i); else app.selectFeature(f.id); });
      chip.addEventListener('dblclick', (e) => { if (e.target.closest('.chip-sk')) return; app.editFeature(i); });
      chip.addEventListener('contextmenu', (e) => featureMenu(e, f, i));
      chip.addEventListener('mouseenter', () => C.hoverFeature(f.id)); chip.addEventListener('mouseleave', () => C.hoverFeature(null));
      chip.addEventListener('focus', () => C.hoverFeature(f.id)); chip.addEventListener('blur', () => C.hoverFeature(null));
      if (G) chip.classList.add('in-group');
      if (C.inSel(f.id)) chip.classList.add('insel');
      chip.addEventListener('click', (e) => { if (e.shiftKey) { e.stopImmediatePropagation(); C.extendSel(chip); } }, true);
      bindDrag(chip, i, true);
      kids.push(chip);
    });
    if (rb == null && doc.features.length) kids.push(markerEl());
    if (rb != null) kids.push(h('button', { class: 'btn sm', id: 'tl-end', 'data-testid': 'tl-end', onclick: () => app.rollbackTo(null) }, t('tl.end')));
    if (!doc.features.length) kids.push(h('span', { class: 'note', text: t('tl.empty') }));
    roving(kids.filter((c) => c.classList && (c.matches('.chip[data-id]') || c.dataset.group)), (c) => c.dataset.id || c.dataset.group);
    const fk = keepFocus('#timeline'); tl.replaceChildren(...kids); fk();
    C.renderBand();
    tl.querySelector('.chip.sel')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    C.markDeps();
  };

  // ---------------------------------------------------------------- durum çubuğu
  const hhmm = (d) => d.toLocaleTimeString(getLang() === 'tr' ? 'tr-TR' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  const seg = (id, ...kids) => h('span', { class: 'seg-i', 'data-testid': id, id: id === 'st-left' ? 'st-left' : null }, ...kids);
  const div = () => h('span', { class: 'div' });
  // Karşılama ekranında alt çubuk: çevrimdışı rozeti + hızlı dil / tema / yoğunluk seçicileri
  C.renderQuick = () => {
    const q = $('#statusbar-quick'); if (!q) return;
    const sg = (label, tid, opts, cur, pick) => h('span', { class: 'quick' }, h('span', { class: 'muted-od', text: label }), h('span', { class: 'seg', role: 'group', 'data-testid': tid },
      ...opts.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(v === cur), 'data-testid': tid + '-' + v, onclick: () => pick(v), text: l }))));
    q.replaceChildren(h('span', { class: 'seg-i' }, h('span', { html: icon('lock', 'sm') }), h('span', { text: t('ui.offline') })), h('span', { class: 'grow' }),
      sg(t('set.language'), 'q-lang', [['tr', 'TR'], ['en', 'EN']], getLang(), (v) => app.setLanguage(v)),
      sg(t('set.theme'), 'q-theme', [['light', t('set.theme_light')], ['dark', t('set.theme_dark')], ['system', t('set.theme_system')]], prefs.theme, (v) => setPref('theme', v)),
      sg(t('set.density'), 'q-density', [['normal', t('set.density_normal')], ['large', t('set.density_large')]], prefs.density, (v) => setPref('density', v)));
  };
  C.renderStatus = () => {
    C.renderQuick();
    const r = app.result; const n = r ? r.bodies.length : 0;
    const bad = app.badFeatures();
    const sk = !!app.sketchSession; const camMode = app.mode === 'cam';
    const toolName = camMode ? (app.cam.sel ? app.cam.selLabel() : '—') : sk ? (() => { const c = cmds[app.sketcher?.tool]; return c ? label(c) : '—'; })() : app.edit && !app.edit.closed ? app.edit.titleText() : app.tool === 'measure' ? t('tb.measure') : app.tool === 'props' ? t('tb.props') : app.tool === 'newsketch' ? t('tb.sketch') : '—';
    const left = $('#st-left'); const keep = left ? left.textContent : '';
    $('#statusbar-main').replaceChildren(
      h('span', { class: 'seg-i', 'data-testid': 'st-mode', 'data-mode': camMode ? 'cam' : sk ? 'sketch' : 'model' }, h('span', { html: icon(camMode ? 'workspace-manufacture' : sk ? 'sketch' : 'workspace-design', 'sm') }), h('b', { text: camMode ? t('ui.mode_cam') : t(sk ? 'ui.mode_sketch' : 'ui.mode_model') })), div(),
      h('span', { class: 'seg-i', 'data-testid': 'st-tool' }, h('span', { class: 'muted-od', text: t('ui.tool') }), h('b', { text: toolName })), div(),
      h('span', { class: 'seg-i', id: 'st-left', 'data-testid': 'st-left', text: keep, title: keep || null }), h('span', { class: 'seg-i deps', 'data-testid': 'st-deps', 'aria-live': 'polite', hidden: true }), h('span', { class: 'grow' }),
      ...(app.busy ? [h('span', { class: 'seg-i', 'data-testid': 'st-busy' }, h('span', { class: 'progress indet', role: 'progressbar', 'aria-label': t('ui.busy') }, h('i')), h('span', { text: t('ui.busy') }),
        h('button', { class: 'sbtn', 'data-testid': 'cancel-compute', 'data-cmd': 'cancel-compute', onclick: () => app.cancelCompute() }, h('span', { html: icon('cancel', 'sm') }), h('span', { text: t('ui.cancel_compute') })), div())] : []),
      ...(app.stale ? [h('span', { class: 'seg-i warnc', 'data-testid': 'st-stale' }, h('span', { html: icon('warning', 'sm') }), h('span', { text: t('ui.stale') })), div()] : []),
      ...(camMode ? app.cam.statusExtras(div) : []),
      ...(bad.length ? [h('button', { class: 'sbtn err', 'data-testid': 'st-errors', 'data-cmd': 'goto-error', onclick: () => app.gotoFirstError() }, h('span', { html: icon('error', 'sm') }), h('span', { text: t(bad.length === 1 ? 'ui.errors_one' : 'ui.errors_many', { n: bad.length }) })), div()] : []),
      h('span', { class: 'seg-i', 'data-testid': 'st-bodies', text: t('ui.bodies', { n }) }), div(),
      h('span', { class: 'seg-i', 'data-testid': 'st-sel', text: t('ui.sel', { n: app.selectionCount() }) }), div(),
      h('span', { class: 'seg-i', 'data-testid': 'st-unit', text: 'mm' }), div(),
      h('span', { class: 'seg-i num', 'data-testid': 'st-time', text: t('ui.time', { t: app.lastMs != null ? Math.round(app.lastMs) + ' ms' : '—' }) }), div(),
      h('span', { class: 'seg-i' + (app.lastAutosave ? ' okc' : ''), 'data-testid': 'st-autosave' }, app.lastAutosave ? h('span', { html: icon('check', 'sm') }) : null, h('span', { text: app.lastAutosave ? t('ui.autosaved', { time: hhmm(app.lastAutosave) }) : t('ui.autosave_none') })));
    C.renderTitle(); C.markDeps();
  };
  C.setLeft = (text) => { const e = $('#st-left'); if (e) { e.textContent = text; e.title = text || ''; } };

  // ---------------------------------------------------------------- komut paleti (Ctrl+K / S)
  C.openPalette = () => {
    if (document.getElementById('palette')) return;
    const other = getLang() === 'tr' ? 'en' : 'tr';
    const all = () => Object.values(cmds).filter((c) => (app.sketchSession ? c.sk || !c.feature : app.mode === 'cam' ? c.cam || (!c.feature && !c.sk) : !c.sk && !c.cam));
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

  C.renderAll = () => { C.renderMenu(); C.renderTabs(); C.renderToolbar(); C.renderBrowser(); C.renderTimeline(); C.renderStatus(); C.renderEmpty(); app.viewport?._dispRender?.(); };
  // boş durum: simge + bir cümle + tek eylem
  C.renderEmpty = () => {
    const el = $('#empty'); if (!el) return;
    const show = app.mode !== 'cam' && !app.doc.features.length && !app.sketchSession && !app.edit && !app.tool && !app.welcome;
    el.classList.toggle('hidden', !show);
    if (show) el.replaceChildren(h('div', { class: 'empty' }, h('span', { html: icon('sketch', 'lg') }), h('div', { class: 'et', text: t('ui.empty_title') }), h('div', { text: t('ui.empty_body') }), h('button', { class: 'btn primary', 'data-cmd': 'sketch', 'data-testid': 'empty-sketch', onclick: () => C.run('sketch') }, t('tb.sketch'))));
  };
  C.reg = reg;
  app.cam.registerCommands(C);
  app.drawing.registerCommands(C); // WP-17
  C.relang = () => { C.renderViewBtns(); C.renderAll(); app.cam.relang(); };
  void LANGS; void LANG_KEY; void modal;
  return C;
}
