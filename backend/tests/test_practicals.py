"""Amaliy ishlar — laboratoriya ishlari and STEM loyihalari in the journal
(journal PracticalWork): the class's teacher gives and grades them on the
class's scale; they show in the grid and stay out of every average; a
pupil carried to another class takes them along."""

from datetime import date

import pytest

from journal.models import JournalClass, PracticalMark, PracticalWork, Student

pytestmark = pytest.mark.django_db
URL = '/api/journal/practicals/'


def _vali(journal_class):
    return Student.objects.get(journal_class=journal_class, full_name='Aliyev Vali')


def test_the_teacher_gives_and_grades_one(as_user, teacher, journal_class):
    vali = _vali(journal_class)
    api = as_user(teacher)
    r = api.post(URL, {'journal_class': journal_class.pk, 'kind': 'lab', 'chorak': 2, 'date': '2026-11-20',
                       'title': "Ishqalanish koeffitsiyenti", 'marks': [{'student_id': vali.pk, 'mark': 5}]}, format='json')
    assert r.status_code == 201, r.data
    assert r.data['marks'] == {vali.pk: 5} and r.data['kind'] == 'lab'
    work = PracticalWork.objects.get()
    assert PracticalMark.objects.get(work=work).level == 5
    # it is in the grid, beside the days
    grid = api.get(f'/api/journal/classes/{journal_class.pk}/grid/').data
    assert [(p['kind'], p['title']) for p in grid['practicals']] == [('lab', 'Ishqalanish koeffitsiyenti')]
    # a mark is changed and then cleared
    api.patch(f'{URL}{work.pk}/', {'marks': [{'student_id': vali.pk, 'mark': 3}]}, format='json')
    assert PracticalMark.objects.get(work=work).mark == 3
    api.patch(f'{URL}{work.pk}/', {'marks': [{'student_id': vali.pk, 'mark': None}]}, format='json')
    assert not PracticalMark.objects.filter(work=work).exists()


def test_a_mark_stays_on_the_class_scale(as_user, teacher, journal_class):
    vali = _vali(journal_class)
    r = as_user(teacher).post(URL, {'journal_class': journal_class.pk, 'kind': 'stem', 'chorak': 2, 'date': '2026-11-20',
                                    'marks': [{'student_id': vali.pk, 'mark': 7}]}, format='json')
    assert r.status_code == 400  # the class is graded 0-5


def test_only_the_class_teacher_writes(as_user, admin, make_user, teacher, journal_class):
    body = {'journal_class': journal_class.pk, 'kind': 'lab', 'chorak': 2, 'date': '2026-11-20'}
    assert as_user(admin).post(URL, body, format='json').status_code == 403
    stranger = make_user('stranger@example.com', approved=True)
    assert as_user(stranger).post(URL, body, format='json').status_code == 403
    work = PracticalWork.objects.create(journal_class=journal_class, kind='lab', chorak=2, date=date(2026, 11, 20))
    # an administrator reads it; another teacher doesn't even see it
    assert as_user(admin).get(f'{URL}?journal_class={journal_class.pk}').data[0]['id'] == work.pk
    assert as_user(stranger).get(f'{URL}{work.pk}/').status_code == 404
    assert as_user(admin).delete(f'{URL}{work.pk}/').status_code == 403
    assert as_user(teacher).delete(f'{URL}{work.pk}/').status_code == 204


def test_a_carried_pupil_takes_them_along_and_undo_brings_them_back(as_user, teacher, make_user, journal_class):
    vali = _vali(journal_class)
    work = PracticalWork.objects.create(journal_class=journal_class, kind='stem', chorak=1, date=date(2026, 9, 25), title='Svetofor')
    PracticalMark.objects.create(work=work, student=vali, mark=4)
    other = make_user('other-teacher@example.com', approved=True)
    target = JournalClass.objects.create(teacher=other, name='8-B', scale=10)
    api = as_user(teacher)
    tid = api.post(f'/api/journal/students/{vali.pk}/transfer/', {'target': target.pk, 'mode': 'carry'}, format='json').data['transfer']
    pm = PracticalMark.objects.get(student=vali)
    assert (pm.work.journal_class, pm.work.kind, pm.work.title, pm.mark, pm.level) == (target, 'stem', 'Svetofor', 8, 4)
    assert api.post(f'/api/journal/transfers/{tid}/undo/').status_code == 200
    pm.refresh_from_db()
    assert (pm.work_id, pm.mark, pm.level) == (work.pk, 4, 4)
    assert not PracticalWork.objects.filter(journal_class=target).exists()  # the twin it had to make is gone
