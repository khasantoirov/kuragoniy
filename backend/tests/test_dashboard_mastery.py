"""GET /api/dashboard/mastery/ — the org -> school -> class mastery
breakdown behind the Statistika page's "O'quv jarayoni" card.

The point of this endpoint is that every level (org/school/class) is a
re-grouping of one shared set of per-student averages, so it can never
disagree with itself or with /summary/'s single-scope figures — most of
these tests exist to pin that invariant down, not just to check a
particular number.
"""

import pytest

from accounts.models import User
from journal.models import AttendanceEntry, ClassDay, GradeEntry, JournalClass, Student
from journal.schools import BLANK_SCHOOL_KEY, normalize_school

pytestmark = pytest.mark.django_db

URL = "/api/dashboard/mastery/"


def make_class(teacher, name="8-A", school=""):
    return JournalClass.objects.create(teacher=teacher, name=name, school=school)


def make_student(journal_class, name="O'quvchi", active=True):
    return Student.objects.create(journal_class=journal_class, full_name=name, active=active)


def make_day(journal_class, date, chorak=1):
    return ClassDay.objects.create(journal_class=journal_class, date=date, chorak=chorak)


def grade(student, day, mark):
    return GradeEntry.objects.create(student=student, day=day, mark=mark)


# ── Access & isolation ──────────────────────────────────────

def test_unapproved_teacher_cannot_access(as_user, unapproved_teacher):
    resp = as_user(unapproved_teacher).get(URL)
    assert resp.status_code == 403


def test_teacher_scope_excludes_other_teachers_classes(as_user, teacher, make_user):
    other = make_user("other-mastery@example.com", approved=True)
    other_class = make_class(other, school="Other school")
    make_student(other_class)

    resp = as_user(teacher).get(URL)
    assert resp.status_code == 200
    assert resp.data["totals"]["total_students"] == 0


def test_class_param_outside_scope_is_404(as_user, teacher, make_user):
    other = make_user("other-mastery2@example.com", approved=True)
    other_class = make_class(other)

    resp = as_user(teacher).get(URL, {"class": other_class.id})
    assert resp.status_code == 404


def test_school_param_outside_scope_is_404(as_user, teacher):
    resp = as_user(teacher).get(URL, {"school": "nonexistent-school"})
    assert resp.status_code == 404


def test_teacher_cannot_see_another_teachers_school_via_teacher_param(as_user, teacher, make_user):
    other = make_user("other-mastery3@example.com", approved=True)
    make_class(other, school="Shared Name")
    mine = make_class(teacher, school="Shared Name")
    make_student(mine)

    # Passing ?teacher=<other> as a non-admin must not widen the scope.
    resp = as_user(teacher).get(URL, {"teacher": other.id})
    assert resp.status_code == 200
    assert resp.data["totals"]["total_students"] == 1


def test_admin_gets_org_wide_scope(as_user, admin, teacher, make_user):
    other = make_user("t2-mastery@example.com", approved=True)
    c1 = make_class(teacher, school="A")
    c2 = make_class(other, school="B")
    make_student(c1)
    make_student(c2)

    resp = as_user(admin).get(URL)
    assert resp.status_code == 200
    assert resp.data["totals"]["total_students"] == 2
    assert resp.data["totals"]["total_classes"] == 2


def test_boshliq_and_dev_superuser_get_admin_scope(as_user, make_user, dev_superuser, teacher):
    boshliq = make_user("boshliq-mastery@example.com", role=User.Role.BOSHLIQ, approved=True)
    make_class(teacher)

    for user in (boshliq, dev_superuser):
        resp = as_user(user).get(URL)
        assert resp.status_code == 200
        assert resp.data["totals"]["total_classes"] == 1


# ── Anti-divergence: same numbers as /summary/'s _mastery_bands ────

@pytest.mark.parametrize("chorak", ["1", "2", "3", "4", "u"])
def test_totals_match_summary_mastery_for_same_scope(as_user, teacher, chorak):
    jc = make_class(teacher, school="25-maktab")
    day1 = make_day(jc, "2026-09-01", chorak=1)
    day2 = make_day(jc, "2026-09-08", chorak=2)
    s1 = make_student(jc, "S1")
    s2 = make_student(jc, "S2")
    grade(s1, day1, 5)
    grade(s1, day2, 4)
    grade(s2, day1, 2)

    summary = as_user(teacher).get("/api/dashboard/summary/", {"chorak": chorak}).data
    mastery_resp = as_user(teacher).get(URL, {"chorak": chorak}).data

    sm = summary["journal"]["mastery"]
    tm = mastery_resp["totals"]
    for key in ("good", "mid", "bad", "ungraded", "class_avg", "class_pct"):
        assert tm[key] == sm[key], key


