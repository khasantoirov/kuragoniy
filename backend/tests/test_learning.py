"""Student accounts, lesson material, server-side grading, assignments,
readiness check, lesson reports, awards and analytics scoping."""

import pytest
from django.core.cache import cache

from accounts.models import User
from learning.models import Assignment, Attempt, LessonMaterial, Question
from lessons.models import Experiment, Lesson

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def lesson(db):
    lesson = Lesson.objects.create(title="Nyuton qonunlari", grade=8, chorak=1, hafta=1, cat="mexanika",
                                   goal="Kuch va tezlanish bog'lanishini o'rganish")
    LessonMaterial.objects.create(
        lesson=lesson, theory="Kuch — jismlarning o'zaro ta'siri.", is_published=True,
        formulas=[{"expr": "F = m*a", "desc": "Nyutonning ikkinchi qonuni"}], video_url="https://youtu.be/abc",
    )
    Question.objects.create(lesson=lesson, kind="test", text="Kuch birligi?", options=["N", "J", "W", "Pa"], correct=[0])
    Question.objects.create(lesson=lesson, kind="number", text="m=2 kg, a=3 m/s². F=?", answer_value=6, tolerance_pct=1, unit="N")
    Question.objects.create(lesson=lesson, audience="teacher", kind="text", text="Inersiya qonuni nechanchi?", correct=["birinchi", "1"])
    return lesson


def _correct_answers(attempt):
    answers = {}
    for item in attempt.snapshot:
        if item["kind"] == "test":
            answers[item["id"]] = item["correct"][0]
        elif item["kind"] == "number":
            answers[item["id"]] = str(item["answer_value"]).replace(".", ",")
        elif item["kind"] == "text":
            answers[item["id"]] = item["correct"][0].upper()
    return answers


# ── Accounts ───────────────────────────────────────────────────────────

def test_teacher_creates_accounts_from_roster(as_user, teacher, journal_class):
    resp = as_user(teacher).post(f"/api/learning/classes/{journal_class.id}/create-accounts/", {}, format="json")
    assert resp.status_code == 201
    created = resp.data["created"]
    assert len(created) == 3
    assert {c["username"] for c in created} >= {"valialiyev", "nodirakarimova"}
    kid = User.objects.get(username="valialiyev")
    entry = next(c for c in created if c["username"] == "valialiyev")
    assert kid.role == "student" and kid.must_change_password
    assert kid.check_password(entry["password"])
    assert kid.student_profile.roster_entry.full_name == "Aliyev Vali"
    # Running it again creates nothing new.
    again = as_user(teacher).post(f"/api/learning/classes/{journal_class.id}/create-accounts/", {}, format="json")
    assert again.data["created"] == []


def test_other_teacher_cannot_touch_class_or_student(as_user, make_user, journal_class, student):
    other = make_user("other@example.com", approved=True)
    assert as_user(other).post(f"/api/learning/classes/{journal_class.id}/create-accounts/").status_code == 404
    assert as_user(other).post(f"/api/learning/students/{student.id}/reset-password/").status_code == 403
    assert as_user(other).get(f"/api/learning/students/{student.id}/").status_code == 403


def test_class_teacher_resets_student_password(as_user, teacher, student):
    resp = as_user(teacher).post(f"/api/learning/students/{student.id}/reset-password/")
    assert resp.status_code == 200
    student.refresh_from_db()
    assert student.check_password(resp.data["password"]) and student.must_change_password


def test_self_registration_with_join_code(api_client, as_user, teacher, journal_class):
    code = as_user(teacher).post(f"/api/learning/classes/{journal_class.id}/invite/", {}, format="json").data["invite_code"]
    info = api_client.get("/api/student/join-info/", {"code": code.lower()})
    assert info.status_code == 200 and info.data["class_name"] == "8-A"

    resp = api_client.post("/api/student/register/", {
        "code": code, "full_name": "Rahimov Jasur", "username": "jasur.r", "password": "Fizika-Sevaman-1",
    }, format="json")
    assert resp.status_code == 201 and resp.data["approved"] is False
    kid = User.objects.get(username="jasur.r")
    assert kid.student_profile.journal_class == journal_class and kid.student_profile.grade == 8

    assert as_user(teacher).post(f"/api/learning/students/{kid.id}/approve/").status_code == 200
    kid.refresh_from_db()
    assert kid.approved


