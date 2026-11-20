// Yerel çökme/hata günlüğü (WP-10 dilim 4). Yalnız kullanıcı veri klasörüne yazar (userData/logs); ağa HİÇBİR ŞEY gönderilmez.
// Döner: mihenk-log.txt en çok 1 MB; dolunca .1 → .2 → .3 → .4 kayar, en eski silinir (en çok 5 dosya × 1 MB).
// Kişisel veri yazılmaz: bilinen kökler (ev, veri, geçici, uygulama, cwd) yer tutucuya; her yol benzeri parça (sürücü, UNC, /kök, file://;
// boşluklu adlar dahil) <yol> olur, dosya/belge adı yazılmaz; uygulamanın kendi kaynakları app:/göreli/yol.js:satır; tırnaklı metinler "…";
// kullanıcı adı ve bilgisayar adı maskelenir; her kayıt en çok 600 karakter; oturum başına en çok 300 kayıt.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_BYTES = 1024 * 1024, KEEP = 5, MAX_ENTRY = 600, MAX_PER_SESSION = 300;
const KINDS = new Set(['main-uncaught', 'main-rejection', 'console-error', 'render-gone', 'child-gone', 'unresponsive']);

function redactor(opts = {}) {
  const secrets = [];
  try { const u = os.userInfo().username; if (u && u.length >= 3) secrets.push(u); } catch (e) { /* kullanıcı bilgisi yok */ }
  try { const h = os.hostname(); if (h && h.length >= 3) secrets.push(h); } catch (e) { /* yok */ }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safe = (f) => { try { return f(); } catch (e) { return ''; } };
  // bilinen kökler → yer tutucu (uzun olan önce). <uygulama> kökü altındaki kaynaklar sonra app:/göreli/yol.js:satır olur.
  const roots = [[opts.appPath, '<uygulama>'], [opts.userData, '<veri>'], [safe(() => os.homedir()), '<ev>'], [opts.temp || safe(() => os.tmpdir()), '<gecici>'], [opts.cwd || safe(() => process.cwd()), '<cwd>']]
    .filter(([p]) => p && String(p).length > 3).map(([p, t]) => [String(p).replace(/[\\/]+$/, ''), t]).sort((x, y) => y[0].length - x[0].length);
  const rootRes = roots.flatMap(([p, t]) => { const seg = p.split(/[\\/]+/).map(esc); return [[new RegExp(seg.join('(?:\\\\{1,2}|/)'), 'gi'), t]]; });
  // yol başlangıçları: sürücü (C:\ , C:\\ , C:/), UNC (\\sunucu\), POSIX kök (/x/…), file:// adresi, kök yer tutucuları
  const START = String.raw`(?:file:\/\/\/?|(?<![\w])[A-Za-z]:(?:\\{1,2}|\/(?!\/))|(?<![\w\\])\\\\[^\s\\\/]+[\\\/]|(?<![\w:\/.\\<])\/(?=[^\s\/])|<(?:uygulama|veri|ev|gecici|cwd)>(?=[\\\/]|:?\d|\)|$))`;
  // gövde: boşluk dahil satır sonuna ya da tırnak/parantez/" | " ayracına ya da yığın çerçevesi sonekine (:satır:sütun) kadar
  const PATH = new RegExp(START + String.raw`.*?(?::(\d+)(?::\d+)?)?(?=[)"'` + '`' + String.raw`]|\s\|\s|$)`, 'g');
  return function redact(text) {
    let s = String(text ?? '');
    for (const [re, t] of rootRes) s = s.replace(re, t);
    s = s.replace(/"[^"\n]{4,}"|'[^'\n]{4,}'/g, '"…"');                                    // tırnaklı metin (dosya/belge içeriği ya da adı olabilir)
    s = s.replace(PATH, (m, ln) => {
      const asar = m.match(/^(?:<uygulama>|.*?app\.asar)[\\/]([^:]*?)(?::\d+(?::\d+)?)?$/i);
      return asar && /\.(?:c?js|mjs|html)$/i.test(asar[1]) ? 'app:/' + asar[1].replace(/\\/g, '/') + (ln ? ':' + ln : '') : '<yol>';
    });
    s = s.replace(/\b[^\s\\\/"'()|<>]*\.(?:mhnk|step|stp|iges|igs|stl|dxf|nc|tap|cnc)\b/gi, '<belge>'); // yolsuz belge adı
    for (const x of secrets) s = s.replace(new RegExp(esc(x), 'gi'), '<ad>');
    return s.replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ');
  };
}

function createLogger({ dir, version, electron, platform, roots }) {
  const redact = redactor(roots); const file = path.join(dir, 'mihenk-log.txt'); let count = 0, last = '', lastAt = 0;
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
