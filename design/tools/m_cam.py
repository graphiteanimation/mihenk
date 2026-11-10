from mk import *
from scenes import *

def cam_ribbon():
    a=grp('Kurulum','Setup',tool('cam-setup','Yeni setup','New setup')+tool('cam-stock','Stok','Stock')+tool('cam-machine','Tezgâh','Machine',caret=True)+tool('cam-tool-library','Takımlar','Tools'))
    b=grp('2B','2D',tool('op-face','Yüzey','Face')+tool('op-contour','Kontur','Contour')+tool('op-pocket','Cep','Pocket','on')+tool('op-adaptive','Uyarlanır','Adaptive'))
    c=grp('Delme ve diş','Drilling & threads',tool('op-drill','Delik delme','Drill')+tool('op-thread','Diş','Thread'))
    d=grp('3B','3D',tool('op-surface','Yüzey işleme','Surface',dis=True))
    e=grp('Eylemler','Actions',tool('cam-compute','Yolu hesapla','Compute path')+tool('simulate','Simüle et','Simulate')+tool('post','Post işle','Post','',caret=False)+tool('nc-code','NC kodu','NC code',dis=True),'end')
    return f'<div class="ribbon" role="toolbar">{a}{b}{c}{d}{e}</div>'

def op_row(icn,tr,en,tool_s,state,depth=1,sel=False):
    st={'ok':f'<span class="val ok-text" style="color:var(--ok-fg)">{ic("check","sm")}</span>','stale':f'<span class="badge warn">{ic("warning","sm")}{T("Eski","Stale")}</span>','err':f'<span class="badge err">{ic("error","sm")}{T("Hata","Error")}</span>'}[state]
    return f'<div class="trow two {"sel" if sel else ""} {"err" if state=="err" else ""}" style="--depth:{depth}"><span class="tw"></span>{ic(icn,"sm")}<span class="nm">{T(tr,en)}<span class="subtle" style="font-size:12px;display:block;line-height:1.1">{tool_s}</span></span>{st}</div>'
def browser_cam():
    sec=lambda tr,en,extra='':f'<div class="bsec"><span>{T(tr,en)}</span>{extra}</div>'
    r=lambda d,inner,cls='':f'<div class="trow {cls}" style="--depth:{d}">{inner}</div>'
    machines=(f'<div class="trow sel"><span class="radio on" style="min-height:0"><span class="dot"></span></span>{ic("axes-3","sm")}<span class="nm">Neway VM1160H</span><span class="val">M80V</span></div>'
              f'<div class="trow" style="color:var(--text-disabled)"><span class="radio" style="min-height:0"><span class="dot"></span></span>{ic("axes-4","sm")}<span class="nm">{T("4 eksen tezgâh","4-axis machine")}</span><span class="val">{T("yakında","soon")}</span></div>'
              f'<div class="trow" style="color:var(--text-disabled)"><span class="radio" style="min-height:0"><span class="dot"></span></span>{ic("axes-5","sm")}<span class="nm">{T("5 eksen tezgâh","5-axis machine")}</span><span class="val">{T("yakında","soon")}</span></div>')
    setups=(r(0,f'<button class="tw">{ic("chevron-down","sm")}</button>{ic("cam-setup","sm")}<span class="nm"><b>Setup 1</b><span class="subtle" style="font-size:12px;display:block;line-height:1.1">G54 · {T("üst yüz sıfır","top face zero")}</span></span>')
            +r(1,f'<span class="tw"></span>{ic("cam-stock","sm")}<span class="nm">{T("Stok","Stock")}</span><span class="val num">{N("130")}×{N("90")}×{N("20")}&nbsp;mm</span>')
            +op_row('op-face','Yüzey frezeleme','Face milling','T1 · Ø63 · '+'face mill','ok')
            +op_row('op-pocket','Cep','Pocket','T2 · Ø12 · '+'end mill','stale',sel=True)
            +op_row('op-drill','Delik delme','Drilling','T3 · Ø8,5 · '+'drill','err'))
    tools=''.join(r(0,f'<span class="tw"></span>{ic("cam-tool","sm")}<span class="nm">T{n} · {nm}</span>') for n,nm in [(1,'Ø63 face mill'),(2,'Ø12 end mill'),(3,'Ø8,5 drill')])
    return f'''<aside class="browser">{sec("Tezgâhlar","Machines")}{machines}{sec("Setup ve işlemler","Setups & operations",f'<button class="btn sm">{ic("plus","sm")}{T("Setup","Setup")}</button>')}{setups}{sec("Takımlar","Tools")}{tools}</aside>'''

