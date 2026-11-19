import glyphs, subprocess, os
from PIL import Image
B='/home/claude/repo/brand/explorations/'
INK='#14202B'; BLUE='#1F6FD1'
def svg(w,h,body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w*4}" height="{h*4}">{body}</svg>'
# Yön 1: V-blok M + datum üçgeni
M1='M4 29.5V7h5.5l6.5 9.5L22.5 7H28v22.5h-5.5V17L16 26l-6.5-9v12.5z'
d1=f'<path d="{M1}" fill="{INK}"/><path d="M10 3h12l-6 9z" fill="{BLUE}"/>'
# Yön 2: Mihenk taşı: pahlı blok, çizik, L datum
d2=f'<path d="M4 4h16l8 8v16H4z" fill="{INK}"/><path d="M9 23.5L23 9.5" stroke="#fff" stroke-width="3.2" stroke-linecap="butt"/><path d="M4 28V21h3.5v3.5H15V28z" fill="{BLUE}"/>'
# Yön 3: takım yolu (kare sarmal)
d3=f'<path d="M5.5 5.5H26.5V26.5H9.5V11.5H21.5V21.5H14.5V16.5" fill="none" stroke="{INK}" stroke-width="3.4" stroke-linejoin="miter"/><circle cx="16" cy="16.5" r="2.2" fill="{BLUE}"/>'
for n,d in [('yon1-v-blok-m',d1),('yon2-tas-olcut',d2),('yon3-takim-yolu',d3)]:
    word,wd=glyphs.text_path('Mihenk',31,x=40,y=29.5,track=-0.005)
    open(B+n+'.svg','w').write(svg(40+wd+4,32,d+f'<path d="{word}" fill="{INK}"/>'))
    open('/tmp/'+n+'-mark.svg','w').write(svg(32,32,d))
# Pano: büyük + 16px (8x yakınlaştırılmış)
tiles=[]
for n in ['yon1-v-blok-m','yon2-tas-olcut','yon3-takim-yolu']:
    subprocess.run(['rsvg-convert','-w','256','-h','256','-b','white','/tmp/%s-mark.svg'%n,'-o','/tmp/%s-256.png'%n],check=True)
    subprocess.run(['rsvg-convert','-w','16','-h','16','-b','white','/tmp/%s-mark.svg'%n,'-o','/tmp/%s-16.png'%n],check=True)
    subprocess.run(['rsvg-convert','-w','260','-b','white',B+n+'.svg','-o','/tmp/%s-lock.png'%n],check=True)
sheet=Image.new('RGB',(3*300,560),'white')
for i,n in enumerate(['yon1-v-blok-m','yon2-tas-olcut','yon3-takim-yolu']):
    sheet.paste(Image.open('/tmp/%s-256.png'%n),(i*300+22,10))
    sheet.paste(Image.open('/tmp/%s-16.png'%n).resize((128,128),Image.NEAREST),(i*300+22,280))
    sheet.paste(Image.open('/tmp/%s-16.png'%n),(i*300+200,290))
    l=Image.open('/tmp/%s-lock.png'%n); sheet.paste(l,(i*300+10,440))
sheet.save('/tmp/explore-sheet.png')
