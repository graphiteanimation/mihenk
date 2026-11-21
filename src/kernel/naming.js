// Kalıcı topolojik adlandırma (köken tabanlı).
// Her gövdenin her YÜZÜ bir ya da daha çok ad (takma ad kümesi) taşır: onu üreten özellik + rol (örn. "e1:side:l3").
// Bir özellik gövdeyi değiştirdiğinde OCCT geçmişiyle (Modified/Generated/IsDeleted) adlar miras alınır (topo.js).
// KENAR adı = iki komşu yüzün adı (sırasız çift); KÖŞE adı = çevresindeki yüz adları.
// Ad birden çok elemanı veriyorsa (bölünmüş yüz, aynı yüz çiftini paylaşan kenarlar) kararlı ayırt edici = komşu
// yüz adlarından seçilmiş en küçük küme (nb). Çözüm YALNIZ ada göredir; tek eleman çıkmazsa hata.
// C-31: ham komşu adları kenarları ayıramıyorsa (ör. dikişte ikiye bölünmüş kesişim yayı; aynı adı taşıyan iki yüz
// parçası) ikinci kademe ayırt edici nk = kenarın kendi yüzlerinin ve uç köşelerindeki üçüncü yüzlerin AYIRT EDİLMİŞ
// yüz anahtarları (faceKey, ör. "e2:side:l3|e2:end"). Yalnız adlardan türetilir (dizin/sıra yok); nk isteğe bağlıdır,
// yalnız nb yetmediğinde üretilir — eski {a,b,nb?} adları aynen üretilir ve çözülür.
import { KErr } from '../shared/errors.js';
import { topoOf } from './topo.js';

const idxCache = new WeakMap();
// body.fn dizisi için takma ad dizini ve komşuluk adları
function index(body) {
  let X = idxCache.get(body.fn); if (X && X.shape === body.shape) return X;
  const T = topoOf(body.shape);
  const alias = new Map();
  body.fn.forEach((names, i) => { for (const n of names || []) { if (!alias.has(n)) alias.set(n, []); alias.get(n).push(i); } });
  const nbrCache = new Map(), vnbrCache = new Map();
  const faceNbr = (i) => {
    let s = nbrCache.get(i); if (s) return s; s = new Set();
    for (const j of T.faceEdges[i]) for (const f of T.edgeFaces[j]) if (f !== i) for (const n of body.fn[f] || []) s.add(n);
    nbrCache.set(i, s); return s;
  };
  // kenarın uç köşelerindeki üçüncü yüzler
  const edgeNbr = (j) => {
    let s = vnbrCache.get(j); if (s) return s; s = new Set(); const own = T.edgeFaces[j];
    for (const k of T.edgeVerts[j]) for (const f of T.vertFaces[k]) if (!own.includes(f)) for (const n of body.fn[f] || []) s.add(n);
    vnbrCache.set(j, s); return s;
  };
  // kenarın kendi yüzlerinin ve uç köşe üçüncü yüzlerinin ayırt edilmiş anahtarları (C-31)
  const keyCache = new Map(), kCache = new Map();
  const fkey = (f) => { if (!keyCache.has(f)) keyCache.set(f, faceKey(body, f)); return keyCache.get(f); };
  const edgeNbrK = (j) => {
    let s = kCache.get(j); if (s) return s; s = new Set(); const own = T.edgeFaces[j];
    const add = (f) => { const k = fkey(f); if (k) s.add(k); };
    for (const f of own) add(f);
    for (const k of T.edgeVerts[j]) for (const f of T.vertFaces[k]) if (!own.includes(f)) add(f);
    kCache.set(j, s); return s;
  };
  X = { shape: body.shape, fn: body.fn, T, alias, faceNbr, edgeNbr, edgeNbrK };
  idxCache.set(body.fn, X); return X;
}

export const aliasSet = (body) => index(body).alias;

// en küçük ayırt edici küme (açgözlü). null → ayırt edilemiyor. partial: kalan adaylarla birlikte {nb, rest} döner
function discriminate(target, cands, nbrOf, partial = false) {
  const mine = nbrOf(target); let rest = cands.filter((c) => c !== target); const nb = [];
  while (rest.length) {
    let best = null, bestKill = 0;
    for (const n of [...mine].sort()) { if (nb.includes(n)) continue; const kill = rest.filter((c) => !nbrOf(c).has(n)).length; if (kill > bestKill) { best = n; bestKill = kill; } }
    if (!best) break;
    nb.push(best); rest = rest.filter((c) => nbrOf(c).has(best));
  }
  if (partial) return { nb: nb.sort(), rest };
  return rest.length ? null : nb.sort();
}

