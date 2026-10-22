"""Per-class grading scales (0-5, 0-10, 0-100): marks are checked against
the class's scale, every mark carries its colour band (level 0-5), a scale
change carries existing marks over band-preserving, and statistics pool
classes on different scales by level."""

from datetime import date

from django.utils import timezone

import pytest

from journal.models import ClassDay, FinalGrade, GradeEntry, JournalClass, Student
from journal.scales import band, convert, level

pytestmark = pytest.mark.django_db


def test_levels_per_scale():
    assert [level(m, 5) for m in (5, 4, 3, 2, 1, 0)] == [5, 4, 3, 2, 1, 0]
    assert [level(m, 10) for m in (10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0)] == [5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0]
    assert [level(m, 100) for m in (100, 86, 85, 71, 70, 56, 55, 31, 30, 1, 0)] == [5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0]


def test_bands():
    assert band(5, 100) == (86, 100)
    assert band(2, 10) == (3, 4)
    assert band(1, 100) == (1, 30)
    assert band(0, 10) == (0, 0)
    assert band(4, 5) == (4, 4)


def test_convert_keeps_the_colour_band():
    assert convert(87, 100, 5) == 5          # plain rounding would say 4
    assert convert(70, 100, 5) == 3
    assert [convert(m, 5, 100) for m in (5, 4, 3, 2, 1, 0)] == [100, 80, 60, 40, 20, 0]
    assert [convert(m, 10, 5) for m in (10, 9, 7, 5, 3, 2, 0)] == [5, 5, 4, 3, 2, 1, 0]
    for old, new in ((5, 10), (10, 100), (100, 10), (100, 5), (10, 5)):
        for m in range(old + 1):
            assert level(convert(m, old, new), new) == level(m, old), (m, old, new)


def _today():
    return timezone.localdate().isoformat()


def _mark(client, jc, mark):
    student = jc.students.first()
    return client.post(f'/api/journal/classes/{jc.id}/bulk-marks/',
                       {'date': _today(), 'chorak': 1, 'marks': [{'student_id': student.id, 'mark': mark}]}, format='json')


def test_new_class_defaults_to_five_and_takes_a_scale(as_user, teacher):
    c = as_user(teacher)
    r = c.post('/api/journal/classes/', {'school': '1-maktab', 'name': '7-A'}, format='json')
    assert r.status_code == 201 and r.data['scale'] == 5
    r = c.post('/api/journal/classes/', {'school': 'Cambridge', 'name': '8-B', 'scale': 100}, format='json')
    assert r.status_code == 201 and r.data['scale'] == 100
    assert c.post('/api/journal/classes/', {'school': 'X', 'name': '9', 'scale': 12}, format='json').status_code == 400


def test_marks_follow_the_class_scale(as_user, teacher, journal_class):
    c = as_user(teacher)
    assert _mark(c, journal_class, 6).status_code == 400
    journal_class.scale = 100
    journal_class.save()
    r = _mark(c, journal_class, 87)
    assert r.status_code == 200 and r.data['scale'] == 100
    g = GradeEntry.objects.get()
    assert (g.mark, g.level) == (87, 5)
    assert _mark(c, journal_class, 101).status_code == 400


def test_final_grade_on_a_ten_point_class(as_user, teacher, journal_class):
    journal_class.scale = 10
    journal_class.save()
    c = as_user(teacher)
    sid = journal_class.students.first().id
    url = f'/api/journal/classes/{journal_class.id}/set-final/'
    assert c.post(url, {'student_id': sid, 'chorak': 1, 'mark': 11}, format='json').status_code == 400
    assert c.post(url, {'student_id': sid, 'chorak': 1, 'mark': 7}, format='json').status_code == 200
    f = FinalGrade.objects.get()
    assert (f.mark, f.level) == (7, 4)


def test_changing_the_scale_carries_marks_over(as_user, teacher, journal_class):
    kids = list(journal_class.students.all())
    day = ClassDay.objects.create(journal_class=journal_class, date=date(2026, 9, 10), chorak=1)
    for kid, m in zip(kids, (5, 4, 1)):
        GradeEntry.objects.create(student=kid, day=day, mark=m)
    FinalGrade.objects.create(student=kids[0], chorak=1, mark=3)

    r = as_user(teacher).patch(f'/api/journal/classes/{journal_class.id}/', {'scale': 100}, format='json')
    assert r.status_code == 200 and r.data['scale'] == 100
    marks = {g.student_id: (g.mark, g.level) for g in GradeEntry.objects.all()}
    assert marks == {kids[0].id: (100, 5), kids[1].id: (80, 4), kids[2].id: (20, 1)}
    f = FinalGrade.objects.get()
    assert (f.mark, f.level) == (60, 3)


def test_level_is_set_on_save_whatever_the_path(teacher):
    jc = JournalClass.objects.create(teacher=teacher, name='9-A', school='Cambridge', scale=10)
    kid = Student.objects.create(journal_class=jc, full_name='Ali', order=0)
    day = ClassDay.objects.create(journal_class=jc, date=date(2026, 9, 10), chorak=1)
    assert GradeEntry.objects.create(student=kid, day=day, mark=8).level == 4
    assert FinalGrade.objects.create(student=kid, chorak=1, mark=2).level == 1


def test_statistics_pool_scales_by_colour_band(as_user, admin, teacher):
    """A 0-100 class with 90 and 60 counts as a'lo (5) and qoniqarli (3)."""
    jc = JournalClass.objects.create(teacher=teacher, name='9-A', school='Cambridge', scale=100)
    kids = [Student.objects.create(journal_class=jc, full_name=f'O{i}', order=i) for i in range(2)]
    day = ClassDay.objects.create(journal_class=jc, date=date(2026, 9, 10), chorak=1)
    GradeEntry.objects.create(student=kids[0], day=day, mark=90)
    GradeEntry.objects.create(student=kids[1], day=day, mark=60)
    (row,) = as_user(admin).get('/api/schools/stats/classes/').data
    assert row['avg_mark'] == 4.0
    assert row['uzlashtirish'] == 75.0


def test_quarter_grades_are_written_only_through_set_final(as_user, teacher, journal_class):
    sid = journal_class.students.first().id
    r = as_user(teacher).post('/api/journal/finals/', {'student': sid, 'chorak': 1, 'mark': 99}, format='json')
    assert r.status_code == 405
    assert not FinalGrade.objects.exists()
