# İmalat (CAM) aşaması — e2e.py'den çağrılır (parça üretildikten sonra). Gerçek tıklama/yazma; kanca yalnız okuma/ölçme için.
import os, sys, json, re, time
G = {}
def run(E):
    G.update({k: getattr(E, k) for k in dir(E) if not k.startswith('__')})
    for fn in PHASES:
        try: fn()
        except Exception as e:
            G['NOTES'].append('FAZ HATASI %s: %s' % (fn.__name__, str(e).splitlines()[0][:200])); print('FAZ HATASI', fn.__name__, str(e)[:300], flush=True)
            try: G['shot'](G['C'].pg, 'faz-hata-' + fn.__name__)
            except Exception: pass
            break
def toasts(): return G['js']("[...document.querySelectorAll('#toast .toast')].map(e => '[' + e.dataset.kind + '] ' + e.innerText.replace(/\\s+/g,' ')).join(' || ')")
def N(s): G['NOTES'].append(s); print('  ·', s, flush=True)
def S(name, fn, **k): return G['step'](name, fn, **k)
def T(sel): return G['txt'](sel)
def pg(): return G['C'].pg
def lang(): return G['LANG']

def ph_tab():
    S('c01-imalat-sekmesi', lambda: (G['click']('[data-testid=tab-manufacture]'), G['wait'](900)))
    N('mod=%s doc.cam=%s' % (G['js']('app.mode'), G['js']('JSON.stringify(app.doc.cam)')))
    # boş durum: setup/işlem yokken eylemler
    def empty():
        for c in ['cam-post', 'cam-sim', 'cam-compute', 'cam-nc', 'cam-op-face', 'cam-op-drill', 'cam-stock', 'cam-setup']:
            N('%s: aria-disabled=%s title=%s' % (c, G['js']("(c) => document.querySelector('[data-cmd='+c+']')?.getAttribute('aria-disabled')", c), G['js']("(c) => document.querySelector('[data-cmd='+c+']')?.title || ''", c)))
        G['pg'] = pg()
        pg().hover('[data-cmd=cam-op-face]'); G['wait'](900); N('Yüzey ipucu (hover): ' + G['js']("() => [...document.querySelectorAll('[role=tooltip], .tip, #tip')].map(e => e.innerText).join('|')"))
    S('c02-bos-eylemler', empty)

def ph_machine():
    def mgr():
        G['click']('[data-cmd=cam-machine]'); G['wait'](600)
        N('tezgâh yöneticisi metni: ' + T('#modal').replace('\n', ' / ')[:300])
        names = G['js']("[...document.querySelectorAll('#modal [data-testid=mc-row] .mc-pick > span:not(.badge)')].map(e => Math.round(e.getBoundingClientRect().width))")
        N('tezgâh adı yayılım genişlikleri (px): %s' % names)
    S('c03-tezgah-yoneticisi', mgr)
    def tmpl():
        # şablon seçili (varsayılan Neway); düzenle düğmesi yok, kopyala var
        N('şablon satırında düzenle/sil: edit=%d del=%d copy=%d' % (G['cnt']('#modal [data-testid=mc-edit]'), G['cnt']('#modal [data-testid=mc-del]'), G['cnt']('#modal [data-testid=mc-copy]')))
        G['click']('#modal .btn.pri'); G['wait'](300)
    S('c04-tezgah-sablon-kapat', tmpl)


def tool_new(typ=None):
    G['click']('[data-testid=tl-new]'); G['wait'](300)
    if typ: pg().select_option('[data-f=tl-type]', typ)
def tool_fill(name, num, dia, h_=None, d_=None, extra=None, preset=None):
    G['fill']('[data-f=tl-name]', name); G['fill']('[data-f=tl-number]', str(num)); G['fill']('[data-f=tl-lengthOffset]', str(h_ or num)); G['fill']('[data-f=tl-diaOffset]', str(d_ or num))
    G['click']('[data-testid=tl-tab-geom]'); G['fill']('[data-f=tl-dia]', str(dia))
    for k, v in (extra or {}).items(): G['fill']('[data-f=%s]' % k, str(v))
    if preset:
        G['click']('[data-testid=tl-tab-presets]'); G['click']('[data-testid=preset-add]'); G['wait'](200)
        for k, v in preset.items(): G['fill']('[data-f=pr-0-%s]' % k, str(v))

