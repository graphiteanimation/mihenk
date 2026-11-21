// WP-12 işlem paneli satırları: uyarlanır kaba, yatay temizleme, kalan malzeme, aşağıda kal, ilerleme iyileştirme, ince duvar.
// OpPanel (oppanel.js) bu işlevleri çağırır; panel nesnesinin num/sel yardımcılarını kullanır.
import { h } from '../dom.js';
import { t, fmtNum } from '../../shared/i18n.js';
import { checkField, sec, callout } from './util.js';

export const WP12_TOOL_KINDS = { adaptive: ['flat', 'bullnose'], flat: ['flat', 'bullnose', 'face'] };
export const WP12_GEOM_TYPES = ['adaptive', 'flat'];
export const FEEDOPT_TYPES = ['pocket', 'adaptive', 'contour', 'flat'];

// yeni işlem varsayılanları (yalnız geometrik/güvenli; kesme verisi ön ayardan)
export function wp12Default(type, op) {
  if (type === 'adaptive') Object.assign(op, { geom: [], dir: 'climb', optimalLoad: null, stepdown: null, stayDown: true, entry: { kind: 'helix', angle: null, helixDia: null } }), op.heights = { ...op.heights, top: { from: 'stockTop', off: 0 }, bottom: { from: 'selection', off: 0 } };
  else if (type === 'flat') Object.assign(op, { geom: [], dir: 'climb', stepover: null, flatTop: 1, entry: { kind: 'ramp', angle: 2 } });
}

export function adaptiveRows(pn) {
  const d = pn.draft, tl = pn.tool; const rows = [];
  const deg = () => (tl && d.optimalLoad > 0 && d.optimalLoad < tl.dia ? fmtNum((Math.acos(1 - d.optimalLoad / (tl.dia / 2)) * 180) / Math.PI, 1) : null);
  const note = h('div', { class: 'note', 'data-testid': 'op-ad-angle' }); const upd = () => { const v = deg(); note.textContent = v ? t('cam.op.ad_angle', { deg: v }) : ''; note.hidden = !v; }; upd();
  rows.push(pn.num(t('cam.op.ad_load'), 'optimalLoad', { min: 0.001, f: 'ad-load', hint: t('cam.op.ad_load_hint'), after: upd, warn: (v) => (v !== null && tl && v >= tl.dia ? t('cam.op.stepover_big', { dia: fmtNum(tl.dia, 3) }) : null) }), note,
    pn.num(t('cam.op.stepdown'), 'stepdown', { min: 0.001, f: 'stepdown' }),
    pn.num(t('cam.op.sta_radial'), 'stockToLeave.radial', { min: 0, nullable: true, f: 'sta-radial' }), pn.num(t('cam.op.sta_axial'), 'stockToLeave.axial', { min: 0, nullable: true, f: 'sta-axial' }),
    checkField({ label: t('cam.op.stay_down'), value: d.stayDown !== false, f: 'op-stay-down', hint: t('cam.op.stay_down_hint'), set: (v) => { d.stayDown = v; pn.invalidate(); } }));
  const rest = d.rest?.source || '';
  rows.push(sec(t('cam.op.rest')), pn.sel(t('cam.op.rest'), 'rest.source', [['', t('cam.op.rest_none')], ['stock', t('cam.op.rest_stock')], ['tool', t('cam.op.rest_tool')]], { f: 'rest', hint: t('cam.op.rest_hint'), redraw: true,
    set: (v) => { if (!v) delete d.rest; else d.rest = v === 'tool' ? { source: v, toolDia: d.rest?.toolDia ?? null } : { source: v }; pn.invalidate(); } }));
  if (rest === 'tool') rows.push(pn.num(t('cam.op.rest_tool_dia'), 'rest.toolDia', { min: 0.001, f: 'rest-dia', hint: t('cam.op.rest_tool_hint') }));
  rows.push(sec(t('cam.op.entry')), callout('info', null, t('cam.op.ad_entry_note')),
    pn.num(t('cam.op.entry_angle'), 'entry.angle', { unit: '°', min: 0.1, max: 45, f: 'entry-angle', hint: t('cam.op.entry_angle_hint') }),
    pn.num(t('cam.op.helix_dia'), 'entry.helixDia', { min: 0.001, f: 'helix-dia', hint: t('cam.op.helix_dia_hint') }));
  return rows;
}

