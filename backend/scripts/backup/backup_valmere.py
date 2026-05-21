#!/usr/bin/env python
"""
Sauvegarde automatique de la plateforme Valmere & Co.

Ce script effectue une sauvegarde complète :
  1. Export de la base de données PostgreSQL (via pg_dump)
  2. Téléchargement de tous les fichiers Supabase Storage (logos, reports)
  3. Compression dans une archive ZIP horodatée
  4. Rotation : on garde N sauvegardes daily, N sauvegardes weekly,
     toutes les sauvegardes monthly indéfiniment.

Mode d'emploi
-------------
    python backup_valmere.py            # sauvegarde quotidienne
    python backup_valmere.py --weekly   # sauvegarde hebdomadaire
    python backup_valmere.py --monthly  # archive mensuelle (jamais purgée)

Pour la configuration, voir le fichier backup.env à côté de ce script.
Pour planifier l'exécution automatique, voir README_BACKUP.md.
"""

from __future__ import annotations
import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta
from pathlib import Path


# ─── Configuration via fichier .env ─────────────────────────────────────────

def load_config(env_path: Path) -> dict[str, str]:
    """Charge un fichier .env tout simple (KEY=value, ignore les # commentaires)."""
    config: dict[str, str] = {}
    if not env_path.exists():
        print(f"ERREUR : fichier de configuration introuvable : {env_path}")
        print("       Créez-le en copiant backup.env.example puis remplissez les valeurs.")
        sys.exit(1)
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        config[key.strip()] = value.strip().strip('"').strip("'")
    return config


# ─── Export PostgreSQL ──────────────────────────────────────────────────────

def export_database(config: dict[str, str], output_file: Path) -> None:
    """Lance pg_dump pour exporter le schema public dans output_file."""
    pg_dump = config.get("PG_DUMP_PATH", "pg_dump")
    cmd = [
        pg_dump,
        "-h", config["DB_HOST"],
        "-p", config.get("DB_PORT", "5432"),
        "-U", config["DB_USER"],
        "-d", config["DB_NAME"],
        "-n", "public",
        "--no-owner",
        "--no-acl",
        "--clean",
        "--if-exists",
        "-f", str(output_file),
    ]
    env = os.environ.copy()
    env["PGPASSWORD"] = config["DB_PASSWORD"]
    print(f"  Lancement de pg_dump vers {output_file.name}...")
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        print("  ECHEC pg_dump :")
        print(result.stderr)
        raise RuntimeError("pg_dump a echoue")
    size_kb = output_file.stat().st_size // 1024
    print(f"  OK : {size_kb} KB")


# ─── Téléchargement des fichiers Storage ───────────────────────────────────

