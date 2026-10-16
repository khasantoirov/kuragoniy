"""Partner schools: name matching / linking, automatic attachment of new
classes, the statistics formulas, and who may see what."""

from datetime import date

import pytest
from django.core.cache import cache

from journal.models import AttendanceEntry, ClassDay, GradeEntry, JournalClass, Student
from schools.matching import norm, unlinked_names
from schools.models import School, SchoolTeacher
from timetable.models import TimetableSlot

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def test_norm_ignores_case_spacing_and_apostrophes():
    assert norm("Sodiq school (istirohat )") == norm("sodiq  School(istirohat)")
    assert norm("Qorako‘l school") == norm("Qorako'l school")


def test_creating_school_links_matching_classes_and_teachers(as_user, admin, teacher):
    JournalClass.objects.create(teacher=teacher, name="7-A", school="Sodiq School (Aeroport)")
    JournalClass.objects.create(teacher=teacher, name="7-B", school="Boshqa maktab")
    TimetableSlot.objects.create(teacher=teacher, day_index=0, period_index=1, maktab="Sodiq")

    resp = as_user(admin).post("/api/schools/", {"name": "Sodiq School (Aeroport)", "aliases": ["Sodiq"]}, format="json")
    assert resp.status_code == 201, resp.data
    school = School.objects.get()
    assert JournalClass.objects.get(name="7-A").partner_school == school
    assert JournalClass.objects.get(name="7-B").partner_school is None
    assert SchoolTeacher.objects.filter(school=school, teacher=teacher).exists()


def test_link_tool_adds_alias_and_links(as_user, admin, teacher):
    school = School.objects.create(name="Iftixor school")
    JournalClass.objects.create(teacher=teacher, name="8-A", school="Iftixor")
    assert [r["text"] for r in unlinked_names()] == ["Iftixor"]

    resp = as_user(admin).post("/api/schools/link/", {"variants": ["Iftixor"], "school": school.id}, format="json")
    assert resp.status_code == 200 and resp.data["classes"] == 1
    school.refresh_from_db()
    assert "Iftixor" in school.aliases
    assert unlinked_names() == []


def test_link_tool_can_create_school(as_user, admin, teacher):
    JournalClass.objects.create(teacher=teacher, name="9-A", school="Virtus international school")
    resp = as_user(admin).post("/api/schools/link/", {"variants": ["Virtus international school"]}, format="json")
    assert resp.status_code == 200
    assert JournalClass.objects.get().partner_school.name == "Virtus international school"


def test_alias_cannot_belong_to_two_schools(as_user, admin):
    School.objects.create(name="Cambridge", aliases=["Kembrij"])
    resp = as_user(admin).post("/api/schools/", {"name": "Boshqa", "aliases": ["kembrij"]}, format="json")
    assert resp.status_code == 400


def test_new_class_is_attached_automatically(as_user, teacher):
    school = School.objects.create(name="Cambridge", aliases=["Cambridge (2soat: 8-9-soat)"])
    resp = as_user(teacher).post("/api/journal/classes/", {"name": "7-A", "school": "cambridge"}, format="json")
    assert resp.status_code == 201
    assert JournalClass.objects.get().partner_school == school
    assert SchoolTeacher.objects.filter(school=school, teacher=teacher).exists()


def test_picking_partner_school_sets_name(as_user, teacher):
    school = School.objects.create(name="Tafakkur")
    resp = as_user(teacher).post("/api/journal/classes/", {"name": "8-B", "partner_school": school.id}, format="json")
    assert resp.status_code == 201
    assert resp.data["school"] == "Tafakkur" and resp.data["partner_school_name"] == "Tafakkur"