def tool_ok(): G['click']('[data-testid=tl-ok]'); G['wait'](400)
def tools_json(): return G['js']('JSON.stringify((app.doc.cam && app.doc.cam.tools || []).map(t => [t.number, t.lengthOffset, t.diaOffset, t.type, t.dia]))')
def ph_tools():
    S('c05-takim-yonetici-bos', lambda: (G['click']('[data-cmd=cam-tools]'), G['wait'](500)))
    def prot():
        tool_new('face')
        G['fill']('[data-f=tl-name]', 'Yüzey frezesi Ø50'); G['fill']('[data-f=tl-number]', '1'); G['fill']('[data-f=tl-lengthOffset]', '3'); G['fill']('[data-f=tl-diaOffset]', '12'); G['wait'](300)
        N('T1/H3/D12 alan uyarıları: ' + ' | '.join(G['js']("[...document.querySelectorAll('#modal .fieldmsg')].map(e => e.innerText).filter(Boolean)")) + ' || kutu: ' + T('.mc-err').replace('\n', ' '))
        G['click']('[data-testid=tl-tab-geom]'); G['fill']('[data-f=tl-dia]', '50'); G['fill']('[data-f=tl-flutes]', '5'); G['fill']('[data-f=tl-fluteLen]', '10'); G['fill']('[data-f=tl-bodyLen]', '40')
        G['click']('[data-testid=tl-tab-presets]'); G['click']('[data-testid=preset-add]'); G['wait'](200)
        for k, v in {'rpm': 3000, 'feedCut': 900, 'feedPlunge': 300, 'stepdown': 1, 'stepover': 35}.items(): G['fill']('[data-f=pr-0-%s]' % k, str(v))
    S('c06-korunan-T1-H3-D12-yuzey-frezesi', prot)
    def saveprot():
        tool_ok(); N('korunan numarayla Tamam: editör açık=%d; takımlar=%s' % (G['cnt']('[data-testid=tool-editor]'), tools_json()))
        N('liste satırı: ' + G['js']("[...document.querySelectorAll('[data-testid=tool-row]')].map(e => e.innerText.replace(/\\s+/g,' ')+' class='+e.className).join(' || ')"))
    S('c07-korunan-ile-kaydet', saveprot)
    def neg():
        tool_new('flat'); G['fill']('[data-f=tl-name]', 'Negatif deneme'); G['fill']('[data-f=tl-number]', '4'); G['fill']('[data-f=tl-lengthOffset]', '4'); G['fill']('[data-f=tl-diaOffset]', '4')
        G['click']('[data-testid=tl-tab-geom]'); G['fill']('[data-f=tl-dia]', '-5'); G['wait'](300)
        N('negatif çap alan mesajı: ' + T('[data-row=tl-dia]').replace('\n', ' ') + ' | kutu: ' + T('.mc-err').replace('\n', ' '))
        tool_ok(); N('negatif çap Tamam sonrası: editör açık=%d; takımlar=%s; toast=%s' % (G['cnt']('[data-testid=tool-editor]'), tools_json(), toasts()))
    S('c08-negatif-cap-tamam', neg)
    def dup():
        tool_new('flat'); G['fill']('[data-f=tl-name]', 'Kopya numara'); G['fill']('[data-f=tl-number]', '4'); G['wait'](300)
        N('yinelenen T4: ' + T('.mc-err').replace('\n', ' ')); tool_ok(); N('yinelenen T4 Tamam: editör açık=%d' % G['cnt']('[data-testid=tool-editor]'))
        pg().keyboard.press('Escape'); G['wait'](300); N('Esc editörü kapattı, yönetici hâlâ açık=%d' % G['cnt']('[data-testid=tool-manager]'))
    S('c09-yinelenen-numara', dup)
    def fix4():
        # negatif denemeyle kaydedilen T4'ü gerçek Ø8 parmak frezeye çevir
        row = pg().locator('[data-testid=tool-row][data-num="4"] [data-testid=tl-edit]'); N('T4 satırı var=%d' % row.count())
        row.click(); G['wait'](300); G['fill']('[data-f=tl-name]', 'Parmak freze Ø8')
        G['click']('[data-testid=tl-tab-geom]'); G['fill']('[data-f=tl-dia]', '8'); G['fill']('[data-f=tl-flutes]', '3'); G['fill']('[data-f=tl-fluteLen]', '20'); G['fill']('[data-f=tl-bodyLen]', '45')
        G['click']('[data-testid=tl-tab-presets]')
        if not G['cnt']('[data-testid=preset-row]'): G['click']('[data-testid=preset-add]'); G['wait'](200)
        for k, v in {'rpm': 8000, 'feedCut': 1200, 'feedPlunge': 400, 'stepdown': 3, 'stepover': 3}.items(): G['fill']('[data-f=pr-0-%s]' % k, str(v))
        tool_ok(); N('takımlar=' + tools_json())
    S('c10-T4-duzelt', fix4)
    def more():
        for typ, name, num, dia, ex, pre in [('drill', 'Matkap Ø6', 5, 6, {'tl-flutes': 2, 'tl-fluteLen': 40, 'tl-bodyLen': 60}, {'rpm': 3000, 'feedCut': 300, 'feedPlunge': 300}),
                                              ('flat', 'Parmak freze Ø35 (büyük)', 7, 35, {'tl-flutes': 4, 'tl-fluteLen': 30, 'tl-bodyLen': 60}, {'rpm': 2000, 'feedCut': 800, 'feedPlunge': 300, 'stepdown': 2, 'stepover': 10})]:
            tool_new(typ); tool_fill(name, num, dia, extra=ex, preset=pre); tool_ok()
        N('takımlar=' + tools_json())
    S('c11-matkap-ve-buyuk-freze', more)
    S('c12-takim-listesi-kapat', lambda: (G['click']('#modal .btn.pri'), G['wait'](300)))

def wcs_msg(): return G['js']("() => { const e = document.querySelector('[data-testid=wcs-warn]'); return e && !e.hidden ? e.innerText : '(uyarı yok)'; }")
def ph_setup():
    def newsu():
        G['click']('[data-cmd=cam-setup]'); G['wait'](900)
        N('yeni setup paneli başlık=%s; varsayılan WCS=%s; uyarı=%s' % (T('[data-testid=panel-title]'), G['js']("document.querySelector('[data-f=su-wcs]').value"), wcs_msg()))
        N('özet: ' + T('[data-testid=setup-summary]').replace('\n', ' '))
    S('c13-yeni-setup', newsu)
    def wcs():
        for w in ['G54', 'G56', 'G55', 'G54.1']:
            pg().select_option('[data-f=su-wcs]', w); G['wait'](250); N('WCS %s: %s' % (w, wcs_msg().replace('\n', ' ')))
        pg().select_option('[data-f=su-wcs]', 'G56'); G['wait'](250)
    S('c14-wcs-korunan-G54-G56', wcs)
    def badstock():
        G['fill']('[data-f=su-st-top]', '-3'); G['wait'](300)
        N('negatif stok payı: ' + T('[data-row=su-st-top]').replace('\n', ' ') + ' | özet: ' + T('[data-testid=setup-summary]').replace('\n', ' ')[:140])
        G['click']('[data-testid=panel-ok]'); G['wait'](400); N('Tamam (hatalı alan) sonrası panel açık=%d; toast=%s' % (0 if G['js']("document.querySelector('#panel').classList.contains('hidden')") else 1, toasts()))
    S('c15-negatif-stok-payi', badstock)
    def okset():
        G['fill']('[data-f=su-st-top]', '2'); pg().select_option('[data-f=su-origin]', 'stockTopCenter'); G['wait'](400)
        N('özet: ' + T('[data-testid=setup-summary]').replace('\n', ' '))
    S('c16-setup-stok-wcs-G56-orijin', okset)
    def ok():
        G['click']('[data-testid=panel-ok]'); G['wait'](700)
        N('setup: ' + G['js']('JSON.stringify(app.doc.cam.setups[0])'))
    S('c17-setup-tamam', ok)

