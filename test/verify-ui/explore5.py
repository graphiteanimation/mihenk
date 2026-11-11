from lib import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    pg.click('[data-testid=dd-prim]'); pg.click('[data-cmd=box]')
    pg.fill('#panel [data-k=w]','100'); pg.fill('#panel [data-k=d]','60'); pg.fill('#panel [data-k=h]','20')
    pg.click('[data-testid=panel-ok]'); time.sleep(1)
    pg.click('#toolbar [data-cmd=sketch]'); time.sleep(.3)
    pg.mouse.click(850,470); time.sleep(1.5)
    pg.click('#toolbar [data-cmd=rect]')
    pg.mouse.click(602,564); pg.mouse.move(700,500); pg.mouse.click(778,432); time.sleep(.5); shot(pg,'x-rect')
    print(pg.evaluate("JSON.stringify(app.sketcher.sk.points)"))
    pg.click('#toolbar [data-cmd=dd-draw]'); time.sleep(.3); shot(pg,'x-dd-draw')
    print(pg.evaluate("[...document.querySelectorAll('.dd-menu [data-cmd], .menu [data-cmd], [role=menu] [data-cmd]')].map(e=>e.dataset.cmd).join(' ')"))
