# Private course materials on the VPS

Files live on persistent host disk; MongoDB Atlas holds file references. There is no local MongoDB service. Existing Cloudinary/Base64 records remain readable through authenticated API routes. New book files are limited to 100 MiB; lectures and sections to 25 MiB. Covers retain their existing storage and 4 MiB limit.

## Provision before deploying

Run on the production host, adapting the checkout directory and Nginx group if necessary:

```bash
sudo install -d -o 1001 -g www-data -m 2750 /srv/student-portal/materials
sudo install -d -o 1001 -g www-data -m 2750 /srv/student-portal/materials/files
sudo install -d -o 1001 -g www-data -m 2700 /srv/student-portal/materials/.tmp
sudo install -d -o 1001 -g www-data -m 2700 /srv/student-portal/materials/.writers
sudo install -m 644 deploy/nginx/portal-materials-proxy.conf /etc/nginx/snippets/portal-materials-proxy.conf
sudo install -m 644 deploy/nginx/portal-materials-locations.conf /etc/nginx/snippets/portal-materials-locations.conf
```

The setgid directories ensure files inherit the Nginx-readable group even though the API runs as UID 1001. Files are mode 0640; temporary files remain behind a private directory. The host directory must be outside the checkout. Never expose the directory as a public static mount. If changing `MATERIALS_HOST_ROOT`, change the Nginx alias to the same host path.

Set `.env.prod` values from `.env.prod.example`. On the existing VPS, add `include /etc/nginx/snippets/portal-materials-locations.conf;` inside the HTTPS server block in `/etc/nginx/sites-available/bhi47.app.conf`, then run `sudo nginx -t` and reload Nginx. Preserve all current Certbot certificate paths, TLS listeners, redirects, and existing routes; the repository's full `portal.conf` is a fresh-host template, not a replacement for the live HTTPS site. Then deploy the API/web images through the existing release workflow. `MATERIALS_DELIVERY=stream` is for local development; production uses `nginx`. No provider credentials should be put on command lines. Do not enable these routes on a Vercel API deployment: they require a persistent filesystem.

## Inventory and migration

