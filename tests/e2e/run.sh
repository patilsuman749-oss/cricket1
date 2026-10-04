#!/usr/bin/env bash
# Serves the project on :4173 and runs every *.e2e.mjs. Usage: npm run test:e2e
cd "$(dirname "$0")/../.." || exit 1
python3 -m http.server 4173 >/dev/null 2>&1 & SP=$!
trap 'kill $SP 2>/dev/null' EXIT
sleep 1
RC=0
for f in tests/e2e/*.e2e.mjs; do echo "== $f"; node "$f" || RC=1; done
exit $RC
