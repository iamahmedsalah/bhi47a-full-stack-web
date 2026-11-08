# Weekly MongoDB backups — VPS and Windows, step by step

This guide uses your Atlas database, the VPS user `bhi47a`, repository `~/app`,
and Docker. No host-installed mongodump is required. Keep the October 23 archive.
The commands below do not restore into Atlas or delete existing backups.

This implements the **local-export phase** of the attached recovery plan, not
the entire plan. The chosen independent destination is your Windows PC for now.
Weekly local exports are automatic; downloading to your PC is manual. Off-server
automation, encryption/key escrow, retention automation and failure alerts remain
future work. A `.gz` archive is compressed, **not encrypted**. Permissions 600/700
restrict access but do not encrypt it. Store the Windows copy on protected storage.

Weekly-only exports can leave roughly seven days of changes unprotected. A live
mongodump is a logical export, not a transactionally consistent cluster snapshot
or point-in-time recovery. Prefer Atlas-native backups for those requirements.
Some Free clusters may now offer a preview daily-backup subscription: inspect the
actual cluster Backup page rather than assuming availability or enabling billing.

## 1. Check the VPS (Linux SSH terminal)

Run one command at a time:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
```

Print only the configured database name, never the URI:

```bash
docker exec app-api-1 node -e 'const u=new URL(process.env.MONGODB_URI); console.log("database="+decodeURIComponent(u.pathname.slice(1)))'
```

The expected database is `student-portal`. If different, use the actual name in
BACKUP_DATABASE and the service below; do not create or seed a new database.

```bash
df -h "$HOME"
```

```bash
timedatectl status
```

```bash
docker run --rm mongo:8.0 mongodump --version
```

The last command downloads the official Mongo image if absent and prints the
tools version. The application remains running. Use a compatible image for the
source server version; this setup was previously using MongoDB 8.0. For repeatable
versions, record its RepoDigest and set MONGO_TOOLS_IMAGE to that digest in the
service. The job checks image availability and does not pull on every run.

## 2. Deploy these files

Commit and deploy the backup files with the existing GitHub/VPS process:

- `deploy/backup-mongodb-docker.sh`
- `deploy/systemd/portal-mongodb-backup.service`
- `deploy/systemd/portal-mongodb-backup.timer`

Check on the VPS:

```bash
cd ~/app
```

```bash
test -f deploy/backup-mongodb-docker.sh && echo 'Backup script present'
```

Do not run `git reset --hard` to resolve local changes. Follow the regular clean
checkout deployment process. Application containers need no rebuild for this job.

## 3. Create the protected connection configuration

A dedicated Atlas database user with read permissions on the specific database
is preferable for long-term use. Do not use a cluster administrator. Allow the
VPS's address in Atlas network access, as for the working application.

For the initial test, the commands below reuse the API's existing URI without
printing it. This is a bootstrap convenience; replace it privately with the
dedicated backup user's URI before treating the setup as least privilege.

```bash
mkdir -p ~/app/.deploy ~/atlas-backups
```

```bash
chmod 700 ~/app/.deploy ~/atlas-backups
```

```bash
umask 077
```

Create a new file only; an existing config is preserved:

```bash
test ! -e ~/app/.deploy/weekly-mongodump.yml && docker exec app-api-1 node -e 'const uri=process.env.MONGODB_URI; if(!uri) process.exit(1); process.stdout.write("uri: "+JSON.stringify(uri)+"\n")' > ~/app/.deploy/weekly-mongodump.yml
```

```bash
chmod 600 ~/app/.deploy/weekly-mongodump.yml
```

The file contains a YAML `uri` value. To substitute a dedicated backup URI, edit
it with nano; keep the URI quoted, including its actual database name and URI-
encoded credentials. Never paste this file into chat, Git, or command arguments.

## 4. Run the first backup manually

```bash
cd ~/app
```

```bash
bash deploy/backup-mongodb-docker.sh
```

Expected output starts `Local export completed: atlas-weekly-...archive.gz`.
The job creates an archive, `.sha256`, `.manifest` and a restricted `.log`.
It uses a lock, a one-hour limit and a temporary file, checks nonzero size/gzip,
and preserves all older archives. It never deletes your October backup.

```bash
ls -lh ~/atlas-backups/atlas-weekly-*
```

Each manifest explicitly says that restore verification and off-server copying
are pending. A successful job here means a checked **local export**, not a fully
verified disaster-recovery backup. On failure inspect the private job log locally;
do not post its contents until checked for sensitive information.

## 5. Restore rehearsal — isolated Docker only

Choose the exact NEW archive filename from step 4, replacing ARCHIVE_NAME below.
Do not use the production URI, publish MongoDB ports, or use `--drop` on Atlas.

```bash
cd ~/atlas-backups
```

```bash
sha256sum -c ARCHIVE_NAME.archive.gz.sha256
```

```bash
docker run -d --name portal-weekly-restore-drill --network none --mount "type=bind,source=$HOME/atlas-backups,target=/backup,readonly" mongo:8.0 mongod --bind_ip 127.0.0.1 --wiredTigerCacheSizeGB 0.25
```

If that container name already exists, inspect it before deciding whether to
reuse or remove it. Wait until this prints `1`:

```bash
docker exec portal-weekly-restore-drill mongosh --quiet --eval 'db.adminCommand({ping:1}).ok'
```

```bash
docker exec portal-weekly-restore-drill mongorestore --host=127.0.0.1 --gzip --stopOnError --archive=/backup/ARCHIVE_NAME.archive.gz
```

Verify the final restored/failed counts. Then inspect counts and index counts only:

```bash
docker exec portal-weekly-restore-drill mongosh student-portal --quiet --eval 'db.getCollectionNames().sort().forEach(n=>print(n+": documents="+db.getCollection(n).countDocuments({})+", indexes="+db.getCollection(n).getIndexes().length))'
```

Check expected collections and representative counts. This proves readability,
not a consistent instant-in-time copy of a database receiving writes. Record the
archive name, UTC test time, duration, restore failure count and results in a
private recovery log without recording documents or credentials. Repeat monthly.

After confirming this is the disposable drill container, remove it and its
anonymous database volumes (the read-only host backup directory is preserved):

```bash
docker rm -fv portal-weekly-restore-drill
```

## 6. Download to your Windows PC (LOCAL PowerShell)

Run these on Windows, not inside SSH. Substitute the exact same filename.

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\VPS-Backups" | Out-Null
```

