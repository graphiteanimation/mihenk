from mk import *
from scenes import *
import m_design

def welcome(out='01-karsilama.html'):
    recents=[('Montaj plakası.mhnk','D:\\Projeler\\Neway\\Montaj plakası.mhnk',T('Bugün 14:32','Today 14:32'),True),('Flanş Ø120.mhnk','D:\\Projeler\\Flanş\\Flanş Ø120.mhnk',T('Dün 17:05','Yesterday 17:05'),False),('Mil yatağı kapağı.mhnk','D:\\Projeler\\Yatak\\Mil yatağı kapağı.mhnk',T('4 Kasım','4 Nov'),False),('Soğutucu blok.acad','D:\\Eski\\Soğutucu blok.acad',T('21 Ekim','21 Oct'),False)]
    ri=''.join(f'<div class="ri {"sel" if s else ""}"><div class="thumb">{ic("box")}</div><div><div class="nm">{n}</div><span class="path">{p}</span></div><div class="meta">{d}{"  "+("<span class=badge>"+T("eski biçim","legacy")+"</span>") if n.endswith(".acad") else ""}</div></div>' for n,p,d,s in recents)
    body=f'''{head("Mihenk — Karşılama")}<body>
<div class="app" style="grid-template-rows: var(--titlebar-h) 1fr var(--status-h); min-width:0">{titlebar(None,welcome=True)}
<div class="welcome">
  <section class="left">
    <img class="logo-light" src="../../brand/logo/logo-horizontal.svg" alt="Mihenk" height="48" style="align-self:flex-start"><img class="logo-dark" src="../../brand/logo/logo-horizontal-reverse.svg" alt="Mihenk" height="48" style="align-self:flex-start">
    <div><h1>{T("Atölye için CAD/CAM.","CAD/CAM for the shop floor.")}</h1><p class="lead" style="margin-top:12px">{T("Çevrimdışı çalışır. Dosyalarınız bu bilgisayarda kalır. Hesabın sonucu ekranda görünür, doğrulanmayan hiçbir şey sessizce geçmez.","Works offline. Your files stay on this computer. Every result is visible, and nothing unverified passes silently.")}</p></div>
    <div class="col" style="gap:12px">
      <button class="bigact primary">{ic("file-new")}<span>{T("Yeni belge","New document")}<span class="sub">{T("Boş bir parça ile başla","Start with an empty part")}</span></span><span class="kbd">Ctrl+N</span></button>
      <button class="bigact">{ic("file-open")}<span>{T("Aç…","Open…")}<span class="sub">{T("Mihenk, eski AtolyeCAD ve STEP dosyaları","Mihenk, legacy AtolyeCAD and STEP files")}</span></span><span class="kbd">Ctrl+O</span></button>
      <button class="bigact">{ic("box")}<span>{T("Örnek parça","Sample part")}<span class="sub">{T("Flanş plakası — sketch, extrude, delik","Flange plate — sketch, extrude, hole")}</span></span></button>
    </div>
    <div class="foot"><span class="badge ok">{ic("check","sm")}{T("Çekirdek hazır","Kernel ready")}</span><span>{T("Sürüm","Version")} 0.2.0</span><span>{T("Çevrimdışı · veriler bu bilgisayarda","Offline · data stays on this computer")}</span></div>
  </section>
  <section class="right">
    <div class="callout warn">{ic("warning")}<div><div class="ct">{T("Kurtarılmış belge var","A recovered document exists")}</div>{T("Beklenmedik bir kapanıştan önceki otomatik kayıt: Montaj plakası, 14:18.","Autosave from before an unexpected shutdown: Montaj plakası, 14:18.")}<div class="row" style="margin-top:10px;gap:8px"><button class="btn sm primary">{T("Kurtar","Recover")}</button><button class="btn sm">{T("Sil","Discard")}</button></div></div></div>
    <div class="row" style="justify-content:space-between;margin-top:8px"><h2 style="margin:0;font-size:var(--fs-lg)">{T("Son kullanılanlar","Recent")}</h2><button class="btn sm ghost">{T("Listeyi temizle","Clear list")}</button></div>
    <div class="recent">{ri}</div>
    <div class="card" style="margin-top:12px"><h3>{T("İlk parça: üç adım","First part: three steps")}</h3><div class="row" style="gap:10px;flex-wrap:wrap"><span class="badge lg">{ic("sketch","sm")}1 · {T("Sketch çiz","Draw a sketch")}</span>{ic("chevron-right","sm")}<span class="badge lg">{ic("extrude","sm")}2 · Extrude</span>{ic("chevron-right","sm")}<span class="badge lg">{ic("hole","sm")}3 · {T("Delik aç","Add a hole")}</span></div><div class="cap">{T("Komut aramak için Ctrl+K ya da S tuşuna basın.","Press Ctrl+K or S to search for any command.")}</div></div>
  </section>
</div>
{statusbar(f'<span class="seg-i">{ic("lock","sm")}{T("Çevrimdışı","Offline")}</span>',
 f'<span class="seg-i">{T("Dil","Language")}:</span><span class="seg" style="width:auto;border-color:rgba(255,255,255,.4);background:transparent;height:24px"><button aria-pressed="true" style="height:22px;color:#fff;background:rgba(255,255,255,.18);box-shadow:none">TR</button><button aria-pressed="false" style="height:22px;color:#C7D0DA">EN</button></span>{sb_div()}<span class="seg-i">{T("Tema","Theme")}:</span><span class="seg-i"><b>{T("Açık","Light")}</b></span>{sb_div()}<span class="seg-i">{T("Yoğunluk","Density")}: <b>{T("Normal","Normal")}</b></span>')}
</div>'''
    open(D+'mockups/'+out,'w').write(body+tail())

