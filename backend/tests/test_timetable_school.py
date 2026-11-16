"""Jadval: the school is picked from the partner schools the
administration keeps; free-text spellings get matched onto them."""
import pytest

from schools.models import School
from timetable.models import TimetableSlot


def _save(client, rows, teacher_id=None):
    url = '/api/timetable/slots/bulk/' + (f'?teacher={teacher_id}' if teacher_id else '')
    return client.post(url, rows, format='json')


@pytest.mark.django_db
def test_a_picked_school_names_the_cell(as_user, teacher):
    school = School.objects.create(name='Iftixor')
    r = _save(as_user(teacher), [{'day_index': 0, 'period_index': 1, 'school': school.id, 'maktab': 'iftixor sch', 'sinf': '7-A'}])
    assert r.status_code == 200
    slot = TimetableSlot.objects.get(teacher=teacher)
    assert slot.school == school and slot.maktab == 'Iftixor'
    assert r.data[0]['school'] == school.id


@pytest.mark.django_db
def test_band_keeps_its_free_text_place(as_user, teacher):
    school = School.objects.create(name='Iftixor')
    _save(as_user(teacher), [{'day_index': 0, 'period_index': 1, 'school': school.id, 'maktab': 'Universitet', 'band': True}])
    slot = TimetableSlot.objects.get(teacher=teacher)
    assert slot.school is None and slot.maktab == 'Universitet'


@pytest.mark.django_db
def test_linking_a_spelling_attaches_old_cells(as_user, admin, teacher):
    school = School.objects.create(name='Sodiq school Istirohat filiali')
    old = School.objects.create(name='Sodiq school (istirohat)', aliases=['Sodiq school'], is_active=False)
    TimetableSlot.objects.create(teacher=teacher, day_index=0, period_index=1, maktab='Sodiq school')
    TimetableSlot.objects.create(teacher=teacher, day_index=0, period_index=2, maktab='Universitet', band=True)
    names = [row['text'] for row in as_user(admin).get('/api/schools/unlinked/').data]
    assert 'Sodiq school' in names and 'Universitet' not in names

    # the inactive duplicate gives the spelling up
    r = as_user(admin).post('/api/schools/link/', {'variants': ['Sodiq school'], 'school': school.id}, format='json')
    assert r.status_code == 200 and r.data['slots'] == 1
    slot = TimetableSlot.objects.get(period_index=1)
    assert slot.school == school and slot.maktab == school.name
    old.refresh_from_db()
    assert 'Sodiq school' not in old.aliases
    assert TimetableSlot.objects.get(period_index=2).school is None


@pytest.mark.django_db
def test_renaming_a_school_renames_its_cells(as_user, admin, teacher):
    school = School.objects.create(name='Iftixor')
    TimetableSlot.objects.create(teacher=teacher, day_index=0, period_index=1, school=school, maktab='Iftixor')
    r = as_user(admin).patch(f'/api/schools/{school.id}/', {'name': 'Iftixor maktabi'}, format='json')
    assert r.status_code == 200
    assert TimetableSlot.objects.get(teacher=teacher).maktab == 'Iftixor maktabi'
