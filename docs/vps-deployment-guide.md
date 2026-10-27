# VPS deployment guide

For the authentication remediation candidate, first complete the [security deployment gates](security/DEPLOYMENT_READINESS_CHECKLIST.md). Production requires `RATE_LIMIT_STORE=mongo`; configure only verified trusted proxy CIDRs and exact origins. Passwords retain bcrypt without migration or login rehash. Keep passkeys off until acceptance. Review the [session-compatible rollback](security/ROLLBACK.md).

This is the canonical runbook for this repository. Use the checked-in production files rather than copying Compose or shell scripts from older guides.

## Architecture and requirements

Browser HTTPS -> host Nginx -> Next.js on 127.0.0.1:3000 or NestJS /api/ on 127.0.0.1:4000. The API uses MongoDB Atlas and the private Redis container. Nginx sends /api/ directly to the API; no Next.js API rewrite is needed for this topology.

Use Ubuntu 24.04 LTS, Docker Engine with Compose v2.20+ (including up --wait), Git, Nginx, Certbot, rsync, and MongoDB Database Tools. The deployment scripts require Bash and flock (util-linux). Start with enough memory for a Next.js build (8 GB RAM is a reasonable trial size); builds run sequentially. Measure actual load before sizing production.

Create a non-root deployment user, configure SSH key access, and allow only SSH, HTTP, and HTTPS through the host/provider firewalls. Docker group membership grants powerful host access: reserve it for the deployment account. Keep MongoDB Atlas network access restricted to the VPS outbound IP and give the application database user access only to its database.

Install Docker and MongoDB Database Tools using their official instructions for your Ubuntu release. Do not install the MongoDB server just to obtain backup tools. Verify:

```bash
docker version
docker compose version
git --version
mongodump --version
rsync --version
command -v flock
```

## Repository and secrets

Give the VPS a dedicated read-only GitHub repository deploy key. Keep that key separate from the key GitHub Actions will use to access the VPS.

Use main for both Vercel and VPS. Vercel keeps its existing environment settings; the VPS uses its own protected .env.prod. Do not maintain a separate deployment branch. Clone the repository to ~/app, fetch main and check out a reviewed main commit, then:

```bash
cd ~/app
umask 077
cp .env.prod.example .env.prod
chmod 600 .env.prod
nano .env.prod
```

Replace all placeholders. Generate a Redis password with openssl rand -hex 24 and use exactly that value in both REDIS_PASSWORD and REDIS_URL. Keep the existing JWT_SECRET when preserving session compatibility; generate one with openssl rand -base64 48 only for a new installation. Configure:

- MONGODB_URI copied from the existing live deployment, including the exact Atlas cluster and database name. Keep existing accounts, password hashes, roles, and data. Do not run seed, reset, restore, or database-copy commands. Take and verify a backup before cutover.
- CLIENT_URL and WEB_BASE_URL with the same public HTTPS origin, without a trailing slash.
- COOKIE_SAME_SITE=none and COOKIE_DOMAIN blank. The current API validator requires this setting for HTTPS origins.
- A working Resend sender/API key or SMTP configuration.
- Cloudinary credentials when uploads are enabled.
- Matching GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_CLIENT_ID if Google login is enabled. Otherwise leave both blank.
- Firebase variables only if configured; remove the template placeholders when unused.
- No ADMIN_EMAIL, ADMIN_NAME or ADMIN_PASSWORD: administrators already exist in Atlas. Production seeding is blocked, and seed/reset utilities are omitted from the VPS runtime image.
- RUN_STARTUP_TASKS=false and QUEUE_WORKERS_ENABLED=false during initial validation. At cutover, disable workers on the previous host before enabling VPS workers. Review startup index maintenance separately before enabling RUN_STARTUP_TASKS.

NEXT_PUBLIC_API_URL=/api is baked into the production web image. Browser configuration is compiled during the build. The current Dockerfile supports Google client ID as a build argument; add explicit build arguments before enabling other browser integrations that need additional variables. Do not pass API credentials into the web container.

The root docker-compose.yml is for local production-style testing. Its published ports are unsuitable for this VPS deployment. The pnpm docker:prod commands explicitly use docker-compose.prod.yml; use the release script below for repeatable SHA-tagged deployments.

## Nginx and HTTPS

