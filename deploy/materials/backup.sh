#!/usr/bin/env bash
# Run on the host. Material bytes are encrypted BEFORE leaving the VPS.
set -euo pipefail
umask 077
repo=$(cd "$(dirname "$0")/../.." && pwd)
root=${MATERIALS_HOST_ROOT:-/srv/student-portal/materials}
directory=${MATERIALS_BACKUP_DIR:-/srv/student-portal/material-backups}
mode=${MATERIALS_BACKUP_MODE:-push}
: "${MATERIALS_BACKUP_RECIPIENT:?Set age public recipient; keep the private key off the VPS}"
[[ "$root" == /* && "$directory" == /* ]] || exit 1
case "$mode" in
  push)
    : "${BACKUP_REMOTE:?Set user@host:/absolute/path}"
    [[ "$BACKUP_REMOTE" =~ ^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+:/[a-zA-Z0-9/_.-]+$ ]] || exit 1
    command -v rsync >/dev/null
    ;;
  pull) ;;
  *) echo 'MATERIALS_BACKUP_MODE must be push or pull' >&2; exit 1 ;;
esac
for tool in docker tar age sha256sum flock; do command -v "$tool" >/dev/null; done
mkdir -p -- "$directory"
exec 9>"$directory/.backup.lock"
flock -n 9 || exit 1
stamp=$(date -u +%Y%m%dT%H%M%S%NZ)
stage=$(mktemp -d "$directory/.snapshot.XXXXXXXX")
partial="$directory/materials-$stamp.tar.age.partial"
cleanup() {
  rm -f -- "$partial"
  # Contains secrets/Base64; only delete the exact mktemp directory after containment verification.
  case "$stage" in "$directory"/.snapshot.*) rm -rf -- "$stage" ;; esac
}
trap cleanup EXIT
cd "$repo"
container_stage="/data/materials/.backup-snapshot-$stamp"
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T api node operations/materials/manage.cjs snapshot "$container_stage"
# Keep the small manifest until a successful copy; failed-run snapshots can be inspected on the host.
snapshot="$root/.backup-snapshot-$stamp"
cp -- "$snapshot/manifest.json" "$snapshot/files.list" "$stage/"
# File keys are validated by snapshot. Immutable files stay retained throughout archive creation.
tar -C "$stage" -cf - manifest.json -C "$root" --verbatim-files-from -T "$stage/files.list" |
  age -r "$MATERIALS_BACKUP_RECIPIENT" > "$partial"
test -s "$partial"
archive="$directory/materials-$stamp.tar.age"
mv -- "$partial" "$archive"
(cd "$directory" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256")
printf '{"completedAt":"%s","archive":"%s"}\n' "$(date -u +%FT%TZ)" "$(basename "$archive")" > "$root/.backup-local-success.json.partial"
mv -- "$root/.backup-local-success.json.partial" "$root/.backup-local-success.json"
if [[ "$mode" == push ]]; then
  rsync --archive --protect-args -- "$archive" "$archive.sha256" "${BACKUP_REMOTE%/}/"
  cp -- "$root/.backup-local-success.json" "$root/.backup-success.json.partial"
  mv -- "$root/.backup-success.json.partial" "$root/.backup-success.json"
fi
rm -f -- "$snapshot/manifest.json" "$snapshot/files.list"
rmdir -- "$snapshot"
if [[ "$mode" == push ]]; then
  find "$directory" -maxdepth 1 -type f -name 'materials-*.tar.age*' -mtime +35 -delete
  echo 'Encrypted materials backup copied off-server. Verify remote retention and schedule restore drills.'
else
  echo 'Encrypted materials backup is ready for Windows pull. Off-server verification remains pending.'
fi
