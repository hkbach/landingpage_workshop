#!/bin/bash
# One backup of the database: pg_dump (custom format) -> checked -> encrypted with a passphrase -> uploaded to the bucket of Cloudflare R2 -> old backups removed.
# Nothing secret is printed. The settings come from the environment (see docs/RUNBOOK.md): PGHOST, PGUSER, PGPASSWORD, PGDATABASE, BACKUP_PASSPHRASE, BACKUP_BUCKET, BACKUP_RETENTION_DAYS
# and the RCLONE_CONFIG_R2_* variables of the `r2` remote. A failure at any step stops the script with a non-zero code (and the old backups are NOT removed).
set -euo pipefail

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="workshop-${STAMP}.dump.enc"

echo "[backup] dumping the database"
pg_dump --format=custom --no-owner --no-privileges --file="$WORK/db.dump"

# a dump that cannot be read back is not a backup
pg_restore --list "$WORK/db.dump" > /dev/null

echo "[backup] encrypting"
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE -in "$WORK/db.dump" -out "$WORK/$NAME"

echo "[backup] uploading $NAME"
rclone copyto "$WORK/$NAME" "r2:${BACKUP_BUCKET}/database/${NAME}" --s3-no-check-bucket

# what the bucket holds now must contain the file we just sent, with the same size
SENT="$(stat -c %s "$WORK/$NAME")"
HELD="$(rclone size "r2:${BACKUP_BUCKET}/database/${NAME}" --json | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
if [ "$SENT" != "$HELD" ]; then
  echo "[backup] ERROR: the uploaded file has another size ($HELD) than the one sent ($SENT)" >&2
  exit 1
fi

echo "[backup] removing backups older than ${RETENTION_DAYS} days"
rclone delete "r2:${BACKUP_BUCKET}/database" --min-age "${RETENTION_DAYS}d" --s3-no-check-bucket

echo "[backup] done: ${NAME} (${SENT} bytes)"
