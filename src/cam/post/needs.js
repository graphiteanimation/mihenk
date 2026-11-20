// M-03: programin GERCEKTEN kullandigi ama makine profilinde bos (null) post ozellikleri.
// Post motoru ozellikleri tembel ister (need / prop_missing); burada post kuru calistirilir: eksik ozellik bulununca
// yalniz bu deneme icin yer tutucu deger konup yeniden denenir, boylece TUM eksikler tek listede toplanir.
// Yer tutucular hicbir NC'ye girmez (cikti atilir). Kullanilmayan ozelligin boslugu listeye girmez.
import { runPost, resolveProps } from './engine.js';
import { getPost } from './registry.js';

// yer tutucu: yalniz bicim gecerli olsun diye (deger dogrulanmis degildir, NC'ye yazilmaz)
const STAND_IN = { dwellAddress: 'P', dwellUnit: 'ms', cycleDwellAddress: 'P', cycleDwellUnit: 'ms', g541Range: [-1e9, 1e9], safeRetract: 'G28', safeRetractZ: 0, highSpeedOn: 'G4P0', highSpeedOff: 'G4P0', coolantCodes: {} };

// -> { missing: [prop], complete: bool, error? }  complete=false: kuru calisma baska bir nedenle durdu (error) ya da
// yer tutucusu olmayan bir alan eksik (ornegin machine.axes.A.dir); o alan da listededir.
export function postPropsMissing(program, machine) {
  const post = getPost(machine?.control);
  const over = {}; const missing = [];
  for (let n = 0; n < 50; n++) {
    try { runPost(post, program, machine, { props: over, gates: [], date: 'x' }); return { missing, complete: true }; }
    catch (e) {
      if (e?.code !== 'cam.post.prop_missing') return { missing, complete: false, error: { code: e?.code || 'internal', params: e?.params || {} } };
      const p = e.params?.prop; if (!p || missing.includes(p)) return { missing, complete: false };
      missing.push(p);
      if (p.startsWith('coolantCodes.')) { const cur = { ...(resolveProps(post, machine, over).coolantCodes || {}) }; cur[p.slice(13)] = 'M9'; over.coolantCodes = cur; }
      else if (p in STAND_IN && p in post.defaultProps) over[p] = STAND_IN[p];
      else return { missing, complete: false };
    }
  }
  return { missing, complete: false };
}
