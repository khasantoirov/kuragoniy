"""GET /api/search/ — the 2-rejim topbar's global search (globalsearch/views.py).

The interesting cases are the two boundaries it must not cross: the
QuarterLock gate on lessons (a closed quarter's titles must stay hidden
even though the search itself is open to every approved user) and the
journal roster scope (a teacher must not find another teacher's students,
or any staff at all).
"""

import pytest

from accounts.models import User
from journal.models import JournalClass, Student
from lessons.models import Experiment, Lesson, QuarterLock
from library.models import LibraryItem

pytestmark = pytest.mark.django_db

URL = "/api/search/"


def group(resp, kind):
    return next(g for g in resp.data["groups"] if g["kind"] == kind)


def titles(resp, kind):
    return [i["title"] for i in group(resp, kind)["items"]]


@pytest.fixture
def lesson():
    return Lesson.objects.create(
        title="Havo bosimi tajribasi",
        grade=Lesson.Grade.G5_6,
        chorak=1,
        hafta=3,
        goal="Bosim tushunchasini tushuntirish",
    )


# ── Access ──────────────────────────────────────────────────

def test_unapproved_teacher_cannot_search(as_user, unapproved_teacher):
    resp = as_user(unapproved_teacher).get(URL, {"q": "havo"})
    assert resp.status_code == 403


def test_anonymous_cannot_search(api_client):
    assert api_client.get(URL, {"q": "havo"}).status_code == 401


# ── Query length guard ──────────────────────────────────────

def test_single_character_query_returns_no_items_but_all_groups(as_user, admin, lesson):
    resp = as_user(admin).get(URL, {"q": "h"})
    assert resp.status_code == 200
    assert resp.data["total"] == 0
    assert [g["kind"] for g in resp.data["groups"]] == ["lesson", "library", "student", "staff"]


def test_missing_query_is_handled(as_user, admin):
    resp = as_user(admin).get(URL)
    assert resp.status_code == 200
    assert resp.data["total"] == 0


# ── Lessons ─────────────────────────────────────────────────

def test_lesson_matches_on_title_case_insensitively(as_user, admin, lesson):
    resp = as_user(admin).get(URL, {"q": "HAVO"})
    assert titles(resp, "lesson") == ["Havo bosimi tajribasi"]


def test_lesson_matches_on_goal(as_user, admin, lesson):
    resp = as_user(admin).get(URL, {"q": "tushuncha"})
    assert titles(resp, "lesson") == ["Havo bosimi tajribasi"]


def test_lesson_matches_on_translated_title(as_user, admin, lesson):
    lesson.title_ru = "Опыт с давлением воздуха"
    lesson.save()
    resp = as_user(admin).get(URL, {"q": "давлен"})
    assert titles(resp, "lesson") == ["Havo bosimi tajribasi"]


def test_lesson_matches_on_experiment_name_without_duplicating(as_user, admin, lesson):
    Experiment.objects.create(lesson=lesson, name="Shisha idishdagi shar")
    Experiment.objects.create(lesson=lesson, name="Shisha ustida qog'oz")
    resp = as_user(admin).get(URL, {"q": "shisha"})
    assert titles(resp, "lesson") == ["Havo bosimi tajribasi"]


def test_lesson_subtitle_carries_grade_chorak_hafta(as_user, admin, lesson):
    resp = as_user(admin).get(URL, {"q": "havo"})
    assert group(resp, "lesson")["items"][0]["subtitle"] == "5-6-sinf · 1-chorak · 3-dars"
    assert group(resp, "lesson")["items"][0]["url"] == f"/lessons/{lesson.id}"


def test_teacher_cannot_find_a_lesson_in_a_locked_quarter(as_user, teacher):
    Lesson.objects.create(title="Yopiq chorak darsi", grade=Lesson.Grade.G1_2, chorak=2, hafta=1)
    resp = as_user(teacher).get(URL, {"q": "yopiq"})
    assert titles(resp, "lesson") == []


def test_admin_can_find_a_lesson_in_a_locked_quarter(as_user, admin):
    Lesson.objects.create(title="Yopiq chorak darsi", grade=Lesson.Grade.G1_2, chorak=2, hafta=1)
    resp = as_user(admin).get(URL, {"q": "yopiq"})
    assert titles(resp, "lesson") == ["Yopiq chorak darsi"]


def test_teacher_finds_a_lesson_once_its_quarter_is_opened(as_user, teacher):
    Lesson.objects.create(title="Yopiq chorak darsi", grade=Lesson.Grade.G1_2, chorak=2, hafta=1)
    QuarterLock.objects.create(chorak=2, is_open=True)
    resp = as_user(teacher).get(URL, {"q": "yopiq"})
    assert titles(resp, "lesson") == ["Yopiq chorak darsi"]


# ── Library ─────────────────────────────────────────────────

