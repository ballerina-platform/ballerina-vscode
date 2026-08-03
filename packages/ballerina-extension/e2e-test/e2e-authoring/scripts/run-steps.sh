#!/bin/bash
set -euo pipefail

NAME="${1:?usage: run-steps.sh <daemon-name> <steps-dir> [from] [to]}"
STEPS_DIR="${2:?usage: run-steps.sh <daemon-name> <steps-dir> [from] [to]}"
FROM="${3:-01}"
TO="${4:-99}"

[ -d "$STEPS_DIR" ] || { echo "not a directory: $STEPS_DIR" >&2; exit 1; }
STEPS_DIR="$(cd "$STEPS_DIR" && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION_DIR="/tmp/ballerina-e2e-${NAME}"
PORT_FILE="$SESSION_DIR/daemon.port"
EXEC="$SESSION_DIR/exec.sh"

alive() {
  [ -f "$PORT_FILE" ] || return 1
  local port
  port="$(cat "$PORT_FILE")"
  curl -sf --max-time 2 "http://127.0.0.1:$port" --data-binary '"ping"' >/dev/null 2>&1 || return 1
  echo "$port"
}

PORT="$(alive || true)"
if [ -z "$PORT" ]; then
  echo "starting Ballerina E2E writer daemon '$NAME'..." >&2
  # Clean up any orphaned Electron process from a previous failed daemon with
  # the same profile prefix before opening a new window.
  pkill -f "bi-a-${NAME}-" 2>/dev/null || true
  nohup node "$SCRIPT_DIR/daemon.mjs" "$NAME" >/dev/null 2>&1 &
  for _ in $(seq 1 120); do
    PORT="$(alive || true)"
    [ -n "$PORT" ] && break
    sleep 1
  done
  [ -z "$PORT" ] && { echo "daemon '$NAME' failed to start (see $SESSION_DIR/daemon.log)" >&2; exit 1; }
fi

FILES=()
while IFS= read -r file; do
  n="$(basename "$file" | grep -o '^[0-9]*')"
  if [ "$n" -ge "$FROM" ] 2>/dev/null && [ "$n" -le "$TO" ] 2>/dev/null; then
    FILES+=("$file")
  fi
done < <(find "$STEPS_DIR" -maxdepth 1 -name '*.step.js' -type f | sort)

[ "${#FILES[@]}" -gt 0 ] || { echo "no matching steps in $STEPS_DIR" >&2; exit 1; }

echo "daemon '$NAME' on :$PORT" >&2
printf 'steps: %s\n' "${FILES[@]}" >&2
OUTPUT="$(cat "${FILES[@]}" | "$EXEC")" || { echo "step execution failed; see $SESSION_DIR/daemon.log" >&2; printf '%s\n' "$OUTPUT"; exit 1; }
printf '%s\n' "$OUTPUT"
