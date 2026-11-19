O1002
(UNVERIFIED POST - DOGRULANMADI - MIHENK 0.3.0)
(PROGRAM O1002)
(DATE 2026-11-19)
(MACHINE P1 TEST Neway kopyasi [varsayimli] REV 1 CONTROL mitsubishi-m80v)
(T20 H20 D20 DIA 50.000 FACE)
(T27 H27 D27 DIA 10.000 CHAMFER)
(GATES 0 BLOCK 2 WARN)
(WARNING: No machine position for "P1-S2 Alt": absolute travel could not be checked. Only the toolpath span was checked.)
(WARNING: The simulation cannot see side gouges smaller than 0.25 mm [half the grid size]. Wall accuracy comes from the toolpath calculation.)
G90 G17 G21 G40 G49 G80 G94
(OP 1: 7 Yuzey T20 [alt] [face] SETUP P1-S2 Alt)
G90 G40 G49
G91 G28 Z0.
G90
T20 M6
G0 A0.
S4500 M3
G0 G90 G57 X-50. Y-18.4
G43 H20 Z15.
M8
G1 Z-1. F750.
X50. F2250.
Y18.4
X-50.
G0 Z5.
Y-18.4
G1 Z-2. F750.
X50. F2250.
Y18.4
X-50.
G0 Z5.
Z15.
(OP 2: 8 Pah alt T27 [GECICI COZUM] [contour] SETUP P1-S2 Alt)
G90 G40 G49
G91 G28 Z0.
G90
M5
M9
T27 M6
S6000 M3
G0 G90 G57 X0. Y7.35
G43 H27 Z15.
M8
G1 Z-2.5 F200.
G3 X-3.75 Y3.6 I0. J-3.75 F600.
X3.75 I3.75 J0.
X0. Y7.35 I-3.75 J0.
G0 Z5.
Z15.
(END OF PROGRAM)
G90 G40 G49
G91 G28 Z0.
G90
M5
M9
M30
