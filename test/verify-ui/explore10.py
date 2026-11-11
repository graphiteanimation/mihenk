from build import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    pg.click('[data-testid=tab-manufacture]'); time.sleep(.6)
    pg.click('[data-cmd=cam-machine]'); time.sleep(.5)
    print(pg.evaluate("document.querySelector('#modal').innerText"))
    pg.click('#modal [data-testid=mc-copy] >> nth=0'); pg.fill('[data-testid=prompt-input]', 'Atölye Neway'); pg.click('#modal .btn.pri'); time.sleep(.5)
    for tab in ['general','axes','spindle','protected','post']:
        pg.click(f'[data-testid=mc-tab-{tab}]'); time.sleep(.2)
        print('==',tab)
        print(pg.evaluate("""[...document.querySelectorAll('.mc-ed [data-f]')].map(e=>(e.closest('.fld.need')?'NEED ':'     ')+e.dataset.f+' '+e.tagName+' '+(e.type||'')+' val='+e.value+(e.tagName=='SELECT'?' opts='+[...e.options].map(o=>o.value).join(','):'')).join('\\n')"""))
    pg.click('[data-testid=mc-tab-axes]'); 
    print(pg.evaluate("document.querySelector('.mc-ed').innerHTML.slice(-1500)"))