def _class_with_data(teacher, school):
    """4 pupils, 2 lesson days. Averages: 5.0, 4.0 (4+4), 3.0 (2+4), 2.0
    -> passing (>=2.5): 3/4, quality (>=3.5): 2/4. Absences: 1 sababli +
    2 sababsiz over 4 x 2 = 8 student-days -> attendance 62.5%."""
    jc = JournalClass.objects.create(teacher=teacher, name="7-A", school=school.name)
    kids = [Student.objects.create(journal_class=jc, full_name=f"O'quvchi {i}", order=i) for i in range(4)]
    d1 = ClassDay.objects.create(journal_class=jc, date=date(2026, 9, 10), chorak=1)
    d2 = ClassDay.objects.create(journal_class=jc, date=date(2026, 10, 10), chorak=1)
    for kid, marks in zip(kids, [(5,), (4, 4), (2, 4), (2,)]):
        for day, m in zip((d1, d2), marks):
            GradeEntry.objects.create(student=kid, day=day, mark=m)
    AttendanceEntry.objects.create(student=kids[3], day=d1, status="s")
    AttendanceEntry.objects.create(student=kids[3], day=d2, status="n")
    AttendanceEntry.objects.create(student=kids[2], day=d2, status="n")
    AttendanceEntry.objects.create(student=kids[1], day=d2, status="k")
    return jc


def test_stats_formulas(as_user, admin, teacher):
    school = School.objects.create(name="Sodiq")
    _class_with_data(teacher, school)
    data = as_user(admin).get("/api/schools/stats/overview/").data
    row = next(r for r in data["schools"] if r["id"] == school.id)
    assert row["students"] == 4 and row["days"] == 2
    assert row["avg_mark"] == round((5 + 4 + 4 + 2 + 4 + 2) / 6, 2)
    assert row["uzlashtirish"] == 75.0
    assert row["sifat"] == 50.0
    assert row["attendance"] == 62.5
    assert (row["abs_s"], row["abs_n"], row["late"]) == (1, 2, 1)
    assert {t["month"] for t in data["trend"]} == {"2026-09", "2026-10"}


def test_school_detail_stats_and_attention(as_user, admin, teacher):
    school = School.objects.create(name="Sodiq")
    _class_with_data(teacher, school)
    data = as_user(admin).get(f"/api/schools/stats/school/{school.id}/").data
    assert data["teachers"][0]["name"] == teacher.name
    assert data["classes"][0]["uzlashtirish"] == 75.0
    flagged = {r["name"]: r for r in data["attention"]}
    assert "O'quvchi 3" in flagged and "low_mark" in flagged["O'quvchi 3"]["reasons"]


def test_teacher_cannot_see_school_overview_but_sees_own_classes(as_user, teacher, make_user):
    school = School.objects.create(name="Sodiq")
    _class_with_data(teacher, school)
    other = make_user("other@example.com", approved=True)
    JournalClass.objects.create(teacher=other, name="9-A", school="Sodiq")
    assert as_user(teacher).get("/api/schools/stats/overview/").status_code == 403
    rows = as_user(teacher).get("/api/schools/stats/classes/").data
    assert [r["name"] for r in rows] == ["7-A"]
    # Teachers see the brief list (for the journal's school picker) only.
    listed = as_user(teacher).get("/api/schools/").data["results"]
    assert listed and "director" not in listed[0]


def test_observer_reads_but_cannot_edit(jwt_as, observer):
    School.objects.create(name="Sodiq")
    client = jwt_as(observer)
    assert client.get("/api/schools/stats/overview/").status_code == 200
    assert client.get("/api/schools/directory/").status_code == 200
    assert client.post("/api/schools/", {"name": "Yangi"}, format="json").status_code == 403


def test_directory_search(as_user, admin, teacher):
    school = School.objects.create(name="Sodiq")
    _class_with_data(teacher, school)
    data = as_user(admin).get("/api/schools/directory/", {"q": "O'quvchi 3", "school": school.id}).data
    assert data["count"] == 1
    row = data["results"][0]
    assert row["school"] == "Sodiq" and row["avg_mark"] == 2.0 and row["abs_n"] == 1


def test_student_cannot_reach_schools_api(jwt_as, student):
    assert jwt_as(student).get("/api/schools/").status_code == 403


def test_stats_refresh_right_after_linking(as_user, admin, teacher):
    JournalClass.objects.create(teacher=teacher, name="7-A", school="Iftixor")
    school = School.objects.create(name="Iftixor school")
    client = as_user(admin)
    before = client.get("/api/schools/stats/overview/").data
    assert next(r for r in before["schools"] if r["id"] == school.id)["classes"] == 0
    client.post("/api/schools/link/", {"variants": ["Iftixor"], "school": school.id}, format="json")
    after = client.get("/api/schools/stats/overview/").data
    assert next(r for r in after["schools"] if r["id"] == school.id)["classes"] == 1