def test_school_row_equals_mastery_bands_for_its_own_classes(as_user, admin, teacher, make_user):
    other = make_user("t2-rollup@example.com", approved=True)
    c1 = make_class(teacher, school="25-maktab")
    c2 = make_class(other, school="14-maktab")
    day = make_day(c1, "2026-09-01")
    s1 = make_student(c1, "S1")
    s2 = make_student(c1, "S2")
    grade(s1, day, 5)
    grade(s2, day, 2)
    day2 = make_day(c2, "2026-09-01")
    s3 = make_student(c2, "S3")
    grade(s3, day2, 4)

    resp = as_user(admin).get(URL)
    rows = {r["key"]: r for r in resp.data["breakdown"]["rows"]}
    assert rows["25-maktab"]["good"] == 1
    assert rows["25-maktab"]["bad"] == 1
    assert rows["14-maktab"]["mid"] == 1

    # Roll-up identity: totals == sum of the school rows.
    totals = resp.data["totals"]
    assert sum(r["good"] for r in rows.values()) == totals["good"]
    assert sum(r["mid"] for r in rows.values()) == totals["mid"]
    assert sum(r["bad"] for r in rows.values()) == totals["bad"]
    assert sum(r["ungraded"] for r in rows.values()) == totals["ungraded"]


def test_school_average_is_mean_over_students_not_over_classes(as_user, admin, teacher, make_user):
    """One school, two classes: class A has 1 student averaging 5.0,
    class B has 3 students averaging 3.0. The school average must be the
    mean over all 4 students (3.5), not the mean of the two class means
    (4.0) — averaging averages would silently let a small class outvote
    a large one."""
    other = make_user("t2-weighted@example.com", approved=True)
    a = make_class(teacher, name="A", school="Bitta maktab")
    b = make_class(other, name="B", school="Bitta maktab")
    day_a = make_day(a, "2026-09-01")
    day_b = make_day(b, "2026-09-01")

    grade(make_student(a, "A1"), day_a, 5)
    for name in ("B1", "B2", "B3"):
        grade(make_student(b, name), day_b, 3)

    # A single school in the whole scope makes the org-level breakdown
    # collapse straight to comparing classes (see the "Maktab bittagina"
    # edge case), so the roll-up is checked directly via ?school=.
    resp = as_user(admin).get(URL, {"school": "bitta-maktab"})
    assert resp.data["totals"]["class_avg"] == 3.5


def test_class_level_totals_match_the_class_row_at_org_level(as_user, admin, teacher):
    jc = make_class(teacher, school="Maktab X")
    day = make_day(jc, "2026-09-01")
    grade(make_student(jc, "S1"), day, 5)
    grade(make_student(jc, "S2"), day, 3)

    class_scope = as_user(admin).get(URL, {"class": jc.id}).data["totals"]
    # With only one school, org level auto-collapses to comparing classes.
    org_rows = {r["key"]: r for r in as_user(admin).get(URL).data["breakdown"]["rows"]}
    row = org_rows[str(jc.id)]
    for key in ("good", "mid", "bad", "ungraded", "class_avg", "class_pct"):
        assert class_scope[key] == row[key]


# ── Coverage invariant ──────────────────────────────────────

def test_graded_plus_ungraded_equals_total_students_everywhere(as_user, admin, teacher, make_user):
    other = make_user("t2-coverage@example.com", approved=True)
    c1 = make_class(teacher, school="M1")
    c2 = make_class(other, school="M2")
    day1 = make_day(c1, "2026-09-01")
    day2 = make_day(c2, "2026-09-01")
    grade(make_student(c1, "Graded"), day1, 4)
    make_student(c1, "Ungraded1")
    make_student(c2, "Ungraded2")
    grade(make_student(c2, "Graded2"), day2, 5)

    resp = as_user(admin).get(URL).data
    totals = resp["totals"]
    assert totals["graded_students"] + totals["ungraded"] == totals["total_students"]
    for row in resp["breakdown"]["rows"]:
        assert row["graded_students"] + row["ungraded"] == row["total_students"]


def test_coverage_pct_and_thin_flag(as_user, teacher):
    jc = make_class(teacher, school="Thin school")
    day = make_day(jc, "2026-09-01")
    grade(make_student(jc, "Graded"), day, 5)
    for i in range(5):
        make_student(jc, f"Ungraded{i}")  # 1 of 6 graded -> ~17% coverage

    resp = as_user(teacher).get(URL).data["totals"]
    assert resp["coverage_pct"] == 17
    assert resp["thin"] is True


