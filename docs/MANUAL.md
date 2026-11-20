# Mihenk CAD/CAM User Manual

Version 0.3.0 · English · Turkish counterpart: `docs/KILAVUZ.md` (same content)

This manual is for CNC job shops that machine aluminium and steel parts. Mihenk is machine-independent: you add the profile of your own machine (5.2). It assumes you know CAD/CAM but are not a programmer. Command names match the names in the program exactly (English interface).

> **READ THIS FIRST**
>
> The NC code Mihenk writes carries the heading **UNVERIFIED (DOĞRULANMADI)**. No NC file should be trusted until it has been proven on the machine.
> The program is a helper. Control of the machine and responsibility stay with you.
> The first-run procedure on the machine is not the job of this program; it is done in the machine project.
> Do not run a 4th-axis (3+1) NC until the A direction has been **confirmed with a marked part**.
> The simulation cannot see everything. Read **Section 7** to learn what it misses.

## Contents

1. Installation and first run
2. Interface tour
3. Sketch (2D drawing)
4. Solid modeling
5. Manufacture (CAM)
6. Worked example: a block with a pocket and holes
7. SAFETY
8. Troubleshooting
9. Shortcuts

---

## 1. Installation and first run

### 1.1 Verify the installer (SHA-256)

Two files come with a release:

- `Mihenk-Kurulum-0.3.0.exe` (the installer)
- `SHA256SUMS.txt` (the SHA-256 checksum of the installer; each line is `checksum  file name`)

Compare the checksum before installing:

1. Open Windows PowerShell in the folder that holds the files.
2. Type: `Get-FileHash .\Mihenk-Kurulum-0.3.0.exe -Algorithm SHA256`
   (Alternative: `certutil -hashfile Mihenk-Kurulum-0.3.0.exe SHA256`)
3. Compare the long string of letters and digits with the line in `SHA256SUMS.txt`.
4. It must match character for character. **If even one character differs, do not install**; get the file again.

### 1.2 Installation

1. Run `Mihenk-Kurulum-0.3.0.exe`.
2. It does not ask for administrator rights. The program installs into `%LOCALAPPDATA%\Programs\Mihenk`.
3. Shortcuts are added to the desktop and the Start menu. To remove the program use the uninstaller (`Kaldir.exe`) in the Start menu.
4. The installer is unsigned, so Windows SmartScreen may say "Windows protected your PC". Click **More info** → **Run anyway**. Do this only if the checksum in 1.1 matched.
5. Double-clicking a `.mhnk` file opens Mihenk. If another program already uses that extension, the installer backs it up and restores it on uninstall.

The program makes no network connections. It works offline; your files stay on this computer.

### 1.3 First run

1. The **Welcome screen** opens: **New document**, **Open document**, **Recent files** and "Your first part in three steps" (Sketch, Extrude, Save).
2. Language: on first start the program opens in Turkish if your computer's language is Turkish, otherwise in English.
3. **Settings** (Ctrl+,) gives you the following. Changes apply immediately:
   - **Language**: Türkçe / English
   - **Theme**: Light / Dark / System
   - **Density**: Normal / Large (wider controls for gloved or touch use)
   - **Welcome screen**: Show at startup
4. The bottom of the welcome screen also has quick language/theme/density selectors.

### 1.4 File types, saving, backup

| Type | Extension | Note |
|---|---|---|
| Mihenk document | `.mhnk` | Saving always writes this type. |
| STEP, STL | `.step` `.stp` `.stl` | Imported and exported from the File menu. |
| Sketch | `.dxf` | Only while a Sketch is open (Section 3.7). |
| NC code | `.nc` | Saved from the Manufacture tab (Section 5.10). |
| Tool library | `.json` | Imported and exported from the Tools window. |

- **Save** (Ctrl+S) is safe: it writes to a temporary file first, then puts it in place. If writing is interrupted, the old file is not damaged.
- On every save the previous version stays next to the file as `filename.mhnk.bak`. To go back one save, remove the `.bak` extension and make it `.mhnk`.
- **Automatic recovery**: while there are changes, a recovery copy is written every 60 seconds. The status bar shows "Autosaved" with the time. A clean exit or a Save deletes this copy. If the program closes unexpectedly, the next start shows the "Recovery file found" window: **Recover** or **Discard**. Save recovered work at once.
- Settings, **your machine profiles** and **your tool library** are stored in `%APPDATA%\Mihenk\settings.json`. Only the id of the selected machine and a copy of the document's tools are written into the document. If you take a document to another computer that lacks the same machine profile, you will see "Machine profile not found". Back up `settings.json`.
- Known limit: a file cannot be larger than 200 MB.

---

## 2. Interface tour

From top to bottom the screen has:

1. **Title bar**: logo, **File** menu, Undo / Redo / Save, document name (with an unsaved-changes marker), **Search commands** (Ctrl+K), the label of the selected **machine** in manufacturing mode, Settings, Help.
2. **Workspace tabs**: **Design**, **Manufacture**, **Drawing** (Drawing is "Coming soon", not available yet).
3. **Ribbon**: command groups. Commands that do not fit are in the » menu, in the ▾ list of their group, or in the Ctrl+K search. "Recent commands" appear as shortcuts.
4. **Browser** (left): Parameters, Origin, Bodies, Sketches. In the Manufacture tab: Machines, Tools, Setups and operations.
5. **3D view** (center) and **view cube**: Front, Top, Right, Iso, Fit.
6. **Panel** (right): choosing a command opens its feature form. Enter = OK, Esc = Cancel.
7. **Timeline** (bottom): every feature is a chip. Click to select, double-click to edit, right-click for the menu (**Edit**, **Rename**, **Suppress / Unsuppress**, **Roll back to here**, **Delete**). In the Manufacture tab this area is the simulation bar.
8. **Status bar**: mode (Model / Sketch), tool, number of faulty features, selection, compute time, autosave time. In the Manufacture tab it also holds the "Post: UNVERIFIED" button.

Mouse (in the 3D view):

| Action | What it does |
|---|---|
| Right button drag | Rotates |
| Middle button drag | Pans |
| Wheel | Zooms |
| Left button | Selects |

A few terms:

- **Parameter**: a named dimension. Example: `L = 80`. You can type `L/2` in dimension boxes.
- **Error**: a red feature could not be computed. Hover over it to see the reason.
- Units: mm and degrees. Both comma and dot are accepted as the decimal mark.
- With unsaved work, New/Open/closing asks first ("Unsaved changes").

---

## 3. Sketch (2D drawing)

A sketch is a 2D drawing on a plane. Solids are made from it.

### 3.1 Starting and finishing a sketch

1. Click **Sketch**.
2. The hint says "Select a plane or a planar face". Click an origin plane (XY Top, XZ Front, YZ Right) or a flat face of a body.
3. Draw, dimension, constrain.
4. Save with **Finish Sketch** (green button). **Cancel** discards the changes.
5. When you finish with problems you see "Sketch saved, but:": open profile, no closed profile, duplicate overlapping objects, not fully defined.

The ribbon shows the common tools. The others are in the **Draw ▾**, **Edit ▾** and **Constrain ▾** lists.

### 3.2 Drawing commands

| Command | Shortcut | What it does |
|---|---|---|
| Select | (default) | Click; Shift for multiple. Drag in empty space: left to right = fully inside, right to left = touching. Ctrl+A selects all. |
| Line | L | Draws a chain. In a chain, A = tangent arc, L = line. Esc, double-click or right-click ends it. Returning to the start point closes it. |
| Rectangle | R | Two corners. |
| Center rect | Shift+R | From the center. |
| 3-pt rect | Draw ▾ | Rotated rectangle. |
| Circle | C | Center and radius. |
| 2-pt circle | Draw ▾ | Two ends of the diameter. |
| 3-pt circle | Shift+C | Three points. |
| Arc | A | Center, start, end. |
| 3-pt arc | Shift+A | Three points. |
| Tangent arc | Draw ▾ | Tangent to an existing end. |
| Polygon | G | Number of sides and inscribed/circumscribed mode are in the right panel. |
| Slot | U | Two end centers and a width. |
| Ellipse | Y | Center, major axis end, minor radius. |
| Spline | B | Click the points; Enter, double-click or right-click ends it. Clicking the first point closes it. |
| Point | P | For points such as hole centers. |

