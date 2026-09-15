"""
Role/approval permission matrix — replicates the access-control decisions
that used to live in firestore.rules. Each test asserts one branch of
that matrix so a future refactor can't silently loosen it.
"""

import pytest

pytestmark = pytest.mark.django_db


# ── IsApproved gate: unapproved teachers can't read anything app-side ──

@pytest.mark.parametrize("endpoint", ["/api/lessons/", "/api/library/", "/api/announcements/"])
def test_unapproved_teacher_cannot_read(as_user, unapproved_teacher, endpoint):
    resp = as_user(unapproved_teacher).get(endpoint)
    assert resp.status_code == 403


@pytest.mark.parametrize("endpoint", ["/api/lessons/", "/api/library/", "/api/announcements/"])
def test_approved_teacher_can_read(as_user, teacher, endpoint):
    resp = as_user(teacher).get(endpoint)
    assert resp.status_code == 200


def test_dev_superuser_is_approved_even_without_approved_flag(as_user, dev_superuser):
    """Mirrors firestore.rules isApproved() = isDev() || approved || role=='admin'."""
    resp = as_user(dev_superuser).get("/api/lessons/")
    assert resp.status_code == 200


def test_unapproved_teacher_can_see_own_pending_status(as_user, unapproved_teacher):
    """/me/ must stay reachable so the frontend can show the pending screen."""
    resp = as_user(unapproved_teacher).get("/api/accounts/me/")
    assert resp.status_code == 200
    assert resp.data["approved"] is False


# ── Write access: admin/dev only for lessons, library, announcements ──

LESSON_PAYLOAD = {"title": "T", "grade": "7-8", "chorak": 1, "hafta": 1}


def test_teacher_cannot_create_lesson(as_user, teacher):
    resp = as_user(teacher).post("/api/lessons/", LESSON_PAYLOAD, format="json")
    assert resp.status_code == 403


def test_admin_can_create_lesson(as_user, admin):
    resp = as_user(admin).post("/api/lessons/", LESSON_PAYLOAD, format="json")
    assert resp.status_code == 201


# ── Quarter locks: all 4 quarters are lockable, chorak 1 defaults open ──

def test_quarter_locks_default_chorak1_open_rest_closed(as_user, admin):
    resp = as_user(admin).get("/api/lessons/quarter-locks/")
    assert resp.status_code == 200
    assert resp.data == {"1": True, "2": False, "3": False, "4": False}


def test_teacher_cannot_see_locked_chorak1(as_user, admin, teacher):
    as_user(admin).post("/api/lessons/", {**LESSON_PAYLOAD, "chorak": 1}, format="json")
    resp = as_user(admin).post("/api/lessons/quarter-locks/", {"chorak": 1, "is_open": False}, format="json")
    assert resp.status_code == 200

    resp = as_user(teacher).get("/api/lessons/", {"grade": "7-8"})
    assert resp.status_code == 200
    assert all(row["chorak"] != 1 for row in resp.data["results"])


def test_admin_still_sees_locked_chorak1(as_user, admin):
    as_user(admin).post("/api/lessons/", {**LESSON_PAYLOAD, "chorak": 1}, format="json")
    as_user(admin).post("/api/lessons/quarter-locks/", {"chorak": 1, "is_open": False}, format="json")

    resp = as_user(admin).get("/api/lessons/", {"grade": "7-8"})
    assert resp.status_code == 200
    assert any(row["chorak"] == 1 for row in resp.data["results"])


def test_teacher_cannot_create_library_item(as_user, teacher):
    resp = as_user(teacher).post(
        "/api/library/", {"title": "T", "url": "https://x.com", "kind": "havola"}, format="json"
    )
    assert resp.status_code == 403


def test_teacher_cannot_create_announcement(as_user, teacher):
    resp = as_user(teacher).post("/api/announcements/", {"text": "hi"}, format="json")
    assert resp.status_code == 403


def test_admin_can_create_announcement(as_user, admin):
    resp = as_user(admin).post("/api/announcements/", {"text": "hi"}, format="json")
    assert resp.status_code == 201


def test_teacher_cannot_delete_announcement(as_user, admin, teacher):
    ann_id = as_user(admin).post("/api/announcements/", {"text": "hi"}, format="json").data["id"]
    resp = as_user(teacher).delete(f"/api/announcements/{ann_id}/")
    assert resp.status_code == 403
    assert as_user(admin).get("/api/announcements/").data["count"] == 1


def test_admin_can_delete_announcement(as_user, admin):
    ann_id = as_user(admin).post("/api/announcements/", {"text": "hi"}, format="json").data["id"]
    resp = as_user(admin).delete(f"/api/announcements/{ann_id}/")
    assert resp.status_code == 204
    assert as_user(admin).get("/api/announcements/").data["count"] == 0


