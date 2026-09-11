#!/usr/bin/env bash
# Sourced by e2e-scheduled.yml steps to retry a flaky command instead of hand-rolling
# the same for-loop in each one — a prior omission of exactly this pattern on one gh
# CLI call (while three siblings had it) is what prompted extracting it here.
#
# Usage: retry <max_attempts> <sleep_seconds> <command...>
# Runs <command...>, retrying up to <max_attempts> times with <sleep_seconds> between
# attempts (never after the final one). Exits 0 on the first successful attempt —
# stdout/stderr and the exit status are the wrapped command's own, so
# `out=$(retry 3 5 some-command args...)` behaves like a normal command substitution.
# Exits 1 once all attempts are exhausted.
retry() {
  local max_attempts="$1"
  local sleep_seconds="$2"
  shift 2
  local attempt
  for attempt in $(seq 1 "$max_attempts"); do
    if "$@"; then
      return 0
    fi
    echo "Command failed (attempt $attempt/$max_attempts): $*" >&2
    [ "$attempt" -lt "$max_attempts" ] && sleep "$sleep_seconds"
  done
  return 1
}
