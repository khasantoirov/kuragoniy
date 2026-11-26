"""Admin accounts apart from the daily (teaching) ones — owner, 2026-11-26:
an admin account signs in only at admin.kuragoniy.uz, with its login and
password (never with a phone code), and its role stays Admin. Only the
developer makes them; the developer's rights then leave the daily account."""

import pytest

from accounts.models import User

ADMIN_HOST = 'admin.kuragoniy.uz'
PANEL = {'HTTP_HOST': ADMIN_HOST}

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def panel_host(settings):
    settings.ADMIN_HOSTS = [ADMIN_HOST]
    settings.ALLOWED_HOSTS = ['testserver', ADMIN_HOST]


def _create(client, **over):
    body = {'first_name': 'Hasan', 'last_name': 'Toirov', 'login': 'hasan.admin', **over}
    return client.post('/api/accounts/users/create-admin-account/', body, format='json', **PANEL)


def _login(client, login, password, host=None):
    extra = {'HTTP_HOST': host} if host else {}
    return client.post('/api/auth/login/', {'login': login, 'password': password}, format='json', **extra)


def test_only_the_developer_makes_one(as_user, admin, dev_superuser):
    assert _create(as_user(admin)).status_code == 403
    resp = _create(as_user(dev_superuser), dev=True)
    assert resp.status_code == 201, resp.data
    made = User.objects.get(username='hasan.admin')
    assert made.is_panel_account and made.is_dev_superuser and made.role == User.Role.ADMIN
    assert made.must_change_password and resp.data['password']
    # the login is the developer's pick, and unique
    assert _create(as_user(dev_superuser)).status_code == 400


def test_it_signs_in_at_the_panel_only_with_login_and_password(api_client, as_user, dev_superuser):
    password = _create(as_user(dev_superuser)).data['password']
    # kuragoniy.uz refuses it
    refused = _login(api_client, 'hasan.admin', password)
    assert refused.status_code == 403 and refused.data['code'] == 'panel_account'
    assert 'refresh_token' not in refused.cookies
    # the panel: the login and the password are enough
    resp = _login(api_client, 'hasan.admin', password, ADMIN_HOST)
    assert resp.status_code == 200 and resp.data['access'], resp.data
    assert 'totp_required' not in resp.data and 'totp_setup_required' not in resp.data
    assert resp.data['user']['is_panel_account']


def test_a_panel_session_does_not_open_kuragoniy_uz(api_client, as_user, dev_superuser):
    password = _create(as_user(dev_superuser)).data['password']
    login = _login(api_client, 'hasan.admin', password, ADMIN_HOST)
    api_client.cookies['refresh_token'] = login.cookies['refresh_token'].value
    resp = api_client.post('/api/auth/refresh/')  # kuragoniy.uz
    assert resp.status_code == 401 and resp.data['code'] == 'panel_account'


def test_its_role_stays_admin(as_user, dev_superuser):
    _create(as_user(dev_superuser))
    made = User.objects.get(username='hasan.admin')
    assert as_user(dev_superuser).post(f'/api/accounts/users/{made.pk}/demote/', **PANEL).status_code == 403
    assert as_user(dev_superuser).post(f'/api/accounts/users/{made.pk}/set-boshliq/', **PANEL).status_code == 403


def test_no_phone_code_for_an_admin_account(api_client, as_user, dev_superuser):
    _create(as_user(dev_superuser))
    User.objects.filter(username='hasan.admin').update(phone='+998901234567')
    resp = api_client.post('/api/auth/phone/start/', {'phone': '+998901234567'}, format='json', **PANEL)
    assert resp.status_code == 403 and resp.data['code'] == 'panel_no_phone'


def test_the_authenticator_is_gone(api_client, as_user, teacher):
    for url in ('/api/auth/2fa/verify/', '/api/auth/2fa/enroll/'):
        assert api_client.post(url, {}, format='json').status_code == 404
    api = as_user(teacher)
    for url in ('/api/accounts/me/2fa/setup/', '/api/accounts/me/2fa/confirm/', '/api/accounts/me/2fa/disable/'):
        assert api.post(url, {}, format='json').status_code == 404
    assert 'totp_enabled' not in api.get('/api/accounts/me/').data


def test_the_developer_rights_leave_the_daily_account(as_user, dev_superuser):
    api = as_user(dev_superuser)
    assert api.post(f'/api/accounts/users/{dev_superuser.pk}/drop-dev/', **PANEL).status_code == 403  # never one's own
    _create(api, dev=True)
    panel_dev = User.objects.get(username='hasan.admin')
    resp = as_user(panel_dev).post(f'/api/accounts/users/{dev_superuser.pk}/drop-dev/', **PANEL)
    assert resp.status_code == 200, resp.data
    dev_superuser.refresh_from_db()
    assert not dev_superuser.is_dev_superuser
    # the last developer's admin account keeps its rights
    other = User.objects.create_user(email=None, username='other.dev', password='x', name='Boshqa Dasturchi')
    User.objects.filter(pk=other.pk).update(is_dev_superuser=True, role=User.Role.TEACHER, approved=True)
    resp = as_user(User.objects.get(pk=other.pk)).post(f'/api/accounts/users/{panel_dev.pk}/drop-dev/', **PANEL)
    assert resp.status_code == 400
