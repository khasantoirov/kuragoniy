"""Notification inbox, per-channel settings, sessions and the profile
overview (Sozlamalar → Profil / Bildirishnomalar / Integratsiyalar)."""

from datetime import date, timedelta
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.utils import timezone

from accounts.models import User, UserSession
from announcements.models import Announcement
from notifications.models import Kind, Notification, NotificationPreference
from notifications.service import notify

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()


# ── notify() honours each user's channels ───────────────────────────────

def test_notify_creates_inbox_row_and_respects_app_switch(teacher):
    notify(teacher, Kind.HISOBOT, 'Baholandi', '5/5', '/reports')
    assert Notification.objects.filter(user=teacher, kind=Kind.HISOBOT).count() == 1
    NotificationPreference.objects.create(user=teacher, channels={'hisobot': {'app': False}})
    notify(teacher, Kind.HISOBOT, 'Yana', '', '')
    assert Notification.objects.filter(user=teacher, kind=Kind.HISOBOT).count() == 1


def test_notify_telegram_only_when_linked_and_allowed(teacher):
    teacher.telegram_linked, teacher.telegram_chat_id = True, 123
    teacher.save()
    with patch('notifications.service.notify_user') as tg:
        notify(teacher, Kind.RAGBAT, 'Rag\'bat', '', '')
        assert tg.call_count == 1
        NotificationPreference.objects.create(user=teacher, channels={'ragbat': {'telegram': False}})
        notify(teacher, Kind.RAGBAT, 'Rag\'bat', '', '')
        assert tg.call_count == 1


def test_dedupe_key_creates_once(teacher):
    notify(teacher, Kind.TUGILGAN, 'A', dedupe_key='x')
    notify(teacher, Kind.TUGILGAN, 'A', dedupe_key='x')
    assert Notification.objects.filter(user=teacher, dedupe_key='x').count() == 1


# ── inbox API ───────────────────────────────────────────────────────────

def test_inbox_read_archive_and_summary(as_user, teacher, admin):
    n = notify(teacher, Kind.HISOBOT, 'Birinchi')[0]
    notify(admin, Kind.HISOBOT, 'Boshqaniki')
    c = as_user(teacher)
    rows = c.get('/api/notifications/').data['results']
    assert [r['title'] for r in rows] == ['Birinchi']
    s = c.get('/api/notifications/summary/', {'after': 0}).data
    assert s['unread'] == 1 and s['latest_id'] == n.id
    assert c.post(f'/api/notifications/{n.id}/read/').data['read_at']
    assert c.get('/api/notifications/summary/').data['unread'] == 0
    c.post(f'/api/notifications/{n.id}/archive/')
    assert c.get('/api/notifications/').data['results'] == []
    assert [r['id'] for r in c.get('/api/notifications/', {'box': 'archive'}).data['results']] == [n.id]
    c.post(f'/api/notifications/{n.id}/unarchive/')
    assert len(c.get('/api/notifications/').data['results']) == 1


def test_cannot_touch_someone_elses_notification(as_user, teacher, admin):
    n = notify(admin, Kind.HISOBOT, 'Admin uchun')[0]
    assert as_user(teacher).post(f'/api/notifications/{n.id}/read/').status_code == 400
    n.refresh_from_db()
    assert n.read_at is None


def test_summary_returns_fresh_items_after_id(as_user, teacher):
    first = notify(teacher, Kind.HISOBOT, 'Eski')[0]
    notify(teacher, Kind.RAGBAT, 'Yangi')
    fresh = as_user(teacher).get('/api/notifications/summary/', {'after': first.id}).data['fresh']
    assert [f['title'] for f in fresh] == ['Yangi']


def test_announcement_reaches_staff_inbox_not_author_and_is_removed_with_it(admin, teacher, make_user):
    kid = make_user('kid@example.com', role=User.Role.STUDENT, approved=True)
    ann = Announcement.objects.create(text="Ertaga yig'ilish", by=admin)
    assert Notification.objects.filter(kind=Kind.ELON, user=teacher).count() == 1
    assert not Notification.objects.filter(kind=Kind.ELON, user__in=[admin, kid]).exists()
    ann.delete()
    assert not Notification.objects.filter(kind=Kind.ELON).exists()


def test_birthdays_today_and_in_three_days(as_user, teacher, make_user):
    today = timezone.localdate()
    a = make_user('a@example.com', approved=True)
    a.bday = date(1990, today.month, today.day)
    a.save()
    soon = today + timedelta(days=3)
    b = make_user('b@example.com', approved=True)
    b.bday = date(1991, soon.month, soon.day)
    b.save()
    as_user(teacher).get('/api/notifications/summary/')
    as_user(teacher).get('/api/notifications/summary/')
    rows = Notification.objects.filter(user=teacher, kind=Kind.TUGILGAN)
    assert rows.count() == 2
    assert {r.data['days'] for r in rows} == {0, 3}


# ── preferences ─────────────────────────────────────────────────────────

