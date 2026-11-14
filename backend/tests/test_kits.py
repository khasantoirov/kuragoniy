"""STEM chamadonlar: a kit's contents against the lessons' equipment (which
kit a lesson needs, what is short), a school's kits, and "chamadon so'rash"
answered by the administration (a delivered kit lands in the school)."""

import pytest

from accounts.models import User
from journal.models import JournalClass
from kits.models import Kit, SchoolKit
from lessons.models import EquipmentItem, Experiment, Lesson, QuarterLock
from notifications.models import Notification
from schools.models import School, SchoolManager

pytestmark = pytest.mark.django_db


def _lesson(title, chorak, pieces):
    grade = Lesson.Grade.values[0]
    lesson = Lesson.objects.create(title=title, grade=grade, chorak=chorak, hafta=1)
    for i, exp_pieces in enumerate(pieces):
        exp = Experiment.objects.create(lesson=lesson, order=i, name=f'{title} tajriba {i + 1}')
        for j, (name, qty) in enumerate(exp_pieces):
            EquipmentItem.objects.create(experiment=exp, order=j, name=name, quantity=qty)
    return lesson


@pytest.fixture
def lessons():
    QuarterLock.objects.update_or_create(chorak=1, defaults={'is_open': True})
    a = _lesson('Bosim', 1, [[('Dinamometr', 1), ('Yuk', 2)], [('yuk', 3), ('Chizg‘ich', 1)]])
    b = _lesson('Ishqalanish', 1, [[('Dinamometr', 1), ('Brusok', 1)]])
    hidden = _lesson('Yopiq chorak', 4, [[('Dinamometr', 1)]])
    return a, b, hidden


@pytest.fixture
def kit(as_user, admin):
    c = as_user(admin)
    resp = c.post('/api/kits/', {'name': 'Mexanika chamadoni', 'code': 'MEX-7', 'instructions': "Ehtiyot bo'ling"},
                  format='json')
    assert resp.status_code == 201, resp.data
    kid = resp.data['id']
    put = c.put(f'/api/kits/{kid}/items/', {'items': [
        {'name': 'dinamometr', 'quantity': 2}, {'name': 'Yuk', 'quantity': 3}, {'name': "Chizg'ich", 'quantity': 1},
    ]}, format='json')
    assert put.status_code == 200 and len(put.data['items']) == 3
    return Kit.objects.get(pk=kid)


@pytest.fixture
def school(teacher):
    s = School.objects.create(name='Sodiq School')
    JournalClass.objects.create(teacher=teacher, name='7-A', school='Sodiq School', partner_school=s)
    return s


def test_lesson_coverage(as_user, teacher, lessons, kit):
    a, b, hidden = lessons
    data = as_user(teacher).get(f'/api/kits/lessons/{a.id}/').data
    # yuk: the most demanding experiment needs 3; "Chizg‘ich" matches "Chizg'ich"
    assert {n['name']: n['quantity'] for n in data['needs']} == {'Dinamometr': 1, 'Yuk': 3, 'Chizg‘ich': 1}
    assert data['kits'][0]['percent'] == 100 and data['kits'][0]['missing'] == []
    part = as_user(teacher).get(f'/api/kits/lessons/{b.id}/').data['kits'][0]
    assert part['percent'] == 50 and part['missing'] == [{'name': 'Brusok', 'quantity': 1, 'short': 1}]
    # a closed chorak's lesson stays hidden from teachers
    assert as_user(teacher).get(f'/api/kits/lessons/{hidden.id}/').status_code == 404
    card = as_user(teacher).get('/api/kits/').data[0]
    assert card['lessons_full'] == 1 and card['item_count'] == 3 and card['pieces'] == 6
    detail = as_user(teacher).get(f'/api/kits/{kit.id}/').data
    assert [(r['title'], r['percent']) for r in detail['lessons']] == [('Bosim', 100), ('Ishqalanish', 50)]
    assert 'schools' not in detail


