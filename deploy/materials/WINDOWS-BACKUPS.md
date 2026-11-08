# Encrypted materials backups on Windows

The production API keeps metadata in Atlas and private files on the VPS. The VPS creates encrypted archives daily around 08:30 Cairo. Windows pulls all available archives at 09:00 local time and after sign-in. Email health checks run on the VPS every 15 minutes.

The Windows machine must be on, connected, and signed in. Missed copies catch up at the next run; a powered-off laptop cannot guarantee the 24-hour off-server recovery target. The VPS reports a stale off-server copy after 26 hours. A continuously available second destination is needed for an unconditional daily target.

## Windows installation

Run from this checkout in PowerShell:

```powershell
.\deploy\materials\install-windows-tools.ps1
.\deploy\materials\install-windows-task.ps1
.\deploy\materials\pull-windows.ps1
```

The tools installer checks the pinned official age release checksum. It creates a restricted `D:\VPS-Backups\materials-keys\identity.agekey` if absent and never replaces an existing key. Only its public recipient belongs on the VPS. Keep a separate protected recovery copy of the private key: losing both this laptop and its only key makes encrypted archives unrecoverable. Never send the private key through chat or store it on the VPS.

The task installer uses the current Windows identity, requires no stored Windows password, and copies its runner into `D:\VPS-Backups\scripts`. Review the task after a timezone change: 09:00 follows Windows local time. SSH uses the existing `github_actions_vps` key and pinned known-host entry. The task runs hidden with limited privileges and retries three times at 30-minute intervals.

Archives and checksums are stored under `D:\VPS-Backups\materials`. Partial downloads never replace a valid copy; corrupt copies are quarantined. Only a completed SHA-256 check sends a verification receipt. `last-pull.json` records successful runs and `last-error.json` records the latest failure (its timestamp may precede a subsequent success). No existing Atlas archive is deleted. Retain at least 35 days of encrypted archives on Windows and the VPS; this pull setup does not automatically delete archives.

## VPS installation

Complete the private directories, Nginx snippets, protected backup environment, deployment, and first restore drill described in [README.md](README.md) first. Then install the six supplied `portal-materials-{backup,monitor,reconcile}.{service,timer}` files into `/etc/systemd/system`, reload systemd, and enable the three timers. These are administrator commands. The service account is `bhi47a` (UID 1001); it can read private files and run Docker without interactive sudo. The protected environment must be owned by that account, mode 0600.

`python3 /home/bhi47a/app/deploy/materials/backup-state.py create` makes an initial backup using the protected configuration. `check` reports health without sending an email; `test-alert` verifies delivery. The monitor reuses the existing server-only Resend key and verified sender. No email key is copied to Windows or embedded in a unit.

## Restore rehearsal

Verify the encrypted archive against its `.sha256` file. Decrypt into a new restricted directory using `age.exe --decrypt --identity D:\VPS-Backups\materials-keys\identity.agekey --output <new-backup.tar> <archive.tar.age>`. Extract with `python deploy/materials/extract-restore.py <new-backup.tar> <fresh-directory>`; the extractor rejects links, path traversal, and duplicate entries.

Run `manage.cjs verify-backup <fresh-directory>` and then `restore-drill` with an explicit empty local `materials-restore-*` MongoDB target. Never restore into Atlas during a drill. Record archive checksum, document/file counts, elapsed time, and failures. Remove no legacy source until the 30-day delay and verified restore requirements are met.

## Weekly full-database backups

The existing guide is `docs/backups/weekly-mongodb-backups.md`. It describes Sunday 02:00 Cairo Atlas logical exports and a separate manual Windows copy; it does not by itself install a timer or provide encrypted off-server automation. Materials archives are a separate daily job and cannot restore users, grades, registrations, or the whole portal. Keep the October 23 Atlas archive and continue the full-database schedule independently.