While drawing, **if you start typing a number**, a box opens for length/angle (line), width/height (rectangle) or radius (circle). Tab changes the field, Enter confirms and adds the matching dimension.

Snapping: end point, center, origin, midpoint, intersection, tangent, perpendicular, on object, grid (1 mm; hold Ctrl to turn it off). If a line is within ±3° of horizontal or vertical, a Horizontal/Vertical constraint is added automatically.

### 3.3 Editing commands

| Command | Shortcut | What it does |
|---|---|---|
| **Trim** | T | The part to be removed turns red when you hover; click it. Hold and drag to trim many parts. The number of removed constraints is shown on the status line. |
| Extend | X | Extends an end to the nearest intersection. |
| Break | K | Splits an object in two where you click. |
| Offset | O | Select the chain, type the distance (an expression works), click the side. It stays linked to the source when possible. Corners: Sharp / Round. |
| Fillet | Q | Click a corner point or the two objects forming the corner. Adds a radius dimension. |
| Chamfer | W | Chamfer at a corner. It does not add a dimension constraint. |
| Mirror | M | Select objects, click **Next**, click the mirror line. With "Linked" ticked, a symmetric constraint is added. |
| Rect pattern / Circ pattern | Edit ▾ | Enter count and step, click **Apply**. Linked or independent copies. |
| Move / Copy / Rotate / Scale | Edit ▾ | A number box or two clicks (from, to). |
| Project | J | Adds body edges as fixed construction geometry. |

Ctrl+X / Ctrl+C / Ctrl+V is the sketch clipboard. Right-click menu: Finish sketch, Delete, Toggle construction, Show constraints, Copy / Cut / Paste, Select all. Right-click on a dimension label: **Make reference dimension** / **Make driving dimension**, **Edit value**.

Construction geometry (**Construction**) is helper geometry: drawn dashed, never part of a profile.

### 3.4 Dimensions

The **Dimension** tool (D) chooses the dimension from what you click:

| You click | Dimension |
|---|---|
| Line | Length |
| Circle | Diameter |
| Arc | Radius |
| Two points | Distance |
| Point + line | Point-to-line distance |
| Two lines | Angle |

The **Horizontal** and **Vertical** dimension tools measure two points or one line horizontally/vertically. There are also **Radius** and **Diameter** tools.

After you pick, a small box opens; type a value or an expression (`L/2`) and press **Enter**. Double-click the label to correct it later. If the expression is invalid or conflicts, the dimension is not added and the reason is shown. A dragged label position is kept.

### 3.5 Constraints

| Constraint | Applies to |
|---|---|
| Horizontal, Vertical | A line or two points |
| Parallel, Perpendicular | Line–line |
| Equal | Pairs of lines/circles/arcs/ellipses |
| Collinear | Line–line (on the same line) |
| Concentric | Pairs of circles/arcs/ellipses |
| Tangent | Line–circle/arc, circle–circle, arc–arc |
| Coincident | Two points |
| Point on object | Point–line/circle/arc/ellipse |
| Midpoint | A point and a line |
| Symmetric | Two points and a mirror line |
| Fix | Point, line, circle, arc |
| Construction | Makes the selection construction geometry |

The status bar shows "Degrees of freedom: N" or "Fully defined". Fully defined geometry is dark, free geometry blue, construction geometry dashed grey, selection orange. Conflicting or redundant constraints are listed in the panel; click a row to highlight the object.

The solver runs after every change. If it cannot solve, the change is undone and the reason is written ("This … conflicts with the existing constraints").

### 3.6 Profile rules

Extrude and Revolve need a **closed** profile. Closed regions are shown with a light fill. You get an error when:

- Lines do not meet end to end (open profile).
- Lines overlap or cross themselves.
- The profile has a very short edge.

If you change the sketch after choosing a profile, the selection can be lost: the feature turns red; edit it and pick the profile again.

### 3.7 DXF import and export

Both work only while a Sketch is open (**File** menu).

- **Import DXF into sketch…**: Read: lines, points, circles, arcs, LWPOLYLINE, POLYLINE (including bulge), ellipses, splines. Layers are ignored; nearby ends are joined. If the file has no unit information, a window opens: **File unit** (mm, cm, m, inch, foot or a custom factor). If you are unsure, leave mm and check the dimensions afterwards.
- **Export sketch as DXF (2000)**: ellipses and splines are written as they are.
- **Export sketch as DXF (R12)**: ellipses and splines are cut into short lines (POLYLINE). For old programs.
- Construction geometry is not exported.

### 3.8 Known limits of Sketch

- Tangent constraint: line–ellipse and spline tangency do not exist; a warning is shown.
- Chamfer does not add a dimension constraint.
- A linked circular pattern is limited to about 120 points.
- For body-edge projection you cannot select by clicking a face: there are the "edges in the plane / all" options.
- DXF saving through the Windows save window has not been tried on real Windows (Section 7.6).

---

## 4. Solid modeling

Modeling commands are in the ribbon of the **Design** tab: **Create**, **Modify**, **Inspect**.

### 4.1 Create

**Extrude**: extrudes or cuts a sketch profile.

1. Click **Extrude**. The panel opens; a sketch is picked automatically (the latest unused one).
2. **Profiles**: click profile regions in the view (default: all).
3. **Operation**: New body / Join / Cut / Intersect. If the sketch was drawn on a face of an existing body, the default is Cut.
4. **Direction**: One direction / Symmetric / Two directions. **Extent**: Distance / All. Type a dimension or expression in **Distance**. **Flip** reverses the direction.
5. Enter (OK). While you type, the view shows a live preview; errors appear in red in the panel.

**Revolve**: revolves a profile around an axis. Axis: Sketch X axis / Sketch Y axis / a line in the sketch. **Angle** 0–360. The profile must stay on one side of the axis; crossing the axis gives an error.

**Hole**: makes holes at the **Point** objects (or circle centers) of a sketch. First draw a sketch that gives the hole positions.

| Field | Options |
|---|---|
| Type | Simple / Counterbore / Countersink |
| Thread | None, M3 … M24 (coarse pitch). Picking one sets the diameter to the drill size (nominal − pitch) and stores the thread data. |
| Diameter, Depth | expressions allowed |
| Extent | Depth / All (through) |
| Tip angle | 0–180° |
| Counterbore diameter / depth / angle | shown by type |

> The **Drill** and **Thread** operations in the Manufacture tab read holes from this **Hole** feature. If you make holes by an Extrude with **Cut**, CAM does not see them as holes.

**Box**, **Cylinder**, **Sphere**: add a basic shape by entering position and size.

### 4.2 Modify

- **Fillet** (radius on edges) and **Chamfer**: click the edges, enter a value. If the value is too big for the edges you get an error.
- **Shell**: hollows a body; choose the faces to open and the thickness. It can fail on a body with filleted edges: apply the shell before the fillet.
- **Combine**: target body and tool bodies. Join / Cut / Intersect. At least two bodies are needed.
- **Move/Copy**: translate (X/Y/Z) or rotate. There is a **Copy (keep the original)** option.
- **Pattern**: source (a feature or bodies), type: Rectangular (count/spacing, two directions) or Circular (count, total angle, center).
- **Mirror**: mirrors a body about a plane.

### 4.3 Inspect

- **Measure**: select an edge or face: type, length, area, radius/diameter. A second selection gives the shortest distance, the angle and ΔX/ΔY/ΔZ. Esc exits.
- **Properties**: select a body: volume, surface area, center of mass, bounding box. If you enter a **Density** (g/cm³, example 7.85) the mass is calculated too.
- **Interference**: checks whether the visible bodies overlap.
- **Section**: axis (X/Y/Z), position slider, **Flip**, **Close Section**. It only affects the display; the model does not change.