def test_library_matches_on_title_and_note(as_user, teacher):
    LibraryItem.objects.create(title="Fizika qo'llanma", kind=LibraryItem.Kind.QOLLANMA, grade=7)
    LibraryItem.objects.create(title="Boshqa kitob", kind=LibraryItem.Kind.KITOB, note="fizika haqida")
    resp = as_user(teacher).get(URL, {"q": "fizika"})
    assert sorted(titles(resp, "library")) == ["Boshqa kitob", "Fizika qo'llanma"]


def test_library_subtitle_carries_kind_and_grade(as_user, teacher):
    LibraryItem.objects.create(title="Fizika qo'llanma", kind=LibraryItem.Kind.QOLLANMA, grade=7)
    resp = as_user(teacher).get(URL, {"q": "fizika"})
    assert group(resp, "library")["items"][0]["subtitle"] == "Qo'llanma · 7-sinf"


# ── Students ────────────────────────────────────────────────

def test_teacher_finds_own_student_only(as_user, teacher, make_user):
    other = make_user("other@example.com", approved=True)
    mine = JournalClass.objects.create(teacher=teacher, name="8-A")
    theirs = JournalClass.objects.create(teacher=other, name="8-B")
    Student.objects.create(journal_class=mine, full_name="Alisher Yo'ldoshev")
    Student.objects.create(journal_class=theirs, full_name="Alisher Qodirov")

    resp = as_user(teacher).get(URL, {"q": "alisher"})
    assert titles(resp, "student") == ["Alisher Yo'ldoshev"]
    assert group(resp, "student")["items"][0]["subtitle"] == "8-A"


def test_admin_finds_students_across_all_classes(as_user, admin, teacher, make_user):
    other = make_user("other2@example.com", approved=True)
    a = JournalClass.objects.create(teacher=teacher, name="8-A")
    b = JournalClass.objects.create(teacher=other, name="8-B")
    Student.objects.create(journal_class=a, full_name="Alisher Yo'ldoshev")
    Student.objects.create(journal_class=b, full_name="Alisher Qodirov")

    resp = as_user(admin).get(URL, {"q": "alisher"})
    assert sorted(titles(resp, "student")) == ["Alisher Qodirov", "Alisher Yo'ldoshev"]


def test_inactive_student_is_not_found(as_user, teacher):
    cls = JournalClass.objects.create(teacher=teacher, name="8-A")
    Student.objects.create(journal_class=cls, full_name="Alisher Chiqqan", active=False)
    resp = as_user(teacher).get(URL, {"q": "alisher"})
    assert titles(resp, "student") == []


# ── Staff ───────────────────────────────────────────────────

def test_teacher_gets_no_staff_results(as_user, teacher, make_user):
    make_user("bekzod@example.com", approved=True)
    resp = as_user(teacher).get(URL, {"q": "bekzod"})
    assert titles(resp, "staff") == []


def test_admin_finds_staff_by_name_and_email(as_user, admin, make_user):
    make_user("bekzod@example.com", approved=True)
    resp = as_user(admin).get(URL, {"q": "bekzod"})
    assert titles(resp, "staff") == ["bekzod"]
    assert group(resp, "staff")["items"][0]["subtitle"] == "O'qituvchi · bekzod@example.com"


def test_admin_finds_staff_by_email_domain(as_user, admin, make_user):
    make_user("xodim@maktab.uz", role=User.Role.BOSHLIQ, approved=True)
    resp = as_user(admin).get(URL, {"q": "maktab.uz"})
    assert "xodim" in titles(resp, "staff")


# ── Limit ───────────────────────────────────────────────────

def test_limit_caps_items_per_group(as_user, admin):
    for i in range(8):
        LibraryItem.objects.create(title=f"Fizika {i}", kind=LibraryItem.Kind.KITOB)
    resp = as_user(admin).get(URL, {"q": "fizika", "limit": 3})
    assert len(group(resp, "library")["items"]) == 3


def test_limit_is_clamped_to_max(as_user, admin):
    for i in range(25):
        LibraryItem.objects.create(title=f"Fizika {i}", kind=LibraryItem.Kind.KITOB)
    resp = as_user(admin).get(URL, {"q": "fizika", "limit": 999})
    assert len(group(resp, "library")["items"]) == 20


def test_garbage_limit_falls_back_to_default(as_user, admin):
    for i in range(8):
        LibraryItem.objects.create(title=f"Fizika {i}", kind=LibraryItem.Kind.KITOB)
    resp = as_user(admin).get(URL, {"q": "fizika", "limit": "abc"})
    assert len(group(resp, "library")["items"]) == 5


def test_total_counts_every_group(as_user, admin, lesson):
    LibraryItem.objects.create(title="Havo kitobi", kind=LibraryItem.Kind.KITOB)
    resp = as_user(admin).get(URL, {"q": "havo"})
    assert resp.data["total"] == 2
