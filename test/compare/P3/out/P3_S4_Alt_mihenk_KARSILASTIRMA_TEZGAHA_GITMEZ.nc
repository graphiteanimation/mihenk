O2006
(UNVERIFIED POST - DOGRULANMADI - MIHENK 0.3.0)
(PROGRAM O2006)
(DATE 2026-11-19)
(MACHINE P3 TEST Neway kopyasi [varsayimli] REV 1 CONTROL mitsubishi-m80v)
(T20 H20 D20 DIA 50.000 FACE)
(GATES 0 BLOCK 2 WARN)
(WARNING: No machine position for "P3-S4 Alt": absolute travel could not be checked. Only the toolpath span was checked.)
(WARNING: The simulation cannot see side gouges smaller than 0.5 mm [half the grid size]. Wall accuracy comes from the toolpath calculation.)
G90 G17 G21 G40 G49 G80 G94
(OP 1: 18 Yuzey T20 [alt, Y-2 -> 0] [face] SETUP P3-S4 Alt)
G90 G40 G49
G91 G28 Z0.
G90
T20 M6
G0 A0.
S4500 M3
G0 G90 G59 X-181.4 Y-125.825
G43 H20 Z15.
M8
G1 Z-1. F750.
X181.4 F2250.
Y-89.875
X-181.4
Y-53.925
X181.4
Y-17.975
X-181.4
Y17.975
X181.4
Y53.925
X-181.4
Y89.875
X181.4
Y125.825
X-181.4
G0 Z5.
Y-125.825
G1 Z-2. F750.
X181.4 F2250.
Y-89.875
X-181.4
Y-53.925
X181.4
Y-17.975
X-181.4
Y17.975
X181.4
Y53.925
X-181.4
Y89.875
X181.4
Y125.825
X-181.4
G0 Z5.
Z15.
(END OF PROGRAM)
G90 G40 G49
G91 G28 Z0.
G90
M5
M9
M30
