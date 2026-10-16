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
import os
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
    # A backup nobody can restore is worse than none — verify the copy
    # before it replaces older ones in the rotation.
    status = dest_conn.execute("PRAGMA integrity_check").fetchone()[0]
    dest_conn.close()
    if status != "ok":
        dest.unlink(missing_ok=True)
        raise RuntimeError(f"Backup integrity check failed: {status}")

    if compress:
        gz_path = dest.with_suffix(dest.suffix + ".gz")
        with open(dest, "rb") as f_in, gzip.open(gz_path, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
        dest.unlink()
        return gz_path
    return dest


def encryption_key() -> bytes | None:
    key = os.environ.get("BACKUP_ENCRYPTION_KEY", "").strip()
    return key.encode() if key else None


def encrypt_bytes(payload: bytes) -> bytes:
    """Fernet (AES-128-CBC + HMAC-SHA256) with BACKUP_ENCRYPTION_KEY — used
    for every copy that leaves the server (Telegram), since the database
    now holds students' personal data and results. Keep the key somewhere
    other than this server: without it the encrypted copies can't be
    restored (`manage.py decrypt_backup`)."""
    from cryptography.fernet import Fernet

    return Fernet(encryption_key()).encrypt(payload)


def decrypt_bytes(payload: bytes, key: bytes) -> bytes:
    from cryptography.fernet import Fernet

    return Fernet(key).decrypt(payload)


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
