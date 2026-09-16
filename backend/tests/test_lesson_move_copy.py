"""Lesson.move_copy — the lesson-level counterpart to copying/moving a
single experiment to another lesson: send a whole lesson (with its
experiments) to another grade/quarter, either duplicating it or relocating
it, with hafta staying a gap-free continuous week-of-year count in every
grade touched.
"""

import pytest

from lessons.models import Experiment, Lesson

pytestmark = pytest.mark.django_db


def make_lesson(grade, chorak, hafta, title="Dars", with_experiment=True):
    lesson = Lesson.objects.create(title=title, grade=grade, chorak=chorak, hafta=hafta)
    if with_experiment:
        Experiment.objects.create(lesson=lesson, order=0, name="Tajriba", desc="d")
    return lesson


def test_teacher_cannot_move_copy(as_user, teacher):
    lesson = make_lesson("7-8", 1, 1)
    resp = as_user(teacher).post(
        f"/api/lessons/{lesson.id}/move-copy/", {"mode": "copy", "grade": "9", "chorak": 1}, format="json"
    )
    assert resp.status_code == 403


def test_copy_duplicates_lesson_and_experiments_leaving_original(as_user, admin):
    source = make_lesson("7-8", 1, 1, title="Kulon kuchi")
    make_lesson("9", 1, 1, title="9-sinf boshqa dars")  # occupies (9, 1) hafta=1 already

    resp = as_user(admin).post(
        f"/api/lessons/{source.id}/move-copy/", {"mode": "copy", "grade": "9", "chorak": 1}, format="json"
    )
    assert resp.status_code == 200
    new_id = resp.data["id"]
    assert new_id != source.id

    source.refresh_from_db()
    assert source.grade == "7-8"  # untouched by copy
    assert Lesson.objects.filter(grade="7-8").count() == 1

    copy = Lesson.objects.get(id=new_id)
    assert copy.grade == "9" and copy.chorak == 1
    assert copy.title == "Kulon kuchi"
    assert copy.hafta == 2  # appended after the existing grade-9 lesson
    assert copy.experiments.count() == 1
    assert copy.experiments.first().name == "Tajriba"
    # translations are not carried over — the bot re-translates fresh content
    assert copy.translated_at is None


def test_move_relocates_and_renumbers_both_grades(as_user, admin):
    source = make_lesson("7-8", 1, 1, title="Ko'chiriladigan dars")
    make_lesson("7-8", 1, 2, title="Grade7-8 qoladigan dars")
    make_lesson("9", 2, 1, title="Grade9 mavjud dars")

    resp = as_user(admin).post(
        f"/api/lessons/{source.id}/move-copy/", {"mode": "move", "grade": "9", "chorak": 2}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["id"] == source.id
    assert resp.data["grade"] == "9"
    assert resp.data["chorak"] == 2

    # only one lesson left in grade 7-8, renumbered to close the gap
    grade78 = list(Lesson.objects.filter(grade="7-8").order_by("hafta"))
    assert len(grade78) == 1
    assert grade78[0].hafta == 1

    # grade 9 now has both lessons, appended after the existing one
    grade9 = list(Lesson.objects.filter(grade="9").order_by("hafta"))
    assert [l.hafta for l in grade9] == [1, 2]
    assert grade9[1].id == source.id


def test_move_within_same_grade_changes_only_chorak(as_user, admin):
    source = make_lesson("7-8", 1, 1)
    make_lesson("7-8", 2, 2)

    resp = as_user(admin).post(
        f"/api/lessons/{source.id}/move-copy/", {"mode": "move", "grade": "7-8", "chorak": 2}, format="json"
    )
    assert resp.status_code == 200
    assert Lesson.objects.filter(grade="7-8").count() == 2
    source.refresh_from_db()
    assert source.chorak == 2


@pytest.mark.parametrize("payload", [
    {"mode": "bogus", "grade": "7-8", "chorak": 1},
    {"mode": "copy", "grade": "6", "chorak": 1},
    {"mode": "copy", "grade": "7-8", "chorak": 5},
])
def test_move_copy_rejects_invalid_input(as_user, admin, payload):
    lesson = make_lesson("7-8", 1, 1)
    resp = as_user(admin).post(f"/api/lessons/{lesson.id}/move-copy/", payload, format="json")
    assert resp.status_code == 400
