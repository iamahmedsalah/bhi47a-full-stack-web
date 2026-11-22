#!/usr/bin/env bash
# Deploy the checked-out, reviewed commit. Single replicas briefly restart.
# Usage: bash deploy/deploy.sh [--rollback | --snapshot ARCHIVE_SHA256]
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
[[ $# -eq 0 || ( $# -eq 1 && "$1" == --rollback ) ||
   ( $# -eq 2 && "$1" == --snapshot && "$2" =~ ^[0-9a-f]{64}$ ) ]] || {
  echo 'Usage: bash deploy/deploy.sh [--rollback | --snapshot ARCHIVE_SHA256]' >&2; exit 1;
}
[[ -f .env.prod ]] || { echo '.env.prod is required' >&2; exit 1; }
mkdir -p .deploy
if [[ "${DEPLOY_CHECKOUT_LOCKED:-}" != 1 ]]; then
  exec 8>.deploy/checkout.lock
  flock -n 8 || { echo 'Another checkout/deployment is running' >&2; exit 1; }
fi
exec 9>.deploy/deploy.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
dc=(docker compose --env-file .env.prod -f docker-compose.prod.yml)
previous=$(cat .deploy/current-release 2>/dev/null || true)
[[ -z "$previous" || "$previous" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]] || {
  echo 'Invalid recorded release SHA' >&2; exit 1;
}
if [[ "${1:-}" == --rollback ]]; then
  release=$(cat .deploy/previous-release)
elif [[ "${1:-}" == --snapshot ]]; then
  # The archive checksum must be verified before extraction (see the VPS guide).
  release="$2"
else
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo 'Commit or stash tracked changes before deploying' >&2; exit 1;
  fi
  [[ -z "$(git ls-files --others --exclude-standard)" ]] || {
    echo 'Commit or remove untracked files before deploying (keep secrets ignored)' >&2; exit 1;
  }
  release=$(git rev-parse HEAD)
fi
[[ "$release" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]] || { echo 'Invalid release SHA' >&2; exit 1; }
export RELEASE_TAG="$release"
"${dc[@]}" config --quiet
if [[ "${1:-}" != --rollback ]]; then
  if [[ "${VPS_USE_PREBUILT_IMAGES:-0}" == 1 ]]; then
    printf 'Validating CI-built images against VPS public build settings.\n'
    expected=$("${dc[@]}" config --format json | python3 -c '
import hashlib, json, sys
args = json.load(sys.stdin)["services"]["web"]["build"]["args"]
keys = ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_GOOGLE_CLIENT_ID", "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "NEXT_PUBLIC_APP_ENV", "NEXT_PUBLIC_APP_VERSION"]
print(hashlib.sha256(("".join(str(args.get(key) or "") + "\n" for key in keys)).encode()).hexdigest())')
    actual=$(docker image inspect --format '{{index .Config.Labels "app.portal.public-config"}}' "student-portal-web:ci-${release}")
    if [[ "$actual" != "$expected" ]]; then
      echo 'CI-built web settings differ from the VPS. Match the GitHub public build variables to .env.prod or disable VPS_PREBUILT_IMAGES.' >&2
      exit 1
    fi
    platform=$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')
    for service in api web; do
      image_platform=$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "student-portal-${service}:ci-${release}")
      if [[ "$image_platform" != "$platform" ]]; then
        echo "CI-built $service image does not match the VPS platform." >&2
        exit 1
      fi
    done
    for service in api web; do
      docker tag "student-portal-${service}:ci-${release}" "student-portal-${service}:${release}"
    done
  fi
  # Sequential builds reduce peak RAM on a single VPS.
  for service in api web; do
    if ! docker image inspect "student-portal-${service}:${release}" > /dev/null 2>&1; then
      "${dc[@]}" build "$service"
    fi
  done
fi
if ! "${dc[@]}" up -d --no-build --wait --wait-timeout 240; then
  echo 'Release failed its health checks.' >&2
  # Capture state before rollback replaces the failed containers. Do not dump
  # container configuration: it contains production environment secrets.
  "${dc[@]}" ps --all >&2 || true
  for service in api web redis; do
    container=$("${dc[@]}" ps --all --quiet "$service") || container=''
    if [[ -n "$container" ]]; then
      echo "Failed release diagnostics: $service" >&2
      docker inspect --format '{{json .State}}' "$container" >&2 || true
    fi
  done
  "${dc[@]}" logs --no-color --tail 100 api web redis >&2 || true
  if [[ -n "$previous" && "$previous" != "$release" ]]; then
    echo "Restoring previous application images: $previous" >&2
    RELEASE_TAG="$previous" "${dc[@]}" up -d --no-build --wait --wait-timeout 240 || {
      echo 'Rollback failed; inspect container state and logs on the server.' >&2; exit 1;
    }
  fi
  exit 1
fi
if [[ -n "$previous" && "$previous" != "$release" ]]; then
  printf '%s\n' "$previous" > .deploy/previous-release
fi
printf '%s\n' "$release" > .deploy/current-release
echo "Release $release is healthy. Previous images retained."