Build the API first. Locally, run `node deploy/materials/manage.cjs inventory` with `MONGODB_URI` and `MATERIALS_ROOT` in the environment. Inside the production image:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T api node operations/materials/manage.cjs inventory
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T api node operations/materials/manage.cjs migrate
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T api node operations/materials/manage.cjs migrate --apply
```

Without `--apply`, migration is a dry run. Existing VPS references are integrity-checked; other rows are counted as pending. Applying pauses course mutations while migrating. Run in a quiet maintenance window: large datasets can take longer than the short daily snapshot. Each copied file passes the same content/size validation as new uploads, is checksummed, and is verified on disk before its database reference changes. Rows keep their IDs. Failed rows keep their original sources; reruns skip already migrated rows. External origins must be explicitly listed in `MATERIALS_LEGACY_ORIGINS`; redirects are rejected, including redirects to another allowed origin. Configure only storage origins you control, never arbitrary/private-network hosts.

Legacy source URLs/Base64 are retained in `legacyMaterialSource` for 30 days. Public responses redact this field. Uploaded files use immutable keys; replaced/deleted files become cleanup candidates rather than being deleted immediately. Migration does not run automatically on application startup or deployment.

Definitive schema or duplicate-key rejections can clean up new files after checking references. Ambiguous database failures and migration errors retain promoted bytes for reconciliation rather than risking deletion after a lost acknowledgement. The 35-day cleanup process compares stable live references before purging these candidates.

## Encrypted daily backups

Install host tools `age`, `tar`, Docker Compose, and SSH with pinned host keys. Configure a protected `/etc/student-portal/materials-backup.env` (mode 0600, owned by `bhi47a`):

```ini
MATERIALS_HOST_ROOT=/srv/student-portal/materials
MATERIALS_BACKUP_DIR=/srv/student-portal/material-backups
MATERIALS_BACKUP_MODE=pull
MATERIALS_BACKUP_RECIPIENT=age1_REPLACE_WITH_REAL_PUBLIC_RECIPIENT
MATERIALS_ALERT_EMAIL=your-alert-address@example.com
MATERIALS_PORTAL_ENV=/home/bhi47a/app/.env.prod
```

Keep the matching age private key off the VPS. The supplied units use `/home/bhi47a/app` and run as `bhi47a`, whose UID 1001 matches the API. The backup timer runs daily at 08:30 Africa/Cairo, with up to five minutes of jitter. Backups pause course mutations only while capturing the metadata manifest, then resume writes before checksum verification, encryption, and copying immutable files. A backup with pending legacy records includes their metadata/Base64, but legacy remote bytes remain with their original provider until migration.

The selected Windows pull setup is documented in [WINDOWS-BACKUPS.md](WINDOWS-BACKUPS.md). It uses SSH to download ciphertext to `D:\VPS-Backups`, verifies SHA-256, and sends a receipt. Only a verified receipt for the latest archive updates off-server health, using the original recovery-point time. Pull mode preserves archives, including those not downloaded yet; review disk capacity and keep at least 35 days. Push mode remains available with `MATERIALS_BACKUP_MODE=push`, `BACKUP_REMOTE=user@host:/absolute/path`, and `rsync`; it retains local archives for 35 days after transfer. Keep existing full Atlas backups: this export contains only book fields and material records, not users, registrations, or the complete portal.

Install backup, monitor, and reconciliation units only after a successful initial backup, Windows copy, and restore drill. The monitor runs every 15 minutes, reports failed backup/reconciliation units, missing/stale recovery points over 26 hours, disk thresholds, and maintenance guards older than 15 minutes to the configured email through the existing Resend sender (or an HTTPS webhook). It also checks the last 16 minutes of API JSON logs for material upload server errors, missing-file errors, and cleanup failures. Expected validation rejections and brief maintenance responses do not trigger upload alerts. Configure `MATERIALS_API_CONTAINER` if the container is not named `app-api-1`. Alerts contain counts and generic descriptions, never raw log contents. The scan is bounded to 2,000 recent lines; use reconciliation to verify repairs. It suppresses repeats for six hours and reports when current checks clear. Guards are never removed automatically. Run `reconcile` in report mode first; its installed daily 11:00 Cairo unit uses `--apply`. Cleanup marks an orphan when first observed and waits 35 days from that observation. Purge requires a fresh successful off-server backup and zero missing live files. Temporary files older than one day are cleaned only while course mutations are paused.

Disk usage at 80% logs a warning; 90% rejects uploads. Monitor the host filesystem and route API warning/error logs to your existing alert destination. Also alert on upload failures and missing-file errors. Downloads remain available when uploads are disabled by disk capacity or maintenance.

## Restore drill and legacy retirement

1. Copy an encrypted archive and checksum to an isolated machine. Verify `sha256sum -c`, decrypt using `age --decrypt -i /protected/key`, and extract into a new isolated directory, never over production files. Treat manifests as sensitive because they can contain retained Base64.
2. Run `node deploy/materials/manage.cjs verify-backup /isolated/extracted-directory`. Every referenced file must match its size and SHA-256.
3. Set `MATERIALS_RESTORE_TEST_URI` to a separate, empty database named `materials-restore-<unique-suffix>`; keep production `MONGODB_URI` configured for comparison. Run `restore-drill /isolated/extracted-directory`. The command refuses nonempty targets and other database names.
4. Start an isolated API/Nginx with the extracted directory and restore database, plus isolated user/student fixtures. Supply parent course records from a separate full-database restore or synthetic academic fixtures: the materials manifest contains book fields and material records, while full course metadata remains in Atlas. Verify allowed and blocked downloads, PDF range responses, unpublished materials, and direct private-path rejection. Record duration: target loss is at most 24 hours and recovery within one working day. No production restore happens automatically.
5. After a successful drill and 30 days, set `MATERIALS_RESTORE_VERIFIED_AT` to the recorded ISO timestamp and run `retire-legacy` first in report mode, then `retire-legacy --apply`. A fresh off-server backup is also required. This removes retained Base64 after checking the live file. Run `retire-cloudinary` to review eligible raw assets, then `retire-cloudinary --apply` with the existing server-only `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. The command verifies the VPS copy, skips assets used by covers or unmigrated records, deletes original raw assets with CDN invalidation, and records retirement. Unknown URL formats are skipped for manual review. Verify old public links fail after CDN propagation; no provider deletion happens automatically. See the [Cloudinary destroy reference](https://cloudinary.com/documentation/image_upload_api_reference#destroy_by_public_id).

Compatibility readers stay enabled through retirement. To roll back code, use a release containing the VPS reader; older releases cannot read new VPS references. To roll back migrated data to legacy storage, use the retained source fields and a reviewed database update during maintenance; do not rewrite records that received a newer upload.

## Crash recovery

Do not leave a manual `.maintenance` gate in place while waiting for CI or building images. The migration, snapshot, and reconciliation commands acquire and release their own gates. If a manual gate is needed during a rollout, track its owner, release it once the compatible release is healthy, and verify uploads are reopened before ending the session. A leftover gate intentionally returns HTTP 503 for material mutations even when the API health endpoint is healthy. Never expire a gate automatically while an operation may still be using it.

Writer leases are not expired automatically because a slow upload must not lose its backup lock. If an operation reports stale leases or `.maintenance` already exists, stop the API and confirm no migration/backup process is running before removing those exact stale lease files or the empty gate directory. Restart and rerun inventory/reconciliation. A failed backup may leave `.backup-snapshot-*` metadata directories; remove specific completed/abandoned snapshots after inspection, keeping any still in use. Never remove the storage root or live `files` directory.

## Production verification: 8 November 2026

One book and four lecture/section records were migrated after a fresh full Atlas export was copied to Windows and SHA-256 checked. A migration rerun verified all five VPS references with zero pending records or failures. Original sources remain retained; no Cloudinary assets were retired. Production Nginx UID/GID 33 can read all five private files with mode 0640.

The actual Windows scheduled task downloaded and verified the encrypted materials archive. Its Windows-only age identity decrypted that off-server copy; all five restored files matched their saved sizes and SHA-256 values. An isolated MongoDB/API/Nginx drill then verified authenticated downloads, blocked-student and unpublished-file restrictions, range requests, private caching, encoded filenames, DTO redaction, controlled missing-file errors, and rejection of direct private paths. Synthetic users and parent course records supplied the separate academic dependencies; no production database was restored.

The drill exposed `StudentProfile.userId` becoming Mixed when declared with the document-value ObjectId constructor. The explicit `Schema.Types.ObjectId` declaration restores matching between JWT string IDs and existing BSON ObjectId references. Regression tests cover the schema type and query casting; all 7,968 production references were already ObjectIds, so no data conversion is required.

Daily backup, monitoring, and reconciliation timers are enabled; all three services completed successfully when started manually. Windows verified two encrypted archives, including the archive from the real systemd backup service. Backup health and reconciliation reported no missing files or orphans. The Windows destination must be online and signed in for independent copies; daily off-server recovery coverage is conditional on that availability. Full Atlas backups remain a separate weekly job.
