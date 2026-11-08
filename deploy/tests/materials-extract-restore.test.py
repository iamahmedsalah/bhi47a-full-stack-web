import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

source = Path(__file__).resolve().parents[1] / "materials" / "extract-restore.py"
spec = importlib.util.spec_from_file_location("materials_extract", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ExtractTest(unittest.TestCase):
    def test_rejects_traversal_and_symbolic_links_before_writing(self):
        with tempfile.TemporaryDirectory(prefix="materials-extract-") as directory:
            root = Path(directory)
            for index, name in enumerate(["../secret", "files/11111111-1111-4111-8111-111111111111"]):
                archive = root / (str(index) + ".tar")
                with tarfile.open(archive, "w") as output:
                    entry = tarfile.TarInfo(name)
                    if index == 1:
                        entry.type = tarfile.SYMTYPE
                        entry.linkname = "/etc/passwd"
                    output.addfile(entry)
                target = root / ("restore-" + str(index))
                with self.assertRaises(ValueError):
                    module.extract(archive, target)
                self.assertFalse(target.exists())

    def test_extracts_only_manifest_and_immutable_files(self):
        with tempfile.TemporaryDirectory(prefix="materials-extract-") as directory:
            root = Path(directory)
            archive = root / "backup.tar"
            with tarfile.open(archive, "w") as output:
                for name, data in [("manifest.json", b"{}"), ("files/11111111-1111-4111-8111-111111111111", b"%PDF-test")]:
                    entry = tarfile.TarInfo(name)
                    entry.size = len(data)
                    output.addfile(entry, io.BytesIO(data))
            module.extract(archive, root / "restore")
            self.assertEqual((root / "restore/manifest.json").read_bytes(), b"{}")


if __name__ == "__main__":
    unittest.main()
