"""Nazorat ishi: administrators grade a control test out of 100 in any
teacher's class; the teacher sees it in the journal grid, read-only, and
is told once the results are in. It stays out of the lesson statistics."""

import pytest

from journal.models import ControlMark, ControlWork
from notifications.models import Notification

pytestmark = pytest.mark.django_db

URL = '/api/journal/controls/'


def _payload(jc, marks, **extra):
    kids = list(jc.students.order_by('order'))
    return {
        'journal_class': jc.id, 'date': '2026-10-20', 'chorak': 1, 'title': 'Mexanika',
        'marks': [{'student_id': k.id, 'mark': m} for k, m in zip(kids, marks)], **extra,
    }


def test_admin_grades_a_teachers_class_out_of_100(as_user, admin, teacher, journal_class):
    r = as_user(admin).post(URL, _payload(journal_class, [87, 60, None]), format='json')
    assert r.status_code == 201, r.data
    assert r.data['by_name'] == admin.name
    assert sorted(r.data['marks'].values()) == [60, 87]
    levels = sorted(ControlMark.objects.values_list('mark', 'level'))
    assert levels == [(60, 3), (87, 5)]
    # the class's own scale (0-5 here) does not matter
    assert journal_class.scale == 5


def test_marks_are_checked(as_user, admin, journal_class, make_user):
    c = as_user(admin)
    assert c.post(URL, _payload(journal_class, [101]), format='json').status_code == 400
    assert c.post(URL, _payload(journal_class, [50], chorak=5), format='json').status_code == 400
    from journal.models import JournalClass, Student
    other = JournalClass.objects.create(teacher=make_user('t2@example.com', approved=True), name='9-B')
    stranger = Student.objects.create(journal_class=other, full_name='Begona', order=0)
    bad = _payload(journal_class, [])
    bad['marks'] = [{'student_id': stranger.id, 'mark': 70}]
    assert c.post(URL, bad, format='json').status_code == 400
    assert not ControlWork.objects.exists()


def test_teacher_sees_it_in_the_grid_but_cannot_write(as_user, admin, teacher, journal_class):
    work_id = as_user(admin).post(URL, _payload(journal_class, [90, 40, 75]), format='json').data['id']
    c = as_user(teacher)
    grid = c.get(f'/api/journal/classes/{journal_class.id}/grid/').data
    (ctl,) = grid['controls']
    assert ctl['title'] == 'Mexanika' and sorted(ctl['marks'].values()) == [40, 75, 90]
    assert grid['lock']['can_control'] is False

    assert c.post(URL, _payload(journal_class, [100]), format='json').status_code == 403
    assert c.patch(f'{URL}{work_id}/', {'title': 'X'}, format='json').status_code == 403
    assert c.delete(f'{URL}{work_id}/').status_code == 403
    assert c.get(URL, {'journal_class': journal_class.id}).status_code == 200
    assert ControlWork.objects.get().title == 'Mexanika'


def test_admin_grid_view_of_a_teacher_can_control(as_user, admin, teacher, journal_class):
    grid = as_user(admin).get(f'/api/journal/classes/{journal_class.id}/grid/?teacher={teacher.id}').data
    assert grid['lock']['can_control'] is True and grid['lock']['owner'] is False


def test_other_teachers_do_not_see_it(as_user, admin, journal_class, make_user):
    as_user(admin).post(URL, _payload(journal_class, [90]), format='json')
    other = make_user('t3@example.com', approved=True)
    assert as_user(other).get(URL).data == []


def test_edit_clear_and_delete(as_user, admin, journal_class):
    c = as_user(admin)
    work = c.post(URL, _payload(journal_class, [90, 40]), format='json').data
    first = journal_class.students.order_by('order').first()
    r = c.patch(f"{URL}{work['id']}/", {'title': 'Optika', 'marks': [{'student_id': first.id, 'mark': None}]}, format='json')
    assert r.status_code == 200 and r.data['title'] == 'Optika'
    assert list(r.data['marks'].values()) == [40]
    assert c.delete(f"{URL}{work['id']}/").status_code == 204
    assert not ControlMark.objects.exists()


def test_teacher_is_told_once_when_results_are_in(as_user, admin, teacher, journal_class):
    c = as_user(admin)
    work = c.post(URL, _payload(journal_class, []), format='json').data
    assert not Notification.objects.filter(user=teacher).exists()
    kid = journal_class.students.order_by('order').first()
    c.patch(f"{URL}{work['id']}/", {'marks': [{'student_id': kid.id, 'mark': 70}]}, format='json')
    c.patch(f"{URL}{work['id']}/", {'marks': [{'student_id': kid.id, 'mark': 71}]}, format='json')
    (n,) = Notification.objects.filter(user=teacher)
    assert n.title == 'Nazorat ishi natijalari kiritildi'
    assert n.url == f'/journal?class={journal_class.id}'


def test_control_marks_stay_out_of_the_statistics(as_user, admin, journal_class):
    as_user(admin).post(URL, _payload(journal_class, [100, 100, 100]), format='json')
    (row,) = as_user(admin).get('/api/schools/stats/classes/').data
    assert row['uzlashtirish'] is None and row['avg_mark'] is None
