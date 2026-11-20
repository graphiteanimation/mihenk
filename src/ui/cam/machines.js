// Tezgâh yönetimi: liste (seç, kopyala, düzenle, sil, yeni) ve profil düzenleyici (kurslar, mil/ilerleme, A ekseni, dokunulmaz liste, post özellikleri).
import { h } from '../dom.js';
import { modal, confirmBox, promptText, toast } from '../dom.js';
import { icon } from '../icons.js';
import { t, errText, fmtNum } from '../../shared/i18n.js';
import { checkMachine, copyMachine, builtinMachines, GENERIC_3AXIS_ID } from '../../cam/machines/builtin.js';
import { exportMachines, importMachines } from '../../cam/machines/io.js';
import { listPosts, getPost } from '../../cam/post/index.js';
import { resolveProps, CONDITIONAL_PROPS } from '../../cam/post/engine.js';
import { PP, PP_ORDER } from './postopts.js';
import { allMachines, saveUserMachines, userMachines, machineName } from './store.js';
import { pickJson } from './toolui.js';
import { clone, uid, parseIntList, numField, textField, selField, checkField, sec, callout, fld, unitBox, msgBox, setMsg, blockedByBadField } from './util.js';

const WCS_LIST = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'];
// post özelliği tanımları ve sırası: ./postopts.js (saf modül, node testli)
const isNull = (v) => v === null || v === undefined || v === '';
// "doldurulmalı" vurgusu: alan boşken satır işaretlenir ve neden gerektiği yazılır
function needMark(row, whyText, empty) {
  const tag = h('div', { class: 'need-msg' }, h('span', { html: icon('warning', 'sm') }), h('span', { text: t('cam.fld.need') + ' ' + whyText }));
  row.querySelector('.ctl').append(tag);
  const upd = () => { const e = empty(); row.classList.toggle('need', e); tag.hidden = !e; };
  upd(); row.needUpdate = upd; return row;
}

// Koşulsuz gerekli ama boş post özellikleri (U-04/U-05). Koşullu olanlar yalnız koşul doğruysa: safeRetractZ (G53), g541Range (A ekseni).
// İsteğe bağlı (boş = yazma): rigidTapM, highSpeedOn/Off, soğutma M kodları (kullanılan soğutma türü için çekirdek ayrıca bildirir).
// Liste tek kaynaktan gelir: post motorunun CONDITIONAL_PROPS listesi (yalnız program kullanıyorsa gereken özellikler eksik sayılmaz).
const POST_OPTIONAL = new Set(CONDITIONAL_PROPS);
export function postMissing(machine) {
  if (!machine) return [];
  let props; try { props = resolveProps(getPost(machine.control), machine); } catch (e) { return []; }
  const out = PP_ORDER.filter((k) => k in props && PP[k] && ['sel', 'text', 'num'].includes(PP[k].kind) && !POST_OPTIONAL.has(k) && isNull(props[k]));
  if (props.safeRetract === 'G53' && isNull(props.safeRetractZ)) out.push('safeRetractZ');
  if (machine.axes?.A && !(Array.isArray(props.g541Range) && props.g541Range.length === 2 && props.g541Range.every((x) => !isNull(x)))) out.push('g541Range');
  return out;
}

export function newMachineTemplate() {
  const g = builtinMachines().find((m) => m.id === GENERIC_3AXIS_ID) || builtinMachines()[0];
  const c = copyMachine(g, uid('mc'), t('cam.mc.new_name')); delete c.nameKey; return c;
}

