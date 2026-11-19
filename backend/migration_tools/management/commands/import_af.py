"""Copies amaliyfizika.uz's content and staff into Ko'ragoniy Edu as the
Amaliy fizika fan. Reads that platform's SQLite database read-only, and its
media folder; amaliyfizika.uz itself is never changed and keeps running.

    manage.py import_af --source /tmp/af.sqlite3 --media /opt/amaliy-fizika/backend/media           # report only
    manage.py import_af --source /tmp/af.sqlite3 --media /opt/amaliy-fizika/backend/media --apply   # copy

What comes over
  * lessons — grade 7/8/9 becomes F7/F8/F9 (common/subjects.py) — with their
    experiments, equipment and files; equipment sheets; lesson materials and
    lesson-bank questions; library items (fan: fizika); which quarters are
    open to teachers (they become the fizika fan's QuarterLocks);
  * staff accounts: approved, active teachers, admins and boshliqlar, with
    their login, password hash, name, phone, birth date and photo, pointed to
    the fizika fan. Anyone already here (same email or login) keeps their
    account here as it is, and isn't copied.
What doesn't
  journals, classes, pupils and the timetable (they stay on amaliyfizika.uz),
  Telegram links (another bot — they link here through the phone sign-in),
  2FA secrets, the virtual-lab link (sim_id) and the lesson category (cat).

Every copied row is listed in migration_tools.ImportedRow, so a second run
copies only what is new. Everything goes in one transaction; on any error
nothing is kept (the files copied so far are removed again).
"""

import json
import sqlite3
from datetime import timedelta
from datetime import timezone as dt_timezone
from pathlib import Path

from django.core.files import File
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError
from django.db import models, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from accounts.models import User
from learning.models import LessonMaterial, Question
from lessons.models import EquipmentItem, EquipmentSheet, Experiment, Lesson, QuarterLock
from lessons.signals import send_lessons_backup, suppress_lessons_backup
from library.models import LibraryItem
from migration_tools.models import ImportedRow

SOURCE = 'af'
STAFF_ROLES = ('teacher', 'admin', 'boshliq')
GRADE = {7: 'F7', 8: 'F8', 9: 'F9'}

# account fields that are not carried over (per-platform, or security state)
USER_SKIP = {
    'subjects', 'telegram_linked', 'telegram_chat_id', 'telegram_username', 'totp_secret', 'totp_enabled',
    'failed_login_count', 'locked_until', 'is_dev_superuser', 'is_superuser', 'is_staff', 'tokens_valid_after',
    'logged_out_at', 'last_seen_at', 'created_at',
}


def convert(field, value):
    """A raw SQLite value as the Django field holds it."""
    if value is None:
        return None
    if isinstance(field, models.BooleanField):
        return bool(value)
    if isinstance(field, models.DateTimeField):
        d = parse_datetime(value) if isinstance(value, str) else value
        if d is not None and timezone.is_naive(d):
            d = timezone.make_aware(d, dt_timezone.utc)
        return d
    if isinstance(field, models.DateField):
        return parse_date(value) if isinstance(value, str) else value
    if isinstance(field, models.JSONField):
        return json.loads(value) if isinstance(value, (str, bytes)) else value
    return value


def fields_from(model, row, skip=()):
    """The plain columns `row` shares with `model` (no keys, relations or files)."""
    cols = set(row.keys())
    out = {}
    for f in model._meta.concrete_fields:
        if f.primary_key or f.name in skip or isinstance(f, (models.ForeignKey, models.FileField)):
            continue
        if f.column in cols:
            out[f.attname] = convert(f, row[f.column])
    return out


def _digits(phone) -> str:
    d = ''.join(ch for ch in str(phone or '') if ch.isdigit())
    return d[-9:] if len(d) >= 9 else d


