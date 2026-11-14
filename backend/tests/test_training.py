"""Malaka oshirish: courses → modules → lessons → test, the next module
opening only after the one before is passed, the certificate (once, public
check by code), assigning to a school's teachers, deadline reminders."""

from datetime import timedelta

import pytest
from django.utils import timezone

from accounts.models import User
from journal.models import JournalClass
from notifications.models import Notification
from schools.models import School, SchoolManager, SchoolTeacher
from training import services
from training.models import Certificate, Course, Enrollment, Module

pytestmark = pytest.mark.django_db

Q_TEST = {"kind": "test", "text": "2+2?", "options": ["3", "4", "5"], "correct": [1], "points": 1}
Q_NUM = {"kind": "number", "text": "g = ? (m/s²)", "answer_value": 9.8, "tolerance_pct": 2, "points": 1}


@pytest.fixture
def course(as_user, admin):
    c = as_user(admin)
    resp = c.post("/api/training/courses/", {"title": "STEM metodikasi", "hours": 36, "pass_percent": 70},
                  format="json")
    assert resp.status_code == 201, resp.data
    cid = resp.data["id"]
    m1 = c.post(f"/api/training/courses/{cid}/modules/", {
        "title": "1. Kirish",
        "lessons": [{"title": "Nima uchun STEM", "body": "Matn", "video_url": "https://youtu.be/x"},
                    {"title": "Darsni rejalash", "body": "Matn 2"}],
        "questions": [Q_TEST, Q_NUM],
    }, format="json")
    assert m1.status_code == 201, m1.data
    m2 = c.post(f"/api/training/courses/{cid}/modules/", {
        "title": "2. Amaliyot", "lessons": [{"title": "Tajriba", "body": "..."}], "questions": [Q_TEST],
    }, format="json")
    assert m2.status_code == 201
    assert c.patch(f"/api/training/courses/{cid}/", {"is_published": True}, format="json").status_code == 200
    return Course.objects.get(pk=cid)


def _answers(c, attempt, right=True):
    """Answers every question of an attempt payload (right or wrong)."""
    out = {}
    for q in attempt["questions"]:
        if q["kind"] == "test":
            idx = q["options"].index("4")
            out[q["id"]] = idx if right else (idx + 1) % len(q["options"])
        else:
            out[q["id"]] = "9.8" if right else "1"
    return out


def _finish_module(c, module_id, right=True):
    detail_mod = Module.objects.get(pk=module_id)
    for lesson in detail_mod.lessons.all():
        assert c.post(f"/api/training/lessons/{lesson.id}/done/").status_code == 200
    att = c.post(f"/api/training/modules/{module_id}/start/").data
    return c.post(f"/api/training/attempts/{att['id']}/submit/", {"answers": _answers(c, att, right)}, format="json")


def test_draft_is_hidden_and_publish_needs_a_module(as_user, admin, teacher):
    c = as_user(admin)
    cid = c.post("/api/training/courses/", {"title": "Bo'sh kurs"}, format="json").data["id"]
    assert c.patch(f"/api/training/courses/{cid}/", {"is_published": True}, format="json").status_code == 400
    c.post(f"/api/training/courses/{cid}/modules/", {"title": "1. Hali bo'sh"}, format="json")
    resp = c.patch(f"/api/training/courses/{cid}/", {"is_published": True}, format="json")
    assert resp.status_code == 400 and "dars ham, test ham" in str(resp.data)
    # nobody "finishes" an empty module, the editor included
    assert c.get("/api/training/courses/").data[0]["completed"] is False
    assert as_user(teacher).get("/api/training/courses/").data == []
    assert as_user(teacher).get(f"/api/training/courses/{cid}/").status_code == 404
    assert as_user(teacher).post("/api/training/courses/", {"title": "x"}, format="json").status_code == 403


def test_bad_question_is_refused(as_user, admin, course):
    resp = as_user(admin).post(f"/api/training/courses/{course.id}/modules/", {
        "title": "3", "questions": [{"kind": "test", "text": "?", "options": ["a"], "correct": [0]}],
    }, format="json")
    assert resp.status_code == 400 and "1-savol" in str(resp.data)


