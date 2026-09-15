"""
Imports the JSON files produced by export_firestore.py into the Django
models. Idempotent where practical (update_or_create on natural keys) so
it can be re-run against a fresh export before final cutover.

Usage:
    manage.py import_firestore --in /path/to/export [--dry-run]
"""

import base64
import json
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models.signals import post_save

from accounts.models import User
from announcements.models import Announcement
from journal.models import AttendanceEntry, ClassDay, FinalGrade, GradeEntry, JournalClass, Student
from lessons.models import Experiment, Lesson
from library.models import LibraryItem
from timetable.models import TimetableSlot


def _parse_dt(value):
    return datetime.fromisoformat(value) if value else None


class Command(BaseCommand):
    help = "Imports Firestore JSON export (see export_firestore.py) into Django models."

    def add_arguments(self, parser):
        parser.add_argument("--in", dest="in_dir", required=True)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        in_dir = Path(options["in_dir"])

        # Bulk-loading historical data shouldn't queue translation jobs or
        # fan out announcements to Telegram/WebSocket — disconnect the
        # signals for the duration of the import.
        from announcements.signals import push_announcement
        from lessons.signals import queue_translation_job

        post_save.disconnect(queue_translation_job, sender=Lesson)
        post_save.disconnect(push_announcement, sender=Announcement)
        try:
            with transaction.atomic():
                user_ids = self._import_users(in_dir)
                self._import_lessons(in_dir)
                self._import_library(in_dir)
                self._import_announcements(in_dir)
                self._import_timetables(in_dir, user_ids)
                self._import_journals(in_dir, user_ids)

                if options["dry_run"]:
                    transaction.set_rollback(True)
                    self.stdout.write(self.style.WARNING("DRY RUN — hech narsa saqlanmadi."))
        finally:
            post_save.connect(queue_translation_job, sender=Lesson)
            post_save.connect(push_announcement, sender=Announcement)

    # ── users ──────────────────────────────────────────────────────

    def _import_users(self, in_dir) -> set[str]:
        data = json.loads((in_dir / "users.json").read_text(encoding="utf-8"))
        seen = set()
        count = 0
        for u in data:
            seen.add(u["id"])
            user, created = User.objects.update_or_create(
                id=u["id"],
                defaults=dict(
                    email=u.get("email") or f"{u['id']}@migrated.local",
                    name=u.get("name", ""),
                    role=u.get("role", "teacher"),
                    approved=u.get("approved", False),
                    bday=u.get("bday") or None,
                    phone=u.get("phone", ""),
                    telegram_linked=u.get("telegramLinked", False),
                    telegram_chat_id=u.get("telegramChatId"),
                    telegram_username=u.get("telegramUsername", ""),
                    is_dev_superuser=(u.get("email") in settings.DEV_SUPERUSER_EMAILS),
                ),
            )
            if created:
                # Firebase Auth password hashes can't be migrated — these
                # accounts must go through password reset before login.
                user.set_unusable_password()
                user.save(update_fields=["password"])

            created_at = _parse_dt(u.get("createdAt"))
            if created_at:
                User.objects.filter(id=user.id).update(created_at=created_at)

            photo = u.get("photo")
            if photo and photo.startswith("data:image") and not user.photo:
                header, _, b64data = photo.partition(",")
                ext = "png" if "png" in header else "jpg"
                user.photo.save(f"{user.id}.{ext}", ContentFile(base64.b64decode(b64data)), save=True)

            count += 1
        self.stdout.write(self.style.SUCCESS(f"users: {count} ta import qilindi"))
        return seen

    # ── lessons + experiments ─────────────────────────────────────

    def _import_lessons(self, in_dir):
        data = json.loads((in_dir / "lessons.json").read_text(encoding="utf-8"))
        count = 0
        for l in data:  # noqa: E741
            lesson, _ = Lesson.objects.update_or_create(
                title=l["title"], grade=l["grade"], chorak=l["chorak"], hafta=l["hafta"],
                defaults=dict(
                    title_ru=l.get("title_ru", ""), title_en=l.get("title_en", ""),
                    cat=l.get("cat") or "boshqa",
                    goal=l.get("goal", ""), goal_ru=l.get("goal_ru", ""), goal_en=l.get("goal_en", ""),
                    file_url=l.get("fileUrl") or "",
                    sim_id=l.get("simId") or "",
                ),
            )

            updated_at = _parse_dt(l.get("updatedAt"))
            translated_at = _parse_dt(l.get("translatedAt"))
            if updated_at:
                Lesson.objects.filter(id=lesson.id).update(updated_at=updated_at, translated_at=translated_at)

            lesson.experiments.all().delete()
            for i, e in enumerate(l.get("experiments", [])):
                Experiment.objects.create(
                    lesson=lesson, order=i,
                    name=e.get("name", ""), name_ru=e.get("name_ru", ""), name_en=e.get("name_en", ""),
                    type=e.get("type") or "oddiy",
                    desc=e.get("desc", ""), desc_ru=e.get("desc_ru", ""), desc_en=e.get("desc_en", ""),
                    materials=e.get("materials") or [],
                    materials_ru=e.get("materials_ru") or [],
                    materials_en=e.get("materials_en") or [],
                    steps=e.get("steps") or [],
                    steps_ru=e.get("steps_ru") or [],
                    steps_en=e.get("steps_en") or [],
                    minutes=e.get("minutes"),
                    safety=e.get("safety", ""), safety_ru=e.get("safety_ru", ""), safety_en=e.get("safety_en", ""),
                    image=e.get("image") or "", video=e.get("video") or "",
                )
            count += 1
        self.stdout.write(self.style.SUCCESS(f"lessons: {count} ta import qilindi"))

    # ── library ────────────────────────────────────────────────────

    def _import_library(self, in_dir):
        data = json.loads((in_dir / "library.json").read_text(encoding="utf-8"))
        count = 0
        for it in data:
            LibraryItem.objects.update_or_create(
                title=it["title"], url=it["url"],
                defaults=dict(kind=it.get("kind") or "havola", grade=it.get("grade"), note=it.get("note", "")),
            )
            count += 1
        self.stdout.write(self.style.SUCCESS(f"library: {count} ta import qilindi"))

    # ── announcements ──────────────────────────────────────────────

    def _import_announcements(self, in_dir):
        data = json.loads((in_dir / "announcements.json").read_text(encoding="utf-8"))
        count = 0
        for a in data:
            by_user = User.objects.filter(name=a.get("by")).first() if a.get("by") else None
            ann, _ = Announcement.objects.update_or_create(
                text=a["text"], at=_parse_dt(a.get("at")),
                defaults=dict(by=by_user),
            )
            count += 1
        self.stdout.write(self.style.SUCCESS(f"announcements: {count} ta import qilindi"))

    # ── timetables ─────────────────────────────────────────────────

    def _import_timetables(self, in_dir, user_ids: set[str]):
        data = json.loads((in_dir / "timetables.json").read_text(encoding="utf-8"))
        count = 0
        skipped_owners = 0
        for doc in data:
            teacher_id = doc["id"]
            if teacher_id not in user_ids:
                # Orphaned timetable — the owning Firestore user doc no
                # longer exists (deleted account). Nothing to attach it to.
                skipped_owners += 1
                continue

            for key, slot in (doc.get("slots") or {}).items():
                day_str, period_str = key.split(":")
                day_index, period_index = int(day_str), int(period_str)

                if isinstance(slot, str):
                    # Some real rows are a bare string (legacy quick-entry
                    # shorthand) instead of the full slot object.
                    slot = {"maktab": slot}

                TimetableSlot.objects.update_or_create(
                    teacher_id=teacher_id, day_index=day_index, period_index=period_index,
                    defaults=dict(
                        time_from=slot.get("from") or None,
                        time_to=slot.get("to") or None,
                        maktab=slot.get("maktab", ""),
                        xona=slot.get("xona", ""),
                        sinf=slot.get("sinf", ""),
                        span=slot.get("span") or 1,
                        band=bool(slot.get("band", False)),
                    ),
                )
                count += 1
        msg = f"timetables: {count} ta slot import qilindi"
        if skipped_owners:
            msg += f" ({skipped_owners} ta hujjat egasi topilmadi, o'tkazib yuborildi)"
        self.stdout.write(self.style.SUCCESS(msg))

    # ── journals (positional-index -> normalized FK remap) ──────────

    def _import_journals(self, in_dir, user_ids: set[str]):
        data = json.loads((in_dir / "journals.json").read_text(encoding="utf-8"))
        class_count = 0
        skipped_owners = 0

        for doc in data:
            uid = doc["uid"]
            if uid not in user_ids:
                skipped_owners += 1
                continue

            journal_class = JournalClass.objects.create(
                teacher_id=uid, school=doc.get("school", ""), name=doc.get("name", ""),
            )

            students_arr = doc.get("students") or []
            student_rows = [
                Student.objects.create(journal_class=journal_class, full_name=name, order=i)
                for i, name in enumerate(students_arr)
            ]

            day_by_date = {}
            topics = doc.get("topics") or {}
            for chorak, dates in (doc.get("days") or {}).items():
                for date_str in dates:
                    day, _ = ClassDay.objects.get_or_create(
                        journal_class=journal_class, date=date_str,
                        defaults={"chorak": int(chorak), "topic": topics.get(date_str, "")},
                    )
                    day_by_date[date_str] = day

            def _resolve(date_str, idx_str):
                day = day_by_date.get(date_str)
                idx = int(idx_str)
                if day is None or idx >= len(student_rows):
                    return None, None
                return day, student_rows[idx]

            for key, mark in (doc.get("marks") or {}).items():
                date_str, _, idx_str = key.rpartition(":")
                day, student = _resolve(date_str, idx_str)
                if day and student and mark:
                    GradeEntry.objects.get_or_create(student=student, day=day, defaults={"mark": int(mark)})

            for key, status in (doc.get("att") or {}).items():
                if not status:
                    continue
                date_str, _, idx_str = key.rpartition(":")
                day, student = _resolve(date_str, idx_str)
                if day and student:
                    AttendanceEntry.objects.get_or_create(student=student, day=day, defaults={"status": status})

            for chorak, finals in (doc.get("final") or {}).items():
                for idx_str, mark in finals.items():
                    idx = int(idx_str)
                    if idx < len(student_rows) and mark:
                        FinalGrade.objects.get_or_create(
                            student=student_rows[idx], chorak=int(chorak), defaults={"mark": int(mark)},
                        )

            class_count += 1

        msg = f"journals: {class_count} ta sinf import qilindi"
        if skipped_owners:
            msg += f" ({skipped_owners} ta hujjat egasi topilmadi, o'tkazib yuborildi)"
        self.stdout.write(self.style.SUCCESS(msg))
