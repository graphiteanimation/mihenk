#!/bin/bash
# Dört kombinasyonu sırayla koşar (tr/en × light/dark). Önce: npm run build; npx vite preview --port 4301 --strictPort
cd "$(dirname "$0")/../.."
for c in "tr light" "tr dark" "en light" "en dark"; do
  set -- $c; python3 test/verify-ui/e2e.py $1 $2 http://127.0.0.1:${PORT:-4301}/ > test/verify-ui/logs/run-$1-$2.log 2>&1
done
echo ALLDONE > test/verify-ui/logs/runall.done
