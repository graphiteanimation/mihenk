// WP-14: islem sablonlari yoneticisi (kaydet / ekle / ice-dis aktar / sil) ve delik sira sablonu penceresi.
// Cekirdek: src/cam/templates.js. Veri: store.js (kullanici ayari). Bu dosya arayuzdur; Python/tarayici testleri bu ortamda kosulamadi.
import { h, modal, toast, promptText, confirmBox } from '../dom.js';
import { t, errText } from '../../shared/i18n.js';
import { makeTemplate, instantiateTemplate, exportTemplates, importTemplates, planHoleOps, checkHoleRules, DEFAULT_HOLE_RULES } from '../../cam/templates.js';
import { applyPreset } from '../../cam/tools.js';
import { userOpTemplates, saveUserOpTemplates, userHoleRules, saveUserHoleRules } from './store.js';
import { pickJson } from './toolui.js';
import { uid, clone, callout } from './util.js';

// secili islem(ler): islem secili -> o; kurulum secili -> kurulumun tum islemleri
function selectedOps(cam) {
  const s = cam.sel; if (!s) return [];
  if (s.kind === 'op') { const l = cam.opLoc(s.id); return l ? [l.op] : []; }
  if (s.kind === 'setup') return clone(cam.setup(s.id)?.ops || []);
  return [];
}
function targetSetup(cam) {
  const s = cam.sel; if (s?.kind === 'setup') return cam.setup(s.id); if (s?.kind === 'op') return cam.opLoc(s.id)?.setup; return cam.setups().at(-1) || null;
}
function addOps(cam, setupId, ops) {
  cam.mut((c) => { const su = c.setups.find((x) => x.id === setupId); su.ops.push(...ops); });
  cam.sel = { kind: 'op', id: ops[0].id };
}

export async function openTemplates(cam) {
  for (;;) {
    const list = userOpTemplates(); let pick = list[0]?.id ?? '';
    const sel = h('select', { 'data-testid': 'tpl-select' }, list.map((x) => h('option', { value: x.id }, `${x.name} (${x.ops.length})`)));
    sel.addEventListener('change', () => { pick = sel.value; });
    const body = h('div', {}, list.length ? sel : h('div', { class: 'note', text: t('cam.tpl.empty_list') }), h('div', { class: 'note', text: t('cam.tpl.hint') }));
    const v = await modal({ title: t('cam.tpl.title'), width: 520, content: body, buttons: [
      { label: t('cam.tpl.save_sel'), value: 'save', testid: 'tpl-save' }, { label: t('cam.tpl.add'), value: 'add', testid: 'tpl-add', cls: 'pri primary' },
      { label: t('cam.tpl.import'), value: 'import', testid: 'tpl-import' }, { label: t('cam.tpl.export'), value: 'export', testid: 'tpl-export' }, { label: t('cam.tpl.delete'), value: 'del', testid: 'tpl-del' }, { label: t('common.close'), value: null }] });
    if (!v) return;
    const cur = list.find((x) => x.id === pick);
    try {
      if (v === 'save') {
        const ops = selectedOps(cam); if (!ops.length) { toast(t('cam.tpl.need_sel'), { kind: 'warn' }); continue; }
        const nm = await promptText(t('cam.tpl.name_prompt'), ops.length === 1 ? ops[0].name : ''); if (!nm) continue;
        saveUserOpTemplates([...list, makeTemplate(nm, ops, cam.tools(), uid('tpl'))]); toast(t('cam.tpl.saved', { n: ops.length }));
      } else if (v === 'add') {
        if (!cur) continue; const su = targetSetup(cam); if (!su) { toast(t('cam.need_setup'), { kind: 'warn' }); continue; }
        const r = instantiateTemplate(cur, { tools: cam.tools(), newId: () => uid('op') });
        addOps(cam, su.id, r.ops);
        toast(t('cam.tpl.added', { n: r.ops.length }) + (r.warnings.length ? ' ' + errText(r.warnings[0]) : ''), { kind: r.warnings.length ? 'warn' : undefined });
        return;
      } else if (v === 'export') {
        const text = exportTemplates(list); const p = await cam.app.writeOut(new TextEncoder().encode(text), t('cam.tpl.export_name') + '.json', 'json', true); if (p) toast(t('cam.tpl.exported', { n: list.length }));
      } else if (v === 'import') {
        const text = await pickJson(); if (text == null) continue;
        const res = importTemplates(text); const have = new Set(list.map((x) => x.id));
        saveUserOpTemplates([...list, ...res.templates.map((x) => (have.has(x.id) ? { ...x, id: uid('tpl') } : x))]);
        toast(res.errors.length ? t('cam.tpl.imported_some', { n: res.templates.length, bad: res.errors.length }) : t('cam.tpl.imported', { n: res.templates.length }), { kind: res.errors.length ? 'warn' : undefined });
      } else if (v === 'del') {
        if (cur && await confirmBox(t('cam.tpl.del_title'), t('cam.tpl.del_body', { name: cur.name }), t('cam.tpl.delete'), t('common.giveup'), { danger: true })) saveUserOpTemplates(list.filter((x) => x.id !== cur.id));
      }
    } catch (e) { toast(errText(e), true); }
  }
}

