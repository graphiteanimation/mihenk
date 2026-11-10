from mk import *
def gallery(out='06-bilesenler.html'):
    states=['normal','hover','pressed','focus','disabled','hata']
    def row(label,mk):
        return f'<div class="h" style="font-size:var(--fs-sm);color:var(--text-muted)">{label}</div>'+''.join(f'<div>{mk(s)}</div>' for s in states)
    def btn(kind):
        def f(s):
            cls={'hover':'is-hover','pressed':'is-active','focus':'is-focus','disabled':'','normal':'','hata':''}[s]
            if s=='hata' and kind!='danger': return '<span class="subtle" style="font-size:12px">—</span>'
            return f'<button class="btn {kind} {cls}" {"disabled" if s=="disabled" else ""}>{T("Düğme","Button")}</button>'
        return f
    def tl(s):
        cls={'hover':'is-hover','pressed':'is-active','focus':'is-focus','normal':'','disabled':'','hata':'danger'}[s]
        return f'<button class="tool {cls}" style="width:68px;height:68px" {"disabled" if s=="disabled" else ""}>{ic("fillet","lg")}<span class="l">{T("Yuvarlat","Fillet")}</span></button>'
    def tlon(s): return f'<button class="tool on {"is-hover" if s=="hover" else "is-active" if s=="pressed" else "is-focus" if s=="focus" else ""}" style="width:68px;height:68px">{ic("extrude","lg")}<span class="l">Extrude</span></button>' if s!='disabled' and s!='hata' else '<span class="subtle" style="font-size:12px">—</span>'
    def fld(s):
        base={'normal':'','hover':'is-hover','pressed':'','focus':'','disabled':'disabled','hata':'err'}[s]
        extra='style="border-color:var(--focus);box-shadow:0 0 0 1px var(--focus)"' if s=='focus' else ('style="border-color:var(--text-subtle)"' if s=='hover' else '')
        if s=='pressed': return '<span class="subtle" style="font-size:12px">—</span>'
        return f'<div class="input {base}" {extra} style="width:140px"><input value="12,5"><span class="unit">mm</span></div>'
    def chk(s):
        cls={'normal':'','hover':'','pressed':'on','focus':'on','disabled':'disabled','hata':'err'}[s]
        return f'<label class="check {cls}"><span class="box">{ic("check")}</span>{T("Seçenek","Option")}</label>'
    def sw(s):
        cls={'normal':'','hover':'','pressed':'on','focus':'on','disabled':'disabled','hata':''}[s]
        return f'<label class="switch {cls}"><span class="track"></span><span class="state">{T("Açık","On") if "on" in cls else T("Kapalı","Off")}</span></label>' if s!='hata' else '<span class="subtle" style="font-size:12px">—</span>'
    def tr(s):
        cls={'normal':'','hover':'is-hover','pressed':'sel','focus':'sel','disabled':'hidden-item','hata':'err'}[s]
        return f'<div class="trow {cls}" style="width:200px;--depth:0"><span class="tw">{ic("chevron-right","sm")}</span>{ic("box","sm")}<span class="nm">{T("Gövde 1","Body 1")}</span><span class="val num">120,9</span></div>'
    def chip(s):
        cls={'normal':'','hover':'is-hover','pressed':'sel','focus':'sel','disabled':'sup','hata':'err'}[s]
        return f'<div class="chip {cls}">{ic("error","sm") if s=="hata" else ic("fillet","sm")}<span class="ix">6</span>{T("Yuvarlat 1","Fillet 1")}</div>'
    rows=[('btn','Birincil',btn('primary')),('btn','İkincil',btn('')),('btn','Hayalet',btn('ghost')),('btn','Tehlikeli',btn('danger')),('tool','Şerit düğmesi',tl),('tool','Şerit (etkin)',tlon),('f','Alan',fld),('f','Onay kutusu',chk),('f','Anahtar',sw),('f','Ağaç satırı',tr),('f','Zaman çizelgesi çipi',chip)]
    head_row=''.join(f'<div class="h">{T(a,b)}</div>' for a,b in [('Normal','Normal'),('Üzerine gelme','Hover'),('Basılı / seçili','Pressed / selected'),('Odak','Focus'),('Devre dışı','Disabled'),('Hata','Error')])
    grid=f'<div class="states"><div></div>{head_row}'+''.join(row(T(l,l),f) for k,l,f in rows)+'</div>'
    extras=(f'<div class="card"><h3>{T("Kaydırıcı, segment, rozet, ipucu","Slider, segmented control, badge, tooltip")}</h3><div class="row" style="gap:24px;flex-wrap:wrap;align-items:flex-start">'
      f'<div class="slider" style="width:240px"><div class="rail"><div class="fill" style="width:60%"></div><div class="thumb" style="left:60%"></div></div><span class="val num">2,5</span></div>'
      f'<div class="slider focus" style="width:240px"><div class="rail"><div class="fill" style="width:30%"></div><div class="thumb" style="left:30%"></div></div><span class="val num">1</span></div>'
      f'<div class="slider disabled" style="width:240px"><div class="rail"><div class="fill" style="width:50%"></div><div class="thumb" style="left:50%"></div></div><span class="val num">2</span></div>'
      f'<div class="seg" style="width:260px"><button aria-pressed="true">{T("Normal","Normal")}</button><button aria-pressed="false">{T("Büyük","Large")}</button></div>'
      f'<div style="position:relative;width:300px;height:78px"><div class="tip" style="position:static"><div class="th"><span>{T("Yuvarlat","Fillet")}</span><span class="kbd">F</span></div><div class="tb">{T("Seçili kenarları yuvarlar.","Rounds the selected edges.")}</div></div></div>'
      f'</div></div>')
    table=(f'<div class="card"><h3>{T("Tablo","Table")}</h3><table class="table"><thead><tr><th>{T("Ad","Name")}</th><th class="r">{T("Değer","Value")}</th><th>{T("Birim","Unit")}</th><th>{T("Not","Note")}</th></tr></thead><tbody>'
      f'<tr><td class="mono">plaka_x</td><td class="r num">120,00</td><td>mm</td><td>{T("Plaka genişliği","Plate width")}</td></tr><tr class="sel"><td class="mono">kalinlik</td><td class="r num">14,00</td><td>mm</td><td>{T("Seçili satır","Selected row")}</td></tr><tr><td class="mono err">delik_d</td><td class="r num err">—</td><td>mm</td><td class="err">{ic("error","sm")} {T("Çözülemedi","Unresolved")}</td></tr></tbody></table></div>')
    body=f'''{head("Mihenk — Bileşen durumları")}<body>
<div class="app" style="grid-template-rows: var(--titlebar-h) 1fr;min-width:0">{titlebar(None,welcome=True)}<div class="board"><div class="card"><h3>{T("Bileşen durumları","Component states")}</h3>{grid}</div>{extras}{table}</div></div>'''
    open(D+'mockups/'+out,'w').write(body+tail())
