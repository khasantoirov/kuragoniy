"""import_af_journals: amaliyfizika.uz's journals, schools and timetable come
over after its teachers — the report changes nothing, a rerun adds nothing."""
import sqlite3
from io import StringIO

import pytest
from django.contrib.auth.hashers import make_password
from django.core.management import call_command

from accounts.models import User
from journal.models import AttendanceEntry, ClassDay, GradeEntry, JournalClass, Student
from migration_tools.models import ImportedRow
from schools.models import AcademicYear, School, SchoolTeacher
from timetable.models import TimetableSlot

QUARTERS = '[{"start": "2026-09-02", "end": "2026-11-03"}, {"start": "2026-11-09", "end": "2026-12-27"}]'


def _af_db(path):
    c = sqlite3.connect(path)
    c.executescript(f'''
        create table accounts_user (id text, password text, email text, username text, name text, first_name text,
            last_name text, role text, is_dev_superuser bool, approved bool, phone text, is_active bool,
            must_change_password bool, created_at text);
        insert into accounts_user values
            ('af-t', '{make_password('x')}', 't@af.uz', 'gulirano', 'Guliraʼno R', 'Guliraʼno', 'R', 'teacher', 0, 1, '', 1, 0, '2026-09-01 08:00:00'),
            ('af-owner', '{make_password('x')}', 'owner@ke.uz', 'hasan', 'Hasan T', 'Hasan', 'T', 'admin', 1, 1, '', 1, 0, '2026-09-01 08:00:00'),
            ('af-blocked', '{make_password('Eski-2026')}', 's@af.uz', 'shohrux', 'Shohrux X', 'Shohrux', 'X', 'teacher', 0, 0, '', 1, 0, '2026-09-01 08:00:00');
        create table schools_academicyear (id int, start_year int, is_current bool, quarters text, created_at text);
        insert into schools_academicyear values (1, 2026, 1, '{QUARTERS}', '2026-11-02 14:48:43');
        create table schools_school (id int, name text, district text, address text, director text, phone text,
            is_active bool, aliases text, notes text, created_at text, updated_at text);
        insert into schools_school values (5, 'Iftixor School', '', '', '', '', 1, '[]', '', '2026-09-01 08:00:00', '2026-09-01 08:00:00');
        create table schools_schoolteacher (id int, school_id int, teacher_id text, since text, kind text, created_at text);
        insert into schools_schoolteacher values (1, 5, 'af-t', '2026-09-01', 'muhandis', '2026-09-01 08:00:00');
        create table journal_journalclass (id int, teacher_id text, school text, partner_school_id int, name text,
            scale int, year_id int, rolled_from_id int, created_at text);
        insert into journal_journalclass values (10, 'af-t', 'Iftixor School', 5, '8-A', 5, 1, null, '2026-09-03 08:00:00'),
                                                (11, 'af-owner', 'Iftixor School', 5, '9-B', 5, 1, null, '2026-09-03 08:00:00'),
                                                (12, 'af-blocked', '', null, '7-V', 5, 1, null, '2026-09-03 08:00:00');
        create table journal_student (id int, journal_class_id int, full_name text, "order" int, active bool, moved_to_id int);
        insert into journal_student values (100, 10, 'Ali Valiyev', 1, 1, null), (101, 10, 'Vali Aliyev', 2, 1, null),
                                           (102, 12, 'Sobir Karimov', 1, 1, null);
        create table journal_classday (id int, journal_class_id int, date text, chorak int, topic text, period int);
        insert into journal_classday values (1000, 10, '2026-11-10', 2, 'Bosim', 1);
        create table journal_gradeentry (id int, student_id int, day_id int, mark int, level int);
        insert into journal_gradeentry values (1, 100, 1000, 5, null);
        create table journal_attendanceentry (id int, student_id int, day_id int, status text);
        insert into journal_attendanceentry values (1, 101, 1000, 'yoq');
        create table timetable_timetableslot (id int, teacher_id text, day_index int, period_index int, time_from text,
            time_to text, school_id int, maktab text, xona text, sinf text, span int, band bool, lesson_type text);
        insert into timetable_timetableslot values (1, 'af-t', 0, 1, '08:30:00', '09:15:00', 5, 'Iftixor School', '12', '8-A', 1, 0, 'oddiy');
    ''')
    c.commit()
    c.close()


@pytest.mark.django_db
def test_journals_come_over_after_the_teachers(tmp_path, make_user):
    owner = make_user('owner@ke.uz', approved=True)  # already here under another id
    t = make_user('t@af.uz', approved=True)
    User.objects.filter(pk=t.pk).update(username='gulirano', subjects=['fizika'])
    ImportedRow.objects.create(source='af', table='accounts_user', source_id='af-t', target_id=t.pk)
    AcademicYear.objects.filter(start_year=2026).delete()
    year = AcademicYear.objects.create(start_year=2026, is_current=True, quarters=[])
    db = tmp_path / 'af.sqlite3'
    _af_db(db)

    out = StringIO()
    call_command('import_af_journals', source=str(db), stdout=out)
    report = out.getvalue()
    assert 'journal_journalclass: 2' in report and 'journal_student: 2' in report
    assert "Shohrux X: 1 ta sinf jurnali ko'chmaydi" in report
    assert not JournalClass.objects.exists() and not School.objects.exists()  # report only
    year.refresh_from_db()
    assert year.quarters == []

    call_command('import_af_journals', source=str(db), apply=True, stdout=StringIO())
    year.refresh_from_db()
    assert len(year.quarters) == 2 and AcademicYear.objects.count() == 1  # matched, dates taken over
    school = School.objects.get(name='Iftixor School')
    a = JournalClass.objects.get(name='8-A')
    assert a.teacher_id == t.pk and a.partner_school_id == school.id and a.year_id == year.id
    assert JournalClass.objects.get(name='9-B').teacher_id == owner.pk  # matched by email
    assert set(Student.objects.filter(journal_class=a).values_list('full_name', flat=True)) == {'Ali Valiyev', 'Vali Aliyev'}
    day = ClassDay.objects.get(journal_class=a)
    assert day.chorak == 2 and GradeEntry.objects.get(day=day).mark == 5
    assert AttendanceEntry.objects.get(day=day).student.full_name == 'Vali Aliyev'
    assert SchoolTeacher.objects.get(school=school, teacher=t).kind == 'muhandis'
    slot = TimetableSlot.objects.get(teacher=t)
    assert slot.school_id == school.id and str(slot.time_from) == '08:30:00' and slot.sinf == '8-A'
    assert not JournalClass.objects.filter(name='7-V').exists()
    assert a.subject == 'fizika' and slot.subject == 'fizika'  # the Fizika window's

    # a second run adds nothing; the blocked teacher's class comes with --with-blocked
    call_command('import_af_journals', source=str(db), apply=True, with_blocked=True, stdout=StringIO())
    assert JournalClass.objects.filter(name='8-A').count() == 1 and Student.objects.filter(journal_class=a).count() == 2
    blocked = User.objects.get(username='shohrux')
    assert not blocked.approved and blocked.check_password('Eski-2026') and blocked.subjects == ['fizika']
    assert JournalClass.objects.get(name='7-V').teacher_id == blocked.pk
