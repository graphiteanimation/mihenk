from mk import *
from scenes import *

def design_ribbon():
    c1=grp('Oluştur','Create',
        tool('sketch','Sketch','Sketch')+tool('extrude','Extrude','Extrude','on')+tool('revolve','Revolve','Revolve')+tool('hole','Delik','Hole')+tool('box','Temel şekil','Primitive',caret=True))
    c2=grp('Düzenle','Modify',
        tool('fillet','Yuvarlat','Fillet')+tool('chamfer','Pah','Chamfer')+tool('shell','Kabuk','Shell',tid='tool-shell')+tool('combine','Birleştir','Combine')+tool('move','Taşı / Kopyala','Move / Copy')+tool('pattern','Desen','Pattern',caret=True)+tool('mirror','Ayna','Mirror'))
    c3=grp('İncele','Inspect',
        tool('measure','Ölç','Measure')+tool('properties','Özellikler','Properties')+tool('interference','Girişim','Interference')+tool('section','Kesit','Section'))
    rec=grp('Son kullanılanlar','Recent',f'<div class="tool-stack">{tsm("extrude","Extrude","Extrude")}{tsm("fillet","Yuvarlat","Fillet")}{tsm("hole","Delik","Hole")}{tsm("measure","Ölç","Measure")}</div>','end recent')
    return f'<div class="ribbon" role="toolbar">{c1}{c2}{c3}{rec}</div>'

FEATS=[('sketch','Sketch 1',''),('extrude','Extrude 1',''),('sketch','Sketch 2',''),('extrude','Extrude 2',''),('hole','Delik 1',''),('fillet','Yuvarlat 1','err'),('sketch','Sketch 3','')]
def timeline(editing_idx=None,sel_idx=None,error_idx=5,extra=''):
    h=f'<div class="tl-label">{ic("clock","sm")}{T("Zaman çizelgesi","Timeline")}</div>'
    for i,(icn,nm,st) in enumerate(FEATS):
        cls='chip'+(' err' if i==error_idx else '')+(' sel' if i==sel_idx else '')
        glyph=ic('error','sm') if i==error_idx else ic(icn,'sm')
        h+=f'<div class="{cls}">{glyph}<span class="ix">{i+1}</span>{html.escape(nm) if "Sketch" in nm else T(nm.rsplit(" ",1)[0],{"Extrude":"Extrude","Delik":"Hole","Yuvarlat":"Fillet"}[nm.rsplit(" ",1)[0]])+" "+nm.rsplit(" ",1)[1]}</div>'
        if i<len(FEATS)-1: h+='<span class="tl-sep"></span>'
    if editing_idx is not None:
        h+=f'<span class="tl-sep"></span><div class="chip sel">{ic("extrude","sm")}<span class="ix">8</span>{T("Extrude 3 (düzenleniyor)","Extrude 3 (editing)")}</div>'
    h+='<span class="tl-marker" title="end"></span>'
    return f'<div class="timeline">{h}{extra}</div>'

def browser_design():
    r=lambda depth,inner,cls='':f'<div class="trow {cls}" style="--depth:{depth}">{inner}</div>'
    eye=f'<button class="tw vis">{ic("eye","sm")}</button>'
    def sec(tr,en,btn=''): return f'<div class="bsec"><span>{T(tr,en)}</span>{btn}</div>'
    params=''.join(r(0,f'<span class="tw"></span><span class="nm mono">{n}</span><span class="val num">= {v}&nbsp;mm</span>') for n,v in [('plaka_x','120,00'),('plaka_y','80,00'),('kalinlik','14,00')])
    return f'''<aside class="browser">
    {sec("Parametreler","Parameters",f'<button class="btn sm">{T("Düzenle","Edit")}</button>')}{params}
    {sec("Orijin","Origin")}{r(0,f'<button class="tw vis">{ic("eye","sm")}</button><span class="nm">{T("Düzlemler ve eksenler","Planes and axes")}</span>')}
    {sec("Gövdeler","Bodies")}{r(0,eye+f'<span class="nm">{T("Gövde 1","Body 1")}</span><span class="val num">{N("120.9")}&nbsp;cm³</span>','sel')}
    {sec("Sketch'ler","Sketches")}
    {r(0,eye+'<span class="nm">Sketch 1</span>')}{r(0,eye+'<span class="nm">Sketch 2</span>')}{r(0,f'<button class="tw vis">{ic("eye","sm")}</button><span class="nm">Sketch 3</span><span class="val">{T("kullanımda","in use")}</span>')}
    </aside>'''

