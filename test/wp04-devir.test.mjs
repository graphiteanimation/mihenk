// WP-04 dilim 5 devir kalemleri: '' bos sayilir; kilavuz rigidTapM bos denetimi; signed modda A siniri yazilan aciya bakar.
import { postProgram, postPropsMissing } from '../src/cam/post/index.js';
import { gates } from '../src/cam/gates.js';
import * as S from './cam-samples/samples.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const throwsCode = (fn, code, msg) => { try { fn(); ok(false, msg + ' (hata beklenirdi)'); } catch (e) { ok(e.code === code, `${msg}: ${e.code}`); } };
const OPTS = { date: '2026-01-01', appVersion: '0.2.0', gates: [] };
const hasGate = (prog, m, prop) => gates(prog, m, { sim: false }).some((g) => g.code === 'cam.gate.post_prop_missing' && g.level === 'block' && g.params.prop === prop);

console.log("1. '' (bos metin) bos sayilir");
{
  const surf = S.surfaceSample().program;
  for (const k of ['endCode', 'toolChangeCode']) {
    for (const v of ['', '  ']) {
      const m = S.testMachine({ props: { [k]: v } });
      ok(postPropsMissing(surf, m).missing.includes(k), `${k}='${v}' -> eksik`);
      ok(hasGate(surf, m, k), `${k}='${v}' -> kapi engeli`);
      throwsCode(() => postProgram(surf, m, OPTS), 'cam.post.prop_missing', `${k}='${v}' -> post durur`);
    }
  }
  const dr = S.drillSample().program;
  const m1 = S.testMachine({ props: { coolantCodes: { flood: '', off: 'M9' } } });
  ok(postPropsMissing(dr, m1).missing.includes('coolantCodes.flood'), "sogutma kodu '' -> eksik");
}

const fm = (v) => S.testMachine({ control: 'fanuc-generic', props: { tapMode: 'feed', rigidTapM: v } });
console.log('2. kilavuz programinda rigidTapM bos denetimi (tapMode feed)');
{
  const d = S.drillSample().program;
  const tap = d.sections.find((x) => x.toolpath.moves.some((m) => m.t === 'cycle' && m.cycle === 'tap'));
  const prog = { ...d, sections: [tap] };
  for (const v of [null, '']) {
    const m = fm(v);
    ok(postPropsMissing(prog, m).missing.includes('rigidTapM'), `rigidTapM=${JSON.stringify(v)} + kilavuz -> eksik`);
    ok(hasGate(prog, m, 'rigidTapM'), `rigidTapM=${JSON.stringify(v)} -> kapi engeli`);
    throwsCode(() => postProgram(prog, m, OPTS), 'cam.post.prop_missing', `rigidTapM=${JSON.stringify(v)} -> post sessiz satir atlamaz`);
  }
  const good = fm('M29');
  ok(postPropsMissing(prog, good).missing.length === 0 && /M29 S/.test(postProgram(prog, good, OPTS).text), 'dolu rigidTapM: M29 yazilir');
  // kilavuz yok -> rigidTapM bos olsa da temiz
  const noTap = S.surfaceSample().program;
  ok(postPropsMissing(noTap, fm(null)).missing.length === 0, 'kilavuz yok + rigidTapM bos -> temiz');
}

console.log('3. signed modda A siniri YAZILAN acidan denetlenir');
{
  const base = S.testMachine();
  const mA = (A) => ({ ...base, axes: { ...base.axes, A: { ...base.axes.A, ...A } } });
  const ix = S.indexedSample().program; // A 0,90,270,0
  // 270 -> yazilan -90: sinirlar [-120,120] icinde -> gecmeli (eskiden ham 270 sinir disi sayiliyordu)
  const txt = postProgram(ix, mA({ wrap: 'signed', limits: [-120, 120] }), OPTS).text;
  ok(/G0 A-90\./.test(txt), 'yazilan A-90.: ' + (txt.match(/G0 A\S+/g) || []).join());
  throwsCode(() => postProgram(ix, mA({ wrap: 'signed', limits: [0, 360] }), OPTS), 'cam.post.a_out_of_limits', 'signed: yazilan -90, [0,360] disi -> dur');
  throwsCode(() => postProgram(ix, mA({ wrap: 'signed', limits: [-45, 45] }), OPTS), 'cam.post.a_out_of_limits', 'signed: 90 sinir disi -> dur');
  ok(/G0 A270\./.test(postProgram(ix, mA({ wrap: '0-360', limits: [0, 360] }), OPTS).text), "0-360: A270. sinir icinde");
}

console.log(`\nwp04-devir: ${pass} gecti, ${fail} basarisiz`);
process.exit(fail ? 1 : 0);
