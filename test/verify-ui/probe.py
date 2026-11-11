import sys; sys.argv = ['x', 'tr', 'light']
exec(open('e2e.py').read().split("def run():")[0])
exec("def run():\n    build_part()\n" )
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx = br.new_context(viewport={'width': 1440, 'height': 900}, locale='tr-TR', accept_downloads=True)
    ctx.add_init_script("if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i','1'); localStorage.setItem('atolye.lang','tr'); localStorage.setItem('atolye.recoveryMs','0'); localStorage.setItem('mihenk.welcome','off'); }")
    pg = ctx.new_page(); C.pg = pg; C.errs = []
    pg.goto(URL); pg.wait_for_function('() => window.app'); pg.evaluate('app.ready')
    build_part()
    print(js('JSON.stringify(app.doc.features)')[:1500])
    print(js('JSON.stringify(app.result.bodies.map(b => ({id: b.id, vol: b.volume, nf: b.nFaces})))'))
    click('#toolbar [data-cmd=extrude]') if False else None
    br.close()
