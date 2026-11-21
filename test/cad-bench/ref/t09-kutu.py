# T09 Mihenk özel: eğimli (draft) kabuk kutu, iç bosslar, nervür, kenar yuvarlatma, pah. Ölçüler mm.
# Dış: 100 x 60 taban, yükseklik 30, yan duvarlar 3° iç eğim (draft, tabandan yukarı daralır).
# Köşeler eskizde R8 (eğim boyunca yuvarlak kalır). Üstten açık kabuk, cidar 2 (taban dahil).
# İç 4 boss: Ø8, merkezler (±40, ±20), tabandan 28 yükseklik, Ø3.4 boydan delik.
# Nervür: X ekseni boyunca ortada, kalınlık 1.5, yükseklik tabandan 15, iç duvardan iç duvara.
# Üst açıklık dış kenarı 0.5 x 45° pah.
from build123d import *
H, T = 30, 2
with BuildPart() as p:
    with BuildSketch():
        RectangleRounded(100, 60, 8)
    extrude(amount=H, taper=3)
    offset(amount=-T, openings=p.faces().sort_by(Axis.Z)[-1])
    with BuildSketch(Plane.XY.offset(T)):
        with Locations((40,20),(40,-20),(-40,20),(-40,-20)):
            Circle(4)
    extrude(amount=H-T-2)
    with BuildSketch(Plane.XY.offset(T)):
        Rectangle(100, 1.5)
    extrude(amount=15-T, mode=Mode.INTERSECT if False else Mode.ADD)
    # nervürü dış gövde içinde tut
with BuildPart() as dis:
    with BuildSketch():
        RectangleRounded(100, 60, 8)
    extrude(amount=H, taper=3)
part = p.part & dis.part
with BuildPart() as q:
    add(part)
    with Locations((40,20,0),(40,-20,0),(-40,20,0),(-40,-20,0)):
        Cylinder(1.7, 2*H, mode=Mode.SUBTRACT)
    top = q.faces().sort_by(Axis.Z)[-1]
    chamfer(top.outer_wire().edges(), 0.5)
r = q.part
