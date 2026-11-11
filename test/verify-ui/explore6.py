from build import *
with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', args=ARGS)
    ctx, pg = newpage(br)
    build_part(pg, 'x')
    print(pg.evaluate("[...document.querySelectorAll('#panel [data-k]')].map(e=>e.dataset.k+'='+(e.value||e.innerText).slice(0,30)).join(' | ')"))
    print(pg.evaluate("[...document.querySelectorAll('#panel select')].map(s=>s.dataset.k+': '+[...s.options].map(o=>o.value+'/'+o.text).join(', ')).join('\\n')"))
    print(pg.evaluate("document.querySelector('#panel [data-k=thread]')?.outerHTML.slice(0,300)"))
