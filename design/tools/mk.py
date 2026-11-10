"""Mockup üretici yardımcıları: simge gömme, çift dilli metin, kabuk bileşenleri."""
import json, re, os, html
D='/home/claude/atolyecad/design/'
ICONS=json.load(open('/home/claude/atolyecad/brand/icons/icons.json'))['icons']
TX={}   # anahtar -> [tr, en]
def T(tr,en=None,cls=''):
    en=en if en is not None else tr
    k='t%03d'%len(TX); 
    for kk,v in TX.items():
        if v==[tr,en]: k=kk; break
    TX[k]=[tr,en]
    return f'<span data-t="{k}"{(" class=%s"%chr(34)+cls+chr(34)) if cls else ""}>{html.escape(tr)}</span>'
def TKEY(tr,en=None):
    return re.search(r'data-t="(\w+)"',T(tr,en)).group(1)
def N(v,unit=None,dec=None):
    s=str(v); out=f'<span class="num" data-n="{s}">{s.replace(".",",")}</span>'
    return out+(f'&nbsp;<span class="u">{unit}</span>' if unit else '')
def ic(name,cls=''):
    return f'<svg class="ic {cls}" viewBox="0 0 24 24" data-ic="{name}" aria-hidden="true">{ICONS[name]}</svg>'
def BTN(tr,en,cls='',icon=None,extra=''): return f'<button class="btn {cls}" {extra}>{ic(icon,"sm") if icon else ""}{T(tr,en)}</button>'
def tool(icon,tr,en,cls='',caret=False,dis=False,tid=''):
    return f'<button class="tool {cls}" {"disabled" if dis else ""} {("id=%s"%chr(34)+tid+chr(34)) if tid else ""}>{ic(icon,"lg")}<span class="l">{T(tr,en)}</span>{ic("chevron-down","caret") if caret else ""}</button>'
def tsm(icon,tr,en,cls='',caret=False):   # simge + etiket, tek satır
    return f'<button class="tool {cls}">{ic(icon)}<span class="l">{T(tr,en)}</span>{ic("chevron-down","caret") if caret else ""}</button>'
def grp(label_tr,label_en,inner,cls=''): return f'<div class="rgroup {cls}"><div class="btns">{inner}</div><div class="glabel">{T(label_tr,label_en)}</div></div>'
MARK_REV=open('/home/claude/atolyecad/brand/logo/logo-mark-reverse.svg').read()

def head(title,extra=''):
    return f'''<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>{title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="../components.css"><link rel="stylesheet" href="../_states.css"><link rel="stylesheet" href="mock.css">{extra}
<script src="_i18n.js"></script></head>'''
def tail(): return '<script src="_shared.js"></script></body></html>\n'

def titlebar(doc=None,dirty=True,machine=True,welcome=False):
    left=f'<div class="brand"><img src="../../brand/logo/logo-horizontal-reverse.svg" height="22" alt="Mihenk"></div>'
    if not welcome:
        left+=f'''<button class="tbtn">{ic("file-open")}{T("Dosya","File")}{ic("chevron-down","sm")}</button>
        <span class="sep"></span>
        <button class="tbtn icon-only" title="Geri al">{ic("undo")}</button><button class="tbtn icon-only">{ic("redo")}</button><button class="tbtn icon-only">{ic("file-save")}</button>'''
    mid=''
    if doc: mid=f'<div class="doc"><span class="name">{doc}</span>{"<span class=dirty>"+T("Kaydedilmemiş","Unsaved")+"</span>" if dirty else ""}</div>'
    right='<span class="grow"></span>'
    if not welcome:
        right+=f'''<button class="cmdsearch">{ic("search")}<span>{T("Komut ara","Search commands")}</span><span class="kbd">Ctrl+K</span></button>'''
        if machine: right+=f'''<button class="machine-chip">{ic("axes-3")}<span>Neway VM1160H</span><small>{T("3 eksen","3-axis")}</small>{ic("chevron-down","sm")}</button>'''
    right+=f'<button class="tbtn icon-only" title="Ayarlar">{ic("settings")}</button><button class="tbtn icon-only">{ic("help")}</button>'
    return f'<header class="titlebar on-dark">{left}{mid}{right}</header>'

def tabs(active):
    def tb(id,icon,tr,en,dis=False):
        return f'<button class="tab" role="tab" aria-selected="{"true" if id==active else "false"}" {"aria-disabled=true" if dis else ""}>{ic(icon)}{T(tr,en)}{"<span class=soon>"+T("yakında","soon")+"</span>" if dis else ""}</button>'
    return f'''<nav class="tabs" role="tablist">{tb("design","workspace-design","Tasarım","Design")}{tb("cam","workspace-manufacture","İmalat","Manufacture")}{tb("draw","workspace-drawing","Çizim","Drawing",True)}
    <div class="right"><span class="badge">{ic("lock")}{T("Çevrimdışı","Offline")}</span></div></nav>'''

def statusbar(left,right):
    return f'<footer class="statusbar on-dark">{left}<span class="grow"></span>{right}</footer>'

def sb_div(): return '<span class="div"></span>'

# ---- 3B kabı ----
def viewwrap(scene_svg,overlays='',scene_wh=(1000,640),cls=''):
    return f'<div class="viewwrap {cls}" data-scene="{scene_wh[0]},{scene_wh[1]}">{scene_svg}{overlays}</div>'
def scene(inner,w=1000,h=640): return f'<svg class="scene" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid meet">{inner}</svg>'
def at(x,y,inner,cls='dimlabel',extra=''): return f'<div class="{cls}" data-sx="{x}" data-sy="{y}" {extra}>{inner}</div>'

def viewcube():
    # basit görünüm küpü (izometrik, yüz etiketleri)
    return f'''<div class="viewcube"><svg viewBox="0 0 80 80">
    <polygon points="40,8 68,24 40,40 12,24" fill="var(--bg-hover)" stroke="var(--line-strong)" stroke-width="1.5"/>
    <polygon points="12,24 40,40 40,72 12,56" fill="var(--bg-sunken)" stroke="var(--line-strong)" stroke-width="1.5"/>
    <polygon points="68,24 40,40 40,72 68,56" fill="var(--accent-tint)" stroke="var(--accent)" stroke-width="2"/>
    <text x="40" y="29" text-anchor="middle" font-size="8" font-weight="600" fill="var(--text)" data-t="{TKEY("Üst","Top")}">Üst</text>
    <text x="26" y="52" text-anchor="middle" font-size="8" font-weight="600" fill="var(--text)" transform="rotate(26 26 52)" data-t="{TKEY("Ön","Front")}">Ön</text>
    <text x="54" y="52" text-anchor="middle" font-size="8" font-weight="600" fill="var(--accent)" transform="rotate(-26 54 52)" data-t="{TKEY("Sağ","Right")}">Sağ</text>
    </svg></div>'''

def write_support():
    json.dump(TX,open('/tmp/tx.json','w'),ensure_ascii=False)
    open(D+'mockups/_i18n.js','w').write('window.TX='+json.dumps(TX,ensure_ascii=False)+';')
