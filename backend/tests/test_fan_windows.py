"""Fizika and STEAM are separate windows: the browser sends its window as
X-Fan, and nothing of one fan shows in the other's window."""
import pytest

from accounts.models import User
from journal.models import JournalClass
from lessons.models import Lesson, QuarterLock
from library.models import LibraryItem
from timetable.models import TimetableSlot

FIZ = {'HTTP_X_FAN': 'fizika'}
STEAM = {'HTTP_X_FAN': 'steam'}


def _rows(resp):
    assert resp.status_code == 200, resp.data
    return resp.data['results'] if isinstance(resp.data, dict) and 'results' in resp.data else resp.data


@pytest.fixture
def lessons(db):
    QuarterLock.objects.create(chorak=1, is_open=True)
    Lesson.objects.create(title='Robot', grade='7', chorak=1, hafta=1)
    Lesson.objects.create(title='Harakat', grade='F7', chorak=1, hafta=1)


@pytest.mark.django_db
def test_lessons_follow_the_window(as_user, admin, teacher, lessons):
    c = as_user(admin)
    assert {r['title'] for r in _rows(c.get('/api/lessons/', **FIZ))} == {'Harakat'}
    assert {r['title'] for r in _rows(c.get('/api/lessons/', **STEAM))} == {'Robot'}
    assert {r['title'] for r in _rows(c.get('/api/lessons/'))} == {'Robot', 'Harakat'}  # no window: all
    # a physics-only teacher is always in the Fizika window, whatever is asked
    User.objects.filter(pk=teacher.pk).update(subjects=['fizika'])
    teacher.refresh_from_db()
    assert {r['title'] for r in _rows(as_user(teacher).get('/api/lessons/', **STEAM))} == {'Harakat'}


@pytest.mark.django_db
def test_journals_belong_to_the_window_they_were_made_in(as_user, teacher):
    c = as_user(teacher)
    r = c.post('/api/journal/classes/', {'name': '8-A', 'scale': 5}, format='json', **FIZ)
    assert r.status_code == 201, r.data
    assert JournalClass.objects.get(name='8-A').subject == 'fizika'
    c.post('/api/journal/classes/', {'name': '5-B', 'scale': 5}, format='json', **STEAM)
    assert {r['name'] for r in _rows(c.get('/api/journal/classes/', **FIZ))} == {'8-A'}
    assert {r['name'] for r in _rows(c.get('/api/journal/classes/', **STEAM))} == {'5-B'}


@pytest.mark.django_db
def test_saving_one_windows_week_keeps_the_others(as_user, teacher):
    TimetableSlot.objects.create(teacher=teacher, day_index=0, period_index=1, sinf='5-B', subject='steam')
    c = as_user(teacher)
    r = c.post('/api/timetable/slots/bulk/', [{'day_index': 0, 'period_index': 2, 'sinf': '8-A'}], format='json', **FIZ)
    assert r.status_code == 200, r.data
    assert set(TimetableSlot.objects.values_list('subject', 'sinf')) == {('steam', '5-B'), ('fizika', '8-A')}
    assert [s['sinf'] for s in _rows(c.get('/api/timetable/slots/', **FIZ))] == ['8-A']
    # the same hour as the STEAM lesson is refused, nothing is lost
    r = c.post('/api/timetable/slots/bulk/', [{'day_index': 0, 'period_index': 1, 'sinf': '9-A'}], format='json', **FIZ)
    assert r.status_code == 400 and 'STEAM' in r.data['detail']
    assert TimetableSlot.objects.count() == 2


@pytest.mark.django_db
def test_staff_and_library_lists_follow_the_window(as_user, admin, make_user):
    fiz = make_user('fiz@test.uz', approved=True)
    steam = make_user('steam@test.uz', approved=True)
    new = make_user('new@test.uz', approved=False)
    User.objects.filter(pk=fiz.pk).update(subjects=['fizika'])
    User.objects.filter(pk=steam.pk).update(subjects=['steam'])
    c = as_user(admin)
    ids = {u['id'] for u in _rows(c.get('/api/accounts/users/', **FIZ))}
    assert fiz.pk in ids and new.pk in ids and admin.pk in ids and steam.pk not in ids

    r = c.post('/api/library/', {'title': 'Optika', 'kind': 'havola', 'url': 'https://example.uz/o'}, format='json', **FIZ)
    assert r.status_code == 201 and LibraryItem.objects.get(title='Optika').subject == 'fizika'
    LibraryItem.objects.create(title='Arduino', kind='havola', url='https://example.uz/a', subject='steam')
    assert {b['title'] for b in _rows(c.get('/api/library/', **FIZ))} == {'Optika'}
    assert {b['title'] for b in _rows(c.get('/api/library/', **STEAM))} == {'Arduino'}


@pytest.mark.django_db
def test_a_pupil_is_in_their_classs_window(student, journal_class):
    from types import SimpleNamespace

    from common.subjects import window

    JournalClass.objects.filter(pk=journal_class.pk).update(subject='fizika')
    student.refresh_from_db()
    # whatever the browser sends, the pupil is in their class's fan window
    asked_steam = SimpleNamespace(user=student, headers={'X-Fan': 'steam'})
    assert window(asked_steam) == 'fizika'
