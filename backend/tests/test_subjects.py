"""Fanlar: Amaliy fizika and STEAM / Robototexnika — who sees which lessons,
library items and courses, and the administration pointing people to them."""
import pytest

from accounts.models import User
from common.subjects import grade_for_class, grades_for, subjects_for
from lessons.models import Lesson, QuarterLock
from library.models import LibraryItem
from staffroom.grades import lesson_grade


@pytest.fixture
def lessons(db):
    QuarterLock.objects.create(chorak=1, is_open=True)
    return {
        'steam7': Lesson.objects.create(title='Robot qo\'li', grade='7', chorak=1, hafta=1),
        'steam7b': Lesson.objects.create(title='Datchiklar', grade='7', chorak=1, hafta=2),
        'f7': Lesson.objects.create(title='Mexanik harakat', grade='F7', chorak=1, hafta=1),
        'f7b': Lesson.objects.create(title='Tezlik', grade='F7', chorak=1, hafta=2),
    }


def _titles(client, **params):
    r = client.get('/api/lessons/', params)
    assert r.status_code == 200, r.data
    rows = r.data['results'] if isinstance(r.data, dict) else r.data
    return {row['title'] for row in rows}


@pytest.mark.django_db
def test_a_physics_teacher_sees_only_physics(as_user, teacher, admin, lessons):
    c = as_user(teacher)
    assert _titles(c) == {'Robot qo\'li', 'Datchiklar', 'Mexanik harakat', 'Tezlik'}  # none set yet: both
    User.objects.filter(pk=teacher.pk).update(subjects=['fizika'])
    teacher.refresh_from_db()
    assert _titles(as_user(teacher)) == {'Mexanik harakat', 'Tezlik'}
    assert as_user(teacher).get(f"/api/lessons/{lessons['steam7'].id}/").status_code == 404
    # the administration sees everything and can narrow it
    assert len(_titles(as_user(admin))) == 4
    assert _titles(as_user(admin), subject='steam') == {'Robot qo\'li', 'Datchiklar'}


@pytest.mark.django_db
def test_grades_of_the_two_subjects_never_mix(as_user, admin, lessons):
    c = as_user(admin)
    # deleting a physics lesson renumbers physics 7 only
    assert c.delete(f"/api/lessons/{lessons['f7'].id}/").status_code == 204
    lessons['f7b'].refresh_from_db()
    lessons['steam7b'].refresh_from_db()
    assert lessons['f7b'].hafta == 1 and lessons['steam7b'].hafta == 2
    # a lesson is moved/copied only within its own subject
    r = c.post(f"/api/lessons/{lessons['f7b'].id}/move-copy/", {'mode': 'copy', 'grade': '8-9', 'chorak': 1}, format='json')
    assert r.status_code == 400
    r = c.post(f"/api/lessons/{lessons['f7b'].id}/move-copy/", {'mode': 'copy', 'grade': 'F8', 'chorak': 1}, format='json')
    assert r.status_code == 200 and r.data['grade'] == 'F8'


@pytest.mark.django_db
def test_the_administration_points_a_teacher_to_a_subject(as_user, admin, teacher, unapproved_teacher):
    c = as_user(admin)
    r = c.post(f'/api/accounts/users/{teacher.id}/set-subjects/', {'subjects': ['steam', 'fizika']}, format='json')
    assert r.status_code == 200 and r.data['subjects'] == ['fizika', 'steam']
    assert c.post(f'/api/accounts/users/{teacher.id}/set-subjects/', {'subjects': ['kimyo']}, format='json').status_code == 400
    # a teacher can't do it, not even for themselves
    assert as_user(teacher).post(f'/api/accounts/users/{teacher.id}/set-subjects/', {'subjects': []},
                                 format='json').status_code == 403
    # approving a sign-up picks the subject in the same step
    c = as_user(admin)
    r = c.post(f'/api/accounts/users/{unapproved_teacher.id}/approve/', {'subjects': ['fizika']}, format='json')
    assert r.status_code == 200
    unapproved_teacher.refresh_from_db()
    assert unapproved_teacher.approved and unapproved_teacher.subjects == ['fizika']
    me = as_user(unapproved_teacher).get('/api/accounts/me/').data
    assert me['subjects'] == ['fizika']


@pytest.mark.django_db
def test_who_sees_what(make_user, admin, observer):
    t = make_user('t@test.uz', role=User.Role.TEACHER, approved=True)
    assert subjects_for(t) == ['fizika', 'steam']
    t.subjects = ['steam']
    assert subjects_for(t) == ['steam'] and grades_for(t) == ['1-2', '3-4', '5-6', '7', '8-9']
    admin.subjects = ['steam']
    assert subjects_for(admin) == ['fizika', 'steam'] and subjects_for(observer) == ['fizika', 'steam']


def test_a_class_number_in_each_subject():
    assert grade_for_class(8, 'steam') == '8-9' and grade_for_class(8, 'fizika') == 'F8'
    assert grade_for_class(4, 'fizika') is None and lesson_grade(7, 'fizika') == 'F7' and lesson_grade(None) is None


@pytest.mark.django_db
def test_library_follows_the_subject(as_user, teacher):
    LibraryItem.objects.create(title='Umumiy', kind='kitob')
    LibraryItem.objects.create(title='Fizika masalalari', kind='kitob', subject='fizika')
    LibraryItem.objects.create(title='Arduino', kind='kitob', subject='steam')
    User.objects.filter(pk=teacher.pk).update(subjects=['fizika'])
    teacher.refresh_from_db()
    r = as_user(teacher).get('/api/library/')
    rows = r.data['results'] if isinstance(r.data, dict) else r.data
    assert {x['title'] for x in rows} == {'Umumiy', 'Fizika masalalari'}


@pytest.mark.django_db
def test_each_subject_opens_its_own_quarters(as_user, make_user, admin):
    QuarterLock.objects.create(subject='fizika', chorak=1, is_open=False)
    QuarterLock.objects.create(subject='fizika', chorak=2, is_open=True)
    Lesson.objects.create(title='Robot 2', grade='7', chorak=2, hafta=3)
    Lesson.objects.create(title='Bosim 2', grade='F8', chorak=2, hafta=1)
    Lesson.objects.create(title='Bosim 1', grade='F8', chorak=1, hafta=1)
    Lesson.objects.create(title='Robot 1', grade='7', chorak=1, hafta=1)
    t = make_user('both@test.uz', role=User.Role.TEACHER, approved=True)
    # STEAM: chorak 1 (no rows, the default); fizika: only chorak 2
    assert _titles(as_user(t)) == {'Robot 1', 'Bosim 2'}
    c = as_user(admin)
    assert c.get('/api/lessons/quarter-locks/', {'subject': 'fizika'}).data == {'1': False, '2': True, '3': False, '4': False}
    assert c.get('/api/lessons/quarter-locks/').data == {'1': True, '2': False, '3': False, '4': False}
    r = c.post('/api/lessons/quarter-locks/', {'subject': 'steam', 'chorak': 2, 'is_open': True}, format='json')
    assert r.status_code == 200 and r.data['subject'] == 'steam'
    assert QuarterLock.objects.get(subject='fizika', chorak=2).is_open  # untouched
    assert _titles(as_user(t)) == {'Robot 1', 'Robot 2', 'Bosim 2'}
