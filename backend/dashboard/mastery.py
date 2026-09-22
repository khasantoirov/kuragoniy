"""Aggregation for the org -> school -> class mastery breakdown
(MasteryBreakdownView) and the shared numeric core behind
DashboardSummaryView's per-scope mastery/attendance figures
(_mastery_bands / _attendance_rate_pct in views.py are thin wrappers
around class_metrics() below).

Every level (org, school, class) is produced by grouping the *same*
per-(class, student) average rows fetched once — never by calling a
per-scope query in a loop. That is what keeps the query count constant
regardless of how many schools or classes exist, and it is also what
makes every level agree exactly: a school's numbers are the roll-up of
its classes' rows, not a separately-computed average.
"""

from collections import defaultdict
from datetime import date, timedelta

from django.db.models import Avg, Count

from journal.models import AttendanceEntry, ClassDay, GradeEntry, JournalClass, Student
from journal.schools import BLANK_SCHOOL_KEY, normalize_school, pick_label

# masteryStats.ts's bandOfAvg thresholds — the single definition. Both
# DashboardSummaryView (via class_metrics, below) and MasteryBreakdownView
# read through bands_from_averages() so they can never drift apart.
GOOD_THRESHOLD = 4.5
MID_THRESHOLD = 3.5

# A row's mastery % is flagged "thin" (shaky, not hidden) when either too
# few students carry a grade at all, or coverage of a non-trivial roster
# is too low for the average to mean much. A row with zero graded
# students is a different state ("—" in the UI, see class_metrics) and
# is never flagged thin on top of that.
MIN_GRADED_STUDENTS = 3
THIN_COVERAGE_PCT = 50


def bands_from_averages(averages):
    """averages: one float per graded student (their own mark average,
    already computed by the caller). Pure — no query, no roster size —
    so it is unit-testable without django_db."""
    good = mid = bad = 0
    total = 0.0
    for avg in averages:
        total += avg
        if avg >= GOOD_THRESHOLD:
            good += 1
        elif avg >= MID_THRESHOLD:
            mid += 1
        else:
            bad += 1
    n = good + mid + bad
    class_avg = round(total / n, 2) if n else None
    class_pct = round(class_avg / 5 * 100) if class_avg is not None else None
    return {'good': good, 'mid': mid, 'bad': bad, 'class_avg': class_avg, 'class_pct': class_pct}


def class_metrics(averages, total_students, lesson_days, absent, possible):
    """The full metric block for one row (a class, a school, or the org),
    given already-summed inputs for that group.

    `possible` must be the SUM of each member class's own
    (active_students x lesson_days) — never (group's total students) x
    (group's total days), which cross-multiplies students against days
    from classes they were never in and inflates the denominator by
    roughly the number of classes in the group."""
    bands = bands_from_averages(averages)
    graded = bands['good'] + bands['mid'] + bands['bad']
    ungraded = total_students - graded
    coverage_pct = round(graded / total_students * 100) if total_students else None
    attendance_rate_pct = round((1 - absent / possible) * 100, 1) if possible else None

    if graded == 0:
        # No data is its own state ("—" in the UI) — it is not "thin
        # data" (a shaky-but-real average), so it must not also be
        # flagged thin.
        thin = False
    else:
        thin = graded < MIN_GRADED_STUDENTS or (
            total_students >= 5 and coverage_pct is not None and coverage_pct < THIN_COVERAGE_PCT
        )

    return {
        **bands,
        'ungraded': ungraded,
        'graded_students': graded,
        'total_students': total_students,
        'coverage_pct': coverage_pct,
        'lesson_days': lesson_days,
        'attendance_rate_pct': attendance_rate_pct,
        'thin': thin,
    }