def list_storage_files(supabase_url: str, supabase_key: str, bucket: str) -> list[dict]:
    """Liste tous les fichiers d'un bucket Supabase Storage."""
    body = json.dumps({
        "prefix": "",
        "limit": 1000,
        "offset": 0,
        "sortBy": {"column": "name", "order": "asc"},
    }).encode()
    req = urllib.request.Request(
        f"{supabase_url}/storage/v1/object/list/{bucket}",
        method="POST",
        data=body,
        headers={
            "Authorization": f"Bearer {supabase_key}",
            "apikey": supabase_key,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def download_storage_file(supabase_url: str, supabase_key: str,
                          bucket: str, name: str, dest: Path) -> int:
    """Télécharge un fichier d'un bucket vers dest. Retourne la taille."""
    encoded = urllib.parse.quote(name)
    req = urllib.request.Request(
        f"{supabase_url}/storage/v1/object/{bucket}/{encoded}",
        headers={
            "Authorization": f"Bearer {supabase_key}",
            "apikey": supabase_key,
        },
    )
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
        data = r.read()
        f.write(data)
        return len(data)


def export_storage(config: dict[str, str], output_dir: Path) -> dict[str, int]:
    """Télécharge tous les fichiers des buckets Supabase Storage."""
    url = config["SUPABASE_URL"]
    key = config["SUPABASE_SERVICE_KEY"]
    buckets = [b.strip() for b in config.get("SUPABASE_BUCKETS", "logos,reports").split(",") if b.strip()]

    stats: dict[str, int] = {}
    for bucket in buckets:
        bucket_dir = output_dir / bucket
        try:
            files = list_storage_files(url, key, bucket)
        except Exception as e:
            print(f"  Bucket {bucket} : echec listing ({e})")
            stats[bucket] = -1
            continue

        if not files:
            print(f"  Bucket {bucket} : vide")
            stats[bucket] = 0
            continue

        count = 0
        for f in files:
            name = f.get("name", "")
            if not name or name == ".emptyFolderPlaceholder":
                continue
            try:
                size = download_storage_file(url, key, bucket, name, bucket_dir / name)
                count += 1
                print(f"  {bucket}/{name} ({size // 1024} KB)")
            except Exception as e:
                print(f"  ECHEC {bucket}/{name} : {e}")
        stats[bucket] = count
    return stats


# ─── Création de l'archive ZIP ──────────────────────────────────────────────

def make_zip(source_dir: Path, zip_path: Path) -> int:
    """Compresse source_dir en zip_path. Retourne la taille du ZIP."""
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(source_dir):
            for name in files:
                full = Path(root) / name
                arc = full.relative_to(source_dir.parent)
                zf.write(full, arc)
    return zip_path.stat().st_size


# ─── Rotation des sauvegardes ───────────────────────────────────────────────

def rotate(folder: Path, prefix: str, keep: int) -> None:
    """Garde uniquement les `keep` plus récents ZIP commençant par `prefix`."""
    if not folder.exists():
        return
    zips = sorted(
        [f for f in folder.iterdir() if f.is_file() and f.name.startswith(prefix) and f.suffix == ".zip"],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in zips[keep:]:
        print(f"  Suppression ancienne sauvegarde : {old.name}")
        old.unlink()


# ─── Programme principal ────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sauvegarde Valmere & Co")
    parser.add_argument("--weekly", action="store_true", help="Sauvegarde hebdomadaire (rotation 12)")
    parser.add_argument("--monthly", action="store_true", help="Archive mensuelle (jamais purgée)")
    parser.add_argument("--keep-daily", type=int, default=14, help="Nombre de daily à conserver")
    parser.add_argument("--keep-weekly", type=int, default=12, help="Nombre de weekly à conserver")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    config = load_config(script_dir / "backup.env")
    base_output = Path(config.get("BACKUP_ROOT", str(Path.home() / "Documents" / "Valmere_Backups")))

    if args.monthly:
        kind, subfolder, prefix, keep = "monthly", "monthly", "valmere_monthly_", None
    elif args.weekly:
        kind, subfolder, prefix, keep = "weekly", "weekly", "valmere_weekly_", args.keep_weekly
    else:
        kind, subfolder, prefix, keep = "daily", "daily", "valmere_daily_", args.keep_daily

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    target_dir = base_output / subfolder
    target_dir.mkdir(parents=True, exist_ok=True)

    work_dir = target_dir / f"_tmp_{timestamp}"
    work_dir.mkdir(exist_ok=True)
    storage_dir = work_dir / "storage"
    storage_dir.mkdir(exist_ok=True)

    print(f"=== Sauvegarde Valmere & Co ({kind}) — {timestamp} ===\n")

    # 1. Base de données
    print("[1/3] Export PostgreSQL")
    db_file = work_dir / f"valmere_db_{timestamp}.sql"
    try:
        export_database(config, db_file)
    except Exception as e:
        print(f"\nABANDON : echec de l'export DB : {e}")
        shutil.rmtree(work_dir, ignore_errors=True)
        sys.exit(1)

    # 2. Fichiers Storage
    print("\n[2/3] Téléchargement Supabase Storage")
    storage_stats = export_storage(config, storage_dir)

    # 3. Fichier d'info
    info = work_dir / "backup_info.txt"
    info.write_text(
        f"Sauvegarde {kind.upper()} Valmere & Co\n"
        f"Date     : {datetime.now().isoformat(sep=' ', timespec='seconds')}\n"
        f"Source   : projet Supabase {config['SUPABASE_URL']}\n"
        f"DB file  : {db_file.name}\n"
        f"Storage  : {', '.join(f'{k}={v}' for k, v in storage_stats.items())}\n",
        encoding="utf-8",
    )

    # 4. Compression
    print("\n[3/3] Compression en ZIP")
    zip_path = target_dir / f"{prefix}{timestamp}.zip"
    size = make_zip(work_dir, zip_path)
    print(f"  Archive : {zip_path.name} ({size // 1024} KB)")

    # Nettoyage du dossier temporaire
    shutil.rmtree(work_dir, ignore_errors=True)

    # 5. Rotation
    if keep is not None:
        print(f"\nRotation : on garde les {keep} sauvegardes {kind} les plus récentes")
        rotate(target_dir, prefix, keep)

    print(f"\nSauvegarde {kind} terminée avec succès")
    print(f"   {zip_path}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterruption utilisateur.")
        sys.exit(130)
    except Exception as e:
        print(f"\nERREUR FATALE : {e}", file=sys.stderr)
        sys.exit(1)
