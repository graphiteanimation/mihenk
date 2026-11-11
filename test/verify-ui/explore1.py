from lib import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br, welcome=True)
    shot(pg, 'x-welcome')
    print(pg.evaluate("[...document.querySelectorAll('[data-testid]')].map(e=>e.dataset.testid).join(' ')"))
    pg.click('[data-testid=w-new]')
    print(pg.evaluate("[...document.querySelectorAll('#toolbar [data-cmd]')].map(e=>e.dataset.cmd).join(' ')"))
    shot(pg, 'x-new')
    print(pg.errs)