def student_averages(class_ids, chorak):
    """[(class_id, student_id, avg_mark), ...] — one row per student with
    >=1 grade in scope.

    Anchored on student__journal_class_id, not day__journal_class_id: a
    GradeEntry's day and its student always belong to the same class
    (JournalClassViewSet.bulk_marks writes a grade only against a
    class's own roster and its own ClassDay, and the Firestore importer
    does the same), so the direct anchor is both a cheaper join (skips
    ClassDay/JournalClass entirely for the group-by) and keeps
    `graded_students + ungraded == total_students` an exact invariant —
    the day__ path could in principle count a student against a class
    they don't belong to."""
    qs = GradeEntry.objects.filter(student__journal_class_id__in=class_ids, student__active=True)
    if chorak:
        qs = qs.filter(day__chorak=chorak)
    rows = qs.values('student__journal_class_id', 'student_id').annotate(avg_mark=Avg('mark'))
    return [(r['student__journal_class_id'], r['student_id'], r['avg_mark']) for r in rows]


def active_student_counts(class_ids):
    rows = (
        Student.objects.filter(journal_class_id__in=class_ids, active=True)
        .values('journal_class_id')
        .annotate(n=Count('id'))
    )
    return {r['journal_class_id']: r['n'] for r in rows}


def lesson_day_counts(class_ids, chorak):
    qs = ClassDay.objects.filter(journal_class_id__in=class_ids)
    if chorak:
        qs = qs.filter(chorak=chorak)
    rows = qs.values('journal_class_id').annotate(n=Count('id'))
    return {r['journal_class_id']: r['n'] for r in rows}


def absence_counts(class_ids, chorak):
    """Per-class count of absence rows ('kech'/late excluded — matches
    attendance.ts's isAbsent()). Anchored on student__journal_class_id
    for the same reason as student_averages()."""
    qs = AttendanceEntry.objects.filter(
        student__journal_class_id__in=class_ids,
        student__active=True,
        status__in=[AttendanceEntry.Status.SABABLI, AttendanceEntry.Status.SABABSIZ],
    )
    if chorak:
        qs = qs.filter(day__chorak=chorak)
    rows = qs.values('student__journal_class_id').annotate(n=Count('id'))
    return {r['student__journal_class_id']: r['n'] for r in rows}


def class_map(class_ids):
    """id -> {name, school_key, school_raw, teacher_id, teacher_name}.

    school_key is BLANK_SCHOOL_KEY for a blank/whitespace-only school — a
    real, distinguishable value rather than "" or null, so it survives a
    round trip through a query string unambiguously."""
    rows = JournalClass.objects.filter(id__in=class_ids).values(
        'id', 'school', 'name', 'teacher_id', 'teacher__name', 'teacher__email',
    )
    out = {}
    for r in rows:
        raw = (r['school'] or '').strip()
        key = BLANK_SCHOOL_KEY if not raw else normalize_school(raw)
        out[r['id']] = {
            'name': r['name'],
            'school_key': key,
            'school_raw': raw,
            'teacher_id': r['teacher_id'],
            'teacher_name': r['teacher__name'] or r['teacher__email'],
        }
    return out


def school_labels(cmap):
    """school_key -> (label, variants) for every non-blank school in this
    class_map, picked from the raw spellings actually seen among them."""
    raw_by_key = defaultdict(list)
    for info in cmap.values():
        if info['school_key'] != BLANK_SCHOOL_KEY:
            raw_by_key[info['school_key']].append(info['school_raw'])
    return {key: pick_label(raws) for key, raws in raw_by_key.items()}


# ── Trend (mastery over time) ────────────────────────────────────────

def _iter_weeks(date_from, date_to):
    """Every ISO week's Monday from date_from's week to date_to's week,
    inclusive. Stepping Monday-to-Monday by exactly 7 days lands on a
    distinct ISO week every time, including across year boundaries."""
    iso_year, iso_week, _ = date_from.isocalendar()
    cur = date.fromisocalendar(iso_year, iso_week, 1)
    end_year, end_week, _ = date_to.isocalendar()
    end = date.fromisocalendar(end_year, end_week, 1)
    while cur <= end:
        yield cur
        cur += timedelta(days=7)


