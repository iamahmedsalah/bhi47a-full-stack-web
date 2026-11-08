import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

source = Path(__file__).resolve().parents[1] / "materials" / "backup-state.py"
spec = importlib.util.spec_from_file_location("backup_state", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BackupStateTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="materials-state-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.files = self.root / "archives"
        self.files.mkdir()

    def archive(self, name):
        path = self.files / name
        path.write_bytes(b"encrypted fixture")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        path.with_name(name + ".sha256").write_text(digest + "  " + name + "\n")
        return digest

    def test_only_verified_latest_copy_updates_recovery_marker(self):
        old = "materials-20261106T083000Z.tar.age"
        latest = "materials-20261107T083000123456789Z.tar.age"
        old_hash = self.archive(old)
        latest_hash = self.archive(latest)
        completed = "2026-11-07T08:30:00Z"
        (self.root / ".backup-local-success.json").write_text(json.dumps({"archive": latest, "completedAt": completed}))
        module.acknowledge(self.root, self.files, old, old_hash)
        self.assertFalse((self.root / ".backup-success.json").exists())
        module.acknowledge(self.root, self.files, latest, latest_hash)
        marker = json.loads((self.root / ".backup-success.json").read_text())
        self.assertEqual(marker["archive"], latest)
        self.assertEqual(marker["completedAt"], completed)
        self.assertEqual(len(module.list_archives(self.files)["archives"]), 2)

    def test_receipts_reject_traversal_and_corrupted_archives(self):
        with self.assertRaises(ValueError):
            module.acknowledge(self.root, self.files, "../secret", "a" * 64)
        name = "materials-20261107T083000Z.tar.age"
        digest = self.archive(name)
        (self.files / name).write_bytes(b"corrupted")
        with self.assertRaises(ValueError):
            module.acknowledge(self.root, self.files, name, digest)
        self.assertFalse((self.root / ".backup-success.json").exists())

    def test_reports_stale_off_server_copies_and_disk_pressure(self):
        now = dt.datetime(2026, 11, 8, 10, tzinfo=dt.timezone.utc)
        (self.root / ".backup-local-success.json").write_text(json.dumps({"completedAt": now.isoformat()}))
        (self.root / ".backup-success.json").write_text(json.dumps({"completedAt": (now - dt.timedelta(hours=27)).isoformat()}))
        with patch.object(module.shutil, "disk_usage", return_value=type("Disk", (), {"total": 100, "free": 9})()):
            codes = {issue["code"] for issue in module.assess(self.root, now)}
        self.assertEqual(codes, {"disk-critical", "off-server-backup-stale"})

    def test_unavailable_storage_is_reported_instead_of_silently_crashing(self):
        with patch.object(module.shutil, "disk_usage", side_effect=FileNotFoundError()):
            codes = {issue["code"] for issue in module.assess(self.root)}
        self.assertIn("storage-unavailable", codes)

    def test_monitor_suppresses_duplicate_notifications(self):
        settings = {"MATERIALS_HOST_ROOT": str(self.root), "MATERIALS_MONITOR_STATE": str(self.root / "monitor.json")}
        issue = [{"code": "off-server-backup-stale", "detail": "Copy pending"}]
        healthy_unit = type("Result", (), {"returncode": 1})()
        with patch.object(module, "assess", return_value=issue), patch.object(module.subprocess, "run", return_value=healthy_unit), patch.object(module, "notify") as send:
            module.monitor(settings)
            module.monitor(settings)
            self.assertEqual(send.call_count, 1)
        with patch.object(module, "assess", return_value=[]), patch.object(module.subprocess, "run", return_value=healthy_unit), patch.object(module, "notify") as send:
            module.monitor(settings)
            self.assertEqual(send.call_count, 1)

    def test_dry_run_never_sends_alerts(self):
        settings = {"MATERIALS_HOST_ROOT": str(self.root)}
        with patch.object(module.subprocess, "run", return_value=type("Result", (), {"returncode": 1})()), patch.object(module, "notify") as send:
            module.monitor(settings, dry_run=True)
            send.assert_not_called()


if __name__ == "__main__":
    unittest.main()