def test_only_admins_build_kits(as_user, teacher, admin, lessons, kit):
    assert as_user(teacher).post('/api/kits/', {'name': 'X'}, format='json').status_code == 403
    assert as_user(teacher).put(f'/api/kits/{kit.id}/items/', {'items': []}, format='json').status_code == 403
    filled = as_user(admin).post(f'/api/kits/{kit.id}/fill/', {'lessons': [lessons[1].id]}, format='json')
    assert filled.status_code == 200 and filled.data['added'] == 1
    assert {i['name'] for i in filled.data['items']} >= {'Brusok'}
    as_user(admin).patch(f'/api/kits/{kit.id}/', {'is_active': False}, format='json')
    assert as_user(teacher).get('/api/kits/').data == []
    assert as_user(teacher).get(f'/api/kits/{kit.id}/').status_code == 404


def test_school_kits_and_owned(as_user, teacher, admin, lessons, kit, school):
    assert as_user(teacher).post(f'/api/kits/schools/{school.id}/', {'kit': kit.id}, format='json').status_code == 403
    assert as_user(admin).post(f'/api/kits/schools/{school.id}/', {'kit': kit.id, 'quantity': 2}, format='json').status_code == 200
    row = as_user(teacher).get(f'/api/kits/lessons/{lessons[0].id}/').data['kits'][0]
    assert row['owned'] == [{'id': school.id, 'name': 'Sodiq School', 'quantity': 2}]
    assert as_user(admin).get(f'/api/kits/schools/{school.id}/').data[0]['quantity'] == 2
    assert as_user(admin).get(f'/api/kits/{kit.id}/').data['schools'][0]['name'] == 'Sodiq School'


def test_request_flow_delivers_to_the_school(as_user, teacher, admin, lessons, kit, school, make_user):
    c = as_user(teacher)
    assert c.post('/api/kits/requests/', {}, format='json').status_code == 400
    other = School.objects.create(name='Iftixor')
    assert c.post('/api/kits/requests/', {'kit': kit.id, 'school': other.id}, format='json').status_code == 403
    resp = c.post('/api/kits/requests/', {'kit': kit.id, 'quantity': 1, 'note': 'Ikkinchi sinf xonasi uchun'},
                  format='json')
    assert resp.status_code == 201 and resp.data['school'] == school.id  # their only school, by default
    rid = resp.data['id']
    assert Notification.objects.filter(user=admin, kind='chamadon').exists()
    missing = c.post('/api/kits/requests/', {'lesson': lessons[1].id, 'items': [{'name': 'Brusok', 'quantity': 4}]},
                     format='json')
    assert missing.status_code == 201 and missing.data['items'] == [{'name': 'Brusok', 'quantity': 4}]

    assert as_user(teacher).patch(f'/api/kits/requests/{rid}/', {'status': 'yetkazildi'}, format='json').status_code == 403
    done = as_user(admin).patch(f'/api/kits/requests/{rid}/', {'status': 'yetkazildi', 'reply': 'Olib bordik'},
                                format='json')
    assert done.status_code == 200 and done.data['status_label'] == 'Yetkazildi'
    assert SchoolKit.objects.get(school=school, kit=kit).quantity == 1
    assert Notification.objects.filter(user=teacher, kind='chamadon').exists()
    assert as_user(teacher).patch(f'/api/kits/requests/{rid}/', {'status': 'bekor'}, format='json').status_code == 400
    assert as_user(teacher).patch(f"/api/kits/requests/{missing.data['id']}/", {'status': 'bekor'},
                                  format='json').status_code == 200
    rows = as_user(admin).get('/api/kits/requests/', {'all': '1', 'status': 'open'}).data
    assert rows == []


def test_school_admin_requests_observer_does_not(jwt_as, make_user, observer, kit, school):
    boss = make_user('boss@x.uz', role=User.Role.MAKTAB, approved=True)
    SchoolManager.objects.create(school=school, user=boss, position='direktor')
    resp = jwt_as(boss).post('/api/kits/requests/', {'kit': kit.id}, format='json')
    assert resp.status_code == 201 and resp.data['school'] == school.id
    assert jwt_as(observer).post('/api/kits/requests/', {'kit': kit.id}, format='json').status_code == 403
    assert jwt_as(boss).get(f'/api/kits/schools/{school.id}/').status_code == 200
