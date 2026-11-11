from flow import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    build_part(pg, 'x', log=lambda *a: None)
    pg.click('[data-testid=tab-manufacture]'); time.sleep(.6)
    fill_machine(pg); add_tools(pg); do_setup(pg)
    pg.click('[data-cmd=cam-op-face]'); time.sleep(.6); shot(pg,'x-op-face')
    for tab in ['tool','geom','heights','passes']:
        pg.click(f'[data-testid=op-tab-{tab}]'); time.sleep(.3); shot(pg,'x-op-face-'+tab)
        print('==',tab); print(pg.evaluate("[...document.querySelectorAll('#panel [data-f]')].map(e=>e.dataset.f+'='+e.value+(e.tagName=='SELECT'?' ['+[...e.options].map(o=>o.value).join(',')+']':'')).join('\\n')"))
