from build import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    build_part(pg, 'x', log=lambda *a: None)
    pg.click('[data-testid=tab-manufacture]'); time.sleep(1); shot(pg,'x-cam1')
    print(pg.evaluate("[...document.querySelectorAll('#toolbar [data-cmd]')].map(e=>e.dataset.cmd+(e.getAttribute('aria-disabled')?'(dis)':'')).join(' ')"))
    pg.click('[data-cmd=cam-machine]'); time.sleep(.5); shot(pg,'x-cam2')
