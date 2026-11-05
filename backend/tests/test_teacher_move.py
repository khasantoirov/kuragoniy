"""Moving a teacher between partner schools (schools/moves.py): the classes
and timetable at the old school go to the successor, the assignment
follows the teacher, and Ctrl+Z puts everything back."""

from datetime import date

import pytest

from journal.models import JournalClass, Student
from schools.models import School, SchoolTeacher, TeacherMove
from timetable.models import TimetableSlot

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup(teacher, make_user):
    x = School.objects.create(name="Sodiq School")
    y = School.objects.create(name="Iftixor")
    newbie = make_user("newbie@example.com", approved=True)
    c1 = JournalClass.objects.create(teacher=teacher, name="7-A", school="Sodiq School", partner_school=x)
    c2 = JournalClass.objects.create(teacher=teacher, name="8-B", school="Sodiq School", partner_school=x)
    Student.objects.create(journal_class=c1, full_name="Aliyev Vali", order=1)
    elsewhere = JournalClass.objects.create(teacher=teacher, name="9-A", school="Iftixor", partner_school=y)
    s1 = TimetableSlot.objects.create(teacher=teacher, day_index=0, period_index=1, maktab="Sodiq School", sinf="7-A")
    s2 = TimetableSlot.objects.create(teacher=teacher, day_index=1, period_index=2, maktab="sodiq school", sinf="8-B")
    s3 = TimetableSlot.objects.create(teacher=teacher, day_index=2, period_index=3, maktab="Iftixor", sinf="9-A")
    # the newcomer already teaches somewhere at Tuesday 2nd period
    TimetableSlot.objects.create(teacher=newbie, day_index=1, period_index=2, maktab="Boshqa", sinf="5-A")
    return dict(x=x, y=y, newbie=newbie, c1=c1, c2=c2, elsewhere=elsewhere, s1=s1, s2=s2, s3=s3)


def url(school):
    return f"/api/schools/{school.id}/move-teacher/"


def test_preview_lists_what_goes_along(as_user, admin, teacher, setup):
    data = as_user(admin).get(url(setup["x"]), {"teacher": teacher.id}).data
    assert [c["name"] for c in data["classes"]] == ["7-A", "8-B"]
    assert data["slots"] == 2 and data["assigned"]


def test_move_with_successor_and_undo(as_user, admin, teacher, setup):
    x, y, newbie = setup["x"], setup["y"], setup["newbie"]
    resp = as_user(admin).post(url(x), {"teacher": teacher.id, "to_school": y.id, "successor": newbie.id,
                                        "since": "2026-11-05"}, format="json")
    assert resp.status_code == 201, resp.data
    assert (resp.data["classes"], resp.data["slots_moved"], resp.data["slots_kept"]) == (2, 1, 1)

    assert set(JournalClass.objects.filter(partner_school=x).values_list("teacher_id", flat=True)) == {newbie.id}
    assert JournalClass.objects.get(pk=setup["elsewhere"].pk).teacher_id == teacher.id  # other school untouched
    assert TimetableSlot.objects.get(pk=setup["s1"].pk).teacher_id == newbie.id
    assert TimetableSlot.objects.get(pk=setup["s2"].pk).teacher_id == teacher.id  # newcomer busy then: kept
    assert TimetableSlot.objects.get(pk=setup["s3"].pk).teacher_id == teacher.id
    assert not SchoolTeacher.objects.filter(school=x, teacher=teacher).exists()
    assert SchoolTeacher.objects.get(school=x, teacher=newbie).since == date(2026, 11, 5)
    assert SchoolTeacher.objects.filter(school=y, teacher=teacher).exists()

    undo = as_user(admin).post(f"/api/schools/teacher-moves/{resp.data['move']}/undo/")
    assert undo.status_code == 200, undo.data
    assert set(JournalClass.objects.filter(partner_school=x).values_list("teacher_id", flat=True)) == {teacher.id}
    assert TimetableSlot.objects.get(pk=setup["s1"].pk).teacher_id == teacher.id
    assert SchoolTeacher.objects.filter(school=x, teacher=teacher).exists()
    assert not SchoolTeacher.objects.filter(school=x, teacher=newbie).exists()
    assert SchoolTeacher.objects.filter(school=y, teacher=teacher).exists()  # still teaches 9-A there
    # twice: refused
    assert as_user(admin).post(f"/api/schools/teacher-moves/{resp.data['move']}/undo/").status_code == 409


def test_classes_need_a_successor(as_user, admin, teacher, setup):
    resp = as_user(admin).post(url(setup["x"]), {"teacher": teacher.id, "to_school": setup["y"].id}, format="json")
    assert resp.status_code == 400 and "successor" in resp.data
    assert not TeacherMove.objects.exists()


def test_teacher_without_classes_just_moves(as_user, admin, make_user, setup):
    lone = make_user("lone@example.com", approved=True)
    SchoolTeacher.objects.create(school=setup["x"], teacher=lone)
    resp = as_user(admin).post(url(setup["x"]), {"teacher": lone.id, "to_school": setup["y"].id}, format="json")
    assert resp.status_code == 201
    assert list(SchoolTeacher.objects.filter(teacher=lone).values_list("school__name", flat=True)) == ["Iftixor"]


def test_replacing_without_a_new_school(as_user, admin, teacher, setup):
    """A new teacher comes to the school; the old one only leaves it."""
    resp = as_user(admin).post(url(setup["x"]), {"teacher": teacher.id, "successor": setup["newbie"].id}, format="json")
    assert resp.status_code == 201
    assert not SchoolTeacher.objects.filter(school=setup["x"], teacher=teacher).exists()


def test_undo_refused_after_a_later_handover(as_user, admin, teacher, make_user, setup):
    resp = as_user(admin).post(url(setup["x"]), {"teacher": teacher.id, "successor": setup["newbie"].id}, format="json")
    third = make_user("third@example.com", approved=True)
    setup["c1"].teacher = third
    setup["c1"].save()
    undo = as_user(admin).post(f"/api/schools/teacher-moves/{resp.data['move']}/undo/")
    assert undo.status_code == 409


def test_bad_requests(as_user, admin, teacher, setup):
    x = setup["x"]
    assert as_user(admin).post(url(x), {"teacher": teacher.id, "to_school": x.id, "successor": setup["newbie"].id},
                               format="json").status_code == 400
    assert as_user(admin).post(url(x), {"teacher": teacher.id, "successor": teacher.id}, format="json").status_code == 400
    assert as_user(admin).post(url(x), {"teacher": teacher.id}, format="json").status_code == 400


def test_only_administrators(as_user, teacher, setup):
    assert as_user(teacher).get(url(setup["x"]), {"teacher": teacher.id}).status_code == 403
    assert as_user(teacher).post(url(setup["x"]), {"teacher": teacher.id, "to_school": setup["y"].id},
                                 format="json").status_code == 403