def cam_panel():
    return f'''<aside class="panel"><header>{ic("op-pocket")}<span>{T("Cep","Pocket")} — T2</span><button class="x">{ic("close")}</button></header>
    <div class="body">
      <div class="seg" style="margin:8px 0"><button aria-pressed="true">{T("Takım","Tool")}</button><button aria-pressed="false">{T("Geometri","Geometry")}</button><button aria-pressed="false">{T("Pasolar","Passes")}</button></div>
      <div class="callout warn" style="margin-top:8px">{ic("warning","sm")}<div><div class="ct">{T("Takım yolu güncel değil","Toolpath is out of date")}</div>{T("Derinlik değişti. Yolu yeniden hesaplayın.","Depth changed. Recompute the path.")}</div></div>
      <div class="fld"><label>{T("Takım","Tool")}</label><div class="ctl"><div class="input"><select><option>T2 · Ø12 end mill</option></select><span class="step">{ic("chevron-down","sm")}</span></div></div></div>
      <div class="fld"><label>{T("Devir","Spindle")}</label><div class="ctl"><div class="input"><input value="8000" class="num"><span class="unit">dev/dk</span></div></div></div>
      <div class="fld"><label>{T("İlerleme","Feed")}</label><div class="ctl"><div class="input"><input value="1200" class="num"><span class="unit">mm/dk</span></div></div></div>
      <div class="fld"><label>{T("Pasa derinliği","Step down")}</label><div class="ctl"><div class="input"><input value="3"><span class="unit">mm</span></div></div></div>
      <div class="fld"><label>{T("Yan pasa","Stepover")}</label><div class="ctl"><div class="input"><input value="40"><span class="unit">%</span></div><div class="resolved">= {N("4.80")}&nbsp;mm</div></div></div>
      <div class="fld"><label>{T("Soğutma","Coolant")}</label><div class="ctl"><label class="switch on"><span class="track"></span><span class="state">{T("Açık","On")}</span></label></div></div>
      <div class="psec">{T("Post çıktısı","Post output")}</div>
      <div class="callout unv" style="margin-top:8px">{ic("unverified","sm")}<div><div class="ct">{T("DOĞRULANMADI","UNVERIFIED")}</div>Mitsubishi M80V. {T("Bu NC kodu simülasyonda ve tezgâhta denenmedi. İlk çalıştırmada tek blok ve düşük ilerleme kullanın.","This NC code has not been run in simulation or on the machine. Use single block and low feed on first run.")}</div></div>
    </div>
    <footer><button class="btn primary">{ic("cam-compute","sm")}{T("Yolu hesapla","Compute path")}</button><button class="btn">{T("Kapat","Close")}</button></footer></aside>'''

def cam_scene():
    iso=Iso(3.3,452,205)
    o=grid(iso)+axes(iso,80)
    # stok (kesikli saydam)
    SX0,SX1,SY0,SY1,SZ=-5,125,-5,85,20
    o+=iso.poly('stock',(SX0,SY1,0),(SX1,SY1,0),(SX1,SY1,SZ),(SX0,SY1,SZ))+iso.poly('stock',(SX1,SY0,0),(SX1,SY1,0),(SX1,SY1,SZ),(SX1,SY0,SZ))+iso.poly('stock',(SX0,SY0,SZ),(SX1,SY0,SZ),(SX1,SY1,SZ),(SX0,SY1,SZ))
    o+=plate(iso)
    # kontur yolu (plaka çevresi, z=0..)
    c=[(-6,-6,14),(126,-6,14),(126,86,14),(-6,86,14)]
    o+=iso.pline('tp-cut',c,True)
    # cep yolu (zemin z=6): iç içe dikdörtgenler
    for off in (6,10.8,15.6):
        x0,x1,y0,y1=66+off,108-off,22+off,58-off
        if x1>x0 and y1>y0: o+=iso.pline('tp-cut',[(x0,y0,6),(x1,y0,6),(x1,y1,6),(x0,y1,6)],True)
    # giriş (yeşil) ve hızlı (kesikli)
    o+=iso.pline('tp-lead',[(87,40,20),(87,40,6)])
    o+=iso.pline('tp-rapid',[(30,40,38),(87,40,38),(87,40,20)])
    # takım (Ø12) simülasyon konumunda
    o+=iso.cyl(80,40,12,40,6,'tool-side','tool-top','tool-edge')
    o+=iso.cyl(80,40,40,60,9,'tool-hold','tool-hold','tool-edge')
    return scene(o),iso