def test_prefs_get_put_and_ui_validation(as_user, teacher):
    c = as_user(teacher)
    data = c.get('/api/notifications/prefs/').data
    assert {k['key'] for k in data['kinds']} >= {'elon', 'hisobot', 'xavfsizlik'}
    assert 'dokon' not in data['channels']  # teachers don't get shop messages
    resp = c.put('/api/notifications/prefs/', {'channels': {'elon': {'telegram': False}, 'dokon': {'app': False}},
                                               'ui': {'themeMode': 'system', 'navItems': ['/', '/lessons']}}, format='json')
    assert resp.status_code == 200
    assert resp.data['channels']['elon']['telegram'] is False
    assert resp.data['ui'] == {'themeMode': 'system', 'navItems': ['/', '/lessons']}
    assert c.put('/api/notifications/prefs/', {'ui': {'navItems': ['/a', '/b', '/c', '/d', '/e']}}, format='json').status_code == 400
    assert c.put('/api/notifications/prefs/', {'ui': {'themeMode': 'neon'}}, format='json').status_code == 400


def test_bot_announcement_fanout_respects_telegram_switch(teacher, make_user):
    from asgiref.sync import async_to_sync

    from telegrambot.bot.announcements import _linked_users

    other = make_user('o@example.com', approved=True)
    for u, chat in ((teacher, 1), (other, 2)):
        u.telegram_linked, u.telegram_chat_id = True, chat
        u.save()
    NotificationPreference.objects.create(user=other, channels={'elon': {'telegram': False}})
    assert async_to_sync(_linked_users)() == [(teacher.id, 1)]


# ── sessions ────────────────────────────────────────────────────────────

def _login(api_client, email, ua='Mozilla/5.0 (Windows NT 10.0) Chrome/130'):
    return api_client.post('/api/auth/login/', {'login': email, 'password': 'testpass123'}, HTTP_USER_AGENT=ua)


def test_login_creates_session_listed_as_current(api_client, teacher):
    assert _login(api_client, teacher.email).status_code == 200
    rows = api_client.get('/api/auth/sessions/', HTTP_AUTHORIZATION=f"Bearer {api_client.post('/api/auth/refresh/').data['access']}").data
    assert len(rows) == 1 and rows[0]['current'] and rows[0]['label'] == 'Kompyuter · Windows · Chrome 130'


def test_new_device_login_warns(api_client, teacher):
    from rest_framework.test import APIClient

    _login(api_client, teacher.email)
    _login(APIClient(), teacher.email, ua='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1')
    assert Notification.objects.filter(user=teacher, kind=Kind.XAVFSIZLIK, title='Yangi qurilmadan kirildi').count() == 1


def test_revoking_another_session_blocks_its_refresh(teacher):
    from rest_framework.test import APIClient

    phone, laptop = APIClient(), APIClient()
    _login(phone, teacher.email, ua='Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile')
    _login(laptop, teacher.email)
    access = laptop.post('/api/auth/refresh/').data['access']
    rows = laptop.get('/api/auth/sessions/', HTTP_AUTHORIZATION=f'Bearer {access}').data
    other = next(r for r in rows if not r['current'])
    mine = next(r for r in rows if r['current'])
    assert laptop.post(f"/api/auth/sessions/{mine['id']}/revoke/", HTTP_AUTHORIZATION=f'Bearer {access}').status_code == 400
    assert laptop.post(f"/api/auth/sessions/{other['id']}/revoke/", HTTP_AUTHORIZATION=f'Bearer {access}').status_code == 204
    assert phone.post('/api/auth/refresh/').status_code == 401
    assert laptop.post('/api/auth/refresh/').status_code == 200


def test_logout_and_logout_all_end_sessions(api_client, teacher):
    _login(api_client, teacher.email)
    access = api_client.post('/api/auth/refresh/').data['access']
    api_client.post('/api/accounts/me/logout-all/', HTTP_AUTHORIZATION=f'Bearer {access}')
    assert not UserSession.objects.filter(user=teacher, revoked_at__isnull=True).exists()


# ── profile overview & security log ─────────────────────────────────────

def test_overview_and_security_log(api_client, as_user, teacher):
    _login(api_client, teacher.email)
    data = as_user(teacher).get('/api/accounts/me/overview/').data
    assert data['reports'] == {'total': 0, 'reviewed': 0, 'returned': 0, 'pending': 0} and data['rating'] is None
    log = as_user(teacher).get('/api/accounts/me/security-log/').data
    assert log and log[0]['action'] == 'login_ok'


def test_observer_can_manage_own_notifications(as_user, make_user):
    obs = make_user('obs@example.com', role=User.Role.KUZATUVCHI, approved=True)
    n = notify(obs, Kind.TIZIM, 'Salom')[0]
    assert as_user(obs).post(f'/api/notifications/{n.id}/read/').status_code == 200
    assert as_user(obs).put('/api/notifications/prefs/', {'channels': {'tizim': {'telegram': False}}}, format='json').status_code == 200