def extrude_panel():
    return f'''<aside class="panel">
    <header>{ic("extrude")}<span>{T("Yeni Extrude","New Extrude")}</span><button class="x" aria-label="close">{ic("close")}</button></header>
    <div class="body">
      <div class="fld"><label>Sketch</label><div class="ctl"><div class="input pick"><span>Sketch 3</span><span class="count">{ic("chevron-down","sm")}</span></div></div></div>
      <div class="fld"><label>{T("Profiller","Profiles")}</label><div class="ctl"><div class="input pick active">{ic("select","sm")}<span>{T("Tümü","All")}</span><span class="count num">1</span><button class="clear">{ic("close","sm")}</button></div></div></div>
      <div class="fld"><label>{T("İşlem","Operation")}</label><div class="ctl"><div class="input"><select><option>{T("Birleştir","Join")}</option></select><span class="step">{ic("chevron-down","sm")}</span></div></div></div>
      <div class="fld"><label>{T("Yön","Direction")}</label><div class="ctl"><div class="seg"><button aria-pressed="true">{T("Tek yön","One side")}</button><button aria-pressed="false">{T("İki yön","Two sides")}</button><button aria-pressed="false">{T("Simetrik","Symmetric")}</button></div></div></div>
      <div class="fld"><label>{T("Kapsam","Extent")}</label><div class="ctl"><div class="input"><select><option>{T("Mesafe","Distance")}</option></select><span class="step">{ic("chevron-down","sm")}</span></div></div></div>
      <div class="fld"><label>{T("Mesafe","Distance")}</label><div class="ctl"><div class="input"><input class="expr" value="kalinlik + 6" aria-label="distance"><span class="unit">mm</span></div><div class="resolved">= {N("20.00")}&nbsp;mm</div></div></div>
      <div class="fld"><label></label><div class="ctl"><label class="check"><span class="box">{ic("check")}</span>{T("Ters çevir","Flip direction")}</label></div></div>
      <div class="psec">{T("Önizleme","Preview")}</div>
      <div class="callout info" style="margin-top:8px">{ic("info","sm")}<div>{T("Gövdeye yaklaşık +14,5 cm³ eklenecek.","About +14.5 cm³ will be added to the body.")}</div></div>
    </div>
    <footer><button class="btn primary">{T("Tamam","OK")}<span class="kbd" style="margin-left:4px;background:transparent;color:inherit;border-color:rgba(255,255,255,.6)">Enter</span></button><button class="btn">{T("İptal","Cancel")}<span class="kbd" style="margin-left:4px">Esc</span></button></footer>
    </aside>'''

def model_scene(preview=True):
    iso=Iso(3.3,452,205); g=''
    inner=grid(iso)+axes(iso,80)+plate(iso)
    if preview:
        inner+=iso.pline('pv-edge',iso.ring(32,40,14,16,48)) if False else ''
        inner+=iso.cyl(32,40,14,34,16,'pv-side','pv-top','pv-edge')
        x,y=iso.p(32,40,34); x0,y0=iso.p(32,40,14)
        inner+=f'<line class="handle-line" x1="{x0:.1f}" y1="{y0:.1f}" x2="{x:.1f}" y2="{y-34:.1f}"/><polygon class="handle" points="{x-10:.1f},{y-26:.1f} {x+10:.1f},{y-26:.1f} {x:.1f},{y-46:.1f}"/>'
    # eksen etiketleri
    for lab,(a,b) in [('X',(92,0)),('Y',(0,92)),('Z',(0,0))]:
        pass
    return scene(inner),iso

def mock_design(out='02-tasarim-model.html'):
    sc,iso=model_scene()
    hx,hy=iso.p(32,40,34)
    over=(f'<div class="vp-hint">{ic("info","sm")}{T("Profil bölgelerine tıklayarak seçimi değiştirebilirsiniz. Mesafeyi sürükleyerek de ayarlayabilirsiniz.","Click profile regions to change the selection. You can also drag the handle to set the distance.")}</div>'
          +f'<div class="vp-overlay-tr">{viewcube()}<div class="vbtns"><button aria-label="fit">{ic("fit")}</button><button aria-label="iso" aria-pressed="true">{ic("view-iso")}</button><button>{ic("planes")}</button><button>{ic("section")}</button></div></div>'
          +f'<div class="vp-overlay-tl"><div class="hud">{ic("measure","sm")}<span class="muted">{T("Çıkıntı yüksekliği","Boss height")}</span><b class="num">{N("20.00","mm")}</b></div></div>'
          +at(hx+70,hy-30,f'<span class="num">{N("20.00","mm")}</span>','dimlabel'))
    vw=viewwrap(sc,over)
    tip=f'''<div class="tip" data-tip-for="tool-shell" style="left:0;top:0"><div class="th"><span>{T("Kabuk","Shell")}</span><span class="kbd">H</span></div><div class="tb">{T("Seçili yüzleri açarak gövdeyi içi boş hale getirir.","Removes the selected faces and hollows out the body.")}</div></div>'''
    left=f'<span class="seg-i">{ic("workspace-design","sm")}<b>{T("Model kipi","Model mode")}</b></span>{sb_div()}<span class="seg-i">{T("Etkin araç:","Active tool:")} <b>Extrude</b></span>'
    right=(f'<button class="sbtn err">{ic("error","sm")}{T("1 hatalı özellik","1 failed feature")}</button>{sb_div()}'
           f'<span class="seg-i">{T("Gövde: 1","Bodies: 1")}</span><span class="seg-i">{T("Seçim: 1 profil","Selection: 1 profile")}</span>{sb_div()}<span class="seg-i">mm</span><span class="seg-i num">{T("Hesap:","Compute:")} 142 ms</span>{sb_div()}<span class="seg-i okc">{ic("check","sm")}{T("Otomatik kaydedildi 14:32","Autosaved 14:32")}</span>')
    body=f'''{head("Mihenk — Tasarım (model kipi)")}<body>
<div class="app">{titlebar("Montaj plakası.mhnk")}{tabs("design")}{design_ribbon()}
<div class="main">{browser_design()}{vw}{extrude_panel()}</div>{timeline(editing_idx=7,sel_idx=None)}{statusbar(left,right)}
{tip}</div>'''
    open(D+'mockups/'+out,'w').write(body+tail())
