"""Maktabning dars vaqtlari (timetable/bells.py): a teacher of the school
enters its lesson times once, and every lesson there follows them."""

from datetime import time

import pytest

from schools.models import School
from timetable.models import SchoolBells, TimetableSlot

pytestmark = pytest.mark.django_db

BELLS = {
    '*': {'1': ['08:00', '08:45'], '2': ['08:50', '09:35'], '6': ['14:25', '15:05']},
    '4': {'6': ['14:30', '15:10']},  # Friday runs differently
}


@pytest.fixture
def school():
    return School.objects.create(name='Virtus International School')


def test_a_teacher_of_the_school_sets_its_times_for_everyone_there(as_user, teacher, make_user, school):
    other = make_user('other@example.com', approved=True)
    mine = TimetableSlot.objects.create(teacher=teacher, day_index=0, period_index=1, school=school, maktab=school.name,
                                        time_from=time(9), time_to=time(9, 40))
    theirs = TimetableSlot.objects.create(teacher=other, day_index=4, period_index=6, school=school, maktab=school.name)
    double = TimetableSlot.objects.create(teacher=other, day_index=1, period_index=1, span=2, school=school,
                                          maktab=school.name)
    band = TimetableSlot.objects.create(teacher=other, day_index=2, period_index=1, band=True, maktab='Universitet')

    r = as_user(teacher).put(f'/api/timetable/bells/{school.id}/', {'times': BELLS}, format='json')
    assert r.status_code == 200 and r.data['updated_slots'] == 3 and r.data['can_edit']

    for s in (mine, theirs, double, band):
        s.refresh_from_db()
    assert (mine.time_from, mine.time_to) == (time(8), time(8, 45))
    assert (theirs.time_from, theirs.time_to) == (time(14, 30), time(15, 10))  # Friday's own
    assert (double.time_from, double.time_to) == (time(8), time(9, 35))  # two periods
    assert band.time_from is None  # a "band" hour isn't the school's


def test_a_new_lesson_takes_the_schools_times(as_user, teacher, school):
    SchoolBells.objects.create(school=school, times=BELLS)
    week = [{'day_index': 0, 'period_index': 6, 'school': school.id, 'maktab': '', 'xona': '', 'sinf': '7-A',
             'span': 1, 'band': False, 'time_from': '10:00', 'time_to': '10:45'}]
    r = as_user(teacher).post('/api/timetable/slots/bulk/', week, format='json')
    assert r.status_code == 200
    assert (r.data[0]['time_from'], r.data[0]['time_to']) == ('14:25', '15:05')


def test_only_the_schools_teachers_and_the_administration_may_set_them(as_user, teacher, admin, school):
    r = as_user(teacher).put(f'/api/timetable/bells/{school.id}/', {'times': BELLS}, format='json')
    assert r.status_code == 403
    assert as_user(teacher).get(f'/api/timetable/bells/{school.id}/').data['can_edit'] is False
    assert as_user(admin).put(f'/api/timetable/bells/{school.id}/', {'times': BELLS}, format='json').status_code == 200
    # and anyone may read them
    rows = as_user(teacher).get('/api/timetable/bells/').data
    assert rows[0]['school'] == school.id and rows[0]['times']['4']['6'] == ['14:30', '15:10']


@pytest.mark.parametrize('times', [
    {'*': {'1': ['8:00', '08:45']}},            # not HH:MM
    {'*': {'1': ['08:45', '08:00']}},           # ends before it starts
    {'*': {'1': ['08:00', '08:45'], '2': ['08:30', '09:10']}},  # 2nd starts before the 1st ends
    {'*': {'9': ['08:00', '08:45']}},           # no 9th period
    {'7': {'1': ['08:00', '08:45']}},           # no such day
])
def test_wrong_times_are_refused(as_user, admin, school, times):
    r = as_user(admin).put(f'/api/timetable/bells/{school.id}/', {'times': times}, format='json')
    assert r.status_code == 400


def test_empty_rows_are_dropped(as_user, admin, school):
    r = as_user(admin).put(f'/api/timetable/bells/{school.id}/',
                           {'times': {'*': {'1': ['08:00', '08:45'], '2': ['', '']}, '4': {}}}, format='json')
    assert r.status_code == 200 and r.data['times'] == {'*': {'1': ['08:00', '08:45']}}
