from build import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    pg.click('[data-testid=tab-manufacture]'); time.sleep(.6)
    pg.click('[data-cmd=cam-tools]'); time.sleep(.5); shot(pg,'x-t0')
    pg.click('[data-testid=tl-new]'); time.sleep(.4); shot(pg,'x-t1')
    for tab in ['general','geom','presets']:
        if pg.locator(f'[data-testid=tl-tab-{tab}]').count():
            pg.click(f'[data-testid=tl-tab-{tab}]'); time.sleep(.2); shot(pg,'x-t-'+tab)
        print('==',tab)
        print(pg.evaluate("""[...document.querySelectorAll('#modal [data-f]')].map(e=>(e.dataset.f)+' '+e.tagName+' val='+e.value+(e.tagName=='SELECT'?' opts='+[...e.options].map(o=>o.value+'/'+o.text).join(','):'')).join('\\n')"""))
    print(pg.evaluate("[...document.querySelectorAll('#modal [data-testid]')].map(e=>e.dataset.testid).join(' ')"))
