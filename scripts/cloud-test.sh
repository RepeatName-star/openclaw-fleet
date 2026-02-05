#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ART_DIR="$ROOT_DIR/artifacts"
mkdir -p "$ART_DIR"
LOG_FILE="$ART_DIR/cloud-test-$(date +%Y%m%d-%H%M%S).log"
TOKEN_FILE="$ART_DIR/device-token.txt"

log() {
  echo "==> $*" | tee -a "$LOG_FILE"
}

run() {
  echo "\$ $*" | tee -a "$LOG_FILE"
  "$@" >>"$LOG_FILE" 2>&1
}

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ROOT_DIR/.env"
  set +a
fi

CONTROL_PLANE_URL=${CONTROL_PLANE_URL:-http://127.0.0.1:3000}
ENROLLMENT_TOKEN=${ENROLLMENT_TOKEN:-${ENROLLMENT_SECRET:-}}

if [ -z "$ENROLLMENT_TOKEN" ]; then
  echo "ENROLLMENT_TOKEN or ENROLLMENT_SECRET is required" >&2
  exit 1
fi

log "checking health"
run curl -sS "$CONTROL_PLANE_URL/health"

log "enrolling instance"
ENROLL_PAYLOAD=$(printf '{"enrollment_token":"%s","instance_name":"cloud-test"}' "$ENROLLMENT_TOKEN")
ENROLL_RESP=$(curl -sS -X POST "$CONTROL_PLANE_URL/v1/enroll" -H 'content-type: application/json' -d "$ENROLL_PAYLOAD")

INSTANCE_ID=$(node -e 'const d=JSON.parse(process.argv[1]); console.log(d.instance_id||"")' "$ENROLL_RESP")
DEVICE_TOKEN=$(node -e 'const d=JSON.parse(process.argv[1]); console.log(d.device_token||"")' "$ENROLL_RESP")

if [ -z "$INSTANCE_ID" ] || [ -z "$DEVICE_TOKEN" ]; then
  echo "Enroll failed; see $LOG_FILE" >&2
  exit 1
fi

echo "$DEVICE_TOKEN" > "$TOKEN_FILE"
log "enroll.instance_id=$INSTANCE_ID"
log "device token saved to $TOKEN_FILE (do not share)"

log "creating task session.reset"
TASK_PAYLOAD=$(printf '{"target_type":"instance","target_id":"%s","action":"session.reset","payload":{"key":"agent:main:main"}}' "$INSTANCE_ID")
TASK_RESP=$(curl -sS -X POST "$CONTROL_PLANE_URL/v1/tasks" -H 'content-type: application/json' -d "$TASK_PAYLOAD")
TASK_ID=$(node -e 'const d=JSON.parse(process.argv[1]); console.log(d.id||"")' "$TASK_RESP")

if [ -z "$TASK_ID" ]; then
  echo "Task creation failed; see $LOG_FILE" >&2
  exit 1
fi
log "task.id=$TASK_ID"

if command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
  log "polling task status via DB"
  for _ in $(seq 1 10); do
    STATUS=$(psql "$DATABASE_URL" -tAc "select status from tasks where id='${TASK_ID}'" | tr -d '[:space:]')
    if [ -n "$STATUS" ]; then
      log "task.status=$STATUS"
      if [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ]; then
        break
      fi
    fi
    sleep 2
  done
else
  log "psql not available or DATABASE_URL missing; skipping DB status check"
fi

log "done"
