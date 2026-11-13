#!/bin/bash
# The backup container: waits for BACKUP_HOUR_UTC every day and runs backup.sh. A failed backup is reported in the log and tried again the next day (the container stays up).
# `entrypoint.sh once` runs one backup now and exits (for a manual backup before a risky change); any other command is run as it is (for example `restore.sh --list`).
set -uo pipefail

if [ "${1:-}" = "once" ]; then
  exec /usr/local/bin/backup.sh
elif [ "$#" -gt 0 ]; then
  exec "$@"
fi

HOUR="${BACKUP_HOUR_UTC:-19}"
case "$HOUR" in ''|*[!0-9]*) echo "BACKUP_HOUR_UTC must be a number from 0 to 23" >&2; exit 2 ;; esac
[ "$HOUR" -le 23 ] || { echo "BACKUP_HOUR_UTC must be a number from 0 to 23" >&2; exit 2; }

echo "[backup] every day at ${HOUR}:00 UTC"
while true; do
  NOW="$(date -u +%s)"
  NEXT="$(date -u -d "today ${HOUR}:00" +%s 2>/dev/null || date -u -d "$(date -u +%Y-%m-%d) ${HOUR}:00:00" +%s)"
  [ "$NEXT" -gt "$NOW" ] || NEXT=$((NEXT + 86400))
  sleep $((NEXT - NOW))
  /usr/local/bin/backup.sh || echo "[backup] FAILED at $(date -u +%FT%TZ): see the lines above" >&2
done
