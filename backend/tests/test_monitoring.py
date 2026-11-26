"""/api/dashboard/monitoring/ — the administration's overview (Bosh sahifa
and Statistika › Monitoring): live counts, the fan window, who may read it."""

from datetime import date, time, timedelta

import pytest
from django.utils import timezone

from accounts.models import User
from journal.models import ClassDay, GradeEntry, JournalClass, Student
from schools.models import AcademicYear, School, SchoolLicense, SchoolTeacher
from timetable.models import TimetableSlot

URL = '/api/dashboard/monitoring/'


@pytest.fixture
def world(make_user):
    """Two schools (one licence ending soon), a teacher at each fan, marks."""
    today = timezone.localdate()
    year = AcademicYear.current()
    a = School.objects.create(name='Sodiq School', district='Uchtepa')
    b = School.objects.create(name='Iftixor school')
    SchoolLicense.objects.create(school=a, plan='standart', starts_on=today - timedelta(days=100),
                                 ends_on=today + timedelta(days=5), paid=True)
    SchoolLicense.objects.create(school=b, plan='premium', starts_on=today - timedelta(days=10),
                                 ends_on=today + timedelta(days=300), paid=True)
    fiz = make_user('fiz@example.com', approved=True)
    User.objects.filter(pk=fiz.pk).update(subjects=['fizika'])
    st = make_user('st@example.com', approved=True)
    User.objects.filter(pk=st.pk).update(subjects=['steam'])
    SchoolTeacher.objects.create(school=a, teacher=fiz, kind=SchoolTeacher.Kind.MUHANDIS)
    SchoolTeacher.objects.create(school=b, teacher=st)

    cf = JournalClass.objects.create(teacher=fiz, name='7-A', partner_school=a, subject='fizika', year=year)
    cs = JournalClass.objects.create(teacher=st, name='5-B', partner_school=b, subject='steam', year=year)
    pupils_f = [Student.objects.create(journal_class=cf, full_name=f'F{i}', order=i) for i in range(4)]
    Student.objects.create(journal_class=cs, full_name='S0', order=0)
    day = ClassDay.objects.create(journal_class=cf, date=today - timedelta(days=1), chorak=2)
    for p, mark in zip(pupils_f, (5, 4, 3, 2)):
        GradeEntry.objects.create(student=p, day=day, mark=mark)

    if today.weekday() < 5:
        TimetableSlot.objects.create(teacher=fiz, day_index=today.weekday(), period_index=1, school=a,
                                     sinf='7-A', subject='fizika', time_from=time(8, 0), time_to=time(8, 45))
        TimetableSlot.objects.create(teacher=st, day_index=today.weekday(), period_index=2, school=b,
                                     sinf='5-B', subject='steam', time_from=time(9, 0), time_to=time(9, 45))
        ClassDay.objects.create(journal_class=cf, date=today, chorak=2)  # 7-A's lesson today is written
    return {'a': a, 'b': b, 'today': today}


@pytest.mark.django_db
def test_only_the_oversight_roles_read_it(jwt_as, teacher, admin, observer):
    assert jwt_as(teacher).get(URL).status_code == 403
    assert jwt_as(admin).get(URL).status_code == 200
    assert jwt_as(observer).get(URL).status_code == 200


@pytest.mark.django_db
def test_the_figures(jwt_as, admin, world):
    d = jwt_as(admin).get(URL).data  # no window asked: everything
    assert d['kpi']['schools'] == {'total': 2, 'in_force': 2}
    assert d['kpi']['pupils'] == 5
    assert d['kpi']['muhandis'] == {'teachers': 1, 'schools': 1}
    # the licence ending in 5 days is listed; the one with 300 days left isn't
    assert [r['name'] for r in d['licences']['ending']] == ['Sodiq School']
    assert d['licences']['ending'][0]['days_left'] == 5
    # marks 5,4,3,2: three of four passed, two of four good
    month = d['monthly'][-1]
    assert month['marks'] == 4 and month['passed'] == 75.0 and month['quality'] == 50.0
    table = {r['name']: r for r in d['schools']}
    assert table['Sodiq School']['pupils'] == 4 and table['Sodiq School']['muhandis'] == 1
    assert table['Sodiq School']['licence']['state'] == 'ending'
    if world['today'].weekday() < 5:
        today = {r['name']: r for r in d['today']['schools']}
        assert today['Sodiq School'] == {**today['Sodiq School'], 'lessons': 1, 'done': 1}
        assert today['Iftixor school']['done'] == 0


@pytest.mark.django_db
def test_it_follows_the_fan_window(jwt_as, admin, world):
    client = jwt_as(admin)
    fiz = client.get(URL, HTTP_X_FAN='fizika').data
    steam = client.get(URL, HTTP_X_FAN='steam').data
    assert fiz['fan'] == 'fizika' and fiz['kpi']['pupils'] == 4
    assert steam['kpi']['pupils'] == 1 and steam['monthly'] == []
    assert fiz['kits'] is None and steam['kits'] is not None  # the kits are STEAM's
    if world['today'].weekday() < 5:
        assert [r['name'] for r in fiz['today']['schools']] == ['Sodiq School']
        assert [r['name'] for r in steam['today']['schools']] == ['Iftixor school']
    # schools and licences are the organisation's, the same in both
    assert fiz['kpi']['schools'] == steam['kpi']['schools']


@pytest.mark.django_db
def test_requests_waiting(jwt_as, admin, teacher, world):
    from helpdesk.models import Ticket
    from website.models import Lead

    Lead.objects.create(name='Ali', phone='+998901112233')
    Ticket.objects.create(author=teacher, subject='Yordam', fan='fizika')
    d = jwt_as(admin).get(URL, HTTP_X_FAN='fizika').data
    assert d['requests']['leads_new'] == 1 and d['requests']['tickets_open'] == 1
    assert jwt_as(admin).get(URL, HTTP_X_FAN='steam').data['requests']['tickets_open'] == 0
