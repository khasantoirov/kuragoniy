"""The second half of moving amaliyfizika.uz in (after import_af): its
journals — partner schools, the academic year's quarter dates, teachers'
school memberships, journal classes with their pupils (roster rows), lesson
days, marks, attendance, control works, final marks, edit grants — and the
timetable. Reads that platform's SQLite database read-only; amaliyfizika.uz
itself is never changed.

    manage.py import_af_journals --source /tmp/af.sqlite3                  # report only
    manage.py import_af_journals --source /tmp/af.sqlite3 --apply          # copy
    ... --with-blocked   also bring over the blocked teachers who own journal
                         classes, as blocked accounts here (login and
                         password as there), so their classes come with them

The report is the real run rolled back at the end, so its numbers are
exact. People are matched through import_af's ImportedRow list, then by
email or login (someone who was already here). A journal whose teacher
isn't here is left out and listed. Schools are matched by name, the year by
start_year. Every copied row goes into ImportedRow, so a second run copies
only what is new — it does not update rows copied before.
"""

import sqlite3
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from journal.models import (AttendanceEntry, ClassDay, ControlMark, ControlWork, FinalGrade, GradeEntry,
                            JournalClass, JournalEditGrant, Student, StudentTransfer)
from migration_tools.models import ImportedRow
from schools.models import AcademicYear, School, SchoolTeacher, SchoolYear, TeacherMove
from staffroom.models import PlannedLesson
from timetable.models import TimetableSlot

from .import_af import SOURCE, USER_SKIP, convert, fields_from


class _DryRun(Exception):
    pass