// Delik sira sablonu: taninan deliklerden (app.result.holes) islem dizisi onizler ve secili kurulumun sonuna ekler.
export async function openHoleSequence(cam) {
  const holes = cam.app.result?.holes || [];
  if (!holes.length) { toast(t('cam.op.no_holes_body'), { kind: 'warn' }); return; }
  const su = targetSetup(cam); if (!su) { toast(t('cam.need_setup'), { kind: 'warn' }); return; }
  for (;;) {
    const rules = userHoleRules() || DEFAULT_HOLE_RULES;
    const plan = planHoleOps(holes, cam.tools(), { rules, newId: () => uid('op') });
    const tn = (id) => { const x = cam.tools().find((q) => q.id === id); return x ? 'T' + x.number : t('cam.tpl.no_tool_short'); };
    const rows = plan.ops.map((o) => h('tr', {}, h('td', { text: o.name }), h('td', { text: o.cycle }), h('td', { text: tn(o.toolId) })));
    const body = h('div', {}, plan.ops.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', { text: t('cam.tpl.col_op') }), h('th', { text: t('cam.tpl.col_cycle') }), h('th', { text: t('cam.tpl.col_tool') }))), h('tbody', {}, rows)) : callout('warn', t('cam.tpl.seq_empty'), ''),
      ...plan.warnings.slice(0, 6).map((w) => h('div', { class: 'note', text: errText(w) })), h('div', { class: 'note', text: t('cam.tpl.seq_note') }));
    const v = await modal({ title: t('cam.tpl.seq_title'), width: 620, content: body, buttons: [{ label: t('cam.tpl.seq_rules'), value: 'rules', testid: 'seq-rules' }, { label: t('cam.tpl.seq_add'), value: 'add', testid: 'seq-add', cls: 'pri primary' }, { label: t('common.close'), value: null }] });
    if (!v) return;
    if (v === 'add') {
      if (!plan.ops.length) continue;
      const ops = plan.ops.map((o) => { const tl = cam.tools().find((x) => x.id === o.toolId); if (tl?.presets?.length) { try { return applyPreset(o, tl, tl.presets[0].name); } catch (e) { /* on ayar yoksa bos kalir */ } } return o; });
      addOps(cam, su.id, ops); toast(t('cam.tpl.seq_added', { n: ops.length })); return;
    }
    if (v === 'rules') {
      const ta = h('textarea', { rows: 16, spellcheck: 'false', style: { width: '100%', fontFamily: 'monospace' } }); ta.value = JSON.stringify(rules, null, 1);
      const r = await modal({ title: t('cam.tpl.seq_rules'), width: 640, content: h('div', {}, ta, h('div', { class: 'note', text: t('cam.tpl.rules_hint') })), buttons: [{ label: t('cam.tpl.rules_default'), value: 'reset' }, { label: t('common.ok'), value: 'ok', cls: 'pri primary' }, { label: t('common.giveup'), value: null }] });
      try {
        if (r === 'reset') saveUserHoleRules([]);
        else if (r === 'ok') saveUserHoleRules(checkHoleRules(JSON.parse(ta.value)));
      } catch (e) { toast(e instanceof SyntaxError ? t('cam.tpl.rules_json') : errText(e), true); }
    }
  }
}

// Mengenede coklu parca: parca sayisi ve siralama (doc.cam.parts). NC uretiminde program is sifirlarina kopyalanir.
export async function openParts(cam) {
  const cur = cam.data().parts || { count: 1, order: 'byOp' }; let count = cur.count, order = cur.order || 'byOp';
  const n = h('input', { type: 'number', min: 1, max: 48, step: 1, value: count, 'data-testid': 'parts-count' }); n.addEventListener('input', () => { count = Math.round(Number(n.value)); });
  const o = h('select', { 'data-testid': 'parts-order' }, [['byOp', t('cam.parts.by_op')], ['byPart', t('cam.parts.by_part')]].map(([v, l]) => h('option', { value: v, selected: v === order }, l))); o.addEventListener('change', () => { order = o.value; });
  const v = await modal({ title: t('cam.parts.title'), width: 480, content: h('div', {}, h('label', { text: t('cam.parts.count') }), n, h('label', { text: t('cam.parts.order') }), o, h('div', { class: 'note', text: t('cam.parts.note') })), buttons: [{ label: t('common.ok'), value: 'ok', cls: 'pri primary' }, { label: t('common.giveup'), value: null }] });
  if (v !== 'ok') return;
  if (!Number.isInteger(count) || count < 1 || count > 48) { toast(t('err.cam.multi.bad_count', { max: 48 }), true); return; }
  cam.mut((c) => { if (count === 1) delete c.parts; else c.parts = { count, order }; });
  toast(t('cam.parts.set', { n: count }));
}
