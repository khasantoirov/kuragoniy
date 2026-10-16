"""Online / last-seen tracking (common/presence.py)."""

from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone

from accounts.models import User
from common.presence import presence_of, touch

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def test_request_marks_user_online(jwt_as, teacher):
    assert presence_of(teacher)['online'] is False
    jwt_as(teacher).get('/api/lessons/')
    teacher.refresh_from_db()
    p = presence_of(teacher)
    assert p['online'] is True and p['last_seen'] is not None
    assert teacher.last_seen_at is not None  # durable copy written too


def test_db_write_is_throttled(teacher):
    touch(teacher)
    first = User.objects.get(pk=teacher.pk).last_seen_at
    teacher.last_seen_at = first
    touch(teacher)  # within DB_WRITE_EVERY -> cache only
    assert User.objects.get(pk=teacher.pk).last_seen_at == first


def test_goes_offline_after_window_but_keeps_last_seen(teacher):
    old = timezone.now() - timedelta(minutes=10)
    User.objects.filter(pk=teacher.pk).update(last_seen_at=old)
    teacher.refresh_from_db()
    p = presence_of(teacher)
    assert p['online'] is False and p['last_seen'] == old


def test_logout_marks_offline_immediately(api_client, make_user):
    make_user('out@example.com', approved=True)
    login = api_client.post('/api/auth/login/', {'login': 'out@example.com', 'password': 'testpass123'}, format='json')
    user = User.objects.get(email='out@example.com')
    assert presence_of(user)['online'] is True
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    api_client.post('/api/auth/logout/')
    user.refresh_from_db()
    p = presence_of(user)
    assert p['online'] is False and p['last_seen'] is not None


def test_student_heartbeat_allowed(jwt_as, student):
    assert jwt_as(student).post('/api/accounts/me/heartbeat/').status_code == 204
    assert presence_of(student)['online'] is True


def test_admin_user_list_shows_presence(as_user, jwt_as, admin, teacher):
    jwt_as(teacher).get('/api/lessons/')
    rows = {u['id']: u for u in as_user(admin).get('/api/accounts/users/').data['results']}
    assert rows[teacher.id]['online'] is True and rows[teacher.id]['last_seen']


def test_teacher_sees_students_presence(as_user, jwt_as, teacher, student, journal_class):
    jwt_as(student).post('/api/accounts/me/heartbeat/')
    data = as_user(teacher).get(f'/api/learning/classes/{journal_class.id}/students/').data
    row = next(a for a in data['accounts'] if a['id'] == student.id)
    assert row['online'] is True


def test_last_login_used_when_no_presence_yet(teacher):
    stamp = timezone.now() - timedelta(days=2)
    User.objects.filter(pk=teacher.pk).update(last_login=stamp)
    teacher.refresh_from_db()
    assert presence_of(teacher)['last_seen'] == stamp
