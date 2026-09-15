"""Login is case-insensitive on email — ModelBackend's default lookup is an
exact match, which used to reject a correct password whenever the email was
typed back in a different case than it was stored (or registered) in.
"""

import pytest
from django.core.cache import cache

from accounts.models import User

pytestmark = pytest.mark.django_db


def test_login_succeeds_regardless_of_email_case(api_client):
    User.objects.create_user(email="ivan@example.com", password="testpass123", name="Ivan", approved=True)

    resp = api_client.post("/api/auth/login/", {"email": "Ivan@Example.com", "password": "testpass123"}, format="json")
    assert resp.status_code == 200

    resp = api_client.post("/api/auth/login/", {"email": "IVAN@EXAMPLE.COM", "password": "testpass123"}, format="json")
    assert resp.status_code == 200


def test_login_still_rejects_wrong_password(api_client):
    User.objects.create_user(email="ivan2@example.com", password="testpass123", name="Ivan", approved=True)

    resp = api_client.post("/api/auth/login/", {"email": "Ivan2@Example.com", "password": "wrong"}, format="json")
    assert resp.status_code == 401


# ── Login/register throttling ──────────────────────────────────────────
# Neither endpoint had any rate limit before, so a password could be
# brute-forced (or registrations spammed) with no server-side slowdown at
# all. Cache is cleared before *and* after — AnonRateThrottle's counter
# lives in the process-wide cache keyed by client IP, and the test client
# always reports the same IP, so leftover state here would otherwise bleed
# into every other test in this file depending on run order.

def test_login_is_rate_limited_per_ip(api_client):
    cache.clear()
    try:
        User.objects.create_user(email="throttle@example.com", password="testpass123", name="T", approved=True)
        for _ in range(10):
            resp = api_client.post("/api/auth/login/", {"email": "throttle@example.com", "password": "wrong"}, format="json")
            assert resp.status_code == 401
        blocked = api_client.post("/api/auth/login/", {"email": "throttle@example.com", "password": "wrong"}, format="json")
        assert blocked.status_code == 429
    finally:
        cache.clear()


def test_register_is_rate_limited_per_ip(api_client):
    cache.clear()
    try:
        for i in range(5):
            resp = api_client.post(
                "/api/auth/register/",
                {"email": f"flood{i}@example.com", "name": "F", "password": "Kj8$mQ2vLp"},
                format="json",
            )
            assert resp.status_code == 201
        blocked = api_client.post(
            "/api/auth/register/",
            {"email": "flood-extra@example.com", "name": "F", "password": "Kj8$mQ2vLp"},
            format="json",
        )
        assert blocked.status_code == 429
    finally:
        cache.clear()


# ── Password policy (AUTH_PASSWORD_VALIDATORS) actually enforced ──────
# The validators were configured in settings but never invoked by either
# API path — registration/change-password only checked length >= 8, so
# e.g. "12345678" was a fully valid password. validate_password() must now
# run in both places.

def test_register_rejects_all_numeric_password(api_client):
    resp = api_client.post(
        "/api/auth/register/",
        {"email": "weakpass@example.com", "name": "Weak", "password": "12345678"},
        format="json",
    )
    assert resp.status_code == 400


def test_register_accepts_a_reasonably_strong_password(api_client):
    resp = api_client.post(
        "/api/auth/register/",
        {"email": "strongpass@example.com", "name": "Strong", "password": "Kj8$mQ2vLp"},
        format="json",
    )
    assert resp.status_code == 201


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


def test_register_rejects_case_variant_of_existing_email(api_client):
    User.objects.create_user(email="taken@example.com", password="testpass123", name="First")

    resp = api_client.post(
        "/api/auth/register/",
        {"email": "Taken@Example.com", "name": "Second", "password": "testpass123"},
        format="json",
    )
    assert resp.status_code == 400


# ── Refresh token is not single-use (no rotation) ──────────────────────
# Rotating refresh tokens are shared via one cookie across every tab/device
# on the same browser — two tabs refreshing close together could each
# redeem the same token, silently logging out whichever one lost the race.
# See SIMPLE_JWT's comment in config/settings/base.py.

def test_login_sets_refresh_cookie(api_client):
    User.objects.create_user(email="cookie@example.com", password="testpass123", name="C", approved=True)
    resp = api_client.post("/api/auth/login/", {"email": "cookie@example.com", "password": "testpass123"}, format="json")
    assert resp.status_code == 200
    assert "refresh_token" in resp.cookies


def test_same_refresh_token_can_be_used_more_than_once(api_client):
    User.objects.create_user(email="multi@example.com", password="testpass123", name="M", approved=True)
    login = api_client.post("/api/auth/login/", {"email": "multi@example.com", "password": "testpass123"}, format="json")
    refresh_cookie = login.cookies["refresh_token"].value

    api_client.cookies["refresh_token"] = refresh_cookie
    first = api_client.post("/api/auth/refresh/")
    assert first.status_code == 200

    # Simulating a second tab reusing the same still-cookied token —
    # must not have been blacklisted by the first refresh above.
    api_client.cookies["refresh_token"] = refresh_cookie
    second = api_client.post("/api/auth/refresh/")
    assert second.status_code == 200
