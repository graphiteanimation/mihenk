from mk import *
from scenes import *
from m_design import timeline, FEATS

def small(icon,tr,en,cls=''):   # yalnız simge, 36 px, ipucu ile
    return f'<button class="tool icon36 {cls}" aria-label="{tr}" title="{tr}">{ic(icon)}</button>'
def sketch_ribbon():
    draw=grp('Çiz','Draw',tool('select','Seç','Select')+tool('line','Çizgi','Line')+tool('rect','Dikdörtgen','Rectangle',caret=True)+tool('circle','Daire','Circle',caret=True)+tool('arc','Yay','Arc',caret=True)
        +'<div class="icongrid g3">'+''.join(small(i,a,b,c) for i,a,b,c in [('polygon','Çokgen','Polygon',''),('slot','Kanal','Slot',''),('ellipse','Elips','Ellipse',''),('spline','Spline','Spline',''),('point','Nokta','Point',''),('project','İzdüşür','Project','')])+'</div>')
    edit=grp('Düzenle','Modify',tool('trim','Buda','Trim')+tool('extend','Uzat','Extend')+tool('sketch-fillet','Köşe','Corner',caret=True)+tool('offset','Ofset','Offset')
        +'<div class="icongrid g3">'+''.join(small(i,a,b) for i,a,b in [('split','Böl','Split'),('sketch-mirror','Ayna','Mirror'),('pattern-rect','Desen','Pattern'),('sk-move','Taşı','Move'),('sk-rotate','Döndür','Rotate'),('sk-scale','Ölçekle','Scale')])+'</div>')
    dim=grp('Ölçü ve kısıt','Dimension & constrain',tool('dim','Ölçü','Dimension','',caret=True)
        +'<div class="icongrid g6">'+''.join(small(i,a,b,'on' if i=='coincident' else '') for i,a,b in [('horizontal','Yatay','Horizontal'),('vertical','Dikey','Vertical'),('parallel','Paralel','Parallel'),('perpendicular','Dik','Perpendicular'),('equal','Eşit','Equal'),('tangent','Teğet','Tangent'),('coincident','Çakışık','Coincident'),('midpoint','Orta nokta','Midpoint'),('concentric','Eş merkezli','Concentric'),('symmetric','Simetrik','Symmetric'),('fix','Sabitle','Fix'),('construction','Yapı','Construction')])+'</div>')
    fin=grp('Sketch','Sketch',tool('finish','Bitir','Finish','primary')+tool('cancel','İptal','Cancel'),'end')
    return f'<div class="ribbon" role="toolbar">{draw}{edit}{dim}{fin}</div>'

def sketch_panel():
    rows=[('horizontal','Yatay','Horizontal','I1',''),('vertical','Dikey','Vertical','I2',''),('equal','Eşit','Equal','E1','err'),('coincident','Çakışık','Coincident','O1',''),('fix','Sabit','Fixed','O1','')]
    tr=''.join(f'<tr class="{c}"><td>{ic(i,"sm")}</td><td>{T(a,b)}</td><td class="mono">{r}</td><td class="r"><button class="x" style="width:32px;height:32px" aria-label="delete">{ic("trash","sm")}</button></td></tr>' for i,a,b,r,c in rows)
    return f'''<aside class="panel"><header>{ic("sketch")}<span>Sketch 1</span><button class="x">{ic("close")}</button></header>
    <div class="body">
      <div class="row" style="margin:8px 0 4px;gap:8px;flex-wrap:wrap"><span class="badge info lg">{ic("info","sm")}{T("Serbestlik: 3","Freedom: 3")}</span><span class="badge err lg">{ic("error","sm")}{T("1 çelişki","1 conflict")}</span></div>
      <div class="callout err" style="margin-top:10px">{ic("error","sm")}<div><div class="ct">{T("Çelişen kısıt","Conflicting constraint")}</div>{T("Ø10 çapı ile Eşit (E1) birlikte sağlanamıyor. E1'i silin ya da ölçüyü değiştirin.","Diameter Ø10 and Equal (E1) cannot both hold. Delete E1 or change the dimension.")}<div style="margin-top:8px"><button class="btn sm">{T("E1'i sil","Delete E1")}</button></div></div></div>
      <div class="fld"><label>{T("Düzlem","Plane")}</label><div class="ctl"><div class="input"><select><option>XY</option></select><span class="step">{ic("chevron-down","sm")}</span></div></div></div>
      <div class="fld"><label>{T("Ofset","Offset")}</label><div class="ctl"><div class="input"><input value="0"><span class="unit">mm</span></div></div></div>
      <div class="psec">{T("Kısıtlar","Constraints")} <span class="muted num">5</span></div>
      <table class="table tbl-sm" style="margin-top:6px"><tbody>{tr}</tbody></table>
    </div>
    <footer><button class="btn primary">{T("Sketch'i bitir","Finish sketch")}</button><button class="btn">{T("İptal","Cancel")}</button></footer></aside>'''

