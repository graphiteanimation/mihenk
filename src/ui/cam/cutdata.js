// Kesme verisi: malzeme x takim turu x cap -> devir/ilerleme ONERISI ("baslangic onerisi"), Vc/fz <-> S/F hesaplayici, kullanici kutuphanesi.
// Cekirdek: src/cam/cutdata.js (kaynaklar orada). Satirlar: belgede (doc.cam.cutLib) ya da kullanici ayarinda (tum belgeler).
import { h, modal } from '../dom.js';
import { t, fmtNum } from '../../shared/i18n.js';
import { MATERIALS, CUT_TYPES, BUILTIN, typeOfTool, suggest, rpmFromVc, vcFromRpm, feedFromFz, fzFromFeed, fzAt, normalizeEntry, entryIssues } from '../../cam/cutdata.js';
import { userCutLib, saveUserCutLib } from './store.js';
import { uid, parseNum, showNum, unitBox, fld, callout, sec, selField } from './util.js';

const matName = (m) => (MATERIALS.includes(m) ? t('cam.cd.m.' + m) : m);
const typeName = (x) => t('cam.cd.ty.' + x);

// opts.tool: op takimi (cap, agiz sayisi, tur) -> baslangic; opts.apply(rpm, feed): "Uygula" ile cagrilir
export async function openCutData(cam, opts = {}) {
  const data = () => cam.data(); const mach = cam.machine?.() || null;
  const tool = opts.tool || null;
  const st = { material: data().material || 'aluminum', type: tool ? typeOfTool(tool) : 'endmill', dia: tool?.dia ?? 10, z: tool?.flutes ?? 3, scope: 'doc' };
  const body = h('div', { class: 'cd', 'data-testid': 'cd-root' });
  const docLib = () => data().cutLib || []; const usrLib = () => userCutLib();
  const maxRpm = mach?.spindle?.maxRpm ?? null;
  const calc = { D: st.dia, vc: null, rpm: null, z: st.z, fz: null, F: null };
  let last = null;
  const num = (label, key, unit, f, onch) => {
    const inp = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'data-f': f, value: showNum(calc[key]), class: 'expr' });
    inp.addEventListener('input', () => { const v = parseNum(inp.value); calc[key] = Number.isNaN(v) ? null : v; onch(key); });
    return fld(label, unitBox(inp, unit), { f });
  };
  const recalc = (from) => { // Vc/D/S/z/fz/F zinciri
    const r = (v, n) => (v == null ? null : +v.toFixed(n));
    if (from === 'vc' || from === 'D') { if (calc.vc != null) calc.rpm = r(rpmFromVc(calc.vc, calc.D), 1); else if (calc.rpm != null) calc.vc = r(vcFromRpm(calc.rpm, calc.D), 2); }
    if (from === 'rpm') calc.vc = r(vcFromRpm(calc.rpm, calc.D), 2);
    if (from === 'F') calc.fz = r(fzFromFeed(calc.rpm, calc.z, calc.F), 5);
    else if (calc.fz != null && calc.rpm != null) calc.F = r(feedFromFz(calc.rpm, calc.z, calc.fz), 1);
    drawCalc();
  };
  const calcBox = h('div', { class: 'cd-calc', 'data-testid': 'cd-calc' });
  const drawCalc = () => { calcBox.replaceChildren(num(t('cam.cd.dia'), 'D', 'mm', 'cd-c-d', recalc), num('Vc', 'vc', 'm/min', 'cd-c-vc', recalc), num('S', 'rpm', t('cam.u.rpm'), 'cd-c-s', recalc), num('z', 'z', '', 'cd-c-z', recalc), num('fz', 'fz', 'mm', 'cd-c-fz', recalc), num('F', 'F', t('cam.u.mm_min'), 'cd-c-f', recalc)); };
  const sugBox = h('div', { class: 'cd-sug', 'data-testid': 'cd-sug' });
  const drawSug = () => {
    const all = [...new Set([...MATERIALS, ...docLib().map((e) => e.material), ...usrLib().map((e) => e.material)].filter(Boolean))];
    const sel = (label, val, opts2, f, set) => selField({ label, value: val, opts: opts2, f, set });
    const inNum = (label, key, unit, f, int) => { const inp = h('input', { type: 'text', inputmode: 'decimal', 'data-f': f, value: showNum(st[key]), class: 'expr' }); inp.addEventListener('input', () => { const v = parseNum(inp.value); st[key] = Number.isNaN(v) || v == null ? null : v; drawSugOut(); }); return fld(label, unitBox(inp, unit), { f }); };
    out.replaceChildren();
    sugBox.replaceChildren(sel(t('cam.cd.material'), st.material, all.map((m) => [m, matName(m)]), 'cd-material', (v) => { st.material = v; drawSugOut(); }),
      sel(t('cam.cd.type'), st.type, CUT_TYPES.map((x) => [x, typeName(x)]), 'cd-type', (v) => { st.type = v; drawSugOut(); }), inNum(t('cam.cd.dia'), 'dia', 'mm', 'cd-dia'), inNum(t('cam.cd.flutes'), 'z', '', 'cd-z', true), out);
    drawSugOut();
  };
  const out = h('div', { 'data-testid': 'cd-out' });
  const drawSugOut = () => {
    last = suggest({ docLib: docLib(), userLib: usrLib(), material: st.material, type: st.type, dia: st.dia, flutes: st.z, maxRpm });
    if (!last) { out.replaceChildren(callout('warn', null, t('cam.cd.none'))); return; }
    const src = last.source === 'builtin' ? t('cam.cd.src_builtin', { src: last.entry.source }) : last.source === 'doc' ? t('cam.cd.src_doc') : t('cam.cd.src_user');
    out.replaceChildren(h('div', { class: 'callout info', 'data-testid': 'cd-result' }, h('b', { text: t('cam.cd.badge') + ': ' }),
      h('span', { text: `Vc ${fmtNum(last.vc, 3)} m/min · S ${fmtNum(last.rpm, 0)} ${t('cam.u.rpm')} · fz ${fmtNum(last.fz, 4)} mm · F ${fmtNum(last.feed, 0)} ${t('cam.u.mm_min')}` }),
      h('div', { class: 'help', text: src }), last.limited ? h('div', { class: 'help', text: t('cam.cd.limited', { max: fmtNum(maxRpm, 0) }) }) : null, h('div', { class: 'help', text: t('cam.cd.disclaimer') })));
  };
  // ---- kutuphane
  const libBox = h('div', { class: 'cd-lib', 'data-testid': 'cd-lib' });
  const getLib = () => (st.scope === 'doc' ? docLib() : usrLib());
  const setLib = (l) => { if (st.scope === 'doc') cam.mut((c) => { if (l.length) c.cutLib = l; else delete c.cutLib; }); else saveUserCutLib(l); };
  const draw = () => {
    const lib = getLib(); const f = { material: '', type: 'endmill', diaMin: 0, diaMax: 1000, vc: null, fz: null };
    const fi = (key, ph, w) => h('input', { type: 'text', inputmode: key === 'material' ? 'text' : 'decimal', placeholder: ph, 'data-f': 'cd-n-' + key, style: { width: w }, oninput: (e) => { f[key] = key === 'material' ? e.target.value : parseNum(e.target.value); } });
    const tySel = h('select', { 'data-f': 'cd-n-type', onchange: (e) => { f.type = e.target.value; } }, CUT_TYPES.map((x) => h('option', { value: x, text: typeName(x) })));
    const add = h('button', { class: 'btn sm', type: 'button', 'data-testid': 'cd-add', onclick: () => {
      const e = normalizeEntry({ ...f, id: uid('cd'), diaMin: Number.isFinite(f.diaMin) ? f.diaMin : 0, diaMax: Number.isFinite(f.diaMax) ? f.diaMax : 1000 }); const bad = entryIssues(e);
      if (bad.length) { msgEl.textContent = t('cam.cd.bad_entry', { f: bad.join(', ') }); return; } msgEl.textContent = ''; setLib([...lib, e]); draw(); drawSug();
    } }, t('cam.cd.add'));
    const msgEl = h('div', { class: 'fieldmsg', role: 'alert', 'data-testid': 'cd-msg' });
    const rows = lib.map((e) => h('tr', { 'data-testid': 'cd-row', 'data-id': e.id }, h('td', { text: matName(e.material) }), h('td', { text: typeName(e.type) }), h('td', { class: 'r num', text: fmtNum(e.diaMin, 3) + '–' + fmtNum(e.diaMax, 3) }), h('td', { class: 'r num', text: fmtNum(e.vc, 3) }), h('td', { class: 'r num', text: fmtNum(e.fz, 4) }),
      h('td', {}, h('button', { class: 'btn sm ghost', type: 'button', 'data-testid': 'cd-del', onclick: () => { setLib(lib.filter((x) => x.id !== e.id)); draw(); drawSug(); } }, t('cam.tl.delete')))));
    const seg = h('div', { class: 'seg' }, [['doc', 'cam.cd.scope_doc'], ['user', 'cam.cd.scope_user']].map(([id, k]) => h('button', { type: 'button', 'aria-pressed': String(st.scope === id), 'data-testid': 'cd-scope-' + id, onclick: () => { st.scope = id; draw(); } }, t(k))));
    const bi = BUILTIN.map((b) => h('tr', { 'data-testid': 'cd-builtin' }, h('td', { text: matName(b.material) }), h('td', { text: typeName(b.type) }), h('td', { class: 'r num', text: fmtNum(b.vc, 3) }), h('td', { text: b.fzTable.map((q) => `Ø${fmtNum(q.dia, 3)}: ${fmtNum(q.fz, 4)}`).join(' · ') }), h('td', { class: 'note', text: b.source })));
    libBox.replaceChildren(sec(t('cam.cd.lib')), seg, h('div', { class: 'note', text: t(st.scope === 'doc' ? 'cam.cd.scope_doc_hint' : 'cam.cd.scope_user_hint') }),
      lib.length ? h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ['cam.cd.material', 'cam.cd.type', 'cam.cd.dia_range', 'Vc', 'fz', ''].map((k) => h('th', { text: k.startsWith('cam.') ? t(k) : k })))), h('tbody', {}, rows)) : h('div', { class: 'note', text: t('cam.cd.empty') }),
      h('div', { class: 'cd-new' }, fi('material', t('cam.cd.material'), '110px'), tySel, fi('diaMin', t('cam.cd.dia_min'), '60px'), fi('diaMax', t('cam.cd.dia_max'), '60px'), fi('vc', 'Vc m/min', '70px'), fi('fz', 'fz mm', '60px'), add), msgEl,
      sec(t('cam.cd.builtin') + ' — ' + t('cam.cd.badge')), h('table', { class: 'table', 'data-testid': 'cd-builtins' }, h('tbody', {}, bi)), h('div', { class: 'note', text: t('cam.cd.builtin_note') }));
  };
  drawCalc(); drawSug(); draw();
  body.append(sec(t('cam.cd.suggest')), sugBox, sec(t('cam.cd.calc')), h('div', { class: 'note', text: t('cam.cd.calc_hint') }), calcBox, libBox);
  const buttons = [...(opts.apply ? [{ label: t('cam.cd.apply'), value: 'apply', cls: 'pri primary', testid: 'cd-apply' }] : []), { label: t('common.close'), value: 'close', testid: 'cd-close' }];
  const v = await modal({ title: t('cam.cd.title'), width: 760, cls: 'cd-modal', content: body, buttons });
  if (st.material !== data().material) cam.mut((c) => { c.material = st.material; });
  if (v === 'apply' && last && opts.apply) opts.apply(Math.round(last.rpm), Math.round(last.feed));
  return v;
}
void fzAt;
