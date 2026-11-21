// WP-15 işlem paneli satırları: 3D işlemler (3B uyarlanır kaba, Z-seviye, paralel, sabit tepe, kalem), sınır, eğim aralığı,
// tolerans, yay uydurma, kalan malzeme (3D rest). OpPanel (oppanel.js) bu işlevleri çağırır.
import { h } from '../dom.js';
import { t, fmtNum } from '../../shared/i18n.js';
import { checkField, sec, callout } from './util.js';

export const WP15_TYPES = ['adaptive3d', 'zlevel', 'parallel', 'scallop', 'pencil'];
export const WP15_TOOL_KINDS = { adaptive3d: ['flat', 'bullnose'], zlevel: ['ball', 'bullnose', 'flat'], parallel: ['ball', 'bullnose', 'flat'], scallop: ['ball', 'bullnose'], pencil: ['ball', 'bullnose'] };

// yeni işlem varsayılanları (geometrik/güvenli; kesme verisi ön ayardan)
export function wp15Default(type, op) {
  op.heights = { ...op.heights, top: { from: 'stockTop', off: 0 }, bottom: { from: 'modelBottom', off: 0 } };
  op.boundary = { kind: 'model', offset: 0 }; op.tolerance = 0.01;
  if (type === 'adaptive3d') Object.assign(op, { dir: 'climb', optimalLoad: null, stepdown: null, fillStepdown: null, flatLevels: true, stayDown: true, stockToLeave: { radial: 0.3, axial: 0.2 }, entry: { kind: 'helix', angle: null, helixDia: null } }), op.boundary = { kind: 'stock', offset: 0 };
  else if (type === 'zlevel') Object.assign(op, { dir: 'climb', stepdown: null, slope: { min: 30, max: 90 }, arcFit: { tol: 0.005 } });
  else if (type === 'parallel') Object.assign(op, { stepover: null, angle: 0, pattern: 'zigzag', slope: { min: 0, max: 90 }, arcFit: { tol: 0.005 } });
  else if (type === 'scallop') Object.assign(op, { scallopHeight: 0.01, slope: { min: 0, max: 90 }, arcFit: { tol: 0.005 } });
  else if (type === 'pencil') Object.assign(op, { minAngle: 20, arcFit: { tol: 0.005 } });
}

// geometri sekmesi: model (setup gövdeleri) + sınır + eğim aralığı + tolerans
export function surfGeomRows(pn) {
  const d = pn.draft; const rows = [callout('info', null, t('cam.s3.model_note'))];
  rows.push(sec(t('cam.s3.boundary')),
    pn.sel(t('cam.s3.bkind'), 'boundary.kind', [['model', t('cam.s3.b_model')], ['stock', t('cam.s3.b_stock')]], { f: 's3-bkind', def: d.type === 'adaptive3d' ? 'stock' : 'model', hint: t('cam.s3.bkind_hint') }),
    pn.num(t('cam.s3.boffset'), 'boundary.offset', { min: -1e4, nullable: true, f: 's3-boffset', hint: t('cam.s3.boffset_hint') }));
  if (d.type === 'zlevel' || d.type === 'parallel' || d.type === 'scallop') {
    rows.push(sec(t('cam.s3.slope')), pn.num(t('cam.s3.slope_min'), 'slope.min', { unit: '°', min: 0, max: 90, f: 's3-slope-min', hint: t('cam.s3.slope_hint') }), pn.num(t('cam.s3.slope_max'), 'slope.max', { unit: '°', min: 0, max: 90, f: 's3-slope-max' }));
  }
  rows.push(sec(t('cam.s3.accuracy')), pn.num(t('cam.s3.tol'), 'tolerance', { min: 0.0005, max: 0.2, f: 's3-tol', hint: t('cam.s3.tol_hint') }),
    pn.num(t('cam.s3.sampling'), 'sampling', { min: 0.01, nullable: true, f: 's3-sampling', hint: t('cam.s3.sampling_hint') }));
  return rows;
}

