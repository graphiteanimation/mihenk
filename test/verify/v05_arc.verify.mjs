// V-05: cok kisa yay (kiris < 0,0005 mm) postta yuvarlaninca baslangic = bitis olur; G2/G3 X/Y'siz yazilir ->
// Fanuc/Mitsubishi bunu TAM DAIRE olarak yorumlar. IR dogrulayici (EPS 1e-6) ve geri okuyucu karsilastirmasi (tol 0,001)
// bunu yakalamaz. (a) dogrudan IR ile, (b) islemden (neredeyse dogrusal kose -> kucuk ofset kose yayi) uretilebilirlik.
// Calistir: node test/verify/v05_arc.verify.mjs
import * as CAM from '../../src/cam/index.js';
import { postProgram, readNC } from '../../src/cam/post/index.js';
import { mk, compareToolpaths, validateToolpath } from '../../src/cam/ir.js';
import * as V from './lib.mjs';
import { lintNC } from './nc.mjs';
import { S0, tool, base, machineM80V, section, program, reporter } from './ctx.mjs';
const rep = reporter('v05_arc'); const M = machineM80V(); const S = S0();
const T = { number: 5, H: 5, D: null, type: 'flat', dia: 6, cornerR: 0, tipAngle: null, fluteLen: 20, bodyLen: 40, centerCutting: true, pitch: null };
// (a) 0,0004 mm kirisli yay (merkez 5 mm uzakta)
{
  const tp = mk.toolpath({ tool: T, rpm: 5000, coolant: 'off', clearanceZ: 10, moves: [mk.rapid(10, 10, 10), mk.feed(10, 10, -1, 100, 'plunge'), mk.arc(10.0004, 10, -1, 0.0002, -5, 'cw', 500), mk.feed(20, 10, -1, 500), mk.rapid(20, 10, 10)] });
  validateToolpath(tp);
  const txt = postProgram(program([section(S, tp)]), M, { date: '2026-11-11' }).text;
  const arcLine = txt.split('\n').find((l) => /^G2/.test(l));
  const L = lintNC(txt, { stockTop: 0 });
  rep.finding('V-05', L.issues.some((i) => i.code === 'arc_full_circle' || i.code === 'arc_no_endpoint'), `IR gecerli (kiris 0,0004 mm) -> NC "${arcLine}" : X/Y yok = tezgahta 360 derece (yaricap 5 mm) tam daire`);
  const rd = readNC(txt, { machine: M }); const cmp = compareToolpaths(tp, rd.program.sections[0].toolpath);
  const nR = rd.program.sections[0].toolpath.moves.length;
  rep.finding('V-05b', nR !== tp.moves.length, `geri okuyucu X/Y/Z'siz G2 satirini HATASIZ atliyor (IR ${tp.moves.length} hareket, okunan ${nR}); 'tanimadigi/eksik kelimede hata' ilkesine aykiri. Karsilastirma esit degil (${cmp.diffs[0]}) -> uctan uca test yakalar, okuyucu tek basina yakalamaz`);
}
// (b) islemden: 0,001 derece kirikli neredeyse dogrusal kenar (DXF/kiris kaynakli) -> dis kontur kose yayi
{
  const k = 1e-5; // y sapmasi (mm) 50 mm'de
  const outer = V.poly([[0, 0], [50, k], [100, 0], [100, 50], [0, 50]]);
  const op = { id: 'c', type: 'contour', name: 'c', ...base, geom: [{ kind: 'face', ref: {}, loops: 'outer' }], side: 'outside', dir: 'climb', stepdown: 20 };
  let tp; try { tp = CAM.computeOp(op, { setup: S0({ stockBox: { min: [-20, -20, -30], max: [120, 70, 0] } }), tool: tool(10), geom: { faces: [V.face({ outer, holes: [] }, -10)] } }); } catch (e) { rep.finding('V-05c', false, 'hata ' + e.code); }
  let tiny = 0, pos = null; for (const m of tp.moves) { if (m.t === 'arc' && pos && Math.hypot(m.x - pos.x, m.y - pos.y) < 0.0005) tiny++; if (m.x != null) pos = m; }
  const txt = postProgram(program([section(S, tp)]), M, { date: '2026-11-11' }).text; const L = lintNC(txt, { stockTop: 0 });
  rep.finding('V-05c', tiny > 0 || L.issues.some((i) => i.code === 'arc_full_circle'), `islem kaynakli: kirisi < 0,0005 mm yay sayisi ${tiny}; NC tam daire satiri ${L.issues.filter((i) => i.code === 'arc_full_circle').map((i) => 'L' + i.line).join(',') || 'yok'}`);
}
// (c) 0,001 mm kirikli kenar: ofset acik hata ile duruyor (sessiz degil; saglamlik)
{
  const outer = V.poly([[0, 0], [50, 1e-3], [100, 0], [100, 50], [0, 50]]);
  const op = { id: 'c', type: 'contour', name: 'c', ...base, geom: [{ kind: 'face', ref: {}, loops: 'outer' }], side: 'outside', dir: 'climb', stepdown: 20 };
  let code = null; try { CAM.computeOp(op, { setup: S0({ stockBox: { min: [-20, -20, -30], max: [120, 70, 0] } }), tool: tool(10), geom: { faces: [V.face({ outer, holes: [] }, -10)] } }); } catch (e) { code = e.code; }
  rep.finding('V-15', code === 'cam.geom.offset_failed', `50 mm kenarda 0,001 mm kirik (DXF/kiris tipik) -> dis kontur: ${code || 'basarili'}`);
}
rep.done();
