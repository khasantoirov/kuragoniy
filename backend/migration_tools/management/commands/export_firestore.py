"""
Read-only Firestore export — dumps every collection used by the old app
(see repo root firestore.rules) to JSON files for import_firestore.py to
consume. Never writes to Firestore.

Usage:
    manage.py export_firestore --key firebase-service-account.json --out /path/to/export
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from django.core.management.base import BaseCommand
from google.cloud import firestore


def _serialize(value):
    """Firestore-specific types (Timestamp, DocumentReference, GeoPoint)
    aren't JSON-serializable by default. Empirically, this project's
    `createdAt`/`updatedAt` fields come back as plain
    {'_seconds': int, '_nanoseconds': int} dicts rather than a native
    DatetimeWithNanoseconds — handle both shapes."""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, dict):
        if set(value.keys()) == {"_seconds", "_nanoseconds"}:
            return datetime.fromtimestamp(
                value["_seconds"] + value["_nanoseconds"] / 1e9, tz=timezone.utc
            ).isoformat()
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize(v) for v in value]
    if hasattr(value, "path"):  # DocumentReference
        return value.path
    return value


class Command(BaseCommand):
    help = "Read-only export of every Firestore collection to JSON files."

    def add_arguments(self, parser):
        parser.add_argument("--key", required=True, help="Path to the service account JSON key")
        parser.add_argument("--out", required=True, help="Output directory for the exported JSON files")

    def handle(self, *args, **options):
        client = firestore.Client.from_service_account_json(options["key"])
        out_dir = Path(options["out"])
        out_dir.mkdir(parents=True, exist_ok=True)

        top_level = ["users", "lessons", "announcements", "library", "timetables"]
        for name in top_level:
            docs = []
            for doc in client.collection(name).stream():
                docs.append({"id": doc.id, **_serialize(doc.to_dict())})
            (out_dir / f"{name}.json").write_text(json.dumps(docs, ensure_ascii=False, indent=2), encoding="utf-8")
            self.stdout.write(self.style.SUCCESS(f"{name}: {len(docs)} ta hujjat"))

        # journals/{uid}/classes/{classId} — subcollection, flattened with parent uid
        journals = []
        for user_doc in client.collection("journals").stream():
            uid = user_doc.id
            for class_doc in client.collection("journals").document(uid).collection("classes").stream():
                journals.append({"uid": uid, "class_id": class_doc.id, **_serialize(class_doc.to_dict())})
        (out_dir / "journals.json").write_text(json.dumps(journals, ensure_ascii=False, indent=2), encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(f"journals: {len(journals)} ta sinf"))

        self.stdout.write(self.style.SUCCESS(f"Eksport tugadi: {out_dir}"))
