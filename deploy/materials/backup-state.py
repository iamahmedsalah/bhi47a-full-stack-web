#!/usr/bin/env python3
"""List encrypted backups, acknowledge verified Windows copies, and send alerts."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import uuid

ARCHIVE = re.compile(r"^materials-\d{8}T\d{6}(?:\d{9})?Z\.tar\.age$")
UTC = dt.timezone.utc


def read_env(path):
    result = {}
    if not path.exists():
        return result
    for line in path.read_text().splitlines():
        match = re.match(r"^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$", line)
        if match:
            key, value = match.groups()
            if len(value) > 1 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            else:
                value = value.split(" #", 1)[0]
            result[key] = value
    return result


def config():
    return {**read_env(Path("/etc/student-portal/materials-backup.env")), **os.environ}


def atomic_json(path, value):
    temporary = path.with_name(path.name + ".partial-" + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        json.dump(value, output)
        output.write("\n")
    os.replace(temporary, path)


def checksum(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def list_archives(directory):
    result = []
    for path in sorted(directory.glob("materials-*.tar.age")):
        if not ARCHIVE.fullmatch(path.name) or path.is_symlink():
            continue
        sha_file = path.with_name(path.name + ".sha256")
        if not sha_file.is_file() or sha_file.is_symlink():
            continue
        digest = sha_file.read_text().split()[0]
        if not re.fullmatch(r"[a-fA-F0-9]{64}", digest):
            raise ValueError("Invalid archive checksum")
        result.append({"file": path.name, "sha256": digest.lower(), "bytes": path.stat().st_size})
    return {"version": 1, "directory": str(directory), "archives": result}


def acknowledge(root, directory, filename, digest):
    if not ARCHIVE.fullmatch(filename) or not re.fullmatch(r"[a-f0-9]{64}", digest):
        raise ValueError("Invalid backup receipt")
    archive = directory / filename
    if archive.is_symlink() or not archive.is_file():
        raise ValueError("Backup archive is unavailable")
    expected = archive.with_name(filename + ".sha256").read_text().split()[0].lower()
    if digest != expected or checksum(archive) != expected:
        raise ValueError("Off-server checksum does not match the archive")
    receipts = root / ".backup-receipts"
    receipts.mkdir(mode=0o700, exist_ok=True)
    now = dt.datetime.now(UTC).isoformat()
    receipt = {"archive": filename, "sha256": digest, "verifiedAt": now}
    atomic_json(receipts / (filename + ".json"), receipt)
    local = json.loads((root / ".backup-local-success.json").read_text())
    # An old archive copied today must not mask a missing latest recovery point.
    if local.get("archive") == filename:
        atomic_json(root / ".backup-success.json", {**receipt, "completedAt": local["completedAt"]})
    return {"verified": filename, "latest": local.get("archive") == filename}


def assess(root, now=None):
    now = now or dt.datetime.now(UTC)
    issues = []
    try:
        disk = shutil.disk_usage(root)
        used = 1 - disk.free / disk.total
        if used >= 0.8:
            issues.append({"code": "disk-critical" if used >= 0.9 else "disk-warning", "detail": f"Materials disk usage is {used:.1%}"})
    except OSError:
        issues.append({"code": "storage-unavailable", "detail": "Materials storage is unavailable"})
    try:
        age = now.timestamp() - (root / ".maintenance").stat().st_mtime
        if age > 15 * 60:
            issues.append({"code": "maintenance-stale", "detail": "Material mutations have been paused for over 15 minutes. Inspect active jobs before clearing the guard."})
    except FileNotFoundError:
        pass
    except OSError:
        issues.append({"code": "maintenance-check-failed", "detail": "Cannot check the material mutation guard"})
    for filename, label in [(".backup-local-success.json", "local"), (".backup-success.json", "off-server")]:
        try:
            marker = json.loads((root / filename).read_text())
            created = dt.datetime.fromisoformat(marker["completedAt"].replace("Z", "+00:00"))
            age = (now - created).total_seconds()
            if age < -300 or age > 26 * 3600:
                issues.append({"code": label + "-backup-stale", "detail": f"{label} backup is not a current recovery point"})
        except (OSError, ValueError, KeyError, TypeError):
            issues.append({"code": label + "-backup-missing", "detail": f"No verified {label} backup marker"})
    return issues


def recent_api_errors(output):
    uploads = missing = cleanup = 0
    for line in output.splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if not isinstance(row, dict):
            continue
        message = str(row.get("message", ""))
        if row.get("context") == "MaterialStorageService":
            missing += message == "Referenced material file is missing"
            cleanup += message in ["Failed to remove temporary material", "Uncommitted material requires reconciliation"]
        status = row.get("statusCode")
        upload_path = re.fullmatch(r"/api/(?:admin/)?courses/[a-fA-F0-9]{24}/(?:syllabus|materials)(?:\?.*)?", str(row.get("path", "")))
        if row.get("context") == "AllExceptionsFilter" and row.get("method") == "POST" and isinstance(status, int) and status >= 500 and upload_path and "Materials maintenance in progress" not in message:
            uploads += 1
    issues = []
    for code, count, label in [("recent-upload-errors", uploads, "material upload server errors"), ("recent-missing-files", missing, "missing material file errors"), ("recent-cleanup-errors", cleanup, "material cleanup errors")]:
        if count:
            issues.append({"code": code, "detail": f"Observed {count} {label} in the last 16 minutes. Inspect restricted API logs and verify reconciliation."})
    return issues


def api_log_issues(settings):
    container = settings.get("MATERIALS_API_CONTAINER", "app-api-1")
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]*", container):
        raise ValueError("Invalid API container name")
    try:
        result = subprocess.run(["docker", "logs", "--since", "16m", "--tail", "2000", container], capture_output=True, text=True, timeout=10, check=False)
        if result.returncode == 0:
            return recent_api_errors(result.stdout + "\n" + result.stderr)
    except (OSError, subprocess.TimeoutExpired):
        pass
    return [{"code": "api-log-check-failed", "detail": "Cannot inspect recent API material errors"}]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None


def notify(settings, subject, text):
    webhook = settings.get("MATERIALS_ALERT_WEBHOOK")
    headers = {"Content-Type": "application/json", "User-Agent": "StudentPortalBackupMonitor/1"}
    if webhook:
        url = urllib.parse.urlsplit(webhook)
        if url.scheme != "https" or url.username or url.password or url.fragment:
            raise ValueError("Alert webhook must be an HTTPS URL without embedded credentials")
        payload = {"text": subject + "\n" + text, "content": subject + "\n" + text}
        destination = webhook
    else:
        recipient = settings.get("MATERIALS_ALERT_EMAIL", "")
        if not re.fullmatch(r"[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+", recipient):
            raise ValueError("Configure an alert email or HTTPS webhook")
        portal = read_env(Path(settings.get("MATERIALS_PORTAL_ENV", "/home/bhi47a/app/.env.prod")))
        token = settings.get("MATERIALS_ALERT_RESEND_KEY") or portal.get("RESEND_API_KEY")
        sender = settings.get("MATERIALS_ALERT_FROM") or portal.get("RESEND_FROM_EMAIL")
        if not token or not sender:
            raise ValueError("Existing Resend sender/key are required for email alerts")
        destination = "https://api.resend.com/emails"
        headers["Authorization"] = "Bearer " + token
        payload = {"from": sender, "to": [recipient], "subject": subject, "text": text}
    request = urllib.request.Request(destination, data=json.dumps(payload).encode(), headers=headers, method="POST")
    opener = urllib.request.build_opener(NoRedirect)
    with opener.open(request, timeout=20) as response:
        if not 200 <= response.status < 300:
            raise ValueError("Alert delivery failed")
        response.read(4096)


def monitor(settings, dry_run=False, test_alert=False):
    root = Path(settings.get("MATERIALS_HOST_ROOT", "/srv/student-portal/materials"))
    now = dt.datetime.now(UTC)
    issues = assess(root, now)
    issues.extend(api_log_issues(settings))
    for unit in ["portal-materials-backup.service", "portal-materials-reconcile.service"]:
        failed = subprocess.run(["systemctl", "is-failed", "--quiet", unit], capture_output=True, check=False)
        if failed.returncode == 0:
            issues.append({"code": unit + "-failed", "detail": unit + " failed; inspect the restricted journal"})
    if dry_run:
        print(json.dumps({"issues": issues, "alertConfigured": bool(settings.get("MATERIALS_ALERT_EMAIL") or settings.get("MATERIALS_ALERT_WEBHOOK"))}))
        return
    if test_alert:
        notify(settings, "Student Portal: backup alert test", "The materials backup/storage alert channel is configured.")
        print("Test alert delivered")
        return
    state_path = Path(settings.get("MATERIALS_MONITOR_STATE", "/home/bhi47a/.local/state/portal-materials-monitor.json"))
    state_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        previous = json.loads(state_path.read_text())
    except (OSError, ValueError):
        previous = {}
    codes = sorted(item["code"] for item in issues)
    last_sent = dt.datetime.fromisoformat(previous.get("sentAt", "1970-01-01T00:00:00+00:00"))
    changed = previous.get("codes", []) != codes
    reminder = bool(codes) and (now - last_sent).total_seconds() >= 6 * 3600
    if changed or reminder:
        text = "\n".join(item["detail"] for item in issues) if issues else "Current backup, storage and recent-error checks no longer report alerts. Confirm previously reported file problems with reconciliation."
        notify(settings, "Student Portal: materials backup health", text)
        previous["sentAt"] = now.isoformat()
    atomic_json(state_path, {**previous, "codes": codes, "checkedAt": now.isoformat()})
    print(json.dumps({"issues": codes, "notified": changed or reminder}))


def main():
    settings = config()
    root = Path(settings.get("MATERIALS_HOST_ROOT", "/srv/student-portal/materials"))
    directory = Path(settings.get("MATERIALS_BACKUP_DIR", "/srv/student-portal/material-backups"))
    args = sys.argv[1:]
    if args == ["list"]:
        print(json.dumps(list_archives(directory)))
    elif len(args) == 3 and args[0] == "ack":
        print(json.dumps(acknowledge(root, directory, args[1], args[2])))
    elif args in [["monitor"], ["check"], ["test-alert"]]:
        monitor(settings, dry_run=args == ["check"], test_alert=args == ["test-alert"])
    elif args == ["create"]:
        repo = Path("/home/bhi47a/app")
        subprocess.run(["/bin/bash", str(repo / "deploy/materials/backup.sh")], cwd=repo, env=settings, check=True)
    else:
        raise ValueError("Use list, ack ARCHIVE SHA256, create, check, monitor, or test-alert")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Provider errors can contain credentials/URLs; never print their full text.
        print("Materials backup operation failed: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
