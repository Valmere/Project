#!/usr/bin/env python3
"""
Téléchargement des fichiers Supabase Storage dans le dossier backup/storage/.

Appelé depuis le workflow GitHub Actions (.github/workflows/backup.yml).
Lit les variables d'environnement SUPABASE_URL et SUPABASE_SERVICE_KEY
fournies par les Secrets GitHub.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path


BUCKETS = ["logos", "reports"]
TARGET_DIR = Path("backup/storage")


def supabase_request(path: str, *, method: str = "GET",
                     body: bytes | None = None) -> bytes:
    url = f"{os.environ['SUPABASE_URL']}{path}"
    key = os.environ["SUPABASE_SERVICE_KEY"]
    headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
    }
    if body is not None:
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, method=method, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def list_files(bucket: str) -> list[dict]:
    body = json.dumps({
        "prefix": "",
        "limit": 1000,
        "offset": 0,
        "sortBy": {"column": "name", "order": "asc"},
    }).encode()
    raw = supabase_request(
        f"/storage/v1/object/list/{bucket}",
        method="POST",
        body=body,
    )
    return json.loads(raw.decode())


def download_file(bucket: str, name: str, dest: Path) -> int:
    encoded = urllib.parse.quote(name)
    data = supabase_request(f"/storage/v1/object/{bucket}/{encoded}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return len(data)


def main() -> int:
    total = 0
    for bucket in BUCKETS:
        print(f"--- Bucket: {bucket} ---")
        try:
            files = list_files(bucket)
        except Exception as e:
            print(f"  ECHEC listing : {e}", file=sys.stderr)
            continue

        if not files:
            print("  (vide)")
            continue

        for f in files:
            name = f.get("name", "")
            if not name or name == ".emptyFolderPlaceholder":
                continue
            dest = TARGET_DIR / bucket / name
            try:
                size = download_file(bucket, name, dest)
                print(f"  {bucket}/{name} ({size // 1024} KB)")
                total += 1
            except Exception as e:
                print(f"  ECHEC {bucket}/{name} : {e}", file=sys.stderr)

    print(f"\nTotal fichiers téléchargés : {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
