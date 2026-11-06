#!/usr/bin/env bash
# Fails the job if any earlier ci-step.sh step failed, and lists them.
f="${RUNNER_TEMP:-/tmp}/ci-failures.txt"
if [ -s "$f" ]; then
  list="$(paste -sd ';' "$f" | sed 's/;/; /g')"
  echo "::error title=CI failed::Failed steps: ${list}"; echo "Failed steps:"; cat "$f"; exit 1
fi
echo "All steps passed"