```powershell
scp "bhi47a@169.58.108.189:/home/bhi47a/atlas-backups/ARCHIVE_NAME.archive.gz" "$HOME\VPS-Backups\"
```

```powershell
scp "bhi47a@169.58.108.189:/home/bhi47a/atlas-backups/ARCHIVE_NAME.archive.gz.sha256" "$HOME\VPS-Backups\"
```

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath "$HOME\VPS-Backups\ARCHIVE_NAME.archive.gz"
```

```powershell
Get-Content -LiteralPath "$HOME\VPS-Backups\ARCHIVE_NAME.archive.gz.sha256"
```

Compare the hashes ignoring letter case. Record that this archive was copied
and checked. Download each weekly archive while the PC is online; scp is not an
automatic off-server schedule. Keep the PC copy independently recoverable from
the VPS. Do not delete older restore points yet; retention is not automated.

## 7. Enable the weekly schedule ONLY after steps 4–6 pass (VPS)

Review the service: User=bhi47a and paths assume `/home/bhi47a/app`.

```bash
cd ~/app
```

```bash
systemd-analyze calendar 'Sun *-*-* 02:00:00 Africa/Cairo'
```

This must show the intended Sunday 02:00 Cairo schedule. The explicit timezone
handles Cairo daylight-saving transitions; UTC archive filenames are separate.

```bash
sudo install -m 644 deploy/systemd/portal-mongodb-backup.service /etc/systemd/system/portal-mongodb-backup.service
```

```bash
sudo install -m 644 deploy/systemd/portal-mongodb-backup.timer /etc/systemd/system/portal-mongodb-backup.timer
```

```bash
sudo systemctl daemon-reload
```

Test the actual service once before enabling its timer:

```bash
sudo systemctl start portal-mongodb-backup.service
```

```bash
sudo systemctl status portal-mongodb-backup.service --no-pager
```

Expected result is `status=0/SUCCESS`; a successful oneshot may be inactive/dead
after it exits. Inspect any failure before scheduling.

```bash
sudo systemctl enable --now portal-mongodb-backup.timer
```

```bash
systemctl list-timers --all portal-mongodb-backup.timer
```

Persistent=true catches up a missed scheduled run after reboot. It does not
create a full set of historical missed weekly backups. The timer has its own
systemd installation and is independent of application CI/CD deployments.

## 8. Weekly checks, disable and recovery boundaries

VPS:

```bash
sudo journalctl -u portal-mongodb-backup.service -n 30 --no-pager
```

```bash
ls -lht ~/atlas-backups/atlas-weekly-*.archive.gz
```

Check that a new archive exists each week, download it, check its checksum, and
watch free disk space. systemd journals record failures, but **no automatic alert
is installed**. Investigate a missing successful export after eight days. Before
disk space becomes tight, agree a retention policy and protect known-good PC
copies; this script never automatically prunes archives.

To pause future scheduling:

```bash
sudo systemctl disable --now portal-mongodb-backup.timer
```

That does not stop an already-running backup service. Inspect it before stopping.
Keep `.deploy/weekly-mongodump.yml` private and outside Git.

For a real incident, do not adapt the rehearsal command to point at production.
Identify the recovery point, stop application writes through an approved incident
procedure, restore into a separate target, validate it, and then plan cutover.
The rehearsal above never modifies your live Atlas data.

## Evidence and remaining work

Repository checks can validate shell syntax and mocked success/failure behavior.
They do not establish that a VPS timer ran or that a real Atlas export restored.
Record those outcomes during steps 4–7; until then the schedule is unconfigured.

Remaining from the full recovery plan: encrypted exports with keys held separately,
automatic independent storage and remote checksum verification, defined retention,
failure/staleness alerts and measured RPO/RTO. Your Windows choice is the initial
manual off-server phase, not completion of these requirements.

## Production verification: 8 November 2026

The weekly service and timer are installed and enabled. The next observed run is
15 November at 02:00 Africa/Cairo (the VPS displays this as 01:00 CET). A fresh
`atlas-weekly-20261108T003205Z.ae7PPB.archive.gz` export was copied to
`D:\VPS-Backups` and its SHA-256 verified. The Windows copy is restricted to the
current user, SYSTEM, and Administrators. The original October archive remains.

The fresh export restored successfully into a disposable MongoDB 8 container on
the VPS with networking disabled. Collections and indexes were verified; restore
execution took 12 seconds. This measures a logical-database rehearsal, not a full
portal recovery or an off-host recovery-time guarantee. The container was removed
after verification; production Atlas was not restored or modified by this drill.

Daily encrypted course-material archives now have a separate Windows-pull setup;
see [the materials runbook](../../deploy/materials/WINDOWS-BACKUPS.md). That job
does not replace these full-database exports. Weekly full-Atlas off-server copies
remain manual and these `.gz` exports remain unencrypted; the materials email
monitor does not monitor this weekly job. Keep the separate retention and alert
limitations above visible when assessing whole-portal recovery coverage.

Sources: [mongodump security and consistency considerations](https://www.mongodb.com/docs/database-tools/mongodump/),
[Atlas Free cluster backup availability](https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/).