// ------------------------------------------------------------------ düzenleyici
// Dönüş: kaydedilen profil | null
export async function editMachine(machine, { isNew = false } = {}) {
  const d = clone(machine); if (!d.post) d.post = { props: {} }; if (!d.post.props) d.post.props = {};
  let tab = 'general'; const body = h('div', { class: 'mc-ed', 'data-testid': 'machine-editor' }); const errBox = h('div', { class: 'mc-err' });
  const TABS = [['general', 'cam.mc.tab_general'], ['axes', 'cam.mc.tab_axes'], ['spindle', 'cam.mc.tab_spindle'], ['protected', 'cam.mc.tab_protected'], ['post', 'cam.mc.tab_post']];
  const segEl = h('div', { class: 'seg', role: 'group', 'aria-label': t('cam.mc.sections') });
  const refreshErr = () => {
    const r = checkMachine(d); errBox.replaceChildren();
    if (r.errors.length) errBox.append(callout('err', t('cam.mc.invalid'), errText(r.errors[0])));
    return r;
  };
  const num = (label, get, set, o = {}) => {
    const row = numField({ label, value: get(), unit: o.unit, min: o.min, nullable: o.nullable !== false, int: o.int, f: o.f, keepBad: false, set: (v) => { set(v); refreshErr(); row.needUpdate?.(); } });
    if (o.why) needMark(row, o.why, () => isNull(get())); return row;
  };
  const drawGeneral = () => [
    textField({ label: t('cam.mc.name'), value: d.name, f: 'mc-name', max: 120, set: (v) => { d.name = v; delete d.nameKey; refreshErr(); } }),
    selField({ label: t('cam.mc.control'), value: d.control, f: 'mc-control', opts: listPosts().map((p) => [p, p]), set: (v) => { d.control = v; d.post.props = {}; draw(); refreshErr(); }, hint: t('cam.mc.control_hint') }),
    fld(t('cam.mc.rev'), h('span', { class: 'mono', text: String(d.rev ?? 1) })),
  ];
  const drawAxes = () => {
    const rows = [];
    for (const k of ['X', 'Y', 'Z']) {
      const a = d.axes[k] || (d.axes[k] = {});
      rows.push(sec(t('cam.mc.axis', { axis: k })),
        num(t('cam.mc.travel'), () => a.travel ?? null, (v) => { a.travel = v; }, { unit: 'mm', min: 0.001, f: 'ax-' + k + '-travel', why: t('cam.mcw.travel') }),
        num(t('cam.mc.min'), () => a.min ?? null, (v) => { a.min = v; }, { unit: 'mm', min: -1e6, f: 'ax-' + k + '-min' }),
        num(t('cam.mc.max'), () => a.max ?? null, (v) => { a.max = v; }, { unit: 'mm', min: -1e6, f: 'ax-' + k + '-max' }));
    }
    rows.push(sec(t('cam.mc.axis', { axis: 'A' })));
    rows.push(checkField({ label: t('cam.mc.a_enabled'), value: !!d.axes.A, f: 'ax-A-on', set: (on) => { if (on) d.axes.A = { kind: 'rotary', about: 'X', dir: [-1, 0, 0], limits: null, shortest: true, wrap: null, rapid: null, feedMax: null, centerHeight: null, clamp: { lock: 'M10', unlock: 'M11', output: false } }; else delete d.axes.A; draw(); refreshErr(); } }));
    const A = d.axes.A;
    if (A) {
      rows.push(selField({ label: t('cam.mc.a_dir'), value: A.dir[0] < 0 ? '-' : '+', f: 'ax-A-dir', opts: [['-', t('cam.mc.a_dir_neg')], ['+', t('cam.mc.a_dir_pos')]], hint: t('cam.mc.a_dir_hint'), set: (v) => { A.dir = [v === '-' ? -1 : 1, 0, 0]; refreshErr(); } }));
      rows.push(checkField({ label: t('cam.mc.a_unlimited'), value: A.limits == null, f: 'ax-A-unl', set: (on) => { A.limits = on ? null : [-360, 360]; draw(); refreshErr(); } }));
      if (A.limits) rows.push(num(t('cam.mc.a_lim_min'), () => A.limits[0], (v) => { if (v !== null) A.limits[0] = v; }, { unit: '°', nullable: false, min: -1e5, f: 'ax-A-lmin' }), num(t('cam.mc.a_lim_max'), () => A.limits[1], (v) => { if (v !== null) A.limits[1] = v; }, { unit: '°', nullable: false, min: -1e5, f: 'ax-A-lmax' }));
      rows.push(checkField({ label: t('cam.mc.a_shortest'), value: !!A.shortest, f: 'ax-A-short', set: (v) => { A.shortest = v; refreshErr(); } }));
      // A.wrap: A kelimesinin yazım biçimi (boş = yukarıdaki "kısa yoldan dön" seçeneğine göre)
      rows.push(selField({ label: t('cam.mc.a_wrap'), value: A.wrap ?? '', f: 'ax-A-wrap', hint: t('cam.mc.a_wrap_hint'), opts: [['', t('cam.mc.a_wrap_auto')], ['shortest', t('cam.mc.a_wrap_shortest')], ['signed', t('cam.mc.a_wrap_signed')], ['0-360', t('cam.mc.a_wrap_abs')]], set: (v) => { A.wrap = v || null; refreshErr(); } }));
      rows.push(num(t('cam.mc.a_rapid'), () => A.rapid ?? null, (v) => { A.rapid = v; }, { unit: t('cam.u.deg_min'), min: 0.001, f: 'ax-A-rapid' }), num(t('cam.mc.a_feedmax'), () => A.feedMax ?? null, (v) => { A.feedMax = v; }, { unit: t('cam.u.deg_min'), min: 0.001, f: 'ax-A-feedmax' }),
        num(t('cam.mc.a_center'), () => A.centerHeight ?? null, (v) => { A.centerHeight = v; }, { unit: 'mm', min: 0.001, f: 'ax-A-center' }));
      A.clamp = A.clamp || { lock: 'M10', unlock: 'M11', output: false };
      rows.push(checkField({ label: t('cam.mc.a_clamp'), value: !!A.clamp.output, f: 'ax-A-clamp', hint: t('cam.mc.a_clamp_hint'), set: (v) => { A.clamp.output = v; draw(); refreshErr(); } }));
      if (A.clamp.output) rows.push(textField({ label: t('cam.mc.a_lock'), value: A.clamp.lock, f: 'ax-A-lock', max: 8, set: (v) => { A.clamp.lock = v; refreshErr(); } }), textField({ label: t('cam.mc.a_unlock'), value: A.clamp.unlock, f: 'ax-A-unlock', max: 8, set: (v) => { A.clamp.unlock = v; refreshErr(); } }));
    }
    return rows;
  };
  const drawSpindle = () => [
    num(t('cam.mc.max_rpm'), () => d.spindle.maxRpm ?? null, (v) => { d.spindle.maxRpm = v; }, { unit: t('cam.u.rpm'), min: 1, f: 'sp-max', why: t('cam.mcw.max_rpm') }),
    num(t('cam.mc.min_rpm'), () => d.spindle.minRpm ?? null, (v) => { d.spindle.minRpm = v; }, { unit: t('cam.u.rpm'), min: 0.001, f: 'sp-min' }),
    num(t('cam.mc.feed_max'), () => d.feed.maxCut ?? null, (v) => { d.feed.maxCut = v; }, { unit: t('cam.u.mm_min'), min: 0.001, f: 'fd-max', why: t('cam.mcw.feed_max') }),
    num(t('cam.mc.feed_rapid'), () => d.feed.rapid ?? null, (v) => { d.feed.rapid = v; }, { unit: t('cam.u.mm_min'), min: 0.001, f: 'fd-rapid' }),
    num(t('cam.mc.max_tools'), () => d.toolChange.maxTools ?? null, (v) => { d.toolChange.maxTools = v; }, { int: true, min: 1, f: 'tc-max' }),
    selField({ label: t('cam.mc.tc_kind'), value: d.toolChange.kind, f: 'tc-kind', opts: [['random', t('cam.mc.tc_random')], ['fixed', t('cam.mc.tc_fixed')]], set: (v) => { d.toolChange.kind = v; refreshErr(); } }),
  ];
  const drawProtected = () => {
    const P = d.protected; const rows = [callout('warn', t('cam.mc.prot_title'), t('cam.mc.prot_body'))];
    if (d.protected.noteKey) rows.push(callout('info', null, t(d.protected.noteKey)));
    for (const [k, lab] of [['T', 'cam.mc.prot_t'], ['H', 'cam.mc.prot_h'], ['D', 'cam.mc.prot_d']]) {
      const inp = h('input', { type: 'text', 'data-f': 'prot-' + k, value: (P[k] || []).join(', '), autocomplete: 'off', spellcheck: 'false' }); const m = msgBox(); const box = unitBox(inp, '');
      inp.addEventListener('input', () => { const l = parseIntList(inp.value); box.classList.toggle('err', l === null); if (l === null) setMsg(m, t('cam.mc.prot_bad')); else { setMsg(m, ''); P[k] = [...new Set(l)].sort((a, b) => a - b); refreshErr(); } });
      rows.push(fld(t(lab), h('div', {}, box, m)));
    }
    const wrow = h('div', { class: 'wcs-grid' }, WCS_LIST.map((w) => { const c = h('input', { type: 'checkbox', 'data-f': 'prot-' + w, checked: (P.wcs || []).includes(w) }); c.addEventListener('change', () => { P.wcs = c.checked ? [...new Set([...(P.wcs || []), w])] : (P.wcs || []).filter((x) => x !== w); refreshErr(); }); return h('label', { class: 'wcs-i' }, c, h('span', { text: w })); }));
    rows.push(fld(t('cam.mc.prot_wcs'), wrow));
    const extra = (P.wcs || []).filter((w) => !WCS_LIST.includes(w)).join(', ');
    const xi = h('input', { type: 'text', 'data-f': 'prot-wcs-extra', value: extra, autocomplete: 'off', spellcheck: 'false' });
    xi.addEventListener('input', () => { const ex = xi.value.split(/[,;]+/).map((x) => x.trim()).filter(Boolean); P.wcs = [...(P.wcs || []).filter((w) => WCS_LIST.includes(w)), ...ex]; refreshErr(); });
    rows.push(fld(t('cam.mc.prot_extra'), h('div', {}, unitBox(xi, ''), h('div', { class: 'help', text: t('cam.mc.prot_extra_hint') }))));
    return rows;
  };
  const drawPost = () => {
    let post; try { post = getPost(d.control); } catch (e) { return [callout('err', null, errText(e))]; }
    const defs = post.defaultProps; const rows = [callout('info', null, t('cam.mc.post_intro'))];
    const eff = (k) => (k in d.post.props ? d.post.props[k] : defs[k]);
    const keys = PP_ORDER.filter((k) => k in defs);
    for (const k of keys) {
      const desc = PP[k]; const label = t('cam.pp.' + k); const why = t('cam.ppw.' + k.replace(/[^A-Za-z0-9]/g, ''));
      const setP = (v) => { d.post.props[k] = v; refreshErr(); };
      let row;
      if (desc.kind === 'sel') { row = selField({ label, value: eff(k) ?? '', f: 'pp-' + k, opts: [['', t('cam.mc.pp_empty')], ...desc.opts.map((o) => [o, o])], set: (v) => { setP(v === '' ? null : v); row.needUpdate?.(); } }); needMark(row, why, () => isNull(eff(k))); }
      else if (desc.kind === 'text') { row = textField({ label, value: eff(k) ?? '', f: 'pp-' + k, max: 40, set: (v) => { setP(v.trim() === '' ? null : v.trim()); row.needUpdate?.(); } }); needMark(row, why, () => isNull(eff(k))); }
      else if (desc.kind === 'num') { row = numField({ label, value: eff(k), unit: desc.unit, nullable: true, int: desc.int, f: 'pp-' + k, set: (v) => { setP(v); row.needUpdate?.(); } }); needMark(row, why, () => isNull(eff(k))); }
      else if (desc.kind === 'bool') row = checkField({ label, value: !!eff(k), f: 'pp-' + k, set: (v) => setP(v) });
      else if (desc.kind === 'range') {
        const cur = () => (Array.isArray(eff(k)) ? eff(k) : [null, null]);
        const a = numField({ label: t('cam.mc.min'), value: cur()[0], nullable: true, int: true, f: 'pp-' + k + '-min', set: (v) => { const c = cur().slice(); c[0] = v; setP(c[0] === null && c[1] === null ? null : c); row.needUpdate?.(); } });
        const b = numField({ label: t('cam.mc.max'), value: cur()[1], nullable: true, int: true, f: 'pp-' + k + '-max', set: (v) => { const c = cur().slice(); c[1] = v; setP(c[0] === null && c[1] === null ? null : c); row.needUpdate?.(); } });
        row = h('div', {}, fld(label, h('span', {})), a, b); const lab = row.firstChild; needMark(lab, why, () => !Array.isArray(eff(k)) || cur().some(isNull)); row.needUpdate = lab.needUpdate; // U-17: aralık dolunca vurgu kalksın
      } else if (desc.kind === 'codes') {
        row = h('div', {}, sec(label));
        for (const ck of desc.keys) {
          const cur = () => (eff(k) || {})[ck]; const w = t('cam.ppw.coolant.' + ck);
          const r = textField({ label: t('cam.cool.' + ck), value: cur() ?? '', f: 'pp-cool-' + ck, max: 12, set: (v) => { d.post.props[k] = { ...(eff(k) || {}), [ck]: v.trim() === '' ? null : v.trim() }; refreshErr(); r.needUpdate?.(); } });
          needMark(r, w, () => isNull(cur())); row.append(r);
        }
      }
      rows.push(row);
    }
    return rows;
  };
  const DRAW = { general: drawGeneral, axes: drawAxes, spindle: drawSpindle, protected: drawProtected, post: drawPost };
  function draw() {
    segEl.replaceChildren(...TABS.map(([id, key]) => h('button', { type: 'button', 'aria-pressed': String(id === tab), 'data-testid': 'mc-tab-' + id, onclick: () => { tab = id; draw(); } }, t(key))));
    body.replaceChildren(...DRAW[tab]());
    refreshErr();
  }
  draw();
  const title = isNew ? t('cam.mc.title_new') : t('cam.mc.title_edit', { name: d.name });
  const r = await modal({ title, width: 640, cls: 'mc-modal', content: h('div', {}, segEl, body, errBox), buttons: [{ label: t('common.cancel'), value: null }, { label: t('common.ok'), cls: 'pri primary', value: true, testid: 'mc-ok', check: () => { if (blockedByBadField()) { errBox.append(callout('err', t('cam.mc.invalid'), t('cam.su.fix_fields'))); return false; } return !checkMachine(d).errors.length; } }] });
  if (!r) return null;
  d.rev = (d.rev || 1) + (isNew ? 0 : 1);
  return d;
}