Until a domain is purchased, use a temporary hostname such as portal.169-58-108-189.sslip.io for this VPS. sslip.io resolves hostnames containing an IP to that address ([service documentation](https://nip.io/)). Verify it resolves to your VPS before requesting a certificate; issuance depends on DNS, public ports 80/443, and CA availability. Set CLIENT_URL and WEB_BASE_URL to https://portal.169-58-108-189.sslip.io and substitute that hostname for <DOMAIN> in Nginx. Complete HTTPS before testing login; production cookies require HTTPS. Later, point a domain/subdomain you control at the VPS IP. A normal domain or a suitable temporary DNS hostname can be used; successful certificate issuance and third-party OAuth eligibility must be verified for that hostname.

Install Nginx/Certbot, copy deploy/nginx/portal.conf to /etc/nginx/sites-available/portal.conf, and replace <DOMAIN> in the copied configuration:

```bash
sudo cp deploy/nginx/portal.conf /etc/nginx/sites-available/portal.conf
sudo nano /etc/nginx/sites-available/portal.conf
sudo ln -s /etc/nginx/sites-available/portal.conf /etc/nginx/sites-enabled/portal.conf
# Disable any conflicting default site after reviewing your Nginx configuration.
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d YOUR_DOMAIN --redirect
sudo certbot renew --dry-run
```

Only Nginx exposes public application ports (80/443). Production Compose binds 3000 and 4000 to loopback and publishes no Redis port. The Nginx configuration replaces client-supplied forwarding headers before proxying /api/. Keep those bindings in place.

## First deployment

### Deploy local changes without committing or pushing

While the VPS is being provisioned, create a source-only archive from Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy/package-vps.ps1
```

This packages current source into `outputs/vps-release/student-portal.tar.gz` with
a SHA256 sidecar. It includes local deployment changes and excludes Git history,
dependencies, build output, populated environment files, and credential-key files.
Review `outputs/vps-release/source-files.txt` before uploading. This command does
not stage, commit, or push any Git files.

When SSH is available, copy the archive and sidecar to the deployment user's home
directory. Verify the checksum before extraction, then use a separate release
directory with a stable Compose project name and shared protected state:

```bash
cd ~
sha256sum -c student-portal.tar.gz.sha256
release=$(sha256sum student-portal.tar.gz | cut -d ' ' -f 1)
mkdir -p "portal/releases/$release" portal/shared/.deploy
tar -xzf student-portal.tar.gz -C "portal/releases/$release"
cd "portal/releases/$release"
# Create ~/portal/shared/.env.prod from .env.prod.example and fill real values first.
ln -s "$HOME/portal/shared/.env.prod" .env.prod
ln -s "$HOME/portal/shared/.deploy" .deploy
export COMPOSE_PROJECT_NAME=student-portal-prod
bash deploy/deploy.sh --snapshot "$release"
```

Keep both the archive and checksum from a trusted transfer. Rebuild the archive
after any local source change. For later operations and rollback on this layout,
always export the same `COMPOSE_PROJECT_NAME=student-portal-prod` and run from the
release directory. The HTTPS and backup instructions below still
apply; snapshot releases use a 64-character archive hash instead of a Git SHA.

### Deploy a committed checkout

Commit and push all deployment files before cloning on the VPS; an untracked local file is absent from a server clone. From the reviewed checkout:

```bash
cd ~/app
docker compose --env-file .env.prod -f docker-compose.prod.yml config --quiet
bash deploy/deploy.sh
```

The script refuses tracked changes and untracked files (ignored secrets/state are allowed), builds each application image under the commit SHA, waits for Redis/API/web health, and records the successful SHA in .deploy/current-release. It reuses existing images with that SHA rather than overwriting a release tag. Commit browser build-configuration changes as a new release before rebuilding. It retains previous images and attempts to restore the last successful images after a failed startup. First deployment has no recorded previous release to restore. Container replacement causes a brief interruption; this is a single-replica deployment.

The API readiness endpoint returns 503 if the MongoDB handle is missing or its bounded ping fails. Redis has its own Compose health check. Monitor queue/cache state separately; API database readiness does not promise every external provider is working.

Use the existing administrator and student accounts. Deployment and rollback do not seed, reset, or migrate Atlas data. Never run seed:reset or db:reset-students against the live Atlas database.

Test the public HTTPS /api/health endpoint and /ar/login page, then test existing admin login, student login, file uploads, email, and any enabled integrations. Verify redirects from HTTP to HTTPS and that the API is unreachable through a public port 4000.

## Releases and rollback

Fetch and check out the reviewed commit you intend to deploy; the script deploys that checkout and does not pull an unspecified latest branch:

```bash
cd ~/app
git fetch origin main
git checkout --detach YOUR_REVIEWED_COMMIT_SHA
bash deploy/deploy.sh
```

Do not modify the checkout during a deployment. The script serializes deployment runs. Keep .deploy and the previous application images on the server. Roll back application images with:

```bash
bash deploy/deploy.sh --rollback
```

Rollback does not revert the Git checkout, secrets, Nginx, Redis configuration/data, or database changes. Preserve backward compatibility for database changes. For logs or other Compose operations after a release, set RELEASE_TAG from .deploy/current-release as above. Avoid docker image prune -a until the retention policy explicitly protects rollback releases.

## CI and manual VPS release

.github/workflows/ci-cd.yml runs workspace lint/typecheck/tests/build plus a Docker job. The Docker job syntax-checks/lints deployment scripts, builds both images, starts the production topology with an isolated CI MongoDB overlay, and checks that a pre-existing admin and grade remain unchanged after startup and API restart, with no seed utilities available in the runtime image.

Existing push-to-main Vercel deployment remains enabled. Manual runs default to validate only. To deploy to the VPS, run the workflow from main and choose deployment_target=vps. That job requires both validation jobs and deploys that workflow commit through SSH, building images on the VPS. It does not provision Nginx, credentials, firewall rules, or backups.

Configure the production-vps GitHub environment with:

| Secret | Value |
| --- | --- |
| VPS_HOST | VPS hostname or IPv4 address |
| VPS_USER | Dedicated deployment user |
| VPS_SSH_KEY | Private key authorized for that user on the VPS |
| VPS_KNOWN_HOSTS | Verified SSH host-key line(s) for the server |

Obtain and verify the server host-key fingerprint through a trusted channel before storing VPS_KNOWN_HOSTS. The workflow uses strict host-key checking and SSH port 22. The server clone must be at ~/app and able to fetch origin/main. Set environment reviewers in GitHub if your release process requires them. To migrate fully away from Vercel, explicitly disable its automatic deployment jobs when you are ready; choosing a manual VPS release does not disable Vercel pushes.

## Backups and restore drills

Backups use host mongodump with a protected config so the URI/password is not passed in command-line arguments. The backup script requires an off-server rsync destination and rotates local archives only after the remote copy succeeds.

```bash
cd ~/app
umask 077
mkdir -p .deploy
nano .deploy/mongodump.yml
chmod 600 .deploy/mongodump.yml
```

Set the config to a YAML mapping with your backup database URI:

```yaml
uri: "mongodb+srv://BACKUP_USER:URL_ENCODED_PASSWORD@ATLAS_HOST/student-portal"
```

Use a least-privilege backup account with the permissions required by mongodump. Configure SSH access and verify the backup host key for a separate backup server. Use encrypted storage, restrict directory access, and define remote retention independently:

```bash
BACKUP_REMOTE=backup-user@backup-host:/encrypted/portal bash deploy/backup.sh
```

Schedule it with the deployment user's crontab, using your actual absolute path:

```cron
0 3 * * * BACKUP_REMOTE=backup-user@backup-host:/encrypted/portal /bin/bash /home/DEPLOY_USER/app/deploy/backup.sh >> /home/DEPLOY_USER/backup.log 2>&1
```

The archive directory is mode 700 and new archives/configs are private. Alert on backup or remote-copy failures. A successful archive copy is not a restore test.

For a restore drill, create a protected .deploy/restore-test.yml with a URI for an isolated empty test database. Never use the production URI in this drill:

```bash
mongorestore --config=.deploy/restore-test.yml --archive=/path/to/atlas_dump_TIMESTAMP.archive.gz --gzip --nsFrom='student-portal.*' --nsTo='portal-restore-test.*'
```

Verify representative documents, record counts, and application reads against the restored test database. Record the last successful drill date, recovery time, and responsible owner. Restore into production only through a separately reviewed incident procedure.

## Operations

Monitor container health, CPU/RAM, disk space, Redis persistence, queue failures, backup delivery, and certificate renewal. Compose rotates container logs. Keep an external HTTPS health probe and test enabled email/storage providers. Keep operating-system and image updates on a reviewed schedule.

Troubleshooting starts with:

```bash
export RELEASE_TAG=$(cat .deploy/current-release)
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
docker compose --env-file .env.prod -f docker-compose.prod.yml logs --tail 100 api web redis
sudo nginx -t
```

Inspect logs locally and redact credentials/personal data before sharing. A healthy deployment requires public HTTPS and login tests as well as healthy containers.