class Command(BaseCommand):
    help = "amaliyfizika.uz'ning jurnallari, maktablari va dars jadvalini kuragoniy.uz'ga ko'chiradi."

    def add_arguments(self, parser):
        parser.add_argument('--source', required=True, help="amaliyfizika.uz'ning SQLite bazasi (nusxasi)")
        parser.add_argument('--apply', action='store_true', help="Haqiqatda ko'chirish (aks holda faqat hisobot)")
        parser.add_argument('--with-blocked', action='store_true',
                            help="Jurnali bor bloklangan o'qituvchilarni ham (bloklangan holda) ko'chirish")

    # ── reading / bookkeeping ────────────────────────────────────────────
    def _rows(self, table):
        if not self.src.execute("select 1 from sqlite_master where type='table' and name=?", (table,)).fetchone():
            return []
        return self.src.execute(f'select * from "{table}" order by id').fetchall()

    def _done(self, table) -> dict[str, str]:
        return dict(ImportedRow.objects.filter(source=SOURCE, table=table).values_list('source_id', 'target_id'))

    def _mark(self, table, source_id, target_id):
        ImportedRow.objects.create(source=SOURCE, table=table, source_id=str(source_id), target_id=str(target_id))

    def _restore_auto(self, model, obj, row):
        """created_at / updated_at as they were there (auto fields are
        overwritten on create)."""
        values = {}
        for f in model._meta.concrete_fields:
            if getattr(f, 'auto_now', False) or getattr(f, 'auto_now_add', False):
                if f.column in row.keys() and row[f.column] is not None:
                    values[f.attname] = convert(f, row[f.column])
        if values:
            model.objects.filter(pk=obj.pk).update(**values)

    # ── people ───────────────────────────────────────────────────────────
    def _people(self, with_blocked):
        """AF user id → our user id: import_af's list, then email / login."""
        people = {k: v for k, v in self._done('accounts_user').items()}
        by_email = {e.lower(): pk for pk, e in User.objects.exclude(email=None).values_list('pk', 'email')}
        by_login = {u.lower(): pk for pk, u in User.objects.exclude(username=None).values_list('pk', 'username')}
        owners = {str(r['teacher_id']) for r in self._rows('journal_journalclass')}
        self.blocked_brought = []
        for r in self._rows('accounts_user'):
            uid = str(r['id'])
            if uid in people:
                continue
            email, login = (r['email'] or '').lower(), (r['username'] or '').lower()
            if email and email in by_email:
                people[uid] = by_email[email]
            elif login and login in by_login:
                people[uid] = by_login[login]
            elif with_blocked and uid in owners and r['role'] == 'teacher' and r['is_active'] and not r['approved']:
                kw = fields_from(User, r, skip=USER_SKIP)
                u = User(id=r['id'], **kw)
                u.approved = False  # as there: blocked
                u.subjects = ['fizika']
                u.save()
                self._mark('accounts_user', uid, u.pk)
                people[uid] = u.pk
                self.blocked_brought.append(r['name'])
        self.names = {str(r['id']): r['name'] for r in self._rows('accounts_user')}
        return people

    # ── one table ────────────────────────────────────────────────────────
    def _copy(self, table, model, fks, *, match=None, self_fks=(), extra=None):
        """Copies `table` into `model`. `fks`: {column: (map name, required)}.
        `match(kw)` may return an existing row to reuse instead of creating.
        Columns in `self_fks` point into the same table and are set after."""
        done = self._done(table)
        mapping = self.maps.setdefault(table, {})
        later = []
        made = reused = 0
        skipped: dict[str, int] = {}
        for r in self._rows(table):
            sid = str(r['id'])
            if sid in done:
                mapping[sid] = done[sid]
                continue
            kw = fields_from(model, r)
            missing = None
            for col, (target, required) in fks.items():
                src = r[col] if col in r.keys() else None
                tgt = self.maps.get(target, {}).get(str(src)) if src is not None else None
                if src is not None and tgt is None and required:
                    missing = target
                    break
                kw[col] = tgt
            if missing:
                why = 'egasi kuragoniy.uz\'da yo\'q' if missing == 'people' else f"{missing} ko'chmagan"
                skipped[why] = skipped.get(why, 0) + 1
                if table == 'journal_journalclass':
                    self.orphan_owners[self.names.get(str(r['teacher_id']), str(r['teacher_id']))] = \
                        self.orphan_owners.get(self.names.get(str(r['teacher_id']), str(r['teacher_id'])), 0) + 1
                continue
            for col in self_fks:
                kw.pop(col, None)
            kw.update(extra or {})
            obj = match(kw) if match else None
            if obj is None:
                obj = model.objects.create(**kw)
                self._restore_auto(model, obj, r)
                made += 1
            else:
                reused += 1
            mapping[sid] = obj.pk
            self._mark(table, sid, obj.pk)
            if self_fks:
                later.append((obj.pk, r))
        for pk, r in later:
            updates = {col: mapping.get(str(r[col])) for col in self_fks if r[col] is not None}
            updates = {k: v for k, v in updates.items() if v is not None}
            if updates:
                model.objects.filter(pk=pk).update(**updates)
        self.report.append((table, made, reused, skipped))

    # ── the command ──────────────────────────────────────────────────────
    def handle(self, *args, source, apply, with_blocked, **opts):
        if not Path(source).is_file():
            raise CommandError(f'Baza topilmadi: {source}')
        self.src = sqlite3.connect(f'file:{Path(source).as_posix()}?mode=ro', uri=True)
        self.src.row_factory = sqlite3.Row
        self.report, self.orphan_owners, self.notes = [], {}, []
        out = self.stdout.write
        try:
            with transaction.atomic():
                self._run(with_blocked)
                if not apply:
                    raise _DryRun
        except _DryRun:
            pass

        for table, made, reused, skipped in self.report:
            extra = f", bor bo'lgani ishlatildi: {reused}" if reused else ''
            extra += ''.join(f", o'tkazib yuborildi ({why}): {n}" for why, n in skipped.items())
            out(f"{table}: {made}{extra}")
        for name, n in sorted(self.orphan_owners.items()):
            out(f"  ! {name}: {n} ta sinf jurnali ko'chmaydi — o'qituvchi kuragoniy.uz'da yo'q"
                + ('' if with_blocked else " (bloklangan bo'lsa, --with-blocked bilan ko'chadi)"))
        for name in self.blocked_brought:
            out(f"  + bloklangan hisob ham ko'chadi: {name}")
        for note in self.notes:
            out(f"  · {note}")
        if not apply:
            out("Sinov rejimi — hech narsa o'zgarmadi. Ko'chirish uchun --apply qo'shing.")
            return
        from common.audit import notify_admin_action

        total = sum(made for _t, made, _r, _s in self.report)
        notify_admin_action(None, f"amaliyfizika.uz'dan jurnallar ko'chirildi: {total} yozuv")
        out(f"Tayyor: {total} yozuv")

    def _run(self, with_blocked):
        self.maps = {'people': self._people(with_blocked)}
        self.maps['lessons_lesson'] = self._done('lessons_lesson')

        # the academic year: matched by start_year; quarter dates taken over
        # when ours has none yet
        def year_match(kw):
            y = AcademicYear.objects.filter(start_year=kw['start_year']).first()
            if y and not y.quarters and kw.get('quarters'):
                y.quarters = kw['quarters']
                y.save(update_fields=['quarters'])
                self.notes.append(f"{y.start_year}-{y.start_year + 1} o'quv yilining chorak sanalari AF'dan olindi")
            if y is None and AcademicYear.objects.filter(is_current=True).exists():
                kw['is_current'] = False
            return y
        self._copy('schools_academicyear', AcademicYear, {}, match=year_match)

        self._copy('schools_school', School, {},
                   match=lambda kw: School.objects.filter(name__iexact=kw['name']).first())

        def school_year(kw):
            sy, _ = SchoolYear.objects.update_or_create(school_id=kw['school_id'], year_id=kw['year_id'],
                                                        defaults={'is_active': kw['is_active']})
            return sy
        self._copy('schools_schoolyear', SchoolYear,
                   {'school_id': ('schools_school', True), 'year_id': ('schools_academicyear', True)}, match=school_year)

        def membership(kw):
            st, _ = SchoolTeacher.objects.update_or_create(
                school_id=kw['school_id'], teacher_id=kw['teacher_id'],
                defaults={k: v for k, v in kw.items() if k in ('since', 'kind')})
            return st
        self._copy('schools_schoolteacher', SchoolTeacher,
                   {'school_id': ('schools_school', True), 'teacher_id': ('people', True)}, match=membership)
        self._copy('schools_teachermove', TeacherMove,
                   {'teacher_id': ('people', True), 'from_school_id': ('schools_school', True),
                    'to_school_id': ('schools_school', False), 'successor_id': ('people', False),
                    'actor_id': ('people', False)})

        self._copy('journal_journalclass', JournalClass,
                   {'teacher_id': ('people', True), 'partner_school_id': ('schools_school', False),
                    'year_id': ('schools_academicyear', False)}, self_fks=('rolled_from_id',),
                   extra={'subject': 'fizika'})  # amaliyfizika.uz's journals are the Fizika window's
        self._copy('journal_student', Student, {'journal_class_id': ('journal_journalclass', True)},
                   self_fks=('moved_to_id',))
        self._copy('journal_classday', ClassDay, {'journal_class_id': ('journal_journalclass', True)})
        self._copy('journal_gradeentry', GradeEntry,
                   {'student_id': ('journal_student', True), 'day_id': ('journal_classday', True)})
        self._copy('journal_attendanceentry', AttendanceEntry,
                   {'student_id': ('journal_student', True), 'day_id': ('journal_classday', True)})
        self._copy('journal_finalgrade', FinalGrade, {'student_id': ('journal_student', True)})
        self._copy('journal_controlwork', ControlWork,
                   {'journal_class_id': ('journal_journalclass', True), 'created_by_id': ('people', False)})
        self._copy('journal_controlmark', ControlMark,
                   {'work_id': ('journal_controlwork', True), 'student_id': ('journal_student', True)})
        self._copy('journal_journaleditgrant', JournalEditGrant,
                   {'teacher_id': ('people', True), 'journal_class_id': ('journal_journalclass', False),
                    'decided_by_id': ('people', False)})
        self._copy('journal_studenttransfer', StudentTransfer,
                   {'student_id': ('journal_student', True), 'new_row_id': ('journal_student', False),
                    'source_id': ('journal_journalclass', True), 'target_id': ('journal_journalclass', True),
                    'actor_id': ('people', False)})

        def free_slot(kw):
            return TimetableSlot.objects.filter(teacher_id=kw['teacher_id'], day_index=kw['day_index'],
                                                period_index=kw['period_index']).first()
        self._copy('timetable_timetableslot', TimetableSlot,
                   {'teacher_id': ('people', True), 'school_id': ('schools_school', False)}, match=free_slot,
                   extra={'subject': 'fizika'})

        def free_plan(kw):
            return PlannedLesson.objects.filter(teacher_id=kw['teacher_id'], date=kw['date'],
                                                period_index=kw['period_index']).first()
        self._copy('staffroom_plannedlesson', PlannedLesson,
                   {'teacher_id': ('people', True), 'lesson_id': ('lessons_lesson', False)}, match=free_plan)


