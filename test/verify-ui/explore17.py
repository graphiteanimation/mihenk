from flow import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    build_part(pg, 'x', log=lambda *a: None)
    pg.click('[data-testid=tab-manufacture]'); time.sleep(.6)
    fill_machine(pg); add_tools(pg); do_setup(pg)
    op_face(pg)
    pg.click('[data-cmd=cam-op-pocket]'); time.sleep(.5); shot(pg,'x-pk1')
    print(pg.evaluate("[...document.querySelectorAll('#panel [data-f]')].map(e=>e.dataset.f+'='+e.value+(e.tagName=='SELECT'?' ['+[...e.options].map(o=>o.value+'/'+o.text).join(',')+']':'')).join('\\n')"))
    pg.click('[data-testid=op-tab-geom]'); time.sleep(.3); shot(pg,'x-pk-geom')
    print(pg.evaluate("document.querySelector('#panel').innerText"))
    pg.mouse.click(690,462); time.sleep(.5); shot(pg,'x-pk-geom2')
    print(pg.evaluate("[...document.querySelectorAll('[data-testid=op-geom-row]')].map(e=>e.innerText).join('|')"))
