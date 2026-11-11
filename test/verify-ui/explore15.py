from flow import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    pg.click('[data-testid=tab-manufacture]'); time.sleep(.6)
    pg.click('[data-cmd=cam-machine]'); time.sleep(.4)
    pg.click('#modal [data-testid=mc-copy] >> nth=0'); pg.fill('[data-testid=prompt-input]', 'A'); pg.click('#modal .btn.pri'); time.sleep(.4)
    pg.click('[data-testid=mc-tab-post]')
    g=lambda: pg.evaluate("[...document.querySelectorAll('.mc-ed .fld.need')].map(e=>e.innerText.split('\\n')[0]).filter(x=>x.includes('G54'))")
    print('before', g())
    pg.fill('[data-f=pp-g541Range-min]', '1'); print('min only', g())
    pg.fill('[data-f=pp-g541Range-max]', '48'); print('both(no blur)', g()); pg.keyboard.press('Tab'); print('after tab', g())
    pg.fill('[data-f=pp-g541Range-min]', '2'); pg.keyboard.press('Tab'); print('after min change', g())
