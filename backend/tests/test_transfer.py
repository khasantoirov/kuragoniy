"""Moving a pupil to another class — with the marks, or leaving them behind
as an archive (journal/transfer.py)."""

from datetime import date

import pytest

from journal.models import AttendanceEntry, ClassDay, ControlMark, ControlWork, FinalGrade, GradeEntry, JournalClass, Student
from learning.models import StudentProfile

pytestmark = pytest.mark.django_db


def _url(student):
    return f"/api/journal/students/{student.pk}/transfer/"


@pytest.fixture
def setup(teacher, make_user, journal_class, make_student):
    """Vali in 8-A (graded 0-5) with two marks, an absence, a quarter grade
    and a control-work mark; 8-B (graded 0-10) has a lesson on one of the
    same dates."""
    other = make_user("other-teacher@example.com", approved=True)
    target = JournalClass.objects.create(teacher=other, name="8-B", scale=10)
    account = make_student(journal_class, "Aliyev Vali")
    vali = Student.objects.get(journal_class=journal_class, full_name="Aliyev Vali")
    StudentProfile.objects.filter(user=account).update(roster_entry=vali, journal_class=journal_class)
    d1 = ClassDay.objects.create(journal_class=journal_class, date=date(2026, 9, 10), chorak=1)
    d2 = ClassDay.objects.create(journal_class=journal_class, date=date(2026, 9, 17), chorak=1)
    shared = ClassDay.objects.create(journal_class=target, date=date(2026, 9, 10), chorak=1)
    GradeEntry.objects.create(student=vali, day=d1, mark=4)
    GradeEntry.objects.create(student=vali, day=d2, mark=5)
    AttendanceEntry.objects.create(student=vali, day=d2, status="k")
    FinalGrade.objects.create(student=vali, chorak=1, mark=4)
    work = ControlWork.objects.create(journal_class=journal_class, date=date(2026, 9, 20), chorak=1, title="1-nazorat")
    ControlMark.objects.create(work=work, student=vali, mark=78)
    return {"vali": vali, "account": account, "source": journal_class, "target": target, "shared": shared}


def test_carry_moves_marks_onto_the_new_classes_days(as_user, admin, setup):
    vali, target = setup["vali"], setup["target"]
    resp = as_user(admin).post(_url(vali), {"target": target.pk, "mode": "carry"}, format="json")
    assert resp.status_code == 200 and resp.data["student"] == vali.pk

    vali.refresh_from_db()
    assert vali.journal_class == target and vali.active
    marks = {g.day.date: (g.day.journal_class_id, g.mark, g.level) for g in vali.grades.select_related("day")}
    # 4/5 -> 8/10 (yaxshi), 5/5 -> 10/10 (a'lo); the 10th reuses 8-B's lesson, the 17th is added
    assert marks == {date(2026, 9, 10): (target.pk, 8, 4), date(2026, 9, 17): (target.pk, 10, 5)}
    assert GradeEntry.objects.get(student=vali, day__date=date(2026, 9, 10)).day == setup["shared"]
    assert ClassDay.objects.filter(journal_class=target).count() == 2
    assert AttendanceEntry.objects.get(student=vali).day.journal_class == target
    assert FinalGrade.objects.get(student=vali).mark == 8
    cm = ControlMark.objects.get(student=vali)
    assert (cm.work.journal_class, cm.work.title, cm.mark) == (target, "1-nazorat", 78)
    # the old class keeps no trace of the pupil; the account follows
    assert not GradeEntry.objects.filter(day__journal_class=setup["source"]).exists()
    assert StudentProfile.objects.get(user=setup["account"]).journal_class == target


def test_archive_leaves_the_marks_and_starts_fresh(as_user, admin, teacher, setup):
    vali, source, target = setup["vali"], setup["source"], setup["target"]
    resp = as_user(admin).post(_url(vali), {"target": target.pk, "mode": "archive"}, format="json")
    assert resp.status_code == 200
    new = Student.objects.get(pk=resp.data["student"])
    assert (new.journal_class, new.full_name, new.grades.count()) == (target, "Aliyev Vali", 0)

    vali.refresh_from_db()
    assert (vali.active, vali.moved_to, vali.journal_class) == (False, new, source)
    assert vali.grades.count() == 2  # still in the old journal
    profile = StudentProfile.objects.get(user=setup["account"])
    assert (profile.journal_class, profile.roster_entry) == (target, new)

    grid = as_user(teacher).get(f"/api/journal/classes/{source.pk}/grid/").data
    assert grid["archived"] == [{"id": vali.pk, "full_name": "Aliyev Vali", "moved_to_class": "8-B"}]
    assert vali.pk not in [s["id"] for s in grid["students"]]


def test_the_classes_teacher_moves_their_pupil_but_nobody_elses(as_user, admin, teacher, setup):
    vali, source, target = setup["vali"], setup["source"], setup["target"]
    other = target.teacher
    # the pupil's own teacher sees where they can go — any class of the year but this one
    targets = as_user(teacher).get(_url(vali)).data
    assert [(c["id"], c["mine"]) for c in targets] == [(target.id, False)]
    # another teacher can't take a pupil out of someone else's class
    assert as_user(other).get(_url(vali)).status_code == 403
    assert as_user(other).post(_url(vali), {"target": target.pk, "mode": "carry"}, format="json").status_code == 403
    assert as_user(teacher).post(_url(vali), {"target": source.pk, "mode": "carry"}, format="json").status_code == 400
    assert as_user(teacher).post(_url(vali), {"target": target.pk, "mode": "nope"}, format="json").status_code == 400
    resp = as_user(teacher).post(_url(vali), {"target": target.pk, "mode": "carry"}, format="json")
    assert resp.status_code == 200
    vali.refresh_from_db()
    assert vali.journal_class == target


def test_refuses_a_class_that_already_has_the_pupil(as_user, admin, setup):
    vali, target = setup["vali"], setup["target"]
    Student.objects.create(journal_class=target, full_name="aliyev vali")
    resp = as_user(admin).post(_url(vali), {"target": target.pk, "mode": "carry"}, format="json")
    assert resp.status_code == 400 and "allaqachon bor" in resp.data["detail"]
    vali.refresh_from_db()
    assert vali.journal_class == setup["source"] and vali.grades.count() == 2
