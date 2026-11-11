#!/bin/bash
# test:all zincirindeki her adimi tek tek kosar; adim basina sure, cikis kodu, log. Kullanim: bash steps.sh
cd "$(dirname "$0")/../.."
L=test/verify-ui/logs/steps; mkdir -p $L; : > $L/summary.tsv
i=0
while IFS= read -r cmd; do
  i=$((i+1)); n=$(printf '%02d' $i); s=$(date +%s.%N)
  bash -c "$cmd" > $L/$n.log 2>&1; rc=$?
  e=$(date +%s.%N); dt=$(echo "$e - $s" | bc)
  printf '%s\t%s\t%s\t%.1f\n' "$n" "$cmd" "$rc" "$dt" >> $L/summary.tsv
done <<'LIST'
node test/i18n.test.mjs
node test/security.test.mjs
node test/kernel.test.mjs
node test/solver.test.mjs
node test/geom2d.test.mjs
node test/profiles.test.mjs
node test/sketchops.test.mjs
node test/dxf.test.mjs
node test/stability.test.mjs
node test/models/run-all.mjs
node test/cam.test.mjs
node test/post.test.mjs
node test/sim.test.mjs
npm run build
python3 test/sketcher.test.py
python3 test/app.test.py
python3 test/ui.test.py
python3 test/cam-ui.test.py
node test/electron.test.mjs
LIST
echo DONE >> $L/summary.tsv
