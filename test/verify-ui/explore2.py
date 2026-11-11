from lib import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    pg.click('[data-testid=dd-prim]'); shot(pg,'x-dd')
    print(pg.evaluate("[...document.querySelectorAll('[data-cmd]')].filter(e=>e.offsetParent).map(e=>e.dataset.cmd).join(' ')"))
    pg.click('[data-cmd=box]'); time.sleep(0.5); shot(pg,'x-box')
    print(pg.evaluate("[...document.querySelectorAll('#panel [data-k], #panel button')].map(e=>(e.dataset.k||'')+':'+(e.dataset.testid||e.innerText)).join(' | ')"))
    print(pg.evaluate("document.querySelector('#panel').innerHTML.slice(0,1500)"))
