"""GET /api/dashboard/summary/ — the new admin/teacher analytics dashboard's
one aggregation endpoint (see dashboard/views.py). Covers the admin-vs-
teacher payload shape split, the journal scoping boundary (a teacher must
never see another teacher's classes), and the exact numeric semantics ported
from the frontend's masteryStats.ts (avg-mark band thresholds) and
attendance.ts (which statuses count as absent).
"""

import pytest

from accounts.models import User
from journal.models import AttendanceEntry, ClassDay, GradeEntry, JournalClass, Student
from lessons.models import Lesson

pytestmark = pytest.mark.django_db

URL = "/api/dashboard/summary/"


def make_class(teacher, name="8-A"):
    return JournalClass.objects.create(teacher=teacher, name=name)


def make_student(journal_class, name="O'quvchi", active=True):
    return Student.objects.create(journal_class=journal_class, full_name=name, active=active)


def make_day(journal_class, date, chorak=1):
    return ClassDay.objects.create(journal_class=journal_class, date=date, chorak=chorak)


# ── Access ──────────────────────────────────────────────────

def test_unapproved_teacher_cannot_access_dashboard(as_user, unapproved_teacher):
    resp = as_user(unapproved_teacher).get(URL)
    assert resp.status_code == 403


# ── Payload shape per role ──────────────────────────────────

def test_admin_gets_admin_payload_shape(as_user, admin):
    resp = as_user(admin).get(URL)
    assert resp.status_code == 200
    assert resp.data["role"] == "admin"
    assert "users" in resp.data
    assert "lessons" in resp.data
    assert "engagement" in resp.data
    assert "journal" in resp.data


def test_teacher_gets_teacher_payload_shape_excludes_admin_keys(as_user, teacher):
    resp = as_user(teacher).get(URL)
    assert resp.status_code == 200
    assert resp.data["role"] == "teacher"
    assert "users" not in resp.data
    assert "lessons" not in resp.data
    assert "engagement" not in resp.data
    assert "journal" in resp.data


def test_boshliq_gets_admin_payload_shape(as_user, make_user):
    boshliq = make_user("boshliq-dash@example.com", role=User.Role.BOSHLIQ, approved=True)
    resp = as_user(boshliq).get(URL)
    assert resp.status_code == 200
    assert resp.data["role"] == "admin"


def test_dev_superuser_gets_admin_payload_shape(as_user, dev_superuser):
    resp = as_user(dev_superuser).get(URL)
    assert resp.status_code == 200
    assert resp.data["role"] == "admin"


# ── Journal scoping boundary ────────────────────────────────

def test_teacher_journal_scope_excludes_other_teachers_classes(as_user, teacher, make_user):
    other = make_user("other-teacher@example.com", approved=True)
    other_class = make_class(other)
    make_student(other_class)

    resp = as_user(teacher).get(URL)
    assert resp.status_code == 200
    assert resp.data["journal"]["total_classes"] == 0
    assert resp.data["journal"]["total_students"] == 0


def test_admin_journal_scope_is_org_wide_by_default(as_user, admin, make_user):
    t1 = make_user("t1-dash@example.com", approved=True)
    t2 = make_user("t2-dash@example.com", approved=True)
    make_class(t1)
    make_class(t2)

    resp = as_user(admin).get(URL)
    assert resp.status_code == 200
    assert resp.data["journal"]["total_classes"] == 2


def test_admin_can_scope_to_specific_teacher_via_query_param(as_user, admin, make_user):
    t1 = make_user("t1-scope@example.com", approved=True)
    t2 = make_user("t2-scope@example.com", approved=True)
    make_class(t1)
    make_class(t2)

    resp = as_user(admin).get(URL, {"teacher": t1.id})
    assert resp.status_code == 200
    assert resp.data["journal"]["total_classes"] == 1


# ── Mastery band semantics (ported from masteryStats.ts) ────

def test_mastery_band_counts_against_known_fixture(as_user, teacher):
    jc = make_class(teacher)
    day = make_day(jc, "2026-09-01")

    good = make_student(jc, "Good")  # avg exactly 4.5 -> good, not mid
    GradeEntry.objects.create(student=good, day=day, mark=4)
    day2 = make_day(jc, "2026-09-02")
    GradeEntry.objects.create(student=good, day=day2, mark=5)

    mid = make_student(jc, "Mid")  # avg exactly 3.5 -> mid, not bad
    GradeEntry.objects.create(student=mid, day=day, mark=3)
    GradeEntry.objects.create(student=mid, day=day2, mark=4)

    bad = make_student(jc, "Bad")  # avg 2.0 -> bad
    GradeEntry.objects.create(student=bad, day=day, mark=2)

    make_student(jc, "Ungraded")  # zero grades -> ungraded, not bad

    resp = as_user(teacher).get(URL)
    mastery = resp.data["journal"]["mastery"]
    assert mastery["good"] == 1
    assert mastery["mid"] == 1
    assert mastery["bad"] == 1
    assert mastery["ungraded"] == 1
    assert mastery["class_avg"] == 3.33  # mean of 4.5, 3.5, 2.0 -> 3.333...
    assert mastery["class_pct"] == 67


