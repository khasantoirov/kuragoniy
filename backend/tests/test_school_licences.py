"""Phase 1 of the subscriptions: teacher kinds, school licences (state,
enforcement, reminders) and a school's own ma'muriyat (read-only, scoped)."""

from datetime import date, timedelta

import pytest
from django.utils import timezone

from accounts.models import User
from common.models import PlatformSettings
from journal.models import JournalClass, Student
from schools import licensing
from schools.models import School, SchoolLicense, SchoolManager, SchoolTeacher

pytestmark = pytest.mark.django_db


@pytest.fixture
def school(teacher):
    x = School.objects.create(name="Sodiq School")
    jc = JournalClass.objects.create(teacher=teacher, name="7-A", school="Sodiq School", partner_school=x)
    for i in range(3):
        Student.objects.create(journal_class=jc, full_name=f"O'quvchi {i}", order=i)
    return x


@pytest.fixture
def other_school(make_user):
    y = School.objects.create(name="Iftixor")
    t = make_user("iftixor@example.com", approved=True)
    JournalClass.objects.create(teacher=t, name="8-B", school="Iftixor", partner_school=y)
    return y


def day(n):
    return timezone.localdate() + timedelta(days=n)


# ── teacher kind ──────────────────────────────────────────────

def test_teacher_kind_and_comparison(as_user, admin, teacher, school):
    resp = as_user(admin).post(f"/api/schools/{school.id}/teacher-kind/", {"teacher": teacher.id, "kind": "muhandis"},
                               format="json")
    assert resp.status_code == 200
    assert SchoolTeacher.objects.get(school=school, teacher=teacher).kind == "muhandis"
    page = as_user(admin).get(f"/api/schools/{school.id}/").data
    assert next(t for t in page["teachers"] if t["id"] == teacher.id)["kind"] == "muhandis"
    stats = as_user(admin).get(f"/api/schools/stats/school/{school.id}/").data
    assert [r["id"] for r in stats["by_kind"]] == ["muhandis"] and stats["by_kind"][0]["teachers"] == 1
    cards = as_user(admin).get("/api/journal/grants/teachers/").data
    row = next(r for r in cards if r["id"] == teacher.id)
    assert row["schools"][0]["muhandis"] is True
    assert as_user(admin).post(f"/api/schools/{school.id}/teacher-kind/", {"teacher": teacher.id, "kind": "x"},
                               format="json").status_code == 400
    assert as_user(teacher).post(f"/api/schools/{school.id}/teacher-kind/", {"teacher": teacher.id, "kind": "maktab"},
                                 format="json").status_code == 403


# ── licence states ────────────────────────────────────────────

@pytest.mark.parametrize("plan, start, end, paid, state", [
    ("standart", -10, 100, True, "active"),
    ("standart", -10, 100, False, "unpaid"),
    ("sinov", -1, 30, False, "trial"),
    ("premium", -100, 5, True, "ending"),
    ("standart", -100, -1, True, "expired"),
    ("standart", 3, 100, True, "future"),
])
def test_states(school, plan, start, end, paid, state):
    SchoolLicense.objects.create(school=school, plan=plan, starts_on=day(start), ends_on=day(end), paid=paid)
    assert licensing.status(school)["state"] == state


def test_no_licence_and_usage(school, teacher):
    st = licensing.status(school)
    assert st["state"] == "none" and not st["in_force"]
    assert licensing.usage(school) == {"teachers": 1, "pupils": 3}


def test_admin_adds_licence_no_overlap(as_user, admin, observer, school):
    url = "/api/schools/licenses/"
    body = {"school": school.id, "plan": "standart", "starts_on": str(day(-5)), "ends_on": str(day(200)),
            "pupil_seats": 300, "amount": 4500000, "paid": True}
    resp = as_user(admin).post(url, body, format="json")
    assert resp.status_code == 201, resp.data
    assert resp.data["paid_on"] == str(timezone.localdate())  # paid without a date: today
    clash = as_user(admin).post(url, {**body, "starts_on": str(day(100)), "ends_on": str(day(400))}, format="json")
    assert clash.status_code == 400
    bad = as_user(admin).post(url, {**body, "starts_on": str(day(500)), "ends_on": str(day(450))}, format="json")
    assert bad.status_code == 400
    # the observer reads, can't write
    listing = as_user(observer).get(url).data
    row = next(r for r in listing["schools"] if r["school"]["id"] == school.id)
    assert row["state"] == "active" and row["usage"]["pupils"] == 3 and listing["enforced"] is False
    assert as_user(observer).post(url, body, format="json").status_code == 403

    lic_id = resp.data["id"]
    SchoolLicense.objects.filter(pk=lic_id).update(reminded=[14])
    patched = as_user(admin).patch(f"/api/schools/licenses/{lic_id}/", {"ends_on": str(day(250)), "paid": False},
                                   format="json")
    assert patched.status_code == 200 and patched.data["paid_on"] is None
    assert SchoolLicense.objects.get(pk=lic_id).reminded == []  # new end date: reminders start over
    assert as_user(admin).delete(f"/api/schools/licenses/{lic_id}/").status_code == 204


# ── enforcement ───────────────────────────────────────────────

def _mark(client, jc):
    student = jc.students.first()
    return client.post(f"/api/journal/classes/{jc.id}/bulk-marks/", {
        "date": str(timezone.localdate()), "chorak": 1,
        "marks": [{"student_id": student.id, "mark": 5}]}, format="json")


