from flow import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    pg.click('[data-testid=tab-manufacture]'); time.sleep(.6)
    pg.click('[data-cmd=cam-tools]'); time.sleep(.3)
    pg.click('[data-testid=tl-new]'); pg.select_option('[data-f=tl-type]','tap'); pg.click('[data-testid=tl-tab-geom]'); time.sleep(.3); shot(pg,'x-tap-geom')
    print(pg.evaluate("[...document.querySelectorAll('#modal [data-f]')].map(e=>e.dataset.f+'='+e.value).join(' ')"))
    pg.click('[data-testid=tl-tab-general]'); print(pg.evaluate("[...document.querySelectorAll('#modal [data-f]')].map(e=>e.dataset.f+'='+e.value).join(' ')"))