def test_modules_unlock_in_order_and_certificate(as_user, teacher, course):
    c = as_user(teacher)
    m1, m2 = list(course.modules.order_by("order"))
    page = c.get(f"/api/training/courses/{course.id}/").data
    assert [m["locked"] for m in page["modules"]] == [False, True]
    assert "body" in page["modules"][0]["lessons"][0] and "body" not in page["modules"][1]["lessons"][0]
    # no answers reach the teacher
    assert "questions" not in page["modules"][0]
    # the test waits for the lessons; the second module waits for the first
    assert c.post(f"/api/training/modules/{m1.id}/start/").status_code == 400
    assert c.post(f"/api/training/lessons/{m2.lessons.first().id}/done/").status_code == 400
    assert c.post(f"/api/training/modules/{m2.id}/start/").status_code == 400

    failed = _finish_module(c, m1.id, right=False)
    assert failed.status_code == 200 and failed.data["passed"] is False and failed.data["revealed"] is False
    assert all("correct" not in i and "explanation" not in i for i in failed.data["items"])
    page = c.get(f"/api/training/courses/{course.id}/").data
    assert page["modules"][1]["locked"] is True

    passed = _finish_module(c, m1.id)
    assert passed.data["passed"] is True and passed.data["percent"] == 100 and passed.data["certificate"] is None
    page = c.get(f"/api/training/courses/{course.id}/").data
    assert page["modules"][1]["locked"] is False and page["modules_passed"] == 1

    last = _finish_module(c, m2.id)
    cert = last.data["certificate"]
    assert cert and cert["name"] == teacher.name and cert["hours"] == 36 and cert["number"].endswith("-00001")
    assert Enrollment.objects.get(user=teacher, course=course).completed_at is not None
    assert Notification.objects.filter(user=teacher, kind="malaka").exists()
    # once only
    again = _finish_module(c, m2.id)
    assert again.data["certificate"] is None and Certificate.objects.count() == 1
    cards = c.get("/api/training/courses/").data
    assert cards[0]["completed"] is True and cards[0]["certificate"]["number"] == cert["number"]


def test_public_verify_shows_only_the_certificate(api_client, as_user, teacher, course):
    c = as_user(teacher)
    for m in course.modules.order_by("order"):
        _finish_module(c, m.id)
    cert = Certificate.objects.get()
    api_client.force_authenticate(user=None)
    resp = api_client.get(f"/api/training/verify/{cert.code.lower()}/")
    assert resp.status_code == 200
    assert resp.data == {"valid": True, "name": cert.name, "course_title": "STEM metodikasi", "hours": 36,
                         "number": cert.number, "issued_at": resp.data["issued_at"]}
    assert api_client.get("/api/training/verify/NOPE123456/").status_code == 404


def test_test_size_draws_from_the_bank(as_user, admin, teacher, course):
    m1 = course.modules.order_by("order").first()
    as_user(admin).put(f"/api/training/modules/{m1.id}/", {
        "title": m1.title, "test_size": 1, "questions": [Q_TEST, Q_NUM],
        "lessons": [{"id": lesson.id, "title": lesson.title} for lesson in m1.lessons.all()],
    }, format="json")
    c = as_user(teacher)
    for lesson in m1.lessons.all():
        c.post(f"/api/training/lessons/{lesson.id}/done/")
    att = c.post(f"/api/training/modules/{m1.id}/start/").data
    assert len(att["questions"]) == 1 and "correct" not in att["questions"][0]


def test_editing_keeps_lesson_marks(as_user, admin, teacher, course):
    m1 = course.modules.order_by("order").first()
    first, second = list(m1.lessons.order_by("order"))
    as_user(teacher).post(f"/api/training/lessons/{first.id}/done/")
    resp = as_user(admin).put(f"/api/training/modules/{m1.id}/", {
        "title": "1. Kirish (yangi)", "questions": [Q_TEST],
        "lessons": [{"id": first.id, "title": "Nomi o'zgardi"}, {"title": "Yangi dars"}],
    }, format="json")
    assert resp.status_code == 200
    assert [lesson["title"] for lesson in resp.data["lessons"]] == ["Nomi o'zgardi", "Yangi dars"]
    assert not m1.lessons.filter(pk=second.pk).exists()
    page = as_user(teacher).get(f"/api/training/courses/{course.id}/").data
    assert [lesson["done"] for lesson in page["modules"][0]["lessons"]] == [True, False]
    # the editor sees the answers, nobody else does
    editor = as_user(admin).get(f"/api/training/courses/{course.id}/", {"edit": "1"}).data
    assert editor["modules"][0]["questions"][0]["correct"] == [1]
    plain = as_user(teacher).get(f"/api/training/courses/{course.id}/", {"edit": "1"}).data
    assert "questions" not in plain["modules"][0]


