#!/usr/bin/env bash
# Host tools: MongoDB Database Tools, rsync, SSH. Configure remote SSH first.
# BACKUP_REMOTE=backup-user@backup-host:/encrypted/portal bash deploy/backup.sh
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-${HOME}/backups}"
BACKUP_CONFIG="${BACKUP_CONFIG:-${PWD}/.deploy/mongodump.yml}"
: "${BACKUP_REMOTE:?Set BACKUP_REMOTE to the off-server rsync destination}"
[[ "$BACKUP_REMOTE" =~ ^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+:/ ]] || {
  echo 'BACKUP_REMOTE must be user@backup-host:/absolute/path' >&2; exit 1;
}
[[ -f "$BACKUP_CONFIG" ]] || { echo 'Protected mongodump config is missing' >&2; exit 1; }
chmod 600 "$BACKUP_CONFIG"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
exec 9>"${BACKUP_DIR}/.backup.lock"
flock -n 9 || { echo 'Another backup is running' >&2; exit 1; }
BACKUP_FILE="${BACKUP_DIR}/atlas_dump_$(date -u +%Y-%m-%d_%H%M%S_%N).archive.gz"
PARTIAL_FILE="${BACKUP_FILE}.partial"
trap 'rm -f -- "$PARTIAL_FILE"' EXIT
# --config keeps the database URI/password out of the process argument list.
mongodump --config="$BACKUP_CONFIG" --archive="$PARTIAL_FILE" --gzip
[[ -s "$PARTIAL_FILE" ]] || { echo 'Backup archive is empty' >&2; exit 1; }
mv -- "$PARTIAL_FILE" "$BACKUP_FILE"
rsync --archive --protect-args -- "$BACKUP_FILE" "${BACKUP_REMOTE%/}/"
# Rotate local archives only after a successful off-server copy.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'atlas_dump_*.archive.gz' -mtime +7 -delete
echo 'Backup completed and copied off-server. Schedule regular restore drills.'
