from flow import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    build_part(pg, 'x', log=lambda *a: None)
    pg.click('[data-testid=tab-manufacture]'); time.sleep(.6)
    fill_machine(pg)
    pg.click('[data-cmd=cam-tools]'); time.sleep(.3)
    add_tool(pg, 'face', 'Yuzey 50', 4, 50, {'rpm': 3000, 'feedCut': 900, 'feedPlunge': 300})
    shot(pg, 'x-tpreset')
    print(pg.evaluate("[...document.querySelectorAll('#modal [data-f]')].map(e=>e.dataset.f+'='+e.value).join(' ')"))