def opres(): return T('[data-testid=op-result]').replace('\n', ' / ')
def compute(label, timeout=90000):
    t0 = time.time(); G['click']('[data-testid=op-compute]')
    try: G['waitok'](timeout)
    except Exception: N('%s: hesap sonucu gelmedi (zaman aşımı %ds)' % (label, timeout // 1000)); return None
    r = opres(); N('%s: hesap %.1f sn -> %s' % (label, time.time() - t0, r[:260])); return r
def optab(n): G['click']('[data-testid=op-tab-%s]' % n); G['wait'](250)
def ofill(f, v): G['fill']('[data-f=%s]' % f, str(v)); G['wait'](120)
def ok_panel(): G['click']('[data-testid=panel-ok]'); G['wait'](700)
def op_state(): return G['js']("[...document.querySelectorAll('[data-testid=cam-op-row]')].map(e => e.innerText.replace(/\\s+/g,' ')).join(' || ')")
def ph_face():
    def open_():
        G['click']('[data-cmd=cam-op-face]'); G['wait'](700)
        N('Yüzey: başlık=%s; araç=%s; ön ayar=%s; rpm=%s; ilerleme=%s' % (T('[data-testid=panel-title]'), G['js']("(()=>{const s=document.querySelector('[data-f=op-tool]');return s.options[s.selectedIndex].text})()"), G['js']("document.querySelector('[data-f=op-preset]')?.value"), G['js']("document.querySelector('[data-f=op-rpm]')?.value"), G['js']("document.querySelector('[data-f=op-feedCut]')?.value")))
        N('panel metni: ' + T('#panel').replace('\n', ' / ')[:700])
    S('c18-yuzey-paneli-takim-T1', open_)
    def comp():
        optab('passes'); N('Yüzey paso alanları: ' + G['js']("[...document.querySelectorAll('#panel [data-f]')].map(e=>e.dataset.f+'='+e.value).join(' ')"))
        compute('Yüzey')
    S('c19-yuzey-hesapla', comp)
    S('c20-yuzey-tamam', lambda: (ok_panel(), N('işlem satırı: ' + op_state())))

def select_tool(num):
    G['click']('[data-testid=op-tab-tool]'); G['wait'](200)
    val = G['js']("(n) => { const s = document.querySelector('[data-f=op-tool]'); const o = [...s.options].find(o => o.text.startsWith('T' + n + ' ')); return o ? o.value : null; }", num)
    pg().select_option('[data-f=op-tool]', val); G['wait'](300)
def ph_contour():
    def open_():
        G['click']('[data-cmd=cam-op-contour]'); G['wait'](700); select_tool(4)
        N('Kontur: araç=%s rpm=%s' % (T('[data-testid=panel-title]'), G['js']("document.querySelector('[data-f=op-rpm]')?.value")))
        optab('geom'); N('geom sekmesi: ' + T('#panel').replace('\n', ' / ')[:420])
    S('c21-kontur-paneli', open_)
    def pick():
        pg().select_option('[data-f=op-pickmode]', 'silhouette'); G['wait'](400)
        G['mclick']([100, 30, 10]); G['wait'](700)
        N('kontur seçim satırları: ' + G['js']("[...document.querySelectorAll('[data-testid=op-geom-row]')].map(e=>e.innerText).join('|')") + ' | ipucu=' + T('#hint, .hint, [data-testid=hint]')[:120])
    S('c22-kontur-gövde-dis-siniri', pick)
    def comp_nostep():
        optab('passes'); N('kontur paso alanları: ' + G['js']("[...document.querySelectorAll('#panel [data-f]')].map(e=>e.dataset.f+'='+e.value).join(' ')"))
        compute('Kontur (stepdown boş)')
    S('c23-kontur-eksik-stepdown', comp_nostep)
    def comp():
        ofill('op-stepdown', 5); compute('Kontur')
    S('c24-kontur-hesapla', comp)
    S('c25-kontur-tamam', lambda: (ok_panel(), N('işlem satırları: ' + op_state())))

def panel_open(): return not G['js']("document.querySelector('#panel').classList.contains('hidden')")
def ph_pocket():
    def open_():
        G['click']('[data-cmd=cam-op-pocket]'); G['wait'](700); select_tool(4); optab('passes')
        N('Cep paso alanları (varsayılan): ' + G['js']("[...document.querySelectorAll('#panel [data-f]')].map(e=>e.dataset.f+'='+e.value).join(' ')"))
        G['click']('[data-testid=op-compute]'); G['wait'](600)
        N('Cep, giriş açısı boşken hesapla: alan mesajı=%s | sonuç=%s | toast=%s' % (T('[data-row=op-entry-angle]').replace('\n', ' '), opres()[:120], toasts()))
        optab('heights'); G['click']('[data-testid=op-compute]'); G['wait'](600)
        N('aynı, Yükseklikler sekmesinden: sonuç=%s | toast=%s' % (opres()[:160], toasts()))
    S('c26-cep-paneli-giris-acisi-bos', open_)
    def emptysel():
        optab('passes'); ofill('op-entry-angle', '5'); ofill('op-stepdown', '2'); optab('geom'); pg().select_option('[data-f=op-pickmode]', 'face'); G['wait'](300)
        compute('Cep (boş seçim)', 20000)
    S('c27-cep-bos-secim-hesapla', emptysel)
    def pick():
        G['mclick']([40, 30, 12]); G['wait'](800)
        N('cep seçim: ' + G['js']("[...document.querySelectorAll('[data-testid=op-geom-row]')].map(e=>e.innerText).join('|')"))
    S('c28-cep-taban-yuzu-sec', pick)
    def negstep():
        optab('passes'); ofill('op-stepdown', '-2'); N('negatif stepdown: ' + T('[data-row=op-stepdown]').replace('\n', ' '))
        G['click']('[data-testid=panel-ok]'); G['wait'](400); N('  Tamam sonrası panel açık=%d toast=%s' % (panel_open(), toasts()))
        G['click']('[data-testid=op-compute]'); G['wait'](500); N('  hesapla (hatalı alanla): sonuç=%s toast=%s' % (opres()[:100], toasts()))
    S('c29-cep-negatif-stepdown', negstep)
    def bigtool():
        ofill('op-stepdown', '2'); select_tool(7); optab('passes'); compute('Cep (Ø35 takım, 40x30 cep)', 30000)
    S('c30-cep-takim-cap-buyuk', bigtool)
    def good():
        select_tool(4); optab('passes'); compute('Cep (Ø8)')
    S('c31-cep-hesapla', good)
    def neg_depth():
        optab('heights'); N('yükseklik alanları: ' + G['js']("[...document.querySelectorAll('#panel [data-f]')].map(e=>e.dataset.f+'='+e.value).join(' ')"))
        pg().select_option('[data-f=op-bottom-from]', 'abs'); G['wait'](300); ofill('op-bottom-off', '30'); compute('Cep (taban Z=+30)', 30000)
        ofill('op-bottom-off', '12'); G['wait'](200); compute('Cep (taban Z=+12, WCS üst=0 olduğu için stok üstünde)', 30000)
        pg().select_option('[data-f=op-bottom-from]', 'selection'); G['wait'](300); ofill('op-bottom-off', '0'); compute('Cep (taban = seçim, geri alındı)', 30000)
    S('c32-cep-taban-yuksekligi-sinir', neg_depth)
    S('c33-cep-tamam', lambda: (ok_panel(), N('işlem satırları: ' + op_state())))

def ph_drill():
    def open_():
        G['click']('[data-cmd=cam-op-drill]'); G['wait'](700)
        N('Delik delme: başlık=%s; araç seçili=%s' % (T('[data-testid=panel-title]'), G['js']("(()=>{const s=document.querySelector('[data-f=op-tool]');return s.options[s.selectedIndex].text})()")))
        optab('geom'); N('delik sekmesi: ' + T('#panel').replace('\n', ' / ')[:500])
    S('c34-delik-paneli', open_)
    def comp():
        compute('Delme (tümü)')
        optab('heights'); N('delme yükseklik alanları: ' + G['js']("[...document.querySelectorAll('#panel [data-f]')].map(e=>e.dataset.f+'='+e.value).join(' ')"))
    S('c35-delik-hesapla', comp)
    S('c36-delik-tamam', lambda: (ok_panel(), N('işlem satırları: ' + op_state())))

def issues_dump(): return G['js']("[...document.querySelectorAll('#modal [data-testid=issue-row]')].map(e => '[' + e.dataset.level + '] ' + e.innerText.replace(/\\s+/g,' ')).join('\\n   ')")
def modal_open(): return G['cnt']('#modal:not(.hidden)')
def ph_run():
    def comp_all():
        G['click']('[data-cmd=cam-compute]'); G['wait'](2500)
        N('Yolu hesapla (tümü): toast=%s modal=%d; satırlar=%s; durum çubuğu=%s' % (toasts(), modal_open(), op_state(), T('#statusbar, .statusbar')[:200].replace('\n', ' ')))
    S('c37-yolu-hesapla-tumu', comp_all)
    def sim():
        G['click']('[data-cmd=cam-sim]')
        try: pg().wait_for_selector('[data-testid=sim-play], #modal:not(.hidden)', timeout=60000)
        except Exception: N('simülasyon 60 sn içinde başlamadı')
        G['wait'](800)
        if modal_open(): N('Simüle et -> modal: ' + T('#modal')[:300].replace('\n', ' ') + '\n   ' + issues_dump()); return
        N('simülasyon çubuğu: pos=%s vol=%s op=%s; sorun düğmesi=%s' % (T('[data-testid=sim-pos]'), T('[data-testid=sim-vol]'), T('[data-testid=sim-op]'), T('[data-testid=sim-issues]')))
    S('c38-simule-et-basladi', sim)
    def play():
        if not G['cnt']('[data-testid=sim-play]'): return
        N('hız seçenekleri: ' + G['js']("[...document.querySelector('[data-testid=sim-speed]').options].map(o => o.value + '/' + o.text).join(',')"))
        pg().select_option('[data-testid=sim-speed]', index=3)
        G['click']('[data-testid=sim-play]'); G['wait'](3000)
        N('oynatılıyor: pos=%s op=%s' % (T('[data-testid=sim-pos]'), T('[data-testid=sim-op]')))
    S('c39-simulasyon-oynat', play)
    def end():
        if not G['cnt']('[data-testid=sim-slider]'): return
        G['click']('[data-testid=sim-play]') if G['js']("document.querySelector('[data-testid=sim-play]').dataset.playing") == '1' else None
        G['pg'] = pg(); pg().focus('[data-testid=sim-slider]'); pg().keyboard.press('End'); G['wait'](1500)
        N('sona atla (klavye End): pos=%s vol=%s op=%s' % (T('[data-testid=sim-pos]'), T('[data-testid=sim-vol]'), T('[data-testid=sim-op]')))
    S('c40-simulasyon-son', end)
    def issues():
        if not G['cnt']('[data-testid=sim-issues]'): return
        G['click']('[data-testid=sim-issues]'); G['wait'](600); N('simülasyon sorun listesi:\n   ' + issues_dump() + '\n   başlık/giriş: ' + T('#modal')[:260].replace('\n', ' '))
    S('c41-simulasyon-sorunlari', issues)
    def close_issues():
        if modal_open(): G['click']('[data-testid=issues-close]'); G['wait'](300)
        if G['cnt']('[data-testid=sim-stop]'): G['click']('[data-testid=sim-stop]'); G['wait'](500)
    S('c42-simulasyon-dur', close_issues)
    def post_tmpl():
        G['click']('[data-cmd=cam-post]'); G['wait'](4000)
        N('Post işle (şablon tezgâh): modal=%d\n   %s\n   giriş: %s' % (modal_open(), issues_dump(), T('#modal')[:260].replace('\n', ' ')))
    S('c43-post-sablon-tezgah-eksik-veri', post_tmpl)
    def pick_row():
        if not G['cnt']('[data-testid=issue-row]'): return
        G['click']('[data-testid=issue-row] >> nth=0'); G['wait'](700); N('satıra tıklayınca: modal=%d panel=%s' % (modal_open(), T('[data-testid=panel-title]')))
        if panel_open(): G['click']('[data-testid=panel-cancel]'); G['wait'](400)
    S('c44-sorun-satirina-tikla', pick_row)

def need_fields(): return G['js']("[...document.querySelectorAll('.mc-ed .fld.need')].map(e=>e.dataset.row)")
def ph_machine2():
    def copy():
        G['click']('[data-cmd=cam-machine]'); G['wait'](500); G['click']('#modal [data-testid=mc-copy] >> nth=0'); G['wait'](400)
        N('kopyala -> ad sorusu: ' + T('#modal')[:120].replace('\n', ' '))
        G['fill']('[data-testid=prompt-input]', 'Atölye Neway (kopya)'); G['click']('#modal .btn.pri'); G['wait'](500)
        N('düzenleyici açık=%d; ad=%s' % (G['cnt']('[data-testid=machine-editor]'), pg().input_value('[data-f=mc-name]')))
    S('c45-tezgah-kopyala', copy)
    def spindle():
        G['click']('[data-testid=mc-tab-spindle]'); G['wait'](300)
        N('mil sekmesi eksik alanlar: %s' % need_fields())
    S('c46-tezgah-mil-sekmesi-bos', spindle)
    def badin():
        G['fill']('[data-f=sp-max]', 'abc'); G['fill']('[data-f=fd-max]', '-5'); G['wait'](300)
        N('hatalı giriş mesajları: sp-max=%s | fd-max=%s' % (T('[data-row=sp-max]').replace('\n', ' '), T('[data-row=fd-max]').replace('\n', ' ')))
        G['click']('[data-testid=mc-ok]'); G['wait'](500)
        N('hatalı alanla Tamam: editör açık=%d; kutu=%s; toast=%s' % (G['cnt']('[data-testid=machine-editor]'), T('.mc-err')[:160].replace('\n', ' '), toasts()))
    S('c47-tezgah-hatali-sayi', badin)
    def reopen():
        if not G['cnt']('[data-testid=machine-editor]'):
            n = G['cnt']('#modal [data-testid=mc-row]'); N('editör kapandı; yönetici satırları=%d, kayıtlı maxRpm=%s' % (n, G['js']("JSON.stringify((JSON.parse(localStorage.getItem('mihenk.machines')||'[]')[0]||{}).spindle)")))
            G['click']('#modal [data-testid=mc-row] >> nth=%d >> [data-testid=mc-edit]' % (n - 1)); G['wait'](500)
        G['click']('[data-testid=mc-tab-spindle]'); G['wait'](300)
    S('c47b-tezgah-yeniden-ac', reopen)
    def goodin():
        G['fill']('[data-f=sp-max]', '10000'); G['fill']('[data-f=fd-max]', '5000'); G['wait'](300)
        N('mil/ilerleme dolduruldu; kalan eksik: %s' % need_fields())
    S('c48-tezgah-mil-ilerleme-dolu', goodin)
    def prot():
        G['click']('[data-testid=mc-tab-protected]'); G['wait'](300)
        N('dokunulmaz sekmesi: T=%s H=%s D=%s; WCS işaretli=%s; metin=%s' % (pg().input_value('[data-f=prot-T]'), pg().input_value('[data-f=prot-H]'), pg().input_value('[data-f=prot-D]'), G['js']("[...document.querySelectorAll('.mc-ed .wcs-grid input[type=checkbox]:checked')].map(e=>e.dataset.f).join(',')"), T('.mc-ed')[:300].replace('\n', ' ')))
    S('c49-tezgah-dokunulmaz-sekmesi', prot)
    def post():
        G['click']('[data-testid=mc-tab-post]'); G['wait'](300); N('post sekmesi eksik alanlar: %s' % need_fields())
    S('c50-tezgah-post-sekmesi', post)
    def save():
        G['click']('[data-testid=mc-ok]'); G['wait'](600)
        N('Tamam (post alanları boş): editör açık=%d; kutu=%s' % (G['cnt']('[data-testid=machine-editor]'), T('.mc-err')[:200].replace('\n', ' ')))
        N('yönetici satırları: ' + G['js']("[...document.querySelectorAll('#modal [data-testid=mc-row]')].map(e => e.innerText.replace(/\\s+/g,' ')).join(' || ')"))
    S('c51-tezgah-kaydet-post-bos', save)
    def use():
        n = G['cnt']('#modal [data-testid=mc-row]'); G['click']('#modal [data-testid=mc-row] >> nth=%d >> [data-testid=mc-use]' % (n - 1)); G['wait'](400)
        N('seçili tezgâh: ' + G['js']('app.cam.machine() && app.cam.machine().name'))
        G['click']('#modal .btn.pri'); G['wait'](300)
    S('c52-tezgah-sec', use)

def post_try(label, wait_ms=5000):
    G['click']('[data-cmd=cam-post]'); G['wait'](wait_ms)
    N('%s: modal=%d başlık=%s\n   %s\n   giriş: %s' % (label, modal_open(), T('#modal .modal-title, #modal h2, #modal [data-testid=modal-title]')[:60], issues_dump(), T('#modal')[:300].replace('\n', ' ')))
def ph_fixprot():
    S('c53-post-korunan-numaralarla', lambda: post_try('Post (dolu mil/ilerleme, korunan T1/H3/WCS G56 duruyor)'))
    def closeit():
        if G['cnt']('[data-testid=issues-close]'): G['click']('[data-testid=issues-close]'); G['wait'](400)
    S('c54-sorun-listesi-kapat', closeit)
    def fixtool():
        G['click']('[data-cmd=cam-tools]'); G['wait'](500)
        G['click']('[data-testid=tool-row][data-num="1"] [data-testid=tl-edit]'); G['wait'](400)
        G['fill']('[data-f=tl-number]', '2'); G['fill']('[data-f=tl-lengthOffset]', '2'); G['fill']('[data-f=tl-diaOffset]', '2'); G['wait'](300)
        N('T2/H2/D2 uyarı kutusu: [%s]' % T('.mc-err')); tool_ok()
        N('takımlar=' + tools_json()); G['click']('#modal .btn.pri'); G['wait'](400)
    S('c55-takim-T1-yerine-T2', fixtool)
    def fixwcs():
        pg().dblclick('[data-testid=cam-setup-row]'); G['wait'](700)
        pg().select_option('[data-f=su-wcs]', 'G55'); G['wait'](300); N('WCS G55 uyarı=' + wcs_msg())
        ok_panel(); N('setup WCS=' + G['js']('app.doc.cam.setups[0].workOffset.kind'))
    S('c56-setup-WCS-G55', fixwcs)
    S('c57-post-post-ozellikleri-bos', lambda: post_try('Post (korunanlar giderildi, post özellikleri boş)', 6000))

def ph_nc():
    S('c58-post-hatasi-kapat', lambda: (G['click']('[data-testid=issues-close]') if G['cnt']('[data-testid=issues-close]') else None, G['wait'](300)))
    def fillpost():
        G['click']('[data-cmd=cam-machine]'); G['wait'](500)
        n = G['cnt']('#modal [data-testid=mc-row]'); G['click']('#modal [data-testid=mc-row] >> nth=%d >> [data-testid=mc-edit]' % (n - 1)); G['wait'](500)
        G['click']('[data-testid=mc-tab-post]'); G['wait'](300)
        N('post sekmesi açıklamaları: ' + T('.mc-ed')[:600].replace('\n', ' / '))
        # DENEME DEĞERLERİ: gerçek tezgâh verisi değil, yalnız arayüz akışını sınamak için
        sel = {'pp-safeRetract': 'G53', 'pp-dwellAddress': 'P', 'pp-dwellUnit': 'ms', 'pp-cycleDwellAddress': 'P', 'pp-cycleDwellUnit': 'ms'}
        for k, v in sel.items():
            try: pg().select_option('[data-f=%s]' % k, v, timeout=4000)
            except Exception as e: N('seçenek yok: %s=%s (%s)' % (k, v, G['js']("(k) => [...document.querySelector('[data-f='+k+']').options].map(o => o.value).join('|')", k)))
        for k, v in {'pp-safeRetractZ': '0', 'pp-cool-mist': 'M7', 'pp-cool-air': 'M51', 'pp-cool-through': 'M88', 'pp-rigidTapM': 'M29', 'pp-highSpeedOn': 'G5.1 Q1', 'pp-highSpeedOff': 'G5.1 Q0', 'pp-g541Range-min': '1', 'pp-g541Range-max': '48'}.items():
            try: G['fill']('[data-f=%s]' % k, v)
            except Exception as e: N('alan yok: ' + k)
        N('post alanları dolduruldu; kalan eksik: %s' % need_fields())
    S('c59-tezgah-post-alanlarini-doldur', fillpost)
    def savem():
        G['click']('[data-testid=mc-ok]'); G['wait'](600)
        N('Tamam: editör açık=%d; kutu=%s; yönetici: %s' % (G['cnt']('[data-testid=machine-editor]'), T('.mc-err')[:200], G['js']("[...document.querySelectorAll('#modal [data-testid=mc-row]')].map(e => e.innerText.replace(/\\s+/g,' ')).join(' || ')")))
        G['click']('#modal .btn.pri'); G['wait'](300)
    S('c60-tezgah-kaydet', savem)
    def post_ok():
        G['click']('[data-cmd=cam-post]')
        try: pg().wait_for_selector('[data-testid=nc-text], [data-testid=issue-list]', timeout=60000)
        except Exception: N('post 60 sn içinde sonuç vermedi')
        G['wait'](1200)
        if G['cnt']('[data-testid=issue-list]'): N('post yine engelli:\n   ' + issues_dump()); return
        lines = G['js']("[...document.querySelectorAll('[data-testid=nc-text] .nc-line .tx')].map(e => e.innerText)")
        N('NC satır sayısı=%d' % len(lines)); N('NC ilk 30 satır:\n   ' + '\n   '.join(lines[:30]))
        N('NC bilgi kutuları: ' + T('.nc-info').replace('\n', ' / '))
        G['NCLINES'] = lines
        N('NC tüm GATE/UNVERIFIED satırları: ' + ' || '.join(l for l in lines if re.search(r'GATE|UNVERIF|DOGRULANMADI|WARN', l)))
        N('NC içinde ham anahtar: ' + str([l for l in lines if re.search(r'\bcam\.[a-z_]+\.[a-z_]+', l)][:5]))
    S('c61-nc-onizleme', post_ok)
    def ncnav():
        if not G['cnt']('[data-testid=nc-text]'): return
        pg().focus('[data-testid=nc-text]'); 
        for _ in range(12): pg().keyboard.press('ArrowDown')
        G['wait'](400); N('NC satırı klavye seçimi: sel=%s | odak=%s' % (G['js']("document.querySelector('.nc-line.sel')?.innerText.replace(/\\s+/g,' ')"), G['js']("document.activeElement.className + '/' + (document.activeElement.dataset.testid||'')")))
        G['mclick']([0, 0, 0]) if False else None
    S('c62-nc-satir-klavye', ncnav)
    def progno():
        if not G['cnt']('[data-testid=nc-progno]'): return
        G['fill']('[data-testid=nc-progno]', '0'); G['click']('[data-testid=nc-regen]'); G['wait'](400); N('program no 0: toast=%s' % toasts())
        G['fill']('[data-testid=nc-progno]', '1234'); G['click']('[data-testid=nc-regen]'); G['wait'](600)
        N('program no 1234 sonrası ilk satırlar: ' + ' | '.join(G['js']("[...document.querySelectorAll('[data-testid=nc-text] .nc-line .tx')].slice(0,4).map(e => e.innerText)")))
    S('c63-nc-program-no', progno)
    def save():
        if not G['cnt']('[data-testid=nc-save]'): return
        with pg().expect_download(timeout=15000) as dl: G['click']('[data-testid=nc-save]')
        p = dl.value.path(); name = dl.value.suggested_filename; txt_ = open(p, encoding='utf-8', errors='replace').read()
        os.makedirs('/tmp/nc-out', exist_ok=True); G['NCFILE'] = '/tmp/nc-out/%s-%s' % (G['PFX'], name); open(G['NCFILE'], 'w').write(txt_)
        N('NC kaydı: dosya=%s boyut=%d bayt, satır=%d; ilk satırlar: %s' % (name, len(txt_), txt_.count('\n'), ' | '.join(txt_.splitlines()[:3])))
        N('kayıtlı dosyada DOGRULANMADI: %s; toast=%s' % ('DOGRULANMADI' in txt_, toasts()))
    S('c64-nc-kaydet', save)

def st_post(): return T('[data-testid=st-post]').replace('\n', ' ')
def ph_verify():
    def close_nc():
        G['click']('#modal [data-testid=nc-close], #modal .btn.pri >> nth=0') if False else None
        pg().keyboard.press('Escape'); G['wait'](400); N('NC penceresi Esc ile kapandı mı: modal=%d; durum çubuğu: %s' % (modal_open(), st_post()))
    S('c65-nc-kapat-esc', close_nc)
    def vopen():
        G['click']('[data-testid=st-post]'); G['wait'](500); N('doğrulama penceresi: ' + T('#modal')[:500].replace('\n', ' / '))
    S('c66-dogrulama-penceresi', vopen)
    def vbad():
        G['click']('[data-testid=vf-ok]'); G['wait'](300); N('boş beyan: modal=%d; mesaj=%s' % (modal_open(), T('#modal .fieldmsg')))
        G['fill']('[data-testid=vf-by]', 'Test Usta'); G['click']('[data-testid=vf-ok]'); G['wait'](300); N('yalnız ad: mesaj=%s' % T('#modal .fieldmsg'))
        G['fill']('[data-testid=vf-note]', 'Kuru çalıştırma yapıldı (deneme)'); G['click']('[data-testid=vf-ok]'); G['wait'](300); N('ad+not, onay yok: mesaj=%s' % T('#modal .fieldmsg'))
    S('c67-dogrulama-eksik-beyan', vbad)
    def vok():
        pg().check('[data-testid=vf-confirm]') if G['cnt']('[data-testid=vf-confirm]') else None
        G['click']('[data-testid=vf-ok]'); G['wait'](600)
        N('beyan sonrası: modal=%d; durum çubuğu=%s; toast=%s; doc.cam.verified=%s' % (modal_open(), st_post(), toasts(), G['js']('JSON.stringify(app.doc.cam.verified)')))
    S('c68-dogrulama-onayla', vok)
    def nc2():
        G['click']('[data-cmd=cam-nc]'); G['wait'](1200)
        lines = G['js']("[...document.querySelectorAll('[data-testid=nc-text] .nc-line .tx')].map(e => e.innerText)")
        N('doğrulanmış NC başlığı: ' + ' | '.join(lines[:6])); N('NC bilgi: ' + T('.nc-info').replace('\n', ' / ')[:400])
    S('c69-nc-dogrulanmis', nc2)
    def lapse():
        pg().keyboard.press('Escape'); G['wait'](300)
        # belgeyi değiştir: setup stok üst payı
        pg().dblclick('[data-testid=cam-setup-row]'); G['wait'](600); G['fill']('[data-f=su-st-top]', '3'); ok_panel()
        N('belge değişti: durum çubuğu=%s; verified kaydı=%s' % (st_post(), G['js']('app.doc.cam.verified && app.doc.cam.verified.by')))
        G['click']('[data-cmd=cam-nc]'); G['wait'](800); N('NC düğmesi (eski çıktı): modal=%d; metin=%s' % (modal_open(), T('#modal')[:300].replace('\n', ' / ') or toasts()))
        pg().keyboard.press('Escape'); G['wait'](300)
    S('c70-belge-degisince-beyan-duser', lapse)
    def undo():
        pg().keyboard.press('Control+z'); G['wait'](700)
        N('Ctrl+Z sonrası: stok üst payı=%s; durum çubuğu=%s' % (G['js']('app.doc.cam.setups[0].stock.top'), st_post()))
    S('c71-geri-al-beyan-geri-gelir', undo)
    def undo2():
        # Geri al / yinele zinciri: takım ve işlem
        n0 = G['js']('app.doc.cam.setups[0].ops.length')
        pg().dblclick('[data-testid=cam-op-row] >> nth=3'); G['wait'](600); N('Delme paneli: ' + T('[data-testid=panel-title]'))
        pg().keyboard.press('Escape'); G['wait'](400); N('Esc paneli kapattı: panel açık=%d; işlem sayısı=%d' % (panel_open(), G['js']('app.doc.cam.setups[0].ops.length')))
        G['click']('[data-cmd=cam-op-pocket]'); G['wait'](500); N('yeni Cep işlemi açıldı; işlem sayısı=%d' % G['js']('app.doc.cam.setups[0].ops.length'))
        pg().keyboard.press('Escape'); G['wait'](400); N('yeni işlemde Esc (iptal): işlem sayısı=%d (beklenen %d)' % (G['js']('app.doc.cam.setups[0].ops.length'), n0))
    S('c72-iptal-esc', undo2)

def ph_persist():
    S('c73-oncesi-belge-durumu', lambda: (G.__setitem__('CAM0', G['js']('JSON.stringify(app.doc.cam)')), G.__setitem__('FEAT0', G['js']('JSON.stringify(app.doc.features)')), N('kayıt öncesi: cam %d bayt; verified=%s; işlem=%s' % (len(G['CAM0']), G['js']('app.doc.cam.verified && app.doc.cam.verified.by'), op_state()))), shots=False)
    def save():
        pg().mouse.click(700, 120); pg().keyboard.press('Escape')
        with pg().expect_download(timeout=20000) as dl: pg().keyboard.press('Control+s')
        name = dl.value.suggested_filename; p = '/tmp/nc-out/%s-%s' % (G['PFX'], name); dl.value.save_as(p); G['MHNK'] = p
        N('Ctrl+S: indirilen=%s %d bayt; toast=%s; başlık=%s' % (name, os.path.getsize(p), toasts(), T('[data-testid=doc-title], #doc-title, .doc-title')))
    S('c74-ctrl-s-kaydet', save)
    def reopen():
        G['pg'] = pg(); pg().reload(); pg().wait_for_function('() => window.app'); pg().evaluate('app.ready'); G['wait'](1500)
        N('yeniden yüklenince: gövde=%s cam=%s mod=%s' % (G['js']('app.result.bodies.length'), G['js']('JSON.stringify(app.doc.cam)'), G['js']('app.mode')))
        pg().keyboard.press('Control+o')
        with pg().expect_file_chooser(timeout=8000) as fc: pass
    try: S('c75-yeniden-yukle', lambda: (pg().reload(), pg().wait_for_function('() => window.app'), pg().evaluate('app.ready'), G['wait'](1500)))
    except Exception as e: N('reload hata ' + str(e)[:100])
    def openit():
        with pg().expect_file_chooser(timeout=10000) as fc: pg().keyboard.press('Control+o')
        fc.value.set_files(G['MHNK']); G['wait'](3000)
        same_cam = G['js']('JSON.stringify(app.doc.cam)') == G['CAM0']; same_f = G['js']('JSON.stringify(app.doc.features)') == G['FEAT0']
        N('Ctrl+O ile açıldı: gövde=%s; mod=%s; cam birebir aynı=%s; özellikler aynı=%s; verified=%s; durum çubuğu=%s' % (G['js']('app.result.bodies.length'), G['js']('app.mode'), same_cam, same_f, G['js']('app.doc.cam && app.doc.cam.verified && app.doc.cam.verified.by'), st_post()))
        if not same_cam: N('  CAM FARKI: önce=%s\n  sonra=%s' % (G['CAM0'][:600], G['js']('JSON.stringify(app.doc.cam)')[:600]))
    S('c76-mhnk-ac', openit)
    def tab():
        if G['js']('app.mode') != 'cam': G['click']('[data-testid=tab-manufacture]'); G['wait'](900)
        N('İmalat sekmesi: tezgâh seçili=%s; satırlar=%s; takımlar=%s' % (T('[data-testid=cam-machine-row].sel')[:50], op_state(), tools_json()))
    S('c77-acilis-sonrasi-imalat', tab)
    def recompute():
        G['click']('[data-cmd=cam-post]')
        try: pg().wait_for_selector('[data-testid=nc-text], [data-testid=issue-list]', timeout=60000)
        except Exception: N('post sonuç vermedi')
        G['wait'](1000)
        if G['cnt']('[data-testid=nc-text]'):
            lines = G['js']("[...document.querySelectorAll('[data-testid=nc-text] .nc-line .tx')].map(e => e.innerText)")
            old = open(G['NCFILE']).read().splitlines()
            strip = lambda L: [l for l in L if not l.startswith('(PROGRAM') and not l.startswith('(DATE') and not l.startswith('O') and not l.startswith('(VERIFIED')]
            D = [(i, a, b) for i,(a,b) in enumerate(zip(strip(lines), strip(old))) if a!=b][:4]
            N('açılış sonrası NC farkları (yeni|eski): ' + ' || '.join('%d: %s | %s' % x for x in D))
            N('açılış sonrası NC: %d satır (önceki %d); önceki ile (başlık hariç) aynı=%s; bilgi=%s' % (len(lines), len(old), strip(lines)[:]==strip(old)[:] or [i for i,(a,b) in enumerate(zip(strip(lines), strip(old))) if a!=b][:3], T('.nc-info').replace('\n', ' / ')[:200]))
        else: N('post engelli: ' + issues_dump())
    S('c78-acilis-sonrasi-post', recompute)

def focus_desc(): return G['js']("() => { const e = document.activeElement; if (!e || e === document.body) return 'body'; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return (e.dataset.testid || e.dataset.cmd || e.dataset.f || e.id || e.tagName + '.' + e.className).toString().slice(0, 40) + ' | ' + (e.getAttribute('aria-label') || e.innerText || e.value || '').toString().replace(/\\s+/g, ' ').slice(0, 30) + ' | outline=' + cs.outlineStyle + ' ' + cs.outlineWidth + ' shadow=' + (cs.boxShadow !== 'none' ? 'var' : 'none') + ' | modal=' + !!e.closest('#modal') + ' panel=' + !!e.closest('#panel') + ' | ' + Math.round(r.width) + 'x' + Math.round(r.height); }")
def ph_kbd():
    def tools_kbd():
        if G['js']('app.mode') != 'cam': G['click']('[data-testid=tab-manufacture]'); G['wait'](800)
        G['pg'] = pg(); pg().focus('[data-cmd=cam-tools]'); N('odak (araç düğmesi): ' + focus_desc())
        pg().keyboard.press('Enter'); G['wait'](600); N('Enter sonrası modal=%d; odak: %s' % (modal_open(), focus_desc()))
        seq = []
        for i in range(14): pg().keyboard.press('Tab'); seq.append(focus_desc())
        N('Tab dizisi (modal içinde):\n   ' + '\n   '.join(seq))
        inmod = sum(1 for x in seq if 'modal=true' in x); N('Tab 14 basış: %d tanesi modal içinde (odak tuzağı)' % inmod)
        noring = [x for x in seq if 'outline=none' in x and 'shadow=none' in x]; N('odak halkası görünmeyen (outline none + gölge yok): %d: %s' % (len(noring), noring[:3]))
        pg().keyboard.press('Shift+Tab'); pg().keyboard.press('Escape'); G['wait'](500); N('Esc sonrası modal=%d; odak geri: %s' % (modal_open(), focus_desc()))
    S('c79-klavye-takim-yoneticisi', tools_kbd)
    def ribbon_kbd():
        pg().focus('[data-cmd=cam-setup]'); seq = [focus_desc()]
        for i in range(12): pg().keyboard.press('Tab'); seq.append(focus_desc())
        N('şerit Tab dizisi:\n   ' + '\n   '.join(seq))
    S('c80-klavye-serit', ribbon_kbd)
    def tree_kbd():
        pg().focus('[data-testid=cam-op-row] >> nth=2'); N('işlem satırı odak: ' + focus_desc())
        pg().keyboard.press('Enter'); G['wait'](700); N('Enter sonrası panel=%s; seçili=%s; odak: %s' % (T('[data-testid=panel-title]'), G['js']("document.querySelector('[data-testid=cam-op-row].sel')?.innerText.replace(/\\s+/g,' ')"), focus_desc()))
        pg().focus('[data-testid=cam-op-row] >> nth=2'); pg().keyboard.press('Shift+F10'); G['wait'](400)
        N('Shift+F10 bağlam menüsü: ' + G['js']("[...document.querySelectorAll('body > .ctx *, .ctx button, .ctxmenu button, #ctx button, [data-ctx] button')].map(e=>e.innerText.trim()).filter(Boolean).join('|')"))
        pg().keyboard.press('Escape'); pg().focus('[data-testid=cam-op-row] >> nth=2'); pg().keyboard.press('F2'); G['wait'](400); N('F2: modal=%d prompt=%d' % (modal_open(), G['cnt']('[data-testid=prompt-input]'))); pg().keyboard.press('Escape'); G['wait'](300)
        seq = []
        for i in range(8): pg().keyboard.press('Tab'); seq.append(focus_desc())
        N('panelde Tab:\n   ' + '\n   '.join(seq))
        pg().keyboard.press('Escape'); G['wait'](400); N('Esc sonrası panel açık=%d; odak: %s' % (panel_open(), focus_desc()))
    S('c81-klavye-agac-panel', tree_kbd)
    def panel_enter():
        pg().dblclick('[data-testid=cam-op-row] >> nth=0'); G['wait'](600)
        pg().focus('[data-f=op-rpm]') if G['cnt']('[data-f=op-rpm]') else None
        G['fill']('[data-f=op-rpm]', '2500'); pg().keyboard.press('Enter'); G['wait'](600)
        N('rpm alanında Enter: panel açık=%d; rpm=%s' % (panel_open(), G['js']('app.doc.cam.setups[0].ops[0].rpm')))
        pg().keyboard.press('Control+z'); G['wait'](500); N('Ctrl+Z: rpm=%s' % G['js']('app.doc.cam.setups[0].ops[0].rpm'))
    S('c82-klavye-enter-onay-geri-al', panel_enter)
    def delundo():
        n0 = G['js']('app.doc.cam.setups[0].ops.length')
        pg().focus('[data-testid=cam-op-row] >> nth=3'); pg().keyboard.press('Delete'); G['wait'](600)
        N('Delete: modal=%d (%s); işlem sayısı %d -> %d' % (modal_open(), T('#modal')[:150].replace('\n', ' / '), n0, G['js']('app.doc.cam.setups[0].ops.length')))
        if modal_open(): pg().keyboard.press('Enter'); G['wait'](600); N('  Enter (varsayılan odak) sonrası işlem sayısı=%d' % G['js']('app.doc.cam.setups[0].ops.length'))
        pg().keyboard.press('Control+z'); G['wait'](600); N('Ctrl+Z sonrası işlem sayısı=%d' % G['js']('app.doc.cam.setups[0].ops.length'))
    S('c83a-sil-ve-geri-al', delundo)
    def nomachine():
        G['pg'] = pg(); pg().evaluate("localStorage.removeItem('mihenk.machines')"); pg().reload(); pg().wait_for_function('() => window.app'); pg().evaluate('app.ready'); G['wait'](1000)
        with pg().expect_file_chooser(timeout=10000) as fc: pg().keyboard.press('Control+o')
        fc.value.set_files(G['MHNK']); G['wait'](2500)
        G['click']('[data-testid=tab-manufacture]'); G['wait'](900)
        N('tezgâh profili silinmiş makinede açılış: browser makine satırları=%s; eksik satırı=%d; header=%s' % (G['js']("[...document.querySelectorAll('[data-testid=cam-machine-row]')].map(e=>e.innerText.replace(/\\s+/g,' ')+(e.classList.contains('sel')?'*':'')).join('|')"), G['cnt']('[data-testid=cam-machine-missing]'), T('[data-testid=cam-machine-missing]')))
        G['click']('[data-cmd=cam-post]'); G['wait'](4000); N('bu durumda Post işle: modal=%d toast=%s; %s' % (modal_open(), toasts(), issues_dump() or T('#modal')[:300]))
    S('c84-tezgah-profili-yok-acilis', nomachine)

PHASES = [ph_tab, ph_machine, ph_tools, ph_setup, ph_face, ph_contour, ph_pocket, ph_drill, ph_run, ph_machine2, ph_fixprot, ph_nc, ph_verify, ph_persist, ph_kbd]