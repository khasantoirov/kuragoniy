"""Ustozlar xonasi: the school calendar (choraks and their weeks), the
teacher's day from the timetable with each hour's lesson, the teacher's own
pick, and "mehmon ustoz" requests answered by the administration."""

from datetime import date, timedelta

import pytest
from django.utils import timezone

from accounts.models import User
from journal.models import JournalClass
from learning.models import Attempt
from lessons.models import Lesson, QuarterLock
from notifications.models import Notification
from schools.models import AcademicYear
from staffroom import calendar
from staffroom.models import GuestRequest
from timetable.models import TimetableSlot

pytestmark = pytest.mark.django_db

MONDAY = date(2026, 11, 23)  # 2-chorak, 3rd week by the usual dates (starts Tue 10 Nov → its Monday 9 Nov)


@pytest.fixture
def lessons():
    QuarterLock.objects.update_or_create(chorak=2, defaults={'is_open': True})
    return [Lesson.objects.create(title=f'Mavzu {h}', grade=7, chorak=2, hafta=h) for h in (1, 2, 3, 4)]


@pytest.fixture
def slot(teacher):
    return TimetableSlot.objects.create(teacher=teacher, day_index=0, period_index=2, maktab='Sodiq School', sinf='7-A',
                                        xona='12')


def test_calendar_usual_and_set():
    assert calendar.place(MONDAY) == {'chorak': 2, 'week': 3, 'exact': False}
    assert calendar.place(date(2026, 11, 5))['chorak'] is None  # holidays
    assert calendar.next_school_day(date(2026, 11, 20)) == MONDAY  # Friday → Monday
    year, _ = AcademicYear.objects.get_or_create(start_year=2026)
    year.quarters = calendar.validate_quarters([
        {'start': '2026-09-02', 'end': '2026-10-31'}, {'start': '2026-11-16', 'end': '2026-12-26'},
        {'start': '2027-01-08', 'end': '2027-03-19'}, {'start': '2027-03-29', 'end': '2027-05-25'},
    ])
    year.save()
    assert calendar.place(MONDAY) == {'chorak': 2, 'week': 2, 'exact': True}
    with pytest.raises(ValueError):
        calendar.validate_quarters([{'start': '2026-09-02', 'end': '2026-08-01'}] * 4)
    with pytest.raises(ValueError):
        calendar.validate_quarters([])


def test_year_quarters_admin_only(as_user, admin, teacher):
    year = AcademicYear.current()
    q = [{'start': f'{year.start_year}-09-02', 'end': f'{year.start_year}-10-31'},
         {'start': f'{year.start_year}-11-09', 'end': f'{year.start_year}-12-26'},
         {'start': f'{year.start_year + 1}-01-08', 'end': f'{year.start_year + 1}-03-19'},
         {'start': f'{year.start_year + 1}-03-29', 'end': f'{year.start_year + 1}-05-25'}]
    rows = as_user(admin).get('/api/schools/years/').data
    assert rows[0]['quarters_exact'] is False and len(rows[0]['quarters']) == 4
    resp = as_user(admin).patch(f'/api/schools/years/{year.id}/', {'quarters': q}, format='json')
    assert resp.status_code == 200 and resp.data['quarters_exact'] is True
    bad = as_user(admin).patch(f'/api/schools/years/{year.id}/', {'quarters': q[:2]}, format='json')
    assert bad.status_code == 400
    assert as_user(teacher).patch(f'/api/schools/years/{year.id}/', {'quarters': q}, format='json').status_code == 403


def test_day_plan_guesses_the_weeks_lesson(as_user, teacher, lessons, slot):
    jc = JournalClass.objects.create(teacher=teacher, name='7-A', school='Sodiq School')
    Attempt.objects.create(user=teacher, kind=Attempt.Kind.READINESS, lesson=lessons[2], percent=85,
                           submitted_at=timezone.now())
    TimetableSlot.objects.create(teacher=teacher, day_index=0, period_index=4, band=True)
    data = as_user(teacher).get('/api/staffroom/day/', {'date': MONDAY.isoformat()}).data
    assert data['place'] == {'chorak': 2, 'week': 3, 'exact': False}
    first, busy = data['slots']
    assert first['class_name'] == '7-A' and first['grade'] == 7 and first['picked'] is False
    assert first['lesson']['title'] == 'Mavzu 3'
    assert first['lesson']['readiness'] == {'best': 85, 'passed': True}
    assert first['journal_class'] == {'id': jc.id, 'name': '7-A'}
    assert busy['band'] is True and 'lesson' not in busy
    assert [o['hafta'] for o in data['options']['7']] == [1, 2, 3, 4]
    # another weekday: no hours
    assert as_user(teacher).get('/api/staffroom/day/', {'date': (MONDAY + timedelta(days=1)).isoformat()}).data['slots'] == []


