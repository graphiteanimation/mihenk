// i18n sözleşme testi (DESIGN.md v0.2 "i18n sözleşmesi"):
//  1. iki sözlüğün anahtar kümeleri birebir aynı,
//  2. {ad} yer tutucuları her anahtarda eşleşiyor,
//  3. kaynakta kullanılan her sözlük anahtarı (t/tk, KErr kodu, anahtar gibi duran sabit) sözlükte var,
//  4. kaynakta Türkçe karakter içeren (ya da sözlük değeriyle aynı) sabit kullanıcı metni yok (yorumlar hariç).
// Çalıştır: node test/i18n.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { default: tr } = await import(pathToFileURL(path.join(ROOT, 'src/i18n/tr.js')).href);
const { default: en } = await import(pathToFileURL(path.join(ROOT, 'src/i18n/en.js')).href);
const i18n = await import(pathToFileURL(path.join(ROOT, 'src/shared/i18n.js')).href);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const section = (s) => console.log(s);

// ------------------------------------------------------------------ kaynak tarayıcı
const TR_CHARS = /[ğüşıöçĞÜŞİÖÇ]/;
const IGNORE = 'i18n-ignore'; // geliştirici çıktısı gibi kullanıcıya görünmeyen satırlar bu işaretle muaf tutulur

function listFiles(dir, re, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) listFiles(p, re, out); else if (re.test(p)) out.push(p);
  }
  return out;
}

// JS kaynağından yorumsuz sabit metinleri çıkarır: [{text, line}] (şablon metinlerinde ${} dışı kısımlar birleştirilir)
function literals(src) {
  const out = [];
  let i = 0, line = 1, prev = ''; // prev: son anlamlı belirteç (regex/bölme ayrımı için)
  const n = src.length;
  const regexOk = () => prev === '' || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || ['return', 'typeof', 'case', 'in', 'of', 'else', 'do', 'void', 'delete', 'throw', 'new'].includes(prev);
  function readTemplate() { // i src[i] === '`' sonrası
    let text = '', start = line; i++;
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { text += src[i + 1]; if (src[i + 1] === '\n') line++; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { i += 2; scan(true); continue; }
      if (src[i] === '\n') line++;
      text += src[i++];
    }
    i++; out.push({ text, line: start });
  }
  function readString(q) {
    let text = ''; const start = line; i++;
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') { const c = src[i + 1]; text += c === 'n' ? '\n' : c === 't' ? '\t' : c; if (c === '\n') line++; i += 2; continue; }
      if (src[i] === '\n') break;
      text += src[i++];
    }
    i++; out.push({ text, line: start });
  }
  function scan(inTemplate) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
      if (c === '\'' || c === '"') { readString(c); prev = 'str'; continue; }
      if (c === '`') { readTemplate(); prev = 'str'; continue; }
      if (c === '/' && regexOk()) { // düzenli ifade sabiti
        i++; let cls = false;
        while (i < n && (src[i] !== '/' || cls)) { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; }
        i++; while (/[a-z]/i.test(src[i] || '')) i++; prev = 're'; continue;
      }
      if (inTemplate) { if (c === '{') depth++; else if (c === '}') { if (depth === 0) { i++; return; } depth--; } }
      if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; prev = src.slice(i, j); i = j; continue; }
      if (/[0-9]/.test(c)) { let j = i; while (j < n && /[\w.]/.test(src[j])) j++; prev = 'num'; i = j; continue; }
      prev = c; i++;
    }
  }
  scan(false);
  return out;
}

const srcFiles = [...listFiles(path.join(ROOT, 'src'), /\.js$/).filter((f) => !f.includes(path.join('src', 'i18n'))), ...listFiles(path.join(ROOT, 'electron'), /\.cjs$/)];

// ------------------------------------------------------------------ 1. anahtar kümeleri
section('1. anahtar kümeleri');
const kTr = Object.keys(tr), kEn = Object.keys(en);
const sTr = new Set(kTr), sEn = new Set(kEn);
ok(kTr.length === sTr.size && kEn.length === sEn.size, 'sözlükte yinelenen anahtar var');
const onlyTr = kTr.filter((k) => !sEn.has(k)), onlyEn = kEn.filter((k) => !sTr.has(k));
ok(!onlyTr.length, 'yalnız Türkçede: ' + onlyTr.slice(0, 8).join(', '));
ok(!onlyEn.length, 'yalnız İngilizcede: ' + onlyEn.slice(0, 8).join(', '));
ok(kTr.every((k) => typeof tr[k] === 'string' && tr[k] !== '') && kEn.every((k) => typeof en[k] === 'string' && en[k] !== ''), 'boş ya da metin olmayan değer var');
console.log(`   ${kTr.length} anahtar (tr) / ${kEn.length} anahtar (en)`);

