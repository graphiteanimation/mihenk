// Post/NC arayüzü: sorun listesi, NC önizleme (satır → hareket), kaydet, doğrulama beyanı.
import { h, modal, toast, $ } from '../dom.js';
import { icon } from '../icons.js';
import { t, errText } from '../../shared/i18n.js';
import { callout, fld, unitBox, checkBox } from './util.js';

// rows: [{level:'block'|'warn', op, text, g?, opId?}]; onPick(row) satıra tıklayınca (pencere kapanır, sonra çağrılır)
export async function showIssueList(ops, { title, intro, rows, warns = [], kind = 'err', onPick = null }) {
  let picked = null;
  const mkRow = (r) => {
    const body = [h('span', { class: 'is-ic', html: icon(r.level === 'block' ? 'error' : 'warning', 'sm') }), h('span', { class: 'is-tx' }, r.op ? h('b', { text: r.op + ': ' }) : null, h('span', { text: r.text }))];
    if (!onPick) return h('div', { class: 'is-row ' + r.level, 'data-testid': 'issue-row', 'data-level': r.level }, ...body);
    return h('button', { type: 'button', class: 'is-row ' + r.level, 'data-testid': 'issue-row', 'data-level': r.level, onclick: () => { picked = r; $('#modal').querySelector('[data-testid="issues-close"]')?.click(); } }, ...body);
  };
  const all = [...rows, ...warns];
  const list = h('div', { class: 'is-list', 'data-testid': 'issue-list' }, all.length ? all.map(mkRow) : h('div', { class: 'note', text: t('cam.sim.no_issues') }));
  const content = h('div', {}, callout(kind, null, intro), list, onPick && all.length ? h('div', { class: 'note', text: t('cam.sim.issues_click') }) : null);
  await modal({ title, width: 640, cls: 'is-modal', icon: kind === 'err' ? 'error' : 'warning', content, buttons: [{ label: t('common.close'), cls: 'pri primary', value: 'close', testid: 'issues-close' }] });
  if (picked && onPick) onPick(picked);
}

const vkey = (v) => (v.ok ? v.rec.by + '|' + v.rec.date + '|' + v.rec.note : '');

export async function showNc(ops) {
  const app = ops.app, cam = ops.cam, view = cam.view;
  if (ops.nc.vkey !== vkey(ops.verifiedState())) { try { ops.nc = { ...ops.nc, ...ops.runPost(ops.nc.program, ops.nc.gates) }; } catch (e) { /* mevcut metin kalır */ } }
  ops.nc.vkey = vkey(ops.verifiedState());
  const nc = () => ops.nc; let sel = -1;
  const pre = h('div', { class: 'nc-text', role: 'listbox', tabindex: '0', 'aria-label': t('cam.nc.text'), 'data-testid': 'nc-text' });
  const info = h('div', { class: 'nc-info' });
  const lineEls = [];
  const mark = (i) => {
    if (sel >= 0) lineEls[sel]?.classList.remove('sel'); sel = i; const el = lineEls[i]; if (!el) return; el.classList.add('sel'); el.scrollIntoView?.({ block: 'nearest' });
    pre.setAttribute('aria-activedescendant', el.id);
    const lm = nc().lineMap[i]; const it = lm && lm.section != null ? nc().items[lm.section] : null;
    if (it && lm.move != null) view?.showMove(it.S, it.tp, lm.move); else view?.hideMove();
  };
  const draw = () => {
    lineEls.length = 0; sel = -1;
    nc().lines.forEach((tx, i) => { const e = h('div', { class: 'nc-line', role: 'option', id: 'ncl' + i, 'data-i': String(i), onclick: () => mark(i) }, h('span', { class: 'ln', text: String(i + 1) }), h('span', { class: 'tx', text: tx })); lineEls.push(e); });
    pre.replaceChildren(...lineEls);
    const stale = ops.docSig() !== nc().docSig; const v = ops.verifiedState(); const warn = nc().gates.filter((g) => g.level === 'warn').length + (nc().warnings || []).length;
    info.replaceChildren(...[
      callout('unv', t('cam.nc.unv_title'), t('cam.nc.unv_body'), 'unverified'),
      v.ok ? callout('ok', t('cam.vf.ok_title'), t('cam.vf.ok_line', { by: v.rec.by, date: v.rec.date }), 'verified') : callout('warn', null, v.lapsed ? t('cam.vf.lapsed') : t('cam.nc.not_verified')),
      stale ? callout('warn', null, t('cam.nc.stale')) : null, warn ? callout('warn', null, t('cam.nc.warns', { n: warn })) : null,
      h('div', { class: 'note', text: t('cam.nc.stats', { lines: nc().lines.length, tools: new Set(nc().items.map((x) => x.tp.tool.number)).size }) })].filter(Boolean));
    const sv = document.querySelector('#modal [data-testid="nc-save"]'); if (sv) sv.disabled = stale;
  };
  const num = h('input', { type: 'text', inputmode: 'numeric', value: String(ops.progNo), 'data-testid': 'nc-progno', 'aria-label': t('cam.nc.progno') });
  const regen = h('button', { class: 'btn sm', type: 'button', 'data-testid': 'nc-regen', onclick: () => {
    const n = Number(num.value); if (!Number.isInteger(n) || n < 1 || n > 99999999) { toast(t('cam.nc.progno_bad'), { kind: 'warn' }); return; }
    ops.progNo = n; try { ops.nc = { ...ops.nc, ...ops.runPost(ops.nc.program, ops.nc.gates), vkey: vkey(ops.verifiedState()) }; draw(); } catch (e) { toast(errText(e), { kind: 'err' }); } } }, t('cam.nc.regen'));
  pre.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); mark(Math.max(0, Math.min(lineEls.length - 1, (sel < 0 ? -1 : sel) + (e.key === 'ArrowDown' ? 1 : -1)))); } });
  const save = async () => {
    if (ops.docSig() !== nc().docSig) { toast(t('cam.nc.stale'), { kind: 'warn' }); return; }
    try { const p = await app.writeOut(new TextEncoder().encode(nc().text), nc().name + '.nc', 'nc', true); if (p) toast(t('cam.nc.saved', { name: typeof p === 'string' ? p : nc().name + '.nc' }), { kind: 'ok' }); } catch (e) { toast(t('cam.nc.save_failed', { msg: errText(e) }), { kind: 'err' }); }
  };
  draw();
  const content = h('div', { class: 'nc-wrap' }, info, fld(t('cam.nc.progno'), h('div', { class: 'row-inline' }, unitBox(num), regen), { f: 'nc-progno' }), h('div', { class: 'note', text: t('cam.nc.click_hint') }), pre);
  setTimeout(() => draw(), 0);
  return modal({ title: t('cam.nc.title'), width: 760, cls: 'nc-modal', icon: 'nc-code', content, buttons: [{ label: t('cam.nc.save'), cls: 'primary', value: 'save', testid: 'nc-save', onClick: save }, { label: t('cam.nc.simulate'), value: 'sim', testid: 'nc-simulate', check: () => !(ops.docSig() !== nc().docSig) || (toast(t('cam.nc.stale'), { kind: 'warn' }), false) }, { label: t('cam.sheet.save'), value: 'sheet', testid: 'nc-sheet', onClick: () => { ops.sheet(); } }, { label: t('common.close'), cls: 'pri', value: 'close', testid: 'nc-close' }] });
}