export function flatRows(pn) {
  const d = pn.draft; const e = d.entry || (d.entry = { kind: 'ramp', angle: 2 });
  const rows = [callout('info', null, t('cam.op.flat_note')),
    pn.num(t('cam.op.stepover'), 'stepover', { min: 0.001, f: 'stepover', hint: t('cam.op.stepover_hint'), warn: (v) => (v !== null && pn.tool && v >= pn.tool.dia ? t('cam.op.stepover_big', { dia: fmtNum(pn.tool.dia, 3) }) : null) }),
    pn.num(t('cam.op.flat_top'), 'flatTop', { min: 0.001, nullable: true, f: 'flat-top', hint: t('cam.op.flat_top_hint') }),
    pn.num(t('cam.op.sta_radial'), 'stockToLeave.radial', { min: 0, nullable: true, f: 'sta-radial' }),
    sec(t('cam.op.entry')), pn.sel(t('cam.op.entry_kind'), 'entry.kind', [['helix', t('cam.op.en_helix')], ['ramp', t('cam.op.en_ramp')], ['plunge', t('cam.op.en_plunge')]], { f: 'entry-kind', def: 'ramp', redraw: true,
      set: (v) => { d.entry = v === 'plunge' ? { kind: v } : v === 'helix' ? { kind: v, angle: e.angle ?? null, helixDia: e.helixDia ?? null } : { kind: v, angle: e.angle ?? null }; pn.invalidate(); } })];
  if (e.kind !== 'plunge') rows.push(pn.num(t('cam.op.entry_angle'), 'entry.angle', { unit: '°', min: 0.1, max: 45, f: 'entry-angle', hint: t('cam.op.entry_angle_hint') }));
  if (e.kind === 'helix') rows.push(pn.num(t('cam.op.helix_dia'), 'entry.helixDia', { min: 0.001, f: 'helix-dia', hint: t('cam.op.helix_dia_hint') }));
  return rows;
}

// ilerleme iyileştirme: köşe ve çıkış (feedOpt); boş kalınca alan silinir
export function feedOptRows(pn) {
  const d = pn.draft; const fo = d.feedOpt || {}; const rows = [sec(t('cam.op.fo_title'))];
  const tidy = () => { if (d.feedOpt && !d.feedOpt.corner && !d.feedOpt.exit) delete d.feedOpt; };
  const toggle = (key, init) => (v) => { if (v) { d.feedOpt = d.feedOpt || {}; d.feedOpt[key] = init(); } else if (d.feedOpt) { delete d.feedOpt[key]; tidy(); } pn.invalidate(); pn.render(); pn.showResult(); };
  rows.push(checkField({ label: t('cam.op.fo_corner'), value: !!fo.corner, f: 'op-fo-corner', hint: t('cam.op.fo_corner_hint'), set: toggle('corner', () => ({ angle: 45, factor: 0.5 })) }));
  if (fo.corner) rows.push(pn.num(t('cam.op.fo_angle'), 'feedOpt.corner.angle', { unit: '°', min: 1, max: 179, nullable: true, f: 'fo-angle' }),
    pn.num(t('cam.op.fo_dist'), 'feedOpt.corner.dist', { min: 0.001, nullable: true, f: 'fo-dist' }),
    pn.num(t('cam.op.fo_factor'), 'feedOpt.corner.factor', { unit: '', min: 0.01, max: 1, f: 'fo-factor', hint: t('cam.op.fo_factor_hint') }));
  rows.push(checkField({ label: t('cam.op.fo_exit'), value: !!fo.exit, f: 'op-fo-exit', hint: t('cam.op.fo_exit_hint'), set: toggle('exit', () => ({ dist: pn.tool ? pn.tool.dia / 2 : 2, factor: 0.5 })) }));
  if (fo.exit) rows.push(pn.num(t('cam.op.fo_exit_dist'), 'feedOpt.exit.dist', { min: 0.001, f: 'fo-exit-dist' }),
    pn.num(t('cam.op.fo_factor'), 'feedOpt.exit.factor', { unit: '', min: 0.01, max: 1, f: 'fo-exit-factor', hint: t('cam.op.fo_factor_hint') }));
  return rows;
}

// ince duvar (kontur): seviye öncelikli sıra + isteğe bağlı eksenel kademe
export function thinWallRows(pn) {
  const d = pn.draft; const on = d.thinWall?.enabled === true;
  const rows = [sec(t('cam.op.tw_on')), checkField({ label: t('cam.op.tw_on'), value: on, f: 'op-thin-wall', hint: t('cam.op.tw_hint'), set: (v) => { if (v) d.thinWall = { enabled: true }; else delete d.thinWall; pn.invalidate(); pn.render(); pn.showResult(); } })];
  if (on) rows.push(pn.num(t('cam.op.tw_step'), 'thinWall.axialStep', { min: 0.001, nullable: true, f: 'tw-step', hint: t('cam.op.tw_step_hint') }));
  return rows;
}