### 4.4 Parameters and the timeline

- **Parameters**: in the browser, Parameters → **Edit** (or Ctrl+K and type "Parameters"). The table has Name, Expression, Value, Note. A name may contain only letters, digits and `_`, and cannot start with a digit. A parameter can use earlier ones. When a parameter changes, dependent dimensions and sketches are recomputed.
- The **timeline** is the feature order. **Suppress** switches a feature off without deleting it. **Roll back to here** returns to that point; **Go to end** ends the roll-back. Deleting a feature that others use shows a warning ("The feature to delete is in use").
- Undo / Redo (Ctrl+Z / Ctrl+Y) hold 50 steps.
- If an edge/face selection cannot be found after the model changes, the feature turns red ("The selected face was lost when the model changed"). Edit the feature and select again.

### 4.5 STEP and STL

- **Import STEP… / Import STL…**: a foreign model is added as a body. **Imported geometry cannot be edited**; you can rename or delete it.
- An STL must be a closed solid with at most 50000 triangles.
- **Export STEP… / Export STL…**: writes the visible bodies. With no visible body it says "There is no visible body to export."
- For CAM prefer a parametric model you drew yourself. In CAM the "Body outline" selection only works on a straight-walled (prismatic) body (Section 5.6).

---

## 5. Manufacture (CAM)

Switch to the **Manufacture** tab. The ribbon groups are:

| Group | Commands |
|---|---|
| Setup | **New setup**, **Stock**, **Machine**, **Tools** |
| 2D | **Face**, **Contour**, **Pocket**, **Adaptive** (not available, "This operation type is coming in a later version") |
| Drilling and threading | **Drill**, **Thread** |
| 3D | **3D surfacing** (not available, coming later) |
| Actions | **Compute toolpath**, **Simulate**, **Post process**, **NC code** |

### 5.1 General flow

1. Prepare and select the machine profile (5.2, 5.3).
2. Define the tools (5.4).
3. Add a **New setup**: stock, zero point, work offset (5.5).
4. Add the operations (5.6).
5. **Compute toolpath** (5.7).
6. **Simulate** (5.8).
7. **Post process**: the gates check; if there is no problem, NC is produced (5.9, 5.10).
8. Read the NC and save it. Verify it yourself on the machine.

A body (Design tab) must exist first. Otherwise you see "Create a body first (Design tab). A setup is tied to a body."

In the browser every operation has a status badge: **Done**, **Not computed**, **Stale** (the model, tool, machine or operation changed; recompute), **Error**, **Suppressed**. The status bar counts "N operation(s) with errors", "N operation(s) stale". Operation right-click menu: Edit, Rename, Copy, Suppress / Unsuppress, Move up / Move down, Delete.

### 5.2 Machine profile

The **Machine** command opens the machine manager. The list has three **Built-in** templates:

- **Generic 3-axis (Fanuc style)**
- **Generic 3+1 (A axis, Fanuc style)**
- **Generic 3-axis (Mitsubishi style)**

Built-in templates carry structure only, their numeric values are empty, and they cannot be changed; no machine brand or model is built in. Machine profiles are your data. Make your own profile with **Copy**, fill it with **Edit**, and use it in the document by choosing the mark next to your profile in the list (or see "Adding your own machine" below). The "Missing values" column tells you how many fields are empty.

**Why are there empty fields?** The template cannot know any value of your machine and **does not invent** one; it leaves those values empty (`null`). If a value is needed for the NC and is empty, **NC production stops**. The goal: a wrong guess must never silently enter the NC.

Templates carry structure only; travel, A axis (speeds, limits, rotation direction), control/post settings, coolant M codes and the protected list (5.3) are values that **you** fill in from your machine's documentation.

**What you need to fill in**, and what happens if you leave it empty:

| Field (tab) | If you leave it empty |
|---|---|
| **Max spindle speed** (Spindle and feed) | Gate 1: "Missing data" → no NC |
| **Max cutting feed** (Spindle and feed) | Gate 1: "Missing data" → no NC |
| **Safe Z retract method** (Post) | The post stops: "Post property is empty: safeRetract" |
| G53 safe Z (Post) | If you chose the G53 method, the post stops |
| Dwell (G04) address and unit (Post) | The post stops on an operation that needs a dwell |
| Cycle dwell address and unit (Post) | The post stops on a cycle with a dwell such as G82/G89 |
| Coolant codes: mist, air, through-spindle (Post) | The post stops on an operation that selects that coolant |
| G54.1 P range (Post) | If you use G54.1 Pn, the post stops |
| High-speed mode (G05 …) | May stay empty; if empty nothing is written |
| Magazine capacity | May stay empty; only the tool-number check is skipped |

Required empty fields on the Post tab are marked orange. Take the values **from the control manual or the machine project**; do not guess. A wrong G04 unit changes the dwell time by a factor of 1000.

**A axis**: **Rotation direction** (−X / +X) on the Axes tab is "which way a positive A angle rotates". The value in the template is **not verified on the machine** (Section 5.5 and 7).

### Adding your own machine

Mihenk ships no machine profile; you add your machine on this computer. There are two ways:

1. **Copy a template:** Manufacture → **Machine** → **Copy** on the template that fits → give a name → in the window that opens, fill in the fields (travel, spindle/feed, A axis, protected list, post properties) from your machine's documentation and click **OK**.
2. **Import from a file:** in the **Machine** window click **Import from file** → pick the `.json` machine file. If the file is damaged or a profile is invalid, that profile is not taken and the reason is reported; a profile whose id clashes gets a new id and " (2)" added to its name.

**Backup and moving:** the **Export** button on a row writes the profile to a JSON file in the `mihenk-machine` format. Keep that file as a backup, or restore it on another computer with **Import from file**. Machine profiles are not written into the document file, they are stored on this computer, so exporting a backup is recommended.

### 5.3 Protected T / H / D and WCS list

The **Protected** tab holds the numbers reserved on the machine for other jobs. If such a number is used for a tool or a work offset, **no NC is produced** (Gate 2).

In the generic templates the list is **empty**. If your machine has numbers reserved for other jobs, enter them in your own profile.

Rules:

- When you add a new tool, the program skips protected numbers and gives the first free one.
- In a new setup the work offset is the first G54–G59 that is not protected.
- You can also write G54.1 Pn in the list ("Other work offsets": separate with commas, example `G54.1 P1`).
- It is your responsibility that the list matches your shop's real situation. The template is only a starting value.

### 5.4 Tool library

The **Tools** command shows two scopes: **This document** and **Library**. A tool added to the document is copied, so the file is self-contained. The library stays on this computer.

- **New tool**, **Import**, **Export** (JSON). On a row: **Edit**, **Copy**, **Delete**, **Add to document** / **Save to library**.
- If you delete a tool used by an operation, that operation is left without a tool.

**Tool types**: End mill (flat), Ball mill, Bull-nose mill, Drill, Spot drill, Tap, Chamfer mill, Face mill, Reamer, Boring bar.

**General tab**: Name, Type, **Tool number (T)**, **Length offset (H)**, **Diameter offset (D)** (needed only for wear compensation), Material, Note.

**Geometry tab**:

| Field | Meaning |
|---|---|
| Diameter | Cutter diameter |
| Corner radius | For a bull-nose mill |
| Tip angle | Drill, spot drill, chamfer mill |
| Thread pitch | Required for a tap |
| **Flute length** | Cutting length of the cutter. One pass depth cannot exceed it. |
| **Stick-out from holder** | Total length sticking out of the holder. The tool cannot go deeper than this. |
| Shank diameter | If empty, the cutter diameter is used |
| Number of flutes | |
| **Center cutting** | See below |
| Holder diameter / length | Needed for holder collision checks in the simulation |

