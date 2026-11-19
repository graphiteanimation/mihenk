#!/usr/bin/env python3
"""components.css içindeki :hover/:active/:focus-visible kurallarından .is-hover/.is-active/.is-focus kopyaları üretir (bileşen galerisi için)."""
import re
css=open('/home/claude/repo/design/components.css').read()
out=['/* otomatik üretim: build_states.py — galeri/maket durumları için */']
for m in re.finditer(r'([^{}@]+)\{([^{}]*)\}',css):
    sel,body=m.group(1).strip(),m.group(2)
    if re.search(r':(hover|active|focus-visible)',sel):
        new=','.join(re.sub(r':hover','.is-hover',re.sub(r':active','.is-active',re.sub(r':focus-visible','.is-focus',s))) for s in sel.split(','))
        out.append(new+'{'+body+'}')
open('/home/claude/repo/design/_states.css','w').write('\n'.join(out)+'\n')
