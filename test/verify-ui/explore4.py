from lib import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    pg.click('[data-testid=dd-prim]'); pg.click('[data-cmd=box]')
    pg.fill('#panel [data-k=w]','100'); pg.fill('#panel [data-k=d]','60'); pg.fill('#panel [data-k=h]','20')
    pg.click('[data-testid=panel-ok]'); time.sleep(1)
    pg.click('#toolbar [data-cmd=sketch]'); time.sleep(.3)
    pg.mouse.move(850,470); time.sleep(.3); shot(pg,'x-hover'); pg.mouse.click(850,470); time.sleep(1.5); shot(pg,'x-sk2')
    print(pg.evaluate("app.tool"), pg.evaluate("JSON.stringify(app.sketchSession && app.sketchSession.plane)"))
    print(pg.evaluate("[...document.querySelectorAll('[data-tool],[data-cmd],[data-act]')].filter(e=>e.offsetParent).map(e=>(e.dataset.tool||e.dataset.cmd||e.dataset.act)).join(' ')"))
