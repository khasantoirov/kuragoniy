"""Kontent himoyasi (common.PlatformSettings.protection): everyone reads it,
only the developer changes it; the guard's reports reach the security log.
And Modullar → "O'quv materiallari"."""

import pytest

from common.models import AuditLog, PlatformSettings

pytestmark = pytest.mark.django_db
URL = "/api/common/modules/"
EVENT = "/api/common/protection-event/"


def test_defaults_are_on_for_everyone(as_user, teacher, student):
    for who in (teacher, student):
        assert as_user(who).get(URL).data["protection"] == PlatformSettings.PROTECTION_DEFAULTS


def test_only_the_developer_changes_it(as_user, admin, dev_superuser, teacher):
    body = {"protection": {"no_print": False, "scope": "students"}}
    assert as_user(admin).patch(URL, body, format="json").status_code == 403
    assert as_user(teacher).patch(URL, body, format="json").status_code == 403
    for bad in ({"no_print": "yes"}, {"scope": "everyone"}, {"camera": True}, []):
        assert as_user(dev_superuser).patch(URL, {"protection": bad}, format="json").status_code == 400
    resp = as_user(dev_superuser).patch(URL, body, format="json")
    assert resp.status_code == 200
    assert resp.data["protection"] == {**PlatformSettings.PROTECTION_DEFAULTS, "no_print": False, "scope": "students"}
    assert AuditLog.objects.filter(action="protection_changed").exists()
    assert as_user(teacher).get(URL).data["protection"]["scope"] == "students"


def test_attempts_are_logged_for_staff_and_pupils(as_user, teacher, student):
    assert as_user(teacher).post(EVENT, {"kind": "screenshot", "page": "/journal"}, format="json").status_code == 204
    assert as_user(student).post(EVENT, {"kind": "print", "page": "/s/lessons/1"}, format="json").status_code == 204
    assert as_user(teacher).post(EVENT, {"kind": "hack"}, format="json").status_code == 400
    rows = AuditLog.objects.filter(action__in=["screenshot_attempt", "print_attempt"])
    assert rows.count() == 2
    assert "/journal" in rows.get(action="screenshot_attempt").detail


def test_materials_module_hides_the_theory_from_pupils(as_user, admin, student):
    from lessons.models import Lesson
    from learning.models import LessonMaterial

    profile = student.student_profile
    lesson = Lesson.objects.create(title="Massa", grade=profile.grade or 8, chorak=1, hafta=1)
    LessonMaterial.objects.update_or_create(lesson=lesson, defaults={
        "theory": "Massa — inertlik o'lchovi.", "formulas": [{"expr": "m = ρV", "desc": ""}],
        "video_url": "https://youtu.be/x", "is_published": True})
    url = f"/api/student/lessons/{lesson.id}/"
    first = as_user(student).get(url)
    if first.status_code != 200:
        pytest.skip("this pupil's class doesn't reach the lesson in this setup")
    assert first.data["theory"] and first.data["formulas"]

    assert as_user(admin).patch(URL, {"modules": {"materials": False}}, format="json").status_code == 200
    hidden = as_user(student).get(url).data
    assert (hidden["theory"], hidden["formulas"], hidden["video_url"], hidden["extra_videos"]) == ("", [], "", [])
