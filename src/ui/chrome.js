// Arayüz kabuğu: menü çubuğu, araç çubuğu, tarayıcı (sol), zaman çizelgesi (alt), durum çubuğu, görünüm düğmeleri.
import { h, $, ctxMenu, fmt } from './dom.js';
import { icon, featureIcon } from './icons.js';
import { featLabel } from './features.js';
import { t, tk, errText, getLang, LANGS } from '../shared/i18n.js';

// Etiketler sözlük anahtarıdır; çizim anında t() ile çevrilir.
const LANG_KEY = { tr: tk('lang.tr'), en: tk('lang.en') };
const SK_TOOLS = [['select', tk('tb.select'), 'select'], ['line', tk('tb.line'), 'line'], ['rect', tk('tb.rect'), 'rect'], ['circle', tk('tb.circle'), 'circle'], ['arc', tk('tb.arc'), 'arc'], ['point', tk('tb.point'), 'point']];
const SK_DIMS = [['dim', tk('tb.dim'), 'dim'], ['hdim', tk('tb.hdim'), 'hdim'], ['vdim', tk('tb.vdim'), 'vdim']];
const SK_CONS = [['horizontal', tk('con.horizontal')], ['vertical', tk('con.vertical')], ['parallel', tk('con.parallel')], ['perpendicular', tk('con.perpendicular')], ['equal', tk('con.equal')], ['tangent', tk('con.tangent')], ['coincident', tk('con.coincident')], ['midpoint', tk('con.midpoint')], ['concentric', tk('con.concentric')], ['symmetric', tk('con.symmetric')], ['fix', tk('con.fix')]];