# ── Attendance rate semantics (ported from attendance.ts's isAbsent) ──

def test_attendance_rate_matches_isAbsent_semantics(as_user, teacher):
    jc = make_class(teacher)
    s1 = make_student(jc, "S1")
    s2 = make_student(jc, "S2")
    day1 = make_day(jc, "2026-09-01")
    day2 = make_day(jc, "2026-09-02")

    # possible = 2 students x 2 days = 4
    AttendanceEntry.objects.create(student=s1, day=day1, status=AttendanceEntry.Status.SABABLI)  # absent
    AttendanceEntry.objects.create(student=s1, day=day2, status=AttendanceEntry.Status.SABABSIZ)  # absent
    AttendanceEntry.objects.create(student=s2, day=day1, status=AttendanceEntry.Status.KECH)  # NOT absent
    # s2/day2 unmarked -> present (no row = present)

    resp = as_user(teacher).get(URL)
    # absent = 2 of 4 possible -> rate = 1 - 2/4 = 50%
    assert resp.data["journal"]["attendance_rate_pct"] == 50.0


def test_attendance_rate_is_none_with_no_data(as_user, teacher):
    make_class(teacher)
    resp = as_user(teacher).get(URL)
    assert resp.data["journal"]["attendance_rate_pct"] is None


# ── Admin-only sections ─────────────────────────────────────

def test_signups_by_day_zero_fills_gaps(as_user, admin):
    from django.utils import timezone

    resp = as_user(admin).get(URL, {"days": 3})
    assert resp.status_code == 200
    trend = resp.data["users"]["signups_by_day"]
    assert len(trend) == 4  # inclusive of both endpoints over a 3-day window
    dates = [row["date"] for row in trend]
    today = timezone.now().date().isoformat()
    assert today in dates


def test_role_breakdown_counts(as_user, admin, make_user):
    make_user("teacher-role@example.com", role=User.Role.TEACHER, approved=True)
    make_user("boshliq-role@example.com", role=User.Role.BOSHLIQ, approved=True)

    resp = as_user(admin).get(URL)
    by_role = {row["role"]: row["count"] for row in resp.data["users"]["by_role"]}
    assert by_role.get("teacher", 0) >= 1
    assert by_role.get("boshliq", 0) == 1
    assert by_role.get("admin", 0) >= 1  # the `admin` fixture itself


def test_pending_approval_count_excludes_admin_and_boshliq(as_user, admin, make_user):
    make_user("pending-teacher@example.com", role=User.Role.TEACHER, approved=False)
    make_user("pending-boshliq@example.com", role=User.Role.BOSHLIQ, approved=False)

    resp = as_user(admin).get(URL)
    assert resp.data["users"]["pending_approval"] == 1


def test_lessons_by_grade_counts(as_user, admin):
    Lesson.objects.create(title="L1", grade="1-2", chorak=1, hafta=1)
    Lesson.objects.create(title="L2", grade="1-2", chorak=1, hafta=2)
    Lesson.objects.create(title="L3", grade="5-6", chorak=1, hafta=1)

    resp = as_user(admin).get(URL)
    by_grade = {row["grade"]: row["count"] for row in resp.data["lessons"]["by_grade"]}
    assert by_grade["1-2"] == 2
    assert by_grade["5-6"] == 1


# ── Lessons section: real content metrics ───────────────────

def test_lessons_by_grade_lists_every_band_including_empty_ones(as_user, admin):
    # After the 7 / 8-9 split, 8-9 has no lessons yet. It must still be a row
    # (count 0) — dropping it made the band look missing instead of unfilled.
    Lesson.objects.create(title="L1", grade="7", chorak=1, hafta=1)

    resp = as_user(admin).get(URL)
    rows = resp.data["lessons"]["by_grade"]
    assert [r["grade"] for r in rows] == ["1-2", "3-4", "5-6", "7", "8-9"]
    assert {r["grade"]: r["count"] for r in rows} == {"1-2": 0, "3-4": 0, "5-6": 0, "7": 1, "8-9": 0}


def test_lessons_by_chorak_is_zero_filled(as_user, admin):
    Lesson.objects.create(title="L1", grade="1-2", chorak=1, hafta=1)
    Lesson.objects.create(title="L2", grade="1-2", chorak=1, hafta=2)
    Lesson.objects.create(title="L3", grade="1-2", chorak=3, hafta=3)

    rows = as_user(admin).get(URL).data["lessons"]["by_chorak"]
    assert {r["chorak"]: r["count"] for r in rows} == {1: 2, 2: 0, 3: 1, 4: 0}


