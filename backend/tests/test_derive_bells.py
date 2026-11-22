"""manage.py derive_bells: the schools' lesson times from the times their
lessons already carry in the timetable."""

from datetime import time
from io import StringIO

import pytest
from django.core.management import call_command

from schools.models import School
from timetable.models import SchoolBells, TimetableSlot

pytestmark = pytest.mark.django_db


def lesson(teacher, school, day, period, a, b, **extra):
    return TimetableSlot.objects.create(teacher=teacher, school=school, maktab=school.name, day_index=day,
                                        period_index=period, time_from=a, time_to=b, **extra)


def run(*args):
    out = StringIO()
    call_command('derive_bells', *args, stdout=out)
    return out.getvalue()


def test_report_then_apply_keeps_every_lesson_time(teacher, make_user):
    virtus = School.objects.create(name='Virtus')
    other = make_user('o@example.com', approved=True)
    lesson(teacher, virtus, 0, 6, time(14, 25), time(15, 5))
    lesson(other, virtus, 2, 6, time(14, 25), time(15, 5))
    lesson(teacher, virtus, 4, 6, time(14, 30), time(15, 10))   # Friday runs later
    lesson(teacher, virtus, 0, 7, time(15, 10), time(15, 50))
    lesson(teacher, virtus, 4, 8, time(16, 15), time(17, 0))    # known only from Friday
    double = lesson(teacher, virtus, 1, 1, time(8), time(9, 30), span=2)  # not used to derive
    lesson(teacher, virtus, 3, 2, None, None)                   # no time: skipped

    report = run()
    assert '+ Virtus' in report and "vaqti o'zgaradigan darslar: 0" in report
    assert not SchoolBells.objects.exists()

    run('--apply')
    bells = SchoolBells.objects.get(school=virtus)
    assert bells.times == {
        '*': {'6': ['14:25', '15:05'], '7': ['15:10', '15:50'], '8': ['16:15', '17:00']},
        '4': {'6': ['14:30', '15:10']},
    }
    double.refresh_from_db()
    assert (double.time_from, double.time_to) == (time(8), time(9, 30))  # its periods aren't known


def test_a_school_with_its_times_already_entered_is_left_alone(teacher):
    s = School.objects.create(name='Sodiq')
    lesson(teacher, s, 0, 1, time(9), time(9, 40))
    SchoolBells.objects.create(school=s, times={'*': {'1': ['08:00', '08:45']}})
    assert 'tegilmaydi' in run('--apply')
    assert SchoolBells.objects.get(school=s).times == {'*': {'1': ['08:00', '08:45']}}


def test_lessons_that_dont_add_up_are_skipped(teacher):
    s = School.objects.create(name='Chalkash')
    lesson(teacher, s, 0, 1, time(9), time(9, 40))
    lesson(teacher, s, 0, 2, time(9, 20), time(10))  # starts before the 1st ends
    report = run('--apply')
    assert "to'g'ri kelmaydi" in report and not SchoolBells.objects.exists()
