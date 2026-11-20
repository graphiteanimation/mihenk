// Yerel çökme/hata günlüğü (WP-10 dilim 4). Yalnız kullanıcı veri klasörüne yazar (userData/logs); ağa HİÇBİR ŞEY gönderilmez.
// Döner: mihenk-log.txt en çok 1 MB; dolunca .1 → .2 → .3 → .4 kayar, en eski silinir (en çok 5 dosya × 1 MB).
// Kişisel veri yazılmaz: mutlak yollar yalnız dosya adına indirilir; kullanıcı adı, bilgisayar adı ve ev klasörü maskelenir;
// uzun tırnaklı metinler (dosya/belge içeriği sızabilir) atılır; her kayıt en çok 600 karakter; oturum başına en çok 300 kayıt.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_BYTES = 1024 * 1024, KEEP = 5, MAX_ENTRY = 600, MAX_PER_SESSION = 300;
const KINDS = new Set(['main-uncaught', 'main-rejection', 'console-error', 'render-gone', 'child-gone', 'unresponsive']);

function redactor() {
  const secrets = [];
  try { const u = os.userInfo().username; if (u && u.length >= 3) secrets.push(u); } catch (e) { /* kullanıcı bilgisi yok */ }
  try { const h = os.hostname(); if (h && h.length >= 3) secrets.push(h); } catch (e) { /* yok */ }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const home = (() => { try { return os.homedir(); } catch (e) { return ''; } })();
  return function redact(text) {
    let s = String(text ?? '');
    if (home && home.length > 3) s = s.split(home).join('<ev>');
    s = s.replace(/(?<!\w)[A-Za-z]:[\\/](?![\\/])[^\s:'"()<>|*?]*/g, (m) => '<yol>/' + (m.split(/[\\/]/).filter(Boolean).pop() || ''));          // Windows yolu → dosya adı
    s = s.replace(/(?<![\w:/.])\/(?:[^\s/:'"()<>|]+\/)+[^\s/:'"()<>|]*/g, (m) => '<yol>/' + (m.split('/').filter(Boolean).pop() || '')); // POSIX yolu → dosya adı
    s = s.replace(/"[^"\n]{40,}"|'[^'\n]{40,}'/g, '"<icerik atildi>"');                                                               // uzun tırnaklı metin (içerik olabilir)
    for (const x of secrets) s = s.replace(new RegExp(esc(x), 'gi'), '<ad>');
    return s.replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ');
  };
}

function createLogger({ dir, version, electron, platform }) {
  const redact = redactor(); const file = path.join(dir, 'mihenk-log.txt'); let count = 0, last = '', lastAt = 0;
  function rotate() {
    try { if (fs.statSync(file).size < MAX_BYTES) return; } catch (e) { return; }
    for (let i = KEEP - 1; i >= 1; i--) { const from = i === 1 ? file : `${file}.${i - 1}`, to = `${file}.${i}`; try { if (i === KEEP - 1) fs.rmSync(to, { force: true }); if (fs.existsSync(from)) fs.renameSync(from, to); } catch (e) { /* döndürme başarısızsa yazmayı sürdür */ } }
  }
  function write(kind, message, stack) {
    if (!KINDS.has(kind) || count >= MAX_PER_SESSION) return false;
    const msg = redact(String(message ?? '').split('\n')[0]).slice(0, 300);
    const stk = stack ? redact(String(stack).split('\n').slice(1, 6).map((l) => l.trim()).join(' | ')).slice(0, 280) : '';
    const key = kind + msg; const now = Date.now(); if (key === last && now - lastAt < 1000) return false; last = key; lastAt = now; count++;
    const line = `${new Date().toISOString()} ${kind} v${version} electron${electron} ${platform} | ${msg}${stk ? ' | ' + stk : ''}`.slice(0, MAX_ENTRY) + '\n';
    try { fs.mkdirSync(dir, { recursive: true }); rotate(); fs.appendFileSync(file, line, 'utf8'); return true; } catch (e) { return false; }
  }
  return { write, dir, file, redact };
}

module.exports = { createLogger, redactor, KINDS, MAX_BYTES, KEEP };