class Files:
    """Copies media files from the other platform's MEDIA_ROOT into ours,
    remembering what it saved so a failed run can take them back."""

    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.saved: list[str] = []
        self.missing: list[str] = []
        self.count = 0
        self.bytes = 0

    def _path(self, name):
        if not name:
            return None
        p = (self.root / name).resolve()
        if self.root not in p.parents or not p.is_file():
            self.missing.append(name)
            return None
        return p

    def plan(self, name):
        p = self._path(name)
        if p:
            self.count += 1
            self.bytes += p.stat().st_size

    def copy(self, name):
        p = self._path(name)
        if not p:
            return None
        with p.open('rb') as fh:
            new = default_storage.save(name, File(fh))  # same folder; a taken name gets a suffix
        self.saved.append(new)
        self.count += 1
        self.bytes += p.stat().st_size
        return new

    def rollback(self):
        for name in self.saved:
            try:
                default_storage.delete(name)
            except OSError:
                pass


class Command(BaseCommand):
    help = "amaliyfizika.uz'ning darslari, tajribalari, kutubxonasi va xodimlarini Amaliy fizika fani sifatida ko'chiradi."

    def add_arguments(self, parser):
        parser.add_argument('--source', required=True, help="amaliyfizika.uz'ning SQLite bazasi (nusxasi)")
        parser.add_argument('--media', required=True, help="amaliyfizika.uz'ning MEDIA_ROOT papkasi")
        parser.add_argument('--apply', action='store_true', help="Haqiqatda ko'chirish (aks holda faqat hisobot)")

    # ── reading ──────────────────────────────────────────────────────────
    def _rows(self, sql, *args):
        return self.src.execute(sql, args).fetchall()

    def _has(self, table):
        return bool(self._rows("select name from sqlite_master where type='table' and name=?", table))

    def _done(self, table) -> dict[str, str]:
        return dict(ImportedRow.objects.filter(source=SOURCE, table=table).values_list('source_id', 'target_id'))

    def _mark(self, table, source_id, target_id):
        ImportedRow.objects.create(source=SOURCE, table=table, source_id=str(source_id), target_id=str(target_id))

    def _staff(self):
        done = self._done('accounts_user')
        emails = {e.lower() for e in User.objects.exclude(email=None).values_list('email', flat=True)}
        logins = {u.lower() for u in User.objects.exclude(username=None).values_list('username', flat=True)}
        logins |= {u.lower() for u in User.objects.exclude(previous_username=None).values_list('previous_username', flat=True)}
        ids = set(User.objects.values_list('id', flat=True))
        phones = {_digits(p): n for p, n in User.objects.exclude(phone='').values_list('phone', 'name')}
        take, skip, phone_clash = [], [], []
        for r in self._rows('select * from accounts_user order by role, name'):
            who = f"{r['name']} ({r['username'] or r['email'] or r['id']})"
            email, login = (r['email'] or '').lower(), (r['username'] or '').lower()
            if r['id'] in done:
                skip.append((who, "oldin ko'chirilgan"))
            elif r['role'] not in STAFF_ROLES:
                skip.append((who, f"rol: {r['role']}"))
            elif r['is_dev_superuser']:
                skip.append((who, 'dasturchi'))
            elif not r['approved'] or not r['is_active']:
                skip.append((who, 'tasdiqlanmagan yoki bloklangan'))
            elif (email and email in emails) or (login and login in logins):
                skip.append((who, "kuragoniy.uz'da allaqachon bor — o'sha hisob qoladi"))
            elif r['id'] in ids:
                skip.append((who, 'id band'))
            else:
                take.append(r)
                d = _digits(r['phone'])
                if d and d in phones:
                    phone_clash.append((who, phones[d]))
        return take, skip, phone_clash

    # ── the command ──────────────────────────────────────────────────────
    def handle(self, *args, source, media, apply, **opts):
        if not Path(source).is_file():
            raise CommandError(f'Baza topilmadi: {source}')
        if not Path(media).is_dir():
            raise CommandError(f'Media papkasi topilmadi: {media}')
        self.src = sqlite3.connect(f'file:{Path(source).as_posix()}?mode=ro', uri=True)
        self.src.row_factory = sqlite3.Row
        files = Files(media)
        out = self.stdout.write

        staff, skipped, phone_clash = self._staff()
        done_lessons = self._done('lessons_lesson')
        lessons = [r for r in self._rows('select * from lessons_lesson order by grade, chorak, hafta, id')
                   if str(r['id']) not in done_lessons]
        bad_grade = [r for r in lessons if r['grade'] not in GRADE]
        lessons = [r for r in lessons if r['grade'] in GRADE]
        lesson_ids = [r['id'] for r in lessons]
        exps = self._rows(f"select * from lessons_experiment where lesson_id in ({','.join('?' * len(lesson_ids)) or 'null'}) "
                          'order by lesson_id, "order", id', *lesson_ids) if lesson_ids else []
        exp_ids = [r['id'] for r in exps]
        items = self._rows(f"select * from lessons_equipmentitem where experiment_id in ({','.join('?' * len(exp_ids)) or 'null'}) "
                           'order by experiment_id, "order", id', *exp_ids) if exp_ids else []
        done_sheets, done_books = self._done('lessons_equipmentsheet'), self._done('library_libraryitem')
        sheets = [r for r in self._rows('select * from lessons_equipmentsheet order by id')
                  if str(r['id']) not in done_sheets and r['grade'] in GRADE]
        books = [r for r in self._rows('select * from library_libraryitem order by id') if str(r['id']) not in done_books]
        materials = self._rows(f"select * from learning_lessonmaterial where lesson_id in ({','.join('?' * len(lesson_ids)) or 'null'})",
                               *lesson_ids) if lesson_ids and self._has('learning_lessonmaterial') else []
        questions = self._rows(f"select * from learning_question where assignment_id is null and lesson_id in "
                               f"({','.join('?' * len(lesson_ids)) or 'null'}) order by id", *lesson_ids) \
            if lesson_ids and self._has('learning_question') else []
        # which quarters amaliyfizika.uz has open become the fizika fan's here
        done_locks = self._done('lessons_quarterlock')
        locks = [r for r in self._rows('select * from lessons_quarterlock order by chorak')
                 if str(r['id']) not in done_locks and r['chorak'] in (1, 2, 3, 4)] \
            if self._has('lessons_quarterlock') else []

        # ── the report ──
        for r in lessons:
            files.plan(r['file'])
        for r in items:
            files.plan(r['image'])
        for r in sheets:
            files.plan(r['image'])
        for r in books:
            files.plan(r['file'])
            files.plan(r['cover'])
        for r in staff:
            files.plan(r['photo'])
        by_grade = {}
        for r in lessons:
            by_grade[GRADE[r['grade']]] = by_grade.get(GRADE[r['grade']], 0) + 1
        out(f"Darslar: {len(lessons)} {by_grade} · tajribalar: {len(exps)} · jihozlar: {len(items)}")
        out(f"Jihozlar varag'i: {len(sheets)} · kutubxona: {len(books)} · materiallar: {len(materials)} · savollar: {len(questions)}")
        if locks:
            out("Choraklar (fizika): " + ', '.join(f"{r['chorak']}-{'ochiq' if r['is_open'] else 'yopiq'}" for r in locks))
        out(f"Fayllar: {files.count} ta, {files.bytes / 1024 / 1024:.1f} MB" + (f" · topilmadi: {len(files.missing)}" if files.missing else ''))
        for name in files.missing:
            out(f"  ! fayl yo'q: {name}")
        if bad_grade:
            out(f"  ! sinfi 7/8/9 emas, o'tkazib yuboriladi: {len(bad_grade)}")
        out(f"Hisoblar: {len(staff)} ko'chadi")
        for r in staff:
            out(f"  + {r['name']} — login: {r['username'] or '—'}, rol: {r['role']}")
        for who, why in skipped:
            out(f"  - {who}: {why}")
        for who, other in phone_clash:
            out(f"  ! {who}: telefon raqami kuragoniy.uz'dagi {other} bilan bir xil — u raqam bilan kirishda login/parol so'raladi")

        if not apply:
            out("Sinov rejimi — hech narsa o'zgarmadi. Ko'chirish uchun --apply qo'shing.")
            return

        files = Files(media)
        try:
            with suppress_lessons_backup(), transaction.atomic():
                counts = self._copy(files, staff, lessons, exps, items, sheets, books, materials, questions, locks)
        except Exception:
            files.rollback()
            raise
        if counts['lessons']:
            send_lessons_backup()
        from common.audit import notify_admin_action

        notify_admin_action(None, "amaliyfizika.uz'dan ko'chirildi (Amaliy fizika): "
                                  f"{counts['lessons']} dars, {counts['exps']} tajriba, {counts['books']} kitob, "
                                  f"{counts['users']} hisob")
        out(f"Tayyor: {counts}")

    def _copy(self, files, staff, lessons, exps, items, sheets, books, materials, questions, locks=()):
        counts = dict(users=0, lessons=0, exps=0, items=0, sheets=0, books=0, materials=0, questions=0, locks=0, files=0)

        for r in locks:
            lock, _ = QuarterLock.objects.update_or_create(subject='fizika', chorak=r['chorak'],
                                                           defaults={'is_open': bool(r['is_open'])})
            self._mark('lessons_quarterlock', r['id'], lock.pk)
            counts['locks'] += 1
        user_map = self._done('accounts_user')

        for r in staff:
            kw = fields_from(User, r, skip=USER_SKIP)
            u = User(id=r['id'], **kw)
            u.subjects = ['fizika']
            u.photo = files.copy(r['photo']) or None
            u.save()
            created = convert(User._meta.get_field('created_at'), r['created_at']) if 'created_at' in r.keys() else None
            if created:
                User.objects.filter(pk=u.pk).update(created_at=created)
            self._mark('accounts_user', r['id'], u.pk)
            user_map[r['id']] = u.pk
            counts['users'] += 1

        lesson_map, exp_map = {}, {}
        for r in lessons:
            kw = fields_from(Lesson, r, skip={'grade', 'translated_at', 'updated_at'})
            src_tr, src_up = convert(Lesson._meta.get_field('translated_at'), r['translated_at']), \
                convert(Lesson._meta.get_field('updated_at'), r['updated_at'])
            translated = bool(src_tr and src_up and src_tr >= src_up)
            lesson = Lesson(grade=GRADE[r['grade']], **kw)
            if translated:  # already translated there: no translation job here
                lesson.translated_at = timezone.now() + timedelta(minutes=10)
            lesson.file = files.copy(r['file']) or None
            lesson.save()
            if translated:
                Lesson.objects.filter(pk=lesson.pk).update(translated_at=lesson.updated_at)
            lesson_map[r['id']] = lesson
            self._mark('lessons_lesson', r['id'], lesson.pk)
            counts['lessons'] += 1

        for r in exps:
            exp = Experiment.objects.create(lesson=lesson_map[r['lesson_id']], **fields_from(Experiment, r))
            exp_map[r['id']] = exp
            counts['exps'] += 1

        for r in items:
            item = EquipmentItem(experiment=exp_map[r['experiment_id']], **fields_from(EquipmentItem, r))
            item.image = files.copy(r['image']) or None
            item.save()
            counts['items'] += 1

        for r in sheets:
            sheet = EquipmentSheet(grade=GRADE[r['grade']], **fields_from(EquipmentSheet, r, skip={'grade', 'created_at'}))
            sheet.image = files.copy(r['image'])
            if not sheet.image:
                continue
            sheet.save()
            created = convert(EquipmentSheet._meta.get_field('created_at'), r['created_at'])
            if created:
                EquipmentSheet.objects.filter(pk=sheet.pk).update(created_at=created)
            self._mark('lessons_equipmentsheet', r['id'], sheet.pk)
            counts['sheets'] += 1

        for r in books:
            book = LibraryItem(subject='fizika', **fields_from(LibraryItem, r, skip={'subject', 'updated_at'}))
            book.file = files.copy(r['file']) or None
            book.cover = files.copy(r['cover']) or None
            book.save()
            self._mark('library_libraryitem', r['id'], book.pk)
            counts['books'] += 1

        for r in materials:
            LessonMaterial.objects.create(lesson=lesson_map[r['lesson_id']],
                                          **fields_from(LessonMaterial, r, skip={'updated_at'}))
            counts['materials'] += 1

        for r in questions:
            Question.objects.create(lesson=lesson_map[r['lesson_id']], **fields_from(Question, r, skip={'created_at'}))
            counts['questions'] += 1

        counts['files'] = len(files.saved)
        return counts