def test_teacher_picks_clears_and_resets(as_user, teacher, lessons, slot):
    c = as_user(teacher)
    day = MONDAY.isoformat()
    assert c.post('/api/staffroom/plan/', {'date': day, 'period': 2, 'lesson': lessons[0].id}, format='json').status_code == 200
    row = c.get('/api/staffroom/day/', {'date': day}).data['slots'][0]
    assert row['lesson']['title'] == 'Mavzu 1' and row['picked'] is True
    c.post('/api/staffroom/plan/', {'date': day, 'period': 2, 'lesson': None}, format='json')
    assert c.get('/api/staffroom/day/', {'date': day}).data['slots'][0]['lesson'] is None
    c.post('/api/staffroom/plan/', {'date': day, 'period': 2, 'reset': True}, format='json')
    assert c.get('/api/staffroom/day/', {'date': day}).data['slots'][0]['lesson']['title'] == 'Mavzu 3'
    # a closed chorak's lesson can't be picked by a teacher
    hidden = Lesson.objects.create(title='Yopiq', grade=7, chorak=3, hafta=10)
    assert c.post('/api/staffroom/plan/', {'date': day, 'period': 2, 'lesson': hidden.id}, format='json').status_code == 404


def test_read_only_roles_have_no_day(as_user, observer, make_user):
    assert as_user(observer).get('/api/staffroom/day/').status_code == 403
    boss = make_user('boss@x.uz', role=User.Role.MAKTAB, approved=True)
    assert as_user(boss).get('/api/staffroom/day/').status_code == 403


def test_guest_request_flow(as_user, teacher, admin, make_user, lessons):
    guest = make_user('guest@md.uz', approved=True)
    other = make_user('other@x.uz', approved=True)
    day = (timezone.localdate() + timedelta(days=3)).isoformat()
    c = as_user(teacher)
    assert c.post('/api/staffroom/guests/', {'date': '2020-01-01', 'class_name': '7-A'}, format='json').status_code == 400
    assert c.post('/api/staffroom/guests/', {'date': day}, format='json').status_code == 400  # where?
    resp = c.post('/api/staffroom/guests/', {'date': day, 'time': '3-soat', 'school_name': 'Sodiq School',
                                             'class_name': '7-A', 'lesson': lessons[1].id, 'note': 'Tajriba uchun'},
                  format='json')
    assert resp.status_code == 201, resp.data
    gid = resp.data['id']
    assert Notification.objects.filter(user=admin, kind='ustoz').exists()
    assert as_user(other).get('/api/staffroom/guests/').data == []
    # teachers can't answer; accepting needs a guest teacher
    assert c.patch(f'/api/staffroom/guests/{gid}/', {'status': 'qabul', 'guest': guest.id}, format='json').status_code == 403
    assert as_user(admin).patch(f'/api/staffroom/guests/{gid}/', {'status': 'qabul'}, format='json').status_code == 400
    ok = as_user(admin).patch(f'/api/staffroom/guests/{gid}/', {'status': 'qabul', 'guest': guest.id, 'reply': 'Boramiz'},
                              format='json')
    assert ok.status_code == 200 and ok.data['guest_name'] == guest.name and ok.data['status_label'] == 'Qabul qilindi'
    assert Notification.objects.filter(user=teacher, kind='ustoz').exists()
    assert Notification.objects.filter(user=guest, kind='ustoz').exists()
    assert [r['id'] for r in as_user(guest).get('/api/staffroom/guests/').data] == [gid]
    # answered: the requester can no longer cancel it
    assert as_user(teacher).patch(f'/api/staffroom/guests/{gid}/', {'status': 'bekor'}, format='json').status_code == 400
    allrows = as_user(admin).get('/api/staffroom/guests/', {'all': '1', 'status': 'open'}).data
    assert [r['id'] for r in allrows] == [gid]


def test_requester_cancels_a_fresh_request(as_user, teacher, make_user):
    other = make_user('other@x.uz', approved=True)
    day = (timezone.localdate() + timedelta(days=1)).isoformat()
    gid = as_user(teacher).post('/api/staffroom/guests/', {'date': day, 'class_name': '8-B'}, format='json').data['id']
    assert as_user(other).patch(f'/api/staffroom/guests/{gid}/', {'status': 'bekor'}, format='json').status_code == 403
    assert as_user(teacher).patch(f'/api/staffroom/guests/{gid}/', {'status': 'bekor'}, format='json').status_code == 200
    assert GuestRequest.objects.get(pk=gid).status == 'bekor'


def test_a_chorak_starting_on_a_weekend_counts_from_the_next_week():
    from datetime import date

    year, _ = AcademicYear.objects.get_or_create(start_year=2026)
    year.quarters = calendar.validate_quarters([
        {'start': '2026-09-02', 'end': '2026-11-03'}, {'start': '2026-11-10', 'end': '2026-12-27'},
        {'start': '2027-01-11', 'end': '2027-03-20'}, {'start': '2027-03-28', 'end': '2027-05-24'},  # 28.03 is a Sunday
    ])
    year.save()
    assert calendar.place(date(2027, 3, 29)) == {'chorak': 4, 'week': 1, 'exact': True}
    assert calendar.place(date(2027, 4, 5))['week'] == 2
