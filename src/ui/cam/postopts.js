// Post akışının saf (DOM'suz) parçaları: post özellik tanımları (düzenleyici sırası) ve postProgram seçenekleri.
// Node testlerinden doğrudan içe aktarılır (test/wp21.test.mjs); arayüz dosyaları (machines.js, ops.js) buradan okur.

// post özelliği tanımları: tür, seçenekler, birim. Etiket 'cam.pp.<ad>', neden gerekli 'cam.ppw.<ad>'.
export const PP = {
  safeRetract: { kind: 'sel', opts: ['G28', 'G53'] }, safeRetractZ: { kind: 'num', unit: 'mm' },
  dwellAddress: { kind: 'sel', opts: ['P', 'X'] }, dwellUnit: { kind: 'sel', opts: ['ms', 's'] },
  cycleDwellAddress: { kind: 'sel', opts: ['P'] }, cycleDwellUnit: { kind: 'sel', opts: ['ms', 's'] },
  coolantCodes: { kind: 'codes', keys: ['flood', 'mist', 'air', 'through', 'off'] },
  tapMode: { kind: 'sel', opts: ['feed', 'pitch'] }, rigidTapM: { kind: 'text' }, tapR1: { kind: 'bool' },
  rotaryMode: { kind: 'sel', opts: ['6a', '6b'] }, aReturnZero: { kind: 'bool' }, aSplit180: { kind: 'bool' },
  g541Range: { kind: 'range' }, highSpeedOn: { kind: 'text' }, highSpeedOff: { kind: 'text' },
  toolChangeCode: { kind: 'text' }, endCode: { kind: 'text' }, optionalStop: { kind: 'bool' }, rapidSplit: { kind: 'bool' }, cannedCycles: { kind: 'bool' },
  lineNumbers: { kind: 'bool' }, lineNumberStart: { kind: 'num', int: true }, lineNumberStep: { kind: 'num', int: true }, programNumberDigits: { kind: 'num', int: true }, percentLeader: { kind: 'bool' }, decimals: { kind: 'num', int: true },
  cycleG76: { kind: 'bool' }, cycleG87: { kind: 'bool' }, decimalsInch: { kind: 'num', int: true }, // WP-14
  wrapFeedMode: { kind: 'sel', opts: ['inverse', 'degmm'] }, wrapAWord: { kind: 'sel', opts: ['auto', 'continuous', 'shortest'] }, wrapMaxAStep: { kind: 'num', unit: '°' }, inverseFeedDecimals: { kind: 'num', int: true }, // WP-16 sarma
  modelSummary: { kind: 'bool' }, // WP-21: NC başlığında model özeti (MODEL/PART/SETUP/GENERATED); varsayılan açık
};
export const PP_ORDER = ['safeRetract', 'safeRetractZ', 'dwellAddress', 'dwellUnit', 'cycleDwellAddress', 'cycleDwellUnit', 'coolantCodes', 'tapMode', 'rigidTapM', 'tapR1', 'rotaryMode', 'aReturnZero', 'aSplit180', 'wrapFeedMode', 'wrapAWord', 'wrapMaxAStep', 'inverseFeedDecimals', 'g541Range', 'highSpeedOn', 'highSpeedOff', 'toolChangeCode', 'endCode', 'optionalStop', 'rapidSplit', 'cannedCycles', 'cycleG76', 'cycleG87', 'lineNumbers', 'lineNumberStart', 'lineNumberStep', 'programNumberDigits', 'percentLeader', 'modelSummary', 'decimals', 'decimalsInch'];

// Gövdelerin görüntü ağı köşelerinden model uzayında (dünya eksenleri) kutu; gövde yoksa null.
export function modelBBoxOf(bodies) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const b of bodies || []) {
    const v = b?.vertices; if (!v) continue;
    for (let i = 0; i + 2 < v.length; i += 3) for (let k = 0; k < 3; k++) { const q = v[i + k]; if (q < mn[k]) mn[k] = q; if (q > mx[k]) mx[k] = q; }
  }
  return Number.isFinite(mn[0]) ? { min: mn, max: mx } : null;
}

// postProgram seçenekleri. fileName: belgenin dosya adı (kaydedilmemişse null → MODEL satırı yazılmaz);
// result: çekirdek yeniden hesap sonucu ({bodies:[{id,vertices}]}); yalnız programdaki setup'ların gövdeleri kutuya girer.
export function postRunOpts({ program, fileName, result, gates = [], appVersion, now = new Date(), verified = null }) {
  const ids = new Set(); for (const s of program?.sections || []) for (const id of s.setup?.bodies || []) ids.add(id);
  const bodies = (result?.bodies || []).filter((b) => ids.has(b.id));
  const iso = now.toISOString();
  const modelSummary = {}; if (fileName) modelSummary.doc = String(fileName);
  const bbox = modelBBoxOf(bodies); if (bbox) modelSummary.bbox = bbox;
  return { gates, appVersion, date: iso.slice(0, 10), generatedAt: iso, modelSummary, ...(verified ? { verified } : {}) };
}