def test_audience_by_teacher_kind(as_user, admin, teacher, course, make_user):
    school = School.objects.create(name="Sodiq School")
    JournalClass.objects.create(teacher=teacher, name="7-A", school="Sodiq School", partner_school=school)
    course.audience = Course.Audience.MUHANDIS
    course.save()
    assert as_user(teacher).get("/api/training/courses/").data == []
    SchoolTeacher.objects.filter(teacher=teacher).update(kind="muhandis")
    assert [r["id"] for r in as_user(teacher).get("/api/training/courses/").data] == [course.id]


def test_assign_a_school_and_its_page(as_user, admin, teacher, course, make_user):
    school = School.objects.create(name="Sodiq School")
    JournalClass.objects.create(teacher=teacher, name="7-A", school="Sodiq School", partner_school=school)
    due = timezone.localdate() + timedelta(days=10)
    resp = as_user(admin).post(f"/api/training/courses/{course.id}/assign/",
                               {"school": school.id, "due_on": due.isoformat()}, format="json")
    assert resp.status_code == 200 and resp.data == {"assigned": 1, "updated": 0}
    e = Enrollment.objects.get(user=teacher, course=course)
    assert e.assigned_by == admin and e.due_on == due
    assert Notification.objects.filter(user=teacher, kind="malaka", url=f"/training/{course.id}").exists()
    card = as_user(teacher).get("/api/training/courses/").data[0]
    assert card["assigned"] is True and str(card["due_on"]) == due.isoformat()
    # not for teachers to do
    assert as_user(teacher).post(f"/api/training/courses/{course.id}/assign/", {"school": school.id},
                                 format="json").status_code == 403
    progress = as_user(admin).get(f"/api/training/courses/{course.id}/progress/").data
    assert progress[0]["name"] == teacher.name and progress[0]["percent"] == 0
    assert as_user(teacher).get(f"/api/training/courses/{course.id}/progress/").status_code == 403

    # the school's ma'muriyat sees their teachers' courses, not other schools'
    boss = make_user("boss@sodiq.uz", role=User.Role.MAKTAB, approved=True)
    SchoolManager.objects.create(school=school, user=boss, position="direktor")
    other = School.objects.create(name="Iftixor")
    data = as_user(boss).get(f"/api/training/schools/{school.id}/").data
    assert data["teachers"][0]["courses"][0]["title"] == "STEM metodikasi"
    assert as_user(boss).get(f"/api/training/schools/{other.id}/").status_code == 403
    # and doesn't take courses
    m1 = course.modules.order_by("order").first()
    assert as_user(boss).post(f"/api/training/lessons/{m1.lessons.first().id}/done/").status_code == 403


def test_assign_picked_teachers(as_user, admin, teacher, course, make_user):
    other = make_user("other@example.com", approved=True)
    observer = make_user("watch@example.com", role=User.Role.KUZATUVCHI, approved=True)
    resp = as_user(admin).post(f"/api/training/courses/{course.id}/assign/",
                               {"teachers": [teacher.id, other.id, observer.id]}, format="json")
    assert resp.status_code == 200 and resp.data == {"assigned": 2, "updated": 0}
    assert set(Enrollment.objects.filter(course=course).values_list("user_id", flat=True)) == {teacher.id, other.id}


def test_due_reminders_once_per_mark(admin, teacher, course):
    today = timezone.localdate()
    services.assign(course, [teacher], admin, today + timedelta(days=3))
    Notification.objects.all().delete()
    assert services.send_due_reminders(today) == 1
    assert services.send_due_reminders(today) == 0
    assert services.send_due_reminders(today + timedelta(days=2)) == 1
    assert Notification.objects.filter(user=teacher, kind="malaka").count() == 2


def test_revoke_certificate_and_observer_read_only(as_user, admin, observer, teacher, course):
    c = as_user(teacher)
    for m in course.modules.order_by("order"):
        _finish_module(c, m.id)
    cert = Certificate.objects.get()
    assert as_user(observer).get(f"/api/training/certificates/{cert.id}/").status_code == 200
    assert as_user(observer).delete(f"/api/training/certificates/{cert.id}/").status_code == 403
    assert as_user(observer).post(f"/api/training/courses/{course.id}/enroll/").status_code == 403
    assert as_user(admin).delete(f"/api/training/certificates/{cert.id}/").status_code == 204
    # course deleted later: a certificate issued before stays
    for m in course.modules.order_by("order"):
        _finish_module(c, m.id)
    as_user(admin).delete(f"/api/training/courses/{course.id}/")
    kept = Certificate.objects.get()
    assert kept.course is None and kept.course_title == "STEM metodikasi"