def sketch_scene():
    # sahne: 1000x640, 5 px/mm, orijin (250,520), y yukarı
    O=(250,520); k=5
    X=lambda mm:O[0]+mm*k; Y=lambda mm:O[1]-mm*k
    g=''
    for v in range(-400,1400,25): 
        major=((v-250)%125==0)
        g+=f'<line class="{"g-major" if major else "g-minor"}" x1="{v}" y1="-400" x2="{v}" y2="1100"/>'
    for v in range(-400,1100,25):
        major=((v-520)%125==0)
        g+=f'<line class="{"g-major" if major else "g-minor"}" x1="-400" y1="{v}" x2="1400" y2="{v}"/>'
    o=g
    o+=f'<polygon class="region" points="{X(0)},{Y(0)} {X(100)},{Y(0)} {X(100)},{Y(60)} {X(0)},{Y(60)}"/>'
    # eksenler
    o+=f'<line class="ax-x" x1="{X(-20)}" y1="{Y(0)}" x2="{X(-2)}" y2="{Y(0)}"/>'
    o+=f'<line class="ax-y" x1="{X(0)}" y1="{Y(-12)}" x2="{X(0)}" y2="{Y(-2)}"/>'
    # yapı çizgisi
    o+=f'<line class="sk-construct" x1="{X(-8)}" y1="{Y(30)}" x2="{X(108)}" y2="{Y(30)}"/>'
    # dikdörtgen: alt+sol tam tanımlı (koyu); üst+sağ serbest (mavi)
    o+=f'<polyline class="sk-full" points="{X(100)},{Y(0)} {X(0)},{Y(0)} {X(0)},{Y(60)}"/>'
    o+=f'<polyline class="sk-free" points="{X(0)},{Y(60)} {X(100)},{Y(60)} {X(100)},{Y(0)}"/>'
    # ana daire ø14 (serbest)
    o+=f'<circle class="sk-free" cx="{X(70)}" cy="{Y(38)}" r="{7*k}"/><circle class="pt" cx="{X(70)}" cy="{Y(38)}" r="4.5"/>'
    # çelişkili daire ø10 (kesikli kırmızı)
    o+=f'<circle class="sk-error" cx="{X(28)}" cy="{Y(20)}" r="{5*k}"/><circle class="pt err" cx="{X(28)}" cy="{Y(20)}" r="4.5"/>'
    # uç noktalar
    for (a,b,cls) in [(0,0,'full'),(100,0,'full'),(0,60,''),(100,60,'')]:
        o+=f'<rect class="pt {cls}" x="{X(a)-5}" y="{Y(b)-5}" width="10" height="10"/>'
    # genişlik ölçüsü (alt)
    y=Y(0)+46
    o+=f'<line class="dimline" x1="{X(0)}" y1="{Y(0)+8}" x2="{X(0)}" y2="{y+8}"/><line class="dimline" x1="{X(100)}" y1="{Y(0)+8}" x2="{X(100)}" y2="{y+8}"/>'
    o+=f'<line class="dimline" x1="{X(0)}" y1="{y}" x2="{X(100)}" y2="{y}"/>'
    o+=f'<polygon class="dimarrow" points="{X(0)},{y} {X(0)+12},{y-4} {X(0)+12},{y+4}"/><polygon class="dimarrow" points="{X(100)},{y} {X(100)-12},{y-4} {X(100)-12},{y+4}"/>'
    # yükseklik ölçüsü (sağ, bekleyen)
    x=X(100)+52
    o+=f'<line class="dimline ref" x1="{X(100)+8}" y1="{Y(0)}" x2="{x+8}" y2="{Y(0)}"/><line class="dimline ref" x1="{X(100)+8}" y1="{Y(60)}" x2="{x+8}" y2="{Y(60)}"/><line class="dimline ref" x1="{x}" y1="{Y(0)}" x2="{x}" y2="{Y(60)}"/>'
    o+=f'<polygon class="dimarrow" points="{x},{Y(0)} {x-4},{Y(0)-12} {x+4},{Y(0)-12}" style="fill:var(--text-subtle)"/><polygon class="dimarrow" points="{x},{Y(60)} {x-4},{Y(60)+12} {x+4},{Y(60)+12}" style="fill:var(--text-subtle)"/>'
    # ø14 ölçüsü (liderli)
    o+=f'<line class="dimline" x1="{X(70)+7*k*0.7:.1f}" y1="{Y(38)-7*k*0.7:.1f}" x2="{X(70)+95}" y2="{Y(38)-60}"/>'
    # imleç + yakalama
    cx,cy=X(50),Y(30)
    o+=f'<rect x="{cx-7}" y="{cy-7}" width="14" height="14" fill="none" stroke="var(--vp-sk-sel)" stroke-width="2.5"/>'
    return scene(o),X,Y

