// Güvenli ifade değerlendirici: sayılar, + - * / ^, parantez, parametre adları, temel fonksiyonlar.
// Hatalar KErr('expr.*', params) olarak fırlatılır; arayüz çevirir.
import { KErr, toErr } from './errors.js';
const FN = {
  sin: (d) => Math.sin((d * Math.PI) / 180), cos: (d) => Math.cos((d * Math.PI) / 180),
  // O-044: tanımsız değer (tan 90°) sonsuz büyük sayı değil hata (expr.not_number)
  tan: (d) => { const t = Math.tan((d * Math.PI) / 180); return Math.abs(t) > 1e12 ? NaN : t; }, sqrt: Math.sqrt, abs: Math.abs,
  min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  asin: (x) => (Math.asin(x) * 180) / Math.PI, acos: (x) => (Math.acos(x) * 180) / Math.PI,
  atan: (x) => (Math.atan(x) * 180) / Math.PI,
};
export function evalExpr(src, vars = {}) { return evalCore(src, vars, false); }
// O-044 öncesi kurallar (yalnız eski belgelerde değeri değişen ifadeyi bulmak için): tekli eksi üsten önce, `pi` parametreyi gölgeler.
export function evalExprLegacy(src, vars = {}) { return evalCore(src, vars, true); }
function evalCore(src, vars, legacy) {
  if (typeof src === 'number') return src;
  const s = String(src ?? '').replace(/,/g, '.').trim();
  if (!s) throw new KErr('expr.empty');
  let i = 0;
  const ws = () => { while (s[i] === ' ') i++; };
  const expr = () => { let v = term(); for (;;) { ws(); if (s[i] === '+') { i++; v += term(); } else if (s[i] === '-') { i++; v -= term(); } else return v; } };
  const term = () => { let v = pow(); for (;;) { ws(); if (s[i] === '*') { i++; v *= pow(); } else if (s[i] === '/') { i++; v /= pow(); } else return v; } };
  // O-044 (F-15): tekli eksi üsten SONRA uygulanır: -2^2 = -4, 2*-3^2 = -18, -2^-2 = -0,25 (matematik kuralı)
  const pow = legacy
    ? () => { const b = unaryL(); ws(); if (s[i] === '^') { i++; return Math.pow(b, pow()); } return b; }
    : () => { ws(); if (s[i] === '-') { i++; return -pow(); } if (s[i] === '+') { i++; return pow(); } const b = atom(); ws(); if (s[i] === '^') { i++; return Math.pow(b, pow()); } return b; };
  const unaryL = () => { ws(); if (s[i] === '-') { i++; return -unaryL(); } if (s[i] === '+') { i++; return unaryL(); } return atom(); };
  const atom = () => {
    ws();
    if (s[i] === '(') { i++; const v = expr(); ws(); if (s[i] !== ')') throw new KErr('expr.paren'); i++; return v; }
    let m = /^[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/.exec(s.slice(i));
    if (m) { i += m[0].length; return parseFloat(m[0]); }
    m = /^[A-Za-z_ğüşıöçĞÜŞİÖÇ][A-Za-z0-9_ğüşıöçĞÜŞİÖÇ]*/.exec(s.slice(i));
    if (m) {
      i += m[0].length; const name = m[0]; ws();
      if (s[i] === '(') {
        i++; const args = []; ws();
        if (s[i] !== ')') { for (;;) { args.push(expr()); ws(); if (s[i] === ';') { i++; continue; } break; } }
        if (s[i] !== ')') throw new KErr('expr.paren'); i++;
        if (!FN[name]) throw new KErr('expr.unknown_fn', { name });
        return FN[name](...args);
      }
      // O-044: kullanıcının aynı adlı parametresi yerleşik sabiti (pi) gölgeler
      if (!legacy && Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
      if (name === 'pi') return Math.PI;
      if (!(name in vars)) throw new KErr('expr.unknown_param', { name });
      return vars[name];
    }
    throw new KErr('expr.syntax', { expr: s });
  };
  const v = expr(); ws();
  if (i < s.length) throw new KErr('expr.syntax', { expr: s });
  if (!Number.isFinite(v)) throw new KErr('expr.not_number', { expr: s });
  return v;
}
// Kullanıcı parametrelerini sırayla çözer (bir parametre öncekileri kullanabilir).
export function resolveParams(params = []) {
  const vars = {}; const errors = {};
  for (const p of params) {
    try { vars[p.name] = evalExpr(p.expr, vars); } catch (e) { errors[p.name] = toErr(e); }
  }
  return { vars, errors };
}

// O-044: eski kurallara göre değeri değişen parametreler ve işlem alanları (belge açılışında bir kez bildirilir). Döner: adlar listesi
export function changedByO044(doc) {
  const out = []; const params = Array.isArray(doc?.params) ? doc.params.filter((p) => p && typeof p === 'object') : [];
  const nv = {}, ov = {};
  const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || a === b || Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
  const val = (f, e, vars) => { try { return f(e, vars); } catch (x) { return NaN; } };
  for (const p of params) { const a = val(evalExpr, p.expr, nv), b = val(evalExprLegacy, p.expr, ov); if (Number.isFinite(a)) nv[p.name] = a; if (Number.isFinite(b)) ov[p.name] = b; if (!same(a, b) && (Number.isFinite(a) || Number.isFinite(b))) out.push(String(p.name)); }
  for (const f of Array.isArray(doc?.features) ? doc.features : []) {
    if (!f || typeof f !== 'object' || f.type === 'sketch' || f.type === 'import') continue;
    for (const [k, e] of Object.entries(f)) { if (typeof e !== 'string' || !/[\^]|pi/.test(e) || k === 'name' || k === 'id') continue; const a = val(evalExpr, e, nv), b = val(evalExprLegacy, e, ov); if (!same(a, b) && (Number.isFinite(a) || Number.isFinite(b))) out.push((f.name || f.id) + '.' + k); }
  }
  return out;
}
