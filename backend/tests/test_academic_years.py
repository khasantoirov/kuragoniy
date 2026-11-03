"""O'quv yillari (schools.AcademicYear): every journal class belongs to one,
the lists and statistics show one year at a time — the current one unless
?year= picks another — and the administration adds years and picks the
current one."""

from datetime import date

import pytest

from journal.models import ClassDay, JournalClass
from schools.models import AcademicYear, School, SchoolYear, school_year_of

pytestmark = pytest.mark.django_db


@pytest.fixture
def years():
    this = AcademicYear.current()
    last = AcademicYear.objects.create(start_year=this.start_year - 1)
    return {"this": this, "last": last}


def test_school_year_starts_in_august():
    assert school_year_of(date(2026, 8, 25)) == 2026
    assert school_year_of(date(2027, 5, 20)) == 2026
    assert school_year_of(date(2027, 7, 31)) == 2026


def test_new_classes_go_to_the_current_year(as_user, teacher, years):
    resp = as_user(teacher).post("/api/journal/classes/", {"school": "1-maktab", "name": "9-B"}, format="json")
    assert resp.status_code == 201
    assert (resp.data["year"], resp.data["year_name"]) == (years["this"].id, years["this"].name)


def test_a_past_year_takes_no_new_class(as_user, teacher, years):
    resp = as_user(teacher).post("/api/journal/classes/", {"school": "1-maktab", "name": "9-B", "year": years["last"].id}, format="json")
    assert resp.status_code == 400


def test_lists_show_one_year_at_a_time(as_user, teacher, admin, journal_class, years):
    old = JournalClass.objects.create(teacher=teacher, name="7-A", school="1-maktab", year=years["last"])
    api = as_user(teacher)
    assert [c["id"] for c in api.get("/api/journal/classes/").data["results"]] == [journal_class.id]
    assert [c["id"] for c in api.get(f"/api/journal/classes/?year={years['last'].id}").data["results"]] == [old.id]
    # a class is still reachable by id whatever the year
    assert api.get(f"/api/journal/classes/{old.id}/grid/").status_code == 200
    rows = as_user(admin).get("/api/schools/stats/classes/").data
    assert {r["class_id"] for r in rows} == {journal_class.id}
    rows = as_user(admin).get(f"/api/schools/stats/classes/?year={years['last'].id}").data
    assert {r["class_id"] for r in rows} == {old.id}


def test_administration_adds_a_year_and_makes_it_current(as_user, admin, teacher, years):
    api = as_user(admin)
    resp = api.post("/api/schools/years/")
    assert resp.status_code == 201 and resp.data["start_year"] == years["this"].start_year + 1
    nxt = AcademicYear.objects.get(pk=resp.data["id"])
    assert api.post(f"/api/schools/years/{nxt.id}/").status_code == 200
    assert AcademicYear.current() == nxt
    assert list(AcademicYear.objects.filter(is_current=True)) == [nxt]
    listed = as_user(teacher).get("/api/schools/years/").data
    assert [y["name"] for y in listed] == [nxt.name, years["this"].name, years["last"].name]
    # teachers only look
    assert as_user(teacher).post("/api/schools/years/").status_code == 403


def test_only_an_empty_past_year_can_be_removed(as_user, admin, teacher, years):
    JournalClass.objects.create(teacher=teacher, name="7-A", year=years["last"])
    api = as_user(admin)
    assert api.delete(f"/api/schools/years/{years['last'].id}/").status_code == 400
    assert api.delete(f"/api/schools/years/{years['this'].id}/").status_code == 400
    spare = AcademicYear.objects.create(start_year=years["this"].start_year + 3)
    assert api.delete(f"/api/schools/years/{spare.id}/").status_code == 204