def test_registration_rejects_bad_code_and_taken_username(api_client, as_user, teacher, journal_class, student):
    assert api_client.post("/api/student/register/", {"code": "NOPE1234", "full_name": "A B", "password": "Fizika-Sevaman-1"},
                           format="json").status_code == 400
    code = as_user(teacher).post(f"/api/learning/classes/{journal_class.id}/invite/", {}, format="json").data["invite_code"]
    resp = api_client.post("/api/student/register/", {
        "code": code, "full_name": "Aliyev Vali", "username": "valialiyev", "password": "Fizika-Sevaman-1"}, format="json")
    assert resp.status_code == 400


# ── Lessons, practice, grading ─────────────────────────────────────────

def test_student_sees_published_material_only(as_user, student, lesson):
    hidden = Lesson.objects.create(title="Yashirin", grade=8, chorak=1, hafta=2)
    LessonMaterial.objects.create(lesson=hidden, is_published=False)
    ids = {row["id"] for row in as_user(student).get("/api/student/lessons/").data}
    assert lesson.id in ids and hidden.id not in ids
    assert as_user(student).get(f"/api/student/lessons/{hidden.id}/").status_code == 404


def test_practice_never_leaks_answers_and_grades_server_side(as_user, student, lesson):
    client = as_user(student)
    start = client.post(f"/api/student/lessons/{lesson.id}/practice/")
    assert start.status_code == 201
    for q in start.data["questions"]:
        assert "correct" not in q and "answer_value" not in q and "explanation" not in q
    # Only student-audience questions are served.
    assert len(start.data["questions"]) == 2

    attempt = Attempt.objects.get(pk=start.data["id"])
    resp = client.post(f"/api/student/attempts/{attempt.id}/submit/", {"answers": _correct_answers(attempt)}, format="json")
    assert resp.status_code == 200
    assert resp.data["percent"] == 100.0
    # Can't submit twice.
    assert client.post(f"/api/student/attempts/{attempt.id}/submit/", {"answers": {}}, format="json").status_code == 400


def test_student_cannot_submit_someone_elses_attempt(as_user, make_student, journal_class, student, lesson):
    start = as_user(student).post(f"/api/student/lessons/{lesson.id}/practice/")
    intruder = make_student(journal_class, name="Karimova Nodira")
    resp = as_user(intruder).post(f"/api/student/attempts/{start.data['id']}/submit/", {"answers": {}}, format="json")
    assert resp.status_code == 404


# ── Assignments ────────────────────────────────────────────────────────

def test_assignment_flow(as_user, teacher, student, lesson, journal_class, make_user):
    resp = as_user(teacher).post("/api/learning/assignments/", {
        "journal_class": journal_class.id, "lesson": lesson.id, "title": "1-uy vazifa", "max_attempts": 1,
        "custom_questions": [{"kind": "test", "text": "Tezlanish birligi?", "options": ["m/s²", "m/s"], "correct": [0]}],
    }, format="json")
    assert resp.status_code == 201, resp.data
    assignment_id = resp.data["id"]

    listed = as_user(student).get("/api/student/assignments/").data
    assert listed[0]["id"] == assignment_id and listed[0]["state"] == "todo"

    start = as_user(student).post(f"/api/student/assignments/{assignment_id}/start/")
    assert start.status_code == 201 and len(start.data["questions"]) == 3
    attempt = Attempt.objects.get(pk=start.data["id"])
    as_user(student).post(f"/api/student/attempts/{attempt.id}/submit/", {"answers": _correct_answers(attempt)}, format="json")
    # Attempts exhausted.
    assert as_user(student).post(f"/api/student/assignments/{assignment_id}/start/").status_code == 400

    results = as_user(teacher).get(f"/api/learning/assignments/{assignment_id}/results/")
    assert results.status_code == 200
    row = next(r for r in results.data["rows"] if r["user"] == student.id)
    assert row["state"] == "submitted" and row["best_percent"] == 100.0

    other = make_user("other2@example.com", approved=True)
    assert as_user(other).get(f"/api/learning/assignments/{assignment_id}/results/").status_code == 404


