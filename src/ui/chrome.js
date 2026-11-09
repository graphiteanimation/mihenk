// Arayüz kabuğu: menü çubuğu, araç çubuğu, tarayıcı (sol), zaman çizelgesi (alt), durum çubuğu, görünüm düğmeleri.
import { h, $, ctxMenu, fmt } from './dom.js';
import { icon, featureIcon } from './icons.js';
import { featLabel } from './features.js';

const SK_TOOLS = [['select', 'Seç', 'select'], ['line', 'Çizgi', 'line'], ['rect', 'Dikdörtgen', 'rect'], ['circle', 'Daire', 'circle'], ['arc', 'Yay', 'arc'], ['point', 'Nokta', 'point']];
const SK_DIMS = [['dim', 'Ölçü', 'dim'], ['hdim', 'Yatay', 'hdim'], ['vdim', 'Dikey', 'vdim']];
const SK_CONS = [['horizontal', 'Yatay'], ['vertical', 'Dikey'], ['parallel', 'Paralel'], ['perpendicular', 'Dik'], ['equal', 'Eşit'], ['tangent', 'Teğet'], ['coincident', 'Çakışık'], ['midpoint', 'Orta nokta'], ['concentric', 'Eş merkez'], ['symmetric', 'Simetri'], ['fix', 'Sabitle']];

