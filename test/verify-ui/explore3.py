from lib import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    pg.click('[data-testid=dd-prim]'); pg.click('[data-cmd=box]')
    pg.fill('#panel [data-k=w]','100'); pg.fill('#panel [data-k=d]','60'); pg.fill('#panel [data-k=h]','20')
    pg.click('[data-testid=panel-ok]'); time.sleep(1)
    pg.click('[data-cmd=fit]') if pg.locator('[data-cmd=fit]').count() else None
    time.sleep(.5); shot(pg,'x-block')
    print(pg.evaluate("Object.keys(app).join(' ')"))
    print(pg.evaluate("Object.keys(app.viewport).join(' ')"))
    print(pg.evaluate("Object.keys(app.sketcher||{}).join(' ')"))
    pg.click('#toolbar [data-cmd=sketch]'); time.sleep(.5); shot(pg,'x-sk1')
    print(pg.evaluate("app.tool"), pg.evaluate("document.querySelector('#hint, [data-testid=st-left]')?.innerText"))