// ------------------------------------------------------------------ 2. yer tutucular
section('2. yer tutucular');
const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
let bad = [];
for (const k of kTr) if (sEn.has(k) && ph(tr[k]) !== ph(en[k])) bad.push(`${k}: tr{${ph(tr[k])}} en{${ph(en[k])}}`);
ok(!bad.length, 'yer tutucu uyuşmazlığı: ' + bad.slice(0, 5).join(' | '));
// İngilizce metinde Türkçe karakter olmamalı (yanlışlıkla Türkçe kalmış çeviri); özel ad Türkçe'nin kendisi hariç
const trInEn = kEn.filter((k) => k !== 'lang.tr' && TR_CHARS.test(en[k]));
ok(!trInEn.length, 'İngilizce sözlükte Türkçe karakter: ' + trInEn.slice(0, 5).join(', '));

// ------------------------------------------------------------------ 3. kullanılan anahtarlar
section('3. kaynaktaki anahtarlar sözlükte');
const used = new Map(); // anahtar → ilk yer
const useKey = (k, where) => { if (!used.has(k)) used.set(k, where); };
const namespaces = new Set(kTr.map((k) => k.split('.')[0]));
const errNs = new Set(kTr.filter((k) => k.startsWith('err.')).map((k) => k.split('.')[1]));
const KEYLIKE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/;
for (const f of srcFiles) {
  const src = fs.readFileSync(f, 'utf8'); const rel = path.relative(ROOT, f);
  for (const m of src.matchAll(/(?<![\w.$])(?:t|tk)\(\s*(['"`])([^'"`$]+)\1/g)) if (!m[2].endsWith('.')) useKey(m[2], rel); // 'err.' + kod gibi dinamik önekler ayrıca denetlenir
  for (const m of src.matchAll(/new KErr\(\s*'([^']+)'/g)) useKey('err.' + m[1], rel);
  if (!rel.endsWith(path.join('kernel', 'kernel.js'))) for (const m of src.matchAll(/\bcode:\s*'([\w.]+)'/g)) useKey('err.' + m[1], rel);
  for (const l of literals(src)) {
    if (!KEYLIKE.test(l.text)) continue;
    const ns = l.text.split('.')[0];
    // çekirdekte anahtar gibi duran sabitler hata kodlarıdır (koşullu KErr(...) dahil); alan adları (ef.*) olduğu gibi
    if (rel.endsWith(path.join('kernel', 'kernel.js')) && ns !== 'ef') { if (errNs.has(ns)) useKey('err.' + l.text, rel); }
    else if (namespaces.has(ns)) useKey(('err.' + l.text) in tr ? 'err.' + l.text : l.text, rel);
  }
}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) useKey(m[1], 'index.html');
// dinamik anahtarlar: errText → 'err.' + kod; gövde adı → 'body.' + kod; dil adları
for (const c of ['n', 'copy', 'pat', 'num', 'import']) useKey('body.' + c, 'kernel (gövde adı kodları)');
for (const l of i18n.LANGS) useKey('lang.' + l, 'i18n.LANGS');
const missing = [...used.keys()].filter((k) => !(k in tr) || !(k in en));
ok(!missing.length, 'sözlükte olmayan anahtar: ' + missing.slice(0, 10).map((k) => `${k} (${used.get(k)})`).join(', '));
const unused = kTr.filter((k) => !used.has(k));
console.log(`   kullanılan anahtar: ${used.size}; sözlükte olup kaynakta açıkça geçmeyen: ${unused.length}${unused.length ? ' (' + unused.slice(0, 6).join(', ') + (unused.length > 6 ? ' …' : '') + ')' : ''}`);

// ------------------------------------------------------------------ 4. sabit kullanıcı metni
section('4. kaynakta sabit kullanıcı metni yok');
const SKIP_EQ = new Set(['Delete', 'Enter', 'Esc', 'Escape', 'Backspace']); // klavye tuşu adları metin değildir
// yalnız iki dilde farklı olan değerler (dil-bağımsız 'Sketch', 'X' gibi sabitler ve kod tanımlayıcısı olabilecek tek sözcüklü küçük harfliler 'line', 'arc' hariç)
const plain = (v) => v.length >= 3 && !SKIP_EQ.has(v) && !/^[a-zçğıöşü]+$/.test(v);
const trVals = new Set(kTr.filter((k) => tr[k] !== en[k] && plain(tr[k])).map((k) => tr[k]));
const enVals = new Set(kTr.filter((k) => tr[k] !== en[k] && plain(en[k])).map((k) => en[k]));
let hard = [];
for (const f of srcFiles) {
  const raw = fs.readFileSync(f, 'utf8'); const lines = raw.split('\n'); const rel = path.relative(ROOT, f);
  for (const l of literals(raw)) {
    if ((lines[l.line - 1] || '').includes(IGNORE)) continue;
    // console.* çağrıları geliştirici çıktısıdır
    if (/console\.\w+\(/.test(lines[l.line - 1] || '')) continue;
    if (TR_CHARS.test(l.text)) hard.push(`${rel}:${l.line} "${l.text.slice(0, 50)}" (Türkçe karakter)`);
    else if (trVals.has(l.text)) hard.push(`${rel}:${l.line} "${l.text}" (Türkçe sözlük değeri)`);
    else if (enVals.has(l.text)) hard.push(`${rel}:${l.line} "${l.text}" (İngilizce sözlük değeri)`);
  }
}
ok(!hard.length, 'sabit metin:\n      ' + hard.slice(0, 25).join('\n      '));
// index.html: yalnız <title>Mihenk</title> ve data-i18n ile doldurulan öğeler
const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const texts = [...body.matchAll(/>([^<>]+)</g)].map((m) => m[1].trim()).filter(Boolean);
ok(texts.every((x) => x === 'Mihenk'), 'index.html içinde sabit metin: ' + texts.filter((x) => x !== 'Mihenk').join(' | '));
ok(!TR_CHARS.test(body.replace(/<[^>]+>/g, '')), 'index.html içinde Türkçe karakter');
// kurulum sihirbazı: iki dil, dil seçimi, Türkçe metin yalnız LangString satırlarında
const nsi = fs.readFileSync(path.join(ROOT, 'build/installer.nsi'), 'utf8');
ok(/MUI_LANGUAGE "Turkish"/.test(nsi) && /MUI_LANGUAGE "English"/.test(nsi), 'installer.nsi: Turkish + English dilleri');
ok(/MUI_LANGDLL_DISPLAY/.test(nsi), 'installer.nsi: dil seçim penceresi');
const nsiBad = nsi.split('\n').filter((l) => !/^\s*;/.test(l) && !/^LangString /.test(l) && TR_CHARS.test(l));
ok(!nsiBad.length, 'installer.nsi: LangString dışında Türkçe metin: ' + nsiBad.join(' | '));
const ls = [...nsi.matchAll(/^LangString (\w+) \$\{LANG_(\w+)\}/gm)].map((m) => m[1] + ':' + m[2]);
const lsNames = new Set(ls.map((x) => x.split(':')[0]));
ok([...lsNames].every((nme) => ls.includes(nme + ':TURKISH') && ls.includes(nme + ':ENGLISH')), 'installer.nsi: her LangString iki dilde olmalı');

// ------------------------------------------------------------------ 5. çalışma davranışı
section('5. t(), errText(), dil değişimi');
i18n.setLang('tr', false);
ok(i18n.getLang() === 'tr' && i18n.t('menu.file') === 'Dosya', 't tr');
let seen = 0; const off = i18n.onLangChange(() => { seen++; });
i18n.setLang('en', false);
ok(i18n.getLang() === 'en' && i18n.t('menu.file') === 'File' && seen === 1, 't en + onLangChange');
ok(i18n.t('st.right', { bodies: 2, sel: 1, time: '5 ms' }) === 'Bodies: 2 · Selection: 1 · Compute: 5 ms', 'yer tutucu doldurma');
const E = new i18n.KErr('fillet.too_big', {});
ok(i18n.errText(E) === en['err.fillet.too_big'], 'errText en');
i18n.setLang('tr', false);
ok(i18n.errText({ code: 'fillet.too_big', params: {} }) === tr['err.fillet.too_big'], 'errText tr (düz nesne)');
ok(i18n.errText({ code: 'expr.in_field', params: { field: 'ef.dist', inner: { code: 'expr.unknown_param', params: { name: 'Q' } } } }) === 'Mesafe: Bilinmeyen parametre: Q', 'iç içe hata + alan adı');
i18n.setLang('en', false);
ok(i18n.errText({ code: 'expr.in_field', params: { field: 'ef.dist', inner: { code: 'expr.unknown_param', params: { name: 'Q' } } } }) === 'Distance: Unknown parameter: Q', 'iç içe hata en');
const origWarn = console.warn; let warned = 0; console.warn = () => { warned++; };
i18n.setLang('tr', false);
ok(i18n.t('yok.boyle.anahtar') === 'yok.boyle.anahtar' && warned === 1, 'eksik anahtar: uyarı + anahtarı döndürür');
console.warn = origWarn;
ok(i18n.fmtNum(1.5, 3) === '1,5', 'sayı biçimi tr');
i18n.setLang('en', false);
ok(i18n.fmtNum(1.5, 3) === '1.5' && i18n.fmtNum(NaN) === '—', 'sayı biçimi en');
off();
ok(i18n.setLang('xx', false) === false && i18n.getLang() === 'en', 'geçersiz dil reddedilir');

// ifade değerlendirici hataları {code, params} taşır
const { evalExpr } = await import(pathToFileURL(path.join(ROOT, 'src/shared/expr.js')).href);
try { evalExpr('2+*', {}); ok(false, 'hata beklenirdi'); } catch (e) { ok(e.code === 'expr.syntax' && typeof e.params === 'object', 'evalExpr hatası KErr: ' + e.code); }
try { evalExpr('abc', {}); ok(false, 'hata beklenirdi'); } catch (e) { ok(e.code === 'expr.unknown_param' && e.params.name === 'abc', 'unknown_param'); }

console.log(`\n${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
