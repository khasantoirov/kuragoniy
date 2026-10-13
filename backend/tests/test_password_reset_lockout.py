"""Self-service password reset over Telegram, and per-account lockout."""

from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone

from accounts.models import PasswordResetCode

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_throttles():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def sent(monkeypatch):
    """Captures Telegram DMs instead of sending them."""
    messages = []
    monkeypatch.setattr("accounts.views.notify_user", lambda user, text: messages.append((user.pk, text)))
    return messages


def _code_from(messages):
    import re

    return re.search(r"\b(\d{6})\b", messages[-1][1]).group(1)


@pytest.fixture
def linked_teacher(teacher):
    teacher.telegram_linked, teacher.telegram_chat_id = True, 777
    teacher.save()
    return teacher


def test_reset_via_telegram_code(api_client, linked_teacher, sent):
    resp = api_client.post("/api/auth/password-reset/request/", {"login": "teacher@example.com"}, format="json")
    assert resp.status_code == 200
    code = _code_from(sent)
    assert not PasswordResetCode.objects.filter(code_hash__contains=code).exists()  # only a hash is stored

    resp = api_client.post("/api/auth/password-reset/confirm/",
                           {"login": "teacher@example.com", "code": code, "new_password": "Yangi-Parol-2026"}, format="json")
    assert resp.status_code == 200
    login = api_client.post("/api/auth/login/", {"login": "teacher@example.com", "password": "Yangi-Parol-2026"}, format="json")
    assert login.status_code == 200
    # Code is single-use.
    again = api_client.post("/api/auth/password-reset/confirm/",
                            {"login": "teacher@example.com", "code": code, "new_password": "Boshqa-Parol-2026"}, format="json")
    assert again.status_code == 400


def test_reset_response_identical_for_unknown_and_unlinked(api_client, teacher, sent):
    unknown = api_client.post("/api/auth/password-reset/request/", {"login": "ghost@example.com"}, format="json")
    unlinked = api_client.post("/api/auth/password-reset/request/", {"login": "teacher@example.com"}, format="json")
    assert unknown.status_code == unlinked.status_code == 200
    assert unknown.data == unlinked.data
    assert sent == []
    assert not PasswordResetCode.objects.exists()


def test_wrong_codes_burn_the_code(api_client, linked_teacher, sent):
    api_client.post("/api/auth/password-reset/request/", {"login": "teacher@example.com"}, format="json")
    code = _code_from(sent)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(PasswordResetCode.MAX_ATTEMPTS):
        resp = api_client.post("/api/auth/password-reset/confirm/",
                               {"login": "teacher@example.com", "code": wrong, "new_password": "Yangi-Parol-2026"}, format="json")
        assert resp.status_code == 400
    resp = api_client.post("/api/auth/password-reset/confirm/",
                           {"login": "teacher@example.com", "code": code, "new_password": "Yangi-Parol-2026"}, format="json")
    assert resp.status_code == 400


def test_expired_code_rejected(api_client, linked_teacher, sent):
    api_client.post("/api/auth/password-reset/request/", {"login": "teacher@example.com"}, format="json")
    code = _code_from(sent)
    PasswordResetCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    resp = api_client.post("/api/auth/password-reset/confirm/",
                           {"login": "teacher@example.com", "code": code, "new_password": "Yangi-Parol-2026"}, format="json")
    assert resp.status_code == 400


def test_reset_request_cooldown(api_client, linked_teacher, sent):
    api_client.post("/api/auth/password-reset/request/", {"login": "teacher@example.com"}, format="json")
    api_client.post("/api/auth/password-reset/request/", {"login": "teacher@example.com"}, format="json")
    assert PasswordResetCode.objects.count() == 1
    assert len(sent) == 1


def test_student_reset_by_username(api_client, student, sent):
    student.telegram_linked, student.telegram_chat_id = True, 555
    student.save()
    api_client.post("/api/auth/password-reset/request/", {"login": "aliyev.vali"}, format="json")
    assert len(sent) == 1


# ── Lockout ────────────────────────────────────────────────────────────

def test_account_locks_after_repeated_failures(api_client, teacher, settings, sent):
    for _ in range(settings.LOGIN_LOCKOUT_THRESHOLD - 1):
        resp = api_client.post("/api/auth/login/", {"login": "teacher@example.com", "password": "wrong"}, format="json")
        assert resp.status_code == 401
    resp = api_client.post("/api/auth/login/", {"login": "teacher@example.com", "password": "wrong"}, format="json")
    assert resp.status_code == 429
    # Even the right password is refused while locked.
    resp = api_client.post("/api/auth/login/", {"login": "teacher@example.com", "password": "testpass123"}, format="json")
    assert resp.status_code == 429

    teacher.refresh_from_db()
    teacher.locked_until = timezone.now() - timedelta(seconds=1)
    teacher.save()
    resp = api_client.post("/api/auth/login/", {"login": "teacher@example.com", "password": "testpass123"}, format="json")
    assert resp.status_code == 200


def test_successful_login_resets_failure_counter(api_client, teacher):
    api_client.post("/api/auth/login/", {"login": "teacher@example.com", "password": "wrong"}, format="json")
    api_client.post("/api/auth/login/", {"login": "teacher@example.com", "password": "testpass123"}, format="json")
    teacher.refresh_from_db()
    assert teacher.failed_login_count == 0


def test_student_logs_in_with_username(api_client, student):
    resp = api_client.post("/api/auth/login/", {"login": "Aliyev.Vali", "password": "Talaba-2026x"}, format="json")
    assert resp.status_code == 200
    assert resp.data["user"]["role"] == "student"


def test_legacy_email_field_still_accepted(api_client, teacher):
    resp = api_client.post("/api/auth/login/", {"email": "teacher@example.com", "password": "testpass123"}, format="json")
    assert resp.status_code == 200


def test_login_events_are_audited(api_client, teacher):
    from common.models import AuditLog

    api_client.post("/api/auth/login/", {"login": "teacher@example.com", "password": "wrong"}, format="json")
    api_client.post("/api/auth/login/", {"login": "teacher@example.com", "password": "testpass123"}, format="json")
    actions = list(AuditLog.objects.filter(actor=teacher).values_list("action", flat=True))
    assert "login_failed" in actions and "login_ok" in actions


def test_audit_log_admin_only(as_user, admin, teacher):
    assert as_user(admin).get("/api/accounts/audit-log/").status_code == 200
    assert as_user(teacher).get("/api/accounts/audit-log/").status_code == 403
