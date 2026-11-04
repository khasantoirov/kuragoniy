"""O'qituvchilar jurnali: each teacher's card — "Ism Familiya", photo, and per
school the classes and pupils, per grade."""

import pytest
from rest_framework.test import APIClient

from journal.models import JournalClass, Student

pytestmark = pytest.mark.django_db
URL = "/api/journal/grants/teachers/"


def _class(teacher, name, school, pupils, gone=0):
    jc = JournalClass.objects.create(teacher=teacher, name=name, school=school)
    for i in range(pupils):
        Student.objects.create(journal_class=jc, full_name=f"O'quvchi {i}", order=i)
    for i in range(gone):  # removed from the roster: not counted
        Student.objects.create(journal_class=jc, full_name=f"Ketgan {i}", order=100 + i, active=False)
    return jc


def test_teacher_card_sums_schools_grades_and_pupils(admin, teacher):
    teacher.name = "Toirov Hasan"  # an old one-field name, surname first
    teacher.save(update_fields=["name"])
    _class(teacher, "7-A", "Sodiq School", 20, gone=2)
    _class(teacher, "7-B", "Sodiq School", 18)
    _class(teacher, "10-A", "Sodiq School", 25)
    _class(teacher, "8 Sydney", "Iftixor", 30)
    _class(teacher, "Tayyorlov", "Iftixor", 5)

    c = APIClient()
    c.force_authenticate(admin)
    row = next(r for r in c.get(URL).data if r["id"] == teacher.id)

    assert row["name"] == "Hasan Toirov"  # first name first
    assert row["photo"] is None
    by_school = {s["name"]: s for s in row["schools"]}
    assert [s["name"] for s in row["schools"]] == ["Iftixor", "Sodiq School"]

    sodiq = by_school["Sodiq School"]
    assert (sodiq["classes"], sodiq["students"]) == (3, 63)
    assert sodiq["grades"] == [
        {"grade": 7, "classes": 2, "students": 38},
        {"grade": 10, "classes": 1, "students": 25},
    ]
    iftixor = by_school["Iftixor"]
    assert (iftixor["classes"], iftixor["students"]) == (2, 35)
    assert iftixor["grades"] == [
        {"grade": 8, "classes": 1, "students": 30},
        {"grade": None, "classes": 1, "students": 5},  # no number in the name: listed last
    ]
    assert {cl["label"]: cl["students"] for cl in row["classes"]}["Sodiq School | 7-A"] == 20


def test_split_name_is_shown_as_stored(admin, teacher):
    teacher.first_name, teacher.last_name = "Aziz", "Karimov"
    teacher.save()
    c = APIClient()
    c.force_authenticate(admin)
    row = next(r for r in c.get(URL).data if r["id"] == teacher.id)
    assert row["name"] == "Aziz Karimov" and row["schools"] == []


def test_teacher_cannot_list_teachers(teacher):
    c = APIClient()
    c.force_authenticate(teacher)
    assert c.get(URL).status_code == 403