**Center cutting (centerCutting)**:

- If on, the tool can plunge straight into material (a center-cutting end mill, a drill).
- **If off**, the tool cannot plunge straight. Giving the program such a tool for a plunge blocks the NC (Gate 4).
- On a newly created end mill, ball mill and bull-nose mill this box comes **off**. If your tool cuts at the center, tick it; if it does not, leave it off. Read the right answer from the catalog.

**Ramp angle**: To ramp or helix into material with a non-center-cutting tool, the tool must have a "maximum ramp angle" value. The tool editor's **Geometry** tab has a **Maximum ramp angle** field (0–90, in degrees), shown only when **Center cutting** is off. Enter the manufacturer's value; if left empty, ramp/helix entry with a non-center-cutting tool is blocked (Gate 4, Section 5.9) and no value is assumed. The value is saved with the tool and kept when you reopen it.

**Cutting data tab (Preset)**: Name, **Spindle speed**, **Cutting feed**, **Plunge feed**, Ramp feed, Step-down, Step-over, Coolant. Choosing a tool in an operation fills the speed and feeds from the preset.

> **Warning:** A preset newly added with **Add preset** comes with placeholder values (3000 rpm, 600 mm/min, 200 mm/min). They **do not represent your cutting data**. Type each preset's values yourself.

The program does **not recommend** cutting data.

### 5.5 Setup

A setup is a workholding: which body, where the zero is, what stock, which work offset. The **New setup** command opens the panel.

1. **Name**; **Bodies**: tick the bodies to machine (at least one).
2. **Coordinate system**:
   - **Z direction**: the direction the tool approaches the part. For top machining use **+Z (from top)**. Options: ±X, ±Y, ±Z.
   - **X direction**: a direction perpendicular to Z.
   - **Origin**: **Stock corner** (default, left-front-top), **Stock top center**, **Model origin**, **Point**.
3. **Work offset**: G54 … G59 or G54.1 (+ P number). If it is on the protected list the panel warns and no NC is produced.
4. **Stock**:
   - **Offset from model**: Side allowance (default 2), Top allowance (2), Bottom allowance (0).
   - **Box (size)**: Min / Max X, Y, Z (must contain the model).
   - **Cylinder (bar)**: Diameter, Length. The axis runs along X; the origin must be **Model origin** or **Point**.
   - If the stock does not contain the model you get "The stock does not contain the model".
5. **Rotary axis (A)**: see below.
6. **Clearance height** (default 10 mm): above the stock top. The larger of the operation's own clearance height and this one is used.

At the bottom of the panel a summary appears: "Setup resolved: Stock … mm · top face Z=… mm". If it cannot be resolved the reason is written in red. The setup frame (WCS axes) is drawn in the view; **compare it with where you will put the zero on the machine**.

#### 3+1 (A axis, GSA divider)

"3+1": the A axis turns the part to an angle and clamps it; cutting is done with 3 axes. There is **no** simultaneous 4-axis motion.

1. In the setup tick **Machine on the A axis (3+1)**. (If the selected machine has no A axis: "The selected machine has no A axis." Copy the "Generic 3+1 (A axis, Fanuc style)" template.)
2. Type the angle in degrees in the **A angle** box.
3. The coordinate system is defined **for A = 0**. Operations run at the angle you type.

**What does `aAngle` mean?** The A angle you enter is **the A word written to the NC itself** (the value before shortest-way normalization). For `A90` you type 90. The program does not flip the A sign internally. The physical rotation direction of the part is calculated from the **Rotation direction** (−X / +X) setting in the machine profile. If that direction is wrong, the toolpath goes to the opposite face.

What you need to know:

