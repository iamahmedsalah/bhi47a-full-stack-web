#!/usr/bin/env bash
# Mock Docker and host checks: never connects to Atlas or the real Docker daemon.
set -euo pipefail
repo=$(cd "$(dirname "$0")/../.." && pwd)
mkdir -p "$repo/outputs"
work=$(mktemp -d "$repo/outputs/backup-tests.XXXXXX")
[[ "$work" == "$repo"/outputs/backup-tests.* && -d "$work" ]] || exit 1
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/bin" "$work/app/deploy" "$work/app/.deploy" "$work/backups"
cp "$repo/deploy/backup-mongodb-docker.sh" "$work/app/deploy/"
printf 'uri: "mongodb://not-a-real-host/student-portal"\n' > "$work/app/.deploy/weekly-mongodump.yml"
export BACKUP_DIR="$work/backups" TEST_LOG="$work/commands.log"
export PATH="$work/bin:$PATH"
cat > "$work/bin/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TEST_LOG"
case "$1" in
  image) exit 0 ;;
  rm) exit 0 ;;
  run)
    if [[ "${TEST_FAIL_DUMP:-0}" == 1 ]]; then printf 'partial'; exit 9; fi
    if [[ "${TEST_CORRUPT:-0}" == 1 ]]; then printf 'not gzip'; exit 0; fi
    printf 'synthetic archive fixture' | gzip -c ;;
  *) exit 1 ;;
esac
MOCK
cat > "$work/bin/stat" <<'MOCK'
#!/usr/bin/env bash
if [[ "$2" == '%a' ]]; then echo "${TEST_CONFIG_MODE:-600}"; else id -u; fi
MOCK
cat > "$work/bin/flock" <<'MOCK'
#!/usr/bin/env bash
exit "${TEST_LOCK_FAIL:-0}"
MOCK
cat > "$work/bin/df" <<'MOCK'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted\nfixture 2000000 1000000 %s 50%% /\n' "${TEST_FREE_KB:-1000000}"
MOCK
cat > "$work/bin/timeout" <<'MOCK'
#!/usr/bin/env bash
shift 3
exec "$@"
MOCK
chmod +x "$work/bin/"*
script="$work/app/deploy/backup-mongodb-docker.sh"
bash "$script"
archive=$(find "$BACKUP_DIR" -name '*.archive.gz' -type f)
[[ -n "$archive" && -f "$archive.sha256" && -f "$archive.manifest" ]]
(cd "$BACKUP_DIR" && sha256sum -c "$(basename "$archive").sha256")
grep -q 'restore_test=pending' "$archive.manifest"
grep -q -- '--config=/run/mongodump.yml' "$TEST_LOG"
if grep -q 'mongodb://' "$TEST_LOG"; then echo 'URI leaked into Docker arguments'; exit 1; fi
echo 'PASS checked local export, checksum, pending verification and secret-free Docker arguments'
for scenario in TEST_FAIL_DUMP TEST_CORRUPT TEST_LOCK_FAIL; do
  if env "$scenario=1" bash "$script"; then echo "Unexpected success: $scenario"; exit 1; fi
  [[ -f "$archive" ]]
  [[ $(find "$BACKUP_DIR" -name '*.archive.gz' -type f | wc -l) -eq 1 ]]
  [[ $(find "$BACKUP_DIR" -name '*.partial' -type f | wc -l) -eq 0 ]]
done
echo 'PASS dump failure, corrupt gzip and overlapping run preserve older backups'
if TEST_CONFIG_MODE=644 bash "$script"; then echo 'Unsafe config accepted'; exit 1; fi
if TEST_FREE_KB=1 bash "$script"; then echo 'Insufficient disk accepted'; exit 1; fi
echo 'PASS unsafe config permissions and insufficient disk fail closed'
