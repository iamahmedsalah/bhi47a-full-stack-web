#!/usr/bin/env python3
"""Install materials locations into the existing HTTPS site, preserving Certbot."""
import datetime
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

INCLUDE = "include /etc/nginx/snippets/portal-materials-locations.conf;"
SITE = Path("/etc/nginx/sites-available/bhi47.app.conf")
SNIPPETS = ("portal-materials-proxy.conf", "portal-materials-locations.conf")


def add_include(text):
    names = list(re.finditer(r"(?m)^\s*server_name\s+bhi47\.app\s+www\.bhi47\.app\s*;", text))
    if not names:
        raise ValueError("Canonical bhi47.app server block was not found")
    first = text[:names[1].start()] if len(names) > 1 else text
    if not re.search(r"listen\s+(?:\[::\]:)?443\s+ssl", first) or "ssl_certificate " not in first:
        raise ValueError("The first canonical server must be the existing HTTPS server")
    if INCLUDE in first:
        return text
    point = names[0].end()
    return text[:point] + "\n\n    " + INCLUDE + text[point:]


def main():
    if os.geteuid() != 0:
        raise PermissionError("Run this reviewed script with sudo")
    if not SITE.is_file() or SITE.is_symlink():
        raise ValueError("Expected the existing canonical site to be a regular file")
    original = SITE.read_text()
    updated = add_include(original)
    source = Path(__file__).resolve().parent
    if not (source / SNIPPETS[0]).is_file():
        source = source.parent / "nginx"
    for name in SNIPPETS:
        if not (source / name).is_file() or (source / name).is_symlink():
            raise ValueError("Required reviewed Nginx snippet is missing")
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = Path("/etc/nginx/materials-backups") / stamp
    backup.mkdir(parents=True, mode=0o700)
    backup.parent.chmod(0o700)
    shutil.copy2(SITE, backup / SITE.name)
    destination = Path("/etc/nginx/snippets")
    existing = {}
    for name in SNIPPETS:
        target = destination / name
        if target.is_symlink():
            raise ValueError("Refusing to overwrite a symbolic link")
        existing[name] = target.exists()
        if target.exists():
            shutil.copy2(target, backup / name)
    try:
        destination.mkdir(exist_ok=True)
        for name in SNIPPETS:
            shutil.copyfile(source / name, destination / name)
            (destination / name).chmod(0o644)
        SITE.write_text(updated)
        subprocess.run(["/usr/sbin/nginx", "-t"], check=True)
        subprocess.run(["/usr/bin/systemctl", "reload", "nginx"], check=True)
    except Exception:
        shutil.copy2(backup / SITE.name, SITE)
        for name in SNIPPETS:
            target = destination / name
            if existing[name]:
                shutil.copy2(backup / name, target)
            elif target.exists():
                target.unlink()
        subprocess.run(["/usr/sbin/nginx", "-t"], check=False)
        subprocess.run(["/usr/bin/systemctl", "reload", "nginx"], check=False)
        raise
    print("Materials Nginx locations installed; existing HTTPS configuration preserved.")
    print("Rollback files:", backup)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Nginx setup failed:", type(error).__name__, file=sys.stderr)
        sys.exit(1)