def settings(out='04-ayarlar.html'):
    sc,iso=m_design.model_scene()
    nav=''.join(f'<div class="trow {"sel" if s else ""}" style="padding-left:16px">{ic(i,"sm")}<span class="nm">{T(a,b)}</span></div>' for i,a,b,s in [('settings','Genel','General',1),('theme','Görünüm','Appearance',0),('select','Fare ve klavye','Mouse & keyboard',0),('measure','Birimler','Units',0),('file-save','Dosya ve kurtarma','Files & recovery',0),('info','Hakkında','About',0)])
    def row(lab,ctl,help=''): return f'<div class="fld" style="grid-template-columns:200px 1fr"><label style="font-size:var(--fs-md);color:var(--text)">{lab}</label><div class="ctl">{ctl}{"<div class=help>"+help+"</div>" if help else ""}</div></div>'
    seg=lambda items,on:'<div class="seg" style="width:auto;display:inline-flex">'+''.join(f'<button aria-pressed="{"true" if i==on else "false"}" style="padding:0 16px">{x}</button>' for i,x in enumerate(items))+'</div>'
    content=(f'<div class="psec" style="margin-top:0">{T("Arayüz","Interface")}</div>'
        +row(T("Dil","Language"),seg(['Türkçe','English'],0))
        +row(T("Tema","Theme"),seg([ic("theme","sm")+T(" Açık"," Light"),T("Koyu","Dark"),T("Sistem","System")],0),T("Sistem: Windows temasını izler.","System: follows the Windows theme."))
        +row(T("Yoğunluk","Density"),seg([T("Normal","Normal"),T("Büyük","Large")],0),T("Büyük: 40 px hedefler ve 16 px yazı. Eldivenle ve uzaktan kullanım için.","Large: 40 px targets and 16 px text. For gloved and distant use."))
        +f'<div class="psec">{T("Birim gösterimi","Unit display")}</div>'
        +row(T("Uzunluk birimi","Length unit"),seg(['mm','inç' if False else 'in'],0))
        +row(T("Ondalık basamak","Decimal places"),f'<div class="slider" style="max-width:320px"><div class="rail"><div class="fill" style="width:50%"></div><div class="thumb" style="left:50%"></div></div><span class="val num">2</span></div>',T("Örnek: 12,50 mm. Ondalık ayracı dile göre değişir.","Example: 12.50 mm. The decimal separator follows the language."))
        +f'<div class="psec">{T("Fare","Mouse")}</div>'
        +row(T("Fare düzeni","Mouse layout"),f'<div class="input" style="max-width:320px"><select><option>{T("Mihenk (varsayılan)","Mihenk (default)")}</option></select><span class="step">{ic("chevron-down","sm")}</span></div>')
        +f'<table class="table tbl-sm" style="max-width:520px;margin:4px 0 8px 200px;width:calc(100% - 200px)"><thead><tr><th>{T("İşlem","Action")}</th><th>{T("Fare","Mouse")}</th></tr></thead><tbody><tr><td>{T("Döndür","Orbit")}</td><td>{T("Orta tuş sürükle","Middle drag")}</td></tr><tr><td>{T("Kaydır","Pan")}</td><td>Shift + {T("orta tuş","middle")}</td></tr><tr><td>{T("Yakınlaştır","Zoom")}</td><td>{T("Tekerlek","Wheel")}</td></tr></tbody></table>'
        +f'<div class="psec">{T("Kurtarma","Recovery")}</div>'
        +row(T("Otomatik kaydet","Autosave"),f'<label class="switch on"><span class="track"></span><span class="state">{T("Açık","On")}</span></label>',T("Her 2 dakikada ayrı bir kurtarma dosyasına yazar. Asıl dosyanızı değiştirmez.","Writes to a separate recovery file every 2 minutes. Never touches your original file.")))
    modal=f'''<div class="scrim"><div class="modal" role="dialog" aria-modal="true" style="width:860px;height:760px"><header>{ic("settings")}{T("Ayarlar","Settings")}<button class="x">{ic("close")}</button></header>
      <div style="display:grid;grid-template-columns:210px 1fr;flex:1;min-height:0"><nav style="background:var(--bg-chrome);border-right:1px solid var(--line);padding:8px 0">{nav}</nav><div class="body" style="padding:20px 28px">{content}</div></div>
      <footer><span class="left">{T("Değişiklikler anında uygulanır.","Changes apply immediately.")}</span><button class="btn ghost">{T("Varsayılana dön","Reset to defaults")}</button><button class="btn primary">{T("Kapat","Close")}</button></footer></div></div>'''
    left=f'<span class="seg-i">{ic("workspace-design","sm")}<b>{T("Model kipi","Model mode")}</b></span>'
    over=f'<div class="vp-overlay-tr">{viewcube()}</div>'
    body=f'''{head("Mihenk — Ayarlar")}<body>
<div style="position:relative;height:100vh"><div class="app">{titlebar("Montaj plakası.mhnk")}{tabs("design")}{m_design.design_ribbon()}
<div class="main">{m_design.browser_design()}{viewwrap(sc,over)}<aside class="panel"></aside></div>{m_design.timeline(error_idx=5)}{statusbar(left,"")}</div>{modal}</div>'''
    open(D+'mockups/'+out,'w').write(body+tail())

