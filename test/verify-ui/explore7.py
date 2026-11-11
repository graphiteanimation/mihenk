from build import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    build_part(pg, 'x', log=lambda *a: None)
    time.sleep(1); pg.click('[data-cmd=view-top]'); time.sleep(1); shot(pg,'x-top')
    print(pg.evaluate("JSON.stringify(app.result.holes)"))
    print(pg.evaluate("JSON.stringify(app.doc.features.filter(f=>f.type=='hole'))"))
    print(pg.evaluate("JSON.stringify(app.doc.features.filter(f=>f.type=='sketch').map(f=>[f.id,f.plane]))"))
    print(pg.evaluate("JSON.stringify(Object.entries(app.result.sketches).map(([k,v])=>[k,v.plane]))"))
