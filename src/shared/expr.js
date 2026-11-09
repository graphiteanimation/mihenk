// Güvenli ifade değerlendirici: sayılar, + - * / ^, parantez, parametre adları, temel fonksiyonlar.
// Hatalar KErr('expr.*', params) olarak fırlatılır; arayüz çevirir.
import { KErr, toErr } from './errors.js';
const FN = {
  sin: (d) => Math.sin((d * Math.PI) / 180), cos: (d) => Math.cos((d * Math.PI) / 180),
  tan: (d) => Math.tan((d * Math.PI) / 180), sqrt: Math.sqrt, abs: Math.abs,
  min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  asin: (x) => (Math.asin(x) * 180) / Math.PI, acos: (x) => (Math.acos(x) * 180) / Math.PI,
  atan: (x) => (Math.atan(x) * 180) / Math.PI,
};
export function evalExpr(src, vars = {}) {
  if (typeof src === 'number') return src;
  const s = String(src ?? '').replace(/,/g, '.').trim();
  if (!s) throw new KErr('expr.empty');
  let i = 0;
  const ws = () => { while (s[i] === ' ') i++; };
  const expr = () => { let v = term(); for (;;) { ws(); if (s[i] === '+') { i++; v += term(); } else if (s[i] === '-') { i++; v -= term(); } else return v; } };
  const term = () => { let v = pow(); for (;;) { ws(); if (s[i] === '*') { i++; v *= pow(); } else if (s[i] === '/') { i++; v /= pow(); } else return v; } };
  const pow = () => { const b = unary(); ws(); if (s[i] === '^') { i++; return Math.pow(b, pow()); } return b; };
  const unary = () => { ws(); if (s[i] === '-') { i++; return -unary(); } if (s[i] === '+') { i++; return unary(); } return atom(); };
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