def test_class_avg_is_none_not_zero_when_nobody_is_graded(as_user, teacher):
    jc = make_class(teacher)
    make_student(jc)
    resp = as_user(teacher).get(URL).data["totals"]
    assert resp["class_avg"] is None
    assert resp["class_pct"] is None
    assert resp["thin"] is False  # "no data" is its own state, not "thin data"


def test_coverage_pct_is_none_with_zero_students(as_user, teacher):
    resp = as_user(teacher).get(URL).data["totals"]
    assert resp["coverage_pct"] is None
    assert resp["total_students"] == 0


# ── School key normalisation ─────────────────────────────────

@pytest.mark.parametrize("raw,expected", [
    ("25-maktab", "25-maktab"),
    ("25 maktab", "25-maktab"),
    ("  25   Maktab  ", "25-maktab"),
    ("25—maktab", "25-maktab"),
    ("26-maktab", "26-maktab"),
    ("", ""),
    ("   ", ""),
])
def test_normalize_school_pure(raw, expected):
    assert normalize_school(raw) == expected


def test_differently_spelled_schools_merge_but_distinct_ones_do_not(as_user, admin, teacher, make_user):
    t2 = make_user("t2-spelling@example.com", approved=True)
    t3 = make_user("t3-spelling@example.com", approved=True)
    make_class(teacher, name="A", school="25-maktab")
    make_class(t2, name="B", school="25 maktab")
    make_class(t3, name="C", school="26-maktab")

    resp = as_user(admin).get(URL).data
    keys = {r["key"] for r in resp["breakdown"]["rows"]}
    assert keys == {"25-maktab", "26-maktab"}

    merged = next(r for r in resp["breakdown"]["rows"] if r["key"] == "25-maktab")
    assert merged["classes"] == 2
    assert sorted(merged["variants"]) == ["25 maktab", "25-maktab"]

    distinct = next(r for r in resp["breakdown"]["rows"] if r["key"] == "26-maktab")
    assert distinct["variants"] == []


def test_blank_school_is_its_own_bucket_and_is_sorted_last(as_user, admin, teacher, make_user):
    other = make_user("t2-blank@example.com", approved=True)
    named = make_class(teacher, school="Named school")
    blank = make_class(other, school="")
    day_n = make_day(named, "2026-09-01")
    day_b = make_day(blank, "2026-09-01")
    grade(make_student(named, "S1"), day_n, 5)
    grade(make_student(blank, "S2"), day_b, 5)

    resp = as_user(admin).get(URL).data
    rows = resp["breakdown"]["rows"]
    assert rows[-1]["key"] == BLANK_SCHOOL_KEY
    assert rows[-1]["label"] is None

    filtered = as_user(admin).get(URL, {"school": BLANK_SCHOOL_KEY}).data
    assert filtered["totals"]["total_students"] == 1
    assert filtered["scope"]["level"] == "school"
    assert filtered["breakdown"]["level"] == "class"  # comparing that school's own classes


# ── Attendance: the cross-multiplication fix ─────────────────

def test_attendance_possible_does_not_cross_multiply_classes(as_user, admin, teacher, make_user):
    other = make_user("t2-attendance@example.com", approved=True)
    a = make_class(teacher, school="A school")
    b = make_class(other, school="B school")
    a_days = [make_day(a, f"2026-09-0{i}") for i in (1, 2)]
    b_days = [make_day(b, f"2026-09-0{i}") for i in (1, 2)]
    a_students = [make_student(a, f"A{i}") for i in (1, 2)]
    b_students = [make_student(b, f"B{i}") for i in (1, 2)]

    # 2 absences, both in class A. possible = 2*2 (A) + 2*2 (B) = 8.
    AttendanceEntry.objects.create(student=a_students[0], day=a_days[0], status=AttendanceEntry.Status.SABABLI)
    AttendanceEntry.objects.create(student=a_students[0], day=a_days[1], status=AttendanceEntry.Status.SABABSIZ)

    resp = as_user(admin).get(URL).data["totals"]
    assert resp["attendance_rate_pct"] == 75.0  # not 87.5 (the pre-fix, cross-multiplied value)


