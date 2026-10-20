#!/usr/bin/env bash
# Linux-only e2e diagnostics: appends a memory/disk/process snapshot to a log every
# INTERVAL seconds so a hosted-runner shutdown can be attributed to OOM or a full disk,
# and so the JVMs alive at any moment (language servers, bal runs) can be told apart by
# age, CPU and memory.
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
    echo "load: $(cut -d' ' -f1-3 /proc/loadavg)"
    ps -eo rss,pid,comm --sort=-rss | head -n 6
    echo "java processes (pid ppid age_s cpu% rss_mb state args):"
    ps -eo pid,ppid,etimes,pcpu,rss,stat,args --sort=-etimes | awk '$7 ~ /java$|\/java$/ { printf "  %s %s %ss %s%% %dMB %s %s\n", $1, $2, $3, $4, $5/1024, $6, substr($0, index($0,$7), 160) }'
    echo
  } >> "$LOG" 2>&1 || true
  sleep "$INTERVAL"
done
