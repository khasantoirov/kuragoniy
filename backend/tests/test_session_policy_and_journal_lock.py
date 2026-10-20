"""Device details on sessions, the 24-hour / 30-minute session limits, and
the journal's past-day lock with administrator permissions."""

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import UserSession
from common.useragent import android_device, parse_hints, summarize
from journal.models import ClassDay, GradeEntry, JournalEditGrant
from notifications.models import Kind, Notification

pytestmark = pytest.mark.django_db

CHROME_ANDROID = ('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) '
                  'Chrome/141.0.0.0 Mobile Safari/537.36')
CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'


# ── device summary ──────────────────────────────────────────────────────

def test_client_hints_name_the_phone():
    info = summarize(CHROME_ANDROID, parse_hints('model=SM-A525F&pv=13.0.0&ff=Mobile'))
    assert info['label'] == 'Samsung Galaxy A52 · Android 13 · Chrome 141'
    assert info['kind'] == 'phone' and info['model'] == 'SM-A525F'


def test_reduced_ua_without_hints_does_not_claim_android_10():
    info = summarize(CHROME_ANDROID)
    assert info['label'] == 'Telefon · Android · Chrome 141'


@pytest.mark.parametrize('model, name', [
    ('SM-S918B', 'Samsung Galaxy S23 Ultra'),
    ('SM-G991B', 'Samsung Galaxy S21'),
    ('SM-A155F', 'Samsung Galaxy A15'),
    ('SM-F946B', 'Samsung Galaxy Z Fold5'),
    ('Redmi Note 8 Pro', 'Xiaomi Redmi Note 8 Pro'),
    ('23021RAA2Y', 'Xiaomi 23021RAA2Y'),
    ('TECNO KI5k', 'Tecno KI5k'),
    ('RMX3360', 'realme RMX3360'),
    ('Pixel 7', 'Google Pixel 7'),
    ('K', ''),
])
def test_android_model_names(model, name):
    assert android_device(model) == name


def test_windows_11_and_iphone_and_telegram():
    assert summarize(CHROME_WIN, {'pv': '15.0.0'})['label'] == 'Kompyuter · Windows 11 · Chrome 141'
    assert summarize(CHROME_WIN, {'pv': '10.0.0'})['os_full'] == 'Windows 10'
    iphone = summarize('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Version/17.4 Mobile/15E148 Safari/604.1')
    assert iphone['label'] == 'Apple iPhone · iOS 17.4 · Safari 17.4'
    tg = summarize('Mozilla/5.0 (Linux; Android 13; K) Chrome/141.0.0.0 Mobile Safari/537.36 '
                   'Telegram-Android/11.2.3 (Samsung SM-A346B; Android 13; SDK 33; AVERAGE)')
    assert tg['device'] == 'Samsung Galaxy A34'


def test_hints_header_is_sanitised():
    assert parse_hints('model=<script>&pv=13.0.0&evil=1') == {'model': 'script', 'pv': '13.0.0'}


# ── sessions: details, new-device notice ────────────────────────────────

def _login(client, email, ua=CHROME_WIN, device=''):
    return client.post('/api/auth/login/', {'login': email, 'password': 'testpass123'},
                       HTTP_USER_AGENT=ua, HTTP_X_DEVICE=device)


def test_login_stores_hints_and_lists_device(teacher):
    c = APIClient()
    _login(c, teacher.email, CHROME_ANDROID, 'model=SM-A525F&pv=13.0.0&ff=Mobile')
    access = c.post('/api/auth/refresh/').data['access']
    row = c.get('/api/auth/sessions/', HTTP_AUTHORIZATION=f'Bearer {access}').data[0]
    assert row['device'] == 'Samsung Galaxy A52' and row['kind'] == 'phone' and row['os_full'] == 'Android 13'


def test_new_device_notice_names_the_model_but_old_sessions_dont_spam(teacher):
    # A session from before hints existed: same family, no model → no notice.
    _login(APIClient(), teacher.email, CHROME_ANDROID)
    _login(APIClient(), teacher.email, CHROME_ANDROID, 'model=SM-A525F&pv=13.0.0')
    assert not Notification.objects.filter(user=teacher, title='Yangi qurilmadan kirildi').exists()
    # A different phone model with the same browser → notice with the name.
    _login(APIClient(), teacher.email, CHROME_ANDROID, 'model=Redmi Note 8 Pro&pv=11')
    n = Notification.objects.get(user=teacher, title='Yangi qurilmadan kirildi')
    assert n.body.startswith('Xiaomi Redmi Note 8 Pro · Android 11 · Chrome 141')