def test_enforcement_locks_the_journal_only_when_on(as_user, admin, teacher, school):
    jc = JournalClass.objects.get(partner_school=school)
    assert licensing.licence_lock(jc) is None  # off: nothing locked, even with no licence
    assert as_user(admin).post("/api/schools/licenses/enforce/", {"on": True}, format="json").data == {"enforced": True}
    assert PlatformSettings.get().license_enforced
    reason = licensing.licence_lock(jc)
    assert reason and "Sodiq School" in reason
    grid = as_user(teacher).get(f"/api/journal/classes/{jc.id}/grid/").data
    assert grid["lock"]["licence"] == reason
    resp = _mark(as_user(teacher), jc)
    assert resp.status_code == 403 and resp.data.get("code") == "licence"

    # a licence in force opens it again
    SchoolLicense.objects.create(school=school, plan="sinov", starts_on=day(-1), ends_on=day(14))
    assert licensing.licence_lock(jc) is None
    # classes outside any partner school are never locked
    loose = JournalClass.objects.create(teacher=teacher, name="9-C", school="")
    assert licensing.licence_lock(loose) is None
    assert as_user(teacher).post("/api/schools/licenses/enforce/", {"on": False}, format="json").status_code == 403


# ── reminders ─────────────────────────────────────────────────

def test_reminders_once_per_threshold(admin, school, make_user):
    from notifications.models import Notification

    boss = make_user("direktor@example.com", role=User.Role.MAKTAB, approved=True)
    SchoolManager.objects.create(school=school, user=boss)
    lic = SchoolLicense.objects.create(school=school, plan="standart", starts_on=day(-300), ends_on=day(6), paid=True)
    assert licensing.send_reminders() == 1
    lic.refresh_from_db()
    assert lic.reminded == [7, 14]  # 6 days left: the 14- and 7-day ones are due, said once
    assert Notification.objects.filter(user=admin).count() == 1
    assert Notification.objects.filter(user=boss).count() == 1
    assert licensing.send_reminders() == 0  # nothing new
    assert licensing.send_reminders(timezone.localdate() + timedelta(days=4)) == 1  # 2 days left: the 3-day one


# ── a school's own ma'muriyat ─────────────────────────────────

@pytest.fixture
def director(make_user, school):
    boss = make_user("boss@sodiq.uz", role=User.Role.MAKTAB, approved=True)
    SchoolManager.objects.create(school=school, user=boss, position="direktor")
    return boss


def test_director_sees_only_their_school(as_user, director, school, other_school, teacher):
    c = as_user(director)
    me = c.get("/api/accounts/me/").data
    assert me["managed_schools"] == [{"id": school.id, "name": "Sodiq School", "position": "direktor"}]
    assert [s["id"] for s in c.get("/api/schools/").data["results"]] == [school.id]
    page = c.get(f"/api/schools/{school.id}/").data
    assert {t["id"] for t in page["teachers"]} == {teacher.id} and page["licence"]["state"] == "none"
    assert c.get(f"/api/schools/{other_school.id}/").status_code == 404
    assert c.get(f"/api/schools/stats/school/{school.id}/").status_code == 200
    assert c.get(f"/api/schools/stats/school/{other_school.id}/").status_code == 403
    assert c.get("/api/schools/stats/school/none/").status_code == 403
    assert [r["name"] for r in c.get("/api/schools/stats/classes/").data] == ["7-A"]
    # a teacher's journal at their school, read-only
    classes = c.get("/api/journal/classes/", {"teacher": teacher.id}).data
    rows = classes["results"] if isinstance(classes, dict) else classes
    assert [r["name"] for r in rows] == ["7-A"]
    jc = JournalClass.objects.get(partner_school=school)
    grid = c.get(f"/api/journal/classes/{jc.id}/grid/", {"teacher": teacher.id})
    assert grid.status_code == 200 and grid.data["lock"]["owner"] is False


def test_director_writes_nothing(as_user, director, school, teacher):
    c = as_user(director)
    assert c.post(f"/api/schools/{school.id}/add-teacher/", {"teacher": teacher.id}, format="json").status_code == 403
    assert c.post("/api/schools/licenses/", {}, format="json").status_code == 403
    jc = JournalClass.objects.get(partner_school=school)
    assert _mark(c, jc).status_code in (403, 404)
    # their own profile still saves
    assert c.patch("/api/accounts/me/", {"photo": None}, format="json").status_code == 200


def test_admin_creates_and_assigns_a_director(as_user, admin, school):
    resp = as_user(admin).post("/api/accounts/users/create-staff/", {
        "first_name": "Zuhra", "last_name": "Karimova", "role": "maktab", "school": school.id, "position": "zavuch",
    }, format="json")
    assert resp.status_code == 201, resp.data
    person = User.objects.get(pk=resp.data["id"])
    assert person.role == "maktab" and SchoolManager.objects.get(user=person).position == "zavuch"
    assert as_user(admin).post("/api/accounts/users/create-staff/", {"first_name": "Ali", "role": "maktab"},
                               format="json").status_code == 400  # needs a school
    page = as_user(admin).get(f"/api/schools/{school.id}/").data
    assert page["managers"][0]["name"] == "Zuhra Karimova"
    assert as_user(admin).post(f"/api/schools/{school.id}/remove-manager/", {"user": person.id},
                               format="json").status_code == 200
    assert not SchoolManager.objects.exists()
    # not offered as a teacher anywhere
    cards = as_user(admin).get("/api/journal/grants/teachers/").data
    assert person.id not in {r["id"] for r in cards}
