#!/usr/bin/env python3
"""Extract only regular manifest/files entries from a decrypted materials backup."""
from pathlib import Path
import re
import shutil
import sys
import tarfile


def extract(archive, destination):
    if destination.exists():
        raise ValueError("Use a fresh isolated restore directory")
    with tarfile.open(archive, "r:") as source:
        members = source.getmembers()
        names = set()
        for member in members:
            if not member.isfile() or not re.fullmatch(r"manifest\.json|files/[0-9a-f-]{36}", member.name) or member.name in names:
                raise ValueError("Unsafe or duplicate backup archive entry")
            names.add(member.name)
        if "manifest.json" not in names:
            raise ValueError("Backup manifest is missing")
        destination.mkdir(parents=True, mode=0o700)
        for member in members:
            target = destination / member.name
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            if not target.resolve().is_relative_to(destination.resolve()):
                raise ValueError("Archive path escapes restore directory")
            with source.extractfile(member) as input_file, target.open("xb") as output:
                shutil.copyfileobj(input_file, output, length=1024 * 1024)


if __name__ == "__main__":
    extract(Path(sys.argv[1]), Path(sys.argv[2]))