// pasolar sekmesi
export function surfPassRows(pn) {
  const d = pn.draft, tl = pn.tool; const rows = [];
  const dirSel = () => pn.sel(t('cam.op.dir'), 'dir', [['climb', t('cam.op.dir_climb')], ['conv', t('cam.op.dir_conv')]], { f: 'dir', def: 'climb' });
  const sta = () => [pn.num(t('cam.op.sta_radial'), 'stockToLeave.radial', { min: 0, nullable: true, f: 'sta-radial' }), pn.num(t('cam.op.sta_axial'), 'stockToLeave.axial', { min: 0, nullable: true, f: 'sta-axial' })];
  if (d.type === 'adaptive3d') {
    rows.push(pn.num(t('cam.op.ad_load'), 'optimalLoad', { min: 0.001, f: 'ad-load', hint: t('cam.op.ad_load_hint'), warn: (v) => (v !== null && tl && v >= tl.dia ? t('cam.op.stepover_big', { dia: fmtNum(tl.dia, 3) }) : null) }),
      pn.num(t('cam.op.stepdown'), 'stepdown', { min: 0.001, f: 'stepdown' }),
      pn.num(t('cam.s3.fill'), 'fillStepdown', { min: 0.001, nullable: true, f: 's3-fill', hint: t('cam.s3.fill_hint') }),
      checkField({ label: t('cam.s3.flat_levels'), value: d.flatLevels !== false, f: 's3-flat-levels', hint: t('cam.s3.flat_levels_hint'), set: (v) => { d.flatLevels = v; pn.invalidate(); } }),
      ...sta(), dirSel(),
      checkField({ label: t('cam.op.stay_down'), value: d.stayDown !== false, f: 'op-stay-down', hint: t('cam.op.stay_down_hint'), set: (v) => { d.stayDown = v; pn.invalidate(); } }),
      sec(t('cam.op.rest')), pn.sel(t('cam.op.rest'), 'rest.source', [['', t('cam.op.rest_none')], ['stock', t('cam.op.rest_stock')]], { f: 'rest', hint: t('cam.s3.rest_rough_hint'), redraw: true, set: (v) => { if (!v) delete d.rest; else d.rest = { source: 'stock' }; pn.invalidate(); } }),
      sec(t('cam.op.entry')), callout('info', null, t('cam.op.ad_entry_note')),
      pn.num(t('cam.op.entry_angle'), 'entry.angle', { unit: '°', min: 0.1, max: 45, f: 'entry-angle', hint: t('cam.op.entry_angle_hint') }),
      pn.num(t('cam.op.helix_dia'), 'entry.helixDia', { min: 0.001, f: 'helix-dia', hint: t('cam.op.helix_dia_hint') }));
    return rows;
  }
  if (d.type === 'zlevel') rows.push(pn.num(t('cam.op.stepdown'), 'stepdown', { min: 0.001, f: 'stepdown', hint: t('cam.s3.zl_stepdown_hint') }), dirSel(), ...sta());
  else if (d.type === 'parallel') rows.push(pn.num(t('cam.op.stepover'), 'stepover', { min: 0.001, f: 'stepover', hint: t('cam.s3.par_stepover_hint'), warn: (v) => (v !== null && tl && v >= tl.dia ? t('cam.op.stepover_big', { dia: fmtNum(tl.dia, 3) }) : null) }),
    pn.num(t('cam.s3.angle'), 'angle', { unit: '°', min: -360, max: 360, nullable: true, f: 's3-angle', hint: t('cam.s3.angle_hint') }),
    pn.sel(t('cam.s3.pattern'), 'pattern', [['zigzag', t('cam.s3.p_zigzag')], ['oneway', t('cam.s3.p_oneway')]], { f: 's3-pattern', def: 'zigzag' }), ...sta());
  else if (d.type === 'scallop') {
    const note = h('div', { class: 'note', 'data-testid': 's3-sc-width' }); const upd = () => { const Re = tl ? (tl.type === 'ball' ? tl.dia / 2 : tl.cornerR) : null; const hs = d.scallopHeight; const w = Re > 0 && hs > 0 && hs < Re ? 2 * Math.sqrt(2 * Re * hs - hs * hs) : null; note.textContent = w ? t('cam.s3.sc_width', { w: fmtNum(w, 3) }) : ''; note.hidden = !w; }; upd();
    rows.push(pn.num(t('cam.s3.scallop'), 'scallopHeight', { min: 0.0005, f: 's3-scallop', hint: t('cam.s3.scallop_hint'), after: upd }), note, ...sta());
  } else if (d.type === 'pencil') rows.push(callout('info', null, t('cam.s3.pencil_note')), pn.num(t('cam.s3.min_angle'), 'minAngle', { unit: '°', min: 1, max: 89, nullable: true, f: 's3-min-angle', hint: t('cam.s3.min_angle_hint') }), ...sta());
  // 3D rest (bitirme): önceki takımın bıraktığı yer
  if (d.type !== 'pencil') {
    const on = !!d.rest?.toolDia || d.rest?.toolDia === null;
    rows.push(sec(t('cam.op.rest')), checkField({ label: t('cam.s3.rest_on'), value: on, f: 's3-rest', hint: t('cam.s3.rest_hint'), set: (v) => { if (v) d.rest = { toolDia: null }; else delete d.rest; pn.invalidate(); pn.render(); pn.showResult(); } }));
    if (on) rows.push(pn.num(t('cam.op.rest_tool_dia'), 'rest.toolDia', { min: 0.001, f: 's3-rest-dia' }), pn.num(t('cam.s3.rest_cr'), 'rest.cornerR', { min: 0, nullable: true, f: 's3-rest-cr', hint: t('cam.s3.rest_cr_hint') }));
  }
  // yay uydurma
  const af = !!d.arcFit;
  rows.push(sec(t('cam.s3.arcfit')), checkField({ label: t('cam.s3.arcfit_on'), value: af, f: 's3-arcfit', hint: t('cam.s3.arcfit_hint'), set: (v) => { if (v) d.arcFit = { tol: 0.005 }; else delete d.arcFit; pn.invalidate(); pn.render(); pn.showResult(); } }));
  if (af) rows.push(pn.num(t('cam.s3.arcfit_tol'), 'arcFit.tol', { min: 0.0001, max: 1, f: 's3-arcfit-tol' }));
  return rows;
}
