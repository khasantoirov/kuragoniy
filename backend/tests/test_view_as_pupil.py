"""Ko'rish rejimi → O'quvchi (common/permissions.py view_as_pupil): an
administrator sees the student portal as one pupil does — their class,
their data — and can change nothing in their name."""

import pytest

from common.models import AuditLog

pytestmark = pytest.mark.django_db

HEADER = "HTTP_X_VIEW_AS_STUDENT"


@pytest.fixture
def pupil(make_student, journal_class):
    return make_student(journal_class, "Aliyev Vali")


def test_an_administrator_reads_the_portal_as_the_pupil(as_user, admin, pupil):
    api = as_user(admin)
    assert api.get("/api/student/dashboard/").status_code == 403  # not a pupil, no header
    resp = api.get("/api/student/dashboard/", **{HEADER: str(pupil.id)})
    assert resp.status_code == 200 and "xp" in resp.data and "pending_homework" in resp.data
    assert api.get("/api/student/results/", **{HEADER: str(pupil.id)}).status_code == 200


def test_nothing_is_written_in_the_pupils_name(as_user, admin, pupil):
    resp = as_user(admin).post("/api/student/lessons/1/", {"theory_done": True}, format="json", **{HEADER: str(pupil.id)})
    assert resp.status_code == 403 and "faqat ko'rish" in resp.data["detail"]


def test_only_administrators_and_only_for_a_pupil(as_user, admin, teacher, pupil):
    assert as_user(teacher).get("/api/student/dashboard/", **{HEADER: str(pupil.id)}).status_code == 403
    # a staff account is not a pupil to look through
    assert as_user(admin).get("/api/student/dashboard/", **{HEADER: str(teacher.id)}).status_code == 403


def test_starting_the_view_is_logged(as_user, admin, teacher, pupil):
    resp = as_user(admin).post(f"/api/learning/students/{pupil.id}/view-as/")
    assert resp.status_code == 200 and resp.data["name"] == "Aliyev Vali"
    assert AuditLog.objects.filter(action="student_view_as", actor=admin).exists()
    assert as_user(teacher).post(f"/api/learning/students/{pupil.id}/view-as/").status_code == 403
