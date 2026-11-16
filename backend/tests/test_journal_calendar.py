"""The journal files a day under the chorak its date falls in (the school
calendar), not under whichever chorak the teacher had open."""
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.utils import timezone

from journal.models import ClassDay
from schools.models import AcademicYear


def _set_quarters(*ranges):
    """Four (start_offset, end_offset) pairs in days from today."""
    today = timezone.localdate()
    year = AcademicYear.current()
    year.quarters = [{'start': (today + timedelta(days=a)).isoformat(), 'end': (today + timedelta(days=b)).isoformat()}
                     for a, b in ranges]
    year.save(update_fields=['quarters'])


def _add_day(client, jc, chorak=None):
    body = {'date': timezone.localdate().isoformat(), 'topic': 'Tezlik'}
    if chorak is not None:
        body['chorak'] = chorak
    return client.post(f'/api/journal/classes/{jc.id}/bulk-marks/', body, format='json')


def test_new_chorak_takes_the_day_whatever_was_open(as_user, teacher, journal_class):
    # 2-chorak began five days ago; the teacher still had 1-chorak open
    _set_quarters((-60, -10), (-5, 30), (40, 80), (90, 120))
    r = _add_day(as_user(teacher), journal_class, chorak=1)
    assert r.status_code == 200
    assert ClassDay.objects.get(journal_class=journal_class).chorak == 2


def test_chorak_may_be_left_out(as_user, teacher, journal_class):
    _set_quarters((-60, -10), (-5, 30), (40, 80), (90, 120))
    assert _add_day(as_user(teacher), journal_class).status_code == 200
    assert ClassDay.objects.get(journal_class=journal_class).chorak == 2


def test_a_holiday_lesson_belongs_to_the_chorak_just_ended(as_user, teacher, journal_class):
    # 1-chorak ended three days ago, 2-chorak starts in five
    _set_quarters((-60, -3), (5, 40), (50, 80), (90, 120))
    assert _add_day(as_user(teacher), journal_class, chorak=3).status_code == 200
    assert ClassDay.objects.get(journal_class=journal_class).chorak == 1


def test_refile_days_moves_misfiled_days_only_with_apply(journal_class):
    _set_quarters((-60, -10), (-5, 30), (40, 80), (90, 120))
    today = timezone.localdate()
    wrong = ClassDay.objects.create(journal_class=journal_class, date=today, chorak=1)
    right = ClassDay.objects.create(journal_class=journal_class, date=today - timedelta(days=20), chorak=1)

    out = StringIO()
    call_command('refile_days', stdout=out)
    assert '1 day(s) to move' in out.getvalue()
    wrong.refresh_from_db()
    assert wrong.chorak == 1

    call_command('refile_days', '--apply', stdout=StringIO())
    wrong.refresh_from_db()
    right.refresh_from_db()
    assert wrong.chorak == 2 and right.chorak == 1
