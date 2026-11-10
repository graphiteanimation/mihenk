import json, os, icons_src as S
R='/home/claude/atolyecad/brand/icons/'
for f in os.listdir(R):
    if f.endswith('.svg') or f=='icons.json': os.remove(R+f)
HEAD='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'
for n,s in S.I.items(): open(R+n+'.svg','w').write(HEAD+s+'</svg>\n')
json.dump({'viewBox':'0 0 24 24','strokeWidth':1.75,'icons':S.I},open(R+'icons.json','w'),ensure_ascii=False,indent=1)
# Test sayfası
out=['<!doctype html><meta charset="utf-8"><title>Mihenk simge seti</title><link rel="stylesheet" href="tokens.css"><style>body{margin:0;padding:24px;background:var(--bg-chrome);color:var(--text);font:13px var(--font-ui)}h2{font-size:14px;margin:28px 0 10px;color:var(--text-muted)}.g{display:grid;grid-template-columns:repeat(auto-fill,96px);gap:8px}.t{display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 2px;background:var(--bg-surface);border:1px solid var(--line);border-radius:6px}.t .big svg{width:48px;height:48px}.t .sm{display:flex;gap:6px;align-items:center}.t .sm svg{width:20px;height:20px}.t .sm .a svg{width:24px;height:24px}.t span{font-size:11px;color:var(--text-subtle);max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}svg{fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}</style>']
for cat,names in S.G.items():
    out.append(f'<h2>{cat} ({len(names)})</h2><div class="g">')
    for n in names:
        sv=f'<svg viewBox="0 0 24 24">{S.I[n]}</svg>'
        out.append(f'<div class="t"><div class="big">{sv}</div><div class="sm"><span class="a">{sv}</span>{sv}</div><span>{n}</span></div>')
    out.append('</div>')
open('/home/claude/atolyecad/design/icon-sheet.html','w').write('\n'.join(out))
print(len(S.I))
