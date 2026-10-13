"""Role separation: students only ever reach the student portal, the
Kuzatuvchi (observer) role is read-only, generated passwords must be
changed first, and revoked sessions stay revoked. Uses real JWTs (jwt_as)
wherever the central gate in common/authentication.py is what's tested."""

import pytest

from accounts.models import User

pytestmark = pytest.mark.django_db

STAFF_ENDPOINTS = [
    "/api/lessons/",
    "/api/journal/classes/",
    "/api/timetable/",
    "/api/library/",
    "/api/announcements/",
    "/api/accounts/users/",
    "/api/learning/assignments/",
    "/api/learning/analytics/overview/",
    "/api/shop/products/",
    "/api/games/quizzes/",
]


@pytest.mark.parametrize("endpoint", STAFF_ENDPOINTS)
def test_student_cannot_reach_staff_endpoints(jwt_as, student, endpoint):
    resp = jwt_as(student).get(endpoint)
    assert resp.status_code == 403


@pytest.mark.parametrize("endpoint", ["/api/journal/classes/", "/api/lessons/", "/api/accounts/users/"])
def test_student_blocked_by_permissions_even_without_gate(as_user, student, endpoint):
    """Second layer: the per-view permission (IsApproved) refuses students
    too, even when the authentication-level gate is bypassed."""
    resp = as_user(student).get(endpoint)
    assert resp.status_code == 403


def test_student_reaches_own_portal(jwt_as, student):
    client = jwt_as(student)
    assert client.get("/api/accounts/me/").status_code == 200
    resp = client.get("/api/student/dashboard/")
    assert resp.status_code == 200
    assert "xp" in resp.data


def test_unapproved_student_cannot_use_portal(jwt_as, make_student, journal_class):
    pending = make_student(journal_class, name="Yangi Bola", approved=False)
    assert jwt_as(pending).get("/api/student/dashboard/").status_code == 403


def test_me_exposes_student_class(jwt_as, student):
    resp = jwt_as(student).get("/api/accounts/me/")
    assert resp.data["role"] == "student"
    assert resp.data["student"]["class_name"] == "8-A"
    assert resp.data["username"] == "aliyev.vali"


def test_student_cannot_rename_self(jwt_as, student):
    jwt_as(student).patch("/api/accounts/me/", {"name": "Admin"}, format="json")
    student.refresh_from_db()
    assert student.name == "Aliyev Vali"


# ── Kuzatuvchi (observer) ──────────────────────────────────────────────

def test_observer_can_read_oversight_data(jwt_as, observer):
    client = jwt_as(observer)
    assert client.get("/api/learning/analytics/overview/").status_code == 200
    assert client.get("/api/learning/analytics/top-teachers/").status_code == 200
    assert client.get("/api/lessons/").status_code == 200


@pytest.mark.parametrize("endpoint,payload", [
    ("/api/announcements/", {"text": "x"}),
    ("/api/journal/classes/", {"name": "9-B"}),
    ("/api/learning/reports/", {"date": "2026-10-01", "topic": "T", "summary": "x" * 30}),
    ("/api/learning/awards/", {"recipient": "x", "title": "t"}),
])
def test_observer_cannot_write(jwt_as, observer, endpoint, payload):
    resp = jwt_as(observer).post(endpoint, payload, format="json")
    assert resp.status_code == 403


def test_observer_can_change_own_password(jwt_as, observer):
    resp = jwt_as(observer).post(
        "/api/accounts/me/change-password/",
        {"current_password": "testpass123", "new_password": "Yangi-Parol-77"},
        format="json",
    )
    assert resp.status_code == 200


def test_only_dev_can_make_observer(as_user, admin, dev_superuser, teacher):
    assert as_user(admin).post(f"/api/accounts/users/{teacher.id}/set-kuzatuvchi/").status_code == 403
    assert as_user(dev_superuser).post(f"/api/accounts/users/{teacher.id}/set-kuzatuvchi/").status_code == 200
    teacher.refresh_from_db()
    assert teacher.role == User.Role.KUZATUVCHI


# ── Generated passwords must be changed first ──────────────────────────