def mock_sketch(out='03-sketch.html'):
    sc,X,Y=sketch_scene()
    ov=(f'<div class="vp-overlay-tl"><div class="hud">{ic("sketch","sm")}<b>Sketch 1</b><span class="muted">·</span><span>{T("XY düzlemi","XY plane")}</span></div></div>'
        +f'<div class="vp-overlay-tr"><div class="vbtns"><button>{ic("fit")}</button><button aria-pressed="true">{ic("view-top")}</button><button>{ic("eye")}</button></div></div>'
        +f'<div class="vp-hint">{ic("info","sm")}{T("Dikdörtgen: ilk köşeye tıklayın.","Rectangle: click the first corner.")}</div>'
        +at(X(50),Y(0)+46,f'<span class="num">{N("100.00","mm")}</span>','dimlabel')
        +at(X(100)+52,Y(30),f'<input value="plaka_y - 20" aria-label="height"><span class="num muted" style="font-size:12px">= {N("60.00")}&nbsp;mm</span>','dimlabel edit')
        +at(X(70)+95,Y(38)-60,f'<span class="num">Ø{N("14.00","mm")}</span>','dimlabel')
        +at(X(28)-62,Y(20)-48,f'<span class="num">Ø{N("10.00","mm")}</span>','dimlabel bad')
        +at(X(50),Y(0)-18,ic('horizontal','sm'),'cbadge')+at(X(50),Y(60)-18,ic('horizontal','sm'),'cbadge')
        +at(X(0)+20,Y(30)-30,ic('vertical','sm'),'cbadge')+at(X(100)-20,Y(30)+34,ic('vertical','sm'),'cbadge')
        +at(X(0)-20,Y(0)+20,ic('fix','sm'),'cbadge')
        +at(X(28)+56,Y(20)+4,ic('equal','sm'),'cbadge bad')
        +at(X(70)-44,Y(38)-44,ic('midpoint','sm'),'cbadge warn' if False else 'cbadge'))
    vw=viewwrap(sc,ov)
    left=f'<span class="seg-i">{ic("sketch","sm")}<b>{T("Sketch kipi","Sketch mode")}</b></span>{sb_div()}<span class="seg-i">{T("Etkin araç:","Active tool:")} <b>{T("Dikdörtgen","Rectangle")}</b></span>'
    right=(f'<button class="sbtn err">{ic("error","sm")}{T("1 çelişki","1 conflict")}</button><button class="sbtn">{ic("info","sm")}{T("Serbestlik: 3","Freedom: 3")}</button>{sb_div()}'
           f'<span class="seg-i">{T("Yakalama: açık","Snap: on")}</span><span class="seg-i num">X {N("50.00")}&nbsp;&nbsp;Y {N("30.00")}&nbsp;mm</span>{sb_div()}<span class="seg-i">mm</span>')
    body=f'''{head("Mihenk — Sketch kipi")}<body>
<div class="app">{titlebar("Montaj plakası.mhnk")}{tabs("design")}{sketch_ribbon()}
<div class="main">{browser_sk()}{vw}{sketch_panel()}</div>{timeline(sel_idx=None)}{statusbar(left,right)}</div>'''
    open(D+'mockups/'+out,'w').write(body+tail())

def browser_sk():
    r=lambda inner,cls='':f'<div class="trow {cls}">{inner}</div>'
    eye=f'<button class="tw vis">{ic("eye","sm")}</button>'
    sec=lambda tr,en:f'<div class="bsec"><span>{T(tr,en)}</span></div>'
    return f'''<aside class="browser">{sec("Sketch içeriği","Sketch contents")}
    {r('<span class="tw">'+ic("chevron-down","sm")+'</span>'+ic("rect","sm")+f'<span class="nm">{T("Dikdörtgen 1","Rectangle 1")}</span><span class="val">{T("4 çizgi","4 lines")}</span>')}
    {r(ic("circle","sm").join(['<span class="tw"></span>',''])+f'<span class="nm">{T("Daire 1","Circle 1")}</span><span class="val num">Ø14,00</span>')}
    {r('<span class="tw"></span>'+ic("circle","sm")+f'<span class="nm">{T("Daire 2","Circle 2")}</span><span class="val num">Ø10,00</span>','err')}
    {r('<span class="tw"></span>'+ic("construction","sm")+f'<span class="nm">{T("Yapı çizgisi 1","Construction 1")}</span>')}
    {sec("Ölçüler","Dimensions")}
    {r(f'<span class="tw"></span><span class="nm mono">d1</span><span class="val num">{N("100.00")}&nbsp;mm</span>')}
    {r(f'<span class="tw"></span><span class="nm mono">d2</span><span class="val num">{N("60.00")}&nbsp;mm</span>')}
    {r(f'<span class="tw"></span><span class="nm mono">d3</span><span class="val num">Ø{N("14.00")}&nbsp;mm</span>')}
    </aside>'''
