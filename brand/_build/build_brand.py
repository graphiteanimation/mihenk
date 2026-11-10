import glyphs, subprocess, os
from PIL import Image
R='/home/claude/atolyecad/brand/'
INK='#14202B'; BLUE='#1F6FD1'; PAPER='#F2F5F8'; BLUE_D='#5BA0F0'
M='M4 29.5V7h5.5L16 17l6.5-10H28v22.5h-5.5V18L16 27.5 9.5 18v11.5z'
TRI='M10 3h12l-6 9.5z'
def mark(m=INK,t=BLUE,tr=''):
    return f'<g {tr}><path d="{M}" fill="{m}"/><path d="{TRI}" fill="{t}"/></g>'
def word(color,size=31,x=0,y=0):
    d,w=glyphs.text_path('Mihenk',size,x=x,y=y,track=-0.005); return f'<path d="{d}" fill="{color}"/>',w
def svg(vb,body,title='Mihenk'):
    x,y,w,h=vb
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{w*4:g}" height="{h*4:g}" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'
def variants():
    out={}
    sets={'':(INK,BLUE,INK),'-reverse':(PAPER,BLUE_D,PAPER),'-mono-black':('#000','#000','#000'),'-mono-white':('#fff','#fff','#fff')}
    for suf,(m,t,w) in sets.items():
        wd,ww=word(w,31,x=36,y=29.5)
        # yatay: işaret x 4..28; kırpma 2..(40+ww+2)
        out['logo-horizontal'+suf]=svg((2,1,36+ww,31),mark(m,t)+wd)
        # dikey: işaret 1.8x, ortalı
        wd2,ww2=word(w,31,x=0,y=0)
        W=ww2+4; sc=1.8; mx=(W-24*sc)/2-4*sc
        body=mark(m,t,f'transform="translate({mx:.2f},0) scale({sc})"')
        wd2,_=word(w,31,x=2,y=29.5*sc*1+ -0 + 4+ (0))  # yer tutucu, aşağıda yeniden
        base=3*sc+ (29.5-3)*sc + 8 + 22.55   # işaretin altı + boşluk + cap yüksekliği
        wd2,_=word(w,31,x=2,y=base)
        out['logo-vertical'+suf]=svg((0,3*sc-2,W,base-3*sc+2+6),body+wd2)
        out['logo-mark'+suf]=svg((0,0,32,32),mark(m,t))
    return out
for n,s in variants().items(): open(R+'logo/'+n+'.svg','w').write(s)
# --- Uygulama simgesi (rounded square). Büyük ve küçük sürüm.
def appicon(small=False):
    r=6 if small else 7
    sc=0.80 if small else 0.62
    cx=16; cy=16.2
    # işaret kutusu merkezi (16, 16.25)
    body=f'<rect width="32" height="32" rx="{r}" fill="{INK}"/>'+mark('#F2F5F8','#4C94E8',f'transform="translate({cx-16*sc:.3f},{cy-16.25*sc:.3f}) scale({sc})"')
    return svg((0,0,32,32),body,'Mihenk uygulama simgesi')
open(R+'app-icon/app-icon.svg','w').write(appicon()); open(R+'app-icon/app-icon-small.svg','w').write(appicon(True))
# --- Belge simgesi (.mhnk): köşesi kıvrık sayfa
def docicon(small=False):
    page='M6 2h14l7 7v21H6z'; fold='M20 2v7h7'
    sc=0.5 if not small else 0.62
    cx=16.5; cy=19.2 if not small else 18.8
    body=(f'<path d="{page}" fill="#FFFFFF" stroke="{INK}" stroke-width="2" stroke-linejoin="miter"/><path d="{fold}" fill="#DDE1E6" stroke="{INK}" stroke-width="2" stroke-linejoin="miter"/>'
          +mark(INK,BLUE,f'transform="translate({cx-16*sc:.3f},{cy-16.25*sc:.3f}) scale({sc})"'))
    return svg((0,0,32,32),body,'Mihenk belge simgesi')
open(R+'app-icon/doc-icon.svg','w').write(docicon()); open(R+'app-icon/doc-icon-small.svg','w').write(docicon(True))
def png(svgf,size,out,bg=None):
    cmd=['rsvg-convert','-w',str(size),'-h',str(size),svgf,'-o',out]
    if bg: cmd[1:1]=['-b',bg]
    subprocess.run(cmd,check=True)
SIZES=[16,24,32,48,64,128,256]
for name,big,small in [('app-icon','app-icon.svg','app-icon-small.svg'),('doc-icon','doc-icon.svg','doc-icon-small.svg')]:
    for s in SIZES:
        png(R+'app-icon/'+(small if s<=32 else big),s,R+f'app-icon/{name}-{s}.png')
    imgs=[Image.open(R+f'app-icon/{name}-{s}.png').convert('RGBA') for s in SIZES]
    imgs[-1].save(R+f'app-icon/{name}.ico',format='ICO',sizes=[(s,s) for s in SIZES],append_images=imgs[:-1])
print('ok')
