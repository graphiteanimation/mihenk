// Takım yönetimi: belge takımları (doc.cam.tools) ve kullanıcı kütüphanesi; ekle/düzenle/kopyala/sil, preset, JSON içe/dışa aktarma.
import { h, modal, confirmBox, toast } from '../dom.js';
import { icon } from '../icons.js';
import { t, errText, fmtNum } from '../../shared/i18n.js';
import { TOOL_TYPES, COOLANTS, normalizeTool, toolListIssues, exportLibrary, importLibrary, LIB_FORMAT } from '../../cam/tools.js';
import { toolLibrary, saveToolLibrary } from './store.js';
import { clone, uid, numField, textField, selField, checkField, sec, callout, fld, unitBox, blockedByBadField } from './util.js';

const TIP = new Set(['drill', 'spot', 'chamfer']);
export const toolLabel = (tool) => `T${tool.number} · Ø${fmtNum(tool.dia, 3)} · ${t('cam.tt.' + tool.type)}`;

// Dokunulmaz listeye çarpan numaralar: [{kind:'T'|'H'|'D', n}]
export function protectedHits(prot, tool) {
  const hits = []; if (!prot) return hits;
  if ((prot.T || []).includes(tool.number)) hits.push({ kind: 'T', n: tool.number });
  if ((prot.H || []).includes(tool.lengthOffset)) hits.push({ kind: 'H', n: tool.lengthOffset });
  if (tool.diaOffset != null && (prot.D || []).includes(tool.diaOffset)) hits.push({ kind: 'D', n: tool.diaOffset });
  return hits;
}
const protWarn = (prot, kind, v) => (v !== null && prot && (prot[kind] || []).includes(v) ? t('cam.tl.protected', { kind, n: v }) : null);

export function newTool(type, existing, prot) {
  const used = new Set(existing.map((x) => x.number)); const blocked = new Set([...(prot?.T || [])]);
  let n = 1; while (used.has(n) || blocked.has(n) || (prot?.H || []).includes(n) || (prot?.D || []).includes(n)) n++;
  const base = { id: uid('tool'), number: n, lengthOffset: n, diaOffset: n, type, name: '', dia: 10, fluteLen: 20, bodyLen: 50, flutes: 4, centerCutting: type === 'drill' || type === 'spot' || type === 'tap', material: '', note: '', presets: [] };
  if (type === 'ball') base.cornerR = 5; if (type === 'bullnose') base.cornerR = 1; if (TIP.has(type)) base.tipAngle = type === 'chamfer' ? 90 : type === 'spot' ? 90 : 118; if (type === 'tap') base.pitch = 1.5;
  if (type === 'drill' || type === 'spot') base.flutes = 2;
  return base;
}

