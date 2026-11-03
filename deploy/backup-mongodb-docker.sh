#!/usr/bin/env bash
# Weekly local Atlas export. Off-server copying is a separate operator step.
set -euo pipefail
umask 077
repo=$(cd "$(dirname "$0")/.." && pwd)
config=${BACKUP_CONFIG:-$repo/.deploy/weekly-mongodump.yml}
directory=${BACKUP_DIR:-$HOME/atlas-backups}
database=${BACKUP_DATABASE:-student-portal}
image=${MONGO_TOOLS_IMAGE:-mongo:8.0}
[[ "$database" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Invalid backup database name' >&2; exit 1; }
[[ "$config" == /* && "$config" != *','* && "$config" != *$'\n'* ]] || { echo 'Use an absolute config path without commas or newlines' >&2; exit 1; }
for tool in docker flock gzip sha256sum mktemp stat df timeout; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done
[[ -f "$config" && ! -L "$config" ]] || { echo 'Protected mongodump YAML config is missing or a symlink' >&2; exit 1; }
[[ $(stat -c %a "$config") == 600 && $(stat -c %u "$config") == "$(id -u)" ]] || {
  echo 'Config must belong to this user with permissions 600' >&2; exit 1;
}
mkdir -p -- "$directory"
[[ ! -L "$directory" ]] || { echo 'Backup directory must not be a symlink' >&2; exit 1; }
chmod 700 "$directory"
directory=$(cd "$directory" && pwd -P)
exec 9>"$directory/.weekly-backup.lock"
flock -n 9 || { echo 'Another weekly backup is running' >&2; exit 1; }
docker image inspect "$image" >/dev/null 2>&1 || { echo 'Tools image is missing; pull it manually first' >&2; exit 1; }
free_kb=$(df -Pk "$directory" | awk 'NR==2 {print $4}')
[[ "$free_kb" =~ ^[0-9]+$ && "$free_kb" -ge 102400 ]] || { echo 'At least 100 MiB free space is required' >&2; exit 1; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
partial=$(mktemp "$directory/.atlas-weekly-$stamp.XXXXXX.partial")
file="$directory/$(basename "${partial%.partial}" | cut -c 2-).archive.gz"
log="${file}.log"
container="portal-mongodb-backup-$(id -u)-$$"
success=0
cleanup() {
  local code=$?
  trap - EXIT
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -f -- "$partial"
  if [[ "$success" != 1 ]]; then
    echo 'Backup failed. Older backups were preserved. Inspect the restricted backup log.' >&2
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# The URI/password stay in a read-only config file, never Docker arguments or env.
# The archive streams to the host; the tools container cannot write to backups.
timeout --signal=TERM --kill-after=30s 1h docker run --rm --name "$container" \
  --user "$(id -u):$(id -g)" --read-only --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --mount "type=bind,source=$config,target=/run/mongodump.yml,readonly" \
  "$image" mongodump --config=/run/mongodump.yml --db="$database" \
  --archive --gzip --numParallelCollections=1 > "$partial" 2> "$log"
[[ -s "$partial" ]] || { echo 'Empty backup output' >&2; exit 1; }
gzip -t -- "$partial" 2>> "$log"
mv -- "$partial" "$file"
(cd "$directory" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256")
printf 'completed_utc=%s\ndatabase=%s\nimage=%s\nvalidation=gzip-and-sha256-only\nrestore_test=pending\noff_server_copy=pending\n' \
  "$(date -u +%FT%TZ)" "$database" "$image" > "${file}.manifest"
success=1
echo "Local export completed: $(basename "$file")"
echo 'Restore test and Windows copy still required. No older archives were deleted.'