def sim_bar():
    return f'''<div class="timeline" style="gap:12px">
    <div class="tl-label">{ic("simulate","sm")}{T("Simülasyon","Simulation")}</div>
    <button class="btn icon" aria-label="back">{ic("step-back")}</button><button class="btn primary icon" aria-label="play">{ic("play")}</button><button class="btn icon">{ic("pause")}</button><button class="btn icon">{ic("step-forward")}</button><button class="btn icon">{ic("stop")}</button>
    <div class="slider" style="flex:1;min-width:100px"><div class="rail"><div class="fill" style="width:34%"></div><div class="thumb" style="left:34%"></div></div><span class="val num">1:06 / 3:15</span></div>
    <span class="seg" style="width:auto"><button aria-pressed="false">0,5×</button><button aria-pressed="true">1×</button><button aria-pressed="false">4×</button><button aria-pressed="false">16×</button></span>
    <label class="check on"><span class="box">{ic("check")}</span>{T("Stok","Stock")}</label><label class="check on"><span class="box">{ic("check")}</span>{T("Takım yolu","Toolpath")}</label>
    </div>'''

def mock_cam(out='05-imalat-cam.html'):
    sc,iso=cam_scene()
    ov=(f'<div class="vp-overlay-tl"><div class="hud">{ic("cam-setup","sm")}<b>Setup 1</b><span class="muted">·</span><span>G54</span><span class="muted">·</span><span>{T("Neway VM1160H","Neway VM1160H")}</span></div></div>'
        +f'<div class="vp-overlay-tr">{viewcube()}<div class="vbtns"><button>{ic("fit")}</button><button aria-pressed="true">{ic("view-iso")}</button></div></div>'
        +f'<div class="vp-overlay-bl"><div class="hud" style="flex-direction:column;align-items:flex-start;gap:4px">'
        f'<span class="row" style="gap:8px"><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="var(--vp-toolpath-rapid)" stroke-width="2" stroke-dasharray="6 4"/></svg>{T("Hızlı hareket","Rapid")}</span>'
        f'<span class="row" style="gap:8px"><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="var(--vp-toolpath-cut)" stroke-width="3"/></svg>{T("Kesme","Cutting")}</span>'
        f'<span class="row" style="gap:8px"><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="var(--vp-toolpath-lead)" stroke-width="3"/></svg>{T("Giriş","Lead-in")}</span></div></div>')
    vw=viewwrap(sc,ov)
    left=f'<span class="seg-i">{ic("workspace-manufacture","sm")}<b>{T("İmalat kipi","Manufacture mode")}</b></span>{sb_div()}<span class="seg-i">{T("Etkin araç:","Active tool:")} <b>{T("Cep","Pocket")}</b></span>{sb_div()}<span class="seg-i">{T("Kesme süresi","Cut time")}: <b class="num">3:15</b></span>'
    right=(f'<button class="sbtn unv">{ic("unverified","sm")}{T("Post: DOĞRULANMADI","Post: UNVERIFIED")}</button>{sb_div()}<button class="sbtn err">{ic("error","sm")}{T("1 işlem hatalı","1 operation failed")}</button><button class="sbtn"><span class="warnc">{ic("warning","sm")}</span>{T("1 işlem eski","1 operation stale")}</button>{sb_div()}<span class="seg-i">mm</span>')
    body=f'''{head("Mihenk — İmalat (CAM) iskeleti")}<body>
<div class="app" style="grid-template-rows: var(--titlebar-h) var(--tabs-h) var(--ribbon-h) 1fr var(--timeline-h) var(--status-h)">{titlebar("Montaj plakası.mhnk",dirty=False)}{tabs("cam")}{cam_ribbon()}
<div class="main">{browser_cam()}{vw}{cam_panel()}</div>{sim_bar()}{statusbar(left,right)}</div>'''
    open(D+'mockups/'+out,'w').write(body+tail())
