"""Yangi o'quv yiliga o'tish (journal/rollover.py) and the read-only past
year (journal/locks.py): last year's classes go up one grade with their
pupils and accounts, the 11th graduates, a second run doubles nothing,
and once the new year is current the old journals only open by an
administrator's permission."""

from datetime import timedelta

import pytest
from django.utils import timezone

from journal.models import GradeEntry, JournalClass, JournalEditGrant, Student
from journal.rollover import next_name
from learning.models import StudentProfile
from schools.models import AcademicYear

pytestmark = pytest.mark.django_db


def test_next_name_goes_up_one_grade():
    assert next_name("7-A") == ("8-A", False)
    assert next_name("10 B") == ("11 B", False)
    assert next_name("9-sinf") == ("10-sinf", False)
    assert next_name("11-A") == (None, True)
    assert next_name("Fizika to'garagi") == ("Fizika to'garagi", False)


@pytest.fixture
def school_year(teacher, make_student):
    """This year's 7-A (two pupils, one with an account and a mark) and 11-A."""
    year = AcademicYear.current()
    seven = JournalClass.objects.create(teacher=teacher, name="7-A", school="1-maktab", scale=10)
    vali = Student.objects.create(journal_class=seven, full_name="Aliyev Vali", order=1)
    account = make_student(seven, "Aliyev Vali")
    StudentProfile.objects.filter(user=account).update(roster_entry=vali, journal_class=seven)
    Student.objects.create(journal_class=seven, full_name="Karimova Nodira", order=2)
    eleven = JournalClass.objects.create(teacher=teacher, name="11-A", school="1-maktab")
    Student.objects.create(journal_class=eleven, full_name="Bitiruvchi", order=1)
    return {"year": year, "seven": seven, "eleven": eleven, "vali": vali, "account": account}


def _url(year):
    return f"/api/schools/years/{year.id}/rollover/"


def test_rollover_moves_classes_up_with_pupils_and_accounts(as_user, admin, teacher, school_year):
    api = as_user(admin)
    year, seven = school_year["year"], school_year["seven"]
    plan = {r["name"]: r for r in api.get(_url(year)).data["rows"]}
    assert (plan["7-A"]["new_name"], plan["7-A"]["action"], plan["7-A"]["students"]) == ("8-A", "move", 2)
    assert plan["11-A"]["action"] == "graduate"

    resp = api.post(_url(year), {"make_current": True}, format="json")
    assert resp.status_code == 200 and (resp.data["classes"], resp.data["students"]) == (1, 2)
    nxt = AcademicYear.objects.get(start_year=year.start_year + 1)
    assert AcademicYear.current() == nxt
    eight = JournalClass.objects.get(year=nxt)
    assert (eight.name, eight.teacher, eight.scale, eight.rolled_from) == ("8-A", teacher, 10, seven)
    assert sorted(eight.students.values_list("full_name", flat=True)) == ["Aliyev Vali", "Karimova Nodira"]
    profile = StudentProfile.objects.get(user=school_year["account"])
    assert profile.journal_class == eight and profile.roster_entry.journal_class == eight
    # the old journal keeps its pupils; the 11th has no twin
    assert seven.students.filter(active=True).count() == 2
    assert not JournalClass.objects.filter(year=nxt, name__startswith="12").exists()
    # a second run doubles nothing
    again = api.post(_url(year), {}, format="json").data
    assert again["classes"] == 0 and JournalClass.objects.filter(year=nxt).count() == 1
    assert {r["name"]: r["action"] for r in api.get(_url(year)).data["rows"]}["7-A"] == "done"


def test_rollover_skips_excluded_and_already_made_classes(as_user, admin, teacher, school_year):
    api = as_user(admin)
    year = school_year["year"]
    nxt = AcademicYear.objects.create(start_year=year.start_year + 1)
    JournalClass.objects.create(teacher=teacher, name="8-a", year=nxt)  # made ahead by the teacher
    assert {r["name"]: r["action"] for r in api.get(_url(year)).data["rows"]}["7-A"] == "exists"
    assert api.post(_url(year), {"exclude": [school_year["seven"].id]}, format="json").data["classes"] == 0
    assert AcademicYear.current() == year  # not asked to switch
    assert as_user(teacher).post(_url(year), {}, format="json").status_code == 403


def test_a_past_years_journal_is_read_only(as_user, admin, teacher, school_year):
    seven, vali = school_year["seven"], school_year["vali"]
    as_user(admin).post(_url(school_year["year"]), {"make_current": True}, format="json")
    api = as_user(teacher)
    today = timezone.localdate()
    marks = {"date": today.isoformat(), "chorak": 1, "marks": [{"student_id": vali.id, "mark": 9}]}
    assert api.post(f"/api/journal/classes/{seven.id}/bulk-marks/", marks, format="json").status_code == 403
    assert api.post(f"/api/journal/classes/{seven.id}/set-final/", {"student_id": vali.id, "chorak": 1, "mark": 8}, format="json").status_code == 403
    assert api.post("/api/journal/students/", {"journal_class": seven.id, "full_name": "Yangi"}, format="json").status_code == 403
    assert api.patch(f"/api/journal/classes/{seven.id}/", {"name": "7-B"}, format="json").status_code == 403
    assert api.post(f"/api/learning/classes/{seven.id}/add-student/", {"full_name": "Yangi O'quvchi"}, format="json").status_code == 403
    assert api.get(f"/api/journal/classes/{seven.id}/grid/").data["lock"]["past_year"] is True
    # an administrator's permission opens it
    JournalEditGrant.objects.create(teacher=teacher, journal_class=seven, date_from=today - timedelta(days=1), date_to=today,
                                    status=JournalEditGrant.Status.APPROVED, expires_at=timezone.now() + timedelta(hours=2))
    assert api.post(f"/api/journal/classes/{seven.id}/bulk-marks/", marks, format="json").status_code == 200
    assert GradeEntry.objects.get(student=vali).mark == 9
    assert api.post(f"/api/journal/classes/{seven.id}/set-final/", {"student_id": vali.id, "chorak": 1, "mark": 8}, format="json").status_code == 200