def _iter_months(date_from, date_to):
    y, m = date_from.year, date_from.month
    while (y, m) <= (date_to.year, date_to.month):
        yield date(y, m, 1)
        m += 1
        if m == 13:
            m, y = 1, y + 1


def _week_bucket(d):
    iso_year, iso_week, _ = d.isocalendar()
    key = f'{iso_year}-W{iso_week:02d}'
    return key, (iso_year, iso_week), {'period': 'week', 'year': iso_year, 'week': iso_week}


def _month_bucket(d):
    key = f'{d.year}-{d.month:02d}'
    return key, (d.year, d.month), {'period': 'month', 'year': d.year, 'month': d.month}


def mastery_trend(class_ids, chorak, period, total_students, date_range_ids=None):
    """Zero-filled mastery-over-time points for class_ids.

    period='quarter' always covers all four choraks and ignores the
    `chorak` filter: chorak and quarter bucket the same underlying field
    (ClassDay.chorak), so applying both would draw a single-column
    chart. Every other period respects `chorak` normally.

    A bucket with zero graded students is still emitted (graded_students:
    0, class_avg: null) rather than omitted — so the frontend can render
    a genuine gap instead of drawing a straight line across a period
    with no data, which would read as a fabricated trend.

    `date_range_ids`, when given, is used only to decide which
    week/month buckets to iterate (not which grades to aggregate).
    MasteryBreakdownView passes the caller's full authorized class_ids
    here for BOTH the primary series and its "reference" (parent)
    series, so the two always land on the identical bucket sequence —
    class_ids is always a superset of both, so its date span always
    covers theirs. Without this, a school's own history could start
    later than the org's, and the two lines would silently misalign
    position-by-position instead of matching key-by-key."""
    qs = GradeEntry.objects.filter(student__journal_class_id__in=class_ids, student__active=True)
    if period != 'quarter' and chorak:
        qs = qs.filter(day__chorak=chorak)
    rows = list(qs.values_list('student_id', 'mark', 'day__date', 'day__chorak'))

    per_bucket = defaultdict(lambda: defaultdict(list))  # key -> student_id -> [marks]
    meta_by_key = {}
    sort_by_key = {}

    if period == 'quarter':
        for q in (1, 2, 3, 4):
            key = f'q{q}'
            meta_by_key[key] = {'period': 'quarter', 'quarter': q}
            sort_by_key[key] = (q,)
        for student_id, mark, _d, day_chorak in rows:
            key = f'q{day_chorak}'
            per_bucket[key][student_id].append(mark)
    else:
        bucket_fn = _week_bucket if period == 'week' else _month_bucket
        iterator = _iter_weeks if period == 'week' else _iter_months

        if date_range_ids is not None and set(date_range_ids) != set(class_ids):
            range_qs = GradeEntry.objects.filter(student__journal_class_id__in=date_range_ids, student__active=True)
            if chorak:
                range_qs = range_qs.filter(day__chorak=chorak)
            dates = list(range_qs.values_list('day__date', flat=True))
        else:
            dates = [d for _, _, d, _ in rows]

        if dates:
            for anchor in iterator(min(dates), max(dates)):
                key, sort_key, meta = bucket_fn(anchor)
                meta_by_key[key] = meta
                sort_by_key[key] = sort_key
        for student_id, mark, d, _chorak in rows:
            key, sort_key, meta = bucket_fn(d)
            meta_by_key.setdefault(key, meta)
            sort_by_key.setdefault(key, sort_key)
            per_bucket[key][student_id].append(mark)

    points = []
    for key in sorted(meta_by_key, key=lambda k: sort_by_key[k]):
        student_marks = per_bucket.get(key, {})
        averages = [sum(marks) / len(marks) for marks in student_marks.values()]
        bands = bands_from_averages(averages)
        graded = bands['good'] + bands['mid'] + bands['bad']
        points.append({
            'key': key,
            **meta_by_key[key],
            **bands,
            'graded_students': graded,
            'total_students': total_students,
            'thin': 0 < graded < MIN_GRADED_STUDENTS,
        })
    return points
