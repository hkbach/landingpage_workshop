#!/bin/bash
# Restores a backup into a database that is EMPTY (a new one). It never touches a database that has tables: that is the safety. Usage (see docs/RUNBOOK.md):
#   restore.sh <backup file name in the bucket>      downloads, decrypts and restores it into $PGDATABASE (create that database first)
#   restore.sh --list                                lists the backups in the bucket, newest last
# Needs the same environment as backup.sh. After a restore, run the migrations (node dist/migrate.js) so a database made by an older version is brought up to date, and check that
# APP_SECRET is the one the data was written with (a different one leaves the bank account numbers unreadable).
set -euo pipefail

: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"

if [ "${1:-}" = "--list" ]; then
  rclone lsl "r2:${BACKUP_BUCKET}/database" --s3-no-check-bucket | sort -k2,3
  exit 0
fi

NAME="${1:?usage: restore.sh <backup file name> | --list}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
case "$NAME" in
  workshop-*.dump.enc) ;;
  *) echo "[restore] the name must look like workshop-<time>.dump.enc" >&2; exit 2 ;;
esac

TABLES="$(psql -Atc "select count(*) from information_schema.tables where table_schema = 'public'")"
if [ "$TABLES" != "0" ]; then
  echo "[restore] REFUSED: the database ${PGDATABASE:-} already has $TABLES table(s). Restore into a new, empty database." >&2
  exit 3
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[restore] downloading $NAME"
rclone copyto "r2:${BACKUP_BUCKET}/database/${NAME}" "$WORK/$NAME" --s3-no-check-bucket

echo "[restore] decrypting"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$WORK/$NAME" -out "$WORK/db.dump"

echo "[restore] restoring"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="${PGDATABASE:?PGDATABASE is required}" "$WORK/db.dump"

echo "[restore] done. Now run the migrations and check the application."
