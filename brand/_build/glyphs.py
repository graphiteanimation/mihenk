from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
FONT='/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf'
_f=TTFont(FONT); _gs=_f.getGlyphSet(); _cmap=_f.getBestCmap(); _upm=_f['head'].unitsPerEm
def text_path(s,size,x=0,y=0,track=0.0):
    """Metinden SVG yolu (dış çizgi). y = taban çizgisi. track: em cinsinden harf aralığı."""
    sc=size/_upm; pen=SVGPathPen(_gs, ntos=lambda v: ('%.2f'%v).rstrip('0').rstrip('.')); cx=x
    for ch in s:
        g=_cmap[ord(ch)]; tp=TransformPen(pen,(sc,0,0,-sc,cx,y)); _gs[g].draw(tp); cx+=_gs[g].width*sc+track*size
    return pen.getCommands(), cx-x-track*size