def test_refresh_fills_device_for_older_sessions(teacher):
    c = APIClient()
    _login(c, teacher.email, CHROME_ANDROID)
    c.post('/api/auth/refresh/', HTTP_X_DEVICE='model=SM-A525F&pv=14')
    assert UserSession.objects.get(user=teacher).device == {'model': 'SM-A525F', 'pv': '14'}


# ── 24-hour and 30-minute limits ────────────────────────────────────────

def test_refresh_after_24_hours_requires_password(teacher):
    c = APIClient()
    _login(c, teacher.email)
    UserSession.objects.filter(user=teacher).update(created_at=timezone.now() - timedelta(hours=25))
    r = c.post('/api/auth/refresh/')
    assert r.status_code == 401 and r.data['code'] == 'expired'
    assert UserSession.objects.get(user=teacher).revoked_at is not None


def test_old_30_day_token_is_cut_at_24_hours(teacher):
    from rest_framework_simplejwt.tokens import RefreshToken

    token = RefreshToken.for_user(teacher)
    token.set_iat(at_time=timezone.now() - timedelta(hours=30))
    c = APIClient()
    c.cookies['refresh_token'] = str(token)
    r = c.post('/api/auth/refresh/')
    assert r.status_code == 401 and r.data['code'] == 'expired'


def test_cookie_lasts_24_hours(teacher):
    r = _login(APIClient(), teacher.email)
    assert int(r.cookies['refresh_token']['max-age']) == 24 * 3600


def test_idle_reported_by_app_logs_out(teacher):
    c = APIClient()
    _login(c, teacher.email)
    assert c.post('/api/auth/refresh/', {'idle': 60}, format='json').status_code == 200
    r = c.post('/api/auth/refresh/', {'idle': 31 * 60}, format='json')
    assert r.status_code == 401 and r.data['code'] == 'idle'
    assert c.post('/api/auth/refresh/').status_code == 401


def test_session_silent_for_too_long_is_closed(teacher):
    c = APIClient()
    _login(c, teacher.email)
    UserSession.objects.filter(user=teacher).update(last_seen_at=timezone.now() - timedelta(minutes=55))
    r = c.post('/api/auth/refresh/')
    assert r.status_code == 401 and r.data['code'] == 'idle'


# ── journal: past days are closed ───────────────────────────────────────

def _day(offset=0):
    return (timezone.localdate() + timedelta(days=offset)).isoformat()


def _mark(client, jc, date, mark=5):
    student = jc.students.first()
    return client.post(f'/api/journal/classes/{jc.id}/bulk-marks/',
                       {'date': date, 'chorak': 1, 'marks': [{'student_id': student.id, 'mark': mark}]}, format='json')


def test_teacher_edits_today_but_not_yesterday(as_user, teacher, journal_class):
    c = as_user(teacher)
    assert _mark(c, journal_class, _day()).status_code == 200
    r = _mark(c, journal_class, _day(-1))
    assert r.status_code == 403 and r.data['code'] == 'journal_locked'
    assert _mark(c, journal_class, _day(1)).status_code == 403
    grid = c.get(f'/api/journal/classes/{journal_class.id}/grid/').data
    assert grid['lock']['today'] == _day() and grid['lock']['owner'] is True and grid['lock']['can_grant'] is False


def test_past_day_cannot_be_dropped(as_user, teacher, journal_class):
    ClassDay.objects.create(journal_class=journal_class, date=_day(-2), chorak=1)
    r = as_user(teacher).post(f'/api/journal/classes/{journal_class.id}/drop-day/', {'date': _day(-2)}, format='json')
    assert r.status_code == 403 and ClassDay.objects.filter(journal_class=journal_class).exists()


def test_admin_own_journal_is_locked_until_they_open_it(as_user, admin):
    from journal.models import JournalClass, Student

    jc = JournalClass.objects.create(teacher=admin, name='9-B')
    Student.objects.create(journal_class=jc, full_name='Ali', order=0)
    c = as_user(admin)
    assert _mark(c, jc, _day()).status_code == 200
    assert _mark(c, jc, _day(-10)).status_code == 403
    r = c.post('/api/journal/grants/', {'teacher': admin.id, 'journal_class': jc.id, 'date_from': _day(-10),
                                        'hours': 1}, format='json')
    assert r.status_code == 201
    assert _mark(c, jc, _day(-10)).status_code == 200
    # Opening their own days doesn't notify themselves.
    assert not Notification.objects.filter(user=admin, kind=Kind.JURNAL).exists()