def dialogs(out='04b-hata-onay-bildirim.html'):
    def modal(cls,icn,title,body,foot,left=''):
        return f'<div class="modal {cls}" style="width:100%"><header>{ic(icn)}{title}</header><div class="body" style="padding:16px 20px">{body}</div><footer style="padding:0 20px">{left}{foot}</footer></div>'
    confirm=modal('dlg-warn','warning',T("Takım silinsin mi?","Delete this tool?"),f'<p style="margin:0 0 8px"><b>T2 · Ø12 end mill</b> {T("silinecek. 2 işlem bu takımı kullanıyor ve takımsız kalacak.","will be deleted. 2 operations use this tool and will be left without one.")}</p><p style="margin:0;color:var(--text-muted)">{T("Bu işlem geri alınamaz.","This cannot be undone.")}</p>',
        f'<button class="btn is-focus">{T("Vazgeç","Cancel")}</button><button class="btn danger-outline">{ic("trash","sm")}{T("Takımı sil","Delete tool")}</button>')
    unsaved=modal('','file-save',T("Kaydedilmemiş değişiklikler var","You have unsaved changes"),f'<p style="margin:0">{T("Montaj plakası.mhnk kapanmadan önce kaydedilsin mi?","Save Montaj plakası.mhnk before closing?")}</p>',
        f'<button class="btn">{T("Kaydetme","Don\'t save")}</button><button class="btn">{T("Vazgeç","Cancel")}</button><button class="btn primary is-focus">{T("Kaydet","Save")}</button>')
    err=modal('dlg-err','error',T("Dosya açılamadı","Could not open the file"),f'<p style="margin:0 0 8px">{T("Montaj plakası.mhnk okunamadı. Dosya bozuk görünüyor.","Montaj plakası.mhnk could not be read. The file looks damaged.")}</p><p style="margin:0"><b>{T("Ne yapmalı:","What to do:")}</b> {T("Son otomatik kaydı açın ya da yedek kopyayı kullanın.","Open the latest autosave or use a backup copy.")}</p><div class="details">E-FILE-12 · 0x2B at offset 4096</div>',
        f'<button class="btn">{T("Kapat","Close")}</button><button class="btn primary">{T("Otomatik kaydı aç","Open autosave")}</button>',f'<button class="btn ghost sm">{ic("duplicate","sm")}{T("Ayrıntıyı kopyala","Copy details")}</button>')
    toasts=(f'<div class="toast err">{ic("error")}<div><div class="tt">{T("Dosya kaydedilemedi","Could not save the file")}</div><div class="tb">{T("Disk dolu olabilir. Başka bir klasöre kaydedin.","The disk may be full. Save to another folder.")}</div></div><button class="x">{ic("close","sm")}</button><div class="acts"><button class="btn sm">{T("Farklı kaydet","Save as")}</button></div></div>'
        f'<div class="toast warn">{ic("warning")}<div><div class="tt">{T("Yuvarlat 1 hata veriyor","Fillet 1 failed")}</div><div class="tb">{T("Değer bu kenarlar için fazla büyük. Özelliği düzenleyin.","The value is too large for these edges. Edit the feature.")}</div></div><button class="x">{ic("close","sm")}</button></div>'
        f'<div class="toast ok">{ic("success")}<div><div class="tt">{T("Kaydedildi","Saved")}</div><div class="tb">Montaj plakası.mhnk · 14:32</div></div><button class="x">{ic("close","sm")}</button></div>'
        f'<div class="toast info">{ic("info")}<div><div class="tt">{T("Eski biçim açıldı","Legacy format opened")}</div><div class="tb">{T("Kaydedince .mhnk olarak yazılır; eski dosya korunur.","Saving writes .mhnk; the original file is kept.")}</div></div><button class="x">{ic("close","sm")}</button></div>')
    busy=(f'<div class="callout info">{ic("clock","sm")}<div><div class="ct">{T("Takım yolu hesaplanıyor","Computing toolpath")}</div>{T("Cep · T2. Kalan yaklaşık 18 sn. Hesap sürerken belge düzenlenebilir.","Pocket · T2. About 18 s left. You can keep editing while it runs.")}'
          f'<div style="margin:10px 0 6px;height:8px;border-radius:4px;background:var(--bg-sunken);border:1px solid var(--line);overflow:hidden"><div style="width:42%;height:100%;background:var(--accent)"></div></div><div class="row" style="justify-content:space-between"><span class="num">%42</span><button class="btn sm">{ic("stop","sm")}{T("İptal","Cancel")}</button></div></div></div>'
          f'<div class="row" style="gap:12px;margin-top:4px"><span class="spinner"></span><span>{T("Çekirdek yükleniyor…","Loading kernel…")}</span></div><div class="cap">{T("Süre belli değilse dönen gösterge; belliyse ilerleme çubuğu. İptal her zaman görünür.","Spinner when the time is unknown; progress bar when known. Cancel is always visible.")}</div>')
    fields=(f'<div class="fld" style="grid-template-columns:90px 1fr"><label>{T("Normal","Normal")}</label><div class="ctl"><div class="input"><input value="14"><span class="unit">mm</span></div></div></div>'
            f'<div class="fld" style="grid-template-columns:90px 1fr"><label>{T("İfade","Expression")}</label><div class="ctl"><div class="input"><input class="expr" value="plaka_x / 2 + 5"><span class="unit">mm</span></div><div class="resolved">= {N("65.00")} mm</div></div></div>'
            f'<div class="fld" style="grid-template-columns:90px 1fr"><label>{T("Hata","Error")}</label><div class="ctl"><div class="input err"><input value="-3"><span class="unit">mm</span></div><div class="fieldmsg">{ic("error","sm")}<span>{T("Mesafe 0\'dan büyük olmalı. Örnek: 5","Distance must be greater than 0. Example: 5")}</span></div></div></div>'
            f'<div class="fld" style="grid-template-columns:90px 1fr"><label>{T("Birim","Unit")}</label><div class="ctl"><div class="input err"><input class="expr" value="12 kg"><span class="unit">mm</span></div><div class="fieldmsg">{ic("error","sm")}<span>{T("\'kg\' uzunluk birimi değil. mm, cm, m ya da in yazın.","\'kg\' is not a length unit. Use mm, cm, m or in.")}</span></div></div></div>')
    badges=(f'<div class="row" style="flex-wrap:wrap;gap:8px"><span class="badge err">{ic("error","sm")}{T("Hata","Error")}</span><span class="badge warn">{ic("warning","sm")}{T("Uyarı","Warning")}</span><span class="badge ok">{ic("success","sm")}{T("Tamam","Done")}</span><span class="badge info">{ic("info","sm")}{T("Bilgi","Info")}</span><span class="badge unv">{ic("unverified","sm")}{T("Doğrulanmadı","Unverified")}</span><span class="badge">{ic("lock","sm")}{T("Çevrimdışı","Offline")}</span></div>'
            f'<div class="callout unv">{ic("unverified","sm")}<div><div class="ct">{T("DOĞRULANMADI","UNVERIFIED")}</div>{T("Simülasyonda ve tezgâhta denenmedi.","Not run in simulation or on the machine.")}</div></div><div class="cap">{T("Her durumun kendi simgesi, metni ve biçimi var; renk tek taşıyıcı değildir.","Each state has its own icon, text and shape; colour is never the only carrier.")}</div>')
    palette=(f'<div class="cmd-palette" style="width:100%"><div class="q">{ic("search")}<span>ext</span><span class="kbd" style="margin-left:auto">Esc</span></div><div class="res sel">{ic("extrude")}<span>Extrude</span><span class="kbd">E</span></div><div class="res">{ic("dxf-export")}<span>{T("DXF dışa aktar","Export DXF")}</span></div><div class="res">{ic("extend")}<span>{T("Uzat (sketch)","Extend (sketch)")}</span></div></div>'
            f'<div class="ctxmenu" style="margin-top:8px;width:100%"><div class="mi hl">{ic("rename","sm")}{T("Yeniden adlandır","Rename")}<span class="kbd">F2</span></div><div class="mi">{ic("suppress","sm")}{T("Bastır","Suppress")}</div><div class="mi">{ic("rollback","sm")}{T("Buraya geri sar","Roll back here")}</div><hr><div class="mi danger">{ic("trash","sm")}{T("Sil","Delete")}<span class="kbd">Del</span></div></div>')
    cards=[(T("Onay — geri alınamaz işlem","Confirm — irreversible"),confirm,T("Varsayılan odak güvenli seçenekte (Vazgeç). Yıkıcı düğme kenarlıklı kırmızı, sağda.","Default focus on the safe option (Cancel). The destructive button is outlined red, on the right.")),
           (T("Kaydedilmemiş değişiklik","Unsaved changes"),unsaved,T("Varsayılan: Kaydet. Enter kaydeder, Esc vazgeçer.","Default: Save. Enter saves, Esc cancels.")),
           (T("Hata — ne oldu, ne yapmalı","Error — what happened, what to do"),err,T("Teknik ayrıntı ayrı kutuda; kopyalanabilir.","Technical detail in its own box; copyable.")),
           (T("Bildirimler","Toasts"),'<div class="col" style="gap:8px">'+toasts.replace('class="toast ','class="toast fluid ')+'</div>',T("Hata kalıcı, uyarı 8 sn, bilgi ve başarı 5 sn. Kuyruk en fazla 3.","Error persists, warning 8 s, info and success 5 s. Max 3 queued.")),
           (T("Uzun hesap ve yükleme","Long compute and loading"),busy,''),
           (T("Sayısal alan","Numeric field"),fields,T("Birim her zaman görünür. İfade çözümü altında yazar.","Unit is always visible. The resolved value is shown below.")),
           (T("Durum rozetleri","Status badges"),badges,''),
           (T("Komut paleti ve bağlam menüsü","Command palette & context menu"),palette,T("Ctrl+K ya da S. Yazarak ara, Enter çalıştırır.","Ctrl+K or S. Type to search, Enter runs."))]
    cs=''.join(f'<section class="card"><h3>{t}</h3>{b}{"<div class=cap>"+c+"</div>" if c else ""}</section>' for t,b,c in cards)
    body=f'''{head("Mihenk — Hata, onay ve bildirim kalıpları")}<body>
<div class="app" style="grid-template-rows: var(--titlebar-h) 1fr;min-width:0">{titlebar(None,welcome=True)}<div class="board" style="grid-template-columns:repeat(4,minmax(0,1fr));align-items:start">{cs}</div></div>'''
    open(D+'mockups/'+out,'w').write(body+tail())