# ── Journal/timetable: strictly owner-scoped, admin read-only cross-teacher ──

def test_teacher_cannot_see_another_teachers_class(as_user, teacher, make_user):
    other = make_user("other@example.com", approved=True)
    as_user(other).post("/api/journal/classes/", {"school": "S", "name": "8-A"}, format="json")

    resp = as_user(teacher).get("/api/journal/classes/")
    assert resp.status_code == 200
    assert resp.data["count"] == 0


def test_admin_can_read_but_the_endpoint_requires_teacher_param(as_user, teacher, admin):
    as_user(teacher).post("/api/journal/classes/", {"school": "S", "name": "8-A"}, format="json")

    # Without ?teacher=, admin's own (empty) roster is returned, not everyone's —
    # scoping is explicit, not an accidental global read.
    resp = as_user(admin).get("/api/journal/classes/")
    assert resp.status_code == 200
    assert resp.data["count"] == 0

    resp = as_user(admin).get(f"/api/journal/classes/?teacher={teacher.id}")
    assert resp.status_code == 200
    assert resp.data["count"] == 1


def test_teacher_cannot_write_timetable_for_another_teacher(as_user, teacher, make_user):
    other = make_user("other2@example.com", approved=True)
    resp = as_user(teacher).post(
        "/api/timetable/slots/bulk/",
        [{"day_index": 0, "period_index": 1, "maktab": "", "xona": "1", "sinf": "8-A", "span": 1, "band": False}],
        format="json",
    )
    assert resp.status_code == 200

    # The other teacher's bulk-save must not be able to touch the first
    # teacher's slots — each bulk call is scoped to request.user only.
    as_user(other).post("/api/timetable/slots/bulk/", [], format="json")
    resp = as_user(teacher).get("/api/timetable/slots/")
    assert resp.data["count"] == 1


def test_teacher_cannot_write_another_teachers_timetable_via_teacher_param(as_user, teacher, make_user):
    other = make_user("other3@example.com", approved=True)
    as_user(other).post(
        "/api/timetable/slots/bulk/",
        [{"day_index": 0, "period_index": 1, "maktab": "", "xona": "1", "sinf": "8-A", "span": 1, "band": False}],
        format="json",
    )
    resp = as_user(teacher).post(
        f"/api/timetable/slots/bulk/?teacher={other.id}",
        [],
        format="json",
    )
    assert resp.status_code == 403
    resp = as_user(other).get("/api/timetable/slots/")
    assert resp.data["count"] == 1


def test_admin_can_write_another_teachers_timetable(as_user, admin, teacher):
    resp = as_user(admin).post(
        f"/api/timetable/slots/bulk/?teacher={teacher.id}",
        [{"day_index": 2, "period_index": 3, "maktab": "M", "xona": "5", "sinf": "9-B", "span": 1, "band": False}],
        format="json",
    )
    assert resp.status_code == 200
    resp = as_user(teacher).get("/api/timetable/slots/")
    assert resp.data["count"] == 1
    assert resp.data["results"][0]["maktab"] == "M"


def test_boshliq_can_write_another_teachers_timetable(as_user, make_user, teacher):
    from accounts.models import User

    boshliq = make_user("boshliq3@example.com", role=User.Role.BOSHLIQ, approved=True)
    resp = as_user(boshliq).post(
        f"/api/timetable/slots/bulk/?teacher={teacher.id}",
        [{"day_index": 1, "period_index": 2, "maktab": "B", "xona": "1", "sinf": "7-A", "span": 1, "band": False}],
        format="json",
    )
    assert resp.status_code == 200


def test_any_approved_teacher_can_read_another_teachers_timetable(as_user, teacher, make_user):
    """"Barcha o'qituvchilar" is a shared read view — any approved user may
    look at someone else's week (for room/time coordination), not just
    admins. Writing to it is still admin-only (see the tests above)."""
    other = make_user("other4@example.com", approved=True)
    as_user(other).post(
        "/api/timetable/slots/bulk/",
        [{"day_index": 0, "period_index": 1, "maktab": "M", "xona": "1", "sinf": "8-A", "span": 1, "band": False}],
        format="json",
    )

    resp = as_user(teacher).get(f"/api/timetable/slots/?teacher={other.id}")
    assert resp.status_code == 200
    assert resp.data["count"] == 1
    assert resp.data["results"][0]["maktab"] == "M"