def test_admin_sees_teacher_journal_read_only(as_user, admin, teacher, journal_class):
    c = as_user(admin)
    grid = c.get(f'/api/journal/classes/{journal_class.id}/grid/', {'teacher': teacher.id}).data
    assert grid['lock']['owner'] is False and grid['lock']['can_grant'] is True
    assert grid['lock']['teacher'] == teacher.id
    assert len(c.get('/api/journal/classes/', {'teacher': teacher.id}).data['results']) == 1
    # Writes never reach another teacher's journal, today included.
    r = c.post(f'/api/journal/classes/{journal_class.id}/bulk-marks/?teacher={teacher.id}',
               {'date': _day(), 'chorak': 1, 'marks': []}, format='json')
    assert r.status_code == 404


def test_teacher_row_opens_all_past_days_and_answers_requests(teacher, admin, make_user, journal_class):
    teacher_c, admin_c = APIClient(), APIClient()
    teacher_c.force_authenticate(teacher)
    admin_c.force_authenticate(admin)
    make_user('noclass@example.com', approved=True)
    rows = {r['name']: r for r in admin_c.get('/api/journal/grants/teachers/').data}
    assert {'teacher', 'admin', 'noclass'} <= set(rows)
    assert rows['noclass']['classes'] == [] and rows['teacher']['classes'][0]['id'] == journal_class.id

    gid = teacher_c.post('/api/journal/grants/', {'journal_class': journal_class.id, 'date': _day(-2),
                                                  'reason': 'x'}, format='json').data['id']
    assert {r['name']: r for r in admin_c.get('/api/journal/grants/teachers/').data}['teacher']['pending'] == 1
    with patch('notifications.service.notify_user'):
        r = admin_c.post('/api/journal/grants/', {'teacher': teacher.id, 'all_past': True, 'hours': 3}, format='json')
    assert r.status_code == 201 and r.data['date_to'] == _day(-1)
    assert JournalEditGrant.objects.get(pk=gid).status == 'approved'
    assert _mark(teacher_c, journal_class, _day(-30)).status_code == 200
    rows = {r['name']: r for r in admin_c.get('/api/journal/grants/teachers/').data}
    assert rows['teacher']['open'] and rows['teacher']['pending'] == 0

    assert admin_c.post('/api/journal/grants/close-teacher/', {'teacher': teacher.id}, format='json').data['closed'] == 2
    assert _mark(teacher_c, journal_class, _day(-30)).status_code == 403


def test_request_approve_then_edit_then_expire(api_client, teacher, admin, journal_class):
    teacher_c = APIClient()
    teacher_c.force_authenticate(teacher)
    admin_c = APIClient()
    admin_c.force_authenticate(admin)

    r = teacher_c.post('/api/journal/grants/', {'journal_class': journal_class.id, 'date': _day(-1),
                                                'reason': "Internet yo'q edi"}, format='json')
    assert r.status_code == 201 and r.data['status'] == 'pending'
    gid = r.data['id']
    # Asking twice returns the same request.
    again = teacher_c.post('/api/journal/grants/', {'journal_class': journal_class.id, 'date': _day(-1),
                                                    'reason': 'yana'}, format='json')
    assert again.status_code == 200 and again.data['id'] == gid
    assert Notification.objects.filter(user=admin, kind=Kind.JURNAL, read_at__isnull=True).count() == 1

    # Teachers can't approve.
    assert teacher_c.post(f'/api/journal/grants/{gid}/approve/').status_code == 403
    assert _mark(teacher_c, journal_class, _day(-1)).status_code == 403

    with patch('notifications.service.notify_user'):
        r = admin_c.post(f'/api/journal/grants/{gid}/approve/', {'hours': 2}, format='json')
    assert r.status_code == 200 and r.data['active']
    assert not Notification.objects.filter(user=admin, kind=Kind.JURNAL, read_at__isnull=True).exists()
    assert Notification.objects.filter(user=teacher, kind=Kind.JURNAL, title='Jurnalni tahrirlashga ruxsat berildi').exists()

    assert _mark(teacher_c, journal_class, _day(-1), 4).status_code == 200
    assert GradeEntry.objects.get(day__date=_day(-1)).mark == 4
    # Only the granted day opened.
    assert _mark(teacher_c, journal_class, _day(-2)).status_code == 403

    JournalEditGrant.objects.filter(pk=gid).update(expires_at=timezone.now() - timedelta(minutes=1))
    assert _mark(teacher_c, journal_class, _day(-1), 3).status_code == 403


