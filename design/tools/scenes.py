"""Temsili 3B sahneler (statik SVG). İzometrik izdüşüm; renkler CSS sınıflarıyla tokens.css'ten gelir."""
import math
C30=math.cos(math.radians(30)); S30=0.5
class Iso:
    def __init__(s,scale,ox,oy): s.s=scale; s.ox=ox; s.oy=oy
    def p(s,x,y,z=0): return (s.ox+(x-y)*C30*s.s, s.oy+(x+y)*S30*s.s - z*s.s)
    def pts(s,*pp): return ' '.join('%.1f,%.1f'%s.p(*q) for q in pp)
    def poly(s,cls,*pp,extra=''): return f'<polygon class="{cls}" points="{s.pts(*pp)}" {extra}/>'
    def line(s,cls,a,b,extra=''):
        x1,y1=s.p(*a); x2,y2=s.p(*b); return f'<line class="{cls}" x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" {extra}/>'
    def pline(s,cls,pp,close=False,extra=''):
        t='polygon' if close else 'polyline'; return f'<{t} class="{cls}" points="{s.pts(*pp)}" {extra}/>'
    def ring(s,cx,cy,z,r,n=72): return [(cx+r*math.cos(2*math.pi*i/n),cy+r*math.sin(2*math.pi*i/n),z) for i in range(n)]
    def cyl(s,cx,cy,z0,z1,r,cls_side,cls_top,cls_edge,n=72):
        top=[s.p(*q) for q in s.ring(cx,cy,z1,r,n)]; bot=[s.p(*q) for q in s.ring(cx,cy,z0,r,n)]
        def P(l): return ' '.join('%.1f,%.1f'%q for q in l)
        xs=[q[0] for q in top]; iL=xs.index(min(xs)); iR=xs.index(max(xs))
        quad=[top[iL],top[iR],bot[iR],bot[iL]]
        out=f'<polygon class="{cls_side}" points="{P(bot)}"/><polygon class="{cls_side}" points="{P(quad)}"/><polygon class="{cls_side}" points="{P(top)}"/>'
        # alt yarı (ön) yayı: ekranda y'si büyük olan noktalar
        front=[q for q in bot if q[1]>=sum(b[1] for b in bot)/len(bot)]
        out+=f'<polyline class="{cls_edge}" points="{P(sorted(front,key=lambda q:q[0]))}"/>'
        out+=f'<line class="{cls_edge}" x1="{top[iL][0]:.1f}" y1="{top[iL][1]:.1f}" x2="{bot[iL][0]:.1f}" y2="{bot[iL][1]:.1f}"/><line class="{cls_edge}" x1="{top[iR][0]:.1f}" y1="{top[iR][1]:.1f}" x2="{bot[iR][0]:.1f}" y2="{bot[iR][1]:.1f}"/>'
        out+=f'<polygon class="{cls_top}" points="{P(top)}"/><polygon class="{cls_edge} nofill" points="{P(top)}"/>'
        return out

def grid(iso,step=20,ext=(-420,520)):
    a,b=ext; o=[]
    for v in range(a,b+1,step):
        major=(v%100==0)
        o.append(iso.line('g-major' if major else 'g-minor',(v,a,0),(v,b,0)))
        o.append(iso.line('g-major' if major else 'g-minor',(a,v,0),(b,v,0)))
    return ''.join(o)

def axes(iso,L=70):
    o=iso.line('ax-x',(0,0,0),(L,0,0))+iso.line('ax-y',(0,0,0),(0,L,0))+iso.line('ax-z',(0,0,0),(0,0,L))
    return o

def plate(iso,W=120,D=80,H=14,pocket=True,holes=True):
    o=''
    # sağ yüz (x=W) ve sol yüz (y=D)
    o+=iso.poly('f-r',(W,0,0),(W,D,0),(W,D,H),(W,0,H))
    o+=iso.poly('f-l',(0,D,0),(W,D,0),(W,D,H),(0,D,H))
    px0,px1,py0,py1,pz=66,108,22,58,6
    if pocket:
        path=iso.pts((0,0,H),(W,0,H),(W,D,H),(0,D,H))+' | '+iso.pts((px0,py0,H),(px1,py0,H),(px1,py1,H),(px0,py1,H))
        def d(s): return 'M'+' L'.join(s.split())+' Z'
        a,b=path.split(' | ')
        o+=f'<path class="f-t" fill-rule="evenodd" d="{d(a)} {d(b)}"/>'
        o+=iso.poly('f-pl',(px0,py0,pz),(px1,py0,pz),(px1,py1,pz),(px0,py1,pz))
        o+=iso.poly('f-pw1',(px0,py0,pz),(px0,py1,pz),(px0,py1,H),(px0,py0,H))   # x=px0 duvarı
        o+=iso.poly('f-pw2',(px0,py0,pz),(px1,py0,pz),(px1,py0,H),(px0,py0,H))   # y=py0 duvarı
        o+=iso.pline('edge',[(px0,py0,H),(px1,py0,H),(px1,py1,H),(px0,py1,H)],True)
        o+=iso.pline('edge',[(px0,py0,pz),(px0,py1,pz)])+iso.pline('edge',[(px0,py0,pz),(px1,py0,pz)])
        o+=iso.line('edge',(px0,py0,pz),(px0,py0,H))+iso.line('edge',(px0,py1,pz),(px0,py1,H))+iso.line('edge',(px1,py0,pz),(px1,py0,H))
    else:
        o+=iso.poly('f-t',(0,0,H),(W,0,H),(W,D,H),(0,D,H))
    if holes:
        for (hx,hy) in [(10,10),(10,70)]:
            o+=f'<polygon class="hole" points="{iso.pts(*iso.ring(hx,hy,H,4,40))}"/><polygon class="edge nofill" points="{iso.pts(*iso.ring(hx,hy,H,4,40))}"/>'
    # dış kenarlar
    o+=iso.pline('edge',[(0,D,H),(W,D,H),(W,0,H)])+iso.pline('edge',[(0,D,0),(W,D,0),(W,0,0)])
    o+=iso.line('edge',(W,D,0),(W,D,H))+iso.line('edge',(W,0,0),(W,0,H))+iso.line('edge',(0,D,0),(0,D,H))
    o+=iso.line('edge',(0,0,H),(W,0,H))+iso.line('edge',(0,0,H),(0,D,H))
    return o
