#!/usr/bin/env bash
# Exercise failure paths without contacting Docker, Git, MongoDB, or a backup host.
set -euo pipefail
repo=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
# Confirm the cleanup target is the absolute temporary directory we just created.
[[ -d "$work" && "$work" == /* && "$work" != / ]] || exit 1
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/bin" "$work/app/deploy" "$work/app/.deploy"
cp "$repo/deploy/deploy.sh" "$repo/deploy/backup.sh" "$work/app/deploy/"
touch "$work/app/.env.prod" "$work/app/.deploy/mongodump.yml"
export TEST_LOG="$work/commands.log"
export TEST_NEW=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export TEST_OLD=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
export PATH="$work/bin:$PATH"
# Git Bash on Windows lacks flock; these serial tests do not exercise locking.
if ! command -v flock > /dev/null; then
  printf '#!/usr/bin/env bash\nexit 0\n' > "$work/bin/flock"
fi

cat > "$work/bin/git" <<'MOCK'
#!/usr/bin/env bash
if [[ "$1" == rev-parse ]]; then echo "$TEST_NEW"; fi
MOCK
cat > "$work/bin/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s %s\n' "${RELEASE_TAG:-unset}" "$*" >> "$TEST_LOG"
if [[ "$1 $2" == 'image inspect' ]]; then exit 1; fi
if [[ " $* " == *' ps --all --quiet '* ]]; then echo "fixture-${*: -1}"; fi
if [[ " $* " == *' logs '* && "${TEST_DIAGNOSTICS_FAIL:-}" == 1 ]]; then exit 1; fi
if [[ " $* " == *' up '* && "${RELEASE_TAG:-}" == "${TEST_FAIL_RELEASE:-}" ]]; then exit 1; fi
MOCK
cat > "$work/bin/mongodump" <<'MOCK'
#!/usr/bin/env bash
for arg in "$@"; do
  if [[ "$arg" == --archive=* ]]; then printf 'test archive' > "${arg#--archive=}"; fi
done
MOCK
cat > "$work/bin/rsync" <<'MOCK'
#!/usr/bin/env bash
printf 'remote-copy\n' >> "$TEST_LOG"
exit "${TEST_RSYNC_STATUS:-0}"
MOCK
chmod +x "$work/bin/"*

printf '%s\n' "$TEST_OLD" > "$work/app/.deploy/current-release"
export TEST_FAIL_RELEASE="$TEST_NEW"
export TEST_DIAGNOSTICS_FAIL=1
if bash "$work/app/deploy/deploy.sh"; then
  echo 'Failed release unexpectedly succeeded' >&2; exit 1;
fi
grep -q "$TEST_OLD .*up -d --no-build --wait" "$TEST_LOG"
grep -q "$TEST_NEW .*inspect --format {{json .State}} fixture-api" "$TEST_LOG"
grep -q "$TEST_NEW .*logs --no-color --tail 100 api web redis" "$TEST_LOG"
diagnostics_line=$(grep -n 'logs --no-color' "$TEST_LOG" | head -1 | cut -d: -f1)
rollback_line=$(grep -n "$TEST_OLD .*up -d --no-build --wait" "$TEST_LOG" | head -1 | cut -d: -f1)
[[ "$diagnostics_line" -lt "$rollback_line" ]]
[[ $(cat "$work/app/.deploy/current-release") == "$TEST_OLD" ]]
echo 'PASS failed startup captures diagnostics before rollback, even when logging fails'

unset TEST_FAIL_RELEASE
unset TEST_DIAGNOSTICS_FAIL
bash "$work/app/deploy/deploy.sh"
[[ $(cat "$work/app/.deploy/current-release") == "$TEST_NEW" ]]
[[ $(cat "$work/app/.deploy/previous-release") == "$TEST_OLD" ]]
bash "$work/app/deploy/deploy.sh" --rollback
[[ $(cat "$work/app/.deploy/current-release") == "$TEST_OLD" ]]
[[ $(cat "$work/app/.deploy/previous-release") == "$TEST_NEW" ]]
echo 'PASS successful deployment and explicit rollback update release markers'

snapshot=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
bash "$work/app/deploy/deploy.sh" --snapshot "$snapshot"
[[ $(cat "$work/app/.deploy/current-release") == "$snapshot" ]]
bash "$work/app/deploy/deploy.sh" --rollback
[[ $(cat "$work/app/.deploy/current-release") == "$TEST_OLD" ]]
echo 'PASS archive deployment accepts a SHA256 release and supports rollback'

if bash "$work/app/deploy/deploy.sh" --seed; then
  echo 'Legacy demo seed flag unexpectedly accepted' >&2; exit 1;
fi
export BACKUP_DIR="$work/backups"
export BACKUP_REMOTE=backup-user@backup-host:/encrypted/portal
bash "$work/app/deploy/backup.sh"
[[ $(find "$BACKUP_DIR" -name '*.archive.gz' | wc -l) -eq 1 ]]
grep -q remote-copy "$TEST_LOG"
echo 'PASS backup creates an archive and copies it off-server'

old_archive="$BACKUP_DIR/atlas_dump_old.archive.gz"
touch -t 202001010000 "$old_archive"
export TEST_RSYNC_STATUS=1
if bash "$work/app/deploy/backup.sh"; then
  echo 'Failed remote copy unexpectedly succeeded' >&2; exit 1;
fi
[[ -f "$old_archive" ]]
echo 'PASS remote-copy failure preserves older local backups'
