from build import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    build_part(pg, 'x', log=lambda *a: None)
    pg.click('[data-testid=tab-manufacture]'); time.sleep(.6)
    pg.click('[data-cmd=cam-machine]'); time.sleep(.5); shot(pg,'x-m1')
    pg.click('#modal [data-testid=mc-copy] >> nth=0'); pg.fill('[data-testid=prompt-input]', 'Atölye Neway'); pg.click('#modal .btn.pri'); time.sleep(.5)
    for tab in ['general','axes','spindle','feed','toolchange','protected','post']:
        if pg.locator(f'[data-testid=mc-tab-{tab}]').count():
            pg.click(f'[data-testid=mc-tab-{tab}]'); time.sleep(.3); shot(pg,'x-mt-'+tab)
    print(pg.evaluate("[...document.querySelectorAll('[data-testid^=mc-tab-]')].map(e=>e.dataset.testid).join(' ')"))
    print(pg.evaluate("[...document.querySelectorAll('.mc-ed .fld.need')].map(e=>e.querySelector('label')?.innerText+'→'+(e.querySelector('[data-f]')?.dataset.f)).join(' | ')"))