// Yüz adı: {k, nb?} ya da {error}
export function faceName(body, i) {
  const X = index(body); const al = body.fn[i];
  if (!al || !al.length) return { error: 'ref.unnamed' };
  for (const k of al) if (X.alias.get(k).length === 1) return { k };
  const k = al[0]; const nb = discriminate(i, X.alias.get(k), X.faceNbr);
  return nb ? { k, nb } : { error: 'ref.ambiguous_here' };
}
function edgeCands(X, a, b) {
  const out = new Set(); const has = (f, n) => (X.fn[f] || []).includes(n);
  for (const fa of X.alias.get(a) || []) for (const j of X.T.faceEdges[fa]) {
    const fs = X.T.edgeFaces[j]; if (fs.length < 1 || fs.length > 2) continue;
    const f1 = fs[0], f2 = fs.length === 2 ? fs[1] : fs[0];
    if ((has(f1, a) && has(f2, b)) || (has(f2, a) && has(f1, b))) out.add(j);
  }
  return [...out];
}
export function edgeName(body, j) {
  const X = index(body); const fs = X.T.edgeFaces[j];
  if (fs.length < 1 || fs.length > 2) return { error: 'ref.unnamed' };
  const fa = fs[0], fb = fs.length === 2 ? fs[1] : fs[0];
  const A = body.fn[fa] || [], Bn = body.fn[fb] || [];
  if (!A.length || !Bn.length) return { error: 'ref.unnamed' };
  let first = null;
  for (const x of A) for (const y of Bn) {
    const [a, b] = x <= y ? [x, y] : [y, x];
    const c = edgeCands(X, a, b); if (!first) first = { a, b, c };
    if (c.length === 1 && c[0] === j) return { a, b };
  }
  const nb = discriminate(j, first.c, X.edgeNbr);
  if (nb) return { a: first.a, b: first.b, nb };
  // C-31 ikinci kademe: ham adlarla ayrılamayan adaylar ayırt edilmiş yüz anahtarlarıyla
  const p = discriminate(j, first.c, X.edgeNbr, true);
  const nk = discriminate(j, [j, ...p.rest], X.edgeNbrK);
  if (!nk) return { error: 'ref.ambiguous_here' };
  const out = { a: first.a, b: first.b }; if (p.nb.length) out.nb = p.nb; out.nk = nk; return out;
}
// kenar adının dize biçimi (üretilen yüz adlarında, seçim etiketlerinde). nk yoksa eski biçimle birebir aynı.
export const edgeNameText = (n) => `<${n.a}&${n.b}${n.nb ? '|' + n.nb.join('|') : ''}${n.nk ? '#' + n.nk.join('#') : ''}>`;
// Üretilen yüz adlarında kullanılan dize biçimleri
export const edgeKey = (body, j) => { const n = edgeName(body, j); return n.error ? null : edgeNameText(n); };
export const vertKey = (body, k) => {
  const T = topoOf(body.shape); const ps = [];
  for (const f of T.vertFaces[k]) { const al = body.fn[f]; if (!al || !al.length) return null; ps.push(al[0]); }
  return ps.length ? `<${[...new Set(ps)].sort().join('&')}>` : null;
};
export const faceKey = (body, i) => { const n = faceName(body, i); return n.error ? null : n.nb ? `${n.k}|${n.nb.join('|')}` : n.k; };

// Ada göre çözüm → eleman dizini. Belirsiz/kayıp → KErr
export function resolveName(body, kind, name, hint) {
  const X = index(body); const p = { hint: hintText(hint) };
  if (!name || typeof name !== 'object') throw new KErr('ref.unnamed', p);
  let c;
  if (kind === 'face') {
    if (typeof name.k !== 'string') throw new KErr('ref.unnamed', p);
    c = (X.alias.get(name.k) || []).slice();
    if (name.nb) c = c.filter((i) => name.nb.every((n) => X.faceNbr(i).has(n)));
  } else {
    if (typeof name.a !== 'string' || typeof name.b !== 'string') throw new KErr('ref.unnamed', p);
    c = edgeCands(X, name.a, name.b);
    if (name.nb) c = c.filter((j) => name.nb.every((n) => X.edgeNbr(j).has(n)));
    if (Array.isArray(name.nk)) c = c.filter((j) => name.nk.every((n) => X.edgeNbrK(j).has(n)));
  }
  if (c.length === 1) return c[0];
  throw new KErr(c.length ? (kind === 'face' ? 'ref.ambiguous_face' : 'ref.ambiguous_edge') : (kind === 'face' ? 'ref.lost_face' : 'ref.lost_edge'), { ...p, n: c.length });
}
const hintText = (h) => (h && Array.isArray(h.fp) ? h.fp.map((x) => Math.round(x * 1000) / 1000).join(', ') : '');