def test_teacher_cannot_patch_or_delete_another_teachers_slot_via_teacher_param(as_user, teacher, make_user):
    """Loosening read access for ?teacher=<id> must not accidentally open
    up the standard retrieve/update/destroy detail routes too."""
    other = make_user("other5@example.com", approved=True)
    create_resp = as_user(other).post(
        "/api/timetable/slots/bulk/",
        [{"day_index": 0, "period_index": 1, "maktab": "M", "xona": "1", "sinf": "8-A", "span": 1, "band": False}],
        format="json",
    )
    slot_id = create_resp.data[0]["id"]

    resp = as_user(teacher).patch(
        f"/api/timetable/slots/{slot_id}/?teacher={other.id}",
        {"maktab": "Hacked"},
        format="json",
    )
    assert resp.status_code == 403

    resp = as_user(teacher).delete(f"/api/timetable/slots/{slot_id}/?teacher={other.id}")
    assert resp.status_code == 403

    resp = as_user(other).get("/api/timetable/slots/")
    assert resp.data["results"][0]["maktab"] == "M"


# ── Accounts admin management: dev-only branches ──

def test_plain_admin_cannot_promote(as_user, admin, unapproved_teacher):
    resp = as_user(admin).post(f"/api/accounts/users/{unapproved_teacher.id}/promote/")
    assert resp.status_code == 403


def test_dev_superuser_can_promote(as_user, dev_superuser, unapproved_teacher):
    resp = as_user(dev_superuser).post(f"/api/accounts/users/{unapproved_teacher.id}/promote/")
    assert resp.status_code == 200
    unapproved_teacher.refresh_from_db()
    assert unapproved_teacher.role == "admin"
    assert unapproved_teacher.approved is True


def test_plain_admin_cannot_demote(as_user, admin, make_user):
    from accounts.models import User

    other_admin = make_user("other-admin2@example.com", role=User.Role.ADMIN, approved=True)
    resp = as_user(admin).post(f"/api/accounts/users/{other_admin.id}/demote/")
    assert resp.status_code == 403


def test_dev_superuser_can_demote(as_user, dev_superuser, make_user):
    from accounts.models import User

    other_admin = make_user("other-admin3@example.com", role=User.Role.ADMIN, approved=True)
    resp = as_user(dev_superuser).post(f"/api/accounts/users/{other_admin.id}/demote/")
    assert resp.status_code == 200
    other_admin.refresh_from_db()
    assert other_admin.role == "teacher"


# ── Boshliq: a non-teaching head with admin-level oversight ──────────

def test_plain_admin_cannot_set_boshliq(as_user, admin, unapproved_teacher):
    resp = as_user(admin).post(f"/api/accounts/users/{unapproved_teacher.id}/set-boshliq/")
    assert resp.status_code == 403


def test_dev_superuser_can_set_boshliq(as_user, dev_superuser, unapproved_teacher):
    resp = as_user(dev_superuser).post(f"/api/accounts/users/{unapproved_teacher.id}/set-boshliq/")
    assert resp.status_code == 200
    unapproved_teacher.refresh_from_db()
    assert unapproved_teacher.role == "boshliq"
    assert unapproved_teacher.approved is True


def test_boshliq_has_admin_level_access(as_user, make_user):
    from accounts.models import User

    boshliq = make_user("boshliq@example.com", role=User.Role.BOSHLIQ, approved=False)
    # is_approved_effective and is_admin both grant this without the approved flag
    resp = as_user(boshliq).get("/api/lessons/")
    assert resp.status_code == 200
    resp = as_user(boshliq).post("/api/lessons/", LESSON_PAYLOAD, format="json")
    assert resp.status_code == 201


def test_plain_admin_cannot_touch_boshliq(as_user, admin, make_user):
    from accounts.models import User

    boshliq = make_user("boshliq2@example.com", role=User.Role.BOSHLIQ, approved=True)
    resp = as_user(admin).post(f"/api/accounts/users/{boshliq.id}/block/")
    assert resp.status_code == 403


def test_plain_admin_cannot_touch_another_admin(as_user, admin, make_user):
    from accounts.models import User

    other_admin = make_user("other-admin@example.com", role=User.Role.ADMIN, approved=True)
    resp = as_user(admin).post(f"/api/accounts/users/{other_admin.id}/block/")
    assert resp.status_code == 403


def test_admin_can_approve_pending_teacher(as_user, admin, unapproved_teacher):
    resp = as_user(admin).post(f"/api/accounts/users/{unapproved_teacher.id}/approve/")
    assert resp.status_code == 200
    unapproved_teacher.refresh_from_db()
    assert unapproved_teacher.approved is True


def test_register_always_creates_unapproved_teacher_regardless_of_payload(api_client):
    """A malicious client can't self-elevate by sending role/approved in
    the registration payload — the serializer ignores both."""
    resp = api_client.post(
        "/api/auth/register/",
        {"email": "new@example.com", "name": "New", "password": "testpass123", "role": "admin", "approved": True},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["role"] == "teacher"
    assert resp.data["approved"] is False