export function initChrome(app) {
  const C = {};

  // ---------------------------------------------------------------- menü
  const menus = () => [
    ['file', t('menu.file'), [
      { id: 'new', label: t('menu.new'), run: () => app.newDoc() }, { id: 'open', label: t('menu.open'), run: () => app.openFile() },
      { id: 'save', label: t('menu.save'), kbd: 'Ctrl+S', run: () => app.save() }, { id: 'saveas', label: t('menu.saveas'), run: () => app.save(true) }, { sep: 1 },
      { id: 'import-step', label: t('menu.import_step'), run: () => app.importFile('step') }, { id: 'import-stl', label: t('menu.import_stl'), run: () => app.importFile('stl') }, { sep: 1 },
      { id: 'export-step', label: t('menu.export_step'), run: () => app.exportFile('step') }, { id: 'export-stl', label: t('menu.export_stl'), run: () => app.exportFile('stl') },
    ]],
    ['edit', t('menu.edit'), [
      { id: 'undo', label: t('menu.undo'), kbd: 'Ctrl+Z', run: () => app.undo(), disabled: !app.undoStack.length }, { id: 'redo', label: t('menu.redo'), kbd: 'Ctrl+Y', run: () => app.redo(), disabled: !app.redoStack.length }, { sep: 1 },
      { id: 'params', label: t('menu.params'), run: () => app.openParams() },
    ]],
    ['view', t('menu.view'), [
      { id: 'fit', label: t('menu.fit'), kbd: 'F', run: () => app.viewport.fit() }, { sep: 1 },
      { id: 'front', label: t('view.front'), run: () => app.viewport.view('front') }, { id: 'top', label: t('view.top'), run: () => app.viewport.view('top') }, { id: 'right', label: t('view.right'), run: () => app.viewport.view('right') }, { id: 'iso', label: t('menu.iso'), run: () => app.viewport.view('iso') }, { sep: 1 },
      { id: 'planes', label: (app.planesVisible ? '✓ ' : '') + t('menu.planes'), run: () => app.togglePlanes() }, { id: 'section', label: t('menu.section'), run: () => app.toggleSection() }, { sep: 1 },
      { id: 'lang', label: t('menu.language'), sub: LANGS.map((l) => ({ id: 'lang-' + l, label: (getLang() === l ? '✓ ' : '') + t(LANG_KEY[l]), run: () => app.setLanguage(l) })) },
    ]],
    ['help', t('menu.help'), [{ id: 'shortcuts', label: t('menu.shortcuts'), run: () => app.showShortcuts() }, { id: 'about', label: t('menu.about'), run: () => app.showAbout() }]],
  ];
  C.renderMenu = () => {
    const bar = $('#menubar'); const openId = bar.querySelector('.menu.open > button')?.dataset.menu;
    bar.replaceChildren(h('span', { class: 'brand', text: 'AtolyeCAD' }));
    for (const [id, name, items] of menus()) {
      const m = h('div', { class: 'menu' + (openId === id ? ' open' : '') });
      const b = h('button', { 'data-menu': id, onclick: (e) => { e.stopPropagation(); const o = m.classList.contains('open'); closeMenus(); if (!o) m.classList.add('open'); } }, name);
      b.addEventListener('mouseenter', () => { if (bar.querySelector('.menu.open') && !m.classList.contains('open')) { closeMenus(); m.classList.add('open'); } });
      const drop = h('div', { class: 'drop' });
      for (const it of items) {
        if (it.sep) { drop.append(h('hr')); continue; }
        if (it.sub) {
          // alt menü: üzerine gelince ya da tıklayınca açılır
          const wrap = h('div', { class: 'has-sub' });
          const subdrop = h('div', { class: 'subdrop' }, it.sub.map((s) => h('button', { 'data-item': s.id, onclick: (e) => { e.stopPropagation(); closeMenus(); s.run(); } }, h('span', { text: s.label }))));
          wrap.append(h('button', { 'data-item': it.id, onclick: (e) => { e.stopPropagation(); wrap.classList.toggle('open'); } }, h('span', { text: it.label }), h('span', { class: 'kbd', text: '▸' })), subdrop);
          drop.append(wrap); continue;
        }
        drop.append(h('button', { 'data-item': it.id, disabled: it.disabled, onclick: (e) => { e.stopPropagation(); closeMenus(); it.run(); } }, h('span', { text: it.label }), it.kbd ? h('span', { class: 'kbd', text: it.kbd }) : null));
      }
      m.append(b, drop); bar.append(m);
    }
    bar.append(h('span', { class: 'doc', id: 'docname', text: app.docTitle() }));
  };
  const closeMenus = () => document.querySelectorAll('#menubar .menu.open').forEach((m) => m.classList.remove('open'));
  document.addEventListener('click', closeMenus);
  C.renderTitle = () => { const d = $('#docname'); if (d) d.textContent = app.docTitle(); };

  // ---------------------------------------------------------------- araç çubuğu
  const tb = (id, label, ic, run, extra = {}) => { label = t(label); return h('button', { class: 'tb' + (extra.active ? ' active' : '') + (extra.cls ? ' ' + extra.cls : ''), 'data-act': id, title: extra.title || label, disabled: extra.disabled, onclick: run }, h('span', { html: icon(ic) }), h('span', { text: label })); };
  const group = (label, btns) => h('div', { class: 'group' }, h('div', { class: 'btns' }, btns), h('div', { class: 'gl', text: t(label) }));
  C.renderToolbar = () => {
    const bar = $('#toolbar'); const sk = app.sketcher; bar.classList.toggle('sk', !!app.sketchSession);
    if (app.sketchSession) {
      const cur = sk?.tool;
      bar.replaceChildren(
        group(tk('grp.draw'), SK_TOOLS.map(([id, l, ic]) => tb(id, l, ic, () => app.sketchTool(id), { active: cur === id }))),
        group(tk('grp.dim'), SK_DIMS.map(([id, l, ic]) => tb(id, l, ic, () => app.sketchTool(id), { active: cur === id }))),
        group(tk('grp.constrain'), [...SK_CONS.map(([id, l]) => tb('c-' + id, l, id, () => app.sketchConstraint(id))), tb('c-construct', tk('con.construction'), 'construct', () => app.sketchConstruction(), { active: !!sk?.consMode })]),
        group(tk('grp.sketch'), [tb('sk-finish', tk('sk.finish'), 'finish', () => app.finishSketch(), { cls: 'primary' }), tb('sk-cancel', tk('common.cancel'), 'cancel', () => app.cancelSketch())]));
      return;
    }
    const f = (type, kind) => () => app.startFeature(type, kind);
    bar.replaceChildren(
      group(tk('grp.create'), [tb('sketch', tk('tb.sketch'), 'sketch', () => app.startSketch(), { active: app.tool === 'newsketch' }), tb('extrude', tk('tb.extrude'), 'extrude', f('extrude')), tb('revolve', tk('tb.revolve'), 'revolve', f('revolve')), tb('hole', tk('tb.hole'), 'hole', f('hole')),
        tb('box', tk('tb.box'), 'box', f('primitive', 'box')), tb('cylinder', tk('tb.cylinder'), 'cylinder', f('primitive', 'cylinder')), tb('sphere', tk('tb.sphere'), 'sphere', f('primitive', 'sphere'))]),
      group(tk('grp.modify'), [tb('fillet', tk('tb.fillet'), 'fillet', f('fillet')), tb('chamfer', tk('tb.chamfer'), 'chamfer', f('chamfer')), tb('shell', tk('tb.shell'), 'shell', f('shell')), tb('combine', tk('tb.combine'), 'combine', f('combine')),
        tb('move', tk('tb.move'), 'move', f('move')), tb('pattern', tk('tb.pattern'), 'pattern', f('pattern')), tb('mirror', tk('tb.mirror'), 'mirror', f('mirror'))]),
      group(tk('grp.inspect'), [tb('measure', tk('tb.measure'), 'measure', () => app.toggleTool('measure'), { active: app.tool === 'measure' }), tb('props', tk('tb.props'), 'props', () => app.toggleTool('props'), { active: app.tool === 'props' }),
        tb('interf', tk('tb.interf'), 'interf', () => app.runInterference()), tb('section', tk('tb.section'), 'section', () => app.toggleSection(), { active: !!app.sectionPanel })]));
  };

  // ---------------------------------------------------------------- görünüm düğmeleri
  C.renderViewBtns = () => {
    const b = (l, fn, id) => h('button', { onclick: fn, 'data-view': id, title: t(l) }, t(l));
    $('#viewbtns').replaceChildren(b(tk('view.front'), () => app.viewport.view('front'), 'front'), b(tk('view.top'), () => app.viewport.view('top'), 'top'), b(tk('view.right'), () => app.viewport.view('right'), 'right'), b(tk('view.iso'), () => app.viewport.view('iso'), 'iso'), b(tk('view.fit'), () => app.viewport.fit(), 'fit'));
  };

  // ---------------------------------------------------------------- tarayıcı
  const eye = (on, fn, title) => h('button', { class: 'eye' + (on ? '' : ' off'), title: t(title), onclick: (e) => { e.stopPropagation(); fn(); } }, h('span', { html: icon('eye').replace('<svg', '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"') }));
  C.renderBrowser = () => {
    const br = $('#browser'); const doc = app.doc, res = app.result;
    const sec = (title, action, rows) => [h('h4', {}, h('span', { text: title }), action || null), ...rows];
    const params = (doc.params || []).map((p) => {
      const v = res?.vars?.[p.name]; const er = res?.paramErrors?.[p.name];
      return h('div', { class: 'row' + (er ? ' err' : ''), 'data-param': p.name, title: er ? errText(er) : p.expr + (p.note ? ' — ' + p.note : '') }, h('span', { class: 'nm', text: p.name }), h('span', { class: 'val', text: er ? t('br.err') : '= ' + fmt(v, 4) }));
    });
    const bodies = (res?.bodies || []).map((b) => h('div', { class: 'row' + (app.selection.some((s) => s.kind === 'body' && s.body === b.id) ? ' sel' : ''), 'data-body': b.id, onclick: () => app.selectBody(b.id), ondblclick: () => app.renameBody(b.id) },
      eye(!app.hiddenBodies.has(b.id), () => app.toggleBody(b.id), tk('br.eye')), h('span', { class: 'nm', text: app.bodyName(b.id) }), h('span', { class: 'val', text: fmt(b.volume / 1000, 2) + ' cm³' })));
    const sketches = doc.features.map((f, i) => [f, i]).filter(([f]) => f.type === 'sketch').map(([f, i]) => h('div', { class: 'row' + (app.selFeature === f.id ? ' sel' : ''), 'data-sketch': f.id, ondblclick: () => app.editFeature(i), onclick: () => app.selectFeature(f.id) },
      eye(!app.hiddenSketches.has(f.id), () => app.toggleSketch(f.id), tk('br.eye')), h('span', { class: 'nm', text: f.name || f.id }), h('span', { class: 'val', text: '' })));
    br.replaceChildren(
      ...sec(t('br.params'), h('button', { id: 'br-params', onclick: () => app.openParams() }, t('br.edit')), params.length ? params : [h('div', { class: 'note', style: { padding: '0 8px' }, text: t('br.no_params') })]),
      ...sec(t('br.origin'), null, [h('div', { class: 'row' }, eye(app.planesVisible, () => app.togglePlanes(), tk('br.eye_planes')), h('span', { class: 'nm', text: t('br.planes_axes') }))]),
      ...sec(t('br.bodies'), null, bodies.length ? bodies : [h('div', { class: 'note', style: { padding: '0 8px' }, text: t('br.no_bodies') })]),
      ...sec(t('br.sketches'), null, sketches.length ? sketches : [h('div', { class: 'note', style: { padding: '0 8px' }, text: t('br.no_sketches') })]));
  };

  // ---------------------------------------------------------------- zaman çizelgesi
  C.renderTimeline = () => {
    const tl = $('#timeline'); const doc = app.doc, st = app.result?.status || {};
    const rb = doc.rollback; const kids = [h('span', { class: 'tl-label', text: t('tl.label') })];
    doc.features.forEach((f, i) => {
      if (rb != null && i === rb) kids.push(h('span', { class: 'marker', id: 'tl-marker', title: t('tl.marker') }));
      const s = st[f.id]; const rolled = rb != null && i >= rb; const bad = s && s.ok === false;
      const cls = 'chip' + (app.selFeature === f.id ? ' sel' : '') + (bad ? ' err' : '') + (f.suppressed ? ' sup' : '') + (rolled ? ' rolled' : '');
      const chip = h('div', { class: cls, 'data-id': f.id, 'data-i': i, title: bad ? errText(s.error) : f.name || f.id }, h('span', { html: featureIcon(f) }), h('span', { text: f.name || featLabel(f) }));
      chip.addEventListener('click', () => app.selectFeature(f.id));
      chip.addEventListener('dblclick', () => app.editFeature(i));
      chip.addEventListener('contextmenu', (e) => { e.preventDefault(); app.selectFeature(f.id); ctxMenu(e.clientX, e.clientY, [
        { id: 'edit', label: t('ctx.edit'), run: () => app.editFeature(i) }, { id: 'rename', label: t('ctx.rename'), run: () => app.renameFeature(i) },
        { id: 'suppress', label: f.suppressed ? t('ctx.unsuppress') : t('ctx.suppress'), run: () => app.toggleSuppress(i) }, { id: 'rollback', label: t('ctx.rollback'), run: () => app.rollbackTo(i + 1) }, { sep: 1 }, { id: 'delete', label: t('ctx.delete'), run: () => app.deleteFeature(i) }]); });
      kids.push(chip);
    });
    if (rb != null) kids.push(h('button', { class: 'btn', id: 'tl-end', style: { marginLeft: '8px', padding: '2px 10px' }, onclick: () => app.rollbackTo(null) }, t('tl.end')));
    if (!doc.features.length) kids.push(h('span', { class: 'note', text: t('tl.empty') }));
    tl.replaceChildren(...kids);
  };

  // ---------------------------------------------------------------- durum çubuğu
  C.renderStatus = () => {
    const r = app.result; const n = r ? r.bodies.length : 0;
    $('#st-right').textContent = t('st.right', { bodies: n, sel: app.selectionCount(), time: app.lastMs != null ? Math.round(app.lastMs) + ' ms' : '—' });
  };
  C.setLeft = (text) => { $('#st-left').textContent = text; };

  C.renderAll = () => { C.renderMenu(); C.renderToolbar(); C.renderBrowser(); C.renderTimeline(); C.renderStatus(); };
  C.relang = () => { C.renderViewBtns(); C.renderAll(); };
  return C;
}