def test_kech_does_not_count_as_absence(as_user, teacher):
    jc = make_class(teacher)
    day = make_day(jc, "2026-09-01")
    student = make_student(jc, "S1")
    AttendanceEntry.objects.create(student=student, day=day, status=AttendanceEntry.Status.KECH)

    resp = as_user(teacher).get(URL).data["totals"]
    assert resp["attendance_rate_pct"] == 100.0


# ── Trend ─────────────────────────────────────────────────────

def test_quarter_trend_covers_all_four_choraks_in_order(as_user, teacher):
    jc = make_class(teacher)
    s = make_student(jc, "S1")
    for q in (1, 2, 3, 4):
        grade(s, make_day(jc, f"2026-0{q}-01", chorak=q), q + 1)  # marks 2..5

    resp = as_user(teacher).get(URL, {"period": "quarter"}).data["trend"]
    assert [p["quarter"] for p in resp["points"]] == [1, 2, 3, 4]
    assert [p["good"] + p["mid"] + p["bad"] for p in resp["points"]] == [1, 1, 1, 1]


def test_quarter_trend_ignores_the_chorak_filter_and_flags_it(as_user, teacher):
    jc = make_class(teacher)
    s = make_student(jc, "S1")
    grade(s, make_day(jc, "2026-01-05", chorak=1), 5)
    grade(s, make_day(jc, "2026-04-05", chorak=2), 3)

    resp = as_user(teacher).get(URL, {"chorak": "1", "period": "quarter"}).data["trend"]
    assert len(resp["points"]) == 4  # not narrowed to chorak 1's single point
    assert resp["ignores_chorak_filter"] is True


def test_month_trend_zero_fills_gaps_between_graded_months(as_user, teacher):
    jc = make_class(teacher)
    s = make_student(jc, "S1")
    grade(s, make_day(jc, "2026-01-15", chorak=1), 5)
    grade(s, make_day(jc, "2026-03-15", chorak=2), 5)  # February has no grades

    resp = as_user(teacher).get(URL, {"period": "month"}).data["trend"]["points"]
    months = [(p["year"], p["month"]) for p in resp]
    assert months == [(2026, 1), (2026, 2), (2026, 3)]
    feb = resp[1]
    assert feb["graded_students"] == 0
    assert feb["class_avg"] is None


def test_week_trend_iso_week_matches_isocalendar(as_user, teacher):
    from datetime import date

    jc = make_class(teacher)
    s = make_student(jc, "S1")
    d = date(2026, 1, 1)  # near a year boundary — the off-by-one risk case
    grade(s, make_day(jc, d.isoformat(), chorak=1), 5)

    resp = as_user(teacher).get(URL, {"period": "week"}).data["trend"]["points"]
    iso_year, iso_week, _ = d.isocalendar()
    assert any(p["year"] == iso_year and p["week"] == iso_week for p in resp)


def test_reference_trend_shares_the_primary_series_bucket_keys(as_user, admin, teacher, make_user):
    """A school whose own grading history starts later than the org's
    must still get a reference (org-average) line that lines up bucket-
    for-bucket with its own — not a shorter or offset series computed
    over only the org's full span, which would silently misalign the
    two lines position-by-position instead of matching key-by-key."""
    other = make_user("t2-align@example.com", approved=True)
    early = make_class(other, school="Early school")
    grade(make_student(early, "E1"), make_day(early, "2026-01-15", chorak=1), 5)

    late = make_class(teacher, school="Late school")
    grade(make_student(late, "L1"), make_day(late, "2026-03-15", chorak=2), 5)

    resp = as_user(admin).get(URL, {"school": "late-school", "period": "month"}).data["trend"]
    primary_keys = [p["key"] for p in resp["points"]]
    reference_keys = [p["key"] for p in resp["reference"]]
    assert primary_keys == reference_keys
    assert primary_keys[0] == "2026-01"  # spans back to the org's earliest month, not just Late's own


# ── Anti-N+1 ──────────────────────────────────────────────────

def test_query_count_is_flat_regardless_of_school_count(as_user, admin, django_assert_max_num_queries, make_user):
    def seed(n_schools, n_classes_per_school):
        for i in range(n_schools):
            t = make_user(f"scale-{n_schools}-{i}@example.com", approved=True)
            for j in range(n_classes_per_school):
                jc = make_class(t, name=f"{i}-{j}", school=f"School {i}")
                day = make_day(jc, "2026-09-01")
                for k in range(3):
                    grade(make_student(jc, f"S{i}{j}{k}"), day, 4)

    seed(2, 2)
    with django_assert_max_num_queries(20):
        as_user(admin).get(URL)

    seed(6, 2)
    with django_assert_max_num_queries(20):
        as_user(admin).get(URL)
