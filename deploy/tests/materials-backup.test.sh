#!/usr/bin/env bash
# Verify backup ordering/failure handling without credentials, Docker or remote writes.
set -euo pipefail
repo=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
[[ "$work" == /* && "$work" != / && -d "$work" ]] || exit 1
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/bin" "$work/app/deploy/materials" "$work/storage/files"
cp "$repo/deploy/materials/backup.sh" "$work/app/deploy/materials/backup.sh"
export MATERIALS_HOST_ROOT="$work/storage"
export MATERIALS_BACKUP_DIR="$work/backups"
export MATERIALS_BACKUP_RECIPIENT=age1_test_public_recipient
export BACKUP_REMOTE=backup-user@backup-host:/backups/materials
export TEST_LOG="$work/commands.log"
export PATH="$work/bin:$PATH"
key=11111111-1111-4111-8111-111111111111
printf 'private fixture' > "$work/storage/files/$key"
cat > "$work/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ ${TEST_SNAPSHOT_FAIL:-0} == 0 ]] || exit 1
directory="$MATERIALS_HOST_ROOT/${*: -1}"
# The caller uses a container path; retain only the generated snapshot basename.
directory="$MATERIALS_HOST_ROOT/$(basename "${*: -1}")"
mkdir -p "$directory"
printf '{"version":1}' > "$directory/manifest.json"
printf 'files/11111111-1111-4111-8111-111111111111\n' > "$directory/files.list"
printf 'snapshot\n' >> "$TEST_LOG"
MOCK
cat > "$work/bin/age" <<'MOCK'
#!/usr/bin/env bash
printf 'encrypt %s\n' "$*" >> "$TEST_LOG"
if [[ ${TEST_EMPTY_ENCRYPTION:-0} == 1 ]]; then cat > /dev/null; else cat; fi
MOCK
cat > "$work/bin/rsync" <<'MOCK'
#!/usr/bin/env bash
printf 'remote-copy\n' >> "$TEST_LOG"
exit "${TEST_RSYNC_STATUS:-0}"
MOCK
if ! command -v flock > /dev/null; then printf '#!/usr/bin/env bash\nexit 0\n' > "$work/bin/flock"; fi
chmod +x "$work/bin/"*
bash "$work/app/deploy/materials/backup.sh"
[[ -s "$work/storage/.backup-success.json" ]]
grep -q 'encrypt -r age1_test_public_recipient' "$TEST_LOG"
grep -q remote-copy "$TEST_LOG"
archive=$(find "$work/backups" -maxdepth 1 -name '*.tar.age' -print -quit)
tar -tf "$archive" | grep -q "files/$key"
[[ $(find "$work/storage" -maxdepth 1 -type d -name '.backup-snapshot-*' | wc -l) -eq 0 ]]
echo 'PASS metadata and immutable files are encrypted and copied before success is recorded'

old="$work/backups/materials-old.tar.age"
touch -t 202001010000 "$old"
before=$(cat "$work/storage/.backup-success.json")
export TEST_RSYNC_STATUS=1
if bash "$work/app/deploy/materials/backup.sh"; then echo 'Remote failure unexpectedly succeeded' >&2; exit 1; fi
[[ -f "$old" && $(cat "$work/storage/.backup-success.json") == "$before" ]]
echo 'PASS failed remote copy preserves retention and the last success marker'

export TEST_RSYNC_STATUS=0
export TEST_EMPTY_ENCRYPTION=1
if bash "$work/app/deploy/materials/backup.sh"; then echo 'Empty encryption unexpectedly succeeded' >&2; exit 1; fi
[[ $(cat "$work/storage/.backup-success.json") == "$before" ]]
echo 'PASS empty encryption cannot mark a backup successful'

unset TEST_EMPTY_ENCRYPTION
unset BACKUP_REMOTE
export MATERIALS_BACKUP_MODE=pull
before=$(cat "$work/storage/.backup-success.json")
bash "$work/app/deploy/materials/backup.sh"
[[ -s "$work/storage/.backup-local-success.json" ]]
[[ $(cat "$work/storage/.backup-success.json") == "$before" ]]
[[ -f "$old" ]]
echo 'PASS Windows pull mode keeps local and off-server success separate and preserves unconfirmed archives'