// Tek takım düzenleyici. Dönüş: kaydedilen takım | null. opts: {isNew, prot, others (aynı kapsamdaki diğer takımlar), strictNumber}
export async function editTool(tool, { isNew = false, prot = null, others = [], strictNumber = true } = {}) {
  const d = clone(tool); if (!d.presets) d.presets = [];
  let tab = 'general'; const body = h('div', { class: 'tl-ed', 'data-testid': 'tool-editor' }); const errBox = h('div', { class: 'mc-err' });
  const segEl = h('div', { class: 'seg', role: 'group' });
  const TABS = [['general', 'cam.tl.tab_general'], ['geom', 'cam.tl.tab_geom'], ['presets', 'cam.tl.tab_presets']];
  const check = () => {
    errBox.replaceChildren(); let ok = true;
    try { normalizeTool(d); } catch (e) { errBox.append(callout('err', t('cam.tl.invalid'), errText(e))); ok = false; }
    const iss = toolListIssues([...others.filter((x) => x.id !== d.id), d]);
    const dup = iss.find((x) => x.code === 'cam.tool.dup_number');
    if (dup) { errBox.append(callout(strictNumber ? 'err' : 'warn', null, errText(dup))); if (strictNumber) ok = false; }
    const hits = protectedHits(prot, d);
    if (hits.length) errBox.append(callout('warn', t('cam.tl.prot_title'), t('cam.tl.prot_body', { list: hits.map((x) => x.kind + x.n).join(', ') }), 'warning'));
    return ok;
  };
  // Tamam: taslak geçerli olsa bile kırmızı alan varsa (alan eski değeri koruyor) kaydetme
  const okCheck = () => { const ok = check(); if (blockedByBadField()) { errBox.append(callout('err', t('cam.tl.invalid'), t('cam.su.fix_fields'))); return false; } return ok; };
  const num = (label, key, o = {}) => numField({ label, value: d[key] ?? null, unit: o.unit ?? 'mm', min: o.min, max: o.max, int: o.int, nullable: o.nullable, f: 'tl-' + key, hint: o.hint, warn: o.warn, set: (v) => { if (v === null) delete d[key]; else d[key] = v; check(); } });
  const drawGeneral = () => [
    textField({ label: t('cam.tl.name'), value: d.name ?? '', f: 'tl-name', max: 120, set: (v) => { d.name = v; check(); } }),
    selField({ label: t('cam.tl.type'), value: d.type, f: 'tl-type', opts: TOOL_TYPES.map((x) => [x, t('cam.tt.' + x)]), set: (v) => { d.type = v; if (!TIP.has(v)) delete d.tipDia; if (v === 'ball') d.cornerR = d.dia / 2; if (v === 'bullnose' && !(d.cornerR > 0 && d.cornerR < d.dia / 2)) d.cornerR = Math.min(1, d.dia / 4); if (TIP.has(v) && !d.tipAngle) d.tipAngle = v === 'drill' ? 118 : 90; if (v === 'tap' && !d.pitch) d.pitch = 1.5; if (v === 'drill' || v === 'spot') d.centerCutting = true; draw(); } }),
    sec(t('cam.tl.numbers')),
    num(t('cam.tl.number'), 'number', { unit: 'T', int: true, min: 1, max: 99999, warn: (v) => protWarn(prot, 'T', v) }),
    num(t('cam.tl.length_off'), 'lengthOffset', { unit: 'H', int: true, min: 1, max: 99999, warn: (v) => protWarn(prot, 'H', v) }),
    num(t('cam.tl.dia_off'), 'diaOffset', { unit: 'D', int: true, min: 1, max: 99999, nullable: true, hint: t('cam.tl.dia_off_hint'), warn: (v) => protWarn(prot, 'D', v) }),
    textField({ label: t('cam.tl.material'), value: d.material ?? '', f: 'tl-material', max: 120, set: (v) => { d.material = v; } }),
    textField({ label: t('cam.tl.note'), value: d.note ?? '', f: 'tl-note', max: 400, set: (v) => { d.note = v; } }),
  ];
  const drawGeom = () => {
    const r = [num(t('cam.tl.dia'), 'dia', { min: 0.001, max: 2000, int: false })];
    if (d.type === 'bullnose') r.push(num(t('cam.tl.corner_r'), 'cornerR', { min: 0.001 }));
    if (TIP.has(d.type)) r.push(num(t('cam.tl.tip_angle'), 'tipAngle', { unit: '°', min: 1, max: 179 }));
    if (TIP.has(d.type)) r.push(num(t('cam.tl.tip_dia'), 'tipDia', { min: 0, nullable: true, hint: t('cam.tl.tip_dia_hint') }));
    if (d.type === 'tap') r.push(num(t('cam.tl.pitch'), 'pitch', { min: 0.01, max: 19.99 }));
    r.push(num(t('cam.tl.flute_len'), 'fluteLen', { min: 0.001 }), num(t('cam.tl.body_len'), 'bodyLen', { min: 0.001, hint: t('cam.tl.body_len_hint') }), num(t('cam.tl.shaft_dia'), 'shaftDia', { min: 0.001, nullable: true, hint: t('cam.tl.shaft_hint') }), num(t('cam.tl.flutes'), 'flutes', { unit: '', int: true, min: 1, max: 100 }));
    if (d.type !== 'drill' && d.type !== 'spot') r.push(checkField({ label: t('cam.tl.center_cutting'), value: !!d.centerCutting, f: 'tl-cc', hint: t('cam.tl.cc_hint'), set: (v) => { d.centerCutting = v; draw(); } }));
    if (!d.centerCutting) r.push(num(t('cam.tl.max_ramp'), 'maxRampAngle', { unit: '°', min: 0.001, max: 90, nullable: true, hint: t('cam.tl.max_ramp_hint') }));
    r.push(sec(t('cam.tl.holder')));
    const hd = () => d.holder || null;
    // WP-13: gerçek tutucu profili "boy x çap[-çap2]; ..." (takım ucundan bodyLen yukarıdan başlayarak, aşağıdan yukarı); boşsa tek silindir
    const segTxt = (hd()?.segments || []).map((q) => `${q.len}x${q.d0}${q.d1 != null && q.d1 !== q.d0 ? '-' + q.d1 : ''}`).join('; ');
    r.push(textField({ label: t('cam.tl.holder_profile'), value: segTxt, f: 'tl-holder-profile', placeholder: '10x20-40; 40x40', set: (v) => {
      const txt = v.trim(); if (!txt) { if (d.holder?.segments) { const { segments, ...rest } = d.holder; void segments; d.holder = rest.dia > 0 && rest.len > 0 ? rest : undefined; if (!d.holder) delete d.holder; } check(); return; }
      const segs = txt.split(';').map((p) => /^\s*([\d.]+)\s*[x×*]\s*([\d.]+)\s*(?:-\s*([\d.]+))?\s*$/i.exec(p)).map((m) => (m ? { len: Number(m[1]), d0: Number(m[2]), ...(m[3] ? { d1: Number(m[3]) } : {}) } : null));
      d.holder = { ...(hd() || {}), segments: segs.every(Boolean) ? segs : [] }; check(); } }));
    r.push(h('div', { class: 'help', text: t('cam.tl.holder_profile_hint') }));
    r.push(numField({ label: t('cam.tl.holder_dia'), value: hd()?.dia ?? null, unit: 'mm', nullable: true, min: 0.001, f: 'tl-holder-dia', set: (v) => { d.holder = { ...(hd() || {}), dia: v ?? 0, len: hd()?.len ?? 0 }; if (v === null && !(hd()?.len)) delete d.holder; check(); } }));
    r.push(numField({ label: t('cam.tl.holder_len'), value: hd()?.len ?? null, unit: 'mm', nullable: true, min: 0.001, f: 'tl-holder-len', hint: t('cam.tl.holder_hint'), set: (v) => { d.holder = { ...(hd() || {}), dia: hd()?.dia ?? 0, len: v ?? 0 }; if (v === null && !(hd()?.dia)) delete d.holder; check(); } }));
    return r;
  };
  const drawPresets = () => {
    const wrap = h('div', { class: 'tl-presets' });
    const render = () => {
      wrap.replaceChildren(...d.presets.map((p, i) => {
        const pn = (key, label, unit, o = {}) => numField({ label, value: p[key] ?? null, unit, nullable: !!o.nullable, min: 0.001, f: `pr-${i}-${key}`, set: (v) => { if (v === null) delete p[key]; else p[key] = v; check(); } });
        return h('div', { class: 'tl-preset', 'data-testid': 'preset-row' }, h('div', { class: 'tl-preset-h' }, textField({ label: t('cam.tl.p_name'), value: p.name, f: `pr-${i}-name`, max: 80, set: (v) => { p.name = v; check(); } }),
          h('button', { class: 'btn sm ghost', type: 'button', 'aria-label': t('cam.tl.p_delete'), title: t('cam.tl.p_delete'), onclick: () => { d.presets.splice(i, 1); render(); check(); }, html: icon('trash', 'sm') })),
          pn('rpm', t('cam.u.rpm_l'), t('cam.u.rpm')), pn('feedCut', t('cam.u.feed_cut'), t('cam.u.mm_min')), pn('feedPlunge', t('cam.u.feed_plunge'), t('cam.u.mm_min')), pn('feedRamp', t('cam.u.feed_ramp'), t('cam.u.mm_min'), { nullable: true }),
          pn('stepdown', t('cam.u.stepdown'), 'mm', { nullable: true }), pn('stepover', t('cam.u.stepover'), 'mm', { nullable: true }),
          selField({ label: t('cam.u.coolant'), value: p.coolant, f: `pr-${i}-coolant`, opts: COOLANTS.map((c) => [c, t('cam.cool.' + c)]), set: (v) => { p.coolant = v; check(); } }));
      }), d.presets.length ? null : h('div', { class: 'note', text: t('cam.tl.p_none') }),
      h('button', { class: 'btn', type: 'button', 'data-testid': 'preset-add', onclick: () => { d.presets.push({ name: t('cam.tl.p_default', { n: d.presets.length + 1 }), rpm: 3000, feedCut: 600, feedPlunge: 200, coolant: 'flood' }); render(); check(); } }, h('span', { html: icon('plus', 'sm') }), h('span', { text: t('cam.tl.p_add') })));
    };
    render(); return [callout('info', null, t('cam.tl.p_hint')), wrap];
  };
  const DRAW = { general: drawGeneral, geom: drawGeom, presets: drawPresets };
  function draw() {
    segEl.replaceChildren(...TABS.map(([id, key]) => h('button', { type: 'button', 'aria-pressed': String(id === tab), 'data-testid': 'tl-tab-' + id, onclick: () => { tab = id; draw(); } }, t(key))));
    body.replaceChildren(...DRAW[tab]()); check();
  }
  draw();
  const r = await modal({ title: isNew ? t('cam.tl.title_new') : t('cam.tl.title_edit', { name: d.name || 'T' + d.number }), width: 620, cls: 'mc-modal', content: h('div', {}, segEl, body, errBox), buttons: [{ label: t('common.cancel'), value: null }, { label: t('common.ok'), cls: 'pri primary', value: true, testid: 'tl-ok', check: okCheck }] });
  if (!r) return null;
  return normalizeTool(d);
}

