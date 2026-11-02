"""O'quv yillari (schools.AcademicYear): every journal class belongs to one,
the lists and statistics show one year at a time — the current one unless
?year= picks another — and the administration adds years and picks the
current one."""

from datetime import date

import pytest

from journal.models import ClassDay, JournalClass
from schools.models import AcademicYear, school_year_of

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
