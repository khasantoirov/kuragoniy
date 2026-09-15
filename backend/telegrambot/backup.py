"""
SQLite backup — replaces the old Firestore collection-by-collection JSON
export system (bot/backup/ in the Node.js version) with a single-file
approach appropriate for SQLite: an online-safe copy via Python's
stdlib sqlite3.Connection.backup() API, safe to run while the Django
server and bot process are both holding open WAL-mode connections.

Scheduling is left to OS-level cron (`manage.py backup_db`), not an
in-process scheduler — see BACKUP_SYSTEM.md notes for the old Node cron
approach this replaces conceptually, though the file format is entirely
different now (one .sqlite3 file, not per-collection JSON).
"""

import gzip
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings

BACKUP_DIR = settings.BASE_DIR / "backups"


def run_backup(compress: bool = True) -> Path:
    BACKUP_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = BACKUP_DIR / f"db-{stamp}.sqlite3"

    src_conn = sqlite3.connect(settings.DATABASES["default"]["NAME"])
    dest_conn = sqlite3.connect(dest)
    with dest_conn:
        src_conn.backup(dest_conn)
    src_conn.close()
    dest_conn.close()

    if compress:
        gz_path = dest.with_suffix(dest.suffix + ".gz")
        with open(dest, "rb") as f_in, gzip.open(gz_path, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
        dest.unlink()
        return gz_path
    return dest


def list_backups() -> list[Path]:
    if not BACKUP_DIR.exists():
        return []
    return sorted(BACKUP_DIR.glob("db-*.sqlite3*"), reverse=True)


def clean_old_backups(keep_days: int = 30) -> int:
    cutoff = datetime.now(timezone.utc).timestamp() - keep_days * 86400
    removed = 0
    for f in list_backups():
        if f.stat().st_mtime < cutoff:
            f.unlink()
            removed += 1
    return removed