// Kullanıcı beyanı: ad + tarih + not → doc.cam.verified (belge değişince düşer)
export async function openVerify(ops) {
  const cam = ops.cam; const v = ops.verifiedState(); const today = new Date().toISOString().slice(0, 10);
  const stale = ops.nc && ops.docSig() !== ops.nc.docSig;
  const by = h('input', { type: 'text', maxlength: 80, 'data-testid': 'vf-by', value: v.rec?.by || '' });
  const note = h('textarea', { rows: 3, maxlength: 400, 'data-testid': 'vf-note', placeholder: t('cam.vf.note_ph') }); note.value = v.ok ? v.rec.note : '';
  const chk = h('input', { type: 'checkbox', 'data-testid': 'vf-confirm' }); const err = h('div', { class: 'fieldmsg', role: 'alert', hidden: true });
  const kids = [callout('info', t('cam.vf.what_title'), t('cam.vf.what_body'))];
  if (v.ok) kids.push(callout('ok', t('cam.vf.ok_title'), t('cam.vf.ok_line', { by: v.rec.by, date: v.rec.date }) + (v.rec.note ? ' — ' + v.rec.note : ''), 'verified'));
  else if (v.lapsed) kids.push(callout('warn', null, t('cam.vf.lapsed')));
  if (!ops.nc) kids.push(callout('warn', null, t('cam.vf.need_nc')));
  else if (stale) kids.push(callout('warn', null, t('cam.nc.stale')));
  const can = !!ops.nc && !stale;
  if (can) kids.push(fld(t('cam.vf.by'), unitBox(by), { f: 'vf-by' }), fld(t('cam.vf.date'), h('div', { class: 'note', text: today, 'data-testid': 'vf-date' })), fld(t('cam.vf.note'), unitBox(note)),
    fld(t('cam.vf.confirm'), h('label', { class: 'check' }, chk, h('span', { class: 'box', html: icon('check', 'sm') }), h('span', { text: t('cam.vf.confirm_text') }))), err);
  void checkBox;
  const buttons = [{ label: t('common.cancel'), value: null }];
  if (v.ok) buttons.push({ label: t('cam.vf.remove'), value: 'remove', testid: 'vf-remove' });
  if (can) buttons.push({ label: t('cam.vf.do'), cls: 'pri primary', value: 'ok', testid: 'vf-ok', check: () => {
    const msg = !by.value.trim() ? t('cam.vf.err_by') : !note.value.trim() ? t('cam.vf.err_note') : !chk.checked ? t('cam.vf.err_confirm') : '';
    err.hidden = !msg; err.textContent = msg; return !msg; } });
  const r = await modal({ title: t('cam.vf.title'), width: 520, icon: 'unverified', content: h('div', {}, ...kids), buttons });
  if (r === 'ok') { const rec = { by: by.value.trim(), date: today, note: note.value.trim(), sig: ops.docSig() }; cam.mut((c) => { c.verified = { ...rec, sig: ops.docSig() }; }); toast(t('cam.vf.done'), { kind: 'ok' }); }
  else if (r === 'remove') cam.mut((c) => { c.verified = null; });
}