def test_lessons_document_translation_and_experiment_counts(as_user, admin):
    from django.utils import timezone

    from lessons.models import Experiment

    linked = Lesson.objects.create(title="A", grade="1-2", chorak=1, hafta=1, file_url="https://example.com/a.pdf")
    uploaded = Lesson.objects.create(title="B", grade="1-2", chorak=1, hafta=2, file="lesson-files/b.pdf")
    Lesson.objects.create(title="C", grade="1-2", chorak=1, hafta=3)  # no document
    linked.translated_at = timezone.now()
    linked.save()
    Experiment.objects.create(lesson=linked, name="e1")
    Experiment.objects.create(lesson=uploaded, name="e2")
    Experiment.objects.create(lesson=uploaded, name="e3")

    lessons = as_user(admin).get(URL).data["lessons"]
    assert lessons["total"] == 3
    assert lessons["with_document"] == 2      # the link and the upload, not the bare one
    assert lessons["translated"] == 1
    assert lessons["experiments_total"] == 3


# ── Timetable section: weekly load ──────────────────────────

def make_slot(teacher, day, period, span=1, **fields):
    from timetable.models import TimetableSlot

    return TimetableSlot.objects.create(
        teacher=teacher, day_index=day, period_index=period, span=span, **fields
    )


def test_timetable_hours_sum_spans_not_rows(as_user, teacher):
    make_slot(teacher, 0, 1, span=1, sinf="7-A")
    make_slot(teacher, 0, 3, span=3, sinf="8-B")     # three consecutive hours
    make_slot(teacher, 2, 2, span=2, maktab="Maktab 5")

    tt = as_user(teacher).get(URL).data["timetable"]
    assert [row["hours"] for row in tt["by_day"]] == [4, 0, 2, 0, 0]
    assert tt["total_hours"] == 6


def test_timetable_ignores_band_placeholders_and_blank_rows(as_user, teacher):
    make_slot(teacher, 1, 1, sinf="7-A")
    make_slot(teacher, 1, 2, span=4, band=True, sinf="Universitet")   # busy elsewhere, not a lesson
    make_slot(teacher, 1, 6)                                          # blank row

    tt = as_user(teacher).get(URL).data["timetable"]
    assert tt["by_day"][1]["hours"] == 1
    assert tt["total_hours"] == 1


def test_timetable_always_lists_all_five_weekdays(as_user, teacher):
    tt = as_user(teacher).get(URL).data["timetable"]
    assert [row["day_index"] for row in tt["by_day"]] == [0, 1, 2, 3, 4]
    assert tt["total_hours"] == 0


def test_teacher_timetable_is_scoped_to_their_own_week(as_user, teacher, make_user):
    other = make_user("other-tt@example.com", approved=True)
    make_slot(teacher, 0, 1, sinf="mine")
    make_slot(other, 0, 2, span=5, sinf="theirs")

    assert as_user(teacher).get(URL).data["timetable"]["total_hours"] == 1


def test_admin_timetable_is_org_wide_and_can_scope_to_one_teacher(as_user, admin, teacher, make_user):
    other = make_user("other-tt2@example.com", approved=True)
    make_slot(teacher, 0, 1, sinf="a")
    make_slot(other, 0, 2, span=2, sinf="b")

    assert as_user(admin).get(URL).data["timetable"]["total_hours"] == 3
    scoped = as_user(admin).get(URL, {"teacher": other.id}).data["timetable"]
    assert scoped["total_hours"] == 2


# ── Users / engagement additions ────────────────────────────

def test_telegram_and_two_factor_counts(as_user, admin, make_user):
    linked = make_user("tg-linked@example.com", approved=True)
    linked.telegram_linked = True
    linked.save()
    secure = make_user("tfa@example.com", approved=True)
    secure.totp_enabled = True
    secure.save()
    make_user("plain@example.com", approved=True)

    users = as_user(admin).get(URL).data["users"]
    assert users["telegram_linked"] == 1
    assert users["two_factor_enabled"] == 1


@pytest.mark.parametrize("public,private,expected", [
    ("pub", "priv", True),
    ("", "", False),
    ("pub", "", False),   # half a key pair cannot sign anything
])
def test_push_configured_reflects_the_vapid_keys(as_user, admin, settings, public, private, expected):
    settings.VAPID_PUBLIC_KEY = public
    settings.VAPID_PRIVATE_KEY = private

    assert as_user(admin).get(URL).data["engagement"]["push_configured"] is expected


def test_teacher_payload_has_timetable_but_still_no_admin_sections(as_user, teacher):
    data = as_user(teacher).get(URL).data
    assert "timetable" in data
    assert "users" not in data and "lessons" not in data and "engagement" not in data