def test_cannot_assign_to_someone_elses_class(as_user, make_user, journal_class, lesson):
    other = make_user("other3@example.com", approved=True)
    resp = as_user(other).post("/api/learning/assignments/", {
        "journal_class": journal_class.id, "lesson": lesson.id, "title": "x"}, format="json")
    assert resp.status_code == 400


def test_assignment_without_questions_rejected(as_user, teacher, journal_class):
    resp = as_user(teacher).post("/api/learning/assignments/", {"journal_class": journal_class.id, "title": "Bo'sh"}, format="json")
    assert resp.status_code == 400


def test_teacher_sees_only_own_students_results(as_user, teacher, student, lesson, make_user, admin):
    start = as_user(student).post(f"/api/student/lessons/{lesson.id}/practice/")
    attempt = Attempt.objects.get(pk=start.data["id"])
    as_user(student).post(f"/api/student/attempts/{attempt.id}/submit/", {"answers": {}}, format="json")
    assert as_user(teacher).get(f"/api/learning/attempts/{attempt.id}/").status_code == 200
    assert as_user(admin).get(f"/api/learning/attempts/{attempt.id}/").status_code == 200
    other = make_user("other4@example.com", approved=True)
    assert as_user(other).get(f"/api/learning/attempts/{attempt.id}/").status_code == 403
    assert as_user(other).get("/api/learning/attempts/").data["count"] == 0


# ── Teacher readiness check ────────────────────────────────────────────

def test_readiness_check_built_from_lesson_content(as_user, teacher, lesson):
    Experiment.objects.create(
        lesson=lesson, name="Aravacha tajribasi", desc="Aravachaga kuch ta'sir ettiriladi.",
        steps=["Aravachani stolga qo'ying", "Ipni bog'lang", "Yukni osing", "Vaqtni o'lchang"], minutes=10,
        safety="Yuk oyoqqa tushmasin",
    )
    start = as_user(teacher).post(f"/api/learning/readiness/{lesson.id}/start/")
    assert start.status_code == 201, start.data
    assert len(start.data["questions"]) >= 3
    assert all("correct" not in q for q in start.data["questions"])

    attempt = Attempt.objects.get(pk=start.data["id"])
    resp = as_user(teacher).post(f"/api/learning/readiness/attempts/{attempt.id}/submit/",
                                 {"answers": _correct_answers(attempt)}, format="json")
    assert resp.status_code == 200 and resp.data["passed"] is True
    status = as_user(teacher).get("/api/learning/readiness/status/").data
    assert status[str(lesson.id)]["passed"] is True


def test_readiness_refuses_empty_lesson(as_user, teacher):
    empty = Lesson.objects.create(title="Bo'sh", grade=7, chorak=1, hafta=1)
    assert as_user(teacher).post(f"/api/learning/readiness/{empty.id}/start/").status_code == 400


def test_student_cannot_start_readiness(jwt_as, student, lesson):
    assert jwt_as(student).post(f"/api/learning/readiness/{lesson.id}/start/").status_code == 403


# ── Lesson reports + review ────────────────────────────────────────────

def test_report_submit_and_review(as_user, teacher, admin, observer, journal_class, lesson):
    resp = as_user(teacher).post("/api/learning/reports/", {
        "journal_class": journal_class.id, "lesson": lesson.id, "date": "2026-10-10", "topic": "Nyuton qonunlari",
        "summary": "Aravacha bilan tajriba o'tkazildi, o'quvchilar guruhlarda ishladi.",
        "media_links": ["https://drive.google.com/x"],
    }, format="json")
    assert resp.status_code == 201, resp.data
    rid = resp.data["id"]
    assert as_user(teacher).post(f"/api/learning/reports/{rid}/review/", {"status": "reviewed", "rating": 5}, format="json").status_code == 403
    assert as_user(observer).post(f"/api/learning/reports/{rid}/review/", {"status": "reviewed", "rating": 5}, format="json").status_code == 403
    resp = as_user(admin).post(f"/api/learning/reports/{rid}/review/", {"status": "reviewed", "rating": 4, "review_comment": "Yaxshi"}, format="json")
    assert resp.status_code == 200 and resp.data["rating"] == 4
    # Reviewed reports are frozen.
    assert as_user(teacher).patch(f"/api/learning/reports/{rid}/", {"topic": "x"}, format="json").status_code == 400