// Dosyadan metin: Electron'da ana süreç diyaloğu (kind 'json'), tarayıcıda dosya seçici
export function pickJson() {
  if (window.native) return window.native.openFile('json').then((r) => (r ? new TextDecoder().decode(new Uint8Array(r.data)) : null));
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } }); document.body.append(inp);
    inp.addEventListener('change', async () => { const f = inp.files[0]; inp.remove(); resolve(f ? await f.text() : null); });
    inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
    inp.click();
  });
}

// cam: denetleyici ({tools(), setTools(fn), protectedLists(), app}). scope: 'doc' | 'lib'
export async function openToolManager(cam, scope = 'doc') {
  for (;;) {
    let pending = null; const prot = cam.protectedLists();
    const wrap = h('div', { class: 'tl-list', 'data-testid': 'tool-manager' }); const segEl = h('div', { class: 'seg', role: 'group', 'aria-label': t('cam.tl.scope') });
    const list = () => (scope === 'doc' ? cam.tools() : toolLibrary());
    const go = (act, tool) => () => { pending = { act, tool }; document.querySelector('#modal .actions button[data-v="act"]')?.click(); };
    const draw = () => {
      segEl.replaceChildren(...[['doc', 'cam.tl.scope_doc'], ['lib', 'cam.tl.scope_lib']].map(([id, k]) => h('button', { type: 'button', 'data-testid': 'tl-scope-' + id, 'aria-pressed': String(scope === id), onclick: () => { scope = id; draw(); } }, t(k))));
      const rows = list().slice().sort((a, b) => a.number - b.number);
      const act = (label, ic, fn, tid) => h('button', { class: 'btn sm ghost', type: 'button', 'data-testid': tid, 'aria-label': label, title: label, onclick: fn, html: icon(ic, 'sm') });
      wrap.replaceChildren(rows.length ? h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ['cam.tl.col_t', 'cam.tl.col_name', 'cam.tl.col_type', 'cam.tl.col_dia', 'cam.tl.col_flutes', 'cam.tl.col_presets', ''].map((k) => h('th', { text: k ? t(k) : '' })))),
        h('tbody', {}, rows.map((x) => {
          const hit = protectedHits(prot, x);
          return h('tr', { 'data-id': x.id, 'data-testid': 'tool-row', 'data-num': x.number, class: hit.length ? 'err' : '' },
            h('td', {}, h('span', { class: 'mono', text: 'T' + x.number }), hit.length ? h('span', { class: 'badge warn', title: t('cam.tl.prot_body', { list: hit.map((q) => q.kind + q.n).join(', ') }), html: icon('warning', 'sm') }) : null),
            h('td', { text: x.name || '—' }), h('td', { text: t('cam.tt.' + x.type) }), h('td', { class: 'r num', text: fmtNum(x.dia, 3) }), h('td', { class: 'r num', text: String(x.flutes) }), h('td', { class: 'r num', text: String((x.presets || []).length) }),
            h('td', { class: 'r' }, scope === 'lib' ? act(t('cam.tl.to_doc'), 'import', go('todoc', x), 'tl-todoc') : act(t('cam.tl.to_lib'), 'export', go('tolib', x), 'tl-tolib'),
              act(t('cam.tl.edit'), 'properties', go('edit', x), 'tl-edit'), act(t('cam.tl.copy'), 'duplicate', go('copy', x), 'tl-copy'), act(t('cam.tl.delete'), 'trash', go('del', x), 'tl-del')));
        }))) : h('div', { class: 'note', text: t(scope === 'doc' ? 'cam.tl.empty_doc' : 'cam.tl.empty_lib') }));
    };
    draw();
    const r = modal({ title: t('cam.tl.manager_title'), width: 760, cls: 'tl-modal', content: h('div', {}, segEl, wrap),
      buttons: [{ label: t('cam.tl.new'), value: 'new', testid: 'tl-new' }, { label: t('cam.tl.import'), value: 'import', testid: 'tl-import' }, { label: t('cam.tl.export'), value: 'export', testid: 'tl-export' }, { label: '', value: 'act' }, { label: t('common.close'), cls: 'pri primary', value: 'close' }] });
    document.querySelector('#modal .actions button[data-v="act"]')?.setAttribute('hidden', '');
    const v = await r;
    const setList = (l) => { if (scope === 'doc') cam.setTools(l); else if (!saveToolLibrary(l)) toast(t('cam.tl.lib_save_failed'), true); };
    if (v === 'new') {
      const nt = await editTool(newTool('flat', list(), prot), { isNew: true, prot, others: list(), strictNumber: scope === 'doc' });
      if (nt) setList([...list(), nt]); continue;
    }
    if (v === 'export') {
      try { const text = exportLibrary(list()); const bytes = new TextEncoder().encode(text); const name = t('cam.tl.export_name') + '.json';
        const p = await cam.app.writeOut(bytes, name, 'json', true); if (p) toast(t('cam.tl.exported', { n: list().length })); } catch (e) { toast(t('cam.tl.export_failed', { msg: errText(e) }), true); }
      continue;
    }
    if (v === 'import') {
      let text; try { text = await pickJson(); } catch (e) { toast(t('cam.tl.import_failed', { msg: errText(e) }), true); continue; } if (text == null) continue;
      try {
        const res = importLibrary(text); const cur = list(); const have = new Set(cur.map((x) => x.id)); const add = []; const skip = [];
        // C-09: belge kapsamında aynı numaralı takım kopyalanmaz (T20 iki kez olmaz); kütüphanede içeriği aynı takım ikinci kez eklenmez
        const sig = (x) => JSON.stringify({ ...x, id: undefined }); const nums = new Set(cur.map((x) => x.number)); const sigs = new Set(cur.map(sig));
        for (const x of res.tools) {
          if (scope === 'doc' ? nums.has(x.number) : sigs.has(sig(x))) { skip.push(x); continue; }
          add.push(have.has(x.id) ? { ...x, id: uid('tool') } : x); nums.add(x.number); sigs.add(sig(x));
        }
        if (add.length) setList([...cur, ...add]);
        const skipNote = skip.length ? ' ' + t('cam.tl.import_skipped', { k: skip.length, why: scope === 'doc' ? t('cam.tl.skip_number', { nums: [...new Set(skip.map((x) => 'T' + x.number))].join(', ') }) : t('cam.tl.skip_same') }) : '';
        toast((res.errors.length ? t('cam.tl.imported_some', { n: add.length, bad: res.errors.length, first: errText({ code: res.errors[0].code, params: res.errors[0].params }) }) : t('cam.tl.imported', { n: add.length })) + skipNote, { kind: res.errors.length || skip.length ? 'warn' : 'ok' });
      } catch (e) { toast(t('cam.tl.import_failed', { msg: errText(e) }), true); }
      continue;
    }
    if (v !== 'act' || !pending) return;
    const { act, tool } = pending;
    if (act === 'edit') { const nt = await editTool(tool, { prot, others: list(), strictNumber: scope === 'doc' }); if (nt) setList(list().map((x) => (x.id === nt.id ? nt : x))); }
    else if (act === 'copy') { const c = clone(tool); c.id = uid('tool'); c.name = t('cam.tl.copy_name', { name: tool.name || 'T' + tool.number }); const used = new Set(list().map((x) => x.number)); let n = tool.number; while (used.has(n) || (prot?.T || []).includes(n)) n++; c.number = n; c.lengthOffset = n; if (c.diaOffset != null) c.diaOffset = n;
      const nt = await editTool(c, { isNew: true, prot, others: list(), strictNumber: scope === 'doc' }); if (nt) setList([...list(), nt]); }
    else if (act === 'del') {
      const inUse = scope === 'doc' ? cam.opsUsingTool(tool.id) : 0;
      if (await confirmBox(t('cam.tl.del_title'), inUse ? t('cam.tl.del_in_use', { name: tool.name || 'T' + tool.number, n: inUse }) : t('cam.tl.del_body', { name: tool.name || 'T' + tool.number }), t('cam.tl.delete'), t('common.giveup'), { danger: true })) setList(list().filter((x) => x.id !== tool.id));
    } else if (act === 'todoc') {
      const cur = cam.tools(); const c = { ...clone(tool), id: uid('tool') };
      if (cur.some((x) => x.number === c.number)) { toast(t('cam.tl.number_taken', { n: c.number }), { kind: 'warn' }); const nt = await editTool(c, { isNew: true, prot, others: cur, strictNumber: true }); if (nt) cam.setTools([...cur, nt]); } else { cam.setTools([...cur, c]); toast(t('cam.tl.added_to_doc', { name: c.name || 'T' + c.number }), { kind: 'ok' }); }
      // C-09: kapsam sekmesi kendiliğinden "Bu belge"ye geçmez (kullanıcının seçtiği sekme korunur)
    } else if (act === 'tolib') { const lib = toolLibrary(); saveToolLibrary([...lib, { ...clone(tool), id: uid('tool') }]); toast(t('cam.tl.saved_to_lib', { name: tool.name || 'T' + tool.number }), { kind: 'ok' }); }
  }
}
void LIB_FORMAT; void unitBox; void fld;
