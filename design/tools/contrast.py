#!/usr/bin/env python3
"""tokens.css içindeki renk çiftlerinin WCAG 2.2 kontrastını ve renk körlüğü (Machado 2009, şiddet 1.0) ayırt edilebilirliğini hesaplar.
Kullanım: python3 design/tools/contrast.py [--md]   (çıktı: Markdown tablo)"""
import re, sys, os
P=os.path.join(os.path.dirname(__file__),'..','tokens.css'); css=open(P).read()
def block(sel):
    m=re.search(re.escape(sel)+r'\s*\{(.*?)\n\}',css,re.S); return dict(re.findall(r'--([\w-]+):\s*([^;]+);',m.group(1)))
light=block(':root'); dark={**light,**block('[data-theme="dark"]')}
def parse(v):
    v=v.strip()
    if v.startswith('#'): return tuple(int(v[i:i+2],16) for i in (1,3,5))+(1.0,)
    m=re.match(r'rgba\((\d+),(\d+),(\d+),([\d.]+)\)',v); return tuple(int(m.group(i)) for i in (1,2,3))+(float(m.group(4)),)
def blend(fg,bg): a=fg[3]; return tuple(round(fg[i]*a+bg[i]*(1-a)) for i in range(3))+(1.0,)
def lin(c): c/=255; return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def L(c): return 0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2])
def cr(a,b): la,lb=L(a),L(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
def get(t,k,under=None):
    c=parse(t[k]); return blend(c,get(t,under) if under else (255,255,255,1)) if c[3]<1 else c
M={'prot':[[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],'deut':[[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]]}
def sim(c,m):
    l=[lin(x) for x in c[:3]]; o=[sum(M[m][i][j]*l[j] for j in range(3)) for i in range(3)]
    return tuple(max(0,min(255,round(255*(12.92*x if x<=0.0031308 else 1.055*max(x,0)**(1/2.4)-0.055)))) for x in o)+(1.0,)
def lab(c):
    r,g,b=[lin(x) for x in c[:3]]; X=(0.4124*r+0.3576*g+0.1805*b)/0.95047; Y=0.2126*r+0.7152*g+0.0722*b; Z=(0.0193*r+0.1192*g+0.9505*b)/1.08883
    f=lambda t: t**(1/3) if t>0.008856 else 7.787*t+16/116
    return (116*f(Y)-16,500*(f(X)-f(Y)),200*(f(Y)-f(Z)))
def dE(a,b): la,lb=lab(a),lab(b); return sum((x-y)**2 for x,y in zip(la,lb))**.5
TXT=['bg-app','bg-chrome','bg-surface','bg-field','bg-sunken','bg-hover']
rows=[]  # (grup, açıklama, fg, bg, eşik)
for bg in TXT:
    rows+= [('Metin','text',  'text',bg,4.5),('Metin','text-muted','text-muted',bg,4.5)]
for bg in ['bg-app','bg-chrome','bg-surface','bg-field','bg-sunken']:
    rows.append(('Metin','text-subtle','text-subtle',bg,4.5))
rows+=[('Metin','text-on-title','text-on-title','bg-title',4.5),('Metin (devre dışı, WCAG muaf)','text-disabled','text-disabled','bg-chrome',0)]
rows+=[('Vurgu','on-accent','on-accent','accent',4.5),('Vurgu','on-accent / hover','on-accent','accent-hover',4.5),('Vurgu','on-accent / active','on-accent','accent-active',4.5),
       ('Vurgu','accent (bağlantı/metin)','accent','bg-chrome',4.5),('Vurgu','accent (alan üstü)','accent','bg-field',4.5),('Vurgu','accent / tint','accent','accent-tint',4.5),('Vurgu','text / tint','text','accent-tint',4.5),('Vurgu','text / tint-strong','text','accent-tint-strong',4.5)]
for s in ['err','warn','ok','info','unv']:
    for bg in ['bg','bg-chrome','bg-surface']:
        rows.append(('Durum',f'{s}-fg',f'{s}-fg',bg if bg!='bg' else f'{s}-bg',4.5))
    rows.append(('Durum',f'{s}-on / solid',f'{s}-on',f'{s}-solid',4.5))
    if s!='warn': rows.append(('Durum (simge, 3:1)',f'{s}-solid / chrome',f'{s}-solid','bg-chrome',3.0))
rows+=[('Bileşen sınırı (3:1)','line-strong / field','line-strong','bg-field',3.0),('Bileşen sınırı (3:1)','line-strong / chrome','line-strong','bg-chrome',3.0),
       ('Odak halkası (3:1)','focus / chrome','focus','bg-chrome',3.0),('Odak halkası (3:1)','focus / field','focus','bg-field',3.0),('Odak halkası (3:1)','focus / surface','focus','bg-surface',3.0),('Odak halkası (3:1)','focus (başlık çubuğu) / title','focus-on-dark','bg-title',3.0),
       ('Bileşen sınırı (3:1)','accent / chrome (anahtar, onay kutusu)','accent','bg-chrome',3.0)]
vp=['vp-bg-top','vp-bg-bottom']
for bg in vp:
    for k in ['vp-sk-free','vp-sk-full','vp-sk-construct','vp-sk-error','vp-sk-sel','vp-sel','vp-hover','vp-dim-fg']:
        rows.append(('3B görünüm (3:1)',f'{k} / {bg}',k,bg,3.0 if k!='vp-dim-fg' else 3.0))
rows+=[('3B görünüm (3:1)','vp-dim-fg / dim-bg','vp-dim-fg','vp-dim-bg',4.5),('3B görünüm (3:1)','vp-edge / body','vp-edge','vp-body',3.0),]
def run(name,t):
    out=[]
    for g,d,fg,bg,th in rows:
        if fg not in t or bg not in t: continue
        a,b=get(t,fg),get(t,bg); r=cr(a,b); out.append((g,d,fg,bg,r,th,'GEÇTİ' if r>=th else 'KALDI'))
    return out
CVD=[('sketch tam tanımlı / az tanımlı','vp-sk-full','vp-sk-free'),('sketch az tanımlı / hata','vp-sk-free','vp-sk-error'),('sketch tam tanımlı / hata','vp-sk-full','vp-sk-error'),('sketch seçili / hata','vp-sk-sel','vp-sk-error'),
     ('sketch seçili / az tanımlı','vp-sk-sel','vp-sk-free'),('gövde seçimi / sketch hata','vp-sel','vp-sk-error'),('üzerine gelme / seçim','vp-hover','vp-sel'),('hata metni / başarı metni','err-fg','ok-fg'),('hata metni / uyarı metni','err-fg','warn-fg'),('doğrulanmadı / hata','unv-fg','err-fg'),('doğrulanmadı / bilgi','unv-fg','info-fg')]
def cvd(t):
    o=[]
    for d,a,b in CVD:
        A,B=get(t,a),get(t,b); o.append((d,a,b,dE(A,B),dE(sim(A,'prot'),sim(B,'prot')),dE(sim(A,'deut'),sim(B,'deut'))))
    return o
if __name__=='__main__':
    bad=0
    for name,t in [('Açık',light),('Koyu',dark)]:
        res=run(name,t); bad+=sum(1 for r in res if r[-1]=='KALDI')
        print(f'\n### Kontrast — {name} tema\n\n| Grup | Çift (ön / zemin) | Oran | Eşik | Sonuç |\n|---|---|---|---|---|')
        for g,d,fg,bg,r,th,s in res: print(f'| {g} | `{fg}` / `{bg}` | {r:.2f}:1 | {th if th else "—"} | {s if th else "muaf"} |')
        print(f'\n### Renk körlüğü ayırt edilebilirliği (ΔE76; ≥ 15 rahat, 8–15 sınır, < 8 zayıf) — {name} tema\n\n| Çift | Normal | Protanopi | Deuteranopi |\n|---|---|---|---|')
        for d,a,b,n,p,de in cvd(t): print(f'| {d} (`{a}` / `{b}`) | {n:.0f} | {p:.0f} | {de:.0f} |')
    print(f'\nKALAN ÇİFT SAYISI: {bad}',file=sys.stderr)