def test_report_rejects_non_http_links(as_user, teacher):
    resp = as_user(teacher).post("/api/learning/reports/", {
        "date": "2026-10-10", "topic": "T", "summary": "x" * 30, "media_links": ["javascript:alert(1)"]}, format="json")
    assert resp.status_code == 400


# ── Awards + analytics ─────────────────────────────────────────────────

def test_awards_admin_only(as_user, admin, teacher, student):
    assert as_user(teacher).post("/api/learning/awards/", {"recipient": student.id, "title": "Zo'r"}, format="json").status_code == 403
    resp = as_user(admin).post("/api/learning/awards/", {"recipient": student.id, "title": "Oyning o'quvchisi",
                                                         "kind": "student_of_month"}, format="json")
    assert resp.status_code == 201
    assert len(as_user(student).get("/api/student/awards/").data) == 1


def test_analytics_scoped_and_working(as_user, teacher, admin, student, lesson, make_user):
    start = as_user(student).post(f"/api/student/lessons/{lesson.id}/practice/")
    attempt = Attempt.objects.get(pk=start.data["id"])
    as_user(student).post(f"/api/student/attempts/{attempt.id}/submit/", {"answers": _correct_answers(attempt)}, format="json")

    for report in ("overview", "top-students", "top-teachers", "best-reports", "classes", "lessons"):
        assert as_user(admin).get(f"/api/learning/analytics/{report}/").status_code == 200, report
    top = as_user(teacher).get("/api/learning/analytics/top-students/").data
    assert top[0]["user"] == student.id
    other = make_user("other5@example.com", approved=True)
    assert as_user(other).get("/api/learning/analytics/top-students/").data == []


def test_material_write_admin_only(as_user, teacher, admin, lesson):
    payload = {"theory": "Yangi", "formulas": [{"expr": "v = s/t", "desc": "Tezlik"}], "is_published": True}
    assert as_user(teacher).put(f"/api/learning/materials/{lesson.id}/", payload, format="json").status_code == 403
    assert as_user(admin).put(f"/api/learning/materials/{lesson.id}/", payload, format="json").status_code == 200
    bad = {"video_url": "javascript:alert(1)"}
    assert as_user(admin).put(f"/api/learning/materials/{lesson.id}/", bad, format="json").status_code == 400


def test_question_validation(as_user, admin, lesson):
    bad = {"lesson": lesson.id, "kind": "test", "text": "?", "options": ["a", "b"], "correct": [5]}
    assert as_user(admin).post("/api/learning/questions/", bad, format="json").status_code == 400
    ok = {"lesson": lesson.id, "kind": "multi", "text": "Vektor kattaliklar?", "options": ["kuch", "massa", "tezlik"], "correct": [0, 2]}
    assert as_user(admin).post("/api/learning/questions/", ok, format="json").status_code == 201


def test_assignment_visible_only_to_its_class(as_user, teacher, journal_class, make_student, lesson):
    from journal.models import JournalClass

    other_class = JournalClass.objects.create(teacher=teacher, name="9-B")
    outsider = make_student(other_class, name="Begona Bola")
    a = Assignment.objects.create(teacher=teacher, journal_class=journal_class, lesson=lesson, title="Faqat 8-A")
    assert as_user(outsider).post(f"/api/student/assignments/{a.id}/start/").status_code == 404
    assert all(row["id"] != a.id for row in as_user(outsider).get("/api/student/assignments/").data)


def test_material_list_and_user_search(as_user, admin, lesson, student):
    rows = as_user(admin).get("/api/learning/materials/", {"grade": 8}).data
    row = next(r for r in rows if r["lesson"] == lesson.id)
    assert row["is_published"] and row["question_counts"]["student"] == 2 and row["question_counts"]["teacher"] == 1
    found = as_user(admin).get("/api/accounts/users/", {"role": "student", "q": "aliyev"}).data["results"]
    assert [u["id"] for u in found] == [student.id]