def test_must_change_password_blocks_everything_else(jwt_as, make_student, journal_class):
    kid = make_student(journal_class, name="Karimova Nodira", must_change_password=True)
    client = jwt_as(kid)
    assert client.get("/api/student/dashboard/").status_code == 403
    assert client.get("/api/accounts/me/").status_code == 200
    resp = client.post(
        "/api/accounts/me/change-password/",
        {"current_password": "Talaba-2026x", "new_password": "Mening-Parolim-9"},
        format="json",
    )
    assert resp.status_code == 200
    # Fresh token from the response works, and the gate is lifted.
    from rest_framework.test import APIClient

    fresh = APIClient()
    fresh.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")
    assert fresh.get("/api/student/dashboard/").status_code == 200


# ── Session revocation ─────────────────────────────────────────────────

def test_password_change_revokes_old_tokens(api_client, make_user):
    import time

    from rest_framework.test import APIClient

    make_user("rev@example.com", approved=True)
    login = api_client.post("/api/auth/login/", {"login": "rev@example.com", "password": "testpass123"}, format="json")
    old = APIClient()
    old.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    assert old.get("/api/lessons/").status_code == 200

    time.sleep(1.1)  # iat has 1-second resolution
    resp = old.post("/api/accounts/me/change-password/",
                    {"current_password": "testpass123", "new_password": "Boshqa-Parol-55"}, format="json")
    assert resp.status_code == 200
    assert old.get("/api/lessons/").status_code == 401


def test_block_revokes_sessions(jwt_as, as_user, admin, teacher):
    import time

    client = jwt_as(teacher)
    assert client.get("/api/lessons/").status_code == 200
    time.sleep(1.1)
    as_user(admin).post(f"/api/accounts/users/{teacher.id}/block/")
    assert client.get("/api/lessons/").status_code == 401


def test_refresh_cookie_rejected_after_logout_all(api_client, make_user):
    import time

    make_user("ref@example.com", approved=True)
    login = api_client.post("/api/auth/login/", {"login": "ref@example.com", "password": "testpass123"}, format="json")
    assert login.status_code == 200
    assert api_client.post("/api/auth/refresh/").status_code == 200
    time.sleep(1.1)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    assert api_client.post("/api/accounts/me/logout-all/").status_code == 204
    api_client.credentials()
    api_client.cookies["refresh_token"] = login.cookies["refresh_token"].value
    assert api_client.post("/api/auth/refresh/").status_code == 401


# ── Staff list never floods with / leaks students ──────────────────────

def test_users_list_excludes_students(as_user, admin, teacher, student):
    resp = as_user(admin).get("/api/accounts/users/")
    ids = {u["id"] for u in resp.data["results"]}
    assert teacher.id in ids
    assert student.id not in ids
    resp = as_user(admin).get("/api/accounts/users/", {"role": "student"})
    assert {u["id"] for u in resp.data["results"]} == {student.id}


def test_teacher_cannot_list_students_via_users_api(as_user, teacher, student):
    resp = as_user(teacher).get("/api/accounts/users/", {"role": "student"})
    assert student.id not in {u["id"] for u in resp.data["results"]}


# ── Telegram linking ───────────────────────────────────────────────────

def test_cannot_set_telegram_chat_id_via_profile(jwt_as, teacher):
    jwt_as(teacher).patch("/api/accounts/me/", {"telegram_chat_id": 123456, "telegram_linked": True}, format="json")
    teacher.refresh_from_db()
    assert teacher.telegram_chat_id is None
    assert teacher.telegram_linked is False


def test_legacy_unlink_patch_still_works(jwt_as, teacher):
    teacher.telegram_linked, teacher.telegram_chat_id = True, 42
    teacher.save()
    jwt_as(teacher).patch("/api/accounts/me/", {"telegram_linked": False, "telegram_chat_id": None}, format="json")
    teacher.refresh_from_db()
    assert teacher.telegram_linked is False and teacher.telegram_chat_id is None


def test_bot_links_only_with_single_use_token(jwt_as, teacher):
    from asgiref.sync import async_to_sync

    from telegrambot.bot.handlers import _link_account

    resp = jwt_as(teacher).post("/api/accounts/me/telegram-link/")
    token = resp.data["url"].split("start=")[1]

    # Raw user id (the old scheme) no longer links anything.
    assert async_to_sync(_link_account)(teacher.id, 111, "attacker") is False
    assert async_to_sync(_link_account)(token, 222, "owner") is True
    assert async_to_sync(_link_account)(token, 333, "replay") is False
    teacher.refresh_from_db()
    assert teacher.telegram_chat_id == 222
