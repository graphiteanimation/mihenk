// WP-18 (K-029): multi-axis groundwork and 3+2 positional machining texts (English). Key set identical to cam-5x-tr.js.
export default {
  "cam.machine.generic5ac": "Generic 3+2 table-table A/C",
  "cam.machine.generic5bc": "Generic 3+2 table-table B/C",
  "err.cam.kin.tilt_with_rotary": "A setup cannot use both a 3+1 rotary angle and a 3+2 tilt. Turn one off.",
  "err.cam.kin.tilt_cyl_stock": "Round stock cannot be used in a tilted (3+2) setup. Choose box stock.",
  "err.cam.kin.unreachable": "Tool axis ({axis}) cannot be reached with this machine's rotary axes. Check the direction or the machine kinematics.",
  "err.cam.kin.limits": "Required rotary angles ({angles}) are outside the machine limits ({limits}).",
  "err.cam.kin.no_rotary": "The machine profile has no rotary axis for a tilted (3+2) setup.",
  "err.cam.kin.axis_missing": "The machine profile has no {axis} rotary axis.",
  "err.cam.kin.bad_vector": "Tool axis is not a unit vector.",
  "err.cam.gate.no_rotary_axis": "This setup needs rotary axis {axis} but the machine profile has none.",
  "err.cam.gate.rot_limit": "{axis} angle ({a}°) is outside the machine limits ({min}°…{max}°).",
  "err.cam.gate.unwound_head": "Unwound 3+2 output is not supported with a head rotary axis (no pivot/RTCP). Choose tilted plane output.",
  "err.cam.post.tilt_needs_nc_rotary": "Tilted (3+2) setups need NC rotary axes (manual indexing mode is not supported).",
};
