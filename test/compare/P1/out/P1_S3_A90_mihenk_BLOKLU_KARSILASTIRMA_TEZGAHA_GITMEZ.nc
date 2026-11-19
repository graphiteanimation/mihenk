(*** BLOKLU: kapilar block verdi -> normalde NC URETILMEZ; yalniz yapi karsilastirmasi icin zorla uretildi ***)
(BLOCK cam.gate.body_short {"depth":36.801,"bodyLen":35,"op":"10 Delme D5.5 T30"})
(BLOCK cam.sim.rapid_in_stock {"x":16,"y":1.7634913907721885e-15,"z":-23.799999999999997,"depth":23.44644584646726,"cells":13192,"op":"o9"})
(BLOCK cam.sim.rapid_in_stock {"x":-16,"y":1.7634913907721885e-15,"z":-23.799999999999997,"depth":23.44644584646726,"cells":13192,"op":"o9"})
(BLOCK cam.sim.holder_collision {"x":16,"y":1.7634913907721885e-15,"z":-36.801,"depth":1.8009992370605374,"cells":11046,"op":"o10"})
(BLOCK cam.sim.holder_collision {"x":-16,"y":1.7634913907721885e-15,"z":-36.801,"depth":1.8009992370605374,"cells":11046,"op":"o10"})
O1003
(UNVERIFIED POST - DOGRULANMADI - MIHENK 0.3.0)
(PROGRAM O1003)
(DATE 2026-11-19)
(MACHINE P1 TEST Neway kopyasi [varsayimli] REV 1 CONTROL mitsubishi-m80v)
(T24 H24 D24 DIA 10.000 SPOT)
(T30 H30 D30 DIA 5.500 DRILL)
(WARNING A AXIS DIRECTION NOT VERIFIED - CONFIRM ON MACHINE WITH A MARKED PART BEFORE CUTTING)
(GATES 0 BLOCK 3 WARN)
(WARNING: No machine position for "P1-S3 A90": absolute travel could not be checked. Only the toolpath span was checked.)
(WARNING: A axis direction [profile dir [-1,0,0]] is not verified on the machine. Confirm the A direction with a marked part before cutting.)
(WARNING: The simulation cannot see side gouges smaller than 0.25 mm [half the grid size]. Wall accuracy comes from the toolpath calculation.)
G90 G17 G21 G40 G49 G80 G94
(OP 1: 9 Punta T24 [drill] SETUP P1-S3 A90)
G90 G40 G49
G91 G28 Z0.
G90
T24 M6
G0 A90.
S3000 M3
G0 G90 G58 X16. Y0.
G43 H24 Z15.
M8
Z5.
G98 G81 X16. Y0. Z-32.05 R-23.8 F300.
G80
G0 X-16. Y0. Z5.
G98 G81 X-16. Y0. Z-32.05 R-23.8 F300.
G80
G0 X-16. Y0. Z15.
(OP 2: 10 Delme D5.5 T30 [drill] SETUP P1-S3 A90)
G90 G40 G49
G91 G28 Z0.
G90
M5
M9
T30 M6
S3500 M3
G0 G90 G58 X16. Y0.
G43 H30 Z15.
M8
Z5.
G98 G83 X16. Y0. Z-36.801 R-23.8 Q2. F400.
G80
G0 X-16. Y0. Z5.
G98 G83 X-16. Y0. Z-36.801 R-23.8 Q2. F400.
G80
G0 X-16. Y0. Z15.
(END OF PROGRAM)
G90 G40 G49
G91 G28 Z0.
G90
G0 A0.
M5
M9
M30