- **The A direction is not verified on the machine.** The NC header says `(WARNING A AXIS DIRECTION NOT VERIFIED - CONFIRM ON MACHINE WITH A MARKED PART BEFORE CUTTING)` and a gate warning is given. Do the confirmation in Section 7.3.
- The coordinate frame rotates **about the X line through the origin**. Your work zero (WCS) must be **on the A axis** on the machine. The program does not check this.
- If **Take the shortest way** is on in the profile (it is on in the Generic 3+1 template), the angle is normalized to 0–359.999 (example: A−90 → A270) and a 180° rotation is split into two steps.
- On a machine with a rotary axis the program writes A **absolutely** in the first section (the machine's A is unknown at the start) and returns A to 0 at the end of the program.
- Z retracts to the safe height before an A move.
- Side cutting and undercuts with A≠0 inside the same setup are **not** in the simulation (Section 7.4).

Example format (do not run): the A indexing line in the NC looks like this.

```
(EXAMPLE FORMAT - DO NOT RUN)
G0 A90.
```

### 5.6 Operations

Every operation uses the same panel with four tabs: **Tool**, **Geometry**, **Heights**, **Passes**. The **Compute toolpath** button at the bottom of the panel computes the path without saving the draft and shows the result ("Path computed · N moves · cutting … mm · rapid … mm · about … min"). Enter = OK, Esc = Cancel.

**Common: Tool tab**

- **Tool**: an unsuitable tool is labelled "(does not fit this operation)". For Face: face mill/end mill/bull-nose; for Contour and Pocket: end mill/bull-nose/ball; for drilling: drill, spot drill, tap, reamer, boring bar depending on the cycle.
- **Preset**: fills speed, feeds, passes and coolant; you can change them afterwards. If you change them by hand it shows "(manual)".
- **Spindle speed**, **Cutting feed**, **Plunge feed**, **Ramp feed** (if empty, the cutting feed is used), **Coolant**. Speed and feeds come **empty**; without a preset you must type them.
- If the machine's maximum speed is known, a warning appears when you exceed it.

**Common: Heights tab** (contour, pocket, face)

- **Clearance height** (default 5) and **Retract height** (default 2): mm above the stock top. Retract cannot be above the clearance height. The operation uses the larger of its own value and the setup's value.
- **Top** and **Bottom**: for each a **Reference** (Stock top, Model top, Selected geometry, Model bottom, Stock bottom, Absolute) and an **Offset** (mm; positive is up). With Absolute, Z is relative to the setup zero.
- Defaults: Face: Top = Stock top, Bottom = Model top; Contour and Pocket: Top = Stock top, Bottom = Selected geometry.

#### Face

Mills the top of the stock. You select no geometry; the area comes from the setup's stock. It works only with a **box stock** (error with a cylinder stock).

| Field | Tab | Meaning |
|---|---|---|
| Line direction | Geometry | Degrees from the X axis (direction of the zigzag lines) |
| Extra overtravel | Geometry | Extra distance the tool runs past the stock |
| Stepover | Passes | Must be smaller than the tool diameter |
| Stepdown | Passes | If empty, a single pass |
| Axial stock to leave | Passes | Material left on top |

#### Contour

Cuts a profile on the outside, inside or on the line.

**Geometry**: **Selection type**: **Face** (a flat face perpendicular to the tool axis; the face boundary is cut), **Sketch profile**, **Body outline**. Select by clicking in the view; the selected items are listed.

| Field | Options / meaning |
|---|---|
| **Cutting side** | Automatic (outside for an outer boundary, inside for a hole), Inside, Outside, On the line. An open chain only works On the line. |
| **Compensation** | **In computer**: the path includes the tool radius. **In control (wear, D)**: the path is the part contour and the control applies G41/G42; the tool's D number is needed. |
| **Cutting direction** | Climb / Conventional |

Passes tab:

| Field | Meaning |
|---|---|
| Stepdown | Each pass depth |
| Finishing stepdown | Optional |
| Radial / Axial stock to leave | Material left |
| Radial roughing passes | Extra passes away from the wall (Number of passes, Stepover). Cannot be used with control wear compensation. |
| **Plunge style** | Plunge or Ramp (needs an **Entry angle**: 0.1–45°). Plunge only with a center-cutting tool. |
| **Lead-in / Lead-out** | None / Arc (radius) / Line (length). With control wear compensation it must be a line longer than the tool radius. A ramp and lead-in/out cannot be used together. |
| **Tabs** | Leave tabs: Number of tabs, Tab width, Tab height. Keeps the part attached to the frame on the final depths. |

Some rules give errors: a boundary that crosses itself ("The boundary crosses itself"), a tool that does not fit ("The tool (Ø…) does not fit this contour"), two selected profiles at different heights ("The selected profiles are at different heights"), an inside corner narrower than the tool (a warning that material remains).

**Body outline** only works on a body with straight walls along the tool axis (prismatic). With slanted/curved walls, an outer chamfer/fillet or a horizontal cylinder it gives an error ("The body does not have straight walls along the tool axis"); select a face or a sketch instead.

#### Pocket

Clears a closed region (islands included).

**Geometry**: Face (the floor face of the pocket), Sketch profile or Body outline; **Cutting direction**. The floor faces in one pocket must be at the same height ("Floor faces in one pocket operation must be at the same height"); if not, make separate operations. A pocket with an open edge (a step open on one side) is supported; the tool runs out past the edge.

| Field | Meaning |
|---|---|
| Stepover | Smaller than the tool diameter |
| Stepdown | Each pass depth |
| Finishing stepdown | Optional |
| Radial / Axial stock to leave | Material left |
| **Entry type** | Helix / Ramp / Plunge. Default Ramp. Plunge only with a center-cutting tool. |
| **Entry angle** | **Required** for helix and ramp, 0.1–45°. It is not assumed; you type it. |
| **Helix diameter (tool center)** | Required for helix entry. If it does not fit the pocket the computation fails ("The helix entry does not fit"). |
| **Finishing pass** | If ticked, **Finishing stock** is required (smaller than the stepover). Roughing stays this far from the wall, the last pass cleans it. |

A pocket corner cannot be sharper than the tool radius: **material remains in the corner** and the program warns "About … mm² of the pocket cannot be machined". Fix it with a second operation using a smaller tool. A very high stepover (close to the diameter) also increases the corner remainder.

#### Drill

**Geometry**: the holes come **from the Hole features in the model** (Section 4.1). If the model has no holes you see "No holes in the model".

| Field | Meaning |
|---|---|
| **Cycle** | Drill, Peck drill, Chip break, Spot, Tap, Reaming, Boring |
| Filter by diameter / Filter by feature | Which holes to machine; the list is shown below |
| **Depth source** | **From the hole** or **Absolute Z** (relative to the setup zero) |
| **Add the drill tip length** | Goes deeper by the tip length so the full diameter reaches the hole bottom |
| **Break-through** | For through holes, extra mm below the model bottom (default 1) |
| **Peck depth** | Required for peck and chip break |
| **Dwell** (s) | Wait at the hole bottom; if empty none. The post's dwell address/unit must be filled. |
| **Hole order** | Model order / Shortest path |

Holes whose axis is not parallel to the tool axis are skipped in that setup (warning). If the hole diameter differs from the tool diameter you get a warning. Holes with the same top/bottom height are written in one cycle.

On a hole that goes all the way through, the tool goes below the model bottom. Because the program **does not model the table or fixture**, putting a sacrificial plate (or a gap) underneath is your responsibility (Section 7.4).

#### Thread

Tapping cycle: the **Thread** command opens the same panel as Drill with the "Tap" cycle. The tool type must be **Tap** and the **Thread pitch** must be entered. The feed is calculated automatically; in the M80V template the synchronous tapping feed is written as feed = pitch. If the hole has no thread data you get a warning ("holes have no thread data"); if the pitch does not match you get a warning.

#### Not available

**Adaptive** clearing and **3D surfacing** do not exist in this version; they are greyed out in the ribbon.

### 5.7 Generating toolpaths

- **Compute toolpath** (ribbon): computes the toolpath of all operations. Operations that cannot be computed are listed ("Operations that could not be computed"); clicking a row opens the operation.
- The computed path is drawn in colours in the view: **Rapid**, **Cutting**, **Lead in/out**. **Show toolpath** at the bottom bar can hide it.
- When the model, tool, machine or operation changes the badge becomes **Stale** and the path disappears from the view. Compute again.
- Error messages tell you what to do (Section 8).

### 5.8 Simulation

**Simulate**: recomputes stale operations, runs the gates and plays the toolpath on the stock. The bottom bar has: **Play / Pause**, **Step forward**, **Step back**, **Playback speed** (×1 … ×500), a slider, "Removed … cm³", **Holder** show/hide, **Issues (N)**, **Close simulation**.

- In the view the stock is drawn as a height mesh and is cut away; the tool and holder are shown.
- In the **Issues** list a red row blocks the NC. Clicking a row takes the simulation to that move or opens the operation.
- The resolution is automatic and cannot be coarser than the smallest tool radius. If the cell count becomes too large (large stock, small tool) the gate blocks the NC; there is no silent coarse resolution.
- The simulation runs in the main process; with a big program the interface may freeze for a moment.

**What the simulation cannot see is in Section 7.4. Read it.**

### 5.9 Safety gates

The **Post process** button first runs all the gates. If there is a **block** (red), **no NC is produced**. A **warning** (yellow) does not stop the NC but is written to the NC header and to the list. In the issue list, clicking a row opens the related operation.

| Gate | What it checks | Level | What to do |
|---|---|---|---|
| **1. Missing data** | Tool number, H, D for wear compensation, speed, feed, work offset; empty required fields in the machine profile (max speed, max cutting feed, travels). An invalid machine profile. "Missing data: …" | **Block** | Fill the field. Take machine fields from the machine project. |
| **2. Protected number** | Whether T, H, D and work offset are on the protected list (spacing/letter case differences do not matter). "… is on the protected list" | **Block** | Choose another number. Review the list as in 5.3. |
| **3. Limits** | Speed > max speed; speed < min speed (at least 1 rpm); feed > max feed; tool number > magazine capacity; toolpath span > axis travel | **Block** | Lower the value or fix the profile. |
| 3b. Absolute travel | The setup's position on the machine was not given, so absolute travel could not be checked; only the toolpath span was checked ("… absolute travel could not be checked") | Warning | Check the part position on the machine and the travel **yourself**. |
| **4. Plunge and length** | A non-center-cutting tool plunging straight into material, or a drilling cycle; ramp/helix angle above the tool's maximum ramp angle or that value undefined (the field is **Maximum ramp angle** in the tool editor; empty blocks); one pass depth exceeding the flute length; reach depth exceeding the "Stick-out from holder" (the holder would hit the stock). Tap, reamer and boring bar are exempt (they enter a pre-drilled hole). | **Block** | Use a center-cutting tool, helix/ramp, a smaller stepdown or a longer stick-out. |
| **5. Simulation** | Rapid move enters the stock; **gouge** (the tool goes below the model surface); cutting deeper than the flute length; shaft or holder hits the stock; going below the stock bottom (except declared through cuts and holes); compensated arc radius smaller than the tool; model height map could not be obtained; resolution coarser than the smallest tool radius; simulation did not run | **Block** | Click the row to see the move. Fix the operation (heights, entry, tool). |
| 5b. Lateral resolution | The simulation cannot see side gouges smaller than half the cell spacing ("… cannot see side gouges smaller than … mm"). Written on every simulation. | Warning | Read Section 7.4; wall accuracy comes from the toolpath calculation. |
| **6. Rotary axis** | The setup asks for A but the machine has no A axis; A angle outside the machine limits | **Block** | Fix the profile or the angle. |
| 6b. A direction | "A axis direction … is not verified on the machine" (always when 3+1 is used) | Warning | **Confirm the A direction with a marked part.** Section 7.3. |
| Operation warnings | Remaining pocket material, break-through floor allowance, hole diameter mismatch, material left in inside corners, etc. | Warning | Read the message; add a second operation if needed. |
| Operation not computed | "Operation … could not be computed" | **Block** | Fix the error in the operation. |

In addition, if the machine profile has empty post properties (such as the G04 address or the Z retract method), Post lists **all of them in one list** and generates no NC; clicking a row opens the machine manager (the "Missing values" column counts them too). The post itself can also stop: if a property that is needed is empty, "Post property is empty"; if a gate blocks, "Safety gates block this program"; if the speed rounds to S0, "would be written as S0".

**The gates do not decide for you.** No block does not mean the NC is safe (Section 7).

### 5.10 NC preview, saving, the verification declaration

If there are no blocks, **Post process** produces the NC and opens the **NC code** window:

- At the top the **"Post processor is UNVERIFIED"** notice: "This output has not been tried on a real machine. Do a dry run before use and watch the first part in single-block."
- **NC lines**: clicking a line highlights the matching move in the view. Arrow keys move through the lines.
- **Program number** (1–99999999, default 1000): change it and click **Regenerate**. The program name is derived from the file name (upper case, up to 24 characters).
- If the document changed after the NC was produced you see "The document changed after this NC was produced. Run "Post" again before saving." and **Save (.nc)** is disabled.
- **Save (.nc)**: saves as an `.nc` file.

The NC header contains these (example format, do not run):

```
(UNVERIFIED POST - DOGRULANMADI - MIHENK x.y.z)
(WARNING: <readable gate warning>)
```

The comments in the header are ASCII (no Turkish characters).

**Verification declaration**: the **Post: UNVERIFIED** button in the status bar opens a window. If you fill in **Checked by**, **Date**, **What did you check?** and the box "I checked this NC myself", then click **Mark as verified**, the declaration is written into the document and `(VERIFIED BY … ON …)` is added to the NC header.

This declaration is **not a software verification**; it is a record of your own check. If the document changes the declaration **lapses** ("The earlier verification lapsed"). The "Post processor is UNVERIFIED" notice does not go away with the declaration; it is permanent.

---

## 6. Worked example: a block with a pocket and holes

Part: 100 × 60 × 20 mm aluminium block. A 60 × 30 mm, 8 mm deep pocket on top. Four Ø6.6 mm through holes at the corners. 3 axes, one setup, work zero at the top left front corner.

> The numbers are examples. **This manual gives no cutting data (speed, feed)**; type your own. Take the machine fields from your machine project. T numbers on your screen may differ.

### 6.1 Design

1. **Design** tab → **Sketch** → **XY (Top)** plane.
2. With **Rectangle** draw a rectangle from the origin (the snap shows "Origin"). With **Dimension** give 100 to the horizontal edge and 60 to the vertical edge. **Finish Sketch**.
3. **Extrude** → Profiles: all → Operation: **New body** → Distance 20 → Enter. The block appears.
4. **Sketch** → click the **top face** of the block. With **Project** (J) add the edges of the top face as fixed construction geometry (Source: "Edges in the plane", **Apply**). Draw a **Rectangle**; with **Dimension** give width 60, height 30. To position it, give 20 between the rectangle's lower-left corner and the projected left edge, and 15 to the bottom edge (the Dimension tool gives point-to-line distance when you pick a point + a line). **Finish Sketch**.
5. **Extrude** → Operation: **Cut** → Distance 8 → Enter. The pocket appears (floor face at Z = 12).
6. **Sketch** → the top face again. Add the edges with **Project**. Place one point with the **Point** tool; dimension it 10 mm from the left edge and 10 mm from the bottom edge. Then select the point with **Rect pattern**: Count (direction 1) 2, Step (direction 1) 80, Count (direction 2) 2, Step (direction 2) 40, **Apply**. The four points (10,10), (90,10), (10,50), (90,50) result and lie outside the pocket. (If the pattern does not copy the point, dimension the four points one by one.) **Finish Sketch**.
7. **Hole**: Sketch = the points sketch, Type = **Simple**, Diameter = 6.6, Extent = **All (through)** → Enter.
8. Check the body with **Properties**; Save (Ctrl+S): `block.mhnk`.

To avoid measuring mistakes, check the pocket floor and the hole positions once with **Measure**.

### 6.2 Machine profile

1. **Manufacture** tab → **Machine**.
2. On the row **Generic 3-axis (Fanuc style)** click **Copy** (for a job with an A axis use **Generic 3+1**); give a name (example `My machine`). If you have a machine file, **Import from file** also works. The edit window opens.
3. **Spindle and feed**: type **Max spindle speed** and **Max cutting feed** from your machine documents.
4. **Post**: choose **Safe Z retract method** according to your machine project's decision (G28 or G53; for G53 also write the machine Z). In this example dwell (G04) and G54.1 are not used, so those fields may stay empty.
5. Review the **Protected** tab (enter the T/H/D numbers and work offsets reserved on your machine, if any).
6. **OK**. In the list choose the mark next to your own profile → **Close**.

### 6.3 Tools

**Tools** → **New tool**:

- **Tool 1**: Type **End mill (flat)**, Diameter 10, Flute length 25, Stick-out from holder 45, **Center cutting: ticked** (if the catalog agrees), enter Holder diameter/length. The program gives the T number. On the **Cutting data** tab click **Add preset** and type **your own** speed/feed values.
- **Tool 2**: Type **Drill**, Diameter 6.6, tip angle 118°, Flute length 40, Stick-out from holder 60. The T number becomes 4 (3 is protected). Add a **preset** and type your own values.

### 6.4 Setup

1. **New setup**. Name: `Top`.
2. **Bodies**: tick the block.
3. Z direction **+Z (from top)**, X direction **+X (from right)**, Origin **Stock corner** (Left, Front, Top).
4. Work offset: the panel selects **G55** by default (G54 is protected). Remember you will set this zero on the machine for this workholding.
5. Stock: **Offset from model**, side 2, top 2, bottom 0. Machine on the A axis: **off**.
6. Check the summary line: "Stock 104 × 64 × 22 mm". **OK**.

### 6.5 Operations

1. **Face**: Tool 1. Choose the preset or type speed/feed. Passes: **Stepover** 6 (smaller than the diameter), **Stepdown** empty (single pass, 2 mm). **OK**.
2. **Pocket**: Tool 1. Geometry → **Face** → click the pocket's **floor face** in the view. **Cutting direction** Climb. Passes: **Stepover** 4, **Stepdown** 3, **Entry type** Ramp, **Entry angle** 2 (your own choice); if you want a finishing pass tick **Finishing pass** and type **Finishing stock** 0.2. Click **Compute toolpath**: "Path computed". In square inside corners a Ø10 tool leaves a corner radius of 5; the program may report it with "About … mm² of the pocket cannot be machined". If you want sharp corners, add a second pocket operation with a smaller tool (Section 5.6). **OK**.
3. **Drill**: Tool 2, **Cycle**: Drill (or Peck drill, by typing a **Peck depth**). Depth source **From the hole**. The hole list should show 4 holes. **OK**.

### 6.6 Compute, simulate, post

1. **Compute toolpath**: all of them should get the **Done** badge.
2. **Simulate**: **Play**. Watch the stock being cut in the pocket and the holes. **Issues** should be zero. If a "below the stock bottom" warning appears for the through holes, it is a warning because the hole is a declared through cut; make sure a plate is underneath.
3. **Post process**: If a block appears read the list (most common: empty max speed, empty safe Z method). Fix it and run **Post process** again.
4. In the **NC code** window click lines and follow the moves in the view. See that the header says UNVERIFIED.
5. **Save (.nc)**.

### 6.7 Before going to the machine

- Read the NC: tool order, speeds, feeds, zero (G55), Z heights.
- Do the dry run and first-part steps with **the procedure in the machine project**. This program does not contain that procedure.
- If you have verified it, save your declaration from the **Post: UNVERIFIED** button.

---

## 7. SAFETY

This is the most important section of the manual.

### 7.1 NC output is UNVERIFIED

- The first line of every NC file is `(UNVERIFIED POST - DOGRULANMADI - MIHENK …)`. Do not delete it.
- The post processor was written for the Mitsubishi M80V and has **not been tried on the real machine**. Some post values are unknown and are left empty on purpose (Section 5.2).
- The program does not check the NC against machine rules. It only tests its **own internal consistency**: it reads the NC back and checks it gives the same moves, and it runs a stock simulation.
- The "verified" declaration is your declaration; it is not a software verification.

### 7.2 The first run on the machine is not this program's job

Dry run, single block, first part, tool-length measurement and work-zero measurement are done **in the machine project**. Mihenk does not replace them. The program only says "do a dry run, watch the first part in single block".

### 7.3 Confirm the A direction with a marked part

In a 3+1 NC the direction in which the `A` word turns the part is calculated from the **Rotation direction** setting in the machine profile. The direction in the template is **not verified** on your machine; confirm the direction in your own profile on your machine. If it is wrong the toolpath goes to the **wrong face** of the part. (A similar sign error was found and fixed in the verification work; but because the direction in the profile has not been confirmed on the machine, the same kind of risk remains.)

Confirmation (short summary; the detailed procedure is in the machine project):

1. Mark one face of a part (for example with paint or a clear notch).
2. Clamp the part, and with the tool clear, give a small positive A move by hand and watch which way the marked face turns.
3. Compare with the **Rotation direction** setting in Mihenk. If they differ, fix the profile and produce the NC again.
4. Always try a 3+1 NC the first time with the marked part and as a dry run.

Also: your WCS zero must be **on the A axis** on the machine (Section 5.5). The program does not check this.

### 7.4 What the simulation cannot see

The simulation is a single-valued height map seen **only from above (Z)**. It **does not see**, or sees only to a limit:

| Topic | Status |
|---|---|
| **Sub-resolution side gouging** | Side gouges smaller than half the cell spacing are not seen (at 0.5 mm resolution 0.05–0.2 mm, at 1.3 mm resolution up to 1 mm were missed). This notice is written on every simulation. Wall accuracy comes from the toolpath calculation, not from the simulation. This limit is **deferred**, not closed. |
| **Undercuts / cutting from the side** | None. Parts with undercuts and slanted walls are not shown correctly. |
| **Side cutting with A≠0 inside the same setup** | None. |
| **Fixture, vise, table, tailstock** | **Not modeled.** The simulation cannot see the tool hitting them. Going below the stock bottom is treated as a block, but objects outside the stock, such as vise jaws or clamping feet, do not exist. |
| **Holder** | Modeled only as a cylinder. |
| **Cylinder stock** | Approximated as a box in the simulation. |
| **Rapid moves** | Checked by cell-center sampling. |
| **Stock display** | Only the top surface is shown (no side walls). |
| **Tool length / flute length** | Known only as far as the values you enter; if they are wrong, the check is wrong too. |

Known and **deferred** findings (CAM-VERIFY / CAM-FIXES):

- **Lateral gouge resolution** (V-24): the table above.
- **Pocket corner remainder** (V-28): at a high stepover an unmachined area can remain between ring corners. The program reports it with the "About … mm² of the pocket cannot be machined" and "cannot be reached" warnings but does not produce a corner cleanup move.
- **Pocket / inside contour cutting direction** (V-29): in pockets and inside contours a very small part of the wall samples (especially in star/dumbbell shapes) came out opposite to the requested climb/conventional direction. The cause was not investigated. **Read the NC on jobs where surface quality matters.**
- **Program number** (V-21): reserved program-number ranges such as O8000/O9000 are not checked.
- **Line number** (V-22): N numbers wrap around when they exceed 99999 (with a warning); this limit has not been confirmed on the M80V.

### 7.5 Not verified (machine behaviour)

The following cannot be tested by software; they must be confirmed in the machine project with a marked part:

- The A direction and the physical meaning of the A word
- The safe Z retract method (G28 / G53)
- The G04 address and unit
- N and O number limits, reserved program ranges (8000/9000)
- The G05 P10000 output
- Coolant codes: mist, air, through-spindle
- Whether D holds the radius or only the wear value under wear compensation

### 7.6 Known limits and gaps

An honest list. What is **missing or incomplete** in this version:

**CAM**
- No adaptive clearing and no 3D surfacing (shown as "coming soon" in the ribbon).
- No 4th / 5th axis machines ("coming soon"). Only **3+1** exists; there is **no simultaneous 4-axis**, no TCP/G68.2/G07.1.
- No "select from face" for the axis direction in the setup panel (only the main axes ±X, ±Y, ±Z); the core supports it.
- Giving drill points from a sketch (`points`) and selecting an open-chain contour are not in the interface. (Holes come only from the Hole feature.)
- No helix plunge for contours; no "pre-drill" entry for pockets.
- An open-chain contour works only "On the line"; no lead-in/out, tabs or wear. Under wear compensation there are no radial roughing passes, ramps or split contours.
- Body outline works only on prismatic bodies.
- Sketch profiles may use only lines/arcs/circles. An ellipse or spline profile gives an error in the toolpath ("This curve type … cannot be used in the toolpath").
- A sketch selection must be on a plane perpendicular to the tool axis.
- Absolute travel cannot be checked because the part position on the machine is not entered.
- No fixture/vise/table collision.
- The stock mesh shows only the top surface.
- The simulation runs in the main thread; with a big program the interface may freeze for a moment (not measured).
- Saving NC from a real Electron window was not tried by hand.
- No drawings, no assembly.

**CAD**
- No sweep, loft, draft or modeled threads. No assembly.
- Shell can fail on a body with filleted edges.
- Chamfer (Sketch) adds no dimension constraint. No spline tangency and no ellipse–circle tangency.
- Imported STEP/STL cannot be edited.

**General**
- The installer was built on Linux; in this version opening on Windows, the icon, the `.mhnk` association and the copying of old settings were **not verified on real Windows**.
- In sketch mode the left browser shows the model tree (no "Sketch contents" list).
- Recovery comes as a modal confirmation rather than a warning on the welcome screen.
- Some interface texts still mix "Sketch" and "Eskiz" (in the Turkish interface).

### 7.7 Last word

The software aims to give you a safe NC: "either a right result or a clear error". But an aim is not a guarantee. Do not release an NC to production without reading it, dry running it and watching the first part.

---

## 8. Troubleshooting

Message texts are the English texts in the program. In place of `{...}` you see a number or name.

### 8.1 Installation and files

| Message | Meaning | What to do |
|---|---|---|
| Windows protected your PC (SmartScreen) | The installer is unsigned. | Verify the SHA-256 (1.1). If correct, **More info → Run anyway**. |
| This file could not be read: it is not a Mihenk document or it is damaged. | The file is not `.mhnk` or is damaged. | Try the `.bak` file. |
| This document was saved with a newer version; some features may be missing. | The document was written by a newer Mihenk. | Install the newer version. |
| The document contains a value that is too long / has too many items / The file is too large (at most 200 MB) | The file exceeds the safety limits or is damaged. | Check where the file came from. |
| The data of import "…" is corrupt (checksum does not match). | The imported STEP/STL data is damaged. | Import the file again. |
| Could not save: … Try saving to a different location. | Write permission or disk problem. | Choose another folder/drive. |
| Recovery file found | A previous session did not close cleanly. | **Recover**, then save at once. |

### 8.2 Sketch and model

| Message | Meaning | What to do |
|---|---|---|
| This … conflicts with the existing constraints and was not added. Delete the conflicting constraint or enter a different value. | The dimension/constraint you tried to add conflicts with earlier ones. | Delete the conflicting constraint or change the value. |
| This … is already defined by other constraints (redundant) and was not added. | The object is already fully defined. | No constraint is needed. |
| Sketch could not be solved | The constraints cannot be solved. | Undo (Ctrl+Z) the last constraint you added. |
| The profile intersects itself or lines cross without being split | Lines cross. | Fix with **Trim** or **Break**. |
| The sketch has … duplicated overlapping element(s); delete them | The same line was drawn twice. | Delete the extra. |
| The profile has a very short edge | A very short line is left. | Delete the short line. |
| There is no closed profile in the sketch | The drawing is not closed. | Join the open ends. |
| The selected profile no longer exists (the sketch changed); edit the feature and pick the profile again | The profile was lost when the sketch changed. | Edit the Extrude and pick the profile again. |
| The selected face was lost when the model changed; edit the feature and select it again | The Fillet/Chamfer/Shell selection is invalid. | Edit the feature and select again. |
| Fillet failed: the value may be too large for these edges | | Reduce the value. |
| Shell failed … | | Reduce the thickness or apply the shell before the fillet. |
| The profile crosses the revolve axis | The Revolve profile is on both sides of the axis. | Keep the profile on one side of the axis. |
| … hole position(s) do not touch material | The hole position/direction is wrong. | Fix the position or direction. |
| Draw a sketch first … | No sketch exists for Extrude/Hole. | Draw and finish a sketch. |

### 8.3 Manufacture: calculation and post

| Message | Meaning | What to do |
|---|---|---|
| No machine profile is selected. Pick a machine in the browser. / Machine profile not found. | The document's machine does not exist on this computer. | **Machine** → choose a profile. |
| Missing data: {field}. No NC is generated until it is entered. | Gate 1. A field is empty. `machine.spindle.maxRpm` → max spindle speed; `machine.feed.maxCut` → max cutting feed. | Fill the field in the machine profile. |
| Post property is empty: {property}. Fill this value in the machine profile from the machine manual; it is never guessed. | The post does not know a value (example `safeRetract`). | Fill it on Machine → Post tab. |
| Safety gates block this program … | One or more blocks exist. | Read the issue list. |
| {T}{n} is on the protected list (existing job). Choose another number. | Gate 2. | Change the tool/H/D/work offset number. |
| Spindle speed ({}) exceeds the machine maximum ({}). | Gate 3. | Lower the speed. |
| Feed (… mm/min) exceeds the machine limit. | Gate 3. | Lower the feed. |
| T{n} is not center cutting but plunges straight into material. Use helix or ramp entry. | Gate 4. | A center-cutting tool or a ramp. |
| T{n} is not center cutting and ramps/helixes into material, but the tool has no maximum ramp angle. | Gate 4; the tool's **Maximum ramp angle** is empty. | Enter the manufacturer's value in the tool editor, or use a center-cutting tool. |
| T{n} is not center cutting and ramps at {a}°, above its maximum ramp angle ({b}°). | Gate 4. | Reduce the angle. |
| A pass depth (…) exceeds the flute length (…). Reduce the stepdown. | Gate 4. | Reduce the stepdown or check the Flute length. |
| The tool stick-out (…) is too short for this depth (…): the holder would hit the stock. | Gate 4. | A longer stick-out. |
| Toolpath span on {axis} … exceeds the machine travel … | Gate 3. | Make the part/setup smaller or split it. |
| No machine position for "…": absolute travel could not be checked. | Warning. | Check the travel yourself. |
| No model height map for "…": gouges cannot be checked. No NC is generated. | Gate 5. | Recompute the model; report it if it continues. |
| Simulation resolution … is coarser than the smallest tool radius … | Gate 5. | The stock is too large or the tool too small; make the stock smaller. |
| Rapid move enters the stock (…) | A rapid passes through material. | Increase the clearance/retract height. |
| Tool cuts below the model surface: gouge (…) | The toolpath gouges the model. | Check the operation's height, stock-to-leave and side settings. |
| Cutting deeper than the flute length (…) | | Stepdown / tool. |
| The tool shaft hits the stock / The holder hits the stock (…) | The stick-out is not enough. | A longer stick-out, a smaller depth. |
| The tool goes below the stock bottom (…) | Going below the stock bottom. | Fix the Bottom height. If a through hole/cut is intended, check the "Bottom" value or the hole break-through. |
| The compensated arc radius is smaller than the tool radius (…) | Wear compensation. | Compensation in computer, or a smaller tool. |
| A angle ({a}°) is outside the machine limits. | Gate 6. | Fix the angle or the profile limit. |
| This setup asks for the A axis but the machine profile has no rotary axis. | | Choose a profile with an A axis. |
| The selected face is not flat or not perpendicular to the tool axis. | The face is slanted/curved. | Pick a flat face perpendicular to the tool axis. |
| The tool (Ø…) does not fit this pocket/contour. Choose a smaller tool. | | A smaller tool. |
| The helix entry does not fit (needs Ø…, available Ø…) | | Reduce the helix diameter or choose ramp. |
| About … mm² of the pocket cannot be machined | Tight corners. | A second operation with a smaller tool. |
| Part of the pocket cannot be reached by the tool | | A separate operation with a smaller tool. |
| The boundary crosses itself; the region is ambiguous. | The sketch/face crosses itself. | Fix the sketch. |
| Missing data in operation "…": {field} | Speed, feed, entry angle, etc. empty. | Fill the field in the operation panel. |
| Stepover (… mm) must be smaller than the tool diameter (Ø…). | | Reduce the stepover. |
| No holes to drill in this setup … | The hole selection is empty. | Add a Hole feature to the model; check the filters. |
| The stock does not contain the model. | | Enlarge the stock. |
| The body does not have straight walls along the tool axis … | "Body outline" is not prismatic. | Select a face or a sketch. |
| Top of cut (…) must be below the retract plane (…). | The height order is wrong. | Fix the Top or clearance height. |
| Spindle speed … would be written as S0 | Speed below 1. | Raise the speed. |
| NC line …: … (reader errors) | The internal consistency check saw something it does not recognize in the NC. | Report it; do not use the NC. |
| Toolpath data is invalid / Internal error: the toolpath produced is invalid | Internal error. | Recompute; report it if it continues. |

### 8.4 General

- The 3D view does not start ("The 3D view could not start"): update your graphics driver.
- "The geometry kernel could not be loaded": close the program and open it again.
- "The geometry kernel stopped unexpectedly and was restarted": try the operation again.
- If a calculation takes long you can press **Cancel** in the status bar; the result is marked "out of date".
- For a damaged `.mhnk` open the `.bak` file next to it.

---

## 9. Shortcuts

### General

| Key | Action |
|---|---|
| Ctrl+N | New |
| Ctrl+O | Open |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save As |
| Ctrl+Z / Ctrl+Y | Undo / Redo (Ctrl+Shift+Z also redoes) |
| Ctrl+K | Search commands |
| Ctrl+, | Settings |
| F | Fit the view |
| Enter / Esc | OK / Cancel in the panel |
| Double-click | Edit in the timeline |
| Right-click | Timeline menu |

### 3D view

| Action | What it does |
|---|---|
| Right button drag | Rotate |
| Middle button drag | Pan |
| Wheel | Zoom |

### Sketch

| Key | Command |
|---|---|
| L | Line (in a chain, A: tangent arc, L: line) |
| R / Shift+R | Rectangle / Center rect |
| C / Shift+C | Circle / 3-pt circle |
| A / Shift+A | Arc / 3-pt arc |
| P | Point |
| D | Dimension |
| T | Trim |
| X | Extend |
| K | Break |
| O | Offset |
| Q | Fillet |
| W | Chamfer |
| M | Mirror |
| G | Polygon |
| U | Slot |
| Y | Ellipse |
| B | Spline |
| J | Project |
| Ctrl+A | Select all |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / Cut / Paste |
| Delete (or Backspace) | Delete the selection |
| Esc | Closes the open tool / dialog / selection |
| Enter | Finishes the spline; Next in Mirror |
| Tab | Next field in numeric entry |
| Ctrl (held) | Turns off grid snapping |

A tool's tooltip (hold the mouse over it) also shows its shortcut.

### Manufacture

Manufacture commands have no key shortcuts. Run them from Ctrl+K by typing their name (example: "Post process"). In the NC list the Up/Down arrow keys move through the lines.
