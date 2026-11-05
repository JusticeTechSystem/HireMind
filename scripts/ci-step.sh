#!/usr/bin/env bash
# Usage: bash scripts/ci-step.sh "step name" command [args...]
# Runs the command; if it fails, publishes the relevant output as a GitHub annotation (visible on the run's summary page).
name="$1"; shift; log="$(mktemp)"
set +e; "$@" 2>&1 | tee "$log"; code=${PIPESTATUS[0]}; set -e
if [ "$code" -ne 0 ]; then
  msg="$( { grep -iE 'error|fail|cannot|not found|ERR_|✗|FAIL' "$log" | head -n 15; echo '--- last lines ---'; tail -n 25 "$log"; } | cut -c1-300 )"
  esc="$(printf '%s' "$msg" | sed ':a;N;$!ba;s/%/%25/g;s/\r//g;s/\n/%0A/g')"
  echo "::error title=${name} failed (exit ${code})::${esc}"
fi
exit "$code"
