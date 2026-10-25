# Complaint paging and current VPS operations

Admin and student complaint lists now request a 20-ticket page by default. Page,
page size and search/filter values live in the URL. Search is debounced by 300 ms
and runs on the server, so results include tickets beyond the current page.
Previous/Next controls work on desktop and mobile; changing filters or page size
resets the page. Selection is cleared on navigation, and an empty final page after
deletion returns to the last available page. The API accepts integer pages and
page sizes of 1–100. Sorting uses createdAt and _id for deterministic ties.

The former admin statistics request fetched a ticket page with limit=1000, which
the API capped to 100. It therefore downloaded unnecessary records and calculated
incomplete totals. `/api/admin/complaints/stats` now returns a small aggregate
summary across all tickets under the same complaint-read permission. The list
response still includes total and totalPages. Student lists retain owner filtering
and now use this same paginated envelope; both web consumers were updated together.
Exports/printing on the admin list include the displayed page, as before; use the
page controls to view more tickets. Global counts do not require downloading them.

## What a push does today

The repository's `.github/workflows/ci-cd.yml` runs validation and container smoke
checks on matching pushes. Its main-branch Vercel deployment jobs still run on
push. The updated VPS deployment job also runs automatically on a main push after
both validation jobs pass, and still supports manual main runs with target vps.
It requires the production-vps environment and usable SSH secrets to be configured.

To use that job, configure the `production-vps` GitHub environment and its secrets:
`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, and `VPS_KNOWN_HOSTS` (verified server host key).
The SSH key must authorize the deployment user on the VPS. Then choose GitHub
Actions → CI/CD - Vercel and VPS → Run workflow → main → target vps. Following
successful validation and Docker checks, the job fetches main on the VPS, checks
out the selected commit, and invokes deploy/deploy.sh. It uses a detached checkout.
Secrets/environment configuration has not been inspected or changed in this work.
See VPS-SSH-DEPLOYMENT-GUIDE.md for the automatic deployment setup. GitHub settings
and credentials are configured separately from this checked-in workflow.

For manual deployment after committing/pushing and passing CI, in the VPS terminal:

```bash
cd ~/app
git status --short
git switch main
git pull --ff-only origin main
bash deploy/deploy.sh
```

Proceed with checkout/pull only when tracked and untracked application changes are
accounted for; keep `.env.prod` private and ignored. The deploy script checks the
working tree, builds the API and web images for the checked-out commit, starts them,
waits for health, and attempts to restore previous images if startup fails.
It preserves Redis volumes and does not reset/seed Atlas. No separate hand-written
image-build commands are needed. Nginx configuration does not need a reload for
ordinary API/web image changes. Changes to production environment values are made
on the VPS, not by committing secrets.

## Inspect the running Redis

Run in the VPS SSH terminal, from any directory:

```bash
docker exec -it app-redis-1 redis-cli
```

The Compose configuration provides REDISCLI_AUTH inside the Redis container, so
authentication happens without copying the password into a command. At the Redis
prompt, run these separately:

```text
PING
INFO memory
INFO stats
DBSIZE
QUIT
```

PING should return PONG. Memory information shows current use and limits; stats
includes server-wide operation counters; DBSIZE reports the number of keys in
the selected database. For a quick one-shot check use
`docker exec app-redis-1 redis-cli PING`. Port 6379 remains private to Docker.
Redis CLI reports server-wide counters; the portal metrics card reports cache
command attempts by this API process, excluding BullMQ and other clients.

For visual management, Redis Insight requires a separately configured private
connection/tunnel. A generic SSH forward to 127.0.0.1:6379 will not reach the current
topology because Redis has no host port mapping. No public Redis port or GUI was
enabled by these changes.

## Validation and deployment state

Workspace typecheck, lint (zero errors; 248 existing web warnings), final production
build and runtime/root-route artifact checks passed. API tests passed: 41 suites,
226 tests, including paging offsets/totals, owner-scoped search and invalid query
parameters. Full application E2E and live query-plan/latency checks remain
unverified because local MongoDB/Redis test services are unavailable. No production
database was used as test infrastructure. The changes remain uncommitted and
undeployed; API and web should be deployed together for the new student-list envelope.