export function initChrome(app) {
  const C = {};

  // ---------------------------------------------------------------- menü
  const menus = () => [
    ['Dosya', [
      { label: 'Yeni', run: () => app.newDoc() }, { label: 'Aç…', run: () => app.openFile() },
      { label: 'Kaydet', kbd: 'Ctrl+S', run: () => app.save() }, { label: 'Farklı Kaydet…', run: () => app.save(true) }, { sep: 1 },
      { label: 'STEP İçe Aktar…', run: () => app.importFile('step') }, { label: 'STL İçe Aktar…', run: () => app.importFile('stl') }, { sep: 1 },
      { label: 'STEP Dışa Aktar…', run: () => app.exportFile('step') }, { label: 'STL Dışa Aktar…', run: () => app.exportFile('stl') },
    ]],
    ['Düzen', [
      { label: 'Geri Al', kbd: 'Ctrl+Z', run: () => app.undo(), disabled: !app.undoStack.length }, { label: 'Yinele', kbd: 'Ctrl+Y', run: () => app.redo(), disabled: !app.redoStack.length }, { sep: 1 },
      { label: 'Parametreler…', run: () => app.openParams() },
    ]],
    ['Görünüm', [
      { label: 'Sığdır', kbd: 'F', run: () => app.viewport.fit() }, { sep: 1 },
      { label: 'Ön', run: () => app.viewport.view('front') }, { label: 'Üst', run: () => app.viewport.view('top') }, { label: 'Sağ', run: () => app.viewport.view('right') }, { label: 'İzometrik', run: () => app.viewport.view('iso') }, { sep: 1 },
      { label: (app.planesVisible ? '✓ ' : '') + 'Orijin düzlemleri', run: () => app.togglePlanes() }, { label: 'Kesit…', run: () => app.toggleSection() },
    ]],
    ['Yardım', [{ label: 'Kısayollar', run: () => app.showShortcuts() }, { label: 'Hakkında', run: () => app.showAbout() }]],
  ];
  C.renderMenu = () => {
    const bar = $('#menubar'); const openName = bar.querySelector('.menu.open > button')?.textContent;
    bar.replaceChildren(h('span', { class: 'brand', text: 'AtolyeCAD' }));
    for (const [name, items] of menus()) {
      const m = h('div', { class: 'menu' + (openName === name ? ' open' : '') });
      const b = h('button', { 'data-menu': name, onclick: (e) => { e.stopPropagation(); const o = m.classList.contains('open'); closeMenus(); if (!o) m.classList.add('open'); } }, name);
      b.addEventListener('mouseenter', () => { if (bar.querySelector('.menu.open') && !m.classList.contains('open')) { closeMenus(); m.classList.add('open'); } });
      const drop = h('div', { class: 'drop' });
      for (const it of items) {
        if (it.sep) { drop.append(h('hr')); continue; }
        drop.append(h('button', { disabled: it.disabled, onclick: (e) => { e.stopPropagation(); closeMenus(); it.run(); } }, h('span', { text: it.label }), it.kbd ? h('span', { class: 'kbd', text: it.kbd }) : null));
      }
      m.append(b, drop); bar.append(m);
    }
    bar.append(h('span', { class: 'doc', id: 'docname', text: app.docTitle() }));
  };
  const closeMenus = () => document.querySelectorAll('#menubar .menu.open').forEach((m) => m.classList.remove('open'));
  document.addEventListener('click', closeMenus);
  C.renderTitle = () => { const d = $('#docname'); if (d) d.textContent = app.docTitle(); };

  // ---------------------------------------------------------------- araç çubuğu
  const tb = (id, label, ic, run, extra = {}) => h('button', { class: 'tb' + (extra.active ? ' active' : '') + (extra.cls ? ' ' + extra.cls : ''), 'data-act': id, title: extra.title || label, disabled: extra.disabled, onclick: run }, h('span', { html: icon(ic) }), h('span', { text: label }));
  const group = (label, btns) => h('div', { class: 'group' }, h('div', { class: 'btns' }, btns), h('div', { class: 'gl', text: label }));
  C.renderToolbar = () => {
    const t = $('#toolbar'); const sk = app.sketcher; t.classList.toggle('sk', !!app.sketchSession);
    if (app.sketchSession) {
      const cur = sk?.tool;
      t.replaceChildren(
        group('Çiz', SK_TOOLS.map(([id, l, ic]) => tb(id, l, ic, () => app.sketchTool(id), { active: cur === id }))),
        group('Ölçü', SK_DIMS.map(([id, l, ic]) => tb(id, l, ic, () => app.sketchTool(id), { active: cur === id }))),
        group('Kısıt', [...SK_CONS.map(([id, l]) => tb('c-' + id, l, id, () => app.sketchConstraint(id))), tb('c-construct', 'Yapı', 'construct', () => app.sketchConstruction(), { active: !!sk?.consMode })]),
        group('Sketch', [tb('sk-finish', 'Sketch\'i Bitir', 'finish', () => app.finishSketch(), { cls: 'primary' }), tb('sk-cancel', 'İptal', 'cancel', () => app.cancelSketch())]));
      return;
    }
    const f = (type, kind) => () => app.startFeature(type, kind);
    t.replaceChildren(
      group('Oluştur', [tb('sketch', 'Sketch', 'sketch', () => app.startSketch(), { active: app.tool === 'newsketch' }), tb('extrude', 'Extrude', 'extrude', f('extrude')), tb('revolve', 'Revolve', 'revolve', f('revolve')), tb('hole', 'Delik', 'hole', f('hole')),
        tb('box', 'Kutu', 'box', f('primitive', 'box')), tb('cylinder', 'Silindir', 'cylinder', f('primitive', 'cylinder')), tb('sphere', 'Küre', 'sphere', f('primitive', 'sphere'))]),
      group('Düzenle', [tb('fillet', 'Yuvarlat', 'fillet', f('fillet')), tb('chamfer', 'Pah', 'chamfer', f('chamfer')), tb('shell', 'Kabuk', 'shell', f('shell')), tb('combine', 'Birleştir', 'combine', f('combine')),
        tb('move', 'Taşı/Kopyala', 'move', f('move')), tb('pattern', 'Desen', 'pattern', f('pattern')), tb('mirror', 'Ayna', 'mirror', f('mirror'))]),
      group('İncele', [tb('measure', 'Ölç', 'measure', () => app.toggleTool('measure'), { active: app.tool === 'measure' }), tb('props', 'Özellikler', 'props', () => app.toggleTool('props'), { active: app.tool === 'props' }),
        tb('interf', 'Girişim', 'interf', () => app.runInterference()), tb('section', 'Kesit', 'section', () => app.toggleSection(), { active: !!app.sectionPanel })]));
  };

  // ---------------------------------------------------------------- görünüm düğmeleri
  C.renderViewBtns = () => {
    const b = (l, fn, id) => h('button', { onclick: fn, 'data-view': id, title: l }, l);
    $('#viewbtns').replaceChildren(b('Ön', () => app.viewport.view('front'), 'front'), b('Üst', () => app.viewport.view('top'), 'top'), b('Sağ', () => app.viewport.view('right'), 'right'), b('İzo', () => app.viewport.view('iso'), 'iso'), b('Sığdır', () => app.viewport.fit(), 'fit'));
  };

  // ---------------------------------------------------------------- tarayıcı
  const eye = (on, fn, title) => h('button', { class: 'eye' + (on ? '' : ' off'), title, onclick: (e) => { e.stopPropagation(); fn(); } }, h('span', { html: icon('eye').replace('<svg', '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"') }));
  C.renderBrowser = () => {
    const br = $('#browser'); const doc = app.doc, res = app.result;
    const sec = (title, action, rows) => [h('h4', {}, h('span', { text: title }), action || null), ...rows];
    const params = (doc.params || []).map((p) => {
      const v = res?.vars?.[p.name]; const er = res?.paramErrors?.[p.name];
      return h('div', { class: 'row' + (er ? ' err' : ''), 'data-param': p.name, title: er || p.expr + (p.note ? ' — ' + p.note : '') }, h('span', { class: 'nm', text: p.name }), h('span', { class: 'val', text: er ? 'hata' : '= ' + fmt(v, 4) }));
    });
    const bodies = (res?.bodies || []).map((b) => h('div', { class: 'row' + (app.selection.some((s) => s.kind === 'body' && s.body === b.id) ? ' sel' : ''), 'data-body': b.id, onclick: () => app.selectBody(b.id), ondblclick: () => app.renameBody(b.id) },
      eye(!app.hiddenBodies.has(b.id), () => app.toggleBody(b.id), 'Göster / gizle'), h('span', { class: 'nm', text: app.bodyName(b.id) }), h('span', { class: 'val', text: fmt(b.volume / 1000, 2) + ' cm³' })));
    const sketches = doc.features.map((f, i) => [f, i]).filter(([f]) => f.type === 'sketch').map(([f, i]) => h('div', { class: 'row' + (app.selFeature === f.id ? ' sel' : ''), 'data-sketch': f.id, ondblclick: () => app.editFeature(i), onclick: () => app.selectFeature(f.id) },
      eye(!app.hiddenSketches.has(f.id), () => app.toggleSketch(f.id), 'Göster / gizle'), h('span', { class: 'nm', text: f.name || f.id }), h('span', { class: 'val', text: '' })));
    br.replaceChildren(
      ...sec('Parametreler', h('button', { id: 'br-params', onclick: () => app.openParams() }, 'Düzenle'), params.length ? params : [h('div', { class: 'note', style: { padding: '0 8px' }, text: 'Parametre yok' })]),
      ...sec('Orijin', null, [h('div', { class: 'row' }, eye(app.planesVisible, () => app.togglePlanes(), 'Orijin düzlemlerini göster / gizle'), h('span', { class: 'nm', text: 'Düzlemler ve eksenler' }))]),
      ...sec('Gövdeler', null, bodies.length ? bodies : [h('div', { class: 'note', style: { padding: '0 8px' }, text: 'Henüz gövde yok' })]),
      ...sec('Sketch\'ler', null, sketches.length ? sketches : [h('div', { class: 'note', style: { padding: '0 8px' }, text: 'Henüz sketch yok' })]));
  };

  // ---------------------------------------------------------------- zaman çizelgesi
  C.renderTimeline = () => {
    const tl = $('#timeline'); const doc = app.doc, st = app.result?.status || {};
    const rb = doc.rollback; const kids = [h('span', { class: 'tl-label', text: 'Zaman çizelgesi' })];
    doc.features.forEach((f, i) => {
      if (rb != null && i === rb) kids.push(h('span', { class: 'marker', id: 'tl-marker', title: 'Geri sarma işaretçisi' }));
      const s = st[f.id]; const rolled = rb != null && i >= rb; const bad = s && s.ok === false;
      const cls = 'chip' + (app.selFeature === f.id ? ' sel' : '') + (bad ? ' err' : '') + (f.suppressed ? ' sup' : '') + (rolled ? ' rolled' : '');
      const chip = h('div', { class: cls, 'data-id': f.id, 'data-i': i, title: bad ? s.error : f.name || f.id }, h('span', { html: featureIcon(f) }), h('span', { text: f.name || featLabel(f) }));
      chip.addEventListener('click', () => app.selectFeature(f.id));
      chip.addEventListener('dblclick', () => app.editFeature(i));
      chip.addEventListener('contextmenu', (e) => { e.preventDefault(); app.selectFeature(f.id); ctxMenu(e.clientX, e.clientY, [
        { label: 'Düzenle', run: () => app.editFeature(i) }, { label: 'Yeniden adlandır', run: () => app.renameFeature(i) },
        { label: f.suppressed ? 'Etkinleştir' : 'Bastır', run: () => app.toggleSuppress(i) }, { label: 'Buraya geri sar', run: () => app.rollbackTo(i + 1) }, { sep: 1 }, { label: 'Sil', run: () => app.deleteFeature(i) }]); });
      kids.push(chip);
    });
    if (rb != null) kids.push(h('button', { class: 'btn', id: 'tl-end', style: { marginLeft: '8px', padding: '2px 10px' }, onclick: () => app.rollbackTo(null) }, 'Sona git'));
    if (!doc.features.length) kids.push(h('span', { class: 'note', text: 'Henüz özellik yok. Üstteki araçlardan bir şekil oluşturun.' }));
    tl.replaceChildren(...kids);
  };

  // ---------------------------------------------------------------- durum çubuğu
  C.renderStatus = () => {
    const r = app.result; const n = r ? r.bodies.length : 0;
    $('#st-right').textContent = `Gövde: ${n} · Seçim: ${app.selectionCount()} · Hesap: ${app.lastMs != null ? Math.round(app.lastMs) + ' ms' : '—'}`;
  };
  C.setLeft = (t) => { $('#st-left').textContent = t; };

  C.renderAll = () => { C.renderMenu(); C.renderToolbar(); C.renderBrowser(); C.renderTimeline(); C.renderStatus(); };
  return C;
}