def test_reject_and_revoke_and_direct_grant(teacher, admin, journal_class):
    teacher_c, admin_c = APIClient(), APIClient()
    teacher_c.force_authenticate(teacher)
    admin_c.force_authenticate(admin)

    gid = teacher_c.post('/api/journal/grants/', {'journal_class': journal_class.id, 'date': _day(-3),
                                                  'reason': 'x'}, format='json').data['id']
    assert admin_c.post(f'/api/journal/grants/{gid}/reject/', {'note': "Yo'q"}, format='json').data['status'] == 'rejected'
    assert _mark(teacher_c, journal_class, _day(-3)).status_code == 403

    # Direct grant for a range across all classes.
    r = admin_c.post('/api/journal/grants/', {'teacher': teacher.id, 'date_from': _day(-5), 'date_to': _day(-1),
                                              'hours': 24}, format='json')
    assert r.status_code == 201, r.data
    assert r.data['class_label'] == 'Barcha sinflar'
    assert _mark(teacher_c, journal_class, _day(-4)).status_code == 200
    grid = teacher_c.get(f'/api/journal/classes/{journal_class.id}/grid/').data
    assert len(grid['lock']['grants']) == 1

    assert admin_c.post(f"/api/journal/grants/{r.data['id']}/revoke/").data['status'] == 'revoked'
    assert _mark(teacher_c, journal_class, _day(-4)).status_code == 403

    teachers = {r['name']: r for r in admin_c.get('/api/journal/grants/teachers/').data}
    assert teachers['teacher']['classes'][0]['id'] == journal_class.id
    assert teacher_c.get('/api/journal/grants/teachers/').status_code == 403
    # A teacher sees only their own grants.
    assert {g['teacher'] for g in teacher_c.get('/api/journal/grants/').data} == {teacher.id}


def test_cannot_request_today_or_future_or_foreign_class(teacher, make_user, journal_class):
    c = APIClient()
    c.force_authenticate(teacher)
    assert c.post('/api/journal/grants/', {'journal_class': journal_class.id, 'date': _day(), 'reason': 'x'},
                  format='json').status_code == 400
    assert c.post('/api/journal/grants/', {'journal_class': journal_class.id, 'date': _day(2), 'reason': 'x'},
                  format='json').status_code == 400
    other = make_user('other@example.com', approved=True)
    c2 = APIClient()
    c2.force_authenticate(other)
    assert c2.post('/api/journal/grants/', {'journal_class': journal_class.id, 'date': _day(-1), 'reason': 'x'},
                   format='json').status_code == 404


def test_zero_is_a_real_mark(as_user, teacher, journal_class):
    c = as_user(teacher)
    assert _mark(c, journal_class, _day(), 0).status_code == 200
    assert GradeEntry.objects.get(day__date=_day()).mark == 0
    assert _mark(c, journal_class, _day(), 6).status_code == 400
    student = journal_class.students.first()
    url = f'/api/journal/classes/{journal_class.id}/set-final/'
    c.post(url, {'student_id': student.id, 'chorak': 1, 'mark': 0}, format='json')
    assert student.finals.get(chorak=1).mark == 0
    assert c.post(url, {'student_id': student.id, 'chorak': 1, 'mark': 7}, format='json').status_code == 400
    c.post(url, {'student_id': student.id, 'chorak': 1, 'mark': None}, format='json')
    assert not student.finals.exists()


def test_day_page_period_and_kirmadi(as_user, teacher, journal_class):
    c = as_user(teacher)
    kids = list(journal_class.students.all())
    r = c.post(f'/api/journal/classes/{journal_class.id}/bulk-marks/', {
        'date': _day(), 'chorak': 1, 'topic': 'Tezlik', 'period': 4,
        'attendance': [{'student_id': kids[0].id, 'status': 'x'}, {'student_id': kids[1].id, 'status': 'n'}],
        'marks': [{'student_id': kids[2].id, 'mark': 5}],
    }, format='json')
    assert r.status_code == 200
    day = next(d for d in r.data['days'] if d['date'] == _day())
    assert day['period'] == 4 and day['attendance'][kids[0].id] == 'x'
    # A later save without `period` keeps it.
    c.post(f'/api/journal/classes/{journal_class.id}/bulk-marks/', {'date': _day(), 'chorak': 1, 'topic': 'Tezlik'}, format='json')
    assert ClassDay.objects.get(journal_class=journal_class, date=_day()).period == 4