// ------------------------------------------------------------------ yönetici
// Tek kip penceresi kökü olduğundan işlemler (kopyala/düzenle/sil/yeni) yönetici penceresini kapatır, işlem bitince yönetici yeniden açılır.
export async function openMachineManager(cam) {
  const persist = (list) => { if (!saveUserMachines(list)) toast(t('cam.mc.save_failed'), true); };
  for (;;) {
    let pending = null;
    const wrap = h('div', { class: 'mc-list', 'data-testid': 'machine-manager' });
    const go = (act, m) => () => { pending = { act, m }; document.querySelector('#modal .actions button[data-v="act"]')?.click(); };
    const draw = () => {
      const cur = cam.effectiveMachineId; const list = allMachines();
      const noUser = !userMachines().length;
      wrap.replaceChildren(noUser ? h('div', { class: 'note', 'data-testid': 'mc-empty', text: t('cam.mc.empty_user') }) : null, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', { text: t('cam.mc.col_name') }), h('th', { text: t('cam.mc.col_control') }), h('th', { text: t('cam.mc.col_missing') }), h('th', { text: '' }))),
        h('tbody', {}, list.map((m) => {
          const miss = checkMachine(m).missing.length + postMissing(m).length; const act = (label, ic, fn, tid) => h('button', { class: 'btn sm ghost', type: 'button', 'data-testid': tid, 'aria-label': label, title: label, onclick: fn, html: icon(ic, 'sm') });
          return h('tr', { class: m.id === cur ? 'sel' : '', 'data-id': m.id, 'data-testid': 'mc-row' },
            h('td', {}, h('label', { class: 'mc-pick' }, h('input', { type: 'radio', name: 'mc', checked: m.id === cur, 'data-testid': 'mc-use', onchange: () => { cam.setMachine(m.id); draw(); } }), h('span', { text: machineName(m) }), m.builtin ? h('span', { class: 'badge info', text: t('cam.mc.builtin') }) : null)),
            h('td', { class: 'mono', text: m.control }), h('td', { class: miss ? 'err' : '', text: miss ? t('cam.mc.n_missing', { n: miss }) : '—' }),
            h('td', { class: 'r' }, act(t('cam.mc.copy'), 'duplicate', go('copy', m), 'mc-copy'), act(t('cam.mc.export'), 'export', go('export', m), 'mc-export'), m.builtin ? null : act(t('cam.mc.edit'), 'properties', go('edit', m), 'mc-edit'), m.builtin ? null : act(t('cam.mc.delete'), 'trash', go('del', m), 'mc-del')));
        }))));
    };
    draw();
    const r = modal({ title: t('cam.mc.manager_title'), width: 720, content: h('div', {}, h('div', { class: 'note', text: t('cam.mc.manager_hint') }), wrap),
      buttons: [{ label: t('cam.mc.new'), value: 'new', testid: 'mc-new' }, { label: t('cam.mc.import'), value: 'import', testid: 'mc-import' }, { label: '', value: 'act' }, { label: t('common.close'), cls: 'pri primary', value: 'close' }] });
    document.querySelector('#modal .actions button[data-v="act"]')?.setAttribute('hidden', '');
    const v = await r;
    if (v === 'new') { const ed = await editMachine(newMachineTemplate(), { isNew: true }); if (ed) { persist([...userMachines(), ed]); cam.touchMachine(ed.id); } continue; }
    if (v === 'import') {
      let text; try { text = await pickJson(); } catch (e) { toast(t('cam.mc.import_failed', { msg: errText(e) }), true); continue; } if (text == null) continue;
      try {
        const res = importMachines(text, allMachines().map((x) => x.id));
        if (res.machines.length) { persist([...userMachines(), ...res.machines]); cam.refreshMachines(); }
        const n = res.machines.length;
        toast(res.errors.length ? t('cam.mc.imported_some', { n, bad: res.errors.length, first: errText({ code: res.errors[0].code, params: res.errors[0].params }) }) : t('cam.mc.imported', { n }), { kind: res.errors.length ? 'warn' : 'ok' });
      } catch (e) { toast(t('cam.mc.import_failed', { msg: errText(e) }), true); }
      continue;
    }
    if (v !== 'act' || !pending) return;
    const { act, m } = pending;
    if (act === 'export') {
      try { const bytes = new TextEncoder().encode(exportMachines([m])); const p = await cam.app.writeOut(bytes, t('cam.mc.export_name') + '.json', 'json', true); if (p) toast(t('cam.mc.exported', { name: machineName(m) })); } catch (e) { toast(t('cam.mc.export_failed', { msg: errText(e) }), true); }
    } else if (act === 'copy') {
      const nm = await promptText(t('cam.mc.copy_title'), t('cam.mc.copy_name', { name: machineName(m) })); if (!nm) continue;
      const c = copyMachine(m, uid('mc'), nm); delete c.nameKey; persist([...userMachines(), c]);
      const ed = await editMachine(c); persist(userMachines().map((x) => (x.id === c.id ? (ed || c) : x))); cam.touchMachine(c.id);
    } else if (act === 'edit') { const ed = await editMachine(m); if (ed) { persist(userMachines().map((x) => (x.id === ed.id ? ed : x))); cam.touchMachine(ed.id); } }
    else if (act === 'del') {
      if (await confirmBox(t('cam.mc.del_title'), t('cam.mc.del_body', { name: machineName(m) }), t('cam.mc.delete'), t('common.giveup'), { danger: true })) { persist(userMachines().filter((x) => x.id !== m.id)); if (cam.machineId === m.id) cam.setMachine(allMachines()[0].id); }
    }
  }
}