def test_migration_puts_each_class_in_its_first_lessons_year(teacher, years):
    """journal.0009's data step: lessons from last May → last year; no
    lessons yet → the year it was made in (today's)."""
    import importlib

    from django.apps import apps

    migration = importlib.import_module("journal.migrations.0009_journalclass_year")
    may = JournalClass.objects.create(teacher=teacher, name="6-A")
    ClassDay.objects.create(journal_class=may, date=date(years["this"].start_year, 5, 12), chorak=4)
    empty = JournalClass.objects.create(teacher=teacher, name="6-B")
    JournalClass.objects.filter(pk__in=[may.pk, empty.pk]).update(year=None)
    migration.assign_years(apps, None)
    may.refresh_from_db()
    empty.refresh_from_db()
    assert (may.year, empty.year) == (years["last"], years["this"])
    assert AcademicYear.current() == years["this"]


# ── Partner schools year by year (schools.SchoolYear) ──

def _school(api, name="Sodiq School"):
    resp = api.post("/api/schools/", {"name": name}, format="json")
    assert resp.status_code == 201
    return School.objects.get(pk=resp.data["id"])


def test_a_new_school_is_a_partner_from_this_year_on(as_user, admin, years):
    nxt = AcademicYear.objects.create(start_year=years["this"].start_year + 1)
    school = _school(as_user(admin))
    assert dict(school.school_years.values_list("year_id", "is_active")) == {years["this"].id: True, nxt.id: True}


def test_a_year_by_year_partnership(as_user, admin, teacher, years):
    api = as_user(admin)
    school = _school(api)
    # last year: not a partner yet, then marked as one — School.is_active is this year's
    resp = api.post(f"/api/schools/{school.id}/year-active/", {"year": years["last"].id, "is_active": True}, format="json")
    assert resp.status_code == 200
    school.refresh_from_db()
    assert school.is_active
    api.post(f"/api/schools/{school.id}/year-active/", {"year": years["this"].id, "is_active": False}, format="json")
    school.refresh_from_db()
    assert not school.is_active
    detail = api.get(f"/api/schools/{school.id}/").data
    assert {y["name"]: y["is_active"] for y in detail["years"]} == {years["this"].name: False, years["last"].name: True}
    # Statistika lists the partners of the year in view
    names = lambda q: [r["name"] for r in api.get(f"/api/schools/stats/overview/{q}").data["rows"]]
    assert "Sodiq School" not in names("")
    assert "Sodiq School" in names(f"?year={years['last'].id}")
    # teachers only look
    assert as_user(teacher).post(f"/api/schools/{school.id}/year-active/", {"year": years["last"].id, "is_active": False}, format="json").status_code == 403


def test_a_new_year_keeps_the_partners_and_making_it_current_follows_them(as_user, admin, years):
    api = as_user(admin)
    stays, leaves = _school(api, "Stays"), _school(api, "Leaves")
    nxt = AcademicYear.objects.get(pk=api.post("/api/schools/years/").data["id"])
    assert set(SchoolYear.objects.filter(year=nxt, is_active=True).values_list("school__name", flat=True)) == {"Stays", "Leaves"}
    api.post(f"/api/schools/{leaves.id}/year-active/", {"year": nxt.id, "is_active": False}, format="json")
    leaves.refresh_from_db()
    assert leaves.is_active  # still a partner this year
    api.post(f"/api/schools/years/{nxt.id}/")
    stays.refresh_from_db()
    leaves.refresh_from_db()
    assert (stays.is_active, leaves.is_active) == (True, False)


def test_a_school_page_shows_one_years_teachers(as_user, admin, teacher, make_user, years):
    api = as_user(admin)
    school = _school(api)
    old_hand = make_user("old-hand@example.com", approved=True)
    JournalClass.objects.create(teacher=old_hand, name="9-A", partner_school=school, year=years["last"])
    JournalClass.objects.create(teacher=teacher, name="8-A", partner_school=school)
    now = {t["id"] for t in api.get(f"/api/schools/{school.id}/").data["teachers"]}
    then = {t["id"] for t in api.get(f"/api/schools/{school.id}/?year={years['last'].id}").data["teachers"]}
    assert (now, then) == ({teacher.id}, {old_hand.id})
