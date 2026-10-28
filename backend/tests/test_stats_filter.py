"""Statistika's one filter panel: the schools overview narrows to a school,
a teacher or a class; the learning analytics take the school too."""

from datetime import date

import pytest
from django.core.cache import cache

from journal.models import ClassDay, GradeEntry, JournalClass, Student
from schools.models import School

from .test_schools import _class_with_data

pytestmark = pytest.mark.django_db

OVERVIEW = '/api/schools/stats/overview/'


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def two_schools(teacher, make_user):
    a = School.objects.create(name='Sodiq')
    b = School.objects.create(name='Iftixor')
    other = make_user('t2-filter@example.com', approved=True)
    ca = _class_with_data(teacher, a)
    cb = JournalClass.objects.create(teacher=other, name='9-B', school=b.name)
    kid = Student.objects.create(journal_class=cb, full_name='Ali', order=0)
    day = ClassDay.objects.create(journal_class=cb, date=date(2026, 9, 12), chorak=1)
    GradeEntry.objects.create(student=kid, day=day, mark=5)
    loose = JournalClass.objects.create(teacher=other, name='5-V', school='Hech qayer')
    return a, b, ca, cb, other, loose


def _rows(client, **params):
    data = client.get(OVERVIEW, params).data
    return data, {r['name'] or 'none': r for r in data['schools']}


def test_unfiltered_lists_every_school(as_user, admin, two_schools):
    data, rows = _rows(as_user(admin))
    assert {'Sodiq', 'Iftixor', 'none'} <= set(rows)
    assert data['totals']['classes'] == 3


def test_by_school(as_user, admin, two_schools):
    a, b, ca, cb, other, loose = two_schools
    data, rows = _rows(as_user(admin), school=a.id)
    assert set(rows) == {'Sodiq'}
    assert data['totals']['classes'] == 1 and data['totals']['schools'] == 1
    assert rows['Sodiq']['uzlashtirish'] == 70.0
    data, rows = _rows(as_user(admin), school='none')
    assert set(rows) == {'none'} and data['totals']['classes'] == 1


def test_by_teacher_and_class(as_user, admin, teacher, two_schools):
    a, b, ca, cb, other, loose = two_schools
    data, rows = _rows(as_user(admin), teacher=other.id)
    assert set(rows) == {'Iftixor', 'none'} and data['totals']['teachers'] == 1
    assert rows['Iftixor']['teachers'] == 1
    data, rows = _rows(as_user(admin), **{'class': cb.id})
    assert set(rows) == {'Iftixor'} and data['totals']['classes'] == 1
    assert rows['Iftixor']['uzlashtirish'] == 100.0


def test_analytics_take_the_school(as_user, admin, two_schools):
    a, b, ca, cb, other, loose = two_schools
    c = as_user(admin)
    every = {r['class_id'] for r in c.get('/api/learning/analytics/classes/').data}
    assert {ca.id, cb.id, loose.id} <= every
    only_a = {r['class_id'] for r in c.get('/api/learning/analytics/classes/', {'school': a.id}).data}
    assert only_a == {ca.id}
    unlinked = {r['class_id'] for r in c.get('/api/learning/analytics/classes/', {'school': 'none'}).data}
    assert unlinked == {loose.id}
    assert c.get('/api/learning/analytics/overview/', {'school': a.id}).status_code == 200
