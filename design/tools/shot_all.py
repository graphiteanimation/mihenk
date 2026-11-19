#!/usr/bin/env python3
import subprocess, pathlib
R=pathlib.Path('/home/claude/repo/design')
names=['01-karsilama','02-tasarim-model','03-sketch','04-ayarlar','04b-hata-onay-bildirim','05-imalat-cam','06-bilesenler']
for n in names:
    for (w,h) in [(1440,900),(1920,1080)]:
        for th,lg in [('light','tr'),('dark','en')]:
            subprocess.run(['python3',str(R/'tools/shot.py'),str(R/f'mockups/{n}.html'),str(R/f'shots/{n}_{w}_{th}_{lg}.png'),str(w),str(h),f'?theme={th}&lang={lg}'],check=True)
