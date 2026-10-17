#!/usr/bin/env bash
# Linux-only e2e diagnostics: appends a memory/disk/process snapshot to a log every
# INTERVAL seconds so a hosted-runner shutdown can be attributed to OOM or a full disk.
# Usage: resource-sampler.sh <log-file> [interval-seconds]
# Never fails the job: every probe is best-effort.
LOG="$1"
INTERVAL="${2:-15}"
mkdir -p "$(dirname "$LOG")"
while true; do
  {
    echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
    free -m
    df -h "${GITHUB_WORKSPACE:-.}" /tmp
    ps -eo rss,pid,comm --sort=-rss | head -n 6
    echo
  } >> "$LOG" 2>&1 || true
  sleep "$INTERVAL"
done
