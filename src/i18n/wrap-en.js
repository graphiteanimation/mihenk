// WP-16 4th-axis wrap texts (English). Key set must match wrap-tr.js exactly.
export default {
  "err.cam.ir.a_without_wrap": "Toolpath move {move}: an A value is only allowed in a wrap (simultaneous X/A) toolpath.",
  "err.cam.ir.wrap_move": "Toolpath move {move}: a wrap toolpath cannot contain a '{t}' move (arcs are split into lines, no compensation).",
  "err.cam.post.wrap_a_format": "No A word format could be chosen for wrapping: the machine profile A format is '{wrap}'. Set the post property wrapAWord to 'continuous' or 'shortest'.",
  "err.cam.post.wrap_needs_nc_a": "Wrapping (simultaneous X/A) needs an A axis in the NC: the machine profile has no A axis or the rotary mode is '6b' (manual index).",
  "err.cam.post.wrap_inch": "Wrap operations are not supported with inch (G20) output; choose mm.",
  "err.cam.post.wrap_move": "Post internal error: unexpected wrap move.",
  "err.cam.post.inverse_feed_range": "Inverse time feed (G93) is too small to write with these decimals (1/min {f}); increase the post property inverseFeedDecimals.",
  "err.cam.post.read_inverse_arc": "NC line {line}: only G1 is read in G93 (inverse time) mode.",
};
