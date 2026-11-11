from flow import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    build_part(pg, 'x', log=lambda *a: None)
    pg.click('[data-testid=tab-manufacture]'); time.sleep(.6)
    fill_machine(pg); add_tools(pg)
    pg.click('[data-cmd=cam-setup]'); time.sleep(.6); shot(pg,'x-setup')
    print(pg.evaluate("[...document.querySelectorAll('#panel [data-f]')].map(e=>e.dataset.f+'='+e.value+(e.tagName=='SELECT'?' ['+[...e.options].map(o=>o.value).join(',')+']':'')).join('\\n')"))
    print(pg.errs[-3:])
