"""TOTP-based two-factor auth (RFC 6238) — optional per-user. A secret
alone never gates login (TwoFactorSetupView writes it with totp_enabled
still False); only TwoFactorConfirmView proving a real code flips that,
and only then does LoginView start withholding tokens for a bare password.
"""

import pyotp
import pytest
from django.core.cache import cache

from accounts.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    # LoginRateThrottle is shared with plain login — avoid cross-test
    # pollution the same way test_auth.py's throttle tests do.
    cache.clear()
    yield
    cache.clear()


def _enable_2fa(client) -> str:
    """Drives the real setup -> confirm flow and returns the now-active
    secret, so tests exercise the same path a user would."""
    setup = client.post('/api/accounts/me/2fa/setup/')
    assert setup.status_code == 200
    secret = setup.data['secret']
    assert setup.data['otpauth_url'].startswith('otpauth://totp/')

    code = pyotp.TOTP(secret).now()
    confirm = client.post('/api/accounts/me/2fa/confirm/', {'code': code}, format='json')
    assert confirm.status_code == 200
    assert confirm.data['totp_enabled'] is True
    return secret


def test_setup_does_not_enable_2fa_by_itself(as_user, teacher):
    client = as_user(teacher)
    resp = client.post('/api/accounts/me/2fa/setup/')
    assert resp.status_code == 200
    teacher.refresh_from_db()
    assert teacher.totp_secret  # pending secret stored
    assert teacher.totp_enabled is False  # but not yet active


def test_confirm_rejects_wrong_code(as_user, teacher):
    client = as_user(teacher)
    client.post('/api/accounts/me/2fa/setup/')
    resp = client.post('/api/accounts/me/2fa/confirm/', {'code': '000000'}, format='json')
    assert resp.status_code == 400
    teacher.refresh_from_db()
    assert teacher.totp_enabled is False


def test_confirm_with_correct_code_enables_2fa(as_user, teacher):
    _enable_2fa(as_user(teacher))
    teacher.refresh_from_db()
    assert teacher.totp_enabled is True


def test_login_with_2fa_enabled_withholds_tokens_and_returns_challenge(api_client, as_user, teacher):
    _enable_2fa(as_user(teacher))

    resp = api_client.post('/api/auth/login/', {'email': teacher.email, 'password': 'testpass123'}, format='json')
    assert resp.status_code == 200
    assert resp.data['totp_required'] is True
    assert 'access' not in resp.data
    assert 'challenge' in resp.data


def test_full_login_flow_with_valid_totp_code(api_client, as_user, teacher):
    secret = _enable_2fa(as_user(teacher))

    login = api_client.post('/api/auth/login/', {'email': teacher.email, 'password': 'testpass123'}, format='json')
    challenge = login.data['challenge']

    verify = api_client.post(
        '/api/auth/2fa/verify/',
        {'challenge': challenge, 'code': pyotp.TOTP(secret).now()},
        format='json',
    )
    assert verify.status_code == 200
    assert 'access' in verify.data
    assert 'refresh_token' in verify.cookies


def test_verify_rejects_wrong_code(api_client, as_user, teacher):
    _enable_2fa(as_user(teacher))
    login = api_client.post('/api/auth/login/', {'email': teacher.email, 'password': 'testpass123'}, format='json')
    resp = api_client.post(
        '/api/auth/2fa/verify/',
        {'challenge': login.data['challenge'], 'code': '000000'},
        format='json',
    )
    assert resp.status_code == 400


def test_verify_rejects_garbage_challenge(api_client):
    resp = api_client.post('/api/auth/2fa/verify/', {'challenge': 'not-a-real-token', 'code': '123456'}, format='json')
    assert resp.status_code == 401


def test_login_without_2fa_enabled_is_unaffected(api_client, teacher):
    resp = api_client.post('/api/auth/login/', {'email': teacher.email, 'password': 'testpass123'}, format='json')
    assert resp.status_code == 200
    assert 'access' in resp.data
    assert 'totp_required' not in resp.data


def test_self_disable_requires_correct_password(as_user, teacher):
    client = as_user(teacher)
    _enable_2fa(client)

    wrong = client.post('/api/accounts/me/2fa/disable/', {'password': 'wrong'}, format='json')
    assert wrong.status_code == 400
    teacher.refresh_from_db()
    assert teacher.totp_enabled is True

    right = client.post('/api/accounts/me/2fa/disable/', {'password': 'testpass123'}, format='json')
    assert right.status_code == 200
    teacher.refresh_from_db()
    assert teacher.totp_enabled is False
    assert teacher.totp_secret == ''


def test_admin_can_disable_2fa_for_a_teacher_who_lost_their_device(as_user, admin, teacher):
    _enable_2fa(as_user(teacher))

    resp = as_user(admin).post(f'/api/accounts/users/{teacher.id}/disable-2fa/')
    assert resp.status_code == 200
    teacher.refresh_from_db()
    assert teacher.totp_enabled is False


def test_teacher_cannot_disable_another_users_2fa(as_user, teacher, make_user):
    other = make_user('other-2fa@example.com', approved=True)
    _enable_2fa(as_user(other))

    resp = as_user(teacher).post(f'/api/accounts/users/{other.id}/disable-2fa/')
    assert resp.status_code == 403
    other.refresh_from_db()
    assert other.totp_enabled is True


def test_admin_cannot_disable_2fa_for_another_admin(as_user, admin, make_user):
    other_admin = make_user('other-admin-2fa@example.com', role=User.Role.ADMIN, approved=True)
    _enable_2fa(as_user(other_admin))

    resp = as_user(admin).post(f'/api/accounts/users/{other_admin.id}/disable-2fa/')
    assert resp.status_code == 403
