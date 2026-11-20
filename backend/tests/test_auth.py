"""Ko'ragoniy Edu signs in by login + password (or by phone) — never by
email (owner's decision, 2026-11-20). The login is case-insensitive:
ModelBackend's default lookup is an exact match, which used to reject a
correct password whenever it was typed back in another case.
"""

import pytest
from django.core.cache import cache

from accounts.models import User

pytestmark = pytest.mark.django_db


def test_login_succeeds_regardless_of_login_case(api_client):
    User.objects.create_user(email="ivan@example.com", username="ivan", password="testpass123", name="Ivan", approved=True)

    resp = api_client.post("/api/auth/login/", {"login": "Ivan", "password": "testpass123"}, format="json")
    assert resp.status_code == 200

    resp = api_client.post("/api/auth/login/", {"login": "IVAN", "password": "testpass123"}, format="json")
    assert resp.status_code == 200


def test_an_email_is_not_a_way_in(api_client):
    User.objects.create_user(email="ivan@example.com", username="ivan", password="testpass123", name="Ivan", approved=True)
    for field in ("login", "email"):  # older clients sent `email`
        resp = api_client.post("/api/auth/login/", {field: "ivan@example.com", "password": "testpass123"}, format="json")
        assert resp.status_code == 400 and resp.data.get("email_login_off") is True
    # the same answer for an email nobody has — nothing to learn from it
    ghost = api_client.post("/api/auth/login/", {"login": "ghost@example.com", "password": "x"}, format="json")
    assert ghost.status_code == 400 and ghost.data == resp.data
    assert api_client.post("/api/auth/password-reset/request/", {"login": "ivan@example.com"},
                           format="json").data.get("email_login_off") is True
    # and the email sign-up is gone
    assert api_client.post("/api/auth/register/", {"email": "n@example.com", "name": "N", "password": "Kj8$mQ2vLp"},
                           format="json").status_code == 404


def test_login_still_rejects_wrong_password(api_client):
    User.objects.create_user(email="ivan2@example.com", username="ivan2", password="testpass123", name="Ivan", approved=True)

    resp = api_client.post("/api/auth/login/", {"login": "Ivan2", "password": "wrong"}, format="json")
    assert resp.status_code == 401


# ── Login/register throttling ──────────────────────────────────────────
# Neither endpoint had any rate limit before, so a password could be
# brute-forced (or registrations spammed) with no server-side slowdown at
# all. Cache is cleared before *and* after — AnonRateThrottle's counter
# lives in the process-wide cache keyed by client IP, and the test client
# always reports the same IP, so leftover state here would otherwise bleed
# into every other test in this file depending on run order.

def test_login_is_rate_limited_per_ip(api_client, monkeypatch):
    # The real per-IP ceiling is deliberately loose (a whole class logs in
    # from one school NAT address); shrink it here so the test checks the
    # mechanism without depending on 120 password hashes finishing inside
    # one minute on a busy machine. Guesses go to unknown logins so the
    # per-account lockout doesn't kick in first.
    from common.throttling import LoginRateThrottle

    monkeypatch.setattr(LoginRateThrottle, 'THROTTLE_RATES', {**LoginRateThrottle.THROTTLE_RATES, 'login': '5/min'})
    cache.clear()
    try:
        for i in range(5):
            resp = api_client.post("/api/auth/login/", {"login": f"nobody{i}", "password": "wrong"}, format="json")
            assert resp.status_code == 401
        blocked = api_client.post("/api/auth/login/", {"login": "nobody", "password": "wrong"}, format="json")
        assert blocked.status_code == 429
    finally:
        cache.clear()


# ── Password policy (AUTH_PASSWORD_VALIDATORS) actually enforced ──────
# The validators were configured in settings but never invoked by either
# API path — registration/change-password only checked length >= 8, so
# e.g. "12345678" was a fully valid password. validate_password() must now
# run in both places.

def test_change_password_rejects_all_numeric_password(as_user, teacher):
    resp = as_user(teacher).post(
        "/api/accounts/me/change-password/",
        {"current_password": "testpass123", "new_password": "87654321"},
        format="json",
    )
    assert resp.status_code == 400


def test_change_password_accepts_a_reasonably_strong_password(as_user, teacher):
    resp = as_user(teacher).post(
        "/api/accounts/me/change-password/",
        {"current_password": "testpass123", "new_password": "Kj8$mQ2vLp"},
        format="json",
    )
    assert resp.status_code == 200


def test_new_account_email_is_fully_lowercased(make_user):
    user = make_user("Mixed.Case@Example.com")
    assert user.email == "mixed.case@example.com"


# ── Refresh token is not single-use (no rotation) ──────────────────────
# Rotating refresh tokens are shared via one cookie across every tab/device
# on the same browser — two tabs refreshing close together could each
# redeem the same token, silently logging out whichever one lost the race.
# See SIMPLE_JWT's comment in config/settings/base.py.

def test_login_sets_refresh_cookie(api_client):
    User.objects.create_user(email="cookie@example.com", username="cookie", password="testpass123", name="C", approved=True)
    resp = api_client.post("/api/auth/login/", {"login": "cookie", "password": "testpass123"}, format="json")
    assert resp.status_code == 200
    assert "refresh_token" in resp.cookies


def test_same_refresh_token_can_be_used_more_than_once(api_client):
    User.objects.create_user(email="multi@example.com", username="multi", password="testpass123", name="M", approved=True)
    login = api_client.post("/api/auth/login/", {"login": "multi", "password": "testpass123"}, format="json")
    refresh_cookie = login.cookies["refresh_token"].value

    api_client.cookies["refresh_token"] = refresh_cookie
    first = api_client.post("/api/auth/refresh/")
    assert first.status_code == 200

    # Simulating a second tab reusing the same still-cookied token —
    # must not have been blacklisted by the first refresh above.
    api_client.cookies["refresh_token"] = refresh_cookie
    second = api_client.post("/api/auth/refresh/")
    assert second.status_code == 200
